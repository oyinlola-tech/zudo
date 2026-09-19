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
      // JSON escapes C0 controls but not DEL, C1 or U+2028/U+2029.
      return escapeLogText(JSON.stringify(value));
    }

    // A value with no whitespace can still carry ANSI escapes or other
    // C0 controls, which used to reach the sink verbatim.
    return escapeLogText(value);
  }

  if (typeof value === "object") {
    return escapeLogText(JSON.stringify(serializeLoggerValue(value)));
  }

  return escapeLogText(String(value));
}

/**
 * Splits an error's stack into its header (name and message) and its
 * frame lines.
 *
 * The header is derived from the error itself rather than from the first
 * stack line, because the message can contain newlines of its own and
 * would otherwise spill across several "lines" of the stack.
 */
function splitStack(error: Error, stack: string): {
  readonly header: string;
  readonly frames: readonly string[];
} {
  const message = String(error.message ?? "");
  const header = message ? `${error.name}: ${message}` : String(error.name);

  if (stack.startsWith(header)) {
    const rest = stack.slice(header.length).replace(/^\r?\n/u, "");
    return { header, frames: rest ? rest.split("\n") : [] };
  }

  const lines = stack.split("\n");
  const firstFrame = lines.findIndex((line) => /^\s+at\s/u.test(line));

  if (firstFrame === -1) {
    return { header: stack, frames: [] };
  }

  return {
    header: lines.slice(0, firstFrame).join("\n"),
    frames: lines.slice(firstFrame),
  };
}

/**
 * Formats an Error.
 *
 * With a stack trace the output is intentionally multi-line, but only
 * the frame lines break the line: the header (which carries the
 * attacker-influenceable message) is escaped as a single line, and every
 * frame line is escaped and indented so none of them can start at
 * column 0 and parse as a record of its own.
 */
export function formatError(error: Error, includeStackTrace: boolean): string {
  if (includeStackTrace && typeof error.stack === "string" && error.stack) {
    const { header, frames } = splitStack(error, error.stack);
    const lines = [escapeLogText(header)];

    for (const frame of frames) {
      const escaped = escapeLogText(frame);
      lines.push(/^\s/u.test(escaped) ? escaped : `    ${escaped}`);
    }

    return `\n${lines.join("\n")}`;
  }

  const serialized = serializeLoggerError(error);

  return `error=${escapeLogText(JSON.stringify(serialized))}`;
}
