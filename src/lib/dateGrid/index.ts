import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { GRID_DAYS, WEEK_STARTS_ON } from "./consts";
import type { DateCell } from "./types";

export * from "./consts";
export * from "./types";

export const toISODate = (date: Date): string => format(date, "yyyy-MM-dd");

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
