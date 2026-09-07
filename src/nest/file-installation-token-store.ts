import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  InstallationCredentials,
  InstallationTokenStorePort,
} from './update-ports';

/**
 * Stores the installation id + token as JSON on local disk (0600), so a
 * restart doesn't re-register a brand-new installation. `storePath` resolves
 * against CWD when relative; keep it out of any statically-served dir.
 * Missing/unreadable/malformed → null (triggers a fresh registration).
 */
export class FileInstallationTokenStore implements InstallationTokenStorePort {
  private readonly path: string;

  constructor(storePath: string) {
    this.path = isAbsolute(storePath)
      ? storePath
      : resolve(process.cwd(), storePath);
  }

  async read(): Promise<InstallationCredentials | null> {
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<InstallationCredentials>;
      if (!parsed.installationId || !parsed.installationToken) return null;
      return {
        installationId: parsed.installationId,
        installationToken: parsed.installationToken,
      };
    } catch {
      return null;
    }
  }

  async write(credentials: InstallationCredentials): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(credentials), {
      mode: 0o600,
    });
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.path);
    } catch {
      // Missing file is already cleared.
    }
  }
}
