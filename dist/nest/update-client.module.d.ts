import { DynamicModule } from '@nestjs/common';
import { UpdateClientModuleOptions } from './update-client-constants';
/**
 * Update client: registers this process as an `Installation` with the CMS,
 * reports what it runs, and carries out an update job's transport —
 * download, verify, and step reporting.
 *
 * Independent of `LicenseClientModule` on purpose. A host that only applies
 * updates (a dedicated updater process) registers this alone and does not
 * inherit a boot-blocking license gate, a second recheck timer, or a second
 * verifier racing over the same token cache. It still reads the activated
 * key, through `LICENSE_KEY_SOURCE`, because that file is the only place a
 * production key exists.
 *
 * Global so the service is injectable anywhere. Bring your own status
 * controller — auth is app-specific.
 *
 * `INSTALLED_VERSION_PROVIDER` is optional and NOT provided here: only the
 * host knows where its own version lives. Without it, heartbeats fall back to
 * the static `currentVersion` option.
 */
export declare class UpdateClientModule {
    static forRoot(options: UpdateClientModuleOptions): DynamicModule;
}
