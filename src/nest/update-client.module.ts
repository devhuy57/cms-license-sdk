import { DynamicModule, Module } from '@nestjs/common';
import { FileInstallationTokenStore } from './file-installation-token-store';
import { FileLicenseKeySource } from './file-license-key-source';
import { InstallationHeartbeat } from './installation-heartbeat';
import { DEFAULT_KEY_STORE_PATH } from './constants';
import { FileKeyStore, KEY_STORE } from './key-store';
import {
  DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS,
  DEFAULT_INSTALLATION_STORE_PATH,
  UPDATE_CLIENT_OPTIONS,
  UpdateClientModuleOptions,
} from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import { UpdateRunner } from './update-runner';
import { UpdateAuthorityHttpClient } from './update-authority.http-client';
import { UPDATE_EXECUTOR } from './update-executor';
import {
  INSTALLATION_AUTHORITY,
  INSTALLATION_TOKEN_STORE,
  INSTALLED_VERSION_PROVIDER,
  LICENSE_KEY_SOURCE,
} from './update-ports';

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
@Module({})
export class UpdateClientModule {
  static forRoot(options: UpdateClientModuleOptions): DynamicModule {
    return {
      module: UpdateClientModule,
      global: true,
      providers: [
        { provide: UPDATE_CLIENT_OPTIONS, useValue: options },
        {
          provide: INSTALLATION_AUTHORITY,
          useFactory: (o: UpdateClientModuleOptions) =>
            new UpdateAuthorityHttpClient(
              o.authorityUrl,
              o.requestTimeoutMs,
              o.downloadIdleTimeoutMs ?? DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS,
            ),
          inject: [UPDATE_CLIENT_OPTIONS],
        },
        {
          provide: INSTALLATION_TOKEN_STORE,
          useFactory: (o: UpdateClientModuleOptions) =>
            new FileInstallationTokenStore(
              o.installationStorePath || DEFAULT_INSTALLATION_STORE_PATH,
            ),
          inject: [UPDATE_CLIENT_OPTIONS],
        },
        {
          provide: KEY_STORE,
          useFactory: (o: UpdateClientModuleOptions) =>
            new FileKeyStore(o.keyStorePath || DEFAULT_KEY_STORE_PATH),
          inject: [UPDATE_CLIENT_OPTIONS],
        },
        {
          provide: LICENSE_KEY_SOURCE,
          useFactory: (store: FileKeyStore, o: UpdateClientModuleOptions) =>
            new FileLicenseKeySource(store, o.licenseKey),
          inject: [KEY_STORE, UPDATE_CLIENT_OPTIONS],
        },
        UpdateClientService,
        InstallationHeartbeat,
        // Registered here, alongside UpdateRunner, because Nest resolves a
        // provider's dependencies in the module that declares it — the host
        // cannot supply this token from its own module.
        ...(options.executor
          ? [
              options.executor,
              { provide: UPDATE_EXECUTOR, useExisting: options.executor },
            ]
          : []),
        ...(options.installedVersionProvider
          ? [
              options.installedVersionProvider,
              {
                provide: INSTALLED_VERSION_PROVIDER,
                useExisting: options.installedVersionProvider,
              },
            ]
          : []),
        UpdateRunner,
      ],
      exports: [UpdateClientService, UpdateRunner],
    };
  }
}
