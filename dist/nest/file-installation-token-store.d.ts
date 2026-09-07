import { InstallationCredentials, InstallationTokenStorePort } from './update-ports';
/**
 * Stores the installation id + token as JSON on local disk (0600), so a
 * restart doesn't re-register a brand-new installation. `storePath` resolves
 * against CWD when relative; keep it out of any statically-served dir.
 * Missing/unreadable/malformed → null (triggers a fresh registration).
 */
export declare class FileInstallationTokenStore implements InstallationTokenStorePort {
    private readonly path;
    constructor(storePath: string);
    read(): Promise<InstallationCredentials | null>;
    write(credentials: InstallationCredentials): Promise<void>;
    clear(): Promise<void>;
}
