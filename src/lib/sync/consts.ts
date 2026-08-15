import {
  CATEGORY_STORE,
  getAllCategories,
  getAllEvents,
  getAllSettings,
  isSettingRow,
  SETTINGS_STORE,
  STORE,
} from "@/lib/storage";
import type { SyncedRow, TombstoneType } from "@/lib/storage";
import { isCalendarEvent, isCategory } from "@/types";

/** Default cursor before the first sync. */
export const EPOCH_CURSOR = "1970-01-01T00:00:00.000Z";

/**
 * One synced collection. `table` is the Supabase table name (identical to the
 * local IndexedDB store name); `type` tags tombstones and local routing;
 * `readAll` and `guard` are the only places the merge loop needs to know which
 * kind of row it is holding, so adding a collection is adding an entry here.
 */
export interface SyncCollection {
  table: string;
  type: TombstoneType;
  readAll: () => Promise<SyncedRow[]>;
  guard: (value: unknown) => value is SyncedRow;
}

export const SYNC_TABLES: readonly SyncCollection[] = [
  {
    table: STORE,
    type: "event",
    readAll: getAllEvents,
    guard: isCalendarEvent,
  },
  {
    table: CATEGORY_STORE,
    type: "category",
    readAll: getAllCategories,
    guard: isCategory,
  },
  {
    table: SETTINGS_STORE,
    type: "setting",
    readAll: getAllSettings,
    guard: isSettingRow,
  },
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
