---
title: "Components with @zudojs/lifecycle — ZudoJS Academy"
description: "Start and stop a database, a job queue and an HTTP server in order with @zudojs/lifecycle: retries, timeouts, priorities, optional parts, rollback, shutdown."
source: https://zudojs.oyinlola.site/learn/zudo-lifecycle
---

LEVEL 12 · LESSON 8 OF 19

Core, runtime and lifecycle Core

# Components with @zudojs/lifecycle

Start and stop a database, a job queue and an HTTP server in order with @zudojs/lifecycle: retries, timeouts, priorities, optional parts, rollback, shutdown.

- **55 min** to read and try
- **You need:** "The application runtime and lifecycle"
- **You build:** A shop backend whose database, order queue and HTTP server start in order, retry a slow database, roll back on failure and drain every pending order before shutting down

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe a component's five phases and the manager's state machine
- Order components with dependsOn and priority, and predict which run in parallel
- Choose critical, retry, timeout and shutdownTimeout values and explain what each one really does
- Make hooks cancellable so a timeout actually frees startup
- Coordinate a database, a queue and an HTTP server so shutdown loses no work

## The problem: parts inside a part

Your shop's order service has three moving parts: a database connection pool, a background queue that confirms orders, and an HTTP server that accepts them. You deploy with `docker compose up`, which starts the database container and your app at the same moment. Your app connects in the first second, the database needs three, and the app crashes with `ECONNREFUSED`. Then the platform restarts it, and the same race happens again.

Shutdown has its own trap. The HTTP server has just accepted two orders and put them on the queue. If the database closes before the queue has written them, both orders stay "pending" forever, and the customers have already been told "201 Created".

In [The application runtime and lifecycle](https://zudojs.oyinlola.site/learn/zudo-runtime) you ordered **modules**, the large parts of an application. `@zudojs/lifecycle` applies the same ideas one level down, to **components**: the connection pool, the queue worker, the server inside a module. It adds what those smaller parts need most: retries for slow dependencies, time limits, optional parts, priorities, and a deadline for shutdown.

The package stands alone: it depends only on `@zudojs/errors` and `@zudojs/constants`, not on the core. You can use it inside a module's hooks, in a worker process, or in a script. It is not among the packages `zudojs create` installs, so add it to a project with `npm install @zudojs/lifecycle`. This lesson's examples use a shop rather than the Task API, which has no parts this small yet.

## Components and their five phases

A **component** is any object with a `name` and up to five optional methods, one per **phase**:

| Phase | Method | Typical work |
| --- | --- | --- |
| Startup | `initialize` | Prepare: read settings, create objects, nothing that talks to the network yet |
| `start` | Connect to the database, start the server, start the worker |  |
| `ready` | Confirm it can serve: a health query, warming a cache |  |
| Shutdown | `stop` | Stop taking new work and finish what is running |
| `dispose` | Release everything: close connections, clear timers |  |

This helper builds a component that prints every hook:

shop.ts

```ts
import type { LifecycleComponent } from "@zudojs/lifecycle";

// A component that prints every hook, so you can watch the phases.
export function component(name: string): LifecycleComponent {
  const say = (hook: string) => async () => console.log(`${hook.padEnd(10)} ${name}`);
  return {
    name,
    initialize: say("initialize"),
    start: say("start"),
    ready: say("ready"),
    stop: say("stop"),
    dispose: say("dispose"),
  };
}
```

You **register** components on a **manager**, with options such as `dependsOn`. The HTTP server needs the queue, the queue needs the database:

phases.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";
import { component } from "./shop.js";

const manager = createLifecycleManager({ handleSignals: false });
manager.register(component("http"), { dependsOn: ["queue"] });
manager.register(component("queue"), { dependsOn: ["database"] });
manager.register(component("database"));

console.log("state:", manager.state);
await manager.start();
console.log("state:", manager.state);
await manager.shutdown();
console.log("state:", manager.state);
```

Output of `npx tsx phases.ts`

```ts
state: idle
initialize database
initialize queue
initialize http
start      database
start      queue
start      http
ready      database
ready      queue
ready      http
state: ready
stop       http
stop       queue
stop       database
dispose    http
dispose    queue
dispose    database
state: disposed
```

- The manager runs one phase for every component before the next phase begins: all `initialize`, then all `start`, then all `ready`. So when `http` becomes ready, everything has at least started.
- Within a phase, dependencies go first: database, queue, http. Shutdown runs the same order backwards, `stop` for all, then `dispose` for all.
- `createLifecycleManager({ handleSignals: false })` keeps this example from listening for Ctrl + C. [Signals](#signals) covers the default.
- The manager starts in `idle`, is `ready` after `start()`, and ends in `disposed`. A manager is used once.

## The state machine

A **state machine** is a set of states plus the list of allowed moves between them. Anything else is refused, so the manager can never, say, become `ready` without having started. The lifecycle states and their allowed transitions live in `@zudojs/constants`, and `LifecycleStateMachine` enforces them for one entity:

states.tsNode.js only

```ts
import { LIFECYCLE_VALID_TRANSITIONS, LifecycleState } from "@zudojs/constants";
import { LifecycleStateMachine } from "@zudojs/lifecycle";

for (const [from, to] of Object.entries(LIFECYCLE_VALID_TRANSITIONS)) console.log(from.padEnd(12), "->", to.join(", ") || "(none)");

const machine = new LifecycleStateMachine("database");
machine.transition(LifecycleState.INITIALIZING);
machine.transition(LifecycleState.INITIALIZED);
console.log(machine.state, machine.canTransition(LifecycleState.READY), machine.isRunning);
try {
  machine.transition(LifecycleState.READY);
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx states.ts`

```ts
idle         -> initializing, disposed
initializing -> initialized, failed
initialized  -> starting, stopping, disposed
starting     -> started, failed
started      -> ready, stopping, failed
ready        -> stopping, failed
stopping     -> stopped, failed
stopped      -> disposed
failed       -> stopping, disposed
disposed     -> (none)
initialized false false
LifecycleStateError: Invalid lifecycle state transition from "initialized" to "ready".
```

Read the table as a map. The happy path is `idle → initializing → initialized → starting → started → ready → stopping → stopped → disposed`. `failed` can be reached from any active state and only leads to `stopping` or `disposed`: a failed component is cleaned up, never "un-failed". `disposed` leads nowhere. The manager tracks one such machine for itself and one per component, which is what `manager.state` and `manager.getStatus()` report.

> NOTE
>
> Three packages have a type called `LifecycleState` with different values: `@zudojs/constants` (the one above, starting at `idle`), `@zudojs/core` (starting at `created`, with `running`) and the runtime's states. Import it from `@zudojs/constants` when you work with `@zudojs/lifecycle`.

## Dependencies, parallelism and priority

REASON IT OUT

### Which parts can start together?

Before running the next example, work out the start order yourself. There are four components:

- `database` takes 200 ms to connect;
- `cache` takes 100 ms and depends on nothing;
- `queue` takes 50 ms and depends on `database`;
- `metrics` takes 50 ms, depends on nothing, and has `priority: 100`.

Which components can start at the same time? When does `queue` start? What should a priority mean when there are no dependencies between two components? And how long does the whole start take?

**Show the reasoning**

- Components that do not depend on each other have no reason to wait for each other, so they can start together. Starting them one by one would add their times up for nothing.
- `queue` must wait for `database`, so it starts at 200 ms at the earliest.
- A priority is a way to say "this one first" when dependencies do not decide. In `@zudojs/lifecycle` it is a **barrier**: every component with a higher priority finishes the phase before any lower priority begins. `metrics` (100) runs alone first, then the others (default priority 0).
- So: metrics 0 to 50 ms; database and cache together from 50 ms, cache done at 150, database at 250; queue from 250 to 300 ms. About 300 ms in total, against 400 ms one by one.

parallel.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
const at = () => `at ${Math.round((Date.now() - t0) / 50) * 50}ms:`;

function slow(name: string, ms: number) {
  return {
    name,
    start: async () => {
      console.log(`${at()} start ${name}`);
      await sleep(ms);
      console.log(`${at()} ${name} up`);
    },
  };
}

const manager = createLifecycleManager({ handleSignals: false });
manager.register(slow("database", 200));
manager.register(slow("cache", 100));
manager.register(slow("queue", 50), { dependsOn: ["database"] });
manager.register(slow("metrics", 50), { priority: 100 });
await manager.start();
console.log(`${at()} ready`);
```

Output of `npx tsx parallel.ts`

```ts
at 0ms: start metrics
at 50ms: metrics up
at 50ms: start database
at 50ms: start cache
at 150ms: cache up
at 250ms: database up
at 250ms: start queue
at 300ms: queue up
at 300ms: ready
```

The times are rounded to 50 ms; yours may differ slightly. `database` and `cache` started together, and `queue` waited only for `database`. Priority is useful for parts that everything else should be able to rely on without declaring it, such as metrics or logging, and on shutdown it runs in mirror image: the highest priority stops **last**.

How many components may run a phase at the same time is limited by the `concurrency` option of `createLifecycleManager` (10 by default, `LIFECYCLE_DEFAULT_CONCURRENCY` in `@zudojs/constants`).

Mistakes in the graph are caught before any hook runs: a cycle is a `LifecycleDependencyError` naming the whole loop (`orders -> payments -> orders`), a dependency on an unregistered component fails with `Component "orders" depends on "inventory" which is not registered`, registering the same name twice is refused, and registering after `start()` fails with `Cannot register components after registry is frozen`.

## Optional parts: critical: false

If the mail server is down, the shop should still take orders; confirmation e-mails can wait. A component registered with `critical: false` may fail without failing the whole start:

critical.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false });
manager.events.on("component:failed", (event) =>
  console.log(`failed: ${event.component?.componentId} (${((event.component?.error as Error).cause as Error)?.message})`),
);
manager.register({ name: "database", start: async () => {}, stop: async () => console.log("stop database") });
manager.register(
  {
    name: "mailer",
    start: async () => {
      throw new Error("SMTP server smtp.shop.ng refused the connection");
    },
    stop: async () => console.log("stop mailer"),
  },
  { critical: false },
);

await manager.start();
console.log("state:", manager.state);
for (const [id, status] of manager.getStatus()) {
  console.log(id.padEnd(9), status.state.padEnd(7), status.results.map((r) => `${r.phase}:${r.success ? "ok" : "failed"}`).join(" "));
}
await manager.shutdown();
```

Output of `npx tsx critical.ts`

```ts
failed: mailer (SMTP server smtp.shop.ng refused the connection)
state: ready
database  ready   initialize:ok start:ok ready:ok
mailer    failed  initialize:ok start:failed
stop database
```

- The `component:failed` event reported the mailer, and `start()` still resolved: the manager is `ready`.
- `getStatus()` shows each component's state and the result of every phase it ran. The mailer never reached `ready`.
- On shutdown the manager called only `database`'s `stop`: a component whose `start` threw does not get `stop` called on it, since there is nothing that started for `stop` to undo. A component's `dispose`, if it has one, still runs whenever its `initialize` was invoked, whether or not `start` went on to succeed.

Every component is critical unless you say otherwise. Mark something optional only when the application is genuinely useful without it, and make sure something (a health check, an alert on `component:failed`) tells a human that it is down.

## Retrying a slow dependency

The database race from the start of the lesson is solved with a **retry**: try again after a pause instead of failing at once.

retry.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

// The database container needs a moment after `docker compose up`.
let attempt = 0;
let last = Date.now();
const database = {
  name: "database",
  start: async () => {
    attempt += 1;
    const waited = Date.now() - last;
    last = Date.now();
    console.log(`attempt ${attempt} after ~${Math.round(waited / 100) * 100}ms`);
    if (attempt < 4) throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    console.log("database connected");
  },
};

const manager = createLifecycleManager({ handleSignals: false });
manager.register(database, { retry: { attempts: 5, delay: 100 } });
await manager.start();
console.log("state:", manager.state);
await manager.shutdown();
```

Output of `npx tsx retry.ts`

```ts
attempt 1 after ~0ms
attempt 2 after ~100ms
attempt 3 after ~200ms
attempt 4 after ~400ms
database connected
state: ready
```

The waits double: 100, 200, 400 ms. That is **exponential backoff**, and it is what you get when you set a `delay` and no `backoff`. It gives a struggling service more and more room instead of hammering it. `maxDelay` caps a single wait (10 seconds by default). Two details are easy to get wrong:

retry-fixed.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

async function run(label: string, retry: { attempts: number; delay: number; backoff?: "fixed" | "exponential" }) {
  const gaps: number[] = [];
  let last = Date.now();
  const manager = createLifecycleManager({ handleSignals: false });
  manager.register(
    {
      name: "search",
      start: async () => {
        gaps.push(Math.round((Date.now() - last) / 100) * 100);
        last = Date.now();
        throw new Error("search cluster unreachable");
      },
    },
    { retry },
  );
  try {
    await manager.start();
  } catch (error) {
    console.log(`${label}: ${gaps.length} calls, waits ${gaps.slice(1).join(", ")} ms -> ${(error as Error).name}`);
  }
}

await run("attempts 3, backoff fixed", { attempts: 3, delay: 100, backoff: "fixed" });
await run("attempts 3, no backoff given", { attempts: 3, delay: 100 });
```

Output of `npx tsx retry-fixed.ts`

```ts
attempts 3, backoff fixed: 4 calls, waits 100, 100, 100 ms -> LifecycleStartError
attempts 3, no backoff given: 4 calls, waits 100, 200, 400 ms -> LifecycleStartError
```

- `attempts` counts *retries*, not calls. `attempts: 3` means one first try plus three retries: four calls.
- Backoff is exponential unless you write `backoff: "fixed"`, which the type allows but the documentation does not call the default.

Retry what can succeed later: a connection refused, a timeout, a 503. Do not retry what will fail every time, such as a wrong password or a missing table; that only delays the error message the operator needs.

## Timeouts, and what they really do

A payment provider's API is slow today. You give its component 100 ms with `timeout: 100`:

timeout.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false });
manager.register(
  {
    name: "payments-api",
    // The provider's sandbox answers after 500 ms; we allow 100 ms.
    start: () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
    stop: async () => console.log("stop payments-api"),
  },
  { timeout: 100 },
);

const t0 = Date.now();
try {
  await manager.start();
} catch (error) {
  const chain: string[] = [];
  for (let e: unknown = error; e instanceof Error; e = e.cause) chain.push(e.name);
  console.log(chain.join(" <- "));
  console.log(((error as Error).cause as Error).cause instanceof Error ? (((error as Error).cause as Error).cause as Error).message : "");
  console.log("start() rejected after", Date.now() - t0 < 300 ? "about 100 ms" : "much longer");
}
```

Output of `npx tsx timeout.ts`

```ts
LifecycleStartError <- LifecycleComponentError <- LifecycleTimeoutError
Lifecycle operation timed out for component "payments-api" during start after 100ms.
start() rejected after about 100 ms
```

The error chain is informative: `LifecycleStartError` (the start failed), caused by `LifecycleComponentError` (this component, this phase), caused by `LifecycleTimeoutError` (after 100 ms). The loop `for (let e = error; e instanceof Error; e = e.cause)` walks such a chain.

Look at the last line: `start()` rejects at the timeout, around 100 ms, not 500 ms later when the slow hook would have finished on its own. Each hook gets its own `signal`, aborted when its `timeout` elapses, and the manager detaches from a hook that ignores that signal instead of waiting for it: the rest of the application is not held hostage by one slow dependency. `stop` is not called for `payments-api` here, because its `start` never completed; there is nothing for `stop` to undo. Even a hook whose promise never settles at all no longer hangs `start()` — the timeout still fires and the manager still moves on.

Detaching does not cancel the hook itself: the abandoned `setTimeout` above keeps running for its full 500 ms, doing nothing anyone waits for. Making the work itself cancellable is still worth doing, to free whatever it was holding (a socket, a file) instead of leaking it for those extra 400 ms. Most Node.js network APIs accept an `AbortSignal`, and `AbortSignal.timeout(ms)` creates one that aborts on its own:

cancellable.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

// A stand-in for a network call that honours an AbortSignal, like fetch does.
function connect(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 500);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

const manager = createLifecycleManager({ handleSignals: false });
manager.register({ name: "payments-api", start: () => connect(AbortSignal.timeout(100)) }, { timeout: 150 });

const t0 = Date.now();
try {
  await manager.start();
} catch (error) {
  const original = ((error as Error).cause as Error).cause as Error;
  console.log(original.name, "-", original.message);
  console.log("start() rejected after", Date.now() - t0 < 300 ? "about 100 ms" : "much longer");
}
```

Output of `npx tsx cancellable.ts`

```ts
TimeoutError - The operation was aborted due to timeout
start() rejected after about 100 ms
```

Now the hook gives up after 100 ms, and the manager's `timeout: 150` is only a safety net. Pass the signal to `fetch`, to your database driver's connect call, or to anything else that waits on the network.

## Rollback

When a critical component fails, the manager **rolls back**: it stops the components that started, in reverse order, disposes everything, and rejects `start()`. Here the HTTP server cannot get its port:

rollback.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";
import type { LifecycleManager } from "@zudojs/lifecycle";
import { component } from "./shop.js";

function build(portFree: boolean): LifecycleManager {
  const manager = createLifecycleManager({ handleSignals: false });
  manager.register(component("database"));
  manager.register(component("queue"), { dependsOn: ["database"] });
  manager.register(
    {
      ...component("http"),
      start: async () => {
        console.log("start      http");
        if (!portFree) throw new Error("listen EADDRINUSE: address already in use :::3000");
      },
    },
    { dependsOn: ["queue"] },
  );
  return manager;
}

const first = build(false);
try {
  await first.start();
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
console.log("state:", first.state);
await first.start().catch((error: Error) => console.log("again:", error.name));

console.log("--- a new manager, port free ---");
const second = build(true);
await second.start();
console.log("state:", second.state);
```

Output of `npx tsx rollback.ts`

```ts
initialize database
initialize queue
initialize http
start      database
start      queue
start      http
stop       queue
stop       database
dispose    http
dispose    queue
dispose    database
LifecycleStartError: Failed to start component "http".
state: disposed
again: LifecycleStartError
--- a new manager, port free ---
initialize database
initialize queue
initialize http
start      database
start      queue
start      http
ready      database
ready      queue
ready      http
state: ready
```

- After the failure the queue and the database were stopped and disposed in reverse order. No connection is left open. `http` itself is not stopped: its `start` threw, so it never has anything for `stop` to undo, but it is still `disposed`, because its `initialize` did run.
- The manager is `disposed`. Calling `start()` again returns the same failure: `start()` is **idempotent**, it hands back the same promise every time. To try again, build a new manager, as the second half does. A small function that creates and registers everything makes that easy.

## Shutdown: failures and the deadline

Shutdown must finish even when a part misbehaves. Two kinds of misbehaviour:

**A stop hook that throws.** The manager records it and carries on, so one broken part cannot keep the others open:

stop-failure.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false });
manager.events.on("component:failed", (event) => console.log("event: failed", event.component?.componentId));
manager.register({ name: "search", stop: async () => { throw new Error("could not flush the search index"); } });
manager.register({ name: "database", stop: async () => console.log("database: pool closed") });

await manager.start();
await manager.shutdown();
console.log("shutdown resolved, state", manager.state);
for (const [id, status] of manager.getStatus()) {
  console.log(id.padEnd(8), status.results.filter((r) => r.phase === "stop").map((r) => `stop ${r.success ? "ok" : "failed"}`).join(""));
}
```

Output of `npx tsx stop-failure.ts`

```ts
database: pool closed
event: failed search
shutdown resolved, state disposed
search   stop failed
database stop ok
```

`shutdown()` resolved normally. The failure is visible only through the `component:failed` event and the phase results, so listen to one of them and log it.

**A stop hook that takes too long.** A hosting platform gives your process a fixed time between `SIGTERM` and a hard kill (Kubernetes waits 30 seconds by default). `shutdownTimeout` is the manager's own deadline for the whole shutdown (30 seconds by default). When it expires, the manager aborts the `signal` in the context passed to each hook:

deadline.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false, shutdownTimeout: 200 });
manager.register({
  name: "worker",
  // Finishing the current batch would take 5 seconds.
  stop: (context) =>
    new Promise<void>((resolve) => {
      const batch = setTimeout(() => {
        console.log("worker: batch finished");
        resolve();
      }, 5000);
      context.signal.addEventListener("abort", () => {
        clearTimeout(batch);
        console.log("worker: giving up,", (context.signal.reason as Error).message);
        resolve();
      });
    }),
});

await manager.start();
const t0 = Date.now();
await manager.shutdown();
console.log(`shutdown returned after about ${Math.round((Date.now() - t0) / 100) * 100} ms, state ${manager.state}`);
```

Output of `npx tsx deadline.ts`

```ts
worker: giving up, Lifecycle operation timed out for component "application" during stop after 200ms.
shutdown returned after about 200 ms, state disposed
```

The worker listened to `context.signal` and gave up its batch cleanly when the deadline passed. A shutdown deadline is no longer silent: the component is marked `failed` with a `LifecycleTimeoutError` result, a `component:failed` event fires for it, one `application:shutdown-timeout` event fires for the whole run, and `manager.shutdownTimedOut` reads `true`. A hook that ignores the signal is still abandoned rather than waited for, so `shutdown()` returns at the deadline either way, but now you have an event and a flag to alert on instead of only a suspiciously round duration. Set `shutdownTimeout` a few seconds below your platform's grace period, so your own clean-up runs before the hard kill.

## SIGINT and SIGTERM

By default (`handleSignals: true`), `start()` installs handlers for `SIGINT` and `SIGTERM` (`DEFAULT_SHUTDOWN_SIGNALS`; pass `signals` to change the list) that run `shutdown()`, and removes them once shutdown finishes. A second signal during shutdown exits the process at once with code 1, in case shutdown is stuck:

signals.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

let server: NodeJS.Timeout | undefined;
const manager = createLifecycleManager(); // handleSignals defaults to true
manager.register({ name: "database", start: async () => console.log("database connected"), dispose: async () => console.log("database closed") });
manager.register(
  {
    name: "http",
    start: async () => {
      server = setInterval(() => {}, 1000); // stands in for an open server socket
      console.log("http listening");
    },
    stop: async () => {
      clearInterval(server);
      console.log("http stopped accepting requests");
    },
  },
  { dependsOn: ["database"] },
);
manager.events.on("application:stopping", () => console.log("shutdown begins, state:", manager.state));
process.on("exit", (code) => console.log(`exit code ${code}, state: ${manager.state}`));

await manager.start();
process.kill(process.pid, "SIGTERM");
```

Output of `npx tsx signals.ts`

```ts
database connected
http listening
shutdown begins, state: stopping
http stopped accepting requests
database closed
exit code 0, state: disposed
```

The manager never calls `process.exit()` after a normal shutdown. The process ended with code 0 because nothing was left open once `http` cleared its interval. If your process does not exit after "database closed", something still holds the event loop: an open socket, a timer, a database pool you forgot to close.

Only one part of a process should own the signals. If a `@zudojs/runtime` runtime or your own `server.ts` already handles them, create the manager with `handleSignals: false` and call `shutdown()` from there.

## Watching it happen: events

`manager.events` emits typed events for the application and each component, with durations on completion events. They are the hook for logs, metrics and alerts:

events.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";
import type { LifecycleEventType } from "@zudojs/lifecycle";

const manager = createLifecycleManager({ handleSignals: false });
const types: LifecycleEventType[] = ["component:started", "component:ready", "application:ready"];
for (const type of types) {
  manager.events.on(type, (event) => {
    const who = event.component?.componentId ?? "app";
    const took = event.component?.duration ?? event.duration;
    console.log(type.padEnd(22), who.padEnd(9), took === undefined ? "" : `${Math.round(took / 50) * 50}ms`);
  });
}
manager.register({ name: "database", start: () => new Promise((resolve) => setTimeout(resolve, 100)) });
manager.register({ name: "cache", start: async () => {} }, { dependsOn: ["database"] });
await manager.start();
```

Output of `npx tsx events.ts`

```ts
component:started      database  100ms
component:started      cache     0ms
component:ready        database  0ms
component:ready        cache     0ms
application:ready      app       100ms
```

A slow start is now measurable per component: the database took 100 ms of the total. Each phase has its own pair of events: `start` emits `component:starting` then `component:started`; `ready` emits `component:readying` then `component:ready`; `stop` emits `component:stopping` then `component:stopped`; `dispose` emits `component:disposing` then `component:disposed`, each with an `application:…` counterpart. Earlier versions reused `starting`/`started` for the ready phase and `stopping`/`stopped` for dispose, so a listener that counted "starting" events to detect a start actually saw one for `ready` too; with a name per phase, filtering on the exact event you care about (`component:started`, `component:ready`, `component:failed`, `application:ready`, `application:stopped`) now needs no extra check to tell the phases apart.

## Put it together: database, queue, HTTP server

Now the order service from the start of the lesson, with a real HTTP server from `node:http`. The database is a `Map` with an "open" flag, standing in for a connection pool. The queue collects pending orders and confirms them; when it stops, it lets the job in progress finish (50 ms) and then confirms everything still waiting. The server accepts `POST` requests and queues each new order:

task-shop.tsNode.js only

```ts
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLifecycleManager } from "@zudojs/lifecycle";

// database: a pool of connections (a Map stands in for PostgreSQL)
const orders = new Map<string, { id: string; totalKobo: number; status: string }>();
let poolOpen = false;
const database = {
  name: "database",
  start: async () => { poolOpen = true; console.log("database: pool open"); },
  stop: async () => { poolOpen = false; console.log("database: pool closed"); },
};

// queue: a worker that confirms pending orders in the background
const pending: string[] = [];
let worker: NodeJS.Timeout | undefined;
function drain() {
  for (const id of pending.splice(0)) {
    if (!poolOpen) throw new Error("database is closed");
    orders.get(id)!.status = "confirmed";
    console.log(`queue: confirmed ${id}`);
  }
}
const queue = {
  name: "queue",
  start: async () => { worker = setInterval(drain, 5_000); console.log("queue: worker running"); },
  stop: async () => {
    clearInterval(worker);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the job in progress finish
    drain();
    console.log("queue: drained and stopped");
  },
};

// http: accepts orders and puts them on the queue
let server: Server | undefined;
const http = {
  name: "http",
  start: () =>
    new Promise<void>((resolve) => {
      server = createServer((request, response) => {
        const id = `ord_${orders.size + 1}`;
        orders.set(id, { id, totalKobo: 250_000, status: "pending" });
        pending.push(id);
        response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }));
      });
      server.listen(0, "127.0.0.1", () => { console.log("http: listening"); resolve(); });
    }),
  stop: () =>
    new Promise<void>((resolve) => {
      server?.close(() => { console.log("http: closed"); resolve(); });
      server?.closeAllConnections();
    }),
};

const manager = createLifecycleManager({ handleSignals: false, shutdownTimeout: 10_000 });
manager.register(database, { retry: { attempts: 3, delay: 100 }, timeout: 5_000 });
manager.register(queue, { dependsOn: ["database"] });
manager.register(http, { dependsOn: ["queue"] });

await manager.start();
const { port } = server!.address() as AddressInfo;
for (let i = 0; i < 2; i++) {
  const response = await fetch(`http://127.0.0.1:${port}/orders`, { method: "POST" });
  console.log("client: got", response.status, await response.json());
}
await manager.shutdown();
console.log("orders:", [...orders.values()].map((o) => `${o.id}=${o.status}`).join(", "));
```

Output of `npx tsx task-shop.ts`

```ts
database: pool open
queue: worker running
http: listening
client: got 201 { id: 'ord_1' }
client: got 201 { id: 'ord_2' }
http: closed
queue: confirmed ord_1
queue: confirmed ord_2
queue: drained and stopped
database: pool closed
orders: ord_1=confirmed, ord_2=confirmed
```

Follow the shutdown: the server closed first, so no new order could arrive; the queue confirmed both pending orders; only then did the database close. Both customers who got a 201 have a confirmed order.

`listen(0, …)` asks the operating system for any free port, which keeps examples and tests from clashing, and `closeAllConnections()` closes idle keep-alive connections so `close()` does not wait for them.

The dependencies do the real work here. Watch what happens when `dependsOn: ["database"]` is forgotten on the queue:

task-shop-broken.tsNode.js only

```ts
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLifecycleManager } from "@zudojs/lifecycle";

// database: a pool of connections (a Map stands in for PostgreSQL)
const orders = new Map<string, { id: string; totalKobo: number; status: string }>();
let poolOpen = false;
const database = {
  name: "database",
  start: async () => { poolOpen = true; console.log("database: pool open"); },
  stop: async () => { poolOpen = false; console.log("database: pool closed"); },
};

// queue: a worker that confirms pending orders in the background
const pending: string[] = [];
let worker: NodeJS.Timeout | undefined;
function drain() {
  for (const id of pending.splice(0)) {
    if (!poolOpen) throw new Error("database is closed");
    orders.get(id)!.status = "confirmed";
    console.log(`queue: confirmed ${id}`);
  }
}
const queue = {
  name: "queue",
  start: async () => { worker = setInterval(drain, 5_000); console.log("queue: worker running"); },
  stop: async () => {
    clearInterval(worker);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the job in progress finish
    drain();
    console.log("queue: drained and stopped");
  },
};

// http: accepts orders and puts them on the queue
let server: Server | undefined;
const http = {
  name: "http",
  start: () =>
    new Promise<void>((resolve) => {
      server = createServer((request, response) => {
        const id = `ord_${orders.size + 1}`;
        orders.set(id, { id, totalKobo: 250_000, status: "pending" });
        pending.push(id);
        response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }));
      });
      server.listen(0, "127.0.0.1", () => { console.log("http: listening"); resolve(); });
    }),
  stop: () =>
    new Promise<void>((resolve) => {
      server?.close(() => { console.log("http: closed"); resolve(); });
      server?.closeAllConnections();
    }),
};

const manager = createLifecycleManager({ handleSignals: false, shutdownTimeout: 10_000 });
manager.events.on("component:failed", (event) => console.log("failed:", event.component?.componentId, "-", ((event.component?.error as Error).cause as Error).message));
manager.register(database, { retry: { attempts: 3, delay: 100 }, timeout: 5_000 });
manager.register(queue); // dependsOn: ["database"] forgotten
manager.register(http, { dependsOn: ["queue"] });

await manager.start();
const { port } = server!.address() as AddressInfo;
for (let i = 0; i < 2; i++) {
  const response = await fetch(`http://127.0.0.1:${port}/orders`, { method: "POST" });
  console.log("client: got", response.status, await response.json());
}
await manager.shutdown();
console.log("orders:", [...orders.values()].map((o) => `${o.id}=${o.status}`).join(", "));
```

Output of `npx tsx task-shop-broken.ts`

```ts
database: pool open
queue: worker running
http: listening
client: got 201 { id: 'ord_1' }
client: got 201 { id: 'ord_2' }
http: closed
database: pool closed
failed: queue - database is closed
orders: ord_1=pending, ord_2=pending
```

Without the dependency, the queue and the database stopped in the same stage, at the same time. The database closed while the queue was still finishing its job, the drain failed, and both orders stayed `pending`, although their customers were told "201 Created". Nothing crashed and `shutdown()` resolved: only the `component:failed` event showed it. Startup order is easy to test because failures are loud; shutdown order fails quietly, so test it on purpose.

## Production checklist

- **Declare every dependency**, including the ones that only matter on shutdown.
- **Retry only transient failures**, with a delay and exponential backoff, and cap the total with `attempts` and `maxDelay` so a broken configuration still fails within a minute.
- **Make hooks cancellable** with `AbortSignal.timeout` for connects and `context.signal` for shutdown work; treat `timeout` as a safety net.
- **Keep `shutdownTimeout` below the platform's grace period**, and log `component:failed` so a failed or abandoned stop is visible.
- **Mark optional parts `critical: false`** and alert when they fail, so "the shop works but sends no e-mails" is noticed.
- **One owner for signals** per process.
- **Build a new manager to retry a whole start**; a manager is single-use.

## Practice

TRY IT YOURSELF

### Fix the lost orders

In `task-shop-broken.ts`, the database closes during the queue's drain. Give two different fixes, and say which one you prefer.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

One fix changes what the queue declares about the database; the other changes which phase the database's own closing happens in.

HINT 2

Re-read the rule at the top of this lesson: which phase only begins after every component has stopped, whatever the dependencies say?

SOLUTION

- Declare the dependency again: `manager.register(queue, { dependsOn: ["database"] })`. The queue then stops in an earlier stage than the database, as in `task-shop.ts`.
- Or move the database's closing from `stop` to `dispose`. The `dispose` phase only begins after every component has stopped, so the drain always sees an open database, whatever the dependencies say.

Prefer the first, and keep the second as a habit: the dependency documents the real relationship between the two parts, and closing connections in `dispose` gives a second line of defence.

TRY IT YOURSELF

### A capped retry

A search cluster may take up to a few seconds to come up after a deploy. Register a `search` component that fails its first four starts, with at most four retries, a first wait of 50 ms and exponential backoff capped at 150 ms. Print the planned waits, and check that the real ones were at least that long.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`waits.map((_, i) => Math.min(retry.delay * 2 ** i, retry.maxDelay))`: one planned value per real wait, doubling each time, capped at `maxDelay`.

HINT 2

`const planned = waits.map((_, i) => Math.min(retry.delay * 2 ** i, retry.maxDelay));`.

SOLUTION

capped.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";

const retry = { attempts: 4, delay: 50, maxDelay: 150, backoff: "exponential" } as const;
let calls = 0;
let last = 0;
const waits: number[] = [];
const manager = createLifecycleManager({ handleSignals: false });
manager.register(
  {
    name: "search",
    start: async () => {
      calls += 1;
      if (calls > 1) waits.push(Date.now() - last);
      last = Date.now();
      if (calls <= 4) throw new Error("search cluster warming up");
    },
  },
  { retry },
);
await manager.start();

// Exponential backoff: delay, 2 x delay, 4 x delay, ..., each wait capped at maxDelay.
const planned = waits.map((_, i) => Math.min(retry.delay * 2 ** i, retry.maxDelay));
console.log(`${calls} calls, state ${manager.state}`);
console.log("planned waits:", planned.join(", "), "ms");
console.log("every real wait at least that long:", waits.every((wait, i) => wait >= planned[i]! - 2));
```

Output of `npx tsx capped.ts`

```ts
5 calls, state ready
planned waits: 50, 100, 150, 150 ms
every real wait at least that long: true
```

The doubling (50, 100, 200, …) is capped at 150, so a long outage costs a steady 150 ms per try instead of growing without limit. With the fifth call succeeding, all four retries were needed. The check compares with "at least" on purpose: a timer never fires early, but on a busy machine it can fire late, so exact waits would make a flaky test.

TRY IT YOURSELF

### Give the queue a deadline

Change the queue's `stop` in `task-shop.ts` so that it finishes early when `context.signal` aborts, and create the manager with `shutdownTimeout: 20`. What happens to the pending orders, and what should the queue do with them in a real system?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Compare the deadline with how long the queue's own drain normally takes; which one wins the race?

HINT 2

"Finish early" is not the same as "finish safely". Where would work that was only ever held in a process's memory need to live for a restart not to lose it?

SOLUTION

With a 20 ms deadline and a 50 ms wait, the signal aborts before the job in progress finishes. The queue returns early without draining, the database closes, and the orders stay `pending`. In a real system the queue must not keep pending work only in memory: it writes jobs to durable storage (a database table, Redis, a message broker) when they are accepted, so a worker can pick them up after the restart. The [queue lesson](https://zudojs.oyinlola.site/learn/zudo-queue) covers `@zudojs/queue`, including why its published in-memory queue does not survive a restart either. A deadline decides how long you wait; durability decides what you lose when the wait is not enough.

## Recap

- `@zudojs/lifecycle` manages components: objects with `initialize`, `start`, `ready`, `stop` and `dispose`. Each phase runs for all components before the next begins; shutdown reverses the order.
- The manager and each component follow the state machine from `@zudojs/constants`; a manager goes from `idle` to `ready` to `disposed` and is used once.
- `dependsOn` orders components; independent ones run in parallel; `priority` is a barrier (higher first, stopped last).
- `critical: false` lets a part fail without failing the start. `retry.attempts` counts retries; backoff is exponential by default.
- A component `timeout` marks it failed and lets `start()` move on at once, detaching from a hook that ignores its `signal` rather than waiting for it to settle: make hooks cancellable with `AbortSignal.timeout` so the abandoned work actually stops.
- A critical failure rolls back and disposes the manager. Stop failures are recorded and shutdown continues; `shutdownTimeout` aborts `context.signal` and abandons hooks that ignore it.
- Signals are handled by default; one owner per process.

Next, [Types and constants: guards, ids and time](https://zudojs.oyinlola.site/learn/zudo-types-constants) looks at the two small packages every other ZudoJS package builds on, including the constants this lesson's state machine came from, and at clocks and random numbers you can control in tests.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
