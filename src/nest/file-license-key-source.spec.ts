import { FileLicenseKeySource } from './file-license-key-source';
import type { KeyStorePort } from './key-store';

function store(value: string | null): KeyStorePort {
  return {
    read: jest.fn().mockResolvedValue(value),
    write: jest.fn().mockResolvedValue(undefined),
  };
}

describe('FileLicenseKeySource', () => {
  it('prefers the runtime-activated key over the configured one', async () => {
    const source = new FileLicenseKeySource(store('ACTIVATED'), 'CONFIGURED');
    expect(await source.read()).toBe('ACTIVATED');
  });

  it('falls back to the configured key when nothing is activated', async () => {
    const source = new FileLicenseKeySource(store(null), 'CONFIGURED');
    expect(await source.read()).toBe('CONFIGURED');
  });

  it('returns null on a fresh install with neither', async () => {
    // Production ships LICENSE_KEY empty and the store is created only when
    // the customer activates. This is the normal pre-activation state, not a
    // misconfiguration.
    const source = new FileLicenseKeySource(store(null), '');
    expect(await source.read()).toBeNull();
  });

  it('treats whitespace as absent, on both sides', async () => {
    expect(await new FileLicenseKeySource(store('   '), 'CONFIGURED').read()).toBe(
      'CONFIGURED',
    );
    expect(await new FileLicenseKeySource(store(null), '  ').read()).toBeNull();
  });

  it('re-reads on every call, so re-activating takes effect without a restart', async () => {
    const keyStore = store('FIRST');
    const source = new FileLicenseKeySource(keyStore, '');
    await source.read();
    (keyStore.read as jest.Mock).mockResolvedValue('SECOND');

    expect(await source.read()).toBe('SECOND');
    expect(keyStore.read).toHaveBeenCalledTimes(2);
  });
});
