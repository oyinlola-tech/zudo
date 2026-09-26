---
title: "Failure engineering — ZudoJS Academy"
description: "Break ShopFlow with a seeded fault injector, then keep it serving with timeouts, jittered retries, a circuit breaker, bulkheads, fallbacks and readiness checks."
source: https://zudojs.oyinlola.site/learn/dist-reliability
---

LEVEL 16 · LESSON 3 OF 4

Distributed systems Advanced

# Failure engineering

Break ShopFlow with a seeded fault injector, then keep it serving with timeouts, jittered retries, a circuit breaker, bulkheads, fallbacks and readiness checks.

- **60 min** to read and try
- **You need:** Distributed systems fundamentals, Contracts between services, and the lessons on background jobs, lifecycle and the runtime
- **You build:** A seeded fault injector, a failure matrix for ShopFlow before and after hardening, a tested circuit breaker, a bulkhead, and readiness and shutdown behaviour that keep traffic away from a sick instance

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Inject failures into every dependency of a service, deterministically, and read the result as a failure matrix
- Give every remote call a timeout that also cancels the work, and pass the caller's deadline down
- Retry only transient errors, with exponential backoff and seeded jitter, and explain retry amplification
- Build and test a circuit breaker with a rolling window and a single half-open probe
- Contain slow dependencies with bulkheads and choose safe fallbacks for each one
- Separate liveness from readiness and shut down without dropping accepted work

## The Friday the exchange-rate API went quiet

ShopFlow shows every price in naira, and in cedi for customers in Ghana. The cedi price comes from an external exchange-rate API. One Friday that API does not fail; it simply stops answering. Requests to it wait. Every checkout waits with them. After a few minutes every server's connections are held by customers staring at a spinner, and the shop is down, although the database, the payments provider and ShopFlow's own code are all fine.

That is the typical shape of a distributed outage: one small, optional dependency drags down everything that touches it. [Distributed systems fundamentals](https://zudojs.oyinlola.site/learn/dist-fundamentals) named the cause, **partial failure**: some parts work while others do not, and a caller cannot tell "slow" from "dead". This lesson is about engineering for it. The method has three steps:

1. **Break things on purpose**, one dependency at a time, and write down what the user sees. This is **fault injection**, the core idea of **chaos engineering**.
2. **Decide**, for each dependency, what the right behaviour is when it is down.
3. **Add the mechanism** that gives that behaviour, and keep the fault injection as a test, so it stays true.

You met timeouts, retries and a first circuit breaker in [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#failures). Here you go further: cancellation, deadlines, seeded jitter, retry amplification, a breaker with a rolling window, bulkheads, fallbacks per dependency, and the process-level failures (a crashed worker, a failing plugin, bad configuration, a client that hangs up) that no retry can fix.

## A seeded fault injector

To break a dependency on purpose, every call to it goes through a small wrapper that can make it fail. The wrapper supports three faults:

- `down`: every call fails at once, like a refused connection.
- `hang`: the call never answers, like the exchange-rate API that Friday. It stops only when the caller cancels it through an `AbortSignal`, the standard way to cancel work in JavaScript that you used in [asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async).
- `flaky`: some calls fail, chosen by a random number generator.

Randomness makes failures realistic, but a test that fails on Tuesday and passes on Wednesday teaches nothing. So the injector uses a **seeded** generator: a function that produces numbers that look random but are the same sequence every time you start from the same seed. When a chaos test finds a bug, the seed reproduces it exactly.

faults.ts

```ts
import { ServiceUnavailableError } from "@zudojs/errors";

export type Fault = "down" | "hang" | "flaky";

/* mulberry32: a tiny seeded random generator. Same seed, same sequence, every run. */
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

/* Waits until the signal aborts, then rejects with its reason. Without a signal it waits forever. */
function hangUntilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

export class FaultInjector {
  private readonly faults = new Map<string, Fault>();
  private readonly random: () => number;
  readonly calls = new Map<string, number>();

  constructor(seed: number, private readonly flakyRate = 0.5) {
    this.random = seeded(seed);
  }

  break(dependency: string, fault: Fault): this {
    this.faults.set(dependency, fault);
    return this;
  }

  heal(): void {
    this.faults.clear();
  }

  /* Wraps one operation of a dependency so the injector can break it. */
  wrap<I, R>(dependency: string, operation: (input: I) => R | Promise<R>) {
    return async (input: I, signal?: AbortSignal): Promise<R> => {
      this.calls.set(dependency, (this.calls.get(dependency) ?? 0) + 1);
      const fault = this.faults.get(dependency);
      if (fault === "down" || (fault === "flaky" && this.random() < this.flakyRate)) {
        throw new ServiceUnavailableError(`${dependency} is unavailable`);
      }
      if (fault === "hang") await hangUntilAborted(signal);
      return operation(input);
    };
  }
}
```

ShopFlow's dependencies are fakes in a `Map`, each operation wrapped by the injector. The database holds prices and orders; the cache holds a copy of the prices; the queue delivers receipt e-mails; the rates API converts naira to cedi; the OAuth provider signs people in with Google:

shop.ts

```ts
import type { FaultInjector } from "./faults.js";

export interface Order {
  readonly id: string;
  readonly sku: string;
  readonly totalKobo: number;
}

export function createShop(faults: FaultInjector) {
  const prices = new Map([["lamp", 1_250_000]]);
  const orders: Order[] = [];
  const outbox: string[] = [];
  const sent: string[] = [];
  const price = (sku: string) => {
    const kobo = prices.get(sku);
    if (kobo === undefined) throw new Error(`unknown sku ${sku}`);
    return kobo;
  };
  return {
    orders,
    outbox,
    sent,
    cache: { price: faults.wrap("cache", price) },
    db: {
      price: faults.wrap("database", price),
      saveOrder: faults.wrap("database", (input: { sku: string; totalKobo: number }) => {
        const order = { id: `ord_${orders.length + 1}`, ...input };
        orders.push(order);
        return order;
      }),
      saveToOutbox: faults.wrap("database", (job: string) => void outbox.push(job)),
    },
    queue: { enqueue: faults.wrap("queue", (job: string) => void sent.push(job)) },
    rates: { ngnPer: faults.wrap("rates", (currency: string) => (currency === "GHS" ? 105 : 1)) },
    oauth: { exchange: faults.wrap("oauth", (code: string) => ({ email: `${code}@example.com` })) },
  };
}

export type Shop = ReturnType<typeof createShop>;
export const naira = (kobo: number) => `₦${(kobo / 100).toFixed(2)}`;
```

The last piece is a harness that runs the same two requests, a checkout and a Google sign-in, once per fault, and prints what the customer would see. A customer who waits longer than 400 ms is reported as "no answer": in real life they would still be looking at a spinner.

matrix.ts

```ts
import { FaultInjector } from "./faults.js";
import type { Fault } from "./faults.js";
import { createShop } from "./shop.js";
import type { Shop } from "./shop.js";

export interface App {
  checkout(sku: string): Promise<string>;
  login(code: string): Promise<string>;
}

const scenarios: [string, string, Fault][] = [
  ["database down", "database", "down"],
  ["cache down", "cache", "down"],
  ["queue down", "queue", "down"],
  ["rates API hangs", "rates", "hang"],
  ["OAuth provider down", "oauth", "down"],
];

async function within(ms: number, work: () => Promise<string>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`no answer after ${ms} ms`), ms);
  });
  try {
    return await Promise.race([work().catch((error: Error) => `500 ${error.message}`), late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function failureMatrix(build: (shop: Shop) => App): Promise<void> {
  for (const [label, dependency, fault] of scenarios) {
    const shop = createShop(new FaultInjector(1).break(dependency, fault));
    const app = build(shop);
    const checkout = await within(400, () => app.checkout("lamp"));
    const login = await within(400, () => app.login("ada"));
    console.log(label);
    console.log(`  checkout: ${checkout}  [orders saved: ${shop.orders.length}]`);
    console.log(`  login:    ${login}`);
  }
}
```

Now the checkout as most people first write it: call each dependency in turn, and let errors fly:

naive.ts

```ts
import { failureMatrix } from "./matrix.js";
import { naira } from "./shop.js";

await failureMatrix((shop) => ({
  async checkout(sku) {
    const priceKobo = await shop.cache.price(sku);
    const ngnPerGhs = await shop.rates.ngnPer("GHS");
    const order = await shop.db.saveOrder({ sku, totalKobo: priceKobo });
    await shop.queue.enqueue(`receipt:${order.id}`);
    return `201 ${order.id} ${naira(priceKobo)} (about GH₵${(priceKobo / 100 / ngnPerGhs).toFixed(2)})`;
  },
  async login(code) {
    const user = await shop.oauth.exchange(code);
    return `200 signed in ${user.email}`;
  },
}));
```

Output of `npx tsx naive.ts` and of the browser terminal

```ts
database down
  checkout: 500 database is unavailable  [orders saved: 0]
  login:    200 signed in ada@example.com
cache down
  checkout: 500 cache is unavailable  [orders saved: 0]
  login:    200 signed in ada@example.com
queue down
  checkout: 500 queue is unavailable  [orders saved: 1]
  login:    200 signed in ada@example.com
rates API hangs
  checkout: no answer after 400 ms  [orders saved: 0]
  login:    200 signed in ada@example.com
OAuth provider down
  checkout: 201 ord_1 ₦12500.00 (about GH₵119.05)  [orders saved: 1]
  login:    500 oauth is unavailable
```

This is a **failure matrix**: one row per broken dependency, one column per thing a user does. Read it row by row:

- **Database down**: checkout fails. That is correct, since an order cannot be taken without somewhere to save it. The question is only whether it fails quickly and clearly.
- **Cache down**: checkout fails, although the price is sitting in the database. The cache is an optimisation, and a broken optimisation just took down the shop.
- **Queue down**: the worst row. The order was saved, then the receipt could not be queued, and the customer was told "500". They will press "Pay" again, and now there are two orders.
- **Rates API hangs**: no answer at all. This is the Friday outage.
- **OAuth provider down**: Google sign-in fails. That is unavoidable, but nothing tells the customer what to do instead.

REASON IT OUT

### Before you add a single timeout

For each dependency, answer three questions before you write code: (1) Is it needed to give a *correct* answer, or only a better one? (2) If it is down, what is the best thing the user can still get? (3) Is it safe to call it twice?

**Show the reasoning**

| Dependency | Needed for a correct answer? | Best behaviour when down | Safe to call twice? |
| --- | --- | --- | --- |
| Database | Yes: the order must be saved | Fail fast with 503 and `Retry-After`; stop sending traffic to a dead database | Reads yes; the order write only with an idempotency key |
| Cache | No: it copies the database | Read the price from the database, slower but correct | Yes |
| Queue | No: the receipt can be sent later | Save the job in the database's outbox, send it when the queue returns | Only if the e-mail sender ignores duplicates |
| Rates API | No: the cedi price is a courtesy | Use the last known rate if it is recent, otherwise show naira only | Yes (a read) |
| OAuth provider | Yes for Google sign-in, no for anything else | Say so and offer e-mail and password; existing sessions keep working | No: an authorization code works once |

Notice what is *not* on the list: "retry until it works". The answers depend on the business, not on the technology, which is why this table comes first. A fallback that quietly *allows* something when the permissions service is down would be a security hole, not resilience: for authorization, the safe fallback is always "deny".

## Timeouts that really stop the work

A **timeout** is a limit on how long you wait. It is the first defence against the Friday outage, and it has a trap: giving up waiting is not the same as stopping the work. If the work keeps running after the caller has gone, it still holds a connection, still loads the database, and may still write rows nobody will read. That leftover work is sometimes called **zombie work**.

A good timeout does two things: it stops the caller waiting, and it tells the work to stop through an `AbortSignal`. It also accepts a *parent* signal, so that if the whole request is cancelled (the customer closed the tab), the inner call stops too:

timeout.ts

```ts
import { TimeoutError } from "@zudojs/errors";

export async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  if (parent?.aborted) throw parent.reason;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(`gave up after ${ms} ms`)), ms);
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
  });
  try {
    return await Promise.race([work(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
  }
}
```

The `Promise.race` makes sure the caller gets its answer on time even when the work ignores the signal. Compare two versions of a slow sales report, one that checks the signal between steps and one that does not:

zombie.ts

```ts
import { withTimeout } from "./timeout.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const written = { stubborn: 0, polite: 0 };

async function stubbornReport(): Promise<string> {
  for (let step = 0; step < 5; step++) {
    await sleep(40);
    written.stubborn++;
  }
  return "report";
}

async function politeReport(signal: AbortSignal): Promise<string> {
  for (let step = 0; step < 5; step++) {
    await sleep(40);
    if (signal.aborted) throw signal.reason;
    written.polite++;
  }
  return "report";
}

for (const [name, report] of [["stubborn", stubbornReport], ["polite", politeReport]] as const) {
  try {
    await withTimeout(100, report);
  } catch (error) {
    console.log(`${name}: caller got ${(error as Error).name}`);
  }
}
await sleep(300);
console.log("stubborn kept writing after the timeout:", written.stubborn === 5);
console.log("polite stopped early:", written.polite < 5);
```

Output of `npx tsx zombie.ts` and of the browser terminal

```ts
stubborn: caller got TimeoutError
polite: caller got TimeoutError
stubborn kept writing after the timeout: true
polite stopped early: true
```

Both callers were answered on time. Only the polite report actually stopped. Real libraries differ in the same way: `fetch`, `node:timers/promises` and many database drivers accept a signal; others need their own cancel call (PostgreSQL has `pg_cancel_backend`). Check, for each client you use, what a timeout really does.

### Deadlines, not just timeouts

If checkout has 2 seconds in total and calls four services, each with its own 2-second timeout, the customer can wait 8 seconds. Instead, a request carries a **deadline**: a moment by which it must finish. Each call gets `min(its own limit, time left)`, and when the client goes away, everything stops. The `parent` argument above is how the request's signal reaches every inner call; [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc#timeouts) showed the same idea sent across the network as a deadline header.

How long should a timeout be? Measure the slow tail of normal traffic, for example the 99th percentile (the time 99 of 100 calls finish within), and set the timeout a little above it. A timeout below normal latency fails healthy calls; one far above it protects nothing.

## Retries, backoff and jitter

Some failures are **transient**: a dropped connection, a 503 from an instance that is restarting. Trying again a moment later often works. Others are **permanent**: invalid input, a missing record, a refused permission. Retrying those just repeats the failure, more slowly.

### Why jitter matters

Exponential backoff waits longer after each failure: 100 ms, 200 ms, 400 ms. `@zudojs/queue` computes exactly that with `calculateRetryDelay`, the function its own job retries use. Now imagine five instances that all lost the database at the same moment. Without randomness they all retry at the same moments too, and hit the recovering database in synchronized waves: a **thundering herd**. **Full jitter** picks each wait at random between zero and the backoff value, which spreads the retries out. Using the seeded generator, you can see the difference and get the same picture every run:

herd.ts

```ts
import { calculateRetryDelay } from "@zudojs/queue";
import { seeded } from "./faults.js";

const ceiling = (attempt: number) => calculateRetryDelay(attempt, { type: "exponential", delay: 100, maxDelay: 1000 });
const random = seeded(42);

function retryTimes(jitter: boolean): number[] {
  const times: number[] = [];
  let at = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    at += jitter ? Math.round(random() * ceiling(attempt)) : ceiling(attempt);
    times.push(at);
  }
  return times;
}

for (const jitter of [false, true]) {
  const buckets = new Map<number, number>();
  for (let instance = 0; instance < 5; instance++) {
    for (const at of retryTimes(jitter)) {
      const bucket = Math.floor(at / 100) * 100;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }
  const line = [...buckets].sort(([a], [b]) => a - b).map(([bucket, n]) => `${bucket}ms:${"#".repeat(n)}`).join(" ");
  console.log(jitter ? "full jitter:" : "no jitter:  ", line);
}
```

Output of `npx tsx herd.ts` and of the browser terminal

```ts
no jitter:   100ms:##### 300ms:##### 700ms:#####
full jitter: 0ms:###### 100ms:#### 200ms:# 300ms:# 400ms:###
```

Without jitter, all fifteen retries land in three instants, five at a time. With full jitter, they are spread across the whole period, and the database sees a trickle instead of three spikes. The queue's own retries use full jitter by default for the same reason (`DEFAULT_RETRY_BACKOFF` in `@zudojs/queue`). The waits printed here are computed from the seed, not measured, so they are the same on every machine.

### A retry helper

A retry helper needs four decisions: how many attempts, which errors are worth retrying, how long to wait, and how to wait. Passing the random generator and the `sleep` function in makes the helper testable: tests pass a seeded generator and a sleep that only records the wait:

retry.ts

```ts
import { ServiceUnavailableError, TimeoutError } from "@zudojs/errors";
import { calculateRetryDelay } from "@zudojs/queue";

export interface RetryOptions {
  readonly attempts: number;
  readonly baseMs: number;
  readonly maxMs: number;
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly isRetryable?: (error: unknown) => boolean;
  readonly onRetry?: (attempt: number, waitMs: number, error: unknown) => void;
}

export const isTransient = (error: unknown) => error instanceof ServiceUnavailableError || error instanceof TimeoutError;

export async function retry<T>(work: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work(attempt);
    } catch (error) {
      if (attempt >= options.attempts || !(options.isRetryable ?? isTransient)(error)) throw error;
      const ceiling = calculateRetryDelay(attempt, { type: "exponential", delay: options.baseMs, maxDelay: options.maxMs });
      const waitMs = Math.round(options.random() * ceiling);
      options.onRetry?.(attempt, waitMs, error);
      await options.sleep(waitMs);
    }
  }
}
```

retry-demo.ts

```ts
import { ValidationError } from "@zudojs/errors";
import { FaultInjector, seeded } from "./faults.js";
import { retry } from "./retry.js";
import { createShop } from "./shop.js";

const shop = createShop(new FaultInjector(7).break("rates", "flaky"));
const options = {
  attempts: 4,
  baseMs: 100,
  maxMs: 1000,
  random: seeded(3),
  sleep: async () => {},
  onRetry: (attempt: number, waitMs: number, error: unknown) =>
    console.log(`  attempt ${attempt} failed (${(error as Error).message}), waiting ${waitMs} ms`),
};

for (let request = 1; request <= 3; request++) {
  console.log(`request ${request}:`);
  try {
    const rate = await retry(() => shop.rates.ngnPer("GHS"), options);
    console.log(`  rate ${rate}`);
  } catch (error) {
    console.log(`  gave up: ${(error as Error).message}`);
  }
}

console.log("a permanent error:");
await retry(async () => {
  throw new ValidationError("currency XYZ is not supported");
}, options).catch((error: Error) => console.log(`  not retried: ${error.name}`));
```

Output of `npx tsx retry-demo.ts` and of the browser terminal

```ts
request 1:
  attempt 1 failed (rates is unavailable), waiting 72 ms
  attempt 2 failed (rates is unavailable), waiting 8 ms
  rate 105
request 2:
  rate 105
request 3:
  rate 105
a permanent error:
  not retried: ValidationError
```

With a flaky rates API, the first request failed twice and got through on its third attempt; the other two succeeded at once. Each wait was drawn at random from a range that doubles with every attempt, so a short wait after a long one is normal. The validation error was thrown straight back: no amount of waiting makes "XYZ" a currency.

### Retry amplification

Retries multiply. If the browser retries 3 times, the API gateway retries each of those 3 times, and the orders service retries each database call 3 times, one click can become 27 database calls, all arriving while the database is already in trouble:

amplification.ts

```ts
import { FaultInjector } from "./faults.js";
import { retry } from "./retry.js";
import { createShop } from "./shop.js";

const faults = new FaultInjector(1).break("database", "down");
const shop = createShop(faults);
const options = { attempts: 3, baseMs: 100, maxMs: 1000, random: () => 0.5, sleep: async () => {} };

const ordersService = () => retry(() => shop.db.price("lamp"), options);
const gateway = () => retry(ordersService, options);
const browser = () => retry(gateway, options);

await browser().catch(() => {});
console.log("one click, database calls:", faults.calls.get("database"));
```

Output of `npx tsx amplification.ts` and of the browser terminal

```ts
one click, database calls: 27
```

The rule: **retry at one layer only**, usually the one closest to the failing dependency, and let the others fail fast. Retry only idempotent operations, or operations protected by an idempotency key ([Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency)). Some teams also set a **retry budget**: retries may add at most, say, 10% extra traffic, so when everything fails, retries stop instead of tripling the load.

## A circuit breaker you can trust

When the database is down, a timeout still makes every request wait for it, and a retry makes every request wait several times. A **circuit breaker** notices that a dependency is failing and fails calls immediately for a while, without touching it. That protects the caller (fast answers) and the dependency (no traffic while it recovers).

The breaker in [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#failures) opened after a count of failures in a row. That is easy to fool: one success between failures resets it, although 90% of calls fail. A more robust breaker looks at a **rolling window** of recent calls:

- **Closed** (normal): calls go through. The last `windowSize` results are kept. When at least `minimumCalls` results exist and the failure rate reaches `failureRate`, it opens.
- **Open**: calls fail at once for `openMs`.
- **Half-open**: after the pause, exactly *one* probe call is let through. Other calls still fail fast; letting all of them through would hit a recovering service with a flood. A successful probe closes the breaker; a failed one opens it again.

Only failures that mean "the dependency is unhealthy" count: unavailability and timeouts. A validation error proves the dependency is up and answering, so it must not open the breaker. The clock is passed in, so tests control time:

breaker.ts

```ts
import { ServiceUnavailableError } from "@zudojs/errors";
import { isTransient } from "./retry.js";

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  readonly name: string;
  readonly windowSize: number;
  readonly minimumCalls: number;
  readonly failureRate: number;
  readonly openMs: number;
  readonly now: () => number;
  readonly isFailure?: (error: unknown) => boolean;
  readonly onStateChange?: (from: BreakerState, to: BreakerState) => void;
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private results: boolean[] = [];
  private openedAt = 0;
  private probing = false;

  constructor(private readonly options: BreakerOptions) {}

  get current(): BreakerState {
    return this.state;
  }

  async call<T>(work: () => Promise<T>): Promise<T> {
    if (this.state === "open" && this.options.now() - this.openedAt >= this.options.openMs) this.moveTo("half-open");
    if (this.state === "open" || (this.state === "half-open" && this.probing)) {
      throw new ServiceUnavailableError(`circuit ${this.options.name} is open, failing fast`);
    }
    if (this.state === "half-open") this.probing = true;
    try {
      const result = await work();
      this.record(false);
      return result;
    } catch (error) {
      this.record((this.options.isFailure ?? isTransient)(error));
      throw error;
    }
  }

  private record(failed: boolean): void {
    if (this.state === "half-open") {
      this.probing = false;
      this.results = [];
      if (failed) this.open();
      else this.moveTo("closed");
      return;
    }
    this.results.push(failed);
    if (this.results.length > this.options.windowSize) this.results.shift();
    const failures = this.results.filter(Boolean).length;
    if (this.results.length >= this.options.minimumCalls && failures / this.results.length >= this.options.failureRate) this.open();
  }

  private open(): void {
    this.openedAt = this.options.now();
    this.results = [];
    this.moveTo("open");
  }

  private moveTo(next: BreakerState): void {
    if (next === this.state) return;
    this.options.onStateChange?.(this.state, next);
    this.state = next;
  }
}
```

Put it in front of the database and let the database fail, recover partly, and recover fully, on a fake clock:

breaker-demo.ts

```ts
import { CircuitBreaker } from "./breaker.js";
import { FaultInjector } from "./faults.js";
import { createShop } from "./shop.js";

let clock = 0;
const faults = new FaultInjector(1);
const shop = createShop(faults);
const breaker = new CircuitBreaker({
  name: "database", windowSize: 10, minimumCalls: 4, failureRate: 0.5, openMs: 5000, now: () => clock,
  onStateChange: (from, to) => console.log(`  [t=${clock}] ${from} -> ${to}`),
});

async function request(label: string): Promise<void> {
  try {
    await breaker.call(() => shop.db.price("lamp"));
    console.log(`t=${clock} ${label}: ok`);
  } catch (error) {
    console.log(`t=${clock} ${label}: ${(error as Error).message}`);
  }
}

await request("healthy");
faults.break("database", "down");
for (let i = 1; i <= 4; i++) await request(`outage ${i}`);
clock = 1000;
await request("during the pause");
clock = 6000;
await request("probe");
clock = 12000;
faults.heal();
await request("probe");
await request("after recovery");
console.log("database calls made:", faults.calls.get("database"));
```

Output of `npx tsx breaker-demo.ts` and of the browser terminal

```ts
t=0 healthy: ok
t=0 outage 1: database is unavailable
t=0 outage 2: database is unavailable
  [t=0] closed -> open
t=0 outage 3: database is unavailable
t=0 outage 4: circuit database is open, failing fast
t=1000 during the pause: circuit database is open, failing fast
  [t=6000] open -> half-open
  [t=6000] half-open -> open
t=6000 probe: database is unavailable
  [t=12000] open -> half-open
  [t=12000] half-open -> closed
t=12000 probe: ok
t=12000 after recovery: ok
database calls made: 7
```

The outage opened the breaker once 3 of 4 calls had failed. The call during the pause failed without a database call. The first probe found the database still down and reopened the breaker for another 5 seconds; the second found it healthy and closed it. Nine requests, seven database calls: the two it saved (outage 4 and the call during the pause) are exactly the calls that would have piled onto a dead database. The transition lines appear before the request's own line because the breaker changes state during the call.

### Testing the breaker

A breaker is a small state machine, and state machines are tested with scripted scenarios. The one that breaks most hand-written breakers is two requests arriving at the same moment in half-open:

breaker-test.ts

```ts
import { ServiceUnavailableError, ValidationError } from "@zudojs/errors";
import { CircuitBreaker } from "./breaker.js";

let clock = 0;
const make = () => new CircuitBreaker({ name: "db", windowSize: 4, minimumCalls: 4, failureRate: 0.5, openMs: 1000, now: () => clock });
const ok = async () => "ok";
const down = async () => { throw new ServiceUnavailableError("db down"); };
const invalid = async () => { throw new ValidationError("bad sku"); };
const attempt = (breaker: CircuitBreaker, work: () => Promise<string>) => breaker.call(work).then(() => "ok", (e: Error) => e.name);

const tests: [string, () => Promise<boolean>][] = [
  ["stays closed below minimumCalls", async () => {
    const b = make();
    for (let i = 0; i < 3; i++) await attempt(b, down);
    return b.current === "closed";
  }],
  ["opens at 50% failures in the window", async () => {
    const b = make();
    for (const work of [ok, down, ok, down]) await attempt(b, work);
    return b.current === "open";
  }],
  ["validation errors do not count", async () => {
    const b = make();
    for (let i = 0; i < 4; i++) await attempt(b, invalid);
    return b.current === "closed";
  }],
  ["half-open lets exactly one probe through", async () => {
    clock = 0;
    const b = make();
    for (let i = 0; i < 4; i++) await attempt(b, down);
    clock = 1000;
    let calls = 0;
    const slowOk = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return "ok"; };
    const results = await Promise.all([attempt(b, slowOk), attempt(b, slowOk), attempt(b, slowOk)]);
    return calls === 1 && results.join() === "ok,ServiceUnavailableError,ServiceUnavailableError" && b.current === "closed";
  }],
  ["a failed probe reopens it", async () => {
    clock = 0;
    const b = make();
    for (let i = 0; i < 4; i++) await attempt(b, down);
    clock = 1000;
    await attempt(b, down);
    return b.current === "open";
  }],
];

for (const [name, test] of tests) console.log(`${(await test()) ? "PASS" : "FAIL"} ${name}`);
```

Output of `npx tsx breaker-test.ts` and of the browser terminal

```ts
PASS stays closed below minimumCalls
PASS opens at 50% failures in the window
PASS validation errors do not count
PASS half-open lets exactly one probe through
PASS a failed probe reopens it
```

These run in milliseconds because time is a variable, not a wait. In production, publish the breaker's state as a metric and log every transition: "the database breaker opened" is one of the most useful alerts you can have.

## Bulkheads: keep one leak from sinking the ship

A ship's hull is divided into watertight compartments called bulkheads, so one leak floods one compartment, not the ship. In software, a **bulkhead** gives each dependency its own limited pool of concurrent calls. When the rates API hangs, it can fill *its* pool, but not the capacity the database calls need.

bulkhead.ts

```ts
import { ServiceUnavailableError } from "@zudojs/errors";

export class Bulkhead {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(readonly name: string, private readonly maxConcurrent: number, private readonly maxWaiting = 0) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxWaiting) throw new ServiceUnavailableError(`bulkhead ${this.name} is full`);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
```

Six product pages ask for the cedi rate while the rates API hangs, then a checkout needs the database. First with one shared pool of four outgoing calls for everything, then with a pool per dependency:

bulkhead-demo.ts

```ts
import { Bulkhead } from "./bulkhead.js";
import { FaultInjector } from "./faults.js";
import { createShop } from "./shop.js";
import { withTimeout } from "./timeout.js";

async function run(label: string, pools: { rates: Bulkhead; database: Bulkhead }): Promise<void> {
  const shop = createShop(new FaultInjector(1).break("rates", "hang"));
  const pages = Array.from({ length: 6 }, () =>
    pools.rates.run(() => withTimeout(200, (signal) => shop.rates.ngnPer("GHS", signal)))
      .then(() => "rate", (error: Error) => (error.name === "TimeoutError" ? "timed out" : "rejected at once")),
  );
  const checkout = pools.database
    .run(() => withTimeout(100, (signal) => shop.db.saveOrder({ sku: "lamp", totalKobo: 1_250_000 }, signal)))
    .then((order) => `201 ${order.id}`, (error: Error) => `503 ${error.message}`);
  const [checkoutResult, ...pageResults] = await Promise.all([checkout, ...pages]);
  console.log(label);
  console.log("  checkout:", checkoutResult);
  console.log("  pages:   ", pageResults.join(", "));
}

const shared = new Bulkhead("outgoing", 4);
await run("one shared pool of 4", { rates: shared, database: shared });
await run("a pool per dependency", { rates: new Bulkhead("rates", 2), database: new Bulkhead("database", 4) });
```

Output of `npx tsx bulkhead-demo.ts` and of the browser terminal

```ts
one shared pool of 4
  checkout: 503 bulkhead outgoing is full
  pages:    timed out, timed out, timed out, timed out, rejected at once, rejected at once
a pool per dependency
  checkout: 201 ord_1
  pages:    timed out, timed out, rejected at once, rejected at once, rejected at once, rejected at once
```

With a shared pool, the hanging rates API took all four slots and the checkout, which needed only the healthy database, was refused. With separate pools, the rates API could hold only two slots; four product pages were refused at once instead of waiting 200 ms each, and the checkout went through. Rejecting at once is a feature: a fast "no" frees the server for work it can do. In Node.js the "pool" is not threads but concurrent promises, sockets and database connections; a real HTTP agent's `maxSockets` and a database pool's size are bulkheads you already configure.

## Fallbacks and graceful degradation

**Graceful degradation** means doing less, not failing: the shop without cedi prices, without recommendations, with receipts arriving a few minutes late. Each fallback comes from the table you reasoned through at the start. Here is ShopFlow's checkout and login with every mechanism so far, applied where the table said:

hardened.ts

```ts
import { ServiceUnavailableError, TimeoutError } from "@zudojs/errors";
import { CircuitBreaker } from "./breaker.js";
import { Bulkhead } from "./bulkhead.js";
import type { App } from "./matrix.js";
import { naira } from "./shop.js";
import type { Shop } from "./shop.js";
import { withTimeout } from "./timeout.js";

export function hardenedApp(shop: Shop, now: () => number = () => 0): App {
  const database = new CircuitBreaker({ name: "database", windowSize: 20, minimumCalls: 5, failureRate: 0.5, openMs: 5000, now });
  const ratesPool = new Bulkhead("rates", 2);
  let lastRate = { ngnPerGhs: 104, at: now() };

  const db = <T>(work: (signal: AbortSignal) => Promise<T>) => database.call(() => withTimeout(150, work));

  async function cediRate(notes: string[]): Promise<number | undefined> {
    try {
      const ngnPerGhs = await ratesPool.run(() => withTimeout(60, (s) => shop.rates.ngnPer("GHS", s)));
      lastRate = { ngnPerGhs, at: now() };
      return ngnPerGhs;
    } catch {
      if (now() - lastRate.at > 3_600_000) return undefined;
      notes.push("last known rate");
      return lastRate.ngnPerGhs;
    }
  }

  return {
    async checkout(sku) {
      const notes: string[] = [];
      try {
        const priceKobo = await withTimeout(30, (s) => shop.cache.price(sku, s)).catch(() => {
          notes.push("price from database");
          return db((s) => shop.db.price(sku, s));
        });
        const ngnPerGhs = await cediRate(notes);
        const order = await db((s) => shop.db.saveOrder({ sku, totalKobo: priceKobo }, s));
        await withTimeout(30, (s) => shop.queue.enqueue(`receipt:${order.id}`, s)).catch(() => {
          notes.push("receipt in outbox");
          return db((s) => shop.db.saveToOutbox(`receipt:${order.id}`, s));
        });
        const cedi = ngnPerGhs ? ` (about GH₵${(priceKobo / 100 / ngnPerGhs).toFixed(2)})` : "";
        return `201 ${order.id} ${naira(priceKobo)}${cedi}${notes.length ? ` [${notes.join(", ")}]` : ""}`;
      } catch (error) {
        if (error instanceof ServiceUnavailableError || error instanceof TimeoutError) {
          return "503 Retry-After: 5 - we could not take your order, please try again shortly";
        }
        throw error;
      }
    },
    async login(code) {
      try {
        const user = await withTimeout(1000, (s) => shop.oauth.exchange(code, s));
        return `200 signed in ${user.email}`;
      } catch {
        return "503 Google sign-in is unavailable right now; sign in with your e-mail and password";
      }
    },
  };
}
```

Two details matter. The order write is not retried: without an idempotency key, a retried write after a timeout could create a second order. And when the receipt cannot be queued, the job goes into the database's outbox table, so it is sent later instead of lost; [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions) builds that outbox properly, in the same transaction as the order. Now the same failure matrix:

hardened-matrix.ts

```ts
import { hardenedApp } from "./hardened.js";
import { failureMatrix } from "./matrix.js";

await failureMatrix((shop) => hardenedApp(shop));
```

Output of `npx tsx hardened-matrix.ts` and of the browser terminal

```ts
database down
  checkout: 503 Retry-After: 5 - we could not take your order, please try again shortly  [orders saved: 0]
  login:    200 signed in ada@example.com
cache down
  checkout: 201 ord_1 ₦12500.00 (about GH₵119.05) [price from database]  [orders saved: 1]
  login:    200 signed in ada@example.com
queue down
  checkout: 201 ord_1 ₦12500.00 (about GH₵119.05) [receipt in outbox]  [orders saved: 1]
  login:    200 signed in ada@example.com
rates API hangs
  checkout: 201 ord_1 ₦12500.00 (about GH₵120.19) [last known rate]  [orders saved: 1]
  login:    200 signed in ada@example.com
OAuth provider down
  checkout: 201 ord_1 ₦12500.00 (about GH₵119.05)  [orders saved: 1]
  login:    503 Google sign-in is unavailable right now; sign in with your e-mail and password
```

Compare it with the first matrix:

- Every request now gets an answer, and none takes longer than the sum of its timeouts.
- Only the database outage stops checkout, with a 503 and a `Retry-After` header that tells well-behaved clients when to come back, instead of a 500 that looks like a bug.
- Cache, queue and rates outages are invisible to the customer apart from a note. The queue outage no longer produces an order the customer believes failed.
- Google sign-in fails with a message that tells the customer what to do.

### OAuth: the real client

The fake OAuth provider stands in for a real one. `@zudojs/auth-oauth`, from [the OAuth lesson](https://zudojs.oyinlola.site/learn/zudo-oauth), already has a timeout (`timeoutMs`) and error classes that tell the failure modes apart. Passing a `fetch` function lets you inject faults into the real client:

oauth-down.tsNode.js only

```ts
import { exchangeCodeForToken } from "@zudojs/auth-oauth";
import type { FetchLike } from "@zudojs/auth-oauth";

const provider: Record<string, FetchLike> = {
  "connection refused": async () => { throw new TypeError("fetch failed"); },
  "never answers": (_url, init) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
  "answers 503": async () => new Response("maintenance", { status: 503 }),
  "healthy": async () => Response.json({ access_token: "tok_123", token_type: "Bearer", expires_in: 3600 }),
};

const keepAlive = setInterval(() => {}, 1000);
for (const [label, fetch] of Object.entries(provider)) {
  try {
    const tokens = await exchangeCodeForToken(
      { provider: "google", clientId: "shopflow", clientSecret: "from-the-environment", allowedRedirectUris: ["https://shop.example/auth/callback"], timeoutMs: 200, fetch },
      { code: "code-from-google", codeVerifier: "v".repeat(43), redirectUri: "https://shop.example/auth/callback" },
    );
    console.log(`${label.padEnd(18)} ok, ${tokens.tokenType} token`);
  } catch (error) {
    console.log(`${label.padEnd(18)} ${(error as Error).name}: ${(error as Error).message}`);
  }
}
clearInterval(keepAlive);
```

Output of `npx tsx oauth-down.ts`

```ts
connection refused OAuthNetworkError: The token request could not be completed.
never answers      OAuthNetworkError: The token request timed out after 200ms.
answers 503        OAuthProviderError: The token endpoint returned HTTP 503.
healthy            ok, Bearer token
```

A refused connection and a provider that never answers both come back as `OAuthNetworkError` (the second after the 200 ms limit); a provider that answers with an error status comes back as `OAuthProviderError`. Your login handler maps all three to the same friendly fallback, and logs them differently: "Google is down" and "our network is down" are different incidents.

> NOTE
>
> The `setInterval` keeps this short script alive while the timeout runs. `AbortSignal.timeout()`, which the OAuth client uses, does not keep a Node.js process alive by itself; in a running server that never matters.

## Failures no retry can fix

Some failures are not a slow call but a broken process. Each needs its own mechanism.

### A worker crashes in the middle of a job

A worker takes a "book a courier" job and its process is killed before it finishes. The job is marked *active*, so no other worker takes it, and it would stay that way forever. `@zudojs/queue` handles this with `stalledAfter`: a job that stays active for that long without a live consumer is returned to the queue, and after `maxStalledCount` stalls it is dead-lettered instead of looping forever:

worker-crash.ts

```ts
import { createInMemoryQueue, createQueueName, createWorker } from "@zudojs/queue";

interface Shipment {
  readonly orderId: string;
}

const queue = createInMemoryQueue<Shipment>(createQueueName("shipments"), { stalledAfter: 200, maxStalledCount: 3, autoProcess: false });
let booked = 0;
queue.process("book-courier", async (job) => {
  booked++;
  console.log(`worker B: booked a courier for ${job.data.orderId}`);
});
queue.events?.on("job:failed", ({ job, error }) => console.log(`queue: ${(job.data as Shipment).orderId} ${error.name}, returned to the queue`));

await queue.add("book-courier", { orderId: "ord_7" }, { attempts: 3 });
const claimed = await queue.claimNextJob();
console.log(`worker A: claimed ${claimed?.data.orderId}, then its process was killed`);

const workerB = createWorker("worker-b", queue);
await workerB.start();
while (booked === 0) await new Promise((resolve) => setTimeout(resolve, 20));
console.log("stats:", await queue.getStats().then((s) => `completed ${s.completed}, dead-lettered ${s.deadLettered}`));
await workerB.stop();
await queue.close();
```

Output of `npx tsx worker-crash.ts` and of the browser terminal

```ts
worker A: claimed ord_7, then its process was killed
queue: ord_7 JobStalledError, returned to the queue
worker B: booked a courier for ord_7
stats: completed 1, dead-lettered 0
```

Worker B finished the job worker A abandoned. Think about what that means: worker A may have booked the courier and died just before marking the job done. Recovery from a crash always means **running the job again**, so job handlers must be idempotent (store the courier booking reference, check it first). This is the at-least-once delivery you will meet again in [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions).

### A plugin fails to start

A loyalty-points plugin cannot reach its partner API at startup. Loyalty points are nice; taking orders is essential. Register the plugin's component with `critical: false` in `@zudojs/lifecycle` (from [Components with @zudojs/lifecycle](https://zudojs.oyinlola.site/learn/zudo-lifecycle#critical)), and the application starts without it instead of refusing to start at all:

plugin-failure.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false });
manager.events.on("component:failed", (event) =>
  console.log(`alert: ${event.component?.componentId} failed (${((event.component?.error as Error).cause as Error)?.message})`),
);
manager.register({ name: "database", start: async () => {}, stop: async () => {} });
manager.register(
  { name: "loyalty-plugin", start: async () => { throw new Error("partner API rejected our key"); }, stop: async () => {} },
  { critical: false, dependsOn: ["database"] },
);
manager.register({ name: "http", start: async () => {}, stop: async () => {} }, { dependsOn: ["database"] });

await manager.start();
console.log("application:", manager.state);
for (const [id, status] of manager.getStatus()) console.log(`  ${id.padEnd(15)} ${status.state}`);
await manager.shutdown();
```

Output of `npx tsx plugin-failure.ts`

```ts
alert: loyalty-plugin failed (partner API rejected our key)
application: ready
  database        ready
  loyalty-plugin  failed
  http            ready
```

The shop is up; the loyalty plugin is not, and the `component:failed` event is where your alert goes. The code that awards points must now check whether the plugin is running, which is the price of making something optional. A plugin you cannot live without stays critical: then a failed start stops the application, and the lifecycle manager rolls back what had started.

### Invalid configuration

A deploy sets `PAYMENTS_TIMEOUT_MS=0` by mistake. If the service starts anyway, every payment times out immediately. The fix is to fail at startup, before the instance ever reports ready. In a rolling deploy, a new instance that never becomes ready stops the rollout, and the old instances keep serving: a bad configuration becomes a failed deploy instead of an outage. Validate the *meaning* of values too, not just their type: a timeout must be positive and shorter than the request budget:

config-check.ts

```ts
import { isSchemaValidationError, schema } from "@zudojs/schema";

const Shape = schema.object({
  requestBudgetMs: schema.coerce.number().int().min(100).max(30_000),
  paymentsTimeoutMs: schema.coerce.number().int().min(50),
  paymentsUrl: schema.string().url(),
});
const Settings = schema.refine(Shape, (s) => s.paymentsTimeoutMs < s.requestBudgetMs, "paymentsTimeoutMs must be shorter than requestBudgetMs");

function startup(env: Record<string, string>): string {
  try {
    const settings = Settings.parse(env);
    return `starting with a ${settings.paymentsTimeoutMs} ms payments timeout`;
  } catch (error) {
    if (!isSchemaValidationError(error)) throw error;
    return "refusing to start: " + error.issues.map((i) => `${i.path.join(".") || "settings"}: ${i.message}`).join("; ");
  }
}

console.log(startup({ requestBudgetMs: "2000", paymentsTimeoutMs: "800", paymentsUrl: "https://payments.internal" }));
console.log(startup({ requestBudgetMs: "2000", paymentsTimeoutMs: "0", paymentsUrl: "payments.internal" }));
console.log(startup({ requestBudgetMs: "2000", paymentsTimeoutMs: "5000", paymentsUrl: "https://payments.internal" }));
```

Output of `npx tsx config-check.ts` and of the browser terminal

```ts
starting with a 800 ms payments timeout
refusing to start: paymentsTimeoutMs: Expected >= 50, received 0; paymentsUrl: Invalid url format
refusing to start: settings: paymentsTimeoutMs must be shorter than requestBudgetMs
```

[Configuration](https://zudojs.oyinlola.site/learn/zudo-config#validate) covered validation itself. The distributed-systems point is where it happens: at startup, before readiness, so the deploy system can stop a bad rollout.

### The customer hangs up

A customer asks for a large sales report, then closes the tab. Unless the server notices, it runs every query anyway. `@zudojs/http` gives each request an `AbortSignal` that aborts when the client disconnects; pass it down to every call, and the work stops:

cancelled.tsNode.js only

```ts
import { setTimeout as sleep } from "node:timers/promises";
import { createNodeHttpAdapter } from "@zudojs/http";

let queriesRun = 0;
let reachedStep2: () => void = () => {};
const step2 = new Promise<void>((resolve) => (reachedStep2 = resolve));

const server = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 0,
  handler: async (request) => {
    try {
      for (let step = 1; step <= 5; step++) {
        await sleep(step <= 2 ? 10 : 2000, undefined, { signal: request.signal });
        queriesRun++;
        console.log(`server: report query ${step} done`);
        if (step === 2) reachedStep2();
      }
      return { rows: 5 };
    } catch (error) {
      console.log(`server: stopped, ${(error as Error).name}`);
      return { cancelled: true };
    }
  },
});
await server.start();

const controller = new AbortController();
const response = fetch(`http://127.0.0.1:${server.address?.port}/reports/sales`, { signal: controller.signal });
await step2;
controller.abort();
await response.catch((error: Error) => console.log(`client: ${error.name}, tab closed`));
await sleep(100);
console.log("queries run:", queriesRun, "of 5");
await server.stop();
```

Output of `npx tsx cancelled.ts`

```ts
server: report query 1 done
server: report query 2 done
client: AbortError, tab closed
server: stopped, AbortError
queries run: 2 of 5
```

The third query was waiting when the customer left, and the signal stopped it; the last two never ran. Pass `request.signal` as the parent of every `withTimeout`, and to `fetch` and database calls that accept it, and a disconnect cancels the whole tree of work.

## Liveness, readiness and graceful shutdown

The platform that runs your instances (Kubernetes, a load balancer, a PaaS) asks each one two different questions. Confusing them causes outages of its own:

| Probe | Question | If it fails, the platform… | Should check |
| --- | --- | --- | --- |
| **Liveness** | Is this process stuck? | Kills and restarts it | Only the process itself: can it answer at all? Never dependencies. |
| **Readiness** | Should this instance get traffic right now? | Stops sending it requests, without restarting it | Critical dependencies, startup finished, not shutting down |

Why never dependencies in liveness? If liveness checks the database and the database goes down, every instance fails liveness, and the platform restarts them all, in a loop, adding a restart storm on top of the outage. Restarting a process cannot fix somebody else's database.

`@zudojs/runtime`, from [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#readiness), has a `ReadinessTracker` that runs named checks, each with a time limit so a hanging check cannot hang the probe:

readiness.tsNode.js only

```ts
import { ReadinessTracker } from "@zudojs/runtime";

let database: "up" | "down" | "hanging" = "up";
const tracker = new ReadinessTracker({ checkTimeout: 100 });
tracker.registerCheck("database", () => (database === "hanging" ? new Promise<boolean>(() => {}) : database === "up"));
tracker.registerCheck("migrations", () => true);

const keepAlive = setInterval(() => {}, 1000);
for (const next of ["up", "down", "hanging", "up"] as const) {
  database = next;
  await tracker.runChecks();
  const state = tracker.getState();
  const failed = [...state.checks.values()].filter((check) => !check.ready).map((check) => `${check.name}: ${check.message ?? "returned false"}`);
  console.log(`database ${next.padEnd(7)} -> ready=${state.ready} (${state.state})`, failed.length ? failed : "");
}
clearInterval(keepAlive);
```

Output of `npx tsx readiness.ts`

```ts
database up      -> ready=true (ready)
database down    -> ready=false (degraded) [ 'database: Check returned false.' ]
database hanging -> ready=false (degraded) [
  'database: Check threw an error: Readiness check "database" did not settle within 100ms.'
]
database up      -> ready=true (ready)
```

A hanging check is reported as failed after 100 ms, not waited for. Note that the tracker calls the not-ready state `degraded`; what the platform reads is `ready`. Everything registered here is treated as critical, so register only checks that should take the instance out of rotation. A down cache is not one of them: the checkout above works without it. Report such optional parts in logs and metrics instead.

### Graceful shutdown

During a deploy, the platform sends `SIGTERM` to the old instances. A graceful shutdown, in order:

1. **Stop being ready.** The load balancer notices on its next probe and stops sending new requests. Keep serving for a few seconds while it notices.
2. **Stop accepting** new connections and **finish in-flight requests**, up to a deadline.
3. **Drain workers**: let running jobs finish, leave waiting ones in the queue for other instances.
4. **Close** connections to the database and other dependencies, last.

[The lifecycle lesson](https://zudojs.oyinlola.site/learn/zudo-lifecycle#shop) built steps 2 to 4 with `dependsOn`. Step 1 is the distributed-systems part. Before this was fixed, running the readiness checks again during shutdown recomputed readiness from the checks alone, so an instance that was stopping, with a healthy database, reported ready again. `@zudojs/runtime` now keeps `runtime.ready` tied to the lifecycle state, so it already reports not-ready once shutdown starts:

shutdown-ready.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";

let finishShutdown: () => void = () => {};
const http: Module = { id: "http", name: "http", onShutdown: () => new Promise<void>((resolve) => (finishShutdown = resolve)) };
const runtime = createRuntime(
  { modules: new Map([["http", http]]), logger: createLogger({ name: "shop", level: LoggerLevel.FATAL }), container: createContainer(), eventBus: createEventBus() },
  { applicationName: "shop", environment: "production", handleSignals: false },
);
runtime.registerReadinessCheck("database", () => true);

/* What a /ready endpoint should answer: the checks AND the lifecycle state. */
async function readyProbe(): Promise<string> {
  await runtime.runReadinessChecks();
  const ready = runtime.state === "running" && runtime.ready;
  return `${ready ? 200 : 503} (runtime.ready=${runtime.ready}, state=${runtime.state})`;
}

await runtime.start();
console.log("running:       ", await readyProbe());
const stopping = runtime.stop();
console.log("after SIGTERM: ", await readyProbe());
finishShutdown();
await stopping;
console.log("stopped:       ", await readyProbe());
```

Output of `npx tsx shutdown-ready.ts`

```ts
running:        200 (runtime.ready=true, state=running)
after SIGTERM:  503 (runtime.ready=false, state=stopping)
stopped:        503 (runtime.ready=false, state=stopped)
```

`runtime.ready` now already says `false` once the runtime starts stopping, and stays `false` once it has stopped, even though the database check still passes: the tracker itself accounts for the lifecycle state. The probe above still also requires `state === "running"`, which is a defensive habit worth keeping, since not every readiness source is tied to a lifecycle the way `@zudojs/runtime`'s is. The rule holds with any framework: readiness is "my dependencies are fine *and* I intend to serve", and shutdown must flip the second half first.

## Chaos testing: keep breaking it

A failure matrix run once is a snapshot. A **chaos test** runs many random combinations of faults, from a seed, and checks **invariants**: statements that must hold whatever broke. For checkout:

- Every request gets an answer (no "no answer after").
- Every `201` has exactly one saved order, and its receipt was either sent or is in the outbox.
- Every `503` saved no order, so a retry by the customer cannot create a duplicate.

chaos.ts

```ts
import { FaultInjector, seeded } from "./faults.js";
import type { Fault } from "./faults.js";
import { hardenedApp } from "./hardened.js";
import { createShop } from "./shop.js";

const random = seeded(2026);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
const options: readonly (Fault | "ok")[] = ["ok", "ok", "down", "hang", "flaky"];
const outcomes = new Map<string, number>();
const violations: string[] = [];

for (let run = 1; run <= 25; run++) {
  const faults = new FaultInjector(run);
  const plan: string[] = [];
  for (const dependency of ["database", "cache", "queue", "rates"]) {
    const fault = pick(options);
    if (fault !== "ok") {
      faults.break(dependency, fault);
      plan.push(`${dependency}:${fault}`);
    }
  }
  const shop = createShop(faults);
  const answer = await Promise.race([
    hardenedApp(shop).checkout("lamp"),
    new Promise<string>((resolve) => setTimeout(() => resolve("no answer"), 1000)),
  ]);
  const status = answer.slice(0, 3);
  outcomes.set(status, (outcomes.get(status) ?? 0) + 1);
  const receipt = shop.sent.length + shop.outbox.length;
  if (status === "201" && (shop.orders.length !== 1 || receipt !== 1)) violations.push(`run ${run} [${plan}]: 201 with ${shop.orders.length} orders, ${receipt} receipts`);
  if (status === "503" && shop.orders.length !== 0) violations.push(`run ${run} [${plan}]: 503 but an order was saved`);
  if (status !== "201" && status !== "503") violations.push(`run ${run} [${plan}]: ${answer}`);
}

console.log("outcomes:", Object.fromEntries(outcomes));
console.log("violations:", violations.length ? violations : "none");
```

Output of `npx tsx chaos.ts` and of the browser terminal

```ts
outcomes: { '201': 13, '503': 12 }
violations: [ 'run 13 [database:flaky,queue:down]: 503 but an order was saved' ]
```

The chaos test found a real hole in the hardened checkout. Read the failing plan: with a flaky database and the queue down, the order was saved, then the queue failed *and* the flaky database failed while writing the outbox row, so the customer got a 503 for an order that exists. That is the same double-order bug as the naive "queue down" row, now needing two faults at once. No amount of care in the checkout function fixes it, because two separate writes can always fail between each other. The fix is to write the order and its outbox row in **one database transaction**, which is exactly where [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions) starts. The seed makes each violation reproducible: run 13's plan is the same every time you run the test.

> TIP
>
> Run chaos tests in CI with a handful of fixed seeds, and nightly with a random seed that is printed in the output. When the nightly run finds something, the printed seed becomes a new fixed seed: a regression test for exactly that combination.

## Production concerns

- **Timeouts are configuration.** Keep them in validated settings, derived from measured latency, and log the value in use at startup. Review them when a dependency's latency changes.
- **Observe the mechanisms.** Count timeouts, retries, fallbacks used, breaker transitions and bulkhead rejections per dependency ([observability](https://zudojs.oyinlola.site/learn/zudo-observability)). A fallback that silently runs all day is an outage nobody noticed.
- **Shed load early.** When the server is overloaded, rejecting some requests at the door with 503 keeps the rest fast. Rate limits ([Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting)) and bulkheads are both forms of this.
- **Game days.** Chaos experiments in staging, and carefully in production, with the team watching: turn off the cache, add latency to the rates API, kill a worker. Tools such as Toxiproxy (network faults) and Chaos Mesh (Kubernetes) do at the network level what the injector does in-process.
- **Fallbacks must be tested like features.** The code path that runs only during an outage is the least-run code you own. The failure matrix and the chaos test keep it honest.
- **Never fall back to "allow".** If the permissions or fraud service is down, deny or hold. Degrade features, never security.

## Practice

TRY IT YOURSELF

### Equal jitter

Full jitter can wait almost zero. **Equal jitter** waits half the backoff plus a random part of the other half, so there is always some pause. Using `calculateRetryDelay` and `seeded(9)`, print the equal-jitter waits for attempts 1 to 5 with a 100 ms base and a 1,000 ms cap, next to the cap for each attempt.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Equal jitter is `ceiling / 2` (always paid) plus a random amount from 0 up to the other half, `ceiling / 2`.

HINT 2

`const wait = Math.round(ceiling / 2 + random() * (ceiling / 2));`

SOLUTION

equal-jitter.ts

```ts
import { calculateRetryDelay } from "@zudojs/queue";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(9);
for (let attempt = 1; attempt <= 5; attempt++) {
  const ceiling = calculateRetryDelay(attempt, { type: "exponential", delay: 100, maxDelay: 1000 });
  const wait = Math.round(ceiling / 2 + random() * (ceiling / 2));
  console.log(`attempt ${attempt}: backoff ${ceiling} ms, wait ${wait} ms`);
}
```

Output of `npx tsx equal-jitter.ts` and of the browser terminal

```ts
attempt 1: backoff 100 ms, wait 60 ms
attempt 2: backoff 200 ms, wait 185 ms
attempt 3: backoff 400 ms, wait 228 ms
attempt 4: backoff 800 ms, wait 729 ms
attempt 5: backoff 1000 ms, wait 862 ms
```

Every wait is between half the backoff and the full backoff, and the cap stops growth at 1,000 ms from attempt 5. Equal jitter spreads retries a little less than full jitter but guarantees a minimum pause, which some dependencies prefer.

TRY IT YOURSELF

### Which errors open the breaker?

The payments API answers 402 when a card is declined, 429 when you send too much, and 503 when it is down. Which of these should count as breaker failures, and why? Write an `isFailure` function for a breaker around it, given errors shaped `{ status: number }`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

A declined card or an unknown charge (402, 404) means the payments API worked correctly and told you no — that must not count as a breaker failure.

HINT 2

`return status === 429 || status >= 500;`

SOLUTION

is-failure.js

```ts
function isFailure(error) {
  const status = error?.status;
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

for (const status of [402, 404, 429, 500, 503]) console.log(status, isFailure({ status }));
console.log("network error", isFailure(new TypeError("fetch failed")));
```

Output of `node is-failure.js` and of the browser terminal

```ts
402 false
404 false
429 true
500 true
503 true
network error true
```

A declined card (402) or an unknown charge (404) is the payments API working correctly, so it must not open the breaker, or one customer with an expired card could cut off everyone else. 5xx answers and network errors (no status) mean the service is unhealthy. 429 means "you are sending too much": opening the breaker, and so pausing traffic, is exactly the right reaction.

TRY IT YOURSELF

### Hedge the cache

The cache normally answers in 2 ms, but sometimes one instance is slow. Instead of waiting 30 ms for the timeout, a **hedged request** asks the database too if the cache has not answered within 10 ms, and uses whichever answers first. Write `hedged(primary, backup, afterMs)` and explain when hedging is a bad idea.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Start a delayed promise with `sleep(afterMs).then(() => { started = true; return backup(); })`, and race it against `primary()` with `Promise.any` — the same shape as the health-check example.

HINT 2

`let started = false; const backupAfterDelay = sleep(afterMs).then(() => { started = true; return backup(); }); const answer = await Promise.any([primary(), backupAfterDelay]); return { answer, backupStarted: started };`

SOLUTION

hedged.js

```ts
const sleep = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function hedged(primary, backup, afterMs) {
  let started = false;
  const backupAfterDelay = sleep(afterMs).then(() => {
    started = true;
    return backup();
  });
  const answer = await Promise.any([primary(), backupAfterDelay]);
  return { answer, backupStarted: started };
}

console.log(await hedged(() => sleep(2, "cache"), () => sleep(5, "database"), 10));
console.log(await hedged(() => sleep(200, "cache"), () => sleep(5, "database"), 10));
```

Output of `node hedged.js` and of the browser terminal

```json
{ answer: 'cache', backupStarted: false }
{ answer: 'database', backupStarted: true }
```

A fast cache answers alone; a slow one is overtaken by the database. Hedging trades extra load for lower tail latency, so it only suits cheap, idempotent reads, and it needs a cap (for example, at most 5% of requests hedged). Never hedge writes, and never hedge against a dependency that is slow *because* it is overloaded: doubling its traffic makes it slower. A complete version would also cancel the losing request with an `AbortSignal`.

## Summary

- Break things on purpose with a seeded fault injector, and read the result as a failure matrix: one row per broken dependency, one column per user action. Decide per dependency whether it is needed for a correct answer, what users can still get, and whether a call can be repeated.
- Every remote call gets a timeout that also cancels the work through an `AbortSignal`, and requests carry a deadline and a signal down to every call, so a client that leaves stops the work.
- Retry only transient errors, at one layer, with exponential backoff and jitter. Seed the randomness in tests. Retries multiply across layers; budget them.
- A circuit breaker with a rolling window, a minimum number of calls, failure classification and a single half-open probe fails fast during outages and lets a dependency recover. Test it on a fake clock.
- Bulkheads stop one slow dependency from taking all capacity. Fallbacks degrade features (cache to database, stale rate, outbox for receipts), never security.
- Process failures need their own tools: stalled-job recovery with idempotent handlers, optional components with `critical: false`, configuration validated before readiness, and request signals for disconnected clients.
- Liveness never checks dependencies; readiness checks critical ones and the lifecycle state. Shutdown flips readiness first, then drains. Chaos tests with invariants keep all of it true, and found the one bug the checkout cannot fix alone.

Next, [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions) fixes that bug with the transactional outbox, and builds an order, payment, inventory and shipping flow that survives a failure at every step.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
