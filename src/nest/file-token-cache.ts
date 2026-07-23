import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { TokenCachePort } from './ports';

/**
 * Stores the last valid token on local disk (0600). `cachePath` resolves against
 * CWD when relative; keep it out of any statically-served dir. Missing/unreadable
 * → null.
 */
export class FileTokenCache implements TokenCachePort {
  private readonly path: string;

  constructor(cachePath: string) {
    this.path = isAbsolute(cachePath)
      ? cachePath
      : resolve(process.cwd(), cachePath);
  }

  async read(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  async write(token: string): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, token, { mode: 0o600 });
  }
}
