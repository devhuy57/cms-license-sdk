import { LicenseTokenClaims } from '../core';
import { TokenVerifierPort } from './ports';
/** Adapter over the core Node verifier. Accepts SPKI PEM or base64-of-PEM. */
export declare class Ed25519TokenVerifier implements TokenVerifierPort {
    private readonly verifier;
    constructor(publicKeyPem: string);
    verify(token: string): LicenseTokenClaims;
}
