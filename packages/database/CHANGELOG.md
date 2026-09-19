# @zudojs/database

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
