import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Occurrence } from "@/types";
import EventChip from "@/components/EventChip";

type DraggableEventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
  /**
   * Distinguishes a second draggable copy of the same occurrence. The overflow
   * popover lists a day's chips again while the cell still shows some of them,
   * and two draggables sharing an id would both dim and fight over the drag.
   */
  idPrefix?: string;
};

const DraggableEventChip = ({
  occurrence,
  onSelect,
  idPrefix = "",
}: DraggableEventChipProps) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${idPrefix}${occurrence.eventId}:${occurrence.date}`,
    data: { occurrence },
  });
  return (
    <EventChip
      occurrence={occurrence}
      onSelect={onSelect}
      dragRef={setNodeRef}
      dragListeners={listeners}
      dragAttributes={attributes}
      isDragging={isDragging}
    />
  );
};

// Memoized: when a DayCell legitimately re-renders (selection, focus, drop
// highlight), its chips' props are usually untouched — only useDraggable's own
// context updates (the active chip during a drag) should re-render a chip.
export default memo(DraggableEventChip);
