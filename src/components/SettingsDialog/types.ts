import type { CategoriesSettingsProps } from "@/components/CategoriesSettings";
import type { DataSettingsProps } from "@/components/DataSettings";

export type SettingsTab = "sync" | "data" | "categories" | "display";

export type SettingsDialogProps = {
  open: boolean;
  /**
   * Active tab. `null` means "no section picked yet": compact screens show
   * the root menu, wide screens fall back to the default tab.
   */
  tab: SettingsTab | null;
  onTabChange: (tab: SettingsTab | null) => void;
  onOpenChange: (open: boolean) => void;
  /** Props for the Data pane; its onClose is wired to close this dialog. */
  data: Omit<DataSettingsProps, "onClose">;
  categories: CategoriesSettingsProps;
};
