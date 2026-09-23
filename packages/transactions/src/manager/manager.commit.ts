/**
 * Transaction commit and rollback orchestration.
 *
 * Ordering is the whole point of this module. The rollback-only flag is read
 * before the adapter is asked to commit, never after: once `adapter.commit()`
 * has returned there is nothing left to decide.
 *
 * @module manager/manager.commit
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionAdapter } from "../transactionTypes/transactionAdapter.js";
import type { TransactionHooks } from "../transactionTypes/transactionHooks.js";
import {
  asSavepointHandle,
  internals,
} from "../transaction/transaction.internal.js";
import { canTransition } from "../transaction/transactionStateMachine.js";
import {
  SavepointError,
  TransactionCommitError,
  TransactionRollbackError,
  TransactionRollbackOnlyError,
  TransactionStateError,
  TransactionTimeoutError,
} from "../transactionErrors/transactionError.types.js";
import type { TransactionEmitter } from "./manager.events.js";
import { noopEmitter, TRANSACTION_EVENTS } from "./manager.events.js";

/** Moves a transaction to `failed` when the state machine allows it. */
function markFailed(transaction: Transaction): void {
  if (canTransition(transaction.state, "failed")) {
    internals(transaction)._transition("failed");
  }
}

/** Releases a savepoint, or commits the connection for a root transaction. */
async function adapterCommit(
  transaction: Transaction,
  adapter: TransactionAdapter,
): Promise<void> {
  const handle = internals(transaction)._getHandle();
  const savepoint = asSavepointHandle(handle);

  if (savepoint) {
    if (adapter.releaseSavepoint) {
      try {
        await adapter.releaseSavepoint(savepoint.parent, savepoint.savepoint);
      } catch (error) {
        throw new SavepointError(
          `Failed to release savepoint "${savepoint.savepoint}"`,
          error,
        );
      }
    }
    return;
  }

  await adapter.commit(handle);
}

/** Rolls back to a savepoint, or rolls back the connection. */
async function adapterRollback(
  transaction: Transaction,
  adapter: TransactionAdapter,
  reason: unknown,
): Promise<void> {
  const handle = internals(transaction)._getHandle();
  if (handle === undefined) return;

  const savepoint = asSavepointHandle(handle);

  if (savepoint) {
    try {
      if (adapter.rollbackToSavepoint) {
        await adapter.rollbackToSavepoint(
          savepoint.parent,
          savepoint.savepoint,
        );
      }
      if (adapter.releaseSavepoint) {
        await adapter.releaseSavepoint(savepoint.parent, savepoint.savepoint);
      }
    } catch (error) {
      throw new SavepointError(
        `Failed to roll back to savepoint "${savepoint.savepoint}"`,
        error,
      );
    }
    return;
  }

  await adapter.rollback(handle, reason);
}

/**
 * Commit a transaction with hooks and adapter coordination.
 *
 * A participant commits nothing — the scope that opened the transaction does
 * that — and a non-transactional scope has no adapter to talk to. Anything
 * else must be active: committing a transaction that was already rolled back
 * is a programming error, not a no-op.
 *
 * @throws {TransactionTimeoutError} when the transaction outlived its timeout.
 * @throws {TransactionRollbackOnlyError} when the transaction is rollback-only
 *   (a `TransactionRollbackError` subclass): the commit was refused and the
 *   transaction rolled back.
 * @throws {TransactionStateError} when the transaction cannot be committed.
 * @throws {TransactionCommitError} when the adapter refuses the commit.
 */
export async function commitTransaction(
  transaction: Transaction,
  adapter: TransactionAdapter,
  hooks?: TransactionHooks,
  emit: TransactionEmitter = noopEmitter,
): Promise<void> {
  if (transaction.kind === "participant") return;
  if (transaction.state === "committed") return;

  if (transaction.kind === "none") {
    await transaction.commit();
    return;
  }

  if (transaction.state !== "active") {
    throw new TransactionStateError(transaction.state, "commit");
  }

  if (transaction.isRollbackOnly()) {
    const reason =
      internals(transaction)._getRollbackOnlyReason() ?? "marked rollback-only";

    await rollbackTransaction(transaction, adapter, reason, hooks, emit);

    // A timeout is a distinct failure from a caller marking the transaction
    // rollback-only. `timed_out` was already emitted by the timer when the
    // timeout fired; emitting it again here reported one timeout twice.
    if (transaction.timedOut) {
      throw new TransactionTimeoutError(
        transaction.id,
        transaction.options.timeout ?? 0,
      );
    }

    throw new TransactionRollbackOnlyError(transaction.id, reason);
  }

  if (hooks?.beforeCommit) await hooks.beforeCommit({ transaction });
  emit(TRANSACTION_EVENTS.COMMITTING, transaction);

  if (hooks?.afterCommit && transaction.kind === "savepoint") {
    // Releasing a savepoint is not a commit. Registered as a callback, the
    // hook is deferred with the savepoint's own callbacks and fires only if
    // the outermost transaction commits.
    const afterCommit = hooks.afterCommit;
    transaction.afterCommit(() => afterCommit({ transaction }));
  }

  try {
    await adapterCommit(transaction, adapter);
    await transaction.commit();
  } catch (error) {
    markFailed(transaction);
    emit(TRANSACTION_EVENTS.FAILED, transaction, error);
    if (hooks?.onError) await hooks.onError({ transaction, error });
    throw new TransactionCommitError(transaction.id, error);
  }

  emit(TRANSACTION_EVENTS.COMMITTED, transaction);

  // afterCommit callbacks that threw did not undo the commit, but they
  // used to fail silently. Report them without changing the outcome.
  const callbackErrors = internals(transaction)._drainCallbackErrors();
  if (callbackErrors.length > 0 && hooks?.onError) {
    await hooks.onError({
      transaction,
      error: new AggregateError(
        callbackErrors,
        "after-commit callback failures",
      ),
    });
  }

  if (hooks?.afterCommit && transaction.kind !== "savepoint") {
    await hooks.afterCommit({ transaction });
  }
}

/**
 * Rollback a transaction with hooks and adapter coordination.
 *
 * Rolling back a transaction that is already rolled back or failed is a
 * no-op; a committed transaction cannot be undone, so asking to roll it
 * back is a programming error (the same rule `Transaction.rollback()`
 * enforces) rather than a silent no-op.
 *
 * @throws {TransactionStateError} when the transaction is already committed.
 * @throws {TransactionRollbackError} when the adapter refuses the rollback.
 */
export async function rollbackTransaction(
  transaction: Transaction,
  adapter: TransactionAdapter,
  reason?: unknown,
  hooks?: TransactionHooks,
  emit: TransactionEmitter = noopEmitter,
): Promise<void> {
  if (transaction.kind === "participant") {
    await transaction.rollback(reason);
    return;
  }

  if (transaction.state === "committed") {
    throw new TransactionStateError(transaction.state, "rollback");
  }

  if (transaction.state === "rolled_back" || transaction.state === "failed") {
    return;
  }

  if (hooks?.beforeRollback) await hooks.beforeRollback({ transaction });
  emit(TRANSACTION_EVENTS.ROLLING_BACK, transaction, reason);

  try {
    if (transaction.kind !== "none") {
      await adapterRollback(transaction, adapter, reason);
    }
    await transaction.rollback(reason);
  } catch (error) {
    markFailed(transaction);
    emit(TRANSACTION_EVENTS.FAILED, transaction, error);
    if (hooks?.onError) await hooks.onError({ transaction, error });
    throw new TransactionRollbackError(transaction.id, {
      cause: error,
      originalError: reason,
    });
  }

  emit(TRANSACTION_EVENTS.ROLLED_BACK, transaction, reason);
  if (hooks?.afterRollback) await hooks.afterRollback({ transaction });
}
