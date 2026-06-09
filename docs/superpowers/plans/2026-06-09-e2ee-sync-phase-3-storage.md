# E2EE Sync Phase 3: Local storage changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local IndexedDB layer sync-ready without changing any logged-out behavior: give `Category` an `updatedAt`, add a `tombstones` store so deletes can propagate, add a `syncMeta` store for the sync cursor, and migrate the database to version 2 (backfilling `updatedAt` on existing rows).

**Architecture:** The app stays local-first. The context remains the place that stamps record timestamps (as it already does for events); this phase extends that to categories. The storage module gains two new object stores and tombstone bookkeeping: deleting a row records a tombstone, and writing a row clears any tombstone for that id (so a re-created or undone row is not later ghost-deleted by sync). Nothing reads tombstones or the cursor yet; the sync engine (Phase 4) consumes them.

**Tech Stack:** TypeScript (ESM), `idb`, vitest with `fake-indexeddb`.

This plan implements the "Local model and storage changes" portion of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`, using `timestamptz`-style ISO string timestamps (not the spec's `bigint`), consistent with the Phase 2 schema correction.

---

## Background and key decisions

- **`Category` gains `updatedAt: string`, required**, matching `CalendarEvent` (which already has required `createdAt`/`updatedAt`). Like events, the `isCategory` guard does NOT validate `updatedAt`; this preserves backward compatibility (old stored rows and old backups still pass the guard) and matches the existing `isCalendarEvent` behavior. The required type field forces every construction site to set it, which the compiler enforces.
- **Timestamps are ISO-8601 UTC strings** (`new Date().toISOString()`), which sort chronologically and match what events already use and what Phase 2's `timestamptz` columns expect.
- **Tombstones** live in their own store, keyed by `id`, each `{ id, type, updatedAt }`. Writing a row deletes its tombstone; deleting a row writes one. Event and category ids are distinct UUIDs (`crypto.randomUUID()`), so a shared, id-keyed tombstone store is unambiguous.
- **Backfill:** the v1-to-v2 upgrade stamps a sentinel `updatedAt` (`LEGACY_UPDATED_AT`, the Unix epoch) on any existing event or category row missing one. The epoch marks the row as "pre-sync age"; the first sync uploads to an empty server anyway, so the exact value only matters as a tie-break and epoch is the safe, deterministic floor.
- **Out of scope (Phase 4 will handle):** defensive `updatedAt` stamping when pushing rows that came from an old imported backup; any reading of tombstones or the cursor.

## Conventions (repeat from the repo)

- Modules are directories with `index.ts` / `consts.ts` / `types.ts` / `tests.ts`. `index.ts` re-exports consts and types. Tests import from `./index` and use `resetDbForTests()` from `./testing` (fake-indexeddb).
- Arrow functions, named constants, numeric separators, no `as` casts on unknown values, `@/` alias across modules.
- Run `pnpm check` before each commit (`pnpm format` first if it flags formatting).

---

## Task 1: Storage consts and tombstone type

Add the new store names, bump the DB version, and define the `Tombstone` type and guard. No behavior change yet.

**Files:**
- Modify: `src/lib/storage/consts.ts`
- Modify: `src/lib/storage/types.ts`

- [ ] **Step 1: Update the consts**

Replace the contents of `src/lib/storage/consts.ts` with:
```typescript
/** IndexedDB database + object store identity. Fresh DB name = fresh start. */
export const DB_NAME = "tuxbank";
export const DB_VERSION = 2;
export const STORE = "events";
export const CATEGORY_STORE = "categories";
export const TOMBSTONE_STORE = "tombstones";
export const SYNC_META_STORE = "syncMeta";

/** Key for the single sync-cursor value held in the syncMeta store. */
export const SYNC_CURSOR_KEY = "cursor";

/** Sentinel updatedAt stamped on rows that predate the v2 (sync) migration. */
export const LEGACY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

/** JSON backup file identity + schema version. */
export const BACKUP_APP = "tuxbank";
export const BACKUP_SCHEMA_VERSION = 1;
```

- [ ] **Step 2: Add the Tombstone type and guard**

In `src/lib/storage/types.ts`, the file already imports `isArray, isPlainObject, isString` from remeda. Add this near the other interfaces/guards:
```typescript
export type TombstoneType = "event" | "category";

/** A record of a deleted row, kept so the deletion can be synced. */
export interface Tombstone {
  id: string;
  type: TombstoneType;
  updatedAt: string;
}

export const isTombstone = (value: unknown): value is Tombstone =>
  isPlainObject(value) &&
  isString(value.id) &&
  (value.type === "event" || value.type === "category") &&
  isString(value.updatedAt);
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: passes. `storage/index.ts` re-exports `* from "./consts"` and `* from "./types"`, so the new names and type are exported from the module automatically.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/consts.ts src/lib/storage/types.ts
git commit -m "feat(storage): add tombstone type and sync store constants"
```

---

## Task 2: Add updatedAt to Category

Make `Category` carry `updatedAt`, set it everywhere a category is constructed, and fix the const fixtures and any test fixtures the compiler flags.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/types/consts.ts`
- Modify: `src/context/CalendarContext/index.tsx`
- Modify: test files the compiler flags (at least `src/lib/storage/tests.ts`)

- [ ] **Step 1: Add the field to the type**

In `src/types/index.ts`, change the `Category` type to:
```typescript
export type Category = {
  id: string;
  name: string;
  color: CategoryColor;
  updatedAt: string;
};
```
Do NOT change `isCategory`. It intentionally does not validate `updatedAt` (matching `isCalendarEvent`, which does not validate its timestamps), so old rows and old backups still pass.

- [ ] **Step 2: Add updatedAt to the const categories**

In `src/types/consts.ts`, add `updatedAt` to each preset and to `UNKNOWN_CATEGORY`. These are synthetic (presets are fixtures, `UNKNOWN_CATEGORY` is a resolver fallback that is never stored), so the Unix-epoch sentinel is appropriate. Inline the literal here with a comment; do NOT import `LEGACY_UPDATED_AT` from `@/lib/storage`, because `@/lib/storage` imports from `@/types` and that would create a circular import (a runtime initialization-order cycle, which tsc would not catch):
```typescript
import type { Category } from "./index";

// Same value as storage's LEGACY_UPDATED_AT, inlined to avoid a types <-> storage
// import cycle. These categories are synthetic and never persisted.
const SYNTHETIC_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export const PRESET_CATEGORIES: readonly Category[] = [
  { id: "work", name: "Work", color: "cyan", updatedAt: SYNTHETIC_UPDATED_AT },
  { id: "personal", name: "Personal", color: "magenta", updatedAt: SYNTHETIC_UPDATED_AT },
  { id: "health", name: "Health", color: "green", updatedAt: SYNTHETIC_UPDATED_AT },
  { id: "finance", name: "Finance", color: "yellow", updatedAt: SYNTHETIC_UPDATED_AT },
  { id: "social", name: "Social", color: "orange", updatedAt: SYNTHETIC_UPDATED_AT },
];

export const UNKNOWN_CATEGORY: Category = {
  id: "unknown",
  name: "Uncategorized",
  color: "cyan",
  updatedAt: SYNTHETIC_UPDATED_AT,
};
```

- [ ] **Step 3: Stamp updatedAt in the context category writes**

In `src/context/CalendarContext/index.tsx`, in `createCategory`, change the constructed category to include the timestamp:
```typescript
      const category: Category = {
        id: newId(),
        name: name.trim(),
        color,
        updatedAt: nowISO(),
      };
```
And in `updateCategory`, change the `next` object to:
```typescript
      const next: Category = {
        ...current,
        ...patch,
        name: patch.name?.trim() ?? current.name,
        updatedAt: nowISO(),
      };
```

- [ ] **Step 4: Fix test fixtures the compiler flags**

Run `pnpm check`. For every Category object literal in a TEST file that the compiler now reports as missing `updatedAt` (for example in `src/lib/storage/tests.ts`), add `updatedAt: new Date().toISOString()` to that literal. Do not change the `isCategory` test in `src/types/tests.ts` that passes `{ id, name, color }` without `updatedAt`; that call passes an `unknown` argument to the guard, so it does not error, and it documents that the guard still accepts timestamp-less input.

- [ ] **Step 5: Verify**

Run: `pnpm check` then `pnpm test`
Expected: both pass. `pnpm check` is clean once every Category construction site has `updatedAt`.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/types/consts.ts src/context/CalendarContext/index.tsx src/lib/storage/tests.ts
git commit -m "feat(types): give Category an updatedAt timestamp"
```
(If the compiler flagged Category literals in additional test files, `git add` those too. Never use `git add .`.)

---

## Task 3: Migrate the database to version 2

Create the two new stores and backfill `updatedAt` on existing rows during the upgrade.

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/tests.ts` (it already imports `resetDbForTests` from `./testing`; add `openDB` from `idb` and the needed consts to its imports):
```typescript
describe("v2 migration", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("backfills updatedAt on rows created under v1 and adds the sync stores", async () => {
    // Build a v1 database with a legacy category that has no updatedAt.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: "id" });
        db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
      },
    });
    await v1.put(CATEGORY_STORE, { id: "c1", name: "Legacy", color: "cyan" });
    v1.close();
    resetDbCache();

    // Reading through the production accessor opens v2 and runs the migration.
    const categories = await getAllCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0].updatedAt).toBe(LEGACY_UPDATED_AT);

    // The new stores exist and are usable.
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
  });
});
```
Add to the imports at the top of the test file as needed: `openDB` from `"idb"`, and from `"./index"`: `resetDbCache`, `getTombstones`, `getSyncCursor`, and from the module the consts `DB_NAME`, `STORE`, `CATEGORY_STORE`, `LEGACY_UPDATED_AT`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: FAIL, `getTombstones` / `getSyncCursor` are not exported and the new stores do not exist.

- [ ] **Step 3: Update the upgrade in `src/lib/storage/index.ts`**

Add `TOMBSTONE_STORE`, `SYNC_META_STORE`, `SYNC_CURSOR_KEY`, `LEGACY_UPDATED_AT` to the consts import, and `Tombstone`, `isTombstone` to the types import. Make the upgrade callback `async` and inline the backfill, awaiting it so the version-change transaction cannot auto-commit before the backfill finishes. Inlining also lets idb infer the `tx` type, avoiding a fragile hand-written type. In `getDb`, change the `openDB` options to:
```typescript
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore(STORE, { keyPath: "id" });
          db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
        }
        if (oldVersion < 2) {
          db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
          db.createObjectStore(SYNC_META_STORE);
          // Backfill updatedAt on pre-v2 rows. Awaited so the upgrade
          // transaction stays open until every row is stamped. The loop keeps
          // the isPlainObject narrowing, so no cast is needed to spread `row`.
          for (const name of [STORE, CATEGORY_STORE]) {
            const store = tx.objectStore(name);
            const rows: unknown[] = await store.getAll();
            const puts: Promise<unknown>[] = [];
            for (const row of rows) {
              if (isPlainObject(row) && !isString(row.updatedAt)) {
                puts.push(store.put({ ...row, updatedAt: LEGACY_UPDATED_AT }));
              }
            }
            await Promise.all(puts);
          }
        }
      },
    }).catch((cause) => {
```
Add `isPlainObject` to the existing remeda import in `index.ts` (it currently may not import it). Then add the new accessors near the other exports:
```typescript
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
```
Ensure `isString` and `isPlainObject` are imported from `remeda` at the top of `index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: PASS, the migration test is green and existing storage tests still pass.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean (run `pnpm format` if needed).
```bash
git add src/lib/storage/index.ts src/lib/storage/tests.ts
git commit -m "feat(storage): migrate to v2 with tombstone and syncMeta stores"
```

---

## Task 4: Tombstones on delete, cleared on write

Deleting a row writes a tombstone; writing a row clears any tombstone for that id. Both are transactional with the row change.

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/tests.ts`:
```typescript
describe("tombstones", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  const evt = (id: string): CalendarEvent => ({
    id,
    title: "t",
    date: "2026-06-09",
    categoryId: "work",
    amount: 1,
    direction: "deposit",
    recurrence: null,
    overrides: [],
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  });

  it("records a tombstone when an event is deleted", async () => {
    await putEvent(evt("e1"));
    await deleteEvent("e1");
    const tombstones = await getTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ id: "e1", type: "event" });
    expect(typeof tombstones[0].updatedAt).toBe("string");
  });

  it("clears a tombstone when the same id is written again", async () => {
    await putEvent(evt("e1"));
    await deleteEvent("e1");
    await putEvent(evt("e1"));
    expect(await getTombstones()).toEqual([]);
  });

  it("records a tombstone when a category is deleted", async () => {
    await putCategory({ id: "k1", name: "K", color: "cyan", updatedAt: "2026-06-09T00:00:00.000Z" });
    await deleteCategory("k1");
    const tombstones = await getTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ id: "k1", type: "category" });
  });
});
```
Ensure the test file imports `putEvent`, `deleteEvent`, `putCategory`, `deleteCategory`, `getTombstones` from `./index` and the `CalendarEvent` type.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: FAIL, no tombstone is recorded (the delete just removes the row).

- [ ] **Step 3: Rewrite the four write functions to maintain tombstones**

In `src/lib/storage/index.ts`, add a local timestamp helper near the top (after the imports):
```typescript
const nowISO = (): string => new Date().toISOString();
```
Replace `putEvent`, `deleteEvent`, `putCategory`, and `deleteCategory` with versions that span the row store and the tombstone store in one transaction:
```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: PASS, all tombstone cases green, existing put/delete/get tests still pass.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/storage/index.ts src/lib/storage/tests.ts
git commit -m "feat(storage): write tombstones on delete, clear them on write"
```

---

## Task 5: Clear tombstones on backup import

A JSON import replaces the whole dataset, so stale tombstones from before the import must be cleared, or sync would try to delete rows the import just created.

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/tests.ts`:
```typescript
describe("import clears tombstones", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("removes tombstones when a backup is imported", async () => {
    await putEvent({
      id: "e1",
      title: "t",
      date: "2026-06-09",
      categoryId: "work",
      amount: 1,
      direction: "deposit",
      recurrence: null,
      overrides: [],
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    await deleteEvent("e1");
    expect(await getTombstones()).toHaveLength(1);

    const backup = await exportDatabase();
    await commitImport(backup);

    expect(await getTombstones()).toEqual([]);
  });
});
```
Ensure `exportDatabase` and `commitImport` are imported in the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: FAIL, the tombstone survives the import.

- [ ] **Step 3: Extend `commitImport` to clear the tombstone store**

In `src/lib/storage/index.ts`, in `commitImport`, change the transaction to span the tombstone store and clear it alongside the others. Change the transaction line:
```typescript
    const tx = db.transaction(
      [STORE, CATEGORY_STORE, TOMBSTONE_STORE],
      "readwrite",
    );
```
and inside the inner `try`, add the tombstone store and include its clear in the queued requests:
```typescript
      const events = tx.objectStore(STORE);
      const categories = tx.objectStore(CATEGORY_STORE);
      const tombstones = tx.objectStore(TOMBSTONE_STORE);
      requests.push(events.clear(), categories.clear(), tombstones.clear());
```
Leave the rest of `commitImport` (the per-record puts, the abort/rollback handling) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/storage/index.ts src/lib/storage/tests.ts
git commit -m "feat(storage): clear tombstones on backup import"
```

---

## Task 6: Sync cursor round-trip test

The cursor accessors were added in Task 3; lock their behavior with a direct test.

**Files:**
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the test**

Add to `src/lib/storage/tests.ts`:
```typescript
describe("sync cursor", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("returns undefined before any cursor is set", async () => {
    expect(await getSyncCursor()).toBeUndefined();
  });

  it("round-trips a stored cursor value", async () => {
    await setSyncCursor("2026-06-09T12:00:00.000Z");
    expect(await getSyncCursor()).toBe("2026-06-09T12:00:00.000Z");
  });
});
```
Ensure `setSyncCursor` is imported in the test file.

- [ ] **Step 2: Run the test**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: PASS (the accessors already exist from Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/tests.ts
git commit -m "test(storage): cover sync cursor round-trip"
```

---

## Task 7: Full verification

- [ ] **Step 1: Whole suite**

Run: `pnpm test`
Expected: PASS. All existing tests plus the new storage and type changes are green.

- [ ] **Step 2: Final check**

Run: `pnpm check`
Expected: clean.

---

## Definition of done

- `Category` has a required `updatedAt`, set in the context and the const fixtures; `isCategory` is unchanged.
- The database is at version 2 with `tombstones` and `syncMeta` stores; the upgrade backfills `updatedAt` on legacy rows.
- Deleting an event or category writes a tombstone; writing a row clears its tombstone; importing a backup clears all tombstones.
- `getTombstones`, `getSyncCursor`, and `setSyncCursor` are exported and tested.
- Full suite and `pnpm check` are green. No logged-out behavior changed.

## What this phase deliberately does not do

- No network, no Supabase, no encryption. Tombstones and the cursor are written and read locally but not yet synced (Phase 4).
- No defensive `updatedAt` stamping for categories that arrive from an old imported backup without one; Phase 4's push path will stamp such rows before upload.
- The `nowISO` helper is duplicated in the context and storage. If a third copy appears later, extract it to `src/utils`.
