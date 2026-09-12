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

// One cached formatter per currency and form: the default plus whatever
// override the display preferences select, in the full figure and the
// abbreviated one, without rebuilding Intl.NumberFormat per call.
const currencyFormats = new Map<string, Intl.NumberFormat>();
const currencyFormat = (currency: string, short = false): Intl.NumberFormat => {
  const key = short ? `${currency}:short` : currency;
  let format = currencyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      ...(short ? { notation: "compact" as const } : {}),
    });
    currencyFormats.set(key, format);
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
/**
 * The same figure abbreviated by the locale's own compact notation ("$1.2K",
 * "1,3 Mio. €") and without cents, for the compact layout's day cells, which
 * are around 32px wide and cannot hold the full form.
 */
export const formatCurrencyShort = (
  amount: number,
  currency: string = LOCAL_CURRENCY,
): string => currencyFormat(currency, true).format(amount);
export const formatSignedCompact = (amount: number): string =>
  COMPACT.format(amount);
