"use client";

import { useState } from "react";
import type { Category, CategoryColor } from "@/types";
import { NEON_HEX, categoryKey } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const PALETTE: CategoryColor[] = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "orange",
];

type CategoryComboboxProps = {
  categories: readonly Category[];
  value: string; // selected categoryId, "" if none
  onChange: (categoryId: string) => void;
  onCreateCategory: (
    name: string,
    color: CategoryColor,
  ) => Promise<Category> | Category;
};

const Dot = ({ color }: { color: CategoryColor }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    style={{
      background: NEON_HEX[color],
      boxShadow: `0 0 6px ${NEON_HEX[color]}`,
    }}
  />
);

const CategoryCombobox = ({
  categories,
  value,
  onChange,
  onCreateCategory,
}: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newColor, setNewColor] = useState<CategoryColor>("cyan");

  const selected = categories.find((c) => c.id === value);
  const q = query.trim();
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()),
  );
  const hasExact = categories.some((c) => c.id === categoryKey(q));
  const showCreate = q.length > 0 && !hasExact;

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const create = async () => {
    const category = await onCreateCategory(q, newColor);
    choose(category.id);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setNewColor("cyan");
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Category"
          className="cy-btn flex items-center gap-2 px-3 py-2 text-sm"
        >
          {selected ? (
            <>
              <Dot color={selected.color} />
              {selected.name}
            </>
          ) : (
            <span className="text-[color:var(--cy-muted)]">
              Select category…
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="cy-dialog w-64 border-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => choose(c.id)}
                >
                  <Dot color={c.color} /> {c.name}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem value={`__create__${q}`} onSelect={create}>
                  <Dot color={newColor} /> Create &quot;{q}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          {showCreate && (
            <div className="flex items-center gap-2 border-t border-[color:var(--cy-line)] p-2">
              <span className="cy-mono text-[10px] uppercase text-[color:var(--cy-muted)]">
                Color
              </span>
              {PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setNewColor(color)}
                  className="rounded-full p-0.5"
                  style={{
                    outline:
                      newColor === color
                        ? `2px solid ${NEON_HEX[color]}`
                        : "none",
                  }}
                >
                  <Dot color={color} />
                </button>
              ))}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
