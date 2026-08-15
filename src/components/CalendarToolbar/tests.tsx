import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarToolbar from "./index";
import type { CalendarToolbarProps } from "./types";

// The badge ships its own tests; the toolbar tests only exercise the controls.
vi.mock("@/components/SyncAttentionBadge", () => ({
  SyncAttentionBadge: () => null,
  SyncAttentionDot: () => null,
}));

const baseProps = (
  over: Partial<CalendarToolbarProps> = {},
): CalendarToolbarProps => ({
  selectedYear: 2026,
  selectedMonth: 0,
  minYear: 2024,
  maxYear: 2030,
  usedCategories: [],
  activeCategoryIds: new Set(),
  onSelectMonth: vi.fn(),
  onSelectYear: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onToggleCategory: vi.fn(),
  onOpenSettings: vi.fn(),
  onNewEvent: vi.fn(),
  ...over,
});

describe("CalendarToolbar month/year selects", () => {
  it("renders 12 month options and one option per year in range", () => {
    render(<CalendarToolbar {...baseProps()} />);
    const monthSelect = screen.getByTitle("Month");
    const yearSelect = screen.getByTitle("Year");
    expect(within(monthSelect).getAllByRole("option")).toHaveLength(12);
    // 2024..2030 inclusive
    expect(within(yearSelect).getAllByRole("option")).toHaveLength(7);
  });

  it("calls onSelectMonth with the chosen month index", async () => {
    const onSelectMonth = vi.fn();
    render(<CalendarToolbar {...baseProps({ onSelectMonth })} />);
    await userEvent.selectOptions(screen.getByTitle("Month"), "6");
    expect(onSelectMonth).toHaveBeenCalledWith(6);
  });

  it("calls onSelectYear with the chosen year", async () => {
    const onSelectYear = vi.fn();
    render(<CalendarToolbar {...baseProps({ onSelectYear })} />);
    await userEvent.selectOptions(screen.getByTitle("Year"), "2029");
    expect(onSelectYear).toHaveBeenCalledWith(2029);
  });
});

describe("CalendarToolbar settings button", () => {
  it("compact mode hides + New Event and fires onOpenSettings from the icon button", async () => {
    const onOpenSettings = vi.fn();
    render(<CalendarToolbar {...baseProps({ onOpenSettings })} compact />);
    expect(screen.queryByText("+ New Event")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Settings"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("desktop fires onOpenSettings from the labeled button", async () => {
    const onOpenSettings = vi.fn();
    render(<CalendarToolbar {...baseProps({ onOpenSettings })} />);
    expect(screen.getByText("+ New Event")).toBeInTheDocument();
    await userEvent.click(screen.getByText("◢ SETTINGS"));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
