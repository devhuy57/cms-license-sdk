"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseAuthorityHttpClient = void 0;
const ports_1 = require("./ports");
/**
 * Calls `POST {authorityUrl}/v1/licenses/verify` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx → LicenseAuthorityUnreachableError
 * so the caller falls back to cache + grace.
 */
class LicenseAuthorityHttpClient {
    constructor(authorityUrl, timeoutMs) {
        this.timeoutMs = timeoutMs;
        this.endpoint = `${authorityUrl.replace(/\/+$/, '')}/v1/licenses/verify`;
    }
    async verify(input) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    licenseKey: input.licenseKey,
                    ...(input.domain ? { domain: input.domain } : {}),
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new ports_1.LicenseAuthorityUnreachableError(`authority responded ${response.status}`);
            }
            const body = (await response.json());
            const data = body.data ?? {};
            return {
                valid: data.valid ?? false,
                reason: data.reason ?? null,
                status: data.status ?? null,
                token: data.token ?? null,
            };
        }
        catch (error) {
            if (error instanceof ports_1.LicenseAuthorityUnreachableError)
                throw error;
            throw new ports_1.LicenseAuthorityUnreachableError(error instanceof Error ? error.message : 'authority unreachable');
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.LicenseAuthorityHttpClient = LicenseAuthorityHttpClient;
