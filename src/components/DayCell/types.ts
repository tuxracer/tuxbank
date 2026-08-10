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
  /**
   * How many chips fit the measured row height, from `chipCapacity`. Omitted
   * when no measurement exists yet, which means "no limit" rather than a
   * fallback cap: there is no fixed maximum.
   */
  maxVisibleChips?: number;
};
