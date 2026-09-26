---
title: "Use case: a payment system — ZudoJS Academy"
description: "Build Oja Market's card payments: idempotent requests, a gateway adapter with timeouts and retries, an outbox, events, a notification queue, and failure tests."
source: https://zudojs.oyinlola.site/learn/usecase-payments
---

LEVEL 19 · LESSON 3 OF 10

Real-world use cases Production

# Use case: a payment system

Build Oja Market's card payments: idempotent requests, a gateway adapter with timeouts and retries, an outbox, events, a notification queue, and failure tests.

- **60 min** to read and try
- **You need:** Use case: a REST API, Use case: an authentication platform, and Idempotency and safe retries
- **You build:** Oja Market's payment service: POST /v1/payments on PostgreSQL, a PayGate adapter behind @zudojs/adapters, a transactional outbox feeding @zudojs/events and @zudojs/queue, SMS receipts, a reconciliation job, and tests for double submission, timeouts and partial failure

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Reason through every way a payment request can fail or repeat before writing it
- Make payment creation idempotent per user with keys, request fingerprints and database constraints
- Wrap a card gateway in an adapter that retries safely and reports "unknown" instead of guessing
- Move from payment to event to queue to notification with a transactional outbox and idempotent consumers
- Settle uncertain payments by reconciliation instead of charging again
- Test double submission, provider timeouts and partial failure

## The brief: take the money exactly once

[Oja Market's API](https://zudojs.oyinlola.site/learn/usecase-rest-api) creates orders. Now customers must pay for them by card, through a gateway called **PayGate**. Before writing a line, the team collected what went wrong at other shops that did this in a hurry:

1. A customer tapped "Pay" twice on a slow network and was charged twice.
2. The gateway took 40 seconds to answer. The shop marked the payment failed, the customer paid again, and both charges went through.
3. The server crashed right after the gateway charged the card. The order stayed unpaid, the customer was charged, and nobody noticed for a week.
4. A retry of the notification job sent the same "payment received" SMS three times.
5. A customer changed the amount in the request from ₦12,500 to ₦125, and the shop charged ₦125.

The brief for Oja's payment service:

| Area | Requirement |
| --- | --- |
| Paying | `POST /v1/payments` pays one of the caller's orders with a card token. The amount always comes from the order. |
| Repeats | A repeated request never charges twice: the same request is answered with the same result, and an order can have only one live payment. |
| The gateway | Timeouts, 5xx answers and lost answers are expected. A payment is never marked failed because we did not hear back. |
| After the payment | A `payment.succeeded` or `payment.declined` event, then an SMS to the customer through a queue, exactly one per payment even when jobs are retried. |
| Recovery | A reconciliation job settles every payment whose outcome we do not know, by asking the gateway. |

The ideas come from [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency) (keys, fingerprints, "exactly once" as at-least-once plus idempotency) and [event-driven applications](https://zudojs.oyinlola.site/learn/zudo-event-driven). The tools are [@zudojs/adapters](https://zudojs.oyinlola.site/learn/zudo-adapters), [@zudojs/events](https://zudojs.oyinlola.site/learn/zudo-events), [@zudojs/queue](https://zudojs.oyinlola.site/learn/zudo-queue) and [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database). This lesson puts them together into one system and shows it surviving each failure.

## Think before you take money

REASON IT OUT

### Where can a payment go wrong?

Follow one payment from the tap on "Pay" to the SMS. At every step ask: can this arrive twice? Can it fail halfway? What if the answer never comes? What does the client send that we must not trust?

**Show the reasoning**

- **The request arrives twice** (double tap, app retry, proxy retry). The client sends an `Idempotency-Key`, one per intent; the server stores it with the payment, scoped to the user, with a fingerprint of the request. A repeat gets the stored result. A different request under the same key is a client bug: 422.
- **Two different keys for one order** (an app bug, or two devices). A database rule allows one live payment per order. The second gets 409.
- **The client sends the amount**. Never use it. Load the order, check that it belongs to the caller and is unpaid, and charge its total (incident 5).
- **The gateway call fails.** A 402 decline is an answer: the payment is declined. A 5xx, a timeout or a dropped connection is *not* an answer: the card may or may not have been charged. Retry with the same key to the gateway, so the gateway charges at most once; if still nothing, record the payment as `unknown` and answer 202 (incident 2).
- **We crash after the charge** but before recording it. The payment row says `processing`. A reconciliation job asks the gateway by our reference and settles it (incident 3). A client retry does the same.
- **The SMS** must not be sent for a payment that was rolled back, must not be lost when we crash after committing, and must not be sent twice when the job is retried (incident 4). The event goes into an **outbox** table in the same transaction as the payment's new status; a relay publishes it; the queue deduplicates by payment; the worker checks, sends with a key, and records.

```ts
 POST /v1/payments  (Idempotency-Key)
   │
   ▼
 transaction 1: check order ─ insert payment "processing" (key, fingerprint, amount from the order)
   │
   ▼
 PayGate adapter ── POST /v1/charges (Idempotency-Key: oja-pay-<id>), timeout, retries
   │        succeeded / declined / unknown
   ▼
 transaction 2: set status ─ mark order paid ─ insert outbox row "payment.succeeded"
   │
   ▼ after commit
 outbox relay ──▶ event bus ──▶ queue job "notify" (one per payment) ──▶ worker ──▶ SMS
                                                                              │
 reconciliation job: payments still "processing" or "unknown" ──▶ PayGate lookup ──▶ transaction 2
```

One payment's path. Every arrow can fail; each step is either one transaction or safe to repeat.

## The tables

schema.ts

```ts
export const SCHEMA = [
  `CREATE TABLE orders (
     id serial PRIMARY KEY,
     user_id integer NOT NULL,
     total_kobo integer NOT NULL CHECK (total_kobo > 0),
     status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')))`,
  `CREATE TABLE payments (
     id serial PRIMARY KEY,
     user_id integer NOT NULL,
     order_id integer NOT NULL REFERENCES orders (id),
     amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
     status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'declined', 'unknown')),
     idempotency_key text NOT NULL,
     request_hash text NOT NULL,
     gateway_charge_id text,
     decline_reason text,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (user_id, idempotency_key))`,
  `CREATE UNIQUE INDEX one_live_payment_per_order ON payments (order_id) WHERE status <> 'declined'`,
  `CREATE TABLE outbox (
     id serial PRIMARY KEY,
     type text NOT NULL,
     payload jsonb NOT NULL,
     published_at timestamptz)`,
  `CREATE TABLE notifications (
     payment_id integer NOT NULL REFERENCES payments (id),
     kind text NOT NULL,
     sent_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (payment_id, kind))`,
];
```

- `UNIQUE (user_id, idempotency_key)`: a key belongs to one user, and one payment. Two requests racing with the same key cannot both insert.
- `one_live_payment_per_order` is a **partial unique index**: unique among the rows that match its `WHERE`. An order may collect any number of declined payments, but at most one that is processing, unknown or succeeded.
- The status list has no "failed". There are exactly two final outcomes, `succeeded` and `declined`, and two states that mean "not settled yet".
- `notifications` has one row per payment and kind of message: the worker's memory of what it has sent.

The database is PGlite behind `@zudojs/database` again, with the adapter from [the authentication platform](https://zudojs.oyinlola.site/learn/usecase-auth-platform#data):

**Show sql.ts (unchanged)**

sql.ts

```ts
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { createDatabaseClient, createMigrationRunner, noopDatabaseLogger } from "@zudojs/database";
import type { DatabaseClient, DatabaseTransactionContext, PrismaClientLike } from "@zudojs/database";

/* PostgreSQL error codes → the Prisma codes @zudojs/database turns into 409s and 404s. */
const CODES: Record<string, string> = { "23505": "P2002", "23503": "P2003", "40001": "P2034" };

function rawSql(db: PGlite | Transaction): DatabaseTransactionContext {
  async function run(sql: string, values: unknown[]) {
    try {
      return await db.query<Record<string, unknown>>(sql, values);
    } catch (error) {
      const code = CODES[(error as { code?: string }).code ?? ""];
      throw code ? Object.assign(new Error((error as Error).message), { code, clientVersion: "pglite" }) : error;
    }
  }
  return {
    $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) => (await run(sql, values)).rows as T,
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => (await run(sql, values)).affectedRows ?? 0,
    $queryRaw: () => Promise.reject(new Error("Use $queryRawUnsafe with $1 parameters")),
    $executeRaw: () => Promise.reject(new Error("Use $executeRawUnsafe with $1 parameters")),
  };
}

/** An in-process PostgreSQL behind @zudojs/database, with the given schema applied as migration 1. */
export async function openDatabase(schema: readonly string[]): Promise<DatabaseClient> {
  const pg = new PGlite();
  const prisma: PrismaClientLike = {
    ...rawSql(pg),
    $connect: async () => { await pg.waitReady; },
    $disconnect: async () => { if (!pg.closed) await pg.close(); },
    $transaction: <T>(work: (tx: DatabaseTransactionContext) => Promise<T>) => pg.transaction((tx) => work(rawSql(tx))),
  };
  const client = createDatabaseClient({ prisma, logger: noopDatabaseLogger });
  await client.connect();
  await createMigrationRunner(client, [
    { version: 1, name: "schema", up: async (tx) => { for (const statement of schema) await tx.$executeRawUnsafe(statement); } },
  ]).migrate();
  return client;
}
```

## The gateway and its adapter

PayGate is simulated by a small HTTP server with the behaviour of a real gateway: it needs an API key, charges each `Idempotency-Key` at most once and replays the result, and can be asked for a charge by our reference. The card token picks a failure, so every test is deterministic. Card tokens are how real gateways keep card numbers away from you: the customer's card is entered in the gateway's own form, and your server only ever sees a token such as `tok_…`.

paygate-fake.ts

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";

/*
 * "PayGate", a card gateway simulated for tests. The card token decides what happens:
 *   tok_ok        charged
 *   tok_declined  refused with 402 card_declined
 *   tok_flaky     503 on the first attempt, then charged
 *   tok_lost      charged, but the first response never arrives
 *   tok_down      charged, but no response ever arrives
 * Like real gateways, it charges each Idempotency-Key at most once and replays the result.
 */
export interface Charge { readonly id: string; readonly reference: string; readonly amountKobo: number; readonly status: "succeeded" | "declined" }

export async function startFakePayGate(apiKey: string) {
  const charges = new Map<string, Charge>();
  const attempts = new Map<string, number>();
  const hanging = new Set<() => void>();
  const hang = () => new Promise<void>((resolve) => hanging.add(resolve));
  const router = createRouter();

  router.post("/v1/charges", async (ctx) => {
    if (ctx.request.getHeader("authorization") !== `Bearer ${apiKey}`) return createResponseContext({ status: 401 }).json({ error: "bad_key" });
    const key = ctx.request.getHeader("idempotency-key") ?? "";
    const body = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array)) as { amountKobo: number; card: string; reference: string };
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    if (body.card === "tok_flaky" && attempt === 1) return createResponseContext({ status: 503 }).json({ error: "try_again" });

    let charge = charges.get(key);
    if (!charge) {
      const status = body.card === "tok_declined" ? "declined" : "succeeded";
      charge = { id: `ch_${charges.size + 1}`, reference: body.reference, amountKobo: body.amountKobo, status };
      charges.set(key, charge);
    }
    if ((body.card === "tok_lost" && attempt === 1) || body.card === "tok_down") await hang();
    if (charge.status === "declined") return createResponseContext({ status: 402 }).json({ error: "card_declined", charge: charge.id });
    return createResponseContext({ status: 201 }).json(charge);
  });

  router.get("/v1/charges", (ctx) => {
    const found = [...charges.values()].find((charge) => charge.reference === ctx.query.reference);
    return found ? createResponseContext().json(found) : createResponseContext({ status: 404 }).json({ error: "not_found" });
  });

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  return {
    base: `http://127.0.0.1:${server.address?.port}`,
    charges,
    attempts: (key: string) => attempts.get(key) ?? 0,
    async stop() {
      for (const release of hanging) release();
      await server.stop();
    },
  };
}
```

REASON IT OUT

### What does a charge attempt return?

The payment service should not know about HTTP status codes, timeouts or PayGate's JSON. What is the smallest set of outcomes it needs, and which one does a timeout map to?

**Show the reasoning**

Three: `succeeded` (with the gateway's charge id), `declined` (the gateway said no; the customer may try another card), and `unknown` (we did not get an answer). A timeout, a dropped connection and a 5xx after all retries are all `unknown`. Only a configuration bug on our side, such as a wrong API key, is an exception: it is not the customer's problem, and it must page someone.

The adapter implements that **port**, the interface the service depends on, on top of `@zudojs/adapters`' contract (name, version, capabilities, `health()`), as in [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters). Swapping PayGate for another gateway means writing another adapter; the payment service does not change.

gateway.ts

```ts
import type { LifecycleAdapter } from "@zudojs/adapters";
import { createHealthyHealth, createUnhealthyHealth } from "@zudojs/adapters";
import { HttpClient, HttpClientError, HttpClientNetworkError, HttpClientTimeoutError } from "@zudojs/http";

export interface ChargeRequest {
  readonly reference: string;
  readonly amountKobo: number;
  readonly card: string;
  readonly idempotencyKey: string;
}

/** What a charge attempt can end in. "unknown" means the gateway may or may not have charged. */
export type ChargeOutcome =
  | { readonly status: "succeeded"; readonly chargeId: string }
  | { readonly status: "declined"; readonly reason: string }
  | { readonly status: "unknown"; readonly reason: string };

/** The port the payment service depends on. Any gateway that fits it can be swapped in. */
export interface PaymentGateway extends LifecycleAdapter {
  charge(request: ChargeRequest): Promise<ChargeOutcome>;
  lookup(reference: string): Promise<ChargeOutcome | null>;
}

interface PayGateCharge { readonly id: string; readonly status: "succeeded" | "declined" }

export function createPayGateAdapter(options: { baseUrl: string; apiKey: string; timeoutMs: number; retries: number }): PaymentGateway {
  const client = new HttpClient({
    baseUrl: options.baseUrl,
    timeout: options.timeoutMs,
    headers: { authorization: `Bearer ${options.apiKey}` },
    // POST is retried only because every charge carries an Idempotency-Key.
    retry: { retries: options.retries, retryDelay: 50, retryMethods: ["POST", "GET"], retryStatusCodes: [502, 503, 504] },
  });

  const toOutcome = (charge: PayGateCharge): ChargeOutcome =>
    charge.status === "succeeded" ? { status: "succeeded", chargeId: charge.id } : { status: "declined", reason: "card_declined" };

  return {
    name: "paygate",
    version: "1.0.0",
    capabilities: { http: true, abortSignal: true },

    async charge({ reference, amountKobo, card, idempotencyKey }) {
      try {
        const { data } = await client.request<PayGateCharge>("/v1/charges", {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body: { reference, amountKobo, card },
        });
        return toOutcome(data);
      } catch (error) {
        if (error instanceof HttpClientTimeoutError || error instanceof HttpClientNetworkError) {
          return { status: "unknown", reason: error.name };
        }
        if (error instanceof HttpClientError && error.status === 402) return { status: "declined", reason: "card_declined" };
        if (error instanceof HttpClientError && error.status !== undefined && error.status >= 500) {
          return { status: "unknown", reason: `PayGate answered ${error.status}` };
        }
        throw error; // 401, 400: our bug or our configuration, not the customer's problem
      }
    },

    async lookup(reference) {
      try {
        const { data } = await client.request<PayGateCharge>("/v1/charges", { query: { reference } });
        return toOutcome(data);
      } catch (error) {
        if (error instanceof HttpClientError && error.status === 404) return null;
        throw error;
      }
    },

    async health() {
      try {
        await client.request("/v1/charges", { query: { reference: "health-check" }, timeout: 1000, retry: { retries: 0 } });
        return createHealthyHealth();
      } catch (error) {
        return error instanceof HttpClientError && error.status === 404 ? createHealthyHealth() : createUnhealthyHealth("PayGate unreachable");
      }
    },
  };
}
```

The `HttpClient` from `@zudojs/http` retries only `GET`, `HEAD` and `OPTIONS` by default, because repeating a `POST` can repeat its effect. Here `POST` is retried on purpose, and it is safe only because every charge carries an `Idempotency-Key` that PayGate honours. The key is derived from our payment id, so every retry of one payment, including retries that happen hours later, uses the same key. Retries back off exponentially with jitter, and the client gives up after two retries.

## The payment service

payments.ts

```ts
import { sha256 } from "@zudojs/crypto";
import type { DatabaseClient } from "@zudojs/database";
import { isConflictError, withTransaction } from "@zudojs/database";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import type { ChargeOutcome, PaymentGateway } from "./gateway.js";

export const NewPayment = schema.object({
  orderId: schema.number().int().min(1),
  card: schema.string().regex(/^tok_[a-z0-9_]{2,60}$/),
});

export interface Payment {
  readonly id: number;
  readonly orderId: number;
  readonly amountKobo: number;
  readonly status: "processing" | "succeeded" | "declined" | "unknown";
}
interface Row extends Payment { readonly requestHash: string }

const SELECT = `SELECT id, order_id AS "orderId", amount_kobo AS "amountKobo", status, request_hash AS "requestHash" FROM payments`;
const view = ({ id, orderId, amountKobo, status }: Row): Payment => ({ id, orderId, amountKobo, status });
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

export function createPayments(db: DatabaseClient, gateway: PaymentGateway, relay: () => Promise<void>) {
  async function find(where: string, values: unknown[]): Promise<Row | undefined> {
    return (await db.queryRawUnsafe<Row[]>(`${SELECT} WHERE ${where}`, values))[0];
  }

  /** Records a final outcome once. The status check makes a second, late outcome a no-op. */
  async function settle(id: number, outcome: ChargeOutcome): Promise<void> {
    await withTransaction(db, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<{ order_id: number; amount_kobo: number; user_id: number }[]>(
        `UPDATE payments SET status = $2, gateway_charge_id = $3, decline_reason = $4
         WHERE id = $1 AND status IN ('processing', 'unknown') RETURNING order_id, amount_kobo, user_id`,
        id, outcome.status,
        outcome.status === "succeeded" ? outcome.chargeId : null,
        outcome.status === "succeeded" ? null : outcome.reason,
      );
      if (!row || outcome.status === "unknown") return;
      if (outcome.status === "succeeded") await tx.$executeRawUnsafe("UPDATE orders SET status = 'paid' WHERE id = $1", row.order_id);
      await tx.$executeRawUnsafe(
        "INSERT INTO outbox (type, payload) VALUES ($1, $2)",
        `payment.${outcome.status}`, { paymentId: id, orderId: row.order_id, userId: row.user_id, amountKobo: row.amount_kobo },
      );
    });
    await relay();
  }

  /**
   * Asks the gateway what happened to a payment we are unsure about. Never charges.
   * `giveUp`: the payment is old enough that "the gateway has no such charge" means it never will.
   */
  async function check(payment: Row, giveUp: boolean): Promise<void> {
    const outcome = await gateway.lookup(`pay_${payment.id}`);
    if (outcome) await settle(payment.id, outcome);
    else if (giveUp) await settle(payment.id, { status: "declined", reason: "never_reached_gateway" });
  }

  return {
    async create(userId: number, key: string | undefined, input: unknown): Promise<{ payment: Payment; replayed: boolean }> {
      if (key === undefined || !KEY.test(key)) {
        throw new ValidationError("Send an Idempotency-Key header of 16 to 64 letters, digits, - or _");
      }
      const { orderId, card } = NewPayment.parse(input);
      const requestHash = await sha256(JSON.stringify({ orderId, card }));

      const earlier = await find("user_id = $1 AND idempotency_key = $2", [userId, key]);
      if (earlier) {
        if (earlier.requestHash !== requestHash) {
          throw new DomainError("This Idempotency-Key was used for a different payment", { code: "IDEMPOTENCY_KEY_REUSED" });
        }
        if (earlier.status === "processing" || earlier.status === "unknown") await check(earlier, false);
        return { payment: view((await find("id = $1", [earlier.id]))!), replayed: true };
      }

      let created: Row;
      try {
        created = await withTransaction(db, async (tx) => {
          const [order] = await tx.$queryRawUnsafe<{ total_kobo: number; status: string }[]>(
            "SELECT total_kobo, status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE", orderId, userId,
          );
          if (!order) throw new NotFoundError(`Order ${orderId} not found`);
          if (order.status === "paid") throw new ConflictError(`Order ${orderId} is already paid`);
          const [row] = await tx.$queryRawUnsafe<Row[]>(
            `INSERT INTO payments (user_id, order_id, amount_kobo, status, idempotency_key, request_hash)
             VALUES ($1, $2, $3, 'processing', $4, $5)
             RETURNING id, order_id AS "orderId", amount_kobo AS "amountKobo", status, request_hash AS "requestHash"`,
            userId, orderId, order.total_kobo, key, requestHash,
          );
          return row!;
        });
      } catch (error) {
        if (!isConflictError(error)) throw error;
        const same = await find("user_id = $1 AND idempotency_key = $2", [userId, key]);
        throw new ConflictError(same ? "This payment is already being processed; retry shortly" : `Order ${orderId} already has a payment`);
      }

      const outcome = await gateway.charge({
        reference: `pay_${created.id}`, amountKobo: created.amountKobo, card, idempotencyKey: `oja-pay-${created.id}`,
      });
      await settle(created.id, outcome);
      return { payment: view((await find("id = $1", [created.id]))!), replayed: false };
    },

    async get(userId: number, id: number): Promise<Payment> {
      const row = await find("id = $1 AND user_id = $2", [id, userId]);
      if (!row) throw new NotFoundError(`Payment ${id} not found`);
      return view(row);
    },

    /** The reconciliation job: settles every payment we are unsure about by asking the gateway. */
    async reconcile(olderThanSeconds: number): Promise<number> {
      const open = await db.queryRawUnsafe<Row[]>(
        `${SELECT} WHERE status IN ('processing', 'unknown') AND created_at < now() - make_interval(secs => $1::integer) ORDER BY id`,
        [olderThanSeconds],
      );
      for (const payment of open) await check(payment, true);
      return open.length;
    },
  };
}

export type Payments = ReturnType<typeof createPayments>;
```

Read `create` in the order of the reasoning:

1. No valid key: 400. The fingerprint is a SHA-256 of the fields that define the payment.
2. A known key with another fingerprint: 422. A known key for a payment that is still unsettled triggers a `check` (a lookup at the gateway, never a new charge) and returns the current state. Otherwise the stored payment is replayed.
3. Transaction 1 locks the order row, checks ownership (404) and payment status (409), and inserts the payment with the order's total. If a unique rule fires, a second query tells "your own request is still running" from "this order already has a payment"; both are 409.
4. The charge happens *outside* any transaction: a network call inside a transaction holds row locks for as long as the gateway takes.
5. `settle` is transaction 2. Its `UPDATE … WHERE status IN ('processing', 'unknown')` makes it idempotent: a late second outcome, from a retry or the reconciler, changes nothing and writes no second event.

## From payment to SMS

The outbox row was committed together with the payment's status. The relay publishes such rows on the event bus and marks them published; it runs right after each commit and can run again later to pick up anything a crash left behind. Publishing and marking are two steps, so a crash between them publishes the event again: delivery is **at least once**, and everything downstream must be idempotent.

outbox.ts

```ts
import type { DatabaseClient } from "@zudojs/database";
import type { EventBus } from "@zudojs/events";

/**
 * Publishes events that were committed to the outbox table. Called right after a commit, and by a
 * periodic sweep that catches anything a crash left behind. Delivery is at least once.
 */
export function createOutboxRelay(db: DatabaseClient, bus: EventBus) {
  let running: Promise<void> | undefined;

  async function drain(): Promise<void> {
    const rows = await db.queryRawUnsafe<{ id: number; type: string; payload: Record<string, unknown> }[]>(
      "SELECT id, type, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 100",
    );
    for (const row of rows) {
      const result = await bus.publishEvent({ type: row.type, payload: row.payload });
      if (result.failed > 0) return; // keep it, and everything after it, for the next sweep
      await db.executeRawUnsafe("UPDATE outbox SET published_at = now() WHERE id = $1", [row.id]);
    }
  }

  /** One drain at a time in this process; callers that arrive meanwhile wait for it. */
  return async function relay(): Promise<void> {
    while (running) await running;
    running = drain().finally(() => (running = undefined));
    await running;
  };
}
```

The event handlers turn events into queue jobs, and the worker sends the SMS. Three layers of protection against duplicates: the queue's `deduplicationKey` refuses a second job for the same payment while the first exists, the `notifications` table remembers what was sent, and the SMS provider gets a key so it can drop a message it has already delivered, which covers a crash between sending and recording.

notifications.ts

```ts
import type { DatabaseClient } from "@zudojs/database";
import { JobDuplicateError } from "@zudojs/errors";
import type { Event, EventBus } from "@zudojs/events";
import type { Queue } from "@zudojs/queue";

export interface PaymentEvent { readonly paymentId: number; readonly orderId: number; readonly userId: number; readonly amountKobo: number }
export interface NotifyJob extends PaymentEvent { readonly kind: "receipt" | "declined" }

/** The SMS provider's port. `key` lets the provider drop a message it has already sent. */
export interface SmsSender {
  send(to: string, text: string, key: string): Promise<void>;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

/** payment.* events become notification jobs, at most one per payment and kind. */
export function queueNotifications(bus: EventBus, queue: Queue<NotifyJob>): void {
  const enqueue = (kind: NotifyJob["kind"]) => async (event: Event<PaymentEvent>) => {
    try {
      await queue.add("notify", { ...event.payload, kind }, { deduplicationKey: `${kind}:${event.payload.paymentId}` });
    } catch (error) {
      if (!(error instanceof JobDuplicateError)) throw error; // already queued: nothing to do
    }
  };
  bus.on<Event<PaymentEvent>>("payment.succeeded", enqueue("receipt"), { id: "queue-receipt" });
  bus.on<Event<PaymentEvent>>("payment.declined", enqueue("declined"), { id: "queue-declined-notice" });
}

/** The worker. It may run twice for one job, so it checks, sends with a key, then records. */
export function processNotifications(queue: Queue<NotifyJob>, db: DatabaseClient, sms: SmsSender): void {
  queue.process("notify", async (job) => {
    const { paymentId, orderId, userId, amountKobo, kind } = job.data;
    const done = await db.queryRawUnsafe<unknown[]>("SELECT 1 FROM notifications WHERE payment_id = $1 AND kind = $2", [paymentId, kind]);
    if (done.length > 0) return;
    const text = kind === "receipt"
      ? `Oja Market: we received ${naira(amountKobo)} for order ${orderId}. Thank you!`
      : `Oja Market: your card was declined for order ${orderId}. No money was taken.`;
    await sms.send(`customer-${userId}`, text, `${kind}-${paymentId}`);
    await db.executeRawUnsafe("INSERT INTO notifications (payment_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING", [paymentId, kind]);
  });
}
```

> NOTE
>
> The type argument in `bus.on<Event<PaymentEvent>>(…)` is a promise you make, not something `@zudojs/events` checks: publish a `payment.succeeded` with another payload and the handler receives it with the wrong type. It is acceptable here because only the outbox, written by `settle`, publishes these events. The same holds for `registry.require<PaymentGateway>("paygate")` in the starter below: the registry cannot check that the adapter it finds is a payment gateway.

## The HTTP layer

The route verifies the access token issued by [the authentication platform](https://zudojs.oyinlola.site/learn/usecase-auth-platform) (only the verification lives in this service), reads the key from the header, and maps each state to a status: 201 succeeded, 402 declined, 202 processing or unknown. A replay says so in an `Idempotent-Replayed` header. The error handler is `errors.ts` from the authentication platform, unchanged.

**Show errors.ts (unchanged)**

errors.ts

```ts
import { randomUUID } from "node:crypto";
import { normalizeToBaseError } from "@zudojs/errors";
import { createResponseContext, type HttpRequestContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { isSchemaValidationError } from "@zudojs/schema";

/** The error envelope from the REST API lesson, plus the headers some errors carry (Retry-After). */
export function createErrorHandler(logger: Logger) {
  return (thrown: unknown, request: HttpRequestContext) => {
    if (isSchemaValidationError(thrown)) {
      const issues = thrown.issues.map((issue) => ({ path: issue.path.join(".") || "(body)", message: issue.message }));
      return createResponseContext({ status: 400 }).json({ error: { code: "VALIDATION_FAILED", message: "The request is not valid", issues } });
    }
    const error = normalizeToBaseError(thrown);
    if (error.expose && error.statusCode < 500) {
      const response = createResponseContext({ status: error.statusCode });
      const headers = (thrown as { headers?: Record<string, string> }).headers ?? {};
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      return response.json({ error: { code: error.code, message: error.message } });
    }
    const requestId = randomUUID();
    logger.error("Request failed", { requestId, method: request.method, path: request.path, error: thrown instanceof Error ? thrown : String(thrown) });
    return createResponseContext({ status: 500 }).json({ error: { code: "INTERNAL", message: "Something went wrong on our side", requestId } });
  };
}
```

http.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import { parseBearerToken, verifyAccessToken } from "@zudojs/auth";
import { AuthenticationError } from "@zudojs/errors";
import { badRequest, createHttpServer, createNodeHttpAdapter, createRateLimitMiddleware, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware, HttpRouterContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { schema } from "@zudojs/schema";
import { createErrorHandler } from "./errors.js";
import type { Payment, Payments } from "./payments.js";

const Id = schema.object({ id: schema.coerce.number().int().min(1).max(2_147_483_647) });
const STATUS: Record<Payment["status"], number> = { succeeded: 201, declined: 402, processing: 202, unknown: 202 };

export function createPaymentsApi(payments: Payments, tokens: TokenConfig, logger: Logger) {
  /** Access tokens come from the authentication platform; here we only verify them. */
  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader("authorization"));
    const result = token === null ? undefined : verifyAccessToken(token, tokens);
    if (!result?.valid || !result.payload) throw new AuthenticationError("Sign in first");
    ctx.state.set("userId", Number(result.payload.sub));
    return next();
  };
  const userId = (ctx: HttpRouterContext) => ctx.state.get("userId") as number;
  const router = createRouter();

  router.post("/v1/payments", async (ctx) => {
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
    } catch {
      throw badRequest("The body is not valid JSON");
    }
    const { payment, replayed } = await payments.create(userId(ctx), ctx.request.getHeader("idempotency-key"), body);
    const response = createResponseContext({ status: STATUS[payment.status] }).setHeader("location", `/v1/payments/${payment.id}`);
    if (replayed) response.setHeader("idempotent-replayed", "true");
    return response.json(payment);
  }, { middleware: [requireUser, createRateLimitMiddleware({ max: 30, windowMs: 60_000 })] });

  router.get("/v1/payments/:id", async (ctx) => payments.get(userId(ctx), Id.parse(ctx.params).id), { middleware: [requireUser] });

  return createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
    errorHandler: createErrorHandler(logger),
  });
}
```

The starter wires everything: the fake PayGate, the adapter registered in an `AdapterRegistry`, the database, the event bus, a notification queue with five attempts and exponential backoff, the relay, and the HTTP server. `order()` stands in for the orders service; `settled()` waits until the queue is idle so demos can print what was sent.

oja-pay.ts

```ts
import { randomBytes } from "node:crypto";
import { AdapterRegistry } from "@zudojs/adapters";
import { createTokenPair, toUserId } from "@zudojs/auth";
import { createEventBus } from "@zudojs/events";
import { createLogger } from "@zudojs/logger";
import { createExponentialBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { createPayGateAdapter, type PaymentGateway } from "./gateway.js";
import { createPaymentsApi } from "./http.js";
import { processNotifications, queueNotifications, type NotifyJob, type SmsSender } from "./notifications.js";
import { createOutboxRelay } from "./outbox.js";
import { startFakePayGate } from "./paygate-fake.js";
import { createPayments } from "./payments.js";
import { SCHEMA } from "./schema.js";
import { openDatabase } from "./sql.js";

/* DEMO ONLY: random secrets for each run. Your app reads them from the environment. */
const secret = () => randomBytes(32).toString("base64url");

export interface Reply { readonly status: number; readonly headers: Headers; readonly body: any }

/** Starts Oja's payment service with a fake PayGate and a fake SMS provider. */
export async function startOjaPay(options: { log?: (line: string) => void; sms?: SmsSender; gatewayTimeoutMs?: number } = {}) {
  const log = options.log ?? console.log;
  const apiKey = secret();
  const paygate = await startFakePayGate(apiKey);
  const registry = new AdapterRegistry();
  registry.register(createPayGateAdapter({ baseUrl: paygate.base, apiKey, timeoutMs: options.gatewayTimeoutMs ?? 1500, retries: 2 }));
  await registry.initializeAll();
  const gateway = registry.require<PaymentGateway>("paygate");

  const db = await openDatabase(SCHEMA);
  const bus = createEventBus();
  const queue = createInMemoryQueue<NotifyJob>(createQueueName("notifications"), {
    defaultJobOptions: { attempts: 5, backoff: createExponentialBackoff(20, { jitter: "none" }) },
  });
  const texts: string[] = [];
  const sms: SmsSender = options.sms ?? { send: async (to, text) => void texts.push(`${to}: ${text}`) };
  queueNotifications(bus, queue);
  processNotifications(queue, db, sms);

  const relay = createOutboxRelay(db, bus);
  const payments = createPayments(db, gateway, relay);
  const tokens = { accessSecret: secret(), refreshSecret: secret() };
  const logger = createLogger({
    name: "oja-pay",
    transports: [(entry) => log(`[${entry.levelName}] ${entry.message}: ${(entry.metadata as { error?: { message: string } }).error?.message}`)],
  });
  const server = createPaymentsApi(payments, tokens, logger);
  await server.start();
  const base = `http://127.0.0.1:${server.address?.port}`;

  /** An order for a user, as the orders service would have created it. */
  async function order(userId: number, totalKobo: number): Promise<number> {
    const [row] = await db.queryRawUnsafe<{ id: number }[]>("INSERT INTO orders (user_id, total_kobo) VALUES ($1, $2) RETURNING id", [userId, totalKobo]);
    return row!.id;
  }
  const tokenFor = (userId: number) => createTokenPair(toUserId(String(userId)), tokens).accessToken;

  async function pay(userId: number, key: string | undefined, body: unknown): Promise<Reply> {
    const response = await fetch(`${base}/v1/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenFor(userId)}`, ...(key ? { "idempotency-key": key } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }

  /** Waits until the queue has nothing left to run. */
  async function settled(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      const stats = await queue.getStats();
      if (stats.waiting + stats.active + stats.delayed + stats.retrying === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async function stop(): Promise<void> {
    await server.stop();
    await queue.close();
    await registry.disposeAll();
    await paygate.stop();
    await db.disconnect();
  }

  return { db, base, paygate, payments, registry, queue, texts, relay, order, pay, tokenFor, settled, stop };
}
```

## The normal cases

story.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { startOjaPay, type Reply } from "./oja-pay.js";

const oja = await startOjaPay();
const show = (label: string, r: Reply) =>
  console.log(`${label.padEnd(22)} ${r.status}`, r.body.error ? r.body.error.code : `${r.body.status} ₦${r.body.amountKobo / 100}`,
    r.headers.get("idempotent-replayed") ? "(replayed)" : "");

const ada = 1;
const rice = await oja.order(ada, 1_250_000);
const key = randomUUID();
show("pay for the rice", await oja.pay(ada, key, { orderId: rice, card: "tok_ok" }));
show("same request again", await oja.pay(ada, key, { orderId: rice, card: "tok_ok" }));
show("same key, other card", await oja.pay(ada, key, { orderId: rice, card: "tok_other" }));
show("new key, paid order", await oja.pay(ada, randomUUID(), { orderId: rice, card: "tok_ok" }));
show("no key", await oja.pay(ada, undefined, { orderId: rice, card: "tok_ok" }));
show("someone else's order", await oja.pay(2, randomUUID(), { orderId: rice, card: "tok_ok" }));

const oil = await oja.order(ada, 280_000);
show("declined card", await oja.pay(ada, randomUUID(), { orderId: oil, card: "tok_declined" }));
show("flaky gateway", await oja.pay(ada, randomUUID(), { orderId: oil, card: "tok_flaky" }));

await oja.settled();
console.log("charges at PayGate:", [...oja.paygate.charges.values()].map((c) => `${c.reference} ${c.status}`));
console.log(oja.texts);
await oja.stop();
```

Output of `npx tsx story.ts`

```ts
pay for the rice       201 succeeded ₦12500
same request again     201 succeeded ₦12500 (replayed)
same key, other card   422 IDEMPOTENCY_KEY_REUSED
new key, paid order    409 ERR_CONFLICT
no key                 400 ERR_VALIDATION_FAILED
someone else's order   404 ERR_RESOURCE_NOT_FOUND
declined card          402 declined ₦2800
flaky gateway          201 succeeded ₦2800
charges at PayGate: [ 'pay_1 succeeded', 'pay_2 declined', 'pay_3 succeeded' ]
[
  'customer-1: Oja Market: we received ₦12,500.00 for order 1. Thank you!',
  'customer-1: Oja Market: your card was declined for order 2. No money was taken.',
  'customer-1: Oja Market: we received ₦2,800.00 for order 2. Thank you!'
]
```

- The repeated request was replayed: same body, `Idempotent-Replayed`, no second charge.
- The same key with another card is 422, a new key for the paid order is 409, a request without a key is 400, and Bola paying Ada's order is 404.
- The declined card got 402, and a new key for the same order was allowed afterwards, because a declined payment is not live. The flaky gateway answered 503 once; the adapter retried with the same key and the payment succeeded.
- PayGate holds exactly three charges, one per payment attempt that reached it, and the customer got one SMS per final outcome, including the decline.

## The failure cases

Now the incidents from the brief. The gateway loses its first answer; then it never answers at all; then our own database fails right after a successful charge (renaming the outbox table stands in for a database outage):

failures.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { startOjaPay } from "./oja-pay.js";

const oja = await startOjaPay();
const ada = 1;
const statusOf = async (id: number) =>
  (await oja.db.queryRawUnsafe<{ status: string }[]>("SELECT status FROM payments WHERE id = $1", [id]))[0]?.status;

// 1. The gateway charges, but its first answer is lost. Our retry carries the same Idempotency-Key.
const lost = await oja.pay(ada, randomUUID(), { orderId: await oja.order(ada, 50_000), card: "tok_lost" });
console.log("lost answer:", lost.status, lost.body.status, "| PayGate attempts:", oja.paygate.attempts("oja-pay-1"), "charges:", oja.paygate.charges.size);

// 2. The gateway charges, and no answer ever arrives.
const down = await oja.pay(ada, randomUUID(), { orderId: await oja.order(ada, 80_000), card: "tok_down" });
console.log("no answer:  ", down.status, down.body.status);
console.log("reconciled:", await oja.payments.reconcile(0), "payment(s) ->", await statusOf(down.body.id));

// 3. The charge works, then our own database fails while recording it.
await oja.db.executeRawUnsafe("ALTER TABLE outbox RENAME TO outbox_offline");
const key = randomUUID();
const orderId = await oja.order(ada, 120_000);
const crashed = await oja.pay(ada, key, { orderId, card: "tok_ok" });
console.log("db failure: ", crashed.status, crashed.body.error.code, "| payment 3 is", await statusOf(3));
await oja.db.executeRawUnsafe("ALTER TABLE outbox_offline RENAME TO outbox");
const retried = await oja.pay(ada, key, { orderId, card: "tok_ok" });
console.log("app retries:", retried.status, retried.body.status, retried.headers.get("idempotent-replayed"));

await oja.settled();
console.log("charges:", [...oja.paygate.charges.values()].map((c) => c.reference).join(", "));
console.log(oja.texts.length, "texts:", oja.texts.map((text) => text.match(/₦[\d,.]+/)?.[0]));
await oja.stop();
```

Output of `npx tsx failures.ts`

```ts
lost answer: 201 succeeded | PayGate attempts: 2 charges: 1
no answer:   202 unknown
reconciled: 1 payment(s) -> succeeded
[error] Request failed: relation "outbox" does not exist
db failure:  500 INTERNAL | payment 3 is processing
app retries: 201 succeeded true
charges: pay_1, pay_2, pay_3
3 texts: [ '₦500.00', '₦800.00', '₦1,200.00' ]
```

- **Lost answer**: PayGate saw two attempts with one key, created one charge, and replayed it on the second attempt. The customer saw a normal 201.
- **No answer**: after three attempts the payment is `unknown`, answered with 202, not "failed". The reconciliation job found the charge at PayGate and settled it as succeeded. Had the service called it failed, the customer would have paid again (incident 2).
- **Our database failed after the charge**: the client got a 500 and the payment stayed `processing`. The app retried with the same key: the service looked the charge up instead of charging again, settled it, and replayed the result. Three payments, three charges, three SMS.

## The tests

Two test files, one for double submission and one for failures, with the Vitest runner from the earlier use cases:

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 50_000 } });
```

vitest-run.ts

```ts
import { startVitest } from "vitest/node";

/** Runs test files with Vitest and prints one line per test. */
export async function runTests(...files: string[]): Promise<void> {
  const vitest = await startVitest("test", files, { watch: false, reporters: [] });
  for (const file of vitest.state.getTestModules()) {
    for (const error of file.errors()) console.log(`× ${file.relativeModuleId}: ${error.message}`);
    for (const test of file.children.allTests()) {
      const { state, errors = [] } = test.result();
      console.log(`${state === "passed" ? "✓" : "×"} ${test.fullName}`);
      for (const error of errors) console.log(`    ${error.message}`);
    }
  }
  await vitest.close();
}
```

tests/double.test.ts

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOjaPay } from "../oja-pay.js";

let oja: Awaited<ReturnType<typeof startOjaPay>>;
beforeAll(async () => {
  oja = await startOjaPay({ log: () => {} });
});
afterAll(() => oja.stop());

const chargesFor = (orderId: number) =>
  oja.db.queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM payments WHERE order_id = $1 AND status = 'succeeded'", [orderId]);

describe("double submission", () => {
  it("replays a repeated request instead of charging again", async () => {
    const orderId = await oja.order(1, 50_000);
    const key = randomUUID();
    const first = await oja.pay(1, key, { orderId, card: "tok_ok" });
    const second = await oja.pay(1, key, { orderId, card: "tok_ok" });
    expect([first.status, second.status, second.headers.get("idempotent-replayed")]).toEqual([201, 201, "true"]);
    expect(second.body).toEqual(first.body);
    expect(oja.paygate.attempts(`oja-pay-${first.body.id}`)).toBe(1);
  });

  it("lets exactly one of two simultaneous requests charge, whatever their keys", async () => {
    const sameKey = await oja.order(1, 60_000);
    const key = randomUUID();
    const a = await Promise.all([1, 2].map(() => oja.pay(1, key, { orderId: sameKey, card: "tok_ok" })));
    const otherKeys = await oja.order(1, 70_000);
    const b = await Promise.all([1, 2].map(() => oja.pay(1, randomUUID(), { orderId: otherKeys, card: "tok_ok" })));
    for (const pair of [a, b]) {
      // The loser gets 409 (still in progress, or order already paid) or, if it came late enough, the replay.
      expect(pair.filter((r) => r.status === 201 && !r.headers.get("idempotent-replayed"))).toHaveLength(1);
      expect(pair.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    }
    expect([await chargesFor(sameKey), await chargesFor(otherKeys)]).toEqual([[{ n: 1 }], [{ n: 1 }]]);
  });

  it("refuses a key reused for another payment, and a request without a key", async () => {
    const orderId = await oja.order(1, 10_000);
    const key = randomUUID();
    await oja.pay(1, key, { orderId, card: "tok_declined" });
    expect((await oja.pay(1, key, { orderId, card: "tok_ok" })).status).toBe(422);
    expect((await oja.pay(1, undefined, { orderId, card: "tok_ok" })).status).toBe(400);
  });

  it("charges the order's total, never an amount from the client, and only the owner's order", async () => {
    const orderId = await oja.order(1, 99_900);
    const paid = await oja.pay(1, randomUUID(), { orderId, card: "tok_ok", amountKobo: 1 });
    expect(paid.body.amountKobo).toBe(99_900);
    expect([...oja.paygate.charges.values()].at(-1)?.amountKobo).toBe(99_900);
    expect((await oja.pay(2, randomUUID(), { orderId: await oja.order(1, 5_000), card: "tok_ok" })).status).toBe(404);
  });
});
```

run-double-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/double.test.ts");
```

Output of `npx tsx run-double-tests.ts`

```ts
✓ double submission > replays a repeated request instead of charging again
✓ double submission > lets exactly one of two simultaneous requests charge, whatever their keys
✓ double submission > refuses a key reused for another payment, and a request without a key
✓ double submission > charges the order's total, never an amount from the client, and only the owner's order
```

The concurrency test accepts two correct outcomes for the losing request: 409 if it arrived while the winner was still running, or the replay if it arrived after. What it does not accept is two fresh 201s, or two charges. A test that demanded one exact interleaving would fail at random, and a flaky test teaches people to ignore red.

tests/failures.test.ts

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOjaPay } from "../oja-pay.js";

let smsCalls = 0;
const delivered = new Map<string, string>();
let oja: Awaited<ReturnType<typeof startOjaPay>>;
beforeAll(async () => {
  oja = await startOjaPay({
    log: () => {},
    // An SMS provider that fails twice, then works, and drops a message whose key it has seen.
    sms: {
      send: async (_to, text, key) => {
        if (++smsCalls <= 2) throw new Error("SMS provider unavailable");
        delivered.set(key, text);
      },
    },
  });
});
afterAll(() => oja.stop());

const statusOf = async (id: number) =>
  (await oja.db.queryRawUnsafe<{ status: string }[]>("SELECT status FROM payments WHERE id = $1", [id]))[0]?.status;

describe("failures", () => {
  it("retries a lost answer with the same key and charges once", async () => {
    const paid = await oja.pay(1, randomUUID(), { orderId: await oja.order(1, 10_000), card: "tok_lost" });
    expect(paid.body.status).toBe("succeeded");
    expect(oja.paygate.attempts(`oja-pay-${paid.body.id}`)).toBe(2);
    expect([...oja.paygate.charges.values()].filter((c) => c.reference === `pay_${paid.body.id}`)).toHaveLength(1);
  });

  it("never calls a timed-out payment failed, and settles it by asking the gateway", async () => {
    const pending = await oja.pay(1, randomUUID(), { orderId: await oja.order(1, 20_000), card: "tok_down" });
    expect([pending.status, pending.body.status]).toEqual([202, "unknown"]);
    await oja.payments.reconcile(0);
    expect(await statusOf(pending.body.id)).toBe("succeeded");
  });

  it("recovers from a database failure after the charge without charging twice", async () => {
    await oja.db.executeRawUnsafe("ALTER TABLE outbox RENAME TO outbox_offline");
    const key = randomUUID();
    const orderId = await oja.order(1, 30_000);
    expect((await oja.pay(1, key, { orderId, card: "tok_ok" })).status).toBe(500);
    await oja.db.executeRawUnsafe("ALTER TABLE outbox_offline RENAME TO outbox");
    const retried = await oja.pay(1, key, { orderId, card: "tok_ok" });
    expect(retried.body.status).toBe("succeeded");
    expect(oja.paygate.attempts(`oja-pay-${retried.body.id}`)).toBe(1);
  });

  it("delivers every notification once, even though the SMS provider failed", async () => {
    await oja.settled();
    const succeeded = await oja.db.queryRawUnsafe<{ id: number }[]>("SELECT id FROM payments WHERE status = 'succeeded' ORDER BY id");
    expect([...delivered.keys()].sort()).toEqual(succeeded.map((p) => `receipt-${p.id}`).sort());
    expect(await oja.db.queryRawUnsafe("SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL")).toEqual([{ n: 0 }]);
  });

  it("declines a payment the gateway never received, once it is old enough", async () => {
    const [row] = await oja.db.queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO payments (user_id, order_id, amount_kobo, status, idempotency_key, request_hash)
       VALUES (1, $1, 1000, 'processing', 'crashed-before-the-charge', 'x') RETURNING id`,
      [await oja.order(1, 1000)],
    );
    await oja.payments.reconcile(0);
    expect(await statusOf(row!.id)).toBe("declined");
  });
});
```

run-failure-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/failures.test.ts");
```

Output of `npx tsx run-failure-tests.ts`

```ts
✓ failures > retries a lost answer with the same key and charges once
✓ failures > never calls a timed-out payment failed, and settles it by asking the gateway
✓ failures > recovers from a database failure after the charge without charging twice
✓ failures > delivers every notification once, even though the SMS provider failed
✓ failures > declines a payment the gateway never received, once it is old enough
```

The notification test runs against an SMS provider that fails twice: the queue retried, and every succeeded payment has exactly one delivered receipt, with no outbox row left unpublished. The last test covers the reconciler's other branch: a payment row whose charge never reached PayGate (a crash between the two steps) is declined once it is old enough, so the customer can pay again with a new key.

## Security and production concerns

- **Card data**: never let card numbers reach your servers; use the gateway's hosted fields and tokens. That keeps you out of most of PCI DSS, the card industry's security standard.
- **Secrets**: the gateway API key and the webhook secret come from the environment, and never appear in logs or queue jobs. Jobs carry ids and amounts, not tokens.
- **Amounts**: integer kobo, always from the order, and the gateway's reported amount should be compared with ours when settling. A mismatch is an incident, not a success.
- **Schedules**: run `reconcile` every few minutes with [@zudojs/scheduler](https://zudojs.oyinlola.site/learn/zudo-scheduler), for payments older than, say, two minutes, and run the outbox relay on a timer too. Alert when a payment stays `unknown` for an hour.
- **Several servers**: the in-memory queue and the relay's in-process lock work for one process. With more, use a shared queue backend, and let each relay claim rows with `SELECT … FOR UPDATE SKIP LOCKED`.
- **Webhooks**: real gateways also call you back when a charge settles. Treat a webhook as one more source of outcomes for `settle`, and trust it only after checking its signature (the first exercise).
- **Keys expire**: keep idempotency keys at least 24 hours, as [the idempotency lesson](https://zudojs.oyinlola.site/learn/api-idempotency#production) recommends; the key column lives on the payment, so it is kept as long as the payment.
- **Refunds and disputes** are payments in the other direction and need the same care: their own idempotency keys, their own states and their own reconciliation.

## Practice

TRY IT YOURSELF

### Verify PayGate's webhooks

PayGate calls `POST /v1/webhooks/paygate` when a charge settles, with a header `paygate-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` made with a shared secret. Write the verification: the signature over the raw body, compared in constant time; a timestamp within five minutes, so a captured webhook cannot be replayed later; and each event id handled once. Use `@zudojs/crypto`.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Split the header on `,` and each part on `=`: `Object.fromEntries(header.split(",").map((p) => p.split("=", 2)))` gives you `{ t, v1 }`. `Number(parts.t)` must be an integer.

HINT 2

`await hmacSha256(\`${timestamp}.${rawBody}\`, key)` is the expected signature; compare it with `timingSafeEqualString(expected, parts.v1)`, never `===`.

HINT 3

`Math.abs(nowSeconds - timestamp) > 300` catches both a replayed old webhook and a clock far in the future. `seen.has(event.id)` before `seen.add(event.id)` is what makes a retry a no-op instead of a second charge recorded twice.

SOLUTION

webhook.ts

```ts
import { hmacSha256, timingSafeEqualString, utf8Encode } from "@zudojs/crypto";

/**
 * Verifies a PayGate webhook: header "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>".
 * Checks the signature over the raw bytes, the timestamp (5 minutes), and that the event is new.
 */
export function createWebhookVerifier(secret: string, seen: Set<string>) {
  const key = utf8Encode(secret);
  return async function verify(rawBody: string, header: string | undefined, nowSeconds: number) {
    const parts = Object.fromEntries((header ?? "").split(",").map((part) => part.split("=", 2) as [string, string]));
    const timestamp = Number(parts.t);
    if (!Number.isInteger(timestamp) || typeof parts.v1 !== "string") return { ok: false, reason: "malformed signature" };
    const expected = await hmacSha256(`${timestamp}.${rawBody}`, key);
    if (!timingSafeEqualString(expected, parts.v1)) return { ok: false, reason: "bad signature" };
    if (Math.abs(nowSeconds - timestamp) > 300) return { ok: false, reason: "too old" };
    const event = JSON.parse(rawBody) as { id: string; type: string };
    if (seen.has(event.id)) return { ok: true, duplicate: true };
    seen.add(event.id);
    return { ok: true, duplicate: false, event };
  };
}
```

webhook-demo.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { hmacSha256, utf8Encode } from "@zudojs/crypto";
import { createWebhookVerifier } from "./webhook.js";

const secret = randomBytes(32).toString("base64url"); // DEMO ONLY: yours comes from the environment
const verify = createWebhookVerifier(secret, new Set());
const now = 1_790_000_000;
const sign = async (body: string, t: number, key = secret) => `t=${t},v1=${await hmacSha256(`${t}.${body}`, utf8Encode(key))}`;

const body = JSON.stringify({ id: "evt_1", type: "charge.succeeded", reference: "pay_7" });
console.log("genuine:     ", await verify(body, await sign(body, now), now));
console.log("again:       ", await verify(body, await sign(body, now), now));
console.log("edited body: ", await verify(body.replace("pay_7", "pay_8"), await sign(body, now), now));
console.log("wrong secret:", await verify(body, await sign(body, now, randomBytes(32).toString("base64url")), now));
console.log("replayed old:", await verify(body, await sign(body, now - 3600), now));
console.log("no header:   ", await verify(body, undefined, now));
```

Output of `npx tsx webhook-demo.ts`

```ts
genuine:      {
  ok: true,
  duplicate: false,
  event: { id: 'evt_1', type: 'charge.succeeded', reference: 'pay_7' }
}
again:        { ok: true, duplicate: true }
edited body:  { ok: false, reason: 'bad signature' }
wrong secret: { ok: false, reason: 'bad signature' }
replayed old: { ok: false, reason: 'too old' }
no header:    { ok: false, reason: 'malformed signature' }
```

The HMAC is computed over the *raw* body, before any JSON parsing, because re-serializing parsed JSON can change the bytes. `timingSafeEqualString` compares without leaking how many characters matched. `hmacSha256` itself refuses keys shorter than 16 bytes, so an empty or missing secret cannot produce signatures anyone could forge. A verified webhook then calls `settle`, which is already idempotent; the `seen` set would be a table in production.

TRY IT YOURSELF

### A readiness endpoint

The load balancer should stop sending payment traffic to an instance when PayGate is unreachable from it. Write `ready()` with the adapter registry's `healthAll`: 200 when every adapter is healthy or degraded, 503 otherwise, and the status of each adapter.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`const report = await oja.registry.healthAll({ timeout: 2000 })` gives you `report.status` (the worst of every adapter) and `report.adapters` (one entry per adapter).

HINT 2

`Object.fromEntries(Object.entries(report.adapters).map(([name, health]) => [name, health.status]))` turns the adapters map into `{ paygate: "healthy" }`. Only `"unhealthy"` should answer 503; a merely `"degraded"` gateway still gets traffic.

SOLUTION

readiness.tsNode.js only

```ts
import { startOjaPay } from "./oja-pay.js";

const oja = await startOjaPay();
async function ready() {
  const report = await oja.registry.healthAll({ timeout: 2000 });
  const status = report.status === "unhealthy" ? 503 : 200;
  return { status, gateways: Object.fromEntries(Object.entries(report.adapters).map(([name, health]) => [name, health.status])) };
}

console.log("PayGate up:  ", await ready());
await oja.paygate.stop(); // PayGate goes down
console.log("PayGate down:", await ready());
await oja.stop();
```

Output of `npx tsx readiness.ts`

```ts
PayGate up:   { status: 200, gateways: { paygate: 'healthy' } }
PayGate down: { status: 503, gateways: { paygate: 'unhealthy' } }
```

`healthAll` runs every adapter's `health()` with a timeout, and a check that throws or times out counts as unhealthy, so a hanging gateway cannot hang the readiness probe. Keep liveness (is the process alive?) separate: restarting a healthy process because PayGate is down would not help.

TRY IT YOURSELF

### Design refunds

Support staff must be able to refund a succeeded payment, fully or partly. Without code: which tables, states and rules do you need, and what can go wrong that the payment flow already taught you to handle?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A refund is a payment going the other way: which columns did the `payments` table need to stay safe under retries and races, and which of those does a refund need too?

HINT 2

Two support staff refunding the same payment at the same moment is the same shape of problem as two clicks creating two payments — what stopped that, and what must the database enforce here so refunds can never add up to more than was paid?

HINT 3

The gateway call can time out or answer unknown exactly as a charge can. What must never happen to a refund whose outcome is unknown, and who finds out later?

SOLUTION

- A `refunds` table: payment id, amount in kobo, status (`processing`, `succeeded`, `failed`, `unknown`), the staff member, an idempotency key and a fingerprint, like payments.
- A rule the database enforces: the sum of non-failed refunds never exceeds the payment's amount. Check it in the same transaction that inserts the refund, with the payment row locked (`FOR UPDATE`), so two refunds clicked at once cannot both pass.
- The gateway call uses a key derived from the refund id, gets `succeeded`/`failed`/`unknown`, and `unknown` goes to reconciliation, never to "failed".
- Only staff with a `payment:refund` permission, checked with @zudojs/permissions; every refund written to an audit table in the same transaction.
- A `payment.refunded` event through the outbox, and an SMS through the same idempotent notification worker, with kind `refund`.

## Summary

- Reason about every step: can it arrive twice, fail halfway, or never answer? The answers are the design.
- Client keys, scoped per user with a request fingerprint, make payment creation idempotent; a partial unique index allows one live payment per order; the amount always comes from the order.
- The gateway adapter maps everything to succeeded, declined or unknown, and retries POST only because each charge carries an idempotency key derived from the payment.
- Unknown is not failed. Reconciliation and client retries look the charge up and never charge again.
- The status change and its event commit together through an outbox; delivery is at least once, so the queue, the worker and the SMS provider each drop duplicates.
- Tests reproduce the incidents: double taps, simultaneous requests, lost and missing answers, a database failure after the charge, and a flaky SMS provider.

Next, [a multi-tenant SaaS](https://zudojs.oyinlola.site/learn/usecase-saas): the same rigour, when every row belongs to one of many customers.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
