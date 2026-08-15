import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SyncSettings } from "@/components/SyncSettings";
import DataSettings from "@/components/DataSettings";
import CategoriesSettings from "@/components/CategoriesSettings";
import DisplaySettings from "@/components/DisplaySettings";
import { SyncAttentionDot } from "@/components/SyncAttentionBadge";
import { useIsCompact } from "@/hooks/useIsCompact";
import { trackEvent } from "@/lib/analytics";
import { DEFAULT_TAB, SETTINGS_TABS, TAB_OPENED_EVENT } from "./consts";

import type { SettingsDialogProps, SettingsTab } from "./types";

export * from "./consts";
export * from "./types";

const tabMeta = (tab: SettingsTab) =>
  SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[0];

/**
 * One dialog for the app's three settings surfaces. Wide screens get a rail
 * of tabs beside the pane; compact screens get a full-screen menu whose root
 * rows are the tabs, drilling into one pane at a time.
 */
const SettingsDialog = ({
  open,
  tab,
  onTabChange,
  onOpenChange,
  data,
  categories,
}: SettingsDialogProps) => {
  const isCompact = useIsCompact();
  // Compact keeps `null` as the root menu; wide screens always show a pane.
  const activeTab = isCompact ? tab : (tab ?? DEFAULT_TAB);

  useEffect(() => {
    if (!open || !activeTab) return;
    trackEvent(TAB_OPENED_EVENT[activeTab], {
      layout: isCompact ? "compact" : "full",
    });
  }, [open, activeTab, isCompact]);

  const pane = (t: SettingsTab) => {
    if (t === "sync") return <SyncSettings />;
    if (t === "data")
      return <DataSettings {...data} onClose={() => onOpenChange(false)} />;
    if (t === "display") return <DisplaySettings />;
    return <CategoriesSettings {...categories} />;
  };

  if (isCompact) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="cy-dialog top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 border-0 p-0">
          {tab === null ? (
            <>
              <header className="flex items-center border-b border-[color:var(--cy-line)] px-4 py-3">
                <DialogTitle className="cy-display text-lg tracking-wide uppercase">
                  ◢ Settings
                </DialogTitle>
              </header>
              <nav className="flex flex-col gap-2 p-3">
                {SETTINGS_TABS.map((t) => (
                  <Button
                    key={t.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onTabChange(t.id)}
                    // Menu rows, not toolbar controls: identical tall blocks
                    // with room for a description line, deliberately off the
                    // 32px control box the toolbar rule is about.
                    className="h-auto flex-col items-start gap-1 border border-[color:var(--cy-line)] px-4 py-3 text-left whitespace-normal"
                  >
                    <span className="cy-mono flex w-full items-center gap-2 text-xs tracking-[0.12em] uppercase">
                      ◢ {t.label}
                      <span className="ml-auto flex items-center gap-2">
                        {t.id === "sync" && <SyncAttentionDot />}
                        <span className="text-[color:var(--cy-muted)]">›</span>
                      </span>
                    </span>
                    <span className="cy-mono text-[10px] text-[color:var(--cy-muted)]">
                      {t.description}
                    </span>
                  </Button>
                ))}
              </nav>
              <footer className="cy-hud mt-auto border-t border-[color:var(--cy-hairline)] px-4 py-3">
                tuxbank.app
              </footer>
            </>
          ) : (
            <>
              <header className="flex items-center gap-2 border-b border-[color:var(--cy-line)] px-3 py-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Back"
                  className="cy-nav"
                  onClick={() => onTabChange(null)}
                >
                  ‹
                </Button>
                <DialogTitle className="cy-display text-base tracking-wide uppercase">
                  ◢ {tabMeta(tab).title}
                </DialogTitle>
              </header>
              {/* Keyed so each drill-in mounts fresh and the one-shot
                  month-shift slide plays once per section. */}
              <div
                key={tab}
                className="cy-shift-next min-h-0 flex-1 overflow-y-auto"
              >
                <div className="p-4">{pane(tab)}</div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const active = activeTab ?? DEFAULT_TAB;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cy-dialog flex h-[560px] max-h-[85dvh] flex-row gap-0 overflow-hidden border-0 p-0 sm:max-w-2xl">
        <aside className="flex w-44 shrink-0 flex-col border-r border-[color:var(--cy-line)] bg-[color:var(--cy-panel-2)]">
          <DialogTitle className="cy-display px-4 pt-4 pb-3 text-base tracking-wide uppercase">
            ◢ Settings
          </DialogTitle>
          <nav className="flex flex-col gap-1 px-2">
            {SETTINGS_TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="ghost"
                onClick={() => onTabChange(t.id)}
                // The selected tab borrows the calendar's selected-cell
                // grammar: a 2px inset cyan edge over the raised fill.
                className={`cy-mono justify-start gap-2 px-3 text-xs tracking-[0.12em] uppercase ${
                  t.id === active
                    ? "bg-[color:var(--cy-panel)] text-[color:var(--cy-text-strong)] shadow-[inset_2px_0_0_var(--cy-cyan)]"
                    : "text-[color:var(--cy-muted)]"
                }`}
              >
                {t.label}
                {t.id === "sync" && (
                  <span className="ml-auto">
                    <SyncAttentionDot />
                  </span>
                )}
              </Button>
            ))}
          </nav>
          <span className="cy-hud mt-auto px-4 pb-4">tuxbank.app</span>
        </aside>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="border-b border-[color:var(--cy-hairline)] px-5 py-4">
            <h2 className="cy-display text-base font-medium tracking-wide uppercase">
              ◢ {tabMeta(active).title}
            </h2>
          </header>
          {/* Keyed so switching tabs mounts a fresh pane (resetting any
              half-finished flow) and replays the one-shot slide. */}
          <div
            key={active}
            className="cy-shift-next min-h-0 flex-1 overflow-y-auto"
          >
            <div className="px-5 py-4">{pane(active)}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
