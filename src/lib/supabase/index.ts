import { createClient } from "@supabase/supabase-js";
import type { SealedBox, SealedRow } from "./types";
import { toBase64, fromBase64 } from "@/utils/base64";

export * from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * The Supabase client, or null when env config is absent (e.g. local-only use
 * with no account configured). Callers treat null as "sync unavailable".
 */
export const supabase =
  url && publishableKey ? createClient(url, publishableKey) : null;

export const sealedBoxToRow = (box: SealedBox): SealedRow => ({
  nonce: toBase64(box.nonce),
  ciphertext: toBase64(box.ciphertext),
});

export const rowToSealedBox = (row: SealedRow): SealedBox => ({
  nonce: fromBase64(row.nonce),
  ciphertext: fromBase64(row.ciphertext),
});
