/**
 * Errors raised by `@zudojs/constants` branded-type factories and
 * environment helpers.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Error thrown when an invalid constant value is used. */
export class InvalidConstantError extends BaseError {
  constructor(
    message: string,
    options?: {
      readonly code?: ErrorCode;
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, {
      code: options?.code ?? ErrorCode.CONFIGURATION_INVALID,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.ERROR,
      metadata: options?.metadata,
    });
  }
}

/** Error thrown when a constant is used outside its valid context. */
export class ConstantContextError extends BaseError {
  constructor(
    message: string,
    options?: {
      readonly metadata?: ErrorMetadata;
    },
  ) {
    super(message, {
      code: ErrorCode.INVALID_INPUT,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.ERROR,
      metadata: options?.metadata,
    });
  }
}
