import { KeyStorePort } from './key-store';
import { LicenseKeySourcePort } from './update-ports';

/**
 * The runtime-activated key first, falling back to the configured one.
 *
 * Production ships `LICENSE_KEY` empty — the customer types their key into
 * the admin's activation form and it lands in the license client's key store
 * on a shared volume. Without this, the update client would register with an
 * empty key and never come up on a real deployment.
 *
 * Read on every call, never cached: an operator who re-activates with a
 * different key must take effect without a restart, and the file is written
 * by another process (the API container) that this one cannot observe.
 */
export class FileLicenseKeySource implements LicenseKeySourcePort {
  constructor(
    private readonly store: KeyStorePort,
    private readonly fallbackKey: string,
  ) {}

  async read(): Promise<string | null> {
    const activated = (await this.store.read())?.trim();
    if (activated) return activated;
    const configured = this.fallbackKey?.trim();
    return configured ? configured : null;
  }
}
