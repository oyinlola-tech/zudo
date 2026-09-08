/**
 * Scheduler execution error classes — job execution, timeout, cancellation, store, lock.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { assertFiniteNonNegative } from "../shared/domainError.helpers.js";
import {
  SchedulerError,
  type SchedulerErrorOptions,
} from "./schedulerError.base.js";

/** Error thrown when a job execution fails. */
export class SchedulerJobExecutionError extends SchedulerError {
  constructor(
    message: string,
    jobId?: string,
    scheduleId?: string,
    options: SchedulerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.SCHEDULER_JOB_EXECUTION_ERROR,
      jobId: jobId ?? options.jobId,
      scheduleId: scheduleId ?? options.scheduleId,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when a job times out. */
export class SchedulerJobTimeoutError extends SchedulerError {
  public readonly timeout: number;

  constructor(
    timeout: number,
    jobId?: string,
    options: SchedulerErrorOptions = {},
  ) {
    assertFiniteNonNegative("timeout", timeout);
    super(`Job timed out after ${timeout}ms.`, {
      ...options,
      code: ErrorCode.SCHEDULER_JOB_TIMEOUT,
      jobId: jobId ?? options.jobId,
      metadata: { ...options.metadata, timeout },
      statusCode: 504,
      expose: false,
    });
    this.timeout = timeout;
  }
}

/** Error thrown when a job is cancelled. */
export class SchedulerJobCancelledError extends SchedulerError {
  constructor(
    message = "Job was cancelled.",
    jobId?: string,
    options: SchedulerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.SCHEDULER_JOB_CANCELLED,
      jobId: jobId ?? options.jobId,
      statusCode: 499,
      expose: false,
    });
  }
}

/** Error thrown when the scheduler store encounters an error. */
export class SchedulerStoreError extends SchedulerError {
  constructor(
    message: string,
    scheduleId?: string,
    options: SchedulerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.SCHEDULER_STORE_ERROR,
      scheduleId: scheduleId ?? options.scheduleId,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when the scheduler lock encounters an error. */
export class SchedulerLockError extends SchedulerError {
  constructor(
    message: string,
    scheduleId?: string,
    options: SchedulerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.SCHEDULER_LOCK_ERROR,
      scheduleId: scheduleId ?? options.scheduleId,
      statusCode: 409,
      expose: false,
    });
  }
}
