import { NextRequest, NextResponse } from 'next/server';
import { checkLicense } from '../edge';
import { renderActivationForm } from './form';

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

const DEFAULT_ACTIVATION_PATH = '/__license';
const DEFAULT_COOKIE = '__license_key';

function isSkippable(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static') ||
    /\.[a-z0-9]+$/i.test(pathname) // static asset with an extension
  );
}

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * License gate + self-served activation for Next.js apps. When the license is
 * invalid the middleware RENDERS its own activation form (no page needed in the
 * app source); submitting a valid key sets an httpOnly cookie (and optionally
 * syncs it to the backend), after which the app unlocks. Everything lives in the
 * SDK — the app's `middleware.ts` only calls this factory.
 */
export function createLicenseMiddleware(options: LicenseMiddlewareOptions) {
  const activationPath = options.activationPath ?? DEFAULT_ACTIVATION_PATH;
  const activateEndpoint = `${activationPath}/activate`;
  const cookieName = options.cookieName ?? DEFAULT_COOKIE;

  const form = (extra: { message?: string; error?: string; value?: string }) =>
    renderActivationForm({
      activationPath,
      title: options.title,
      supportContact: options.supportContact,
      ...extra,
    });

  return async function licenseMiddleware(
    request: NextRequest,
  ): Promise<NextResponse | null> {
    if (!options.serverUrl) return null;

    const { pathname, hostname } = request.nextUrl;
    const domain = options.domain ?? hostname;

    // --- Activation submit ---------------------------------------------------
    if (pathname === activateEndpoint && request.method === 'POST') {
      const data = await request.formData();
      const submitted = String(data.get('licenseKey') ?? '').trim();
      if (!submitted) {
        return htmlResponse(form({ error: 'Please enter a license key.' }));
      }

      const result = await checkLicense({
        serverUrl: options.serverUrl,
        licenseKey: submitted,
        domain,
        publicKey: options.publicKey,
      });

      if (!result.valid) {
        return htmlResponse(
          form({
            error: `License not accepted (${result.reason ?? result.status}).`,
            value: submitted,
          }),
        );
      }

      // Best-effort backend sync so the real enforcement point picks it up too.
      if (options.backendActivateUrl) {
        try {
          await fetch(options.backendActivateUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ licenseKey: submitted }),
          });
        } catch {
          /* non-fatal: FE unlocks; backend can be synced/retried later */
        }
      }

      const redirect = NextResponse.redirect(new URL('/', request.url));
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

    if (isSkippable(pathname)) return null;

    // --- Gate ----------------------------------------------------------------
    const licenseKey =
      request.cookies.get(cookieName)?.value ||
      options.licenseKey ||
      (typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_LICENSE_KEY
        : undefined) ||
      '';

    if (!licenseKey) {
      return htmlResponse(form({}));
    }

    const result = await checkLicense({
      serverUrl: options.serverUrl,
      licenseKey,
      domain,
      publicKey: options.publicKey,
    });

    if (!result.valid) {
      return htmlResponse(
        form({
          message: `License ${result.status}${
            result.reason ? ` (${result.reason})` : ''
          }. Enter a valid license key to continue.`,
        }),
      );
    }

    return null;
  };
}
