# Export / Import Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user back up the entire tuxbank database to a downloadable `.sqlite3` file and restore it by importing that file, replacing all current data.

**Architecture:** A raw SQLite snapshot flows through the existing storage stack. The DB worker gains three ops — `export` (serialize the live DB), `import-validate` (verify an uploaded file in a throwaway in-memory DB, untouched live file), and `import-commit` (swap the OPFS file + reopen). A React-free `dbFile` helper holds the sqlite-wasm serialize/validate logic, shared by the worker and the in-memory test connection. The `CalendarContext` exposes `exportData` / `previewImport` / `importData`; a new `DataDialog` (opened from a `◢ DATA` toolbar button) drives the validate-then-confirm-then-swap UX.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (ESM), `@sqlite.org/sqlite-wasm` 3.53.0 (OPFS SAHPool VFS in a Web Worker; same engine in-memory for tests), shadcn/ui Dialog, vitest + @testing-library/react.

**Branch:** `feat/export-import-database` (already created; the spec commit is on it).

---

## Background the implementer needs

- **The sqlite-wasm APIs used (verified present in 3.53.0):**
  - `sqlite3.capi.sqlite3_js_db_export(dbPointer): Uint8Array` — serialize an open DB to bytes. Synchronous.
  - `sqlite3.wasm.allocFromTypedArray(bytes): number` — copy a `Uint8Array` into WASM heap, returns a pointer.
  - `sqlite3.capi.sqlite3_deserialize(dbPointer, "main", dataPtr, size, size, flags): number` — load bytes into an open DB. Returns an rc (`sqlite3.capi.SQLITE_OK` === 0 on success). Use flags `SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE`.
  - `poolUtil.importDb(filename, bytes): Promise<number>` — **async**; write raw bytes into a SAHPool file (validates the SQLite header).
  - `new poolUtil.OpfsSAHPoolDb(filename)` — (re)open a DB on a SAHPool file.
  - `WasmPointer` is just `number`; `DbPtr = Database | number` (so passing `db.pointer` — a `number` — is fine).
- **Worker module never statically imports the sqlite-wasm package** (Turbopack can't bundle it). Any new file reachable from `connection/worker.ts` must use a **type-only** `import()` for sqlite types, never a value import. `dbFile.ts` (below) follows this rule.
- **Tests run against the real engine in-memory** via `createMemoryConnection()` / `resetDbForTests()`. The worker and `workerConnection` cannot run under jsdom, so they are implemented carefully and verified manually in a browser at the end.
- **Error model:** `StorageError` carries a typed `code`. We add `IMPORT_INVALID` (file isn't a valid/compatible tuxbank DB) and `EXPORT_FAILED`.

---

## File Structure

**Create:**
- `src/lib/storage/connection/dbFile.ts` — React-free sqlite serialize/validate helpers (`exportBytes`, `deserializeInto`, `validateBytes`). Reachable from the worker → type-only sqlite import.
- `src/utils/downloadBlob/index.ts` — trigger a browser download of a `Blob`.
- `src/utils/downloadBlob/tests.ts`
- `src/components/DataDialog/index.tsx` — Export/Import dialog with the validate→confirm→swap state machine.
- `src/components/DataDialog/types.ts`
- `src/components/DataDialog/tests.tsx`

**Modify:**
- `src/lib/storage/types.ts` — new error codes, `isStorageErrorCode`, `ImportPreview`, three new `DbConnection` methods.
- `src/lib/storage/connection/memoryConnection.ts` — implement the three new methods.
- `src/lib/storage/connection/tests.ts` — export/import behavior tests.
- `src/lib/storage/index.ts` — `exportDatabase`, `validateImport`, `commitImport` repo functions.
- `src/lib/storage/tests.ts` — repo-level export/import + error-wrapping tests.
- `src/lib/storage/connection/workerConnection.ts` — generalize the RPC + add the three methods + propagate error codes.
- `src/lib/storage/connection/worker.ts` — module-scope sqlite refs + three new ops (`import-commit` is async).
- `src/context/CalendarContext/types.ts` — `exportData` / `previewImport` / `importData` on the context value.
- `src/context/CalendarContext/index.tsx` — implement them + a `reloadData` helper.
- `src/context/CalendarContext/tests.tsx` — round-trip + preview tests.
- `src/components/CalendarToolbar/types.ts` — `onManageData`.
- `src/components/CalendarToolbar/index.tsx` — `◢ DATA` button.
- `src/app/page.tsx` — `dataOpen` state + render `DataDialog`.
- `docs/TRD.md` — document export/import.

---

## Task 1: Storage types — error codes, guard, `ImportPreview`, `DbConnection` methods

**Files:**
- Modify: `src/lib/storage/types.ts`
- Test: `src/lib/storage/types.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isStorageErrorCode } from "./types";

describe("isStorageErrorCode", () => {
  it("accepts known codes", () => {
    expect(isStorageErrorCode("IMPORT_INVALID")).toBe(true);
    expect(isStorageErrorCode("EXPORT_FAILED")).toBe(true);
    expect(isStorageErrorCode("WRITE_FAILED")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isStorageErrorCode("NOPE")).toBe(false);
    expect(isStorageErrorCode(42)).toBe(false);
    expect(isStorageErrorCode(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/storage/types.test.ts`
Expected: FAIL — `isStorageErrorCode` is not exported.

- [ ] **Step 3: Edit `src/lib/storage/types.ts`**

Add `isString` import at the top, extend the union, and add the guard, `ImportPreview`, and the three `DbConnection` methods. The full updated file:

```ts
import { isString } from "remeda";

export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "LOCKED"
  | "IMPORT_INVALID"
  | "EXPORT_FAILED";

const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = [
  "UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "BLOCKED",
  "VERSION_ERROR",
  "READ_FAILED",
  "WRITE_FAILED",
  "LOCKED",
  "IMPORT_INVALID",
  "EXPORT_FAILED",
];

export const isStorageErrorCode = (
  value: unknown,
): value is StorageErrorCode =>
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

/** Values SQLite columns hold/return in this app (no BLOB, no bigint). */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

/** Summary of a candidate import file, shown before the destructive swap. */
export interface ImportPreview {
  events: number;
  categories: number;
  schemaVersion: number;
}

/** Minimal structural view of a sqlite-wasm oo1 DB handle. */
export interface Oo1Db {
  selectObjects(sql: string, bind?: SqlValue[]): Record<string, unknown>[];
  exec(opts: { sql: string; bind?: SqlValue[] }): unknown;
  transaction(callback: () => void): unknown;
}

/** Synchronous DB primitives (over an oo1 DB). */
export interface SyncDb {
  selectAll(sql: string, bind?: SqlValue[]): Row[];
  run(sql: string, bind?: SqlValue[]): void;
  tx(ops: { sql: string; bind?: SqlValue[] }[]): void;
}

/** Async DB interface the repository depends on (memory or worker). */
export interface DbConnection {
  selectAll(sql: string, bind?: SqlValue[]): Promise<Row[]>;
  run(sql: string, bind?: SqlValue[]): Promise<void>;
  tx(ops: { sql: string; bind?: SqlValue[] }[]): Promise<void>;
  /** Serialize the whole database to bytes. */
  exportDb(): Promise<Uint8Array>;
  /** Validate candidate bytes WITHOUT touching the live database. */
  validateImport(bytes: Uint8Array): Promise<ImportPreview>;
  /** Replace the live database with the (validated) bytes. */
  commitImport(bytes: Uint8Array): Promise<void>;
}

export type ConnectionStatus =
  | "connecting"
  | "ready"
  | "waiting-locked"
  | "unavailable";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/storage/types.test.ts`
Expected: PASS.

> Note: TypeScript will now report that `memoryConnection` and `workerConnection` don't implement the three new `DbConnection` methods. That's expected — Tasks 2 and 5 fix it. Do not run `pnpm check` until then.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/types.ts src/lib/storage/types.test.ts
git commit -m "feat(storage): add IMPORT_INVALID/EXPORT_FAILED codes + ImportPreview + DbConnection export/import"
```

---

## Task 2: `dbFile` helper + in-memory connection export/import

**Files:**
- Create: `src/lib/storage/connection/dbFile.ts`
- Modify: `src/lib/storage/connection/memoryConnection.ts`
- Test: `src/lib/storage/connection/tests.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/storage/connection/tests.ts`:

```ts
describe("export / import (in-memory)", () => {
  it("round-trips the database via export + commitImport", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([]);
    await b.commitImport(bytes);
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([
      { id: "c1" },
    ]);
  });

  it("validateImport returns counts + schema version without changing data", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    expect(await b.validateImport(bytes)).toEqual({
      events: 0,
      categories: 1,
      schemaVersion: 1,
    });
    // unchanged
    expect(await b.selectAll("SELECT id FROM categories")).toEqual([]);
  });

  it("rejects a non-sqlite buffer with IMPORT_INVALID", async () => {
    const a = await createMemoryConnection();
    await expect(
      a.commitImport(new Uint8Array([1, 2, 3, 4])),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
  });

  it("rejects a valid sqlite db missing our tables", async () => {
    const a = await createMemoryConnection();
    await a.run("DROP TABLE event_overrides");
    await a.run("DROP TABLE events");
    await a.run("DROP TABLE categories");
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    await expect(b.validateImport(bytes)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("rejects a db whose schema version differs", async () => {
    const a = await createMemoryConnection();
    await a.run("PRAGMA user_version = 99");
    const bytes = await a.exportDb();

    const b = await createMemoryConnection();
    await expect(b.validateImport(bytes)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("does not corrupt existing data when commitImport is rejected", async () => {
    const a = await createMemoryConnection();
    await a.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "keep",
      "Keep",
      "cyan",
    ]);
    await expect(
      a.commitImport(new Uint8Array([1, 2, 3])),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
    expect(await a.selectAll("SELECT id FROM categories")).toEqual([
      { id: "keep" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/storage/connection/tests.ts`
Expected: FAIL — `a.exportDb`/`validateImport`/`commitImport` are not functions.

- [ ] **Step 3: Create `src/lib/storage/connection/dbFile.ts`**

```ts
import { isNumber, isString } from "remeda";
import { StorageError } from "../types";
import type { ImportPreview } from "../types";
import { SCHEMA_VERSION } from "../consts";

// Type-only: erased at compile time, so the sqlite-wasm package is NEVER bundled
// here. This file is reachable from the DB worker, which must not statically
// import the package (Turbopack can't bundle its Worker1 dynamic import).
type Sqlite3 = Awaited<
  ReturnType<(typeof import("@sqlite.org/sqlite-wasm"))["default"]>
>;

const SQLITE_HEADER = "SQLite format 3\u0000";
const EXPECTED_TABLES = ["categories", "events", "event_overrides"] as const;

const hasSqliteHeader = (bytes: Uint8Array): boolean => {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i++) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
};

/** Serialize an open DB (by pointer) to bytes. */
export const exportBytes = (
  sqlite3: Sqlite3,
  dbPointer: number | undefined,
): Uint8Array => {
  if (dbPointer === undefined) throw new StorageError("EXPORT_FAILED", "no-db");
  return sqlite3.capi.sqlite3_js_db_export(dbPointer);
};

/** Load bytes into an already-open DB (by pointer), replacing its contents. */
export const deserializeInto = (
  sqlite3: Sqlite3,
  dbPointer: number | undefined,
  bytes: Uint8Array,
): void => {
  if (dbPointer === undefined) throw new StorageError("IMPORT_INVALID", "no-db");
  const dataPtr = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(
    dbPointer,
    "main",
    dataPtr,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc !== sqlite3.capi.SQLITE_OK) {
    throw new StorageError("IMPORT_INVALID", `deserialize-rc-${rc}`);
  }
};

/**
 * Verify candidate bytes are a compatible tuxbank database by loading them into
 * a throwaway in-memory DB. Throws StorageError("IMPORT_INVALID") on any
 * mismatch. Never touches a live database.
 */
export const validateBytes = (
  sqlite3: Sqlite3,
  bytes: Uint8Array,
): ImportPreview => {
  if (!hasSqliteHeader(bytes)) {
    throw new StorageError("IMPORT_INVALID", "bad-header");
  }
  const tmp = new sqlite3.oo1.DB(":memory:", "c");
  try {
    deserializeInto(sqlite3, tmp.pointer, bytes);

    const scalar = (sql: string): unknown => {
      const rows = tmp.selectObjects(sql);
      const row = rows[0];
      if (!row) return undefined;
      const keys = Object.keys(row);
      return keys.length ? row[keys[0]] : undefined;
    };

    if (scalar("PRAGMA integrity_check") !== "ok") {
      throw new StorageError("IMPORT_INVALID", "integrity");
    }

    const tableNames = new Set(
      tmp
        .selectObjects("SELECT name FROM sqlite_master WHERE type='table'")
        .map((r) => r.name)
        .filter(isString),
    );
    for (const table of EXPECTED_TABLES) {
      if (!tableNames.has(table)) {
        throw new StorageError("IMPORT_INVALID", `missing-table-${table}`);
      }
    }

    const version = scalar("PRAGMA user_version");
    if (!isNumber(version) || version !== SCHEMA_VERSION) {
      throw new StorageError("IMPORT_INVALID", `version-${String(version)}`);
    }

    const count = (table: string): number => {
      const value = scalar(`SELECT count(*) AS n FROM ${table}`);
      return isNumber(value) ? value : 0;
    };

    return {
      events: count("events"),
      categories: count("categories"),
      schemaVersion: version,
    };
  } finally {
    tmp.close();
  }
};
```

- [ ] **Step 4: Edit `src/lib/storage/connection/memoryConnection.ts`**

Capture `sqlite3`/`db` and add the three methods. Full updated file:

```ts
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbConnection } from "../types";
import { initSyncDb } from "./sqliteDb";
import { exportBytes, validateBytes, deserializeInto } from "./dbFile";

/** Same wasm engine as production, in-memory (no OPFS/worker). Node + tests. */
export const createMemoryConnection = async (): Promise<DbConnection> => {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(":memory:", "c");
  const sync = initSyncDb(db);
  return {
    selectAll: (sql, bind = []) => {
      try {
        return Promise.resolve(sync.selectAll(sql, bind));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    run: (sql, bind = []) => {
      try {
        sync.run(sql, bind);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    tx: (ops) => {
      try {
        sync.tx(ops);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    exportDb: () => {
      try {
        return Promise.resolve(exportBytes(sqlite3, db.pointer));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    validateImport: (bytes) => {
      try {
        return Promise.resolve(validateBytes(sqlite3, bytes));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    commitImport: (bytes) => {
      try {
        validateBytes(sqlite3, bytes); // throws IMPORT_INVALID before any swap
        deserializeInto(sqlite3, db.pointer, bytes);
        sync.run("PRAGMA foreign_keys = ON"); // re-assert connection pragma
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/lib/storage/connection/tests.ts`
Expected: PASS (all export/import cases + the existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/connection/dbFile.ts src/lib/storage/connection/memoryConnection.ts src/lib/storage/connection/tests.ts
git commit -m "feat(storage): sqlite export/validate/deserialize helpers + in-memory connection"
```

---

## Task 3: Repository export/import functions

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/storage/tests.ts`. (Update the import on line 3–11 to also import `exportDatabase`, `validateImport`, `commitImport`.)

Updated import block:

```ts
import {
  getAllEvents,
  putEvent,
  deleteEvent,
  getAllCategories,
  putCategory,
  deleteCategory,
  seedCategoriesFromEvents,
  exportDatabase,
  validateImport,
  commitImport,
} from "./index";
```

New describe block (append at end of file; `make` is already defined above in this file):

```ts
describe("export / import (repository)", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("round-trips the whole database through export + commitImport", async () => {
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
    await putEvent(make("a"));
    const bytes = await exportDatabase();

    await deleteEvent("a");
    await deleteCategory("rent");
    expect(await getAllEvents()).toEqual([]);

    await commitImport(bytes);
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
    expect((await getAllCategories()).map((c) => c.id)).toEqual(["rent"]);
  });

  it("validateImport reports the backup's record counts", async () => {
    await putEvent(make("a"));
    await putEvent(make("b"));
    const bytes = await exportDatabase();
    expect(await validateImport(bytes)).toEqual({
      events: 2,
      categories: 0,
      schemaVersion: 1,
    });
  });

  it("rejects an invalid file with IMPORT_INVALID and keeps existing data", async () => {
    await putEvent(make("a"));
    await expect(
      commitImport(new Uint8Array([1, 2, 3])),
    ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/storage/tests.ts`
Expected: FAIL — `exportDatabase` is not exported.

- [ ] **Step 3: Edit `src/lib/storage/index.ts`**

Add `ImportPreview` to the type import on line 2, then add three functions after `seedCategoriesFromEvents` (anywhere among the exported repo functions). Updated import line:

```ts
import type { CalendarEvent, Category } from "@/types";
import type { ImportPreview } from "./types";
```

New functions:

```ts
export const exportDatabase = async (): Promise<Uint8Array> => {
  try {
    const conn = await getConnection();
    return await conn.exportDb();
  } catch (error) {
    throw toStorageError(error, "EXPORT_FAILED");
  }
};

export const validateImport = async (
  bytes: Uint8Array,
): Promise<ImportPreview> => {
  try {
    const conn = await getConnection();
    return await conn.validateImport(bytes);
  } catch (error) {
    throw toStorageError(error, "IMPORT_INVALID");
  }
};

export const commitImport = async (bytes: Uint8Array): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.commitImport(bytes);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};
```

> `toStorageError` returns the error unchanged if it is already a `StorageError`, so a thrown `IMPORT_INVALID` keeps its code; only non-StorageError failures get the fallback code.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/storage/tests.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/index.ts src/lib/storage/tests.ts
git commit -m "feat(storage): exportDatabase/validateImport/commitImport repository API"
```

---

## Task 4: Worker RPC connection — export/import methods + error-code propagation

**Files:**
- Modify: `src/lib/storage/connection/workerConnection.ts`

> No automated test: `workerConnection` requires a real `Worker`, which jsdom does not provide (the existing file is untested for the same reason). Implement carefully; the browser verification in Task 11 exercises this path.

- [ ] **Step 1: Replace `src/lib/storage/connection/workerConnection.ts`**

```ts
import { StorageError, isStorageErrorCode } from "../types";
import type {
  ConnectionStatus,
  DbConnection,
  ImportPreview,
  Row,
  SqlValue,
  StorageErrorCode,
} from "../types";

interface WorkerOk {
  rows?: Row[];
  bytes?: Uint8Array;
  preview?: ImportPreview;
}

type Pending = {
  resolve: (value: WorkerOk) => void;
  reject: (error: StorageError) => void;
  read: boolean;
};

export const createWorkerConnection = (
  emit: (status: ConnectionStatus) => void,
): DbConnection => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  let nextId = 1;
  const pending = new Map<number, Pending>();

  let resolveReady = (): void => {};
  let rejectReady: (error: StorageError) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  emit("connecting");

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.type === "status") {
      emit(message.status);
      if (message.status === "ready") resolveReady();
      else if (message.status === "unavailable")
        rejectReady(new StorageError("UNAVAILABLE", message.error));
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) {
      const explicit: StorageErrorCode | null = isStorageErrorCode(message.code)
        ? message.code
        : null;
      const code: StorageErrorCode =
        explicit ??
        (entry.read
          ? "READ_FAILED"
          : String(message.error).toLowerCase().includes("full")
            ? "QUOTA_EXCEEDED"
            : "WRITE_FAILED");
      entry.reject(new StorageError(code, message.error));
    } else {
      entry.resolve({
        rows: message.rows,
        bytes: message.bytes,
        preview: message.preview,
      });
    }
  };

  worker.onerror = (event) => {
    rejectReady(new StorageError("UNAVAILABLE", event.message));
  };

  const call = (
    payload: {
      op: string;
      sql?: string;
      bind?: SqlValue[];
      ops?: unknown;
      bytes?: Uint8Array;
    },
    read: boolean,
  ): Promise<WorkerOk> =>
    new Promise<WorkerOk>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, read });
      worker.postMessage({ id, ...payload });
    });

  return {
    async selectAll(sql, bind = []) {
      await ready;
      const { rows } = await call({ op: "selectAll", sql, bind }, true);
      return rows ?? [];
    },
    async run(sql, bind = []) {
      await ready;
      await call({ op: "run", sql, bind }, false);
    },
    async tx(ops) {
      await ready;
      await call({ op: "tx", ops }, false);
    },
    async exportDb() {
      await ready;
      const { bytes } = await call({ op: "export" }, true);
      if (!bytes) throw new StorageError("EXPORT_FAILED");
      return bytes;
    },
    async validateImport(bytes) {
      await ready;
      const { preview } = await call(
        { op: "import-validate", bytes },
        true,
      );
      if (!preview) throw new StorageError("IMPORT_INVALID");
      return preview;
    },
    async commitImport(bytes) {
      await ready;
      await call({ op: "import-commit", bytes }, false);
    },
  };
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors in `workerConnection.ts`. (The worker still lacks the new ops — that's Task 5 — but `worker.ts` is loosely typed via `event.data`, so this typechecks now. If `worker.ts` reports errors, proceed to Task 5 before the full `pnpm check`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/connection/workerConnection.ts
git commit -m "feat(storage): worker RPC export/import methods + typed error-code propagation"
```

---

## Task 5: DB worker — module-scope refs + export/validate/commit ops

**Files:**
- Modify: `src/lib/storage/connection/worker.ts`

> No automated test (no Worker under jsdom). Verified in the browser in Task 11.

- [ ] **Step 1: Replace `src/lib/storage/connection/worker.ts`**

```ts
import { DB_FILENAME, LOCK_NAME, POOL_DIR, VFS_NAME } from "../consts";
import { StorageError } from "../types";
import type { SyncDb } from "../types";
import { initSyncDb } from "./sqliteDb";
import { exportBytes, validateBytes } from "./dbFile";

// sqlite-wasm is loaded at runtime from public/sqlite/ (copied by
// scripts/copy-sqlite-wasm.mjs) rather than imported statically. Its package
// entry pulls in the Worker1 promiser, whose `new Worker(new URL(<dynamic>,
// import.meta.url))` Turbopack cannot statically bundle. The `turbopackIgnore`
// comment + runtime URL keep it out of the build graph. The type is recovered
// via a type-only `import()` (erased at compile time, so nothing is bundled).
type Sqlite3InitFn = (typeof import("@sqlite.org/sqlite-wasm"))["default"];
type Sqlite3 = Awaited<ReturnType<Sqlite3InitFn>>;
type PoolUtil = Awaited<ReturnType<Sqlite3["installOpfsSAHPoolVfs"]>>;
type SahDb = InstanceType<PoolUtil["OpfsSAHPoolDb"]>;
const SQLITE_WASM_URL = "/sqlite/index.mjs";

// Structural view of the dedicated worker global. TS environment annotation
// only — external message data is still validated by shape before use.
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  navigator: { locks: LockManager };
}
const ctx = globalThis as unknown as WorkerScope;

let sqlite3: Sqlite3 | null = null;
let poolUtil: PoolUtil | null = null;
let db: SahDb | null = null;
let sync: SyncDb | null = null;

const initSqlite = async (): Promise<Sqlite3 | null> => {
  try {
    const mod = await import(/* turbopackIgnore: true */ SQLITE_WASM_URL);
    const init: Sqlite3InitFn = mod.default;
    return await init();
  } catch (error) {
    ctx.postMessage({
      type: "status",
      status: "unavailable",
      error: String(error),
    });
    return null;
  }
};

/** Replace the live OPFS database with validated bytes, then reopen. */
const commitImport = async (id: number, bytes: Uint8Array): Promise<void> => {
  // Capture into locals: module-level `let`s assigned inside closures aren't
  // narrowed by TS across the awaits/calls below.
  const s3 = sqlite3;
  const pool = poolUtil;
  const current = db;
  if (!s3 || !pool || !current) {
    ctx.postMessage({ id, error: "NOT_READY" });
    return;
  }
  try {
    validateBytes(s3, bytes); // throws IMPORT_INVALID — live file untouched
    sync = null; // appear not-ready while the file is swapped out
    current.close();
    await pool.importDb(DB_FILENAME, bytes);
    const reopened = new pool.OpfsSAHPoolDb(DB_FILENAME);
    db = reopened;
    sync = initSyncDb(reopened);
    ctx.postMessage({ id });
  } catch (error) {
    // Recover a live connection so the app keeps working after a failed swap.
    try {
      const recovered = new pool.OpfsSAHPoolDb(DB_FILENAME);
      db = recovered;
      sync = initSyncDb(recovered);
    } catch {
      // leave sync null; subsequent ops report NOT_READY
    }
    ctx.postMessage({
      id,
      error: String(error),
      code: error instanceof StorageError ? error.code : undefined,
    });
  }
};

const boot = async (): Promise<void> => {
  sqlite3 = await initSqlite();
  if (!sqlite3) return;
  const s3 = sqlite3;

  const open = async (): Promise<void> => {
    try {
      const pool = await s3.installOpfsSAHPoolVfs({
        name: VFS_NAME,
        directory: POOL_DIR,
        clearOnInit: false,
        initialCapacity: 6,
      });
      const handle = new pool.OpfsSAHPoolDb(DB_FILENAME);
      poolUtil = pool;
      db = handle;
      sync = initSyncDb(handle);
      ctx.postMessage({ type: "status", status: "ready" });
    } catch (error) {
      ctx.postMessage({
        type: "status",
        status: "unavailable",
        error: String(error),
      });
    }
  };

  // Grab the DB lock; if another tab holds it, announce and wait for handoff.
  void ctx.navigator.locks.request(
    LOCK_NAME,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (lock) {
        await open();
        await new Promise<never>(() => {}); // hold the lock for the worker's lifetime
        return;
      }
      ctx.postMessage({ type: "status", status: "waiting-locked" });
      await ctx.navigator.locks.request(
        LOCK_NAME,
        { mode: "exclusive" },
        async () => {
          await open();
          await new Promise<never>(() => {}); // hold
        },
      );
    },
  );
};

ctx.onmessage = (event: MessageEvent) => {
  const message = event.data;
  // Capture into locals so TS narrows them across the branch body (module-level
  // `let`s assigned in closures are otherwise widened back to `| null`).
  const s3 = sqlite3;
  const current = db;
  const syncDb = sync;
  if (!syncDb || !s3 || !poolUtil || !current) {
    ctx.postMessage({ id: message.id, error: "NOT_READY" });
    return;
  }
  try {
    if (message.op === "selectAll") {
      ctx.postMessage({
        id: message.id,
        rows: syncDb.selectAll(message.sql, message.bind),
      });
    } else if (message.op === "run") {
      syncDb.run(message.sql, message.bind);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "tx") {
      syncDb.tx(message.ops);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "export") {
      const bytes = exportBytes(s3, current.pointer);
      ctx.postMessage({ id: message.id, bytes }, [bytes.buffer]);
    } else if (message.op === "import-validate") {
      const preview = validateBytes(s3, message.bytes);
      ctx.postMessage({ id: message.id, preview });
    } else if (message.op === "import-commit") {
      void commitImport(message.id, message.bytes);
    }
  } catch (error) {
    ctx.postMessage({
      id: message.id,
      error: String(error),
      code: error instanceof StorageError ? error.code : undefined,
    });
  }
};

void boot();
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/connection/worker.ts
git commit -m "feat(storage): worker export/import-validate/import-commit ops"
```

---

## Task 6: `downloadBlob` utility

**Files:**
- Create: `src/utils/downloadBlob/index.ts`
- Test: `src/utils/downloadBlob/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/downloadBlob/tests.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadBlob } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadBlob", () => {
  it("creates an object URL, clicks a download anchor, and revokes the URL", () => {
    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const blob = new Blob(["data"], { type: "application/x-sqlite3" });
    downloadBlob(blob, "tuxbank-backup-2026-05-31.sqlite3");

    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(anchor.getAttribute("href")).toBe("blob:fake");
    expect(anchor.download).toBe("tuxbank-backup-2026-05-31.sqlite3");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:fake");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/utils/downloadBlob/tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/utils/downloadBlob/index.ts`**

```ts
/** Trigger a browser download of a Blob under the given filename. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/utils/downloadBlob/tests.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/downloadBlob/
git commit -m "feat(utils): downloadBlob helper"
```

---

## Task 7: CalendarContext — exportData / previewImport / importData

**Files:**
- Modify: `src/context/CalendarContext/types.ts`
- Modify: `src/context/CalendarContext/index.tsx`
- Test: `src/context/CalendarContext/tests.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/context/CalendarContext/tests.tsx`. First extend the imports at the top to add `exportDatabase`:

```ts
import { exportDatabase } from "@/lib/storage";
```

New tests (append inside the existing `describe("CalendarContext", ...)` block, before its closing `});`):

```ts
  it("exports and re-imports the database, restoring events", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Paycheck",
        date: "2026-05-08",
        categoryId: "work",
        amount: 1000,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const bytes = await exportDatabase();
    const file = new File([bytes], "backup.sqlite3");

    await act(async () => {
      await result.current.deleteEvent(
        result.current.events[0].id,
        "all",
        "2026-05-08",
      );
    });
    await waitFor(() => expect(result.current.events).toHaveLength(0));

    await act(async () => {
      await result.current.importData(file);
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].title).toBe("Paycheck");
  });

  it("previewImport reports the backup's record counts", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.createEvent({
        title: "A",
        date: "2026-05-08",
        categoryId: "work",
        amount: 1,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const bytes = await exportDatabase();
    const preview = await result.current.previewImport(
      new File([bytes], "backup.sqlite3"),
    );
    expect(preview.events).toBe(1);
    expect(preview.schemaVersion).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/context/CalendarContext/tests.tsx`
Expected: FAIL — `result.current.importData` / `previewImport` are not functions.

- [ ] **Step 3: Edit `src/context/CalendarContext/types.ts`**

Add the `ImportPreview` import and three methods to `CalendarContextValue`:

```ts
import type { ImportPreview } from "@/lib/storage";
```

Add inside `CalendarContextValue` (after `deleteCategory`):

```ts
  exportData: () => Promise<void>;
  previewImport: (file: File) => Promise<ImportPreview>;
  importData: (file: File) => Promise<void>;
```

- [ ] **Step 4: Edit `src/context/CalendarContext/index.tsx`**

Add to the `@/lib/storage` import (the existing block importing `getAllEvents`, etc.):

```ts
  exportDatabase,
  validateImport,
  commitImport,
```

Add a new import for the download helper near the other imports:

```ts
import { downloadBlob } from "@/utils/downloadBlob";
```

Add these callbacks alongside the other `useCallback` handlers (e.g. just after `persist`):

```ts
  const reloadData = useCallback(async () => {
    const [loadedEvents, loadedCategories] = await Promise.all([
      getAllEvents(),
      getAllCategories(),
    ]);
    categoriesRef.current = loadedCategories;
    setCategories(loadedCategories);
    setEvents(loadedEvents);
    setHiddenCategoryIds(new Set());
  }, []);

  const exportData = useCallback(async () => {
    const bytes = await exportDatabase();
    downloadBlob(
      new Blob([bytes], { type: "application/x-sqlite3" }),
      `tuxbank-backup-${format(new Date(), "yyyy-MM-dd")}.sqlite3`,
    );
  }, []);

  const previewImport = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return validateImport(bytes);
  }, []);

  const importData = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await commitImport(bytes);
      await reloadData();
    },
    [reloadData],
  );
```

Add the three to the `value` object (after `deleteCategory`):

```ts
    exportData,
    previewImport,
    importData,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/context/CalendarContext/tests.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/context/CalendarContext/types.ts src/context/CalendarContext/index.tsx src/context/CalendarContext/tests.tsx
git commit -m "feat(context): exportData/previewImport/importData with state reload"
```

---

## Task 8: DataDialog component

**Files:**
- Create: `src/components/DataDialog/types.ts`
- Create: `src/components/DataDialog/index.tsx`
- Test: `src/components/DataDialog/tests.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/DataDialog/tests.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageError } from "@/lib/storage";
import DataDialog from "./index";

const base = {
  open: true,
  currentEventCount: 3,
  currentCategoryCount: 2,
  storageAvailable: true,
  onExport: vi.fn().mockResolvedValue(undefined),
  onPreviewImport: vi
    .fn()
    .mockResolvedValue({ events: 5, categories: 4, schemaVersion: 1 }),
  onCommitImport: vi.fn().mockResolvedValue(undefined),
  onOpenChange: vi.fn(),
};

const fileInput = (): HTMLElement =>
  screen.getByLabelText(/import database file/i);

describe("DataDialog", () => {
  it("triggers export when the export button is clicked", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<DataDialog {...base} onExport={onExport} />);
    await userEvent.click(
      screen.getByRole("button", { name: /export database/i }),
    );
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("validates a chosen file and shows the confirmation with counts", async () => {
    render(<DataDialog {...base} />);
    const file = new File([new Uint8Array([1, 2, 3])], "backup.sqlite3");
    await userEvent.upload(fileInput(), file);

    expect(base.onPreviewImport).toHaveBeenCalledWith(file);
    expect(await screen.findByText(/replace all current data/i)).toBeInTheDocument();
    // current counts and backup counts both shown
    expect(screen.getByText(/3 events/i)).toBeInTheDocument();
    expect(screen.getByText(/5 events/i)).toBeInTheDocument();
  });

  it("commits the import after the user confirms", async () => {
    const onCommitImport = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <DataDialog
        {...base}
        onCommitImport={onCommitImport}
        onOpenChange={onOpenChange}
      />,
    );
    const file = new File([new Uint8Array([1, 2, 3])], "backup.sqlite3");
    await userEvent.upload(fileInput(), file);
    await userEvent.click(
      await screen.findByRole("button", { name: /replace data/i }),
    );
    expect(onCommitImport).toHaveBeenCalledWith(file);
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a clear error for an invalid backup and does not confirm", async () => {
    const onPreviewImport = vi
      .fn()
      .mockRejectedValue(new StorageError("IMPORT_INVALID"));
    render(<DataDialog {...base} onPreviewImport={onPreviewImport} />);
    const file = new File([new Uint8Array([9])], "bad.txt");
    await userEvent.upload(fileInput(), file);

    expect(
      await screen.findByText(/isn't a valid tuxbank backup/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /replace data/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/components/DataDialog/tests.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/DataDialog/types.ts`**

```ts
import type { ImportPreview } from "@/lib/storage";

export type DataDialogProps = {
  open: boolean;
  currentEventCount: number;
  currentCategoryCount: number;
  storageAvailable: boolean;
  onExport: () => Promise<void>;
  onPreviewImport: (file: File) => Promise<ImportPreview>;
  onCommitImport: (file: File) => Promise<void>;
  onOpenChange: (open: boolean) => void;
};
```

- [ ] **Step 4: Create `src/components/DataDialog/index.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import type { ImportPreview } from "@/lib/storage";
import { isStorageError } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CyberFrame } from "@/components/CyberFrame";

import type { DataDialogProps } from "./types";

export * from "./types";

type Stage =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "confirm"; file: File; preview: ImportPreview }
  | { kind: "importing" }
  | { kind: "error"; message: string };

const friendlyError = (error: unknown): string => {
  if (isStorageError(error) && error.code === "IMPORT_INVALID") {
    return "That file isn't a valid tuxbank backup (or it was made by a different version).";
  }
  return "Something went wrong reading that file. Please try again.";
};

const DataDialog = ({
  open,
  currentEventCount,
  currentCategoryCount,
  storageAvailable,
  onExport,
  onPreviewImport,
  onCommitImport,
  onOpenChange,
}: DataDialogProps) => {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => setStage({ kind: "idle" });

  const handleExport = async () => {
    try {
      await onExport();
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

  const handleFile = async (file: File) => {
    setStage({ kind: "validating" });
    try {
      const preview = await onPreviewImport(file);
      setStage({ kind: "confirm", file, preview });
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

  const handleConfirm = async (file: File) => {
    setStage({ kind: "importing" });
    try {
      await onCommitImport(file);
      reset();
      onOpenChange(false);
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <CyberFrame />
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            Data
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Download a full backup of your database
              {" "}({currentEventCount} events, {currentCategoryCount}{" "}
              categories).
            </p>
            <Button
              type="button"
              className="cy-btn justify-start"
              onClick={handleExport}
            >
              ◢ EXPORT DATABASE
            </Button>
          </section>

          <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Restore from a backup file. This replaces all current data.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".sqlite3,.sqlite,.db"
              aria-label="Import database file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow re-selecting the same file
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              className="cy-btn justify-start"
              disabled={stage.kind === "validating" || stage.kind === "importing"}
              onClick={() => inputRef.current?.click()}
            >
              ◢ IMPORT DATABASE
            </Button>
          </section>

          {stage.kind === "validating" && (
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Validating backup…
            </p>
          )}

          {stage.kind === "confirm" && (
            <div className="cy-mono flex flex-col gap-2 border-t border-[color:var(--cy-magenta)] pt-3 text-xs">
              <span>
                Replace all current data ({currentEventCount} events,{" "}
                {currentCategoryCount} categories) with this backup (
                {stage.preview.events} events, {stage.preview.categories}{" "}
                categories)? This cannot be undone.
              </span>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="text-[color:var(--cy-magenta)]"
                  onClick={() => void handleConfirm(stage.file)}
                >
                  Replace data
                </Button>
              </div>
            </div>
          )}

          {stage.kind === "importing" && (
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Importing…
            </p>
          )}

          {stage.kind === "error" && (
            <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
              {stage.message}
            </p>
          )}

          {!storageAvailable && (
            <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
              Storage is unavailable — export/import is disabled this session.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DataDialog;
```

> Note: when `storageAvailable` is false, the parent gates this via the toolbar (Task 10 only opens the dialog from a button that stays visible); the inline message covers the edge case where the connection drops while the dialog is open. The Export/Import buttons remain clickable but the underlying calls reject and surface as the friendly error — acceptable for this single-user app.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/components/DataDialog/tests.tsx`
Expected: PASS.

> If `userEvent.upload` does not fire the handler for a hidden input in this setup, switch the test to `fireEvent.change(fileInput(), { target: { files: [file] } })` (import `fireEvent` from `@testing-library/react`). The component is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/DataDialog/
git commit -m "feat(ui): DataDialog with export + validate/confirm/import flow"
```

---

## Task 9: Toolbar button + page wiring

**Files:**
- Modify: `src/components/CalendarToolbar/types.ts`
- Modify: `src/components/CalendarToolbar/index.tsx`
- Modify: `src/app/page.tsx`

> The toolbar has no test file and `page.tsx` is the composition root; this task is verified by typecheck + the browser run in Task 11.

- [ ] **Step 1: Edit `src/components/CalendarToolbar/types.ts`**

Add `onManageData` to `CalendarToolbarProps` (after `onManageCategories`):

```ts
  onManageData: () => void;
```

- [ ] **Step 2: Edit `src/components/CalendarToolbar/index.tsx`**

Add `onManageData` to the destructured props (after `onManageCategories`):

```tsx
  onManageData,
```

Add a `◢ DATA` button immediately before the `◢ CATEGORIES` button:

```tsx
        <button
          type="button"
          className="cy-btn px-3 py-1.5 text-xs"
          onClick={onManageData}
        >
          ◢ DATA
        </button>
```

- [ ] **Step 3: Edit `src/app/page.tsx`**

Add the import (after the `ManageCategoriesDialog` import):

```tsx
import DataDialog from "@/components/DataDialog";
```

Add state (after `const [manageOpen, setManageOpen] = useState(false);`):

```tsx
  const [dataOpen, setDataOpen] = useState(false);
```

Pass the handler to `<CalendarToolbar>` (after `onManageCategories=...`):

```tsx
        onManageData={() => setDataOpen(true)}
```

Render the dialog (after `<ManageCategoriesDialog ... />`):

```tsx
      <DataDialog
        open={dataOpen}
        currentEventCount={cal.events.length}
        currentCategoryCount={cal.categories.length}
        storageAvailable={cal.storageAvailable}
        onExport={cal.exportData}
        onPreviewImport={cal.previewImport}
        onCommitImport={cal.importData}
        onOpenChange={setDataOpen}
      />
```

- [ ] **Step 4: Typecheck + run the full suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: No type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarToolbar/ src/app/page.tsx
git commit -m "feat(ui): DATA toolbar button wired to DataDialog"
```

---

## Task 10: Update the technical reference (TRD)

**Files:**
- Modify: `docs/TRD.md`

- [ ] **Step 1: Edit the Public API bullet**

In the "Persistence: client-side SQLite (SQLite-WASM)" section, update the **Public API** bullet to include the new functions:

```md
- **Public API:** `getAllEvents`, `putEvent`, `deleteEvent`, `getAllCategories`,
  `putCategory`, `deleteCategory`, `isStorageError`, `StorageError`,
  `seedCategoriesFromEvents`, `resetDbForTests`, `onConnectionStatus`, plus
  **backup/restore**: `exportDatabase`, `validateImport`, `commitImport`.
```

- [ ] **Step 2: Add an Export/Import subsection**

Add this subsection at the end of the persistence section (after the "Build & bundling (Turbopack)" subsection):

```md
### Backup / restore (export & import)

The whole database can be exported to a raw `.sqlite3` file and restored from
one. Format is the raw SQLite binary (an exact snapshot), not JSON; import is
therefore always a **full replace** of the database.

- **Export** — `exportDatabase()` → worker `export` op →
  `sqlite3.capi.sqlite3_js_db_export(db.pointer)`. The UI wraps the bytes in a
  `Blob` and downloads `tuxbank-backup-<YYYY-MM-DD>.sqlite3` via
  `src/utils/downloadBlob`.
- **Validate** — `validateImport(bytes)` → worker `import-validate` op →
  `dbFile.validateBytes`, which loads the bytes into a throwaway `:memory:` DB
  (`sqlite3_deserialize`) and checks the SQLite header, `PRAGMA integrity_check`,
  the presence of `categories`/`events`/`event_overrides`, and
  `PRAGMA user_version === SCHEMA_VERSION`. The live database is never touched.
  Returns an `ImportPreview` (`{ events, categories, schemaVersion }`).
- **Commit** — `commitImport(bytes)` → worker `import-commit` op: re-validates,
  closes the live DB, `poolUtil.importDb(DB_FILENAME, bytes)` (async), reopens,
  and re-applies pragmas/migrations. On failure it reopens the original file so
  the connection stays live. An invalid file raises `IMPORT_INVALID`; the live
  data is unaffected.
- **UI** — a `◢ DATA` toolbar button opens `src/components/DataDialog`, which runs
  a validate → confirm → swap state machine and reloads context state
  (`CalendarContext.importData`) after a successful import.
- **Shared, React-free helper** — `src/lib/storage/connection/dbFile.ts`
  (`exportBytes`, `deserializeInto`, `validateBytes`) backs both the worker and
  the in-memory test connection, and uses a type-only sqlite import so it stays
  out of the worker's build graph.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TRD.md
git commit -m "docs(TRD): document database export/import (backup/restore)"
```

---

## Task 11: Full verification + manual browser check

**Files:** none (verification only)

- [ ] **Step 1: Run the full check + test suite**

Run: `pnpm run check && pnpm test`
Expected: formatting, lint, and typecheck all pass; the entire vitest suite passes.
If formatting fails, run `pnpm format`, then re-run `pnpm run check`.

- [ ] **Step 2: Manual browser verification (worker path — not covered by jsdom)**

Run: `pnpm dev`, open http://localhost:3000, then:

1. Create a couple of events (one recurring, with an edited/cancelled occurrence) and a custom category.
2. Click `◢ DATA` → `◢ EXPORT DATABASE`. Confirm a `tuxbank-backup-<today>.sqlite3` file downloads.
3. Delete an event so current data differs from the backup.
4. Click `◢ DATA` → `◢ IMPORT DATABASE`, pick the downloaded file. Confirm the confirmation shows both the current and backup record counts.
5. Confirm "Replace data". The calendar should reload and show the backed-up events (including the recurring series + its occurrence override), and the balances should recompute.
6. Click `◢ IMPORT DATABASE` and pick a non-SQLite file (e.g. any `.png`). Confirm the friendly "isn't a valid tuxbank backup" error shows and existing data is unchanged.
7. Reload the page and confirm the imported data persisted.

Expected: all steps behave as described. (Verify the dialog renders on-screen — jsdom can't catch positioning bugs per the project's CSS caveat.)

- [ ] **Step 3: No commit** (verification only). If Step 1 surfaced fixes, commit them with an appropriate message.

---

## Self-Review notes (for the implementer)

- **`importDb` is async** (`Promise<number>`): the worker `import-commit` path awaits it — do not drop the `await` (Task 5).
- **Worker bundling:** `dbFile.ts` must keep its **type-only** sqlite import. Never add a value `import` of `@sqlite.org/sqlite-wasm` to any file reachable from `worker.ts`.
- **Naming is consistent across layers:** repo `exportDatabase` / `validateImport` / `commitImport`; `DbConnection` methods `exportDb` / `validateImport` / `commitImport`; context `exportData` / `previewImport` / `importData`. Don't conflate them.
- **`pnpm check` will fail between Task 1 and Task 5** because the two connections must both satisfy the widened `DbConnection`. Run it only at Task 9/11.
