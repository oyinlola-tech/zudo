/**
 * Base MessageError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import { safeErrorMessage } from "../shared/domainError.helpers.js";

/** Options for creating a message error. */
export interface MessageErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly messageType?: string;
  readonly messageId?: string;
  readonly handlerId?: string;
  readonly middlewareId?: string;
}

/** Base error for all message subsystem failures. */
export class MessageError extends BaseError {
  public readonly messageType?: string;
  public readonly messageId?: string;
  public readonly handlerId?: string;
  public readonly middlewareId?: string;

  constructor(message: string, options: MessageErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.MESSAGE_DISPATCH_FAILED,
      category: options.category ?? ErrorCategory.MESSAGE,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.messageType = options.messageType;
    this.messageId = options.messageId;
    this.handlerId = options.handlerId;
    this.middlewareId = options.middlewareId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.messageType !== undefined
        ? { messageType: this.messageType }
        : {}),
      ...(this.messageId !== undefined ? { messageId: this.messageId } : {}),
      ...(this.handlerId !== undefined ? { handlerId: this.handlerId } : {}),
      ...(this.middlewareId !== undefined
        ? { middlewareId: this.middlewareId }
        : {}),
    };
  }
}

/** Creates a message error. */
export function createMessageError(
  message: string,
  options: MessageErrorOptions = {},
): MessageError {
  return new MessageError(message, options);
}

/** Determines whether an unknown value is a MessageError. */
export function isMessageError(value: unknown): value is MessageError {
  return value instanceof MessageError;
}

/** Converts an unknown thrown value into a MessageError. */
export function toMessageError(
  error: unknown,
  options: {
    message?: string;
    messageType?: string;
    messageId?: string;
    code?: ErrorCode | string;
  } = {},
): MessageError {
  if (error instanceof MessageError) {
    return error;
  }
  return new MessageError(options.message ?? safeErrorMessage(error), {
    code: options.code,
    messageType: options.messageType,
    messageId: options.messageId,
    cause: error,
  });
}
