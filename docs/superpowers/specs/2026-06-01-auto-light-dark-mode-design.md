# Auto Light/Dark Mode — Design

**Date:** 2026-06-01
**Status:** Approved (design)

## Goal

Offer both a light and a dark theme, selected **automatically from the OS setting**
(`prefers-color-scheme`). Dark mode looks pixel-identical to today; light mode is a
"lights on" reduction of the cyberpunk aesthetic.

## Decisions

1. **Selection:** strictly follow the OS. No in-app toggle, no persistence. The theme
   reacts live if the OS switches (e.g. at sunset).
2. **Light look (Direction C — Neutral / Minimal):** near-white surfaces, high-contrast
   slate text, accents darkened to ~Tailwind-700 so they read on white, neon glows and
   CRT scanlines dropped. The chamfered-panel geometry and hazard stripe stay; the
   "neon" identity is dialed down rather than reskinned.
3. **Mechanism:** pure CSS `prefers-color-scheme`. No JS, no `.dark` class, no
   dependency. Zero runtime and no flash-of-wrong-theme.

## Architecture

Everything theme-able becomes a CSS custom property with a **light value in `:root`**
and a **dark override in `@media (prefers-color-scheme: dark)`**. Components and `.cy-*`
rules reference tokens only — no hardcoded colors, no JS color maps.

### `src/app/globals.css` restructure

- **Token split.** Today shadcn tokens have a light `:root` + a `.dark` block, but the
  cyberpunk `--cy-*` tokens are defined once (dark) and many colors are hardcoded inline
  in the `.cy-*` rules. Restructure to:
  - `:root { … }` — **all light values** (existing shadcn light + new cyberpunk light).
  - `@media (prefers-color-scheme: dark) { :root { … } }` — **all dark values** (move the
    current `.dark` shadcn block + the current `--cy-*` dark values here verbatim).
- **Dark variant.** Change `@custom-variant dark (&:is(.dark *))` →
  `@custom-variant dark (@media (prefers-color-scheme: dark))` so the shadcn `dark:`
  utilities used throughout `src/components/ui/` follow the OS automatically.
- **`color-scheme`.** Add `color-scheme: light dark` to `:root` so native scrollbars and
  form controls match the active theme.
- **Tokenize hardcoded `.cy-*` colors** so each has a light value: cell/dialog panel
  gradients, hazard-stripe second color, chip bg/text, CTA foreground, month/heading
  color, and every neon glow (`box-shadow` / `text-shadow`), which collapses to `none`
  or `transparent` in light.

### `src/app/layout.tsx`

Remove the hardcoded `dark` from `<html className="dark …">` (keep the font variables).
`<html lang="en" className="{display} {ui} {mono}">`.

## Token inventory

Structural cyberpunk tokens (`--cy-*`). Dark column = current values (unchanged).

| Token | Light | Dark (unchanged) |
|---|---|---|
| `--cy-bg` | `#f5f6f8` (flat) | `#07080d` |
| `--cy-panel` / `--cy-panel-2` | `#ffffff` / `#f1f2f4` | `#0b0e16` / `#0e1320` |
| `--cy-line` | `rgba(15,23,42,.12)` | `rgba(0,240,255,.16)` |
| `--cy-text` / `--cy-muted` | `#1e293b` / `#64748b` | `#cfe0ec` / `#5d7488` |
| `--cy-cyan` | `#0e7490` | `#00f0ff` |
| `--cy-magenta` | `#be185d` | `#ff2a6d` |
| `--cy-yellow` | `#a16207` | `#fcee0a` |
| `--cy-green` | `#047857` | `#00ff9f` |
| `--cy-orange` | `#c2410c` | `#ff9f1c` |

New derived tokens (replace inline hardcoded colors):

| Token | Light | Dark (= current literal) |
|---|---|---|
| `--cy-month` (heading) | `#0f172a` | `#fff` |
| `--cy-chip-bg` / `--cy-chip-text` | `#f1f5f9` / `#1e293b` | `rgba(0,0,0,.35)` / `#eaf6ff` |
| `--cy-cta-fg` | `#fff` | `#04141a` |
| `--cy-cell-top` / `--cy-cell-bottom` | `#ffffff` / `#f8fafc` | `rgba(14,19,32,.92)` / `rgba(8,11,18,.92)` |
| `--cy-dialog-top` / `--cy-dialog-bottom` | `#ffffff` / `#f8fafc` | `#0b1019` / `#080b12` |
| `--cy-stripe-dark` (hazard stripe) | `#cbd5e1` | `#000` |
| `--cy-glow-cyan` / `--cy-glow-magenta` (body radials) | `transparent` | `rgba(255,42,109,.08)` / `rgba(0,240,255,.07)` |
| `--cy-scanline-opacity` | `0` | `0.06` |

Glows generally: any `box-shadow`/`text-shadow` glow color becomes a token that is the
current neon rgba in dark and `transparent`/`none` in light (CTA glow, today cell glow,
month/balance/HUD text-shadows).

### Category accent tokens

Replace the JS `NEON_HEX` map (consumed inline by `EventChip`, `CategoryCombobox` `Dot`
+ selection ring, `ManageCategoriesDialog` swatches, `CalendarToolbar` filter chips) with
CSS tokens, one solid + one glow per color:

| | Light (`--cat-*`) | Dark (`--cat-*`) | `--cat-*-glow` light | `--cat-*-glow` dark |
|---|---|---|---|---|
| cyan | `#0e7490` | `#00f0ff` | `transparent` | `#00f0ff` |
| magenta | `#be185d` | `#ff2a6d` | `transparent` | `#ff2a6d` |
| yellow | `#a16207` | `#fcee0a` | `transparent` | `#fcee0a` |
| green | `#047857` | `#00ff9f` | `transparent` | `#00ff9f` |
| orange | `#c2410c` | `#ff9f1c` | `transparent` | `#ff9f1c` |

- Solid uses (chip left-border, dot fill, swatch fill, selection ring, filter-chip
  border) reference `var(--cat-${color})`.
- Glow uses reference `var(--cat-${color}-glow)` as the shadow color, keeping each site's
  existing offset/blur. In light the glow color is `transparent`, so glows vanish; in
  dark they match today.
- `EventChip`'s softer 40%-alpha glow is preserved as
  `color-mix(in srgb, var(--cat-${color}-glow) 40%, transparent)` — dark ≈ the current
  `${hex}66`, light = transparent.
- **Helpers (DRY, used in 4 components):** add `src/utils/categoryColor/` exporting
  `catColorVar(color)` → `` `var(--cat-${color})` `` and `catGlowVar(color)` →
  `` `var(--cat-${color}-glow)` `` (typed on `CategoryColor`). Remove `NEON_HEX` from
  `src/types/consts.ts`.

## Chamfered panel borders (no mechanism change)

All chamfered panels — dialogs (`EventDialog`, `RecurrenceScopeDialog`,
`ManageCategoriesDialog`, `DataDialog`, `DayEventsPopover`), the toolbar, and day cells —
already draw their border as a `<CyberFrame>` SVG vector stroke (commit `7368e5e`), which
stays uniform on the 45° chamfers where a `clip-path` + CSS `border` renders
borderless/uneven corners. CyberFrame's stroke color is already a token
(`var(--cy-cyan)` default for dialogs; `var(--cy-line)` for toolbar/cells), so it
re-themes for free: in light the dialog border becomes the deep-teal line, the toolbar/
cell borders the neutral slate line, **uniform on every edge and chamfer**. No code change
to CyberFrame; this must be verified in-browser on the light background (a dark line on
white is far more prominent than a faint glow on black).

## Effects in light mode

- **Scanlines** — hidden (`--cy-scanline-opacity: 0`); the multiply-blend CRT lines read
  as grime on a light surface. Kept in dark.
- **Body background** — flat `--cy-bg`; the magenta/cyan radial glows go `transparent`.
- **Glows** — all off via the glow tokens.
- **Glitch animation** — kept; it is motion, and its drop-shadows just use the darker
  light hues. Existing `prefers-reduced-motion` handling unchanged.
- **`StorageLockedOverlay`** — keeps its `bg-black/85` scrim; a dark scrim is appropriate
  in both themes.

## Files to change

- `src/app/globals.css` — token split + dark media query, `@custom-variant dark`,
  `color-scheme`, tokenized `.cy-*` colors, `--cat-*`/`--cat-*-glow`, body bg, scanlines.
- `src/app/layout.tsx` — drop `dark` from `<html>`.
- `src/types/consts.ts` — remove `NEON_HEX`.
- `src/utils/categoryColor/{index.ts,tests.ts}` — new `catColorVar` / `catGlowVar`.
- `src/components/EventChip/index.tsx` — use the helpers.
- `src/components/CategoryCombobox/index.tsx` — `Dot` + selection ring use the helpers.
- `src/components/ManageCategoriesDialog/index.tsx` — swatches use the helpers.
- `src/components/CalendarToolbar/index.tsx` — filter chips use the helpers.
- `docs/TRD.md` — document the theming system (auto light/dark via `prefers-color-scheme`,
  token architecture, `--cat-*` accents).

## Testing & verification

- jsdom has no layout/CSS engine, so appearance is not unit-tested. No existing behavioral
  test asserts inline colors or the `dark` class, so the refactor breaks none.
- `pnpm check` (format + lint + types) and `pnpm test` must pass — behavior is unchanged.
- In-browser (`chrome-devtools`): `emulate` `prefers-color-scheme` light **and** dark;
  screenshot the calendar and an open dialog in each, and confirm:
  - dark mode is identical to before;
  - light mode is legible (text, muted text, all five category accents on white);
  - chamfer borders stay uniform (dialog teal line; toolbar/today cell);
  - no scanlines/glows in light;
  - live OS switch updates the theme with no reload.

## Non-goals

- No manual toggle, no persisted preference, no per-component theme override.
- No change to the dark appearance.
- No change to the `CategoryColor` data model (still `cyan|magenta|yellow|green|orange`).
- No redesign of the cyberpunk aesthetic; light mode is a faithful reduction.
