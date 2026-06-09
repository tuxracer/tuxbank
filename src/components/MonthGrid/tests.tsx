import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Occurrence } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import MonthGrid from "./index";

const occ: Occurrence = {
  eventId: "e1",
  date: "2026-05-14",
  title: "Design review",
  category: {
    id: "work",
    name: "Work",
    color: "cyan",
    updatedAt: new Date().toISOString(),
  },
  amount: 0,
  direction: "deposit",
  isRecurring: false,
};

describe("MonthGrid", () => {
  it("renders weekday headers and a chip, and reports occurrence clicks", async () => {
    const onSelectOccurrence = vi.fn();
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{ "2026-05-14": [occ] }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={onSelectOccurrence}
      />,
    );

    expect(screen.getByText("Sun")).toBeInTheDocument();
    const chip = screen.getByTitle("Design review");
    await userEvent.click(chip);
    expect(onSelectOccurrence).toHaveBeenCalledWith(occ);
  });

  it("moves day focus with arrow keys (roving tabindex)", async () => {
    const { container } = render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    const cellByIso = (iso: string) =>
      container.querySelector(`[data-iso="${iso}"]`);
    await userEvent.tab();
    expect(document.activeElement).toBe(cellByIso("2026-05-14"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cellByIso("2026-05-15"));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cellByIso("2026-05-22"));
  });

  it("renders the running balance for a day when provided", () => {
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        balancesByDate={{ "2026-05-14": 4200 }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(screen.getByText("$4,200.00")).toBeInTheDocument();
  });

  it("shows at most 3 chips and collapses the rest into +N more", () => {
    const occ = (i: number): Occurrence => ({
      eventId: `e${i}`,
      date: "2026-05-14",
      title: `Event ${i}`,
      category: {
        id: "work",
        name: "Work",
        color: "cyan",
        updatedAt: new Date().toISOString(),
      },
      amount: 0,
      direction: "deposit",
      isRecurring: false,
    });
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{
          "2026-05-14": [occ(1), occ(2), occ(3), occ(4), occ(5)],
        }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByTitle("Event 1")).toBeInTheDocument();
    expect(screen.queryByTitle("Event 4")).not.toBeInTheDocument();
  });

  it("colors a negative balance with the negative sign class", () => {
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        balancesByDate={{ "2026-05-14": -2000, "2026-05-15": 500 }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(screen.getByText("-$2,000.00")).toHaveClass("cy-balance-neg");
    expect(screen.getByText("$500.00")).not.toHaveClass("cy-balance-neg");
  });
});
