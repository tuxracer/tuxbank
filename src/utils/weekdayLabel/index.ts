const FORMATTERS = {
  short: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
  long: new Intl.DateTimeFormat(undefined, { weekday: "long" }),
} as const;

/**
 * A weekday's name in the viewer's language. 2023-01-01 is a Sunday, so
 * day-of-week d (0 = Sunday … 6 = Saturday) lands on January 1+d.
 */
export const weekdayLabel = (
  dayOfWeek: number,
  style: keyof typeof FORMATTERS = "short",
): string => FORMATTERS[style].format(new Date(2023, 0, 1 + dayOfWeek));
