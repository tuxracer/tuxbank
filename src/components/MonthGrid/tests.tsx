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
});
