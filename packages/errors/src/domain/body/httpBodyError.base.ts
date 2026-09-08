import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP body error.
 */
export interface HttpBodyErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
}

/**
 * Base error class for HTTP body reading errors.
 */
export class HttpBodyError extends BaseError {
  constructor(message: string, options: HttpBodyErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_BODY,
      category: options.category ?? ErrorCategory.INPUT,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
    });
  }
}

/** Creates an HTTP body error. */
export function createHttpBodyError(
  message: string,
  options: HttpBodyErrorOptions = {},
): HttpBodyError {
  return new HttpBodyError(message, options);
}

/** Determines whether an unknown value is an HttpBodyError. */
export function isHttpBodyError(value: unknown): value is HttpBodyError {
  return value instanceof HttpBodyError;
}
