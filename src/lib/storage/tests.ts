import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarEvent } from "@/types";
import { getAllEvents, putEvent, deleteEvent, resetDbForTests } from "./index";
import {
  getAllCategories,
  putCategory,
  deleteCategory,
  seedCategoriesFromEvents,
} from "./index";

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

  it("seeds the categories store from existing events on the v2 upgrade", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("cyber-calendar", 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("events", { keyPath: "id" });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("events", "readwrite");
        tx.objectStore("events").put({
          id: "e1",
          title: "Old",
          date: "2026-05-01",
          categoryId: "finance",
          amount: 0,
          direction: "deposit",
          recurrence: null,
          overrides: [],
          createdAt: "",
          updatedAt: "",
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const cats = await getAllCategories();
    expect(cats).toContainEqual({
      id: "finance",
      name: "Finance",
      color: "yellow",
    });
  });
});
