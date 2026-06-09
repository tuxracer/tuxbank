import { CATEGORY_STORE, STORE } from "@/lib/storage";
import type { TombstoneType } from "@/lib/storage";

/** Default cursor before the first sync. */
export const EPOCH_CURSOR = "1970-01-01T00:00:00.000Z";

/**
 * The record types to sync. `table` is the Supabase table name (identical to
 * the local IndexedDB store name); `type` tags tombstones and local routing.
 */
export const SYNC_TABLES: readonly { table: string; type: TombstoneType }[] = [
  { table: STORE, type: "event" },
  { table: CATEGORY_STORE, type: "category" },
];
