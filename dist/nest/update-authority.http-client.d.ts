import { AvailableUpdateResult, DownloadComponentOptions, DownloadedComponentFile, HeartbeatInput, InstallationAuthorityPort, RegisterInstallationResult, ReportStepInput, StartUpdateResult, UpdateStepName } from './update-ports';
/**
 * The CMS's machine-facing installation API over native fetch.
 *
 * Every response goes through one `mapStatus`, so callers get a typed error
 * they can act on rather than a single "unreachable" that hides whether the
 * license lapsed, the token was revoked, or the network is down.
 */
export declare class UpdateAuthorityHttpClient implements InstallationAuthorityPort {
    private readonly timeoutMs;
    private readonly defaultIdleTimeoutMs;
    private readonly base;
    constructor(authorityUrl: string, timeoutMs: number, defaultIdleTimeoutMs?: number);
    register(input: {
        licenseKey: string;
        environment: string;
        hostname?: string;
        label?: string;
        currentVersion?: string;
        metadata?: Record<string, unknown>;
    }): Promise<RegisterInstallationResult>;
    getUpdates(installationId: string, installationToken: string): Promise<AvailableUpdateResult>;
    heartbeat(installationId: string, installationToken: string, input: HeartbeatInput): Promise<void>;
    rotateToken(installationId: string, installationToken: string): Promise<RegisterInstallationResult>;
    startUpdate(installationId: string, installationToken: string, releaseId: string): Promise<StartUpdateResult>;
    reportStep(installationId: string, installationToken: string, jobId: string, input: ReportStepInput): Promise<{
        status: UpdateStepName;
    }>;
    abandonJob(installationId: string, installationToken: string, jobId: string, reason: string): Promise<void>;
    downloadComponent(installationId: string, installationToken: string, releaseId: string, component: string, options: DownloadComponentOptions): Promise<DownloadedComponentFile>;
    /** One request → unwrapped `data`, with every status mapped to a typed error. */
    private json;
    private fetchWithTimeout;
}
