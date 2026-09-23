/**
 * Normalization of the `redact` logger option.
 */

import type { LoggerRedactionOptions } from "../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

/**
 * Resolves the `redact` option into frozen redaction settings.
 *
 * `false` turns redaction off and `true` (or omitting it) keeps the default.
 * An object is used as given. Spreading `false` into an object yields `{}`,
 * which is the default, so a boolean must be mapped explicitly.
 *
 * @param redact - The `redact` value passed to `createLogger`.
 * @returns The normalized redaction settings.
 */
export function resolveRedactionOptions(
  redact: boolean | LoggerRedactionOptions | undefined,
): LoggerRedactionOptions {
  if (redact === false) return Object.freeze({ enabled: false });
  if (redact === true || redact === undefined || redact === null) {
    return Object.freeze({});
  }
  return Object.freeze({ ...redact });
}
