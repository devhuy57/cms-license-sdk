"use strict";
// Edge/browser-safe license verification using the Web Crypto API
// (crypto.subtle) + global fetch. NO node:crypto, NO framework — usable from
// Next.js middleware, other edge runtimes, or the browser. Each frontend writes
// its own ~15-line middleware around `checkLicense`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseToken = verifyLicenseToken;
exports.checkLicense = checkLicense;
function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function base64UrlToBytes(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return base64ToBytes(b64 + pad);
}
/** Accept a full SPKI PEM or the bare base64 body. */
function spkiFromPublicKey(publicKey) {
    const body = publicKey.includes('BEGIN')
        ? publicKey
            .replace(/-----BEGIN[^-]+-----/, '')
            .replace(/-----END[^-]+-----/, '')
            .replace(/\s+/g, '')
        : publicKey.replace(/\s+/g, '');
    return base64ToBytes(body);
}
let cachedKey = null;
let cachedFor = '';
async function importKey(publicKey) {
    if (cachedKey && cachedFor === publicKey)
        return cachedKey;
    const spki = spkiFromPublicKey(publicKey);
    const key = await crypto.subtle.importKey('spki', spki.buffer, { name: 'Ed25519' }, false, ['verify']);
    cachedKey = key;
    cachedFor = publicKey;
    return key;
}
/**
 * Verify the token's Ed25519 signature with `publicKey`; return decoded claims
 * or null when malformed / the signature does not match.
 */
async function verifyLicenseToken(token, publicKey) {
    const [payload, sig] = token.split('.');
    if (!payload || !sig)
        return null;
    try {
        const key = await importKey(publicKey);
        const signatureBytes = base64UrlToBytes(sig);
        const payloadBytes = new TextEncoder().encode(payload);
        const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes.buffer, payloadBytes.buffer);
        if (!ok)
            return null;
        return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    }
    catch {
        return null;
    }
}
/**
 * Call the license server's `POST /v1/licenses/verify` and, when a public key
 * is configured AND the server returned a signed token, trust the Ed25519
 * signature (a forged server / tampered response cannot pass). Falls back to the
 * server's plain `valid` flag when no token is present (rollout-safe).
 */
async function checkLicense(params) {
    try {
        const res = await fetch(`${params.serverUrl}/v1/licenses/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                licenseKey: params.licenseKey,
                domain: params.domain,
            }),
        });
        if (!res.ok)
            return { valid: false, status: 'error', reason: 'server_error' };
        const json = await res.json();
        const data = json?.data ?? {};
        const token = data.token ?? undefined;
        if (params.publicKey && token) {
            const claims = await verifyLicenseToken(token, params.publicKey);
            if (!claims)
                return { valid: false, status: 'error', reason: 'bad_signature' };
            if (claims.licenseExpiresAt &&
                Date.parse(claims.licenseExpiresAt) <= Date.now()) {
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
    }
    catch {
        return { valid: false, status: 'error', reason: 'network_error' };
    }
}
