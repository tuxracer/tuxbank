import { catColorVar, catGlowVar } from "@/utils/categoryColor";
import { CyberFrame } from "@/components/CyberFrame";
import { CyControlFrame } from "@/components/CyControlFrame";
import { formatCurrency } from "@/utils/formatCurrency";
import { MONTH_NAMES } from "./consts";

import type { CalendarToolbarProps } from "./types";

export * from "./types";
export * from "./consts";

const CalendarToolbar = ({
  recordCount,
  endBalance,
  selectedYear,
  selectedMonth,
  minYear,
  maxYear,
  usedCategories,
  activeCategoryIds,
  onSelectMonth,
  onSelectYear,
  onPrev,
  onNext,
  onToday,
  onToggleCategory,
  onManageCategories,
  onManageData,
  onNewEvent,
}: CalendarToolbarProps) => {
  // Years descending from maxYear down to minYear (inclusive).
  const yearOptions = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => maxYear - i,
  );

  return (
    <header className="flex flex-col gap-3">
      <div className="cy-hud flex items-center justify-between">
        <span>
          {"SYS"}
          <span className="dim">{"//"}</span>
          {"CAL.EXE  "}
          <span className="on">{"◢ ONLINE"}</span>
        </span>
        <span className="dim">
          LOCAL_DB::INDEXEDDB&nbsp; ◢ {recordCount} RECORDS&nbsp; BAL ◢{" "}
          {formatCurrency(endBalance)}
        </span>
      </div>

      <div className="cy-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <CyberFrame chamfer={18} color="var(--cy-line)" />
        <div className="flex items-center gap-3">
          <CyControlFrame variant="nav">
            <button
              type="button"
              title="Previous month"
              className="cy-nav grid h-8 w-8 place-items-center"
              onClick={onPrev}
            >
              ‹
            </button>
          </CyControlFrame>
          <CyControlFrame>
            <select
              title="Month"
              className="cy-btn px-3 py-1.5 text-sm uppercase"
              value={selectedMonth}
              onChange={(e) => onSelectMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </CyControlFrame>
          <CyControlFrame>
            <select
              title="Year"
              className="cy-btn px-3 py-1.5 text-sm"
              value={selectedYear}
              onChange={(e) => onSelectYear(Number(e.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </CyControlFrame>
          <CyControlFrame variant="nav">
            <button
              type="button"
              title="Next month"
              className="cy-nav grid h-8 w-8 place-items-center"
              onClick={onNext}
            >
              ›
            </button>
          </CyControlFrame>
          <CyControlFrame>
            <button
              type="button"
              className="cy-btn px-3 py-1.5 text-xs"
              onClick={onToday}
            >
              ▸ Today
            </button>
          </CyControlFrame>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" role="group">
            {usedCategories.map((c) => {
              const active = activeCategoryIds.has(c.id);
              const colorVar = catColorVar(c.color);
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  onClick={() => onToggleCategory(c.id)}
                  className="cy-mono flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
                  style={{ borderColor: colorVar, opacity: active ? 1 : 0.35 }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      background: colorVar,
                      boxShadow: `0 0 8px ${catGlowVar(c.color)}`,
                    }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
          <CyControlFrame>
            <button
              type="button"
              className="cy-btn px-3 py-1.5 text-xs"
              onClick={onManageData}
            >
              ◢ DATA
            </button>
          </CyControlFrame>
          <CyControlFrame>
            <button
              type="button"
              className="cy-btn px-3 py-1.5 text-xs"
              onClick={onManageCategories}
            >
              ◢ CATEGORIES
            </button>
          </CyControlFrame>
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
