import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  UPDATE_CLIENT_OPTIONS,
  UpdateClientModuleOptions,
} from './update-client-constants';
import { UpdateClientReason, UpdateClientState } from './update-client-state';
import {
  INSTALLATION_AUTHORITY,
  INSTALLATION_TOKEN_STORE,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationCredentials,
  InstallationTokenStorePort,
  InstallationUnauthorizedError,
} from './update-ports';

const INITIAL_STATE: UpdateClientState = {
  checked: false,
  updateAvailable: false,
  currentVersion: null,
  latestVersion: null,
  latestReleaseId: null,
  reason: null,
  lastCheckedAt: null,
};

/**
 * Owns live update-availability state. `refresh()` ensures this process is
 * registered as an `Installation` with the CMS (once, cached to disk), then
 * asks whether a newer release is available. Unlike `LicenseClientService`,
 * a failed check has nothing to enforce — on an unreachable authority or a
 * rejected token it keeps the last known good numbers and only flips
 * `reason`, so a transient blip never flashes "no update" at the admin.
 */
@Injectable()
export class UpdateClientService {
  private readonly logger = new Logger(UpdateClientService.name);
  private state: UpdateClientState = INITIAL_STATE;
  private inflight: Promise<UpdateClientState> | null = null;

  constructor(
    @Inject(UPDATE_CLIENT_OPTIONS)
    private readonly options: UpdateClientModuleOptions,
    @Inject(INSTALLATION_AUTHORITY)
    private readonly authority: InstallationAuthorityPort,
    @Inject(INSTALLATION_TOKEN_STORE)
    private readonly store: InstallationTokenStorePort,
  ) {}

  getState(): UpdateClientState {
    return this.state;
  }

  /**
   * Re-check with the CMS. Concurrent callers share one in-flight check. Pass
   * `maxAgeMs` to reuse the last result when it is still fresh (an admin
   * status endpoint should use this so every dashboard load does not hammer
   * the CMS).
   */
  async refresh(opts?: { maxAgeMs?: number }): Promise<UpdateClientState> {
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

  private async doRefresh(): Promise<UpdateClientState> {
    const now = new Date();
    if (!this.options.licenseKey.trim()) {
      return this.fail('no_license_key', now);
    }

    try {
      const credentials = await this.ensureRegistered();
      return await this.checkUpdates(credentials, now);
    } catch (err) {
      if (err instanceof InstallationUnauthorizedError) {
        // Stored credentials were rejected (e.g. installation revoked) —
        // drop them and register fresh, once.
        await this.store.clear();
        try {
          const credentials = await this.ensureRegistered();
          return await this.checkUpdates(credentials, now);
        } catch (retryErr) {
          this.logger.warn(
            `Update check failed after re-registering: ${
              retryErr instanceof Error ? retryErr.message : String(retryErr)
            }`,
          );
          return this.fail('unauthorized', now);
        }
      }
      if (err instanceof InstallationAuthorityUnreachableError) {
        this.logger.warn(`Update authority unreachable: ${err.message}`);
        return this.fail('authority_unreachable', now);
      }
      throw err;
    }
  }

  private async checkUpdates(
    credentials: InstallationCredentials,
    now: Date,
  ): Promise<UpdateClientState> {
    const result = await this.authority.getUpdates(
      credentials.installationId,
      credentials.installationToken,
    );
    this.state = {
      checked: true,
      updateAvailable: result.updateAvailable,
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      latestReleaseId: result.latestReleaseId,
      reason: null,
      lastCheckedAt: now.toISOString(),
    };
    return this.state;
  }

  private async ensureRegistered(): Promise<InstallationCredentials> {
    const existing = await this.store.read();
    if (existing) return existing;

    const registered = await this.authority.register({
      licenseKey: this.options.licenseKey,
      environment: this.options.environment,
      hostname: this.options.hostname,
      label: this.options.label,
      currentVersion: this.options.currentVersion,
    });
    const credentials: InstallationCredentials = {
      installationId: registered.installationId,
      installationToken: registered.installationToken,
    };
    await this.store.write(credentials);
    return credentials;
  }

  /** A failed check keeps the previous good `updateAvailable`/version numbers, only updating `reason`/`lastCheckedAt`. */
  private fail(reason: UpdateClientReason, now: Date): UpdateClientState {
    this.state = {
      ...this.state,
      reason,
      lastCheckedAt: now.toISOString(),
    };
    return this.state;
  }
}
