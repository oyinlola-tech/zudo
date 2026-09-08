import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP response writer error.
 */
export interface HttpResponseWriterErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for HTTP response writer errors.
 */
export class HttpResponseWriterError extends BaseError {
  constructor(message: string, options: HttpResponseWriterErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_RESPONSE_WRITE,
      category: options.category ?? ErrorCategory.NETWORK,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
    });
  }
}

/**
 * Error thrown when a response has already been sent.
 */
export class ResponseAlreadySentError extends HttpResponseWriterError {
  constructor(message = "The HTTP response has already been sent.") {
    super(message, {
      code: ErrorCode.HTTP_RESPONSE_ALREADY_SENT,
    });
  }
}

/**
 * Error thrown when a response body type is not supported.
 */
export class UnsupportedResponseBodyError extends HttpResponseWriterError {
  constructor(
    message = "The response body type is not supported by this HTTP writer.",
  ) {
    super(message, {
      code: ErrorCode.HTTP_UNSUPPORTED_RESPONSE_BODY,
    });
  }
}

/**
 * Creates an HTTP response writer error.
 */
export function createHttpResponseWriterError(
  message: string,
  options: HttpResponseWriterErrorOptions = {},
): HttpResponseWriterError {
  return new HttpResponseWriterError(message, options);
}

/**
 * Determines whether an unknown value is an HttpResponseWriterError.
 */
export function isHttpResponseWriterError(
  value: unknown,
): value is HttpResponseWriterError {
  return value instanceof HttpResponseWriterError;
}
