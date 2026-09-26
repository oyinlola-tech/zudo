/**
 * AsyncLocalStorage-based transaction context for automatic propagation.
 *
 * @module context/context
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionContext } from "../transactionTypes/transactionAdapter.js";
import { isTerminal } from "../transaction/transactionStateMachine.js";

/**
 * Create a transaction context backed by AsyncLocalStorage.
 */
export function createTransactionContext(): TransactionContext {
  const storage = new AsyncLocalStorage<Transaction>();

  return {
    get(): Transaction | undefined {
      return storage.getStore();
    },

    async run<T>(
      transaction: Transaction,
      callback: () => Promise<T>,
    ): Promise<T> {
      return storage.run(transaction, callback);
    },

    async exit<T>(callback: () => Promise<T>): Promise<T> {
      return storage.exit(callback);
    },
  };
}

/** Default context instance. */
let defaultContext: TransactionContext | undefined;

/**
 * Get or create the default transaction context.
 */
export function getDefaultContext(): TransactionContext {
  if (!defaultContext) {
    defaultContext = createTransactionContext();
  }
  return defaultContext;
}

/**
 * Reset the default context (useful for testing).
 */
export function resetDefaultContext(): void {
  defaultContext = undefined;
}

/**
 * The transaction in scope for the current async execution: the context's
 * stored transaction unless it has already committed, rolled back or
 * failed.
 *
 * A store outlives the transaction it holds. Work started while the store
 * is active (`afterCommit` callbacks, timers armed inside the callback,
 * jobs queued from it) inherits it, and `context.get()` then hands back a
 * finished transaction that a new `run()` would join as a participant and
 * fail on. The manager consults this instead, so such work starts afresh.
 *
 * @param context - The context to read; defaults to the default context.
 */
export function currentTransaction(
  context: TransactionContext = getDefaultContext(),
): Transaction | undefined {
  const transaction = context.get();
  return transaction && !isTerminal(transaction.state) ? transaction : undefined;
}
