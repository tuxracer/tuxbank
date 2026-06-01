import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarEvent } from "@/types";
import {
  getAllEvents,
  putEvent,
  deleteEvent,
  getAllCategories,
  putCategory,
  deleteCategory,
  seedCategoriesFromEvents,
  exportDatabase,
  validateImport,
  commitImport,
} from "./index";
import { resetDbForTests } from "./connection/testing";

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

describe("export / import (repository)", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("round-trips the whole database through export + commitImport", async () => {
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
    await putEvent(make("a"));
    const bytes = await exportDatabase();

    await deleteEvent("a");
    await deleteCategory("rent");
    expect(await getAllEvents()).toEqual([]);

    await commitImport(bytes);
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
    expect((await getAllCategories()).map((c) => c.id)).toEqual(["rent"]);
  });

  it("validateImport reports the backup's record counts", async () => {
    await putEvent(make("a"));
    await putEvent(make("b"));
    const bytes = await exportDatabase();
    expect(await validateImport(bytes)).toEqual({
      events: 2,
      categories: 0,
      schemaVersion: 1,
    });
  });

  it("rejects an invalid file with IMPORT_INVALID and keeps existing data", async () => {
    await putEvent(make("a"));
    await expect(commitImport(new Uint8Array([1, 2, 3]))).rejects.toMatchObject(
      { code: "IMPORT_INVALID" },
    );
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["a"]);
  });
});
