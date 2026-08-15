import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import { isWeekStartDay } from "@/lib/displayPreferences";
import { WEEK_STARTS_ON } from "@/lib/dateGrid";
import { trackEvent } from "@/lib/analytics";
import { LOCAL_CURRENCY } from "@/utils/formatCurrency";
import { RUNTIME_LOCALE } from "@/utils/runtimeLocale";
import { weekdayLabel } from "@/utils/weekdayLabel";

/** The seven date-fns day indexes, Sunday-first, for the week-start options. */
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const currencyNames = new Intl.DisplayNames(undefined, { type: "currency" });

/** Every currency the engine can format, labeled "USD · US Dollar". */
const CURRENCY_OPTIONS = Intl.supportedValuesOf("currency").map((code) => ({
  code,
  label: `${code} · ${currencyNames.of(code) ?? code}`,
}));

/**
 * The Display pane of the settings dialog: per-device overrides for the
 * currency amounts are labeled with and the weekday the month grid starts on.
 * Both default to "automatic", which follows the browser's locale.
 */
const DisplaySettings = () => {
  const { preferences, setCurrency, setWeekStartsOn } = useDisplayPreferences();

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <Label htmlFor="display-currency" className="cy-mono text-xs uppercase">
          Currency
        </Label>
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          Amounts and balances are labeled with this currency. Automatic follows
          the browser locale. No conversion is applied.
        </p>
        <NativeSelect
          id="display-currency"
          className="cy-btn text-xs"
          lang={RUNTIME_LOCALE}
          value={preferences.currency ?? ""}
          onChange={(e) => {
            const currency = e.target.value === "" ? null : e.target.value;
            setCurrency(currency);
            trackEvent("display-changed", {
              setting: "currency",
              automatic: currency === null,
            });
          }}
        >
          <option value="">Automatic ({LOCAL_CURRENCY})</option>
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </section>

      <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
        <Label
          htmlFor="display-week-start"
          className="cy-mono text-xs uppercase"
        >
          Week starts on
        </Label>
        <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
          The weekday the calendar columns begin with. Automatic follows the
          browser locale.
        </p>
        <NativeSelect
          id="display-week-start"
          className="cy-btn text-xs"
          lang={RUNTIME_LOCALE}
          value={
            preferences.weekStartsOn === null ? "" : preferences.weekStartsOn
          }
          onChange={(e) => {
            const parsed =
              e.target.value === "" ? null : Number(e.target.value);
            const weekStartsOn = isWeekStartDay(parsed) ? parsed : null;
            setWeekStartsOn(weekStartsOn);
            trackEvent("display-changed", {
              setting: "week-start",
              automatic: weekStartsOn === null,
            });
          }}
        >
          <option value="">
            Automatic ({weekdayLabel(WEEK_STARTS_ON, "long")})
          </option>
          {WEEK_DAYS.map((day) => (
            <option key={day} value={day}>
              {weekdayLabel(day, "long")}
            </option>
          ))}
        </NativeSelect>
      </section>
    </div>
  );
};

export default DisplaySettings;
