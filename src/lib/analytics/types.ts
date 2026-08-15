/**
 * Every custom event the app sends. Kept as a closed union so call sites
 * cannot invent one-off names that never get read.
 */
export type AnalyticsEventName =
  | "landing-viewed"
  | "try-now-clicked"
  | "new-event-clicked"
  | "settings-opened"
  | "sync-opened"
  | "data-opened"
  | "categories-opened"
  | "display-opened"
  | "display-changed"
  | "data-exported"
  | "data-imported"
  | "data-cleared"
  | "account-created"
  | "signed-in"
  | "sign-in-choice"
  | "sync-error"
  | "sync-rows-skipped"
  | "account-error"
  | "storage-error"
  | "data-error";

/**
 * Event properties. Values are limited to what Vercel Analytics accepts.
 * Never put user content here (event titles, amounts, emails, categories) —
 * these are the only fields that leave the device. Error events carry a code
 * from `errorCode`, never an error message, for the same reason.
 */
export type AnalyticsEventProps = Record<string, string | number | boolean>;
