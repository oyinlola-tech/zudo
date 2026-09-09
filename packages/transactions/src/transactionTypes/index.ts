/**
 * Core transaction type definitions.
 *
 * @module transactionTypes
 */

export {
  type TransactionState,
  type TransactionKind,
  type TransactionPropagation,
  type TransactionIsolationLevel,
} from "./transactionState.js";

export {
  type Transaction,
  type TransactionOptions,
  type TransactionRetryOptions,
  type TransactionRetryPredicate,
} from "./transaction.interface.js";

export {
  type TransactionHandle,
  type TransactionAdapterCapabilities,
  type TransactionAdapter,
  type TransactionContext,
} from "./transactionAdapter.js";

export {
  type TransactionHookContext,
  type TransactionErrorContext,
  type TransactionHooks,
  type TransactionRegistry,
  TRANSACTION_EVENTS,
  type TransactionEvent,
  type TransactionEventHandler,
} from "./transactionHooks.js";
