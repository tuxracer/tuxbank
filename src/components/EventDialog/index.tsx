import { useEffect, type CSSProperties } from "react";
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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { eventFormSchema, toEventInput, type EventFormValues } from "./schema";
import CategoryCombobox from "@/components/CategoryCombobox";

import type { EventDialogProps } from "./types";

export * from "./types";

/* Field labels speak in the HUD voice (mono, tracked, muted) so the boxes read
   as the content and the labels as chrome. */
const FIELD_LABEL =
  "font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--cy-muted)]";

const HAIRLINE = "border-t border-[color:var(--cy-hairline)]";

const DIRECTIONS = [
  { value: "withdrawal", sign: "−", label: "Withdrawal" },
  { value: "deposit", sign: "+", label: "Deposit" },
] as const;

/* The active segment borrows the calendar's own selection grammar: a 2px inset
   cyan edge over the raised panel fill (see .cy-cell.selected). Inline styles
   because .cy-btn's unlayered color/background win over Tailwind utilities. */
const SEGMENT_ACTIVE: CSSProperties = {
  background: "var(--cy-panel-2)",
  color: "var(--cy-text-strong)",
  boxShadow: "inset 2px 0 0 var(--cy-cyan)",
};
const SEGMENT_IDLE: CSSProperties = { color: "var(--cy-muted)" };

const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <p className="font-mono text-[11px] text-[color:var(--cy-magenta)]">
      {message}
    </p>
  ) : null;

const buildDefaults = (props: EventDialogProps): EventFormValues => {
  const {
    mode,
    defaultDate,
    initialOccurrence,
    sourceEvent,
    categories,
    prefill,
  } = props;
  if (mode === "create" && prefill) {
    return {
      title: prefill.title,
      date: prefill.date,
      categoryId: prefill.categoryId || (categories[0]?.id ?? ""),
      amount: prefill.amount,
      direction: prefill.direction,
      repeat: prefill.recurrence?.freq ?? "none",
      interval: prefill.recurrence?.interval ?? 1,
      endsOn: prefill.recurrence?.endsOn ?? "",
    };
  }
  if (mode === "edit" && initialOccurrence && sourceEvent) {
    // The stored categoryId (occurrence patch, else the series base), not the
    // resolved initialOccurrence.category.id: a deleted category resolves to
    // the UNKNOWN_CATEGORY sentinel, whose id must never be persisted back.
    const override = sourceEvent.overrides.find(
      (o) => o.occurrenceDate === initialOccurrence.date,
    );
    return {
      title: initialOccurrence.title,
      // anchor date, not the clicked occurrence — so whole-series ("all") edits don't shift the series
      date: sourceEvent.date,
      categoryId: override?.patch?.categoryId ?? sourceEvent.categoryId,
      // resolved occurrence values (carry any per-occurrence patch), not the series base
      amount: initialOccurrence.amount,
      direction: initialOccurrence.direction,
      repeat: sourceEvent.recurrence?.freq ?? "none",
      interval: sourceEvent.recurrence?.interval ?? 1,
      endsOn: sourceEvent.recurrence?.endsOn ?? "",
    };
  }
  return {
    title: "",
    date: defaultDate,
    categoryId: categories[0]?.id ?? "",
    // NaN renders the number input empty (the browser drops the invalid value),
    // so the field opens blank behind its 0.00 placeholder instead of holding a
    // literal 0 the user has to delete. Submitting it blank still fails the
    // schema's positive() check, same as 0 did.
    amount: Number.NaN,
    direction: "withdrawal",
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
  const direction = useWatch({ control, name: "direction" });
  // Per TRD: per-occurrence date moves are out of scope; lock the date when editing a recurring event.
  const lockDate = mode === "edit" && Boolean(sourceEvent?.recurrence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* grid-rows clamp: DialogContent is a grid, and without it the auto row
          sizes to content, ignoring max-h — the body wrapper could never shrink
          and overflow-y-auto would never engage. The body's -mx-1/px-1 pair
          gives the 3px focus ring room inside the scroll box: overflow-y auto
          clips the x axis too, so a full-width input's ring is cut off at both
          edges without it. */}
      <DialogContent className="cy-dialog max-h-[85dvh] grid-rows-[minmax(0,1fr)_auto] border-0 sm:max-w-md">
        <div className="-mx-1 grid min-h-0 gap-4 overflow-y-auto px-1">
          <DialogHeader>
            <DialogTitle className="cy-display uppercase tracking-wide">
              {mode === "create" ? "New Event" : "Edit Event"}
            </DialogTitle>
          </DialogHeader>

          <form
            id="event-form"
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((v) => onSubmit(toEventInput(v)))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title" className={FIELD_LABEL}>
                Title
              </Label>
              <Input
                id="title"
                placeholder="Rent, paycheck, groceries…"
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="date" className={FIELD_LABEL}>
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  className="font-mono"
                  disabled={lockDate}
                  {...register("date")}
                />
                <FieldError message={errors.date?.message} />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="categoryId" className={FIELD_LABEL}>
                  Category
                </Label>
                <CategoryCombobox
                  categories={categories}
                  value={categoryId}
                  onChange={(id) =>
                    setValue("categoryId", id, { shouldValidate: true })
                  }
                  onCreateCategory={onCreateCategory}
                />
                <FieldError message={errors.categoryId?.message} />
              </div>
            </div>

            <div className={cn("flex flex-col gap-1.5 pt-4", HAIRLINE)}>
              <Label htmlFor="amount" className={FIELD_LABEL}>
                Amount
              </Label>
              {/* One fused strip: the direction segments and the amount share
                  borders (-ml-px / -mt-px collapse the doubles) so the sign
                  choice and the figure read as a single instrument. */}
              <div>
                <div className="grid grid-cols-2">
                  {DIRECTIONS.map((d, i) => (
                    <Button
                      key={d.value}
                      type="button"
                      variant="ghost"
                      className={cn("cy-btn text-xs", i > 0 && "-ml-px")}
                      style={
                        direction === d.value ? SEGMENT_ACTIVE : SEGMENT_IDLE
                      }
                      onClick={() => setValue("direction", d.value)}
                    >
                      <span className="font-mono">{d.sign}</span>
                      {d.label}
                    </Button>
                  ))}
                </div>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  className="-mt-px font-mono"
                  {...register("amount")}
                />
              </div>
              <FieldError message={errors.amount?.message} />
            </div>

            <div className={cn("flex gap-3 pt-4", HAIRLINE)}>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="repeat" className={FIELD_LABEL}>
                  Repeat
                </Label>
                <NativeSelect
                  id="repeat"
                  className="cy-btn text-xs"
                  {...register("repeat")}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </NativeSelect>
              </div>
              {repeat !== "none" && (
                <>
                  <div className="flex w-16 flex-col gap-1.5">
                    <Label htmlFor="interval" className={FIELD_LABEL}>
                      Every
                    </Label>
                    <Input
                      id="interval"
                      type="number"
                      min={1}
                      className="font-mono"
                      {...register("interval")}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="endsOn" className={FIELD_LABEL}>
                      Until
                    </Label>
                    <Input
                      id="endsOn"
                      type="date"
                      className="font-mono"
                      {...register("endsOn")}
                    />
                  </div>
                </>
              )}
            </div>
            <FieldError message={errors.interval?.message} />
            <FieldError message={errors.endsOn?.message} />
          </form>
        </div>
        <DialogFooter
          className={cn(
            "flex items-center justify-between pt-4 sm:justify-between",
            HAIRLINE,
          )}
        >
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
