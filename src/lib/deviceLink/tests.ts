import { describe, it, expect } from "vitest";
import {
  buildDeviceLinkUrl,
  parseDeviceLinkHash,
  isDeviceLinkPayload,
  DEVICE_LINK_HASH_PREFIX,
  type DeviceLinkPayload,
} from "./index";
import { toBase64Url } from "@/utils/base64";

const payload: DeviceLinkPayload = {
  v: 1,
  email: "a@b.com",
  authSecret: "c2VjcmV0",
  kek: "a2VrLWJ5dGVz",
};

const encode = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

describe("buildDeviceLinkUrl", () => {
  it("builds an origin URL with the device-link fragment", () => {
    const url = buildDeviceLinkUrl(payload, "https://tuxbank.app");
    expect(
      url.startsWith(`https://tuxbank.app/${DEVICE_LINK_HASH_PREFIX}`),
    ).toBe(true);
  });

  it("round-trips through parseDeviceLinkHash", () => {
    const url = buildDeviceLinkUrl(payload, "https://tuxbank.app");
    expect(parseDeviceLinkHash(new URL(url).hash)).toEqual(payload);
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
    const missing = encode({ v: 1, email: "a@b.com", authSecret: "x" });
    const wrongType = encode({ ...payload, kek: 5 });
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${missing}`),
    ).toBeNull();
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${wrongType}`),
    ).toBeNull();
  });

  it("returns null for an unknown payload version", () => {
    const future = encode({ ...payload, v: 2 });
    expect(
      parseDeviceLinkHash(`${DEVICE_LINK_HASH_PREFIX}${future}`),
    ).toBeNull();
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
