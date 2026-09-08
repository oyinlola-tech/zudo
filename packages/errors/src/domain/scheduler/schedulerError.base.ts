/**
 * Base SchedulerError class, options, factories, and lifecycle errors.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating a scheduler error. */
export interface SchedulerErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly jobId?: string;
  readonly scheduleId?: string;
}

/** Base error for all scheduler failures. */
export class SchedulerError extends BaseError {
  public readonly jobId?: string;
  public readonly scheduleId?: string;

  constructor(message: string, options: SchedulerErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.SCHEDULER_ERROR,
      category: options.category ?? ErrorCategory.SCHEDULER,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.jobId = options.jobId;
    this.scheduleId = options.scheduleId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.jobId !== undefined ? { jobId: this.jobId } : {}),
      ...(this.scheduleId !== undefined ? { scheduleId: this.scheduleId } : {}),
    };
  }
}

/** Creates a scheduler error. */
export function createSchedulerError(
  message: string,
  options: SchedulerErrorOptions = {},
): SchedulerError {
  return new SchedulerError(message, options);
}

/** Determines whether an unknown value is a SchedulerError. */
export function isSchedulerError(value: unknown): value is SchedulerError {
  return value instanceof SchedulerError;
}

/**
 * Error thrown when the scheduler has not been started.
 *
 * Scheduler state is a server-side concern: reported as 503 (temporarily
 * unavailable), not exposed, non-operational.
 */
export class SchedulerNotStartedError extends SchedulerError {
  constructor() {
    super("Scheduler has not been started.", {
      code: ErrorCode.SCHEDULER_NOT_STARTED,
      statusCode: 503,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when the scheduler is already started.
 *
 * Scheduler state is a server-side concern: reported as internal.
 */
export class SchedulerAlreadyStartedError extends SchedulerError {
  constructor() {
    super("Scheduler is already started.", {
      code: ErrorCode.SCHEDULER_ALREADY_STARTED,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when the scheduler is stopped.
 *
 * Scheduler state is a server-side concern: reported as 503 (temporarily
 * unavailable), not exposed, non-operational.
 */
export class SchedulerStoppedError extends SchedulerError {
  constructor() {
    super("Scheduler is stopped.", {
      code: ErrorCode.SCHEDULER_STOPPED,
      statusCode: 503,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when a job is not found. */
export class SchedulerJobNotFoundError extends SchedulerError {
  constructor(jobId: string) {
    super(`Job "${jobId}" is not registered.`, {
      code: ErrorCode.SCHEDULER_JOB_NOT_FOUND,
      jobId,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when a job already exists. */
export class SchedulerJobAlreadyExistsError extends SchedulerError {
  constructor(jobId: string) {
    super(`Job "${jobId}" already exists.`, {
      code: ErrorCode.SCHEDULER_JOB_ALREADY_EXISTS,
      jobId,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when a job definition is invalid. */
export class InvalidJobError extends SchedulerError {
  constructor(message: string, jobId?: string) {
    super(message, {
      code: ErrorCode.INVALID_JOB,
      jobId,
      statusCode: 400,
      expose: true,
    });
  }
}
