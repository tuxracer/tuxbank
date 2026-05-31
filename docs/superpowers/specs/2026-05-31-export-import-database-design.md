# Export / Import Database — Design

**Date:** 2026-05-31
**Status:** Approved (design)
**Topic:** Let the user back up and restore the entire tuxbank database as a raw SQLite file.

## Summary

tuxbank stores everything (events with embedded recurrence + overrides, and
categories) in a single SQLite-WASM database persisted in OPFS via the SAH-Pool
VFS. This feature adds the ability to **export** that database to a downloadable
`.sqlite3` file and **import** a previously exported file back, replacing all
current data.

A raw SQLite snapshot was chosen over a JSON interchange format: it is an exact,
byte-for-byte backup. The trade-off — opacity and tight coupling to the schema
version — is mitigated by strict validation on import.

## Decisions

- **Format:** raw SQLite binary (`.sqlite3`), not JSON.
- **Import semantics:** always a **full replace** of the database file. A binary
  snapshot is the whole database; there is no partial/merge import.
- **Import safety:** **strict validate, then confirm.** The file is verified in a
  throwaway in-memory DB first; only on success is a confirmation shown; only on
  confirm is the live file swapped. The live database is never touched if the
  file is invalid.
- **UI entry point:** a new `◢ DATA` toolbar button (next to `◢ CATEGORIES`) that
  opens a `DataDialog` containing Export and Import actions.

## Architecture

Four layers, following the existing storage stack:

```
DataDialog (UI)  ─►  CalendarContext  ─►  storage repo  ─►  worker op       ─►  SAHPool VFS / oo1 DB
  ◢ DATA button      exportData()         exportDatabase()   "export"            sqlite3_js_db_export(db)
                     previewImport(file)  validateImport()   "import-validate"   in-memory deserialize + checks
                     commitImport(file)   commitImport()     "import-commit"     close → importDb → reopen
```

No backend is involved; everything runs in the browser, consistent with the rest
of the app.

### Worker ops (`src/lib/storage/connection/worker.ts`)

The worker currently retains only `sync: SyncDb | null`. Export/import also need
the `sqlite3` module, the `poolUtil` (OpfsSAHPoolUtil), and the oo1 `db` handle,
so `open()` will store these in module scope alongside `sync`.

Three new ops are added to the worker message handler:

- **`export`** — `sqlite3.capi.sqlite3_js_db_export(db.pointer)` returns a
  `Uint8Array` of the full database; posted back to the main thread (transferable).
- **`import-validate`** — load the incoming bytes into a throwaway `:memory:` DB
  via `sqlite3_deserialize` and run the validation checks (below). The live file
  is **never** touched. Resolves with a preview `{ events, categories,
  schemaVersion }` or rejects with `IMPORT_INVALID`.
- **`import-commit`** — re-run validation defensively, then:
  `db.close()` → `poolUtil.importDb(DB_FILENAME, bytes)` → reopen
  `new poolUtil.OpfsSAHPoolDb(DB_FILENAME)` → `initSyncDb` (FK pragma + migrate),
  updating module `db`/`sync`. If the swap throws, reopen the original file so the
  app retains a live connection, and surface `WRITE_FAILED` / `QUOTA_EXCEEDED`.

A shared `validateBytes(sqlite3, bytes)` helper backs both validate and commit.

The worker is single-threaded and processes messages serially, so the transient
window during commit (between `close` and reopen, where `sync` is null) cannot be
observed by another op.

### Validation checks (`validateBytes`)

Run against a throwaway in-memory DB, in order; any failure → `IMPORT_INVALID`:

1. **Magic header** — first 16 bytes equal `"SQLite format 3\0"`.
2. **`PRAGMA integrity_check`** returns `ok`.
3. **Expected tables present** — `events`, `categories`, `event_overrides`.
4. **Schema version** — `PRAGMA user_version === SCHEMA_VERSION` (currently `1`).

On success it also reads `SELECT count(*)` for events and categories to build the
preview shown in the confirmation step.

### Storage repo + connection (`src/lib/storage`)

- Extend the `DbConnection` interface with (names mirror the repo functions):
  - `exportDb(): Promise<Uint8Array>`
  - `validateImport(bytes: Uint8Array): Promise<ImportPreview>`
  - `commitImport(bytes: Uint8Array): Promise<void>`
- Implement them in:
  - `workerConnection` — postMessage with the new ops, correlated by `id`; the
    `export` response carries the bytes.
  - `memoryConnection` — implemented directly against its oo1 DB handle
    (`sqlite3_js_db_export` for export, `sqlite3_deserialize` for import), so the
    whole feature is unit-testable with real sqlite-wasm and no worker.
- New repo functions in `src/lib/storage/index.ts`:
  `exportDatabase()`, `validateImport(bytes)`, `commitImport(bytes)`.
- Add `"IMPORT_INVALID"` and `"EXPORT_FAILED"` to `StorageErrorCode` for precise
  UI messaging.
- `ImportPreview` type: `{ events: number; categories: number; schemaVersion: number }`.

### Context (`src/context/CalendarContext`)

- Extract the mount-time load into a reusable `reload()` callback that re-runs
  `getAllEvents()` + `getAllCategories()` and resets `events` / `categories`
  state. The existing mount effect calls it.
- `exportData()` — get bytes from `exportDatabase()`, wrap in a `Blob`, and
  `downloadBlob(blob, "tuxbank-backup-${todayISO}.sqlite3")`.
- `previewImport(file)` — read `new Uint8Array(await file.arrayBuffer())`, call
  `validateImport(bytes)`, return the preview (or throw `IMPORT_INVALID`).
- `commitImport(file)` — call `commitImport(bytes)`, then `reload()` so the UI
  reflects the restored data.

### Shared utility

- `src/utils/downloadBlob/index.ts` — `downloadBlob(blob, filename)` creates an
  object URL, clicks a synthesized `<a download>`, and revokes the URL. Reusable
  and easily mockable in tests.

### UI (`src/components/DataDialog` + toolbar)

- `CalendarToolbar` gains a `◢ DATA` button next to `◢ CATEGORIES`, wired through
  `page.tsx` with a `dataOpen` state, mirroring the existing `manageOpen` pattern.
- `DataDialog` (shadcn `Dialog` + `CyberFrame`, cyberpunk styling matching
  `ManageCategoriesDialog`) runs a small state machine:

  - **idle** — Export button + Import button (a hidden
    `<input type="file" accept=".sqlite3,.sqlite,.db">`).
  - Picking a file → **validating** → on success **confirm**:
    "Replace all current data — *N* events, *M* categories — with this backup
    containing *A* events, *B* categories? This cannot be undone."
  - Confirm → **importing** → **done**.
  - Validation failure → **error** showing the `IMPORT_INVALID` message; the live
    data is untouched and the dialog returns to idle.

## Error handling & edge cases

- **Invalid / foreign / corrupt file** — caught at the validate stage; the live DB
  is never touched; the dialog shows a clear message.
- **Storage unavailable** — existing `UNAVAILABLE` path; Export/Import buttons are
  disabled when `!storageAvailable`.
- **Swap failure mid-commit** — the worker reopens the database file and surfaces
  `WRITE_FAILED` / `QUOTA_EXCEEDED`; worst case the user retries the import.
- **Single-active-tab** — import runs in the lock-holding worker; background tabs
  already display the locked overlay, so there is no new cross-tab concern.

## Non-goals

- No JSON / human-readable export.
- No partial or merge import.
- No cross-schema-version migration of imported files (a mismatched
  `user_version` is rejected). Forward compatibility is deferred until a v2 schema
  actually exists.
- The HUD's stale `LOCAL_DB::INDEXEDDB` label is **not** changed here (the storage
  is SQLite/OPFS). Left out of scope to avoid unrelated churn.

## Testing

- **Storage round-trip** — seed events + categories, export, wipe, commit-import,
  and assert `getAllEvents` / `getAllCategories` return identical data (real
  sqlite-wasm via `memoryConnection`).
- **Validation** — garbage bytes, a valid SQLite file missing the expected tables,
  and a file with the wrong `user_version` each reject with `IMPORT_INVALID`.
- **Context** — `previewImport` + `commitImport` reload state; `exportData` calls
  the (mocked) download helper.
- **DataDialog** — Export click fires the handler; an invalid file shows the error;
  a valid file shows the confirm step; confirming fires commit.
- Per the project's jsdom caveat, real file download and the worker boundary are
  not exercised in jsdom; tests cover the JS seams via `memoryConnection` and a
  mocked `downloadBlob`.
```
