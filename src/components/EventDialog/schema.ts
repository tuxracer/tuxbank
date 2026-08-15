import { z } from "zod";
import type { EventInput } from "@/lib/recurrence";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    date: z.string().regex(ISO_DATE, "Pick a date"),
    categoryId: z.string().nullable(),
    repeat: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
    interval: z.coerce.number().int().min(1, "Must be at least 1"),
    endsOn: z.string().regex(ISO_DATE).optional().or(z.literal("")),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    direction: z.enum(["deposit", "withdrawal"]),
  })
  // A stale endsOn can survive in form state after the Until input unmounts
  // (switching repeat back to "none" keeps registered values), so only enforce
  // the ordering while the field is actually in play.
  .refine((v) => v.repeat === "none" || !v.endsOn || v.endsOn >= v.date, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

export const toEventInput = (v: EventFormValues): EventInput => ({
  title: v.title.trim(),
  date: v.date,
  categoryId: v.categoryId,
  amount: v.amount,
  direction: v.direction,
  recurrence:
    v.repeat === "none"
      ? null
      : {
          freq: v.repeat,
          interval: v.interval,
          endsOn: v.endsOn ? v.endsOn : null,
        },
});
