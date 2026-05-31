import { describe, it, expect } from "vitest";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import { makeCategoryResolver } from "@/lib/recurrence";
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
});
