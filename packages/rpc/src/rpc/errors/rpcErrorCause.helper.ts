/**
 * Attaches a cause to an error whose constructor takes none.
 *
 * The `@zudojs/errors` RPC classes fix their options in the constructor, so
 * an error that wraps another (a transport failure wrapping a fetch error,
 * an unavailable error wrapping a downstream timeout) gets its `cause` set
 * afterwards. Non-enumerable, like the platform's own `Error.cause`, so it
 * is not serialized by accident.
 */
export function withCause<T extends Error>(error: T, cause: unknown): T {
  Object.defineProperty(error, "cause", {
    value: cause,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}
