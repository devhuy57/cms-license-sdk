import { LicenseTokenClaims } from '../core';
import { LicenseClientModuleOptions } from './constants';
import { KeyStorePort } from './key-store';
import { LicenseClientService, productIdMatches } from './license-client.service';
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
  keyStore?: Partial<KeyStorePort>;
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
  const keyStore = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    ...parts.keyStore,
  } as unknown as KeyStorePort;
  return {
    service: new LicenseClientService(
      options,
      authority,
      verifier,
      cache,
      keyStore,
    ),
    cache,
    keyStore,
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

  it('accepts a token whose productId differs from the configured slug', async () => {
    const { service } = build({
      authority: okOnline,
      verifier: { verify: jest.fn().mockReturnValue(claims({ productId: 'x' })) },
    });
    const state = await service.refresh();
    expect(state.valid).toBe(true);
    expect(state.reason).toBeNull();
  });

  it('accepts a catalog-UUID claim against the configured product slug', async () => {
    const { service } = build({
      authority: okOnline,
      verifier: {
        verify: jest.fn().mockReturnValue(
          claims({ productId: 'a1b2c3d4-e5f6-47a8-8bcd-1234567890ab' }),
        ),
      },
    });
    const state = await service.refresh();
    expect(state.valid).toBe(true);
    expect(state.reason).toBeNull();
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

  it('refresh() prefers the stored (activated) key over the configured one', async () => {
    const authority = { verify: jest.fn().mockResolvedValue({ valid: true, reason: null, status: 'active', token: 'tok' }) };
    const { service } = build({
      authority,
      verifier: { verify: jest.fn().mockReturnValue(claims()) },
      keyStore: { read: jest.fn().mockResolvedValue('ACTIVATED-KEY') },
    });
    await service.refresh();
    expect(authority.verify).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'ACTIVATED-KEY' }),
    );
  });

  it('activate() persists the key only when it verifies valid', async () => {
    const { service, keyStore } = build({
      authority: okOnline,
      verifier: { verify: jest.fn().mockReturnValue(claims()) },
    });
    const state = await service.activate('NEW-KEY');
    expect(state.valid).toBe(true);
    expect(keyStore.write).toHaveBeenCalledWith('NEW-KEY');
  });

  it('activate() does NOT persist an invalid key', async () => {
    const { service, keyStore } = build({
      authority: {
        verify: jest.fn().mockResolvedValue({
          valid: false,
          reason: 'revoked',
          status: 'revoked',
          token: null,
        }),
      },
    });
    const state = await service.activate('BAD-KEY');
    expect(state.valid).toBe(false);
    expect(keyStore.write).not.toHaveBeenCalled();
  });
});

describe('productIdMatches', () => {
  it('matches equal slugs', () => {
    expect(productIdMatches('nguonvia', 'nguonvia')).toBe(true);
  });

  it('treats a catalog UUID claim as matching a configured slug', () => {
    expect(
      productIdMatches('nguonvia', 'a1b2c3d4-e5f6-47a8-8bcd-1234567890ab'),
    ).toBe(true);
  });

  it('rejects a different slug', () => {
    expect(productIdMatches('nguonvia', 'shop-key')).toBe(false);
  });
});
