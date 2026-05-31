import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import EventChip from "@/components/EventChip";
import DayEventsPopover from "@/components/DayEventsPopover";

const MAX_VISIBLE_CHIPS = 3;

type DayCellProps = {
  cell: DateCell;
  isToday: boolean;
  occurrences: Occurrence[];
  dateLabel: string;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};

const DayCell = ({
  cell,
  isToday,
  occurrences,
  dateLabel,
  onSelectDate,
  onSelectOccurrence,
}: DayCellProps) => {
  const visible = occurrences.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = occurrences.slice(MAX_VISIBLE_CHIPS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");

  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-label={dateLabel}
      className={classes.join(" ")}
      onClick={() => onSelectDate(cell.iso)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelectDate(cell.iso);
      }}
    >
      <span className="cy-cell-num">
        {String(cell.dayOfMonth).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-1 overflow-hidden">
        {visible.map((o) => (
          <EventChip
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
    </div>
  );
};

export default DayCell;
