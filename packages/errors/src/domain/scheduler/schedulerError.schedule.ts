/**
 * Schedule-related error classes — schedule lifecycle, cron parsing.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import {
  MAX_METADATA_FRAGMENT_LENGTH,
  sanitizeFragment,
} from "../shared/domainError.helpers.js";
import {
  SchedulerError,
  type SchedulerErrorOptions,
} from "./schedulerError.base.js";

/** Error thrown when a schedule is not found. */
export class ScheduleNotFoundError extends SchedulerError {
  constructor(scheduleId: string) {
    super(`Schedule "${scheduleId}" is not found.`, {
      code: ErrorCode.SCHEDULE_NOT_FOUND,
      scheduleId,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when a schedule already exists. */
export class ScheduleAlreadyExistsError extends SchedulerError {
  constructor(scheduleId: string) {
    super(`Schedule "${scheduleId}" already exists.`, {
      code: ErrorCode.SCHEDULE_ALREADY_EXISTS,
      scheduleId,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when a schedule is invalid. */
export class InvalidScheduleError extends SchedulerError {
  constructor(message: string, scheduleId?: string) {
    super(message, {
      code: ErrorCode.INVALID_SCHEDULE,
      scheduleId,
      statusCode: 400,
      expose: true,
    });
  }
}

/**
 * Error thrown when a cron expression cannot be parsed.
 *
 * The expression is untrusted input: it is stripped of control characters
 * and truncated before being embedded in the message or metadata.
 */
export class CronParseError extends SchedulerError {
  constructor(
    expression: string,
    reason: string,
    options: SchedulerErrorOptions = {},
  ) {
    const safeExpression = sanitizeFragment(expression);
    const safeReason = sanitizeFragment(reason);
    super(`Invalid cron expression "${safeExpression}": ${safeReason}.`, {
      ...options,
      code: ErrorCode.CRON_PARSE_ERROR,
      metadata: {
        ...options.metadata,
        expression: sanitizeFragment(expression, MAX_METADATA_FRAGMENT_LENGTH),
        reason: safeReason,
      },
      statusCode: 400,
      expose: true,
    });
  }
}

/**
 * Error thrown when a duration string is invalid.
 *
 * The duration is untrusted input: it is stripped of control characters
 * and truncated before being embedded in the message or metadata.
 */
export class InvalidDurationError extends SchedulerError {
  constructor(duration: string, options: SchedulerErrorOptions = {}) {
    const safeDuration = sanitizeFragment(duration);
    super(`Invalid duration "${safeDuration}".`, {
      ...options,
      code: ErrorCode.INVALID_DURATION,
      metadata: {
        ...options.metadata,
        duration: sanitizeFragment(duration, MAX_METADATA_FRAGMENT_LENGTH),
      },
      statusCode: 400,
      expose: true,
    });
  }
}
