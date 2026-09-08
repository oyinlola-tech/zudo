import type { RuntimeErrorOptions } from "./runtimeError.type.js";

import { RuntimeErrorCode } from "./runtimeError.type.js";

import { RuntimeError } from "./runtimeError.base.js";

/**
 * Error thrown when a runtime operation times out.
 */
export class RuntimeTimeoutError extends RuntimeError {
  public readonly timeoutMs: number;

  public constructor(
    message: string,
    timeoutMs: number,
    options: RuntimeErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: options.code ?? RuntimeErrorCode.OPERATION_TIMEOUT,
      metadata: {
        ...(options.metadata ?? {}),
        timeoutMs,
      },
    });

    this.name = "RuntimeTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when a runtime dependency is unavailable.
 */
export class RuntimeDependencyError extends RuntimeError {
  public readonly dependency: string;

  public constructor(
    dependency: string,
    options: Omit<RuntimeErrorOptions, "code"> = {},
  ) {
    super(`Required runtime dependency "${dependency}" is not available.`, {
      ...options,
      code: RuntimeErrorCode.MISSING_DEPENDENCY,
      metadata: {
        ...(options.metadata ?? {}),
        dependency,
      },
    });

    this.name = "RuntimeDependencyError";
    this.dependency = dependency;
  }
}

/**
 * Error thrown when the runtime is not ready.
 */
export class RuntimeNotReadyError extends RuntimeError {
  public constructor(
    message: string = "Runtime is not ready.",
    options: Omit<RuntimeErrorOptions, "code"> = {},
  ) {
    super(message, {
      ...options,
      code: RuntimeErrorCode.RUNTIME_NOT_READY,
    });

    this.name = "RuntimeNotReadyError";
  }
}

/**
 * Error thrown when a runtime operation is unsupported.
 */
export class RuntimeUnsupportedOperationError extends RuntimeError {
  public constructor(
    operation: string,
    options: Omit<RuntimeErrorOptions, "code"> = {},
  ) {
    super(`Runtime operation "${operation}" is not supported.`, {
      ...options,
      code: RuntimeErrorCode.UNSUPPORTED_OPERATION,
      metadata: {
        ...(options.metadata ?? {}),
        operation,
      },
    });

    this.name = "RuntimeUnsupportedOperationError";
  }
}

/**
 * Error thrown when a runtime operation is cancelled.
 */
export class RuntimeCancellationError extends RuntimeError {
  public constructor(
    message: string = "Runtime operation was cancelled.",
    options: Omit<RuntimeErrorOptions, "code"> = {},
  ) {
    super(message, {
      ...options,
      code: RuntimeErrorCode.OPERATION_CANCELLED,
    });

    this.name = "RuntimeCancellationError";
  }
}
