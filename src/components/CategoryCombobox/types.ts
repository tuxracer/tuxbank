import type { Category, CategoryColor } from "@/types";

export type CategoryComboboxProps = {
  categories: readonly Category[];
  value: string | null; // selected categoryId, null = no category
  onChange: (categoryId: string | null) => void;
  onCreateCategory: (
    name: string,
    color: CategoryColor,
  ) => Promise<Category> | Category;
};
