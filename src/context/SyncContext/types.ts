export type SyncStatus = "off" | "locked" | "syncing" | "synced" | "error";

/** Which onboarding step the dialog should show, if any. */
export type OnboardStep =
  | "idle"
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
  confirmCreateTotp: (code: string) => Promise<void>;
  finishCreate: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  confirmSignInTotp: (code: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}
