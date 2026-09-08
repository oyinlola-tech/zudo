/**
 * Error extraction utilities — message, name, stack, root cause.
 */

import { isBaseError } from "../base/utils/baseError.utils.js";
import { BaseError } from "../base/core/baseError.core.js";
import { isErrorLike } from "./errorUtils.typeCheck.js";

/** Returns the message from an unknown thrown value. */
export function getErrorMessage(
  value: unknown,
  fallback = "An unexpected error occurred.",
): string {
  if (value instanceof Error) {
    return value.message || fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (isErrorLike(value)) {
    return value.message;
  }
  return fallback;
}

/** Returns the name from an unknown thrown value. */
export function getErrorName(value: unknown, fallback = "Error"): string {
  if (value instanceof Error) {
    return value.name || fallback;
  }
  if (isErrorLike(value) && typeof value.name === "string") {
    return value.name;
  }
  return fallback;
}

/** Returns the stack trace from an unknown thrown value. */
export function getErrorStack(value: unknown): string | undefined {
  if (value instanceof Error) {
    return value.stack;
  }
  if (isErrorLike(value)) {
    return value.stack;
  }
  return undefined;
}

/** Returns the root cause of an error chain. */
export function getRootCause(value: unknown): unknown {
  let current = value;
  const visited = new Set<unknown>();

  while (
    current instanceof Error &&
    "cause" in current &&
    current.cause !== undefined &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = current.cause;
  }

  return current;
}

/** Returns the deepest BaseError in an error chain. */
export function getRootBaseError(value: unknown): BaseError | undefined {
  let current: unknown = value;
  let result: BaseError | undefined;
  const visited = new Set<unknown>();

  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);
    if (isBaseError(current)) {
      result = current;
    }
    if (current instanceof Error && "cause" in current) {
      current = current.cause;
      continue;
    }
    break;
  }

  return result;
}

/** Extracts a plain object of useful error diagnostics. */
export function getErrorDiagnostics(value: unknown): Record<string, unknown> {
  const diagnostics: Record<string, unknown> = {
    name: getErrorName(value),
    message: getErrorMessage(value),
  };

  const stack = getErrorStack(value);
  if (stack !== undefined) {
    diagnostics.stack = stack;
  }

  if (isBaseError(value)) {
    diagnostics.code = value.code;
    diagnostics.category = value.category;
    diagnostics.severity = value.severity;
    diagnostics.statusCode = value.statusCode;
    diagnostics.isOperational = value.isOperational;
    diagnostics.expose = value.expose;
  }

  return diagnostics;
}
