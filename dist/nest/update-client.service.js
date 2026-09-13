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
const http_retry_1 = require("./http-retry");
const update_client_constants_1 = require("./update-client-constants");
const update_ports_1 = require("./update-ports");
const INITIAL_STATE = {
    checked: false,
    updateAvailable: false,
    currentVersion: null,
    latestVersion: null,
    latestReleaseId: null,
    reason: null,
    updatesUntil: null,
    lastCheckedAt: null,
};
/**
 * Owns live update state and every call to the CMS's installation API.
 *
 * Unlike `LicenseClientService`, a failed check has nothing to enforce — on
 * an unreachable authority or a rejected token it keeps the last known good
 * numbers and only flips `reason`, so a transient blip never flashes "no
 * update" at the admin.
 */
let UpdateClientService = UpdateClientService_1 = class UpdateClientService {
    constructor(options, authority, store, keys, installedVersion) {
        this.options = options;
        this.authority = authority;
        this.store = store;
        this.keys = keys;
        this.installedVersion = installedVersion;
        this.logger = new common_1.Logger(UpdateClientService_1.name);
        this.state = INITIAL_STATE;
        this.inflight = null;
        /**
         * Serialises registration. Without it the heartbeat timer and a running
         * update job can register concurrently and overwrite each other's token,
         * leaving one of them holding a credential the CMS has already replaced.
         */
        this.registering = null;
        this.retry = { ...http_retry_1.DEFAULT_RETRY_POLICY, ...(options.retry ?? {}) };
    }
    getState() {
        return this.state;
    }
    /** The registered installation id, or null before the first registration. */
    async getInstallationId() {
        return (await this.store.read())?.installationId ?? null;
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
    /** Report liveness and the versions this installation runs. */
    async heartbeat() {
        const reported = (await this.installedVersion?.read()) ?? {
            currentVersion: this.options.currentVersion,
        };
        // Deliberately not retried: the next beat *is* the retry, and stacking
        // attempts on a timer only deepens a backlog against a struggling CMS.
        await this.withAuth((c) => this.authority.heartbeat(c.installationId, c.installationToken, reported));
    }
    /**
     * Begin an update to `releaseId`. Not retried: it is not idempotent, and a
     * retry whose first attempt actually succeeded is indistinguishable from a
     * genuine "already in progress" conflict.
     */
    async startUpdate(releaseId) {
        return this.withAuth((c) => this.authority.startUpdate(c.installationId, c.installationToken, releaseId));
    }
    /**
     * Record one pipeline transition. Retried hardest of all the calls: losing
     * a step corrupts the vendor's only view of what happened, and a lost
     * `completed` leaves the job looking stuck forever.
     */
    async reportStep(jobId, input) {
        return (0, http_retry_1.withRetry)(() => this.withAuth((c) => this.authority.reportStep(c.installationId, c.installationToken, jobId, input)), { ...this.retry, attempts: 5, maxDelayMs: 30_000 }, isRetryable);
    }
    /** Close an unfinished job so it stops blocking future updates. */
    async abandonJob(jobId, reason) {
        await this.withAuth((c) => this.authority.abandonJob(c.installationId, c.installationToken, jobId, reason));
    }
    /**
     * Fetch one component's artifact to disk. Retried, with a fresh partial
     * file each attempt — this is the only call long enough that an ordinary
     * network blip would otherwise lose a whole update.
     */
    async downloadComponent(releaseId, component, options) {
        return (0, http_retry_1.withRetry)(() => this.withAuth((c) => this.authority.downloadComponent(c.installationId, c.installationToken, releaseId, component, options)), this.retry, isRetryable);
    }
    async doRefresh() {
        const now = new Date();
        if (!(await this.keys.read())) {
            // A freshly delivered install has no key until the customer activates.
            // Not a failure to latch onto — the next beat retries.
            return this.fail('no_license_key', now);
        }
        try {
            const result = await (0, http_retry_1.withRetry)(() => this.withAuth((c) => this.authority.getUpdates(c.installationId, c.installationToken)), this.retry, isRetryable);
            this.state = {
                checked: true,
                updateAvailable: result.updateAvailable,
                currentVersion: result.currentVersion,
                latestVersion: result.latestVersion,
                latestReleaseId: result.latestReleaseId,
                reason: null,
                updatesUntil: result.updatesUntil,
                lastCheckedAt: now.toISOString(),
            };
            return this.state;
        }
        catch (err) {
            if (err instanceof update_ports_1.InstallationForbiddenError) {
                this.logger.warn(`Update check refused: ${err.message}`);
                return this.fail('forbidden', now);
            }
            if (err instanceof update_ports_1.InstallationUnauthorizedError) {
                this.logger.warn(`Installation token rejected: ${err.message}`);
                return this.fail('unauthorized', now);
            }
            if (err instanceof update_ports_1.InstallationAuthorityUnreachableError) {
                this.logger.warn(`Update authority unreachable: ${err.message}`);
                return this.fail('authority_unreachable', now);
            }
            // `refresh()` is driven by a timer and by the admin's status endpoint.
            // Neither has anywhere to put an exception, and an updater that crashes
            // on a bad CMS response is worse than one reporting a stale number — so
            // this is total by design. Logged at error level because reaching here
            // means something unmodelled happened.
            this.logger.error(`Unexpected error during update check: ${err instanceof Error ? err.message : String(err)}`);
            return this.fail('authority_unreachable', now);
        }
    }
    /**
     * Runs `fn` with current credentials, recovering once from a rejected
     * token. Applied to every authenticated call, not just the update check:
     * an installation that is revoked and re-issued mid-job would otherwise
     * fail every subsequent step report.
     */
    async withAuth(fn) {
        const credentials = await this.ensureRegistered();
        try {
            return await fn(credentials);
        }
        catch (error) {
            if (!(error instanceof update_ports_1.InstallationUnauthorizedError))
                throw error;
            // Stored credentials were rejected (revoked, rotated elsewhere) — drop
            // them and register fresh, exactly once. A second 401 propagates.
            await this.store.clear();
            try {
                const fresh = await this.ensureRegistered();
                return await fn(fresh);
            }
            catch (retryError) {
                // Whatever the second attempt hit, the actionable state is the same:
                // we could not re-establish this installation's identity. Reporting
                // the inner error would send an operator chasing a network blip when
                // the license was revoked.
                throw new update_ports_1.InstallationUnauthorizedError(`installation token rejected and re-registration failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
            }
        }
    }
    async ensureRegistered() {
        const existing = await this.store.read();
        if (existing)
            return existing;
        if (this.registering)
            return this.registering;
        this.registering = this.register().finally(() => {
            this.registering = null;
        });
        return this.registering;
    }
    async register() {
        const licenseKey = await this.keys.read();
        if (!licenseKey) {
            throw new update_ports_1.InstallationAuthorityUnreachableError('no license key available: activate this installation first');
        }
        const reported = await this.installedVersion?.read();
        const registered = await (0, http_retry_1.withRetry)(() => this.authority.register({
            licenseKey,
            environment: this.options.environment,
            hostname: this.options.hostname,
            label: this.options.label,
            currentVersion: reported?.currentVersion ?? this.options.currentVersion,
        }), this.retry, isRetryable);
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
    __param(3, (0, common_1.Inject)(update_ports_1.LICENSE_KEY_SOURCE)),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)(update_ports_1.INSTALLED_VERSION_PROVIDER)),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object])
], UpdateClientService);
/**
 * Only a failure to get an answer is worth retrying. A 401/403/404/409 IS an
 * answer: retrying it wastes time and, for the non-idempotent calls, risks
 * acting twice on a response that was merely lost.
 */
function isRetryable(error) {
    return error instanceof update_ports_1.InstallationAuthorityUnreachableError;
}
