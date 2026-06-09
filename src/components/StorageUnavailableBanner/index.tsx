import { useState } from "react";
import { Button } from "@/components/ui/button";

import type { StorageUnavailableBannerProps } from "./types";

export * from "./types";

const StorageUnavailableBanner = ({
  resettable,
  onReset,
}: StorageUnavailableBannerProps) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="cy-mono flex flex-col gap-2 border border-[color:var(--cy-magenta)] px-4 py-2 text-xs text-[color:var(--cy-magenta)] sm:flex-row sm:items-center sm:justify-between">
      <span>
        ◢ LOCAL STORAGE UNAVAILABLE —{" "}
        {resettable
          ? "the saved data is from an incompatible version and can't be opened."
          : "changes won't be saved this session."}
      </span>

      {resettable &&
        (confirming ? (
          <span className="flex items-center gap-2">
            <span>Permanently delete all local data?</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void onReset()}>
              Delete and reload
            </Button>
          </span>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)}>
            Reset local data
          </Button>
        ))}
    </div>
  );
};

export default StorageUnavailableBanner;
