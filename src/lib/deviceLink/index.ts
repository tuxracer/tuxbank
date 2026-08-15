import { fromBase64Url, toBase64Url } from "@/utils/base64";
import {
  DEVICE_LINK_HASH_PREFIX,
  DEVICE_LINK_TTL_MS,
  DEVICE_LINK_VERSION,
} from "./consts";
import {
  isDeviceLinkPayload,
  type DeviceLinkPayload,
  type DeviceLinkSecrets,
} from "./types";

export * from "./consts";
export * from "./types";

export const buildDeviceLinkUrl = (
  secrets: DeviceLinkSecrets,
  origin: string,
  now: number = Date.now(),
): string => {
  const payload: DeviceLinkPayload = {
    v: DEVICE_LINK_VERSION,
    exp: now + DEVICE_LINK_TTL_MS,
    ...secrets,
  };
  return `${origin}/${DEVICE_LINK_HASH_PREFIX}${toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  )}`;
};

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

/**
 * Whether a parsed link is past its lifetime. Kept out of the parse so an
 * expired scan can be told apart from a malformed one and reported as such,
 * rather than the app appearing to ignore the QR entirely.
 */
export const isDeviceLinkExpired = (
  payload: DeviceLinkPayload,
  now: number = Date.now(),
): boolean => payload.exp <= now;
