import { catColorVar, catGlowVar } from "@/utils/categoryColor";
import { formatSignedCompact } from "@/utils/formatCurrency";
import { signedAmount } from "@/lib/balance";

import type { EventChipProps } from "./types";

export * from "./types";

const EventChip = ({
  occurrence,
  onSelect,
  dragRef,
  dragListeners,
  dragAttributes,
  isDragging,
}: EventChipProps) => {
  const { color } = occurrence.category;
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      ref={dragRef}
      type="button"
      className={`cy-chip w-full text-left${isDragging ? " cy-chip-dragging" : ""}`}
      style={{
        borderLeftColor: catColorVar(color),
        boxShadow: `-1px 0 8px color-mix(in srgb, ${catGlowVar(color)} 40%, transparent)`,
        touchAction: "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
    >
      {occurrence.isRecurring && <span>↻</span>}
      <span className="truncate">{occurrence.title}</span>
      <span className="cy-mono ml-auto pl-1">{formatSignedCompact(delta)}</span>
    </button>
  );
};

export default EventChip;
