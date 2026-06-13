import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EventChip from "@/components/EventChip";
import { CyberFrame } from "@/components/CyberFrame";

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
      <button
        type="button"
        className="cy-mono mt-1 text-[10px] tracking-widest text-[color:var(--cy-cyan)]"
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </button>
    </PopoverTrigger>
    <PopoverContent className="cy-dialog w-56 border-0 p-3">
      <CyberFrame />
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
