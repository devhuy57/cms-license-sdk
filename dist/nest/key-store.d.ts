/**
 * Persists the runtime-active license key (0600) so a key entered via the
 * activation endpoint survives restarts and overrides the configured key.
 * Missing/unreadable → null (falls back to the configured key).
 */
export interface KeyStorePort {
    read(): Promise<string | null>;
    write(key: string): Promise<void>;
}
export declare const KEY_STORE: unique symbol;
export declare class FileKeyStore implements KeyStorePort {
    private readonly path;
    constructor(keyStorePath: string);
    read(): Promise<string | null>;
    write(key: string): Promise<void>;
}
