/**
 * Public, read-only access to a transaction's adapter handle.
 *
 * @module context/context.handle
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionContext } from "../transactionTypes/transactionAdapter.js";
import { connectionHandle } from "../transaction/transaction.internal.js";
import { getDefaultContext } from "./context.core.js";

/**
 * The adapter handle a transaction runs on: whatever the adapter's
 * `begin()` returned (for example a database client or connection bound to
 * the transaction).
 *
 * A savepoint resolves to its connection's handle and a participant to the
 * handle of the transaction it joined. A non-transactional scope
 * (`supports`, `not_supported`, `never`) has none and yields `undefined`.
 *
 * The handle is for issuing work inside the transaction. Committing or
 * rolling back through it directly bypasses the manager's state machine,
 * hooks and events; use the manager for that.
 *
 * @typeParam THandle - The handle type your adapter's `begin()` returns.
 * @throws {TypeError} when the transaction was not created by this package.
 */
export function getTransactionHandle<THandle = unknown>(
  transaction: Transaction,
): THandle | undefined {
  return connectionHandle(transaction) as THandle | undefined;
}

/**
 * The adapter handle of the transaction in scope for the current async
 * execution, or `undefined` outside a transaction.
 *
 * Uses the default context unless one is supplied; pass the same context
 * the manager was created with when it was given a custom one (or call the
 * manager's `getCurrentHandle()`).
 *
 * @typeParam THandle - The handle type your adapter's `begin()` returns.
 */
export function currentTransactionHandle<THandle = unknown>(
  context: TransactionContext = getDefaultContext(),
): THandle | undefined {
  const transaction = context.get();
  return transaction ? getTransactionHandle<THandle>(transaction) : undefined;
}
