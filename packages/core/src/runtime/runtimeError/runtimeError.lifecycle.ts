import type { RuntimeErrorOptions } from "./runtimeError.type.js";

import { RuntimeErrorCode } from "./runtimeError.type.js";

import { RuntimeError } from "./runtimeError.base.js";

/**
 * Error thrown when an operation is attempted while the runtime is
 * in a state that does not permit it (for example starting a runtime
 * that is stopping, or stopping one that is still bootstrapping).
 */
export class InvalidRuntimeStateError extends RuntimeError {
  /**
   * The runtime state in which the operation was rejected.
   */
  public readonly state?: string;

  public constructor(
    message: string,
    options: Omit<RuntimeErrorOptions, "code"> & {
      readonly state?: string;
    } = {},
  ) {
    const { state, ...rest } = options;

    super(message, {
      ...rest,
      code: RuntimeErrorCode.INVALID_STATE_TRANSITION,
      metadata: {
        ...(rest.metadata ?? {}),
        ...(state !== undefined && { state }),
      },
    });

    this.name = "InvalidRuntimeStateError";
    this.state = state;
  }
}

/**
 * Error thrown when a runtime state transition is not allowed by the
 * runtime state table.
 */
export class InvalidRuntimeTransitionError extends RuntimeError {
  public readonly from: string;
  public readonly to: string;

  public constructor(
    from: string,
    to: string,
    options: Omit<RuntimeErrorOptions, "code"> = {},
  ) {
    super(`Invalid runtime state transition from "${from}" to "${to}".`, {
      ...options,
      code: RuntimeErrorCode.INVALID_STATE_TRANSITION,
      metadata: {
        ...(options.metadata ?? {}),
        from,
        to,
      },
    });

    this.name = "InvalidRuntimeTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Error thrown when runtime startup (bootstrap) fails.
 */
export class RuntimeStartError extends RuntimeError {
  public constructor(
    message: string,
    options: Omit<RuntimeErrorOptions, "operation"> = {},
  ) {
    super(message, {
      ...options,
      operation: "start",
      code: options.code ?? RuntimeErrorCode.BOOTSTRAP_FAILED,
    });

    this.name = "RuntimeStartError";
  }
}

/**
 * Error thrown when runtime shutdown fails.
 */
export class RuntimeStopError extends RuntimeError {
  public constructor(
    message: string,
    options: Omit<RuntimeErrorOptions, "operation"> = {},
  ) {
    super(message, {
      ...options,
      operation: "stop",
      code: options.code ?? RuntimeErrorCode.SHUTDOWN_FAILED,
    });

    this.name = "RuntimeStopError";
  }
}

/**
 * Error thrown when module initialization fails during bootstrap.
 */
export class RuntimeInitializationError extends RuntimeError {
  public constructor(
    message: string,
    options: Omit<RuntimeErrorOptions, "operation"> = {},
  ) {
    super(message, {
      ...options,
      operation: "initialize",
      code: options.code ?? RuntimeErrorCode.MODULE_INITIALIZATION_FAILED,
    });

    this.name = "RuntimeInitializationError";
  }
}

/**
 * Error thrown when module loading fails during bootstrap.
 */
export class RuntimeLoadError extends RuntimeError {
  public constructor(
    message: string,
    options: Omit<RuntimeErrorOptions, "operation"> = {},
  ) {
    super(message, {
      ...options,
      operation: "load",
      code: options.code ?? RuntimeErrorCode.MODULE_LOAD_FAILED,
    });

    this.name = "RuntimeLoadError";
  }
}
