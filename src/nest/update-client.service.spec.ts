import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import {
  AvailableUpdateResult,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationCredentials,
  InstallationTokenStorePort,
  InstallationUnauthorizedError,
  RegisterInstallationResult,
} from './update-ports';

const options: UpdateClientModuleOptions = {
  authorityUrl: 'https://authority.test',
  licenseKey: 'KEY-1',
  environment: 'production',
  hostname: 'nguonvia.com',
  requestTimeoutMs: 10000,
};

const okUpdates: AvailableUpdateResult = {
  updateAvailable: true,
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  latestReleaseId: 'release-1',
};

const okRegister: RegisterInstallationResult = {
  installationId: 'install-1',
  installationToken: 'token-1',
};

function build(parts: {
  authority?: Partial<InstallationAuthorityPort>;
  store?: Partial<InstallationTokenStorePort>;
}) {
  const authority = {
    register: jest.fn().mockResolvedValue(okRegister),
    getUpdates: jest.fn().mockResolvedValue(okUpdates),
    ...parts.authority,
  } as unknown as InstallationAuthorityPort;
  const store = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    ...parts.store,
  } as unknown as InstallationTokenStorePort;
  return {
    service: new UpdateClientService(options, authority, store),
    authority,
    store,
  };
}

describe('license-sdk/nest UpdateClientService', () => {
  it('registers, persists credentials, and reports an available update', async () => {
    const { service, authority, store } = build({});
    const state = await service.refresh();
    expect(authority.register).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'KEY-1', environment: 'production' }),
    );
    expect(store.write).toHaveBeenCalledWith(okRegister);
    expect(state.checked).toBe(true);
    expect(state.updateAvailable).toBe(true);
    expect(state.latestVersion).toBe('1.1.0');
    expect(state.reason).toBeNull();
  });

  it('does not re-register when credentials are already stored', async () => {
    const stored: InstallationCredentials = {
      installationId: 'install-2',
      installationToken: 'token-2',
    };
    const { service, authority } = build({
      store: { read: jest.fn().mockResolvedValue(stored) },
    });
    await service.refresh();
    expect(authority.register).not.toHaveBeenCalled();
    expect(authority.getUpdates).toHaveBeenCalledWith('install-2', 'token-2');
  });

  it('no_license_key when the license key is blank', async () => {
    const emptyKeyOptions = { ...options, licenseKey: '  ' };
    const authority = {
      register: jest.fn(),
      getUpdates: jest.fn(),
    } as unknown as InstallationAuthorityPort;
    const store = {
      read: jest.fn().mockResolvedValue(null),
      write: jest.fn(),
      clear: jest.fn(),
    } as unknown as InstallationTokenStorePort;
    const service = new UpdateClientService(emptyKeyOptions, authority, store);
    const state = await service.refresh();
    expect(state.reason).toBe('no_license_key');
    expect(authority.register).not.toHaveBeenCalled();
  });

  it('refresh({ maxAgeMs }) reuses a fresh result without calling the authority', async () => {
    const { service, authority } = build({});
    await service.refresh();
    await service.refresh({ maxAgeMs: 60_000 });
    expect(authority.getUpdates).toHaveBeenCalledTimes(1);
  });

  it('authority_unreachable keeps the previous good numbers', async () => {
    const { service, authority } = build({});
    await service.refresh();
    (authority.getUpdates as jest.Mock).mockRejectedValueOnce(
      new InstallationAuthorityUnreachableError('timeout'),
    );
    const state = await service.refresh({ maxAgeMs: 0 });
    expect(state.reason).toBe('authority_unreachable');
    expect(state.updateAvailable).toBe(true);
    expect(state.latestVersion).toBe('1.1.0');
  });

  it('an unauthorized token clears the store and re-registers once', async () => {
    const { service, authority, store } = build({
      store: {
        read: jest
          .fn()
          .mockResolvedValueOnce({ installationId: 'stale', installationToken: 'stale-token' })
          .mockResolvedValue(null),
      },
      authority: {
        getUpdates: jest
          .fn()
          .mockRejectedValueOnce(new InstallationUnauthorizedError('revoked'))
          .mockResolvedValue(okUpdates),
      },
    });
    const state = await service.refresh();
    expect(store.clear).toHaveBeenCalled();
    expect(authority.register).toHaveBeenCalledTimes(1);
    expect(state.checked).toBe(true);
    expect(state.reason).toBeNull();
  });

  it('unauthorized when re-registration also fails', async () => {
    const { service, store } = build({
      store: {
        read: jest
          .fn()
          .mockResolvedValueOnce({ installationId: 'stale', installationToken: 'stale-token' }),
      },
      authority: {
        getUpdates: jest.fn().mockRejectedValue(new InstallationUnauthorizedError('revoked')),
        register: jest.fn().mockRejectedValue(new Error('still rejected')),
      },
    });
    const state = await service.refresh();
    expect(store.clear).toHaveBeenCalled();
    expect(state.reason).toBe('unauthorized');
  });
});
