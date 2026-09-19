/**
 * Base transaction error, owned here so `@zudojs/transactions` can re-export
 * it and `instanceof` matches across both import paths.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Options accepted by {@link TransactionError}. */
export interface TransactionErrorOptions {
  readonly code?: ErrorCode;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
}

/** Base error for all transaction-related failures. */
export class TransactionError extends BaseError {
  constructor(message: string, options?: TransactionErrorOptions) {
    super(message, {
      code: options?.code ?? ErrorCode.OPERATION_FAILED,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.ERROR,
      metadata: options?.metadata,
      cause: options?.cause,
    });
  }
}
