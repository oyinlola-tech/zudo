/**
 * Job-specific error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { assertFiniteNonNegative } from "../shared/domainError.helpers.js";
import { QueueError } from "./queueError.base.js";

/** Error thrown for general job failures. */
export class JobError extends QueueError {
  constructor(
    message: string,
    options: { queueName?: string; jobId?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.JOB_ERROR,
      queueName: options.queueName,
      jobId: options.jobId,
      cause: options.cause,
    });
  }
}

/** Error thrown when a job is not found. */
export class JobNotFoundError extends QueueError {
  constructor(jobId: string, queueName?: string) {
    super(
      `Job "${jobId}" was not found${queueName ? ` in queue "${queueName}"` : ""}.`,
      {
        code: ErrorCode.JOB_NOT_FOUND,
        queueName,
        jobId,
        statusCode: 404,
        expose: true,
      },
    );
  }
}

/** Error thrown when a job times out. */
export class JobTimeoutError extends QueueError {
  public readonly timeoutMs: number;
  constructor(
    jobId: string,
    timeoutMs: number,
    options: { queueName?: string } = {},
  ) {
    assertFiniteNonNegative("timeoutMs", timeoutMs);
    super(`Job "${jobId}" exceeded the timeout of ${timeoutMs}ms.`, {
      code: ErrorCode.JOB_TIMEOUT,
      queueName: options.queueName,
      jobId,
      metadata: { timeoutMs },
      statusCode: 504,
    });
    this.timeoutMs = timeoutMs;
  }
}

/** Error thrown when a job is cancelled. */
export class JobCancelledError extends QueueError {
  constructor(
    jobId: string,
    options: { queueName?: string; reason?: string } = {},
  ) {
    super(
      `Job "${jobId}" was cancelled${options.reason ? `: ${options.reason}` : ""}.`,
      {
        code: ErrorCode.JOB_CANCELLED,
        queueName: options.queueName,
        jobId,
        statusCode: 499,
        expose: false,
      },
    );
  }
}

/** Error thrown when job serialization fails. */
export class JobSerializationError extends QueueError {
  constructor(
    jobId: string,
    message: string,
    options: { queueName?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.JOB_SERIALIZATION,
      queueName: options.queueName,
      jobId,
      cause: options.cause,
    });
  }
}

/** Error thrown when job deserialization fails. */
export class JobDeserializationError extends QueueError {
  constructor(
    jobId: string,
    message: string,
    options: { queueName?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.JOB_DESERIALIZATION,
      queueName: options.queueName,
      jobId,
      cause: options.cause,
    });
  }
}

/** Error thrown when job processing fails. */
export class JobProcessingError extends QueueError {
  constructor(
    jobId: string,
    message: string,
    options: { queueName?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.JOB_PROCESSING,
      queueName: options.queueName,
      jobId,
      cause: options.cause,
    });
  }
}

/** Error thrown when a duplicate job is detected. */
export class JobDuplicateError extends QueueError {
  constructor(
    jobId: string,
    deduplicationKey: string,
    options: { queueName?: string } = {},
  ) {
    super(`Duplicate job detected with key "${deduplicationKey}".`, {
      code: ErrorCode.JOB_DUPLICATE,
      queueName: options.queueName,
      jobId,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when max attempts exceeded. */
export class JobMaxAttemptsError extends QueueError {
  public readonly attempt: number;
  public readonly maxAttempts: number;
  constructor(
    jobId: string,
    attempt: number,
    maxAttempts: number,
    options: { queueName?: string } = {},
  ) {
    super(`Job "${jobId}" exceeded maximum attempts (${maxAttempts}).`, {
      code: ErrorCode.JOB_MAX_ATTEMPTS,
      queueName: options.queueName,
      jobId,
      metadata: { attempt, maxAttempts },
    });
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
  }
}

/** Error thrown when a job is stalled. */
export class JobStalledError extends QueueError {
  constructor(jobId: string, options: { queueName?: string } = {}) {
    super(`Job "${jobId}" has stalled.`, {
      code: ErrorCode.JOB_STALLED,
      queueName: options.queueName,
      jobId,
    });
  }
}
