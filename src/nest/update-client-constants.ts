export interface UpdateClientModuleOptions {
  authorityUrl: string;
  /**
   * Static license key used to register with the CMS. Independent of
   * `LicenseClientModuleOptions` on purpose — license verification and
   * update-checking are separate SDK capabilities with separate credentials;
   * if a customer re-activates with a *different* key at runtime via
   * `LicenseClientService.activate()`, this option does not automatically
   * follow it (the host app would need to reconfigure/restart this module).
   */
  licenseKey: string;
  environment: 'production' | 'staging' | 'development';
  /** Domain/host this installation runs on; checked against the license's allowed domains, if set. */
  hostname?: string;
  /** Human label shown on the CMS admin's Installations list. */
  label?: string;
  /** Version currently running, if known — lets the CMS resolve `currentReleaseId` on first register. */
  currentVersion?: string;
  requestTimeoutMs: number;
  /** File that persists the minted installation id + token across restarts. */
  installationStorePath?: string;
}

export const UPDATE_CLIENT_OPTIONS = Symbol('UPDATE_CLIENT_OPTIONS');

export const DEFAULT_INSTALLATION_STORE_PATH = '.license/installation.json';
