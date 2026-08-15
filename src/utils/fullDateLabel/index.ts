/**
 * The "Monday, June 8" long-form day label, shared by the month grid, the
 * compact day panel, and the landing preview. Locale-resolved text: render it
 * under lang={RUNTIME_LOCALE} like the call sites do.
 */
const formatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export const fullDateLabel = (date: Date): string => formatter.format(date);
