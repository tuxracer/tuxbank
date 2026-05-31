import { isString, isArray, isPlainObject } from "remeda";

export type CategoryColor = "cyan" | "magenta" | "yellow" | "green" | "orange";

export type TransactionDirection = "deposit" | "withdrawal";

export type Category = {
  id: string;
  name: string;
  color: CategoryColor;
};

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number; // >= 1
  endsOn: string | null; // YYYY-MM-DD inclusive, or null = forever
};

export type OccurrenceOverride = {
  occurrenceDate: string; // YYYY-MM-DD
  cancelled?: boolean;
  patch?: { title?: string; categoryId?: string; notes?: string };
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD; series anchor for recurring events
  categoryId: string;
  amount: number;
  direction: TransactionDirection;
  notes?: string;
  recurrence: Recurrence | null;
  overrides: OccurrenceOverride[];
  createdAt: string;
  updatedAt: string;
};

/** A concrete, rendered instance of an event on a specific date. */
export type Occurrence = {
  eventId: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: Category;
  amount: number;
  direction: TransactionDirection;
  notes?: string;
  isRecurring: boolean;
};

const RECURRENCE_FREQS: readonly RecurrenceFreq[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];
const CATEGORY_COLORS: readonly CategoryColor[] = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "orange",
];

export const isRecurrenceFreq = (value: unknown): value is RecurrenceFreq =>
  isString(value) && RECURRENCE_FREQS.includes(value as RecurrenceFreq);

export const isCategoryColor = (value: unknown): value is CategoryColor =>
  isString(value) && CATEGORY_COLORS.includes(value as CategoryColor);

export const isCalendarEvent = (value: unknown): value is CalendarEvent =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.title) &&
  isString(value.date) &&
  isString(value.categoryId) &&
  isArray(value.overrides) &&
  (value.recurrence === null || isPlainObject(value.recurrence));

export * from "./consts";
