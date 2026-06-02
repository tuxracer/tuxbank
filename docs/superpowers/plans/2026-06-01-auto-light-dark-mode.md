# Auto Light/Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme that, together with the existing dark theme, is selected automatically from the OS `prefers-color-scheme` setting — no toggle, no JS, dark mode unchanged.

**Architecture:** Every theme-able color becomes a CSS custom property with a light value in `:root` and a dark override in `@media (prefers-color-scheme: dark) { :root { … } }`. The Tailwind `dark:` variant is switched to be media-query-driven, the hardcoded `dark` class is removed from `<html>`, and the JS `NEON_HEX` category-color map is replaced by `--cat-*` CSS tokens accessed through small helpers. Chamfered panel borders already render via `<CyberFrame>` SVG strokes whose color is a token, so they re-theme for free.

**Tech Stack:** Next.js 16 (App Router, CSR-only), Tailwind CSS v4, shadcn/ui, TypeScript (ESM), vitest. Spec: `docs/superpowers/specs/2026-06-01-auto-light-dark-mode-design.md`.

---

## File Structure

- **Create** `src/utils/categoryColor/index.ts` — `catColorVar` / `catGlowVar`: map a `CategoryColor` to its themed CSS var reference.
- **Create** `src/utils/categoryColor/tests.ts` — unit tests for the two helpers.
- **Modify** `src/app/globals.css` — token system (light `:root` + dark media query), `@custom-variant dark`, `color-scheme`, and tokenized `.cy-*` rules / body / scanlines.
- **Modify** `src/app/layout.tsx` — drop the hardcoded `dark` class.
- **Modify** `src/types/consts.ts` — remove the `NEON_HEX` map.
- **Modify** `src/components/EventChip/index.tsx`, `src/components/CategoryCombobox/index.tsx`, `src/components/ManageCategoriesDialog/index.tsx`, `src/components/CalendarToolbar/index.tsx` — use the helpers instead of `NEON_HEX`.
- **Modify** `docs/TRD.md` — document the theming system.

**Token naming reference (used across Tasks 1–4):**
- Solid category accent: `--cat-{color}` (e.g. `--cat-cyan`).
- Category glow color: `--cat-{color}-glow` (transparent in light).
- Structural/derived cyberpunk tokens and glow tokens: `--cy-*` (full list in Task 2).

---

### Task 1: Category color CSS-var helpers

Pure string-builders that centralize the `--cat-*` naming convention so the four components and `globals.css` can't drift. TDD: these are the only unit-testable piece of this feature (everything else is CSS/appearance, which jsdom cannot verify — see CLAUDE.md).

**Files:**
- Create: `src/utils/categoryColor/index.ts`
- Test: `src/utils/categoryColor/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/categoryColor/tests.ts`:

```ts
import { describe, it, expect } from "vitest";
import { catColorVar, catGlowVar } from "./index";

describe("categoryColor CSS-var helpers", () => {
  it("maps a category color to its solid accent CSS var", () => {
    expect(catColorVar("cyan")).toBe("var(--cat-cyan)");
    expect(catColorVar("orange")).toBe("var(--cat-orange)");
  });

  it("maps a category color to its glow CSS var", () => {
    expect(catGlowVar("magenta")).toBe("var(--cat-magenta-glow)");
    expect(catGlowVar("green")).toBe("var(--cat-green-glow)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/utils/categoryColor`
Expected: FAIL — cannot resolve `./index` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/categoryColor/index.ts`:

```ts
import type { CategoryColor } from "@/types";

/**
 * CSS var holding the solid accent for a category color. Defined in
 * globals.css with a light value in `:root` and a dark override in the
 * `prefers-color-scheme: dark` media query, so it themes automatically.
 */
export const catColorVar = (color: CategoryColor): string => `var(--cat-${color})`;

/**
 * CSS var for the glow/shadow color of a category color. Same neon hue as the
 * accent in dark mode; `transparent` in light mode so glows disappear.
 */
export const catGlowVar = (color: CategoryColor): string =>
  `var(--cat-${color}-glow)`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/utils/categoryColor`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/categoryColor
git commit -m "feat(utils): catColorVar/catGlowVar category-color CSS-var helpers"
```

---

### Task 2: Define the light/dark token system in globals.css

Restructure the token layer so `:root` holds all light values and a `prefers-color-scheme: dark` media query holds all dark values. After this task the app still looks correct in dark mode; light mode is partially themed (the `.cy-*` rules still carry dark literals until Task 3). This is an acceptable intermediate commit.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Make the `dark:` variant media-query-driven**

Replace (line ~5):

```css
@custom-variant dark (&:is(.dark *));
```

with:

```css
@custom-variant dark (@media (prefers-color-scheme: dark));
```

- [ ] **Step 2: Add `color-scheme` to the shadcn light `:root`**

Replace the opening of the first `:root` block (line ~51):

```css
:root {
  --background: oklch(1 0 0);
```

with:

```css
:root {
  color-scheme: light dark;
  --background: oklch(1 0 0);
```

- [ ] **Step 3: Convert the shadcn `.dark` block to a dark media query**

Replace the entire `.dark { … }` block (lines ~86–118):

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

with (wrap in `@media … { :root { … } }`, declarations indented to 4 spaces):

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
  }
}
```

- [ ] **Step 4: Replace the cyberpunk `:root` (currently dark) with light values + a dark media query**

Replace the second `:root` block under `/* CYBERPUNK DESIGN SYSTEM */` (lines ~133–145):

```css
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
```

with (light values in `:root`, then all dark values in a media query):

```css
:root {
  /* Cyberpunk surfaces — light (Direction C: neutral/minimal) */
  --cy-bg: #f5f6f8;
  --cy-panel: #ffffff;
  --cy-panel-2: #f1f2f4;
  --cy-line: rgba(15, 23, 42, 0.12);
  --cy-cyan: #0e7490;
  --cy-magenta: #be185d;
  --cy-yellow: #a16207;
  --cy-green: #047857;
  --cy-orange: #c2410c;
  --cy-text: #1e293b;
  --cy-muted: #64748b;

  /* Derived surface tokens — light */
  --cy-month: #0f172a;
  --cy-chip-bg: #f1f5f9;
  --cy-chip-text: #1e293b;
  --cy-cta-fg: #ffffff;
  --cy-cell-top: #ffffff;
  --cy-cell-bottom: #f8fafc;
  --cy-dialog-top: #ffffff;
  --cy-dialog-bottom: #f8fafc;
  --cy-stripe-dark: #cbd5e1;

  /* Glow/effect tokens — off in light */
  --cy-radial-magenta: transparent;
  --cy-radial-cyan: transparent;
  --cy-scanline-opacity: 0;
  --cy-glow-cyan: transparent;
  --cy-glow-cyan-soft: transparent;
  --cy-glow-yellow: transparent;
  --cy-glow-green: transparent;
  --cy-glow-magenta-soft: transparent;
  --cy-glow-today: transparent;
  --cy-glow-today-inset: transparent;

  /* Category accents — light (darkened ~700 shade) */
  --cat-cyan: #0e7490;
  --cat-magenta: #be185d;
  --cat-yellow: #a16207;
  --cat-green: #047857;
  --cat-orange: #c2410c;
  --cat-cyan-glow: transparent;
  --cat-magenta-glow: transparent;
  --cat-yellow-glow: transparent;
  --cat-green-glow: transparent;
  --cat-orange-glow: transparent;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Cyberpunk surfaces — dark (current values) */
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

    /* Derived surface tokens — dark (current literals) */
    --cy-month: #ffffff;
    --cy-chip-bg: rgba(0, 0, 0, 0.35);
    --cy-chip-text: #eaf6ff;
    --cy-cta-fg: #04141a;
    --cy-cell-top: rgba(14, 19, 32, 0.92);
    --cy-cell-bottom: rgba(8, 11, 18, 0.92);
    --cy-dialog-top: #0b1019;
    --cy-dialog-bottom: #080b12;
    --cy-stripe-dark: #000000;

    /* Glow/effect tokens — dark (current literals) */
    --cy-radial-magenta: rgba(255, 42, 109, 0.08);
    --cy-radial-cyan: rgba(0, 240, 255, 0.07);
    --cy-scanline-opacity: 0.06;
    --cy-glow-cyan: #00f0ff;
    --cy-glow-cyan-soft: rgba(0, 240, 255, 0.45);
    --cy-glow-yellow: #fcee0a;
    --cy-glow-green: #00ff9f;
    --cy-glow-magenta-soft: rgba(255, 42, 109, 0.5);
    --cy-glow-today: rgba(252, 238, 10, 0.25);
    --cy-glow-today-inset: rgba(252, 238, 10, 0.12);

    /* Category accents — dark (current neon) */
    --cat-cyan: #00f0ff;
    --cat-magenta: #ff2a6d;
    --cat-yellow: #fcee0a;
    --cat-green: #00ff9f;
    --cat-orange: #ff9f1c;
    --cat-cyan-glow: #00f0ff;
    --cat-magenta-glow: #ff2a6d;
    --cat-yellow-glow: #fcee0a;
    --cat-green-glow: #00ff9f;
    --cat-orange-glow: #ff9f1c;
  }
}
```

- [ ] **Step 5: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: PASS. If prettier flags `globals.css` indentation, run `pnpm format` then re-run `pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): light/dark token system via prefers-color-scheme

Split every theme token into a light :root value and a dark media-query
override; switch the Tailwind dark: variant to media-driven and declare
color-scheme. Adds derived surface/glow tokens and --cat-* category accents.
Dark values are unchanged."
```

---

### Task 3: Apply tokens in the `.cy-*` rules, body, scanlines; drop the `dark` class

Swap every hardcoded color in the cyberpunk rules for the tokens defined in Task 2, and remove the hardcoded `dark` class so the media query is the sole driver. After this task the CSS is fully themed.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Tokenize the body background**

Replace the `body` background block (lines ~151–167):

```css
body {
  background:
    radial-gradient(
      1300px 800px at 75% -15%,
      rgba(255, 42, 109, 0.08),
      transparent 62%
    ),
    radial-gradient(
      1000px 700px at 8% 115%,
      rgba(0, 240, 255, 0.07),
      transparent 62%
    ),
    var(--cy-bg);
  color: var(--cy-text);
  font-family: var(--font-ui), system-ui, sans-serif;
  overflow: hidden;
}
```

with (radial colors become tokens; everything else unchanged):

```css
body {
  background:
    radial-gradient(
      1300px 800px at 75% -15%,
      var(--cy-radial-magenta),
      transparent 62%
    ),
    radial-gradient(
      1000px 700px at 8% 115%,
      var(--cy-radial-cyan),
      transparent 62%
    ),
    var(--cy-bg);
  color: var(--cy-text);
  font-family: var(--font-ui), system-ui, sans-serif;
  overflow: hidden;
}
```

- [ ] **Step 2: Tokenize the scanline opacity**

In `.cy-scanlines::before` (line ~183) replace:

```css
  opacity: 0.06;
```

with:

```css
  opacity: var(--cy-scanline-opacity);
```

- [ ] **Step 3: Tokenize the toolbar hazard stripe**

In `.cy-toolbar::before` replace the stripe color `#000`:

```css
    repeating-linear-gradient(45deg, var(--cy-magenta) 0 8px, #000 8px 16px)
      left / 6px 100% no-repeat,
```

with:

```css
    repeating-linear-gradient(
        45deg,
        var(--cy-magenta) 0 8px,
        var(--cy-stripe-dark) 8px 16px
      )
      left / 6px 100% no-repeat,
```

- [ ] **Step 4: Tokenize `.cy-month`**

Replace (lines ~235–241):

```css
.cy-month {
  font-family: var(--font-display), sans-serif;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
  text-shadow: 0 0 14px rgba(0, 240, 255, 0.45);
}
```

with:

```css
.cy-month {
  font-family: var(--font-display), sans-serif;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--cy-month);
  text-shadow: 0 0 14px var(--cy-glow-cyan-soft);
}
```

- [ ] **Step 5: Tokenize the `.cy-nav` glow**

In `.cy-nav` replace:

```css
  text-shadow: 0 0 8px var(--cy-cyan);
```

with:

```css
  text-shadow: 0 0 8px var(--cy-glow-cyan);
```

- [ ] **Step 6: Tokenize the `.cy-cta` foreground + glow**

In `.cy-cta` replace:

```css
  color: #04141a;
```

with:

```css
  color: var(--cy-cta-fg);
```

and replace:

```css
  box-shadow: 0 0 18px rgba(0, 240, 255, 0.45);
```

with:

```css
  box-shadow: 0 0 18px var(--cy-glow-cyan-soft);
```

- [ ] **Step 7: Tokenize the `.cy-cell` fill and today glows**

Replace the `.cy-cell::before` background (lines ~313–317):

```css
  background: linear-gradient(
    180deg,
    rgba(14, 19, 32, 0.92),
    rgba(8, 11, 18, 0.92)
  );
```

with:

```css
  background: linear-gradient(180deg, var(--cy-cell-top), var(--cy-cell-bottom));
```

Replace `.cy-cell.today` (lines ~325–327):

```css
.cy-cell.today {
  box-shadow: 0 0 16px rgba(252, 238, 10, 0.25);
}
```

with:

```css
.cy-cell.today {
  box-shadow: 0 0 16px var(--cy-glow-today);
}
```

Replace `.cy-cell.today::before` (lines ~328–330):

```css
.cy-cell.today::before {
  box-shadow: inset 0 0 22px rgba(252, 238, 10, 0.12);
}
```

with:

```css
.cy-cell.today::before {
  box-shadow: inset 0 0 22px var(--cy-glow-today-inset);
}
```

Replace the today date-number glow in `.cy-cell.today .cy-cell-num` (lines ~335–339):

```css
.cy-cell.today .cy-cell-num {
  color: var(--cy-yellow);
  text-shadow: 0 0 10px var(--cy-yellow);
  font-weight: 700;
}
```

with:

```css
.cy-cell.today .cy-cell-num {
  color: var(--cy-yellow);
  text-shadow: 0 0 10px var(--cy-glow-yellow);
  font-weight: 700;
}
```

- [ ] **Step 8: Tokenize the `.cy-chip` fill + text**

In `.cy-chip` replace:

```css
  background: rgba(0, 0, 0, 0.35);
  color: #eaf6ff;
```

with:

```css
  background: var(--cy-chip-bg);
  color: var(--cy-chip-text);
```

- [ ] **Step 9: Tokenize the `.cy-dialog` fill**

In `.cy-dialog::before` replace:

```css
  background: linear-gradient(180deg, #0b1019, #080b12);
```

with:

```css
  background: linear-gradient(180deg, var(--cy-dialog-top), var(--cy-dialog-bottom));
```

- [ ] **Step 10: Tokenize the HUD + balance glows**

In `.cy-hud .on` replace:

```css
  text-shadow: 0 0 8px var(--cy-green);
```

with:

```css
  text-shadow: 0 0 8px var(--cy-glow-green);
```

In `.cy-balance` replace:

```css
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.45);
```

with:

```css
  text-shadow: 0 0 8px var(--cy-glow-cyan-soft);
```

In `.cy-balance-neg` replace:

```css
  text-shadow: 0 0 8px rgba(255, 42, 109, 0.5);
```

with:

```css
  text-shadow: 0 0 8px var(--cy-glow-magenta-soft);
```

> Note: the `.cy-glitch` keyframes intentionally keep `var(--cy-magenta)` / `var(--cy-cyan)` — the glitch animation is retained in light mode with the darker hues (per spec).

- [ ] **Step 11: Remove the hardcoded `dark` class from `<html>`**

In `src/app/layout.tsx` replace:

```tsx
  <html
    lang="en"
    className={`dark ${display.variable} ${ui.variable} ${mono.variable}`}
  >
```

with:

```tsx
  <html
    lang="en"
    className={`${display.variable} ${ui.variable} ${mono.variable}`}
  >
```

- [ ] **Step 12: Verify formatting, lint, types, and existing tests**

Run: `pnpm check`
Expected: PASS. If prettier flags formatting, run `pnpm format` then re-run `pnpm check`.

Run: `pnpm test`
Expected: PASS (behavior unchanged — no test asserts CSS or the `dark` class).

- [ ] **Step 13: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(theme): drive .cy-* rules off theme tokens; drop hardcoded dark class

Replace every hardcoded color in the cyberpunk rules (body radials, scanline,
hazard stripe, month/cta/cell/chip/dialog/hud/balance + all glows) with the
light/dark tokens. Remove the dark class from <html> so prefers-color-scheme is
the sole driver."
```

---

### Task 4: Replace the JS NEON_HEX map with `--cat-*` tokens

Migrate the four components that color category accents inline from `NEON_HEX[color]` (a fixed neon hex) to the themed `var(--cat-*)` references via the Task 1 helpers, then delete `NEON_HEX`.

**Files:**
- Modify: `src/components/EventChip/index.tsx`
- Modify: `src/components/CategoryCombobox/index.tsx`
- Modify: `src/components/ManageCategoriesDialog/index.tsx`
- Modify: `src/components/CalendarToolbar/index.tsx`
- Modify: `src/types/consts.ts`

- [ ] **Step 1: EventChip — use the helpers**

In `src/components/EventChip/index.tsx` replace the import line:

```tsx
import { NEON_HEX } from "@/types";
```

with:

```tsx
import { catColorVar, catGlowVar } from "@/utils/categoryColor";
```

Replace the body of the component (the `hex` line and the `style` prop):

```tsx
  const hex = NEON_HEX[occurrence.category.color];
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      type="button"
      className="cy-chip w-full text-left"
      style={{ borderLeftColor: hex, boxShadow: `-1px 0 8px ${hex}66` }}
```

with:

```tsx
  const { color } = occurrence.category;
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      type="button"
      className="cy-chip w-full text-left"
      style={{
        borderLeftColor: catColorVar(color),
        boxShadow: `-1px 0 8px color-mix(in srgb, ${catGlowVar(color)} 40%, transparent)`,
      }}
```

> The `color-mix(... 40%, transparent)` reproduces the previous `${hex}66` (40% alpha) glow in dark and resolves to transparent in light.

- [ ] **Step 2: CategoryCombobox — Dot fill + selection ring**

In `src/components/CategoryCombobox/index.tsx` replace:

```tsx
import { NEON_HEX, categoryKey } from "@/types";
```

with:

```tsx
import { categoryKey } from "@/types";
import { catColorVar, catGlowVar } from "@/utils/categoryColor";
```

Replace the `Dot` style:

```tsx
    style={{
      background: NEON_HEX[color],
      boxShadow: `0 0 6px ${NEON_HEX[color]}`,
    }}
```

with:

```tsx
    style={{
      background: catColorVar(color),
      boxShadow: `0 0 6px ${catGlowVar(color)}`,
    }}
```

Replace the selection-ring style (around line ~134):

```tsx
                    outline:
                      newColor === color
                        ? `2px solid ${NEON_HEX[color]}`
                        : "none",
```

with:

```tsx
                    outline:
                      newColor === color
                        ? `2px solid ${catColorVar(color)}`
                        : "none",
```

- [ ] **Step 3: ManageCategoriesDialog — swatch fill + selection ring**

In `src/components/ManageCategoriesDialog/index.tsx` replace:

```tsx
import { NEON_HEX, categoryKey } from "@/types";
```

with:

```tsx
import { categoryKey } from "@/types";
import { catColorVar, catGlowVar } from "@/utils/categoryColor";
```

Replace the selection-ring style (around line ~99):

```tsx
                        outline:
                          c.color === color
                            ? `2px solid ${NEON_HEX[color]}`
                            : "none",
```

with:

```tsx
                        outline:
                          c.color === color
                            ? `2px solid ${catColorVar(color)}`
                            : "none",
```

Replace the swatch style (around line ~107):

```tsx
                        style={{
                          background: NEON_HEX[color],
                          boxShadow: `0 0 6px ${NEON_HEX[color]}`,
                        }}
```

with:

```tsx
                        style={{
                          background: catColorVar(color),
                          boxShadow: `0 0 6px ${catGlowVar(color)}`,
                        }}
```

- [ ] **Step 4: CalendarToolbar — filter chips**

In `src/components/CalendarToolbar/index.tsx` replace:

```tsx
import { NEON_HEX } from "@/types";
```

with:

```tsx
import { catColorVar, catGlowVar } from "@/utils/categoryColor";
```

Replace the chip render block (around lines ~73–91):

```tsx
            const active = activeCategoryIds.has(c.id);
            const hex = NEON_HEX[c.color];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                title={c.name}
                onClick={() => onToggleCategory(c.id)}
                className="cy-mono flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
                style={{ borderColor: hex, opacity: active ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: hex,
                    boxShadow: `0 0 8px ${hex}`,
                  }}
                />
```

with:

```tsx
            const active = activeCategoryIds.has(c.id);
            const colorVar = catColorVar(c.color);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                title={c.name}
                onClick={() => onToggleCategory(c.id)}
                className="cy-mono flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase"
                style={{ borderColor: colorVar, opacity: active ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: colorVar,
                    boxShadow: `0 0 8px ${catGlowVar(c.color)}`,
                  }}
                />
```

- [ ] **Step 5: Delete the `NEON_HEX` map**

In `src/types/consts.ts` remove the block (lines ~11–18):

```ts
/** Neon hex per category color, used for chip accents/glow (inline styles). */
export const NEON_HEX: Record<CategoryColor, string> = {
  cyan: "#00f0ff",
  magenta: "#ff2a6d",
  yellow: "#fcee0a",
  green: "#00ff9f",
  orange: "#ff9f1c",
};
```

If `CategoryColor` is now an unused import in `consts.ts`, remove it from the import on line 1 (keep `Category`):

```ts
import type { Category, CategoryColor } from "./index";
```

→

```ts
import type { Category } from "./index";
```

- [ ] **Step 6: Verify no stale references, then check + test**

Run: `grep -rn "NEON_HEX" src`
Expected: no matches.

Run: `pnpm check`
Expected: PASS (no unused imports, types resolve). Run `pnpm format` if formatting is flagged.

Run: `pnpm test`
Expected: PASS (EventChip and category tests assert amounts/labels, not inline colors).

- [ ] **Step 7: Commit**

```bash
git add src/components/EventChip src/components/CategoryCombobox src/components/ManageCategoriesDialog src/components/CalendarToolbar src/types/consts.ts
git commit -m "refactor(theme): category accents via --cat-* tokens, remove NEON_HEX

EventChip, CategoryCombobox, ManageCategoriesDialog, and CalendarToolbar now
color category accents through catColorVar/catGlowVar (themed CSS vars) instead
of the inline NEON_HEX hex map, so accents darken on light backgrounds and glows
drop. Removes the now-unused NEON_HEX."
```

---

### Task 5: Document the theming system in the TRD

**Files:**
- Modify: `docs/TRD.md`

- [ ] **Step 1: Add a Theming subsection after Component styling**

In `docs/TRD.md`, immediately after the `### Component styling` block (after the `<CyberFrame>` bullet, line ~236, before the following `---`), insert:

```markdown

### Theming — light/dark (auto, follows OS)
- Both themes are selected automatically from `prefers-color-scheme`; there is **no in-app toggle and no persistence**. Pure CSS — no JS, no theme class.
- Every theme-able color is a CSS custom property: light values live in `:root`, dark values in `@media (prefers-color-scheme: dark) { :root { … } }`. The Tailwind `dark:` variant is media-query-driven (`@custom-variant dark (@media (prefers-color-scheme: dark))`), and `:root` sets `color-scheme: light dark` for native controls.
- **Dark** is the original neon-on-black palette (unchanged). **Light** (Direction C — neutral/minimal) uses near-white surfaces, slate text, category/accent hues darkened to ~700 shades for contrast, and drops scanlines, body glows, and neon `box-/text-shadow` glows (glow tokens resolve to `transparent`).
- Category accents are CSS tokens `--cat-{color}` / `--cat-{color}-glow` (not a JS hex map); components reference them via `catColorVar` / `catGlowVar` in `src/utils/categoryColor`.
- `<CyberFrame>` borders re-theme for free because their stroke color is already a `var(--cy-*)` token; chamfer uniformity must be re-verified on the light background.
```

- [ ] **Step 2: Update the future-work line**

Replace (line ~326):

```markdown
- Theme toggle (e.g., alternate palettes) and a light mode.
```

with:

```markdown
- Manual theme toggle / alternate palettes (light & dark already follow the OS automatically).
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: PASS (prettier checks markdown too; run `pnpm format` if flagged).

```bash
git add docs/TRD.md
git commit -m "docs(TRD): document auto light/dark theming"
```

---

### Task 6: In-browser verification (light + dark)

jsdom can't see CSS, so this manual gate is the real test. Use the `chrome-devtools` MCP tools.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run (background): `pnpm dev`
Wait for "Ready" / `http://localhost:3000`.

- [ ] **Step 2: Verify dark mode is unchanged**

- `emulate` `prefers-color-scheme: dark`, navigate to `http://localhost:3000`.
- Open an event dialog (click a day or "+ New Event"); open the category combobox; mark a day as today.
- `take_screenshot`. Confirm: neon-on-black palette identical to before — neon chips/glows, scanline whisper, yellow today glow, uniform cyan dialog border on the top-right/bottom-left chamfers.

- [ ] **Step 3: Verify light mode**

- `emulate` `prefers-color-scheme: light`; reload.
- Screenshot the calendar and an open dialog, plus the category combobox/manage dialog (all five accents visible).
- Confirm:
  - near-white surfaces, slate text, readable muted text;
  - all five category accents (cyan/magenta/yellow/green/orange) legible on white as chip borders, dots, and swatches;
  - no scanlines, no body glows, no neon text/box glows;
  - chamfered borders (dialog deep-teal; toolbar/today cell) are uniform on every edge and chamfer — no borderless top-right/bottom-left corners;
  - the magenta hazard stripe reads against the light toolbar.

- [ ] **Step 4: Verify live OS switching**

- With the app open, `emulate` toggling `prefers-color-scheme` dark↔light without reloading.
- Confirm the theme flips immediately (no reload, no flash).

- [ ] **Step 5: Record the result**

If all checks pass, the feature is complete. If any check fails, file the specific defect and return to the relevant task (e.g., a weak accent → adjust the `--cat-*` light value in `globals.css` Task 2; a broken chamfer border → re-check the host `::before` vs `CyberFrame` props per `docs/TRD.md`).

---

## Self-Review

**Spec coverage:**
- Strictly-follow-OS, pure CSS, no toggle → Task 2 (`@custom-variant` media query, `color-scheme`) + Task 3 (drop `dark` class). ✓
- Token split light `:root` / dark media query → Task 2. ✓
- Direction-C light palette values → Task 2 token tables; applied in Task 3. ✓
- Tokenize hardcoded `.cy-*` colors (cell/dialog gradients, stripe, chip, CTA, month, glows, body, scanlines) → Task 3 Steps 1–10. ✓
- `--cat-*` accents replacing `NEON_HEX`, with `catColorVar`/`catGlowVar` helpers; EventChip 40%-glow nuance → Task 1 + Task 4. ✓
- CyberFrame borders re-theme, verify chamfer uniformity on light → Task 6 Steps 2–3. ✓
- Effects: scanlines off, body glows off, glitch kept → Task 2 tokens + Task 3 Steps 1,2,10 note. ✓
- Docs (TRD) → Task 5. ✓
- Verification plan (check, test, in-browser light+dark+live switch) → Tasks 2/3/4 checks + Task 6. ✓
- Non-goals (no toggle/persistence, dark unchanged, data model unchanged) → respected; dark values copied verbatim. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full before/after. ✓

**Type/name consistency:** `catColorVar` / `catGlowVar` signatures (`(color: CategoryColor) => string`) and token names `--cat-{color}` / `--cat-{color}-glow` match between Task 1, Task 2 definitions, and Task 4 usages. Glow token names (`--cy-glow-cyan`, `--cy-glow-cyan-soft`, `--cy-glow-yellow`, `--cy-glow-green`, `--cy-glow-magenta-soft`, `--cy-glow-today`, `--cy-glow-today-inset`, `--cy-radial-magenta`, `--cy-radial-cyan`, `--cy-scanline-opacity`) defined in Task 2 are each consumed in Task 3. ✓
