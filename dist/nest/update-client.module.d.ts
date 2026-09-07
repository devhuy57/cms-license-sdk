import { DynamicModule } from '@nestjs/common';
import { UpdateClientModuleOptions } from './update-client-constants';
/**
 * Reusable update-availability client: registers this process as an
 * `Installation` with the CMS and exposes `UpdateClientService` for checking
 * whether a newer release exists. Independent of `LicenseClientModule` — a
 * host app registers both if it wants license enforcement AND update
 * checking. Global so the service is injectable anywhere. Bring your own
 * status controller (auth is app-specific), mirroring how
 * `LicenseClientModule` leaves status/activation to the host except for its
 * own optional public endpoint.
 */
export declare class UpdateClientModule {
    static forRoot(options: UpdateClientModuleOptions): DynamicModule;
}
