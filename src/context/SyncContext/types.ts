export type SyncStatus = "off" | "locked" | "syncing" | "synced" | "error";

/** Result of a password change/recovery: done, needs an emailed code, or failed. */
export type PwResult = "done" | "reauth" | "error";

/** Which onboarding step the dialog should show, if any. */
export type OnboardStep =
  | "idle"
  | "confirm-email"
  | "create-totp"
  | "create-recovery"
  | "signin-totp";

export interface SyncContextValue {
  status: SyncStatus;
  step: OnboardStep;
  email: string | null;
  enrollment: { qrCode: string; secret: string } | null;
  recoveryKey: string | null;
  lastSyncedAt: string | null;
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
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}
