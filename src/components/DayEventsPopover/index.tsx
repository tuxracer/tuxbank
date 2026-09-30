import { useCallback, useMemo, useState } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import DraggableEventChip from "@/components/DraggableEventChip";
import { cn } from "@/lib/utils";

import type { DayEventsPopoverProps, OverflowChipsProps } from "./types";

export * from "./types";

// The popover's body, mounted only while the popover is open. It lists only
// the chips the cell hid, never the ones still visible above the trigger, so
// no occurrence is ever drawn (or draggable) twice on the same day. That is what
// scopes the drag monitor: only an open popover has anything to react to, so
// the closed ones (up to one per day cell) register no listener.
const OverflowChips = ({
  occurrences,
  onSelect,
  onDragStart,
  onDragEnd,
}: OverflowChipsProps) => {
  // useDndMonitor resubscribes whenever the listener object changes identity.
  const listener = useMemo(
    () => ({ onDragStart, onDragEnd, onDragCancel: onDragEnd }),
    [onDragStart, onDragEnd],
  );
  useDndMonitor(listener);
  return (
    <div className="flex flex-col gap-1">
      {occurrences.map((o) => (
        <DraggableEventChip
          key={`${o.eventId}:${o.date}`}
          occurrence={o}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

const DayEventsPopover = ({
  label,
  occurrences,
  onSelect,
}: DayEventsPopoverProps) => {
  const [open, setOpen] = useState(false);
  // A chip dragged out of the popover has to reach the day cells underneath,
  // so the popover gets out of the way the moment the drag starts. It is only
  // hidden, not closed, until the drop, so the source chip stays mounted for
  // the whole drag the way a cell's chip does. The flag outlives the drop so
  // the popover stays hidden through its close animation, and clears on the
  // next open.
  const [draggedOut, setDraggedOut] = useState(false);
  const hideForDrag = useCallback(() => setDraggedOut(true), []);
  const closeAfterDrag = useCallback(() => setOpen(false), []);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraggedOut(false);
      }}
    >
      <PopoverTrigger asChild>
        {/* h-auto/p-0/border-0 keep the trigger's text-sized box: its height is
            mirrored in MonthGrid's MORE_LINE_HEIGHT_PX chip-capacity constant. */}
        <Button
          type="button"
          variant="ghost"
          className="mt-1 h-auto border-0 p-0 text-[10px] font-bold text-[color:var(--cy-cyan)]"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "cy-dialog w-56 border-0 p-3",
          draggedOut && "pointer-events-none opacity-0",
        )}
      >
        <OverflowChips
          occurrences={occurrences}
          onSelect={onSelect}
          onDragStart={hideForDrag}
          onDragEnd={closeAfterDrag}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DayEventsPopover;
