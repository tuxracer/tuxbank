import {
  deriveKeys,
  generateDek,
  generateRecoveryKey,
  deriveRecoveryKek,
  wrapKey,
  unwrapKey,
  KDF_VERSION,
} from "@/lib/crypto";
import type { SealedBox } from "@/lib/crypto";
import { toBase64, fromBase64 } from "@/utils/base64";
import { supabase } from "@/lib/supabase";
import {
  AccountError,
  isKeyMaterial,
  type AccountErrorCode,
  type ActiveSession,
  type KeyMaterial,
  type ProvisionedKeys,
  type RewrappedKeys,
  type TotpEnrollment,
} from "./types";

export * from "./types";

const passwordBox = (material: KeyMaterial): SealedBox => ({
  nonce: fromBase64(material.wrapped_dek_nonce),
  ciphertext: fromBase64(material.wrapped_dek),
});

export const provisionAccountKeys = async (
  password: string,
  email: string,
): Promise<ProvisionedKeys> => {
  const { kek, authSecret } = await deriveKeys(password, email);
  const dek = await generateDek();
  const recoveryKey = await generateRecoveryKey();
  const recoveryKek = await deriveRecoveryKek(recoveryKey);
  const passwordWrap = await wrapKey(dek, kek);
  const recoveryWrap = await wrapKey(dek, recoveryKek);
  return {
    authSecret,
    dek,
    recoveryKey,
    keyMaterial: {
      wrapped_dek: toBase64(passwordWrap.ciphertext),
      wrapped_dek_nonce: toBase64(passwordWrap.nonce),
      recovery_wrapped_dek: toBase64(recoveryWrap.ciphertext),
      recovery_nonce: toBase64(recoveryWrap.nonce),
      kdf_version: KDF_VERSION,
    },
  };
};

/** The staged previous-password wrap, when a password change is in flight. */
const prevPasswordBox = (material: KeyMaterial): SealedBox | null =>
  material.wrapped_dek_prev && material.wrapped_dek_prev_nonce
    ? {
        nonce: fromBase64(material.wrapped_dek_prev_nonce),
        ciphertext: fromBase64(material.wrapped_dek_prev),
      }
    : null;

/**
 * Unwrap the DEK with an already-derived KEK (device-link sign-in). Falls
 * back to the staged previous-password wrap: mid-password-change, the auth
 * password and the primary wrap can briefly disagree, and the KEK that signed
 * in must still open one of the two.
 */
export const unlockWithKek = async (
  kek: Uint8Array,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  try {
    return await unwrapKey(passwordBox(material), kek);
  } catch (primaryError) {
    const prev = prevPasswordBox(material);
    if (!prev) throw primaryError;
    return unwrapKey(prev, kek);
  }
};

export const unlockWithPassword = async (
  password: string,
  email: string,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  const { kek } = await deriveKeys(password, email);
  return unlockWithKek(kek, material);
};

const recoveryBox = (material: KeyMaterial): SealedBox => ({
  nonce: fromBase64(material.recovery_nonce),
  ciphertext: fromBase64(material.recovery_wrapped_dek),
});

export const unlockWithRecoveryKey = async (
  recoveryKey: string,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  const recoveryKek = await deriveRecoveryKek(recoveryKey);
  return unwrapKey(recoveryBox(material), recoveryKek);
};

export const rewrapForNewPassword = async (
  newPassword: string,
  email: string,
  dek: Uint8Array,
): Promise<RewrappedKeys> => {
  const { kek, authSecret } = await deriveKeys(newPassword, email);
  const wrap = await wrapKey(dek, kek);
  return {
    authSecret,
    wrapped_dek: toBase64(wrap.ciphertext),
    wrapped_dek_nonce: toBase64(wrap.nonce),
  };
};

const client = () => {
  if (!supabase) throw new AccountError("NOT_CONFIGURED");
  return supabase;
};

/** Returns true when Supabase issued a session (email confirmation is off). */
export const signUp = async (
  email: string,
  authSecret: string,
): Promise<boolean> => {
  const { data, error } = await client().auth.signUp({
    email,
    password: authSecret,
  });
  if (error) throw new AccountError("SIGNUP_FAILED", error);
  return data.session !== null;
};

export const signIn = async (
  email: string,
  authSecret: string,
): Promise<void> => {
  const { error } = await client().auth.signInWithPassword({
    email,
    password: authSecret,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      throw new AccountError("EMAIL_NOT_CONFIRMED", error);
    }
    throw new AccountError("SIGNIN_FAILED", error);
  }
};

export const enrollTotp = async (): Promise<TotpEnrollment> => {
  const { data, error } = await client().auth.mfa.enroll({
    factorType: "totp",
  });
  if (error || !data) throw new AccountError("MFA_ENROLL_FAILED", error);
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
};

export const verifyTotp = async (
  factorId: string,
  code: string,
): Promise<void> => {
  const { error } = await client().auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  if (error) throw new AccountError("MFA_VERIFY_FAILED", error);
};

export const getTotpFactorId = async (): Promise<string | null> => {
  const { data, error } = await client().auth.mfa.listFactors();
  if (error) throw new AccountError("MFA_VERIFY_FAILED", error);
  return data.totp[0]?.id ?? null;
};

export const signOut = async (): Promise<void> => {
  await client().auth.signOut();
};

export const getActiveSession = async (): Promise<ActiveSession | null> => {
  const {
    data: { session },
  } = await client().auth.getSession();
  const email = session?.user.email;
  if (!email) return null;
  const { data } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  return { email, aal2: data?.currentLevel === "aal2" };
};

export const uploadKeyMaterial = async (
  material: KeyMaterial,
): Promise<void> => {
  const { error } = await client().from("key_material").insert(material);
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
};

export const fetchKeyMaterial = async (): Promise<KeyMaterial> => {
  const { data, error } = await client()
    .from("key_material")
    .select("*")
    .maybeSingle();
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
  if (!isKeyMaterial(data)) throw new AccountError("NO_KEY_MATERIAL");
  return data;
};

/**
 * Set the Supabase auth password (to a new derived auth secret). When "Secure
 * password change" is enabled, Supabase requires a reauthentication `nonce`
 * (a code emailed via requestReauthentication); without one it throws
 * REAUTH_REQUIRED so the caller can prompt for the code and retry.
 */
export const updateAuthPassword = async (
  authSecret: string,
  nonce?: string,
): Promise<void> => {
  const { error } = await client().auth.updateUser(
    nonce ? { password: authSecret, nonce } : { password: authSecret },
  );
  if (!error) return;
  const reauthNeeded =
    error.code === "reauthentication_needed" ||
    /reauthentication|nonce/i.test(error.message);
  if (!nonce && reauthNeeded) throw new AccountError("REAUTH_REQUIRED", error);
  throw new AccountError("PASSWORD_CHANGE_FAILED", error);
};

/** Email the user a reauthentication code (for Secure password change). */
export const requestReauthentication = async (): Promise<void> => {
  const { error } = await client().auth.reauthenticate();
  if (error) throw new AccountError("PASSWORD_CHANGE_FAILED", error);
};

// The signed-in user's id. Takes the code to throw with, so a missing session
// is reported in terms of the flow that hit it rather than always as a failed
// password change.
const currentUserId = async (
  onMissing: AccountErrorCode = "PASSWORD_CHANGE_FAILED",
): Promise<string> => {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new AccountError(onMissing);
  return user.id;
};

/**
 * Stage a password rewrap: install the new password's wrap as primary while
 * keeping a wrap for the still-active auth password in the prev columns. Runs
 * BEFORE the auth password flips, so whichever password the account ends up
 * accepting, one of the two wraps opens under it — a failure between the two
 * steps can never lock every device out (the recovery columns are untouched
 * either way). If a previous change already staged a prev wrap (auth never
 * flipped), that wrap still matches the active auth password and is kept.
 * clearPreviousPasswordWrap() retires it once the auth change succeeds.
 */
export const stagePasswordRewrap = async (
  rewrapped: RewrappedKeys,
): Promise<void> => {
  const userId = await currentUserId();
  const current = await fetchKeyMaterial();
  const keepStagedPrev = Boolean(
    current.wrapped_dek_prev && current.wrapped_dek_prev_nonce,
  );
  const { error } = await client()
    .from("key_material")
    .update({
      wrapped_dek: rewrapped.wrapped_dek,
      wrapped_dek_nonce: rewrapped.wrapped_dek_nonce,
      ...(keepStagedPrev
        ? {}
        : {
            wrapped_dek_prev: current.wrapped_dek,
            wrapped_dek_prev_nonce: current.wrapped_dek_nonce,
          }),
    })
    .eq("user_id", userId);
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
};

/**
 * Delete the account's wrapped keys. Part of account deletion, and ordered
 * before it: with the key material gone the ciphertext left behind by any
 * failure is unreadable by anyone, us included.
 */
export const deleteKeyMaterial = async (): Promise<void> => {
  const userId = await currentUserId("ACCOUNT_DELETE_FAILED");
  const { error } = await client()
    .from("key_material")
    .delete()
    .eq("user_id", userId);
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
};

/**
 * Delete the login itself, through the `delete_account` RPC (migration 0005).
 * auth.users is not writable with the publishable key, so this is the only way
 * to free the email address; the row's cascade also sweeps up any data row a
 * preceding purge missed.
 */
export const deleteAuthUser = async (): Promise<void> => {
  const { error } = await client().rpc("delete_account");
  if (error) throw new AccountError("ACCOUNT_DELETE_FAILED", error);
};

/** Drop the staged previous-password wrap after a successful auth flip. */
export const clearPreviousPasswordWrap = async (): Promise<void> => {
  const userId = await currentUserId();
  const { error } = await client()
    .from("key_material")
    .update({ wrapped_dek_prev: null, wrapped_dek_prev_nonce: null })
    .eq("user_id", userId);
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
};
