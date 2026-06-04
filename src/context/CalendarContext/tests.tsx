import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { CalendarEvent } from "@/types";
import { resetDbForTests } from "@/lib/storage/testing";
import {
  deleteEvent as dbDeleteEvent,
  exportDatabase,
  getAllEvents,
  putEvent,
} from "@/lib/storage";
import { resetChannelForTests, SYNC_CHANNEL_NAME } from "@/lib/tabSync";
import { CalendarProvider, useCalendar } from "./index";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CalendarProvider>{children}</CalendarProvider>
);

describe("CalendarContext", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("creates a one-off event and exposes it as an occurrence", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.createEvent({
        title: "Dentist",
        date: "2026-05-08",
        categoryId: "health",
        amount: 100,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
      result.current.goToDate(new Date(2026, 4, 1));
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.title).toBe(
        "Dentist",
      );
    });
  });

  it("hides occurrences whose category is toggled off", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let id = "";
    await act(async () => {
      const c = await result.current.createCategory("Work", "cyan");
      id = c.id;
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup",
        date: "2026-05-08",
        categoryId: id,
        notes: undefined,
        amount: 0,
        direction: "deposit",
        recurrence: null,
      });
    });
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]).toBeDefined(),
    );
    await act(async () => result.current.toggleCategory(id));
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]).toBeUndefined(),
    );
    await act(async () => result.current.toggleCategory(id));
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]).toBeDefined(),
    );
  });

  it("exposes a running balance per day from event deposits/withdrawals", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Paycheck",
        date: "2026-05-08",
        categoryId: "work",
        notes: undefined,
        amount: 1000,
        direction: "deposit",
        recurrence: null,
      });
    });
    await waitFor(() =>
      expect(result.current.balancesByDate["2026-05-08"]).toBe(1000),
    );
    expect(result.current.balancesByDate["2026-05-07"]).toBe(0);
  });

  it("manages categories: create (dedupe by name), update propagates, delete -> Uncategorized", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.createCategory("Groceries", "green");
      await result.current.createCategory("groceries", "magenta"); // same name (case-insensitive) -> no dup
    });
    // Only one category with the name "groceries" (case-insensitive)
    expect(
      result.current.categories.filter(
        (c) => c.name.trim().toLowerCase() === "groceries",
      ),
    ).toHaveLength(1);

    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Food",
        date: "2026-05-08",
        categoryId: created!.id,
        notes: undefined,
        amount: 20,
        direction: "withdrawal",
        recurrence: null,
      });
    });
    await waitFor(() =>
      expect(
        result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name,
      ).toBe("Groceries"),
    );

    await act(async () => {
      await result.current.updateCategory(created!.id, {
        name: "Food & Drink",
      });
    });
    await waitFor(() =>
      expect(
        result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name,
      ).toBe("Food & Drink"),
    );

    await act(async () => {
      await result.current.deleteCategory(created!.id);
    });
    await waitFor(() =>
      expect(
        result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name,
      ).toBe("Uncategorized"),
    );
    expect(result.current.categoryUsageCount[created!.id]).toBe(1);
  });

  it("collapses multiple orphaned categories into a single Uncategorized entry", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let aId = "";
    let bId = "";
    await act(async () => {
      const a = await result.current.createCategory("Groceries", "green");
      const b = await result.current.createCategory("Rent", "magenta");
      aId = a.id;
      bId = b.id;
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Food",
        date: "2026-05-08",
        categoryId: a.id,
        notes: undefined,
        amount: 10,
        direction: "withdrawal",
        recurrence: null,
      });
      await result.current.createEvent({
        title: "Apt",
        date: "2026-05-09",
        categoryId: b.id,
        notes: undefined,
        amount: 20,
        direction: "withdrawal",
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.usedCategories.length).toBe(2));
    await act(async () => {
      await result.current.deleteCategory(aId);
      await result.current.deleteCategory(bId);
    });
    // both events now orphaned → exactly ONE Uncategorized entry, and ids are unique
    await waitFor(() => {
      const unknownCount = result.current.usedCategories.filter(
        (c) => c.id === "unknown",
      ).length;
      expect(unknownCount).toBe(1);
    });
    const ids = result.current.usedCategories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });

  it("deletes one occurrence of a recurring series", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup",
        date: "2026-05-04",
        categoryId: "work",
        amount: 100,
        direction: "deposit",
        notes: undefined,
        recurrence: { freq: "weekly", interval: 1, endsOn: null },
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    id = result.current.events[0].id;

    await act(async () => {
      await result.current.deleteEvent(id, "this", "2026-05-11");
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-11"]).toBeUndefined();
      expect(result.current.occurrencesByDate["2026-05-04"]).toBeDefined();
    });
  });

  it("createCategory assigns a GUID id (not the normalized name)", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let c: { id: string } | undefined;
    await act(async () => {
      c = await result.current.createCategory("Work", "cyan");
    });

    expect(c!.id).not.toBe("work");
    expect(c!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("createCategory deduplicates by name (case-insensitive) and returns the same category", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let a: { id: string } | undefined;
    let b: { id: string } | undefined;
    await act(async () => {
      a = await result.current.createCategory("Work", "cyan");
      b = await result.current.createCategory("work", "magenta");
    });

    expect(b!.id).toBe(a!.id);
    expect(
      result.current.categories.filter(
        (c) => c.name.trim().toLowerCase() === "work",
      ),
    ).toHaveLength(1);
  });

  it("updateCategory rejects a rename that collides with another category's name", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let personalId = "";
    await act(async () => {
      await result.current.createCategory("Work", "cyan");
      const personal = await result.current.createCategory(
        "Personal",
        "magenta",
      );
      personalId = personal.id;
    });

    // Attempt to rename "Personal" to "work" (collides with "Work")
    await act(async () => {
      await result.current.updateCategory(personalId, { name: "work" });
    });

    // Personal category should still be named "Personal"
    const personal = result.current.categories.find((c) => c.id === personalId);
    expect(personal?.name).toBe("Personal");

    // Only one category with the name "work" (case-insensitive)
    expect(
      result.current.categories.filter(
        (c) => c.name.trim().toLowerCase() === "work",
      ),
    ).toHaveLength(1);
  });

  it("exports and re-imports the database, restoring events", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Paycheck",
        date: "2026-05-08",
        categoryId: "work",
        amount: 1000,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const json = await exportDatabase();
    const file = new File([json], "backup.json");

    await act(async () => {
      await result.current.deleteEvent(
        result.current.events[0].id,
        "all",
        "2026-05-08",
      );
    });
    await waitFor(() => expect(result.current.events).toHaveLength(0));

    await act(async () => {
      await result.current.importData(file);
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].title).toBe("Paycheck");
  });

  it("previewImport reports the backup's record counts", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.createEvent({
        title: "A",
        date: "2026-05-08",
        categoryId: "work",
        amount: 1,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const json = await exportDatabase();
    const preview = await result.current.previewImport(
      new File([json], "backup.json"),
    );
    expect(preview.events).toBe(1);
    expect(preview.schemaVersion).toBe(1);
  });

  it("year range defaults to current year .. current year + 10 with no events", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const currentYear = new Date().getFullYear();
    expect(result.current.yearRange).toEqual({
      min: currentYear,
      max: currentYear + 10,
    });
  });

  it("year range starts at the earliest event year", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const currentYear = new Date().getFullYear();
    await act(async () => {
      await result.current.createEvent({
        title: "Old",
        date: `${currentYear - 3}-02-01`,
        categoryId: "work",
        amount: 100,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events.length).toBe(1));
    expect(result.current.yearRange).toEqual({
      min: currentYear - 3,
      max: currentYear + 10,
    });
  });

  it("year range widens to include a visible year beyond the +10 cap", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const currentYear = new Date().getFullYear();
    const farYear = currentYear + 25;
    await act(async () => {
      result.current.goToDate(new Date(farYear, 0, 1));
    });
    await waitFor(() =>
      expect(result.current.visibleMonth.getFullYear()).toBe(farYear),
    );
    expect(result.current.yearRange.max).toBe(farYear);
  });

  it("year range widens to include a visible year before the earliest event", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const currentYear = new Date().getFullYear();
    const pastYear = currentYear - 5;
    await act(async () => {
      result.current.goToDate(new Date(pastYear, 0, 1));
    });
    await waitFor(() =>
      expect(result.current.visibleMonth.getFullYear()).toBe(pastYear),
    );
    expect(result.current.yearRange.min).toBe(pastYear);
  });
});

describe("cross-tab sync", () => {
  // 2026-05-08 falls inside the May 2026 grid used by goToDate below.
  const otherTabEvent = (id: string, title: string): CalendarEvent => ({
    id,
    title,
    date: "2026-05-08",
    categoryId: "work",
    amount: 50,
    direction: "deposit",
    recurrence: null,
    overrides: [],
    createdAt: "t",
    updatedAt: "t",
  });

  beforeEach(async () => {
    await resetDbForTests();
  });

  afterEach(() => {
    resetChannelForTests();
  });

  it("applies events written by another tab when a notification arrives", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await putEvent(otherTabEvent("remote", "Paycheck"));
    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.postMessage("data-changed");

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].title).toBe("Paycheck");
    otherTab.close();
  });

  it("keeps per-tab category filters across a sync refresh", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let categoryId = "";
    await act(async () => {
      const c = await result.current.createCategory("Work", "cyan");
      categoryId = c.id;
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup",
        date: "2026-05-08",
        categoryId,
        notes: undefined,
        amount: 0,
        direction: "deposit",
        recurrence: null,
      });
    });
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]).toBeDefined(),
    );

    // Hide the category in this tab, then sync a change from another tab.
    await act(async () => result.current.toggleCategory(categoryId));
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]).toBeUndefined(),
    );

    await putEvent({ ...otherTabEvent("remote", "Lunch"), date: "2026-05-09" });
    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.postMessage("data-changed");

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.occurrencesByDate["2026-05-09"]?.[0]?.title).toBe(
      "Lunch",
    );
    // The category hidden in this tab stays hidden after the refresh.
    expect(result.current.occurrencesByDate["2026-05-08"]).toBeUndefined();
    otherTab.close();
  });

  it("recreates an event on save when another tab deleted it (last save wins)", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Dentist",
        date: "2026-05-08",
        categoryId: "health",
        amount: 100,
        direction: "deposit",
        notes: undefined,
        recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    const originalId = result.current.events[0].id;

    // Another tab deletes the event while our edit dialog is open.
    await dbDeleteEvent(originalId);
    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.postMessage("data-changed");
    await waitFor(() => expect(result.current.events).toHaveLength(0));

    // Saving the open edit still wins: the event is recreated under a new id.
    await act(async () => {
      await result.current.updateEvent(
        originalId,
        {
          title: "Dentist (rescheduled)",
          date: "2026-05-09",
          categoryId: "health",
          amount: 100,
          direction: "deposit",
          notes: undefined,
          recurrence: null,
        },
        "all",
        "2026-05-08",
      );
    });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].title).toBe("Dentist (rescheduled)");
    expect(result.current.events[0].id).not.toBe(originalId);
    expect((await getAllEvents()).map((e) => e.title)).toEqual([
      "Dentist (rescheduled)",
    ]);
    otherTab.close();
  });
});
