/**
 * @zudojs/testing — Logger context handling for the spy logger.
 *
 * @module spyLogger/spyLogger.context
 */

import type { LogMetadata, LogValue, LoggerContext } from "@zudojs/logger";

/** Merges two logger contexts, preserving the nested shape. */
export function mergeLoggerContext(
  base: LoggerContext | undefined,
  next: LoggerContext,
): LoggerContext {
  if (!base) return next;
  return {
    identifiers: { ...base.identifiers, ...next.identifiers },
    metadata: { ...base.metadata, ...next.metadata },
  };
}

/**
 * Flattens a logger context onto a call's metadata.
 *
 * `LoggerContext` nests identifiers and metadata, so it is flattened rather
 * than spread wholesale: a test asserting on `tenantId` should find it at the
 * top level, the way a real transport would render it.
 */
export function mergeContext(
  context: LoggerContext | undefined,
  metadata: LogMetadata | undefined,
): LogMetadata | undefined {
  if (!context) return metadata;

  return {
    ...(context.identifiers as Record<string, LogValue>),
    ...(context.metadata as Record<string, LogValue>),
    ...metadata,
  };
}

/** Structural comparison, so object metadata can actually be matched. */
export function deepMatches(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (typeof actual !== "object" || typeof expected !== "object") return false;
  if (actual === null || expected === null) return false;
  return JSON.stringify(actual) === JSON.stringify(expected);
}
