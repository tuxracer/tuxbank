import { isString } from "remeda";
import type {
  CalendarEvent,
  Category,
  OccurrenceOverride,
  Recurrence,
} from "@/types";
import { isCalendarEvent, isCategory, isRecurrenceFreq } from "@/types";
import type { Row, SqlValue } from "./types";
import { DEFAULT_AMOUNT, DEFAULT_DIRECTION } from "./consts";

const normalizeAmount = (value: unknown): number =>
  typeof value === "number" ? value : DEFAULT_AMOUNT;

const normalizeDirection = (value: unknown): "deposit" | "withdrawal" =>
  value === "withdrawal" ? "withdrawal" : DEFAULT_DIRECTION;

// ---- events ----

/** Bind values for UPSERT_EVENT_SQL. Order MUST match the SQL column list. */
export const eventToColumns = (event: CalendarEvent): SqlValue[] => [
  event.id,
  event.title,
  event.date,
  event.categoryId,
  normalizeAmount(event.amount),
  normalizeDirection(event.direction),
  event.notes ?? null,
  event.recurrence ? event.recurrence.freq : null,
  event.recurrence ? event.recurrence.interval : null,
  event.recurrence ? event.recurrence.endsOn : null,
  event.createdAt,
  event.updatedAt,
];

export const rowToEvent = (
  row: Row,
  overrides: OccurrenceOverride[],
): CalendarEvent | null => {
  const recurrence: Recurrence | null = isRecurrenceFreq(row.recurrence_freq)
    ? {
        freq: row.recurrence_freq,
        interval:
          typeof row.recurrence_interval === "number"
            ? row.recurrence_interval
            : 1,
        endsOn: isString(row.recurrence_ends_on) ? row.recurrence_ends_on : null,
      }
    : null;

  const event = {
    id: row.id,
    title: row.title,
    date: row.date,
    categoryId: row.category_id,
    amount: normalizeAmount(row.amount),
    direction: normalizeDirection(row.direction),
    ...(isString(row.notes) ? { notes: row.notes } : {}),
    recurrence,
    overrides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return isCalendarEvent(event) ? event : null;
};

// ---- overrides ----

/** Bind values for INSERT_OVERRIDE_SQL. Order MUST match the SQL column list. */
export const overrideToColumns = (
  eventId: string,
  override: OccurrenceOverride,
): SqlValue[] => [
  eventId,
  override.occurrenceDate,
  override.cancelled ? 1 : 0,
  override.patch?.title ?? null,
  override.patch?.categoryId ?? null,
  override.patch?.notes ?? null,
];

export const rowToOverride = (row: Row): OccurrenceOverride => {
  const override: OccurrenceOverride = {
    occurrenceDate: isString(row.occurrence_date) ? row.occurrence_date : "",
  };
  if (row.cancelled === 1) override.cancelled = true;
  const patch: { title?: string; categoryId?: string; notes?: string } = {};
  if (isString(row.patch_title)) patch.title = row.patch_title;
  if (isString(row.patch_category_id)) patch.categoryId = row.patch_category_id;
  if (isString(row.patch_notes)) patch.notes = row.patch_notes;
  if (Object.keys(patch).length > 0) override.patch = patch;
  return override;
};

// ---- categories ----

export const categoryToRow = (category: Category): SqlValue[] => [
  category.id,
  category.name,
  category.color,
];

export const rowToCategory = (row: Row): Category | null => {
  const candidate = { id: row.id, name: row.name, color: row.color };
  return isCategory(candidate) ? candidate : null;
};
