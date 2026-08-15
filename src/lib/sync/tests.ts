import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateDek } from "@/lib/crypto";
import type { CalendarEvent } from "@/types";
import {
  encryptRecord,
  decryptRow,
  runSync,
  encryptTombstone,
  createSupabaseRemote,
  countPendingChanges,
  detectSignInConflict,
  SYNC_TABLES,
} from "./index";
import {
  getAllEvents,
  putEvent,
  putCategory,
  deleteEvent,
  getSyncCursor,
  setSyncCursor,
  clearLocalData,
  commitImportLocal,
  commitImportSynced,
  putSetting,
  getAllSettings,
} from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";
import {
  isRemoteRow,
  type PushRow,
  type RemoteRow,
  type SyncRemote,
} from "./types";

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

describe("encryptRecord / decryptRow", () => {
  it("round-trips an event and exposes routing metadata in the clear", async () => {
    const dek = await generateDek();
    const row = await encryptRecord(event(), dek, "events");
    expect(row.id).toBe("e1");
    expect(row.updated_at).toBe("2026-06-09T00:00:00.000Z");
    expect(row.deleted).toBe(false);
    expect(typeof row.ciphertext).toBe("string");
    // The sensitive fields are not in the plaintext columns.
    expect(JSON.stringify(row)).not.toContain("Rent");
    expect(JSON.stringify(row)).not.toContain("1500");
    expect(await decryptRow(row, dek, "events")).toEqual(event());
  });

  it("fails to decrypt a row with the wrong key", async () => {
    const row = await encryptRecord(event(), await generateDek(), "events");
    await expect(
      decryptRow(row, await generateDek(), "events"),
    ).rejects.toThrow();
  });

  it("rejects a row whose plaintext metadata was tampered with", async () => {
    const dek = await generateDek();
    const row = await encryptRecord(event(), dek, "events");
    // A malicious server bumps the timestamp to replay the old content...
    await expect(
      decryptRow(
        { ...row, updated_at: "2027-01-01T00:00:00.000Z" },
        dek,
        "events",
      ),
    ).rejects.toThrow();
    // ...or flips deleted to fabricate a deletion...
    await expect(
      decryptRow({ ...row, deleted: true }, dek, "events"),
    ).rejects.toThrow();
    // ...or relabels the ciphertext under another id or table.
    await expect(
      decryptRow({ ...row, id: "victim" }, dek, "events"),
    ).rejects.toThrow();
    await expect(decryptRow(row, dek, "categories")).rejects.toThrow();
  });

  it("authenticates tombstone metadata the same way", async () => {
    const dek = await generateDek();
    const row = await encryptTombstone(
      "e1",
      "2026-06-09T00:00:00.000Z",
      dek,
      "events",
    );
    expect(await decryptRow(row, dek, "events")).toEqual({});
    await expect(
      decryptRow({ ...row, id: "victim" }, dek, "events"),
    ).rejects.toThrow();
  });
});

const nowStamp = (): string => new Date().toISOString();

const backupOf = (events: CalendarEvent[]): string =>
  JSON.stringify({
    app: "tuxbank",
    schemaVersion: 1,
    exportedAt: "2026-06-11T00:00:00.000Z",
    events,
    categories: [],
  });

/**
 * How Postgres renders a `timestamptz` back to the client: ISO 8601 with a
 * `+00:00` offset rather than the `Z` the client wrote, and no trailing zeros
 * in the fraction (`.000` disappears entirely). Sync authenticates and
 * compares these strings, so a fake backend that echoes the pushed spelling
 * verbatim silently passes code the real backend breaks.
 */
const asTimestamptz = (iso: string): string =>
  `${new Date(iso).toISOString().replace(/\.?0*Z$/, "")}+00:00`;

/**
 * In-memory Supabase stand-in. Mirrors the real backend's shape: every push
 * (and seeded row) gets a monotonically increasing server_updated_at, both
 * timestamp columns come back in Postgres's rendering, and pulls filter on
 * that server stamp, never on the client updated_at.
 */
const makeFakeRemote = () => {
  // Derived from the registry, so adding a synced collection cannot leave the
  // fake backend missing a table the engine will reach for.
  const tables: Record<string, Map<string, RemoteRow>> = Object.fromEntries(
    SYNC_TABLES.map(({ table }) => [table, new Map<string, RemoteRow>()]),
  );
  let tick = 0;
  const nextServerStamp = () =>
    new Date(
      Date.parse("2026-06-09T12:00:00.000Z") + ++tick * 60_000,
    ).toISOString();
  const seed = (table: string, row: PushRow): RemoteRow => {
    const stored: RemoteRow = {
      ...row,
      updated_at: asTimestamptz(row.updated_at),
      server_updated_at: asTimestamptz(nextServerStamp()),
    };
    tables[table].set(row.id, stored);
    return stored;
  };
  const remote: SyncRemote = {
    // Postgres compares instants, not strings: the cursor arrives in the
    // client's spelling and the stored stamp is in the server's.
    pull: async (table, since) =>
      [...tables[table].values()].filter(
        (r) => Date.parse(r.server_updated_at) > Date.parse(since),
      ),
    push: async (table, rows) => {
      for (const row of rows) seed(table, row);
    },
    count: async (table) =>
      [...tables[table].values()].filter((r) => !r.deleted).length,
    purge: async (table) => {
      tables[table].clear();
    },
  };
  return { tables, remote, seed };
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
    expect(
      await decryptRow([...tables.events.values()][0], dek, "events"),
    ).toEqual(event());
  });

  it("pulls remote events into empty local storage", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    seed("events", await encryptRecord(event(), dek, "events"));
    const result = await runSync(dek, remote);
    expect(result.pulled).toBe(1);
    expect(await getAllEvents()).toEqual([event()]);
  });

  // The metadata binding reconstructs its additional data from the pulled
  // row's plaintext columns, which the server returns in its own timestamp
  // spelling. A second device is where that bites: the first device holds
  // every row already and never reaches the decrypt.
  it("decrypts on a second device what the first device pushed", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote);

    await resetDbForTests(); // same account, fresh device
    const result = await runSync(dek, remote);
    expect(result.skipped).toBe(0);
    expect(await getAllEvents()).toEqual([event()]);
  });

  it("lets the newer side win on a conflict (remote newer)", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(
      event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }),
    );
    seed(
      "events",
      await encryptRecord(
        event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }),
        dek,
        "events",
      ),
    );
    await runSync(dek, remote);
    const local = await getAllEvents();
    expect(local[0].title).toBe("New");
  });

  it("lets the newer side win on a conflict (local newer)", async () => {
    const dek = await generateDek();
    const { tables, remote, seed } = makeFakeRemote();
    seed(
      "events",
      await encryptRecord(
        event({ title: "Old", updatedAt: "2026-06-09T00:00:01.000Z" }),
        dek,
        "events",
      ),
    );
    await putEvent(
      event({ title: "New", updatedAt: "2026-06-09T00:00:02.000Z" }),
    );
    await runSync(dek, remote);
    expect(
      await decryptRow([...tables.events.values()][0], dek, "events"),
    ).toMatchObject({ title: "New" });
  });

  it("round-trips a setting through push and pull", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putSetting("currency", "EUR");
    await runSync(dek, remote);
    // A second device starting empty pulls the account's settings.
    await resetDbForTests();
    await runSync(dek, remote);
    expect(await getAllSettings()).toMatchObject([
      { id: "currency", value: "EUR" },
    ]);
  });

  it("keeps both changes when two devices each change a different setting", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    // The other device already published a week-start change.
    seed(
      "settings",
      await encryptRecord(
        {
          id: "weekStartsOn",
          value: 1,
          updatedAt: "2026-06-09T00:00:02.000Z",
        },
        dek,
        "settings",
      ),
    );
    // This device changed the currency instead. One row per setting is what
    // keeps last-write-wins from making these two edits compete.
    await putSetting("currency", "JPY");
    await runSync(dek, remote);
    const merged = await getAllSettings();
    expect(
      Object.fromEntries(merged.map((row) => [row.id, row.value])),
    ).toEqual({ currency: "JPY", weekStartsOn: 1 });
  });

  it("syncs a setting cleared back to automatic as an explicit null", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    seed(
      "settings",
      await encryptRecord(
        {
          id: "currency",
          value: "EUR",
          updatedAt: "2026-06-09T00:00:01.000Z",
        },
        dek,
        "settings",
      ),
    );
    await putSetting("currency", null);
    await runSync(dek, remote);
    // Dropping the row instead would read as "never chosen" on the other
    // device, letting its stale EUR stand.
    expect(await getAllSettings()).toMatchObject([
      { id: "currency", value: null },
    ]);
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
    const { remote, seed } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote); // upload so both sides agree
    // Another device deletes it: a tombstone row with a newer timestamp.
    seed(
      "events",
      await encryptTombstone("e1", "2026-06-10T00:00:00.000Z", dek, "events"),
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

  it("advances the cursor to the newest server stamp pulled", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    const stored = seed("events", await encryptRecord(event(), dek, "events"));
    await runSync(dek, remote);
    expect(await getSyncCursor()).toBe(stored.server_updated_at);
  });

  it("pulls a row uploaded late with an old client stamp (offline-edit catch-up)", async () => {
    // The core watermark regression: device B edits offline at 10:00, device A
    // syncs at 10:05, B comes online at 10:20 and pushes its row stamped
    // 10:00. A client-timestamp cursor (10:05) would never pull it; the
    // server-stamp watermark must.
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(event({ id: "a1" }));
    await runSync(dek, remote); // A's watermark now set
    seed(
      "events",
      await encryptRecord(
        event({ id: "b1", updatedAt: "2020-01-01T00:00:00.000Z" }),
        dek,
        "events",
      ),
    );
    const result = await runSync(dek, remote);
    expect(result.pulled).toBe(1);
    expect((await getAllEvents()).map((e) => e.id).sort()).toEqual([
      "a1",
      "b1",
    ]);
  });

  it("keeps a local edit made while a sync pushed (outbox survives mid-sync writes)", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event({ title: "v1" }));
    // A local edit lands while the push is in flight: the outbox entry is
    // re-stamped mid-sync, so the conditional clear must keep it.
    const racingRemote: SyncRemote = {
      ...remote,
      push: async (table, rows) => {
        await remote.push(table, rows);
        await putEvent(event({ title: "v2", updatedAt: nowStamp() }));
      },
    };
    await runSync(dek, racingRemote);
    const second = await runSync(dek, remote);
    expect(second.pushed).toBe(1);
    expect(
      await decryptRow(tables.events.get("e1")!, dek, "events"),
    ).toMatchObject({ title: "v2" });
  });

  it("converges to the server copy when stamps tie but content differs", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    const stamp = "2026-06-09T00:00:00.000Z";
    await putEvent(event({ title: "mine", updatedAt: stamp }));
    seed(
      "events",
      await encryptRecord(
        event({ title: "theirs", updatedAt: stamp }),
        dek,
        "events",
      ),
    );
    await runSync(dek, remote);
    expect((await getAllEvents())[0].title).toBe("theirs");
  });

  it("skips a poison row without aborting the sync or wedging the cursor", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    const good = seed(
      "events",
      await encryptRecord(event({ id: "good" }), dek, "events"),
    );
    // Undecryptable garbage next to it (wrong key).
    seed(
      "events",
      await encryptRecord(event({ id: "bad" }), await generateDek(), "events"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await runSync(dek, remote);
      expect(result.skipped).toBe(1);
      expect(result.pulled).toBe(1);
      expect((await getAllEvents()).map((e) => e.id)).toEqual(["good"]);
      // The watermark still advances past both rows.
      const cursor = await getSyncCursor();
      expect(cursor && cursor >= good.server_updated_at).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses a forged deletion whose tombstone does not authenticate", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote); // upload
    // A malicious server fabricates a deletion for e1 by relabeling another
    // tombstone (its AEAD metadata binds a different id).
    const forged = await encryptTombstone(
      "other",
      "2026-06-10T00:00:00.000Z",
      dek,
      "events",
    );
    seed("events", { ...forged, id: "e1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await runSync(dek, remote);
      expect(result.skipped).toBe(1);
      expect((await getAllEvents()).map((e) => e.id)).toEqual(["e1"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("pushes the backup and removal tombstones after a synced import", async () => {
    const dek = await generateDek();
    const { tables, remote } = makeFakeRemote();
    await putEvent(event()); // e1
    await runSync(dek, remote); // e1 uploaded, cursor set

    await commitImportSynced(backupOf([event({ id: "e2" })]));
    const result = await runSync(dek, remote);

    expect(result.pushed).toBe(2); // the e2 row and the e1 tombstone
    expect(tables.events.get("e1")?.deleted).toBe(true);
    expect(tables.events.get("e2")?.deleted).toBe(false);
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["e2"]);
  });

  it("merges without deletes when signing in after a local import", async () => {
    const dek = await generateDek();
    const { tables, remote, seed } = makeFakeRemote();
    // The account already has e1 in the cloud.
    seed("events", await encryptRecord(event(), dek, "events"));
    // The signed-out device deleted e3 and then imported a backup of e2.
    await putEvent(event({ id: "e3" }));
    await deleteEvent("e3");
    // The device had synced before: a stale cursor that must not survive the
    // import, or e2 (old stamp) would never push and e1 would never pull.
    await setSyncCursor("2026-06-10T00:00:00.000Z");
    await commitImportLocal(backupOf([event({ id: "e2" })]));

    const result = await runSync(dek, remote);

    expect(result.pushed).toBe(1); // e2 only; the e3 tombstone is gone
    expect(tables.events.get("e1")?.deleted).toBe(false);
    expect(tables.events.has("e3")).toBe(false);
    expect((await getAllEvents()).map((e) => e.id).sort()).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("pushes nothing after a signed-out reset: a later sign-in is a plain pull", async () => {
    const dek = await generateDek();
    const { tables, remote, seed } = makeFakeRemote();
    // The account already has data in the cloud.
    seed("events", await encryptRecord(event(), dek, "events"));
    // This device had local data, including a tombstone, then reset signed out.
    await putEvent(event({ id: "e2" }));
    await deleteEvent("e2");
    await clearLocalData();

    const result = await runSync(dek, remote);

    expect(result.pushed).toBe(0);
    expect(tables.events.get("e1")?.deleted).toBe(false);
    expect(await getAllEvents()).toEqual([event()]);
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
        server_updated_at: "s",
        deleted: false,
        nonce: "n",
        ciphertext: "c",
      }),
    ).toBe(true);
    // A row without the server stamp is not pullable.
    expect(
      isRemoteRow({
        id: "a",
        updated_at: "t",
        deleted: false,
        nonce: "n",
        ciphertext: "c",
      }),
    ).toBe(false);
    expect(isRemoteRow({ id: "a" })).toBe(false);
    expect(isRemoteRow(null)).toBe(false);
  });
});

describe("countPendingChanges", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("returns 0 for an empty store", async () => {
    expect(await countPendingChanges()).toBe(0);
  });

  it("counts every row and tombstone before the first sync", async () => {
    await putEvent(event());
    await putEvent(event({ id: "e2" }));
    await deleteEvent("e2"); // leaves a tombstone stamped "now"
    await putCategory({
      id: "c1",
      name: "Work",
      color: "cyan",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });

    // 1 live event + 1 category + 1 tombstone
    expect(await countPendingChanges()).toBe(3);
  });

  it("counts exactly the unpushed changes once synced, and a pushed sync drains it", async () => {
    const dek = await generateDek();
    const { remote } = makeFakeRemote();
    await putEvent(event());
    await runSync(dek, remote);
    expect(await countPendingChanges()).toBe(0);

    // A local edit counts even when its stamp is older than anything synced —
    // pending means "written and not yet pushed", not a timestamp comparison.
    await putEvent(event({ updatedAt: "2020-01-01T00:00:00.000Z" }));
    expect(await countPendingChanges()).toBe(1);
    await runSync(dek, remote);
    expect(await countPendingChanges()).toBe(0);
  });
});

describe("detectSignInConflict", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("reports both counts when this device and the account both have events", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(event({ id: "local-1" }));
    await putEvent(event({ id: "local-2" }));
    seed(
      "events",
      await encryptRecord(event({ id: "remote-1" }), dek, "events"),
    );

    expect(await detectSignInConflict(remote)).toEqual({ local: 2, remote: 1 });
  });

  it("returns null when this device has no events", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    seed(
      "events",
      await encryptRecord(event({ id: "remote-1" }), dek, "events"),
    );

    expect(await detectSignInConflict(remote)).toBeNull();
  });

  it("returns null when the account has no events", async () => {
    const { remote } = makeFakeRemote();
    await putEvent(event({ id: "local-1" }));

    expect(await detectSignInConflict(remote)).toBeNull();
  });

  it("treats an account holding only tombstones as empty", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(event({ id: "local-1" }));
    seed(
      "events",
      await encryptTombstone(
        "remote-1",
        "2026-06-10T00:00:00.000Z",
        dek,
        "events",
      ),
    );

    expect(await detectSignInConflict(remote)).toBeNull();
  });

  it("returns null once this device has synced, however much data both sides have", async () => {
    const dek = await generateDek();
    const { remote, seed } = makeFakeRemote();
    await putEvent(event({ id: "local-1" }));
    seed(
      "events",
      await encryptRecord(event({ id: "remote-1" }), dek, "events"),
    );
    await setSyncCursor("2026-06-01T00:00:00.000Z");

    expect(await detectSignInConflict(remote)).toBeNull();
  });

  it("does not query the account once a cursor exists", async () => {
    const { remote } = makeFakeRemote();
    const count = vi.fn(remote.count);
    await putEvent(event({ id: "local-1" }));
    await setSyncCursor("2026-06-01T00:00:00.000Z");

    await detectSignInConflict({ ...remote, count });

    expect(count).not.toHaveBeenCalled();
  });
});
