import { Ed25519LicenseVerifier, LicenseTokenClaims } from '../core';
import { TokenVerifierPort } from './ports';

/** Adapter over the core Node verifier. Accepts SPKI PEM or base64-of-PEM. */
export class Ed25519TokenVerifier implements TokenVerifierPort {
  private readonly verifier: Ed25519LicenseVerifier;

  constructor(publicKeyPem: string) {
    this.verifier = new Ed25519LicenseVerifier(publicKeyPem);
  }

  verify(token: string): LicenseTokenClaims {
    return this.verifier.verify(token);
  }
}
