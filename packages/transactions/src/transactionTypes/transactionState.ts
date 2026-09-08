/**
 * Transaction state machine, propagation strategies, and isolation levels.
 *
 * @module transactionTypes/transactionState
 */

/** Lifecycle states of a transaction. */
export type TransactionState =
  | "pending"
  | "active"
  | "committing"
  | "committed"
  | "rolling_back"
  | "rolled_back"
  | "failed";

/** Transaction propagation strategies for nested calls. */
export type TransactionPropagation =
  | "required"
  | "requires_new"
  | "supports"
  | "not_supported"
  | "mandatory"
  | "never"
  | "nested";

/**
 * How a transaction handle relates to the underlying adapter transaction.
 *
 * The manager routes commit and rollback by kind: only a `root` owns an
 * adapter transaction, a `participant` must never commit the transaction it
 * joined, a `savepoint` resolves to its savepoint rather than the connection,
 * and `none` marks a deliberately non-transactional scope.
 */
export type TransactionKind = "root" | "participant" | "savepoint" | "none";

/** Database isolation levels. */
export type TransactionIsolationLevel =
  "read_uncommitted" | "read_committed" | "repeatable_read" | "serializable";
