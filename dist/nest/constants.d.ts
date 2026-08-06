export interface LicenseClientModuleOptions {
    authorityUrl: string;
    licenseKey: string;
    productId: string;
    publicKeyPem: string;
    domain: string;
    cachePath: string;
    recheckIntervalMs: number;
    requiredFeature: string;
    enforce: boolean;
    requestTimeoutMs: number;
    /** File that persists a runtime-activated key (overrides `licenseKey`). */
    keyStorePath?: string;
    /** Mount PUBLIC `POST /license/activate` + `GET /license/status` so a new
     *  key can be applied at runtime and front-end gates can unlock every
     *  browser once the backend is licensed. Default false. */
    enableActivationEndpoint?: boolean;
}
export declare const LICENSE_CLIENT_OPTIONS: unique symbol;
export declare const DEFAULT_KEY_STORE_PATH = ".license/active-key";
