---
title: "The application runtime and lifecycle — ZudoJS Academy"
description: "See how @zudojs/runtime starts your app's modules in dependency order, rolls back a failed start, reports readiness honestly and shuts down gracefully."
source: https://zudojs.oyinlola.site/learn/zudo-runtime
---

LEVEL 12 · LESSON 7 OF 19

Core, runtime and lifecycle Core

# The application runtime and lifecycle

See how @zudojs/runtime starts your app's modules in dependency order, rolls back a failed start, reports readiness honestly and shuts down gracefully.

- **45 min** to read and try
- **You need:** "The core: applications, modules and context", and the task-api project from "Create the Task API project"
- **You build:** A Task API runtime with a store module and a tasks module that start in order, roll back on failure and stop cleanly

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict the order in which the runtime runs each module's four hooks, on the way up and on the way down
- Explain what the runtime refuses before any hook runs, and what a rollback undoes
- Register readiness checks and answer a health probe that never reports a stopping app as ready
- Explain why the generated app handles signals in server.ts instead of in the runtime
- Replace the generated placeholder module with modules of your own that share one store

## Why an application needs a runtime

A real backend is not one thing. The Task API will soon have a database connection, a service with the task rules, and an HTTP server. These parts depend on each other:

- The tasks service needs the database, so the database must be ready **first**.
- The HTTP server sends requests to the tasks service, so it must start **last**.
- When the program stops, the order is reversed: stop taking requests first, close the database last.

Doing this by hand works for two parts and becomes fragile at ten. The **runtime** (`@zudojs/runtime`) does it for you. You describe each part and what it depends on, and the runtime works out the order, starts everything, notices failures and shuts down cleanly.

You already have one. In [Anatomy of a ZudoJS project](https://zudojs.oyinlola.site/learn/zudo-project-anatomy) you saw the generated `src/app.ts` build a runtime with `createRuntime`, and `src/server.ts` call `runtime.start()`. [The core lesson](https://zudojs.oyinlola.site/learn/zudo-core) ran modules with the core's own `createApplication`; this lesson explains what `@zudojs/runtime`, the runtime your project really uses, does inside those two calls. Every package used here is already in the project's `package.json`, so there is nothing to install.

## Modules and their four hooks

The runtime manages **modules**, the same module contract from `@zudojs/core` that you met in the core lesson. A module is an object with an `id`, a `name`, an optional list of `dependencies` (the ids of other modules), and up to four **hooks**. A hook is a function the runtime calls at a fixed moment:

| Hook | When the runtime calls it | Typical work |
| --- | --- | --- |
| `onInitialize` | During `start()`, dependencies first | Open a connection, load data |
| `onReady` | During `start()`, after every module has initialized | Start accepting work |
| `onShutdown` | During `stop()`, in reverse order | Stop accepting work, finish what is running |
| `onDestroy` | During `stop()`, last, in reverse order | Release everything the module still holds |

To see the order, this helper builds a module whose hooks only print what happens. It also creates a runtime. `createRuntime` takes two arguments: the **services** the runtime works with (the modules, a logger, a dependency container and an event bus, exactly like `src/app.ts`) and the **options** that describe the application:

trace.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";
import type { Runtime } from "@zudojs/runtime";

export function traceModule(id: string, dependencies: string[] = []): Module {
  return {
    id,
    name: id,
    dependencies,
    onInitialize: () => console.log(`initialize ${id}`),
    onReady: () => console.log(`ready      ${id}`),
    onShutdown: () => console.log(`shutdown   ${id}`),
    onDestroy: () => console.log(`destroy    ${id}`),
  };
}

export function buildRuntime(modules: Module[]): Runtime {
  return createRuntime(
    {
      modules: new Map(modules.map((m) => [m.id, m])),
      logger: createLogger({ name: "task-api", level: LoggerLevel.FATAL }),
      container: createContainer(),
      eventBus: createEventBus(),
    },
    { applicationName: "task-api", environment: "development", handleSignals: false },
  );
}
```

The logger level `FATAL` hides the runtime's own log lines, so the output below only shows the hooks. In your project, keep the default level: those log lines are useful there. `handleSignals: false` is explained in [Signals and graceful shutdown](#signals).

Now three modules for the Task API: a `store` that holds the data, a `tasks` module that needs the store, and an `http` module that needs the tasks. They are listed in the *wrong* order on purpose:

start-stop.tsNode.js only

```ts
import { buildRuntime, traceModule } from "./trace.js";

const runtime = buildRuntime([
  traceModule("http", ["tasks"]),
  traceModule("tasks", ["store"]),
  traceModule("store"),
]);

console.log("state:", runtime.state);
await runtime.start();
console.log("state:", runtime.state);
await runtime.stop();
console.log("state:", runtime.state);
```

Output of `npx tsx start-stop.ts`

```ts
state: created
initialize store
initialize tasks
initialize http
ready      store
ready      tasks
ready      http
state: running
shutdown   http
shutdown   tasks
shutdown   store
destroy    http
destroy    tasks
destroy    store
state: stopped
```

Read it from top to bottom:

- The runtime ignored the order of the list and followed the `dependencies`: `store`, then `tasks`, then `http`.
- Startup has two rounds. Every module is initialized before any module becomes ready. So when `http` becomes ready, it knows every other module has at least been initialized.
- Stopping runs the same order backwards, again in two rounds: all `onShutdown` hooks, then all `onDestroy` hooks.
- `runtime.state` went from `created` to `running` to `stopped`.

## Lifecycle states and events

The runtime is a **state machine**: at any moment it is in exactly one **state**, and it only moves between states along fixed paths. You read it from `runtime.state`:

| State | Meaning |
| --- | --- |
| `created` | Built, nothing has run yet. |
| `initializing` | Running the `onInitialize` hooks. |
| `initialized` | Every module has initialized. The runtime passes through this state on its way to `starting`. |
| `starting` | Running the `onReady` hooks. |
| `running` | Everything is up. |
| `stopping` | Running the `onShutdown` and `onDestroy` hooks. |
| `stopped` | Everything is down. A stopped runtime cannot be started again; create a new one. |
| `failed` | Something went wrong on the way up or down. This is not the end: you can still call `stop()` to clean up. |

Each change is also announced as an **event** on the event bus you passed in. Other parts of your program can listen without the runtime knowing about them. Here a listener prints the runtime events and the state at that moment:

events.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";
import { traceModule } from "./trace.js";

const eventBus = createEventBus();
const runtime = createRuntime(
  {
    modules: new Map([["store", traceModule("store")]]),
    logger: createLogger({ name: "task-api", level: LoggerLevel.FATAL }),
    container: createContainer(),
    eventBus,
  },
  { applicationName: "task-api", environment: "development", handleSignals: false },
);

const types = [
  "runtime.initializing",
  "runtime.initialized",
  "runtime.starting",
  "runtime.running",
  "runtime.stopping",
  "runtime.stopped",
] as const;
for (const type of types) {
  eventBus.on(type, (event) => console.log(`event ${event.type} (state: ${runtime.state})`));
}

await runtime.start();
await runtime.stop();
```

Output of `npx tsx events.ts`

```ts
event runtime.initializing (state: initializing)
initialize store
event runtime.initialized (state: initialized)
event runtime.starting (state: starting)
ready      store
event runtime.running (state: running)
event runtime.stopping (state: stopping)
shutdown   store
destroy    store
event runtime.stopped (state: stopped)
```

The two rounds of startup show up as states: every `onInitialize` runs while the state is `initializing`, and every `onReady` while it is `starting`.

There are also events for every module (`runtime.module.initializing`, `runtime.module.failed`, …) and for health changes. In later lessons, logging and monitoring code listens to them.

## The dependency graph

The `dependencies` lists form a **dependency graph**: an arrow from each module to every module it needs. The runtime sorts that graph so that every module comes after the modules it points to. That sorting is called a **topological sort**, and it is why the order in your list did not matter.

Two mistakes make sorting impossible, and the runtime refuses to start in both cases:

bad-graph.tsNode.js only

```ts
import { buildRuntime, traceModule } from "./trace.js";

const cycle = buildRuntime([
  traceModule("tasks", ["store"]),
  traceModule("store", ["tasks"]),
]);
try {
  await cycle.start();
} catch (error) {
  console.log((error as Error).name);
  console.log((error as Error).message);
}

const missing = buildRuntime([traceModule("tasks", ["database"])]);
try {
  await missing.start();
} catch (error) {
  console.log((error as Error).name);
  console.log((error as Error).message);
}
```

Output of `npx tsx bad-graph.ts`

```ts
RuntimeCircularDependencyError
Circular module dependency detected: tasks -> store -> tasks.
RuntimeDependencyError
Module "tasks" depends on "database" which is not registered.
```

- A **cycle** (`tasks` needs `store`, which needs `tasks`) has no valid first module. The error shows the whole loop, so you can see which link to remove.
- A **missing** dependency is usually a typo or a module you forgot to register.

No hook ran in either case: the runtime checks the whole graph before it touches any module. A mistake in the wiring shows up the first time you start the app, not hours later.

## Rollback when startup fails

Suppose the HTTP module cannot start because another program already uses its port. The store and the tasks module are already up. If the runtime simply gave up, the store's connection would stay open. Instead, it **rolls back**: it undoes what already happened, in reverse order.

rollback.tsNode.js only

```ts
import { RuntimeStartError } from "@zudojs/runtime";
import { buildRuntime, traceModule } from "./trace.js";

const http = {
  ...traceModule("http", ["tasks"]),
  onReady: () => {
    console.log("ready      http");
    throw new Error("Port 3000 is already in use");
  },
};

const runtime = buildRuntime([traceModule("store"), traceModule("tasks", ["store"]), http]);

try {
  await runtime.start();
} catch (error) {
  if (error instanceof RuntimeStartError) {
    console.log(error.message);
    console.log("phase:", error.phase);
    console.log("cause:", (error.cause as Error).message);
  }
}
console.log("state:", runtime.state);
```

Output of `npx tsx rollback.ts`

```ts
initialize store
initialize tasks
initialize http
ready      store
ready      tasks
ready      http
shutdown   tasks
shutdown   store
destroy    http
destroy    tasks
destroy    store
Module "http" failed during startup.
phase: start
cause: Port 3000 is already in use
state: failed
```

Look at which hooks ran after the failure:

- `onShutdown` ran only for `tasks` and `store`, the modules that had become ready. `http` never started, so there was nothing to shut down.
- `onDestroy` ran for all three, because all three had initialized and may hold resources.
- `start()` rejected with a `RuntimeStartError`. It says which `phase` failed (`initialize` or `start`), and the original error is in `cause`.

The state is now `failed`. A failed runtime can still be stopped: `await runtime.stop()` releases anything the rollback did not reach, and it is safe to call even when there is nothing left. In `src/server.ts` this means: if `runtime.start()` throws, log the error, call `runtime.stop()`, and exit with code 1 so the platform running your app knows it failed.

## Readiness and health

Hosting platforms ask a running app two questions:

- **Is it ready?** Can it take requests right now? If not, send traffic elsewhere for a while.
- **Is it healthy?** Is everything working as it should?

A **readiness check** is a function that returns `true` or `false`. You register it on the runtime, and `runtime.ready` and `runtime.health` are worked out from all the checks:

readiness.tsNode.js only

```ts
import { buildRuntime, traceModule } from "./trace.js";

let storeConnected = true;
const runtime = buildRuntime([traceModule("store")]);
runtime.registerReadinessCheck("store", () => storeConnected);

await runtime.start();
await runtime.runReadinessChecks();
console.log("ready:", runtime.ready, "health:", runtime.health.state);

storeConnected = false;
await runtime.runReadinessChecks();
console.log("ready:", runtime.ready, "health:", runtime.health.state);

await runtime.stop();
```

Output of `npx tsx readiness.ts`

```ts
initialize store
ready      store
ready: true health: healthy
ready: false health: degraded
shutdown   store
destroy    store
```

When the store lost its connection, the app kept running but reported itself **degraded**: still alive, not fully working.

REASON IT OUT

### Is a stopping app ready?

A deploy sends `SIGTERM`. The runtime starts to stop, and the store module needs a few seconds to finish its work. Meanwhile the load balancer asks `/health` again, and the store's readiness check still returns `true`. Before running the next example, decide: should the answer be "ready"? What does a wrong "ready" cost, and what does a wrong "not ready" cost? Which facts must a readiness answer combine?

**Show the reasoning**

- No. A stopping app is about to close its connections. Every request the load balancer sends it now may fail halfway.
- A wrong "ready" costs failed user requests during every deploy. A wrong "not ready" for a moment costs almost nothing: the load balancer uses the other instances.
- So readiness must combine two facts: the runtime is `running`, *and* every check passes. A check only knows about its own part; it cannot know that the whole app is shutting down.

Here is a probe that arrives during `stop()`, with the check still passing:

readiness-stop.tsNode.js only

```ts
import { buildRuntime, traceModule } from "./trace.js";

const store = {
  ...traceModule("store"),
  onShutdown: async () => {
    console.log("shutdown   store (finishing its work)");
    await new Promise((resolve) => setTimeout(resolve, 50));
  },
};
const runtime = buildRuntime([store]);
runtime.registerReadinessCheck("store", () => true);

await runtime.start();
const stopping = runtime.stop();
await runtime.runReadinessChecks(); // a /health probe arrives during shutdown
console.log("state:", runtime.state, "| runtime.ready:", runtime.ready);
console.log("safe answer:", runtime.state === "running" && runtime.ready);
await stopping;
console.log("state:", runtime.state, "| runtime.ready:", runtime.ready);
```

Output of `npx tsx readiness-stop.ts`

```ts
initialize store
ready      store
shutdown   store (finishing its work)
state: stopping | runtime.ready: true
safe answer: false
destroy    store
state: stopped | runtime.ready: true
```

Look at `runtime.ready`. In the published `@zudojs/runtime`, running the checks while the runtime stops sets `ready` back to `true`, and it stays `true` after the runtime has stopped. So never answer a probe from `runtime.ready` alone: combine it with `runtime.state === "running"`, as the "safe answer" line does. The generated project is protected twice: `src/app.ts` registers a check called `modules` that returns `runtime.state === "running"`, and the `health` function in `src/server.ts` checks `runtime.state` itself. At the [end of this lesson](#task-api), `/health` reports every readiness check and keeps that state check.

## Signals and graceful shutdown

When a hosting platform wants your app to stop, for example to deploy a new version, it sends the process a **signal** called `SIGTERM`. Pressing Ctrl + C in a terminal sends `SIGINT`. By default, Node.js ends the process immediately. Any request being answered is cut off, and any data not yet saved is lost.

A **graceful shutdown** does better: stop accepting new work, finish the work in progress, close connections, then exit. With `handleSignals: true` (the default), the runtime listens for both signals and runs `stop()` for you. This example sends `SIGTERM` to its own process to show it:

signal.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";

let listener: NodeJS.Timeout | undefined;

const http: Module = {
  id: "http",
  name: "http",
  onReady: () => {
    listener = setInterval(() => {}, 1000);
    console.log("http: accepting requests");
  },
  onShutdown: async () => {
    console.log("http: finishing requests in progress...");
    await new Promise((resolve) => setTimeout(resolve, 100));
    clearInterval(listener);
    console.log("http: closed");
  },
};

const runtime = createRuntime(
  {
    modules: new Map([["http", http]]),
    logger: createLogger({ name: "task-api", level: LoggerLevel.FATAL }),
    container: createContainer(),
    eventBus: createEventBus(),
  },
  { applicationName: "task-api", environment: "development", handleSignals: true },
);

process.on("exit", (code) => console.log(`process exits with code ${code}, state: ${runtime.state}`));

await runtime.start();
process.kill(process.pid, "SIGTERM");
```

Output of `npx tsx signal.ts`

```ts
http: accepting requests
http: finishing requests in progress...
http: closed
process exits with code 0, state: stopped
```

The `setInterval` stands in for a real server's open network socket. As long as something like that is open, Node.js keeps the process running. `onShutdown` closes it, the way a real HTTP module closes its server.

The signal did not kill the process. The runtime caught it, waited for the `onShutdown` hook to finish its 100 ms of work, and ran `stop()` to the end. The runtime does not call `process.exit()` itself: once the last open handle was closed, Node.js ended the process on its own, with code 0. A second `SIGTERM` during shutdown exits at once, in case shutdown hangs, and `shutdownTimeout` (30 seconds by default) puts an upper limit on the whole thing.

Why does the generated `src/app.ts` pass `handleSignals: false`? Because the HTTP server in `src/server.ts` is not a module. `server.ts` handles the signals itself so it can stop things in the right order: first `server.stop()` (no new requests, finish the current ones), then `runtime.stop()` (close everything the requests used). If both listened, they would race each other. You will see the server side of this in [Middleware, CORS, security headers and graceful shutdown](https://zudojs.oyinlola.site/learn/zudo-middleware).

## Application options and module context

The second argument of `createRuntime` describes the application. These are the options you will use most:

| Option | Default | What it does |
| --- | --- | --- |
| `applicationName` | required | Name used in logs and events. |
| `environment` | required | `"development"`, `"test"` or `"production"`. The generated app reads it from `NODE_ENV` with `resolveEnvironment()`. |
| `applicationVersion` | `"0.1.0"` | Your app's version. |
| `handleSignals` | `true` | Stop gracefully on `SIGTERM` and `SIGINT`. |
| `startupTimeout` / `shutdownTimeout` | 60000 / 30000 | Longest time, in milliseconds, that starting or stopping may take. |
| `disposeContainerOnStop` | `false` | You created the container, so by default you own it and `stop()` leaves it alone. Set `true` to let `stop()` also clean up (dispose) the container after every module has stopped. [Dependency injection with @zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container) covers the container. |

Everything about the running application is available as `runtime.context`. And each hook receives a **module context** (`ModuleContext`) with the module's own information and the runtime's `logger`. Modules are usually classes that extend `BaseModule` from `@zudojs/core`, like the generated `AppModule`. The `options` you give `BaseModule` come back in `context.options`:

context.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import { BaseModule } from "@zudojs/core";
import type { ModuleContext } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";

class StoreModule extends BaseModule {
  public readonly id = "store";
  public readonly name = "Task store";

  public constructor() {
    super({ version: "0.1.0", options: { maxTasks: 500 } });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    console.log(`${context.name} v${context.version}, options:`, context.options);
  }
}

const runtime = createRuntime(
  {
    modules: new Map([["store", new StoreModule()]]),
    logger: createLogger({ name: "task-api", level: LoggerLevel.FATAL }),
    container: createContainer(),
    eventBus: createEventBus(),
  },
  { applicationName: "task-api", applicationVersion: "0.1.0", environment: "development", handleSignals: false },
);

await runtime.start();
const { applicationName, applicationVersion, environment, runtimeId } = runtime.context;
console.log(applicationName, applicationVersion, environment, runtimeId);
await runtime.stop();
```

Output of `npx tsx context.ts`

```ts
Task store v0.1.0, options: { maxTasks: 500 }
task-api 0.1.0 development rt_c8a25a1c1f0e4d7ab4a6d1a9e8a0c3b2
```

The `runtimeId` is new on every run. It lets you tell apart two copies of the same app in logs.

> TIP
>
> `createApplication` from [the core lesson](https://zudojs.oyinlola.site/learn/zudo-core#application) builds the container, logger and runtime for you in one call. The CLI uses `@zudojs/runtime` directly instead, so you can see and change every piece in `src/app.ts`.

## Smaller parts: @zudojs/lifecycle

The runtime manages the big pieces of your app. When one module owns several smaller parts, such as a connection pool, a cache and a mail sender, `@zudojs/lifecycle` applies the same ideas one level down, to plain objects called **components**, and adds what small parts need most: retries for slow dependencies, time limits, optional parts and priorities. It is not among the generated project's dependencies. The next lesson, [Components with @zudojs/lifecycle](https://zudojs.oyinlola.site/learn/zudo-lifecycle), covers it in depth.

## Put it in the Task API

Open `src/app.ts`. The runtime it builds already has two modules: `integrations`, which starts the outside connections listed in `src/integrations/` (none yet), and `app`, a placeholder `AppModule` that only logs "app module initialized". You will replace the placeholder with two real modules.

First, somewhere to keep tasks. For now it is a `Map` in memory (the [database lesson](https://zudojs.oyinlola.site/learn/zudo-database) replaces it with PostgreSQL). Code that stores data goes in `src/repositories/`, next to the example resource's `examples.repository.ts`. Create `src/repositories/tasks.store.ts`:

src/repositories/tasks.store.tsNode.js only

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

The `store` module "connects" it when the app starts and clears it when the app stops. Create `src/modules/store.module.ts`, next to the generated `app.module.ts`:

src/modules/store.module.tsNode.js only

```ts
import { BaseModule } from "@zudojs/core";
import type { ModuleContext } from "@zudojs/core";
import type { TaskStore } from "../repositories/tasks.store.js";

export class StoreModule extends BaseModule {
  public readonly id = "store";
  public readonly name = "store";

  public constructor(private readonly store: TaskStore) {
    super({ version: "0.1.0" });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    this.store.connected = true;
    context.logger.info("store connected");
  }

  public override async onDestroy(context: ModuleContext): Promise<void> {
    this.store.tasks.clear();
    this.store.connected = false;
    context.logger.info("store closed");
  }
}
```

Then `src/modules/tasks.module.ts`. It adds one example task at startup. Its `dependencies` list is what guarantees the store is connected before `onInitialize` runs:

src/modules/tasks.module.tsNode.js only

```ts
import { BaseModule } from "@zudojs/core";
import type { ModuleContext } from "@zudojs/core";
import type { TaskStore } from "../repositories/tasks.store.js";

export class TasksModule extends BaseModule {
  public readonly id = "tasks";
  public readonly name = "tasks";

  public constructor(private readonly store: TaskStore) {
    super({ version: "0.1.0", dependencies: ["store"] });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    if (!this.store.connected) {
      throw new Error("The task store is not connected");
    }
    const id = this.store.nextId();
    this.store.tasks.set(id, {
      id,
      title: "Read the runtime lesson",
      done: true,
      priority: "normal",
      createdAt: "2026-09-23T09:00:00.000Z",
    });
    context.logger.info(`tasks ready, ${this.store.tasks.size} in store`);
  }
}
```

The two new modules replace the placeholder. Delete `src/modules/app.module.ts` and `src/services/app.service.ts`, empty `src/services/index.ts` (the container lesson puts the task service in that folder), and make `src/modules/index.ts` export the new modules instead:

src/modules/index.tsNode.js only

```ts
export { StoreModule } from "./store.module.js";
export { TasksModule } from "./tasks.module.js";
```

Now change `src/app.ts`. It needs four edits: import the new modules and `TaskStore` instead of `AppModule`, create one `TaskStore`, put the two modules in the list where `new AppModule()` was, and register a readiness check for the store. Both modules receive the same store object, and the order in the list no longer matters. This is the whole file afterwards:

src/app.tsNode.js only

```ts
import type { Server } from "node:http";

import { resolveEnvironment } from "@zudojs/constants";
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger } from "@zudojs/logger";
import { createRuntime, type Runtime } from "@zudojs/runtime";

import type { AppConfig } from "./configs/index.js";
import { IntegrationsModule, integrations } from "./integrations/index.js";
import { StoreModule, TasksModule } from "./modules/index.js";
import { TaskStore } from "./repositories/tasks.store.js";

/** What {@link createApp} needs. */
export interface AppOptions {
  readonly config: AppConfig;
  /** The Node HTTP server, for integrations that attach to it. */
  readonly httpServer?: Server;
}

/**
 * Assembles the application runtime.
 *
 * `createRuntime` takes two arguments: the dependencies the runtime and its
 * modules share, and the options describing this application. Integrations
 * (`src/integrations`) are registered first so they start before, and stop
 * after, every other module.
 */
export function createApp(options: AppOptions): Runtime {
  const logger = createLogger({ name: "task-api" });
  const container = createContainer();
  const eventBus = createEventBus();
  const store = new TaskStore();

  const modules = new Map<string, Module>();
  const integrationsModule = new IntegrationsModule(integrations, {
    config: options.config,
    ...(options.httpServer === undefined ? {} : { httpServer: options.httpServer }),
  });
  modules.set(integrationsModule.id, integrationsModule);
  for (const module of [
    new TasksModule(store),
    new StoreModule(store),
  ] as Module[]) {
    modules.set(module.id, module);
  }

  const runtime = createRuntime(
    { modules, logger, container, eventBus },
    {
      applicationName: "task-api",
      applicationVersion: "0.1.0",
      // NODE_ENV is read the same way the framework reads it: `prod` and
      // `Production` are production, an unknown value warns once.
      environment: resolveEnvironment(),
      // Signals are handled explicitly in server.ts.
      handleSignals: false,
    },
  );

  runtime.registerReadinessCheck("modules", () => runtime.state === "running");
  runtime.registerReadinessCheck("store", () => store.connected);

  return runtime;
}
```

The readiness check does nothing yet, because nothing asks for it. The generated `/health` route gets its answer from a `health` function in `src/server.ts`, which only looks at `runtime.state` and the integrations. Change that function so it also runs the readiness checks and reports each one. `runtime.readiness.checks` holds the result of every check by name:

src/server.ts (part)Node.js only

```ts
const router = createRouter();
registerRoutes(
  router,
  createDependencies({
    health: async () => {
      const checks = await checkIntegrations(integrations);
      await runtime.runReadinessChecks();
      for (const [name, check] of runtime.readiness.checks) {
        checks[name] = check.ready ? "up" : "down";
      }
      const ready =
        runtime.state === "running" && runtime.ready && Object.values(checks).every((check) => check === "up");
      return { ready, checks };
    },
  }),
);
```

`runtime.ready` is `false` as soon as one check fails, and the explicit `runtime.state === "running"` stays, for the reason shown in [Readiness and health](#readiness). So `/health` answers 503 while the app starts or stops, and also if the store ever loses its connection. Check the types, then start the server:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npm run dev

> task-api@0.1.0 dev
> tsx watch src/server.ts

2026-09-23T22:23:31.514Z [INFO] [task-api] store connected
2026-09-23T22:23:31.518Z [INFO] [task-api] tasks ready, 1 in store
2026-09-23T22:23:31.519Z [INFO] [task-api] All modules initialized. modules=["integrations","store","tasks"] durationMs=9
2026-09-23T22:23:31.522Z [INFO] [task-api] All modules started. modules=["integrations","store","tasks"] durationMs=1
2026-09-23T22:23:31.524Z [INFO] [task-api] Runtime is ready. runtimeId=rt_15d4982e51b343acb272b1c1435e624d environment=development
Listening on http://0.0.0.0:3000
```

`tsc` printed nothing, so the project still type-checks. Your times and `runtimeId` will differ. `integrations` comes first because `src/app.ts` registers it first and nothing depends on it; then the store, then the tasks module, because of the dependency. In a second terminal, ask for the health report:

Second terminal

```bash
$ curl http://localhost:3000/health
{"status":"ok","checks":{"modules":"up","store":"up"},"timestamp":"2026-09-23T22:23:32.301Z"}
```

Both readiness checks are listed. Now press Ctrl + C in the server's terminal and read the order on the way out:

Terminal on your computer

```ts
^CReceived SIGINT: shutting down.
2026-09-23T22:23:32.617Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
2026-09-23T22:23:32.618Z [INFO] [task-api] All modules stopped. modules=["tasks","store","integrations"] durationMs=0
2026-09-23T22:23:32.619Z [INFO] [task-api] store closed
2026-09-23T22:23:32.619Z [INFO] [task-api] All modules destroyed. durationMs=0
2026-09-23T22:23:32.620Z [INFO] [task-api] Graceful shutdown complete.
2026-09-23T22:23:32.621Z [INFO] [task-api] Runtime stopped. runtimeId=rt_15d4982e51b343acb272b1c1435e624d
```

The first line comes from the signal handler in `src/server.ts`, before it stops the HTTP server and then the runtime. The modules stopped in reverse order. "store closed" comes after "All modules stopped", because the store module does its work in `onDestroy`, the second round of stopping.

## Practice

TRY IT YOURSELF

### Add a mailer module

Using `traceModule` and `buildRuntime` from this lesson, add a `mailer` module that needs `tasks`, next to `http`, which also needs `tasks`. Before running it, write down the order you expect for all four rounds of hooks. Then run it.

**Show a solution**

mailer.tsNode.js only

```ts
import { buildRuntime, traceModule } from "./trace.js";

const runtime = buildRuntime([
  traceModule("mailer", ["tasks"]),
  traceModule("http", ["tasks"]),
  traceModule("tasks", ["store"]),
  traceModule("store"),
]);
await runtime.start();
await runtime.stop();
```

Output of `npx tsx mailer.ts`

```ts
initialize store
initialize tasks
initialize mailer
initialize http
ready      store
ready      tasks
ready      mailer
ready      http
shutdown   http
shutdown   mailer
shutdown   tasks
shutdown   store
destroy    http
destroy    mailer
destroy    tasks
destroy    store
```

`mailer` and `http` do not depend on each other, so either may come first. The runtime keeps the order you listed them in, and stops them in exactly the reverse order.

TRY IT YOURSELF

### A failing initialization

Make the `tasks` module throw `new Error("Schema is out of date")` in `onInitialize`. Which hooks run, what is the error's `phase`, and why does `onShutdown` run for no module at all?

**Show a solution**

init-fail.tsNode.js only

```ts
import { RuntimeStartError } from "@zudojs/runtime";
import { buildRuntime, traceModule } from "./trace.js";

const tasks = {
  ...traceModule("tasks", ["store"]),
  onInitialize: () => {
    console.log("initialize tasks");
    throw new Error("Schema is out of date");
  },
};

const runtime = buildRuntime([traceModule("store"), tasks, traceModule("http", ["tasks"])]);
try {
  await runtime.start();
} catch (error) {
  if (error instanceof RuntimeStartError) {
    console.log(error.phase, "-", (error.cause as Error).message);
  }
}
```

Output of `npx tsx init-fail.ts`

```ts
initialize store
initialize tasks
destroy    tasks
destroy    store
initialize - Schema is out of date
```

The failure happened in the first round, so no module ever became ready and there is nothing to shut down. `http` was never initialized, so it is not destroyed either. `tasks` is destroyed even though its `onInitialize` failed halfway: it may have opened something before throwing, so its `onDestroy` must cope with a half-initialized state.

The error itself is a `RuntimeInitializationError`, a kind of `RuntimeStartError`, so the `instanceof RuntimeStartError` check matches it too.

TRY IT YOURSELF

### Stop on failure

In the Task API, `src/server.ts` calls `await runtime.start()` without a `try`, just before it creates the HTTP server. Change it so that a failed start logs the error, calls `runtime.stop()` and exits with code 1.

**Show a solution**

src/server.ts (part)Node.js only

```ts
try {
  await runtime.start();
} catch (error) {
  console.error("Startup failed:", error);
  await runtime.stop();
  process.exit(1);
}
```

Exit code 1 tells Docker, systemd or your hosting platform that the app did not start, so it can restart it or alert you. Exiting with 0 would report success.

## Recap

- The runtime starts **modules** in dependency order, in two rounds (`onInitialize`, then `onReady`), and stops them in reverse (`onShutdown`, then `onDestroy`).
- `runtime.state` moves from `created` to `running` to `stopped`, or to `failed`. Every change is also an event on the event bus.
- Cycles and missing dependencies are refused before any hook runs.
- A failed start rolls back what already ran and rejects with `RuntimeStartError`, with the original error as `cause`.
- Readiness checks decide `runtime.ready` and `runtime.health`. A probe must also require `runtime.state === "running"`: running the checks during `stop()` sets `ready` back to `true`.
- Graceful shutdown turns `SIGTERM` into an orderly stop. In the Task API, `server.ts` stops the HTTP server first, then the runtime.

The modules in this lesson passed the `TaskStore` to each other through their constructors. With two modules that is fine; [Dependency injection with @zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container) lets a container build and share objects like it. First, the smaller parts inside a module: next, [Components with @zudojs/lifecycle](https://zudojs.oyinlola.site/learn/zudo-lifecycle).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
