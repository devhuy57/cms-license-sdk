import { NextRequest, NextResponse } from 'next/server';
export interface LicenseMiddlewareOptions {
    /** License server base URL, e.g. https://api-cms.example.com */
    serverUrl: string;
    /** Build-time fallback key; overridden by the activation cookie at runtime. */
    licenseKey?: string;
    /** Domain to verify against; defaults to the request hostname. */
    domain?: string;
    /** Ed25519 public key (SPKI PEM/base64); falls back to env in the SDK. */
    publicKey?: string;
    /** Base path the middleware owns for activation. Default `/__license`. */
    activationPath?: string;
    /**
     * If set, an accepted key is POSTed here so the backend can sync + enforce.
     * Also used to derive `GET …/status` so browsers without a cookie unlock
     * once any operator has activated the install.
     */
    backendActivateUrl?: string;
    /** Cookie that stores the runtime-entered key. Default `__license_key`. */
    cookieName?: string;
    /** Branding for the served form. */
    title?: string;
    supportContact?: string;
}
/** `…/license/activate` → `…/license/status`. Exported for unit tests. */
export declare function backendStatusUrlFromActivateUrl(activateUrl: string): string;
/**
 * Best-effort: is the product backend already licensed? Used so one activation
 * unlocks every browser (no per-machine cookie required). Fail-closed on any
 * network/parse error — the activation form still works as a fallback.
 */
export declare function isBackendLicenseValid(backendActivateUrl: string, fetchImpl?: typeof fetch): Promise<boolean>;
/**
 * License gate + self-served activation for Next.js apps. When the license is
 * invalid the middleware RENDERS its own activation form (no page needed in the
 * app source); submitting a valid key sets an httpOnly cookie and syncs it to
 * the backend. After that sync, **any** browser unlocks via `GET /license/status`
 * — one operator activation covers the whole install. Everything lives in the
 * SDK — the app's `middleware.ts` only calls this factory.
 */
export declare function createLicenseMiddleware(options: LicenseMiddlewareOptions): (request: NextRequest) => Promise<NextResponse | null>;
