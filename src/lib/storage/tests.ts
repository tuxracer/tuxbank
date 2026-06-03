import { describe, it, expect, beforeEach } from "vitest";
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
} from "./index";
import { resetDbForTests } from "./testing";

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

  it("filters records that fail the Category guard out of reads", async () => {
    await putCategory({
      id: "x",
      name: "X",
      color: "teal",
    } as unknown as Category);
    await putCategory({ id: "ok", name: "OK", color: "cyan" });
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
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
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
    await putCategory({ id: "c", name: "C", color: "cyan" });

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
});
