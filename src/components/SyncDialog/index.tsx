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
import { toast } from "sonner";
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
  EMAIL_NOT_CONFIRMED:
    "Confirm your email (check your inbox), then sign in to finish setup.",
  MFA_VERIFY_FAILED: "That code did not match. Try again.",
  MFA_ENROLL_FAILED: "Could not start 2FA enrollment.",
  NO_KEY_MATERIAL: "No encrypted data found for this account.",
  KEY_MATERIAL_FAILED: "Could not reach the encrypted store.",
  NOT_CONFIGURED: "Sync is not configured.",
  PASSWORD_CHANGE_FAILED: "Could not change your password. Please try again.",
  RECOVERY_FAILED: "Could not recover. Check your recovery key and try again.",
};

const errorText = (code: string): string => ERROR_TEXT[code] ?? code;

/** Renders a sync timestamp in the viewer's local time zone. */
const SYNC_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const SyncDialog = ({ open, onOpenChange }: SyncDialogProps) => {
  const sync = useSync();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [awaitingReauth, setAwaitingReauth] = useState(false);
  const [reauthCode, setReauthCode] = useState("");

  const reset = () => {
    setMode("choose");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setBusy(false);
    setChangingPw(false);
    setRecovering(false);
    setRecoveryKeyInput("");
    setAwaitingReauth(false);
    setReauthCode("");
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

          {/* REAUTH: emailed code to finish a Secure password change */}
          {awaitingReauth && (
            <section className="flex flex-col gap-3">
              <p className="cy-mono text-xs">
                We emailed you a confirmation code to finish changing your
                password. Enter it below.
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

          {/* SYNCED / SYNCING / ERROR (all post-onboarding, account active) */}
          {(sync.status === "synced" ||
            sync.status === "syncing" ||
            sync.status === "error") &&
            sync.step === "idle" &&
            !changingPw && (
              <section className="flex flex-col gap-3">
                <p className="cy-mono text-xs">
                  Signed in as <span className="cy-hud on">{sync.email}</span>
                </p>
                <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
                  {sync.status === "syncing"
                    ? "Syncing…"
                    : sync.status === "error"
                      ? "Sync failed. Retry below."
                      : sync.lastSyncedAt
                        ? `Last sync ${SYNC_TIME_FORMAT.format(new Date(sync.lastSyncedAt))}`
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
                  onClick={() => {
                    setPassword("");
                    setConfirmPassword("");
                    setChangingPw(true);
                  }}
                >
                  Change password
                </Button>
                <Button variant="ghost" onClick={() => void sync.signOut()}>
                  Sign out
                </Button>
              </section>
            )}

          {/* CHANGE PASSWORD (from the synced state) */}
          {(sync.status === "synced" ||
            sync.status === "syncing" ||
            sync.status === "error") &&
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
                {passwordTooShort && (
                  <p className="cy-mono text-[10px] text-[color:var(--cy-muted)]">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                )}
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="cy-mono text-[10px] text-[color:var(--cy-magenta)]">
                    Passwords do not match.
                  </p>
                )}
                <Button
                  className="cy-btn justify-start"
                  disabled={
                    busy || passwordTooShort || password !== confirmPassword
                  }
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

          {/* LOCKED: session exists, need password to unlock the key */}
          {sync.status === "locked" && !recovering && (
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
              <Button variant="ghost" onClick={() => void sync.signOut()}>
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
                  passwordTooShort ||
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
                Scan this with an authenticator app, then enter the 6-digit
                code.
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
                      !email ||
                      !password ||
                      (mode === "create" &&
                        (passwordTooShort || password !== confirmPassword))
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
