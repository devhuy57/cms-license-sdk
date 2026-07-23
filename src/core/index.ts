import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

/**
 * Shared license-token contract + Node crypto. Used by the license SERVER (to
 * sign) and by Node BACKENDS (to verify). A token is
 * `base64url(claimsJSON).base64url(ed25519Signature)`; the signature is over the
 * payload segment bytes. The raw license key never travels in the token — only
 * its SHA-256 (`sub`).
 */
export const LICENSE_TOKEN_VERSION = 1 as const;

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

export const hashLicenseKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export const deriveRuntimeSecret = (salt: string, key: string): string =>
  createHmac('sha256', salt).update(key).digest('base64url');

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

export function buildLicenseTokenClaims(
  input: BuildClaimsInput,
): LicenseTokenClaims {
  const iat = Math.floor(input.issuedAt.getTime() / 1000);
  return {
    v: LICENSE_TOKEN_VERSION,
    sub: hashLicenseKey(input.key),
    productId: input.productId,
    planId: input.planId ?? null,
    status: input.status,
    boundIp: input.boundIp ?? null,
    boundDomain: input.boundDomain ?? null,
    licenseExpiresAt: input.licenseExpiresAt ?? null,
    iat,
    exp: iat + input.tokenTtlSeconds,
    graceUntil: iat + input.graceSeconds,
    features: input.features,
    secret: deriveRuntimeSecret(input.secretSalt, input.key),
  };
}

/** Decode the base64url payload segment (no signature check). */
export function decodeLicenseTokenPayload(token: string): LicenseTokenClaims {
  const payload = token.split('.')[0];
  if (!payload) throw new Error('malformed token');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as LicenseTokenClaims;
}

export const isTokenFresh = (claims: LicenseTokenClaims, nowSec: number) =>
  nowSec < claims.exp;

export const isWithinGrace = (claims: LicenseTokenClaims, nowSec: number) =>
  nowSec < claims.graceUntil;

export const isLicenseExpired = (claims: LicenseTokenClaims, now: Date) =>
  claims.licenseExpiresAt !== null &&
  new Date(claims.licenseExpiresAt).getTime() <= now.getTime();

/**
 * Ed25519 signer (license server). Construct with the PRIVATE key PEM (pkcs8);
 * `sign()` returns a `payload.signature` token. Throws if the key is not Ed25519.
 */
export class Ed25519LicenseSigner {
  private readonly key: KeyObject;

  constructor(privateKeyPem: string) {
    const pem = privateKeyPem?.trim();
    if (!pem) throw new Error('license-core: privateKeyPem is required');
    this.key = createPrivateKey(pem);
    if (this.key.asymmetricKeyType !== 'ed25519') {
      throw new Error('license-core: privateKeyPem must be an Ed25519 key');
    }
  }

  sign(claims: LicenseTokenClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString(
      'base64url',
    );
    const sig = cryptoSign(null, Buffer.from(payload), this.key);
    return `${payload}.${sig.toString('base64url')}`;
  }
}

/**
 * Ed25519 verifier for Node backends. Construct with the PUBLIC key (SPKI PEM or
 * base64 of it). `verify()` returns the claims or throws on malformed/bad-sig.
 */
export class Ed25519LicenseVerifier {
  private readonly key: KeyObject;

  constructor(publicKeyPem: string) {
    const pem = normalizePem(publicKeyPem);
    if (!pem) throw new Error('license-core: publicKeyPem is required');
    this.key = createPublicKey(pem);
    if (this.key.asymmetricKeyType !== 'ed25519') {
      throw new Error('license-core: publicKeyPem must be an Ed25519 key');
    }
  }

  verify(token: string): LicenseTokenClaims {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) throw new Error('malformed token');
    const ok = cryptoVerify(
      null,
      Buffer.from(payload),
      this.key,
      Buffer.from(sig, 'base64url'),
    );
    if (!ok) throw new Error('signature verification failed');
    return decodeLicenseTokenPayload(token);
  }
}

/** Accept a full PEM or base64-of-PEM (env-var friendly). */
export function normalizePem(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (trimmed.includes('-----BEGIN')) return trimmed;
  try {
    return Buffer.from(trimmed, 'base64').toString('utf8');
  } catch {
    return trimmed;
  }
}
