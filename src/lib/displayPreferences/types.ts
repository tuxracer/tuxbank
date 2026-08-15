import type { Day } from "date-fns";
import { isNumber, isPlainObject, isString } from "remeda";

/**
 * Display overrides, each `null` when the app should follow the locale
 * ("automatic"). Part of the synced dataset: a signed-in account carries its
 * settings to every device, because a user who picks a currency on one device
 * and finds another still showing a different one cannot tell what syncs.
 *
 * "Automatic" stays meaningful across devices: what syncs is the choice to
 * follow the locale, and each device then resolves it against its own locale
 * rather than being pinned to whichever locale set it.
 */
export type DisplayPreferences = {
  /** ISO 4217 code to format amounts in, or null for the locale's currency. */
  currency: string | null;
  /** date-fns day index (0 = Sunday … 6 = Saturday), or null for the locale's. */
  weekStartsOn: Day | null;
};

/** Well-formed ISO 4217 code. Intl formats any such code, known or not. */
export const isCurrencyCode = (value: unknown): value is string =>
  isString(value) && /^[A-Z]{3}$/.test(value);

export const isWeekStartDay = (value: unknown): value is Day =>
  isNumber(value) && Number.isInteger(value) && value >= 0 && value <= 6;

export const isDisplayPreferences = (
  value: unknown,
): value is DisplayPreferences =>
  isPlainObject(value) &&
  (value.currency === null || isCurrencyCode(value.currency)) &&
  (value.weekStartsOn === null || isWeekStartDay(value.weekStartsOn));
