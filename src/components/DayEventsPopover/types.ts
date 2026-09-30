import type { Occurrence } from "@/types";

export type DayEventsPopoverProps = {
  label: string; // e.g. "+2 more"
  // Only the occurrences the cell could not fit, not the whole day.
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
