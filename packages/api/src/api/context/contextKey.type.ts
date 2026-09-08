/**
 * @zudojs/api/context-key
 *
 * Typed context keys for the API context system.
 *
 * Context keys allow type-safe storage and retrieval of values
 * from the API context without creating a god object.
 */

/**
 * A typed key for storing and retrieving values from the API context.
 *
 * Keys carry a unique `id` symbol, so two keys created with the same
 * `name` are distinct slots: a third-party key can never collide with —
 * or be read as the wrong type through — a key owned by someone else.
 * `name` is retained for debugging and for the context's `metadata` view.
 *
 * Keys must be created with {@link createContextKey}; the `id` symbol is
 * the identity the context stores values under.
 */
export interface APIContextKey<T> {
  readonly name: string;

  /** Unique identity for this key. Two keys never share an id. */
  readonly id: symbol;

  /** Phantom type carrier. Never populated at runtime. */
  readonly type: T;
}

/**
 * Creates a typed context key.
 *
 * @throws {TypeError} if `name` is not a non-empty string.
 */
export function createContextKey<T>(name: string): APIContextKey<T> {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("Context key name must be a non-empty string.");
  }

  return Object.freeze({
    name,
    id: Symbol(name),
    type: undefined as unknown as T,
  });
}

/**
 * Well-known context keys for common cross-cutting concerns.
 */
export const RequestIdContextKey =
  /* #__PURE__ */ createContextKey<string>("requestId");

export const CorrelationIdContextKey =
  /* #__PURE__ */ createContextKey<string>("correlationId");

export const TenantIdContextKey =
  /* #__PURE__ */ createContextKey<string>("tenantId");

export const UserIdContextKey =
  /* #__PURE__ */ createContextKey<string>("userId");

export const StartTimeContextKey =
  /* #__PURE__ */ createContextKey<number>("startTime");
