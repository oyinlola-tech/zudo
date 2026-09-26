/**
 * HTTP server error classes (5xx status codes).
 *
 * These errors carry enough information for the HTTP layer to translate
 * failures into consistent responses without coupling the errors to a
 * particular server adapter.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { HttpError } from "./http.error.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/**
 * Options for creating an HTTP server error.
 */
export interface HttpServerErrorOptions {
  readonly cause?: unknown;
  readonly code?: string;
  readonly expose?: boolean;
  readonly metadata?: ErrorMetadata;
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends HttpError {
  constructor(
    message: string = "Internal Server Error",
    options: HttpServerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 500,
      code: options.code ?? ErrorCode.HTTP_INTERNAL_SERVER_ERROR,
      expose: options.expose ?? false,
    });
  }
}

/**
 * 501 Not Implemented
 */
export class NotImplementedError extends HttpError {
  constructor(
    message: string = "Not Implemented",
    options: HttpServerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 501,
      code: options.code ?? ErrorCode.HTTP_NOT_IMPLEMENTED,
      expose: options.expose ?? false,
    });
  }
}

/**
 * 502 Bad Gateway
 */
export class BadGatewayError extends HttpError {
  constructor(
    message: string = "Bad Gateway",
    options: HttpServerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 502,
      code: options.code ?? ErrorCode.HTTP_BAD_GATEWAY,
      expose: options.expose ?? false,
    });
  }
}

/**
 * 503 Service Unavailable
 *
 * Unlike the other 5xx classes this one exposes its message by default: 503
 * is the status a service sends on purpose (maintenance, overload, a
 * dependency down), and its message ("Back at 03:00 UTC") is written for the
 * client, as it is for `APIUnavailableError` and `RPCUnavailableError`. Pass
 * `expose: false` for a message that must stay internal. Metadata is not
 * exposed by `expose` alone (see `ErrorSerializerOptions.exposeMetadata`).
 */
export class ServiceUnavailableError extends HttpError {
  constructor(
    message: string = "Service Unavailable",
    options: HttpServerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 503,
      code: options.code ?? ErrorCode.HTTP_SERVICE_UNAVAILABLE,
      expose: options.expose ?? true,
    });
  }
}

/**
 * 504 Gateway Timeout
 */
export class GatewayTimeoutError extends HttpError {
  constructor(
    message: string = "Gateway Timeout",
    options: HttpServerErrorOptions = {},
  ) {
    super(message, {
      ...options,
      statusCode: 504,
      code: options.code ?? ErrorCode.HTTP_GATEWAY_TIMEOUT,
      expose: options.expose ?? false,
    });
  }
}
