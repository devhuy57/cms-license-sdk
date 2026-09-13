import type { RetryPolicy } from './http-retry';

export interface UpdateClientModuleOptions {
  authorityUrl: string;
  /**
   * Fallback license key. In production this is usually EMPTY — the customer
   * activates at runtime and the key lands in the key store at
   * {@link keyStorePath}, which takes precedence. Kept for builds that bake a
   * key in, and for tests.
   */
  licenseKey: string;
  /**
   * Where the runtime-activated key lives, shared with `LicenseClientModule`.
   * Defaults to `DEFAULT_KEY_STORE_PATH`.
   */
  keyStorePath?: string;
  environment: 'production' | 'staging' | 'development';
  /** Domain/host this installation runs on; checked against the license's allowed domains, if set. */
  hostname?: string;
  /** Human label shown on the CMS admin's Installations list. */
  label?: string;
  /**
   * Version currently running, if known. Only a fallback — a host that knows
   * its real installed state should provide `INSTALLED_VERSION_PROVIDER`,
   * which is re-read on every heartbeat instead of frozen at boot.
   */
  currentVersion?: string;
  requestTimeoutMs: number;
  /**
   * IDLE timeout for artifact downloads, reset on every chunk. Not a budget
   * for the whole transfer — a large component would never finish under one.
   */
  downloadIdleTimeoutMs?: number;
  /**
   * Heartbeat + update-check interval. `0` (the default) disables the timer,
   * so a host that only wants on-demand checks pays for nothing.
   */
  heartbeatIntervalMs?: number;
  /** File that persists the minted installation id + token across restarts. */
  installationStorePath?: string;
  /** Overrides for the retry/backoff defaults. */
  retry?: Partial<RetryPolicy>;
}

export const UPDATE_CLIENT_OPTIONS = Symbol('UPDATE_CLIENT_OPTIONS');

export const DEFAULT_INSTALLATION_STORE_PATH = '.license/installation.json';
export const DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;
/**
 * 15 minutes. Well below the license client's hourly recheck: this is what
 * makes the vendor's "who runs what" view current, and it decides how soon a
 * customer is offered a new release.
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 900_000;
