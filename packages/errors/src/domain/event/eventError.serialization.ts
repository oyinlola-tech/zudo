/**
 * Event serialization and deserialization error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { EventError } from "./eventError.base.js";

/** Error thrown when event serialization fails. */
export class EventSerializationError extends EventError {
  constructor(
    message: string,
    options: {
      eventType?: string;
      eventId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.EVENT_SERIALIZATION_FAILED,
      eventType: options.eventType,
      eventId: options.eventId,
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when event deserialization fails.
 *
 * Malformed serialized input is a client/input problem, so this is a
 * 400 that may be exposed.
 */
export class EventDeserializationError extends EventError {
  constructor(
    message: string,
    cause?: unknown,
    options: { eventType?: string; eventId?: string } = {},
  ) {
    super(message, {
      code: ErrorCode.EVENT_DESERIALIZATION_FAILED,
      cause,
      eventType: options.eventType,
      eventId: options.eventId,
      statusCode: 400,
      expose: true,
    });
  }
}
