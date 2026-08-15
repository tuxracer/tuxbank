import { useDroppable } from "@dnd-kit/core";
import DraggableEventChip from "@/components/DraggableEventChip";
import DayEventsPopover from "@/components/DayEventsPopover";
import { formatCurrency } from "@/utils/formatCurrency";
import { catColorVar } from "@/utils/categoryColor";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";

import { MAX_COMPACT_DOTS } from "./consts";
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
  maxVisibleChips,
}: DayCellProps) => {
  const { currency } = useDisplayPreferences();
  // Compact cells are not drop targets: drag-and-drop is desktop-only.
  const { setNodeRef, isOver } = useDroppable({
    id: cell.iso,
    disabled: compact,
  });
  // No cap: a cell shows every chip that fits its measured row height. Until
  // MonthGrid has a measurement to give (first paint, and always under jsdom)
  // there is no limit to apply, so render them all and let the row height
  // narrow it on the next frame.
  const limit = maxVisibleChips ?? occurrences.length;
  const visible = occurrences.slice(0, limit);
  const overflow = occurrences.slice(limit);
  const dots = occurrences.slice(0, MAX_COMPACT_DOTS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");
  if (isSelected) classes.push("selected");
  if (isOver) classes.push("drop");

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
        // Enter on a focusable child (event chip, overflow trigger) bubbles
        // here; only the cell's own focus should select the date.
        if (e.key === "Enter" && e.target === e.currentTarget) {
          onSelectDate(cell.iso);
        }
      }}
    >
      <span className="cy-cell-num">{cell.dayOfMonth}</span>
      {compact ? (
        <div className="flex flex-wrap items-center gap-1">
          {dots.map((o) => (
            <span
              key={`${o.eventId}:${o.date}`}
              title={o.title}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: catColorVar(o.category.color) }}
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
            {formatCurrency(balance, currency)}
          </span>
        </>
      )}
    </div>
  );
};

export default DayCell;
