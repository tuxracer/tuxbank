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
  /**
   * Whether the "this and following" scope is offered. On the last occurrence
   * of a series nothing follows it, so the split would land on that one
   * occurrence and the option only repeats "this event".
   */
  allowFollowing?: boolean;
  onConfirm: (scope: EditScope) => void;
  onOpenChange: (open: boolean) => void;
};
