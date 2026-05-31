import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import {
  eventToColumns,
  overrideToColumns,
  rowToEvent,
  rowToOverride,
  rowToCategory,
} from "./mappers";

const baseEvent: CalendarEvent = {
  id: "e1",
  title: "Rent",
  date: "2026-05-01",
  categoryId: "c1",
  amount: 1200,
  direction: "withdrawal",
  recurrence: null,
  overrides: [],
  createdAt: "t0",
  updatedAt: "t1",
};

describe("event mappers", () => {
  it("maps a one-off event to 12 columns in schema order", () => {
    expect(eventToColumns(baseEvent)).toEqual([
      "e1",
      "Rent",
      "2026-05-01",
      "c1",
      1200,
      "withdrawal",
      null,
      null,
      null,
      null,
      "t0",
      "t1",
    ]);
  });

  it("normalizes a partial event's amount/direction at write time", () => {
    const partial = { ...baseEvent } as Record<string, unknown>;
    delete partial.amount;
    delete partial.direction;
    const cols = eventToColumns(partial as unknown as CalendarEvent);
    expect(cols[4]).toBe(0); // amount default
    expect(cols[5]).toBe("deposit"); // direction default
  });

  it("flattens recurrence (endsOn present) into columns", () => {
    const recurring: CalendarEvent = {
      ...baseEvent,
      recurrence: { freq: "weekly", interval: 2, endsOn: "2026-12-31" },
    };
    const cols = eventToColumns(recurring);
    expect(cols.slice(7, 10)).toEqual(["weekly", 2, "2026-12-31"]);
  });

  it("round-trips a recurring event (endsOn null) from a row", () => {
    const row = {
      id: "e1",
      title: "Rent",
      date: "2026-05-01",
      category_id: "c1",
      amount: 1200,
      direction: "withdrawal",
      notes: null,
      recurrence_freq: "monthly",
      recurrence_interval: 1,
      recurrence_ends_on: null,
      created_at: "t0",
      updated_at: "t1",
    };
    expect(rowToEvent(row, [])).toEqual({
      ...baseEvent,
      recurrence: { freq: "monthly", interval: 1, endsOn: null },
    });
  });

  it("omits notes when the column is null and includes it when present", () => {
    const withNotes = rowToEvent(
      {
        id: "e1",
        title: "Rent",
        date: "2026-05-01",
        category_id: "c1",
        amount: 1200,
        direction: "withdrawal",
        notes: "pay early",
        recurrence_freq: null,
        recurrence_interval: null,
        recurrence_ends_on: null,
        created_at: "t0",
        updated_at: "t1",
      },
      [],
    );
    expect(withNotes?.notes).toBe("pay early");
    const without = rowToEvent(
      {
        id: "e1",
        title: "Rent",
        date: "2026-05-01",
        category_id: "c1",
        amount: 1200,
        direction: "withdrawal",
        notes: null,
        recurrence_freq: null,
        recurrence_interval: null,
        recurrence_ends_on: null,
        created_at: "t0",
        updated_at: "t1",
      },
      [],
    );
    expect(Object.prototype.hasOwnProperty.call(without, "notes")).toBe(false);
  });
});

describe("override mappers", () => {
  it("maps a cancellation to columns", () => {
    expect(
      overrideToColumns("e1", { occurrenceDate: "2026-05-08", cancelled: true }),
    ).toEqual(["e1", "2026-05-08", 1, null, null, null]);
  });

  it("maps a patch to columns", () => {
    expect(
      overrideToColumns("e1", {
        occurrenceDate: "2026-05-08",
        patch: { title: "Moved" },
      }),
    ).toEqual(["e1", "2026-05-08", 0, "Moved", null, null]);
  });

  it("reconstructs a cancellation (no patch key)", () => {
    expect(
      rowToOverride({
        event_id: "e1",
        occurrence_date: "2026-05-08",
        cancelled: 1,
        patch_title: null,
        patch_category_id: null,
        patch_notes: null,
      }),
    ).toEqual({ occurrenceDate: "2026-05-08", cancelled: true });
  });

  it("reconstructs a patch (no cancelled key) with only present fields", () => {
    expect(
      rowToOverride({
        event_id: "e1",
        occurrence_date: "2026-05-08",
        cancelled: 0,
        patch_title: "Moved",
        patch_category_id: null,
        patch_notes: null,
      }),
    ).toEqual({ occurrenceDate: "2026-05-08", patch: { title: "Moved" } });
  });
});

describe("category mappers", () => {
  it("returns null for a row with an invalid color", () => {
    expect(rowToCategory({ id: "c1", name: "X", color: "teal" })).toBeNull();
  });
  it("maps a valid category row", () => {
    expect(rowToCategory({ id: "c1", name: "Rent", color: "magenta" })).toEqual({
      id: "c1",
      name: "Rent",
      color: "magenta",
    });
  });
});
