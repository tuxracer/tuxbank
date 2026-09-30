import type { Occurrence } from "@/types";

export type DayEventsPopoverProps = {
  label: string; // e.g. "+2 more"
  dateLabel: string; // e.g. "May 13"
  occurrences: Occurrence[];
  onSelect: (occurrence: Occurrence) => void;
};

export type OverflowChipsProps = {
  occurrences: Occurrence[];
  onSelect: (occurrence: Occurrence) => void;
  onDragStart: () => void;
  // Fires for a cancelled drag as well as a dropped one.
  onDragEnd: () => void;
};
