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
import type { TransactionManager } from "../transactionTypes/transactionManager.js";
import {
  currentTransaction,
  getDefaultContext,
} from "../context/context.core.js";
import {
  internals,
  type TransactionDetach,
} from "../transaction/transaction.internal.js";
import { isTerminal } from "../transaction/transactionStateMachine.js";
import { TransactionRollbackError } from "../transactionErrors/transactionError.types.js";
import { getTransactionHandle } from "../context/context.handle.js";
import { raceSignal } from "../utils/utils.signal.js";
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
 *
 * The manager reads the transaction in scope through `currentTransaction`,
 * so a transaction that has finished but whose context is still active
 * (inside an `afterCommit` callback, or in a timer armed during the
 * transaction) is never joined; a new `run()` there opens a fresh
 * transaction. After-commit and after-rollback callbacks and hooks run in
 * the scope that enclosed the transaction, not inside its context.
 */
export function createTransactionManager(
  options: TransactionManagerOptions,
): TransactionManager {
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
      const enclosing = currentTransaction(context);
      const current = suspendsTransaction(propagation) ? undefined : enclosing;

      // Post-completion work returns to whatever enclosed this transaction:
      // the outer transaction of a `requires_new`, or no transaction at all.
      const detach: TransactionDetach = enclosing
        ? (work) => context.run(enclosing, work)
        : (work) => context.exit(work);

      const transaction = await resolvePropagation(propagation, {
        current,
        opts,
        adapter,
        hooks,
        emit,
        detach,
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
     *
     * When the transaction times out, `transaction.signal` aborts and this
     * stops waiting for the callback: the transaction is rolled back and
     * the call rejects with `TransactionTimeoutError`. An error raised
     * after a successful commit (for example by an `afterCommit` hook) is
     * rethrown without attempting a rollback.
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
            const result = await raceSignal(
              callback(transaction),
              transaction.signal,
            );
            await this.commit(transaction);
            return result;
          } catch (error) {
            if (transaction.state === "committed") throw error;
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

    /**
     * The transaction in scope for the current async execution, if any. A
     * finished transaction still held by the context is not in scope.
     */
    getCurrent(): Transaction | undefined {
      return currentTransaction(context);
    },

    /**
     * The adapter handle (what `adapter.begin()` returned) of the
     * transaction in scope for the current async execution, or `undefined`
     * outside a transaction. See `getTransactionHandle`.
     */
    getCurrentHandle<THandle = unknown>(): THandle | undefined {
      const current = currentTransaction(context);
      return current ? getTransactionHandle<THandle>(current) : undefined;
    },
  };
}
