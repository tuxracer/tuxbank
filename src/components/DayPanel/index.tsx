import { parseISO } from "date-fns";
import EventChip from "@/components/EventChip";
import { formatCurrency } from "@/utils/formatCurrency";

import type { DayPanelProps } from "./types";

export * from "./types";

const dateLabeler = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Selected-day detail shown below the month grid in compact mode. */
const DayPanel = ({
  dateISO,
  occurrences,
  balance,
  onSelectOccurrence,
  onAddEvent,
}: DayPanelProps) => (
  // cy-ink: the panel is part of the calendar instrument, so it pins the
  // console ink instead of following the page theme.
  <section className="cy-ink cy-toolbar relative flex flex-col gap-2 px-3 py-2.5">
    <div className="flex items-center justify-between gap-2">
      <p className="cy-mono text-[10px] uppercase tracking-widest text-[color:var(--cy-cyan)]">
        {dateLabeler.format(parseISO(dateISO))}
      </p>
      <span className={`cy-balance ${balance < 0 ? "cy-balance-neg" : ""}`}>
        {formatCurrency(balance)}
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
    <button
      type="button"
      className="cy-cta self-end px-4 py-1.5 text-xs"
      onClick={onAddEvent}
    >
      + Add
    </button>
  </section>
);

export default DayPanel;
