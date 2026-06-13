import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";

export type DayCellProps = {
  cell: DateCell;
  isToday: boolean;
  /** Compact (small-screen) mode: render dots, no chips or balance. */
  compact?: boolean;
  /** Compact-mode selection highlight. */
  isSelected?: boolean;
  tabIndex: number;
  occurrences: Occurrence[];
  balance: number;
  dateLabel: string;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
  /** Visible-chip cap for short windows; defaults to MAX_VISIBLE_CHIPS. */
  maxVisibleChips?: number;
};
