/**
 * Participant and non-transactional transaction handles.
 *
 * A participant is what `required`, `supports` and `mandatory` hand back when
 * a transaction is already in progress. It delegates every observation to the
 * transaction it joined but owns nothing: committing it is a no-op, and
 * rolling it back marks the enclosing transaction rollback-only rather than
 * discarding work the enclosing scope has not finished with.
 *
 * @module transaction/transaction.participant
 */

import type {
  Transaction,
  TransactionOptions,
} from "../transactionTypes/transaction.interface.js";
import type {
  TransactionKind,
  TransactionState,
} from "../transactionTypes/transactionState.js";
import { createTransaction } from "./transaction.core.js";
import { attachInternals, internals } from "./transaction.internal.js";

/**
 * Create a handle that joins an in-progress transaction.
 *
 * @param parent - The transaction being joined.
 * @returns A participant handle delegating to `parent`.
 */
export function createParticipant(parent: Transaction): Transaction {
  const participant: Transaction = {
    get id(): string {
      return parent.id;
    },
    get parentId(): string | undefined {
      return parent.parentId;
    },
    get kind(): TransactionKind {
      return "participant";
    },
    get state(): TransactionState {
      return parent.state;
    },
    get options(): Readonly<TransactionOptions> {
      return parent.options;
    },
    get startedAt(): number {
      return parent.startedAt;
    },
    get metadata(): ReadonlyMap<string, unknown> {
      return parent.metadata;
    },
    get timedOut(): boolean {
      return parent.timedOut;
    },

    /** No-op: the transaction is committed by whoever opened it. */
    async commit(): Promise<void> {},

    /** Marks the joined transaction rollback-only. */
    async rollback(reason?: unknown): Promise<void> {
      parent.markRollbackOnly(reason ?? "participant rolled back");
    },

    markRollbackOnly(reason?: unknown): void {
      parent.markRollbackOnly(reason);
    },

    isRollbackOnly(): boolean {
      return parent.isRollbackOnly();
    },

    afterCommit(callback: () => Promise<void>): void {
      parent.afterCommit(callback);
    },

    afterRollback(callback: () => Promise<void>): void {
      parent.afterRollback(callback);
    },
  };

  // A participant owns nothing, but the manager still has to reach the
  // adapter handle of the transaction it joined: a `nested` run inside a
  // participant scope used to throw "Transaction was not created by
  // @zudojs/transactions" because the frozen participant carried no
  // internals at all. Reads delegate to the joined transaction; writes
  // are refused, since only the owner may drive its state.
  const refuse = (): never => {
    throw new TypeError(
      "A participant does not own the transaction it joined and cannot modify it.",
    );
  };

  attachInternals(participant, {
    _setHandle: refuse,
    _getHandle: (): unknown => internals(parent)._getHandle(),
    _transition: refuse,
    _markTimedOut: refuse,
    _getRollbackOnlyReason: (): unknown =>
      internals(parent)._getRollbackOnlyReason(),
    _drainCallbackErrors: (): unknown[] => [],
  });

  return Object.freeze(participant);
}

/**
 * Create a handle for a deliberately non-transactional scope.
 *
 * Returned by `supports` and `never` when nothing is in progress, and by
 * `not_supported` always. It moves through the normal lifecycle so callers can
 * treat it uniformly, but never touches an adapter.
 *
 * @param options - Options the scope was opened with.
 * @returns A transaction handle bound to no adapter transaction.
 */
export function createNonTransactional(
  options: TransactionOptions = {},
): Transaction {
  const txn = createTransaction(options, undefined, "none");
  internals(txn)._transition("active");
  return txn;
}
