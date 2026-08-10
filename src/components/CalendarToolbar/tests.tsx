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
  onManageCategories: vi.fn(),
  onManageData: vi.fn(),
  onAbout: vi.fn(),
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

describe("CalendarToolbar compact mode", () => {
  it("hides + New Event and the inline SYNC/DATA/CATEGORIES buttons", () => {
    render(<CalendarToolbar {...baseProps()} compact />);
    expect(screen.queryByText("+ New Event")).not.toBeInTheDocument();
    expect(screen.queryByText("◢ SYNC")).not.toBeInTheDocument();
    expect(screen.getByTitle("More actions")).toBeInTheDocument();
  });

  it("opens the menu and fires actions, closing afterwards", async () => {
    const onManageData = vi.fn();
    render(<CalendarToolbar {...baseProps({ onManageData })} compact />);
    await userEvent.click(screen.getByTitle("More actions"));
    expect(screen.getByText("◢ SYNC")).toBeInTheDocument();
    expect(screen.getByText("◢ CATEGORIES")).toBeInTheDocument();
    await userEvent.click(screen.getByText("◢ DATA"));
    expect(onManageData).toHaveBeenCalled();
    expect(screen.queryByText("◢ DATA")).not.toBeInTheDocument();
  });

  it("does not render a menu trigger on desktop", () => {
    render(<CalendarToolbar {...baseProps()} />);
    expect(screen.queryByTitle("More actions")).not.toBeInTheDocument();
    expect(screen.getByText("+ New Event")).toBeInTheDocument();
  });
});
