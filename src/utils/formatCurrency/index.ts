import { RUNTIME_LOCALE } from "@/utils/runtimeLocale";
import { FALLBACK_CURRENCY, REGION_CURRENCY } from "./consts";

export * from "./consts";

/**
 * The currency people in the given locale's region transact in. There is no
 * web API for "the local currency": Intl formats any currency but never picks
 * one, so the locale's region keys a CLDR-derived lookup, with `maximize()`
 * filling in the likely region when the locale is bare ("ja" -> "JP").
 * Unknown regions and unparseable locales fall back to USD.
 */
export const resolveLocalCurrency = (locale: string): string => {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) || FALLBACK_CURRENCY;
  } catch {
    return FALLBACK_CURRENCY;
  }
};

/** What "automatic" resolves to: the currency the viewer's region transacts in. */
export const LOCAL_CURRENCY = resolveLocalCurrency(RUNTIME_LOCALE);

// One cached formatter per currency: the default plus whatever override the
// display preferences select, without rebuilding Intl.NumberFormat per call.
const currencyFormats = new Map<string, Intl.NumberFormat>();
const currencyFormat = (currency: string): Intl.NumberFormat => {
  let format = currencyFormats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(undefined, { style: "currency", currency });
    currencyFormats.set(currency, format);
  }
  return format;
};

const COMPACT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
  signDisplay: "always",
});

export const formatCurrency = (
  amount: number,
  currency: string = LOCAL_CURRENCY,
): string => currencyFormat(currency).format(amount);
export const formatSignedCompact = (amount: number): string =>
  COMPACT.format(amount);
