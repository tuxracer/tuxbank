import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCalendar } from "@/context/CalendarContext";
import { deriveKeys } from "@/lib/crypto";
import { trackEvent } from "@/lib/analytics";
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
  stagePasswordRewrap,
  clearPreviousPasswordWrap,
  unlockWithKek,
  unlockWithPassword,
  unlockWithRecoveryKey,
  updateAuthPassword,
  uploadKeyMaterial,
  verifyTotp,
  type KeyMaterial,
} from "@/lib/account";
import {
  buildDeviceLinkUrl,
  DEVICE_LINK_HASH_PREFIX,
  DEVICE_LINK_VERSION,
  parseDeviceLinkHash,
  type DeviceLinkPayload,
} from "@/lib/deviceLink";
import {
  clearLocalData,
  clearStoredDek,
  commitImportLocal,
  commitImportSynced,
  exportDatabase,
  getStoredDek,
  getSyncCursor,
  setStoredDek,
} from "@/lib/storage";
import {
  countPendingChanges,
  createSupabaseRemote,
  detectSignInConflict,
  runSync,
} from "@/lib/sync";
import type { SignInConflict } from "@/lib/sync";
import { fromBase64, toBase64 } from "@/utils/base64";
import type {
  OnboardStep,
  PwResult,
  SignInChoice,
  SyncContextValue,
  SyncStatus,
} from "./types";

export * from "./types";

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNC_DEBOUNCE_MS = 2_000;

// Shown when a scanned device-link sign-in fails, whether from an explicitly
// rejected sign-in (signInWithLink's catch) or an unexpected throw while
// resuming a half-completed link sign-in at boot.
const LINK_SIGNIN_FAILED_MESSAGE =
  "This link code did not work. It may be outdated. Generate a new one on your signed-in device.";

const describeError = (error: unknown): string =>
  isAccountError(error)
    ? error.code
    : error instanceof Error
      ? error.message
      : "Unknown error";

/**
 * Statuses where the provider must not touch the account: signed out, locked,
 * or holding a live key but waiting on the first-sync conflict prompt. In all
 * three the device has not reconciled with the account, so destructive actions
 * stay local.
 */
const isPreSync = (status: SyncStatus): boolean =>
  status === "off" || status === "locked" || status === "choice";

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

// What confirmTotp needs to finish an unlock after aal2: the password flow
// re-derives the KEK; the device-link flow carries it directly.
type PendingAuth =
  | { kind: "password"; email: string; password: string; factorId: string }
  | { kind: "link"; email: string; kek: Uint8Array; factorId: string };

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  // Destructure the stable callback + the changing values so effects do not
  // thrash on the calendar context value object (which is new every render).
  const { events, categories, visibleMonth, refreshFromStorage, clearAllData } =
    useCalendar();
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
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signInChoice, setSignInChoice] = useState<SignInConflict | null>(null);

  const dekRef = useRef<Uint8Array | null>(null);
  const pendingRef = useRef<PendingAuth | null>(null);
  const syncingRef = useRef(false);
  // How many undecryptable rows the previous sync skipped, so the warning
  // toast fires when the number changes rather than on every debounced sync.
  const skippedRef = useRef(0);

  // Whether the first-sync conflict question has been settled for this session.
  // "unknown" means it has not been asked yet, "pending" means the user is
  // looking at the prompt, "resolved" means they answered (or there was nothing
  // to ask). Merge changes neither side's emptiness, so without "resolved" the
  // gate would re-detect the same conflict forever.
  const choiceRef = useRef<"unknown" | "pending" | "resolved">("unknown");

  // A scanned device link arrives via the URL hash. Read-once (StrictMode
  // re-runs effects; the ref makes consumption idempotent) and the fragment
  // is stripped immediately so the secrets it carries never sit in the
  // address bar or browser history.
  const linkPayloadRef = useRef<DeviceLinkPayload | null | undefined>(
    undefined,
  );
  const consumeLinkPayload = useCallback((): DeviceLinkPayload | null => {
    if (linkPayloadRef.current === undefined) {
      const hash = window.location.hash;
      linkPayloadRef.current = parseDeviceLinkHash(hash);
      // Strip the fragment whenever it looks like a device link, even if it
      // failed to parse (e.g. a future-version payload) — it still carries
      // live secrets and must never sit in the address bar or history.
      if (hash.startsWith(DEVICE_LINK_HASH_PREFIX)) {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
    return linkPayloadRef.current;
  }, []);

  // Set the in-memory data key and cache it on the device so a reload or
  // restart resumes unlocked instead of re-prompting for the password. The ref
  // is set synchronously (callers fire doSync right after); persistence runs in
  // the background and is non-fatal — a failed write only costs the next load
  // an unlock, never this session.
  const storeDek = useCallback((dek: Uint8Array): void => {
    dekRef.current = dek;
    void setStoredDek(dek).catch(() => undefined);
  }, []);

  // Best effort: a failed storage read keeps the previous count rather than
  // surfacing an error for a purely informational number. Skipped entirely
  // when sync is unconfigured or the vault is locked — no UI shows the count
  // then, and a local-only user should not pay storage reads on every edit.
  const refreshPendingCount = useCallback(() => {
    if (!remote || !dekRef.current) return;
    void countPendingChanges()
      .then(setPendingCount)
      .catch(() => undefined);
  }, [remote]);

  // The awaitable form, for callers that need the count immediately after a
  // sync rather than on the next render (the sign-out warning). Rejects on a
  // storage failure so the caller can decide, unlike the fire-and-forget
  // refresh above.
  const readPendingCount = useCallback(async (): Promise<number> => {
    const count = await countPendingChanges();
    setPendingCount(count);
    return count;
  }, []);

  const doSync = useCallback(async () => {
    if (!remote || !dekRef.current || syncingRef.current) return;
    if (!navigator.onLine) {
      setStatus("offline");
      refreshPendingCount();
      return;
    }
    // The user is looking at the conflict prompt: nothing moves until they answer.
    if (choiceRef.current === "pending") return;
    syncingRef.current = true;
    if (choiceRef.current === "unknown") {
      try {
        const conflict = await detectSignInConflict(remote);
        if (conflict) {
          choiceRef.current = "pending";
          setSignInChoice(conflict);
          setStatus("choice");
          setStep("signin-choice");
          return;
        }
        choiceRef.current = "resolved";
      } catch (caught) {
        // Leave the ref "unknown" so the next attempt re-checks rather than
        // merging on the strength of a failed lookup.
        setError(describeError(caught));
        setStatus("error");
        return;
      } finally {
        if (choiceRef.current !== "resolved") syncingRef.current = false;
      }
    }
    setStatus("syncing");
    try {
      const result = await runSync(dekRef.current, remote);
      if (result.pulled > 0) await refreshFromStorage();
      // Poison rows are skipped rather than bricking the sync; tell the user
      // once per change in count instead of failing forever.
      if (result.skipped > 0 && result.skipped !== skippedRef.current) {
        toast.error(
          result.skipped === 1
            ? "1 synced item could not be decrypted and was skipped."
            : `${result.skipped} synced items could not be decrypted and were skipped.`,
        );
      }
      skippedRef.current = result.skipped;
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
      refreshPendingCount();
    }
  }, [remote, refreshFromStorage, refreshPendingCount]);

  const syncNow = useCallback(async () => {
    await doSync();
  }, [doSync]);

  // Sync when the window regains focus or the network reconnects (an offline
  // edit otherwise stays unpushed until the next edit, navigation, or reload).
  // doSync no-ops if the vault is locked, so we always listen and let it
  // self-gate (no dependency on status). Going offline flips the status
  // directly, gated on an unlocked DEK so "off"/"locked" are never replaced.
  useEffect(() => {
    const onWake = () => void doSync();
    const onOffline = () => {
      if (dekRef.current) setStatus("offline");
    };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("offline", onOffline);
    };
  }, [doSync]);

  // Keep the pending count fresh after local edits (it also refreshes after
  // every sync attempt). refreshPendingCount self-gates on an unlocked DEK.
  useEffect(() => {
    refreshPendingCount();
  }, [events, categories, refreshPendingCount]);

  // Debounced sync after a local edit or a month/year navigation. Changing the
  // visible month is the user's cue to pull fresh data for the dates they're now
  // looking at (a no-op push, since navigating changes no local rows). Gated on
  // an unlocked DEK (a ref), so it fires on events/categories/visibleMonth
  // changes, never on a status flip (which would otherwise create a perpetual
  // self-triggering sync loop).
  useEffect(() => {
    if (!dekRef.current) return;
    const id = setTimeout(() => void doSync(), SYNC_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [events, categories, visibleMonth, doSync]);

  // Begin TOTP enrollment (first-time setup) and show the QR to the user.
  const beginEnrollment = useCallback(
    async (emailInput: string, password: string) => {
      const enrolled = await enrollTotp();
      pendingRef.current = {
        kind: "password",
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
        // The account exists now; 2FA setup (or email confirmation) follows.
        trackEvent("account-created", { confirmationRequired: !hasSession });
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
        // The password was accepted; the 2FA challenge still has to pass.
        trackEvent("signed-in", { method: "password" });
        setEmail(emailInput);
        setError(null);
        const factorId = await getTotpFactorId();
        if (factorId) {
          // Returning device: challenge the existing 2FA factor.
          pendingRef.current = {
            kind: "password",
            email: emailInput,
            password,
            factorId,
          };
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
          // Existing account: unlock the data key (password re-derives the
          // KEK; a device link carries it).
          storeDek(
            pending.kind === "password"
              ? await unlockWithPassword(
                  pending.password,
                  pending.email,
                  material,
                )
              : await unlockWithKek(pending.kek, material),
          );
          pendingRef.current = null;
          setEnrollment(null);
          setStep("idle");
          setStatus("synced");
          setError(null);
          void doSync(); // initial pull
        } else if (pending.kind === "link") {
          // A device link is only minted from a fully provisioned account, so
          // missing key material means this link cannot proceed.
          setError("NO_KEY_MATERIAL");
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

  // Sign in from a scanned device link (arrives via the URL hash at boot;
  // not part of the public context value — no component calls it). authSecret
  // and KEK travel in the payload, so no key derivation happens on this
  // device. Failures toast because the dialog is not open when a scan fails.
  const signInWithLink = useCallback(
    async (payload: DeviceLinkPayload) => {
      if (!remote) return;
      try {
        await authSignIn(payload.email, payload.authSecret);
        const factorId = await getTotpFactorId();
        if (!factorId) {
          // Links are minted from fully set-up accounts; without a 2FA factor
          // this flow cannot finish. Drop the half sign-in.
          await authSignOut();
          toast.error(
            "This link code did not work. Generate a new one on your signed-in device.",
          );
          return;
        }
        trackEvent("signed-in", { method: "device-link" });
        setEmail(payload.email);
        setError(null);
        pendingRef.current = {
          kind: "link",
          email: payload.email,
          kek: fromBase64(payload.kek),
          factorId,
        };
        setStep("signin-totp");
      } catch {
        // An unexpected throw (e.g. getTotpFactorId failing after a
        // successful sign-in) must not leave a live aal1 session behind
        // while the UI still shows "off".
        await authSignOut().catch(() => undefined);
        toast.error(LINK_SIGNIN_FAILED_MESSAGE);
      }
    },
    [remote],
  );

  // Detect an existing session on mount and resume it without re-prompting.
  // A scanned device link arrives here too, via the URL hash.
  useEffect(() => {
    const linkPayload = consumeLinkPayload();
    if (!remote) return;
    let active = true;
    void getActiveSession()
      .then(async (session) => {
        if (!active) return;
        if (session?.aal2) {
          if (linkPayload) toast("Already signed in on this device.");
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
          if (session) await authSignOut();
          if (linkPayload && active) await signInWithLink(linkPayload);
        }
      })
      .catch(() => {
        // authSignOut() above (for a half-set-up session) can itself throw.
        // Without this, a scanned link would be silently dropped with no
        // feedback; surface the same generic failure signInWithLink shows.
        if (linkPayload) toast.error(LINK_SIGNIN_FAILED_MESSAGE);
      });
    return () => {
      active = false;
    };
  }, [remote, doSync, consumeLinkPayload, signInWithLink]);

  const createDeviceLink = useCallback(
    async (password: string): Promise<string | null> => {
      if (!remote || !email || !dekRef.current) {
        setError("NOT_CONFIGURED");
        return null;
      }
      try {
        const { kek, authSecret } = await deriveKeys(password, email);
        // Validate the password: the derived KEK must unwrap the account DEK.
        await unlockWithKek(kek, await fetchKeyMaterial());
        setError(null);
        return buildDeviceLinkUrl(
          { v: DEVICE_LINK_VERSION, email, authSecret, kek: toBase64(kek) },
          window.location.origin,
        );
      } catch (caught) {
        setError(isAccountError(caught) ? caught.code : "LINK_CREATE_FAILED");
        return null;
      }
    },
    [remote, email],
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
        // Two-phase: stage both wraps BEFORE flipping the auth password, so a
        // failure between the steps leaves every device able to unlock with
        // whichever password the account still accepts.
        await stagePasswordRewrap(rewrapped);
        if ((await applyAuthSecret(rewrapped.authSecret, nonce)) === "reauth") {
          setError(null);
          return "reauth";
        }
        // Best-effort: the staged old wrap is dead weight once the new
        // password is live; a failure here just leaves it for the next change.
        await clearPreviousPasswordWrap().catch(() => undefined);
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
        // Same two-phase order as changePassword: stage, flip auth, clear.
        const rewrapped = await rewrapForNewPassword(newPassword, email, dek);
        await stagePasswordRewrap(rewrapped);
        if ((await applyAuthSecret(rewrapped.authSecret, nonce)) === "reauth") {
          setError(null);
          return "reauth";
        }
        await clearPreviousPasswordWrap().catch(() => undefined);
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
      choiceRef.current = "unknown";
      setEmail(null);
      setEnrollment(null);
      setRecoveryKey(null);
      setSignInChoice(null);
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

  // The guarded "Clear all data" reset, routed by sign-in state. Only an
  // unlocked session may destroy cloud data: it tombstones every row and
  // pushes. Signed out or locked signs out and wipes all local stores
  // (tombstones and cursor included) without recording anything, so a later
  // sign-in pulls the account's data untouched. The wipe runs here rather
  // than via signOut(true) so a failed wipe rejects and the Data dialog can
  // show its error state instead of closing as if the reset succeeded.
  const resetAllData = useCallback(async () => {
    if (isPreSync(status)) {
      await signOut();
      await clearLocalData();
      await refreshFromStorage();
      return;
    }
    await clearAllData();
    await doSync();
  }, [status, signOut, refreshFromStorage, clearAllData, doSync]);

  // Import a backup, routed by sign-in state (mirrors resetAllData). Unlocked:
  // pull first (best effort) so rows this device has never seen get
  // tombstoned, replace everything with the re-stamped backup, then push so
  // every device converges on the backup. Signed out or locked: replace local
  // data only and drop the cursor, so the next sign-in merges cleanly instead
  // of diverging. Storage failures reject so the Data dialog shows its error
  // state.
  const importData = useCallback(
    async (file: File) => {
      const text = await file.text();
      if (isPreSync(status)) {
        await commitImportLocal(text);
        await refreshFromStorage();
        return;
      }
      await doSync();
      await commitImportSynced(text);
      await refreshFromStorage();
      await doSync();
    },
    [status, refreshFromStorage, doSync],
  );

  // Answer the first-sync conflict prompt. Each branch ends with a sync that
  // writes a cursor, so the gate never re-detects the same conflict.
  //
  // keep-local reuses the unlocked import path: commitImportSynced only knows
  // about ids present locally, so the first sync has to land the account's rows
  // here before they can become tombstone candidates. The export is captured
  // before that sync, otherwise the account's rows would be folded into the set
  // being declared authoritative.
  const resolveSignInChoice = useCallback(
    async (choice: SignInChoice) => {
      trackEvent("sign-in-choice", { choice });
      setSignInChoice(null);
      setStep("idle");
      try {
        // Cross-tab guard: two tabs can independently detect the conflict
        // (setSyncCursor deliberately does not broadcast a change), so a
        // cursor may already exist by the time this tab's answer comes in,
        // written by another tab that resolved the same prompt first. That
        // makes the question moot: running a destructive branch now would act
        // on a premise (no cursor yet) that no longer holds, regardless of
        // which choice was passed.
        if ((await getSyncCursor()) !== undefined) {
          choiceRef.current = "resolved";
          await doSync();
          return;
        }
        if (choice === "remote") {
          await clearLocalData();
          // clearLocalData clears the entire syncMeta store, including the
          // cached DEK. dekRef.current survives in memory so this session
          // keeps working either way, but without re-persisting it here the
          // next page load finds no cached key and lands on "locked" instead
          // of resuming synced.
          if (dekRef.current) storeDek(dekRef.current);
          await refreshFromStorage();
          choiceRef.current = "resolved";
          await doSync();
          return;
        }
        if (choice === "local") {
          const mine = await exportDatabase();
          choiceRef.current = "resolved";
          await doSync();
          await commitImportSynced(mine);
          await refreshFromStorage();
          await doSync();
          return;
        }
        choiceRef.current = "resolved";
        await doSync();
      } catch (caught) {
        // Stay resolved on failure: keep-local may already have merged, and
        // re-running it would upload that merged set as truth. Recovery is the
        // Data dialog (import a backup, or clear all data).
        choiceRef.current = "resolved";
        setError(describeError(caught));
        setStatus("error");
      }
    },
    [doSync, refreshFromStorage, storeDek],
  );

  const unlocked = !isPreSync(status);

  // Memoized: the provider re-renders on every calendar change (it consumes
  // useCalendar), and without a stable identity every useSync consumer would
  // re-render with it even when no sync state moved.
  const value: SyncContextValue = useMemo(
    () => ({
      status,
      step,
      email,
      enrollment,
      recoveryKey,
      lastSyncedAt,
      pendingCount,
      readPendingCount,
      error,
      configured: remote !== null,
      createAccount,
      confirmTotp,
      finishCreate,
      signIn,
      unlock,
      createDeviceLink,
      changePassword,
      recoverWithKey,
      signOut,
      resetAllData,
      importData,
      unlocked,
      syncNow,
      signInChoice,
      resolveSignInChoice,
    }),
    [
      status,
      step,
      email,
      enrollment,
      recoveryKey,
      lastSyncedAt,
      pendingCount,
      readPendingCount,
      error,
      remote,
      createAccount,
      confirmTotp,
      finishCreate,
      signIn,
      unlock,
      createDeviceLink,
      changePassword,
      recoverWithKey,
      signOut,
      resetAllData,
      importData,
      unlocked,
      syncNow,
      signInChoice,
      resolveSignInChoice,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = (): SyncContextValue => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
};
