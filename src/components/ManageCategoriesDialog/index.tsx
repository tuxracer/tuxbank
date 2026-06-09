import { useState } from "react";
import { categoryKey } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CyberFrame } from "@/components/CyberFrame";
import { CategoryColorPicker } from "@/components/CategoryColorPicker";
import {
  CategoryCreateRow,
  useCategorySearch,
} from "@/components/CategoryCreateRow";

import type { ManageCategoriesDialogProps } from "./types";

export * from "./types";

const ManageCategoriesDialog = ({
  open,
  categories,
  usageCountById,
  onRename,
  onRecolor,
  onDelete,
  onCreate,
  onOpenChange,
}: ManageCategoriesDialogProps) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = categories.find((c) => c.id === confirmId);
  const [renameError, setRenameError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const {
    query,
    setQuery,
    filtered,
    showCreate,
    newColor,
    setNewColor,
    reset,
  } = useCategorySearch(categories);

  const handleCreate = () => {
    onCreate(query.trim(), newColor);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmId(null);
          setRenameError(null);
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <CyberFrame />
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            Manage Categories
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search or create…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRenameError(null);
          }}
        />

        {categories.length === 0 && (
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
            No categories yet.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) {
                      const collides = categories.some(
                        (o) =>
                          o.id !== c.id &&
                          categoryKey(o.name) === categoryKey(v),
                      );
                      if (collides) {
                        setRenameError({
                          id: c.id,
                          message: `A category named "${v}" already exists.`,
                        });
                        e.target.value = c.name;
                      } else {
                        setRenameError(null);
                        onRename(c.id, v);
                      }
                    }
                  }}
                />
                <CategoryColorPicker
                  value={c.color}
                  onChange={(color) => onRecolor(c.id, color)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[color:var(--cy-magenta)]"
                  onClick={() => setConfirmId(c.id)}
                >
                  Delete
                </Button>
              </div>
              {renameError?.id === c.id && (
                <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
                  {renameError.message}
                </p>
              )}
            </div>
          ))}
        </div>

        {showCreate && (
          <CategoryCreateRow
            query={query.trim()}
            color={newColor}
            onPickColor={setNewColor}
            onCreate={handleCreate}
          />
        )}

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
