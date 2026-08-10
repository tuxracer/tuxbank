import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { catColorVar } from "@/utils/categoryColor";
import {
  SyncAttentionBadge,
  SyncAttentionDot,
} from "@/components/SyncAttentionBadge";
import { MONTH_NAMES } from "./consts";

import type { CalendarToolbarProps } from "./types";

export * from "./types";
export * from "./consts";

const CalendarToolbar = ({
  selectedYear,
  selectedMonth,
  minYear,
  maxYear,
  usedCategories,
  activeCategoryIds,
  compact = false,
  onSelectMonth,
  onSelectYear,
  onPrev,
  onNext,
  onToday,
  onToggleCategory,
  onManageCategories,
  onManageData,
  onSync,
  onNewEvent,
}: CalendarToolbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  // Years descending from maxYear down to minYear (inclusive).
  const yearOptions = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => maxYear - i,
  );
  const selectClasses = compact
    ? "cy-btn px-2 py-1 text-xs"
    : "cy-btn px-3 py-1.5 text-sm";

  const closeMenuAnd = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const navControls = (
    <>
      <button
        type="button"
        title="Previous month"
        className="cy-nav grid h-8 w-8 place-items-center"
        onClick={onPrev}
      >
        ‹
      </button>
      <select
        title="Month"
        className={`${selectClasses} uppercase`}
        value={selectedMonth}
        onChange={(e) => onSelectMonth(Number(e.target.value))}
      >
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>
      <select
        title="Year"
        className={selectClasses}
        value={selectedYear}
        onChange={(e) => onSelectYear(Number(e.target.value))}
      >
        {yearOptions.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Next month"
        className="cy-nav grid h-8 w-8 place-items-center"
        onClick={onNext}
      >
        ›
      </button>
      <button
        type="button"
        className={
          compact ? "cy-btn px-2 py-1 text-xs" : "cy-btn px-3 py-1.5 text-xs"
        }
        onClick={onToday}
      >
        ▸ Today
      </button>
    </>
  );

  const legend = (
    <div
      className={`flex items-center gap-1.5 ${compact ? "overflow-x-auto" : ""}`}
      role="group"
    >
      {usedCategories.map((c) => {
        const active = activeCategoryIds.has(c.id);
        const colorVar = catColorVar(c.color);
        return (
          <button
            key={c.id}
            type="button"
            title={c.name}
            onClick={() => onToggleCategory(c.id)}
            className="cy-mono flex shrink-0 items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
            style={{ borderColor: colorVar, opacity: active ? 1 : 0.35 }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colorVar }}
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <header className="flex flex-col gap-2">
        <div className="cy-toolbar flex flex-col gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {navControls}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="More actions"
                  className="cy-btn ml-auto flex items-center gap-1.5 px-2 py-1 text-xs"
                >
                  ☰
                  <SyncAttentionDot />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="cy-dialog w-48 border-0 p-2"
              >
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="cy-btn flex items-center gap-2 px-3 py-2 text-left text-xs"
                    onClick={closeMenuAnd(() => onSync?.())}
                  >
                    ◢ SYNC
                    <SyncAttentionBadge />
                  </button>
                  <button
                    type="button"
                    className="cy-btn px-3 py-2 text-left text-xs"
                    onClick={closeMenuAnd(onManageData)}
                  >
                    ◢ DATA
                  </button>
                  <button
                    type="button"
                    className="cy-btn px-3 py-2 text-left text-xs"
                    onClick={closeMenuAnd(onManageCategories)}
                  >
                    ◢ CATEGORIES
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {legend}
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-3">
      <div className="cy-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">{navControls}</div>

        <div className="flex items-center gap-3">
          {legend}
          <button
            type="button"
            className="cy-btn flex items-center gap-2 px-3 py-1.5 text-xs"
            onClick={onSync}
          >
            ◢ SYNC
            <SyncAttentionBadge />
          </button>
          <button
            type="button"
            className="cy-btn px-3 py-1.5 text-xs"
            onClick={onManageData}
          >
            ◢ DATA
          </button>
          <button
            type="button"
            className="cy-btn px-3 py-1.5 text-xs"
            onClick={onManageCategories}
          >
            ◢ CATEGORIES
          </button>
          <button
            type="button"
            className="cy-cta px-5 py-2 text-sm"
            onClick={onNewEvent}
          >
            + New Event
          </button>
        </div>
      </div>
    </header>
  );
};

export default CalendarToolbar;
