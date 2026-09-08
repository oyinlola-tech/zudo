/**
 * Base queue error class and types.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { safeErrorMessage } from "../shared/domainError.helpers.js";

/** Options for creating a queue error. */
export interface QueueErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  readonly queueName?: string;
  readonly jobId?: string;
  readonly workerId?: string;
}

/** Base error for all queue subsystem failures. */
export class QueueError extends BaseError {
  public readonly queueName?: string;
  public readonly jobId?: string;
  public readonly workerId?: string;

  constructor(message: string, options: QueueErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.QUEUE_ERROR,
      category: options.category ?? ErrorCategory.QUEUE,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
      metadata: {
        ...options.metadata,
        ...(options.queueName !== undefined
          ? { queueName: options.queueName }
          : {}),
        ...(options.jobId !== undefined ? { jobId: options.jobId } : {}),
        ...(options.workerId !== undefined
          ? { workerId: options.workerId }
          : {}),
      },
    });
    this.queueName = options.queueName;
    this.jobId = options.jobId;
    this.workerId = options.workerId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.queueName !== undefined ? { queueName: this.queueName } : {}),
      ...(this.jobId !== undefined ? { jobId: this.jobId } : {}),
      ...(this.workerId !== undefined ? { workerId: this.workerId } : {}),
    };
  }
}

/** Check if an error is a QueueError. */
export function isQueueError(error: unknown): error is QueueError {
  return error instanceof QueueError;
}

/** Convert an unknown error to a QueueError. */
export function toQueueError(
  error: unknown,
  options: Partial<QueueErrorOptions> = {},
): QueueError {
  if (error instanceof QueueError) {
    return error;
  }
  return new QueueError(safeErrorMessage(error), {
    cause: error,
    ...options,
  });
}

/** Create a QueueError from options. */
export function createQueueError(
  message: string,
  options: QueueErrorOptions = {},
): QueueError {
  return new QueueError(message, options);
}
