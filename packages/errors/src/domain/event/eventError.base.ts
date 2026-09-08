/**
 * Base EventError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { safeErrorMessage } from "../shared/domainError.helpers.js";

/** Options for creating an event error. */
export interface EventErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  readonly eventType?: string;
  readonly eventId?: string;
  readonly handlerId?: string;
  readonly middlewareId?: string;
}

/** Base error for all event subsystem failures. */
export class EventError extends BaseError {
  public readonly eventType?: string;
  public readonly eventId?: string;
  public readonly handlerId?: string;
  public readonly middlewareId?: string;

  constructor(message: string, options: EventErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.EVENT_HANDLING_FAILED,
      category: options.category ?? ErrorCategory.EVENT,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.eventType = options.eventType;
    this.eventId = options.eventId;
    this.handlerId = options.handlerId;
    this.middlewareId = options.middlewareId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.eventType !== undefined ? { eventType: this.eventType } : {}),
      ...(this.eventId !== undefined ? { eventId: this.eventId } : {}),
      ...(this.handlerId !== undefined ? { handlerId: this.handlerId } : {}),
      ...(this.middlewareId !== undefined
        ? { middlewareId: this.middlewareId }
        : {}),
    };
  }
}

/** Creates an event error. */
export function createEventError(
  message: string,
  options: EventErrorOptions = {},
): EventError {
  return new EventError(message, options);
}

/** Determines whether an unknown value is an EventError. */
export function isEventError(value: unknown): value is EventError {
  return value instanceof EventError;
}

/** Converts an unknown thrown value into an EventError. */
export function toEventError(
  error: unknown,
  options: {
    message?: string;
    eventType?: string;
    eventId?: string;
    code?: ErrorCode | string;
  } = {},
): EventError {
  if (error instanceof EventError) {
    return error;
  }
  return new EventError(options.message ?? safeErrorMessage(error), {
    code: options.code,
    eventType: options.eventType,
    eventId: options.eventId,
    cause: error,
  });
}
