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
 * The product's `UpdateExecutorPort` is passed through `options.executor`
 * rather than provided by the host's own module: Nest resolves a provider's
 * dependencies within the module that *declares* it, and `UpdateRunner` is
 * declared here — so a token registered in the host's module would never
 * reach it. A global module exports to others; it does not receive from them.
 *
 * Omit it and `UpdateRunner.run` throws a clear error at call time rather
 * than failing DI at boot, so a host that only wants update *detection*
 * still starts. `installedVersionProvider` is passed the same way and for
 * the same reason.
 */
export declare class UpdateClientModule {
    static forRoot(options: UpdateClientModuleOptions): DynamicModule;
}
