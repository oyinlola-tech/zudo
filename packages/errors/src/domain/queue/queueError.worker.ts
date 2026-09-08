/**
 * Worker-specific error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { QueueError } from "./queueError.base.js";

/** Error thrown for worker failures. */
export class WorkerError extends QueueError {
  constructor(
    message: string,
    options: { workerId?: string; queueName?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.WORKER_ERROR,
      queueName: options.queueName,
      workerId: options.workerId,
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when a worker is not found.
 *
 * Workers are server-side components, so this is reported as an internal
 * failure and is not exposed to clients.
 */
export class WorkerNotFoundError extends QueueError {
  constructor(workerId: string, options: { queueName?: string } = {}) {
    super(`Worker "${workerId}" was not found.`, {
      code: ErrorCode.WORKER_NOT_FOUND,
      workerId,
      queueName: options.queueName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown for worker lifecycle failures. */
export class WorkerLifecycleError extends QueueError {
  constructor(
    message: string,
    options: { workerId?: string; queueName?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.WORKER_LIFECYCLE,
      queueName: options.queueName,
      workerId: options.workerId,
      cause: options.cause,
    });
  }
}
