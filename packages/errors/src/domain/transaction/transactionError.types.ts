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
    options?: {
      readonly cause?: unknown;
      readonly originalError?: unknown;
      /** Overrides the default "rollback failed" message (for subclasses). */
      readonly message?: string;
    },
  ) {
    super(options?.message ?? `Transaction "${transactionId}" rollback failed`, {
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

/**
 * A commit was refused because the transaction was marked rollback-only;
 * the transaction was rolled back instead.
 *
 * Distinct from a rollback that *failed*. It extends
 * `TransactionRollbackError`, so existing `instanceof` checks and the
 * `ERR_DATABASE_TRANSACTION` code still match, while the message and
 * class say what actually happened. `metadata.originalError` carries the
 * reason passed to `markRollbackOnly`.
 */
export class TransactionRollbackOnlyError extends TransactionRollbackError {
  constructor(transactionId: string, reason?: unknown) {
    super(transactionId, {
      originalError: reason ?? "marked rollback-only",
      message: `Transaction "${transactionId}" commit refused: transaction marked rollback-only`,
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
