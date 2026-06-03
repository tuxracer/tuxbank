# IndexedDB + JSON Backup Storage Revert — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SQLite-WASM (Web Worker + OPFS) storage layer with a plain IndexedDB repository (`idb` package, fresh `tuxbank` v1 database) and replace `.sqlite3` backups with human-readable JSON export/import.

**Architecture:** The storage module keeps its exact public CRUD API (`getAllEvents`, `putEvent`, `deleteEvent`, `getAllCategories`, `putCategory`, `deleteCategory`) and backup API names (`exportDatabase`, `validateImport`, `commitImport`), so consumers barely change. Records are stored as the in-memory `CalendarEvent`/`Category` types verbatim (no mappers). The multi-tab lock (`onConnectionStatus`/`StorageLockedOverlay`) is deleted. Tests run against `fake-indexeddb` with a fresh `IDBFactory` per test.

**Tech Stack:** Next.js 16, React 19, TypeScript, `idb` (new), `fake-indexeddb` (new, dev), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-03-indexeddb-revert-design.md`

**Branch:** `feat/indexeddb-json-storage` (already created)

**Note on intermediate state:** Tasks 2–4 are a coordinated swap. The full vitest suite is red after Task 2 (consumers still reference the old API) and green again from the end of Task 3 / Task 4. Each task says exactly which tests must pass before its commit.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/storage/consts.ts` | Rewrite | DB/store names, backup identity + schema version |
| `src/lib/storage/types.ts` | Rewrite | `StorageError` (trimmed codes), `ImportPreview`, `BackupFile` + `isBackupFile` guard |
| `src/lib/storage/index.ts` | Rewrite | `idb` repository + JSON export/validate/commit |
| `src/lib/storage/testing.ts` | Create | `resetDbForTests()` — fresh `fake-indexeddb` factory + cache reset |
| `src/lib/storage/tests.ts` | Rewrite | Behavior tests against fake-indexeddb |
| `src/lib/storage/types.test.ts` | Keep as-is | Error-code guard tests (codes still exist) |
| `src/lib/storage/connection/` (6 files), `mappers.ts`, `mappers.test.ts`, `schema.ts` | Delete | SQLite-WASM machinery |
| `src/app/smoke.test.ts` | Modify | New testing-helper import path |
| `src/context/CalendarContext/index.tsx` | Modify | Drop lock plumbing; JSON export/import wiring |
| `src/context/CalendarContext/types.ts` | Modify | Drop `storageLocked` |
| `src/context/CalendarContext/tests.tsx` | Modify | New import path, drop lock test, `.json` backup files |
| `src/app/page.tsx` | Modify | Drop `StorageLockedOverlay` |
| `src/components/StorageLockedOverlay/` | Delete | Obsolete (no lock) |
| `src/components/DataDialog/index.tsx` | Modify | `accept=".json,application/json"` |
| `src/components/DataDialog/tests.tsx` | Modify | Cosmetic `.json` filenames |
| `package.json`, `vitest.config.ts`, `.gitignore`, `scripts/`, `public/sqlite/` | Modify/Delete | Remove sqlite tooling |
| `CLAUDE.md`, `docs/TRD.md` | Modify | Document the new storage layer |

---

### Task 1: Add new dependencies

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install `idb` (runtime) and `fake-indexeddb` (dev)**

```bash
pnpm add idb
pnpm add -D fake-indexeddb
```

Expected: both appear in `package.json` (`idb` under `dependencies`, `fake-indexeddb` under `devDependencies`). Do NOT remove `@sqlite.org/sqlite-wasm` yet — the old code still imports it until Task 5.

- [ ] **Step 2: Verify the suite is still green**

Run: `pnpm test`
Expected: PASS (nothing imports the new packages yet)

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add idb + fake-indexeddb for IndexedDB storage revert"
```

---

### Task 2: Rewrite the storage module on IndexedDB

**Files:**
- Rewrite: `src/lib/storage/consts.ts`
- Rewrite: `src/lib/storage/types.ts`
- Rewrite: `src/lib/storage/tests.ts`
- Rewrite: `src/lib/storage/index.ts`
- Create: `src/lib/storage/testing.ts`
- Delete: `src/lib/storage/connection/` (entire directory), `src/lib/storage/mappers.ts`, `src/lib/storage/mappers.test.ts`, `src/lib/storage/schema.ts`
- Modify: `src/app/smoke.test.ts`
- Keep unchanged: `src/lib/storage/types.test.ts`

- [ ] **Step 1: Replace `src/lib/storage/consts.ts` with the IndexedDB/backup constants**

```typescript
/** IndexedDB database + object store identity. Fresh DB name = fresh start. */
export const DB_NAME = "tuxbank";
export const DB_VERSION = 1;
export const STORE = "events";
export const CATEGORY_STORE = "categories";

/** JSON backup file identity + schema version. */
export const BACKUP_APP = "tuxbank";
export const BACKUP_SCHEMA_VERSION = 1;
```

- [ ] **Step 2: Replace `src/lib/storage/types.ts` (trimmed error codes, backup type + guard)**

```typescript
import { isArray, isPlainObject, isString } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory } from "@/types";
import { BACKUP_APP, BACKUP_SCHEMA_VERSION } from "./consts";

export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "IMPORT_INVALID"
  | "EXPORT_FAILED";

const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = [
  "UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "BLOCKED",
  "READ_FAILED",
  "WRITE_FAILED",
  "IMPORT_INVALID",
  "EXPORT_FAILED",
];

export const isStorageErrorCode = (value: unknown): value is StorageErrorCode =>
  isString(value) && STORAGE_ERROR_CODES.includes(value as StorageErrorCode);

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, cause?: unknown) {
    super(code);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}

export const isStorageError = (error: unknown): error is StorageError =>
  error instanceof StorageError;

/** Summary of a candidate import file, shown before the destructive swap. */
export interface ImportPreview {
  events: number;
  categories: number;
  schemaVersion: number;
}

/** Shape of a tuxbank JSON backup file. */
export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  events: CalendarEvent[];
  categories: Category[];
}

export const isBackupFile = (value: unknown): value is BackupFile =>
  isPlainObject(value) &&
  value.app === BACKUP_APP &&
  value.schemaVersion === BACKUP_SCHEMA_VERSION &&
  isString(value.exportedAt) &&
  isArray(value.events) &&
  value.events.every(isCalendarEvent) &&
  isArray(value.categories) &&
  value.categories.every(isCategory);
```

Dropped vs the old file: `LOCKED`, `VERSION_ERROR` codes; `SqlValue`, `Row`, `Oo1Db`, `SyncDb`, `DbConnection`, `ConnectionStatus` types.

- [ ] **Step 3: Replace `src/lib/storage/tests.ts` with behavior tests for the new module**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarEvent, Category } from "@/types";
import {
  getAllEvents,
  putEvent,
  deleteEvent,
  getAllCategories,
  putCategory,
  deleteCategory,
  exportDatabase,
  validateImport,
  commitImport,
} from "./index";
import { resetDbForTests } from "./testing";

const make = (id: string): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  date: "2026-05-14",
  categoryId: "work",
  amount: 0,
  direction: "deposit",
  recurrence: null,
  overrides: [],
  createdAt: "t",
  updatedAt: "t",
});

describe("storage repository", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("starts empty", async () => {
    expect(await getAllEvents()).toEqual([]);
  });

  it("persists and reads back events", async () => {
    await putEvent(make("a"));
    await putEvent(make("b"));
    const all = await getAllEvents();
    expect(all.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("overwrites an event with the same id", async () => {
    await putEvent(make("a"));
    await putEvent({ ...make("a"), title: "Renamed" });
    const all = await getAllEvents();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Renamed");
  });

  it("deletes events", async () => {
    await putEvent(make("a"));
    await deleteEvent("a");
    expect(await getAllEvents()).toEqual([]);
  });

  it("round-trips a recurring event with endsOn", async () => {
    const recurring: CalendarEvent = {
      ...make("r"),
      recurrence: { freq: "weekly", interval: 2, endsOn: "2026-12-31" },
    };
    await putEvent(recurring);
    const [loaded] = await getAllEvents();
    expect(loaded.recurrence).toEqual({
      freq: "weekly",
      interval: 2,
      endsOn: "2026-12-31",
    });
  });

  it("round-trips occurrence overrides (cancelled and patched)", async () => {
    const event: CalendarEvent = {
      ...make("o"),
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
      overrides: [
        { occurrenceDate: "2026-05-21", cancelled: true },
        { occurrenceDate: "2026-05-28", patch: { title: "Moved" } },
      ],
    };
    await putEvent(event);
    const [loaded] = await getAllEvents();
    expect(loaded.overrides).toContainEqual({
      occurrenceDate: "2026-05-21",
      cancelled: true,
    });
    expect(loaded.overrides).toContainEqual({
      occurrenceDate: "2026-05-28",
      patch: { title: "Moved" },
    });
  });

  it("filters records that fail the CalendarEvent guard out of reads", async () => {
    // Corrupt/foreign records (e.g. hand-edited or written by another app
    // version) must be skipped on read, never crash the calendar.
    await putEvent({ id: "bad" } as unknown as CalendarEvent);
    await putEvent(make("good"));
    const all = await getAllEvents();
    expect(all.map((e) => e.id)).toEqual(["good"]);
  });
});

describe("categories store", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("starts empty and round-trips categories", async () => {
    expect(await getAllCategories()).toEqual([]);
    await putCategory({ id: "groceries", name: "Groceries", color: "green" });
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
    const all = await getAllCategories();
    expect(all.map((c) => c.id).sort()).toEqual(["groceries", "rent"]);
  });

  it("deletes a category", async () => {
    await putCategory({ id: "groceries", name: "Groceries", color: "green" });
    await deleteCategory("groceries");
    expect(await getAllCategories()).toEqual([]);
  });

  it("filters records that fail the Category guard out of reads", async () => {
    await putCategory({ id: "x", name: "X", color: "teal" } as unknown as Category);
    await putCategory({ id: "ok", name: "OK", color: "cyan" });
    const all = await getAllCategories();
    expect(all.map((c) => c.id)).toEqual(["ok"]);
  });
});

describe("export / import (JSON backup)", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("exports a human-readable JSON document with app marker and version", async () => {
    await putEvent(make("a"));
    const text = await exportDatabase();
    const parsed = JSON.parse(text);
    expect(parsed.app).toBe("tuxbank");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.categories).toEqual([]);
    expect(text).toContain("\n"); // pretty-printed, not minified
  });

  it("round-trips the whole database through export + commitImport", async () => {
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
    await putEvent(make("a"));
    const text = await exportDatabase();

    await deleteEvent("a");
    await deleteCategory("rent");
    expect(await getAllEvents()).toEqual([]);

    await commitImport(text);
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
    expect((await getAllCategories()).map((c) => c.id)).toEqual(["rent"]);
  });

  it("commitImport replaces pre-existing data entirely", async () => {
    await putEvent(make("old"));
    const text = await exportDatabase(); // backup contains only "old"
    await putEvent(make("extra"));
    await putCategory({ id: "c", name: "C", color: "cyan" });

    await commitImport(text);
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["old"]);
    expect(await getAllCategories()).toEqual([]);
  });

  it("validateImport reports the backup's record counts", async () => {
    await putEvent(make("a"));
    await putEvent(make("b"));
    const text = await exportDatabase();
    expect(await validateImport(text)).toEqual({
      events: 2,
      categories: 0,
      schemaVersion: 1,
    });
  });

  it("validateImport rejects malformed JSON", async () => {
    await expect(validateImport("not json {")).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("validateImport rejects a file with the wrong app marker", async () => {
    const alien = JSON.stringify({
      app: "someoneelse",
      schemaVersion: 1,
      exportedAt: "2026-06-03T00:00:00.000Z",
      events: [],
      categories: [],
    });
    await expect(validateImport(alien)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("validateImport rejects an unsupported schemaVersion", async () => {
    const future = JSON.stringify({
      app: "tuxbank",
      schemaVersion: 999,
      exportedAt: "2026-06-03T00:00:00.000Z",
      events: [],
      categories: [],
    });
    await expect(validateImport(future)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("validateImport rejects a backup containing an invalid record", async () => {
    const bad = JSON.stringify({
      app: "tuxbank",
      schemaVersion: 1,
      exportedAt: "2026-06-03T00:00:00.000Z",
      events: [{ id: "missing-everything" }],
      categories: [],
    });
    await expect(validateImport(bad)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("commitImport rejects an invalid file and keeps existing data", async () => {
    await putEvent(make("a"));
    await expect(commitImport("garbage")).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
  });
});
```

Dropped vs the old tests (behavior that no longer exists): legacy amount/direction backfill, `seedCategoriesFromEvents`, SQLite STRICT-constraint rejection (IndexedDB accepts any shape; reads filter instead — covered by the new guard-filter tests), override cascade-delete (overrides live inside the event record now, so they can't outlive it).

- [ ] **Step 4: Run the storage tests to verify they fail**

Run: `pnpm vitest run src/lib/storage/tests.ts`
Expected: FAIL — `./testing` doesn't exist yet and `./index` still has the SQLite implementation (export shape mismatch).

- [ ] **Step 5: Replace `src/lib/storage/index.ts` with the IndexedDB repository**

```typescript
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

const toStorageError = (error: unknown, code: StorageErrorCode): StorageError =>
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
```

Notes for the implementer:
- `exportedAt` is a full ISO timestamp (a moment in time, not a calendar date) — the "local dates" rule applies to calendar dates like the filename, which is built with date-fns `format` in `CalendarContext`.
- `seedCategoriesFromEvents` and `onConnectionStatus` are intentionally gone — do not port them.

- [ ] **Step 6: Create `src/lib/storage/testing.ts`**

```typescript
import { IDBFactory } from "fake-indexeddb";
import { resetDbCache } from "./index";

/**
 * Test-only: swap in a fresh in-memory IndexedDB and drop the cached
 * connection so each test starts from an empty database. Imported only by
 * test files — never by browser code — so fake-indexeddb stays out of the
 * production bundle.
 */
export const resetDbForTests = async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
};
```

(Async only so existing `await resetDbForTests()` call sites keep working. If tsc rejects the `globalThis.indexedDB` assignment due to a structural mismatch between fake-indexeddb's `IDBFactory` and lib.dom's, prefer fixing via `import "fake-indexeddb/auto";` once plus per-test factory assignment as documented in fake-indexeddb's README — do not silence with a blind `as` cast.)

- [ ] **Step 7: Delete the SQLite machinery**

```bash
git rm -r src/lib/storage/connection
git rm src/lib/storage/mappers.ts src/lib/storage/mappers.test.ts src/lib/storage/schema.ts
```

- [ ] **Step 8: Update `src/app/smoke.test.ts` to the new testing helper**

Replace the whole file with:

```typescript
import { describe, it, expect } from "vitest";
import { getAllEvents } from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";

describe("test harness", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("provides a working fake-IndexedDB test database", async () => {
    await resetDbForTests();
    expect(await getAllEvents()).toEqual([]);
  });
});
```

- [ ] **Step 9: Run the storage + smoke tests to verify they pass**

Run: `pnpm vitest run src/lib/storage src/app/smoke.test.ts`
Expected: PASS (storage tests, types.test.ts, smoke test all green)

Known-red at this point (fixed in Task 3): `src/context/CalendarContext/tests.tsx` (old import path + old API). Do not run the full suite as a gate here.

- [ ] **Step 10: Commit**

```bash
git add -A src/lib/storage src/app/smoke.test.ts
git commit -m "feat(storage): IndexedDB repository with JSON backup export/import (replaces sqlite-wasm)"
```

---

### Task 3: Rewire CalendarContext, page, and delete the lock overlay

**Files:**
- Modify: `src/context/CalendarContext/tests.tsx`
- Modify: `src/context/CalendarContext/index.tsx`
- Modify: `src/context/CalendarContext/types.ts`
- Modify: `src/app/page.tsx`
- Delete: `src/components/StorageLockedOverlay/`

- [ ] **Step 1: Update `src/context/CalendarContext/tests.tsx` (failing first)**

Three changes:

1. Replace the testing-helper import (line 3):

```typescript
// OLD
import { resetDbForTests } from "@/lib/storage/connection/testing";
// NEW
import { resetDbForTests } from "@/lib/storage/testing";
```

2. Delete this entire test (the lock concept no longer exists):

```typescript
it("defaults storageLocked to false with a working connection", async () => {
  const { result } = renderHook(() => useCalendar(), { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.storageLocked).toBe(false);
});
```

3. In the test `"exports and re-imports the database, restoring events"`, replace:

```typescript
const bytes = await exportDatabase();
const file = new File([bytes], "backup.sqlite3");
```

with:

```typescript
const json = await exportDatabase();
const file = new File([json], "backup.json");
```

and in the test `"previewImport reports the backup's record counts"`, replace:

```typescript
const bytes = await exportDatabase();
const preview = await result.current.previewImport(
  new File([bytes], "backup.sqlite3"),
);
```

with:

```typescript
const json = await exportDatabase();
const preview = await result.current.previewImport(
  new File([json], "backup.json"),
);
```

- [ ] **Step 2: Run context tests to verify they fail**

Run: `pnpm vitest run src/context`
Expected: FAIL — `CalendarContext/index.tsx` still imports `onConnectionStatus` (no longer exported) and passes `Uint8Array` to `validateImport`/`commitImport`.

- [ ] **Step 3: Update `src/context/CalendarContext/index.tsx`**

Four changes:

1. In the `@/lib/storage` import block, delete the `onConnectionStatus,` line:

```typescript
import {
  deleteEvent as dbDelete,
  getAllEvents,
  isStorageError,
  putEvent,
  getAllCategories,
  putCategory,
  deleteCategory as dbDeleteCategory,
  exportDatabase,
  validateImport,
  commitImport,
} from "@/lib/storage";
```

2. Delete the `storageLocked` state and its effect:

```typescript
// DELETE this state line:
const [storageLocked, setStorageLocked] = useState<boolean>(false);

// DELETE this entire effect:
useEffect(
  () =>
    onConnectionStatus((status) => {
      setStorageLocked(status === "waiting-locked");
      if (status === "unavailable") setStorageAvailable(false);
    }),
  [],
);
```

(Leave the data-loading `useEffect` and its `UNAVAILABLE` catch handling untouched — that is now the sole source of `storageAvailable=false`.)

3. Replace the three backup callbacks:

```typescript
const exportData = useCallback(async () => {
  const json = await exportDatabase();
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    `tuxbank-backup-${format(new Date(), "yyyy-MM-dd")}.json`,
  );
}, []);

const previewImport = useCallback(async (file: File) => {
  return validateImport(await file.text());
}, []);

const importData = useCallback(
  async (file: File) => {
    await commitImport(await file.text());
    await reloadData();
  },
  [reloadData],
);
```

4. Remove `storageLocked,` from the `value: CalendarContextValue` object literal.

- [ ] **Step 4: Remove `storageLocked` from `src/context/CalendarContext/types.ts`**

Delete the line `storageLocked: boolean;` from `CalendarContextValue`.

- [ ] **Step 5: Update `src/app/page.tsx` and delete the overlay component**

In `src/app/page.tsx` delete:

```typescript
import StorageLockedOverlay from "@/components/StorageLockedOverlay";
```

and, inside `<main …>`:

```tsx
{cal.storageLocked && <StorageLockedOverlay />}
```

Then:

```bash
git rm -r src/components/StorageLockedOverlay
```

- [ ] **Step 6: Run the context tests to verify they pass**

Run: `pnpm vitest run src/context`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A src/context src/app/page.tsx src/components
git commit -m "feat(context): wire JSON backup export/import; drop multi-tab lock plumbing"
```

---

### Task 4: DataDialog file-type update + full suite green

**Files:**
- Modify: `src/components/DataDialog/index.tsx`
- Modify: `src/components/DataDialog/tests.tsx`

- [ ] **Step 1: Accept JSON files in `src/components/DataDialog/index.tsx`**

Replace the file-input `accept` attribute:

```tsx
// OLD
accept=".sqlite3,.sqlite,.db"
// NEW
accept=".json,application/json"
```

Everything else (staged flow, copy, aria-label, `IMPORT_INVALID` message — "made by a different version" now covers `schemaVersion` mismatches) stays as-is.

- [ ] **Step 2: Cosmetic filename updates in `src/components/DataDialog/tests.tsx`**

Replace both occurrences of:

```typescript
const file = new File([new Uint8Array([1, 2, 3])], "backup.sqlite3");
```

with:

```typescript
const file = new File(["{}"], "backup.json");
```

(The handlers are mocked props, so contents are irrelevant — this just keeps the fixtures honest.)

- [ ] **Step 3: Run the full suite to verify everything passes**

Run: `pnpm test`
Expected: PASS — all test files green (storage, context, DataDialog, smoke, components, lib).

- [ ] **Step 4: Run the project checks**

Run: `pnpm run check`
Expected: PASS (if prettier flags formatting, run `pnpm format` and re-check).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataDialog
git commit -m "feat(data-dialog): accept JSON backup files"
```

---

### Task 5: Strip the SQLite build tooling and dependency

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`
- Delete: `scripts/copy-sqlite-wasm.mjs`, `public/sqlite/`

- [ ] **Step 1: Remove the sqlite-wasm dependency**

```bash
pnpm remove @sqlite.org/sqlite-wasm
```

- [ ] **Step 2: Simplify `package.json` scripts**

Replace:

```json
"copy-sqlite": "node scripts/copy-sqlite-wasm.mjs",
"dev": "pnpm run copy-sqlite && next dev",
"build": "pnpm run copy-sqlite && next build",
```

with:

```json
"dev": "next dev",
"build": "next build",
```

- [ ] **Step 3: Delete the copy script and vendored runtime**

```bash
git rm scripts/copy-sqlite-wasm.mjs
rm -rf public/sqlite
rmdir scripts 2>/dev/null || true
```

(`public/sqlite/` is gitignored, so plain `rm -rf`; remove `scripts/` only if now empty.)

- [ ] **Step 4: Remove the vitest sqlite exclusion in `vitest.config.ts`**

Delete the block:

```typescript
optimizeDeps: {
  exclude: ["@sqlite.org/sqlite-wasm"],
},
```

- [ ] **Step 5: Remove the `.gitignore` entries**

Delete these two lines:

```
# sqlite-wasm runtime copied into public/ by scripts/copy-sqlite-wasm.mjs
/public/sqlite/
```

- [ ] **Step 6: Verify tests and production build**

Run: `pnpm test`
Expected: PASS

Run: `pnpm build`
Expected: Successful Next.js production build, no `copy-sqlite` step, no sqlite-wasm references.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts .gitignore
git commit -m "chore: remove sqlite-wasm dependency and build tooling"
```

(The `git rm` in Step 3 already staged the script deletion.)

---

### Task 6: Update CLAUDE.md and docs/TRD.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/TRD.md`

- [ ] **Step 1: Update `CLAUDE.md`**

1. Intro paragraph — replace:
   > persist in a **client-side SQLite database** (SQLite-WASM in a Web Worker, OPFS-persisted; no backend, no accounts)

   with:
   > persist in **IndexedDB** (via the `idb` library; no backend, no accounts)

2. Architecture intro — replace the data-flow sentence with:
   > Data flows `src/app/page.tsx` → `CalendarProvider` → `src/lib/*` → IndexedDB (via `idb`).

3. `src/components/` bullet — change `DataDialog` description to `(JSON backup export/import)` and remove `StorageLockedOverlay (multi-tab lock)` from the list.

4. `src/lib/` bullet — replace the storage description with:
   > `storage` (IndexedDB via `idb`; CRUD + JSON backup export/import)

5. Commands block — `dev` and `build` no longer mention copy-sqlite:

   ```bash
   pnpm dev         # Next.js dev (Turbopack) — http://localhost:3000
   pnpm build       # Production build
   ```

6. Tech Stack — replace the sqlite phrase in the libraries bullet with:
   > client-side **IndexedDB** via **idb**

   and the tests bullet with:
   > Tests: **vitest** + **@testing-library/react**; storage tests run against **fake-indexeddb** (fresh in-memory DB per test)

7. Gotchas — delete the three sqlite bullets (“sqlite-wasm can't be bundled”, “Single-tab OPFS lock”, “Storage tests bypass the worker”) and add:
   > - **Storage tests use fake-indexeddb**: `resetDbForTests()` (`src/lib/storage/testing.ts`) swaps in a fresh in-memory `IDBFactory` per test — import it only from test files so fake-indexeddb stays out of the production bundle.

- [ ] **Step 2: Update `docs/TRD.md`**

Line edits (replace SQLite wording in place):

1. §0 intro: “persist locally in a **client-side SQLite database** (SQLite-WASM)” → “persist locally in **IndexedDB** (via the `idb` library)”.
2. §1 Goals: “via a client-side SQLite database (OPFS-backed)” → “via IndexedDB”.
3. §1 Non-Goals: “whole-database `.sqlite3` backup” → “whole-database JSON backup”.
4. §3 Tech-stack table Persistence row → `| Persistence | **IndexedDB** via **idb** | Two object stores (events, categories); see §"Persistence: IndexedDB". |`; Testing row → “storage tests run against fake-indexeddb”.
5. §3 build note → `pnpm dev` → `next dev`, `pnpm build` → `next build` (delete the copy-sqlite explanation).
6. §4.3: “Categories live in their own SQLite table (see §4.6)” → “Categories live in their own object store (see §4.6)”; delete the parenthetical about legacy seeded ids.
7. §4.6 Persistence → replace the paragraph with: “Events and categories persist in **IndexedDB** (object stores `events` and `categories`, both keyed by `id`) and reload on app start. Records are stored as the in-memory `CalendarEvent`/`Category` objects verbatim; reads filter through the `isCalendarEvent`/`isCategory` type guards.”
8. §5 “SQLite layout” paragraph → replace with: “**IndexedDB layout:** object stores `events` (each record embeds its `recurrence` and `overrides`) and `categories`, both `keyPath: "id"`. Given personal-scale data volume, all events are loaded into memory and occurrences are expanded per visible window.”
9. §8: “(no Web Worker / WASM support, or private-browsing restrictions)” → “(no IndexedDB, or private-browsing restrictions)”.
10. §11: architecture line → “… ← storage (IndexedDB via `idb`; see §"Persistence: IndexedDB")”; tree: `DataDialog/ # JSON backup export/import (validate -> confirm -> swap)`, delete the `StorageLockedOverlay/` line, `storage/ # IndexedDB (idb); StorageError + guards; JSON backup`.
11. §13 storage bullet → “CRUD round-trips against fake-indexeddb (`resetDbForTests()` per test); errors map to the correct `StorageError` codes; backup export → validate → commit round-trips.”
12. §14 bundle note → drop the parenthetical about the vendored SQLite-WASM runtime.
13. §15 acceptance 6 → “With storage unavailable (no IndexedDB), the app shows a non-blocking banner and remains usable in-memory.”
14. §17 assumptions → “Modern evergreen browser with IndexedDB support.”

Then replace the entire final section `## Persistence: client-side SQLite (SQLite-WASM)` (including its migration-note blockquote) with:

```markdown
## Persistence: IndexedDB

All data persists locally in **IndexedDB** via the
[`idb`](https://github.com/jakearchibald/idb) library (a thin promise wrapper).
No backend; the database lives entirely in the browser profile.

- **Database:** `tuxbank`, version `1`, two object stores — `events` and
  `categories` — both keyed by `id` (`keyPath: "id"`). Records are stored as
  the in-memory `CalendarEvent` / `Category` objects verbatim; there is no
  mapping layer.
- **Connection:** a lazily created, module-cached `openDB()` promise
  (`src/lib/storage/index.ts`). A missing `indexedDB` global or a failed open
  maps to `StorageError("UNAVAILABLE")`; the cache resets on failure so a later
  call can retry.
- **Reads** filter every record through the `isCalendarEvent` / `isCategory`
  type guards — corrupt or foreign records are skipped, never crash the app.
- **Errors:** every repository function throws a typed `StorageError`
  (`UNAVAILABLE | QUOTA_EXCEEDED | BLOCKED | READ_FAILED | WRITE_FAILED |
  IMPORT_INVALID | EXPORT_FAILED`).
- **Multi-tab:** no locking — IndexedDB supports concurrent connections. Tabs
  don't live-sync state; last write wins and a refresh shows other-tab changes.
- **Testing:** vitest swaps in a fresh `fake-indexeddb` `IDBFactory` per test
  via `resetDbForTests()` (`src/lib/storage/testing.ts`).

### Backup / restore (JSON)

- **Export** (`exportDatabase`): downloads a pretty-printed JSON snapshot named
  `tuxbank-backup-YYYY-MM-DD.json`:

  ```json
  {
    "app": "tuxbank",
    "schemaVersion": 1,
    "exportedAt": "2026-06-03T18:00:00.000Z",
    "events": [],
    "categories": []
  }
  ```

- **Import** is a staged, destructive replace. `validateImport(text)` parses
  and validates the candidate (app marker, supported `schemaVersion`, every
  record passes its type guard) without touching the live database and returns
  an `ImportPreview` (`{ events, categories, schemaVersion }`) for the
  confirmation dialog. `commitImport(text)` clears both stores and writes all
  records in a single `readwrite` transaction — IndexedDB rolls the whole
  transaction back on failure, so a failed import never half-wipes data. Any
  invalid input throws `StorageError("IMPORT_INVALID")`.
```

- [ ] **Step 3: Verify formatting and checks**

Run: `pnpm format && pnpm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/TRD.md
git commit -m "docs: sync CLAUDE.md + TRD with IndexedDB/JSON-backup storage"
```

---

### Task 7: Final verification (automated + real browser)

**Files:** none (verification only)

- [ ] **Step 1: Full automated pass**

```bash
pnpm run check && pnpm test && pnpm build
```

Expected: all three PASS.

- [ ] **Step 2: Manual browser verification (jsdom can't catch layout/runtime-worker issues)**

```bash
pnpm dev
```

In a real browser (chrome-devtools MCP) at `http://localhost:3000`:

1. App loads with an empty calendar; DevTools → Application → IndexedDB shows database `tuxbank` with `events` + `categories` stores (no OPFS/sqlite entries, no worker).
2. Create an event with a custom category; reload the page → event persists.
3. Open DATA dialog → EXPORT DATABASE downloads `tuxbank-backup-<today>.json`; open the file — pretty-printed JSON with the event and category.
4. Delete the event, then IMPORT the downloaded file → preview shows correct counts → confirm → event and category restored.
5. Import a bogus `.json` (e.g. `{}`) → friendly "isn't a valid tuxbank backup" error, data untouched.
6. Open the app in a second tab → no lock overlay; both tabs usable.
7. Console: no errors; Network: no requests for `/sqlite/*`.

- [ ] **Step 3: Report results**

Report pass/fail for each check with evidence (screenshots/console output) before claiming completion. If anything fails, debug before proceeding — do not mark the plan complete with failing verification.
