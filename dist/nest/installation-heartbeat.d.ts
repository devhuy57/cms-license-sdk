import { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientService } from './update-client.service';
/**
 * Tells the CMS this installation is alive and which versions it runs, on a
 * timer, and refreshes the update check on the same beat.
 *
 * Structurally a sibling of `LicenseGate` with two deliberate differences.
 * It never blocks boot: there is nothing to enforce here, and a CMS outage
 * must not stop a customer's own updater from serving its status endpoint.
 * And it fails quietly — a missed beat costs the vendor a stale row in an
 * admin list, not the customer a working site.
 *
 * Interval defaults well below the license client's, because this is what
 * makes the vendor's "who is running what" view worth looking at, and what
 * decides how soon a customer is offered a new release.
 */
export declare class InstallationHeartbeat implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly options;
    private readonly updates?;
    private readonly logger;
    private timer;
    constructor(options: UpdateClientModuleOptions, updates?: UpdateClientService | undefined);
    onApplicationBootstrap(): Promise<void>;
    onModuleDestroy(): void;
    private beat;
}
