"use client";

import { useState } from "react";
import type { Category, CategoryColor } from "@/types";
import { NEON_HEX } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PALETTE: CategoryColor[] = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "orange",
];

type ManageCategoriesDialogProps = {
  open: boolean;
  categories: readonly Category[];
  usageCountById: Record<string, number>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: CategoryColor) => void;
  onDelete: (id: string) => void;
  onOpenChange: (open: boolean) => void;
};

const ManageCategoriesDialog = ({
  open,
  categories,
  usageCountById,
  onRename,
  onRecolor,
  onDelete,
  onOpenChange,
}: ManageCategoriesDialogProps) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = categories.find((c) => c.id === confirmId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            Manage Categories
          </DialogTitle>
        </DialogHeader>

        {categories.length === 0 && (
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
            No categories yet.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input
                defaultValue={c.name}
                aria-label={`Name for ${c.name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) onRename(c.id, v);
                }}
              />
              <div className="flex items-center gap-1">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => onRecolor(c.id, color)}
                    className="rounded-full p-0.5"
                    style={{
                      outline:
                        c.color === color
                          ? `2px solid ${NEON_HEX[color]}`
                          : "none",
                    }}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{
                        background: NEON_HEX[color],
                        boxShadow: `0 0 6px ${NEON_HEX[color]}`,
                      }}
                    />
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Delete ${c.name}`}
                className="text-[color:var(--cy-magenta)]"
                onClick={() => setConfirmId(c.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>

        {confirming && (
          <div className="cy-mono mt-2 flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-2 text-xs">
            <span>
              {usageCountById[confirming.id] ?? 0} events use &quot;
              {confirming.name}&quot;. They&apos;ll become Uncategorized.
            </span>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="text-[color:var(--cy-magenta)]"
                onClick={() => {
                  onDelete(confirming.id);
                  setConfirmId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManageCategoriesDialog;
