/**
 * API routing and operation error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { APIError } from "./apiError.base.js";

/** Error thrown when an API endpoint is not found. */
export class APINotFoundError extends APIError {
  constructor(
    endpoint: string,
    method = "GET",
    options: { cause?: unknown } = {},
  ) {
    super(`Endpoint "${method} ${endpoint}" was not found.`, {
      code: ErrorCode.API_NOT_FOUND,
      endpoint,
      method,
      cause: options.cause,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when an API conflict occurs. */
export class APIConflictError extends APIError {
  constructor(
    message: string,
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_CONFLICT,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when an API operation is not found. */
export class APIOperationNotFoundError extends APIError {
  constructor(operation: string, options: { cause?: unknown } = {}) {
    super(`API operation "${operation}" was not found.`, {
      code: ErrorCode.API_OPERATION_NOT_FOUND,
      endpoint: operation,
      cause: options.cause,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when a duplicate API operation is registered. */
export class APIDuplicateOperationError extends APIError {
  constructor(operation: string, options: { cause?: unknown } = {}) {
    super(`API operation "${operation}" is already registered.`, {
      code: ErrorCode.API_DUPLICATE_OPERATION,
      endpoint: operation,
      cause: options.cause,
      statusCode: 409,
      expose: true,
    });
  }
}

/** Error thrown when API versioning fails. */
export class APIVersionError extends APIError {
  constructor(
    message: string,
    options: { endpoint?: string; method?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.API_VERSION,
      endpoint: options.endpoint,
      method: options.method,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}
