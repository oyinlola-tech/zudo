import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DomainError,
  NotFoundError,
  ValidationError,
  isDatabaseError,
} from "@zudojs/errors";

import {
  BaseRepository,
  DatabaseClient,
  DatabaseConnectionManager,
  createUnitOfWork,
  decodeCursor,
  encodeCursor,
  getTransactionContextFromError,
  withTransaction,
  type DatabaseLogger,
  type RepositoryDelegate,
} from "../src/index.js";
import { createStubPrisma, prismaError } from "./helpers/stubPrisma.js";

function recordingLogger(): DatabaseLogger & { readonly errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (message: string) => {
      errors.push(message);
    },
  };
}

function setup() {
  const prisma = createStubPrisma();
  const logger = recordingLogger();
  const client = new DatabaseClient({ prisma, logger });
  return { prisma, client, logger };
}

describe("withTransaction: caller errors propagate unchanged", () => {
  it("rethrows a NotFoundError thrown by the callback as the same instance", async () => {
    const { client, logger } = setup();
    const notFound = new NotFoundError("Order not found.");

    const caught = await withTransaction(client, async () => {
      throw notFound;
    }).catch((error: unknown) => error);

    expect(caught).toBe(notFound);
    expect((caught as NotFoundError).statusCode).toBe(404);
    expect(isDatabaseError(caught)).toBe(false);
    expect(logger.errors).toEqual([]);
  });

  it("rethrows domain errors from DatabaseClient.transaction and units of work", async () => {
    const { client, logger } = setup();
    const domain = new DomainError("Insufficient balance.");

    await expect(
      client.transaction(async () => {
        throw domain;
      }),
    ).rejects.toBe(domain);

    await expect(
      createUnitOfWork(client).execute(async () => {
        throw domain;
      }),
    ).rejects.toBe(domain);

    expect(logger.errors).toEqual([]);
  });

  it("still normalises and logs driver failures", async () => {
    const { client, logger } = setup();

    const caught = await withTransaction(client, async () => {
      throw prismaError("P2002", "Unique constraint failed", { target: ["email"] });
    }).catch((error: unknown) => error);

    expect(isDatabaseError(caught)).toBe(true);
    expect((caught as { statusCode: number }).statusCode).toBe(409);
    expect(getTransactionContextFromError(caught)?.status).toBe("failed");
    expect(logger.errors).toHaveLength(1);
  });

  it("rolls back: the callback error reaches Prisma's $transaction", async () => {
    const { client, prisma } = setup();
    const seen: unknown[] = [];
    const original = prisma.$transaction.bind(prisma) as (
      cb: (tx: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    (prisma as { $transaction: unknown }).$transaction = async (
      cb: (tx: unknown) => Promise<unknown>,
    ) =>
      original(cb).catch((error: unknown) => {
        seen.push(error);
        throw error;
      });
    const notFound = new NotFoundError("gone");

    await expect(
      withTransaction(client, async () => {
        throw notFound;
      }),
    ).rejects.toBe(notFound);
    expect(seen).toEqual([notFound]);
  });
});

interface Row {
  readonly id: string;
  readonly age: number;
}

class RowRepository extends BaseRepository<Row, string, Partial<Row>, Partial<Row>> {}

function rowDelegate(
  pages: readonly (readonly Row[])[],
): { delegate: RepositoryDelegate<Row>; calls: unknown[] } {
  const calls: unknown[] = [];
  let index = 0;
  const unused = () => Promise.reject(new Error("unused"));
  const delegate = {
    findUnique: unused,
    findFirst: unused,
    create: unused,
    update: unused,
    delete: unused,
    count: unused,
    findMany: async (args: unknown) => {
      calls.push(args);
      return pages[index++] ?? [];
    },
  } as unknown as RepositoryDelegate<Row>;
  return { delegate, calls };
}

describe("paginateCursor: previousCursor and forged cursors", () => {
  const sort = [{ field: "age", direction: "asc" }] as const;

  it("sets previousCursor on a page requested with a cursor and pages backward with it", async () => {
    const all: Row[] = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `r${n}`, age: n }));
    const { delegate, calls } = rowDelegate([
      all.slice(0, 3),
      all.slice(2, 5),
      all.slice(4, 6),
      [all[3]!, all[2]!, all[1]!],
    ]);
    const repo = new RowRepository(delegate, { modelName: "Row", cursorSecret: "k" });
    const page = (cursor?: string) =>
      repo.paginateCursor(undefined, { limit: 2, sort: [...sort], cursor });

    const first = await page();
    expect(first.meta.previousCursor).toBeUndefined();
    expect(first.meta.hasPreviousPage).toBe(false);

    const second = await page(first.meta.nextCursor);
    const third = await page(second.meta.nextCursor);
    expect(third.data.map((row) => row.id)).toEqual(["r5", "r6"]);
    expect(third.meta.hasPreviousPage).toBe(true);
    expect(third.meta.hasNextPage).toBe(false);
    expect(decodeCursor(third.meta.previousCursor!, { secret: "k" })).toEqual({
      age: 5,
      id: "r5",
      $before: true,
    });

    const back = await page(third.meta.previousCursor);
    expect(calls[3]).toEqual({
      where: {
        OR: [
          { age: { lt: 5 } },
          { AND: [{ age: { equals: 5 } }, { id: { lt: "r5" } }] },
        ],
      },
      take: 3,
      orderBy: [{ age: "desc" }, { id: "desc" }],
    });
    expect(back.data.map((row) => row.id)).toEqual(["r3", "r4"]);
    expect(back.meta.hasPreviousPage).toBe(true);
    expect(back.meta.hasNextPage).toBe(true);
    expect(decodeCursor(back.meta.nextCursor!, { secret: "k" })).toEqual({
      age: 4,
      id: "r4",
    });
    expect(decodeCursor(back.meta.previousCursor!, { secret: "k" })).toEqual({
      age: 3,
      id: "r3",
      $before: true,
    });
  });

  it("rejects a forged cursor with a 400 ValidationError before querying", async () => {
    const { delegate, calls } = rowDelegate([]);
    const repo = new RowRepository(delegate, { modelName: "Row", cursorSecret: "k" });

    for (const cursor of [
      "definitely-not-a-cursor",
      encodeCursor({ age: 1, id: "r1" }),
      encodeCursor({ age: 1, id: "r1", role: "admin" }, { secret: "k" }),
      encodeCursor({ age: 1, id: "r1", $before: "yes" }, { secret: "k" }),
      `${Buffer.from("{not json").toString("base64url")}`,
    ]) {
      const error = await repo
        .paginateCursor(undefined, { cursor, sort: [...sort] })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).statusCode).toBe(400);
      expect((error as ValidationError).expose).toBe(true);
      expect((error as ValidationError).message).not.toContain("admin");
    }
    expect(calls).toHaveLength(0);
  });
});

describe("DatabaseConnectionManager reconnect backoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failingManager() {
    const prisma = createStubPrisma({
      respond: () => {
        throw prismaError("P1001", "down");
      },
    });
    const client = new DatabaseClient({ prisma, logger: recordingLogger() });
    const manager = new DatabaseConnectionManager({
      client,
      healthCheckTimeoutMs: 50,
      reconnect: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 60_000 },
    });
    return { prisma, manager };
  }

  it("keeps the process alive during the backoff wait and cancels it on disconnect", async () => {
    const { prisma, manager } = failingManager();
    await manager.connect();
    let connectAttempts = 0;
    prisma.$connect = async () => {
      connectAttempts += 1;
      throw prismaError("P1001", "down");
    };

    const timers: NodeJS.Timeout[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: () => void,
      ms?: number,
    ) => {
      const timer = realSetTimeout(handler, ms);
      if (ms === 60_000) timers.push(timer);
      return timer;
    }) as typeof setTimeout);

    const check = manager.runScheduledHealthCheck();
    while (timers.length === 0) await new Promise((r) => setImmediate(r));

    expect(timers[0]!.hasRef()).toBe(true);
    expect(connectAttempts).toBe(1);

    const started = Date.now();
    await manager.disconnect();
    await check;
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(connectAttempts).toBe(1);
  });
});
