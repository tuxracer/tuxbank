import { openDB, deleteDB, type IDBPDatabase } from "idb";
import { isString } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory } from "@/types";
import {
  BACKUP_APP,
  BACKUP_SCHEMA_VERSION,
  CATEGORY_STORE,
  DB_NAME,
  DB_VERSION,
  DEK_KEY,
  DELETE_BLOCKED_TIMEOUT_MS,
  OUTBOX_STORE,
  SETTINGS_BACKUP_SCHEMA_VERSION,
  SETTINGS_STORE,
  STORE,
  SYNC_CURSOR_KEY,
  SYNC_META_STORE,
  SYNC_SERVER_CURSOR_KEY,
  TOMBSTONE_STORE,
} from "./consts";
import {
  isBackupFile,
  isOutboxEntry,
  isSettingRow,
  isTombstone,
  StorageError,
  type BackupFile,
  type ImportPreview,
  type OutboxEntry,
  type SettingRow,
  type SettingValue,
  type StorageErrorCode,
  type Tombstone,
  type TombstoneType,
} from "./types";
import { notifyDataChanged } from "@/lib/tabSync";

export * from "./consts";
export * from "./types";

const nowISO = (): string => new Date().toISOString();

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new StorageError("UNAVAILABLE"));
  }
  if (!dbPromise) {
    const opening = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORE, { keyPath: "id" });
          db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
          db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
          db.createObjectStore(SYNC_META_STORE);
        }
        if (oldVersion < 2) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: ["type", "id"] });
        }
        if (oldVersion < 3) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
        }
      },
      // Another tab is upgrading or deleting the database; close this tab's
      // connection so it can proceed (holding it open would block the other
      // tab forever). The next access reopens fresh.
      blocking() {
        void opening.then((db) => db.close()).catch(() => undefined);
        resetDbCache();
      },
    });
    dbPromise = opening.catch((cause) => {
      dbPromise = null;
      // The database exists but could not be opened — most often a version
      // mismatch (it was written by a newer, incompatible build) or corruption.
      // Distinct from UNAVAILABLE (no IndexedDB at all) because deleting and
      // recreating the database can recover from it.
      throw new StorageError("OPEN_FAILED", cause);
    });
  }
  return dbPromise;
};

/** Test-only: drop the cached connection so the next call reopens the DB. */
export const resetDbCache = (): void => {
  dbPromise = null;
};

const toStorageError = (
  error: unknown,
  code: StorageErrorCode,
): StorageError =>
  error instanceof StorageError ? error : new StorageError(code, error);

const toWriteError = (error: unknown): StorageError =>
  toStorageError(
    error,
    error instanceof DOMException && error.name === "QuotaExceededError"
      ? "QUOTA_EXCEEDED"
      : "WRITE_FAILED",
  );

export const getAllEvents = async (): Promise<CalendarEvent[]> => {
  try {
    const db = await getDb();
    const rows: unknown[] = await db.getAll(STORE);
    return rows.filter(isCalendarEvent);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

// The row-write exports share one transaction shape: a put replaces the row
// and drops any pending tombstone; a delete removes the row and records a
// tombstone so the deletion syncs.
const STORE_FOR: Record<TombstoneType, string> = {
  event: STORE,
  category: CATEGORY_STORE,
  setting: SETTINGS_STORE,
};

const storeFor = (type: TombstoneType): string => STORE_FOR[type];

/** Every row shape that syncs: keyed by `id` and stamped with `updatedAt`. */
export type SyncedRow = CalendarEvent | Category | SettingRow;

const putRow = async (type: TombstoneType, row: SyncedRow): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [storeFor(type), TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const entry: OutboxEntry = { id: row.id, type, updatedAt: row.updatedAt };
    await Promise.all([
      tx.objectStore(storeFor(type)).put(row),
      tx.objectStore(TOMBSTONE_STORE).delete(row.id),
      tx.objectStore(OUTBOX_STORE).put(entry),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

const deleteRow = async (type: TombstoneType, id: string): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [storeFor(type), TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const tombstone: Tombstone = { id, type, updatedAt: nowISO() };
    await Promise.all([
      tx.objectStore(storeFor(type)).delete(id),
      tx.objectStore(TOMBSTONE_STORE).put(tombstone),
      tx.objectStore(OUTBOX_STORE).put(tombstone satisfies OutboxEntry),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

export const putEvent = async (event: CalendarEvent): Promise<void> =>
  putRow("event", event);

export const deleteEvent = async (id: string): Promise<void> =>
  deleteRow("event", id);

/**
 * Apply several event writes atomically: put every event in `puts` and
 * tombstone-delete every id in `deleteIds`, all in one transaction. Paired
 * writes (a truncated series plus its replacement tail, an undo restoring a
 * snapshot) can therefore never partially commit — a failure rolls the whole
 * batch back. One change notification covers the batch.
 */
export const applyEventChanges = async (
  puts: readonly CalendarEvent[],
  deleteIds: readonly string[] = [],
): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const events = tx.objectStore(STORE);
    const tombstones = tx.objectStore(TOMBSTONE_STORE);
    const outbox = tx.objectStore(OUTBOX_STORE);
    const stamp = nowISO();
    await Promise.all([
      ...puts.flatMap((event) => {
        const entry: OutboxEntry = {
          id: event.id,
          type: "event",
          updatedAt: event.updatedAt,
        };
        return [
          events.put(event),
          tombstones.delete(event.id),
          outbox.put(entry),
        ];
      }),
      ...deleteIds.flatMap((id) => {
        const tombstone: Tombstone = { id, type: "event", updatedAt: stamp };
        return [
          events.delete(id),
          tombstones.put(tombstone),
          outbox.put(tombstone satisfies OutboxEntry),
        ];
      }),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const db = await getDb();
    const rows: unknown[] = await db.getAll(CATEGORY_STORE);
    return rows.filter(isCategory);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const putCategory = async (category: Category): Promise<void> =>
  putRow("category", category);

export const deleteCategory = async (id: string): Promise<void> =>
  deleteRow("category", id);

export const getAllSettings = async (): Promise<SettingRow[]> => {
  try {
    const db = await getDb();
    const rows: unknown[] = await db.getAll(SETTINGS_STORE);
    return rows.filter(isSettingRow);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

/**
 * Write one setting, stamping it now so it wins last-write-wins against the
 * copy every other device holds. Settings are never deleted: choosing
 * "automatic" stores a null value, which is a real choice that has to sync,
 * not the absence of one.
 */
export const putSetting = async (
  id: string,
  value: SettingValue,
): Promise<void> => putRow("setting", { id, value, updatedAt: nowISO() });

export const exportDatabase = async (): Promise<string> => {
  try {
    const [events, categories, settings] = await Promise.all([
      getAllEvents(),
      getAllCategories(),
      getAllSettings(),
    ]);
    const backup: BackupFile = {
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events,
      categories,
      settings,
    };
    return JSON.stringify(backup, null, 2);
  } catch (error) {
    throw toStorageError(error, "EXPORT_FAILED");
  }
};

export const getTombstones = async (): Promise<Tombstone[]> => {
  try {
    const db = await getDb();
    const rows: unknown[] = await db.getAll(TOMBSTONE_STORE);
    return rows.filter(isTombstone);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const getSyncCursor = async (): Promise<string | undefined> => {
  try {
    const db = await getDb();
    const value: unknown = await db.get(
      SYNC_META_STORE,
      SYNC_SERVER_CURSOR_KEY,
    );
    return isString(value) ? value : undefined;
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const setSyncCursor = async (value: string): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(SYNC_META_STORE, "readwrite");
    // The legacy client-timestamp cursor is a different domain; retire it the
    // first time a server watermark is written.
    await Promise.all([
      tx.store.put(value, SYNC_SERVER_CURSOR_KEY),
      tx.store.delete(SYNC_CURSOR_KEY),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
};

/**
 * Whether this device has ever completed a sync against the account, under
 * either cursor generation. Gates first-sync semantics (push everything) and
 * the sign-in conflict prompt, so a client upgraded from the legacy cursor is
 * not mistaken for a brand-new sign-in.
 */
export const hasEverSynced = async (): Promise<boolean> => {
  try {
    const db = await getDb();
    const [server, legacy]: unknown[] = await Promise.all([
      db.get(SYNC_META_STORE, SYNC_SERVER_CURSOR_KEY),
      db.get(SYNC_META_STORE, SYNC_CURSOR_KEY),
    ]);
    return isString(server) || isString(legacy);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const getOutboxEntries = async (): Promise<OutboxEntry[]> => {
  try {
    const db = await getDb();
    const rows: unknown[] = await db.getAll(OUTBOX_STORE);
    return rows.filter(isOutboxEntry);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

/**
 * Remove outbox entries whose change was pushed. Conditional per entry: one
 * whose stored updatedAt no longer matches was re-dirtied by a concurrent
 * local edit mid-sync and must survive for the next push.
 */
export const clearOutboxEntries = async (
  entries: readonly OutboxEntry[],
): Promise<void> => {
  if (entries.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    await Promise.all(
      entries.map(async (entry) => {
        const stored: unknown = await tx.store.get([entry.type, entry.id]);
        if (isOutboxEntry(stored) && stored.updatedAt === entry.updatedAt) {
          await tx.store.delete([entry.type, entry.id]);
        }
      }),
    );
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
};

/**
 * Read the cached data-encryption key (DEK), if one was stored on this device.
 * Returns undefined when nothing was cached (or the cached value is not raw
 * bytes). Used to resume a signed-in account unlocked after a reload instead of
 * re-prompting for the password.
 */
export const getStoredDek = async (): Promise<Uint8Array | undefined> => {
  try {
    const db = await getDb();
    const value: unknown = await db.get(SYNC_META_STORE, DEK_KEY);
    if (value instanceof Uint8Array) return value;
    // A typed array round-tripped through IndexedDB can come back as a view
    // from another realm (notably fake-indexeddb in tests), which fails the
    // `instanceof` check above; rebuild a Uint8Array from its bytes.
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return undefined;
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

/** Cache the data-encryption key so the account stays unlocked across reloads. */
export const setStoredDek = async (dek: Uint8Array): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(SYNC_META_STORE, dek, DEK_KEY);
  } catch (error) {
    throw toWriteError(error);
  }
};

/** Drop the cached data-encryption key (on sign-out) so the next load re-locks. */
export const clearStoredDek = async (): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(SYNC_META_STORE, DEK_KEY);
  } catch (error) {
    throw toWriteError(error);
  }
};

/**
 * Apply one table's pulled sync changes in a single transaction: put every
 * remote-won row, remove every remotely-deleted row, and drop the matching
 * tombstones and outbox entries (a remote-applied write is not a pending
 * local change). One change notification covers the whole batch, so a large
 * pull costs one transaction and one cross-tab refresh instead of one per row.
 */
export const applyRemoteChanges = async (
  type: TombstoneType,
  puts: readonly SyncedRow[],
  deleteIds: readonly string[] = [],
): Promise<void> => {
  if (puts.length === 0 && deleteIds.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(
      [storeFor(type), TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const store = tx.objectStore(storeFor(type));
    const tombstones = tx.objectStore(TOMBSTONE_STORE);
    const outbox = tx.objectStore(OUTBOX_STORE);
    await Promise.all([
      ...puts.flatMap((row) => [
        store.put(row),
        tombstones.delete(row.id),
        outbox.delete([type, row.id]),
      ]),
      ...deleteIds.flatMap((id) => [
        store.delete(id),
        tombstones.delete(id),
        outbox.delete([type, id]),
      ]),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

/**
 * A parsed backup with the fields a v1 file omits filled in, plus whether the
 * file is new enough to be making a statement about settings at all.
 */
type ParsedBackup = BackupFile & {
  settings: SettingRow[];
  carriesSettings: boolean;
};

const parseBackup = (text: string): ParsedBackup => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new StorageError("IMPORT_INVALID", cause);
  }
  if (!isBackupFile(parsed)) throw new StorageError("IMPORT_INVALID");
  return {
    ...parsed,
    settings: parsed.settings ?? [],
    carriesSettings:
      parsed.schemaVersion >= SETTINGS_BACKUP_SCHEMA_VERSION &&
      parsed.settings !== undefined,
  };
};

export const validateImport = async (text: string): Promise<ImportPreview> => {
  const backup = parseBackup(text);
  return {
    events: backup.events.length,
    categories: backup.categories.length,
    settings: backup.settings.length,
    schemaVersion: backup.schemaVersion,
  };
};

/**
 * Replace all local data with a backup, signed-out semantics: original
 * timestamps are preserved, tombstones are cleared, and the sync cursor is
 * dropped (the cached key entry is kept). With no cursor and no tombstones,
 * the next sign-in runs a first sync that merges backup and cloud
 * last-write-wins and deletes nothing from the account.
 */
export const commitImportLocal = async (text: string): Promise<void> => {
  const backup = parseBackup(text);
  try {
    const db = await getDb();
    const tx = db.transaction(
      [
        STORE,
        CATEGORY_STORE,
        SETTINGS_STORE,
        TOMBSTONE_STORE,
        SYNC_META_STORE,
        OUTBOX_STORE,
      ],
      "readwrite",
    );
    // Accumulate request promises as they are queued so we can silence any
    // pending AbortError rejections if we need to abort the transaction.
    const requests: Promise<unknown>[] = [];
    try {
      const events = tx.objectStore(STORE);
      const categories = tx.objectStore(CATEGORY_STORE);
      const tombstones = tx.objectStore(TOMBSTONE_STORE);
      const syncMeta = tx.objectStore(SYNC_META_STORE);
      const settings = tx.objectStore(SETTINGS_STORE);
      // Requests are queued synchronously in push order — the clears are
      // enqueued before any put, and IndexedDB runs same-store requests in
      // creation order. The whole transaction rolls back on failure.
      requests.push(
        events.clear(),
        categories.clear(),
        tombstones.clear(),
        tx.objectStore(OUTBOX_STORE).clear(),
        syncMeta.delete(SYNC_CURSOR_KEY),
        syncMeta.delete(SYNC_SERVER_CURSOR_KEY),
      );
      // A v1 backup says nothing about settings; leave this device's in place
      // rather than clearing them to nothing.
      if (backup.carriesSettings) requests.push(settings.clear());
      for (const event of backup.events) {
        requests.push(events.put(event));
      }
      for (const category of backup.categories) {
        requests.push(categories.put(category));
      }
      for (const setting of backup.settings) {
        requests.push(settings.put(setting));
      }
      await Promise.all(requests);
      await tx.done;
    } catch (error) {
      // Abort explicitly so a failure can never commit the clears.
      // Swallow AbortError rejections on all pending request promises and
      // tx.done so they don't surface as unhandled rejections.
      tx.done.catch(() => undefined);
      for (const req of requests) req.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // already aborted (request-error auto-abort) or already committed
      }
      throw error;
    }
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

/**
 * Replace all data with a backup, signed-in semantics: every imported row is
 * re-stamped to now so it wins last-write-wins everywhere, and every
 * pre-import id the backup lacks (live row or pending tombstone) gets a
 * fresh tombstone so the deletion propagates. Tombstones for ids the backup
 * re-introduces are dropped. The sync cursor is kept, so the next sync
 * incrementally pushes exactly the backup and its removals.
 */
export const commitImportSynced = async (text: string): Promise<void> => {
  const backup = parseBackup(text);
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, SETTINGS_STORE, TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const requests: Promise<unknown>[] = [];
    try {
      const events = tx.objectStore(STORE);
      const categories = tx.objectStore(CATEGORY_STORE);
      const settings = tx.objectStore(SETTINGS_STORE);
      const tombstones = tx.objectStore(TOMBSTONE_STORE);
      const outbox = tx.objectStore(OUTBOX_STORE);
      // Read the pre-import state first. Awaiting idb request promises keeps
      // the transaction alive; read sequentially, never via Promise.all,
      // which could let the transaction auto-commit before the writes (see
      // clearAllData).
      const eventIds = await events.getAllKeys();
      const categoryIds = await categories.getAllKeys();
      const settingIds = await settings.getAllKeys();
      const tombstoneRows: unknown[] = await tombstones.getAll();
      const stamp = nowISO();
      const importedIds: Record<TombstoneType, Set<string>> = {
        event: new Set(backup.events.map((e) => e.id)),
        category: new Set(backup.categories.map((c) => c.id)),
        setting: new Set(backup.settings.map((s) => s.id)),
      };
      // For every pre-import id: a fresh tombstone if the backup lacks it,
      // otherwise drop any pending tombstone so the imported row wins. Every
      // resulting row and tombstone is a pending change for the next push.
      const entomb = (id: IDBValidKey, type: TombstoneType): void => {
        if (!isString(id)) return;
        if (importedIds[type].has(id)) {
          requests.push(tombstones.delete(id));
        } else {
          const row: Tombstone = { id, type, updatedAt: stamp };
          // One request per push: a synchronous throw from the second call
          // would otherwise drop the first call's already-created promise
          // before it reaches `requests`, leaking an unswallowed AbortError.
          requests.push(tombstones.put(row));
          requests.push(outbox.put(row));
        }
      };
      requests.push(events.clear(), categories.clear(), outbox.clear());
      for (const id of eventIds) entomb(id, "event");
      for (const id of categoryIds) entomb(id, "category");
      // A v1 backup predates synced settings and says nothing about them, so
      // it must not retire the ones this account already holds.
      if (backup.carriesSettings) {
        requests.push(settings.clear());
        for (const id of settingIds) entomb(id, "setting");
      }
      for (const row of tombstoneRows.filter(isTombstone)) {
        if (row.type === "setting" && !backup.carriesSettings) continue;
        entomb(row.id, row.type);
      }
      for (const event of backup.events) {
        requests.push(events.put({ ...event, updatedAt: stamp }));
        requests.push(
          outbox.put({ id: event.id, type: "event", updatedAt: stamp }),
        );
      }
      for (const category of backup.categories) {
        requests.push(categories.put({ ...category, updatedAt: stamp }));
        requests.push(
          outbox.put({ id: category.id, type: "category", updatedAt: stamp }),
        );
      }
      for (const setting of backup.settings) {
        requests.push(settings.put({ ...setting, updatedAt: stamp }));
        requests.push(
          outbox.put({ id: setting.id, type: "setting", updatedAt: stamp }),
        );
      }
      await Promise.all(requests);
      await tx.done;
    } catch (error) {
      // Abort explicitly so a failure can never partially commit the import.
      tx.done.catch(() => undefined);
      for (const req of requests) req.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // already aborted (request-error auto-abort) or already committed
      }
      throw error;
    }
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

/**
 * Reset all data: delete every event and category, recording a tombstone for
 * each so the deletions sync to the cloud. Unlike clearLocalData (the sign-out
 * wipe), this keeps the tombstone store and the sync cursor, so a signed-in
 * account is cleared on every device on the next sync.
 */
export const clearAllData = async (): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE, OUTBOX_STORE],
      "readwrite",
    );
    const events = tx.objectStore(STORE);
    const categories = tx.objectStore(CATEGORY_STORE);
    const tombstones = tx.objectStore(TOMBSTONE_STORE);
    const outbox = tx.objectStore(OUTBOX_STORE);
    // Read the existing ids first (awaiting idb request promises keeps the
    // transaction alive), then clear the stores and tombstone each id so the
    // deletions propagate. Read sequentially, never via a non-idb promise like
    // Promise.all, which could let the transaction auto-commit before the writes.
    const eventIds = await events.getAllKeys();
    const categoryIds = await categories.getAllKeys();
    const stamp = nowISO();
    const writes: Promise<unknown>[] = [events.clear(), categories.clear()];
    const tombstone = (id: IDBValidKey, type: TombstoneType): void => {
      if (isString(id)) {
        const row: Tombstone = { id, type, updatedAt: stamp };
        writes.push(tombstones.put(row));
        writes.push(outbox.put(row));
      }
    };
    for (const id of eventIds) tombstone(id, "event");
    for (const id of categoryIds) tombstone(id, "category");
    await Promise.all(writes);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

/**
 * Wipe all locally stored data: events, categories, tombstones, and the sync
 * cursor. Used when signing out on a shared device. Does not touch the cloud.
 */
export const clearLocalData = async (): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE, SYNC_META_STORE, OUTBOX_STORE],
      "readwrite",
    );
    await Promise.all([
      tx.objectStore(STORE).clear(),
      tx.objectStore(CATEGORY_STORE).clear(),
      tx.objectStore(TOMBSTONE_STORE).clear(),
      tx.objectStore(SYNC_META_STORE).clear(),
      tx.objectStore(OUTBOX_STORE).clear(),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

/**
 * Drop everything that ties this device to an account — the pull cursor, the
 * pending outbox, tombstones, and the cached data key — and keep every event,
 * category, and setting. The inverse of clearLocalData: that one keeps the
 * account and wipes the device, this one keeps the device and lets the account
 * go. Used after deleting an account, so the calendar carries on exactly as it
 * did before signing in, and a later sign-in starts a clean first sync instead
 * of resuming a dead account's cursor.
 */
export const clearSyncState = async (): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [TOMBSTONE_STORE, SYNC_META_STORE, OUTBOX_STORE],
      "readwrite",
    );
    await Promise.all([
      tx.objectStore(TOMBSTONE_STORE).clear(),
      tx.objectStore(SYNC_META_STORE).clear(),
      tx.objectStore(OUTBOX_STORE).clear(),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
};

/**
 * Delete the entire local database. Recovery path for an OPEN_FAILED database
 * (e.g. one written by a newer, incompatible build) that cannot be opened to
 * clear normally; the next access recreates an empty one. Destroys all local
 * data, so callers should confirm first and reload afterward.
 */
export const deleteDatabase = async (): Promise<void> => {
  if (typeof indexedDB === "undefined") {
    throw new StorageError("UNAVAILABLE");
  }
  // Drop any cached (failed) connection so deletion is not blocked by it and a
  // later open starts fresh.
  resetDbCache();
  try {
    // Other tabs get a moment to close their connections (their `blocking`
    // handler does so on versionchange); if the delete is still blocked after
    // the grace period, fail with BLOCKED instead of hanging forever.
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      deleteDB(DB_NAME, {
        blocked: () => {
          timer = setTimeout(
            () => reject(new StorageError("BLOCKED")),
            DELETE_BLOCKED_TIMEOUT_MS,
          );
        },
      }).then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (cause) => {
          clearTimeout(timer);
          reject(cause);
        },
      );
    });
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};
