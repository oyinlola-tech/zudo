import { ContextValueNotFoundError } from "../../errors/contextValueNotFound.error.js";
import { InvalidArgumentError } from "../../errors/exceptions.js";

/**
 * A typed key used to store and retrieve values from
 * an execution context.
 *
 * The generic type represents the value associated with
 * the key.
 */
export interface ContextKey<T> {
  /**
   * Unique key identifier.
   */
  readonly id: symbol;

  /**
   * Human-readable key name.
   *
   * Useful for debugging and diagnostics.
   */
  readonly name: string;
}

/**
 * Creates a strongly typed ContextKey.
 *
 * Example:
 *
 * const userKey = createContextKey<User>(
 *   "authenticated-user",
 * );
 */
export function createContextKey<T>(name: string): ContextKey<T> {
  if (!name.trim()) {
    throw new InvalidArgumentError("Context key name cannot be empty.");
  }

  return Object.freeze({
    id: Symbol(name),
    name,
  });
}

/**
 * Internal storage used by the execution context
 * for strongly typed values.
 */
export type ContextValueStore = Map<symbol, unknown>;

/**
 * Stores a value against a context key.
 */
export function setContextValue<T>(
  store: ContextValueStore,
  key: ContextKey<T>,
  value: T,
): void {
  store.set(key.id, value);
}

/**
 * Retrieves a value associated with a context key.
 *
 * Returns undefined when the key has not been registered
 * in the current context.
 */
export function getContextValue<T>(
  store: ContextValueStore,
  key: ContextKey<T>,
): T | undefined {
  return store.get(key.id) as T | undefined;
}

/**
 * Retrieves a required context value.
 *
 * Throws when the value does not exist.
 */
export function requireContextValue<T>(
  store: ContextValueStore,
  key: ContextKey<T>,
): T {
  const value = getContextValue(store, key);

  if (value === undefined) {
    throw new ContextValueNotFoundError(key.name);
  }

  return value;
}

/**
 * Checks whether a context value exists.
 */
export function hasContextValue<T>(
  store: ContextValueStore,
  key: ContextKey<T>,
): boolean {
  return store.has(key.id);
}

/**
 * Removes a context value.
 */
export function deleteContextValue<T>(
  store: ContextValueStore,
  key: ContextKey<T>,
): boolean {
  return store.delete(key.id);
}
