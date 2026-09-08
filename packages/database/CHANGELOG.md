# @zudojs/database

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
