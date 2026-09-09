/**
 * Transaction lifecycle event emission.
 *
 * `TRANSACTION_EVENTS`, `TransactionEvent` and `TransactionEventHandler` were
 * exported from the package barrel from the beginning and nothing ever
 * produced one. This module is what produces them: the manager threads an
 * emitter through begin, commit and rollback, so an observer sees the same
 * lifecycle the state machine does.
 *
 * @module manager/manager.events
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type {
  TransactionEvent,
  TransactionEventHandler,
} from "../transactionTypes/transactionHooks.js";
import { TRANSACTION_EVENTS } from "../transactionTypes/transactionHooks.js";

/** Emits lifecycle events, or does nothing when no handler was supplied. */
export type TransactionEmitter = (
  type: TransactionEvent["type"],
  transaction: Transaction,
  error?: unknown,
) => void;

/** An emitter that discards everything. */
export const noopEmitter: TransactionEmitter = () => {};

/**
 * Build an emitter around a handler.
 *
 * A throwing observer must not take the transaction down with it, so handler
 * failures are swallowed the same way a throwing error listener is elsewhere
 * in the framework.
 *
 * @param handler - The observer, or undefined to disable emission.
 * @returns An emitter.
 */
export function createEmitter(
  handler: TransactionEventHandler | undefined,
): TransactionEmitter {
  if (!handler) return noopEmitter;

  return (type, transaction, error): void => {
    const event: TransactionEvent = {
      type,
      transactionId: transaction.id,
      timestamp: Date.now(),
      duration: Date.now() - transaction.startedAt,
      ...(error === undefined ? {} : { error }),
    };

    try {
      handler(event);
    } catch {
      // An observer is not allowed to fail the transaction it observes.
    }
  };
}

export { TRANSACTION_EVENTS };
