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

/** Abort a hung pull/push so a sync can never leave the UI stuck on "syncing". */
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;

/**
 * How far behind the stored watermark each pull starts. server_updated_at is
 * assigned by Postgres now() (transaction start), so a row from a transaction
 * that commits after we pulled can carry a stamp slightly below our watermark;
 * re-reading a small overlap closes that race, and re-applied rows are
 * idempotent no-ops.
 */
export const SYNC_PULL_LOOKBACK_MS = 30_000;

/** Page size for pulls; PostgREST caps un-ranged selects at 1000 rows. */
export const SYNC_PULL_PAGE_SIZE = 500;

/** The table the conflict check counts. Categories never trigger a prompt. */
export const EVENT_TABLE = STORE;
