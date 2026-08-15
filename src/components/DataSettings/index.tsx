import { useRef, useState } from "react";
import type { ImportPreview } from "@/lib/storage";
import { isStorageError } from "@/lib/storage";
import { trackEvent } from "@/lib/analytics";
import { errorCode } from "@/utils/errorCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { DataSettingsProps } from "./types";

export * from "./types";

/** The exact word the user must type to confirm a full reset. */
const RESET_WORD = "reset";

type Stage =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "confirm"; file: File; preview: ImportPreview }
  | { kind: "importing" }
  | { kind: "resetConfirm" }
  | { kind: "resetting" }
  | { kind: "error"; message: string };

/** Which of the pane's actions failed, for the `data-error` event. */
type DataAction = "export" | "preview-import" | "import" | "clear";

const friendlyError = (error: unknown): string => {
  if (isStorageError(error) && error.code === "IMPORT_INVALID") {
    return "That file isn't a valid tuxbank backup (or it was made by a different version).";
  }
  return "Something went wrong. Please try again.";
};

/**
 * The Data pane of the settings dialog. Flow state is local, so mounting
 * fresh (the settings dialog unmounts panes on close and on tab switches)
 * always starts idle.
 */
const DataSettings = ({
  currentEventCount,
  currentCategoryCount,
  storageAvailable,
  includesCloud,
  onExport,
  onPreviewImport,
  onCommitImport,
  onClearAllData,
  onClose,
}: DataSettingsProps) => {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [resetText, setResetText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // A flow is in progress whenever we are not idle and not showing an error
  // the user can retry from; only one flow (import or reset) runs at a time.
  const flowBusy = stage.kind !== "idle" && stage.kind !== "error";
  const resetConfirmed = resetText.trim().toLowerCase() === RESET_WORD;

  const reset = () => {
    setStage({ kind: "idle" });
    setResetText("");
  };

  // Every failure here leaves the user without the backup, restore, or reset
  // they asked for, so each one is reported with the action that produced it.
  const fail = (action: DataAction, error: unknown) => {
    trackEvent("data-error", { action, code: errorCode(error) });
    setStage({ kind: "error", message: friendlyError(error) });
  };

  const handleExport = async () => {
    try {
      await onExport();
      trackEvent("data-exported");
    } catch (error) {
      fail("export", error);
    }
  };

  const handleFile = async (file: File) => {
    setStage({ kind: "validating" });
    try {
      const preview = await onPreviewImport(file);
      setStage({ kind: "confirm", file, preview });
    } catch (error) {
      fail("preview-import", error);
    }
  };

  const handleConfirm = async (file: File) => {
    setStage({ kind: "importing" });
    try {
      await onCommitImport(file);
      // `synced` distinguishes a device-local replace from one that rewrites
      // the account's data on every device.
      trackEvent("data-imported", { synced: includesCloud });
      reset();
      onClose();
    } catch (error) {
      fail("import", error);
    }
  };

  const startReset = () => {
    setResetText("");
    setStage({ kind: "resetConfirm" });
  };

  const handleReset = async () => {
    const scope = includesCloud
      ? "on this device and in your account, on every device signed into it"
      : "on this device";
    const gone = `Are you sure you want to delete all ${currentEventCount} events and ${currentCategoryCount} categories ${scope}? This cannot be undone.`;
    if (!window.confirm(gone)) return;
    setStage({ kind: "resetting" });
    try {
      await onClearAllData();
      trackEvent("data-cleared", { synced: includesCloud });
      reset();
      onClose();
    } catch (error) {
      fail("clear", error);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Download a full backup of your database ({currentEventCount} events,{" "}
          {currentCategoryCount} categories).
        </p>
        <Button
          type="button"
          className="cy-btn justify-start"
          disabled={!storageAvailable}
          onClick={handleExport}
        >
          ◢ EXPORT DATABASE
        </Button>
      </section>

      <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Restore from a backup file. This replaces all current data.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          data-testid="import-database-file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          className="cy-btn justify-start"
          disabled={!storageAvailable || flowBusy}
          onClick={() => inputRef.current?.click()}
        >
          ◢ IMPORT DATABASE
        </Button>
      </section>

      <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Permanently delete all events and categories. This cannot be undone.
        </p>
        <Button
          type="button"
          className="cy-btn justify-start text-[color:var(--cy-magenta)]"
          disabled={!storageAvailable || flowBusy}
          onClick={startReset}
        >
          ◢ CLEAR ALL DATA
        </Button>
      </section>

      {stage.kind === "resetConfirm" && (
        <div className="cy-mono flex flex-col gap-2 border-t border-[color:var(--cy-magenta)] pt-3 text-xs">
          <span>
            Type <span className="text-[color:var(--cy-magenta)]">reset</span>{" "}
            to permanently delete all {currentEventCount} events and{" "}
            {currentCategoryCount} categories. This cannot be undone.{" "}
            {includesCloud
              ? "This also deletes your synced data from your account on all devices."
              : "Only data on this device is deleted; your synced account (if any) is not touched."}
          </span>
          <Input
            data-testid="clear-data-confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={RESET_WORD}
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resetConfirmed) void handleReset();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button"
              className="text-[color:var(--cy-magenta)]"
              disabled={!resetConfirmed}
              onClick={() => void handleReset()}
            >
              Reset everything
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "resetting" && (
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Clearing all data…
        </p>
      )}

      {stage.kind === "validating" && (
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Validating backup…
        </p>
      )}

      {stage.kind === "confirm" && (
        <div className="cy-mono flex flex-col gap-2 border-t border-[color:var(--cy-magenta)] pt-3 text-xs">
          <span>
            Replace all current data ({currentEventCount} events,{" "}
            {currentCategoryCount} categories) with this backup (
            {stage.preview.events} events, {stage.preview.categories}{" "}
            categories)? This cannot be undone.{" "}
            {includesCloud
              ? "This replaces your synced data on all devices."
              : "Only this device changes now; your account merges in when you sign in."}
          </span>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button"
              className="text-[color:var(--cy-magenta)]"
              onClick={() => void handleConfirm(stage.file)}
            >
              Replace data
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "importing" && (
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Importing…
        </p>
      )}

      {stage.kind === "error" && (
        <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
          {stage.message}
        </p>
      )}

      {!storageAvailable && (
        <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
          Storage is unavailable — export/import is disabled this session.
        </p>
      )}
    </div>
  );
};

export default DataSettings;
