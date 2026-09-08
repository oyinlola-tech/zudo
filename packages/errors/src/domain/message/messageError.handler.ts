/**
 * Message handler and middleware error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { MessageError } from "./messageError.base.js";

/** Error thrown when a message handler fails. */
export class MessageHandlerError extends MessageError {
  constructor(
    message: string,
    options: {
      handlerId: string;
      messageType?: string;
      messageId?: string;
      cause?: unknown;
    },
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_HANDLER_FAILED,
      handlerId: options.handlerId,
      messageType: options.messageType,
      messageId: options.messageId,
      cause: options.cause,
    });
  }
}

/** Creates a message handler error from an unknown failure. */
export function createMessageHandlerError(
  handlerId: string,
  messageType: string,
  messageId: string,
  cause: unknown,
): MessageHandlerError {
  return new MessageHandlerError(
    `Message handler "${handlerId}" failed while processing "${messageType}".`,
    { handlerId, messageType, messageId, cause },
  );
}

/**
 * Error thrown when a message handler cannot be found.
 *
 * Handler registration is a server-side concern, so this is an internal
 * (non-exposed, non-operational) failure.
 */
export class MessageHandlerNotFoundError extends MessageError {
  constructor(handlerId: string) {
    super(`Message handler "${handlerId}" was not found.`, {
      code: ErrorCode.MESSAGE_HANDLER_NOT_FOUND,
      handlerId,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when a message handler is already registered.
 *
 * Handler registration is a server-side concern, so this is an internal
 * (non-exposed, non-operational) failure.
 */
export class DuplicateMessageHandlerError extends MessageError {
  constructor(handlerId: string) {
    super(`Message handler "${handlerId}" is already registered.`, {
      code: ErrorCode.MESSAGE_DUPLICATE_HANDLER,
      handlerId,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when message middleware fails. */
export class MessageMiddlewareError extends MessageError {
  constructor(
    message: string,
    options: {
      middlewareId?: string;
      messageType?: string;
      messageId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.MESSAGE_MIDDLEWARE_FAILED,
      middlewareId: options.middlewareId,
      messageType: options.messageType,
      messageId: options.messageId,
      cause: options.cause,
    });
  }
}
