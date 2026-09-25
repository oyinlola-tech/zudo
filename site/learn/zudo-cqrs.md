---
title: "Commands and queries (CQRS) — ZudoJS Academy"
description: "Split the Task API into commands that change data and queries that only read it: buses, handlers, middleware, execution context, results with @zudojs/cqrs."
source: https://zudojs.oyinlola.site/learn/zudo-cqrs
---

LEVEL 14 · LESSON 3 OF 18

Events, messages and CQRS Advanced

# Commands and queries (CQRS)

Split the Task API into commands that change data and queries that only read it: buses, handlers, middleware, execution context, results with @zudojs/cqrs.

- **40 min** to read and try
- **You need:** The events and messaging lessons
- **You build:** The Task API's task operations as commands and queries, with the user taken from a trusted context

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Split an operation into a command that changes data or a query that only reads it
- Register exactly one handler per command or query type, as a function or a class
- Carry who is asking in an execution context instead of trusting the request body
- Wrap every command and query with audit, timing and error middleware
- Choose a CommandResult over a thrown error when a caller needs to inspect a failure
- Decide when CQRS is worth the extra bus and when a plain service class is simpler

## One rule: change or read, never both

**CQRS** stands for Command Query Responsibility Segregation. The name is long; the rule is short. Every operation in your application is one of two kinds:

- A **command** asks for a change: "create a task", "complete task 7". It may change data, and it usually returns little: an id, or nothing.
- A **query** asks for data: "list my open tasks". It must *not* change anything. You can run it twice, or a hundred times, and nothing in the world is different afterwards.

Why keep them apart? Because the two sides have different needs. A command must check permissions, validate input, run in a transaction and publish events. A query must be fast, and is shaped for one screen, often served from the cache you built in [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache). Mixing both in one method makes both harder. And when a query can never change anything, you can cache it, retry it and run it anywhere without fear.

In code, a command and a query are plain objects with a `type` string. A **handler** is the function that does the work for one type. A **bus** is the router between them: `bus.execute(command)` finds the handler by the type and runs it. This is the messaging idea from [the previous lesson](https://zudojs.oyinlola.site/learn/zudo-messaging), specialised: each type has exactly one handler, and the result comes straight back.

## Install @zudojs/cqrs

Terminal on your computer

```bash
$ npm install @zudojs/cqrs

added 1 package, and audited 76 packages in 2s
…
```

It builds on `@zudojs/events`, which your project already has. Every example runs in the browser terminal, and on your computer with `npx tsx src/<file>.ts`.

## Your first command and query

`CommandOf` and `QueryOf` describe the shape: a `type` plus the data. The type arguments on `register` and `execute` tell TypeScript what goes in and what comes back:

first.ts

```ts
import { createCommandBus, createQueryBus } from "@zudojs/cqrs";
import type { CommandOf, QueryOf } from "@zudojs/cqrs";

interface Task {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
}

type CreateTask = CommandOf<"CreateTask", { title: string }>;
type ListTasks = QueryOf<"ListTasks">;

const tasks: Task[] = [];
const commands = createCommandBus();
const queries = createQueryBus();

commands.register<CreateTask, { id: number }>("CreateTask", (command) => {
  const task: Task = { id: tasks.length + 1, title: command.title, done: false };
  tasks.push(task);
  return { id: task.id };
});

queries.register<ListTasks, readonly Task[]>("ListTasks", () => tasks);

const created = await commands.execute<CreateTask, { id: number }>({ type: "CreateTask", title: "Buy milk" });
console.log("created:", created);

const list = await queries.execute<ListTasks, readonly Task[]>({ type: "ListTasks" });
console.log("list:", list);
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
created: { id: 1 }
list: [ { id: 1, title: 'Buy milk', done: false } ]
```

The code that calls `execute` never touches the `tasks` array. Only the handlers do. The command returned just the new id. If the caller wants the whole task, it asks with a query.

Commands are named as orders, in the imperative: `CreateTask`, `CompleteTask`. Compare the events from [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events), named in the past tense: `task.completed`. A command can be refused. An event already happened.

## One handler per type

On a command or query bus, each type has exactly one handler. That makes sense: "complete task 7" should be done once, by one piece of code, not by whoever happens to listen. The bus enforces it, and tells you clearly when a type has no handler:

buses.ts

```ts
import { CommandHandlerNotFoundError, createCommandBus, createCommand, DuplicateHandlerError } from "@zudojs/cqrs";

const bus = createCommandBus();
bus.register("CompleteTask", () => "completed");

try {
  bus.register("CompleteTask", () => "completed twice");
} catch (error) {
  if (error instanceof DuplicateHandlerError) console.log(error.message);
}

try {
  await bus.execute({ type: "CompleteTsk" });
} catch (error) {
  if (error instanceof CommandHandlerNotFoundError) console.log(error.statusCode, error.message);
}

console.log(bus.size(), bus.has("CompleteTask"), bus.getCommandTypes());

const command = createCommand("CompleteTask", { taskId: 7, type: "DeleteAllTasks" });
console.log(command, Object.isFrozen(command));
```

Output of `npx tsx buses.ts` and of the browser terminal

```ts
A command handler is already registered for "CompleteTask".
500 No command handler is registered for "CompleteTsk".
1 true [ 'CompleteTask' ]
{ taskId: 7, type: 'CompleteTask' } true
```

- A second handler for the same type throws `DuplicateHandlerError` at registration, while the app starts.
- A typo in the type throws `CommandHandlerNotFoundError`. Compare the message bus, where a message nobody handled counted as a success. Here a missing handler is a bug, and a status of 500 says so.
- `createCommand(type, data)` builds a frozen command. The type you pass always wins, even when the data has its own `type` field. That matters when the data comes from a request body: a client cannot turn a `CompleteTask` into a `DeleteAllTasks`.

## Handlers as classes

A handler can be a plain function, as above, or a class. A class can receive its dependencies (a repository, the event bus) in its constructor, which is how you wire it up with the container from [the dependency injection lesson](https://zudojs.oyinlola.site/learn/zudo-container):

class-handler.ts

```ts
import { CommandHandler, createCommandBus } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";
import { NotFoundError } from "@zudojs/errors";

type CompleteTask = CommandOf<"CompleteTask", { taskId: number }>;

interface TaskRow {
  id: number;
  title: string;
  done: boolean;
}

class CompleteTaskHandler extends CommandHandler<CompleteTask, void> {
  readonly commandType = "CompleteTask";

  constructor(private readonly rows: Map<number, TaskRow>) {
    super();
  }

  execute(command: CompleteTask): void {
    const row = this.rows.get(command.taskId);
    if (!row) throw new NotFoundError(`Task ${command.taskId} not found`);
    row.done = true;
  }
}

const rows = new Map([[1, { id: 1, title: "Buy milk", done: false }]]);
const bus = createCommandBus().register("CompleteTask", new CompleteTaskHandler(rows));

await bus.execute<CompleteTask>({ type: "CompleteTask", taskId: 1 });
console.log(rows.get(1));

try {
  await bus.execute<CompleteTask>({ type: "CompleteTask", taskId: 9 });
} catch (error) {
  if (error instanceof NotFoundError) console.log(error.statusCode, error.message);
}
```

Output of `npx tsx class-handler.ts` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: true }
404 Task 9 not found
```

An error thrown by a handler comes straight out of `execute`, unchanged. The `NotFoundError` from [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors) still carries its 404, so your HTTP layer can turn it into the right response. Unlike the message bus, there is no result object to check: `execute` either returns the handler's value or throws.

## The execution context: who is asking

Every `execute` call can take a second argument, the **execution context**. It rides along with the command and says *who* is asking (`userId`, `tenantId`), *where* it came from (`source`), and which ids tie it to other work (`requestId`, `correlationId`, `causationId`, the same ideas as in the messaging lesson).

This matters for security. Look at this command first:

insecure.ts

```ts
import { createCommandBus } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";

type CompleteTask = CommandOf<"CompleteTask", { taskId: number; userId: string }>;

const owners = new Map([[1, "ada"]]);
const bus = createCommandBus();

bus.register<CompleteTask, string>("CompleteTask", (command) => {
  if (owners.get(command.taskId) !== command.userId) return "refused";
  return `task ${command.taskId} completed for ${command.userId}`;
});

const body = JSON.parse('{ "taskId": 1, "userId": "ada" }');
console.log(await bus.execute<CompleteTask, string>({ ...body, type: "CompleteTask" }));
```

Output of `npx tsx insecure.ts` and of the browser terminal

```ts
task 1 completed for ada
```

> THIS IS A SECURITY HOLE
>
> The ownership check compares the task owner with `command.userId`, and `userId` came from the request body. Linus, logged in as himself, sends `{"taskId": 1, "userId": "ada"}` and completes Ada's task. The check passes because he chose the value it checks. Who is asking must never come from data the client sends. It comes from the verified login, as in [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth).

The fix: the HTTP layer reads the user from the verified token and puts it in the context. The command carries only what the client is allowed to choose, the task id:

secure.ts

```ts
import { createCommandBus, createExecutionContext, withUser } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";
import { AuthenticationError, NotFoundError } from "@zudojs/errors";

type CompleteTask = CommandOf<"CompleteTask", { taskId: number }>;

const owners = new Map([[1, "ada"]]);
const bus = createCommandBus();

bus.register<CompleteTask, string>("CompleteTask", (command, context) => {
  const userId = context?.userId;
  if (!userId) throw new AuthenticationError("Sign in first");
  if (owners.get(command.taskId) !== userId) throw new NotFoundError(`Task ${command.taskId} not found`);
  return `task ${command.taskId} completed for ${userId}`;
});

const request = createExecutionContext({ source: "http", correlationId: "req-7f3a" });
const asLinus = withUser(request, "linus");
const asAda = withUser(request, "ada");
const command: CompleteTask = { type: "CompleteTask", taskId: 1 };

for (const [who, context] of [["linus", asLinus], ["ada", asAda], ["nobody", request]] as const) {
  try {
    console.log(who, "->", await bus.execute<CompleteTask, string>(command, context));
  } catch (error) {
    if (error instanceof Error) console.log(who, "->", error.name, error.message);
  }
}
```

Output of `npx tsx secure.ts` and of the browser terminal

```ts
linus -> NotFoundError Task 1 not found
ada -> task 1 completed for ada
nobody -> AuthenticationError Sign in first
```

- `createExecutionContext` builds a frozen context and gives it a fresh `requestId`. `withUser` returns a *new* context with the user set. Nothing is changed in place.
- Linus gets a 404, not a 403. Saying "forbidden" would confirm that task 1 exists. "Not found" tells an outsider nothing.
- No user at all is a 401, `AuthenticationError`.

When a command causes another one, `createChildExecutionContext(parent)` keeps the user and the correlation id and records the parent's `requestId` as the `causationId`.

## Middleware on the buses

CQRS middleware wraps every command or query on a bus. It receives the request, the context and `next`. Its signature differs a little from the event and message middleware: you pass the request and context on, as `next(request, context)`. The package also ships ready-made middleware:

middleware.ts

```ts
import { createCommandBus, errorMiddleware, onErrorMiddleware, timingMiddleware } from "@zudojs/cqrs";
import type { CqrsMiddleware } from "@zudojs/cqrs";

const audit: CqrsMiddleware = async (request, context, next) => {
  console.log(`audit: ${context?.userId ?? "anonymous"} runs ${request.type}`);
  return next(request, context);
};

const timing = timingMiddleware({
  onTiming: ({ request, succeeded }) => console.log(`timing: ${request.type} ok=${succeeded}`),
});

const bus = createCommandBus({ middleware: [audit, timing, errorMiddleware()] });
bus.use(onErrorMiddleware((request, error) => {
  console.log(`error: ${request.type} failed: ${error instanceof Error ? error.message : error}`);
}));

bus.register("CreateTask", () => ({ id: 1 }));
bus.register("ExportTasks", () => {
  throw new Error("connection to the database was reset");
});

console.log(await bus.execute({ type: "CreateTask" }, { userId: "ada" }));
try {
  await bus.execute({ type: "ExportTasks" }, { userId: "ada" });
} catch (error) {
  if (error instanceof Error) console.log("caller sees:", error.name, error.message);
}
console.log("timed so far:", timing.count);
```

Output of `npx tsx middleware.ts` and of the browser terminal

```ts
audit: ada runs CreateTask
timing: CreateTask ok=true
{ id: 1 }
audit: ada runs ExportTasks
error: ExportTasks failed: connection to the database was reset
timing: ExportTasks ok=false
caller sees: CqrsError connection to the database was reset
timed so far: 2
```

- Middleware runs in the order you list it. `bus.use` adds one more at the end, closest to the handler.
- `timingMiddleware` measures every request. Pass the numbers to your metrics in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability).
- `errorMiddleware()` wraps unexpected errors, like this plain `Error`, in a `CqrsError` with status 500 whose `expose` flag is `false`, so your HTTP layer sends a generic message instead of the database's. Errors from `@zudojs/errors`, such as `NotFoundError`, pass through unchanged.
- `onErrorMiddleware(fn)` calls `fn` for every failure, then re-throws it. Log there.

> CALL NEXT ONCE
>
> A middleware must call `next` at most once. A second call throws. Not calling it at all skips the handler silently, which is only right for a guard that throws or returns a deliberate answer.

## What a command returns

You have seen the answer: `execute` returns whatever the handler returns, and throws whatever it throws. Keep command results small, usually the id of what was created. If you want every command to return the same explicit shape, with a status and a time, the package has an optional **result type**:

REASON IT OUT

### A title is already taken. Should CreateTask throw, or return a failed CommandResult?

"Title already used" is not a bug and not an authorization problem: it is an ordinary, expected outcome that the caller needs to react to, maybe by suggesting a different title. Compare that with the `NotFoundError` you saw for a task that does not exist, or belongs to someone else. Should both of these be reported the same way? What changes for the code that calls `execute` in each case?

**Show the reasoning**

Throwing suits failures the caller mostly just propagates upward: wrong input, no permission, nothing found — the HTTP layer already knows how to turn a `ValidationError` or a `NotFoundError` from [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors) into the right status code, so the calling code does not need a `try`/`catch` at every call site. A `CommandResult` suits a failure the caller must actively branch on as a normal case — "the title was taken, so show the user a suggestion" is application logic, not error handling, and forcing it through a thrown exception makes ordinary control flow look like an exceptional one. Most of this course throws, because most Task API failures are exactly the propagate-upward kind; reach for `createFailedCommandResult` only when a caller genuinely needs to inspect a failure and decide what to do next, rather than just report it.

results.ts

```ts
import {
  CommandFailedError,
  createCommand,
  createCommandResult,
  createFailedCommandResult,
  isSuccessfulCommandResult,
  unwrapCommandResult,
} from "@zudojs/cqrs";

const command = createCommand("CreateTask", { title: "Buy milk" });

const ok = createCommandResult({ id: 1 }, { command, durationMs: 3 });
console.log(ok.status, ok.commandType, ok.result, isSuccessfulCommandResult(ok));
console.log(unwrapCommandResult(ok));

const refused = createFailedCommandResult({ reason: "Title already used" }, { command });
console.log(refused.status, refused.result, isSuccessfulCommandResult(refused));
try {
  unwrapCommandResult(refused);
} catch (error) {
  if (error instanceof CommandFailedError) console.log(error.code, error.message, error.failure);
}
```

Output of `npx tsx results.ts` and of the browser terminal

```ts
success CreateTask { id: 1 } true
{ id: 1 }
failure { reason: 'Title already used' } false
ERR_COMMAND_FAILED Command "CreateTask" failed. { reason: 'Title already used' }
```

The buses do not create these for you. A handler that wants them returns one. Check `status` (or `isSuccessfulCommandResult`) before you use `result`, or call `unwrapCommandResult`: it returns the value of a success and throws a `CommandFailedError` for a failure, with the failure payload on `error.failure`. `unwrapQueryResult` does the same for queries and throws `QueryFailedError`. In most apps, throwing an error from `@zudojs/errors` is simpler and is what the rest of this course does.

## Put it together: the Task API with CQRS

Here are the Task API's task operations as two commands and a query. The command handler for `CompleteTask` publishes the `task.completed` event from the events lesson after the change is saved, so emails, statistics and cache clearing happen without the handler knowing about them. The query is a plain read:

tasks.cqrs.ts

```ts
import { createCommandBus, createQueryBus } from "@zudojs/cqrs";
import type { CommandOf, CqrsContext, QueryOf } from "@zudojs/cqrs";
import { AuthenticationError, NotFoundError } from "@zudojs/errors";
import type { EventBus } from "@zudojs/events";

export interface Task { readonly id: number; readonly userId: string; readonly title: string; done: boolean }
export type CreateTask = CommandOf<"CreateTask", { title: string }>;
export type CompleteTask = CommandOf<"CompleteTask", { taskId: number }>;
export type ListTasks = QueryOf<"ListTasks", { onlyOpen: boolean }>;

function requireUser(context?: CqrsContext): string {
  if (!context?.userId) throw new AuthenticationError("Sign in first");
  return context.userId;
}

export function createTaskBuses(events: EventBus) {
  const rows = new Map<number, Task>();
  const commands = createCommandBus();
  const queries = createQueryBus();

  commands.register<CreateTask, { id: number }>("CreateTask", (command, context) => {
    const task: Task = { id: rows.size + 1, userId: requireUser(context), title: command.title, done: false };
    rows.set(task.id, task);
    return { id: task.id };
  });

  commands.register<CompleteTask, void>("CompleteTask", async (command, context) => {
    const userId = requireUser(context);
    const task = rows.get(command.taskId);
    if (!task || task.userId !== userId) throw new NotFoundError(`Task ${command.taskId} not found`);
    task.done = true;
    await events.publishEvent({ type: "task.completed", payload: { taskId: task.id, userId } });
  });

  queries.register<ListTasks, Task[]>("ListTasks", (query, context) => {
    const userId = requireUser(context);
    return [...rows.values()].filter((t) => t.userId === userId && (!query.onlyOpen || !t.done));
  });

  return { commands, queries };
}
```

main.ts

```ts
import { createExecutionContext, withUser } from "@zudojs/cqrs";
import { createEventBus } from "@zudojs/events";
import { createTaskBuses } from "./tasks.cqrs.js";
import type { CompleteTask, CreateTask, ListTasks, Task } from "./tasks.cqrs.js";

const events = createEventBus();
events.on("task.completed", (event) => console.log("event:", event.type, event.payload));
const { commands, queries } = createTaskBuses(events);

const ada = withUser(createExecutionContext({ source: "http" }), "ada");

await commands.execute<CreateTask, { id: number }>({ type: "CreateTask", title: "Buy milk" }, ada);
await commands.execute<CreateTask, { id: number }>({ type: "CreateTask", title: "Write report" }, ada);
await commands.execute<CompleteTask>({ type: "CompleteTask", taskId: 1 }, ada);

const open = await queries.execute<ListTasks, Task[]>({ type: "ListTasks", onlyOpen: true }, ada);
console.log("open:", open.map((t) => t.title));
const all = await queries.execute<ListTasks, Task[]>({ type: "ListTasks", onlyOpen: false }, ada);
console.log("all:", all.map((t) => `${t.title} (${t.done ? "done" : "open"})`));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
event: task.completed { taskId: 1, userId: 'ada' }
open: [ 'Write report' ]
all: [ 'Buy milk (done)', 'Write report (open)' ]
```

In the real Task API, the route for `POST /tasks/:id/complete` becomes three lines: build the context from the verified user, build the command from the validated path parameter, and `execute`. Every rule lives in one handler, and every command passes through the same audit, timing and error middleware.

## When to use CQRS, and when not

CQRS is a tool, not a rule for every project. It adds a bus, a type per operation and a handler per type. That pays off when:

- You have many operations, and you want each in its own small, testable handler.
- You want one place to audit, time, lock or authorize every change.
- Reads and writes grow apart: writes need strict rules and transactions, reads need speed, caching, or a separate read-optimised table.

Skip it when:

- The app is small, or mostly simple create-read-update-delete. A service class with methods, like the `TaskService` you already have, is clearer.
- You would only be adding a bus between a route and a single function call. Indirection costs reading time.

You may also read about CQRS with *separate databases* for reads and writes, kept in sync by events. That is an advanced version for large systems. The simple split you learned here, commands versus queries in one database, gives most of the benefit. [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system) builds that advanced version end to end: a transactional outbox, a projected read model, and one trace across both sides.

## Practice

TRY IT YOURSELF

### Add RenameTask

Add a `RenameTask` command with `taskId` and `title`. It must refuse a title shorter than 3 characters with a `ValidationError` from `@zudojs/errors`, and must only rename the caller's own task.

**Show a solution**

rename.ts

```ts
import { createCommandBus, createExecutionContext, withUser } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";
import { AuthenticationError, NotFoundError, ValidationError } from "@zudojs/errors";

type RenameTask = CommandOf<"RenameTask", { taskId: number; title: string }>;

const rows = new Map([[1, { id: 1, userId: "ada", title: "Buy milk" }]]);
const bus = createCommandBus();

bus.register<RenameTask, void>("RenameTask", (command, context) => {
  const userId = context?.userId;
  if (!userId) throw new AuthenticationError("Sign in first");
  if (command.title.trim().length < 3) throw new ValidationError("Title must be at least 3 characters");
  const row = rows.get(command.taskId);
  if (!row || row.userId !== userId) throw new NotFoundError(`Task ${command.taskId} not found`);
  row.title = command.title.trim();
});

const ada = withUser(createExecutionContext(), "ada");
const linus = withUser(createExecutionContext(), "linus");

await bus.execute<RenameTask>({ type: "RenameTask", taskId: 1, title: "Buy oat milk" }, ada);
console.log(rows.get(1)?.title);

for (const [title, context] of [["no", ada], ["Hacked", linus]] as const) {
  try {
    await bus.execute<RenameTask>({ type: "RenameTask", taskId: 1, title }, context);
  } catch (error) {
    if (error instanceof Error) console.log(error.name, error.message);
  }
}
```

Output of `npx tsx rename.ts` and of the browser terminal

```ts
Buy oat milk
ValidationError Title must be at least 3 characters
NotFoundError Task 1 not found
```

TRY IT YOURSELF

### Command or query?

Sort these into commands and queries: (a) `GetTaskCount`; (b) `MarkAllAsRead`; (c) `SearchTasks` that also records the search term for analytics; (d) `ArchiveOldTasks`.

**Show a solution**

(a) Query. (b) Command. (d) Command. (c) is the interesting one: as described it is both, which breaks the rule. Make `SearchTasks` a pure query, and record the search term separately, for example by publishing a `search.performed` event that an analytics handler reacts to. Then the search can be cached and retried safely.

TRY IT YOURSELF

### A guard middleware

Write a middleware that throws `AuthenticationError` for any request whose context has no `userId`, so no handler has to remember the check. Test it with and without a user.

**Show a solution**

guard.ts

```ts
import { createQueryBus } from "@zudojs/cqrs";
import type { CqrsMiddleware } from "@zudojs/cqrs";
import { AuthenticationError } from "@zudojs/errors";

const requireUser: CqrsMiddleware = async (request, context, next) => {
  if (!context?.userId) throw new AuthenticationError("Sign in first");
  return next(request, context);
};

const queries = createQueryBus({ middleware: [requireUser] });
queries.register("ListTasks", (query, context) => [`tasks of ${context?.userId}`]);

console.log(await queries.execute({ type: "ListTasks" }, { userId: "ada" }));
try {
  await queries.execute({ type: "ListTasks" });
} catch (error) {
  if (error instanceof AuthenticationError) console.log(error.statusCode, error.message);
}
```

Output of `npx tsx guard.ts` and of the browser terminal

```json
[ 'tasks of ada' ]
401 Sign in first
```

A guard like this is a safety net. Keep the ownership checks inside the handlers too: "signed in" and "allowed to touch this task" are different questions.

## Recap

- A command changes data and returns little. A query reads and changes nothing, so it can be cached and retried.
- A bus routes each `type` to exactly one handler. Duplicate and missing handlers are errors.
- Handlers are functions or classes. `execute` returns the handler's value or throws its error.
- The execution context carries the user, tenant and ids. The user comes from the verified login, never from the command's data.
- Middleware adds audit, timing and error handling to every command in one place. Call `next` once.
- Use CQRS when operations are many and reads and writes grow apart. For a small app, a service class is simpler.

Next, [Background jobs](https://zudojs.oyinlola.site/learn/zudo-queue) moves the slow, unreliable parts of a command — the ones that should not make the caller wait, or that must survive a crash — onto a queue.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
