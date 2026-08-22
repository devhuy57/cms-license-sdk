"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backendStatusUrlFromActivateUrl = backendStatusUrlFromActivateUrl;
exports.licenseValidFromStatusBody = licenseValidFromStatusBody;
exports.isBackendLicenseValid = isBackendLicenseValid;
exports.createLicenseMiddleware = createLicenseMiddleware;
const server_1 = require("next/server");
const edge_1 = require("../edge");
const form_1 = require("./form");
const DEFAULT_ACTIVATION_PATH = '/__license';
const DEFAULT_COOKIE = '__license_key';
function isSkippable(pathname) {
    return (pathname.startsWith('/_next') ||
        pathname.startsWith('/_vercel') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.startsWith('/static') ||
        /\.[a-z0-9]+$/i.test(pathname) // static asset with an extension
    );
}
function htmlResponse(body, status = 200) {
    return new server_1.NextResponse(body, {
        status,
        headers: { 'content-type': 'text/html; charset=utf-8' },
    });
}
/** `…/license/activate` → `…/license/status`. Exported for unit tests. */
function backendStatusUrlFromActivateUrl(activateUrl) {
    return activateUrl.replace(/\/activate\/?$/, '/status');
}
/**
 * Host APIs often wrap payloads (`{ success, data: { valid } }`). The public
 * activate controller may also return `{ success: true, valid }` so a host
 * interceptor that already-envelope-passthroughs does not nest it. Accept both.
 */
function licenseValidFromStatusBody(body) {
    if (!body || typeof body !== 'object')
        return false;
    const root = body;
    if (root.valid === true)
        return true;
    return root.data?.valid === true;
}
/**
 * Best-effort: is the product backend already licensed? Used so one activation
 * unlocks every browser (no per-machine cookie required). Fail-closed on any
 * network/parse error — the activation form still works as a fallback.
 */
async function isBackendLicenseValid(backendActivateUrl, fetchImpl = fetch) {
    const statusUrl = backendStatusUrlFromActivateUrl(backendActivateUrl);
    if (statusUrl === backendActivateUrl)
        return false;
    try {
        const res = await fetchImpl(statusUrl, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok)
            return false;
        return licenseValidFromStatusBody(await res.json());
    }
    catch {
        return false;
    }
}
/**
 * License gate + self-served activation for Next.js apps. When the license is
 * invalid the middleware RENDERS its own activation form (no page needed in the
 * app source); submitting a valid key sets an httpOnly cookie and syncs it to
 * the backend. After that sync, **any** browser unlocks via `GET /license/status`
 * — one operator activation covers the whole install. Everything lives in the
 * SDK — the app's `middleware.ts` only calls this factory.
 */
function createLicenseMiddleware(options) {
    const activationPath = options.activationPath ?? DEFAULT_ACTIVATION_PATH;
    const activateEndpoint = `${activationPath}/activate`;
    const cookieName = options.cookieName ?? DEFAULT_COOKIE;
    const form = (extra) => (0, form_1.renderActivationForm)({
        activationPath,
        title: options.title,
        supportContact: options.supportContact,
        ...extra,
    });
    return async function licenseMiddleware(request) {
        if (!options.serverUrl)
            return null;
        const { pathname, hostname } = request.nextUrl;
        const domain = options.domain ?? hostname;
        // --- Activation submit ---------------------------------------------------
        if (pathname === activateEndpoint && request.method === 'POST') {
            const data = await request.formData();
            const submitted = String(data.get('licenseKey') ?? '').trim();
            if (!submitted) {
                return htmlResponse(form({ error: 'Please enter a license key.' }));
            }
            const result = await (0, edge_1.checkLicense)({
                serverUrl: options.serverUrl,
                licenseKey: submitted,
                domain,
                publicKey: options.publicKey,
            });
            if (!result.valid) {
                return htmlResponse(form({
                    error: `License not accepted (${result.reason ?? result.status}).`,
                    value: submitted,
                }));
            }
            // Best-effort backend sync so the real enforcement point picks it up too
            // — and so other browsers unlock via GET /license/status without a cookie.
            if (options.backendActivateUrl) {
                try {
                    await fetch(options.backendActivateUrl, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ licenseKey: submitted }),
                    });
                }
                catch {
                    /* non-fatal: FE unlocks; backend can be synced/retried later */
                }
            }
            const redirect = server_1.NextResponse.redirect(new URL('/', request.url));
            redirect.cookies.set(cookieName, submitted, {
                httpOnly: true,
                sameSite: 'lax',
                secure: request.nextUrl.protocol === 'https:',
                path: '/',
                maxAge: 60 * 60 * 24 * 365,
            });
            return redirect;
        }
        // Serve the activation page on GET too (e.g. a bookmarked link).
        if (pathname === activationPath) {
            return htmlResponse(form({}));
        }
        if (isSkippable(pathname))
            return null;
        // --- Gate ----------------------------------------------------------------
        const licenseKey = request.cookies.get(cookieName)?.value ||
            options.licenseKey ||
            (typeof process !== 'undefined'
                ? process.env.NEXT_PUBLIC_LICENSE_KEY
                : undefined) ||
            '';
        // No local key: unlock if the backend was already activated by anyone.
        if (!licenseKey) {
            if (options.backendActivateUrl &&
                (await isBackendLicenseValid(options.backendActivateUrl))) {
                return null;
            }
            return htmlResponse(form({}));
        }
        const result = await (0, edge_1.checkLicense)({
            serverUrl: options.serverUrl,
            licenseKey,
            domain,
            publicKey: options.publicKey,
        });
        if (!result.valid) {
            // Stale/bogus cookie — still unlock if the install itself is licensed.
            if (options.backendActivateUrl &&
                (await isBackendLicenseValid(options.backendActivateUrl))) {
                return null;
            }
            return htmlResponse(form({
                message: `License ${result.status}${result.reason ? ` (${result.reason})` : ''}. Enter a valid license key to continue.`,
            }));
        }
        return null;
    };
}
