/**
 * @zudojs/database — Round 12 regression tests.
 *
 * One describe block per academy finding.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { describe, it, expect, expectTypeOf } from "vitest";
import { DatabaseError, ErrorCode } from "@zudojs/errors";

import {
  BaseRepository,
  DatabaseClient,
  MigrationRunner,
  buildKeysetWhere,
  createKeysetCursor,
  decodeCursor,
  mapRepositoryError,
  noopDatabaseLogger,
  type AuditableEntity,
  type CursorPaginatedResult,
  type DatabaseEntity,
  type Migration,
  type RepositoryDelegate,
  type SoftDeletableEntity,
} from "../src/index.js";
import { createStubPrisma } from "./helpers/stubPrisma.js";

/* ─── shared fixtures ────────────────────────────────────────────────────── */

interface Task extends Record<string, unknown> {
  readonly id: string;
  readonly createdAt: Date;
  readonly age: number;
}

type Where = Record<string, unknown>;

type TaskDelegate = RepositoryDelegate<Task, string, Partial<Task>, Partial<Task>, Where>;

class TaskRepository extends BaseRepository<Task, string, Partial<Task>, Partial<Task>, Where> {}

function recordingDelegate(
  findMany: (args: { where?: Where; take?: number; orderBy?: unknown }) => Promise<Task[]>,
): TaskDelegate {
  const unsupported = () => Promise.reject(new Error("not used"));
  return {
    findUnique: unsupported,
    findFirst: unsupported,
    findMany: findMany as TaskDelegate["findMany"],
    create: unsupported,
    update: unsupported,
    delete: unsupported,
    count: async () => 0,
  };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return Object.assign(new Error(`prisma ${code}`), { code, clientVersion: "7.0.0", meta });
}

/* ─── #77: mapRepositoryError had no case for P2004 / P2000 / P2011 ─────── */

describe("#77 mapRepositoryError covers every code normalizeDatabaseError maps", () => {
  const context = { model: "Task", operation: "update", durationMs: 1 } as const;

  it.each([
    ["P2004", 409, ErrorCode.CONFLICT],
    ["P2000", 400, ErrorCode.DATABASE_QUERY],
    ["P2011", 400, ErrorCode.DATABASE_QUERY],
    ["P2014", 409, ErrorCode.CONFLICT],
    ["P2015", 404, ErrorCode.RESOURCE_NOT_FOUND],
    ["P2018", 404, ErrorCode.RESOURCE_NOT_FOUND],
  ])("maps %s to an exposable %i", (code, status, errorCode) => {
    const mapped = mapRepositoryError(prismaError(code), context);
    expect(mapped).toBeInstanceOf(DatabaseError);
    expect(mapped.statusCode).toBe(status);
    expect(mapped.code).toBe(errorCode);
    expect(mapped.expose).toBe(true);
    expect(mapped.databaseCode).toBe(code);
    expect(mapped.message).toMatch(/^Task update /);
    expect(mapped.message).not.toContain("prisma");
  });

  it("maps P2028 (transaction closed) to a non-exposed 503", () => {
    const mapped = mapRepositoryError(prismaError("P2028"), context);
    expect(mapped.statusCode).toBe(503);
    expect(mapped.code).toBe(ErrorCode.DATABASE_TRANSACTION);
    expect(mapped.expose).toBe(false);
  });

  it("keeps the explicit mappings and the unknown-code fallback", () => {
    expect(mapRepositoryError(prismaError("P2002"), context).statusCode).toBe(409);
    expect(mapRepositoryError(prismaError("P2025"), context).code).toBe(ErrorCode.NOT_FOUND);
    const unknown = mapRepositoryError(prismaError("P2999"), context);
    expect(unknown.statusCode).toBe(500);
    expect(unknown.code).toBe(ErrorCode.DATABASE_QUERY);
    expect(unknown.expose).toBe(false);
  });
});

/* ─── #78: SoftDeletableEntity / AuditableEntity had no id type parameter ── */

describe("#78 entity contracts accept an id type", () => {
  it("defaults to string and accepts another id type", () => {
    interface NumberTask extends SoftDeletableEntity<number> {
      readonly title: string;
    }
    interface NumberAudit extends AuditableEntity<number> {
      readonly title: string;
    }
    const task: NumberTask = {
      id: 1,
      title: "t",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const audit: NumberAudit = { id: 2, title: "a", createdAt: new Date(), updatedAt: new Date() };
    expectTypeOf<SoftDeletableEntity["id"]>().toEqualTypeOf<string>();
    expectTypeOf<AuditableEntity["id"]>().toEqualTypeOf<string>();
    expectTypeOf<DatabaseEntity<bigint>["id"]>().toEqualTypeOf<bigint>();
    expect(task.id + audit.id).toBe(3);
  });
});

/* ─── #79: millisecond cursors skipped rows sharing a millisecond ────────── */

const ISO = "2026-01-01T00:00:00.123Z";
const NEXT = "2026-01-01T00:00:00.124Z";

describe("#79 keyset where treats a Date cursor as its millisecond bucket", () => {
  const sort = [
    { field: "createdAt", direction: "desc" },
    { field: "id", direction: "desc" },
  ] as const;

  it("compares the strict part below the bucket and ties inside it (desc)", () => {
    expect(buildKeysetWhere({ createdAt: ISO, id: "t4" }, sort)).toEqual({
      OR: [
        { createdAt: { lt: ISO } },
        { AND: [{ createdAt: { gte: ISO, lt: NEXT } }, { id: { lt: "t4" } }] },
      ],
    });
  });

  it("starts the strict part at the next millisecond (asc)", () => {
    const asc = sort.map((entry) => ({ ...entry, direction: "asc" as const }));
    expect(buildKeysetWhere({ createdAt: ISO, id: "t1" }, asc)).toEqual({
      OR: [
        { createdAt: { gte: NEXT } },
        { AND: [{ createdAt: { gte: ISO, lt: NEXT } }, { id: { gt: "t1" } }] },
      ],
    });
  });

  it("leaves non-date values exactly as before", () => {
    expect(
      buildKeysetWhere({ age: 2, id: "u2" }, [
        { field: "age", direction: "desc" },
        { field: "id", direction: "desc" },
      ]),
    ).toEqual({
      OR: [{ age: { lt: 2 } }, { AND: [{ age: { equals: 2 } }, { id: { lt: "u2" } }] }],
    });
  });
});

/* PGlite is resolved through `prisma`, which depends on it. */
function resolvePglite(): string | undefined {
  try {
    const here = createRequire(import.meta.url);
    return createRequire(here.resolve("prisma/package.json")).resolve("@electric-sql/pglite");
  } catch {
    return undefined;
  }
}

const PGLITE = resolvePglite();

interface PgliteLike {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

const COLUMNS: Record<string, string> = { createdAt: "created_at", id: "id" };
const OPERATORS: Record<string, string> = { lt: "<", lte: "<=", gt: ">", gte: ">=", equals: "=" };

function whereToSql(node: Where, params: unknown[]): string {
  if (Array.isArray(node["OR"])) {
    return `(${(node["OR"] as Where[]).map((n) => whereToSql(n, params)).join(" OR ")})`;
  }
  if (Array.isArray(node["AND"])) {
    return `(${(node["AND"] as Where[]).map((n) => whereToSql(n, params)).join(" AND ")})`;
  }
  const [field, operators] = Object.entries(node)[0]!;
  const cast = field === "createdAt" ? "::timestamptz" : "";
  const parts = Object.entries(operators as Record<string, unknown>).map(([op, value]) => {
    params.push(value);
    return `${COLUMNS[field]} ${OPERATORS[op]} $${params.length}${cast}`;
  });
  return `(${parts.join(" AND ")})`;
}

function orderToSql(orderBy: unknown): string {
  return (orderBy as Record<string, string>[])
    .map((entry) => Object.entries(entry)[0]!)
    .map(([field, direction]) => `${COLUMNS[field]} ${direction}`)
    .join(", ");
}

describe.skipIf(PGLITE === undefined)("#79 paginateCursor over PGlite timestamptz rows", () => {
  async function paginateAll(db: PgliteLike, table: string): Promise<string[]> {
    const delegate = recordingDelegate(async ({ where, take, orderBy }) => {
      const params: unknown[] = [];
      const clause = where ? ` WHERE ${whereToSql(where, params)}` : "";
      const sql = `SELECT id, created_at AS "createdAt", 0 AS age FROM ${table}${clause} ORDER BY ${orderToSql(orderBy)} LIMIT ${take}`;
      return (await db.query<Task>(sql, params)).rows;
    });
    const repo = new TaskRepository(delegate, { modelName: "Task" });
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: CursorPaginatedResult<Task> = await repo.paginateCursor(undefined, {
        cursor,
        limit: 1,
        sort: [{ field: "createdAt", direction: "desc" }],
      });
      ids.push(...result.data.map((row) => row.id));
      if (!result.meta.nextCursor) break;
      cursor = result.meta.nextCursor;
    }
    return ids;
  }

  it("returns every row created within the same millisecond", async () => {
    const { PGlite } = (await import(pathToFileURL(PGLITE!).href)) as {
      PGlite: new () => PgliteLike;
    };
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE micro (id text PRIMARY KEY, created_at timestamptz NOT NULL);
        INSERT INTO micro VALUES
          ('t1', '2026-01-01 00:00:00.123001+00'),
          ('t2', '2026-01-01 00:00:00.123002+00'),
          ('t3', '2026-01-01 00:00:00.123003+00'),
          ('t4', '2026-01-01 00:00:00.123004+00');
        CREATE TABLE same (id text PRIMARY KEY, created_at timestamptz NOT NULL);
        INSERT INTO same VALUES
          ('a1', '2026-01-01 00:00:00.123456+00'),
          ('a2', '2026-01-01 00:00:00.123456+00'),
          ('a3', '2026-01-01 00:00:00.123456+00'),
          ('a4', '2026-01-01 00:00:00.123456+00');
      `);
      const sample = await db.query<Task>('SELECT created_at AS "createdAt" FROM micro LIMIT 1');
      expect(sample.rows[0]!.createdAt).toBeInstanceOf(Date);

      expect(await paginateAll(db, "micro")).toEqual(["t4", "t3", "t2", "t1"]);
      expect(await paginateAll(db, "same")).toEqual(["a4", "a3", "a2", "a1"]);
    } finally {
      await db.close();
    }
  });
});

/* ─── #80: createKeysetCursor lacked the repository's id tiebreaker ──────── */

describe("#80 repository.createCursor matches paginateCursor's sort", () => {
  const rows: Task[] = [
    { id: "t1", createdAt: new Date(ISO), age: 1 },
    { id: "t2", createdAt: new Date(ISO), age: 2 },
  ];

  it("a bare createKeysetCursor still fails loudly against the repository sort", async () => {
    const repo = new TaskRepository(recordingDelegate(async () => rows));
    const cursor = createKeysetCursor(rows[0]!, [{ field: "age", direction: "desc" }]);
    await expect(
      repo.paginateCursor(undefined, { cursor, sort: [{ field: "age", direction: "desc" }] }),
    ).rejects.toThrow(/missing sort field "id"/);
  });

  it("createCursor appends the id tiebreaker and signs with cursorSecret", async () => {
    const calls: Where[] = [];
    const repo = new TaskRepository(
      recordingDelegate(async (args) => {
        calls.push(args.where ?? {});
        return rows;
      }),
      { cursorSecret: "s3cret" },
    );

    const cursor = repo.createCursor(rows[1]!, { sort: [{ field: "age", direction: "desc" }] });
    expect(decodeCursor(cursor, { secret: "s3cret" })).toEqual({ age: 2, id: "t2" });

    await repo.paginateCursor(undefined, { cursor, sort: [{ field: "age", direction: "desc" }] });
    expect(calls[0]).toEqual({
      OR: [{ age: { lt: 2 } }, { AND: [{ age: { equals: 2 } }, { id: { lt: "t2" } }] }],
    });

    const backward = repo.createCursor(rows[1]!, {
      sort: [{ field: "age", direction: "desc" }],
      direction: "backward",
    });
    expect(decodeCursor(backward, { secret: "s3cret" })).toEqual({
      age: 2,
      id: "t2",
      $before: true,
    });
  });
});

/* ─── #81: no way to run a migration outside a transaction ──────────────── */

interface MigrationRow {
  version: bigint;
  name: string;
  applied_at: Date;
}

function createMigrationBackend() {
  const rows: MigrationRow[] = [];
  const prisma = createStubPrisma({
    respond: (sql, values) => {
      if (/^SELECT "version"/.test(sql)) return [...rows];
      if (/^INSERT INTO/.test(sql)) {
        rows.push({ version: values[0] as bigint, name: values[1] as string, applied_at: new Date() });
        return 1;
      }
      if (/^DELETE FROM/.test(sql)) {
        const index = rows.findIndex((r) => r.version === (values[0] as bigint));
        if (index >= 0) rows.splice(index, 1);
        return index >= 0 ? 1 : 0;
      }
      return undefined;
    },
  });
  const client = new DatabaseClient({ prisma, logger: noopDatabaseLogger });
  return { prisma, client, rows };
}

describe("#81 a migration can opt out of its transaction", () => {
  const migrations: Migration[] = [
    { version: 1, name: "table", up: async (db) => void (await db.$executeRawUnsafe("CREATE TABLE t (id int)")) },
    {
      version: 2,
      name: "index",
      transaction: false,
      up: async (db) => void (await db.$executeRawUnsafe("CREATE INDEX CONCURRENTLY t_idx ON t (id)")),
      down: async (db) => void (await db.$executeRawUnsafe("DROP INDEX CONCURRENTLY t_idx")),
    },
  ];

  it("runs the opted-out body outside any transaction but records it inside one", async () => {
    const { prisma, client, rows } = createMigrationBackend();
    const runner = new MigrationRunner(client, migrations);

    const result = await runner.migrate();
    expect(result.applied.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.map((r) => Number(r.version))).toEqual([1, 2]);

    const createTable = prisma.queries.find((q) => q.sql.startsWith("CREATE TABLE t"));
    const createIndex = prisma.queries.find((q) => q.sql.startsWith("CREATE INDEX"));
    const insert = prisma.queries.filter((q) => q.sql.startsWith("INSERT INTO"));
    expect(createTable?.inTransaction).toBe(true);
    expect(createIndex?.inTransaction).toBe(false);
    expect(insert.every((q) => q.inTransaction)).toBe(true);

    const reverted = await runner.rollback();
    expect(reverted?.version).toBe(2);
    const dropIndex = prisma.queries.find((q) => q.sql.startsWith("DROP INDEX"));
    expect(dropIndex?.inTransaction).toBe(false);
    expect(rows.map((r) => Number(r.version))).toEqual([1]);
  });

  it("does not record a failed non-transactional migration", async () => {
    const { client, rows } = createMigrationBackend();
    const runner = new MigrationRunner(client, [
      { version: 1, name: "boom", transaction: false, up: async () => { throw new Error("boom"); } },
    ]);
    await expect(runner.migrate()).rejects.toThrow(/Migration "boom" failed/);
    expect(rows).toHaveLength(0);
  });

  it("refuses the opt-out under a single batch transaction", () => {
    const { client } = createMigrationBackend();
    expect(() => new MigrationRunner(client, migrations, { perItemTransaction: false })).toThrow(
      DatabaseError,
    );
  });
});
