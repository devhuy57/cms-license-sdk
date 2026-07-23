import { LicenseTokenClaims } from '../core';
import { LicenseClientModuleOptions } from './constants';
import { LicenseClientService } from './license-client.service';
import {
  LicenseAuthorityPort,
  LicenseAuthorityUnreachableError,
  TokenCachePort,
  TokenVerifierPort,
} from './ports';

const NOW_SEC = Math.floor(Date.now() / 1000);

function claims(
  overrides: Partial<LicenseTokenClaims> = {},
): LicenseTokenClaims {
  return {
    v: 1,
    sub: 'hash',
    productId: 'prod-1',
    planId: null,
    status: 'active',
    boundIp: null,
    boundDomain: null,
    licenseExpiresAt: null,
    iat: NOW_SEC - 10,
    exp: NOW_SEC + 3600,
    graceUntil: NOW_SEC + 7200,
    features: ['core'],
    secret: 'runtime-secret',
    ...overrides,
  };
}

const options: LicenseClientModuleOptions = {
  authorityUrl: 'https://authority.test',
  licenseKey: 'KEY-1',
  productId: 'prod-1',
  publicKeyPem: 'unused',
  domain: 'acme.com',
  cachePath: '/tmp/unused',
  recheckIntervalMs: 3600000,
  requiredFeature: 'core',
  enforce: true,
  requestTimeoutMs: 10000,
};

function build(parts: {
  authority?: Partial<LicenseAuthorityPort>;
  verifier?: Partial<TokenVerifierPort>;
  cache?: Partial<TokenCachePort>;
}) {
  const authority = {
    verify: jest.fn(),
    ...parts.authority,
  } as unknown as LicenseAuthorityPort;
  const verifier = {
    verify: jest.fn(),
    ...parts.verifier,
  } as unknown as TokenVerifierPort;
  const cache = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    ...parts.cache,
  } as unknown as TokenCachePort;
  return {
    service: new LicenseClientService(options, authority, verifier, cache),
    cache,
  };
}

const okOnline = {
  verify: jest
    .fn()
    .mockResolvedValue({ valid: true, reason: null, status: 'active', token: 'tok' }),
};

describe('license-sdk/nest LicenseClientService', () => {
  it('valid + fresh + caches token on a good online verify', async () => {
    const { service, cache } = build({
      authority: okOnline,
      verifier: { verify: jest.fn().mockReturnValue(claims()) },
    });
    const state = await service.refresh();
    expect(state.valid).toBe(true);
    expect(state.fresh).toBe(true);
    expect(cache.write).toHaveBeenCalledWith('tok');
    expect(service.getRuntimeSecret()).toBe('runtime-secret');
  });

  it('bad_signature when the online token fails verification', async () => {
    const { service } = build({
      authority: okOnline,
      verifier: {
        verify: jest.fn().mockImplementation(() => {
          throw new Error('signature verification failed');
        }),
      },
    });
    const state = await service.refresh();
    expect(state.valid).toBe(false);
    expect(state.reason).toBe('bad_signature');
  });

  it('product_mismatch when token is for another product', async () => {
    const { service } = build({
      authority: okOnline,
      verifier: { verify: jest.fn().mockReturnValue(claims({ productId: 'x' })) },
    });
    expect((await service.refresh()).reason).toBe('product_mismatch');
  });

  it('server_invalid when authority returns no token', async () => {
    const { service } = build({
      authority: {
        verify: jest.fn().mockResolvedValue({
          valid: false,
          reason: 'revoked',
          status: 'revoked',
          token: null,
        }),
      },
    });
    expect((await service.refresh()).reason).toBe('server_invalid');
  });

  it('offline: valid within grace from cache', async () => {
    const { service, cache } = build({
      authority: {
        verify: jest
          .fn()
          .mockRejectedValue(new LicenseAuthorityUnreachableError('timeout')),
      },
      verifier: { verify: jest.fn().mockReturnValue(claims()) },
      cache: { read: jest.fn().mockResolvedValue('cached'), write: jest.fn() },
    });
    const state = await service.refresh();
    expect(state.valid).toBe(true);
    expect(state.fresh).toBe(false);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('offline_grace_expired past graceUntil', async () => {
    const { service } = build({
      authority: {
        verify: jest
          .fn()
          .mockRejectedValue(new LicenseAuthorityUnreachableError('timeout')),
      },
      verifier: {
        verify: jest.fn().mockReturnValue(claims({ graceUntil: NOW_SEC - 1 })),
      },
      cache: { read: jest.fn().mockResolvedValue('cached') },
    });
    expect((await service.refresh()).reason).toBe('offline_grace_expired');
  });

  it('offline_no_cache when unreachable and nothing cached', async () => {
    const { service } = build({
      authority: {
        verify: jest
          .fn()
          .mockRejectedValue(new LicenseAuthorityUnreachableError('timeout')),
      },
      cache: { read: jest.fn().mockResolvedValue(null) },
    });
    expect((await service.refresh()).reason).toBe('offline_no_cache');
  });
});
