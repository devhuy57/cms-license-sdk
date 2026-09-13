import { UpdateClientModuleOptions } from './update-client-constants';
import { UpdateClientService } from './update-client.service';
import {
  AvailableUpdateResult,
  InstallationAuthorityPort,
  InstallationAuthorityUnreachableError,
  InstallationCredentials,
  InstallationForbiddenError,
  InstallationTokenStorePort,
  InstallationUnauthorizedError,
  LicenseKeySourcePort,
  RegisterInstallationResult,
} from './update-ports';

const options: UpdateClientModuleOptions = {
  authorityUrl: 'https://authority.test',
  licenseKey: 'KEY-1',
  environment: 'production',
  hostname: 'nguonvia.com',
  requestTimeoutMs: 10000,
  // Retries are exercised on their own; leaving them on would make every
  // failure case in here sleep through three attempts.
  retry: { attempts: 1 },
};

const okUpdates: AvailableUpdateResult = {
  updateAvailable: true,
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  latestReleaseId: 'release-1',
  reason: null,
  updatesUntil: null,
};

const okRegister: RegisterInstallationResult = {
  installationId: 'install-1',
  installationToken: 'token-1',
};

function build(parts: {
  authority?: Partial<InstallationAuthorityPort>;
  store?: Partial<InstallationTokenStorePort>;
  keys?: Partial<LicenseKeySourcePort>;
  options?: Partial<UpdateClientModuleOptions>;
}) {
  const authority = {
    register: jest.fn().mockResolvedValue(okRegister),
    getUpdates: jest.fn().mockResolvedValue(okUpdates),
    heartbeat: jest.fn().mockResolvedValue(undefined),
    rotateToken: jest.fn().mockResolvedValue(okRegister),
    startUpdate: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    reportStep: jest.fn().mockResolvedValue({ status: 'downloading' }),
    abandonJob: jest.fn().mockResolvedValue(undefined),
    downloadComponent: jest.fn().mockResolvedValue({ component: 'api' }),
    ...parts.authority,
  } as unknown as InstallationAuthorityPort;
  const store = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    ...parts.store,
  } as unknown as InstallationTokenStorePort;
  const keys = {
    read: jest.fn().mockResolvedValue('KEY-1'),
    ...parts.keys,
  } as unknown as LicenseKeySourcePort;
  return {
    service: new UpdateClientService(
      { ...options, ...parts.options },
      authority,
      store,
      keys,
    ),
    authority,
    store,
    keys,
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

  it('no_license_key before the customer has activated', async () => {
    // Production ships LICENSE_KEY empty; the key only exists once someone
    // types it into the activation form. This must stay a soft state the next
    // heartbeat retries, not a hard failure.
    const { service, authority } = build({
      keys: { read: jest.fn().mockResolvedValue(null) },
    });
    const state = await service.refresh();
    expect(state.reason).toBe('no_license_key');
    expect(authority.register).not.toHaveBeenCalled();
  });

  it('registers with the runtime-activated key, not the configured fallback', async () => {
    const { service, authority } = build({
      keys: { read: jest.fn().mockResolvedValue('ACTIVATED-KEY') },
    });
    await service.refresh();
    expect(authority.register).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'ACTIVATED-KEY' }),
    );
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

  it('reports a lapsed update entitlement as forbidden, keeping the site running', async () => {
    const { service } = build({
      authority: {
        getUpdates: jest
          .fn()
          .mockRejectedValue(
            new InstallationForbiddenError('updates expired', 'updates_expired'),
          ),
      },
    });

    const state = await service.refresh();

    // Not `unauthorized`: re-registering would not help, and the operator
    // needs to be told to renew rather than to re-activate.
    expect(state.reason).toBe('forbidden');
  });

  it('surfaces the entitlement window the CMS reports', async () => {
    const { service } = build({
      authority: {
        getUpdates: jest.fn().mockResolvedValue({
          ...okUpdates,
          updateAvailable: false,
          latestVersion: null,
          latestReleaseId: null,
          reason: 'updates_expired',
          updatesUntil: '2026-01-01T00:00:00.000Z',
        }),
      },
    });

    const state = await service.refresh();

    expect(state.updatesUntil).toBe('2026-01-01T00:00:00.000Z');
  });

  it('recovers a step report from a rejected token by re-registering', async () => {
    // Matters mid-job: a token rotated between two steps would otherwise
    // fail every remaining report and lose the job history.
    const { service, authority } = build({
      store: {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            installationId: 'stale',
            installationToken: 'stale-token',
          })
          .mockResolvedValue(null),
      },
      authority: {
        reportStep: jest
          .fn()
          .mockRejectedValueOnce(new InstallationUnauthorizedError('revoked'))
          .mockResolvedValue({ status: 'building' }),
      },
    });

    const result = await service.reportStep('job-1', {
      step: 'building',
      outcome: 'started',
    });

    expect(result.status).toBe('building');
    expect(authority.register).toHaveBeenCalledTimes(1);
  });

  it('retries a step report through a network blip', async () => {
    // Losing a step corrupts the vendor's only record of what happened, and
    // a lost `completed` leaves the job looking stuck forever.
    const { service, authority } = build({
      options: { retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } },
      authority: {
        reportStep: jest
          .fn()
          .mockRejectedValueOnce(
            new InstallationAuthorityUnreachableError('ECONNRESET'),
          )
          .mockResolvedValue({ status: 'completed' }),
      },
    });

    const result = await service.reportStep('job-1', {
      step: 'completed',
      outcome: 'succeeded',
    });

    expect(result.status).toBe('completed');
    expect(authority.reportStep).toHaveBeenCalledTimes(2);
  });

  it('does not retry starting an update', async () => {
    // Not idempotent: a retry whose first attempt actually landed is
    // indistinguishable from a genuine "already in progress" conflict.
    const { service, authority } = build({
      options: { retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } },
      authority: {
        startUpdate: jest
          .fn()
          .mockRejectedValue(
            new InstallationAuthorityUnreachableError('ECONNRESET'),
          ),
      },
    });

    await expect(service.startUpdate('rel-1')).rejects.toThrow('ECONNRESET');
    expect(authority.startUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not retry a refused call — a 403 is an answer, not a failure to get one', async () => {
    const { service, authority } = build({
      options: { retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } },
      authority: {
        downloadComponent: jest
          .fn()
          .mockRejectedValue(new InstallationForbiddenError('updates expired')),
      },
    });

    await expect(
      service.downloadComponent('rel-1', 'api', { destDir: '/tmp/x' }),
    ).rejects.toThrow('updates expired');
    expect(authority.downloadComponent).toHaveBeenCalledTimes(1);
  });

  it('registers only once when a heartbeat and a check race', async () => {
    // The heartbeat timer and a running job both call through `withAuth`.
    // Without serialising registration they mint two tokens and one silently
    // overwrites the other.
    const { service, authority } = build({});

    await Promise.all([service.heartbeat(), service.refresh()]);

    expect(authority.register).toHaveBeenCalledTimes(1);
  });
});
