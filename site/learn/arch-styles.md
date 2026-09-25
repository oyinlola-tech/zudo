---
title: "Architecture styles — ZudoJS Academy"
description: "Compare monoliths, modular monoliths, microservices, events, messages, CQRS and gateways by simulating them in-process, with injected latency and failures."
source: https://zudojs.oyinlola.site/learn/arch-styles
---

LEVEL 11 · LESSON 8 OF 12

Architecture Core

# Architecture styles

Compare monoliths, modular monoliths, microservices, events, messages, CQRS and gateways by simulating them in-process, with injected latency and failures.

- **60 min** to read and try
- **You need:** Clean architecture: ports and adapters, and Promise combinators
- **You build:** An in-process simulation of the BookStore as services, with a lossy network, idempotency keys, a circuit breaker, an at-least-once broker, an outbox, a CQRS projection, an API gateway and a trace

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a monolith, a modular monolith and microservices each buy and cost, without dogma
- Show with a simulation why retries across a network need idempotency, and protect callers with timeouts, jittered backoff and a circuit breaker
- Tell events from commands, handle at-least-once delivery with idempotent consumers, and publish reliably with an outbox
- Build a CQRS read model and explain its consistency lag
- Draw service boundaries around business capabilities and recognise a distributed monolith
- Follow one request through a gateway and several services with a trace

## "Let's split it into services"

The BookStore is a success. Three teams now work on it: catalog, orders and payments. Deploys collide every Friday, a slow sales report sometimes slows down checkout, and when the payment provider has a bad hour, the whole site feels broken. In a meeting someone says what someone always says: "We should move to microservices."

Maybe. But first, look at what changes when a function call becomes a network call. Here is checkout calling payments inside one program, 100 times:

monolith.ts

```ts
const charges = new Map<string, number>();

function chargeCard(orderId: string): { status: string } {
  charges.set(orderId, (charges.get(orderId) ?? 0) + 1);
  return { status: "charged" };
}

function checkout(orderId: string): boolean {
  return chargeCard(orderId).status === "charged";
}

let confirmed = 0;
for (let i = 1; i <= 100; i++) if (checkout(`ord-${i}`)) confirmed++;
console.log("orders confirmed:", confirmed, "of 100");
console.log("customers charged more than once:", [...charges.values()].filter((n) => n > 1).length);
```

Output of `npx tsx monolith.ts` and of the browser terminal

```ts
orders confirmed: 100 of 100
customers charged more than once: 0
```

Now the same checkout, with payments as a separate service. To run it here, the network is simulated in the same process: `sim.ts` delivers each call after a random delay and can lose requests and responses. The randomness comes from a **seeded** generator, so every run, in Node and in the browser, loses exactly the same messages and prints the same numbers:

sim.ts

```ts
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Faults {
  readonly latencyMs: readonly [number, number];
  readonly loseRequest?: number;
  readonly loseResponse?: number;
  readonly down?: boolean;
}

export type Reply<T> =
  | { readonly ok: true; readonly value: T; readonly ms: number }
  | { readonly ok: false; readonly reason: "timeout" | "unavailable"; readonly ms: number };

type Handler = (message: never) => unknown;

export class Network {
  readonly #services = new Map<string, { handler: Handler; faults: Faults }>();
  readonly #random: () => number;
  calls = 0;

  constructor(seed: number) {
    this.#random = seeded(seed);
  }

  register<M, R>(name: string, handler: (message: M) => R | Promise<R>, faults: Faults): void {
    this.#services.set(name, { handler: handler as Handler, faults });
  }

  setFaults(name: string, faults: Faults): void {
    const service = this.#services.get(name);
    if (service) service.faults = faults;
  }

  async call<R>(to: string, message: unknown, timeoutMs: number): Promise<Reply<R>> {
    this.calls++;
    const service = this.#services.get(to);
    if (!service || service.faults.down) return { ok: false, reason: "unavailable", ms: 1 };
    const { latencyMs: [min, max], loseRequest = 0, loseResponse = 0 } = service.faults;
    const ms = min + Math.floor(this.#random() * (max - min + 1));
    if (this.#random() < loseRequest) return { ok: false, reason: "timeout", ms: timeoutMs };
    const value = (await (service.handler as (m: unknown) => unknown)(message)) as R;
    if (this.#random() < loseResponse || ms > timeoutMs) return { ok: false, reason: "timeout", ms: timeoutMs };
    return { ok: true, value, ms };
  }
}
```

- `seeded` is a small pseudo-random generator (mulberry32): the same seed gives the same sequence of numbers between 0 and 1.
- `call` picks a latency, then may lose the request (the service never sees it) or the response (the service *did* the work, but the answer never arrives). Either way the caller only sees a timeout after `timeoutMs`. A service that is too slow looks exactly the same.
- Latencies are **simulated** milliseconds: numbers the simulation adds up, not time that passes. Nothing here waits.

Payments loses 1 response in 10, and checkout does the sensible-looking thing: it retries up to three times.

split.ts

```ts
import { Network } from "./sim.js";

const network = new Network(42);
const charges = new Map<string, number>();

network.register("payments", (request: { orderId: string; amountKobo: number }) => {
  charges.set(request.orderId, (charges.get(request.orderId) ?? 0) + 1);
  return { status: "charged" };
}, { latencyMs: [20, 120], loseResponse: 0.1 });

async function checkout(orderId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const reply = await network.call("payments", { orderId, amountKobo: 900_000 }, 200);
    if (reply.ok) return true;
  }
  return false;
}

let confirmed = 0;
for (let i = 1; i <= 100; i++) if (await checkout(`ord-${i}`)) confirmed++;

const twice = [...charges.values()].filter((n) => n > 1).length;
console.log("orders confirmed:", confirmed, "of 100");
console.log("customers charged more than once:", twice);
console.log("network calls:", network.calls);
```

Output of `npx tsx split.ts` and of the browser terminal

```ts
orders confirmed: 100 of 100
customers charged more than once: 10
network calls: 111
```

Every order was confirmed, and ten customers paid twice. When a response was lost, the card had already been charged; the caller could not tell "lost request" from "lost response", retried, and charged again. In the monolith this bug was *impossible*: a function call either returns or throws, and never "maybe happened".

That is the whole lesson in miniature. Every architecture style solves some problems and creates others. This lesson walks through the common styles, simulates the new problems each one brings, and shows the standard fixes, so you can choose with your eyes open.

## Before choosing a style

REASON IT OUT

### What must be true for the BookStore?

Before comparing styles, answer these about the BookStore. Each answer pushes toward one style or away from another.

- How many teams change the code, and how often do they block each other?
- Do parts of the system need very different scaling? (The catalog is read 1,000 times for each order placed.)
- Which operations must be all-or-nothing? Can "the order is saved" and "the stock is reduced" be true at different moments, even for a second?
- When the payment provider is down, what should a customer see: an error, or "order received, payment pending"?
- Who will be woken up at 3 a.m., and what will they need to find out which part is failing?

**Show the reasoning**

**Teams:** three teams can share one codebase if the boundaries between their parts are enforced; they cannot share one *deploy* forever if each ships daily. That argues for modules first and separate deploys only where the friction is real.

**Scaling:** a read-heavy catalog is usually solved with caching and read replicas, long before it needs to be a separate service. Different scaling is a reason to split, but a weaker one than people think.

**Consistency:** order and stock must agree. Inside one database that is one transaction. Across services, it becomes a *protocol* (a saga with compensations), and for a moment the two can disagree. Every boundary you draw between them costs you that.

**Degradation:** "order received, payment pending" is almost always better than an error. It needs an asynchronous step, a queue or a retry job, whatever the style.

**Operations:** in one process, a stack trace tells you where it failed. Across services you need correlation ids, logs, metrics and traces, built in from the start.

## The monolith

A **monolith** is one deployable program, usually with one database. "Monolith" is not an insult. It is how nearly every successful system starts, and many stay that way:

- **One transaction** can cover the order, the stock and the payment record. Consistency is free.
- **Calls are function calls:** nanoseconds, typed by the compiler, and they either return or throw.
- **Refactoring is cheap:** rename a function and the compiler finds every caller. Moving a rule between two services is a coordinated release.
- **One thing to deploy, monitor and debug.**

Its costs appear with growth: everyone deploys together, a memory leak in one feature takes down every feature (the **blast radius** is the whole app), and everything scales together. The worst monoliths are not big; they are **tangled**: any file can import any other, every table is read by every feature, and nobody can change one part without understanding all of it. That tangle has a name, the **big ball of mud**, and it is not caused by being one deployable. It is caused by missing boundaries.

## The modular monolith

A **modular monolith** keeps one deployable but draws hard boundaries inside it. Each **module** is a business capability (catalog, orders, payments) with:

- a small **public API**: one `index.ts` that exports what other modules may call;
- **its own data**: its own tables, which no other module reads or writes directly;
- clean architecture *inside* it, as in [the last lesson](https://zudojs.oyinlola.site/learn/arch-clean), if its rules justify it.

Boundaries that are not enforced erode, so enforce them the way you enforced the rings: with a checker. The rule is "code in one module may import another module only through that module's `index.ts`":

modules.ts

```ts
const files: Record<string, string> = {
  "src/modules/catalog/index.ts": `export { findBook, reserveStock } from "./stock.js";`,
  "src/modules/catalog/stock.ts": `import { bookTable } from "./book-table.js";`,
  "src/modules/orders/place-order.ts": `import { reserveStock } from "../catalog/index.js";
import { bookTable } from "../catalog/book-table.js";
import { Money } from "../../shared/money.js";`,
  "src/modules/payments/charge.ts": `import type { OrderPlaced } from "../orders/events.js";`,
};

function moduleOf(path: string): string | undefined {
  return /^src\/modules\/([\w-]+)\//.exec(path)?.[1];
}

function resolve(from: string, spec: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/").replace(/\.js$/, ".ts");
}

for (const [file, source] of Object.entries(files)) {
  for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const target = resolve(file, match[1]!);
    const [from, to] = [moduleOf(file), moduleOf(target)];
    if (to === undefined || to === from) continue;
    if (target !== `src/modules/${to}/index.ts`) console.log(`${from} reaches into ${to}: ${target}`);
  }
}
```

Output of `npx tsx modules.ts` and of the browser terminal

```ts
orders reaches into catalog: src/modules/catalog/book-table.ts
payments reaches into orders: src/modules/orders/events.ts
```

Orders may call `reserveStock` through the catalog's front door, but not read the catalog's book table behind it; payments may not import an internal file of orders. The shared `Money` is outside the modules, so it is allowed. With this in CI, the modules stay separable, and that is the modular monolith's real promise: if one module ever *needs* its own deploy, extracting it is a planned move, not an archaeological dig. [From monolith to modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith) builds one with ZudoJS modules.

What a modular monolith does *not* give you: independent deploys, independent scaling, or fault isolation between modules. For many teams, for many years, that is a fine trade.

## Microservices

**Microservices** split the system into separately deployed services, each owning its data and talking to the others over the network. What you buy:

- **Independent deploys:** the payments team ships without waiting for the catalog team.
- **Independent scaling and technology:** run 20 copies of the catalog and 2 of payments.
- **Fault isolation, if you build it:** a crashing recommendations service need not take checkout with it. Without timeouts and fallbacks, a failure spreads *faster* than in a monolith.
- **Clear ownership:** one team, one service, one on-call rota.

What you pay is summed up by the classic **fallacies of distributed computing**, eight assumptions that are false and that the monolith let you make: the network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology does not change, there is one administrator, transport cost is zero, and the network is homogeneous. The opening simulation broke the first one. The rest of this lesson deals with the others.

Two more costs are easy to miss. **Data**: each service owns its database, so a query that used to be a `JOIN` becomes calls between services, and a transaction becomes a saga. **Operations**: every service needs deploys, monitoring, logs, alerts and versioned APIs. Microservices are an organisational tool as much as a technical one: they pay off when many teams would otherwise block each other, and they rarely pay off for one team.

> NOTE
>
> **Conway's law**: a system's structure tends to copy the communication structure of the organisation that builds it. Three teams that talk rarely will produce three loosely connected parts, whether you plan it or not. Use it on purpose: draw service boundaries where team boundaries are, or will be.

## Drawing service boundaries

A boundary in the wrong place is worse than no boundary. The most common mistake is the **entity service**: a "book service", a "customer service", an "order service", each a thin wrapper around one table. Every feature then needs all of them, on every request. Here is a cart page that asks a catalog service for the price of each line, one call at a time, next to one batch call:

chatty.ts

```ts
import { Network } from "./sim.js";

const prices: Record<string, number> = { b1: 450_000, b2: 750_000, b3: 520_000 };
const cart = ["b1", "b2", "b3", "b1", "b2", "b3", "b1", "b2", "b3", "b1"];

const network = new Network(4);
network.register("catalog", (m: { bookId: string }) => prices[m.bookId] ?? 0, { latencyMs: [20, 60] });
network.register("catalog-batch", (m: { bookIds: string[] }) => m.bookIds.map((id) => prices[id] ?? 0), { latencyMs: [25, 70] });

let waited = 0;
let total = 0;
for (const bookId of cart) {
  const reply = await network.call<number>("catalog", { bookId }, 200);
  waited += reply.ms;
  if (reply.ok) total += reply.value;
}
console.log(`one call per line: ${network.calls} calls, ${waited} ms simulated, total ${total}`);

const before = network.calls;
const batch = await network.call<number[]>("catalog-batch", { bookIds: cart }, 200);
const batchTotal = batch.ok ? batch.value.reduce((a, b) => a + b, 0) : 0;
console.log(`one batch call: ${network.calls - before} call, ${batch.ms} ms simulated, total ${batchTotal}`);
```

Output of `npx tsx chatty.ts` and of the browser terminal

```ts
one call per line: 10 calls, 405 ms simulated, total 5610000
one batch call: 1 call, 47 ms simulated, total 5610000
```

Ten calls instead of one, each with its own latency and its own chance to fail. A system whose services must all be up, and must all be deployed together because every change touches several of them, is a **distributed monolith**: the costs of microservices with the coupling of a monolith. It is the worst of both.

Better boundaries follow **business capabilities**, what the business *does*: sell books (catalog and pricing), take orders, take payments, ship parcels. In domain-driven design these are called **bounded contexts**: areas where a word has one meaning. "Book" means title and price in the catalog, a line on an order in ordering, and a parcel weight in shipping; each context keeps its own model of it instead of sharing one giant `Book`. Good boundaries share these signs:

- Most changes touch **one** side. Things that change together live together.
- Each side **owns its data**, and the other side gets what it needs through an API or events, never through the database.
- A request needs **few** calls across the boundary, and the boundary survives one side being down (orders can still be placed while shipping is down).
- Rules that must be **strongly consistent** (an order and its stock reservation) are on the same side, or you accept a saga.

## Failure handling

Every call across a network needs an answer to "what if it fails, or is slow, or happened but I never heard back?". Four tools cover most cases.

### 1. Idempotency keys

An operation is **idempotent** when doing it twice has the same effect as doing it once. Charging a card is not, so the caller makes it idempotent: it sends a key that stays the same across retries, and the service remembers the answer for each key. The opening simulation, fixed:

idempotent.ts

```ts
import { Network } from "./sim.js";

const network = new Network(42);
const charges = new Map<string, number>();
const answers = new Map<string, { status: string }>();

network.register("payments", (request: { key: string; orderId: string; amountKobo: number }) => {
  const earlier = answers.get(request.key);
  if (earlier) return earlier;
  charges.set(request.orderId, (charges.get(request.orderId) ?? 0) + 1);
  const answer = { status: "charged" };
  answers.set(request.key, answer);
  return answer;
}, { latencyMs: [20, 120], loseResponse: 0.1 });

async function checkout(orderId: string): Promise<boolean> {
  const key = `charge-${orderId}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const reply = await network.call("payments", { key, orderId, amountKobo: 900_000 }, 200);
    if (reply.ok) return true;
  }
  return false;
}

let confirmed = 0;
for (let i = 1; i <= 100; i++) if (await checkout(`ord-${i}`)) confirmed++;
console.log("orders confirmed:", confirmed, "of 100");
console.log("customers charged more than once:", [...charges.values()].filter((n) => n > 1).length);
console.log("network calls:", network.calls);
```

Output of `npx tsx idempotent.ts` and of the browser terminal

```ts
orders confirmed: 100 of 100
customers charged more than once: 0
network calls: 111
```

Same seed, same 111 calls, same lost responses, and nobody paid twice. The retry that used to charge again now gets the saved answer. [Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency) covers storing keys safely.

### 2. Timeouts and retries with jittered backoff

A call without a timeout can wait forever while holding a connection and a customer. A retry must wait before trying again, and wait longer each time (**exponential backoff**), because a struggling service needs air. But if 1,000 clients all back off by exactly 200 ms, they all come back in the same instant. **Jitter** picks each wait at random between zero and the backoff limit, spreading them out:

jitter.ts

```ts
import { seeded } from "./sim.js";

function busiestMoment(delays: number[]): number {
  const buckets = new Map<number, number>();
  for (const ms of delays) buckets.set(Math.floor(ms / 100), (buckets.get(Math.floor(ms / 100)) ?? 0) + 1);
  return Math.max(...buckets.values());
}

const random = seeded(99);
const clients = 1_000;
const base = 200;
for (const attempt of [1, 2, 3]) {
  const cap = base * 2 ** (attempt - 1);
  const plain = Array.from({ length: clients }, () => cap);
  const jittered = Array.from({ length: clients }, () => Math.floor(random() * cap));
  console.log(`retry ${attempt}: wait up to ${cap} ms | same moment without jitter: ${busiestMoment(plain)} | with full jitter: ${busiestMoment(jittered)}`);
}
```

Output of `npx tsx jitter.ts` and of the browser terminal

```ts
retry 1: wait up to 200 ms | same moment without jitter: 1000 | with full jitter: 501
retry 2: wait up to 400 ms | same moment without jitter: 1000 | with full jitter: 259
retry 3: wait up to 800 ms | same moment without jitter: 1000 | with full jitter: 132
```

Without jitter every retry wave hits the service at one moment; with full jitter the busiest 100 ms shrinks with each attempt. Retry only failures that may go away (timeouts, 503, 429), a few times at most, and only operations that are idempotent.

### 3. Circuit breakers

When payments hangs, each checkout waits for its timeout, three times. Customers wait, and the retries add load to a service that is already down. A **circuit breaker** counts failures; after a few in a row it *opens* and fails calls immediately. After a pause it goes *half-open* and lets one trial call through: success closes it, failure opens it again.

breaker.ts

```ts
export type BreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  state: BreakerState = "closed";
  #failures = 0;
  #openedAt = 0;

  constructor(
    private readonly maxFailures: number,
    private readonly pauseMs: number,
    private readonly now: () => number,
    private readonly onChange: (state: BreakerState) => void,
  ) {}

  allows(): boolean {
    if (this.state === "open" && this.now() - this.#openedAt >= this.pauseMs) this.#move("half-open");
    return this.state !== "open";
  }

  succeeded(): void {
    this.#failures = 0;
    if (this.state !== "closed") this.#move("closed");
  }

  failed(): void {
    this.#failures++;
    if (this.state === "half-open" || this.#failures >= this.maxFailures) {
      this.#openedAt = this.now();
      this.#move("open");
    }
  }

  #move(state: BreakerState): void {
    this.state = state;
    this.onChange(state);
  }
}
```

Sixty checkouts arrive half a second apart. Payments hangs from the 11th to the 40th. A `clock` variable carries simulated time:

outage.ts

```ts
import { CircuitBreaker } from "./breaker.js";
import { Network } from "./sim.js";

async function simulate(useBreaker: boolean): Promise<void> {
  const network = new Network(7);
  network.register("payments", () => ({ status: "charged" }), { latencyMs: [20, 80] });
  let clock = 0;
  const breaker = new CircuitBreaker(3, 5_000, () => clock, (state) => {
    if (useBreaker) console.log(`  t=${clock / 1000}s breaker ${state}`);
  });
  const tally = { confirmed: 0, deferred: 0, timedOut: 0, failedFast: 0 };

  for (let i = 1; i <= 60; i++) {
    clock = i * 500;
    if (i === 11) network.setFaults("payments", { latencyMs: [60_000, 60_000] });
    if (i === 41) network.setFaults("payments", { latencyMs: [20, 80] });
    let paid = false;
    for (let attempt = 1; attempt <= 3 && !paid; attempt++) {
      if (useBreaker && !breaker.allows()) {
        tally.failedFast++;
        break;
      }
      const reply = await network.call("payments", { orderId: `ord-${i}` }, 200);
      if (reply.ok) {
        paid = true;
        breaker.succeeded();
      } else {
        tally.timedOut++;
        breaker.failed();
      }
    }
    if (paid) tally.confirmed++;
    else tally.deferred++;
  }
  console.log(useBreaker ? "with a breaker:" : "without a breaker:", tally);
}

await simulate(false);
await simulate(true);
```

Output of `npx tsx outage.ts` and of the browser terminal

```ts
without a breaker: { confirmed: 30, deferred: 30, timedOut: 90, failedFast: 0 }
  t=5.5s breaker open
  t=10.5s breaker half-open
  t=10.5s breaker open
  t=15.5s breaker half-open
  t=15.5s breaker open
  t=20.5s breaker half-open
  t=20.5s breaker closed
with a breaker: { confirmed: 30, deferred: 30, timedOut: 5, failedFast: 29 }
```

Both runs confirm the same 30 orders: a breaker cannot make a dead service work. What changes is the cost of the outage: 90 calls that each held a customer for a full timeout, against 5 trial calls and 29 immediate answers. The breaker opened after three failures, probed every five seconds, and closed on the first success after recovery.

### 4. Fallbacks and bulkheads

Failing fast is only useful if you do something sensible instead. The 30 `deferred` orders above should become "order received, payment pending", retried later from a queue, not error pages. Optional data gets a **fallback**: a book page without reviews is still a book page (you will see this in the gateway below). A **bulkhead**, named after the walls that stop one flooded compartment sinking a ship, gives each dependency its own limited pool of connections or workers, so a hanging reviews service can use up only its own pool, not the one checkout needs.

## Event-driven and message-driven systems

So far every call was **synchronous**: the caller waits for an answer. Many interactions do not need one. Checkout does not need to wait for the receipt e-mail. Sending it **asynchronously**, through a message broker (RabbitMQ, Kafka, SQS, NATS, …), means a slow mail provider cannot slow or fail checkout. Two kinds of message travel this way, and it helps to keep them apart:

|  | Event | Command (message) |
| --- | --- | --- |
| Meaning | A fact: something happened | A request: please do this |
| Name | Past tense: `order.placed` | Imperative: `send-receipt` |
| Receivers | Zero, one or many; the publisher does not know them | Exactly one handler, known to the sender |
| Can be refused? | No, it already happened | Yes, the handler may fail or reject it |

An **event-driven** system reacts to events: orders publishes `order.placed`, and inventory, e-mail and analytics each subscribe without orders knowing. Adding a subscriber changes nothing in orders. The cost is that the flow of a business process is no longer written in one place; it emerges from subscriptions, and you need tracing to see it. A **message-driven** system sends commands through queues to a specific handler, which keeps the flow explicit while still decoupling the timing.

### At-least-once delivery

Brokers promise **at-least-once** delivery: a message is redelivered until a consumer acknowledges it. A consumer that crashes after doing the work but before acknowledging gets the message again. So consumers see **duplicates**, and "exactly once" is something you build on top, by making consumers idempotent. A small in-process broker that redelivers failed messages and, like a real one, sometimes delivers a message twice:

broker.ts

```ts
import { seeded } from "./sim.js";

export interface Message<T = unknown> {
  readonly id: string;
  readonly topic: string;
  readonly payload: T;
}

type Consumer = (message: Message<never>) => void | Promise<void>;

export class Broker {
  readonly #queue: { message: Message; consumer: Consumer; attempt: number }[] = [];
  readonly #consumers = new Map<string, Consumer[]>();
  readonly #random: () => number;
  readonly stats = { delivered: 0, redelivered: 0, duplicated: 0, deadLettered: 0 };

  constructor(seed: number, private readonly duplicateRate = 0, private readonly maxAttempts = 5) {
    this.#random = seeded(seed);
  }

  subscribe<T>(topic: string, consumer: (message: Message<T>) => void | Promise<void>): void {
    this.#consumers.set(topic, [...(this.#consumers.get(topic) ?? []), consumer as Consumer]);
  }

  publish(message: Message): void {
    for (const consumer of this.#consumers.get(message.topic) ?? []) this.#queue.push({ message, consumer, attempt: 1 });
  }

  async drain(): Promise<void> {
    for (let item = this.#queue.shift(); item; item = this.#queue.shift()) {
      this.stats.delivered++;
      try {
        await (item.consumer as (m: Message) => unknown)(item.message);
        if (this.#random() < this.duplicateRate) {
          this.stats.duplicated++;
          this.#queue.push({ ...item });
        }
      } catch {
        if (item.attempt >= this.maxAttempts) this.stats.deadLettered++;
        else {
          this.stats.redelivered++;
          this.#queue.push({ ...item, attempt: item.attempt + 1 });
        }
      }
    }
  }
}
```

Fifty orders, a mail provider that fails 20% of first attempts, and a broker that duplicates 10% of deliveries:

receipts.ts

```ts
import { Broker } from "./broker.js";
import type { Message } from "./broker.js";
import { seeded } from "./sim.js";

async function run(idempotent: boolean): Promise<void> {
  const broker = new Broker(3, 0.1);
  const mailDown = seeded(9);
  const sent = new Map<string, number>();
  const handled = new Set<string>();

  broker.subscribe("order.placed", (message: Message<{ orderId: string; email: string }>) => {
    if (idempotent && handled.has(message.id)) return;
    if (mailDown() < 0.2) throw new Error("mail provider timed out");
    sent.set(message.payload.orderId, (sent.get(message.payload.orderId) ?? 0) + 1);
    handled.add(message.id);
  });

  for (let i = 1; i <= 50; i++) {
    broker.publish({ id: `msg-${i}`, topic: "order.placed", payload: { orderId: `ord-${i}`, email: `customer${i}@shop.ng` } });
  }
  await broker.drain();

  const receipts = [...sent.values()].reduce((a, b) => a + b, 0);
  const extra = [...sent.values()].filter((n) => n > 1).length;
  console.log(idempotent ? "idempotent consumer:" : "naive consumer:", `${receipts} receipts for ${sent.size} orders, ${extra} customers got duplicates`);
  console.log("  broker:", broker.stats);
}

await run(false);
await run(true);
```

Output of `npx tsx receipts.ts` and of the browser terminal

```ts
naive consumer: 57 receipts for 50 orders, 7 customers got duplicates
  broker: { delivered: 69, redelivered: 12, duplicated: 7, deadLettered: 0 }
idempotent consumer: 50 receipts for 50 orders, 0 customers got duplicates
  broker: { delivered: 67, redelivered: 10, duplicated: 7, deadLettered: 0 }
```

The naive consumer sent 57 receipts for 50 orders. The idempotent one remembers the **message id** of everything it has handled and skips repeats, so every customer got exactly one. (Its broker numbers differ slightly because skipped duplicates never ask the fake mail provider for a failure, which shifts the seeded sequence.) In production the handled ids live in the consumer's database, written in the same transaction as the work.

### The outbox

Publishing has its own trap. Orders saves the order, then publishes `order.placed`. If the process dies between the two, the order exists and nobody ever hears about it. Publishing first is no better: then the event can announce an order that was never saved. The **transactional outbox** writes the event into an `outbox` table *in the same transaction* as the order; a separate **relay** loop publishes unsent rows and marks them sent:

outbox.ts

```ts
import { Broker } from "./broker.js";
import type { Message } from "./broker.js";

interface Database {
  readonly orders: string[];
  readonly outbox: { readonly message: Message; sent: boolean }[];
}

async function run(useOutbox: boolean): Promise<void> {
  const broker = new Broker(1);
  const heard: string[] = [];
  broker.subscribe("order.placed", (message: Message<{ orderId: string }>) => {
    heard.push(message.payload.orderId);
  });

  let db: Database = { orders: [], outbox: [] };
  const transaction = (change: (draft: Database) => void) => {
    const draft = structuredClone(db);
    change(draft);
    db = draft;
  };

  async function placeOrder(orderId: string, crash: boolean): Promise<void> {
    const message = { id: `evt-${orderId}`, topic: "order.placed", payload: { orderId } };
    transaction((draft) => {
      draft.orders.push(orderId);
      if (useOutbox) draft.outbox.push({ message, sent: false });
    });
    if (crash) throw new Error("process killed");
    if (!useOutbox) broker.publish(message);
  }

  async function relay(): Promise<void> {
    for (const row of db.outbox.filter((r) => !r.sent)) broker.publish(row.message);
    transaction((draft) => draft.outbox.forEach((row) => (row.sent = true)));
  }

  for (const [orderId, crash] of [["ord-1", true], ["ord-2", false]] as const) {
    await placeOrder(orderId, crash).catch((error: Error) => console.log(`  ${orderId}: ${error.message} after the commit`));
  }
  await relay();
  await broker.drain();
  console.log(useOutbox ? "with an outbox:" : "publish after commit:", "saved", db.orders, "| inventory heard", heard);
}

await run(false);
await run(true);
```

Output of `npx tsx outbox.ts` and of the browser terminal

```ts
  ord-1: process killed after the commit
publish after commit: saved [ 'ord-1', 'ord-2' ] | inventory heard [ 'ord-2' ]
  ord-1: process killed after the commit
with an outbox: saved [ 'ord-1', 'ord-2' ] | inventory heard [ 'ord-1', 'ord-2' ]
```

With publish-after-commit, `ord-1` was saved and lost to every other service for good. With the outbox, the crash only delayed it: the relay found the unsent row and published it. If the relay itself crashes after publishing but before marking the row sent, the event goes out twice, which is fine, because consumers are idempotent. The outbox and idempotent consumers are a pair. [Microservices in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-microservices#consistency) builds the outbox on PostgreSQL.

## CQRS: separate models for writing and reading

**Command query responsibility segregation** (CQRS) separates the code that changes data (commands) from the code that reads it (queries). In its light form, that is just two kinds of handler over one database, as in [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs). In its full form, the read side gets its own **read models**: tables shaped exactly for one screen, kept up to date by a **projector** that listens to events from the write side.

The BookStore wants a "best sellers" list and a "my orders" page. Computing them from the orders on every page view is slow at scale; a projection keeps them ready:

cqrs.ts

```ts
import { Broker } from "./broker.js";
import type { Message } from "./broker.js";

interface OrderPlaced {
  readonly orderId: string;
  readonly customer: string;
  readonly lines: readonly { readonly title: string; readonly quantity: number }[];
}

const broker = new Broker(5);
const writeModel = new Map<string, OrderPlaced>();
let nextId = 1;

function placeOrder(customer: string, lines: OrderPlaced["lines"]): string {
  const orderId = `ord-${nextId++}`;
  const event = { orderId, customer, lines };
  writeModel.set(orderId, event);
  broker.publish({ id: `evt-${orderId}`, topic: "order.placed", payload: event });
  return orderId;
}

const bestSellers = new Map<string, number>();
const ordersByCustomer = new Map<string, string[]>();
broker.subscribe("order.placed", (message: Message<OrderPlaced>) => {
  for (const line of message.payload.lines) {
    bestSellers.set(line.title, (bestSellers.get(line.title) ?? 0) + line.quantity);
  }
  const list = ordersByCustomer.get(message.payload.customer) ?? [];
  ordersByCustomer.set(message.payload.customer, [...list, message.payload.orderId]);
});

const topBooks = () => [...bestSellers].sort((a, b) => b[1] - a[1]).slice(0, 2);

placeOrder("ada", [{ title: "Things Fall Apart", quantity: 2 }]);
placeOrder("tunde", [{ title: "Half of a Yellow Sun", quantity: 1 }, { title: "Things Fall Apart", quantity: 1 }]);
const latest = placeOrder("ada", [{ title: "Purple Hibiscus", quantity: 4 }]);

console.log("written:", writeModel.size, "orders; ada's list says", ordersByCustomer.get("ada") ?? []);
await broker.drain();
console.log("after the projector ran:", ordersByCustomer.get("ada"), "includes", latest, "->", ordersByCustomer.get("ada")?.includes(latest));
console.log("best sellers:", topBooks());
```

Output of `npx tsx cqrs.ts` and of the browser terminal

```ts
written: 3 orders; ada's list says []
after the projector ran: [ 'ord-1', 'ord-3' ] includes ord-3 -> true
best sellers: [ [ 'Purple Hibiscus', 4 ], [ 'Things Fall Apart', 3 ] ]
```

The first line is the price of CQRS: right after Ada's order was written, her order list still said `[]`, because the projector had not run yet. Read models are **eventually consistent**: they catch up, but not instantly. The usual answers are to return the new order's data from the command itself, so the screen can show it at once, and to design screens that tolerate a short lag.

CQRS earns its cost when reads and writes have very different shapes or loads: many read models from one stream of events, heavy reporting next to fast checkout. For a form over a table it is ceremony. [Commands and queries (CQRS)](https://zudojs.oyinlola.site/learn/zudo-cqrs) covers the ZudoJS buses.

## API gateways

With several services, a browser should not need to know all their addresses, or authenticate with each. An **API gateway** is the single entry point: it authenticates once, routes each request to the right service, and applies rate limits and CORS in one place. It can also **aggregate**: build one response from several services, which is called a **backend for frontend** (BFF) when each client type (web, mobile) gets its own. Here the gateway builds a book page from the catalog (required) and reviews (optional, 100 ms budget, with a fallback), calling both in parallel with `Promise.all`:

gateway.ts

```ts
import { Network } from "./sim.js";

export interface Span {
  readonly id: number;
  readonly traceId: string;
  readonly parent: number | null;
  readonly name: string;
  readonly ms: number;
  readonly outcome: string;
}

export class Tracer {
  readonly spans: Span[] = [];
  #next = 1;

  record(span: Omit<Span, "id">): number {
    const id = this.#next++;
    this.spans.push({ id, ...span });
    return id;
  }
}

export function createBackend(seed: number): Network {
  const network = new Network(seed);
  const books = new Map([["b1", { title: "Things Fall Apart", priceKobo: 450_000 }]]);
  network.register("catalog", (m: { bookId: string; traceId: string }) => books.get(m.bookId) ?? null, { latencyMs: [20, 60] });
  network.register("reviews", (m: { bookId: string; traceId: string }) => (m.bookId === "b1" ? [5, 4, 5] : []), { latencyMs: [30, 160] });
  return network;
}

const SESSIONS = new Map([["token-ada", "ada"]]);

export async function getBookPage(network: Network, tracer: Tracer, traceId: string, token: string, bookId: string) {
  const user = SESSIONS.get(token);
  if (user === undefined) {
    tracer.record({ traceId, parent: null, name: `gateway GET /books/${bookId}`, ms: 1, outcome: "401" });
    return { status: 401, body: { error: "log_in_first" } };
  }
  const gatewaySpan = tracer.record({ traceId, parent: null, name: `gateway GET /books/${bookId}`, ms: 0, outcome: "" });
  const [book, reviews] = await Promise.all([
    network.call<{ title: string; priceKobo: number } | null>("catalog", { bookId, traceId }, 150),
    network.call<number[]>("reviews", { bookId, traceId }, 100),
  ]);
  tracer.record({ traceId, parent: gatewaySpan, name: "catalog getBook", ms: book.ms, outcome: book.ok ? "ok" : book.reason });
  tracer.record({ traceId, parent: gatewaySpan, name: "reviews list", ms: reviews.ms, outcome: reviews.ok ? "ok" : reviews.reason });

  let response: { status: number; body: unknown };
  if (!book.ok) response = { status: 503, body: { error: "catalog_unavailable" } };
  else if (book.value === null) response = { status: 404, body: { error: "no_such_book" } };
  else {
    const scores = reviews.ok ? reviews.value : [];
    const rating = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    response = { status: 200, body: { ...book.value, rating, reviews: reviews.ok ? "ok" : "unavailable" } };
  }
  const index = tracer.spans.findIndex((span) => span.id === gatewaySpan);
  tracer.spans[index] = { ...tracer.spans[index]!, ms: Math.max(book.ms, reviews.ms) + 2, outcome: String(response.status) };
  return response;
}
```

try-gateway.ts

```ts
import { Tracer, createBackend, getBookPage } from "./gateway.js";

const network = createBackend(3);
const tracer = new Tracer();
for (let i = 1; i <= 4; i++) {
  const response = await getBookPage(network, tracer, `trace-${i}`, "token-ada", "b1");
  console.log(response.status, JSON.stringify(response.body));
}
console.log((await getBookPage(network, tracer, "trace-5", "stolen", "b1")).status);
console.log((await getBookPage(network, tracer, "trace-6", "token-ada", "b9")).status);
```

Output of `npx tsx try-gateway.ts` and of the browser terminal

```ts
200 {"title":"Things Fall Apart","priceKobo":450000,"rating":4.7,"reviews":"ok"}
200 {"title":"Things Fall Apart","priceKobo":450000,"rating":4.7,"reviews":"ok"}
200 {"title":"Things Fall Apart","priceKobo":450000,"rating":null,"reviews":"unavailable"}
200 {"title":"Things Fall Apart","priceKobo":450000,"rating":4.7,"reviews":"ok"}
401
404
```

The third request's reviews missed their budget, and the page was still served, with `"reviews":"unavailable"` instead of an error. The bad token was stopped at the gateway without reaching any service. Because the calls run in parallel, the page takes as long as the slowest call, not the sum.

The gateway's risks mirror its strengths. Every request passes through it, so it must be highly available and fast. And it attracts logic: once business rules creep into the gateway, it becomes a monolith in front of your services. Keep it to routing, authentication, limits and simple aggregation.

## Observability across services

In a monolith a stack trace shows where a request failed. Across services, one customer's click becomes calls in several processes, each with its own logs. Three signals make it visible again ([Observability with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-observability) goes further):

- **Logs** with a **correlation id** (or trace id) that every service copies from the incoming request into its log lines and outgoing calls.
- **Metrics**: for each service, the rate of requests, the errors and the duration (the **RED** method).
- **Traces**: a tree of **spans**, one per operation, each with its parent, duration and outcome. The standard format is OpenTelemetry, and the id travels in a `traceparent` header.

The gateway above already recorded a span per call, with the trace id it passed along. Printing the tree of the slow request and a per-service summary:

try-trace.ts

```ts
import { Tracer, createBackend, getBookPage } from "./gateway.js";
import type { Span } from "./gateway.js";

const network = createBackend(3);
const tracer = new Tracer();
for (let i = 1; i <= 4; i++) await getBookPage(network, tracer, `trace-${i}`, "token-ada", "b1");

function printTrace(spans: readonly Span[], traceId: string): void {
  const inTrace = spans.filter((span) => span.traceId === traceId);
  const walk = (parent: number | null, indent: string): void => {
    for (const span of inTrace.filter((s) => s.parent === parent)) {
      console.log(`${indent}${span.name}  ${span.ms} ms (simulated)  ${span.outcome}`);
      walk(span.id, indent + "  ");
    }
  };
  console.log(traceId);
  walk(null, "  ");
}

const slow = tracer.spans.filter((span) => span.outcome === "timeout").map((span) => span.traceId);
console.log("traces with a timeout:", slow);
printTrace(tracer.spans, slow[0] ?? "trace-1");

const byService = new Map<string, { calls: number; errors: number }>();
for (const span of tracer.spans.filter((s) => s.parent !== null)) {
  const service = span.name.split(" ")[0]!;
  const entry = byService.get(service) ?? { calls: 0, errors: 0 };
  byService.set(service, { calls: entry.calls + 1, errors: entry.errors + (span.outcome === "ok" ? 0 : 1) });
}
console.log(Object.fromEntries(byService));
```

Output of `npx tsx try-trace.ts` and of the browser terminal

```ts
traces with a timeout: [ 'trace-3' ]
trace-3
  gateway GET /books/b1  102 ms (simulated)  200
    catalog getBook  49 ms (simulated)  ok
    reviews list  100 ms (simulated)  timeout
{ catalog: { calls: 4, errors: 0 }, reviews: { calls: 4, errors: 1 } }
```

The trace answers "why was trace-3 slow?" in one glance: the catalog answered in 49 ms, reviews hit the 100 ms timeout, and the gateway's time is the slower of the two. The summary is a tiny metrics view: reviews failed 1 of 4 calls. In a real system, these numbers drive alerts and dashboards.

## Choosing, without dogma

| Style | Buys you | Costs you | Fits when |
| --- | --- | --- | --- |
| Monolith | Transactions, simple deploys, easy refactoring | Shared deploys and blast radius; tangles without discipline | One or two teams, a young product |
| Modular monolith | Monolith benefits plus enforced boundaries and team ownership | Discipline and a checker; still one deploy | Several teams, one product, boundaries still moving |
| Microservices | Independent deploys, scaling, ownership, fault isolation | Network failures, sagas, versioned APIs, heavy operations | Many teams, stable boundaries, strong platform and on-call |
| Event-driven | Loose coupling in time; new subscribers without changing publishers | Duplicates, ordering, flows that are hard to follow | Side effects many parties care about |
| CQRS read models | Fast reads shaped per screen, independent scaling of reads | Eventual consistency, projections to maintain | Read and write loads or shapes differ a lot |
| API gateway | One entry, auth and limits in one place, aggregation | A critical hop; logic creep | More than one backend service facing clients |

These are not rival religions. A healthy system often combines them: a modular monolith that publishes events through an outbox, one or two services extracted where a team or a load profile truly needed it, a gateway in front, and a read model for the heavy screens.

When you do extract a service, do it gradually with the **strangler fig** pattern: put a routing layer (often the gateway) in front of the monolith, move one capability to a new service, route its traffic there, and repeat, while the old code keeps running until nothing calls it. Never do a big-bang rewrite of a working system.

## Testing distributed behaviour

- **Simulate failures in tests**, as this lesson did: a seeded fake network makes "the response was lost" a repeatable test instead of a production incident.
- **Contract tests between services**: the consumer writes down the requests it sends and the responses it relies on, and the provider's build checks it still satisfies them (consumer-driven contracts, for example with Pact). This replaces most slow end-to-end tests across services. [API contracts](https://zudojs.oyinlola.site/learn/api-contracts) covers the idea.
- **Test consumers with duplicates and reordering**: deliver the same message twice, and deliver events out of order, and check the state.
- **Chaos experiments** in staging or carefully in production: kill an instance, add latency, and watch whether timeouts, breakers and fallbacks behave as designed.

## Practice

TRY IT YOURSELF

### A saga with compensation

Placing an order across two services: inventory reserves copies, then payments charges. If the charge fails or times out, release the copies. Simulate 8 orders (every 4th one over the card limit, payments losing 20% of requests) and check at the end that stock left plus copies held by confirmed orders still equals the starting stock.

**Show a solution**

saga.ts

```ts
import { Network } from "./sim.js";

const network = new Network(21);
let stock = 20;
const held = new Map<string, number>();

network.register("inventory", (m: { op: "reserve" | "release"; orderId: string; quantity: number }) => {
  if (m.op === "release") {
    stock += held.get(m.orderId) ?? 0;
    held.delete(m.orderId);
    return "released";
  }
  if (held.has(m.orderId)) return "reserved";
  if (stock < m.quantity) return "out_of_stock";
  stock -= m.quantity;
  held.set(m.orderId, m.quantity);
  return "reserved";
}, { latencyMs: [10, 40] });

network.register("payments", (m: { orderId: string; amountKobo: number }) => (m.amountKobo > 2_000_000 ? "declined" : "charged"), {
  latencyMs: [20, 90],
  loseRequest: 0.2,
});

async function placeOrder(orderId: string, quantity: number, amountKobo: number): Promise<string> {
  const reserved = await network.call<string>("inventory", { op: "reserve", orderId, quantity }, 100);
  if (!reserved.ok || reserved.value !== "reserved") return "rejected";

  const charged = await network.call<string>("payments", { orderId, amountKobo }, 100);
  if (charged.ok && charged.value === "charged") return "confirmed";

  await network.call("inventory", { op: "release", orderId, quantity }, 100);
  return charged.ok ? "compensated (declined)" : "compensated (payments timed out)";
}

const outcomes = new Map<string, number>();
for (let i = 1; i <= 8; i++) {
  const outcome = await placeOrder(`ord-${i}`, 2, i % 4 === 0 ? 3_000_000 : 900_000);
  outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
}
const confirmedCopies = [...held.values()].reduce((a, b) => a + b, 0);
console.log(Object.fromEntries(outcomes));
console.log("stock left:", stock, "| held by confirmed orders:", confirmedCopies, "| adds up:", stock + confirmedCopies === 20);
```

Output of `npx tsx saga.ts` and of the browser terminal

```json
{
  confirmed: 5,
  'compensated (payments timed out)': 2,
  'compensated (declined)': 1
}
stock left: 10 | held by confirmed orders: 10 | adds up: true
```

This is an **orchestrated saga**: one place runs the steps and their compensations. The stock adds up, but look at "payments timed out". This fake only loses requests, so releasing was right. If a *response* had been lost, the customer would have been charged and their copies released. A real saga therefore does not compensate on a timeout directly: it retries the charge with the same idempotency key, or asks payments for the charge's status, and compensates only when it knows the charge did not happen.

TRY IT YOURSELF

### An idempotent projection

Run the best-sellers projection on a broker that duplicates 30% of deliveries. Show that the counts are wrong, then fix the projector so each event counts once.

**Show a solution**

projector-fix.ts

```ts
import { Broker } from "./broker.js";
import type { Message } from "./broker.js";

async function project(idempotent: boolean): Promise<Map<string, number>> {
  const broker = new Broker(8, 0.3);
  const soldCopies = new Map<string, number>();
  const seen = new Set<string>();
  broker.subscribe("order.placed", (message: Message<{ title: string; quantity: number }>) => {
    if (idempotent) {
      if (seen.has(message.id)) return;
      seen.add(message.id);
    }
    soldCopies.set(message.payload.title, (soldCopies.get(message.payload.title) ?? 0) + message.payload.quantity);
  });
  const orders = [["Things Fall Apart", 2], ["Purple Hibiscus", 1], ["Things Fall Apart", 1], ["Purple Hibiscus", 3], ["Things Fall Apart", 2]] as const;
  orders.forEach(([title, quantity], i) => broker.publish({ id: `evt-${i + 1}`, topic: "order.placed", payload: { title, quantity } }));
  await broker.drain();
  return soldCopies;
}

console.log("counts every delivery:", Object.fromEntries(await project(false)));
console.log("counts every event once:", Object.fromEntries(await project(true)));
```

Output of `npx tsx projector-fix.ts` and of the browser terminal

```ts
counts every delivery: { 'Things Fall Apart': 7, 'Purple Hibiscus': 4 }
counts every event once: { 'Things Fall Apart': 5, 'Purple Hibiscus': 4 }
```

*Things Fall Apart* sold 5 copies, not 7. Projections are consumers like any other, so they must be idempotent too. Some projections are idempotent by nature ("set the order's status to paid"); counters and sums never are.

TRY IT YOURSELF

### Draw the BookStore's boundaries

The BookStore has these features: book pages and search, prices and discounts, carts, orders, payments, stock, delivery, receipts by e-mail, reviews, and a sales dashboard. Group them into modules, say which could become separate services first and why, and name the events that cross the boundaries.

**Show a solution**

One reasonable answer (there are others):

- **Catalog**: book pages, search, prices, discounts. Read-heavy; the first candidate for caching, maybe later a service. Publishes `price.changed`.
- **Ordering**: carts, orders, and stock reservation. Stock stays here because "an order reserves stock" must be strongly consistent. Publishes `order.placed`, `order.cancelled`.
- **Payments**: a separate team, a regulated external provider, strict security. A good early service candidate. Publishes `payment.succeeded`, `payment.failed`.
- **Fulfilment**: delivery. Subscribes to `payment.succeeded`; publishes `parcel.shipped`.
- **Notifications**: receipts and shipping e-mails, driven only by events. Can fail without hurting checkout.
- **Reviews**: independent, optional on the book page with a fallback.
- **Reporting**: the sales dashboard as a CQRS read model built from events; never queries other modules' tables.

Start as a modular monolith with these modules and an outbox. Extract payments first if a separate team owns it, notifications if the mail volume disturbs checkout; keep ordering and its stock together.

## Recap

- A monolith gives transactions and simplicity; its enemy is the tangle, not the size. A modular monolith adds enforced boundaries and data ownership inside one deploy.
- Microservices buy independent deploys, scaling and ownership at the price of the network: lost messages, latency, sagas instead of transactions, and heavy operations. Entity services create a distributed monolith; draw boundaries around business capabilities.
- Across a network: timeouts everywhere, retries only for idempotent operations with idempotency keys and jittered backoff, circuit breakers to fail fast, fallbacks and bulkheads to contain failure.
- Events are facts for any number of subscribers; commands are requests for one handler. Brokers deliver at least once, so consumers must be idempotent, and the outbox makes publishing reliable.
- CQRS read models trade immediate consistency for fast, well-shaped reads. A gateway centralises entry, authentication and aggregation, and must stay thin.
- Observability (correlated logs, RED metrics, traces) is not optional once a request crosses processes.

Next: [What a framework does](https://zudojs.oyinlola.site/learn/frameworks), and then you build one.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
