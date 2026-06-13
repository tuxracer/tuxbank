import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Occurrence } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import MonthGrid, {
  chipCapacity,
  CHIP_AREA_OVERHEAD_PX,
  CHIP_HEIGHT_PX,
  CHIP_GAP_PX,
  MORE_LINE_HEIGHT_PX,
} from "./index";
import { MAX_VISIBLE_CHIPS } from "@/components/DayCell";

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

  it("trims trailing all-next-month weeks on desktop but fills 6 rows when compact", () => {
    // Feb 2026 starts on a Sunday with 28 days, so it spans exactly 4 weeks.
    const feb = buildMonthGrid(new Date(2026, 1, 1));
    const props = {
      cells: feb,
      todayISO: "2026-02-15",
      occurrencesByDate: {},
      onSelectDate: vi.fn(),
      onSelectOccurrence: vi.fn(),
    };

    const desktop = render(<MonthGrid {...props} />);
    expect(
      desktop.container.querySelectorAll('[role="gridcell"]'),
    ).toHaveLength(
      28, // 4 weeks x 7
    );
    desktop.unmount();

    const compact = render(<MonthGrid {...props} compact />);
    expect(
      compact.container.querySelectorAll('[role="gridcell"]'),
    ).toHaveLength(
      42, // always the full 6 weeks x 7 on mobile
    );
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
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{
          "2026-05-14": [
            makeOcc(1),
            makeOcc(2),
            makeOcc(3),
            makeOcc(4),
            makeOcc(5),
          ],
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

describe("MonthGrid compact mode", () => {
  it("renders dots instead of chips, capped at 4 with a + marker", () => {
    render(
      <MonthGrid
        compact
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{
          "2026-05-14": [
            makeOcc(1),
            makeOcc(2),
            makeOcc(3),
            makeOcc(4),
            makeOcc(5),
          ],
        }}
        balancesByDate={{ "2026-05-14": 4200 }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    // Dots are plain spans titled by event, not clickable chip buttons.
    expect(screen.getByTitle("Event 1").tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: /Event 1/ }),
    ).not.toBeInTheDocument();
    // Cap at 4 dots; the rest collapse into a "+" marker, no popover.
    expect(screen.queryByTitle("Event 5")).not.toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.queryByText("+1 more")).not.toBeInTheDocument();
    // No per-cell balance in compact cells.
    expect(screen.queryByText("$4,200.00")).not.toBeInTheDocument();
  });

  it("marks the selected day and reports taps via onSelectDate", async () => {
    const onSelectDate = vi.fn();
    const { container } = render(
      <MonthGrid
        compact
        selectedISO="2026-05-20"
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={onSelectDate}
        onSelectOccurrence={vi.fn()}
      />,
    );
    const cellByIso = (iso: string) =>
      container.querySelector(`[data-iso="${iso}"]`);
    expect(cellByIso("2026-05-20")).toHaveClass("selected");
    expect(cellByIso("2026-05-14")).not.toHaveClass("selected");
    await userEvent.click(cellByIso("2026-05-21")!);
    expect(onSelectDate).toHaveBeenCalledWith("2026-05-21");
  });

  it("does not mark any day selected on desktop", () => {
    const { container } = render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(container.querySelector(".selected")).toBeNull();
  });

  it("shows no + marker at exactly 4 occurrences", () => {
    render(
      <MonthGrid
        compact
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{
          "2026-05-14": [makeOcc(1), makeOcc(2), makeOcc(3), makeOcc(4)],
        }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Event 4")).toBeInTheDocument();
    expect(screen.queryByText("+")).not.toBeInTheDocument();
  });
});

describe("MonthGrid swipe navigation", () => {
  const swipe = (
    el: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    fireEvent.pointerDown(el, { clientX: from.x, clientY: from.y });
    fireEvent.pointerUp(el, { clientX: to.x, clientY: to.y });
  };

  const renderSwipeGrid = (onSwipeLeft = vi.fn(), onSwipeRight = vi.fn()) => {
    const utils = render(
      <MonthGrid
        compact
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
      />,
    );
    return { ...utils, onSwipeLeft, onSwipeRight };
  };

  it("fires onSwipeLeft for a leftward swipe past the threshold", () => {
    const { onSwipeLeft, onSwipeRight } = renderSwipeGrid();
    swipe(screen.getByRole("grid"), { x: 300, y: 100 }, { x: 220, y: 110 });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("fires onSwipeRight for a rightward swipe past the threshold", () => {
    const { onSwipeLeft, onSwipeRight } = renderSwipeGrid();
    swipe(screen.getByRole("grid"), { x: 100, y: 100 }, { x: 180, y: 90 });
    expect(onSwipeRight).toHaveBeenCalledOnce();
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("ignores horizontal movement below the threshold", () => {
    const { onSwipeLeft, onSwipeRight } = renderSwipeGrid();
    swipe(screen.getByRole("grid"), { x: 300, y: 100 }, { x: 260, y: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("ignores vertically dominated movement", () => {
    const { onSwipeLeft, onSwipeRight } = renderSwipeGrid();
    swipe(screen.getByRole("grid"), { x: 300, y: 100 }, { x: 220, y: 220 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does nothing on desktop renders without swipe props", () => {
    const { container } = render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    swipe(screen.getByRole("grid"), { x: 300, y: 100 }, { x: 200, y: 100 });
    expect(container.querySelector(".cy-glitch")).toBeNull();
    expect(container.querySelector(".touch-pan-y")).toBeNull();
  });

  it("flashes cy-glitch on swipe and clears it when the animation ends", () => {
    const { container } = renderSwipeGrid();
    swipe(screen.getByRole("grid"), { x: 300, y: 100 }, { x: 200, y: 100 });
    const root = container.querySelector(".cy-glitch");
    expect(root).not.toBeNull();
    // jsdom has no AnimationEvent, so fireEvent.animationEnd produces an event
    // without animationName; build one by hand so the listener's guard matches.
    act(() => {
      const evt = new Event("animationend", { bubbles: true });
      Object.defineProperty(evt, "animationName", { value: "cy-glitch" });
      root!.dispatchEvent(evt);
    });
    expect(container.querySelector(".cy-glitch")).toBeNull();
  });

  it("forgets a cancelled gesture", () => {
    const { onSwipeLeft, onSwipeRight } = renderSwipeGrid();
    const grid = screen.getByRole("grid");
    fireEvent.pointerDown(grid, { clientX: 300, clientY: 100 });
    fireEvent.pointerCancel(grid);
    fireEvent.pointerUp(grid, { clientX: 200, clientY: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});

describe("MonthGrid adaptive capacity wiring", () => {
  it("collapses chips to the events trigger when the observed grid is too short", () => {
    const original = window.ResizeObserver;
    // Auto-firing stub: invokes the callback once on observe, like a real
    // ResizeObserver's initial observation. jsdom clientHeight is 0, so the
    // derived row height is negative and capacity becomes 0.
    const fakeEntry = {
      contentRect: { width: 0, height: 0 },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
      target: document.createElement("div"),
    } as unknown as ResizeObserverEntry;
    window.ResizeObserver = class implements ResizeObserver {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb([fakeEntry], this);
      }
      unobserve() {}
      disconnect() {}
    };
    try {
      act(() => {
        render(
          <MonthGrid
            cells={buildMonthGrid(new Date(2026, 4, 1))}
            todayISO="2026-05-14"
            occurrencesByDate={{ "2026-05-14": [makeOcc(1)] }}
            onSelectDate={vi.fn()}
            onSelectOccurrence={vi.fn()}
          />,
        );
      });
      expect(screen.queryByTitle("Event 1")).not.toBeInTheDocument();
      expect(screen.getByText("1 event")).toBeInTheDocument();
    } finally {
      window.ResizeObserver = original;
    }
  });
});

describe("chipCapacity", () => {
  // Row height with chip-area room for exactly `n` chips (no more-line).
  const heightForChips = (n: number) =>
    CHIP_AREA_OVERHEAD_PX + n * CHIP_HEIGHT_PX + (n - 1) * CHIP_GAP_PX;

  it("caps at MAX_VISIBLE_CHIPS regardless of available height", () => {
    expect(chipCapacity(10_000, 8)).toBe(MAX_VISIBLE_CHIPS);
  });

  it("returns the full fit when the occurrences fit exactly", () => {
    expect(chipCapacity(heightForChips(2), 2)).toBe(2);
  });

  it("returns the full fit for a day with no occurrences", () => {
    expect(chipCapacity(heightForChips(3), 0)).toBe(3);
  });

  it("drops a chip when the row is one pixel too short", () => {
    expect(chipCapacity(heightForChips(2) - 1, 2)).toBeLessThan(2);
  });

  it("reserves room for the more-line when occurrences overflow", () => {
    // Room for exactly 2 chips, but 3 events: the +N more line must fit,
    // so fewer than 2 chips render. (Assumes MORE_LINE_HEIGHT_PX <=
    // CHIP_HEIGHT_PX + CHIP_GAP_PX, which holds for the nominal CSS values.)
    const visible = chipCapacity(heightForChips(2), 3);
    expect(visible).toBeLessThan(2);
    expect(visible).toBeGreaterThanOrEqual(0);
    expect(MORE_LINE_HEIGHT_PX).toBeLessThanOrEqual(
      CHIP_HEIGHT_PX + CHIP_GAP_PX,
    );
  });

  it("returns 0 when not even one chip fits", () => {
    expect(chipCapacity(CHIP_AREA_OVERHEAD_PX + CHIP_HEIGHT_PX - 1, 5)).toBe(0);
  });

  it("never returns a negative count for absurdly short rows", () => {
    expect(chipCapacity(0, 4)).toBe(0);
    expect(chipCapacity(-10, 4)).toBe(0);
  });
});
