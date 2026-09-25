---
title: "Queues and background jobs — ZudoJS Academy"
description: "Move slow, fragile work out of the request: a job queue with retries, backoff, dead letters, at-least-once delivery, idempotent consumers and an outbox."
source: https://zudojs.oyinlola.site/learn/backend-queues
---

LEVEL 7 · LESSON 14 OF 15

Backend building blocks Core

# Queues and background jobs

Move slow, fragile work out of the request: a job queue with retries, backoff, dead letters, at-least-once delivery, idempotent consumers and an outbox.

- **55 min** to read and try
- **You need:** Caching, Testing strategies, and Joins, grouping and transactions
- **You build:** A typed in-process job queue for a shop - workers, retries with exponential backoff, permanent errors, a dead-letter queue, lease-based redelivery, an idempotent loyalty-points consumer and a transactional outbox on PostgreSQL (PGlite)

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decide which work belongs in a background job, and explain what a queue buys and costs
- Build a queue with workers, leases, retries with exponential backoff and jitter, and a dead-letter queue
- Tell transient errors from permanent ones, and handle poison messages
- Explain at-least-once delivery and make consumers idempotent with a processed-messages table
- Use a transactional outbox so a database write and its message cannot drift apart
- Fan one event out to several independent queues

## The receipt that failed a paid order

A shop's checkout does four things in one request: charge the card, render a PDF invoice, e-mail a receipt and tell the warehouse to pick the items. One evening the e-mail provider has an outage. Watch what the customer experiences:

sync-checkout.ts

```ts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mailer = {
  up: false,
  async sendReceipt(orderId: number): Promise<void> {
    await sleep(30);
    if (!this.up) throw new Error("mail provider: 503 Service Unavailable");
  },
};

async function chargeCard(orderId: number): Promise<void> {
  await sleep(10);
  console.log(`order ${orderId}: card charged ₦20,425`);
}

async function renderInvoicePdf(orderId: number): Promise<void> {
  await sleep(60);
}

async function checkout(orderId: number): Promise<{ status: number; body: string }> {
  try {
    await chargeCard(orderId);
    await renderInvoicePdf(orderId);
    await mailer.sendReceipt(orderId);
    return { status: 201, body: "order placed" };
  } catch (error) {
    return { status: 500, body: error instanceof Error ? error.message : "error" };
  }
}

const started = Date.now();
const response = await checkout(1001);
console.log("customer sees:", response.status, response.body);
console.log("customer waited 100 ms or more:", Date.now() - started >= 100);
```

Output of `npx tsx sync-checkout.ts` and of the browser terminal

```ts
order 1001: card charged ₦20,425
customer sees: 500 mail provider: 503 Service Unavailable
customer waited 100 ms or more: true
```

The card was charged, and the customer got an error. They will probably try again and be charged twice, or call support, or both. Meanwhile every checkout waits for a PDF renderer and a mail server that have nothing to do with taking the money. Two problems, one cause: **work that does not need to happen before the answer is being done during the request**.

The fix is a **queue**. The request does only what the answer depends on (charge the card, save the order), writes a note saying "send a receipt for order 1001", and answers at once. Separate **workers** pick up those notes and do the work, retrying when something is down. This lesson builds that machinery by hand, so you understand every guarantee a queue library or a message broker gives you, and every one it does not.

## Jobs, messages and events

| Word | Meaning | Example |
| --- | --- | --- |
| **Job** (task) | A unit of work for exactly one handler | "send the receipt for order 1001" |
| **Event** | A fact that already happened, which any number of parts may react to | "order 1001 was paid" |
| **Message** | The general word for either, as it travels through a queue | a JSON payload with an id |
| **Producer** | Code that adds messages | the checkout route |
| **Consumer** / worker | Code that takes messages and does the work | the receipt sender |
| **Broker** | The service that stores and hands out messages | RabbitMQ, SQS, Redis, PostgreSQL |
| **Ack** | The consumer's "done, delete it" | `queue.ack(id)` |

A job is an instruction ("do this"); an event is a fact ("this happened"). The difference matters when you add features: a new "send an SMS too" feature subscribes to the existing `order.paid` event without touching the checkout code. You build that fan-out near the end of this lesson; [Events](https://zudojs.oyinlola.site/learn/zudo-events) and [Messaging](https://zudojs.oyinlola.site/learn/zudo-messaging), in the ZudoJS course, show its versions.

REASON IT OUT

### What can go wrong between the request and the worker?

Before building anything, think about a receipt job's whole life. Answer each question:

- The mail provider is down for an hour. What should happen to the 3,000 receipts queued in that hour?
- A worker sends the e-mail, then its server loses power before it tells the queue "done". What does the queue do, and what does the customer get?
- One job has an e-mail address with no `@`. How many times should it be retried?
- The order is saved to the database, and then the queue is unreachable when the checkout tries to add the job. What is lost?
- Can the same job be processed twice? What would that cost for a receipt, and for crediting ₦5,000 of loyalty points?

**Show the reasoning**

**Provider down:** the jobs must wait and be retried, with growing pauses so the provider is not hammered when it comes back. That is **retry with backoff**.

**Worker dies before acking:** the queue cannot know whether the e-mail went out. A queue that never wants to lose work hands the job to another worker after a while, so the customer may get the receipt **twice**. This is **at-least-once delivery**, the guarantee almost every real queue gives. "Exactly once" delivery is not achievable across a network; what you can build is exactly-once *effect*, by making the consumer idempotent.

**Bad address:** once. Retrying cannot fix bad data; it is a **permanent** error. It should go straight to a place where humans look: a **dead-letter queue**. A message that can never succeed is called a **poison message**.

**Saved, then enqueue fails:** the order exists and no receipt will ever be sent. Two systems (the database and the queue) cannot be updated atomically. The fix is to write the message into the database *in the same transaction* as the order: a **transactional outbox**.

**Twice:** for a receipt, a mildly annoyed customer. For loyalty points, real money given away. Consumers with effects that matter must be **idempotent**: processing the same message twice has the same effect as once.

## A job queue with leases

The queue stores jobs with three pieces of state beyond the payload: how many **attempts** were made, when the job may run next (`runAt`, for retries), and until when a worker holds it (`leasedUntil`). The lease is the key idea. A worker that **claims** a job does not remove it; it only hides it for a while (the **visibility timeout**, a name from Amazon SQS). If the worker acks in time, the job is deleted. If the worker dies, the lease runs out and the job becomes visible again.

```ts
enqueue ──▶ waiting ──claim──▶ leased ──ack──▶ (deleted)
              ▲                   │
              │ runAt reached     ├── fail, attempts left ──▶ waiting (runAt = now + backoff)
              │                   ├── fail, no attempts left / permanent ──▶ dead letters
              └── lease expired ──┘   (worker crashed: no ack, no fail)
```

The life of a job. Only an ack removes it; a crash puts it back.

The shop's job types are a TypeScript map from name to payload, so producers and handlers are checked against each other:

src/shop-jobs.ts

```ts
export interface ShopJobs {
  "send-receipt": { readonly orderId: number; readonly email: string };
  "render-invoice": { readonly orderId: number };
}
```

Time comes from the manual clock you built in [Caching](https://zudojs.oyinlola.site/learn/backend-caching#cache-aside), so the demos can jump ahead instead of waiting:

src/clock.ts

```ts
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  private time = 0;

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}
```

The retry delay grows exponentially: 1 s, 2 s, 4 s, 8 s… up to a cap. Pure doubling makes every job that failed at the same moment retry at the same moment too, so the delay also gets **jitter**: here a random amount between half the delay and the full delay. The random function is a parameter, so the demos can pass `() => 1` (always the full delay) and stay predictable:

src/backoff.ts

```ts
export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly random: () => number;
}

export function exponentialBackoff({ baseMs, maxMs, random }: BackoffOptions): (attempt: number) => number {
  return (attempt) => {
    const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  };
}
```

src/job-queue.ts

```ts
import type { Clock } from "./clock.js";

export interface Job<T, K extends keyof T = keyof T> {
  readonly id: string;
  readonly type: K;
  readonly payload: T[K];
  attempts: number;
  runAt: number;
  leasedUntil: number;
  lastError: string | undefined;
}

export interface QueueOptions {
  readonly maxAttempts: number;
  readonly visibilityMs: number;
  readonly backoff: (attempt: number) => number;
}

export class JobQueue<T> {
  private readonly jobs = new Map<string, Job<T>>();
  readonly dead: Job<T>[] = [];
  private nextId = 1;

  constructor(
    private readonly clock: Clock,
    private readonly options: QueueOptions,
  ) {}

  enqueue<K extends keyof T>(type: K, payload: T[K], id = `job-${this.nextId++}`): string {
    if (!this.jobs.has(id)) {
      this.jobs.set(id, { id, type, payload, attempts: 0, runAt: this.clock.now(), leasedUntil: 0, lastError: undefined });
    }
    return id;
  }

  claim(): Job<T> | undefined {
    const now = this.clock.now();
    for (const job of this.jobs.values()) {
      if (job.runAt <= now && job.leasedUntil <= now) {
        job.attempts += 1;
        job.leasedUntil = now + this.options.visibilityMs;
        return job;
      }
    }
    return undefined;
  }

  ack(id: string): void {
    this.jobs.delete(id);
  }

  fail(id: string, error: string, permanent = false): "retry" | "dead" {
    const job = this.jobs.get(id);
    if (job === undefined) return "dead";
    job.lastError = error;
    job.leasedUntil = 0;
    if (permanent || job.attempts >= this.options.maxAttempts) {
      this.jobs.delete(id);
      this.dead.push(job);
      return "dead";
    }
    job.runAt = this.clock.now() + this.options.backoff(job.attempts);
    return "retry";
  }

  get pending(): number {
    return this.jobs.size;
  }
}
```

- `enqueue` takes an optional id and ignores a job whose id is already waiting. A producer that retries its own enqueue (after a timeout, say) then does not create duplicates.
- `claim` counts the attempt when the job is handed out, not when it fails, so a job whose worker crashes still uses up an attempt.
- `fail` decides between a retry and the dead letters. A **permanent** failure goes straight to the dead letters.

The worker takes one job at a time, calls the handler for its type, and acks or fails it. A handler signals "retrying cannot help" by throwing a `PermanentJobError`:

src/worker.ts

```ts
import type { Clock } from "./clock.js";
import type { Job, JobQueue } from "./job-queue.js";

export class PermanentJobError extends Error {
  override readonly name = "PermanentJobError";
}

export type Handlers<T> = { readonly [K in keyof T]: (payload: T[K], job: Job<T, K>) => Promise<void> };

export class Worker<T> {
  constructor(
    private readonly queue: JobQueue<T>,
    private readonly handlers: Handlers<T>,
    private readonly clock: Clock,
    private readonly log: (line: string) => void,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = this.queue.claim();
    if (job === undefined) return false;
    const at = `t=${this.clock.now() / 1_000}s ${String(job.type)} ${job.id} attempt ${job.attempts}`;
    try {
      await this.handle(job);
      this.queue.ack(job.id);
      this.log(`${at}: done`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outcome = this.queue.fail(job.id, message, error instanceof PermanentJobError);
      this.log(`${at}: failed (${message}), ${outcome === "dead" ? "moved to the dead-letter queue" : `retry at t=${job.runAt / 1_000}s`}`);
    }
    return true;
  }

  async drain(): Promise<void> {
    while (await this.runOnce()) {
      /* keep going while jobs are due */
    }
  }

  private handle<K extends keyof T>(job: Job<T, K>): Promise<void> {
    return this.handlers[job.type](job.payload, job);
  }
}
```

## Retries with backoff

Now the evening of the outage, replayed. The mail provider comes back at the 5-second mark. Each loop runs every due job, then moves the clock one second:

retry.ts

```ts
import { exponentialBackoff } from "./src/backoff.js";
import { ManualClock } from "./src/clock.js";
import { JobQueue } from "./src/job-queue.js";
import type { ShopJobs } from "./src/shop-jobs.js";
import { Worker } from "./src/worker.js";

const clock = new ManualClock();
const queue = new JobQueue<ShopJobs>(clock, {
  maxAttempts: 5,
  visibilityMs: 30_000,
  backoff: exponentialBackoff({ baseMs: 1_000, maxMs: 60_000, random: () => 1 }),
});

const mailProviderUpAt = 5_000;
const worker = new Worker<ShopJobs>(queue, {
  "send-receipt": async ({ orderId, email }) => {
    if (clock.now() < mailProviderUpAt) throw new Error("mail provider: 503");
    console.log(`  (receipt for order ${orderId} sent to ${email})`);
  },
  "render-invoice": async ({ orderId }) => {
    console.log(`  (invoice-${orderId}.pdf rendered)`);
  },
}, clock, console.log);

queue.enqueue("send-receipt", { orderId: 1001, email: "ada@example.com" });
queue.enqueue("render-invoice", { orderId: 1001 });

while (queue.pending > 0) {
  await worker.drain();
  clock.advance(1_000);
}
```

Output of `npx tsx retry.ts` and of the browser terminal

```ts
t=0s send-receipt job-1 attempt 1: failed (mail provider: 503), retry at t=1s
  (invoice-1001.pdf rendered)
t=0s render-invoice job-2 attempt 1: done
t=1s send-receipt job-1 attempt 2: failed (mail provider: 503), retry at t=3s
t=3s send-receipt job-1 attempt 3: failed (mail provider: 503), retry at t=7s
  (receipt for order 1001 sent to ada@example.com)
t=7s send-receipt job-1 attempt 4: done
```

The invoice did not wait for the receipt: each job is independent. The receipt failed at 0 s, 1 s and 3 s, with the pause doubling each time, and went out at 7 s, the first attempt after the provider came back. The checkout itself would have answered in milliseconds, long before any of this.

How long should you keep trying? Long enough to ride out a normal outage of the thing you call, short enough that the result is still useful. A receipt five hours late is still worth sending; a one-time login code five minutes late is not. Each job type gets its own `maxAttempts` and cap.

## Poison messages and dead letters

Some jobs will never succeed. Retrying them wastes work, delays the jobs behind them, and hides the problem. Two cases:

dead-letters.ts

```ts
import { exponentialBackoff } from "./src/backoff.js";
import { ManualClock } from "./src/clock.js";
import { JobQueue } from "./src/job-queue.js";
import type { ShopJobs } from "./src/shop-jobs.js";
import { PermanentJobError, Worker } from "./src/worker.js";

const clock = new ManualClock();
const queue = new JobQueue<ShopJobs>(clock, {
  maxAttempts: 4,
  visibilityMs: 30_000,
  backoff: exponentialBackoff({ baseMs: 1_000, maxMs: 60_000, random: () => 1 }),
});

const worker = new Worker<ShopJobs>(queue, {
  "send-receipt": async ({ email }) => {
    if (!email.includes("@")) throw new PermanentJobError(`not an e-mail address: "${email}"`);
    console.log(`  (receipt sent to ${email})`);
  },
  "render-invoice": async ({ orderId }) => {
    throw new Error(`template for order ${orderId} crashed the PDF renderer`);
  },
}, clock, console.log);

queue.enqueue("send-receipt", { orderId: 1002, email: "bola.example.com" });
queue.enqueue("render-invoice", { orderId: 1003 });

for (let second = 0; second < 20 && queue.pending > 0; second++) {
  await worker.drain();
  clock.advance(1_000);
}
console.log("dead letters:", queue.dead.map((job) => `${job.id} after ${job.attempts} attempt(s): ${job.lastError}`));
```

Output of `npx tsx dead-letters.ts` and of the browser terminal

```ts
t=0s send-receipt job-1 attempt 1: failed (not an e-mail address: "bola.example.com"), moved to the dead-letter queue
t=0s render-invoice job-2 attempt 1: failed (template for order 1003 crashed the PDF renderer), retry at t=1s
t=1s render-invoice job-2 attempt 2: failed (template for order 1003 crashed the PDF renderer), retry at t=3s
t=3s render-invoice job-2 attempt 3: failed (template for order 1003 crashed the PDF renderer), retry at t=7s
t=7s render-invoice job-2 attempt 4: failed (template for order 1003 crashed the PDF renderer), moved to the dead-letter queue
dead letters: [
  'job-1 after 1 attempt(s): not an e-mail address: "bola.example.com"',
  'job-2 after 4 attempt(s): template for order 1003 crashed the PDF renderer'
]
```

The bad address was recognised as permanent and moved to the **dead-letter queue** (DLQ) after one attempt. The PDF crash looked transient, so it used all four attempts before landing there too. The DLQ is not a bin: it is an inbox for engineers. Alert when it is not empty, fix the cause (the data or the code), and then **replay** the dead jobs by enqueueing them again.

> TIP
>
> Classify errors where you know the most: in the handler. Validation failures, "not found", and 4xx answers from an API (except 408 and 429) are permanent. Timeouts, connection errors, 5xx answers and 429 are transient. When unsure, treat an error as transient: `maxAttempts` still stops the loop.

## At-least-once delivery

Here is the crash from the reasoning section, step by step. Worker A claims the receipt job, sends the e-mail, and dies before it can ack:

redelivery.ts

```ts
import { ManualClock } from "./src/clock.js";
import { JobQueue } from "./src/job-queue.js";
import type { ShopJobs } from "./src/shop-jobs.js";

const clock = new ManualClock();
const queue = new JobQueue<ShopJobs>(clock, { maxAttempts: 5, visibilityMs: 30_000, backoff: () => 1_000 });
const sent: string[] = [];

queue.enqueue("send-receipt", { orderId: 1001, email: "ada@example.com" });

const first = queue.claim();
sent.push(`receipt for ${first?.payload.orderId}`);
console.log("worker A sent the receipt, then crashed before ack");

clock.advance(10_000);
console.log("after 10s, claimable again?", queue.claim() !== undefined);

clock.advance(20_000);
const second = queue.claim();
console.log("after 30s, delivered again: attempt", second?.attempts);
sent.push(`receipt for ${second?.payload.orderId}`);
queue.ack(second!.id);

console.log("receipts sent:", sent);
```

Output of `npx tsx redelivery.ts` and of the browser terminal

```ts
worker A sent the receipt, then crashed before ack
after 10s, claimable again? false
after 30s, delivered again: attempt 2
receipts sent: [ 'receipt for 1001', 'receipt for 1001' ]
```

For 30 seconds the job was invisible, because worker A might still have been working on it. When the lease ran out, the queue did the only safe thing: handed it out again. The customer got two receipts. The alternative, deleting the job when it is claimed, is **at-most-once** delivery: no duplicates, but every crash silently loses a job. For a receipt or a payment follow-up, losing is worse than repeating.

The visibility timeout must be longer than the slowest normal run of the job. If a PDF takes 40 seconds and the lease is 30, a healthy worker's job is handed to a second worker while the first is still busy, and every PDF is rendered twice. Long jobs extend their lease while they work (a "heartbeat").

## Idempotent consumers

If delivery is at-least-once, correctness must come from the consumer. A consumer is **idempotent** when handling the same message again changes nothing. Some effects are naturally idempotent: "set the order's status to `shipped`" can run twice safely. "Add 204 points" cannot. For those, the consumer remembers which messages it has processed, **in the same transaction as the effect**:

idempotent-consumer.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

interface OrderPaid {
  readonly messageId: string;
  readonly customerId: number;
  readonly amountKobo: number;
}

const db = new PGlite();
await db.exec(`
  CREATE TABLE loyalty (customer_id integer PRIMARY KEY, points integer NOT NULL);
  CREATE TABLE processed_messages (message_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
  INSERT INTO loyalty VALUES (7, 0), (8, 0);`);

const pointsFor = (amountKobo: number) => Math.floor(amountKobo / 10_000);

async function naiveCredit(message: OrderPaid): Promise<string> {
  await db.query("UPDATE loyalty SET points = points + $2 WHERE customer_id = $1", [message.customerId, pointsFor(message.amountKobo)]);
  return "credited";
}

async function idempotentCredit(message: OrderPaid): Promise<string> {
  return db.transaction(async (tx) => {
    const first = await tx.query(
      "INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id",
      [message.messageId],
    );
    if (first.rows.length === 0) return "duplicate, skipped";
    await tx.query("UPDATE loyalty SET points = points + $2 WHERE customer_id = $1", [message.customerId, pointsFor(message.amountKobo)]);
    return "credited";
  });
}

const paid = (customerId: number): OrderPaid => ({ messageId: `order-1001-paid-${customerId}`, customerId, amountKobo: 2_042_500 });

for (let delivery = 1; delivery <= 3; delivery++) {
  console.log(`delivery ${delivery}: naive ${await naiveCredit(paid(7))}, idempotent ${await idempotentCredit(paid(8))}`);
}
console.log((await db.query("SELECT customer_id, points FROM loyalty ORDER BY customer_id")).rows);
await db.close();
```

Output of `npx tsx idempotent-consumer.ts`

```ts
delivery 1: naive credited, idempotent credited
delivery 2: naive credited, idempotent duplicate, skipped
delivery 3: naive credited, idempotent duplicate, skipped
[ { customer_id: 7, points: 612 }, { customer_id: 8, points: 204 } ]
```

The same `order.paid` message arrived three times, as redeliveries do. The naive consumer gave customer 7 three times the points; the idempotent one credited customer 8 once. The trick is `INSERT … ON CONFLICT DO NOTHING RETURNING`: the primary key on `message_id` lets exactly one delivery insert the row, and the others get no row back and skip.

Why the transaction matters: if the record were written after the points, a crash in between would credit the points and forget that it did, and the next delivery would credit again. If it were written before, in a separate step, a crash would record the message as done without crediting it. Inside one transaction, both happen or neither does.

When the effect is in another system (an e-mail provider, a payment API), you cannot share a transaction. Then pass the message id as that system's **idempotency key** (as the payment gateway in [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies#contracts) did with its reference), so the provider itself ignores the repeat. [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency) treats the whole subject in depth.

## The transactional outbox

One gap is left, at the producer. The checkout saves the order in PostgreSQL and then adds a job to the queue. Those are two different systems, and no transaction spans both. If the queue is unreachable at that moment, the order exists and the job never will.

The **outbox** pattern closes the gap with the one system that does have transactions. The checkout writes the order *and* a row in an `outbox` table, in one transaction. A separate **relay** reads unsent outbox rows, publishes them to the queue, and marks them sent. If publishing fails, the relay's transaction rolls back and the rows are tried again on the next run:

outbox.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

import { ManualClock } from "./src/clock.js";
import { JobQueue } from "./src/job-queue.js";
import type { ShopJobs } from "./src/shop-jobs.js";

const db = new PGlite();
await db.exec(`
  CREATE TABLE orders (id integer PRIMARY KEY, email text NOT NULL, total_kobo integer NOT NULL);
  CREATE TABLE outbox (
    id serial PRIMARY KEY,
    type text NOT NULL,
    payload jsonb NOT NULL,
    sent_at timestamptz
  );`);

const queue = new JobQueue<ShopJobs>(new ManualClock(), { maxAttempts: 5, visibilityMs: 30_000, backoff: () => 1_000 });
let queueIsUp = false;
function publish(type: "send-receipt", payload: ShopJobs["send-receipt"], id: string): void {
  if (!queueIsUp) throw new Error("queue unreachable");
  queue.enqueue(type, payload, id);
}

async function placeOrderNaive(id: number, email: string): Promise<void> {
  await db.query("INSERT INTO orders VALUES ($1, $2, 2042500)", [id, email]);
  publish("send-receipt", { orderId: id, email }, `order-${id}-receipt`);
}

async function placeOrderWithOutbox(id: number, email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO orders VALUES ($1, $2, 2042500)", [id, email]);
    await tx.query("INSERT INTO outbox (type, payload) VALUES ('send-receipt', $1)", [JSON.stringify({ orderId: id, email })]);
  });
}

async function relayOutbox(): Promise<number> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number; payload: ShopJobs["send-receipt"] }>(
      "SELECT id, payload FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED",
    );
    for (const row of rows) publish("send-receipt", row.payload, `outbox-${row.id}`);
    await tx.query("UPDATE outbox SET sent_at = now() WHERE id = ANY($1)", [rows.map((row) => row.id)]);
    return rows.length;
  });
}

try {
  await placeOrderNaive(1001, "ada@example.com");
} catch (error) {
  console.log("naive: order saved, then", error instanceof Error ? error.message : error);
}
await placeOrderWithOutbox(1002, "bola@example.com");
console.log("outbox: order and message saved together");

try {
  await relayOutbox();
} catch (error) {
  console.log("relay run 1:", error instanceof Error ? error.message : error, "(nothing marked as sent)");
}
queueIsUp = true;
console.log("relay run 2: published", await relayOutbox());
console.log("relay run 3: published", await relayOutbox());

console.log("orders:", (await db.query<{ id: number }>("SELECT id FROM orders ORDER BY id")).rows.map((row) => row.id));
const waiting = queue.claim();
console.log("jobs in the queue:", queue.pending, "- for order", waiting?.payload.orderId);
await db.close();
```

Output of `npx tsx outbox.ts`

```ts
naive: order saved, then queue unreachable
outbox: order and message saved together
relay run 1: queue unreachable (nothing marked as sent)
relay run 2: published 1
relay run 3: published 0
orders: [ 1001, 1002 ]
jobs in the queue: 1 - for order 1002
```

Order 1001 took the naive path: it is saved, but its receipt job was lost with the error. Order 1002 used the outbox: the first relay run failed and marked nothing, the second published it, the third found nothing left. The one job in the queue is order 1002's receipt.

- **`FOR UPDATE SKIP LOCKED`** lets several relay processes run at once: each locks the rows it takes, and the others skip locked rows instead of waiting for them or sending them twice. The same query turns any PostgreSQL table into a simple job queue, which is often all a small system needs.
- **The relay is at-least-once too.** If it publishes and crashes before its commit, the rows are published again next time. That is why it uses `outbox-${id}` as the job id, so the queue ignores the repeat, and why consumers are idempotent anyway.
- **Clean up.** Sent rows pile up; delete or archive them after a few days.

## One event, many queues

When an order is paid, three teams care: e-mail, the warehouse and loyalty. Publishing one `order.paid` event that is copied into one queue per subscriber is called **fan-out** (or publish/subscribe). Each subscriber has its own queue, so a slow warehouse cannot delay receipts, and a failing loyalty consumer retries on its own:

fan-out.ts

```ts
import { ManualClock } from "./src/clock.js";
import { JobQueue } from "./src/job-queue.js";

interface OrderPaid {
  readonly orderId: number;
  readonly customerId: number;
  readonly amountKobo: number;
}

const clock = new ManualClock();
const options = { maxAttempts: 5, visibilityMs: 30_000, backoff: () => 1_000 };
const email = new JobQueue<{ "send-receipt": OrderPaid }>(clock, options);
const warehouse = new JobQueue<{ "pick-items": OrderPaid }>(clock, options);
const loyalty = new JobQueue<{ "credit-points": OrderPaid }>(clock, options);

type Subscriber = (event: OrderPaid, eventId: string) => void;
const subscribers: Subscriber[] = [
  (event, id) => email.enqueue("send-receipt", event, `${id}:email`),
  (event, id) => warehouse.enqueue("pick-items", event, `${id}:warehouse`),
  (event, id) => loyalty.enqueue("credit-points", event, `${id}:loyalty`),
];

function publishOrderPaid(event: OrderPaid): void {
  const eventId = `order-${event.orderId}-paid`;
  for (const subscriber of subscribers) subscriber(event, eventId);
}

publishOrderPaid({ orderId: 1001, customerId: 7, amountKobo: 2_042_500 });
publishOrderPaid({ orderId: 1001, customerId: 7, amountKobo: 2_042_500 });

console.log("email:", email.pending, "warehouse:", warehouse.pending, "loyalty:", loyalty.pending);
```

Output of `npx tsx fan-out.ts` and of the browser terminal

```ts
email: 1 warehouse: 1 loyalty: 1
```

The event was published twice (a producer retry), but each queue holds one job, because every copy has a job id derived from the event id. Compare this with the in-process `EventEmitter` from [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#emitter): its listeners run inside the request's process, so a crash or a throwing listener loses the event. Durable queues per subscriber are what make events survive failures.

A word on **ordering**. With retries and several workers, jobs do not finish in the order they were added: a retried job overtakes nothing, and everything overtakes it. Design consumers so order does not matter (the loyalty credit does not care), or carry a version and ignore older updates. Brokers that promise order (Kafka partitions, SQS FIFO queues) do so only per key, and at the cost of throughput.

## Testing queues

Queues are all about time and failure, so the tests control both: the manual clock for time, and direct calls to `claim`, `fail` and `ack` for failure. Each test pins one promise the queue makes:

tests/job-queue.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exponentialBackoff } from "../src/backoff.js";
import { ManualClock } from "../src/clock.js";
import { JobQueue } from "../src/job-queue.js";

type Jobs = { "send-receipt": { orderId: number } };

function setup(maxAttempts = 3) {
  const clock = new ManualClock();
  const backoff = exponentialBackoff({ baseMs: 1_000, maxMs: 4_000, random: () => 1 });
  const queue = new JobQueue<Jobs>(clock, { maxAttempts, visibilityMs: 30_000, backoff });
  return { clock, queue, backoff };
}

describe("JobQueue", () => {
  it("doubles the backoff and caps it", () => {
    const { backoff } = setup();
    assert.deepEqual([1, 2, 3, 4, 5].map(backoff), [1_000, 2_000, 4_000, 4_000, 4_000]);
  });

  it("does not hand out a job before its retry time", () => {
    const { clock, queue } = setup();
    const id = queue.enqueue("send-receipt", { orderId: 1 });
    queue.fail(queue.claim()!.id, "503");
    assert.equal(queue.claim(), undefined);
    clock.advance(1_000);
    assert.equal(queue.claim()?.id, id);
  });

  it("moves a job to the dead letters after the last attempt", () => {
    const { clock, queue } = setup(2);
    queue.enqueue("send-receipt", { orderId: 1 });
    assert.equal(queue.fail(queue.claim()!.id, "503"), "retry");
    clock.advance(1_000);
    assert.equal(queue.fail(queue.claim()!.id, "503"), "dead");
    assert.equal(queue.pending, 0);
    assert.equal(queue.dead[0]?.attempts, 2);
  });

  it("redelivers a job whose worker never acked", () => {
    const { clock, queue } = setup();
    queue.enqueue("send-receipt", { orderId: 1 });
    queue.claim();
    clock.advance(29_999);
    assert.equal(queue.claim(), undefined);
    clock.advance(1);
    assert.equal(queue.claim()?.attempts, 2);
  });

  it("ignores a second enqueue with the same id", () => {
    const { queue } = setup();
    queue.enqueue("send-receipt", { orderId: 1 }, "order-1-receipt");
    queue.enqueue("send-receipt", { orderId: 1 }, "order-1-receipt");
    assert.equal(queue.pending, 1);
  });
});
```

Output of `npx tsx tests/job-queue.test.ts`

```ts
▶ JobQueue
  ✔ doubles the backoff and caps it (9.66007ms)
  ✔ does not hand out a job before its retry time (0.845959ms)
  ✔ moves a job to the dead letters after the last attempt (0.633695ms)
  ✔ redelivers a job whose worker never acked (0.664167ms)
  ✔ ignores a second enqueue with the same id (0.353204ms)
✔ JobQueue (18.511433ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 260.473481
```

The lease test checks the exact boundary: at 29,999 ms the job is still invisible, at 30,000 ms it is back. For handlers, test the idempotency directly, as the loyalty example did: deliver the same message two or three times and assert the effect happened once. That single test catches the most expensive queue bug there is.

## Production concerns

This in-process queue loses everything when the process restarts, so it is for learning and for small, unimportant work. Production queues keep jobs in a durable broker:

| Option | Good for | Keep in mind |
| --- | --- | --- |
| PostgreSQL table with `SKIP LOCKED` | Small and medium systems that already have PostgreSQL; jobs in the same transaction as data | Polling load on the database; clean up old rows |
| Redis-based libraries (BullMQ and similar) | Many jobs per second, delays, repeats, rate limits | Configure Redis persistence, or jobs vanish on a restart |
| RabbitMQ, Amazon SQS | Classic work queues and fan-out between services | At-least-once; dead-letter queues are built in |
| Kafka and other logs | Event streams many consumers read, replay, ordered per key | More moving parts; consumers track their own position |

- **Watch the queue.** The key metrics are the number of waiting jobs, the **age of the oldest job** (the delay customers feel), the failure rate and the size of the dead-letter queue. A growing backlog means consumers are too few or too slow.
- **Shut down gracefully.** On `SIGTERM`, stop claiming new jobs, finish or give back the current ones, then exit ([Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#signals) built this). Jobs cut off halfway come back after their lease anyway, which is one more reason for idempotent handlers.
- **Keep payloads small and safe.** Put ids in messages, not whole objects: the consumer loads fresh data, and messages do not carry stale copies. Do not put passwords, card numbers or tokens in payloads; queues are logged and inspected.
- **Validate payloads in the consumer.** A message is outside data for the consumer, just like a request body, even when your own code produced it: it may come from an older version of the producer.

Everything here (typed jobs, workers, retries, backoff, dead letters, idempotency) is what [Background jobs](https://zudojs.oyinlola.site/learn/zudo-queue), in the ZudoJS course, packages in `@zudojs/queue`, and [Scheduled tasks](https://zudojs.oyinlola.site/learn/zudo-scheduler) adds jobs that run on a timetable.

## Practice

TRY IT YOURSELF

### Full jitter

Another popular strategy is "full jitter": a random delay between 0 and the capped exponential delay. Write `fullJitter({ baseMs, maxMs, random })` in the same shape as `exponentialBackoff`, and print the delays for attempts 1 to 6 with `random` returning 0, 0.5 and 1.

**Show a solution**

full-jitter.ts

```ts
import type { BackoffOptions } from "./src/backoff.js";

function fullJitter({ baseMs, maxMs, random }: BackoffOptions): (attempt: number) => number {
  return (attempt) => Math.round(random() * Math.min(maxMs, baseMs * 2 ** (attempt - 1)));
}

const attempts = [1, 2, 3, 4, 5, 6];
for (const value of [0, 0.5, 1]) {
  const delays = attempts.map(fullJitter({ baseMs: 1_000, maxMs: 20_000, random: () => value }));
  console.log(`random ${value}:`, delays.join(", "));
}
```

Output of `npx tsx full-jitter.ts` and of the browser terminal

```ts
random 0: 0, 0, 0, 0, 0, 0
random 0.5: 500, 1000, 2000, 4000, 8000, 10000
random 1: 1000, 2000, 4000, 8000, 16000, 20000
```

Full jitter spreads retries the most, which is kindest to a service that is recovering, at the cost of sometimes retrying almost at once. The cap (20 s here) keeps the sixth attempt from waiting 32 s.

TRY IT YOURSELF

### An idempotent SMS consumer

Write a consumer that sends an order-shipped SMS. It must send at most one SMS per message id, even when the message is delivered three times. Keep the processed ids in a `Set`, and record the id only **after** the provider accepted the SMS. What happens if the process crashes between sending and recording?

**Show a solution**

sms-consumer.ts

```ts
const processed = new Set<string>();
const sent: string[] = [];

async function sendSms(to: string, text: string): Promise<void> {
  sent.push(`${to}: ${text}`);
}

async function onOrderShipped(message: { id: string; phone: string; orderId: number }): Promise<string> {
  if (processed.has(message.id)) return "duplicate, skipped";
  await sendSms(message.phone, `Order ${message.orderId} is on its way`);
  processed.add(message.id);
  return "sent";
}

const message = { id: "order-1001-shipped", phone: "+2348031234567", orderId: 1001 };
for (let delivery = 1; delivery <= 3; delivery++) console.log(`delivery ${delivery}:`, await onOrderShipped(message));
console.log(sent);
```

Output of `npx tsx sms-consumer.ts` and of the browser terminal

```ts
delivery 1: sent
delivery 2: duplicate, skipped
delivery 3: duplicate, skipped
[ '+2348031234567: Order 1001 is on its way' ]
```

If the process crashes after `sendSms` and before `processed.add`, the next delivery sends a second SMS. You cannot put an SMS and a database row in one transaction, so the gap cannot be closed from your side alone. Pass the message id to the SMS provider as an idempotency key if it supports one; otherwise accept a rare duplicate SMS, which is far better than a lost one. (A `Set` in memory is also forgotten on restart: in production the processed ids live in the database, with a primary key.)

TRY IT YOURSELF

### Pick the guarantee

For each job, choose at-most-once or at-least-once delivery, and say what the consumer must do: (a) crediting ₦5,000 to a seller's wallet after a sale; (b) updating a "customers online now" counter on a dashboard; (c) e-mailing a password-reset link; (d) telling the warehouse to pick an order.

**Show a solution**

(a) At-least-once with an idempotent consumer: a lost credit is money owed, a double credit is money lost, so dedupe by message id in the same transaction as the wallet update. (b) At-most-once is fine: a missed update is corrected by the next one seconds later. (c) At-least-once: a lost link locks the user out; a duplicate is harmless if the link is single-use. (d) At-least-once with an idempotent consumer, keyed by order id: picking twice ships two parcels.

## Recap

- Put work in a queue when the answer does not depend on it, or when it is slow or calls something unreliable. The request stays fast, and failures are retried instead of shown to the customer.
- Workers claim jobs with a lease. Only an ack deletes a job; a crash puts it back when the lease ends. That is at-least-once delivery, and duplicates are part of the deal.
- Retry transient errors with exponential backoff, a cap and jitter. Send permanent errors and exhausted jobs to a dead-letter queue, and watch it.
- Make consumers idempotent: record processed message ids in the same transaction as the effect, or pass the id as an idempotency key to other systems.
- Use a transactional outbox so a database change and its message commit together; a relay with `FOR UPDATE SKIP LOCKED` publishes them.
- Fan events out into one queue per subscriber, give every copy a derived id, and do not rely on order.

Next: [File uploads and storage](https://zudojs.oyinlola.site/learn/backend-files), the last building block: files that are too big for a JSON body and too valuable to lose.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
