import { RuntimeError } from "./runtimeError.base.js";

import type {
  RuntimeErrorOptions,
  RuntimeErrorCode,
} from "./runtimeError.type.js";

import type { RuntimeError as RuntimeErrorType } from "./runtimeError.base.js";

/**
 * Runtime Errors
 *
 * Error classes and utilities for runtime failures.
 */

export { RuntimeError } from "./runtimeError.base.js";

export {
  InvalidRuntimeStateError,
  InvalidRuntimeTransitionError,
  RuntimeStartError,
  RuntimeStopError,
  RuntimeInitializationError,
  RuntimeLoadError,
} from "./runtimeError.lifecycle.js";

export {
  RuntimeTimeoutError,
  RuntimeDependencyError,
  RuntimeNotReadyError,
  RuntimeUnsupportedOperationError,
  RuntimeCancellationError,
} from "./runtimeError.specialized.js";

export { RuntimeErrorCode } from "./runtimeError.type.js";

export type {
  RuntimeOperation,
  RuntimeErrorPhase,
  RuntimeErrorMetadata,
  RuntimeErrorOptions,
  RuntimeErrorJSON,
} from "./runtimeError.type.js";

/**
 * Creates a RuntimeError from an unknown thrown value.
 */
export function toRuntimeError(
  error: unknown,
  options: RuntimeErrorOptions = {},
): RuntimeErrorType {
  if (error instanceof RuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    return new RuntimeError(error.message, {
      ...options,
      cause: error,
    });
  }

  return new RuntimeError(String(error), {
    ...options,
    cause: error,
  });
}

/**
 * Checks whether an unknown value is a RuntimeError.
 */
export function isRuntimeError(error: unknown): error is RuntimeErrorType {
  return error instanceof RuntimeError;
}

/**
 * Checks whether an unknown error has a specific runtime code.
 */
export function hasRuntimeErrorCode(
  error: unknown,
  code: RuntimeErrorCode,
): boolean {
  return isRuntimeError(error) && error.code === code;
}

/**
 * Creates a runtime error with contextual information.
 */
export function createRuntimeError(
  message: string,
  options: RuntimeErrorOptions = {},
): RuntimeErrorType {
  return new RuntimeError(message, options);
}
