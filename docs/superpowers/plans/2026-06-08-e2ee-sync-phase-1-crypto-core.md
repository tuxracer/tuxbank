# E2EE Sync Phase 1: Crypto Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/crypto`, a pure, fully unit-tested module that does all client-side cryptography for end-to-end encrypted sync: key derivation from a password, data-key generation and wrapping, payload encryption, and recovery-key handling.

**Architecture:** A React-free domain module in `src/lib/crypto` wrapping `libsodium-wrappers`. It exposes a small set of async functions. All cryptographic primitives come from libsodium (Argon2id for password hashing, XChaCha20-Poly1305 AEAD for encryption, BLAKE2b for salt and recovery-key derivation, and libsodium's CSPRNG). No protocol is invented; the module only composes standard primitives. This phase has no dependency on Supabase, IndexedDB, React, or any other phase.

**Tech Stack:** TypeScript (ESM), `libsodium-wrappers`, vitest.

This plan implements the "Encryption and key management" section of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`.

---

## Background for the implementer

You do not need prior crypto knowledge. The design is fixed; your job is to implement these functions exactly.

Key concepts used here:

- **KEK (key-encryption-key):** a 32-byte key derived from the user's password with Argon2id. Slow on purpose, to resist brute force. Never leaves the device.
- **DEK (data-encryption-key):** a random 32-byte key that actually encrypts the user's events. Generated once per account.
- **Wrapping:** encrypting one key with another. We wrap the DEK with the KEK so the server can store the wrapped (encrypted) DEK without ever seeing the real DEK.
- **authSecret:** a separate value derived from the password, used as the password we hand to Supabase. The real password is never sent to the server, so the server can never derive the KEK.
- **Recovery key:** a random high-entropy string shown once at signup. It independently wraps the DEK, so a user who forgets their password but kept the recovery key can still decrypt.
- **AEAD (XChaCha20-Poly1305):** authenticated encryption. Decryption with the wrong key does not return garbage; it throws, because the authentication tag fails. We rely on this to detect a wrong password.

Salts and domain separation:

- libsodium's Argon2id needs a 16-byte salt. We derive it deterministically from the email so any device can recompute the same keys from email plus password, with no pre-login server call.
- The KEK and the authSecret are both derived from the same password. To keep them independent, each uses a salt derived from a different context string. Knowing one does not reveal the other.

Module conventions in this repo (follow them):

- A module is a directory named after its concept, containing `index.ts`, and where useful `consts.ts`, `types.ts`, and `tests.ts`.
- `index.ts` re-exports everything from `consts.ts` and `types.ts` with `export * from "./consts"` and `export * from "./types"`.
- Inside the module, tests import from `./index`. External code imports from `@/lib/crypto`.
- Use arrow functions. Use named constants, never magic numbers. No `as` type assertions on unknown runtime values.
- Run `pnpm check` (prettier check, eslint, tsc) before every commit. If it reports formatting problems, run `pnpm format`.

---

## Task 1: Add the libsodium dependency

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install libsodium-wrappers and its types**

Run:
```bash
pnpm add libsodium-wrappers && pnpm add -D @types/libsodium-wrappers
```
Expected: both packages install, `package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Verify the import resolves and the runtime is reachable**

Run:
```bash
pnpm exec tsx -e "import s from 'libsodium-wrappers'; await s.ready; console.log('ok', typeof s.crypto_pwhash)" 2>/dev/null || node --input-type=module -e "import s from 'libsodium-wrappers'; await s.ready; console.log('ok', typeof s.crypto_pwhash)"
```
Expected: prints `ok function`. If `tsx` is unavailable the node fallback runs. If neither runs, skip this check; Task 2's test exercises the same path.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add libsodium-wrappers for client-side crypto"
```

---

## Task 2: Key derivation (deriveKeys)

Derive the KEK and the authSecret from a password and email. This task also creates the module's `consts.ts`, `types.ts`, and the shared `getSodium` helper, because the first behavior needs them.

**Files:**
- Create: `src/lib/crypto/consts.ts`
- Create: `src/lib/crypto/types.ts`
- Create: `src/lib/crypto/index.ts`
- Test: `src/lib/crypto/tests.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/crypto/tests.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { deriveKeys } from "./index";

describe("deriveKeys", () => {
  it("is deterministic for the same password and email", async () => {
    const a = await deriveKeys("correct horse battery staple", "user@example.com");
    const b = await deriveKeys("correct horse battery staple", "user@example.com");
    expect(a.kek).toEqual(b.kek);
    expect(a.authSecret).toEqual(b.authSecret);
  });

  it("normalizes the email so case and surrounding spaces do not matter", async () => {
    const a = await deriveKeys("pw", "User@Example.com");
    const b = await deriveKeys("pw", "  user@example.com  ");
    expect(a.kek).toEqual(b.kek);
    expect(a.authSecret).toEqual(b.authSecret);
  });

  it("produces a 32-byte KEK and a non-empty authSecret string", async () => {
    const { kek, authSecret } = await deriveKeys("pw", "user@example.com");
    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
    expect(typeof authSecret).toBe("string");
    expect(authSecret.length).toBeGreaterThan(0);
  });

  it("changes when the password changes", async () => {
    const a = await deriveKeys("password-one", "user@example.com");
    const b = await deriveKeys("password-two", "user@example.com");
    expect(a.kek).not.toEqual(b.kek);
    expect(a.authSecret).not.toEqual(b.authSecret);
  });

  it("changes when the email changes", async () => {
    const a = await deriveKeys("pw", "one@example.com");
    const b = await deriveKeys("pw", "two@example.com");
    expect(a.kek).not.toEqual(b.kek);
    expect(a.authSecret).not.toEqual(b.authSecret);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: FAIL, cannot resolve `./index` (module does not exist yet).

- [ ] **Step 3: Write the constants**

Create `src/lib/crypto/consts.ts`:
```typescript
/**
 * KDF parameters. Bump KDF_VERSION whenever ops/mem limits change so stored
 * key material can record which parameters produced it. These are tuned to be
 * expensive for an attacker but still acceptable on a phone browser.
 */
export const KDF_VERSION = 1;
export const KDF_OPSLIMIT = 3;
export const KDF_MEMLIMIT = 64 * 1_024 * 1_024; // 64 MiB

/** Domain-separation contexts so the KEK and the auth secret stay independent. */
export const KEK_CONTEXT = "tuxbank:kek:";
export const AUTH_CONTEXT = "tuxbank:auth:";

/** Byte lengths. */
export const KEY_BYTES = 32; // 256-bit symmetric keys (KEK, DEK)
export const RECOVERY_KEY_BYTES = 32; // 256-bit recovery key
```

- [ ] **Step 4: Write the types**

Create `src/lib/crypto/types.ts`:
```typescript
/** The two values derived from a user's password on the client. */
export interface DerivedKeys {
  /** Key-encryption-key. Wraps the DEK. Never leaves the device. */
  kek: Uint8Array;
  /** The password value handed to Supabase auth. The real password is not. */
  authSecret: string;
}

/** A nonce plus ciphertext produced by AEAD. Both are safe to store in plaintext. */
export interface SealedBox {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}
```

- [ ] **Step 5: Write the implementation**

Create `src/lib/crypto/index.ts`:
```typescript
import sodium from "libsodium-wrappers";
import {
  AUTH_CONTEXT,
  KDF_MEMLIMIT,
  KDF_OPSLIMIT,
  KEK_CONTEXT,
  KEY_BYTES,
} from "./consts";
import type { DerivedKeys } from "./types";

export * from "./consts";
export * from "./types";

/** Resolve once `libsodium` has finished initializing, then reuse the instance. */
let sodiumPromise: Promise<typeof sodium> | null = null;
const getSodium = async (): Promise<typeof sodium> => {
  if (!sodiumPromise) {
    sodiumPromise = sodium.ready.then(() => sodium);
  }
  return sodiumPromise;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** A deterministic 16-byte Argon2id salt from a context label plus the email. */
const saltFor = (
  s: typeof sodium,
  context: string,
  email: string,
): Uint8Array =>
  s.crypto_generichash(s.crypto_pwhash_SALTBYTES, context + normalizeEmail(email));

const argon2id = (
  s: typeof sodium,
  password: string,
  salt: Uint8Array,
): Uint8Array =>
  s.crypto_pwhash(
    KEY_BYTES,
    password,
    salt,
    KDF_OPSLIMIT,
    KDF_MEMLIMIT,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );

export const deriveKeys = async (
  password: string,
  email: string,
): Promise<DerivedKeys> => {
  const s = await getSodium();
  const kek = argon2id(s, password, saltFor(s, KEK_CONTEXT, email));
  const authMaterial = argon2id(s, password, saltFor(s, AUTH_CONTEXT, email));
  return { kek, authSecret: s.to_base64(authMaterial) };
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: PASS, all six `deriveKeys` cases green.

- [ ] **Step 7: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: passes. If prettier complains, run `pnpm format` and re-run `pnpm check`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/crypto
git commit -m "feat(crypto): derive KEK and auth secret from password"
```

---

## Task 3: Payload encryption (encryptPayload / decryptPayload)

Encrypt an arbitrary JSON-serializable value with the DEK, and decrypt it back. A wrong key must throw.

**Files:**
- Modify: `src/lib/crypto/index.ts`
- Test: `src/lib/crypto/tests.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/crypto/tests.ts`:
```typescript
import { encryptPayload, decryptPayload } from "./index";

describe("encryptPayload / decryptPayload", () => {
  const dek = () => crypto.getRandomValues(new Uint8Array(32));

  it("round-trips a JSON-serializable object", async () => {
    const key = dek();
    const value = { amount: 1_500, direction: "withdrawal", date: "2026-06-08" };
    const box = await encryptPayload(value, key);
    expect(await decryptPayload(box, key)).toEqual(value);
  });

  it("produces a different nonce and ciphertext each time", async () => {
    const key = dek();
    const a = await encryptPayload({ x: 1 }, key);
    const b = await encryptPayload({ x: 1 }, key);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("throws when decrypting with the wrong key", async () => {
    const box = await encryptPayload({ secret: true }, dek());
    await expect(decryptPayload(box, dek())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: FAIL, `encryptPayload` / `decryptPayload` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/crypto/index.ts` (after `deriveKeys`, keeping the `import type` line updated to also import `SealedBox`):
```typescript
const seal = (
  s: typeof sodium,
  message: Uint8Array,
  key: Uint8Array,
): SealedBox => {
  const nonce = s.randombytes_buf(
    s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    null,
    null,
    nonce,
    key,
  );
  return { nonce, ciphertext };
};

const open = (s: typeof sodium, box: SealedBox, key: Uint8Array): Uint8Array =>
  s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    box.ciphertext,
    null,
    box.nonce,
    key,
  );

export const encryptPayload = async (
  value: unknown,
  dek: Uint8Array,
): Promise<SealedBox> => {
  const s = await getSodium();
  return seal(s, s.from_string(JSON.stringify(value)), dek);
};

export const decryptPayload = async (
  box: SealedBox,
  dek: Uint8Array,
): Promise<unknown> => {
  const s = await getSodium();
  return JSON.parse(s.to_string(open(s, box, dek)));
};
```

Update the type import at the top of the file to:
```typescript
import type { DerivedKeys, SealedBox } from "./types";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: PASS, all encrypt/decrypt cases green.

- [ ] **Step 5: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: passes (run `pnpm format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto
git commit -m "feat(crypto): AEAD payload encrypt and decrypt"
```

---

## Task 4: Key wrapping (generateDek / wrapKey / unwrapKey)

Generate a random DEK, wrap a key under another key, and unwrap it. A wrong wrapping key must throw.

**Files:**
- Modify: `src/lib/crypto/index.ts`
- Test: `src/lib/crypto/tests.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/crypto/tests.ts`:
```typescript
import { generateDek, wrapKey, unwrapKey } from "./index";

describe("generateDek / wrapKey / unwrapKey", () => {
  it("generates a 32-byte key", async () => {
    const dek = await generateDek();
    expect(dek).toBeInstanceOf(Uint8Array);
    expect(dek.length).toBe(32);
  });

  it("generates a different key each call", async () => {
    expect(await generateDek()).not.toEqual(await generateDek());
  });

  it("wraps and unwraps a DEK under a KEK", async () => {
    const dek = await generateDek();
    const kek = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapKey(dek, kek);
    expect(await unwrapKey(wrapped, kek)).toEqual(dek);
  });

  it("throws when unwrapping with the wrong KEK", async () => {
    const wrapped = await wrapKey(await generateDek(), crypto.getRandomValues(new Uint8Array(32)));
    const wrongKek = crypto.getRandomValues(new Uint8Array(32));
    await expect(unwrapKey(wrapped, wrongKek)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: FAIL, `generateDek` / `wrapKey` / `unwrapKey` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/crypto/index.ts`:
```typescript
export const generateDek = async (): Promise<Uint8Array> => {
  const s = await getSodium();
  return s.randombytes_buf(KEY_BYTES);
};

export const wrapKey = async (
  key: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<SealedBox> => {
  const s = await getSodium();
  return seal(s, key, wrappingKey);
};

export const unwrapKey = async (
  box: SealedBox,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> => {
  const s = await getSodium();
  return open(s, box, wrappingKey);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: PASS.

- [ ] **Step 5: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: passes (run `pnpm format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto
git commit -m "feat(crypto): generate and wrap data-encryption keys"
```

---

## Task 5: Recovery key (generateRecoveryKey / deriveRecoveryKek)

Generate a one-time recovery key string and derive a 32-byte wrapping key from it. Then prove the full recovery round-trip: a DEK wrapped under the recovery key can be unwrapped with only the recovery key.

**Files:**
- Modify: `src/lib/crypto/index.ts`
- Test: `src/lib/crypto/tests.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/crypto/tests.ts`:
```typescript
import { generateRecoveryKey, deriveRecoveryKek } from "./index";

describe("recovery key", () => {
  it("generates a non-empty unique string each call", async () => {
    const a = await generateRecoveryKey();
    const b = await generateRecoveryKey();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toEqual(b);
  });

  it("derives a deterministic 32-byte key from a recovery key", async () => {
    const recoveryKey = await generateRecoveryKey();
    const a = await deriveRecoveryKek(recoveryKey);
    const b = await deriveRecoveryKek(recoveryKey);
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(a).toEqual(b);
  });

  it("recovers a DEK wrapped under the recovery key", async () => {
    const dek = await generateDek();
    const recoveryKey = await generateRecoveryKey();
    const recoveryKek = await deriveRecoveryKek(recoveryKey);
    const wrapped = await wrapKey(dek, recoveryKek);
    // Later, with only the recovery key, re-derive and unwrap.
    const unwrapped = await unwrapKey(wrapped, await deriveRecoveryKek(recoveryKey));
    expect(unwrapped).toEqual(dek);
  });

  it("fails to recover with the wrong recovery key", async () => {
    const wrapped = await wrapKey(await generateDek(), await deriveRecoveryKek(await generateRecoveryKey()));
    const wrongKek = await deriveRecoveryKek(await generateRecoveryKey());
    await expect(unwrapKey(wrapped, wrongKek)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: FAIL, `generateRecoveryKey` / `deriveRecoveryKek` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/crypto/index.ts`, importing `RECOVERY_KEY_BYTES` from consts at the top:
```typescript
export const generateRecoveryKey = async (): Promise<string> => {
  const s = await getSodium();
  const bytes = s.randombytes_buf(RECOVERY_KEY_BYTES);
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
};

export const deriveRecoveryKek = async (
  recoveryKey: string,
): Promise<Uint8Array> => {
  const s = await getSodium();
  // The recovery key is already high-entropy, so a fast hash (not Argon2id) is
  // sufficient to stretch it to a 32-byte wrapping key.
  return s.crypto_generichash(KEY_BYTES, recoveryKey);
};
```

Update the consts import at the top of the file to include `RECOVERY_KEY_BYTES`:
```typescript
import {
  AUTH_CONTEXT,
  KDF_MEMLIMIT,
  KDF_OPSLIMIT,
  KEK_CONTEXT,
  KEY_BYTES,
  RECOVERY_KEY_BYTES,
} from "./consts";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: PASS, all recovery cases green.

- [ ] **Step 5: Verify formatting, lint, and types**

Run: `pnpm check`
Expected: passes (run `pnpm format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto
git commit -m "feat(crypto): recovery key generation and derivation"
```

---

## Task 6: Full module verification

Confirm the whole module passes together and exposes a coherent public surface.

**Files:**
- Read only: `src/lib/crypto/index.ts`, `src/lib/crypto/tests.ts`

- [ ] **Step 1: Run the full crypto test file**

Run: `pnpm test src/lib/crypto/tests.ts`
Expected: PASS, every describe block green (deriveKeys, encrypt/decrypt, wrap/unwrap, recovery).

- [ ] **Step 2: Run the entire test suite to confirm nothing else broke**

Run: `pnpm test`
Expected: PASS. The crypto module is additive, so all existing tests stay green.

- [ ] **Step 3: Final check**

Run: `pnpm check`
Expected: passes clean.

- [ ] **Step 4: Confirm the public API**

Verify `src/lib/crypto/index.ts` exports exactly these functions, all async: `deriveKeys`, `encryptPayload`, `decryptPayload`, `generateDek`, `wrapKey`, `unwrapKey`, `generateRecoveryKey`, `deriveRecoveryKek`, plus the re-exported `DerivedKeys` and `SealedBox` types and the consts. No commit needed if there are no changes; if you adjusted anything, commit with `git commit -am "refactor(crypto): finalize public surface"`.

---

## Definition of done

- `src/lib/crypto` exists with `index.ts`, `consts.ts`, `types.ts`, and `tests.ts`.
- All crypto tests pass and the full suite is green.
- `pnpm check` passes.
- The module has no imports from React, Supabase, IndexedDB, or any other phase.

## What this phase deliberately does not do

- No Supabase calls, no network, no IndexedDB. Those arrive in later phases.
- No password-strength enforcement. That lives in the onboarding UI phase.
- Argon2id parameters are fixed at `KDF_VERSION = 1`. Tuning them for a real device target is tracked separately; the version field exists so a future change is migratable.
