/**
 * Composite logger formatters.
 */

import { serializeLoggerEntry } from "../../loggerEntry/loggerEntrySerialize.js";

import type {
  JsonLoggerFormatterOptions,
  LoggerFormatter,
  LoggerFormatterOptions,
  TextLoggerFormatterOptions,
} from "../loggerFormatter.type.js";

import { createLoggerFormatter } from "../loggerFormatter.core.js";

import { escapeLogText } from "../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

import { createJsonLoggerFormatter } from "./loggerFormatterFormatters.json.js";
import { createTextLoggerFormatter } from "./loggerFormatterFormatters.text.js";

/**
 * Creates a compact formatter intended for console output.
 */
export function createCompactLoggerFormatter(
  options: LoggerFormatterOptions = {},
): LoggerFormatter<string> {
  return createLoggerFormatter(
    (entry) => {
      const level = entry.levelName.toUpperCase();

      const logger = entry.logger ? ` ${escapeLogText(entry.logger)}:` : "";

      return `${level}${logger} ${escapeLogText(entry.message)}`;
    },
    {
      name: options.name ?? "compact",
    },
  );
}

/**
 * Creates a development formatter with detailed metadata.
 */
export function createDevelopmentLoggerFormatter(
  options: TextLoggerFormatterOptions = {},
): LoggerFormatter<string> {
  return createTextLoggerFormatter({
    ...options,

    name: options.name ?? "development",

    includeTimestamp: options.includeTimestamp ?? true,

    includeLogger: options.includeLogger ?? true,

    includeMetadata: options.includeMetadata ?? true,

    includeContext: options.includeContext ?? true,

    includeSource: options.includeSource ?? true,

    includeStackTrace: options.includeStackTrace ?? true,
  });
}

/**
 * Creates a production formatter.
 *
 * Production logs use JSON by default because structured logs are
 * easier to ingest into centralized logging systems.
 */
export function createProductionLoggerFormatter(
  options: JsonLoggerFormatterOptions = {},
): LoggerFormatter<string> {
  return createJsonLoggerFormatter({
    ...options,

    name: options.name ?? "production",
  });
}

/**
 * Creates a formatter that returns structured objects.
 */
export function createStructuredLoggerFormatter(
  options: LoggerFormatterOptions = {},
): LoggerFormatter<Record<string, unknown>> {
  return createLoggerFormatter((entry) => serializeLoggerEntry(entry), {
    name: options.name ?? "structured",
  });
}
