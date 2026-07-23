import { DynamicModule, Module } from '@nestjs/common';
import {
  DEFAULT_KEY_STORE_PATH,
  LICENSE_CLIENT_OPTIONS,
  LicenseClientModuleOptions,
} from './constants';
import { Ed25519TokenVerifier } from './ed25519-token-verifier';
import { FileKeyStore, KEY_STORE } from './key-store';
import { FileTokenCache } from './file-token-cache';
import { LicenseActivateController } from './license-activate.controller';
import { LicenseAuthorityHttpClient } from './license-authority.http-client';
import { LicenseClientService } from './license-client.service';
import { LicenseGate } from './license-gate';
import { LICENSE_AUTHORITY, TOKEN_CACHE, TOKEN_VERIFIER } from './ports';

/**
 * Reusable license enforcement client. Verifies the signed license with the
 * authority, gates boot when `enforce`, re-checks on a heartbeat, and exposes
 * `LicenseClientService`. Global so the service (and Phase B runtime secret) is
 * injectable anywhere. Bring your own status controller (auth is app-specific);
 * a PUBLIC activate controller is mounted only when `enableActivationEndpoint`.
 */
@Module({})
export class LicenseClientModule {
  static forRoot(options: LicenseClientModuleOptions): DynamicModule {
    return {
      module: LicenseClientModule,
      global: true,
      controllers: options.enableActivationEndpoint
        ? [LicenseActivateController]
        : [],
      providers: [
        { provide: LICENSE_CLIENT_OPTIONS, useValue: options },
        {
          provide: TOKEN_VERIFIER,
          useFactory: (o: LicenseClientModuleOptions) =>
            new Ed25519TokenVerifier(o.publicKeyPem),
          inject: [LICENSE_CLIENT_OPTIONS],
        },
        {
          provide: LICENSE_AUTHORITY,
          useFactory: (o: LicenseClientModuleOptions) =>
            new LicenseAuthorityHttpClient(o.authorityUrl, o.requestTimeoutMs),
          inject: [LICENSE_CLIENT_OPTIONS],
        },
        {
          provide: TOKEN_CACHE,
          useFactory: (o: LicenseClientModuleOptions) =>
            new FileTokenCache(o.cachePath),
          inject: [LICENSE_CLIENT_OPTIONS],
        },
        {
          provide: KEY_STORE,
          useFactory: (o: LicenseClientModuleOptions) =>
            new FileKeyStore(o.keyStorePath || DEFAULT_KEY_STORE_PATH),
          inject: [LICENSE_CLIENT_OPTIONS],
        },
        LicenseClientService,
        LicenseGate,
      ],
      exports: [LicenseClientService],
    };
  }
}
