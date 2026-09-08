# @zudojs/database

PostgreSQL data-access layer for Zudojs applications, built on Prisma 7: a
lifecycle-aware client, generic repositories with soft delete, a query builder
that translates to Prisma `where` clauses, managed transactions, keyset
pagination with signed cursors, migration and seed runners guarded by advisory
locks, health checks with reconnect, and a bounded in-memory cache.

## Installation

```bash
npm install @zudojs/database @prisma/client @prisma/adapter-pg
```

`@prisma/client` (`>=7 <8`) is a peer dependency. Prisma 7 connects through a
driver adapter, so you also need an adapter package for your database
(`@prisma/adapter-pg` for PostgreSQL).

## Quick Start

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BaseRepository,
  createDatabaseClient,
  withTransaction,
} from "@zudojs/database";

interface User {
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}

// 1. Build the Prisma client with a driver adapter and hand it to the wrapper.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

// 2. Repositories wrap a Prisma model delegate.
class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }

  findByEmail(email: string) {
    return this.findOne({ email });
  }
}

const users = new UserRepository(prisma.user);
const alice = await users.create({ email: "alice@example.com", name: "Alice" });
await users.softDelete(alice.id); // sets deletedAt; reads now skip the row

// 3. Transactions: rebind the repository to the transaction client.
await withTransaction(client, async (tx) => {
  const txUsers = users.withTransaction(tx);
  await txUsers.restore(alice.id);
  await txUsers.update(alice.id, { name: "Alice Doe" });
});

await client.disconnect();
```

`createDatabaseClient` accepts either a pre-built `prisma` instance or an
`adapter` (in which case it constructs the `PrismaClient` for you). It throws a
`DatabaseError` if neither is supplied.

## Querying

```typescript
import { createQueryBuilder, toPrismaWhere, and, equals, isAfter } from "@zudojs/database";

const query = createQueryBuilder<"email" | "createdAt" | "role">()
  .where("role", "admin")
  .whereContains("email", "@example.com")
  .orderByDesc("createdAt")
  .paginate({ page: 1, limit: 20 });

// Repositories consume the builder directly ...
const admins = await users.findByQuery(query);

// ... or translate the filter yourself.
const where = toPrismaWhere(
  and(equals("role", "admin"), isAfter("createdAt", new Date("2026-01-01"))),
);
```

## Pagination

```typescript
// Offset pagination
const page = await users.findPaginated(undefined, {
  pagination: { page: 2, limit: 25 },
  sort: [{ field: "createdAt", direction: "desc" }],
});
page.meta.totalPages;

// Keyset pagination with HMAC-signed cursors (set `cursorSecret` on the repository)
const first = await users.paginateCursor(undefined, {
  limit: 25,
  sort: [{ field: "createdAt", direction: "desc" }],
});
const next = await users.paginateCursor(undefined, {
  cursor: first.meta.nextCursor,
  limit: 25,
  sort: [{ field: "createdAt", direction: "desc" }],
});
```

## Migrations and seeds

```typescript
import { createMigrationRunner, createSeedRunner } from "@zudojs/database";

const migrations = createMigrationRunner(
  client,
  [
    {
      version: 1,
      name: "create-users",
      up: async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TABLE "users" ("id" TEXT PRIMARY KEY, "email" TEXT UNIQUE NOT NULL)',
        );
      },
      down: async (tx) => {
        await tx.$executeRawUnsafe('DROP TABLE "users"');
      },
    },
  ],
  { transaction: { timeoutMs: 60_000 } },
);

await migrations.migrate(); // applies pending migrations under an advisory lock
await migrations.rollback(); // reverts the most recent one

const seeds = createSeedRunner(client, [
  {
    name: "roles",
    order: 0,
    run: async (tx) => {
      await tx.$executeRawUnsafe('INSERT INTO "roles" ("name") VALUES ($1)', "admin");
    },
  },
]);
await seeds.run();
```

Each migration or seed runs in its own transaction by default
(`perItemTransaction: true`); pass `transaction: { timeoutMs, maxWaitMs, isolationLevel }`
to size it for long-running steps.

## Errors

Every failure surfaces as a `DatabaseError` from `@zudojs/errors`. Prisma codes
are mapped to `databaseCode`, an `ErrorCode` and an HTTP status (`P2002` /
`P2003` → 409, `P2025` → 404, `P2034` → retryable, `P1xxx` → 503 with a fixed
message that never includes the host name).

```typescript
import {
  isConflictError,
  isNotFoundError,
  isRetryableTransactionError,
  toDatabaseErrorInfo,
} from "@zudojs/database";

try {
  await users.create({ email: "alice@example.com", name: "Alice" });
} catch (error) {
  if (isConflictError(error)) {
    // 409: unique or foreign-key violation
  } else if (isNotFoundError(error)) {
    // 404
  } else if (!isRetryableTransactionError(error)) {
    console.error(toDatabaseErrorInfo(error)); // { code: "P2002", message, operation, ... }
  }
}
```

## Locks and health

```typescript
import { assertDatabaseHealth, checkDatabaseHealth, createLockManager } from "@zudojs/database";

const locks = createLockManager(client);

// Advisory lock (FNV-1a 64 key, transaction-scoped). `timeoutMs` becomes
// `SET LOCAL lock_timeout`; the transaction timeout is raised to cover it.
await locks.withAdvisoryLock("reports:nightly", async (tx) => {
  await tx.$executeRawUnsafe("REFRESH MATERIALIZED VIEW nightly_report");
}, { timeoutMs: 10_000 });

// Row lock: throws 404 when the row is missing, 409 when skipLocked skips it.
await locks.withRowLock("orders", orderId, async (tx) => {
  await tx.$executeRawUnsafe('UPDATE "orders" SET "status" = $1 WHERE "id" = $2', "paid", orderId);
}, { mode: "for-no-key-update", skipLocked: true });

const health = await checkDatabaseHealth(client, { timeoutMs: 2_000 });
health.status; // "healthy" | "degraded" | "unhealthy"
await assertDatabaseHealth(client); // throws DatabaseUnhealthyError with the real cause
```

## Subpath exports

| Import | Contents |
| --- | --- |
| `@zudojs/database` | Everything |
| `@zudojs/database/client` | `DatabaseClient`, `createDatabaseClient`, error helpers |
| `@zudojs/database/repositories` | `BaseRepository`, `mapRepositoryError` |
| `@zudojs/database/transactions` | `TransactionManager`, `withTransaction`, `withTransactionRetry` |

## Features

- Prisma 7 client wrapper with connection lifecycle, in-flight connect de-duplication, raw queries, and typed error normalisation (Prisma `P*` codes mapped to conflict / not-found / timeout / connection outcomes)
- `BaseRepository` with CRUD, `createMany` / `deleteMany`, soft delete (`softDelete`, `restore`, `findDeleted`, `withDeleted`), transaction rebinding (`withTransaction`), and `findByQuery`
- Query builder and 40 filter helpers that translate to Prisma `where` / `orderBy` / `select` / `include`
- Managed transactions with context, error enrichment, and `withTransactionRetry` (serialization failures retried by default)
- Offset pagination and keyset pagination with HMAC-signed, shape-validated cursors
- Migration and seed runners using PostgreSQL advisory locks, per-item transactions, and BIGINT versioning
- Advisory and row locks with `lock_timeout`, `SKIP LOCKED` / `NOWAIT`, and namespaced keys
- Health and readiness probes with timeouts; connection manager with overlap-guarded scheduled checks and reconnect back-off
- Bounded in-memory LRU cache with TTL, periodic pruning, and loader coalescing
- Relation definitions with a registry and `toPrismaInclude` (depth and cycle guarded)

## Limitations

- PostgreSQL only. Migration, seed, and lock helpers emit PostgreSQL SQL; other dialects throw `UnsupportedDialectError`.
- No savepoints or nested transactions. Prisma interactive transactions are used as-is.
- Connection pooling is handled by the driver adapter, not by this package.
- `timeoutMs` and `signal` on repository operations are client-side only; the database query is not cancelled server-side.
- The cache is not transaction-aware. Do not populate it from inside a transaction that may roll back.

## Use Cases

- Data access layer for Zudojs services
- Transaction coordination across repositories (rebind with `withTransaction`)
- Database migrations and seeding with single-runner guarantees
- Health endpoints and readiness gating
