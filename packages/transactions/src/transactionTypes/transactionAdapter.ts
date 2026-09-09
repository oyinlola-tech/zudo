/**
 * Transaction adapter contract, capabilities, savepoints, and context.
 *
 * @module transactionTypes/transactionAdapter
 */

import type { TransactionIsolationLevel } from "./transactionState.js";
import type { Transaction } from "./transaction.interface.js";

/** Handle returned by the adapter's begin(), used for commit/rollback. */
export type TransactionHandle = unknown;

/** Capabilities reported by a transaction adapter. */
export interface TransactionAdapterCapabilities {
  /** Whether savepoints are supported. */
  readonly savepoints: boolean;
  /** Whether nested transactions are supported. */
  readonly nestedTransactions: boolean;
  /** Supported isolation levels. */
  readonly isolationLevels: readonly TransactionIsolationLevel[];
  /** Whether read-only transactions are supported. */
  readonly readOnlyTransactions: boolean;
  /** Whether timeouts are supported. */
  readonly timeouts: boolean;
}

/** Adapter contract for database-specific transaction behavior. */
export interface TransactionAdapter {
  /** Adapter capabilities. */
  readonly capabilities: TransactionAdapterCapabilities;
  /** Begin a new transaction. Returns a handle. */
  begin(
    options?: import("./transaction.interface.js").TransactionOptions,
  ): Promise<TransactionHandle>;
  /** Commit a transaction. */
  commit(handle: TransactionHandle): Promise<void>;
  /** Rollback a transaction. */
  rollback(handle: TransactionHandle, reason?: unknown): Promise<void>;
  /** Create a savepoint (optional). */
  createSavepoint?(handle: TransactionHandle, name: string): Promise<void>;
  /** Rollback to a savepoint (optional). */
  rollbackToSavepoint?(handle: TransactionHandle, name: string): Promise<void>;
  /** Release a savepoint (optional). */
  releaseSavepoint?(handle: TransactionHandle, name: string): Promise<void>;
}

/** Transaction context for async propagation. */
export interface TransactionContext {
  /** Get the current active transaction, if any. */
  get(): Transaction | undefined;
  /** Run a callback within a transaction context. */
  run<T>(transaction: Transaction, callback: () => Promise<T>): Promise<T>;
  /**
   * Run a callback with no transaction in scope.
   *
   * Used by the `not_supported` and `requires_new` propagation modes, which
   * must suspend an enclosing transaction rather than join it.
   */
  exit<T>(callback: () => Promise<T>): Promise<T>;
}
