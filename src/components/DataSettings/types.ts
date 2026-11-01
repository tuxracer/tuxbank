import type { ImportPreview } from "@/lib/storage";

export type DataSettingsProps = {
  currentEventCount: number;
  currentCategoryCount: number;
  storageAvailable: boolean;
  /** Whether import and reset also rewrite the signed-in account's cloud data. */
  includesCloud: boolean;
  /** Download a backup under the resolved filename (extension included). */
  onExport: (filename: string) => Promise<void>;
  onPreviewImport: (file: File) => Promise<ImportPreview>;
  onCommitImport: (file: File) => Promise<void>;
  onClearAllData: () => Promise<void>;
  /** Called after a completed import or reset, to dismiss the settings dialog. */
  onClose: () => void;
};
