import { encryptPayload, decryptPayload } from "@/lib/crypto";
import { sealedBoxToRow, rowToSealedBox, supabase } from "@/lib/supabase";
import {
  getAllEvents,
  getAllCategories,
  getTombstones,
  getSyncCursor,
  setSyncCursor,
  putEvent,
  putCategory,
  applyRemoteDelete,
} from "@/lib/storage";
import { isCalendarEvent, isCategory } from "@/types";
import type { CalendarEvent, Category } from "@/types";
import { EPOCH_CURSOR, SYNC_TABLES } from "./consts";
import { isRemoteRow, SyncError } from "./types";
import type { RemoteRow, SyncRemote, SyncResult } from "./types";

export * from "./consts";
export * from "./types";

/** A remote row counts as newer only when strictly greater (so equal = skip). */
export const isRemoteNewer = (
  remoteUpdatedAt: string,
  localUpdatedAt: string | undefined,
): boolean => localUpdatedAt === undefined || remoteUpdatedAt > localUpdatedAt;

export const encryptRecord = async (
  record: CalendarEvent | Category,
  dek: Uint8Array,
): Promise<RemoteRow> => {
  const box = await encryptPayload(record, dek);
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
): Promise<RemoteRow> => {
  const box = await encryptPayload({}, dek);
  return { id, updated_at: updatedAt, deleted: true, ...sealedBoxToRow(box) };
};

export const decryptRow = async (
  row: RemoteRow,
  dek: Uint8Array,
): Promise<unknown> => decryptPayload(rowToSealedBox(row), dek);

export const runSync = async (
  dek: Uint8Array,
  remote: SyncRemote,
): Promise<SyncResult> => {
  // No stored cursor means this account has never synced, so every local row
  // must be uploaded regardless of its timestamp. Relying on `updatedAt >
  // startCursor` alone would skip rows stamped at EPOCH_CURSOR (the value the
  // v2 migration backfills as LEGACY_UPDATED_AT), which is why such rows
  // (typically never-edited categories) never reached the cloud.
  const storedCursor = await getSyncCursor();
  const firstSync = storedCursor === undefined;
  const startCursor = storedCursor ?? EPOCH_CURSOR;
  let maxCursor = startCursor;
  let pulled = 0;
  let pushed = 0;

  for (const { table, type } of SYNC_TABLES) {
    const localRecords: (CalendarEvent | Category)[] =
      type === "event" ? await getAllEvents() : await getAllCategories();
    const localById = new Map(
      localRecords.map((record) => [record.id, record]),
    );
    const tombstones = (await getTombstones()).filter((t) => t.type === type);
    const tombById = new Map(tombstones.map((t) => [t.id, t]));

    // Pull: apply remote rows that are newer than our local copy.
    const remoteRows = await remote.pull(table, startCursor);
    const pulledIds = new Set<string>();
    for (const row of remoteRows) {
      const localUpdatedAt =
        localById.get(row.id)?.updatedAt ?? tombById.get(row.id)?.updatedAt;
      if (!isRemoteNewer(row.updated_at, localUpdatedAt)) continue;
      if (row.deleted) {
        await applyRemoteDelete(row.id, type);
      } else {
        const record = await decryptRow(row, dek);
        if (type === "event") {
          if (!isCalendarEvent(record)) throw new SyncError("DECRYPT_INVALID");
          await putEvent(record);
        } else {
          if (!isCategory(record)) throw new SyncError("DECRYPT_INVALID");
          await putCategory(record);
        }
      }
      pulledIds.add(row.id);
      pulled += 1;
      if (row.updated_at > maxCursor) maxCursor = row.updated_at;
    }

    // Push: on the first sync every local row; otherwise rows and tombstones
    // newer than the cursor. Either way skip anything we just pulled.
    const pushRows: RemoteRow[] = [];
    for (const record of localRecords) {
      if (
        (firstSync || record.updatedAt > startCursor) &&
        !pulledIds.has(record.id)
      ) {
        pushRows.push(await encryptRecord(record, dek));
        if (record.updatedAt > maxCursor) maxCursor = record.updatedAt;
      }
    }
    for (const tombstone of tombstones) {
      if (
        (firstSync || tombstone.updatedAt > startCursor) &&
        !pulledIds.has(tombstone.id)
      ) {
        pushRows.push(
          await encryptTombstone(tombstone.id, tombstone.updatedAt, dek),
        );
        if (tombstone.updatedAt > maxCursor) maxCursor = tombstone.updatedAt;
      }
    }
    if (pushRows.length > 0) {
      await remote.push(table, pushRows);
      pushed += pushRows.length;
    }
  }

  // Always persist a cursor after the first sync (even if nothing advanced
  // maxCursor past the epoch) so later syncs are incremental rather than
  // re-pushing every row each time.
  if (firstSync || maxCursor !== startCursor) await setSyncCursor(maxCursor);
  return { pulled, pushed, cursor: maxCursor };
};

export const createSupabaseRemote = (): SyncRemote | null => {
  if (!supabase) return null;
  const client = supabase;
  return {
    pull: async (table, since) => {
      const { data, error } = await client
        .from(table)
        .select("*")
        .gt("updated_at", since);
      if (error) throw new SyncError("REMOTE_FAILED", error);
      return (data ?? []).filter(isRemoteRow);
    },
    push: async (table, rows) => {
      const { error } = await client.from(table).upsert(rows);
      if (error) throw new SyncError("REMOTE_FAILED", error);
    },
  };
};
