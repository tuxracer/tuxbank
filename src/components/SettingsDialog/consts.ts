import type { AnalyticsEventName } from "@/lib/analytics";
import type { SettingsTab } from "./types";

/** Wide screens land on the first tab when none is picked. */
export const DEFAULT_TAB: SettingsTab = "sync";

/**
 * Rail/menu order, labels, pane titles, and the compact root menu's one-line
 * descriptions.
 */
export const SETTINGS_TABS: readonly {
  id: SettingsTab;
  label: string;
  title: string;
  description: string;
}[] = [
  {
    id: "sync",
    label: "Sync",
    title: "Cloud Sync",
    description: "Account and end-to-end encrypted sync",
  },
  {
    id: "data",
    label: "Data",
    title: "Data",
    description: "Backup, restore, or erase the database",
  },
  {
    id: "categories",
    label: "Categories",
    title: "Categories",
    description: "Create, rename, recolor, delete",
  },
  {
    id: "display",
    label: "Display",
    title: "Display",
    description: "Currency and week start",
  },
];

/**
 * Analytics continuity: viewing a tab reports the same event its standalone
 * dialog used to send on open, so the funnels stay comparable.
 */
export const TAB_OPENED_EVENT: Record<SettingsTab, AnalyticsEventName> = {
  sync: "sync-opened",
  data: "data-opened",
  categories: "categories-opened",
  display: "display-opened",
};
