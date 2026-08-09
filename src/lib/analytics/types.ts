/**
 * Every custom event the app sends. Kept as a closed union so call sites
 * cannot invent one-off names that never get read.
 */
export type AnalyticsEventName =
  | "new-event-clicked"
  | "sync-opened"
  | "data-opened"
  | "categories-opened"
  | "about-opened"
  | "data-exported"
  | "data-imported"
  | "data-cleared"
  | "account-created"
  | "signed-in";

/**
 * Event properties. Values are limited to what Vercel Analytics accepts.
 * Never put user content here (event titles, amounts, emails, categories) —
 * these are the only fields that leave the device.
 */
export type AnalyticsEventProps = Record<string, string | number | boolean>;
