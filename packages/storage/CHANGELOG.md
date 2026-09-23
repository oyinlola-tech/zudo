# @zudojs/storage

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/serialization@1.2.2

## 1.2.1

### Patch Changes

- Updated dependencies [`e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/serialization@1.2.1

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
  - @zudojs/serialization@1.2.0
  - @zudojs/constants@1.1.2
  - @zudojs/types@1.2.0

## 1.1.2

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1
  - @zudojs/serialization@1.1.1
  - @zudojs/constants@1.1.1

## 1.1.1

### Patch Changes

- Round 10 fixes:

  - INF-02: `LocalObjectStorage` keys are opaque. A key with a `.`, `..` or empty path segment (`tenantA/../tenantB/x`, `./x`, `a//b`, including `\`-separated forms) is refused with `STORAGE_PATH_TRAVERSAL` / `STORAGE_INVALID_KEY` instead of being normalised, so `${tenant}/${userKey}` can no longer cross into another tenant's prefix.
  - INF-03: the reserved `.zudo-object-meta` directory is checked after resolution as well as on the raw key, so metadata sidecars can no longer be forged (for example, flipping another object's `contentType` to `text/html`).
  - INF-14: `get`, `exists` and `metadata` return `null`/`false` only for ENOENT, ENOTDIR and EISDIR. Any other I/O error (EACCES, EIO, ELOOP, EMFILE) throws `StorageError` with code `ERR_STORAGE_READ`, with the original error as its cause.

  Behaviour changes: keys containing dot or empty segments now throw. Non-"missing" I/O errors now throw from `get`/`exists`/`metadata` instead of reading as absent.

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/serialization@1.1.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- - `LocalObjectStorage` now works when its base directory is reached through a symlink (macOS `tmpdir()`, mounted volumes). Containment compares the real path of the base with the real path of the target; previously every key was rejected as a path traversal.
  - `ConnectionPool.release()` no longer strands a parked waiter when the released connection is retired for exceeding `maxLifetime`: a fresh connection is created and handed to the waiter, or the waiter is rejected with the factory's error instead of timing out.
  - `BaseRepository.update()` throws `NotFoundError` (`STORAGE_ENTITY_NOT_FOUND`) when no row matched, instead of resolving `undefined` typed as the entity.
  - `LocalObjectStorage.exists()` returns `false` and `metadata()` returns `null` for the directory created by a nested key (`put("a/b.txt")` no longer makes `exists("a")` true).
  - An oversized streamed `put()` now cancels the source stream when the byte budget is exceeded, instead of only releasing the reader.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/serialization@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close SQL injection and path traversal, and make the connection pool actually bound itself.

  These are behavioural changes. Code that compiles unchanged may now throw where
  it previously built a query or touched a file.

  **`BaseRepository` no longer interpolates untrusted identifiers.** `create`,
  `update` and `count` concatenated the _keys_ of the object they were given
  straight into SQL, and `findAll` interpolated `orderBy`, `limit` and `offset`
  raw. Values were parameterised, which made the code look safe, but the
  identifier positions were not — and the idiomatic call for all four is
  `repo.create(req.body)` or `repo.findAll({ orderBy: req.query.sort })`. Every
  identifier now passes a strict `^[A-Za-z_][A-Za-z0-9_]*$` check and `limit` /
  `offset` must be safe non-negative integers, bound as parameters rather than
  interpolated. Pass `columns` to the constructor to narrow it further to an
  explicit allowlist. Repositories whose column names contain anything outside
  that character class must now quote them explicitly.

  **`LocalObjectStorage` containment is separator-aware.** The traversal guard
  compared `resolved.startsWith(basePath)`, which admits any sibling directory
  whose name merely begins with the base name: with a base of `/data/store`, the
  key `../store-secrets/creds.txt` resolved inside `/data/store-secrets` and
  passed. Containment is now a path comparison, the base is resolved to an
  absolute path at construction, and the real path is checked so a symlink
  planted inside the store cannot redirect a read or write out of it.

  **Object writes are bounded and atomic.** `put` buffered an entire stream into
  memory with no limit; it now enforces `maxObjectBytes` (64 MiB by default,
  configurable) and commits through a temp-file rename, so a crash or a
  concurrent write can no longer leave a truncated object under a live key. An
  oversized payload throws with a 413.

  **`list` paginates.** `continuationToken` was accepted and ignored, so callers
  looping on `isTruncated` received the first page forever. Listing is now
  key-ordered and cursor-based, and `maxKeys` bounds returned objects rather than
  raw directory entries.

  **The connection pool respects `max`.** The limit was checked before the
  factory was awaited and the slot was only claimed afterwards, so concurrent
  `acquire()` calls all saw the same under-limit count — 20 concurrent acquires
  against `max: 3` opened 20 connections. Slots are now reserved across the
  await, and callers beyond the limit queue in FIFO order and are handed a
  connection directly by `release()` instead of failing to be bounded at all.
  `acquire()` past `acquireTimeout` now rejects with a `StorageError`.

  **`release()` validates ownership.** Releasing a connection twice, or releasing
  one this pool never issued, pushed it into the idle list again and handed the
  same connection to two concurrent callers. Such a release is now ignored.

  **Other corrections.** `initialize()` is idempotent; `healthCheck()` no longer
  grows the pool; `delete()` on a missing key is a no-op instead of throwing
  `ENOENT`; `StorageLifecycleManager` restores its phase when initialization
  fails and reports an `AggregateError` rather than abandoning a drain on the
  first rejection; an empty `HealthChecker` reports unhealthy instead of green.

  **`Lock` gained `fence` and `isHeld()`, and `LockOptions` fields are optional.**
  A lock can expire while its holder is still working; the fence is a
  monotonically increasing token to pass to the protected resource so a
  superseded holder's write can be rejected. `extend()` now throws once the lock
  is lost rather than silently doing nothing, and waiters are woken on release
  instead of polling to their deadline.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/serialization@0.2.0
  - @zudojs/types@0.2.0

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
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/serialization@1.0.0
  - @zudojs/types@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/serialization@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/serialization@0.1.1
