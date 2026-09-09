/**
 * Utility helpers for the transactions package.
 *
 * @module utils/utils
 */

import type { Transaction } from "../transactionTypes/transaction.interface.js";
import type { TransactionState } from "../transactionTypes/transactionState.js";
import { isTerminal } from "../transaction/transactionStateMachine.js";

/**
 * Check if a transaction is in a terminal state.
 *
 * Delegates to {@link isTerminal}, which derives the answer from the state
 * machine's transition table. This used to hardcode its own list of terminal
 * states, so the two exported predicates could disagree the moment a state
 * was added.
 */
export function isTerminalState(state: TransactionState): boolean {
  return isTerminal(state);
}

/**
 * Check if a transaction can still be modified (active or pending).
 */
export function isModifiable(transaction: Transaction): boolean {
  return transaction.state === "active" || transaction.state === "pending";
}

/**
 * Get a human-readable summary of a transaction.
 */
export function summarizeTransaction(transaction: Transaction): string {
  const duration = Date.now() - transaction.startedAt;
  return [
    `Transaction ${transaction.id}`,
    `state=${transaction.state}`,
    `duration=${duration}ms`,
    transaction.parentId ? `parent=${transaction.parentId}` : "",
    transaction.isRollbackOnly() ? "rollback-only" : "",
  ]
    .filter(Boolean)
    .join(", ");
}
