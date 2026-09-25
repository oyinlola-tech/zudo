---
title: "Operating databases — ZudoJS Academy"
description: "Run PostgreSQL behind a live shop: size connection pools, ship migrations with zero downtime, seed safely, restore from backups, and read from replicas."
source: https://zudojs.oyinlola.site/learn/db-operations
---

LEVEL 8 · LESSON 4 OF 5

Correctness and operations Core

# Operating databases

Run PostgreSQL behind a live shop: size connection pools, ship migrations with zero downtime, seed safely, restore from backups, and read from replicas.

- **60 min** to read and try
- **You need:** Transactions, isolation and locks, and the migrations part of How databases work
- **You build:** An expand-and-contract migration that never breaks the running app, an idempotent seed, a tested restore, and a replica-aware read router

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a connection pool does, size it, and find a leaked connection
- Plan a schema change as expand, migrate and contract so old and new code both keep working
- Recognise migrations that take long locks, and protect production with lock_timeout, NOT VALID and batched backfills
- Write idempotent seeds, and take and actually restore a backup
- Explain streaming replication, measure replica lag, and route reads without breaking read-your-writes

## The rename that took the shop down

Amaka's developer renamed a column. `customers.phone` became `phone_number`, the new code used the new name, the migration ran at the start of the deploy, and the tests were green. For the next four minutes, every checkout failed.

A deploy is not an instant. The shop runs on three servers, and a **rolling deploy** replaces them one at a time so the shop stays up. So for a few minutes, old code and new code run side by side against *one* database. Here is what the old code saw after the migration:

rename.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table customers (id integer generated always as identity primary key, email text not null, phone text);
  insert into customers (email, phone) values ('ada@example.com', '0803 000 0001');
`);

const oldApp = (id) => db.query("select email, phone from customers where id = $1", [id]);
const newApp = (id) => db.query("select email, phone_number from customers where id = $1", [id]);

await db.exec("alter table customers rename column phone to phone_number");

for (const [name, app] of [["new servers", newApp], ["old servers", oldApp]]) {
  try {
    console.log(name, (await app(1)).rows[0]);
  } catch (error) {
    console.log(name, "fail:", error.code, error.message);
  }
}
await db.close();
```

Output of `node rename.js`

```ts
new servers { email: 'ada@example.com', phone_number: '0803 000 0001' }
old servers fail: 42703 column "phone" does not exist
```

The migration was correct and the new code was correct. What broke was the moment in between. The previous lessons made the schema good and the queries fast and correct; this one is about keeping a database healthy while it runs: the connections your servers open, the migrations you ship, the seeds you load, the backups you hope you never need, and the copies you read from. Everything that needs a real server (pools, locks between sessions, `pg_dump`, replication) was run against PostgreSQL 17 in Docker, and those outputs are shown as terminal sessions; the rest runs on this page.

## Connections and pools

Every connection to PostgreSQL is a separate server process. Opening one means a network round trip, authentication and often a TLS handshake, which takes milliseconds, and each open connection holds several megabytes of server memory whether it is busy or not. The server also has a hard cap, `max_connections` (100 by default).

A **connection pool** keeps a few connections open and lends them out. A request borrows one (**acquire**), runs its queries, and gives it back (**release**). If all are busy, the request waits in a queue. Here is the whole idea in thirty lines, with fake connections so you can watch the queue:

tiny-pool.js

```ts
function createPool({ max }) {
  const idle = [];
  const waiting = [];
  let created = 0;
  return {
    async acquire(who) {
      if (idle.length > 0) return idle.pop();
      if (created < max) return `conn${++created}`;
      console.log(`${who} waits (queue length ${waiting.length + 1})`);
      return new Promise((resolve) => waiting.push(resolve));
    },
    release(conn) {
      const next = waiting.shift();
      if (next) next(conn);
      else idle.push(conn);
    },
  };
}

const pool = createPool({ max: 2 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(who, ms) {
  const conn = await pool.acquire(who);
  console.log(`${who} runs on ${conn}`);
  try {
    await sleep(ms);
  } finally {
    pool.release(conn);
    console.log(`${who} releases ${conn}`);
  }
}

await Promise.all([request("checkout", 100), request("search", 250), request("profile", 50), request("orders", 50)]);
```

Output of `node tiny-pool.js` and of the browser terminal

```ts
profile waits (queue length 1)
orders waits (queue length 2)
checkout runs on conn1
search runs on conn2
checkout releases conn1
profile runs on conn1
profile releases conn1
orders runs on conn1
orders releases conn1
search releases conn2
```

All four requests asked at the same moment. Two connections served them: `checkout` and `search` got one each, `profile` and `orders` waited in line and ran as soon as a connection came back. The `finally` is the most important line: a connection that is not released is gone for good. The `pg` package's `Pool` works the same way, with more features: `pool.query()` acquires, runs one statement and releases for you; `pool.connect()` hands you a client for a transaction, which you must `release()`.

### Pool size on a real server

Twenty requests, each running a query that takes 0.2 seconds, through a pool of 5 and a pool of 20. You need a PostgreSQL server for this; the Docker one from [the transactions lesson](https://zudojs.oyinlola.site/learn/db-transactions#two-sessions) works, with `DATABASE_URL` pointing at it:

pool-size.js

```ts
import pg from "pg";

for (const max of [5, 20]) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max });
  const started = performance.now();
  const requests = Array.from({ length: 20 }, () => pool.query("select pg_sleep(0.2)"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  console.log(`max ${max}: open ${pool.totalCount}, waiting ${pool.waitingCount}`);
  await Promise.all(requests);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`max ${max}: 20 queries of 0.2 s took ${seconds} s`);
  await pool.end();
}
```

Terminal on your computer

```bash
$ node pool-size.js
max 5: open 5, waiting 15
max 5: 20 queries of 0.2 s took 0.9 s
max 20: open 20, waiting 0
max 20: 20 queries of 0.2 s took 0.3 s
```

With 5 connections, 15 queries waited, and the batch took four rounds. With 20 there was no queue. Bigger looks better, but only because `pg_sleep` does no work. Real queries use CPU and disk, and a server with 8 cores cannot run 200 queries faster than it runs 20; it just switches between them. A common starting point for the *whole* database is a few connections per CPU core, and then the rule that matters in practice:

(number of app instances) × (pool size per instance) + (connections for migrations, cron jobs and people) must stay below `max_connections`.

Six servers with a pool of 20 each is already 120, more than the default limit. This is what happens past the limit:

too-many.js

```ts
import pg from "pg";

const clients = [];
try {
  for (;;) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    clients.push(client);
  }
} catch (error) {
  console.log(`connection ${clients.length + 1} refused: ${error.code} ${error.message}`);
}
const { rows } = await clients[0].query("show max_connections");
console.log("max_connections:", rows[0].max_connections);
await Promise.all(clients.map((c) => c.end()));
```

Terminal on your computer

```bash
$ node too-many.js
connection 101 refused: 53300 sorry, too many clients already
max_connections: 100
```

When many app instances (or serverless functions, each with its own pool) need more connections than the database should hold, put a **connection pooler** such as PgBouncer between them. In *transaction pooling* mode it lends a real server connection only for the duration of a transaction, so thousands of client connections share a few dozen server ones. The price: anything tied to a session (`set` without `local`, session advisory locks, `listen`, some prepared statement setups) does not work reliably through it.

### The leaked connection

The most common pool failure in production is not the size; it is a code path that never releases. This handler releases on success but forgets the error path. The pool has 2 connections and gives up waiting after one second:

pool-leak.js

```ts
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 1000 });

/* BUG: when the query fails, the client is never released back to the pool. */
async function leakyHandler(sql) {
  const client = await pool.connect();
  const result = await client.query(sql);
  client.release();
  return result.rows;
}

for (const sql of ["select 1 as ok", "select * from no_such_table", "select * from no_such_table", "select 1 as ok"]) {
  try {
    await leakyHandler(sql);
    console.log(`ok     | ${sql} | idle ${pool.idleCount}, in use ${pool.totalCount - pool.idleCount}`);
  } catch (error) {
    console.log(`failed | ${sql} | ${error.message}`);
  }
}
process.exit(0);
```

Terminal on your computer

```bash
$ node pool-leak.js
ok     | select 1 as ok | idle 1, in use 0
failed | select * from no_such_table | relation "no_such_table" does not exist
failed | select * from no_such_table | relation "no_such_table" does not exist
failed | select 1 as ok | timeout exceeded when trying to connect
```

Two failed requests leaked both connections, and from then on every request, even a perfectly good one, timed out. In production this looks like "the site worked for an hour, then every page hung", and the database itself looks idle. The fixes: release in `finally` (or use `pool.query` for single statements), always set `connectionTimeoutMillis` so a starved pool fails fast instead of hanging, and graph the pool's `waitingCount`.

## Migrations with zero downtime

REASON IT OUT

### Before running a migration against production

A migration is code that runs once, against the only copy of your most important data, while customers are using it. Answer these before you run one:

- Which versions of the application will run against the new schema during the deploy, and for how long?
- Which lock does each statement take, on which table, and for how long does it hold it?
- Does the statement rewrite or scan the whole table? How many rows is that in production, not on your laptop?
- What happens to requests that arrive while the migration is waiting for its lock?
- If it fails halfway, what state is the database in, and can you simply run it again?
- How would you undo it? Can you undo it at all after new data was written?

**Show the reasoning**

- At least two: the old version (still serving until replaced) and the new one. So every schema must work with both, which rules out renaming or dropping anything the old version uses.
- Most `alter table` forms take an `ACCESS EXCLUSIVE` lock: nobody can even read the table while it is held. That is fine for milliseconds, and a disaster for minutes.
- Changing a column's type, or adding a column with a volatile default such as `random()`, rewrites every row. Adding a constraint scans every row. Test with production-sized data.
- They queue behind it. Even if the migration itself is fast, it may first wait for a long transaction to finish, and everyone queues behind the waiting migration. The next section shows this happening.
- Run each migration in a transaction where PostgreSQL allows it, so a failure leaves nothing half-done, and write migrations that are safe to re-run (`if not exists`).
- Often you cannot: a dropped column's data is gone, and rolling back a migration after new rows arrived can lose them. Production migrations are **forward-only**: if something is wrong, you write a new migration that fixes it.

### Expand, migrate, contract

The safe way to make an incompatible change is to split it into steps that are each compatible with the code running at that moment. The pattern is called **expand and contract** (or parallel change):

1. **Expand**: add the new structure next to the old one. Old code ignores it; nothing breaks.
2. **Migrate**: make both stay in sync, backfill existing rows, then deploy code that reads the new structure (while old servers still write the old one).
3. **Contract**: once no running code uses the old structure, remove it.

Each step is its own deploy. Here is the rename done that way, with the old and the new app both running against the database after every step:

expand-contract.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table customers (id integer generated always as identity primary key, email text not null, phone text);
  insert into customers (email, phone) values ('ada@example.com', '0803 000 0001'), ('tunde@example.com', '0805 000 0002');
`);

const apps = {
  v1: {
    signUp: (email, phone) => db.query("insert into customers (email, phone) values ($1, $2)", [email, phone]),
    phoneOf: async (email) => (await db.query("select phone from customers where email = $1", [email])).rows[0].phone,
  },
  v2: {
    signUp: (email, phone) => db.query("insert into customers (email, phone_number) values ($1, $2)", [email, phone]),
    phoneOf: async (email) => (await db.query("select phone_number from customers where email = $1", [email])).rows[0].phone_number,
  },
};

let n = 0;
async function check(step, versions) {
  const results = [];
  for (const v of versions) {
    try {
      const email = `new${++n}@example.com`;
      await apps[v].signUp(email, `0809 000 000${n}`);
      const phones = [await apps[v].phoneOf("ada@example.com"), await apps[v].phoneOf(email)];
      results.push(`${v} ok (${phones.join(", ")})`);
    } catch (error) {
      results.push(`${v} FAILS: ${error.message}`);
    }
  }
  console.log(`${step.padEnd(34)} ${results.join(" | ")}`);
}

await check("before", ["v1"]);

await db.exec(`
  alter table customers add column phone_number text;
  create function sync_phone() returns trigger language plpgsql as $$
  begin
    new.phone_number := coalesce(new.phone_number, new.phone);
    new.phone := coalesce(new.phone, new.phone_number);
    return new;
  end $$;
  create trigger customers_sync_phone before insert or update on customers
    for each row execute function sync_phone();
`);
await check("1. expand: column + sync trigger", ["v1"]);

await db.exec("update customers set phone_number = phone where phone_number is null");
await check("2. backfill, deploy v2 (rolling)", ["v1", "v2"]);

await db.exec(`
  drop trigger customers_sync_phone on customers;
  drop function sync_phone();
  alter table customers drop column phone;
`);
await check("3. contract: all servers on v2", ["v2"]);
await check("   (a straggling v1 server)", ["v1"]);
await db.close();
```

Output of `node expand-contract.js`

```ts
before                             v1 ok (0803 000 0001, 0809 000 0001)
1. expand: column + sync trigger   v1 ok (0803 000 0001, 0809 000 0002)
2. backfill, deploy v2 (rolling)   v1 ok (0803 000 0001, 0809 000 0003) | v2 ok (0803 000 0001, 0809 000 0004)
3. contract: all servers on v2     v2 ok (0803 000 0001, 0809 000 0005)
   (a straggling v1 server)        v1 FAILS: column "phone" of relation "customers" does not exist
```

After every step, every version that is still running works. The trigger keeps the two columns in sync whichever version writes, the backfill fills in rows written before the column existed, and only when every server runs v2 does the contract step drop the old column. The last line is why you wait: a server still on v1 fails, exactly as in the opening example. Real teams wait at least one full deploy between the steps, and check the logs for queries using the old name before contracting.

### Locks, and the queue behind a waiting migration

`alter table customers add column phone text` is instant: PostgreSQL only updates its catalogue. Yet it can still take the shop down. It needs an `ACCESS EXCLUSIVE` lock, so it must wait for every transaction that has touched the table to finish, and while it waits, every new query on the table queues *behind* it. Here a report holds a transaction open, a migration arrives, then a shopper looks up their account:

lock-queue.js

```ts
import pg from "pg";

const url = process.env.DATABASE_URL;
const connect = async (name) => {
  const client = new pg.Client({ connectionString: url, application_name: name });
  await client.connect();
  return client;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = await connect("setup");
await setup.query(`
  drop table if exists customers;
  create table customers (id integer primary key, email text not null);
  insert into customers select n, 'customer' || n || '@example.com' from generate_series(1, 1000) as n;`);

const report = await connect("report");
const migration = await connect("migration");
const shopper = await connect("shopper");

await report.query("begin");
await report.query("select count(*) from customers");
console.log("report: transaction open after reading customers");

const alter = migration.query("alter table customers add column phone text");
await sleep(300);
const started = performance.now();
const lookup = shopper.query("select email from customers where id = 1").then(() => {
  console.log(`shopper: got an answer after ${((performance.now() - started) / 1000).toFixed(1)} s`);
});
await sleep(300);

const { rows } = await setup.query(`
  select application_name as who, wait_event_type as waiting_for, left(query, 45) as query
  from pg_stat_activity where application_name in ('report', 'migration', 'shopper') order by application_name`);
console.table(rows);

await sleep(2000);
await report.query("commit");
console.log("report: commits");
await alter;
await lookup;

console.log("--- the same, with lock_timeout on the migration");
await report.query("begin");
await report.query("select count(*) from customers");
await migration.query("set lock_timeout = '1s'");
const retry = migration.query("alter table customers add column city text").catch((error) => {
  console.log(`migration: ${error.code} ${error.message}`);
});
await sleep(300);
const started2 = performance.now();
await shopper.query("select email from customers where id = 1");
console.log(`shopper: got an answer after ${((performance.now() - started2) / 1000).toFixed(1)} s`);
await retry;
await report.query("commit");
for (const c of [setup, report, migration, shopper]) await c.end();
```

Terminal on your computer

```bash
$ node lock-queue.js
report: transaction open after reading customers
┌─────────┬─────────────┬─────────────┬───────────────────────────────────────────────┐
│ (index) │ who         │ waiting_for │ query                                         │
├─────────┼─────────────┼─────────────┼───────────────────────────────────────────────┤
│ 0       │ 'migration' │ 'Lock'      │ 'alter table customers add column phone text' │
│ 1       │ 'report'    │ 'Client'    │ 'select count(*) from customers'              │
│ 2       │ 'shopper'   │ 'Lock'      │ 'select email from customers where id = 1'    │
└─────────┴─────────────┴─────────────┴───────────────────────────────────────────────┘
report: commits
shopper: got an answer after 2.4 s
--- the same, with lock_timeout on the migration
migration: 55P03 canceling statement due to lock timeout
shopper: got an answer after 0.7 s
```

`pg_stat_activity` shows the queue: the report is idle inside its transaction (waiting for its `Client` to send more), the migration waits for a `Lock`, and the shopper's simple lookup waits for a `Lock` too, not because of the report, but because it queued behind the migration. On a busy shop, hundreds of requests pile up like this in seconds and the pool is exhausted.

With `lock_timeout` set, the migration gave up after one second and the shopper got through. Set a short `lock_timeout` (a few seconds) for every migration, and retry it later if it times out. It turns "the shop froze" into "the deploy needs another attempt".

### Statements to handle with care

| Change | Risk | Safer way |
| --- | --- | --- |
| Rename or drop a column or table | Breaks running code | Expand and contract over several deploys |
| `create index` | Blocks writes for the whole build | `create index concurrently`, outside a transaction |
| Add a foreign key or check constraint | Scans the table while holding a lock | Add it `not valid`, then `validate constraint` separately |
| `set not null` | Scans the table under an exclusive lock | Add `check (col is not null) not valid`, validate it, then `set not null` (PostgreSQL uses the check and skips the scan) |
| Change a column's type | Rewrites the table under an exclusive lock | New column, sync, backfill, switch, drop: expand and contract |
| Big `update` to backfill | Long transaction, locks many rows, bloats the table | Small batches, each its own transaction |

`not valid` deserves a closer look. The constraint is enforced for every new or changed row immediately, but existing rows are not checked until you ask. That splits one long, locking operation into a quick one and a scan that does not block writes:

not-valid.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table customers (id integer primary key, phone text);
  insert into customers values (1, '0803 000 0001'), (2, '0803-000-0002'), (3, '0805 000 0003');
`);
const PHONE = "phone ~ '^0[789]0[0-9] [0-9]{3} [0-9]{4}$'";

await db.exec(`alter table customers add constraint customers_phone_format check (${PHONE}) not valid`);
console.log("added, not validated yet");

for (const sql of [
  "insert into customers values (4, '0809/111/2222')",
  "alter table customers validate constraint customers_phone_format",
]) {
  try {
    await db.exec(sql);
    console.log("ok:", sql);
  } catch (error) {
    console.log("refused:", error.message);
  }
}

await db.exec("update customers set phone = replace(phone, '-', ' ') where not (" + PHONE + ")");
await db.exec("alter table customers validate constraint customers_phone_format");
console.log("validated after cleaning up");
await db.close();
```

Output of `node not-valid.js`

```ts
added, not validated yet
refused: new row for relation "customers" violates check constraint "customers_phone_format"
refused: check constraint "customers_phone_format" of relation "customers" is violated by some row
validated after cleaning up
```

The new bad phone was refused at once, while the old one (row 2) stayed until someone cleaned it up. `validate constraint` then found the old row, and succeeded after the fix. On a real server, validation takes a much weaker lock than adding the constraint did, so the shop keeps selling while it runs.

### Backfilling in batches

A single `update` over ten million rows is one enormous transaction: it holds row locks on everything it touched until the end, produces a flood of WAL for replicas to replay, and cannot be stopped halfway without losing all its work. Backfill in batches instead, each in its own short transaction, until a batch finds nothing to do:

backfill.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table orders (id integer primary key, total_kobo integer not null, total_naira numeric(12, 2));
  insert into orders select n, 100000 + n * 37 % 900000, null from generate_series(1, 25000) as n;
`);

let batches = 0;
for (;;) {
  const { affectedRows } = await db.query(`
    update orders set total_naira = total_kobo / 100.0
    where id in (select id from orders where total_naira is null order by id limit 10000)`);
  if (affectedRows === 0) break;
  batches++;
  console.log(`batch ${batches}: ${affectedRows} rows`);
}
const { rows } = await db.query("select count(*)::int as missing from orders where total_naira is null");
console.log(rows[0]);
await db.close();
```

Output of `node backfill.js`

```ts
batch 1: 10000 rows
batch 2: 10000 rows
batch 3: 5000 rows
{ missing: 0 }
```

Each batch can be paused between iterations (add a short sleep on a busy server), resumed after a crash (it only picks rows that still need it), and watched. The inner `order by id limit` needs an index to stay fast; on a real table, `where id > $lastId` is even better than re-checking `is null`.

### Forward-only migrations, with checksums

[How databases work](https://zudojs.oyinlola.site/learn/databases#migrations) built a runner that records which migrations ran. Production runners add one more safety check: they store a **checksum** (a hash of the migration's text) and refuse to continue if a migration that already ran has since been edited, because that edit will never reach the databases that already ran it:

checksums.jsNode.js only

```ts
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

async function migrate(db, migrations) {
  await db.exec("create table if not exists schema_migrations (id integer primary key, checksum text not null)");
  const applied = new Map((await db.query("select id, checksum from schema_migrations")).rows.map((r) => [r.id, r.checksum]));
  for (const m of migrations) {
    if (applied.has(m.id)) {
      if (applied.get(m.id) !== sha(m.sql)) throw new Error(`migration ${m.id} was edited after it ran; write a new migration instead`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into schema_migrations values ($1, $2)", [m.id, sha(m.sql)]);
    });
    console.log(`applied ${m.id}`);
  }
}

const db = new PGlite();
const v1 = [
  { id: 1, sql: "create table products (id integer primary key, sku text not null unique)" },
  { id: 2, sql: "alter table products add column price_kobo integer" },
];
await migrate(db, v1);
await migrate(db, [...v1, { id: 3, sql: "alter table products add column name text" }]);

try {
  await migrate(db, [v1[0], { id: 2, sql: "alter table products add column price_kobo integer not null" }]);
} catch (error) {
  console.log("refused:", error.message);
}
await db.close();
```

Output of `node checksums.js`

```ts
applied 1
applied 2
applied 3
refused: migration 2 was edited after it ran; write a new migration instead
```

The second run applied only migration 3. The third run was refused, because someone "fixed" migration 2 in place. The fix belongs in migration 4. Tools like the one in [the ZudoJS database lesson](https://zudojs.oyinlola.site/learn/zudo-database) do this for you.

## Seeds

A **seed** puts known rows into a database. There are three kinds, and mixing them up causes real incidents:

- **Reference data** the application needs everywhere, production included: order statuses, the list of Nigerian states, the root categories. It belongs in version control and runs on every deploy.
- **Development data**: fake customers and orders for your laptop and staging. It must never run against production.
- **Test fixtures**: the exact rows one test needs, created by that test ([Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies)).

Because reference seeds run on every deploy, they must be **idempotent**: running them twice gives the same result as running them once. `insert … on conflict` does that. `do nothing` keeps rows people may have edited; `do update` makes the seed the source of truth:

seed.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table delivery_zones (code text primary key, name text not null, fee_kobo integer not null);
  create table categories (id integer generated always as identity primary key, slug text not null unique, name text not null);
`);

const zones = [["LAG-MAIN", "Lagos Mainland", 150000], ["LAG-ISL", "Lagos Island", 200000], ["ABJ", "Abuja", 350000]];
const categories = [["groceries", "Groceries"], ["electronics", "Electronics"]];

async function seed() {
  for (const [code, name, fee] of zones) {
    await db.query(
      `insert into delivery_zones values ($1, $2, $3)
       on conflict (code) do update set name = excluded.name, fee_kobo = excluded.fee_kobo`,
      [code, name, fee],
    );
  }
  for (const [slug, name] of categories) {
    await db.query("insert into categories (slug, name) values ($1, $2) on conflict (slug) do nothing", [slug, name]);
  }
}

await seed();
await db.exec("update categories set name = 'Food and groceries' where slug = 'groceries'");
zones[2][2] = 400000;
await seed();

console.log((await db.query("select code, fee_kobo from delivery_zones order by code")).rows);
console.log((await db.query("select id, slug, name from categories order by id")).rows);
await db.close();
```

Output of `node seed.js`

```json
[
  { code: 'ABJ', fee_kobo: 400000 },
  { code: 'LAG-ISL', fee_kobo: 200000 },
  { code: 'LAG-MAIN', fee_kobo: 150000 }
]
[
  { id: 1, slug: 'groceries', name: 'Food and groceries' },
  { id: 2, slug: 'electronics', name: 'Electronics' }
]
```

The second run changed the Abuja fee (`do update`, the seed owns zones) but kept the category name an admin had edited (`do nothing`, the seed only creates categories), and created no duplicates. Seed by a stable natural key such as `code` or `slug`, never by generated ids, which differ between databases.

## Backups, and the restore that proves them

A backup protects you from what replication and RAID cannot: a `delete` without a `where`, a buggy migration, ransomware, a cloud account closed by mistake. Replicas copy those mistakes faithfully within milliseconds.

| Kind | How | Good for |
| --- | --- | --- |
| Logical | `pg_dump`: SQL-level copy of one database (schema and data) | Small and medium databases, copying to another version, restoring one table |
| Physical | `pg_basebackup` or a storage snapshot: a copy of the data files | Large databases; the starting point for replicas and point-in-time recovery |
| Point-in-time recovery (PITR) | A physical base backup plus every WAL file archived since | Restoring to any moment, such as 14:31:59, just before the bad `delete` at 14:32 |

Two numbers describe a backup plan. The **recovery point objective** (RPO) is how much data you can afford to lose: with a nightly `pg_dump`, up to a day of orders. The **recovery time objective** (RTO) is how long you can be down while restoring. Managed PostgreSQL services give you PITR with an RPO of seconds; know what yours is configured to keep.

Here is the whole cycle on the Docker server: take a dump, have an accident, restore into a separate database to check it, then copy back only what was lost. `--format=custom` produces a compressed file that `pg_restore` can restore selectively and in parallel:

Back up, break, restore

```bash
$ pg_dump "$DATABASE_URL" --format=custom --file=shop.dump
$ du -h shop.dump
320K	shop.dump
$ pg_restore --list shop.dump | grep -v "^;"
218; 1259 16885 TABLE public customers postgres
217; 1259 16884 SEQUENCE public customers_id_seq postgres
220; 1259 16895 TABLE public orders postgres
219; 1259 16894 SEQUENCE public orders_id_seq postgres
3466; 0 16885 TABLE DATA public customers postgres
3468; 0 16895 TABLE DATA public orders postgres
3475; 0 0 SEQUENCE SET public customers_id_seq postgres
3476; 0 0 SEQUENCE SET public orders_id_seq postgres
3314; 2606 16893 CONSTRAINT public customers customers_email_key postgres
3316; 2606 16891 CONSTRAINT public customers customers_pkey postgres
3318; 2606 16899 CONSTRAINT public orders orders_pkey postgres
3319; 2606 16900 FK CONSTRAINT public orders orders_customer_id_fkey postgres
# the accident: a delete without a where
$ psql "$DATABASE_URL" -c "delete from orders"
DELETE 50000
# restore into a separate database first, and check it
$ psql "$DATABASE_URL" -c "create database shop_restore"
CREATE DATABASE
$ export RESTORE_URL="${DATABASE_URL%/*}/shop_restore"
$ pg_restore --dbname="$RESTORE_URL" --jobs=4 shop.dump
$ psql "$RESTORE_URL" -c "select (select count(*) from customers) as customers, (select count(*) from orders) as orders"
 customers | orders
-----------+--------
      5000 |  50000
(1 row)

# the backup is good: put back only the orders data
$ pg_restore --dbname="$DATABASE_URL" --data-only --table=orders shop.dump
$ psql "$DATABASE_URL" -c "select count(*) as orders from orders"
 orders
--------
  50000
(1 row)
```

The list shows what a dump contains: table definitions, data, sequence positions and constraints, which are restored after the data so loading is fast. Restoring into a side database first means you never make things worse while panicking. Anything written between the dump and the accident is *not* in the dump; that gap is your RPO, and only PITR closes it.

A backup you have never restored is a hope, not a backup. Schedule a job that restores the latest backup into a scratch database and runs checks against it: row counts, the invariant queries from [the modelling lesson](https://zudojs.oyinlola.site/learn/db-modeling#testing), the ledger reconciliation from [the transactions lesson](https://zudojs.oyinlola.site/learn/db-transactions#testing). The same test is easy to run in-process. PGlite can dump its whole data directory to a file and start a new database from it:

restore-test.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const live = new PGlite();
await live.exec(`
  create table orders (id integer primary key, customer_id integer not null, total_kobo integer not null);
  insert into orders select n, 1 + n % 300, 100000 + n % 900000 from generate_series(1, 5000) as n;
`);
const summary = async (db) => (await db.query("select count(*)::int as orders, sum(total_kobo)::bigint as kobo from orders")).rows[0];

const backup = await live.dumpDataDir("gzip");
console.log("backup file:", backup.name, backup.size > 0 ? "(not empty)" : "(EMPTY)");

await live.exec("delete from orders where customer_id = 42");

const restored = new PGlite({ loadDataDir: backup });
const [before, after] = [await summary(restored), await summary(live)];
console.log("restored:", before);
console.log("live now:", after);
console.log("restore test:", before.orders === 5000 ? "PASS" : "FAIL");
await live.close();
await restored.close();
```

Output of `node restore-test.js`

```ts
backup file: pgdata.tar.gz (not empty)
restored: { orders: 5000, kobo: 512502500 }
live now: { orders: 4983, kobo: 510761003 }
restore test: PASS
```

## Replication and read replicas

**Replication** keeps copies of the database on other servers. PostgreSQL's built-in **streaming replication** sends the write-ahead log from the **primary** (the one server that accepts writes) to one or more **standbys**, which replay it and stay a byte-for-byte copy. A standby that answers read-only queries is a **read replica**. Replicas give you two things:

- **Availability**: if the primary dies, a standby is **promoted** to primary (**failover**), usually by the hosting platform or a tool such as Patroni, within seconds to a minute.
- **Read capacity**: reports, search pages and exports can run on replicas, leaving the primary's resources for writes.

By default replication is **asynchronous**: the primary confirms a commit without waiting for any standby, so a replica can be slightly behind (**replication lag**), and a failover can lose the last moments of commits. **Synchronous** replication (`synchronous_standby_names`) makes the primary wait for a standby to confirm, trading commit latency for zero loss.

A replica is created from a physical copy of the primary. This is how the replica for the next demo was started, as a second container that copies the primary with `pg_basebackup` and then follows it (the primary had a `replicator` role with the `replication` attribute, and a `pg_hba.conf` line allowing it):

A streaming replica in Docker

```bash
$ docker network create shop-net
887ae1b8c138a25342975333a9304e55bbef5f4727920cd1f020c91dde3e92fe
$ docker network connect --alias primary shop-net wallet-db
$ docker run --name shop-replica --network shop-net -e PGPASSWORD="$REPLICATION_PASSWORD" -p 5442:5432 -d --entrypoint sh postgres:17-alpine -c 'mkdir -p /var/lib/postgresql/data && chown postgres /var/lib/postgresql/data && chmod 700 /var/lib/postgresql/data && gosu postgres pg_basebackup -h primary -U replicator -D /var/lib/postgresql/data -R -X stream --checkpoint=fast && exec gosu postgres postgres'
368996f1514dfa22b4dc79c2550f1206327790cf24e8bd10c7a9eb7cf89b6617
$ docker logs shop-replica 2>&1 | tail -3
2026-09-24 22:22:20.960 UTC [24] LOG:  consistent recovery state reached at 0/60001D0
2026-09-24 22:22:20.960 UTC [1] LOG:  database system is ready to accept read-only connections
2026-09-24 22:22:20.982 UTC [25] LOG:  started streaming WAL from primary at 0/7000000 on timeline 1
```

`-R` writes the settings that make the copy start as a standby following the primary. With `PRIMARY_URL` and `REPLICA_URL` set, this script writes to the primary and reads from both, then pauses the replica's replay to make lag visible:

replica.js

```ts
import pg from "pg";

const primary = new pg.Pool({ connectionString: process.env.PRIMARY_URL });
const replica = new pg.Pool({ connectionString: process.env.REPLICA_URL });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const count = async (db) => (await db.query("select count(*)::int as n from orders where customer_id = 42")).rows[0].n;

for (const [name, db] of [["primary", primary], ["replica", replica]]) {
  const { rows } = await db.query("select pg_is_in_recovery() as standby");
  console.log(`${name}: standby = ${rows[0].standby}`);
}

try {
  await replica.query("insert into orders (customer_id, total_kobo) values (42, 250000)");
} catch (error) {
  console.log(`write on replica: ${error.code} ${error.message}`);
}

console.log("customer 42 orders, primary / replica:", await count(primary), "/", await count(replica));
await primary.query("insert into orders (customer_id, total_kobo) values (42, 250000)");
await sleep(200);
console.log("after an order and 0.2 s:", await count(primary), "/", await count(replica));

await replica.query("select pg_wal_replay_pause()");
await primary.query("insert into orders (customer_id, total_kobo) values (42, 990000)");
await sleep(200);
console.log("replay paused, one more order:", await count(primary), "/", await count(replica));
const lag = await primary.query(`
  select state, sync_state, pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as bytes_behind
  from pg_stat_replication`);
console.log("pg_stat_replication on the primary:", lag.rows[0]);

await replica.query("select pg_wal_replay_resume()");
await sleep(200);
console.log("replay resumed:", await count(primary), "/", await count(replica));
await primary.end();
await replica.end();
```

Terminal on your computer

```bash
$ node replica.js
primary: standby = false
replica: standby = true
write on replica: 25006 cannot execute INSERT in a read-only transaction
customer 42 orders, primary / replica: 10 / 10
after an order and 0.2 s: 11 / 11
replay paused, one more order: 12 / 11
pg_stat_replication on the primary: { state: 'streaming', sync_state: 'async', bytes_behind: '232' }
replay resumed: 12 / 12
```

The replica refused the write. Normally it caught up within the 0.2 seconds; on a quiet local network lag is milliseconds. With replay paused, which is what a replica stuck behind a long query or a slow disk looks like, it answered with the old count. `pg_stat_replication` on the primary shows each standby and how far behind it is (here in bytes of WAL; `replay_lag` gives it as time). Graph it and alert on it.

## Consistency when you read from replicas

A system where copies can briefly disagree but converge when writes stop is **eventually consistent**. That is fine for a product list. It is not fine for Ada, who pays for an order and is immediately shown her order history, read from a replica that has not replayed the payment yet. She sees "unpaid" and pays again. Users expect **read-your-writes** consistency: after I change something, I see my change.

Common ways to route reads without breaking it:

- Send a user's reads to the primary for a few seconds after that user wrote anything (sticky reads).
- Remember the primary's WAL position after the write (`pg_current_wal_lsn()`) and only use a replica whose `pg_last_wal_replay_lsn()` has passed it.
- Keep reads that feed a decision (balances before a transfer, stock before an order) on the primary, always.

The first is simple enough to write now. This router simulates a replica that is 500 ms behind, with an explicit clock so the output is the same every time:

read-router.js

```ts
function createRouter({ stickyMs }) {
  const lastWrite = new Map();
  return {
    wrote(userId, now) {
      lastWrite.set(userId, now);
    },
    target(userId, now) {
      const at = lastWrite.get(userId);
      return at !== undefined && now - at < stickyMs ? "primary" : "replica";
    },
  };
}

const primary = new Map([["ada:order-17", "unpaid"]]);
const replica = new Map(primary);
const LAG_MS = 500;
const pendingReplication = [];

function write(key, value, now) {
  primary.set(key, value);
  pendingReplication.push({ key, value, visibleAt: now + LAG_MS });
}
function read(db, key, now) {
  for (const change of pendingReplication) if (change.visibleAt <= now) replica.set(change.key, change.value);
  return (db === "primary" ? primary : replica).get(key);
}

for (const stickyMs of [0, 2000]) {
  const router = createRouter({ stickyMs });
  primary.set("ada:order-17", "unpaid");
  replica.set("ada:order-17", "unpaid");
  pendingReplication.length = 0;

  write("ada:order-17", "paid", 1000);
  router.wrote("ada", 1000);
  const reads = [1100, 1600, 4000].map((t) => {
    const db = router.target("ada", t);
    return `t=${t} ${db}: ${read(db, "ada:order-17", t)}`;
  });
  console.log(`sticky ${stickyMs} ms -> ${reads.join(", ")}`);
}
```

Output of `node read-router.js` and of the browser terminal

```ts
sticky 0 ms -> t=1100 replica: unpaid, t=1600 replica: paid, t=4000 replica: paid
sticky 2000 ms -> t=1100 primary: paid, t=1600 primary: paid, t=4000 replica: paid
```

Without stickiness, Ada's read 100 ms after paying went to the replica and saw "unpaid". With a 2-second sticky window, her reads went to the primary until the replica had long caught up. Other users' reads, which never see Ada's pending write as "missing", can use the replica throughout. A related guarantee, **monotonic reads**, says a user never sees data go backwards; switching one user between replicas with different lag breaks it, so route each user to one replica.

## In production

- **Watch the vital signs**: connections in use versus `max_connections`, pool wait times, replication lag, disk space (the WAL fills disks fast when a replica or archive falls behind), the longest open transaction, and the slow-query list from [the indexes lesson](https://zudojs.oyinlola.site/learn/db-indexes#slow-queries).
- **Separate roles**: the application connects as a role that can read and write data but not change the schema; migrations run as a different role; nobody uses the `postgres` superuser day to day. Rotate passwords, keep connection strings in secrets (never in git), and require TLS on any network you do not control.
- **Automate migrations in the deploy pipeline** with `lock_timeout` and `statement_timeout` set, the expand step before the new code and the contract step one or more deploys later.
- **Prefer a managed service** (Amazon RDS, Google Cloud SQL, Azure, Neon, Supabase and others) unless you have people whose job is running PostgreSQL. You still own the schema, the queries, the pool sizes and the restore tests.
- **Write runbooks** before the incident: how to restore to a point in time, how to promote a replica, how to find and kill a blocking session (`pg_terminate_backend`). [Production engineering](https://zudojs.oyinlola.site/learn/production-engineering) covers incident practice.

## Practice

TRY IT YOURSELF

### Split a column without downtime

`customers.full_name` must become `first_name` and `last_name`. List the deploys and migrations, in order, so that every running app version works at every moment.

**Show a solution**

1. **Expand** (migration): add nullable `first_name` and `last_name`, plus a trigger that fills them from `full_name` when only `full_name` is written, and fills `full_name` from them when only they are written.
2. **Backfill** in batches: split existing names. Decide what to do with names that do not split cleanly (a single name, three names), and log them for review instead of guessing silently.
3. **Deploy v2**: reads and writes the new columns. The trigger keeps `full_name` correct for v1 servers still running.
4. After every server runs v2 and logs show no query touching `full_name`: **contract**, in a later deploy: drop the trigger, then `full_name`. If the new columns must be required, add `check (… is not null) not valid`, validate, then `set not null`.

Four deploys instead of one, and none of them can take the shop down.

TRY IT YOURSELF

### A seed with parents

Seed a category tree (Groceries with Grains and Oils; Electronics with Audio) idempotently. Children refer to their parent by `parent_id`, which is a generated id that differs between databases. Run the seed twice and show that nothing is duplicated.

**Show a solution**

seed-tree.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table categories (
    id integer generated always as identity primary key,
    slug text not null unique,
    name text not null,
    parent_id integer references categories (id)
  );
`);

const tree = [
  ["groceries", "Groceries", null],
  ["grains", "Grains", "groceries"],
  ["oils", "Oils", "groceries"],
  ["electronics", "Electronics", null],
  ["audio", "Audio", "electronics"],
];

async function seed() {
  for (const [slug, name, parentSlug] of tree) {
    await db.query(
      `insert into categories (slug, name, parent_id)
       values ($1, $2, (select id from categories where slug = $3))
       on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id`,
      [slug, name, parentSlug],
    );
  }
}

await seed();
await seed();
const { rows } = await db.query(`
  select c.slug, p.slug as parent from categories c left join categories p on p.id = c.parent_id order by c.id`);
console.log(rows, (await db.query("select count(*)::int as n from categories")).rows[0]);
await db.close();
```

Output of `node seed-tree.js`

```json
[
  { slug: 'groceries', parent: null },
  { slug: 'grains', parent: 'groceries' },
  { slug: 'oils', parent: 'groceries' },
  { slug: 'electronics', parent: null },
  { slug: 'audio', parent: 'electronics' }
] { n: 5 }
```

Parents are looked up by their stable `slug` inside the insert, so the seed works on any database whatever ids it hands out. The list is ordered so parents come before their children. Note that `do update` used up identity numbers on the second run; ids have gaps, which does not matter.

TRY IT YOURSELF

### Pool arithmetic

Your managed PostgreSQL allows 200 connections. You run 8 API containers, 2 background workers, a cron container, and you want 10 connections left for migrations and people. The API has 4 CPU cores per container. What pool sizes would you choose? What changes if autoscaling can run 30 API containers at peak?

**Show a solution**

Budget: 200 − 10 reserved = 190. Workers and cron might take 5 each (15 total), leaving 175 for 8 API containers: at most 21 each. A pool of about 10 to 15 per API container (a few per core) is plenty for typical short queries, and leaves headroom. At 30 containers, 30 × 10 = 300 exceeds the limit: either cap autoscaling, shrink the pools (30 × 5 = 150), or put PgBouncer in front so the containers' client connections share a fixed set of server connections. Then load-test: if requests wait for the pool while the database is idle, the pool is too small; if the database is saturated, more connections will only make it slower.

## Summary

- Connections are expensive, so apps use pools. Size them from the database's limit down: instances × pool size must fit under `max_connections`. Release in `finally`, set an acquire timeout, and use PgBouncer when there are too many clients.
- During a deploy, old and new code share one schema. Make incompatible changes with expand, migrate and contract, each step its own deploy.
- Know which statements lock and scan. Set `lock_timeout` on migrations, use `create index concurrently`, add constraints `not valid` and validate later, and backfill in batches. Migrations are forward-only, and checksums catch edited ones.
- Seeds are idempotent (`on conflict`) and keyed by natural keys. Reference data, development data and test fixtures are different things.
- Logical dumps, physical backups and PITR cover different needs; RPO and RTO say which you need. Restore regularly into a scratch database, or you do not know you have a backup.
- Streaming replication gives failover and read capacity. Replicas lag, so route reads to protect read-your-writes and monotonic reads, and keep decision-making reads on the primary.

Next: [Typing database code](https://zudojs.oyinlola.site/learn/db-typescript), the last lesson of this course: turning rows into TypeScript types you can trust.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
