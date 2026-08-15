# TRD: Full-Page Cyberpunk Calendar

> Technical Reference Document. See [CLAUDE.md](../CLAUDE.md) for project conventions.

**Status:** Draft for review · **Date:** 2026-05-30 · **Owner:** Derek Petersen

A single-user, full-page **month calendar** web app with a **cyberpunk-inspired** interface. Events are created, edited, and deleted entirely in the browser and persist locally in **IndexedDB** (via the `idb` library) with no backend or account by default. An optional, end-to-end-encrypted account sync (managed Supabase backend, required TOTP 2FA) can be enabled for cross-device sync; see the Optional account sync section. Local-only use is unchanged when signed out. Events can repeat, and repeating events can be edited or deleted at three scopes (this occurrence / this and following / the whole series).

---

## 1. Goals & Non-Goals

### Goals
- A calendar that **fills the entire viewport** and is the whole app, with no chrome competing for space.
- A **cohesive, cyberpunk-inspired aesthetic**: flat data-ink surfaces, a disciplined accent palette, and no glow effects, not a generic theme.
- Fast, fully **client-side** personal scheduling: create/edit/delete events with **no sign-in and no network dependency**.
- **Local persistence** that survives reloads via IndexedDB.
- Support **recurring events** with familiar Google-Calendar-style edit/delete scopes.

### Non-Goals (v1)
- No multi-user or sharing. (Single-user cross-device sync was added after v1 as an optional, end-to-end-encrypted account feature; see Optional account sync.)
- Local-first: no backend of our own for event data. (An optional managed Supabase backend can be enabled for encrypted sync; the client talks to it directly, with authorization in Row Level Security and no server code of ours.)
- No timed events (no start/end times), no multi-day events.
- No week / day / agenda views (month view only).
- No reminders/notifications; no external calendar (Google/ICS) sync. (A whole-database JSON backup export/restore *is* supported; see the Backup / restore section.)

---

## 2. Target User & Use Case

A single person managing their own schedule of **all-day, date-based events**: meetings, reminders, birthdays, recurring obligations ("pay rent", "weekly standup"). The calendar is opened on a desktop browser as a focused, full-screen tool. All data lives on that device.

---

## 3. Tech Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | **Vite 8 (React SPA)** | Static client app; `index.html` + `src/main.tsx` entry, no server runtime. |
| PWA / offline | **vite-plugin-pwa** (Workbox) | Service worker precaches the build for offline cold-loads; installable web manifest + icons in `public/`. Build emits `sw.js`, a `workbox-*.js` helper it loads, and `manifest.webmanifest` into `dist/`; registration uses `workbox-window` via `virtual:pwa-register`. |
| Language | **TypeScript** (ESM) | Per repo conventions in `CLAUDE.md`. |
| UI library | **React** | |
| Styling | **Tailwind CSS** | Utility-first; cyberpunk design tokens defined as CSS variables in `globals.css`. |
| Components | **shadcn/ui** (Radix primitives) | Dialog, Select, Popover, RadioGroup, Button, Input, Textarea, Label, Form, restyled to the cyberpunk theme. |
| Forms | **react-hook-form** + **zod** (via `@hookform/resolvers`) | Form state & validation for the event editor; drives shadcn's `Form` component and its accessible field errors. |
| Date math | **date-fns** | Grid generation, recurrence stepping, comparisons. |
| Date picker | **Native `<input type="date">`** | Used for the event form's Date field; main month grid is custom-built. The shadcn `calendar` primitive remains available for future use. |
| Persistence | **IndexedDB** via **idb** | Two object stores (events, categories); see §"Persistence: IndexedDB". |
| Fonts | **Rajdhani**, **Chakra Petch**, **JetBrains Mono** | Self-hosted via `@fontsource` packages (latin subsets), imported in `src/main.tsx`. Display / UI / data, respectively. |
| Drag-and-drop | **@dnd-kit/core** | `DndContext` + `PointerSensor` in `src/App.tsx`; chips use `useDraggable`, cells use `useDroppable`. |
| Toasts | **sonner** | Move confirmations with Undo; themed wrapper in `src/components/ui/sonner.tsx`. |
| Testing | **vitest** + **@testing-library/react** | Behavior-focused tests per `CLAUDE.md`; storage tests run against fake-indexeddb. |
| Analytics | **@vercel/analytics** | `<Analytics>` mounted in `src/main.tsx`; page views plus a small set of product events, both gated on privacy signals. See §"Analytics". |

> **As-built stack versions:** Vite 8 (Rolldown), React 19, Tailwind v4, zod v4, react-day-picker v10.

> **Build note:** `package.json` scripts: `pnpm dev` → `vite`, `pnpm build` → `vite build`, `pnpm start` → `vite preview`. `pnpm test` runs vitest. `pnpm check` continues to run format + lint + typecheck and must pass before commits.

---

## 4. Functional Requirements

### 4.1 Month view & navigation
- On load, the calendar shows the **current month** in the viewer's local time zone, filling the viewport (`100dvh`).
- A **7-column grid** (Sunday-first) renders a fixed **6-week (6×7) matrix** so layout height is stable; leading/trailing days from adjacent months are shown **dimmed**.
- The **today** cell is visually emphasized (a yellow inset left edge).
- **Toolbar** provides: previous month (‹), next month (›), current **month/year label**, **Today** (jump to current month), a **category filter**, and **+ New Event**.
- A **HUD status line** shows decorative/real system context (e.g., app name, `LOCAL_DB::INDEXEDDB`, record count).

### 4.2 Events
- An event has: **title** (required), **date** (required, single all-day date), **category** (required; its color comes from a preset 5-color palette), an **amount** (required, > 0) with a **deposit/withdrawal direction** (required), and an optional **recurrence** rule.
- Events are **all-day and single-day**: no times, no multi-day spans.
- Day cells render events as **color-coded event chips**. Recurring occurrences show a **↻** marker.
- When a day has more chips than fit, it collapses to **"+N more"**, which opens a **day popover** listing all of that day's events.

### 4.3 Categories
- Categories are **user-managed and persisted** (no presets; the store starts empty for a fresh user). Each has a name and a color from the 5-color palette (`cyan`, `magenta`, `yellow`, `green`, `orange`).
- **Created** inline via a creatable combobox in the event editor (pick an existing one or type a new name + pick a color), or from the **Manage Categories** dialog (type a name that does not exist to surface a `Create "<name>"` row with a color picker); **renamed / recolored / deleted** in the Manage Categories dialog opened from the toolbar.
- Each category has an opaque **GUID** `id` (`crypto.randomUUID()`), generated at creation and stable across renames. Categories live in their own object store (see §4.6); events reference a category by id, so renaming or recoloring propagates to every event that uses it.
- **Names are unique, case-insensitively** (`categoryKey(name) = name.trim().toLowerCase()` is the match key): creating a name that already exists selects the existing category instead of duplicating it, and renaming to a name another category already uses is rejected inline in the Manage dialog.
- **Deleting an in-use category** prompts a confirm noting how many events use it; on delete its events keep the now-missing id and render as **Uncategorized** (a neutral cyan fallback) until re-categorized.
- The toolbar **category filter** is **per category**: a toggle per category currently in use (plus an **Uncategorized** toggle when orphaned events exist); each can be turned on/off independently, all shown by default. The filter affects which event chips display, not the running balance (§4.7).

### 4.4 Create / edit / delete / move (CRUD)
- **Create:** clicking **+ New Event** or an empty day opens the **Event editor** (shadcn Dialog). Clicking a day prefills its date.
- **Edit/View:** clicking an event chip opens the editor populated with that event.
- **Delete:** available within the editor.
- **Move:** drag a chip onto a different day cell to move the event. A `sonner` toast with an Undo action appears after every successful move. Recurring events prompt for scope (this / this and following / all) before applying; see §7 and §4.4.1.
- The editor validates input on submit (see §8): invalid input is blocked and surfaces inline, accessible field errors.

#### 4.4.1 Drag-and-drop mechanics

Drag-and-drop is powered by `@dnd-kit/core`. `DndContext` lives in `src/App.tsx`, wrapping `MonthGrid`. Chips rendered directly in a day cell are wrapped by `src/components/DraggableEventChip`, which calls `useDraggable` and passes the `occurrence` as drag data. Each `DayCell` calls `useDroppable({ id: cell.iso })` and adds a `.drop` class while a chip hovers over it, producing a cyan highlight. A `DragOverlay` in `App` renders a themed floating copy of the chip while dragging; the source chip dims via `.cy-chip-dragging`.

A `PointerSensor` with `activationConstraint: { distance: 5 }` requires five pixels of pointer travel before a press becomes a drag, so a plain click still opens the editor. Collision detection uses `pointerWithin`.

`onDragStart` records the active occurrence for the overlay. `onDragEnd` reads the dragged occurrence from `active.data` and the target ISO date from `over.id`. Dropping on the same day, or outside any cell, is a no-op. For a non-recurring event the move applies immediately. For a recurring event the scope dialog opens, and the move runs when the user confirms.

Chips in the "+N more" overflow popover are not draggable; move them by opening the editor and changing the date.

### 4.5 Recurrence
- Supported frequencies: **Daily, Weekly, Monthly, Yearly**, each with a positive **interval** (e.g., every 2 weeks). **Weekly** repeats on the **anchor date's weekday** (selecting multiple weekdays per week is out of scope for v1).
- End condition: **forever** or an optional **end date** (inclusive).
- Monthly recurrence uses the anchor day-of-month; months without that day (e.g., the 31st) are **skipped** (iCalendar `BYMONTHDAY` default). Yearly on Feb 29 occurs only in leap years.
- Editing, deleting, or dragging a recurring event prompts for a **scope** before applying (§7).

### 4.6 Persistence
- Events and categories persist in **IndexedDB** (object stores `events` and `categories`, both keyed by `id`) and reload on app start. Records are stored as the in-memory `CalendarEvent`/`Category` objects verbatim; reads filter through the `isCalendarEvent`/`isCategory` type guards.
- No data leaves the device. Clearing browser data clears the calendar.

### 4.7 Account balance
- Each event is a transaction (deposit or withdrawal). Each day cell shows the **cumulative running balance**: starts at `0`, equals all deposits minus withdrawals up to and including that day, and carries continuously across months. Computed by the pure `src/lib/balance` engine (`computeRunningBalances`): a per-event carry-in for transactions before the visible window plus the windowed per-day net, accumulated forward (recurrence iteration is uncapped so long/infinite series sum correctly). Balances render cyan when ≥ 0 and magenta when negative; the toolbar HUD shows the end-of-window balance. The balance reflects **all** events regardless of the active category filter.

---

## 5. Data Model

A single stored entity, `CalendarEvent`, where a one-off event is simply `recurrence: null`.

```ts
type CategoryColor = "cyan" | "magenta" | "yellow" | "green" | "orange";

type Category = {
  id: string;            // GUID (crypto.randomUUID()), stable across renames
  name: string;          // "Work"
  color: CategoryColor;
};

type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

type Recurrence = {
  freq: RecurrenceFreq;
  interval: number;        // >= 1
  endsOn: string | null;   // "YYYY-MM-DD" inclusive, or null = forever
};

type OccurrenceOverride = {
  occurrenceDate: string;  // "YYYY-MM-DD"; the original occurrence this override targets
  cancelled?: boolean;     // true => "this occurrence" deleted
  patch?: {                // "this occurrence" edited
    title?: string;
    categoryId?: string;
    amount?: number;
    direction?: TransactionDirection;
  };
};

type TransactionDirection = "deposit" | "withdrawal";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;                    // "YYYY-MM-DD"; for recurring events this is the series anchor/start
  categoryId: string;
  amount: number;
  direction: TransactionDirection;
  recurrence: Recurrence | null;   // null => one-off
  overrides: OccurrenceOverride[]; // only meaningful when recurrence !== null
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp
};
```

**Date-only storage:** dates are stored as plain `YYYY-MM-DD` strings (no time, no UTC conversion), so all-day events never drift across time zones.

**IndexedDB layout:** object stores `events` (each record embeds its `recurrence` and `overrides`) and `categories`, both `keyPath: "id"`. Given personal-scale data volume, all events are loaded into memory and occurrences are expanded per visible window.

**Type guards:** runtime validation (e.g., `isCalendarEvent`, `isRecurrenceFreq`, `isCategoryColor`) over `as` assertions, per `CLAUDE.md`.

---

## 6. Occurrence Expansion

Pure functions in `src/lib/recurrence` turn stored events into rendered occurrences for a date window `[windowStart, windowEnd]` (the visible 6-week grid):

1. **One-off** (`recurrence === null`): include if `date` is within the window.
2. **Recurring:** step from the anchor `date` by `interval × unit` until the date exceeds `min(windowEnd, endsOn ?? windowEnd)`. For each candidate occurrence date within the window:
   - Look up a matching `OccurrenceOverride`.
   - If `cancelled` → skip it.
   - If `patch` → apply patched fields over the base.
   - Otherwise → render base fields.
3. Each produced **`Occurrence`** carries: source `eventId`, resolved `date`, `title`, resolved `Category`, `amount`, `direction`, and `isRecurring`.

Occurrences are then grouped by date for the grid, and filtered by the active category filter.

### Date-shift helpers (`src/lib/recurrence`)

Four pure helpers support moving events to a different day. Each is exported and covered by tests in `src/lib/recurrence/tests.ts`.

- **`shiftISO(iso, days)`** shifts a `YYYY-MM-DD` string by `days` calendar days using date-fns `addDays` + `parseISO`, staying in local time. Negative values shift backward.
- **`daysBetweenISO(from, to)`** returns the signed whole-day count between two `YYYY-MM-DD` strings (`to - from`) using date-fns `differenceInCalendarDays`.
- **`shiftSeries(event, offsetDays)`** returns a copy of the event with `date`, every `override.occurrenceDate`, and `recurrence.endsOn` (when non-null) each shifted by `offsetDays`. Drives the "All events" move case; the occurrence count is unchanged.
- **`buildMovedFollowing(event, fromDate, toDate, id, nowISO)`** builds the new tail series for the "This and following" move case. The tail is anchored at `toDate`, carrying forward only overrides where `occurrenceDate >= fromDate`, each shifted by `daysBetweenISO(fromDate, toDate)`. `endsOn` is also shifted by the same offset; a `null` `endsOn` stays `null`. Paired with the existing `truncateBefore(event, fromDate)`, which ends the original series the day before.

---

## 7. Recurring Edit / Delete / Move Semantics

When the user saves, deletes, or drags a recurring event (`recurrence !== null`), a **scope prompt** (shadcn Dialog + RadioGroup, `src/components/RecurrenceScopeDialog`) asks which occurrences to affect. Non-recurring events skip the prompt.

The scope dialog supports three actions: `"edit"`, `"delete"`, and `"move"`. The title adjusts to match (`"Edit recurring event"`, `"Delete recurring event"`, `"Move recurring event"`). The scope options (This event / This and following / All events) are the same for all three actions.

| Scope | Edit behavior | Delete behavior | Move behavior |
| --- | --- | --- | --- |
| **This event** (single occurrence at date `D`) | Add/update an `OccurrenceOverride { occurrenceDate: D, patch }`. | Add `OccurrenceOverride { occurrenceDate: D, cancelled: true }`. | Cancel occurrence `D` on the series. Create a standalone (non-recurring) event at the drop date from the occurrence's resolved fields. The detached event loses its ↻ series link. |
| **This and following** (from date `D`) | Truncate the original series: set `recurrence.endsOn` to the day before `D`. Create a **new** `CalendarEvent` anchored at `D` with the edited fields, same recurrence rule, carrying forward overrides where `occurrenceDate >= D`. | Truncate the original series: set `recurrence.endsOn` to the day before `D`. No new event. | Truncate the original series (ends day before `D`). Create a new tail series anchored at the drop date via `buildMovedFollowing`. |
| **All events** (whole series) | Update the master event's fields/recurrence in place. | Delete the master event (and all its occurrences). | Slide the whole series by the drag offset via `shiftSeries`: anchor date, all override keys, and `endsOn` shift together. |

This mirrors iCalendar semantics (`EXDATE` / `RECURRENCE-ID` for single overrides; series-splitting for "this and following").

---

## 8. Validation & Error Handling

**Typed errors over strings** (`CLAUDE.md`): a `StorageError` class with a machine-readable `code`:

`UNAVAILABLE` · `QUOTA_EXCEEDED` · `BLOCKED` · `READ_FAILED` · `WRITE_FAILED` · `IMPORT_INVALID` · `EXPORT_FAILED`, plus an `isStorageError` guard.

- **Storage unavailable** (no IndexedDB, or private-browsing restrictions) → show a **non-blocking banner** warning that changes won't be saved this session, and keep the calendar usable in-memory. Never swallow the error silently. `CalendarContext` exposes a `loaded` flag; the banner renders only when `loaded && !storageAvailable` so it never flashes during the initial load.
- **Write/quota failures** → surface a banner/toast; do not lose the user's in-progress edit.
- **Forms & validation:** the event editor is built with **react-hook-form** wired to a **zod** schema (via `@hookform/resolvers`) and rendered through shadcn's `Form` primitives. Rules: title required and non-empty; recurrence `interval >= 1`; `endsOn` (if set) `>= ` anchor date. Validation runs on submit; submitting with invalid input is blocked and shows inline, accessible field errors.

---

## 9. UI & Layout

- **Full-viewport layout:** `HUD status line` → `toolbar` → `month console` (a bordered panel that flexes to consume all remaining height and holds the `weekday header` → `month grid`; it mirrors the landing preview's console frame but follows the active theme). On desktop the grid renders only the week-rows the visible month spans (4-6, via `inMonthWeekCount`), so day cells get more height; trailing weeks that fall entirely in the next month are dropped. Compact mode always renders the full 6 rows (see Responsive / compact mode).
- **Toolbar:** ‹ / month-year / › · **Today** · **category filter** · **+ New Event** (primary CTA).
- **Day cell:** date number; **today** highlight; dimmed out-of-month days; stacked **event chips** (with ↻ for recurring); **"+N more"** → **day popover**. A day cell shows as many event chips as fit its measured row height and collapses the rest into the "+N more" popover, so chips never clip. There is **no fixed maximum**: capacity is whatever the row can hold, so a taller window shows more chips rather than hiding them behind a trigger it has the room to avoid. `MonthGrid` measures one shared row height (every row is an equal `1fr` track) with a `ResizeObserver` and passes each cell the answer from `chipCapacity`; the "+N more" line is only reserved when the day's occurrences genuinely exceed what fits. When no chips fit, the trigger reads "N events" instead. Before the first measurement (and always under jsdom, whose `ResizeObserver` stub never fires) a cell has no limit to apply and renders every chip.
- **Event editor (Dialog):** built with shadcn `Form` + **react-hook-form**/zod. Fields: Title, Date (native `<input type="date">`), Category (`CategoryCombobox`: creatable combobox built on shadcn `Command` + `Popover`; backed by `useCategorySearch` for filtering and exact-match detection; pick existing or create a new name + color via `CategoryCreateRow`), Repeat (`NativeSelect`: Does-not-repeat / Daily / Weekly / Monthly / Yearly) with interval + optional end date; footer with **Delete**, **Cancel**, **Save**. The shadcn `calendar`/`Select` primitives remain available for future use.
- **Recurring scope dialog:** This event / This and following / All events (used for edit, delete, and move).
- **Move toast:** a `sonner` toast at the bottom center confirms every move and provides an Undo action. Styled to the cyberpunk panel look via `.cy-toast` / `.cy-toast-action` in `globals.css`.
- **Responsive / compact mode:** below 640px (Tailwind's `sm` breakpoint) the `useIsCompact()` hook (`src/hooks/useIsCompact/`, matchMedia-driven) switches the calendar to compact rendering. The grid always shows the full 6 week-rows (unlike desktop, which trims to the weeks the month spans). Day cells show up to 4 category-colored dots (plus a `+` marker when there are more) instead of full chips, and tapping a day selects it. Swiping the grid left or right changes months (left for next, right for previous), with a brief 180ms directional slide as feedback. The selected day's events, running balance, and an Add button appear in a `DayPanel` below the grid. The toolbar becomes two rows: navigation and an overflow menu (shadcn Popover) on row 1, the category legend on row 2; the menu holds SYNC, DATA, and CATEGORIES, and its trigger shows a bare attention dot when any item inside needs attention. Drag-and-drop is disabled in compact mode; events move between days by editing the date in the event editor. Dialogs cap their height at `85dvh` and scroll internally.
- **Empty state:** a styled prompt to create the first event when the calendar has none.
- **Landing page (first visit only):** `src/components/LandingPage` renders instead of the calendar until the visitor clicks the **Try Now** CTA. It stacks three bands: a hero (HUD status line, headline, supporting line, `.cy-cta` button), a full-width **preview console**, and a **spec grid** of four cells (Account / Storage / Sync / Price) built with the month grid's own construction (panel fills over a hairline `gap-px` background, 1px `--cy-line` outer border), each holding a mono HUD key, a display-face claim, and one supporting sentence. A footer with the MIT license and a source-repo link closes the page.

The console is the page's one bold element. It renders a static March 2026 built from the real `.cy-cell` / `.cy-chip` / `.cy-balance` markup, so it stays honest as the design system changes, and it carries a rail of month totals (deposits, withdrawals, month end). Its figures are never hand-written: `buildPreviewMonth` walks the transactions in `consts.ts` once and carries the running balance forward the way `src/lib/balance` does for real data, so the per-cell balances and the rail totals cannot drift from the events above them. The month is picked to show the product's point, not a best case: rent on the 1st overdraws the account for two days (magenta `.cy-balance-neg`) before the first paycheck lands. Below `sm`, where seven columns stop being readable, the grid is replaced by a **ledger tape**: the same month as a vertical list of date, chip, and running balance. Clicking Try Now sets a localStorage flag (`tuxbank:landing-dismissed`, see `src/lib/landingGate`) and swaps in the calendar; later visits with the flag boot straight into the app. Two flows bypass the landing page: a `#device-link=` URL (a device-link sign-in must surface its TOTP prompt immediately), and the sign-out storage wipe restores the flag before reloading so a signed-out user is not greeted as a first-time visitor.

---

## 10. Design Language: cyberpunk-inspired, sober

A flat, disciplined treatment where color carries meaning instead of decoration. This section is the canonical visual spec; the source-of-truth tokens live in `src/globals.css`.

### Palette: data ink, not decoration

Cyan is the only interface accent: navigation, links, the primary CTA, focus and selection state. All five accents (cyan, magenta, yellow, green, orange) are also available as user-assigned category colors. Beyond that, colors double up rather than staying reserved to one meaning: magenta is the error/destructive/negative-balance color (validation errors, destructive buttons, `.cy-balance-neg`); yellow marks today's cell and also flags offline sync status (`SyncAttentionBadge`); orange also flags sync-error status alongside its category use; green appears in exactly one place, the online HUD indicator (`.cy-hud .on`). Light and dark are independently designed token sets defined in `src/globals.css`, not one derived from the other.

**Light** (`:root`)

| Token | Hex | Role |
| --- | --- | --- |
| `--cy-bg` | `#eff2f6` | page background |
| `--cy-panel` | `#ffffff` | cards, dialogs, toolbar |
| `--cy-panel-2` | `#f7f9fb` | raised fill (today / selected / drop cell) |
| `--cy-line` | `#d6dde6` | borders |
| `--cy-hairline` | `#e6ebf1` | day-cell borders |
| `--cy-text` | `#1b2430` | body text |
| `--cy-text-strong` | `#0b1119` | headings, emphasis |
| `--cy-muted` | `#5c6d7f` | secondary text, HUD labels |
| `--cy-cyan` | `#0e7490` | interface accent |
| `--cy-magenta` | `#be123c` | withdrawals |
| `--cy-yellow` | `#b45309` | today |
| `--cy-green` | `#047857` | deposits |
| `--cy-orange` | `#c2410c` | category-only |

**Dark** (`@media (prefers-color-scheme: dark)`)

| Token | Hex | Role |
| --- | --- | --- |
| `--cy-bg` | `#0a0c11` | page background |
| `--cy-panel` | `#0d1119` | cards, dialogs, toolbar |
| `--cy-panel-2` | `#10151f` | raised fill (today / selected / drop cell) |
| `--cy-line` | `#1b2431` | borders |
| `--cy-hairline` | `#151c27` | day-cell borders |
| `--cy-text` | `#c8d4e0` | body text |
| `--cy-text-strong` | `#eaf2f8` | headings, emphasis |
| `--cy-muted` | `#6b7c8f` | secondary text, HUD labels |
| `--cy-cyan` | `#22d3ee` | interface accent |
| `--cy-magenta` | `#f0407a` | withdrawals |
| `--cy-yellow` | `#fbbf24` | today |
| `--cy-green` | `#34d399` | deposits |
| `--cy-orange` | `#fb923c` | category-only |

Category accents (`--cat-{color}` for cyan, magenta, yellow, green, orange) mirror the matching `--cy-*` accent value in each theme; components read them through `catColorVar` in `src/utils/categoryColor`.

### Effects: none

No glow anywhere: no outer glow, no colored drop-shadow, no `text-shadow`. Two `box-shadow`s exist, both zero-blur color fills rather than glows: the flat 2px inset left edge used for the day-cell highlight states (today / selected / drop, see Component styling below), and the 1px focus ring on form controls and buttons (see Focus below). No radial gradients, no CRT-style overlay lines, no background grid. No cut or angled corners: every surface is a flat fill with a straight 1px CSS border (`--cy-line` or `--cy-hairline`). Corners are square everywhere, controlled in one place: the shadcn `--radius` token is `0`, so every `rounded-*` utility on a primitive (inputs, selects, buttons, dialogs, popovers) computes flat and no per-component reset is needed. The exceptions are elements that are round by nature, which use `rounded-full` and do not read that token: category dots and the sync attention badge. The design system adds two animations, both described under Component styling: the month-change slide in the app, and the one-shot fill-in on the landing-page console. shadcn/Radix UI primitives (dialogs, popovers, toasts) keep their own built-in open/close transitions on top of that.

### Typography
- **Rajdhani** (600/700): display headings, month label, CTAs.
- **Chakra Petch**: general UI text.
- **JetBrains Mono**: all figures, date numbers, HUD readouts, field labels.

Day-cell type follows the source design mock. Chrome sits at 9-11px (`.cy-weekhead` 9px/`0.22em`, `.cy-cell-num` 11px/1.1, `.cy-balance` 10px) and the chip carries an 11px/1.25 title against an equally sized figure (`.cy-chip-amount`) at **weight 500**, tinted with the same category accent that draws the chip's left edge. Weight alone gives the figure its rank, because in a money calendar the number is what the eye goes to. JetBrains Mono 500 is imported in `src/main.tsx`; without that weight loaded the rule silently falls back to 400. The mock sets this figure at 10.5px, but px values are always whole numbers here (see CLAUDE.md), and 11px is visually indistinguishable.

Sizes for `.cy-weekhead`, `.cy-cell-num`, and `.cy-chip` live on the classes themselves, never at the call site. Two reasons: the landing preview reuses the same classes and has to stay identical, and a day cell's vertical budget is zero-sum, so `DAY_NUMBER_HEIGHT_PX` and `CHIP_HEIGHT_PX` in `MonthGrid/consts.ts` mirror these rules and are re-measured in a browser whenever they change.

### Component styling
- Event chips (`.cy-chip`): flat fill, a 2px left border in the category accent, no glow. The amount (`.cy-chip-amount`) takes that same accent, so the category reads twice in one chip; the title stays in the strong text ink. Baseline-aligned, with the amount pushed right by `ml-auto` (rather than the mock's `space-between`, which would strand the recurring **↻** marker in the middle).
- Primary CTA (`.cy-cta`): solid cyan fill, square corners, no glow.
- Dialogs (`.cy-dialog`): flat panel fill, 1px `--cy-line` border, `box-shadow: none`.
- Day-cell states `.today` / `.selected` / `.drop` share one grammar: a 2px inset left edge (`box-shadow: inset 2px 0 0 <color>`) over a `--cy-panel-2` fill. Source order in `globals.css` is the precedence rule: `.cy-cell.drop` is defined last, so a cell that is both today and an active drop target shows the cyan drop edge, since the drag affordance is the more urgent signal. `.cy-cell.out` (a day outside the current month) is a different treatment: a flat `--cy-bg` fill and a dimmed date numeral (`opacity: 0.45`), no box-shadow edge. When a cell is both `.out` and `.today`, the numeral opacity is forced back to `1` so the amber today color stays legible.
- Month-change feedback (`.cy-shift-next` / `.cy-shift-prev`): a 180ms directional slide (`translateX` plus an opacity fade), applied by `MonthGrid` and cleared on `animationend`. Disabled under `prefers-reduced-motion` (`animation: none !important`).
- Primary CTA hover (`.cy-cta:hover`): the cyan fill and border swap to `--cy-text-strong`. A flat inversion, not a glow or a lift.
- Focus (`:focus-visible`): a flat 2px cyan edge, never a soft ring. The shadcn primitives in `src/components/ui` draw it as a 1px `--ring` border plus a 1px hard ring, with the shadcn `--ring` token pointing at `--cy-cyan` so it follows the theme. `.cy-btn` and `.cy-nav` are also applied to raw buttons and selects that carry no such utilities, so they get the same edge from a 1px cyan `outline` at `outline-offset: 1px`. `.cy-cta` is already a cyan fill, which a cyan line would disappear into, so it focuses in `--cy-text-strong`, the same ink its hover inversion uses. A scroll container that holds focusable controls has to leave inline room for the ring (`-mx-1 px-1`) or it gets clipped; see the Gotchas in CLAUDE.md.
- Landing console (`.cy-console`): pins the **dark** token set in both themes. The accents are data ink and read most strongly on a dark surface, so on the light landing page the month renders as an instrument set on paper instead of a white box on grey. The values are copied from the `prefers-color-scheme: dark` block rather than invented, so the two must be kept in sync. The app's real calendar shares the console frame (a bordered panel around the grid) but follows the active theme instead of pinning this set.
- Landing fill-in (`.cy-land`): a 300ms `translateY` + fade on each console cell, staggered by an inline `animation-delay` of `LANDING_STAGGER_MS` per cell so the month reads left to right the way it accumulates. `animation-fill-mode: both` holds the from-state through the delay. Disabled under `prefers-reduced-motion`.

### Theming: light/dark (auto, follows OS)
- Both themes are selected automatically from `prefers-color-scheme`; there is **no in-app toggle and no persistence**. Pure CSS: no JS, no theme class. The one exemption is the landing page's preview console, which pins the dark ink set in both themes (see Landing console above).
- Every theme-able color is a CSS custom property: light values live in `:root`, dark values in `@media (prefers-color-scheme: dark) { :root { … } }`. The Tailwind `dark:` variant is media-query-driven (`@custom-variant dark (@media (prefers-color-scheme: dark))`), and `:root` sets `color-scheme: light dark` for native controls.
- Light and dark are **independently designed token sets**, not a derived pair: each theme picks its own surface, text, and accent values (see the Palette tables above) rather than inverting the other theme's numbers.
- Category accents are CSS tokens `--cat-{color}` (not a JS hex map); components reference them via `catColorVar` in `src/utils/categoryColor`.

---

## 11. Architecture & Project Structure

Client-side layered architecture; UI ← state (Context) ← pure logic (recurrence, dateGrid) ← storage (IndexedDB via `idb`; see §"Persistence: IndexedDB").

Per `CLAUDE.md` module conventions, each module is a **directory** named after its primary export, containing `index.ts(x)` and, as needed, `types.ts`, `consts.ts`, `tests.ts`; `index` re-exports the module's types/consts. Import from the module, not its internal files. No barrel-only files.

```
index.html                  # Vite HTML entry
src/
  main.tsx                  # Vite entry: fonts, globals.css, mounts <App />
  App.tsx                   # landing-page gate + calendar page composition
  globals.css               # Tailwind layers + cyberpunk-inspired design tokens
  components/
    CalendarToolbar/        # month nav, Today, category filter, New Event, HUD line
    MonthGrid/              # week-grid (desktop trims to weeks spanned; compact = 6 rows); consumes dateGrid + grouped occurrences
    DayCell/                # date number, today highlight, chips, "+N more"; droppable target
    EventChip/              # color-coded chip; accepts optional drag props for draggable use
    DraggableEventChip/     # wraps EventChip with useDraggable for cells (not the overflow popover)
    DayPanel/               # compact-mode selected-day detail: event chips, running balance, Add button
    DayEventsPopover/       # overflow list (shadcn Popover)
    CategoryCombobox/       # creatable combobox (shadcn Command + Popover); uses useCategorySearch + CategoryCreateRow
    ManageCategoriesDialog/ # rename / recolor / delete categories; search field + CategoryCreateRow for in-dialog creation
    CategoryCreateRow/      # "Create <name>" row with CategoryColorPicker; exports useCategorySearch hook
    CategoryColorPicker/    # row of selectable color swatches (used by CategoryCreateRow and ManageCategoriesDialog)
    CategoryDot/            # shared color swatch used by the picker and chips
    EventDialog/            # create/edit form (shadcn Form + react-hook-form/zod, Dialog/Select/Textarea + date picker)
    RecurrenceScopeDialog/  # This / This & following / All (shadcn Dialog + RadioGroup)
    DataDialog/             # JSON backup export/import (validate -> confirm -> swap) + guarded clear-all
    StorageUnavailableBanner/ # shown when storage fails; offers a reset when the DB is unopenable
    SyncDialog/             # optional account sync: create / sign-in / TOTP / recovery-key / change-password
    LandingPage/            # first-visit entry screen; Try Now CTA dismisses it via landingGate
  context/
    CalendarContext/        # visible month, events, CRUD actions (including moveEvent), filter state
    SyncContext/            # optional account-sync state machine; consume via useSync()
  hooks/
    useIsCompact/           # matchMedia hook; true below 640px (Tailwind sm breakpoint)
    useSwipeNavigation/     # compact-mode swipe left/right on the grid changes months
    useWheelNavigation/     # wheel/trackpad scroll on the grid changes months (down = next)
  lib/
    storage/                # IndexedDB (idb); StorageError + guards; JSON backup
    tabSync/                # cross-tab change signal (BroadcastChannel)
    recurrence/             # expand(window) + recurrence override/split/move helpers (pure)
    dateGrid/               # month -> 6x7 date matrix; inMonthWeekCount() for the weeks a month spans
    balance/                # running balance from deposits/withdrawals
    landingGate/            # localStorage flag for skipping the landing page on return visits
  types/                    # CalendarEvent, Category, Recurrence + type guards
  utils/
    categoryColor/          # PALETTE, DEFAULT_CATEGORY_COLOR, catColorVar
    formatCurrency/         # Intl.NumberFormat wrapper
    base64/                 # base64 encode/decode helpers (used by the sync layer)
  components/
    ui/                     # shadcn primitives (shadcn CLI default location)
```

State is shared via **React Context** rather than prop drilling (`CLAUDE.md`). Labels/formatting use **`Intl.DateTimeFormat`**; array/object work prefers **remeda** utilities where it improves clarity. Constants are named (no magic numbers); numeric literals ≥ 1000 use underscore separators.

### `CalendarContext` / `useCalendar()` API additions

`moveEvent` is the context method for moving an event to a different day:

```ts
moveEvent(
  occurrence: Occurrence,
  toDate: string,
  scope: EditScope,
): Promise<() => Promise<void>>
```

It branches on four cases driven by `scope` and whether the event recurs:

- **Non-recurring, or `scope === "all"` on a recurring event:** for a non-recurring event, sets `date` to `toDate`; for a recurring event, calls `shiftSeries` with `daysBetweenISO(occurrence.date, toDate)` so the whole timeline slides rigidly.
- **`scope === "this"` on a recurring event:** cancels the occurrence on its original day via `cancelOccurrence`, then creates a new standalone (non-recurring) `CalendarEvent` at `toDate` from the occurrence's resolved fields (`title`, `amount`, `categoryId`, `direction`). The detached event has `recurrence: null`.
- **`scope === "following"` on a recurring event:** truncates the original series to end the day before `occurrence.date` via `truncateBefore`, then creates a new tail series anchored at `toDate` via `buildMovedFollowing`.

`moveEvent` persists all writes through the same `persist()` / `putEvent` path as the other mutations, so cross-tab sync (the storage layer broadcasts after writes) and the storage-unavailable banner apply without additional wiring. After writing, it returns an **undo thunk**: a closure that snapshots the affected events before the move (with `null` marking events that did not exist before, such as the detached one-off or the new tail) and restores them by putting back each previous state or deleting events that are new. Calling the thunk re-persists the restored state through the same storage path.

---

## 12. Accessibility & Performance

- Grid uses semantic roles (`grid` / `row` / `gridcell`); **arrow keys** (←/→/↑/↓) move day focus via a **roving tabindex** in `MonthGrid`; **PageUp/PageDown** navigate months, as does a **vertical wheel/trackpad scroll** over the grid (down for next month, up for previous; one navigation per flick, and quick successive flicks chain month-per-flick, with the same 180ms directional slide as compact-mode swipe); **Enter** opens a day; dialogs trap focus (Radix-managed).
- **Color is never the only signal**: chips carry text + ↻; categories have names.
- **Contrast:** ensure text remains legible over the dark HUD (target WCAG AA for body text).
- **`prefers-reduced-motion`** honored (see §10).
- **Performance:** recurrence expansion is windowed to the visible month; events load once into context; loading indicators (if any) are delayed ~1s to avoid flashes (`CLAUDE.md`).

---

## 13. Testing Strategy

Vitest, **behavior-focused** (verify behavior, not implementation constants, per `CLAUDE.md`):

- **`dateGrid`:** correct 6×7 matrix, Sunday-first, accurate leading/trailing days across month/year boundaries; `inMonthWeekCount` reports the weeks a month spans (4-6).
- **`recurrence`:** daily/weekly/monthly/yearly expansion within a window; interval honored; `endsOn` boundary inclusive; month-skip (31st) and Feb-29 leap rules; overrides (cancel + patch); **split-series** ("this and following"); single-occurrence exception; date-shift helpers (`shiftISO`, `daysBetweenISO`, `shiftSeries`, `buildMovedFollowing`).
- **`storage`:** CRUD round-trips against fake-indexeddb (`resetDbForTests()` per test); errors map to the correct `StorageError` codes; backup export → validate → commit round-trips.
- **`tabSync`:** notifications cross channel instances and never echo to the
  sender; unsubscribe stops callbacks; both functions are no-ops without
  `BroadcastChannel`. Storage writes broadcast on success only (one signal per
  import). The provider refreshes on a notification and keeps per-tab filters.
- **Components** (RTL): create/edit/delete flow; **form validation** (empty title, `interval < 1`, or `endsOn` before the anchor block submission and surface field errors); the recurring-scope prompt appears only for recurring events; "+N more" opens the day popover; category filter hides/shows chips.

---

## 14. Non-Functional Requirements

- **Offline-first:** fully functional with no network after the first visit. A Workbox service worker (generated by `vite-plugin-pwa`, registered in `src/main.tsx`) precaches the entire build (JS, CSS, fonts, icons, `index.html`), so a cold load works with zero connectivity. Updates apply silently with no UI: the worker downloads new versions in the background, activates immediately, and the registration client reloads the page to pick up the new assets (in practice moments after a load, since update checks run at registration). Only precached files are served from cache; Supabase requests always go to the network.
- **No secrets / no logging of sensitive data** (`CLAUDE.md`), though v1 has no secrets.
- **`pnpm check` clean** (format, lint, typecheck) before commits.
- Reasonable bundle size: no calendar framework; only date-fns, Radix/shadcn, fonts.

---

## 15. Success Criteria (Acceptance)

1. Opening the app shows the current month full-screen in the cyberpunk theme.
2. A user can create, edit, and delete a one-off event; it persists across reload.
3. A user can create a recurring event (e.g., weekly), and it renders on the correct days within the visible month.
4. Editing/deleting/moving a recurring event prompts for scope, and **This / This-and-following / All** each behave per §7 and persist correctly.
5. "+N more" reveals all events for a day via the popover; the category filter hides/shows chips.
6. With storage unavailable (no IndexedDB), the app shows a non-blocking banner and remains usable in-memory.
7. `prefers-reduced-motion` disables the month-change slide animation.
8. All tests pass and `pnpm check` is clean.

---

## 16. Future Enhancements (Out of Scope for v1)

- Week / Day / Agenda views.
- Timed and multi-day events; drag-to-resize or drag-to-create (move by drag is supported for single-day events).
- Tags; search.
- Reminders/notifications; ICS or Google Calendar import/export/sync.
- Multi-device sync / accounts / backend (added after v1 as an optional, end-to-end-encrypted account sync; see Optional account sync).
- Manual theme toggle / alternate palettes (light & dark already follow the OS automatically).

---

## 17. Assumptions

- Single user. Multiple open tabs stay in sync via `src/lib/tabSync` with
  last-write-wins semantics; cross-device sync is available as an opt-in,
  end-to-end-encrypted account feature (see Optional account sync).
- Personal-scale data volume (hundreds to low thousands of events); in-memory expansion is acceptable.
- Modern evergreen browser with IndexedDB support.
- Sunday-first week (can be made configurable later).

## Persistence: IndexedDB

All data persists locally in **IndexedDB** via the
[`idb`](https://github.com/jakearchibald/idb) library (a thin promise wrapper).
The local database lives entirely in the browser profile; optional cloud sync is
a separate, encrypted layer (see Optional account sync).

- **Database:** `tuxbank`, version `2`. Object stores: `events` and
  `categories` (keyed by `id`), plus `tombstones` (deleted-row markers, keyed by
  `id`) and `syncMeta` (key-value; holds the sync cursor), both added for
  optional sync. The v1 to v2 upgrade backfills a per-row `updatedAt` on
  existing rows. Records are stored as the in-memory `CalendarEvent` /
  `Category` objects verbatim; there is no mapping layer.
- **Connection:** a lazily created, module-cached `openDB()` promise
  (`src/lib/storage/index.ts`). A missing `indexedDB` global or a failed open
  maps to `StorageError("UNAVAILABLE")`; the cache resets on failure so a later
  call can retry.
- **Reads** filter every record through the `isCalendarEvent` / `isCategory`
  type guards; corrupt or foreign records are skipped and never crash the app.
- **Errors:** every repository function throws a typed `StorageError`
  (`UNAVAILABLE | QUOTA_EXCEEDED | BLOCKED | READ_FAILED | WRITE_FAILED |
  IMPORT_INVALID | EXPORT_FAILED`).
- **Multi-tab:** no locking; IndexedDB supports concurrent connections. After
  every successful write the storage layer broadcasts a signal-only message on
  a `BroadcastChannel` (`src/lib/tabSync`); other tabs re-read events and
  categories from IndexedDB and update live. Last write wins: saving an edit
  whose event another tab deleted recreates it. Per-tab UI state (visible
  month, hidden-category filters) stays independent per tab.
- **Testing:** vitest swaps in a fresh `fake-indexeddb` `IDBFactory` per test
  via `resetDbForTests()` (`src/lib/storage/testing.ts`).

### Backup / restore (JSON)

- **Export** (`exportDatabase`): downloads a pretty-printed JSON snapshot named
  `tuxbank-backup-YYYY-MM-DD.json`:

  ```json
  {
    "app": "tuxbank",
    "schemaVersion": 1,
    "exportedAt": "2026-06-03T18:00:00.000Z",
    "events": [],
    "categories": []
  }
  ```

- **Import** is a staged, destructive replace, routed by sign-in state through
  `useSync().importData()`; the confirmation copy states the scope.
  `validateImport(text)` parses and validates the candidate (app marker,
  supported `schemaVersion`, every record passes its type guard) without
  touching the live database and returns an `ImportPreview`
  (`{ events, categories, schemaVersion }`) for the confirmation dialog.
  Signed in and unlocked, `commitImportSynced(text)` makes the backup the
  truth everywhere: it re-stamps every imported row to now, writes a fresh
  tombstone for every pre-import id the backup lacks, drops tombstones for
  ids the backup re-introduces, and keeps the sync cursor; a best-effort pull
  runs before the import (so rows this device has never seen get tombstoned
  too) and a sync runs after it to push the backup and its removals. Signed
  out or locked, `commitImportLocal(text)` replaces local data keeping the
  backup's original timestamps, clears tombstones, and drops the sync cursor,
  so the next sign-in merges backup and cloud last-write-wins without
  deleting anything from the account. Both run in a single `readwrite`
  transaction rolled back on failure (explicit abort), so a failed import
  never half-wipes data, and invalid input throws
  `StorageError("IMPORT_INVALID")`.

- **Clear all data** is a guarded full reset in the Data dialog: the user types
  the word `reset` to enable the destructive button, and the confirmation copy
  states whether the wipe reaches the cloud. `useSync().resetAllData()` routes
  the reset by sign-in state. Signed in and unlocked, `clearAllData()` clears
  the event and category stores and writes a tombstone for every former id in
  one `readwrite` transaction, keeping the tombstone store and the sync cursor,
  then pushes so the cloud account is cleared on every device. Signed out or
  locked, the reset instead signs out locally and runs `clearLocalData()`,
  which wipes all four stores (tombstones and cursor included) without
  recording anything, leaving the browser as if the app had never run; a later
  sign-in pulls the account's data untouched. The wipe runs inside
  `resetAllData()` rather than through the sign-out path so a failed wipe
  rejects and the dialog shows an error instead of closing as if it succeeded.
  Only an unlocked session can destroy cloud data.

## Optional account sync (end-to-end encrypted)

Sync is **optional and additive**. With no account the app is exactly as
described above: local-only, offline, no password. Signing in turns on an
encrypted cloud mirror, and IndexedDB stays the source of truth. The feature
spans `src/lib/{crypto,account,sync,supabase}`, `src/context/SyncContext`
(`useSync()`), and `src/components/SyncDialog`. The full design rationale is in
[the design spec](superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md).

### Backend (Supabase)

A managed Supabase project (Postgres + Auth). The browser talks to it directly
with the public publishable key; authorization is entirely Row Level Security,
so there is no server code of ours. Config lives in `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (public values, safe in the bundle; kept in
gitignored `.env.local`, template in `.env.example`). The applied schema is
recorded in `supabase/migrations/` (`0001_e2ee_sync.sql`). Step-by-step setup
instructions (create the project, apply the schema, configure auth, set the env
vars) live in [docs/sync.md](sync.md).

Three tables, all keyed by `user_id` (= `auth.users.id`):

- `events` and `categories`:
  `( id uuid, user_id uuid, updated_at timestamptz, deleted bool, nonce text, ciphertext text, primary key (user_id, id) )`.
  Only routing metadata is plaintext; the record's sensitive fields live inside
  `ciphertext` (base64). `deleted = true` is a tombstone. The primary key is
  composite on purpose: ids are client-generated and travel inside JSON
  backups, so the same id can exist under two accounts, and upserts (which
  PostgREST resolves on the primary key) must only ever conflict with the
  caller's own rows. A global `id` key would make a backup imported under a
  second account fail sync with RLS error 42501.
- `key_material`: per-user wrapped keys
  `( user_id pk, wrapped_dek, wrapped_dek_nonce, recovery_wrapped_dek, recovery_nonce, kdf_version, created_at )`.

**RLS** on every table combines a permissive owner policy
(`user_id = auth.uid()`) with a restrictive `aal2` policy
(`auth.jwt() ->> 'aal' = 'aal2'`). The `aal2` clause is what makes TOTP
mandatory at the database, not just in the UI.

### Encryption and keys (`src/lib/crypto`, `src/lib/account`)

Zero-knowledge: the server never holds a key it can decrypt with. Every
primitive comes from libsodium (`libsodium-wrappers-sumo`); no protocol is
hand-rolled.

- `KEK = Argon2id(password, salt = normalized email)` wraps a random 256-bit
  `DEK`. The DEK encrypts each record with XChaCha20-Poly1305 (a fresh nonce per
  write). Plaintext columns (`id`, `updated_at`, `deleted`) carry only routing
  metadata.
- `authSecret = Argon2id(password, email, distinct context)` is the value sent
  to Supabase auth, so the real password never leaves the device. The two
  derivations use different domain-separation contexts, so knowing one does not
  reveal the other.
- A one-time **recovery key** independently wraps the same DEK (the `recovery_*`
  columns), so a forgotten password is recoverable.
- A password change re-wraps only the small DEK blob (`rewrapForNewPassword`);
  data is never re-encrypted, and the recovery columns are untouched.

The pure key functions (`provisionAccountKeys`, `unlockWithPassword`,
`unlockWithRecoveryKey`, `rewrapForNewPassword`) live in `src/lib/account`
alongside the thin Supabase auth/MFA/key-material wrappers; base64 helpers are
shared in `src/utils/base64`.

### Local storage (`src/lib/storage`, DB v1)

The database opens at v1 and creates all four stores up front (`events`,
`categories`, `tombstones`, `syncMeta`); there is no migration history. Both
`CalendarEvent` and `Category` carry an `updatedAt`. Deleting a row writes a
tombstone; writing a row clears any tombstone for its id. A signed-out import
(`commitImportLocal`) clears all tombstones, while a signed-in import
(`commitImportSynced`) rewrites them: it tombstones ids the backup drops and
clears tombstones for ids it re-introduces (see the Import bullet above).
`applyRemoteDelete` removes a row **without** writing a
new tombstone, so an applied remote delete does not bounce back to the server.
`getSyncCursor` / `setSyncCursor` persist the sync cursor in `syncMeta`.

Opening the database distinguishes two failure modes. `UNAVAILABLE` means there
is no IndexedDB at all (e.g. a hostile private-mode context); nothing can be
done. `OPEN_FAILED` means the database exists but cannot be opened, almost always
because it was written by a newer, incompatible build (IndexedDB cannot
downgrade) or is corrupt. The latter is recoverable: `deleteDatabase()` drops the
whole database so the next open recreates an empty one. `CalendarContext` exposes
`storageResettable` (true on `OPEN_FAILED`) and `resetLocalData`, and the
`StorageUnavailableBanner` surfaces a confirm-gated "Reset local data" button
that deletes the database and reloads.

### Sync engine (`src/lib/sync`)

`runSync(dek, remote)` runs one last-write-wins push/pull cycle against a
`SyncRemote` interface (the real implementation wraps the Supabase client; tests
use an in-memory fake). A single ISO-timestamp **cursor** bounds each run. Pull
applies remote rows whose `updated_at` is strictly greater than the local copy
(decrypt and upsert, or delete); push uploads local rows and tombstones newer
than the cursor that were not just pulled (which prevents an echo). On the
**first sync** (no stored cursor) push uploads every local row regardless of
timestamp, so a row stamped at the epoch (e.g. restored from an old backup that
predates per-row timestamps) still reaches the cloud; a cursor is always
persisted afterward so later syncs stay incremental. Each row's payload is
encrypted with the DEK before it leaves the device. Known limitation:
last-write-wins by client timestamp is vulnerable to clock skew across devices,
which is acceptable for a single user.

### First-sync conflict

A first sync merges both sides last-write-wins, which is the wrong default when
a device that has been used offline signs in to an account that already holds
events. Event ids are random UUIDs, so the two sets almost never collide and the
user gets both interleaved with no warning.

`detectSignInConflict` (in `src/lib/sync`) returns the two event counts when all
three of these hold, and null otherwise:

1. no sync cursor is stored
2. the device has at least one event
3. the account has at least one non-deleted event row

Condition 3 uses `SyncRemote.count`, a Supabase `head: true, count: "exact"`
query filtered to `deleted = false`, so it transfers no ciphertext and an
account holding only tombstones reads as empty. Short-circuiting on the cursor
means it runs at most once per device, since the cursor is a single unscoped
value: signing out of one account and into another on the same device without
clearing local data carries the cursor over and skips the prompt.

Categories are not part of the trigger and follow whichever side the user keeps.

The gate sits at the top of `doSync` in `SyncContext`, so it covers every path
that can start a first sync: the TOTP confirm, device-link sign-in, a cached-key
resume on reload, window focus, network reconnect, and the debounced post-edit
sync. While a choice is pending the status is `choice`, nothing syncs in either
direction, and `unlocked` reads false so the Data dialog's reset and import stay
local-only.

Nothing is persisted about the pending question. Each resolution ends with a
sync that writes a cursor, so the condition goes false on its own, and a
resolution that fails or never runs correctly asks again. Merge is the
exception, since it changes neither side's emptiness, so a ref suppresses
re-prompting for the rest of the session.

The resolutions compose existing storage primitives rather than adding modes to
`runSync`:

- **merge** runs the sync unchanged
- **keep the account** calls `clearLocalData` (which writes no tombstones, so
  the account is untouched) and syncs, which pulls everything and pushes nothing
- **keep this device** captures `exportDatabase`, syncs so the device learns the
  account's ids, calls `commitImportSynced` with the captured backup (re-stamping
  local rows and tombstoning every account-only id), then syncs again to push

The export in keep-local must be captured before the first sync, otherwise the
account's rows get folded into the set being declared authoritative.

Accepted edge: if keep-local fails between its two syncs the device is left
merged, and re-running it would upload that merged set as truth. The status goes
to `error` and recovery is the Data dialog. This is the same window `importData`
already carries.

### Sync triggers, offline state, and the cached key

`SyncContext` drives the triggers: an initial sync on unlock/sign-in, on window
focus, on network reconnect (the `online` event), debounced after edits and
month navigation, and a manual "Sync now". Sync attempts are skipped while the
browser reports offline (`navigator.onLine` false): the status becomes
**offline** until the connection returns, and the sync dialog shows how many
local changes are waiting to push (rows and tombstones newer than the cursor).
Pull and push requests abort after 30 seconds so a dead connection fails into
the error state instead of hanging. The toolbar's SYNC button shows a persistent
badge (OFFLINE, LOCKED, ACTION, or ERROR) whenever sync needs attention, so a
stopped sync is visible without opening the dialog. The data key is held in a
ref and also cached on the device (the `dek` key in the `syncMeta` store, via
`setStoredDek`/`getStoredDek`), so a reload or restart resumes unlocked and
re-syncs instead of re-prompting. The cache is cleared only on sign-out
(`clearStoredDek`, and by the `clearLocalData` wipe). When a signed-in (`aal2`)
session finds no cached key (a new device, or after sign-out), the app falls back
to a **locked** state until the user re-enters their password.

### Auth, onboarding, and recovery flows (`SyncContext`, `SyncDialog`)

- **Create account:** sign up, then (email confirmation is required) a "confirm
  your email" screen. The first sign-in completes setup: enroll TOTP, reach
  `aal2`, generate keys, upload `key_material`, show the recovery key, and push
  local data.
- **Sign in (returning device):** password, TOTP challenge, fetch
  `key_material`, unlock the DEK, pull.
- **Unlock:** a persisted `aal2` session with no cached DEK (a new device, or
  after an explicit sign-out); re-enter the password, which re-caches the key.
  "No key material yet" is treated as first-time setup, not an error.
- **Change password / forgot password:** set a new password from the synced
  state, or recover from the locked state with the recovery key (which unlocks
  the DEK and sets a new password). Both support Supabase "Secure password
  change" by prompting for an emailed reauthentication code when required.

### Device linking (QR sign-in)

A signed-in, unlocked device can mint a sign-in QR from the sync dialog
("Link another device"). Generating it requires re-entering the password:
the app re-derives `authSecret` and the KEK with `deriveKeys`, validates
them by unwrapping the account's wrapped DEK, and encodes
`{ v, email, authSecret, kek }` (module `src/lib/deviceLink`) into a URL
fragment on the app origin: `#device-link=<base64url JSON>`. Fragments are
never sent in HTTP requests, so the secrets stay out of host logs.

Scanning the QR opens the app, which consumes and strips the fragment at
boot (`SyncProvider`), signs in with the carried `authSecret`, and lands on
the TOTP challenge; the carried KEK unwraps the fetched key material after
`aal2`, so no password is typed on the new device. RLS still gates all data
behind `aal2`, so the payload alone reads nothing. The payload is a
reusable credential equivalent to the password and is treated the same way:
shown only on demand behind a password check, never persisted or logged,
and invalidated by a password change (both secrets derive from it). A
device that is already signed in ignores scanned links.

### Security properties and accepted limitations

- Local IndexedDB is **plaintext at rest** (the same as local-only mode); E2EE
  protects data on the server and in transit. The app works with no password
  when signed out or locked.
- The data key is **cached at rest** in IndexedDB so a signed-in session stays
  unlocked across reloads and restarts until an explicit sign-out. Local records
  are already plaintext on the device, so this adds no local exposure beyond what
  is there already. It does mean a device holding the cache can decrypt the
  server copy without the password, so signing out is how to lock a shared
  device. Sign-out always clears this browser: it revokes the session, wipes
  every local store (events, categories, tombstones, the sync cursor, and the
  cached key), clears `localStorage` and `sessionStorage`, and reloads. It is
  guarded by a native confirm, and the account copy is untouched. Confirming
  runs a sync first so outstanding work reaches the account rather than being
  stranded by the wipe. A sync failure never blocks the sign-out: whatever is
  still unpushed afterwards (offline, or a failing account) gets a second
  confirm naming how many changes are about to be lost. The count is read from
  storage after the sync, not from the pre-sync render.
- Security is bounded by **password strength**. The app imposes no length or
  complexity rule beyond a non-empty value: TOTP is mandatory on every account,
  and composition rules mostly produce passwords people cannot remember. The
  create-account form says the password protects the encryption key and asks for
  a strong one, then trusts the user.
- A **lost authenticator** (no 2FA recovery factor exists) locks the user out of
  the cloud copy. Local data is unaffected; the path forward is a fresh account.
- A **forgotten password plus a lost recovery key** makes the cloud data
  unrecoverable by design (zero-knowledge). Local data is unaffected.
- The server sees record counts and modification timestamps; the sensitive
  fields are encrypted.
- Not built yet: a password-strength meter, fully-signed-out (no-session)
  password reset by email, and Realtime live push. Code-splitting/lazy-loading
  is deliberately avoided to keep the app offline-capable.

---

## Analytics

Vercel Web Analytics collects page views and a small set of product events.
`src/lib/analytics` owns the whole surface: `analyticsBeforeSend` (passed to
`<Analytics>` in `src/main.tsx`) and `trackEvent`.

**Privacy gate.** Both go through one check, `isTrackingOptedOut() === false`
from the `privacy-signals` package. A Do Not Track or Global Privacy Control
signal suppresses everything, and so does an unreadable signal: only an
explicit "no objection" sends. `beforeSend` returns `null` to cancel page
views, and `trackEvent` returns early so an opted-out visitor's events never
reach the queue. The check runs per event, so a signal that changes mid-session
takes effect immediately.

**Events.** Names are a closed union in `src/lib/analytics/types.ts`. Props
carry no user content (no titles, amounts, dates, categories, or emails).

| Event | Fired when | Props |
| --- | --- | --- |
| `landing-viewed` | The first-visit landing page renders | |
| `try-now-clicked` | The landing page's Try Now CTA enters the app | |
| `new-event-clicked` | The New Event button (full toolbar) or + Add (compact day panel) opens the editor | `layout` |
| `sync-opened` / `data-opened` / `categories-opened` | The matching toolbar button or compact menu item opens its dialog | `layout` |
| `data-exported` | A backup download finishes | |
| `data-imported` | A backup replaces the current data | `synced` |
| `data-cleared` | A confirmed "clear all data" finishes | `synced` |
| `account-created` | Signup succeeds, before 2FA setup or email confirmation | `confirmationRequired` |
| `signed-in` | The password or device link is accepted, before the 2FA challenge | `method` |

`layout` is `compact` or `full`; `synced` says whether the action also rewrote
the account's data on every device; `method` is `password` or `device-link`.
Dialog opens are tracked in `src/App.tsx`, data actions in `DataDialog` (on
success, not on click), and the account events in `SyncContext`, which is the
only place the outcome is observable (`createAccount` / `signIn` record errors
in state rather than throwing).
