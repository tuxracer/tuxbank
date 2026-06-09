# E2EE Sync Phase 4: Sync engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/sync`, the engine that pushes local changes to Supabase and pulls remote changes back, encrypting every payload with the data key and resolving conflicts last-write-wins per row. It runs against a small, mockable `SyncRemote` interface so the whole engine is unit-testable with no network.

**Architecture:** A React-free module that ties together `@/lib/crypto` (encrypt/decrypt), `@/lib/supabase` (base64 row serialization + the client), and `@/lib/storage` (local reads, tombstones, cursor). The engine reads a snapshot of local state, pulls remote rows newer than the saved cursor and applies them (delete or decrypt-and-upsert), then pushes local rows and tombstones newer than the cursor that were not just pulled. Network I/O is abstracted behind `SyncRemote`; the real implementation wraps the Supabase client, and tests pass an in-memory fake. The data key (DEK) is a parameter, supplied by the caller (Phase 5 unwraps it from the password).

**Tech Stack:** TypeScript (ESM), `@supabase/supabase-js`, vitest with `fake-indexeddb`.

This plan implements the "Sync and merge" section of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`.

---

## Background and key decisions

- **Cursor:** a single ISO-8601 timestamp in the `syncMeta` store (`getSyncCursor`/`setSyncCursor` from Phase 3), defaulting to the epoch. After a sync it advances to the maximum `updated_at`/`updatedAt` seen across pulled and pushed rows.
- **Last-write-wins per row:** a remote row is applied only when its `updated_at` is strictly greater than the local record's (or its tombstone's) `updatedAt`. Strict `>` means re-seeing an identical row is a no-op, so sync is idempotent.
- **Encrypted payload:** the whole event or category record is encrypted into `ciphertext` with a fresh nonce. Plaintext columns (`id`, `updated_at`, `deleted`) carry the routing metadata the server needs to merge without reading the payload. A tombstone (delete) is pushed with `deleted: true` and an encrypted empty object `{}` (the schema's `nonce`/`ciphertext` are NOT NULL).
- **Applying a remote delete must not create a new local tombstone.** Using the Phase 3 `deleteEvent` (which stamps a fresh `now()` tombstone) would make the local deletion look newer than the remote one and bounce it back, forever. So this phase adds a storage primitive `applyRemoteDelete(id, type)` that removes the row and any local tombstone for that id WITHOUT writing a new one.
- **No echo:** rows applied during pull are tracked in a `pulledIds` set and excluded from the push step, so we never immediately re-upload what we just downloaded.
- **Decrypt failures fail loudly.** A row whose payload does not decrypt to a valid event/category throws `SyncError("DECRYPT_INVALID")`. Sync never silently drops or hides a row.
- **Known limitation (carried from spec):** LWW by client timestamp is vulnerable to clock skew across devices; acceptable for a single user. Also, a category imported from an old backup without `updatedAt` will not be selected for push (its `updatedAt` is not `> cursor`); this is the Phase 3-deferred edge case and stays deferred.
- **Lazy loading:** this module statically imports `@/lib/crypto`, which pulls in libsodium. To keep that out of the initial bundle for local-only users, Phase 5 must import `@/lib/sync` DYNAMICALLY (`await import("@/lib/sync")`). Keep this module free of eager top-level side effects so it can be code-split.

## Conventions (repeat from the repo)

- Modules are directories with `index.ts` / `consts.ts` / `types.ts` / `tests.ts`. `index.ts` re-exports consts and types. Tests import from `./index` and reset storage with `resetDbForTests()`.
- Arrow functions, named constants, no `as` casts on unknown values (use the `isCalendarEvent`/`isCategory`/`isRemoteRow` guards), `@/` alias across modules.
- Run `pnpm check` before each commit.

---

## Task 1: Storage primitive for applying a remote delete

Add `applyRemoteDelete(id, type)` to the storage module: remove a row and any local tombstone for its id, in one transaction, without writing a new tombstone.

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/tests.ts`:
```typescript
describe("applyRemoteDelete", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("removes the row without leaving a tombstone", async () => {
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
    await applyRemoteDelete("e1", "event");
    expect(await getAllEvents()).toEqual([]);
    expect(await getTombstones()).toEqual([]);
  });

  it("clears an existing local tombstone for the same id", async () => {
    await putCategory({ id: "k1", name: "K", color: "cyan", updatedAt: "2026-06-09T00:00:00.000Z" });
    await deleteCategory("k1"); // writes a local tombstone
    expect(await getTombstones()).toHaveLength(1);
    await applyRemoteDelete("k1", "category");
    expect(await getTombstones()).toEqual([]);
  });
});
```
Ensure `applyRemoteDelete` is imported from `./index` in the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: FAIL, `applyRemoteDelete` is not exported.

- [ ] **Step 3: Implement it**

In `src/lib/storage/index.ts`, add (it can reuse `TombstoneType` already imported from `./types`):
```typescript
export const applyRemoteDelete = async (
  id: string,
  type: TombstoneType,
): Promise<void> => {
  try {
    const db = await getDb();
    const storeName = type === "event" ? STORE : CATEGORY_STORE;
    const tx = db.transaction([storeName, TOMBSTONE_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(storeName).delete(id),
      tx.objectStore(TOMBSTONE_STORE).delete(id),
    ]);
    await tx.done;
  } catch (error) {
    throw toWriteError(error);
  }
  notifyDataChanged();
};
```
Ensure `TombstoneType` is part of the `./types` import in `index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/storage/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/storage/index.ts src/lib/storage/tests.ts
git commit -m "feat(storage): add applyRemoteDelete for sync-applied deletions"
```

---

## Task 2: Sync types and consts

Define the wire row, the remote interface, the result shape, the typed error, and the table list.

**Files:**
- Create: `src/lib/sync/types.ts`
- Create: `src/lib/sync/consts.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/sync/types.ts`:
```typescript
import { isBoolean, isPlainObject, isString } from "remeda";

/** A row as it travels to and from Supabase: routing metadata plus ciphertext. */
export interface RemoteRow {
  id: string;
  updated_at: string;
  deleted: boolean;
  nonce: string;
  ciphertext: string;
}

export const isRemoteRow = (value: unknown): value is RemoteRow =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.updated_at) &&
  isBoolean(value.deleted) &&
  isString(value.nonce) &&
  isString(value.ciphertext);

/** The network seam. The real implementation wraps Supabase; tests fake it. */
export interface SyncRemote {
  pull(table: string, since: string): Promise<RemoteRow[]>;
  push(table: string, rows: RemoteRow[]): Promise<void>;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  cursor: string;
}

export type SyncErrorCode =
  | "DECRYPT_INVALID"
  | "REMOTE_FAILED"
  | "NOT_CONFIGURED";

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  constructor(code: SyncErrorCode, cause?: unknown) {
    super(code);
    this.name = "SyncError";
    this.code = code;
    this.cause = cause;
  }
}

export const isSyncError = (error: unknown): error is SyncError =>
  error instanceof SyncError;
```

- [ ] **Step 2: Write the consts**

Create `src/lib/sync/consts.ts`:
```typescript
import { CATEGORY_STORE, STORE } from "@/lib/storage";
import type { TombstoneType } from "@/lib/storage";

/** Default cursor before the first sync. */
export const EPOCH_CURSOR = "1970-01-01T00:00:00.000Z";

/**
 * The record types to sync. `table` is the Supabase table name (identical to
 * the local IndexedDB store name); `type` tags tombstones and local routing.
 */
export const SYNC_TABLES: readonly { table: string; type: TombstoneType }[] = [
  { table: STORE, type: "event" },
  { table: CATEGORY_STORE, type: "category" },
];
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: passes (these files are not imported yet; this confirms they compile).

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/types.ts src/lib/sync/consts.ts
git commit -m "feat(sync): add remote row, SyncRemote, and sync error types"
```

---

## Task 3: Row encryption and the last-write-wins rule

Add the pure pieces: encrypt a record into a row, decrypt a row, encrypt a tombstone, and the `isRemoteNewer` comparison.

**Files:**
- Create: `src/lib/sync/index.ts`
- Test: `src/lib/sync/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sync/tests.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { generateDek } from "@/lib/crypto";
import type { CalendarEvent } from "@/types";
import {
  encryptRecord,
  decryptRow,
  isRemoteNewer,
} from "./index";

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  title: "Rent",
  date: "2026-06-09",
  categoryId: "work",
  amount: 1_500,
  direction: "withdrawal",
  recurrence: null,
  overrides: [],
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  ...over,
});

describe("isRemoteNewer", () => {
  it("is true when there is no local record", () => {
    expect(isRemoteNewer("2026-06-09T00:00:00.000Z", undefined)).toBe(true);
  });
  it("is true only when the remote timestamp is strictly greater", () => {
    expect(isRemoteNewer("2026-06-09T00:00:02.000Z", "2026-06-09T00:00:01.000Z")).toBe(true);
    expect(isRemoteNewer("2026-06-09T00:00:01.000Z", "2026-06-09T00:00:01.000Z")).toBe(false);
    expect(isRemoteNewer("2026-06-09T00:00:00.000Z", "2026-06-09T00:00:01.000Z")).toBe(false);
  });
});

describe("encryptRecord / decryptRow", () => {
  it("round-trips an event and exposes routing metadata in the clear", async () => {
    const dek = await generateDek();
    const row = await encryptRecord(event(), dek);
    expect(row.id).toBe("e1");
    expect(row.updated_at).toBe("2026-06-09T00:00:00.000Z");
    expect(row.deleted).toBe(false);
    expect(typeof row.ciphertext).toBe("string");
    // The sensitive fields are not in the plaintext columns.
    expect(JSON.stringify(row)).not.toContain("Rent");
    expect(JSON.stringify(row)).not.toContain("1500");
    expect(await decryptRow(row, dek)).toEqual(event());
  });

  it("fails to decrypt a row with the wrong key", async () => {
    const row = await encryptRecord(event(), await generateDek());
    await expect(decryptRow(row, await generateDek())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: FAIL, `./index` does not export these yet.

- [ ] **Step 3: Implement the pieces**

Create `src/lib/sync/index.ts`:
```typescript
import { encryptPayload, decryptPayload } from "@/lib/crypto";
import { sealedBoxToRow, rowToSealedBox } from "@/lib/supabase";
import type { CalendarEvent, Category } from "@/types";
import type { RemoteRow } from "./types";

export * from "./consts";
export * from "./types";

/** A remote row counts as newer only when strictly greater (so equal = skip). */
export const isRemoteNewer = (
  remoteUpdatedAt: string,
  localUpdatedAt: string | undefined,
): boolean =>
  localUpdatedAt === undefined || remoteUpdatedAt > localUpdatedAt;

export const encryptRecord = async (
  record: CalendarEvent | Category,
  dek: Uint8Array,
): Promise<RemoteRow> => {
  const box = await encryptPayload(record, dek);
  return {
    id: record.id,
    updated_at: record.updatedAt,
    deleted: false,
    ...sealedBoxToRow(box),
  };
};

export const encryptTombstone = async (
  id: string,
  updatedAt: string,
  dek: Uint8Array,
): Promise<RemoteRow> => {
  const box = await encryptPayload({}, dek);
  return { id, updated_at: updatedAt, deleted: true, ...sealedBoxToRow(box) };
};

export const decryptRow = async (
  row: RemoteRow,
  dek: Uint8Array,
): Promise<unknown> => decryptPayload(rowToSealedBox(row), dek);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/sync/index.ts src/lib/sync/tests.ts
git commit -m "feat(sync): encrypt records to rows and add the LWW rule"
```

---

## Task 4: The sync orchestration (runSync)

Tie it together: pull newer remote rows and apply them, then push local changes that were not just pulled, then advance the cursor.

**Files:**
- Modify: `src/lib/sync/index.ts`
- Test: `src/lib/sync/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sync/tests.ts`. Update the EXISTING `import { ... } from "./index"` line to also include `runSync` and `encryptTombstone` (do not add a second import from `./index`). Add these new imports:
```typescript
import {
  getAllEvents,
  putEvent,
  deleteEvent,
  getSyncCursor,
} from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";
import type { RemoteRow, SyncRemote } from "./types";
```
Then add the fake remote and the describe block:
```typescript
const makeFakeRemote = () => {
  const tables: Record<string, Map<string, RemoteRow>> = {
    events: new Map(),
    categories: new Map(),
  };
  const remote: SyncRemote = {
    pull: async (table, since) =>
      [...tables[table].values()].filter((r) => r.updated_at > since),
    push: async (table, rows) => {
      for (const row of rows) tables[table].set(row.id, row);
    },
  };
  return { tables, remote };
};

describe("runSync", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("pushes local events to an empty remote", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event());
    const result = await runSync(dek, remote);
    expect(result.pushed).toBe(1);
    expect(tables.events.size).toBe(1);
    expect(await decryptRow([...tables.events.values()][0], dek)).toEqual(event());
  });

  it("pulls remote events into empty local storage", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    tables.events.set("e1", await encryptRecord(event(), dek));
    const result = await runSync(dek, remote);
    expect(result.pulled).toBe(1);
    expect(await getAllEvents()).toEqual([event()]);
  });

  it("lets the newer side win on a conflict (remote newer)", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }));
    tables.events.set(
      "e1",
      await encryptRecord(event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }), dek),
    );
    await runSync(dek, remote);
    const local = await getAllEvents();
    expect(local[0].title).toBe("New");
  });

  it("lets the newer side win on a conflict (local newer)", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    tables.events.set(
      "e1",
      await encryptRecord(event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }), dek),
    );
    await putEvent(event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }));
    await runSync(dek, remote);
    expect(await decryptRow([...tables.events.values()][0], dek)).toMatchObject({ title: "New" });
  });

  it("propagates a local deletion to the remote", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote); // upload
    await deleteEvent("e1"); // local tombstone
    await runSync(dek, remote);
    expect(tables.events.get("e1")?.deleted).toBe(true);
  });

  it("applies a remote deletion locally", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote); // upload so both sides agree
    // Another device deletes it: a tombstone row with a newer timestamp.
    tables.events.set(
      "e1",
      await encryptTombstone("e1", "2026-06-10T00:00:00.000Z", dek),
    );
    await runSync(dek, remote);
    expect(await getAllEvents()).toEqual([]);
  });

  it("is idempotent: a second sync with no changes does nothing", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote);
    const second = await runSync(dek, remote);
    expect(second.pulled).toBe(0);
    expect(second.pushed).toBe(0);
  });

  it("advances the cursor to the newest timestamp seen", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putEvent(event({ updatedAt: "2026-06-09T08:00:00.000Z" }));
    await runSync(dek, remote);
    expect(await getSyncCursor()).toBe("2026-06-09T08:00:00.000Z");
  });
});
```
The "applies a remote deletion" test builds the deleted row with `encryptTombstone` (a `deleted: true` row carrying a newer timestamp and real nonce/ciphertext), which is exactly the shape another device would push.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: FAIL, `runSync` is not exported.

- [ ] **Step 3: Implement runSync**

Add to `src/lib/sync/index.ts`. Extend the imports at the top:
```typescript
import {
  getAllEvents,
  getAllCategories,
  getTombstones,
  getSyncCursor,
  setSyncCursor,
  putEvent,
  putCategory,
  applyRemoteDelete,
} from "@/lib/storage";
import { isCalendarEvent, isCategory } from "@/types";
import { EPOCH_CURSOR, SYNC_TABLES } from "./consts";
import { SyncError } from "./types";
import type { RemoteRow, SyncRemote, SyncResult } from "./types";
```
(Keep the existing `encryptPayload`/`decryptPayload`, `sealedBoxToRow`/`rowToSealedBox`, and the `CalendarEvent`/`Category` type imports. Remove the now-duplicate `export *` lines only if duplicated.) Then add:
```typescript
export const runSync = async (
  dek: Uint8Array,
  remote: SyncRemote,
): Promise<SyncResult> => {
  const startCursor = (await getSyncCursor()) ?? EPOCH_CURSOR;
  let maxCursor = startCursor;
  let pulled = 0;
  let pushed = 0;

  for (const { table, type } of SYNC_TABLES) {
    const localRecords: (CalendarEvent | Category)[] =
      type === "event" ? await getAllEvents() : await getAllCategories();
    const localById = new Map(localRecords.map((record) => [record.id, record]));
    const tombstones = (await getTombstones()).filter((t) => t.type === type);
    const tombById = new Map(tombstones.map((t) => [t.id, t]));

    // Pull: apply remote rows that are newer than our local copy.
    const remoteRows = await remote.pull(table, startCursor);
    const pulledIds = new Set<string>();
    for (const row of remoteRows) {
      const localUpdatedAt =
        localById.get(row.id)?.updatedAt ?? tombById.get(row.id)?.updatedAt;
      if (!isRemoteNewer(row.updated_at, localUpdatedAt)) continue;
      if (row.deleted) {
        await applyRemoteDelete(row.id, type);
      } else {
        const record = await decryptRow(row, dek);
        if (type === "event") {
          if (!isCalendarEvent(record)) throw new SyncError("DECRYPT_INVALID");
          await putEvent(record);
        } else {
          if (!isCategory(record)) throw new SyncError("DECRYPT_INVALID");
          await putCategory(record);
        }
      }
      pulledIds.add(row.id);
      pulled += 1;
      if (row.updated_at > maxCursor) maxCursor = row.updated_at;
    }

    // Push: local rows and tombstones newer than the cursor we did not just pull.
    const pushRows: RemoteRow[] = [];
    for (const record of localRecords) {
      if (record.updatedAt > startCursor && !pulledIds.has(record.id)) {
        pushRows.push(await encryptRecord(record, dek));
        if (record.updatedAt > maxCursor) maxCursor = record.updatedAt;
      }
    }
    for (const tombstone of tombstones) {
      if (tombstone.updatedAt > startCursor && !pulledIds.has(tombstone.id)) {
        pushRows.push(
          await encryptTombstone(tombstone.id, tombstone.updatedAt, dek),
        );
        if (tombstone.updatedAt > maxCursor) maxCursor = tombstone.updatedAt;
      }
    }
    if (pushRows.length > 0) {
      await remote.push(table, pushRows);
      pushed += pushRows.length;
    }
  }

  if (maxCursor !== startCursor) await setSyncCursor(maxCursor);
  return { pulled, pushed, cursor: maxCursor };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: PASS, all runSync cases green.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/sync/index.ts src/lib/sync/tests.ts
git commit -m "feat(sync): run a full push/pull/merge cycle against a remote"
```

---

## Task 5: The real Supabase-backed remote

Wrap the Supabase client in a `SyncRemote`. It is thin and validates incoming rows with the guard. Behavioral verification against the live database happens in Phase 5 (it needs an authenticated aal2 session); here we test only the row guard and the null-when-unconfigured behavior.

**Files:**
- Modify: `src/lib/sync/index.ts`
- Test: `src/lib/sync/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sync/tests.ts`. Add `createSupabaseRemote` to the existing `./index` import line and `isRemoteRow` to the existing `./types` import line (do not add new duplicate import lines from those modules). Then add:
```typescript
describe("createSupabaseRemote", () => {
  it("returns null when Supabase is not configured (no env in tests)", () => {
    expect(createSupabaseRemote()).toBeNull();
  });
});

describe("isRemoteRow", () => {
  it("accepts a well-formed row and rejects malformed input", () => {
    expect(
      isRemoteRow({ id: "a", updated_at: "t", deleted: false, nonce: "n", ciphertext: "c" }),
    ).toBe(true);
    expect(isRemoteRow({ id: "a" })).toBe(false);
    expect(isRemoteRow(null)).toBe(false);
  });
});
```
Note: in the test environment the Vite env vars are unset, so the `supabase` client export is `null` and `createSupabaseRemote()` returns `null`. This test documents that contract.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: FAIL, `createSupabaseRemote` is not exported.

- [ ] **Step 3: Implement it**

In `src/lib/sync/index.ts`, add `supabase` to the `@/lib/supabase` import, `isRemoteRow` to the `./types` import, then add:
```typescript
export const createSupabaseRemote = (): SyncRemote | null => {
  if (!supabase) return null;
  const client = supabase;
  return {
    pull: async (table, since) => {
      const { data, error } = await client
        .from(table)
        .select("*")
        .gt("updated_at", since);
      if (error) throw new SyncError("REMOTE_FAILED", error);
      return (data ?? []).filter(isRemoteRow);
    },
    push: async (table, rows) => {
      const { error } = await client.from(table).upsert(rows);
      if (error) throw new SyncError("REMOTE_FAILED", error);
    },
  };
};
```
The `upsert` conflicts on the primary key `id`. We do not send `user_id`; the column default `auth.uid()` fills it on insert and it is preserved on update, satisfying the owner-scoped RLS check.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/sync/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/sync/index.ts src/lib/sync/tests.ts
git commit -m "feat(sync): add the Supabase-backed remote implementation"
```

---

## Task 6: Full verification

- [ ] **Step 1: Whole suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Final check**

Run: `pnpm check`
Expected: clean.

---

## Definition of done

- `src/lib/sync` exports `runSync`, `encryptRecord`, `encryptTombstone`, `decryptRow`, `isRemoteNewer`, `createSupabaseRemote`, and the `RemoteRow`/`SyncRemote`/`SyncResult`/`SyncError` types and guards.
- `runSync` does a full LWW push/pull cycle against a `SyncRemote`, applies remote deletes without bouncing, excludes just-pulled rows from push, and advances the cursor. All behaviors are covered by tests with an in-memory fake remote and `fake-indexeddb`.
- `applyRemoteDelete` exists in storage and is tested.
- Full suite and `pnpm check` are green. No network is hit in tests.

## What this phase deliberately does not do

- No auth, no DEK derivation, no UI. The caller supplies the DEK and decides when to sync (Phase 5).
- `createSupabaseRemote` is not exercised against the live database here; that needs an authenticated aal2 session and happens in Phase 5.
- No automatic scheduling (debounced push, pull on focus). Phase 5 wires `runSync` to triggers.
