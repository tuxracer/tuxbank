import { describe, expect, it } from "vitest";
import {
  buildIntroPlan,
  INTRO_BILL_CATEGORY,
  INTRO_INCOME_CATEGORY,
  monthlyEquivalent,
  parseAmount,
  STARTING_BALANCE_TITLE,
} from "./index";

const TODAY = "2026-09-12";

describe("buildIntroPlan", () => {
  it("plans an empty month when every question was skipped", () => {
    const plan = buildIntroPlan(
      { balance: null, income: null, bill: null },
      TODAY,
    );
    expect(plan.events).toEqual([]);
    expect(plan.categories).toEqual([]);
  });

  it("files the opening balance as an uncategorized one-off deposit on today", () => {
    const plan = buildIntroPlan(
      { balance: 1_468, income: null, bill: null },
      TODAY,
    );
    expect(plan.events).toEqual([
      {
        title: STARTING_BALANCE_TITLE,
        date: TODAY,
        category: null,
        amount: 1_468,
        direction: "deposit",
        recurrence: null,
      },
    ]);
    expect(plan.categories).toEqual([]);
  });

  it("maps every-two-weeks pay onto a weekly series at interval 2", () => {
    const plan = buildIntroPlan(
      {
        balance: null,
        income: {
          title: "Paycheck",
          amount: 2_310,
          cadence: "biweekly",
          nextDate: "2026-09-18",
        },
        bill: null,
      },
      TODAY,
    );
    expect(plan.events[0]).toMatchObject({
      date: "2026-09-18",
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 2, endsOn: null },
      category: INTRO_INCOME_CATEGORY,
    });
  });

  it("makes the bill a monthly withdrawal anchored on its next due date", () => {
    const plan = buildIntroPlan(
      {
        balance: null,
        income: null,
        bill: { title: "Rent", amount: 1_850, nextDate: "2026-10-01" },
      },
      TODAY,
    );
    expect(plan.events[0]).toMatchObject({
      date: "2026-10-01",
      direction: "withdrawal",
      recurrence: { freq: "monthly", interval: 1, endsOn: null },
      category: INTRO_BILL_CATEGORY,
    });
  });

  it("lists each category once, in the order the events first use it", () => {
    const plan = buildIntroPlan(
      {
        balance: 500,
        income: {
          title: "Paycheck",
          amount: 2_310,
          cadence: "monthly",
          nextDate: "2026-09-30",
        },
        bill: { title: "Rent", amount: 1_850, nextDate: "2026-10-01" },
      },
      TODAY,
    );
    expect(plan.categories).toEqual([
      INTRO_INCOME_CATEGORY,
      INTRO_BILL_CATEGORY,
    ]);
    expect(plan.events).toHaveLength(3);
  });
});

describe("parseAmount", () => {
  it("reads a positive figure and rejects everything else", () => {
    expect(parseAmount(" 1250.50 ")).toBe(1_250.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-40")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("monthlyEquivalent", () => {
  it("scales each cadence to an average month", () => {
    expect(monthlyEquivalent(1_000, "monthly")).toBe(1_000);
    expect(monthlyEquivalent(1_000, "biweekly")).toBe(2_167);
    expect(monthlyEquivalent(1_000, "weekly")).toBe(4_333);
  });
});
