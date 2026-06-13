import type { Category, CategoryColor } from "@/types";

export type ManageCategoriesDialogProps = {
  open: boolean;
  categories: readonly Category[];
  usageCountById: Record<string, number>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: CategoryColor) => void;
  onDelete: (id: string) => void;
  onCreate: (name: string, color: CategoryColor) => void;
  onOpenChange: (open: boolean) => void;
};
