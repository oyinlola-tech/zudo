/**
 * Base OpenAPI error and factory functions.
 *
 * Everything in this package runs while a service builds or validates its own
 * specification — none of it is triggered by a client request. So the
 * defaults are the server-side ones: status 500, not exposed. A document that
 * fails to build is an operator's problem, and leaking component names or
 * version mismatches into a client-visible body tells an attacker about the
 * shape of the API rather than telling the operator anything.
 */

import {
  BaseError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  type ErrorMetadata,
} from "@zudojs/errors";

/** Options for creating an OpenAPI error. */
export interface OpenAPIErrorOptions {
  readonly code?: string;
  /** Overrides the subclass's default status. */
  readonly statusCode?: number;
  /** Overrides the subclass's default exposure. */
  readonly expose?: boolean;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Base error for all OpenAPI subsystem failures. */
export class OpenAPIError extends BaseError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: (options.code as ErrorCode) ?? ErrorCode.OPENAPI_DOCUMENT,
      category: ErrorCategory.OPENAPI,
      severity: ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      cause: options.cause,
      metadata: options.metadata as ErrorMetadata | undefined,
    });
    this.name = "OpenAPIError";
  }
}

/** Creates an OpenAPI error. */
export function createOpenAPIError(
  message: string,
  options: OpenAPIErrorOptions = {},
): OpenAPIError {
  return new OpenAPIError(message, options);
}

/** Determines whether an unknown value is an OpenAPI error. */
export function isOpenAPIError(value: unknown): value is OpenAPIError {
  return value instanceof OpenAPIError;
}
