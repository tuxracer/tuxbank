import { openDB, type IDBPDatabase } from "idb";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory } from "@/types";
import {
  BACKUP_APP,
  BACKUP_SCHEMA_VERSION,
  CATEGORY_STORE,
  DB_NAME,
  DB_VERSION,
  STORE,
} from "./consts";
import {
  isBackupFile,
  StorageError,
  type BackupFile,
  type ImportPreview,
  type StorageErrorCode,
} from "./types";

export * from "./consts";
export * from "./types";

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
      },
    }).catch((cause) => {
      dbPromise = null;
      throw new StorageError("UNAVAILABLE", cause);
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
    await db.put(STORE, event);
  } catch (error) {
    throw toWriteError(error);
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE, id);
  } catch (error) {
    throw toWriteError(error);
  }
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
    await db.put(CATEGORY_STORE, category);
  } catch (error) {
    throw toWriteError(error);
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(CATEGORY_STORE, id);
  } catch (error) {
    throw toWriteError(error);
  }
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
    const tx = db.transaction([STORE, CATEGORY_STORE], "readwrite");
    const events = tx.objectStore(STORE);
    const categories = tx.objectStore(CATEGORY_STORE);
    // Requests run in creation order within the transaction: clears first,
    // then puts. The whole transaction rolls back if anything fails.
    await Promise.all([
      events.clear(),
      categories.clear(),
      ...backup.events.map((event) => events.put(event)),
      ...backup.categories.map((category) => categories.put(category)),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
};
