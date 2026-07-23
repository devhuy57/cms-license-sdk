import { DynamicModule, Module } from '@nestjs/common';
import { LICENSE_CLIENT_OPTIONS, LicenseClientModuleOptions } from './constants';
import { Ed25519TokenVerifier } from './ed25519-token-verifier';
import { FileTokenCache } from './file-token-cache';
import { LicenseAuthorityHttpClient } from './license-authority.http-client';
import { LicenseClientService } from './license-client.service';
import { LicenseGate } from './license-gate';
import { LICENSE_AUTHORITY, TOKEN_CACHE, TOKEN_VERIFIER } from './ports';

/**
 * Reusable license enforcement client. Verifies the signed license with the
 * authority, gates boot when `enforce`, re-checks on a heartbeat, and exposes
 * `LicenseClientService`. Global so the service (and Phase B runtime secret) is
 * injectable anywhere. Bring your own status controller (auth is app-specific).
 */
@Module({})
export class LicenseClientModule {
  static forRoot(options: LicenseClientModuleOptions): DynamicModule {
    return {
      module: LicenseClientModule,
      global: true,
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
        LicenseClientService,
        LicenseGate,
      ],
      exports: [LicenseClientService],
    };
  }
}
