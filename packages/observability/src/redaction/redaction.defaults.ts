/**
 * @zudojs/observability — Default redaction field list
 *
 * One list, built from @zudojs/logger's rather than copied from it, so the
 * documented "extend the defaults" pattern
 * (`fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"]`) can never cover
 * fewer names than the default rules do.
 */

import { DEFAULT_LOGGER_SECRET_FIELDS } from "@zudojs/logger";

/**
 * Spellings this package matched before it adopted the logger's list. In
 * `"contains"` mode they are already covered by a logger entry; they are kept
 * so `"exact"` mode (`apikey` vs `api_key`) does not lose them.
 */
const OBSERVABILITY_EXTRA_FIELDS: readonly string[] = [
  "apikey",
  "access_token",
  "refresh_token",
  "creditcard",
  "cardnumber",
];

/**
 * Default sensitive field names, matched case-insensitively.
 *
 * Every entry of @zudojs/logger's `DEFAULT_LOGGER_SECRET_FIELDS` (password,
 * passphrase, pwd, secret, token, jwt, bearer, auth, cookie, session, sid,
 * credential, api key, card number, cvv, ssn, pin, otp, …) plus the
 * spellings in {@link OBSERVABILITY_EXTRA_FIELDS}.
 */
export const DEFAULT_SENSITIVE_FIELDS: readonly string[] = Object.freeze([
  ...new Set([...DEFAULT_LOGGER_SECRET_FIELDS, ...OBSERVABILITY_EXTRA_FIELDS]),
]);
