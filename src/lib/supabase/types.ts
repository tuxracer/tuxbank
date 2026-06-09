import type { SealedBox } from "@/lib/crypto";

/** The base64 text representation of a SealedBox as stored in the row columns. */
export interface SealedRow {
  nonce: string;
  ciphertext: string;
}

export type { SealedBox };
