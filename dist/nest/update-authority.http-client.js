"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateAuthorityHttpClient = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:stream/promises");
const update_ports_1 = require("./update-ports");
const INSTALLATION_TOKEN_HEADER = 'x-installation-token';
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
/** Component names become path segments; keep them boring. */
const SAFE_COMPONENT = /^[a-z0-9][a-z0-9-]{0,31}$/;
/**
 * The CMS's machine-facing installation API over native fetch.
 *
 * Every response goes through one `mapStatus`, so callers get a typed error
 * they can act on rather than a single "unreachable" that hides whether the
 * license lapsed, the token was revoked, or the network is down.
 */
class UpdateAuthorityHttpClient {
    constructor(authorityUrl, timeoutMs, defaultIdleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
        this.timeoutMs = timeoutMs;
        this.defaultIdleTimeoutMs = defaultIdleTimeoutMs;
        this.base = `${authorityUrl.replace(/\/+$/, '')}/v1/installations`;
    }
    async register(input) {
        const body = await this.json(`${this.base}/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        });
        const installationId = body?.installation?.id;
        const installationToken = body?.installationToken;
        if (!installationId || !installationToken) {
            throw new update_ports_1.InstallationAuthorityUnreachableError('installation register returned no installation id/token');
        }
        return { installationId, installationToken };
    }
    async getUpdates(installationId, installationToken) {
        const data = await this.json(`${this.base}/${installationId}/updates`, { method: 'GET' }, installationToken);
        return {
            updateAvailable: data?.updateAvailable ?? false,
            currentVersion: data?.currentVersion ?? null,
            latestVersion: data?.latestRelease?.version ?? null,
            latestReleaseId: data?.latestRelease?.id ?? null,
            reason: data?.reason ?? null,
            updatesUntil: data?.updatesUntil ?? null,
        };
    }
    async heartbeat(installationId, installationToken, input) {
        await this.json(`${this.base}/${installationId}/heartbeat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        }, installationToken);
    }
    async rotateToken(installationId, installationToken) {
        const body = await this.json(`${this.base}/${installationId}/rotate-token`, { method: 'POST' }, installationToken);
        const id = body?.installation?.id;
        const token = body?.installationToken;
        if (!id || !token) {
            throw new update_ports_1.InstallationAuthorityUnreachableError('rotate-token returned no installation id/token');
        }
        return { installationId: id, installationToken: token };
    }
    async startUpdate(installationId, installationToken, releaseId) {
        const data = await this.json(`${this.base}/${installationId}/updates/${releaseId}/start`, { method: 'POST' }, installationToken);
        const jobId = data?.job?.id;
        if (!jobId) {
            throw new update_ports_1.InstallationAuthorityUnreachableError('start update returned no job id');
        }
        const components = (data?.release?.components ?? [])
            .filter((c) => Boolean(c.component))
            .map((c) => ({
            component: c.component,
            componentVersion: c.componentVersion ?? '',
            migrationRequired: c.migrationRequired ?? false,
        }));
        return {
            jobId,
            status: data?.job?.status ?? 'pending',
            fromReleaseId: data?.job?.fromReleaseId ?? null,
            toReleaseId: data?.job?.toReleaseId ?? releaseId,
            version: data?.release?.version ?? '',
            releaseNotes: data?.release?.releaseNotes ?? null,
            components,
            manifestToken: data?.manifestToken ?? null,
        };
    }
    async reportStep(installationId, installationToken, jobId, input) {
        const data = await this.json(`${this.base}/${installationId}/updates/${jobId}/report`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        }, installationToken);
        return { status: data?.status ?? input.step };
    }
    async abandonJob(installationId, installationToken, jobId, reason) {
        await this.json(`${this.base}/${installationId}/updates/${jobId}/abandon`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason }),
        }, installationToken);
    }
    async downloadComponent(installationId, installationToken, releaseId, component, options) {
        // The name comes from a server response and ends up in a filesystem path.
        if (!SAFE_COMPONENT.test(component)) {
            throw new update_ports_1.InstallationAuthorityUnreachableError(`refusing to download component with unsafe name: ${component}`);
        }
        const destDir = (0, node_path_1.isAbsolute)(options.destDir)
            ? options.destDir
            : (0, node_path_1.resolve)(process.cwd(), options.destDir);
        await node_fs_1.promises.mkdir(destDir, { recursive: true });
        // Written under a dot-prefixed partial name and renamed on success, so a
        // half-written file can never be mistaken for a verified artifact.
        const partPath = (0, node_path_1.join)(destDir, `.${component}.part`);
        const idleMs = options.idleTimeoutMs ?? this.defaultIdleTimeoutMs;
        const controller = new AbortController();
        const abortOnCallerSignal = () => controller.abort();
        options.signal?.addEventListener('abort', abortOnCallerSignal, {
            once: true,
        });
        // An IDLE timer, refreshed per chunk. A single deadline covering the whole
        // transfer would abort every real download of a large artifact.
        let idleTimer;
        const armIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => controller.abort(), idleMs);
            idleTimer.unref?.();
        };
        try {
            armIdle();
            const response = await fetch(`${this.base}/${installationId}/updates/${releaseId}/components/${encodeURIComponent(component)}/download`, {
                method: 'GET',
                headers: { [INSTALLATION_TOKEN_HEADER]: installationToken },
                signal: controller.signal,
            });
            mapStatus(response.status, await peekErrorBody(response), 'download');
            if (!response.body) {
                throw new update_ports_1.InstallationAuthorityUnreachableError('artifact download returned an empty body');
            }
            const total = numberOrNull(response.headers.get('content-length'));
            const hash = (0, node_crypto_1.createHash)('sha256');
            let received = 0;
            const source = node_stream_1.Readable.fromWeb(response.body);
            source.on('data', (chunk) => {
                hash.update(chunk);
                received += chunk.length;
                armIdle();
                options.onProgress?.(received, total);
            });
            await (0, promises_1.pipeline)(source, (0, node_fs_1.createWriteStream)(partPath, { mode: 0o600 }));
            const fileName = fileNameFromDisposition(response.headers.get('content-disposition')) ??
                `${component}.tar.gz`;
            const filePath = (0, node_path_1.join)(destDir, `${component}-${safeName(fileName)}`);
            await node_fs_1.promises.rename(partPath, filePath);
            return {
                component,
                filePath,
                fileName,
                sizeBytes: received,
                sha256: hash.digest('hex'),
                contentType: response.headers.get('content-type'),
            };
        }
        catch (error) {
            await node_fs_1.promises.rm(partPath, { force: true }).catch(() => undefined);
            throw wrapFetchError(error);
        }
        finally {
            clearTimeout(idleTimer);
            options.signal?.removeEventListener('abort', abortOnCallerSignal);
        }
    }
    /** One request → unwrapped `data`, with every status mapped to a typed error. */
    async json(url, init, installationToken) {
        const headers = {
            ...init.headers,
        };
        if (installationToken) {
            headers[INSTALLATION_TOKEN_HEADER] = installationToken;
        }
        const response = await this.fetchWithTimeout(url, { ...init, headers });
        const body = await readJsonBody(response);
        mapStatus(response.status, body, url);
        return body?.data;
    }
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        catch (error) {
            throw wrapFetchError(error);
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.UpdateAuthorityHttpClient = UpdateAuthorityHttpClient;
/**
 * Maps an HTTP status to the error the caller can actually act on. The
 * distinction matters: a 401 means re-register, a 403 means tell the operator
 * to renew, a 409 means the job is already running, and only the rest are
 * worth retrying.
 */
function mapStatus(status, body, context) {
    if (status >= 200 && status < 300)
        return;
    const message = messageFrom(body) ?? `${context} responded ${status}`;
    const code = codeFrom(body);
    if (status === 401)
        throw new update_ports_1.InstallationUnauthorizedError(message);
    if (status === 403)
        throw new update_ports_1.InstallationForbiddenError(message, code);
    if (status === 404)
        throw new update_ports_1.InstallationNotFoundError(message);
    if (status === 409)
        throw new update_ports_1.UpdateConflictError(message, code);
    throw new update_ports_1.InstallationAuthorityUnreachableError(message);
}
function wrapFetchError(error) {
    if (error instanceof update_ports_1.InstallationAuthorityUnreachableError ||
        error instanceof update_ports_1.InstallationUnauthorizedError ||
        error instanceof update_ports_1.InstallationForbiddenError ||
        error instanceof update_ports_1.InstallationNotFoundError ||
        error instanceof update_ports_1.UpdateConflictError) {
        return error;
    }
    return new update_ports_1.InstallationAuthorityUnreachableError(error instanceof Error ? error.message : 'installation authority unreachable');
}
async function readJsonBody(response) {
    try {
        return await response.json();
    }
    catch {
        return undefined;
    }
}
/** Read an error body without consuming the stream we may still want. */
async function peekErrorBody(response) {
    if (response.ok)
        return undefined;
    return readJsonBody(response);
}
function messageFrom(body) {
    if (!body || typeof body !== 'object')
        return null;
    const record = body;
    const error = record.error;
    const message = error?.message ?? record.message;
    return typeof message === 'string' && message.length > 0 ? message : null;
}
function codeFrom(body) {
    if (!body || typeof body !== 'object')
        return null;
    const record = body;
    const error = record.error;
    const code = error?.code ?? record.code;
    return typeof code === 'string' && code.length > 0 ? code : null;
}
function numberOrNull(value) {
    if (!value)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function fileNameFromDisposition(header) {
    if (!header)
        return null;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1]);
        }
        catch {
            /* fall through to the plain form */
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain?.[1] ?? null;
}
/** Strip anything that could steer the write out of `destDir`. */
function safeName(fileName) {
    return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}
