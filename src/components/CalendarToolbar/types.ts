import type { Category } from "@/types";

export type CalendarToolbarProps = {
  monthLabel: string;
  recordCount: number;
  endBalance: number;
  usedCategories: Category[];
  activeCategoryIds: Set<string>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleCategory: (id: string) => void;
  onManageCategories: () => void;
  onNewEvent: () => void;
};
