---
title: "Storage abstractions"
description: "Use @zudojs/storage's driver-independent contracts for databases, files, serialization, locks, connection pools and start-up and shutdown, with a PostgreSQL adapter and local file storage for the Task API."
source: https://zudojs.oyinlola.site/learn/zudo-storage
---

LESSON 57 OF 84

Data Advanced

# Storage abstractions

Use @zudojs/storage's driver-independent contracts for databases, files, serialization, locks, connection pools and start-up and shutdown, with a PostgreSQL adapter and local file storage for the Task API.

- **45 min** to read and try
- **You need:** The Databases with @zudojs/database lesson
- **You build:** Task attachments on disk, a column-safe task repository, fenced locks and a storage health report

  [Test yourself](#test)

## Contracts, not drivers

[@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database) is built for one stack: Prisma and PostgreSQL. `@zudojs/storage` takes a different approach. It defines small **contracts**, TypeScript interfaces that say what a piece of storage must be able to do, and ships code that works with anything that fulfils them:

| Contract | What it stores | Ready-made implementation |
| --- | --- | --- |
| `Database` | Rows, with SQL | None: you write a small adapter for your driver |
| `ObjectStorage` | Files ("objects") under a key | `LocalObjectStorage`, on disk |
| `Serializer` | Values as bytes | `JsonSerializer` |
| `LockManager` | Who is working on what right now | `InMemoryLockManager` |
| `StorageLifecycle` | Start, health, shutdown | `StorageLifecycleManager`, `HealthChecker` |

Your application code depends only on the contracts. Tomorrow you can move files from your disk to a cloud bucket by writing a new `ObjectStorage`, and nothing else changes. That is the same idea as the dependency container in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container): depend on what something does, not on what it is.

Terminal on your computer

```bash
$ npm install @zudojs/storage

added 5 packages, and audited 20 packages in 5s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

You already have `@electric-sql/pglite` from the last lesson. Every example on this page uses Node.js APIs, so run them on your computer with `npx tsx file.ts`.

## The Database contract

The `Database` contract has seven methods: `connect`, `disconnect`, `query`, `execute`, `transaction`, `healthCheck` and `getPoolStats`. A query is an object with the SQL `text` and its `parameters`, so there is no way to call it with values glued into the SQL. Here is an adapter for PGlite. It is shorter than last lesson's, because this contract speaks SQL directly:

pglite-database.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Database, Query, QueryResult, Transaction, TransactionState } from "@zudojs/storage";

async function runQuery<T>(db: Pick<PGlite, "query">, query: Query): Promise<QueryResult<T>> {
  const started = performance.now();
  const result = await db.query<T>(query.text, [...(query.parameters ?? [])]);
  return {
    rows: result.rows,
    // A SELECT reports the rows it returned; INSERT/UPDATE/DELETE the rows they changed.
    rowCount: result.fields.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
    fields: result.fields.map((f) => ({ name: f.name, oid: f.dataTypeID })),
    durationMs: performance.now() - started,
  };
}

export class PgliteDatabase implements Database {
  private readonly pg: PGlite;

  constructor(dataDir?: string) {
    this.pg = new PGlite(dataDir);
  }
  async connect() {
    await this.pg.waitReady;
  }
  async disconnect() {
    if (!this.pg.closed) await this.pg.close();
  }
  query<T = Record<string, unknown>>(query: Query) {
    return runQuery<T>(this.pg, query);
  }
  async execute(query: Query) {
    return { rowCount: (await runQuery(this.pg, query)).rowCount };
  }
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (pgTx) => {
      let state: TransactionState = "active";
      const tx: Transaction = {
        id: randomUUID(),
        get state() { return state; },
        query: (q) => runQuery(pgTx, q),
        execute: async (q) => ({ rowCount: (await runQuery(pgTx, q)).rowCount }),
        savepoint: async (name) => { await pgTx.exec(`SAVEPOINT "${name}"`); },
        rollbackToSavepoint: async (name) => { await pgTx.exec(`ROLLBACK TO SAVEPOINT "${name}"`); },
      };
      try {
        const result = await callback(tx);
        state = "committed";
        return result;
      } catch (error) {
        state = "rolledback";
        throw error;
      }
    });
  }
  async healthCheck() {
    const started = performance.now();
    try {
      await this.pg.query("SELECT 1");
      return { healthy: true, latencyMs: performance.now() - started, status: "connected" };
    } catch {
      return { healthy: false, latencyMs: performance.now() - started, status: "unreachable" };
    }
  }
  getPoolStats() {
    return { total: 1, idle: 1, active: 0, waiting: 0 };
  }
}
```

PGlite is a single connection inside your process, so `getPoolStats` always reports one. The [connection pools](#pool) section shows a real pool. Savepoint names are written into the SQL, so only ever pass names from your own code, never from a request.

A tasks table for this lesson. The owner is stored per task, because every task belongs to a user:

setup.tsNode.js only

```ts
import { PgliteDatabase } from "./pglite-database.js";

export interface TaskRow extends Record<string, unknown> {
  id: number;
  title: string;
  done: boolean;
  owner_id: string;
}

export async function setup() {
  const db = new PgliteDatabase();
  await db.connect();
  await db.execute({
    text: `CREATE TABLE tasks (
      id       serial PRIMARY KEY,
      title    text NOT NULL,
      done     boolean NOT NULL DEFAULT false,
      owner_id text NOT NULL
    )`,
  });
  return db;
}
```

## A repository with a column allow-list

`BaseRepository` from `@zudojs/storage` builds parameterized SQL for the usual operations: `findById`, `findByIds`, `findAll`, `create`, `update`, `delete`, `exists` and `count`. Column names cannot be parameters, so it checks every one it writes into SQL. Give it `columns`, the list of columns it may write, filter and sort by:

repository.tsNode.js only

```ts
import { BaseRepository } from "@zudojs/storage";
import { setup } from "./setup.js";
import type { TaskRow } from "./setup.js";

const db = await setup();
const tasks = new BaseRepository<TaskRow, number>(db, {
  tableName: "tasks",
  columns: ["title", "done", "owner_id"],
});

const newTask = (title: string, ownerId: string) => ({ title, owner_id: ownerId }) as TaskRow;
await tasks.create(newTask("Buy milk", "ada"));
await tasks.create(newTask("Write report", "ada"));
await tasks.create(newTask("Fix the bike", "grace"));

console.log(await tasks.update(1, { done: true }));
console.log(await tasks.findAll({ orderBy: "title", order: "ASC", limit: 10, offset: 0 }));
console.log("ada has", await tasks.count({ owner_id: "ada" }), "tasks");
console.log("task 3 exists?", await tasks.exists(3));

await tasks.delete(3);
console.log("task 3 exists?", await tasks.exists(3));
await db.disconnect();
```

Output of `npx tsx repository.ts`

```json
{ id: 1, title: 'Buy milk', done: true, owner_id: 'ada' }
[
  { id: 1, title: 'Buy milk', done: true, owner_id: 'ada' },
  { id: 3, title: 'Fix the bike', done: false, owner_id: 'grace' },
  { id: 2, title: 'Write report', done: false, owner_id: 'ada' }
]
ada has 2 tasks
task 3 exists? true
task 3 exists? false
```

`create` takes a whole entity, including the `id` the database has not made yet. The `as TaskRow` in `newTask` tells TypeScript to accept the object without one.

### What the allow-list stops, and what it doesn't

Now the attacks. A client sends a JSON body, and a careless route passes it straight to the repository. This is called **mass assignment**: the client sets fields it was never meant to touch.

mass-assignment.tsNode.js only

```ts
import { BaseRepository } from "@zudojs/storage";
import { setup } from "./setup.js";
import type { TaskRow } from "./setup.js";

const db = await setup();
const tasks = new BaseRepository<TaskRow, number>(db, {
  tableName: "tasks",
  columns: ["title", "done", "owner_id"],
});
await tasks.create({ title: "Buy milk", owner_id: "ada" } as TaskRow);

const bodies: unknown[] = [
  { done: true, is_admin: true },          // a column that does not exist
  { title: "x', owner_id = 'mallory" },    // SQL in a value
  { done: true, owner_id: "mallory" },      // a real column the client must not set
];
for (const body of bodies) {
  try {
    const row = await tasks.update(1, body as Partial<TaskRow>);
    console.log("UPDATED:", row);
  } catch (error) {
    const e = error as Error & { code?: string; statusCode?: number };
    console.log("refused:", e.statusCode, e.code, "-", e.message);
  }
}

for (const orderBy of ["title; DROP TABLE tasks", "id"]) {
  try {
    await tasks.findAll({ orderBy });
  } catch (error) {
    console.log("refused sort:", (error as Error).message);
  }
}
await db.disconnect();
```

Output of `npx tsx mass-assignment.ts`

```ts
refused: 400 STORAGE_IDENTIFIER_NOT_ALLOWED - Invalid column name: "is_admin" is not allowed
UPDATED: {
  id: 1,
  title: "x', owner_id = 'mallory",
  done: false,
  owner_id: 'ada'
}
UPDATED: {
  id: 1,
  title: "x', owner_id = 'mallory",
  done: true,
  owner_id: 'mallory'
}
refused sort: Invalid sort column: only letters, digits and underscores are allowed
refused sort: Invalid sort column: "id" is not allowed
```

Go through the results one by one:

- `is_admin` is not in the allow-list, so the update was refused with a 400.
- The SQL in the title was not refused, and did no harm: it is a parameter, so PostgreSQL stored it as an odd title. That is exactly right.
- **The third body worked, and that is a bug in the route.** `owner_id` is on the allow-list, because your own code must be able to set it when it creates a task. So the repository cannot know that *this* caller may not change it. Mallory now owns Ada's task.
- Sort columns are checked too. Even `id` was refused, because it is not on the list.

The allow-list is a safety net for SQL, not a permission system. The fix belongs at the edge of your app: a schema that accepts only the fields a client may change, as in [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation). The owner is set by the server from the logged-in user, never read from the body:

safe-update.tsNode.js only

```ts
import { BaseRepository } from "@zudojs/storage";
import { schema } from "@zudojs/schema";
import { setup } from "./setup.js";
import type { TaskRow } from "./setup.js";

const TaskChanges = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.boolean(),
}).partial().strict();

const db = await setup();
const tasks = new BaseRepository<TaskRow, number>(db, {
  tableName: "tasks",
  columns: ["title", "done", "owner_id"],
});
await tasks.create({ title: "Buy milk", owner_id: "ada" } as TaskRow);

const bad = TaskChanges.safeParse({ done: true, owner_id: "mallory" });
if (!bad.success) {
  console.log("400:", bad.issues.map((i) => i.message));
}

const good = TaskChanges.parse({ done: true });
console.log("parsed:", good);
console.log("saved:", await tasks.update(1, good));
console.log("undefined is skipped:", await tasks.update(1, { title: undefined, done: false }));
await db.disconnect();
```

Output of `npx tsx safe-update.ts`

```ts
400: [ 'Unknown key: owner_id' ]
parsed: { done: true }
saved: { id: 1, title: 'Buy milk', done: true, owner_id: 'ada' }
undefined is skipped: { id: 1, title: 'Buy milk', done: false, owner_id: 'ada' }
```

`.partial()` makes every field optional, since a client may change just one. `.strict()` makes the schema reject any key it does not know, so the request that tries to change the owner is answered with 400 before it gets near the database.

The update changed only `done`. A key whose value is `undefined` counts as "not sent": `BaseRepository` leaves it out of the SQL, so the title was not touched. To really empty a column that allows it, pass `null`, which writes `NULL`.

### Separate lists for writing, filtering and sorting

So far `columns` was used for writes, filters and sorting alike. That is why the sort by `id` above was refused: to allow it, you would have to add `id` to `columns`, and then `update` would accept a new `id` too. When the three uses should differ, give each its own list: `writableColumns` for `create` and `update`, `filterableColumns` for `count`, and `sortableColumns` for `findAll`. Each one falls back to `columns`:

column-lists.tsNode.js only

```ts
import { BaseRepository } from "@zudojs/storage";
import { setup } from "./setup.js";
import type { TaskRow } from "./setup.js";

const db = await setup();
const tasks = new BaseRepository<TaskRow, number>(db, {
  tableName: "tasks",
  columns: ["title", "done", "owner_id"],
  sortableColumns: ["id", "title"],
});
await tasks.create({ title: "Buy milk", owner_id: "ada" } as TaskRow);
await tasks.create({ title: "Answer mail", owner_id: "ada" } as TaskRow);

const newestFirst = await tasks.findAll({ orderBy: "id", order: "DESC" });
console.log(newestFirst.map((t) => `${t.id} ${t.title}`));
try {
  await tasks.update(1, { id: 99 });
} catch (error) {
  console.log("refused:", (error as Error).message);
}
await db.disconnect();
```

Output of `npx tsx column-lists.ts`

```json
[ '2 Answer mail', '1 Buy milk' ]
refused: Invalid column name: "id" is not allowed
```

Clients may now sort by `id`, but they still cannot write it.

## Object storage for files

Databases are for rows. Files, such as images, PDFs or a task's attachments, go into **object storage**. An object is a file plus a little metadata (its content type, size and a hash), stored under a **key** like `tasks/1/notes.txt`. Cloud services such as Amazon S3 work the same way. `LocalObjectStorage` keeps objects in a folder on disk:

attachments.tsNode.js only

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage } from "@zudojs/storage";

const folder = await mkdtemp(join(tmpdir(), "task-files-"));
const files = new LocalObjectStorage(folder, { maxObjectBytes: 1024 * 1024 });
const text = (s: string) => new TextEncoder().encode(s);

const saved = await files.put("tasks/1/notes.txt", text("Oat milk, not cow milk."), {
  contentType: "text/plain",
  metadata: { uploadedBy: "ada" },
});
console.log(saved.key, saved.size, saved.contentType, saved.metadata);
await files.put("tasks/1/list.md", text("- milk\n- bread"), { contentType: "text/markdown" });
await files.put("tasks/2/plan.md", text("# Plan"), { contentType: "text/markdown" });

const notes = await files.get("tasks/1/notes.txt");
if (notes) {
  console.log(new TextDecoder().decode(await notes.arrayBuffer()));
}
console.log("missing:", await files.get("tasks/9/nothing.txt"));

const listing = await files.list("tasks/1/");
console.log(listing.objects.map((o) => `${o.key} (${o.size} bytes)`));

await files.delete("tasks/1/list.md");
console.log("still there?", await files.exists("tasks/1/list.md"));
```

Output of `npx tsx attachments.ts`

```ts
tasks/1/notes.txt 23 text/plain { uploadedBy: 'ada' }
Oat milk, not cow milk.
missing: null
[ 'tasks/1/list.md (14 bytes)', 'tasks/1/notes.txt (23 bytes)' ]
still there? false
```

`put` returned the object's metadata: the key, the size in bytes, and the content type and metadata you gave it. It also computes an `etag`, a SHA-256 hash of the content, that you can use to tell whether a file changed. `get` returns `null` for a missing key, so you can answer 404. `list(prefix)` finds every object whose key starts with the prefix, which is why keys that look like folders are useful: one prefix per task.

`list` returns at most `maxKeys` objects at a time (1000 by default). When there are more, `isTruncated` is `true` and `continuationToken` tells the next call where to go on, like the cursor from last lesson.

### Keys from users

Keys often contain something a user chose, such as a file name. On disk, a key becomes a path, and a path with `..` climbs out of its folder. That attack is called **path traversal**, and it can read or overwrite any file your server can reach. `LocalObjectStorage` refuses such keys, and anything bigger than `maxObjectBytes`:

traversal.tsNode.js only

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage } from "@zudojs/storage";

const folder = await mkdtemp(join(tmpdir(), "task-files-"));
const files = new LocalObjectStorage(folder, { maxObjectBytes: 1024 });

const attempts: [string, Uint8Array][] = [
  ["tasks/1/../../../etc/passwd", new Uint8Array(1)],
  ["/etc/passwd", new Uint8Array(1)],
  ["tasks//notes.txt", new Uint8Array(1)],
  ["tasks/1/huge.bin", new Uint8Array(5000)],
];
for (const [key, data] of attempts) {
  try {
    await files.put(key, data);
    console.log("stored", key);
  } catch (error) {
    const e = error as Error & { code?: string; statusCode?: number };
    console.log(e.statusCode, e.code);
  }
}
```

Output of `npx tsx traversal.ts`

```ts
400 STORAGE_PATH_TRAVERSAL
400 STORAGE_PATH_TRAVERSAL
400 STORAGE_INVALID_KEY
413 STORAGE_OBJECT_TOO_LARGE
```

Each refusal carries a status code you can pass on: 400 for a bad key, **413 Payload Too Large** for a big file. Even so, don't use a user's file name as the key. Make the key yourself, for example `tasks/${taskId}/${randomUUID()}`, and keep the original name in the metadata. Check `taskId` is a task the user may touch, which [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions) covers.

## Serialization

Storage keeps bytes. **Serialization** turns a value into bytes, and **deserialization** turns them back. `JSON.stringify` loses information: a `Date` becomes a string, and a `Map`, `Set` or `BigInt` is lost or throws. `JsonSerializer` keeps them, by tagging each special value with its type:

serialize.tsNode.js only

```ts
import { JsonSerializer } from "@zudojs/storage";

const serializer = new JsonSerializer();
const snapshot = {
  id: 1,
  due: new Date("2026-10-01T09:00:00Z"),
  tags: new Set(["home", "shopping"]),
  views: 12n,
};

const bytes = serializer.serialize(snapshot);
console.log(bytes.constructor.name, bytes.length, "bytes");
console.log(new TextDecoder().decode(bytes));

const back = serializer.deserialize<typeof snapshot>(bytes);
console.log(back);
console.log(back.due instanceof Date, back.tags.has("home"));
```

Output of `npx tsx serialize.ts`

```ts
Uint8Array 160 bytes
{"id":1,"due":{"$type":"Date","$value":"2026-10-01T09:00:00.000Z"},"tags":{"$type":"Set","$value":["home","shopping"]},"views":{"$type":"BigInt","$value":"12"}}
{
  id: 1,
  due: 2026-10-01T09:00:00.000Z,
  tags: Set(2) { 'home', 'shopping' },
  views: 12n
}
true true
```

The result is a `Uint8Array`, ready to `put` into object storage or a cache. The `$type` tags are how `deserialize` knows to rebuild a `Date`, a `Set` and a `BigInt`. `JsonSerializer` only speaks JSON: ask it for `"msgpack"` and it throws a `StorageError` that says so. For more control, [the serialization lesson](https://zudojs.oyinlola.site/learn/zudo-serialization) covers `@zudojs/serialization`, which this class uses inside.

## Locks and fencing tokens

Two requests edit the same task at the same moment. Both read it, both change it, both save, and the first change is lost. A **lock** lets only one of them work on the task at a time. `acquire` waits for the lock; `tryAcquire` gives up at once and returns `null`:

locks.tsNode.js only

```ts
import { InMemoryLockManager } from "@zudojs/storage";

const locks = new InMemoryLockManager();

const first = await locks.acquire("task:1", { ttl: 5_000 });
console.log("first holds", first.resource, "with fence", first.fence);
console.log("try again:", await locks.tryAcquire("task:1", 5_000));

const second = locks.acquire("task:1", { ttl: 5_000, timeout: 1_000 });
setTimeout(() => void first.release(), 50);
const lock = await second;
console.log("second got it after release, fence", lock.fence);
await lock.release();

try {
  await locks.acquire("task:2", { ttl: 5_000 });
  await locks.acquire("task:2", { timeout: 100 });
} catch (error) {
  const e = error as Error & { code?: string; statusCode?: number };
  console.log(e.statusCode, e.code, "-", e.message);
}
locks.clear();
```

Output of `npx tsx locks.ts`

```ts
first holds task:1 with fence 1
try again: null
second got it after release, fence 2
409 STORAGE_LOCK_ACQUIRE_TIMEOUT - Failed to acquire lock on "task:2" within 100ms
```

The last `acquire` gave up after its 100 ms `timeout` with **409 Conflict**: someone else is working on that task right now. Your route can send the 409 as it is, and the client can try again.

Every lock has a `ttl` (time to live). If its holder crashes, the lock expires and others can go on. But a holder that is only slow can lose its lock without noticing, keep working, and overwrite the next holder's work. The **fence** number solves this. Every new lock gets a bigger fence, so the thing you protect can refuse any write that carries an older one:

fencing.tsNode.js only

```ts
import { InMemoryLockManager } from "@zudojs/storage";

class TaskStore {
  private highestFence = 0;
  title = "Buy milk";

  save(title: string, fence: number): void {
    if (fence < this.highestFence) {
      throw new Error(`stale fence ${fence}, current is ${this.highestFence}`);
    }
    this.highestFence = fence;
    this.title = title;
  }
}

const locks = new InMemoryLockManager();
const store = new TaskStore();

const slow = await locks.acquire("task:1", { ttl: 30 });
await new Promise((resolve) => setTimeout(resolve, 60)); // too slow: the lock expired
console.log("slow still holds it?", slow.isHeld());

const fast = await locks.acquire("task:1", { ttl: 5_000 });
store.save("Buy oat milk", fast.fence);
await fast.release();

try {
  store.save("Buy cow milk", slow.fence);
} catch (error) {
  console.log((error as Error).message);
}
console.log("title:", store.title);
```

Output of `npx tsx fencing.ts`

```ts
slow still holds it? false
stale fence 1, current is 2
title: Buy oat milk
```

The slow worker's write was refused, and the fast worker's change survived.

> IN MEMORY MEANS ONE PROCESS
>
> An `InMemoryLockManager` only knows about locks in its own process. As soon as you run two copies of your server, each has its own locks and they protect nothing. For several servers, use a lock the servers share: PostgreSQL advisory locks through `createLockManager` from [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database), or a `LockManager` you write over Redis.

## Connection pools

You met pools at the end of the last lesson: a few database connections, opened once, lent out one at a time. `ConnectionPool` is a general-purpose pool. You give it a **factory**, a function that opens one connection, and limits. To see it lend and take back, this example gives each "connection" a name and runs its queries on one shared PGlite:

pool.tsNode.js only

```ts
import { ConnectionPool } from "@zudojs/storage";
import type { Connection } from "@zudojs/storage";
import { setup } from "./setup.js";

const db = await setup();
let opened = 0;

async function openConnection(): Promise<Connection> {
  opened += 1;
  const id = `conn-${opened}`;
  let state: Connection["state"] = "connected";
  return {
    id,
    get state() { return state; },
    query: (q) => db.query(q),
    execute: (q) => db.execute(q),
    ping: async () => state === "connected",
    close: async () => { state = "disconnected"; },
  };
}

const pool = new ConnectionPool(openConnection, { min: 1, max: 2, acquireTimeout: 200 });
await pool.initialize();
console.log("start:", pool.getStats());

const a = await pool.acquire();
const b = await pool.acquire();
const waiting = pool.acquire();
console.log("busy:", pool.getStats());

await pool.release(a);
const c = await waiting;
console.log("the waiting request got", c.id);

try {
  await pool.acquire();
} catch (error) {
  const e = error as Error & { statusCode?: number };
  console.log(e.statusCode, e.message);
}
await pool.release(b);
await pool.release(c);

const count = await pool.use((conn) => conn.query({ text: "SELECT count(*)::int AS n FROM tasks" }));
console.log("use() returned", count.rows, "and gave the connection back:", pool.getStats());

await pool.drain();
console.log("after drain:", pool.getStats());
await db.disconnect();
```

Output of `npx tsx pool.ts`

```ts
start: { total: 1, idle: 1, active: 0, waiting: 0 }
busy: { total: 2, idle: 0, active: 2, waiting: 1 }
the waiting request got conn-1
503 Acquire timeout: no connection available within 200ms
use() returned [ { n: 0 } ] and gave the connection back: { total: 2, idle: 2, active: 0, waiting: 0 }
after drain: { total: 0, idle: 0, active: 0, waiting: 0 }
```

- `min: 1` opened one connection at start-up. The second was opened when it was needed, and no more than `max: 2` ever exist.
- With both lent out, the third `acquire` **waited**. As soon as `conn-1` came back, it went to the waiting request.
- A request that waits longer than `acquireTimeout` fails with **503 Service Unavailable**, which tells the client to try again a little later. Under heavy load, failing fast is better than letting requests pile up.
- `use(fn)` acquires, runs your function and always releases, even when the function throws. Prefer it: a connection you forget to release is lost to the pool for good.
- `drain()` waits for connections in use, then closes them all. Call it on shutdown.

## Storage lifecycle and health

Storage has to start before your server takes requests and stop after the last one. `StorageLifecycleManager` runs the steps for every registered component in order: `initialize`, `start`, and on shutdown `drain` (finish what is in progress) and `shutdown`. `HealthChecker` asks each one how it is doing. Each component implements the `StorageLifecycle` contract; here is a small wrapper for any component that can be checked:

lifecycle.tsNode.js only

```ts
import { HealthChecker, StorageLifecycleManager } from "@zudojs/storage";
import type { StorageHealth, StorageLifecycle, StorageLifecyclePhase } from "@zudojs/storage";
import { setup } from "./setup.js";

class Component implements StorageLifecycle {
  private phase: StorageLifecyclePhase = "uninitialized";
  constructor(
    private readonly name: string,
    private readonly check: () => Promise<StorageHealth>,
  ) {}
  async initialize() { this.phase = "initializing"; }
  async start() { this.phase = "ready"; console.log(this.name, "ready"); }
  healthCheck() { return this.check(); }
  async drain() { this.phase = "draining"; }
  async shutdown() { this.phase = "shutdown"; console.log(this.name, "shut down"); }
  getPhase() { return this.phase; }
}

const db = await setup();
const database = new Component("database", () => db.healthCheck());
const files = new Component("files", async () => ({ healthy: false, latencyMs: 0, status: "disk full" }));

const storage = new StorageLifecycleManager();
await storage.register(database);
await storage.register(files);
await storage.initialize();
await storage.start();
console.log("phase:", storage.getPhase());

const health = new HealthChecker();
health.register("database", database);
health.register("files", files);
const report = await health.checkAll();
console.log("healthy:", report.healthy);
for (const { name, health: h } of report.components) {
  console.log(` ${name}: ${h.healthy ? "ok" : "FAILING"} (${h.status})`);
}

await storage.drain();
await storage.shutdown();
console.log("phase:", storage.getPhase());
await db.disconnect();
```

Output of `npx tsx lifecycle.ts`

```ts
database ready
files ready
phase: ready
healthy: false
 files: FAILING (disk full)
 database: ok (connected)
files shut down
database shut down
phase: shutdown
```

The report is unhealthy as a whole because one component is, and it names which. That is what your `/health` route should turn into a 503, as in the last lesson, while your logs get the details.

Notice that shutdown ran in the **reverse** order of start-up: files first, then the database. `drain` and `shutdown` visit components one at a time, last registered first. So register a component after the ones it uses: it starts after them and stops before them, while they still work. A component that fails to stop does not keep the others from stopping.

## Practice

TRY IT YOURSELF

### Attachments with safe keys

Write `saveAttachment(taskId, fileName, bytes)` that stores the file under `tasks/<taskId>/<random id>`, keeps the original name in the metadata, and returns the key. `taskId` must be a positive whole number. Save `"../../secret.txt"` and show that its name is kept but its key is safe.

**Show a solution**

save-attachment.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage } from "@zudojs/storage";

const files = new LocalObjectStorage(await mkdtemp(join(tmpdir(), "task-files-")));

async function saveAttachment(taskId: number, fileName: string, bytes: Uint8Array): Promise<string> {
  if (!Number.isSafeInteger(taskId) || taskId < 1) {
    throw new RangeError("taskId must be a positive whole number");
  }
  const key = `tasks/${taskId}/${randomUUID()}`;
  await files.put(key, bytes, { metadata: { fileName: fileName.slice(0, 200) } });
  return key;
}

const key = await saveAttachment(1, "../../secret.txt", new TextEncoder().encode("hello"));
console.log(/^tasks\/1\/[0-9a-f-]{36}$/.test(key));
console.log((await files.metadata(key))?.metadata);
try {
  await saveAttachment(-1, "a.txt", new Uint8Array(1));
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx save-attachment.ts`

```ts
true
{ fileName: '../../secret.txt' }
taskId must be a positive whole number
```

TRY IT YOURSELF

### A per-task lock helper

Write `withTaskLock(taskId, work)` that acquires `task:<id>` with a 5 second TTL and a 1 second wait, runs `work(fence)`, and always releases the lock, even when `work` throws. Run two calls for the same task at the same time and print the order they run in.

**Show a solution**

task-lock.tsNode.js only

```ts
import { InMemoryLockManager } from "@zudojs/storage";

const locks = new InMemoryLockManager();

async function withTaskLock<T>(taskId: number, work: (fence: number) => Promise<T>): Promise<T> {
  const lock = await locks.acquire(`task:${taskId}`, { ttl: 5_000, timeout: 1_000 });
  try {
    return await work(lock.fence);
  } finally {
    await lock.release();
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
await Promise.all([
  withTaskLock(1, async (fence) => { console.log("A starts, fence", fence); await pause(30); console.log("A ends"); }),
  withTaskLock(1, async (fence) => { console.log("B starts, fence", fence); console.log("B ends"); }),
]);
```

Output of `npx tsx task-lock.ts`

```ts
A starts, fence 1
A ends
B starts, fence 2
B ends
```

B waited until A released the lock, so the two never overlapped. `finally` is what guarantees the release.

## Recap

- `@zudojs/storage` defines contracts (`Database`, `ObjectStorage`, `Serializer`, `LockManager`, `StorageLifecycle`) so your code does not depend on one driver.
- Its `BaseRepository` builds parameterized SQL and checks every column against `columns` (or the separate `writableColumns`, `filterableColumns` and `sortableColumns`). That stops SQL tricks, not mass assignment: validate bodies with a strict schema and set owners on the server. An `undefined` value is never written; `null` is.
- `LocalObjectStorage` stores files by key, refuses path traversal and oversized files, and lists by prefix. Generate keys yourself.
- `JsonSerializer` keeps `Date`, `Map`, `Set` and `BigInt` through a round trip to bytes.
- Locks need a TTL and a fence check; waiting too long for one is a 409. `InMemoryLockManager` only works inside one process.
- `ConnectionPool` lends a bounded number of connections; `use()` always gives them back, and a request that waits too long gets a 503. `StorageLifecycleManager` and `HealthChecker` start, check and stop everything, stopping in reverse order.

Next: [transactions](https://zudojs.oyinlola.site/learn/zudo-transactions) that span many functions, with savepoints, hooks and retries.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
