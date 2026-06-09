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

          {/* SYNCED / SYNCING / ERROR (all post-onboarding, account active) */}
          {(sync.status === "synced" ||
            sync.status === "syncing" ||
            sync.status === "error") &&
            sync.step === "idle" && (
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
                <Button variant="ghost" onClick={() => void sync.signOut()}>
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
