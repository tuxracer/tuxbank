import type { Category, CategoryColor } from "@/types";
import { NEON_HEX } from "@/types";
import { formatCurrency } from "@/utils/formatCurrency";

type CalendarToolbarProps = {
  monthLabel: string;
  recordCount: number;
  endBalance: number;
  categories: readonly Category[];
  activeColors: Set<CategoryColor>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleColor: (color: CategoryColor) => void;
  onNewEvent: () => void;
};

const CalendarToolbar = ({
  monthLabel,
  recordCount,
  endBalance,
  categories,
  activeColors,
  onPrev,
  onNext,
  onToday,
  onToggleColor,
  onNewEvent,
}: CalendarToolbarProps) => (
  <header className="flex flex-col gap-3">
    <div className="cy-hud flex items-center justify-between">
      <span>
        {"SYS"}
        <span className="dim">{"//"}</span>
        {"CAL.EXE  "}
        <span className="on">{"◢ ONLINE"}</span>
      </span>
      <span className="dim">
        LOCAL_DB::INDEXEDDB&nbsp; ◢ {recordCount} RECORDS&nbsp; BAL ◢{" "}
        {formatCurrency(endBalance)}
      </span>
    </div>

    <div className="cy-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Previous month"
          className="cy-nav grid h-8 w-8 place-items-center"
          onClick={onPrev}
        >
          ‹
        </button>
        <span className="cy-month text-2xl uppercase">{monthLabel}</span>
        <button
          type="button"
          aria-label="Next month"
          className="cy-nav grid h-8 w-8 place-items-center"
          onClick={onNext}
        >
          ›
        </button>
        <button
          type="button"
          className="cy-btn px-3 py-1.5 text-xs"
          onClick={onToday}
        >
          ▸ Today
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Filter by category"
        >
          {categories.map((c) => {
            const active = activeColors.has(c.color);
            const hex = NEON_HEX[c.color];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                title={c.name}
                onClick={() => onToggleColor(c.color)}
                className="cy-mono flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
                style={{ borderColor: hex, opacity: active ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: hex,
                    boxShadow: `0 0 8px ${hex}`,
                  }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
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

export default CalendarToolbar;
