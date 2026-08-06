import {
  backendStatusUrlFromActivateUrl,
  isBackendLicenseValid,
} from './index';

describe('backendStatusUrlFromActivateUrl', () => {
  it('maps …/activate → …/status', () => {
    expect(
      backendStatusUrlFromActivateUrl('https://api.example/v1/license/activate'),
    ).toBe('https://api.example/v1/license/status');
  });

  it('tolerates a trailing slash', () => {
    expect(
      backendStatusUrlFromActivateUrl(
        'https://api.example/v1/license/activate/',
      ),
    ).toBe('https://api.example/v1/license/status');
  });

  it('leaves unrelated URLs unchanged', () => {
    expect(backendStatusUrlFromActivateUrl('https://api.example/health')).toBe(
      'https://api.example/health',
    );
  });
});

describe('isBackendLicenseValid', () => {
  it('returns true when status.valid is true', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, fresh: true, reason: null }),
    });
    await expect(
      isBackendLicenseValid(
        'https://api.example/v1/license/activate',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example/v1/license/status',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('returns false when status.valid is false', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false, reason: 'missing_key' }),
    });
    await expect(
      isBackendLicenseValid(
        'https://api.example/v1/license/activate',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe(false);
  });

  it('fail-closes on network errors', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      isBackendLicenseValid(
        'https://api.example/v1/license/activate',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe(false);
  });

  it('fail-closes when activate URL cannot be mapped', async () => {
    const fetchImpl = jest.fn();
    await expect(
      isBackendLicenseValid(
        'https://api.example/health',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
