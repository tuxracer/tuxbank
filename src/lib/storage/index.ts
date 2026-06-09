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
  STORE,
  SYNC_CURSOR_KEY,
  SYNC_META_STORE,
  TOMBSTONE_STORE,
} from "./consts";
import {
  isBackupFile,
  isTombstone,
  StorageError,
  type BackupFile,
  type ImportPreview,
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
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: "id" });
        db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
        db.createObjectStore(SYNC_META_STORE);
      },
    }).catch((cause) => {
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

export const putEvent = async (event: CalendarEvent): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE, TOMBSTONE_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(STORE).put(event),
      tx.objectStore(TOMBSTONE_STORE).delete(event.id),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE, TOMBSTONE_STORE], "readwrite");
    const tombstone: Tombstone = { id, type: "event", updatedAt: nowISO() };
    await Promise.all([
      tx.objectStore(STORE).delete(id),
      tx.objectStore(TOMBSTONE_STORE).put(tombstone),
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

export const putCategory = async (category: Category): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction([CATEGORY_STORE, TOMBSTONE_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(CATEGORY_STORE).put(category),
      tx.objectStore(TOMBSTONE_STORE).delete(category.id),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction([CATEGORY_STORE, TOMBSTONE_STORE], "readwrite");
    const tombstone: Tombstone = { id, type: "category", updatedAt: nowISO() };
    await Promise.all([
      tx.objectStore(CATEGORY_STORE).delete(id),
      tx.objectStore(TOMBSTONE_STORE).put(tombstone),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

export const exportDatabase = async (): Promise<string> => {
  try {
    const [events, categories] = await Promise.all([
      getAllEvents(),
      getAllCategories(),
    ]);
    const backup: BackupFile = {
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events,
      categories,
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
    const value: unknown = await db.get(SYNC_META_STORE, SYNC_CURSOR_KEY);
    return isString(value) ? value : undefined;
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const setSyncCursor = async (value: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(SYNC_META_STORE, value, SYNC_CURSOR_KEY);
  } catch (error) {
    throw toWriteError(error);
  }
};

export const applyRemoteDelete = async (
  id: string,
  type: TombstoneType,
): Promise<void> => {
  try {
    const db = await getDb();
    const storeName = type === "event" ? STORE : CATEGORY_STORE;
    const tx = db.transaction([storeName, TOMBSTONE_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(storeName).delete(id),
      tx.objectStore(TOMBSTONE_STORE).delete(id),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};

const parseBackup = (text: string): BackupFile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new StorageError("IMPORT_INVALID", cause);
  }
  if (!isBackupFile(parsed)) throw new StorageError("IMPORT_INVALID");
  return parsed;
};

export const validateImport = async (text: string): Promise<ImportPreview> => {
  const backup = parseBackup(text);
  return {
    events: backup.events.length,
    categories: backup.categories.length,
    schemaVersion: backup.schemaVersion,
  };
};

export const commitImport = async (text: string): Promise<void> => {
  const backup = parseBackup(text);
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE],
      "readwrite",
    );
    // Accumulate request promises as they are queued so we can silence any
    // pending AbortError rejections if we need to abort the transaction.
    const requests: Promise<unknown>[] = [];
    try {
      const events = tx.objectStore(STORE);
      const categories = tx.objectStore(CATEGORY_STORE);
      const tombstones = tx.objectStore(TOMBSTONE_STORE);
      // Requests are queued synchronously in push order — both clears are
      // enqueued before any put, and IndexedDB runs same-store requests in
      // creation order. The whole transaction rolls back on failure.
      requests.push(events.clear(), categories.clear(), tombstones.clear());
      for (const event of backup.events) {
        requests.push(events.put(event));
      }
      for (const category of backup.categories) {
        requests.push(categories.put(category));
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
 * Reset all data: delete every event and category, recording a tombstone for
 * each so the deletions sync to the cloud. Unlike clearLocalData (the sign-out
 * wipe), this keeps the tombstone store and the sync cursor, so a signed-in
 * account is cleared on every device on the next sync.
 */
export const clearAllData = async (): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE],
      "readwrite",
    );
    const events = tx.objectStore(STORE);
    const categories = tx.objectStore(CATEGORY_STORE);
    const tombstones = tx.objectStore(TOMBSTONE_STORE);
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
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE, SYNC_META_STORE],
      "readwrite",
    );
    await Promise.all([
      tx.objectStore(STORE).clear(),
      tx.objectStore(CATEGORY_STORE).clear(),
      tx.objectStore(TOMBSTONE_STORE).clear(),
      tx.objectStore(SYNC_META_STORE).clear(),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
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
    await deleteDB(DB_NAME);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};
