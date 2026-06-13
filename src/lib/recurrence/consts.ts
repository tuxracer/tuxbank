import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
} from "date-fns";
import type { RecurrenceFreq } from "@/types";

export const RECURRENCE_LABELS: Record<
  "none" | "daily" | "weekly" | "monthly" | "yearly",
  string
> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const MAX_ITER = 1_000_000;

export const STEP: Record<
  RecurrenceFreq,
  (anchor: Date, amount: number) => Date
> = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
};

export const UNITS_BETWEEN: Record<
  RecurrenceFreq,
  (anchor: Date, target: Date) => number
> = {
  daily: (a, t) => differenceInCalendarDays(t, a),
  weekly: (a, t) => Math.floor(differenceInCalendarDays(t, a) / 7),
  monthly: (a, t) => differenceInCalendarMonths(t, a),
  yearly: (a, t) => differenceInCalendarYears(t, a),
};
