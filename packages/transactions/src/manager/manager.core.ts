/**
 * Transaction manager — coordinates begin, commit, rollback, and context.
 *
 * @module manager/manager
 */

import type {
  Transaction,
  TransactionOptions,
} from "../transactionTypes/transaction.interface.js";
import type {
  TransactionAdapter,
  TransactionContext,
} from "../transactionTypes/transactionAdapter.js";
import type {
  TransactionHooks,
  TransactionRegistry,
} from "../transactionTypes/transactionHooks.js";
import { getDefaultContext } from "../context/context.core.js";
import { internals } from "../transaction/transaction.internal.js";
import { TransactionRollbackError } from "../transactionErrors/transactionError.types.js";
import { commitTransaction, rollbackTransaction } from "./manager.commit.js";
import {
  resolvePropagation,
  suspendsTransaction,
} from "./manager.propagation.js";
import { withRetry } from "./manager.retry.js";

/** Options for creating a transaction manager. */
export interface TransactionManagerOptions {
  readonly adapter: TransactionAdapter;
  readonly context?: TransactionContext;
  readonly hooks?: TransactionHooks;
  /** Optional registry notified as transactions start and finish. */
  readonly registry?: TransactionRegistry;
}

/**
 * Create a transaction manager.
 */
export function createTransactionManager(options: TransactionManagerOptions) {
  const { adapter, hooks, registry } = options;
  const context = options.context ?? getDefaultContext();

  /** Arms the timeout, returning a disposer that always clears the timer. */
  function armTimeout(transaction: Transaction): () => void {
    const timeout = transaction.options.timeout;
    if (!timeout || timeout <= 0) return () => {};

    const timer = setTimeout(() => {
      internals(transaction)._markTimedOut();
      transaction.markRollbackOnly("timeout");
    }, timeout);

    return () => clearTimeout(timer);
  }

  return {
    /**
     * Begin a transaction, applying the requested propagation mode.
     *
     * With the default `required` propagation inside an existing transaction
     * this returns a participant: a handle that observes the enclosing
     * transaction but never commits it.
     */
    async begin(opts?: TransactionOptions): Promise<Transaction> {
      const propagation = opts?.propagation ?? "required";
      const current = suspendsTransaction(propagation)
        ? undefined
        : context.get();

      const transaction = await resolvePropagation(propagation, {
        current,
        opts,
        adapter,
        hooks,
      });

      if (transaction.kind === "root" || transaction.kind === "savepoint") {
        registry?.register(transaction);
      }

      return transaction;
    },

    /**
     * Run a callback inside a transaction, committing or rolling back around it.
     *
     * Only a transaction this call opened is completed here: joining an
     * enclosing transaction must not commit it, and a failure inside a
     * participant marks the enclosing transaction rollback-only instead.
     */
    async run<T>(
      callback: (transaction: Transaction) => Promise<T>,
      opts?: TransactionOptions,
    ): Promise<T> {
      return withRetry(opts?.retry, async () => {
        const transaction = await this.begin(opts);
        const owned =
          transaction.kind === "root" || transaction.kind === "savepoint";
        const disposeTimeout = owned ? armTimeout(transaction) : () => {};

        const body = async (): Promise<T> => {
          try {
            const result = await callback(transaction);
            await this.commit(transaction);
            return result;
          } catch (error) {
            try {
              await this.rollback(transaction, error);
            } catch (rollbackError) {
              if (rollbackError instanceof TransactionRollbackError)
                throw error;
              throw new TransactionRollbackError(transaction.id, {
                cause: rollbackError,
                originalError: error,
              });
            }
            throw error;
          } finally {
            disposeTimeout();
            if (owned) registry?.unregister(transaction.id);
          }
        };

        return transaction.kind === "none"
          ? context.exit(body)
          : context.run(transaction, body);
      });
    },

    /** Commit a transaction. Participants and committed transactions are no-ops. */
    async commit(transaction: Transaction): Promise<void> {
      return commitTransaction(transaction, adapter, hooks);
    },

    /** Roll back a transaction, or mark the joined transaction rollback-only. */
    async rollback(transaction: Transaction, reason?: unknown): Promise<void> {
      return rollbackTransaction(transaction, adapter, reason, hooks);
    },

    /** The transaction in scope for the current async execution, if any. */
    getCurrent(): Transaction | undefined {
      return context.get();
    },
  };
}
