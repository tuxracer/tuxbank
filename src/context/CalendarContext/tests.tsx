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

  it("manages categories: create (dedupe by key), update propagates, delete -> Uncategorized", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.createCategory("Groceries", "green");
      await result.current.createCategory("groceries", "magenta"); // same key -> no dup
    });
    expect(
      result.current.categories.filter((c) => c.id === "groceries"),
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
      await result.current.updateCategory("groceries", {
        name: "Food & Drink",
      });
    });
    await waitFor(() =>
      expect(
        result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name,
      ).toBe("Food & Drink"),
    );

    await act(async () => {
      await result.current.deleteCategory("groceries");
    });
    await waitFor(() =>
      expect(
        result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name,
      ).toBe("Uncategorized"),
    );
    expect(result.current.categoryUsageCount["groceries"]).toBe(1);
  });

  it("collapses multiple orphaned categories into a single Uncategorized entry", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      const a = await result.current.createCategory("Groceries", "green");
      const b = await result.current.createCategory("Rent", "magenta");
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
      await result.current.deleteCategory("groceries");
      await result.current.deleteCategory("rent");
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
});
