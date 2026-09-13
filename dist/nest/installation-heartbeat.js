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
var InstallationHeartbeat_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallationHeartbeat = void 0;
const common_1 = require("@nestjs/common");
const update_client_constants_1 = require("./update-client-constants");
const update_client_service_1 = require("./update-client.service");
/**
 * Tells the CMS this installation is alive and which versions it runs, on a
 * timer, and refreshes the update check on the same beat.
 *
 * Structurally a sibling of `LicenseGate` with two deliberate differences.
 * It never blocks boot: there is nothing to enforce here, and a CMS outage
 * must not stop a customer's own updater from serving its status endpoint.
 * And it fails quietly — a missed beat costs the vendor a stale row in an
 * admin list, not the customer a working site.
 *
 * Interval defaults well below the license client's, because this is what
 * makes the vendor's "who is running what" view worth looking at, and what
 * decides how soon a customer is offered a new release.
 */
let InstallationHeartbeat = InstallationHeartbeat_1 = class InstallationHeartbeat {
    constructor(options, updates) {
        this.options = options;
        this.updates = updates;
        this.logger = new common_1.Logger(InstallationHeartbeat_1.name);
        this.timer = null;
    }
    async onApplicationBootstrap() {
        const intervalMs = this.options.heartbeatIntervalMs ?? 0;
        if (intervalMs <= 0 || !this.updates)
            return;
        await this.beat();
        this.timer = setInterval(() => void this.beat(), intervalMs);
        // Never hold the process open just to send a heartbeat.
        this.timer.unref?.();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    async beat() {
        try {
            await this.updates?.heartbeat();
            await this.updates?.refresh();
        }
        catch (error) {
            this.logger.warn(`Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.InstallationHeartbeat = InstallationHeartbeat;
exports.InstallationHeartbeat = InstallationHeartbeat = InstallationHeartbeat_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(update_client_constants_1.UPDATE_CLIENT_OPTIONS)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, update_client_service_1.UpdateClientService])
], InstallationHeartbeat);
