# @zudojs/transactions

## 1.3.0

### Minor Changes

- Round 12 (academy findings) — data packages. No breaking changes; every fix is reproduced by a test first (`tests/*.round12.test.ts`).

  **@zudojs/database**

  - **Keyset pagination no longer skips rows created in the same millisecond ([#79](https://github.com/oyinlola-tech/zudo/issues/79)).** Cursors encode a `Date` at millisecond precision while PostgreSQL `timestamp`/`timestamptz` keep microseconds, so `createdAt = C` matched nothing and `createdAt < C` skipped the rest of the millisecond: four rows paged with `limit: 1` came back as one. `buildKeysetWhere` now compares a date cursor value as its millisecond bucket (`gte C, lt C + 1ms` for a tie; `lt C` / `gte C + 1ms` for the strict part) and lets the id tiebreaker order rows inside it. Exact for identical timestamps and for insertion-ordered ids; on millisecond-precision columns it is the old comparison. Reproduced against PGlite (`timestamptz` rows one microsecond apart and four identical timestamps). Existing cursors keep working. New helpers: `isDateCursorValue`, `keysetTieFilter`, `keysetStrictFilter`, `nextMillisecond`.
  - **`BaseRepository.createCursor(row, { sort, direction })` ([#80](https://github.com/oyinlola-tech/zudo/issues/80))** builds a cursor `paginateCursor` accepts: it appends the id tiebreaker and signs with `cursorSecret`. `createKeysetCursor(row, sort)` with the bare sort produced a cursor `paginateCursor` rejected as missing the id field; its JSDoc now says so.
  - **`mapRepositoryError` maps every code `normalizeDatabaseError` maps ([#77](https://github.com/oyinlola-tech/zudo/issues/77)).** `P2004` (check constraint) → 409, `P2000`/`P2011` → 400, `P2014` → 409, `P2015`/`P2018` → 404, `P2028` → 503, via the shared table (new `getPrismaCodeMapping`, `PrismaCodeMapping`). They used to fall through to a non-exposed 500 `ERR_DATABASE_QUERY`.
  - **`SoftDeletableEntity<TId = string>` and `AuditableEntity<TId = string>` ([#78](https://github.com/oyinlola-tech/zudo/issues/78))** take the id type, as `DatabaseEntity` does, so `interface Task extends SoftDeletableEntity<number>` compiles.
  - **Migrations can opt out of their transaction ([#81](https://github.com/oyinlola-tech/zudo/issues/81)).** `Migration.transaction: false` runs `up`/`down` on the root client outside any transaction (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE`); the applied check and the history record still run in short transactions under the advisory lock. Requires `perItemTransaction: true` (a batch runner refuses it at construction); a failed body is not recorded.
  - **`createTransactionContext` collision documented ([#110](https://github.com/oyinlola-tech/zudo/issues/110)).** This package's function builds the immutable status record `TransactionManager.run` reports; `@zudojs/transactions`' creates an AsyncLocalStorage store. Both keep their names (a rename would break imports); the JSDoc and README of each now name the other and say which to use.

  **@zudojs/storage**

  - **`BaseRepository` no longer passes raw driver errors through ([#82](https://github.com/oyinlola-tech/zudo/issues/82)).** A PostgreSQL error with a SQLSTATE `code` becomes a `StorageError`: `23505`/`23503`/`23514`/`23P01` → exposable 409 `ERR_CONFLICT`; `23502`/`22001`/`22003`/`22007`/`22P02` → exposable 400 `ERR_INVALID_INPUT`; `40001`/`40P01` → 409 with `metadata.retryable`; `57014` and connection class `08` → 503; anything else a non-exposed 500. The message names only the table and operation; the constraint/column name goes to `metadata` and the driver error is the `cause`. Existing `@zudojs/errors` errors pass through unchanged, and builder validation errors (`TypeError`) are raised before the wrapper. New protected `execute(operation, work)` for subclasses and exported `mapRepositoryError` / `RepositoryErrorContext`.

  **@zudojs/transactions**

  - **Work started from `afterCommit` no longer joins the finished transaction ([#127](https://github.com/oyinlola-tech/zudo/issues/127)).** Callbacks and hooks ran with the committed transaction's context still active, so a timer or queued job started there saw `getCurrent()` return the committed transaction and a new `manager.run()` joined it as a participant ("Transaction is closed", jobs retrying forever). Two fixes: after-commit/after-rollback callbacks and hooks now run in the scope that enclosed the transaction (the outer transaction of a `requires_new`, otherwise none), and the manager reads the scope through the new `currentTransaction(context)`, which ignores a committed, rolled-back or failed transaction still held by the store — so `getCurrent()`, `getCurrentHandle()`, `currentTransactionHandle()` and `begin()` (including `mandatory`/`never`) all treat a finished transaction as no transaction. `manager.getCurrent()` inside an `afterCommit` callback is now `undefined` (the hook argument still carries the transaction).
  - **`TransactionManager` is an exported type ([#90](https://github.com/oyinlola-tech/zudo/issues/90))**; `createTransactionManager` is declared to return it, replacing `ReturnType<typeof createTransactionManager>`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.2.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.2.0

### Minor Changes

- **@zudojs/database**

  - Caller errors pass through transactions. A `@zudojs/errors` `BaseError` that is not a `DatabaseError` (a `NotFoundError`, `DomainError`, `ValidationError`, ...) thrown by a callback given to `DatabaseClient.transaction()`, `withTransaction()`, `TransactionManager.run()/execute()` or a unit of work still rolls the transaction back, but is now rethrown as the same instance instead of being wrapped in a 500 `DatabaseError`. It is logged at debug level instead of as an error. Driver and database failures, and any other thrown value, are normalised and logged as before. New `isNonDatabaseBaseError(error)` guard.
  - `paginateCursor` now sets `meta.previousCursor` on any non-empty page requested with a cursor, and accepts it to page backward (rows come back in the requested sort order). Backward cursors carry a reserved `$before: true` marker. New helpers: `getKeysetDirection`, `keysetFetchSort`, `reverseKeysetSort`, `KEYSET_BACKWARD_KEY`. `createKeysetCursor` takes an optional `direction`, `createKeysetPage` a `direction` option, and `buildKeysetWhere` honours backward cursors.
  - **Behaviour change:** a missing, forged, tampered or malformed cursor now throws a `ValidationError` (400, exposable, one issue on `cursor` whose `code` is `cursor_required`, `cursor_signature`, `cursor_malformed`, `cursor_payload` or `cursor_field`) instead of a `TypeError` that surfaced as a 500. This applies to `decodeCursor`, `validateCursorPayload`, `decodeKeysetCursor` and `paginateCursor`. The unexpected-field and non-primitive-field messages no longer quote the offending key. An invalid `secret` or sort definition is a programming error and still throws `TypeError`. New `createInvalidCursorError`.
  - The connection manager's reconnect back-off wait is no longer `unref`'d, so a script whose only pending work is a reconnect stays alive until it finishes. `disconnect()` and `destroy()` now cancel an in-progress reconnect, including its wait; before, the loop kept reconnecting after `disconnect()`.

  **@zudojs/storage**

  - **Behaviour change:** `BaseRepository.create()` and `update()` treat a property whose value is `undefined` as not provided and leave it out of the SQL, even when it is an own key. Before, it was written as `NULL`, which wiped columns when a partial DTO had optional fields that were not sent. An explicit `null` still writes `NULL`. An `update` whose properties are all `undefined` returns the current row.
  - New `writableColumns`, `filterableColumns` and `sortableColumns` options govern `create`/`update`, `count` filters and `findAll` sorting separately. Each one defaults to `columns`, so existing configs behave the same.
  - **Behaviour change:** `StorageLifecycleManager.drain()` and `shutdown()` visit components one at a time in reverse registration order, as teardown needs. Before, all of them started at once in registration order. A failing component still does not stop the others.
  - **Behaviour change:** contention no longer reports 504 (gateway timeout). `STORAGE_LOCK_ACQUIRE_TIMEOUT` is now 409, like `lockTimeoutError` in `@zudojs/errors` and `@zudojs/cache`'s lock errors. `STORAGE_CONNECTION_ACQUIRE_TIMEOUT` and `STORAGE_CONNECTION_TIMEOUT` are now 503 (service unavailable, retryable), like `@zudojs/database`'s pool and connection failures. Error codes are unchanged.

  **@zudojs/transactions**

  - Adapter handle accessors: `getTransactionHandle<T>(transaction)`, `currentTransactionHandle<T>(context?)` and `manager.getCurrentHandle<T>()` return what the adapter's `begin()` produced. A savepoint resolves to its connection and a participant to the joined transaction, and a non-transactional scope yields `undefined`.
  - `Transaction.signal` is a new `AbortSignal` that aborts with a `TransactionTimeoutError` when the transaction times out. A participant exposes the joined transaction's signal, and a savepoint's signal also aborts with its parent's. `run()` now stops waiting for a timed-out callback, rolls back, and rejects with `TransactionTimeoutError`. New `raceSignal` helper.
  - `timed_out` is emitted once per timeout (from the timer). It was emitted a second time when a timed-out transaction was committed.
  - **Behaviour change:** committing a rollback-only transaction throws `TransactionRollbackOnlyError`, a new `TransactionRollbackError` subclass with the message `commit refused: transaction marked rollback-only`, instead of the misleading "rollback failed". `instanceof TransactionRollbackError` and the error code still match.
  - **Behaviour change:** `manager.rollback()` on a committed transaction throws `TransactionStateError` instead of silently doing nothing, matching `Transaction.rollback()`. Rolling back an already rolled-back or failed transaction is still a no-op. `run()` no longer tries to roll back when an error (for example from an `afterCommit` hook) arrives after a successful commit.

  **@zudojs/serialization**

  - `new JSONSerializer({ transformers: registry })` and `createSerializer("json", { transformers })` keep the built-in transformers (Date, BigInt, Map, Set, Buffer, Error) behind your registry. Before, a custom registry silently replaced them all. Your registry is consulted first, so it can still override a built-in tag. Pass the new `builtins: false` to use only your registry. New `createBuiltinTransformers()` and exported `JSONSerializerOptions`.
  - A transformer's `serialize` may return just the value, which is wrapped as `{ $type, $value }` for you. Returning the full tagged object still works, since any plain object with its own string `$type` is taken as-is. Before, a bare return was written untagged and could not be revived. `deserialize` always receives the full tagged object. The contract is documented on `TypeTransformer`.
  - With `preserveTypes`, a value no transformer handles that JSON would write as `{}` (a `Map`, `Set`, `WeakMap`, `WeakSet`, `WeakRef`, `Promise`, `RegExp`, `Error`, `ArrayBuffer` or `DataView`) throws `SerializeError` naming the type instead of silently losing its contents. With the built-ins enabled this only happens for types that have no built-in transformer.

  **@zudojs/errors**

  - New `TransactionRollbackOnlyError extends TransactionRollbackError` for a commit refused because the transaction was marked rollback-only. `TransactionRollbackError` accepts an optional `message` option.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.1.2

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.1.1

### Patch Changes

- Round 10 fixes:

  - INF-04: releasing a savepoint (`propagation: "nested"`) is no longer treated as a commit. Its `afterCommit` and `afterRollback` callbacks, and `hooks.afterCommit` for the savepoint, move to the enclosing transaction and run only when the outermost transaction commits (or, for `afterRollback`, rolls back). A savepoint that is itself rolled back still runs its `afterRollback` at once and discards its `afterCommit`.

  Behaviour changes: side effects registered inside a nested block no longer run when the outer transaction later rolls back. `hooks.afterCommit` for a savepoint fires after the root commit, and a failure there is reported through `hooks.onError` (like any after-commit callback) instead of rejecting the savepoint's commit.
  - **infra/INF-16 (phase 2):** `TransactionError` and its 11 subclasses (`TransactionStateError`, `TransactionTimeoutError`, `TransactionCommitError`, `TransactionRollbackError`, `TransactionAdapterError`, `TransactionPropagationError`, `TransactionIsolationError`, `SavepointError`, `TransactionRequiredError`, `TransactionUnexpectedError`, `TransactionCapabilityError`) are now owned by `@zudojs/errors` and re-exported here. Names, constructors and codes are unchanged, and `instanceof` now matches whichever package the class is imported from. New type export: `TransactionErrorOptions`.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

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
