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
import {
  INSTALLATION_AUTHORITY,
  INSTALLATION_TOKEN_STORE,
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
 * `INSTALLED_VERSION_PROVIDER` and `UPDATE_EXECUTOR` are optional and NOT
 * provided here: only the host knows where its own version lives and how its
 * own deployment is rebuilt. Without the first, heartbeats fall back to the
 * static `currentVersion`; without the second, `UpdateRunner.run` throws a
 * clear error at call time rather than failing DI at boot — so a host that
 * only wants update *detection* still starts.
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
        UpdateRunner,
      ],
      exports: [UpdateClientService, UpdateRunner],
    };
  }
}
