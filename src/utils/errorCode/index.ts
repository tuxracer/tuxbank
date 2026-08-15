import { isAccountError } from "@/lib/account";
import { isStorageError } from "@/lib/storage";
import { isSyncError } from "@/lib/sync";

/** What an unrecognized error reports as, rather than its message. */
export const UNKNOWN_ERROR_CODE = "UNKNOWN";

/**
 * A machine-readable label for an error, safe to attach to an analytics event.
 * The three typed error classes carry closed sets of codes; anything else
 * collapses to `UNKNOWN` instead of its message, which can quote user content,
 * an email address, or a URL with a token in it.
 */
export const errorCode = (error: unknown): string => {
  if (isAccountError(error) || isStorageError(error) || isSyncError(error)) {
    return error.code;
  }
  return UNKNOWN_ERROR_CODE;
};
