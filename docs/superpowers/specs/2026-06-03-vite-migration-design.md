# Migrate tuxbank from Next.js to Vite 8

**Date:** 2026-06-03
**Status:** Approved

## Goal

Replace Next.js with Vite 8 so the app is truly client-side-only: no framework
server, no SSR machinery, a plain static SPA. App behavior is unchanged —
storage, recurrence, balance, and all components stay as they are, and the
existing test suite must pass unmodified.

## Why Vite 8

- Rolldown-based (Rust); replaces esbuild + Rollup with one bundler.
- `@vitejs/plugin-react` v6 (already installed for vitest) declares peer
  `vite: ^8.0.0` — it is built for Vite 8.
- vitest 4.1.7 peers with `vite ^6 || ^7 || ^8`.
- `@tailwindcss/vite` 4.3.0 peers with `vite ^8`.
- Native `resolve.tsconfigPaths` removes the duplicated `@/` alias config.
- Local Node v22.17.1 satisfies the 22.12+ requirement.

## Current Next.js footprint

- `src/app/layout.tsx` — the only file using Next APIs: the `Metadata` export
  and `next/font/google` (Rajdhani, Chakra Petch, Share Tech Mono).
- `src/app/page.tsx` — plain React behind a `"use client"` directive.
- `"use client"` directives in ~18 files (inert under Vite).
- Config: `next.config.ts` (empty), `next-env.d.ts`, `eslint-config-next`,
  tsconfig `next` plugin, `postcss.config.mjs` (`@tailwindcss/postcss`).
- `public/` holds unused Next starter SVGs; `favicon.ico` lives in `src/app/`.
- No API routes, no SSR data fetching, no router usage — single page.

## Design

### 1. Entry point

| New file | Role |
| --- | --- |
| `index.html` (root) | Vite entry. Takes over `layout.tsx` metadata: `<title>CAL.EXE // Night City</title>`, meta description, `lang="en"`, favicon link, `<div id="root">`, `<script type="module" src="/src/main.tsx">`. |
| `src/main.tsx` | Imports fonts + `globals.css`, mounts `<App />` in `<StrictMode>` via `createRoot`. |
| `src/App.tsx` | Current `page.tsx` content, minus `"use client"`. |

Moves: `src/app/globals.css` → `src/globals.css`,
`src/app/smoke.test.ts` → `src/smoke.test.ts`,
`src/app/favicon.ico` → `public/favicon.ico`. `src/app/` is then deleted.

`main.tsx`/`App.tsx` are flat entry files per Vite convention — they are entry
points, not modules, so the directory-module rule does not apply.

### 2. Fonts

Replace `next/font/google` with `@fontsource` packages — the same self-hosting
outcome (fonts bundled at build time, no runtime Google requests):

| Font | Imports | CSS var |
| --- | --- | --- |
| Rajdhani | `@fontsource/rajdhani/{500,600,700}.css` | `--font-display` |
| Chakra Petch | `@fontsource/chakra-petch/{400,500,600,700}.css` | `--font-ui` |
| Share Tech Mono | `@fontsource/share-tech-mono/400.css` | `--font-mono` |

`globals.css` already consumes `var(--font-*)`; next/font currently injects
the values via a generated class on `<html>`. Add a `:root` block defining
them with real family names (e.g. `--font-display: "Rajdhani", sans-serif`).
Nothing else in the CSS changes.

### 3. Build config

One `vite.config.ts` replaces `next.config.ts` + `vitest.config.ts` +
`postcss.config.mjs`:

- Plugins: `react()` (`@vitejs/plugin-react` v6) and `tailwindcss()`
  (`@tailwindcss/vite`, replacing the PostCSS pipeline).
- `resolve.tsconfigPaths: true` sources the `@/` alias from `tsconfig.json` —
  single source of truth. Fallback: explicit `resolve.alias` if vitest does
  not honor it (verified by `pnpm test` during implementation).
- `test` block: current vitest settings move in verbatim (jsdom, globals,
  setupFiles, include patterns). vitest reads `vite.config.ts` natively.

`tsconfig.json`: drop the `next` plugin and `next-env.d.ts`/`.next` includes;
add `"types": ["vite/client"]`.

### 4. Lint, scripts, dependencies

- **ESLint:** `eslint-config-next` → `@eslint/js` + `typescript-eslint` +
  `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` +
  `eslint-plugin-jsx-a11y` (preserves the a11y coverage next's
  core-web-vitals preset provided). Ignores: `dist/` instead of `.next/`.
- **Scripts:** `dev: vite`, `build: vite build`, `start: vite preview`;
  `check`/`test`/`test:watch`/`format` unchanged.
- **Remove deps:** `next`, `eslint-config-next`, `@tailwindcss/postcss`.
- **Add deps:** `vite@^8`, `@tailwindcss/vite`, the ESLint packages above,
  `@fontsource/rajdhani`, `@fontsource/chakra-petch`,
  `@fontsource/share-tech-mono`.
- **Delete files:** `next.config.ts`, `next-env.d.ts`, `vitest.config.ts`,
  `postcss.config.mjs`, unused Next starter SVGs in `public/`.
- Strip `"use client"` from all files (~18).

### 5. Deployment, docs, verification

- **Vercel:** Vite static builds auto-detect (`dist/` output). If the Vercel
  project was linked with the Next.js preset, flip the framework setting to
  "Vite" in the dashboard — post-merge step.
- **Docs:** update CLAUDE.md (commands, architecture, rendering section,
  Turbopack gotcha → Vite equivalent) and `docs/TRD.md`.
- **Verification:** `pnpm check`, `pnpm test`, `pnpm build`, then `pnpm dev`;
  final in-browser check is done by the user.
- **Error handling:** no app-code behavior changes. Test contents must pass
  unmodified (the `smoke.test.ts` move changes only its path) — they verify
  behavior, and behavior does not change.

## Out of scope

- Any change to app behavior, components, storage, or domain logic.
- Routing (the app has one page; no router is added).
- CI/deploy workflow files.
