---
title: "Microservices — ZudoJS Academy"
description: "Why teams split into microservices, why not to start there, and how services discover, call each other, stay consistent, survive failures and stay observable."
source: https://zudojs.oyinlola.site/learn/zudo-microservices
---

LEVEL 15 · LESSON 3 OF 5

Architecture modes Advanced

# Microservices

Why teams split into microservices, why not to start there, and how services discover, call each other, stay consistent, survive failures and stay observable.

- **55 min** to read and try
- **You need:** From monolith to modular monolith, and the lessons on HTTP, queues and observability
- **You build:** Two ShopFlow services that call each other over HTTP with timeouts, retries, idempotency keys and a shared trace

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decide when splitting into services pays for the network problems it creates
- Give services a discovery mechanism and call each other over HTTP with a timeout
- Add retries with backoff and a circuit breaker around a flaky dependency
- Make a request idempotent with an idempotency key so a retried call cannot double-charge
- Replace a cross-service transaction with an outbox and a saga
- Propagate a correlation id and traceparent across service calls for a shared trace

## Why microservices exist

A **microservice** is a small application that owns one business area and runs as its own process, usually on its own servers, with its own database. ShopFlow split into microservices could be a `users` service, a `catalog` service, an `orders` service and a `payments` service, each deployed separately. They talk over the network.

Teams do this for real reasons:

- **Independent deployment.** The payments team can release five times a day without waiting for the catalog team.
- **Independent scaling.** On a sale day the catalog gets a hundred times more reads than payments. You can run twenty catalog servers and two payment servers.
- **Fault isolation.** A memory leak in the recommendations service does not crash checkout.
- **Different needs.** One service may need a search engine, another a different language.

### Why you should not start with them

Every one of those benefits has a price, and you pay it from the first day:

- **A function call becomes a network call.** It is a thousand times slower, and it can fail, hang or arrive twice. In [the modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith), `catalog.reserve()` could not time out. Over HTTP it can.
- **One database transaction is gone.** Orders and catalog now have separate databases, so "save the order and reduce the stock, or neither" needs new patterns.
- **Operations multiply.** Ten services mean ten deployments, ten dashboards, ten sets of logs to search when a customer says "my order failed".

> START WITH A MODULAR MONOLITH
>
> If you do not know yet where the boundaries of your business are, you will draw them wrong, and moving a boundary between two services is far harder than moving it between two folders. Build a modular monolith first. Extract a module into a service when one of the reasons above is real and measured, not expected.

Because you built ShopFlow as modules with small public APIs, extracting one is mostly mechanical: the `CatalogApi` interface stays, and its implementation changes from "call the function" to "send an HTTP request". Everything in the rest of this lesson is about making that HTTP request as reliable as the function call was.

## Boundaries and discovery

Two rules carry over from modules and become strict:

- **A service owns its data.** Each service has its own database, or at least its own schema that nobody else can log in to. No other service reads its tables. If orders needs a product's price, it asks the catalog service, or keeps its own copy from an event.
- **A service is reached only through its API.** Its HTTP routes, RPC procedures or messages are its public API, and changing them needs the same care as changing a function every other team calls.

### How a service finds another

**Service discovery** means: how does the orders service know where the catalog service is? There are three common answers, from simple to complex:

1. **Configuration.** The address is an environment variable, such as `CATALOG_URL=http://catalog:3000`.
2. **DNS.** Docker Compose and Kubernetes give every service a name. `http://catalog:3000` works because the platform's DNS answers `catalog` with the right address, even when containers move. You will see this in [the deployment lesson](https://zudojs.oyinlola.site/learn/deployment).
3. **A service registry** such as Consul. Each instance registers itself; callers ask the registry. You need this only at a scale where the first two stop working.

Start with the first two together: an environment variable that holds a DNS name. Read and check it at startup, like any other configuration:

service-urls.ts

```ts
type Env = Record<string, string | undefined>;

function serviceUrl(env: Env, name: string): URL {
  const raw = env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} must be an http(s) URL`);
  return url;
}

// In the app you pass process.env; here two made-up environments show both outcomes.
const env: Env = { CATALOG_URL: "http://catalog:3000", PAYMENTS_URL: "https://payments.internal" };
console.log(serviceUrl(env, "CATALOG_URL").host);

try {
  serviceUrl({}, "CATALOG_URL");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx service-urls.ts` and of the browser terminal

```ts
catalog:3000
CATALOG_URL is not set
```

A missing address stops the service at startup, with a clear message, instead of failing on the first customer request.

## Ways services talk

| Style | How it works | Good for | ZudoJS |
| --- | --- | --- | --- |
| HTTP | Request and response, the caller waits | Questions that need an answer now: "what does this cost?" | `@zudojs/http` server and `HttpClient` |
| RPC | Call a named procedure with typed input and output | The same, with a typed contract shared by both sides | `@zudojs/rpc`, from [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc) |
| Events | "This happened", sent to whoever listens | Telling other services about changes: `order.placed` | `@zudojs/events` in a process; a broker between processes |
| Messages and queues | A job is stored and processed later, with retries | Work the caller does not need to wait for: e-mails, invoices | `@zudojs/messaging`, `@zudojs/queue` |

The first two are **synchronous**: the caller waits, so if the other service is down, the caller is stuck too. The last two are **asynchronous**: the caller hands the work over and moves on. A good rule: use synchronous calls only when the user is waiting for the answer, and asynchronous ones for everything else.

> NOTE
>
> The in-memory bus and queue you used in earlier lessons live inside one process. Between services, the same patterns run on a **message broker**, a separate server that stores messages until they are handled, such as RabbitMQ, Kafka, NATS or Redis. The code shape stays the same: publish, subscribe, process with retries.

## Two services over HTTP

Here are two real services in one file. `inventory` answers stock questions. `orders` asks it before accepting an order. Each runs its own HTTP server on **port 0**, which means "any free port", so the example never collides with something already running on your computer.

The inventory service has two problems on purpose: its first answer is a `503 Service Unavailable`, and it takes 2 seconds to answer for a lamp. The orders service protects itself with the `HttpClient` from [the HTTP lesson](https://zudojs.oyinlola.site/learn/zudo-http):

- `timeout: 1000`: give up on any single request after one second.
- `retry`: try a failed `GET` up to 2 more times when the answer is 429, 502, 503 or 504, or when it timed out, waiting a little longer each time.

two-services.tsNode.js only

```ts
import { HttpClient, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

let calls = 0;
const inventory = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 0,
  handler: async (request) => {
    calls += 1;
    console.log(`inventory [${request.id}] ${request.path} (call ${calls})`);
    if (calls === 1) return createResponseContext({ status: 503 }).json({ error: "warming up" });
    if (request.path === "/stock/lamp") await new Promise((resolve) => setTimeout(resolve, 2000));
    return { stock: 7 };
  },
});
await inventory.start();

const stock = new HttpClient({
  baseUrl: `http://127.0.0.1:${inventory.address?.port}`,
  timeout: 1000,
  retry: { retries: 2, retryDelay: 100, maxRetryDelay: 300 },
});

const orders = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 0,
  handler: async (request) => {
    const id = request.id;
    const sku = request.getQuery("sku");
    try {
      const answer = await stock.request<{ stock: number }>(`/stock/${sku}`, { headers: { "x-request-id": id } });
      return { sku, available: answer.data.stock > 0 };
    } catch (error) {
      console.log(`orders    [${id}] inventory failed: ${(error as Error).name}`);
      return createResponseContext({ status: 503 }).json({ error: "inventory unavailable, try again" });
    }
  },
});
await orders.start();

for (const sku of ["mug", "lamp"]) {
  const response = await fetch(`http://127.0.0.1:${orders.address?.port}/check?sku=${sku}`, {
    headers: { "x-request-id": `req-${sku}` },
  });
  console.log(`client    [req-${sku}] ${response.status}`, await response.json());
}
await orders.stop();
await inventory.stop();
```

Output of `npx tsx two-services.ts`

```ts
inventory [req-mug] /stock/mug (call 1)
inventory [req-mug] /stock/mug (call 2)
client    [req-mug] 200 { sku: 'mug', available: true }
inventory [req-lamp] /stock/lamp (call 3)
inventory [req-lamp] /stock/lamp (call 4)
inventory [req-lamp] /stock/lamp (call 5)
orders    [req-lamp] inventory failed: HttpClientTimeoutError
client    [req-lamp] 503 { error: 'inventory unavailable, try again' }
```

Follow the two requests:

- **The mug.** The first call got a 503. The client waited briefly and tried again, and the second call worked. The customer never saw the hiccup.
- **The lamp.** Inventory was too slow. After one second the client gave up on the call, waited briefly and tried again, three calls in all. When the last one timed out too, it threw `HttpClientTimeoutError`, and orders answered its own caller with a clear 503. Without the timeout, the customer would have waited as long as inventory wanted, and every waiting request would hold memory and a connection in the orders service.
- **The id in brackets** is a **correlation id**. The client sent `x-request-id: req-mug`. `request.id` reused it, orders passed it on, and inventory logged it. When a customer reports a failed order, you search every service's logs for one id and see the whole story.

The client retried the timeout because the request was a `GET`. By default it retries only `GET`, `HEAD` and `OPTIONS`, which read and change nothing. After a timeout, the caller cannot know whether the server did the work or not. Retrying a read is harmless, but retrying "charge this card" could charge twice, so a `POST` is never retried unless you ask for it. The next section shows how to make that safe.

> NOTE
>
> `request.id` reuses an incoming `x-request-id` only when it is 1 to 128 letters, digits or `. _ : -`. Anything else, such as spaces, quotes or line breaks, is ignored and a new random id is used instead. That matters, because an id from outside ends up in your logs. Pass `trustRequestId: false` to `createNodeHttpAdapter` to always generate a new id, for example on a public edge service where you do not want callers to choose it.

## Failure handling

In a network, everything eventually fails. Four tools cover most of it.

### 1. Timeouts everywhere

Every call to another service, database or API gets a timeout. A good starting point is a little above the slowest normal answer you measured. You saw it above.

### 2. Retries with backoff

Retry only errors that may go away (503, 429, a dropped connection, a timed-out read), only a few times, and wait longer each time. This is called **exponential backoff**: 100 ms, 200 ms, 400 ms. `HttpClient` also uses **full jitter**: it picks each wait at random between zero and that delay, so a thousand clients that failed at the same moment do not all retry at the same moment too. Never retry a 400 or a 404: the answer will not change.

### 3. Idempotency keys

An operation is **idempotent** when doing it twice has the same effect as doing it once. Reading is idempotent. Charging a card is not. To make it safe to retry, the caller creates a unique **idempotency key** for the operation and sends it with every attempt. The server remembers the answer for each key and, when the same key comes again, returns the saved answer instead of doing the work again.

Here the payments service charges the card, but is too slow to answer the first time, so the caller times out. The caller retries with the same key, which is safe now:

idempotency.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { HttpClient, HttpClientTimeoutError, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

const charges: number[] = [];
const answers = new Map<string, { chargeId: number }>();
let slowOnce = true;

const payments = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 0,
  handler: async (request) => {
    const key = request.getHeader("idempotency-key");
    if (!key) return createResponseContext({ status: 400 }).json({ error: "Idempotency-Key header required" });
    const saved = answers.get(key);
    if (saved) return { ...saved, replayed: true };
    charges.push(charges.length + 1);
    const answer = { chargeId: charges.length };
    answers.set(key, answer);
    if (slowOnce) {
      slowOnce = false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return { ...answer, replayed: false };
  },
});
await payments.start();

const client = new HttpClient({ baseUrl: `http://127.0.0.1:${payments.address?.port}`, timeout: 500 });
const key = randomUUID();
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const response = await client.request("/charges", { method: "POST", headers: { "idempotency-key": key }, body: { amount: 3200 } });
    console.log(`attempt ${attempt}:`, response.data);
    break;
  } catch (error) {
    if (!(error instanceof HttpClientTimeoutError)) throw error;
    console.log(`attempt ${attempt}: timed out, retrying with the same key`);
  }
}
console.log("cards charged:", charges.length);
await payments.stop();
```

Output of `npx tsx idempotency.ts`

```ts
attempt 1: timed out, retrying with the same key
attempt 2: { chargeId: 1, replayed: true }
cards charged: 1
```

The first attempt did charge the card, then the answer got lost in the timeout. Without the key, the retry would have charged a second time. With it, the service recognised the key and replayed the saved answer. The card was charged once.

In production the saved answers live in the database (or Redis) with an expiry of a day or so, not in a `Map`, and saving the answer happens in the same transaction as the charge.

### 4. Circuit breakers

When a service is down, retrying every request only adds load to a service that is already struggling, and makes every caller wait for its timeout. A **circuit breaker** watches the failures. After a few in a row it *opens*: calls fail at once, without touching the network. After a pause it lets one trial call through (*half-open*). If that works, it *closes* again. The name comes from the electrical switch that cuts the power before the wires melt.

circuit-breaker.ts

```ts
type State = "closed" | "open" | "half-open";

class CircuitBreaker {
  state: State = "closed";
  private failures = 0;
  private openedAt = 0;
  constructor(private readonly maxFailures: number, private readonly pauseMs: number, private readonly now: () => number) {}

  async call<T>(work: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.now() - this.openedAt < this.pauseMs) throw new Error("circuit open: failing fast");
      this.state = "half-open";
    }
    try {
      const result = await work();
      this.state = "closed";
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.state === "half-open" || this.failures >= this.maxFailures) {
        this.state = "open";
        this.openedAt = this.now();
      }
      throw error;
    }
  }
}

let clock = 0;
let inventoryUp = false;
const breaker = new CircuitBreaker(2, 5000, () => clock);
const askInventory = async () => {
  if (!inventoryUp) throw new Error("503 from inventory");
  return "7 in stock";
};

for (const [time, up] of [[0, false], [1, false], [2, false], [6000, true], [6001, true]] as const) {
  clock = time;
  inventoryUp = up;
  try {
    console.log(`t=${time}: ${await breaker.call(askInventory)} (${breaker.state})`);
  } catch (error) {
    console.log(`t=${time}: ${(error as Error).message} (${breaker.state})`);
  }
}
```

Output of `npx tsx circuit-breaker.ts` and of the browser terminal

```ts
t=0: 503 from inventory (closed)
t=1: 503 from inventory (open)
t=2: circuit open: failing fast (open)
t=6000: 7 in stock (closed)
t=6001: 7 in stock (closed)
```

After two failures the breaker opened. At `t=2` the call failed at once, without asking inventory at all. Five seconds later a trial call got through, inventory was back, and the breaker closed. The clock is passed in as a function so the example runs the same every time; in real code it is `Date.now`. Pair the breaker with a **fallback** where you can, such as "show the product without the stock count".

## Queues between services

After checkout, the customer needs a receipt e-mail. The customer does not need to wait for it, and a slow mail provider must not slow down or fail the checkout. That is work for a queue, from [the queue lesson](https://zudojs.oyinlola.site/learn/zudo-queue): orders adds a job and returns, and the job is retried with backoff until it works.

receipts.ts

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";

interface Receipt {
  readonly orderId: number;
  readonly email: string;
}

const queue = createInMemoryQueue<Receipt>(createQueueName("receipts"));
let attempt = 0;
let sent = false;

// email service
queue.process("send-receipt", async (job) => {
  attempt += 1;
  if (attempt < 3) throw new Error("mail provider unavailable");
  console.log(`email: receipt for order ${job.data.orderId} sent on attempt ${attempt}`);
  sent = true;
});

// orders service
await queue.add("send-receipt", { orderId: 1, email: "ada@example.com" }, { attempts: 5, backoff: { type: "exponential", delay: 20 } });
console.log("orders: checkout finished, receipt queued");

// A real worker runs as long as the server does. This demo waits until the job is done.
while (!sent) await new Promise((resolve) => setTimeout(resolve, 20));
const stats = await queue.getStats();
console.log("retried:", stats.retried, "succeeded:", stats.succeeded);
await queue.close();
```

Output of `npx tsx receipts.ts` and of the browser terminal

```ts
orders: checkout finished, receipt queued
email: receipt for order 1 sent on attempt 3
retried: 2 succeeded: 1
```

Orders finished first. The mail provider failed twice, and the queue retried the job each time after a growing pause, without anyone waiting. A job that fails all its `attempts` moves to the **dead-letter** list, where a person can look at it, instead of disappearing. Because a job may run more than once, make its handler idempotent too: remember which receipts were already sent.

> NOTE
>
> While a job is pending or being processed, the queue keeps Node.js alive on its own, as [the queue lesson](https://zudojs.oyinlola.site/learn/zudo-queue#recap) covers (`keepAlive: false` turns this off). The `while` loop here is not for that: it is so this script's own next lines, `getStats` and `close`, run after the retries finish instead of before them. In a service you would not need it, because nothing after the `add` call depends on this particular job's result.

## Consistency without distributed transactions

In [the monolith](https://zudojs.oyinlola.site/learn/zudo-monolith#checkout), "save the order and reduce the stock" was one database transaction. With two services and two databases there is no such thing. There is a protocol called **two-phase commit (2PC)** that tries to lock both databases and commit them together, but it is slow, needs every service up at the same time, and most modern databases and brokers do not support it across systems. Avoid it. Two patterns replace it.

### The outbox pattern

A classic bug: the orders service saves the order, then publishes `order.placed` to the broker, and crashes between the two. The order exists but nobody hears about it. Or the other way round: the event goes out, then the database write fails.

The **outbox** fixes it with one table. The service writes the event into an `outbox` table *in the same transaction* as the order. Either both rows are saved or neither. A separate loop, the **relay**, then reads unpublished rows, publishes them, and marks them as published. This example uses PGlite, the real PostgreSQL you used in [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database):

outbox.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { createEventBus } from "@zudojs/events";

const db = new PGlite();
await db.exec(`
  CREATE TABLE orders (id SERIAL PRIMARY KEY, sku TEXT NOT NULL, quantity INT NOT NULL);
  CREATE TABLE outbox (id SERIAL PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL, published_at TIMESTAMPTZ);
`);

async function placeOrder(sku: string, quantity: number): Promise<number> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>("INSERT INTO orders (sku, quantity) VALUES ($1, $2) RETURNING id", [sku, quantity]);
    const orderId = rows[0]!.id;
    await tx.query("INSERT INTO outbox (type, payload) VALUES ($1, $2)", ["order.placed", { orderId, sku, quantity }]);
    return orderId;
  });
}

// Stands in for the broker; the inventory service subscribes to it.
const broker = createEventBus();
broker.on("order.placed", (event) => console.log("inventory received", event.payload));

async function relay(): Promise<number> {
  const { rows } = await db.query<{ id: number; type: string; payload: Record<string, unknown> }>(
    "SELECT id, type, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 100",
  );
  for (const row of rows) {
    await broker.publishEvent({ type: row.type, payload: row.payload });
    await db.query("UPDATE outbox SET published_at = now() WHERE id = $1", [row.id]);
  }
  return rows.length;
}

await placeOrder("mug", 1);
await placeOrder("tee", 2);
console.log("relayed:", await relay());
console.log("relayed:", await relay());
await db.close();
```

Output of `npx tsx outbox.ts`

```ts
inventory received { sku: 'mug', orderId: 1, quantity: 1 }
inventory received { sku: 'tee', orderId: 2, quantity: 2 }
relayed: 2
relayed: 0
```

The second run found nothing left to send. If the relay crashes after publishing but before the `UPDATE`, the event is sent again on the next run. So the outbox gives you **at-least-once** delivery, and the receiving service must ignore duplicates, for example by remembering the `orderId`s it has already handled. At-least-once plus idempotent handlers is the normal, reliable combination.

### The saga pattern

A checkout across services is several steps, each in a different service: reserve the stock, charge the card, confirm the order. A **saga** runs them one after another, and gives each step a **compensation**: an action that undoes it. If a step fails, the saga runs the compensations of the steps that already succeeded, in reverse order. It does not roll back like a database; it moves forward to a consistent state ("order cancelled, stock released").

saga.ts

```ts
interface Step {
  readonly name: string;
  run(): Promise<void>;
  compensate(): Promise<void>;
}

async function runSaga(steps: Step[]): Promise<boolean> {
  const done: Step[] = [];
  for (const step of steps) {
    try {
      await step.run();
      console.log(`done: ${step.name}`);
      done.push(step);
    } catch (error) {
      console.log(`failed: ${step.name} (${(error as Error).message})`);
      for (const finished of done.reverse()) {
        await finished.compensate();
        console.log(`undone: ${finished.name}`);
      }
      return false;
    }
  }
  return true;
}

const ok = await runSaga([
  { name: "create pending order", run: async () => {}, compensate: async () => {} },
  { name: "reserve 1 mug (inventory service)", run: async () => {}, compensate: async () => {} },
  { name: "charge card (payments service)", run: async () => { throw new Error("card declined"); }, compensate: async () => {} },
  { name: "confirm order", run: async () => {}, compensate: async () => {} },
]);
console.log("order confirmed:", ok);
```

Output of `npx tsx saga.ts` and of the browser terminal

```ts
done: create pending order
done: reserve 1 mug (inventory service)
failed: charge card (payments service) (card declined)
undone: reserve 1 mug (inventory service)
undone: create pending order
order confirmed: false
```

This style, where one service tells the others what to do, is an **orchestrated** saga. In a **choreographed** saga there is no conductor: each service reacts to the previous service's event (`order.created` → inventory reserves → `stock.reserved` → payments charges …). Orchestration is easier to follow when you are starting. In a real saga every step is an HTTP call or a message with a timeout, retries and an idempotency key, and the saga's progress is saved in a table so it can continue after a crash.

REASON IT OUT

### Checkout spans three services: outbox, or saga?

ShopFlow's checkout now touches orders, inventory and payments, each with its own database. Reserving stock is a single write inside the inventory service, but charging the card and confirming the order are separate steps that can fail independently. Would you reach for the outbox pattern here, the saga pattern, or both?

**Show the reasoning**

The outbox is not a competitor to the saga; it is how each saga step tells the rest of the system what it did. "Reserve stock" is one service's own write, so it fits the outbox alone: save the reservation and publish `stock.reserved` in one transaction. But "reserve, then charge, then confirm" is a sequence across three services with a rule about what to do when step two fails after step one succeeded — that is what only a saga expresses, because a single transaction cannot span three databases. So checkout needs a saga to sequence the steps and compensate on failure, and each step that changes its own service's data uses an outbox internally so its own "did it happen" question never depends on the broker being up at that exact moment.

## Following one request across services

The correlation id above lets you find the log lines of one request. **Distributed tracing**, from [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability), goes further: it records how long each step took in each service and how they nest. The standard way to pass the trace from one service to the next is the W3C `traceparent` header. `@zudojs/observability` writes and reads it for you:

traceparent.tsNode.js only

```ts
import { createObservability, formatTraceparent, parseTraceparent } from "@zudojs/observability";

const ordersObs = createObservability({ serviceName: "orders", useConsoleExporters: false });
const inventoryObs = createObservability({ serviceName: "inventory", useConsoleExporters: false });

// orders: start a span and put its context in the outgoing request
const checkout = ordersObs.tracer.startSpan("POST /checkout");
const header = formatTraceparent(checkout.context);
console.log("traceparent:", header);

// inventory: read the header and continue the same trace
const reserve = inventoryObs.tracer.startSpan("reserve stock", { parent: parseTraceparent(header) });
console.log("same trace:", reserve.context.traceId === checkout.context.traceId);
console.log("child of checkout:", reserve.context.parentSpanId === checkout.context.spanId);
console.log("forged header:", parseTraceparent("00-not-a-trace"));

reserve.end();
checkout.end();
await ordersObs.shutdown();
await inventoryObs.shutdown();
```

Output of `npx tsx traceparent.ts`

```ts
traceparent: 00-cb48117a31190094f0093378c0bcab43-097763d1485c4cd3-01
same trace: true
child of checkout: true
forged header: undefined
```

The header carries the trace id and the id of the span that made the call. Inventory's span joined the same trace as a child of checkout, so a tracing tool can draw the whole request as one timeline across both services. A malformed header is refused, and the span would start a fresh trace instead. With an exporter configured, every service sends its spans to the same tracing backend, where you search by trace id.

## Practice

TRY IT YOURSELF

### Retry only what is safe

Write `shouldRetry(method, status)` that returns `true` only for `GET`, `HEAD` and `PUT` requests that failed with 429, 502, 503 or 504. Why is `PUT` on the list but not `POST`?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Both sets already exist; the function only needs to ask each of them one question and combine the answers.

HINT 2

`return SAFE.has(method) && TRANSIENT.has(status);`

SOLUTION

should-retry.js

```ts
const SAFE = new Set(["GET", "HEAD", "PUT"]);
const TRANSIENT = new Set([429, 502, 503, 504]);

function shouldRetry(method, status) {
  return SAFE.has(method) && TRANSIENT.has(status);
}

console.log(shouldRetry("GET", 503));
console.log(shouldRetry("GET", 404));
console.log(shouldRetry("PUT", 502));
console.log(shouldRetry("POST", 503));
```

Output of `node should-retry.js` and of the browser terminal

```ts
true
false
true
false
```

`PUT` replaces a resource with the value you send, so sending it twice leaves the same result: it is idempotent by definition. `POST` usually creates something, so a retry creates it twice. Retry a `POST` only with an idempotency key.

TRY IT YOURSELF

### Ignore duplicate events

The outbox delivers at least once. Write an inventory handler for `order.placed` that reduces the stock only the first time it sees an `orderId`. Deliver the same event twice and show the stock went down once.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard first: `if (handled.has(event.payload.orderId)) { console.log(...); return; }`, before touching `stock` at all.

HINT 2

After the guard: `handled.add(event.payload.orderId); stock -= event.payload.quantity; console.log(\`order ${event.payload.orderId}: stock is now ${stock}\`);`.

SOLUTION

dedupe.ts

```ts
import { createEventBus, type Event } from "@zudojs/events";

interface OrderPlaced {
  readonly orderId: number;
  readonly quantity: number;
}

const bus = createEventBus();
const handled = new Set<number>();
let stock = 10;

bus.on<Event<OrderPlaced>>("order.placed", (event) => {
  if (handled.has(event.payload.orderId)) {
    console.log(`order ${event.payload.orderId} already handled, skipping`);
    return;
  }
  handled.add(event.payload.orderId);
  stock -= event.payload.quantity;
  console.log(`order ${event.payload.orderId}: stock is now ${stock}`);
});

await bus.publishEvent({ type: "order.placed", payload: { orderId: 7, quantity: 2 } });
await bus.publishEvent({ type: "order.placed", payload: { orderId: 7, quantity: 2 } });
```

Output of `npx tsx dedupe.ts` and of the browser terminal

```ts
order 7: stock is now 8
order 7 already handled, skipping
```

In a real service, `handled` is a database table with a unique `order_id` column, written in the same transaction as the stock change.

TRY IT YOURSELF

### Add a fallback

Change the circuit breaker example so that when the breaker is open, the caller shows `"stock unknown"` instead of an error. Which ShopFlow pages could live with that fallback, and which could not?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A rejected promise can be given a fallback value with one method, without touching the breaker itself.

HINT 2

Which pages only ever *read* stock to display it, and which pages need to be sure enough stock exists before they let money change hands?

SOLUTION

Wrap the call: `const text = await breaker.call(askInventory).catch(() => "stock unknown");`. A product page can show "stock unknown" and still sell. Checkout cannot: it must not accept an order it cannot reserve, so there the right answer is a clear "please try again in a minute".

## Recap

- Microservices buy independent deployment, scaling and fault isolation, and cost you network failures, lost transactions and more operations. Start with a modular monolith and extract a module when a reason is real.
- A service owns its data and is reached only through its API. Find services through configuration plus DNS names.
- Use HTTP or RPC when a user waits for the answer, events and queues for everything else.
- Give every remote call a timeout. Retry only transient errors, with backoff and jitter. Make retried writes safe with idempotency keys, and stop hammering a dead service with a circuit breaker.
- No distributed transactions: the outbox publishes events reliably, and a saga undoes finished steps with compensations.
- Pass a correlation id and a `traceparent` header on every call so one request can be followed through every service.

Next, in [Event-driven systems](https://zudojs.oyinlola.site/learn/zudo-event-driven), you take the outbox pattern from this lesson further: consumers that survive retries, duplicates, crashes, dead letters and a change to the event's own shape.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
