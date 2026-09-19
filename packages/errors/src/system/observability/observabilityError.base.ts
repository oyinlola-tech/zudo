/**
 * Base observability error: telemetry throws only for programmer errors.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Options accepted by {@link ObservabilityError}. */
export interface ObservabilityErrorOptions {
  readonly code?: ErrorCode;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

/** Base error for all observability failures (500, not exposed). */
export class ObservabilityError extends BaseError {
  constructor(message: string, options?: ObservabilityErrorOptions) {
    super(message, {
      code: options?.code ?? ErrorCode.OPERATION_FAILED,
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      metadata: options?.metadata as ErrorMetadata | undefined,
      cause: options?.cause,
    });
    this.name = "ObservabilityError";
  }
}
