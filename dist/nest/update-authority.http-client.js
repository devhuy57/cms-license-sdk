"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateAuthorityHttpClient = void 0;
const update_ports_1 = require("./update-ports");
const INSTALLATION_TOKEN_HEADER = 'x-installation-token';
/**
 * Calls `POST {authorityUrl}/v1/installations/register` and
 * `GET {authorityUrl}/v1/installations/:id/updates` via native fetch with an
 * AbortController timeout. Network/timeout/non-2xx (other than 401) →
 * `InstallationAuthorityUnreachableError`; a 401 on `getUpdates` →
 * `InstallationUnauthorizedError`, which the caller uses to trigger
 * re-registration.
 */
class UpdateAuthorityHttpClient {
    constructor(authorityUrl, timeoutMs) {
        this.timeoutMs = timeoutMs;
        this.base = `${authorityUrl.replace(/\/+$/, '')}/v1/installations`;
    }
    async register(input) {
        const response = await this.fetchWithTimeout(`${this.base}/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new update_ports_1.InstallationAuthorityUnreachableError(`installation register responded ${response.status}`);
        }
        const body = (await response.json());
        const installationId = body.data?.installation?.id;
        const installationToken = body.data?.installationToken;
        if (!installationId || !installationToken) {
            throw new update_ports_1.InstallationAuthorityUnreachableError('installation register returned no installation id/token');
        }
        return { installationId, installationToken };
    }
    async getUpdates(installationId, installationToken) {
        const response = await this.fetchWithTimeout(`${this.base}/${installationId}/updates`, {
            method: 'GET',
            headers: { [INSTALLATION_TOKEN_HEADER]: installationToken },
        });
        if (response.status === 401) {
            throw new update_ports_1.InstallationUnauthorizedError('installation token rejected by the CMS');
        }
        if (!response.ok) {
            throw new update_ports_1.InstallationAuthorityUnreachableError(`installation updates check responded ${response.status}`);
        }
        const body = (await response.json());
        const data = body.data ?? {};
        return {
            updateAvailable: data.updateAvailable ?? false,
            currentVersion: data.currentVersion ?? null,
            latestVersion: data.latestRelease?.version ?? null,
            latestReleaseId: data.latestRelease?.id ?? null,
        };
    }
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        catch (error) {
            throw new update_ports_1.InstallationAuthorityUnreachableError(error instanceof Error ? error.message : 'installation authority unreachable');
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.UpdateAuthorityHttpClient = UpdateAuthorityHttpClient;
