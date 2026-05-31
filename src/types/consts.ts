import type { Category, CategoryColor } from "./index";

export const PRESET_CATEGORIES: readonly Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "personal", name: "Personal", color: "magenta" },
  { id: "health", name: "Health", color: "green" },
  { id: "finance", name: "Finance", color: "yellow" },
  { id: "social", name: "Social", color: "orange" },
];

/** Neon hex per category color, used for chip accents/glow (inline styles). */
export const NEON_HEX: Record<CategoryColor, string> = {
  cyan: "#00f0ff",
  magenta: "#ff2a6d",
  yellow: "#fcee0a",
  green: "#00ff9f",
  orange: "#ff9f1c",
};

export const UNKNOWN_CATEGORY: Category = {
  id: "unknown",
  name: "Uncategorized",
  color: "cyan",
};
