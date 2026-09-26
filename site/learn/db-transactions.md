---
title: "Transactions, isolation and locks — ZudoJS Academy"
description: "Make a ₦ wallet transfer correct under concurrency with ACID transactions, isolation levels, row locks, deadlock-free ordering and optimistic version checks."
source: https://zudojs.oyinlola.site/learn/db-transactions
---

LEVEL 8 · LESSON 3 OF 5

Correctness and operations Core

# Transactions, isolation and locks

Make a ₦ wallet transfer correct under concurrency with ACID transactions, isolation levels, row locks, deadlock-free ordering and optimistic version checks.

- **60 min** to read and try
- **You need:** Indexes and query plans, and the transactions part of Joins, grouping and transactions
- **You build:** A wallet transfer that stays correct when many requests run at once, proven by a concurrent stress test against real PostgreSQL

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Show how a lost update creates money out of nothing, and prevent it with an atomic conditional update
- Explain ACID and what each PostgreSQL isolation level allows, with the anomaly each one stops
- Lock rows with SELECT … FOR UPDATE, avoid deadlocks by locking in a fixed order, and share work with SKIP LOCKED
- Implement optimistic concurrency with a version column and retry serialization failures safely
- Test a transfer under real concurrency and check the ledger's invariants

## ₦30,000 out of thin air

Ada has ₦50,000 in her wallet. On her phone she sends ₦30,000 to Tunde; at the same second, a scheduled payment sends ₦40,000 to Chioma. Together that is ₦70,000, more than she has, so one of them must be refused. Here is a transfer function that looks perfectly reasonable, and a wallet to try it on:

wallet.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openWallet() {
  const db = new PGlite();
  await db.exec(`
    create table accounts (
      id integer primary key,
      owner text not null,
      balance_kobo bigint not null check (balance_kobo >= 0),
      version integer not null default 1
    );
    create table transfers (
      id integer generated always as identity primary key,
      from_id integer not null references accounts (id),
      to_id integer not null references accounts (id),
      amount_kobo bigint not null check (amount_kobo > 0)
    );
    insert into accounts (id, owner, balance_kobo) values
      (1, 'Ada', 5000000), (2, 'Tunde', 1000000), (3, 'Chioma', 0);
  `);
  return db;
}

export const naira = (kobo) => `${kobo < 0 ? "-" : ""}₦${(Math.abs(Number(kobo)) / 100).toLocaleString("en-NG")}`;

export async function balances(db) {
  const { rows } = await db.query("select owner, balance_kobo from accounts order by id");
  const total = rows.reduce((sum, r) => sum + Number(r.balance_kobo), 0);
  return `${rows.map((r) => `${r.owner} ${naira(r.balance_kobo)}`).join(", ")}; total ${naira(total)}`;
}
```

naive.jsNode.js only

```ts
import { balances, openWallet } from "./wallet.js";

const db = await openWallet();

async function transfer(fromId, toId, amount) {
  const { rows } = await db.query("select balance_kobo from accounts where id = $1", [fromId]);
  const balance = Number(rows[0].balance_kobo);
  if (balance < amount) return "refused: not enough money";
  await db.query("update accounts set balance_kobo = $1 where id = $2", [balance - amount, fromId]);
  await db.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]);
  return "done";
}

console.log("before:", await balances(db));
const results = await Promise.all([
  transfer(1, 2, 3000000),
  transfer(1, 3, 4000000),
]);
console.log(results);
console.log("after: ", await balances(db));
await db.close();
```

Output of `node naive.js`

```ts
before: Ada ₦50,000, Tunde ₦10,000, Chioma ₦0; total ₦60,000
[ 'done', 'done' ]
after:  Ada ₦10,000, Tunde ₦40,000, Chioma ₦40,000; total ₦90,000
```

Both transfers were accepted, Tunde and Chioma received ₦70,000 between them, and Ada still has ₦10,000. The bank now holds ₦90,000 where there were ₦60,000. The two calls ran interleaved, as two requests do on a real server:

```ts
time ──────────────────────────────────────────────────────────────────►
transfer A   read 50,000 ─ check ok ─ write 50,000 − 30,000 = 20,000
transfer B        read 50,000 ─ check ok ──────── write 50,000 − 40,000 = 10,000  ← wins
```

Both read the balance before either wrote it. Each check passed against a stale value, and B's write erased A's.

This is a **lost update**: a **read-modify-write** cycle (read a value, compute a new one in the application, write it back) where another writer changed the value in between. [Debugging practice](https://zudojs.oyinlola.site/learn/debug-practice) met the same bug in plain JavaScript. The database did exactly what it was told; each statement was correct on its own. The bug is in the gaps between statements, and this lesson is about closing them.

## What a transaction promises

[How databases work](https://zudojs.oyinlola.site/learn/databases#transactions) introduced **ACID**. Here is what each letter means for the transfer:

- **Atomicity**: the debit and the credit happen together or not at all. A crash, a failing constraint or a `rollback` between them undoes both.
- **Consistency**: at commit, every constraint holds. `check (balance_kobo >= 0)` is part of the definition of "consistent" here; the database refuses to commit a negative balance.
- **Isolation**: concurrent transactions do not see each other's unfinished work, and, depending on the *isolation level*, are protected from some interleavings. This is the letter the naive transfer was missing, and the one with the most nuance.
- **Durability**: once `commit` returns, the transfer survives a crash. PostgreSQL writes every change to its write-ahead log (WAL) and flushes it to disk before confirming the commit.

Atomicity is easy to see. Send ₦10,000 from Ada to an account that does not exist: the debit succeeds, then recording the transfer fails on its foreign key, and the transaction takes the debit back:

atomicity.jsNode.js only

```ts
import { balances, openWallet } from "./wallet.js";

const db = await openWallet();
try {
  await db.transaction(async (tx) => {
    await tx.query("update accounts set balance_kobo = balance_kobo - $1 where id = $2", [1000000, 1]);
    await tx.query("insert into transfers (from_id, to_id, amount_kobo) values ($1, $2, $3)", [1, 99, 1000000]);
    await tx.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [1000000, 99]);
  });
} catch (error) {
  console.log("transfer failed:", error.message);
}
console.log(await balances(db));
await db.close();
```

Output of `node atomicity.js`

```ts
transfer failed: insert or update on table "transfers" violates foreign key constraint "transfers_to_id_fkey"
Ada ₦50,000, Tunde ₦10,000, Chioma ₦0; total ₦60,000
```

Ada still has ₦50,000. Without the transaction, her ₦10,000 would have left and arrived nowhere. But notice what a transaction alone does *not* fix: wrapping the naive transfer's statements in `db.transaction` keeps them together, yet on a real server two such transactions can still both read ₦50,000 before either writes. Atomicity is about failures; concurrency needs isolation and locking.

## The simplest fix: let the database check and write at once

The naive transfer read the balance into JavaScript, decided there, and wrote a computed value back. Move the decision into the `update` itself:

```ts
update accounts set balance_kobo = balance_kobo - $1
where id = $2 and balance_kobo >= $1
```

Two changes. The new value is computed from the *current* row (`balance_kobo - $1`), not from a value read earlier. And the check is part of the `where`: if the money is not there, no row matches and nothing changes. The application learns the outcome from the number of rows changed. A statement that checks and writes in one step is called an **atomic conditional update**.

The credit and the ledger row must happen only if the debit did. A data-modifying common table expression, like the BookStore's order statement, makes the whole transfer *one* statement, and a single statement is always atomic:

one-statement.jsNode.js only

```ts
import { balances, openWallet } from "./wallet.js";

const db = await openWallet();

const TRANSFER = `
  with debit as (
    update accounts set balance_kobo = balance_kobo - $3
    where id = $1 and balance_kobo >= $3
    returning id
  ), credit as (
    update accounts set balance_kobo = balance_kobo + $3
    where id = $2 and exists (select 1 from debit)
    returning id
  )
  insert into transfers (from_id, to_id, amount_kobo)
  select $1, $2, $3 from debit, credit
  returning id`;

async function transfer(fromId, toId, amount) {
  const { rows } = await db.query(TRANSFER, [fromId, toId, amount]);
  return rows.length === 1 ? `done, transfer ${rows[0].id}` : "refused: not enough money";
}

const results = await Promise.all([transfer(1, 2, 3000000), transfer(1, 3, 4000000)]);
console.log(results);
console.log(await balances(db));
await db.close();
```

Output of `node one-statement.js`

```json
[ 'done, transfer 1', 'refused: not enough money' ]
Ada ₦20,000, Tunde ₦40,000, Chioma ₦0; total ₦60,000
```

One transfer went through and the other was refused; the total is still ₦60,000. If the credit found no account, `credit` would be empty, the insert would produce no row, and the application should treat that as a failure; in production you would also run it inside a transaction with the checks you need, as the next sections do.

Why is this safe on a real server with many connections? When two sessions update the same row, the second one **waits** for the first to commit, then checks its `where` clause *again* against the new row. In the default isolation level, that re-check is what stops the second debit. This, and everything else about two sessions at once, needs a PostgreSQL that accepts two connections, so the next section sets one up.

REASON IT OUT

### Before writing the transfer

A transfer endpoint looks like three lines of SQL. Think through these before writing it:

- What happens if the second write (the credit) fails after the first (the debit) succeeded?
- Can two requests for the same account arrive at the same moment? From the same user? From a retry?
- Which value is the balance check based on: the one in the database now, or one read a few milliseconds ago?
- If two transfers lock Ada's and Tunde's rows in opposite orders, what can happen?
- When the database refuses a transaction with a serialization error, may you simply run it again? What if the client already got a timeout and retried too?
- How would you prove, after a busy day, that no money was created or destroyed?

**Show the reasoning**

- Both writes belong in one transaction (or one statement), so a failure undoes the debit.
- Yes to all three. Concurrency is the normal case, not an edge case, and the same user double-tapping "Send" is the most common source.
- It must be based on the current row: a conditional update, a locked row (`for update`), or a version check that fails if the row changed.
- A deadlock: each waits for the other. PostgreSQL detects it and aborts one; the fix is to lock rows in a fixed order, such as by id.
- Rerunning the whole transaction is correct, because the failed attempt changed nothing. A retry by the *client* is different: the first attempt may have succeeded, so the request needs an idempotency key ([API idempotency](https://zudojs.oyinlola.site/learn/api-idempotency)).
- With invariants: the sum of all balances never changes, no balance is negative, and every balance equals its opening balance plus incoming minus outgoing transfers. A test and a nightly query can check all three.

## Two sessions: why this lesson needs a real server

PGlite has exactly one connection. Every statement runs on it in turn, so it can show an interleaving of single statements, as above, but never two transactions running side by side. Try it: two transactions started at the same moment run one after the other:

pglite-serial.jsNode.js only

```ts
import { naira, openWallet } from "./wallet.js";

const db = await openWallet();
const log = [];

async function debit(name, amount) {
  try {
    await db.transaction(async (tx) => {
      log.push(`${name} begins`);
      const { rows } = await tx.query("select balance_kobo from accounts where id = 1");
      log.push(`${name} reads ${naira(rows[0].balance_kobo)}`);
      await tx.query("update accounts set balance_kobo = balance_kobo - $1 where id = 1", [amount]);
      log.push(`${name} commits`);
    });
  } catch (error) {
    log.push(`${name} fails: ${error.message}`);
  }
}

await Promise.all([debit("A", 3000000), debit("B", 4000000)]);
console.log(log.join("\n"));
await db.close();
```

Output of `node pglite-serial.js`

```ts
A begins
A reads ₦50,000
A commits
B begins
B reads ₦20,000
B fails: new row for relation "accounts" violates check constraint "accounts_balance_kobo_check"
```

B did not begin until A had committed, and then the `check` constraint refused the negative balance. That is correct, but only because nothing ran in parallel. Isolation levels, row locks and deadlocks only exist with several connections, so the rest of this section and the next two run against a real PostgreSQL in Docker (see [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics#install) to install Docker). The outputs shown are from real runs; lines about timing and process numbers will differ on yours.

A PostgreSQL for this lesson

```bash
$ export DB_PASSWORD=$(node -p "require('node:crypto').randomBytes(16).toString('hex')")
$ docker run --name wallet-db -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=wallet -p 5441:5432 -d postgres:17-alpine
73e874dbec7383280bc51cafa4642d8491bc98fc7ad4db242ed34e3a5de07916
$ export DATABASE_URL="postgres://postgres:$DB_PASSWORD@localhost:5441/wallet"
$ npm install pg

added 14 packages, and audited 15 packages in 2s

found 0 vulnerabilities
```

Every script imports this module. `sessions()` takes two separate connections from a `pg` pool: session A and session B, like two requests handled by two servers. Remember from [Joins, grouping and transactions](https://zudojs.oyinlola.site/learn/sql-advanced#transactions) that a transaction lives on one connection, so each session runs its `begin` … `commit` on its own client:

wallet-db.js

```ts
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function reset() {
  await pool.query(`
    drop table if exists transfers, accounts;
    create table accounts (
      id integer primary key,
      owner text not null,
      balance_kobo bigint not null check (balance_kobo >= 0),
      version integer not null default 1
    );
    create table transfers (
      id integer generated always as identity primary key,
      from_id integer not null references accounts (id),
      to_id integer not null references accounts (id),
      amount_kobo bigint not null check (amount_kobo > 0)
    );
    insert into accounts (id, owner, balance_kobo) values
      (1, 'Ada', 5000000), (2, 'Tunde', 1000000), (3, 'Chioma', 0);
  `);
}

/* Two sessions: two separate connections from the pool, like two requests on two servers. */
export async function sessions() {
  return [await pool.connect(), await pool.connect()];
}

export const naira = (kobo) => `${Number(kobo) < 0 ? "-" : ""}₦${(Math.abs(Number(kobo)) / 100).toLocaleString("en-NG")}`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

First, the re-check that made the one-statement transfer safe. Session A debits ₦30,000 and has not committed; session B tries to debit ₦40,000 from the same row:

conditional.js

```ts
import { naira, pool, reset, sessions, sleep } from "./wallet-db.js";

const DEBIT = `update accounts set balance_kobo = balance_kobo - $1
               where id = 1 and balance_kobo >= $1 returning balance_kobo`;

await reset();
const [a, b] = await sessions();
await a.query("begin");
await b.query("begin");

const debitA = await a.query(DEBIT, [3000000]);
console.log(`A debited ₦30,000, Ada now ${naira(debitA.rows[0].balance_kobo)} (not committed yet)`);

const debitB = b.query(DEBIT, [4000000]);
await sleep(300);
console.log("B's debit of ₦40,000 is waiting for A's row lock");
await a.query("commit");
console.log("A committed");

const resultB = await debitB;
console.log(`B's debit changed ${resultB.rowCount} rows: the where clause was checked again against A's new balance`);
await b.query("rollback");
console.log("Ada's balance:", naira((await pool.query("select balance_kobo from accounts where id = 1")).rows[0].balance_kobo));
a.release();
b.release();
await pool.end();
```

Terminal on your computer

```bash
$ node conditional.js
A debited ₦30,000, Ada now ₦20,000 (not committed yet)
B's debit of ₦40,000 is waiting for A's row lock
A committed
B's debit changed 0 rows: the where clause was checked again against A's new balance
Ada's balance: ₦20,000
```

An `update` takes a **row lock** on each row it changes, held until the transaction ends. B's update needed the same row, so it waited. When A committed, B did not blindly apply its change to the old ₦50,000 it would have seen before: PostgreSQL re-read the row, found ₦20,000, re-evaluated `balance_kobo >= 4000000`, and changed nothing.

## Isolation levels and the anomalies they allow

Every transaction sees the database through a **snapshot**: the set of committed changes it is allowed to see. PostgreSQL keeps old versions of rows around (this is **MVCC**, multi-version concurrency control) so readers never wait for writers and writers never wait for readers. The **isolation level** decides when the snapshot is taken and what extra checks run at commit:

| Level | Snapshot | Stops | Still allows |
| --- | --- | --- | --- |
| Read committed (the default) | New snapshot for every statement | Dirty reads | Non-repeatable reads, phantoms, lost updates in read-modify-write code, write skew |
| Repeatable read | One snapshot for the whole transaction | Also non-repeatable reads, phantoms and lost updates (by failing with an error) | Write skew |
| Serializable | One snapshot, plus tracking of read/write dependencies | Everything: the result equals some one-at-a-time order | Nothing, but it fails transactions it cannot order |

A **dirty read** (seeing another transaction's uncommitted change) never happens in PostgreSQL: you can ask for `read uncommitted`, and you get read committed. Each of the other anomalies is shown below with a real run.

### Non-repeatable read

A transaction reads Ada's balance twice. Between the reads, another session debits ₦30,000 and commits:

nonrepeatable.js

```ts
import { naira, pool, reset, sessions } from "./wallet-db.js";

await reset();
for (const level of ["read committed", "repeatable read"]) {
  await pool.query("update accounts set balance_kobo = 5000000 where id = 1");
  const [a, b] = await sessions();
  const balance = async () => naira((await a.query("select balance_kobo from accounts where id = 1")).rows[0].balance_kobo);

  await a.query(`begin isolation level ${level}`);
  const first = await balance();
  await b.query("update accounts set balance_kobo = balance_kobo - 3000000 where id = 1");
  const second = await balance();
  await a.query("commit");
  console.log(`${level.padEnd(15)} first read ${first}, second read ${second}`);
  a.release();
  b.release();
}
await pool.end();
```

Terminal on your computer

```bash
$ node nonrepeatable.js
read committed  first read ₦50,000, second read ₦20,000
repeatable read first read ₦50,000, second read ₦50,000
```

In read committed, each statement takes a fresh snapshot, so the second read saw B's commit: the same question got two answers inside one transaction, a **non-repeatable read**. A statement for Ada that shows her balance at the top and a sum of her transfers at the bottom could disagree with itself. Repeatable read keeps the first snapshot for the whole transaction.

### Phantom read

A **phantom** is the same thing for a set of rows: a query with a condition returns a different set of rows the second time, because another transaction inserted (or deleted) matching rows. Count the transfers of ₦10,000 or more twice while B inserts one:

phantom.js

```ts
import { pool, reset, sessions } from "./wallet-db.js";

await reset();
for (const level of ["read committed", "repeatable read"]) {
  await pool.query("delete from transfers");
  await pool.query("insert into transfers (from_id, to_id, amount_kobo) values (1, 2, 2000000), (2, 3, 500000)");
  const [a, b] = await sessions();
  const bigTransfers = async () =>
    (await a.query("select count(*)::int as n from transfers where amount_kobo >= 1000000")).rows[0].n;

  await a.query(`begin isolation level ${level}`);
  const first = await bigTransfers();
  await b.query("insert into transfers (from_id, to_id, amount_kobo) values (1, 3, 1500000)");
  const second = await bigTransfers();
  await a.query("commit");
  console.log(`${level.padEnd(15)} big transfers: first count ${first}, second count ${second}`);
  a.release();
  b.release();
}
await pool.end();
```

Terminal on your computer

```bash
$ node phantom.js
read committed  big transfers: first count 1, second count 2
repeatable read big transfers: first count 1, second count 1
```

A daily report that counts transfers and then sums them in two statements needs repeatable read, or its two numbers can describe two different moments.

### Lost update, and how repeatable read refuses it

Now the problem from the start of the lesson, with two real transactions. Both read Ada's balance into JavaScript, then write back "what I read minus my amount":

lost-update.js

```ts
import { naira, pool, reset, sessions } from "./wallet-db.js";

/* Both sessions read Ada's balance, then each writes back "what I read minus my transfer". */
for (const level of ["read committed", "repeatable read"]) {
  await reset();
  const [a, b] = await sessions();
  await a.query(`begin isolation level ${level}`);
  await b.query(`begin isolation level ${level}`);

  const readA = Number((await a.query("select balance_kobo from accounts where id = 1")).rows[0].balance_kobo);
  const readB = Number((await b.query("select balance_kobo from accounts where id = 1")).rows[0].balance_kobo);

  await a.query("update accounts set balance_kobo = $1 where id = 1", [readA - 3000000]);
  await a.query("update accounts set balance_kobo = balance_kobo + 3000000 where id = 2");
  const bWrite = b.query("update accounts set balance_kobo = $1 where id = 1", [readB - 1000000]);
  await a.query("commit");
  try {
    await bWrite;
    await b.query("update accounts set balance_kobo = balance_kobo + 1000000 where id = 3");
    await b.query("commit");
  } catch (error) {
    console.log(`${level}: session B failed with ${error.code}: ${error.message}`);
    await b.query("rollback");
  }
  const { rows } = await pool.query("select owner, balance_kobo from accounts order by id");
  const total = rows.reduce((sum, r) => sum + Number(r.balance_kobo), 0);
  console.log(`${level}: ${rows.map((r) => `${r.owner} ${naira(r.balance_kobo)}`).join(", ")}; total ${naira(total)}`);
  a.release();
  b.release();
}
await pool.end();
```

Terminal on your computer

```bash
$ node lost-update.js
read committed: Ada ₦40,000, Tunde ₦40,000, Chioma ₦10,000; total ₦90,000
repeatable read: session B failed with 40001: could not serialize access due to concurrent update
repeatable read: Ada ₦20,000, Tunde ₦40,000, Chioma ₦0; total ₦60,000
```

In read committed, B waited for A's row lock, then overwrote A's result with a value computed from its stale read: ₦30,000 appeared from nowhere, even though both sessions used transactions. The re-check you saw earlier cannot help, because B's `update … set balance_kobo = $1` has no condition to re-check; the stale value is baked into the parameter.

In repeatable read, PostgreSQL noticed that B was about to change a row that had changed since B's snapshot, and refused with SQLSTATE `40001`, a **serialization failure**. B's transaction is dead and must be retried from the start, where it will read the new balance. Correctness now depends on your code retrying, which the [retry](#retry) section builds.

### Write skew, and serializable

Ada and Tunde share a family budget. Each wallet may go negative, as long as the family total stays at or above zero. Ada withdraws ₦40,000 from hers and Tunde ₦40,000 from his, at the same time. Each transaction checks the total, then updates *its own* row:

write-skew.js

```ts
import { naira, pool, sessions } from "./wallet-db.js";

/* Family rule: wallets may go negative, but the family's total must stay >= 0. */
async function withdraw(client, member, amount) {
  const { rows } = await client.query("select sum(balance_kobo)::bigint as total from family_wallets");
  if (Number(rows[0].total) < amount) throw new Error("family total too low");
  await client.query("update family_wallets set balance_kobo = balance_kobo - $1 where member = $2", [amount, member]);
}

for (const level of ["repeatable read", "serializable"]) {
  await pool.query(`
    drop table if exists family_wallets;
    create table family_wallets (member text primary key, balance_kobo bigint not null);
    insert into family_wallets values ('Ada', 3000000), ('Tunde', 2000000);`);
  const [a, b] = await sessions();
  await a.query(`begin isolation level ${level}`);
  await b.query(`begin isolation level ${level}`);
  await withdraw(a, "Ada", 4000000);
  await withdraw(b, "Tunde", 4000000);
  for (const [name, client] of [["A", a], ["B", b]]) {
    try {
      await client.query("commit");
      console.log(`${level}: ${name} committed`);
    } catch (error) {
      console.log(`${level}: ${name} failed with ${error.code}: ${error.message}`);
    }
  }
  const { rows } = await pool.query("select sum(balance_kobo)::bigint as total from family_wallets");
  console.log(`${level}: family total ${naira(rows[0].total)}`);
  a.release();
  b.release();
}
await pool.end();
```

Terminal on your computer

```bash
$ node write-skew.js
repeatable read: A committed
repeatable read: B committed
repeatable read: family total -₦30,000
serializable: A committed
serializable: B failed with 40001: could not serialize access due to read/write dependencies among transactions
serializable: family total ₦10,000
```

In repeatable read both committed: they changed *different* rows, so no row conflict was detected, but each decided based on data the other then changed. That is **write skew**, and the family is ₦30,000 in debt. Serializable tracks what each transaction read, noticed that the two cannot be put in any one-at-a-time order that gives this result, and failed one of them, again with `40001`.

### Choosing a level

- **Read committed** (the default) is right for most code, *provided* writes are relative (`balance_kobo - $1`) and conditional, or protected by row locks. Never do read-modify-write in JavaScript at this level.
- **Repeatable read** for read-only work that must see one consistent moment: reports, exports, backups (`pg_dump` uses it).
- **Serializable** when correctness depends on rules spanning several rows that no single constraint can express, like the family total. Every serializable transaction must be retried on `40001`.

## Row locks: SELECT … FOR UPDATE

Sometimes the decision cannot be squeezed into one `where` clause: the transfer must check a daily limit, look up a fee, and write an audit row. Then lock the rows first, and decide while holding the lock. `select … for update` reads rows and takes the same row lock an `update` would, so any other transaction that wants to change or lock them waits until you commit or roll back. Waiting to be sure, instead of hoping nobody interferes, is called **pessimistic** concurrency control:

for-update.js

```ts
import { naira, pool, reset, sessions, sleep } from "./wallet-db.js";

await reset();
const [a, b] = await sessions();
const log = (message) => console.log(message);

await a.query("begin");
const seenA = (await a.query("select balance_kobo from accounts where id = 1 for update")).rows[0].balance_kobo;
log(`A locked Ada's row and sees ${naira(seenA)}`);

await b.query("begin");
const lockB = b.query("select balance_kobo from accounts where id = 1 for update").then((r) => {
  log(`B got the lock and sees ${naira(r.rows[0].balance_kobo)}`);
  return r;
});
await sleep(500);
log("A is still working; B is waiting for the lock");

await a.query("update accounts set balance_kobo = balance_kobo - 3000000 where id = 1");
await a.query("update accounts set balance_kobo = balance_kobo + 3000000 where id = 2");
await a.query("commit");
log("A committed its ₦30,000 transfer");

await lockB;
await b.query("commit");
a.release();
b.release();
await pool.end();
```

Terminal on your computer

```bash
$ node for-update.js
A locked Ada's row and sees ₦50,000
A is still working; B is waiting for the lock
A committed its ₦30,000 transfer
B got the lock and sees ₦20,000
```

B's `select … for update` blocked until A committed, then returned the *new* balance. So every check B makes after taking the lock is based on current data, however long it takes. Plain `select`s by other sessions are never blocked; they read the last committed version.

Variants worth knowing:

- `for update nowait` fails immediately with `55P03` instead of waiting: useful when "someone else is already processing this" should be an error.
- `for update skip locked` skips rows another transaction has locked. That turns a table into a safe job queue: many workers each take a different job, without ever taking the same one twice.
- `for no key update` is a weaker lock that does not block inserts of rows referencing this one through a foreign key. PostgreSQL's own `update`s take it when no key column changes.

skip-locked.js

```ts
import { pool } from "./wallet-db.js";

await pool.query(`
  drop table if exists payout_jobs;
  create table payout_jobs (id integer primary key, status text not null default 'queued');
  insert into payout_jobs (id) select generate_series(1, 6);`);

async function worker(name) {
  const client = await pool.connect();
  const taken = [];
  for (;;) {
    await client.query("begin");
    const { rows } = await client.query(
      "select id from payout_jobs where status = 'queued' order by id limit 1 for update skip locked");
    if (rows.length === 0) {
      await client.query("rollback");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.query("update payout_jobs set status = 'done' where id = $1", [rows[0].id]);
    await client.query("commit");
    taken.push(rows[0].id);
  }
  client.release();
  console.log(`${name} processed jobs ${taken.join(", ")}`);
}

await Promise.all([worker("worker 1"), worker("worker 2")]);
await pool.end();
```

Terminal on your computer

```bash
$ node skip-locked.js
worker 2 processed jobs 2, 4, 6
worker 1 processed jobs 1, 3, 5
```

While worker 1 held job 1, worker 2's query skipped it and took job 2, and so on. No job ran twice, and no worker waited. [Queues and background jobs](https://zudojs.oyinlola.site/learn/backend-queues) explains why real queues also need retries and idempotent jobs.

## Deadlocks, and locking in order

Ada sends Tunde ₦10,000 while Tunde sends Ada ₦5,000. Transfer A locks Ada's row (the debit), then wants Tunde's. Transfer B locks Tunde's row, then wants Ada's. Each waits for a lock the other holds, forever. That is a **deadlock**:

deadlock.js

```ts
import { pool, reset, sessions, sleep } from "./wallet-db.js";

async function transfer(client, name, fromId, toId, amount) {
  try {
    await client.query("begin");
    await client.query("update accounts set balance_kobo = balance_kobo - $1 where id = $2", [amount, fromId]);
    await sleep(200);
    await client.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]);
    await client.query("commit");
    console.log(`${name}: committed`);
  } catch (error) {
    await client.query("rollback");
    console.log(`${name}: ${error.code} ${error.message}`);
    console.log(error.detail);
  }
}

await reset();
const [a, b] = await sessions();
await Promise.all([
  transfer(a, "A (Ada -> Tunde)", 1, 2, 1000000),
  transfer(b, "B (Tunde -> Ada)", 2, 1, 500000),
]);
a.release();
b.release();
await pool.end();
```

Terminal on your computer

```bash
$ node deadlock.js
A (Ada -> Tunde): 40P01 deadlock detected
Process 80 waits for ShareLock on transaction 784; blocked by process 81.
Process 81 waits for ShareLock on transaction 783; blocked by process 80.
B (Tunde -> Ada): committed
```

PostgreSQL checks for cycles of waiting transactions after a short wait (`deadlock_timeout`, one second by default), and aborts one of them with `40P01` so the other can continue. Which one is chosen is not guaranteed; here it was A. The `sleep(200)` only makes the timing reliable for the demo; in production, the same thing happens by chance, under load, at the worst moment.

The cure is to make a cycle impossible: every transaction takes its locks in the *same* order. For a transfer, lock both rows up front, lowest id first, whatever the direction:

deadlock-fixed.js

```ts
import { pool, reset, sessions, sleep } from "./wallet-db.js";

async function transfer(client, name, fromId, toId, amount) {
  await client.query("begin");
  /* Lock both rows first, always lowest id first, whatever the direction of the transfer. */
  await client.query("select id from accounts where id = any($1) order by id for update", [[fromId, toId]]);
  await sleep(200);
  await client.query("update accounts set balance_kobo = balance_kobo - $1 where id = $2", [amount, fromId]);
  await client.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]);
  await client.query("commit");
  console.log(`${name}: committed`);
}

await reset();
const [a, b] = await sessions();
await Promise.all([
  transfer(a, "A (Ada -> Tunde)", 1, 2, 1000000),
  transfer(b, "B (Tunde -> Ada)", 2, 1, 500000),
]);
const { rows } = await pool.query("select owner, balance_kobo from accounts where id in (1, 2) order by id");
console.log(rows);
a.release();
b.release();
await pool.end();
```

Terminal on your computer

```bash
$ node deadlock-fixed.js
A (Ada -> Tunde): committed
B (Tunde -> Ada): committed
[
  { owner: 'Ada', balance_kobo: '4500000' },
  { owner: 'Tunde', balance_kobo: '1500000' }
]
```

Both transfers wanted Ada's row (id 1) first. Whoever got it went ahead; the other waited at its first lock while holding nothing, so no cycle could form. (The balances arrive as strings: `pg` returns `bigint` columns as text, because they can exceed JavaScript's safe integers. [Typing database code](https://zudojs.oyinlola.site/learn/db-typescript) deals with that.)

Rules that keep deadlocks rare: lock in a consistent order (by primary key); lock everything you need at the start of the transaction; keep transactions short; and treat `40P01` like `40001`, as a signal to retry the whole transaction.

## Optimistic concurrency with a version column

Locks make others wait. That is fine for a transfer that takes milliseconds, but not for an edit that takes minutes: a support agent opens Ada's wallet settings, goes for lunch, and comes back to save a new daily limit. You cannot hold a database lock across that, and the agent's screen may be stale by the time they press Save.

**Optimistic** concurrency control assumes conflicts are rare and *detects* them instead of preventing them. Each row has a `version` number. You read it with the data; when you write, you require that it has not changed, and you increase it:

```ts
update accounts set daily_limit_kobo = $1, version = version + 1
where id = $2 and version = $3
```

If someone else saved in between, the version no longer matches, no row is updated, and the application knows the edit is based on stale data:

optimistic.jsNode.js only

```ts
import { openWallet } from "./wallet.js";

const db = await openWallet();
await db.exec("alter table accounts add column daily_limit_kobo bigint not null default 10000000");

async function load(id) {
  const { rows } = await db.query("select daily_limit_kobo, version from accounts where id = $1", [id]);
  return rows[0];
}

async function saveLimit(id, limit, expectedVersion) {
  const { rows } = await db.query(
    `update accounts set daily_limit_kobo = $1, version = version + 1
     where id = $2 and version = $3 returning version`,
    [limit, id, expectedVersion],
  );
  return rows.length === 1 ? `saved, now version ${rows[0].version}` : "conflict: someone changed it first";
}

const agentScreen = await load(1);
const adaScreen = await load(1);
console.log("both loaded version", agentScreen.version, adaScreen.version);

console.log("Ada saves ₦50,000:   ", await saveLimit(1, 5000000, adaScreen.version));
console.log("agent saves ₦200,000:", await saveLimit(1, 20000000, agentScreen.version));

const fresh = await load(1);
console.log("agent reloads:", fresh);
await db.close();
```

Output of `node optimistic.js`

```ts
both loaded version 1 1
Ada saves ₦50,000:    saved, now version 2
agent saves ₦200,000: conflict: someone changed it first
agent reloads: { daily_limit_kobo: 5000000, version: 2 }
```

The agent's save did not overwrite Ada's change. Their application must now show the current value and let them decide, or, for automated code, reload and retry. Over HTTP, this is the `ETag` and `If-Match` pattern: the server sends the version as an ETag, the client sends it back in `If-Match`, and a mismatch is answered with **412 Precondition Failed** (or 409).

|  | Pessimistic (`for update`) | Optimistic (version column) |
| --- | --- | --- |
| Conflicts | Prevented: others wait | Detected at write: the loser retries or asks the user |
| Best for | Short transactions with frequent contention (a popular wallet, stock of a hot product) | Long edits, rare conflicts, data read in one request and written in another |
| Costs | Waiting, deadlock risk, locks held across slow code | Wasted work and retries when conflicts are common |

## When a transaction goes wrong

### An error poisons the rest of the transaction

In PostgreSQL, once a statement inside a transaction fails, every later statement is refused until you roll back. Code that catches an error inside a transaction and carries on is a common bug:

aborted.jsNode.js only

```ts
import { openWallet } from "./wallet.js";

const db = await openWallet();
try {
  await db.transaction(async (tx) => {
    try {
      await tx.query("update accounts set balance_kobo = balance_kobo - 9000000 where id = 1");
    } catch (error) {
      console.log("debit failed:", error.code, "- carrying on to log the attempt");
    }
    await tx.query("insert into transfers (from_id, to_id, amount_kobo) values (1, 2, 9000000)");
  });
} catch (error) {
  console.log("then:", error.code, error.message);
}
await db.close();
```

Output of `node aborted.js`

```ts
debit failed: 23514 - carrying on to log the attempt
then: 25P02 current transaction is aborted, commands ignored until end of transaction block
```

`25P02` means "in failed SQL transaction". If a step may fail and the transaction should continue, mark a **savepoint** before it and roll back to that point on failure; everything before the savepoint survives:

savepoint.jsNode.js only

```ts
import { balances, openWallet } from "./wallet.js";

const db = await openWallet();
await db.exec("create table failed_attempts (account_id integer not null, amount_kobo bigint not null)");

await db.transaction(async (tx) => {
  await tx.query("update accounts set balance_kobo = balance_kobo + 100000 where id = 3"); // welcome bonus
  await tx.query("savepoint before_debit");
  try {
    await tx.query("update accounts set balance_kobo = balance_kobo - 9000000 where id = 1");
  } catch (error) {
    await tx.query("rollback to savepoint before_debit");
    await tx.query("insert into failed_attempts values (1, 9000000)");
  }
});
console.log(await balances(db));
console.log((await db.query("select * from failed_attempts")).rows);
await db.close();
```

Output of `node savepoint.js`

```ts
Ada ₦50,000, Tunde ₦10,000, Chioma ₦1,000; total ₦61,000
[ { account_id: 1, amount_kobo: 9000000 } ]
```

The ₦1,000 welcome bonus credited to Chioma before the savepoint was kept, the failed debit was undone, and the failure was recorded, all in one committed transaction. Savepoints cost a little on every use, so use them where a failure is expected, not around every statement.

### Retrying serialization failures and deadlocks

`40001` (serialization failure) and `40P01` (deadlock) mean "this transaction lost a race; nothing it did was kept; run it again". Every other error means the transaction itself is wrong, and retrying will not help. A retry helper runs the *whole* transaction function again, with a short, growing, randomised pause (**backoff with jitter**, so the losers do not collide again at the same instant), and gives up after a few attempts. Here it is with a fake database call, so you can watch it decide:

retry.js

```ts
const RETRYABLE = new Set(["40001", "40P01"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(work, { attempts = 5, baseMs = 20 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work(attempt);
    } catch (error) {
      if (!RETRYABLE.has(error.code) || attempt >= attempts) throw error;
      const pause = baseMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      console.log(`attempt ${attempt} failed with ${error.code}, retrying`);
      await sleep(pause);
    }
  }
}

function failWith(code) {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

const result = await withRetry(async (attempt) => {
  if (attempt < 3) throw failWith(attempt === 1 ? "40001" : "40P01");
  return "transfer committed";
});
console.log(result);

try {
  await withRetry(async () => {
    throw failWith("23514");
  });
} catch (error) {
  console.log("not retried:", error.code);
}
```

Output of `node retry.js` and of the browser terminal

```ts
attempt 1 failed with 40001, retrying
attempt 2 failed with 40P01, retrying
transfer committed
not retried: 23514
```

Three rules make retries safe. The retried function must contain the whole transaction, from `begin` to `commit`, including the reads, so the next attempt decides on fresh data. It must not have side effects outside the database (sending an SMS, calling a payment provider) that would be repeated. And a retry must never be needed to recover from a timeout at the *client*, where the first attempt may have committed; that is the job of idempotency keys.

## Testing a transfer under concurrency

A single-user test cannot find a race. A useful concurrency test fires many operations at once against a real server, then checks **invariants**, facts that must be true whatever the interleaving: the total amount of money is unchanged, and no balance is negative. This script runs the same 60 transfers between the three accounts, all at once, through the naive transfer and through a safe one that locks both rows in id order and retries on `40001` or `40P01`:

stress.js

```ts
import { naira, pool, reset } from "./wallet-db.js";

/* Naive: read both balances, check, write back computed values. Each statement autocommits. */
async function naiveTransfer(fromId, toId, amount) {
  const from = Number((await pool.query("select balance_kobo from accounts where id = $1", [fromId])).rows[0].balance_kobo);
  const to = Number((await pool.query("select balance_kobo from accounts where id = $1", [toId])).rows[0].balance_kobo);
  if (from < amount) return "refused";
  await pool.query("update accounts set balance_kobo = $1 where id = $2", [from - amount, fromId]);
  await pool.query("update accounts set balance_kobo = $1 where id = $2", [to + amount, toId]);
  return "done";
}

/* Safe: one transaction, both rows locked in id order, relative updates, retry on deadlock or serialization failure. */
async function safeTransfer(fromId, toId, amount) {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "select id, balance_kobo from accounts where id = any($1) order by id for update",
        [[fromId, toId]],
      );
      const from = rows.find((r) => r.id === fromId);
      if (Number(from.balance_kobo) < amount) {
        await client.query("rollback");
        return "refused";
      }
      await client.query("update accounts set balance_kobo = balance_kobo - $1 where id = $2", [amount, fromId]);
      await client.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]);
      await client.query("insert into transfers (from_id, to_id, amount_kobo) values ($1, $2, $3)", [fromId, toId, amount]);
      await client.query("commit");
      return "done";
    } catch (error) {
      await client.query("rollback");
      if (!["40P01", "40001"].includes(error.code) || attempt === 5) throw error;
    } finally {
      client.release();
    }
  }
}

/* The same 60 transfers for both versions: amounts and directions from a fixed pattern. */
const jobs = Array.from({ length: 60 }, (_, i) => ({
  fromId: 1 + (i % 3),
  toId: 1 + ((i + 1 + (i % 2)) % 3),
  amount: 100000 * (1 + (i * 7) % 20),
}));

for (const [name, transfer] of [["naive", naiveTransfer], ["safe", safeTransfer]]) {
  await reset();
  const results = await Promise.all(jobs.map((j) => transfer(j.fromId, j.toId, j.amount).catch((e) => e.code)));
  const { rows } = await pool.query("select owner, balance_kobo from accounts order by id");
  const total = rows.reduce((sum, r) => sum + Number(r.balance_kobo), 0);
  const count = (v) => results.filter((r) => r === v).length;
  console.log(`${name}: ${count("done")} done, ${count("refused")} refused; ` +
    `${rows.map((r) => `${r.owner} ${naira(r.balance_kobo)}`).join(", ")}; total ${naira(total)} (must stay ₦60,000)`);
}
await pool.end();
```

Terminal on your computer

```bash
$ node stress.js
naive: 30 done, 30 refused; Ada ₦58,000, Tunde ₦23,000, Chioma ₦7,000; total ₦88,000 (must stay ₦60,000)
safe: 38 done, 22 refused; Ada ₦17,000, Tunde ₦43,000, Chioma ₦0; total ₦60,000 (must stay ₦60,000)
$ node stress.js
naive: 30 done, 30 refused; Ada ₦60,000, Tunde ₦11,000, Chioma ₦16,000; total ₦87,000 (must stay ₦60,000)
safe: 40 done, 20 refused; Ada ₦12,000, Tunde ₦33,000, Chioma ₦15,000; total ₦60,000 (must stay ₦60,000)
```

Each run interleaves differently, so the individual balances and counts change; that is the nature of concurrency. The naive version creates money on every run. The safe version keeps the total at ₦60,000 every time, which is the only line that must never change. Put a test like this in your integration suite, against the same PostgreSQL version as production ([Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) shows how to start one per test run).

The ledger gives a second, stronger invariant that you can check at any time, even in PGlite: every balance must equal its opening balance plus incoming minus outgoing transfers. Here it is after a run of the one-statement transfer:

ledger-check.jsNode.js only

```ts
import { openWallet } from "./wallet.js";

const db = await openWallet();
const opening = new Map((await db.query("select id, balance_kobo from accounts")).rows.map((r) => [r.id, Number(r.balance_kobo)]));

const TRANSFER = `
  with debit as (
    update accounts set balance_kobo = balance_kobo - $3 where id = $1 and balance_kobo >= $3 returning id
  ), credit as (
    update accounts set balance_kobo = balance_kobo + $3 where id = $2 and exists (select 1 from debit) returning id
  )
  insert into transfers (from_id, to_id, amount_kobo) select $1, $2, $3 from debit, credit returning id`;
const moves = [[1, 2, 3000000], [1, 3, 4000000], [2, 3, 2500000], [3, 1, 500000], [2, 1, 9900000]];
await Promise.all(moves.map((m) => db.query(TRANSFER, m)));

const { rows } = await db.query(`
  select a.id, a.balance_kobo,
         coalesce((select sum(amount_kobo) from transfers where to_id = a.id), 0) as incoming,
         coalesce((select sum(amount_kobo) from transfers where from_id = a.id), 0) as outgoing
  from accounts a order by a.id`);
for (const r of rows) {
  const expected = opening.get(r.id) + Number(r.incoming) - Number(r.outgoing);
  console.log(`account ${r.id}: ${Number(r.balance_kobo) === expected ? "consistent" : "BROKEN"}`);
}
console.log("transfers recorded:", (await db.query("select count(*)::int as n from transfers")).rows[0].n);
await db.close();
```

Output of `node ledger-check.js`

```ts
account 1: consistent
account 2: consistent
account 3: consistent
transfers recorded: 3
```

Three of the five transfers went through and two were refused, and every balance agrees with the ledger. In production, run this reconciliation query every night; a single "BROKEN" line means a code path changed a balance without recording a transfer.

## In production

- **Keep transactions short.** Never call an HTTP API, send an email or wait for user input inside a transaction. Every lock you hold makes others wait, and the connection is unavailable to the rest of the app for the whole time ([Operating databases](https://zudojs.oyinlola.site/learn/db-operations) covers pools).
- **Set timeouts.** `lock_timeout` (give up waiting for a lock), `statement_timeout` (give up on a slow statement) and `idle_in_transaction_session_timeout` (kill sessions that opened a transaction and forgot it) turn silent hangs into errors you can see and handle.
- **Long transactions hurt everyone.** While a transaction is open, PostgreSQL cannot clean up row versions it might still need to see, so tables and indexes bloat. Watch `pg_stat_activity` for sessions that have been `idle in transaction` for minutes.
- **Money lives in a ledger.** Real payment systems never just update balances; they append immutable entries (double-entry bookkeeping) and derive or check balances from them, exactly like the reconciliation above.
- **Frameworks help, but the rules stay the same.** ZudoJS runs a function inside a transaction on one pooled connection for you, with nesting and hooks: see [the ZudoJS transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions). You still choose the isolation level, lock order and retry policy.

## Practice

TRY IT YOURSELF

### The last bag of rice

The shop has 1 bag of rice left. Three customers try to reserve 1 bag each at the same moment. Write `reserve(productId, quantity)` as one conditional update on an `inventory (product_id, on_hand, reserved)` table that succeeds only while `reserved + quantity <= on_hand`, run the three calls concurrently, and show that exactly one succeeds.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The `where` clause is the whole safety net: it must recheck the limit (`reserved + $2 <= on_hand`) as part of the same statement that changes `reserved`, so no other update can sneak in between the check and the write.

HINT 2

`const { rows } = await db.query("update inventory set reserved = reserved + $2 where product_id = $1 and reserved + $2 <= on_hand returning reserved", [productId, quantity]); return \`${customer}: ${rows.length === 1 ? "reserved" : "sold out"}\`;`

SOLUTION

last-bag.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table inventory (
    product_id integer primary key,
    on_hand integer not null check (on_hand >= 0),
    reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand)
  );
  insert into inventory values (1, 1, 0);
`);

async function reserve(customer, productId, quantity) {
  const { rows } = await db.query(
    `update inventory set reserved = reserved + $2
     where product_id = $1 and reserved + $2 <= on_hand
     returning reserved`,
    [productId, quantity],
  );
  return `${customer}: ${rows.length === 1 ? "reserved" : "sold out"}`;
}

console.log(await Promise.all([reserve("Ada", 1, 1), reserve("Tunde", 1, 1), reserve("Chioma", 1, 1)]));
console.log((await db.query("select on_hand, reserved from inventory")).rows[0]);
await db.close();
```

Output of `node last-bag.js`

```json
[ 'Ada: reserved', 'Tunde: sold out', 'Chioma: sold out' ]
{ on_hand: 1, reserved: 1 }
```

On a real server the three updates would queue on the row lock, and each would re-check `reserved + $2 <= on_hand` after the one before it committed. The `check` constraint is a second safety net: even a buggy update could not reserve more than is on the shelf.

TRY IT YOURSELF

### A transfer with a version check

Write `transferOptimistic(fromId, toId, amount)` for the wallet: read the sender's balance and version, refuse if the balance is too low, then debit with `where id = $1 and version = $2` (increasing the version) and credit, all in one transaction. If the debit matched no row, retry from the read, at most 3 times. Show it with two concurrent transfers from Ada that together exceed her balance.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The version you compare against in the debit's `where` clause must be the one you just read in *this* attempt — that mismatch, when someone else updated it first, is exactly what `affectedRows === 0` detects.

HINT 2

`const debit = await tx.query("update accounts set balance_kobo = balance_kobo - $1, version = version + 1 where id = $2 and version = $3", [amount, fromId, rows[0].version]); if (debit.affectedRows === 0) return false; await tx.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]); return true;`

SOLUTION

transfer-optimistic.jsNode.js only

```ts
import { balances, openWallet } from "./wallet.js";

const db = await openWallet();

async function transferOptimistic(fromId, toId, amount) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { rows } = await db.query("select balance_kobo, version from accounts where id = $1", [fromId]);
    if (Number(rows[0].balance_kobo) < amount) return `refused on attempt ${attempt}`;
    const committed = await db.transaction(async (tx) => {
      const debit = await tx.query(
        "update accounts set balance_kobo = balance_kobo - $1, version = version + 1 where id = $2 and version = $3",
        [amount, fromId, rows[0].version],
      );
      if (debit.affectedRows === 0) return false;
      await tx.query("update accounts set balance_kobo = balance_kobo + $1 where id = $2", [amount, toId]);
      return true;
    });
    if (committed) return `done on attempt ${attempt}`;
  }
  return "gave up after 3 conflicts";
}

console.log(await Promise.all([transferOptimistic(1, 2, 3000000), transferOptimistic(1, 3, 4000000)]));
console.log(await balances(db));
await db.close();
```

Output of `node transfer-optimistic.js`

```json
[ 'done on attempt 1', 'refused on attempt 2' ]
Ada ₦20,000, Tunde ₦40,000, Chioma ₦0; total ₦60,000
```

Both calls read version 1. The first debit matched and moved the version to 2; the second debit matched nothing, so that transfer re-read the balance, now ₦20,000, and refused. Note that the transaction returns `false` instead of throwing: nothing was changed, so committing the empty transaction is harmless.

TRY IT YOURSELF

### Pick the technique

Which approach fits each case: (a) decrementing stock when an order is placed; (b) an admin editing a product description in a form for ten minutes; (c) a monthly statement that sums a customer's transfers and shows their balance; (d) a rule "a doctor can go off call only if another doctor stays on call"; (e) many workers sending queued SMS messages?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask, for each case: does anything need to hold a lock for as long as a human is thinking? Does the check span more than one row? Do several workers need to split up a queue without colliding?

HINT 2

(a) is a single-row conditional update. (b) cannot hold a row lock for ten minutes, so it needs a version check instead. (c) needs one consistent snapshot across two reads. (d) checks a rule across *other* rows, which read committed cannot protect on its own. (e) is a job queue, where each worker must skip rows others already grabbed.

SOLUTION

(a) An atomic conditional update (`set on_hand = on_hand - $1 where … and on_hand >= $1`), in read committed. (b) Optimistic concurrency with a version column: no lock can be held for ten minutes, and conflicts are rare. (c) A read-only transaction in repeatable read, so the sum and the balance come from the same snapshot. (d) Write skew across rows: serializable with retries (or lock all on-call rows with `for update` before checking). (e) `select … for update skip locked`, so each worker takes a different message.

## Summary

- Read-modify-write in application code loses updates under concurrency, even inside a transaction. Make writes relative and conditional (`balance - $1 … where balance >= $1`), or lock first.
- ACID: atomicity undoes partial work, consistency means constraints hold at commit, durability means committed data survives crashes, and isolation is a spectrum you choose.
- Read committed takes a snapshot per statement (non-repeatable reads, phantoms and write skew possible); repeatable read keeps one snapshot and fails lost updates with `40001`; serializable also stops write skew. PostgreSQL never allows dirty reads.
- `select … for update` locks rows so decisions are made on current data; `nowait` and `skip locked` change what waiting means. Lock rows in a fixed order to avoid deadlocks (`40P01`).
- Optimistic concurrency uses a version column to detect conflicting writes without holding locks, which suits long edits.
- After an error, a transaction refuses everything until rollback (`25P02`); savepoints recover part of it. Retry whole transactions on `40001` and `40P01`, with backoff, and test concurrency by checking invariants under load.

Next: [Operating databases](https://zudojs.oyinlola.site/learn/db-operations): connection pools, migrations that never take the shop offline, seeds, backups you have actually restored, and read replicas.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
