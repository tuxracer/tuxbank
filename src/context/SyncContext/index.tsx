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
  requestReauthentication,
  rewrapForNewPassword,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp,
  unlockWithPassword,
  unlockWithRecoveryKey,
  updateAuthPassword,
  updatePasswordColumns,
  uploadKeyMaterial,
  verifyTotp,
  type KeyMaterial,
} from "@/lib/account";
import {
  clearLocalData,
  clearStoredDek,
  getStoredDek,
  setStoredDek,
} from "@/lib/storage";
import { createSupabaseRemote, runSync } from "@/lib/sync";
import type {
  OnboardStep,
  PwResult,
  SyncContextValue,
  SyncStatus,
} from "./types";

export * from "./types";

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNC_DEBOUNCE_MS = 2_000;

const describeError = (error: unknown): string =>
  isAccountError(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : "Unknown error";

// Apply the new auth secret, handling Secure-password-change reauthentication:
// without a nonce a REAUTH_REQUIRED error emails a code and returns "reauth".
const applyAuthSecret = async (
  authSecret: string,
  nonce: string | undefined,
): Promise<"done" | "reauth"> => {
  try {
    await updateAuthPassword(authSecret, nonce);
    return "done";
  } catch (caught) {
    if (isAccountError(caught) && caught.code === "REAUTH_REQUIRED") {
      await requestReauthentication();
      return "reauth";
    }
    throw caught;
  }
};

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
  const pendingRef = useRef<{
    email: string;
    password: string;
    factorId: string;
  } | null>(null);
  const syncingRef = useRef(false);

  // Set the in-memory data key and cache it on the device so a reload or
  // restart resumes unlocked instead of re-prompting for the password. The ref
  // is set synchronously (callers fire doSync right after); persistence runs in
  // the background and is non-fatal — a failed write only costs the next load
  // an unlock, never this session.
  const storeDek = useCallback((dek: Uint8Array): void => {
    dekRef.current = dek;
    void setStoredDek(dek).catch(() => undefined);
  }, []);

  const doSync = useCallback(async () => {
    if (!remote || !dekRef.current || syncingRef.current) return;
    syncingRef.current = true;
    setStatus("syncing");
    try {
      const result = await runSync(dekRef.current, remote);
      if (result.pulled > 0) await refreshFromStorage();
      // Record when the sync finished (wall clock), not the data cursor, and as
      // a real UTC ISO string so the UI can render it in the local time zone.
      setLastSyncedAt(new Date().toISOString());
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

  // Detect an existing session on mount and resume it without re-prompting.
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void getActiveSession()
      .then(async (session) => {
        if (!active) return;
        if (session?.aal2) {
          // Fully set-up session. If the DEK was cached on this device, resume
          // unlocked and sync; otherwise fall back to "locked" for a password.
          setEmail(session.email);
          const storedDek = await getStoredDek().catch(() => undefined);
          if (!active) return;
          if (storedDek) {
            dekRef.current = storedDek;
            setStatus("synced");
            void doSync();
          } else {
            setStatus("locked");
          }
        } else {
          // No usable session: drop any orphaned cached key. For a half-set-up
          // aal1 session (email confirmed but setup never finished), also sign
          // out so the user signs in cleanly, which runs TOTP + setup.
          void clearStoredDek();
          if (session) void authSignOut();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [remote, doSync]);

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

  // Begin TOTP enrollment (first-time setup) and show the QR to the user.
  const beginEnrollment = useCallback(
    async (emailInput: string, password: string) => {
      const enrolled = await enrollTotp();
      pendingRef.current = {
        email: emailInput,
        password,
        factorId: enrolled.factorId,
      };
      setEnrollment({ qrCode: enrolled.qrCode, secret: enrolled.secret });
      setStep("create-totp");
    },
    [],
  );

  const createAccount = useCallback(
    async (emailInput: string, password: string) => {
      if (!remote) {
        setError("Sync is not configured");
        return;
      }
      try {
        const { authSecret } = await deriveKeys(password, emailInput);
        const hasSession = await signUp(emailInput, authSecret);
        setEmail(emailInput);
        setError(null);
        if (hasSession) {
          // Email confirmation is off: continue straight into 2FA setup.
          await beginEnrollment(emailInput, password);
        } else {
          // Email confirmation is required: confirm, then sign in to finish.
          setStep("confirm-email");
        }
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote, beginEnrollment],
  );

  const signIn = useCallback(
    async (emailInput: string, password: string) => {
      if (!remote) {
        setError("Sync is not configured");
        return;
      }
      try {
        const { authSecret } = await deriveKeys(password, emailInput);
        await authSignIn(emailInput, authSecret);
        setEmail(emailInput);
        setError(null);
        const factorId = await getTotpFactorId();
        if (factorId) {
          // Returning device: challenge the existing 2FA factor.
          pendingRef.current = { email: emailInput, password, factorId };
          setStep("signin-totp");
        } else {
          // First sign-in after confirming email: enroll 2FA now.
          await beginEnrollment(emailInput, password);
        }
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote, beginEnrollment],
  );

  // Verify the TOTP code (completing enrollment or a challenge) to reach aal2,
  // then either unlock existing key material or provision it on first setup.
  const confirmTotp = useCallback(
    async (code: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      try {
        await verifyTotp(pending.factorId, code); // reaches aal2

        let material: KeyMaterial | null = null;
        try {
          material = await fetchKeyMaterial();
        } catch (caught) {
          if (!(isAccountError(caught) && caught.code === "NO_KEY_MATERIAL")) {
            throw caught;
          }
        }

        if (material) {
          // Existing account: unlock the data key with the password.
          storeDek(
            await unlockWithPassword(pending.password, pending.email, material),
          );
          pendingRef.current = null;
          setEnrollment(null);
          setStep("idle");
          setStatus("synced");
          setError(null);
          void doSync(); // initial pull
        } else {
          // First-time setup: provision keys, upload them, show the recovery key.
          const provisioned = await provisionAccountKeys(
            pending.password,
            pending.email,
          );
          await uploadKeyMaterial(provisioned.keyMaterial);
          storeDek(provisioned.dek);
          pendingRef.current = null;
          setEnrollment(null);
          setRecoveryKey(provisioned.recoveryKey);
          setStep("create-recovery");
          setError(null);
          void doSync(); // initial push
        }
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [doSync, storeDek],
  );

  const finishCreate = useCallback(() => {
    pendingRef.current = null;
    setEnrollment(null);
    setRecoveryKey(null);
    setStep("idle");
    setStatus("synced");
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!remote || !email) {
        setError("Sync is not configured");
        return;
      }
      try {
        let material: KeyMaterial | null = null;
        try {
          material = await fetchKeyMaterial();
        } catch (caught) {
          if (!(isAccountError(caught) && caught.code === "NO_KEY_MATERIAL")) {
            throw caught;
          }
        }
        if (material) {
          // Existing data: unlock the data key with the password.
          storeDek(await unlockWithPassword(password, email, material));
          setStatus("synced");
          setError(null);
          void doSync();
        } else {
          // No data yet: first-time setup on an already-verified session.
          // Provision keys and show the recovery key instead of erroring.
          const provisioned = await provisionAccountKeys(password, email);
          await uploadKeyMaterial(provisioned.keyMaterial);
          storeDek(provisioned.dek);
          setRecoveryKey(provisioned.recoveryKey);
          setStep("create-recovery");
          setError(null);
          void doSync();
        }
      } catch (caught) {
        setError(describeError(caught));
      }
    },
    [remote, email, doSync, storeDek],
  );

  const changePassword = useCallback(
    async (newPassword: string, nonce?: string): Promise<PwResult> => {
      if (!remote || !email || !dekRef.current) {
        setError("Sync is not configured");
        return "error";
      }
      try {
        const rewrapped = await rewrapForNewPassword(
          newPassword,
          email,
          dekRef.current,
        );
        if ((await applyAuthSecret(rewrapped.authSecret, nonce)) === "reauth") {
          setError(null);
          return "reauth";
        }
        await updatePasswordColumns(rewrapped);
        setError(null);
        return "done";
      } catch (caught) {
        setError(describeError(caught));
        return "error";
      }
    },
    [remote, email],
  );

  const recoverWithKey = useCallback(
    async (
      recoveryKey: string,
      newPassword: string,
      nonce?: string,
    ): Promise<PwResult> => {
      if (!remote || !email) {
        setError("Sync is not configured");
        return "error";
      }
      try {
        const material = await fetchKeyMaterial();
        const dek = await unlockWithRecoveryKey(recoveryKey, material);
        // The password was forgotten, so set a new one while we have the DEK.
        const rewrapped = await rewrapForNewPassword(newPassword, email, dek);
        if ((await applyAuthSecret(rewrapped.authSecret, nonce)) === "reauth") {
          setError(null);
          return "reauth";
        }
        await updatePasswordColumns(rewrapped);
        storeDek(dek);
        setStatus("synced");
        setError(null);
        void doSync();
        return "done";
      } catch (caught) {
        setError(isAccountError(caught) ? caught.code : "RECOVERY_FAILED");
        return "error";
      }
    },
    [remote, email, doSync, storeDek],
  );

  const signOut = useCallback(
    async (clearLocal?: boolean) => {
      try {
        await authSignOut();
      } catch {
        // Local session is cleared regardless; ignore a failed server revoke.
      }
      dekRef.current = null;
      pendingRef.current = null;
      setEmail(null);
      setEnrollment(null);
      setRecoveryKey(null);
      setStep("idle");
      setStatus("off");
      setLastSyncedAt(null);
      setError(null);
      // Drop the cached key so the next load re-locks. clearLocalData (below)
      // also wipes it, but a non-clearing sign-out must drop it too; awaited so
      // the key is gone before sign-out resolves.
      try {
        await clearStoredDek();
      } catch {
        // Best-effort: the next load can't resume without an active session.
      }
      if (clearLocal) {
        try {
          await clearLocalData();
          await refreshFromStorage();
        } catch (caught) {
          setError(describeError(caught));
        }
      }
    },
    [refreshFromStorage],
  );

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
    confirmTotp,
    finishCreate,
    signIn,
    unlock,
    changePassword,
    recoverWithKey,
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
