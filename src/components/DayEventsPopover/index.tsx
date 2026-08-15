import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import EventChip from "@/components/EventChip";

import type { DayEventsPopoverProps } from "./types";

export * from "./types";

const DayEventsPopover = ({
  label,
  dateLabel,
  occurrences,
  onSelect,
}: DayEventsPopoverProps) => (
  <Popover>
    <PopoverTrigger asChild>
      {/* h-auto/p-0/border-0 keep the trigger's text-sized box: its height is
          mirrored in MonthGrid's MORE_LINE_HEIGHT_PX chip-capacity constant. */}
      <Button
        type="button"
        variant="ghost"
        className="cy-mono mt-1 h-auto border-0 p-0 text-[10px] font-normal tracking-widest text-[color:var(--cy-cyan)]"
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="cy-dialog w-56 border-0 p-3">
      <p className="cy-mono mb-2 text-[10px] uppercase tracking-widest text-[color:var(--cy-cyan)]">
        {dateLabel}
      </p>
      <div className="flex flex-col gap-1">
        {occurrences.map((o) => (
          <EventChip
            key={`${o.eventId}:${o.date}`}
            occurrence={o}
            onSelect={onSelect}
          />
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export default DayEventsPopover;
