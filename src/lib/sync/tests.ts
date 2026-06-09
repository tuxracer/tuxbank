import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateDek } from "@/lib/crypto";
import type { CalendarEvent } from "@/types";
import {
  encryptRecord,
  decryptRow,
  isRemoteNewer,
  runSync,
  encryptTombstone,
  createSupabaseRemote,
} from "./index";
import {
  getAllEvents,
  putEvent,
  putCategory,
  deleteEvent,
  getSyncCursor,
} from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";
import { isRemoteRow, type RemoteRow, type SyncRemote } from "./types";

// Stub out the Supabase client so createSupabaseRemote() returns null in tests,
// matching production behaviour when env vars are absent. The crypto helpers
// (sealedBoxToRow / rowToSealedBox) are preserved so encrypt/decrypt tests work.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, supabase: null };
});

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
    expect(
      isRemoteNewer("2026-06-09T00:00:02.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(true);
    expect(
      isRemoteNewer("2026-06-09T00:00:01.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(false);
    expect(
      isRemoteNewer("2026-06-09T00:00:00.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(false);
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
    expect(await decryptRow([...tables.events.values()][0], dek)).toEqual(
      event(),
    );
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
    await putEvent(
      event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }),
    );
    tables.events.set(
      "e1",
      await encryptRecord(
        event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }),
        dek,
      ),
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
      await encryptRecord(
        event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }),
        dek,
      ),
    );
    await putEvent(
      event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }),
    );
    await runSync(dek, remote);
    expect(await decryptRow([...tables.events.values()][0], dek)).toMatchObject(
      { title: "New" },
    );
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

  it("pushes a record stamped at the epoch cursor on the first sync", async () => {
    // A row stamped at the Unix epoch (byte-identical to EPOCH_CURSOR, e.g.
    // restored from an old backup that predates per-row timestamps) used to be
    // skipped forever by the strict `>` push gate, so it never reached the
    // cloud. The first sync (no stored cursor) must upload every local row
    // regardless of timestamp.
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event({ updatedAt: "1970-01-01T00:00:00.000Z" }));
    const result = await runSync(dek, remote);
    expect(result.pushed).toBe(1);
    expect(tables.events.size).toBe(1);
  });

  it("uploads an epoch-stamped category on the first sync (categories-never-synced regression)", async () => {
    // The reported bug verbatim: a category stamped at the epoch (== the sync
    // EPOCH_CURSOR) never pushed, so other devices showed every event as
    // Uncategorized.
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putCategory({
      id: "k1",
      name: "Work",
      color: "cyan",
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
    const result = await runSync(dek, remote);
    expect(tables.categories.size).toBe(1);
    expect(result.pushed).toBe(1);
  });

  it("advances the cursor to the newest timestamp seen", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putEvent(event({ updatedAt: "2026-06-09T08:00:00.000Z" }));
    await runSync(dek, remote);
    expect(await getSyncCursor()).toBe("2026-06-09T08:00:00.000Z");
  });
});

describe("createSupabaseRemote", () => {
  it("returns null when Supabase is not configured (no env in tests)", () => {
    expect(createSupabaseRemote()).toBeNull();
  });
});

describe("isRemoteRow", () => {
  it("accepts a well-formed row and rejects malformed input", () => {
    expect(
      isRemoteRow({
        id: "a",
        updated_at: "t",
        deleted: false,
        nonce: "n",
        ciphertext: "c",
      }),
    ).toBe(true);
    expect(isRemoteRow({ id: "a" })).toBe(false);
    expect(isRemoteRow(null)).toBe(false);
  });
});
