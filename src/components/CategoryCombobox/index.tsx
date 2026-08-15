import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  const choose = (id: string | null) => {
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="cy-btn justify-start gap-2 text-sm"
        >
          {selected ? (
            <>
              <CategoryDot color={selected.color} />
              {selected.name}
            </>
          ) : (
            <span className="text-[color:var(--cy-muted)]">No category</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="cy-dialog w-64 border-0 p-0">
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
              {query.trim() === "" && (
                <CommandItem value="__none__" onSelect={() => choose(null)}>
                  {/* hollow dot: the uncategorized state has no color of its own */}
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[color:var(--cy-muted)]" />{" "}
                  No category
                </CommandItem>
              )}
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
