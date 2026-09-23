# @zudojs/database

## 1.4.0

### Minor Changes

- [`25626fc`](https://github.com/oyinlola-tech/zudo/commit/25626fc09ac1d009cb62c89346cf3dc9862fafb5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Type transaction callbacks from your own Prisma client, and stop importing `@prisma/client` in the published types.

  `DatabaseTransactionContext` used to be `Prisma.TransactionClient` from `@prisma/client`. With Prisma 7's `prisma-client` generator the client is generated into your application, not into `node_modules/.prisma/client`. That import then failed under `skipLibCheck: false` (TS2307 "Cannot find module '.prisma/client/default'" and TS2305 "has no exported member 'Prisma'"). Under `skipLibCheck: true` it quietly made every transaction callback's `tx` `any`.

  - The transaction client is now inferred from the client you pass: `createDatabaseClient({ prisma })` returns `DatabaseClient<TransactionClientOf<typeof prisma>>`, so `client.transaction(async (tx) => tx.user.create(...))` is fully typed with no cast. `withTransaction`, `withTransactionRetry`, `TransactionManager`, `DatabaseUnitOfWork`, `Database`/`createDatabase`, `DatabaseLockManager`, `MigrationRunner` and `SeedRunner` take the type from the client they wrap.
  - `DatabaseTransactionContext` is now a structural type owned by this package (`$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`). It is the default type argument everywhere, so code that annotates it still compiles. `executeRaw`/`queryRaw` take the structural `PrismaSqlLike`, which any `Prisma.sql` value satisfies.
  - New exported types: `TransactionClientOf<TClient>` and `PrismaSqlLike`.
  - When no client type is available (`new DatabaseClient(options)`, `createDatabaseClient({ adapter })`, `getDatabase()`), callbacks get `DatabaseTransactionContext` without model delegates. Pass the client type to keep delegate typing, for example `createDatabaseClient<PrismaClient>({ adapter })`. Before this change, projects using the legacy `prisma-client-js` generator got delegate types on these paths. After it, those projects need that type argument, or need to pass `prisma`, for `tx.<model>` to compile.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/logger@1.4.3

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/logger@1.4.2

## 1.3.1

### Patch Changes

- Post-release fixes.

  - **database:** `new UserRepository(prisma.user)` with a real generated Prisma 7 client failed strict type-checking (TS2345). A generated delegate's methods are generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)`) and their argument types (`select?: UserSelect | null`) cannot be assigned from one hand-written argument shape. `RepositoryDelegate` now accepts any argument list, the same way `PrismaClientLike.$transaction` already did, and still checks return types, so a delegate whose rows do not match the entity is still rejected. A generated delegate is passed with no cast. `BaseRepository#delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so a subclass that calls `this.delegate.findMany({ where })` compiles as before.
  - **queue:** `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so `createInMemoryDeadLetterStore()` (a `DeadLetterStore<unknown>`) and `createInMemoryDeadLetterStore<T>()` for a `Queue<T>` were both rejected with TS2322. It is now `DeadLetterStore<unknown>`, which accepts either with no annotation. A store already annotated `<never>` still compiles.
  - **container:** `registerClass(TOKEN, Service)` (and `{ useClass }`, `classProvider`, `provideClass`) with no `inject` list built a class whose constructor needs arguments, passing `undefined` for each one. 1.2.0 fixed this only for auto-registration. Registering is still allowed, but resolving now throws `ProviderResolutionError` naming the class, the parameter count and the `inject: [...]` fix. Constructors with no parameters, or only defaulted ones, are unaffected.
  - **runtime:** a failed stop published `runtime.failed` (`phase: "stop"`) twice, once from the shutdown sequence and once from the runtime. An `onShutdown` that outlives `shutdownTimeout` under `SIGTERM` now leaves the runtime `failed`, sets exit code 1 and publishes `runtime.failed` once. `RuntimeEventType` lacked `"runtime.initialized"` and `"runtime.starting"`, which `RuntimeEventMap` declares and the runtime publishes. It is now derived from the map (`keyof RuntimeEventMap`), and `RuntimeModuleEventType` from the `runtime.module.*` keys, so the two cannot drift again.
  - **serialization:** the `SerializeError` for a value JSON would write as `{}` said "a Error" and "a ArrayBuffer", and told the caller to "keep the built-in transformers enabled" even when they were on. It now uses the right article ("an Error"). It suggests the built-ins only when they are disabled and one of them handles the type. Otherwise it suggests registering a transformer.

  `@zudojs/runtime`: a module failure during startup publishes `runtime.failed` once (from startup, naming the failing module) instead of twice.

- Updated dependencies [[`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/logger@1.4.1

## 1.3.0

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

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - `PrismaClientLike` now accepts a real Prisma 7 client generated into the application (`prisma-client` generator). Its overloaded `$transaction` could not be assigned to the single generic signature the interface declared, so `createDatabaseClient({ prisma: new PrismaClient(...) })` needed an `as unknown as PrismaClientLike` cast; the cast is no longer needed.

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/logger@1.4.0
  - @zudojs/types@1.2.0

## 1.2.1

### Patch Changes

- Cache and database correctness fixes.

  - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
  - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
  - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
  - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

- Updated dependencies [`c904687`, `c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/logger@1.3.0
  - @zudojs/types@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes:

  - INF-13: `withTransactionRetry` clamps its exponential backoff to a new `maxRetryDelayMs` option (default 30000 ms, never above the 2^31-1 ms timer limit) and accepts `jitter: "full"`. Large retry budgets used to overflow `setTimeout` into 1 ms retries.

  Behaviour changes: a single retry delay never exceeds 30 s unless `maxRetryDelayMs` is raised.
  - **infra/INF-18 (phase 2, behaviour change):** the fallback logger used when `DatabaseClient` gets no `logger` option now writes through `@zudojs/logger` (logger name `@zudojs/database`, console transport) instead of calling `console.*` directly. Entries are structured and secret-named metadata fields (`password`, `token`, ...) are redacted. `debug`/`info` are still dropped when `NODE_ENV` is `"production"`; an `Error` passed to `error()` becomes the entry's `error`, any other value is kept as `metadata.error`.
  - **infra/LEAF-08 (phase 2):** `toPrismaWhere` uses `isPlainObject` from `@zudojs/types` instead of a local copy. The guard only inspects the operator objects the builder creates itself, so filter values (Prisma `Decimal`, `Date`, other class instances) are untouched; a non-plain existing value is now AND-ed instead of being spread.

### Patch Changes

- Updated dependencies [`d2b01bf`, `5d6b957`, `d2b01bf`]:
  - @zudojs/errors@1.1.0
  - @zudojs/logger@1.2.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 fixes:

  - `DatabaseClient.transaction()` now raises an `AbortSignal` abort **inside** the Prisma interactive transaction, so an aborted transaction is rolled back. Previously the caller was rejected with `DatabaseAbortError` while the callback kept running and the transaction still committed.
  - `BaseRepository.update()` on a soft-delete repository now sends `{ id, deletedAt: null }` instead of `{ AND: [{ id }, { deletedAt: null }] }`. Prisma's `WhereUniqueInput` requires the unique field at the top level, so every scoped `update()` was rejected with a validation error. Subclasses can reuse the new protected `whereUniqueId(id)` helper.
  - Lock helpers (`lockRow`, `acquireAdvisoryLock`, `withRowLock`, `withAdvisoryLock`, `resolveLockTransactionOptions`) reject `timeoutMs` values below 1 ms with a `TypeError`. PostgreSQL treats `lock_timeout = 0` as "disabled", so `timeoutMs: 0` waited forever instead of failing fast; use `noWait` for that.
  - `findPaginated()` and `paginateCursor()` validate `sort` field names and directions the same way the query builder does, before any query is dispatched. Unsafe field names (for example `"name; DROP TABLE"`, `"__proto__"`) and directions other than `"asc"` / `"desc"` are now rejected instead of being forwarded to the delegate.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

## Unreleased

### Hardening (audit round 5)

- **Runners work against a real database.** `MigrationRunner` and `SeedRunner` no longer pass the tracking-table identifier as a bind parameter; all raw SQL goes through `$queryRawUnsafe` / `$executeRawUnsafe` with positional parameters. The `Prisma` namespace is never read at runtime, so the package works with a generated client that lives outside `@prisma/client`.
- **Prisma 7 construction.** `DatabaseClientOptions` accepts either a pre-built `prisma` client or a driver `adapter`; a clear `DatabaseError` is thrown when neither is supplied. The dead `url` / pool / `ssl` / `queryTimeoutMs` options were removed from the client options. `@prisma/client` is now a peer dependency.
- **Migrations and seeds.** Version column is `BIGINT` (timestamp-style versions supported, validated against `Number.MAX_SAFE_INTEGER`); applied history is re-read under the advisory lock; each item runs in its own transaction by default (`perItemTransaction: false` restores the single all-or-nothing batch); `transaction` options (`timeoutMs`, `maxWaitMs`, `isolationLevel`) are forwarded; seed rollbacks follow a persisted execution `sequence`; `getLatestVersion` returns the maximum version; identifier / lock-key / FNV-1a helpers are shared and the offset basis is correct. `dialect` option fails loudly for anything but `postgresql`.
- **Errors.** Prisma error codes are mapped to `DatabaseError.databaseCode`, `operation`, HTTP status and `ErrorCode` (P2002/P2003 → 409, P2025 → 404, P2034 → retryable, P1xxx → connection with a fixed, non-leaking message). New helpers: `normalizeDatabaseError`, `isRetryableTransactionError`, `isConflictError`, `isNotFoundError`, `getDatabaseErrorCode`, `getDatabaseErrorKind`.
- **Locks.** `lockRow` returns a `DatabaseLockResult` and `withRowLock` throws when the row is missing or skipped; `timeoutMs` is honoured via `SET LOCAL lock_timeout`; transaction options are forwarded; an optional `namespace` selects the two-int advisory form.
- **Client lifecycle.** Concurrent `connect()` calls share one in-flight promise, `disconnect()` waits for an in-flight connect, `signal` / `timeoutMs` are honoured on raw operations and transactions, `healthCheck()` reports the real lifecycle status.
- **Transactions.** `TransactionManager.run()` returns the committed context; failures carry `transactionId` / `transactionStatus` metadata (`getTransactionContextFromError`); `withTransactionRetry` retries serialization failures by default.
- **Connection manager.** Scheduled health checks have a timeout, skip overlapping ticks and reconnect with exponential backoff; an existing `DatabaseClient` can be wrapped.
- **Cache.** Deterministic nested key serialisation with escaped separators, `maxEntries` LRU eviction, optional background pruning, and coalesced loaders in `getOrSet`; `invalidateByPrefix` is separator-aware and accepts any `DatabaseCache` with `keys()`.
- **Packaging.** Subpath exports point at real directories (`./errors` removed); source maps and build info are excluded from the tarball; `build` cleans first and a post-build check verifies every declaration file; tests are typechecked and `pnpm test` runs them.
- **Errors across package copies.** `DatabaseError` detection is structural (`isDatabaseErrorLike`), so an error raised by a second copy of `@zudojs/errors` is passed through instead of being double-wrapped. `toDatabaseErrorInfo` produces the exported `DatabaseErrorInfo` shape.
- **Types.** `DatabaseConnectionOptions` only declares `connectionTimeoutMs` and `logging` (the URL, pool and SSL settings belong to the Prisma driver adapter); the unused `DatabaseMetrics` type was removed; the client's lifecycle health snapshot is `DatabaseClientHealth` (`DatabaseHealthInfo` remains as an alias).
- **Query translation.** `toPrismaArgs` folds `include` into `select` when both are present, since Prisma rejects the pair.
- **Locks.** `timeoutMs` above Prisma's 5 s transaction default automatically raises the transaction timeout (`resolveLockTransactionOptions`); an explicitly shorter `transaction.timeoutMs` is rejected.
- **Docs.** README and the site page describe the shipped API; the README examples are typechecked (`tests/readme.typecheck.ts`).

## 0.1.0

- Initial publication of all Zudojs packages under the `@zudojs` scope with exact sibling version pins.

## 0.0.1

- Initial release.
