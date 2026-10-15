import type { PendingAction } from './update-ports';

export type UpdateClientReason =
  | 'no_license_key'
  | 'unauthorized'
  /** The CMS refused on policy grounds — usually a lapsed update entitlement. */
  | 'forbidden'
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
  /** Update entitlement cut-off reported by the CMS; null = unlimited. */
  updatesUntil: string | null;
  /** Release notes of `latestVersion` as published on the CMS, if any. */
  latestReleaseNotes: string | null;
  /** The vendor's latest instruction (update now), if any. */
  pendingAction: PendingAction | null;
  lastCheckedAt: string | null;
}
