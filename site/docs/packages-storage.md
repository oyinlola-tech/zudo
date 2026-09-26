---
title: "@zudojs/storage — Storage Infrastructure Documentation"
description: "Complete documentation for @zudojs/storage — database, object storage, repository, serialization, locking, and lifecycle abstractions."
source: https://zudojs.oyinlola.site/docs/packages-storage
---

v1.2.0

# @zudojs/storage

Storage infrastructure for the Zudojs framework. Database abstraction with connection pooling, transaction support with savepoints, generic repository pattern, object storage, distributed locking, lifecycle management, and health checking.

STORAGE DATABASE OBJECT REPOSITORY LOCKING LIFECYCLE HEALTH

## OVERVIEW

Every application has to keep something somewhere: rows in a database, uploaded files on disk, a flag saying "only one worker may run this job now". This package gives you interfaces for those jobs plus a few working implementations.

An **interface** is a list of method names and argument types with no code behind it. Your code talks to the interface and you decide later which real driver sits behind it. That is how the same repository runs against PostgreSQL in production and a fake in tests.

The package ships no PostgreSQL, S3 or Redis client. It ships the shape those must fit, plus a filesystem object store, a connection pool, a repository base class, an in-process lock manager, a serializer, and lifecycle and health helpers.

Use it when

- You want CRUD on a SQL table without hand-writing every statement.
- You store uploads on local disk and want traversal and size protection.
- You need to bound how many database connections your process opens.
- You want one health check covering several storage components.

Do not use it when

- You want an S3, GCS or Azure client. Only a filesystem store ships.
- You need signed URLs. Nothing here produces one.
- You need locks shared across machines.
- You need joins, migrations or a query builder.

> **What ships versus what is only a shape**
>
> **Real classes:** `LocalObjectStorage`, `ConnectionPool`, `BaseRepository`, `InMemoryLockManager`, `JsonSerializer`, `StorageLifecycleManager`, `HealthChecker`.
>
>
>
> **Interfaces you implement yourself:** `Database`, `Connection`, `Transaction`. Nothing here connects to a database for you.

## INSTALLATION

Install the package; its four `@zudojs` dependencies come with it. Add `@zudojs/errors` too if you want to catch `StorageError` by class.

```bash
$ npm install @zudojs/storage
$ npm install @zudojs/errors
```

Node 24 or newer, ESM only — use `import`, not `require`.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

The file store needs nothing but a directory. This saves a text file, reads it back, and lists what is stored.

```ts
import { LocalObjectStorage } from "@zudojs/storage";

const files = new LocalObjectStorage("./data/uploads");

const bytes = new TextEncoder().encode("hello world");
const meta = await files.put("notes/greeting.txt", bytes, {
  contentType: "text/plain",
});
console.log(meta.key, meta.size);   // notes/greeting.txt 11

const found = await files.get("notes/greeting.txt");
console.log(new TextDecoder().decode(await found!.arrayBuffer()));

const page = await files.list();
console.log(page.objects.map((o) => o.key)); // [ 'notes/greeting.txt' ]
```

**What you should see:** the key and size, then `hello world`, then the key list — and a real file at `./data/uploads/notes/greeting.txt`. Directories are created for you.

## OBJECT STORAGE

**Object storage** keeps whole files — images, PDFs, exports — where each file is saved and fetched as one lump of bytes under a name. You never open, seek or append; you put a whole object and get a whole object.

A **bucket** is the container those objects live in. Here it is a directory on disk: the `basePath` you pass to the constructor. One `LocalObjectStorage` instance is one bucket.

A **key** is an object's name inside the bucket, such as `avatars/u_1.png`. It looks like a path, and here it is one, relative to the base directory. Slashes become real subdirectories.

Every store offers these six methods. This is the `ObjectStorage` interface as declared.

```ts
interface ObjectStorage {
  put(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array>,
    options?: ObjectPutOptions,
  ): Promise<ObjectMetadata>;
  get(key: string): Promise<ObjectData | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<ObjectMetadata | null>;
  list(prefix?: string, options?: ListOptions): Promise<ListObjectsResult>;
}
```

`get` and `metadata` return `null` for a missing key instead of throwing, and `delete` on a missing key does nothing.

> **One backend, and no signed URLs**
>
> `LocalObjectStorage` is the only implementation in the package, and it writes to the local filesystem. There is no S3, GCS, Azure or MinIO class, and no `signedUrl` or `presign` method anywhere in the source. A *signed URL* — a link that grants time-limited access to one object without a login — is a feature of cloud buckets, not of this package. For either, write a class implementing `ObjectStorage` over your provider's SDK.

### Streams and large files

A **stream** is data delivered in pieces over time instead of all at once. A `ReadableStream<Uint8Array>` hands you one chunk of bytes, then the next, until it says it is done.

The reason to care is memory. A 500 MB upload held as one `Uint8Array` is 500 MB of your process; ten at once ends the process. Streaming lets bytes arrive in chunks so nothing has to hold the whole file.

So `put` accepts a stream and you can pass a request body straight through. Know what the local store then does: it reads the stream into one buffer, counting as it goes, and rejects the write the moment the total passes `maxObjectBytes`. The byte limit, not the stream, is what protects memory here — set it.

This streams a body into the store under a 5 MB ceiling.

```ts
import { LocalObjectStorage } from "@zudojs/storage";
import { StorageError } from "@zudojs/errors";

const uploads = new LocalObjectStorage("./data/uploads", {
  maxObjectBytes: 5 * 1024 * 1024,
});

const body = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("chunk one "));
    controller.enqueue(new TextEncoder().encode("chunk two"));
    controller.close();
  },
});

try {
  const meta = await uploads.put("reports/q1.txt", body);
  console.log(meta.size); // 19
} catch (error) {
  if (error instanceof StorageError) {
    console.error(error.code); // STORAGE_OBJECT_TOO_LARGE, status 413
  }
}
```

**What you should see:** `19`. Over the limit it would throw before anything appeared under that key: bytes land in a temp file and are renamed into place only once complete, so a failed write never leaves half an object. The default ceiling is `DEFAULT_MAX_OBJECT_BYTES`, 64 MiB.

Reading is symmetric: `get` returns an `ObjectData` with a `body` stream and an `arrayBuffer()` shortcut. Use the shortcut only for small objects.

### Keys cannot escape the bucket

A key from a request may be hostile: `../../etc/passwd`. Keys are opaque, as in S3: absolute keys, keys with a null byte, and keys with a `.` or `..` segment (`tenantA/../tenantB/x`) all throw `STORAGE_PATH_TRAVERSAL` (status 400), and a key with an empty segment (`a//b`) throws `STORAGE_INVALID_KEY`. Keys are never normalised, so a `${tenant}/${key}` prefix cannot be escaped, and no spelling of a key reaches the reserved `.zudo-object-meta` directory.

The check compares paths, not string prefixes, so `/data/store-secrets` is outside `/data/store`. The real path is checked too, so a symlink planted inside cannot redirect a read or write out. A base directory that is itself reached through a symlink is supported; containment is checked against its real location.

### Listing a page at a time

`list` returns one sorted page plus a cursor. A **cursor** is a bookmark: hand back the token you were given to get the next page.

```ts
import { LocalObjectStorage } from "@zudojs/storage";

const files = new LocalObjectStorage("./data/uploads");

for (const name of ["a", "b", "c", "d"]) {
  await files.put(`docs/${name}.txt`, new TextEncoder().encode(name));
}

let token: string | undefined;
do {
  const page = await files.list("docs/", { maxKeys: 2, continuationToken: token });
  console.log(page.objects.map((o) => o.key));
  token = page.isTruncated ? page.continuationToken : undefined;
} while (token);
```

**What you should see:** `[ 'docs/a.txt', 'docs/b.txt' ]`, then `[ 'docs/c.txt', 'docs/d.txt' ]`, then the loop ends. Without `maxKeys` the page size is `DEFAULT_MAX_KEYS`, 1000. Call `list()` again *without* the token and you get the first page forever.

## REPOSITORY

A **repository** is one object that owns all the queries for one table. Instead of scattering SQL through your handlers you call `users.findById("u_1")` and the repository writes the statement.

`BaseRepository` gives you eight operations: `findById`, `findByIds`, `create`, `update`, `delete`, `exists`, `findAll` and `count`. It runs them through a `Database` — an interface, not a class you can construct. You write the small adapter that forwards to your driver.

This example uses a stub database so it runs on its own; swap the two method bodies for your driver's calls.

```ts
import { BaseRepository } from "@zudojs/storage";
import type { Database, Query } from "@zudojs/storage";

const database: Database = {
  connect: async () => {},
  disconnect: async () => {},
  query: async (q: Query) => {
    console.log(q.text, q.parameters);
    return { rows: [], rowCount: 0, fields: [] };
  },
  execute: async () => ({ rowCount: 0 }),
  transaction: async () => {
    throw new Error("transaction is your adapter's job");
  },
  healthCheck: async () => ({ healthy: true, latencyMs: 0, status: "ok" }),
  getPoolStats: () => ({ total: 1, idle: 1, active: 0, waiting: 0 }),
};

interface User extends Record<string, unknown> {
  id: string;
  email: string;
  name: string;
}

const users = new BaseRepository<User, string>(database, {
  tableName: "users",
  primaryKey: "id",
  columns: ["id", "email", "name"],
});

await users.findById("u_1");
// SELECT * FROM users WHERE id = $1  [ 'u_1' ]

await users.findAll({ orderBy: "email", limit: 20, offset: 0 });
// SELECT * FROM users ORDER BY email ASC LIMIT $1 OFFSET $2  [ 20, 0 ]
```

**What you should see:** the two statements above, printed by the stub. Note that `20` and `0` arrive as parameters, not pasted into the text.

### Why column names are checked

Values are safe because they travel as parameters: the `$1` markers keep them out of the statement text. Column and table *names* cannot be parameters — no SQL driver allows it — so they are written into the text directly.

That matters because the natural call is `repo.create(req.body)`, and the *keys* of that body become column names. So every identifier is checked against `^[A-Za-z_][A-Za-z0-9_]*$` and a 63-character cap first, and `limit` and `offset` must be non-negative safe integers.

```ts
// A request body whose key is crafted SQL
await users.create({
  "x) VALUES (99, (SELECT password FROM admins)) --": "z",
} as unknown as User);
// throws StorageError: Invalid column name — only letters, digits
// and underscores are allowed (STORAGE_INVALID_IDENTIFIER, 400)

await users.findAll({ orderBy: "1; DROP TABLE users --" });
// throws StorageError: Invalid sort column (STORAGE_INVALID_IDENTIFIER)
```

Passing `columns` is the stronger guard: a name that passes the character check but is not on your list is refused with `STORAGE_IDENTIFIER_NOT_ALLOWED`. Without it, a body carrying `is_admin` would be written happily. The same guards are exported for your own SQL: `assertIdentifier`, `assertIdentifiers`, `assertRowBound`, `assertSortDirection`.

### Separate lists for writes, filters and sorting

`columns` is the default allow-list for everything. Since v1.2.0 three optional lists narrow it per use: `writableColumns` governs the keys of `create()` and `update()`, `filterableColumns` the keys of a `count(where)` filter, and `sortableColumns` `findAll({ orderBy })`. Each one defaults to `columns`, so existing configs behave the same. This lets you sort by `created_at` and filter by `is_admin` without letting a request body write either. This fragment reuses the stub `database` from above.

```ts
interface Account extends Record<string, unknown> {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: Date;
}

const accounts = new BaseRepository<Account, string>(database, {
  tableName: "users",
  primaryKey: "id",
  columns: ["id", "email", "name", "is_admin", "created_at"],
  writableColumns: ["email", "name"],
  filterableColumns: ["email", "is_admin"],
  sortableColumns: ["email", "created_at"],
});

await accounts.findAll({ orderBy: "created_at" }); // allowed
await accounts.count({ is_admin: true });         // allowed
await accounts.update("u_1", { is_admin: true });
// throws StorageError (STORAGE_IDENTIFIER_NOT_ALLOWED, 400): not writable
```

Still pick the writable fields yourself where you can, for example by parsing the body with a schema that only has those fields; `writableColumns` is the backstop.

### `undefined` means “not provided”, `null` clears

Since v1.2.0 `create()` and `update()` treat a property whose value is `undefined` as not provided and leave it out of the SQL, even when it is an own key. A partial DTO, such as the output of `@zudojs/schema`'s `.partial()` for a PATCH that only sent an email, therefore changes only the email. An explicit `null` still writes `NULL`. An `update` whose properties are all `undefined` writes nothing and returns the current row. The comments below show the SQL the driver receives; they assume a driver that returns the row (the stub above returns none, so there each `update` ends in `STORAGE_ENTITY_NOT_FOUND`). (Before v1.2.0 an `undefined` key was written as `NULL`, so such a PATCH wiped the other columns.)

```ts
await accounts.update("u_1", { email: "new@example.com", name: undefined });
// UPDATE users SET email = $1 WHERE id = $2 RETURNING *  [ 'new@example.com', 'u_1' ]

await accounts.update("u_1", { name: null });
// UPDATE users SET name = $1 WHERE id = $2 RETURNING *  [ null, 'u_1' ]

await accounts.update("u_1", { name: undefined });
// nothing to write, so it reads the row: SELECT * FROM users WHERE id = $1  [ 'u_1' ]
```

> **Column names outside that character set are refused**
>
> A column called `"first name"` or `"user-id"` will not pass. That is deliberate. If your schema uses such names, write those statements yourself with your engine's quoting rather than routing them through `BaseRepository`.

## CONNECTION POOL

Opening a database connection is slow, and a database accepts only so many. A **connection pool** opens a few, keeps them, and lends them out: you borrow one, use it, give it back.

`ConnectionPool` takes a factory — a function that opens one connection — plus options. It never opens more than `max`. When all are lent out the next caller queues instead, and gets the first connection returned.

This pool wraps a fake connection so it runs standalone. Replace the factory body with your driver.

```ts
import { ConnectionPool } from "@zudojs/storage";
import type { Connection } from "@zudojs/storage";

let made = 0;

const pool = new ConnectionPool(
  async (): Promise<Connection> => {
    made += 1;
    return {
      id: `conn-${made}`,
      state: "connected",
      query: async () => ({ rows: [], rowCount: 0, fields: [] }),
      execute: async () => ({ rowCount: 0 }),
      ping: async () => true,
      close: async () => {},
    };
  },
  { min: 2, max: 5, acquireTimeout: 5000 },
);

await pool.initialize();
console.log(pool.getStats()); // { total: 2, idle: 2, active: 0, waiting: 0 }

await pool.use(async (conn) => {
  await conn.query({ text: "SELECT 1" });
  console.log(pool.getStats().active); // 1
});

console.log(pool.getStats().active); // 0 — use() released it

await pool.drain();
```

**What you should see:** the stats object, `1`, then `0`. Prefer `use()` over `acquire()`/`release()`: it returns the connection even when your callback throws.

| Option | Default | What it does |
| --- | --- | --- |
| min | 2 | Connections opened by initialize(). |
| max | 10 | Hard ceiling. Callers past it queue rather than open more. |
| acquireTimeout | 30000 | Milliseconds a queued caller waits before acquire() rejects. |
| idleTimeout | 30000 | Idle connections are retired after this many ms. |
| connectionTimeout | 10000 | Bounds how long the factory may take to open a connection. |
| maxLifetime | 0 | Connections older than this are retired on release (0 = never); a waiting caller gets a fresh one. |

Guarantees, each pinned by a test: twenty simultaneous acquires against `max: 3` open three connections; a double release, or one the pool never issued, is ignored; `initialize()` is idempotent; `healthCheck()` does not grow the pool; a caller past `acquireTimeout` rejects with `STORAGE_CONNECTION_ACQUIRE_TIMEOUT` instead of hanging.

> **The pool is not a Database and not a lifecycle component**
>
> It hands out `Connection` objects, has no `transaction()`, and does not satisfy `Database`. It also lacks `start()` and `getPhase()`, so it cannot be registered with `StorageLifecycleManager` or `HealthChecker` — wrap it in an object implementing those six methods.

## LOCKING

A **lock** is a claim on a name. While you hold the lock on `"invoice:42"` nobody else who asks for that name gets it. You use one so a job runs once at a time rather than twice in parallel.

Every lock has a **TTL** — a time to live. If the holder crashes the lock expires by itself instead of blocking everyone forever. That safety net has a consequence: a slow holder can lose the lock while still working.

```ts
import { InMemoryLockManager } from "@zudojs/storage";

const locks = new InMemoryLockManager();

const lock = await locks.acquire("invoice:42", { timeout: 5000, ttl: 30000 });
console.log(lock.resource, lock.isHeld()); // invoice:42 true

try {
  if (lock.isHeld()) {
    console.log("writing with fence", lock.fence); // writing with fence 1
  }
} finally {
  await lock.release();
}

console.log(await locks.isLocked("invoice:42")); // false
```

**What you should see:** `invoice:42 true`, the fence line, then `false`. Always release in a `finally` so a thrown error does not strand the lock until its TTL runs out.

| Member | What it does |
| --- | --- |
| acquire(resource, options?) | Waits up to timeout ms (default 10000), then throws STORAGE_LOCK_ACQUIRE_TIMEOUT. |
| tryAcquire(resource, ttlMs) | Returns a lock or null immediately. Never waits. |
| isLocked(resource) | Whether anyone holds it right now. |
| cleanup() / clear() | Drop expired locks / drop every lock. clear() is handy between tests. |
| lock.isHeld() | Whether *this* handle still owns the lock and has not expired. |
| lock.extend(durationMs) | Pushes expiry out; throws STORAGE_LOCK_LOST once the lock is gone. |
| lock.release() | Releases only if this handle still owns it, so a stale handle cannot free the new holder's lock. |
| lock.fence | A number that increases with every acquisition. |

The **fence** is how you survive an expiry you did not notice. Send `lock.fence` with every write to the protected resource, have that resource remember the highest fence it has seen, and reject writes carrying a lower one. A superseded holder waking up late is then refused instead of overwriting newer work.

> **One process only**
>
> `InMemoryLockManager` keeps locks in a JavaScript `Map`. Two Node processes, containers or servers each get their own map and will both believe they hold the same lock. For real distributed locking, implement the `LockManager` interface against Redis or your database.

## LIFECYCLE AND HEALTH

A **lifecycle** is the ordered set of stages a component moves through: start up, serve traffic, stop taking new work, close. Components describe themselves with the `StorageLifecycle` interface — `initialize`, `start`, `healthCheck`, `drain`, `shutdown`, `getPhase`.

**Draining** means "finish what you are doing, take nothing new". Doing it before shutdown is what turns a deploy from dropped requests into a clean handover.

`StorageLifecycleManager` runs those stages across everything registered with it, and `HealthChecker` aggregates their health under names. Note that `register` on the manager returns a promise — await it.

```ts
import { StorageLifecycleManager, HealthChecker } from "@zudojs/storage";
import type { StorageLifecycle } from "@zudojs/storage";

const cache: StorageLifecycle = {
  initialize: async () => { console.log("cache initialized"); },
  start: async () => {},
  healthCheck: async () => ({ healthy: true, latencyMs: 2, status: "ok" }),
  drain: async () => {},
  shutdown: async () => {},
  getPhase: () => "ready",
};

const manager = new StorageLifecycleManager();
await manager.register(cache);
await manager.initialize();
console.log(manager.getPhase()); // ready
await manager.start();

const checker = new HealthChecker();
checker.register("cache", cache);
const report = await checker.checkAll();
console.log(report.healthy, report.components[0]!.name); // true cache

await manager.drain();
await manager.shutdown();
console.log(manager.getPhase()); // shutdown
```

**What you should see:** `cache initialized`, `ready`, `true cache`, `shutdown`.

- Phases run `uninitialized → initializing → ready → draining → drained → shutdown`. `start()` outside `ready` throws `STORAGE_LIFECYCLE_INVALID_PHASE`.
- If a component's `initialize()` throws, the manager returns to `uninitialized` and rethrows.
- `drain()` and `shutdown()` visit every component even when one fails, then throw one `StorageError` whose `cause` is an `AggregateError`.
- **Teardown runs in reverse, one at a time.** `initialize()` goes in registration order; since v1.2.0 `drain()` and `shutdown()` visit components one after another in *reverse* registration order. Register dependencies first (a database, then a cache that writes to it) and the cache is drained and shut down before the database. Before v1.2.0 all components were drained at once, in registration order.
- An empty manager or checker reports `healthy: false`. It has nothing to attest to, and green would mislead.

## SERIALIZATION

**Serializing** turns a value in memory into bytes you can store; deserializing turns those bytes back into a value. Plain `JSON.stringify` loses types on the way: a `Date` returns as a string, a `Map` as `{}`, a `BigInt` throws.

`JsonSerializer` preserves them and produces a `Uint8Array` — exactly what `put()` takes, so a snapshot can go straight into object storage.

```ts
import { JsonSerializer } from "@zudojs/storage";

const serializer = new JsonSerializer();

const snapshot = {
  balance: 1000000000000000000n,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  bytes: new Uint8Array([1, 2, 3]),
};

const encoded = serializer.serialize(snapshot);
const restored = serializer.deserialize<typeof snapshot>(encoded);

console.log(typeof restored.balance);            // bigint
console.log(restored.createdAt instanceof Date); // true
console.log(Array.from(restored.bytes));          // [ 1, 2, 3 ]
```

**What you should see:** `bigint`, `true`, `[ 1, 2, 3 ]`. `BigInt`, `Date`, `Map`, `Set` and `Uint8Array` all survive the round trip.

> **The format argument is ignored**
>
> The `Serializer` interface allows `"json"`, `"msgpack"` or `"binary"`, but `JsonSerializer` always writes JSON — it accepts the argument and does nothing with it. No msgpack or binary serializer exists in this package.

## API REFERENCE

Everything below is reachable from the package root: the single entry point `"@zudojs/storage"`.

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| LocalObjectStorage | Filesystem object store. | (basePath, { maxObjectBytes? }). The only ObjectStorage that ships. |
| BaseRepository<Entity, ID> | CRUD over one SQL table. | (database, options). Eight methods, all identifier-checked. |
| ConnectionPool | Bounded pool of connections. | (factory, options?). initialize, acquire, release, use, getStats, drain, healthCheck. |
| InMemoryLockManager | Named locks with TTL and fencing. | Single process. Adds cleanup() and clear() to LockManager. |
| JsonSerializer | Value to Uint8Array and back, with types kept. | Always JSON. |
| StorageLifecycleManager | Runs the lifecycle across components. | register() is async. Is itself a StorageLifecycle. |
| HealthChecker | Aggregates named components' health. | register, unregister, checkAll, checkOne, getRegisteredComponents. |

### Functions and constants

| Name | What it does | Notes |
| --- | --- | --- |
| assertIdentifier(value, role) | Returns the value if it is a plain SQL identifier. | Max 63 characters; throws STORAGE_INVALID_IDENTIFIER. |
| assertIdentifiers(values, role, allowed?) | Same for a list, with an optional allowlist. | Throws STORAGE_IDENTIFIER_NOT_ALLOWED off-list. |
| assertRowBound(value, role) | Validates a LIMIT or OFFSET. | Must be a non-negative safe integer. |
| assertSortDirection(value) | Normalizes to ASC or DESC. | undefined becomes ASC. |
| DEFAULT_MAX_OBJECT_BYTES | 67108864 (64 MiB). | Default object size ceiling. |
| DEFAULT_MAX_KEYS | 1000. | Default list() page size. |

### Types

| Group | Types | Notes |
| --- | --- | --- |
| Contracts you implement | Database, Connection, Transaction, ObjectStorage, LockManager, Lock, Repository, Serializer, StorageLifecycle | No driver for any of these ships except the classes listed above. |
| Options you pass | BaseRepositoryOptions, FindAllOptions, LocalObjectStorageOptions, ListOptions, ObjectPutOptions, ConnectionPoolOptions, LockOptions, TransactionOptions | Pool options are passed as a Partial. |
| Results you read | QueryResult, ExecuteResult, FieldInfo, PoolStats, ObjectMetadata, ObjectData, ListObjectsResult, StorageHealth, StorageHealthReport, ComponentHealth | ObjectData carries body and arrayBuffer(). |
| Small unions and helpers | Query, QueryParameter, ConnectionState, TransactionState, IsolationLevel, SerializationFormat, SortDirection, StorageLifecyclePhase, StorageContext | Query is { text, parameters? }. |

### Error codes

Errors are thrown as `StorageError` and `NotFoundError` from `@zudojs/errors`; this package re-exports neither class. Branch on `error.code`.

| Code | Status | Thrown when |
| --- | --- | --- |
| STORAGE_INVALID_IDENTIFIER | 400 | A table, key or column name is not a plain identifier. |
| STORAGE_IDENTIFIER_NOT_ALLOWED | 400 | A valid name is not in the configured columns list, or in the writableColumns / filterableColumns / sortableColumns list that governs that use. |
| STORAGE_INVALID_ROW_BOUND | 400 | limit or offset is not a non-negative safe integer. |
| STORAGE_INVALID_SORT_DIRECTION | 400 | order is neither ASC nor DESC. |
| STORAGE_ENTITY_NOT_FOUND | 404 | update() with empty changes on a missing row. A NotFoundError. |
| STORAGE_INVALID_KEY | 400 | An object key is empty, not a string, or has an empty segment (a//b). |
| STORAGE_PATH_TRAVERSAL | 400 | A key is absolute, has a null byte, contains a . or .. segment, or resolves outside the bucket. |
| ERR_STORAGE_READ | 500 | get, exists or metadata hit an I/O error other than "not found" (EACCES, EIO, ELOOP). Only a missing object reads as null/false. |
| STORAGE_OBJECT_TOO_LARGE | 413 | A payload exceeds maxObjectBytes. |
| STORAGE_CONNECTION_POOL_CLOSED | 503 | acquire() after drain(). |
| STORAGE_CONNECTION_POOL_DRAINING | 503 | A queued acquirer is rejected because draining started. |
| STORAGE_CONNECTION_ACQUIRE_TIMEOUT | 503 | No connection freed within acquireTimeout. Retryable (was 504 before v1.2.0). |
| STORAGE_CONNECTION_TIMEOUT | 503 | The factory did not open a connection within connectionTimeout. Retryable. |
| STORAGE_LOCK_ACQUIRE_TIMEOUT | 409 | A lock did not free within timeout. Contention, like @zudojs/cache's lock errors (was 504 before v1.2.0). |
| STORAGE_LOCK_LOST | 409 | extend() on a lock this handle no longer holds. |
| STORAGE_LIFECYCLE_INVALID_PHASE | 500 | start() called outside the ready phase. |
| STORAGE_LIFECYCLE_OPERATION_FAILED | 500 | Components failed to drain or shut down. |

```ts
import { StorageError, NotFoundError } from "@zudojs/errors";

try {
  await files.get(userSuppliedKey);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("missing:", error.message);
  } else if (error instanceof StorageError) {
    console.error(error.code, error.statusCode); // STORAGE_PATH_TRAVERSAL 400
  } else {
    throw error;
  }
}
```

## COMMON MISTAKES

- **Calling `repo.create(req.body)` with no `columns` allowlist.**
  A request carrying `is_admin: true` writes that column, because the name passes the character check. Fix: pass `columns` to the constructor, and `writableColumns` when some columns may be read, filtered or sorted but never written.
- **Expecting a signed URL or an S3 bucket.**
  Your editor reports no such method, because none exists. Fix: implement `ObjectStorage` over your provider's SDK, or serve files through your own authenticated route.
- **Registering a `ConnectionPool` with the lifecycle manager or health checker.**
  A type error: the pool has no `start()` or `getPhase()`, and its `healthCheck()` returns a different shape. Fix: wrap it in an object implementing the six `StorageLifecycle` methods.
- **Using `acquire()` without a `finally` that releases.**
  A thrown query error leaks the connection; enough leaks and every later acquire times out. Fix: use `pool.use()`, which releases for you.
- **Trusting a lock for a whole job without checking `isHeld()`.**
  Work outliving the TTL continues after another holder takes over, and both write. Fix: check `isHeld()` before writing, `extend()` for long jobs, and pass `lock.fence`.
- **Reading a large object with `arrayBuffer()`.**
  The whole object sits in memory, and concurrent reads exhaust the process. Fix: use `object.body`, the `ReadableStream`.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — where `StorageError` and `NotFoundError` live. Read it before writing catch blocks.
- [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) — the type-preserving engine `JsonSerializer` wraps. Use it when you want a string rather than bytes.
- [@zudojs/database](https://zudojs.oyinlola.site/docs/packages-database.md) — for more than the CRUD this repository covers.
- [@zudojs/transactions](https://zudojs.oyinlola.site/docs/packages-transactions.md) — when several writes must succeed or fail together.
- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — for data you can afford to lose and want back fast.

## COMPLETE EXPORT INDEX

Every name `@zudojs/storage` exports from its package root at v1.3.0 — **53** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 53 exports**

Classes (7)

`BaseRepository` `ConnectionPool` `HealthChecker` `InMemoryLockManager` `JsonSerializer` `LocalObjectStorage` `StorageLifecycleManager`

Functions (5)

`assertIdentifier` `assertIdentifiers` `assertRowBound` `assertSortDirection` `mapRepositoryError`

Interfaces (31)

`BaseRepositoryOptions` `ComponentHealth` `Connection` `ConnectionPoolOptions` `Database` `ExecuteResult` `FieldInfo` `FindAllOptions` `ListObjectsResult` `ListOptions` `LocalObjectStorageOptions` `Lock` `LockManager` `LockOptions` `ObjectAttributes` `ObjectData` `ObjectMetadata` `ObjectPutOptions` `ObjectStorage` `PoolStats` `Query` `QueryResult` `Repository` `RepositoryErrorContext` `Serializer` `StorageContext` `StorageHealth` `StorageHealthReport` `StorageLifecycle` `Transaction` `TransactionOptions`

Type aliases (7)

`ConnectionState` `IsolationLevel` `QueryParameter` `SerializationFormat` `SortDirection` `StorageLifecyclePhase` `TransactionState`

Constants (3)

`DEFAULT_MAX_KEYS` `DEFAULT_MAX_OBJECT_BYTES` `SIDECAR_DIR`
