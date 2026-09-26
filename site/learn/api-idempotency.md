---
title: "Idempotency and safe retries — ZudoJS Academy"
description: "Build a ₦10,000 transfer endpoint that survives partial failures, lost responses, double taps and crashes, with transactions and idempotency keys."
source: https://zudojs.oyinlola.site/learn/api-idempotency
---

LEVEL 9 · LESSON 2 OF 4

APIs under real traffic Core

# Idempotency and safe retries

Build a ₦10,000 transfer endpoint that survives partial failures, lost responses, double taps and crashes, with transactions and idempotency keys.

- **55 min** to read and try
- **You need:** Pagination and versioning in depth, HTTP in depth, and the SQL lessons
- **You build:** A money-transfer API on PostgreSQL where every transfer is atomic and a retried request with the same Idempotency-Key is never applied twice

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Reason through a money transfer's preconditions and failure points before writing it
- Make a multi-step write atomic with a transaction and a conditional update
- Explain why a client cannot know whether a timed-out request succeeded
- Implement idempotency keys with a PostgreSQL store that replays, rejects mismatches and survives crashes
- Write a client that retries safely with backoff and one key per user intent
- Explain why "exactly once" is at-least-once delivery plus idempotent processing

## ₦20,000 for a ₦10,000 transfer

Ada opens her banking app on a bus, types ₦10,000, and taps **Send** to pay Bola. The request reaches your server, the server moves the money, and then the bus drives into a tunnel. The response never reaches the phone. After 30 seconds the app shows "Something went wrong. Try again?" Ada taps **Try again**. The server receives a perfectly valid transfer request and moves ₦10,000 again.

Nothing in that story is a bug in the usual sense. The server did what each request asked. The app did what a good app does after a timeout. And yet Ada lost ₦10,000, and your support team will spend an hour reversing it. Multiply that by every flaky mobile connection in the country.

This lesson builds a transfer endpoint that is safe against exactly this, and against the failures that come with it: a server that crashes halfway through, a second database write that fails after the first succeeded, and two copies of the same request arriving at the same moment. The tools are a database **transaction** (so a transfer happens completely or not at all) and an **idempotency key** (so the same transfer can be requested many times but happens once). You met the word *idempotent* in [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#methods): an operation that has the same effect whether you do it once or ten times. `POST` is not idempotent by nature. By the end of this lesson, yours will be.

## Think before you move money

REASON IT OUT

### Transfer ₦10,000 between two accounts

The request is `POST /transfers` with `{"from": 1, "to": 2, "amountKobo": 1000000}`. Before writing any code, answer each question and say what the server should do:

- Is the sender authenticated? And is the account in `from` really theirs?
- Is the sender's account active? Is the recipient's?
- Is there enough money? What if two transfers check the balance at the same moment?
- Does the recipient exist?
- The transfer is several database operations: take the money from the sender, give it to the recipient, record the transfer. What if operation #2 fails after #1 succeeded?
- Can the request be submitted twice? By whom, and how would the server know?

**Show the reasoning**

**Authenticated, and the owner.** The user id comes from the verified session or token, never from the body (the rule from [BookStore authentication](https://zudojs.oyinlola.site/learn/bookstore-auth#routes)). Then check that account `from` belongs to that user. If it does not, answer 404, not 403: a stranger should not learn which account numbers exist.

**Active accounts.** A frozen or closed sender cannot send, and a frozen or closed recipient cannot receive. These are business rules, so they get a clear 422 with a machine-readable error code.

**Enough money, atomically.** "Read the balance, compare, then write the new balance" has a gap: two transfers can both read ₦15,000, both decide ₦10,000 is fine, and both write, leaving ₦-5,000. The check and the write must be one step: `UPDATE … SET balance = balance - amount WHERE id = … AND balance >= amount`, plus a `CHECK (balance >= 0)` constraint as a safety net.

**The recipient exists.** Check it before moving anything. And beware: an `UPDATE` of an id that does not exist is not an error in SQL. It changes zero rows and succeeds.

**Operation #2 fails.** Without protection, the money has left Ada's account and arrived nowhere. All operations of one transfer must run in one **transaction**, so a failure anywhere undoes all of them.

**Twice: yes, and often.** The app retries after a timeout, the user taps twice, a load balancer retries a slow request, a queue redelivers a message. The server cannot tell a retry from a new transfer of the same amount, unless the client gives each *intent* an id that stays the same across retries. That id is the idempotency key.

The rest of the lesson turns each answer into code, in that order.

## The bank's database

Here is the database, in PGlite as in earlier lessons. Amounts are whole **kobo** (100 kobo = ₦1), never floating-point naira, as [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) explained. The `CHECK` constraints are the last line of defence: even a bug in your code cannot make a balance negative. The `idempotency_keys` table is used later in the lesson.

bank-db.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openBank() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE accounts (
      id integer PRIMARY KEY,
      owner_id integer NOT NULL,
      holder text NOT NULL,
      status text NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
      balance_kobo bigint NOT NULL CHECK (balance_kobo >= 0)
    );
    CREATE TABLE transfers (
      id serial PRIMARY KEY,
      from_account integer NOT NULL REFERENCES accounts (id),
      to_account integer NOT NULL REFERENCES accounts (id),
      amount_kobo bigint NOT NULL CHECK (amount_kobo > 0)
    );
    CREATE TABLE idempotency_keys (
      user_id integer NOT NULL,
      key text NOT NULL,
      request_hash text NOT NULL,
      status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
      lock_id text,
      locked_until timestamptz,
      response_status integer,
      response_body jsonb,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    INSERT INTO accounts VALUES
      (1, 1, 'Ada Obi', 'active', 5000000),
      (2, 2, 'Bola Ade', 'active', 500000),
      (3, 3, 'Chidi Eze', 'frozen', 2000000);
  `);
  return db;
}

export const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

export async function balances(db) {
  const { rows } = await db.query("SELECT holder, balance_kobo FROM accounts ORDER BY id");
  const { rows: [count] } = await db.query("SELECT count(*)::integer AS n FROM transfers");
  const total = rows.reduce((sum, row) => sum + row.balance_kobo, 0);
  return `${rows.map((r) => `${r.holder.split(" ")[0]} ${naira(r.balance_kobo)}`).join(", ")} | total ${naira(total)} | transfers ${count.n}`;
}
```

`balances` also prints the **total** money in the bank. A transfer moves money; it never creates or destroys it. So the total must stay ₦75,000 no matter what happens. A rule that must always hold is called an **invariant**, and it is the best thing to check in every test in this lesson.

## Partial failure

First, the transfer written the obvious way: three statements, one after another. The request has a typo in the recipient, account 99, which does not exist:

naive.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";

const db = await openBank();
console.log("before:", await balances(db));

const from = 1, to = 99, amount = 1_000_000;
try {
  await db.query("UPDATE accounts SET balance_kobo = balance_kobo - $1 WHERE id = $2", [amount, from]);
  const credit = await db.query("UPDATE accounts SET balance_kobo = balance_kobo + $1 WHERE id = $2", [amount, to]);
  console.log("credit changed", credit.affectedRows, "rows, and did not fail");
  await db.query("INSERT INTO transfers (from_account, to_account, amount_kobo) VALUES ($1, $2, $3)", [from, to, amount]);
} catch (error) {
  console.log("failed:", error.message);
}
console.log("after: ", await balances(db));
await db.close();
```

Output of `node naive.js`

```ts
before: Ada ₦50,000, Bola ₦5,000, Chidi ₦20,000 | total ₦75,000 | transfers 0
credit changed 0 rows, and did not fail
failed: insert or update on table "transfers" violates foreign key constraint "transfers_to_account_fkey"
after:  Ada ₦40,000, Bola ₦5,000, Chidi ₦20,000 | total ₦65,000 | transfers 0
```

Two lessons in one example. The credit to account 99 changed zero rows and *succeeded*: SQL does not treat "no row matched" as an error. Only the third statement failed, on the foreign key. By then, ₦10,000 had left Ada's account, and the bank's total dropped by ₦10,000. The money simply vanished.

Now the same three statements inside a **transaction**. PGlite's `db.transaction(fn)` runs `BEGIN`, calls your function with a `tx` object, and runs `COMMIT` if the function returns or `ROLLBACK` if it throws. A rollback undoes every statement in the transaction, as if none had run:

atomic.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";

const db = await openBank();
const from = 1, to = 99, amount = 1_000_000;
try {
  await db.transaction(async (tx) => {
    await tx.query("UPDATE accounts SET balance_kobo = balance_kobo - $1 WHERE id = $2", [amount, from]);
    await tx.query("UPDATE accounts SET balance_kobo = balance_kobo + $1 WHERE id = $2", [amount, to]);
    await tx.query("INSERT INTO transfers (from_account, to_account, amount_kobo) VALUES ($1, $2, $3)", [from, to, amount]);
  });
} catch (error) {
  console.log("failed:", error.message);
}
console.log("after:", await balances(db));
await db.close();
```

Output of `node atomic.js`

```ts
failed: insert or update on table "transfers" violates foreign key constraint "transfers_to_account_fkey"
after: Ada ₦50,000, Bola ₦5,000, Chidi ₦20,000 | total ₦75,000 | transfers 0
```

The same failure, and the bank is intact. This is the **A** in ACID: *atomicity*, all or nothing. [Transactions in depth](https://zudojs.oyinlola.site/learn/db-transactions) covers isolation levels and locks; for this lesson, the rule is simple: every write that belongs to one business operation goes into one transaction.

### The transfer, done properly

Now the full transfer, answering every question from the reasoning block. It takes a `tx`, so the caller decides the transaction. It checks everything it can *before* the first write, and returns business rejections as values (`{ status, body }`) instead of throwing, because a rejected transfer is a normal answer, not a crash:

transfer.js

```ts
const reject = (status, error, message) => ({ status, body: { error, message } });

export async function transfer(tx, { userId, from, to, amountKobo }) {
  if (![from, to].every(Number.isSafeInteger)) return reject(400, "invalid_account", "from and to must be account numbers");
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    return reject(400, "invalid_amount", "amountKobo must be a whole number of kobo above 0");
  }
  if (from === to) return reject(422, "same_account", "You cannot transfer to the same account");

  const { rows: [sender] } = await tx.query("SELECT owner_id, status FROM accounts WHERE id = $1 FOR UPDATE", [from]);
  if (!sender || sender.owner_id !== userId) return reject(404, "account_not_found", `Account ${from} was not found`);
  if (sender.status !== "active") return reject(422, "account_not_active", `Account ${from} is ${sender.status}`);

  const { rows: [recipient] } = await tx.query("SELECT status FROM accounts WHERE id = $1", [to]);
  if (!recipient || recipient.status !== "active") {
    return reject(422, "recipient_unavailable", `Account ${to} cannot receive transfers`);
  }

  const debit = await tx.query(
    "UPDATE accounts SET balance_kobo = balance_kobo - $1 WHERE id = $2 AND balance_kobo >= $1 RETURNING balance_kobo",
    [amountKobo, from],
  );
  if (debit.rows.length === 0) return reject(422, "insufficient_funds", "The balance is too low for this transfer");

  await tx.query("UPDATE accounts SET balance_kobo = balance_kobo + $1 WHERE id = $2", [amountKobo, to]);
  const { rows: [record] } = await tx.query(
    "INSERT INTO transfers (from_account, to_account, amount_kobo) VALUES ($1, $2, $3) RETURNING id",
    [from, to, amountKobo],
  );
  return { status: 201, body: { transferId: record.id, from, to, amountKobo, balanceKobo: debit.rows[0].balance_kobo } };
}
```

- `userId` is the authenticated user, passed in by the HTTP layer. The account is looked up and its owner compared; a stranger's account and a missing account give the same 404.
- `FOR UPDATE` locks the sender's row until the transaction ends, so two transfers from the same account take turns instead of interleaving.
- The debit is a **conditional update**: the balance check and the subtraction are one statement. If it changes no row, the money was not there, and nothing has been written yet.

Run it against every rule. Each request gets its own transaction:

rules.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";
import { transfer } from "./transfer.js";

const db = await openBank();
const requests = [
  { label: "ok", userId: 1, from: 1, to: 2, amountKobo: 1_000_000 },
  { label: "not your account", userId: 2, from: 1, to: 2, amountKobo: 100 },
  { label: "frozen sender", userId: 3, from: 3, to: 1, amountKobo: 100 },
  { label: "frozen recipient", userId: 1, from: 1, to: 3, amountKobo: 100 },
  { label: "no such recipient", userId: 1, from: 1, to: 99, amountKobo: 100 },
  { label: "too much", userId: 2, from: 2, to: 1, amountKobo: 9_000_000 },
  { label: "half a kobo", userId: 1, from: 1, to: 2, amountKobo: 10.5 },
];
for (const { label, ...request } of requests) {
  const result = await db.transaction((tx) => transfer(tx, request));
  console.log(label.padEnd(18), result.status, result.body.error ?? `transfer ${result.body.transferId}`);
}
console.log(await balances(db));
await db.close();
```

Output of `node rules.js`

```ts
ok                 201 transfer 1
not your account   404 account_not_found
frozen sender      422 account_not_active
frozen recipient   422 recipient_unavailable
no such recipient  422 recipient_unavailable
too much           422 insufficient_funds
half a kobo        400 invalid_amount
Ada ₦40,000, Bola ₦15,000, Chidi ₦20,000 | total ₦75,000 | transfers 1
```

One transfer went through, six were refused for six different reasons, and the total is still ₦75,000.

## The response that never arrives

The transfer is now correct for one request. The bus-and-tunnel problem is about *two* requests. Here it is in code: a "network" that delivers the request, lets the server finish, and then loses the response on the first attempt. The client does what every good client does, and retries:

lost-response.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";
import { transfer } from "./transfer.js";

const db = await openBank();
let deliveries = 0;

async function network(request) {
  deliveries++;
  const response = await db.transaction((tx) => transfer(tx, request));
  if (deliveries === 1) throw new Error("timed out waiting for the response");
  return response;
}

async function sendWithRetries(request) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await network(request);
      console.log(`attempt ${attempt}:`, response.status);
      return response;
    } catch (error) {
      console.log(`attempt ${attempt}:`, error.message);
    }
  }
}

await sendWithRetries({ userId: 1, from: 1, to: 2, amountKobo: 1_000_000 });
console.log(await balances(db));
await db.close();
```

Output of `node lost-response.js`

```ts
attempt 1: timed out waiting for the response
attempt 2: 201
Ada ₦30,000, Bola ₦25,000, Chidi ₦20,000 | total ₦75,000 | transfers 2
```

₦20,000 left Ada's account for one tap. Look at it from the client's side: after a timeout it **cannot know** whether the request never arrived, arrived and failed, or arrived and succeeded. All three look the same from the phone. Not retrying loses transfers that never arrived; retrying repeats transfers that did. No amount of cleverness on the client alone fixes this, because the information it needs is on the server.

```ts
 phone                          server                      database
   │  POST /transfers  ────────►  │                              │
   │                              │  BEGIN … COMMIT  ──────────► │  ₦10,000 moved
   │  ✕ ◄──── 201 lost in tunnel  │                              │
   │                              │                              │
   │  POST /transfers (retry) ──► │  BEGIN … COMMIT  ──────────► │  ₦10,000 moved again
   │  ◄──────────────── 201       │                              │
```

The server cannot tell a retry from a new transfer. Both requests are valid.

## Idempotency keys

The fix is to let the client name its **intent**. When Ada taps Send, the app generates a random id, the **idempotency key**, and sends it in a header with the request and with every retry of it:

```ts
POST /transfers
Authorization: Bearer …
Idempotency-Key: 5f0c2d4e-8a1b-4c3d-9e7f-1a2b3c4d5e6f
Content-Type: application/json

{"from": 1, "to": 2, "amountKobo": 1000000}
```

The server remembers each key it has seen, together with the response it gave. When a key comes back, it does not run the transfer again: it **replays** the stored response. The `Idempotency-Key` header is the name used by payment APIs such as Stripe, and by an IETF draft standard for HTTP. The rules that make it work:

1. **One key per intent, not per attempt.** The key is created when the user decides ("send ₦10,000 to Bola"), and reused for every retry. A new key per attempt protects nothing.
2. **Keys are scoped to the user.** Store them under `(user_id, key)`. Otherwise one user who guesses another's key could receive their stored response.
3. **A key belongs to one request.** Store a fingerprint (hash) of the request. The same key with a different body is a client bug; answer 422 instead of silently replaying a response for a different transfer.
4. **The work and the stored response commit together.** If the transfer commits but storing the response does not (a crash in between), the next retry runs the transfer again. So both happen in one transaction.
5. **Two copies at once.** If a retry arrives while the first request is still running, the second must not start a second transfer. It gets **409 Conflict** and tries again a moment later.
6. **Crashes.** If the server dies mid-request, the key must not stay blocked forever. A lock with an expiry lets a later retry take over.

### The store

Here is the key store. `beginKey` claims a key or reports what the caller should do instead. `completeKey` stores the response, inside the transfer's own transaction. `releaseKey` gives the key up when the server failed unexpectedly, so a retry can try again:

idempotency.js

```ts
import { createHash, randomUUID } from "node:crypto";

const LOCK_MS = 30_000;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requestHash(method, path, body) {
  return createHash("sha256").update(`${method} ${path} ${canonical(body)}`).digest("hex");
}

export async function beginKey(db, { userId, key, hash, now }) {
  const lockId = randomUUID();
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  const claimed = await db.query(
    `INSERT INTO idempotency_keys (user_id, key, request_hash, status, lock_id, locked_until, created_at)
     VALUES ($1, $2, $3, 'in_progress', $4, $5, $6)
     ON CONFLICT (user_id, key) DO NOTHING RETURNING key`,
    [userId, key, hash, lockId, lockedUntil, now],
  );
  if (claimed.rows.length === 1) return { action: "proceed", lockId };

  const { rows: [row] } = await db.query(
    "SELECT request_hash, status, response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2",
    [userId, key],
  );
  if (row.request_hash !== hash) {
    return { action: "respond", status: 422, body: { error: "idempotency_key_reused", message: "This Idempotency-Key was sent with a different request" } };
  }
  if (row.status === "completed") return { action: "replay", status: row.response_status, body: row.response_body };

  const takeover = await db.query(
    `UPDATE idempotency_keys SET lock_id = $3, locked_until = $4
     WHERE user_id = $1 AND key = $2 AND status = 'in_progress' AND locked_until < $5 RETURNING key`,
    [userId, key, lockId, lockedUntil, now],
  );
  if (takeover.rows.length === 1) return { action: "proceed", lockId };
  return { action: "respond", status: 409, body: { error: "request_in_progress", message: "This request is still being processed; retry shortly" } };
}

export async function completeKey(tx, { userId, key, lockId, status, body }) {
  const done = await tx.query(
    `UPDATE idempotency_keys
     SET status = 'completed', response_status = $4, response_body = $5::jsonb, lock_id = NULL, locked_until = NULL
     WHERE user_id = $1 AND key = $2 AND lock_id = $3 RETURNING key`,
    [userId, key, lockId, status, JSON.stringify(body)],
  );
  if (done.rows.length === 0) throw new Error("lost the idempotency lock; rolling back");
}

export async function releaseKey(db, { userId, key, lockId }) {
  await db.query("DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND lock_id = $3", [userId, key, lockId]);
}
```

- `INSERT … ON CONFLICT DO NOTHING RETURNING` is an atomic "claim if nobody has". Of two requests racing for the same key, the primary key lets exactly one insert succeed.
- `canonical` sorts object keys before hashing, so `{"from":1,"to":2}` and `{"to":2,"from":1}`, the same request written differently, get the same fingerprint.
- Each claim gets a random `lock_id`. `completeKey` only succeeds for the current holder. This is called a **fencing token**, and you will see why it matters in the crash test.
- `now` is a parameter instead of `new Date()` inside, so tests can move the clock.

### The handler

The handler ties it together. Notice the transaction: the transfer and `completeKey` run in the same one, so either both commit or neither does:

handler.js

```ts
import { beginKey, completeKey, releaseKey, requestHash } from "./idempotency.js";
import { transfer } from "./transfer.js";

export async function handleTransfer(db, { userId, key, body, now = new Date() }) {
  if (typeof key !== "string" || !/^[\w-]{16,64}$/.test(key)) {
    return { status: 400, body: { error: "idempotency_key_required", message: "Send an Idempotency-Key header of 16 to 64 letters, digits, - or _" } };
  }
  const started = await beginKey(db, { userId, key, hash: requestHash("POST", "/transfers", body), now });
  if (started.action === "replay") return { status: started.status, body: started.body, replayed: true };
  if (started.action === "respond") return { status: started.status, body: started.body };

  try {
    return await db.transaction(async (tx) => {
      const result = await transfer(tx, { userId, ...body });
      await completeKey(tx, { userId, key, lockId: started.lockId, ...result });
      return result;
    });
  } catch (error) {
    await releaseKey(db, { userId, key, lockId: started.lockId });
    throw error;
  }
}
```

Business rejections (insufficient funds, a frozen account) are stored and replayed like successes: they are the real, final answer to that request. Only *unexpected* errors release the key, because they say nothing about the request, and a retry might succeed.

## Test every way it can go wrong

Each test below reproduces one failure from the reasoning block, and each ends by checking the invariant: the total is still ₦75,000.

### The lost response, again

The same unreliable network as before, now with a key that the client creates once, before the first attempt:

retry-safe.jsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { balances, openBank } from "./bank-db.js";
import { handleTransfer } from "./handler.js";

const db = await openBank();
let deliveries = 0;

async function network(request) {
  deliveries++;
  const response = await handleTransfer(db, request);
  if (deliveries === 1) throw new Error("timed out waiting for the response");
  return response;
}

const intent = { userId: 1, key: randomUUID(), body: { from: 1, to: 2, amountKobo: 1_000_000 } };
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const response = await network(intent);
    console.log(`attempt ${attempt}:`, response.status, response.replayed ? "(replayed)" : "", response.body);
    break;
  } catch (error) {
    console.log(`attempt ${attempt}:`, error.message);
  }
}
console.log(await balances(db));
await db.close();
```

Output of `node retry-safe.js`

```ts
attempt 1: timed out waiting for the response
attempt 2: 201 (replayed) {
  to: 2,
  from: 1,
  amountKobo: 1000000,
  transferId: 1,
  balanceKobo: 4000000
}
Ada ₦40,000, Bola ₦15,000, Chidi ₦20,000 | total ₦75,000 | transfers 1
```

The second delivery found the key completed and replayed the exact response of the first, including its `transferId`. The phone now shows the right result, and the money moved once.

Look closely at the replayed body: its fields come back in a different order (`to` before `from`). The `jsonb` type stores objects in its own internal order. JSON clients must not depend on key order, so this is harmless here; if you ever need a byte-for-byte identical replay (for example because the body is signed), store the response as `text` instead.

### Misuse: a reused key, another user, no key

key-misuse.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";
import { handleTransfer } from "./handler.js";

const db = await openBank();
const key = "tap-2026-09-24-0001";
const show = (label, r) => console.log(label.padEnd(26), r.status, r.replayed ? "replayed" : "", r.body.error ?? "ok");

show("first request", await handleTransfer(db, { userId: 1, key, body: { from: 1, to: 2, amountKobo: 1_000_000 } }));
show("same, keys reordered", await handleTransfer(db, { userId: 1, key, body: { amountKobo: 1_000_000, to: 2, from: 1 } }));
show("same key, other amount", await handleTransfer(db, { userId: 1, key, body: { from: 1, to: 2, amountKobo: 5_000_000 } }));
show("other user, same key", await handleTransfer(db, { userId: 2, key, body: { from: 2, to: 1, amountKobo: 100_000 } }));
show("no key", await handleTransfer(db, { userId: 1, key: undefined, body: { from: 1, to: 2, amountKobo: 100 } }));

const broke = "tap-2026-09-24-0002";
show("too much", await handleTransfer(db, { userId: 2, key: broke, body: { from: 2, to: 1, amountKobo: 9_000_000 } }));
show("too much, retried", await handleTransfer(db, { userId: 2, key: broke, body: { from: 2, to: 1, amountKobo: 9_000_000 } }));
console.log(await balances(db));
await db.close();
```

Output of `node key-misuse.js`

```ts
first request              201  ok
same, keys reordered       201 replayed ok
same key, other amount     422  idempotency_key_reused
other user, same key       201  ok
no key                     400  idempotency_key_required
too much                   422  insufficient_funds
too much, retried          422 replayed insufficient_funds
Ada ₦41,000, Bola ₦14,000, Chidi ₦20,000 | total ₦75,000 | transfers 2
```

- Reordered JSON is the same request, so it is a replay.
- The same key with ₦50,000 instead of ₦10,000 is refused with 422. Replaying the ₦10,000 response would tell the app that a ₦50,000 transfer succeeded.
- Bola's key happens to be the same string as Ada's, and it does not matter: keys are scoped per user.
- The refused transfer is replayed as refused. If Bola tops up and wants to try again, that is a *new* intent, with a new key.

### Two copies at the same moment

A double tap sends the same request twice, a few milliseconds apart. Start both without waiting for either:

concurrent.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";
import { handleTransfer } from "./handler.js";

const db = await openBank();
const intent = { userId: 1, key: "double-tap-0000000001", body: { from: 1, to: 2, amountKobo: 1_000_000 } };

const [first, second] = await Promise.all([handleTransfer(db, intent), handleTransfer(db, intent)]);
console.log("first: ", first.status, first.replayed ? "replayed" : "", first.body.error ?? "ok");
console.log("second:", second.status, second.replayed ? "replayed" : "", second.body.error ?? "ok");

const later = await handleTransfer(db, intent);
console.log("later: ", later.status, later.replayed ? "replayed" : "");
console.log(await balances(db));
await db.close();
```

Output of `node concurrent.js`

```ts
first:  201  ok
second: 201 replayed ok
later:  201 replayed
Ada ₦40,000, Bola ₦15,000, Chidi ₦20,000 | total ₦75,000 | transfers 1
```

Only one request could claim the key; the primary key on `(user_id, key)` lets exactly one `INSERT` succeed. PGlite runs one query at a time and holds other queries back while a transaction is open, so the second request waited, found the key completed and received the stored response. On a real PostgreSQL server with a connection pool, the second request can look at the key while the first is still inside its transaction. Then it finds the key `in_progress` and gets 409 with `Retry-After`, which the crash test below shows. Either way the money moves once.

### A server that crashes, and one that is only slow

The hardest case. The server claims the key and then dies before its transaction commits. The transaction rolls back, but the key row, committed earlier by `beginKey`, still says `in_progress`. The lock's expiry is what saves the day. The clock is moved by hand:

crash.jsNode.js only

```ts
import { balances, openBank } from "./bank-db.js";
import { handleTransfer } from "./handler.js";
import { beginKey, completeKey, requestHash } from "./idempotency.js";
import { transfer } from "./transfer.js";

const db = await openBank();
const userId = 1, key = "crash-demo-00000000001";
const body = { from: 1, to: 2, amountKobo: 1_000_000 };
const t0 = Date.UTC(2026, 8, 24, 10, 0, 0);
const at = (seconds) => new Date(t0 + seconds * 1000);

const stuck = await beginKey(db, { userId, key, hash: requestHash("POST", "/transfers", body), now: at(0) });
console.log("server A claimed the key:", stuck.action, "and then went silent");

const early = await handleTransfer(db, { userId, key, body, now: at(10) });
console.log("retry after 10 s:", early.status, early.body.error);

const late = await handleTransfer(db, { userId, key, body, now: at(31) });
console.log("retry after 31 s:", late.status, `transfer ${late.body.transferId}`);

try {
  await db.transaction(async (tx) => {
    const result = await transfer(tx, { userId, ...body });
    await completeKey(tx, { userId, key, lockId: stuck.lockId, ...result });
  });
} catch (error) {
  console.log("server A wakes up:", error.message);
}
console.log(await balances(db));
await db.close();
```

Output of `node crash.js`

```ts
server A claimed the key: proceed and then went silent
retry after 10 s: 409 request_in_progress
retry after 31 s: 201 transfer 1
server A wakes up: lost the idempotency lock; rolling back
Ada ₦40,000, Bola ₦15,000, Chidi ₦20,000 | total ₦75,000 | transfers 1
```

Read the four lines in order:

1. Server A claimed the key. Its transfer never committed.
2. Ten seconds later the lock was still valid, so the retry got 409. Server A might just be slow.
3. After 31 seconds the lock had expired. The retry took the key over with a new `lock_id` and made the transfer.
4. Then server A turned out to be slow, not dead, and tried to finish. Its transfer ran inside its transaction, but `completeKey` found that A no longer holds the lock, threw, and the whole transaction rolled back, transfer included. That is the fencing token at work. Without it, both servers would have moved the money.

The lock must outlive the slowest normal request. If transfers can take 40 seconds, a 30-second lock invites takeovers of healthy requests; the fencing token keeps the result correct, but the wasted work is real. Set the lock well above your request timeout.

## Over HTTP, with a retrying client

Now the real thing: a `node:http` server with the handler behind it, and a client that retries with the same key. To reproduce the tunnel, the server destroys the connection instead of answering the first request, *after* the transfer has committed. The user id comes from a bearer token, standing in for the session lookup of [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication):

server.jsNode.js only

```ts
import http from "node:http";
import { randomUUID } from "node:crypto";
import { balances, openBank } from "./bank-db.js";
import { handleTransfer } from "./handler.js";

const db = await openBank();
const sessions = new Map([["token-ada", 1], ["token-bola", 2]]);
let dropNextResponse = true;

const server = http.createServer(async (req, res) => {
  const userId = sessions.get((req.headers.authorization ?? "").replace("Bearer ", ""));
  if (userId === undefined) return res.writeHead(401).end();
  let text = "";
  for await (const chunk of req) text += chunk;
  const result = await handleTransfer(db, { userId, key: req.headers["idempotency-key"], body: JSON.parse(text) });
  if (dropNextResponse) {
    dropNextResponse = false;
    return req.socket.destroy();
  }
  const headers = { "Content-Type": "application/json" };
  if (result.replayed) headers["Idempotent-Replayed"] = "true";
  if (result.status === 409) headers["Retry-After"] = "1";
  res.writeHead(result.status, headers).end(JSON.stringify(result.body));
});

async function sendTransfer(base, token, body) {
  const key = randomUUID();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${base}/transfers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status !== 409 && res.status < 500) {
        console.log(`attempt ${attempt}:`, res.status, "replayed:", res.headers.get("idempotent-replayed") ?? "no");
        return res.json();
      }
      console.log(`attempt ${attempt}:`, res.status, "will retry");
    } catch (error) {
      console.log(`attempt ${attempt}: network error (${error.name}), will retry`);
    }
    const delay = 50 * 2 ** (attempt - 1) + Math.random() * 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("gave up; the transfer's outcome is unknown, show it as pending");
}

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const result = await sendTransfer(base, "token-ada", { from: 1, to: 2, amountKobo: 1_000_000 });
  console.log("app shows:", result);
  console.log(await balances(db));
  server.close();
  await db.close();
});
```

Output of `node server.js`

```ts
attempt 1: network error (TypeError), will retry
attempt 2: 201 replayed: true
app shows: {
  to: 2,
  from: 1,
  amountKobo: 1000000,
  transferId: 1,
  balanceKobo: 4000000
}
Ada ₦40,000, Bola ₦15,000, Chidi ₦20,000 | total ₦75,000 | transfers 1
```

The client's rules are as important as the server's:

- **The key is made once per intent**, outside the retry loop. A real app also saves it with the pending transfer, so a retry after the app restarts still uses it.
- **Retry only what may succeed later**: network errors, 5xx, 409 "in progress" and 429. Never retry a 400 or 422: the same request will fail the same way.
- **Back off**: wait longer after each failure (50, 100, 200 ms …), and add random **jitter** so a thousand phones that lost signal together do not retry in lockstep and flatten the server.
- **Give up honestly.** After the last attempt the outcome is *unknown*, not failed. Show the transfer as pending and check later (for example with `GET /transfers?key=…`), rather than telling Ada it failed when it may have succeeded.

## The exactly-once illusion

People say they want "exactly-once delivery". Over a network that can lose messages, it cannot be built: to be sure a message arrived, the sender must be willing to send it again, and then it may arrive twice. What real systems build is:

at-least-once delivery + idempotent processing = effectively once

The client (or a queue) keeps delivering until it gets an answer, and the server makes duplicates harmless. That is exactly what this lesson did. The same idea applies to messages from a queue, where the **message id** plays the role of the idempotency key; [Queues and background jobs](https://zudojs.oyinlola.site/learn/backend-queues) builds idempotent consumers this way.

### Side effects outside the database

The transaction protects everything inside PostgreSQL. It cannot un-send an SMS or un-call another bank. Suppose the transfer must also send "You sent ₦10,000 to Bola" by SMS. If you send it inside the transaction and the commit then fails, the customer gets an SMS for a transfer that did not happen. If you send it after the commit and the server crashes first, no SMS is ever sent.

The standard answer is the **transactional outbox**: in the same transaction as the transfer, insert a row into an `outbox` table ("send this SMS"). A separate worker reads the outbox, sends the SMS, and marks the row done. The row exists if and only if the transfer committed. The worker may still send twice (if it crashes after sending but before marking), so it passes the outbox row's id as an idempotency key to the SMS provider. The pattern repeats at every boundary.

## Failure cases and production concerns

| Mistake | What happens |
| --- | --- |
| A new key for every attempt | Every retry looks new. Double transfers, exactly as with no keys. |
| Keys in a `Map` in memory | Lost on restart, and not shared between the three copies of your server behind a load balancer. The retry lands on another copy. |
| Storing the response in a second transaction | A crash between the two commits leaves a done transfer with no stored response. The retry transfers again. |
| Keys not scoped to the user | One user can fetch another user's stored response by sending their key. |
| Ignoring the request fingerprint | A buggy client reuses a key for a different amount and is told it succeeded. |
| Replaying stored 500s | A temporary outage becomes a permanent failure for that key. |
| A lock with no expiry | One crash blocks that key forever: the user can never complete that transfer. |
| A lock expiry but no fencing token | A slow server and the retry that took over both commit their transfer. |

- **Keep keys long enough** to cover every realistic retry: 24 hours is common. Delete completed keys older than that with a scheduled job, and index `created_at` for it.
- **Store small responses.** The stored body is replayed as-is; for large responses store what is needed to rebuild them (the transfer id) instead.
- **Which endpoints need keys?** Any non-idempotent operation whose repetition costs money or trust: payments, transfers, orders, sending messages. `PUT` and `DELETE` are idempotent by design, and some `POST`s can be made naturally idempotent with a conditional update (see the first exercise).
- **Make the key required** on those endpoints (400 without it), so a client cannot forget it and only discover the problem in a tunnel.
- **Log replays and 409s.** A spike in replays means clients are timing out: a latency problem you want to see before customers complain.
- **Rate limiting comes next.** Retries multiply traffic. A client that retries without backoff can turn a small slowdown into an outage, which is what [the next lesson](https://zudojs.oyinlola.site/learn/api-rate-limiting) defends against.

## Practice

TRY IT YOURSELF

### Naturally idempotent: mark an order shipped

Not every operation needs a key table. Write `markShipped(db, orderId)` for a table `orders (id, status)` so that calling it twice has the same effect as calling it once, and the second call is still reported as a success. Only a `paid` order may be shipped; a `cancelled` order must give an error.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The conditional `UPDATE ... RETURNING` tells you whether *this call* made the change. Only when it did not do you need a second query to find out why.

HINT 2

`const changed = await db.query("UPDATE orders SET status = 'shipped' WHERE id = $1 AND status = 'paid' RETURNING id", [orderId]); if (changed.rows.length === 1) return "shipped"; const { rows: [order] } = await db.query("SELECT status FROM orders WHERE id = $1", [orderId]); if (order?.status === "shipped") return "already shipped (ok)"; return \`error: order is ${order?.status ?? "missing"}\`;`

SOLUTION

Make the state change conditional on the current state, then decide what "no row changed" means by looking at the row:

ship.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`CREATE TABLE orders (id integer PRIMARY KEY, status text NOT NULL);
  INSERT INTO orders VALUES (1, 'paid'), (2, 'cancelled');`);

async function markShipped(orderId) {
  const changed = await db.query("UPDATE orders SET status = 'shipped' WHERE id = $1 AND status = 'paid' RETURNING id", [orderId]);
  if (changed.rows.length === 1) return "shipped";
  const { rows: [order] } = await db.query("SELECT status FROM orders WHERE id = $1", [orderId]);
  if (order?.status === "shipped") return "already shipped (ok)";
  return `error: order is ${order?.status ?? "missing"}`;
}

console.log(await markShipped(1));
console.log(await markShipped(1));
console.log(await markShipped(2));
console.log(await markShipped(3));
await db.close();
```

Output of `node ship.js`

```ts
shipped
already shipped (ok)
error: order is cancelled
error: order is missing
```

This works because the target state ("shipped") says everything: repeating it changes nothing. A transfer is different: "move ₦10,000" twice is two moves, so it needs a key.

TRY IT YOURSELF

### Clean up old keys

Write the SQL for a nightly job that deletes idempotency keys older than 24 hours, but never deletes a key that is still `in_progress` with a valid lock. Run it on the bank database with three keys: a completed one from two days ago, a completed one from an hour ago, and an in-progress one from two days ago whose lock has expired.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Two conditions joined by `AND`: one about age (`created_at`), one about safety to delete (`OR` of "already completed" and "lock expired"). Pass `hoursAgo(24)` and `now` as `$1`/`$2`.

HINT 2

`DELETE FROM idempotency_keys WHERE created_at < $1 AND (status = 'completed' OR locked_until < $2) RETURNING key`, called with `[hoursAgo(24), now]`.

SOLUTION

cleanup.jsNode.js only

```ts
import { openBank } from "./bank-db.js";

const db = await openBank();
const now = new Date(Date.UTC(2026, 8, 24, 3, 0, 0));
const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000);
await db.query(
  `INSERT INTO idempotency_keys (user_id, key, request_hash, status, lock_id, locked_until, created_at) VALUES
   (1, 'old-completed', 'h', 'completed', NULL, NULL, $1),
   (1, 'new-completed', 'h', 'completed', NULL, NULL, $2),
   (1, 'old-stuck', 'h', 'in_progress', 'lock-1', $3, $1)`,
  [hoursAgo(48), hoursAgo(1), hoursAgo(47)],
);

const deleted = await db.query(
  `DELETE FROM idempotency_keys
   WHERE created_at < $1 AND (status = 'completed' OR locked_until < $2)
   RETURNING key`,
  [hoursAgo(24), now],
);
console.log("deleted:", deleted.rows.map((r) => r.key));
const { rows } = await db.query("SELECT key FROM idempotency_keys");
console.log("kept:", rows.map((r) => r.key));
await db.close();
```

Output of `node cleanup.js`

```ts
deleted: [ 'old-completed', 'old-stuck' ]
kept: [ 'new-completed' ]
```

The stuck key is deleted too, because its lock expired long ago: any request that could still be holding it would already have lost the fencing check. A key in progress with a *valid* lock is never touched.

TRY IT YOURSELF

### Which responses to retry?

Write `shouldRetry(outcome)` for the client, where `outcome` is either an HTTP status number or the string `"network"`. Test it with `"network"`, 201, 400, 409, 422, 429, 500 and 503.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Handle the special string case first, then combine the numeric cases with `||`, the same shape as the worked example.

HINT 2

`if (outcome === "network") return true; return outcome === 409 || outcome === 429 || outcome >= 500;`

SOLUTION

should-retry.js

```ts
function shouldRetry(outcome) {
  if (outcome === "network") return true;
  return outcome === 409 || outcome === 429 || outcome >= 500;
}

for (const outcome of ["network", 201, 400, 409, 422, 429, 500, 503]) {
  console.log(String(outcome).padEnd(8), shouldRetry(outcome));
}
```

Output of `node should-retry.js` and of the browser terminal

```ts
network  true
201      false
400      false
409      true
422      false
429      true
500      true
503      true
```

Retrying is only safe *because* of the idempotency key. Without a key, even retrying a network error risks a double transfer; with one, every retry is harmless, and the only question left is whether it can succeed.

## Summary

- Reason first: who is calling, do they own the account, are both accounts active, is there enough money, does the recipient exist, what if a later write fails, and what if the request comes twice.
- Put every write of one operation in one transaction, check what you can before writing, and make balance checks atomic with a conditional update and a `CHECK` constraint.
- After a timeout, a client cannot know whether its request succeeded. Retries are necessary, so the server must make them harmless.
- An idempotency key names one user intent. Store it per user with a request fingerprint, claim it atomically, and commit the stored response in the same transaction as the work.
- Replay completed results (including business rejections), answer 422 for a reused key with a different request, 409 while in progress, and let an expired lock be taken over, guarded by a fencing token.
- Clients create the key once, retry only retryable outcomes, back off with jitter, and treat "gave up" as unknown, not failed.
- "Exactly once" is at-least-once delivery plus idempotent processing; side effects outside the database go through an outbox with their own keys.

Next: [Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting), where you protect this API from clients that send too much, whether by accident or on purpose.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
