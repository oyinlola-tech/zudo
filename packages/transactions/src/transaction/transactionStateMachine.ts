/**
 * Transaction state machine — valid transitions and helpers.
 */

import type { TransactionState } from "../transactionTypes/transactionState.js";
import { TransactionStateError } from "../transactionErrors/transactionError.types.js";

/** Valid state transitions. */
const VALID_TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  pending: ["active", "rolling_back", "failed"],
  active: ["committing", "rolling_back", "failed"],
  committing: ["committed", "failed", "rolling_back"],
  committed: [],
  rolling_back: ["rolled_back", "failed"],
  rolled_back: [],
  failed: [],
};

/**
 * Creates a state transition function for a transaction.
 */
export function createTransitionFunction(
  getState: () => TransactionState,
  setState: (state: TransactionState) => void,
): (to: TransactionState) => void {
  return (to: TransactionState): void => {
    const current = getState();
    if (!canTransition(current, to)) {
      throw new TransactionStateError(current, `transition to ${to}`);
    }
    setState(to);
  };
}

/**
 * Whether a state transition is permitted.
 *
 * Error handlers use this before transitioning, so a failure raised from a
 * terminal state cannot be replaced by a TransactionStateError about the
 * transition itself.
 */
export function canTransition(
  from: TransactionState,
  to: TransactionState,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Whether a state admits no further transitions. */
export function isTerminal(state: TransactionState): boolean {
  return (VALID_TRANSITIONS[state]?.length ?? 0) === 0;
}
