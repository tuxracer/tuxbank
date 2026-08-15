import type { EditScope } from "@/context/CalendarContext";

export type RecurrenceScopeDialogProps = {
  open: boolean;
  action: "edit" | "delete" | "move";
  /**
   * Whether the "this event" scope is offered. An edit that changes the
   * recurrence rule can't apply to a single occurrence, so the dialog hides
   * the option instead of silently discarding part of the submitted form.
   */
  allowThis?: boolean;
  onConfirm: (scope: EditScope) => void;
  onOpenChange: (open: boolean) => void;
};
