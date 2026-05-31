import type { EditScope } from "@/context/CalendarContext";

export type RecurrenceScopeDialogProps = {
  open: boolean;
  action: "edit" | "delete";
  onConfirm: (scope: EditScope) => void;
  onOpenChange: (open: boolean) => void;
};
