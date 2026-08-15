import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import {
  getQuickAddAvailability,
  isQuickAddError,
  parseQuickAdd,
} from "@/lib/quickAdd";
import type { QuickAddAvailability, QuickAddErrorCode } from "@/lib/quickAdd";

import type { QuickAddBarProps } from "./types";

export * from "./types";

const ERROR_MESSAGES: Record<QuickAddErrorCode, string> = {
  EMPTY_INPUT: "Type an event first.",
  UNAVAILABLE: "The on-device model is not available in this browser.",
  MODEL_FAILED: "The on-device model could not run. Use + New Event instead.",
  UNPARSEABLE: "Could not read an event out of that. Try rephrasing it.",
};

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "downloading"; loaded: number }
  | { kind: "error"; message: string };

/**
 * Natural-language event entry over Chrome's on-device Prompt API. Strictly
 * additive: it renders nothing unless the browser reports the model as
 * present or fetchable, and a successful parse only prefills the normal
 * event editor, where the user confirms before anything is saved.
 */
const QuickAddBar = ({ categories, todayISO, onParsed }: QuickAddBarProps) => {
  const [availability, setAvailability] = useState<QuickAddAvailability | null>(
    null,
  );
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    void getQuickAddAvailability().then((a) => {
      if (!cancelled) setAvailability(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (availability === null || availability === "unavailable") return null;

  const busy = status.kind === "parsing" || status.kind === "downloading";

  const submit = async () => {
    setStatus({ kind: "parsing" });
    try {
      const input = await parseQuickAdd(text, {
        categories,
        todayISO,
        // First use may pull the model down; create() resolves once it lands.
        onDownloadProgress: (loaded) =>
          setStatus({ kind: "downloading", loaded }),
      });
      trackEvent("quick-add-used", { outcome: "parsed" });
      setStatus({ kind: "idle" });
      setText("");
      onParsed(input);
    } catch (error) {
      const code: QuickAddErrorCode = isQuickAddError(error)
        ? error.code
        : "MODEL_FAILED";
      trackEvent("quick-add-used", { outcome: code });
      setStatus({ kind: "error", message: ERROR_MESSAGES[code] });
    }
  };

  return (
    <div className="cy-toolbar flex flex-col gap-1.5 px-3 py-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="cy-mono shrink-0 text-[10px] tracking-[0.18em] text-[color:var(--cy-muted)] uppercase">
          ⌁ Quick add
        </span>
        <Input
          value={text}
          disabled={busy}
          placeholder='Describe an event: "netflix 15.99 monthly starting sep 1"'
          className="flex-1 font-mono text-xs"
          onChange={(e) => {
            setText(e.target.value);
            if (status.kind === "error") setStatus({ kind: "idle" });
          }}
        />
        <Button
          type="submit"
          variant="ghost"
          className="cy-btn shrink-0 px-3 text-xs"
          disabled={busy}
        >
          {busy ? "Parsing…" : "Parse ▸"}
        </Button>
      </form>
      {status.kind === "downloading" && (
        <p className="cy-mono text-[11px] text-[color:var(--cy-muted)]">
          Downloading the on-device model… {Math.round(status.loaded * 100)}%
        </p>
      )}
      {status.kind === "error" && (
        <p className="font-mono text-[11px] text-[color:var(--cy-magenta)]">
          {status.message}
        </p>
      )}
    </div>
  );
};

export default QuickAddBar;
