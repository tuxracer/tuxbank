import { catColorVar, catGlowVar } from "@/utils/categoryColor";
import { formatSignedCompact } from "@/utils/formatCurrency";
import { signedAmount } from "@/lib/balance";

import type { EventChipProps } from "./types";

export * from "./types";

const EventChip = ({ occurrence, onSelect }: EventChipProps) => {
  const { color } = occurrence.category;
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      type="button"
      className="cy-chip w-full text-left"
      style={{
        borderLeftColor: catColorVar(color),
        boxShadow: `-1px 0 8px color-mix(in srgb, ${catGlowVar(color)} 40%, transparent)`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
    >
      {occurrence.isRecurring && <span>↻</span>}
      <span className="truncate">{occurrence.title}</span>
      <span className="cy-mono ml-auto pl-1">{formatSignedCompact(delta)}</span>
    </button>
  );
};

export default EventChip;
