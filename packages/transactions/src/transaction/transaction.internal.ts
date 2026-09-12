/**
 * Typed access to the manager-only surface of a Transaction.
 *
 * `createTransaction` attaches a handful of underscore-prefixed helpers the
 * manager needs and consumers must not use. Routing every access through this
 * module keeps the casts in one place, so renaming a helper is a compile
 * error rather than a runtime `undefined is not a function`.
 *
 * @module transaction/transaction.internal
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionState } from "../transactionTypes/transactionState.js";

/**
 * Key under which the internals are attached.
 *
 * Deliberately not re-exported from the package barrel: the manager imports
 * this module directly, while a consumer holding only the public API has no
 * way to name the property and therefore cannot drive the state machine or
 * steal the adapter handle.
 */
export const TRANSACTION_INTERNALS: unique symbol = Symbol(
  "zudojs.transaction.internals",
);

/** The manager-only operations attached to every transaction. */
export interface TransactionInternals {
  /** Store the adapter handle this transaction commits against. */
  _setHandle(handle: unknown): void;
  /** Read the adapter handle, if one was stored. */
  _getHandle(): unknown;
  /** Drive the state machine directly. */
  _transition(state: TransactionState): void;
  /** Record that the transaction outlived its timeout. */
  _markTimedOut(): void;
  /** The reason supplied to `markRollbackOnly`, if any. */
  _getRollbackOnlyReason(): unknown;
  /**
   * Take the failures collected from `afterCommit` callbacks.
   *
   * The transaction stays committed when a callback throws — nothing can
   * undo the adapter commit — but the failures used to vanish without a
   * trace. The manager drains them and reports them to `hooks.onError`.
   */
  _drainCallbackErrors(): unknown[];
}

/**
 * Access the manager-only surface of a transaction.
 *
 * @param transaction - A transaction created by `createTransaction`.
 * @returns The internal operations.
 * @throws {TypeError} when the transaction did not come from this package.
 */
export function internals(transaction: Transaction): TransactionInternals {
  const carrier = transaction as unknown as {
    [TRANSACTION_INTERNALS]?: TransactionInternals;
  };
  const found = carrier[TRANSACTION_INTERNALS];
  if (!found) {
    throw new TypeError(
      "Transaction was not created by @zudojs/transactions and has no internals.",
    );
  }
  return found;
}

/**
 * Attach the manager-only surface to a freshly created transaction.
 *
 * @param transaction - The transaction to extend.
 * @param operations - The internal operations to attach.
 * @returns The same transaction.
 */
export function attachInternals<T extends Transaction>(
  transaction: T,
  operations: TransactionInternals,
): T {
  Object.defineProperty(transaction, TRANSACTION_INTERNALS, {
    value: operations,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return transaction;
}

/** A savepoint handle stored on a nested transaction. */
export interface SavepointHandle {
  /** The enclosing transaction's adapter handle. */
  readonly parent: unknown;
  /** The savepoint name created on that handle. */
  readonly savepoint: string;
}

/**
 * Resolve the adapter connection a transaction runs on.
 *
 * A savepoint's handle names its parent connection; a participant's handle
 * is the joined transaction's. A savepoint opened inside another savepoint
 * used to be created against the outer *savepoint handle* rather than the
 * connection, which no adapter can act on.
 *
 * @param transaction - Any transaction created by this package.
 * @returns The connection-level adapter handle.
 */
export function connectionHandle(transaction: Transaction): unknown {
  const handle = internals(transaction)._getHandle();
  const savepoint = asSavepointHandle(handle);
  return savepoint ? savepoint.parent : handle;
}

/**
 * Narrow an adapter handle to a savepoint handle.
 *
 * @param handle - The handle stored on a transaction.
 * @returns The savepoint handle, or undefined when it is a plain handle.
 */
export function asSavepointHandle(
  handle: unknown,
): SavepointHandle | undefined {
  if (
    typeof handle === "object" &&
    handle !== null &&
    "savepoint" in handle &&
    typeof (handle as SavepointHandle).savepoint === "string"
  ) {
    return handle as SavepointHandle;
  }
  return undefined;
}
