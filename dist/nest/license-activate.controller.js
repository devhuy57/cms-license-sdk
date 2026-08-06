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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseActivateController = void 0;
const common_1 = require("@nestjs/common");
const license_client_service_1 = require("./license-client.service");
/**
 * PUBLIC license endpoints for self-served installs. Mounted only when
 * `enableActivationEndpoint` is set. Rate-limit them upstream.
 *
 * - `POST /license/activate` — accept a key, verify online, persist if valid.
 * - `GET  /license/status`  — whether this install is already licensed (no key
 *   leaked). Front-end gates use this so one activation unlocks every browser.
 *
 * Public because the key itself is the credential on activate, and status only
 * exposes a boolean that the cosmetic FE gate already needs. Real enforcement
 * stays on the backend boot gate / `LicenseClientService`.
 *
 * Uses `@Body('licenseKey')` (not a DTO class) so it needs no class-validator
 * dependency and isn't stripped by a host `whitelist` ValidationPipe.
 */
let LicenseActivateController = class LicenseActivateController {
    constructor(licenses) {
        this.licenses = licenses;
    }
    status() {
        const state = this.licenses.getState();
        return { valid: state.valid, fresh: state.fresh, reason: state.reason };
    }
    async activate(licenseKey) {
        const state = await this.licenses.activate(licenseKey ?? '');
        return { valid: state.valid, fresh: state.fresh, reason: state.reason };
    }
};
exports.LicenseActivateController = LicenseActivateController;
__decorate([
    (0, common_1.Get)('status'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], LicenseActivateController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('activate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)('licenseKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LicenseActivateController.prototype, "activate", null);
exports.LicenseActivateController = LicenseActivateController = __decorate([
    (0, common_1.Controller)('license'),
    __metadata("design:paramtypes", [license_client_service_1.LicenseClientService])
], LicenseActivateController);
