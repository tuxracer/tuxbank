"use client";

import { useRef, useState } from "react";
import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import DayCell from "@/components/DayCell";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLS = 7;
const dayLabeler = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

type MonthGridProps = {
  cells: DateCell[];
  todayISO: string;
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate?: Record<string, number>;
  gridLabel?: string;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};

const initialActiveIndex = (cells: DateCell[], todayISO: string): number => {
  const today = cells.findIndex((c) => c.iso === todayISO);
  if (today >= 0) return today;
  const firstInMonth = cells.findIndex((c) => c.inMonth);
  return firstInMonth >= 0 ? firstInMonth : 0;
};

const MonthGrid = ({
  cells,
  todayISO,
  occurrencesByDate,
  balancesByDate = {},
  gridLabel,
  onSelectDate,
  onSelectOccurrence,
}: MonthGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  // Track which grid we last computed the active index for (keyed by first cell ISO).
  // When cells change (month nav), reset activeIndex during the current render —
  // this is the React-recommended "derived state reset" pattern that avoids effects.
  const gridKeyRef = useRef<string>(cells[0]?.iso ?? "");
  const [activeIndex, setActiveIndex] = useState(() =>
    initialActiveIndex(cells, todayISO),
  );

  const currentGridKey = cells[0]?.iso ?? "";
  let resolvedActiveIndex = activeIndex;
  if (currentGridKey !== gridKeyRef.current) {
    gridKeyRef.current = currentGridKey;
    resolvedActiveIndex = initialActiveIndex(cells, todayISO);
    setActiveIndex(resolvedActiveIndex);
  }

  const moveFocus = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(cells.length - 1, nextIndex));
    setActiveIndex(clamped);
    const target = gridRef.current?.querySelector<HTMLElement>(
      `[data-iso="${cells[clamped].iso}"]`,
    );
    target?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown"
            ? COLS
            : e.key === "ArrowUp"
              ? -COLS
              : 0;
    if (delta === 0) return;
    e.preventDefault();
    moveFocus(resolvedActiveIndex + delta);
  };

  return (
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
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5"
        role="grid"
        aria-label={gridLabel}
        onKeyDown={onKeyDown}
      >
        {cells.map((cell, index) => (
          <DayCell
            key={cell.iso}
            cell={cell}
            isToday={cell.iso === todayISO}
            tabIndex={index === resolvedActiveIndex ? 0 : -1}
            occurrences={occurrencesByDate[cell.iso] ?? []}
            balance={balancesByDate[cell.iso] ?? 0}
            dateLabel={dayLabeler.format(cell.date)}
            onSelectDate={onSelectDate}
            onSelectOccurrence={onSelectOccurrence}
          />
        ))}
      </div>
    </div>
  );
};

export default MonthGrid;
