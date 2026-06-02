import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarToolbar from "./index";
import type { CalendarToolbarProps } from "./types";

const baseProps = (
  over: Partial<CalendarToolbarProps> = {},
): CalendarToolbarProps => ({
  recordCount: 0,
  endBalance: 0,
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
  onNewEvent: vi.fn(),
  ...over,
});

describe("CalendarToolbar month/year selects", () => {
  it("renders 12 month options and one option per year in range", () => {
    render(<CalendarToolbar {...baseProps()} />);
    const monthSelect = screen.getByLabelText("Month");
    const yearSelect = screen.getByLabelText("Year");
    expect(within(monthSelect).getAllByRole("option")).toHaveLength(12);
    // 2024..2030 inclusive
    expect(within(yearSelect).getAllByRole("option")).toHaveLength(7);
  });

  it("reflects the selected month and year", () => {
    render(
      <CalendarToolbar
        {...baseProps({ selectedMonth: 4, selectedYear: 2027 })}
      />,
    );
    expect(screen.getByLabelText("Month")).toHaveValue("4");
    expect(screen.getByLabelText("Year")).toHaveValue("2027");
  });

  it("calls onSelectMonth with the chosen month index", async () => {
    const onSelectMonth = vi.fn();
    render(<CalendarToolbar {...baseProps({ onSelectMonth })} />);
    await userEvent.selectOptions(screen.getByLabelText("Month"), "6");
    expect(onSelectMonth).toHaveBeenCalledWith(6);
  });

  it("calls onSelectYear with the chosen year", async () => {
    const onSelectYear = vi.fn();
    render(<CalendarToolbar {...baseProps({ onSelectYear })} />);
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2029");
    expect(onSelectYear).toHaveBeenCalledWith(2029);
  });
});
