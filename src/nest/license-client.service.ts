import { Inject, Injectable, Logger } from '@nestjs/common';
import { isLicenseExpired, isWithinGrace, LicenseTokenClaims } from '../core';
import { LICENSE_CLIENT_OPTIONS, LicenseClientModuleOptions } from './constants';
import {
  LICENSE_AUTHORITY,
  LicenseAuthorityPort,
  LicenseAuthorityUnreachableError,
  TOKEN_CACHE,
  TOKEN_VERIFIER,
  TokenCachePort,
  TokenVerifierPort,
} from './ports';
import { LicenseClientReason, LicenseClientState } from './state';

const INITIAL_STATE: LicenseClientState = {
  valid: false,
  fresh: false,
  claims: null,
  reason: null,
  lastCheckedAt: null,
};

/**
 * Owns live license state. `refresh()` checks the authority online (verify sig →
 * validate claims → cache); on a network failure it falls back to the cached
 * token while within its grace window. Read helpers feed the boot gate, the
 * product's status endpoint, and (Phase B) the per-license runtime secret.
 */
@Injectable()
export class LicenseClientService {
  private readonly logger = new Logger(LicenseClientService.name);
  private state: LicenseClientState = INITIAL_STATE;

  constructor(
    @Inject(LICENSE_CLIENT_OPTIONS)
    private readonly options: LicenseClientModuleOptions,
    @Inject(LICENSE_AUTHORITY) private readonly authority: LicenseAuthorityPort,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifierPort,
    @Inject(TOKEN_CACHE) private readonly cache: TokenCachePort,
  ) {}

  getState(): LicenseClientState {
    return this.state;
  }

  isValid(): boolean {
    return this.state.valid;
  }

  hasFeature(feature: string): boolean {
    return this.state.valid && !!this.state.claims?.features.includes(feature);
  }

  /** Per-license runtime secret (Phase B). Null unless currently valid. */
  getRuntimeSecret(): string | null {
    return this.state.valid ? (this.state.claims?.secret ?? null) : null;
  }

  async refresh(): Promise<LicenseClientState> {
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);
    const domain = this.options.domain.trim() || null;

    let online;
    try {
      online = await this.authority.verify({
        licenseKey: this.options.licenseKey,
        domain,
      });
    } catch (err) {
      if (err instanceof LicenseAuthorityUnreachableError) {
        this.logger.warn(
          `License authority unreachable (${err.message}); falling back to cached token.`,
        );
        return this.applyOffline(now, nowSec);
      }
      throw err;
    }

    if (!online.token) {
      const reason: LicenseClientReason = online.valid
        ? 'no_token'
        : 'server_invalid';
      this.logger.warn(
        online.valid
          ? 'License authority returned no signed token — cannot verify authenticity.'
          : `License rejected by authority: ${online.reason ?? 'unknown'}`,
      );
      return this.set({ valid: false, fresh: true, claims: null, reason, now });
    }

    let claims: LicenseTokenClaims;
    try {
      claims = this.verifier.verify(online.token);
    } catch (err) {
      this.logger.error(
        `License token signature invalid: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.set({
        valid: false,
        fresh: true,
        claims: null,
        reason: 'bad_signature',
        now,
      });
    }

    const invalid = this.validateClaims(claims, now);
    if (invalid) {
      return this.set({ valid: false, fresh: true, claims, reason: invalid, now });
    }

    await this.cache.write(online.token);
    return this.set({ valid: true, fresh: true, claims, reason: null, now });
  }

  private async applyOffline(
    now: Date,
    nowSec: number,
  ): Promise<LicenseClientState> {
    const cached = await this.cache.read();
    if (!cached) {
      return this.set({
        valid: false,
        fresh: false,
        claims: null,
        reason: 'offline_no_cache',
        now,
      });
    }

    let claims: LicenseTokenClaims;
    try {
      claims = this.verifier.verify(cached);
    } catch {
      return this.set({
        valid: false,
        fresh: false,
        claims: null,
        reason: 'bad_signature',
        now,
      });
    }

    const invalid = this.validateClaims(claims, now);
    if (invalid) {
      return this.set({ valid: false, fresh: false, claims, reason: invalid, now });
    }

    if (!isWithinGrace(claims, nowSec)) {
      return this.set({
        valid: false,
        fresh: false,
        claims,
        reason: 'offline_grace_expired',
        now,
      });
    }

    this.logger.warn('Running on cached license (offline grace window).');
    return this.set({ valid: true, fresh: false, claims, reason: null, now });
  }

  private validateClaims(
    claims: LicenseTokenClaims,
    now: Date,
  ): LicenseClientReason | null {
    if (this.options.productId && claims.productId !== this.options.productId) {
      return 'product_mismatch';
    }
    if (!claims.features.includes(this.options.requiredFeature)) {
      return 'feature_missing';
    }
    if (isLicenseExpired(claims, now)) {
      return 'license_expired';
    }
    return null;
  }

  private set(input: {
    valid: boolean;
    fresh: boolean;
    claims: LicenseTokenClaims | null;
    reason: LicenseClientReason | null;
    now: Date;
  }): LicenseClientState {
    this.state = {
      valid: input.valid,
      fresh: input.fresh,
      claims: input.claims,
      reason: input.reason,
      lastCheckedAt: input.now.toISOString(),
    };
    return this.state;
  }
}
