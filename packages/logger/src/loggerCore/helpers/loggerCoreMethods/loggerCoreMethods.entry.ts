/**
 * Logger entry creation for dispatch.
 */

import type { LoggerLevel } from "../../../loggerLevel/loggerLevel.type.js";

import type {
  LogMetadata,
  LoggerEntry,
  LoggerEntryInput,
} from "../../../loggerEntry/loggerEntry.type.js";

import { createLoggerEntry } from "../../../loggerEntry/loggerEntry.core.js";

import {
  createSecretMatcher,
  redactLogValue,
  LOGGER_REDACTION_TOKEN,
} from "../../../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

import {
  contextToLogMetadata,
  createLoggerContext,
} from "../../../loggerContext/loggerContext.core.js";

import type {
  LoggerConfiguration,
  LogOptions,
} from "../../../loggerOptions/loggerOptions.type.js";

/**
 * Creates a normalized log entry.
 *
 * @param onMetadataError - Notified when a metadata property could not
 *   be read (a throwing getter). The field is replaced with a marker
 *   and the entry is still produced, so the caller's log statement
 *   never aborts; reporting is the caller's job.
 */
export function createEntry(
  configuration: LoggerConfiguration,
  contextStorage: {
    get():
      | import("../../../loggerContext/loggerContext.core.js").LoggerContext
      | undefined;
  },
  level: LoggerLevel,
  message: string,
  options: LogOptions,
  onMetadataError?: (key: string, error: unknown) => void,
): LoggerEntry {
  const activeContext = configuration.inheritContext
    ? contextStorage.get()
    : undefined;

  const contextMetadata = activeContext
    ? contextToLogMetadata(activeContext)
    : {};

  // Per-call `options.context` flows into metadata exactly like the ambient
  // context does. It used to reach only `entry.context.metadata`, which the
  // text formatters never print, so `log(level, msg, { context })` silently
  // dropped the data from every text-shaped line.
  const rawMetadata = {
    ...configuration.metadata,
    ...contextMetadata,
    ...(options.context ?? {}),
    ...(options.metadata ?? {}),
  };

  // Redaction is applied HERE, before the entry is frozen, so every
  // formatter and every transport sees the already-masked value and no
  // path can bypass it — including nested objects, arrays and getters.
  const isSecret = createSecretMatcher(configuration.redact);

  const replacement =
    configuration.redact.replacement ?? LOGGER_REDACTION_TOKEN;

  const metadata = redactLogValue(
    rawMetadata,
    isSecret,
    replacement,
    undefined,
    onMetadataError,
  ) as LogMetadata;

  const context = options.context
    ? createLoggerContext({
        parent: activeContext,
        metadata: options.context,
      })
    : activeContext;

  const input: LoggerEntryInput = {
    level,
    message,
    metadata,
    // `LoggerEntryContext` declares the correlation identifiers, but they
    // were never copied here, so a transport reading `entry.context.requestId`
    // always saw `undefined`.
    context: context
      ? {
          ...context.identifiers,
          metadata: redactLogValue(
            context.metadata,
            isSecret,
            replacement,
            undefined,
            onMetadataError,
          ) as import("../../../loggerEntry/loggerEntry.type.js").LogMetadata,
        }
      : undefined,
    source: options.source,
    error: options.error,
    logger: options.logger ?? configuration.name,
    timestamp: options.timestamp,
    environment: configuration.environment,
  };

  return createLoggerEntry(input);
}
