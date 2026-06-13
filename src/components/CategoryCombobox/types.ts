import type { Category, CategoryColor } from "@/types";

export type CategoryComboboxProps = {
  categories: readonly Category[];
  value: string; // selected categoryId, "" if none
  onChange: (categoryId: string) => void;
  onCreateCategory: (
    name: string,
    color: CategoryColor,
  ) => Promise<Category> | Category;
};
