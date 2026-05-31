import type { Category, Recurrence, TransactionDirection } from "@/types";

export type CategoryResolver = (categoryId: string) => Category;

/** Fields a create/edit form produces (no id/timestamps/overrides). */
export type EventInput = {
  title: string;
  date: string;
  categoryId: string;
  amount: number;
  direction: TransactionDirection;
  notes?: string;
  recurrence: Recurrence | null;
};
