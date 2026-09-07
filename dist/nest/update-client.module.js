"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UpdateClientModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateClientModule = void 0;
const common_1 = require("@nestjs/common");
const update_client_constants_1 = require("./update-client-constants");
const update_client_service_1 = require("./update-client.service");
const file_installation_token_store_1 = require("./file-installation-token-store");
const update_authority_http_client_1 = require("./update-authority.http-client");
const update_ports_1 = require("./update-ports");
/**
 * Reusable update-availability client: registers this process as an
 * `Installation` with the CMS and exposes `UpdateClientService` for checking
 * whether a newer release exists. Independent of `LicenseClientModule` — a
 * host app registers both if it wants license enforcement AND update
 * checking. Global so the service is injectable anywhere. Bring your own
 * status controller (auth is app-specific), mirroring how
 * `LicenseClientModule` leaves status/activation to the host except for its
 * own optional public endpoint.
 */
let UpdateClientModule = UpdateClientModule_1 = class UpdateClientModule {
    static forRoot(options) {
        return {
            module: UpdateClientModule_1,
            global: true,
            providers: [
                { provide: update_client_constants_1.UPDATE_CLIENT_OPTIONS, useValue: options },
                {
                    provide: update_ports_1.INSTALLATION_AUTHORITY,
                    useFactory: (o) => new update_authority_http_client_1.UpdateAuthorityHttpClient(o.authorityUrl, o.requestTimeoutMs),
                    inject: [update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                {
                    provide: update_ports_1.INSTALLATION_TOKEN_STORE,
                    useFactory: (o) => new file_installation_token_store_1.FileInstallationTokenStore(o.installationStorePath || update_client_constants_1.DEFAULT_INSTALLATION_STORE_PATH),
                    inject: [update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                update_client_service_1.UpdateClientService,
            ],
            exports: [update_client_service_1.UpdateClientService],
        };
    }
};
exports.UpdateClientModule = UpdateClientModule;
exports.UpdateClientModule = UpdateClientModule = UpdateClientModule_1 = __decorate([
    (0, common_1.Module)({})
], UpdateClientModule);
