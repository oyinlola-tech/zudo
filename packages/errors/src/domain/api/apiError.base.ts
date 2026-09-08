/**
 * Base APIError class, options, factories, and auth errors.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating an API error. */
export interface APIErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  readonly endpoint?: string;
  readonly method?: string;
}

/** Base error for all API failures. */
export class APIError extends BaseError {
  public readonly endpoint?: string;
  public readonly method?: string;

  constructor(message: string, options: APIErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.API_ERROR,
      category: options.category ?? ErrorCategory.API,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.endpoint = options.endpoint;
    this.method = options.method;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.endpoint !== undefined ? { endpoint: this.endpoint } : {}),
      ...(this.method !== undefined ? { method: this.method } : {}),
    };
  }
}

/** Creates an API error. */
export function createAPIError(
  message: string,
  options: APIErrorOptions = {},
): APIError {
  return new APIError(message, options);
}

/** Determines whether an unknown value is an APIError. */
export function isAPIError(value: unknown): value is APIError {
  return value instanceof APIError;
}

/** Error thrown when API input validation fails. */
export class APIValidationError extends APIError {
  public readonly issues: readonly string[];

  constructor(
    message: string,
    issues: readonly string[] = [],
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_VALIDATION,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      metadata: { issues },
      statusCode: 422,
      expose: true,
    });
    this.issues = Object.freeze([...issues]);
  }
}

/** Error thrown when API authentication fails. */
export class APIAuthenticationError extends APIError {
  constructor(
    message = "API authentication is required.",
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_AUTHENTICATION,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 401,
      expose: true,
    });
  }
}

/** Error thrown when API authorization fails. */
export class APIAuthorizationError extends APIError {
  constructor(
    message = "You do not have permission to perform this operation.",
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_AUTHORIZATION,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 403,
      expose: true,
    });
  }
}
