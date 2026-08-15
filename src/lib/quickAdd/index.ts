import { format, parseISO } from "date-fns";
import { categoryKey } from "@/types";
import type { Category } from "@/types";
import type { EventInput } from "@/lib/recurrence";
import { QUICK_ADD_RESPONSE_SCHEMA } from "./consts";
import {
  QuickAddError,
  isLanguageModelStatic,
  isQuickAddAvailability,
  isQuickAddError,
  isQuickAddModelOutput,
} from "./types";
import type { LanguageModelStatic, QuickAddAvailability } from "./types";

export * from "./consts";
export * from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const getLanguageModel = (): LanguageModelStatic | null => {
  const candidate: unknown = Reflect.get(globalThis, "LanguageModel");
  return isLanguageModelStatic(candidate) ? candidate : null;
};

/**
 * Whether the on-device model can parse quick-add text in this browser.
 * "unavailable" covers every browser without the Prompt API (which today is
 * everything but Chrome behind the origin trial), so callers can hide the
 * feature on it alone.
 */
export const getQuickAddAvailability =
  async (): Promise<QuickAddAvailability> => {
    const model = getLanguageModel();
    if (!model) return "unavailable";
    try {
      const status = await model.availability();
      return isQuickAddAvailability(status) ? status : "unavailable";
    } catch {
      return "unavailable";
    }
  };

const buildSystemPrompt = (
  categories: readonly Category[],
  todayISO: string,
): string => {
  const today = `${todayISO} (${format(parseISO(todayISO), "EEEE")})`;
  const names = categories.map((c) => c.name).join(", ");
  return [
    "You turn one line of text describing a money event into JSON.",
    `Today is ${today}. All dates are YYYY-MM-DD. Resolve relative dates ("tomorrow", "next friday", "sep 1") from today; if no date is given, use today's date.`,
    '"amount" is the number mentioned, without currency symbols.',
    '"direction" is "deposit" for money coming in (paycheck, salary, income, refund), otherwise "withdrawal".',
    '"repeat" captures recurrence: "monthly", "every week" is weekly, "biweekly" or "every other week" is weekly with interval 2. Use "none" when the event does not repeat.',
    '"interval" is the every-N step of the recurrence, 1 unless the text says otherwise.',
    '"endsOn" is the last date when the text gives one ("until december"), otherwise "".',
    `"category" is the best match from this list, otherwise "": ${names}.`,
    '"title" is a short name for the event without the amount, date, or recurrence words.',
  ].join("\n");
};

/**
 * Semantic sanity over a shape-valid model reply, mapped onto the same
 * EventInput the event form produces. Lenient where a fallback is safe (bad
 * date resolves to today, unknown category to the first one), strict where it
 * is not (no usable title or amount fails the parse).
 */
export const normalizeQuickAddOutput = (
  raw: unknown,
  categories: readonly Category[],
  todayISO: string,
): EventInput => {
  if (!isQuickAddModelOutput(raw)) throw new QuickAddError("UNPARSEABLE");
  const title = raw.title.trim();
  if (!title) throw new QuickAddError("UNPARSEABLE");
  if (!Number.isFinite(raw.amount) || raw.amount <= 0)
    throw new QuickAddError("UNPARSEABLE");
  const date = ISO_DATE.test(raw.date) ? raw.date : todayISO;
  const matched = categories.find(
    (c) => categoryKey(c.name) === categoryKey(raw.category),
  );
  return {
    title,
    date,
    categoryId: matched?.id ?? categories[0]?.id ?? "",
    // Amounts are cents at most; drop float noise like 15.990000000000002.
    amount: Math.round(raw.amount * 100) / 100,
    direction: raw.direction,
    recurrence:
      raw.repeat === "none"
        ? null
        : {
            freq: raw.repeat,
            interval:
              Number.isInteger(raw.interval) && raw.interval >= 1
                ? raw.interval
                : 1,
            endsOn:
              ISO_DATE.test(raw.endsOn) && raw.endsOn >= date
                ? raw.endsOn
                : null,
          },
  };
};

export type ParseQuickAddOptions = {
  categories: readonly Category[];
  todayISO: string;
  /** Fires with 0..1 while Chrome downloads the model on first use. */
  onDownloadProgress?: (loaded: number) => void;
};

/**
 * Parse free text ("netflix 15.99 monthly starting sep 1") into an EventInput
 * with the on-device model. The result is a prefill for the event form, never
 * something to save directly: the user confirms it in the normal editor.
 */
export const parseQuickAdd = async (
  text: string,
  { categories, todayISO, onDownloadProgress }: ParseQuickAddOptions,
): Promise<EventInput> => {
  const trimmed = text.trim();
  if (!trimmed) throw new QuickAddError("EMPTY_INPUT");
  const model = getLanguageModel();
  if (!model) throw new QuickAddError("UNAVAILABLE");

  // A fresh session per parse keeps the system prompt current (today's date,
  // the category list) and holds no model state between uses.
  let session;
  try {
    session = await model.create({
      initialPrompts: [
        { role: "system", content: buildSystemPrompt(categories, todayISO) },
      ],
      monitor: (m) =>
        m.addEventListener("downloadprogress", (e) =>
          onDownloadProgress?.(e.loaded),
        ),
    });
  } catch {
    throw new QuickAddError("MODEL_FAILED");
  }

  try {
    const reply = await session.prompt(trimmed, {
      responseConstraint: QUICK_ADD_RESPONSE_SCHEMA,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(reply);
    } catch {
      throw new QuickAddError("UNPARSEABLE");
    }
    return normalizeQuickAddOutput(parsed, categories, todayISO);
  } catch (error) {
    if (isQuickAddError(error)) throw error;
    throw new QuickAddError("MODEL_FAILED");
  } finally {
    session.destroy();
  }
};
