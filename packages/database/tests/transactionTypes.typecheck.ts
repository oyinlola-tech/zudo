/**
 * Compile-only regression test, typechecked by `pnpm typecheck`
 * (tsconfig.test.json) and never executed.
 *
 * Up to 1.3.2 `DatabaseTransactionContext` was `Prisma.TransactionClient`
 * imported from `@prisma/client`. With Prisma 7's `prisma-client` generator
 * the client is generated into the application, so that import failed
 * (TS2307/TS2305 under `skipLibCheck: false`) or silently made every
 * transaction callback's `tx` `any` (`skipLibCheck: true`).
 *
 * The transaction client is now inferred from the client passed to
 * `createDatabaseClient({ prisma })`. `PrismaClient` below is the shape the
 * `prisma-client` generator emits, so `tx` must be its own
 * `Omit<PrismaClient, ITXClientDenyList>`, not `any`.
 */
import { expectTypeOf } from "vitest";
import type * as runtime from "@prisma/client/runtime/client";

import {
  createDatabase,
  createDatabaseClient,
  createLockManager,
  createSeedRunner,
  createTransactionManager,
  createUnitOfWork,
  withTransaction,
  type DatabaseClient,
  type DatabaseTransactionContext,
  type TransactionClientOf,
} from "../src/index.js";
import type { PrismaClient, TransactionClient } from "./helpers/prismaClient.fixture.js";
import { createStubPrisma } from "./helpers/stubPrisma.js";

declare const prisma: PrismaClient;
declare const query: runtime.Sql;

const client = createDatabaseClient({ prisma });
expectTypeOf(client).toEqualTypeOf<DatabaseClient<TransactionClient>>();
expectTypeOf<TransactionClientOf<PrismaClient>>().toEqualTypeOf<TransactionClient>();

const user = await client.transaction(async (tx) => {
  expectTypeOf(tx).not.toBeAny();
  expectTypeOf(tx).toEqualTypeOf<TransactionClient>();
  // @ts-expect-error - `name` is a string column.
  await tx.user.create({ data: { email: "b@example.com", name: 42 } });
  // @ts-expect-error - the client has no `post` model.
  await tx.post.findMany();
  return tx.user.create({ data: { email: "a@example.com", name: "A" } });
});
expectTypeOf(user).toEqualTypeOf<{
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}>();

await withTransaction(client, async (tx) => {
  expectTypeOf(tx).toEqualTypeOf<TransactionClient>();
});
await createTransactionManager(client).execute(async (tx) => tx.user.count());
await createUnitOfWork(client).execute(async (tx) => tx.user.count());
await createDatabase(client).transaction(async (tx) => tx.user.count());
await createDatabase({ prisma }).transaction(async (tx) => tx.user.count());
await createLockManager(client).withAdvisoryLock("k", async (tx) => tx.user.count());
await createSeedRunner(client, [
  { name: "users", run: async (tx) => void (await tx.user.count()) },
]).run();
await client.executeRaw(query);

// Callbacks written against the structural base type still compile, and a
// typed client is still a plain `DatabaseClient`.
const raw = async (tx: DatabaseTransactionContext) => tx.$executeRawUnsafe("SELECT 1");
await client.transaction(raw);
const stored: DatabaseClient = client;

// Without a readable client type the structural base is used, never `any`.
const stubbed = createDatabaseClient({ prisma: createStubPrisma() });
expectTypeOf(stubbed).toEqualTypeOf<DatabaseClient>();
await createDatabaseClient().transaction(async (tx) => {
  expectTypeOf(tx).toEqualTypeOf<DatabaseTransactionContext>();
  // @ts-expect-error - no model delegates without a client type.
  void tx.user;
});
await createDatabaseClient<PrismaClient>().transaction(async (tx) => tx.user.count());

void stored;
