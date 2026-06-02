const monthNameFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
});

// Full month names in calendar order: ["January", … "December"].
export const MONTH_NAMES: readonly string[] = Array.from(
  { length: 12 },
  (_, index) => monthNameFormatter.format(new Date(2000, index, 1)),
);
