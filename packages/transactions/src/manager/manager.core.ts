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
  TransactionEventHandler,
  TransactionHooks,
  TransactionRegistry,
} from "../transactionTypes/transactionHooks.js";
import { getDefaultContext } from "../context/context.core.js";
import { internals } from "../transaction/transaction.internal.js";
import { isTerminal } from "../transaction/transactionStateMachine.js";
import { TransactionRollbackError } from "../transactionErrors/transactionError.types.js";
import { commitTransaction, rollbackTransaction } from "./manager.commit.js";
import {
  resolvePropagation,
  suspendsTransaction,
} from "./manager.propagation.js";
import { withRetry } from "./manager.retry.js";
import { createEmitter, TRANSACTION_EVENTS } from "./manager.events.js";

/** Options for creating a transaction manager. */
export interface TransactionManagerOptions {
  readonly adapter: TransactionAdapter;
  readonly context?: TransactionContext;
  readonly hooks?: TransactionHooks;
  /** Optional registry notified as transactions start and finish. */
  readonly registry?: TransactionRegistry;
  /**
   * Optional observer for transaction lifecycle events.
   *
   * Receives a {@link TransactionEvent} for each of `TRANSACTION_EVENTS`.
   * A throwing observer is ignored rather than failing the transaction.
   */
  readonly onEvent?: TransactionEventHandler;
}

/** Whether a transaction can no longer change state. */
function isFinished(transaction: Transaction): boolean {
  return isTerminal(transaction.state);
}

/**
 * Create a transaction manager.
 */
export function createTransactionManager(options: TransactionManagerOptions) {
  const { adapter, hooks, registry } = options;
  const context = options.context ?? getDefaultContext();
  const emit = createEmitter(options.onEvent);

  /** Timers armed for owned transactions, cleared when they complete. */
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Whether the manager completes this handle (root or savepoint). */
  function owns(transaction: Transaction): boolean {
    return transaction.kind === "root" || transaction.kind === "savepoint";
  }

  /**
   * Arms the timeout for an owned transaction.
   *
   * `begin()` used to validate `timeout` against the adapter's capabilities
   * and then ignore it — only `run()` armed a timer — so a transaction
   * opened by hand never timed out.
   */
  function armTimeout(transaction: Transaction): void {
    const timeout = transaction.options.timeout;
    if (!timeout || timeout <= 0) return;

    const timer = setTimeout(() => {
      timers.delete(transaction.id);
      internals(transaction)._markTimedOut();
      transaction.markRollbackOnly("timeout");
      emit(TRANSACTION_EVENTS.TIMED_OUT, transaction);
    }, timeout);

    timers.set(transaction.id, timer);
  }

  /** Clears the timer and registry entry of a completed owned transaction. */
  function release(transaction: Transaction): void {
    if (!owns(transaction)) return;

    const timer = timers.get(transaction.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(transaction.id);
    }
    registry?.unregister(transaction.id);
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
        emit,
      });

      if (owns(transaction)) {
        registry?.register(transaction);
        armTimeout(transaction);
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
      // A failed attempt that only JOINED an enclosing transaction has not
      // been rolled back — it marked the enclosing transaction rollback-only
      // — so replaying it would repeat its side effects inside a transaction
      // that can no longer commit. Retry only attempts this call owned.
      let joined = false;
      const retry = opts?.retry;
      const retryOptions =
        retry === undefined
          ? undefined
          : {
              ...retry,
              shouldRetry: (error: unknown, attempt: number): boolean =>
                !joined && (retry.shouldRetry?.(error, attempt) ?? true),
            };

      return withRetry(retryOptions, async () => {
        const transaction = await this.begin(opts);
        joined = transaction.kind === "participant";

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
            release(transaction);
          }
        };

        return transaction.kind === "none"
          ? context.exit(body)
          : context.run(transaction, body);
      });
    },

    /**
     * Commit a transaction. Participants and committed transactions are no-ops.
     *
     * Completing a transaction opened with `begin()` also releases its
     * timeout timer and registry entry; both used to be released only by
     * `run()`, so hand-managed transactions stayed in the registry forever.
     */
    async commit(transaction: Transaction): Promise<void> {
      try {
        await commitTransaction(transaction, adapter, hooks, emit);
      } finally {
        if (isFinished(transaction)) release(transaction);
      }
    },

    /** Roll back a transaction, or mark the joined transaction rollback-only. */
    async rollback(transaction: Transaction, reason?: unknown): Promise<void> {
      try {
        await rollbackTransaction(transaction, adapter, reason, hooks, emit);
      } finally {
        if (isFinished(transaction)) release(transaction);
      }
    },

    /** The transaction in scope for the current async execution, if any. */
    getCurrent(): Transaction | undefined {
      return context.get();
    },
  };
}
