import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientState } from './update-client-state';
import { DownloadComponentOptions, DownloadedComponentFile, InstallationAuthorityPort, InstallationTokenStorePort, InstalledVersionProviderPort, LicenseKeySourcePort, ReportStepInput, StartUpdateResult, UpdateStepName } from './update-ports';
/**
 * Owns live update state and every call to the CMS's installation API.
 *
 * Unlike `LicenseClientService`, a failed check has nothing to enforce — on
 * an unreachable authority or a rejected token it keeps the last known good
 * numbers and only flips `reason`, so a transient blip never flashes "no
 * update" at the admin.
 */
export declare class UpdateClientService {
    private readonly options;
    private readonly authority;
    private readonly store;
    private readonly keys;
    private readonly installedVersion?;
    private readonly logger;
    private state;
    private inflight;
    /**
     * Serialises registration. Without it the heartbeat timer and a running
     * update job can register concurrently and overwrite each other's token,
     * leaving one of them holding a credential the CMS has already replaced.
     */
    private registering;
    private readonly retry;
    constructor(options: UpdateClientModuleOptions, authority: InstallationAuthorityPort, store: InstallationTokenStorePort, keys: LicenseKeySourcePort, installedVersion?: InstalledVersionProviderPort | undefined);
    getState(): UpdateClientState;
    /** The registered installation id, or null before the first registration. */
    getInstallationId(): Promise<string | null>;
    /**
     * Re-check with the CMS. Concurrent callers share one in-flight check. Pass
     * `maxAgeMs` to reuse the last result when it is still fresh (an admin
     * status endpoint should use this so every dashboard load does not hammer
     * the CMS).
     */
    refresh(opts?: {
        maxAgeMs?: number;
    }): Promise<UpdateClientState>;
    /** Report liveness and the versions this installation runs. */
    heartbeat(): Promise<void>;
    /**
     * Begin an update to `releaseId`. Not retried: it is not idempotent, and a
     * retry whose first attempt actually succeeded is indistinguishable from a
     * genuine "already in progress" conflict.
     */
    startUpdate(releaseId: string): Promise<StartUpdateResult>;
    /**
     * Record one pipeline transition. Retried hardest of all the calls: losing
     * a step corrupts the vendor's only view of what happened, and a lost
     * `completed` leaves the job looking stuck forever.
     */
    reportStep(jobId: string, input: ReportStepInput): Promise<{
        status: UpdateStepName;
    }>;
    /** Close an unfinished job so it stops blocking future updates. */
    abandonJob(jobId: string, reason: string): Promise<void>;
    /**
     * Fetch one component's artifact to disk. Retried, with a fresh partial
     * file each attempt — this is the only call long enough that an ordinary
     * network blip would otherwise lose a whole update.
     */
    downloadComponent(releaseId: string, component: string, options: DownloadComponentOptions): Promise<DownloadedComponentFile>;
    private doRefresh;
    /**
     * Runs `fn` with current credentials, recovering once from a rejected
     * token. Applied to every authenticated call, not just the update check:
     * an installation that is revoked and re-issued mid-job would otherwise
     * fail every subsequent step report.
     */
    private withAuth;
    private ensureRegistered;
    private register;
    /** A failed check keeps the previous good `updateAvailable`/version numbers, only updating `reason`/`lastCheckedAt`. */
    private fail;
}
