/**
 * The transaction manager contract.
 *
 * `createTransactionManager` returned an anonymous object type, so a
 * consumer that wanted to hold, inject or mock a manager had to write
 * `ReturnType<typeof createTransactionManager>`. This is that type, named.
 *
 * @module transactionTypes/transactionManager
 */

import type { Transaction, TransactionOptions } from "./transaction.interface.js";

/**
 * Coordinates begin, commit, rollback and context propagation for
 * transactions opened against one adapter.
 */
export interface TransactionManager {
  /**
   * Begin a transaction, applying the requested propagation mode.
   *
   * With the default `required` propagation inside an existing transaction
   * this returns a participant: a handle that observes the enclosing
   * transaction but never commits it. A transaction opened here must be
   * completed with `commit()` or `rollback()`.
   */
  begin(options?: TransactionOptions): Promise<Transaction>;

  /**
   * Run a callback inside a transaction, committing or rolling back around
   * it. Only a transaction this call opened is completed here; a failure
   * inside a participant marks the enclosing transaction rollback-only.
   */
  run<T>(
    callback: (transaction: Transaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;

  /**
   * Commit a transaction. Participants and committed transactions are
   * no-ops; a rollback-only transaction is rolled back and the call
   * rejects.
   */
  commit(transaction: Transaction): Promise<void>;

  /** Roll back a transaction, or mark the joined transaction rollback-only. */
  rollback(transaction: Transaction, reason?: unknown): Promise<void>;

  /**
   * The transaction in scope for the current async execution, if any. A
   * transaction that has already committed, rolled back or failed is not
   * in scope, even when its context is still the active store (for example
   * inside an `afterCommit` callback).
   */
  getCurrent(): Transaction | undefined;

  /**
   * The adapter handle (what `adapter.begin()` returned) of the transaction
   * in scope for the current async execution, or `undefined` outside a
   * transaction. See `getTransactionHandle`.
   */
  getCurrentHandle<THandle = unknown>(): THandle | undefined;
}
