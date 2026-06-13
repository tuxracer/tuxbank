import { useState } from "react";
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
import { CyberFrame } from "@/components/CyberFrame";
import { CyControlFrame } from "@/components/CyControlFrame";
import { CategoryDot } from "@/components/CategoryDot";
import {
  CategoryCreateRow,
  useCategorySearch,
} from "@/components/CategoryCreateRow";

import type { CategoryComboboxProps } from "./types";

export * from "./types";

const CategoryCombobox = ({
  categories,
  value,
  onChange,
  onCreateCategory,
}: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const {
    query,
    setQuery,
    filtered,
    showCreate,
    newColor,
    setNewColor,
    reset,
  } = useCategorySearch(categories);

  const selected = categories.find((c) => c.id === value);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    reset();
  };

  const create = async () => {
    const category = await onCreateCategory(query.trim(), newColor);
    choose(category.id);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <CyControlFrame>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cy-btn flex items-center gap-2 px-3 py-2 text-sm"
          >
            {selected ? (
              <>
                <CategoryDot color={selected.color} />
                {selected.name}
              </>
            ) : (
              <span className="text-[color:var(--cy-muted)]">
                Select category…
              </span>
            )}
          </button>
        </PopoverTrigger>
      </CyControlFrame>
      <PopoverContent className="cy-dialog w-64 border-0 p-0">
        <CyberFrame />
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && showCreate && filtered.length === 0) {
                e.preventDefault();
                void create();
              }
            }}
          />
          <CommandList>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => choose(c.id)}
                >
                  <CategoryDot color={c.color} /> {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {showCreate && (
            <CategoryCreateRow
              query={query.trim()}
              color={newColor}
              onPickColor={setNewColor}
              onCreate={() => void create()}
            />
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
