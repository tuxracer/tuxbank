import { describe, it, expect } from "vitest";
import { PRESET_CATEGORIES } from "@/types";
import { QuickAddError, normalizeQuickAddOutput } from "./index";
import type { QuickAddModelOutput } from "./index";

const TODAY = "2026-08-15";

const output = (over: Partial<QuickAddModelOutput>): QuickAddModelOutput => ({
  title: "Netflix",
  amount: 15.99,
  direction: "withdrawal",
  date: "2026-09-01",
  repeat: "monthly",
  interval: 1,
  endsOn: "",
  category: "Personal",
  ...over,
});

describe("normalizeQuickAddOutput", () => {
  it("maps a valid reply onto an EventInput, matching the category by name", () => {
    const input = normalizeQuickAddOutput(output({}), PRESET_CATEGORIES, TODAY);
    expect(input).toEqual({
      title: "Netflix",
      date: "2026-09-01",
      categoryId: "personal",
      amount: 15.99,
      direction: "withdrawal",
      recurrence: { freq: "monthly", interval: 1, endsOn: null },
    });
  });

  it("matches category names case-insensitively and falls back to the first category on no match", () => {
    const upper = normalizeQuickAddOutput(
      output({ category: "PERSONAL" }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(upper.categoryId).toBe("personal");
    const none = normalizeQuickAddOutput(
      output({ category: "" }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(none.categoryId).toBe(PRESET_CATEGORIES[0].id);
  });

  it("resolves an invalid date to today", () => {
    const input = normalizeQuickAddOutput(
      output({ date: "next friday" }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(input.date).toBe(TODAY);
  });

  it("drops an endsOn before the start date and clamps a bad interval to 1", () => {
    const input = normalizeQuickAddOutput(
      output({ endsOn: "2026-01-01", interval: 0 }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(input.recurrence).toEqual({
      freq: "monthly",
      interval: 1,
      endsOn: null,
    });
  });

  it("keeps a valid endsOn and interval", () => {
    const input = normalizeQuickAddOutput(
      output({ repeat: "weekly", interval: 2, endsOn: "2026-12-31" }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(input.recurrence).toEqual({
      freq: "weekly",
      interval: 2,
      endsOn: "2026-12-31",
    });
  });

  it('produces a one-off event for repeat "none"', () => {
    const input = normalizeQuickAddOutput(
      output({ repeat: "none" }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(input.recurrence).toBeNull();
  });

  it("rounds float noise in the amount to cents", () => {
    const input = normalizeQuickAddOutput(
      output({ amount: 15.990000000000002 }),
      PRESET_CATEGORIES,
      TODAY,
    );
    expect(input.amount).toBe(15.99);
  });

  it("rejects replies with no usable title or amount, and non-conforming shapes", () => {
    const cases: unknown[] = [
      output({ title: "   " }),
      output({ amount: 0 }),
      output({ amount: -5 }),
      "not an object",
      { title: "x" },
    ];
    for (const raw of cases) {
      expect(() =>
        normalizeQuickAddOutput(raw, PRESET_CATEGORIES, TODAY),
      ).toThrow(QuickAddError);
    }
  });
});
