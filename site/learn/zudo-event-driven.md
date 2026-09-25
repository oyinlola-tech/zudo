---
title: "Event-driven systems — ZudoJS Academy"
description: "Build an OrderCreated flow whose email, audit and analytics handlers survive retries, duplicates, crashes, dead letters and a v1 to v2 payload change."
source: https://zudojs.oyinlola.site/learn/zudo-event-driven
---

LEVEL 15 · LESSON 4 OF 5

Event-driven and CQRS systems Advanced

# Event-driven systems

Build an OrderCreated flow whose email, audit and analytics handlers survive retries, duplicates, crashes, dead letters and a v1 to v2 payload change.

- **60 min** to read and try
- **You need:** Events, Background jobs, Transactions and Microservices in ZudoJS
- **You build:** A ShopFlow order.created pipeline with an outbox, per-consumer queues, a processed-events table, dead letters and an upcaster, on PGlite

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why an in-process event bus alone loses and duplicates work
- Write an event contract with a version, a payload type and a runtime parser
- Upcast old event versions so handlers only see the latest shape
- Make consumers idempotent with a processed-events table written in the same transaction as the work
- Give each consumer its own queue with retries, and park failures in a dead-letter table you can replay

## One order, three reactions, two bugs

When a customer places an order in ShopFlow, three other parts of the system care: **email** sends a receipt, **audit** writes a line to the audit log that finance reads, and **analytics** adds the order total to today's revenue. You already know the tool for this from [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events): orders publishes `order.created`, and three handlers subscribe. Here is that first version, on a day when the mail provider times out once:

problem.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();
const auditLog: string[] = [];
const revenue = { kobo: 0 };
let mailProviderUp = false;

bus.on("order.created", (event) => {
  const { orderId, email } = event.payload as { orderId: string; email: string };
  if (!mailProviderUp) throw new Error("mail provider timed out");
  console.log(`email: receipt for ${orderId} to ${email}`);
}, { id: "email" });
bus.on("order.created", (event) => {
  auditLog.push((event.payload as { orderId: string }).orderId);
}, { id: "audit" });
bus.on("order.created", (event) => {
  revenue.kobo += (event.payload as { totalKobo: number }).totalKobo;
}, { id: "analytics" });

const order = { orderId: "ORD-1001", email: "ada@shop.ng", totalKobo: 2_500_000 };
const first = await bus.publishEvent({ type: "order.created", payload: order });
console.log("publish resolved, failed handlers:", first.failed);

// Someone notices the missing receipt and publishes the event again.
mailProviderUp = true;
await bus.publishEvent({ type: "order.created", payload: order });
console.log("audit log:", auditLog);
console.log("revenue today: ₦" + (revenue.kobo / 100).toLocaleString("en-NG"));
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
publish resolved, failed handlers: 1
email: receipt for ORD-1001 to ada@shop.ng
audit log: [ 'ORD-1001', 'ORD-1001' ]
revenue today: ₦50,000
```

Ada paid ₦25,000. The report says ₦50,000, and the audit log lists her order twice. Two bugs, each typical:

- **Failures are quiet.** The email handler threw, and `publishEvent` still resolved. That is the bus's default `CONTINUE` error mode: it runs every handler, collects the failures in `result.errors` and never rejects. If nobody reads the result, the receipt is simply never sent.
- **Retrying the event re-runs everything.** Publishing again fixed the email but ran audit and analytics a second time. The handlers were not **idempotent**: running them twice did not have the same effect as running them once.

There is a third bug you cannot see here: if the process crashes after the order is saved but before `publishEvent` runs, all three reactions are lost. This lesson builds the version that survives all of it. It is still one process with PGlite as the database, so every example runs on your computer, but every piece has a direct counterpart in a system that spans many services.

## Before you design the handlers

REASON IT OUT

### What can happen to one order.created event?

Think through these before reading on. Write short answers.

1. The order row is committed, then the process dies. Who will ever publish the event?
2. Can a handler receive the same event twice? From where?
3. The email handler fails. Should analytics run again when email is retried?
4. Some failures never go away, for example a mailbox that does not exist. What should happen to that event, and who finds out?
5. Next month the payload changes shape. Events written last month are still waiting to be delivered. Which code reads them?
6. A handler reads `event.payload.customer.email`. What makes you sure that field exists?

**Show the reasoning**

1. Nobody, unless the event was saved *with* the order, in the same transaction. That is the **outbox**: a table of events to publish, read by a separate loop.
2. Yes. The outbox loop can crash after publishing and before marking the row as sent, so it publishes again. Queues retry jobs whose result they never heard. Brokers redeliver. Every realistic delivery guarantee is **at least once**, so duplicates are normal, not an accident.
3. No. Each consumer needs its own retry state. The fix is a separate queue per consumer, so a failing email is retried alone.
4. It should stop being retried and be parked somewhere visible: a **dead-letter** table that someone is alerted about, with a way to replay it after the cause is fixed.
5. The consumer, when it reads the event. Old versions must be converted to the current shape at read time, by an **upcaster**, because you cannot rewrite what is already in flight.
6. Nothing, unless the payload is parsed against a written **contract**. A TypeScript type on a handler is a claim; data that crossed a queue or a database must be checked.

## The design in one picture

Here is what the rest of the lesson builds. Each box is a few dozen lines of code:

```ts
 placeOrder()                       one database transaction
 ├─ INSERT INTO orders ...          ┐ both rows commit together,
 └─ INSERT INTO outbox ...          ┘ or neither does

 relay()  reads unpublished outbox rows in order
 └─ bus.publishEvent(order.created)            @zudojs/events
    ├─ enqueue for email      ─► queue "order-events.email"      @zudojs/queue
    ├─ enqueue for audit      ─► queue "order-events.audit"      retries + backoff
    └─ enqueue for analytics  ─► queue "order-events.analytics"
                                   │
                                   ▼
               consumer: upcast ─► parse ─► handle once ─► done
                                   │           (processed_events)
                                   └─ gave up ─► dead_letters ─► replay
```

From one committed order to three independent, retried, idempotent reactions.

A few words you will see from now on. The code that emits the event is the **producer** (orders). Each part that reacts is a **consumer**. Sending one event to several consumers is **fan-out**. The in-process bus does the fan-out; the queues make each consumer's work durable within the process and retry it on its own. In production the bus and queues become a message broker (RabbitMQ, Kafka, SQS or a PostgreSQL-backed queue) and the consumers become separate services, but the code shape stays the same.

## Event contracts

An event is a public API. Once orders publishes `order.created`, other teams write code against its payload, and some of that code runs in other processes that are not compiled together with yours. The **contract** of an event is everything a consumer may rely on:

- the **name**, in the past tense: `order.created`;
- the **version** of the payload shape, a number that goes up when the shape changes in a breaking way;
- the **payload** fields and their meaning (amounts in kobo, not naira);
- the **owner**: the orders module. Only it publishes the event, and only it changes the contract.

In code, the contract is a module that orders owns and consumers import. It has the TypeScript type and a **parser**: a function that checks unknown data at runtime and returns it typed, or throws. Events travel as an **envelope**: the payload plus the data about it (id, type, version, correlation id):

contracts.ts

```ts
export interface Envelope {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly payload: unknown;
  readonly correlationId?: string;
}

/** order.created, version 2: owned by the orders module. Amounts are in kobo. */
export interface OrderCreatedV2 {
  readonly orderId: string;
  readonly customer: { readonly email: string; readonly name: string | null };
  readonly totalKobo: number;
  readonly currency: "NGN";
}

export const ORDER_CREATED = "order.created";
export const LATEST_VERSION = 2;

function fail(field: string): never {
  throw new TypeError(`order.created v2: invalid ${field}`);
}

export function parseOrderCreated(payload: unknown): OrderCreatedV2 {
  const p = payload as Partial<OrderCreatedV2> | null;
  if (typeof p?.orderId !== "string" || !p.orderId.startsWith("ORD-")) fail("orderId");
  if (typeof p.customer?.email !== "string" || !p.customer.email.includes("@")) fail("customer.email");
  if (p.customer.name !== null && typeof p.customer.name !== "string") fail("customer.name");
  if (!Number.isSafeInteger(p.totalKobo) || (p.totalKobo ?? 0) <= 0) fail("totalKobo");
  if (p.currency !== "NGN") fail("currency");
  return p as OrderCreatedV2;
}
```

The parser is hand-written here to keep the example small. In a real project you would write it with the schema tools from [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation); the idea is the same.

### A type argument is not a contract

Why not just give the handler a type? Because in `@zudojs/events`, the type argument of `bus.on` is not connected to the event name. You saw this in [Type-safe events](https://zudojs.oyinlola.site/learn/ts-typed-events#zudo); here is what it costs at runtime:

claim.ts

```ts
import { createEventBus } from "@zudojs/events";
import type { Event } from "@zudojs/events";

interface OrderCreated {
  readonly orderId: string;
  readonly customer: { readonly email: string };
}

const bus = createEventBus();
bus.on<Event<OrderCreated>>("payment.failed", (event) => {
  console.log("receipt to", event.payload.customer.email);
}, { id: "receipt" });

const result = await bus.publishEvent({
  type: "payment.failed",
  payload: { orderId: "ORD-1001", reason: "card declined" },
});
console.log("failed:", result.failed, "->", (result.errors[0]?.cause as Error).message);
```

Output of `npx tsx claim.ts` and of the browser terminal

```ts
failed: 1 -> Cannot read properties of undefined (reading 'email')
```

The handler claimed to receive an `OrderCreated` for a `payment.failed` event, and TypeScript believed it. The mistake only showed up as a `TypeError` inside the handler, collected quietly in `result.errors`. A small helper closes that gap: the contract chooses both the event name and the payload type, and the payload is parsed before your handler sees it:

contract-bus.ts

```ts
import type { Event, EventBus, EventSubscription } from "@zudojs/events";

export interface EventContract<P> {
  readonly type: string;
  parse(payload: unknown): P;
}

export function subscribe<P>(
  bus: EventBus,
  contract: EventContract<P>,
  id: string,
  handler: (event: Event<P>) => void | Promise<void>,
): EventSubscription {
  return bus.on(contract.type, (event) => handler({ ...event, payload: contract.parse(event.payload) }), { id });
}
```

typed.ts

```ts
import { createEventBus } from "@zudojs/events";
import { subscribe } from "./contract-bus.js";
import { ORDER_CREATED, parseOrderCreated } from "./contracts.js";

const OrderCreated = { type: ORDER_CREATED, parse: parseOrderCreated };
const bus = createEventBus();

subscribe(bus, OrderCreated, "receipt", (event) => {
  console.log(`receipt to ${event.payload.customer.email}: ₦${event.payload.totalKobo / 100}`);
});

await bus.publishEvent({
  type: "order.created",
  payload: { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" },
});
const bad = await bus.publishEvent({
  type: "order.created",
  payload: { orderId: "ORD-1002", email: "tunde@shop.ng", totalKobo: 900_000 },
});
console.log("rejected:", (bad.errors[0]?.cause as Error).message);
```

Output of `npx tsx typed.ts` and of the browser terminal

```ts
receipt to ada@shop.ng: ₦25000
rejected: order.created v2: invalid customer.email
```

The malformed event now fails with a message that names the contract and the field, before any handler code runs. And the compiler knows the real payload type, so a handler that reads a field the contract does not have is refused:

wrong-field.ts

```ts
import { createEventBus } from "@zudojs/events";
import { subscribe } from "./contract-bus.js";
import { ORDER_CREATED, parseOrderCreated } from "./contracts.js";

const bus = createEventBus();
subscribe(bus, { type: ORDER_CREATED, parse: parseOrderCreated }, "receipt", (event) => {
  console.log(event.payload.email);
});
```

What `npx tsc --noEmit` prints

```ts
wrong-field.ts:7:29 - error TS2339: Property 'email' does not exist on type 'OrderCreatedV2'.

7   console.log(event.payload.email);
                              ~~~~~


Found 1 error in wrong-field.ts:7
```

> TIP
>
> Keep the contract module free of implementation: types, the parser, constants. Consumers import it; they never import the orders module itself. That is the same rule as a module's public API in [the modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith#public-api).

## Versioning: v1 events meet v2 code

ShopFlow's first `order.created` had a flat `email` field. Version 2 moved it into `customer`, added the customer's name and made the currency explicit. That is a **breaking change**: a consumer written for v1 reads `payload.email` and gets `undefined`.

Not every change breaks consumers. The usual rules:

| Change | Breaking? | What to do |
| --- | --- | --- |
| Add an optional field | No | Same version. Consumers ignore fields they do not know (a **tolerant reader**). |
| Add a required field | For consumers of old events, yes | New version, with a default for old events. |
| Rename, move or remove a field | Yes | New version. |
| Change a field's meaning or unit (naira to kobo) | Yes, and dangerous: the type stays the same | New version, or better, a new field name. |

The hard part is time. When you deploy v2, the outbox and the queues may still hold v1 events written a minute ago, and a dead-lettered event may be replayed next week. You cannot rewrite them. So the *reader* converts them: an **upcaster** is a pure function that turns a payload of version *n* into version *n + 1*. The consumer runs the chain until it reaches the latest version, then parses. Handlers only ever see v2:

upcast.ts

```ts
import type { Envelope, OrderCreatedV2 } from "./contracts.js";
import { LATEST_VERSION, parseOrderCreated } from "./contracts.js";

/** order.created version 1, as it was published before the upgrade. */
interface OrderCreatedV1 {
  readonly orderId: string;
  readonly email: string;
  readonly totalKobo: number;
}

const upcasters: Record<number, (payload: unknown) => unknown> = {
  1: (payload) => {
    const v1 = payload as OrderCreatedV1;
    const v2: OrderCreatedV2 = {
      orderId: v1.orderId,
      customer: { email: v1.email, name: null },
      totalKobo: v1.totalKobo,
      currency: "NGN",
    };
    return v2;
  },
};

export function readOrderCreated(envelope: Envelope): OrderCreatedV2 {
  if (envelope.version > LATEST_VERSION) {
    throw new RangeError(`order.created v${envelope.version} is newer than this code (v${LATEST_VERSION})`);
  }
  let payload = envelope.payload;
  for (let version = envelope.version; version < LATEST_VERSION; version++) {
    const upcast = upcasters[version];
    if (!upcast) throw new RangeError(`no upcaster from order.created v${version}`);
    payload = upcast(payload);
  }
  return parseOrderCreated(payload);
}
```

versions.ts

```ts
import type { Envelope } from "./contracts.js";
import { readOrderCreated } from "./upcast.js";

const events: Envelope[] = [
  { id: "evt-ORD-0999", type: "order.created", version: 1,
    payload: { orderId: "ORD-0999", email: "tunde@shop.ng", totalKobo: 900_000 } },
  { id: "evt-ORD-1001", type: "order.created", version: 2,
    payload: { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" } },
  { id: "evt-ORD-1002", type: "order.created", version: 3,
    payload: { orderId: "ORD-1002", customer: { email: "bola@shop.ng", name: "Bola" }, totalKobo: 450_000, currency: "NGN", channel: "app" } },
];

for (const envelope of events) {
  try {
    const order = readOrderCreated(envelope);
    console.log(envelope.id, "->", order.customer.email, order.customer.name, order.currency);
  } catch (error) {
    console.log(envelope.id, "->", (error as Error).message);
  }
}
```

Output of `npx tsx versions.ts` and of the browser terminal

```ts
evt-ORD-0999 -> tunde@shop.ng null NGN
evt-ORD-1001 -> ada@shop.ng Ada NGN
evt-ORD-1002 -> order.created v3 is newer than this code (v2)
```

Three decisions in this code deserve a second look:

- **The upcaster only adds what it can derive.** V1 never recorded the customer's name, so it becomes an explicit `null`, and the v2 contract allows `null`. Making one up ("Customer") would put false data into every report built on these events. `"NGN"` is safe to fill in only because ShopFlow sold in naira alone before v2.
- **A newer version is refused, not guessed.** The v3 event comes from a producer that was deployed before this consumer. Parsing it as v2 might work by luck, or silently drop a field that matters. Throwing makes the job fail and retry; once the new consumer code is deployed, the retry succeeds. Deploy consumers before producers when a version changes.
- **Upcasters are a chain.** When v3 arrives, you add one function for 2 → 3, and v1 events go through both. You never write a v1 → v3 function.

> NOTE
>
> Another approach is to publish both versions for a while (`order.created` v1 and v2 side by side) until every consumer has moved. It suits events that cross team or company boundaries, where you cannot deploy the consumers yourself. Inside one codebase, upcasting on read is simpler.

## The outbox: save the event with the order

You met the **transactional outbox** in [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices#consistency): the event is written to an `outbox` table in the same transaction as the order, and a **relay** publishes unpublished rows later. Here it gets the two details a production system needs: rows are published in the order they were written (`seq`), and a row counts as published only when every subscriber accepted it. The schema holds everything the rest of the lesson uses:

db.ts

```ts
import { PGlite } from "@electric-sql/pglite";

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE orders (id text PRIMARY KEY, email text NOT NULL, total_kobo integer NOT NULL);
    CREATE TABLE outbox (
      seq serial PRIMARY KEY,
      event_id text NOT NULL UNIQUE,
      type text NOT NULL,
      version integer NOT NULL,
      payload jsonb NOT NULL,
      correlation_id text,
      published_at timestamptz
    );
    CREATE TABLE processed_events (
      consumer text NOT NULL,
      event_id text NOT NULL,
      PRIMARY KEY (consumer, event_id)
    );
    CREATE TABLE audit_log (event_id text NOT NULL, line text NOT NULL);
    CREATE TABLE revenue (day text PRIMARY KEY, total_kobo integer NOT NULL);
    CREATE TABLE dead_letters (
      id serial PRIMARY KEY,
      consumer text NOT NULL,
      event_id text NOT NULL,
      attempts integer NOT NULL,
      reason text NOT NULL
    );
  `);
  return db;
}
```

orders.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import type { OrderCreatedV2 } from "./contracts.js";
import { LATEST_VERSION, ORDER_CREATED } from "./contracts.js";

export async function placeOrder(db: PGlite, order: OrderCreatedV2, correlationId: string): Promise<string> {
  const eventId = `evt-${order.orderId}`;
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO orders (id, email, total_kobo) VALUES ($1, $2, $3)",
      [order.orderId, order.customer.email, order.totalKobo]);
    await tx.query(
      "INSERT INTO outbox (event_id, type, version, payload, correlation_id) VALUES ($1, $2, $3, $4, $5)",
      [eventId, ORDER_CREATED, LATEST_VERSION, order, correlationId],
    );
  });
  return eventId;
}
```

The event id is derived from the order id, so it is stable: the same order always produces the same event id, however often the event is delivered. Consumers will use it to recognise duplicates. The version written is `LATEST_VERSION`, the contract's own constant, so the producer cannot write a payload of one shape labelled with another.

Now a crash, and a relay. The process "dies" right after the first commit, before anything is published. The relay in this example publishes to one subscriber that is down for its first call:

outbox.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { createDb } from "./db.js";
import { placeOrder } from "./orders.js";
import type { Envelope } from "./contracts.js";

const db = await createDb();
const bus = createEventBus();
let subscriberUp = false;
bus.on("order.created", (event) => {
  if (!subscriberUp) throw new Error("subscriber unavailable");
  console.log("  delivered", (event.payload as Envelope).id);
}, { id: "enqueue" });

async function relay(): Promise<number> {
  const { rows } = await db.query<{ event_id: string; type: string; version: number; payload: unknown }>(
    "SELECT event_id, type, version, payload FROM outbox WHERE published_at IS NULL ORDER BY seq LIMIT 100",
  );
  let published = 0;
  for (const row of rows) {
    const envelope: Envelope = { id: row.event_id, type: row.type, version: row.version, payload: row.payload };
    const result = await bus.publishEvent({ type: row.type, payload: envelope });
    if (result.failed > 0) break;
    await db.query("UPDATE outbox SET published_at = now() WHERE event_id = $1", [row.event_id]);
    published++;
  }
  return published;
}

await placeOrder(db, { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" }, "req-7f3a");
console.log("process killed before publishing; the order is saved");
await placeOrder(db, { orderId: "ORD-1002", customer: { email: "bola@shop.ng", name: "Bola" }, totalKobo: 450_000, currency: "NGN" }, "req-81c2");

console.log("relay run 1, published:", await relay());
subscriberUp = true;
console.log("relay run 2, published:", await relay());
console.log("relay run 3, published:", await relay());
```

Output of `npx tsx outbox.ts`

```ts
process killed before publishing; the order is saved
relay run 1, published: 0
  delivered evt-ORD-1001
  delivered evt-ORD-1002
relay run 2, published: 2
relay run 3, published: 0
```

The crash cost nothing: the event was in the outbox, and the next relay run found it. When a subscriber failed, the relay did not mark the row and stopped, so the second run published both events in their original order. That is the one place where the `CONTINUE` quirk matters most: `publishEvent` resolved in run 1 even though delivery failed, so the relay *must* check `result.failed`. A relay that only awaits the promise marks undelivered events as published.

> THE RELAY DELIVERS AT LEAST ONCE
>
> If the relay crashes after `publishEvent` and before the `UPDATE`, the next run publishes the same row again. Stopping at the first failure also means events that were already delivered in a batch can be delivered again later. The outbox never loses an event, and in exchange it sometimes delivers one twice. The consumers have to cope, which is the next section.

A real relay runs in a loop, every few hundred milliseconds or when woken after a commit, and only one copy should run per outbox. If you run several application servers, guard the relay with a lock (a PostgreSQL advisory lock, or `SELECT … FOR UPDATE SKIP LOCKED` on the rows) so two servers do not publish the same rows side by side.

## Idempotent consumers: the processed-events table

An idempotent consumer remembers which events it has handled and skips repeats. The memory has to live in the database, next to the data the consumer changes. The obvious version, "check, then work, then remember", has a race:

naive-once.tsNode.js only

```ts
import { createDb } from "./db.js";

const db = await createDb();
await db.query("INSERT INTO revenue (day, total_kobo) VALUES ('2026-09-24', 0)");

async function addRevenue(eventId: string, kobo: number): Promise<string> {
  const seen = await db.query("SELECT 1 FROM processed_events WHERE consumer = 'analytics' AND event_id = $1", [eventId]);
  if (seen.rows.length > 0) return "duplicate";
  await db.query("UPDATE revenue SET total_kobo = total_kobo + $1", [kobo]);
  await db.query("INSERT INTO processed_events (consumer, event_id) VALUES ('analytics', $1)", [eventId]);
  return "done";
}

// The same event, delivered twice at the same moment (a redelivery overlapping a slow first try).
const results = await Promise.allSettled([addRevenue("evt-ORD-1001", 2_500_000), addRevenue("evt-ORD-1001", 2_500_000)]);
console.log(results.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as Error).message)));
console.log((await db.query("SELECT total_kobo FROM revenue")).rows[0]);
```

Output of `npx tsx naive-once.ts`

```json
[
  'done',
  'duplicate key value violates unique constraint "processed_events_pkey"'
]
{ total_kobo: 5000000 }
```

Both deliveries ran the `SELECT` before either had written its row, so both saw "not processed" and both added ₦25,000. The primary key did stop the second `INSERT`, but too late: the revenue had already been added. This is the **check-then-act** race, and it is exactly what happens when a queue retries a job that was only slow, not dead.

The fix is to turn the check and the claim into one atomic step, and to put it in the same transaction as the work:

once.ts

```ts
import type { PGlite, Transaction } from "@electric-sql/pglite";

export type Outcome = "done" | "duplicate" | "parked";

export async function handleOnce(
  db: PGlite,
  consumer: string,
  eventId: string,
  work: (tx: Transaction) => Promise<void>,
): Promise<Outcome> {
  return db.transaction(async (tx) => {
    const claimed = await tx.query(
      "INSERT INTO processed_events (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id",
      [consumer, eventId],
    );
    if (claimed.rows.length === 0) return "duplicate";
    await work(tx);
    return "done";
  });
}
```

- `INSERT … ON CONFLICT DO NOTHING RETURNING` claims the event: it returns a row only for the delivery that actually inserted. The database decides who wins, so there is no gap between checking and claiming.
- The claim and the work commit together. If the work fails, the claim is rolled back too, so a retry is allowed to try again. If both commit, every later delivery is a duplicate.
- The key is `(consumer, event_id)`, not just the event id: audit handling an event says nothing about whether analytics did.

once-safe.tsNode.js only

```ts
import { createDb } from "./db.js";
import { handleOnce } from "./once.js";

const db = await createDb();
await db.query("INSERT INTO revenue (day, total_kobo) VALUES ('2026-09-24', 0)");

const addRevenue = (eventId: string, kobo: number, crash = false) =>
  handleOnce(db, "analytics", eventId, async (tx) => {
    await tx.query("UPDATE revenue SET total_kobo = total_kobo + $1", [kobo]);
    if (crash) throw new Error("process killed halfway");
  });
const revenue = async () => (await db.query<{ total_kobo: number }>("SELECT total_kobo FROM revenue")).rows[0]?.total_kobo;

console.log(await Promise.all([addRevenue("evt-ORD-1001", 2_500_000), addRevenue("evt-ORD-1001", 2_500_000)]));
console.log("revenue:", await revenue());

try {
  await addRevenue("evt-ORD-1002", 450_000, true);
} catch (error) {
  console.log((error as Error).message, "-> revenue:", await revenue());
}
console.log("redelivered:", await addRevenue("evt-ORD-1002", 450_000), "-> revenue:", await revenue());
```

Output of `npx tsx once-safe.ts`

```json
[ 'done', 'duplicate' ]
revenue: 2500000
process killed halfway -> revenue: 2500000
redelivered: done -> revenue: 2950000
```

The concurrent duplicate was skipped. The delivery that crashed halfway left no trace, neither revenue nor claim, so the redelivery did the work exactly once.

### Side effects outside your database

An email cannot be inside a database transaction. If the consumer sends the email and crashes before it records the claim, the retry sends again. There are only two honest answers: accept an occasional duplicate email, or make the *provider* deduplicate. Most email and payment APIs accept an **idempotency key** ([Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency) shows how they store it). Pass the event id: it is the same on every delivery, so the provider drops the repeat for you. The email consumer below does both: it skips events it has recorded, and it sends with the event id as the key for the crash window in between.

## A queue per consumer, retries and dead letters

The relay hands each event to the bus, and the bus fans it out. But the bus has no retries, and a failure in one handler must not re-run the others. So each consumer gets its own queue from [the background jobs lesson](https://zudojs.oyinlola.site/learn/zudo-queue): the bus handler only *enqueues*, which is fast and rarely fails, and the queue runs the consumer with retries, backoff and a dead-letter store. Email being down now affects only email.

### Transient and permanent failures

A timeout is **transient**: the same call may work in a few seconds, so retry it. "This mailbox does not exist" is **permanent**: no retry will ever work, and retrying four times only delays the alert. The queue cannot tell them apart. It has no way to fail a job "without retries", so the consumer decides: on a permanent error it **parks** the event in `dead_letters` itself and returns normally. Everything else it throws, and the queue retries. The fake mail provider reports both kinds with an `ExternalServiceError` from `@zudojs/errors`, whose `serviceCode` says which kind it is:

mailer.ts

```ts
import { ExternalServiceError } from "@zudojs/errors";

export interface Mailer {
  send(message: { key: string; to: string; text: string }): Promise<void>;
}

/** A fake provider: times out on the first `timeouts` calls and deduplicates by key. */
export function fakeMailer(timeouts: number, log: string[]): Mailer {
  const keys = new Set<string>();
  return {
    async send({ key, to, text }) {
      if (timeouts-- > 0) throw new ExternalServiceError("mail provider timed out", { service: "mailer", serviceCode: "TIMEOUT" });
      if (to.endsWith(".invalid")) {
        throw new ExternalServiceError(`mailbox ${to} does not exist`, { service: "mailer", serviceCode: "MAILBOX_NOT_FOUND" });
      }
      if (keys.has(key)) return;
      keys.add(key);
      log.push(`mail to ${to}: ${text}`);
    },
  };
}
```

consumers.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { isExternalServiceError } from "@zudojs/errors";
import type { Envelope } from "./contracts.js";
import type { Mailer } from "./mailer.js";
import { handleOnce } from "./once.js";
import type { Outcome } from "./once.js";
import { readOrderCreated } from "./upcast.js";

export interface Consumer {
  readonly name: string;
  handle(db: PGlite, envelope: Envelope): Promise<Outcome>;
}

export const audit: Consumer = {
  name: "audit",
  handle(db, envelope) {
    const order = readOrderCreated(envelope);
    return handleOnce(db, "audit", envelope.id, async (tx) => {
      await tx.query("INSERT INTO audit_log (event_id, line) VALUES ($1, $2)", [envelope.id, `order ${order.orderId} created`]);
    });
  },
};

export const analytics: Consumer = {
  name: "analytics",
  handle(db, envelope) {
    const order = readOrderCreated(envelope);
    return handleOnce(db, "analytics", envelope.id, async (tx) => {
      await tx.query(
        `INSERT INTO revenue (day, total_kobo) VALUES ('2026-09-24', $1)
         ON CONFLICT (day) DO UPDATE SET total_kobo = revenue.total_kobo + EXCLUDED.total_kobo`,
        [order.totalKobo],
      );
    });
  },
};

const PERMANENT = new Set(["MAILBOX_NOT_FOUND"]);

export function email(mailer: Mailer): Consumer {
  return {
    name: "email",
    async handle(db, envelope) {
      const order = readOrderCreated(envelope);
      const seen = await db.query("SELECT 1 FROM processed_events WHERE consumer = 'email' AND event_id = $1", [envelope.id]);
      if (seen.rows.length > 0) return "duplicate";
      const greeting = order.customer.name ? `Hi ${order.customer.name}` : "Hello";
      try {
        await mailer.send({ key: envelope.id, to: order.customer.email, text: `${greeting}, order ${order.orderId} is confirmed` });
      } catch (error) {
        if (!isExternalServiceError(error) || !PERMANENT.has(String(error.serviceCode))) throw error;
        await db.query("INSERT INTO dead_letters (consumer, event_id, attempts, reason) VALUES ('email', $1, 1, $2)",
          [envelope.id, error.message]);
        return "parked";
      }
      await db.query("INSERT INTO processed_events (consumer, event_id) VALUES ('email', $1) ON CONFLICT DO NOTHING", [envelope.id]);
      return "done";
    },
  };
}
```

Every consumer starts with `readOrderCreated`, so upcasting and parsing happen before any work. A payload that fails the contract throws, is retried a few times (in case the cause was a deploy in progress) and lands in the dead letters.

### The wiring

The queue's own dead-letter store keeps failed jobs in memory. `createInMemoryQueue` accepts any object that implements `DeadLetterStore`, so jobs that exhaust their attempts go to the same `dead_letters` table as parked events. (Only `add` and `remove` matter for this lesson; the table itself is what you query.)

system.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { JobDuplicateError } from "@zudojs/errors";
import { createEventBus } from "@zudojs/events";
import { createFixedBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import type { DeadLetterStore, Queue } from "@zudojs/queue";
import type { Consumer } from "./consumers.js";
import type { Envelope } from "./contracts.js";

function deadLetterTable(db: PGlite, consumer: string): DeadLetterStore<unknown> {
  return {
    async add(dead) {
      await db.query("INSERT INTO dead_letters (consumer, event_id, attempts, reason) VALUES ($1, $2, $3, $4)",
        [consumer, (dead.job.data as Envelope).id, dead.attempts, dead.reason ?? dead.error.message]);
    },
    async get() { return null; },
    async getAll() { return []; },
    async remove() { return false; },
    async clear() {},
  };
}

export function createSystem(db: PGlite, consumers: readonly Consumer[], log: string[]) {
  const bus = createEventBus();
  const queues = new Map<string, Queue<Envelope>>();

  for (const consumer of consumers) {
    const queue = createInMemoryQueue<Envelope>(createQueueName(`order-events.${consumer.name}`), {
      defaultJobOptions: { attempts: 4, backoff: createFixedBackoff(10, { jitter: "none" }) },
      deadLetterStore: deadLetterTable(db, consumer.name),
    });
    queue.process("deliver", async (job, context) => {
      const tag = `${consumer.name} ${job.data.id} try ${context.attemptNumber}`;
      try {
        log.push(`${tag}: ${await consumer.handle(db, job.data)}`);
      } catch (error) {
        log.push(`${tag}: failed, ${(error as Error).message}`);
        throw error;
      }
    });
    queues.set(consumer.name, queue);
    bus.on("order.created", async (event) => {
      const envelope = event.payload as Envelope;
      try {
        await queue.add("deliver", envelope, { deduplicationKey: `${consumer.name}:${envelope.id}` });
      } catch (error) {
        if (!(error instanceof JobDuplicateError)) throw error;
      }
    }, { id: `enqueue-${consumer.name}` });
  }

  async function relay(): Promise<number> {
    const { rows } = await db.query<{ event_id: string; type: string; version: number; payload: unknown; correlation_id: string | null }>(
      "SELECT event_id, type, version, payload, correlation_id FROM outbox WHERE published_at IS NULL ORDER BY seq LIMIT 100",
    );
    let published = 0;
    for (const row of rows) {
      const envelope: Envelope = {
        id: row.event_id, type: row.type, version: row.version, payload: row.payload,
        correlationId: row.correlation_id ?? undefined,
      };
      const result = await bus.publishEvent({ type: row.type, payload: envelope, correlationId: envelope.correlationId });
      if (result.failed > 0) break;
      await db.query("UPDATE outbox SET published_at = now() WHERE event_id = $1", [row.event_id]);
      published++;
    }
    return published;
  }

  async function settle(): Promise<void> {
    for (;;) {
      let busy = 0;
      for (const queue of queues.values()) {
        const stats = await queue.getStats();
        busy += stats.waiting + stats.active + stats.retrying + stats.delayed;
      }
      if (busy === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  async function close(): Promise<void> {
    for (const queue of queues.values()) await queue.close();
  }

  return { bus, relay, settle, close };
}
```

- The `deduplicationKey` stops the same event being queued twice for one consumer while the first job still exists. A duplicate is not an error for the relay, so `JobDuplicateError` is swallowed on purpose; any other enqueue failure makes the relay stop and retry later.
- `settle()` waits until every queue is idle. It exists only so the examples can print a stable result; a server never waits like this.
- The backoff is 10 ms without jitter so the examples finish quickly and print the same thing every run. In production use seconds, exponential growth and full jitter, as the queue lesson explained.

Now the mail provider times out twice. Audit and analytics are not affected, and email is retried on its own:

retries.tsNode.js only

```ts
import { analytics, audit, email } from "./consumers.js";
import { createDb } from "./db.js";
import { fakeMailer } from "./mailer.js";
import { placeOrder } from "./orders.js";
import { createSystem } from "./system.js";

const db = await createDb();
const log: string[] = [];
const system = createSystem(db, [email(fakeMailer(2, log)), audit, analytics], log);

await placeOrder(db, { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" }, "req-7f3a");
console.log("relayed:", await system.relay());
await system.settle();
console.log(log.sort().join("\n"));
await system.close();
```

Output of `npx tsx retries.ts`

```ts
relayed: 1
analytics evt-ORD-1001 try 1: done
audit evt-ORD-1001 try 1: done
email evt-ORD-1001 try 1: failed, mail provider timed out
email evt-ORD-1001 try 2: failed, mail provider timed out
email evt-ORD-1001 try 3: done
mail to ada@shop.ng: Hi Ada, order ORD-1001 is confirmed
```

The log is sorted so the output is the same on every run: the three queues run side by side, and their lines arrive in a different order each time. Email needed three tries; audit and analytics ran once.

### Dead letters and replay

Two worse cases. The mail provider is down for longer than four attempts, and Bola's order has a mailbox that does not exist. The first ends in the queue's dead-letter store after four tries; the second is parked on the first try. Once the provider is back, a **replay** puts the recoverable dead letters back through the pipeline:

dead-letters.tsNode.js only

```ts
import { analytics, audit, email } from "./consumers.js";
import { createDb } from "./db.js";
import { fakeMailer } from "./mailer.js";
import { placeOrder } from "./orders.js";
import { createSystem } from "./system.js";

const db = await createDb();
const log: string[] = [];
const system = createSystem(db, [email(fakeMailer(4, log)), audit, analytics], log);

await placeOrder(db, { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" }, "req-7f3a");
await system.relay();
await system.settle();
await placeOrder(db, { orderId: "ORD-1002", customer: { email: "bola@shop.invalid", name: "Bola" }, totalKobo: 450_000, currency: "NGN" }, "req-81c2");
await system.relay();
await system.settle();
console.log(log.filter((line) => line.startsWith("email")).sort().join("\n"));
console.log((await db.query("SELECT consumer, event_id, attempts, reason FROM dead_letters ORDER BY id")).rows);

async function replay(consumer: string, onlyIf: (reason: string) => boolean): Promise<string[]> {
  const { rows } = await db.query<{ id: number; event_id: string; reason: string }>(
    "SELECT id, event_id, reason FROM dead_letters WHERE consumer = $1 ORDER BY id", [consumer]);
  const replayed: string[] = [];
  for (const row of rows.filter((r) => onlyIf(r.reason))) {
    await db.query("DELETE FROM dead_letters WHERE id = $1", [row.id]);
    await db.query("UPDATE outbox SET published_at = NULL WHERE event_id = $1", [row.event_id]);
    replayed.push(row.event_id);
  }
  return replayed;
}

log.length = 0;
console.log("replaying:", await replay("email", (reason) => reason.includes("timed out")));
await system.relay();
await system.settle();
console.log(log.sort().join("\n"));
console.log("still dead:", (await db.query("SELECT event_id FROM dead_letters")).rows);
await system.close();
```

Output of `npx tsx dead-letters.ts`

```ts
email evt-ORD-1001 try 1: failed, mail provider timed out
email evt-ORD-1001 try 2: failed, mail provider timed out
email evt-ORD-1001 try 3: failed, mail provider timed out
email evt-ORD-1001 try 4: failed, mail provider timed out
email evt-ORD-1002 try 1: parked
[
  {
    consumer: 'email',
    event_id: 'evt-ORD-1001',
    attempts: 4,
    reason: 'mail provider timed out'
  },
  {
    consumer: 'email',
    event_id: 'evt-ORD-1002',
    attempts: 1,
    reason: 'mailbox bola@shop.invalid does not exist'
  }
]
replaying: [ 'evt-ORD-1001' ]
analytics evt-ORD-1001 try 1: duplicate
audit evt-ORD-1001 try 1: duplicate
email evt-ORD-1001 try 1: done
mail to ada@shop.ng: Hi Ada, order ORD-1001 is confirmed
still dead: [ { event_id: 'evt-ORD-1002' } ]
```

Read the replay closely:

- It re-publishes through the outbox by clearing `published_at`, so the event goes through the exact same path as the first time, including the upcaster. A replay tool that calls handlers directly skips the checks you rely on.
- Re-publishing reaches *all* consumers, and audit and analytics answered `duplicate`. That is idempotency paying off: a replay is safe because every consumer ignores what it already did. (A replay that should reach only one consumer can enqueue a job on that consumer's queue instead.)
- Only the dead letters whose reason is transient were replayed. Bola's bad mailbox stays dead: replaying it can never work. It needs a person, who fixes the address with Bola and triggers a new email, for example through a new `order.contact-updated` event.

> A DEAD-LETTER TABLE NOBODY WATCHES IS A BIN
>
> Alert when a dead letter is written, and chart the count. The queue emits `job:dead-lettered` on `queue.events` for exactly this, and a parked row is one `INSERT` you can count. Every dead letter is a customer who did not get something.

## Put it together

One run of the whole system, with everything that went wrong in this lesson happening at once: an old v1 event still waiting in the outbox from before the upgrade, a mail provider that times out twice, an order with a dead mailbox, and a relay that re-publishes an event it already delivered (it crashed before marking the row):

main.tsNode.js only

```ts
import { analytics, audit, email } from "./consumers.js";
import { createDb } from "./db.js";
import { fakeMailer } from "./mailer.js";
import { placeOrder } from "./orders.js";
import { createSystem } from "./system.js";

const db = await createDb();
const log: string[] = [];

await db.query("INSERT INTO outbox (event_id, type, version, payload) VALUES ($1, 'order.created', 1, $2)",
  ["evt-ORD-0999", { orderId: "ORD-0999", email: "tunde@shop.ng", totalKobo: 900_000 }]);

const system = createSystem(db, [email(fakeMailer(2, log)), audit, analytics], log);
await placeOrder(db, { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" }, "req-7f3a");
await placeOrder(db, { orderId: "ORD-1002", customer: { email: "bola@shop.invalid", name: "Bola" }, totalKobo: 450_000, currency: "NGN" }, "req-81c2");

console.log("relayed:", await system.relay());
await system.settle();
await db.query("UPDATE outbox SET published_at = NULL WHERE event_id = 'evt-ORD-1001'");
console.log("relayed again after a crash:", await system.relay());
await system.settle();

console.log(log.filter((line) => line.startsWith("mail to")).sort().join("\n"));
const count = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0]?.n;
console.log("audit rows:", await count("SELECT count(*)::int AS n FROM audit_log"));
console.log("revenue kobo:", await count("SELECT total_kobo AS n FROM revenue"));
console.log("dead letters:", (await db.query("SELECT consumer, event_id FROM dead_letters")).rows);
await system.close();
```

Output of `npx tsx main.ts`

```ts
relayed: 3
relayed again after a crash: 1
mail to ada@shop.ng: Hi Ada, order ORD-1001 is confirmed
mail to tunde@shop.ng: Hello, order ORD-0999 is confirmed
audit rows: 3
revenue kobo: 3850000
dead letters: [ { consumer: 'email', event_id: 'evt-ORD-1002' } ]
```

Three orders, three audit rows, revenue of ₦9,000 + ₦25,000 + ₦4,500 = ₦38,500 counted once each, one receipt per reachable customer (Tunde's v1 event was upcast, and he got "Hello" because v1 never knew his name), and one dead letter with a reason. Compare that with the first example of the lesson.

## Testing an event-driven system

The properties worth testing are the ones this lesson was about. Each is a short test that delivers events on purpose in the bad ways production will:

- **Every consumer is idempotent:** deliver the same envelope twice and check the effect happened once.
- **Every old version still reads:** keep one stored example payload per version (a **fixture**) and check it upcasts and parses. When you add v3, the v1 fixture must still pass.
- **The contract rejects bad data** with a clear message.

event-tests.tsNode.js only

```ts
import { audit } from "./consumers.js";
import type { Envelope } from "./contracts.js";
import { createDb } from "./db.js";
import { readOrderCreated } from "./upcast.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label}${same ? "" : `: got ${JSON.stringify(actual)}`}`);
}

const v1Fixture: Envelope = { id: "evt-ORD-0001", type: "order.created", version: 1,
  payload: { orderId: "ORD-0001", email: "ada@shop.ng", totalKobo: 100_000 } };

check("v1 fixture upcasts", readOrderCreated(v1Fixture).customer, { email: "ada@shop.ng", name: null });

const db = await createDb();
const outcomes = [await audit.handle(db, v1Fixture), await audit.handle(db, v1Fixture)];
const rows = (await db.query("SELECT count(*)::int AS n FROM audit_log")).rows[0];
check("audit is idempotent", { outcomes, rows }, { outcomes: ["done", "duplicate"], rows: { n: 1 } });

const broken: Envelope = { ...v1Fixture, version: 2 };
try {
  readOrderCreated(broken);
  check("a v1 payload labelled v2 is rejected", "accepted", "rejected");
} catch (error) {
  check("a v1 payload labelled v2 is rejected", (error as Error).message, "order.created v2: invalid customer.email");
}
```

Output of `npx tsx event-tests.ts`

```ts
PASS v1 fixture upcasts
PASS audit is idempotent
PASS a v1 payload labelled v2 is rejected
```

With Vitest ([Testing in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-testing)) each `check` becomes an `expect`. Keep the fixtures in files next to the contract and never edit them: they are a record of what was really published.

## In production

- **A real broker or a durable queue.** The in-memory queues lose their jobs when the process stops. The outbox makes that survivable here (unmarked rows are re-published), but in production each consumer's queue should be durable: a broker such as RabbitMQ or Kafka, or a PostgreSQL-backed queue. The consumer code does not change.
- **Ordering is per key, not global.** Once consumers retry independently, `order.cancelled` can be handled before the `order.created` it refers to. Either route all events of one order to the same partition or queue, or make handlers check a version number and ignore stale updates. The next lesson shows the second approach.
- **The processed-events table grows forever** unless you prune it. Keep rows longer than the longest time a duplicate can arrive (your outbox and dead-letter retention), then delete old ones in batches.
- **Contracts need owners and reviews.** A pull request that changes a contract module should be reviewed by the consumer teams. Many teams keep contracts in a shared package, or in a schema registry that refuses incompatible changes. [Contracts between services](https://zudojs.oyinlola.site/learn/dist-contracts) goes further.
- **Follow one event across the system.** The envelope carries the `correlationId` of the request that created the order. Put it on every log line a consumer writes, so "why did Ada get no receipt?" is one search. [The next lesson](https://zudojs.oyinlola.site/learn/zudo-cqrs-system) carries it through commands, queues and projections.
- **Do not use events for everything.** If orders needs an answer ("is this in stock?") it needs a query, not an event. Events are for announcing facts; the flow of a business process spread over many subscribers is harder to follow than one function, so draw it and keep the diagram current.

## Practice

TRY IT YOURSELF

### A loyalty-points consumer

Add a `loyalty` consumer that gives the customer 1 point per ₦100 of the order total, stored in a `points` table keyed by email. It must be idempotent. Deliver one v1 and one v2 event, then deliver the v2 event again, and print the points table.

**Show a solution**

loyalty.tsNode.js only

```ts
import type { Consumer } from "./consumers.js";
import type { Envelope } from "./contracts.js";
import { createDb } from "./db.js";
import { handleOnce } from "./once.js";
import { readOrderCreated } from "./upcast.js";

const loyalty: Consumer = {
  name: "loyalty",
  handle(db, envelope) {
    const order = readOrderCreated(envelope);
    const points = Math.floor(order.totalKobo / 10_000);
    return handleOnce(db, "loyalty", envelope.id, async (tx) => {
      await tx.query(
        `INSERT INTO points (email, points) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET points = points.points + EXCLUDED.points`,
        [order.customer.email, points],
      );
    });
  },
};

const db = await createDb();
await db.exec("CREATE TABLE points (email text PRIMARY KEY, points integer NOT NULL)");
const v1: Envelope = { id: "evt-ORD-0999", type: "order.created", version: 1,
  payload: { orderId: "ORD-0999", email: "ada@shop.ng", totalKobo: 900_050 } };
const v2: Envelope = { id: "evt-ORD-1001", type: "order.created", version: 2,
  payload: { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" } };

for (const envelope of [v1, v2, v2]) console.log(envelope.id, await loyalty.handle(db, envelope));
console.log((await db.query("SELECT email, points FROM points")).rows);
```

Output of `npx tsx loyalty.ts`

```ts
evt-ORD-0999 done
evt-ORD-1001 done
evt-ORD-1001 duplicate
[ { email: 'ada@shop.ng', points: 340 } ]
```

₦9,000.50 gives 90 points (rounded down, so a customer is never given a point they did not earn) and ₦25,000 gives 250. The consumer reads through `readOrderCreated` like every other, so it handles v1 without knowing v1 exists. To wire it in, add it to the list passed to `createSystem`: no producer code changes.

TRY IT YOURSELF

### Version 3: the sales channel

The product team wants to know whether an order came from the web or the app. Design `order.created` v3 with a `channel: "web" | "app" | "unknown"` field. Write the 2 → 3 upcaster. What value does it give old events, and why not `"web"`?

**Show a solution**

v3.ts

```ts
import type { OrderCreatedV2 } from "./contracts.js";

interface OrderCreatedV3 extends OrderCreatedV2 {
  readonly channel: "web" | "app" | "unknown";
}

const upcast2to3 = (payload: unknown): OrderCreatedV3 => ({ ...(payload as OrderCreatedV2), channel: "unknown" });

const old: OrderCreatedV2 = { orderId: "ORD-1001", customer: { email: "ada@shop.ng", name: "Ada" }, totalKobo: 2_500_000, currency: "NGN" };
console.log(upcast2to3(old).channel);
```

Output of `npx tsx v3.ts` and of the browser terminal

```ts
unknown
```

Old events get `"unknown"`: nobody recorded the channel, and most customers may well have used the app. Filling in `"web"` would make every report of "web vs app" wrong for all history. Then: bump `LATEST_VERSION` to 3, add the function to the upcaster chain under key 2, extend the parser, deploy the consumers, and only then deploy the producer that writes v3.

TRY IT YOURSELF

### Transient or permanent?

For each failure, decide whether the consumer should throw (so the queue retries) or park the event: (a) the database connection was reset; (b) the payload fails the contract because `totalKobo` is `-5`; (c) the payment provider answers 429 Too Many Requests; (d) the SMS provider says the phone number is not a valid Nigerian number.

**Show a solution**

(a) Throw: a reset connection usually works on the next try. (b) Park, although it arrives there through a few retries in this lesson's code. A negative total is a bug in the producer, and no retry fixes it; it needs a developer, and the dead letter is the evidence. (c) Throw, with backoff: 429 means "later", and backoff with jitter is exactly the right answer. (d) Park: the number will not become valid by waiting. Tell a person, or the customer, so it can be corrected.

## Recap

- An in-process bus alone loses events on a crash, hides handler failures (`publishEvent` resolves in `CONTINUE` mode) and re-runs every handler when you publish again.
- An event contract names the event, versions the payload, and ships a parser. `bus.on<Event<P>>` is only a claim; let the contract choose the type and parse at the edge.
- Upcasters convert old versions when an event is read, one version step at a time. Fill in only what you can derive, and refuse versions newer than your code.
- The outbox writes the event in the same transaction as the order; the relay publishes rows in order and marks them only when every subscriber accepted.
- Delivery is at least once. Consumers claim `(consumer, event_id)` in a processed-events table with `INSERT … ON CONFLICT DO NOTHING`, in the same transaction as their work. Outside effects use the event id as an idempotency key.
- Each consumer gets its own queue with retries and backoff. Transient failures are retried; permanent ones are parked in a dead-letter table that someone watches, and recoverable dead letters are replayed through the same path.

Next, [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system) puts these pieces behind commands and queries: a write model in a transaction with its outbox, a read model kept up to date by events, and one correlation id followed from the API to the projection.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
