# E2EE Sync Phase 5b: Supabase auth and key-material wrappers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the thin Supabase-aware account operations the UI will orchestrate: sign up, sign in, TOTP enrollment and verification, reading the session and its assurance level, sign out, and uploading/fetching the encrypted `key_material` row. These wrap `supabase.auth` and the `key_material` table; the multi-step flow sequencing and UI live in 5c.

**Architecture:** New exports added to `src/lib/account` (which already holds the pure key crypto from 5a). Each operation is a thin async wrapper that calls the Supabase client (from `@/lib/supabase`, which is `null` when unconfigured) and maps failures to a typed `AccountError`. The pure crypto functions are unchanged. Auth and MFA calls are primarily verified live in the browser (5c); unit tests here cover the config guard, error mapping, and key-material validation against a mocked client.

**Tech Stack:** TypeScript (ESM), `@supabase/supabase-js`, vitest.

This plan implements the Supabase-auth building blocks for the "Authentication, TOTP, and recovery flows" section of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`. The `aal2`-before-write ordering (enroll and verify TOTP before any `key_material`/events write) is enforced by the consumer in 5c; these wrappers just expose the steps.

---

## Background and key decisions

- **`authSecret`, not the password, is sent to Supabase.** Callers derive `{ authSecret }` via 5a (`provisionAccountKeys` / `deriveKeys`) and pass `authSecret` here as the Supabase "password". These wrappers never see the real password.
- **`key_material` insert requires `aal2`** (the Phase 2 RLS). So 5c calls `uploadKeyMaterial` only after `verifyTotp` has elevated the session. These wrappers do not enforce ordering; they just fail (RLS rejects) if called too early, which surfaces as `AccountError`.
- **`user_id` is not sent** on insert; the column default `auth.uid()` fills it.
- **Typed failures:** every wrapper throws `AccountError` with a machine-readable `code`, so 5c can branch on it.
- **MFA response shapes:** the exact field names on the `mfa.enroll` / `getAuthenticatorAssuranceLevel` / `listFactors` responses come from the installed `@supabase/supabase-js` types. Reproduce the code below, then let `tsc` (via `pnpm check`) confirm the field access; if a field name differs in the installed version, adjust to match the type (do not guess blindly, read the type).
- **Out of scope:** the React context, the dialog, sync triggers, change-password and recovery flows (5c and 5d).

## Conventions (repeat from the repo)

- `src/lib/account` is a directory with `index.ts` / `types.ts` / `tests.ts`. `index.ts` re-exports types.
- Arrow functions, named constants, no `as` casts on unknown values (use guards), `@/` alias across modules, typed errors with a `code`.
- Run `pnpm check` before each commit.

---

## Task 1: Account error and auth result types

**Files:**
- Modify: `src/lib/account/types.ts`

- [ ] **Step 1: Add the types**

Append to `src/lib/account/types.ts`:
```typescript
export type AccountErrorCode =
  | "NOT_CONFIGURED"
  | "SIGNUP_FAILED"
  | "SIGNIN_FAILED"
  | "MFA_ENROLL_FAILED"
  | "MFA_VERIFY_FAILED"
  | "NO_KEY_MATERIAL"
  | "KEY_MATERIAL_FAILED";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, cause?: unknown) {
    super(code);
    this.name = "AccountError";
    this.code = code;
    this.cause = cause;
  }
}

export const isAccountError = (error: unknown): error is AccountError =>
  error instanceof AccountError;

/** The TOTP enrollment material shown to the user during signup. */
export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** A summary of the current Supabase session. */
export interface ActiveSession {
  email: string;
  aal2: boolean;
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm check`
Expected: passes.
```bash
git add src/lib/account/types.ts
git commit -m "feat(account): add account error and auth result types"
```

---

## Task 2: The Supabase auth and key-material wrappers

**Files:**
- Modify: `src/lib/account/index.ts`
- Test: `src/lib/account/tests.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/account/tests.ts`. At the top of the file add a mock of `@/lib/supabase` whose `supabase` value the tests control, and import the new functions and `isAccountError`. Use this mock scaffold (place the `vi.mock` and helper before the new describe blocks):
```typescript
import { vi } from "vitest";

// Controls what the account wrappers see as the Supabase client.
let mockClient: unknown = null;
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    get supabase() {
      return mockClient;
    },
  };
});

import { signUp, uploadKeyMaterial, fetchKeyMaterial } from "./index";

describe("account wrappers without configuration", () => {
  it("throws NOT_CONFIGURED when there is no Supabase client", async () => {
    mockClient = null;
    await expect(signUp("a@b.com", "secret")).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});

describe("key material wrappers", () => {
  it("uploads key material via insert", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockClient = { from: () => ({ insert }) };
    await uploadKeyMaterial({
      wrapped_dek: "a",
      wrapped_dek_nonce: "b",
      recovery_wrapped_dek: "c",
      recovery_nonce: "d",
      kdf_version: 1,
    });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("throws NO_KEY_MATERIAL when the fetched row is missing or malformed", async () => {
    mockClient = {
      from: () => ({
        select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    };
    await expect(fetchKeyMaterial()).rejects.toMatchObject({
      code: "NO_KEY_MATERIAL",
    });
  });

  it("returns valid fetched key material", async () => {
    const row = {
      wrapped_dek: "a",
      wrapped_dek_nonce: "b",
      recovery_wrapped_dek: "c",
      recovery_nonce: "d",
      kdf_version: 1,
    };
    mockClient = {
      from: () => ({
        select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    };
    expect(await fetchKeyMaterial()).toEqual(row);
  });
});
```
Note: the existing 5a tests in this file do NOT use the mock; vitest hoists `vi.mock` to the top of the module so it applies to the whole file, but the 5a tests never call the wrappers, so forcing `supabase` to a stub does not affect them (they only exercise pure crypto). The mock preserves the real exports (`sealedBoxToRow` etc.) via `...actual`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/account/tests.ts`
Expected: FAIL, the wrappers are not exported.

- [ ] **Step 3: Implement the wrappers**

Add to `src/lib/account/index.ts`. Add `supabase` to the imports from `@/lib/supabase`, the new types to the `./types` import, and `isKeyMaterial`:
```typescript
import { supabase } from "@/lib/supabase";
import {
  AccountError,
  isKeyMaterial,
  type ActiveSession,
  type KeyMaterial,
  type TotpEnrollment,
} from "./types";
```
(Keep the existing imports. `KeyMaterial` may already be imported; merge rather than duplicate.) Then add:
```typescript
const client = () => {
  if (!supabase) throw new AccountError("NOT_CONFIGURED");
  return supabase;
};

export const signUp = async (email: string, authSecret: string): Promise<void> => {
  const { error } = await client().auth.signUp({ email, password: authSecret });
  if (error) throw new AccountError("SIGNUP_FAILED", error);
};

export const signIn = async (email: string, authSecret: string): Promise<void> => {
  const { error } = await client().auth.signInWithPassword({
    email,
    password: authSecret,
  });
  if (error) throw new AccountError("SIGNIN_FAILED", error);
};

export const enrollTotp = async (): Promise<TotpEnrollment> => {
  const { data, error } = await client().auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) throw new AccountError("MFA_ENROLL_FAILED", error);
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
};

export const verifyTotp = async (
  factorId: string,
  code: string,
): Promise<void> => {
  const { error } = await client().auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  if (error) throw new AccountError("MFA_VERIFY_FAILED", error);
};

export const getTotpFactorId = async (): Promise<string | null> => {
  const { data, error } = await client().auth.mfa.listFactors();
  if (error) throw new AccountError("MFA_VERIFY_FAILED", error);
  return data.totp[0]?.id ?? null;
};

export const signOut = async (): Promise<void> => {
  await client().auth.signOut();
};

export const getActiveSession = async (): Promise<ActiveSession | null> => {
  const {
    data: { session },
  } = await client().auth.getSession();
  const email = session?.user.email;
  if (!email) return null;
  const { data } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  return { email, aal2: data?.currentLevel === "aal2" };
};

export const uploadKeyMaterial = async (
  material: KeyMaterial,
): Promise<void> => {
  const { error } = await client().from("key_material").insert(material);
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
};

export const fetchKeyMaterial = async (): Promise<KeyMaterial> => {
  const { data, error } = await client()
    .from("key_material")
    .select("*")
    .maybeSingle();
  if (error) throw new AccountError("KEY_MATERIAL_FAILED", error);
  if (!isKeyMaterial(data)) throw new AccountError("NO_KEY_MATERIAL");
  return data;
};
```
If `pnpm check` reports a type error on any MFA field (`data.totp.qr_code`, `data.totp[0]`, `data.currentLevel`), open the `@supabase/supabase-js` MFA types and adjust the field access to match the installed version, keeping the same behavior. Do not use `as` to silence it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/account/tests.ts`
Expected: PASS, the new wrapper tests plus all 5a tests stay green.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/account/index.ts src/lib/account/tests.ts
git commit -m "feat(account): add Supabase auth, MFA, and key-material wrappers"
```

---

## Task 3: Full verification

- [ ] **Step 1: Whole suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Final check**

Run: `pnpm check`
Expected: clean.

---

## Definition of done

- `src/lib/account` exports `signUp`, `signIn`, `enrollTotp`, `verifyTotp`, `getTotpFactorId`, `signOut`, `getActiveSession`, `uploadKeyMaterial`, `fetchKeyMaterial`, plus `AccountError`/`isAccountError`, `TotpEnrollment`, and `ActiveSession`.
- Each wrapper throws `AccountError("NOT_CONFIGURED")` when Supabase is unconfigured and maps Supabase errors to typed codes.
- `fetchKeyMaterial` validates with `isKeyMaterial` and throws `NO_KEY_MATERIAL` for a missing/malformed row.
- Tests (mocked client) cover the config guard, key-material upload, and fetch validation. Full suite and `pnpm check` are green.

## What this phase deliberately does not do

- No sequencing of the flows, no React, no UI. The order (enroll+verify TOTP to reach `aal2`, then upload key material, then sync) is the consumer's responsibility in 5c.
- The auth and MFA wrappers are not exercised against the live backend here; that happens when you test 5c in the browser.
- No change-password or recovery wrappers yet (5d).
