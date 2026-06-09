import type { Category, CategoryColor } from "@/types";

export type UseCategorySearch = {
  query: string;
  setQuery: (query: string) => void;
  filtered: Category[];
  hasExact: boolean;
  showCreate: boolean;
  newColor: CategoryColor;
  setNewColor: (color: CategoryColor) => void;
  reset: () => void;
};

export type CategoryCreateRowProps = {
  query: string;
  color: CategoryColor;
  onPickColor: (color: CategoryColor) => void;
  onCreate: () => void;
};
