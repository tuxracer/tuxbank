/**
 * KDF parameters. Bump KDF_VERSION whenever ops/mem limits change so stored
 * key material can record which parameters produced it. These are tuned to be
 * expensive for an attacker but still acceptable on a phone browser.
 */
export const KDF_VERSION = 1;
export const KDF_OPSLIMIT = 3;
export const KDF_MEMLIMIT = 64 * 1_024 * 1_024; // 64 MiB

/** Domain-separation contexts so the KEK and the auth secret stay independent. */
export const KEK_CONTEXT = "tuxbank:kek:";
export const AUTH_CONTEXT = "tuxbank:auth:";

/** Byte lengths. */
export const KEY_BYTES = 32; // 256-bit symmetric keys (KEK, DEK)
export const RECOVERY_KEY_BYTES = 32; // 256-bit recovery key
