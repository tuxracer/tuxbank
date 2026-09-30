import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import type { Occurrence } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import DayCell from "./index";

const makeOcc = (i: number): Occurrence => ({
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

const cell = buildMonthGrid(new Date(2026, 4, 1)).find(
  (c) => c.iso === "2026-05-14",
)!;

const renderCell = (maxVisibleChips?: number) =>
  render(
    <DayCell
      cell={cell}
      isToday={false}
      tabIndex={0}
      occurrences={[makeOcc(1), makeOcc(2), makeOcc(3)]}
      balance={0}
      onSelectDate={vi.fn()}
      onSelectOccurrence={vi.fn()}
      maxVisibleChips={maxVisibleChips}
    />,
  );

describe("DayCell maxVisibleChips", () => {
  it("renders only the given number of chips and collapses the rest", () => {
    renderCell(1);
    expect(screen.getByTitle("Event 1")).toBeInTheDocument();
    expect(screen.queryByTitle("Event 2")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("lists only the hidden chips in the overflow popover", async () => {
    // The open popover mounts a drag monitor, which needs a DndContext above.
    render(
      <DndContext>
        <DayCell
          cell={cell}
          isToday={false}
          tabIndex={0}
          occurrences={[makeOcc(1), makeOcc(2), makeOcc(3)]}
          balance={0}
          onSelectDate={vi.fn()}
          onSelectOccurrence={vi.fn()}
          maxVisibleChips={1}
        />
      </DndContext>,
    );
    await userEvent.click(screen.getByText("+2 more"));
    expect(screen.getAllByTitle("Event 1")).toHaveLength(1);
    expect(screen.getByTitle("Event 2")).toBeInTheDocument();
    expect(screen.getByTitle("Event 3")).toBeInTheDocument();
  });

  it("renders zero chips with an 'N events' trigger at capacity 0", () => {
    renderCell(0);
    expect(screen.queryByTitle("Event 1")).not.toBeInTheDocument();
    expect(screen.queryByText("+3 more")).not.toBeInTheDocument();
    expect(screen.getByText("3 events")).toBeInTheDocument();
  });

  it("uses the singular label for one hidden event", () => {
    render(
      <DayCell
        cell={cell}
        isToday={false}
        tabIndex={0}
        occurrences={[makeOcc(1)]}
        balance={0}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
        maxVisibleChips={0}
      />,
    );
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("renders every chip when no capacity has been measured yet", () => {
    renderCell(undefined);
    expect(screen.getByTitle("Event 3")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });
});
