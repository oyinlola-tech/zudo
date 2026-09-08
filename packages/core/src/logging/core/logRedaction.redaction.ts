import { ConfigurationRedactor } from "../../configuration/error/configurationRedactor.redactor.js";
import type { ConfigurationValue } from "../../configuration/core/configuration.js";
import { sanitizeLogValue } from "./logEntry.entry.js";

/**
 * Hook applied to structured log data before it is written.
 *
 * The hook receives already-sanitized (JSON-safe) values: the
 * merged context object of an entry, and the details of each
 * serialized error in an error's cause chain. It returns the
 * value to emit instead.
 */
export type LogRedactionHook = (value: unknown) => unknown;

/**
 * Options for the built-in key-based log redactor.
 */
export interface LogRedactorOptions {
  /**
   * Additional key patterns treated as sensitive, on top of the
   * framework defaults (password, secret, token, api key, ...).
   */
  readonly patterns?: readonly string[];

  /**
   * Exact dot-paths (relative to the redacted value) treated as
   * sensitive.
   */
  readonly paths?: readonly string[];

  /**
   * Replacement value. Defaults to "[REDACTED]".
   */
  readonly replacement?: string;
}

/**
 * Creates a redaction hook that replaces values stored under
 * sensitive-looking keys.
 *
 * Key matching is word-boundary aware (shared with the
 * configuration redactor): "apiToken" and "db.password" are
 * redacted, "tokenizer" is not.
 */
export function createLogRedactor(
  options: LogRedactorOptions = {},
): LogRedactionHook {
  const redactor = new ConfigurationRedactor({
    sensitivePatterns: options.patterns,
    sensitivePaths: options.paths,
    redactionValue: options.replacement,
  });

  return (value: unknown): unknown =>
    redactor.redactObject(sanitizeLogValue(value) as ConfigurationValue);
}
