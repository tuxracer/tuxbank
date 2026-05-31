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
  category: { id: "work", name: "Work", color: "cyan" },
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
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Thursday, May 14"),
    );
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByLabelText("Friday, May 15"),
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByLabelText("Friday, May 22"),
    );
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
      category: { id: "work", name: "Work", color: "cyan" },
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
});
