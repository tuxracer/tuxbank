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

export const unlockWithPassword = async (
  password: string,
  email: string,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  const { kek } = await deriveKeys(password, email);
  return unwrapKey(passwordBox(material), kek);
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

export const signUp = async (
  email: string,
  authSecret: string,
): Promise<void> => {
  const { error } = await client().auth.signUp({ email, password: authSecret });
  if (error) throw new AccountError("SIGNUP_FAILED", error);
};

export const signIn = async (
  email: string,
  authSecret: string,
): Promise<void> => {
  const { error } = await client().auth.signInWithPassword({
    email,
    password: authSecret,
  });
  if (error) throw new AccountError("SIGNIN_FAILED", error);
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
