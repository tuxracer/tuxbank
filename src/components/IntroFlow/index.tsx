import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCalendar } from "@/context/CalendarContext";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import { trackEvent } from "@/lib/analytics";
import {
  buildIntroPlan,
  DEFAULT_BILL_TITLE,
  DEFAULT_INCOME_TITLE,
  monthlyEquivalent,
  parseAmount,
  type IncomeCadence,
  type IntroAnswers,
} from "@/lib/introPlan";
import { formatCurrency, formatCurrencyWhole } from "@/utils/formatCurrency";
import {
  CADENCE_OPTIONS,
  DEFAULT_CADENCE,
  INTRO_ENTRANCE_MS,
  QUESTION_STEPS,
  SEGMENT_ACTIVE,
  SEGMENT_IDLE,
} from "./consts";
import type { IntroFlowProps, IntroStep } from "./types";

export * from "./consts";
export * from "./types";

/**
 * The one hero-scale control in the flow: the figure the whole screen asks
 * for. `h-auto` opts out of the 32px control row on purpose, the way the
 * landing's Try now button does; every other field stays a standard pill.
 */
const AmountField = ({
  id,
  value,
  currency,
  onChange,
}: {
  id: string;
  value: string;
  currency: string;
  onChange: (raw: string) => void;
}) => (
  <div className="flex items-center gap-3">
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      placeholder="0.00"
      autoFocus
      autoComplete="off"
      enterKeyHint="next"
      className="cy-mono h-auto flex-1 px-4 py-2.5 text-2xl md:text-2xl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <span className="cy-hud">{currency}</span>
  </div>
);

/** A figure read back to the visitor as they type: mono, in the strong ink. */
const Readout = ({ children }: { children: ReactNode }) => (
  <p className="cy-hud min-h-[1.5em]">{children}</p>
);

const Figure = ({ children }: { children: ReactNode }) => (
  <span className="cy-mono text-[color:var(--cy-text-strong)]">{children}</span>
);

/**
 * A question screen's copy: the question set large in the display face over
 * one sentence that says what the answer becomes.
 */
const Question = ({ title, body }: { title: string; body: string }) => (
  <div className="flex flex-col gap-3">
    <h1 className="cy-display text-[clamp(1.9rem,7vw,2.5rem)] leading-[1.05] tracking-[-0.01em] text-[color:var(--cy-text-strong)]">
      {title}
    </h1>
    <p className="max-w-[40ch] text-base text-[color:var(--cy-text)]">{body}</p>
  </div>
);

/**
 * First-run flow, shown once between Try now and the calendar. Three optional
 * questions (today's balance, regular income, the biggest monthly bill) whose
 * answers become real events, so the calendar the visitor lands on already
 * shows their own balance moving rather than an empty month. Answers are kept
 * as typed and only turned into events on the way out, so Back never loses
 * anything and Skip drops exactly one answer.
 */
const IntroFlow = ({ onFinish, leaving = false, onExited }: IntroFlowProps) => {
  const cal = useCalendar();
  const { currency } = useDisplayPreferences();
  const [step, setStep] = useState<IntroStep>("welcome");
  // Which way the last step change went, so the new screen slides in from the
  // side it came from.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [committing, setCommitting] = useState(false);

  const [balanceRaw, setBalanceRaw] = useState("");
  const [incomeTitle, setIncomeTitle] = useState(DEFAULT_INCOME_TITLE);
  const [incomeRaw, setIncomeRaw] = useState("");
  const [cadence, setCadence] = useState<IncomeCadence>(DEFAULT_CADENCE);
  const [incomeDate, setIncomeDate] = useState(cal.todayISO);
  const [billTitle, setBillTitle] = useState(DEFAULT_BILL_TITLE);
  const [billRaw, setBillRaw] = useState("");
  const [billDate, setBillDate] = useState(cal.todayISO);

  const balance = parseAmount(balanceRaw);
  const incomeAmount = parseAmount(incomeRaw);
  const billAmount = parseAmount(billRaw);
  const incomePerMonth =
    incomeAmount === null ? null : monthlyEquivalent(incomeAmount, cadence);

  // The answers as they stand. A blanked title falls back to its default, and
  // a cleared date input to today, so a half-edited field never blocks the
  // step or files an event with no name.
  const answers: IntroAnswers = {
    balance,
    income:
      incomeAmount === null
        ? null
        : {
            title: incomeTitle.trim() || DEFAULT_INCOME_TITLE,
            amount: incomeAmount,
            cadence,
            nextDate: incomeDate || cal.todayISO,
          },
    bill:
      billAmount === null
        ? null
        : {
            title: billTitle.trim() || DEFAULT_BILL_TITLE,
            amount: billAmount,
            nextDate: billDate || cal.todayISO,
          },
  };

  // Writes wait for the stored data to be in hand: a create that raced the
  // initial read would be overwritten when the read landed.
  const busy = committing || !cal.loaded;

  const goTo = (next: IntroStep, dir: "next" | "prev") => {
    setDirection(dir);
    setStep(next);
  };

  /**
   * Turns the answers into categories and events and hands off. Categories
   * are created first so each event can carry the id of the one it names;
   * createCategory returns the existing row when the name is already taken,
   * so a visitor who has been here before gets no duplicate.
   */
  const finish = async (final: IntroAnswers) => {
    setCommitting(true);
    const plan = buildIntroPlan(final, cal.todayISO);
    try {
      const idByName = new Map<string, string>();
      for (const category of plan.categories) {
        const created = await cal.createCategory(category.name, category.color);
        idByName.set(category.name, created.id);
      }
      for (const event of plan.events) {
        await cal.createEvent({
          title: event.title,
          date: event.date,
          categoryId: event.category
            ? (idByName.get(event.category.name) ?? null)
            : null,
          amount: event.amount,
          direction: event.direction,
          recurrence: event.recurrence,
        });
      }
    } finally {
      // Storage failures are reported by the provider (and its banner on the
      // calendar); the flow still hands off so the visitor is never stranded.
      trackEvent("intro-finished", {
        balance: final.balance !== null,
        income: final.income !== null,
        bill: final.bill !== null,
      });
      onFinish({
        balance: final.balance !== null,
        income: final.income !== null,
        bill: final.bill !== null,
        eventCount: plan.events.length,
      });
    }
  };

  const submitBalance = (e: FormEvent) => {
    e.preventDefault();
    goTo("income", "next");
  };
  const submitIncome = (e: FormEvent) => {
    e.preventDefault();
    goTo("bill", "next");
  };
  const submitBill = (e: FormEvent) => {
    e.preventDefault();
    void finish(answers);
  };

  // Skip drops the step's own answer and moves on; on the last step that is
  // the hand-off itself.
  const skipBalance = () => {
    setBalanceRaw("");
    goTo("income", "next");
  };
  const skipIncome = () => {
    setIncomeRaw("");
    goTo("bill", "next");
  };
  const skipBill = () => void finish({ ...answers, bill: null });

  const questionIndex = QUESTION_STEPS.findIndex((s) => s === step);

  const footer = ({
    submitLabel,
    canSubmit,
    onBack,
    onSkip,
  }: {
    submitLabel: string;
    canSubmit: boolean;
    onBack: () => void;
    onSkip: () => void;
  }) => (
    <div className="mt-auto flex flex-col gap-3 pt-8 sm:mt-0">
      {/* Full width on its own row, the way a phone expects its primary
          action; the quiet pills share the row under it so no row mixes two
          control heights. */}
      <Button
        type="submit"
        variant="ghost"
        className="cy-cta h-auto w-full px-6 py-3 text-base"
        disabled={!canSubmit || busy}
      >
        {submitLabel}
      </Button>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          className="cy-btn px-4"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cy-btn px-4"
          onClick={onSkip}
          disabled={busy}
        >
          Skip this
        </Button>
      </div>
    </div>
  );

  const screen = (): ReactNode => {
    switch (step) {
      case "welcome":
        return (
          <div className="flex flex-1 flex-col gap-8 sm:flex-none">
            <Question
              title="Let's set up your month."
              body="Three quick questions, each one optional. Answer what you know and the calendar will already show where your balance is heading. Everything stays on this device."
            />
            <div className="mt-auto flex flex-col gap-3 pt-8 sm:mt-0">
              <Button
                type="button"
                variant="ghost"
                className="cy-cta h-auto w-full px-6 py-3 text-base"
                onClick={() => goTo("balance", "next")}
                disabled={busy}
              >
                Let&apos;s go
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="cy-btn self-center px-4"
                onClick={() =>
                  void finish({ balance: null, income: null, bill: null })
                }
                disabled={busy}
              >
                Skip setup
              </Button>
            </div>
          </div>
        );
      case "balance":
        return (
          <form
            className="flex flex-1 flex-col gap-8 sm:flex-none"
            onSubmit={submitBalance}
          >
            <Question
              title="What's in your account today?"
              body="It goes in as a starting deposit on today's date, so every day after it carries a real balance. Edit or delete it any time."
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intro-balance" className="cy-label">
                Balance today
              </Label>
              <AmountField
                id="intro-balance"
                value={balanceRaw}
                currency={currency}
                onChange={setBalanceRaw}
              />
              <Readout>
                {balance !== null && (
                  <>
                    Starts at{" "}
                    <Figure>{formatCurrency(balance, currency)}</Figure>
                  </>
                )}
              </Readout>
            </div>
            {footer({
              submitLabel: "Continue",
              canSubmit: balance !== null,
              onBack: () => goTo("welcome", "prev"),
              onSkip: skipBalance,
            })}
          </form>
        );
      case "income":
        return (
          <form
            className="flex flex-1 flex-col gap-8 sm:flex-none"
            onSubmit={submitIncome}
          >
            <Question
              title="When does money come in?"
              body="Your pay, a pension, anything that lands on a schedule. It repeats on the calendar from the next date you give."
            />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-income-title" className="cy-label">
                  What is it
                </Label>
                <Input
                  id="intro-income-title"
                  type="text"
                  autoComplete="off"
                  enterKeyHint="next"
                  value={incomeTitle}
                  onChange={(e) => setIncomeTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-income-amount" className="cy-label">
                  Amount each time
                </Label>
                <AmountField
                  id="intro-income-amount"
                  value={incomeRaw}
                  currency={currency}
                  onChange={setIncomeRaw}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="cy-label">How often</span>
                <div className="grid grid-cols-3 rounded-full bg-[color:var(--cy-panel-2)] p-0.5">
                  {CADENCE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant="ghost"
                      className="h-7 text-xs font-bold"
                      style={
                        cadence === option.value ? SEGMENT_ACTIVE : SEGMENT_IDLE
                      }
                      onClick={() => setCadence(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-income-date" className="cy-label">
                  Next payday
                </Label>
                <Input
                  id="intro-income-date"
                  type="date"
                  className="cy-mono"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                />
              </div>
              <Readout>
                {incomePerMonth !== null && (
                  <>
                    About{" "}
                    <Figure>
                      {formatCurrencyWhole(incomePerMonth, currency)}
                    </Figure>{" "}
                    a month
                  </>
                )}
              </Readout>
            </div>
            {footer({
              submitLabel: "Continue",
              canSubmit: incomeAmount !== null,
              onBack: () => goTo("balance", "prev"),
              onSkip: skipIncome,
            })}
          </form>
        );
      case "bill":
        return (
          <form
            className="flex flex-1 flex-col gap-8 sm:flex-none"
            onSubmit={submitBill}
          >
            <Question
              title="What's your biggest monthly bill?"
              body="Rent, a mortgage, a car payment: the one that moves the balance the most. It repeats every month from the next due date."
            />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-bill-title" className="cy-label">
                  What is it
                </Label>
                <Input
                  id="intro-bill-title"
                  type="text"
                  autoComplete="off"
                  enterKeyHint="next"
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-bill-amount" className="cy-label">
                  Amount
                </Label>
                <AmountField
                  id="intro-bill-amount"
                  value={billRaw}
                  currency={currency}
                  onChange={setBillRaw}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="intro-bill-date" className="cy-label">
                  Next due
                </Label>
                <Input
                  id="intro-bill-date"
                  type="date"
                  className="cy-mono"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </div>
              <Readout>
                {billAmount !== null && incomePerMonth !== null && (
                  <>
                    Leaves about{" "}
                    <Figure>
                      {formatCurrencyWhole(
                        incomePerMonth - billAmount,
                        currency,
                      )}
                    </Figure>{" "}
                    a month
                  </>
                )}
              </Readout>
            </div>
            {footer({
              submitLabel: "Show my month",
              canSubmit: billAmount !== null,
              onBack: () => goTo("income", "prev"),
              onSkip: skipBill,
            })}
          </form>
        );
    }
  };

  return (
    <main
      // Paper, like the landing it continues from: white in the light theme,
      // the shared page ground in dark.
      className={`h-[100dvh] overflow-y-auto bg-white dark:bg-[color:var(--cy-bg)] ${leaving ? "cy-exit" : ""}`}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onExited?.();
      }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col px-4 py-5 sm:px-8 sm:py-7">
        <header
          className="cy-hud cy-land flex items-center justify-between gap-3"
          style={{ animationDelay: `${INTRO_ENTRANCE_MS.header}ms` }}
        >
          <span>
            tuxbank <span className="dim">· setting up</span>
          </span>
          {questionIndex >= 0 && (
            <span>
              {questionIndex + 1} of {QUESTION_STEPS.length}
            </span>
          )}
        </header>

        {/* One column, phone width, top-aligned on a phone so the question
            and its field sit above the keyboard, centred on a wider screen. */}
        <div
          className="cy-land mx-auto flex w-full max-w-[30rem] flex-1 flex-col pt-8 sm:justify-center sm:pt-0"
          style={{ animationDelay: `${INTRO_ENTRANCE_MS.body}ms` }}
        >
          {/* Progress: one pill per question, filled up to the current one.
              Upcoming pills take the line tint so they stay visible on paper
              as well as inside the dark ground. */}
          <div className="flex gap-1.5 pb-8">
            {QUESTION_STEPS.map((s, index) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${index <= questionIndex ? "bg-[color:var(--cy-cyan)]" : "bg-[color:var(--cy-line)]"}`}
              />
            ))}
          </div>
          {/* Keyed so each step mounts fresh and slides in from the side it
              came from, on the month grid's own change feedback. */}
          <div
            key={step}
            className={`flex flex-1 flex-col sm:flex-none ${direction === "next" ? "cy-shift-next" : "cy-shift-prev"}`}
          >
            {screen()}
          </div>
        </div>
      </div>
    </main>
  );
};

export default IntroFlow;
