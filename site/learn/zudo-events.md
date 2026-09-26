---
title: "Events — ZudoJS Academy"
description: "Decouple Task API features with events: handlers, wildcards, priorities, sequential and parallel dispatch, middleware and handler errors with @zudojs/events."
source: https://zudojs.oyinlola.site/learn/zudo-events
---

LEVEL 14 · LESSON 1 OF 18

Events, messages and CQRS Advanced

# Events

Decouple Task API features with events: handlers, wildcards, priorities, sequential and parallel dispatch, middleware and handler errors with @zudojs/events.

- **40 min** to read and try
- **You need:** The Task API project and the caching lesson
- **You build:** A task service that publishes "task.completed", with email, statistics and cache handlers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decouple features by publishing and subscribing to events with createEventBus
- Define typed, frozen events with defineEvent
- Match many event types with wildcard patterns and control order with priorities
- Choose sequential or parallel dispatch for independent handlers
- Handle a failing or slow handler without breaking the publisher
- Wrap event delivery with middleware for logging and validation

## Why events

When a user marks a task as done, the Task API should do more than update one row. It should also send a "well done" email, update the user's statistics, and clear the cached task list from [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache). The first version of that code usually looks like this:

coupled.ts

```ts
const mailer = { send: (to: string, text: string) => console.log(`email to ${to}: ${text}`) };
const stats = { completed: 0 };
const cache = { clear: (userId: string) => console.log(`cache cleared for ${userId}`) };

function completeTask(userId: string, title: string): void {
  console.log(`saved: "${title}" is done`);
  mailer.send(userId, `Well done on "${title}"!`);
  stats.completed += 1;
  cache.clear(userId);
}

completeTask("ada", "Buy milk");
console.log("completed so far:", stats.completed);
```

Output of `npx tsx coupled.ts` and of the browser terminal

```ts
saved: "Buy milk" is done
email to ada: Well done on "Buy milk"!
cache cleared for ada
completed so far: 1
```

It works, but `completeTask` now knows about emails, statistics and caching. Every new feature that cares about finished tasks means editing this function again. If the mailer throws, the task looks like it failed, even though it was saved. The parts are **coupled**: tied together so that a change in one forces changes in the others.

An **event** is a message that says "this happened", in the past tense: `task.completed`, `user.registered`, `order.paid`. The code that did the work **publishes** the event and moves on. Other code **subscribes** to it with a **handler**, a function that runs whenever the event is published. The publisher does not know who is listening, or whether anyone is.

The object in the middle, which keeps the list of handlers and delivers each event to them, is the **event bus**.

## It is already in your project

You don't need to install anything: the CLI added `@zudojs/events` when it created the Task API, and `src/app.ts` already creates an event bus and hands it to the runtime. Check it:

Terminal on your computer

```bash
$ npm ls @zudojs/events
task-api@0.1.0 ~/task-api
+-- @zudojs/events@1.3.0
`-- @zudojs/runtime@1.3.0
  `-- @zudojs/events@1.3.0 deduped
```

The runtime uses the same package, and npm keeps a single copy ("deduped"). Your terminal may draw the tree with `├──` and `└──` instead. In a new project you would run `npm install @zudojs/events`. The examples on this page run in the browser terminal, and on your computer with `npx tsx src/<file>.ts`.

## Your first event

first.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();

bus.on("task.completed", (event) => {
  console.log("handler got:", event.type, event.payload);
});

const result = await bus.publishEvent({
  type: "task.completed",
  payload: { taskId: 1, userId: "ada", title: "Buy milk" },
});

console.log("handled:", result.handled, "handlers:", result.handlerCount);
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
handler got: task.completed { taskId: 1, userId: 'ada', title: 'Buy milk' }
handled: true handlers: 1
```

- `bus.on(type, handler)` subscribes a handler to an event type.
- `bus.publishEvent({ type, payload })` builds the event and calls every matching handler. The **payload** is the data that describes what happened.
- It returns a promise. When it resolves, every handler has finished, and the result tells you how many ran.

## What an event looks like

Typing `{ type: "task.completed", payload }` by hand in many files invites typos, and the payload is `unknown` to TypeScript. `defineEvent` creates a reusable definition that knows the name and the payload type:

task.events.ts

```ts
import { defineEvent } from "@zudojs/events";

export interface TaskCompleted {
  readonly taskId: number;
  readonly userId: string;
  readonly title: string;
}

export const TaskCompletedEvent = defineEvent<"task.completed", TaskCompleted>("task.completed");
```

define.ts

```ts
import { TaskCompletedEvent } from "./task.events.js";

const event = TaskCompletedEvent.create({ taskId: 1, userId: "ada", title: "Buy milk" });

console.log(event.type);
console.log(event.payload.title);
console.log(event.id.startsWith("event:"), event.timestamp instanceof Date);
console.log(Object.isFrozen(event));
```

Output of `npx tsx define.ts` and of the browser terminal

```ts
task.completed
Buy milk
true true
true
```

Every event gets a unique `id` and a `timestamp`, and it is **frozen**: nobody can change it after it was created. That matters because many handlers see the same event. If one of them could change the payload, the next handler would see different data depending on the order they ran in.

Event names are made of lowercase words joined by dots, `namespace.action`. The bus lower-cases them for you, and rejects names with spaces or other symbols.

## Handlers and subscriptions

`bus.on` returns a **subscription**. Call its `unsubscribe()` to detach the handler again. `bus.once` subscribes a handler that runs only for the first event. The type argument tells TypeScript the shape of `event.payload`:

subscriptions.ts

```ts
import { createEventBus } from "@zudojs/events";
import type { Event } from "@zudojs/events";
import { TaskCompletedEvent } from "./task.events.js";
import type { TaskCompleted } from "./task.events.js";

const bus = createEventBus();

const email = bus.on<Event<TaskCompleted>>("task.completed", (event) => {
  console.log(`email: well done on "${event.payload.title}"`);
});
bus.once("task.completed", () => console.log("badge: your first finished task!"));

await bus.publish(TaskCompletedEvent.create({ taskId: 1, userId: "ada", title: "Buy milk" }));
await bus.publish(TaskCompletedEvent.create({ taskId: 2, userId: "ada", title: "Write report" }));

email.unsubscribe();
console.log("email active:", email.active, "handlers left:", bus.handlerCount);
await bus.publish(TaskCompletedEvent.create({ taskId: 3, userId: "ada", title: "Call the bank" }));
```

Output of `npx tsx subscriptions.ts` and of the browser terminal

```ts
email: well done on "Buy milk"
badge: your first finished task!
email: well done on "Write report"
email active: false handlers left: 0
```

`bus.publish(event)` publishes an event you built with `create`. After the unsubscribe, no handler is left, so the third event reaches nobody. That is not an error: the publisher does not care who listens.

The `<Event<TaskCompleted>>` type argument on `bus.on` is unchecked: nothing connects it to the string `"task.completed"`, so it compiles just as happily if you get the name or the payload type wrong, and the mismatch only shows up at runtime. `@zudojs/events` now ships `createTypedEventBus<TMap>(bus)` for exactly this: wrap the raw bus once with a payload map (`{ "task.completed": TaskCompleted; … }`), and its `on`, `once` and `publish` take the event type from that map, so a wrong name or payload is a compile error instead of a silent runtime mismatch. It adds no runtime behaviour of its own, and `typed.bus` still reaches the raw bus for anything the typed view does not cover. [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events#zudo) builds the same idea by hand, which is still worth reading to see why the gap exists.

> COMMON MISTAKE: SUBSCRIBING PER REQUEST
>
> Subscribe your handlers once, when the app starts. If you call `bus.on` inside a request handler, every request adds another copy, each event runs it more and more times, and memory grows forever. This is called a **listener leak**. The bus warns you when one event type collects more than 100 handlers.

## Wildcards and priorities

A handler can subscribe to a pattern instead of one type:

- `"task.*"` matches every event whose name starts with `task.`: `task.created`, `task.completed`, `task.deleted`. The `*` also crosses dots, so it matches `task.comment.added` too, and it also matches the bare namespace event `task` itself, with no dot at all.
- `"*"` matches every event. That is handy for an audit log.

When several handlers match, they run in **priority** order: higher numbers first, and the default is 0. Handlers with the same priority run in the order they subscribed:

wildcards.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();

bus.on("*", (event) => console.log("audit log:", event.type), { priority: -10 });
bus.on("task.*", (event) => console.log("task activity:", event.type));
bus.on("task.completed", () => console.log("update statistics"), { priority: 10 });

await bus.publishEvent({ type: "task.created", payload: { taskId: 4 } });
console.log("---");
await bus.publishEvent({ type: "task.completed", payload: { taskId: 4 } });
console.log("---");
await bus.publishEvent({ type: "user.registered", payload: { userId: "grace" } });
```

Output of `npx tsx wildcards.ts` and of the browser terminal

```ts
task activity: task.created
audit log: task.created
---
update statistics
task activity: task.completed
audit log: task.completed
---
audit log: user.registered
```

The audit log has priority -10, so it always runs last, after the other handlers did their work. Use priorities sparingly. If handler B only works when A ran first, they are not really independent. Consider doing both in one handler instead.

## Sequential or parallel

By default the bus runs handlers **sequentially**: it waits for one to finish before it starts the next, in priority order. In **parallel** mode it starts all of them at once and waits for all of them. Watch the order of the lines:

dispatch.ts

```ts
import { createEventBus, EventEmitterMode } from "@zudojs/events";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bus = createEventBus();

bus.on("task.completed", async () => {
  console.log("  email starts");
  await wait(40);
  console.log("  email done");
});
bus.on("task.completed", async () => {
  console.log("  stats starts");
  await wait(10);
  console.log("  stats done");
});

console.log("sequential:");
await bus.publishEvent({ type: "task.completed", payload: null });
console.log("parallel:");
await bus.publishEvent({ type: "task.completed", payload: null }, { mode: EventEmitterMode.PARALLEL });
```

Output of `npx tsx dispatch.ts` and of the browser terminal

```ts
sequential:
  email starts
  email done
  stats starts
  stats done
parallel:
  email starts
  stats starts
  stats done
  email done
```

Sequential took about 50 ms (40 + 10), parallel about 40 ms (the slowest handler). Choose like this:

- **Sequential** (the default) when order matters or handlers share something, like one database connection.
- **Parallel** when handlers are independent and slow, such as calls to different outside services.

You can set the mode for the whole bus with `createEventBus({ emitter: { mode } })` or, as here, for one publish.

## When a handler throws

REASON IT OUT

### The mail server is down and the email handler throws. What should happen to the request that completed the task?

The task row was already saved before any handler ran. Should the HTTP request that triggered `complete()` now fail with a 500, since one of its side effects broke? Should the statistics handler, which has not run yet, still get a chance to run? Should the error just disappear so the caller sees a normal success response?

**Show the reasoning**

Failing the request would be wrong: the task really is done, and telling the caller otherwise would make them retry a "completed" task and could duplicate work downstream. Silently swallowing the error is also wrong: nobody finds out the email never went out. The bus's default (`CONTINUE`) is a third option: the request that published the event still succeeds, because the work it was responsible for did happen, but every other handler still gets to run — one broken reaction should not stop unrelated ones — and the failure is recorded in `result.errors` and reported to `onError`, so something in the system (a log, an alert) still knows about it. The stricter `THROW` mode exists for the opposite case: places, such as a test or a setup script, where every handler succeeding is itself part of what "done" means.

By default the bus runs the other handlers anyway and reports the failure in the result:

handler-errors.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus({
  onError: (error, context) => {
    console.log("onError:", context.source, error instanceof Error ? error.message : error);
  },
});

bus.on("task.completed", () => {
  throw new Error("mail server is down");
}, { id: "send-email" });
bus.on("task.completed", () => console.log("statistics updated"), { id: "update-stats" });

const result = await bus.publishEvent({ type: "task.completed", payload: { taskId: 1 } });
console.log("handled:", result.handled, "succeeded:", result.succeeded, "failed:", result.failed);

for (const error of result.errors) {
  const reason = error.cause instanceof Error ? error.cause.message : error.cause;
  console.log(error.handlerId, "->", reason);
}
```

Output of `npx tsx handler-errors.ts` and of the browser terminal

```ts
statistics updated
onError: handler Event handler "send-email" failed while processing "task.completed".
handled: true succeeded: 1 failed: 1
send-email -> mail server is down
```

- The failure did not stop `update-stats`. This is the `CONTINUE` error mode, the bus default.
- Each entry of `result.errors` is an `EventHandlerError` (TypeScript knows this, so you need no `instanceof` check to read it). Its `handlerId` says which handler failed (give your handlers an `id`), and its `cause` is what the handler threw.
- The `onError` hook sees every failure once the handlers have run, even when nobody reads the result. In the Task API, log it there with the logger. An error that is only in an unread result is an error nobody will ever see.

Two more ways a handler can fail:

handler-limits.ts

```ts
import { createEventBus, EventErrorMode, EventHandlerError } from "@zudojs/events";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bus = createEventBus();

bus.on("task.completed", (event) => {
  console.log("payload frozen:", Object.isFrozen(event.payload));
}, { id: "look-only" });
bus.on("task.completed", async (_event, context) => {
  await wait(100);
  if (context.signal.aborted) {
    console.log("slow-report: signal aborted, nothing saved");
    return;
  }
  console.log("slow-report: report saved");
}, { id: "slow-report", timeoutMs: 20 });

const result = await bus.publishEvent({ type: "task.completed", payload: { title: "Buy milk" } });
for (const error of result.errors) {
  const reason = error.cause instanceof Error ? error.cause.message : error.cause;
  console.log(error.handlerId, "->", reason);
}
await wait(150);

try {
  await bus.publishEvent({ type: "task.completed", payload: { title: "B" } }, { errorMode: EventErrorMode.THROW });
} catch (error) {
  if (error instanceof EventHandlerError) console.log("publish rejected:", error.message);
}
```

Output of `npx tsx handler-limits.ts` and of the browser terminal

```ts
payload frozen: true
slow-report -> Event processing exceeded the timeout of 20ms.
slow-report: signal aborted, nothing saved
payload frozen: true
publish rejected: Event handler "slow-report" failed while processing "task.completed".
slow-report: signal aborted, nothing saved
```

- The payload a handler receives is frozen too, not only the event. In a module (every `.ts` file you write is one), `event.payload.title = "x"` throws a `TypeError`, so a handler that tries to change the payload fails. Copy the data if you need to change it. The object you passed to `publish` is not frozen: the bus freezes a copy.
- `timeoutMs` fails a handler that takes too long, so one hanging handler cannot hold up the whole publish. JavaScript cannot stop a running function from the outside, so the bus also **aborts** the `context.signal` the handler received (the second argument). A well-behaved handler checks `context.signal.aborted`, or passes the signal to `fetch`, and stops before it does anything the caller no longer waits for. A handler that ignores the signal keeps running, and its result is thrown away.
- In the `THROW` error mode, the first failing handler rejects the publish, and the handlers after it do not run. Use it when every handler must succeed, for example in a test. The last output line comes from that second publish: its slow handler woke up later, saw its aborted signal, and stopped too.

## Event middleware

You met middleware for HTTP requests in [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware). Event middleware is the same idea: a function that wraps the delivery of every event. It gets a `context` holding the event and a `next` function that runs the rest (other middleware, then the handlers). It is the place for logging, timing and checks that apply to all events:

middleware.ts

```ts
import { createEventBus, EventMiddlewareError, validateEventMiddleware } from "@zudojs/events";

const hasTaskId = (payload: unknown) =>
  typeof payload === "object" && payload !== null && "taskId" in payload;

const bus = createEventBus();

bus.use(validateEventMiddleware((event) => hasTaskId(event.payload), { priority: 100 }));
bus.use(async (context, next) => {
  console.log("->", context.event.type);
  const result = await next();
  console.log("<-", context.event.type);
  return result;
});

bus.on("task.completed", (event) => console.log("   handler:", event.payload));

await bus.publishEvent({ type: "task.completed", payload: { taskId: 1 } });

try {
  await bus.publishEvent({ type: "task.completed", payload: { title: "no id" } });
} catch (error) {
  if (error instanceof EventMiddlewareError) console.log("rejected:", error.message);
}
```

Output of `npx tsx middleware.ts` and of the browser terminal

```ts
-> task.completed
   handler: { taskId: 1 }
<- task.completed
rejected: Event "task.completed" failed middleware validation.
```

- `bus.use(fn)` adds a hand-written middleware. Always `return` the result of `next()`, or the bus cannot see what the handlers did.
- `validateEventMiddleware(check)` is a ready-made middleware that rejects events whose check returns `false`. You add it with `bus.use` too (or the `middleware` option of `createEventBus`). Its priority of 100 makes it the outermost layer, so a bad event never reaches the logging or the handlers.
- A middleware that returns without calling `next()` stops the event: no handler runs, and the result says `shortCircuited: true`.

## Put it together: task.completed in the Task API

The task service now does its own job, saving the task, and then announces it. Each reaction lives in its own handler, registered once at start-up:

task.service.ts

```ts
import type { EventBus } from "@zudojs/events";
import { NotFoundError } from "@zudojs/errors";
import { TaskCompletedEvent } from "./task.events.js";

interface Task {
  readonly id: number;
  readonly userId: string;
  readonly title: string;
  done: boolean;
}

export class TaskService {
  private readonly tasks = new Map<number, Task>([
    [1, { id: 1, userId: "ada", title: "Buy milk", done: false }],
  ]);

  constructor(private readonly bus: EventBus) {}

  async complete(userId: string, id: number): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task || task.userId !== userId) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    task.done = true;
    await this.bus.publish(TaskCompletedEvent.create({ taskId: id, userId, title: task.title }));
    return task;
  }
}
```

task.handlers.ts

```ts
import type { Event, EventBus } from "@zudojs/events";
import type { TaskCompleted } from "./task.events.js";

type Completed = Event<TaskCompleted>;

export function registerTaskHandlers(bus: EventBus, stats: Map<string, number>): void {
  bus.on<Completed>("task.completed", (event) => {
    console.log(`[email] to ${event.payload.userId}: well done on "${event.payload.title}"`);
  }, { id: "task-completed-email" });

  bus.on<Completed>("task.completed", (event) => {
    const { userId } = event.payload;
    stats.set(userId, (stats.get(userId) ?? 0) + 1);
  }, { id: "task-completed-stats" });

  bus.on<Completed>("task.completed", (event) => {
    console.log(`[cache] invalidate tag "tasks" for ${event.payload.userId}`);
  }, { id: "task-completed-cache" });
}
```

main.ts

```ts
import { createEventBus } from "@zudojs/events";
import { registerTaskHandlers } from "./task.handlers.js";
import { TaskService } from "./task.service.js";

const bus = createEventBus({
  onError: (error, context) => console.log("event handler failed:", context.event?.type, error),
});
const stats = new Map<string, number>();
registerTaskHandlers(bus, stats);

const service = new TaskService(bus);
const task = await service.complete("ada", 1);
console.log("response:", task);
console.log("stats:", stats);

try {
  await service.complete("linus", 1);
} catch (error) {
  console.log("linus:", error instanceof Error ? error.message : error);
}
```

Output of `npx tsx main.ts` and of the browser terminal

```json
[email] to ada: well done on "Buy milk"
[cache] invalidate tag "tasks" for ada
response: { id: 1, userId: 'ada', title: 'Buy milk', done: true }
stats: Map(1) { 'ada' => 1 }
linus: Task 1 not found
```

Adding a fourth reaction, say a push notification, is now one new handler. `TaskService` does not change. And notice the ownership check: Linus cannot complete Ada's task, so no event is published for him. Check permissions *before* you publish: once an event is out, every handler trusts it.

In the real Task API, pass the bus that `src/app.ts` already creates, and call `registerTaskHandlers` from your task module when it starts, so the handlers are registered exactly once.

## What events do not give you

This event bus lives in the memory of one process. Keep three limits in mind:

- **Events can be lost.** If the process crashes after the task was saved but before the email handler ran, the email is never sent. Nothing retries it. For work that must happen, put a job on a queue, which [the background jobs lesson](https://zudojs.oyinlola.site/learn/zudo-queue) teaches.
- **Publish after the data is saved.** If you publish inside a database transaction that later rolls back, the handlers have already reacted to something that never happened. Publish after the commit, as you saw in [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions).
- **Other servers do not hear it.** A second copy of the Task API has its own bus. Events between services need a message broker, covered in [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices).

Within those limits, events are the simplest way to keep features apart inside one application. [Event-driven systems](https://zudojs.oyinlola.site/learn/zudo-event-driven) covers the distributed version of these same limits: lost events, outboxes and delivery guarantees across services.

## Practice

TRY IT YOURSELF

### Count all task activity

Subscribe one handler to `task.*` that counts events per type in a `Map`. Publish `task.created` twice and `task.completed` once, then print the map. Unsubscribe the handler and publish once more to show that the count stops.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Inside the handler, read the current count with `counts.get(event.type) ?? 0` before writing a new one back with `counts.set`.

HINT 2

`counts.set(event.type, (counts.get(event.type) ?? 0) + 1);`. Because `counter.unsubscribe()` runs before the fourth publish, that last event never reaches the handler, so the map is unchanged from before.

SOLUTION

count.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();
const counts = new Map<string, number>();

const counter = bus.on("task.*", (event) => {
  counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
});

await bus.publishEvent({ type: "task.created", payload: { taskId: 1 } });
await bus.publishEvent({ type: "task.created", payload: { taskId: 2 } });
await bus.publishEvent({ type: "task.completed", payload: { taskId: 1 } });
console.log(counts);

counter.unsubscribe();
await bus.publishEvent({ type: "task.deleted", payload: { taskId: 2 } });
console.log(counts);
```

Output of `npx tsx count.ts` and of the browser terminal

```ts
Map(2) { 'task.created' => 2, 'task.completed' => 1 }
Map(2) { 'task.created' => 2, 'task.completed' => 1 }
```

TRY IT YOURSELF

### A timing middleware

Write a middleware with `bus.use` that prints how many handlers ran for each event, using the result that `next()` returns. Hint: the result has a `results` array.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`const result = await next();` gives you the publish result. Cast it, `(result as { results: readonly unknown[] }).results.length`, to count how many handlers ran, then log it before returning `result`.

HINT 2

`const result = await next(); const ran = (result as { results: readonly unknown[] }).results.length; console.log(\`${context.event.type}: ${ran} handler(s)\`); return result;`.

SOLUTION

timing.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();

bus.use(async (context, next) => {
  const result = await next();
  const ran = (result as { results: readonly unknown[] }).results.length;
  console.log(`${context.event.type}: ${ran} handler(s)`);
  return result;
});

bus.on("task.completed", () => {});
bus.on("task.*", () => {});

await bus.publishEvent({ type: "task.completed", payload: null });
await bus.publishEvent({ type: "task.created", payload: null });
```

Output of `npx tsx timing.ts` and of the browser terminal

```ts
task.completed: 2 handler(s)
task.created: 1 handler(s)
```

`next()` is typed as `Promise<unknown>`, because a middleware cannot know what the inner layers return. The cast says what you expect. It is safe here because the innermost layer is always the handler dispatch.

TRY IT YOURSELF

### Which mode?

For each case, choose sequential or parallel: (a) three handlers that each call a different outside API and take 300 ms; (b) a handler that writes a row and another that reads that row to build a report.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Re-read [sequential or parallel](#dispatch): one mode is for handlers that do not depend on each other's result; the other is for handlers where one needs to see what an earlier one produced.

HINT 2

For (a), ask whether the three API calls need each other's results. For (b), ask what the reader would see if it ran *before* the writer.

SOLUTION

(a) Parallel: they are independent, so the publish takes about 300 ms instead of 900 ms. (b) Sequential, with the writer at a higher priority: the reader depends on the writer having finished. Better still, make it one handler, because two handlers that depend on each other's order are really one job.

## Recap

- An event says "this happened". The publisher does not know the handlers, so features stay apart.
- `bus.on` subscribes and returns a subscription with `unsubscribe()`. Subscribe once at start-up, never per request.
- `defineEvent` gives typed, frozen events with an id and a timestamp.
- Patterns like `task.*` and `*` match many types. Higher priority runs first.
- Handlers run sequentially by default. Parallel mode runs independent handlers at once.
- A failing handler does not stop the others. Read `result.errors` and always log failures in `onError`.
- Middleware wraps every delivery for logging, timing and validation.
- In-memory events can be lost and stay in one process. Publish after saving, and use a queue for work that must happen.

Events are fire-and-forget: the publisher never learns what a handler produced. Next, [Messaging](https://zudojs.oyinlola.site/learn/zudo-messaging) covers the other half, where the caller needs exactly one answer back.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
