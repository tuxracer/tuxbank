import type { Occurrence } from "@/types";

export type EventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
};
