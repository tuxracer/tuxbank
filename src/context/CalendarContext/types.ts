import type {
  CalendarEvent,
  Category,
  CategoryColor,
  Occurrence,
} from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import type { EventInput } from "@/lib/recurrence";
import type { ImportPreview } from "@/lib/storage";

export type EditScope = "this" | "following" | "all";

export type CalendarContextValue = {
  visibleMonth: Date;
  yearRange: { min: number; max: number };
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
  /** Storage failed because the database can't be opened; deleting it can recover. */
  storageResettable: boolean;
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
  moveEvent: (
    occurrence: Occurrence,
    toDate: string,
    scope: EditScope,
  ) => Promise<() => Promise<void>>;
  createCategory: (name: string, color: CategoryColor) => Promise<Category>;
  updateCategory: (
    id: string,
    patch: { name?: string; color?: CategoryColor },
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  exportData: () => Promise<void>;
  previewImport: (file: File) => Promise<ImportPreview>;
  importData: (file: File) => Promise<void>;
  /** Delete every event and category (tombstoned, so it also clears the cloud). */
  clearAllData: () => Promise<void>;
  /** Delete the whole local database to recover from an unopenable one. */
  resetLocalData: () => Promise<void>;
  /** Re-read events + categories from storage (used after a sync pulls). */
  refreshFromStorage: () => Promise<void>;
};
