import { LicenseClientService } from './license-client.service';
/**
 * PUBLIC activation endpoint (`POST /license/activate`). Accepts a license key,
 * verifies it against the authority, and — only if valid — persists it as the
 * active key and adopts it (no restart needed). Public because the key itself is
 * the credential; it cannot grant validity a forged key wouldn't already have.
 * Mounted only when `enableActivationEndpoint` is set. Rate-limit it upstream.
 *
 * Uses `@Body('licenseKey')` (not a DTO class) so it needs no class-validator
 * dependency and isn't stripped by a host `whitelist` ValidationPipe.
 */
export declare class LicenseActivateController {
    private readonly licenses;
    constructor(licenses: LicenseClientService);
    activate(licenseKey: string): Promise<{
        valid: boolean;
        fresh: boolean;
        reason: string | null;
    }>;
}
