/**
 * Core logger formatter functions.
 */

import type { LoggerEntry } from "../loggerEntry/loggerEntry.type.js";

import type {
  LoggerFormattedOutput,
  LoggerFormatter,
  LoggerFormatterContext,
  LoggerFormatterLike,
  LoggerFormatterOptions,
} from "./loggerFormatter.type.js";

import { LoggerFormatterNotFoundError } from "../loggerErrors/loggerError.base.js";

import {
  createLoggerFormatterId,
  isLoggerFormatterFunction,
  isLoggerFormatterObject,
  isLoggerFormatter,
} from "./loggerFormatterGuard.js";

/**
 * Creates a function-backed formatter.
 */
export function createLoggerFormatter<
  TOutput extends LoggerFormattedOutput = LoggerFormattedOutput,
>(
  formatter: LoggerFormatterLike<TOutput>,
  options: LoggerFormatterOptions = {},
): LoggerFormatter<TOutput> {
  if (!isLoggerFormatter(formatter)) {
    throw new TypeError("Invalid logger formatter.");
  }

  const name =
    options.name ??
    (isLoggerFormatterObject(formatter)
      ? formatter.name
      : createLoggerFormatterId());

  return Object.freeze({
    name,

    format(entry: LoggerEntry, context: LoggerFormatterContext = {}): TOutput {
      if (isLoggerFormatterFunction(formatter)) {
        return formatter(entry, context);
      }

      if (typeof formatter === "string") {
        throw new LoggerFormatterNotFoundError(formatter);
      }

      return formatter.format(entry, context);
    },
  });
}

/**
 * Formats an entry through a formatter.
 */
export function formatLoggerEntry<
  TOutput extends LoggerFormattedOutput = LoggerFormattedOutput,
>(
  formatter: LoggerFormatterLike<TOutput>,
  entry: LoggerEntry,
  context: LoggerFormatterContext = {},
): TOutput {
  if (isLoggerFormatterFunction(formatter)) {
    return formatter(entry, context);
  }

  if (typeof formatter === "string") {
    throw new LoggerFormatterNotFoundError(formatter);
  }

  return formatter.format(entry, context);
}
