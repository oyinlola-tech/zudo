---
title: "Memory and garbage collection — ZudoJS Academy"
description: "Learn how the garbage collector decides what to free, cause and fix the classic leaks, and measure memory with process.memoryUsage and heap snapshots."
source: https://zudojs.oyinlola.site/learn/js-memory
---

LEVEL 4 · LESSON 18 OF 20

How JavaScript runs Core

# Memory and garbage collection

Learn how the garbage collector decides what to free, cause and fix the classic leaks, and measure memory with process.memoryUsage and heap snapshots.

- **55 min** to read and try
- **You need:** How JavaScript runs, Concurrency and cancellation, Collections in depth, and Closures in depth
- **You build:** A leak hunt in a price-alert service: measure the leak, find the leaked objects in a heap snapshot, and fix the listener, timer and cache leaks

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain garbage collection in terms of roots and reachability, and why cycles are not a problem
- Recognise the classic leaks: growing module-level collections, forgotten listeners, uncleared timers, closures and unbounded caches
- Fix leaks by removing listeners (including with an AbortSignal), clearing timers and bounding caches
- Choose between Map, WeakMap and WeakRef, and know what FinalizationRegistry can and cannot promise
- Measure memory growth with process.memoryUsage and find leaked objects in a heap snapshot

## The server that restarts every six hours

The shop's price-alert service lets customers watch a product and get told when its price drops. It works. But its memory use climbs all day, and every six hours or so the container runs out of memory, is killed by the platform (an **out-of-memory**, or OOM, kill), and restarts. Customers who were connected at that moment lose their alerts. Nobody wrote code to keep old data. So what is holding on to it?

Here is a copy of the request handler with the same bug, run for 5,000 requests. It measures the memory used by JavaScript objects before and after, using Node's `process.memoryUsage()`. Garbage collection normally runs whenever the engine decides; to make the measurement fair, the example asks the engine to collect garbage right before each measurement (how that works is explained later, and it is for experiments only):

problem.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const heapUsed = () => (collectGarbage(), process.memoryUsage().heapUsed);

const recentQuotes = new Map();

function handleQuoteRequest(requestId, sku) {
  const quote = {
    sku,
    kobo: 950_000,
    history: Array.from({ length: 200 }, (_, day) => ({ day, kobo: 900_000 + day })),
  };
  recentQuotes.set(requestId, quote);       // "cache it, in case the same request comes again"
  return quote.kobo;
}

const before = heapUsed();
for (let i = 1; i <= 5_000; i++) handleQuoteRequest(`req-${i}`, "rice-5kg");
const after = heapUsed();

console.log("requests handled:", 5_000);
console.log("heap grew by more than 10 MB:", after - before > 10 * 1024 * 1024);
console.log("entries in recentQuotes:", recentQuotes.size);
```

Output of `node problem.js`

```ts
requests handled: 5000
heap grew by more than 10 MB: true
entries in recentQuotes: 5000
```

Every request finished, but its quote stayed in memory, because the request id is new every time, so the "cache" never hits and never shrinks. Each request left behind a few kilobytes; at thousands of requests an hour, that is the six-hour crash. The code has no bug in the usual sense: every line does what it says. The bug is about *what stays reachable*, and to fix bugs like it you need to know how JavaScript decides what memory to free.

## Values, references and the heap

From [How JavaScript runs](https://zudojs.oyinlola.site/learn/js-execution#contexts): a function's local variables live in its stack frame, which disappears when the function returns. Objects, arrays, functions and closures live on the **heap**. A variable or property that "contains" an object really holds a **reference**: an arrow pointing to the object on the heap. Several references can point to the same object, and copying a variable copies the arrow, not the object:

references.js

```ts
const order = { id: 7, items: ["rice-5kg"] };
const sameOrder = order;                 // a second reference, not a copy
const report = { orders: [order] };      // a third, from inside another object

sameOrder.items.push("oil-1l");
console.log(order.items, report.orders[0] === order);

let current = order;
current = null;                          // removes one arrow; the object is still reachable
console.log(report.orders[0].id);
```

Output of `node references.js` and of the browser terminal

```json
[ 'rice-5kg', 'oil-1l' ] true
7
```

Setting `current` to `null` did not delete the order; it only removed one arrow. The order is still reachable through `order`, `sameOrder` and `report`. That is the whole idea behind garbage collection.

## Garbage collection: roots and reachability

JavaScript has no `free` or `delete object`. Memory is reclaimed by the **garbage collector** (GC), a part of the engine that runs from time to time and frees every object your program can no longer reach. "Reach" has a precise meaning:

1. Start from the **roots**: the global object, the variables of every module, the variables in every frame on the call stack, and everything the host is holding on your behalf: callbacks of pending timers, registered event listeners, handlers waiting on unsettled promises, and so on.
2. Follow every reference from those, then every reference from what you found, and so on. Everything found is **reachable**, and stays.
3. Everything else is garbage, and its memory can be reused.

This is called **mark and sweep**: mark everything reachable, sweep away the rest.

```ts
 ROOTS                                  HEAP
 ─────                                  ────
 module variable recentQuotes ───────▶  Map ──▶ quote req-1 ──▶ history ...
                                             ──▶ quote req-2 ──▶ history ...   reachable: kept
 pending setInterval callback ───────▶  closure ──▶ session 81

 stack frame of handleRequest ───────▶  order 7 ◀──┐
                                             │      │                             reachable: kept
                                             └──▶ customer ─┘  (a cycle)

                                        order 3 ◀──▶ customer 3                   unreachable from any
                                                                                  root: garbage, even
                                                                                  though they point at
                                                                                  each other
```

Only what can be reached from a root survives. A cycle of objects nobody else points to is garbage.

Two consequences:

- **Cycles are not a problem.** An order that points to its customer, whose customer points back to the order, is freed as soon as nothing *outside* the pair can reach either of them. (Older collectors based on *reference counting*, which free an object when its count of incoming references drops to zero, could not free cycles. JavaScript engines do not rely on that.)
- **A leak is a reference you forgot.** In a garbage-collected language, a **memory leak** means objects you no longer need are still reachable from a root. The collector is doing its job: you told it, by keeping a reference, that you still need them.

### Generations

Most objects die young: the temporary arrays and strings of one request. So V8 splits the heap into a small **young generation**, collected very often and cheaply, and a large **old generation** for objects that survived a couple of young collections, collected less often with a full mark and sweep (done mostly in the background and in small steps, so pauses stay short). A leak shows up as an old generation that keeps growing: objects that were meant to be temporary keep surviving and get promoted.

### Watching the collector work

You normally cannot see when an object is collected, and your program should never depend on it. For experiments, Node.js can expose a function that forces a full collection, and `WeakRef` (a reference that does not keep its target alive, covered below) lets you check afterwards whether an object still exists:

reachability.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

let order = { id: 7 };
let customer = { name: "Ada", orders: [order] };
order.customer = customer;                        // a cycle: order <-> customer
const orderRef = new WeakRef(order);

const report = { topOrder: order };               // one more reference, from elsewhere
order = null;
customer = null;
await nextTask();
collectGarbage();
console.log("still referenced by report:", orderRef.deref()?.id);

report.topOrder = null;                           // now nothing outside the cycle points in
await nextTask();
collectGarbage();
console.log("after the last outside reference is gone:", orderRef.deref());
```

Output of `node reachability.js`

```ts
still referenced by report: 7
after the last outside reference is gone: undefined
```

The cycle did not keep the pair alive; only the outside reference from `report` did. (The `await nextTask()` is needed because the engine keeps any object you read through a `WeakRef` alive until the end of the current task.)

> WATCH OUT
>
> `--expose-gc` and forcing collections are for experiments and memory tests only. In production, let the engine decide when to collect: it knows much better than your code.

## The classic leaks

Almost every leak in a JavaScript server is one of five shapes. Each one is a root you did not think of, holding something you thought was temporary.

### 1. Collections that only grow

A module-level `Map`, `Set` or array is reachable for as long as the module is loaded, which on a server means forever. Anything added and never removed is leaked. The first example was this leak. It often hides behind good intentions: a cache, a list of "recent" items, a registry of connections, the map of waiting promises from [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#with-resolvers). The rule: **every collection that grows needs a rule for shrinking**, such as a maximum size, an expiry time, or removal when the thing it describes ends.

(Old-style "accidental globals" belong here too: in non-strict scripts, assigning to an undeclared variable, `total = 5`, creates a property on the global object that lives forever. ES modules and classes are always strict, where that line throws a `ReferenceError` instead. One more reason to use modules.)

### 2. Event listeners that are never removed

An event emitter (the DOM's `EventTarget`, Node's `EventTarget` and `EventEmitter`, or the event bus from [Events](https://zudojs.oyinlola.site/learn/zudo-events) later in the academy) holds a reference to every listener registered on it, and each listener is a closure that holds whatever it uses. If a long-lived emitter gets a new listener per request and nobody removes it, every request's data stays reachable from the emitter:

listener-leak.js

```ts
const priceFeed = new EventTarget();              // lives as long as the server
let listeners = 0;

function watchPrice(customer, sku) {
  const alerts = [];                              // per-customer data
  const onChange = (event) => {
    if (event.detail.sku === sku) alerts.push(`${customer}: ${sku} is now ₦${event.detail.kobo / 100}`);
  };
  priceFeed.addEventListener("change", onChange);
  listeners += 1;
  return alerts;
}

for (let i = 1; i <= 1_000; i++) watchPrice(`customer-${i}`, "rice-5kg");
// ... all 1,000 customers have long since closed the page ...

priceFeed.dispatchEvent(new CustomEvent("change", { detail: { sku: "rice-5kg", kobo: 890_000 } }));
console.log("listeners still registered:", listeners);
```

Output of `node listener-leak.js` and of the browser terminal

```ts
listeners still registered: 1000
```

`EventTarget` has no way to count listeners, so the example counts them itself. Every one of those 1,000 closures, and each customer's `alerts` array, is still reachable from `priceFeed`, and every price change now runs 1,000 callbacks for customers who left. The leak costs memory *and* time.

The fix is to remove the listener when its reason to exist ends. `removeEventListener` needs the very same function object, which is easy to lose. The modern way is to pass an `AbortSignal` as the listener's `signal` option: aborting the signal removes the listener (and every other listener registered with that signal). That ties the listener's lifetime to the thing it belongs to, a request or a connection:

listener-signal.js

```ts
const priceFeed = new EventTarget();
let deliveredTo = [];

function watchPrice(customer, sku, { signal }) {
  priceFeed.addEventListener(
    "change",
    (event) => {
      if (event.detail.sku === sku) deliveredTo.push(customer);
    },
    { signal },
  );
}

const connections = [];
for (let i = 1; i <= 3; i++) {
  const connection = new AbortController();
  watchPrice(`customer-${i}`, "rice-5kg", { signal: connection.signal });
  connections.push(connection);
}

priceFeed.dispatchEvent(new CustomEvent("change", { detail: { sku: "rice-5kg" } }));
console.log("before disconnects:", deliveredTo);

connections[0].abort();            // customer 1 closed the page
connections[2].abort();            // customer 3 closed the page
deliveredTo = [];
priceFeed.dispatchEvent(new CustomEvent("change", { detail: { sku: "rice-5kg" } }));
console.log("after disconnects: ", deliveredTo);
```

Output of `node listener-signal.js` and of the browser terminal

```ts
before disconnects: [ 'customer-1', 'customer-2', 'customer-3' ]
after disconnects:  [ 'customer-2' ]
```

Node's `EventEmitter` helps you notice this leak: when one event gets more than 10 listeners (the default limit), it emits a `MaxListenersExceededWarning`. That warning is almost always a real leak. Do not silence it by raising the limit until you have checked:

max-listeners.jsNode.js only

```ts
import { EventEmitter } from "node:events";

process.on("warning", (warning) => console.log("warning:", warning.name));

const priceFeed = new EventEmitter();
for (let i = 1; i <= 11; i++) priceFeed.on("change", () => {});
console.log("listeners:", priceFeed.listenerCount("change"), "limit:", priceFeed.getMaxListeners());

await new Promise((resolve) => setTimeout(resolve, 10));
```

Output of `node max-listeners.js`

```ts
listeners: 11 limit: 10
warning: MaxListenersExceededWarning
```

### 3. Timers that are never cleared

A pending timer is a root: the host holds its callback until it fires, and a `setInterval` fires forever. Whatever the callback's closure uses stays alive with it. A heartbeat per connection that is never cleared when the connection closes keeps every connection's data forever, and keeps doing work for it:

timer-leak.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const everyTimerForTheDemo = [];                                  // only so the demo can end

function openConnection(id, { leak, beats }) {
  const session = { id, buffer: new Array(10_000).fill(0) };     // about 80 KB each
  const heartbeat = setInterval(() => beats.set(session.id, (beats.get(session.id) ?? 0) + 1), 5);
  everyTimerForTheDemo.push(heartbeat);
  return {
    close() {
      if (!leak) clearInterval(heartbeat);
    },
  };
}

const total = (beats) => [...beats.values()].reduce((a, b) => a + b, 0);

for (const leak of [true, false]) {
  const beats = new Map();
  const connections = Array.from({ length: 20 }, (_, i) => openConnection(i, { leak, beats }));
  await wait(12);
  connections.forEach((c) => c.close());
  const beatsAtClose = total(beats);
  await wait(30);
  console.log(leak ? "leaky: " : "fixed: ", "heartbeats kept running after close:", total(beats) > beatsAtClose);
}

everyTimerForTheDemo.forEach(clearInterval);                     // end the demo
```

Output of `node timer-leak.js` and of the browser terminal

```ts
leaky:  heartbeats kept running after close: true
fixed:  heartbeats kept running after close: false
```

In the leaky version, closing the connection did nothing to the interval: it kept firing, and its closure kept `session` alive. In a server, that is one more running timer per connection ever opened. The demo keeps every timer in `everyTimerForTheDemo` only so that it can stop them at the end and exit; a real leak has no such list, and once the reference is lost the timer can never be cleared. The rule: **every `setInterval` has a matching `clearInterval`, in the code that ends its owner's life**. In Node.js, `timer.unref()` additionally lets the process exit even if the timer is pending, which is right for background housekeeping timers.

### 4. Closures that capture more than you think

A closure keeps alive the variables it uses from its outer scope ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures)). Engines optimise this: V8 keeps only variables that some closure actually uses. But all closures created in the same scope share one context object, so if *any* of them uses a big variable, *all* of them keep it:

closure-capture.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const heapUsed = () => (collectGarbage(), process.memoryUsage().heapUsed);

function loadReport(month) {
  const rows = Array.from({ length: 100_000 }, (_, i) => ({ order: i, kobo: 1_000 + i }));
  const total = rows.reduce((sum, row) => sum + row.kobo, 0);
  const debugDump = () => rows.length;          // uses rows, never called
  return () => `${month}: ₦${total / 100}`;     // only uses month and total
}

const before = heapUsed();
const summaries = ["2026-07", "2026-08", "2026-09"].map(loadReport);
const after = heapUsed();

console.log(summaries[2]());
console.log("the summaries keep the rows alive (more than 5 MB):", after - before > 5 * 1024 * 1024);
```

Output of `node closure-capture.js`

```ts
2026-09: ₦50999500
the summaries keep the rows alive (more than 5 MB): true
```

The returned function only needs `month` and `total`, but `debugDump`, created in the same call, uses `rows`, so the shared context keeps all 100,000 rows of each month alive. Delete `debugDump` (or compute what you need in a separate function) and the rows are freed as soon as `loadReport` returns. When a closure is long-lived (stored in a cache, registered as a listener, kept in a timer), check what its scope holds.

### 5. Caches without limits

A cache is a collection that grows by design, so it is leak number 1 with a better excuse. The first example was exactly this: a "cache" keyed by request id that could never hit and never shrank. A cache needs a **size limit**, an **expiry** (a time to live, or TTL), or both. [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections#lru) built both on top of a `Map`: an **LRU** cache ("least recently used") that moves each entry to the end when it is read and deletes the first key when it is full, and a TTL version with an injected clock. Two questions to ask of every cache you find in a leaking service:

- **Can it ever hit?** A key that is unique per request (a request id, a timestamp, a fresh object used as a `Map` key) makes a cache that only ever misses and only ever grows.
- **What removes entries?** If the answer is "nothing", it is a leak, however small each entry is. If the key is an object whose life should end the entry, a `WeakMap` (next section) removes it for you.

Production caches add expiry, statistics and stampede protection; [@zudojs/cache](https://zudojs.oyinlola.site/learn/zudo-cache) provides them.

## Weak references: WeakMap, WeakSet, WeakRef

Sometimes you want to attach data to an object *without* keeping the object alive. A normal `Map` keyed by objects holds a strong reference to every key, so the keys can never be collected. A **`WeakMap`** holds its keys **weakly**: an entry does not keep its key reachable, and when the key object is collected, the entry disappears with it.

[Collections in depth](https://zudojs.oyinlola.site/learn/js-collections#weakmap) used one to cache cart totals and to attach metadata to frozen requests, and showed the rules that follow from "weak": keys must be objects (or symbols not created with `Symbol.for`), because a primitive such as `"order-7"` can be recreated at any time and so never becomes unreachable; and a `WeakMap` has no `size` and cannot be iterated, because its contents change whenever the collector runs. `WeakSet` is the same idea for membership.

Here is the difference in memory, measured: the same 20,000 order objects, cached once in a `Map` and once in a `WeakMap`, after the orders themselves are dropped:

weakmap-memory.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const heapUsed = () => (collectGarbage(), process.memoryUsage().heapUsed);
const makeOrders = () => Array.from({ length: 20_000 }, (_, id) => ({ id, lines: new Array(50).fill(id) }));

const strong = new Map();
const weak = new WeakMap();
const remember = (cache) => (order) => cache.set(order, order.lines.length);

for (const [name, cache] of [["Map", strong], ["WeakMap", weak]]) {
  const before = heapUsed();
  let orders = makeOrders();
  orders.forEach(remember(cache));
  orders = null;                                   // the request is over
  await new Promise((resolve) => setTimeout(resolve, 0));
  const grew = heapUsed() - before;
  console.log(`${name.padEnd(7)} still holds the orders (more than 5 MB): ${grew > 5 * 1024 * 1024}`);
}
```

Output of `node weakmap-memory.js`

```ts
Map     still holds the orders (more than 5 MB): true
WeakMap still holds the orders (more than 5 MB): false
```

### WeakRef and FinalizationRegistry

A **`WeakRef`** is a single weak reference: `ref.deref()` returns the object if it still exists, or `undefined` once it has been collected. It suits caches of large objects that are cheap to rebuild, such as a rendered monthly report: keep it while memory allows, rebuild it if it is gone. A **`FinalizationRegistry`** lets you ask for a callback *after* an object has been collected, for example to remove its entry from a cache of `WeakRef`s:

weakref-cache.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

const reports = new Map();                          // month -> WeakRef(report)
const cleanup = new FinalizationRegistry((month) => {
  if (!reports.get(month)?.deref()) reports.delete(month);
  console.log(`finalized: report ${month} was collected, entry removed`);
});
let builds = 0;

function getReport(month) {
  const cached = reports.get(month)?.deref();
  if (cached) return cached;
  builds += 1;
  const report = { month, rows: new Array(100_000).fill(month) };
  reports.set(month, new WeakRef(report));
  cleanup.register(report, month);
  return report;
}

let open = getReport("2026-09");
console.log("same object while in use:", getReport("2026-09") === open, "| builds:", builds);

open = null;                                        // nobody is looking at the report now
await nextTask();
collectGarbage();
await nextTask();
console.log("entries left:", reports.size);
getReport("2026-09");
console.log("rebuilt after collection, builds:", builds);
```

Output of `node weakref-cache.js`

```ts
same object while in use: true | builds: 1
finalized: report 2026-09 was collected, entry removed
entries left: 0
rebuilt after collection, builds: 2
```

Use both with care. The specification promises very little about *when* an object is collected, and nothing about whether a finalization callback runs at all (a program may exit first). So:

- Never put essential logic in a finalizer: closing files, releasing locks or saving data must happen explicitly, with `close()`, `try`/`finally` or `using`. Finalizers are only for tidying up memory-related bookkeeping.
- Always handle `deref()` returning `undefined`, even right after you "just" created the object in an earlier task.
- Prefer `WeakMap` when you can: it covers most "data about an object" needs without any timing questions.

## Measuring memory

You cannot fix a leak you cannot see. Two tools cover most needs.

### process.memoryUsage()

[What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#process) introduced it. It returns sizes in bytes:

| Field | What it counts |
| --- | --- |
| `rss` | Resident set size: all memory the process holds in RAM (code, stacks, heap, buffers). This is what container limits and OOM kills look at. |
| `heapTotal` | Memory V8 has reserved for the JavaScript heap. |
| `heapUsed` | The part of the heap used by live objects (plus garbage not collected yet). The number to watch for leaks. |
| `external` | Memory outside the heap owned by JavaScript objects, such as the contents of `Buffer`s. |
| `arrayBuffers` | The part of `external` used by `ArrayBuffer`s and `Buffer`s. |

A single reading tells you little: `heapUsed` goes up and down all the time as garbage builds up and is collected. What reveals a leak is the **trend**: after a garbage collection, does the baseline keep rising with the amount of work done? Measure after a known amount of work, repeat, and compare:

trend.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const heapMb = () => (collectGarbage(), process.memoryUsage().heapUsed / 1024 / 1024);

const sessions = new Map();
function handleRequest(id, { leak }) {
  const data = { id, lines: Array.from({ length: 100 }, (_, i) => ({ i })) };
  if (leak) sessions.set(id, data);
  return data.lines.length;
}

for (const leak of [false, true]) {
  const readings = [];
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 2_000; i++) handleRequest(`${round}-${i}`, { leak });
    readings.push(heapMb());
  }
  const growth = readings.at(-1) - readings[0];
  const steady = readings.every((mb, i) => i === 0 || mb - readings[i - 1] > 1);
  console.log(`${leak ? "leaky" : "clean"}: grew by more than 5 MB over 3 rounds: ${growth > 5}, rose by over 1 MB every round: ${steady}`);
}
```

Output of `node trend.js`

```ts
clean: grew by more than 5 MB over 3 rounds: false, rose by over 1 MB every round: false
leaky: grew by more than 5 MB over 3 rounds: true, rose by over 1 MB every round: true
```

The clean handler does the same work and allocates just as much, but its baseline stays flat because everything it allocates becomes garbage. The leaky one rises with every round of requests. In production, record `heapUsed` and `rss` as metrics every few seconds and look at the graph over hours: a sawtooth with a flat baseline is healthy; a sawtooth whose baseline climbs is a leak.

### Heap snapshots

Once you know there is a leak, you need to know *what* is leaking. A **heap snapshot** is a file describing every object on the heap at one moment, what type it is, how big it is, and what references it. `v8.writeHeapSnapshot()` writes one from inside the program; you can also take them from Chrome DevTools connected with `node --inspect` ([Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools)), or have Node write one automatically when it runs out of memory with `--heapsnapshot-near-heap-limit=1`.

The file is JSON, so you can even analyse it yourself. This example leaks `Order` objects, writes a snapshot, and counts the objects in it by constructor name, which is the first thing you do in DevTools too (the "Summary" view, sorted by count):

snapshot.jsNode.js only

```ts
import v8 from "node:v8";
import { readFileSync, rmSync } from "node:fs";

class Order {
  constructor(id) {
    this.id = id;
    this.lines = [{ sku: "rice-5kg", qty: 1 }];
  }
}
class Customer {
  constructor(name) {
    this.name = name;
  }
}

const recentOrders = new Map();
function handleCheckout(id) {
  const customer = new Customer(`customer-${id}`);       // temporary: becomes garbage
  recentOrders.set(id, new Order(id));                    // leaked: kept forever
  return customer.name;
}
for (let id = 1; id <= 3_000; id++) handleCheckout(id);

const file = v8.writeHeapSnapshot();
const snapshot = JSON.parse(readFileSync(file, "utf8"));
rmSync(file);

const fields = snapshot.snapshot.meta.node_fields;           // each node is a group of numbers
const types = snapshot.snapshot.meta.node_types[0];
const counts = {};
for (let i = 0; i < snapshot.nodes.length; i += fields.length) {
  const type = types[snapshot.nodes[i + fields.indexOf("type")]];
  const name = snapshot.strings[snapshot.nodes[i + fields.indexOf("name")]];
  if (type === "object" && (name === "Order" || name === "Customer")) counts[name] = (counts[name] ?? 0) + 1;
}
console.log("snapshot file name ends with .heapsnapshot:", file.endsWith(".heapsnapshot"));
console.log("live objects by class:", counts);
```

Output of `node snapshot.js`

```ts
snapshot file name ends with .heapsnapshot: true
live objects by class: { Order: 3000 }
```

Taking a snapshot runs a full garbage collection first, so only reachable objects appear: all 3,000 `Order`s and no `Customer`s. In DevTools, the next step is to select one leaked object and look at its **retainers**: the chain of references from a root that keeps it alive (here: a `Map` in the module variable `recentOrders`). That chain points straight at the line to fix. The most effective method is **comparing two snapshots**: take one, do a batch of requests, take another, and look at which types grew.

> WATCH OUT
>
> Writing a snapshot pauses the process and needs roughly as much extra memory as the heap itself. Do it in staging, or on one instance taken out of the load balancer, never casually on a busy production server.

## Build: a leak hunt in the price-alert service

Here is the price-alert service from the first section, closer to the real thing. Each customer who opens a product page starts a "watch": it listens to the price feed, keeps a heartbeat timer to detect dead connections, and records the last quote in a cache. When the customer leaves, `stop()` is called.

REASON IT OUT

### Which objects should die when a customer leaves?

Before touching the code, list for one watch:

- Which objects are created for it, and which of them should be unreachable after `stop()`?
- For each, which root could still reach it: the price feed, the timer system, the cache, a closure?
- How will you prove the fix works, in a way that does not depend on how fast the machine is?
- What must the cache still do after you bound it, and what is the cost of a smaller cache?

**Show the reasoning**

- Per watch: the listener closure, the heartbeat closure, the session object with its history, and the cache entry. After `stop()`, none should be reachable.
- The feed reaches the listener (until it is removed); the host reaches the heartbeat callback (until the interval is cleared); the cache reaches its entry (until evicted). Each closure reaches the session. So each of the three roots must be cut: remove the listener, clear the interval, bound the cache.
- Measure after forced garbage collections, with enough watches that a leak is many megabytes, and assert on a threshold ("grew by more than 10 MB") rather than an exact number. Also check counts that do not depend on memory at all: listeners registered, timers pending, cache size.
- The cache still serves repeat quotes for popular products. A bound means rarely requested products are computed again, which costs a little time. Choose the size from how many distinct products are hot, not from how many requests arrive.

price-watch.js

```ts
export function createPriceWatchService(feed, { fixed }) {
  const lastQuotes = new Map();
  const maxQuotes = 100;
  const timers = new Set();

  function rememberQuote(key, quote) {
    lastQuotes.delete(key);
    lastQuotes.set(key, quote);
    if (fixed && lastQuotes.size > maxQuotes) lastQuotes.delete(lastQuotes.keys().next().value);
  }

  function watch(customerId, sku) {
    const session = { customerId, sku, history: Array.from({ length: 300 }, (_, i) => ({ i, kobo: 0 })) };
    const stopped = new AbortController();

    const onChange = (change) => {
      if (change.sku === sku) session.history.push({ kobo: change.kobo });
    };
    feed.on("change", onChange);
    if (fixed) stopped.signal.addEventListener("abort", () => feed.off("change", onChange), { once: true });

    const heartbeat = setInterval(() => session.history.length, 60_000);
    heartbeat.unref();                              // housekeeping timer: must not keep the process alive
    timers.add(heartbeat);
    if (fixed) {
      stopped.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        timers.delete(heartbeat);
      }, { once: true });
    }

    rememberQuote(`${customerId}:${sku}`, { sku, kobo: 950_000 });
    return { stop: () => stopped.abort() };
  }

  return { watch, stats: () => ({ listeners: feed.listenerCount("change"), timers: timers.size, quotes: lastQuotes.size }) };
}
```

The `fixed` flag switches the three fixes on and off, so the test can measure both versions with the same code. One `AbortController` per watch represents its lifetime, and every clean-up hangs off its signal, the pattern from [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency#abort). (The `timers` set exists only so the test can count pending heartbeats.) Now the test: 3,000 customers each watch a product and leave, in both versions:

leak-hunt.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import { createPriceWatchService } from "./price-watch.js";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");
const heapUsed = () => (collectGarbage(), process.memoryUsage().heapUsed);

for (const fixed of [false, true]) {
  const feed = new EventEmitter();
  feed.setMaxListeners(0);                       // this test registers thousands on purpose
  const service = createPriceWatchService(feed, { fixed });

  const before = heapUsed();
  for (let i = 1; i <= 3_000; i++) {
    const w = service.watch(`customer-${i}`, `sku-${i % 500}`);
    feed.emit("change", { sku: `sku-${i % 500}`, kobo: 900_000 });
    w.stop();                                    // the customer leaves
  }
  const grewMb = (heapUsed() - before) / 1024 / 1024;

  console.log(fixed ? "FIXED" : "LEAKY", service.stats());
  console.log(`  heap grew by more than 10 MB: ${grewMb > 10}, less than 2 MB: ${grewMb < 2}`);
}
```

Output of `node leak-hunt.js`

```ts
LEAKY { listeners: 3000, timers: 3000, quotes: 3000 }
  heap grew by more than 10 MB: true, less than 2 MB: false
FIXED { listeners: 0, timers: 0, quotes: 100 }
  heap grew by more than 10 MB: false, less than 2 MB: true
```

The leaky version kept 3,000 listeners, 3,000 heartbeat timers and 3,000 quotes, and the heap grew by well over 10 MB for customers who had all left. The fixed version ends with no listeners, no timers and at most 100 quotes, and its heap barely moved. The counts are the best assertions for a regression test: unlike megabytes, they do not depend on the engine version or the machine.

## Memory in production

- **Graph `heapUsed` and `rss` over time** for every service, and alert on a rising baseline, long before the OOM kill.
- **Know your limit.** V8 sizes its heap from the machine's memory, and in containers you should set it deliberately with `--max-old-space-size` (in MB), leaving room for everything outside the heap (`rss` is always larger than `heapUsed`).
- **Restarting is not a fix.** It hides the leak until traffic grows. Reproduce it with a load test, snapshot, compare, fix.
- **Give every growing thing an end:** caches get a size and a TTL, listeners get removed (prefer the `signal` option), intervals get cleared, maps of pending work get entries deleted in `finally`.
- **Read `MaxListenersExceededWarning` as a bug report.**
- **Stream large data** instead of loading it whole ([Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams)): a 2 GB export read into one string needs 2 GB of heap at once, which is not a leak but kills the process just the same.

## Practice

TRY IT YOURSELF

### The map of pending payments

A payment service keeps every payment it is waiting for in a module-level `Map`, so that a webhook can find it. Payments that fail never reach the line that deletes them. Run it, count what is left, then fix it so that the entry is removed however the payment ends.

pending-leak.js

```ts
const pending = new Map();

async function charge(id, kobo) {
  pending.set(id, { id, kobo, startedAt: 0 });
  if (kobo > 5_000_000) throw new Error(`limit exceeded for ${id}`);
  await Promise.resolve();                     // the provider answers
  pending.delete(id);
  return "paid";
}

const results = await Promise.allSettled([
  charge("PAY-1", 250_000),
  charge("PAY-2", 9_000_000),
  charge("PAY-3", 120_000),
  charge("PAY-4", 7_500_000),
]);
console.log(results.map((r) => r.status).join(" "));
console.log("still pending:", [...pending.keys()]);
```

Output of `node pending-leak.js` and of the browser terminal

```ts
fulfilled rejected fulfilled rejected
still pending: [ 'PAY-2', 'PAY-4' ]
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`finally` runs whether the code above it returned normally or threw — that is exactly "however the payment ends". Move the cleanup there instead of leaving it as the last line of the success path.

HINT 2

`try { if (kobo > 5_000_000) throw new Error(...); await Promise.resolve(); return "paid"; } finally { pending.delete(id); }`

SOLUTION

pending-fixed.js

```ts
const pending = new Map();

async function charge(id, kobo) {
  pending.set(id, { id, kobo, startedAt: 0 });
  try {
    if (kobo > 5_000_000) throw new Error(`limit exceeded for ${id}`);
    await Promise.resolve();                   // the provider answers
    return "paid";
  } finally {
    pending.delete(id);                        // runs on success, on error and on return
  }
}

const results = await Promise.allSettled([
  charge("PAY-1", 250_000),
  charge("PAY-2", 9_000_000),
  charge("PAY-3", 120_000),
  charge("PAY-4", 7_500_000),
]);
console.log(results.map((r) => r.status).join(" "));
console.log("still pending:", [...pending.keys()]);
```

Output of `node pending-fixed.js` and of the browser terminal

```ts
fulfilled rejected fulfilled rejected
still pending: []
```

Every failed payment left its entry behind: a leak that grows with the error rate, so it appears exactly when things already go wrong. Moving the `delete` into `finally` ties the entry's life to the call, whichever way it ends. The same rule applies to every "map of work in progress": waiting requests, open connections, locks.

TRY IT YOURSELF

### Fix a listener leak with one signal

This checkout page registers three listeners on a long-lived `cartEvents` target every time it opens, and never removes them. Change `openCheckout` so that one call to `close()` removes all three, using the `signal` option.

checkout-leak.js

```ts
const cartEvents = new EventTarget();
let calls = 0;

function openCheckout() {
  cartEvents.addEventListener("item-added", () => calls++);
  cartEvents.addEventListener("item-removed", () => calls++);
  cartEvents.addEventListener("coupon", () => calls++);
  return { close() {} };
}

for (let i = 0; i < 5; i++) openCheckout().close();
cartEvents.dispatchEvent(new Event("item-added"));
console.log("listeners that ran for closed pages:", calls);
```

Output of `node checkout-leak.js` and of the browser terminal

```ts
listeners that ran for closed pages: 5
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

One `AbortController` per call to `openCheckout`, its `signal` passed as the options object to every `addEventListener` in that call. Aborting it removes all of them together.

HINT 2

`const page = new AbortController(); const { signal } = page; cartEvents.addEventListener("item-added", () => calls++, { signal }); /* … same for the other two … */ return { close: () => page.abort() };`

SOLUTION

checkout-fixed.js

```ts
const cartEvents = new EventTarget();
let calls = 0;

function openCheckout() {
  const page = new AbortController();
  const { signal } = page;
  cartEvents.addEventListener("item-added", () => calls++, { signal });
  cartEvents.addEventListener("item-removed", () => calls++, { signal });
  cartEvents.addEventListener("coupon", () => calls++, { signal });
  return { close: () => page.abort() };
}

for (let i = 0; i < 5; i++) openCheckout().close();
cartEvents.dispatchEvent(new Event("item-added"));
console.log("listeners that ran for closed pages:", calls);

const open = openCheckout();
cartEvents.dispatchEvent(new Event("coupon"));
console.log("an open page still listens:", calls);
open.close();
```

Output of `node checkout-fixed.js` and of the browser terminal

```ts
listeners that ran for closed pages: 0
an open page still listens: 1
```

One controller per page, one `signal` for all its listeners: closing the page is one call, and you never need to keep references to the listener functions.

TRY IT YOURSELF

### Memoize per object without leaking

A `shippingQuote(order)` function is slow and called many times for the same order objects. Memoize it with a `WeakMap` so results live exactly as long as their orders, and show how many times the slow part ran.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`results.has(obj)` tells you whether this exact object was seen before. Compute and store only on the first call for that object; every later call for the same object just reads the stored value.

HINT 2

`function memoizeByObject(fn) { const results = new WeakMap(); return (obj) => { if (!results.has(obj)) results.set(obj, fn(obj)); return results.get(obj); }; }`

SOLUTION

memo-weak.js

```ts
function memoizeByObject(fn) {
  const results = new WeakMap();
  return (obj) => {
    if (!results.has(obj)) results.set(obj, fn(obj));
    return results.get(obj);
  };
}

let slowCalls = 0;
const shippingQuote = memoizeByObject((order) => {
  slowCalls += 1;
  return order.weightKg * 20_000 + (order.city === "Lagos" ? 0 : 150_000);
});

const a = { id: 7, weightKg: 5, city: "Lagos" };
const b = { id: 8, weightKg: 2, city: "Kano" };
console.log(shippingQuote(a), shippingQuote(b), shippingQuote(a), shippingQuote(b));
console.log("slow calls:", slowCalls);
console.log("a copy is a different key:", shippingQuote({ ...a }), "slow calls:", slowCalls);
```

Output of `node memo-weak.js` and of the browser terminal

```ts
100000 190000 100000 190000
slow calls: 2
a copy is a different key: 100000 slow calls: 3
```

The memo is keyed by object identity, so a copy of an order is a new key. That is the right behaviour for per-object caching; if you need caching by *value*, key a bounded `Map` by a string built from the fields that matter.

## Recap

- Variables hold references; objects live on the heap. The garbage collector frees everything not reachable from a root (globals, module variables, the stack, pending timers, listeners, promise handlers). Cycles are collected.
- A leak is an unneeded object that is still reachable: growing collections, listeners never removed, intervals never cleared, closures sharing a context with a big variable, caches without bounds.
- Fix leaks by giving every growing thing an end: the `signal` option or `removeEventListener`, `clearInterval`, LRU limits and TTLs, deletion in `finally`.
- `WeakMap` attaches data to objects without keeping them alive; `WeakRef` and `FinalizationRegistry` are for memory-sensitive caches, never for essential clean-up.
- Find leaks by the trend of `heapUsed` after collection, then locate them with heap snapshots: count objects by type, follow the retainers, compare two snapshots.

Next: [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design), where you decide which errors a program handles, which it passes on, and how to never lose one.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
