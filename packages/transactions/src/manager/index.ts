/**
 * Transaction manager — coordinates begin, commit, rollback, and context.
 *
 * @module manager
 */

export {
  createTransactionManager,
  type TransactionManagerOptions,
} from "./manager.core.js";
export { commitTransaction, rollbackTransaction } from "./manager.commit.js";
export {
  resolvePropagation,
  suspendsTransaction,
} from "./manager.propagation.js";
export type { PropagationContext } from "./manager.propagation.js";
export { assertAdapterSupports } from "./manager.capabilities.js";
export { withRetry } from "./manager.retry.js";
