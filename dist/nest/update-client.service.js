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
var UpdateClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateClientService = void 0;
const common_1 = require("@nestjs/common");
const update_client_constants_1 = require("./update-client-constants");
const update_ports_1 = require("./update-ports");
const INITIAL_STATE = {
    checked: false,
    updateAvailable: false,
    currentVersion: null,
    latestVersion: null,
    latestReleaseId: null,
    reason: null,
    lastCheckedAt: null,
};
/**
 * Owns live update-availability state. `refresh()` ensures this process is
 * registered as an `Installation` with the CMS (once, cached to disk), then
 * asks whether a newer release is available. Unlike `LicenseClientService`,
 * a failed check has nothing to enforce — on an unreachable authority or a
 * rejected token it keeps the last known good numbers and only flips
 * `reason`, so a transient blip never flashes "no update" at the admin.
 */
let UpdateClientService = UpdateClientService_1 = class UpdateClientService {
    constructor(options, authority, store) {
        this.options = options;
        this.authority = authority;
        this.store = store;
        this.logger = new common_1.Logger(UpdateClientService_1.name);
        this.state = INITIAL_STATE;
        this.inflight = null;
    }
    getState() {
        return this.state;
    }
    /**
     * Re-check with the CMS. Concurrent callers share one in-flight check. Pass
     * `maxAgeMs` to reuse the last result when it is still fresh (an admin
     * status endpoint should use this so every dashboard load does not hammer
     * the CMS).
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
        if (!this.options.licenseKey.trim()) {
            return this.fail('no_license_key', now);
        }
        try {
            const credentials = await this.ensureRegistered();
            return await this.checkUpdates(credentials, now);
        }
        catch (err) {
            if (err instanceof update_ports_1.InstallationUnauthorizedError) {
                // Stored credentials were rejected (e.g. installation revoked) —
                // drop them and register fresh, once.
                await this.store.clear();
                try {
                    const credentials = await this.ensureRegistered();
                    return await this.checkUpdates(credentials, now);
                }
                catch (retryErr) {
                    this.logger.warn(`Update check failed after re-registering: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
                    return this.fail('unauthorized', now);
                }
            }
            if (err instanceof update_ports_1.InstallationAuthorityUnreachableError) {
                this.logger.warn(`Update authority unreachable: ${err.message}`);
                return this.fail('authority_unreachable', now);
            }
            throw err;
        }
    }
    async checkUpdates(credentials, now) {
        const result = await this.authority.getUpdates(credentials.installationId, credentials.installationToken);
        this.state = {
            checked: true,
            updateAvailable: result.updateAvailable,
            currentVersion: result.currentVersion,
            latestVersion: result.latestVersion,
            latestReleaseId: result.latestReleaseId,
            reason: null,
            lastCheckedAt: now.toISOString(),
        };
        return this.state;
    }
    async ensureRegistered() {
        const existing = await this.store.read();
        if (existing)
            return existing;
        const registered = await this.authority.register({
            licenseKey: this.options.licenseKey,
            environment: this.options.environment,
            hostname: this.options.hostname,
            label: this.options.label,
            currentVersion: this.options.currentVersion,
        });
        const credentials = {
            installationId: registered.installationId,
            installationToken: registered.installationToken,
        };
        await this.store.write(credentials);
        return credentials;
    }
    /** A failed check keeps the previous good `updateAvailable`/version numbers, only updating `reason`/`lastCheckedAt`. */
    fail(reason, now) {
        this.state = {
            ...this.state,
            reason,
            lastCheckedAt: now.toISOString(),
        };
        return this.state;
    }
};
exports.UpdateClientService = UpdateClientService;
exports.UpdateClientService = UpdateClientService = UpdateClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(update_client_constants_1.UPDATE_CLIENT_OPTIONS)),
    __param(1, (0, common_1.Inject)(update_ports_1.INSTALLATION_AUTHORITY)),
    __param(2, (0, common_1.Inject)(update_ports_1.INSTALLATION_TOKEN_STORE)),
    __metadata("design:paramtypes", [Object, Object, Object])
], UpdateClientService);
