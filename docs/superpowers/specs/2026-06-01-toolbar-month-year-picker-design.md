# Toolbar Month + Year Picker — Design

**Date:** 2026-06-01
**Status:** Approved (design)

## Goal

Let the user jump directly to any month and year from the toolbar, instead of
only stepping one month at a time with the `‹` / `›` arrows. The arrows and the
`▸ Today` button stay; the static `JANUARY 2026` month label is replaced by two
dropdowns (Month + Year) sitting between the arrows.

```
[‹]  [ January ▾ ]  [ 2026 ▾ ]  [›]   [▸ Today]
```

## Decisions

1. **UI pattern:** two **native `<select>` elements** styled with `cy-btn` — the
   exact pattern `EventDialog` already uses for its Type/Repeat dropdowns. shadcn's
   Radix `Select` exists in `src/components/ui/select.tsx` but is unused anywhere;
   native selects are keyboard- and screen-reader-accessible for free and keep the
   toolbar dependency-light.
2. **Month options:** all 12 months, full names ("January" … "December"), built
   with `Intl.DateTimeFormat(undefined, { month: "long" })` per the project's
   Intl-API standard.
3. **Year range:** **min = the first year that has any events** (data-driven);
   **max = current year + 10**. See the range rules below for the empty-calendar
   and out-of-range guards.

## Year range — `yearRange`

A derived `yearRange: { min: number; max: number }` computed in `CalendarContext`
from `events` (a `useMemo`):

- `max = currentYear + 10`.
- `min = firstEventYear` — the smallest year across all `event.date` values, read
  as `Number(date.slice(0, 4))` (dates are `yyyy-MM-dd`, so this avoids any
  timezone parsing). If there are no events, `min = currentYear`.
- **Guards (so the Year select always has an option matching `visibleMonth`):**
  - clamp `min` down to `min(min, currentYear, visibleYear)`;
  - expand `max` up to `max(max, visibleYear)`.

  In the normal case this is exactly "min = first event year, max = current + 10".
  The guard only engages at the extremes — e.g. paging past `currentYear + 10`
  with the `›` arrow — where it widens the list so the native select never renders
  a value with no matching `<option>` (which would show blank).

`currentYear` / `visibleYear` use `.getFullYear()` on the relevant `Date` (local,
not UTC — consistent with the project's local-dates rule).

## Component — `CalendarToolbar`

Stays a pure presentational component (no hooks).

- **Props removed:** `monthLabel`.
- **Props added:** `selectedYear: number`, `selectedMonth: number` (0–11),
  `minYear: number`, `maxYear: number`, `onSelectMonth: (m: number) => void`,
  `onSelectYear: (y: number) => void`.
- Replace `<span className="cy-month">{monthLabel}</span>` (between the arrows)
  with two `<select className="cy-btn …">`:
  - **Month** — `value={selectedMonth}`, 12 `<option value={index}>{MONTH_NAMES[index]}</option>`,
    `onChange` → `onSelectMonth(Number(value))`, `aria-label="Month"`.
  - **Year** — `value={selectedYear}`, options counted **down** from `maxYear` to
    `minYear`, `onChange` → `onSelectYear(Number(value))`, `aria-label="Year"`.
- **`MONTH_NAMES`** lives in a new `src/components/CalendarToolbar/consts.ts`
  (built once via `Intl.DateTimeFormat`), re-exported from `index.ts` per the
  module-structure standard.

## Wiring — `src/app/page.tsx`

- Derive from context: `selectedYear = cal.visibleMonth.getFullYear()`,
  `selectedMonth = cal.visibleMonth.getMonth()`.
- Reuse the existing `cal.goToDate(date)` (it does `setVisibleMonth(startOfMonth(date))`):
  - `onSelectMonth={(m) => cal.goToDate(new Date(selectedYear, m, 1))}`
  - `onSelectYear={(y) => cal.goToDate(new Date(y, selectedMonth, 1))}`
- Pass `minYear={cal.yearRange.min}`, `maxYear={cal.yearRange.max}`.
- Drop the `monthLabel` prop on `<CalendarToolbar>`; `cal.monthLabel` stays in use
  for the grid's `gridLabel` aria-label.
- **Keyboard bug fix (while here):** `onKeyDown` currently ignores keystrokes only
  from `HTMLInputElement` / `HTMLTextAreaElement`. Add `HTMLSelectElement` to that
  guard so `PageUp` / `PageDown` on a focused select changes only the select's
  value and does not *also* fire `goToPrevMonth` / `goToNextMonth`.

## Edge cases (explicit)

- **No events** → year list is `currentYear … currentYear + 10`.
- **Events earlier than this year** → `min` extends back to the earliest event year.
- **Events dated beyond `currentYear + 10`** (e.g. a long open-ended recurring
  series) → the year dropdown still caps at `+10`; those far-future months remain
  reachable via the `›` arrow, and once the view is there the visible-year guard
  adds that year to the list.

## Files to change

- `src/context/CalendarContext/index.tsx` — add the `yearRange` `useMemo` and
  include it in the context value.
- `src/context/CalendarContext/types.ts` — add `yearRange: { min: number; max: number }`
  to `CalendarContextValue`.
- `src/components/CalendarToolbar/types.ts` — swap `monthLabel` for the new
  selection props.
- `src/components/CalendarToolbar/index.tsx` — render the two selects.
- `src/components/CalendarToolbar/consts.ts` — new; `MONTH_NAMES`.
- `src/app/page.tsx` — derive month/year, wire `onSelectMonth`/`onSelectYear`,
  pass `minYear`/`maxYear`, drop `monthLabel`, add the `HTMLSelectElement` guard.
- `src/components/CalendarToolbar/tests.ts` — new (see Testing).
- `src/context/CalendarContext/tests.ts` — extend (or add) for `yearRange`.

## Testing & verification

- **`CalendarToolbar/tests.ts`** (new): renders 12 month options and `[min…max]`
  year options; the Month/Year selects reflect `selectedMonth`/`selectedYear`;
  changing each select calls `onSelectMonth` / `onSelectYear` with the right
  numeric value. Pure logic — fine in jsdom.
- **`yearRange`** (context test): with events spanning multiple years → `min =
  earliest event year`, `max = currentYear + 10`; with no events → `min =
  currentYear`; the visible-year/current-year guards widen the range when the
  view is outside it.
- Per the CLAUDE.md jsdom gotcha, layout/appearance is not unit-tested. Verify the
  real render in `chrome-devtools` and screenshot: both selects styled as `cy-btn`,
  changing each navigates the grid, arrows + Today still work, and `PageUp`/
  `PageDown` with a select focused changes only the select.
- `pnpm check` and `pnpm test` must pass.

## Non-goals

- No popover/grid month picker, no calendar-style date picker — two dropdowns only.
- No change to `goToPrevMonth` / `goToNextMonth` / `goToToday` behavior.
- No persistence of the selected month/year beyond the existing in-memory
  `visibleMonth` state.
- No adoption of the unused Radix `Select` primitive.
