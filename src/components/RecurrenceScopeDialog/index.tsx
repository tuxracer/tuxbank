"use client";

import { useState } from "react";
import type { EditScope } from "@/context/CalendarContext";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CyberFrame } from "@/components/CyberFrame";

import { OPTIONS } from "./consts";
import type { RecurrenceScopeDialogProps } from "./types";

export * from "./consts";
export * from "./types";

const RecurrenceScopeDialog = ({
  open,
  action,
  onConfirm,
  onOpenChange,
}: RecurrenceScopeDialogProps) => {
  const [scope, setScope] = useState<EditScope>("this");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cy-dialog border-0 sm:max-w-sm">
        <CyberFrame />
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            {action === "edit"
              ? "Edit recurring event"
              : "Delete recurring event"}
          </DialogTitle>
        </DialogHeader>

        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as EditScope)}
          className="flex flex-col gap-2 py-2"
        >
          {OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-3">
              <RadioGroupItem id={`scope-${o.value}`} value={o.value} />
              <Label htmlFor={`scope-${o.value}`}>{o.label}</Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="cy-cta"
            onClick={() => onConfirm(scope)}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecurrenceScopeDialog;
