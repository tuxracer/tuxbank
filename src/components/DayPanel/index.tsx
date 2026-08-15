import { parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import EventChip from "@/components/EventChip";
import { formatCurrency } from "@/utils/formatCurrency";
import { fullDateLabel } from "@/utils/fullDateLabel";
import { RUNTIME_LOCALE } from "@/utils/runtimeLocale";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";

import type { DayPanelProps } from "./types";

export * from "./types";

/** Selected-day detail shown below the month grid in compact mode. */
const DayPanel = ({
  dateISO,
  occurrences,
  balance,
  onSelectOccurrence,
  onAddEvent,
}: DayPanelProps) => {
  const { currency } = useDisplayPreferences();
  return (
    <section className="cy-toolbar relative flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p
          className="cy-mono text-[10px] uppercase tracking-widest text-[color:var(--cy-cyan)]"
          lang={RUNTIME_LOCALE}
        >
          {fullDateLabel(parseISO(dateISO))}
        </p>
        <span className={`cy-balance ${balance < 0 ? "cy-balance-neg" : ""}`}>
          {formatCurrency(balance, currency)}
        </span>
      </div>
      {/* Bounded height so a busy day scrolls inside the panel instead of
        pushing the grid off-screen. */}
      <div className="flex max-h-[30dvh] flex-col gap-1 overflow-y-auto">
        {occurrences.length === 0 ? (
          <p className="cy-mono text-[10px] uppercase tracking-widest text-[color:var(--cy-muted)]">
            No events
          </p>
        ) : (
          occurrences.map((o) => (
            <EventChip
              key={`${o.eventId}:${o.date}`}
              occurrence={o}
              onSelect={onSelectOccurrence}
            />
          ))
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="cy-cta self-end px-4 text-xs"
        onClick={onAddEvent}
      >
        + Add
      </Button>
    </section>
  );
};

export default DayPanel;
