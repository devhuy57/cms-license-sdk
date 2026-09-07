import { AvailableUpdateResult, InstallationAuthorityPort, RegisterInstallationResult } from './update-ports';
/**
 * Calls `POST {authorityUrl}/v1/installations/register` and
 * `GET {authorityUrl}/v1/installations/:id/updates` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx (other than 401) →
 * `InstallationAuthorityUnreachableError`; a 401 on `getUpdates` →
 * `InstallationUnauthorizedError`, which the caller uses to trigger
 * re-registration.
 */
export declare class UpdateAuthorityHttpClient implements InstallationAuthorityPort {
    private readonly timeoutMs;
    private readonly base;
    constructor(authorityUrl: string, timeoutMs: number);
    register(input: {
        licenseKey: string;
        environment: string;
        hostname?: string;
        label?: string;
        currentVersion?: string;
    }): Promise<RegisterInstallationResult>;
    getUpdates(installationId: string, installationToken: string): Promise<AvailableUpdateResult>;
    private fetchWithTimeout;
}
