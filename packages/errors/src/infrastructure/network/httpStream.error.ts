import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP stream error.
 */
export interface HttpStreamErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for HTTP stream errors.
 */
export class HttpStreamError extends BaseError {
  constructor(message: string, options: HttpStreamErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_STREAM,
      category: options.category ?? ErrorCategory.NETWORK,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
    });
  }
}

/**
 * Creates an HTTP stream error.
 */
export function createHttpStreamError(
  message: string,
  options: HttpStreamErrorOptions = {},
): HttpStreamError {
  return new HttpStreamError(message, options);
}

/**
 * Determines whether an unknown value is an HttpStreamError.
 */
export function isHttpStreamError(value: unknown): value is HttpStreamError {
  return value instanceof HttpStreamError;
}
