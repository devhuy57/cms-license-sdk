import type { Type } from '@nestjs/common';
import type { RetryPolicy } from './http-retry';
import type { UpdateExecutorPort } from './update-executor';
import type { InstalledVersionProviderPort } from './update-ports';

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
  /**
   * Scratch space for update jobs (downloads, staging). One directory per
   * job, created and removed by the runner.
   */
  workDir?: string;
  /**
   * Ed25519 public key (PEM or base64-of-PEM) that release manifests are
   * verified against — the same key that signs license tokens.
   *
   * Required to apply an update. There is no "unsigned is acceptable" mode:
   * without a manifest there is nothing to check a downloaded artifact
   * against, so allowing it would not be a relaxed policy, it would be no
   * policy at all.
   */
  publicKeyPem?: string;
  /** Overrides for the retry/backoff defaults. */
  retry?: Partial<RetryPolicy>;
  /**
   * The product's implementation of the shell half of an update.
   *
   * Passed here rather than provided by the host's own module, because Nest
   * resolves a provider's dependencies within the module that *declares* it:
   * `UpdateRunner` lives in this module, so a token registered in the host's
   * module is invisible to it. A global module exports to others; it does not
   * receive from them.
   *
   * Omit it for a host that only wants to *detect* updates — `UpdateRunner`
   * then throws a clear error if anyone calls `run()`, rather than failing DI
   * at boot.
   */
  executor?: Type<UpdateExecutorPort>;
  /**
   * Where the host keeps its real installed state, re-read on every
   * heartbeat. Passed here for the same reason as `executor`:
   * `UpdateClientService` is declared in this module, so a token the host
   * registers in its own module never reaches it.
   *
   * Omit it and heartbeats fall back to the static `currentVersion` — which
   * is the version baked in at *build* time, so after an update the host
   * would keep reporting the version it shipped with.
   */
  installedVersionProvider?: Type<InstalledVersionProviderPort>;
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
