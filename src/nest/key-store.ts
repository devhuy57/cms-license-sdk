import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Persists the runtime-active license key (0600) so a key entered via the
 * activation endpoint survives restarts and overrides the configured key.
 * Missing/unreadable → null (falls back to the configured key).
 */
export interface KeyStorePort {
  read(): Promise<string | null>;
  write(key: string): Promise<void>;
}
export const KEY_STORE = Symbol('LICENSE_CLIENT_KEY_STORE');

export class FileKeyStore implements KeyStorePort {
  private readonly path: string;

  constructor(keyStorePath: string) {
    this.path = isAbsolute(keyStorePath)
      ? keyStorePath
      : resolve(process.cwd(), keyStorePath);
  }

  async read(): Promise<string | null> {
    try {
      const raw = (await fs.readFile(this.path, 'utf8')).trim();
      return raw.length > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  async write(key: string): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, key, { mode: 0o600 });
  }
}
