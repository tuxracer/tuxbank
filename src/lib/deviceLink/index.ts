import { fromBase64Url, toBase64Url } from "@/utils/base64";
import { DEVICE_LINK_HASH_PREFIX } from "./consts";
import { isDeviceLinkPayload, type DeviceLinkPayload } from "./types";

export * from "./consts";
export * from "./types";

export const buildDeviceLinkUrl = (
  payload: DeviceLinkPayload,
  origin: string,
): string =>
  `${origin}/${DEVICE_LINK_HASH_PREFIX}${toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  )}`;

/** Parse a location.hash; null for anything that is not a valid link. */
export const parseDeviceLinkHash = (hash: string): DeviceLinkPayload | null => {
  if (!hash.startsWith(DEVICE_LINK_HASH_PREFIX)) return null;
  try {
    const json = new TextDecoder().decode(
      fromBase64Url(hash.slice(DEVICE_LINK_HASH_PREFIX.length)),
    );
    const parsed: unknown = JSON.parse(json);
    return isDeviceLinkPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
