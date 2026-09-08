import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";

import { ErrorCode } from "../../base/types/errorCode.type.js";

import { ErrorCategory } from "../../base/types/errorCategory.type.js";

import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/**
 * Options for creating an HTTP adapter error.
 */
export interface HttpAdapterErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly adapter?: string;
}

/**
 * Base error class for HTTP adapter errors.
 */
export class HttpAdapterError extends BaseError {
  /**
   * The name of the adapter that caused the error.
   */
  public readonly adapter: string | undefined;

  constructor(message: string, options: HttpAdapterErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.HTTP_ADAPTER,
      category: options.category ?? ErrorCategory.NETWORK,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
    });

    this.adapter = options.adapter;
  }
}

/**
 * Error thrown when a request body exceeds the maximum allowed size.
 */
export class RequestBodyTooLargeError extends HttpAdapterError {
  /**
   * The maximum allowed body size in bytes.
   */
  public readonly maxSize: number;

  /**
   * The actual body size in bytes.
   */
  public readonly actualSize: number;

  constructor(maxSize: number, actualSize: number) {
    super(
      `HTTP request body exceeds the maximum allowed size of ${maxSize} bytes (actual: ${actualSize}).`,
      {
        code: ErrorCode.HTTP_REQUEST_BODY_TOO_LARGE,
        statusCode: 413,
        expose: true,
        isOperational: true,
        severity: ErrorSeverity.WARNING,
        metadata: {
          maxSize,
          actualSize,
        },
      },
    );

    this.maxSize = maxSize;

    this.actualSize = actualSize;
  }
}

/**
 * Creates an HTTP adapter error.
 */
export function createHttpAdapterError(
  message: string,
  options: HttpAdapterErrorOptions = {},
): HttpAdapterError {
  return new HttpAdapterError(message, options);
}

/**
 * Determines whether an unknown value is an HttpAdapterError.
 */
export function isHttpAdapterError(value: unknown): value is HttpAdapterError {
  return value instanceof HttpAdapterError;
}
