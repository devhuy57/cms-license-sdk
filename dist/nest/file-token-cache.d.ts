import { TokenCachePort } from './ports';
/**
 * Stores the last valid token on local disk (0600). `cachePath` resolves against
 * CWD when relative; keep it out of any statically-served dir. Missing/unreadable
 * → null.
 */
export declare class FileTokenCache implements TokenCachePort {
    private readonly path;
    constructor(cachePath: string);
    read(): Promise<string | null>;
    write(token: string): Promise<void>;
}
