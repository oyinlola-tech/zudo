/**
 * Message lifecycle error classes — dispatch, timeout, validation.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { assertFiniteNonNegative } from "../shared/domainError.helpers.js";
import { MessageError } from "./messageError.base.js";

/** Error raised when message dispatch fails. */
export class MessageDispatchError extends MessageError {
  constructor(messageType: string, message?: string, cause?: unknown) {
    super(message ?? `Failed to dispatch message "${messageType}".`, {
      code: ErrorCode.MESSAGE_DISPATCH_FAILED,
      messageType,
      cause,
    });
  }
}

/** Error thrown when a message is invalid. */
export class InvalidMessageError extends MessageError {
  constructor(
    message: string,
    options: { messageType?: string; messageId?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_INVALID,
      messageType: options.messageType,
      messageId: options.messageId,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}

/**
 * Error thrown when a message type is not registered.
 *
 * Message registration is a server-side concern; reported as internal.
 */
export class MessageTypeNotFoundError extends MessageError {
  constructor(messageType: string) {
    super(`Message type "${messageType}" is not registered.`, {
      code: ErrorCode.MESSAGE_TYPE_NOT_FOUND,
      messageType,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when message dispatch is aborted. */
export class MessageDispatchAbortedError extends MessageError {
  constructor(
    message = "Message dispatch was aborted.",
    options: { messageType?: string; messageId?: string } = {},
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_ABORTED,
      messageType: options.messageType,
      messageId: options.messageId,
      statusCode: 499,
      expose: false,
    });
  }
}

/** Error thrown when the message bus has been disposed. */
export class MessageBusDisposedError extends MessageError {
  constructor() {
    super("Message bus has already been disposed.", {
      code: ErrorCode.MESSAGE_BUS_DISPOSED,
      statusCode: 500,
      isOperational: false,
    });
  }
}

/** Error thrown when a message operation times out. */
export class MessageTimeoutError extends MessageError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    options: { messageType?: string; messageId?: string } = {},
  ) {
    assertFiniteNonNegative("timeoutMs", timeoutMs);
    super(`Message processing exceeded the timeout of ${timeoutMs}ms.`, {
      code: ErrorCode.MESSAGE_TIMEOUT,
      messageType: options.messageType,
      messageId: options.messageId,
      metadata: { timeoutMs },
      statusCode: 504,
    });
    this.timeoutMs = timeoutMs;
  }
}
