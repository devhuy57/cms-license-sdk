import { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LicenseClientModuleOptions } from './constants';
import { LicenseClientService } from './license-client.service';
/**
 * Enforcement point. Checks the license at boot; when `enforce` is true an
 * invalid result throws and aborts startup (Nest never calls `listen`). Then
 * re-checks on an interval. The timer is `unref()`ed and cleared on shutdown.
 */
export declare class LicenseGate implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly options;
    private readonly licenses;
    private readonly logger;
    private timer;
    constructor(options: LicenseClientModuleOptions, licenses: LicenseClientService);
    onApplicationBootstrap(): Promise<void>;
    onModuleDestroy(): void;
    private scheduleRecheck;
}
