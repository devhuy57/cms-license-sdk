import { DynamicModule, Module } from '@nestjs/common';
import {
  DEFAULT_INSTALLATION_STORE_PATH,
  UPDATE_CLIENT_OPTIONS,
  UpdateClientModuleOptions,
} from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import { FileInstallationTokenStore } from './file-installation-token-store';
import { UpdateAuthorityHttpClient } from './update-authority.http-client';
import { INSTALLATION_AUTHORITY, INSTALLATION_TOKEN_STORE } from './update-ports';

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
            new UpdateAuthorityHttpClient(o.authorityUrl, o.requestTimeoutMs),
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
        UpdateClientService,
      ],
      exports: [UpdateClientService],
    };
  }
}
