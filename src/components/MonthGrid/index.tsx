import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import DayCell from "@/components/DayCell";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabeler = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

type MonthGridProps = {
  cells: DateCell[];
  todayISO: string;
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
  gridLabel?: string;
};

const MonthGrid = ({
  cells,
  todayISO,
  occurrencesByDate,
  onSelectDate,
  onSelectOccurrence,
  gridLabel,
}: MonthGridProps) => (
  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
    <div className="grid grid-cols-7 gap-1.5" role="row">
      {WEEKDAYS.map((d) => (
        <div
          key={d}
          className="cy-weekhead px-1 text-[10px]"
          role="columnheader"
        >
          {d}
        </div>
      ))}
    </div>
    <div
      className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5"
      role="grid"
      aria-label={gridLabel}
    >
      {cells.map((cell) => (
        <DayCell
          key={cell.iso}
          cell={cell}
          isToday={cell.iso === todayISO}
          occurrences={occurrencesByDate[cell.iso] ?? []}
          dateLabel={dayLabeler.format(cell.date)}
          onSelectDate={onSelectDate}
          onSelectOccurrence={onSelectOccurrence}
        />
      ))}
    </div>
  </div>
);

export default MonthGrid;
