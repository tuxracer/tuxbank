import type { Occurrence } from "@/types";

export type DayEventsPopoverProps = {
  label: string; // e.g. "+2 more"
  dateLabel: string; // e.g. "May 13"
  occurrences: Occurrence[];
  onSelect: (occurrence: Occurrence) => void;
};
