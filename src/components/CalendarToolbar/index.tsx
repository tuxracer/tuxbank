import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
  // The buttons in this bar are shadcn <Button>s and the month/year pickers are
  // <NativeSelect>s, so the 32px box comes from the primitive either way. Only
  // the type size flexes with the breakpoint.
  const selectClasses = compact ? "cy-btn text-xs" : "cy-btn text-sm";

  const closeMenuAnd = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const navControls = (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="Previous month"
        className="cy-nav"
        onClick={onPrev}
      >
        ‹
      </Button>
      <NativeSelect
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
      </NativeSelect>
      <NativeSelect
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
      </NativeSelect>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="Next month"
        className="cy-nav"
        onClick={onNext}
      >
        ›
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={compact ? "cy-btn px-2 text-xs" : "cy-btn px-3 text-xs"}
        onClick={onToday}
      >
        ▸ Today
      </Button>
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
          <Button
            key={c.id}
            type="button"
            variant="ghost"
            title={c.name}
            onClick={() => onToggleCategory(c.id)}
            className="cy-mono gap-1.5 border px-2 text-[10px] uppercase"
            style={{ borderColor: colorVar, opacity: active ? 1 : 0.35 }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colorVar }}
            />
            {c.name}
          </Button>
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
                <Button
                  type="button"
                  variant="ghost"
                  title="More actions"
                  className="cy-btn ml-auto gap-1.5 px-2 text-xs"
                >
                  ☰
                  <SyncAttentionDot />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="cy-dialog w-48 border-0 p-2"
              >
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="cy-btn justify-start gap-2 px-3 text-xs"
                    onClick={closeMenuAnd(() => onSync?.())}
                  >
                    ◢ SYNC
                    <SyncAttentionBadge />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="cy-btn justify-start px-3 text-xs"
                    onClick={closeMenuAnd(onManageData)}
                  >
                    ◢ DATA
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="cy-btn justify-start px-3 text-xs"
                    onClick={closeMenuAnd(onManageCategories)}
                  >
                    ◢ CATEGORIES
                  </Button>
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
          <Button
            type="button"
            variant="ghost"
            className="cy-btn gap-2 px-3 text-xs"
            onClick={onSync}
          >
            ◢ SYNC
            <SyncAttentionBadge />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="cy-btn px-3 text-xs"
            onClick={onManageData}
          >
            ◢ DATA
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="cy-btn px-3 text-xs"
            onClick={onManageCategories}
          >
            ◢ CATEGORIES
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="cy-cta px-5 text-sm"
            onClick={onNewEvent}
          >
            + New Event
          </Button>
        </div>
      </div>
    </header>
  );
};

export default CalendarToolbar;
