import type { Category, Recurrence, TransactionDirection } from "@/types";

export type CategoryResolver = (categoryId: string | null) => Category;

/** Fields a create/edit form produces (no id/timestamps/overrides). */
export type EventInput = {
  title: string;
  date: string;
  categoryId: string | null;
  amount: number;
  direction: TransactionDirection;
  recurrence: Recurrence | null;
};
