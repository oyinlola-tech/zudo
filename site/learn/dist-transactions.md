---
title: "Transactions across services — ZudoJS Academy"
description: "Keep an order, payment, stock and shipment consistent across services with sagas, compensations, a transactional outbox and idempotent consumers."
source: https://zudojs.oyinlola.site/learn/dist-transactions
---

LEVEL 16 · LESSON 4 OF 4

Distributed systems Advanced

# Transactions across services

Keep an order, payment, stock and shipment consistent across services with sagas, compensations, a transactional outbox and idempotent consumers.

- **60 min** to read and try
- **You need:** Failure engineering, Idempotency and safe retries, and Transactions with @zudojs/transactions
- **You build:** A ShopFlow checkout saga (order, payment, inventory, shipping) with a durable orchestrator, a transactional outbox and relay on PGlite, idempotent consumers, and a test that crashes it at every step

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why two-phase commit is rarely used between services, and what blocks when its coordinator fails
- Design a saga's steps, compensations and pivot, and choose between orchestration and choreography
- Write a transactional outbox with a relay on PostgreSQL and explain the at-least-once delivery it gives
- Build idempotent consumers with an inbox table and idempotency keys
- Make an orchestrator durable so it resumes after a crash, and test it by crashing it at every step

## Charged ₦25,000, no lamp

In [the database transactions lesson](https://zudojs.oyinlola.site/learn/db-transactions), "take the money and reduce the stock" was one `BEGIN … COMMIT`: both happened or neither did. ShopFlow has since been split into services, each owning its own database, as [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices) recommended: orders, payments, inventory and shipping. A checkout touches all four, and there is no `BEGIN` that spans four databases.

Here is the checkout as a sequence of calls, with each service reduced to a few lines of state. Two customers buy the last lamp at nearly the same time:

naive.js

```ts
const payments = [];
const stock = new Map([["lamp", 1]]);
const orders = new Map();

async function checkout(orderId, sku) {
  orders.set(orderId, "pending");
  payments.push({ orderId, amountKobo: 2_500_000 });          // payments service
  const left = stock.get(sku);                                 // inventory service
  if (left < 1) {
    orders.set(orderId, "failed");
    throw new Error(`${sku} is out of stock`);
  }
  stock.set(sku, left - 1);
  orders.set(orderId, "confirmed");                            // (shipping would come next)
}

for (const orderId of ["ord_1", "ord_2"]) {
  await checkout(orderId, "lamp").catch((error) => console.log(`${orderId}: ${error.message}`));
}
console.log("orders:", Object.fromEntries(orders));
console.log("charged:", payments.map((p) => `${p.orderId} ₦${(p.amountKobo / 100).toFixed(2)}`));
```

Output of `node naive.js` and of the browser terminal

```ts
ord_2: lamp is out of stock
orders: { ord_1: 'confirmed', ord_2: 'failed' }
charged: [ 'ord_1 ₦25000.00', 'ord_2 ₦25000.00' ]
```

The second customer paid ₦25,000 for an order marked `failed`. Nothing will ever give the money back, because the payment happened in a different service, and the error in the inventory step cannot roll it back. Now add the failures from [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability): the process can crash between any two lines, the payment call can time out after the card was charged, a message can be delivered twice. Each of those produces a different inconsistent state.

This lesson is about the tools that keep several services consistent without a shared transaction: **sagas** with compensations, the **transactional outbox**, and **idempotent consumers**. First, the tool that looks like the obvious answer, and why it is rarely used.

## Why two-phase commit is rare

**Two-phase commit** (2PC) is a protocol for committing one transaction across several databases. A **coordinator** runs it with every **participant**:

1. **Prepare.** The coordinator asks each participant: "can you commit?" Each one does all the work, writes it durably, keeps its locks, and votes yes or no. A participant that voted yes has promised to commit if told to, even after a crash.
2. **Commit.** If every vote was yes, the coordinator tells everyone to commit; otherwise, to abort.

It gives real atomicity. The problem is what happens between the two phases. A participant that voted yes may neither commit nor abort on its own: only the coordinator knows the outcome. If the coordinator crashes at that moment, the participant is **in doubt**, and its locks stay held until the coordinator comes back:

two-phase.js

```ts
function participant(name) {
  return { name, state: "idle", locks: new Set() };
}

const payments = participant("payments");
const inventory = participant("inventory");

function prepare(p, row) {
  p.locks.add(row);
  p.state = "prepared (in doubt)";
  return "yes";
}

function tryLock(p, row, who) {
  return p.locks.has(row) ? `${who} blocked: ${row} is locked by an in-doubt transaction` : `${who} got ${row}`;
}

// Phase 1: both participants vote yes and keep their locks.
const votes = [prepare(payments, "account:ada"), prepare(inventory, "stock:lamp")];
console.log("votes:", votes.join(", "));

// The coordinator crashes here, before phase 2.
console.log("coordinator: crashed before sending commit");
for (const p of [payments, inventory]) console.log(`${p.name}: ${p.state}, holding ${[...p.locks].join(", ")}`);

// Meanwhile, other customers need the same rows.
console.log(tryLock(inventory, "stock:lamp", "ord_2 (Kofi)"));
console.log(tryLock(payments, "account:ada", "ada's top-up"));
```

Output of `node two-phase.js` and of the browser terminal

```ts
votes: yes, yes
coordinator: crashed before sending commit
payments: prepared (in doubt), holding account:ada
inventory: prepared (in doubt), holding stock:lamp
ord_2 (Kofi) blocked: stock:lamp is locked by an in-doubt transaction
ada's top-up blocked: account:ada is locked by an in-doubt transaction
```

Nobody can buy a lamp and Ada cannot top up her wallet until an operator restarts the coordinator or resolves the transaction by hand. That is the core objection, and there are more:

- **Availability multiplies.** A 2PC transaction needs every participant and the coordinator up at the same time. Four services that are each up 99.9% of the time are all up together only about 99.6% of the time.
- **Latency and locks.** Locks are held across at least two network round trips to every participant, so contention grows with the slowest one.
- **Participants must support it.** PostgreSQL can be a participant with `PREPARE TRANSACTION`, but it is switched off by default, as you can see in PGlite, the real PostgreSQL you have been using. And a payment provider's HTTP API, a message broker or an e-mail service cannot be a participant at all.

prepared.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = await PGlite.create();
console.log("max_prepared_transactions =", (await db.query<{ max_prepared_transactions: string }>("SHOW max_prepared_transactions")).rows[0]?.max_prepared_transactions);
try {
  await db.exec("BEGIN; CREATE TABLE payments (id int); PREPARE TRANSACTION 'checkout-ord_2';");
} catch (error) {
  console.log("PREPARE TRANSACTION:", (error as Error).message);
}
await db.close();
```

Output of `npx tsx prepared.ts`

```ts
max_prepared_transactions = 0
PREPARE TRANSACTION: prepared transactions are disabled
```

2PC still has a place inside one vendor's system, for example between two databases that are designed to take part in it. Between services owned by different teams, talking over HTTP and queues, the answer is almost always a saga.

## Sagas and compensations

A **saga** is a sequence of **local transactions**, each in one service's own database and each committed on its own. If a step fails, the saga does not roll back (the earlier steps are already committed); it runs **compensations**: new local transactions that semantically undo earlier steps, in reverse order.

"Semantically" matters. A compensation is not a delete. The compensation for "charge ₦25,000" is "refund ₦25,000": a new, visible fact in the payments ledger, which the customer's bank statement will show too. Some steps have no compensation at all: an e-mail that was sent stays sent, and the best you can do is send another one.

ShopFlow's checkout saga, in the order the business asked for:

| Step | Service | Action | Compensation |
| --- | --- | --- | --- |
| 0 | Orders | Create order as `pending` | Mark order `cancelled` |
| 1 | Payments | Charge the card | Refund |
| 2 | Inventory | Reserve the stock | Release the reservation |
| 3 | Shipping | Book a courier | Cancel the booking |
| 4 | Orders | Mark order `confirmed` | (none: the saga is done) |

REASON IT OUT

### Before you build the saga

Think through these before looking at code:

1. Step 2 fails because the lamp is out of stock. Which compensations run, in what order? What does the customer see?
2. The payments service charges the card, and its answer is lost in a timeout. The saga does not know whether step 1 happened. What should it do?
3. The orchestrator process crashes after step 2 finished but before it saved "step 2 done". When it restarts, it runs step 2 again. What must be true of step 2?
4. A compensation fails, say the refund call gets a 503. Can the saga give up?
5. While the saga runs, the order is `pending` and the stock is reserved. What can other requests see, and is that a problem?
6. Is "charge, then reserve" the best order of steps?

**Show the reasoning**

1. Refund the payment (step 1's compensation), then cancel the order (step 0's). Step 2 committed nothing, so it has nothing to undo. The customer sees a cancelled order and a refund.
2. Retry step 1 *with the same idempotency key*. If the first charge happened, payments returns it; if not, it charges now. Either way there is exactly one charge. An unknown outcome is resolved by asking again safely, never by guessing.
3. Step 2 must be idempotent: running it twice with the same key must reserve once. Every step and every compensation of a saga must be idempotent, because a durable orchestrator guarantees each step runs *at least* once, not exactly once.
4. No. A saga that stops halfway through compensating leaves money taken and no order. Compensations are retried until they succeed (with backoff), and if they keep failing, a human is alerted. Design compensations so they *can* always succeed: a refund of a captured payment should not depend on stock or on the customer.
5. Other requests see intermediate states: sagas have no isolation. A pending order is fine if every screen shows it as pending (a **semantic lock**: the status field tells others "in progress, do not touch"). Stock that is reserved and later released may make another customer see "sold out" for a few seconds. That is usually acceptable; if it is not, the step order or the design must change.
6. Probably not. A step that often fails (out of stock) should come *before* steps that are expensive to undo (a refund costs fees and worries customers). Reserving stock first, then charging, then booking the courier would compensate less. The last step that cannot be compensated, if any, is the **pivot**: once it succeeds the saga must go forward, never back. You will reorder the steps in the practice section.

### Orchestration or choreography

There are two ways to drive a saga:

- **Orchestration**: one component, the **orchestrator**, tells each service what to do, waits for the answer, and decides the next step or the compensations. The whole flow is in one place, and so is its state.
- **Choreography**: there is no conductor. Each service listens for events and reacts by doing its step and publishing its own event. The flow emerges from the reactions.

Choreography is easiest to see with events. Here the four services react to each other on an event bus from `@zudojs/events`; each handler also remembers which orders it has handled, because events may arrive twice:

choreography.ts

```ts
import { createEventBus } from "@zudojs/events";
import type { Event } from "@zudojs/events";

type Payload = { orderId: string; sku: string };
const bus = createEventBus();
const stock = new Map([["lamp", 5], ["fan", 0]]);
const status = new Map<string, string>();
const handledBy = new Map<string, Set<string>>();

function on(service: string, type: string, handler: (p: Payload) => Promise<void>) {
  bus.on<Event<Payload>>(type, async (event) => {
    const key = `${service}:${type}:${event.payload.orderId}`;
    const seen = handledBy.get(service) ?? new Set<string>();
    handledBy.set(service, seen);
    if (seen.has(key)) return;
    seen.add(key);
    await handler(event.payload);
  });
}
const emit = async (type: string, payload: Payload) => {
  console.log(`  -> ${type}`);
  await bus.publishEvent({ type, payload });
};

on("payments", "order.placed", (p) => emit("payment.captured", p));
on("inventory", "payment.captured", async (p) => {
  const left = stock.get(p.sku) ?? 0;
  if (left < 1) return emit("stock.rejected", p);
  stock.set(p.sku, left - 1);
  await emit("stock.reserved", p);
});
on("shipping", "stock.reserved", (p) => emit("shipment.booked", p));
on("payments", "stock.rejected", (p) => emit("payment.refunded", p));
on("orders", "shipment.booked", async (p) => void status.set(p.orderId, "confirmed"));
on("orders", "payment.refunded", async (p) => void status.set(p.orderId, "cancelled"));

for (const [orderId, sku] of [["ord_1", "lamp"], ["ord_2", "fan"]] as const) {
  console.log(`${orderId} (${sku}):`);
  await emit("order.placed", { orderId, sku });
}
console.log(Object.fromEntries(status), "lamps left:", stock.get("lamp"));
```

Output of `npx tsx choreography.ts` and of the browser terminal

```ts
ord_1 (lamp):
  -> order.placed
  -> payment.captured
  -> stock.reserved
  -> shipment.booked
ord_2 (fan):
  -> order.placed
  -> payment.captured
  -> stock.rejected
  -> payment.refunded
{ ord_1: 'confirmed', ord_2: 'cancelled' } lamps left: 4
```

It works, and no service knows the whole flow, which is both the strength and the weakness. Adding a fraud check means changing who listens to what in two services. Answering "why was ord_2 cancelled?" means reading four services' logs in order. And a cycle (payments listens to inventory, which listens to payments) is easy to create by accident.

|  | Orchestration | Choreography |
| --- | --- | --- |
| Where the flow lives | One orchestrator, readable top to bottom | Spread across the services' event handlers |
| Coupling | Orchestrator knows every service's API | Services know only event types |
| Saga state and "where is order 42?" | One row in the orchestrator's table | Reconstructed from events |
| Good for | Flows with several steps and compensations, like checkout | Short reactions: "when an order is placed, send an e-mail and update analytics" |

Most teams orchestrate business-critical sagas and choreograph notifications around them. [Event-driven applications](https://zudojs.oyinlola.site/learn/zudo-event-driven) goes deeper into the choreographed side. The rest of this lesson builds the orchestrated checkout, durably, on PostgreSQL.

## The transactional outbox

Every service in a saga has the same problem at its edge: it must change its database *and* tell the world, and those are two different systems. Writing to both is called a **dual write**, and it fails exactly like the naive checkout: the process can crash between the two.

The **transactional outbox** removes the second write. The service inserts the message into an `outbox` table *in the same local transaction* as the business change. A separate **relay** reads unpublished outbox rows, publishes them to the broker, and marks them published. You saw the basic version in [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#consistency); here it is built with `@zudojs/transactions`, from [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions), whose after-commit hook wakes the relay as soon as the transaction commits.

To keep the examples fast, ShopFlow's four services share one PGlite instance, each in its own **schema** (a namespace of tables: `orders.orders`, `payments.payments` …). The rule from real life still holds in the code: no service reads another's schema, and no transaction ever spans two schemas. In production each would be a separate database.

db.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import type { TransactionAdapter } from "@zudojs/transactions";

export async function createDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA orders;
    CREATE TABLE orders.orders (id text PRIMARY KEY, sku text NOT NULL, total_kobo integer NOT NULL, status text NOT NULL);
    CREATE TABLE orders.outbox (id serial PRIMARY KEY, type text NOT NULL, payload jsonb NOT NULL, claimed_until timestamptz, published_at timestamptz);
    CREATE TABLE orders.sagas (id text PRIMARY KEY, step integer NOT NULL, status text NOT NULL);

    CREATE SCHEMA payments;
    CREATE TABLE payments.payments (idempotency_key text PRIMARY KEY, order_id text NOT NULL, amount_kobo integer NOT NULL, status text NOT NULL);
    CREATE TABLE payments.inbox (message_id text PRIMARY KEY);

    CREATE SCHEMA inventory;
    CREATE TABLE inventory.stock (sku text PRIMARY KEY, available integer NOT NULL CHECK (available >= 0));
    CREATE TABLE inventory.reservations (idempotency_key text PRIMARY KEY, sku text NOT NULL, quantity integer NOT NULL, status text NOT NULL);

    CREATE SCHEMA shipping;
    CREATE TABLE shipping.shipments (idempotency_key text PRIMARY KEY, order_id text NOT NULL, status text NOT NULL);
  `);
  return db;
}

/* A minimal @zudojs/transactions adapter: PGlite is one connection, so the handle is the database itself. */
export function pgliteAdapter(db: PGlite): TransactionAdapter {
  return {
    capabilities: { savepoints: false, nestedTransactions: false, isolationLevels: [], readOnlyTransactions: false, timeouts: false },
    begin: async () => {
      await db.exec("BEGIN");
      return db;
    },
    commit: async () => void (await db.exec("COMMIT")),
    rollback: async () => void (await db.exec("ROLLBACK")),
  };
}
```

First the dual write and the outbox side by side, each with a crash right after the order is saved:

dual-write.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { createTransactionManager } from "@zudojs/transactions";
import { createDatabase, pgliteAdapter } from "./db.js";

const db = await createDatabase();
const manager = createTransactionManager({ adapter: pgliteAdapter(db) });
const broker = createEventBus();
broker.on("order.placed", (event) => console.log("  payments heard order.placed for", (event.payload as { orderId: string }).orderId));

async function dualWrite(orderId: string, crash: boolean) {
  await db.query("INSERT INTO orders.orders VALUES ($1, 'lamp', 2500000, 'pending')", [orderId]);
  if (crash) throw new Error("process crashed");
  await broker.publishEvent({ type: "order.placed", payload: { orderId } });
}

async function withOutbox(orderId: string, crash: boolean) {
  await manager.run(async () => {
    await db.query("INSERT INTO orders.orders VALUES ($1, 'lamp', 2500000, 'pending')", [orderId]);
    await db.query("INSERT INTO orders.outbox (type, payload) VALUES ('order.placed', $1)", [{ orderId }]);
  });
  if (crash) throw new Error("process crashed");
}

async function relay(): Promise<number> {
  const { rows } = await db.query<{ id: number; type: string; payload: { orderId: string } }>(
    "SELECT id, type, payload FROM orders.outbox WHERE published_at IS NULL ORDER BY id LIMIT 100",
  );
  for (const row of rows) {
    await broker.publishEvent({ type: row.type, payload: row.payload });
    await db.query("UPDATE orders.outbox SET published_at = now() WHERE id = $1", [row.id]);
  }
  return rows.length;
}

console.log("dual write:");
await dualWrite("ord_1", true).catch((error: Error) => console.log(`  ${error.message} after saving ord_1`));
console.log("outbox:");
await withOutbox("ord_2", true).catch((error: Error) => console.log(`  ${error.message} after saving ord_2`));
console.log("after restart, the relay runs:");
console.log("  relayed:", await relay());
const saved = await db.query<{ id: string }>("SELECT id FROM orders.orders ORDER BY id");
console.log("orders saved:", saved.rows.map((r) => r.id).join(", "));
await db.close();
```

Output of `npx tsx dual-write.ts`

```ts
dual write:
  process crashed after saving ord_1
outbox:
  process crashed after saving ord_2
after restart, the relay runs:
  payments heard order.placed for ord_2
  relayed: 1
orders saved: ord_1, ord_2
```

Both orders were saved. `ord_1`'s event is gone for good: nothing anywhere remembers that it should have been sent. `ord_2`'s event was committed with the order, so the relay found it after the "restart" and delivered it. The outbox turns "send a message" into "write a row", and rows are protected by the transaction.

### At least once, never exactly once

The relay has its own crash window: it can publish a row and crash before marking it published. On the next run it publishes the row again. So the outbox gives **at-least-once delivery**: every message arrives, some arrive twice. There is no cheap way to remove that window, because publishing and marking happen in two different systems again. The fix is on the receiving side.

A real relay also runs as several instances for availability. To stop two instances from sending the same rows at the same moment, the relay below **claims** its batch first: one `UPDATE` gives the rows a short lease (`claimed_until`), choosing them with `SELECT … FOR UPDATE SKIP LOCKED`. `FOR UPDATE` locks the rows it reads, and `SKIP LOCKED` makes a second relay skip rows another one is claiming instead of waiting for them. Other relays ignore leased rows until the lease runs out, so rows claimed by a relay that crashed are picked up again later. PGlite is a single connection that runs one query at a time, so two relays cannot actually compete in these examples; the query is the one you would use with a real connection pool.

### Idempotent consumers: the inbox

An **idempotent consumer** processes each message once, however often it arrives. The reliable way is an **inbox** table (sometimes called processed messages) in the consumer's own database: before acting, it inserts the message id with `ON CONFLICT DO NOTHING`, in the *same transaction* as the effect. If the insert did nothing, the message was seen before, and the whole handler is skipped:

inbox.tsNode.js only

```ts
import { createTransactionManager } from "@zudojs/transactions";
import { createDatabase, pgliteAdapter } from "./db.js";

const db = await createDatabase();
const manager = createTransactionManager({ adapter: pgliteAdapter(db) });
await db.query("INSERT INTO orders.outbox (type, payload) VALUES ('order.placed', $1)", [{ orderId: "ord_3", amountKobo: 2500000 }]);

/* payments service: charge once per message, however often it arrives */
async function onOrderPlaced(messageId: string, payload: { orderId: string; amountKobo: number }): Promise<string> {
  return manager.run(async () => {
    const fresh = await db.query("INSERT INTO payments.inbox (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id", [messageId]);
    if (fresh.rows.length === 0) return `${messageId}: already processed, skipped`;
    await db.query("INSERT INTO payments.payments VALUES ($1, $2, $3, 'captured')", [`charge:${payload.orderId}`, payload.orderId, payload.amountKobo]);
    return `${messageId}: charged ${payload.orderId}`;
  });
}

/* relay: claims a batch with a short lease, publishes, marks; crashes once between publishing and marking */
let crashBeforeMarking = true;
async function relay(): Promise<void> {
  const { rows } = await db.query<{ id: number; payload: { orderId: string; amountKobo: number } }>(`
    UPDATE orders.outbox SET claimed_until = now() + interval '200 milliseconds'
    WHERE id IN (
      SELECT id FROM orders.outbox
      WHERE published_at IS NULL AND (claimed_until IS NULL OR claimed_until < now())
      ORDER BY id LIMIT 100
      FOR UPDATE SKIP LOCKED)
    RETURNING id, payload`);
  for (const row of rows) {
    console.log("  delivered ->", await onOrderPlaced(`orders-outbox-${row.id}`, row.payload));
    if (crashBeforeMarking) {
      crashBeforeMarking = false;
      throw new Error("relay crashed before marking the row");
    }
    await db.query("UPDATE orders.outbox SET published_at = now() WHERE id = $1", [row.id]);
  }
}

for (let run = 1; run <= 3; run++) {
  console.log(`relay run ${run}:`);
  await relay().catch((error: Error) => console.log(`  ${error.message}`));
  await new Promise((resolve) => setTimeout(resolve, 300)); // a crashed relay's lease runs out
}
const charges = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM payments.payments");
console.log("charges:", charges.rows[0]?.n);
await db.close();
```

Output of `npx tsx inbox.ts`

```ts
relay run 1:
  delivered -> orders-outbox-1: charged ord_3
  relay crashed before marking the row
relay run 2:
  delivered -> orders-outbox-1: already processed, skipped
relay run 3:
charges: 1
```

The relay crashed after delivering, so the row was never marked. Once its lease ran out, the next run delivered the same message again, and the inbox recognised it. The message was delivered twice and the card was charged once. Two details make it work:

- The inbox row and the charge are in **one transaction**. If the charge fails, the inbox row rolls back too, so the retry is processed properly instead of being skipped.
- The message id is **stable**: derived from the outbox row's id, so a redelivery carries the same one. A relay that generated a fresh id per send would defeat the inbox.

Checking "have I seen this?" with a `SELECT` first and inserting later is the classic wrong version: two deliveries processed at the same moment both see "not yet" and both charge. The unique key on `message_id` makes the database the referee. With PGlite's single connection you cannot race two deliveries here, but the practice section shows the same race in plain JavaScript.

## A durable orchestrator

Now the checkout saga itself. Each service exposes idempotent operations: every call carries an **idempotency key** derived from the order (`ord_1:charge`), and a repeated key returns the earlier result instead of acting again. Failures can be injected by name, as in [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability):

services.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { ConflictError, DomainError, ServiceUnavailableError, TimeoutError } from "@zudojs/errors";

export type Failure = "card-declined" | "courier-down" | "payment-answer-lost" | "refunds-down-once";

export function createServices(db: PGlite, failures: Set<Failure>) {
  let answerLost = failures.has("payment-answer-lost");
  let refundsDown = failures.has("refunds-down-once");
  return {
    payments: {
      async charge(key: string, orderId: string, amountKobo: number): Promise<void> {
        const done = await db.query("SELECT 1 FROM payments.payments WHERE idempotency_key = $1", [key]);
        if (done.rows.length) return;
        if (failures.has("card-declined")) throw new DomainError("card declined");
        await db.query("INSERT INTO payments.payments VALUES ($1, $2, $3, 'captured') ON CONFLICT DO NOTHING", [key, orderId, amountKobo]);
        if (answerLost) {
          answerLost = false;
          throw new TimeoutError("payments did not answer in time");
        }
      },
      async refund(key: string): Promise<void> {
        if (refundsDown) {
          refundsDown = false;
          throw new ServiceUnavailableError("refunds are temporarily unavailable");
        }
        await db.query("UPDATE payments.payments SET status = 'refunded' WHERE idempotency_key = $1 AND status = 'captured'", [key]);
      },
    },
    inventory: {
      async reserve(key: string, sku: string, quantity: number): Promise<void> {
        await db.transaction(async (tx) => {
          if ((await tx.query("SELECT 1 FROM inventory.reservations WHERE idempotency_key = $1", [key])).rows.length) return;
          const taken = await tx.query("UPDATE inventory.stock SET available = available - $2 WHERE sku = $1 AND available >= $2 RETURNING available", [sku, quantity]);
          if (taken.rows.length === 0) throw new ConflictError(`${sku} is out of stock`);
          await tx.query("INSERT INTO inventory.reservations VALUES ($1, $2, $3, 'reserved')", [key, sku, quantity]);
        });
      },
      async release(key: string): Promise<void> {
        await db.transaction(async (tx) => {
          const { rows } = await tx.query<{ sku: string; quantity: number }>(
            "UPDATE inventory.reservations SET status = 'released' WHERE idempotency_key = $1 AND status = 'reserved' RETURNING sku, quantity", [key]);
          if (rows[0]) await tx.query("UPDATE inventory.stock SET available = available + $2 WHERE sku = $1", [rows[0].sku, rows[0].quantity]);
        });
      },
    },
    shipping: {
      async book(key: string, orderId: string): Promise<void> {
        if (failures.has("courier-down")) throw new ServiceUnavailableError("no courier available");
        await db.query("INSERT INTO shipping.shipments VALUES ($1, $2, 'booked') ON CONFLICT DO NOTHING", [key, orderId]);
      },
      async cancel(key: string): Promise<void> {
        await db.query("UPDATE shipping.shipments SET status = 'cancelled' WHERE idempotency_key = $1", [key]);
      },
    },
  };
}
```

Look at how each operation stays idempotent: the charge checks its key and the primary key on `idempotency_key` stops a duplicate row; the reservation checks its key inside the same transaction as the stock change; the refund and the release only change rows that are still `captured` or `reserved`, so running them twice does nothing the second time.

The orchestrator keeps the saga's progress in the orders database: a `sagas` row with the number of completed steps and a status (`running`, `compensating`, `completed`, `cancelled`). It saves progress after every step, so a new process can `resume()` any saga that was interrupted. It retries transient failures a few times, compensates on business failures or when retries run out, and retries compensations harder, because they must succeed. `crashAt` lets a test kill it at a named point:

orchestrator.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { ServiceUnavailableError, TimeoutError } from "@zudojs/errors";
import type { createServices } from "./services.js";

export interface Order {
  readonly id: string;
  readonly sku: string;
  readonly total_kobo: number;
}

interface Step {
  readonly name: string;
  run(order: Order): Promise<void>;
  undo(order: Order): Promise<void>;
}

export class ProcessCrash extends Error {}

const transient = (error: unknown) => error instanceof ServiceUnavailableError || error instanceof TimeoutError;

export function checkoutSteps(services: ReturnType<typeof createServices>): Step[] {
  const { payments, inventory, shipping } = services;
  return [
    { name: "charge", run: (o) => payments.charge(`${o.id}:charge`, o.id, o.total_kobo), undo: (o) => payments.refund(`${o.id}:charge`) },
    { name: "reserve", run: (o) => inventory.reserve(`${o.id}:reserve`, o.sku, 1), undo: (o) => inventory.release(`${o.id}:reserve`) },
    { name: "ship", run: (o) => shipping.book(`${o.id}:ship`, o.id), undo: (o) => shipping.cancel(`${o.id}:ship`) },
  ];
}

export class Orchestrator {
  constructor(private readonly db: PGlite, private readonly steps: Step[], private readonly log: string[], private readonly crashAt?: string) {}

  async resume(): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>("SELECT id FROM orders.sagas WHERE status IN ('running', 'compensating') ORDER BY id");
    for (const { id } of rows) await this.run(id);
  }

  async run(sagaId: string): Promise<void> {
    const order = (await this.db.query<Order>("SELECT id, sku, total_kobo FROM orders.orders WHERE id = $1", [sagaId])).rows[0]!;
    let { step, status } = (await this.db.query<{ step: number; status: string }>("SELECT step, status FROM orders.sagas WHERE id = $1", [sagaId])).rows[0]!;

    while (status === "running" && step < this.steps.length) {
      const current = this.steps[step]!;
      try {
        await this.attempt(`${current.name}`, () => current.run(order), 3);
      } catch (error) {
        this.log.push(`${current.name} failed: ${(error as Error).message}`);
        status = "compensating";
        await this.save(sagaId, step, status);
        break;
      }
      this.crashPoint(`after ${current.name}`);
      step += 1;
      await this.save(sagaId, step, status);
    }
    if (status === "running") return this.finish(sagaId, "completed", "confirmed");

    while (step > 0) {
      const done = this.steps[step - 1]!;
      await this.attempt(`undo ${done.name}`, () => done.undo(order), 10);
      this.crashPoint(`after undo ${done.name}`);
      step -= 1;
      await this.save(sagaId, step, "compensating");
    }
    await this.finish(sagaId, "cancelled", "cancelled");
  }

  private async attempt(name: string, work: () => Promise<void>, attempts: number): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await work();
        this.log.push(`${name}: ok`);
        return;
      } catch (error) {
        if (!transient(error) || attempt >= attempts) throw error;
        this.log.push(`${name}: ${(error as Error).message}, retrying`);
      }
    }
  }

  private crashPoint(point: string): void {
    if (point === this.crashAt) throw new ProcessCrash(`crashed ${point}`);
  }

  private async save(sagaId: string, step: number, status: string): Promise<void> {
    await this.db.query("UPDATE orders.sagas SET step = $2, status = $3 WHERE id = $1", [sagaId, step, status]);
  }

  private async finish(sagaId: string, sagaStatus: string, orderStatus: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query("UPDATE orders.sagas SET status = $2 WHERE id = $1", [sagaId, sagaStatus]);
      await tx.query("UPDATE orders.orders SET status = $2 WHERE id = $1", [sagaId, orderStatus]);
      await tx.query("INSERT INTO orders.outbox (type, payload) VALUES ($1, $2)", [`order.${orderStatus}`, { orderId: sagaId }]);
    });
    this.log.push(`order ${orderStatus}`);
  }
}
```

The orders service starts a saga the same way it publishes events: in one transaction it creates the order, the saga row and an `order.placed` outbox row. The after-commit hook then runs the saga. If the process dies after the commit but before the hook, nothing is lost: `resume()` at startup finds the `running` saga.

checkout.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { createTransactionManager } from "@zudojs/transactions";
import { pgliteAdapter } from "./db.js";

export async function placeOrder(db: PGlite, orderId: string, sku: string, totalKobo: number, startSaga: (id: string) => Promise<void>): Promise<void> {
  const manager = createTransactionManager({ adapter: pgliteAdapter(db) });
  await manager.run(async (tx) => {
    await db.query("INSERT INTO orders.orders VALUES ($1, $2, $3, 'pending')", [orderId, sku, totalKobo]);
    await db.query("INSERT INTO orders.sagas VALUES ($1, 0, 'running')", [orderId]);
    await db.query("INSERT INTO orders.outbox (type, payload) VALUES ('order.placed', $1)", [{ orderId, sku, totalKobo }]);
    tx.afterCommit(() => startSaga(orderId));
  });
}

/* The whole system's state, read across schemas. Only a test may do this. */
export async function snapshot(db: PGlite, orderId: string): Promise<string> {
  const one = async (sql: string) => (await db.query<{ v: string | number }>(sql, [orderId])).rows[0]?.v ?? "none";
  const order = await one("SELECT status AS v FROM orders.orders WHERE id = $1");
  const payment = await one("SELECT status AS v FROM payments.payments WHERE order_id = $1");
  const shipment = await one("SELECT status AS v FROM shipping.shipments WHERE order_id = $1");
  const lamps = (await db.query<{ v: number }>("SELECT available AS v FROM inventory.stock WHERE sku = 'lamp'")).rows[0]?.v;
  const charges = (await db.query<{ v: number }>("SELECT count(*)::int AS v FROM payments.payments WHERE order_id = $1", [orderId])).rows[0]?.v;
  return `order=${order} payment=${payment} shipment=${shipment} lamps=${lamps} charges=${charges}`;
}
```

One detail of `@zudojs/transactions` matters here. An after-commit callback runs after the data is committed, so the manager does not throw its errors at `placeOrder`'s caller: it reports them to the manager's `hooks.onError` (you saw this in [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions#hooks)). A saga that fails inside the hook therefore fails quietly, which is one more reason the orchestrator must be able to `resume()` from the database: on startup, and on a timer. Run one checkout end to end, then one where the courier service is down:

saga-run.tsNode.js only

```ts
import { placeOrder, snapshot } from "./checkout.js";
import { createDatabase } from "./db.js";
import { checkoutSteps, Orchestrator } from "./orchestrator.js";
import { createServices } from "./services.js";
import type { Failure } from "./services.js";

const db = await createDatabase();
await db.query("INSERT INTO inventory.stock VALUES ('lamp', 5)");

for (const [orderId, failures] of [["ord_1", []], ["ord_2", ["courier-down"]]] as [string, Failure[]][]) {
  const log: string[] = [];
  const orchestrator = new Orchestrator(db, checkoutSteps(createServices(db, new Set(failures))), log);
  await placeOrder(db, orderId, "lamp", 2_500_000, (id) => orchestrator.run(id));
  console.log(`${orderId}: ${log.join(" | ")}`);
  console.log(`  ${await snapshot(db, orderId)}`);
}
await db.close();
```

Output of `npx tsx saga-run.ts`

```ts
ord_1: charge: ok | reserve: ok | ship: ok | order confirmed
  order=confirmed payment=captured shipment=booked lamps=4 charges=1
ord_2: charge: ok | reserve: ok | ship: no courier available, retrying | ship: no courier available, retrying | ship failed: no courier available | undo reserve: ok | undo charge: ok | order cancelled
  order=cancelled payment=refunded shipment=none lamps=4 charges=1
```

The second saga charged the card and reserved a lamp, then tried the courier three times. The failure was transient (`ServiceUnavailableError`), so it was retried; when retries ran out, the saga compensated in reverse: release the lamp, refund the charge, cancel the order. The lamp count went back to 4, and the refund is a visible status, not a deleted row.

## Surviving a failure at every step

This is the course project: an order, payment, inventory and shipping flow that ends consistent whatever fails. "Consistent" has a precise meaning here, an invariant over the four services:

- Either the order is `confirmed`, the payment `captured`, a shipment `booked` and one lamp fewer in stock;
- or the order is `cancelled`, there is no captured payment (none, or refunded), no booked shipment, and the stock is back where it started.

The next example runs every failure the lesson has discussed, each on fresh data, including two crashes of the orchestrator process. The `startSaga` callback catches the simulated crash (it would otherwise be reported to `hooks.onError`, as explained above); then a new orchestrator with no memory of the old one calls `resume()`, exactly what a restarted service does at startup:

every-step.tsNode.js only

```ts
import { placeOrder, snapshot } from "./checkout.js";
import { createDatabase } from "./db.js";
import { checkoutSteps, Orchestrator, ProcessCrash } from "./orchestrator.js";
import { createServices } from "./services.js";
import type { Failure } from "./services.js";

const db = await createDatabase();

const scenarios: [string, Failure[], string?][] = [
  ["happy path", []],
  ["card declined", ["card-declined"]],
  ["out of stock", []],
  ["courier down", ["courier-down"]],
  ["payment answer lost", ["payment-answer-lost"]],
  ["crash after reserve", [], "after reserve"],
  ["crash while undoing", ["courier-down"], "after undo reserve"],
  ["refund fails once", ["courier-down", "refunds-down-once"]],
];

for (const [label, failures, crashAt] of scenarios) {
  await db.exec("TRUNCATE orders.orders, orders.outbox, orders.sagas, payments.payments, inventory.stock, inventory.reservations, shipping.shipments");
  await db.query("INSERT INTO inventory.stock VALUES ('lamp', $1)", [label === "out of stock" ? 0 : 5]);
  const stockBefore = label === "out of stock" ? 0 : 5;

  const log: string[] = [];
  const services = createServices(db, new Set(failures));
  const first = new Orchestrator(db, checkoutSteps(services), log, crashAt);
  const crashed: { error?: ProcessCrash } = {};
  await placeOrder(db, "ord_1", "lamp", 2_500_000, (id) =>
    first.run(id).catch((error: unknown) => {
      if (!(error instanceof ProcessCrash)) throw error;
      crashed.error = error;
    }),
  );
  if (crashed.error) {
    log.push(`** ${crashed.error.message}, restarting **`);
    await new Orchestrator(db, checkoutSteps(services), log).resume();
  }

  const state = await snapshot(db, "ord_1");
  const confirmed = /order=confirmed payment=captured shipment=booked/.test(state) && state.includes(`lamps=${stockBefore - 1} charges=1`);
  const cancelled = /order=cancelled payment=(none|refunded) shipment=(none|cancelled)/.test(state) && state.includes(`lamps=${stockBefore}`);
  console.log(`${label}:`);
  console.log(`  ${log.join(" | ")}`);
  console.log(`  ${state} -> ${confirmed || cancelled ? "consistent" : "INCONSISTENT"}`);
}
await db.close();
```

Output of `npx tsx every-step.ts`

```ts
happy path:
  charge: ok | reserve: ok | ship: ok | order confirmed
  order=confirmed payment=captured shipment=booked lamps=4 charges=1 -> consistent
card declined:
  charge failed: card declined | order cancelled
  order=cancelled payment=none shipment=none lamps=5 charges=0 -> consistent
out of stock:
  charge: ok | reserve failed: lamp is out of stock | undo charge: ok | order cancelled
  order=cancelled payment=refunded shipment=none lamps=0 charges=1 -> consistent
courier down:
  charge: ok | reserve: ok | ship: no courier available, retrying | ship: no courier available, retrying | ship failed: no courier available | undo reserve: ok | undo charge: ok | order cancelled
  order=cancelled payment=refunded shipment=none lamps=5 charges=1 -> consistent
payment answer lost:
  charge: payments did not answer in time, retrying | charge: ok | reserve: ok | ship: ok | order confirmed
  order=confirmed payment=captured shipment=booked lamps=4 charges=1 -> consistent
crash after reserve:
  charge: ok | reserve: ok | ** crashed after reserve, restarting ** | reserve: ok | ship: ok | order confirmed
  order=confirmed payment=captured shipment=booked lamps=4 charges=1 -> consistent
crash while undoing:
  charge: ok | reserve: ok | ship: no courier available, retrying | ship: no courier available, retrying | ship failed: no courier available | undo reserve: ok | ** crashed after undo reserve, restarting ** | undo reserve: ok | undo charge: ok | order cancelled
  order=cancelled payment=refunded shipment=none lamps=5 charges=1 -> consistent
refund fails once:
  charge: ok | reserve: ok | ship: no courier available, retrying | ship: no courier available, retrying | ship failed: no courier available | undo reserve: ok | undo charge: refunds are temporarily unavailable, retrying | undo charge: ok | order cancelled
  order=cancelled payment=refunded shipment=none lamps=5 charges=1 -> consistent
```

Read each row against the invariant:

- **Card declined** is a business failure (`DomainError`), so it is not retried. Nothing had been done yet, so only the order is cancelled.
- **Out of stock** (`ConflictError`) happens after the charge, so the charge is refunded. This is the naive checkout's ₦25,000 bug, now handled.
- **Payment answer lost**: the card was charged, the answer timed out, and the retry with the same key found the existing charge. One charge, confirmed order.
- **Crash after reserve**: the lamp was reserved but the progress was not saved. The new orchestrator ran "reserve" again with the same key, the reservation already existed, and the stock went down by exactly one.
- **Crash while undoing**: the second orchestrator continued the compensation where the first stopped. Releasing twice would be harmless anyway, because `release` only acts on `reserved` rows.
- **Refund fails once**: a compensation hit a 503 and was retried until it worked. A compensation has no "give up" branch.

### Crash it everywhere

Those were the crashes you thought of. A stronger test crashes the orchestrator at *every* point it can crash, for both a successful and a compensating saga, and checks the invariant each time, like the chaos test of [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability):

crash-everywhere.tsNode.js only

```ts
import { placeOrder, snapshot } from "./checkout.js";
import { createDatabase } from "./db.js";
import { checkoutSteps, Orchestrator, ProcessCrash } from "./orchestrator.js";
import { createServices } from "./services.js";
import type { Failure } from "./services.js";

const db = await createDatabase();
const points = ["after charge", "after reserve", "after ship", "after undo ship", "after undo reserve", "after undo charge"];
let runs = 0;
let crashes = 0;
const problems: string[] = [];

for (const failures of [[], ["courier-down"]] as Failure[][]) {
  for (const crashAt of points) {
    await db.exec("TRUNCATE orders.orders, orders.outbox, orders.sagas, payments.payments, inventory.stock, inventory.reservations, shipping.shipments");
    await db.query("INSERT INTO inventory.stock VALUES ('lamp', 5)");
    const services = createServices(db, new Set(failures));
    const log: string[] = [];
    runs++;
    const crashed: { error?: ProcessCrash } = {};
    await placeOrder(db, "ord_1", "lamp", 2_500_000, (id) =>
      new Orchestrator(db, checkoutSteps(services), log, crashAt).run(id).catch((error: unknown) => {
        if (!(error instanceof ProcessCrash)) throw error;
        crashed.error = error;
      }),
    );
    if (crashed.error) {
      crashes++;
      await new Orchestrator(db, checkoutSteps(services), log).resume();
    }
    const state = await snapshot(db, "ord_1");
    const ok = state === "order=confirmed payment=captured shipment=booked lamps=4 charges=1"
      || /^order=cancelled payment=(none|refunded) shipment=(none|cancelled) lamps=5 charges=[01]$/.test(state);
    if (!ok) problems.push(`[${failures.join(",") || "no failure"}] crash ${crashAt}: ${state}`);
  }
}
console.log(`runs: ${runs}, crashes that happened: ${crashes}, inconsistent: ${problems.length}`);
for (const problem of problems) console.log(problem);
await db.close();
```

Output of `npx tsx crash-everywhere.ts`

```ts
runs: 12, crashes that happened: 7, inconsistent: 0
```

A crash point that is never reached (there is no "after undo ship" when the courier booking never succeeded) simply runs to the end, which is why fewer crashes happened than runs. Every run ended consistent. The same loop is how you should test your own sagas: list every point where the process could die, kill it there, restart, and check the invariant. It costs a few seconds of test time and replaces weeks of hoping.

## Production concerns

- **Stuck sagas.** A saga whose row has been `running` or `compensating` for too long needs attention. Store `updated_at` on the saga row, alert on old ones, and let an operator see each saga's step and history. "Where is order 42?" must be one query.
- **One owner per saga.** With several orchestrator instances, two must not run the same saga at once. Claim it (`UPDATE … SET owner = $me, lease_until = now() + interval '30 seconds' WHERE id = $1 AND (owner IS NULL OR lease_until < now())`) and renew the lease while working; idempotent steps make the rare overlap harmless, the lease makes it rare.
- **Timeouts on the whole saga.** A payment authorisation expires after some days; a saga waiting on a slow courier for a week should compensate instead.
- **Outbox housekeeping.** Delete or archive published rows after a retention period, index `published_at IS NULL`, and watch the relay's lag (age of the oldest unpublished row). Publish rows for one order in id order if consumers depend on order.
- **Inbox housekeeping.** Keep inbox rows at least as long as a message can be redelivered (the broker's retention plus replays), then expire them.
- **Compensation design.** Make compensations commutative and always possible where you can: "refund captured payment X" works whatever else happened; "restore stock to 5" does not. Send the customer a clear message when a saga compensates.
- **Workflow engines.** For many long-running sagas, a workflow engine such as Temporal stores the progress, retries and timers for you. The concepts are the ones in this lesson: durable state, idempotent activities, compensations.

## Practice

TRY IT YOURSELF

### Reserve before you charge

Reorder ShopFlow's steps to reserve, charge, ship. Using plain JavaScript, simulate 100 orders where 20% fail at the stock check and 5% have their card declined, and count how many refunds each order of steps causes. Use a seeded sequence so the result is the same every run.

**Show a solution**

step-order.js

```ts
let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const orders = Array.from({ length: 100 }, () => ({ outOfStock: random() < 0.2, declined: random() < 0.05 }));

function run(steps) {
  let refunds = 0;
  let releases = 0;
  for (const order of orders) {
    const done = [];
    for (const step of steps) {
      const fails = (step === "reserve" && order.outOfStock) || (step === "charge" && order.declined);
      if (fails) {
        if (done.includes("charge")) refunds++;
        if (done.includes("reserve")) releases++;
        break;
      }
      done.push(step);
    }
  }
  return `${steps.join(" -> ")}: ${refunds} refunds, ${releases} releases`;
}

console.log(run(["charge", "reserve", "ship"]));
console.log(run(["reserve", "charge", "ship"]));
```

Output of `node step-order.js` and of the browser terminal

```ts
charge -> reserve -> ship: 18 refunds, 0 releases
reserve -> charge -> ship: 0 refunds, 3 releases
```

With the charge first, every out-of-stock order costs a refund: fees, a worried customer, and money that takes days to return. With the reservation first, those orders fail before any money moves, and the only compensation is releasing stock for the few declined cards, which costs nothing and nobody notices. Put the steps that fail most, and are cheapest to undo, first.

TRY IT YOURSELF

### The inbox race in plain JavaScript

PGlite cannot run two deliveries at once, but JavaScript can show the race. Write a consumer that checks `seen.has(id)`, then awaits a 10 ms "database call", then adds the id and charges. Deliver the same message twice at the same time and count the charges. Then fix it by claiming the id *before* the await, the way `INSERT … ON CONFLICT DO NOTHING` claims it in one step.

**Show a solution**

inbox-race.js

```ts
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(label, consume) {
  const state = { seen: new Set(), charges: 0 };
  await Promise.all([consume(state, "msg-1"), consume(state, "msg-1")]);
  console.log(`${label}: ${state.charges} charge(s)`);
}

await run("check, then act", async (state, id) => {
  if (state.seen.has(id)) return;
  await sleep(10);
  state.seen.add(id);
  state.charges++;
});

await run("claim first", async (state, id) => {
  if (state.seen.has(id)) return;
  state.seen.add(id);
  await sleep(10);
  state.charges++;
});
```

Output of `node inbox-race.js` and of the browser terminal

```ts
check, then act: 2 charge(s)
claim first: 1 charge(s)
```

Both deliveries passed the check before either recorded the id, so the card was charged twice. Claiming first makes the check and the record one step with no `await` in between. In a database, "one step" is the unique key: two transactions inserting the same `message_id` cannot both succeed. And the claim must roll back if the charge fails, which is why it lives in the same transaction as the charge.

TRY IT YOURSELF

### Find the stuck sagas

Add an `updated_at timestamptz` column to `orders.sagas` (set by `save`), and write the query an alert would run: every saga still `running` or `compensating` whose last update is older than 10 minutes, oldest first, with its step. Which index helps it?

**Show a solution**

The query: `SELECT id, status, step, now() - updated_at AS stuck_for FROM orders.sagas WHERE status IN ('running', 'compensating') AND updated_at < now() - interval '10 minutes' ORDER BY updated_at`. A partial index keeps it cheap however many completed sagas pile up: `CREATE INDEX sagas_active ON orders.sagas (updated_at) WHERE status IN ('running', 'compensating')`. It only contains the few active sagas, which is exactly what the alert reads. `save` sets `updated_at = now()` in the same `UPDATE` as the step, so the timestamp always describes the last real progress.

## Summary

- There is no transaction across services. Two-phase commit exists, but a coordinator crash leaves participants in doubt with their locks held, every participant must be up at once, and most services (payment APIs, brokers) cannot take part. Between services, use sagas.
- A saga is a sequence of local transactions with compensations that semantically undo finished steps in reverse order. Put steps that fail often and undo cheaply first; after the pivot, the saga only moves forward. Sagas have no isolation, so show intermediate states honestly (pending orders).
- Orchestration keeps the flow and its state in one place and suits checkout; choreography lets services react to events and suits short, loosely coupled reactions.
- The transactional outbox writes messages in the same transaction as the business change, and a relay publishes them: at-least-once delivery. Several relays claim rows with `FOR UPDATE SKIP LOCKED`.
- Consumers must be idempotent: an inbox table with a unique message id, written in the same transaction as the effect, and idempotency keys on every saga step and compensation.
- A durable orchestrator saves progress after every step and resumes after a crash. Compensations are retried until they succeed. Test it by crashing it at every point and checking the invariant across all services.

That completes the distributed systems course. Next, [Production engineering](https://zudojs.oyinlola.site/learn/production-engineering) takes these services to production: configuration, secrets, logs, metrics and operations.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
