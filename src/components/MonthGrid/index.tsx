import { useEffect, useRef, useState } from "react";
import { inMonthWeekCount, type DateCell } from "@/lib/dateGrid";
import DayCell from "@/components/DayCell";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";

import {
  WEEKDAYS,
  COLS,
  ROW_GAP_PX,
  CHIP_AREA_OVERHEAD_PX,
  CHIP_HEIGHT_PX,
  CHIP_GAP_PX,
  MORE_LINE_HEIGHT_PX,
} from "./consts";
import type { MonthGridProps } from "./types";

export * from "./consts";
export * from "./types";

const dayLabeler = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const initialActiveIndex = (cells: DateCell[], todayISO: string): number => {
  const today = cells.findIndex((c) => c.iso === todayISO);
  if (today >= 0) return today;
  const firstInMonth = cells.findIndex((c) => c.inMonth);
  return firstInMonth >= 0 ? firstInMonth : 0;
};

const chipsThatFit = (px: number): number =>
  px < CHIP_HEIGHT_PX
    ? 0
    : 1 + Math.floor((px - CHIP_HEIGHT_PX) / (CHIP_HEIGHT_PX + CHIP_GAP_PX));

/**
 * How many whole event chips a day cell should render at the given row
 * height. There is no fixed maximum: the answer is whatever the row can hold,
 * so a taller window shows more chips rather than collapsing them behind a
 * trigger it has the space to avoid. Reserves the "+N more" line only when the
 * occurrences genuinely exceed what fits, so the trigger itself never clips.
 */
export const chipCapacity = (
  rowHeightPx: number,
  occurrenceCount: number,
): number => {
  const available = rowHeightPx - CHIP_AREA_OVERHEAD_PX;
  const fit = chipsThatFit(available);
  if (occurrenceCount <= fit) return fit;
  return chipsThatFit(available - MORE_LINE_HEIGHT_PX);
};

const MonthGrid = ({
  cells,
  todayISO,
  compact = false,
  selectedISO,
  onSwipeLeft,
  onSwipeRight,
  occurrencesByDate,
  balancesByDate = {},
  onSelectDate,
  onSelectOccurrence,
}: MonthGridProps) => {
  // Compact (mobile) always fills the full 6-week grid; desktop renders only
  // the weeks the month spans (4-6) so day cells get more height. cells is the
  // full 6-week window from buildMonthGrid either way.
  const rows = compact ? cells.length / COLS : inMonthWeekCount(cells);
  const visibleCells = compact ? cells : cells.slice(0, rows * COLS);

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Track which grid we last computed the active index for (keyed by first cell ISO).
  // When cells change (month nav), reset activeIndex during the current render —
  // this is the React-recommended "derived state reset" pattern that avoids effects.
  const gridKeyRef = useRef<string>(cells[0]?.iso ?? "");
  const [activeIndex, setActiveIndex] = useState(() =>
    initialActiveIndex(visibleCells, todayISO),
  );

  // Swipe-to-change-month (compact mode). A one-shot 180ms directional slide is
  // the month-change feedback, cleared on animationend.
  const [shift, setShift] = useState<"next" | "prev" | null>(null);
  const swipeEnabled = Boolean(onSwipeLeft ?? onSwipeRight);
  const swipeHandlers = useSwipeNavigation({
    enabled: swipeEnabled,
    onSwipeLeft: () => {
      setShift("next");
      onSwipeLeft?.();
    },
    onSwipeRight: () => {
      setShift("prev");
      onSwipeRight?.();
    },
  });

  // Clear the slide class when the animation ends. Use a native listener so
  // this fires in jsdom (React's onAnimationEnd synthetic event does not fire
  // there). The animationName guard prevents unrelated child animations that
  // bubble here from prematurely clearing the flag.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onAnimationEnd = (e: AnimationEvent) => {
      if (
        e.animationName === "cy-shift-next" ||
        e.animationName === "cy-shift-prev"
      ) {
        setShift(null);
      }
    };
    el.addEventListener("animationend", onAnimationEnd);
    return () => el.removeEventListener("animationend", onAnimationEnd);
  }, []);

  // Shared row height for adaptive chip capacity: every row is an equal 1fr
  // track, so one grid-level measurement serves every cell. Re-runs when the
  // row count changes (month nav, or desktop/compact) since that resizes rows
  // without a container resize. Stays null in jsdom (the stub never fires),
  // which leaves cells unlimited.
  const [rowHeightPx, setRowHeightPx] = useState<number | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setRowHeightPx((el.clientHeight - (rows - 1) * ROW_GAP_PX) / rows);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows]);

  const currentGridKey = cells[0]?.iso ?? "";
  let resolvedActiveIndex = activeIndex;
  if (currentGridKey !== gridKeyRef.current) {
    gridKeyRef.current = currentGridKey;
    resolvedActiveIndex = initialActiveIndex(visibleCells, todayISO);
    setActiveIndex(resolvedActiveIndex);
  }

  const moveFocus = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(visibleCells.length - 1, nextIndex));
    setActiveIndex(clamped);
    const target = gridRef.current?.querySelector<HTMLElement>(
      `[data-iso="${visibleCells[clamped].iso}"]`,
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
    <div
      ref={rootRef}
      className={`flex min-h-0 flex-1 flex-col gap-1.5${swipeEnabled ? " touch-pan-y" : ""}${shift ? ` cy-shift-${shift}` : ""}`}
      {...swipeHandlers}
    >
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
        className="grid min-h-0 flex-1 grid-cols-7 gap-1.5"
        style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        role="grid"
        onKeyDown={onKeyDown}
      >
        {visibleCells.map((cell, index) => {
          const occurrences = occurrencesByDate[cell.iso] ?? [];
          return (
            <DayCell
              key={cell.iso}
              cell={cell}
              isToday={cell.iso === todayISO}
              compact={compact}
              isSelected={compact && cell.iso === selectedISO}
              tabIndex={index === resolvedActiveIndex ? 0 : -1}
              occurrences={occurrences}
              balance={balancesByDate[cell.iso] ?? 0}
              dateLabel={dayLabeler.format(cell.date)}
              maxVisibleChips={
                rowHeightPx === null
                  ? undefined
                  : chipCapacity(rowHeightPx, occurrences.length)
              }
              onSelectDate={onSelectDate}
              onSelectOccurrence={onSelectOccurrence}
            />
          );
        })}
      </div>
    </div>
  );
};

export default MonthGrid;
