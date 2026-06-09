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
import type { KeyMaterial, ProvisionedKeys } from "./types";

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
