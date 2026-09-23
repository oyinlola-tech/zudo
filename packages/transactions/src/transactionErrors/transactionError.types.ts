/**
 * Specific transaction error subclasses.
 *
 * Owned by `@zudojs/errors` (round 10 INF-16) and re-exported here with the
 * same names, constructor signatures and codes, so `instanceof` checks match
 * across both import paths.
 */

export {
  TransactionStateError,
  TransactionTimeoutError,
  TransactionCommitError,
  TransactionRollbackError,
  TransactionRollbackOnlyError,
  TransactionAdapterError,
  TransactionPropagationError,
  TransactionIsolationError,
  SavepointError,
  TransactionRequiredError,
  TransactionUnexpectedError,
  TransactionCapabilityError,
} from "@zudojs/errors";
