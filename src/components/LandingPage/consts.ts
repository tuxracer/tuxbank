import type { LandingPreviewEvent, LandingSpec } from "./types";

/** Weekday header letters for the landing-page preview grid. */
export const LANDING_PREVIEW_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Month label above the preview console. */
export const LANDING_PREVIEW_MONTH = "March 2026";

/**
 * Static month behind the landing-page preview. March 2026 starts on a Sunday,
 * so 31 days plus 4 trailing cells fill exactly five 7-day rows with no leading
 * blanks, which keeps the preview markup a plain range.
 */
export const LANDING_PREVIEW_DAYS = 31;
export const LANDING_PREVIEW_TRAILING = 4;
export const LANDING_PREVIEW_TODAY = 12;

/**
 * Balance carried into the preview month. Chosen so rent on the 1st overdraws
 * the account for two days before the first paycheck lands: the dip is the
 * whole point of laying a month out, so the preview shows one.
 */
export const LANDING_PREVIEW_CARRY_IN = 1_468;

/**
 * The preview month's transactions, keyed by day of month. Amounts are signed
 * (deposits positive), and every category color appears at least once: green
 * for income, magenta for fixed debt, yellow for utilities, orange for variable
 * spending, cyan for savings.
 */
export const LANDING_PREVIEW_EVENTS: Readonly<
  Record<number, LandingPreviewEvent>
> = {
  1: { title: "Rent", amount: -1_850, color: "magenta" },
  2: { title: "Gym", amount: -39, color: "orange" },
  3: { title: "Paycheck", amount: 2_310, color: "green" },
  4: { title: "Groceries", amount: -128, color: "orange" },
  5: { title: "Savings", amount: -300, color: "cyan" },
  6: { title: "Utilities", amount: -214, color: "yellow" },
  8: { title: "Streaming", amount: -18, color: "orange" },
  9: { title: "Groceries", amount: -142, color: "orange" },
  11: { title: "Car payment", amount: -389, color: "magenta" },
  12: { title: "Phone", amount: -65, color: "yellow" },
  14: { title: "Insurance", amount: -142, color: "magenta" },
  16: { title: "Groceries", amount: -117, color: "orange" },
  17: { title: "Paycheck", amount: 2_310, color: "green" },
  20: { title: "Student loan", amount: -318, color: "magenta" },
  23: { title: "Groceries", amount: -136, color: "orange" },
  25: { title: "Internet", amount: -79, color: "yellow" },
  27: { title: "Credit card", amount: -450, color: "magenta" },
  30: { title: "Groceries", amount: -124, color: "orange" },
  31: { title: "Paycheck", amount: 2_310, color: "green" },
};

/** Milliseconds each preview cell waits past the one before it on first paint. */
export const LANDING_STAGGER_MS = 16;

/**
 * What the visitor is signing up for, as a datasheet rather than a feature
 * grid: a fixed mono key and the plain answer beside it.
 */
export const LANDING_SPECS: readonly LandingSpec[] = [
  {
    key: "Account",
    body: "None. Try Now opens the calendar with nothing to fill in first.",
  },
  {
    key: "Storage",
    body: "This browser. Events keep working offline and nothing is uploaded unless you turn on sync.",
  },
  {
    key: "Sync",
    body: "Optional and end-to-end encrypted, for reading the same months on another device. Off by default.",
  },
  {
    key: "Price",
    body: "Free, MIT licensed, open source. No plans, no trial, no paywall at the end.",
  },
];
