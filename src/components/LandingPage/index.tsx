import { CyberFrame } from "@/components/CyberFrame";
import { REPO_URL } from "@/components/AboutDialog";
import { LANDING_FEATURES } from "./consts";

import type { LandingPageProps } from "./types";

export * from "./consts";
export * from "./types";

/**
 * First-visit entry screen. Shown until the visitor clicks Try Now (or is
 * otherwise known to be past it — see `src/lib/landingGate`); after that the
 * app boots straight into the calendar.
 */
const LandingPage = ({ onTryNow }: LandingPageProps) => (
  <main className="cy-scanlines flex min-h-[100dvh] flex-col gap-8 overflow-y-auto p-4 sm:p-6">
    <header className="cy-hud flex items-center justify-between gap-3">
      <span>
        tuxbank <span className="dim">{"// local-first money calendar"}</span>
      </span>
      <span className="on hidden sm:inline">no account required</span>
    </header>

    <section className="flex grow flex-col items-center justify-center gap-6 text-center">
      <h1 className="cy-display text-[clamp(3.5rem,12vw,7rem)] leading-none font-bold tracking-wide uppercase">
        <span
          className="text-[color:var(--cy-cyan)]"
          style={{ textShadow: "0 0 28px var(--cy-glow-cyan-soft)" }}
        >
          tux
        </span>
        <span
          className="text-[color:var(--cy-magenta)]"
          style={{ textShadow: "0 0 28px var(--cy-glow-magenta-soft)" }}
        >
          bank
        </span>
      </h1>

      <p className="max-w-xl text-base text-balance text-[color:var(--cy-text)] sm:text-lg">
        A month calendar for your money. Put deposits and withdrawals on the
        days they happen and watch the running balance move.
      </p>

      <div className="cy-mono flex flex-wrap items-center justify-center gap-2 text-[11px] tracking-[0.18em] uppercase">
        <span className="border border-[color:var(--cy-green)] px-3 py-1.5 text-[color:var(--cy-green)]">
          Free forever
        </span>
        <span className="border border-[color:var(--cy-cyan)] px-3 py-1.5 text-[color:var(--cy-cyan)]">
          No sign-up
        </span>
        <span className="border border-[color:var(--cy-yellow)] px-3 py-1.5 text-[color:var(--cy-yellow)]">
          Not even an email
        </span>
      </div>

      <button
        type="button"
        className="cy-cta px-12 py-4 text-xl"
        onClick={onTryNow}
      >
        ▶ Try Now
      </button>
      <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
        ◢ Opens the calendar immediately — nothing to enter first.
      </p>
    </section>

    <section className="cy-toolbar mx-auto w-full max-w-3xl px-5 py-4">
      <CyberFrame chamfer={18} color="var(--cy-line)" />
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {LANDING_FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col gap-1">
            <h2 className="cy-mono text-xs tracking-[0.18em] text-[color:var(--cy-cyan)] uppercase">
              ◢ {feature.title}
            </h2>
            <p className="text-sm text-[color:var(--cy-muted)]">
              {feature.body}
            </p>
          </div>
        ))}
      </div>
    </section>

    <footer className="cy-mono pb-1 text-center text-xs text-[color:var(--cy-muted)]">
      MIT licensed ·{" "}
      <a
        className="text-[color:var(--cy-cyan)] underline underline-offset-2"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        Source on GitHub
      </a>
    </footer>
  </main>
);

export default LandingPage;
