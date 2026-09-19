/**
 * Specific transaction error subclasses. Constructor signatures and codes
 * match the classes `@zudojs/transactions` defined locally.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { TransactionError } from "./transactionError.base.js";

/** Transaction is in an invalid state for the requested operation. */
export class TransactionStateError extends TransactionError {
  constructor(state: string, operation: string) {
    super(`Cannot ${operation} transaction in state "${state}"`, {
      code: ErrorCode.LIFECYCLE_STATE,
      metadata: { state, operation },
    });
  }
}

/** Transaction exceeded its timeout. */
export class TransactionTimeoutError extends TransactionError {
  constructor(transactionId: string, timeoutMs: number) {
    super(`Transaction "${transactionId}" timed out after ${timeoutMs}ms`, {
      code: ErrorCode.TIMEOUT,
      metadata: { transactionId, timeoutMs },
    });
  }
}

/** Transaction commit failed. */
export class TransactionCommitError extends TransactionError {
  constructor(transactionId: string, cause?: unknown) {
    super(`Transaction "${transactionId}" commit failed`, {
      code: ErrorCode.DATABASE_TRANSACTION,
      cause,
      metadata: { transactionId },
    });
  }
}

/** Transaction rollback failed. */
export class TransactionRollbackError extends TransactionError {
  constructor(
    transactionId: string,
    options?: { readonly cause?: unknown; readonly originalError?: unknown },
  ) {
    super(`Transaction "${transactionId}" rollback failed`, {
      code: ErrorCode.DATABASE_TRANSACTION,
      cause: options?.cause,
      metadata: {
        transactionId,
        originalError:
          options?.originalError instanceof Error
            ? options.originalError.message
            : String(options?.originalError ?? "unknown"),
      },
    });
  }
}

/** The underlying adapter threw an error. */
export class TransactionAdapterError extends TransactionError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: ErrorCode.ADAPTER_OPERATION_FAILED, cause });
  }
}

/** Propagation strategy violation. */
export class TransactionPropagationError extends TransactionError {
  constructor(message: string) {
    super(message, { code: ErrorCode.VALIDATION_FAILED });
  }
}
