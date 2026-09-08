/**
 * AsyncLocalStorage-based transaction context for automatic propagation.
 *
 * @module context/context
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionContext } from "../transactionTypes/transactionAdapter.js";

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
