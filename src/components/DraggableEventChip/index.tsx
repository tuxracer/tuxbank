import { useDraggable } from "@dnd-kit/core";
import type { Occurrence } from "@/types";
import EventChip from "@/components/EventChip";

type DraggableEventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
};

const DraggableEventChip = ({
  occurrence,
  onSelect,
}: DraggableEventChipProps) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${occurrence.eventId}:${occurrence.date}`,
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

export default DraggableEventChip;
