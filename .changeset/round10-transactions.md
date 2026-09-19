---
"@zudojs/transactions": patch
---

Round 10 fixes:

- INF-04: releasing a savepoint (`propagation: "nested"`) is no longer treated as a commit. Its `afterCommit` and `afterRollback` callbacks, and `hooks.afterCommit` for the savepoint, move to the enclosing transaction and run only when the outermost transaction commits (or, for `afterRollback`, rolls back). A savepoint that is itself rolled back still runs its `afterRollback` at once and discards its `afterCommit`.

Behaviour changes: side effects registered inside a nested block no longer run when the outer transaction later rolls back. `hooks.afterCommit` for a savepoint fires after the root commit, and a failure there is reported through `hooks.onError` (like any after-commit callback) instead of rejecting the savepoint's commit.
- **infra/INF-16 (phase 2):** `TransactionError` and its 11 subclasses (`TransactionStateError`, `TransactionTimeoutError`, `TransactionCommitError`, `TransactionRollbackError`, `TransactionAdapterError`, `TransactionPropagationError`, `TransactionIsolationError`, `SavepointError`, `TransactionRequiredError`, `TransactionUnexpectedError`, `TransactionCapabilityError`) are now owned by `@zudojs/errors` and re-exported here. Names, constructors and codes are unchanged, and `instanceof` now matches whichever package the class is imported from. New type export: `TransactionErrorOptions`.
