import {
  RuntimeError,
  RuntimeStateError as BaseRuntimeStateError,
} from "@zudojs/errors";

/**
 * Error thrown when an invalid runtime state is encountered.
 */
export class RuntimeStateError extends BaseRuntimeStateError {
  public constructor(message: string) {
    super(message);
  }
}

/**
 * Error thrown when runtime startup fails.
 */
export class RuntimeStartError extends RuntimeError {
  public override readonly phase: string;
  public readonly failedModuleId?: string;

  public constructor(
    message: string,
    options: {
      readonly phase: string;
      readonly failedModuleId?: string;
      readonly cause?: Error;
    },
  ) {
    super(message, {
      cause: options.cause,
      metadata: {
        phase: options.phase,
        failedModuleId: options.failedModuleId,
      },
    });

    this.phase = options.phase;
    this.failedModuleId = options.failedModuleId;
  }
}

/**
 * Error thrown when runtime shutdown fails.
 */
export class RuntimeStopError extends RuntimeError {
  public override readonly phase: string;

  public constructor(
    message: string,
    options: {
      readonly phase: string;
      readonly cause?: Error;
    },
  ) {
    super(message, {
      cause: options.cause,
      metadata: {
        phase: options.phase,
      },
    });

    this.phase = options.phase;
  }
}

/**
 * Error thrown when startup fails during initialization: a module's
 * `onInitialize` threw, or the configuration manager failed to load.
 *
 * A {@link RuntimeStartError} with `phase: "initialize"`, so handlers
 * written against `RuntimeStartError` keep matching. `cause` is the
 * original error and `failedModuleId` names the module (absent for a
 * configuration failure).
 */
export class RuntimeInitializationError extends RuntimeStartError {
  public constructor(
    message: string,
    options: {
      readonly cause?: Error;
      readonly failedModuleId?: string;
    } = {},
  ) {
    super(message, {
      phase: "initialize",
      ...(options.cause !== undefined && { cause: options.cause }),
      ...(options.failedModuleId !== undefined && {
        failedModuleId: options.failedModuleId,
      }),
    });
  }
}

/**
 * Error thrown when a runtime timeout occurs.
 */
export class RuntimeTimeoutError extends RuntimeError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  public constructor(operation: string, timeoutMs: number) {
    super(`Runtime operation "${operation}" timed out after ${timeoutMs}ms.`, {
      metadata: {
        operation,
        timeoutMs,
      },
    });

    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when startup failed and the rollback that followed failed
 * too, so some module may still hold resources.
 *
 * A {@link RuntimeStartError} describing the ORIGINAL failure: `phase`,
 * `failedModuleId` and `cause` (what the module threw) match the error
 * `start()` would otherwise have rejected with, which is kept whole as
 * `originalError`. `rollbackError` is what failed during rollback (an
 * `AggregateError` when several modules failed). Call `stop()` to retry
 * releasing what rollback did not reach.
 */
export class RuntimeRollbackError extends RuntimeStartError {
  public readonly originalError: Error;
  public readonly rollbackError: Error;

  public constructor(originalError: Error, rollbackError: Error) {
    const start =
      originalError instanceof RuntimeStartError ? originalError : undefined;
    const cause =
      start !== undefined && start.cause instanceof Error
        ? start.cause
        : originalError;

    super(
      `${originalError.message} Rollback also failed: ${rollbackError.message}`,
      {
        phase: start?.phase ?? "startup",
        cause,
        ...(start?.failedModuleId !== undefined && {
          failedModuleId: start.failedModuleId,
        }),
      },
    );

    this.originalError = originalError;
    this.rollbackError = rollbackError;
  }
}

/**
 * Error thrown when a circular dependency is detected.
 */
export class RuntimeCircularDependencyError extends RuntimeError {
  public readonly cycle: readonly string[];

  public constructor(cycle: readonly string[]) {
    super(
      `Circular module dependency detected: ${cycle.join(" -> ")} -> ${cycle[0]}.`,
      {
        metadata: {
          cycle: [...cycle],
        },
      },
    );

    this.cycle = Object.freeze([...cycle]);
  }
}

/**
 * Error thrown when a module dependency cannot be resolved.
 */
export class RuntimeDependencyError extends RuntimeError {
  public readonly moduleId: string;
  public readonly dependencyId: string;

  public constructor(moduleId: string, dependencyId: string) {
    super(
      `Module "${moduleId}" depends on "${dependencyId}" which is not registered.`,
      {
        metadata: {
          moduleId,
          dependencyId,
        },
      },
    );

    this.moduleId = moduleId;
    this.dependencyId = dependencyId;
  }
}

/**
 * Reports a shutdown triggered by a signal (`SIGTERM`, `SIGINT`, or
 * `"fatal"` for an uncaught exception or unhandled rejection) that failed.
 *
 * Signal listeners have no caller to throw to, so the signal handler logs
 * this error (as the `error` field of its "Shutdown handler failed." log
 * entry) with the shutdown failure as `cause`.
 */
export class RuntimeSignalError extends RuntimeError {
  public readonly signal: string;

  public constructor(
    signal: string,
    options: { readonly cause?: unknown } = {},
  ) {
    const detail =
      options.cause === undefined
        ? undefined
        : options.cause instanceof Error
          ? options.cause.message
          : String(options.cause);

    super(
      detail === undefined
        ? `Runtime received unexpected signal "${signal}".`
        : `Shutdown triggered by "${signal}" failed: ${detail}`,
      {
        ...(options.cause instanceof Error && { cause: options.cause }),
        metadata: {
          signal,
        },
      },
    );

    this.signal = signal;
  }
}

/**
 * Converts an unknown error to a RuntimeError.
 */
export function toRuntimeError(
  error: unknown,
  phase: string = "unknown",
): RuntimeError {
  if (error instanceof RuntimeError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new RuntimeError(message, {
    cause: error instanceof Error ? error : undefined,
    metadata: { phase },
  });
}
