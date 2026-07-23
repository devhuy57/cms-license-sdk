import { AuthorityVerifyResult, LicenseAuthorityPort } from './ports';
/**
 * Calls `POST {authorityUrl}/v1/licenses/verify` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx → LicenseAuthorityUnreachableError
 * so the caller falls back to cache + grace.
 */
export declare class LicenseAuthorityHttpClient implements LicenseAuthorityPort {
    private readonly timeoutMs;
    private readonly endpoint;
    constructor(authorityUrl: string, timeoutMs: number);
    verify(input: {
        licenseKey: string;
        domain: string | null;
    }): Promise<AuthorityVerifyResult>;
}
