import sodium from "libsodium-wrappers-sumo";
import {
  AUTH_CONTEXT,
  KDF_MEMLIMIT,
  KDF_OPSLIMIT,
  KEK_CONTEXT,
  KEY_BYTES,
  RECOVERY_KEY_BYTES,
} from "./consts";
import type { DerivedKeys, SealedBox } from "./types";

export * from "./consts";
export * from "./types";

/** Resolve once `libsodium` has finished initializing, then reuse the instance. */
let sodiumPromise: Promise<typeof sodium> | null = null;
const getSodium = async (): Promise<typeof sodium> => {
  if (!sodiumPromise) {
    sodiumPromise = sodium.ready.then(() => sodium);
  }
  return sodiumPromise;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** A deterministic 16-byte Argon2id salt from a context label plus the email. */
const saltFor = (
  s: typeof sodium,
  context: string,
  email: string,
): Uint8Array =>
  s.crypto_generichash(
    s.crypto_pwhash_SALTBYTES,
    context + normalizeEmail(email),
    null,
  );

const argon2id = (
  s: typeof sodium,
  password: string,
  salt: Uint8Array,
): Uint8Array =>
  s.crypto_pwhash(
    KEY_BYTES,
    password,
    salt,
    KDF_OPSLIMIT,
    KDF_MEMLIMIT,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );

const seal = (
  s: typeof sodium,
  message: Uint8Array | string,
  key: Uint8Array,
): SealedBox => {
  const nonce = s.randombytes_buf(
    s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    null,
    null,
    nonce,
    key,
  );
  return { nonce, ciphertext };
};

const open = (s: typeof sodium, box: SealedBox, key: Uint8Array): Uint8Array =>
  s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    box.ciphertext,
    null,
    box.nonce,
    key,
  );

export const encryptPayload = async (
  value: unknown,
  dek: Uint8Array,
): Promise<SealedBox> => {
  const s = await getSodium();
  return seal(s, JSON.stringify(value), dek);
};

export const decryptPayload = async (
  box: SealedBox,
  dek: Uint8Array,
): Promise<unknown> => {
  const s = await getSodium();
  return JSON.parse(s.to_string(open(s, box, dek)));
};

export const generateDek = async (): Promise<Uint8Array> => {
  const s = await getSodium();
  return s.randombytes_buf(KEY_BYTES);
};

export const wrapKey = async (
  key: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<SealedBox> => {
  const s = await getSodium();
  return seal(s, key, wrappingKey);
};

export const unwrapKey = async (
  box: SealedBox,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> => {
  const s = await getSodium();
  return open(s, box, wrappingKey);
};

export const generateRecoveryKey = async (): Promise<string> => {
  const s = await getSodium();
  const bytes = s.randombytes_buf(RECOVERY_KEY_BYTES);
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
};

export const deriveRecoveryKek = async (
  recoveryKey: string,
): Promise<Uint8Array> => {
  const s = await getSodium();
  // The recovery key is already high-entropy, so a fast hash (not Argon2id) is
  // sufficient to stretch it to a 32-byte wrapping key.
  return s.crypto_generichash(KEY_BYTES, recoveryKey, null);
};

export const deriveKeys = async (
  password: string,
  email: string,
): Promise<DerivedKeys> => {
  const s = await getSodium();
  const kek = argon2id(s, password, saltFor(s, KEK_CONTEXT, email));
  const authMaterial = argon2id(s, password, saltFor(s, AUTH_CONTEXT, email));
  return { kek, authSecret: s.to_base64(authMaterial) };
};
