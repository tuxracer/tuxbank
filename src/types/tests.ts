import { describe, it, expect } from "vitest";
import {
  isRecurrenceFreq,
  isCategoryColor,
  isCalendarEvent,
  isCategory,
  categoryKey,
  isOccurrence,
} from "./index";
import { PRESET_CATEGORIES } from "./consts";

describe("domain guards", () => {
  it("validates recurrence frequencies", () => {
    expect(isRecurrenceFreq("weekly")).toBe(true);
    expect(isRecurrenceFreq("fortnightly")).toBe(false);
    expect(isRecurrenceFreq(42)).toBe(false);
  });

  it("validates category colors", () => {
    expect(isCategoryColor("magenta")).toBe(true);
    expect(isCategoryColor("beige")).toBe(false);
  });

  it("validates a stored CalendarEvent shape", () => {
    const ok = {
      id: "1",
      title: "Standup",
      date: "2026-05-14",
      categoryId: "work",
      recurrence: null,
      overrides: [],
      createdAt: "x",
      updatedAt: "y",
    };
    expect(isCalendarEvent(ok)).toBe(true);
    expect(isCalendarEvent({ ...ok, date: 20260514 })).toBe(false);
    expect(isCalendarEvent(null)).toBe(false);
  });

  it("ships preset categories with valid colors", () => {
    expect(PRESET_CATEGORIES.length).toBeGreaterThan(0);
    PRESET_CATEGORIES.forEach((c) =>
      expect(isCategoryColor(c.color)).toBe(true),
    );
  });
});

describe("category helpers", () => {
  it("validates a Category shape", () => {
    expect(isCategory({ id: "work", name: "Work", color: "cyan" })).toBe(true);
    expect(isCategory({ id: "x", name: "X", color: "beige" })).toBe(false);
    expect(isCategory({ id: "x", name: 5, color: "cyan" })).toBe(false);
    expect(isCategory(null)).toBe(false);
  });

  it("derives a normalized, case-insensitive key from a name", () => {
    expect(categoryKey("  Groceries ")).toBe("groceries");
    expect(categoryKey("GROCERIES")).toBe("groceries");
  });
});

describe("isOccurrence", () => {
  const valid = {
    eventId: "e1",
    date: "2026-05-04",
    title: "Rent",
    category: PRESET_CATEGORIES[0],
    amount: 1200,
    direction: "withdrawal",
    isRecurring: true,
  };

  it("accepts a well-formed occurrence", () => {
    expect(isOccurrence(valid)).toBe(true);
  });

  it("rejects non-objects and null", () => {
    expect(isOccurrence(null)).toBe(false);
    expect(isOccurrence("nope")).toBe(false);
    expect(isOccurrence(undefined)).toBe(false);
  });

  it("rejects objects missing or mistyping required fields", () => {
    expect(isOccurrence({ ...valid, amount: "1200" })).toBe(false);
    expect(isOccurrence({ ...valid, direction: "sideways" })).toBe(false);
    expect(isOccurrence({ ...valid, isRecurring: "yes" })).toBe(false);
    expect(isOccurrence({ ...valid, category: { id: "x" } })).toBe(false);
  });
});
