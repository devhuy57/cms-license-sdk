import { LicenseTokenClaims } from '../core';
export type LicenseClientReason = 'no_token' | 'bad_signature' | 'product_mismatch' | 'feature_missing' | 'license_expired' | 'license_inactive' | 'server_invalid' | 'offline_no_cache' | 'offline_grace_expired';
export interface LicenseClientState {
    valid: boolean;
    /** true = confirmed online this run; false = running on cached grace. */
    fresh: boolean;
    claims: LicenseTokenClaims | null;
    reason: LicenseClientReason | null;
    lastCheckedAt: string | null;
}
