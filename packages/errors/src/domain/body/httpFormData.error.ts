import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP form data error.
 */
export interface HttpFormDataErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for HTTP form data errors.
 */
export class HttpFormDataError extends BaseError {
  constructor(message: string, options: HttpFormDataErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_FORM_DATA,
      category: options.category ?? ErrorCategory.INPUT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
    });
  }
}

/**
 * Error thrown when form data exceeds the configured size limit.
 */
export class HttpFormDataLimitError extends HttpFormDataError {
  constructor(message: string) {
    super(message, {
      code: ErrorCode.HTTP_FORM_DATA_LIMIT,
      statusCode: 413,
    });
  }
}

/**
 * Error thrown when form data parsing fails.
 */
export class HttpFormDataParseError extends HttpFormDataError {
  constructor(message: string) {
    super(message, {
      code: ErrorCode.HTTP_FORM_DATA_PARSE,
    });
  }
}

/**
 * Creates an HTTP form data error.
 */
export function createHttpFormDataError(
  message: string,
  options: HttpFormDataErrorOptions = {},
): HttpFormDataError {
  return new HttpFormDataError(message, options);
}

/**
 * Determines whether an unknown value is an HttpFormDataError.
 */
export function isHttpFormDataError(
  value: unknown,
): value is HttpFormDataError {
  return value instanceof HttpFormDataError;
}
