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
  type KeyMaterial,
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

  // Detect an existing session on mount.
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void getActiveSession()
      .then((session) => {
        if (!active || !session) return;
        if (session.aal2) {
          // Fully set-up session: the DEK is gone, so we are "locked".
          setEmail(session.email);
          setStatus("locked");
        } else {
          // An aal1 session (e.g. email confirmed but setup never finished):
          // clear it so the user signs in cleanly, which runs TOTP + setup.
          void authSignOut();
        }
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
          dekRef.current = await unlockWithPassword(
            pending.password,
            pending.email,
            material,
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
          dekRef.current = provisioned.dek;
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
    [doSync],
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
          dekRef.current = await unlockWithPassword(password, email, material);
          setStatus("synced");
          setError(null);
          void doSync();
        } else {
          // No data yet: first-time setup on an already-verified session.
          // Provision keys and show the recovery key instead of erroring.
          const provisioned = await provisionAccountKeys(password, email);
          await uploadKeyMaterial(provisioned.keyMaterial);
          dekRef.current = provisioned.dek;
          setRecoveryKey(provisioned.recoveryKey);
          setStep("create-recovery");
          setError(null);
          void doSync();
        }
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
    confirmTotp,
    finishCreate,
    signIn,
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
