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
  TransactionCommitError,
  TransactionRollbackError,
  TransactionStateError,
} from "../transactionErrors/transactionError.types.js";

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
      await adapter.releaseSavepoint(savepoint.parent, savepoint.savepoint);
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
    if (adapter.rollbackToSavepoint) {
      await adapter.rollbackToSavepoint(savepoint.parent, savepoint.savepoint);
    }
    if (adapter.releaseSavepoint) {
      await adapter.releaseSavepoint(savepoint.parent, savepoint.savepoint);
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
 * @throws {TransactionRollbackError} when the transaction is rollback-only.
 * @throws {TransactionStateError} when the transaction cannot be committed.
 * @throws {TransactionCommitError} when the adapter refuses the commit.
 */
export async function commitTransaction(
  transaction: Transaction,
  adapter: TransactionAdapter,
  hooks?: TransactionHooks,
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
    await rollbackTransaction(
      transaction,
      adapter,
      internals(transaction)._getRollbackOnlyReason() ?? "marked rollback-only",
      hooks,
    );
    throw new TransactionRollbackError(transaction.id, {
      originalError:
        internals(transaction)._getRollbackOnlyReason() ??
        "marked rollback-only",
    });
  }

  if (hooks?.beforeCommit) await hooks.beforeCommit({ transaction });

  try {
    await adapterCommit(transaction, adapter);
    await transaction.commit();
  } catch (error) {
    markFailed(transaction);
    if (hooks?.onError) await hooks.onError({ transaction, error });
    throw new TransactionCommitError(transaction.id, error);
  }

  if (hooks?.afterCommit) await hooks.afterCommit({ transaction });
}

/**
 * Rollback a transaction with hooks and adapter coordination.
 *
 * @throws {TransactionRollbackError} when the adapter refuses the rollback.
 */
export async function rollbackTransaction(
  transaction: Transaction,
  adapter: TransactionAdapter,
  reason?: unknown,
  hooks?: TransactionHooks,
): Promise<void> {
  if (transaction.kind === "participant") {
    await transaction.rollback(reason);
    return;
  }

  if (
    transaction.state === "committed" ||
    transaction.state === "rolled_back" ||
    transaction.state === "failed"
  ) {
    return;
  }

  if (hooks?.beforeRollback) await hooks.beforeRollback({ transaction });

  try {
    if (transaction.kind !== "none") {
      await adapterRollback(transaction, adapter, reason);
    }
    await transaction.rollback(reason);
  } catch (error) {
    markFailed(transaction);
    if (hooks?.onError) await hooks.onError({ transaction, error });
    throw new TransactionRollbackError(transaction.id, {
      cause: error,
      originalError: reason,
    });
  }

  if (hooks?.afterRollback) await hooks.afterRollback({ transaction });
}
