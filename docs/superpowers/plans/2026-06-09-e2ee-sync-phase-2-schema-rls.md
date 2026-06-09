# E2EE Sync Phase 2: Supabase schema and RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: the schema and RLS tasks (Task 1, Task 2) are applied to the live Supabase project through the Supabase MCP tools by the controller, not by an isolated code subagent. The repo code tasks (Task 3, Task 4) are normal implementer tasks.

**Goal:** Stand up the encrypted-sync backend in the existing Supabase project `tuxbank` (`udwxiovhnlvezzcpqzht`): three tables (`events`, `categories`, `key_material`), Row Level Security that restricts every row to its owner and requires passed 2FA (`aal2`), the repo-side record of that migration, and a minimal `src/lib/supabase` client plus the row serialization helpers later phases need.

**Architecture:** The browser talks to Supabase directly with the public publishable key. Authorization is entirely in Postgres RLS, so there is no server code. Each synced row stores only ciphertext plus routing metadata (`id`, `user_id`, `updated_at`, `deleted`). Encrypted blobs are base64 `text`. The `src/lib/supabase` module owns client construction from env and the Uint8Array to base64 conversion that bridges the crypto module (which yields `SealedBox` byte arrays) to the text columns.

**Tech Stack:** Supabase Postgres + RLS, `@supabase/supabase-js`, Vite env vars, vitest.

This plan implements the "Data model and schema" section of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`, with the schema corrections noted below.

---

## Corrections to the spec, applied in this plan

The spec sketched the schema before the live data model was checked. These refinements are deliberate and supersede the spec sketch:

- `id` columns are `uuid` (event and category ids come from `crypto.randomUUID()`).
- `updated_at` is `timestamptz`, not `bigint`. The app already stores `updatedAt` as an ISO-8601 UTC string (`new Date().toISOString()`), which Postgres parses to `timestamptz` and which sorts chronologically for last-write-wins.
- `nonce`, `ciphertext`, and the wrapped-key columns are base64 `text`, not `bytea`, because `bytea` over supabase-js JSON is awkward.

Forward note for Phase 5 (do not implement here): the `aal2` RLS means the session must reach `aal2` (enroll and verify TOTP) BEFORE the first `key_material` or `events` write. The spec's onboarding step order (upload key_material, then enroll TOTP) must be reordered to enroll and verify first.

---

## Project facts (already provisioned)

- Project name: `tuxbank`, id/ref: `udwxiovhnlvezzcpqzht`, region `us-west-1`, org `yibbdsniczwghtirmskc`.
- API URL: `https://udwxiovhnlvezzcpqzht.supabase.co`
- Publishable (public) key: `sb_publishable_MIP5O5XAehRlcOz-CfFA3Q_PG09E2U4`

The publishable key is a public client credential, safe to ship in the bundle because RLS is the real guard. It still goes in a gitignored env file, with placeholders committed in `.env.example`.

---

## Task 1: Create the tables

**Tooling:** Applied by the controller via the Supabase MCP `apply_migration` tool against project `udwxiovhnlvezzcpqzht`. Keep the exact SQL below; it is also saved to the repo in Task 3.

- [ ] **Step 1: Apply the table migration**

Apply with `apply_migration` (name: `e2ee_sync_tables`):
```sql
create table public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  nonce text not null,
  ciphertext text not null
);
create index events_user_updated_idx on public.events (user_id, updated_at);

create table public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  nonce text not null,
  ciphertext text not null
);
create index categories_user_updated_idx on public.categories (user_id, updated_at);

create table public.key_material (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wrapped_dek text not null,
  wrapped_dek_nonce text not null,
  recovery_wrapped_dek text not null,
  recovery_nonce text not null,
  kdf_version integer not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Verify the tables exist**

Use the `list_tables` MCP tool for schema `public`. Expected: `events`, `categories`, `key_material` present with the columns above.

---

## Task 2: Enable RLS and add the ownership + aal2 policies

This is the security-critical task. Every table gets two policies: a restrictive policy that requires a 2FA-elevated session (`aal2`) for every operation, and a permissive policy that limits rows to the authenticated owner. Restrictive and permissive policies combine with AND, so a request must satisfy both.

- [ ] **Step 1: Apply the RLS migration**

Apply with `apply_migration` (name: `e2ee_sync_rls`):
```sql
-- events
alter table public.events enable row level security;
create policy "events require aal2"
  on public.events as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "events are owner-scoped"
  on public.events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- categories
alter table public.categories enable row level security;
create policy "categories require aal2"
  on public.categories as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "categories are owner-scoped"
  on public.categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- key_material
alter table public.key_material enable row level security;
create policy "key_material require aal2"
  on public.key_material as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "key_material is owner-scoped"
  on public.key_material for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Verify RLS is enabled and policies exist**

Run with `execute_sql`:
```sql
select tablename, policyname, permissive, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
Expected: six rows, two per table, one `PERMISSIVE` (owner-scoped) and one `RESTRICTIVE` (aal2) each.

- [ ] **Step 3: Run the security advisor**

Use the `get_advisors` MCP tool with type `security`. Expected: no "RLS disabled" or "policy missing" findings for the three new tables. If it reports anything for these tables, stop and resolve before continuing.

---

## Task 3: Record the migration and env config in the repo

Keep a repo copy of the applied SQL so the backend is reproducible, and wire the public Supabase config into Vite env without committing real keys.

**Files:**
- Create: `supabase/migrations/0001_e2ee_sync.sql`
- Create: `.env.example`
- Create or modify: `.env.local` (gitignored, real values)
- Modify: `.gitignore` (only if it does not already ignore `.env.local`)

- [ ] **Step 1: Confirm env files are gitignored**

Run: `git check-ignore .env.local || echo "NOT IGNORED"`
If it prints `NOT IGNORED`, add a line `.env.local` (and `.env*.local`) to `.gitignore`. If it prints `.env.local`, it is already ignored; do nothing to `.gitignore`.

- [ ] **Step 2: Save the migration SQL**

Create `supabase/migrations/0001_e2ee_sync.sql` containing, in order, the exact SQL from Task 1 Step 1 followed by the exact SQL from Task 2 Step 1 (tables first, then RLS). Add a one-line comment header: `-- Applied to project udwxiovhnlvezzcpqzht (tuxbank). E2EE sync tables + RLS.`

- [ ] **Step 3: Write the committed example env**

Create `.env.example`:
```
# Public Supabase client config for optional account sync.
# These are public (anon/publishable) values, safe in the client bundle; RLS is the guard.
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

- [ ] **Step 4: Write the real local env (not committed)**

Create or update `.env.local`:
```
VITE_SUPABASE_URL=https://udwxiovhnlvezzcpqzht.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_MIP5O5XAehRlcOz-CfFA3Q_PG09E2U4
```

- [ ] **Step 5: Verify .env.local is not staged**

Run: `git status --short`
Expected: `.env.local` does NOT appear (it is ignored). `supabase/migrations/0001_e2ee_sync.sql` and `.env.example` appear as untracked.

- [ ] **Step 6: Commit (only the safe files)**

```bash
git add supabase/migrations/0001_e2ee_sync.sql .env.example .gitignore
git commit -m "feat(sync): record Supabase schema migration and env template"
```
Do NOT `git add .env.local`. Never use `git add .` or `git add -A`.

---

## Task 4: Supabase client module and row serialization helpers

Create `src/lib/supabase` with the configured client and the helpers that convert a crypto `SealedBox` (byte arrays) to and from the base64 `text` columns. The serialization helpers are pure and get real TDD; the client construction is configuration verified by a typecheck.

**Files:**
- Create: `src/lib/supabase/index.ts`
- Create: `src/lib/supabase/types.ts`
- Test: `src/lib/supabase/tests.ts`
- Modify: `package.json` (add `@supabase/supabase-js`)

- [ ] **Step 1: Install the client library**

Run: `pnpm add @supabase/supabase-js`
Expected: installs, `package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write the failing test for the serialization helpers**

Create `src/lib/supabase/tests.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { sealedBoxToRow, rowToSealedBox } from "./index";

describe("sealedBox row serialization", () => {
  it("round-trips a sealed box through base64 text", () => {
    const box = {
      nonce: new Uint8Array([1, 2, 3, 4, 5]),
      ciphertext: new Uint8Array([9, 8, 7, 6, 0, 255]),
    };
    const row = sealedBoxToRow(box);
    expect(typeof row.nonce).toBe("string");
    expect(typeof row.ciphertext).toBe("string");
    const back = rowToSealedBox(row);
    expect(back.nonce).toEqual(box.nonce);
    expect(back.ciphertext).toEqual(box.ciphertext);
  });

  it("produces standard base64 strings", () => {
    const row = sealedBoxToRow({
      nonce: new Uint8Array([0]),
      ciphertext: new Uint8Array([0]),
    });
    expect(row.nonce).toBe("AA==");
    expect(row.ciphertext).toBe("AA==");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/lib/supabase/tests.ts`
Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 4: Write the types**

Create `src/lib/supabase/types.ts`:
```typescript
import type { SealedBox } from "@/lib/crypto";

/** The base64 text representation of a SealedBox as stored in the row columns. */
export interface SealedRow {
  nonce: string;
  ciphertext: string;
}

export type { SealedBox };
```

- [ ] **Step 5: Write the implementation**

Create `src/lib/supabase/index.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { SealedBox, SealedRow } from "./types";

export * from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * The Supabase client, or null when env config is absent (e.g. local-only use
 * with no account configured). Callers treat null as "sync unavailable".
 */
export const supabase =
  url && publishableKey ? createClient(url, publishableKey) : null;

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const sealedBoxToRow = (box: SealedBox): SealedRow => ({
  nonce: toBase64(box.nonce),
  ciphertext: toBase64(box.ciphertext),
});

export const rowToSealedBox = (row: SealedRow): SealedBox => ({
  nonce: fromBase64(row.nonce),
  ciphertext: fromBase64(row.ciphertext),
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/lib/supabase/tests.ts`
Expected: PASS, both serialization cases green.

- [ ] **Step 7: Add the env var typings so `import.meta.env` typechecks**

If `src/vite-env.d.ts` exists, add an `ImportMetaEnv` interface; otherwise create `src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```
If the file already exists with the Vite reference, only add the two `readonly` lines inside `ImportMetaEnv` (create the interface block if missing). Do not duplicate the `/// <reference>` line.

- [ ] **Step 8: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: passes (run `pnpm format` first if needed).

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase src/vite-env.d.ts package.json pnpm-lock.yaml
git commit -m "feat(sync): add Supabase client and row serialization helpers"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: PASS. The new module is additive.

- [ ] **Step 2: Final check**

Run: `pnpm check`
Expected: clean.

- [ ] **Step 3: Confirm the backend from the repo's perspective**

Use `list_tables` (public schema) once more and confirm the three tables and their RLS-enabled state. Use `execute_sql` to re-list `pg_policies` and confirm six policies. No commit.

---

## Definition of done

- Three tables exist in project `udwxiovhnlvezzcpqzht` with RLS enabled and the six policies (owner-scoped + aal2 per table).
- `get_advisors` security shows no RLS gaps for the new tables.
- `supabase/migrations/0001_e2ee_sync.sql` and `.env.example` are committed; `.env.local` holds the real public config and is gitignored.
- `src/lib/supabase` builds the client from env and round-trips a `SealedBox` through base64; full suite and `pnpm check` are green.

## What this phase deliberately does not do

- No queries against the tables yet (no push/pull). That is Phase 4.
- No auth flows, no MFA. That is Phase 5.
- No changes to local storage, `updatedAt` stamping, or tombstones. That is Phase 3.
- The `src/lib/supabase` client is constructed but not yet exercised against the live project in tests; behavioral RLS verification needs an authenticated `aal2` session, which arrives with Phase 5.
