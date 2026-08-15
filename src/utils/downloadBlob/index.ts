// Engines may resolve the blob URL after the click task returns; revoking
// synchronously can abort the download, so give the fetch a generous head
// start (the URL is also released on page unload regardless).
const REVOKE_DELAY_MS = 30_000;

/** Trigger a browser download of a Blob under the given filename. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
