---
title: "Dependency injection with @zudojs/container — ZudoJS Academy"
description: "Let a container build and share your services: tokens, class, factory and value providers, lifetimes, cycle detection, disposal and swapping in test fakes."
source: https://zudojs.oyinlola.site/learn/zudo-container
---

LEVEL 12 · LESSON 10 OF 19

Dependency injection Core

# Dependency injection with @zudojs/container

Let a container build and share your services: tokens, class, factory and value providers, lifetimes, cycle detection, disposal and swapping in test fakes.

- **40 min** to read and try
- **You need:** "The application runtime and lifecycle" and "Types and constants: guards, ids and time"
- **You build:** A composition root for the Task API that builds the TaskService, its store and its clock

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain dependency injection and what it makes possible in tests
- Name dependencies with class tokens and createToken, and register value, class, factory and alias providers
- Choose singleton, scoped or transient for a dependency, and explain why a singleton may not capture a scoped one
- Read the container's circular-dependency and wiring errors, and dispose what it created
- Replace a real service with a fake in a test and restore the original afterwards

## The problem: who builds what?

A service rarely works alone. The Task API's `TaskService` needs somewhere to keep tasks and a way to know the time. The quick way is to create those inside the service:

hard-wired.ts

```ts
class TaskStore {
  readonly tasks = new Map<number, string>();
}

class TaskService {
  private readonly store = new TaskStore();

  create(title: string): string {
    const stamp = new Date().toISOString().slice(0, 10);
    this.store.tasks.set(this.store.tasks.size + 1, title);
    return `${title} (created ${stamp})`;
  }
}

console.log(new TaskService().create("Buy milk").includes("created"));
```

Output of `npx tsx hard-wired.ts` and of the browser terminal

```ts
true
```

It works, but look at what is now impossible:

- Two services cannot share one store: each `new TaskService()` makes its own.
- A test cannot give the service an empty store, a fake database, or a fixed date. The output changes every day, so the test can only check `includes("created")`.

The fix is called **dependency injection**: a class does not create what it needs, it *receives* it, usually as constructor parameters. The things it receives are its **dependencies**:

injected.ts

```ts
import { FixedClock } from "@zudojs/types";
import type { Clock } from "@zudojs/types";

class TaskStore {
  readonly tasks = new Map<number, string>();
}

class TaskService {
  constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  create(title: string): string {
    this.store.tasks.set(this.store.tasks.size + 1, title);
    const day = new Date(this.clock.now()).toISOString().slice(0, 10);
    return `${title} (created ${day})`;
  }
}

const fixedClock = new FixedClock(Date.parse("2026-09-23T09:00:00Z"));
const store = new TaskStore();
const service = new TaskService(store, fixedClock);

console.log(service.create("Buy milk"));
console.log("tasks in the shared store:", store.tasks.size);
```

Output of `npx tsx injected.ts` and of the browser terminal

```ts
Buy milk (created 2026-09-23)
tasks in the shared store: 1
```

Now the caller decides. `Clock` and `FixedClock` are the ones from [Types and constants](https://zudojs.oyinlola.site/learn/zudo-types-constants#clock): `now()` returns milliseconds since 1970, and a `FixedClock` stands still. The test passed a clock that always says 23 September, so the output is predictable, and it can look inside the same store the service used.

Someone still has to call all those constructors in the right order. In a small app you do it by hand in one place, called the **composition root**. With dozens of services, a **container** does it for you: you tell it how to build each thing once, and it builds, shares and cleans up. `@zudojs/container` is already a dependency of the Task API; `src/app.ts` creates one with `createContainer()` and gives it to the runtime.

## Tokens: names for dependencies

A container stores **registrations**: "when someone asks for X, build it like this". The X is a **token**, a key that names the dependency. A token can be a class, or an `InjectionToken` made with `createToken`:

tokens.ts

```ts
import { createContainer, createToken } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import type { Clock } from "@zudojs/types";

const CLOCK = createToken<Clock>("Clock");
const MAX_TASKS = createToken<number>("MaxTasks");

const container = createContainer();
container.registerValue(CLOCK, new FixedClock(Date.parse("2026-09-23T09:00:00Z")));
container.registerValue(MAX_TASKS, 500);

const clock = container.resolve(CLOCK);
console.log(new Date(clock.now()).toISOString(), container.resolve(MAX_TASKS));
console.log(container.has(CLOCK), container.has(createToken<Clock>("Clock")));
```

Output of `npx tsx tokens.ts` and of the browser terminal

```ts
2026-09-23T09:00:00.000Z 500
true false
```

`resolve` asks the container for a dependency. Three things to notice:

- The `<Clock>` in `createToken<Clock>` makes `resolve(CLOCK)` return a `Clock`, so TypeScript checks how you use it.
- An interface such as `Clock` does not exist when the program runs, so it cannot be a key. That is why interfaces need a token. A class does exist at runtime, so a class can be its own token.
- Every `createToken` call makes a new, unique token, even with the same name. The last line is `false`: create each token once and import it wherever it is needed.

> TIP
>
> You can also use plain strings such as `"clock"` as tokens, but TypeScript cannot check them: `resolve<number>("clock")` would compile and be wrong. Prefer `createToken` or a class.

## Providers: how to build each dependency

A **provider** tells the container how to produce a value. There are four kinds, each with a short method:

| Method | Provider | What the container does |
| --- | --- | --- |
| `registerValue(token, value)` | value | Hands out the object you gave it. |
| `registerClass(token, Class, { inject })` | class | Calls `new Class(...)` with the resolved `inject` tokens as arguments. |
| `registerFactory(token, fn, inject)` | factory | Calls your function and uses what it returns. |
| `registerExisting(token, otherToken)` | alias | Answers with whatever `otherToken` resolves to. |

Here is the Task API's `TaskService` built by the container. The service lists its dependencies in its constructor. The registration lists the matching tokens in `inject`, in the same order:

providers.ts

```ts
import { createContainer, createToken } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import type { Clock } from "@zudojs/types";

class TaskStore {
  readonly titles: string[] = [];
}

class TaskService {
  constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  create(title: string): string {
    this.store.titles.push(title);
    return `#${this.store.titles.length} ${title} at ${new Date(this.clock.now()).toISOString()}`;
  }
}

const CLOCK = createToken<Clock>("Clock");
const START = createToken<string>("StartTime");

const container = createContainer();
container.registerValue(START, "2026-09-23T09:00:00Z");
container.registerFactory(CLOCK, (start) => new FixedClock(Date.parse(start)), [START]);
container.registerClass(TaskStore, TaskStore);
container.registerClass(TaskService, TaskService, { inject: [TaskStore, CLOCK] });

const service = container.resolve(TaskService);
console.log(service.create("Buy milk"));
```

Output of `npx tsx providers.ts` and of the browser terminal

```ts
#1 Buy milk at 2026-09-23T09:00:00.000Z
```

To build `TaskService`, the container first resolved `TaskStore` (a class with no dependencies) and `CLOCK` (a factory, which needed `START`), then called `new TaskService(store, clock)`. You never wrote that call.

What if you `resolve` a class you never registered? The container builds it for you, as a transient, but only when its constructor takes no parameters. Otherwise it cannot know what to pass, and it tells you how to register the class:

auto.ts

```ts
import { createContainer } from "@zudojs/container";

class TaskStore {
  readonly titles: string[] = [];
}
class TaskService {
  constructor(readonly store: TaskStore) {}
}

const container = createContainer();
console.log(container.resolve(TaskStore).titles);
try {
  container.resolve(TaskService);
} catch (error) {
  console.log((error as Error).name);
  console.log((error as Error).message);
}
```

Output of `npx tsx auto.ts` and of the browser terminal

```json
[]
RegistrationNotFoundError
Cannot auto-register class "TaskService": its constructor declares 1 parameter and no inject list is registered, so it would be built with undefined dependencies. Register it with container.registerClass(TaskService, TaskService, { inject: [/* one token per parameter */] }) or container.registerFactory(TaskService, (...deps) => new TaskService(...deps), [/* tokens */]).
```

Registering every service explicitly is still the clearer choice: the composition root then lists everything the app is made of.

The factory's parameter `start` has no type annotation, yet TypeScript knows it is a `string`: a factory's parameters are typed from its `inject` list, in order (since `@zudojs/container` 1.2.0). So a factory whose parameters do not match its tokens does not compile. Here the two parameters are in the wrong order:

factory-check.ts

```ts
import { createContainer, createToken } from "@zudojs/container";
import type { Clock } from "@zudojs/types";

class TaskStore {
  readonly titles: string[] = [];
}

class TaskService {
  constructor(readonly store: TaskStore, readonly clock: Clock) {}
}

const CLOCK = createToken<Clock>("Clock");

const container = createContainer();
container.registerFactory(
  TaskService,
  (clock, store) => new TaskService(store, clock),
  [TaskStore, CLOCK],
);
```

What `npx tsc --noEmit` prints

```ts
factory-check.ts:17:37 - error TS2741: Property 'titles' is missing in type 'Clock' but required in type 'TaskStore'.

17   (clock, store) => new TaskService(store, clock),
                                       ~~~~~

  factory-check.ts:5:12 - 'titles' is declared here.
    5   readonly titles: string[] = [];
                 ~~~~~~


Found 1 error in factory-check.ts:17
```

The second token is `CLOCK`, so the second parameter is a `Clock`, even though it is called `store`. The constructor wants a `TaskStore` there, and a `Clock` has no `titles`. The names of the parameters do not matter; their order does.

`registerClass` checks the same way: swap the tokens in its `inject` list and the registration itself fails to compile, no factory needed:

class-check.ts

```ts
import { createContainer, createToken } from "@zudojs/container";
import type { Clock } from "@zudojs/types";

class TaskStore {
  readonly titles: string[] = [];
}
class TaskService {
  constructor(readonly store: TaskStore, readonly clock: Clock) {}
}

const CLOCK = createToken<Clock>("Clock");
const container = createContainer();
container.registerClass(TaskService, TaskService, { inject: [CLOCK, TaskStore] });
```

What `npx tsc --noEmit` prints

```ts
class-check.ts:13:38 - error TS2345: Argument of type 'typeof TaskService' is not assignable to parameter of type 'InjectedConstructor<TaskService, NoInfer<readonly [InjectionToken<Clock>, typeof TaskStore]>>'.
  Types of parameters 'store' and 'args' are incompatible.
    Type '{ [x: number]: Clock | TaskStore; toString: never; toLocaleString: never; concat: never; join: never; slice: never; indexOf: never; lastIndexOf: never; every: never; some: never; ... 24 more ...; length: never; }' is not assignable to type '[store: TaskStore, clock: Clock]'.
      Type at position 0 in source is not compatible with type at position 0 in target.
        Property 'titles' is missing in type 'Clock' but required in type 'TaskStore'.

13 container.registerClass(TaskService, TaskService, { inject: [CLOCK, TaskStore] });
                                        ~~~~~~~~~~~

  class-check.ts:5:12 - 'titles' is declared here.
    5   readonly titles: string[] = [];
                 ~~~~~~


Found 1 error in class-check.ts:13
```

Keep the `inject` list next to the constructor and in the same order regardless: the message above is accurate but not exactly friendly, and a wiring mistake is cheaper to read as a type error here than to debug from a runtime crash three files away.

## Lifetimes: singleton, scoped and transient

Should everyone who asks for `TaskStore` get *the same* store, or a new one? That is the registration's **lifetime**, set with the `scope` option:

- `ContainerScope.SINGLETON`: one instance for the whole container. Use it for things that must be shared: a store, a connection pool, a logger.
- `ContainerScope.TRANSIENT`: a new instance on every `resolve`. This is the **default**.
- `ContainerScope.SCOPED`: one instance per **scope**. A scope is a short-lived child of the container, usually one per HTTP request.

The identity operator `===` shows the difference: it is `true` only for the very same object.

lifetimes.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";

let created = 0;
class TaskStore { readonly id = ++created; }
class Report { readonly id = ++created; }
class RequestInfo { readonly id = ++created; }

const container = createContainer();
container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
container.registerClass(Report, Report);
container.registerClass(RequestInfo, RequestInfo, { scope: ContainerScope.SCOPED });

console.log("singleton:", container.resolve(TaskStore) === container.resolve(TaskStore));
console.log("transient:", container.resolve(Report) === container.resolve(Report));

const request1 = container.createScope({ name: "request-1" });
const request2 = container.createScope({ name: "request-2" });
console.log("scoped, same request:", request1.resolve(RequestInfo) === request1.resolve(RequestInfo));
console.log("scoped, two requests:", request1.resolve(RequestInfo) === request2.resolve(RequestInfo));
console.log("singleton inside a scope:", request1.resolve(TaskStore) === container.resolve(TaskStore));
console.log("objects created:", created);
```

Output of `npx tsx lifetimes.ts` and of the browser terminal

```ts
singleton: true
transient: false
scoped, same request: true
scoped, two requests: false
singleton inside a scope: true
objects created: 5
```

Count the objects: one `TaskStore`, two `Report`s (one per `resolve`), and two `RequestInfo`s (one per scope). A singleton stays the same everywhere, even when resolved through a scope.

REASON IT OUT

### Which lifetime for each?

Before reading on, pick a lifetime for each of these, and say what would break with the wrong one: the `TaskStore`; an `AuditLog` that collects what one request did and writes it when the request ends; a small `TitleFormatter` with no fields at all; and a singleton `TaskService` that wants the current request's `AuditLog` in its constructor.

**Show the reasoning**

- **`TaskStore`**: singleton. Everyone must see the same tasks. As a transient, every service would get its own empty store, the "two task lists" bug.
- **`AuditLog`**: scoped. Each request needs its own. As a singleton, every request would write into one shared log, mixing up users.
- **`TitleFormatter`**: it holds no state, so any lifetime gives the same behaviour; transient (the default) or singleton are both fine.
- **The singleton `TaskService`** is built once, with the `AuditLog` of whichever request came first, and keeps it forever. Every later request would write into the first request's log. The service must not receive a scoped dependency in its constructor; the container refuses exactly that.

The container also stops you from mixing lifetimes in a dangerous way:

lifetime-errors.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";

class RequestInfo {}
class TaskService {
  constructor(readonly request: RequestInfo) {}
}

const container = createContainer();
container.registerClass(RequestInfo, RequestInfo, { scope: ContainerScope.SCOPED });
container.registerClass(TaskService, TaskService, {
  scope: ContainerScope.SINGLETON,
  inject: [RequestInfo],
});

try {
  container.resolve(RequestInfo);
} catch (error) {
  console.log((error as Error).name);
}

try {
  container.createScope().resolve(TaskService);
} catch (error) {
  console.log((error as Error).name);
  console.log((error as Error).message);
}
```

Output of `npx tsx lifetime-errors.ts` and of the browser terminal

```ts
ScopedResolutionError
CaptiveDependencyError
Captive dependency: singleton "TaskService" depends on scoped "RequestInfo". A longer-lived consumer cannot capture a shorter-lived dependency. (chain: TaskService -> RequestInfo)
```

- A scoped dependency belongs to a request, so asking for it with no scope is a `ScopedResolutionError`.
- A singleton lives forever. If it kept a reference to one request's `RequestInfo`, every later request would see the first request's data: a real data leak between users. The container refuses with a `CaptiveDependencyError`. The rule: a dependency must live at least as long as the thing that uses it.

> NOTE
>
> Error messages name a class token by its class name, and a token made with `createToken("Mailer")` by its name, `Mailer`.

## Circular dependencies

If A needs B and B needs A, neither can be built first. You met this problem between modules in [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#dependencies). The container detects it too, and names the whole loop:

circular.ts

```ts
import { CircularDependencyError, createContainer } from "@zudojs/container";

class TaskService {
  constructor(readonly notifier: unknown) {}
}
class Notifier {
  constructor(readonly tasks: unknown) {}
}

const container = createContainer();
container.registerClass(TaskService, TaskService, { inject: [Notifier] });
container.registerClass(Notifier, Notifier, { inject: [TaskService] });

try {
  container.resolve(TaskService);
} catch (error) {
  if (error instanceof CircularDependencyError) {
    console.log(error.message);
  }
}
```

Output of `npx tsx circular.ts` and of the browser terminal

```ts
Circular dependency detected: TaskService -> Notifier -> TaskService.
```

A cycle is almost always a design problem, not a container problem. The usual fixes: move the shared part into a third class that both use, or let one side send an event instead of calling the other directly (you will meet events in [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events)).

## Disposal: cleaning up

Some objects hold resources: a database connection, a file, a timer. When the app stops, they must be released. An object is **disposable** if it has a `dispose()` method. `container.dispose()` calls it on every singleton the container created, newest first, so a service is disposed before the pool it uses:

disposal.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";

class Pool {
  dispose() { console.log("pool closed"); }
}
class TaskService {
  constructor(readonly pool: Pool) {}
  dispose() { console.log("task service stopped"); }
}
class RequestLog {
  dispose() { console.log("request log flushed"); }
}

const container = createContainer();
container.registerClass(Pool, Pool, { scope: ContainerScope.SINGLETON });
container.registerClass(TaskService, TaskService, { scope: ContainerScope.SINGLETON, inject: [Pool] });
container.registerClass(RequestLog, RequestLog, { scope: ContainerScope.SCOPED });

container.resolve(TaskService);
const request = container.createScope();
request.resolve(RequestLog);

await request.dispose();
console.log("--- request finished");
await container.dispose();
console.log("disposed:", container.isDisposed());
```

Output of `npx tsx disposal.ts` and of the browser terminal

```ts
request log flushed
--- request finished
task service stopped
pool closed
disposed: true
```

Disposing a scope only disposes that scope's objects. Transient objects are never tracked, so whoever resolved them must clean them up. Values you gave with `registerValue` are never disposed either: the container did not create them, so it does not own them.

By default, the runtime does not dispose the container for you: you created it, so you own it. Either dispose it yourself at the very end of shutdown, after `runtime.stop()`, or pass the runtime option `disposeContainerOnStop: true` (from [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#options)), and `runtime.stop()` disposes it after every module has stopped.

## Testing with fakes

This is where dependency injection pays off. In a test you want the real `TaskService` but not the real outside world: no real e-mails, a fixed clock. `container.replace` swaps one registration, and every singleton that was built on the old one is rebuilt. `snapshot` and `restoreSnapshot` put everything back afterwards:

fakes.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

interface Mailer {
  send(to: string, text: string): void;
}
const MAILER = createToken<Mailer>("Mailer");

class TaskNotifier {
  constructor(private readonly mailer: Mailer) {}
  taskDone(title: string): void {
    this.mailer.send("ada@example.com", `"${title}" is done`);
  }
}

const container = createContainer();
container.registerValue(MAILER, { send: (to, text) => console.log(`SMTP to ${to}: ${text}`) });
container.registerClass(TaskNotifier, TaskNotifier, { scope: ContainerScope.SINGLETON, inject: [MAILER] });

container.resolve(TaskNotifier).taskDone("Buy milk");

const original = container.snapshot();
const sent: string[] = [];
container.replace(MAILER, { useValue: { send: (_to, text) => { sent.push(text); } } });
container.resolve(TaskNotifier).taskDone("Walk the dog");
console.log("the fake mailer recorded:", sent);

container.restoreSnapshot(original);
container.resolve(TaskNotifier).taskDone("Water the plants");
```

Output of `npx tsx fakes.ts` and of the browser terminal

```ts
SMTP to ada@example.com: "Buy milk" is done
the fake mailer recorded: [ '"Walk the dog" is done' ]
SMTP to ada@example.com: "Water the plants" is done
```

While the fake was in place, nothing went to "SMTP" and the test could inspect exactly what would have been sent. `TaskNotifier` itself did not change at all. In a test file, the simplest approach is often a fresh container per test, filled with fakes from the start.

Registering the same token twice by accident is an error (`DuplicateRegistrationError`), so a typo cannot silently replace a real service. Use `replace` when you mean it.

## Put it in the Task API

Open `src/container.ts`. The CLI calls it the **composition root**, and it is the hand-written kind from the start of this lesson: `createDependencies` builds the example resource itself, with `new ExamplesController(new ExamplesService(new InMemoryExamplesRepository()))`. For one small resource with no shared parts, that is fine.

The Task API's pieces need more. The same `TaskStore` must reach the runtime's modules and the task service, and a test must be able to swap the clock. That is a job for the container that `src/app.ts` already creates with `createContainer()` and hands to the runtime. So far that container is empty. The `TaskStore` from [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#task-api) does not change:

src/repositories/tasks.store.ts

```ts
export type Priority = "low" | "normal" | "high";

export interface StoredTask {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: Priority;
  readonly createdAt: string;
}

export class TaskStore {
  public readonly tasks = new Map<number, StoredTask>();
  public connected = false;
  private lastId = 0;

  public nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}
```

Copy `task.schema.ts` from the `ts-tasks` folder of [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code) to `src/dtos/tasks.dto.ts`. The `src/dtos/` folder holds the schemas for data that crosses the API, like the generated `examples.dto.ts`. Make one change:

src/dtos/tasks.dto.tsNode.js only

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
});

export type NewTask = Infer<typeof NewTaskSchema>;
```

Add `as const` after the list of priorities, as shown. Without it, TypeScript widens the list to `string[]`, so the inferred `priority` type would be any string instead of exactly `"low" | "normal" | "high"`, and it would not fit the store's `Priority` type.

The service is the one from that lesson, changed to receive its store and a clock instead of creating them. The clock is the `Clock` from `@zudojs/types`, already a dependency of the project: `now()` returns milliseconds, and `new Date(…).toISOString()` turns them into the stored text. Create `src/services/tasks.service.ts`, next to the generated `examples.service.ts`:

src/services/tasks.service.tsNode.js only

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Clock } from "@zudojs/types";
import { NewTaskSchema } from "../dtos/tasks.dto.js";
import type { StoredTask, TaskStore } from "../repositories/tasks.store.js";

export class TaskService {
  public constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  public create(input: unknown): StoredTask {
    const data = NewTaskSchema.parse(input);
    const clash = [...this.store.tasks.values()].some((t) => t.title === data.title);
    if (clash) {
      throw new ConflictError(`A task called "${data.title}" already exists`);
    }
    const task: StoredTask = { id: this.store.nextId(), ...data, createdAt: new Date(this.clock.now()).toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  public list(): StoredTask[] {
    return [...this.store.tasks.values()];
  }

  public get(id: number): StoredTask {
    const task = this.store.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }
}
```

Now tell the container how to build them. Add a `CLOCK` token and a `registerServices` function to `src/container.ts`, above `DependencyOptions`, with their imports at the top. Keep your lines outside the `// zudojs:…` markers: `zudojs generate` writes between them. The rest of the file stays as it is:

src/container.ts (part)Node.js only

```ts
import { ContainerScope, createToken } from "@zudojs/container";
import type { Container } from "@zudojs/container";
import { systemClock } from "@zudojs/types";
import type { Clock } from "@zudojs/types";

import { TaskStore } from "./repositories/tasks.store.js";
import type { HealthCheck } from "./routes/health.routes.js";
import { TaskService } from "./services/tasks.service.js";
// zudojs:container-imports:start
// (the generated imports stay here)
// zudojs:container-imports:end

/** The clock the Task API uses; a test can replace it with a fixed one. */
export const CLOCK = createToken<Clock>("Clock");

/** Tells the runtime's container how to build the shared task services. */
export function registerServices(container: Container): void {
  container.registerValue(CLOCK, systemClock);
  container.registerClass(TaskStore, TaskStore, { scope: ContainerScope.SINGLETON });
  container.registerClass(TaskService, TaskService, {
    scope: ContainerScope.SINGLETON,
    inject: [TaskStore, CLOCK],
  });
}
```

In `src/app.ts`, fill the container right after it is created, and take the store from it instead of calling `new TaskStore()`. Then the modules and the service share one store. Add the import, and replace the `const store = new TaskStore();` line from the runtime lesson:

src/app.ts (part)Node.js only

```ts
import { registerServices } from "./container.js";

// inside createApp():
  const logger = createLogger({ name: "task-api" });
  const container = createContainer();
  registerServices(container);
  const store = container.resolve(TaskStore);
  const eventBus = createEventBus();
```

The runtime keeps that container as `runtime.context.container`. Code that needs the service, such as the routes in [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http), asks it: `runtime.context.container.resolve(TaskService)`. This check script does the same with a container of its own, and swaps the clock for a fixed one, exactly as a test would. Save it as `src/check-container.ts`:

src/check-container.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import { FixedClock } from "@zudojs/types";
import { CLOCK, registerServices } from "./container.js";
import { TaskStore } from "./repositories/tasks.store.js";
import { TaskService } from "./services/tasks.service.js";

const container = createContainer();
registerServices(container);
container.replace(CLOCK, { useValue: new FixedClock(Date.parse("2026-09-23T09:00:00Z")) });

const service = container.resolve(TaskService);
console.log(service.create({ title: "  Buy milk " }));
console.log(service.list().length, container.resolve(TaskStore).tasks.size);
console.log(service === container.resolve(TaskService));
await container.dispose();
```

Run it in your project, then check that everything still type-checks:

Terminal on your computer

```bash
$ npx tsx src/check-container.ts
{
  id: 1,
  title: 'Buy milk',
  done: false,
  priority: 'normal',
  createdAt: '2026-09-23T09:00:00.000Z'
}
1 1
true
$ npx tsc --noEmit
```

The service got the store and the fixed clock without calling a single constructor, and the store it wrote to is the same singleton the rest of the app sees. `registerClass` catches a wrong `inject` order at compile time, as [above](#providers), but resolving every service at least once, the way this script does, is still the surest way to catch a token that is missing entirely.

## Practice

TRY IT YOURSELF

### An id generator

Register an `IdGenerator` class whose `next()` method returns 1, 2, 3, … Resolve it twice and call `next()` on each. Try it first as transient (the default), then as a singleton. Explain the difference in output.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Give the class a private field, `private last = 0;`, and increment it inside `next()` before returning it: `this.last += 1; return this.last;`, the same shape as `TokenPool` above.

HINT 2

With this fix, transient gives each resolve its own `IdGenerator` (both print 1), while singleton shares one across both resolves (1, then 2).

SOLUTION

ids.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";

class IdGenerator {
  private last = 0;
  next(): number {
    this.last += 1;
    return this.last;
  }
}

for (const scope of [ContainerScope.TRANSIENT, ContainerScope.SINGLETON]) {
  const container = createContainer();
  container.registerClass(IdGenerator, IdGenerator, { scope });
  const a = container.resolve(IdGenerator);
  const b = container.resolve(IdGenerator);
  console.log(scope, a.next(), b.next());
}
```

Output of `npx tsx ids.ts` and of the browser terminal

```ts
transient 1 1
singleton 1 2
```

Transient gave two separate generators, so both started at 1: two tasks could get the same id. An id generator must be shared, so it has to be a singleton.

TRY IT YOURSELF

### One scope per request

Register a scoped `RequestContext` class with a `requestId` property, and a transient `AuditLog` that receives it. Simulate two requests with two scopes, resolve `AuditLog` twice in each, and show that both logs in the same request share the same `RequestContext`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Give `RequestContext` one readonly field, initialised inline: `readonly requestId = \`req-${++counter}\`;`, the same shape as `TenantContext` above.

HINT 2

Once `requestId` exists, both `a` and `b` in one scope read the same value, because `RequestContext` is scoped; the two scopes each get their own.

SOLUTION

per-request.ts

```ts
import { ContainerScope, createContainer } from "@zudojs/container";

let counter = 0;
class RequestContext {
  readonly requestId = `req-${++counter}`;
}
class AuditLog {
  constructor(readonly context: RequestContext) {}
}

const container = createContainer();
container.registerClass(RequestContext, RequestContext, { scope: ContainerScope.SCOPED });
container.registerClass(AuditLog, AuditLog, { inject: [RequestContext] });

for (const name of ["first", "second"]) {
  const scope = container.createScope({ name });
  const a = scope.resolve(AuditLog);
  const b = scope.resolve(AuditLog);
  console.log(name, a.context.requestId, b.context.requestId, a === b);
  await scope.dispose();
}
```

Output of `npx tsx per-request.ts` and of the browser terminal

```ts
first req-1 req-1 false
second req-2 req-2 false
```

The two `AuditLog`s are different objects (transient), but inside one scope they share one `RequestContext`. A transient may depend on a scoped dependency, because the transient never outlives the request.

## Recap

- **Dependency injection**: a class receives its dependencies instead of creating them, so they can be shared and replaced.
- A **token** names a dependency: a class, or `createToken<T>("Name")` for interfaces and values.
- Providers: `registerValue`, `registerClass` and `registerFactory` with an `inject` list (both type-checked against the constructor or the factory's parameters, in order), `registerExisting`.
- Lifetimes: **singleton** (one per container), **scoped** (one per `createScope()`), **transient** (new every time, the default). A singleton may not depend on a scoped dependency.
- Cycles fail with `CircularDependencyError`. `dispose()` cleans up singletons and scopes, newest first.
- For tests: `replace` a registration with a fake, then `restoreSnapshot`.

The Task API now has a working `TaskService`, but its wiring lives in two files, and nothing can reach it from the network yet. Next, [DI architecture with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-di-architecture) decides where every object is built and checks the wiring at startup; the lesson after it adds HTTP routes.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
