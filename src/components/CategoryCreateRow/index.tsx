import { useCallback, useState } from "react";
import type { Category } from "@/types";
import { categoryKey } from "@/types";
import { DEFAULT_CATEGORY_COLOR } from "@/utils/categoryColor";

import type { UseCategorySearch } from "./types";

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
