import { describe, it, expect, vi } from "vitest";
import { DatabaseError, DatabaseOperation, ErrorCode } from "@zudojs/errors";

import {
  BaseRepository,
  createQueryBuilder,
  createRelationRegistry,
  decodeCursor,
  encodeCursor,
  equals,
  greaterThan,
  manyToOne,
  oneToMany,
  or,
  toPrismaWhere,
  type RepositoryDelegate,
  type BaseRepositoryOptions,
} from "../src/index.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly age: number;
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

interface Call {
  readonly method: string;
  readonly args: unknown;
}

function createDelegate(
  overrides: Partial<UserDelegate> = {},
  rows: readonly User[] = [],
): { delegate: UserDelegate; calls: Call[] } {
  const calls: Call[] = [];

  const record =
    <T>(method: string, result: T) =>
    (args: unknown): Promise<T> => {
      calls.push({ method, args });

      return Promise.resolve(result);
    };

  const user: User = { id: "u1", name: "Ada", age: 36, deletedAt: null };

  const delegate: UserDelegate = {
    findUnique: record("findUnique", user),
    findFirst: record("findFirst", user),
    findMany: record("findMany", rows),
    create: record("create", user),
    update: record("update", user),
    delete: record("delete", user),
    count: record("count", rows.length),
    upsert: record("upsert", user),
    createMany: record("createMany", { count: 2 }),
    deleteMany: record("deleteMany", { count: 3 }),
    ...overrides,
  };

  return { delegate, calls };
}

class UserRepository extends BaseRepository<
  User,
  string,
  Partial<User>,
  Partial<User>,
  Where
> {
  constructor(delegate: UserDelegate, options: BaseRepositoryOptions = {}) {
    super(delegate, { modelName: "User", ...options });
  }
}

async function captureError(promise: Promise<unknown>): Promise<DatabaseError> {
  try {
    await promise;
  } catch (error) {
    return error as DatabaseError;
  }

  throw new Error("Expected the operation to reject.");
}

function prismaError(code: string, meta?: Record<string, unknown>): Error {
  const error = new Error(`Prisma ${code}`) as Error & {
    code: string;
    meta?: Record<string, unknown>;
  };

  error.code = code;

  error.meta = meta;

  return error;
}

describe("BaseRepository", () => {
  it("findById uses findUnique with the configured id field", async () => {
    const { delegate, calls } = createDelegate();

    const repo = new UserRepository(delegate, { idField: "uuid" });

    await repo.findById("u1");

    expect(calls[0]).toEqual({
      method: "findUnique",
      args: { where: { uuid: "u1" } },
    });
  });

  it("rejects invalid ids and filters", async () => {
    const repo = new UserRepository(createDelegate().delegate);

    await expect(repo.findById("  ")).rejects.toBeInstanceOf(DatabaseError);

    await expect(repo.findOne(null as unknown as Where)).rejects.toThrow(
      /filter is required/,
    );

    await expect(
      repo.upsert(null as unknown as Where, { name: "x" }, { name: "y" }),
    ).rejects.toThrow(/filter is required/);
  });

  it("exists counts rather than fetching a row", async () => {
    const { delegate, calls } = createDelegate({
      count: () => Promise.resolve(1),
    });

    const repo = new UserRepository(delegate);

    await expect(repo.exists({ name: "Ada" })).resolves.toBe(true);

    expect(calls).toHaveLength(0);
  });

  describe("findPaginated", () => {
    it("normalizes NaN / Infinity page and limit", async () => {
      const { delegate, calls } = createDelegate({}, []);

      const repo = new UserRepository(delegate);

      const result = await repo.findPaginated(undefined, {
        pagination: { page: Number("abc"), limit: Number.POSITIVE_INFINITY },
      });

      const findMany = calls.find((call) => call.method === "findMany");

      expect(findMany?.args).toMatchObject({ skip: 0, take: 20 });

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(Number.isNaN(result.meta.totalPages)).toBe(false);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it("paginate is an alias of findPaginated", async () => {
      const { delegate } = createDelegate({}, []);

      const repo = new UserRepository(delegate);

      const result = await repo.paginate(undefined, {
        pagination: { page: 2, limit: 5 },
      });

      expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 0 });
    });
  });

  describe("soft delete", () => {
    const filterOf = (call: Call | undefined): unknown =>
      (call?.args as { where?: unknown } | undefined)?.where;

    it("scopes findById, findOne, findMany, count, exists, update and findPaginated", async () => {
      const { delegate, calls } = createDelegate({
        count: (args) => {
          calls.push({ method: "count", args });

          return Promise.resolve(0);
        },
      });

      const repo = new UserRepository(delegate, { softDelete: true });

      await repo.findById("u1");
      expect(calls.at(-1)?.method).toBe("findFirst");
      expect(filterOf(calls.at(-1))).toEqual({
        AND: [{ id: "u1" }, { deletedAt: null }],
      });

      await repo.findOne({ name: "Ada" });
      expect(filterOf(calls.at(-1))).toEqual({
        AND: [{ name: "Ada" }, { deletedAt: null }],
      });

      await repo.findMany();
      expect(filterOf(calls.at(-1))).toEqual({ deletedAt: null });

      await repo.count({ age: 1 });
      expect(filterOf(calls.at(-1))).toEqual({
        AND: [{ age: 1 }, { deletedAt: null }],
      });

      await repo.exists({ age: 1 });
      expect(calls.at(-1)?.method).toBe("count");
      expect(filterOf(calls.at(-1))).toEqual({
        AND: [{ age: 1 }, { deletedAt: null }],
      });

      // `update` takes a WhereUniqueInput: the id must stay a top-level key
      // (see DB-R9-02), so the soft-delete flag sits beside it, not in AND.
      await repo.update("u1", { name: "B" });
      expect(filterOf(calls.at(-1))).toEqual({ id: "u1", deletedAt: null });

      await repo.findPaginated({ age: 2 });
      const paginated = calls.filter((call) => call.method === "findMany");
      expect(filterOf(paginated.at(-1))).toEqual({
        AND: [{ age: 2 }, { deletedAt: null }],
      });
    });

    it("softDelete, restore and findDeleted use the configured field", async () => {
      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate, {
        softDelete: { field: "removedAt" },
      });

      await repo.softDelete("u1");
      const softDelete = calls.at(-1)?.args as {
        where: unknown;
        data: Record<string, unknown>;
      };
      expect(softDelete.where).toEqual({ id: "u1", removedAt: null });
      expect(softDelete.data["removedAt"]).toBeInstanceOf(Date);

      await repo.restore("u1");
      expect(calls.at(-1)?.args).toEqual({
        where: { id: "u1", removedAt: { not: null } },
        data: { removedAt: null },
      });

      await repo.findDeleted({ age: 1 });
      expect(filterOf(calls.at(-1))).toEqual({
        AND: [{ age: 1 }, { removedAt: { not: null } }],
      });
    });

    it("withDeleted lifts the scope without mutating the original", async () => {
      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate, { softDelete: true });

      await repo.withDeleted().findMany();
      expect(filterOf(calls.at(-1))).toBeUndefined();

      await repo.findMany();
      expect(filterOf(calls.at(-1))).toEqual({ deletedAt: null });
    });

    it("soft-delete operations require the option", async () => {
      const repo = new UserRepository(createDelegate().delegate);

      await expect(repo.softDelete("u1")).rejects.toThrow(/softDelete option/);
      await expect(repo.restore("u1")).rejects.toThrow(/softDelete option/);
      await expect(repo.findDeleted()).rejects.toThrow(/softDelete option/);
    });
  });

  describe("bulk operations", () => {
    it("createMany and deleteMany return counts", async () => {
      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate);

      await expect(
        repo.createMany([{ name: "a" }, { name: "b" }]),
      ).resolves.toBe(2);

      expect(calls.at(-1)).toEqual({
        method: "createMany",
        args: { data: [{ name: "a" }, { name: "b" }] },
      });

      await expect(repo.deleteMany({ age: 1 })).resolves.toBe(3);

      expect(calls.at(-1)).toEqual({
        method: "deleteMany",
        args: { where: { age: 1 } },
      });
    });

    it("createMany with no inputs short-circuits; unsupported delegates throw", async () => {
      const { delegate, calls } = createDelegate({
        createMany: undefined,
        deleteMany: undefined,
      });

      const repo = new UserRepository(delegate);

      await expect(repo.createMany([])).resolves.toBe(0);
      expect(calls).toHaveLength(0);

      await expect(repo.createMany([{ name: "a" }])).rejects.toThrow(
        /createMany is not supported/,
      );

      await expect(repo.deleteMany({})).rejects.toThrow(
        /deleteMany is not supported/,
      );
    });
  });

  describe("paginateCursor", () => {
    const rows: User[] = [
      { id: "u1", name: "A", age: 1, deletedAt: null },
      { id: "u2", name: "B", age: 2, deletedAt: null },
      { id: "u3", name: "C", age: 3, deletedAt: null },
    ];

    it("fetches limit + 1 rows, derives nextCursor and appends the id tiebreaker", async () => {
      const { delegate, calls } = createDelegate({}, rows);

      const repo = new UserRepository(delegate, { cursorSecret: "s3cret" });

      const page = await repo.paginateCursor(undefined, {
        limit: 2,
        sort: [{ field: "age", direction: "desc" }],
      });

      expect(calls[0]?.args).toEqual({
        where: undefined,
        take: 3,
        orderBy: [{ age: "desc" }, { id: "desc" }],
      });

      expect(page.data).toHaveLength(2);
      expect(page.meta.hasNextPage).toBe(true);
      expect(page.meta.hasPreviousPage).toBe(false);
      expect(page.meta.nextCursor).toBeDefined();

      expect(
        decodeCursor(page.meta.nextCursor!, { secret: "s3cret" }),
      ).toEqual({ age: 2, id: "u2" });
    });

    it("applies the keyset where for the next page", async () => {
      const { delegate, calls } = createDelegate({}, rows.slice(2));

      const repo = new UserRepository(delegate, { cursorSecret: "s3cret" });

      const cursor = encodeCursor({ age: 2, id: "u2" }, { secret: "s3cret" });

      const page = await repo.paginateCursor(
        { name: { not: "" } },
        { cursor, limit: 2, sort: [{ field: "age", direction: "desc" }] },
      );

      expect(calls[0]?.args).toEqual({
        where: {
          AND: [
            { name: { not: "" } },
            {
              OR: [
                { age: { lt: 2 } },
                { AND: [{ age: { equals: 2 } }, { id: { lt: "u2" } }] },
              ],
            },
          ],
        },
        take: 3,
        orderBy: [{ age: "desc" }, { id: "desc" }],
      });

      expect(page.meta.hasNextPage).toBe(false);
      expect(page.meta.hasPreviousPage).toBe(true);
      expect(page.meta.nextCursor).toBeUndefined();
    });

    it("rejects forged, unsigned and field-injecting cursors", async () => {
      const { delegate, calls } = createDelegate({}, rows);

      const repo = new UserRepository(delegate, { cursorSecret: "s3cret" });

      const unsigned = encodeCursor({ age: 2, id: "u2" });

      await expect(
        repo.paginateCursor(undefined, { cursor: unsigned }),
      ).rejects.toThrow(/cursor signature/);

      const tampered = encodeCursor(
        { id: "u2", passwordHash: { not: null } },
        { secret: "s3cret" },
      );

      await expect(
        repo.paginateCursor(undefined, { cursor: tampered }),
      ).rejects.toThrow(/unexpected field/);

      const wrongSecret = encodeCursor({ id: "u2" }, { secret: "other" });

      await expect(
        repo.paginateCursor(undefined, { cursor: wrongSecret }),
      ).rejects.toThrow(/cursor signature/);

      expect(calls).toHaveLength(0);
    });

    it("validates payload shape even without a secret", async () => {
      const repo = new UserRepository(createDelegate({}, rows).delegate);

      await expect(
        repo.paginateCursor(undefined, {
          cursor: encodeCursor({ id: "u1", role: "admin" }),
        }),
      ).rejects.toThrow(/unexpected field "role"/);

      await expect(
        repo.paginateCursor(undefined, { cursor: encodeCursor(["u1"]) }),
      ).rejects.toThrow(/must be an object/);
    });
  });

  describe("findByQuery / toPrismaWhere", () => {
    it("applies filter, sort, select, pagination and the soft-delete scope", async () => {
      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate, { softDelete: true });

      const query = createQueryBuilder<"name" | "age" | "id">()
        .where("name", "Ada")
        .whereGreaterThan("age", 18)
        .orderByDesc("age")
        .select("id", "name")
        .page(2)
        .limit(10);

      await repo.findByQuery(query);

      expect(calls[0]?.args).toEqual({
        where: {
          AND: [{ name: { equals: "Ada" }, age: { gt: 18 } }, { deletedAt: null }],
        },
        skip: 10,
        take: 10,
        orderBy: [{ age: "desc" }],
        select: { id: true, name: true },
        include: undefined,
      });
    });

    it("accepts a built state and validates includes through the registry", async () => {
      const registry = createRelationRegistry([
        oneToMany({
          name: "posts",
          parent: "User",
          child: "Post",
          foreignKey: "authorId",
          referencedKey: "id",
        }),
        manyToOne({
          name: "author",
          parent: "Post",
          child: "User",
          foreignKey: "authorId",
          referencedKey: "id",
        }),
      ]);

      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate, {
        softDelete: true,
        relations: registry,
      });

      const state = createQueryBuilder().include("posts").offset(5).build();

      await repo.findByQuery(state);

      expect(calls[0]?.args).toMatchObject({
        skip: 5,
        include: { posts: { where: { deletedAt: null } } },
      });

      await expect(
        repo.findByQuery(createQueryBuilder().include("comments")),
      ).rejects.toThrow(/not registered/);
    });

    it("toPrismaWhere translates nested groups, isNull and relation operators", () => {
      const where = toPrismaWhere(
        or(equals("role", "admin"), greaterThan("age", 65)),
      );

      expect(where).toEqual({
        OR: [{ role: { equals: "admin" } }, { age: { gt: 65 } }],
      });
    });
  });

  describe("withTransaction", () => {
    it("rebinds to the transaction client's delegate", async () => {
      const root = createDelegate();

      const tx = createDelegate();

      const repo = new UserRepository(root.delegate, { softDelete: true });

      const bound = repo.withTransaction({ user: tx.delegate });

      expect(bound).toBeInstanceOf(UserRepository);

      await bound.findMany();

      expect(tx.calls).toHaveLength(1);
      expect(root.calls).toHaveLength(0);
      expect((tx.calls[0]?.args as { where: unknown }).where).toEqual({
        deletedAt: null,
      });

      await repo.findMany();
      expect(root.calls).toHaveLength(1);
    });

    it("throws when the delegate is missing", () => {
      const repo = new UserRepository(createDelegate().delegate, {
        delegateKey: "users",
      });

      expect(() => repo.withTransaction({})).toThrow(/no "users" delegate/);
    });
  });

  describe("execute", () => {
    it("rejects when the signal aborts mid-flight", async () => {
      const controller = new AbortController();

      let resolveQuery: (value: readonly User[]) => void = () => undefined;

      const { delegate } = createDelegate({
        findMany: () =>
          new Promise<readonly User[]>((resolve) => {
            resolveQuery = resolve;
          }),
      });

      const repo = new UserRepository(delegate);

      const pending = repo.findMany(undefined, { signal: controller.signal });

      controller.abort(new Error("client went away"));

      const error = await captureError(pending);

      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.code).toBe(ErrorCode.OPERATION_CANCELLED);
      expect(error.metadata["aborted"]).toBe(true);

      resolveQuery([]);
    });

    it("rejects immediately for an already-aborted signal", async () => {
      const { delegate, calls } = createDelegate();

      const repo = new UserRepository(delegate);

      await expect(
        repo.findMany(undefined, { signal: AbortSignal.abort() }),
      ).rejects.toMatchObject({ code: ErrorCode.OPERATION_CANCELLED });

      expect(calls).toHaveLength(0);
    });

    it("times out client-side with a typed error", async () => {
      vi.useFakeTimers();

      try {
        const { delegate } = createDelegate({
          findMany: () => new Promise<readonly User[]>(() => undefined),
        });

        const repo = new UserRepository(delegate);

        const pending = repo.findMany(undefined, { timeoutMs: 50 });

        const assertion = expect(pending).rejects.toMatchObject({
          code: ErrorCode.DATABASE_TIMEOUT,
        });

        await vi.advanceTimersByTimeAsync(60);

        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it("maps Prisma error codes to typed DatabaseErrors", async () => {
      const cases: Array<[string, string, number]> = [
        ["P2002", ErrorCode.CONFLICT, 409],
        ["P2025", ErrorCode.NOT_FOUND, 404],
        ["P2003", ErrorCode.CONFLICT, 409],
        ["P2034", ErrorCode.DATABASE_TRANSACTION, 409],
        ["P2024", ErrorCode.DATABASE_TIMEOUT, 503],
        ["P1001", ErrorCode.DATABASE_CONNECTION, 503],
        ["P2010", ErrorCode.DATABASE_QUERY, 500],
      ];

      for (const [prismaCode, code, statusCode] of cases) {
        const { delegate } = createDelegate({
          create: () =>
            Promise.reject(prismaError(prismaCode, { target: ["email"] })),
        });

        const repo = new UserRepository(delegate);

        const error = await captureError(repo.create({ name: "x" }));

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.code).toBe(code);
        expect(error.statusCode).toBe(statusCode);
        expect(error.databaseCode).toBe(prismaCode);
        expect(error.operation).toBe(DatabaseOperation.INSERT);
        expect(error.metadata["target"]).toEqual(["email"]);
        expect(error.metadata["model"]).toBe("User");
        expect(error.cause).toBeInstanceOf(Error);
      }
    });

    it("wraps non-Prisma errors and passes DatabaseErrors through", async () => {
      const original = new DatabaseError("custom");

      const { delegate } = createDelegate({
        delete: () => Promise.reject(original),
        count: () => Promise.reject(new Error("boom")),
      });

      const repo = new UserRepository(delegate);

      await expect(repo.delete("u1")).rejects.toBe(original);

      const wrapped = await captureError(repo.count());

      expect(wrapped.message).toBe("boom");
      expect(wrapped.operation).toBe(DatabaseOperation.QUERY);
      expect(wrapped.databaseCode).toBeUndefined();
    });
  });
});
