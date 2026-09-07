import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientState } from './update-client-state';
import { InstallationAuthorityPort, InstallationTokenStorePort } from './update-ports';
/**
 * Owns live update-availability state. `refresh()` ensures this process is
 * registered as an `Installation` with the CMS (once, cached to disk), then
 * asks whether a newer release is available. Unlike `LicenseClientService`,
 * a failed check has nothing to enforce — on an unreachable authority or a
 * rejected token it keeps the last known good numbers and only flips
 * `reason`, so a transient blip never flashes "no update" at the admin.
 */
export declare class UpdateClientService {
    private readonly options;
    private readonly authority;
    private readonly store;
    private readonly logger;
    private state;
    private inflight;
    constructor(options: UpdateClientModuleOptions, authority: InstallationAuthorityPort, store: InstallationTokenStorePort);
    getState(): UpdateClientState;
    /**
     * Re-check with the CMS. Concurrent callers share one in-flight check. Pass
     * `maxAgeMs` to reuse the last result when it is still fresh (an admin
     * status endpoint should use this so every dashboard load does not hammer
     * the CMS).
     */
    refresh(opts?: {
        maxAgeMs?: number;
    }): Promise<UpdateClientState>;
    private doRefresh;
    private checkUpdates;
    private ensureRegistered;
    /** A failed check keeps the previous good `updateAvailable`/version numbers, only updating `reason`/`lastCheckedAt`. */
    private fail;
}
