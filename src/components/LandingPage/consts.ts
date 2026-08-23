import type { LandingPreviewEvent, LandingSpec } from "./types";

/**
 * Public source repository. The landing footer is the only place the app links
 * it, now that the About dialog is gone.
 */
export const REPO_URL = "https://github.com/tuxracer/tuxbank";

/**
 * Canonical public URL. Deliberately a constant rather than the deploy's own
 * origin: a preview deploy or localhost should still send a scanned phone to
 * the real app.
 */
export const APP_URL = "https://tuxbank.app";

/**
 * What the hero QR actually encodes: the app URL tagged so a scan is
 * attributable in Vercel Web Analytics (which picks UTM params off the
 * pageview). Two tags only, since every character raises the QR version and
 * shrinks the modules at a fixed rendered size.
 */
export const APP_QR_URL = `${APP_URL}/?utm_source=landing&utm_medium=qr`;

/**
 * The month behind the preview, and the day its compact panel is opened on.
 * The grid is built from these real dates through the app's own
 * `buildMonthGrid`, so the columns follow the visitor's locale: where the week
 * starts on Monday, March 2026 opens with six days of February instead of the
 * Sunday-aligned 1..31 range a hardcoded month would print under headers that
 * had already rotated.
 */
export const LANDING_PREVIEW_MONTH_DATE = new Date(2026, 2, 1);
export const LANDING_PREVIEW_TODAY_DATE = new Date(2026, 2, 12);

/**
 * Month label above the preview console, in the visitor's language, the way
 * the toolbar's month picker reads inside the running app. Intl text in an
 * otherwise-English document, so render it under `lang={RUNTIME_LOCALE}`.
 */
export const LANDING_PREVIEW_MONTH = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
}).format(LANDING_PREVIEW_MONTH_DATE);

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
 * Entrance choreography, as milliseconds from first paint. The page lands top
 * down — masthead, claim, then the copy that qualifies it — so the argument
 * arrives before the evidence does. `grid` is where the per-cell stagger starts
 * counting, which is why it trails the rail it fills in under.
 */
export const LANDING_ENTRANCE_MS = {
  header: 0,
  title: 60,
  copy: 120,
  rail: 180,
  grid: 240,
} as const;

/**
 * How long a cell's balance takes to run up from the day before's figure to its
 * own. Deliberately shorter than the 300ms cell fade so the number has settled
 * by the time the cell is fully opaque, leaving a readable month rather than a
 * grid of spinning digits.
 */
export const LANDING_COUNT_MS = 220;

/**
 * What the visitor is signing up for. Rendered as four cells built with the
 * month grid's own grammar (panel fills over hairline dividers): a mono HUD
 * key, a display-face claim, and one supporting sentence.
 */
export const LANDING_SPECS: readonly LandingSpec[] = [
  {
    key: "Account",
    title: "Open and go.",
    body: "No sign-up, no email, no password. Try Now opens the calendar ready to type into.",
  },
  {
    key: "Storage",
    title: "Stays on your device.",
    body: "Events live in this browser and keep working offline. Nothing is uploaded while sync is off.",
  },
  {
    key: "Sync",
    title: "Encrypted before it leaves.",
    body: "Turn it on to read the same months on another device. Only your devices hold the key. Off by default.",
  },
  {
    key: "Price",
    title: "Free, and staying free.",
    body: "MIT licensed and open source. No plans, no trial, no paywall at the end.",
  },
];
