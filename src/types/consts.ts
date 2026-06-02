import type { Category } from "./index";

export const PRESET_CATEGORIES: readonly Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "personal", name: "Personal", color: "magenta" },
  { id: "health", name: "Health", color: "green" },
  { id: "finance", name: "Finance", color: "yellow" },
  { id: "social", name: "Social", color: "orange" },
];

export const UNKNOWN_CATEGORY: Category = {
  id: "unknown",
  name: "Uncategorized",
  color: "cyan",
};
