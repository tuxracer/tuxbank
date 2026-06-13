import { describe, it, expect } from "vitest";
import { buildMonthGrid, inMonthWeekCount, toISODate } from "./index";

describe("buildMonthGrid", () => {
  const cells = buildMonthGrid(new Date(2026, 4, 1)); // May 2026 (month is 0-based)

  it("returns the full 6x7 window for every month", () => {
    expect(cells).toHaveLength(42);
    expect(buildMonthGrid(new Date(2026, 1, 1))).toHaveLength(42); // 4-week Feb
    expect(buildMonthGrid(new Date(2026, 3, 1))).toHaveLength(42); // 5-week Apr
  });

  it("starts on the Sunday on/before the 1st", () => {
    expect(cells[0].iso).toBe("2026-04-26"); // Sunday before May 1 (Fri)
    expect(cells[0].inMonth).toBe(false);
  });

  it("ends 41 days later", () => {
    expect(cells[41].iso).toBe("2026-06-06");
  });

  it("marks exactly the 31 days of May as in-month", () => {
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
    const may1 = cells.find((c) => c.iso === "2026-05-01");
    expect(may1?.inMonth).toBe(true);
    expect(may1?.dayOfMonth).toBe(1);
  });

  it("formats ISO dates", () => {
    expect(toISODate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("inMonthWeekCount", () => {
  it("counts only the weeks a month occupies (trailing weeks dropped)", () => {
    // May 2026 (Fri start, 31 days) spills into a 6th week.
    expect(inMonthWeekCount(buildMonthGrid(new Date(2026, 4, 1)))).toBe(6);
    // April 2026 (Wed start, 30 days) fits in 5 weeks.
    expect(inMonthWeekCount(buildMonthGrid(new Date(2026, 3, 1)))).toBe(5);
    // Feb 2026 (Sun start, 28 days) fits in exactly 4 weeks.
    expect(inMonthWeekCount(buildMonthGrid(new Date(2026, 1, 1)))).toBe(4);
  });
});
