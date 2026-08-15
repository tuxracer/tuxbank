import type {
  Category,
  CategoryColor,
  Occurrence,
  CalendarEvent,
} from "@/types";
import type { EventInput } from "@/lib/recurrence";

export type EventDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  categories: readonly Category[];
  defaultDate: string;
  /** Create mode only: opens the form prefilled (e.g. from quick add) for the user to confirm. */
  prefill?: EventInput;
  initialOccurrence?: Occurrence;
  sourceEvent?: CalendarEvent;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: EventInput) => void;
  onDelete: () => void;
  onCreateCategory: (
    name: string,
    color: CategoryColor,
  ) => Promise<Category> | Category;
};
