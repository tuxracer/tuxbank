/**
 * A calendar day with its month, in the viewer's locale: "Oct 1" spelled out,
 * or "10/1" where even that is too wide (a compact day cell). Locale-resolved
 * text: render it under lang={RUNTIME_LOCALE}.
 */
const formatters = {
  short: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }),
  numeric: new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
  }),
};

export const monthDayLabel = (
  date: Date,
  width: keyof typeof formatters = "short",
): string => formatters[width].format(date);
