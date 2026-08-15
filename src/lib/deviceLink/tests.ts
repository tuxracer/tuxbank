import { describe, it, expect } from "vitest";
import {
  buildDeviceLinkUrl,
  isDeviceLinkExpired,
  parseDeviceLinkHash,
  isDeviceLinkPayload,
  DEVICE_LINK_HASH_PREFIX,
  DEVICE_LINK_TTL_MS,
  DEVICE_LINK_VERSION,
  type DeviceLinkPayload,
  type DeviceLinkSecrets,
} from "./index";
import { toBase64Url } from "@/utils/base64";

const NOW = 1_700_000_000_000;

const secrets: DeviceLinkSecrets = {
  email: "a@b.com",
  authSecret: "c2VjcmV0",
  kek: "a2VrLWJ5dGVz",
};

const payload: DeviceLinkPayload = {
  v: DEVICE_LINK_VERSION,
  exp: NOW + DEVICE_LINK_TTL_MS,
  ...secrets,
};

const encode = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

const hashOf = (url: string): string => new URL(url).hash;

describe("buildDeviceLinkUrl", () => {
  it("builds an origin URL with the device-link fragment", () => {
    const url = buildDeviceLinkUrl(secrets, "https://tuxbank.app", NOW);
    expect(
      url.startsWith(`https://tuxbank.app/${DEVICE_LINK_HASH_PREFIX}`),
    ).toBe(true);
  });

  it("round-trips through parseDeviceLinkHash, stamped with an expiry", () => {
    const url = buildDeviceLinkUrl(secrets, "https://tuxbank.app", NOW);
    expect(parseDeviceLinkHash(hashOf(url))).toEqual(payload);
  });
});

describe("parseDeviceLinkHash", () => {
  it("returns null for hashes without the prefix", () => {
    expect(parseDeviceLinkHash("")).toBeNull();
    expect(parseDeviceLinkHash("#other")).toBeNull();
  });

  it("returns null for garbage after the prefix", () => {
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}!!!not-base64!!!`),
    ).toBeNull();
  });

  it("returns null for valid base64url of invalid JSON", () => {
    const bad = toBase64Url(new TextEncoder().encode("{not json"));
    expect(parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${bad}`)).toBeNull();
  });

  it("returns null when fields are missing or the wrong type", () => {
    const missing = encode({ v: DEVICE_LINK_VERSION, email: "a@b.com" });
    const wrongType = encode({ ...payload, kek: 5 });
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${missing}`),
    ).toBeNull();
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${wrongType}`),
    ).toBeNull();
  });

  // A v1 link carried no expiry and never went stale; it must not be honored
  // now that links expire.
  it("returns null for a payload from a retired version", () => {
    const v1 = encode({ v: 1, ...secrets });
    expect(parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${v1}`)).toBeNull();
  });

  it("returns null for an unknown future version", () => {
    const future = encode({ ...payload, v: DEVICE_LINK_VERSION + 1 });
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${future}`),
    ).toBeNull();
  });
});

describe("isDeviceLinkExpired", () => {
  it("accepts a freshly built link and refuses it once the TTL has passed", () => {
    const url = buildDeviceLinkUrl(secrets, "https://tuxbank.app", NOW);
    const parsed = parseDeviceLinkHash(hashOf(url));
    expect(parsed).not.toBeNull();
    expect(isDeviceLinkExpired(parsed!, NOW)).toBe(false);
    expect(isDeviceLinkExpired(parsed!, NOW + DEVICE_LINK_TTL_MS - 1)).toBe(
      false,
    );
    expect(isDeviceLinkExpired(parsed!, NOW + DEVICE_LINK_TTL_MS)).toBe(true);
  });
});

describe("isDeviceLinkPayload", () => {
  it("rejects non-objects", () => {
    expect(isDeviceLinkPayload(null)).toBe(false);
    expect(isDeviceLinkPayload("string")).toBe(false);
    expect(isDeviceLinkPayload([])).toBe(false);
  });

  it("accepts a complete payload", () => {
    expect(isDeviceLinkPayload(payload)).toBe(true);
  });
});
