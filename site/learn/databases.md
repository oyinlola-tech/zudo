---
title: "How databases work"
description: "Why a backend keeps its data in a database, how relational databases organise it into tables and relationships, and what keys, constraints, indexes, transactions and migrations do, with real PostgreSQL running inside Node.js."
source: https://zudojs.oyinlola.site/learn/databases
---

LESSON 27 OF 84

Backend fundamentals Foundation

# How databases work

Why a backend keeps its data in a database, how relational databases organise it into tables and relationships, and what keys, constraints, indexes, transactions and migrations do, with real PostgreSQL running inside Node.js.

- **45 min** to read and try
- **You need:** The Designing a REST API lesson
- **You build:** A PostgreSQL schema for users, tasks and tags, with a tiny migration runner

  [Test yourself](#test)

## Why a database?

Your Task API keeps its tasks in an array. Stop the server and they are gone. Save the array to a JSON file and new problems appear: two requests writing at the same moment overwrite each other, finding one task means reading the whole file, and a crash halfway through a write leaves a broken file.

A **database** is a program whose whole job is to store data safely and find it fast. Your server talks to it, sends it questions and changes, and gets answers back. It keeps data on disk, lets many clients work at the same time without breaking anything, and survives crashes.

### SQL and NoSQL

Databases come in families:

| Family | Stores data as | Examples |
| --- | --- | --- |
| Relational (SQL) | Tables of rows and columns, linked to each other | PostgreSQL, MySQL, SQLite, SQL Server |
| Document | JSON-like documents | MongoDB, Firestore |
| Key-value | A value stored under a key, like a giant `Map` | Redis, Valkey |
| Others | Graphs, time series, search indexes | Neo4j, InfluxDB, Elasticsearch |

Everything that is not relational is often called **NoSQL**. Relational databases are spoken to in **SQL** (Structured Query Language). They check the shape of your data, link records safely, and are the right default for most backends. This course uses **PostgreSQL**, often called Postgres: free, open source, and one of the most used databases in the world.

## PostgreSQL inside Node.js

A normal PostgreSQL is a server you install and run, which you will do in [the next lesson](https://zudojs.oyinlola.site/learn/sql-basics). To start learning right now, use **PGlite**: the real PostgreSQL, compiled to WebAssembly so it runs inside your Node.js program. No server, no password, no setup. Make a project and install it:

Terminal on your computer

```bash
$ mkdir task-db
$ cd task-db
$ npm init -y
Wrote to ~/task-db/package.json:
…
$ npm pkg set type=module
$ npm install @electric-sql/pglite
added 1 package, and audited 2 packages in 3m

found 0 vulnerabilities
```

PGlite is about 26 MB on disk, so the first install can take a little while. Now create a database, a table, and a row:

first.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
  create table tasks (
    id integer generated always as identity primary key,
    title text not null,
    done boolean not null default false
  )
`);

await db.query("insert into tasks (title) values ($1)", ["Buy milk"]);
await db.query("insert into tasks (title, done) values ($1, $2)", ["Write report", true]);

const result = await db.query("select * from tasks");
console.log(result.rows);
await db.close();
```

Output of `node first.js`

```json
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Write report', done: true }
]
```

Save it as `first.js` and run `node first.js`. It takes a few seconds, because PGlite builds a fresh, empty database in memory each time. You should see the output above.

- `new PGlite()` starts a database that lives in memory and disappears when the program ends. Perfect for learning and for tests. Pass a folder name, `new PGlite("./data")`, to keep it on disk.
- `db.exec(sql)` runs one or more SQL statements and is used here for setup.
- `db.query(sql, params)` runs one statement. `$1` and `$2` are **placeholders**: the values from the array are sent separately from the SQL text. Always pass outside values this way; [the next lesson](https://zudojs.oyinlola.site/learn/sql-basics) shows the attack it prevents.
- `result.rows` is an array of plain objects, one per row. The id was filled in by the database.

SQL keywords are not case sensitive. Many people write them in capitals (`CREATE TABLE`); this course uses lower case, which is just as valid.

## Tables, rows, columns and keys

A **table** holds one kind of thing, like tasks. Each **column** is one property with a fixed **type**: `integer`, `text`, `boolean`, `timestamptz` (a date and time with time zone), `numeric` (exact decimals, for money), and more. Each **row** is one task. It is like an array of objects where every object is forced to have the same shape.

A **primary key** is the column that identifies each row. No two rows may share it, and it can never be empty. `generated always as identity` lets the database pick the next number, so two requests at the same moment can never get the same id. The database enforces this, even if your code has a bug:

primary-key.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec("create table tags (name text primary key)");

await db.query("insert into tags (name) values ($1)", ["home"]);
try {
  await db.query("insert into tags (name) values ($1)", ["home"]);
} catch (error) {
  console.log(error.message);
  console.log(error.code, error.detail);
}
await db.close();
```

Output of `node primary-key.js`

```ts
duplicate key value violates unique constraint "tags_pkey"
23505 Key (name)=(home) already exists.
```

Here the tag's name is its primary key, a **natural key** taken from the data itself. The second insert was refused. The error has a `message` for people, a `detail` with the exact value, and a `code` for your program: `23505` always means "unique violation" in PostgreSQL, so your API can turn it into **409 Conflict**.

## Relationships between tables

Real data is connected: a user owns tasks, a task has tags. A relational database does not copy the user into every task. It stores each thing once and links them by key. A **foreign key** is a column that holds the primary key of a row in another table, and the database makes sure it points at a row that exists.

There are three kinds of relationship:

- **One-to-many**: one user has many tasks, each task has one user. Put a `user_id` column on `tasks`.
- **One-to-one**: one user has one profile. Put a `user_id` on `profiles` and make it `unique`, so no user gets two.
- **Many-to-many**: a task has many tags, and a tag is on many tasks. Neither table can hold a single id for the other, so a third table, a **join table**, holds one row per link.

Here is the Task API's schema with all three. A **schema** is the set of tables and rules in a database:

schema.jsNode.js only

```ts
export const schema = `
  create table users (
    id integer generated always as identity primary key,
    email text not null unique
  );
  create table profiles (
    user_id integer primary key references users (id) on delete cascade,
    display_name text not null
  );
  create table tasks (
    id integer generated always as identity primary key,
    user_id integer not null references users (id) on delete cascade,
    title text not null
  );
  create table tags (
    id integer generated always as identity primary key,
    name text not null unique
  );
  create table task_tags (
    task_id integer not null references tasks (id) on delete cascade,
    tag_id integer not null references tags (id) on delete cascade,
    primary key (task_id, tag_id)
  );
`;
```

- `references users (id)` makes a foreign key. `on delete cascade` says: when the user is deleted, delete their rows here too.
- In `profiles`, `user_id` is both the primary key and the foreign key, so each user has at most one profile: one-to-one.
- `task_tags` is the join table. Its primary key is the *pair* `(task_id, tag_id)`, so the same tag cannot be added to the same task twice.

Fill it with data and ask for Ada's tasks with their tags. The query uses a **join**, which combines rows from several tables. [The joins lesson](https://zudojs.oyinlola.site/learn/sql-advanced) explains it properly; for now, read `join ... on` as "match rows where these columns are equal":

relations.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { schema } from "./schema.js";

const db = new PGlite();
await db.exec(schema);
await db.exec(`
  insert into users (email) values ('ada@example.com'), ('alan@example.com');
  insert into profiles (user_id, display_name) values (1, 'Ada');
  insert into tasks (user_id, title) values (1, 'Buy milk'), (1, 'Write report'), (2, 'Fix bike');
  insert into tags (name) values ('home'), ('work'), ('urgent');
  insert into task_tags (task_id, tag_id) values (1, 1), (2, 2), (2, 3);
`);

const { rows } = await db.query(
  `select tasks.title, tags.name as tag
   from tasks
   join task_tags on task_tags.task_id = tasks.id
   join tags on tags.id = task_tags.tag_id
   where tasks.user_id = $1
   order by tasks.id, tags.name`,
  [1],
);
console.log(rows);

try {
  await db.query("insert into tasks (user_id, title) values ($1, $2)", [99, "Ghost task"]);
} catch (error) {
  console.log(error.message);
}

await db.query("delete from users where id = $1", [1]);
const left = await db.query("select count(*)::int as tasks from tasks");
console.log(left.rows[0]);
await db.close();
```

Output of `node relations.js`

```json
[
  { title: 'Buy milk', tag: 'home' },
  { title: 'Write report', tag: 'urgent' },
  { title: 'Write report', tag: 'work' }
]
insert or update on table "tasks" violates foreign key constraint "tasks_user_id_fkey"
{ tasks: 1 }
```

Three things happened:

1. The join followed the links from tasks through `task_tags` to `tags`. "Write report" appears twice because it has two tags.
2. A task for user 99, who does not exist, was refused. Without the foreign key, that orphan row would sit in your data forever.
3. Deleting Ada deleted her profile, her two tasks and their tag links, thanks to `on delete cascade`. Only Alan's task is left. (`count(*)::int` converts the count to a normal number; `::` is how PostgreSQL changes a value's type.)

## Constraints: rules the database enforces

A **constraint** is a rule on a table that the database checks on every insert and update, whichever program does the writing. You have already used `primary key`, `references` and `unique`. Two more are `not null` (a value is required) and `check` (any condition you write):

constraints.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table tasks (
    id integer generated always as identity primary key,
    title text not null check (length(trim(title)) between 1 and 100),
    priority integer not null default 2 check (priority between 1 and 3)
  )
`);

const attempts = [
  ["Buy milk", 1],
  [null, 1],
  ["   ", 1],
  ["Fix bike", 7],
];
for (const [title, priority] of attempts) {
  try {
    await db.query("insert into tasks (title, priority) values ($1, $2)", [title, priority]);
    console.log("saved", JSON.stringify(title));
  } catch (error) {
    console.log("refused:", error.message);
  }
}
await db.close();
```

Output of `node constraints.js`

```ts
saved "Buy milk"
refused: null value in column "title" of relation "tasks" violates not-null constraint
refused: new row for relation "tasks" violates check constraint "tasks_title_check"
refused: new row for relation "tasks" violates check constraint "tasks_priority_check"
```

Your API still validates input and answers with a friendly 400, as in [the REST lesson](https://zudojs.oyinlola.site/learn/rest-design). Constraints are the last line of defence: they protect the data from bugs, from scripts someone runs by hand, and from a second service that forgot a check.

## Indexes

To find the tasks of user 1, the database could read every row in the table and keep the matching ones. That is a **sequential scan**, and it gets slower as the table grows. An **index** is a sorted lookup structure, like the index at the back of a book: it jumps straight to the right rows.

Primary keys and `unique` columns get an index automatically. Foreign keys do **not**, and they are exactly what you filter by. `explain` shows the plan the database picks for a query:

index.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table tasks (
    id integer generated always as identity primary key,
    user_id integer not null,
    title text not null
  );
  insert into tasks (user_id, title)
    select n % 1000, 'Task ' || n from generate_series(1, 50000) as n;
  analyze tasks;
`);

async function plan() {
  const { rows } = await db.query("explain (costs off) select * from tasks where user_id = 42");
  console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
}

await plan();
await db.exec("create index tasks_user_id_idx on tasks (user_id)");
console.log("--- after create index ---");
await plan();
await db.close();
```

Output of `node index.js`

```ts
Seq Scan on tasks
  Filter: (user_id = 42)
--- after create index ---
Bitmap Heap Scan on tasks
  Recheck Cond: (user_id = 42)
  ->  Bitmap Index Scan on tasks_user_id_idx
        Index Cond: (user_id = 42)
```

`generate_series` produced 50,000 rows to make the difference visible. Before the index, PostgreSQL planned a `Seq Scan`: read all 50,000 rows. After it, a `Bitmap Index Scan` finds the 50 matching rows in the index first, and the heap scan fetches just those. [The joins lesson](https://zudojs.oyinlola.site/learn/sql-advanced) measures the real time difference.

Indexes are not free: each one takes disk space and makes every insert and update a little slower, because the index must be updated too. Add them for the columns you actually search, filter, join and sort by.

## Transactions

Some changes only make sense together. Moving a task from Ada to Alan and writing that move into an activity log are two statements; if the server crashes between them, the data tells a lie. A **transaction** groups statements so that they all happen, or none do.

Databases promise four things about transactions, known by the letters **ACID**:

- **Atomic**: all or nothing. If one statement fails, every change in the transaction is undone.
- **Consistent**: when the transaction ends, every constraint still holds.
- **Isolated**: other clients do not see your half-finished changes.
- **Durable**: once the database says "committed", the change survives a crash or power cut.

PGlite's `db.transaction` runs your function inside a transaction. If the function throws, everything is **rolled back** (undone):

transaction.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table tasks (id integer primary key, owner text not null);
  create table activity (id integer generated always as identity primary key, message text not null check (message <> ''));
  insert into tasks values (1, 'ada');
`);

async function reassign(taskId, to, message) {
  await db.transaction(async (tx) => {
    await tx.query("update tasks set owner = $1 where id = $2", [to, taskId]);
    await tx.query("insert into activity (message) values ($1)", [message]);
  });
}

try {
  await reassign(1, "alan", "");
} catch (error) {
  console.log("failed:", error.message);
}
console.log((await db.query("select owner from tasks")).rows, (await db.query("select * from activity")).rows);

await reassign(1, "alan", "Task 1 moved from ada to alan");
console.log((await db.query("select owner from tasks")).rows, (await db.query("select * from activity")).rows);
await db.close();
```

Output of `node transaction.js`

```ts
failed: new row for relation "activity" violates check constraint "activity_message_check"
[ { owner: 'ada' } ] []
[ { owner: 'alan' } ] [ { id: 2, message: 'Task 1 moved from ada to alan' } ]
```

The first call updated the owner, then the log insert broke the `check` constraint. Because both statements ran in one transaction, the owner change was undone too: the task still belongs to Ada. The second call succeeded, and both changes were saved together.

Look at the log row's id: 2, not 1. The failed attempt used up number 1, and generated numbers are never handed back, even on rollback. Ids can have gaps, so never use them to count rows.

## Migrations

Your schema will change: next month tasks need a due date. You cannot just edit the `create table` statement, because the production database already exists and holds real data. Instead you write a **migration**: a small, numbered change such as "add column `due_date`". Each migration runs exactly once, in order, on every database: your laptop, your colleague's, the test server and production.

To know which migrations already ran, the database itself keeps a list in a table. Here is a complete migration runner in a few lines:

migrate.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  { id: 1, name: "create tasks", sql: "create table tasks (id integer generated always as identity primary key, title text not null)" },
  { id: 2, name: "add done", sql: "alter table tasks add column done boolean not null default false" },
  { id: 3, name: "add due date", sql: "alter table tasks add column due_date date" },
];

async function migrate(db) {
  await db.exec("create table if not exists schema_migrations (id integer primary key, name text not null)");
  const { rows } = await db.query("select id from schema_migrations");
  const done = new Set(rows.map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
    });
    console.log(`applied ${m.id}: ${m.name}`);
  }
}

const db = new PGlite();
await migrate(db);
console.log("second run:");
await migrate(db);
const cols = await db.query("select column_name from information_schema.columns where table_name = 'tasks' order by ordinal_position");
console.log(cols.rows.map((r) => r.column_name));
await db.close();
```

Output of `node migrate.js`

```ts
applied 1: create tasks
applied 2: add done
applied 3: add due date
second run:
[ 'id', 'title', 'done', 'due_date' ]
```

The second run did nothing, because all three ids were already in `schema_migrations`. Each migration runs inside a transaction, so a failing one leaves no half-changed table behind. `information_schema` is a set of built-in tables that describe your own database.

Two rules keep migrations safe. Never edit a migration that has already run somewhere: write a new one. And keep them in version control with your code, which is the [Git lesson](https://zudojs.oyinlola.site/learn/git). Real projects use a migration tool instead of writing the runner themselves; ZudoJS has one, shown in [the ZudoJS database lesson](https://zudojs.oyinlola.site/learn/zudo-database).

## Practice

TRY IT YOURSELF

### Projects own tasks

Add a `projects` table (id and a unique, non-empty name) and give `tasks` a **nullable** `project_id`, so a task may belong to no project. When a project is deleted, its tasks should stay but lose their project. Hint: `on delete set null`. Show it working.

**Show a solution**

projects.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table projects (
    id integer generated always as identity primary key,
    name text not null unique check (name <> '')
  );
  create table tasks (
    id integer generated always as identity primary key,
    project_id integer references projects (id) on delete set null,
    title text not null
  );
  insert into projects (name) values ('Home');
  insert into tasks (project_id, title) values (1, 'Fix bike'), (null, 'Call Ada');
`);

await db.query("delete from projects where id = $1", [1]);
console.log((await db.query("select * from tasks order by id")).rows);
await db.close();
```

Output of `node projects.js`

```json
[
  { id: 1, project_id: null, title: 'Fix bike' },
  { id: 2, project_id: null, title: 'Call Ada' }
]
```

TRY IT YOURSELF

### Which relationship?

Name the relationship and where the key goes: (a) an order and its order lines; (b) students and courses; (c) a user and their settings row; (d) a comment and the task it is on.

**Show a solution**

(a) One-to-many: `order_id` on `order_lines`. (b) Many-to-many: a join table `enrollments (student_id, course_id)`. (c) One-to-one: a unique `user_id` on `settings`. (d) One-to-many: `task_id` on `comments`.

TRY IT YOURSELF

### Migration 4

Add a fourth migration to the runner that creates an index on `tasks (due_date)`. Why must it be a new migration instead of a change to migration 3?

**Show a solution**

Add `{ id: 4, name: "index due date", sql: "create index tasks_due_date_idx on tasks (due_date)" }` to the list. Every database that already ran migration 3 has it recorded in `schema_migrations` and will never run it again, so a change to it would never reach them. A new id runs everywhere exactly once.

## Recap

- A database stores data safely, handles many clients at once and finds data fast. Relational (SQL) databases like PostgreSQL are the default choice for backends.
- Tables have typed columns and rows. A primary key identifies each row; a foreign key links to a row in another table.
- One-to-many: a foreign key on the "many" side. One-to-one: a unique foreign key. Many-to-many: a join table.
- Constraints (`not null`, `unique`, `check`, foreign keys) are rules the database enforces whatever program writes.
- Indexes make lookups fast and writes a little slower. Index the columns you filter and join by, including foreign keys.
- A transaction is all or nothing (ACID). Migrations change the schema in small, numbered steps that each run once.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
