import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  type Day,
} from "date-fns";
import { isNumber, isPlainObject } from "remeda";

import { DAYS_PER_WEEK, GRID_DAYS } from "./consts";
import type { DateCell } from "./types";

export * from "./consts";
export * from "./types";

export const toISODate = (date: Date): string => format(date, "yyyy-MM-dd");

/** date-fns day-of-week index: 0 = Sunday … 6 = Saturday. */
const isWeekStart = (value: number): value is Day =>
  Number.isInteger(value) && value >= 0 && value <= 6;

/** Intl week info reports firstDay in ISO-8601: 1 = Monday … 7 = Sunday. */
const isWeekInfo = (value: unknown): value is { firstDay: number } =>
  isPlainObject(value) && isNumber(value.firstDay);

// The proposal landed as getWeekInfo(), but some engines shipped the earlier
// weekInfo accessor and TypeScript's lib types carry neither, so read both
// shapes dynamically.
const readWeekInfo = (locale: Intl.Locale): unknown => {
  const method: unknown = Reflect.get(locale, "getWeekInfo");
  if (typeof method === "function") return method.call(locale);
  return Reflect.get(locale, "weekInfo");
};

/**
 * The locale's first day of the week as a date-fns index, from the engine's
 * Intl week info (which resolves bare language tags to their likely region
 * itself: "fr" -> Monday, "ja" -> Sunday). Engines without week info (Firefox,
 * as of 2026) and unparseable locales keep the app's historical Sunday start,
 * and self-heal when the engine ships the API.
 */
export const resolveWeekStartsOn = (locale: string): Day => {
  try {
    const info = readWeekInfo(new Intl.Locale(locale));
    if (isWeekInfo(info)) {
      const converted = info.firstDay % 7;
      if (isWeekStart(converted)) return converted;
    }
  } catch {
    // Unparseable locale: fall through to the default.
  }
  return 0;
};

// resolvedOptions().locale is the runtime's default locale, the same one the
// Intl-formatted labels elsewhere render in.
export const WEEK_STARTS_ON: Day = resolveWeekStartsOn(
  new Intl.DateTimeFormat().resolvedOptions().locale,
);

// Always build the full 6-week window so the data layer has a stable date range
// (occurrences, balances) and the compact view can fill 6 rows on every month.
// The desktop view trims trailing all-next-month weeks via inMonthWeekCount.
export const buildMonthGrid = (
  visibleMonth: Date,
  weekStartsOn: Day = WEEK_STARTS_ON,
): DateCell[] => {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });

  return Array.from({ length: GRID_DAYS }, (_, i) => {
    const date = addDays(gridStart, i);
    return {
      date,
      iso: toISODate(date),
      dayOfMonth: date.getDate(),
      inMonth: isSameMonth(date, monthStart),
    };
  });
};

// How many week-rows the visible month occupies (4-6). The 1st always lands in
// the first week, so only trailing weeks that fall entirely in the next month
// are dropped. Lets the desktop grid render just the weeks a month spans.
export const inMonthWeekCount = (cells: DateCell[]): number => {
  let lastInMonthIndex = 0;
  cells.forEach((cell, index) => {
    if (cell.inMonth) lastInMonthIndex = index;
  });
  return Math.floor(lastInMonthIndex / DAYS_PER_WEEK) + 1;
};
