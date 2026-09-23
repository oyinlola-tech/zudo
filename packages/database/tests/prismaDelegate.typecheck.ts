/**
 * Compile-only regression test, typechecked by `pnpm typecheck`
 * (tsconfig.test.json) and never executed.
 *
 * `new UserRepository(prisma.user)` must compile under strict mode with no
 * cast. Before 1.3.1 it failed with TS2345: a generated delegate's generic
 * `findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)` was
 * not assignable to `RepositoryDelegate`'s fixed argument shape.
 *
 * Two real delegate shapes are checked: the `prisma-client-js` client this
 * package generates for its `Example` model (`prisma generate` runs before
 * the build), and a fixture copied from the `prisma-client` generator.
 */
import { PrismaClient } from "@prisma/client";
import {
  BaseRepository,
  createDatabaseClient,
  withTransaction,
  type RepositoryDelegate,
} from "../src/index.js";
import type { UserDelegate } from "./helpers/prismaClientUserDelegate.fixture.js";

interface Example {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: string;
  email: string;
  name: string;
  deletedAt: Date | null;
}

class ExampleRepository extends BaseRepository<Example> {
  constructor(delegate: RepositoryDelegate<Example>) {
    super(delegate, { modelName: "Example" });
  }
}

class UserRepository extends BaseRepository<User> {
  constructor(delegate: ConstructorParameters<typeof BaseRepository<User>>[0]) {
    super(delegate, { modelName: "User", softDelete: true });
  }

  findActiveByEmail(email: string): Promise<readonly User[]> {
    return this.delegate.findMany({ where: { email, deletedAt: null } });
  }
}

declare const prisma: PrismaClient;
declare const prismaUser: UserDelegate;

const examples = new ExampleRepository(prisma.example);
const users = new UserRepository(prismaUser);
const direct: RepositoryDelegate<User> = prismaUser;
const rebound = users.withDelegate(prismaUser);

const client = createDatabaseClient({ prisma });

await withTransaction(client, async (tx) => {
  await examples.withTransaction(tx).count();
  await users.withTransaction(tx).findById("u1");
});

interface Invoice {
  id: string;
  total: number;
}

// Rows are still checked: a User delegate is not an Invoice delegate.
// @ts-expect-error - the delegate's rows are missing `total`.
const mismatched: RepositoryDelegate<Invoice> = prismaUser;

void [direct, rebound, mismatched];
