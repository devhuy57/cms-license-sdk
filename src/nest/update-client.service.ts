import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DEFAULT_RETRY_POLICY, withRetry, type RetryPolicy } from './http-retry';
import {
  UPDATE_CLIENT_OPTIONS,
  UpdateClientModuleOptions,
} from './update-client-constants';
import { UpdateClientReason, UpdateClientState } from './update-client-state';
import {
  DownloadComponentOptions,
  DownloadedComponentFile,
  INSTALLATION_AUTHORITY,
  INSTALLATION_TOKEN_STORE,
  INSTALLED_VERSION_PROVIDER,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationCredentials,
  InstallationForbiddenError,
  InstallationTokenStorePort,
  InstallationUnauthorizedError,
  InstalledVersionProviderPort,
  LICENSE_KEY_SOURCE,
  LicenseKeySourcePort,
  ReportStepInput,
  StartUpdateResult,
  UpdateStepName,
} from './update-ports';

const INITIAL_STATE: UpdateClientState = {
  checked: false,
  updateAvailable: false,
  currentVersion: null,
  latestVersion: null,
  latestReleaseId: null,
  reason: null,
  updatesUntil: null,
  lastCheckedAt: null,
};

/**
 * Owns live update state and every call to the CMS's installation API.
 *
 * Unlike `LicenseClientService`, a failed check has nothing to enforce — on
 * an unreachable authority or a rejected token it keeps the last known good
 * numbers and only flips `reason`, so a transient blip never flashes "no
 * update" at the admin.
 */
@Injectable()
export class UpdateClientService {
  private readonly logger = new Logger(UpdateClientService.name);
  private state: UpdateClientState = INITIAL_STATE;
  private inflight: Promise<UpdateClientState> | null = null;
  /**
   * Serialises registration. Without it the heartbeat timer and a running
   * update job can register concurrently and overwrite each other's token,
   * leaving one of them holding a credential the CMS has already replaced.
   */
  private registering: Promise<InstallationCredentials> | null = null;
  private readonly retry: RetryPolicy;

  constructor(
    @Inject(UPDATE_CLIENT_OPTIONS)
    private readonly options: UpdateClientModuleOptions,
    @Inject(INSTALLATION_AUTHORITY)
    private readonly authority: InstallationAuthorityPort,
    @Inject(INSTALLATION_TOKEN_STORE)
    private readonly store: InstallationTokenStorePort,
    @Inject(LICENSE_KEY_SOURCE)
    private readonly keys: LicenseKeySourcePort,
    @Optional()
    @Inject(INSTALLED_VERSION_PROVIDER)
    private readonly installedVersion?: InstalledVersionProviderPort,
  ) {
    this.retry = { ...DEFAULT_RETRY_POLICY, ...(options.retry ?? {}) };
  }

  getState(): UpdateClientState {
    return this.state;
  }

  /** The registered installation id, or null before the first registration. */
  async getInstallationId(): Promise<string | null> {
    return (await this.store.read())?.installationId ?? null;
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

  /** Report liveness and the versions this installation runs. */
  async heartbeat(): Promise<void> {
    const reported = (await this.installedVersion?.read()) ?? {
      currentVersion: this.options.currentVersion,
    };
    // Deliberately not retried: the next beat *is* the retry, and stacking
    // attempts on a timer only deepens a backlog against a struggling CMS.
    await this.withAuth((c) =>
      this.authority.heartbeat(c.installationId, c.installationToken, reported),
    );
  }

  /**
   * Begin an update to `releaseId`. Not retried: it is not idempotent, and a
   * retry whose first attempt actually succeeded is indistinguishable from a
   * genuine "already in progress" conflict.
   */
  async startUpdate(releaseId: string): Promise<StartUpdateResult> {
    return this.withAuth((c) =>
      this.authority.startUpdate(c.installationId, c.installationToken, releaseId),
    );
  }

  /**
   * Record one pipeline transition. Retried hardest of all the calls: losing
   * a step corrupts the vendor's only view of what happened, and a lost
   * `completed` leaves the job looking stuck forever.
   */
  async reportStep(
    jobId: string,
    input: ReportStepInput,
  ): Promise<{ status: UpdateStepName }> {
    return withRetry(
      () =>
        this.withAuth((c) =>
          this.authority.reportStep(
            c.installationId,
            c.installationToken,
            jobId,
            input,
          ),
        ),
      { ...this.retry, attempts: 5, maxDelayMs: 30_000 },
      isRetryable,
    );
  }

  /** Close an unfinished job so it stops blocking future updates. */
  async abandonJob(jobId: string, reason: string): Promise<void> {
    await this.withAuth((c) =>
      this.authority.abandonJob(
        c.installationId,
        c.installationToken,
        jobId,
        reason,
      ),
    );
  }

  /**
   * Fetch one component's artifact to disk. Retried, with a fresh partial
   * file each attempt — this is the only call long enough that an ordinary
   * network blip would otherwise lose a whole update.
   */
  async downloadComponent(
    releaseId: string,
    component: string,
    options: DownloadComponentOptions,
  ): Promise<DownloadedComponentFile> {
    return withRetry(
      () =>
        this.withAuth((c) =>
          this.authority.downloadComponent(
            c.installationId,
            c.installationToken,
            releaseId,
            component,
            options,
          ),
        ),
      this.retry,
      isRetryable,
    );
  }

  private async doRefresh(): Promise<UpdateClientState> {
    const now = new Date();
    if (!(await this.keys.read())) {
      // A freshly delivered install has no key until the customer activates.
      // Not a failure to latch onto — the next beat retries.
      return this.fail('no_license_key', now);
    }

    try {
      const result = await withRetry(
        () =>
          this.withAuth((c) =>
            this.authority.getUpdates(c.installationId, c.installationToken),
          ),
        this.retry,
        isRetryable,
      );
      this.state = {
        checked: true,
        updateAvailable: result.updateAvailable,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        latestReleaseId: result.latestReleaseId,
        reason: null,
        updatesUntil: result.updatesUntil,
        lastCheckedAt: now.toISOString(),
      };
      return this.state;
    } catch (err) {
      if (err instanceof InstallationForbiddenError) {
        this.logger.warn(`Update check refused: ${err.message}`);
        return this.fail('forbidden', now);
      }
      if (err instanceof InstallationUnauthorizedError) {
        this.logger.warn(`Installation token rejected: ${err.message}`);
        return this.fail('unauthorized', now);
      }
      if (err instanceof InstallationAuthorityUnreachableError) {
        this.logger.warn(`Update authority unreachable: ${err.message}`);
        return this.fail('authority_unreachable', now);
      }
      // `refresh()` is driven by a timer and by the admin's status endpoint.
      // Neither has anywhere to put an exception, and an updater that crashes
      // on a bad CMS response is worse than one reporting a stale number — so
      // this is total by design. Logged at error level because reaching here
      // means something unmodelled happened.
      this.logger.error(
        `Unexpected error during update check: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.fail('authority_unreachable', now);
    }
  }

  /**
   * Runs `fn` with current credentials, recovering once from a rejected
   * token. Applied to every authenticated call, not just the update check:
   * an installation that is revoked and re-issued mid-job would otherwise
   * fail every subsequent step report.
   */
  private async withAuth<T>(
    fn: (credentials: InstallationCredentials) => Promise<T>,
  ): Promise<T> {
    const credentials = await this.ensureRegistered();
    try {
      return await fn(credentials);
    } catch (error) {
      if (!(error instanceof InstallationUnauthorizedError)) throw error;
      // Stored credentials were rejected (revoked, rotated elsewhere) — drop
      // them and register fresh, exactly once. A second 401 propagates.
      await this.store.clear();
      try {
        const fresh = await this.ensureRegistered();
        return await fn(fresh);
      } catch (retryError) {
        // Whatever the second attempt hit, the actionable state is the same:
        // we could not re-establish this installation's identity. Reporting
        // the inner error would send an operator chasing a network blip when
        // the license was revoked.
        throw new InstallationUnauthorizedError(
          `installation token rejected and re-registration failed: ${
            retryError instanceof Error ? retryError.message : String(retryError)
          }`,
        );
      }
    }
  }

  private async ensureRegistered(): Promise<InstallationCredentials> {
    const existing = await this.store.read();
    if (existing) return existing;
    if (this.registering) return this.registering;

    this.registering = this.register().finally(() => {
      this.registering = null;
    });
    return this.registering;
  }

  private async register(): Promise<InstallationCredentials> {
    const licenseKey = await this.keys.read();
    if (!licenseKey) {
      throw new InstallationAuthorityUnreachableError(
        'no license key available: activate this installation first',
      );
    }

    const reported = await this.installedVersion?.read();
    const registered = await withRetry(
      () =>
        this.authority.register({
          licenseKey,
          environment: this.options.environment,
          hostname: this.options.hostname,
          label: this.options.label,
          currentVersion: reported?.currentVersion ?? this.options.currentVersion,
        }),
      this.retry,
      isRetryable,
    );

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

/**
 * Only a failure to get an answer is worth retrying. A 401/403/404/409 IS an
 * answer: retrying it wastes time and, for the non-idempotent calls, risks
 * acting twice on a response that was merely lost.
 */
function isRetryable(error: unknown): boolean {
  return error instanceof InstallationAuthorityUnreachableError;
}
