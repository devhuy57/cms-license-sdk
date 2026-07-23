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
/**
 * Verify the token's Ed25519 signature with `publicKey`; return decoded claims
 * or null when malformed / the signature does not match.
 */
export declare function verifyLicenseToken(token: string, publicKey: string): Promise<LicenseTokenClaims | null>;
/**
 * Call the license server's `POST /v1/licenses/verify` and, when a public key
 * is configured AND the server returned a signed token, trust the Ed25519
 * signature (a forged server / tampered response cannot pass). Falls back to the
 * server's plain `valid` flag when no token is present (rollout-safe).
 */
export declare function checkLicense(params: {
    serverUrl: string;
    licenseKey: string;
    domain: string;
    publicKey?: string;
}): Promise<LicenseCheckResult>;
