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
const file_installation_token_store_1 = require("./file-installation-token-store");
const file_license_key_source_1 = require("./file-license-key-source");
const installation_heartbeat_1 = require("./installation-heartbeat");
const constants_1 = require("./constants");
const key_store_1 = require("./key-store");
const update_client_constants_1 = require("./update-client-constants");
const update_client_service_1 = require("./update-client.service");
const update_authority_http_client_1 = require("./update-authority.http-client");
const update_ports_1 = require("./update-ports");
/**
 * Update client: registers this process as an `Installation` with the CMS,
 * reports what it runs, and carries out an update job's transport —
 * download, verify, and step reporting.
 *
 * Independent of `LicenseClientModule` on purpose. A host that only applies
 * updates (a dedicated updater process) registers this alone and does not
 * inherit a boot-blocking license gate, a second recheck timer, or a second
 * verifier racing over the same token cache. It still reads the activated
 * key, through `LICENSE_KEY_SOURCE`, because that file is the only place a
 * production key exists.
 *
 * Global so the service is injectable anywhere. Bring your own status
 * controller — auth is app-specific.
 *
 * `INSTALLED_VERSION_PROVIDER` is optional and NOT provided here: only the
 * host knows where its own version lives. Without it, heartbeats fall back to
 * the static `currentVersion` option.
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
                    useFactory: (o) => new update_authority_http_client_1.UpdateAuthorityHttpClient(o.authorityUrl, o.requestTimeoutMs, o.downloadIdleTimeoutMs ?? update_client_constants_1.DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS),
                    inject: [update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                {
                    provide: update_ports_1.INSTALLATION_TOKEN_STORE,
                    useFactory: (o) => new file_installation_token_store_1.FileInstallationTokenStore(o.installationStorePath || update_client_constants_1.DEFAULT_INSTALLATION_STORE_PATH),
                    inject: [update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                {
                    provide: key_store_1.KEY_STORE,
                    useFactory: (o) => new key_store_1.FileKeyStore(o.keyStorePath || constants_1.DEFAULT_KEY_STORE_PATH),
                    inject: [update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                {
                    provide: update_ports_1.LICENSE_KEY_SOURCE,
                    useFactory: (store, o) => new file_license_key_source_1.FileLicenseKeySource(store, o.licenseKey),
                    inject: [key_store_1.KEY_STORE, update_client_constants_1.UPDATE_CLIENT_OPTIONS],
                },
                update_client_service_1.UpdateClientService,
                installation_heartbeat_1.InstallationHeartbeat,
            ],
            exports: [update_client_service_1.UpdateClientService],
        };
    }
};
exports.UpdateClientModule = UpdateClientModule;
exports.UpdateClientModule = UpdateClientModule = UpdateClientModule_1 = __decorate([
    (0, common_1.Module)({})
], UpdateClientModule);
