import { isNumber, isPlainObject, isString } from "remeda";
import { isRecurrenceFreq } from "@/types";
import type { RecurrenceFreq } from "@/types";

/**
 * Chrome's Prompt API availability states. Anything unrecognized (a future
 * state, a missing global) collapses to "unavailable" so the UI stays hidden.
 */
const QUICK_ADD_AVAILABILITIES = [
  "available",
  "downloadable",
  "downloading",
  "unavailable",
] as const;

export type QuickAddAvailability = (typeof QUICK_ADD_AVAILABILITIES)[number];

export const isQuickAddAvailability = (
  value: unknown,
): value is QuickAddAvailability =>
  isString(value) &&
  QUICK_ADD_AVAILABILITIES.includes(value as QuickAddAvailability);

export type QuickAddErrorCode =
  | "EMPTY_INPUT"
  | "UNAVAILABLE"
  | "MODEL_FAILED"
  | "UNPARSEABLE";

export class QuickAddError extends Error {
  readonly code: QuickAddErrorCode;
  constructor(code: QuickAddErrorCode) {
    super(code);
    this.name = "QuickAddError";
    this.code = code;
  }
}

export const isQuickAddError = (error: unknown): error is QuickAddError =>
  error instanceof QuickAddError;

/**
 * The exact shape QUICK_ADD_RESPONSE_SCHEMA forces the model to emit. Empty
 * strings stand in for "none" (endsOn, category) because the schema sticks to
 * the plain-object subset of JSON Schema the response constraint supports.
 */
export type QuickAddModelOutput = {
  title: string;
  amount: number;
  direction: "deposit" | "withdrawal";
  date: string;
  repeat: RecurrenceFreq | "none";
  interval: number;
  endsOn: string;
  category: string;
};

export const isQuickAddModelOutput = (
  value: unknown,
): value is QuickAddModelOutput =>
  isPlainObject(value) &&
  isString(value.title) &&
  isNumber(value.amount) &&
  (value.direction === "deposit" || value.direction === "withdrawal") &&
  isString(value.date) &&
  (value.repeat === "none" || isRecurrenceFreq(value.repeat)) &&
  isNumber(value.interval) &&
  isString(value.endsOn) &&
  isString(value.category);

/**
 * The slice of the Prompt API this module touches, declared by hand: the API
 * is an origin-trial browser global (Chrome 148+), so no bundled lib.dom
 * types exist for it and the runtime shape must be guarded, not assumed.
 */
export type LanguageModelSession = {
  prompt: (
    input: string,
    options?: { responseConstraint?: Record<string, unknown> },
  ) => Promise<string>;
  destroy: () => void;
};

export type LanguageModelCreateMonitor = {
  addEventListener: (
    type: "downloadprogress",
    listener: (event: { loaded: number }) => void,
  ) => void;
};

export type LanguageModelStatic = {
  availability: () => Promise<string>;
  create: (options?: {
    initialPrompts?: readonly {
      role: "system" | "user" | "assistant";
      content: string;
    }[];
    monitor?: (monitor: LanguageModelCreateMonitor) => void;
  }) => Promise<LanguageModelSession>;
};

export const isLanguageModelStatic = (
  value: unknown,
): value is LanguageModelStatic => {
  if (value === null) return false;
  if (typeof value !== "object" && typeof value !== "function") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.availability === "function" &&
    typeof candidate.create === "function"
  );
};
