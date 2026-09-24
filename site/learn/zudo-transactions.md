---
title: "Transactions"
description: "Coordinate transactions across many functions with @zudojs/transactions, with context that follows your code through AsyncLocalStorage, rollbacks, savepoints, after-commit hooks, retries, timeouts and rollback-only state, against real PostgreSQL."
source: https://zudojs.oyinlola.site/learn/zudo-transactions
---

LESSON 58 OF 84

Data Advanced

# Transactions

Coordinate transactions across many functions with @zudojs/transactions, with context that follows your code through AsyncLocalStorage, rollbacks, savepoints, after-commit hooks, retries, timeouts and rollback-only state, against real PostgreSQL.

- **45 min** to read and try
- **You need:** The Databases with @zudojs/database lesson
- **You build:** A task service whose functions share one transaction, send emails only after commit, and retry on conflicts

  [Test yourself](#test)

## One transaction, many functions

In [the last lessons](https://zudojs.oyinlola.site/learn/zudo-database) you wrapped work in `withTransaction` and passed the transaction client `tx` down by hand. That gets awkward as an app grows. Creating a task calls `insertTask`, which calls `recordActivity`, which calls `bumpCounter`. Each of them must run in the same transaction, and each must also work when called on its own.

`@zudojs/transactions` solves this. It keeps track of "the transaction in progress" for you, decides what a transaction inside another one should do, runs code after a commit, retries on conflicts and enforces timeouts. It does not talk to any database itself. You give it an **adapter** that knows how to say `BEGIN`, `COMMIT` and `ROLLBACK` to yours.

Terminal on your computer

```bash
$ npm install @zudojs/transactions

added 1 package, and audited 21 packages in 3s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

Every example here uses PGlite and Node.js APIs, so run them on your computer with `npx tsx file.ts`.

## An adapter for PostgreSQL

An adapter has a list of **capabilities** (what it can do) and six methods. `begin` returns a **handle**, anything that identifies the open transaction; the manager hands it back to `commit` and `rollback`. This one also writes each SQL command to a `log` array, so you can watch what the manager does:

adapter.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";
import type { TransactionAdapter, TransactionIsolationLevel, TransactionOptions } from "@zudojs/transactions";

const LEVELS: Record<TransactionIsolationLevel, string> = {
  read_uncommitted: "READ UNCOMMITTED",
  read_committed: "READ COMMITTED",
  repeatable_read: "REPEATABLE READ",
  serializable: "SERIALIZABLE",
};

function savepointName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new TypeError(`Invalid savepoint name "${name}"`);
  return name;
}

export function pgliteAdapter(pg: PGlite, log: string[]): TransactionAdapter {
  const sql = async (text: string) => {
    log.push(text);
    await pg.exec(text);
  };
  return {
    capabilities: {
      savepoints: true,
      nestedTransactions: true,
      isolationLevels: Object.keys(LEVELS) as TransactionIsolationLevel[],
      readOnlyTransactions: true,
      timeouts: true,
    },
    async begin(options?: TransactionOptions) {
      let text = "BEGIN";
      if (options?.isolation) text += ` ISOLATION LEVEL ${LEVELS[options.isolation]}`;
      if (options?.readOnly) text += " READ ONLY";
      await sql(text);
      return pg;
    },
    commit: () => sql("COMMIT"),
    rollback: () => sql("ROLLBACK"),
    createSavepoint: (_handle, name) => sql(`SAVEPOINT ${savepointName(name)}`),
    rollbackToSavepoint: (_handle, name) => sql(`ROLLBACK TO SAVEPOINT ${savepointName(name)}`),
    releaseSavepoint: (_handle, name) => sql(`RELEASE SAVEPOINT ${savepointName(name)}`),
  };
}
```

Savepoint names go straight into SQL, so the adapter checks them first. The isolation level comes from a fixed table, never from the caller's string.

Now the Task API's tables and a manager. `onEvent` receives a **lifecycle event** for every step (started, committing, committed, rolled back…), which is what you would send to your metrics. Here it goes to the same log:

setup.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { createTransactionManager } from "@zudojs/transactions";
import { pgliteAdapter } from "./adapter.js";

export async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE tasks (id serial PRIMARY KEY, title text NOT NULL UNIQUE);
    CREATE TABLE activity (id serial PRIMARY KEY, message text NOT NULL);
  `);
  const log: string[] = [];
  const manager = createTransactionManager({
    adapter: pgliteAdapter(pg, log),
    onEvent: (event) => log.push("  event: " + event.type),
  });
  const count = async (table: "tasks" | "activity") =>
    (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n;
  return { pg, manager, log, count };
}
```

> ONE CONNECTION, ONE TRANSACTION AT A TIME
>
> PGlite is a single connection, so the queries in these examples run inside whatever transaction is open on it. That is why they can use `pg.query` directly. A real server has a **pool** of connections, and each transaction's queries must go to the connection its `begin()` opened. [Reaching the transaction's connection](#handle) shows how your code gets it.

## Commit and rollback

`manager.run(callback)` opens a transaction, runs your callback, commits if it returns and rolls back if it throws. It returns what your callback returns, and passes your error on unchanged, so you never write a `try`/`catch` just to roll back:

run.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager, log, count } = await setup();

async function createTask(title: string) {
  return manager.run(async () => {
    const { rows } = await pg.query<{ id: number }>(
      "INSERT INTO tasks (title) VALUES ($1) RETURNING id", [title],
    );
    await pg.query("INSERT INTO activity (message) VALUES ($1)", [`created ${title}`]);
    return rows[0]?.id;
  });
}

console.log("new id:", await createTask("Buy milk"));
console.log(log.splice(0).join("\n"));

try {
  await createTask("Buy milk");
} catch (error) {
  console.log("failed:", (error as Error).message);
}
console.log(log.splice(0).join("\n"));
console.log("tasks:", await count("tasks"), "activity:", await count("activity"));
```

Output of `npx tsx run.ts`

```ts
new id: 1
BEGIN
  event: transaction.started
  event: transaction.committing
COMMIT
  event: transaction.committed
failed: duplicate key value violates unique constraint "tasks_title_key"
BEGIN
  event: transaction.started
  event: transaction.rolling_back
ROLLBACK
  event: transaction.rolled_back
tasks: 1 activity: 1
```

The first call committed both rows. The second broke the `UNIQUE` rule on the title, the manager rolled back, and your caller got PostgreSQL's own error. The counts prove it: one task and one activity row, not a lonely second activity row.

## Context that follows your code

How does `recordActivity` below know a transaction is already open, when nobody passed it one? The manager stores the current transaction in Node's `AsyncLocalStorage`: a value that follows your code through every `await`, timer and callback that started inside `run`, and is invisible everywhere else. `manager.getCurrent()` reads it.

When `run` is called while a transaction is open, the default **propagation** rule, `"required"`, makes it **join** that transaction as a **participant** instead of opening a second one:

context.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager, log } = await setup();

async function recordActivity(message: string) {
  await manager.run(async (tx) => {
    log.push(`  recordActivity runs as ${tx.kind}`);
    await pg.query("INSERT INTO activity (message) VALUES ($1)", [message]);
  });
}

await manager.run(async (tx) => {
  log.push(`  createTask runs as ${tx.kind}`);
  await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Buy milk"]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  log.push(`  after a timer, same transaction? ${manager.getCurrent()?.id === tx.id}`);
  await recordActivity("created Buy milk");
});
console.log(log.splice(0).join("\n"));

console.log("outside run:", manager.getCurrent());
await recordActivity("called on its own");
console.log(log.splice(0).join("\n"));
```

Output of `npx tsx context.ts`

```ts
BEGIN
  event: transaction.started
  createTask runs as root
  after a timer, same transaction? true
  recordActivity runs as participant
  event: transaction.committing
COMMIT
  event: transaction.committed
outside run: undefined
BEGIN
  event: transaction.started
  recordActivity runs as root
  event: transaction.committing
COMMIT
  event: transaction.committed
```

Inside `createTask`'s transaction, `recordActivity` was a participant: no second `BEGIN`, one `COMMIT` for everything. Called on its own, the same function opened and committed its own transaction, as a **root**. You write each function once, and it does the right thing in both places. Only the scope that opened a transaction ever commits it.

## Reaching the transaction's connection

Whatever the adapter's `begin()` returned is the transaction's **handle**. With a pool, that is the one connection the transaction runs on, and every query in it must use that connection. `manager.getCurrentHandle()` returns it from anywhere inside `run`, the same way `getCurrent()` returns the transaction. `getTransactionHandle(tx)` does the same for a transaction object you already have. Outside a transaction, both give `undefined`:

handle.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";
import { getTransactionHandle } from "@zudojs/transactions";
import { setup } from "./setup.js";

const { pg, manager, count } = await setup();

/* The connection of the transaction in progress. Queries never go anywhere else. */
function db(): PGlite {
  const handle = manager.getCurrentHandle<PGlite>();
  if (!handle) throw new Error("db() needs a transaction in progress");
  return handle;
}

async function recordActivity(message: string) {
  await manager.run(async () => {
    await db().query("INSERT INTO activity (message) VALUES ($1)", [message]);
  });
}

console.log("outside run:", manager.getCurrentHandle());
await manager.run(async (tx) => {
  console.log("the adapter's handle?", getTransactionHandle(tx) === pg);
  await db().query("INSERT INTO tasks (title) VALUES ($1)", ["Buy milk"]);
  await recordActivity("created Buy milk");
});
console.log("tasks:", await count("tasks"), "activity:", await count("activity"));
```

Output of `npx tsx handle.ts`

```ts
outside run: undefined
the adapter's handle? true
tasks: 1 activity: 1
```

Here the handle is the PGlite instance, because that is what this adapter's `begin()` returns. An adapter for a pool (for example `pg`'s `Pool`) would take a client from the pool in `begin()` and return it, and `db()` would give each transaction its own client. The participant `recordActivity` got the root's handle, so both inserts ran on the same connection. Use the handle for queries only: commit and roll back always through the manager.

## Rollback-only

A participant cannot commit or roll back the shared transaction; that is the root's job. So what happens when a participant fails, and the root catches the error and carries on? The failure has already spoiled the unit of work, so the manager marks the transaction **rollback-only**. When the root tries to commit, it rolls back instead and throws `TransactionRollbackOnlyError`:

rollback-only.tsNode.js only

```ts
import { TransactionRollbackOnlyError } from "@zudojs/transactions";
import { setup } from "./setup.js";

const { pg, manager, log, count } = await setup();

async function recordActivity(message: string) {
  await manager.run(async () => {
    if (message.length > 20) throw new Error("activity message too long");
    await pg.query("INSERT INTO activity (message) VALUES ($1)", [message]);
  });
}

try {
  await manager.run(async (tx) => {
    await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Buy milk"]);
    try {
      await recordActivity("created a task called Buy milk");
    } catch {
      log.push(`  caught it; rollback-only now? ${tx.isRollbackOnly()}`);
    }
  });
} catch (error) {
  if (error instanceof TransactionRollbackOnlyError) {
    console.log(error.name, "-", error.message.replace(/txn_[0-9a-f]+/, "txn_…"));
    console.log("reason:", error.metadata["originalError"]);
  }
}
console.log(log.splice(0).join("\n"));
console.log("tasks:", await count("tasks"));
```

Output of `npx tsx rollback-only.ts`

```ts
TransactionRollbackOnlyError - Transaction "txn_…" commit refused: transaction marked rollback-only
reason: activity message too long
BEGIN
  event: transaction.started
  caught it; rollback-only now? true
  event: transaction.rolling_back
ROLLBACK
  event: transaction.rolled_back
tasks: 0
```

Catching the participant's error did not save the transaction: the task was rolled back too. That is the safe choice. If you want part of the work to be allowed to fail, use a savepoint, in the next section.

Transaction ids are random, so the example shortens them to `txn_…`. The message says what happened: the *commit* was refused, and the transaction was rolled back. `error.metadata.originalError` holds the reason, here the participant's error. `TransactionRollbackOnlyError` is a kind of `TransactionRollbackError`, so a `catch` that checks for the wider class catches it too.

You can also mark a transaction yourself. `tx.markRollbackOnly(reason)` is handy for a **dry run**: do all the work, check the result, and throw it away:

dry-run.tsNode.js only

```ts
import { TransactionRollbackError } from "@zudojs/transactions";
import { setup } from "./setup.js";

const { pg, manager, count } = await setup();

async function importTasks(titles: string[], dryRun: boolean) {
  return manager.run(async (tx) => {
    for (const title of titles) {
      await pg.query("INSERT INTO tasks (title) VALUES ($1)", [title]);
    }
    const n = (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM tasks")).rows[0]?.n;
    if (dryRun) tx.markRollbackOnly("dry run");
    return n;
  });
}

try {
  await importTasks(["Buy milk", "Walk the dog"], true);
} catch (error) {
  if (error instanceof TransactionRollbackError) {
    console.log("dry run finished, reason:", error.metadata["originalError"]);
  }
}
console.log("tasks after dry run:", await count("tasks"));
console.log("real import, tasks:", await importTasks(["Buy milk", "Walk the dog"], false));
```

Output of `npx tsx dry-run.ts`

```ts
dry run finished, reason: dry run
tasks after dry run: 0
real import, tasks: 2
```

## Savepoints

A **savepoint** is a bookmark inside a transaction. You can roll back to it, undoing only what happened after it, and keep the rest. Ask for one with `propagation: "nested"`. The inner callback gets a transaction of kind `"savepoint"`: if it throws, only its own work is undone. Here an import keeps the good rows and skips the bad one:

savepoints.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager, log } = await setup();
await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Buy milk"]);

const imported = await manager.run(async () => {
  const done: string[] = [];
  for (const title of ["Pay rent", "Buy milk", "Call mom"]) {
    try {
      await manager.run(async () => {
        await pg.query("INSERT INTO tasks (title) VALUES ($1)", [title]);
      }, { propagation: "nested" });
      done.push(title);
    } catch {
      log.push(`  skipped "${title}"`);
    }
  }
  return done;
});

const short = (line: string) => line.replace(/sp_txn_[0-9a-f]+/, "sp_txn_…");
console.log(log.splice(0).filter((line) => !line.includes("event")).map(short).join("\n"));
console.log("imported:", imported);
console.log((await pg.query("SELECT title FROM tasks ORDER BY id")).rows);
```

Output of `npx tsx savepoints.ts`

```ts
BEGIN
SAVEPOINT sp_txn_…
RELEASE SAVEPOINT sp_txn_…
SAVEPOINT sp_txn_…
ROLLBACK TO SAVEPOINT sp_txn_…
RELEASE SAVEPOINT sp_txn_…
  skipped "Buy milk"
SAVEPOINT sp_txn_…
RELEASE SAVEPOINT sp_txn_…
COMMIT
imported: [ 'Pay rent', 'Call mom' ]
[ { title: 'Buy milk' }, { title: 'Pay rent' }, { title: 'Call mom' } ]
```

Each title got its own `SAVEPOINT`, named after a random transaction id (shortened to `sp_txn_…` here). For "Buy milk", the insert failed, the manager rolled back `TO SAVEPOINT`, and the outer transaction went on, still healthy. The good titles were saved in one `COMMIT`. Without the savepoint, PostgreSQL would have refused every statement after the error, and the whole import would have been lost.

### Other propagation rules

`"required"` and `"nested"` are the two you will use most. The others:

| Propagation | A transaction is open | None is open |
| --- | --- | --- |
| `required` (default) | Join it as a participant | Open a new one |
| `nested` | Open a savepoint in it | Open a new one |
| `requires_new` | Pause it, open a separate one | Open a new one |
| `mandatory` | Join it | Throw |
| `supports` | Join it | Run without a transaction |
| `not_supported` | Pause it, run without | Run without a transaction |
| `never` | Throw | Run without a transaction |

`mandatory` is a useful guard for a function that must never write outside a transaction:

mandatory.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager } = await setup();

async function moveTaskActivity(message: string) {
  await manager.run(async () => {
    await pg.query("INSERT INTO activity (message) VALUES ($1)", [message]);
  }, { propagation: "mandatory" });
}

try {
  await moveTaskActivity("oops, no transaction");
} catch (error) {
  console.log((error as Error).name, "-", (error as Error).message);
}
await manager.run(() => moveTaskActivity("inside a transaction"));
console.log((await pg.query("SELECT message FROM activity")).rows);
```

Output of `npx tsx mandatory.ts`

```ts
TransactionPropagationError - Propagation is 'mandatory' but no transaction is in progress
[ { message: 'inside a transaction' } ]
```

`requires_new` needs a second, separate transaction while the first is paused. That needs a second connection, so it only works with a connection pool, not with PGlite.

## After-commit hooks

A classic bug: the code sends a "task created" email, and then the transaction rolls back. The user got an email about a task that does not exist. Anything that leaves your database, such as emails, messages to other services or cache updates, must wait until the commit really happened.

`tx.afterCommit(callback)` does exactly that. The callback runs after a successful commit, and is thrown away on a rollback. `tx.afterRollback` is the opposite. A participant's callbacks wait for the root's commit:

hooks.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager } = await setup();

async function createTask(title: string) {
  await manager.run(async (tx) => {
    tx.afterCommit(async () => console.log(`  email: "${title}" was created`));
    tx.afterRollback(async () => console.log(`  log: creating "${title}" was rolled back`));
    await pg.query("INSERT INTO tasks (title) VALUES ($1)", [title]);
    console.log(`  inserted "${title}", not committed yet`);
  });
}

await createTask("Buy milk");
console.log("returned");
try {
  await createTask("Buy milk");
} catch {
  console.log("second call failed, and no email was sent");
}
```

Output of `npx tsx hooks.ts`

```ts
  inserted "Buy milk", not committed yet
  email: "Buy milk" was created
returned
  log: creating "Buy milk" was rolled back
second call failed, and no email was sent
```

The email line came after the commit. The second call failed on the `UNIQUE` rule, so its email was never sent and its rollback callback ran instead. Register callbacks before the work that can fail: a callback registered after the failing line would never be registered at all.

### When a hook fails

An after-commit callback can fail too, say the email service is down. The data is already committed, and nothing can undo that, so the manager does not throw at your caller. It collects the failures into an `AggregateError` and hands them to the manager's `hooks.onError`, where you log them or queue a retry. Manager-wide `hooks` also run for every transaction:

hook-errors.tsNode.js only

```ts
import { createInMemoryAdapter, createTransactionManager } from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
  hooks: {
    async beforeCommit({ transaction }) {
      console.log("beforeCommit:", transaction.options.name);
    },
    async onError({ error }) {
      const failures = error instanceof AggregateError ? error.errors : [error];
      for (const failure of failures) console.log("onError:", (failure as Error).message);
    },
  },
});

const result = await manager.run(async (tx) => {
  tx.afterCommit(async () => { throw new Error("email service is down"); });
  tx.afterCommit(async () => console.log("published task.created"));
  return "task 1 saved";
}, { name: "create-task" });
console.log(result);
```

Output of `npx tsx hook-errors.ts`

```ts
beforeCommit: create-task
published task.created
onError: email service is down
task 1 saved
```

`createInMemoryAdapter()` is an adapter with no database, built into the package for tests and examples like this one. The failing email did not stop the second callback, and the caller still got its result.

## Retries

Under load, PostgreSQL sometimes refuses a transaction and asks you to try again: a **serialization failure** (error code `40001`) in the strict `serializable` isolation level, or a **deadlock** (`40P01`) when two transactions wait for each other. Trying the whole transaction again usually works. `retry` does it for you, and `shouldRetry` decides which errors deserve another try:

retry.tsNode.js only

```ts
import { setup } from "./setup.js";

const { manager, log } = await setup();
const RETRYABLE = new Set(["40001", "40P01"]);
const retry = {
  attempts: 3,
  delay: 10,
  backoff: "exponential" as const,
  shouldRetry: (error: unknown) => RETRYABLE.has((error as { code?: string }).code ?? ""),
};

let calls = 0;
const result = await manager.run(async () => {
  calls += 1;
  if (calls < 3) {
    throw Object.assign(new Error("could not serialize access"), { code: "40001" });
  }
  return "saved";
}, { isolation: "serializable", retry });
console.log(result, "after", calls, "calls");
console.log(log.splice(0).filter((line) => !line.includes("event")).join("\n"));

calls = 0;
try {
  await manager.run(async () => {
    calls += 1;
    throw new Error("title is required");
  }, { retry });
} catch (error) {
  console.log((error as Error).message, "- calls:", calls);
}
```

Output of `npx tsx retry.ts`

```ts
saved after 3 calls
BEGIN ISOLATION LEVEL SERIALIZABLE
ROLLBACK
BEGIN ISOLATION LEVEL SERIALIZABLE
ROLLBACK
BEGIN ISOLATION LEVEL SERIALIZABLE
COMMIT
title is required - calls: 1
```

The simulated conflict happened twice; the third call committed. `attempts` counts the **retries**, not the calls: `attempts: 3` means the first call plus up to 3 more, so at most 4 calls. The validation error was not retried, because trying the same bad input again can never succeed. `"exponential"` backoff doubles the pause after each failure (10 ms, then 20 ms), so a busy database gets some breathing room. Always pass `shouldRetry`: without it, every error is retried, even a bad input.

> A RETRY RUNS YOUR WHOLE CALLBACK AGAIN
>
> Everything inside the callback happens once per attempt. Database work is rolled back each time, but anything else is not: an email sent inside the callback would go out three times. Put those in `afterCommit`, which runs once, after the attempt that committed.

## Timeouts and read-only transactions

An open transaction holds locks, and others wait for them. A transaction that runs too long slows everyone down. `timeout` puts a limit on it. When time runs out, the manager rolls back and rejects at once with `TransactionTimeoutError`, even if your callback is still busy.

JavaScript cannot stop a function from the outside, so the manager also gives you a way to stop it yourself: `tx.signal`, an **AbortSignal** that fires when the transaction times out. An `AbortSignal` is the standard JavaScript object for saying "stop, nobody needs this any more". It has an `aborted` flag, and `fetch`, the timers in `node:timers/promises` and many libraries accept one and stop early when it fires:

timeout.tsNode.js only

```ts
import { setTimeout as sleep } from "node:timers/promises";
import { TransactionTimeoutError } from "@zudojs/transactions";
import { setup } from "./setup.js";

const { pg, manager, log, count } = await setup();
const started = Date.now();

try {
  await manager.run(async (tx) => {
    tx.signal.addEventListener("abort", () => log.push("  signal aborted"));
    await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Slow task"]);
    await sleep(100, undefined, { signal: tx.signal }); // a slow call that listens
    await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Never written"]);
  }, { timeout: 30 });
} catch (error) {
  if (error instanceof TransactionTimeoutError) {
    const waited = Date.now() - started < 100 ? "less than 100 ms" : "100 ms or more";
    console.log(error.name, "- the caller waited", waited);
  }
}
console.log(log.splice(0).join("\n"));
console.log("tasks:", await count("tasks"));
```

Output of `npx tsx timeout.ts`

```ts
TransactionTimeoutError - the caller waited less than 100 ms
BEGIN
  event: transaction.started
  signal aborted
  event: transaction.timed_out
  event: transaction.rolling_back
ROLLBACK
  event: transaction.rolled_back
tasks: 0
```

At 30 ms the signal fired, the manager reported `timed_out` once, rolled back, and the caller got the error long before the 100 ms slow call would have ended. Because the slow call listened to the signal, it stopped too, and the second insert never ran.

A callback that ignores the signal keeps running after the rollback, and anything it writes then is no longer inside the transaction. So pass `tx.signal` to every slow call, or call `tx.signal.throwIfAborted()` before the next write. To stop a slow query inside PostgreSQL itself, set PostgreSQL's `statement_timeout` as well.

`readOnly: true` opens a **read-only** transaction. PostgreSQL itself then refuses every write, which protects reports and exports from a bug that would change data:

read-only.tsNode.js only

```ts
import { setup } from "./setup.js";

const { pg, manager, log } = await setup();

try {
  await manager.run(async () => {
    await pg.query("SELECT count(*) FROM tasks");
    await pg.query("DELETE FROM tasks");
  }, { readOnly: true, isolation: "repeatable_read" });
} catch (error) {
  console.log((error as Error).message);
}
console.log(log.filter((line) => !line.includes("event")).join("\n"));
```

Output of `npx tsx read-only.ts`

```ts
cannot execute DELETE in a read-only transaction
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY
ROLLBACK
```

If you ask for an isolation level or feature the adapter did not declare in its `capabilities`, the manager refuses before it sends anything to the database: `TransactionIsolationError` for an isolation level, `TransactionCapabilityError` for anything else.

## Practice

TRY IT YOURSELF

### Complete a task

Write `completeTask(id)`. In one transaction it marks the task done (add a `done` column), records the activity with a participant function, and registers an after-commit "notify" message. If no row was updated, throw a `NotFoundError` from `@zudojs/errors`. Try it with an existing and a missing id, and show that the missing one changed nothing.

**Show a solution**

complete-task.tsNode.js only

```ts
import { NotFoundError } from "@zudojs/errors";
import { setup } from "./setup.js";

const { pg, manager, count } = await setup();
await pg.exec("ALTER TABLE tasks ADD COLUMN done boolean NOT NULL DEFAULT false");
await pg.query("INSERT INTO tasks (title) VALUES ($1)", ["Buy milk"]);

async function recordActivity(message: string) {
  await manager.run(async () => {
    await pg.query("INSERT INTO activity (message) VALUES ($1)", [message]);
  });
}

async function completeTask(id: number) {
  await manager.run(async (tx) => {
    await recordActivity(`completed task ${id}`);
    const result = await pg.query("UPDATE tasks SET done = true WHERE id = $1", [id]);
    if (result.affectedRows === 0) throw new NotFoundError(`Task ${id} not found`);
    tx.afterCommit(async () => console.log(`notify: task ${id} is done`));
  });
}

await completeTask(1);
try {
  await completeTask(42);
} catch (error) {
  if (error instanceof NotFoundError) console.log(error.statusCode, error.message);
}
console.log("activity rows:", await count("activity"));
```

Output of `npx tsx complete-task.ts`

```ts
notify: task 1 is done
404 Task 42 not found
activity rows: 1
```

The activity for task 42 was written first, then rolled back with the rest when the update found nothing. The manager passed your `NotFoundError` through unchanged, 404 and all, just like `withTransaction` in [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database).

TRY IT YOURSELF

### Count the events

Create a manager with the in-memory adapter whose `onEvent` counts events by type. Run one transaction that commits and one that throws, then print the counts.

**Show a solution**

event-counts.tsNode.js only

```ts
import { createInMemoryAdapter, createTransactionManager } from "@zudojs/transactions";

const counts = new Map<string, number>();
const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
  onEvent: (event) => counts.set(event.type, (counts.get(event.type) ?? 0) + 1),
});

await manager.run(async () => "ok");
await manager.run(async () => { throw new Error("nope"); }).catch(() => undefined);
console.log(Object.fromEntries(counts));
```

Output of `npx tsx event-counts.ts`

```json
{
  'transaction.started': 2,
  'transaction.committing': 1,
  'transaction.committed': 1,
  'transaction.rolling_back': 1,
  'transaction.rolled_back': 1
}
```

## Recap

- `createTransactionManager({ adapter })` coordinates transactions; the adapter turns begin, commit, rollback and savepoints into SQL for your database.
- `manager.run(callback)` commits on return and rolls back on a throw, passing your error through unchanged.
- The current transaction travels with your code through `AsyncLocalStorage`. A nested `run` joins it as a participant (`"required"`), and only the root commits. `manager.getCurrentHandle()` gives your queries the transaction's connection.
- A failed participant makes the transaction rollback-only; the root's commit then throws `TransactionRollbackOnlyError`. `markRollbackOnly` gives you dry runs.
- `propagation: "nested"` uses a savepoint, so part of the work can fail on its own.
- `afterCommit` is where emails and messages go. Retries replay the whole callback, so keep side effects out of it. `attempts` counts retries, and `shouldRetry` picks which errors get one.
- `timeout` rolls back and rejects at once; pass `tx.signal` to slow calls so your callback stops too. `readOnly` makes PostgreSQL refuse writes.

That completes the data part. Next, the [authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth) gives each task an owner who can log in.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
