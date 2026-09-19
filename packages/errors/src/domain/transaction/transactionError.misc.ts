/**
 * Remaining transaction error subclasses (isolation, savepoints, presence,
 * capabilities).
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { TransactionError } from "./transactionError.base.js";

/** Required isolation level is not supported by the adapter. */
export class TransactionIsolationError extends TransactionError {
  constructor(level: string) {
    super(`Isolation level "${level}" is not supported by the adapter`, {
      code: ErrorCode.VALIDATION_FAILED,
      metadata: { level },
    });
  }
}

/** Savepoint operation failed. */
export class SavepointError extends TransactionError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: ErrorCode.OPERATION_FAILED, cause });
  }
}

/** A transaction is required but none exists. */
export class TransactionRequiredError extends TransactionError {
  constructor() {
    super("A transaction is required but none exists", {
      code: ErrorCode.PRECONDITION_FAILED,
    });
  }
}

/** A transaction exists but none was expected. */
export class TransactionUnexpectedError extends TransactionError {
  constructor() {
    super("A transaction already exists but none was expected", {
      code: ErrorCode.CONFLICT,
    });
  }
}

/** The adapter does not support the requested capability. */
export class TransactionCapabilityError extends TransactionError {
  constructor(capability: string) {
    super(`Adapter does not support: ${capability}`, {
      code: ErrorCode.NOT_IMPLEMENTED,
      metadata: { capability },
    });
  }
}
