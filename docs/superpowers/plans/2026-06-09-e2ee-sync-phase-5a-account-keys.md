# E2EE Sync Phase 5a: Account key orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/account`, the pure crypto-composition layer for accounts: turn a password and email into everything needed to create an account (auth secret, data key, one-time recovery key, and the encrypted `key_material` row), unlock the data key later from either the password or the recovery key, and re-wrap the data key when the password changes. No Supabase calls, no React, no UI.

**Architecture:** A React-free module that composes `@/lib/crypto` primitives into the account key hierarchy from the spec (KEK from password wraps a random DEK; a recovery key independently wraps the same DEK; the auth secret is a separate password-derived value handed to Supabase). It maps the wrapped `SealedBox` values to and from the base64 `text` columns of the `key_material` table using a new shared `src/utils/base64` helper (extracted from the Supabase module, which currently keeps those helpers private). Everything here is deterministic given its inputs and fully unit-testable with real crypto.

**Tech Stack:** TypeScript (ESM), `libsodium` (via `@/lib/crypto`), vitest.

This plan implements the key-management half of the "Authentication, TOTP, and recovery flows" section of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`. The Supabase-auth wrappers, the React context, and the dialog UI are later sub-phases (5b, 5c).

---

## Background and key decisions

- **Key hierarchy (from the spec):** `KEK = Argon2id(password, email)` wraps a random 256-bit `DEK`. A random `recoveryKey` derives a second wrapping key that also wraps the same `DEK`. `authSecret = Argon2id(password, email, distinct context)` is the value sent to Supabase auth, so the real password never leaves the device. All of these come from `@/lib/crypto` (`deriveKeys`, `generateDek`, `wrapKey`, `unwrapKey`, `generateRecoveryKey`, `deriveRecoveryKek`).
- **`key_material` columns:** the Phase 2 table stores base64 text: `wrapped_dek`, `wrapped_dek_nonce`, `recovery_wrapped_dek`, `recovery_nonce`, `kdf_version`. A wrapped key is a `SealedBox` (`{ nonce, ciphertext }`); this module maps `ciphertext -> wrapped_dek` and `nonce -> wrapped_dek_nonce` (and the recovery pair), base64-encoding each side.
- **`kdf_version`** is recorded from the crypto module's `KDF_VERSION` so a future parameter change is migratable.
- **Wrong key fails loudly:** unlocking with the wrong password or recovery key throws (the AEAD tag rejects), surfaced to the caller; this module never returns a bogus DEK.
- **Base64 helpers are shared, not duplicated:** the Supabase module already has private `toBase64`/`fromBase64`. This phase moves them to `src/utils/base64` so both the Supabase module and this account module use one copy (the Phase 2 review flagged this duplication risk).
- **Out of scope here:** any `supabase.auth` call (signUp, signIn, MFA), the React context, and the UI. The sign-in flow that combines this with Supabase auth lives in 5b; for simplicity it may re-derive keys rather than thread the KEK through, which is acceptable for an infrequent login.

## Conventions (repeat from the repo)

- Modules and utils are directories with `index.ts` and, where useful, `consts.ts` / `types.ts` / `tests.ts`. `index.ts` re-exports types. Tests import from `./index` and use vitest.
- Arrow functions, named constants, no `as` casts on unknown values (use guards), `@/` alias across modules.
- Run `pnpm check` before each commit.

---

## Task 1: Extract base64 helpers to a shared util

Move `toBase64`/`fromBase64` out of the Supabase module into `src/utils/base64` and have the Supabase module import them.

**Files:**
- Create: `src/utils/base64/index.ts`
- Create: `src/utils/base64/tests.ts`
- Modify: `src/lib/supabase/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/base64/tests.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { toBase64, fromBase64 } from "./index";

describe("base64", () => {
  it("round-trips bytes including 0 and 255", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("encodes to standard base64", () => {
    expect(toBase64(new Uint8Array([0]))).toBe("AA==");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/utils/base64/tests.ts`
Expected: FAIL, `./index` does not exist.

- [ ] **Step 3: Create the util**

Create `src/utils/base64/index.ts`:
```typescript
export const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

export const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
```

- [ ] **Step 4: Point the Supabase module at the shared util**

In `src/lib/supabase/index.ts`, delete the local `toBase64`/`fromBase64` definitions (lines defining them) and add an import at the top:
```typescript
import { toBase64, fromBase64 } from "@/utils/base64";
```
Leave `sealedBoxToRow`/`rowToSealedBox` unchanged; they now use the imported helpers.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/utils/base64/tests.ts src/lib/supabase/tests.ts`
Expected: PASS, both files green (the Supabase serialization still round-trips).

- [ ] **Step 6: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/utils/base64 src/lib/supabase/index.ts
git commit -m "refactor(utils): extract shared base64 helpers"
```

---

## Task 2: Account types

Define the `key_material` row shape and the result types, with a guard for validating fetched material.

**Files:**
- Create: `src/lib/account/types.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/account/types.ts`:
```typescript
import { isNumber, isPlainObject, isString } from "remeda";

/** Encrypted key material, mirroring the key_material table's base64 columns. */
export interface KeyMaterial {
  wrapped_dek: string;
  wrapped_dek_nonce: string;
  recovery_wrapped_dek: string;
  recovery_nonce: string;
  kdf_version: number;
}

export const isKeyMaterial = (value: unknown): value is KeyMaterial =>
  isPlainObject(value) &&
  isString(value.wrapped_dek) &&
  isString(value.wrapped_dek_nonce) &&
  isString(value.recovery_wrapped_dek) &&
  isString(value.recovery_nonce) &&
  isNumber(value.kdf_version);

/** Everything produced when a brand-new account's keys are provisioned. */
export interface ProvisionedKeys {
  /** The value handed to Supabase auth in place of the real password. */
  authSecret: string;
  /** The in-memory data key. Never persisted. */
  dek: Uint8Array;
  /** The one-time recovery key, shown to the user once. */
  recoveryKey: string;
  /** The encrypted material to upload to the key_material table. */
  keyMaterial: KeyMaterial;
}

/** The new auth secret and re-wrapped password columns after a password change. */
export interface RewrappedKeys {
  authSecret: string;
  wrapped_dek: string;
  wrapped_dek_nonce: string;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm check`
Expected: passes (the file compiles; it is not imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/account/types.ts
git commit -m "feat(account): add key material and result types"
```

---

## Task 3: Provision keys and unlock with password

The core: create a new account's keys, and unlock the DEK from the password later.

**Files:**
- Create: `src/lib/account/index.ts`
- Test: `src/lib/account/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/account/tests.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { provisionAccountKeys, unlockWithPassword } from "./index";
import { isKeyMaterial } from "./types";

describe("provisionAccountKeys / unlockWithPassword", () => {
  it("provisions material and unlocks the same DEK from the password", async () => {
    const provisioned = await provisionAccountKeys("correct horse", "user@example.com");
    expect(isKeyMaterial(provisioned.keyMaterial)).toBe(true);
    expect(provisioned.dek).toBeInstanceOf(Uint8Array);
    expect(typeof provisioned.authSecret).toBe("string");
    expect(typeof provisioned.recoveryKey).toBe("string");

    const dek = await unlockWithPassword("correct horse", "user@example.com", provisioned.keyMaterial);
    expect(dek).toEqual(provisioned.dek);
  });

  it("records the KDF version in the material", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    expect(provisioned.keyMaterial.kdf_version).toBeGreaterThanOrEqual(1);
  });

  it("fails to unlock with the wrong password", async () => {
    const provisioned = await provisionAccountKeys("right", "user@example.com");
    await expect(
      unlockWithPassword("wrong", "user@example.com", provisioned.keyMaterial),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/account/tests.ts`
Expected: FAIL, `./index` does not export these.

- [ ] **Step 3: Implement**

Create `src/lib/account/index.ts`:
```typescript
import {
  deriveKeys,
  generateDek,
  generateRecoveryKey,
  deriveRecoveryKek,
  wrapKey,
  unwrapKey,
  KDF_VERSION,
} from "@/lib/crypto";
import type { SealedBox } from "@/lib/crypto";
import { toBase64, fromBase64 } from "@/utils/base64";
import type { KeyMaterial, ProvisionedKeys } from "./types";

export * from "./types";

const passwordBox = (material: KeyMaterial): SealedBox => ({
  nonce: fromBase64(material.wrapped_dek_nonce),
  ciphertext: fromBase64(material.wrapped_dek),
});

export const provisionAccountKeys = async (
  password: string,
  email: string,
): Promise<ProvisionedKeys> => {
  const { kek, authSecret } = await deriveKeys(password, email);
  const dek = await generateDek();
  const recoveryKey = await generateRecoveryKey();
  const recoveryKek = await deriveRecoveryKek(recoveryKey);
  const passwordWrap = await wrapKey(dek, kek);
  const recoveryWrap = await wrapKey(dek, recoveryKek);
  return {
    authSecret,
    dek,
    recoveryKey,
    keyMaterial: {
      wrapped_dek: toBase64(passwordWrap.ciphertext),
      wrapped_dek_nonce: toBase64(passwordWrap.nonce),
      recovery_wrapped_dek: toBase64(recoveryWrap.ciphertext),
      recovery_nonce: toBase64(recoveryWrap.nonce),
      kdf_version: KDF_VERSION,
    },
  };
};

export const unlockWithPassword = async (
  password: string,
  email: string,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  const { kek } = await deriveKeys(password, email);
  return unwrapKey(passwordBox(material), kek);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/account/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/account/index.ts src/lib/account/tests.ts
git commit -m "feat(account): provision keys and unlock with password"
```

---

## Task 4: Unlock with the recovery key

The forgotten-password path: unlock the same DEK from the one-time recovery key.

**Files:**
- Modify: `src/lib/account/index.ts`
- Test: `src/lib/account/tests.ts`

- [ ] **Step 1: Write the failing test**

Add `unlockWithRecoveryKey` to the existing `import { ... } from "./index"` line, then add this describe block to `src/lib/account/tests.ts`:
```typescript
describe("unlockWithRecoveryKey", () => {
  it("unlocks the same DEK from the recovery key", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    const dek = await unlockWithRecoveryKey(provisioned.recoveryKey, provisioned.keyMaterial);
    expect(dek).toEqual(provisioned.dek);
  });

  it("fails with the wrong recovery key", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    const other = await provisionAccountKeys("pw2", "user2@example.com");
    await expect(
      unlockWithRecoveryKey(other.recoveryKey, provisioned.keyMaterial),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/account/tests.ts`
Expected: FAIL, `unlockWithRecoveryKey` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/account/index.ts` a recovery box mapper and the function (no new imports needed; `deriveRecoveryKek`, `fromBase64`, `unwrapKey`, and the `KeyMaterial`/`SealedBox` types are already imported from Task 3):
```typescript
const recoveryBox = (material: KeyMaterial): SealedBox => ({
  nonce: fromBase64(material.recovery_nonce),
  ciphertext: fromBase64(material.recovery_wrapped_dek),
});

export const unlockWithRecoveryKey = async (
  recoveryKey: string,
  material: KeyMaterial,
): Promise<Uint8Array> => {
  const recoveryKek = await deriveRecoveryKek(recoveryKey);
  return unwrapKey(recoveryBox(material), recoveryKek);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/account/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/account/index.ts src/lib/account/tests.ts
git commit -m "feat(account): unlock the data key with the recovery key"
```

---

## Task 5: Re-wrap for a new password

The change-password path: re-wrap the existing DEK under a new password without re-encrypting any data.

**Files:**
- Modify: `src/lib/account/index.ts`
- Test: `src/lib/account/tests.ts`

- [ ] **Step 1: Write the failing test**

Add `rewrapForNewPassword` to the existing `import { ... } from "./index"` line, then add this describe block to `src/lib/account/tests.ts`:
```typescript
describe("rewrapForNewPassword", () => {
  it("lets the new password unlock the DEK and the old one stop working", async () => {
    const provisioned = await provisionAccountKeys("old pw", "user@example.com");
    const rewrapped = await rewrapForNewPassword("new pw", "user@example.com", provisioned.dek);

    // The material after a password change keeps the recovery columns, swaps the password columns.
    const updated = {
      ...provisioned.keyMaterial,
      wrapped_dek: rewrapped.wrapped_dek,
      wrapped_dek_nonce: rewrapped.wrapped_dek_nonce,
    };

    const dekNew = await unlockWithPassword("new pw", "user@example.com", updated);
    expect(dekNew).toEqual(provisioned.dek);
    await expect(
      unlockWithPassword("old pw", "user@example.com", updated),
    ).rejects.toThrow();
    expect(typeof rewrapped.authSecret).toBe("string");
    expect(rewrapped.authSecret).not.toBe(provisioned.authSecret);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/account/tests.ts`
Expected: FAIL, `rewrapForNewPassword` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/account/index.ts` (extend the `./types` import to include `RewrappedKeys`):
```typescript
export const rewrapForNewPassword = async (
  newPassword: string,
  email: string,
  dek: Uint8Array,
): Promise<RewrappedKeys> => {
  const { kek, authSecret } = await deriveKeys(newPassword, email);
  const wrap = await wrapKey(dek, kek);
  return {
    authSecret,
    wrapped_dek: toBase64(wrap.ciphertext),
    wrapped_dek_nonce: toBase64(wrap.nonce),
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/account/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: clean.
```bash
git add src/lib/account/index.ts src/lib/account/tests.ts
git commit -m "feat(account): re-wrap the data key for a new password"
```

---

## Task 6: Full verification

- [ ] **Step 1: Whole suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Final check**

Run: `pnpm check`
Expected: clean.

---

## Definition of done

- `src/utils/base64` holds the shared encode/decode helpers, used by both the Supabase module and the account module.
- `src/lib/account` exports `provisionAccountKeys`, `unlockWithPassword`, `unlockWithRecoveryKey`, `rewrapForNewPassword`, and the `KeyMaterial`/`ProvisionedKeys`/`RewrappedKeys` types plus `isKeyMaterial`.
- Tests prove: provision then unlock with password returns the same DEK; recovery key unlocks the same DEK; wrong password and wrong recovery key throw; after re-wrap the new password unlocks and the old password fails.
- Full suite and `pnpm check` are green.

## What this phase deliberately does not do

- No Supabase calls. Uploading `key_material`, signing up/in, MFA enrollment, and recovery against the live backend are 5b.
- No password-strength enforcement (that is a UI concern in 5c).
- The DEK is returned to the caller in memory; how it is held and cleared is the context's job (5b).
