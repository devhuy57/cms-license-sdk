/** Result of registering (or re-registering) as an installation with the CMS. */
export interface RegisterInstallationResult {
    installationId: string;
    installationToken: string;
}
/** Raw "is a newer release available" result (response envelope already unwrapped). */
export interface AvailableUpdateResult {
    updateAvailable: boolean;
    currentVersion: string | null;
    latestVersion: string | null;
    latestReleaseId: string | null;
    /**
     * Why nothing is on offer. `updates_expired` is the one worth surfacing to
     * an operator: the site is fine, the update entitlement lapsed.
     */
    reason: string | null;
    /** Update entitlement cut-off; null = unlimited. */
    updatesUntil: string | null;
}
/** What this installation reports it is running. */
export interface HeartbeatInput {
    currentVersion?: string;
    componentVersions?: Record<string, string>;
    metadata?: Record<string, unknown>;
}
/** One deployable part of a release, as `start` describes it. */
export interface ReleaseComponentSnapshot {
    component: string;
    componentVersion: string;
    migrationRequired: boolean;
}
/** The target release of an update job, plus the signed manifest for it. */
export interface StartUpdateResult {
    jobId: string;
    status: string;
    fromReleaseId: string | null;
    toReleaseId: string;
    version: string;
    releaseNotes: string | null;
    components: ReleaseComponentSnapshot[];
    /**
     * Signed inventory of the release. Null means this CMS has no signing key —
     * which a client should treat as a refusal, not a pass, since an attacker
     * impersonating the CMS would also answer null.
     */
    manifestToken: string | null;
}
/** Pipeline vocabulary, mirroring `update_jobs.status` on the CMS. */
export type UpdateStepName = 'pending' | 'downloading' | 'verifying' | 'backing_up' | 'installing' | 'migrating' | 'building' | 'health_check' | 'switching' | 'restarting' | 'completed' | 'failed' | 'rolled_back';
export type UpdateStepOutcome = 'started' | 'succeeded' | 'failed';
export interface ReportStepInput {
    step: UpdateStepName;
    outcome: UpdateStepOutcome;
    detail?: Record<string, unknown>;
    errorMessage?: string;
}
/** A component artifact streamed to disk, with the digest computed en route. */
export interface DownloadedComponentFile {
    component: string;
    /** Absolute path of the completed file. */
    filePath: string;
    fileName: string;
    sizeBytes: number;
    /** Lowercase hex SHA-256, computed while streaming. */
    sha256: string;
    contentType: string | null;
}
export interface DownloadComponentOptions {
    /** Directory to write into; created if missing. */
    destDir: string;
    /**
     * IDLE timeout — reset on every chunk, not a budget for the whole transfer.
     * A total timeout would abort every real download of a large artifact.
     */
    idleTimeoutMs?: number;
    onProgress?: (received: number, total: number | null) => void;
    /** Caller's cancellation (e.g. the job was abandoned). */
    signal?: AbortSignal;
}
/**
 * Talks to the CMS's machine-facing installation API under
 * `{authorityUrl}/v1/installations`. Separate from `LicenseAuthorityPort` —
 * license verification and update delivery are independent CMS features with
 * independent credentials (a signed license token vs. an opaque installation
 * token).
 */
export interface InstallationAuthorityPort {
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
    /** Gives up on an unfinished job so it stops blocking future attempts. */
    abandonJob(installationId: string, installationToken: string, jobId: string, reason: string): Promise<void>;
    /**
     * Streams one component's source artifact to disk. Never buffers: a large
     * component tarball would otherwise sit resident in a small container.
     * Does NOT verify the digest — verification is a reported pipeline step and
     * belongs to the caller.
     */
    downloadComponent(installationId: string, installationToken: string, releaseId: string, component: string, options: DownloadComponentOptions): Promise<DownloadedComponentFile>;
}
export declare const INSTALLATION_AUTHORITY: unique symbol;
export declare class InstallationAuthorityUnreachableError extends Error {
    constructor(message: string);
}
/** Raised when the CMS rejects the stored installation token (invalid/revoked). */
export declare class InstallationUnauthorizedError extends Error {
    constructor(message: string);
}
/**
 * The CMS refused on policy grounds — a lapsed update entitlement, a
 * suspended license, a hostname outside the allowlist. Distinct from
 * `Unauthorized` because re-registering will not help, and distinct from
 * `Unreachable` because it is an answer, not a failure to get one.
 */
export declare class InstallationForbiddenError extends Error {
    readonly code: string | null;
    constructor(message: string, code?: string | null);
}
/** The CMS has no such installation/job/release. */
export declare class InstallationNotFoundError extends Error {
    constructor(message: string);
}
/**
 * The CMS refused because of state: an update already in progress, a release
 * that is not published, a job that already finished, an upgrade that skips
 * a required intermediate release.
 */
export declare class UpdateConflictError extends Error {
    readonly code: string | null;
    constructor(message: string, code?: string | null);
}
export interface InstallationCredentials {
    installationId: string;
    installationToken: string;
}
/** Persists the credentials minted by `register`, so a restart doesn't re-register. */
export interface InstallationTokenStorePort {
    read(): Promise<InstallationCredentials | null>;
    write(credentials: InstallationCredentials): Promise<void>;
    /** Drop stored credentials after the CMS rejects the token (forces re-register). */
    clear(): Promise<void>;
}
export declare const INSTALLATION_TOKEN_STORE: unique symbol;
/**
 * Where the update client gets the license key to register with.
 *
 * A port rather than a plain option because production ships `LICENSE_KEY`
 * empty: the real key is entered by the customer at runtime and lands in the
 * license client's key store. Reading it through a port keeps the two modules
 * independent — the updater registers `UpdateClientModule` alone, and pulling
 * in `LicenseClientModule` just to read one file would drag along a
 * boot-blocking gate, a second recheck timer and a second verifier racing the
 * API over the same cache file.
 */
export interface LicenseKeySourcePort {
    read(): Promise<string | null>;
}
export declare const LICENSE_KEY_SOURCE: unique symbol;
/**
 * What this installation is currently running, fed into every heartbeat.
 * Supplied by the host, which is the only thing that knows where its own
 * version lives (a VERSION file, a state file written by an updater, ...).
 */
export interface InstalledVersionProviderPort {
    read(): Promise<HeartbeatInput>;
}
export declare const INSTALLED_VERSION_PROVIDER: unique symbol;
