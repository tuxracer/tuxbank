/**
 * Droppable ids of the ‹ and › buttons. A chip held over one mid-drag turns
 * the page, which is how an event reaches a day that is not on screen.
 */
export const DRAG_PAGE_PREV_ID = "drag-page:prev";
export const DRAG_PAGE_NEXT_ID = "drag-page:next";

const monthsOf = (formatter: Intl.DateTimeFormat): readonly string[] =>
  Array.from({ length: 12 }, (_, index) =>
    formatter.format(new Date(2000, index, 1)),
  );

// Full month names in calendar order: ["January", … "December"].
export const MONTH_NAMES: readonly string[] = monthsOf(
  new Intl.DateTimeFormat(undefined, { month: "long" }),
);

// Locale-aware abbreviations for the compact toolbar: ["Jan", … "Dec"].
export const MONTH_NAMES_SHORT: readonly string[] = monthsOf(
  new Intl.DateTimeFormat(undefined, { month: "short" }),
);
