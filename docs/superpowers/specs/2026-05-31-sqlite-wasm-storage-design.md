# Design: Client-side SQLite (`@sqlite.org/sqlite-wasm`) storage layer

**Date:** 2026-05-31
**Status:** Approved (brainstorming) — ready for implementation planning
**Scope:** Replace the IndexedDB persistence layer (`src/lib/storage`) with SQLite-WASM using `STRICT` tables, fully client-side. No backend.

---

## 1. Goal & guiding principle

Replace the `idb`/IndexedDB implementation under `src/lib/storage` with SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`), persisting to the Origin Private File System (OPFS), **without changing the storage module's public API**.

The app stays **entirely client-side**: SQLite runs as WebAssembly in the user's browser, persisting to OPFS. There is no server, no Node runtime, and no native code in the shipped bundle.

`CalendarContext` (`src/context/CalendarContext/index.tsx`) consumes the storage module via these symbols, all of which keep **identical signatures and `Promise` semantics**:

- `getAllEvents(): Promise<CalendarEvent[]>`
- `putEvent(event: CalendarEvent): Promise<void>`
- `deleteEvent(id: string): Promise<void>`
- `getAllCategories(): Promise<Category[]>`
- `putCategory(category: Category): Promise<void>`
- `deleteCategory(id: string): Promise<void>`
- `isStorageError(error): error is StorageError`
- `seedCategoriesFromEvents(events): Category[]` (pure helper; tests)
- `resetDbForTests(): Promise<void>` (test helper)

The blast radius is the storage module plus **one small additive change** to `CalendarContext` (a `storageLocked` flag and overlay) for the multi-tab lock UX.

## 2. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Engine | `@sqlite.org/sqlite-wasm` (WASM) | Official SQLite WASM build; runs in-browser. |
| VFS | **OPFS SAHPool VFS** | Highest OPFS performance; **requires no COOP/COEP headers** (Vercel deploy stays header-free). Trade-off: single connection only — which fits our multi-tab choice. |
| Threading | **Dedicated Web Worker** | Mandatory: OPFS sync access handles (`createSyncAccessHandle`) are exposed **only in dedicated Web Workers** — not the main thread, not SharedWorker/ServiceWorker. |
| Table mode | **Always `STRICT`** | Data integrity; enforced column typing. |
| Schema shape | **Relational** (flattened recurrence + `CHECK` enums, child table for overrides) | Leverages `STRICT` + `CHECK` to enforce invariants the document model can't. |
| Existing IndexedDB data | **Fresh start** | Drop IndexedDB and the `idb` dependency; no one-time migration. |
| Multi-tab | **Single active tab** + `navigator.locks` coordination + `BroadcastChannel`; auto-handoff on close | OPFS exclusive lock makes cross-tab corruption impossible; we coordinate for clean UX rather than letting the second tab fail. |
| Test engine | **Same `@sqlite.org/sqlite-wasm` in-memory** | Test/prod engine parity; fully client-side-capable. **No** native engine (`better-sqlite3`) anywhere. |

### Verified facts (sources)

- OPFS sync access handles are **worker-only**; both the `opfs` VFS and the `opfs-sahpool` VFS require running from a Worker thread — they cannot run on the main UI thread. ([sqlite.org persistence docs](https://sqlite.org/wasm/doc/trunk/persistence.md), [MDN createSyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle))
- The SAHPool VFS needs **no COOP/COEP headers** (unlike the `opfs` VFS, which needs `SharedArrayBuffer` + cross-origin isolation), at the cost of supporting only a single connection. ([sqlite.org persistence docs](https://sqlite.org/wasm/doc/trunk/persistence.md))
- "No two database handles can have the same OPFS-hosted database open at one time. If the same page is opened in two tabs, the second tab will hit a locking error." ([sqlite.org persistence docs](https://sqlite.org/wasm/doc/trunk/persistence.md))
- `better-sqlite3` is a native Node C++ addon with no browser/WASM build — confirmed unusable client-side; excluded entirely.

## 3. Architecture & data flow

```
page.tsx ("use client")
  └─ CalendarProvider ── getAllEvents()/putEvent()/… (unchanged async API)
        └─ src/lib/storage/index.ts        ← repository: maps rows ⇄ domain objects
              └─ getConnection()           ← environment-selected DbConnection
                   ├─ browser → WorkerConnection ──postMessage RPC──► Web Worker
                   │                                                    └─ sqlite-wasm + OPFS SAHPool VFS  ← OPFS (persistent)
                   └─ node/vitest → MemoryConnection ── sqlite-wasm ':memory:' (same engine, no worker)
```

- In the browser, the wasm/DB lives **only** in a dedicated Web Worker. The main thread speaks a tiny request/response RPC: `{ id, sql, bind, mode }` → `{ id, rows } | { id, error }`, keyed by an incrementing `id`.
- `MemoryConnection` is the **same wasm engine** without OPFS/worker — used by tests (and usable in-browser if ever needed).

### Connection interface

A minimal interface keeps the repository thin and DRY; both connections implement it:

```ts
type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

interface DbConnection {
  selectAll(sql: string, bind?: SqlValue[]): Promise<Row[]>;
  run(sql: string, bind?: SqlValue[]): Promise<void>;
  tx(ops: { sql: string; bind?: SqlValue[] }[]): Promise<void>; // BEGIN…COMMIT
}
```

- `selectAll` — reads.
- `run` — single write.
- `tx` — multiple statements in one `BEGIN…COMMIT` (used by `putEvent`).

## 4. Schema (always `STRICT`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('cyan','magenta','yellow','green','orange'))
) STRICT;

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  date                TEXT NOT NULL,                 -- YYYY-MM-DD series anchor
  category_id         TEXT NOT NULL,                 -- loose reference, NO foreign key (see below)
  amount              REAL NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  notes               TEXT,                          -- nullable (CalendarEvent.notes?)
  recurrence_freq     TEXT CHECK (recurrence_freq IN ('daily','weekly','monthly','yearly')),
  recurrence_interval INTEGER CHECK (recurrence_interval >= 1),
  recurrence_ends_on  TEXT,                          -- YYYY-MM-DD inclusive, or NULL = forever
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK ((recurrence_freq IS NULL) = (recurrence_interval IS NULL)),
  CHECK (recurrence_ends_on IS NULL OR recurrence_freq IS NOT NULL)
) STRICT;
CREATE INDEX events_by_date ON events(date);

CREATE TABLE event_overrides (
  event_id          TEXT NOT NULL,
  occurrence_date   TEXT NOT NULL,                   -- YYYY-MM-DD
  cancelled         INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)),
  patch_title       TEXT,
  patch_category_id TEXT,
  patch_notes       TEXT,
  PRIMARY KEY (event_id, occurrence_date),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) STRICT;
```

### Schema rationale & invariants

- **Flattened recurrence** with `CHECK` enums enforces valid `freq`/`direction`/`color`. The `(recurrence_freq IS NULL) = (recurrence_interval IS NULL)` check enforces recurrence is all-or-nothing (`IS NULL` evaluates to 0/1, never NULL, so the comparison is well-defined). The second check forbids an `endsOn` without a recurrence. This is the payoff of the relational choice — the document model could not enforce these.
- **`category_id` has NO foreign key — deliberate.** Today an event may reference a category id that no longer exists (`deleteCategory` simply removes the row; the UI resolves an `UNKNOWN_CATEGORY` fallback via `makeCategoryResolver`). Leaving `category_id` a plain `TEXT` column preserves this loose coupling.
- **`event_overrides.event_id` HAS a FK with `ON DELETE CASCADE` — deliberate asymmetry.** Deleting an event auto-cleans its overrides. FKs are per-declaration, so enabling `PRAGMA foreign_keys = ON` enforces only this one reference, not `category_id`.
- **`amount` is `REAL`** to preserve the `amount: number` contract exactly. (Integer-cents storage is a possible future hardening; out of scope — it would ripple into forms, `balance`, and `formatCurrency`.)
- **Versioning:** `PRAGMA user_version` (start at 1). A migration runner reads `user_version`; if 0, it creates the schema and sets 1. Future schema changes are additive bumps.

## 5. Row ⇄ object mapping (fidelity rules)

Pure functions in `mappers.ts` (unit-testable without a DB).

**Write (`mapEventToRow` + override rows):**
- Apply the existing `withTransactionDefaults` normalization at the write boundary: `amount` → number or `0`; `direction` → `"withdrawal"` only when exactly that, else `"deposit"`. This satisfies the `NOT NULL` columns and preserves the legacy-defaults behavior currently covered by tests.
- `recurrence` null → `recurrence_freq/interval/ends_on` all NULL; otherwise set `freq`, `interval`, and `ends_on` (which may itself be NULL).
- `notes` undefined → NULL.

**Read (`mapRowToEvent` + grouped overrides):** reconstruct optionals by **omitting keys when columns are null**, matching how `recurrence/index.ts` consumes them:
- `notes` omitted when the column is NULL.
- `recurrence` is `null` unless `recurrence_freq` is set; otherwise `{ freq, interval, endsOn }` where `endsOn` is the column value (string or `null`).
- An override row becomes `{ occurrenceDate }`, plus `cancelled: true` **only** when the column is `1`, plus `patch: { … }` **only** with the non-null `patch_*` fields. (In practice an override is either cancelled or patched, never both, never bare — matching `cancelOccurrence`/`patchOccurrence`.)

**`putEvent` runs as one `tx`:** upsert the `events` row (`INSERT … ON CONFLICT(id) DO UPDATE SET …`) → `DELETE FROM event_overrides WHERE event_id = ?` → `INSERT` the current overrides.

**`getAllEvents`:** `SELECT * FROM events` and `SELECT * FROM event_overrides`, group overrides by `event_id` in JS, assemble. Validate assembled objects with `isCalendarEvent` as a safety net (mirrors current behavior).

## 6. Multi-tab: single active tab + graceful lock

- The worker acquires a `navigator.locks` **exclusive** lock named `"tuxbank-db"` before opening the DB, holding it for the worker's lifetime. OPFS's own exclusive lock already makes cross-tab corruption impossible; the Web Lock exists so we coordinate cleanly instead of triggering a raw OPFS lock error.
- Connection init reports a status to the main thread: `ready | waiting-locked | unavailable`.
- On `waiting-locked`, the second tab's `getAllEvents()` **stays pending** (it is not an error). The UI shows an overlay: *"tuxbank is open in another tab."* When the first tab closes, the lock frees, the worker opens the DB, status flips to `ready`, and the waiting tab loads automatically — **no manual reload**.
- A `BroadcastChannel("tuxbank")` lets the active tab announce writes/close. For v1 it drives the close/handoff signal; it is also groundwork for future live cross-tab refresh.

### `CalendarContext` change (small, additive)

- Add `storageLocked: boolean` to the context value, set from the `waiting-locked` status (and cleared on `ready`).
- Render a lightweight overlay component when `storageLocked` is true.
- Everything else in `CalendarContext` is untouched: its existing `useEffect` load, `persist` wrapper, and `storageAvailable` logic remain as-is.

## 7. Error handling

Keep `StorageError` and the `StorageErrorCode` union; **add `"LOCKED"`**. Final union:

```ts
type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "LOCKED"; // added
```

Mapping:
- Worker/OPFS unsupported (old browser) → `UNAVAILABLE`
- Another tab holds the DB (hard-fail edge; the normal case is the pending `waiting-locked` status, not this error) → `LOCKED`
- `SQLITE_FULL` / disk-full → `QUOTA_EXCEEDED`
- Schema migration failure → `VERSION_ERROR`
- `SELECT` failure → `READ_FAILED`
- `INSERT`/`UPDATE`/`DELETE` failure → `WRITE_FAILED`

`CalendarContext` already flips `storageAvailable = false` on any `StorageError` and special-cases `UNAVAILABLE`; existing behavior is preserved. `BLOCKED`/`VERSION_ERROR` remain in the union for compatibility.

## 8. Testing

- **Remove** `fake-indexeddb` (the dependency and the `import "fake-indexeddb/auto"` in `vitest.setup.ts`).
- Storage tests run against **`MemoryConnection`** — `@sqlite.org/sqlite-wasm` in-memory (`:memory:`), the **same engine** that ships, so `STRICT`/`CHECK`/FK semantics are exercised for real. `resetDbForTests()` recreates a fresh in-memory DB and re-applies the schema.
- Rewrite `storage/tests.ts`:
  - **Keep:** starts-empty, round-trip events, overwrite-by-id, delete, category round-trip, delete-category, legacy `amount`/`direction` defaults, and `seedCategoriesFromEvents` (pure unit).
  - **Drop:** the IndexedDB "v2 upgrade seeding" test (`indexedDB.open(...)`) — obsolete under fresh-start.
  - **Add:** recurrence-column round-trip (recurring event with `endsOn` null and non-null); override round-trip (cancelled and patched); `ON DELETE CASCADE` removes overrides when the event is deleted; a `CHECK`/`STRICT` violation rejects (e.g., invalid `direction`).
- **Risk & fallback:** if `@sqlite.org/sqlite-wasm` is painful to initialize under Node/jsdom, the fallback is **vitest browser mode** (Playwright) — which still runs the **real WASM engine** — never a native library. Mapping logic in `mappers.ts` is pure and tested independently of any DB, limiting exposure.

## 9. Build & deploy

- Worker created via `new Worker(new URL("./connection/worker.ts", import.meta.url), { type: "module" })` (supported by Turbopack).
- **No COOP/COEP headers required** (SAHPool VFS), so the Vercel/Next deploy stays header-free.
- **Risk & fallback:** Turbopack locating `sqlite3.wasm` inside the bundled worker. Fallback: copy the wasm into `/public` and pass `locateFile` to `sqlite3InitModule`. May require a small `next.config.ts` change (currently the default empty config).
- Guard worker creation behind `typeof window !== "undefined" && typeof Worker !== "undefined"`; fall back to `UNAVAILABLE` otherwise.

## 10. Module structure

Follows the project module conventions (directory named after the export; `index.ts` + optional `consts.ts`/`types.ts`/`tests.ts`; re-export types/consts from `index.ts`):

```
src/lib/storage/
  index.ts               # public API (unchanged signatures) + re-exports of consts/types
  consts.ts              # DB filename, SCHEMA_VERSION, SQL DDL strings, default amount/direction
  types.ts               # StorageError (+ LOCKED) + isStorageError, SqlValue/Row, DbConnection
  schema.ts              # DDL application + user_version migration runner
  mappers.ts             # pure row ⇄ domain-object mapping (events, categories, overrides)
  connection/
    index.ts             # getConnection() environment selection + resetDbForTests
    worker.ts            # worker entry: sqlite-wasm init, SAHPool VFS, navigator.locks, RPC loop
    workerConnection.ts  # main-thread DbConnection over the worker (RPC client)
    memoryConnection.ts  # in-memory DbConnection (sqlite-wasm ':memory:') for tests/node
  tests.ts
```

`seedCategoriesFromEvents` and `withTransactionDefaults` carry over (the former unchanged; the latter applied at the write boundary).

## 11. Dependencies

- **Add:** `@sqlite.org/sqlite-wasm`
- **Remove:** `idb`, `fake-indexeddb`
- **Not added:** `better-sqlite3` or any native SQLite engine (no browser support; would break test/prod parity).

## 12. Out of scope / future

- True simultaneous multi-tab editing (shared-connection model: per-tab worker + leader election via `navigator.locks`/`BroadcastChannel`, since SharedWorker cannot access OPFS). Evolvable later **without** changing the public storage API — only the internal transport changes.
- Integer-cents money representation.
- `.sqlite` database export/import for backup — a natural feature this foundation unlocks.
- Any SQL-side recurrence expansion — expansion stays in the `recurrence` module; storage only round-trips the stored event (anchor + recurrence + overrides).

## 13. Risks summary

| Risk | Mitigation |
|---|---|
| `sqlite-wasm` worker + wasm bundling under Turbopack | Copy `sqlite3.wasm` to `/public` + `locateFile`; small `next.config.ts` tweak. |
| `sqlite-wasm` init under Node/vitest for tests | Fallback to vitest browser mode (real WASM engine); pure `mappers.ts` tested DB-free. |
| OPFS unsupported on very old browsers | Surface `UNAVAILABLE`; acceptable for modern browsers. |
| Second tab broken silently | `navigator.locks` coordination + overlay + auto-handoff (§6). |
