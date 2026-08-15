import type { Category } from "@/types";
import type { EventInput } from "@/lib/recurrence";

export type QuickAddBarProps = {
  categories: readonly Category[];
  todayISO: string;
  /** A successful parse; the caller opens the event editor prefilled with it. */
  onParsed: (input: EventInput) => void;
};
