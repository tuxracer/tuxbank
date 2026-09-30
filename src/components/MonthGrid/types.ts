import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";

export type MonthGridProps = {
  cells: DateCell[];
  todayISO: string;
  /** Compact (small-screen) mode: cells render dots and act as day selectors. */
  compact?: boolean;
  /** ISO date highlighted as selected (compact mode only). */
  selectedISO?: string;
  /** Compact-mode swipe: leftward swipe on the grid (typically the next page). */
  onSwipeLeft?: () => void;
  /** Compact-mode swipe: rightward swipe on the grid (typically the previous page). */
  onSwipeRight?: () => void;
  /** Wheel scroll up on the grid: go back a page (a month, or the visible weeks). */
  onPrev?: () => void;
  /** Wheel scroll down on the grid: go forward a page. */
  onNext?: () => void;
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate?: Record<string, number>;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};
