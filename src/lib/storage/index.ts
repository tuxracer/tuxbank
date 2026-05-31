import { openDB, type IDBPDatabase } from "idb";
import type { CalendarEvent } from "@/types";
import { isCalendarEvent } from "@/types";
import { StorageError } from "./types";

export * from "./types";

const DB_NAME = "cyber-calendar";
const DB_VERSION = 1;
const STORE = "events";

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new StorageError("UNAVAILABLE"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
      blocked() {
        /* another tab holds an older version open */
      },
    }).catch((cause) => {
      dbPromise = null;
      throw new StorageError("UNAVAILABLE", cause);
    });
  }
  return dbPromise;
};

export const getAllEvents = async (): Promise<CalendarEvent[]> => {
  try {
    const db = await getDb();
    const rows = await db.getAll(STORE);
    return rows.filter(isCalendarEvent);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("READ_FAILED", error);
  }
};

export const putEvent = async (event: CalendarEvent): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(STORE, event);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    const code =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "QUOTA_EXCEEDED"
        : "WRITE_FAILED";
    throw new StorageError(code, error);
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE, id);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("WRITE_FAILED", error);
  }
};

/** Test-only: close and delete the database so each test starts clean. */
export const resetDbForTests = async (): Promise<void> => {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
};
