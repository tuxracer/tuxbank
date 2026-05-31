import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const GRID_DAYS = 42; // fixed 6 weeks x 7 days
const WEEK_STARTS_ON = 0; // Sunday

export type DateCell = {
  date: Date;
  iso: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
};

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
