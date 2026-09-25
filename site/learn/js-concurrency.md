---
title: "Concurrency and cancellation — ZudoJS Academy"
description: "Limit how many jobs run at once with a pool, cancel unneeded work with AbortController, and find and fix the race conditions of concurrent async code."
source: https://zudojs.oyinlola.site/learn/js-concurrency
---

LEVEL 4 · LESSON 16 OF 20

Asynchronous JavaScript in depth Core

# Concurrency and cancellation

Limit how many jobs run at once with a pool, cancel unneeded work with AbortController, and find and fix the race conditions of concurrent async code.

- **60 min** to read and try
- **You need:** Combining promises and The event loop
- **You build:** A concurrency pool that sends 1,000 emails 5 at a time and can be stopped, a search box that cancels stale requests, and a lock that stops double withdrawals

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the difference between concurrency and parallelism, and which one JavaScript gives you
- Build a pool that keeps a fixed number of jobs running and returns results in input order
- Make your own async functions cancellable with AbortSignal, including timers and fetch
- Combine user cancellation and timeouts with AbortSignal.timeout and AbortSignal.any
- Recognise stale responses, check-then-act and duplicate work as race conditions, and fix each one

## A thousand emails, five at a time

Every Friday a shop emails its weekly offers to its 1,000 customers. The email provider's rules say: at most **5** connections at a time from one account; any more are refused with an error (HTTP status 429, "Too Many Requests"). The first version of the code used `Promise.all` over all 1,000 customers, which opens 1,000 connections at once.

Here is the provider, simulated with the same rule: each email takes a few milliseconds (the `delayMs` option can change that), and a sixth open connection is refused.

provider.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMailProvider({ maxConnections, delayMs = (to) => 1 + (to.length % 4) }) {
  let open = 0;
  const stats = { sent: 0, peak: 0 };
  return {
    stats,
    async send(to, subject, { signal } = {}) {
      signal?.throwIfAborted();
      if (open >= maxConnections) throw new Error(`429 Too Many Requests (${open} connections open)`);
      open += 1;
      stats.peak = Math.max(stats.peak, open);
      try {
        await wait(delayMs(to));
        signal?.throwIfAborted();
        stats.sent += 1;
        return `sent "${subject}" to ${to}`;
      } finally {
        open -= 1;
      }
    },
  };
}
```

problem.js

```ts
import { createMailProvider } from "./provider.js";

const provider = createMailProvider({ maxConnections: 5 });
const customers = Array.from({ length: 1_000 }, (_, i) => `customer${i + 1}@example.com`);

const results = await Promise.allSettled(customers.map((to) => provider.send(to, "Weekly offers")));
const sent = results.filter((r) => r.status === "fulfilled").length;

console.log("sent:", sent, "refused:", 1_000 - sent);
console.log("first refusal:", results.find((r) => r.status === "rejected").reason.message);
```

Output of `node problem.js` and of the browser terminal

```ts
sent: 5 refused: 995
first refusal: 429 Too Many Requests (5 connections open)
```

Only 5 emails went out; 995 customers got nothing. In [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#shapes) you saw batching as a fix, and its weakness: each batch waits for its slowest email. This lesson builds the proper tool, a **pool**, then adds the other half of running many jobs: **cancelling** the ones nobody needs any more, and avoiding the bugs that appear when async jobs overlap.

## Concurrency is not parallelism

Two words get mixed up here, and the difference matters:

- **Concurrency** means several jobs are *in progress* at the same time: each has started and not yet finished. They may take turns on one worker.
- **Parallelism** means several jobs are *executing* at the same instant, on different processor cores.

A single cashier serving five customers by switching between them while each one looks for their card is concurrent. Five cashiers are parallel. Your JavaScript runs on one thread, so your code itself is never parallel: [the event loop](https://zudojs.oyinlola.site/learn/js-event-loop) runs one callback at a time. But while one email is waiting for the network, your thread can start the next one. The *waiting* happens in parallel (in the operating system, in the network, on the provider's servers); the JavaScript takes turns. That is why async JavaScript handles thousands of concurrent requests on one thread, and also why it does not make heavy computation faster.

```ts
concurrency on one thread (JavaScript):       parallelism (worker threads, several cores):

thread  |A|B|C|  |A|  |B|C|                  core 1  |AAAAAAAAAA|
        start      finish                      core 2  |BBBBBBBBBB|
network  AAAAAAA                               core 3  |CCCCCCCCCC|
          BBBBBBBBB
           CCCCCCCCC
```

With concurrency, the thread only runs short slices (|A|); the long waits overlap outside it.

A **concurrency limit** is a cap on how many jobs may be in progress at once. You need one whenever the other side has a limit (the mail provider's 5 connections, a database's connection pool, an API's rate limit) or when each job holds memory. **Scheduling** is deciding which waiting job starts next, and when. A pool is a small scheduler: first come, first served, never more than N at once.

## Build: a concurrency pool

REASON IT OUT

### What must a pool get right?

You will write `mapWithLimit(items, limit, fn)`: like `Promise.all(items.map(fn))`, but with at most `limit` calls of `fn` in progress at once. Before writing it:

- A slot frees up when a job finishes. How does the pool know to start the next job at exactly that moment, and not when a whole batch is done?
- Jobs finish in any order. In what order should the results be returned?
- What if a job fails? Should the other running jobs be abandoned, and should new jobs still start?
- What about `limit` of 0, a negative number, or a limit larger than the number of items? And an empty list?
- Two slots finish at the same moment. Can both take the same next item?

**Show the reasoning**

- **Start the next job when one finishes**: run `limit` little loops ("workers"). Each worker takes the next item, awaits its job, then takes another, until the items run out. As soon as any worker finishes a job, it immediately starts the next one, so all slots stay busy.
- **Order**: store each result at the index of its item, so the output matches the input, like `Promise.all`.
- **Failure**: match `Promise.all`, reject with the first error, and also stop starting new jobs (set a flag the workers check). Jobs already running cannot be stopped without cancellation, which comes later in this lesson. A caller who wants every outcome can make `fn` return a report instead of throwing, like `allSettled`.
- **Bad limits**: a limit below 1 would never start anything and hang forever, so reject it with a `RangeError`. A limit above the item count just means fewer workers. An empty list resolves to `[]`.
- **Same item twice**: cannot happen. Taking the next index (`next++`) is synchronous, and JavaScript runs one piece of code at a time, so two workers can never read the same value of `next`. This is one of the gifts of a single thread: no locks needed for that line.

pool.js

```ts
export async function mapWithLimit(items, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be an integer of at least 1, got ${limit}`);
  const results = new Array(items.length);
  let next = 0;
  let failed = false;

  async function worker() {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

Only a few lines, and each answers one of the questions above. Now send the newsletter through it, and compare with batches of 5, which respect the limit too but waste slots:

newsletter.js

```ts
import { createMailProvider } from "./provider.js";
import { mapWithLimit } from "./pool.js";

const customers = Array.from({ length: 1_000 }, (_, i) => `customer${i + 1}@example.com`);
const provider = createMailProvider({ maxConnections: 5 });

const results = await mapWithLimit(customers, 5, (to) => provider.send(to, "Weekly offers"));
console.log("sent", provider.stats.sent, "| peak connections", provider.stats.peak);
console.log("results in input order:", results[0].split(" to ")[1], "...", results.at(-1).split(" to ")[1]);

// Pool against batches: every fifth email is slow (50 ms), the others take 5 ms.
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}
const delayMs = (to) => (Number(to.match(/\d+/)[0]) % 5 === 0 ? 50 : 5);
const sample = customers.slice(0, 60);
const times = {};

for (const [name, run] of [
  ["pool", (p) => mapWithLimit(sample, 5, (to) => p.send(to, "Weekly offers"))],
  ["batches", (p) => inBatches(sample, 5, (to) => p.send(to, "Weekly offers"))],
]) {
  const p = createMailProvider({ maxConnections: 5, delayMs });
  const start = Date.now();
  await run(p);
  times[name] = Date.now() - start;
  console.log(`${name.padEnd(7)} sent ${p.stats.sent}, peak ${p.stats.peak}`);
}
console.log("the pool took less than half as long as batches:", times.pool * 2 < times.batches);
```

Output of `node newsletter.js` and of the browser terminal

```ts
sent 1000 | peak connections 5
results in input order: customer1@example.com ... customer1000@example.com
pool    sent 60, peak 5
batches sent 60, peak 5
the pool took less than half as long as batches: true
```

All 1,000 emails went out, never more than 5 at once, and the results came back in customer order. In the comparison, both approaches respected the limit, but the pool was much faster, because it started a new email the moment any slot freed up. Every batch of 5 contained one slow email, so each batch took 50 ms while four of its five slots sat idle for 45 of them. With real emails that take 50 to 800 ms each, that difference is minutes.

### Failure and bad limits

pool-failure.js

```ts
import { mapWithLimit } from "./pool.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = [];

try {
  await mapWithLimit([1, 2, 3, 4, 5, 6, 7, 8], 2, async (id) => {
    started.push(id);
    await wait(10);
    if (id === 3) throw new Error(`invoice ${id}: customer has no email`);
  });
} catch (error) {
  console.log("rejected:", error.message);
}
await wait(30);
console.log("jobs started:", started);

console.log(await mapWithLimit([], 5, async () => "never called"));
try {
  await mapWithLimit([1, 2], 0, async () => {});
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node pool-failure.js` and of the browser terminal

```ts
rejected: invoice 3: customer has no email
jobs started: [ 1, 2, 3, 4 ]
[]
RangeError: limit must be an integer of at least 1, got 0
```

Job 3 failed while job 4 was running. The pool rejected, job 4 finished on its own, and jobs 5 to 8 were never started. Everything else behaves like `Promise.all`.

### A limiter for jobs that arrive over time

`mapWithLimit` needs the whole list up front. A server gets its jobs one at a time, from different requests, and still must not call the payment API more than, say, 3 times at once. For that you want a **limiter**: a function that wraps any job and makes it wait in a queue until a slot is free. Popular npm packages such as `p-limit` do exactly this:

limiter.js

```ts
export function createLimiter(limit) {
  let active = 0;
  const queue = [];

  function startNext() {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { job, resolve, reject } = queue.shift();
    Promise.try(job)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        startNext();
      });
  }

  return function run(job) {
    const { promise, resolve, reject } = Promise.withResolvers();
    queue.push({ job, resolve, reject });
    startNext();
    return promise;
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const limit = createLimiter(3);
let running = 0;
let peak = 0;

async function verifyPayment(ref) {
  running += 1;
  peak = Math.max(peak, running);
  await wait(10);
  running -= 1;
  return `${ref} verified`;
}

const fromRequestA = limit(() => verifyPayment("PSK_1"));
const fromRequestB = Promise.all(["PSK_2", "PSK_3", "PSK_4", "PSK_5"].map((ref) => limit(() => verifyPayment(ref))));
setTimeout(() => limit(() => verifyPayment("PSK_6")).then(console.log), 5);

console.log(await fromRequestA);
console.log(await fromRequestB);
await wait(40);
console.log("peak at once:", peak);
```

Output of `node limiter.js` and of the browser terminal

```ts
PSK_1 verified
[
  'PSK_2 verified',
  'PSK_3 verified',
  'PSK_4 verified',
  'PSK_5 verified'
]
PSK_6 verified
peak at once: 3
```

Jobs from different callers share one limit. `Promise.try` (from [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#with-resolvers)) makes sure a job that throws synchronously still frees its slot. Note the queue here is an array with `shift()`, which is fine for short queues; for queues of thousands, use the queue from [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues).

## Cancellation with AbortController

A customer types "ric" into the shop's search box, then "rice", then "rice 5kg". Three searches start. The first two answers are useless before they arrive. A campaign manager starts the Friday newsletter, then notices a typo in the price and wants to stop it. A promise cannot be stopped from outside; the work must *cooperate*. JavaScript's standard way to ask work to stop is a pair of objects:

- An **`AbortController`** is held by whoever may want to cancel. Calling `controller.abort(reason)` cancels.
- Its **`AbortSignal`** (`controller.signal`) is passed to the work. The work checks `signal.aborted`, reads `signal.reason`, calls `signal.throwIfAborted()`, or listens for the signal's `"abort"` event.

The split is deliberate: the code that receives a signal can *observe* cancellation but cannot trigger it.

abort-basics.js

```ts
const controller = new AbortController();
const { signal } = controller;

signal.addEventListener("abort", () => console.log("abort event, reason:", signal.reason.message), { once: true });
console.log("aborted before:", signal.aborted);

controller.abort(new Error("customer closed the page"));
console.log("aborted after:", signal.aborted);

try {
  signal.throwIfAborted();
} catch (error) {
  console.log("throwIfAborted threw the reason:", error.message);
}

controller.abort(new Error("second abort"));    // ignored: a signal aborts once
console.log("reason is still:", signal.reason.message);

const plain = new AbortController();
plain.abort();                                   // no reason given
console.log("default reason:", plain.signal.reason.name);
```

Output of `node abort-basics.js` and of the browser terminal

```ts
aborted before: false
abort event, reason: customer closed the page
aborted after: true
throwIfAborted threw the reason: customer closed the page
reason is still: customer closed the page
default reason: AbortError
```

Without a reason, the signal's reason is a `DOMException` named `"AbortError"`. Check errors by `name`, not by message: the default messages differ between Node.js and browsers.

### Making your own function cancellable

Built-in APIs such as `fetch` and Node's `timers/promises` accept a `signal` option. Your own async functions should too. Here is a cancellable `sleep`, the building block for retries and polling. Every cancellable function follows the same four rules:

1. If the signal is already aborted, fail at once.
2. On abort, stop the work (here: clear the timer) and reject with `signal.reason`.
3. When the work finishes normally, remove the abort listener, or every call leaves a listener behind on a long-lived signal (a memory leak, see [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory)).
4. Never resolve after rejecting, or the other way round (a promise ignores it anyway, but cleanup must still run once).

sleep.js

```ts
export function sleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
```

Now a 10-second sleep that gets cancelled after 20 ms:

sleep-demo.js

```ts
import { sleep } from "./sleep.js";

const controller = new AbortController();
setTimeout(() => controller.abort(new Error("campaign stopped")), 20);

const start = Date.now();
try {
  await sleep(10_000, { signal: controller.signal });
} catch (error) {
  console.log(`woke early: ${error.message}, long before 10 seconds: ${Date.now() - start < 1_000}`);
}

try {
  await sleep(10, { signal: controller.signal });
} catch (error) {
  console.log("already aborted, failed at once:", error.message);
}
```

Output of `node sleep-demo.js` and of the browser terminal

```ts
woke early: campaign stopped, long before 10 seconds: true
already aborted, failed at once: campaign stopped
```

The 10-second sleep ended after 20 ms, and its timer was cleared, so nothing kept running. Without cancellation, a cancelled retry loop would still sit in its 10-second wait.

### Timeouts and combined signals

Two static helpers cover the most common needs:

- `AbortSignal.timeout(ms)` returns a signal that aborts by itself after `ms`, with a reason named `"TimeoutError"`.
- `AbortSignal.any([signalA, signalB])` returns a signal that aborts as soon as *any* of the given signals aborts, with that signal's reason.

Together they express "stop if the user cancels, or after 3 seconds, whichever comes first":

timeout-any.js

```ts
import { sleep } from "./sleep.js";

async function chargeCard(amountKobo, { signal }) {
  await sleep(200, { signal });        // the slow payment provider
  return `charged ₦${amountKobo / 100}`;
}

async function checkout(amountKobo, userSignal) {
  const signal = AbortSignal.any([userSignal, AbortSignal.timeout(50)]);
  try {
    return await chargeCard(amountKobo, { signal });
  } catch (error) {
    if (error.name === "TimeoutError") return "payment provider too slow: status unknown, will check";
    if (signal.aborted) return `cancelled: ${signal.reason.message}`;
    throw error;
  }
}

const patient = new AbortController();
console.log(await checkout(1_500_000, patient.signal));

const leaving = new AbortController();
setTimeout(() => leaving.abort(new Error("customer pressed back")), 10);
console.log(await checkout(1_500_000, leaving.signal));
```

Output of `node timeout-any.js` and of the browser terminal

```ts
payment provider too slow: status unknown, will check
cancelled: customer pressed back
```

The first checkout hit the 50 ms timeout; the second was cancelled by the customer at 10 ms. The code tells them apart by the reason. The timeout message reminds you of the rule from [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#race): when a *payment* times out, its status is unknown, because the provider may have received the request.

### Cancelling fetch

`fetch` accepts a `signal`. When it aborts, the request is abandoned (the connection is closed) and the `fetch` promise, or the promise from reading the body, rejects with the signal's reason, an `AbortError` by default. This example uses a `data:` URL, which `fetch` reads without a network, so it runs anywhere:

fetch-abort.js

```ts
const url = "data:application/json," + encodeURIComponent(JSON.stringify({ sku: "rice-5kg", stock: 12 }));

const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
console.log(await response.json());

const controller = new AbortController();
controller.abort();
try {
  await fetch(url, { signal: controller.signal });
} catch (error) {
  console.log("aborted fetch rejected with:", error.name);
}
```

Output of `node fetch-abort.js` and of the browser terminal

```json
{ sku: 'rice-5kg', stock: 12 }
aborted fetch rejected with: AbortError
```

Against a real, slow server the effect is the same, only later. This Node.js example starts a local HTTP server that takes 500 ms to answer, and gives up after 50 ms:

fetch-slow.jsNode.js only

```ts
import { createServer } from "node:http";

const server = createServer((req, res) => {
  const timer = setTimeout(() => res.end(JSON.stringify({ results: ["rice 5kg"] })), 500);
  req.on("close", () => clearTimeout(timer));     // the client went away: stop working
});
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();

const start = Date.now();
try {
  await fetch(`http://localhost:${port}/search?q=rice`, { signal: AbortSignal.timeout(50) });
} catch (error) {
  console.log(`${error.name}, before the server's 500 ms answer: ${Date.now() - start < 400}`);
}
server.close();
```

Output of `node fetch-slow.js`

```ts
TimeoutError, before the server's 500 ms answer: true
```

Notice the server side: it listens for the request's `"close"` event and stops its own work when the client disconnects. Cancellation should travel all the way down: from the user, through your code, to the services you call.

## Race conditions in async code

A **race condition** is a bug where the result depends on the timing of operations that overlap. JavaScript has no two threads changing a variable at the same instant, but async code still interleaves: between one `await` and the next, any other callback may run and change things. Three shapes cover most real cases.

### 1. The stale response

The search box sends a request per keystroke. Shorter queries match more products and take longer. The answer for "ric" arrives *after* the answer for "rice 5kg" and overwrites it. The fake service below makes short queries slower, and accepts a `signal`:

search-service.js

```ts
export function createSearchService() {
  const products = ["rice 5kg", "rice 10kg", "rice flour", "ricola sweets", "brown rice 5kg"];
  const wait = (ms, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
    });
  return {
    calls: 0,
    async search(query, { signal } = {}) {
      this.calls += 1;
      await wait(Math.max(10, 190 - query.length * 40), signal);  // short queries are slower
      return products.filter((p) => p.includes(query));
    },
  };
}
```

stale-search.js

```ts
import { createSearchService } from "./search-service.js";

const service = createSearchService();
const screen = { query: "", results: [] };

async function onType(query) {
  screen.query = query;
  const results = await service.search(query);
  screen.results = results;
}

onType("ric");
setTimeout(() => onType("rice"), 5);
setTimeout(() => onType("rice 5kg"), 10);

setTimeout(() => console.log(`box shows "${screen.query}", results:`, screen.results), 200);
```

Output of `node stale-search.js` and of the browser terminal

```ts
box shows "rice 5kg", results: [
  'rice 5kg',
  'rice 10kg',
  'rice flour',
  'ricola sweets',
  'brown rice 5kg'
]
```

The box says "rice 5kg" but lists sweets and flour: the results of "ric". Two fixes, which you usually combine: **abort** the previous request when a new one starts (saves work on both sides), and **ignore** any answer that is not for the latest query (guards against APIs that cannot be cancelled):

search-fixed.js

```ts
import { createSearchService } from "./search-service.js";

const service = createSearchService();
const screen = { query: "", results: [] };
let current = null;

async function onType(query) {
  current?.abort(new Error(`superseded by "${query}"`));
  const controller = new AbortController();
  current = controller;
  screen.query = query;
  try {
    const results = await service.search(query, { signal: controller.signal });
    if (controller !== current) return;          // a newer search started meanwhile
    screen.results = results;
  } catch (error) {
    if (!controller.signal.aborted) throw error;  // a real failure, not our own cancel
  }
}

onType("ric");
setTimeout(() => onType("rice"), 5);
setTimeout(() => onType("rice 5kg"), 10);

setTimeout(() => console.log(`box shows "${screen.query}", results:`, screen.results), 200);
```

Output of `node search-fixed.js` and of the browser terminal

```ts
box shows "rice 5kg", results: [ 'rice 5kg', 'brown rice 5kg' ]
```

Now the box shows the right results for "rice 5kg". The older two searches were aborted as soon as a newer one started, and even if an old answer had slipped through, the `controller !== current` check would have dropped it.

### 2. Check, then act

A wallet endpoint checks the balance, then debits it. Between the check and the debit there is an `await` (the database). Two withdrawals arrive at the same moment, both see enough money, and both debit. Here is the wallet, with the database simulated:

wallet.js

```ts
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createWallet(balanceKobo) {
  const db = { balanceKobo };
  return {
    db,
    async withdraw(amountKobo) {
      const { balanceKobo } = db;                  // check
      await wait(10);                              // e.g. fraud check, database round trip
      if (balanceKobo < amountKobo) throw new Error("insufficient funds");
      db.balanceKobo = balanceKobo - amountKobo;   // act
      return `withdrew ₦${amountKobo / 100}`;
    },
  };
}
```

double-withdrawal.js

```ts
import { createWallet } from "./wallet.js";

const wallet = createWallet(1_000_000);           // ₦10,000
const results = await Promise.allSettled([wallet.withdraw(800_000), wallet.withdraw(800_000)]);
console.log(results.map((r) => r.value ?? r.reason.message));
console.log("balance now: ₦" + wallet.db.balanceKobo / 100, "(₦16,000 was paid out of ₦10,000)");
```

Output of `node double-withdrawal.js` and of the browser terminal

```json
[ 'withdrew ₦8000', 'withdrew ₦8000' ]
balance now: ₦2000 (₦16,000 was paid out of ₦10,000)
```

This is the **check-then-act** race. The check was true when it ran and false by the time the code acted on it. In a real system with a real database, the fix belongs in the database: a transaction with a row lock, or a single conditional update (`UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1`), because several server processes can run the same code. Inside one process, you can make the check and the act happen with nothing in between by putting a **lock** (also called a **mutex**, for "mutual exclusion") around them: only one caller at a time may hold it, the others wait their turn.

mutex.js

```ts
import { createWallet } from "./wallet.js";

export function createMutex() {
  let last = Promise.resolve();
  return function runExclusive(job) {
    const result = last.then(() => job());
    last = result.catch(() => {});                 // a failed job must not block the next one
    return result;
  };
}

const wallet = createWallet(1_000_000);
const exclusive = createMutex();
const withdraw = (kobo) => exclusive(() => wallet.withdraw(kobo));

const results = await Promise.allSettled([withdraw(800_000), withdraw(800_000), withdraw(150_000)]);
console.log(results.map((r) => r.value ?? r.reason.message));
console.log("balance now: ₦" + wallet.db.balanceKobo / 100);
```

Output of `node mutex.js` and of the browser terminal

```json
[ 'withdrew ₦8000', 'insufficient funds', 'withdrew ₦1500' ]
balance now: ₦500
```

The second withdrawal waited for the first, saw the new balance and was refused; the third fitted and went through. The mutex is a promise chain: each job is chained onto the previous one, so they run one at a time, in arrival order. In a real service you would keep one mutex per account (in a `Map` keyed by account id), so that different accounts do not wait for each other.

### 3. Duplicate work

The product page asks for a product's price; the price is cached for a minute. When the cache is empty and 50 requests arrive at once, all 50 miss the cache and all 50 query the database. This burst is called a **cache stampede**. The fix is **request coalescing** (also called "single flight"): while a lookup for a key is in progress, later callers get the *same promise* instead of starting their own:

coalesce.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let databaseQueries = 0;

async function loadPriceFromDb(sku) {
  databaseQueries += 1;
  await wait(20);
  return { sku, kobo: 950_000 };
}

const inFlight = new Map();
function getPrice(sku) {
  if (!inFlight.has(sku)) {
    const promise = loadPriceFromDb(sku).finally(() => inFlight.delete(sku));
    inFlight.set(sku, promise);
  }
  return inFlight.get(sku);
}

const prices = await Promise.all(Array.from({ length: 50 }, () => getPrice("rice-5kg")));
console.log("answers:", prices.length, "| database queries:", databaseQueries);

await getPrice("rice-5kg");
console.log("after the first lookup finished, a new one queries again:", databaseQueries);
```

Output of `node coalesce.js` and of the browser terminal

```ts
answers: 50 | database queries: 1
after the first lookup finished, a new one queries again: 2
```

Fifty callers, one query. The `finally` removes the entry when the lookup ends, whether it succeeded or failed, so a failure is not cached forever and the map does not grow. A real cache would then store the *value* with an expiry time; [@zudojs/cache](https://zudojs.oyinlola.site/learn/zudo-cache) covers that.

## Build: a newsletter you can stop

Now add cancellation to the pool. A campaign manager must be able to stop a send half-way: no new emails may start, and emails in progress should be abandoned if the provider supports it. The pool gets a `signal` option, checks it before taking each item, and passes it to each job:

stoppable-pool.js

```ts
export async function mapWithLimit(items, limit, fn, { signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be an integer of at least 1, got ${limit}`);
  signal?.throwIfAborted();
  const results = new Array(items.length);
  let next = 0;
  let failed = false;

  async function worker() {
    while (!failed && next < items.length) {
      signal?.throwIfAborted();
      const index = next++;
      try {
        results[index] = await fn(items[index], { index, signal });
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
```

stop-campaign.js

```ts
import { createMailProvider } from "./provider.js";
import { mapWithLimit } from "./stoppable-pool.js";

const provider = createMailProvider({ maxConnections: 5 });
const customers = Array.from({ length: 1_000 }, (_, i) => `customer${i + 1}@example.com`);
const campaign = new AbortController();

setTimeout(() => campaign.abort(new Error("price typo in the offer, stopped by Ada")), 30);

try {
  await mapWithLimit(customers, 5, (to, { signal }) => provider.send(to, "Weekly offers", { signal }), {
    signal: campaign.signal,
  });
} catch (error) {
  console.log("campaign ended:", error.message);
}

const sentAtStop = provider.stats.sent;
await new Promise((resolve) => setTimeout(resolve, 50));
console.log("some sent, most not:", sentAtStop > 0 && sentAtStop < 500);
console.log("nothing more was sent after the stop:", provider.stats.sent === sentAtStop);
```

Output of `node stop-campaign.js` and of the browser terminal

```ts
campaign ended: price typo in the offer, stopped by Ada
some sent, most not: true
nothing more was sent after the stop: true
```

The pool stopped taking customers, the emails in flight were abandoned (the fake provider checks the signal before it "sends"), and nothing more went out after the stop. In a real system you would also record which customers did get the email, so a corrected campaign can go to the rest, and to the others with an apology.

## Testing concurrent code

Concurrency bugs depend on timing, so tests must *control* timing instead of hoping for it:

- **Measure the limit.** Count jobs in progress and record the peak, as the examples above do. "Never more than 5" is a precise, stable assertion.
- **Force the order of completion.** With `Promise.withResolvers` a test can hold each fake request open and finish them in whatever order it likes, for example the slow search first. Then the race happens every time, not one run in a hundred.
- **Test cancellation paths.** Abort before the start, during the work and after the end. Check that timers and listeners were cleaned up.

controlled-order.js

```ts
function fakeSearch() {
  const pending = new Map();
  return {
    search(query) {
      const deferred = Promise.withResolvers();
      pending.set(query, deferred);
      return deferred.promise;
    },
    answer(query, results) {
      pending.get(query).resolve(results);
    },
  };
}

const service = fakeSearch();
let latest = 0;
let shown = null;
async function onType(query) {
  const id = ++latest;
  const results = await service.search(query);
  if (id === latest) shown = `${query}: ${results}`;
}

onType("ric");
onType("rice 5kg");
service.answer("rice 5kg", ["rice 5kg"]);     // the newest answer arrives first
await null;
service.answer("ric", ["ricola sweets"]);     // the stale answer arrives last
await new Promise((resolve) => setTimeout(resolve, 0));
console.log("shown:", shown);
```

Output of `node controlled-order.js` and of the browser terminal

```ts
shown: rice 5kg: rice 5kg
```

No timers decide the order here: the test does. That makes the stale-response bug reproducible every time, and the fix provable.

## Concurrency in production

- **Every downstream gets a limit.** Match it to the other side's rules (connections, rate limits) and to your memory. A database driver's pool size is also a concurrency limit.
- **Pass signals down.** Accept a `signal` in every function that waits, and pass it to everything it calls, including `fetch` and database drivers that support it. Cancellation that stops at the first layer only hides the waste.
- **Clean up after a cancel.** Clear timers, remove listeners (use `{ once: true }` or `removeEventListener`), close connections. A cancellation path that leaks is worse than none.
- **Check error names.** Tell cancellations (`AbortError`, your own reasons) and timeouts (`TimeoutError`) apart from real failures. Do not log cancellations as errors; they are normal.
- **Protect shared state across awaits.** Anything read before an `await` may be stale after it. Re-check, use a per-key lock, or let the database enforce the rule; with several server processes, only the database (or a distributed lock) can.
- **Coalesce identical in-flight work** to survive traffic spikes, and remember that a queue that grows without limit is just a slower crash: reject or shed work when it is too long.

## Practice

TRY IT YOURSELF

### Settle everything with a limit

Write `settleWithLimit(items, limit, fn)` on top of `mapWithLimit`: it never rejects, and returns an `allSettled`-style report for each item. Test it with invoices where two fail.

**Show a solution**

settle-limit.js

```ts
import { mapWithLimit } from "./pool.js";

function settleWithLimit(items, limit, fn) {
  return mapWithLimit(items, limit, (item, i) =>
    Promise.try(fn, item, i).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),
    ),
  );
}

const reports = await settleWithLimit([101, 102, 103, 104], 2, async (invoice) => {
  if (invoice % 2 === 0) throw new Error(`invoice ${invoice}: no email address`);
  return `invoice ${invoice} sent`;
});
console.log(reports.map((r) => (r.status === "fulfilled" ? r.value : r.reason.message)));
```

Output of `node settle-limit.js` and of the browser terminal

```json
[
  'invoice 101 sent',
  'invoice 102: no email address',
  'invoice 103 sent',
  'invoice 104: no email address'
]
```

Each job is turned into one that never rejects, so the pool never stops early. `Promise.try` also catches a job that throws synchronously.

TRY IT YOURSELF

### A cancellable retry

Write `retry(fn, { attempts, delayMs, signal })` that calls `fn(signal)`, waits `delayMs` between failed attempts using the cancellable `sleep`, and stops immediately when the signal aborts, even in the middle of a wait. Show a success on the third attempt and a cancellation during a wait.

**Show a solution**

retry-cancel.js

```ts
import { sleep } from "./sleep.js";

async function retry(fn, { attempts, delayMs, signal }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn(signal, attempt);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      lastError = error;
      if (attempt < attempts) await sleep(delayMs, { signal });
    }
  }
  throw lastError;
}

const flaky = async (signal, attempt) => {
  if (attempt < 3) throw new Error("503 from the SMS gateway");
  return `sent on attempt ${attempt}`;
};
console.log(await retry(flaky, { attempts: 5, delayMs: 10 }));

const controller = new AbortController();
setTimeout(() => controller.abort(new Error("order cancelled")), 25);
const start = Date.now();
try {
  await retry(async () => { throw new Error("503"); }, { attempts: 5, delayMs: 1_000, signal: controller.signal });
} catch (error) {
  console.log(`stopped: ${error.message}, without waiting out the 1-second delay: ${Date.now() - start < 500}`);
}
```

Output of `node retry-cancel.js` and of the browser terminal

```ts
sent on attempt 3
stopped: order cancelled, without waiting out the 1-second delay: true
```

Without the signal in `sleep`, the cancelled retry would still have waited out its full 1-second delay.

TRY IT YOURSELF

### One lock per account

Using `createMutex`, write `createAccountLocks()` that returns `withLock(accountId, job)`: jobs for the same account run one at a time, jobs for different accounts do not wait for each other. Show it with the order in which the jobs finish.

**Show a solution**

account-locks.js

```ts
function createMutex() {
  let last = Promise.resolve();
  return (job) => {
    const result = last.then(() => job());
    last = result.catch(() => {});
    return result;
  };
}

function createAccountLocks() {
  const locks = new Map();
  return function withLock(accountId, job) {
    if (!locks.has(accountId)) locks.set(accountId, createMutex());
    return locks.get(accountId)(job);
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withLock = createAccountLocks();
const finished = [];

await Promise.all([
  withLock("acc-1", async () => { await wait(30); finished.push("acc-1 debit"); }),
  withLock("acc-1", async () => { await wait(30); finished.push("acc-1 credit"); }),
  withLock("acc-2", async () => { await wait(40); finished.push("acc-2 debit"); }),
]);
console.log(finished);
```

Output of `node account-locks.js` and of the browser terminal

```json
[ 'acc-1 debit', 'acc-2 debit', 'acc-1 credit' ]
```

The `acc-1` credit waited for the `acc-1` debit (30 + 30 ms), while `acc-2` ran alongside and finished in between, at 40 ms. This version never removes idle locks from the map; for millions of accounts you would delete a lock when its queue empties.

## Recap

- Concurrency is many jobs in progress; parallelism is many executing at the same instant. JavaScript gives you concurrency on one thread; the waiting overlaps outside it.
- A pool runs N workers that each pull the next item, so every slot stays busy. Results go in input order; a failure stops new jobs. A limiter does the same for jobs that arrive over time.
- Cancellation is cooperative: `AbortController` cancels, `AbortSignal` is passed down. Cancellable functions fail at once if already aborted, clean up on abort, and remove their listener when done.
- `AbortSignal.timeout(ms)` aborts with a `TimeoutError`; `AbortSignal.any` combines signals. `fetch` accepts a signal. Check errors by `name`.
- Async race conditions: stale responses (abort and ignore old answers), check-then-act (lock, or let the database enforce it) and duplicate work (coalesce in-flight promises).
- Test concurrency by measuring peaks and by forcing completion order with deferred promises.

Next: [How JavaScript runs](https://zudojs.oyinlola.site/learn/js-execution), where you look under the event loop at how the engine parses, compiles and executes your code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
