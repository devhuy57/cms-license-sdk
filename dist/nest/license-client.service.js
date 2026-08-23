"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LicenseClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseClientService = void 0;
exports.productIdMatches = productIdMatches;
const common_1 = require("@nestjs/common");
const core_1 = require("../core");
const constants_1 = require("./constants");
const ports_1 = require("./ports");
const key_store_1 = require("./key-store");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Clients configure a stable product slug (`nguonvia`); the license server
 * historically signed the catalog UUID. Treat that pairing as a match so a
 * valid key still activates while older tokens are in circulation.
 */
function productIdMatches(configured, claimed) {
    const expected = configured.trim();
    if (!expected)
        return true;
    if (claimed === expected)
        return true;
    return UUID_RE.test(claimed) && !UUID_RE.test(expected);
}
const INITIAL_STATE = {
    valid: false,
    fresh: false,
    claims: null,
    reason: null,
    lastCheckedAt: null,
};
/**
 * Owns live license state. `refresh()` checks the authority online (verify sig →
 * validate claims → cache); on a network failure it falls back to the cached
 * token while within its grace window. Read helpers feed the boot gate, the
 * product's status endpoint, and (Phase B) the per-license runtime secret.
 */
let LicenseClientService = LicenseClientService_1 = class LicenseClientService {
    constructor(options, authority, verifier, cache, keyStore) {
        this.options = options;
        this.authority = authority;
        this.verifier = verifier;
        this.cache = cache;
        this.keyStore = keyStore;
        this.logger = new common_1.Logger(LicenseClientService_1.name);
        this.state = INITIAL_STATE;
        this.inflight = null;
    }
    /** The active key: a runtime-activated key (if any) overrides the config. */
    async activeKey() {
        return (await this.keyStore.read()) || this.options.licenseKey;
    }
    /**
     * Apply a new key at runtime: verify it online, and only if valid persist it
     * (so it survives restarts and overrides the configured key), cache its token,
     * and adopt it as current state. Returns the resulting state.
     */
    async activate(licenseKey) {
        const key = licenseKey.trim();
        if (!key) {
            return this.set({
                valid: false,
                fresh: true,
                claims: null,
                reason: 'server_invalid',
                now: new Date(),
            });
        }
        let state;
        try {
            state = await this.verifyOnline(key, new Date());
        }
        catch (err) {
            if (err instanceof ports_1.LicenseAuthorityUnreachableError) {
                this.logger.warn(`Activation failed — authority unreachable (${err.message}).`);
                return this.set({
                    valid: false,
                    fresh: true,
                    claims: null,
                    reason: 'server_invalid',
                    now: new Date(),
                });
            }
            throw err;
        }
        if (state.valid)
            await this.keyStore.write(key);
        return state;
    }
    getState() {
        return this.state;
    }
    isValid() {
        return this.state.valid;
    }
    hasFeature(feature) {
        return this.state.valid && !!this.state.claims?.features.includes(feature);
    }
    /** Per-license runtime secret (Phase B). Null unless currently valid. */
    getRuntimeSecret() {
        return this.state.valid ? (this.state.claims?.secret ?? null) : null;
    }
    /**
     * Re-verify with the authority. Concurrent callers share one in-flight check.
     * Pass `maxAgeMs` to reuse the last result when it is still fresh (status
     * endpoint uses this so every admin page does not hammer the CMS).
     */
    async refresh(opts) {
        const maxAgeMs = opts?.maxAgeMs;
        if (maxAgeMs != null &&
            maxAgeMs > 0 &&
            this.state.lastCheckedAt &&
            Date.now() - Date.parse(this.state.lastCheckedAt) < maxAgeMs) {
            return this.state;
        }
        if (this.inflight)
            return this.inflight;
        this.inflight = this.doRefresh().finally(() => {
            this.inflight = null;
        });
        return this.inflight;
    }
    async doRefresh() {
        const now = new Date();
        const nowSec = Math.floor(now.getTime() / 1000);
        const key = await this.activeKey();
        try {
            return await this.verifyOnline(key, now);
        }
        catch (err) {
            if (err instanceof ports_1.LicenseAuthorityUnreachableError) {
                this.logger.warn(`License authority unreachable (${err.message}); falling back to cached token.`);
                return this.applyOffline(now, nowSec);
            }
            throw err;
        }
    }
    /**
     * Online verification for `licenseKey`: authority → signature → claims → cache.
     * Throws {@link LicenseAuthorityUnreachableError} when the authority can't be
     * reached (caller decides whether to fall back to cache).
     */
    async verifyOnline(licenseKey, now) {
        const domain = this.options.domain.trim() || null;
        const online = await this.authority.verify({ licenseKey, domain });
        if (!online.token) {
            const reason = online.valid
                ? 'no_token'
                : 'server_invalid';
            this.logger.warn(online.valid
                ? 'License authority returned no signed token — cannot verify authenticity.'
                : `License rejected by authority: ${online.reason ?? 'unknown'}`);
            // Authority spoke: drop the last-good token so offline grace cannot
            // keep a revoked/suspended/expired key alive.
            await this.cache.clear();
            return this.set({ valid: false, fresh: true, claims: null, reason, now });
        }
        let claims;
        try {
            claims = this.verifier.verify(online.token);
        }
        catch (err) {
            this.logger.error(`License token signature invalid: ${err instanceof Error ? err.message : String(err)}`);
            await this.cache.clear();
            return this.set({
                valid: false,
                fresh: true,
                claims: null,
                reason: 'bad_signature',
                now,
            });
        }
        const invalid = this.validateClaims(claims, now);
        if (invalid) {
            await this.cache.clear();
            return this.set({ valid: false, fresh: true, claims, reason: invalid, now });
        }
        await this.cache.write(online.token);
        return this.set({ valid: true, fresh: true, claims, reason: null, now });
    }
    async applyOffline(now, nowSec) {
        const cached = await this.cache.read();
        if (!cached) {
            return this.set({
                valid: false,
                fresh: false,
                claims: null,
                reason: 'offline_no_cache',
                now,
            });
        }
        let claims;
        try {
            claims = this.verifier.verify(cached);
        }
        catch {
            return this.set({
                valid: false,
                fresh: false,
                claims: null,
                reason: 'bad_signature',
                now,
            });
        }
        const invalid = this.validateClaims(claims, now);
        if (invalid) {
            return this.set({ valid: false, fresh: false, claims, reason: invalid, now });
        }
        if (!(0, core_1.isWithinGrace)(claims, nowSec)) {
            return this.set({
                valid: false,
                fresh: false,
                claims,
                reason: 'offline_grace_expired',
                now,
            });
        }
        this.logger.warn('Running on cached license (offline grace window).');
        return this.set({ valid: true, fresh: false, claims, reason: null, now });
    }
    validateClaims(claims, now) {
        // Token signature is authoritative. `productId` on the token is
        // informational — catalog UUID vs install slug must not block activate.
        if (claims.status !== 'active') {
            return 'license_inactive';
        }
        if (!claims.features.includes(this.options.requiredFeature)) {
            return 'feature_missing';
        }
        if ((0, core_1.isLicenseExpired)(claims, now)) {
            return 'license_expired';
        }
        return null;
    }
    set(input) {
        this.state = {
            valid: input.valid,
            fresh: input.fresh,
            claims: input.claims,
            reason: input.reason,
            lastCheckedAt: input.now.toISOString(),
        };
        return this.state;
    }
};
exports.LicenseClientService = LicenseClientService;
exports.LicenseClientService = LicenseClientService = LicenseClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(constants_1.LICENSE_CLIENT_OPTIONS)),
    __param(1, (0, common_1.Inject)(ports_1.LICENSE_AUTHORITY)),
    __param(2, (0, common_1.Inject)(ports_1.TOKEN_VERIFIER)),
    __param(3, (0, common_1.Inject)(ports_1.TOKEN_CACHE)),
    __param(4, (0, common_1.Inject)(key_store_1.KEY_STORE)),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object])
], LicenseClientService);
