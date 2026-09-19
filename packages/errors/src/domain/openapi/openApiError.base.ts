/**
 * Base OpenAPI error. Server-side defaults (500, not exposed): a document
 * that fails to build is an operator's problem, not a client's.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Options for creating an OpenAPI error. */
export interface OpenAPIErrorOptions {
  readonly code?: string;
  /** Overrides the default status (500). */
  readonly statusCode?: number;
  /** Overrides the default exposure (false). */
  readonly expose?: boolean;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Base error for all OpenAPI subsystem failures. */
export class OpenAPIError extends BaseError {
  constructor(message: string, options: OpenAPIErrorOptions = {}) {
    super(message, {
      code: options.code ?? ErrorCode.OPENAPI_DOCUMENT,
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
