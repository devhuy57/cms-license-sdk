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
}
export declare const LICENSE_CLIENT_OPTIONS: unique symbol;
