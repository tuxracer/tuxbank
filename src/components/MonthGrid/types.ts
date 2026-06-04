import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";

export type MonthGridProps = {
  cells: DateCell[];
  todayISO: string;
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate?: Record<string, number>;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};
