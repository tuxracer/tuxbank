import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB } from "idb";
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
  getTombstones,
  getSyncCursor,
  setSyncCursor,
  getStoredDek,
  setStoredDek,
  clearStoredDek,
  applyRemoteDelete,
  clearLocalData,
  clearAllData,
  deleteDatabase,
  resetDbCache,
  DB_NAME,
  DB_VERSION,
  STORE,
  CATEGORY_STORE,
  TOMBSTONE_STORE,
  SYNC_META_STORE,
} from "./index";
import { resetDbForTests } from "./testing";
import { resetChannelForTests, SYNC_CHANNEL_NAME } from "@/lib/tabSync";

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
    await putCategory({
      id: "groceries",
      name: "Groceries",
      color: "green",
      updatedAt: new Date().toISOString(),
    });
    await putCategory({
      id: "rent",
      name: "Rent",
      color: "magenta",
      updatedAt: new Date().toISOString(),
    });
    const all = await getAllCategories();
    expect(all.map((c) => c.id).sort()).toEqual(["groceries", "rent"]);
  });

  it("deletes a category", async () => {
    await putCategory({
      id: "groceries",
      name: "Groceries",
      color: "green",
      updatedAt: new Date().toISOString(),
    });
    await deleteCategory("groceries");
    expect(await getAllCategories()).toEqual([]);
  });

  it("filters records that fail the Category guard out of reads", async () => {
    await putCategory({
      id: "x",
      name: "X",
      color: "teal",
    } as unknown as Category);
    await putCategory({
      id: "ok",
      name: "OK",
      color: "cyan",
      updatedAt: new Date().toISOString(),
    });
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
    await putCategory({
      id: "rent",
      name: "Rent",
      color: "magenta",
      updatedAt: new Date().toISOString(),
    });
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
    await putCategory({
      id: "c",
      name: "C",
      color: "cyan",
      updatedAt: new Date().toISOString(),
    });

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

  it("rolls back and keeps existing data when a write fails mid-import", async () => {
    await putEvent(make("existing"));
    const backup = JSON.stringify({
      app: "tuxbank",
      schemaVersion: 1,
      exportedAt: "2026-06-03T00:00:00.000Z",
      events: [make("a"), make("b")],
      categories: [],
    });

    // Fail the second put — after the clears have already been queued.
    const realPut = IDBObjectStore.prototype.put;
    let putCalls = 0;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      putCalls += 1;
      if (putCalls === 2) throw new Error("simulated write failure");
      return realPut.call(this, value, key);
    };
    try {
      await expect(commitImport(backup)).rejects.toMatchObject({
        code: "WRITE_FAILED",
      });
    } finally {
      IDBObjectStore.prototype.put = realPut;
    }

    expect((await getAllEvents()).map((e) => e.id)).toEqual(["existing"]);
  });
});

describe("cross-tab change notifications", () => {
  let otherTab: BroadcastChannel;
  let broadcasts: unknown[];

  beforeEach(async () => {
    await resetDbForTests();
    broadcasts = [];
    otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.onmessage = (event) => broadcasts.push(event.data);
  });

  afterEach(() => {
    otherTab.close();
    resetChannelForTests();
  });

  /** Wait until all broadcasts posted so far have been delivered, then return them. */
  const settledBroadcasts = async (): Promise<unknown[]> => {
    const marker = new BroadcastChannel(SYNC_CHANNEL_NAME);
    marker.postMessage("marker");
    await vi.waitFor(() => expect(broadcasts).toContain("marker"));
    marker.close();
    return broadcasts.filter((message) => message !== "marker");
  };

  it("broadcasts after each successful event write and delete", async () => {
    await putEvent(make("a"));
    await deleteEvent("a");
    expect(await settledBroadcasts()).toHaveLength(2);
  });

  it("broadcasts after each successful category write and delete", async () => {
    await putCategory({
      id: "rent",
      name: "Rent",
      color: "magenta",
      updatedAt: new Date().toISOString(),
    });
    await deleteCategory("rent");
    expect(await settledBroadcasts()).toHaveLength(2);
  });

  it("broadcasts exactly once for a whole import", async () => {
    await putEvent(make("a"));
    const text = await exportDatabase();
    await settledBroadcasts(); // flush the setup write's broadcast
    broadcasts.length = 0;

    await commitImport(text);
    expect(await settledBroadcasts()).toHaveLength(1);
  });

  it("does not broadcast when a write fails", async () => {
    // Missing keyPath ("id") makes IndexedDB reject the put.
    await expect(
      putEvent({} as unknown as CalendarEvent),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(await settledBroadcasts()).toHaveLength(0);
  });
});

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
    await putCategory({
      id: "k1",
      name: "K",
      color: "cyan",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    await deleteCategory("k1");
    const tombstones = await getTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ id: "k1", type: "category" });
  });
});

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

describe("stored data-encryption key (DEK)", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("returns undefined before any key is stored", async () => {
    expect(await getStoredDek()).toBeUndefined();
  });

  it("round-trips the raw key bytes", async () => {
    const dek = new Uint8Array([1, 2, 3, 250, 251, 252]);
    await setStoredDek(dek);
    expect(await getStoredDek()).toEqual(dek);
  });

  it("clears a stored key so the next read is empty", async () => {
    await setStoredDek(new Uint8Array([9, 9, 9]));
    await clearStoredDek();
    expect(await getStoredDek()).toBeUndefined();
  });

  it("is wiped by the sign-out local wipe (clearLocalData)", async () => {
    await setStoredDek(new Uint8Array([7, 7, 7]));
    await clearLocalData();
    expect(await getStoredDek()).toBeUndefined();
  });
});

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
    await putCategory({
      id: "k1",
      name: "K",
      color: "cyan",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    await deleteCategory("k1"); // writes a local tombstone
    expect(await getTombstones()).toHaveLength(1);
    await applyRemoteDelete("k1", "category");
    expect(await getTombstones()).toEqual([]);
  });
});

describe("obsolete / unopenable database", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  // Stand up a database one version ahead of what the app supports, the way a
  // browser left behind by a newer build would look.
  const openNewerDb = () =>
    openDB(DB_NAME, DB_VERSION + 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: "id" });
        db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
        db.createObjectStore(SYNC_META_STORE);
      },
    });

  it("reports OPEN_FAILED when the stored database is a newer, unopenable version", async () => {
    const newer = await openNewerDb();
    newer.close();
    resetDbCache();
    await expect(getAllEvents()).rejects.toMatchObject({ code: "OPEN_FAILED" });
  });

  it("deleteDatabase removes the bad database so a fresh one opens empty", async () => {
    const newer = await openNewerDb();
    await newer.put(STORE, make("ghost"));
    newer.close();
    resetDbCache();
    await expect(getAllEvents()).rejects.toMatchObject({ code: "OPEN_FAILED" });

    await deleteDatabase();

    expect(await getAllEvents()).toEqual([]);
  });
});

describe("clearAllData", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("wipes events and categories but records a tombstone for each, keeping the cursor", async () => {
    await putEvent(make("e1"));
    await putEvent(make("e2"));
    await putCategory({
      id: "k1",
      name: "K",
      color: "cyan",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    await setSyncCursor("2026-06-09T12:00:00.000Z");

    await clearAllData();

    expect(await getAllEvents()).toEqual([]);
    expect(await getAllCategories()).toEqual([]);

    // A tombstone per former row so the deletions propagate to the cloud.
    const tombstones = await getTombstones();
    expect(
      tombstones
        .filter((t) => t.type === "event")
        .map((t) => t.id)
        .sort(),
    ).toEqual(["e1", "e2"]);
    expect(
      tombstones.filter((t) => t.type === "category").map((t) => t.id),
    ).toEqual(["k1"]);
    expect(tombstones.every((t) => typeof t.updatedAt === "string")).toBe(true);

    // Unlike clearLocalData, the cursor stays so the tombstones (newer than it)
    // are what gets pushed on the next sync.
    expect(await getSyncCursor()).toBe("2026-06-09T12:00:00.000Z");
  });

  it("overwrites a stale tombstone for a re-created id with a fresh delete", async () => {
    // An id that was deleted, then re-created, must end up tombstoned again so
    // the cloud copy is removed rather than left behind.
    await putEvent(make("e1"));
    await deleteEvent("e1"); // old tombstone
    await putEvent(make("e1")); // re-created (clears the tombstone)

    await clearAllData();

    const tombstones = await getTombstones();
    expect(tombstones.map((t) => t.id)).toEqual(["e1"]);
    expect(await getAllEvents()).toEqual([]);
  });
});

describe("clearLocalData", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("wipes events, categories, tombstones, and the sync cursor", async () => {
    await putEvent(make("e1"));
    await putCategory({
      id: "k1",
      name: "K",
      color: "cyan",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    await deleteEvent("e1"); // leaves a tombstone
    await setSyncCursor("2026-06-09T12:00:00.000Z");

    await clearLocalData();

    expect(await getAllEvents()).toEqual([]);
    expect(await getAllCategories()).toEqual([]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
  });
});
