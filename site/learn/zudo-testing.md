---
title: "Testing a ZudoJS app"
description: "Test the Task API with Vitest and @zudojs/testing. Control time with a test clock, replace services with mocks and recording buses, wire fakes through a test container, clean up in the right order, and run integration tests against a real HTTP server."
source: https://zudojs.oyinlola.site/learn/zudo-testing
---

LESSON 73 OF 84

Testing and observability Core

# Testing a ZudoJS app

Test the Task API with Vitest and @zudojs/testing. Control time with a test clock, replace services with mocks and recording buses, wire fakes through a test container, clean up in the right order, and run integration tests against a real HTTP server.

- **45 min** to read and try
- **You need:** The testing basics lesson, and the Task API with its events, queue and HTTP routes
- **You build:** A Vitest suite for the Task API with unit tests on fake time and fake services, and an integration test over real HTTP

  [Test yourself](#test)

## What @zudojs/testing adds

In [the testing basics lesson](https://zudojs.oyinlola.site/learn/testing-basics) you wrote tests with `describe`, `it` and `expect`, used mocks, and ran them with Vitest. That is all you need for plain functions. A ZudoJS app has more moving parts: a clock, a logger, an event bus, a queue, a container, an HTTP server. `@zudojs/testing` gives you a controllable stand-in, a **test double**, for each of them, plus assertions that compare values by their content. It does not run tests. Vitest still does that. Install both as **development dependencies** (`-D`): your tests need them, your running app does not.

Terminal on your computer

```bash
$ npm install -D vitest @zudojs/testing

added 43 packages, and audited 60 packages in 17s

13 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

The small examples in this lesson are ordinary `.ts` files that print what the helpers recorded; run them with `npx tsx file.ts`. At the end you put everything into a Vitest test file.

## A service that can be tested

Code is easy to test when it gets its dependencies from outside instead of creating them itself. You met that idea, **dependency injection**, in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container). This task service never calls `new Date()`, a real logger or a real mail server. It receives `now`, `logger`, `events` and `mailer`:

task-service.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";
import type { Logger } from "@zudojs/logger";

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly dueAt: Date;
}
export interface TaskDeps {
  readonly now: () => Date;
  readonly logger: Logger;
  readonly events: { publish(input: { type: string; payload: unknown }): Promise<unknown> };
  readonly mailer: { send(to: string, subject: string): Promise<void> };
  readonly maxOpenTasks: number;
}

export function createTaskService(deps: TaskDeps) {
  const tasks: Task[] = [];
  return {
    async create(title: string, dueInDays: number): Promise<Task> {
      if (tasks.length >= deps.maxOpenTasks) {
        throw new ConflictError(`You already have ${deps.maxOpenTasks} open tasks.`);
      }
      const dueAt = new Date(deps.now().getTime() + dueInDays * 86_400_000);
      const task: Task = { id: tasks.length + 1, title, dueAt };
      tasks.push(task);
      deps.logger.info("task created", { taskId: task.id });
      await deps.events.publish({ type: "task.created", payload: { taskId: task.id } });
      return task;
    },
    overdue(): Task[] {
      return tasks.filter((task) => task.dueAt < deps.now());
    },
    async remind(email: string): Promise<number> {
      const late = this.overdue();
      for (const task of late) await deps.mailer.send(email, `Overdue: ${task.title}`);
      return late.length;
    },
  };
}
```

In production you pass `() => new Date()`, a real logger and a real mailer. In a test you pass doubles you control. `events` only needs a `publish` method, not a whole event bus. A small dependency like that is easy to replace.

## Time you control

"Remind me about overdue tasks" depends on the time. A test that waits two real days is useless, and a test that reads the real clock gives different results on different days. `createTestClock(start)` is a clock that only moves when you tell it to:

clock.tsNode.js only

```ts
import { createTestClock } from "@zudojs/testing";

const clock = createTestClock("2026-10-01T09:00:00Z");
console.log(clock.now.toISOString());
clock.advance(90_000);
console.log(clock.now.toISOString());
clock.add({ days: 2, hours: 3 });
console.log(clock.now.toISOString(), clock.timestamp);
```

Output of `npx tsx clock.ts`

```ts
2026-10-01T09:00:00.000Z
2026-10-01T09:01:30.000Z
2026-10-03T12:01:30.000Z 1791028890000
```

`advance(ms)` moves forward by milliseconds, `add` by seconds, minutes, hours or days, and `set(date)` jumps to any time. The code under test gets `() => clock.now`. Watch out: `clock.reset()` jumps to the *real* current time, not back to your start. Call `clock.set(start)` for that.

## Mocks, spy logger and a recording event bus

Now give the service three doubles and look at what they recorded. `createMockFn()` is a fake function that records every call; `mockResolvedValue(v)` makes it return a promise of `v`. `createSpyLogger(name)` is a complete logger that prints nothing and remembers every line in `calls`. `createTestEventBus()` is a real event bus from `@zudojs/events` that also records each event in `published`.

doubles.tsNode.js only

```ts
import { createMockFn, createSpyLogger, createTestClock, createTestEventBus } from "@zudojs/testing";
import { createTaskService } from "./task-service.js";

const clock = createTestClock("2026-10-01T09:00:00Z");
const logger = createSpyLogger("tasks");
const events = createTestEventBus();
const send = createMockFn<[string, string], Promise<void>>();
send.mockResolvedValue(undefined);
const tasks = createTaskService({ now: () => clock.now, logger, events, mailer: { send }, maxOpenTasks: 3 });

await tasks.create("Buy milk", 1);
await tasks.create("File taxes", 7);
clock.add({ days: 2 });
console.log("overdue:", tasks.overdue().map((task) => task.title));
console.log("reminders sent:", await tasks.remind("ada@example.com"));
console.log("mailer calls:", send.calls);
console.log("log lines:", logger.calls.map((call) => `${call.method} ${call.message} ${JSON.stringify(call.metadata)}`));
console.log("events:", events.published.map((recorded) => recorded.event.type));
events.dispose();
```

Output of `npx tsx doubles.ts`

```ts
overdue: [ 'Buy milk' ]
reminders sent: 1
mailer calls: [ [ 'ada@example.com', 'Overdue: Buy milk' ] ]
log lines: [ 'info task created {"taskId":1}', 'info task created {"taskId":2}' ]
events: [ 'task.created', 'task.created' ]
```

Two days later, only "Buy milk" (due after one day) is overdue. One e-mail went out, with the exact address and subject. No time passed, no e-mail was sent, nothing was printed by the logger. Two more doubles: `createStub<T>(overrides)` makes an object whose methods do nothing unless you write them, and `createSpyMethod(object, "name")` records the calls of a real object's method until you call `restore()`.

The recording happens inside the bus itself. Whether your code calls `publish`, `publishEvent` or `emit`, and whether it got the double or its `bus` property, every event lands in `published`. You can pass the double anywhere an `EventBus` is expected. `createTestMessageBus` records every `send` and `dispatch` the same way, and `createTestQueue` every `add`.

## A test container and test config

A real Task API wires its services in a **container**. A test should use the same wiring code, and only swap the outside world. `createTestContainer({ overrides })` gives you a started container with your fakes already registered. `createTestConfigManager(values)` gives you a real `ConfigManager` filled with test values. First, the app's wiring:

wiring.tsNode.js only

```ts
import { createToken, type Container } from "@zudojs/container";
import type { ConfigManager } from "@zudojs/config";
import { createTaskService, type TaskDeps } from "./task-service.js";

export const LOGGER = createToken<TaskDeps["logger"]>("logger");
export const CONFIG = createToken<ConfigManager>("config");
export const EVENTS = createToken<TaskDeps["events"]>("events");
export const MAILER = createToken<TaskDeps["mailer"]>("mailer");
export const CLOCK = createToken<() => Date>("clock");
export const TASKS = createToken<ReturnType<typeof createTaskService>>("tasks");

export function registerTasks(container: Container): void {
  container.registerFactory(TASKS, () => createTaskService({
    now: container.resolve(CLOCK),
    logger: container.resolve(LOGGER),
    events: container.resolve(EVENTS),
    mailer: container.resolve(MAILER),
    maxOpenTasks: container.resolve(CONFIG).get<number>("tasks.maxOpenTasks") ?? 20,
  }));
}
```

The test registers fakes for everything outside, then calls the *real* `registerTasks`. Config says a user may only have one open task:

container.tsNode.js only

```ts
import { assertRejects, createMockFn, createSpyLogger, createTestClock, createTestConfigManager, createTestContainer, createTestEventBus } from "@zudojs/testing";
import { CLOCK, CONFIG, EVENTS, LOGGER, MAILER, TASKS, registerTasks } from "./wiring.js";

const clock = createTestClock("2026-10-01T09:00:00Z");
const config = createTestConfigManager({ "tasks.maxOpenTasks": 1 });
const test = createTestContainer({
  overrides: [
    { token: CLOCK, useValue: () => clock.now },
    { token: CONFIG, useValue: config.manager },
    { token: LOGGER, useValue: createSpyLogger("tasks") },
    { token: EVENTS, useValue: createTestEventBus() },
    { token: MAILER, useValue: { send: createMockFn<[string, string], Promise<void>>() } },
  ],
});
registerTasks(test.container);

const tasks = test.resolve(TASKS);
await tasks.create("Buy milk", 1);
const error = await assertRejects(() => tasks.create("Walk the dog", 1), "open tasks");
console.log(error.name, "-", error.message);
await test.dispose();
await config.dispose();
```

Output of `npx tsx container.ts`

```ts
ConflictError - You already have 1 open tasks.
```

The limit came from the test config, through the real wiring, into the real service. If someone breaks `registerTasks`, for example by reading the wrong config key, this test notices. A test that builds the service by hand would not.

## A test application and cleanup

Tests start things that must be stopped: servers, queues, timers, database connections. If a test forgets one, the next test fails for no clear reason, or Vitest never exits. A **cleanup manager** is a list of "undo" functions. `dispose()` runs them all in **reverse** order, last started, first stopped, and reports every one that failed. `createTestApplication` bundles a container, a logger, a clock and a cleanup manager, with the container and logger cleanups already registered. It is quiet and repeatable by default: the logger is a spy logger that prints nothing (read `app.logger.calls`), and the clock starts at 1 January 2026, 00:00 UTC, on every run. Here the clock starts on a date of your choice:

app-context.tsNode.js only

```ts
import { createQueueName } from "@zudojs/queue";
import { createTestApplication, createTestClock, createTestQueue } from "@zudojs/testing";

const app = createTestApplication({ name: "task-api", clock: createTestClock("2026-10-01T09:00:00Z") });
const reminders = createTestQueue<{ taskId: number }>(createQueueName("reminders"));
app.cleanup.register(async () => {
  await reminders.close();
  console.log("[cleanup] queue closed");
}, "queue");
app.cleanup.register(() => console.log("[cleanup] fake server stopped"), "server");

await reminders.add("remind", { taskId: 1 }, { delay: 60_000 });
console.log(app.name, app.clock.now.toISOString(), "cleanups:", app.cleanup.count);
console.log(reminders.findByName("remind").map((recorded) => recorded.job.data));
await app.dispose();
console.log("disposed:", app.cleanup.disposed);
```

Output of `npx tsx app-context.ts`

```ts
task-api 2026-10-01T09:00:00.000Z cleanups: 4
[ { taskId: 1 } ]
[cleanup] fake server stopped
[cleanup] queue closed
disposed: true
```

The count is 4: the application registered the container and the logger, you added the queue and the server. The server was registered last and stopped first, because a server must stop before the things it uses close. `createTestQueue` recorded the job, with its data, and `findByName` found it.

## Structural assertions

An **assertion** throws when a value is wrong. The assertions in `@zudojs/testing` compare values **structurally**: by content, not by how they print. That matters, because printing hides things:

assertions.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";
import { assertErrorCode, assertRejects, assertResponseBody, createHTTPResponse, deepEqual, findDifference } from "@zudojs/testing";

console.log(deepEqual({ tags: new Set(["home"]), due: new Date(0) }, { due: new Date(0), tags: new Set(["home"]) }));
console.log(JSON.stringify({ tags: new Set(["home"]) }) === JSON.stringify({ tags: new Set(["work"]) }));
console.log(findDifference({ task: { tags: ["home", "urgent"] } }, { task: { tags: ["home", "later"] } }));
const response = createHTTPResponse(201, { id: 1, title: "Buy milk", done: false });
try {
  assertResponseBody(response, { id: 1, title: "Buy milk", done: true });
} catch (error) {
  console.log((error as Error).name, "-", (error as Error).message);
}
const error = await assertRejects(async () => { throw new ConflictError("You already have 3 open tasks."); }, "open tasks");
assertErrorCode(error, "ERR_CONFLICT");
console.log("rejected with", error.name);
```

Output of `npx tsx assertions.ts`

```ts
true
true
{
  path: 'value.task.tags[1]',
  reason: 'expected "later", received "urgent"'
}
Error - Response body mismatch at body.done: expected true, received false.
rejected with ConflictError
```

The second line is the trap: `JSON.stringify` turns every `Set` into `{}`, so two different sets look equal. `deepEqual` compares their members. `findDifference` and every failing assertion name the *path* of the first difference, so you see where it broke. `assertRejects(fn, text)` checks that an async function fails with a message containing `text` and returns the error for more checks; use `assertThrows` for synchronous code.

## Integration tests over real HTTP

A **unit test** checks one piece with fakes around it. An **integration test** checks that the pieces work together: here, the real router, the real JSON parsing, the real error mapping and the real service. Only the clock, the mailer and the bus stay fake. This is the Task API's `POST /tasks` route. The function only builds the router, so a test can decide how to serve it:

http-app.tsNode.js only

```ts
import { isConflictError } from "@zudojs/errors";
import { createResponseContext, createRouter } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";
import type { createTaskService } from "./task-service.js";

export function createTaskRouter(tasks: ReturnType<typeof createTaskService>): HttpRouter {
  const router = createRouter();
  router.post("/tasks", async (ctx) => {
    let body: { title?: unknown };
    try {
      body = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array)) as { title?: unknown };
    } catch {
      return createResponseContext().setStatus(400).json({ error: "The body is not JSON" });
    }
    if (typeof body.title !== "string" || body.title.trim().length < 3) {
      return createResponseContext().setStatus(422).json({ error: "title must have at least 3 characters" });
    }
    try {
      return createResponseContext().setStatus(201).json(await tasks.create(body.title.trim(), 1));
    } catch (error) {
      if (isConflictError(error)) return createResponseContext().setStatus(409).json({ error: error.message });
      throw error;
    }
  });
  return router;
}
```

`createHttpTestClient(target)` sends real HTTP requests to your app. Give it the router, and it starts a real server on a free port the first time you send a request. You build each request in a chain: the method and path, then `.send(body)`, `.set(header, value)` or `.auth(token)`, then what you expect. `.expect(status)`, `.expect(header, pattern)` and `.expectJson(part)` throw when the answer is different. The request is sent when you `await` the chain:

http-client.tsNode.js only

```ts
import { createCleanupManager, createHttpTestClient, createMockFn, createSpyLogger, createTestClock, createTestEventBus } from "@zudojs/testing";
import { createTaskRouter } from "./http-app.js";
import { createTaskService } from "./task-service.js";

const clock = createTestClock("2026-10-01T09:00:00Z");
const tasks = createTaskService({
  now: () => clock.now, logger: createSpyLogger(), events: createTestEventBus(),
  mailer: { send: createMockFn<[string, string], Promise<void>>() }, maxOpenTasks: 2,
});
const cleanup = createCleanupManager();
const client = createHttpTestClient(createTaskRouter(tasks), { cleanup });

const created = await client.post("/tasks").send({ title: "Buy milk" })
  .expect(201)
  .expect("content-type", /json/)
  .expectJson({ id: 1, title: "Buy milk" });
console.log(created.status, created.body);

await client.post("/tasks").send({ title: "x" }).expect(422);
await client.post("/tasks").send({ title: "Walk the dog" }).expect(201);
const full = await client.post("/tasks").send({ title: "Call Ada" }).expect(409);
console.log(full.status, full.body);

try {
  await client.post("/tasks").send("not json").expect(201);
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message.trimEnd());
}
await cleanup.dispose();
console.log("client closed:", client.closed);
```

Output of `npx tsx http-client.ts`

```ts
201 { id: 1, title: 'Buy milk', dueAt: '2026-10-02T09:00:00.000Z' }
409 { error: 'You already have 2 open tasks.' }
AssertionError - Expected status 201, got 400.
  request:  POST /tasks
  response: 400 Bad Request
  body:     {"error":"The body is not JSON"}

400 !== 201
client closed: true
```

- `.expectJson({ id: 1, title: "Buy milk" })` checks only the fields you list. The `dueAt` in the body is allowed.
- The 409 comes from a `ConflictError` thrown deep in the service and mapped to a status by the route. Only an integration test checks that whole chain.
- The last request expected 201 on purpose, to show what a failure looks like: the request, the status and the body, so you see at once what went wrong. `.send("not json")` sent plain text, and the route answered 400.
- `{ cleanup }` registered the client with the cleanup manager, so `dispose()` stopped the server it started. The client also keeps cookies between requests, like a browser, which you will want for sign-in tests.

Every answer is a `TestHTTPResponse`, so the assertions of the next section, such as `assertResponseBodyContains`, accept it too.

## Put it together in Vitest

Now turn the examples into a test suite. Every test gets fresh doubles in `beforeEach`, so no test can see another test's tasks or clock. `afterEach` disposes the cleanup manager, so every server and bus is closed, even when a test fails in the middle:

tasks.test.ts

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isConflictError } from "@zudojs/errors";
import {
  assertEventPublished, assertRejects, createCleanupManager, createHttpTestClient, createMockFn,
  createSpyLogger, createTestClock, createTestEventBus,
} from "@zudojs/testing";
import type { CleanupManager, MockFn, TestClock, TestEventBus } from "@zudojs/testing";
import { createTaskRouter } from "./http-app.js";
import { createTaskService } from "./task-service.js";

let clock: TestClock;
let events: TestEventBus;
let cleanup: CleanupManager;
let send: MockFn<[string, string], Promise<void>>;
let tasks: ReturnType<typeof createTaskService>;

beforeEach(() => {
  clock = createTestClock("2026-10-01T09:00:00Z");
  events = createTestEventBus();
  cleanup = createCleanupManager();
  cleanup.register(() => events.dispose(), "events");
  send = createMockFn<[string, string], Promise<void>>();
  send.mockResolvedValue(undefined);
  tasks = createTaskService({ now: () => clock.now, logger: createSpyLogger(), events, mailer: { send }, maxOpenTasks: 2 });
});
afterEach(() => cleanup.dispose());

describe("task service", () => {
  it("publishes task.created", async () => {
    await tasks.create("Buy milk", 1);
    assertEventPublished(events.published, "task.created");
  });

  it("reminds only about overdue tasks", async () => {
    await tasks.create("Buy milk", 1);
    await tasks.create("File taxes", 7);
    clock.add({ days: 2 });
    expect(await tasks.remind("ada@example.com")).toBe(1);
    expect(send.calls).toEqual([["ada@example.com", "Overdue: Buy milk"]]);
  });

  it("refuses a third open task", async () => {
    await tasks.create("One", 1);
    await tasks.create("Two", 1);
    const error = await assertRejects(() => tasks.create("Three", 1), "open tasks");
    expect(isConflictError(error)).toBe(true);
  });
});

describe("POST /tasks", () => {
  it("answers 201, 422 and 409", async () => {
    const client = createHttpTestClient(createTaskRouter(tasks), { cleanup });
    await client.post("/tasks").send({ title: "Buy milk" }).expect(201).expectJson({ id: 1, title: "Buy milk" });
    await client.post("/tasks").send({ title: "x" }).expect(422);
    await client.post("/tasks").send({ title: "Walk the dog" }).expect(201);
    await client.post("/tasks").send({ title: "Call Ada" }).expect(409);
  });
});
```

Terminal on your computer

```bash
$ npx vitest run --reporter=verbose

 RUN  v5.0.1 ~/task-api

 ✓ tasks.test.ts > task service > publishes task.created 11ms
 ✓ tasks.test.ts > task service > reminds only about overdue tasks 4ms
 ✓ tasks.test.ts > task service > refuses a third open task 2ms
 ✓ tasks.test.ts > POST /tasks > answers 201, 422 and 409 114ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  18:49:37
   Duration  2.13s (import 83%, transform 9%, tests 8%, worker 1%)
```

Two days of fake time and a real HTTP server, in a fraction of a second of test time. Now check that the tests can fail. Change `clock.add({ days: 2 })` to `clock.add({ hours: 12 })` and run again:

Terminal on your computer

```bash
$ npx vitest run
…
 FAIL  tasks.test.ts > task service > reminds only about overdue tasks
AssertionError: expected +0 to be 1 // Object.is equality
…
 ❯ tasks.test.ts:38:51
     37|     clock.add({ hours: 12 });
     38|     expect(await tasks.remind("ada@example.com")).toBe(1);
       |                                                   ^
…
      Tests  1 failed | 3 passed (4)
```

After 12 hours nothing is overdue yet, so no reminder was sent. The clock really drives the result. Change it back.

## Practice

TRY IT YOURSELF

### A mailer that fails

What should `remind` do when the mail server is down? Make the mock fail with `mockRejectedValue`, and check with `assertRejects` that `remind` passes the error on. Print how many times the mailer was called.

**Show a solution**

failing-mailer.tsNode.js only

```ts
import { assertRejects, createMockFn, createSpyLogger, createTestClock, createTestEventBus } from "@zudojs/testing";
import { createTaskService } from "./task-service.js";

const clock = createTestClock("2026-10-01T09:00:00Z");
const send = createMockFn<[string, string], Promise<void>>();
send.mockRejectedValue(new Error("SMTP server unreachable"));
const events = createTestEventBus();
const tasks = createTaskService({ now: () => clock.now, logger: createSpyLogger(), events, mailer: { send }, maxOpenTasks: 3 });
await tasks.create("Buy milk", 1);
clock.add({ days: 2 });
const error = await assertRejects(() => tasks.remind("ada@example.com"), "unreachable");
console.log(error.message, "- mailer calls:", send.callCount);
events.dispose();
```

Output of `npx tsx failing-mailer.ts`

```ts
SMTP server unreachable - mailer calls: 1
```

This test documents today's behaviour: the first failure stops the loop. If you decide later that `remind` should try every task and report the failures, change the test first and watch it fail.

TRY IT YOURSELF

### Messages you did not send

Use `createTestMessageBus`. Send an `email.send` message, then check with `assertMessageDispatched` that it was sent and with `assertMessageNotDispatched` that no `sms.send` was.

**Show a solution**

messages.tsNode.js only

```ts
import { assertMessageDispatched, assertMessageNotDispatched, createTestMessageBus } from "@zudojs/testing";

const messages = createTestMessageBus();
await messages.send({ type: "email.send", payload: { to: "ada@example.com", subject: "Overdue: Buy milk" } });
assertMessageDispatched(messages.dispatched, "email.send");
assertMessageNotDispatched(messages.dispatched, "sms.send");
console.log(messages.findByType("email.send").map((recorded) => recorded.message.payload));
messages.dispose();
```

Output of `npx tsx messages.ts`

```json
[ { to: 'ada@example.com', subject: 'Overdue: Buy milk' } ]
```

"Not sent" checks matter too: a bug that sends an SMS to every user is worse than one that sends nothing.

## Recap

- Pass time, logging, events and mail into your code, so a test can replace each one. `createTestClock` moves time instantly. `createMockFn`, `createSpyLogger`, `createStub` and `createSpyMethod` replace and record.
- The test event bus, message bus and queue are the real thing, and record every event, message and job, however your code sends it.
- `createTestContainer` and `createTestConfigManager` let tests use the app's real wiring with fakes at the edges. A cleanup manager stops everything in reverse order, even after a failure.
- Structural assertions compare content, sets and dates included. `createHttpTestClient` serves your router on a free port and checks real answers with `.expect(…)` chains.

Next, you make the Task API tell you what it is doing in production, with structured logs.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
