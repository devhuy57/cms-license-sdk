import { DynamicModule } from '@nestjs/common';
import { LicenseClientModuleOptions } from './constants';
/**
 * Reusable license enforcement client. Verifies the signed license with the
 * authority, gates boot when `enforce`, re-checks on a heartbeat, and exposes
 * `LicenseClientService`. Global so the service (and Phase B runtime secret) is
 * injectable anywhere. Bring your own status controller (auth is app-specific).
 */
export declare class LicenseClientModule {
    static forRoot(options: LicenseClientModuleOptions): DynamicModule;
}
