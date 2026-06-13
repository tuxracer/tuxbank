import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { DAYS_PER_WEEK, GRID_DAYS, WEEK_STARTS_ON } from "./consts";
import type { DateCell } from "./types";

export * from "./consts";
export * from "./types";

export const toISODate = (date: Date): string => format(date, "yyyy-MM-dd");

// Always build the full 6-week window so the data layer has a stable date range
// (occurrences, balances) and the compact view can fill 6 rows on every month.
// The desktop view trims trailing all-next-month weeks via inMonthWeekCount.
export const buildMonthGrid = (visibleMonth: Date): DateCell[] => {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });

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
