import { describe, expect, it } from "vitest";
import { buildMonthGrid } from "@/lib/dateGrid";
import type { Occurrence } from "@/types";
import { computeMonthTotals } from "./index";

const category = {
  id: "cat",
  name: "Cat",
  color: "cyan",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const occurrence = (
  date: string,
  amount: number,
  direction: Occurrence["direction"],
): Occurrence => ({
  eventId: `ev-${date}-${amount}`,
  date,
  title: "t",
  category,
  amount,
  direction,
  isRecurring: false,
});

describe("computeMonthTotals", () => {
  const cells = buildMonthGrid(new Date(2026, 2, 1)); // March 2026

  it("sums deposits positive, withdrawals negative, and ends on the last in-month balance", () => {
    const totals = computeMonthTotals(
      cells,
      {
        "2026-03-01": [occurrence("2026-03-01", 1_850, "withdrawal")],
        "2026-03-03": [occurrence("2026-03-03", 2_310, "deposit")],
        "2026-03-31": [occurrence("2026-03-31", 40, "withdrawal")],
      },
      { "2026-03-01": -1_850, "2026-03-03": 460, "2026-03-31": 420 },
    );
    expect(totals).toEqual({ deposits: 2_310, withdrawals: -1_890, end: 420 });
  });

  it("ignores occurrences and balances on leading/trailing out-of-month days", () => {
    const totals = computeMonthTotals(
      cells,
      // April 1 2026 sits in March's trailing week but belongs to April.
      { "2026-04-01": [occurrence("2026-04-01", 500, "deposit")] },
      { "2026-03-31": 0, "2026-04-01": 500 },
    );
    expect(totals).toEqual({ deposits: 0, withdrawals: 0, end: 0 });
  });
});
