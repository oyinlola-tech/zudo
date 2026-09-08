/**
 * Compile-only fixture: the README examples, verbatim, typechecked by
 * `pnpm typecheck` (tsconfig.test.json). It is never executed. Update it
 * together with README.md so the documented API always compiles.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BaseRepository,
  createDatabaseClient,
  withTransaction,
  createQueryBuilder,
  toPrismaWhere,
  and,
  equals,
  isAfter,
  createMigrationRunner,
  createSeedRunner,
  isConflictError,
  isNotFoundError,
  isRetryableTransactionError,
  toDatabaseErrorInfo,
  assertDatabaseHealth,
  checkDatabaseHealth,
  createLockManager,
  type RepositoryDelegate,
} from "../src/index.js";

interface User {
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}

declare const userDelegate: RepositoryDelegate<User, string, Partial<User>, Partial<User>, Record<string, unknown>>;

// 1. Build the Prisma client with a driver adapter and hand it to the wrapper.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = createDatabaseClient({ prisma });
await client.connect();

class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }

  findByEmail(email: string) {
    return this.findOne({ email });
  }
}

const users = new UserRepository(userDelegate);
const alice = await users.create({ email: "alice@example.com", name: "Alice" });
await users.softDelete(alice.id);

await withTransaction(client, async (tx) => {
  const txUsers = users.withTransaction(tx);
  await txUsers.restore(alice.id);
  await txUsers.update(alice.id, { name: "Alice Doe" });
});

await client.disconnect();

const query = createQueryBuilder<"email" | "createdAt" | "role">()
  .where("role", "admin")
  .whereContains("email", "@example.com")
  .orderByDesc("createdAt")
  .paginate({ page: 1, limit: 20 });

const admins = await users.findByQuery(query);
void admins;

const where = toPrismaWhere(
  and(equals("role", "admin"), isAfter("createdAt", new Date("2026-01-01"))),
);
void where;

const page = await users.findPaginated(undefined, {
  pagination: { page: 2, limit: 25 },
  sort: [{ field: "createdAt", direction: "desc" }],
});
void page.meta.totalPages;

const first = await users.paginateCursor(undefined, {
  limit: 25,
  sort: [{ field: "createdAt", direction: "desc" }],
});
const next = await users.paginateCursor(undefined, {
  cursor: first.meta.nextCursor,
  limit: 25,
  sort: [{ field: "createdAt", direction: "desc" }],
});
void next;

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

await migrations.migrate();
await migrations.rollback();

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

// Errors
try {
  await users.create({ email: "alice@example.com", name: "Alice" });
} catch (error) {
  if (isConflictError(error)) {
    // 409: unique or foreign-key violation
  } else if (isNotFoundError(error)) {
    // 404
  } else if (!isRetryableTransactionError(error)) {
    console.error(toDatabaseErrorInfo(error));
  }
}

// Locks and health
declare const orderId: string;
const locks = createLockManager(client);

await locks.withAdvisoryLock("reports:nightly", async (tx) => {
  await tx.$executeRawUnsafe("REFRESH MATERIALIZED VIEW nightly_report");
}, { timeoutMs: 10_000 });

await locks.withRowLock("orders", orderId, async (tx) => {
  await tx.$executeRawUnsafe('UPDATE "orders" SET "status" = $1 WHERE "id" = $2', "paid", orderId);
}, { mode: "for-no-key-update", skipLocked: true });

const health = await checkDatabaseHealth(client, { timeoutMs: 2_000 });
void health.status;
await assertDatabaseHealth(client);

// Options that Prisma 7 configures on the driver adapter are not accepted.
// @ts-expect-error url is not a DatabaseClientOptions property
createDatabaseClient({ url: "postgresql://localhost/db" });
