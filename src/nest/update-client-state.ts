export type UpdateClientReason =
  | 'no_license_key'
  | 'unauthorized'
  | 'authority_unreachable';

export interface UpdateClientState {
  /** True once at least one update check has ever succeeded. */
  checked: boolean;
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  /** The target release's id — needed to later call `.../updates/:releaseId/start`. */
  latestReleaseId: string | null;
  /** Why the *last* check failed, if it did; a transient failure keeps the previous good numbers rather than resetting them. */
  reason: UpdateClientReason | null;
  lastCheckedAt: string | null;
}
