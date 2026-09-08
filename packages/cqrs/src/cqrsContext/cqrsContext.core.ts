import type { CqrsContext } from "../cqrsTypes/cqrsTypes.type.js";

/**
 * Standard execution context for CQRS operations.
 *
 * The context carries request-scoped information without coupling
 * commands, queries, or events to a specific transport.
 */
export interface CqrsExecutionContext extends CqrsContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Input used to create an execution context.
 */
export interface CreateExecutionContextInput {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates a unique request identifier.
 */
export function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 15)}`;
}

/**
 * Creates an immutable CQRS execution context.
 *
 * Every context belongs to a correlation chain: when no `correlationId`
 * is supplied the context starts a new chain using its own `requestId`,
 * so children created with `createChildExecutionContext` always share a
 * correlation with their root.
 */
export function createExecutionContext(
  input: CreateExecutionContextInput = {},
): CqrsExecutionContext {
  const requestId = input.requestId ?? createRequestId();

  const context: CqrsExecutionContext = {
    requestId,
    correlationId: input.correlationId ?? requestId,
    causationId: input.causationId,
    userId: input.userId,
    tenantId: input.tenantId,
    source: input.source,
    metadata: input.metadata
      ? Object.freeze({
          ...input.metadata,
        })
      : undefined,
  };

  return Object.freeze(context);
}

/**
 * Creates a child execution context while preserving correlation data.
 *
 * The child inherits the parent's correlation id; a parent without one
 * (for example a hand-built object) contributes its `requestId` instead,
 * and a fresh id is generated as a last resort, so `sharesCorrelation`
 * holds between every parent and child. `metadata` is only set when the
 * parent or the overrides supplied some.
 */
export function createChildExecutionContext(
  parent: CqrsExecutionContext,
  overrides: CreateExecutionContextInput = {},
): CqrsExecutionContext {
  const hasMetadata =
    parent.metadata !== undefined || overrides.metadata !== undefined;

  return createExecutionContext({
    requestId: overrides.requestId,
    correlationId:
      overrides.correlationId ??
      parent.correlationId ??
      parent.requestId ??
      createRequestId(),
    causationId:
      overrides.causationId ?? parent.requestId ?? parent.causationId,
    userId: overrides.userId ?? parent.userId,
    tenantId: overrides.tenantId ?? parent.tenantId,
    source: overrides.source ?? parent.source,
    metadata: hasMetadata
      ? {
          ...(parent.metadata ?? {}),
          ...(overrides.metadata ?? {}),
        }
      : undefined,
  });
}

/**
 * Adds metadata to an execution context.
 */
export function withContextMetadata(
  context: CqrsExecutionContext,
  metadata: Readonly<Record<string, unknown>>,
): CqrsExecutionContext {
  return Object.freeze({
    ...context,
    metadata: Object.freeze({
      ...(context.metadata ?? {}),
      ...metadata,
    }),
  });
}

/**
 * Adds or replaces the current user identity.
 */
export function withUser(
  context: CqrsExecutionContext,
  userId: string,
): CqrsExecutionContext {
  if (!userId.trim()) {
    throw new TypeError("User ID cannot be empty.");
  }

  return Object.freeze({
    ...context,
    userId,
  });
}

/**
 * Adds or replaces the current tenant identity.
 */
export function withTenant(
  context: CqrsExecutionContext,
  tenantId: string,
): CqrsExecutionContext {
  if (!tenantId.trim()) {
    throw new TypeError("Tenant ID cannot be empty.");
  }

  return Object.freeze({
    ...context,
    tenantId,
  });
}

/**
 * Adds or replaces the source of the CQRS operation.
 */
export function withSource(
  context: CqrsExecutionContext,
  source: string,
): CqrsExecutionContext {
  if (!source.trim()) {
    throw new TypeError("Context source cannot be empty.");
  }

  return Object.freeze({
    ...context,
    source,
  });
}

/**
 * Returns the request ID from the context.
 */
export function getRequestId(
  context?: CqrsExecutionContext,
): string | undefined {
  return context?.requestId;
}

/**
 * Returns the correlation ID from the context.
 */
export function getCorrelationId(
  context?: CqrsExecutionContext,
): string | undefined {
  return context?.correlationId;
}

/**
 * Returns the causation ID from the context.
 */
export function getCausationId(
  context?: CqrsExecutionContext,
): string | undefined {
  return context?.causationId;
}

/**
 * Returns the current user ID.
 */
export function getUserId(context?: CqrsExecutionContext): string | undefined {
  return context?.userId;
}

/**
 * Returns the current tenant ID.
 */
export function getTenantId(
  context?: CqrsExecutionContext,
): string | undefined {
  return context?.tenantId;
}

/**
 * Returns a context metadata value.
 */
export function getContextMetadata<T = unknown>(
  context: CqrsExecutionContext | undefined,
  key: string,
): T | undefined {
  return context?.metadata?.[key] as T | undefined;
}

/**
 * Determines whether the context has a user identity.
 */
export function hasUser(context?: CqrsExecutionContext): boolean {
  return Boolean(context?.userId);
}

/**
 * Determines whether the context has a tenant identity.
 */
export function hasTenant(context?: CqrsExecutionContext): boolean {
  return Boolean(context?.tenantId);
}

/**
 * Determines whether two contexts belong to the same correlation chain.
 */
export function sharesCorrelation(
  first?: CqrsExecutionContext,
  second?: CqrsExecutionContext,
): boolean {
  if (!first?.correlationId || !second?.correlationId) {
    return false;
  }

  return first.correlationId === second.correlationId;
}

/**
 * Converts an execution context into a plain serializable object.
 */
export function serializeExecutionContext(
  context: CqrsExecutionContext,
): Record<string, unknown> {
  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    causationId: context.causationId,
    userId: context.userId,
    tenantId: context.tenantId,
    source: context.source,
    metadata: context.metadata
      ? {
          ...context.metadata,
        }
      : undefined,
  };
}
