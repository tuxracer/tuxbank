# Toolbar Month + Year Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `JANUARY 2026` toolbar label with Month + Year dropdowns so the user can jump directly to any month/year, keeping the existing `‹` `›` arrows and `▸ Today`.

**Architecture:** Two native `<select>` elements (styled `cy-btn`, matching `EventDialog`) replace the month label. They are driven by `visibleMonth` (derived in `page.tsx`) and call the already-existing `goToDate(date)`. The Year list is bounded by a new derived `yearRange` on `CalendarContext`: min = earliest event year, max = current year + 10, with guards so the currently-viewed year is always an option.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, native `<select>`, `Intl.DateTimeFormat` for month names, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-01-toolbar-month-year-picker-design.md`

---

## File Structure

- **Modify** `src/context/CalendarContext/types.ts` — add `yearRange` to `CalendarContextValue`.
- **Modify** `src/context/CalendarContext/index.tsx` — compute and expose `yearRange`.
- **Modify** `src/context/CalendarContext/tests.tsx` — tests for `yearRange`.
- **Create** `src/components/CalendarToolbar/consts.ts` — `MONTH_NAMES`.
- **Modify** `src/components/CalendarToolbar/types.ts` — swap `monthLabel` for selection props.
- **Modify** `src/components/CalendarToolbar/index.tsx` — render the two selects; re-export consts.
- **Create** `src/components/CalendarToolbar/tests.tsx` — toolbar select behavior.
- **Modify** `src/app/page.tsx` — derive month/year, wire callbacks, drop `monthLabel`, add `HTMLSelectElement` keyboard guard.

---

## Task 1: `yearRange` on CalendarContext

**Files:**
- Modify: `src/context/CalendarContext/types.ts`
- Modify: `src/context/CalendarContext/index.tsx`
- Test: `src/context/CalendarContext/tests.tsx`

- [ ] **Step 1: Write the failing tests**

Append these to the existing `describe("CalendarContext", …)` block in `src/context/CalendarContext/tests.tsx` (before its closing `});`). They derive the current year at runtime — do **not** hardcode a year.

```tsx
it("year range defaults to current year .. current year + 10 with no events", async () => {
  const { result } = renderHook(() => useCalendar(), { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const currentYear = new Date().getFullYear();
  expect(result.current.yearRange).toEqual({
    min: currentYear,
    max: currentYear + 10,
  });
});

it("year range starts at the earliest event year", async () => {
  const { result } = renderHook(() => useCalendar(), { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const currentYear = new Date().getFullYear();
  await act(async () => {
    await result.current.createEvent({
      title: "Old",
      date: `${currentYear - 3}-02-01`,
      categoryId: "work",
      amount: 100,
      direction: "deposit",
      notes: undefined,
      recurrence: null,
    });
  });
  await waitFor(() => expect(result.current.events.length).toBe(1));
  expect(result.current.yearRange).toEqual({
    min: currentYear - 3,
    max: currentYear + 10,
  });
});

it("year range widens to include a visible year beyond the +10 cap", async () => {
  const { result } = renderHook(() => useCalendar(), { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const currentYear = new Date().getFullYear();
  const farYear = currentYear + 25;
  await act(async () => {
    result.current.goToDate(new Date(farYear, 0, 1));
  });
  await waitFor(() =>
    expect(result.current.visibleMonth.getFullYear()).toBe(farYear),
  );
  expect(result.current.yearRange.max).toBe(farYear);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/context/CalendarContext/tests.tsx`
Expected: FAIL — `result.current.yearRange` is `undefined`, so `.min` / `.max` / `toEqual` throw / mismatch.

- [ ] **Step 3: Add `yearRange` to the context type**

In `src/context/CalendarContext/types.ts`, add to `CalendarContextValue` (next to `visibleMonth`):

```ts
  yearRange: { min: number; max: number };
```

- [ ] **Step 4: Compute and expose `yearRange`**

In `src/context/CalendarContext/index.tsx`, add this `useMemo` near the other derived values (e.g. just after the `cells` memo). `events` and `visibleMonth` are already in scope:

```ts
  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const visibleYear = visibleMonth.getFullYear();
    const eventYears = events.map((e) => Number(e.date.slice(0, 4)));
    const firstEventYear = eventYears.length
      ? Math.min(...eventYears)
      : currentYear;
    return {
      min: Math.min(firstEventYear, currentYear, visibleYear),
      max: Math.max(currentYear + 10, visibleYear),
    };
  }, [events, visibleMonth]);
```

Then add `yearRange,` to the `value: CalendarContextValue = { … }` object (next to `visibleMonth,`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/context/CalendarContext/tests.tsx`
Expected: PASS (all three new tests plus the existing ones).

- [ ] **Step 6: Verify the whole suite + check**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/context/CalendarContext
git commit -m "feat(context): expose yearRange for month/year picker"
```

---

## Task 2: CalendarToolbar Month + Year selects

**Files:**
- Create: `src/components/CalendarToolbar/consts.ts`
- Modify: `src/components/CalendarToolbar/types.ts`
- Modify: `src/components/CalendarToolbar/index.tsx`
- Test: `src/components/CalendarToolbar/tests.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/CalendarToolbar/tests.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/CalendarToolbar/tests.tsx`
Expected: FAIL — props like `selectedMonth` don't exist yet and there are no `Month` / `Year` labelled selects.

- [ ] **Step 3: Create the month-names constant**

Create `src/components/CalendarToolbar/consts.ts`:

```ts
const monthNameFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
});

// Full month names in calendar order: ["January", … "December"].
export const MONTH_NAMES: readonly string[] = Array.from(
  { length: 12 },
  (_, index) => monthNameFormatter.format(new Date(2000, index, 1)),
);
```

- [ ] **Step 4: Update the toolbar prop types**

Replace the contents of `src/components/CalendarToolbar/types.ts` with:

```ts
import type { Category } from "@/types";

export type CalendarToolbarProps = {
  recordCount: number;
  endBalance: number;
  selectedYear: number;
  selectedMonth: number;
  minYear: number;
  maxYear: number;
  usedCategories: Category[];
  activeCategoryIds: Set<string>;
  onSelectMonth: (monthIndex: number) => void;
  onSelectYear: (year: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleCategory: (id: string) => void;
  onManageCategories: () => void;
  onManageData: () => void;
  onNewEvent: () => void;
};
```

- [ ] **Step 5: Render the selects in the toolbar**

In `src/components/CalendarToolbar/index.tsx`:

(a) Add the consts import and re-export near the top, beside the existing `export * from "./types";`:

```ts
import { MONTH_NAMES } from "./consts";

export * from "./types";
export * from "./consts";
```

(b) Change the destructured params: remove `monthLabel`, and add `selectedYear`, `selectedMonth`, `minYear`, `maxYear`, `onSelectMonth`, `onSelectYear`.

(c) Convert the component from a direct `( … )` return to a block body so it can build the year list. The opening becomes:

```tsx
const CalendarToolbar = ({
  recordCount,
  endBalance,
  selectedYear,
  selectedMonth,
  minYear,
  maxYear,
  usedCategories,
  activeCategoryIds,
  onSelectMonth,
  onSelectYear,
  onPrev,
  onNext,
  onToday,
  onToggleCategory,
  onManageCategories,
  onManageData,
  onNewEvent,
}: CalendarToolbarProps) => {
  // Years descending from maxYear down to minYear (inclusive).
  const yearOptions = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => maxYear - i,
  );

  return (
```

and add a matching `};` after the closing `)` of the JSX (replace the current trailing `);` with `);\n};`).

(d) Replace the month-label span (the `<span className="cy-month text-2xl uppercase">{monthLabel}</span>` line, which sits between the Previous and Next buttons) with the two selects:

```tsx
        <select
          aria-label="Month"
          className="cy-btn px-3 py-1.5 text-sm uppercase"
          value={selectedMonth}
          onChange={(e) => onSelectMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          className="cy-btn px-3 py-1.5 text-sm"
          value={selectedYear}
          onChange={(e) => onSelectYear(Number(e.target.value))}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
```

Leave the surrounding Previous/Next buttons and the `▸ Today` button unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/components/CalendarToolbar/tests.tsx`
Expected: PASS (all four tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarToolbar
git commit -m "feat(toolbar): month + year dropdowns"
```

---

## Task 3: Wire the picker in page.tsx + keyboard guard

**Files:**
- Modify: `src/app/page.tsx`

(No new unit test — `page.tsx` is the wiring/composition layer; behavior is covered by Tasks 1–2 and the browser check below. jsdom can't verify the layout per the CLAUDE.md gotcha.)

- [ ] **Step 1: Derive the selected month/year**

In `src/app/page.tsx`, just after `const cal = useCalendar();` inside `CalendarScreen`, add:

```tsx
  const selectedYear = cal.visibleMonth.getFullYear();
  const selectedMonth = cal.visibleMonth.getMonth();
```

- [ ] **Step 2: Add the `HTMLSelectElement` keyboard guard**

In the `onKeyDown` handler, extend the early-return guard so a focused select doesn't double-trigger month navigation:

```tsx
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
```

- [ ] **Step 3: Update the `<CalendarToolbar>` props**

Replace the `monthLabel={cal.monthLabel}` line with the selection props and callbacks. The element becomes:

```tsx
      <CalendarToolbar
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        minYear={cal.yearRange.min}
        maxYear={cal.yearRange.max}
        onSelectMonth={(monthIndex) =>
          cal.goToDate(new Date(selectedYear, monthIndex, 1))
        }
        onSelectYear={(year) =>
          cal.goToDate(new Date(year, selectedMonth, 1))
        }
        recordCount={cal.events.length}
        usedCategories={cal.usedCategories}
        activeCategoryIds={cal.activeCategoryIds}
        onPrev={cal.goToPrevMonth}
        onNext={cal.goToNextMonth}
        onToday={cal.goToToday}
        onToggleCategory={cal.toggleCategory}
        onManageCategories={() => setManageOpen(true)}
        onManageData={() => setDataOpen(true)}
        onNewEvent={() => openCreate(cal.todayISO)}
        endBalance={
          cal.balancesByDate[cal.cells[cal.cells.length - 1].iso] ?? 0
        }
      />
```

(`cal.monthLabel` is still used below for the `MonthGrid` `gridLabel` — leave that as-is.)

- [ ] **Step 4: Verify check + full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS — formatting, lint, types, and all tests green.

- [ ] **Step 5: Verify in a real browser (required — jsdom can't see layout)**

Start the dev server (`pnpm dev`) and use chrome-devtools to load `http://localhost:3000`, then confirm and screenshot:
- The toolbar shows a Month dropdown and a Year dropdown (styled like the other `cy-btn` controls) between the `‹` and `›` arrows.
- Selecting a different month navigates the grid to that month; selecting a different year navigates to that year (same month).
- The `‹` / `›` arrows and `▸ Today` still work and keep both dropdowns in sync with the visible month.
- With the dev calendar empty, the Year dropdown lists the current year through current year + 10; after adding an event in an earlier year, the list extends back to that year.
- Focus the Month select and press `PageUp`/`PageDown`: it changes the select value only (the month does not also jump from the global handler).

If the dropdowns render off-screen or unstyled, recheck `src/app/globals.css` `.cy-btn` and the Turbopack stale-CSS gotcha (`rm -rf .next && pnpm dev`).

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(toolbar): wire month/year picker to calendar navigation"
```

---

## Self-Review Notes

- **Spec coverage:** UI pattern (native selects, Task 2) ✓; month names via Intl (Task 2 consts) ✓; year range min=first event year / max=current+10 + guards (Task 1) ✓; `page.tsx` wiring + drop `monthLabel` (Task 3) ✓; `HTMLSelectElement` keyboard fix (Task 3) ✓; toolbar + context tests ✓; browser verification (Task 3 Step 5) ✓; non-goals respected (no popover, no Radix Select, no persistence).
- **Type consistency:** `yearRange: { min; max }` defined in Task 1 and consumed as `cal.yearRange.min/.max` in Task 3; `onSelectMonth(monthIndex: number)` / `onSelectYear(year: number)` defined in Task 2 types and called with the right argument types in Task 3; `MONTH_NAMES` defined in Task 2 consts and consumed in the same task's component.
- **No placeholders:** every code/test step shows full content and exact commands.
