export { LicenseClientModule } from './license-client.module';
export { LicenseClientService } from './license-client.service';
export {
  LICENSE_CLIENT_OPTIONS,
  type LicenseClientModuleOptions,
} from './constants';
export type { LicenseClientReason, LicenseClientState } from './state';
export {
  LICENSE_AUTHORITY,
  TOKEN_CACHE,
  TOKEN_VERIFIER,
  LicenseAuthorityUnreachableError,
  type AuthorityVerifyResult,
  type LicenseAuthorityPort,
  type TokenCachePort,
  type TokenVerifierPort,
} from './ports';

export { UpdateClientModule } from './update-client.module';
export { UpdateClientService } from './update-client.service';
export { InstallationHeartbeat } from './installation-heartbeat';
export {
  UPDATE_CLIENT_OPTIONS,
  DEFAULT_INSTALLATION_STORE_PATH,
  DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  type UpdateClientModuleOptions,
} from './update-client-constants';
export {
  DEFAULT_RETRY_POLICY,
  withRetry,
  type RetryPolicy,
} from './http-retry';
// Exported so a host (the updater) can read the runtime-activated key, or
// swap in its own source (Vault, SSM) without forking the SDK.
export { DEFAULT_KEY_STORE_PATH } from './constants';
export { FileKeyStore, KEY_STORE, type KeyStorePort } from './key-store';
export { FileLicenseKeySource } from './file-license-key-source';
export { FileInstallationTokenStore } from './file-installation-token-store';
export type { UpdateClientReason, UpdateClientState } from './update-client-state';
export {
  INSTALLATION_AUTHORITY,
  INSTALLATION_TOKEN_STORE,
  INSTALLED_VERSION_PROVIDER,
  LICENSE_KEY_SOURCE,
  InstallationAuthorityUnreachableError,
  InstallationForbiddenError,
  InstallationNotFoundError,
  InstallationUnauthorizedError,
  UpdateConflictError,
  type AvailableUpdateResult,
  type DownloadComponentOptions,
  type DownloadedComponentFile,
  type HeartbeatInput,
  type InstallationAuthorityPort,
  type InstallationCredentials,
  type InstallationTokenStorePort,
  type InstalledVersionProviderPort,
  type LicenseKeySourcePort,
  type RegisterInstallationResult,
  type ReleaseComponentSnapshot,
  type ReportStepInput,
  type StartUpdateResult,
  type UpdateStepName,
  type UpdateStepOutcome,
} from './update-ports';
