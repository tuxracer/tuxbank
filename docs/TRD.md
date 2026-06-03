# TRD — Full-Page Cyberpunk Calendar

> Technical Reference Document. See [CLAUDE.md](../CLAUDE.md) for project conventions.

**Status:** Draft for review · **Date:** 2026-05-30 · **Owner:** Derek Petersen

A single-user, full-page **month calendar** web app with a **Cyberpunk 2077–inspired** interface. Events are created, edited, and deleted entirely in the browser and persist locally in **IndexedDB** (via the `idb` library) — no backend, no accounts. Events can repeat, and repeating events can be edited or deleted at three scopes (this occurrence / this and following / the whole series).

---

## 1. Goals & Non-Goals

### Goals
- A calendar that **fills the entire viewport** and is the whole app — no chrome competing for space.
- A genuinely **stunning, cohesive cyberpunk aesthetic** (neon-on-black, angular HUD), not a generic theme.
- Fast, fully **client-side** personal scheduling: create/edit/delete events with **no sign-in and no network dependency**.
- **Local persistence** that survives reloads via IndexedDB.
- Support **recurring events** with familiar Google-Calendar-style edit/delete scopes.

### Non-Goals (v1)
- No authentication, multi-user, sharing, or sync across devices.
- No backend, database server, or API routes for event data.
- No timed events (no start/end times), no multi-day events, no drag-and-drop.
- No week / day / agenda views (month view only).
- No reminders/notifications; no external calendar (Google/ICS) sync. (A whole-database JSON backup export/restore *is* supported — see the Backup / restore section.)

---

## 2. Target User & Use Case

A single person managing their own schedule of **all-day, date-based events** — meetings, reminders, birthdays, recurring obligations ("pay rent", "weekly standup"). The calendar is opened on a desktop browser as a focused, full-screen tool. All data lives on that device.

---

## 3. Tech Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js (App Router)** | Calendar page is a client component (`'use client'`); deployable as a static client app. |
| Language | **TypeScript** (ESM) | Per repo conventions in `CLAUDE.md`. |
| UI library | **React** | — |
| Styling | **Tailwind CSS** | Utility-first; cyberpunk design tokens defined as CSS variables in `globals.css`. |
| Components | **shadcn/ui** (Radix primitives) | Dialog, Select, Popover, RadioGroup, Button, Input, Textarea, Label, Form — restyled to the cyberpunk theme. |
| Forms | **react-hook-form** + **zod** (via `@hookform/resolvers`) | Form state & validation for the event editor; drives shadcn's `Form` component and its accessible field errors. |
| Date math | **date-fns** | Grid generation, recurrence stepping, comparisons. |
| Date picker | **Native `<input type="date">`** | Used for the event form's Date field; main month grid is custom-built. The shadcn `calendar` primitive remains available for future use. |
| Persistence | **IndexedDB** via **idb** | Two object stores (events, categories); see §"Persistence: IndexedDB". |
| Fonts | **Rajdhani**, **Chakra Petch**, **Share Tech Mono** | Loaded via `next/font`. Display / UI / data, respectively. |
| Testing | **vitest** + **@testing-library/react** | Behavior-focused tests per `CLAUDE.md`; storage tests run against fake-indexeddb. |

> **As-built stack versions:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, zod v4, react-day-picker v10.

> **Build note:** `package.json` scripts map to Next: `pnpm dev` → `next dev`, `pnpm build` → `next build`, `pnpm start` → `next start`. `pnpm test` runs vitest. `pnpm check` continues to run format + lint + typecheck and must pass before commits.

---

## 4. Functional Requirements

### 4.1 Month view & navigation
- On load, the calendar shows the **current month** in the viewer's local time zone, filling the viewport (`100dvh`).
- A **7-column grid** (Sunday-first) renders a fixed **6-week (6×7) matrix** so layout height is stable; leading/trailing days from adjacent months are shown **dimmed**.
- The **today** cell is visually emphasized (neon glow).
- **Toolbar** provides: previous month (‹), next month (›), current **month/year label**, **Today** (jump to current month), a **category filter**, and **+ New Event**.
- A **HUD status line** shows decorative/real system context (e.g., app name, `LOCAL_DB::INDEXEDDB`, record count).

### 4.2 Events
- An event has: **title** (required), **date** (required, single all-day date), **category** (required; its color comes from a preset 5-color palette), an **amount** (required, > 0) with a **deposit/withdrawal direction** (required), **notes** (optional), and an optional **recurrence** rule.
- Events are **all-day and single-day** — no times, no multi-day spans.
- Day cells render events as **color-coded neon chips**. Recurring occurrences show a **↻** marker.
- When a day has more chips than fit, it collapses to **"+N more"**, which opens a **day popover** listing all of that day's events.

### 4.3 Categories
- Categories are **user-managed and persisted** (no presets — the store starts empty for a fresh user). Each has a name and a neon color from the 5-color palette (`cyan`, `magenta`, `yellow`, `green`, `orange`).
- **Created** inline via a creatable combobox in the event editor (pick an existing one or type a new name + pick a color); **renamed / recolored / deleted** in a dedicated **Manage Categories** dialog opened from the toolbar.
- Each category has an opaque **GUID** `id` (`crypto.randomUUID()`), generated at creation and stable across renames. Categories live in their own object store (see §4.6); events reference a category by id, so renaming or recoloring propagates to every event that uses it.
- **Names are unique, case-insensitively** (`categoryKey(name) = name.trim().toLowerCase()` is the match key): creating a name that already exists selects the existing category instead of duplicating it, and renaming to a name another category already uses is rejected inline in the Manage dialog.
- **Deleting an in-use category** prompts a confirm noting how many events use it; on delete its events keep the now-missing id and render as **Uncategorized** (a neutral cyan fallback) until re-categorized.
- The toolbar **category filter** is **per category** — a toggle per category currently in use (plus an **Uncategorized** toggle when orphaned events exist); each can be turned on/off independently, all shown by default. The filter affects which event chips display, not the running balance (§4.7).

### 4.4 Create / edit / delete (CRUD)
- **Create:** clicking **+ New Event** or an empty day opens the **Event editor** (shadcn Dialog). Clicking a day prefills its date.
- **Edit/View:** clicking an event chip opens the editor populated with that event.
- **Delete:** available within the editor.
- **No drag-and-drop** in v1.
- The editor validates input on submit (see §8): invalid input is blocked and surfaces inline, accessible field errors.

### 4.5 Recurrence
- Supported frequencies: **Daily, Weekly, Monthly, Yearly**, each with a positive **interval** (e.g., every 2 weeks). **Weekly** repeats on the **anchor date's weekday** (selecting multiple weekdays per week is out of scope for v1).
- End condition: **forever** or an optional **end date** (inclusive).
- Monthly recurrence uses the anchor day-of-month; months without that day (e.g., the 31st) are **skipped** (iCalendar `BYMONTHDAY` default). Yearly on Feb 29 occurs only in leap years.
- Editing or deleting a recurring event prompts for a **scope** before applying (§7).
- Changing an event's **date** is supported for **one-off events** and **whole-series** edits only; per-occurrence date moves are out of scope for v1.

### 4.6 Persistence
- Events and categories persist in **IndexedDB** (object stores `events` and `categories`, both keyed by `id`) and reload on app start. Records are stored as the in-memory `CalendarEvent`/`Category` objects verbatim; reads filter through the `isCalendarEvent`/`isCategory` type guards.
- No data leaves the device. Clearing browser data clears the calendar.

### 4.7 Account balance
- Each event is a transaction (deposit or withdrawal). Each day cell shows the **cumulative running balance**: starts at `0`, equals all deposits minus withdrawals up to and including that day, and carries continuously across months. Computed by the pure `src/lib/balance` engine (`computeRunningBalances`) — a per-event carry-in for transactions before the visible window plus the windowed per-day net, accumulated forward (recurrence iteration is uncapped so long/infinite series sum correctly). Balances render cyan when ≥ 0 and magenta when negative; the toolbar HUD shows the end-of-window balance. The balance reflects **all** events regardless of the active category filter.

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
  occurrenceDate: string;  // "YYYY-MM-DD" — the original occurrence this override targets
  cancelled?: boolean;     // true => "this occurrence" deleted
  patch?: {                // "this occurrence" edited
    title?: string;
    categoryId?: string;
    notes?: string;
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
  notes?: string;
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
3. Each produced **`Occurrence`** carries: source `eventId`, resolved `date`, `title`, resolved `Category`, `amount`, `direction`, `notes`, and `isRecurring`.

Occurrences are then grouped by date for the grid, and filtered by the active category filter.

---

## 7. Recurring Edit / Delete Semantics

When the user saves or deletes an event whose `recurrence !== null`, a **scope prompt** (shadcn Dialog + RadioGroup) asks which occurrences to affect. Non-recurring events skip the prompt.

| Scope | Edit behavior | Delete behavior |
| --- | --- | --- |
| **This event** (single occurrence at date `D`) | Add/update an `OccurrenceOverride { occurrenceDate: D, patch }`. | Add `OccurrenceOverride { occurrenceDate: D, cancelled: true }`. |
| **This and following** (from date `D`) | Truncate the original series: set `recurrence.endsOn` to the day before `D`. Create a **new** `CalendarEvent` anchored at `D` with the edited fields, same recurrence rule, carrying forward overrides where `occurrenceDate >= D`. | Truncate the original series: set `recurrence.endsOn` to the day before `D`. No new event. |
| **All events** (whole series) | Update the master event's fields/recurrence in place. | Delete the master event (and all its occurrences). |

This mirrors iCalendar semantics (`EXDATE` / `RECURRENCE-ID` for single overrides; series-splitting for "this and following").

---

## 8. Validation & Error Handling

**Typed errors over strings** (`CLAUDE.md`): a `StorageError` class with a machine-readable `code`:

`UNAVAILABLE` · `QUOTA_EXCEEDED` · `BLOCKED` · `READ_FAILED` · `WRITE_FAILED` · `IMPORT_INVALID` · `EXPORT_FAILED`, plus an `isStorageError` guard.

- **Storage unavailable** (no IndexedDB, or private-browsing restrictions) → show a **non-blocking banner** ("Local storage unavailable — changes won't be saved this session") and keep the calendar usable in-memory. Never swallow the error silently. `CalendarContext` exposes a `loaded` flag; the banner renders only when `loaded && !storageAvailable` so it never flashes during the initial load.
- **Write/quota failures** → surface a banner/toast; do not lose the user's in-progress edit.
- **Forms & validation:** the event editor is built with **react-hook-form** wired to a **zod** schema (via `@hookform/resolvers`) and rendered through shadcn's `Form` primitives. Rules: title required and non-empty; recurrence `interval >= 1`; `endsOn` (if set) `>= ` anchor date. Validation runs on submit; submitting with invalid input is blocked and shows inline, accessible field errors.

---

## 9. UI & Layout

- **Full-viewport layout:** `HUD status line` → `toolbar` → `weekday header` → `month grid` (the grid flexes to consume all remaining height).
- **Toolbar:** ‹ / month-year / › · **Today** · **category filter** · **+ New Event** (primary CTA).
- **Day cell:** date number; **today** glow; dimmed out-of-month days; stacked neon **event chips** (with ↻ for recurring); **"+N more"** → **day popover**.
- **Event editor (Dialog):** built with shadcn `Form` + **react-hook-form**/zod. Fields: Title, Date (native `<input type="date">`), Category (creatable combobox — shadcn `Command` + `Popover`; pick existing or create a new name + color), Notes (Textarea), Repeat (native `<select>`: Does-not-repeat / Daily / Weekly / Monthly / Yearly) with interval + optional end date; footer with **Delete**, **Cancel**, **Save**. The shadcn `calendar`/`Select` primitives remain available for future use.
- **Recurring scope dialog:** This event / This and following / All events.
- **Responsive:** desktop-first full-page grid. On narrow screens, cells shrink and chips collapse to **colored dots with a count**; full details via the day popover.
- **Empty state:** a styled prompt to create the first event when the calendar has none.

---

## 10. Design Language — "Night City"

A bold, cohesive **Cyberpunk 2077–inspired** treatment. This section is the canonical visual spec; final pixel-level polish happens during implementation.

### Palette — **cyan/magenta synthwave-forward**
- **Dominant neons:** cyan `#00F0FF` and magenta `#FF2A6D`.
- **Yellow `#FCEE0A`** used sparingly as a rare spark/highlight (not the primary accent).
- **Supporting category neons:** green `#00FF9F`, orange `#FF9F1C`.
- **Backgrounds:** near-black `#07080D` / panels `#0B0E16`, with faint cyan/magenta radial glows.

### Effects — **full HUD**
- Subtle **scanline** overlay and a faint background **grid**.
- **Neon glow** (text-shadow / box-shadow) on accents, chips, and the today cell.
- **Glitch** flickers on key transitions (e.g., month change, dialog open) and hover.
- **Angular clipped panels** (cut corners via `clip-path`) and **corner brackets**.
- **`prefers-reduced-motion`:** disable glitch/scanline animation and flicker; retain the static neon look.

### Typography
- **Rajdhani** (600/700) — display headings, month label, CTAs.
- **Chakra Petch** — general UI text.
- **Share Tech Mono** — data, date numbers, HUD readouts, field labels.

### Component styling
- Event chips: dark fill, neon left-border + matching glow, clipped corner.
- Primary CTA: neon fill with clipped corners and glow.
- Dialogs: dark glass panels, neon border, corner brackets, mono uppercase labels.
- Chamfered panels (`.cy-dialog`, `.cy-toolbar`, `.cy-cell`) split shape from border: a `::before` `clip-path` paints the dark fill, and `<CyberFrame>` (`src/components/CyberFrame`) draws the neon border as an SVG vector stroke so it stays a uniform width/brightness on the 45° chamfers (a CSS clip-path fill rasterizes diagonal edges brighter than straight ones, leaving square corners comparatively dark). CyberFrame props (`chamfer`, `corners`, `color`) must match each host's `::before` shape: dialogs cut top-right + bottom-left (cyan); the toolbar likewise (dim `--cy-line`); cells cut only top-right (`--cy-line`, or `--cy-yellow` on today).

### Theming — light/dark (auto, follows OS)
- Both themes are selected automatically from `prefers-color-scheme`; there is **no in-app toggle and no persistence**. Pure CSS — no JS, no theme class.
- Every theme-able color is a CSS custom property: light values live in `:root`, dark values in `@media (prefers-color-scheme: dark) { :root { … } }`. The Tailwind `dark:` variant is media-query-driven (`@custom-variant dark (@media (prefers-color-scheme: dark))`), and `:root` sets `color-scheme: light dark` for native controls.
- **Dark** is the original neon-on-black palette (unchanged). **Light** (Direction C — neutral/minimal) uses near-white surfaces, slate text, category/accent hues darkened to ~700 shades for contrast, and drops scanlines, body glows, and neon `box-/text-shadow` glows (glow tokens resolve to `transparent`).
- Category accents are CSS tokens `--cat-{color}` / `--cat-{color}-glow` (not a JS hex map); components reference them via `catColorVar` / `catGlowVar` in `src/utils/categoryColor`.
- `<CyberFrame>` borders re-theme for free because their stroke color is already a `var(--cy-*)` token; on a light surface the border reads as a dark line whose width stays uniform across the 45° chamfers via the same SVG-stroke mechanism (not a `clip-path` border).

---

## 11. Architecture & Project Structure

Client-side layered architecture; UI ← state (Context) ← pure logic (recurrence, dateGrid) ← storage (IndexedDB via `idb`; see §"Persistence: IndexedDB").

Per `CLAUDE.md` module conventions — each module is a **directory** named after its primary export, containing `index.ts(x)` and, as needed, `types.ts`, `consts.ts`, `tests.ts`; `index` re-exports the module's types/consts. Import from the module, not its internal files. No barrel-only files.

```
src/
  app/
    layout.tsx              # root layout, next/font registration
    page.tsx                # 'use client' calendar page
    globals.css             # Tailwind layers + cyberpunk tokens & overlays
  components/
    CalendarToolbar/        # month nav, Today, category filter, New Event, HUD line
    MonthGrid/              # 6x7 grid; consumes dateGrid + grouped occurrences
    DayCell/                # date number, today glow, chips, "+N more"
    EventChip/              # neon chip
    CyberFrame/             # SVG vector-stroke neon border for chamfered panels (.cy-dialog, .cy-toolbar, .cy-cell)
    DayEventsPopover/       # overflow list (shadcn Popover)
    EventDialog/            # create/edit form (shadcn Form + react-hook-form/zod, Dialog/Select/Textarea + date picker)
    RecurrenceScopeDialog/  # This / This & following / All (shadcn Dialog + RadioGroup)
    DataDialog/             # JSON backup export/import (validate -> confirm -> swap)
  context/
    CalendarContext/        # visible month, events, CRUD actions, filter state
  lib/
    storage/                # IndexedDB (idb); StorageError + guards; JSON backup
    recurrence/             # expand(window) + recurrence override/split helpers (pure)
    dateGrid/               # month -> 6x7 date matrix
  types/                    # CalendarEvent, Category, Recurrence + type guards
  components/
    ui/                     # shadcn primitives (shadcn CLI default location)
```

State is shared via **React Context** rather than prop drilling (`CLAUDE.md`). Labels/formatting use **`Intl.DateTimeFormat`**; array/object work prefers **remeda** utilities where it improves clarity. Constants are named (no magic numbers); numeric literals ≥ 1000 use underscore separators.

---

## 12. Accessibility & Performance

- Grid uses semantic roles (`grid` / `row` / `gridcell`); **arrow keys** (←/→/↑/↓) move day focus via a **roving tabindex** in `MonthGrid`; **PageUp/PageDown** navigate months; **Enter** opens a day; dialogs trap focus (Radix-managed).
- **Color is never the only signal** — chips carry text + ↻; categories have names.
- **Contrast:** ensure text remains legible over the dark HUD (target WCAG AA for body text).
- **`prefers-reduced-motion`** honored (see §10).
- **Performance:** recurrence expansion is windowed to the visible month; events load once into context; loading indicators (if any) are delayed ~1s to avoid flashes (`CLAUDE.md`).

---

## 13. Testing Strategy

Vitest, **behavior-focused** (verify behavior, not implementation constants — `CLAUDE.md`):

- **`dateGrid`:** correct 6×7 matrix, Sunday-first, accurate leading/trailing days across month/year boundaries.
- **`recurrence`:** daily/weekly/monthly/yearly expansion within a window; interval honored; `endsOn` boundary inclusive; month-skip (31st) and Feb-29 leap rules; overrides (cancel + patch); **split-series** ("this and following"); single-occurrence exception.
- **`storage`:** CRUD round-trips against fake-indexeddb (`resetDbForTests()` per test); errors map to the correct `StorageError` codes; backup export → validate → commit round-trips.
- **Components** (RTL): create/edit/delete flow; **form validation** (empty title, `interval < 1`, or `endsOn` before the anchor block submission and surface field errors); the recurring-scope prompt appears only for recurring events; "+N more" opens the day popover; category filter hides/shows chips.

---

## 14. Non-Functional Requirements

- **Offline-first:** fully functional with no network after initial load.
- **No secrets / no logging of sensitive data** (`CLAUDE.md`) — though v1 has no secrets.
- **`pnpm check` clean** (format, lint, typecheck) before commits.
- Reasonable bundle size — no calendar framework; only date-fns, Radix/shadcn, fonts.

---

## 15. Success Criteria (Acceptance)

1. Opening the app shows the current month full-screen in the cyberpunk theme.
2. A user can create, edit, and delete a one-off event; it persists across reload.
3. A user can create a recurring event (e.g., weekly), and it renders on the correct days within the visible month.
4. Editing/deleting a recurring event prompts for scope, and **This / This-and-following / All** each behave per §7 and persist correctly.
5. "+N more" reveals all events for a day via the popover; the category filter hides/shows chips.
6. With storage unavailable (no IndexedDB), the app shows a non-blocking banner and remains usable in-memory.
7. `prefers-reduced-motion` disables animated effects while preserving the neon look.
8. All tests pass and `pnpm check` is clean.

---

## 16. Future Enhancements (Out of Scope for v1)

- Week / Day / Agenda views.
- Timed and multi-day events; drag-and-drop create/move/resize.
- Tags; search.
- Reminders/notifications; ICS or Google Calendar import/export/sync.
- Multi-device sync / accounts / backend.
- Manual theme toggle / alternate palettes (light & dark already follow the OS automatically).

---

## 17. Assumptions

- Single user on a single device; no concurrent editing.
- Personal-scale data volume (hundreds–low-thousands of events) — in-memory expansion is acceptable.
- Modern evergreen browser with IndexedDB support.
- Sunday-first week (can be made configurable later).

## Persistence: IndexedDB

All data persists locally in **IndexedDB** via the
[`idb`](https://github.com/jakearchibald/idb) library (a thin promise wrapper).
No backend; the database lives entirely in the browser profile.

- **Database:** `tuxbank`, version `1`, two object stores — `events` and
  `categories` — both keyed by `id` (`keyPath: "id"`). Records are stored as
  the in-memory `CalendarEvent` / `Category` objects verbatim; there is no
  mapping layer.
- **Connection:** a lazily created, module-cached `openDB()` promise
  (`src/lib/storage/index.ts`). A missing `indexedDB` global or a failed open
  maps to `StorageError("UNAVAILABLE")`; the cache resets on failure so a later
  call can retry.
- **Reads** filter every record through the `isCalendarEvent` / `isCategory`
  type guards — corrupt or foreign records are skipped, never crash the app.
- **Errors:** every repository function throws a typed `StorageError`
  (`UNAVAILABLE | QUOTA_EXCEEDED | BLOCKED | READ_FAILED | WRITE_FAILED |
  IMPORT_INVALID | EXPORT_FAILED`).
- **Multi-tab:** no locking — IndexedDB supports concurrent connections. Tabs
  don't live-sync state; last write wins and a refresh shows other-tab changes.
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

- **Import** is a staged, destructive replace. `validateImport(text)` parses
  and validates the candidate (app marker, supported `schemaVersion`, every
  record passes its type guard) without touching the live database and returns
  an `ImportPreview` (`{ events, categories, schemaVersion }`) for the
  confirmation dialog. `commitImport(text)` clears both stores and writes all
  records in a single `readwrite` transaction — the transaction is rolled back
  on failure (explicit abort), so a failed import never half-wipes data. Any
  invalid input throws `StorageError("IMPORT_INVALID")`.
