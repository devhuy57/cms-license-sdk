import { LicenseTokenClaims } from '../core';

/** Verifies an Ed25519-signed token and returns claims; throws on bad sig. */
export interface TokenVerifierPort {
  verify(token: string): LicenseTokenClaims;
}
export const TOKEN_VERIFIER = Symbol('LICENSE_CLIENT_TOKEN_VERIFIER');

/** Raw authority verify result (response envelope already unwrapped). */
export interface AuthorityVerifyResult {
  valid: boolean;
  reason: string | null;
  status: string | null;
  token: string | null;
}

export interface LicenseAuthorityPort {
  verify(input: {
    licenseKey: string;
    domain: string | null;
  }): Promise<AuthorityVerifyResult>;
}
export const LICENSE_AUTHORITY = Symbol('LICENSE_CLIENT_AUTHORITY');

export class LicenseAuthorityUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseAuthorityUnreachableError';
  }
}

/** Persists the last valid token for offline grace. */
export interface TokenCachePort {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  /** Drop the cached token after the authority explicitly rejects the key. */
  clear(): Promise<void>;
}
export const TOKEN_CACHE = Symbol('LICENSE_CLIENT_TOKEN_CACHE');
