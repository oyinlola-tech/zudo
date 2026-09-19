/**
 * Transaction error types.
 */

export {
  TransactionError,
  type TransactionErrorOptions,
} from "./transactionError.base.js";

export {
  TransactionStateError,
  TransactionTimeoutError,
  TransactionCommitError,
  TransactionRollbackError,
  TransactionAdapterError,
  TransactionPropagationError,
  TransactionIsolationError,
  SavepointError,
  TransactionRequiredError,
  TransactionUnexpectedError,
  TransactionCapabilityError,
} from "./transactionError.types.js";
