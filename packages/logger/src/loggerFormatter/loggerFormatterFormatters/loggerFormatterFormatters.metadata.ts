/**
 * Logger metadata and error formatting helpers.
 */

import {
  serializeLoggerError,
  serializeLoggerValue,
} from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.valueSerialize.js";

import { escapeLogText } from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

/**
 * Formats metadata as key=value pairs.
 */
export function formatMetadata(
  metadata: Record<string, unknown>,
  separator: string,
): string {
  return (
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      // Metadata KEYS are as attacker-influenceable as values (a header
      // name, a form field) and were previously interpolated raw.
      .map(([key, value]) => `${escapeLogText(key)}=${formatValue(value)}`)
      .join(separator)
  );
}

/**
 * Formats an arbitrary metadata value.
 */
export function formatValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    if (/\s/.test(value)) {
      return JSON.stringify(value);
    }

    // A value with no whitespace can still carry ANSI escapes or other
    // C0 controls, which used to reach the sink verbatim.
    return escapeLogText(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(serializeLoggerValue(value));
  }

  return escapeLogText(String(value));
}

/**
 * Formats an Error.
 */
export function formatError(error: Error, includeStackTrace: boolean): string {
  if (includeStackTrace && error.stack) {
    // A stack trace is intentionally multi-line, but everything in it
    // that came from user input (the message) must not be able to
    // introduce a further record boundary of its own.
    return `\n${error.stack.split("\n").map(escapeLogText).join("\n")}`;
  }

  const serialized = serializeLoggerError(error);

  return `error=${JSON.stringify(serialized)}`;
}
