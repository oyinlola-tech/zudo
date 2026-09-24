---
title: "Joins, grouping and transactions"
description: "Combine tables with joins, summarise data with group by and aggregates, filter groups with having, nest queries, control transactions yourself, measure queries with explain analyze, and connect Node.js to a real PostgreSQL server."
source: https://zudojs.oyinlola.site/learn/sql-advanced
---

LESSON 29 OF 84

Backend fundamentals Foundation

# Joins, grouping and transactions

Combine tables with joins, summarise data with group by and aggregates, filter groups with having, nest queries, control transactions yourself, measure queries with explain analyze, and connect Node.js to a real PostgreSQL server.

- **45 min** to read and try
- **You need:** The SQL with PostgreSQL lesson
- **You build:** A task report with joins and aggregates, a measured index, and a Node.js script talking to your PostgreSQL server

  [Test yourself](#test)

## The data for this lesson

Every example imports this module. It creates three users and their tasks. Each task has an `estimate` in minutes. Grace has no tasks at all, which will matter:

db.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openDb() {
  const db = new PGlite();
  await db.exec(`
    create table users (
      id integer generated always as identity primary key,
      name text not null
    );
    create table tasks (
      id integer generated always as identity primary key,
      user_id integer not null references users (id),
      title text not null,
      done boolean not null default false,
      estimate integer not null
    );
    insert into users (name) values ('Ada'), ('Alan'), ('Grace');
    insert into tasks (user_id, title, done, estimate) values
      (1, 'Buy milk', true, 10),
      (1, 'Write report', false, 120),
      (1, 'Call the bank', false, 20),
      (2, 'Fix bike', false, 60),
      (2, 'Read book', true, 90);
  `);
  return db;
}
```

## Joins: inner and left

The tasks table stores `user_id`, not the user's name. To show "Ada: Buy milk", you **join** the two tables: for each task, find the user row whose `id` equals the task's `user_id`, and put both side by side.

- An **inner join** (`join`) keeps only pairs that match. A user with no tasks disappears.
- A **left join** keeps every row of the left table (the one after `from`). When nothing matches on the right, the right side's columns are `null`.

joins.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

const inner = await db.query(`
  select users.name, tasks.title
  from users
  join tasks on tasks.user_id = users.id
  where not tasks.done
  order by users.name, tasks.id`);
console.log(inner.rows);

const left = await db.query(`
  select u.name, t.title
  from users u
  left join tasks t on t.user_id = u.id and not t.done
  order by u.name, t.id`);
console.log(left.rows);
await db.close();
```

Output of `node joins.js`

```json
[
  { name: 'Ada', title: 'Write report' },
  { name: 'Ada', title: 'Call the bank' },
  { name: 'Alan', title: 'Fix bike' }
]
[
  { name: 'Ada', title: 'Write report' },
  { name: 'Ada', title: 'Call the bank' },
  { name: 'Alan', title: 'Fix bike' },
  { name: 'Grace', title: null }
]
```

The inner join lists the three open tasks. The left join also lists Grace, with `title: null`, because she has no open tasks. Use a left join whenever "nothing on the right" is a valid answer you still want to see.

The second query gives the tables short **aliases**, `users u` and `tasks t`, to save typing. Notice where the `not t.done` condition went: into the `on`. Had it been in a `where`, Grace's row (whose `t.done` is `null`) would have been filtered out, and the left join would behave like an inner join. It is a classic mistake.

## Grouping and aggregates

An **aggregate** function turns many rows into one value: `count`, `sum`, `avg`, `min`, `max`. `group by` splits the rows into groups first, and the aggregate runs once per group. Here is a report with one row per user:

report.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const { rows } = await db.query(`
  select u.name,
         count(t.id) as tasks,
         count(t.id) filter (where t.done) as done,
         coalesce(sum(t.estimate), 0) as minutes,
         avg(t.estimate) as average
  from users u
  left join tasks t on t.user_id = u.id
  group by u.id, u.name
  order by u.name`);
console.log(rows);
await db.close();
```

Output of `node report.js`

```json
[
  {
    name: 'Ada',
    tasks: 3,
    done: 1,
    minutes: 150,
    average: '50.0000000000000000'
  },
  {
    name: 'Alan',
    tasks: 2,
    done: 1,
    minutes: 150,
    average: '75.0000000000000000'
  },
  { name: 'Grace', tasks: 0, done: 0, minutes: 0, average: null }
]
```

- `count(t.id)` counts rows where `t.id` is not null, so Grace gets 0. `count(*)` would count her one joined row and say 1.
- `filter (where t.done)` makes an aggregate look only at some rows of the group.
- `sum` of no rows is `null`, not 0. `coalesce(a, b)` returns the first value that is not null, so Grace gets 0 minutes.
- `avg` returns an exact decimal type called `numeric`, and the driver hands it to JavaScript as a **string**, because a JavaScript number could lose digits. Round it in SQL and convert it when you want a number: `round(avg(t.estimate), 1)::float8`.

Every column in the `select` must be either inside an aggregate or listed in `group by`. Otherwise PostgreSQL would not know which of the group's many values to show, and it refuses the query.

## having: filtering groups

`where` filters rows *before* grouping. `having` filters groups *after*, so it can use aggregates. Which users have more than an hour of open work?

having.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const { rows } = await db.query(
  `select u.name, sum(t.estimate) as open_minutes
   from users u
   join tasks t on t.user_id = u.id
   where not t.done
   group by u.id, u.name
   having sum(t.estimate) > $1
   order by open_minutes desc`,
  [60],
);
console.log(rows);
await db.close();
```

Output of `node having.js`

```json
[ { name: 'Ada', open_minutes: 140 } ]
```

Alan's open work is exactly 60 minutes, which is not more than 60, so only Ada is left. The order in which PostgreSQL works through a query is: `from` and joins, `where`, `group by`, `having`, `select`, `order by`, `limit`. That is why `order by` may use the alias `open_minutes` but `having` must repeat `sum(t.estimate)`.

## Subqueries

A **subquery** is a query inside another query, in parentheses. It can produce one value, a list, or a yes/no answer:

subqueries.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

const long = await db.query(`
  select title, estimate from tasks
  where estimate > (select avg(estimate) from tasks)
  order by estimate desc`);
console.log(long.rows);

const idle = await db.query(`
  select name from users u
  where not exists (select 1 from tasks t where t.user_id = u.id and not t.done)`);
console.log(idle.rows);
await db.close();
```

Output of `node subqueries.js`

```json
[
  { title: 'Write report', estimate: 120 },
  { title: 'Read book', estimate: 90 }
]
[ { name: 'Grace' } ]
```

The first subquery computes one value, the average estimate (60), and the outer query keeps tasks above it. The second is **correlated**: it refers to `u.id` from the outer query, so it runs for each user and asks "does this user have any open task?". `not exists` keeps the users for whom the answer is no. Grace has no tasks at all, so she has no open tasks either.

## Transactions with begin, commit and rollback

In [How databases work](https://zudojs.oyinlola.site/learn/databases) you used `db.transaction`. Underneath, it sends three SQL commands, and you can send them yourself:

- `begin` starts a transaction.
- `commit` saves every change since `begin`, all at once.
- `rollback` throws every change since `begin` away.

begin.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const count = async () => (await db.query("select count(*) as n from tasks")).rows[0].n;

await db.exec("begin");
await db.query("delete from tasks where user_id = $1", [1]);
console.log("inside the transaction:", await count());
await db.exec("rollback");
console.log("after rollback:", await count());

await db.transaction(async (tx) => {
  await tx.query("update tasks set done = true where user_id = $1", [2]);
  const { rows } = await tx.query("select count(*) as n from tasks where not done");
  if (rows[0].n < 3) {
    await tx.rollback();
  }
});
console.log("open tasks:", (await db.query("select count(*) as n from tasks where not done")).rows[0].n);
await db.close();
```

Output of `node begin.js`

```ts
inside the transaction: 2
after rollback: 5
open tasks: 3
```

The delete really happened inside the transaction: the count dropped to 2. `rollback` brought all three of Ada's tasks back. In the second part, the function decided the result was not acceptable and called `tx.rollback()` itself, so Alan's tasks are still open.

> One connection per transaction
>
> A transaction belongs to one database connection. PGlite has only one, so the `begin` above is safe. A real server app uses a **pool** of connections, and two `pool.query` calls may go out on two different connections. With the `pg` package below, take one client with `pool.connect()`, run `begin`, your queries and `commit` on that client, and `release()` it at the end. ZudoJS does this for you in [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions).

## Indexes and query performance

[How databases work](https://zudojs.oyinlola.site/learn/databases) showed that `explain` prints the plan. `explain analyze` goes further: it **runs** the query and reports what really happened, including the time. Here is a table of 200,000 tasks and a query for one user's open tasks, before and after an index:

explain.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table tasks (id integer primary key, user_id integer not null, done boolean not null, title text not null);
  insert into tasks select n, n % 2000, n % 3 = 0, 'Task ' || n from generate_series(1, 200000) as n;
  analyze tasks;
`);

async function explain() {
  const { rows } = await db.query(
    "explain (analyze, costs off, timing off, buffers off) select id, title from tasks where user_id = 42 and not done",
  );
  console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
}

await explain();
await db.exec("create index tasks_user_done_idx on tasks (user_id, done)");
console.log("--- with an index on (user_id, done) ---");
await explain();
await db.close();
```

Output of `node explain.js`

```ts
Seq Scan on tasks (actual rows=66.00 loops=1)
  Filter: ((NOT done) AND (user_id = 42))
  Rows Removed by Filter: 199934
Planning Time: 0.843 ms
Execution Time: 113.300 ms
--- with an index on (user_id, done) ---
Bitmap Heap Scan on tasks (actual rows=66.00 loops=1)
  Recheck Cond: ((user_id = 42) AND (NOT done))
  Heap Blocks: exact=66
  ->  Bitmap Index Scan on tasks_user_done_idx (actual rows=66.00 loops=1)
        Index Cond: ((user_id = 42) AND (done = false))
        Index Searches: 1
Planning Time: 0.977 ms
Execution Time: 0.402 ms
```

Read a plan from the most indented line outwards:

- **Before**: a `Seq Scan` read the whole table. `Rows Removed by Filter` shows it looked at almost 200,000 rows to keep 66.
- **After**: the `Bitmap Index Scan` found the 66 matching entries in the index, and the heap scan fetched only those rows.
- `Execution Time` is the real time the query took. Your numbers will differ from the ones shown, but the index version is many times faster, and the gap grows with the table.

The index covers two columns, `(user_id, done)`, in the same order the query filters by. A **composite index** like this can serve queries on `user_id` alone too, but not queries on `done` alone. We turned off per-step timing and cost estimates (`timing off, costs off`) only to keep the output short; plain `explain analyze` shows them.

> TIP
>
> When an endpoint is slow, copy its SQL, put `explain analyze` in front of it in psql, and look for a `Seq Scan` on a big table with a large `Rows Removed by Filter`. That is usually the missing index.

## Connect Node.js to your PostgreSQL server

PGlite runs inside your program. To talk to the real server you started in [the last lesson](https://zudojs.oyinlola.site/learn/sql-basics), use the `pg` package (also called node-postgres). It is the most used PostgreSQL driver for Node.js. Make a project next to your other ones:

Terminal on your computer

```bash
$ mkdir task-pg
$ cd task-pg
$ npm init -y
Wrote to ~/task-pg/package.json:
…
$ npm pkg set type=module
$ npm install pg
added 14 packages, and audited 15 packages in 5s

found 0 vulnerabilities
```

Where the database is and how to log in is **configuration**, and the password is a secret, so neither belongs in your code. The convention is one environment variable, `DATABASE_URL`, holding a connection URL: `postgres://user:password@host:port/database`. The program refuses to start without it:

tasks.jsNode.js only

```ts
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

const done = process.argv[2] === "done";
const { rows } = await pool.query("select id, title, done from tasks where done = $1 order by id", [done]);
console.log(rows);

const count = await pool.query("select count(*) as n from tasks");
console.log(count.rows[0]);

await pool.end();
```

A **pool** keeps a few connections open and lends one to each query, because opening a new connection for every request is slow. `pool.query` takes the same `$1` placeholders as PGlite. `pool.end()` closes the connections so the program can exit; a server would keep the pool for its whole life.

Run it, first without the variable, then with it. The URL is built from `PGPASSWORD`, which you set in the last lesson, and points at the `taskdb` database you made with psql:

Terminal on your computer

```bash
$ node tasks.js
DATABASE_URL is not set
$ export DATABASE_URL="postgres://postgres:$PGPASSWORD@localhost:5434/taskdb"
$ node tasks.js
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Write report', done: false }
]
{ n: '2' }
$ node tasks.js done
[]
{ n: '2' }
```

These are the two rows you inserted with psql. Look at the count: `'2'`, a string. `count` returns a 64-bit integer (`bigint`), which can be larger than JavaScript numbers can hold exactly, so `pg` returns it as text. Write `count(*)::int` when you know the number is small, or convert it with `Number(...)`. PGlite converts it for you, which is why the examples above printed plain numbers.

Use port 5432 in the URL if that is where your server listens. A wrong password fails with `password authentication failed for user "postgres"`.

When you are finished with the Docker server, stop and delete it (its data goes with it):

Terminal on your computer

```bash
$ docker stop pg
pg
$ docker rm pg
pg
# optional: also delete the downloaded image to free disk space
$ docker rmi postgres:17
Untagged: postgres:17
Untagged: postgres@sha256:f4c66b820c6f974249089d3d16d86a3698eae11e8746eb6644b2271031e91232
Deleted: sha256:212aeeeb8faaef6c46498d86cbec6b9344d8d9492996b174664ff82c562ab685
…
```

## Practice

TRY IT YOURSELF

### Tasks per user, busiest first

Write one query that lists every user with their number of **open** tasks, including users with none, busiest first, then by name. Return plain numbers.

**Show a solution**

busiest.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const { rows } = await db.query(`
  select u.name, count(t.id)::int as open
  from users u
  left join tasks t on t.user_id = u.id and not t.done
  group by u.id, u.name
  order by open desc, u.name`);
console.log(rows);
await db.close();
```

Output of `node busiest.js`

```json
[
  { name: 'Ada', open: 2 },
  { name: 'Alan', open: 1 },
  { name: 'Grace', open: 0 }
]
```

The `not t.done` condition sits in the `on`, so Grace keeps her row, with 0.

TRY IT YOURSELF

### The biggest task of each user

For each user who has tasks, show the title of their task with the largest estimate. Hint: a correlated subquery can compare a task's estimate with the maximum for the same user.

**Show a solution**

biggest.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const { rows } = await db.query(`
  select u.name, t.title, t.estimate
  from tasks t
  join users u on u.id = t.user_id
  where t.estimate = (select max(estimate) from tasks where user_id = t.user_id)
  order by u.name`);
console.log(rows);
await db.close();
```

Output of `node biggest.js`

```json
[
  { name: 'Ada', title: 'Write report', estimate: 120 },
  { name: 'Alan', title: 'Read book', estimate: 90 }
]
```

If two tasks of one user tie for the largest estimate, both are shown.

## Recap

- `join` keeps matching pairs; `left join` keeps every left row and fills the right with `null`. Conditions on the right table of a left join go in `on`.
- `group by` with `count`, `sum`, `avg` summarises groups. `having` filters groups; `where` filters rows before grouping.
- Subqueries produce a value, a list or an exists-test; correlated ones refer to the outer row.
- `begin`, `commit`, `rollback` control a transaction, and a transaction lives on one connection.
- `explain analyze` runs a query and shows its real plan and time. A `Seq Scan` that removes most rows asks for an index.
- Connect with `pg` and a `Pool`, read `DATABASE_URL` from the environment, and remember that `bigint` and `numeric` arrive as strings.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
