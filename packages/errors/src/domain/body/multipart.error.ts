import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating a multipart error.
 */
export interface MultipartErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for multipart parsing errors.
 */
export class MultipartError extends BaseError {
  constructor(message: string, options: MultipartErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_MULTIPART,
      category: options.category ?? ErrorCategory.INPUT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
    });
  }
}

/**
 * Error thrown when multipart parsing fails.
 */
export class MultipartParseError extends MultipartError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: ErrorCode.HTTP_MULTIPART_PARSE,
      cause,
    });
  }
}

/**
 * Error thrown when multipart data exceeds the configured size limit.
 */
export class MultipartLimitError extends MultipartError {
  constructor(message: string) {
    super(message, {
      code: ErrorCode.HTTP_MULTIPART_LIMIT,
      statusCode: 413,
    });
  }
}

/**
 * Creates a multipart error.
 */
export function createMultipartError(
  message: string,
  options: MultipartErrorOptions = {},
): MultipartError {
  return new MultipartError(message, options);
}

/**
 * Determines whether an unknown value is a MultipartError.
 */
export function isMultipartError(value: unknown): value is MultipartError {
  return value instanceof MultipartError;
}
