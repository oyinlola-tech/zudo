# @zudojs/transactions

## 1.1.0

### Minor Changes

- Nesting, timeout and retry fixes (audit round 9).

  - `nested` propagation now works inside a joined (participant) scope; it used to throw `TypeError: Transaction was not created by @zudojs/transactions`.
  - A savepoint opened inside another savepoint is created, rolled back to and released on the connection; it used to receive the outer savepoint handle, which no adapter can act on.
  - `begin()` honours `timeout`: a hand-managed transaction is marked timed-out and rollback-only when the deadline passes and `commit()` then rejects with `TransactionTimeoutError`. Only `run()` armed the timer before, although `begin()` validated the option against the adapter.
  - `manager.commit()` and `manager.rollback()` release the transaction's timeout timer and registry entry once it reaches a terminal state; hand-managed transactions used to stay in the registry forever.
  - Failures thrown by `afterCommit` callbacks are reported to `hooks.onError` as an `AggregateError` (the commit itself stands); they used to be discarded.
  - `run()` with `retry` no longer replays an attempt that only joined an enclosing transaction: that attempt has already marked the enclosing transaction rollback-only, so a replay repeated its side effects to no effect. Owned (root and savepoint) transactions retry as before.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Make commit, rollback and propagation mean what they say.

  These are behavioural changes, and several of them turn a silent no-op into a
  thrown error. That is the point: every defect below presented as a successful
  call that did the wrong thing to the database.

  **Rollback-only now prevents the commit.** `commitTransaction` awaited
  `adapter.commit(handle)` _before_ the rollback-only flag was read, so a
  transaction marked rollback-only — including one that had timed out — was
  committed to the database and only then flipped its own state to
  `rolled_back`, firing the `afterCommit` hooks on the way. The flag is now read
  first: the transaction is rolled back through the adapter and `commit()`
  rejects with a `TransactionRollbackError`. Code that called `commit()` on a
  rollback-only transaction and expected it to resolve must now catch.

  **A nested `run()` no longer completes the enclosing transaction.** With the
  default `required` propagation, `begin()` returned the current transaction and
  `run()` applied its own completion logic to it, so an inner unit of work
  committed the outer transaction while the outer callback was still running —
  and an inner failure rolled the whole outer transaction back. `begin()` now
  returns a _participant_ (`kind: "participant"`) that observes the transaction
  it joined but never commits it; a failing participant marks the enclosing
  transaction rollback-only instead.

  **`Transaction` gained a `kind` field** — `"root"`, `"participant"`,
  `"savepoint"` or `"none"` — which is how the manager routes commit and
  rollback. Custom `Transaction` implementations must supply it.

  **`requires_new` and `nested` produce active transactions.** Both created a
  transaction, opened a real adapter transaction, and left it in `pending`;
  `commitTransaction` then returned silently because the state was not `active`,
  so the writes were never committed and the connection was left holding an open
  transaction. Both now transition to `active`, and both are committed and
  rolled back correctly.

  **Committing a non-active transaction throws.** The early return treated every
  non-active state as "nothing to do", so committing an already-rolled-back
  transaction reported success. Only an already-committed transaction is now a
  no-op; anything else raises `TransactionStateError`.

  **Savepoints are used.** `rollbackToSavepoint` and `releaseSavepoint` were
  declared on the adapter contract and called nowhere: rolling back a nested
  transaction passed the savepoint wrapper to plain `adapter.rollback`, discarding
  the entire outer transaction. A nested rollback now rolls back to its savepoint
  and a nested commit releases it.

  **Rolling back a `pending` transaction works.** `rollback()` admitted `pending`
  but the state machine had no `pending → rolling_back` edge, so it always threw.

  **Propagation is implemented on both branches.** `supports`, `not_supported`
  and `mandatory` all returned the current transaction regardless. `mandatory`
  with no transaction in progress now throws instead of silently starting one;
  `not_supported` suspends the enclosing transaction and runs non-transactionally
  (`kind: "none"`); `supports` and `never` run non-transactionally when nothing
  is in progress. `TransactionContext` gained `exit()` to support suspension —
  custom context implementations must provide it.

  **Retries happen.** `TransactionOptions.retry` was documented and never read.
  `run()` now replays the unit of work per `attempts`, `delay` and `backoff`, with
  an optional `shouldRetry` predicate so retries can be limited to genuinely
  transient failures.

  **Adapter capabilities are enforced.** Requesting an isolation level, a
  read-only transaction or a timeout the adapter does not declare now throws
  `TransactionAdapterError` rather than running at the driver's default.
  `createInMemoryAdapter()` now declares its capabilities honestly and emulates
  savepoints, so it accepts every isolation level and supports `nested`.

  **Timeouts no longer leak a timer,** and the manager accepts an optional
  `registry` which is notified as owned transactions start and finish.

  **Internals are no longer reachable.** `_setHandle`, `_transition`,
  `_markTimedOut` and friends moved behind a module-private symbol. Code driving
  the state machine through those casts must go through the manager.

  **`require()` removed.** The default-context path used `require()` in an
  ESM-only package, so `createTransactionManager({ adapter })` without an explicit
  `context` threw `ReferenceError: require is not defined` on its first `begin()`.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5)]:
  - @zudojs/errors@0.2.0

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
