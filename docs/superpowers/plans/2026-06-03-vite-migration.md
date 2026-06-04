# Next.js → Vite 8 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Next.js with Vite 8 so tuxbank is a truly client-side-only static SPA, with zero app-behavior changes.

**Architecture:** Single-pass cutover. A root `index.html` + `src/main.tsx` replace `src/app/layout.tsx`; `src/app/page.tsx` becomes `src/App.tsx`; fonts move from `next/font/google` to `@fontsource` packages; one `vite.config.ts` (with embedded vitest `test` block) replaces `next.config.ts` + `vitest.config.ts` + `postcss.config.mjs`. The existing test suite is the safety net — test contents must pass unmodified at every checkpoint.

**Tech Stack:** Vite 8 (Rolldown), `@vitejs/plugin-react` v6 (already installed), `@tailwindcss/vite`, vitest 4, `@fontsource/*`, typescript-eslint.

**Spec:** `docs/superpowers/specs/2026-06-03-vite-migration-design.md`

**Branch:** `vite-migration` (already created and checked out — verify with `git branch --show-current` before starting).

**Migration note on TDD:** This plan changes build tooling, not behavior, so no new tests are written. Every task instead ends by running the existing suite and/or build as its red/green gate. Mid-plan, `next dev`/`next build` are intentionally broken (Tasks 3–5 dismantle Next); the branch is the unit of working software, gated by Task 7.

---

### Task 1: Install Vite 8 and new dependencies

**Files:**

- Modify: `package.json` (via pnpm commands only)

- [ ] **Step 1: Add dev dependencies**

```bash
pnpm add -D vite @tailwindcss/vite typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-plugin-jsx-a11y @eslint/js globals
```

Expected: installs succeed; `vite` resolves to `^8.x`. If pnpm warns about peer deps for `@vitejs/plugin-react` (wants `vite ^8.0.0`), that warning should now be *gone* since vite 8 is present.

- [ ] **Step 2: Add font packages (runtime deps)**

```bash
pnpm add @fontsource/rajdhani @fontsource/chakra-petch @fontsource/share-tech-mono
```

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm test`
Expected: all tests PASS (same count as on `main`).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vite 8, @tailwindcss/vite, fontsource fonts, eslint plugins"
```

---

### Task 2: Replace vitest.config.ts with vite.config.ts

**Files:**

- Create: `vite.config.ts`
- Delete: `vitest.config.ts`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/tests.[jt]s?(x)"],
  },
});
```

Notes for the implementer:

- `defineConfig` comes from `vitest/config` (not `vite`) so the `test` block is typed. vitest reads `vite.config.ts` natively when `vitest.config.ts` is absent.
- `resolve.tsconfigPaths: true` is new in Vite 8 — it sources the `@/*` alias from `tsconfig.json` `paths`. The `test.include` patterns are copied verbatim from the old `vitest.config.ts`.

- [ ] **Step 2: Delete the old config**

```bash
git rm vitest.config.ts
```

- [ ] **Step 3: Run tests — this proves both the config handoff and the alias**

Run: `pnpm test`
Expected: all tests PASS. The suite imports via `@/lib/storage` etc., so a pass proves `tsconfigPaths` works under vitest.

**Fallback (only if imports fail to resolve):** replace the `resolve` line with an explicit alias and re-run:

```ts
import { fileURLToPath } from "node:url";
// ...
resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "build: replace vitest.config.ts with vite.config.ts (tailwind + tsconfig paths)"
```

---

### Task 3: Create the Vite entry; dismantle `src/app/`

**Files:**

- Create: `index.html`, `src/main.tsx`, `src/vite-env.d.ts`
- Move: `src/app/page.tsx` → `src/App.tsx`, `src/app/globals.css` → `src/globals.css`, `src/app/smoke.test.ts` → `src/smoke.test.ts`, `src/app/favicon.ico` → `public/favicon.ico`
- Delete: `src/app/layout.tsx` (and the now-empty `src/app/`)
- Modify: `src/globals.css` (add `:root` font vars), `src/App.tsx` (drop directive, rename component), `components.json`

> After this task `next dev`/`next build` no longer work. That is expected; Next is fully removed in Task 5.

- [ ] **Step 1: Move files with history**

```bash
git mv src/app/page.tsx src/App.tsx
git mv src/app/globals.css src/globals.css
git mv src/app/smoke.test.ts src/smoke.test.ts
git mv src/app/favicon.ico public/favicon.ico
git rm src/app/layout.tsx
```

(`src/app/` disappears once empty. `smoke.test.ts` imports use the `@/` alias, so its content is unchanged.)

- [ ] **Step 2: Edit `src/App.tsx`**

Three edits, content otherwise untouched:

1. Delete line 1 (`"use client";`) and the blank line after it.
2. At the bottom, rename the component:

```tsx
// OLD
const Page = () => (
  <CalendarProvider>
    <CalendarScreen />
  </CalendarProvider>
);

export default Page;

// NEW
const App = () => (
  <CalendarProvider>
    <CalendarScreen />
  </CalendarProvider>
);

export default App;
```

- [ ] **Step 3: Create `index.html` at the project root**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Full-page cyberpunk calendar" />
    <title>CAL.EXE // Night City</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(`public/` is served at the web root by Vite, so `/favicon.ico` resolves. Title and description are copied from the old `layout.tsx` `metadata` export.)

- [ ] **Step 4: Create `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/share-tech-mono/400.css";
import "./globals.css";
import App from "./App";

const container = document.getElementById("root");
if (!container) {
  // Unrecoverable bootstrap failure — no caller to handle a typed error.
  throw new Error("#root element missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

(Weights mirror the old `next/font` config exactly: Rajdhani 500/600/700, Chakra Petch 400/500/600/700, Share Tech Mono 400. `StrictMode` preserves Next's default. No `!` assertion — explicit guard instead.)

- [ ] **Step 5: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

(Types CSS side-effect imports; replaces what `next-env.d.ts` provided. Standard create-vite convention.)

- [ ] **Step 6: Define the font CSS variables in `src/globals.css`**

The old `layout.tsx` injected `--font-display`/`--font-ui`/`--font-mono` via `next/font` classes on `<html>`. Replace that by inserting this block immediately after the `@custom-variant dark ...` line (line 5):

```css
:root {
  --font-display: "Rajdhani";
  --font-ui: "Chakra Petch";
  --font-mono: "Share Tech Mono";
}
```

Bare family names only — every usage site already appends fallbacks (e.g. `font-family: var(--font-ui), system-ui, sans-serif;`). Do not touch the existing `@theme inline` block or the shadcn `:root` block further down.

- [ ] **Step 7: Update `components.json`**

Two field changes (shadcn CLI config):

```json
"rsc": false,
```

```json
"css": "src/globals.css",
```

(`rsc: false` stops future `shadcn add` runs from re-inserting `"use client"` directives.)

- [ ] **Step 8: Verify build and tests**

Run: `pnpm exec vite build`
Expected: build succeeds, output in `dist/`, no warnings about unresolved imports. Check the fonts landed: `ls dist/assets | grep -i rajdhani` shows at least one woff2.

Run: `pnpm test`
Expected: all tests PASS (smoke test now runs from `src/smoke.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: replace Next.js app shell with Vite entry (index.html, main.tsx, App.tsx)"
```

---

### Task 4: Strip `"use client"` directives

**Files (17, all modified the same way):**

- `src/context/CalendarContext/index.tsx`
- `src/components/CyberFrame/index.tsx`
- `src/components/ManageCategoriesDialog/index.tsx`
- `src/components/RecurrenceScopeDialog/index.tsx`
- `src/components/MonthGrid/index.tsx`
- `src/components/CategoryCombobox/index.tsx`
- `src/components/DataDialog/index.tsx`
- `src/components/EventDialog/index.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/input-group.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/popover.tsx`

- [ ] **Step 1: Remove the directive (and its trailing blank line) from every file**

```bash
grep -rl '^"use client";' src | xargs perl -0pi -e 's/\A"use client";\n\n?//'
pnpm format
```

- [ ] **Step 2: Verify none remain and nothing broke**

```bash
grep -rn '"use client"' src
```

Expected: no output.

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: strip inert 'use client' directives"
```

---

### Task 5: Swap ESLint/tsconfig/scripts; remove Next entirely

**Files:**

- Modify: `eslint.config.mjs`, `tsconfig.json`, `package.json`, `.gitignore`
- Delete: `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `tsconfig.tsbuildinfo` (untracked artifact), `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg`

- [ ] **Step 1: Replace `eslint.config.mjs` with this exact content**

```js
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

const eslintConfig = defineConfig([
  globalIgnores(["dist/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs["recommended-latest"],
  {
    plugins: { "react-refresh": reactRefresh },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
]);

export default eslintConfig;
```

Coverage parity vs `eslint-config-next`: TS rules (`typescript-eslint`), hooks rules (`react-hooks`), a11y rules (`jsx-a11y` — next's core-web-vitals included these). `react-refresh` is new (Vite HMR hygiene) and deliberately **warn**-level so multi-export files like `CalendarContext/index.tsx` can't fail `pnpm check`.

**Contingency:** if ESLint errors with `configs["recommended-latest"] is undefined` (the export name moved between react-hooks major versions), use `reactHooks.configs.recommended` instead.

- [ ] **Step 2: Replace `tsconfig.json` with this exact content**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "**/*.mts"],
  "exclude": ["node_modules", "dist"]
}
```

(Diff from current: `plugins: [{ name: "next" }]` removed; `next-env.d.ts` and `.next/**` includes removed; `dist` excluded.)

- [ ] **Step 3: Update `package.json` scripts**

```json
"dev": "vite",
"build": "vite build",
"start": "vite preview",
```

(`test`, `test:watch`, `format`, `check` are unchanged.)

- [ ] **Step 4: Remove Next dependencies and delete its config files**

```bash
pnpm remove next eslint-config-next @tailwindcss/postcss
git rm next.config.ts next-env.d.ts postcss.config.mjs
git rm public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg
rm -f tsconfig.tsbuildinfo
```

(The five SVGs are unused Next starter assets — `grep -rn "\.svg" src` returns nothing. `tsconfig.tsbuildinfo` is a stale untracked artifact, regenerated on demand.)

- [ ] **Step 5: Update `.gitignore`**

Replace the Next.js section:

```gitignore
# OLD
# next.js
/.next/
/out/

# NEW
# vite
/dist/
```

And remove the `next-env.d.ts` line at the bottom (under `# typescript`). Keep `*.tsbuildinfo`.

- [ ] **Step 6: Full verification gate**

```bash
rm -rf .next
pnpm check
```

Expected: prettier PASS, eslint **0 errors** (warnings acceptable — `react-hooks/incompatible-library` pre-exists on `main`, and `react-refresh` may warn on `CalendarContext`), tsc PASS.

Run: `pnpm test`
Expected: all tests PASS.

Run: `pnpm build`
Expected: `vite build` succeeds → `dist/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: remove Next.js; vite scripts, typescript-eslint config, tsconfig cleanup"
```

---

### Task 6: Update documentation (CLAUDE.md + TRD)

**Files:**

- Modify: `CLAUDE.md`, `docs/TRD.md`

- [ ] **Step 1: CLAUDE.md — Architecture intro**

Replace:

> Client-only Next.js App Router app — **no backend, no API routes**, **client-side rendered only (no SSR, no server-side hydration of app state)**. Data flows `src/app/page.tsx` → `CalendarProvider` → `src/lib/*` → IndexedDB (via `idb`).

With:

> Client-only **Vite 8 React SPA** — **no backend, no API routes, no server runtime at all** (the build is a static `dist/`). Data flows `src/App.tsx` → `CalendarProvider` → `src/lib/*` → IndexedDB (via `idb`).

- [ ] **Step 2: CLAUDE.md — replace the `src/app/` bullet**

Replace:

> - **`src/app/`** — App Router entry (`layout.tsx`, `page.tsx`) and `globals.css` (Tailwind + cyberpunk theme).

With:

> - **`index.html` + `src/main.tsx`** — Vite entry: mounts `<App />` under `StrictMode`, imports the `@fontsource` fonts and `src/globals.css` (Tailwind + cyberpunk theme).
> - **`src/App.tsx`** — top-level calendar screen composition.

- [ ] **Step 3: CLAUDE.md — replace the Rendering paragraph**

Replace the paragraph starting `**Rendering**: all UI lives under a "use client" boundary…` with:

> **Rendering**: pure client-side SPA — there is no server rendering of any kind. IndexedDB is browser-only; never introduce SSR/SSG or anything that renders app state outside the browser.

- [ ] **Step 4: CLAUDE.md — Commands block**

```bash
pnpm dev         # Vite dev server — http://localhost:5173
pnpm build       # Production build (vite build → dist/)
pnpm start       # Serve the production build (vite preview)
pnpm test        # Run tests once (vitest run)
pnpm test:watch  # Run tests in watch mode
pnpm check       # Verify formatting + lint + typecheck (run before commits)
pnpm format      # Auto-fix formatting (prettier --write)
```

- [ ] **Step 5: CLAUDE.md — Tech Stack first bullet**

Replace:

> - **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (ESM)

With:

> - **Vite 8** (Rolldown) + **React 19** + **TypeScript** (ESM)

- [ ] **Step 6: CLAUDE.md — Gotchas**

Delete the **Turbopack stale CSS** bullet entirely (Vite hot-reloads `globals.css` reliably; no replacement gotcha is known to be true).

- [ ] **Step 7: docs/TRD.md — stack table and notes**

Around lines 39–53, make these replacements:

| Location | Old | New |
| --- | --- | --- |
| Framework row | `**Next.js (App Router)** \| Calendar page is a client component ('use client'); deployable as a static client app.` | `**Vite 8 (React SPA)** \| Static client app; \`index.html\` + \`src/main.tsx\` entry, no server runtime.` |
| Fonts row | `Loaded via \`next/font\`.` | `Self-hosted via \`@fontsource\` packages, imported in \`src/main.tsx\`.` |
| As-built versions note | `Next.js 16 (App Router, Turbopack), React 19, …` | `Vite 8 (Rolldown), React 19, …` (rest unchanged) |
| Build note | `\`pnpm dev\` → \`next dev\`, \`pnpm build\` → \`next build\`, \`pnpm start\` → \`next start\`.` | `\`pnpm dev\` → \`vite\`, \`pnpm build\` → \`vite build\`, \`pnpm start\` → \`vite preview\`.` |

- [ ] **Step 8: docs/TRD.md — file tree (around lines 256–262)**

Replace the `app/` subtree:

```
  app/
    layout.tsx              # root layout, next/font registration
    page.tsx                # 'use client' calendar page
```

With (matching the actual new layout — `index.html` sits at the repo root, the rest under `src/`):

```
  main.tsx                  # Vite entry: fonts, globals.css, mounts <App />
  App.tsx                   # calendar page composition
  globals.css               # Tailwind + cyberpunk theme
```

Also scan the rest of TRD.md for any remaining `next`/`Next.js`/`Turbopack`/`layout.tsx`/`page.tsx` mentions (`grep -n -i "next\.js\|turbopack\|layout.tsx\|page.tsx\|next/font" docs/TRD.md`) and update them in the same spirit.

- [ ] **Step 9: Verify and commit**

Run: `pnpm check`
Expected: PASS (prettier validates the edited markdown).

```bash
git add CLAUDE.md docs/TRD.md
git commit -m "docs: sync CLAUDE.md + TRD with Vite 8 SPA architecture"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Clean-room install check**

```bash
pnpm install --frozen-lockfile
```

Expected: succeeds, no peer-dependency errors.

- [ ] **Step 2: Full gate**

```bash
pnpm check && pnpm test && pnpm build
```

Expected: prettier PASS · eslint 0 errors · tsc PASS · all tests PASS · `vite build` emits `dist/`.

- [ ] **Step 3: Hand off for manual browser verification**

Run: `pnpm dev`
Report the URL (http://localhost:5173). **The user does the in-browser check themselves** (fonts render in all three families, calendar grid, dialogs open centered, events persist across reload via IndexedDB, JSON export/import works). Do not dispatch a browser agent.

- [ ] **Step 4: After user sign-off — finishing workflow**

Per standing preferences: merge `vite-migration` to `main` locally (no `git pull` — the remote is an unrelated template repo), then delete the branch. Post-merge reminder for the user: if the Vercel project is linked with the Next.js framework preset, flip it to **Vite** in the Vercel dashboard (output directory `dist/`).
