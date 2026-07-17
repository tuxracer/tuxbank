import { isPlainObject, isString } from "remeda";
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
  email: string;
  authSecret: string;
  kek: string;
}

export const isDeviceLinkPayload = (
  value: unknown,
): value is DeviceLinkPayload =>
  isPlainObject(value) &&
  value.v === DEVICE_LINK_VERSION &&
  isString(value.email) &&
  isString(value.authSecret) &&
  isString(value.kek);
