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
    /** Mount a PUBLIC `POST /license/activate` so a new key can be applied at
     *  runtime (the key is verified before it is accepted). Default false. */
    enableActivationEndpoint?: boolean;
}
export declare const LICENSE_CLIENT_OPTIONS: unique symbol;
export declare const DEFAULT_KEY_STORE_PATH = ".license/active-key";
