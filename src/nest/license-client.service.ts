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
import { KEY_STORE, KeyStorePort } from './key-store';
import { LicenseClientReason, LicenseClientState } from './state';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Clients configure a stable product slug (`nguonvia`); the license server
 * historically signed the catalog UUID. Treat that pairing as a match so a
 * valid key still activates while older tokens are in circulation.
 */
export function productIdMatches(
  configured: string,
  claimed: string,
): boolean {
  const expected = configured.trim();
  if (!expected) return true;
  if (claimed === expected) return true;
  return UUID_RE.test(claimed) && !UUID_RE.test(expected);
}

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
  private inflight: Promise<LicenseClientState> | null = null;

  constructor(
    @Inject(LICENSE_CLIENT_OPTIONS)
    private readonly options: LicenseClientModuleOptions,
    @Inject(LICENSE_AUTHORITY) private readonly authority: LicenseAuthorityPort,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifierPort,
    @Inject(TOKEN_CACHE) private readonly cache: TokenCachePort,
    @Inject(KEY_STORE) private readonly keyStore: KeyStorePort,
  ) {}

  /** The active key: a runtime-activated key (if any) overrides the config. */
  private async activeKey(): Promise<string> {
    return (await this.keyStore.read()) || this.options.licenseKey;
  }

  /**
   * Apply a new key at runtime: verify it online, and only if valid persist it
   * (so it survives restarts and overrides the configured key), cache its token,
   * and adopt it as current state. Returns the resulting state.
   */
  async activate(licenseKey: string): Promise<LicenseClientState> {
    const key = licenseKey.trim();
    if (!key) {
      return this.set({
        valid: false,
        fresh: true,
        claims: null,
        reason: 'server_invalid',
        now: new Date(),
      });
    }
    let state: LicenseClientState;
    try {
      state = await this.verifyOnline(key, new Date());
    } catch (err) {
      if (err instanceof LicenseAuthorityUnreachableError) {
        this.logger.warn(
          `Activation failed — authority unreachable (${err.message}).`,
        );
        return this.set({
          valid: false,
          fresh: true,
          claims: null,
          reason: 'server_invalid',
          now: new Date(),
        });
      }
      throw err;
    }
    if (state.valid) await this.keyStore.write(key);
    return state;
  }

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

  /**
   * Re-verify with the authority. Concurrent callers share one in-flight check.
   * Pass `maxAgeMs` to reuse the last result when it is still fresh (status
   * endpoint uses this so every admin page does not hammer the CMS).
   */
  async refresh(opts?: { maxAgeMs?: number }): Promise<LicenseClientState> {
    const maxAgeMs = opts?.maxAgeMs;
    if (
      maxAgeMs != null &&
      maxAgeMs > 0 &&
      this.state.lastCheckedAt &&
      Date.now() - Date.parse(this.state.lastCheckedAt) < maxAgeMs
    ) {
      return this.state;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doRefresh(): Promise<LicenseClientState> {
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);
    const key = await this.activeKey();
    try {
      return await this.verifyOnline(key, now);
    } catch (err) {
      if (err instanceof LicenseAuthorityUnreachableError) {
        this.logger.warn(
          `License authority unreachable (${err.message}); falling back to cached token.`,
        );
        return this.applyOffline(now, nowSec);
      }
      throw err;
    }
  }

  /**
   * Online verification for `licenseKey`: authority → signature → claims → cache.
   * Throws {@link LicenseAuthorityUnreachableError} when the authority can't be
   * reached (caller decides whether to fall back to cache).
   */
  private async verifyOnline(
    licenseKey: string,
    now: Date,
  ): Promise<LicenseClientState> {
    const domain = this.options.domain.trim() || null;
    const online = await this.authority.verify({ licenseKey, domain });

    if (!online.token) {
      const reason: LicenseClientReason = online.valid
        ? 'no_token'
        : 'server_invalid';
      this.logger.warn(
        online.valid
          ? 'License authority returned no signed token — cannot verify authenticity.'
          : `License rejected by authority: ${online.reason ?? 'unknown'}`,
      );
      // Authority spoke: drop the last-good token so offline grace cannot
      // keep a revoked/suspended/expired key alive.
      await this.cache.clear();
      return this.set({ valid: false, fresh: true, claims: null, reason, now });
    }

    let claims: LicenseTokenClaims;
    try {
      claims = this.verifier.verify(online.token);
    } catch (err) {
      this.logger.error(
        `License token signature invalid: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.cache.clear();
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
      await this.cache.clear();
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
    // Token signature is authoritative. `productId` on the token is
    // informational — catalog UUID vs install slug must not block activate.
    if (claims.status !== 'active') {
      return 'license_inactive';
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
