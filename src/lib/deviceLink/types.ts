import { isNumber, isPlainObject, isString } from "remeda";
import { DEVICE_LINK_VERSION } from "./consts";

/**
 * Everything a second device needs to sign in without the password: the
 * derived Supabase auth secret and the KEK that unwraps the account's DEK
 * (both base64). Possession of this payload is equivalent to knowing the
 * password, and it is gated by TOTP the same way; it must never be logged
 * or persisted.
 */
export interface DeviceLinkPayload {
  v: typeof DEVICE_LINK_VERSION;
  /**
   * Epoch milliseconds after which the link is refused. Self-contained rather
   * than server-tracked: nothing about the link is registered anywhere, so the
   * scanning device is the only party that can enforce a lifetime.
   */
  exp: number;
  email: string;
  authSecret: string;
  kek: string;
}

/** The caller's half; buildDeviceLinkUrl stamps `v` and `exp` itself. */
export type DeviceLinkSecrets = Omit<DeviceLinkPayload, "v" | "exp">;

export const isDeviceLinkPayload = (
  value: unknown,
): value is DeviceLinkPayload =>
  isPlainObject(value) &&
  value.v === DEVICE_LINK_VERSION &&
  isNumber(value.exp) &&
  isString(value.email) &&
  isString(value.authSecret) &&
  isString(value.kek);
