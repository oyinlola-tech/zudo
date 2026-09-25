---
title: "The event loop — ZudoJS Academy"
description: "Build an exact model of the call stack, task queue and microtask queue, solve ordering puzzles with it, and keep long jobs from starving timers and requests."
source: https://zudojs.oyinlola.site/learn/js-event-loop
---

LEVEL 4 · LESSON 15 OF 20

Asynchronous JavaScript in depth Core

# The event loop

Build an exact model of the call stack, task queue and microtask queue, solve ordering puzzles with it, and keep long jobs from starving timers and requests.

- **50 min** to read and try
- **You need:** Asynchronous JavaScript, Promises in depth, Combining promises and Scope and how code runs
- **You build:** An order-export job that processes rows in time slices so health checks keep answering, and an event-loop lag monitor

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe the event loop as an algorithm: one task, then every microtask, then the next task
- Sort any callback into the task queue or the microtask queue
- Predict the output of ordering puzzles that mix sync code, await, then, queueMicrotask and timers
- Explain process.nextTick and setImmediate and where they run in Node's loop
- Recognise both kinds of starvation, a long task and an endless microtask chain, and fix them by yielding
- Measure event-loop lag

## The health check that failed during the export

A shop's backend runs on a server that a **load balancer** (the machine that spreads incoming requests over several servers) checks every few seconds: it calls `/health`, and if the server does not answer within 2 seconds, it is marked dead and taken out of service. Every night at midnight, an accountant exports the day's orders to a spreadsheet. And every night at midnight, the server gets marked dead.

The export code is correct. The health check code is correct. What goes wrong is *when* each of them gets to run. Here is the same situation in miniature: a "health check" timer that should run every 10 ms, and an export that crunches 60,000 order rows in one go:

problem.js

```ts
function invoiceTotal(row) {
  let kobo = 0;
  for (let i = 0; i < 2_000; i++) kobo += (row * i) % 97;
  return kobo;
}

let checks = 0;
const health = setInterval(() => checks++, 10);

const start = Date.now();
let total = 0;
for (let row = 0; row < 60_000; row++) total += invoiceTotal(row);
const took = Date.now() - start;

console.log("export finished, took more than 20 ms:", took > 20);
console.log("health checks answered during the export:", checks);

setTimeout(() => {
  console.log("health checks answered 50 ms after the export:", checks > 0);
  clearInterval(health);
}, 50);
```

Output of `node problem.js` and of the browser terminal

```ts
export finished, took more than 20 ms: true
health checks answered during the export: 0
health checks answered 50 ms after the export: true
```

While the export ran, the health check answered *zero* times, even though its timer was due many times over. As soon as the export finished, the checks started again. To fix this for real, you need an exact picture of how JavaScript decides what runs next: the **event loop**. [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async) introduced it, and [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#call-stack) showed the call stack. This lesson puts them together into a model precise enough to predict any ordering, and to fix the export at the end.

## The model: one stack, two queues, one rule

JavaScript runs your code on a single **call stack**: the list of function calls in progress, from [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#call-stack). Only the function on top runs. The language itself has no timers, no network and no files. Those come from the **host**: the program that embeds the JavaScript engine, which is the browser or Node.js. The host keeps the waiting work in queues:

- The **task queue** (also called the **macrotask** queue) holds callbacks for things that happened in the outside world: a timer is due, a file has been read, a request arrived, a user clicked. Each of these callbacks is a **task**. (Hosts really keep several task queues, for timers, I/O and so on, but you can picture one.)
- The **microtask queue** holds small follow-up jobs that JavaScript code itself scheduled: promise reactions (the handlers of `then`, `catch` and `finally`), the rest of an `async` function after an `await`, and callbacks given to `queueMicrotask`. Each is a **microtask**.

The **event loop** is the host's loop that moves work from the queues onto the stack. Its rule fits in four lines:

```ts
loop forever:
  1. take the oldest task from the task queue and run it until the stack is empty
  2. run every microtask in the microtask queue, until it is empty
     (including microtasks added while running these)
  3. (browser only) update the screen if it is time to
  4. if nothing is queued and nothing is pending, wait (or, in Node, exit)
```

The event loop. The first task is your script itself.

Three consequences follow, and between them they explain everything in this lesson:

1. **Run to completion.** Once a task starts, nothing interrupts it. No timer, no click, no request handler can run in the middle of your function. That is why the export blocked the health check: the export was one long task.
2. **Microtasks beat tasks.** After every task, *all* microtasks run before the next task gets a turn. A promise handler always runs before a timer that was queued at the same time.
3. **Microtasks can add microtasks.** Step 2 keeps going until the queue is empty, so a microtask that schedules another microtask runs it in the same round, still before any task.

Here is which queue each common source uses:

| Source | Queue | Where |
| --- | --- | --- |
| Your script (the first run of a file) | task | both |
| `setTimeout`, `setInterval` | task | both |
| I/O callbacks (network, files), events (clicks, `message`) | task | both |
| `setImmediate` | task (its own "check" phase) | Node only |
| `then`/`catch`/`finally` handlers | microtask | both |
| Code after `await` | microtask | both |
| `queueMicrotask(fn)` | microtask | both |
| `process.nextTick(fn)` | its own queue, drained just before the promise microtasks | Node only |

The smallest demonstration: one timer and one microtask, scheduled from the same task:

first.js

```ts
console.log("1. script starts (a task)");

setTimeout(() => console.log("4. timer: the next task"), 0);
queueMicrotask(() => console.log("3. microtask: right after this task"));

console.log("2. script ends");
```

Output of `node first.js` and of the browser terminal

```ts
1. script starts (a task)
2. script ends
3. microtask: right after this task
4. timer: the next task
```

The timer was scheduled first and asked for 0 ms, yet it ran last. A delay of 0 does not mean "now"; it means "as a new task, once the current task and all microtasks are done".

## Ordering puzzles

The only way to get fluent is to trace examples by hand. For each puzzle, cover the output and write down your prediction first.

REASON IT OUT

### How to trace an ordering puzzle

Before reading the first puzzle, decide what you will track. For every line of the code, ask:

- Does this line run now, as part of the current task, or does it only *schedule* something?
- If it schedules something, into which queue: task or microtask?
- When a scheduled callback eventually runs, does it schedule anything itself?
- For an `async` function: which part of its body runs straight away, and which part waits?

**Show the reasoning**

Keep three columns on paper: **output**, **microtask queue** and **task queue**. Walk through the current task line by line: print synchronous logs into the output column; add scheduled callbacks to the end of the right queue. When the task ends, take microtasks from the front one at a time, run each (it may add to either queue), and repeat until the microtask queue is empty. Only then take the first task and start again.

For `async` functions: calling one runs its body *synchronously*, up to the first `await`. The rest of the body is scheduled as a microtask once the awaited value is ready. If the awaited promise is still pending (a timer, a request), the rest waits until that promise settles, which may be many tasks later.

### Puzzle 1: a checkout's log

puzzle-1.js

```ts
async function saveOrder() {
  console.log("B. saveOrder starts");
  await null;
  console.log("D. saveOrder continues after await");
}

console.log("A. checkout starts");
setTimeout(() => console.log("G. send receipt (timer)"), 0);
saveOrder();
Promise.resolve().then(() => console.log("E. update stock (then)"));
console.log("C. checkout returns");
queueMicrotask(() => console.log("F. audit log (queueMicrotask)"));
```

Output of `node puzzle-1.js` and of the browser terminal

```ts
A. checkout starts
B. saveOrder starts
C. checkout returns
D. saveOrder continues after await
E. update stock (then)
F. audit log (queueMicrotask)
G. send receipt (timer)
```

Trace it with the three columns:

1. `A` prints. The timer goes into the task queue.
2. `saveOrder()` runs its body synchronously: `B` prints. `await null` pauses it and puts "continue `saveOrder`" into the microtask queue. Awaiting a value that is not a promise still pauses.
3. The `then` handler joins the microtask queue behind it. `C` prints. The audit log microtask joins the queue third.
4. The task is over; drain the microtasks in the order they were queued: `D`, `E`, `F`.
5. The microtask queue is empty, so the next task runs: `G`.

Microtasks run in the order they were queued (first in, first out), whatever API queued them: an `await`, a `then` and `queueMicrotask` all join the same line.

### Puzzle 2: two chains interleave

puzzle-2.js

```ts
const paid = Promise.resolve();

paid.then(() => console.log("stock 1")).then(() => console.log("stock 2")).then(() => console.log("stock 3"));
paid.then(() => console.log("email 1")).then(() => console.log("email 2"));
```

Output of `node puzzle-2.js` and of the browser terminal

```ts
stock 1
email 1
stock 2
email 2
stock 3
```

You might expect the whole stock chain first. But each `then` only queues its handler when the promise before it settles. At the start, only `stock 1` and `email 1` are queued (both wait on `paid`, which is already fulfilled). Running `stock 1` fulfils its promise and queues `stock 2` *behind* `email 1`. So the chains take turns, one step each.

### Puzzle 3: microtasks scheduled by microtasks

puzzle-3.js

```ts
setTimeout(() => console.log("timer 1"), 0);

queueMicrotask(() => {
  console.log("micro 1");
  queueMicrotask(() => console.log("micro 1 → micro 2"));
  setTimeout(() => console.log("timer 2 (scheduled by micro 1)"), 0);
});

setTimeout(() => {
  console.log("timer 3");
  Promise.resolve().then(() => console.log("timer 3 → micro"));
}, 0);
```

Output of `node puzzle-3.js` and of the browser terminal

```ts
micro 1
micro 1 → micro 2
timer 1
timer 3
timer 3 → micro
timer 2 (scheduled by micro 1)
```

The microtask that `micro 1` scheduled ran in the same drain, before any timer. `timer 2` joined the task queue behind the two timers already in it. And the microtask scheduled inside `timer 3` ran right after `timer 3`, because every task, including a timer callback, is followed by a full microtask drain.

### Puzzle 4: await on a pending promise

puzzle-4.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reserveStock() {
  console.log("reserve: start");
  await wait(20);
  console.log("reserve: done");
}

async function chargeCard() {
  console.log("charge: start");
  await null;
  console.log("charge: done");
}

reserveStock();
chargeCard();
setTimeout(() => console.log("timer at 0 ms"), 0);
console.log("both started");
```

Output of `node puzzle-4.js` and of the browser terminal

```ts
reserve: start
charge: start
both started
charge: done
timer at 0 ms
reserve: done
```

`await null` only waited for the microtask drain, so `charge: done` came before any timer. `await wait(20)` waited for a promise that settles inside a timer task 20 ms later, so the 0 ms timer ran first. An `await` resumes when its promise settles, not after a fixed number of steps.

> TIP
>
> Puzzles 1 to 4 print the same order in Node.js and in the browser, because they only use the language's own queues and plain timers. Do not write real code that depends on the exact number of microtask steps between two chains: it is correct but fragile, and a refactor that adds one `await` changes it. If B must happen after A, make B wait for A.

## queueMicrotask: work "right after this"

`queueMicrotask(fn)` asks for `fn` to run as soon as the current task (and the microtasks already queued) are done, before any timer, I/O or rendering. The classic use is **batching**: collect several changes made in the same task and handle them once.

A shopping cart notifies listeners (the header badge, the analytics tracker, the saved-cart writer) when it changes. A customer's "add the whole wishlist" button adds six items in one task. Notifying six times means six saves. Instead, the cart schedules one notification per task:

batching.js

```ts
function createCart(onChange) {
  const items = [];
  let scheduled = false;
  return {
    add(sku, qty = 1) {
      items.push({ sku, qty });
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          onChange([...items]);
        });
      }
    },
  };
}

const cart = createCart((items) => console.log(`saved cart with ${items.length} lines`));

for (const sku of ["rice-5kg", "oil-1l", "beans-2kg", "sugar-1kg", "salt-500g", "milk-1l"]) cart.add(sku);
console.log("all items added");

setTimeout(() => cart.add("bread"), 0);
```

Output of `node batching.js` and of the browser terminal

```ts
all items added
saved cart with 6 lines
saved cart with 7 lines
```

Six adds in one task produced one save, and it still happened before anything else could run, so no other code saw the cart in a "changed but not saved" state for longer than necessary. The later add in a new task got its own save. User-interface libraries use this same trick to update the screen once per batch of state changes.

When should you use `queueMicrotask` instead of `Promise.resolve().then(fn)`? They land in the same queue. `queueMicrotask` says what you mean, does not create a promise, and if `fn` throws, the error is reported as an ordinary uncaught exception instead of turning into a rejected promise.

## What setTimeout really promises

The delay you pass to `setTimeout` is a **minimum**, not an appointment. When the delay has passed, the callback is queued as a task, and it runs when the loop reaches it: after the current task, after all microtasks, and after any tasks queued before it. Three practical rules:

- Timers with the same delay run in the order they were created.
- A timer that is due cannot interrupt anything. A 10 ms timer behind a 200 ms task runs after at least 200 ms.
- Browsers raise very short delays to at least 4 ms once timers have been nested five levels deep (a timer that sets a timer that sets a timer…), and Node treats 0 as 1 ms. Never rely on exact small delays.

timer-minimum.js

```ts
const start = Date.now();
const ran = [];

setTimeout(() => ran.push(`B (asked for 10 ms) at ${Date.now() - start >= 100 ? "100+ ms" : "under 100 ms"}`), 10);
setTimeout(() => ran.push("A (asked for 0 ms)"), 0);
setTimeout(() => ran.push("C (asked for 10 ms, created after B)"), 10);

while (Date.now() - start < 100) {
  // a 100 ms task: nothing else can run
}

setTimeout(() => console.log(ran), 20);
```

Output of `node timer-minimum.js` and of the browser terminal

```json
[
  'A (asked for 0 ms)',
  'B (asked for 10 ms) at 100+ ms',
  'C (asked for 10 ms, created after B)'
]
```

All three timers were due while the 100 ms loop ran, and none could run until it ended. Then they ran by due time (A first), and B before C because B was created first.

## Node.js: nextTick, setImmediate and the phases

Node's loop has the same shape, with two extra tools and a more detailed task side. libuv (the C library inside Node) runs the loop in **phases**, each with its own queue of tasks:

```ts
   ┌──────────────────────────┐
┌─>│ timers                   │  setTimeout / setInterval callbacks that are due
│  └────────────┬─────────────┘
│  ┌────────────┴─────────────┐
│  │ pending callbacks        │  some deferred system callbacks
│  └────────────┬─────────────┘
│  ┌────────────┴─────────────┐
│  │ poll                     │  I/O: network, files; waits here when idle
│  └────────────┬─────────────┘
│  ┌────────────┴─────────────┐
│  │ check                    │  setImmediate callbacks
│  └────────────┬─────────────┘
│  ┌────────────┴─────────────┐
└──┤ close callbacks          │  e.g. a socket's "close" event
   └──────────────────────────┘

after EVERY callback in every phase:
  1. drain the process.nextTick queue
  2. drain the promise microtask queue
  (repeat both until both are empty)
```

Node.js event loop phases. Microtasks run between callbacks, not only between phases.

So in Node, `process.nextTick` callbacks run before promise microtasks, and `setImmediate` runs in the check phase, after I/O. Inside any callback, including a timer callback, the order is fixed:

node-order.jsNode.js only

```ts
setTimeout(() => {
  console.log("inside a timer callback (the timers phase)");
  setTimeout(() => console.log("5. setTimeout 0: next loop round, timers phase"), 0);
  setImmediate(() => console.log("4. setImmediate: this round, check phase"));
  Promise.resolve().then(() => console.log("3. promise microtask"));
  process.nextTick(() => console.log("2. process.nextTick"));
  console.log("1. sync");
}, 5);
```

Output of `node node-order.js`

```ts
inside a timer callback (the timers phase)
1. sync
2. process.nextTick
3. promise microtask
4. setImmediate: this round, check phase
5. setTimeout 0: next loop round, timers phase
```

`setImmediate` beat `setTimeout(…, 0)` here because the loop was in the timers phase: it goes on to poll and check (running the immediate) before it comes back round to timers. At the very top of a script the order of those two is not fixed: it depends on how long the process took to start, so the 1 ms timer may or may not be due when the loop first reaches the timers phase. Inside a timer or I/O callback it is fixed. [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#event-loop), in the next course, runs both cases.

> NOTE
>
> One exception to "nextTick first": the top-level code of an ES module. Node runs it from its promise-based module loader, so when that code ends, the promise microtasks it queued run first and the `nextTick` queue after them. In a CommonJS file, and inside every callback, `nextTick` comes first.

### Which one to use

- `process.nextTick(fn)`: runs before anything else once the current callback ends. Node's own code uses it so that an API can call your callback asynchronously but "straight away", for example to emit an error event after the caller has had a chance to attach a listener. In application code, `queueMicrotask` is almost always the clearer choice.
- `setImmediate(fn)`: runs after the I/O that is waiting has been handled. It is the Node way to **yield**: to let other work run before you continue.

The difference matters most when something repeats. A function that keeps rescheduling itself with `nextTick` never lets the loop reach I/O or timers; the same function with `setImmediate` lets everything else through on each round:

nexttick-starve.jsNode.js only

```ts
function repeat(schedule, rounds) {
  return new Promise((resolve) => {
    let timerRan = false;
    let roundsBeforeTimer = null;
    setTimeout(() => (timerRan = true), 0);
    let n = 0;
    const step = () => {
      n += 1;
      if (timerRan && roundsBeforeTimer === null) roundsBeforeTimer = n;
      if (n < rounds) schedule(step);
      else resolve(roundsBeforeTimer === null ? "timer waited for all rounds" : "timer ran in between");
    };
    schedule(step);
  });
}

const busyWait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };

console.log("nextTick:   ", await repeat((fn) => process.nextTick(() => { busyWait(1); fn(); }), 20));
console.log("setImmediate:", await repeat((fn) => setImmediate(() => { busyWait(1); fn(); }), 20));
```

Output of `node nexttick-starve.js`

```ts
nextTick:    timer waited for all rounds
setImmediate: timer ran in between
```

## Starving the loop

The event loop only works if every task and microtask is short. When one is not, everything else waits. This is called **starving** the loop, and there are two kinds.

### A long task

The export in the first section was one long synchronous task. Nothing could run during it: not timers, not I/O, not other requests. On a server, one slow request handler makes every other request slow. In a browser, the page freezes: clicks are ignored and nothing repaints.

### An endless chain of microtasks

The second kind is sneakier, because it looks asynchronous. Step 2 of the loop drains the microtask queue *completely*, including new microtasks. Code that keeps queueing microtasks (a loop of `await`s on already-resolved promises, or a recursive `queueMicrotask`) never lets the loop reach step 1 again:

microtask-starve.js

```ts
const start = Date.now();
setTimeout(() => {
  console.log(`the 0 ms timer ran after ${Date.now() - start >= 50 ? "50 ms or more" : "under 50 ms"}`);
}, 0);

async function processOrders() {
  let processed = 0;
  while (Date.now() - start < 50) {
    await null;              // looks like it yields, but only to the microtask queue
    processed += 1;
  }
  console.log("processed", processed > 100 ? "hundreds of orders" : processed, "with await in the loop");
}

processOrders();
```

Output of `node microtask-starve.js` and of the browser terminal

```ts
processed hundreds of orders with await in the loop
the 0 ms timer ran after 50 ms or more
```

Every `await null` gave control back, but only to the microtask queue, and the only thing in it was the rest of the same loop. For the timer, it made no difference whether the loop had `await` in it or not. `await` alone does not make code friendly to other work: only returning to the *task* queue does.

### The fix: yield to the task queue

To let other work run in the middle of a long job, split the job into pieces and schedule each piece as a new task. The simplest portable way is to await a 0 ms timer: `await new Promise((resolve) => setTimeout(resolve, 0))`. In Node, `setImmediate` is the better tool (no 1 ms minimum); some browsers also offer `scheduler.yield()`. Each yield lets queued timers, I/O and requests run before the next piece starts.

## Build: an export that keeps the server alive

Back to the midnight export. The plan is **time slicing**: process rows until about 8 ms have been used, then yield, then continue. A fixed number of rows per piece would also work, but rows differ in cost; a time budget adapts to both fast and slow machines.

export.js

```ts
export const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function exportOrders(rows, processRow, { sliceMs = 8 } = {}) {
  const lines = [];
  let slices = 0;
  let i = 0;
  while (i < rows.length) {
    const sliceStart = Date.now();
    while (i < rows.length && Date.now() - sliceStart < sliceMs) {
      lines.push(processRow(rows[i]));
      i += 1;
    }
    slices += 1;
    if (i < rows.length) await yieldToLoop();
  }
  return { lines, slices };
}
```

To test it fairly, each fake row costs a fixed 2 ms of work, so the result does not depend on how fast the computer is. The test runs the same 40 rows blocking and sliced, with a health check that should fire every 10 ms:

export-test.js

```ts
import { exportOrders } from "./export.js";

const busyWait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const processRow = (order) => {
  busyWait(2);
  return `${order.id},${order.totalKobo / 100}`;
};
const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, totalKobo: (i + 1) * 150_000 }));

async function withHealthChecks(run) {
  let checks = 0;
  const health = setInterval(() => checks++, 10);
  const result = await run();
  clearInterval(health);
  return { result, checks };
}

const blocking = await withHealthChecks(async () => rows.map(processRow));
console.log("blocking: rows", blocking.result.length, "| health checks during the export:", blocking.checks);

const sliced = await withHealthChecks(() => exportOrders(rows, processRow));
console.log("sliced:   rows", sliced.result.lines.length, "| more than one slice:", sliced.result.slices > 1);
console.log("sliced:   health checks kept answering:", sliced.checks >= 3);
console.log("first line:", sliced.result.lines[0], "| last line:", sliced.result.lines.at(-1));
```

Output of `node export-test.js` and of the browser terminal

```ts
blocking: rows 40 | health checks during the export: 0
sliced:   rows 40 | more than one slice: true
sliced:   health checks kept answering: true
first line: 1,1500 | last line: 40,60000
```

Both versions produced the same 40 lines. The blocking version answered no health checks in about 80 ms of work; the sliced one kept answering, because between slices the loop was free to run the interval's task. The export takes very slightly longer in total (each yield costs a little), which is the right trade: the server stays alive.

For work that is *truly* heavy (seconds of computation, not milliseconds), slicing only spreads the pain. Move it off the main thread instead: to a **worker thread** ([Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes)), or to a background job queue.

## Measuring event-loop lag

How do you notice starvation in production before the load balancer does? Measure **event-loop lag** (or delay): how late timers run compared to when they were due. A healthy loop is late by a millisecond or two; a starving one by hundreds. A portable monitor schedules a repeating timer and records how late each tick is:

lag-monitor.js

```ts
function monitorLag(intervalMs = 10) {
  let expected = Date.now() + intervalMs;
  let worst = 0;
  const timer = setInterval(() => {
    worst = Math.max(worst, Date.now() - expected);
    expected = Date.now() + intervalMs;
  }, intervalMs);
  return { stop: () => (clearInterval(timer), worst) };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const busyWait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };

const calm = monitorLag();
await wait(60);
const calmLag = calm.stop();

const busy = monitorLag();
await wait(15);
busyWait(300);
await wait(30);
const busyLag = busy.stop();

console.log("after a 300 ms task, worst lag over 60 ms:", busyLag > 60);
console.log("much worse than the calm loop:", busyLag > calmLag + 30);
```

Output of `node lag-monitor.js` and of the browser terminal

```ts
after a 300 ms task, worst lag over 60 ms: true
much worse than the calm loop: true
```

Node.js has a precise built-in version, `monitorEventLoopDelay` from `node:perf_hooks`, which samples the loop in the background and reports a histogram (in nanoseconds):

lag-node.jsNode.js only

```ts
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

await sleep(20);
const end = Date.now() + 250;
while (Date.now() < end);          // a 250 ms task
await sleep(20);

histogram.disable();
const maxMs = histogram.max / 1e6;
console.log("worst delay was over 100 ms:", maxMs > 100);
console.log("p50 is much lower than the max:", histogram.percentile(50) / 1e6 < maxMs / 2);
```

Output of `node lag-node.js`

```ts
worst delay was over 100 ms: true
p50 is much lower than the max: true
```

Report the lag as a metric (the 99th percentile and the maximum per minute) and alert when it climbs. Observability tools, including [@zudojs/observability](https://zudojs.oyinlola.site/learn/zudo-observability), are where such numbers go.

## Testing time-dependent code

Ordering bugs are hard to test because they depend on timing. Three habits help:

- **Record, then compare.** Push events into an array (`log.push("charged")`) and compare the whole array at the end, as the puzzles did. One assertion catches any change in order.
- **Control time.** Real timers make tests slow and flaky. Test runners offer **fake timers**: in Vitest, `vi.useFakeTimers()` replaces `setTimeout` with a fake clock you move forward yourself with `vi.advanceTimersByTime(ms)`, so a 30-second timeout is tested in a millisecond.
- **Assert properties, not exact timings.** "Finished within 200 ms" or "at least 3 health checks" are stable; "took exactly 101 ms" is not.

## Practice

TRY IT YOURSELF

### Predict a payment flow

Write down the output before running it.

predict-payment.js

```ts
console.log("1");
setTimeout(() => {
  console.log("2");
  Promise.resolve().then(() => console.log("3"));
}, 0);

(async () => {
  console.log("4");
  await Promise.resolve();
  console.log("5");
  setTimeout(() => console.log("6"), 0);
})();

Promise.resolve()
  .then(() => console.log("7"))
  .then(() => console.log("8"));
console.log("9");
```

Output of `node predict-payment.js` and of the browser terminal

```ts
1
4
9
5
7
8
2
3
6
```

**Show a solution**

Synchronous first: `1`, then the async function runs up to its `await`: `4`, then `9`. Microtasks in queue order: the async function's continuation prints `5` (and queues timer 6 behind timer 2), then `7`, whose promise then queues `8`, which runs in the same drain. Tasks: timer 2 prints `2`, its microtask prints `3` before the next task, then timer `6`.

TRY IT YOURSELF

### Batch stock alerts

A warehouse function `reportLow(sku)` is called many times while a delivery is processed. Change it so that all SKUs reported in one task are sent in a single alert, with duplicates removed, using `queueMicrotask`.

**Show a solution**

stock-alerts.js

```ts
const pending = new Set();

function reportLow(sku) {
  if (pending.size === 0) {
    queueMicrotask(() => {
      console.log("ALERT low stock:", [...pending].join(", "));
      pending.clear();
    });
  }
  pending.add(sku);
}

for (const sku of ["oil-1l", "sugar-1kg", "oil-1l", "salt-500g"]) reportLow(sku);
console.log("delivery processed");
setTimeout(() => reportLow("rice-5kg"), 0);
```

Output of `node stock-alerts.js` and of the browser terminal

```ts
delivery processed
ALERT low stock: oil-1l, sugar-1kg, salt-500g
ALERT low stock: rice-5kg
```

The first report in a task schedules the flush; later ones only add to the set. A `Set` removes the duplicate `oil-1l`. The report in the later task starts a new batch.

TRY IT YOURSELF

### Fix the starving loop

This loop sends reminder texts with an `await` in it, but a timer queued before it still cannot run until all 30 are done. Change one line so the timer gets a turn between reminders, and show that it ran before the last reminder.

reminders.js

```ts
const log = [];
const busyWait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const sendText = async (n) => { busyWait(2); log.push(n); };

setTimeout(() => log.push("TIMER"), 0);

for (let n = 1; n <= 30; n++) {
  await sendText(n);
}
setTimeout(() => console.log("timer ran before the last reminder:", log.indexOf("TIMER") < log.indexOf(30)), 0);
```

Output of `node reminders.js` and of the browser terminal

```ts
timer ran before the last reminder: false
```

**Show a solution**

reminders-fixed.js

```ts
const log = [];
const busyWait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const sendText = async (n) => { busyWait(2); log.push(n); };
const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

setTimeout(() => log.push("TIMER"), 0);

for (let n = 1; n <= 30; n++) {
  await sendText(n);
  await yieldToLoop();
}
setTimeout(() => console.log("timer ran before the last reminder:", log.indexOf("TIMER") < log.indexOf(30)), 0);
```

Output of `node reminders-fixed.js` and of the browser terminal

```ts
timer ran before the last reminder: true
```

`sendText` returns an already-fulfilled promise, so `await sendText(n)` only goes through the microtask queue. Awaiting a timer puts the rest of the loop into the task queue, behind the waiting timer.

## Recap

- The loop: run one task to completion, then drain every microtask (including new ones), then (in browsers) render, then the next task.
- Tasks: your script, timers, I/O, events, `setImmediate`. Microtasks: promise handlers, code after `await`, `queueMicrotask`. Node's `nextTick` queue drains just before promise microtasks.
- An `async` function runs synchronously up to its first `await`; the rest is a microtask once the awaited promise settles. Chains take turns, one step each.
- `setTimeout`'s delay is a minimum. A due timer waits for the current task and all microtasks.
- In Node, inside a callback: nextTick, then promises, then `setImmediate` (check phase), then `setTimeout` (next timers phase).
- Starvation comes from long tasks and from endless microtask chains; `await` alone does not yield to timers. Yield with a timer or `setImmediate`, slice long work by time, and move heavy work to workers. Measure event-loop lag in production.

Next: [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency), where you limit how many jobs run at once and stop work nobody needs any more.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
