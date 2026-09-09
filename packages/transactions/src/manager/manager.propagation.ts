/**
 * Transaction propagation strategies.
 *
 * Both branches matter: what a mode does when a transaction is already in
 * progress, and what it does when none is. Handling only the first branch is
 * how `mandatory` silently starts a transaction instead of demanding one.
 *
 * @module manager/manager.propagation
 */

import type {
  Transaction,
  TransactionOptions,
} from "../transactionTypes/transaction.interface.js";
import type { TransactionAdapter } from "../transactionTypes/transactionAdapter.js";
import type { TransactionHooks } from "../transactionTypes/transactionHooks.js";
import type { TransactionPropagation } from "../transactionTypes/transactionState.js";
import { createTransaction } from "../transaction/transaction.core.js";
import {
  createNonTransactional,
  createParticipant,
} from "../transaction/transaction.participant.js";
import { internals } from "../transaction/transaction.internal.js";
import {
  SavepointError,
  TransactionCapabilityError,
  TransactionPropagationError,
} from "../transactionErrors/transactionError.types.js";
import { assertAdapterSupports } from "./manager.capabilities.js";
import type { TransactionEmitter } from "./manager.events.js";
import { noopEmitter, TRANSACTION_EVENTS } from "./manager.events.js";

/** Everything a propagation branch may need. */
export interface PropagationContext {
  readonly current: Transaction | undefined;
  readonly opts: TransactionOptions | undefined;
  readonly adapter: TransactionAdapter;
  readonly hooks: TransactionHooks | undefined;
  /** Lifecycle event emitter. Defaults to discarding events. */
  readonly emit?: TransactionEmitter;
}

/**
 * Open a root transaction against the adapter and make it active.
 *
 * @param context - The propagation context.
 * @param parentId - Enclosing transaction id, when nested.
 * @returns An active transaction owning an adapter handle.
 */
export async function beginRoot(
  context: PropagationContext,
  parentId?: string,
): Promise<Transaction> {
  const { adapter, hooks, opts } = context;
  const emit = context.emit ?? noopEmitter;
  assertAdapterSupports(adapter, opts);

  const transaction = createTransaction(opts, parentId, "root");
  if (hooks?.beforeBegin) await hooks.beforeBegin({ transaction });

  try {
    internals(transaction)._setHandle(await adapter.begin(opts));
    internals(transaction)._transition("active");
  } catch (error) {
    internals(transaction)._transition("failed");
    emit(TRANSACTION_EVENTS.FAILED, transaction, error);
    throw error;
  }

  emit(TRANSACTION_EVENTS.STARTED, transaction);
  if (hooks?.afterBegin) await hooks.afterBegin({ transaction });
  return transaction;
}

/**
 * Create a nested transaction backed by a savepoint on the enclosing one.
 *
 * @param parent - The enclosing transaction.
 * @param context - The propagation context.
 * @returns An active transaction whose handle names its savepoint.
 */
async function beginSavepoint(
  parent: Transaction,
  context: PropagationContext,
): Promise<Transaction> {
  const { adapter, hooks, opts } = context;
  const emit = context.emit ?? noopEmitter;

  if (!adapter.capabilities.savepoints || !adapter.createSavepoint) {
    // A missing capability is a configuration mismatch, not a propagation
    // rule violation, and TransactionCapabilityError names what is missing.
    throw new TransactionCapabilityError(
      "savepoints, required by nested transactions",
    );
  }

  const child = createTransaction(opts, parent.id, "savepoint");
  if (hooks?.beforeBegin) await hooks.beforeBegin({ transaction: child });

  const savepoint = `sp_${child.id}`;
  const parentHandle = internals(parent)._getHandle();

  try {
    await adapter.createSavepoint(parentHandle, savepoint);
    internals(child)._setHandle({ parent: parentHandle, savepoint });
    internals(child)._transition("active");
  } catch (error) {
    internals(child)._transition("failed");
    emit(TRANSACTION_EVENTS.FAILED, child, error);
    throw new SavepointError(
      `Failed to create savepoint "${savepoint}"`,
      error,
    );
  }

  emit(TRANSACTION_EVENTS.STARTED, child);
  if (hooks?.afterBegin) await hooks.afterBegin({ transaction: child });
  return child;
}

/**
 * Resolve a propagation mode to a transaction handle.
 *
 * @param propagation - The requested mode.
 * @param context - The propagation context.
 * @returns The handle the caller should use.
 * @throws {TransactionPropagationError} when the mode's precondition fails.
 */
export async function resolvePropagation(
  propagation: TransactionPropagation,
  context: PropagationContext,
): Promise<Transaction> {
  const { current, opts } = context;

  switch (propagation) {
    case "required":
      return current ? createParticipant(current) : beginRoot(context);

    case "requires_new":
      return beginRoot(context);

    case "supports":
      return current
        ? createParticipant(current)
        : createNonTransactional(opts);

    case "not_supported":
      return createNonTransactional(opts);

    case "mandatory":
      if (!current) {
        throw new TransactionPropagationError(
          "Propagation is 'mandatory' but no transaction is in progress",
        );
      }
      return createParticipant(current);

    case "never":
      if (current) {
        throw new TransactionPropagationError(
          "Transaction exists but propagation is 'never'",
        );
      }
      return createNonTransactional(opts);

    case "nested":
      return current ? beginSavepoint(current, context) : beginRoot(context);

    default:
      throw new TransactionPropagationError(
        `Unknown propagation: ${String(propagation)}`,
      );
  }
}

/** Whether a propagation mode runs its body outside any transaction. */
export function suspendsTransaction(
  propagation: TransactionPropagation,
): boolean {
  return propagation === "not_supported" || propagation === "requires_new";
}
