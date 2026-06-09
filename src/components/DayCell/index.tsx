import { useDroppable } from "@dnd-kit/core";
import DraggableEventChip from "@/components/DraggableEventChip";
import DayEventsPopover from "@/components/DayEventsPopover";
import { CyberFrame } from "@/components/CyberFrame";
import { formatCurrency } from "@/utils/formatCurrency";

import { MAX_VISIBLE_CHIPS } from "./consts";
import type { DayCellProps } from "./types";

export * from "./consts";
export * from "./types";

const DayCell = ({
  cell,
  isToday,
  tabIndex,
  occurrences,
  balance,
  dateLabel,
  onSelectDate,
  onSelectOccurrence,
}: DayCellProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: cell.iso });
  const visible = occurrences.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = occurrences.slice(MAX_VISIBLE_CHIPS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");
  if (isOver) classes.push("drop");

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={tabIndex}
      data-iso={cell.iso}
      className={classes.join(" ")}
      onClick={() => onSelectDate(cell.iso)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelectDate(cell.iso);
      }}
    >
      <CyberFrame
        chamfer={12}
        corners={["tr"]}
        color={isToday ? "var(--cy-yellow)" : "var(--cy-line)"}
      />
      <span className="cy-cell-num">
        {String(cell.dayOfMonth).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-1 overflow-hidden">
        {visible.map((o) => (
          <DraggableEventChip
            key={`${o.eventId}:${o.date}`}
            occurrence={o}
            onSelect={onSelectOccurrence}
          />
        ))}
        {overflow.length > 0 && (
          <DayEventsPopover
            label={`+${overflow.length} more`}
            dateLabel={dateLabel}
            occurrences={occurrences}
            onSelect={onSelectOccurrence}
          />
        )}
      </div>
      <span
        className={`cy-balance mt-auto self-end ${balance < 0 ? "cy-balance-neg" : ""}`}
      >
        {formatCurrency(balance)}
      </span>
    </div>
  );
};

export default DayCell;
