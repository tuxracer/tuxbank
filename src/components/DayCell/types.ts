import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";

export type DayCellProps = {
  cell: DateCell;
  isToday: boolean;
  tabIndex: number;
  occurrences: Occurrence[];
  balance: number;
  dateLabel: string;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};
