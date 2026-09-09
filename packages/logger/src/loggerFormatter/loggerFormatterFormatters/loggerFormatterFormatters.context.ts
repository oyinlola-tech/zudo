/**
 * Logger context and source formatting helpers.
 */

import type { LoggerEntry } from "../../loggerEntry/loggerEntry.type.js";

import { escapeLogText } from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

/**
 * Formats logger context.
 */
export function formatContext(entry: LoggerEntry): string {
  if (!entry.context) {
    return "";
  }

  const values: string[] = [];

  for (const [key, value] of Object.entries(entry.context)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "object") {
      continue;
    }

    values.push(`${escapeLogText(key)}=${escapeLogText(String(value))}`);
  }

  return values.length > 0 ? `[${values.join(" ")}]` : "";
}

/**
 * Formats logger source information.
 */
export function formatSource(entry: LoggerEntry): string {
  const source = entry.source;

  if (!source) {
    return "";
  }

  const location: string[] = [];

  if (source.file) {
    location.push(escapeLogText(source.file));
  }

  if (source.line !== undefined) {
    location.push(String(source.line));
  }

  const functionName = source.function
    ? ` ${escapeLogText(source.function)}`
    : "";

  return location.length > 0 ? `[${location.join(":")}${functionName}]` : "";
}
