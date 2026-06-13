import { useEffect } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { eventFormSchema, toEventInput, type EventFormValues } from "./schema";
import CategoryCombobox from "@/components/CategoryCombobox";
import { CyberFrame } from "@/components/CyberFrame";
import { CyControlFrame } from "@/components/CyControlFrame";

import type { EventDialogProps } from "./types";

export * from "./types";

const buildDefaults = (props: EventDialogProps): EventFormValues => {
  const { mode, defaultDate, initialOccurrence, sourceEvent, categories } =
    props;
  if (mode === "edit" && initialOccurrence && sourceEvent) {
    return {
      title: initialOccurrence.title,
      // anchor date, not the clicked occurrence — so whole-series ("all") edits don't shift the series
      date: sourceEvent.date,
      categoryId: initialOccurrence.category.id,
      // resolved occurrence values (carry any per-occurrence patch), not the series base
      amount: initialOccurrence.amount,
      direction: initialOccurrence.direction,
      notes: initialOccurrence.notes ?? "",
      repeat: sourceEvent.recurrence?.freq ?? "none",
      interval: sourceEvent.recurrence?.interval ?? 1,
      endsOn: sourceEvent.recurrence?.endsOn ?? "",
    };
  }
  return {
    title: "",
    date: defaultDate,
    categoryId: categories[0]?.id ?? "",
    amount: 0,
    direction: "withdrawal",
    notes: "",
    repeat: "none",
    interval: 1,
    endsOn: "",
  };
};

const EventDialog = (props: EventDialogProps) => {
  const {
    open,
    mode,
    categories,
    sourceEvent,
    onOpenChange,
    onSubmit,
    onDelete,
    onCreateCategory,
  } = props;
  const form = useForm<EventFormValues>({
    // zodResolver with z.coerce.number() infers input as unknown for interval;
    // cast to the output type since the resolver correctly coerces at validation time.
    resolver: zodResolver(eventFormSchema) as Resolver<EventFormValues>,
    defaultValues: buildDefaults(props),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (open) reset(buildDefaults(props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const repeat = useWatch({ control, name: "repeat" });
  const categoryId = useWatch({ control, name: "categoryId" });
  // Per TRD: per-occurrence date moves are out of scope; lock the date when editing a recurring event.
  const lockDate = mode === "edit" && Boolean(sourceEvent?.recurrence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* grid-rows clamp: DialogContent is a grid, and without it the auto row
          sizes to content, ignoring max-h — the body wrapper could never shrink
          and overflow-y-auto would never engage. */}
      <DialogContent className="cy-dialog max-h-[85dvh] grid-rows-[minmax(0,1fr)_auto] border-0 sm:max-w-md">
        <CyberFrame />
        <div className="grid min-h-0 gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="cy-display uppercase tracking-wide">
              {mode === "create" ? "New Event" : "Edit Event"}
            </DialogTitle>
          </DialogHeader>

          <form
            id="event-form"
            className="flex flex-col gap-3"
            onSubmit={handleSubmit((v) => onSubmit(toEventInput(v)))}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register("title")} />
              {errors.title && (
                <p className="text-xs text-[color:var(--cy-magenta)]">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                disabled={lockDate}
                {...register("date")}
              />
              {errors.date && (
                <p className="text-xs text-[color:var(--cy-magenta)]">
                  {errors.date.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="categoryId">Category</Label>
              <CategoryCombobox
                categories={categories}
                value={categoryId}
                onChange={(id) =>
                  setValue("categoryId", id, { shouldValidate: true })
                }
                onCreateCategory={onCreateCategory}
              />
              {errors.categoryId && (
                <p className="text-xs text-[color:var(--cy-magenta)]">
                  {errors.categoryId.message}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min={0}
                  {...register("amount")}
                />
                {errors.amount && (
                  <p className="text-xs text-[color:var(--cy-magenta)]">
                    {errors.amount.message}
                  </p>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="direction">Type</Label>
                <CyControlFrame>
                  <select
                    id="direction"
                    className="cy-btn px-3 py-2 text-sm"
                    {...register("direction")}
                  >
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                </CyControlFrame>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} {...register("notes")} />
            </div>

            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="repeat">Repeat</Label>
                <CyControlFrame>
                  <select
                    id="repeat"
                    className="cy-btn px-3 py-2 text-sm"
                    {...register("repeat")}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </CyControlFrame>
              </div>
              {repeat !== "none" && (
                <>
                  <div className="flex w-20 flex-col gap-1">
                    <Label htmlFor="interval">Every</Label>
                    <Input
                      id="interval"
                      type="number"
                      min={1}
                      {...register("interval")}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="endsOn">Until</Label>
                    <Input id="endsOn" type="date" {...register("endsOn")} />
                  </div>
                </>
              )}
            </div>
            {errors.interval && (
              <p className="text-xs text-[color:var(--cy-magenta)]">
                {errors.interval.message}
              </p>
            )}
            {errors.endsOn && (
              <p className="text-xs text-[color:var(--cy-magenta)]">
                {errors.endsOn.message}
              </p>
            )}
          </form>
        </div>
        <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
          {mode === "edit" ? (
            <Button
              type="button"
              variant="ghost"
              className="text-[color:var(--cy-magenta)]"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="event-form" className="cy-cta">
            Save ▸
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
