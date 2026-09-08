/**
 * @zudojs/database — Transactions
 *
 * Managed transaction execution with retry support.
 */

export {
  TransactionManager,
  createTransactionManager,
  withTransaction,
  withTransactionRetry,
  createTransactionContext,
  createTransactionId,
  getTransactionContextFromError,
  isTransactionActive,
  isTransactionCommitted,
  isTransactionFailed,
  type TransactionStatus,
  type TransactionContext,
  type TransactionOutcome,
  type TransactionRetryOptions,
  type ManagedTransactionOptions,
} from "./transaction.core.js";
