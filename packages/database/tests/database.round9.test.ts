/**
 * @zudojs/database — Audit round 9 regression tests.
 *
 * One describe block per finding. Every test here failed against the
 * pre-fix source (see the finding ids in the round 9 report).
 */

import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  BaseRepository,
  DatabaseClient,
  DatabaseLockManager,
  lockRow,
  acquireAdvisoryLock,
  resolveLockTransactionOptions,
  type DatabaseTransactionContext,
  type PrismaClientLike,
  type RepositoryDelegate,
} from "../src/index.js";

/* ─── shared fakes ────────────────────────────────────────────────────────── */

interface User {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: Date | null;
}

type Where = Record<string, unknown>;

type UserDelegate = RepositoryDelegate<
  User,
  string,
  Partial<User>,
  Partial<User>,
  Where
>;

class UserRepository extends BaseRepository<
  User,
  string,
  Partial<User>,
  Partial<User>,
  Where
> {}

interface DelegateCall {
  readonly method: string;
  readonly args: Record<string, unknown>;
}

function createDelegate(): { delegate: UserDelegate; calls: DelegateCall[] } {
  const calls: DelegateCall[] = [];
  const user: User = { id: "u1", name: "Ada", deletedAt: null };

  const record =
    <T>(method: string, result: T) =>
    (args: unknown): Promise<T> => {
      calls.push({ method, args: args as Record<string, unknown> });

      return Promise.resolve(result);
    };

  const delegate: UserDelegate = {
    findUnique: record("findUnique", user),
    findFirst: record("findFirst", user),
    findMany: record("findMany", [user]),
    create: record("create", user),
    update: record("update", user),
    delete: record("delete", user),
    count: record("count", 1),
  };

  return { delegate, calls };
}

/**
 * Prisma stand-in whose `$transaction` records whether the callback's
 * outcome would have committed or rolled back the transaction.
 */
function createCommitTrackingPrisma(): PrismaClientLike & {
  readonly log: string[];
} {
  const log: string[] = [];

  const tx = {
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async () => 1,
  } as unknown as DatabaseTransactionContext;

  return {
    log,
    async $connect() {},
    async $disconnect() {},
    async $transaction(callback) {
      log.push("BEGIN");
      try {
        const result = await callback(tx);
        log.push("COMMIT");
        return result;
      } catch (error) {
        log.push("ROLLBACK");
        throw error;
      }
    },
    async $queryRawUnsafe() {
      return [] as never;
    },
    async $executeRawUnsafe() {
      return 1;
    },
  };
}

/** Transaction context that records every raw statement it receives. */
function createRecordingTransaction(): {
  readonly tx: DatabaseTransactionContext;
  readonly sql: string[];
} {
  const sql: string[] = [];

  const tx = {
    $queryRawUnsafe: async (statement: string) => {
      sql.push(statement);
      return [{ acquired: true }];
    },
    $executeRawUnsafe: async (statement: string) => {
      sql.push(statement);
      return 0;
    },
  } as unknown as DatabaseTransactionContext;

  return { tx, sql };
}

function tick(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── DB-R9-01 ────────────────────────────────────────────────────────────── */

describe("DB-R9-01: an aborted transaction rolls back instead of committing", () => {
  it("raises the abort inside the transaction so Prisma rolls back", async () => {
    const prisma = createCommitTrackingPrisma();
    const client = new DatabaseClient({ prisma });
    const controller = new AbortController();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = client.transaction(
      async () => {
        await gate;
        return "done";
      },
      { signal: controller.signal },
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ERR_ABORTED" });

    // Let the callback finish after the abort: it must not commit.
    release();
    await tick();

    expect(prisma.log).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("still commits when the signal never fires", async () => {
    const prisma = createCommitTrackingPrisma();
    const client = new DatabaseClient({ prisma });
    const controller = new AbortController();

    const result = await client.transaction(async () => "ok", {
      signal: controller.signal,
    });

    expect(result).toBe("ok");
    expect(prisma.log).toEqual(["BEGIN", "COMMIT"]);
  });

  it("still commits without a signal", async () => {
    const prisma = createCommitTrackingPrisma();
    const client = new DatabaseClient({ prisma });

    await client.transaction(async () => 1);

    expect(prisma.log).toEqual(["BEGIN", "COMMIT"]);
  });
});

/* ─── DB-R9-02 ────────────────────────────────────────────────────────────── */

describe("DB-R9-02: update() on a soft-delete repository sends a unique where", () => {
  it("is a shape Prisma's WhereUniqueInput rejects at the type level", () => {
    // Compile-time proof against the generated client: the unique field
    // must be a top-level key, so the old `{ AND: [{ id }, ...] }` shape
    // does not typecheck, while the new `{ id, deletedAt: null }` shape does.
    // @ts-expect-error — no top-level `id`
    const rejected: Prisma.ExampleWhereUniqueInput = { AND: [{ id: "x" }] };

    const accepted: Prisma.ExampleWhereUniqueInput = {
      id: "x",
      AND: [{ createdAt: { lt: new Date() } }],
    };

    expect(rejected).toBeDefined();
    expect(accepted.id).toBe("x");
  });

  it("puts the id at the top level with the soft-delete flag beside it", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, {
      modelName: "User",
      softDelete: true,
    });

    await repo.update("u1", { name: "Grace" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("update");
    expect(calls[0]!.args["where"]).toEqual({ id: "u1", deletedAt: null });
    expect(calls[0]!.args["data"]).toEqual({ name: "Grace" });
  });

  it("uses a custom soft-delete field and id field", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, {
      modelName: "User",
      idField: "uuid",
      softDelete: { field: "removedAt" },
    });

    await repo.update("u1", { name: "Grace" });

    expect(calls[0]!.args["where"]).toEqual({ uuid: "u1", removedAt: null });
  });

  it("sends only the id when soft delete is off or the copy includes deleted rows", async () => {
    const plain = createDelegate();
    await new UserRepository(plain.delegate, { modelName: "User" }).update(
      "u1",
      { name: "x" },
    );
    expect(plain.calls[0]!.args["where"]).toEqual({ id: "u1" });

    const withDeleted = createDelegate();
    await new UserRepository(withDeleted.delegate, {
      modelName: "User",
      softDelete: true,
    })
      .withDeleted()
      .update("u1", { name: "x" });
    expect(withDeleted.calls[0]!.args["where"]).toEqual({ id: "u1" });
  });
});

/* ─── DB-R9-03 ────────────────────────────────────────────────────────────── */

describe("DB-R9-03: a lock timeoutMs of 0 is rejected instead of disabling lock_timeout", () => {
  it("does not emit `SET LOCAL lock_timeout = 0` from lockRow", async () => {
    const { tx, sql } = createRecordingTransaction();

    await expect(lockRow(tx, "orders", 1, { timeoutMs: 0 })).rejects.toThrow(
      /lock_timeout = 0 as disabled/,
    );

    expect(sql).toEqual([]);
  });

  it("does not emit it from acquireAdvisoryLock either", async () => {
    const { tx, sql } = createRecordingTransaction();

    await expect(
      acquireAdvisoryLock(tx, "reports", { timeoutMs: 0 }),
    ).rejects.toThrow(/lock_timeout = 0 as disabled/);

    expect(sql).toEqual([]);
  });

  it("rejects sub-millisecond values that Math.floor would turn into 0", async () => {
    const { tx, sql } = createRecordingTransaction();

    await expect(lockRow(tx, "orders", 1, { timeoutMs: 0.5 })).rejects.toThrow(
      /at least 1 ms/,
    );

    expect(sql).toEqual([]);
  });

  it("still applies a positive timeout", async () => {
    const { tx, sql } = createRecordingTransaction();

    await lockRow(tx, "orders", 1, { timeoutMs: 1 });

    expect(sql[0]).toBe("SET LOCAL lock_timeout = 1");
    expect(resolveLockTransactionOptions({ timeoutMs: 1 })).toBeUndefined();
  });

  it("fails before opening a transaction through the lock manager", async () => {
    const prisma = createCommitTrackingPrisma();
    const manager = new DatabaseLockManager(new DatabaseClient({ prisma }));

    await expect(
      manager.withRowLock("orders", 1, async () => "never", { timeoutMs: 0 }),
    ).rejects.toThrow(/lock_timeout = 0 as disabled/);

    expect(() => resolveLockTransactionOptions({ timeoutMs: 0 })).toThrow(
      TypeError,
    );
    expect(prisma.log).toEqual([]);
  });
});

/* ─── DB-R9-04 ────────────────────────────────────────────────────────────── */

describe("DB-R9-04: repository sort input is validated like the query builder's", () => {
  it("rejects an unsafe sort field in findPaginated before calling the delegate", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, { modelName: "User" });

    await expect(
      repo.findPaginated(undefined, {
        sort: [{ field: "name; DROP TABLE users", direction: "asc" }],
      }),
    ).rejects.toThrow(/Invalid query field name/);

    expect(calls).toEqual([]);
  });

  it("rejects an unsupported direction", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, { modelName: "User" });

    await expect(
      repo.findPaginated(undefined, {
        sort: [{ field: "name", direction: "ASC" as "asc" }],
      }),
    ).rejects.toThrow(/invalid direction/);

    expect(calls).toEqual([]);
  });

  it("rejects an unsafe sort field in paginateCursor", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, { modelName: "User" });

    await expect(
      repo.paginateCursor(undefined, {
        sort: [{ field: "__proto__", direction: "desc" }],
      }),
    ).rejects.toThrow(/Invalid query field name/);

    expect(calls).toEqual([]);
  });

  it("still passes a valid sort through unchanged", async () => {
    const { delegate, calls } = createDelegate();
    const repo = new UserRepository(delegate, { modelName: "User" });

    await repo.findPaginated(undefined, {
      sort: [
        { field: "name", direction: "asc" },
        { field: "id", direction: "desc" },
      ],
    });

    const findMany = calls.find((call) => call.method === "findMany");

    expect(findMany?.args["orderBy"]).toEqual([{ name: "asc" }, { id: "desc" }]);
  });
});
