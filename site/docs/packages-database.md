---
title: "@zudojs/database — Database Infrastructure Documentation"
description: "Complete documentation for @zudojs/database — database clients, repositories, transactions, migrations, seeding, caching, and connection management."
source: https://zudojs.oyinlola.site/docs/packages-database
---

v1.1.0

# @zudojs/database

PostgreSQL data-access layer for Zudo applications, built on Prisma 7 — a lifecycle-aware client, generic repositories with soft delete, a query builder that translates to Prisma `where` clauses, managed transactions, keyset pagination with signed cursors, migration and seed runners guarded by advisory locks, health checks with reconnect, and a bounded in-memory cache.

PRISMA 7 POSTGRESQL REPOSITORY PATTERN TRANSACTIONS MIGRATIONS

## OVERVIEW

Most applications need to store data in a database and read it back. Prisma already generates a typed client for that. What it does not give you is a shared way to open and close the connection, run the same "find by id, create, update, soft delete" code for every table, keep pagination consistent, or turn database failures into errors your HTTP layer understands.

`@zudojs/database` adds that layer on top of Prisma 7 for PostgreSQL. It wraps your Prisma client in a *DatabaseClient* that manages the connection, gives you a *BaseRepository* class you extend once per table, and ships helpers for transactions, query building, pagination, migrations, seeds, locks, caching and health checks.

Prisma stays visible. Repositories wrap a Prisma model (for example `prisma.user`), and transaction callbacks receive Prisma's own transaction client. The package normalises lifecycle, errors and pagination; it does not hide Prisma from you.

When you need it

- You use Prisma 7 with PostgreSQL and want one place that connects, checks health and disconnects.
- Several tables need the same CRUD, soft-delete and pagination behaviour.
- You want database errors mapped to 404 / 409 / 503 without hand-written `switch` statements.
- You need migrations, seeds or locks that are safe when two app instances start at once.

When you don't

- You use MySQL, SQLite or MongoDB. The client works with any Prisma client, but the migration, seed and lock helpers emit PostgreSQL SQL only.
- You are happy calling `prisma.user.findMany()` directly and have one or two tables.
- You need nested transactions or savepoints. Prisma interactive transactions are used as-is.

## INSTALLATION

Install the package together with Prisma and the PostgreSQL driver adapter. Prisma 7 talks to the database through an *adapter*, a small package that owns the connection string, pool size and SSL settings.

```bash
$ npm install @zudojs/database @prisma/client @prisma/adapter-pg
$ npx prisma generate
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Peer dependency.** `@prisma/client` `>=7.0.0 <8` is a peer dependency, so you install it yourself. `@zudojs/errors` is a regular dependency and comes along automatically.

> **PostgreSQL only.** `MigrationRunner`, `SeedRunner` and `DatabaseLockManager` emit PostgreSQL SQL. Passing `dialect: "mysql"` or `"sqlite"` throws `UnsupportedDialectError`; those dialects are typed but not implemented.

Everything is exported from the package root. Three smaller entry points exist if you prefer narrower imports.

| Import path | Contents |
| --- | --- |
| `@zudojs/database` | Everything on this page |
| `@zudojs/database/client` | `DatabaseClient`, `createDatabaseClient`, error helpers |
| `@zudojs/database/repositories` | `BaseRepository`, `mapRepositoryError` |
| `@zudojs/database/transactions` | `TransactionManager`, `withTransaction`, `withTransactionRetry` |

## QUICK START

This example assumes your Prisma schema has a `User` model with `id`, `email`, `name` and a nullable `deletedAt` column. It builds the Prisma client, wraps it, defines one repository and creates a row.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient } from "@zudojs/database";

interface User {
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}

// One repository per model. The delegate is the Prisma model (prisma.user).
class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const users = new UserRepository(prisma.user);
const alice = await users.create({ email: "alice@example.com", name: "Alice" });
console.log(alice.name, await users.count());
// Alice 1

await client.disconnect();
```

Run it with `DATABASE_URL` set. The console prints `Alice 1`: the created row's name and the number of live rows in the table. The client also logs `Database connected.` and `Database disconnected.` through its default logger.

> **Tip:** the long `ConstructorParameters<...>[0]` type just means "whatever the base class accepts as its first argument". It keeps your repository independent from Prisma's generated types.

## DATABASE CLIENT

A *DatabaseClient* is a thin wrapper around a Prisma client. It tracks whether you are connected, de-duplicates concurrent `connect()` calls, adds timeouts and cancellation to raw queries, and converts every failure into a `DatabaseError`.

You create it with `createDatabaseClient` and either a pre-built `prisma` instance or an `adapter`. With only an adapter the client constructs the `PrismaClient` for you. Passing neither throws immediately.

| Option | What it does | Default |
| --- | --- | --- |
| `prisma` | A Prisma client to wrap. Takes precedence over `adapter`. | — |
| `adapter` | A Prisma driver adapter (for example `new PrismaPg(...)`) used to build a client when `prisma` is absent. | — |
| `connectionTimeoutMs` | How long `connect()` waits before failing with `ERR_DATABASE_TIMEOUT`. | `10000` |
| `logging` | Log each query's duration through the logger. | `false` |
| `logger` | Any object with `debug / info / warn / error`. Use `noopDatabaseLogger` to silence output. | console |

This example connects, runs a raw parameterised query with a 2-second deadline, and prints a health check.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDatabaseClient } from "@zudojs/database";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma, connectionTimeoutMs: 5_000 });
await client.connect();

const rows = await client.queryRawUnsafe<{ count: bigint }[]>(
  'SELECT COUNT(*) AS "count" FROM "User" WHERE "email" LIKE $1',
  ["%@example.com"],
  { timeoutMs: 2_000 },
);
console.log(rows[0]?.count);
// 1n

console.log(await client.healthCheck());
// { status: "connected", latencyMs: 3, checkedAt: 2026-09-09T10:00:00.000Z }

await client.disconnect();
```

Every raw method accepts the same options object: `signal` (an `AbortSignal` that rejects with `DatabaseAbortError`), `timeoutMs` and `metadata` (merged into any error raised). `queryRawUnsafe` / `executeRawUnsafe` take a SQL string plus a values array; `queryRaw` / `executeRaw` take a `Prisma.sql` tagged template.

> **Watch out:** `timeoutMs` is client-side. The client stops waiting, but PostgreSQL keeps running the statement. Set `statement_timeout` on the database for real cancellation.

If you want one client shared across your whole app, use the facade functions instead of passing the client around: `connectDatabase(options)` creates and connects a shared `Database` once, `getDatabase()` returns it anywhere else, and `resetDatabase()` disconnects and clears it. Calling `getDatabase()` with options after it exists throws a `TypeError`, so you never silently reconfigure it.

## REPOSITORIES

A *repository* is a class that owns all database access for one table. Instead of scattering `prisma.user.findFirst(...)` across your code, you write `users.findById(id)`. `BaseRepository` gives you the common methods; you add the ones specific to your model.

The constructor takes a *delegate* (a Prisma model such as `prisma.user`, or any object with the same `findUnique / findMany / create / update / delete / count` methods) and an options object.

| Option | What it does | Default |
| --- | --- | --- |
| `modelName` | Used in error messages and to find the model on a transaction client. | `"DatabaseEntity"` |
| `idField` | Primary-key column used by `findById`, `update`, `delete`. | `"id"` |
| `softDelete` | `true` or `{ field }`. Reads then skip rows whose field is set. | off; field `"deletedAt"` |
| `cursorSecret` | Secret used to sign cursors from `paginateCursor`. | unsigned |
| `delegateKey` | Property to read from a transaction client in `withTransaction`. | `modelName` lower-cased |

*Soft delete* means marking a row as deleted by writing a timestamp instead of removing it. With `softDelete: true`, `softDelete(id)` sets `deletedAt`, normal reads skip that row, `restore(id)` clears it, and `withDeleted()` returns a copy of the repository that can still see it.

This example continues from the Quick Start and shows the soft-delete cycle.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient } from "@zudojs/database";

interface User { id: string; email: string; name: string; deletedAt: Date | null }

class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }

  findByEmail(email: string) {
    return this.findOne({ email });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const users = new UserRepository(prisma.user);
const alice = await users.create({ email: "alice@example.com", name: "Alice" });

await users.softDelete(alice.id);
console.log(await users.findByEmail("alice@example.com"));
// null  (normal reads skip soft-deleted rows)

console.log((await users.withDeleted().findById(alice.id))?.name);
// Alice

await users.restore(alice.id);
console.log(await users.exists({ email: "alice@example.com" }));
// true

await client.disconnect();
```

| Method | Returns | Notes |
| --- | --- | --- |
| `findById(id)`, `findOne(filter)` | `Entity \| null` | `filter` is a Prisma `where` object. |
| `findMany(filter?)` | `Entity[]` | No pagination; use with care on big tables. |
| `findPaginated(filter?, { pagination, sort })` | `PaginatedResult` | Page / limit style. `paginate` is an alias. `sort` field names and directions are validated (`asc`/`desc`, identifier-only names) before any query runs. |
| `paginateCursor(filter?, { cursor, limit, sort })` | `CursorPaginatedResult` | Keyset style; see Pagination. |
| `findByQuery(builder)` | `Entity[]` | Runs a `QueryBuilder`; see Query Builder. |
| `create(input)`, `createMany(inputs)` | `Entity`, `number` |  |
| `update(id, input)`, `upsert(where, create, update)` | `Entity` | Missing row throws a 404 `DatabaseError`. |
| `delete(id)`, `deleteMany(filter)` | `void`, `number` | Hard delete, ignores soft-delete scope. |
| `softDelete(id)`, `restore(id)`, `findDeleted(filter?)`, `withDeleted()` | varies | Throw unless `softDelete` is on. |
| `exists(filter)`, `count(filter?)` | `boolean`, `number` | `exists` uses `count`, never loads a row. |
| `withTransaction(tx)` | copy of the repository | Runs later calls inside the transaction. |

Every method takes an optional last argument `{ signal, timeoutMs, metadata }`, the same options the client accepts.

> **Common mistake:** calling `softDelete()` on a repository built without `softDelete: true`. It throws `DatabaseError: User softDelete requires the softDelete option.` Turn the option on, or use `delete()` for a hard delete.

## TRANSACTIONS

A *transaction* groups several writes so they either all succeed or all roll back. If the second write fails, the first is undone too. Use one whenever two rows must change together, such as moving money between accounts.

`withTransaction(client, callback)` opens a Prisma interactive transaction and passes you `tx`, a transaction-bound Prisma client. Repositories created from the root `prisma` object do *not* know about `tx`. Call `repo.withTransaction(tx)` to get a copy that does.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient, withTransaction } from "@zudojs/database";

interface User { id: string; email: string; name: string; deletedAt: Date | null }

class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const users = new UserRepository(prisma.user);
const alice = await users.create({ email: "alice@example.com", name: "Alice" });

const renamed = await withTransaction(client, async (tx, context) => {
  const txUsers = users.withTransaction(tx);   // reads tx.user
  await txUsers.update(alice.id, { name: "Alice Doe" });
  return { name: (await txUsers.findById(alice.id))?.name, id: context.transactionId };
}, { isolationLevel: "Serializable", timeoutMs: 10_000 });

console.log(renamed);
// { name: "Alice Doe", id: "6b1f0c2e-9a41-4f5b-b0c3-7e2d1a3f8b90" }  (a UUID per transaction)

await client.disconnect();
```

If the callback throws, Prisma rolls the transaction back and `withTransaction` rethrows a `DatabaseError` that carries `transactionId` and `transactionStatus: "failed"`. `getTransactionContextFromError(error)` recovers that context.

| Option | What it does |
| --- | --- |
| `isolationLevel` | `"ReadUncommitted"`, `"ReadCommitted"`, `"RepeatableRead"` or `"Serializable"`. |
| `timeoutMs`, `maxWaitMs` | Forwarded to Prisma: how long the transaction may run, and how long to wait for a connection. |
| `transactionId`, `metadata` | Attached to the context and to any error thrown. |
| `signal` | Abort the transaction from outside. The abort is raised inside the Prisma callback, so the transaction is rolled back and the caller rejects with `DatabaseAbortError`. |

PostgreSQL sometimes aborts a `Serializable` transaction because another one touched the same rows. `withTransactionRetry` has the same signature and re-runs the callback (default 3 retries, doubling delay from 100 ms) when `isRetryableTransactionError` says the failure is temporary.

> **Danger:** retries re-run the *whole* callback. Anything you do inside it that is not a database write, such as sending an email, can happen more than once.

`createUnitOfWork(client)` is a small wrapper with the same idea: `uow.execute(callback, options)` runs one transaction and tags failures with `unitOfWork: true`.

## QUERY BUILDER

A *query builder* lets you describe a query step by step, in plain method calls, instead of hand-writing a nested Prisma `where` object. It does not run anything. `build()` returns a frozen description, `toPrismaArgs()` turns it into Prisma `findMany` arguments, and `repo.findByQuery(builder)` executes it.

The type parameter lists the field names you are allowed to use, so a typo is a compile error.

```ts
import { createQueryBuilder, equals } from "@zudojs/database";

const query = createQueryBuilder<"email" | "role" | "createdAt">()
  .where("role", "admin")
  .whereContains("email", "@example.com")
  .or(equals("role", "owner"), equals("role", "admin"))
  .orderByDesc("createdAt")
  .select("email", "role")
  .paginate({ page: 2, limit: 20 });

console.log(query.toPrismaArgs());
// {
//   where: { AND: [ { role: { equals: "admin" }, email: { contains: "@example.com" } },
//                   { OR: [ { role: { equals: "owner" } }, { role: { equals: "admin" } } ] } ] },
//   orderBy: [ { createdAt: "desc" } ],
//   skip: 20, take: 20,
//   select: { email: true, role: true }
// }
```

Pass the builder to a repository to run it: `const admins = await users.findByQuery(query)`. The repository adds its own soft-delete scope on top.

| Builder methods | Purpose |
| --- | --- |
| `where`, `whereNot`, `whereIn`, `whereNotIn`, `whereLessThan`, `whereGreaterThan`, `whereContains`, `whereStartsWith`, `whereEndsWith`, `whereNull`, `whereNotNull`, `whereOperator` | Add one condition on a field. All conditions are combined with AND. |
| `and(...)`, `or(...)`, `not(filter)` | Group standalone filters made with the helper functions below. |
| `orderBy`, `orderByAsc`, `orderByDesc`, `sort([...])` | Sort order. |
| `select(...fields)`, `include(...relations)` | Columns to return; relations to load. |
| `page`, `limit`, `paginate({ page, limit })`, `offset` | Pagination. |
| `build()`, `toPrismaArgs()`, `clone()`, `reset()` | Finish, translate, copy or clear. |

The standalone helper functions build filter objects you can store, combine and reuse. `toPrismaWhere(filter)` translates one into a Prisma `where`.

| Group | Helpers |
| --- | --- |
| Comparison | `equals`, `notEquals`, `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`, `between`, `inList`, `notInList`, `isNull`, `isNotNull`, `isEmpty`, `isNotEmpty` |
| Text | `contains`, `startsWith`, `endsWith`, `matchesPattern` |
| Dates | `isBefore`, `isAfter`, `isBetween`, `dateRange`, `dateOnly` |
| Combining | `and`, `or`, `not`, `allOf`, `anyOf`, `fromObject`, `optionalEquals`, `optionalContains` |
| Relations | `relational(relation, filter, "some" \| "every" \| "none" \| "is" \| "isNot")` |

> **Common mistake:** expecting `build()` to run the query. It only returns a description. Call `users.findByQuery(query)`, or pass `query.toPrismaArgs()` to Prisma yourself.

## PAGINATION

*Pagination* means returning a list in chunks instead of all at once. There are two styles. *Offset* pagination uses page numbers ("page 3 of 12") and is easy to display. *Cursor* (keyset) pagination hands the client an opaque token pointing at the last row seen and stays fast and stable even when rows are inserted while someone is browsing.

Both are methods on the repository. This fragment assumes the `users` repository from the Repositories section.

```ts
// Offset: page 2, 25 rows, newest first
const page = await users.findPaginated(undefined, {
  pagination: { page: 2, limit: 25 },
  sort: [{ field: "createdAt", direction: "desc" }],
});
console.log(page.meta);
// { page: 2, limit: 25, total: 60, totalPages: 3, hasNextPage: true, hasPreviousPage: true, hasNext: true, hasPrev: true }

// Cursor: first page, then the next one using the returned cursor
const sort = [{ field: "createdAt", direction: "desc" as const }];
const first = await users.paginateCursor(undefined, { limit: 25, sort });
const second = await users.paginateCursor(undefined, { cursor: first.meta.nextCursor, limit: 25, sort });
console.log(first.data.length, first.meta.hasNextPage, second.data.length);
// 25 true 25
```

Page and limit are normalised for you: `NaN`, negative or missing values fall back to page 1 and limit 20, and the limit is capped at 100 (`MAX_LIMIT`). The repository always adds the id column as a tiebreaker to cursor sorts so the order is stable.

> **Watch out:** a cursor is a base64 string the browser sends back. Without a `cursorSecret` on the repository anyone can forge one. Set the secret on any repository whose cursors leave your server; they are then HMAC-signed and rejected if edited.

## MIGRATIONS AND SEEDS

A *migration* is a numbered script that changes the database structure, such as adding a table. The runner remembers which versions have run in a `_migrations` table and applies only the new ones. A *seed* is a named script that inserts starting data, tracked the same way in `_seeds`.

Both runners take a PostgreSQL *advisory lock* (a database-wide named lock) before working, so two app instances booting at the same time never run the same script twice. Each script runs in its own transaction by default.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDatabaseClient, createMigrationRunner, createSeedRunner } from "@zudojs/database";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const migrations = createMigrationRunner(client, [
  {
    version: 1,
    name: "create-roles",
    up: async (tx) => {
      await tx.$executeRawUnsafe('CREATE TABLE "roles" ("name" TEXT PRIMARY KEY)');
    },
    down: async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE "roles"');
    },
  },
], { transaction: { timeoutMs: 60_000 } });

const result = await migrations.migrate();
console.log(result.applied.map((m) => m.name), (await migrations.status()).currentVersion);
// [ "create-roles" ] 1

const seeds = createSeedRunner(client, [
  {
    name: "default-roles",
    order: 0,
    run: async (tx) => {
      await tx.$executeRawUnsafe('INSERT INTO "roles" ("name") VALUES ($1)', "admin");
    },
  },
]);
console.log((await seeds.run()).applied.length);
// 1

await client.disconnect();
```

Run the script a second time and both print `0` applied: the runners see the recorded versions and skip them. `migrations.rollback()` reverts the newest migration using its `down`; `rollback(3)` reverts three; `rollbackAll()` reverts everything.

| Runner option | What it does | Default |
| --- | --- | --- |
| `tableName` | Tracking table. | `"_migrations"` / `"_seeds"` |
| `lockKey` | Advisory lock name. | `"database:migrations"` / `"database:seeds"` |
| `transaction` | `{ timeoutMs, maxWaitMs, isolationLevel }` for every transaction the runner opens. | Prisma defaults (5 s) |
| `perItemTransaction` | `true`: one transaction per script. `false`: the whole batch is all-or-nothing. | `true` |
| `dialect` | Only `"postgresql"` works; others throw `UnsupportedDialectError`. | `"postgresql"` |

> **Common mistake:** a big migration hits Prisma's 5-second transaction timeout. Pass `transaction: { timeoutMs: 60_000 }` (or more) to the runner.

## HEALTH CHECKS AND LOCKS

A *health check* is a quick "is the database reachable?" probe, usually exposed on a `/health` route so a load balancer can stop sending traffic to a broken instance. It runs `SELECT 1` with a timeout (default 5 s) and reports `degraded` when latency is above 75% of that timeout.

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  assertDatabaseHealth,
  checkDatabaseHealth,
  createDatabaseClient,
  createLockManager,
} from "@zudojs/database";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

console.log(await checkDatabaseHealth(client, { timeoutMs: 2_000 }));
// { status: "healthy", healthy: true, latencyMs: 4,
//   checkedAt: 2026-09-09T10:00:00.000Z, message: "Database connection is healthy." }

await assertDatabaseHealth(client);   // throws DatabaseUnhealthyError (503) when it is not

// Advisory lock: only one process at a time runs this block
const locks = createLockManager(client);
await locks.withAdvisoryLock("reports:nightly", async (tx) => {
  await tx.$executeRawUnsafe("REFRESH MATERIALIZED VIEW nightly_report");
}, { timeoutMs: 10_000 });

await client.disconnect();
```

Other health helpers: `isDatabaseHealthy(client)` returns a boolean and `checkDatabaseReadiness(client)` returns `{ ready, latencyMs, checkedAt }` for a readiness route. For scheduled checks with automatic reconnect, wrap the client in `createConnectionManager({ client, healthCheckIntervalMs: 15_000 })` and call `manager.connect()`; it emits `error` and `reconnecting` events through `manager.on(listener)`.

A *lock* stops two processes from doing the same work at once. `withAdvisoryLock(key, callback)` holds a named PostgreSQL lock for the length of a transaction. `withRowLock(table, id, callback)` locks one row with `SELECT ... FOR UPDATE` instead. `timeoutMs` becomes `SET LOCAL lock_timeout` and must be at least 1 ms — PostgreSQL treats `lock_timeout = 0` as *disabled*, so `0` throws a `TypeError`; use `noWait` to fail immediately. `skipLocked` / `noWait` control what happens when someone else holds the lock.

## ERRORS

Every failure from this package is a `DatabaseError` from `@zudojs/errors`. Prisma's cryptic codes such as `P2002` are mapped to an HTTP status and an error code, and messages for connection failures are fixed strings so a host name never leaks into a response.

| Prisma code | Meaning | Status | Detect with |
| --- | --- | --- | --- |
| `P2002`, `P2003`, `P2004`, `P2014` | Unique or foreign-key violation | 409 | `isConflictError` |
| `P2025`, `P2015`, `P2018` | Row not found | 404 | `isNotFoundError` |
| `P2034`, `P2028`, `P1017`, SQL `40001` / `40P01` | Temporary; safe to retry | 409 / 503 | `isRetryableTransactionError` |
| `P2024`, `P1002`, `P1008` | Timeout | 503 | `getDatabaseErrorKind(e) === "timeout"` |
| `P1000`, `P1001`, `P1003`, `P1010`, `P1011` | Cannot connect | 503 | `getDatabaseErrorKind(e) === "connection"` |

This fragment shows the usual pattern in a request handler, using the `users` repository from the Repositories section.

```ts
import { isConflictError, isNotFoundError, toDatabaseErrorInfo } from "@zudojs/database";

try {
  await users.create({ email: "alice@example.com", name: "Alice" });
} catch (error) {
  if (isConflictError(error)) {
    console.log("That email is already taken");          // respond 409
  } else if (isNotFoundError(error)) {
    console.log("No such row");                          // respond 404
  } else {
    console.error(toDatabaseErrorInfo(error));
    // { code: "P2002", message: "User already exists.", operation: "insert",
    //   model: "User", constraint: "email" }   (plus cause and metadata)
    throw error;
  }
}
```

## API REFERENCE

Everything below is exported from `@zudojs/database`. Internal helpers (cursor encoding, key hashing, error normalisation) are also exported but omitted here.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createDatabaseClient(options)` | Builds a `DatabaseClient`. | Needs `prisma` or `adapter`. |
| `createDatabase`, `getDatabase`, `connectDatabase`, `disconnectDatabase`, `resetDatabase` | Manage one shared `Database` facade. | `getDatabase` throws if given options after creation. |
| `createConnectionManager(options)` | Scheduled health checks and reconnect around a client. | Pass `client` to wrap an existing one. |
| `withTransaction(client, cb, options?)` | Runs `cb(tx, context)` in one transaction. |  |
| `withTransactionRetry(client, cb, options?)` | Same, retrying temporary failures. | `retries`, `retryDelayMs`, `shouldRetry`. |
| `createTransactionManager(client)`, `createUnitOfWork(client)`, `executeUnitOfWork(client, cb)` | Object-style transaction helpers. | `manager.run()` also returns the context. |
| `getTransactionContextFromError(error)` | Reads the failed transaction's context from an error. |  |
| `createQueryBuilder<Fields>()` | New empty builder. |  |
| `toPrismaWhere(filter)`, `toPrismaArgs(state)`, `toPrismaOrderBy`, `toPrismaSelect`, `toPrismaSkipTake` | Translate filters and builder state into Prisma arguments. |  |
| Filter helpers (`equals`, `and`, `or`, ...) | Build `QueryFilter` values. | Full list in Query Builder. |
| `normalizePagination`, `createPaginationMeta`, `createPaginatedResult`, `paginateCollection` | Offset pagination helpers for data you already have in memory. |  |
| `encodeCursor`, `decodeCursor`, `createKeysetPage`, `buildKeysetWhere` | Cursor pagination building blocks used by `paginateCursor`. | Pass `allowedFields` to `decodeCursor` for untrusted input. |
| `createMigrationRunner(client, migrations, options?)` | Builds a `MigrationRunner`. | PostgreSQL only. |
| `createSeedRunner(client, seeds, options?)` | Builds a `SeedRunner`. | PostgreSQL only. |
| `createLockManager(client)`, `acquireAdvisoryLock(tx, key)`, `lockRow(tx, table, id)` | Advisory and row locks. | PostgreSQL only. |
| `checkDatabaseHealth`, `checkDatabaseReadiness`, `assertDatabaseHealth`, `isDatabaseHealthy` | Health probes with a timeout. | Default 5000 ms. |
| `createDatabaseCache(options?)`, `createCacheKey(ns, ...parts)`, `getOrSet(cache, key, loader)`, `invalidateByPrefix(cache, prefix)` | Process-local LRU cache with TTL. | Not transaction-aware. |
| `oneToOne`, `oneToMany`, `manyToOne`, `manyToMany`, `createRelationRegistry`, `includeRelation`, `toPrismaInclude` | Describe relations and validate `include` trees. | Depth-limited (default 5). |
| `isConflictError`, `isNotFoundError`, `isRetryableTransactionError`, `getDatabaseErrorKind`, `getDatabaseErrorCode`, `toDatabaseErrorInfo`, `normalizeDatabaseError` | Inspect and convert errors. |  |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `DatabaseClient` | Connection lifecycle, raw queries, transactions. | `connect`, `disconnect`, `ping`, `healthCheck`, `getStatus`, `transaction`, `queryRawUnsafe`, `executeRawUnsafe`, `queryRaw`, `executeRaw`, `getPrisma`. |
| `Database` | Facade over one client. | Same lifecycle methods plus `getClient()`. |
| `DatabaseConnectionManager` | Events, scheduled checks, reconnect. | `on`, `off`, `startHealthChecks`, `stopHealthChecks`, `getLastHealth`, `destroy`. |
| `BaseRepository` | Abstract CRUD base class. | Extend it; see Repositories. |
| `TransactionManager`, `DatabaseUnitOfWork` | Transaction runners. | `execute`, `run`. |
| `QueryBuilder` | Fluent query description. | Prefer `createQueryBuilder()`. |
| `MigrationRunner`, `SeedRunner` | Tracked script runners. | `status`, `migrate`/`run`, `runOne` (seeds), `rollback`, `rollbackAll`, `getHistory`. |
| `DatabaseLockManager` | `withAdvisoryLock`, `withRowLock`. |  |
| `MemoryDatabaseCache` | `get`, `set`, `has`, `delete`, `clear`, `prune`, `dispose`, `getStats`. | Call `dispose()` when using `pruneIntervalMs`. |
| `RelationRegistry` | `register`, `get`, `forParent`, `forChild`. |  |

### Errors

| Name | When | Notes |
| --- | --- | --- |
| `DatabaseAbortError` | An `AbortSignal` fired. | Code `ERR_ABORTED`, status 499. |
| `DatabaseUnhealthyError` | `assertDatabaseHealth` failed. | Status 503; `.health` holds the report. |
| `UnsupportedDialectError` | A runner was given `mysql` or `sqlite`. |  |

### Types and constants

| Name | What it is |
| --- | --- |
| `DatabaseClientOptions`, `BaseRepositoryOptions`, `TransactionOptions`, `ManagedTransactionOptions`, `TransactionRetryOptions`, `MigrationRunnerOptions`, `SeedRunnerOptions`, `DatabaseLockOptions`, `MemoryCacheOptions` | Option objects for the matching factories. |
| `DatabaseOperationOptions` | `{ signal?, timeoutMs?, metadata? }` accepted by every operation. |
| `PaginatedResult`, `PaginationMeta`, `CursorPaginatedResult`, `CursorPaginationMeta`, `SortInput`, `QueryOptions` | Pagination shapes. |
| `Migration`, `MigrationRecord`, `MigrationStatus`, `Seed`, `SeedRecord` | Runner inputs and outputs. |
| `DatabaseEntity`, `SoftDeletableEntity`, `AuditableEntity` | Optional base shapes for your entity interfaces. |
| `PrismaClientLike`, `RepositoryDelegate`, `DatabaseTransactionContext` | Structural types; a stub object satisfying them works in tests. |
| `DatabaseLogger`, `noopDatabaseLogger` | Logger interface and a silent implementation. |
| `DEFAULT_PAGE` (1), `DEFAULT_LIMIT` (20), `MAX_LIMIT` (100), `DEFAULT_HEALTH_TIMEOUT_MS` (5000), `DEFAULT_MIGRATION_TABLE`, `DEFAULT_SEED_TABLE`, `SUPPORTED_ISOLATION_LEVELS` | Constants. |

## COMMON MISTAKES

- **Creating a client with no `prisma` and no `adapter`.** `createDatabaseClient({})` throws `DatabaseError: DatabaseClient requires either a pre-built prisma client or a Prisma driver adapter`. Pass one of them.
- **Using the root repository inside a transaction.** `users.update(...)` inside `withTransaction` runs on the normal connection and is not rolled back with the rest. Call `users.withTransaction(tx)` and use that copy.
- **Wrong `modelName` for the Prisma model.** `withTransaction(tx)` looks up `tx.user` from `modelName: "User"`. If your model is `UserAccount`, set `modelName: "UserAccount"` or pass `delegateKey: "userAccount"`, otherwise it throws `Transaction client has no "user" delegate`.
- **Passing `getDatabase(options)` twice.** The second call throws a `TypeError` because the shared instance already exists. Configure it once at startup with `connectDatabase(options)`; everywhere else call `getDatabase()` with no arguments.
- **Expecting `timeoutMs` to cancel the SQL.** The promise rejects, but the statement keeps running on PostgreSQL. Configure `statement_timeout` on the connection for server-side cancellation.
- **Filling the cache inside a transaction.** If the transaction rolls back, other callers read a value that never existed. Populate `MemoryDatabaseCache` only after the transaction commits.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — every error this package throws is a `DatabaseError` from here; read it to see the full `ErrorCode` list and HTTP mapping.
- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — when the process-local `MemoryDatabaseCache` is not enough and you need a shared or Redis-backed cache.
- [@zudojs/transactions](https://zudojs.oyinlola.site/docs/packages-transactions.md) — coordinating work across more than one resource, not just this database.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — a place to hook `client.connect()` at startup and `client.disconnect()` on shutdown.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — where `checkDatabaseHealth` usually ends up, behind a `/health` route.

## COMPLETE EXPORT INDEX

Every name `@zudojs/database` exports from its package root at v1.1.0 — **275** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 275 exports**

Classes (15)

`BaseRepository` `Database` `DatabaseAbortError` `DatabaseClient` `DatabaseConnectionManager` `DatabaseLockManager` `DatabaseUnhealthyError` `DatabaseUnitOfWork` `MemoryDatabaseCache` `MigrationRunner` `QueryBuilder` `RelationRegistry` `SeedRunner` `TransactionManager` `UnsupportedDialectError`

Functions (147)

`acquireAdvisoryLock` `allOf` `and` `anyOf` `assertDatabaseHealth` `between` `buildKeysetWhere` `buildLockClause` `buildPrismaTransactionOptions` `calculateOffset` `calculateTotalPages` `checkDatabaseHealth` `checkDatabaseReadiness` `cloneFilter` `condition` `connectDatabase` `contains` `createAbortError` `createCacheKey` `createConnectionManager` `createCursorPaginatedResult` `createCursorPaginationMeta` `createDatabase` `createDatabaseCache` `createDatabaseClient` `createKeysetCursor` `createKeysetPage` `createLockManager` `createMigrationRunner` `createPaginatedResult` `createPaginationMeta` `createQueryBuilder` `createRelationRegistry` `createSeedRunner` `createTransactionContext` `createTransactionId` `createTransactionManager` `createUnitOfWork` `dateOnly` `dateRange` `decodeCursor` `decodeKeysetCursor` `disconnectDatabase` `encodeCursor` `endsWith` `equals` `escapeCachePart` `executeUnitOfWork` `flattenAnd` `fnv1a64` `fromObject` `getCurrentVersion` `getDatabase` `getDatabaseErrorCode` `getDatabaseErrorKind` `getHealthCheckCause` `getItemRange` `getLatestVersion` `getNextPage` `getOrSet` `getPreviousPage` `getSqlDialect` `getTransactionContextFromError` `greaterThan` `greaterThanOrEqual` `hasConditions` `hashLockKey` `includeRelation` `includeRelations` `inList` `invalidateByPrefix` `isAfter` `isBefore` `isBetween` `isCollectionRelation` `isConflictError` `isDatabaseErrorLike` `isDatabaseHealthy` `isEmpty` `isNotEmpty` `isNotFoundError` `isNotNull` `isNull` `isPrismaError` `isPrismaErrorLike` `isRelationType` `isRetryableTransactionError` `isSingleRelation` `isSqlDialectName` `isTransactionActive` `isTransactionCommitted` `isTransactionFailed` `isValidPage` `lessThan` `lessThanOrEqual` `lockRow` `manyToMany` `manyToOne` `mapRepositoryError` `matchesPattern` `noneOf` `normalizeAdvisoryKey` `normalizeAdvisoryKeyPair` `normalizeCursorPagination` `normalizeDatabaseError` `normalizeLimit` `normalizeMigrations` `normalizePage` `normalizePagination` `normalizeSeeds` `not` `notCondition` `notEquals` `notInList` `oneOf` `oneToMany` `oneToOne` `optionalContains` `optionalEquals` `or` `paginateCollection` `quoteIdentifier` `raceAbort` `relational` `resetDatabase` `resolveLockTransactionOptions` `serializeCachePart` `startsWith` `throwIfAborted` `toDatabaseErrorInfo` `toDatabaseOperation` `toPrismaArgs` `toPrismaInclude` `toPrismaOrderBy` `toPrismaSelect` `toPrismaSkipTake` `toPrismaWhere` `validateCursorPayload` `validateIdentifier` `validateInclude` `validateLockKey` `validateMigration` `validateRelation` `validateSeed` `withDatabaseErrorMetadata` `withTransaction` `withTransactionRetry`

Interfaces (74)

`AuditableEntity` `BaseRepositoryOptions` `CacheEntry` `CacheOptions` `CacheStats` `CursorPaginatedResult` `CursorPaginationInput` `CursorPaginationMeta` `CursorQueryOptions` `DatabaseCache` `DatabaseClientHealth` `DatabaseClientOptions` `DatabaseConnectionEventDetails` `DatabaseConnectionManagerOptions` `DatabaseConnectionOptions` `DatabaseEntity` `DatabaseErrorInfo` `DatabaseHealth` `DatabaseHealthOptions` `DatabaseLockOptions` `DatabaseLockResult` `DatabaseLogger` `DatabaseOperationOptions` `DatabaseReadiness` `DatabaseReconnectOptions` `DecodeCursorOptions` `EncodeCursorOptions` `KeysetPageOptions` `ManagedTransactionOptions` `MemoryCacheOptions` `Migration` `MigrationRecord` `MigrationResult` `MigrationRunnerOptions` `MigrationStatus` `NormalizeDatabaseErrorOptions` `NormalizedPagination` `PaginatedResult` `PaginationInput` `PaginationMeta` `PrismaClientLike` `PrismaDriverAdapterLike` `PrismaErrorLike` `PrismaQueryArgs` `PrismaQueryEvent` `PrismaTransactionOptions` `QueryBuilderState` `QueryCondition` `QueryFilter` `QueryOptions` `RelationDefinition` `RelationInclude` `RelationLoadOptions` `Repository` `RepositoryDelegate` `RepositoryErrorContext` `Seed` `SeedRecord` `SeedResult` `SeedRunnerOptions` `SeedStatus` `SoftDeletableEntity` `SoftDeletableRepository` `SoftDeleteOptions` `SortInput` `SqlDialect` `ToPrismaArgsOptions` `ToPrismaIncludeOptions` `TransactionContext` `TransactionOptions` `TransactionOutcome` `TransactionRetryOptions` `UnitOfWork` `UnitOfWorkOptions`

Type aliases (24)

`CursorPayload` `DatabaseConnectionEvent` `DatabaseConnectionListener` `DatabaseErrorKind` `DatabaseHealthInfo` `DatabaseHealthStatus` `DatabaseLockMode` `DatabaseOperation` `DatabaseStatus` `DatabaseTransactionContext` `KeysetWhere` `PrismaWhere` `QueryOperator` `RawQueryOptions` `RelationOperator` `RelationType` `RepositoryOperation` `RunnerTransactionOptions` `SortDirection` `SqlDialectName` `TransactionCallback` `TransactionClientLike` `TransactionIsolationLevel` `TransactionStatus`

Constants (15)

`CACHE_KEY_SEPARATOR` `DEFAULT_HEALTH_TIMEOUT_MS` `DEFAULT_INCLUDE_DEPTH` `DEFAULT_LIMIT` `DEFAULT_MIGRATION_LOCK` `DEFAULT_MIGRATION_TABLE` `DEFAULT_PAGE` `DEFAULT_SEED_LOCK` `DEFAULT_SEED_TABLE` `DEFAULT_SQL_DIALECT` `MAX_LIMIT` `noopDatabaseLogger` `RETRYABLE_DATABASE_CODES` `SQL_IDENTIFIER_PATTERN` `SUPPORTED_ISOLATION_LEVELS`
