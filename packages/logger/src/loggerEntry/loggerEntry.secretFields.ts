/**
 * Default secret-field matching for logger redaction.
 *
 * Field names are split into words (`x-api-key`, `api_key` and `apiKey`
 * all become `api key`) and matched on whole-word runs, the same scheme
 * @zudojs/observability's `isSensitiveField` uses. A raw substring test
 * redacted `passenger`, `compass` and `bypassCache` (they contain `pass`)
 * while missing `auth`, `sessionId`, `sid`, `jwt`, `ssn`, `cardNumber`,
 * `cvv` and `otp` entirely.
 */

/**
 * Secret field names matched on whole words by default.
 */
export const DEFAULT_LOGGER_SECRET_FIELDS: readonly string[] = Object.freeze([
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "secret",
  "token",
  "jwt",
  "bearer",
  "authorization",
  "auth",
  "cookie",
  "session",
  "sid",
  "credential",
  "credentials",
  "api_key",
  "private_key",
  "client_secret",
  "credit_card",
  "card_number",
  "cvv",
  "cvc",
  "ssn",
  "social_security",
  "pin",
  "otp",
]);

/**
 * Unambiguous secret words that are also matched as a substring of a
 * lowercase run-together name (`userpassword`, `accesstoken`), which the
 * word split alone cannot see.
 */
const SUBSTRING_SECRET_WORDS: readonly string[] = Object.freeze([
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "credential",
  "authorization",
  "cookie",
]);

/** Splits a field name into lowercase words. */
function splitWords(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

/** Normalizes a field-list entry the way word runs are joined. */
function normalizeField(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

/**
 * Builds the default secret-field predicate from a word list.
 */
export function createDefaultSecretFieldMatcher(
  fields: readonly string[] = DEFAULT_LOGGER_SECRET_FIELDS,
): (key: string) => boolean {
  const targets = new Set(fields.map(normalizeField).filter(Boolean));

  return (key: string): boolean => {
    const words = splitWords(key);
    for (let start = 0; start < words.length; start += 1) {
      let joined = "";
      for (let end = start; end < words.length; end += 1) {
        joined += words[end] ?? "";
        if (targets.has(joined)) return true;
      }
    }
    const compact = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    return SUBSTRING_SECRET_WORDS.some((word) => compact.includes(word));
  };
}
