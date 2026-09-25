---
title: "SQL with PostgreSQL — ZudoJS Academy"
description: "Run PostgreSQL with an installer or Docker, use psql, and write everyday SQL: insert, select, update, delete, and placeholders that stop SQL injection."
source: https://zudojs.oyinlola.site/learn/sql-basics
---

LEVEL 7 · LESSON 4 OF 15

Databases and SQL Core

# SQL with PostgreSQL

Run PostgreSQL with an installer or Docker, use psql, and write everyday SQL: insert, select, update, delete, and placeholders that stop SQL injection.

- **45 min** to read and try
- **You need:** The How databases work lesson
- **You build:** A running PostgreSQL server and a task store with safe, parameterized queries

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Install and start PostgreSQL with an installer or with Docker, keeping the password out of your commands
- Create a database and inspect tables with psql
- Write insert, select, update and delete statements with where, order by, limit, offset and returning
- Scope every query to the current user and turn "no row changed" into a 404
- Explain SQL injection and prevent it with placeholders for values and allow-lists for names

## Install PostgreSQL

In [the last lesson](https://zudojs.oyinlola.site/learn/databases) PostgreSQL ran inside your program with PGlite. In production it runs as a separate **server**: a program that listens on a network port, 5432 by default, and answers many clients at once. You will want one on your computer too. There are two good ways to get it.

### Option 1: the installer or your package manager

| System | How |
| --- | --- |
| Windows | Download the installer from `postgresql.org/download/windows` and run it. Remember the password you choose for the `postgres` user. It also installs `psql`. |
| macOS | `brew install postgresql@18`, then `brew services start postgresql@18`. Or install Postgres.app from `postgresapp.com`. |
| Ubuntu, Debian | `sudo apt install postgresql`. It starts by itself; connect with `sudo -u postgres psql`. |

The server then starts with your computer and keeps running in the background.

### Option 2: Docker

**Docker** runs programs in **containers**: isolated boxes that bring everything the program needs. You do not install PostgreSQL itself, and you can delete it cleanly afterwards. Install Docker Desktop from `docker.com` (on Linux, Docker Engine), then check it works:

Terminal on your computer

```bash
$ docker --version
Docker version 29.8.0, build 88096ef
```

An **image** is the packaged program; a container is one running copy of it. Download the official PostgreSQL 17 image:

Terminal on your computer

```bash
$ docker pull postgres:17
17: Pulling from library/postgres
…
Digest: sha256:f4c66b820c6f974249089d3d16d86a3698eae11e8746eb6644b2271031e91232
Status: Downloaded newer image for postgres:17
docker.io/library/postgres:17
```

The first download takes a while (the image is a few hundred megabytes). The server needs a password for its `postgres` user. Do not invent one and type it into commands you will copy around. Generate a random one and keep it in an **environment variable** in your terminal. The name `PGPASSWORD` is special: `psql` reads it by itself.

Terminal on your computer

```bash
$ export PGPASSWORD=$(node -p "crypto.randomUUID()")
$ docker run --name pg -e POSTGRES_PASSWORD="$PGPASSWORD" -p 5432:5432 -d postgres:17
b5a3db7f12847038c1f57889f746b27d71a4a4ac69849c49e37c26bba7ef55e8
docker: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint pg (cc4a10bf1b247cd26aed27b99700ea9f924681e0b9c93ec0bf6f157611beb94c): failed to bind host port 0.0.0.0:5432/tcp: address already in use

Run 'docker run --help' for more information
# port 5432 is already used on this computer: remove the failed container and pick another port
$ docker rm pg
pg
$ docker run --name pg -e POSTGRES_PASSWORD="$PGPASSWORD" -p 5434:5432 -d postgres:17
c84cd3a7fc73d6415625a8d259b1aa5721d3a061d01ef5af6b8043dafd8830c1
$ docker ps
CONTAINER ID   IMAGE         COMMAND                  CREATED         STATUS         PORTS                                         NAMES
c84cd3a7fc73   postgres:17   "docker-entrypoint.s…"   6 seconds ago   Up 5 seconds   0.0.0.0:5434->5432/tcp, [::]:5434->5432/tcp   pg
```

- `--name pg` gives the container a name, so you can refer to it later.
- `-e POSTGRES_PASSWORD="$PGPASSWORD"` passes the password in from your environment.
- `-p 5432:5432` connects port 5432 on your computer (the left number) to port 5432 inside the container (the right one). On this computer another PostgreSQL already used 5432, so Docker refused with `address already in use`. Docker had already created the container, so `docker rm pg` removes it before trying again with port 5434. If 5432 is free on yours, the first command simply works.
- `-d` runs it in the background. The long line it prints is the container's id. `docker ps` lists running containers.

> NOTE
>
> On Windows PowerShell, set the variable with `$env:PGPASSWORD = node -p "crypto.randomUUID()"` and write `-e POSTGRES_PASSWORD=$env:PGPASSWORD`. The variable only lives in that terminal window; a new window needs it set again.

### The zero-install option

Every runnable example on this page uses PGlite, which you installed in the last lesson with `npm install @electric-sql/pglite`. It speaks the same SQL (PGlite is PostgreSQL 18; nothing in these lessons differs from 17), so each example also works against the server you just started. [The next lesson](https://zudojs.oyinlola.site/learn/sql-advanced) connects Node.js to that server.

## Talk to the server with psql

**psql** is PostgreSQL's command-line client: you type SQL, it prints the answer. The installers include it. With Docker you can use the one inside the container, `docker exec -it pg psql -U postgres`, or install only the client (`brew install libpq` on macOS, `sudo apt install postgresql-client` on Linux).

Terminal on your computer

```bash
$ psql -h localhost -p 5434 -U postgres
psql (18.6 (Debian 18.6-3), server 17.11 (Debian 17.11-1.pgdg13+2))
Type "help" for help.

postgres=# create database taskdb;
CREATE DATABASE
postgres=# \c taskdb
psql (18.6 (Debian 18.6-3), server 17.11 (Debian 17.11-1.pgdg13+2))
You are now connected to database "taskdb" as user "postgres".
taskdb=# create table tasks (id integer generated always as identity primary key, title text not null, done boolean not null default false);
CREATE TABLE
taskdb=# insert into tasks (title) values ('Buy milk'), ('Write report');
INSERT 0 2
taskdb=# select * from tasks;
 id |    title     | done
----+--------------+------
  1 | Buy milk     | f
  2 | Write report | f
(2 rows)

taskdb=# \dt
          List of tables
 Schema | Name  | Type  |  Owner
--------+-------+-------+----------
 public | tasks | table | postgres
(1 row)

taskdb=# \d tasks
                          Table "public.tasks"
 Column |  Type   | Collation | Nullable |           Default
--------+---------+-----------+----------+------------------------------
 id     | integer |           | not null | generated always as identity
 title  | text    |           | not null |
 done   | boolean |           | not null | false
Indexes:
    "tasks_pkey" PRIMARY KEY, btree (id)

taskdb=# \q
```

`-h` is the host, `-p` the port and `-U` the user; psql took the password from `PGPASSWORD`. The first line shows the client's version and the server's: they may differ, which is fine. Lines ending in `;` are SQL. Lines starting with a backslash are psql's own commands:

- `create database taskdb;` makes a new, empty database. One server can hold many, for example one per project.
- `\c taskdb` connects to it. The prompt changes to `taskdb=#`.
- `\dt` lists the tables, `\d tasks` describes one, `\q` quits.

Keep the container running: [the next lesson](https://zudojs.oyinlola.site/learn/sql-advanced) connects Node.js to it. `docker stop pg` stops it and `docker start pg` starts it again with its data. When you no longer need it, delete it; its data is deleted with it:

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

## create table and insert

The rest of this lesson runs the same SQL with PGlite so you can see real results on the page. This module creates a fresh database with a `tasks` table for two users, and the other examples import it:

db.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openDb() {
  const db = new PGlite();
  await db.exec(`
    create table tasks (
      id integer generated always as identity primary key,
      user_id integer not null,
      title text not null,
      done boolean not null default false,
      priority integer not null default 2
    );
    insert into tasks (user_id, title, done, priority) values
      (1, 'Buy milk', true, 2),
      (1, 'Write report', false, 1),
      (1, 'Call Ada', false, 3),
      (2, 'Fix bike', false, 2),
      (2, 'Read book', true, 3);
  `);
  return db;
}
```

`insert into table (columns) values (...)` adds rows; several rows can go in one statement, separated by commas. Text values use single quotes. Columns you leave out get their `default`. Add `returning` to get the new row back, including the id the database chose:

insert.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();
const { rows } = await db.query(
  "insert into tasks (user_id, title) values ($1, $2) returning *",
  [1, "Water plants"],
);
console.log(rows[0]);
await db.close();
```

Output of `node insert.js`

```json
{ id: 6, user_id: 1, title: 'Water plants', done: false, priority: 2 }
```

`returning *` saves a second query. It is exactly what a `POST /tasks` handler needs to answer with 201 and the new task.

## select, where, order by, limit

`select` reads rows. You list the columns you want (or `*` for all), name the table after `from`, and add clauses:

- `where` keeps only rows that match a condition. Combine conditions with `and`, `or` and `not`.
- `order by` sorts, `asc` (the default) or `desc`. Without it, the order is **not guaranteed**.
- `limit` takes at most that many rows, and `offset` skips rows first: the offset pagination from [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#pagination).

select.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

const open = await db.query(
  "select id, title, priority from tasks where user_id = $1 and done = false order by priority, id",
  [1],
);
console.log(open.rows);

const search = await db.query("select title from tasks where title ilike $1", ["%b%"]);
console.log(search.rows);

const page2 = await db.query("select id, title from tasks order by id limit $1 offset $2", [2, 2]);
console.log(page2.rows);
await db.close();
```

Output of `node select.js`

```json
[
  { id: 2, title: 'Write report', priority: 1 },
  { id: 3, title: 'Call Ada', priority: 3 }
]
[
  { title: 'Buy milk' },
  { title: 'Fix bike' },
  { title: 'Read book' }
]
[ { id: 3, title: 'Call Ada' }, { id: 4, title: 'Fix bike' } ]
```

- The first query is "user 1's open tasks, most important first". The `id` after `priority` is the tie-breaker that [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#query) recommended.
- `ilike` compares text, ignoring upper and lower case. In the pattern, `%` means "any characters". `like` is the case-sensitive version.
- `limit 2 offset 2` is page 2 with two tasks per page.

A missing value in SQL is `null`, and it is not equal to anything, not even to `null`. Test for it with `where due_date is null`, never `= null`.

## update and delete

`update` changes columns of the rows that match the `where`. `delete` removes them. Both accept `returning`, and the result's `affectedRows` says how many rows changed:

update-delete.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

const done = await db.query(
  "update tasks set done = true, title = $1 where id = $2 and user_id = $3 returning *",
  ["Write the report", 2, 1],
);
console.log(done.rows);

const missing = await db.query("update tasks set done = true where id = $1 and user_id = $2", [99, 1]);
console.log("rows changed:", missing.affectedRows);

const removed = await db.query("delete from tasks where done = true returning id, title");
console.log("deleted:", removed.rows);

const left = await db.query("select count(*)::int as n from tasks");
console.log(left.rows[0].n, "tasks left");
await db.close();
```

Output of `node update-delete.js`

```json
[
  {
    id: 2,
    user_id: 1,
    title: 'Write the report',
    done: true,
    priority: 1
  }
]
rows changed: 0
deleted: [
  { id: 1, title: 'Buy milk' },
  { id: 5, title: 'Read book' },
  { id: 2, title: 'Write the report' }
]
2 tasks left
```

The deleted rows came back as 1, 5, 2, not sorted by id: row 2 had just been updated, and PostgreSQL returns rows in whatever order it finds them. Only `order by` promises an order.

REASON IT OUT

### Whose task is it?

The API gets `PATCH /tasks/2` with `{"done": true}` from a logged-in user. Before writing the SQL, answer:

- Which values come from the client, and which from the server's own knowledge?
- User 2 sends it, but task 2 belongs to user 1. What must happen?
- The `update` changed 0 rows. Should the answer be 404 Not Found or 403 Forbidden?

**Show the reasoning**

The task id in the URL and the body come from the client. The user id comes from the login session, which the server checked; it never comes from the body or the URL. So every query includes the session's user id in its `where`: `where id = $1 and user_id = $2`. Without it, user 2 could change user 1's task just by guessing its id, one of the most common security bugs in real APIs.

With the user in the `where`, "no such task" and "someone else's task" look the same to the database: 0 rows changed. Answer **404** in both cases. A 403 would confirm to user 2 that task 2 exists, which leaks information; a 404 says only "there is no such task *for you*". This also costs one query instead of two.

> Always write the where first
>
> An `update` or `delete` without `where` changes **every row in the table**. `delete from tasks;` is a valid statement. In psql, a good habit is to run the same `where` as a `select` first and look at what it matches.

## SQL injection, and how placeholders stop it

Every example so far sent values with `$1`, `$2` placeholders. Here is why. The next example builds the SQL by gluing the user's input into the text. **This is the bug. Do not write code like this.**

injection-bug.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

// INSECURE: user input is pasted into the SQL text.
async function findMyTasks(userId, title) {
  const sql = `select user_id, title from tasks where user_id = ${userId} and title = '${title}'`;
  return (await db.query(sql)).rows;
}

console.log(await findMyTasks(1, "Buy milk"));
console.log(await findMyTasks(1, "x' or '1'='1"));
await db.close();
```

Output of `node injection-bug.js`

```json
[ { user_id: 1, title: 'Buy milk' } ]
[
  { user_id: 1, title: 'Buy milk' },
  { user_id: 1, title: 'Write report' },
  { user_id: 1, title: 'Call Ada' },
  { user_id: 2, title: 'Fix bike' },
  { user_id: 2, title: 'Read book' }
]
```

The first call behaves. The second "title" contains a quote. Pasted into the text, the query becomes:

```ts
select user_id, title from tasks where user_id = 1 and title = 'x' or '1'='1'
```

`and` is evaluated before `or`, and `'1'='1'` is always true, so the condition matches every row. User 1 just read user 2's tasks. With other input, an attacker can read any table, change data or log in as someone else. This is **SQL injection**, one of the most common and most damaging security bugs on the web.

The fix is the placeholder. The SQL text and the values travel to the database **separately**, so a value can never become part of the SQL, whatever characters it contains:

injection-fix.jsNode.js only

```ts
import { openDb } from "./db.js";

const db = await openDb();

async function findMyTasks(userId, title) {
  const sql = "select user_id, title from tasks where user_id = $1 and title = $2";
  return (await db.query(sql, [userId, title])).rows;
}

console.log(await findMyTasks(1, "Buy milk"));
console.log(await findMyTasks(1, "x' or '1'='1"));
await db.close();
```

Output of `node injection-fix.js`

```json
[ { user_id: 1, title: 'Buy milk' } ]
[]
```

Now the attack is just a strange title that no task has, and the answer is an empty list.

SQL is not the only place where outside text can turn into commands: shell commands, file paths and outgoing URLs have the same problem. [Writing injection-safe code](https://zudojs.oyinlola.site/learn/sec-injection), in the Security course, covers them all.

Placeholders work for **values**. They cannot stand for a column name or `asc`/`desc`. When those come from the client, as with `sort` in [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#query), pick them from an allow-list in your code and never paste the client's text.

## Practice

TRY IT YOURSELF

### A task store

Write a module with `createTask(db, userId, title)`, `listOpen(db, userId)` and `completeTask(db, userId, id)`. `completeTask` returns the updated task, or `null` when no such task exists for that user. Use placeholders everywhere, and test that user 2 cannot complete user 1's task.

**Show a solution**

store.jsNode.js only

```ts
import { openDb } from "./db.js";

async function createTask(db, userId, title) {
  const { rows } = await db.query("insert into tasks (user_id, title) values ($1, $2) returning id, title, done", [userId, title]);
  return rows[0];
}

async function listOpen(db, userId) {
  const { rows } = await db.query("select id, title from tasks where user_id = $1 and not done order by id", [userId]);
  return rows;
}

async function completeTask(db, userId, id) {
  const { rows } = await db.query("update tasks set done = true where id = $1 and user_id = $2 returning id, title, done", [id, userId]);
  return rows[0] ?? null;
}

const db = await openDb();
const task = await createTask(db, 1, "Plan trip");
console.log(await listOpen(db, 1));
console.log("user 2 tries:", await completeTask(db, 2, task.id));
console.log("user 1 tries:", await completeTask(db, 1, task.id));
await db.close();
```

Output of `node store.js`

```json
[
  { id: 2, title: 'Write report' },
  { id: 3, title: 'Call Ada' },
  { id: 6, title: 'Plan trip' }
]
user 2 tries: null
user 1 tries: { id: 6, title: 'Plan trip', done: true }
```

TRY IT YOURSELF

### Spot the injection

Which of these are safe? (a) `db.query("select * from tasks where id = " + Number(id))`; (b) `db.query(\`select * from tasks order by ${sort}\`)` where `sort` comes from the query string; (c) `db.query("select * from tasks where title = $1", [title])`; (d) `db.query("select * from tasks where title = '" + title.replaceAll("'", "") + "'")`.

**Show a solution**

Only (c) is right. (a) happens to be safe because `Number` can only produce a number, but it is fragile: the next person edits it and drops `Number`. (b) is injectable: check `sort` against an allow-list. (d) tries to clean the input by hand; that approach fails sooner or later (and it also breaks titles such as `Ada's book`). Use placeholders.

## Recap

- Install PostgreSQL with the installer or package manager, or run it in Docker with `docker run ... postgres:17`. Keep the password in an environment variable.
- `psql` is the command-line client: `\c` connects, `\dt` lists tables, `\d` describes one, `\q` quits.
- `insert ... returning`, `select ... where ... order by ... limit ... offset`, `update ... set ... where`, `delete ... where`.
- Put the user's id in every `where`, so one user can never touch another's rows.
- Never paste input into SQL text. Use `$1` placeholders for values and allow-lists for names.

Next: [Joins, grouping and transactions](https://zudojs.oyinlola.site/learn/sql-advanced), where you combine tables, summarise them, and connect Node.js to your server.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
