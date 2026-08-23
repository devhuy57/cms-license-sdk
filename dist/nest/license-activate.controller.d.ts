import { LicenseClientService } from './license-client.service';
export type PublicLicenseSnapshot = {
    /**
     * Marks this payload as already-enveloped so a host `ResponseInterceptor`
     * that pass-throughs `{ success: boolean }` does not wrap `valid` under
     * `data` (which would hide it from the Next.js gate).
     */
    success: true;
    valid: boolean;
    fresh: boolean;
    reason: string | null;
};
export declare class LicenseActivateController {
    private readonly licenses;
    constructor(licenses: LicenseClientService);
    status(): Promise<PublicLicenseSnapshot>;
    activate(licenseKey: string): Promise<PublicLicenseSnapshot>;
}
