/**
 * Transaction hooks, registry, result, and events.
 *
 * @module transactionTypes/transactionHooks
 */

import type { Transaction } from "./transaction.interface.js";

// ─── Hooks ────────────────────────────────────────────────────────────────

/** Context passed to transaction hooks. */
export interface TransactionHookContext {
  /** The transaction. */
  readonly transaction: Transaction;
}

/** Context passed to error hooks. */
export interface TransactionErrorContext {
  /** The transaction. */
  readonly transaction: Transaction;
  /** The error that occurred. */
  readonly error: unknown;
}

/** Lifecycle hooks for transactions. */
export interface TransactionHooks {
  beforeBegin?(context: TransactionHookContext): Promise<void>;
  afterBegin?(context: TransactionHookContext): Promise<void>;
  beforeCommit?(context: TransactionHookContext): Promise<void>;
  afterCommit?(context: TransactionHookContext): Promise<void>;
  beforeRollback?(context: TransactionHookContext): Promise<void>;
  afterRollback?(context: TransactionHookContext): Promise<void>;
  onError?(context: TransactionErrorContext): Promise<void>;
}

// ─── Registry ─────────────────────────────────────────────────────────────

/** Registry for tracking active transactions. */
export interface TransactionRegistry {
  register(transaction: Transaction): void;
  unregister(transactionId: string): void;
  get(transactionId: string): Transaction | undefined;
  getActive(): readonly Transaction[];
}

// ─── Events ───────────────────────────────────────────────────────────────

/** Transaction event types. */
export const TRANSACTION_EVENTS = {
  STARTED: "transaction.started",
  COMMITTING: "transaction.committing",
  COMMITTED: "transaction.committed",
  ROLLING_BACK: "transaction.rolling_back",
  ROLLED_BACK: "transaction.rolled_back",
  FAILED: "transaction.failed",
  TIMED_OUT: "transaction.timed_out",
} as const;

/** A transaction lifecycle event. */
export interface TransactionEvent {
  readonly type: (typeof TRANSACTION_EVENTS)[keyof typeof TRANSACTION_EVENTS];
  readonly transactionId: string;
  readonly timestamp: number;
  readonly duration?: number;
  readonly error?: unknown;
}

/** Handler for transaction events. */
export type TransactionEventHandler = (event: TransactionEvent) => void;
