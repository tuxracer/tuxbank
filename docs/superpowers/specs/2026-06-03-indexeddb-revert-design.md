# Revert Storage to IndexedDB with JSON Backup — Design

**Date**: 2026-06-03
**Status**: Approved

## Problem

The SQLite-WASM storage layer (Web Worker + RPC + OPFS + SQL mappers) is far more
machinery than this single-user app needs. The user wants to revert to IndexedDB
with a **fresh start** (no migration of existing data in either the OPFS SQLite
database or the pre-migration `cyber-calendar` IndexedDB database) and replace the
opaque `.sqlite3` backup format with human-readable **JSON export/import**.

Primary driver: **overall complexity reduction**.

## Decisions

| Question | Decision |
| --- | --- |
| Multi-tab handling | Drop entirely — delete `StorageLockedOverlay` and all lock plumbing. Tabs work independently; last write wins. |
| Import semantics | Replace-all (validate → preview counts → confirm → wipe and restore), same flow as today. |
| Approach | Resurrect the proven pre-migration `idb` repository from git history (`42e2515~1`), trimmed, plus new JSON export/import. |
| Data migration | None. New DB name so neither old database is read. |

## Approach

Restore the pre-migration IndexedDB repository (it has the identical public CRUD
API the app consumes today), trim its migration scaffolding, and add JSON
export/import functions under the same names the context already imports
(`exportDatabase`, `validateImport`, `commitImport`). Delete all SQLite
infrastructure.

## Storage module (`src/lib/storage/`)

Flat module again — the `connection/` subdirectory, `mappers.ts`, `schema.ts`,
and the worker are deleted.

### `index.ts`

- `idb`'s `openDB(DB_NAME, DB_VERSION)` with an `upgrade` callback creating two
  object stores: `events` and `categories`, both `keyPath: "id"`. Records are
  stored as the in-memory `CalendarEvent` / `Category` types verbatim — no
  row mapping.
- Cached `dbPromise`; missing `indexedDB` global → `StorageError("UNAVAILABLE")`;
  `openDB` rejection → `UNAVAILABLE` and the cache is reset so a retry is
  possible. `blocked` is a no-op (fresh v1 DB, no upgrade path).
- CRUD API (unchanged signatures): `getAllEvents`, `putEvent`, `deleteEvent`,
  `getAllCategories`, `putCategory`, `deleteCategory`. Reads filter records
  through the existing `isCalendarEvent` / `isCategory` type guards.
- **Trimmed from the old version** (fresh start, no legacy data):
  `withTransactionDefaults` normalization, `seedCategoriesFromEvents`, and the
  v2 category-seeding upgrade migration.
- JSON backup API:
  - `exportDatabase(): Promise<string>` — pretty-printed JSON of all events and
    categories.
  - `validateImport(text: string): Promise<ImportPreview>` — parse and validate
    without touching the live database; returns
    `{ events, categories, schemaVersion }` counts for the confirm step.
  - `commitImport(text: string): Promise<void>` — one readwrite transaction over
    both stores: clear both, then put every record. IndexedDB aborts and rolls
    back the transaction on failure, so a failed import cannot half-wipe data.

### `consts.ts`

- `DB_NAME = "tuxbank"` (new name — guarantees the fresh start), `DB_VERSION = 1`
- `STORE = "events"`, `CATEGORY_STORE = "categories"`
- `BACKUP_SCHEMA_VERSION = 1`, `BACKUP_APP = "tuxbank"`

### `types.ts`

- `StorageError` class unchanged; code union trimmed to
  `UNAVAILABLE | QUOTA_EXCEEDED | BLOCKED | READ_FAILED | WRITE_FAILED | IMPORT_INVALID | EXPORT_FAILED`
  (drop `LOCKED`, `VERSION_ERROR`).
- `ImportPreview` unchanged: `{ events: number; categories: number; schemaVersion: number }`.
- Deleted: `SqlValue`, `Row`, `Oo1Db`, `SyncDb`, `DbConnection`, `ConnectionStatus`.

## Backup file format

Filename `tuxbank-backup-YYYY-MM-DD.json`, MIME `application/json`,
pretty-printed (2-space indent) so backups are human-readable and diffable:

```json
{
  "app": "tuxbank",
  "schemaVersion": 1,
  "exportedAt": "2026-06-03T18:00:00.000Z",
  "events": [],
  "categories": []
}
```

`events` / `categories` hold `CalendarEvent[]` / `Category[]` exactly as stored —
zero mapping code.

`validateImport` throws `StorageError("IMPORT_INVALID")` unless: the text parses
as JSON, `app === "tuxbank"`, `schemaVersion === 1`, `events`/`categories` are
arrays, and **every** record passes `isCalendarEvent` / `isCategory`
(all-or-nothing, same strictness as the SQLite validator).

## Error handling

- Writes map `DOMException` `QuotaExceededError` → `QUOTA_EXCEEDED`, anything
  else → `WRITE_FAILED`. Reads → `READ_FAILED`. Export → `EXPORT_FAILED`.
- `CalendarContext`'s existing handling is untouched: `UNAVAILABLE` on load →
  `storageAvailable = false`; the `persist` wrapper degrades to in-memory on
  storage errors.

## Context & UI changes

### `CalendarContext`

- Delete the `onConnectionStatus` effect and the `storageLocked` state/context
  field (and its `types.ts` entry).
- `exportData`: download the string from `exportDatabase()` as an
  `application/json` blob named `tuxbank-backup-YYYY-MM-DD.json`.
- `previewImport` / `importData`: read the `File` with `file.text()` instead of
  `arrayBuffer()`. `importData` still calls `reloadData()` after commit.
- Everything else (optimistic updates, recurrence scopes, categories) untouched.

### `DataDialog`

- File input `accept=".json,application/json"`.
- Staged validate → confirm → import flow, preview counts, and the
  `IMPORT_INVALID` friendly error message stay as-is (the "made by a different
  version" wording still fits — it now covers `schemaVersion` mismatches).

### `page.tsx`

- Remove the `<StorageLockedOverlay />` render.

## Deletions

- `src/lib/storage/connection/` (worker, RPC, memory connection, dbFile,
  testing hook), `src/lib/storage/mappers.ts`, `mappers.test.ts`, `schema.ts`
- `src/components/StorageLockedOverlay/`
- `scripts/copy-sqlite-wasm.mjs`, `public/sqlite/`, the `/public/sqlite/`
  `.gitignore` entry
- `package.json`: `@sqlite.org/sqlite-wasm` dependency, the `copy-sqlite`
  script; `dev` / `build` become plain `next dev` / `next build`
- `vitest.config.ts`: the `optimizeDeps.exclude` for sqlite-wasm

(`pnpm-workspace.yaml`'s `ignoredBuiltDependencies` — sharp, unrs-resolver,
msw — are unrelated to sqlite and stay.)

## Dependencies

- Add `idb` (runtime, ~1 kB promise wrapper over IndexedDB).
- Add `fake-indexeddb` (dev-only, for tests).
- Remove `@sqlite.org/sqlite-wasm`.

## Testing

- `src/lib/storage/tests.ts` rewritten against `fake-indexeddb` with a fresh
  `IDBFactory` per test (no shared state between tests).
- Coverage: CRUD round-trips for events and categories; corrupt records filtered
  out by type guards on read; export → `commitImport` round-trip restores
  identical data; `validateImport` rejects bad JSON, wrong `app`, wrong
  `schemaVersion`, and invalid records; `commitImport` fully replaces
  pre-existing data.
- `CalendarContext` tests: update mocks (`exportDatabase` resolves a string;
  drop `onConnectionStatus`).
- `DataDialog` tests are props-driven and stay as-is.
- `connection/tests.ts` and `mappers.test.ts` are deleted with their modules.
- Manual verification in a real browser (jsdom has no layout engine): create and
  edit an event, export, import-replace, reload.

## Documentation

Update `CLAUDE.md` and `docs/TRD.md`: architecture description (IndexedDB via
`idb`, JSON backups), commands (`dev`/`build` no longer run `copy-sqlite`), and
remove the sqlite-specific gotchas (bundling workaround, single-tab OPFS lock,
storage-tests-bypass-the-worker note).
