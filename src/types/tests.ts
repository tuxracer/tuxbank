import { describe, it, expect } from "vitest";
import {
  isRecurrenceFreq,
  isCategoryColor,
  isCalendarEvent,
  isCategory,
  categoryKey,
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
