import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { expandEvent, expandEvents, makeCategoryResolver } from "./index";
import {
  cancelOccurrence,
  patchOccurrence,
  truncateBefore,
  buildFollowingSeries,
  dayBeforeISO,
  shiftISO,
  daysBetweenISO,
} from "./index";

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);

const base: CalendarEvent = {
  id: "e1",
  title: "Standup",
  date: "2026-05-04",
  categoryId: "work",
  amount: 0,
  direction: "deposit",
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

describe("expandEvent — additional coverage", () => {
  it("expands a daily event across the window", () => {
    const daily = {
      ...base,
      date: "2026-05-01",
      recurrence: { freq: "daily" as const, interval: 1, endsOn: null },
    };
    expect(datesOf(daily, "2026-05-01", "2026-05-05")).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ]);
  });

  it("honors interval for daily events", () => {
    const every3 = {
      ...base,
      date: "2026-05-01",
      recurrence: { freq: "daily" as const, interval: 3, endsOn: null },
    };
    expect(datesOf(every3, "2026-05-01", "2026-05-10")).toEqual([
      "2026-05-01",
      "2026-05-04",
      "2026-05-07",
      "2026-05-10",
    ]);
  });

  it("honors interval for monthly events", () => {
    const everyOtherMonth = {
      ...base,
      date: "2026-01-15",
      recurrence: { freq: "monthly" as const, interval: 2, endsOn: null },
    };
    expect(datesOf(everyOtherMonth, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-15",
      "2026-03-15",
      "2026-05-15",
    ]);
  });

  it("re-resolves category when an override patches categoryId", () => {
    const ev = {
      ...base,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
      overrides: [
        { occurrenceDate: "2026-05-11", patch: { categoryId: "health" } },
      ],
    };
    const occ = expandEvent(ev, "2026-05-01", "2026-05-31", getCategory);
    expect(occ.find((o) => o.date === "2026-05-11")?.category.id).toBe(
      "health",
    );
    expect(occ.find((o) => o.date === "2026-05-04")?.category.id).toBe("work");
  });
});

describe("expandEvents", () => {
  it("flattens occurrences across multiple events", () => {
    const a = {
      ...base,
      id: "a",
      date: "2026-05-04",
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
    };
    const b = { ...base, id: "b", date: "2026-05-08", recurrence: null };
    const occ = expandEvents([a, b], "2026-05-01", "2026-05-14", getCategory);
    expect(occ.map((o) => o.date).sort()).toEqual([
      "2026-05-04",
      "2026-05-08",
      "2026-05-11",
    ]);
    expect(occ.filter((o) => o.eventId === "a")).toHaveLength(2);
  });

  it("returns an empty array for no events", () => {
    expect(expandEvents([], "2026-05-01", "2026-05-31", getCategory)).toEqual(
      [],
    );
  });
});

describe("recurrence mutations", () => {
  const series: CalendarEvent = {
    id: "s1",
    title: "Standup",
    date: "2026-05-04",
    categoryId: "work",
    amount: 0,
    direction: "deposit",
    recurrence: { freq: "weekly", interval: 1, endsOn: null },
    overrides: [],
    createdAt: "",
    updatedAt: "",
  };

  it("computes the day before an ISO date", () => {
    expect(dayBeforeISO("2026-05-18")).toBe("2026-05-17");
    expect(dayBeforeISO("2026-03-01")).toBe("2026-02-28");
  });

  it("cancels a single occurrence", () => {
    const next = cancelOccurrence(series, "2026-05-18");
    expect(next.overrides).toContainEqual({
      occurrenceDate: "2026-05-18",
      cancelled: true,
    });
  });

  it("patches a single occurrence and replaces any prior override on that date", () => {
    const once = patchOccurrence(series, "2026-05-18", { title: "A" });
    const twice = patchOccurrence(once, "2026-05-18", { title: "B" });
    expect(twice.overrides).toEqual([
      { occurrenceDate: "2026-05-18", patch: { title: "B" } },
    ]);
  });

  it("truncates a series to end the day before a split point", () => {
    const next = truncateBefore(series, "2026-05-18");
    expect(next.recurrence?.endsOn).toBe("2026-05-17");
  });

  it("builds a following series carrying forward only on/after overrides", () => {
    const withOverrides = {
      ...series,
      overrides: [
        { occurrenceDate: "2026-05-11", cancelled: true },
        { occurrenceDate: "2026-05-25", patch: { notes: "keep" } },
      ],
    };
    const created = buildFollowingSeries(
      withOverrides,
      "2026-05-18",
      {
        title: "Standup v2",
        date: "2026-05-18",
        categoryId: "work",
        amount: 0,
        direction: "deposit",
        notes: undefined,
        recurrence: { freq: "weekly", interval: 1, endsOn: null },
      },
      "new-id",
      "2026-05-30T00:00:00.000Z",
    );
    expect(created.id).toBe("new-id");
    expect(created.date).toBe("2026-05-18");
    expect(created.title).toBe("Standup v2");
    expect(created.overrides).toEqual([
      { occurrenceDate: "2026-05-25", patch: { notes: "keep" } },
    ]);
  });
});

describe("date-shift helpers", () => {
  it("shifts an ISO date forward and backward in local time", () => {
    expect(shiftISO("2026-05-04", 8)).toBe("2026-05-12");
    expect(shiftISO("2026-05-12", -8)).toBe("2026-05-04");
  });

  it("crosses month and non-leap-year boundaries correctly", () => {
    expect(shiftISO("2026-02-27", 2)).toBe("2026-03-01");
    expect(shiftISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between two ISO dates, signed", () => {
    expect(daysBetweenISO("2026-05-04", "2026-05-12")).toBe(8);
    expect(daysBetweenISO("2026-05-12", "2026-05-04")).toBe(-8);
    expect(daysBetweenISO("2026-05-04", "2026-05-04")).toBe(0);
  });
});
