// Edge/browser-safe license verification using the Web Crypto API
// (crypto.subtle) + global fetch. NO node:crypto, NO framework — usable from
// Next.js middleware, other edge runtimes, or the browser. Each frontend writes
// its own ~15-line middleware around `checkLicense`.

export interface LicenseTokenClaims {
  v: number;
  sub: string;
  productId: string;
  planId: string | null;
  status: string;
  boundIp: string | null;
  boundDomain: string | null;
  licenseExpiresAt: string | null;
  iat: number;
  exp: number;
  graceUntil: number;
  features: string[];
  secret: string;
}

export interface LicenseCheckResult {
  valid: boolean;
  status: 'active' | 'inactive' | 'suspended' | 'expired' | 'error';
  expiresAt?: string;
  reason?: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return base64ToBytes(b64 + pad);
}

/**
 * Extract the SPKI DER bytes from any of: a full SPKI PEM, base64 of the whole
 * PEM (what `keygen --base64` emits), or the bare base64 DER body.
 */
function spkiFromPublicKey(publicKey: string): Uint8Array {
  let s = publicKey.trim();
  if (!s.includes('BEGIN')) {
    // Could be base64-of-PEM — decode once and see if a PEM surfaces.
    try {
      const decoded = atob(s.replace(/\s+/g, ''));
      if (decoded.includes('BEGIN')) s = decoded;
    } catch {
      /* not base64 — fall through */
    }
  }
  const body = s.includes('BEGIN')
    ? s
        .replace(/-----BEGIN[^-]+-----/, '')
        .replace(/-----END[^-]+-----/, '')
        .replace(/\s+/g, '')
    : s.replace(/\s+/g, '');
  return base64ToBytes(body);
}

/**
 * Resolve the public key: explicit arg wins, else the build-time
 * `NEXT_PUBLIC_LICENSE_PUBLIC_KEY` (inlined by Next for browser/edge; set it as
 * an OS/CI env var at build — no `.env` file required). Returns '' if unset.
 */
function resolvePublicKey(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit;
  try {
    return (
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.NEXT_PUBLIC_LICENSE_PUBLIC_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

let cachedKey: CryptoKey | null = null;
let cachedFor = '';

async function importKey(publicKey: string): Promise<CryptoKey> {
  if (cachedKey && cachedFor === publicKey) return cachedKey;
  const spki = spkiFromPublicKey(publicKey);
  const key = await crypto.subtle.importKey(
    'spki',
    spki.buffer as ArrayBuffer,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  cachedKey = key;
  cachedFor = publicKey;
  return key;
}

/**
 * Verify the token's Ed25519 signature with `publicKey`; return decoded claims
 * or null when malformed / the signature does not match.
 */
export async function verifyLicenseToken(
  token: string,
  publicKey?: string,
): Promise<LicenseTokenClaims | null> {
  const resolvedKey = resolvePublicKey(publicKey);
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !resolvedKey) return null;
  try {
    const key = await importKey(resolvedKey);
    const signatureBytes = base64UrlToBytes(sig);
    const payloadBytes = new TextEncoder().encode(payload);
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signatureBytes.buffer as ArrayBuffer,
      payloadBytes.buffer as ArrayBuffer,
    );
    if (!ok) return null;
    return JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payload)),
    ) as LicenseTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Call the license server's `POST /v1/licenses/verify` and, when a public key
 * is configured AND the server returned a signed token, trust the Ed25519
 * signature (a forged server / tampered response cannot pass). Falls back to the
 * server's plain `valid` flag when no token is present (rollout-safe).
 */
export async function checkLicense(params: {
  serverUrl: string;
  licenseKey: string;
  domain: string;
  publicKey?: string;
}): Promise<LicenseCheckResult> {
  try {
    const res = await fetch(`${params.serverUrl}/v1/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: params.licenseKey,
        domain: params.domain,
      }),
    });
    if (!res.ok) return { valid: false, status: 'error', reason: 'server_error' };

    const json = await res.json();
    const data = json?.data ?? {};
    const token: string | undefined = data.token ?? undefined;
    const publicKey = resolvePublicKey(params.publicKey);

    if (publicKey && token) {
      const claims = await verifyLicenseToken(token, publicKey);
      if (!claims) return { valid: false, status: 'error', reason: 'bad_signature' };
      if (
        claims.licenseExpiresAt &&
        Date.parse(claims.licenseExpiresAt) <= Date.now()
      ) {
        return { valid: false, status: 'expired', reason: 'expired' };
      }
      const active = claims.status === 'active';
      return {
        valid: active,
        status: active ? 'active' : 'suspended',
        expiresAt: claims.licenseExpiresAt ?? undefined,
      };
    }

    return {
      valid: data.valid ?? false,
      status: data.status ?? 'inactive',
      expiresAt: data.expiresAt,
      reason: data.reason,
    };
  } catch {
    return { valid: false, status: 'error', reason: 'network_error' };
  }
}
