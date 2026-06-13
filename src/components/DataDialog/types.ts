import type { ImportPreview } from "@/lib/storage";

export type DataDialogProps = {
  open: boolean;
  currentEventCount: number;
  currentCategoryCount: number;
  storageAvailable: boolean;
  /** Whether import and reset also rewrite the signed-in account's cloud data. */
  includesCloud: boolean;
  onExport: () => Promise<void>;
  onPreviewImport: (file: File) => Promise<ImportPreview>;
  onCommitImport: (file: File) => Promise<void>;
  onClearAllData: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
};
