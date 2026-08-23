import { LicenseClientModuleOptions } from './constants';
import { LicenseAuthorityPort, TokenCachePort, TokenVerifierPort } from './ports';
import { KeyStorePort } from './key-store';
import { LicenseClientState } from './state';
/**
 * Clients configure a stable product slug (`nguonvia`); the license server
 * historically signed the catalog UUID. Treat that pairing as a match so a
 * valid key still activates while older tokens are in circulation.
 */
export declare function productIdMatches(configured: string, claimed: string): boolean;
/**
 * Owns live license state. `refresh()` checks the authority online (verify sig →
 * validate claims → cache); on a network failure it falls back to the cached
 * token while within its grace window. Read helpers feed the boot gate, the
 * product's status endpoint, and (Phase B) the per-license runtime secret.
 */
export declare class LicenseClientService {
    private readonly options;
    private readonly authority;
    private readonly verifier;
    private readonly cache;
    private readonly keyStore;
    private readonly logger;
    private state;
    private inflight;
    constructor(options: LicenseClientModuleOptions, authority: LicenseAuthorityPort, verifier: TokenVerifierPort, cache: TokenCachePort, keyStore: KeyStorePort);
    /** The active key: a runtime-activated key (if any) overrides the config. */
    private activeKey;
    /**
     * Apply a new key at runtime: verify it online, and only if valid persist it
     * (so it survives restarts and overrides the configured key), cache its token,
     * and adopt it as current state. Returns the resulting state.
     */
    activate(licenseKey: string): Promise<LicenseClientState>;
    getState(): LicenseClientState;
    isValid(): boolean;
    hasFeature(feature: string): boolean;
    /** Per-license runtime secret (Phase B). Null unless currently valid. */
    getRuntimeSecret(): string | null;
    /**
     * Re-verify with the authority. Concurrent callers share one in-flight check.
     * Pass `maxAgeMs` to reuse the last result when it is still fresh (status
     * endpoint uses this so every admin page does not hammer the CMS).
     */
    refresh(opts?: {
        maxAgeMs?: number;
    }): Promise<LicenseClientState>;
    private doRefresh;
    /**
     * Online verification for `licenseKey`: authority → signature → claims → cache.
     * Throws {@link LicenseAuthorityUnreachableError} when the authority can't be
     * reached (caller decides whether to fall back to cache).
     */
    private verifyOnline;
    private applyOffline;
    private validateClaims;
    private set;
}
