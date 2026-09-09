/**
 * Logger context creation and manipulation.
 */

import type {
  LoggerContext,
  LoggerContextData,
  LoggerContextIdentifiers,
  LoggerContextOptions,
} from "./loggerContext.type.js";

/**
 * Generates a unique context identifier.
 */
export function createLoggerContextId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `ctx:${crypto.randomUUID()}`;
  }

  return [
    "ctx",
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join(":");
}

/**
 * Creates a logger context.
 */
export function createLoggerContext(
  options: LoggerContextOptions = {},
): LoggerContext {
  const parent = options.parent;

  const identifiers: LoggerContextIdentifiers = Object.freeze({
    ...(parent?.identifiers ?? {}),
    ...(options.correlationId !== undefined
      ? { correlationId: options.correlationId }
      : {}),
    ...(options.requestId !== undefined
      ? { requestId: options.requestId }
      : {}),
    ...(options.traceId !== undefined ? { traceId: options.traceId } : {}),
    ...(options.spanId !== undefined ? { spanId: options.spanId } : {}),
    ...(options.userId !== undefined ? { userId: options.userId } : {}),
    ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
    ...(options.sessionId !== undefined
      ? { sessionId: options.sessionId }
      : {}),
    ...(options.jobId !== undefined ? { jobId: options.jobId } : {}),
    ...(options.moduleId !== undefined ? { moduleId: options.moduleId } : {}),
    ...(options.operationId !== undefined
      ? { operationId: options.operationId }
      : {}),
  });

  const metadata: LoggerContextData = Object.freeze({
    ...(parent?.metadata ?? {}),
    ...(options.metadata ?? {}),
  });

  return Object.freeze({ identifiers, metadata });
}

/**
 * Creates an empty logger context.
 */
export function createEmptyLoggerContext(): LoggerContext {
  return createLoggerContext();
}

/**
 * Merges two logger contexts.
 *
 * Values in `override` take precedence.
 */
export function mergeLoggerContexts(
  base: LoggerContext,
  override: LoggerContext,
): LoggerContext {
  return createLoggerContext({
    parent: base,
    ...override.identifiers,
    metadata: override.metadata,
  });
}

/**
 * Extends a logger context with metadata.
 */
export function withLoggerContext(
  context: LoggerContext,
  metadata: LoggerContextData,
): LoggerContext {
  return createLoggerContext({
    parent: context,
    metadata,
  });
}

/**
 * Extends a logger context with identifiers.
 */
export function withLoggerIdentifiers(
  context: LoggerContext,
  identifiers: LoggerContextIdentifiers,
): LoggerContext {
  return createLoggerContext({
    parent: context,
    ...identifiers,
  });
}
