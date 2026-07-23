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
const common_1 = require("@nestjs/common");
const core_1 = require("../core");
const constants_1 = require("./constants");
const ports_1 = require("./ports");
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
    constructor(options, authority, verifier, cache) {
        this.options = options;
        this.authority = authority;
        this.verifier = verifier;
        this.cache = cache;
        this.logger = new common_1.Logger(LicenseClientService_1.name);
        this.state = INITIAL_STATE;
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
    async refresh() {
        const now = new Date();
        const nowSec = Math.floor(now.getTime() / 1000);
        const domain = this.options.domain.trim() || null;
        let online;
        try {
            online = await this.authority.verify({
                licenseKey: this.options.licenseKey,
                domain,
            });
        }
        catch (err) {
            if (err instanceof ports_1.LicenseAuthorityUnreachableError) {
                this.logger.warn(`License authority unreachable (${err.message}); falling back to cached token.`);
                return this.applyOffline(now, nowSec);
            }
            throw err;
        }
        if (!online.token) {
            const reason = online.valid
                ? 'no_token'
                : 'server_invalid';
            this.logger.warn(online.valid
                ? 'License authority returned no signed token — cannot verify authenticity.'
                : `License rejected by authority: ${online.reason ?? 'unknown'}`);
            return this.set({ valid: false, fresh: true, claims: null, reason, now });
        }
        let claims;
        try {
            claims = this.verifier.verify(online.token);
        }
        catch (err) {
            this.logger.error(`License token signature invalid: ${err instanceof Error ? err.message : String(err)}`);
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
        if (this.options.productId && claims.productId !== this.options.productId) {
            return 'product_mismatch';
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
    __metadata("design:paramtypes", [Object, Object, Object, Object])
], LicenseClientService);
