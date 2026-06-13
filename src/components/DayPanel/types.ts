import type { Occurrence } from "@/types";

export type DayPanelProps = {
  dateISO: string;
  occurrences: Occurrence[];
  balance: number;
  onSelectOccurrence: (occurrence: Occurrence) => void;
  onAddEvent: () => void;
};
