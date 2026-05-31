import { describe, it, expect } from "vitest";
import { buildMonthGrid, toISODate, GRID_DAYS } from "./index";

describe("buildMonthGrid", () => {
  const cells = buildMonthGrid(new Date(2026, 4, 1)); // May 2026 (month is 0-based)

  it("returns a fixed 6x7 grid", () => {
    expect(cells).toHaveLength(GRID_DAYS);
    expect(GRID_DAYS).toBe(42);
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
