import type { Recurrence } from "@/types";
import type { IncomeCadence, IntroCategory } from "./types";

/**
 * The categories the first-run flow files its events under. Green for income
 * and magenta for the fixed bill, the same reading the landing preview gives
 * those colours, so the visitor's first month looks like the one they were
 * shown.
 */
export const INTRO_INCOME_CATEGORY: IntroCategory = {
  name: "Income",
  color: "green",
};
export const INTRO_BILL_CATEGORY: IntroCategory = {
  name: "Bills",
  color: "magenta",
};

/** Title of the one-off deposit that stands in for the opening balance. */
export const STARTING_BALANCE_TITLE = "Starting balance";

/** Titles the income and bill fields start out with; blanking one restores it. */
export const DEFAULT_INCOME_TITLE = "Paycheck";
export const DEFAULT_BILL_TITLE = "Rent";

/** The recurrence rule each income cadence maps onto. */
export const CADENCE_RECURRENCE: Record<IncomeCadence, Recurrence> = {
  weekly: { freq: "weekly", interval: 1, endsOn: null },
  biweekly: { freq: "weekly", interval: 2, endsOn: null },
  monthly: { freq: "monthly", interval: 1, endsOn: null },
};

/** How many times a year each cadence pays out; the monthly readout divides by 12. */
export const CADENCE_PER_YEAR: Record<IncomeCadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

export const MONTHS_PER_YEAR = 12;

export const BILL_RECURRENCE: Recurrence = {
  freq: "monthly",
  interval: 1,
  endsOn: null,
};
