"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LicenseClientModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseClientModule = void 0;
const common_1 = require("@nestjs/common");
const constants_1 = require("./constants");
const ed25519_token_verifier_1 = require("./ed25519-token-verifier");
const key_store_1 = require("./key-store");
const file_token_cache_1 = require("./file-token-cache");
const license_activate_controller_1 = require("./license-activate.controller");
const license_authority_http_client_1 = require("./license-authority.http-client");
const license_client_service_1 = require("./license-client.service");
const license_gate_1 = require("./license-gate");
const ports_1 = require("./ports");
/**
 * Reusable license enforcement client. Verifies the signed license with the
 * authority, gates boot when `enforce`, re-checks on a heartbeat, and exposes
 * `LicenseClientService`. Global so the service (and Phase B runtime secret) is
 * injectable anywhere. Bring your own status controller (auth is app-specific);
 * a PUBLIC activate controller is mounted only when `enableActivationEndpoint`.
 */
let LicenseClientModule = LicenseClientModule_1 = class LicenseClientModule {
    static forRoot(options) {
        return {
            module: LicenseClientModule_1,
            global: true,
            controllers: options.enableActivationEndpoint
                ? [license_activate_controller_1.LicenseActivateController]
                : [],
            providers: [
                { provide: constants_1.LICENSE_CLIENT_OPTIONS, useValue: options },
                {
                    provide: ports_1.TOKEN_VERIFIER,
                    useFactory: (o) => new ed25519_token_verifier_1.Ed25519TokenVerifier(o.publicKeyPem),
                    inject: [constants_1.LICENSE_CLIENT_OPTIONS],
                },
                {
                    provide: ports_1.LICENSE_AUTHORITY,
                    useFactory: (o) => new license_authority_http_client_1.LicenseAuthorityHttpClient(o.authorityUrl, o.requestTimeoutMs),
                    inject: [constants_1.LICENSE_CLIENT_OPTIONS],
                },
                {
                    provide: ports_1.TOKEN_CACHE,
                    useFactory: (o) => new file_token_cache_1.FileTokenCache(o.cachePath),
                    inject: [constants_1.LICENSE_CLIENT_OPTIONS],
                },
                {
                    provide: key_store_1.KEY_STORE,
                    useFactory: (o) => new key_store_1.FileKeyStore(o.keyStorePath || constants_1.DEFAULT_KEY_STORE_PATH),
                    inject: [constants_1.LICENSE_CLIENT_OPTIONS],
                },
                license_client_service_1.LicenseClientService,
                license_gate_1.LicenseGate,
            ],
            exports: [license_client_service_1.LicenseClientService],
        };
    }
};
exports.LicenseClientModule = LicenseClientModule;
exports.LicenseClientModule = LicenseClientModule = LicenseClientModule_1 = __decorate([
    (0, common_1.Module)({})
], LicenseClientModule);
