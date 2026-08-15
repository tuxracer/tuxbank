import type { Day } from "date-fns";
import { weekdayLabel } from "@/utils/weekdayLabel";

export const COLS = 7;

/** Column headers in the viewer's language, starting on the given weekday to
    match the buildMonthGrid column order. */
export const weekdayLabels = (weekStartsOn: Day): readonly string[] =>
  Array.from({ length: COLS }, (_, index) =>
    weekdayLabel((weekStartsOn + index) % COLS),
  );

/* Pixel sizes mirrored from the rendered desktop CSS, used to compute how
   many whole chips fit a day cell (see chipCapacity in index.tsx). Verified
   against the real browser; update by hand if cell/chip styling changes. */
/** Grid row gap: Tailwind gap-1.5. */
export const ROW_GAP_PX = 6;
/** DayCell vertical padding: p-1.5 top + bottom. */
export const CELL_PADDING_Y_PX = 12;
/** Day-number line: 11px cy-cell-num at line-height 1.1, measured at 12.09px. */
export const DAY_NUMBER_HEIGHT_PX = 13;
/** Balance line: 10px cy-balance text. */
export const BALANCE_HEIGHT_PX = 15;
/** DayCell flex column gap (gap-1) between number / chips / balance. */
export const SECTION_GAP_PX = 4;
/** One .cy-chip row: 11px text at line-height 1.25 plus 2px vertical padding
    each side, measured at 17.75px. */
export const CHIP_HEIGHT_PX = 18;
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
