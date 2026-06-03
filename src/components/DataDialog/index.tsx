"use client";

import { useRef, useState } from "react";
import type { ImportPreview } from "@/lib/storage";
import { isStorageError } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CyberFrame } from "@/components/CyberFrame";

import type { DataDialogProps } from "./types";

export * from "./types";

type Stage =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "confirm"; file: File; preview: ImportPreview }
  | { kind: "importing" }
  | { kind: "error"; message: string };

const friendlyError = (error: unknown): string => {
  if (isStorageError(error) && error.code === "IMPORT_INVALID") {
    return "That file isn't a valid tuxbank backup (or it was made by a different version).";
  }
  return "Something went wrong. Please try again.";
};

const DataDialog = ({
  open,
  currentEventCount,
  currentCategoryCount,
  storageAvailable,
  onExport,
  onPreviewImport,
  onCommitImport,
  onOpenChange,
}: DataDialogProps) => {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => setStage({ kind: "idle" });

  const handleExport = async () => {
    try {
      await onExport();
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

  const handleFile = async (file: File) => {
    setStage({ kind: "validating" });
    try {
      const preview = await onPreviewImport(file);
      setStage({ kind: "confirm", file, preview });
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

  const handleConfirm = async (file: File) => {
    setStage({ kind: "importing" });
    try {
      await onCommitImport(file);
      reset();
      onOpenChange(false);
    } catch (error) {
      setStage({ kind: "error", message: friendlyError(error) });
    }
  };

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
            Data
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
              Download a full backup of your database ({currentEventCount}{" "}
              events, {currentCategoryCount} categories).
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
              aria-label="Import database file"
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
              disabled={
                !storageAvailable ||
                stage.kind === "validating" ||
                stage.kind === "importing" ||
                stage.kind === "confirm"
              }
              onClick={() => inputRef.current?.click()}
            >
              ◢ IMPORT DATABASE
            </Button>
          </section>

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
                categories)? This cannot be undone.
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
      </DialogContent>
    </Dialog>
  );
};

export default DataDialog;
