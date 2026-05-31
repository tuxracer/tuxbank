# Cyberpunk Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-page, single-user month calendar (Next.js + React + TypeScript) with a Cyberpunk 2077–inspired UI, local IndexedDB persistence, and recurring events editable at three scopes.

**Architecture:** 100% client-side. Pure logic (date grid, recurrence expansion + mutation) and an IndexedDB repository sit beneath a React Context that holds calendar state and CRUD actions. UI components (custom month grid + shadcn/ui dialogs) consume the context. No backend, no auth.

**Tech Stack:** Next.js (App Router) · TypeScript/ESM · Tailwind CSS · shadcn/ui (Radix) · react-hook-form + zod · date-fns · `idb` · vitest + Testing Library + fake-indexeddb.

**Spec:** [docs/TRD.md](../../TRD.md). Read it before starting. Follow [CLAUDE.md](../../../CLAUDE.md) conventions: ESM imports, arrow functions, named imports, type guards over `as`, named constants, numeric separators, module = directory with `index.ts(x)` re-exporting `types.ts`/`consts.ts`, behavior-focused tests.

---

## File Structure

```
src/
  app/
    layout.tsx              # fonts + root html/body
    page.tsx                # 'use client' screen: provider + orchestration
    globals.css             # Tailwind import + cyberpunk design system
  components/
    ui/                     # shadcn-generated primitives (button, dialog, ...)
    EventChip/index.tsx     # one neon event chip
    DayEventsPopover/index.tsx
    DayCell/index.tsx       # date number, today glow, chips, "+N more"
    MonthGrid/{index.tsx,tests.tsx}
    CalendarToolbar/index.tsx
    EventDialog/{index.tsx,schema.ts,tests.tsx}
    RecurrenceScopeDialog/index.tsx
  context/
    CalendarContext/{index.tsx,tests.tsx}
  lib/
    dateGrid/{index.ts,tests.ts}
    recurrence/{index.ts,types.ts,consts.ts,tests.ts}
    storage/{index.ts,types.ts,tests.ts}
  types/
    index.ts                # domain types + guards (re-exports consts)
    consts.ts               # preset categories + neon hex palette
vitest.config.ts
vitest.setup.ts
```

> **Note (deviation from TRD §11):** shadcn primitives live in `src/components/ui/` (the shadcn CLI default) rather than `src/ui/`. Recurrence override/split helpers live inside `src/lib/recurrence` rather than the context, keeping mutation logic pure and testable.

---

## Task 1: Initialize the Next.js app

**Files:**
- Create: project scaffold (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`, `eslint`, Tailwind/PostCSS configs)

- [ ] **Step 1: Scaffold with create-next-app (non-interactive)**

Run from the repo root (the directory already contains `CLAUDE.md`, `LICENSE`, `README.md`, `.gitignore`, `docs/`). Scaffold into a temp dir then move files in, to avoid the "directory not empty" prompt:

```bash
pnpm create next-app@latest .tmp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
# move generated files into the repo root without clobbering existing files
rsync -a --ignore-existing .tmp-app/ ./
# bring over the files we DO want to overwrite/merge
cp .tmp-app/package.json package.json
cp .tmp-app/tsconfig.json tsconfig.json
cp -r .tmp-app/src/app/* src/app/ 2>/dev/null || true
rm -rf .tmp-app
```

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
pnpm add date-fns idb react-hook-form zod @hookform/resolvers
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event fake-indexeddb prettier
```

- [ ] **Step 3: Set scripts in `package.json`**

Replace the `"scripts"` block with:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write \"**/*.{ts,tsx,css,md}\"",
    "check": "prettier --check \"**/*.{ts,tsx,css,md}\" && eslint . && tsc --noEmit"
  }
}
```

- [ ] **Step 4: Verify the app builds and type-checks**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: type-check passes; `next build` completes with a successful compile.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript and Tailwind"
```

---

## Task 2: Configure Vitest + Testing Library + fake-indexeddb

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Test: `src/app/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 2: Write `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

- [ ] **Step 3: Write a smoke test**

Create `src/app/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("provides a fake indexedDB global", () => {
    expect(typeof indexedDB).not.toBe("undefined");
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm test`
Expected: 2 passing tests; `indexedDB` global is defined.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts vitest.setup.ts src/app/smoke.test.ts package.json
git commit -m "test: configure vitest, testing-library, and fake-indexeddb"
```

---

## Task 3: Initialize shadcn/ui and add primitives

**Files:**
- Create: `components.json`, `src/components/ui/*`

- [ ] **Step 1: Initialize shadcn (non-interactive, neutral base)**

```bash
pnpm dlx shadcn@latest init -d -b neutral
```

`-d` accepts defaults; `-b neutral` sets the base color. This writes `components.json`, CSS variables into `src/app/globals.css`, and a `cn` util at `src/lib/utils.ts`.

- [ ] **Step 2: Add the primitives we need**

```bash
pnpm dlx shadcn@latest add button dialog select popover radio-group input textarea label form calendar
```

- [ ] **Step 3: Verify primitives import and type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes. Files exist under `src/components/ui/` (e.g. `button.tsx`, `dialog.tsx`, `form.tsx`, `calendar.tsx`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui and required primitives"
```

---

## Task 4: Cyberpunk theme — fonts + design system

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (append the cyberpunk design system after the existing Tailwind import + shadcn tokens)

- [ ] **Step 1: Register fonts and metadata in `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Rajdhani, Chakra_Petch, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const display = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const ui = Chakra_Petch({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui" });
const mono = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CAL.EXE // Night City",
  description: "Full-page cyberpunk calendar",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
    <body>{children}</body>
  </html>
);

export default RootLayout;
```

- [ ] **Step 2: Append the cyberpunk design system to `src/app/globals.css`**

Keep the existing `@import "tailwindcss";` line and shadcn token blocks at the top. Append:

```css
/* ===================== CYBERPUNK DESIGN SYSTEM ===================== */
:root {
  --cy-bg: #07080d;
  --cy-panel: #0b0e16;
  --cy-panel-2: #0e1320;
  --cy-line: rgba(0, 240, 255, 0.16);
  --cy-cyan: #00f0ff;
  --cy-magenta: #ff2a6d;
  --cy-yellow: #fcee0a;
  --cy-green: #00ff9f;
  --cy-orange: #ff9f1c;
  --cy-text: #cfe0ec;
  --cy-muted: #5d7488;
}

html, body { height: 100%; }
body {
  background:
    radial-gradient(1200px 700px at 70% -10%, rgba(255, 42, 109, 0.12), transparent 60%),
    radial-gradient(900px 600px at 10% 110%, rgba(0, 240, 255, 0.12), transparent 60%),
    var(--cy-bg);
  color: var(--cy-text);
  font-family: var(--font-ui), system-ui, sans-serif;
  overflow: hidden;
}

/* Full-viewport overlays */
.cy-scanlines::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 50;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0, 0, 0, 0.20) 2px 3px);
  mix-blend-mode: multiply; opacity: 0.55;
}
.cy-scanlines::after {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 1;
  background:
    linear-gradient(transparent 96%, var(--cy-line) 100%) 0 0 / 100% 38px,
    linear-gradient(90deg, transparent 96%, var(--cy-line) 100%) 0 0 / 38px 100%;
  opacity: 0.35;
}

.cy-mono { font-family: var(--font-mono), monospace; }
.cy-display { font-family: var(--font-display), sans-serif; }

.cy-hud {
  font-family: var(--font-mono), monospace; font-size: 11px; letter-spacing: 0.18em;
  color: var(--cy-cyan); text-transform: uppercase;
}
.cy-hud .on { color: var(--cy-green); text-shadow: 0 0 8px var(--cy-green); }
.cy-hud .dim { color: var(--cy-muted); }

.cy-toolbar {
  position: relative;
  background: linear-gradient(180deg, var(--cy-panel-2), var(--cy-panel));
  border: 1px solid var(--cy-line);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
}
.cy-toolbar::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
  background: repeating-linear-gradient(45deg, var(--cy-magenta) 0 8px, #000 8px 16px);
}

.cy-month { font-family: var(--font-display), sans-serif; font-weight: 700; letter-spacing: 0.06em;
  color: #fff; text-shadow: 0 0 14px rgba(0, 240, 255, 0.45); }

.cy-nav {
  color: var(--cy-cyan); border: 1px solid var(--cy-cyan); background: transparent;
  text-shadow: 0 0 8px var(--cy-cyan);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%);
}
.cy-btn {
  font-family: var(--font-mono), monospace; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--cy-text); border: 1px solid var(--cy-line); background: rgba(255, 255, 255, 0.02);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
}
.cy-cta {
  font-family: var(--font-display), sans-serif; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  background: var(--cy-cyan); color: #04141a; border: none; cursor: pointer;
  box-shadow: 0 0 18px rgba(0, 240, 255, 0.45);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

.cy-weekhead { font-family: var(--font-mono), monospace; letter-spacing: 0.28em; color: var(--cy-cyan);
  text-transform: uppercase; opacity: 0.8; }

.cy-cell {
  background: linear-gradient(180deg, rgba(14, 19, 32, 0.92), rgba(8, 11, 18, 0.92));
  border: 1px solid var(--cy-line); position: relative; overflow: hidden;
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
}
.cy-cell.out { opacity: 0.4; }
.cy-cell.today { border-color: var(--cy-yellow);
  box-shadow: inset 0 0 22px rgba(252, 238, 10, 0.12), 0 0 16px rgba(252, 238, 10, 0.25); }
.cy-cell-num { font-family: var(--font-mono), monospace; color: var(--cy-muted); }
.cy-cell.today .cy-cell-num { color: var(--cy-yellow); text-shadow: 0 0 10px var(--cy-yellow); font-weight: 700; }

.cy-chip {
  display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 2px 7px;
  background: rgba(0, 0, 0, 0.35); color: #eaf6ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-left: 3px solid var(--cy-cyan); cursor: pointer;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 6px 100%, 0 calc(100% - 6px));
}

.cy-dialog {
  background: linear-gradient(180deg, #0b1019, #080b12); border: 1px solid var(--cy-cyan);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.25); position: relative;
  clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
}

.cy-glitch { animation: cy-glitch 450ms steps(2) 1; }
@keyframes cy-glitch {
  0% { transform: translate(0, 0); filter: none; }
  20% { transform: translate(-2px, 1px); filter: drop-shadow(2px 0 var(--cy-magenta)) drop-shadow(-2px 0 var(--cy-cyan)); }
  40% { transform: translate(2px, -1px); }
  100% { transform: translate(0, 0); filter: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cy-scanlines::before, .cy-scanlines::after { animation: none !important; }
  .cy-glitch { animation: none !important; }
}
```

- [ ] **Step 3: Verify the themed shell renders**

Replace `src/app/page.tsx` with a temporary shell to eyeball the theme:

```tsx
const Page = () => (
  <main className="cy-scanlines flex h-[100dvh] items-center justify-center">
    <h1 className="cy-display text-4xl text-[color:var(--cy-cyan)]">CAL.EXE // ONLINE</h1>
  </main>
);

export default Page;
```

Run: `pnpm dev` and open the printed URL.
Expected: dark background, cyan glowing heading, scanline overlay. (This shell is replaced in Task 17.)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/app/page.tsx
git commit -m "feat: cyberpunk theme tokens, fonts, and overlays"
```

---

## Task 5: Domain types, guards, and preset categories

**Files:**
- Create: `src/types/index.ts`, `src/types/consts.ts`
- Test: `src/types/tests.ts`

- [ ] **Step 1: Write the failing guard test**

Create `src/types/tests.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isRecurrenceFreq, isCategoryColor, isCalendarEvent } from "./index";
import { PRESET_CATEGORIES } from "./consts";

describe("domain guards", () => {
  it("validates recurrence frequencies", () => {
    expect(isRecurrenceFreq("weekly")).toBe(true);
    expect(isRecurrenceFreq("fortnightly")).toBe(false);
    expect(isRecurrenceFreq(42)).toBe(false);
  });

  it("validates category colors", () => {
    expect(isCategoryColor("magenta")).toBe(true);
    expect(isCategoryColor("beige")).toBe(false);
  });

  it("validates a stored CalendarEvent shape", () => {
    const ok = {
      id: "1", title: "Standup", date: "2026-05-14", categoryId: "work",
      recurrence: null, overrides: [], createdAt: "x", updatedAt: "y",
    };
    expect(isCalendarEvent(ok)).toBe(true);
    expect(isCalendarEvent({ ...ok, date: 20260514 })).toBe(false);
    expect(isCalendarEvent(null)).toBe(false);
  });

  it("ships preset categories with valid colors", () => {
    expect(PRESET_CATEGORIES.length).toBeGreaterThan(0);
    PRESET_CATEGORIES.forEach((c) => expect(isCategoryColor(c.color)).toBe(true));
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm exec vitest run src/types/tests.ts`
Expected: FAIL — `./index` and `./consts` don't exist yet.

- [ ] **Step 3: Write `src/types/index.ts`**

```ts
import { isString, isArray, isPlainObject } from "remeda";

export type CategoryColor = "cyan" | "magenta" | "yellow" | "green" | "orange";

export type Category = {
  id: string;
  name: string;
  color: CategoryColor;
};

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number; // >= 1
  endsOn: string | null; // YYYY-MM-DD inclusive, or null = forever
};

export type OccurrenceOverride = {
  occurrenceDate: string; // YYYY-MM-DD
  cancelled?: boolean;
  patch?: { title?: string; categoryId?: string; notes?: string };
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD; series anchor for recurring events
  categoryId: string;
  notes?: string;
  recurrence: Recurrence | null;
  overrides: OccurrenceOverride[];
  createdAt: string;
  updatedAt: string;
};

/** A concrete, rendered instance of an event on a specific date. */
export type Occurrence = {
  eventId: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: Category;
  notes?: string;
  isRecurring: boolean;
};

const RECURRENCE_FREQS: readonly RecurrenceFreq[] = ["daily", "weekly", "monthly", "yearly"];
const CATEGORY_COLORS: readonly CategoryColor[] = ["cyan", "magenta", "yellow", "green", "orange"];

export const isRecurrenceFreq = (value: unknown): value is RecurrenceFreq =>
  isString(value) && RECURRENCE_FREQS.includes(value as RecurrenceFreq);

export const isCategoryColor = (value: unknown): value is CategoryColor =>
  isString(value) && CATEGORY_COLORS.includes(value as CategoryColor);

export const isCalendarEvent = (value: unknown): value is CalendarEvent =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.title) &&
  isString(value.date) &&
  isString(value.categoryId) &&
  isArray(value.overrides) &&
  (value.recurrence === null || isPlainObject(value.recurrence));

export * from "./consts";
```

> `remeda` ships with Next.js deps via shadcn? If not present, run `pnpm add remeda` (CLAUDE.md mandates remeda for these guards).

- [ ] **Step 4: Write `src/types/consts.ts`**

```ts
import type { Category, CategoryColor } from "./index";

export const PRESET_CATEGORIES: readonly Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "personal", name: "Personal", color: "magenta" },
  { id: "health", name: "Health", color: "green" },
  { id: "finance", name: "Finance", color: "yellow" },
  { id: "social", name: "Social", color: "orange" },
];

/** Neon hex per category color, used for chip accents/glow (inline styles). */
export const NEON_HEX: Record<CategoryColor, string> = {
  cyan: "#00f0ff",
  magenta: "#ff2a6d",
  yellow: "#fcee0a",
  green: "#00ff9f",
  orange: "#ff9f1c",
};

export const UNKNOWN_CATEGORY: Category = { id: "unknown", name: "Uncategorized", color: "cyan" };
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run src/types/tests.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types
git commit -m "feat: domain types, runtime guards, and preset categories"
```

---

## Task 6: Month date grid (pure)

**Files:**
- Create: `src/lib/dateGrid/index.ts`
- Test: `src/lib/dateGrid/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dateGrid/tests.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMonthGrid, toISODate, GRID_DAYS } from "./index";

describe("buildMonthGrid", () => {
  const cells = buildMonthGrid(new Date(2026, 4, 1)); // May 2026 (month is 0-based)

  it("returns a fixed 6x7 grid", () => {
    expect(cells).toHaveLength(GRID_DAYS);
    expect(GRID_DAYS).toBe(42);
  });

  it("starts on the Sunday on/before the 1st", () => {
    expect(cells[0].iso).toBe("2026-04-26"); // Sunday before May 1 (Fri)
    expect(cells[0].inMonth).toBe(false);
  });

  it("ends 41 days later", () => {
    expect(cells[41].iso).toBe("2026-06-06");
  });

  it("marks exactly the 31 days of May as in-month", () => {
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
    const may1 = cells.find((c) => c.iso === "2026-05-01");
    expect(may1?.inMonth).toBe(true);
    expect(may1?.dayOfMonth).toBe(1);
  });

  it("formats ISO dates", () => {
    expect(toISODate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/dateGrid/tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/dateGrid/index.ts`**

```ts
import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";

export const GRID_DAYS = 42; // fixed 6 weeks x 7 days
const WEEK_STARTS_ON = 0; // Sunday

export type DateCell = {
  date: Date;
  iso: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
};

export const toISODate = (date: Date): string => format(date, "yyyy-MM-dd");

export const buildMonthGrid = (visibleMonth: Date): DateCell[] => {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });

  return Array.from({ length: GRID_DAYS }, (_, i) => {
    const date = addDays(gridStart, i);
    return {
      date,
      iso: toISODate(date),
      dayOfMonth: date.getDate(),
      inMonth: isSameMonth(date, monthStart),
    };
  });
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/lib/dateGrid/tests.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dateGrid
git commit -m "feat: pure month date-grid builder"
```

---

## Task 7: Recurrence expansion (pure)

**Files:**
- Create: `src/lib/recurrence/types.ts`, `src/lib/recurrence/index.ts`
- Test: `src/lib/recurrence/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recurrence/tests.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { expandEvent, makeCategoryResolver } from "./index";

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);

const base: CalendarEvent = {
  id: "e1", title: "Standup", date: "2026-05-04", categoryId: "work",
  recurrence: null, overrides: [], createdAt: "", updatedAt: "",
};

const datesOf = (event: CalendarEvent, start: string, end: string) =>
  expandEvent(event, start, end, getCategory).map((o) => o.date);

describe("expandEvent", () => {
  it("includes a one-off event only when in window", () => {
    expect(datesOf(base, "2026-05-01", "2026-05-31")).toEqual(["2026-05-04"]);
    expect(datesOf(base, "2026-06-01", "2026-06-30")).toEqual([]);
  });

  it("expands weekly occurrences within the window", () => {
    const weekly = { ...base, recurrence: { freq: "weekly" as const, interval: 1, endsOn: null } };
    expect(datesOf(weekly, "2026-05-01", "2026-05-31"))
      .toEqual(["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"]);
  });

  it("honors interval", () => {
    const biweekly = { ...base, recurrence: { freq: "weekly" as const, interval: 2, endsOn: null } };
    expect(datesOf(biweekly, "2026-05-01", "2026-05-31")).toEqual(["2026-05-04", "2026-05-18"]);
  });

  it("skips months that lack the anchor day (monthly on the 31st)", () => {
    const monthly = { ...base, date: "2026-01-31", recurrence: { freq: "monthly" as const, interval: 1, endsOn: null } };
    expect(datesOf(monthly, "2026-02-01", "2026-02-28")).toEqual([]); // Feb skipped
    expect(datesOf(monthly, "2026-03-01", "2026-03-31")).toEqual(["2026-03-31"]);
  });

  it("only fires yearly Feb-29 on leap years", () => {
    const yearly = { ...base, date: "2024-02-29", recurrence: { freq: "yearly" as const, interval: 1, endsOn: null } };
    expect(datesOf(yearly, "2025-02-01", "2025-02-28")).toEqual([]);
    expect(datesOf(yearly, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("respects an inclusive end date", () => {
    const ending = { ...base, recurrence: { freq: "weekly" as const, interval: 1, endsOn: "2026-05-11" } };
    expect(datesOf(ending, "2026-05-01", "2026-05-31")).toEqual(["2026-05-04", "2026-05-11"]);
  });

  it("drops cancelled occurrences and applies patches", () => {
    const ev = {
      ...base,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
      overrides: [
        { occurrenceDate: "2026-05-11", cancelled: true },
        { occurrenceDate: "2026-05-18", patch: { title: "Standup (moved room)" } },
      ],
    };
    const occ = expandEvent(ev, "2026-05-01", "2026-05-31", getCategory);
    expect(occ.map((o) => o.date)).toEqual(["2026-05-04", "2026-05-18", "2026-05-25"]);
    expect(occ.find((o) => o.date === "2026-05-18")?.title).toBe("Standup (moved room)");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/recurrence/tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/recurrence/types.ts`**

```ts
import type { Category } from "@/types";

export type CategoryResolver = (categoryId: string) => Category;
```

- [ ] **Step 4: Write `src/lib/recurrence/index.ts`**

```ts
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears, format, parseISO } from "date-fns";
import type { CalendarEvent, Category, Occurrence, OccurrenceOverride, RecurrenceFreq } from "@/types";
import { UNKNOWN_CATEGORY } from "@/types";
import type { CategoryResolver } from "./types";

export * from "./types";

const MAX_ITER = 1000;

const STEP: Record<RecurrenceFreq, (anchor: Date, amount: number) => Date> = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
};

const UNITS_BETWEEN: Record<RecurrenceFreq, (anchor: Date, target: Date) => number> = {
  daily: (a, t) => differenceInCalendarDays(t, a),
  weekly: (a, t) => Math.floor(differenceInCalendarDays(t, a) / 7),
  monthly: (a, t) => differenceInCalendarMonths(t, a),
  yearly: (a, t) => differenceInCalendarYears(t, a),
};

// date-fns clamps overflowing days (Jan 31 + 1mo -> Feb 28). Detect clamping and skip.
const landsOnAnchorDay = (candidate: Date, anchor: Date, freq: RecurrenceFreq): boolean =>
  freq === "monthly" || freq === "yearly" ? candidate.getDate() === anchor.getDate() : true;

export const makeCategoryResolver = (categories: readonly Category[]): CategoryResolver => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (categoryId) => byId.get(categoryId) ?? UNKNOWN_CATEGORY;
};

const indexOverrides = (overrides: OccurrenceOverride[]): Record<string, OccurrenceOverride> =>
  Object.fromEntries(overrides.map((o) => [o.occurrenceDate, o]));

export const expandEvent = (
  event: CalendarEvent,
  windowStartISO: string,
  windowEndISO: string,
  getCategory: CategoryResolver,
): Occurrence[] => {
  if (!event.recurrence) {
    if (event.date < windowStartISO || event.date > windowEndISO) return [];
    return [{
      eventId: event.id, date: event.date, title: event.title,
      category: getCategory(event.categoryId), notes: event.notes, isRecurring: false,
    }];
  }

  const { freq, interval, endsOn } = event.recurrence;
  const anchor = parseISO(event.date);
  const windowStart = parseISO(windowStartISO);
  const hardEndISO = endsOn && endsOn < windowEndISO ? endsOn : windowEndISO;
  const overrides = indexOverrides(event.overrides);

  const approxUnits = UNITS_BETWEEN[freq](anchor, windowStart);
  let i = Math.max(0, Math.floor(approxUnits / interval) - 1);

  const result: Occurrence[] = [];
  for (let guard = 0; guard < MAX_ITER; guard += 1, i += 1) {
    const candidate = STEP[freq](anchor, i * interval);
    const iso = format(candidate, "yyyy-MM-dd");
    if (iso > hardEndISO) break;
    if (iso < windowStartISO) continue;
    if (!landsOnAnchorDay(candidate, anchor, freq)) continue;

    const override = overrides[iso];
    if (override?.cancelled) continue;

    const categoryId = override?.patch?.categoryId ?? event.categoryId;
    result.push({
      eventId: event.id,
      date: iso,
      title: override?.patch?.title ?? event.title,
      category: getCategory(categoryId),
      notes: override?.patch?.notes ?? event.notes,
      isRecurring: true,
    });
  }
  return result;
};

export const expandEvents = (
  events: CalendarEvent[],
  windowStartISO: string,
  windowEndISO: string,
  getCategory: CategoryResolver,
): Occurrence[] => events.flatMap((e) => expandEvent(e, windowStartISO, windowEndISO, getCategory));
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/lib/recurrence/tests.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/recurrence
git commit -m "feat: pure recurrence expansion with overrides"
```

---

## Task 8: Recurrence mutation helpers (override / truncate / split)

**Files:**
- Modify: `src/lib/recurrence/index.ts` (append helpers)
- Modify: `src/lib/recurrence/tests.ts` (append tests)
- Create: `src/lib/recurrence/consts.ts`

- [ ] **Step 1: Append the failing tests to `src/lib/recurrence/tests.ts`**

```ts
import { cancelOccurrence, patchOccurrence, truncateBefore, buildFollowingSeries, dayBeforeISO } from "./index";

describe("recurrence mutations", () => {
  const series: CalendarEvent = {
    id: "s1", title: "Standup", date: "2026-05-04", categoryId: "work",
    recurrence: { freq: "weekly", interval: 1, endsOn: null }, overrides: [],
    createdAt: "", updatedAt: "",
  };

  it("computes the day before an ISO date", () => {
    expect(dayBeforeISO("2026-05-18")).toBe("2026-05-17");
    expect(dayBeforeISO("2026-03-01")).toBe("2026-02-28");
  });

  it("cancels a single occurrence", () => {
    const next = cancelOccurrence(series, "2026-05-18");
    expect(next.overrides).toContainEqual({ occurrenceDate: "2026-05-18", cancelled: true });
  });

  it("patches a single occurrence and replaces any prior override on that date", () => {
    const once = patchOccurrence(series, "2026-05-18", { title: "A" });
    const twice = patchOccurrence(once, "2026-05-18", { title: "B" });
    expect(twice.overrides).toEqual([{ occurrenceDate: "2026-05-18", patch: { title: "B" } }]);
  });

  it("truncates a series to end the day before a split point", () => {
    const next = truncateBefore(series, "2026-05-18");
    expect(next.recurrence?.endsOn).toBe("2026-05-17");
  });

  it("builds a following series carrying forward only on/after overrides", () => {
    const withOverrides = {
      ...series,
      overrides: [
        { occurrenceDate: "2026-05-11", cancelled: true },
        { occurrenceDate: "2026-05-25", patch: { notes: "keep" } },
      ],
    };
    const created = buildFollowingSeries(
      withOverrides, "2026-05-18",
      { title: "Standup v2", categoryId: "work", notes: undefined, recurrence: { freq: "weekly", interval: 1, endsOn: null } },
      "new-id", "2026-05-30T00:00:00.000Z",
    );
    expect(created.id).toBe("new-id");
    expect(created.date).toBe("2026-05-18");
    expect(created.title).toBe("Standup v2");
    expect(created.overrides).toEqual([{ occurrenceDate: "2026-05-25", patch: { notes: "keep" } }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/recurrence/tests.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Create `src/lib/recurrence/consts.ts`**

```ts
export const RECURRENCE_LABELS: Record<"none" | "daily" | "weekly" | "monthly" | "yearly", string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
```

- [ ] **Step 4: Append helpers to `src/lib/recurrence/index.ts`**

```ts
import { subDays } from "date-fns";
import type { Recurrence } from "@/types";

export * from "./consts";

/** Fields a create/edit form produces (no id/timestamps/overrides). */
export type EventInput = {
  title: string;
  date: string;
  categoryId: string;
  notes?: string;
  recurrence: Recurrence | null;
};

export const dayBeforeISO = (iso: string): string => format(subDays(parseISO(iso), 1), "yyyy-MM-dd");

const upsertOverride = (overrides: OccurrenceOverride[], next: OccurrenceOverride): OccurrenceOverride[] => [
  ...overrides.filter((o) => o.occurrenceDate !== next.occurrenceDate),
  next,
];

export const cancelOccurrence = (event: CalendarEvent, occurrenceDate: string): CalendarEvent => ({
  ...event,
  overrides: upsertOverride(event.overrides, { occurrenceDate, cancelled: true }),
});

export const patchOccurrence = (
  event: CalendarEvent,
  occurrenceDate: string,
  patch: NonNullable<OccurrenceOverride["patch"]>,
): CalendarEvent => ({
  ...event,
  overrides: upsertOverride(event.overrides, { occurrenceDate, patch }),
});

export const truncateBefore = (event: CalendarEvent, fromDate: string): CalendarEvent => ({
  ...event,
  recurrence: event.recurrence ? { ...event.recurrence, endsOn: dayBeforeISO(fromDate) } : null,
});

export const buildFollowingSeries = (
  event: CalendarEvent,
  fromDate: string,
  input: EventInput,
  id: string,
  nowISO: string,
): CalendarEvent => ({
  id,
  title: input.title,
  date: fromDate,
  categoryId: input.categoryId,
  notes: input.notes,
  recurrence: input.recurrence,
  overrides: event.overrides.filter((o) => o.occurrenceDate >= fromDate),
  createdAt: nowISO,
  updatedAt: nowISO,
});
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/lib/recurrence/tests.ts`
Expected: PASS (all expansion + mutation tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/recurrence
git commit -m "feat: recurrence override, truncate, and series-split helpers"
```

---

## Task 9: IndexedDB storage with typed errors

**Files:**
- Create: `src/lib/storage/types.ts`, `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/tests.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarEvent } from "@/types";
import { getAllEvents, putEvent, deleteEvent, resetDbForTests } from "./index";

const make = (id: string): CalendarEvent => ({
  id, title: `Event ${id}`, date: "2026-05-14", categoryId: "work",
  recurrence: null, overrides: [], createdAt: "t", updatedAt: "t",
});

describe("storage repository", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("starts empty", async () => {
    expect(await getAllEvents()).toEqual([]);
  });

  it("persists and reads back events", async () => {
    await putEvent(make("a"));
    await putEvent(make("b"));
    const all = await getAllEvents();
    expect(all.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("overwrites an event with the same id", async () => {
    await putEvent(make("a"));
    await putEvent({ ...make("a"), title: "Renamed" });
    const all = await getAllEvents();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Renamed");
  });

  it("deletes events", async () => {
    await putEvent(make("a"));
    await deleteEvent("a");
    expect(await getAllEvents()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/storage/tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/storage/types.ts`**

```ts
export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, cause?: unknown) {
    super(code);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}

export const isStorageError = (error: unknown): error is StorageError => error instanceof StorageError;
```

- [ ] **Step 4: Write `src/lib/storage/index.ts`**

```ts
import { openDB, type IDBPDatabase } from "idb";
import type { CalendarEvent } from "@/types";
import { isCalendarEvent } from "@/types";
import { StorageError } from "./types";

export * from "./types";

const DB_NAME = "cyber-calendar";
const DB_VERSION = 1;
const STORE = "events";

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new StorageError("UNAVAILABLE"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
      blocked() {
        /* another tab holds an older version open */
      },
    }).catch((cause) => {
      dbPromise = null;
      throw new StorageError("UNAVAILABLE", cause);
    });
  }
  return dbPromise;
};

export const getAllEvents = async (): Promise<CalendarEvent[]> => {
  try {
    const db = await getDb();
    const rows = await db.getAll(STORE);
    return rows.filter(isCalendarEvent);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("READ_FAILED", error);
  }
};

export const putEvent = async (event: CalendarEvent): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(STORE, event);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    const code = error instanceof DOMException && error.name === "QuotaExceededError" ? "QUOTA_EXCEEDED" : "WRITE_FAILED";
    throw new StorageError(code, error);
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE, id);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("WRITE_FAILED", error);
  }
};

/** Test-only: close and delete the database so each test starts clean. */
export const resetDbForTests = async (): Promise<void> => {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/lib/storage/tests.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage
git commit -m "feat: IndexedDB event repository with typed StorageError"
```

---

## Task 10: CalendarContext (state + CRUD)

**Files:**
- Create: `src/context/CalendarContext/index.tsx`
- Test: `src/context/CalendarContext/tests.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/context/CalendarContext/tests.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetDbForTests } from "@/lib/storage";
import { CalendarProvider, useCalendar } from "./index";

const wrapper = ({ children }: { children: React.ReactNode }) => <CalendarProvider>{children}</CalendarProvider>;

describe("CalendarContext", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("creates a one-off event and exposes it as an occurrence", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.storageAvailable).toBe(true));

    await act(async () => {
      await result.current.createEvent({
        title: "Dentist", date: "2026-05-08", categoryId: "health", notes: undefined, recurrence: null,
      });
      result.current.goToDate(new Date(2026, 4, 1));
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.title).toBe("Dentist");
    });
  });

  it("deletes one occurrence of a recurring series", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.storageAvailable).toBe(true));

    let id = "";
    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup", date: "2026-05-04", categoryId: "work", notes: undefined,
        recurrence: { freq: "weekly", interval: 1, endsOn: null },
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    id = result.current.events[0].id;

    await act(async () => {
      await result.current.deleteEvent(id, "this", "2026-05-11");
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-11"]).toBeUndefined();
      expect(result.current.occurrencesByDate["2026-05-04"]).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/context/CalendarContext/tests.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/context/CalendarContext/index.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { groupBy } from "remeda";
import type { CalendarEvent, Category, CategoryColor, Occurrence } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { buildMonthGrid, type DateCell } from "@/lib/dateGrid";
import {
  buildFollowingSeries, cancelOccurrence, expandEvents, makeCategoryResolver,
  patchOccurrence, truncateBefore, type EventInput,
} from "@/lib/recurrence";
import { deleteEvent as dbDelete, getAllEvents, isStorageError, putEvent } from "@/lib/storage";

export type EditScope = "this" | "following" | "all";

type CalendarContextValue = {
  visibleMonth: Date;
  monthLabel: string;
  cells: DateCell[];
  todayISO: string;
  events: CalendarEvent[];
  occurrencesByDate: Record<string, Occurrence[]>;
  categories: readonly Category[];
  activeColors: Set<CategoryColor>;
  storageAvailable: boolean;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  goToDate: (date: Date) => void;
  toggleColor: (color: CategoryColor) => void;
  createEvent: (input: EventInput) => Promise<void>;
  updateEvent: (id: string, input: EventInput, scope: EditScope, occurrenceDate: string) => Promise<void>;
  deleteEvent: (id: string, scope: EditScope, occurrenceDate: string) => Promise<void>;
};

const ALL_COLORS: CategoryColor[] = ["cyan", "magenta", "yellow", "green", "orange"];
const newId = (): string => crypto.randomUUID();
const nowISO = (): string => new Date().toISOString();
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);
const colorOf = (categoryId: string): CategoryColor => getCategory(categoryId).color;

const CalendarContext = createContext<CalendarContextValue | null>(null);

export const CalendarProvider = ({ children }: { children: React.ReactNode }) => {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [activeColors, setActiveColors] = useState<Set<CategoryColor>>(() => new Set(ALL_COLORS));

  useEffect(() => {
    let active = true;
    getAllEvents()
      .then((loaded) => active && setEvents(loaded))
      .catch((error) => {
        if (isStorageError(error) && error.code === "UNAVAILABLE") setStorageAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (write: () => Promise<void>) => {
    try {
      await write();
    } catch (error) {
      if (isStorageError(error)) setStorageAvailable(false);
      else throw error;
    }
  }, []);

  const cells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const todayISO = format(new Date(), "yyyy-MM-dd");

  const occurrencesByDate = useMemo(() => {
    const windowStart = cells[0].iso;
    const windowEnd = cells[cells.length - 1].iso;
    const occ = expandEvents(events, windowStart, windowEnd, getCategory)
      .filter((o) => activeColors.has(o.category.color));
    return groupBy(occ, (o) => o.date);
  }, [events, cells, activeColors]);

  const createEvent = useCallback(async (input: EventInput) => {
    const event: CalendarEvent = {
      id: newId(), title: input.title, date: input.date, categoryId: input.categoryId,
      notes: input.notes, recurrence: input.recurrence, overrides: [],
      createdAt: nowISO(), updatedAt: nowISO(),
    };
    setEvents((prev) => [...prev, event]);
    await persist(() => putEvent(event));
  }, [persist]);

  const updateEvent = useCallback(async (id: string, input: EventInput, scope: EditScope, occurrenceDate: string) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;

    if (!current.recurrence || scope === "all") {
      const next: CalendarEvent = { ...current, ...input, updatedAt: nowISO() };
      setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
      await persist(() => putEvent(next));
      return;
    }

    if (scope === "this") {
      const next = patchOccurrence(current, occurrenceDate, {
        title: input.title, categoryId: input.categoryId, notes: input.notes,
      });
      setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
      await persist(() => putEvent(next));
      return;
    }

    // scope === "following": truncate original, create a new series from occurrenceDate
    const truncated = truncateBefore(current, occurrenceDate);
    const created = buildFollowingSeries(current, occurrenceDate, input, newId(), nowISO());
    setEvents((prev) => [...prev.map((e) => (e.id === id ? truncated : e)), created]);
    await persist(async () => {
      await putEvent(truncated);
      await putEvent(created);
    });
  }, [events, persist]);

  const deleteEvent = useCallback(async (id: string, scope: EditScope, occurrenceDate: string) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;

    if (!current.recurrence || scope === "all") {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      await persist(() => dbDelete(id));
      return;
    }

    const next = scope === "this" ? cancelOccurrence(current, occurrenceDate) : truncateBefore(current, occurrenceDate);
    setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
    await persist(() => putEvent(next));
  }, [events, persist]);

  const value: CalendarContextValue = {
    visibleMonth,
    monthLabel: monthFormatter.format(visibleMonth),
    cells,
    todayISO,
    events,
    occurrencesByDate,
    categories: PRESET_CATEGORIES,
    activeColors,
    storageAvailable,
    goToPrevMonth: () => setVisibleMonth((m) => addMonths(m, -1)),
    goToNextMonth: () => setVisibleMonth((m) => addMonths(m, 1)),
    goToToday: () => setVisibleMonth(startOfMonth(new Date())),
    goToDate: (date) => setVisibleMonth(startOfMonth(date)),
    toggleColor: (color) =>
      setActiveColors((prev) => {
        const next = new Set(prev);
        if (next.has(color)) next.delete(color);
        else next.add(color);
        return next;
      }),
    createEvent,
    updateEvent,
    deleteEvent,
  };

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
};

export const useCalendar = (): CalendarContextValue => {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used within a CalendarProvider");
  return ctx;
};

export { colorOf };
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/context/CalendarContext/tests.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/context
git commit -m "feat: CalendarContext with month state and recurring-aware CRUD"
```

---

## Task 11: EventChip and DayEventsPopover

**Files:**
- Create: `src/components/EventChip/index.tsx`
- Create: `src/components/DayEventsPopover/index.tsx`

- [ ] **Step 1: Write `src/components/EventChip/index.tsx`**

```tsx
import type { Occurrence } from "@/types";
import { NEON_HEX } from "@/types";

type EventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
};

const EventChip = ({ occurrence, onSelect }: EventChipProps) => {
  const hex = NEON_HEX[occurrence.category.color];
  return (
    <button
      type="button"
      className="cy-chip w-full text-left"
      style={{ borderLeftColor: hex, boxShadow: `-1px 0 8px ${hex}66` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
    >
      {occurrence.isRecurring && <span aria-label="repeats">↻</span>}
      <span className="truncate">{occurrence.title}</span>
    </button>
  );
};

export default EventChip;
```

- [ ] **Step 2: Write `src/components/DayEventsPopover/index.tsx`**

```tsx
import type { Occurrence } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EventChip from "@/components/EventChip";

type DayEventsPopoverProps = {
  label: string; // e.g. "+2 more"
  dateLabel: string; // e.g. "May 13"
  occurrences: Occurrence[];
  onSelect: (occurrence: Occurrence) => void;
};

const DayEventsPopover = ({ label, dateLabel, occurrences, onSelect }: DayEventsPopoverProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="cy-mono mt-1 text-[10px] tracking-widest text-[color:var(--cy-cyan)]" onClick={(e) => e.stopPropagation()}>
        {label}
      </button>
    </PopoverTrigger>
    <PopoverContent className="cy-dialog w-56 border-0 p-3">
      <p className="cy-mono mb-2 text-[10px] uppercase tracking-widest text-[color:var(--cy-cyan)]">{dateLabel}</p>
      <div className="flex flex-col gap-1">
        {occurrences.map((o) => (
          <EventChip key={`${o.eventId}:${o.date}`} occurrence={o} onSelect={onSelect} />
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export default DayEventsPopover;
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/EventChip src/components/DayEventsPopover
git commit -m "feat: neon event chip and day-overflow popover"
```

---

## Task 12: DayCell

**Files:**
- Create: `src/components/DayCell/index.tsx`

- [ ] **Step 1: Write `src/components/DayCell/index.tsx`**

```tsx
import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import EventChip from "@/components/EventChip";
import DayEventsPopover from "@/components/DayEventsPopover";

const MAX_VISIBLE_CHIPS = 3;

type DayCellProps = {
  cell: DateCell;
  isToday: boolean;
  occurrences: Occurrence[];
  dateLabel: string;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};

const DayCell = ({ cell, isToday, occurrences, dateLabel, onSelectDate, onSelectOccurrence }: DayCellProps) => {
  const visible = occurrences.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = occurrences.slice(MAX_VISIBLE_CHIPS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");

  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-label={dateLabel}
      className={classes.join(" ")}
      onClick={() => onSelectDate(cell.iso)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelectDate(cell.iso);
      }}
    >
      <span className="cy-cell-num">{String(cell.dayOfMonth).padStart(2, "0")}</span>
      <div className="flex flex-col gap-1 overflow-hidden">
        {visible.map((o) => (
          <EventChip key={`${o.eventId}:${o.date}`} occurrence={o} onSelect={onSelectOccurrence} />
        ))}
        {overflow.length > 0 && (
          <DayEventsPopover
            label={`+${overflow.length} more`}
            dateLabel={dateLabel}
            occurrences={occurrences}
            onSelect={onSelectOccurrence}
          />
        )}
      </div>
    </div>
  );
};

export default DayCell;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/DayCell
git commit -m "feat: day cell with chips, today glow, and overflow"
```

---

## Task 13: MonthGrid

**Files:**
- Create: `src/components/MonthGrid/index.tsx`
- Test: `src/components/MonthGrid/tests.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/MonthGrid/tests.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Occurrence } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import MonthGrid from "./index";

const occ: Occurrence = {
  eventId: "e1", date: "2026-05-14", title: "Design review",
  category: { id: "work", name: "Work", color: "cyan" }, isRecurring: false,
};

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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/MonthGrid/tests.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/components/MonthGrid/index.tsx`**

```tsx
import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import DayCell from "@/components/DayCell";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabeler = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

type MonthGridProps = {
  cells: DateCell[];
  todayISO: string;
  occurrencesByDate: Record<string, Occurrence[]>;
  onSelectDate: (iso: string) => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
};

const MonthGrid = ({ cells, todayISO, occurrencesByDate, onSelectDate, onSelectOccurrence }: MonthGridProps) => (
  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
    <div className="grid grid-cols-7 gap-1.5" role="row">
      {WEEKDAYS.map((d) => (
        <div key={d} className="cy-weekhead px-1 text-[10px]" role="columnheader">
          {d}
        </div>
      ))}
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5" role="grid">
      {cells.map((cell) => (
        <DayCell
          key={cell.iso}
          cell={cell}
          isToday={cell.iso === todayISO}
          occurrences={occurrencesByDate[cell.iso] ?? []}
          dateLabel={dayLabeler.format(cell.date)}
          onSelectDate={onSelectDate}
          onSelectOccurrence={onSelectOccurrence}
        />
      ))}
    </div>
  </div>
);

export default MonthGrid;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/components/MonthGrid/tests.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthGrid
git commit -m "feat: full-viewport month grid"
```

---

## Task 14: CalendarToolbar

**Files:**
- Create: `src/components/CalendarToolbar/index.tsx`

- [ ] **Step 1: Write `src/components/CalendarToolbar/index.tsx`**

```tsx
import type { Category, CategoryColor } from "@/types";
import { NEON_HEX } from "@/types";

type CalendarToolbarProps = {
  monthLabel: string;
  recordCount: number;
  categories: readonly Category[];
  activeColors: Set<CategoryColor>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleColor: (color: CategoryColor) => void;
  onNewEvent: () => void;
};

const CalendarToolbar = ({
  monthLabel, recordCount, categories, activeColors, onPrev, onNext, onToday, onToggleColor, onNewEvent,
}: CalendarToolbarProps) => (
  <header className="flex flex-col gap-3">
    <div className="cy-hud flex items-center justify-between">
      <span>SYS<span className="dim">//</span>CAL.EXE&nbsp; <span className="on">◢ ONLINE</span></span>
      <span className="dim">LOCAL_DB::INDEXEDDB&nbsp; ◢ {recordCount} RECORDS</span>
    </div>

    <div className="cy-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Previous month" className="cy-nav grid h-8 w-8 place-items-center" onClick={onPrev}>‹</button>
        <span className="cy-month text-2xl uppercase">{monthLabel}</span>
        <button type="button" aria-label="Next month" className="cy-nav grid h-8 w-8 place-items-center" onClick={onNext}>›</button>
        <button type="button" className="cy-btn px-3 py-1.5 text-xs" onClick={onToday}>▸ Today</button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5" role="group" aria-label="Filter by category">
          {categories.map((c) => {
            const active = activeColors.has(c.color);
            const hex = NEON_HEX[c.color];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                title={c.name}
                onClick={() => onToggleColor(c.color)}
                className="cy-mono flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
                style={{ borderColor: hex, opacity: active ? 1 : 0.35 }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: hex, boxShadow: `0 0 8px ${hex}` }} />
                {c.name}
              </button>
            );
          })}
        </div>
        <button type="button" className="cy-cta px-5 py-2 text-sm" onClick={onNewEvent}>+ New Event</button>
      </div>
    </div>
  </header>
);

export default CalendarToolbar;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/CalendarToolbar
git commit -m "feat: HUD toolbar with month nav, category filter, and new-event CTA"
```

---

## Task 15: EventDialog (react-hook-form + zod)

**Files:**
- Create: `src/components/EventDialog/schema.ts`
- Create: `src/components/EventDialog/index.tsx`
- Test: `src/components/EventDialog/tests.tsx`

- [ ] **Step 1: Write `src/components/EventDialog/schema.ts`**

```ts
import { z } from "zod";
import type { EventInput } from "@/lib/recurrence";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    date: z.string().regex(ISO_DATE, "Pick a date"),
    categoryId: z.string().min(1, "Pick a category"),
    notes: z.string().optional(),
    repeat: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
    interval: z.coerce.number().int().min(1, "Must be at least 1"),
    endsOn: z.string().regex(ISO_DATE).optional().or(z.literal("")),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.date, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

export const toEventInput = (v: EventFormValues): EventInput => ({
  title: v.title.trim(),
  date: v.date,
  categoryId: v.categoryId,
  notes: v.notes?.trim() ? v.notes.trim() : undefined,
  recurrence: v.repeat === "none" ? null : { freq: v.repeat, interval: v.interval, endsOn: v.endsOn ? v.endsOn : null },
});
```

- [ ] **Step 2: Write the failing test**

Create `src/components/EventDialog/tests.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRESET_CATEGORIES } from "@/types";
import EventDialog from "./index";

const baseProps = {
  open: true,
  mode: "create" as const,
  categories: PRESET_CATEGORIES,
  defaultDate: "2026-05-14",
  initialOccurrence: undefined,
  sourceEvent: undefined,
  onOpenChange: vi.fn(),
  onSubmit: vi.fn(),
  onDelete: vi.fn(),
};

describe("EventDialog", () => {
  it("blocks submit and shows an error when the title is empty", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid one-off event as an EventInput", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/title/i), "Dentist");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Dentist", date: "2026-05-14", recurrence: null,
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm exec vitest run src/components/EventDialog/tests.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/components/EventDialog/index.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Category, Occurrence, CalendarEvent } from "@/types";
import type { EventInput } from "@/lib/recurrence";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { eventFormSchema, toEventInput, type EventFormValues } from "./schema";

type EventDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  categories: readonly Category[];
  defaultDate: string;
  initialOccurrence?: Occurrence;
  sourceEvent?: CalendarEvent;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: EventInput) => void;
  onDelete: () => void;
};

const buildDefaults = (props: EventDialogProps): EventFormValues => {
  const { mode, defaultDate, initialOccurrence, sourceEvent, categories } = props;
  if (mode === "edit" && initialOccurrence && sourceEvent) {
    return {
      title: initialOccurrence.title,
      date: initialOccurrence.date,
      categoryId: initialOccurrence.category.id,
      notes: initialOccurrence.notes ?? "",
      repeat: sourceEvent.recurrence?.freq ?? "none",
      interval: sourceEvent.recurrence?.interval ?? 1,
      endsOn: sourceEvent.recurrence?.endsOn ?? "",
    };
  }
  return { title: "", date: defaultDate, categoryId: categories[0].id, notes: "", repeat: "none", interval: 1, endsOn: "" };
};

const EventDialog = (props: EventDialogProps) => {
  const { open, mode, categories, sourceEvent, onOpenChange, onSubmit, onDelete } = props;
  const form = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues: buildDefaults(props) });
  const { register, handleSubmit, reset, watch, formState: { errors } } = form;

  useEffect(() => {
    if (open) reset(buildDefaults(props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const repeat = watch("repeat");
  // Per TRD: per-occurrence date moves are out of scope; lock the date when editing a recurring event.
  const lockDate = mode === "edit" && Boolean(sourceEvent?.recurrence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            {mode === "create" ? "New Event" : "Edit Event"}
          </DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit((v) => onSubmit(toEventInput(v)))}>
          <div className="flex flex-col gap-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register("title")} />
            {errors.title && <p className="text-xs text-[color:var(--cy-magenta)]">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" disabled={lockDate} {...register("date")} />
            {errors.date && <p className="text-xs text-[color:var(--cy-magenta)]">{errors.date.message}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="categoryId">Category</Label>
            <select id="categoryId" className="cy-btn px-3 py-2 text-sm" {...register("categoryId")}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="repeat">Repeat</Label>
              <select id="repeat" className="cy-btn px-3 py-2 text-sm" {...register("repeat")}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            {repeat !== "none" && (
              <>
                <div className="flex w-20 flex-col gap-1">
                  <Label htmlFor="interval">Every</Label>
                  <Input id="interval" type="number" min={1} {...register("interval")} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="endsOn">Until</Label>
                  <Input id="endsOn" type="date" {...register("endsOn")} />
                </div>
              </>
            )}
          </div>
          {errors.interval && <p className="text-xs text-[color:var(--cy-magenta)]">{errors.interval.message}</p>}
          {errors.endsOn && <p className="text-xs text-[color:var(--cy-magenta)]">{errors.endsOn.message}</p>}

          <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
            {mode === "edit" ? (
              <Button type="button" variant="ghost" className="text-[color:var(--cy-magenta)]" onClick={onDelete}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" className="cy-cta">Save ▸</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/components/EventDialog/tests.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/EventDialog
git commit -m "feat: event editor dialog with react-hook-form and zod"
```

---

## Task 16: RecurrenceScopeDialog

**Files:**
- Create: `src/components/RecurrenceScopeDialog/index.tsx`

- [ ] **Step 1: Write `src/components/RecurrenceScopeDialog/index.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { EditScope } from "@/context/CalendarContext";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type RecurrenceScopeDialogProps = {
  open: boolean;
  action: "edit" | "delete";
  onConfirm: (scope: EditScope) => void;
  onOpenChange: (open: boolean) => void;
};

const OPTIONS: { value: EditScope; label: string }[] = [
  { value: "this", label: "This event" },
  { value: "following", label: "This and following events" },
  { value: "all", label: "All events" },
];

const RecurrenceScopeDialog = ({ open, action, onConfirm, onOpenChange }: RecurrenceScopeDialogProps) => {
  const [scope, setScope] = useState<EditScope>("this");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cy-dialog border-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            {action === "edit" ? "Edit recurring event" : "Delete recurring event"}
          </DialogTitle>
        </DialogHeader>

        <RadioGroup value={scope} onValueChange={(v) => setScope(v as EditScope)} className="flex flex-col gap-2 py-2">
          {OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-3">
              <RadioGroupItem id={`scope-${o.value}`} value={o.value} />
              <Label htmlFor={`scope-${o.value}`}>{o.label}</Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="cy-cta" onClick={() => onConfirm(scope)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecurrenceScopeDialog;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/RecurrenceScopeDialog
git commit -m "feat: recurring edit/delete scope dialog"
```

---

## Task 17: Page orchestration, storage banner, empty state

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx` with the full screen**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent, Occurrence } from "@/types";
import type { EventInput } from "@/lib/recurrence";
import { CalendarProvider, useCalendar, type EditScope } from "@/context/CalendarContext";
import CalendarToolbar from "@/components/CalendarToolbar";
import MonthGrid from "@/components/MonthGrid";
import EventDialog from "@/components/EventDialog";
import RecurrenceScopeDialog from "@/components/RecurrenceScopeDialog";

type EditorState =
  | { mode: "create"; date: string }
  | { mode: "edit"; occurrence: Occurrence; event: CalendarEvent };

type ScopeState = { action: "edit"; input: EventInput; event: CalendarEvent; occurrenceDate: string }
  | { action: "delete"; event: CalendarEvent; occurrenceDate: string };

const todayISO = (): string => new Date().toISOString().slice(0, 10);

const CalendarScreen = () => {
  const cal = useCalendar();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);

  const totalOccurrences = useMemo(
    () => Object.values(cal.occurrencesByDate).reduce((n, list) => n + list.length, 0),
    [cal.occurrencesByDate],
  );

  const openCreate = (date: string) => setEditor({ mode: "create", date });
  const openEdit = (occurrence: Occurrence) => {
    const event = cal.events.find((e) => e.id === occurrence.eventId);
    if (event) setEditor({ mode: "edit", occurrence, event });
  };

  const handleSubmit = (input: EventInput) => {
    if (!editor) return;
    if (editor.mode === "create") {
      void cal.createEvent(input);
      setEditor(null);
      return;
    }
    if (!editor.event.recurrence) {
      void cal.updateEvent(editor.event.id, input, "all", editor.occurrence.date);
      setEditor(null);
      return;
    }
    setScope({ action: "edit", input, event: editor.event, occurrenceDate: editor.occurrence.date });
    setEditor(null);
  };

  const handleDelete = () => {
    if (!editor || editor.mode !== "edit") return;
    if (!editor.event.recurrence) {
      void cal.deleteEvent(editor.event.id, "all", editor.occurrence.date);
      setEditor(null);
      return;
    }
    setScope({ action: "delete", event: editor.event, occurrenceDate: editor.occurrence.date });
    setEditor(null);
  };

  const confirmScope = (chosen: EditScope) => {
    if (!scope) return;
    if (scope.action === "edit") void cal.updateEvent(scope.event.id, scope.input, chosen, scope.occurrenceDate);
    else void cal.deleteEvent(scope.event.id, chosen, scope.occurrenceDate);
    setScope(null);
  };

  return (
    <main className="cy-scanlines flex h-[100dvh] flex-col gap-3 p-3.5">
      {!cal.storageAvailable && (
        <div className="cy-mono border border-[color:var(--cy-magenta)] px-4 py-2 text-xs text-[color:var(--cy-magenta)]">
          ◢ LOCAL STORAGE UNAVAILABLE — changes won&apos;t be saved this session.
        </div>
      )}

      <CalendarToolbar
        monthLabel={cal.monthLabel}
        recordCount={cal.events.length}
        categories={cal.categories}
        activeColors={cal.activeColors}
        onPrev={cal.goToPrevMonth}
        onNext={cal.goToNextMonth}
        onToday={cal.goToToday}
        onToggleColor={cal.toggleColor}
        onNewEvent={() => openCreate(todayISO())}
      />

      <MonthGrid
        cells={cal.cells}
        todayISO={cal.todayISO}
        occurrencesByDate={cal.occurrencesByDate}
        onSelectDate={openCreate}
        onSelectOccurrence={openEdit}
      />

      {totalOccurrences === 0 && (
        <p className="cy-mono text-center text-xs text-[color:var(--cy-muted)]">
          ◢ No events this month — click a day or &ldquo;+ New Event&rdquo; to begin.
        </p>
      )}

      {editor && (
        <EventDialog
          open
          mode={editor.mode}
          categories={cal.categories}
          defaultDate={editor.mode === "create" ? editor.date : editor.occurrence.date}
          initialOccurrence={editor.mode === "edit" ? editor.occurrence : undefined}
          sourceEvent={editor.mode === "edit" ? editor.event : undefined}
          onOpenChange={(open) => !open && setEditor(null)}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}

      {scope && (
        <RecurrenceScopeDialog
          open
          action={scope.action}
          onConfirm={confirmScope}
          onOpenChange={(open) => !open && setScope(null)}
        />
      )}
    </main>
  );
};

const Page = () => (
  <CalendarProvider>
    <CalendarScreen />
  </CalendarProvider>
);

export default Page;
```

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev` and open the URL. Verify:
- Full-page month grid in the cyberpunk theme.
- Click a day → editor opens; create "Dentist" → chip appears; reload → chip persists.
- Create a weekly recurring event → chips appear on the right weekdays with ↻.
- Edit/delete a recurring chip → scope dialog appears; "This event" only changes that day.
- Toggle a category filter → matching chips hide/show.

- [ ] **Step 3: Type-check and commit**

Run: `pnpm exec tsc --noEmit`
Expected: passes.

```bash
git add src/app/page.tsx
git commit -m "feat: wire calendar screen with editor, scope prompt, banner, empty state"
```

---

## Task 18: Accessibility & reduced-motion verification

**Files:**
- Modify (as needed): `src/components/MonthGrid/index.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Add keyboard month navigation**

In `src/app/page.tsx`, add an `onKeyDown` handler to the `<main>` element so PageUp/PageDown change months and `n` opens a new event:

```tsx
const onKeyDown = (e: React.KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === "PageUp") cal.goToPrevMonth();
  if (e.key === "PageDown") cal.goToNextMonth();
  if (e.key.toLowerCase() === "n" && !editor && !scope) openCreate(todayISO());
};
```

Attach it: `<main ... onKeyDown={onKeyDown}>`.

- [ ] **Step 2: Verify roles and reduced motion**

- Confirm the grid exposes `role="grid"`, weekday cells `role="columnheader"`, and day cells `role="gridcell"` with an `aria-label` (already set in Tasks 12–13).
- In the browser devtools, emulate `prefers-reduced-motion: reduce` and confirm the glitch animation no longer fires while neon styling remains.
- Confirm category filter buttons expose `aria-pressed` and month nav buttons have `aria-label`s.

- [ ] **Step 3: Type-check, test, commit**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: all green.

```bash
git add src/app/page.tsx
git commit -m "feat: keyboard navigation and a11y refinements"
```

---

## Task 19: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass (types, dateGrid, recurrence, storage, context, MonthGrid, EventDialog).

- [ ] **Step 2: Run the project check**

Run: `pnpm check`
Expected: prettier, eslint, and `tsc --noEmit` all pass. Fix any formatting/lint issues, then re-run.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: `next build` succeeds.

- [ ] **Step 4: Update docs**

Per CLAUDE.md, update `docs/TRD.md` only if the implementation diverged from the spec (e.g., note the `src/components/ui/` location for shadcn). Make targeted edits if needed.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification — tests, lint, and build green"
```

---

## Self-Review (author's notes)

- **Spec coverage:** full-page month view (T13, T17), navigation/Today/filter (T14), all-day single-day events with title/date/category/notes (T5, T15), recurrence daily/weekly/monthly/yearly + interval + end (T7, T15), this/following/all edit-delete (T8, T10, T16, T17), IndexedDB persistence + typed errors + banner (T9, T10, T17), cyberpunk design language (T4 + component classes), a11y + reduced motion (T18), behavior-focused tests (T6–T10, T13, T15). Out-of-scope items (week/day views, times, multi-day, drag-drop, custom categories) are intentionally not implemented.
- **Type consistency:** `EventInput` (lib/recurrence) is the single create/edit payload across context, dialog (`toEventInput`), and orchestration. `EditScope` is defined once in the context and reused by the scope dialog + page. `Occurrence`/`CalendarEvent`/`Category` come from `@/types` everywhere.
- **Known follow-ups for the implementer:** if `remeda` is not already a dependency after scaffolding, `pnpm add remeda` (used by guards and `groupBy`). shadcn primitive prop names (`variant="ghost"`, `Textarea`, `RadioGroupItem`) should be confirmed against the generated files; adjust class hooks if the installed shadcn version differs.
