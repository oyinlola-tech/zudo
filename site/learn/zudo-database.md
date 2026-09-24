---
title: "Databases with @zudojs/database"
description: "Connect the Task API to PostgreSQL through @zudojs/database, with migrations, seeds, a repository, a query builder, pagination, transactions and health checks, all running against real PostgreSQL."
source: https://zudojs.oyinlola.site/learn/zudo-database
---

LESSON 56 OF 84

Data Core

# Databases with @zudojs/database

Connect the Task API to PostgreSQL through @zudojs/database, with migrations, seeds, a repository, a query builder, pagination, transactions and health checks, all running against real PostgreSQL.

- **50 min** to read and try
- **You need:** The SQL lessons and the ZudoJS core part
- **You build:** A PostgreSQL task store with migrations, seeds, a soft-deleting repository and signed pagination

  [Test yourself](#test)

## What @zudojs/database does

In [the SQL lessons](https://zudojs.oyinlola.site/learn/sql-basics) you wrote every query by hand. That works, but every project ends up writing the same things again: connect and disconnect, run migrations once, turn database errors into HTTP errors, page through results, retry a failed transaction. `@zudojs/database` does those jobs for you.

It is built on **Prisma**, a popular database toolkit for TypeScript. Prisma talks to PostgreSQL. ZudoJS sits on top of it and adds:

- a **client** that connects, disconnects and reports its status,
- **migrations** and **seeds** that run once, even when two servers start at the same moment,
- a **repository** base class with create, find, update, delete, soft delete and pagination,
- a **query builder**, **transactions** with retries, and **health checks**.

It supports **PostgreSQL only**. Install it in your `task-api` folder, together with PGlite from [the databases lesson](https://zudojs.oyinlola.site/learn/databases):

Terminal on your computer

```bash
$ npm install @zudojs/database @electric-sql/pglite

added 7 packages, and audited 15 packages in 16s

found 0 vulnerabilities
```

Your numbers will be different, because your project already has other packages. npm also added `@prisma/client`: `@zudojs/database` lists it as a **peer dependency**, a package it expects your project to provide.

## The client and its adapter

ZudoJS never talks to the database directly. It talks to a Prisma client, and it only needs a few methods from it: `$connect`, `$disconnect`, `$queryRawUnsafe`, `$executeRawUnsafe` and `$transaction`. The package calls this shape `PrismaClientLike`. Anything with those methods works. This is the **adapter pattern**: a small object that makes one thing look like the thing another piece of code expects.

Inside a transaction, your callback gets a second object, the **transaction client** `tx`. It needs four raw SQL methods, `$queryRawUnsafe`, `$executeRawUnsafe`, `$queryRaw` and `$executeRaw`, and the package calls that shape `DatabaseTransactionContext`. A real Prisma transaction client also has one property per table, such as `tx.task`.

In a production app, the Prisma client comes from Prisma itself. You describe your tables in a `schema.prisma` file and run `npx prisma generate`. Prisma 7 writes the client into your own project (the folder is the `output` of the `generator` block, here `src/generated/prisma`), and you connect through a **driver adapter**, `@prisma/adapter-pg`:

production-db.tsNode.js only

```ts
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDatabaseClient } from "@zudojs/database";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: 10,                        // at most 10 open connections
    idleTimeoutMillis: 30_000,      // close a connection unused for 30 s
    connectionTimeoutMillis: 5_000, // give up waiting for a free one after 5 s
  }),
});

export const client = createDatabaseClient({ prisma });
```

The client Prisma generates fits `PrismaClientLike` as it is, so no type cast is needed. `createDatabaseClient` also reads the transaction client's type from it: in `client.transaction(async (tx) => tx.task.create({ data: { title: "Pack bags" } }))`, TypeScript checks `tx.task` against your schema just like `prisma.task`, and a misspelled field is a compile error. (This works since `@zudojs/database` 1.4.0. Before, with this generator, `tx` was silently `any`.)

This setup needs a running PostgreSQL server (the [deployment lesson](https://zudojs.oyinlola.site/learn/deployment) runs one in Docker) and the Prisma tool chain (`npm install -D prisma@7`, a schema, then `npx prisma generate`; see the [package page](https://zudojs.oyinlola.site/docs/packages-database.md)). For learning, this lesson uses PGlite instead, the real PostgreSQL running inside Node.js. There is no ready-made Prisma adapter for PGlite, so you write a small one. It has two files.

The first turns a Prisma-style `where` object, such as `{ done: false, title: { contains: "milk" } }`, into SQL. Look at two things. Every value becomes a `$1`, `$2`… parameter, never part of the SQL text. And every field name is checked against an **allow-list** before it is used, because a field name cannot be a parameter:

where.tsNode.js only

```ts
const COMPARE: Record<string, string> = {
  equals: "=", not: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=",
};

/* "createdAt" becomes the column "created_at", but only for known fields. */
export function column(field: string, fields: readonly string[]): string {
  if (!fields.includes(field)) {
    throw new TypeError(`Unknown field "${field}"`);
  }
  return `"${field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}"`;
}

export function whereToSql(where: unknown, fields: readonly string[], params: unknown[]): string {
  if (where === undefined || where === null) return "TRUE";
  const bind = (value: unknown) => `$${params.push(value)}`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR") {
      const list = (value as unknown[]).map((w) => `(${whereToSql(w, fields, params)})`);
      parts.push(list.join(` ${key} `) || (key === "AND" ? "TRUE" : "FALSE"));
      continue;
    }
    if (key === "NOT") {
      parts.push(`NOT (${whereToSql(value, fields, params)})`);
      continue;
    }
    const col = column(key, fields);
    const hasOps = value !== null && typeof value === "object" && !(value instanceof Date);
    for (const [op, v] of hasOps ? Object.entries(value) : [["equals", value]]) {
      if (v === null && op === "equals") parts.push(`${col} IS NULL`);
      else if (v === null && op === "not") parts.push(`${col} IS NOT NULL`);
      else if (op in COMPARE) parts.push(`${col} ${COMPARE[op]} ${bind(v)}`);
      else if (op === "in") parts.push(`${col} = ANY(${bind(v)})`);
      else if (op === "contains") parts.push(`${col} LIKE ${bind(`%${String(v).replace(/[\\%_]/g, "\\$&")}%`)}`);
      else throw new TypeError(`Operator "${op}" is not supported`);
    }
  }
  return parts.join(" AND ") || "TRUE";
}
```

The second file is the adapter itself. `modelDelegate` gives one table the methods a Prisma **model delegate** has (`findMany`, `create`, `update`…), and `createPglitePrisma` builds the whole client. It also translates PostgreSQL's error codes into the Prisma codes ZudoJS understands: `23505` (unique value already used) becomes `P2002`, and a missing row becomes `P2025`. You don't need to follow every line; copy it into your project:

pglite-adapter.tsNode.js only

```ts
import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { DatabaseTransactionContext, PrismaClientLike, PrismaSqlLike, RepositoryDelegate } from "@zudojs/database";
import { column, whereToSql } from "./where.js";

type Db = PGlite | Transaction;
type Row = Record<string, unknown>;
export interface Model {
  readonly table: string;
  readonly fields: readonly string[];
}
interface Args {
  where?: unknown;
  data?: Row;
  orderBy?: readonly Row[];
  skip?: number;
  take?: number;
}

/* PostgreSQL error codes, translated to the Prisma codes ZudoJS understands. */
const PRISMA_CODES: Record<string, string> = { "23505": "P2002", "23503": "P2003", "40001": "P2034" };

function prismaError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, clientVersion: "pglite" });
}

async function run(db: Db, sql: string, params: readonly unknown[]) {
  try {
    return await db.query<Row>(sql, [...params]);
  } catch (error) {
    const code = PRISMA_CODES[(error as { code?: string }).code ?? ""];
    throw code ? prismaError(code, (error as Error).message) : error;
  }
}

/* Rows come back as { created_at: … }; entities use { createdAt: … }. */
function toEntity(row: Row | undefined): Row {
  if (!row) throw prismaError("P2025", "Record not found");
  const entries = Object.entries(row).map(([key, value]) => [
    key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
    value,
  ]);
  return Object.fromEntries(entries);
}

export function modelDelegate<T>(db: Db, model: Model): RepositoryDelegate<T, number> {
  const table = `"${model.table}"`;
  const col = (field: string) => column(field, model.fields);
  const where = (args: Args | undefined, params: unknown[]) =>
    whereToSql(args?.where, model.fields, params);

  async function findMany(args: Args = {}) {
    const params: unknown[] = [];
    let sql = `SELECT * FROM ${table} WHERE ${where(args, params)}`;
    const order = (args.orderBy ?? []).flatMap((o) => Object.entries(o));
    if (order.length > 0) {
      sql += " ORDER BY " + order.map(([f, d]) => `${col(f)} ${d === "desc" ? "DESC" : "ASC"}`).join(", ");
    }
    if (args.take !== undefined) sql += ` LIMIT $${params.push(args.take)}`;
    if (args.skip !== undefined) sql += ` OFFSET $${params.push(args.skip)}`;
    return (await run(db, sql, params)).rows.map(toEntity);
  }

  const delegate = {
    findMany,
    findFirst: async (args: Args) => (await findMany({ ...args, take: 1 }))[0] ?? null,
    findUnique: async (args: Args) => (await findMany({ ...args, take: 1 }))[0] ?? null,
    async count(args?: Args) {
      const params: unknown[] = [];
      const sql = `SELECT count(*) AS n FROM ${table} WHERE ${where(args, params)}`;
      return Number((await run(db, sql, params)).rows[0]?.["n"]);
    },
    async create(args: Args) {
      const entries = Object.entries(args.data ?? {}).filter(([, value]) => value !== undefined);
      const columns = entries.map(([field]) => col(field)).join(", ");
      const marks = entries.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${columns}) VALUES (${marks}) RETURNING *`;
      return toEntity((await run(db, sql, entries.map(([, value]) => value))).rows[0]);
    },
    async update(args: Args) {
      const params: unknown[] = [];
      const sets = Object.entries(args.data ?? {})
        .filter(([, value]) => value !== undefined) // like Prisma: undefined means "leave it"
        .map(([f, v]) => `${col(f)} = $${params.push(v)}`);
      const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE ${where(args, params)} RETURNING *`;
      return toEntity((await run(db, sql, params)).rows[0]);
    },
    async delete(args: Args) {
      const params: unknown[] = [];
      const sql = `DELETE FROM ${table} WHERE ${where(args, params)} RETURNING *`;
      return toEntity((await run(db, sql, params)).rows[0]);
    },
  };
  return delegate as unknown as RepositoryDelegate<T, number>;
}

/* sql`… ${value}` and Prisma.sql`…` both arrive as text parts plus values. */
function tagged(query: TemplateStringsArray | PrismaSqlLike, values: readonly unknown[]) {
  const [parts, params] = "strings" in query ? [query.strings, query.values] : [query, values];
  return { sql: parts.reduce((text, part, i) => `${text}$${i}${part}`), params };
}

export function createPglitePrisma(pg: PGlite, models: Readonly<Record<string, Model>>): PrismaClientLike {
  const bind = (db: Db): DatabaseTransactionContext => {
    const query = async <R>(sql: string, values: readonly unknown[]) => (await run(db, sql, values)).rows as R;
    const execute = async (sql: string, values: readonly unknown[]) => (await run(db, sql, values)).affectedRows ?? 0;
    const client: DatabaseTransactionContext & Record<string, unknown> = {
      $queryRawUnsafe: (sql, ...values) => query(sql, values),
      $executeRawUnsafe: (sql, ...values) => execute(sql, values),
      $queryRaw: (sql, ...values) => { const t = tagged(sql, values); return query(t.sql, t.params); },
      $executeRaw: (sql, ...values) => { const t = tagged(sql, values); return execute(t.sql, t.params); },
    };
    for (const [key, model] of Object.entries(models)) client[key] = modelDelegate(db, model);
    return client;
  };
  return {
    ...bind(pg),
    async $connect() {
      if (pg.closed) throw new Error("PGlite is closed");
      await pg.waitReady;
    },
    async $disconnect() {
      if (!pg.closed) await pg.close();
    },
    $transaction: <T>(callback: (tx: DatabaseTransactionContext) => Promise<T>) =>
      pg.transaction((tx) => callback(bind(tx))),
  };
}
```

One line needs a word: `delegate as unknown as RepositoryDelegate<T, number>`. The adapter works with plain rows, but a repository wants rows of type `T`, such as `Task`. Prisma generates exact types for each table; this small adapter cannot, so it asserts the type once, in one place. The table definition below is what keeps it honest.

`bind` builds the object that plays both roles: the client itself, and the `tx` of every transaction. It has the four raw methods `DatabaseTransactionContext` asks for; `tagged` turns a tagged template such as `Prisma.sql` into `$1`, `$2`… text plus values. `$transaction` names its callback's type, `DatabaseTransactionContext`, because `PrismaClientLike` accepts any `$transaction` and so gives the callback no type of its own. A generated Prisma client needs none of this.

> NOTE
>
> This adapter covers what the lesson needs: equality, `contains`, comparisons, `AND`/`OR`/`NOT`, sorting and paging. It ignores transaction options such as the isolation level. In production, Prisma does all of this for you.

## Configuration and connecting

Now describe the `tasks` table once and open a client. The client is created with `createDatabaseClient`. Two options are worth knowing on day one:

- `logger`: by default the client logs every connect and disconnect as JSON through `@zudojs/logger`. `noopDatabaseLogger` keeps the examples quiet. In your app, keep the default or pass your own logger.
- `connectionTimeoutMs`: how long `connect()` may take before it fails (the default is 10 seconds).

Where the data lives is **configuration**, so it comes from the environment, as in [the config lesson](https://zudojs.oyinlola.site/learn/zudo-config). With no `PGLITE_DATA_DIR`, PGlite keeps everything in memory:

database.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { createDatabaseClient, noopDatabaseLogger } from "@zudojs/database";
import { createPglitePrisma } from "./pglite-adapter.js";
import type { Model } from "./pglite-adapter.js";

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: "low" | "normal" | "high";
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export const TASK_MODEL: Model = {
  table: "tasks",
  fields: ["id", "title", "done", "priority", "createdAt", "deletedAt"],
};

export async function openDatabase() {
  const pg = new PGlite(process.env["PGLITE_DATA_DIR"]);
  const prisma = createPglitePrisma(pg, { task: TASK_MODEL });
  const client = createDatabaseClient({
    prisma,
    logger: noopDatabaseLogger,
    connectionTimeoutMs: 5_000,
  });
  await client.connect();
  return { pg, client };
}
```

The key `task` in `{ task: TASK_MODEL }` matters: it is the name Prisma would give the `Task` model, and the repository uses it to find its table inside a transaction.

A real PostgreSQL server needs a connection string such as `postgres://user:password@host:5432/tasks`. It contains a password, so it is a **secret**: it comes from the environment, never from your code, and you never print it. Check that it is there when the app starts, so a missing setting fails loudly at once instead of at the first request:

env-check.tsNode.js only

```ts
import { ConfigurationError } from "@zudojs/errors";

export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new ConfigurationError("DATABASE_URL is not set. Add it to your environment or .env file.");
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new ConfigurationError("DATABASE_URL must start with postgres://");
  }
  return url;
}

try {
  requireDatabaseUrl();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log(error.name, "-", error.message);
  }
}
```

Output of `npx tsx env-check.ts`

```ts
ConfigurationError - DATABASE_URL is not set. Add it to your environment or .env file.
```

The message names the setting but never shows a value. Error messages end up in logs, and logs are read by more people than your secrets should be.

## Migrations

You met migrations in [the databases lesson](https://zudojs.oyinlola.site/learn/databases): numbered steps that change the database's structure, applied in order and recorded so each runs only once. `createMigrationRunner` does that, with two extras. It takes a PostgreSQL **advisory lock** while it works, so two copies of your server starting together cannot apply the same migration twice. And each migration can have a `down` step that undoes it:

migrations.tsNode.js only

```ts
import type { Migration } from "@zudojs/database";

export const migrations: Migration[] = [
  {
    version: 1,
    name: "create-tasks",
    up: async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TABLE tasks (
          id         serial PRIMARY KEY,
          title      text NOT NULL UNIQUE,
          done       boolean NOT NULL DEFAULT false,
          priority   text NOT NULL DEFAULT 'normal',
          created_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        )`);
    },
    down: async (tx) => {
      await tx.$executeRawUnsafe("DROP TABLE tasks");
    },
  },
  {
    version: 2,
    name: "index-tasks-priority",
    up: async (tx) => {
      await tx.$executeRawUnsafe("CREATE INDEX tasks_priority_idx ON tasks (priority)");
    },
    down: async (tx) => {
      await tx.$executeRawUnsafe("DROP INDEX tasks_priority_idx");
    },
  },
];
```

Run them, run them again, then undo the last one:

migrate.tsNode.js only

```ts
import { createMigrationRunner } from "@zudojs/database";
import { openDatabase } from "./database.js";
import { migrations } from "./migrations.js";

const { client } = await openDatabase();
const runner = createMigrationRunner(client, migrations);

const first = await runner.migrate();
console.log("applied:", first.applied.map((m) => `${m.version} ${m.name}`));

const again = await runner.migrate();
console.log("applied:", again.applied.length, "skipped:", again.skipped.length);

const undone = await runner.rollback();
console.log("rolled back:", undone?.name);

const status = await runner.status();
console.log("version", status.currentVersion, "of", status.latestVersion);
console.log("pending:", status.pending.map((m) => m.name));

await client.disconnect();
```

Output of `npx tsx migrate.ts`

```ts
applied: [ '1 create-tasks', '2 index-tasks-priority' ]
applied: 0 skipped: 2
rolled back: index-tasks-priority
version 1 of 2
pending: [ 'index-tasks-priority' ]
```

The second `migrate()` applied nothing: the runner keeps its history in a table called `_migrations` and skipped both. After the rollback, version 2 is **pending** again, so the next `migrate()` would re-apply it. Each migration runs in its own transaction: if one fails halfway, its changes are undone and the ones before it stay.

> NEVER EDIT A MIGRATION THAT HAS RUN
>
> Once a migration has run on any shared database, treat it as frozen. To change the table again, add migration 3. The runner only looks at version numbers, so an edited migration 1 would never run again anywhere it already ran.

## Seeds

A **seed** puts starting data into the database: demo tasks for development, or the list of roles every install needs. The seed runner works like the migration runner: named steps, run once, recorded in a `_seeds` table. A small `setup` function runs both, so every later example starts from the same data:

seeds.tsNode.js only

```ts
import type { Seed } from "@zudojs/database";

export const seeds: Seed[] = [
  {
    name: "demo-tasks",
    run: async (tx) => {
      const titles = ["Buy milk", "Write report", "Call the bank", "Read a book", "Plan the trip"];
      for (const title of titles) {
        await tx.$executeRawUnsafe("INSERT INTO tasks (title) VALUES ($1)", title);
      }
      await tx.$executeRawUnsafe("UPDATE tasks SET priority = 'high' WHERE title = $1", "Call the bank");
    },
    rollback: async (tx) => {
      await tx.$executeRawUnsafe("DELETE FROM tasks");
    },
  },
];
```

setup.tsNode.js only

```ts
import { createMigrationRunner, createSeedRunner } from "@zudojs/database";
import { openDatabase } from "./database.js";
import { migrations } from "./migrations.js";
import { seeds } from "./seeds.js";

export async function setup() {
  const db = await openDatabase();
  await createMigrationRunner(db.client, migrations).migrate();
  await createSeedRunner(db.client, seeds).run();
  return db;
}
```

seed.tsNode.js only

```ts
import { createSeedRunner } from "@zudojs/database";
import { seeds } from "./seeds.js";
import { setup } from "./setup.js";

const { client } = await setup();

const again = await createSeedRunner(client, seeds).run();
console.log("second run skipped:", again.skipped.map((s) => s.name));

const rows = await client.queryRawUnsafe<{ id: number; title: string; priority: string }[]>(
  "SELECT id, title, priority FROM tasks ORDER BY id",
);
console.table(rows);
await client.disconnect();
```

Output of `npx tsx seed.ts`

```ts
second run skipped: [ 'demo-tasks' ]
┌─────────┬────┬─────────────────┬──────────┐
│ (index) │ id │ title           │ priority │
├─────────┼────┼─────────────────┼──────────┤
│ 0       │ 1  │ 'Buy milk'      │ 'normal' │
│ 1       │ 2  │ 'Write report'  │ 'normal' │
│ 2       │ 3  │ 'Call the bank' │ 'high'   │
│ 3       │ 4  │ 'Read a book'   │ 'normal' │
│ 4       │ 5  │ 'Plan the trip' │ 'normal' │
└─────────┴────┴─────────────────┴──────────┘
```

`setup()` ran the seed once; running it a second time skipped it. Seeds are for data your app needs to start. Test data for one test belongs in that test, which [the testing lesson](https://zudojs.oyinlola.site/learn/zudo-testing) covers.

## Raw SQL, safely

You just used `client.queryRawUnsafe(sql, values)`. Sometimes a hand-written query is the clearest way to get an answer. The word *Unsafe* in the name is a warning: the method sends your SQL text exactly as you wrote it. It is safe only when every outside value goes in the `values` array. Here is the mistake from [the SQL basics lesson](https://zudojs.oyinlola.site/learn/sql-basics#injection) once more, then the fix:

raw.tsNode.js only

```ts
import { setup } from "./setup.js";

const { client } = await setup();
const search = "nothing' OR '1'='1"; // what an attacker types into the search box

// WRONG: the input becomes part of the SQL
const leaked = await client.queryRawUnsafe<unknown[]>(
  `SELECT id FROM tasks WHERE title = '${search}'`,
);
console.log("string-built query returned", leaked.length, "rows");

// RIGHT: the input is a parameter, never SQL
const safe = await client.queryRawUnsafe<unknown[]>(
  "SELECT id FROM tasks WHERE title = $1",
  [search],
);
console.log("parameterized query returned", safe.length, "rows");
await client.disconnect();
```

Output of `npx tsx raw.ts`

```ts
string-built query returned 5 rows
parameterized query returned 0 rows
```

The string-built query returned every task, because the attacker's quote closed the string and `OR '1'='1'` is always true. With `$1`, PostgreSQL treats the whole input as one plain value and finds no task with that odd title. Raw SQL through ZudoJS always uses `$1`, `$2`… with a values array.

## A repository

A **repository** is one class that owns all access to one table. The rest of your app asks it for tasks and never writes SQL. You wrote a small generic repository in [the generics lesson](https://zudojs.oyinlola.site/learn/ts-generics); `BaseRepository` is the full version. Extend it, pass the model delegate, and add methods for your own questions:

task.repository.tsNode.js only

```ts
import { BaseRepository } from "@zudojs/database";
import type { BaseRepositoryOptions, RepositoryDelegate } from "@zudojs/database";
import type { Task } from "./database.js";

export type NewTask = Pick<Task, "title"> & Partial<Pick<Task, "done" | "priority">>;

export class TaskRepository extends BaseRepository<Task, number, NewTask> {
  constructor(delegate: RepositoryDelegate<Task, number, NewTask>, options: BaseRepositoryOptions = {}) {
    super(delegate, { modelName: "Task", softDelete: true, ...options });
  }

  findByTitle(title: string): Promise<Task | null> {
    return this.findOne({ title });
  }
}
```

The type parameters are the entity (`Task`), its id type (`number`) and what `create` accepts (`NewTask`: a title, and optionally `done` and `priority`). `softDelete: true` is explained in the next section, and `options` lets a caller add more settings, which the pagination section uses. Now use it, including two things that go wrong on purpose:

repository.tsNode.js only

```ts
import { isConflictError, isNotFoundError } from "@zudojs/database";
import { BaseError } from "@zudojs/errors";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

const created = await tasks.create({ title: "Learn ZudoJS", priority: "high" });
console.log(created);

const updated = await tasks.update(created.id, { done: true });
console.log("done:", updated.done);
console.log("Buy milk has id", (await tasks.findByTitle("Buy milk"))?.id);
console.log("high priority:", await tasks.count({ priority: "high" }));

const mistakes = [
  () => tasks.create({ title: "Buy milk" }),
  () => tasks.update(999, { done: true }),
];
for (const attempt of mistakes) {
  try {
    await attempt();
  } catch (error) {
    if (error instanceof BaseError) {
      console.log(error.statusCode, error.code, error.message);
      console.log("  conflict?", isConflictError(error), "not found?", isNotFoundError(error));
    }
  }
}
await client.disconnect();
```

Output of `npx tsx repository.ts`

```json
{
  id: 6,
  title: 'Learn ZudoJS',
  done: false,
  priority: 'high',
  createdAt: 2026-09-23T13:40:42.567Z,
  deletedAt: null
}
done: true
Buy milk has id 1
high priority: 2
409 ERR_CONFLICT Task already exists.
  conflict? true not found? false
404 ERR_NOT_FOUND Task was not found.
  conflict? false not found? true
```

Read the output:

- `create` returned the whole new row, with the id, defaults and timestamp that PostgreSQL filled in.
- A second "Buy milk" broke the `UNIQUE` rule on `title`. The repository turned PostgreSQL's error into a `DatabaseError` with status **409 Conflict**.
- Updating task 999 found nothing to update, which became **404 Not Found**.

These are the same status codes your API should send, so an error handler like the one in [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors) can pass them on as they are. The messages are generic on purpose: they never include the constraint name or the SQL, which would tell an attacker about your schema.

## Soft delete and the query builder

**Soft delete** means "mark as deleted instead of removing". `softDelete(id)` sets `deleted_at` to the current time, and from then on every read of the repository skips that row. Users can get a deleted task back, and you keep a history. `findDeleted()` lists the deleted ones, and `withDeleted()` gives you a copy of the repository that sees everything.

For searches with several conditions, `createQueryBuilder` builds the filter step by step. Its type parameter lists the fields you allow, so a typo is a compile error:

query.tsNode.js only

```ts
import { createQueryBuilder } from "@zudojs/database";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

await tasks.softDelete(1);
const titles = (list: readonly Task[]) =>
  [...list].sort((a, b) => a.id - b.id).map((t) => `${t.id} ${t.title}`);
console.log("visible:", titles(await tasks.findMany()));
console.log("deleted:", titles(await tasks.findDeleted()));
console.log("everything:", (await tasks.withDeleted().count()));

const query = createQueryBuilder<keyof Task>()
  .where("done", false)
  .whereContains("title", "the")
  .orderByDesc("id")
  .limit(2);
console.log(JSON.stringify(query.toPrismaArgs()));
const found = await tasks.findByQuery(query);
console.log("found:", found.map((t) => `${t.id} ${t.title}`));
await client.disconnect();
```

Output of `npx tsx query.ts`

```ts
visible: [
  '2 Write report',
  '3 Call the bank',
  '4 Read a book',
  '5 Plan the trip'
]
deleted: [ '1 Buy milk' ]
everything: 5
{"where":{"done":{"equals":false},"title":{"contains":"the"}},"orderBy":[{"id":"desc"}],"skip":0,"take":2}
found: [ '5 Plan the trip', '3 Call the bank' ]
```

The query builder produces a plain Prisma-style object (the JSON line), which the repository hands to the delegate, and your adapter turned into SQL with parameters. `whereContains` is case-sensitive: `"the"` matches "Call the bank" and "Plan the trip", not "The…".

### Sorting by what the client asks for

Clients often choose the sort order: `GET /tasks?sort=title`. A field name cannot be a SQL parameter, so it must be checked. ZudoJS checks sort fields before they reach the database, and your adapter's allow-list catches any field the table does not have:

sort-attack.tsNode.js only

```ts
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

for (const field of ["title", "title; DROP TABLE tasks", "password"]) {
  try {
    const page = await tasks.findPaginated(undefined, {
      pagination: { page: 1, limit: 2 },
      sort: [{ field, direction: "asc" }],
    });
    console.log(field, "->", page.data.map((t) => t.title));
  } catch (error) {
    console.log(field, "->", (error as Error).name, (error as Error).message);
  }
}
console.log("tasks left:", await tasks.count());
await client.disconnect();
```

Output of `npx tsx sort-attack.ts`

```ts
title -> [ 'Buy milk', 'Call the bank' ]
title; DROP TABLE tasks -> TypeError Invalid query field name "title; DROP TABLE tasks".
password -> DatabaseError Unknown field "password"
tasks left: 5
```

The injection attempt never reached PostgreSQL: ZudoJS refused the name because it is not a plain identifier. `password` is a valid name but not a field of `tasks`, so the adapter refused it. In a real route, check the sort field against a short list of allowed values with a schema first, and answer 400 for anything else, as [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation) showed.

## Pagination

Never return a whole table: it grows forever. **Pagination** returns one page at a time. There are two kinds.

**Offset pagination** says "page 2, 2 per page". It is easy and lets users jump to any page. `findPaginated` also counts the rows, so it can tell you how many pages there are. **Keyset (cursor) pagination** says "the 2 tasks after the last one I saw". It stays fast on huge tables and does not skip or repeat rows when new ones are added between requests. The "last one I saw" is an opaque string called a **cursor**, which the client sends back to get the next page.

A cursor travels through the client, so the client can change it. Give the repository a `cursorSecret` and every cursor is **signed**: a changed cursor is rejected. The secret comes from the environment:

paginate.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { ValidationError } from "@zudojs/errors";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

// Demo only: a random secret so the example runs anywhere. Your app sets CURSOR_SECRET.
process.env["CURSOR_SECRET"] ??= randomBytes(32).toString("base64url");

const cursorSecret = process.env["CURSOR_SECRET"];
if (cursorSecret.length < 32) {
  throw new Error("CURSOR_SECRET must be at least 32 characters");
}

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL), { cursorSecret });
const sort = [{ field: "id", direction: "asc" }] as const;

const page2 = await tasks.findPaginated(undefined, { pagination: { page: 2, limit: 2 }, sort });
console.log(page2.data.map((t) => t.id), page2.meta);

const first = await tasks.paginateCursor(undefined, { limit: 2, sort });
console.log(first.data.map((t) => t.id), first.meta.nextCursor);
const next = await tasks.paginateCursor(undefined, { limit: 2, sort, cursor: first.meta.nextCursor });
console.log(next.data.map((t) => t.id), "has next?", next.meta.hasNextPage);
const back = await tasks.paginateCursor(undefined, { limit: 2, sort, cursor: next.meta.previousCursor });
console.log(back.data.map((t) => t.id), "has previous?", back.meta.hasPreviousPage);

const [, signature] = (first.meta.nextCursor ?? "").split(".");
const forged = Buffer.from('{"id":0}').toString("base64url") + "." + signature;
try {
  await tasks.paginateCursor(undefined, { limit: 2, sort, cursor: forged });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.statusCode, error.name, error.message, error.issues[0]?.code);
  }
}
await client.disconnect();
```

Output of `npx tsx paginate.ts`

```json
[ 3, 4 ] {
  page: 2,
  limit: 2,
  total: 5,
  totalPages: 3,
  hasNextPage: true,
  hasPreviousPage: true,
  hasNext: true,
  hasPrev: true
}
[ 1, 2 ] eyJpZCI6Mn0.nySv_IOv5J-S0Pqx2wp7NtmJoZLgIR3kP0ZwbiFLgRY
[ 3, 4 ] has next? true
[ 1, 2 ] has previous? false
400 ValidationError Invalid pagination cursor signature. cursor_signature
```

Page 2 of the offset pagination holds tasks 3 and 4, and `meta` has what a client needs to draw page links: the total, the number of pages, and whether there is a next or previous page.

The cursor has two parts separated by a dot. The first is the position, in Base64: `eyJpZCI6Mn0` is `{"id":2}`, the last task of the first page. The second is the signature, which changes with every secret (so yours will differ).

Cursors go both ways. A page fetched with a cursor also has a `meta.previousCursor`; sending it back returns the page before, here tasks 1 and 2 again, in the same order. That page is the first one, so `hasPreviousPage` is `false`.

The forged cursor claimed to start at id 0 and reused a real signature, and it was refused with a `ValidationError`: status **400 Bad Request**, and one issue whose `code` says why (`cursor_signature`). A cursor is outside input, so a bad one is the client's mistake, not a server error. Your error handler can send the 400 as it is, and the message never repeats the cursor's contents.

Use cursor pagination for "load more" buttons and infinite scrolling, and offset pagination when users need page numbers.

## Transactions

A transaction makes several changes all-or-nothing, as you saw in [the databases lesson](https://zudojs.oyinlola.site/learn/databases). `withTransaction(client, callback)` opens one, passes a transaction client `tx` to your callback, commits if the callback returns and rolls back if it throws. Repositories join the transaction with `withTransaction(tx)`, which returns a copy bound to it:

transaction.tsNode.js only

```ts
import { withTransaction } from "@zudojs/database";
import { BaseError } from "@zudojs/errors";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

try {
  await withTransaction(client, async (tx) => {
    const repo = tasks.withTransaction(tx);
    await repo.create({ title: "Pack bags" });
    await repo.create({ title: "Buy milk" }); // already exists
  });
} catch (error) {
  if (error instanceof BaseError) {
    console.log("transaction failed:", error.statusCode, error.message);
  }
}
console.log("Pack bags saved?", (await tasks.findByTitle("Pack bags")) !== null);

const moved = await withTransaction(client, async (tx) => {
  const repo = tasks.withTransaction(tx);
  await repo.update(2, { priority: "high" });
  await repo.update(3, { priority: "normal" });
  return repo.count({ priority: "high" });
});
console.log("committed, high priority tasks:", moved);
await client.disconnect();
```

Output of `npx tsx transaction.ts`

```ts
transaction failed: 409 Task already exists.
Pack bags saved? false
committed, high priority tasks: 1
```

The second insert failed, so the first one was rolled back too: "Pack bags" was never saved. The second transaction committed both updates together. Use the `tx`-bound repository for every query inside the callback. A query through the ordinary `tasks` repository would run outside the transaction.

### Your own errors inside a transaction

Often the reason to stop a transaction is your own rule, not the database: "project 7 does not exist", "this task is already done". Throw the matching error from [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors). The transaction still rolls back, and the error reaches your caller unchanged, with its own status code:

transaction-errors.tsNode.js only

```ts
import { withTransaction } from "@zudojs/database";
import { BaseError, NotFoundError } from "@zudojs/errors";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

try {
  await withTransaction(client, async (tx) => {
    await tasks.withTransaction(tx).create({ title: "Draw the plan" });
    throw new NotFoundError("Project 7 not found");
  });
} catch (error) {
  if (error instanceof BaseError) {
    console.log(error.name, error.statusCode, error.message);
  }
}
console.log("Draw the plan saved?", (await tasks.findByTitle("Draw the plan")) !== null);
await client.disconnect();
```

Output of `npx tsx transaction-errors.ts`

```ts
NotFoundError 404 Project 7 not found
Draw the plan saved? false
```

The insert was undone, and your API can answer **404** as it should. Any `@zudojs/errors` error keeps its class and status this way (since `@zudojs/database` 1.3.0). Failures that really come from the database, such as the 409 above, still arrive as a `DatabaseError`.

`withTransactionRetry(client, callback, { retries: 3 })` runs the whole callback again when PostgreSQL reports a **serialization failure** or a deadlock, two errors that mean "try again". The [transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions) goes deeper: nesting, savepoints, hooks that run after a commit, and timeouts.

## Health checks and connection pools

Your `/health` route from [creating the project](https://zudojs.oyinlola.site/learn/zudo-create-project) says "ok" even when the database is down. A load balancer then keeps sending traffic to a server that cannot answer. `checkDatabaseHealth` runs a tiny `SELECT 1` with a timeout and tells you the truth:

health.tsNode.js only

```ts
import { checkDatabaseHealth, checkDatabaseReadiness } from "@zudojs/database";
import { setup } from "./setup.js";

const { pg, client } = await setup();

async function healthRoute() {
  const health = await checkDatabaseHealth(client, { timeoutMs: 2_000 });
  return { status: health.healthy ? 200 : 503, body: { database: health.status } };
}

console.log(await healthRoute());
console.log("ready:", (await checkDatabaseReadiness(client)).ready);

await pg.close(); // the database goes away
console.log(await healthRoute());
console.log("ready:", (await checkDatabaseReadiness(client)).ready);
await client.disconnect();
```

Output of `npx tsx health.ts`

```json
{ status: 200, body: { database: 'healthy' } }
ready: true
{ status: 503, body: { database: 'unhealthy' } }
ready: false
```

Once the database was gone, the check reported `unhealthy` and the route answered **503 Service Unavailable**. The body names only the status, never the error's text or the host name: a health endpoint is public.

- **Health** (also called liveness) asks "is this process working?".
- **Readiness** asks "can it take traffic right now?". During start-up, before migrations are done, a server is alive but not ready.

### Connection pools

Opening a connection to a PostgreSQL server is slow: a network round trip, a login, some memory on the server. A **connection pool** opens a few connections once and lends them out, one per query or transaction, taking them back afterwards. When all are busy, the next query waits for a free one.

With Prisma, the pool belongs to the driver adapter, not to `@zudojs/database`. That is why the production example at the top of this lesson passed `max`, `idleTimeoutMillis` and `connectionTimeoutMillis` to `PrismaPg`. A pool that is too big overloads the database; too small, and requests queue. Start with about 10 per server process, and remember that PostgreSQL has a total limit (often 100) shared by all your servers. PGlite is one connection inside your process, so it has no pool.

For long-running servers, `createConnectionManager({ client, healthCheckIntervalMs, reconnect })` checks the connection on a timer and reconnects with growing pauses between tries when it drops. While it waits between tries it keeps the process running, and `disconnect()` stops the retries.

## Practice

TRY IT YOURSELF

### Add a due date

Write migration 3, `add-task-due-date`, that adds a nullable `due_date date` column to `tasks`, with a `down` that removes it. Run all migrations and print the column names of `tasks` from `information_schema.columns`.

**Show a solution**

due-date.tsNode.js only

```ts
import { createMigrationRunner } from "@zudojs/database";
import type { Migration } from "@zudojs/database";
import { openDatabase } from "./database.js";
import { migrations } from "./migrations.js";

const addDueDate: Migration = {
  version: 3,
  name: "add-task-due-date",
  up: async (tx) => {
    await tx.$executeRawUnsafe("ALTER TABLE tasks ADD COLUMN due_date date");
  },
  down: async (tx) => {
    await tx.$executeRawUnsafe("ALTER TABLE tasks DROP COLUMN due_date");
  },
};

const { client } = await openDatabase();
const result = await createMigrationRunner(client, [...migrations, addDueDate]).migrate();
console.log(result.applied.map((m) => m.version));

const columns = await client.queryRawUnsafe<{ column_name: string }[]>(
  "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
  ["tasks"],
);
console.log(columns.map((c) => c.column_name));
await client.disconnect();
```

Output of `npx tsx due-date.ts`

```json
[ 1, 2, 3 ]
[
  'id',
  'title',
  'done',
  'priority',
  'created_at',
  'deleted_at',
  'due_date'
]
```

Remember to add `"dueDate"` to `TASK_MODEL.fields` and `dueDate: string | null` to `Task`, or the adapter's allow-list will refuse the new field.

TRY IT YOURSELF

### Open tasks by priority

Add a method `openByPriority(priority)` to `TaskRepository` that returns the tasks that are not done and have that priority, newest first, using the query builder. Mark task 4 done and try it.

**Show a solution**

open-by-priority.tsNode.js only

```ts
import { createQueryBuilder } from "@zudojs/database";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

class Tasks extends TaskRepository {
  openByPriority(priority: Task["priority"]): Promise<readonly Task[]> {
    const query = createQueryBuilder<keyof Task>()
      .where("done", false)
      .where("priority", priority)
      .orderByDesc("createdAt")
      .orderByDesc("id");
    return this.findByQuery(query);
  }
}

const { pg, client } = await setup();
const tasks = new Tasks(modelDelegate<Task>(pg, TASK_MODEL));
await tasks.update(4, { done: true });
console.log((await tasks.openByPriority("normal")).map((t) => t.id));
console.log((await tasks.openByPriority("high")).map((t) => t.id));
await client.disconnect();
```

Output of `npx tsx open-by-priority.ts`

```json
[ 5, 2, 1 ]
[ 3 ]
```

Sorting by `createdAt` alone is not enough here: the seed created all five tasks in one transaction, so they share a timestamp. Adding `id` as a second sort field makes the order stable.

TRY IT YOURSELF

### A safe page request

Clients send `page` and `limit` as strings in the query string. Write `listTasks(query)` that validates them with `@zudojs/schema` (whole numbers, page at least 1, limit 1 to 50, both optional) and returns a page of tasks sorted by id. Try it with `{ page: "2", limit: "2" }` and with `{ limit: "5000" }`.

**Show a solution**

list-tasks.tsNode.js only

```ts
import { SchemaError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import { TASK_MODEL } from "./database.js";
import type { Task } from "./database.js";
import { modelDelegate } from "./pglite-adapter.js";
import { setup } from "./setup.js";
import { TaskRepository } from "./task.repository.js";

const PageQuery = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  limit: schema.coerce.number().int().min(1).max(50).default(10),
});

const { pg, client } = await setup();
const tasks = new TaskRepository(modelDelegate<Task>(pg, TASK_MODEL));

async function listTasks(query: unknown) {
  const { page, limit } = PageQuery.parse(query);
  const result = await tasks.findPaginated(undefined, {
    pagination: { page, limit },
    sort: [{ field: "id", direction: "asc" }],
  });
  return { tasks: result.data.map((t) => t.title), total: result.meta.total, pages: result.meta.totalPages };
}

console.log(await listTasks({ page: "2", limit: "2" }));
try {
  await listTasks({ limit: "5000" });
} catch (error) {
  if (error instanceof SchemaError) console.log(error.statusCode, error.message);
}
await client.disconnect();
```

Output of `npx tsx list-tasks.ts`

```json
{ tasks: [ 'Call the bank', 'Read a book' ], total: 5, pages: 3 }
400 Validation failed
```

## Recap

- `@zudojs/database` is a PostgreSQL layer on top of Prisma. It needs a `PrismaClientLike`: in production a generated `PrismaClient` with `@prisma/adapter-pg`, here a small adapter over PGlite.
- Connection strings are secrets: read them from the environment, check them at start-up, never print them.
- `createMigrationRunner` and `createSeedRunner` apply numbered migrations and named seeds once, under a lock, and can roll them back.
- `queryRawUnsafe` is safe only with `$1` parameters. Field names are checked against an allow-list.
- `BaseRepository` gives you CRUD, soft delete, `findByQuery`, offset and signed cursor pagination (forward and back; a forged cursor is a 400), and maps database errors to 409 and 404.
- `withTransaction` makes several writes all-or-nothing; bind repositories with `withTransaction(tx)`. Your own errors thrown inside roll it back and keep their status code.
- `checkDatabaseHealth` makes `/health` honest. Pools live in the driver adapter.

Next, [storage abstractions](https://zudojs.oyinlola.site/learn/zudo-storage) show a second, driver-independent way to store data, including files.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
