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
    <div className="cy-banner flex flex-col gap-2 px-4 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <span>
        Local storage unavailable:{" "}
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
