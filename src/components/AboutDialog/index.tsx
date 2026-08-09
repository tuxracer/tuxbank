import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CyberFrame } from "@/components/CyberFrame";
import { LICENSE_URL, REPO_URL } from "./consts";

import type { AboutDialogProps } from "./types";

export * from "./consts";
export * from "./types";

const linkClasses =
  "text-[color:var(--cy-cyan)] underline underline-offset-2 break-all";

const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="cy-dialog max-h-[85dvh] grid-rows-[minmax(0,1fr)] border-0 sm:max-w-md">
      <CyberFrame />
      <div className="grid min-h-0 gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            About
          </DialogTitle>
        </DialogHeader>

        <div className="cy-mono flex flex-col gap-3 text-xs text-[color:var(--cy-muted)]">
          <p>
            tuxbank is a month calendar for tracking deposits and withdrawals.
            Your data lives in this browser, and optional end-to-end encrypted
            sync keeps it in step across your devices.
          </p>
          <p>
            Free and open source software, released under the{" "}
            <a
              className={linkClasses}
              href={LICENSE_URL}
              target="_blank"
              rel="noreferrer"
            >
              MIT License
            </a>
            .
          </p>
          <p>
            Source code:{" "}
            <a
              className={linkClasses}
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              {REPO_URL}
            </a>
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default AboutDialog;
