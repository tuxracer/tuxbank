import { catColorVar } from "@/utils/categoryColor";
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
  const accent = catColorVar(color);
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      ref={dragRef}
      type="button"
      className={`cy-chip w-full text-left${isDragging ? " cy-chip-dragging" : ""}`}
      style={{
        borderLeftColor: accent,
        // Only suppress touch-scroll on actually-draggable chips; static chips
        // (overflow popover, drag overlay) keep native scrolling.
        ...(dragListeners ? { touchAction: "none" } : {}),
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
      // dragListeners carries pointer/touch handlers, not onClick, so the click
      // (edit) handler above is preserved; a drag is gated by activation distance.
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
    >
      {occurrence.isRecurring && <span>↻</span>}
      <span className="truncate">{occurrence.title}</span>
      {/* The amount stays the chip's own text colour: the category already
          speaks through the left border, and tinting the figure too made the
          same number read differently from one row to the next. */}
      <span className="cy-chip-amount ml-auto">
        {formatSignedCompact(delta)}
      </span>
    </button>
  );
};

export default EventChip;
