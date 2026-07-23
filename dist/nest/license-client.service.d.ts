import { LicenseClientModuleOptions } from './constants';
import { LicenseAuthorityPort, TokenCachePort, TokenVerifierPort } from './ports';
import { LicenseClientState } from './state';
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
    private readonly logger;
    private state;
    constructor(options: LicenseClientModuleOptions, authority: LicenseAuthorityPort, verifier: TokenVerifierPort, cache: TokenCachePort);
    getState(): LicenseClientState;
    isValid(): boolean;
    hasFeature(feature: string): boolean;
    /** Per-license runtime secret (Phase B). Null unless currently valid. */
    getRuntimeSecret(): string | null;
    refresh(): Promise<LicenseClientState>;
    private applyOffline;
    private validateClaims;
    private set;
}
