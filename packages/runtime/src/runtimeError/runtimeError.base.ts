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
 * Error thrown when runtime initialization fails.
 */
export class RuntimeInitializationError extends RuntimeError {
  public constructor(
    message: string,
    options: {
      readonly cause?: Error;
    } = {},
  ) {
    super(message, {
      cause: options.cause,
      metadata: {
        phase: "initialization",
      },
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
 * Error thrown when runtime rollback fails.
 */
export class RuntimeRollbackError extends RuntimeError {
  public readonly originalError: Error;
  public readonly rollbackError: Error;

  public constructor(originalError: Error, rollbackError: Error) {
    super("Runtime rollback failed. Original error suppressed.", {
      cause: rollbackError,
      metadata: {
        originalErrorMessage: originalError.message,
        rollbackErrorMessage: rollbackError.message,
      },
    });

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
 * Error thrown when runtime receives multiple signals.
 */
export class RuntimeSignalError extends RuntimeError {
  public readonly signal: string;

  public constructor(signal: string) {
    super(`Runtime received unexpected signal "${signal}".`, {
      metadata: {
        signal,
      },
    });

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
