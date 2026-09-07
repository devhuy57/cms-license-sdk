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
}
/**
 * Talks to the CMS's machine-facing installation API
 * (`POST /v1/installations/register`, `GET /v1/installations/:id/updates`).
 * Separate from `LicenseAuthorityPort` — license verification and
 * update-checking are independent CMS features with independent credentials
 * (a signed license token vs. an opaque installation token).
 */
export interface InstallationAuthorityPort {
    register(input: {
        licenseKey: string;
        environment: string;
        hostname?: string;
        label?: string;
        currentVersion?: string;
    }): Promise<RegisterInstallationResult>;
    getUpdates(installationId: string, installationToken: string): Promise<AvailableUpdateResult>;
}
export declare const INSTALLATION_AUTHORITY: unique symbol;
export declare class InstallationAuthorityUnreachableError extends Error {
    constructor(message: string);
}
/** Raised when the CMS rejects the stored installation token (invalid/revoked). */
export declare class InstallationUnauthorizedError extends Error {
    constructor(message: string);
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
