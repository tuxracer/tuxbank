"use client";

const StorageLockedOverlay = () => (
  <div
    role="alertdialog"
    aria-label="Database in use in another tab"
    className="cy-scanlines fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
  >
    <div className="cy-mono max-w-md border border-[color:var(--cy-cyan)] bg-black px-6 py-5 text-center text-[color:var(--cy-cyan)]">
      <p className="text-sm font-semibold">◢ TUXBANK IS OPEN IN ANOTHER TAB</p>
      <p className="mt-2 text-xs text-[color:var(--cy-muted)]">
        Only one tab can use the local database at a time. Close the other tab
        and this one will take over automatically.
      </p>
    </div>
  </div>
);

export default StorageLockedOverlay;
