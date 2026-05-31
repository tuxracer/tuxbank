import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { expandEvent, makeCategoryResolver } from "./index";

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);

const base: CalendarEvent = {
  id: "e1",
  title: "Standup",
  date: "2026-05-04",
  categoryId: "work",
  recurrence: null,
  overrides: [],
  createdAt: "",
  updatedAt: "",
};

const datesOf = (event: CalendarEvent, start: string, end: string) =>
  expandEvent(event, start, end, getCategory).map((o) => o.date);

describe("expandEvent", () => {
  it("includes a one-off event only when in window", () => {
    expect(datesOf(base, "2026-05-01", "2026-05-31")).toEqual(["2026-05-04"]);
    expect(datesOf(base, "2026-06-01", "2026-06-30")).toEqual([]);
  });

  it("expands weekly occurrences within the window", () => {
    const weekly = {
      ...base,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
    };
    expect(datesOf(weekly, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-04",
      "2026-05-11",
      "2026-05-18",
      "2026-05-25",
    ]);
  });

  it("honors interval", () => {
    const biweekly = {
      ...base,
      recurrence: { freq: "weekly" as const, interval: 2, endsOn: null },
    };
    expect(datesOf(biweekly, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-04",
      "2026-05-18",
    ]);
  });

  it("skips months that lack the anchor day (monthly on the 31st)", () => {
    const monthly = {
      ...base,
      date: "2026-01-31",
      recurrence: { freq: "monthly" as const, interval: 1, endsOn: null },
    };
    expect(datesOf(monthly, "2026-02-01", "2026-02-28")).toEqual([]); // Feb skipped
    expect(datesOf(monthly, "2026-03-01", "2026-03-31")).toEqual([
      "2026-03-31",
    ]);
  });

  it("only fires yearly Feb-29 on leap years", () => {
    const yearly = {
      ...base,
      date: "2024-02-29",
      recurrence: { freq: "yearly" as const, interval: 1, endsOn: null },
    };
    expect(datesOf(yearly, "2025-02-01", "2025-02-28")).toEqual([]);
    expect(datesOf(yearly, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("respects an inclusive end date", () => {
    const ending = {
      ...base,
      recurrence: {
        freq: "weekly" as const,
        interval: 1,
        endsOn: "2026-05-11",
      },
    };
    expect(datesOf(ending, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-04",
      "2026-05-11",
    ]);
  });

  it("drops cancelled occurrences and applies patches", () => {
    const ev = {
      ...base,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
      overrides: [
        { occurrenceDate: "2026-05-11", cancelled: true },
        {
          occurrenceDate: "2026-05-18",
          patch: { title: "Standup (moved room)" },
        },
      ],
    };
    const occ = expandEvent(ev, "2026-05-01", "2026-05-31", getCategory);
    expect(occ.map((o) => o.date)).toEqual([
      "2026-05-04",
      "2026-05-18",
      "2026-05-25",
    ]);
    expect(occ.find((o) => o.date === "2026-05-18")?.title).toBe(
      "Standup (moved room)",
    );
  });
});
