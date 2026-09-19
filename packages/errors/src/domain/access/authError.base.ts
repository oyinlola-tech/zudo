/**
 * Base authentication-package error. Defaults to 401, category
 * `authentication`, exposed; every default can be overridden.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Options accepted by {@link AuthError} and its subclasses. */
export interface AuthErrorOptions {
  readonly code?: ErrorCode;
  readonly category?: ErrorCategory;
  readonly severity?: ErrorSeverity;
  readonly statusCode?: number;
  readonly expose?: boolean;
  readonly isOperational?: boolean;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
}

/** Base error for all auth-related failures. */
export class AuthError extends BaseError {
  constructor(message: string, options?: AuthErrorOptions) {
    super(message, {
      code: options?.code ?? ErrorCode.AUTHENTICATION,
      category: options?.category ?? ErrorCategory.AUTHENTICATION,
      severity: options?.severity ?? ErrorSeverity.ERROR,
      statusCode: options?.statusCode ?? 401,
      expose: options?.expose ?? true,
      ...(options?.isOperational !== undefined
        ? { isOperational: options.isOperational }
        : {}),
      metadata: options?.metadata,
      cause: options?.cause,
    });
  }
}
