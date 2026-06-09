import { isNumber, isPlainObject, isString } from "remeda";

/** Encrypted key material, mirroring the key_material table's base64 columns. */
export interface KeyMaterial {
  wrapped_dek: string;
  wrapped_dek_nonce: string;
  recovery_wrapped_dek: string;
  recovery_nonce: string;
  kdf_version: number;
}

export const isKeyMaterial = (value: unknown): value is KeyMaterial =>
  isPlainObject(value) &&
  isString(value.wrapped_dek) &&
  isString(value.wrapped_dek_nonce) &&
  isString(value.recovery_wrapped_dek) &&
  isString(value.recovery_nonce) &&
  isNumber(value.kdf_version);

/** Everything produced when a brand-new account's keys are provisioned. */
export interface ProvisionedKeys {
  /** The value handed to Supabase auth in place of the real password. */
  authSecret: string;
  /** The in-memory data key. Never persisted. */
  dek: Uint8Array;
  /** The one-time recovery key, shown to the user once. */
  recoveryKey: string;
  /** The encrypted material to upload to the key_material table. */
  keyMaterial: KeyMaterial;
}

/** The new auth secret and re-wrapped password columns after a password change. */
export interface RewrappedKeys {
  authSecret: string;
  wrapped_dek: string;
  wrapped_dek_nonce: string;
}

export type AccountErrorCode =
  | "NOT_CONFIGURED"
  | "SIGNUP_FAILED"
  | "SIGNIN_FAILED"
  | "EMAIL_NOT_CONFIRMED"
  | "MFA_ENROLL_FAILED"
  | "MFA_VERIFY_FAILED"
  | "NO_KEY_MATERIAL"
  | "KEY_MATERIAL_FAILED";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, cause?: unknown) {
    super(code);
    this.name = "AccountError";
    this.code = code;
    this.cause = cause;
  }
}

export const isAccountError = (error: unknown): error is AccountError =>
  error instanceof AccountError;

/** The TOTP enrollment material shown to the user during signup. */
export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** A summary of the current Supabase session. */
export interface ActiveSession {
  email: string;
  aal2: boolean;
}
