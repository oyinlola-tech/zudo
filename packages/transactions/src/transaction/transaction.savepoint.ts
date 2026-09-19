/**
 * Savepoint callback deferral.
 *
 * Releasing a savepoint is not a commit: the enclosing transaction can still
 * roll back and discard everything the savepoint did. Callbacks registered on
 * a savepoint therefore move to its parent when the savepoint is released,
 * the same way a participant registers straight on the transaction it
 * joined. They run once the outermost transaction settles: `afterCommit`
 * when it commits, `afterRollback` when it rolls back.
 *
 * @module transaction/transaction.savepoint
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";

/**
 * Move a released savepoint's pending callbacks onto its parent.
 *
 * Both arrays are emptied: the callbacks now belong to the parent.
 *
 * @param parent - The transaction the savepoint was created on.
 * @param afterCommit - The savepoint's pending after-commit callbacks.
 * @param afterRollback - The savepoint's pending after-rollback callbacks.
 */
export function deferCallbacksToParent(
  parent: Transaction,
  afterCommit: Array<() => Promise<void>>,
  afterRollback: Array<() => Promise<void>>,
): void {
  for (const callback of afterCommit.splice(0)) parent.afterCommit(callback);
  for (const callback of afterRollback.splice(0)) {
    parent.afterRollback(callback);
  }
}
