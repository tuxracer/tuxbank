import type { CategoryColor } from "@/types";

/** Feature readouts on the landing page, rendered as HUD spec rows. */
export const LANDING_FEATURES: readonly { title: string; body: string }[] = [
  {
    title: "Start instantly",
    body: "Click Try Now and the calendar is yours. No account, no email, nothing to fill in.",
  },
  {
    title: "Your data stays here",
    body: "Events save to this browser and keep working offline. Nothing is uploaded unless you say so.",
  },
  {
    title: "Free and open source",
    body: "MIT licensed and free forever. No plans, no trials, no paywall waiting at the end.",
  },
  {
    title: "Optional encrypted sync",
    body: "Want it on more devices later? Turn on end-to-end encrypted sync. Off by default, never required.",
  },
];

/** Weekday header letters for the landing-page preview grid. */
export const LANDING_PREVIEW_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Static month behind the landing-page preview grid. March 2026 starts on a
 * Sunday, so 31 days plus 4 trailing cells fill exactly five 7-day rows with no
 * leading blanks, which keeps the preview markup a plain range.
 */
export const LANDING_PREVIEW_DAYS = 31;
export const LANDING_PREVIEW_TRAILING = 4;
export const LANDING_PREVIEW_TODAY = 12;

/** Day of month to the single event shown in that cell of the preview grid. */
export const LANDING_PREVIEW_EVENTS: Readonly<
  Record<number, { title: string; amount: string; color: CategoryColor }>
> = {
  1: { title: "Rent", amount: "-1,850", color: "magenta" },
  3: { title: "Paycheck", amount: "+2,310", color: "green" },
  6: { title: "Utilities", amount: "-214", color: "yellow" },
  9: { title: "Groceries", amount: "-128", color: "orange" },
  12: { title: "Car payment", amount: "-389", color: "magenta" },
  17: { title: "Paycheck", amount: "+2,310", color: "green" },
  20: { title: "Insurance", amount: "-142", color: "magenta" },
  24: { title: "Phone", amount: "-65", color: "magenta" },
  26: { title: "Groceries", amount: "-131", color: "orange" },
  31: { title: "Paycheck", amount: "+2,310", color: "green" },
};
