import { useDroppable } from "@dnd-kit/core";
import DraggableEventChip from "@/components/DraggableEventChip";
import DayEventsPopover from "@/components/DayEventsPopover";
import { CyberFrame } from "@/components/CyberFrame";
import { formatCurrency } from "@/utils/formatCurrency";
import { catColorVar, catGlowVar } from "@/utils/categoryColor";

import { MAX_VISIBLE_CHIPS, MAX_COMPACT_DOTS } from "./consts";
import type { DayCellProps } from "./types";

export * from "./consts";
export * from "./types";

const DayCell = ({
  cell,
  isToday,
  compact = false,
  isSelected = false,
  tabIndex,
  occurrences,
  balance,
  dateLabel,
  onSelectDate,
  onSelectOccurrence,
  maxVisibleChips = MAX_VISIBLE_CHIPS,
}: DayCellProps) => {
  // Compact cells are not drop targets: drag-and-drop is desktop-only.
  const { setNodeRef, isOver } = useDroppable({
    id: cell.iso,
    disabled: compact,
  });
  const visible = occurrences.slice(0, maxVisibleChips);
  const overflow = occurrences.slice(maxVisibleChips);
  const dots = occurrences.slice(0, MAX_COMPACT_DOTS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");
  if (isSelected) classes.push("selected");
  if (isOver) classes.push("drop");
  const frameColor = isToday
    ? "var(--cy-yellow)"
    : isSelected
      ? "var(--cy-cyan)"
      : "var(--cy-line)";

  // "+N more" implies something is shown above it; with zero visible chips
  // the trigger is the only signal, so it reads as a count instead.
  const overflowLabel =
    visible.length > 0
      ? `+${overflow.length} more`
      : `${overflow.length} event${overflow.length === 1 ? "" : "s"}`;

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
      <CyberFrame chamfer={12} corners={["tr"]} color={frameColor} />
      <span className="cy-cell-num">
        {String(cell.dayOfMonth).padStart(2, "0")}
      </span>
      {compact ? (
        <div className="flex flex-wrap items-center gap-1">
          {dots.map((o) => (
            <span
              key={`${o.eventId}:${o.date}`}
              title={o.title}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: catColorVar(o.category.color),
                boxShadow: `0 0 6px ${catGlowVar(o.category.color)}`,
              }}
            />
          ))}
          {occurrences.length > MAX_COMPACT_DOTS && (
            <span className="cy-mono text-[9px] leading-none text-[color:var(--cy-cyan)]">
              +
            </span>
          )}
        </div>
      ) : (
        <>
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
                label={overflowLabel}
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
        </>
      )}
    </div>
  );
};

export default DayCell;
