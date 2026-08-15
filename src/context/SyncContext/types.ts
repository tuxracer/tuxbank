import type { SignInConflict } from "@/lib/sync";

export type SyncStatus =
  | "off"
  | "locked"
  | "choice"
  | "syncing"
  | "synced"
  | "error"
  | "offline";

/** Result of a password change/recovery: done, needs an emailed code, or failed. */
export type PwResult = "done" | "reauth" | "error";

/** Which side wins when a first sync finds data on both. */
export type SignInChoice = "merge" | "local" | "remote";

/** Which onboarding step the dialog should show, if any. */
export type OnboardStep =
  | "idle"
  | "confirm-email"
  | "create-totp"
  | "create-recovery"
  | "signin-totp"
  | "signin-choice";

export interface SyncContextValue {
  status: SyncStatus;
  step: OnboardStep;
  email: string | null;
  enrollment: { qrCode: string; secret: string } | null;
  recoveryKey: string | null;
  lastSyncedAt: string | null;
  /** Unpushed local changes (rows + tombstones the next push would send). */
  pendingCount: number;
  /**
   * The unpushed count read fresh from storage. Callers that need it right
   * after awaiting a sync must use this: `pendingCount` still holds the
   * pre-sync value until the next render.
   */
  readPendingCount: () => Promise<number>;
  error: string | null;
  /** False when Supabase env is absent (sync cannot be used). */
  configured: boolean;
  createAccount: (email: string, password: string) => Promise<void>;
  /** Verify a TOTP code (enrollment or challenge); used by both flows. */
  confirmTotp: (code: string) => Promise<void>;
  finishCreate: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  /**
   * Build a device-link URL for the QR code. Unlocked only. Re-derives the
   * link secrets from the password and validates it by test-unwrapping the
   * account's wrapped DEK. Returns null and sets `error` on failure.
   */
  createDeviceLink: (password: string) => Promise<string | null>;
  /**
   * Re-wrap the data key under a new password. Returns "reauth" when Supabase
   * needs an emailed code (Secure password change); call again with the nonce.
   */
  changePassword: (newPassword: string, nonce?: string) => Promise<PwResult>;
  /** Recover a locked account with the recovery key and set a new password. */
  recoverWithKey: (
    recoveryKey: string,
    newPassword: string,
    nonce?: string,
  ) => Promise<PwResult>;
  /** Sign out; when `clearLocal` is true, also wipe local browser data. */
  signOut: (clearLocal?: boolean) => Promise<void>;
  /**
   * Delete the account: erase every synced row and the login itself, then sign
   * out. This device keeps its events, categories, and settings and returns to
   * local-only. Re-checks the password and a fresh TOTP code before destroying
   * anything. Returns false and sets `error` on failure, leaving the session
   * signed in so the user can retry.
   */
  deleteAccount: (password: string, code: string) => Promise<boolean>;
  /**
   * The guarded "Clear all data" reset. Signed in and unlocked it tombstones
   * every row and pushes, clearing the account on the server and every device.
   * Signed out or locked it wipes this device only (no tombstones, cursor and
   * cached key dropped), so a later sign-in never deletes the account's data.
   */
  resetAllData: () => Promise<void>;
  /**
   * Import a JSON backup, routed by sign-in state. Signed in and unlocked it
   * makes the backup the truth everywhere (re-stamped rows plus removal
   * tombstones, synced around the import). Signed out or locked it replaces
   * this device's data and drops the cursor so the next sign-in merges
   * cleanly without deleting anything from the account.
   */
  importData: (file: File) => Promise<void>;
  /** True when signed in with the data key in memory: actions reach the cloud. */
  unlocked: boolean;
  syncNow: () => Promise<void>;
  /**
   * Set when a first sync found events on this device and in the account.
   * The user must choose before anything syncs; null at every other time.
   */
  signInChoice: SignInConflict | null;
  /**
   * Answer the first-sync conflict prompt. "merge" keeps both sides,
   * "remote" deletes this device's data and pulls the account's, "local"
   * makes this device authoritative and deletes the account's other events
   * on every device.
   */
  resolveSignInChoice: (choice: SignInChoice) => Promise<void>;
}
