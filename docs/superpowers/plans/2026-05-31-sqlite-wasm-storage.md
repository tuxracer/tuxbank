# Client-side SQLite (sqlite-wasm) Storage Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the IndexedDB persistence layer (`src/lib/storage`) with SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`) using `STRICT` tables, persisting to OPFS in a dedicated Web Worker, with no change to the storage module's public API.

**Architecture:** The repository (`src/lib/storage/index.ts`) maps domain objects ⇄ SQL rows and talks to a `DbConnection`. In the browser the connection is a dedicated Web Worker running sqlite-wasm + the OPFS SAHPool VFS (worker-only API, no COOP/COEP headers). In Node/vitest the same wasm engine runs in-memory (`:memory:`). A single Web Lock makes one tab the active DB owner; other tabs show an overlay and auto-take-over when it closes.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (ESM) · `@sqlite.org/sqlite-wasm` · `navigator.locks` · `BroadcastChannel` · vitest + @testing-library/react. Spec: `docs/superpowers/specs/2026-05-31-sqlite-wasm-storage-design.md`.

---

## File Structure

**Create:**
- `src/lib/storage/schema.ts` — DDL + `PRAGMA user_version` migration runner (operates on a sync DB).
- `src/lib/storage/mappers.ts` — pure row ⇄ domain-object mapping.
- `src/lib/storage/connection/sqliteDb.ts` — `wrapDb()` / `initSyncDb()`: turn a sqlite-wasm oo1 DB into the sync primitives + apply pragmas/migration.
- `src/lib/storage/connection/memoryConnection.ts` — in-memory `DbConnection` (tests/Node).
- `src/lib/storage/connection/workerConnection.ts` — main-thread RPC `DbConnection` over the worker.
- `src/lib/storage/connection/worker.ts` — worker entry: sqlite-wasm init, SAHPool VFS, `navigator.locks`, message loop.
- `src/lib/storage/connection/index.ts` — `getConnection()`, `resetDbForTests()`, `onConnectionStatus()`.
- `src/components/StorageLockedOverlay/index.tsx` — presentational "open in another tab" overlay.

**Modify:**
- `package.json` — add `@sqlite.org/sqlite-wasm`; remove `idb`, `fake-indexeddb`.
- `vitest.setup.ts` — remove `import "fake-indexeddb/auto"`.
- `vitest.config.ts` — `optimizeDeps.exclude` for sqlite-wasm.
- `src/lib/storage/types.ts` — add `"LOCKED"` code, `SqlValue`/`Row`/`Oo1Db`/`SyncDb`/`DbConnection`/`ConnectionStatus`.
- `src/lib/storage/consts.ts` — add DB filename/VFS/lock names, `SCHEMA_VERSION`, SQL strings, defaults (remove idb consts in Task 4).
- `src/lib/storage/index.ts` — rewrite repository over `DbConnection`; keep public API + `seedCategoriesFromEvents`.
- `src/lib/storage/tests.ts` — rewrite for the SQLite repository.
- `src/context/CalendarContext/index.tsx` — `storageLocked` state + status subscription.
- `src/context/CalendarContext/types.ts` — add `storageLocked: boolean`.
- `src/app/page.tsx` — render `<StorageLockedOverlay />` when locked.
- `docs/TRD.md` — update storage section.

---

## Task 1: In-memory SQLite connection vertical (de-risk the engine)

Stands up the engine, schema, and in-memory connection and proves they work under vitest. The existing IndexedDB storage is left untouched and keeps passing.

**Files:**
- Modify: `package.json`, `vitest.config.ts`
- Modify: `src/lib/storage/types.ts`, `src/lib/storage/consts.ts`
- Create: `src/lib/storage/schema.ts`, `src/lib/storage/connection/sqliteDb.ts`, `src/lib/storage/connection/memoryConnection.ts`
- Test: `src/lib/storage/connection/tests.ts`

- [ ] **Step 1: Install the dependency**

Run:
```bash
pnpm add @sqlite.org/sqlite-wasm
```
Expected: `@sqlite.org/sqlite-wasm` appears under `dependencies` in `package.json`. (Do NOT remove `idb`/`fake-indexeddb` yet — Task 4 does that, after storage stops importing them.)

- [ ] **Step 2: Exclude sqlite-wasm from Vite dep optimization**

Edit `vitest.config.ts` to add `optimizeDeps` (sqlite-wasm ships its own `.wasm` and must not be pre-bundled):
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/tests.[jt]s?(x)"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Add storage types**

Replace `src/lib/storage/types.ts` with (adds the `LOCKED` code and the connection types; keeps `StorageError`/`isStorageError`):
```ts
export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "LOCKED";

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

/** Minimal structural view of a sqlite-wasm oo1 DB handle. */
export interface Oo1Db {
  selectObjects(sql: string, bind?: SqlValue[]): Row[];
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
}

export type ConnectionStatus =
  | "connecting"
  | "ready"
  | "waiting-locked"
  | "unavailable";
```

- [ ] **Step 4: Add storage consts (SQL + names)**

Add the following to the TOP of `src/lib/storage/consts.ts`, keeping the existing `DB_NAME`/`DB_VERSION`/`STORE`/`CATEGORY_STORE` lines below them for now:
```ts
import type { TransactionDirection } from "@/types";

/** OPFS database file + SAHPool VFS identity. */
export const DB_FILENAME = "/tuxbank.sqlite3";
export const VFS_NAME = "tuxbank-sahpool";
export const POOL_DIR = ".tuxbank-sahpool";

/** Single-active-tab coordination (handoff is handled by navigator.locks). */
export const LOCK_NAME = "tuxbank-db";

/** Schema version stored in PRAGMA user_version. */
export const SCHEMA_VERSION = 1;

/** Write-time normalization defaults for legacy/partial events. */
export const DEFAULT_AMOUNT = 0;
export const DEFAULT_DIRECTION: TransactionDirection = "deposit";

/** Full schema (always STRICT). Applied once when user_version is 0. */
export const SCHEMA_SQL = `
CREATE TABLE categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('cyan','magenta','yellow','green','orange'))
) STRICT;

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  date                TEXT NOT NULL,
  category_id         TEXT NOT NULL,
  amount              REAL NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  notes               TEXT,
  recurrence_freq     TEXT CHECK (recurrence_freq IN ('daily','weekly','monthly','yearly')),
  recurrence_interval INTEGER CHECK (recurrence_interval >= 1),
  recurrence_ends_on  TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK ((recurrence_freq IS NULL) = (recurrence_interval IS NULL)),
  CHECK (recurrence_ends_on IS NULL OR recurrence_freq IS NOT NULL)
) STRICT;

CREATE INDEX events_by_date ON events(date);

CREATE TABLE event_overrides (
  event_id          TEXT NOT NULL,
  occurrence_date   TEXT NOT NULL,
  cancelled         INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)),
  patch_title       TEXT,
  patch_category_id TEXT,
  patch_notes       TEXT,
  PRIMARY KEY (event_id, occurrence_date),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) STRICT;
`;

/** Column order MUST match mappers.eventToColumns(). */
export const UPSERT_EVENT_SQL = `
INSERT INTO events
  (id, title, date, category_id, amount, direction, notes,
   recurrence_freq, recurrence_interval, recurrence_ends_on, created_at, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, date=excluded.date, category_id=excluded.category_id,
  amount=excluded.amount, direction=excluded.direction, notes=excluded.notes,
  recurrence_freq=excluded.recurrence_freq, recurrence_interval=excluded.recurrence_interval,
  recurrence_ends_on=excluded.recurrence_ends_on, created_at=excluded.created_at,
  updated_at=excluded.updated_at`;

export const DELETE_OVERRIDES_SQL =
  "DELETE FROM event_overrides WHERE event_id = ?";

/** Column order MUST match mappers.overrideToColumns(). */
export const INSERT_OVERRIDE_SQL = `
INSERT INTO event_overrides
  (event_id, occurrence_date, cancelled, patch_title, patch_category_id, patch_notes)
VALUES (?,?,?,?,?,?)`;

export const UPSERT_CATEGORY_SQL = `
INSERT INTO categories (id, name, color) VALUES (?,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color`;
```

- [ ] **Step 5: Write the migration runner**

Create `src/lib/storage/schema.ts`:
```ts
import type { SyncDb } from "./types";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./consts";

/** Create the schema once. Idempotent: keyed on PRAGMA user_version. */
export const migrate = (db: SyncDb): void => {
  const rows = db.selectAll("PRAGMA user_version");
  const current = typeof rows[0]?.user_version === "number" ? rows[0].user_version : 0;
  if (current >= SCHEMA_VERSION) return;
  db.run(SCHEMA_SQL);
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
};
```

- [ ] **Step 6: Write the sync DB wrapper**

Create `src/lib/storage/connection/sqliteDb.ts`:
```ts
import type { Oo1Db, SyncDb } from "../types";
import { migrate } from "../schema";

/** Wrap a sqlite-wasm oo1 DB into the synchronous primitives. */
export const wrapDb = (db: Oo1Db): SyncDb => ({
  selectAll: (sql, bind = []) => db.selectObjects(sql, bind),
  run: (sql, bind = []) => {
    db.exec({ sql, bind });
  },
  tx: (ops) => {
    db.transaction(() => {
      for (const op of ops) db.exec({ sql: op.sql, bind: op.bind ?? [] });
    });
  },
});

/** Wrap + enable FK enforcement (per-connection) + apply migrations. */
export const initSyncDb = (db: Oo1Db): SyncDb => {
  const sync = wrapDb(db);
  sync.run("PRAGMA foreign_keys = ON");
  migrate(sync);
  return sync;
};
```

- [ ] **Step 7: Write the in-memory connection**

Create `src/lib/storage/connection/memoryConnection.ts`:
```ts
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbConnection } from "../types";
import { initSyncDb } from "./sqliteDb";

/** Same wasm engine as production, in-memory (no OPFS/worker). Node + tests. */
export const createMemoryConnection = async (): Promise<DbConnection> => {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(":memory:", "c");
  const sync = initSyncDb(db);
  return {
    selectAll: (sql, bind = []) => Promise.resolve(sync.selectAll(sql, bind)),
    run: (sql, bind = []) => {
      sync.run(sql, bind);
      return Promise.resolve();
    },
    tx: (ops) => {
      sync.tx(ops);
      return Promise.resolve();
    },
  };
};
```

- [ ] **Step 8: Write the failing connection test**

Create `src/lib/storage/connection/tests.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createMemoryConnection } from "./memoryConnection";

describe("in-memory sqlite connection", () => {
  it("applies the schema and round-trips a category", async () => {
    const db = await createMemoryConnection();
    await db.run("INSERT INTO categories (id,name,color) VALUES (?,?,?)", [
      "c1",
      "Rent",
      "magenta",
    ]);
    const rows = await db.selectAll("SELECT id,name,color FROM categories");
    expect(rows).toEqual([{ id: "c1", name: "Rent", color: "magenta" }]);
  });

  it("enforces STRICT CHECK constraints (rejects a bad direction)", async () => {
    const db = await createMemoryConnection();
    await expect(
      db.run(
        "INSERT INTO events (id,title,date,category_id,amount,direction,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        ["e1", "X", "2026-05-01", "c1", 1, "sideways", "t", "t"],
      ),
    ).rejects.toThrow();
  });

  it("cascades override deletion when the event is deleted", async () => {
    const db = await createMemoryConnection();
    await db.run(
      "INSERT INTO events (id,title,date,category_id,amount,direction,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ["e1", "X", "2026-05-01", "c1", 1, "deposit", "t", "t"],
    );
    await db.run(
      "INSERT INTO event_overrides (event_id,occurrence_date,cancelled) VALUES (?,?,?)",
      ["e1", "2026-05-08", 1],
    );
    await db.run("DELETE FROM events WHERE id = ?", ["e1"]);
    const overrides = await db.selectAll("SELECT * FROM event_overrides");
    expect(overrides).toEqual([]);
  });
});
```

- [ ] **Step 9: Run the connection test to verify it passes**

Run:
```bash
pnpm test src/lib/storage/connection/tests.ts
```
Expected: PASS (3 tests). This proves sqlite-wasm loads in vitest, the schema applies, and STRICT/CHECK + FK cascade work.
If init fails to load the wasm, add to `vitest.config.ts` `test`: `server: { deps: { inline: ["@sqlite.org/sqlite-wasm"] } }` and re-run.

- [ ] **Step 10: Verify the existing suite still passes**

Run:
```bash
pnpm test
```
Expected: PASS — existing IndexedDB storage and context tests are untouched (they still use `fake-indexeddb`), plus the new connection tests.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/lib/storage/types.ts src/lib/storage/consts.ts src/lib/storage/schema.ts src/lib/storage/connection/
git commit -m "feat(storage): in-memory sqlite-wasm connection + STRICT schema"
```

---

## Task 2: Pure row ⇄ object mappers

**Files:**
- Create: `src/lib/storage/mappers.ts`
- Test: `src/lib/storage/mappers.tests.ts`

- [ ] **Step 1: Write the failing mapper tests**

Create `src/lib/storage/mappers.tests.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import {
  eventToColumns,
  overrideToColumns,
  rowToEvent,
  rowToOverride,
  rowToCategory,
} from "./mappers";

const baseEvent: CalendarEvent = {
  id: "e1",
  title: "Rent",
  date: "2026-05-01",
  categoryId: "c1",
  amount: 1200,
  direction: "withdrawal",
  recurrence: null,
  overrides: [],
  createdAt: "t0",
  updatedAt: "t1",
};

describe("event mappers", () => {
  it("maps a one-off event to 12 columns in schema order", () => {
    expect(eventToColumns(baseEvent)).toEqual([
      "e1", "Rent", "2026-05-01", "c1", 1200, "withdrawal", null,
      null, null, null, "t0", "t1",
    ]);
  });

  it("normalizes a partial event's amount/direction at write time", () => {
    const partial = { ...baseEvent } as Record<string, unknown>;
    delete partial.amount;
    delete partial.direction;
    const cols = eventToColumns(partial as unknown as CalendarEvent);
    expect(cols[4]).toBe(0); // amount default
    expect(cols[5]).toBe("deposit"); // direction default
  });

  it("flattens recurrence (endsOn present) into columns", () => {
    const recurring: CalendarEvent = {
      ...baseEvent,
      recurrence: { freq: "weekly", interval: 2, endsOn: "2026-12-31" },
    };
    const cols = eventToColumns(recurring);
    expect(cols.slice(7, 10)).toEqual(["weekly", 2, "2026-12-31"]);
  });

  it("round-trips a recurring event (endsOn null) from a row", () => {
    const row = {
      id: "e1", title: "Rent", date: "2026-05-01", category_id: "c1",
      amount: 1200, direction: "withdrawal", notes: null,
      recurrence_freq: "monthly", recurrence_interval: 1, recurrence_ends_on: null,
      created_at: "t0", updated_at: "t1",
    };
    expect(rowToEvent(row, [])).toEqual({
      ...baseEvent,
      recurrence: { freq: "monthly", interval: 1, endsOn: null },
    });
  });

  it("omits notes when the column is null and includes it when present", () => {
    const withNotes = rowToEvent(
      { id: "e1", title: "Rent", date: "2026-05-01", category_id: "c1", amount: 1200, direction: "withdrawal", notes: "pay early", recurrence_freq: null, recurrence_interval: null, recurrence_ends_on: null, created_at: "t0", updated_at: "t1" },
      [],
    );
    expect(withNotes?.notes).toBe("pay early");
    const without = rowToEvent(
      { id: "e1", title: "Rent", date: "2026-05-01", category_id: "c1", amount: 1200, direction: "withdrawal", notes: null, recurrence_freq: null, recurrence_interval: null, recurrence_ends_on: null, created_at: "t0", updated_at: "t1" },
      [],
    );
    expect(Object.prototype.hasOwnProperty.call(without, "notes")).toBe(false);
  });
});

describe("override mappers", () => {
  it("maps a cancellation to columns", () => {
    expect(overrideToColumns("e1", { occurrenceDate: "2026-05-08", cancelled: true })).toEqual([
      "e1", "2026-05-08", 1, null, null, null,
    ]);
  });

  it("maps a patch to columns", () => {
    expect(
      overrideToColumns("e1", { occurrenceDate: "2026-05-08", patch: { title: "Moved" } }),
    ).toEqual(["e1", "2026-05-08", 0, "Moved", null, null]);
  });

  it("reconstructs a cancellation (no patch key)", () => {
    expect(
      rowToOverride({ event_id: "e1", occurrence_date: "2026-05-08", cancelled: 1, patch_title: null, patch_category_id: null, patch_notes: null }),
    ).toEqual({ occurrenceDate: "2026-05-08", cancelled: true });
  });

  it("reconstructs a patch (no cancelled key) with only present fields", () => {
    expect(
      rowToOverride({ event_id: "e1", occurrence_date: "2026-05-08", cancelled: 0, patch_title: "Moved", patch_category_id: null, patch_notes: null }),
    ).toEqual({ occurrenceDate: "2026-05-08", patch: { title: "Moved" } });
  });
});

describe("category mappers", () => {
  it("returns null for a row with an invalid color", () => {
    expect(rowToCategory({ id: "c1", name: "X", color: "teal" })).toBeNull();
  });
  it("maps a valid category row", () => {
    expect(rowToCategory({ id: "c1", name: "Rent", color: "magenta" })).toEqual({
      id: "c1", name: "Rent", color: "magenta",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm test src/lib/storage/mappers.tests.ts
```
Expected: FAIL with "Failed to resolve import ./mappers" / functions not defined.

- [ ] **Step 3: Implement the mappers**

Create `src/lib/storage/mappers.ts`:
```ts
import { isString } from "remeda";
import type {
  CalendarEvent,
  Category,
  OccurrenceOverride,
  Recurrence,
} from "@/types";
import { isCalendarEvent, isCategory, isRecurrenceFreq } from "@/types";
import type { Row, SqlValue } from "./types";
import { DEFAULT_AMOUNT, DEFAULT_DIRECTION } from "./consts";

const normalizeAmount = (value: unknown): number =>
  typeof value === "number" ? value : DEFAULT_AMOUNT;

const normalizeDirection = (value: unknown): "deposit" | "withdrawal" =>
  value === "withdrawal" ? "withdrawal" : DEFAULT_DIRECTION;

// ---- events ----

/** Bind values for UPSERT_EVENT_SQL. Order MUST match the SQL column list. */
export const eventToColumns = (event: CalendarEvent): SqlValue[] => [
  event.id,
  event.title,
  event.date,
  event.categoryId,
  normalizeAmount(event.amount),
  normalizeDirection(event.direction),
  event.notes ?? null,
  event.recurrence ? event.recurrence.freq : null,
  event.recurrence ? event.recurrence.interval : null,
  event.recurrence ? event.recurrence.endsOn : null,
  event.createdAt,
  event.updatedAt,
];

export const rowToEvent = (
  row: Row,
  overrides: OccurrenceOverride[],
): CalendarEvent | null => {
  const recurrence: Recurrence | null = isRecurrenceFreq(row.recurrence_freq)
    ? {
        freq: row.recurrence_freq,
        interval:
          typeof row.recurrence_interval === "number"
            ? row.recurrence_interval
            : 1,
        endsOn: isString(row.recurrence_ends_on) ? row.recurrence_ends_on : null,
      }
    : null;

  const event = {
    id: row.id,
    title: row.title,
    date: row.date,
    categoryId: row.category_id,
    amount: normalizeAmount(row.amount),
    direction: normalizeDirection(row.direction),
    ...(isString(row.notes) ? { notes: row.notes } : {}),
    recurrence,
    overrides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return isCalendarEvent(event) ? event : null;
};

// ---- overrides ----

/** Bind values for INSERT_OVERRIDE_SQL. Order MUST match the SQL column list. */
export const overrideToColumns = (
  eventId: string,
  override: OccurrenceOverride,
): SqlValue[] => [
  eventId,
  override.occurrenceDate,
  override.cancelled ? 1 : 0,
  override.patch?.title ?? null,
  override.patch?.categoryId ?? null,
  override.patch?.notes ?? null,
];

export const rowToOverride = (row: Row): OccurrenceOverride => {
  const override: OccurrenceOverride = {
    occurrenceDate: isString(row.occurrence_date) ? row.occurrence_date : "",
  };
  if (row.cancelled === 1) override.cancelled = true;
  const patch: { title?: string; categoryId?: string; notes?: string } = {};
  if (isString(row.patch_title)) patch.title = row.patch_title;
  if (isString(row.patch_category_id)) patch.categoryId = row.patch_category_id;
  if (isString(row.patch_notes)) patch.notes = row.patch_notes;
  if (Object.keys(patch).length > 0) override.patch = patch;
  return override;
};

// ---- categories ----

export const categoryToRow = (category: Category): SqlValue[] => [
  category.id,
  category.name,
  category.color,
];

export const rowToCategory = (row: Row): Category | null => {
  const candidate = { id: row.id, name: row.name, color: row.color };
  return isCategory(candidate) ? candidate : null;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm test src/lib/storage/mappers.tests.ts
```
Expected: PASS (all mapper tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/mappers.ts src/lib/storage/mappers.tests.ts
git commit -m "feat(storage): pure row<->object mappers"
```

---

## Task 3: Worker connection plumbing (browser path)

Adds the worker, the main-thread RPC client, and the connection selector. Not unit-tested (browser-only APIs); verified to compile here and exercised in the browser in Task 6. The existing storage stays on IndexedDB until Task 4.

**Files:**
- Create: `src/lib/storage/connection/worker.ts`, `src/lib/storage/connection/workerConnection.ts`, `src/lib/storage/connection/index.ts`

- [ ] **Step 1: Write the worker entry**

Create `src/lib/storage/connection/worker.ts`:
```ts
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { DB_FILENAME, LOCK_NAME, POOL_DIR, VFS_NAME } from "../consts";
import type { SyncDb } from "../types";
import { initSyncDb } from "./sqliteDb";

// Structural view of the dedicated worker global. TS environment annotation
// only — external message data is still validated by shape before use.
interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  navigator: { locks: LockManager };
}
const ctx = globalThis as unknown as WorkerScope;

let sync: SyncDb | null = null;

const initSqlite = async () => {
  try {
    return await sqlite3InitModule();
  } catch (error) {
    ctx.postMessage({ type: "status", status: "unavailable", error: String(error) });
    return null;
  }
};

const boot = async (): Promise<void> => {
  const sqlite3 = await initSqlite();
  if (!sqlite3) return;

  const open = async (): Promise<void> => {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        name: VFS_NAME,
        directory: POOL_DIR,
        clearOnInit: false,
        initialCapacity: 6,
      });
      const db = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
      sync = initSyncDb(db);
      ctx.postMessage({ type: "status", status: "ready" });
    } catch (error) {
      ctx.postMessage({ type: "status", status: "unavailable", error: String(error) });
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
      await ctx.navigator.locks.request(LOCK_NAME, { mode: "exclusive" }, async () => {
        await open();
        await new Promise<never>(() => {}); // hold
      });
    },
  );
};

ctx.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!sync) {
    ctx.postMessage({ id: message.id, error: "NOT_READY" });
    return;
  }
  try {
    if (message.op === "selectAll") {
      ctx.postMessage({ id: message.id, rows: sync.selectAll(message.sql, message.bind) });
    } else if (message.op === "run") {
      sync.run(message.sql, message.bind);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "tx") {
      sync.tx(message.ops);
      ctx.postMessage({ id: message.id });
    }
  } catch (error) {
    ctx.postMessage({ id: message.id, error: String(error) });
  }
};

void boot();
```

- [ ] **Step 2: Write the main-thread RPC connection**

Create `src/lib/storage/connection/workerConnection.ts`:
```ts
import { StorageError } from "../types";
import type { ConnectionStatus, DbConnection, Row, SqlValue } from "../types";

type Pending = {
  resolve: (rows: Row[]) => void;
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
  let rejectReady = (_error: StorageError): void => {};
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
      const isFull = String(message.error).toLowerCase().includes("full");
      const code = entry.read
        ? "READ_FAILED"
        : isFull
          ? "QUOTA_EXCEEDED"
          : "WRITE_FAILED";
      entry.reject(new StorageError(code, message.error));
    } else {
      entry.resolve(message.rows ?? []);
    }
  };

  worker.onerror = (event) => {
    rejectReady(new StorageError("UNAVAILABLE", event.message));
  };

  const call = (
    payload: { op: string; sql?: string; bind?: SqlValue[]; ops?: unknown },
    read: boolean,
  ): Promise<Row[]> =>
    new Promise<Row[]>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, read });
      worker.postMessage({ id, ...payload });
    });

  return {
    async selectAll(sql, bind = []) {
      await ready;
      return call({ op: "selectAll", sql, bind }, true);
    },
    async run(sql, bind = []) {
      await ready;
      await call({ op: "run", sql, bind }, false);
    },
    async tx(ops) {
      await ready;
      await call({ op: "tx", ops }, false);
    },
  };
};
```

- [ ] **Step 3: Write the connection selector**

Create `src/lib/storage/connection/index.ts`:
```ts
import { StorageError } from "../types";
import type { ConnectionStatus, DbConnection } from "../types";
import { createMemoryConnection } from "./memoryConnection";
import { createWorkerConnection } from "./workerConnection";

let connectionPromise: Promise<DbConnection> | null = null;
let testConnection: DbConnection | null = null;
const statusListeners = new Set<(status: ConnectionStatus) => void>();

export const onConnectionStatus = (
  callback: (status: ConnectionStatus) => void,
): (() => void) => {
  statusListeners.add(callback);
  return () => {
    statusListeners.delete(callback);
  };
};

const emitStatus = (status: ConnectionStatus): void => {
  for (const listener of statusListeners) listener(status);
};

export const getConnection = (): Promise<DbConnection> => {
  if (testConnection) return Promise.resolve(testConnection);
  if (!connectionPromise) {
    if (typeof Worker === "undefined") {
      emitStatus("unavailable");
      connectionPromise = Promise.reject(new StorageError("UNAVAILABLE"));
      connectionPromise.catch(() => {}); // avoid unhandled rejection warnings
    } else {
      connectionPromise = Promise.resolve(createWorkerConnection(emitStatus));
    }
  }
  return connectionPromise;
};

/** Test-only: install a fresh in-memory connection so each test starts clean. */
export const resetDbForTests = async (): Promise<void> => {
  testConnection = await createMemoryConnection();
};
```

- [ ] **Step 4: Verify it compiles and existing tests still pass**

Run:
```bash
pnpm test
```
Expected: PASS — new files compile and are not yet imported by app code; existing tests unchanged.

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no type errors. If sqlite-wasm's `installOpfsSAHPoolVfs`/`OpfsSAHPoolDb`/`selectObjects` type names differ from those used, inspect `node_modules/@sqlite.org/sqlite-wasm/index.d.ts` and adjust the calls to match the shipped types.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/connection/
git commit -m "feat(storage): worker + RPC connection and selector"
```

---

## Task 4: Rewrite the repository over SQLite (flip the app off IndexedDB)

**Files:**
- Modify: `src/lib/storage/index.ts` (rewrite), `src/lib/storage/consts.ts` (remove idb consts), `src/lib/storage/tests.ts` (rewrite), `vitest.setup.ts`, `package.json`
- Delete: `src/lib/storage/connection/tests.ts` is kept; no deletions.

- [ ] **Step 1: Rewrite the repository**

Replace `src/lib/storage/index.ts` with:
```ts
import { groupBy } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { StorageError, type StorageErrorCode } from "./types";
import { getConnection } from "./connection";
import {
  DELETE_OVERRIDES_SQL,
  INSERT_OVERRIDE_SQL,
  UPSERT_CATEGORY_SQL,
  UPSERT_EVENT_SQL,
} from "./consts";
import {
  categoryToRow,
  eventToColumns,
  overrideToColumns,
  rowToCategory,
  rowToEvent,
  rowToOverride,
} from "./mappers";

export * from "./consts";
export * from "./types";
export { resetDbForTests, onConnectionStatus } from "./connection";

const toStorageError = (
  error: unknown,
  code: StorageErrorCode,
): StorageError =>
  error instanceof StorageError ? error : new StorageError(code, error);

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

export const getAllEvents = async (): Promise<CalendarEvent[]> => {
  try {
    const conn = await getConnection();
    const [eventRows, overrideRows] = await Promise.all([
      conn.selectAll("SELECT * FROM events"),
      conn.selectAll("SELECT * FROM event_overrides"),
    ]);
    const overridesByEvent = groupBy(overrideRows, (r) => String(r.event_id));
    return eventRows
      .map((row) =>
        rowToEvent(
          row,
          (overridesByEvent[String(row.id)] ?? []).map(rowToOverride),
        ),
      )
      .filter((event): event is CalendarEvent => event !== null);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const putEvent = async (event: CalendarEvent): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.tx([
      { sql: UPSERT_EVENT_SQL, bind: eventToColumns(event) },
      { sql: DELETE_OVERRIDES_SQL, bind: [event.id] },
      ...event.overrides.map((override) => ({
        sql: INSERT_OVERRIDE_SQL,
        bind: overrideToColumns(event.id, override),
      })),
    ]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run("DELETE FROM events WHERE id = ?", [id]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const conn = await getConnection();
    const rows = await conn.selectAll("SELECT * FROM categories");
    return rows
      .map(rowToCategory)
      .filter((category): category is Category => category !== null);
  } catch (error) {
    throw toStorageError(error, "READ_FAILED");
  }
};

export const putCategory = async (category: Category): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run(UPSERT_CATEGORY_SQL, categoryToRow(category));
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const conn = await getConnection();
    await conn.run("DELETE FROM categories WHERE id = ?", [id]);
  } catch (error) {
    throw toStorageError(error, "WRITE_FAILED");
  }
};
```

- [ ] **Step 2: Remove the now-unused IndexedDB consts**

Edit `src/lib/storage/consts.ts` and delete these lines (added pre-SQLite, no longer referenced):
```ts
export const DB_NAME = "cyber-calendar";
export const DB_VERSION = 2;
export const STORE = "events";
export const CATEGORY_STORE = "categories";
```

- [ ] **Step 3: Remove the fake-indexeddb test shim**

Edit `vitest.setup.ts` and delete this line:
```ts
import "fake-indexeddb/auto";
```

- [ ] **Step 4: Rewrite the storage tests**

Replace `src/lib/storage/tests.ts` with:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarEvent } from "@/types";
import {
  getAllEvents,
  putEvent,
  deleteEvent,
  resetDbForTests,
  getAllCategories,
  putCategory,
  deleteCategory,
  seedCategoriesFromEvents,
} from "./index";

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

  it("backfills amount/direction defaults for legacy events missing them", async () => {
    const legacy = {
      id: "legacy",
      title: "Old",
      date: "2026-05-14",
      categoryId: "work",
      recurrence: null,
      overrides: [],
      createdAt: "t",
      updatedAt: "t",
    };
    await putEvent(legacy as unknown as CalendarEvent);
    const [loaded] = await getAllEvents();
    expect(loaded.amount).toBe(0);
    expect(loaded.direction).toBe("deposit");
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

  it("cascade-deletes overrides when the event is deleted", async () => {
    const event: CalendarEvent = {
      ...make("c"),
      recurrence: { freq: "daily", interval: 1, endsOn: null },
      overrides: [{ occurrenceDate: "2026-05-15", cancelled: true }],
    };
    await putEvent(event);
    await deleteEvent("c");
    // Re-create with same id; overrides must be gone, not resurrected.
    await putEvent({ ...make("c") });
    const [loaded] = await getAllEvents();
    expect(loaded.overrides).toEqual([]);
  });

  it("rejects a write that violates a STRICT CHECK constraint", async () => {
    // Categories have no normalization layer, so a bad color reaches the DB.
    await expect(
      putCategory({
        id: "x",
        name: "X",
        color: "teal",
      } as unknown as Parameters<typeof putCategory>[0]),
    ).rejects.toThrow();
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

  it("derives seed categories from legacy event categoryIds", () => {
    const events = [
      { categoryId: "finance" },
      { categoryId: "finance" },
      { categoryId: "mystery" },
    ] as unknown as CalendarEvent[];
    const seeded = seedCategoriesFromEvents(events);
    expect(seeded).toContainEqual({
      id: "finance",
      name: "Finance",
      color: "yellow",
    });
    expect(seeded).toContainEqual({
      id: "mystery",
      name: "mystery",
      color: "cyan",
    });
    expect(seeded.filter((c) => c.id === "finance")).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Remove IndexedDB dependencies**

Run:
```bash
pnpm remove idb fake-indexeddb
```
Expected: both removed from `package.json`.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: PASS — storage tests (now on sqlite-wasm in-memory) and CalendarContext tests (they already call `resetDbForTests()` in `beforeEach`, which now installs the in-memory connection). The dropped IndexedDB "v2 upgrade seeding" test is intentionally gone.

- [ ] **Step 7: Typecheck/lint/format gate**

Run:
```bash
pnpm check
```
Expected: PASS. If formatting fails, run `pnpm format` then re-run `pnpm check`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storage): replace IndexedDB with sqlite-wasm repository"
```

---

## Task 5: Multi-tab lock overlay (CalendarContext + UI)

**Files:**
- Modify: `src/context/CalendarContext/types.ts`, `src/context/CalendarContext/index.tsx`
- Create: `src/components/StorageLockedOverlay/index.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/context/CalendarContext/tests.tsx` (add one test)

- [ ] **Step 1: Add `storageLocked` to the context type**

Edit `src/context/CalendarContext/types.ts`: add the field immediately after `storageAvailable: boolean;`:
```ts
  storageAvailable: boolean;
  storageLocked: boolean;
  loaded: boolean;
```

- [ ] **Step 2: Wire status into the provider**

Edit `src/context/CalendarContext/index.tsx`:

(a) Add `onConnectionStatus` to the storage import block:
```ts
import {
  deleteEvent as dbDelete,
  getAllEvents,
  isStorageError,
  putEvent,
  getAllCategories,
  putCategory,
  deleteCategory as dbDeleteCategory,
  onConnectionStatus,
} from "@/lib/storage";
```

(b) Add state next to `storageAvailable`:
```ts
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [storageLocked, setStorageLocked] = useState<boolean>(false);
```

(c) Add a status-subscription effect ABOVE the existing load effect (`useEffect(() => { let active = true; ...`):
```ts
  useEffect(
    () =>
      onConnectionStatus((status) => {
        setStorageLocked(status === "waiting-locked");
        if (status === "unavailable") setStorageAvailable(false);
      }),
    [],
  );
```

(d) Add `storageLocked` to the `value` object next to `storageAvailable`:
```ts
    storageAvailable,
    storageLocked,
    loaded,
```

- [ ] **Step 3: Create the overlay component**

Create `src/components/StorageLockedOverlay/index.tsx`:
```tsx
"use client";

const StorageLockedOverlay = () => (
  <div
    role="alertdialog"
    aria-label="Database in use in another tab"
    className="cy-scanlines fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
  >
    <div className="cy-mono max-w-md border border-[color:var(--cy-cyan)] bg-black px-6 py-5 text-center text-[color:var(--cy-cyan)]">
      <p className="text-sm font-semibold">◢ TUXBANK IS OPEN IN ANOTHER TAB</p>
      <p className="mt-2 text-xs text-[color:var(--cy-muted)]">
        Only one tab can use the local database at a time. Close the other tab
        and this one will take over automatically.
      </p>
    </div>
  </div>
);

export default StorageLockedOverlay;
```

- [ ] **Step 4: Render the overlay when locked**

Edit `src/app/page.tsx`:

(a) Add the import next to the other component imports:
```ts
import StorageLockedOverlay from "@/components/StorageLockedOverlay";
```

(b) Render it as the first child inside the `<main>` (just before the storage-unavailable banner):
```tsx
    <main
      className="cy-scanlines flex h-[100dvh] flex-col gap-3 p-3.5"
      onKeyDown={onKeyDown}
    >
      {cal.storageLocked && <StorageLockedOverlay />}

      {cal.loaded && !cal.storageAvailable && (
```

- [ ] **Step 5: Add a context test for the locked state**

Add this test inside the `describe("CalendarContext", ...)` block in `src/context/CalendarContext/tests.tsx` (it uses the real status emitter via `onConnectionStatus`):
```ts
  it("defaults storageLocked to false with a working connection", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.storageLocked).toBe(false);
  });
```

- [ ] **Step 6: Run the context tests**

Run:
```bash
pnpm test src/context/CalendarContext/tests.tsx
```
Expected: PASS (existing tests + the new `storageLocked` test).

- [ ] **Step 7: Full gate**

Run:
```bash
pnpm check && pnpm test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storage): single-active-tab lock overlay"
```

---

## Task 6: Browser end-to-end verification + wasm bundling

jsdom cannot run OPFS/Worker; this task verifies the real browser path with chrome-devtools (per the project's "verify in a real browser" rule). The local snapshot date is 2026-05-31.

**Files:**
- Possibly modify: `next.config.ts`, `public/sqlite3.wasm` (fallback only)

- [ ] **Step 1: Production build**

Run:
```bash
pnpm build
```
Expected: build succeeds. If the worker or `.wasm` fails to resolve under Turbopack, apply the fallback in Step 5 and rebuild.

- [ ] **Step 2: Start the dev server**

Run (background):
```bash
pnpm dev
```
Then open `http://localhost:3000` in chrome-devtools (`new_page`).

- [ ] **Step 3: Verify persistence**

Using chrome-devtools: create an event (press `n` or click a day, fill the dialog, save). Take a screenshot. Then `navigate_page` to reload `http://localhost:3000`. Confirm the event is still present after reload (this proves OPFS persistence through the worker). Check `list_console_messages` for errors.
Expected: event persists; no console errors; no COOP/COEP warnings.

- [ ] **Step 4: Verify multi-tab lock + handoff**

Open a second page to `http://localhost:3000` (`new_page`). Confirm the second tab shows the "TUXBANK IS OPEN IN ANOTHER TAB" overlay. Close the FIRST page (`close_page`). Confirm the second tab auto-loads the calendar (overlay disappears, events render) without a manual reload.
Expected: overlay shows on the 2nd tab, then clears and loads after the 1st closes.

- [ ] **Step 5: Wasm bundling fallback (only if Step 1/3 failed to load the wasm)**

Copy the wasm into `public/` and point the loader at it:
```bash
cp node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm public/sqlite3.wasm
```
Then in `src/lib/storage/connection/memoryConnection.ts` and `src/lib/storage/connection/worker.ts`, change the init call to:
```ts
const sqlite3 = await sqlite3InitModule({ locateFile: (file: string) => `/${file}` });
```
Re-run `pnpm build` and repeat Steps 2–4. (If only the worker path needs it, apply `locateFile` in `worker.ts` only.)

- [ ] **Step 6: Commit (only if files changed)**

```bash
git add -A
git commit -m "fix(storage): ensure sqlite-wasm worker/wasm load under Turbopack"
```
If nothing changed in this task, skip the commit.

---

## Task 7: Documentation + final verification

**Files:**
- Modify: `docs/TRD.md`

- [ ] **Step 1: Update the technical reference**

Edit `docs/TRD.md`: in the storage/persistence section, replace IndexedDB/`idb` references with: SQLite-WASM (`@sqlite.org/sqlite-wasm`) persisting to OPFS via the SAHPool VFS in a dedicated Web Worker; `STRICT` relational schema (`categories`, `events`, `event_overrides` with `ON DELETE CASCADE`); single-active-tab coordination via `navigator.locks` with an overlay; in-memory same-engine testing. Mention `PRAGMA user_version` migrations. Keep the wording consistent with the rest of the document.

- [ ] **Step 2: Final full gate**

Run:
```bash
pnpm check && pnpm test
```
Expected: PASS (format + lint + typecheck + all tests).

- [ ] **Step 3: Commit**

```bash
git add docs/TRD.md
git commit -m "docs: document sqlite-wasm storage layer in TRD"
```

---

## Self-Review notes (for the implementer)

- **Public API preserved:** `getAllEvents`, `putEvent`, `deleteEvent`, `getAllCategories`, `putCategory`, `deleteCategory`, `isStorageError`, `StorageError`, `seedCategoriesFromEvents`, `resetDbForTests` are all still exported from `@/lib/storage` with identical signatures; `CalendarContext` needs only the additive `storageLocked` + status subscription.
- **No-FK on `category_id` is load-bearing:** existing context tests insert events with `categoryId` values that have no category row (e.g. `"work"`, `"health"`). A FK there would make those tests (and the app) fail — keep `category_id` FK-free; only `event_overrides.event_id` has a FK.
- **Column order:** `eventToColumns` ↔ `UPSERT_EVENT_SQL` (12 cols) and `overrideToColumns` ↔ `INSERT_OVERRIDE_SQL` (6 cols) must stay in sync.
- **Type-name caveat:** sqlite-wasm's exact exported type names for `installOpfsSAHPoolVfs`/`OpfsSAHPoolDb`/`selectObjects` are confirmed at `pnpm check` time (Task 3 Step 4); adjust to the shipped `index.d.ts` if needed. No `as` casts on runtime data — mapping uses the `@/types` guards (`isCalendarEvent`, `isCategory`, `isRecurrenceFreq`).
```
