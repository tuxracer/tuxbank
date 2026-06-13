export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const COLS = 7;

/* Pixel sizes mirrored from the rendered desktop CSS, used to compute how
   many whole chips fit a day cell (see chipCapacity in index.tsx). Verified
   against the real browser; update by hand if cell/chip styling changes. */
/** Grid row gap: Tailwind gap-1.5. */
export const ROW_GAP_PX = 6;
/** DayCell vertical padding: p-1.5 top + bottom. */
export const CELL_PADDING_Y_PX = 12;
/** Day-number line: 16px base font at default line-height. */
export const DAY_NUMBER_HEIGHT_PX = 24;
/** Balance line: 10px cy-balance text. */
export const BALANCE_HEIGHT_PX = 15;
/** DayCell flex column gap (gap-1) between number / chips / balance. */
export const SECTION_GAP_PX = 4;
/** One .cy-chip row: 11px text (line-height 16.5px) plus 2px vertical padding each side. */
export const CHIP_HEIGHT_PX = 21;
/** Gap between stacked chips (gap-1). */
export const CHIP_GAP_PX = 4;
/** The "+N more" trigger: 10px text plus mt-1. */
export const MORE_LINE_HEIGHT_PX = 19;

/** Fixed vertical cost of a cell before any chips: padding, day number,
    balance line, and the two inter-section gaps. */
export const CHIP_AREA_OVERHEAD_PX =
  CELL_PADDING_Y_PX +
  DAY_NUMBER_HEIGHT_PX +
  BALANCE_HEIGHT_PX +
  2 * SECTION_GAP_PX;
