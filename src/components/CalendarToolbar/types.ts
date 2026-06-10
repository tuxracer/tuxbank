import type { Category } from "@/types";

export type CalendarToolbarProps = {
  selectedYear: number;
  selectedMonth: number;
  minYear: number;
  maxYear: number;
  usedCategories: Category[];
  activeCategoryIds: Set<string>;
  onSelectMonth: (monthIndex: number) => void;
  onSelectYear: (year: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleCategory: (id: string) => void;
  onManageCategories: () => void;
  onManageData: () => void;
  onSync?: () => void;
  onNewEvent: () => void;
};
