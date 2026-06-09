# E2EE Sync Phase 5c: Sync provider and dialog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make optional account sync usable from the UI: a `SyncProvider`/`useSync` context that sequences the Phase 5a/5b building blocks into the create-account, sign-in, unlock, sign-out, and sync flows, plus a `SyncDialog` opened from a new toolbar `SYNC` button. After this, the feature is testable end to end in a real browser.

**Architecture:** `SyncProvider` mounts inside `CalendarProvider` (so it can read events/categories for change-triggered sync and refresh the calendar after a pull). It holds the in-memory data key in a ref (never React state), drives a small status machine, and runs `runSync` on triggers (initial, window focus, debounced after edits, and a manual button). `SyncDialog` renders different sections based on the context's `status`/`step`, following the existing `DataDialog` cyberpunk pattern. The pure logic is already built and tested; this phase is integration glue, verified by `pnpm check`, `pnpm build`, and manual browser testing (jsdom cannot verify dialog layout).

**Tech Stack:** React 19, TypeScript, shadcn/ui (Dialog/Button/Input/Label), the app's `.cy-*` cyberpunk classes, `sonner` toasts.

This plan implements the UI half of the "Authentication, TOTP, and recovery flows" and the "Local-first integration" sections of `docs/superpowers/specs/2026-06-08-optional-supabase-e2ee-sync-design.md`. Change-password and forgot-password recovery are deferred to 5d.

---

## Background and key decisions

- **Local-first is untouched.** Logged-out users never see a password prompt; the app works exactly as before. Sync is purely additive.
- **The DEK lives only in a ref**, never React state or storage. It is set on unlock/sign-in/create and cleared on sign-out. On reload the session may persist (status `locked`) but the DEK is gone until the user unlocks with their password.
- **aal2 ordering:** create-account enrolls and verifies TOTP (reaching `aal2`) BEFORE uploading `key_material` or syncing, because the Phase 2 RLS requires `aal2` for those writes. The provider enforces this ordering.
- **Sign-in re-derives keys** (one extra Argon2id) rather than threading the KEK through the MFA step; logins are infrequent so the cost is acceptable, and it keeps the flow using the public 5a API (`unlockWithPassword`).
- **Triggers:** initial sync on unlock/sign-in/create, on `window` focus, and debounced (~2s) after `events`/`categories` change. A manual "Sync now" button is always available (useful for testing). A `syncingRef` guard prevents overlapping runs; the cursor makes a redundant run a cheap no-op.
- **No unit tests for the glue.** The context wires already-tested modules and the dialog is layout that jsdom cannot verify. Correctness is confirmed by `pnpm check` (types/lint), `pnpm build`, and the user clicking through in a browser. Do NOT add brittle mocked React tests.
- **Deferred (5d):** change password, forgot-password recovery screen, a password-strength meter, and lazy-loading libsodium. A minimum password length is enforced here.

## Conventions (from the repo and the explored UI map)

- Dialogs: `<Dialog><DialogContent className="cy-dialog border-0 sm:max-w-md"><CyberFrame /><DialogHeader><DialogTitle className="cy-display uppercase tracking-wide">...` Multi-step content is conditional sections inside one `DialogContent` (see `src/components/DataDialog/index.tsx`).
- Buttons: `<Button className="cy-btn justify-start">` for primary, `<Button variant="ghost">` for secondary; error text `className="cy-mono text-xs text-[color:var(--cy-magenta)]"`.
- Toolbar buttons: `<CyControlFrame><button className="cy-btn px-3 py-1.5 text-xs">◢ LABEL</button></CyControlFrame>`.
- Modules/components are directories with `index.tsx`/`index.ts` (+ `types.ts`, `consts.ts`). Arrow functions, named constants, `@/` alias, no `as` casts on unknown values.
- Run `pnpm check` before each commit.

---

## Task 1: Expose a storage refresh from the calendar context

The sync provider needs to refresh the calendar's in-memory events/categories after applying pulled changes (same-tab writes do not echo back through `BroadcastChannel`).

**Files:**
- Modify: `src/context/CalendarContext/types.ts`
- Modify: `src/context/CalendarContext/index.tsx`

- [ ] **Step 1: Add to the context type**

In `src/context/CalendarContext/types.ts`, add to `CalendarContextValue` (after `importData`):
```typescript
  /** Re-read events + categories from storage (used after a sync pulls). */
  refreshFromStorage: () => Promise<void>;
```

- [ ] **Step 2: Expose the existing function**

In `src/context/CalendarContext/index.tsx`, the `refreshFromStorage` callback already exists. Add it to the `value` object (next to `importData`):
```typescript
    refreshFromStorage,
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: passes.
```bash
git add src/context/CalendarContext/types.ts src/context/CalendarContext/index.tsx
git commit -m "feat(calendar): expose refreshFromStorage for sync"
```

---

## Task 2: The SyncProvider and useSync hook

**Files:**
- Create: `src/context/SyncContext/types.ts`
- Create: `src/context/SyncContext/index.tsx`

- [ ] **Step 1: Write the types**

Create `src/context/SyncContext/types.ts`:
```typescript
export type SyncStatus = "off" | "locked" | "syncing" | "synced" | "error";

/** Which onboarding step the dialog should show, if any. */
export type OnboardStep =
  | "idle"
  | "create-totp"
  | "create-recovery"
  | "signin-totp";

export interface SyncContextValue {
  status: SyncStatus;
  step: OnboardStep;
  email: string | null;
  enrollment: { qrCode: string; secret: string } | null;
  recoveryKey: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  /** False when Supabase env is absent (sync cannot be used). */
  configured: boolean;
  createAccount: (email: string, password: string) => Promise<void>;
  confirmCreateTotp: (code: string) => Promise<void>;
  finishCreate: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  confirmSignInTotp: (code: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}
```

- [ ] **Step 2: Write the provider**

Create `src/context/SyncContext/index.tsx`:
```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCalendar } from "@/context/CalendarContext";
import { deriveKeys } from "@/lib/crypto";
import {
  enrollTotp,
  fetchKeyMaterial,
  getActiveSession,
  getTotpFactorId,
  isAccountError,
  provisionAccountKeys,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp,
  unlockWithPassword,
  uploadKeyMaterial,
  verifyTotp,
  type ProvisionedKeys,
} from "@/lib/account";
import { createSupabaseRemote, runSync } from "@/lib/sync";
import type { OnboardStep, SyncContextValue, SyncStatus } from "./types";

export * from "./types";

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNC_DEBOUNCE_MS = 2_000;

const describeError = (error: unknown): string =>
  isAccountError(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : "Unknown error";

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  // Destructure the stable callback + the changing values so effects do not
  // thrash on the calendar context value object (which is new every render).
  const { events, categories, refreshFromStorage } = useCalendar();
  const remote = useMemo(() => createSupabaseRemote(), []);

  const [status, setStatus] = useState<SyncStatus>("off");
  const [step, setStep] = useState<OnboardStep>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{
    qrCode: string;
    secret: string;
  } | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dekRef = useRef<Uint8Array | null>(null);
  const provisionRef = useRef<ProvisionedKeys | null>(null);
  const pendingRef = useRef<{
    email: string;
    password: string;
    factorId: string;
  } | null>(null);
  const syncingRef = useRef(false);

  const doSync = useCallback(async () => {
    if (!remote || !dekRef.current || syncingRef.current) return;
    syncingRef.current = true;
    setStatus("syncing");
    try {
      const result = await runSync(dekRef.current, remote);
      if (result.pulled > 0) await refreshFromStorage();
      setLastSyncedAt(result.cursor);
      setStatus("synced");
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
      setStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [remote, refreshFromStorage]);

  const syncNow = useCallback(async () => {
    await doSync();
  }, [doSync]);

  // Detect an existing session on mount: the DEK is gone, so we are "locked".
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void getActiveSession()
      .then((session) => {
        if (!active || !session) return;
        setEmail(session.email);
        setStatus("locked");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [remote]);

  // Sync when the window regains focus. doSync no-ops if the vault is locked,
  // so we always listen and let it self-gate (no dependency on status).
  useEffect(() => {
    const onFocus = () => void doSync();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [doSync]);

  // Debounced sync after a local edit. Gated on an unlocked DEK (a ref), so it
  // fires on events/categories changes, never on a status flip (which would
  // otherwise create a perpetual self-triggering sync loop).
  useEffect(() => {
    if (!dekRef.current) return;
    const id = setTimeout(() => void doSync(), SYNC_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [events, categories, doSync]);

  const createAccount = useCallback(
    async (emailInput: string, password: string) => {
      if (!remote) {
        setError("Sync is not configured");
        return;
      }
      try {
        const provisioned = await provisionAccountKeys(password, emailInput);
        provisionRef.current = provisioned;
        await signUp(emailInput, provisioned.authSecret);
        const enrolled = await enrollTotp();
        pendingRef.current = {
          email: emailInput,
          password,
          factorId: enrolled.factorId,
        };
        setEmail(emailInput);
        setEnrollment({ qrCode: enrolled.qrCode, secret: enrolled.secret });
        setStep("create-totp");
        setError(null);
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote],
  );

  const confirmCreateTotp = useCallback(
    async (code: string) => {
      const pending = pendingRef.current;
      const provisioned = provisionRef.current;
      if (!pending || !provisioned) return;
      try {
        await verifyTotp(pending.factorId, code); // reaches aal2
        await uploadKeyMaterial(provisioned.keyMaterial);
        dekRef.current = provisioned.dek;
        setRecoveryKey(provisioned.recoveryKey);
        setStep("create-recovery");
        setError(null);
        void doSync(); // initial push
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [doSync],
  );

  const finishCreate = useCallback(() => {
    provisionRef.current = null;
    pendingRef.current = null;
    setEnrollment(null);
    setRecoveryKey(null);
    setStep("idle");
    setStatus("synced");
  }, []);

  const signIn = useCallback(
    async (emailInput: string, password: string) => {
      if (!remote) {
        setError("Sync is not configured");
        return;
      }
      try {
        const { authSecret } = await deriveKeys(password, emailInput);
        await authSignIn(emailInput, authSecret);
        const factorId = await getTotpFactorId();
        if (!factorId) {
          setError("This account has no 2FA factor enrolled");
          return;
        }
        pendingRef.current = { email: emailInput, password, factorId };
        setEmail(emailInput);
        setStep("signin-totp");
        setError(null);
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote],
  );

  const confirmSignInTotp = useCallback(
    async (code: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      try {
        await verifyTotp(pending.factorId, code); // reaches aal2
        const material = await fetchKeyMaterial();
        dekRef.current = await unlockWithPassword(
          pending.password,
          pending.email,
          material,
        );
        pendingRef.current = null;
        setStep("idle");
        setStatus("synced");
        setError(null);
        void doSync(); // initial pull
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [doSync],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!remote || !email) {
        setError("Sync is not configured");
        return;
      }
      try {
        const material = await fetchKeyMaterial();
        dekRef.current = await unlockWithPassword(password, email, material);
        setStatus("synced");
        setError(null);
        void doSync();
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote, email, doSync],
  );

  const signOut = useCallback(async () => {
    try {
      await authSignOut();
    } catch {
      // Local session is cleared regardless; ignore a failed server revoke.
    }
    dekRef.current = null;
    provisionRef.current = null;
    pendingRef.current = null;
    setEmail(null);
    setEnrollment(null);
    setRecoveryKey(null);
    setStep("idle");
    setStatus("off");
    setLastSyncedAt(null);
    setError(null);
  }, []);

  const value: SyncContextValue = {
    status,
    step,
    email,
    enrollment,
    recoveryKey,
    lastSyncedAt,
    error,
    configured: remote !== null,
    createAccount,
    confirmCreateTotp,
    finishCreate,
    signIn,
    confirmSignInTotp,
    unlock,
    signOut,
    syncNow,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = (): SyncContextValue => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
};
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: passes. (`createSupabaseRemote` returns `null` under the test/build env without Supabase config, so `configured` is false and nothing runs.)
```bash
git add src/context/SyncContext
git commit -m "feat(sync): add SyncProvider and useSync context"
```

---

## Task 3: The SyncDialog

**Files:**
- Create: `src/components/SyncDialog/consts.ts`
- Create: `src/components/SyncDialog/index.tsx`

- [ ] **Step 1: Write the consts**

Create `src/components/SyncDialog/consts.ts`:
```typescript
export const MIN_PASSWORD_LENGTH = 10;
```

- [ ] **Step 2: Write the dialog**

Create `src/components/SyncDialog/index.tsx`:
```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CyberFrame } from "@/components/CyberFrame";
import { useSync } from "@/context/SyncContext";
import { MIN_PASSWORD_LENGTH } from "./consts";

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "choose" | "create" | "signin";

const ERROR_TEXT: Record<string, string> = {
  SIGNUP_FAILED: "Could not create the account (is the email already used?).",
  SIGNIN_FAILED: "Wrong email or password.",
  MFA_VERIFY_FAILED: "That code did not match. Try again.",
  MFA_ENROLL_FAILED: "Could not start 2FA enrollment.",
  NO_KEY_MATERIAL: "No encrypted data found for this account.",
  KEY_MATERIAL_FAILED: "Could not reach the encrypted store.",
  NOT_CONFIGURED: "Sync is not configured.",
};

const errorText = (code: string): string => ERROR_TEXT[code] ?? code;

export const SyncDialog = ({ open, onOpenChange }: SyncDialogProps) => {
  const sync = useSync();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode("choose");
    setEmail("");
    setPassword("");
    setCode("");
    setBusy(false);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const passwordTooShort = password.length < MIN_PASSWORD_LENGTH;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <CyberFrame />
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            ◢ Cloud Sync
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!sync.configured && (
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Sync is not configured in this build.
            </p>
          )}

          {sync.error && (
            <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
              {errorText(sync.error)}
            </p>
          )}

          {/* SYNCED / SYNCING */}
          {(sync.status === "synced" || sync.status === "syncing") &&
            sync.step === "idle" && (
              <section className="flex flex-col gap-3">
                <p className="cy-mono text-xs">
                  Signed in as <span className="cy-hud on">{sync.email}</span>
                </p>
                <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
                  {sync.status === "syncing"
                    ? "Syncing…"
                    : sync.lastSyncedAt
                      ? `Last sync ${new Date(sync.lastSyncedAt).toLocaleString()}`
                      : "Synced"}
                </p>
                <Button
                  className="cy-btn justify-start"
                  disabled={sync.status === "syncing"}
                  onClick={() => void sync.syncNow()}
                >
                  Sync now
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void sync.signOut()}
                >
                  Sign out
                </Button>
              </section>
            )}

          {/* LOCKED: session exists, need password to unlock the key */}
          {sync.status === "locked" && (
            <section className="flex flex-col gap-3">
              <p className="cy-mono text-xs">
                Unlock <span className="cy-hud on">{sync.email}</span> to resume
                sync.
              </p>
              <Label htmlFor="unlock-pw">Password</Label>
              <Input
                id="unlock-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                className="cy-btn justify-start"
                disabled={busy || !password}
                onClick={() => void run(() => sync.unlock(password))}
              >
                Unlock
              </Button>
              <Button variant="ghost" onClick={() => void sync.signOut()}>
                Sign out
              </Button>
            </section>
          )}

          {/* CREATE: TOTP enrollment */}
          {sync.step === "create-totp" && sync.enrollment && (
            <section className="flex flex-col gap-3">
              <p className="cy-mono text-xs">
                Scan this with an authenticator app, then enter the 6-digit code.
              </p>
              <img
                src={sync.enrollment.qrCode}
                alt="TOTP QR code"
                className="mx-auto h-44 w-44 bg-white p-2"
              />
              <p className="cy-mono text-[10px] break-all text-[color:var(--cy-muted)]">
                {sync.enrollment.secret}
              </p>
              <Input
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                className="cy-btn justify-start"
                disabled={busy || code.length < 6}
                onClick={() => void run(() => sync.confirmCreateTotp(code))}
              >
                Verify and continue
              </Button>
            </section>
          )}

          {/* CREATE: recovery key */}
          {sync.step === "create-recovery" && sync.recoveryKey && (
            <section className="flex flex-col gap-3">
              <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
                Save this recovery key. It is the ONLY way to recover your data
                if you forget your password. It is shown once.
              </p>
              <code className="cy-mono block break-all border border-[color:var(--cy-line)] p-3 text-xs">
                {sync.recoveryKey}
              </code>
              <Button
                className="cy-btn justify-start"
                onClick={() => {
                  void navigator.clipboard?.writeText(sync.recoveryKey ?? "");
                }}
              >
                Copy
              </Button>
              <Button
                className="cy-cta justify-center"
                onClick={() => {
                  sync.finishCreate();
                  reset();
                }}
              >
                I have saved it
              </Button>
            </section>
          )}

          {/* SIGN IN: TOTP challenge */}
          {sync.step === "signin-totp" && (
            <section className="flex flex-col gap-3">
              <p className="cy-mono text-xs">
                Enter the 6-digit code from your authenticator app.
              </p>
              <Input
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                className="cy-btn justify-start"
                disabled={busy || code.length < 6}
                onClick={() => void run(() => sync.confirmSignInTotp(code))}
              >
                Verify
              </Button>
            </section>
          )}

          {/* OFF: choose, then a form */}
          {sync.status === "off" && sync.step === "idle" && (
            <section className="flex flex-col gap-3">
              {mode === "choose" && (
                <>
                  <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
                    Optionally sync your encrypted data across devices. Your
                    data is end-to-end encrypted; we cannot read it.
                  </p>
                  <Button
                    className="cy-btn justify-start"
                    disabled={!sync.configured}
                    onClick={() => setMode("create")}
                  >
                    Create account
                  </Button>
                  <Button
                    className="cy-btn justify-start"
                    disabled={!sync.configured}
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </Button>
                </>
              )}

              {(mode === "create" || mode === "signin") && (
                <>
                  <Label htmlFor="sync-email">Email</Label>
                  <Input
                    id="sync-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Label htmlFor="sync-pw">Password</Label>
                  <Input
                    id="sync-pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "create" && passwordTooShort && (
                    <p className="cy-mono text-[10px] text-[color:var(--cy-muted)]">
                      At least {MIN_PASSWORD_LENGTH} characters. This password
                      protects your encryption key; choose a strong one.
                    </p>
                  )}
                  <Button
                    className="cy-btn justify-start"
                    disabled={
                      busy ||
                      !email ||
                      !password ||
                      (mode === "create" && passwordTooShort)
                    }
                    onClick={() =>
                      void run(() =>
                        mode === "create"
                          ? sync.createAccount(email, password)
                          : sync.signIn(email, password),
                      )
                    }
                  >
                    {busy
                      ? "Working…"
                      : mode === "create"
                        ? "Create account"
                        : "Sign in"}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode("choose")}>
                    Back
                  </Button>
                </>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: passes.
```bash
git add src/components/SyncDialog
git commit -m "feat(sync): add the SyncDialog UI"
```

---

## Task 4: Toolbar SYNC button

**Files:**
- Modify: `src/components/CalendarToolbar/types.ts`
- Modify: `src/components/CalendarToolbar/index.tsx`

- [ ] **Step 1: Add the prop**

In `src/components/CalendarToolbar/types.ts`, add `onSync?: () => void;` to `CalendarToolbarProps` (near `onManageData`). It is optional so the toolbar still compiles before App wires it in Task 5.

- [ ] **Step 2: Render the button**

In `src/components/CalendarToolbar/index.tsx`, add `onSync` to the destructured props. Then, immediately before the `◢ DATA` button's `<CyControlFrame>` block, add a matching SYNC button:
```tsx
          <CyControlFrame>
            <button
              type="button"
              className="cy-btn px-3 py-1.5 text-xs"
              onClick={onSync}
            >
              ◢ SYNC
            </button>
          </CyControlFrame>
```
(Match the exact wrapping/styling of the existing `◢ DATA` button next to it.)

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: passes (`onSync` is optional, so `App.tsx` still compiles without it for now).
```bash
git add src/components/CalendarToolbar
git commit -m "feat(toolbar): add a SYNC button"
```

---

## Task 5: Wire the provider and dialog into the app

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import and mount the provider**

In `src/App.tsx`, add imports:
```tsx
import { SyncProvider } from "@/context/SyncContext";
import { SyncDialog } from "@/components/SyncDialog";
```
Wrap `CalendarScreen` with `SyncProvider` (inside `CalendarProvider`):
```tsx
const App = () => (
  <CalendarProvider>
    <SyncProvider>
      <CalendarScreen />
    </SyncProvider>
  </CalendarProvider>
);
```

- [ ] **Step 2: Add dialog state and wire the toolbar**

In `CalendarScreen`, add a `syncOpen` state alongside the existing `dataOpen`/`manageOpen` states:
```tsx
  const [syncOpen, setSyncOpen] = useState(false);
```
Pass `onSync={() => setSyncOpen(true)}` to `<CalendarToolbar ... />` (next to `onManageData`). Then render the dialog next to `<DataDialog ... />`:
```tsx
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm check`
Expected: clean (the toolbar's `onSync` is now supplied).
```bash
git add src/App.tsx
git commit -m "feat(app): mount SyncProvider and SyncDialog"
```

---

## Task 6: Build verification

- [ ] **Step 1: Whole suite (no new tests, but nothing should break)**

Run: `pnpm test`
Expected: PASS (all existing tests; this phase adds no tests).

- [ ] **Step 2: Type/lint check**

Run: `pnpm check`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: builds to `dist/` with no errors. (This is the real safety net for UI code jsdom cannot test.)

---

## Definition of done

- `useSync()` exposes the status machine and the create/sign-in/unlock/sign-out/sync actions; the DEK lives only in a ref.
- A `◢ SYNC` toolbar button opens `SyncDialog`, which adapts to status/step: choose, create form, TOTP enroll, recovery-key, sign-in form, TOTP challenge, unlock, and synced.
- `SyncProvider` is mounted inside `CalendarProvider`; sync runs on unlock/sign-in/create, on focus, debounced after edits, and via "Sync now".
- `pnpm test`, `pnpm check`, and `pnpm build` are all green. Logged-out behavior is unchanged.

## Manual browser test (done by the user, not the agent)

Prerequisite: in the Supabase dashboard, Authentication, disable "Confirm email" so signup works without an email round-trip. Then `pnpm dev` and:
1. Click `◢ SYNC`, Create account, enter email + a 10+ char password.
2. Scan the QR with an authenticator app, enter the code, save the recovery key.
3. Add/edit an event; confirm it syncs (Sync now, or wait for the debounce).
4. Reload: the dialog should show "locked"; unlock with the password; data persists.
5. In a private window, Sign in with the same account + TOTP; confirm the events appear.

## What this phase deliberately does not do

- No change-password or forgot-password recovery screen (5d).
- No password-strength meter beyond a minimum length (5d).
- libsodium is still in the initial bundle; lazy-loading is deferred (5d).
