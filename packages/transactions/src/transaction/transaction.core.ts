/**
 * Core Transaction implementation with state machine enforcement.
 */

import { randomBytes } from "node:crypto";
import type {
  Transaction,
  TransactionOptions,
} from "../transactionTypes/transaction.interface.js";
import type {
  TransactionKind,
  TransactionState,
} from "../transactionTypes/transactionState.js";
import {
  TransactionRollbackError,
  TransactionRollbackOnlyError,
  TransactionStateError,
  TransactionTimeoutError,
} from "../transactionErrors/transactionError.types.js";
import {
  canTransition,
  createTransitionFunction,
} from "./transactionStateMachine.js";
import {
  attachInternals,
  runInPlace,
  type TransactionDetach,
} from "./transaction.internal.js";
import { deferCallbacksToParent } from "./transaction.savepoint.js";

/**
 * Generate a unique transaction ID.
 */
function generateTransactionId(): string {
  return `txn_${randomBytes(16).toString("hex")}`;
}

/**
 * Runs callbacks in order, collecting failures rather than aborting. Each
 * runs detached from the finished transaction's context.
 */
async function runCallbacks(
  callbacks: Array<() => Promise<void>>,
  detach: TransactionDetach,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const callback of callbacks.splice(0)) {
    try {
      await detach(callback);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * Create a new Transaction instance.
 *
 * @param options - Options the transaction was started with.
 * @param parentId - Enclosing transaction id, for nested transactions.
 * @param kind - How this handle relates to the adapter transaction.
 * @param parent - The enclosing transaction of a savepoint. Its callbacks
 *   are deferred to `parent` on release instead of running.
 * @param detach - Runs after-commit / after-rollback work in the scope
 *   that enclosed the transaction. Defaults to running it in place.
 */
export function createTransaction(
  options: TransactionOptions = {},
  parentId?: string,
  kind: TransactionKind = "root",
  parent?: Transaction,
  detach: TransactionDetach = runInPlace,
): Transaction {
  let state: TransactionState = "pending";
  let rollbackOnly = false;
  let rollbackOnlyReason: unknown;
  let timedOut = false;
  const afterCommitCallbacks: Array<() => Promise<void>> = [];
  const afterRollbackCallbacks: Array<() => Promise<void>> = [];
  let callbackErrors: unknown[] = [];
  let handle: unknown;
  const controller = new AbortController();
  const signal = parent
    ? AbortSignal.any([controller.signal, parent.signal])
    : controller.signal;

  const transition = createTransitionFunction(
    () => state,
    (next) => {
      state = next;
    },
  );

  const metadata = new Map<string, unknown>(
    options.metadata ? Object.entries(options.metadata) : [],
  );
  const frozenOptions = Object.freeze({ ...options });

  const id = generateTransactionId();
  const startedAt = Date.now();

  const txn: Transaction = {
    get id(): string {
      return id;
    },
    get parentId(): string | undefined {
      return parentId;
    },
    get kind(): TransactionKind {
      return kind;
    },
    get state(): TransactionState {
      return state;
    },
    get options(): Readonly<TransactionOptions> {
      return frozenOptions;
    },
    get startedAt(): number {
      return startedAt;
    },
    get metadata(): ReadonlyMap<string, unknown> {
      return new Map(metadata);
    },
    get timedOut(): boolean {
      return timedOut;
    },
    get signal(): AbortSignal {
      return signal;
    },

    /**
     * Mark the transaction committed and run its after-commit callbacks.
     *
     * Refuses outright when the transaction is rollback-only: a caller must
     * never be able to mistake a rollback for a commit.
     */
    async commit(): Promise<void> {
      if (state === "committed") return;
      if (state !== "active") {
        throw new TransactionStateError(state, "commit");
      }
      if (rollbackOnly) {
        throw new TransactionRollbackOnlyError(id, rollbackOnlyReason);
      }

      transition("committing");
      transition("committed");
      if (kind === "savepoint" && parent !== undefined) {
        deferCallbacksToParent(parent, afterCommitCallbacks, afterRollbackCallbacks);
        return;
      }
      afterRollbackCallbacks.length = 0;
      // The commit stands whatever the callbacks do; their failures are
      // kept for the manager to report instead of being dropped.
      callbackErrors = await runCallbacks(afterCommitCallbacks, detach);
    },

    async rollback(reason?: unknown): Promise<void> {
      if (state === "rolled_back" || state === "failed") return;
      if (state === "committed") {
        throw new TransactionStateError(state, "rollback");
      }
      if (!canTransition(state, "rolling_back")) {
        throw new TransactionStateError(state, "rollback");
      }

      transition("rolling_back");
      transition("rolled_back");
      afterCommitCallbacks.length = 0;
      const errors = await runCallbacks(afterRollbackCallbacks, detach);

      if (errors.length > 0) {
        throw new TransactionRollbackError(id, {
          cause: new AggregateError(errors, "after-rollback callback failures"),
          originalError: reason,
        });
      }
    },

    markRollbackOnly(reason?: unknown): void {
      rollbackOnly = true;
      rollbackOnlyReason = reason;
    },

    isRollbackOnly(): boolean {
      return rollbackOnly;
    },

    afterCommit(callback: () => Promise<void>): void {
      afterCommitCallbacks.push(callback);
    },

    afterRollback(callback: () => Promise<void>): void {
      afterRollbackCallbacks.push(callback);
    },
  };

  return attachInternals(txn, {
    _setHandle: (next: unknown): void => {
      handle = next;
    },
    _getHandle: (): unknown => handle,
    _transition: transition,
    _markTimedOut: (): void => {
      timedOut = true;
      controller.abort(new TransactionTimeoutError(id, frozenOptions.timeout ?? 0));
    },
    _getRollbackOnlyReason: (): unknown => rollbackOnlyReason,
    _drainCallbackErrors: (): unknown[] => callbackErrors.splice(0),
    _detach: detach,
  });
}
