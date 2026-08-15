import { describe, it, expect } from "vitest";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import { expandEvent, makeCategoryResolver } from "@/lib/recurrence";
import { computeRunningBalances, signedAmount } from "./index";

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);
const may = buildMonthGrid(new Date(2026, 4, 1)); // 2026-04-26 .. 2026-06-06

const evt = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e",
  title: "t",
  date: "2026-05-10",
  categoryId: "work",
  amount: 100,
  direction: "deposit",
  recurrence: null,
  overrides: [],
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("signedAmount", () => {
  it("negates withdrawals", () => {
    expect(signedAmount("deposit", 100)).toBe(100);
    expect(signedAmount("withdrawal", 100)).toBe(-100);
  });
});

describe("computeRunningBalances", () => {
  it("is 0 before a transaction and reflects it on/after its day", () => {
    const b = computeRunningBalances(
      [evt({ amount: 100, direction: "deposit" })],
      may,
      getCategory,
    );
    expect(b["2026-05-09"]).toBe(0);
    expect(b["2026-05-10"]).toBe(100);
    expect(b["2026-05-11"]).toBe(100);
  });

  it("excludes hidden categories from both the carry-in and the window", () => {
    const events = [
      // Hidden withdrawal before the window (carry-in) and inside it.
      evt({
        id: "a",
        date: "2026-04-01",
        categoryId: "finance",
        amount: 500,
        direction: "withdrawal",
      }),
      evt({
        id: "b",
        date: "2026-05-05",
        categoryId: "finance",
        amount: 40,
        direction: "withdrawal",
      }),
      evt({ id: "c", date: "2026-05-10", amount: 100, direction: "deposit" }),
    ];
    const b = computeRunningBalances(
      events,
      may,
      getCategory,
      new Set(["finance"]),
    );
    expect(b["2026-05-05"]).toBe(0);
    expect(b["2026-05-10"]).toBe(100);
  });

  it("nets deposits and withdrawals cumulatively, can go negative", () => {
    const events = [
      evt({
        id: "a",
        date: "2026-05-05",
        amount: 200,
        direction: "withdrawal",
      }),
      evt({ id: "b", date: "2026-05-08", amount: 50, direction: "deposit" }),
    ];
    const b = computeRunningBalances(events, may, getCategory);
    expect(b["2026-05-05"]).toBe(-200);
    expect(b["2026-05-08"]).toBe(-150);
  });

  it("carries the balance in from a previous month (before the window)", () => {
    const aprilGrid = buildMonthGrid(new Date(2026, 3, 1)); // window starts 2026-03-29
    const b = computeRunningBalances(
      [evt({ date: "2026-03-01", amount: 300, direction: "deposit" })],
      aprilGrid,
      getCategory,
    );
    expect(b[aprilGrid[0].iso]).toBe(300);
  });

  it("accumulates a recurring weekly deposit each occurrence", () => {
    const weekly = evt({
      date: "2026-05-04",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b["2026-05-04"]).toBe(100);
    expect(b["2026-05-11"]).toBe(200);
    expect(b["2026-05-18"]).toBe(300);
  });

  it("sums an infinite daily series with an old anchor (carry-in past the old 1000 cap)", () => {
    const daily = evt({
      date: "2022-01-01",
      amount: 1,
      direction: "deposit",
      recurrence: { freq: "daily", interval: 1, endsOn: null },
    });
    const b = computeRunningBalances([daily], may, getCategory);
    const firstDay = may[0].iso;
    const expected =
      differenceInCalendarDays(parseISO(firstDay), parseISO("2022-01-01")) + 1;
    expect(b[firstDay]).toBe(expected);
  });

  it("excludes a cancelled occurrence", () => {
    const weekly = evt({
      date: "2026-05-04",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
      overrides: [{ occurrenceDate: "2026-05-11", cancelled: true }],
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b["2026-05-11"]).toBe(100);
    expect(b["2026-05-18"]).toBe(200);
  });

  it("sums multiple deposits and withdrawals in the carry-in", () => {
    const events = [
      evt({ id: "a", date: "2026-04-01", amount: 500, direction: "deposit" }),
      evt({
        id: "b",
        date: "2026-04-10",
        amount: 200,
        direction: "withdrawal",
      }),
      evt({ id: "c", date: "2026-04-20", amount: 50, direction: "deposit" }),
    ];
    const b = computeRunningBalances(events, may, getCategory);
    expect(b[may[0].iso]).toBe(350);
  });

  it("carries in a negative balance from a pre-window withdrawal", () => {
    const b = computeRunningBalances(
      [evt({ date: "2026-04-01", amount: 300, direction: "withdrawal" })],
      may,
      getCategory,
    );
    expect(b[may[0].iso]).toBe(-300);
  });

  it("counts an occurrence exactly on the window's first day only once", () => {
    const b = computeRunningBalances(
      [evt({ date: may[0].iso, amount: 100, direction: "deposit" })],
      may,
      getCategory,
    );
    expect(b[may[0].iso]).toBe(100);
    expect(b[may[1].iso]).toBe(100);
  });

  it("includes a recurring series that ended before the window in the carry-in", () => {
    const ended = evt({
      date: "2026-01-05",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: "2026-02-02" },
    });
    const b = computeRunningBalances([ended], may, getCategory);
    expect(b[may[0].iso]).toBe(500); // Jan 5, 12, 19, 26 + Feb 2
    expect(b["2026-05-31"]).toBe(500); // flat — no occurrences in the window
  });

  it("excludes a cancelled occurrence that falls before the window", () => {
    const weekly = evt({
      date: "2026-04-01",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
      overrides: [{ occurrenceDate: "2026-04-08", cancelled: true }],
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b[may[0].iso]).toBe(300); // Apr 1, 15, 22 (Apr 8 cancelled); Apr 29 is in-window
    expect(b["2026-04-29"]).toBe(400);
  });

  it("carries in a daily series with interval > 1", () => {
    const daily = evt({
      date: "2026-04-01",
      amount: 10,
      direction: "deposit",
      recurrence: { freq: "daily", interval: 3, endsOn: null },
    });
    const b = computeRunningBalances([daily], may, getCategory);
    // Apr 1, 4, 7, 10, 13, 16, 19, 22, 25 fall before the window (starts Apr 26).
    expect(b["2026-04-26"]).toBe(90);
    expect(b["2026-04-28"]).toBe(100);
  });

  it("applies patched amounts and directions before the window to the carry-in", () => {
    const weekly = evt({
      date: "2026-04-01",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
      overrides: [
        { occurrenceDate: "2026-04-08", patch: { amount: 250 } },
        { occurrenceDate: "2026-04-15", patch: { direction: "withdrawal" } },
      ],
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    // Apr 1: 100, Apr 8: 250, Apr 15: -100, Apr 22: 100.
    expect(b[may[0].iso]).toBe(350);
  });

  it("filters a patched category independently of the series' base category", () => {
    const weekly = evt({
      date: "2026-04-01",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: "2026-04-22" },
      overrides: [
        { occurrenceDate: "2026-04-08", patch: { categoryId: "finance" } },
      ],
    });
    const hidingPatch = computeRunningBalances(
      [weekly],
      may,
      getCategory,
      new Set(["finance"]),
    );
    expect(hidingPatch[may[0].iso]).toBe(300); // Apr 1, 15, 22; Apr 8 hidden
    const hidingBase = computeRunningBalances(
      [weekly],
      may,
      getCategory,
      new Set(["work"]),
    );
    expect(hidingBase[may[0].iso]).toBe(100); // only the patched Apr 8 shows
  });

  it("ignores off-pattern overrides in the carry-in", () => {
    const weekly = evt({
      date: "2026-04-01",
      amount: 100,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: "2026-04-22" },
      overrides: [
        // Neither date is a Wednesday on the weekly pattern.
        { occurrenceDate: "2026-04-09", patch: { amount: 999 } },
        { occurrenceDate: "2026-03-25", cancelled: true },
      ],
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b[may[0].iso]).toBe(400); // Apr 1, 8, 15, 22 — untouched
  });

  it("matches a brute-force expansion of every event's full history", () => {
    const events = [
      evt({
        id: "old-daily",
        date: "2023-02-11",
        amount: 7,
        direction: "deposit",
        recurrence: { freq: "daily", interval: 1, endsOn: null },
        overrides: [
          { occurrenceDate: "2026-03-01", cancelled: true },
          { occurrenceDate: "2026-04-02", patch: { amount: 100 } },
          { occurrenceDate: "2026-05-05", patch: { direction: "withdrawal" } },
        ],
      }),
      evt({
        id: "sparse-daily",
        date: "2025-12-31",
        amount: 13,
        direction: "withdrawal",
        recurrence: { freq: "daily", interval: 3, endsOn: "2026-05-15" },
        overrides: [
          { occurrenceDate: "2026-01-06", patch: { categoryId: "finance" } },
        ],
      }),
      evt({
        id: "biweekly",
        date: "2026-01-06",
        amount: 55,
        direction: "deposit",
        recurrence: { freq: "weekly", interval: 2, endsOn: null },
      }),
      evt({
        id: "month-end",
        date: "2025-01-31",
        amount: 20,
        direction: "deposit",
        recurrence: { freq: "monthly", interval: 1, endsOn: null },
      }),
      evt({
        id: "hidden-one-off",
        date: "2026-04-30",
        categoryId: "finance",
        amount: 500,
        direction: "deposit",
      }),
    ];
    const hidden = new Set(["finance"]);
    const b = computeRunningBalances(events, may, getCategory, hidden);

    // Oracle: expandEvent walks every occurrence individually (it never takes
    // the bulk path), so summing its output per day must agree exactly.
    const windowEnd = may[may.length - 1].iso;
    const occurrences = events.flatMap((e) =>
      expandEvent(e, e.date, windowEnd, getCategory).filter(
        (o) => !hidden.has(o.category.id),
      ),
    );
    for (const cell of may) {
      const expected = occurrences
        .filter((o) => o.date <= cell.iso)
        .reduce((sum, o) => sum + signedAmount(o.direction, o.amount), 0);
      expect(b[cell.iso]).toBe(expected);
    }
  });
});
