import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Occurrence } from "@/types";
import DayPanel from "./index";

const occ: Occurrence = {
  eventId: "e1",
  date: "2026-06-12",
  title: "Rent",
  category: {
    id: "payments",
    name: "Payments",
    color: "magenta",
    updatedAt: new Date().toISOString(),
  },
  amount: 1800,
  direction: "withdrawal",
  isRecurring: true,
};

describe("DayPanel", () => {
  it("shows the day's events as chips and reports chip clicks", async () => {
    const onSelectOccurrence = vi.fn();
    render(
      <DayPanel
        dateISO="2026-06-12"
        occurrences={[occ]}
        balance={7000}
        onSelectOccurrence={onSelectOccurrence}
        onAddEvent={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTitle("Rent"));
    expect(onSelectOccurrence).toHaveBeenCalledWith(occ);
  });

  it("shows the running balance, negative styled", () => {
    render(
      <DayPanel
        dateISO="2026-06-12"
        occurrences={[occ]}
        balance={-240}
        onSelectOccurrence={vi.fn()}
        onAddEvent={vi.fn()}
      />,
    );
    expect(screen.getByText("-$240.00")).toHaveClass("cy-balance-neg");
  });
});
