/**
 * Text logger formatter.
 */

import type {
  LoggerFormatter,
  TextLoggerFormatterOptions,
} from "../loggerFormatter.type.js";

import { createLoggerFormatter } from "../loggerFormatter.core.js";

import { escapeLogText } from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

import {
  formatContext,
  formatSource,
} from "./loggerFormatterFormatters.context.js";

import {
  formatMetadata,
  formatError,
} from "./loggerFormatterFormatters.metadata.js";

/** ANSI colour per severity, used only when the caller opts in. */
const LEVEL_COLORS: Readonly<Record<string, string>> = Object.freeze({
  fatal: "35",
  error: "31",
  warn: "33",
  info: "36",
  debug: "32",
  trace: "90",
});

/** Wraps a level tag in an ANSI colour sequence. */
function colorizeLevel(levelName: string, tag: string): string {
  const color = LEVEL_COLORS[levelName];

  if (color === undefined) {
    return tag;
  }

  return `\u001b[${color}m${tag}\u001b[0m`;
}

/**
 * Creates a human-readable text formatter.
 */
export function createTextLoggerFormatter(
  options: TextLoggerFormatterOptions = {},
): LoggerFormatter<string> {
  const includeTimestamp = options.includeTimestamp ?? true;
  const includeLogger = options.includeLogger ?? true;
  const includeMetadata = options.includeMetadata ?? true;
  const includeContext = options.includeContext ?? true;
  const includeSource = options.includeSource ?? false;
  const includeStackTrace = options.includeStackTrace ?? true;
  const metadataSeparator = options.metadataSeparator ?? " ";

  return createLoggerFormatter(
    (entry, context) => {
      const parts: string[] = [];

      if (includeTimestamp) {
        parts.push(entry.timestamp.toISOString());
      }

      // LoggerFormatterContext.colors was declared from the first
      // release and read by nothing, so `colors: true` produced plain
      // output. Colour codes are emitted only on explicit opt-in, and
      // only around the fixed level name — never around user text,
      // which stays escaped.
      const levelTag = `[${entry.levelName.toUpperCase()}]`;

      parts.push(
        context.colors ? colorizeLevel(entry.levelName, levelTag) : levelTag,
      );

      if (includeLogger && entry.logger) {
        parts.push(`[${escapeLogText(entry.logger)}]`);
      }

      // The message is the single most attacker-influenceable field on
      // an entry. Emitted verbatim, a newline inside it forged a whole
      // extra log record and an ESC byte drove the operator's terminal.
      parts.push(escapeLogText(entry.message));

      if (includeContext && entry.context) {
        const context = formatContext(entry);
        if (context) {
          parts.push(context);
        }
      }

      if (includeSource && entry.source) {
        const source = formatSource(entry);
        if (source) {
          parts.push(source);
        }
      }

      if (includeMetadata && Object.keys(entry.metadata).length > 0) {
        parts.push(formatMetadata(entry.metadata, metadataSeparator));
      }

      if (entry.error) {
        parts.push(formatError(entry.error, includeStackTrace));
      }

      return parts.join(" ");
    },
    { name: options.name ?? "text" },
  );
}
