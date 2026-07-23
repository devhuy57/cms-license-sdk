/**
 * Shared license-token contract + Node crypto. Used by the license SERVER (to
 * sign) and by Node BACKENDS (to verify). A token is
 * `base64url(claimsJSON).base64url(ed25519Signature)`; the signature is over the
 * payload segment bytes. The raw license key never travels in the token — only
 * its SHA-256 (`sub`).
 */
export declare const LICENSE_TOKEN_VERSION: 1;
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
export declare const hashLicenseKey: (key: string) => string;
export declare const deriveRuntimeSecret: (salt: string, key: string) => string;
export interface BuildClaimsInput {
    key: string;
    productId: string;
    planId?: string | null;
    status: string;
    boundIp?: string | null;
    boundDomain?: string | null;
    licenseExpiresAt?: string | null;
    issuedAt: Date;
    tokenTtlSeconds: number;
    graceSeconds: number;
    features: string[];
    secretSalt: string;
}
export declare function buildLicenseTokenClaims(input: BuildClaimsInput): LicenseTokenClaims;
/** Decode the base64url payload segment (no signature check). */
export declare function decodeLicenseTokenPayload(token: string): LicenseTokenClaims;
export declare const isTokenFresh: (claims: LicenseTokenClaims, nowSec: number) => boolean;
export declare const isWithinGrace: (claims: LicenseTokenClaims, nowSec: number) => boolean;
export declare const isLicenseExpired: (claims: LicenseTokenClaims, now: Date) => boolean;
/**
 * Ed25519 signer (license server). Construct with the PRIVATE key PEM (pkcs8);
 * `sign()` returns a `payload.signature` token. Throws if the key is not Ed25519.
 */
export declare class Ed25519LicenseSigner {
    private readonly key;
    /** Falls back to `process.env.LICENSE_PRIVATE_KEY_PEM` when omitted. */
    constructor(privateKeyPem?: string);
    sign(claims: LicenseTokenClaims): string;
}
/**
 * Ed25519 verifier for Node backends. Construct with the PUBLIC key (SPKI PEM or
 * base64 of it). `verify()` returns the claims or throws on malformed/bad-sig.
 */
export declare class Ed25519LicenseVerifier {
    private readonly key;
    /** Falls back to `process.env.LICENSE_PUBLIC_KEY` when omitted. */
    constructor(publicKeyPem?: string);
    verify(token: string): LicenseTokenClaims;
}
/** Accept a full PEM or base64-of-PEM (env-var friendly). */
export declare function normalizePem(value: string): string;
