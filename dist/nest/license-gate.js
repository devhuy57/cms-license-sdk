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
var LicenseGate_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseGate = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("./constants");
const license_client_service_1 = require("./license-client.service");
/**
 * Enforcement point. Checks the license at boot; when `enforce` is true an
 * invalid result throws and aborts startup (Nest never calls `listen`). Then
 * re-checks on an interval. The timer is `unref()`ed and cleared on shutdown.
 */
let LicenseGate = LicenseGate_1 = class LicenseGate {
    constructor(options, licenses) {
        this.options = options;
        this.licenses = licenses;
        this.logger = new common_1.Logger(LicenseGate_1.name);
        this.timer = null;
    }
    async onApplicationBootstrap() {
        const state = await this.licenses.refresh();
        if (!state.valid) {
            const msg = `License check failed: ${state.reason ?? 'unknown'}.`;
            if (this.options.enforce) {
                throw new Error(`${msg} Startup blocked (licenseClient.enforce = true).`);
            }
            this.logger.warn(`${msg} Continuing (enforce = false).`);
        }
        else {
            this.logger.log(`License valid${state.fresh ? '' : ' (offline grace)'}; features: ${state.claims?.features.join(', ')}.`);
        }
        this.scheduleRecheck();
    }
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    scheduleRecheck() {
        this.timer = setInterval(() => {
            void this.licenses
                .refresh()
                .then((state) => {
                if (!state.valid) {
                    this.logger.warn(`License re-check failed: ${state.reason ?? 'unknown'} (running process not interrupted).`);
                }
            })
                .catch((err) => this.logger.error(`License re-check errored: ${err instanceof Error ? err.message : String(err)}`));
        }, this.options.recheckIntervalMs);
        this.timer.unref?.();
    }
};
exports.LicenseGate = LicenseGate;
exports.LicenseGate = LicenseGate = LicenseGate_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(constants_1.LICENSE_CLIENT_OPTIONS)),
    __metadata("design:paramtypes", [Object, license_client_service_1.LicenseClientService])
], LicenseGate);
