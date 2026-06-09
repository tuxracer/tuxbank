import { useCallback, useState } from "react";
import type { Category } from "@/types";
import { categoryKey } from "@/types";
import { DEFAULT_CATEGORY_COLOR } from "@/utils/categoryColor";
import { CategoryDot } from "@/components/CategoryDot";
import { CategoryColorPicker } from "@/components/CategoryColorPicker";

import type { CategoryCreateRowProps, UseCategorySearch } from "./types";

export * from "./types";

export const useCategorySearch = (
  categories: readonly Category[],
): UseCategorySearch => {
  const [query, setQuery] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CATEGORY_COLOR);

  const q = query.trim();
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()),
  );
  const hasExact = categories.some(
    (c) => categoryKey(c.name) === categoryKey(q),
  );
  const showCreate = q.length > 0 && !hasExact;

  const reset = useCallback(() => {
    setQuery("");
    setNewColor(DEFAULT_CATEGORY_COLOR);
  }, []);

  return {
    query,
    setQuery,
    filtered,
    hasExact,
    showCreate,
    newColor,
    setNewColor,
    reset,
  };
};

export const CategoryCreateRow = ({
  query,
  color,
  onPickColor,
  onCreate,
}: CategoryCreateRowProps) => (
  <div className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] p-2">
    <button
      type="button"
      onClick={onCreate}
      className="flex items-center gap-2 text-left text-sm"
    >
      <CategoryDot color={color} /> Create &quot;{query}&quot;
    </button>
    <CategoryColorPicker value={color} onChange={onPickColor} label="Color" />
  </div>
);
