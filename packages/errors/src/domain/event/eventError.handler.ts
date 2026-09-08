/**
 * Event handler and middleware error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { EventError } from "./eventError.base.js";

/** Error thrown when an event handler fails. */
export class EventHandlerError extends EventError {
  constructor(
    message: string,
    options: {
      handlerId: string;
      eventType?: string;
      eventId?: string;
      cause?: unknown;
    },
  ) {
    super(message, {
      code: ErrorCode.EVENT_HANDLER_FAILED,
      handlerId: options.handlerId,
      eventType: options.eventType,
      eventId: options.eventId,
      cause: options.cause,
    });
  }
}

/** Creates an event handler error from an unknown failure. */
export function createEventHandlerError(
  handlerId: string,
  eventType: string,
  eventId: string,
  cause: unknown,
): EventHandlerError {
  return new EventHandlerError(
    `Event handler "${handlerId}" failed while processing "${eventType}".`,
    { handlerId, eventType, eventId, cause },
  );
}

/**
 * Error thrown when an event handler cannot be found.
 *
 * Handler registration is a server-side concern, so this is an internal
 * (non-exposed, non-operational) failure.
 */
export class EventHandlerNotFoundError extends EventError {
  constructor(handlerId: string) {
    super(`Event handler "${handlerId}" was not found.`, {
      code: ErrorCode.EVENT_HANDLER_NOT_FOUND,
      handlerId,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when an event handler is already registered.
 *
 * Handler registration is a server-side concern, so this is an internal
 * (non-exposed, non-operational) failure.
 */
export class DuplicateEventHandlerError extends EventError {
  constructor(handlerId: string) {
    super(`Event handler "${handlerId}" is already registered.`, {
      code: ErrorCode.EVENT_DUPLICATE_HANDLER,
      handlerId,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when event middleware fails. */
export class EventMiddlewareError extends EventError {
  constructor(
    message: string,
    options: {
      middlewareId?: string;
      eventType?: string;
      eventId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.EVENT_MIDDLEWARE_FAILED,
      middlewareId: options.middlewareId,
      eventType: options.eventType,
      eventId: options.eventId,
      cause: options.cause,
    });
  }
}
