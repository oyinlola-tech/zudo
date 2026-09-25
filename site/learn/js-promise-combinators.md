---
title: "Combining promises — ZudoJS Academy"
description: "Run independent work in parallel with Promise.all, allSettled, race and any, put a time limit on a slow provider, and choose sequential, parallel or batched."
source: https://zudojs.oyinlola.site/learn/js-promise-combinators
---

LEVEL 4 · LESSON 14 OF 20

Asynchronous JavaScript in depth Core

# Combining promises

Run independent work in parallel with Promise.all, allSettled, race and any, put a time limit on a slow provider, and choose sequential, parallel or batched.

- **50 min** to read and try
- **You need:** Promises in depth and Asynchronous JavaScript
- **You build:** A small promise toolkit (withTimeout, allNamed, mapSeries, inBatches) with tests, and a dashboard that loads its widgets in parallel and survives slow or broken ones

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Spot an accidental waterfall of awaits and turn independent work into parallel work
- Choose between all, allSettled, race and any from what the caller needs when something fails
- Put a time limit on a promise without leaking timers, and explain what happens to the work that lost
- Use Promise.withResolvers to turn a one-off event into a promise
- Run work sequentially, in parallel or in batches, and explain the cost of each

## A dashboard that takes three seconds

A shop owner's dashboard shows four widgets: today's sales, low-stock items, new customers and pending refunds. Each comes from a different service. The page takes over three seconds to load, yet none of the services is slow on its own. Here is the handler, with each service simulated by a timer:

services.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const services = {
  sales: () => wait(80, { totalKobo: 48_250_000, orders: 37 }),
  lowStock: () => wait(60, ["oil-1l", "sugar-1kg"]),
  customers: () => wait(70, 5),
  refunds: () => wait(50, [{ order: 31, amountKobo: 950_000 }]),
};
```

waterfall.js

```ts
import { services } from "./services.js";

async function loadDashboard() {
  const sales = await services.sales();
  const lowStock = await services.lowStock();
  const customers = await services.customers();
  const refunds = await services.refunds();
  return { sales, lowStock, customers, refunds };
}

const start = Date.now();
const dashboard = await loadDashboard();
const took = Date.now() - start;
console.log(Object.keys(dashboard));
console.log("took at least 80 + 60 + 70 + 50 = 260 ms:", took >= 250);
```

Output of `node waterfall.js` and of the browser terminal

```json
[ 'sales', 'lowStock', 'customers', 'refunds' ]
took at least 80 + 60 + 70 + 50 = 260 ms: true
```

Each `await` waits for one service before the next one is even asked. The total time is the *sum* of all four. Nothing here needs the result of another step: the low-stock query does not depend on the sales figures. This shape is called a **waterfall**, because each request only starts when the one above it has finished, and it is one of the most common performance bugs in JavaScript backends. In production, with real network delays of 200-800 ms per service, it is how a dashboard ends up taking three seconds.

The fix is to *start* all four requests first and *then* wait for them together. [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#parallel) introduced `Promise.all` for this. This lesson goes through all the tools for combining promises in depth: exactly what each does when something fails, how to put a time limit on a slow service, and how to choose between sequential, parallel and batched work.

## Start first, await later, and its trap

A promise starts its work when it is *created*, not when you `await` it. Calling `services.sales()` sends the request; `await` only waits for the answer. So the simplest fix is to call every function first and await afterwards:

start-first.js

```ts
import { services } from "./services.js";

const start = Date.now();

const salesP = services.sales();          // all four requests start now
const lowStockP = services.lowStock();
const customersP = services.customers();
const refundsP = services.refunds();

const dashboard = {
  sales: await salesP,
  lowStock: await lowStockP,
  customers: await customersP,
  refunds: await refundsP,
};
console.log(dashboard.customers, "new customers");
console.log("finished well before the waterfall's 260 ms:", Date.now() - start < 260);
```

Output of `node start-first.js` and of the browser terminal

```ts
5 new customers
finished well before the waterfall's 260 ms: true
```

All four ran at the same time, so the page now takes about as long as the slowest service, 80 ms, instead of the sum. That works while everything succeeds. But it has a trap. Suppose two services fail. You `await` the first promise; while you wait, the second one rejects, and nobody is listening to it yet. From [Promises in depth](https://zudojs.oyinlola.site/learn/js-promises#unhandled) you know what that is: an unhandled rejection, which crashes Node.js.

start-first-trap.jsNode.js only

```ts
process.on("unhandledRejection", (reason) => console.log("UNHANDLED:", reason.message));

const fail = (ms, message) => new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

async function loadDashboard() {
  const salesP = fail(50, "sales service down");
  const refundsP = fail(10, "refunds service down");
  try {
    return { sales: await salesP, refunds: await refundsP };
  } catch (error) {
    console.log("caught:", error.message);
  }
}

await loadDashboard();
```

Output of `node start-first-trap.js`

```ts
UNHANDLED: refunds service down
caught: sales service down
```

The `try`/`catch` looks like it covers both, but at 10 ms the code is still paused at `await salesP`, and `refundsP` has no handler. The combinators fix this: `Promise.all` and its siblings attach handlers to *every* promise you give them, immediately. That is the first reason to prefer them over a list of separate `await`s.

## Promise.all: everything or the first failure

`Promise.all(iterable)` takes an array (or any iterable) of promises and returns one promise. It is fulfilled with an array of all the values, **in the same order as the input**, no matter which finished first. It is rejected as soon as *any* input rejects, with that first reason. This is called **fail-fast**.

all-order.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

const finished = [];
const track = (name, ms) => wait(ms, name).then((v) => (finished.push(v), v));

const results = await Promise.all([track("sales", 60), track("refunds", 10), track("customers", 30)]);
console.log("finished in this order:", finished);
console.log("results in input order:", results);

console.log(await Promise.all([1, "two", wait(10, 3)]));
console.log(await Promise.all([]));
```

Output of `node all-order.js` and of the browser terminal

```ts
finished in this order: [ 'refunds', 'customers', 'sales' ]
results in input order: [ 'sales', 'refunds', 'customers' ]
[ 1, 'two', 3 ]
[]
```

Plain values in the array are treated like already-fulfilled promises, and an empty array fulfils at once with `[]`. Both matter when the list comes from data: an order with zero items must not hang.

### Fail-fast does not cancel anything

When one input rejects, `Promise.all` rejects straight away, and the results of the others are thrown away. But the other operations are *not stopped*. A promise is only a receipt for work that is already running; there is no "stop" button on it. The work carries on and its result is ignored:

all-no-cancel.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = [];

async function sendEmail(to, ms) {
  await wait(ms);
  log.push(`email sent to ${to}`);
}
async function chargeCard() {
  await wait(20);
  throw new Error("card declined");
}

try {
  await Promise.all([chargeCard(), sendEmail("ada@example.com", 60)]);
} catch (error) {
  console.log("all rejected:", error.message);
}
console.log("log right after the failure:", log);
await wait(80);
console.log("log a little later:", log);
```

Output of `node all-no-cancel.js` and of the browser terminal

```ts
all rejected: card declined
log right after the failure: []
log a little later: [ 'email sent to ada@example.com' ]
```

The customer got a confirmation email for an order whose payment failed. `Promise.all` is the right tool when the steps are independent *and* harmless to finish. When a step has side effects (charging, emailing, writing), either run it after the checks it depends on, or pass it a cancellation signal, which [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency) covers.

### Named results instead of positions

Destructuring by position (`const [a, b, c, d] = await Promise.all(…)`) breaks silently when someone reorders the array. A small helper takes an object of promises and returns an object of values:

all-named.js

```ts
export async function allNamed(tasks) {
  const names = Object.keys(tasks);
  const values = await Promise.all(Object.values(tasks));
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

const { sales, customers } = await allNamed({
  sales: wait(30, { orders: 37 }),
  customers: wait(10, 5),
});
console.log(sales, customers);
```

Output of `node all-named.js` and of the browser terminal

```json
{ orders: 37 } 5
```

## Promise.allSettled: a report for every promise

A dashboard is the opposite of a checkout: if the refunds widget fails, the owner still wants to see today's sales. `Promise.allSettled` never rejects. It waits for *every* input to settle and fulfils with one report object per input, in input order:

- `{ status: "fulfilled", value }` for a success;
- `{ status: "rejected", reason }` for a failure.

all-settled.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const fail = (ms, message) => wait(ms).then(() => { throw new Error(message); });

const widgets = {
  sales: () => wait(40, "₦482,500 from 37 orders"),
  lowStock: () => fail(20, "inventory service returned 503"),
  customers: () => wait(30, "5 new customers"),
  refunds: () => fail(10, "refunds database timeout"),
};

const names = Object.keys(widgets);
const reports = await Promise.allSettled(names.map((name) => widgets[name]()));

console.log(reports[0]);
console.log(reports[1].status, reports[1].reason.message);

for (const [i, report] of reports.entries()) {
  const text = report.status === "fulfilled" ? report.value : `unavailable (${report.reason.message})`;
  console.log(`${names[i].padEnd(9)} ${text}`);
}
```

Output of `node all-settled.js` and of the browser terminal

```json
{ status: 'fulfilled', value: '₦482,500 from 37 orders' }
rejected inventory service returned 503
sales     ₦482,500 from 37 orders
lowStock  unavailable (inventory service returned 503)
customers 5 new customers
refunds   unavailable (refunds database timeout)
```

Every widget got its answer or its error, and nothing was lost. Two rules come with that freedom:

- **You must check every report.** `allSettled` will never throw, so a failure is only noticed if your code looks at `status`. Forgetting to is the `allSettled` version of an empty `catch`.
- **It waits for the slowest.** One service that takes 30 seconds holds the whole page for 30 seconds. `allSettled` is almost always combined with a time limit per promise, which is next.

## Promise.race and time limits

`Promise.race(iterable)` settles the same way as whichever input settles *first*, success or failure. On its own that is rarely useful. Its classic use is a **timeout**: race the real work against a timer that rejects.

The shop's payment provider normally answers in 200 ms, but some days it hangs for a minute, and every checkout hangs with it. The checkout should give up after a few seconds and tell the customer something useful.

REASON IT OUT

### What must a timeout get right?

Before writing `withTimeout(promise, ms)`, think it through:

- When the timer wins, what happens to the payment request that lost the race? Is the customer's card charged or not?
- When the payment wins, what happens to the timer that is still counting down?
- How does the caller tell "the provider said the card was declined" apart from "we gave up waiting"?
- What should `withTimeout(promise, 0)` or a negative time do?

**Show the reasoning**

- **The loser keeps running.** A timeout stops *waiting*; it does not stop the payment. The provider may still charge the card a second later. So after a payment timeout the true status is *unknown*, not "failed": never charge again blindly. Ask the provider for the payment's status later, using an **idempotency key** (a unique id you send with the request, so the provider can recognise a repeat of the same payment and not charge twice).
- **Clear the timer.** A timer that keeps running holds resources and, in Node.js, keeps the process alive until it fires. Clear it in `finally`, whichever side won.
- **Use a distinct error.** Reject with an error whose `name` is `"TimeoutError"` (and a message that says what timed out), so callers can treat it differently from a real decline.
- **Bad limits**: `setTimeout` turns 0, a negative number or `NaN` into the shortest possible delay (1 ms in Node.js, 0 in browsers), so the timer would fire almost at once. Reject such values up front, loudly, rather than failing every payment in production.

with-timeout.js

```ts
export function withTimeout(promise, ms, label = "operation") {
  if (!(ms > 0)) throw new RangeError(`timeout must be a positive number of ms, got ${ms}`);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms} ms`);
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

Now a slow payment provider. It records every charge it actually makes, so you can see what happens to the request that lost the race:

timeout-demo.js

```ts
import { withTimeout } from "./with-timeout.js";

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const provider = { charged: [] };

async function charge(orderId, ms) {
  await wait(ms);
  provider.charged.push(orderId);
  return { orderId, status: "paid" };
}

console.log(await withTimeout(charge(7, 20), 100, "payment for order 7"));

try {
  await withTimeout(charge(8, 150), 50, "payment for order 8");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
  console.log("charged so far:", provider.charged);
}

await wait(150);
console.log("charged a little later:", provider.charged);
```

Output of `node timeout-demo.js` and of the browser terminal

```json
{ orderId: 7, status: 'paid' }
TimeoutError: payment for order 8 timed out after 50 ms
charged so far: [ 7 ]
charged a little later: [ 7, 8 ]
```

Order 8 timed out after 50 ms, so the checkout moved on. Then, 100 ms later, the provider charged it anyway. This is the real-world meaning of the reasoning above: the checkout must record order 8 as "payment status unknown" and check with the provider, not tell the customer "payment failed, please try again".

Two more facts about `race`: `Promise.race([])` never settles (there is nothing to win), and if the first promise to settle is a rejection, `race` rejects even when a success would have come a moment later. For "the first one that works", use `any`.

## Promise.any: the first success

`Promise.any(iterable)` fulfils with the **first value that succeeds**, ignoring failures. It only rejects when *every* input has failed, with an `AggregateError`: an error with an `errors` array that holds each reason, in input order.

A shop shows prices in dollars as well as naira and can ask three exchange-rate providers. Any one answer will do, and the fastest working one is best:

any.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function provider(name, ms, rate) {
  return async () => {
    await wait(ms);
    if (rate === null) throw new Error(`${name} is down`);
    return { name, rate };
  };
}

const providers = [
  provider("rates-a", 10, null),
  provider("rates-b", 40, 1540.25),
  provider("rates-c", 25, 1539.8),
];

console.log(await Promise.any(providers.map((ask) => ask())));

try {
  await Promise.any([provider("rates-a", 10, null)(), provider("rates-b", 5, null)()]);
} catch (error) {
  console.log(error.constructor.name, "-", error.message);
  console.log(error.errors.map((e) => e.message));
}

try {
  await Promise.any([]);
} catch (error) {
  console.log("any([]):", error.constructor.name);
}
```

Output of `node any.js` and of the browser terminal

```json
{ name: 'rates-c', rate: 1539.8 }
AggregateError - All promises were rejected
[ 'rates-a is down', 'rates-b is down' ]
any([]): AggregateError
```

`rates-a` failed first, and `any` ignored it and took `rates-c`, the fastest provider that worked. When all failed, `error.errors` listed the reasons in *input* order (`rates-a` first), not in the order they failed. And an empty list rejects at once, because no success is possible.

### Choosing a combinator

The question that decides is: "what does the caller need when one of these fails?"

| Method | Fulfils when | Rejects when | Empty input | Typical use |
| --- | --- | --- | --- | --- |
| `all` | all fulfil (array of values) | the first one rejects | fulfils with `[]` | every result is required: an order's items and prices |
| `allSettled` | all have settled (array of reports) | never | fulfils with `[]` | partial results are useful: dashboard widgets |
| `race` | the first to settle fulfils | the first to settle rejects | never settles | time limits |
| `any` | the first one fulfils | all reject (`AggregateError`) | rejects | redundant sources: mirrors, rate providers |

## Promise.withResolvers: a promise for a one-off event

Sometimes the thing you wait for is not a function call but an *event* that happens somewhere else: a payment provider calls your webhook (an HTTP request the provider sends to your server when something happens) to say the payment is confirmed. The code that starts the payment wants to `await` the confirmation, but the code that receives it is a different function.

You need a promise whose `resolve` and `reject` you can hand to someone else. `Promise.withResolvers()` (added in ES2024) returns exactly that: `{ promise, resolve, reject }`. Before it existed, you wrote the same thing with `new Promise` and copied the functions out, as in the [resolved-but-pending example](https://zudojs.oyinlola.site/learn/js-promises#resolve) of the last lesson.

with-resolvers.js

```ts
const waiting = new Map();   // orderId -> { resolve, reject }

function waitForConfirmation(orderId) {
  const { promise, resolve, reject } = Promise.withResolvers();
  waiting.set(orderId, { resolve, reject });
  return promise.finally(() => waiting.delete(orderId));
}

// Called when the provider's webhook request arrives.
function onWebhook(event) {
  const waiter = waiting.get(event.orderId);
  if (!waiter) return console.log(`webhook for order ${event.orderId}: nobody waiting`);
  if (event.status === "paid") waiter.resolve(event);
  else waiter.reject(new Error(`order ${event.orderId}: ${event.status}`));
}

setTimeout(() => onWebhook({ orderId: 7, status: "paid", ref: "PSK_81" }), 20);
setTimeout(() => onWebhook({ orderId: 8, status: "failed" }), 30);
setTimeout(() => onWebhook({ orderId: 9, status: "paid" }), 40);

const results = await Promise.allSettled([waitForConfirmation(7), waitForConfirmation(8)]);
console.log(results.map((r) => (r.status === "fulfilled" ? r.value.ref : r.reason.message)));
console.log("still waiting:", waiting.size);
await new Promise((resolve) => setTimeout(resolve, 30));
```

Output of `node with-resolvers.js` and of the browser terminal

```json
[ 'PSK_81', 'order 8: failed' ]
still waiting: 0
webhook for order 9: nobody waiting
```

Order 9's webhook arrived when nobody was waiting for it, so it was only logged. The `finally` removes the entry once the promise settles, so the map does not grow forever (an unbounded map is a memory leak, the subject of [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory)). A real version would also wrap `waitForConfirmation` in `withTimeout`: a webhook may never arrive.

### Promise.try

A related newer helper, `Promise.try(fn)` (ES2025), calls `fn` straight away and always gives you a promise: a returned value fulfils it, a returned promise is adopted, and a *synchronous* throw becomes a rejection. It is handy when you call a function that might be synchronous or asynchronous and want one way of handling its errors:

promise-try.js

```ts
function priceOf(sku) {
  if (!sku) throw new TypeError("sku is required");       // synchronous throw
  return Promise.resolve(9_500);                             // or a promise
}

console.log(await Promise.try(priceOf, "rice-5kg"));
console.log(await Promise.try(priceOf, "").catch((error) => `rejected: ${error.message}`));
```

Output of `node promise-try.js` and of the browser terminal

```ts
9500
rejected: sku is required
```

## Sequential, parallel and batched

You now have three shapes for running a list of asynchronous jobs. Each has a place.

### Sequential: when order matters

Some work must happen one step at a time: posting entries to a bank account's ledger, where each entry's balance depends on the one before; or applying database migrations in order. A plain `for...of` loop with `await` does that. The array method `forEach` does **not**: it calls your async function for every item, ignores the promises it returns, and finishes immediately:

foreach-bug.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let balance = 10_000;

async function post(entry) {
  const before = balance;
  await wait(10);                        // talk to the database
  balance = before + entry;
}

const entries = [5_000, -3_000, 2_500];

entries.forEach(async (entry) => {
  await post(entry);
});
console.log("forEach finished at once, balance:", balance);
await wait(50);
console.log("after forEach:", balance, "(should be 14500)");

balance = 10_000;
for (const entry of entries) {
  await post(entry);
}
console.log("after for...of:", balance);
```

Output of `node foreach-bug.js` and of the browser terminal

```ts
forEach finished at once, balance: 10000
after forEach: 12500 (should be 14500)
after for...of: 14500
```

`forEach` started all three posts at the same time. Each one read the balance before any had written it back, so the last write won and two entries were lost. This is a **race condition**: the result depends on the timing of operations that overlap. The `for...of` loop awaited each post before starting the next and got the right answer. Array methods are not async-aware: `filter` and `reduce` given async callbacks break the same way (`filter` receives a promise, which is always truthy, so it keeps every item), and `map` only works because it hands you an array of promises that you then pass to `Promise.all`, as in the next section.

### Parallel: when items are independent

`await Promise.all(items.map(fn))` runs every job at once. It is the fastest, and right for a handful of items. It is wrong for a *large* list: sending 10,000 emails this way opens 10,000 connections to the mail server at once, which will refuse most of them or rate-limit your account.

### Batched: a limit on how many run at once

A simple middle ground is to split the list into **batches** of a fixed size, run each batch in parallel, and the batches one after another. [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#practice) did this with a loop; here it is as a reusable helper, together with a sequential one:

shapes.js

```ts
export async function mapSeries(items, fn) {
  const results = [];
  for (const [i, item] of items.entries()) results.push(await fn(item, i));
  return results;
}

export async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...(await Promise.all(batch.map((item, j) => fn(item, i + j)))));
  }
  return results;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let running = 0;
let peak = 0;

async function sendEmail(to) {
  running += 1;
  peak = Math.max(peak, running);
  await wait(20);
  running -= 1;
  return `sent to ${to}`;
}

const customers = ["ada", "bola", "chidi", "dayo", "emeka", "funke", "gozie"];

for (const [name, run, rounds] of [
  ["sequential", () => mapSeries(customers, sendEmail), 7],
  ["batches of 3", () => inBatches(customers, 3, sendEmail), 3],
  ["all at once", () => Promise.all(customers.map(sendEmail)), 1],
]) {
  peak = 0;
  const start = Date.now();
  const results = await run();
  const ms = Date.now() - start;
  console.log(`${name.padEnd(12)} results: ${results.length}, at most ${peak} at once, took at least ${rounds} x 20 ms: ${ms >= rounds * 20 - 3}`);
}
```

Output of `node shapes.js` and of the browser terminal

```ts
sequential   results: 7, at most 1 at once, took at least 7 x 20 ms: true
batches of 3 results: 7, at most 3 at once, took at least 3 x 20 ms: true
all at once  results: 7, at most 7 at once, took at least 1 x 20 ms: true
```

Sequential took seven rounds with one email in flight; all-at-once took one round with seven in flight; batches of 3 took three rounds (3 + 3 + 1) with never more than 3 in flight. Batching has one weakness: each batch waits for its slowest item. If one email in a batch takes 5 seconds, the other two slots sit empty for those 5 seconds. A **pool** fixes that by starting the next job as soon as *any* slot frees up. You will build one in [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency), to send 1,000 emails 5 at a time.

## Build: a dashboard that survives

Now combine the toolkit. The dashboard's rules:

- All widgets load in parallel.
- Each widget has its own time limit; a slow widget shows "unavailable" instead of holding the page.
- The shop's name comes from the account service and is required: if it fails, the whole page fails.
- The response lists what is missing and why, so the page can show it and the logs can count it.

dashboard.js

```ts
import { withTimeout } from "./with-timeout.js";

export async function loadDashboard(services, { limitMs = 100 } = {}) {
  const account = withTimeout(services.account(), limitMs, "account");
  const names = Object.keys(services.widgets);
  const widgetReports = Promise.allSettled(
    names.map((name) => withTimeout(services.widgets[name](), limitMs, name)),
  );

  const [shop, reports] = await Promise.all([account, widgetReports]);

  const dashboard = { shop: shop.name, widgets: {}, missing: [] };
  for (const [i, report] of reports.entries()) {
    if (report.status === "fulfilled") dashboard.widgets[names[i]] = report.value;
    else dashboard.missing.push(`${names[i]}: ${report.reason.message}`);
  }
  return dashboard;
}
```

The account and the widgets all start at once, and one `Promise.all` waits for "the required part" and "the report of the optional parts" together. Because `allSettled` never rejects, the only way that `Promise.all` can fail is the account. The tests build fake services for each situation:

dashboard-test.js

```ts
import { loadDashboard } from "./dashboard.js";

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const fail = (ms, message) => wait(ms).then(() => { throw new Error(message); });

function fakeServices(overrides = {}) {
  return {
    account: () => wait(10, { name: "Mama Put Stores" }),
    widgets: {
      sales: () => wait(30, "₦482,500"),
      lowStock: () => wait(20, ["oil-1l"]),
      refunds: () => wait(15, 1),
      ...overrides.widgets,
    },
    ...(overrides.account ? { account: overrides.account } : {}),
  };
}

async function test(name, run) {
  try {
    console.log(`PASS ${name}: ${await run()}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

await test("everything works", async () => {
  const d = await loadDashboard(fakeServices());
  return `${d.shop}, widgets ${Object.keys(d.widgets)}, missing ${d.missing.length}`;
});

await test("a broken widget is reported", async () => {
  const d = await loadDashboard(fakeServices({ widgets: { lowStock: () => fail(5, "HTTP 503") } }));
  return `widgets ${Object.keys(d.widgets)}; missing ${d.missing}`;
});

await test("a slow widget does not hold the page", async () => {
  const start = Date.now();
  const d = await loadDashboard(fakeServices({ widgets: { sales: () => wait(2_000, "late") } }));
  return `missing ${d.missing}; finished long before the 2-second service: ${Date.now() - start < 1_000}`;
});

await test("a failed account fails the page", async () => {
  const error = await loadDashboard(fakeServices({ account: () => fail(5, "account service down") })).then(
    () => null,
    (e) => e,
  );
  if (!error) throw new Error("expected a rejection");
  return error.message;
});
```

Output of `node dashboard-test.js` and of the browser terminal

```ts
PASS everything works: Mama Put Stores, widgets sales,lowStock,refunds, missing 0
PASS a broken widget is reported: widgets sales,refunds; missing lowStock: HTTP 503
PASS a slow widget does not hold the page: missing sales: sales timed out after 100 ms; finished long before the 2-second service: true
PASS a failed account fails the page: account service down
```

The slow-widget test is the one that matters most in production, and it passed in about 100 ms although the fake sales service takes 2 seconds. One thing to notice: the program still ends properly. `withTimeout` cleared its own timers, but the fake 2-second `sales` timer kept running until it fired. That is the "loser keeps running" rule again. For a read-only widget it is harmless; for something that writes, you need real cancellation, which [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency#abort) adds with `AbortController` and `AbortSignal.timeout`.

## Combining promises in production

- **Look for waterfalls.** Two `await`s in a row whose second call does not use the first result are a free speed-up. Tracing tools (see [Observability](https://zudojs.oyinlola.site/learn/zudo-observability)) show waterfalls as a staircase of spans.
- **Never leave a started promise without a handler** while you await something else. Prefer a combinator, which handles all of them at once.
- **Put a time limit on every call that leaves the process.** Treat a timeout on a write (a payment, a transfer) as "status unknown", check the real status, and use idempotency keys so a retry cannot charge twice.
- **Clear your timers.** A `race` timeout without `clearTimeout` keeps a timer alive for every request: in a busy server that is thousands of pending timers, and a process that will not exit cleanly.
- **Check every `allSettled` report**, and log or count the failures. A dashboard that silently shows empty widgets hides an outage.
- **Bound your parallelism.** `Promise.all` over a list that comes from users or a database can be 10 items today and 100,000 next month. Use batches or a pool with a fixed limit.

## Practice

TRY IT YOURSELF

### Fix the waterfall

This order page loads the order, then the customer and the shipping quote. The customer and the quote both need the order, but not each other. Make it as fast as possible without changing the services. The services count how many requests are in flight at once, so you can see the difference.

order-page.js

```ts
let inFlight = 0;
let peak = 0;
const wait = async (ms, value) => {
  peak = Math.max(peak, ++inFlight);
  await new Promise((resolve) => setTimeout(resolve, ms));
  inFlight--;
  return value;
};
const getOrder = (id) => wait(30, { id, customerId: 4, city: "Ibadan" });
const getCustomer = (id) => wait(30, { id, name: "Bola" });
const getShippingQuote = (city) => wait(30, { city, kobo: 250_000 });

const order = await getOrder(7);
const customer = await getCustomer(order.customerId);
const quote = await getShippingQuote(order.city);
console.log(customer.name, quote.kobo, "| most requests in flight at once:", peak);
```

Output of `node order-page.js` and of the browser terminal

```ts
Bola 250000 | most requests in flight at once: 1
```

**Show a solution**

The order must come first. After that, the customer and the quote are independent, so start them together. The page now takes two rounds of 30 ms instead of three:

order-page-fast.js

```ts
let inFlight = 0;
let peak = 0;
const wait = async (ms, value) => {
  peak = Math.max(peak, ++inFlight);
  await new Promise((resolve) => setTimeout(resolve, ms));
  inFlight--;
  return value;
};
const getOrder = (id) => wait(30, { id, customerId: 4, city: "Ibadan" });
const getCustomer = (id) => wait(30, { id, name: "Bola" });
const getShippingQuote = (city) => wait(30, { city, kobo: 250_000 });

const order = await getOrder(7);
const [customer, quote] = await Promise.all([getCustomer(order.customerId), getShippingQuote(order.city)]);
console.log(customer.name, quote.kobo, "| most requests in flight at once:", peak);
```

Output of `node order-page-fast.js` and of the browser terminal

```ts
Bola 250000 | most requests in flight at once: 2
```

Dependencies decide the shape: work that needs a result must wait for it; work that does not should not.

TRY IT YOURSELF

### A deadline for a whole group

Write `allWithin(promises, ms)`: like `Promise.allSettled`, but any promise that has not settled after `ms` gets the report `{ status: "timeout" }`. The function itself must finish after at most about `ms`. Test it with a fast success, a fast failure and a slow promise.

**Show a solution**

all-within.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

function allWithin(promises, ms) {
  const TIMEOUT = Symbol("timeout");
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  const reports = promises.map((p) =>
    Promise.race([
      Promise.resolve(p).then(
        (value) => ({ status: "fulfilled", value }),
        (reason) => ({ status: "rejected", reason: reason.message }),
      ),
      deadline,
    ]).then((r) => (r === TIMEOUT ? { status: "timeout" } : r)),
  );
  return Promise.all(reports).finally(() => clearTimeout(timer));
}

const start = Date.now();
const reports = await allWithin(
  [wait(10, "sales"), wait(10).then(() => { throw new Error("503"); }), wait(1_000, "refunds")],
  50,
);
console.log(reports);
console.log("finished long before the 1-second promise:", Date.now() - start < 500);
```

Output of `node all-within.js` and of the browser terminal

```json
[
  { status: 'fulfilled', value: 'sales' },
  { status: 'rejected', reason: '503' },
  { status: 'timeout' }
]
finished long before the 1-second promise: true
```

One shared deadline promise is raced against each input, so all of them time out at the same moment. Each input is first turned into a report that never rejects, which is why `Promise.all` is safe here. The symbol `TIMEOUT` cannot be confused with any real value ([Symbols](https://zudojs.oyinlola.site/learn/js-symbols)).

TRY IT YOURSELF

### First working mirror, with a time limit each

Product images are stored on three mirrors. Using `Promise.any` and `withTimeout` from the kit, get the first image URL from a mirror that answers within 40 ms. Print the winner, and for a second call where no mirror answers in time, print each reason.

**Show a solution**

mirrors.js

```ts
import { withTimeout } from "./with-timeout.js";

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const mirror = (name, ms) => () => wait(ms, `https://${name}.example.com/rice-5kg.webp`);

async function firstImage(mirrors) {
  return Promise.any(mirrors.map((ask, i) => withTimeout(ask(), 40, `mirror ${i + 1}`)));
}

console.log(await firstImage([mirror("lagos", 90), mirror("abuja", 25), mirror("accra", 30)]));

try {
  await firstImage([mirror("lagos", 90), mirror("abuja", 60)]);
} catch (error) {
  console.log(error.errors.map((e) => e.message));
}
```

Output of `node mirrors.js` and of the browser terminal

```ts
https://abuja.example.com/rice-5kg.webp
[ 'mirror 1 timed out after 40 ms', 'mirror 2 timed out after 40 ms' ]
```

Each mirror gets its own limit, so a slow mirror counts as a failure, and `any` skips failures. Only when every mirror fails or is too slow does the caller get an `AggregateError` with all the reasons.

## Recap

- A promise's work starts when the promise is created. Awaiting independent work one by one is a waterfall; start it together and wait together.
- Awaiting started promises one at a time can leave the others unhandled. The combinators attach handlers to every input immediately.
- `all`: every value in input order, or the first failure (fail-fast). It never cancels the other work.
- `allSettled`: a report per input, never rejects; check every report and add time limits.
- `race`: the first to settle, used for timeouts. The losing work keeps running; clear the timer, and treat a timed-out write as "status unknown".
- `any`: the first success, or an `AggregateError` with every reason. `withResolvers` turns a one-off event into a promise; `Promise.try` turns sync throws into rejections.
- Sequential for dependent or ordered work (never `forEach` with async), parallel for a few independent items, batches or a pool for many.

Next: [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop), where you find out exactly when each of these callbacks runs, and why promise callbacks beat timers.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
