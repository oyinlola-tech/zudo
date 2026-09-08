import {
  HandlerConfigurationError,
  InvalidHandlerTypeError,
  InvalidMiddlewareError,
} from "../cqrsErrors/cqrsError.base.js";

/**
 * Handler kinds accepted by the validation helpers.
 */
export type ValidatedHandlerKind = "command" | "query";

/**
 * Determines whether a value is a well-formed handler type discriminator:
 * a non-empty string without leading or trailing whitespace.
 */
export function isValidHandlerType(type: unknown): type is string {
  return (
    typeof type === "string" && type.length > 0 && type.trim() === type
  );
}

/**
 * Asserts that a handler type discriminator is well-formed.
 *
 * Registration keys are stored verbatim, so surrounding whitespace is
 * rejected instead of silently creating an unreachable registration.
 */
export function assertHandlerType(
  kind: ValidatedHandlerKind,
  type: unknown,
): asserts type is string {
  if (!isValidHandlerType(type)) {
    throw new InvalidHandlerTypeError(kind, type);
  }
}

/**
 * Determines whether a value can be executed as a handler: either a
 * function or an object exposing a callable `execute` method.
 */
export function isExecutableHandler(
  value: unknown,
): value is
  | ((...args: unknown[]) => unknown)
  | { execute: (...args: unknown[]) => unknown } {
  if (typeof value === "function") {
    return true;
  }

  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { execute?: unknown }).execute === "function"
  );
}

/**
 * Asserts that a value can be executed as a handler.
 */
export function assertExecutableHandler(
  kind: ValidatedHandlerKind,
  type: string,
  handler: unknown,
): void {
  if (!isExecutableHandler(handler)) {
    throw new HandlerConfigurationError(
      `A valid ${kind} handler (a function or an object with an execute() method) is required for "${type}".`,
      {
        handlerKind: kind,
        handlerType: type,
      },
    );
  }
}

/**
 * Asserts that a value is a middleware function.
 */
export function assertMiddleware(
  kind: ValidatedHandlerKind,
  middleware: unknown,
): asserts middleware is (...args: unknown[]) => unknown {
  if (typeof middleware !== "function") {
    throw new InvalidMiddlewareError(
      `${kind === "command" ? "Command" : "Query"} middleware must be a function.`,
      {
        handlerKind: kind,
      },
    );
  }
}
