import { NextRequest, NextResponse } from 'next/server';
export interface LicenseMiddlewareOptions {
    /** License server base URL, e.g. https://api-cms.huy.lat */
    serverUrl: string;
    /** Build-time fallback key; overridden by the activation cookie at runtime. */
    licenseKey?: string;
    /** Domain to verify against; defaults to the request hostname. */
    domain?: string;
    /** Ed25519 public key (SPKI PEM/base64); falls back to env in the SDK. */
    publicKey?: string;
    /** Base path the middleware owns for activation. Default `/__license`. */
    activationPath?: string;
    /** If set, the accepted key is POSTed here so the backend can sync + enforce. */
    backendActivateUrl?: string;
    /** Cookie that stores the runtime-entered key. Default `__license_key`. */
    cookieName?: string;
    /** Branding for the served form. */
    title?: string;
    supportContact?: string;
}
/**
 * License gate + self-served activation for Next.js apps. When the license is
 * invalid the middleware RENDERS its own activation form (no page needed in the
 * app source); submitting a valid key sets an httpOnly cookie (and optionally
 * syncs it to the backend), after which the app unlocks. Everything lives in the
 * SDK — the app's `middleware.ts` only calls this factory.
 */
export declare function createLicenseMiddleware(options: LicenseMiddlewareOptions): (request: NextRequest) => Promise<NextResponse | null>;
