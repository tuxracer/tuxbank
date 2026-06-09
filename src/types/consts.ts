import type { Category } from "./index";

// The Unix epoch: these categories are synthetic and never persisted or synced,
// so the value only needs to satisfy the Category type.
const SYNTHETIC_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export const PRESET_CATEGORIES: readonly Category[] = [
  { id: "work", name: "Work", color: "cyan", updatedAt: SYNTHETIC_UPDATED_AT },
  {
    id: "personal",
    name: "Personal",
    color: "magenta",
    updatedAt: SYNTHETIC_UPDATED_AT,
  },
  {
    id: "health",
    name: "Health",
    color: "green",
    updatedAt: SYNTHETIC_UPDATED_AT,
  },
  {
    id: "finance",
    name: "Finance",
    color: "yellow",
    updatedAt: SYNTHETIC_UPDATED_AT,
  },
  {
    id: "social",
    name: "Social",
    color: "orange",
    updatedAt: SYNTHETIC_UPDATED_AT,
  },
];

export const UNKNOWN_CATEGORY: Category = {
  id: "unknown",
  name: "Uncategorized",
  color: "cyan",
  updatedAt: SYNTHETIC_UPDATED_AT,
};
