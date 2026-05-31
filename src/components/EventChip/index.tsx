import type { Occurrence } from "@/types";
import { NEON_HEX } from "@/types";
import { formatSignedCompact } from "@/utils/formatCurrency";
import { signedAmount } from "@/lib/balance";

type EventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
};

const EventChip = ({ occurrence, onSelect }: EventChipProps) => {
  const hex = NEON_HEX[occurrence.category.color];
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      type="button"
      className="cy-chip w-full text-left"
      style={{ borderLeftColor: hex, boxShadow: `-1px 0 8px ${hex}66` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
    >
      {occurrence.isRecurring && <span aria-label="repeats">↻</span>}
      <span className="truncate">{occurrence.title}</span>
      <span className="cy-mono ml-auto pl-1">{formatSignedCompact(delta)}</span>
    </button>
  );
};

export default EventChip;
