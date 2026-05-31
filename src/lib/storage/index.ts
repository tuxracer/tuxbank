import { openDB, type IDBPDatabase } from "idb";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory, PRESET_CATEGORIES } from "@/types";
import { StorageError } from "./types";
import { DB_NAME, DB_VERSION, STORE, CATEGORY_STORE } from "./consts";

export * from "./consts";
export * from "./types";

const withTransactionDefaults = (event: CalendarEvent): CalendarEvent => ({
  ...event,
  amount: typeof event.amount === "number" ? event.amount : 0,
  direction: event.direction === "withdrawal" ? "withdrawal" : "deposit",
});

const LEGACY_CATEGORY_BY_ID = new Map(PRESET_CATEGORIES.map((c) => [c.id, c]));

/** Build the category records implied by the categoryIds already on events. */
export const seedCategoriesFromEvents = (
  events: CalendarEvent[],
): Category[] => {
  const byId = new Map<string, Category>();
  for (const event of events) {
    if (byId.has(event.categoryId)) continue;
    const legacy = LEGACY_CATEGORY_BY_ID.get(event.categoryId);
    byId.set(
      event.categoryId,
      legacy ?? { id: event.categoryId, name: event.categoryId, color: "cyan" },
    );
  }
  return [...byId.values()];
};

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new StorageError("UNAVAILABLE"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, _oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CATEGORY_STORE)) {
          db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
          const rows = await tx.objectStore(STORE).getAll();
          for (const cat of seedCategoriesFromEvents(
            rows.filter(isCalendarEvent),
          )) {
            await tx.objectStore(CATEGORY_STORE).put(cat);
          }
        }
      },
      blocked() {},
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
    return rows.filter(isCalendarEvent).map(withTransactionDefaults);
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

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const db = await getDb();
    const rows = await db.getAll(CATEGORY_STORE);
    return rows.filter(isCategory);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("READ_FAILED", error);
  }
};

export const putCategory = async (category: Category): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(CATEGORY_STORE, category);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    const code =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "QUOTA_EXCEEDED"
        : "WRITE_FAILED";
    throw new StorageError(code, error);
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(CATEGORY_STORE, id);
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
