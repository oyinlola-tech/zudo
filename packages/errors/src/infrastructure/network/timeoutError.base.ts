/**
 * Base TimeoutError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Timeout operation types used for diagnostics. */
export enum TimeoutOperation {
  UNKNOWN = "unknown",
  REQUEST = "request",
  DATABASE = "database",
  NETWORK = "network",
  CACHE = "cache",
  QUEUE = "queue",
  JOB = "job",
  LOCK = "lock",
  EXTERNAL_SERVICE = "external_service",
}

/** Options for creating a timeout error. */
export interface TimeoutErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly operation?: TimeoutOperation;
  readonly timeoutMs?: number;
  readonly target?: string;
}

/** Error raised when an operation exceeds its allowed execution time. */
export class TimeoutError extends BaseError {
  public readonly operation: TimeoutOperation;
  public readonly timeoutMs?: number;
  public readonly target?: string;

  constructor(
    message = "The operation timed out.",
    options: TimeoutErrorOptions = {},
  ) {
    validateTimeout(options.timeoutMs);
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.TIMEOUT,
      category: options.category ?? ErrorCategory.TIMEOUT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 504,
      expose: options.expose ?? isPublicTimeoutOperation(options.operation),
      isOperational: options.isOperational ?? true,
      metadata: {
        ...options.metadata,
        ...(options.operation !== undefined
          ? { operation: options.operation }
          : {}),
        ...(options.timeoutMs !== undefined
          ? { timeoutMs: options.timeoutMs }
          : {}),
        ...(options.target !== undefined ? { target: options.target } : {}),
      },
    });
    this.operation = options.operation ?? TimeoutOperation.UNKNOWN;
    this.timeoutMs = options.timeoutMs;
    this.target = options.target;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      operation: this.operation,
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      ...(this.target !== undefined ? { target: this.target } : {}),
    };
  }
}

/** Creates a timeout error. */
export function createTimeoutError(
  message = "The operation timed out.",
  options: TimeoutErrorOptions = {},
): TimeoutError {
  return new TimeoutError(message, options);
}

/** Determines whether an unknown value is a TimeoutError. */
export function isTimeoutError(value: unknown): value is TimeoutError {
  return value instanceof TimeoutError;
}

/**
 * Returns whether a timeout operation may expose its message (and target) to
 * clients. Only request-level timeouts are public by default; database,
 * cache, queue, lock, network and external-service timeouts describe internal
 * resources and stay internal.
 */
export function isPublicTimeoutOperation(
  operation: TimeoutOperation | undefined,
): boolean {
  return (
    operation === undefined ||
    operation === TimeoutOperation.UNKNOWN ||
    operation === TimeoutOperation.REQUEST
  );
}

/** Validates a timeout duration. */
function validateTimeout(timeoutMs: number | undefined): void {
  if (timeoutMs === undefined) {
    return;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError("timeoutMs must be a finite non-negative number.");
  }
}
