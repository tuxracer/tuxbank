import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { useSync } from "@/context/SyncContext";
import type { SyncContextValue } from "@/context/SyncContext";

type Mode = "choose" | "create" | "signin";

/** The exact word the user must type to confirm a destructive sign-in choice. */
const CONFIRM_WORD = "delete";

/**
 * What account deletion asks the user to type. The email is in it on purpose:
 * the phrase cannot be muscle-memoried from the other confirmations, and it
 * names the account that is about to go.
 */
const deletePhrase = (email: string | null): string =>
  `${CONFIRM_WORD} ${email ?? ""}`;

/** How many digits a TOTP code carries. */
const TOTP_CODE_LENGTH = 6;

/**
 * Signup email sanity check: at least this many characters, with an "@" and a
 * ".". Deliberately loose; the required confirmation email is the real
 * validation, this only catches obvious typos before that round trip.
 */
const EMAIL_MIN_LENGTH = 6;

const isPlausibleEmail = (value: string): boolean =>
  value.length >= EMAIL_MIN_LENGTH &&
  value.includes("@") &&
  value.includes(".");

/** Which destructive choice is awaiting its typed confirmation, if any. */
type ChoiceStage =
  | { kind: "choose" }
  | { kind: "confirm"; choice: "local" | "remote" };

const ERROR_TEXT: Record<string, string> = {
  SIGNUP_FAILED: "Could not create the account (is the email already used?).",
  SIGNIN_FAILED: "Wrong email or password.",
  EMAIL_NOT_CONFIRMED:
    "Confirm your email (check your inbox), then sign in to finish setup.",
  MFA_VERIFY_FAILED: "That code did not match. Try again.",
  MFA_ENROLL_FAILED: "Could not start 2FA enrollment.",
  NO_KEY_MATERIAL: "No encrypted data found for this account.",
  KEY_MATERIAL_FAILED: "Could not reach the encrypted store.",
  NOT_CONFIGURED: "Sync is not configured.",
  PASSWORD_CHANGE_FAILED: "Could not change your password. Please try again.",
  RECOVERY_FAILED: "Could not recover. Check your recovery key and try again.",
  LINK_CREATE_FAILED: "Could not generate a link code. Check your password.",
  WRONG_PASSWORD: "That password did not match.",
  ACCOUNT_DELETE_FAILED:
    "Your synced data was deleted, but the account itself could not be removed. Try again.",
};

const errorText = (code: string): string => ERROR_TEXT[code] ?? code;

/** Renders a sync timestamp in the viewer's local time zone. */
const SYNC_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const pendingSuffix = (count: number): string =>
  count > 0 ? ` (${count} pending)` : "";

const syncStatusLine = (sync: SyncContextValue): string => {
  switch (sync.status) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return sync.pendingCount > 0
        ? `Offline. ${sync.pendingCount} ${sync.pendingCount === 1 ? "change" : "changes"} will sync when you reconnect.`
        : "Offline.";
    case "error":
      return `Sync failed. Retry below.${pendingSuffix(sync.pendingCount)}`;
    default:
      return sync.lastSyncedAt
        ? `Last sync ${SYNC_TIME_FORMAT.format(new Date(sync.lastSyncedAt))}${pendingSuffix(sync.pendingCount)}`
        : "Synced";
  }
};

/**
 * The Sync pane of the settings dialog. All state is local, so mounting fresh
 * (the settings dialog unmounts panes on close and on tab switches) starts
 * every flow from the top.
 */
export const SyncSettings = () => {
  const sync = useSync();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [awaitingReauth, setAwaitingReauth] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [choiceStage, setChoiceStage] = useState<ChoiceStage>({
    kind: "choose",
  });
  const [choiceText, setChoiceText] = useState("");
  const choiceConfirmed = choiceText.trim().toLowerCase() === CONFIRM_WORD;
  // Null email means there is no phrase to match, so nothing can confirm.
  const deleteConfirmed =
    sync.email !== null &&
    deleteText.trim().toLowerCase() === deletePhrase(sync.email).toLowerCase();

  const reset = () => {
    setMode("choose");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setBusy(false);
    setChangingPw(false);
    setLinking(false);
    setLinkUrl(null);
    setRecovering(false);
    setRecoveryKeyInput("");
    setAwaitingReauth(false);
    setReauthCode("");
    setConfirmingSignOut(false);
    setDeleting(false);
    setDeleteText("");
    setChoiceStage({ kind: "choose" });
    setChoiceText("");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // Finish a deliberate sign-out: confirm, revoke the session and clear this
  // browser's data, then wipe web storage and reload so nothing from the
  // signed-in session survives in this tab. The wipe takes the landing-page
  // flag with it, so the reload lands on the landing page: the browser is back
  // to the state it was in before anyone used the app here. Only the sign-out
  // button uses this. The onboarding cancels call sync.signOut directly to
  // abort a half-finished sign-in, and must not wipe a local-only user's
  // calendar.
  const finishSignOut = async () => {
    // The confirmingSignOut section already asked "Sign out of {email}?";
    // only the pending-changes warning below adds new information.
    // Push anything outstanding first so signing out does not strand it. Best
    // effort: offline or a failing account leaves changes pending, which the
    // warning below reports. A sync failure must never block the sign-out.
    try {
      await sync.syncNow();
    } catch {
      // Reported by the warning below, in terms of what the user loses.
    }
    // Read the count fresh. sync.pendingCount still holds the pre-sync value
    // here, since the state update lands on a later render. Fall back to that
    // value if storage cannot be read.
    let pending = sync.pendingCount;
    try {
      pending = await sync.readPendingCount();
    } catch {
      // Keep the pre-sync count: overwarning beats losing changes silently.
    }
    // Anything still pending after that attempt is genuinely lost in the wipe,
    // so it earns its own gate rather than a line already clicked past.
    if (pending > 0) {
      const changes = `${pending} local ${pending === 1 ? "change" : "changes"}`;
      const lost = `Are you sure you want to sign out now? You have ${changes} that will be lost.`;
      if (!window.confirm(lost)) return;
    }
    await sync.signOut(true);
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Web storage can be unavailable (private mode, blocked cookies). The
      // session is already revoked, so reload regardless.
    }
    window.location.reload();
  };

  // Any non-empty password is accepted: TOTP is mandatory, so length and
  // complexity rules only push people toward passwords they cannot remember.
  const passwordMissing = password.length === 0;

  return (
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

      {/* REAUTH: emailed code to finish a Secure password change */}
      {awaitingReauth && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs">
            We emailed you a confirmation code to finish changing your password.
            Enter it below.
          </p>
          <Label htmlFor="reauth-code">Email code</Label>
          <Input
            id="reauth-code"
            inputMode="numeric"
            placeholder="123456"
            value={reauthCode}
            onChange={(e) => setReauthCode(e.target.value)}
          />
          <Button
            className="cy-btn justify-start"
            disabled={busy || reauthCode.length < 6}
            onClick={async () => {
              setBusy(true);
              const result = changingPw
                ? await sync.changePassword(password, reauthCode.trim())
                : await sync.recoverWithKey(
                    recoveryKeyInput.trim(),
                    password,
                    reauthCode.trim(),
                  );
              setBusy(false);
              if (result === "done") {
                toast.success(
                  changingPw
                    ? "Password changed"
                    : "Recovered. Password updated.",
                );
                reset();
              }
            }}
          >
            Confirm
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAwaitingReauth(false);
              setReauthCode("");
            }}
          >
            Cancel
          </Button>
        </section>
      )}

      {/* CONFIRM SIGN OUT: optionally wipe local data on this device */}
      {confirmingSignOut && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs">
            Sign out of <span className="cy-hud on">{sync.email}</span>?
          </p>
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
            Your data stays safe in your account and comes back when you sign in
            again.
          </p>
          <Button
            className="cy-btn justify-start"
            disabled={busy}
            onClick={() => void run(finishSignOut)}
          >
            {busy ? "Signing out…" : "Sign out"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingSignOut(false)}>
            Cancel
          </Button>
        </section>
      )}

      {/* SYNCED / SYNCING / ERROR / OFFLINE (all post-onboarding, account active) */}
      {sync.unlocked &&
        sync.step === "idle" &&
        !changingPw &&
        !confirmingSignOut &&
        !deleting &&
        !linking && (
          <section className="flex flex-col gap-3">
            <p className="cy-mono text-xs">
              Signed in as <span className="cy-hud on">{sync.email}</span>
            </p>
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              {syncStatusLine(sync)}
            </p>
            <Button
              className="cy-btn justify-start"
              disabled={sync.status === "syncing" || sync.status === "offline"}
              onClick={() => void sync.syncNow()}
            >
              Sync now
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPassword("");
                setLinking(true);
              }}
            >
              Link another device
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPassword("");
                setConfirmPassword("");
                setChangingPw(true);
              }}
            >
              Change password
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingSignOut(true)}>
              Sign out
            </Button>
            <Button
              variant="ghost"
              className="text-[color:var(--cy-magenta)]"
              onClick={() => {
                setPassword("");
                setCode("");
                setDeleteText("");
                setDeleting(true);
              }}
            >
              Delete account
            </Button>
          </section>
        )}

      {/* DELETE ACCOUNT: password + 2FA code + the typed confirmation phrase */}
      {sync.unlocked && sync.step === "idle" && deleting && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
            Deleting <span className="cy-hud on">{sync.email}</span> erases
            everything it holds on the server, along with the login itself. This
            cannot be undone.
          </p>
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
            This device keeps its calendar. Your events, categories, and
            settings stay here and go back to being local-only. Other devices
            signed into the account keep their copies too, but they stop syncing
            and are signed out.
          </p>
          <Label htmlFor="del-pw">Password</Label>
          <Input
            id="del-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Label htmlFor="del-code">Two-factor code</Label>
          <Input
            id="del-code"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Label htmlFor="del-confirm">
            Type &quot;{deletePhrase(sync.email)}&quot; to confirm
          </Label>
          <Input
            id="del-confirm"
            data-testid="delete-account-confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
          />
          <Button
            data-testid="delete-account-button"
            className="cy-btn justify-start text-[color:var(--cy-magenta)]"
            disabled={
              busy ||
              !password ||
              code.trim().length < TOTP_CODE_LENGTH ||
              !deleteConfirmed
            }
            onClick={async () => {
              const gone = `Are you sure you want to delete ${sync.email}? This cannot be undone.`;
              if (!window.confirm(gone)) return;
              setBusy(true);
              const deleted = await sync.deleteAccount(password, code.trim());
              setBusy(false);
              if (deleted) {
                toast.success("Account deleted. Your calendar stays here.");
                reset();
              }
            }}
          >
            {busy ? "Deleting…" : "Delete account"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(false);
              setDeleteText("");
              setPassword("");
              setCode("");
            }}
          >
            Cancel
          </Button>
        </section>
      )}

      {/* CHANGE PASSWORD (from the synced state) */}
      {sync.unlocked &&
        sync.step === "idle" &&
        changingPw &&
        !awaitingReauth && (
          <section className="flex flex-col gap-3">
            <p className="cy-mono text-xs">Set a new password.</p>
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="cy-mono text-[10px] text-[color:var(--cy-magenta)]">
                Passwords do not match.
              </p>
            )}
            <Button
              className="cy-btn justify-start"
              disabled={busy || passwordMissing || password !== confirmPassword}
              onClick={async () => {
                setBusy(true);
                const result = await sync.changePassword(password);
                setBusy(false);
                if (result === "done") {
                  toast.success("Password changed");
                  setChangingPw(false);
                  setPassword("");
                  setConfirmPassword("");
                } else if (result === "reauth") {
                  setAwaitingReauth(true);
                }
              }}
            >
              Save new password
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setChangingPw(false);
                setPassword("");
                setConfirmPassword("");
              }}
            >
              Cancel
            </Button>
          </section>
        )}

      {/* LINK ANOTHER DEVICE: password check, then a sign-in QR */}
      {sync.unlocked && sync.step === "idle" && linking && (
        <section className="flex flex-col gap-3">
          {!linkUrl && (
            <>
              <p className="cy-mono text-xs">
                Confirm your password to generate a sign-in code for another
                device.
              </p>
              <Label htmlFor="link-pw">Password</Label>
              <Input
                id="link-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                className="cy-btn justify-start"
                disabled={busy || !password}
                onClick={async () => {
                  setBusy(true);
                  const url = await sync.createDeviceLink(password);
                  setBusy(false);
                  setPassword("");
                  if (url) setLinkUrl(url);
                }}
              >
                {busy ? "Working…" : "Generate code"}
              </Button>
            </>
          )}
          {linkUrl && (
            <>
              <p className="cy-mono text-xs">
                Scan this on the other device. It opens tuxbank and signs you
                in; you still enter your 2FA code there.
              </p>
              <div
                data-testid="device-link-qr"
                className="mx-auto h-64 w-64 bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: renderSVG(linkUrl) }}
              />
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setLinking(false);
              setLinkUrl(null);
              setPassword("");
            }}
          >
            {linkUrl ? "Done" : "Cancel"}
          </Button>
        </section>
      )}

      {/* LOCKED: session exists, need password to unlock the key */}
      {sync.status === "locked" && !recovering && !confirmingSignOut && (
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
          <Button
            variant="ghost"
            onClick={() => {
              setPassword("");
              setConfirmPassword("");
              setRecovering(true);
            }}
          >
            Forgot password? Use recovery key
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingSignOut(true)}>
            Sign out
          </Button>
        </section>
      )}

      {/* RECOVER with the recovery key, then set a new password */}
      {sync.status === "locked" && recovering && !awaitingReauth && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs">
            Enter your recovery key and choose a new password.
          </p>
          <Label htmlFor="rec-key">Recovery key</Label>
          <Input
            id="rec-key"
            value={recoveryKeyInput}
            onChange={(e) => setRecoveryKeyInput(e.target.value)}
          />
          <Label htmlFor="rec-new">New password</Label>
          <Input
            id="rec-new"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Label htmlFor="rec-confirm">Confirm new password</Label>
          <Input
            id="rec-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="cy-mono text-[10px] text-[color:var(--cy-magenta)]">
              Passwords do not match.
            </p>
          )}
          <Button
            className="cy-btn justify-start"
            disabled={
              busy ||
              !recoveryKeyInput ||
              passwordMissing ||
              password !== confirmPassword
            }
            onClick={async () => {
              setBusy(true);
              const result = await sync.recoverWithKey(
                recoveryKeyInput.trim(),
                password,
              );
              setBusy(false);
              if (result === "done") {
                toast.success("Recovered. Password updated.");
                setRecovering(false);
                setRecoveryKeyInput("");
                setPassword("");
                setConfirmPassword("");
              } else if (result === "reauth") {
                setAwaitingReauth(true);
              }
            }}
          >
            Recover
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRecovering(false);
              setRecoveryKeyInput("");
              setPassword("");
              setConfirmPassword("");
            }}
          >
            Cancel
          </Button>
        </section>
      )}

      {/* SIGN UP: confirm email, then sign in to finish setup */}
      {sync.step === "confirm-email" && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs">
            We sent a confirmation link to{" "}
            <span className="cy-hud on">{sync.email}</span>. Confirm your
            account, then sign in here to finish setup (2FA + recovery key).
          </p>
          <Button
            className="cy-btn justify-start"
            onClick={() => {
              setMode("signin");
              void sync.signOut();
            }}
          >
            I confirmed it, sign in
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
            disabled={busy || code.length < TOTP_CODE_LENGTH}
            onClick={() => void run(() => sync.confirmTotp(code))}
          >
            Verify and continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              void sync.signOut();
            }}
          >
            Cancel
          </Button>
        </section>
      )}

      {/* CREATE: recovery key */}
      {sync.step === "create-recovery" && sync.recoveryKey && (
        <section className="flex flex-col gap-3">
          <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
            Save this recovery key. It is the ONLY way to recover your data if
            you forget your password. It is shown once.
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

      {/* SIGN IN: data conflict, choose which set of events to keep */}
      {sync.step === "signin-choice" && sync.signInChoice && (
        <section className="flex flex-col gap-3">
          {choiceStage.kind === "choose" && (
            <>
              <p className="cy-mono text-xs">
                This device has {sync.signInChoice.local} events. Your account
                has {sync.signInChoice.remote} events. Choose which set to keep.
              </p>
              <Button
                className="cy-btn justify-start"
                onClick={() => void sync.resolveSignInChoice("merge")}
              >
                Merge both
              </Button>
              <span className="cy-mono text-xs text-[color:var(--cy-muted)]">
                Keeps everything from both sides. Nothing is deleted.
              </span>
              <Button
                className="cy-btn justify-start text-[color:var(--cy-magenta)]"
                onClick={() => {
                  setChoiceText("");
                  setChoiceStage({ kind: "confirm", choice: "local" });
                }}
              >
                Keep this device
              </Button>
              <Button
                className="cy-btn justify-start text-[color:var(--cy-magenta)]"
                onClick={() => {
                  setChoiceText("");
                  setChoiceStage({ kind: "confirm", choice: "remote" });
                }}
              >
                Keep the account
              </Button>
            </>
          )}

          {choiceStage.kind === "confirm" && (
            <div className="cy-mono flex flex-col gap-2 text-xs">
              <span>
                Type{" "}
                <span className="text-[color:var(--cy-magenta)]">
                  {CONFIRM_WORD}
                </span>{" "}
                to confirm.{" "}
                {choiceStage.choice === "local"
                  ? `The ${sync.signInChoice.remote} events in your account, and its categories, will be deleted on every device signed into it.`
                  : `The ${sync.signInChoice.local} events on this device, and its categories, will be deleted. Your account is not changed.`}{" "}
                This cannot be undone.
              </span>
              <Input
                data-testid="signin-choice-confirm"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={CONFIRM_WORD}
                value={choiceText}
                onChange={(e) => setChoiceText(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setChoiceStage({ kind: "choose" })}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  data-testid="signin-choice-confirm-button"
                  className="text-[color:var(--cy-magenta)]"
                  disabled={!choiceConfirmed}
                  onClick={() => {
                    const { choice } = choiceStage;
                    setChoiceStage({ kind: "choose" });
                    setChoiceText("");
                    void sync.resolveSignInChoice(choice);
                  }}
                >
                  {choiceStage.choice === "local"
                    ? `Delete ${sync.signInChoice.remote} account events`
                    : `Delete ${sync.signInChoice.local} device events`}
                </Button>
              </div>
            </div>
          )}
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
            disabled={busy || code.length < TOTP_CODE_LENGTH}
            onClick={() => void run(() => sync.confirmTotp(code))}
          >
            Verify
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              void sync.signOut();
            }}
          >
            Cancel
          </Button>
        </section>
      )}

      {/* OFF: choose, then a form */}
      {sync.status === "off" && sync.step === "idle" && (
        <section className="flex flex-col gap-3">
          {mode === "choose" && (
            <>
              <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
                Optionally sync your encrypted data across devices. Your data is
                end-to-end encrypted; we cannot read it.
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
              {mode === "create" &&
                email.length > 0 &&
                !isPlausibleEmail(email) && (
                  <p className="cy-mono text-[10px] text-[color:var(--cy-magenta)]">
                    Enter a valid email address.
                  </p>
                )}
              <Label htmlFor="sync-pw">Password</Label>
              <Input
                id="sync-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "create" && (
                <p className="cy-mono text-[10px] text-[color:var(--cy-muted)]">
                  This password protects your encryption key; choose a strong
                  one.
                </p>
              )}
              {mode === "create" && (
                <>
                  <Label htmlFor="sync-pw2">Confirm password</Label>
                  <Input
                    id="sync-pw2"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  {confirmPassword.length > 0 &&
                    password !== confirmPassword && (
                      <p className="cy-mono text-[10px] text-[color:var(--cy-magenta)]">
                        Passwords do not match.
                      </p>
                    )}
                </>
              )}
              <Button
                className="cy-btn justify-start"
                disabled={
                  busy ||
                  (mode === "create" ? !isPlausibleEmail(email) : !email) ||
                  !password ||
                  (mode === "create" && password !== confirmPassword)
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
  );
};
