export const DEVICE_LINK_HASH_PREFIX = "#device-link=";

/**
 * Query the built link carries ahead of its hash, so the scanned device's
 * first pageview is attributable in analytics. Sign-in never sees it: the
 * parser reads only location.hash.
 */
export const DEVICE_LINK_UTM_QUERY = "?utm_source=device-link&utm_medium=qr";

// v2 added `exp`. A v1 payload carried no expiry and stayed valid until the
// password changed, so the version bump is what refuses a link minted before
// the rule existed rather than accepting it as unexpiring.
export const DEVICE_LINK_VERSION = 2;

/**
 * How long a minted link stays valid. The QR is meant to be scanned within
 * seconds of being shown, so this only has to cover the walk to the other
 * device: every extra minute is a minute a photographed code stays
 * password-equivalent.
 */
export const DEVICE_LINK_TTL_MS = 5 * 60 * 1_000;
