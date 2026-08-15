import { isPlainObject } from "remeda";
import { encryptPayload, decryptPayload } from "@/lib/crypto";
import { sealedBoxToRow, rowToSealedBox, supabase } from "@/lib/supabase";
import {
  applyRemoteChanges,
  clearOutboxEntries,
  getAllEvents,
  getAllCategories,
  getOutboxEntries,
  getTombstones,
  getSyncCursor,
  hasEverSynced,
  setSyncCursor,
} from "@/lib/storage";
import type { OutboxEntry, Tombstone } from "@/lib/storage";
import { isCalendarEvent, isCategory } from "@/types";
import type { CalendarEvent, Category } from "@/types";
import {
  EPOCH_CURSOR,
  EVENT_TABLE,
  SYNC_PULL_LOOKBACK_MS,
  SYNC_PULL_PAGE_SIZE,
  SYNC_TABLES,
  SYNC_REQUEST_TIMEOUT_MS,
} from "./consts";
import { isRemoteRow, SyncError } from "./types";
import type {
  PushRow,
  RemoteRow,
  SyncRemote,
  SyncResult,
  SignInConflict,
} from "./types";

export * from "./consts";
export * from "./types";

/**
 * How many local changes the next push would send: before the first sync
 * every row and tombstone counts; afterwards exactly the outbox (every local
 * write enqueues an entry, every successful push clears it). Storage reads
 * only, so it works offline.
 */
export const countPendingChanges = async (): Promise<number> => {
  if (!(await hasEverSynced())) {
    const [events, categories, tombstones] = await Promise.all([
      getAllEvents(),
      getAllCategories(),
      getTombstones(),
    ]);
    return events.length + categories.length + tombstones.length;
  }
  return (await getOutboxEntries()).length;
};

/**
 * Whether a first sync would silently merge two populated sides. Returns the
 * two event counts when this device has never synced the account and both
 * sides hold events, otherwise null. Short-circuits on the has-synced check,
 * so the account is queried at most once per device (until the cursor is
 * cleared again, e.g. by a sign-out that wipes local data).
 */
export const detectSignInConflict = async (
  remote: SyncRemote,
): Promise<SignInConflict | null> => {
  if (await hasEverSynced()) return null;
  const local = (await getAllEvents()).length;
  if (local === 0) return null;
  const remoteCount = await remote.count(EVENT_TABLE);
  if (remoteCount === 0) return null;
  return { local, remote: remoteCount };
};

/**
 * The AEAD additional data binding a row's plaintext metadata to its
 * ciphertext. The server stores this metadata in the clear (it routes sync),
 * so without the binding a malicious or compromised backend could replay an
 * old ciphertext under a bumped timestamp, relabel a row under another id or
 * table, or flip `deleted` to fabricate a deletion. With it, any such edit
 * fails decryption on every device.
 */
const rowAd = (
  table: string,
  id: string,
  updatedAt: string,
  deleted: boolean,
): string => `tuxbank:${table}:${id}:${updatedAt}:${deleted ? "1" : "0"}`;

export const encryptRecord = async (
  record: CalendarEvent | Category,
  dek: Uint8Array,
  table: string,
): Promise<PushRow> => {
  const ad = rowAd(table, record.id, record.updatedAt, false);
  const box = await encryptPayload(record, dek, ad);
  return {
    id: record.id,
    updated_at: record.updatedAt,
    deleted: false,
    ...sealedBoxToRow(box),
  };
};

export const encryptTombstone = async (
  id: string,
  updatedAt: string,
  dek: Uint8Array,
  table: string,
): Promise<PushRow> => {
  const box = await encryptPayload({}, dek, rowAd(table, id, updatedAt, true));
  return { id, updated_at: updatedAt, deleted: true, ...sealedBoxToRow(box) };
};

/**
 * Decrypt and authenticate a pulled row (deleted rows included: a tombstone's
 * `{}` payload exists exactly so its metadata can be verified). Falls back to
 * a metadata-free decrypt for rows uploaded before the additional-data
 * binding existed; every sync re-uploads rows it pushes with the binding, so
 * the legacy surface only shrinks.
 */
export const decryptRow = async (
  row: PushRow,
  dek: Uint8Array,
  table: string,
): Promise<unknown> => {
  const box = rowToSealedBox(row);
  try {
    return await decryptPayload(
      box,
      dek,
      rowAd(table, row.id, row.updated_at, row.deleted),
    );
  } catch (withAdError) {
    try {
      return await decryptPayload(box, dek);
    } catch {
      throw withAdError;
    }
  }
};

/** JSON with recursively sorted keys, for content (not identity) comparison. */
const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(sortKeysDeep(value));

/**
 * Where a pull starts: a small overlap behind the stored watermark (see
 * SYNC_PULL_LOOKBACK_MS), or the epoch when this device has no watermark yet.
 */
const pullSince = (cursor: string | undefined): string => {
  if (cursor === undefined) return EPOCH_CURSOR;
  const ms = Date.parse(cursor);
  if (Number.isNaN(ms)) return EPOCH_CURSOR;
  return new Date(Math.max(0, ms - SYNC_PULL_LOOKBACK_MS)).toISOString();
};

/**
 * One full sync: per table, pull every row uploaded since the stored server
 * watermark and apply the last-write-wins merge, then push this device's
 * pending changes (the outbox; on a first sync, everything).
 *
 * Merge rules per pulled row, by client updated_at: a strictly newer local
 * copy wins (its outbox entry pushes it right after); otherwise the remote
 * copy is applied — on an exact tie the server copy wins so devices converge
 * deterministically, except that a byte-identical echo of this device's own
 * push is skipped. A row that fails to decrypt or validate is skipped and
 * counted, never fatal: the cursor still advances, so one poison row cannot
 * brick the account (it is retried when the row is next re-uploaded).
 */
export const runSync = async (
  dek: Uint8Array,
  remote: SyncRemote,
): Promise<SyncResult> => {
  const storedCursor = await getSyncCursor();
  // Never synced (under either cursor generation): push every local row and
  // tombstone regardless of the outbox, so old backups, pre-outbox data, and
  // legacy-cursor clients all reach the cloud (re-encrypted with the current
  // metadata binding).
  const firstSync = !(await hasEverSynced());
  let cursor = storedCursor;
  let pulled = 0;
  let pushed = 0;
  let skipped = 0;
  const outbox = await getOutboxEntries();

  for (const { table, type } of SYNC_TABLES) {
    const localRecords: (CalendarEvent | Category)[] =
      type === "event" ? await getAllEvents() : await getAllCategories();
    const localById = new Map(
      localRecords.map((record) => [record.id, record]),
    );
    const tombstones = (await getTombstones()).filter((t) => t.type === type);
    const tombById = new Map(tombstones.map((t) => [t.id, t]));

    // Pull: decide each remote row's fate, then apply the batch in one
    // transaction (and one cross-tab notification).
    const remoteRows = await remote.pull(table, pullSince(storedCursor));
    const puts: (CalendarEvent | Category)[] = [];
    const deleteIds: string[] = [];
    const pulledIds = new Set<string>();
    for (const row of remoteRows) {
      if (cursor === undefined || row.server_updated_at > cursor) {
        cursor = row.server_updated_at;
      }
      try {
        const localUpdatedAt =
          localById.get(row.id)?.updatedAt ?? tombById.get(row.id)?.updatedAt;
        if (localUpdatedAt !== undefined && row.updated_at < localUpdatedAt) {
          continue; // local copy is strictly newer; the push below sends it
        }
        const record = await decryptRow(row, dek, table);
        if (row.deleted) {
          if (localById.has(row.id)) {
            deleteIds.push(row.id);
            pulledIds.add(row.id);
            pulled += 1;
          }
          continue;
        }
        const guard = type === "event" ? isCalendarEvent : isCategory;
        if (!guard(record)) throw new SyncError("DECRYPT_INVALID");
        const local = localById.get(row.id);
        if (
          local !== undefined &&
          row.updated_at === local.updatedAt &&
          stableStringify(local) === stableStringify(record)
        ) {
          continue; // identical echo of our own earlier push
        }
        puts.push(record);
        pulledIds.add(row.id);
        pulled += 1;
      } catch (caught) {
        skipped += 1;
        console.warn(`sync: skipped undecryptable ${table} row`, caught);
      }
    }
    await applyRemoteChanges(type, puts, deleteIds);

    // Push. Clearing an outbox entry is conditional on the updatedAt actually
    // pushed, so an edit landing mid-sync keeps its entry for the next sync.
    const pushRows: PushRow[] = [];
    const clearable: OutboxEntry[] = [];
    const pushRecord = async (record: CalendarEvent | Category) => {
      pushRows.push(await encryptRecord(record, dek, table));
    };
    const pushTombstone = async (t: Tombstone) => {
      pushRows.push(await encryptTombstone(t.id, t.updatedAt, dek, table));
    };
    if (firstSync) {
      for (const record of localRecords) {
        if (!pulledIds.has(record.id)) await pushRecord(record);
      }
      for (const t of tombstones) {
        if (!pulledIds.has(t.id)) await pushTombstone(t);
      }
      for (const entry of outbox) {
        if (entry.type !== type || pulledIds.has(entry.id)) continue;
        const stamp =
          localById.get(entry.id)?.updatedAt ??
          tombById.get(entry.id)?.updatedAt;
        if (stamp !== undefined) clearable.push({ ...entry, updatedAt: stamp });
      }
    } else {
      for (const entry of outbox) {
        if (entry.type !== type) continue;
        if (pulledIds.has(entry.id)) continue; // remote won; entry already gone
        const record = localById.get(entry.id);
        if (record !== undefined) {
          await pushRecord(record);
          clearable.push({ ...entry, updatedAt: record.updatedAt });
          continue;
        }
        const t = tombById.get(entry.id);
        if (t !== undefined) {
          await pushTombstone(t);
          clearable.push({ ...entry, updatedAt: t.updatedAt });
        }
        // Neither found: the row appeared after our snapshot; next sync sends it.
      }
    }
    if (pushRows.length > 0) {
      await remote.push(table, pushRows);
      pushed += pushRows.length;
    }
    await clearOutboxEntries(clearable);
  }

  // Persist the watermark; on a first sync against an empty account, persist
  // the epoch so later syncs are incremental and the conflict gate stays shut.
  if (cursor !== undefined) {
    if (cursor !== storedCursor) await setSyncCursor(cursor);
  } else if (firstSync) {
    cursor = EPOCH_CURSOR;
    await setSyncCursor(cursor);
  }
  return { pulled, pushed, skipped, cursor: cursor ?? EPOCH_CURSOR };
};

export const createSupabaseRemote = (): SyncRemote | null => {
  if (!supabase) return null;
  const client = supabase;
  return {
    // Keyed on the server-assigned upload stamp and paginated by offset:
    // ordering is ascending, and rows changing mid-pull only ever move to
    // later positions (their stamp bumps), so pages never skip a row.
    pull: async (table, since) => {
      const rows: RemoteRow[] = [];
      for (let offset = 0; ; offset += SYNC_PULL_PAGE_SIZE) {
        const { data, error } = await client
          .from(table)
          .select("*")
          .gt("server_updated_at", since)
          .order("server_updated_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + SYNC_PULL_PAGE_SIZE - 1)
          .abortSignal(AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS));
        if (error) throw new SyncError("REMOTE_FAILED", error);
        const page = data ?? [];
        rows.push(...page.filter(isRemoteRow));
        if (page.length < SYNC_PULL_PAGE_SIZE) return rows;
      }
    },
    push: async (table, rows) => {
      const { error } = await client
        .from(table)
        .upsert(rows)
        .abortSignal(AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS));
      if (error) throw new SyncError("REMOTE_FAILED", error);
    },
    count: async (table) => {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("deleted", false)
        .abortSignal(AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS));
      if (error) throw new SyncError("REMOTE_FAILED", error);
      return count ?? 0;
    },
  };
};
