/**
 * Message serialization and deserialization error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { MessageError } from "./messageError.base.js";

/** Error thrown when message serialization fails. */
export class MessageSerializationError extends MessageError {
  constructor(
    message: string,
    options: {
      messageType?: string;
      messageId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_SERIALIZATION_FAILED,
      messageType: options.messageType,
      messageId: options.messageId,
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when message deserialization fails.
 *
 * Malformed serialized input is a client/input problem, so this is a
 * 400 that may be exposed.
 */
export class MessageDeserializationError extends MessageError {
  constructor(
    message: string,
    options: {
      messageType?: string;
      messageId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_DESERIALIZATION_FAILED,
      messageType: options.messageType,
      messageId: options.messageId,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}
