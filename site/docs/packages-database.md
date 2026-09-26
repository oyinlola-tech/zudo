---
title: "@zudojs/database — Database Infrastructure Documentation"
description: "Complete documentation for @zudojs/database — database clients, repositories, transactions, migrations, seeding, caching, and connection management."
source: https://zudojs.oyinlola.site/docs/packages-database
---

v1.4.0

# @zudojs/database

PostgreSQL data-access layer for Zudo applications, built on Prisma 7 — a lifecycle-aware client, generic repositories with soft delete, a query builder that translates to Prisma `where` clauses, managed transactions, keyset pagination with signed cursors, migration and seed runners guarded by advisory locks, health checks with reconnect, and a bounded in-memory cache.

PRISMA 7 POSTGRESQL REPOSITORY PATTERN TRANSACTIONS MIGRATIONS

## OVERVIEW

Most applications need to store data in a database and read it back. Prisma already generates a typed client for that. What it does not give you is a shared way to open and close the connection, run the same "find by id, create, update, soft delete" code for every table, keep pagination consistent, or turn database failures into errors your HTTP layer understands.

`@zudojs/database` adds that layer on top of Prisma 7 for PostgreSQL. It wraps your Prisma client in a *DatabaseClient* that manages the connection, gives you a *BaseRepository* class you extend once per table, and ships helpers for transactions, query building, pagination, migrations, seeds, locks, caching and health checks.

Prisma stays visible. Repositories wrap a Prisma model (for example `prisma.user`), and transaction callbacks receive Prisma's own transaction client, typed from your generated client. The package normalises lifecycle, errors and pagination; it does not hide Prisma from you.

When you need it

- You use Prisma 7 with PostgreSQL and want one place that connects, checks health and disconnects.
- Several tables need the same CRUD, soft-delete and pagination behaviour.
- You want database errors mapped to 404 / 409 / 503 without hand-written `switch` statements.
- You need migrations, seeds or locks that are safe when two app instances start at once.

When you don't

- You do not use Prisma. There is no driver of its own: the client, repositories and transactions all call a Prisma client (or a Prisma driver adapter), so Drizzle, Kysely, TypeORM or a raw `pg` pool cannot be plugged in.
- You use MySQL, SQLite or MongoDB. The client works with any Prisma client, but the migration, seed and lock helpers emit PostgreSQL SQL only.
- You are happy calling `prisma.user.findMany()` directly and have one or two tables.
- You need nested transactions or savepoints. Prisma interactive transactions are used as-is.

## INSTALLATION

Install the package together with Prisma and the PostgreSQL driver adapter. Prisma 7 talks to the database through an *adapter*, a small package that owns the connection string, pool size and SSL settings.

```bash
$ npm install @zudojs/database @prisma/client@7 @prisma/adapter-pg@7
$ npm install -D prisma@7
$ npx prisma generate
```

Prisma 7's `prisma-client` generator writes a TypeScript client into your own source tree, so you import `PrismaClient` from that folder rather than from `@prisma/client`. The examples on this page use this generator block in `prisma/schema.prisma`, which puts the client at `src/generated/prisma`; if your `output` differs, change the import path to match.

```ts
generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
}
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Peer dependency.** `@prisma/client` `>=7.0.0 <8` is a peer dependency, so you install it yourself. Pin the `@7` major as above: the `prisma` CLI's `latest` tag on npm can point at a newer major that is outside this range. `@zudojs/errors` is a regular dependency and comes along automatically.

> **Strict type-checking works.** Since v1.4.0 the published type declarations never import `@prisma/client`; every Prisma type the package needs is structural and owned by it. A project that type-checks with `skipLibCheck: false` compiles against it whether the generated client lives in your source tree (`prisma-client`) or in `node_modules/.prisma/client` (the legacy `prisma-client-js`).

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
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient, type RepositoryDelegate } from "@zudojs/database";

interface User {
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}

// One repository per model. The delegate is the Prisma model (prisma.user).
class UserRepository extends BaseRepository<User> {
  constructor(delegate: RepositoryDelegate<User>) {
    super(delegate, { modelName: "User", softDelete: true });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const users = new UserRepository(prisma.user); // no cast since v1.3.1
const alice = await users.create({ email: "alice@example.com", name: "Alice" });
console.log(alice.name, await users.count());
// Alice 1

await client.disconnect();
```

Run it with `DATABASE_URL` set. The console prints `Alice 1`: the created row's name and the number of live rows in the table. The client also logs `Database connected.` and `Database disconnected.` through its default logger, a `@zudojs/logger` console logger named `@zudojs/database`.

> **Tip:** `RepositoryDelegate<User>` is the structural shape `BaseRepository` needs from a model (`findUnique`, `findFirst`, `findMany`, `create`, `update`, `delete`, `count`). It accepts any argument list and checks only the return types, so a generated Prisma 7 delegate such as `prisma.user` is passed as it is, while a delegate whose rows do not match `User` (say `prisma.order`) is still a type error. Typing the constructor with it keeps your repository independent from Prisma's generated types.

> **Changed in v1.3.1:** in v1.3.0, `new UserRepository(prisma.user)` with a generated Prisma 7 client failed strict type-checking with TS2345, because Prisma's generic `findFirst<T extends UserFindFirstArgs>(...)` could not be assigned to a hand-written argument shape, and these examples used `prisma.user as unknown as RepositoryDelegate<User>`. `RepositoryDelegate` now accepts any argument list, so the cast can go; it still compiles if you keep it. Inside a subclass, `this.delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so `this.delegate.findMany({ where })` compiles as before. Checked with Prisma 7.10.0 and `prisma generate`.

## DATABASE CLIENT

A *DatabaseClient* is a thin wrapper around a Prisma client. It tracks whether you are connected, de-duplicates concurrent `connect()` calls, adds timeouts and cancellation to raw queries, and converts every failure into a `DatabaseError`.

You create it with `createDatabaseClient` and either a pre-built `prisma` instance or an `adapter`. With only an adapter the client constructs the `PrismaClient` for you. Passing neither throws immediately.

The `prisma` option is typed `PrismaClientLike`, a structural type describing the methods the wrapper calls. A client generated by Prisma 7 satisfies it as-is, so you pass it straight in:

```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = createDatabaseClient({ prisma: new PrismaClient({ adapter }) });
```

> **No cast needed.** Earlier releases declared a single generic `$transaction` signature that a generated client's overloaded `$transaction` could not match, so this call needed `prisma as unknown as PrismaClientLike`. `PrismaClientLike` now accepts the generated client; delete the cast if you have one.

`createDatabaseClient` is generic in the client you pass. `createDatabaseClient({ prisma })` returns `DatabaseClient<TransactionClientOf<typeof prisma>>`, and for a generated client that transaction type is Prisma's own `Prisma.TransactionClient`, so `tx` in every transaction callback has your model delegates. See [Typed transaction clients](#typed-transactions).

| Option | What it does | Default |
| --- | --- | --- |
| `prisma` | A Prisma client to wrap. Takes precedence over `adapter`. | — |
| `adapter` | A Prisma driver adapter (for example `new PrismaPg(...)`) used to build a client when `prisma` is absent. | — |
| `connectionTimeoutMs` | How long `connect()` waits before failing with `ERR_DATABASE_TIMEOUT`. | `10000` |
| `logging` | Log each query's duration through the logger. | `false` |
| `logger` | Any object with `debug / info / warn / error`. Use `noopDatabaseLogger` to silence output. | `@zudojs/logger` console transport (logger name `@zudojs/database`; secret-named metadata redacted; debug/info off when `NODE_ENV=production`) |

This example connects, runs a raw parameterised query with a 2-second deadline, and prints a health check.

```ts
import { PrismaClient } from "./generated/prisma/client.js";
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

Every raw method accepts the same options object: `signal` (an `AbortSignal` that rejects with `DatabaseAbortError`), `timeoutMs` and `metadata` (merged into any error raised). `queryRawUnsafe` / `executeRawUnsafe` take a SQL string plus a values array; `queryRaw` / `executeRaw` take a `Prisma.sql` tagged template. Their parameter is typed `PrismaSqlLike`, a structural `{ strings, values, sql }` shape that any `Prisma.sql` value satisfies, so you import `Prisma` from your generated client as usual:

```ts
import { PrismaClient, Prisma } from "./generated/prisma/client.js";

const rows = await client.queryRaw<{ count: bigint }[]>(
  Prisma.sql`SELECT COUNT(*) AS "count" FROM "User" WHERE "email" LIKE ${"%@example.com"}`,
);
console.log(rows[0]?.count);
// 1n
```

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
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient, type RepositoryDelegate } from "@zudojs/database";

interface User { id: string; email: string; name: string; deletedAt: Date | null }

class UserRepository extends BaseRepository<User> {
  constructor(delegate: RepositoryDelegate<User>) {
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

const users = new UserRepository(prisma.user); // no cast since v1.3.1
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
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { BaseRepository, createDatabaseClient, withTransaction, type RepositoryDelegate } from "@zudojs/database";

interface User { id: string; email: string; name: string; deletedAt: Date | null }

class UserRepository extends BaseRepository<User> {
  constructor(delegate: RepositoryDelegate<User>) {
    super(delegate, { modelName: "User", softDelete: true });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

const users = new UserRepository(prisma.user); // no cast since v1.3.1
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

### Typed transaction clients

You do not need a repository to write inside a transaction. `tx` is typed from the client you passed to `createDatabaseClient`, so you can call its model delegates directly and TypeScript checks them against your schema, the same as `prisma.user`:

```ts
const bob = await client.transaction(async (tx) => {
  const created = await tx.user.create({ data: { email: "bob@example.com", name: "Bob" } });
  return tx.user.update({ where: { id: created.id }, data: { name: "Bob Smith" } });
});
console.log(bob.name, bob.createdAt instanceof Date);
// Bob Smith true
```

No cast is involved: `bob` is the generated `User` row type, and a misspelled field in `data` is a compile error. `withTransaction`, `withTransactionRetry`, `TransactionManager`, `createUnitOfWork`, `createDatabase`, `createLockManager`, `createMigrationRunner` and `createSeedRunner` take the transaction type from the client they wrap, so their callbacks get the same `tx`. How the type is found depends on how the client was built:

| You write | `tx` is |
| --- | --- |
| `createDatabaseClient({ prisma })`, `createDatabase({ prisma })` | Your client's transaction client (`Prisma.TransactionClient`), model delegates included. |
| `createDatabaseClient<PrismaClient>({ adapter })` | The same, from the type argument. |
| `createDatabaseClient({ adapter })`, `new DatabaseClient(options)`, `getDatabase()` / `connectDatabase(options)` | `DatabaseTransactionContext`: the four raw methods (`$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`) and no model delegates. |

With only an adapter there is no client value to read the type from, so `tx.user` is a compile error until you pass the client type:

```ts
import { PrismaClient } from "./generated/prisma/client.js";   // or "@prisma/client" with prisma-client-js

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const untyped = createDatabaseClient({ adapter });
await untyped.transaction(async (tx) => tx.user.count());
// error TS2339: Property 'user' does not exist on type 'DatabaseTransactionContext'.

const typed = createDatabaseClient<PrismaClient>({ adapter });
await typed.transaction(async (tx) => tx.user.count());   // OK
```

`TransactionClientOf<TClient>` is the type-level helper behind this. It reads the interactive `$transaction` callback parameter of a client type and falls back to `DatabaseTransactionContext` when there is none, for example for a hand-written stub. Use it to annotate a function that takes `tx`: `async function archive(tx: TransactionClientOf<PrismaClient>, id: string)`.

> **Changed in v1.4.0:** `DatabaseTransactionContext` used to be `Prisma.TransactionClient` imported from `@prisma/client`. With Prisma 7's `prisma-client` generator that import has nothing behind it, so under `skipLibCheck: false` the package's own declarations failed with TS2307 (`Cannot find module '.prisma/client/default'`) and TS2305 (`Module '"@prisma/client"' has no exported member 'Prisma'`), and under `skipLibCheck: true` every `tx` was silently `any`. `DatabaseTransactionContext` is now the structural raw-query type above and stays the default type argument everywhere, so code that annotates `tx` with it still compiles. One case needs a change: with the legacy `prisma-client-js` generator, a client built from only an adapter (or `new DatabaseClient(...)`, or `getDatabase()`) used to give `tx.user` the generated types; it now needs `createDatabaseClient<PrismaClient>({ adapter })`, or pass `prisma`.

> **Writing your own transaction client:** since v1.4.0, an object you *return* as a `DatabaseTransactionContext` (for example from a hand-written adapter's `$transaction`) must implement `$queryRaw`, `$executeRaw`, `$queryRawUnsafe` and `$executeRawUnsafe`; otherwise TypeScript reports TS2739. Code that only *receives* a `tx` is unaffected. The [Learn database lesson](https://zudojs.oyinlola.site/learn/zudo-database) shows a full adapter over PGlite.

If the callback throws, the transaction is rolled back and the error comes out in one of two ways. Since v1.3.0 a `@zudojs/errors` `BaseError` that is *not* a `DatabaseError` (a `NotFoundError`, `ValidationError`, `DomainError`, ...) is rethrown as the **same instance**, so its status code and message reach your HTTP layer unchanged; it is logged at debug level only. Anything else (a driver or database failure, a plain `Error`, any other thrown value) is normalised into a `DatabaseError` that carries `transactionId` and `transactionStatus: "failed"`, and `getTransactionContextFromError(error)` recovers that context. The same rule applies to `withTransactionRetry`, `client.transaction()`, `TransactionManager.run()` / `execute()` and a unit of work. `isNonDatabaseBaseError(error)` is the guard the package uses to tell the two apart.

```ts
import { NotFoundError } from "@zudojs/errors";

try {
  await withTransaction(client, async (tx) => {
    const user = await users.withTransaction(tx).findById("missing-id");
    if (!user) throw new NotFoundError("User not found");
    // ...more writes, all rolled back by the throw
  });
} catch (error) {
  console.log(error instanceof NotFoundError, (error as NotFoundError).statusCode);
  // true 404
}
```

> **Changed in v1.3.0:** before this release every error from the callback, your own included, was wrapped in a 500 `DatabaseError` (`code: "ERR_DATABASE"`, `expose: false`) with the original in `.cause`, so a `NotFoundError` thrown in a transaction surfaced as an internal server error. If you added an unwrap step for that, it is now dead code and can go.

| Option | What it does |
| --- | --- |
| `isolationLevel` | `"ReadUncommitted"`, `"ReadCommitted"`, `"RepeatableRead"` or `"Serializable"`. |
| `timeoutMs`, `maxWaitMs` | Forwarded to Prisma: how long the transaction may run, and how long to wait for a connection. |
| `transactionId`, `metadata` | Attached to the context and to any error thrown. |
| `signal` | Abort the transaction from outside. The abort is raised inside the Prisma callback, so the transaction is rolled back and the caller rejects with `DatabaseAbortError`. |

PostgreSQL sometimes aborts a `Serializable` transaction because another one touched the same rows. `withTransactionRetry` has the same signature and re-runs the callback (default 3 retries, doubling delay from 100 ms, each delay capped at `maxRetryDelayMs`, 30 s by default; pass `jitter: "full"` to spread contending retries) when `isRetryableTransactionError` says the failure is temporary.

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

Cursor pagination goes both ways. Since v1.3.0 any non-empty page requested *with* a cursor sets `meta.previousCursor`; pass it back as `cursor` to fetch the page before. Rows still come back in the requested sort order. Backward cursors carry a reserved `$before: true` marker (`KEYSET_BACKWARD_KEY`). The first page has no `previousCursor`, and a page reached by going back reports `hasPreviousPage: false` when it is the first one.

```ts
// ...continuing from above: step back from the second page
const back = await users.paginateCursor(undefined, { cursor: second.meta.previousCursor, limit: 25, sort });
console.log(back.data[0]?.id === first.data[0]?.id, back.meta.hasPreviousPage);
// true false
```

A bad cursor is a client error. A missing, forged, tampered or malformed cursor makes `paginateCursor` (and `decodeCursor`, `validateCursorPayload`, `decodeKeysetCursor`) throw a `ValidationError` from `@zudojs/errors`: status 400, `expose: true`, with one issue on `cursor` whose `code` is `cursor_required`, `cursor_signature`, `cursor_malformed`, `cursor_payload` or `cursor_field`. Your HTTP layer can pass it straight through; no wrapping is needed. Messages never quote the offending field name. An invalid `cursorSecret` or sort definition is a programming error and still throws `TypeError`. (Before v1.3.0 a bad cursor was a plain `TypeError` that surfaced as a 500, and `previousCursor` was never set.)

> **Watch out:** a cursor is a base64 string the browser sends back. Without a `cursorSecret` on the repository anyone can forge one. Set the secret on any repository whose cursors leave your server; they are then HMAC-signed and rejected if edited.

## MIGRATIONS AND SEEDS

A *migration* is a numbered script that changes the database structure, such as adding a table. The runner remembers which versions have run in a `_migrations` table and applies only the new ones. A *seed* is a named script that inserts starting data, tracked the same way in `_seeds`.

Both runners take a PostgreSQL *advisory lock* (a database-wide named lock) before working, so two app instances booting at the same time never run the same script twice. Each script runs in its own transaction by default.

```ts
import { PrismaClient } from "./generated/prisma/client.js";
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
import { PrismaClient } from "./generated/prisma/client.js";
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

Other health helpers: `isDatabaseHealthy(client)` returns a boolean and `checkDatabaseReadiness(client)` returns `{ ready, latencyMs, checkedAt }` for a readiness route. For scheduled checks with automatic reconnect, wrap the client in `createConnectionManager({ client, healthCheckIntervalMs: 15_000 })` and call `manager.connect()`; it emits `error` and `reconnecting` events through `manager.on(listener)`. The reconnect policy (`reconnect: { failureThreshold, maxAttempts, baseDelayMs, maxDelayMs }`, defaults 1, 5, 500 ms, 30 s; `false` turns it off) backs off between attempts. Since v1.3.0 that back-off wait is not `unref`'d, so a script whose only pending work is a reconnect stays alive until it finishes, and `disconnect()` / `destroy()` cancel a reconnect in progress, wait included. The scheduled health-check timer itself is still unreferenced.

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
| `createDatabaseClient(options)` | Builds a `DatabaseClient`. | Needs `prisma` or `adapter`. The transaction type is inferred from `prisma`; with only `adapter`, pass `<PrismaClient>` to keep model delegates on `tx`. |
| `createDatabase`, `getDatabase`, `connectDatabase`, `disconnectDatabase`, `resetDatabase` | Manage one shared `Database` facade. | `getDatabase` throws if given options after creation. |
| `createConnectionManager(options)` | Scheduled health checks and reconnect around a client. | Pass `client` to wrap an existing one. |
| `withTransaction(client, cb, options?)` | Runs `cb(tx, context)` in one transaction. |  |
| `withTransactionRetry(client, cb, options?)` | Same, retrying temporary failures. | `retries`, `retryDelayMs`, `maxRetryDelayMs`, `jitter`, `shouldRetry`. |
| `createTransactionManager(client)`, `createUnitOfWork(client)`, `executeUnitOfWork(client, cb)` | Object-style transaction helpers. | `manager.run()` also returns the context. |
| `getTransactionContextFromError(error)` | Reads the failed transaction's context from an error. |  |
| `createQueryBuilder<Fields>()` | New empty builder. |  |
| `toPrismaWhere(filter)`, `toPrismaArgs(state)`, `toPrismaOrderBy`, `toPrismaSelect`, `toPrismaSkipTake` | Translate filters and builder state into Prisma arguments. |  |
| Filter helpers (`equals`, `and`, `or`, ...) | Build `QueryFilter` values. | Full list in Query Builder. |
| `normalizePagination`, `createPaginationMeta`, `createPaginatedResult`, `paginateCollection` | Offset pagination helpers for data you already have in memory. |  |
| `encodeCursor`, `decodeCursor`, `createKeysetPage`, `buildKeysetWhere`, `getKeysetDirection`, `keysetFetchSort`, `reverseKeysetSort`, `createInvalidCursorError` | Cursor pagination building blocks used by `paginateCursor`. | Pass `allowedFields` to `decodeCursor` for untrusted input. `createKeysetCursor` takes an optional `direction` and `createKeysetPage` a `direction` option; `buildKeysetWhere` honours backward cursors. `createInvalidCursorError` builds the 400 `ValidationError`. |
| `createMigrationRunner(client, migrations, options?)` | Builds a `MigrationRunner`. | PostgreSQL only. |
| `createSeedRunner(client, seeds, options?)` | Builds a `SeedRunner`. | PostgreSQL only. |
| `createLockManager(client)`, `acquireAdvisoryLock(tx, key)`, `lockRow(tx, table, id)` | Advisory and row locks. | PostgreSQL only. |
| `checkDatabaseHealth`, `checkDatabaseReadiness`, `assertDatabaseHealth`, `isDatabaseHealthy` | Health probes with a timeout. | Default 5000 ms. |
| `createDatabaseCache(options?)`, `createCacheKey(ns, ...parts)`, `getOrSet(cache, key, loader)`, `invalidateByPrefix(cache, prefix)` | Process-local LRU cache with TTL. | Not transaction-aware. |
| `oneToOne`, `oneToMany`, `manyToOne`, `manyToMany`, `createRelationRegistry`, `includeRelation`, `toPrismaInclude` | Describe relations and validate `include` trees. | Depth-limited (default 5). |
| `isConflictError`, `isNotFoundError`, `isRetryableTransactionError`, `isNonDatabaseBaseError`, `getDatabaseErrorKind`, `getDatabaseErrorCode`, `toDatabaseErrorInfo`, `normalizeDatabaseError` | Inspect and convert errors. |  |

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
| `PrismaClientLike`, `RepositoryDelegate`, `RepositoryDelegateOperations` | Structural types; a stub object satisfying them works in tests. A Prisma 7 client generated with the `prisma-client` generator satisfies `PrismaClientLike`, and its model delegates satisfy `RepositoryDelegate`, without a cast. `RepositoryDelegateOperations` types `this.delegate` inside a repository subclass. |
| `DatabaseTransactionContext` | The structural transaction client: `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`. The default transaction type everywhere, and what migration, seed and lock callbacks need. A hand-written transaction client must provide all four methods. |
| `TransactionClientOf<TClient>` | The interactive transaction client of a Prisma client type (`Prisma.TransactionClient` for a generated client), or `DatabaseTransactionContext` when it cannot be read. What `createDatabaseClient({ prisma })` types `tx` with. |
| `PrismaSqlLike` | `{ strings, values, sql }`, the parameter of `queryRaw` / `executeRaw`. Any `Prisma.sql` value satisfies it. |
| `DatabaseLogger`, `noopDatabaseLogger` | Logger interface and a silent implementation. |
| `DEFAULT_PAGE` (1), `DEFAULT_LIMIT` (20), `MAX_LIMIT` (100), `DEFAULT_HEALTH_TIMEOUT_MS` (5000), `DEFAULT_MIGRATION_TABLE`, `DEFAULT_SEED_TABLE`, `SUPPORTED_ISOLATION_LEVELS` | Constants. |

## COMMON MISTAKES

- **Creating a client with no `prisma` and no `adapter`.** `createDatabaseClient({})` throws `DatabaseError: DatabaseClient requires either a pre-built prisma client or a Prisma driver adapter`. Pass one of them.
- **Calling `tx.user` on a client built from only an adapter.** `createDatabaseClient({ adapter })` has no client value to read the transaction type from, so `tx` is `DatabaseTransactionContext` and TypeScript reports `Property 'user' does not exist on type 'DatabaseTransactionContext'`. Pass the client type, `createDatabaseClient<PrismaClient>({ adapter })`, or pass `prisma`.
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

Every name `@zudojs/database` exports from its package root at v1.5.0 — **293** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 293 exports**

Classes (15)

`BaseRepository` `Database` `DatabaseAbortError` `DatabaseClient` `DatabaseConnectionManager` `DatabaseLockManager` `DatabaseUnhealthyError` `DatabaseUnitOfWork` `MemoryDatabaseCache` `MigrationRunner` `QueryBuilder` `RelationRegistry` `SeedRunner` `TransactionManager` `UnsupportedDialectError`

Functions (157)

`acquireAdvisoryLock` `allOf` `and` `anyOf` `assertDatabaseHealth` `between` `buildKeysetWhere` `buildLockClause` `buildPrismaTransactionOptions` `calculateOffset` `calculateTotalPages` `checkDatabaseHealth` `checkDatabaseReadiness` `cloneFilter` `condition` `connectDatabase` `contains` `createAbortError` `createCacheKey` `createConnectionManager` `createCursorPaginatedResult` `createCursorPaginationMeta` `createDatabase` `createDatabaseCache` `createDatabaseClient` `createInvalidCursorError` `createKeysetCursor` `createKeysetPage` `createLockManager` `createMigrationRunner` `createPaginatedResult` `createPaginationMeta` `createQueryBuilder` `createRelationRegistry` `createSeedRunner` `createTransactionContext` `createTransactionId` `createTransactionManager` `createUnitOfWork` `dateOnly` `dateRange` `decodeCursor` `decodeKeysetCursor` `disconnectDatabase` `encodeCursor` `endsWith` `equals` `escapeCachePart` `executeUnitOfWork` `flattenAnd` `fnv1a64` `fromObject` `getCurrentVersion` `getDatabase` `getDatabaseErrorCode` `getDatabaseErrorKind` `getHealthCheckCause` `getItemRange` `getKeysetDirection` `getLatestVersion` `getNextPage` `getOrSet` `getPreviousPage` `getPrismaCodeMapping` `getSqlDialect` `getTransactionContextFromError` `greaterThan` `greaterThanOrEqual` `hasConditions` `hashLockKey` `includeRelation` `includeRelations` `inList` `invalidateByPrefix` `isAfter` `isBefore` `isBetween` `isCollectionRelation` `isConflictError` `isDatabaseErrorLike` `isDatabaseHealthy` `isDateCursorValue` `isEmpty` `isNonDatabaseBaseError` `isNotEmpty` `isNotFoundError` `isNotNull` `isNull` `isPrismaError` `isPrismaErrorLike` `isRelationType` `isRetryableTransactionError` `isSingleRelation` `isSqlDialectName` `isTransactionActive` `isTransactionCommitted` `isTransactionFailed` `isValidPage` `keysetFetchSort` `keysetStrictFilter` `keysetTieFilter` `lessThan` `lessThanOrEqual` `lockRow` `manyToMany` `manyToOne` `mapRepositoryError` `matchesPattern` `nextMillisecond` `noneOf` `normalizeAdvisoryKey` `normalizeAdvisoryKeyPair` `normalizeCursorPagination` `normalizeDatabaseError` `normalizeLimit` `normalizeMigrations` `normalizePage` `normalizePagination` `normalizeSeeds` `not` `notCondition` `notEquals` `notInList` `oneOf` `oneToMany` `oneToOne` `optionalContains` `optionalEquals` `or` `paginateCollection` `quoteIdentifier` `raceAbort` `relational` `resetDatabase` `resolveLockTransactionOptions` `reverseKeysetSort` `serializeCachePart` `startsWith` `throwIfAborted` `toDatabaseErrorInfo` `toDatabaseOperation` `toPrismaArgs` `toPrismaInclude` `toPrismaOrderBy` `toPrismaSelect` `toPrismaSkipTake` `toPrismaWhere` `validateCursorPayload` `validateIdentifier` `validateInclude` `validateLockKey` `validateMigration` `validateRelation` `validateSeed` `withDatabaseErrorMetadata` `withTransaction` `withTransactionRetry`

Interfaces (77)

`AuditableEntity` `BaseRepositoryOptions` `CacheEntry` `CacheOptions` `CacheStats` `CreateCursorOptions` `CursorPaginatedResult` `CursorPaginationInput` `CursorPaginationMeta` `CursorQueryOptions` `DatabaseCache` `DatabaseClientHealth` `DatabaseClientOptions` `DatabaseConnectionEventDetails` `DatabaseConnectionManagerOptions` `DatabaseConnectionOptions` `DatabaseEntity` `DatabaseErrorInfo` `DatabaseHealthOptions` `DatabaseLockOptions` `DatabaseLockResult` `DatabaseLogger` `DatabaseOperationOptions` `DatabaseReadiness` `DatabaseReconnectOptions` `DecodeCursorOptions` `EncodeCursorOptions` `KeysetPageOptions` `ManagedTransactionOptions` `MemoryCacheOptions` `Migration` `MigrationRecord` `MigrationResult` `MigrationRunnerOptions` `MigrationStatus` `NormalizeDatabaseErrorOptions` `NormalizedPagination` `PaginatedResult` `PaginationInput` `PaginationMeta` `PrismaClientLike` `PrismaCodeMapping` `PrismaDriverAdapterLike` `PrismaErrorLike` `PrismaQueryArgs` `PrismaQueryEvent` `PrismaSqlLike` `PrismaTransactionOptions` `QueryBuilderState` `QueryCondition` `QueryFilter` `QueryOptions` `RelationDefinition` `RelationInclude` `RelationLoadOptions` `Repository` `RepositoryDelegate` `RepositoryDelegateOperations` `RepositoryErrorContext` `Seed` `SeedRecord` `SeedResult` `SeedRunnerOptions` `SeedStatus` `SoftDeletableEntity` `SoftDeletableRepository` `SoftDeleteOptions` `SortInput` `SqlDialect` `ToPrismaArgsOptions` `ToPrismaIncludeOptions` `TransactionContext` `TransactionOptions` `TransactionOutcome` `TransactionRetryOptions` `UnitOfWork` `UnitOfWorkOptions`

Type aliases (28)

`CursorPayload` `DatabaseConnectionEvent` `DatabaseConnectionListener` `DatabaseErrorKind` `DatabaseHealth` `DatabaseHealthInfo` `DatabaseHealthStatus` `DatabaseLockMode` `DatabaseOperation` `DatabaseStatus` `DatabaseTransactionContext` `InvalidCursorReason` `KeysetDirection` `KeysetWhere` `PrismaWhere` `QueryOperator` `RawQueryOptions` `RelationOperator` `RelationType` `RepositoryOperation` `RunnerTransactionOptions` `SortDirection` `SqlDialectName` `TransactionCallback` `TransactionClientLike` `TransactionClientOf` `TransactionIsolationLevel` `TransactionStatus`

Constants (16)

`CACHE_KEY_SEPARATOR` `DEFAULT_HEALTH_TIMEOUT_MS` `DEFAULT_INCLUDE_DEPTH` `DEFAULT_LIMIT` `DEFAULT_MIGRATION_LOCK` `DEFAULT_MIGRATION_TABLE` `DEFAULT_PAGE` `DEFAULT_SEED_LOCK` `DEFAULT_SEED_TABLE` `DEFAULT_SQL_DIALECT` `KEYSET_BACKWARD_KEY` `MAX_LIMIT` `noopDatabaseLogger` `RETRYABLE_DATABASE_CODES` `SQL_IDENTIFIER_PATTERN` `SUPPORTED_ISOLATION_LEVELS`
