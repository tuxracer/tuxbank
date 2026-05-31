import type {
  CalendarEvent,
  Category,
  CategoryColor,
  Occurrence,
} from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import type { EventInput } from "@/lib/recurrence";

export type EditScope = "this" | "following" | "all";

export type CalendarContextValue = {
  visibleMonth: Date;
  monthLabel: string;
  cells: DateCell[];
  todayISO: string;
  events: CalendarEvent[];
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate: Record<string, number>;
  categories: readonly Category[];
  usedCategories: Category[];
  categoryUsageCount: Record<string, number>;
  activeCategoryIds: Set<string>;
  storageAvailable: boolean;
  storageLocked: boolean;
  loaded: boolean;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  goToDate: (date: Date) => void;
  toggleCategory: (id: string) => void;
  createEvent: (input: EventInput) => Promise<void>;
  updateEvent: (
    id: string,
    input: EventInput,
    scope: EditScope,
    occurrenceDate: string,
  ) => Promise<void>;
  deleteEvent: (
    id: string,
    scope: EditScope,
    occurrenceDate: string,
  ) => Promise<void>;
  createCategory: (name: string, color: CategoryColor) => Promise<Category>;
  updateCategory: (
    id: string,
    patch: { name?: string; color?: CategoryColor },
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
};
