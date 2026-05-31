import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetDbForTests } from "@/lib/storage";
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
});
