import { describe, it, expect } from "vitest";
import { DatabaseError, DatabaseOperation, ErrorCode } from "@zudojs/errors";

import {
  BaseRepository,
  DatabaseClient,
  DatabaseLockManager,
  MigrationRunner,
  createQueryBuilder,
  createRelationRegistry,
  includeRelation,
  oneToMany,
  isDatabaseErrorLike,
  mapRepositoryError,
  normalizeDatabaseError,
  resolveLockTransactionOptions,
  toDatabaseErrorInfo,
  toPrismaArgs,
  noopDatabaseLogger,
  type RepositoryDelegate,
} from "../src/index.js";
import { createStubPrisma, prismaError } from "./helpers/stubPrisma.js";

/**
 * Mimics a DatabaseError produced by a *different* copy of @zudojs/errors:
 * same shape, unrelated prototype chain.
 */
class ForeignDatabaseError extends Error {
  readonly code = ErrorCode.CONFLICT;
  readonly category = "database";
  readonly severity = "error";
  readonly statusCode = 409;
  readonly expose = true;
  readonly isOperational = true;
  readonly metadata = Object.freeze({ origin: "foreign" });
  override readonly cause = undefined;
  readonly operation = DatabaseOperation.INSERT;
  readonly databaseCode = "P2002";
  constructor() {
    super("foreign conflict");
    this.name = "DatabaseError";
  }
}

describe("structural DatabaseError detection", () => {
  it("accepts instances from this copy and from a foreign copy", () => {
    expect(isDatabaseErrorLike(new DatabaseError("x"))).toBe(true);
    expect(isDatabaseErrorLike(new ForeignDatabaseError())).toBe(true);
    expect(isDatabaseErrorLike(new Error("plain"))).toBe(false);
    expect(isDatabaseErrorLike({ category: "database", code: "ERR_X" })).toBe(false);
  });

  it("never double-wraps a foreign DatabaseError", async () => {
    const foreign = new ForeignDatabaseError();
    expect(normalizeDatabaseError(foreign, { operation: DatabaseOperation.QUERY })).toBe(foreign);
    expect(
      mapRepositoryError(foreign, { model: "User", operation: "create", durationMs: 1 }),
    ).toBe(foreign);

    const prisma = createStubPrisma();
    const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
    const runner = new MigrationRunner(client, [
      { version: 1, name: "boom", up: async () => { throw foreign; } },
    ]);
    // The runner adds migration metadata (one wrap); the foreign error is
    // the direct cause, not wrapped a second time by the client.
    const thrown = await runner.migrate().catch((error: unknown) => error);
    expect(isDatabaseErrorLike(thrown)).toBe(true);
    expect((thrown as DatabaseError).cause).toBe(foreign);
  });
});

describe("toDatabaseErrorInfo", () => {
  it("produces the serialisable DatabaseErrorInfo shape from a Prisma error", () => {
    const info = toDatabaseErrorInfo(
      prismaError("P2002", "Unique constraint failed", { target: ["email"], modelName: "User" }),
      { operation: DatabaseOperation.INSERT },
    );
    expect(info.code).toBe("P2002");
    expect(info.operation).toBe(DatabaseOperation.INSERT);
    expect(info.model).toBe("User");
    expect(info.constraint).toBe("email");
    expect(info.message).not.toContain("Unique constraint failed");
    expect(info.metadata?.["kind"]).toBe("conflict");
  });

  it("falls back to the DatabaseError code for non-Prisma failures", () => {
    const info = toDatabaseErrorInfo(new Error("plain"));
    expect(info.code).toBe(ErrorCode.DATABASE);
    expect(info.message).toBe("plain");
    expect(info.cause).toBeInstanceOf(Error);
  });
});

describe("toPrismaArgs select + include", () => {
  it("folds include into select because Prisma rejects both keys together", () => {
    const state = createQueryBuilder<"id" | "email">()
      .select("id", "email")
      .include(includeRelation("profile", { select: ["bio"] }))
      .build();
    const args = toPrismaArgs(state);
    expect(args.include).toBeUndefined();
    expect(args.select).toEqual({
      id: true,
      email: true,
      profile: { select: { bio: true } },
    });
  });

  it("keeps include alone when nothing is selected", () => {
    const args = toPrismaArgs(createQueryBuilder().include("profile").build());
    expect(args.select).toBeUndefined();
    expect(args.include).toEqual({ profile: true });
  });

  it("findByQuery honours RelationLoadOptions.depth and includeDeleted", async () => {
    const calls: unknown[] = [];
    const delegate = {
      findMany: async (args: unknown) => { calls.push(args); return []; },
    } as unknown as RepositoryDelegate<{ id: string }>;
    class Repo extends BaseRepository<{ id: string }> {}
    const registry = createRelationRegistry([
      oneToMany({ name: "posts", parent: "User", child: "Post", foreignKey: "userId", referencedKey: "id" }),
      oneToMany({ name: "comments", parent: "Post", child: "Comment", foreignKey: "postId", referencedKey: "id" }),
    ]);
    const repo = new Repo(delegate, { modelName: "User", softDelete: true, relations: registry });
    const query = createQueryBuilder().include(includeRelation("posts", { include: [includeRelation("comments")] }));

    await repo.findByQuery(query, { includeDeleted: true, depth: 2 });
    expect(calls[0]).toMatchObject({ include: { posts: { include: { comments: true } } } });

    await expect(repo.findByQuery(query, { depth: 1 })).rejects.toThrow(/depth/);
  });

  it("findByQuery hands the folded projection to the delegate", async () => {
    const calls: unknown[] = [];
    const delegate = {
      findMany: async (args: unknown) => { calls.push(args); return []; },
    } as unknown as RepositoryDelegate<{ id: string }>;
    class Repo extends BaseRepository<{ id: string }> {}
    const repo = new Repo(delegate, { modelName: "User" });
    await repo.findByQuery(createQueryBuilder<"id">().select("id").include("profile"));
    expect(calls[0]).toMatchObject({ select: { id: true, profile: true }, include: undefined });
  });
});

describe("lock timeout vs transaction timeout", () => {
  it("passes transaction options through when no lock timeout is set", () => {
    expect(resolveLockTransactionOptions({})).toBeUndefined();
    expect(resolveLockTransactionOptions({ transaction: { timeoutMs: 1 } })).toEqual({ timeoutMs: 1 });
  });

  it("raises the transaction timeout when the lock wait exceeds Prisma's 5 s default", () => {
    expect(resolveLockTransactionOptions({ timeoutMs: 1000 })).toBeUndefined();
    expect(resolveLockTransactionOptions({ timeoutMs: 8000 })).toEqual({ timeoutMs: 13000 });
    expect(
      resolveLockTransactionOptions({ timeoutMs: 8000, transaction: { maxWaitMs: 50 } }),
    ).toEqual({ maxWaitMs: 50, timeoutMs: 13000 });
  });

  it("rejects an explicit transaction timeout that is not longer than the lock timeout", () => {
    expect(() =>
      resolveLockTransactionOptions({ timeoutMs: 3000, transaction: { timeoutMs: 3000 } }),
    ).toThrow(TypeError);
    expect(() => resolveLockTransactionOptions({ timeoutMs: -1 })).toThrow(TypeError);
  });

  it("withAdvisoryLock forwards the resolved timeout to $transaction", async () => {
    const prisma = createStubPrisma({ respond: () => [{ acquired: true }] });
    const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
    const locks = new DatabaseLockManager(client);
    await locks.withAdvisoryLock("job", async () => "ok", { timeoutMs: 9000 });
    expect(prisma.transactionOptions[0]).toEqual({ timeout: 14000 });
    expect(prisma.queries.some((q) => q.sql === "SET LOCAL lock_timeout = 9000")).toBe(true);
  });
});
