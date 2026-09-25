---
title: "The core: applications, modules and context — ZudoJS Academy"
description: "Build an application with @zudojs/core, compose it from modules, and carry each request's identity through async code with the execution context."
source: https://zudojs.oyinlola.site/learn/zudo-core
---

LEVEL 12 · LESSON 6 OF 19

Core, runtime and lifecycle Core

# The core: applications, modules and context

Build an application with @zudojs/core, compose it from modules, and carry each request's identity through async code with the execution context.

- **50 min** to read and try
- **You need:** "Anatomy of a ZudoJS project", and async/await from "Asynchronous JavaScript"
- **You build:** A shop application of three modules with per-request correlation ids in every log line, a request-scoped cart, and background jobs that keep their request's context

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what @zudojs/core provides and how it relates to @zudojs/runtime and @zudojs/lifecycle
- Build, start, stop and restart an application from module definitions with createApplication
- Use a module's context for configuration, declared dependencies and the application container
- Carry a correlation id and typed values through async code with ContextStorage, and across a job queue with snapshots
- Test an application without real signals, and recover from a failed start

## Two problems every backend meets

Your shop backend has a transfer endpoint. Two customers press "Send" at the same moment: one sends ₦15,000, the other ₦2,500. Each transfer logs what it does. This is the log:

interleaved.tsNode.js only

```ts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function debit(account: string, amount: number) {
  await sleep(amount > 10_000 ? 80 : 20); // the big transfer needs a fraud check
  console.log(`debited ${account} ₦${amount}`);
}
async function credit(account: string, amount: number) {
  await sleep(100);
  console.log(`credited ${account} ₦${amount}`);
}
async function transfer(from: string, to: string, amount: number) {
  console.log("transfer started");
  await debit(from, amount);
  await credit(to, amount);
}

await Promise.all([transfer("ACC-1", "ACC-2", 15_000), transfer("ACC-3", "ACC-4", 2_500)]);
```

Output of `npx tsx interleaved.ts`

```ts
transfer started
transfer started
debited ACC-3 ₦2500
debited ACC-1 ₦15000
credited ACC-4 ₦2500
credited ACC-2 ₦15000
```

Which "transfer started" belongs to which transfer? Here you can guess from the amounts. In a real log with hundreds of requests per second, you cannot. The usual fix is to give every request an id and pass it to every function, which means changing every signature in the code base, and one forgotten parameter breaks the chain.

The second problem shows up before the first request. A backend needs configuration, a logger, a place to register shared objects, and a set of parts (payments, orders, inventory) that start in the right order and stop cleanly. Written by hand, that start-up code grows in every project, slightly differently each time.

`@zudojs/core` answers both. It is the **kernel** of ZudoJS: the module contract every ZudoJS part implements, an **application** object that wires the standard pieces together, and an **execution context** that follows a request through asynchronous code without being passed by hand.

## Where the core sits

Three packages deal with starting and stopping things, and their names overlap, so it helps to see them side by side before writing code:

```ts
 @zudojs/core ─────────────── the kernel (depends only on errors and constants)
   Module, BaseModule, ModuleContext     the contract every part implements
   ContextStorage, ExecutionContext      request identity across async code
   createApplication, Application        a complete, self-contained stack:
     its own Container, ConsoleLogger,     container, config, logger, module
     ConfigurationManager, runtime         loader and runtime, wired for you

 @zudojs/runtime ──────────── orchestrates core Modules, using the separate
   createRuntime(services, options)      @zudojs/container, logger and events
                                         packages (what `zudojs create` uses)

 @zudojs/lifecycle ─────────── stands alone: plain components with
   createLifecycleManager()              start/stop, priorities, retries, timeouts
```

Core defines the module contract and the execution context; runtime and core's own application both run modules; lifecycle manages smaller components.

In practice:

- A project made by `zudojs create` uses `@zudojs/runtime` (you saw `createRuntime` in `src/app.ts`). Its modules still extend `BaseModule` from the core.
- `createApplication` from the core builds everything in one call, including its own dependency container, logger and configuration. Those are the core's small built-in versions, not the separate `@zudojs/container`, `@zudojs/logger` and `@zudojs/config` packages.
- `@zudojs/lifecycle` manages the smaller parts inside a module, like a connection pool and a cache. It has [its own lesson](https://zudojs.oyinlola.site/learn/zudo-lifecycle).

> SAME NAMES, DIFFERENT THINGS
>
> The core exports a `createRuntime`, a `Container`, a `Lifecycle` and a `LifecycleManager`. `@zudojs/runtime`, `@zudojs/container` and `@zudojs/lifecycle` export things with the same names that work differently. Always check which package an import comes from. This lesson uses only the core's `createApplication`; the next lesson covers `@zudojs/runtime`.

## Modules: the contract

A **module** is an independently managed part of the application: orders, payments, inventory. The core defines what a module is: an object with an `id`, a `name`, an optional `version`, the ids of the modules it depends on (`dependencies`), and up to four **hooks**, functions called at fixed moments: `onInitialize` and `onReady` on the way up, `onShutdown` and `onDestroy` on the way down. [The runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime) shows in detail when each hook runs.

There are three ways to write one, all in this file:

modules.tsNode.js only

```ts
import { BaseModule, createModule, defineModule } from "@zudojs/core";
import type { Module, ModuleContext } from "@zudojs/core";

// 1. A class that extends BaseModule: the shape the CLI generates.
export class InventoryModule extends BaseModule {
  public readonly id = "inventory";
  public readonly name = "Inventory";
  private readonly stock = new Map<string, number>();

  public constructor() {
    super({ version: "1.0.0", options: { lowStockAt: 5 } });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    this.stock.set("RICE-5KG", 40);
    console.log(`  ${context.name}: ${this.stock.size} product loaded, warn below ${String(context.options.lowStockAt)}`);
  }
}

// 2. A plain object checked by createModule: good for small modules.
export function traced(id: string, dependencies: string[] = []): Module {
  return createModule({
    id,
    name: id,
    dependencies,
    onInitialize: () => console.log(`  initialize ${id}`),
    onReady: () => console.log(`  ready      ${id}`),
    onShutdown: () => console.log(`  shutdown   ${id}`),
    onDestroy: () => console.log(`  destroy    ${id}`),
  });
}

// 3. A definition: describes a module and how to build it, without building it.
export const ordersDefinition = defineModule({
  id: "orders",
  name: "orders",
  dependencies: ["inventory"],
  factory: () => traced("orders", ["inventory"]),
  metadata: { category: "domain", tags: ["shop"] },
});
```

- **A class extending `BaseModule`**, the style `zudojs generate module` writes. The `options` given to `super` come back in `context.options`.
- **`createModule(object)`** checks a plain object and returns it as a `Module`. Good for small modules and tests.
- **`defineModule(...)`** makes a **definition**: a frozen description of a module plus a `factory` that builds it. Nothing is built yet. Definitions let the application decide *when* to build a module, and build it again after a restart.

## createApplication: start-up in one call

`createApplication` takes module definitions and wires a configuration manager, a logger, a container, a module registry and loader, and a runtime. It returns an `Application` that is already **initialized**. Here the definitions are listed in the wrong order on purpose:

app.tsNode.js only

```ts
import { createApplication, defineModule, isModule } from "@zudojs/core";
import { InventoryModule, ordersDefinition, traced } from "./modules.js";

console.log(isModule(new InventoryModule()), isModule({ id: "x" }), Object.isFrozen(ordersDefinition), ordersDefinition.dependencies);

const app = await createApplication({
  modules: [
    defineModule({ id: "payments", name: "payments", dependencies: ["orders"], factory: () => traced("payments", ["orders"]) }),
    ordersDefinition,
    defineModule({ id: "inventory", name: "Inventory", factory: () => new InventoryModule() }),
  ],
  logger: { level: "fatal" },
  runtime: { name: "shop-api", signals: { handleSigint: false, handleSigterm: false } },
});

console.log("after createApplication:", app.state);
await app.start();
console.log("after start:", app.state);
await app.stop();
console.log("after stop:", app.state);
```

Output of `npx tsx app.ts`

```ts
true false true [ { id: 'inventory', optional: false } ]
after createApplication: initialized
  Inventory: 1 product loaded, warn below 5
  initialize orders
  initialize payments
  ready      orders
  ready      payments
after start: running
  shutdown   payments
  shutdown   orders
  destroy    payments
  destroy    orders
after stop: stopped
```

What happened:

- `isModule` accepted the class instance and refused `{ id: "x" }`, which has no name. Definitions are frozen, and their dependencies are normalised to objects with an `optional` flag.
- `createApplication` returned in the state `initialized`. No module was built yet.
- `start()` built each module from its factory and ran the hooks in dependency order: inventory, then orders, then payments, whatever the order of the list. Every `onInitialize` ran before any `onReady`.
- `stop()` ran the same order backwards.

Two options keep this example quiet. `logger: { level: "fatal" }` hides the application's own log lines. `signals: { handleSigint: false, handleSigterm: false }` stops the runtime from listening for Ctrl + C, which it does by default. You will see both again in [Testing an application](#testing).

### The application states

`app.state` is one of `created`, `initializing`, `initialized`, `starting`, `running`, `stopping`, `stopped` and `failed`. Four methods move it:

| Method | What it does |
| --- | --- |
| `initialize()` | Initializes the application-level participants. `createApplication` calls it for you. |
| `start()` | Starts the participants, then the runtime and its modules. Allowed from `initialized` and `stopped`. |
| `stop()` | Stops the runtime, then the participants. The application can be started again. |
| `shutdown()` | Stops, then releases the participants for good. No restart after this. |

**Participants** are application-level parts that are not modules, such as a metrics exporter: objects with a `name` and optional `initialize`, `start`, `stop` and `dispose` methods, passed as `participants: [...]`. You will meet one in [When start fails](#failures).

## What a module can reach

Every hook receives a **module context** (`ModuleContext`): the module's own details plus a few carefully chosen capabilities. It is deliberately narrower than "everything in the application", so a module cannot reach into parts it has no business with.

REASON IT OUT

### What should a module be allowed to see?

The orders module needs the inventory module. It does not need the payments module. Before reading on, decide:

- Should `orders` be able to look up `payments` anyway, because it is registered in the same application?
- What is the risk if any module can reach any other module?
- Where should settings such as "maximum items per order" come from: the module's code, or somewhere outside it?

**Show the reasoning**

- No. If `orders` can reach `payments` without declaring it, the dependency graph lies: the runtime might start `payments` *after* `orders`, and `orders` would see it half-initialized. Declared dependencies are what the start order is computed from, so they must be the only way in.
- Hidden coupling. Every undeclared reach is a dependency nobody can see in the module list, so removing or replacing a module breaks code in unexpected places.
- From configuration outside the code, so the same module runs with different limits in development and production. The context gives read access to it.

The core enforces exactly that:

module-context.tsNode.js only

```ts
import {
  BaseModule,
  createApplication,
  createConfigurationManager,
  createConfigurationSource,
  createToken,
  defineModule,
  getDefaultContextStorage,
} from "@zudojs/core";
import type { ModuleContext } from "@zudojs/core";

interface Clock {
  now(): string;
}
const CLOCK = createToken<Clock>("Clock");

class InventoryModule extends BaseModule {
  public readonly id = "inventory";
  public readonly name = "Inventory";
  public constructor() {
    super({ version: "1.2.0" });
  }
}

class OrdersModule extends BaseModule {
  public readonly id = "orders";
  public readonly name = "Orders";
  public constructor() {
    super({ dependencies: ["inventory"] });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    const execution = getDefaultContextStorage().get();
    console.log("running as:", execution?.operation, "for module", execution?.module);
    console.log("max items per order:", context.getConfig<number>("orders.maxItems"));
    console.log("currency:", context.requireConfig<string>("shop.currency"));
    console.log("inventory version:", context.getModuleContext("inventory")?.version);
    console.log("sees payments?", context.hasModule("payments"));
    try {
      context.getModuleContext("payments");
    } catch (error) {
      console.log(`${(error as Error).name}: ${(error as Error).message}`);
    }
    const clock = context.application.getContainer().resolve(CLOCK);
    console.log("clock says:", clock.now());
  }
}

class PaymentsModule extends BaseModule {
  public readonly id = "payments";
  public readonly name = "Payments";
  public constructor() {
    super({});
  }
}

const configuration = createConfigurationManager({
  loaderOptions: {
    sources: [
      createConfigurationSource({
        name: "defaults",
        type: "default",
        load: async () => [
          { path: "orders.maxItems", value: 50 },
          { path: "shop.currency", value: "NGN" },
        ],
      }),
    ],
  },
});

const app = await createApplication({
  modules: [
    defineModule({ id: "inventory", name: "Inventory", factory: () => new InventoryModule() }),
    defineModule({ id: "orders", name: "Orders", dependencies: ["inventory"], factory: () => new OrdersModule() }),
    defineModule({ id: "payments", name: "Payments", factory: () => new PaymentsModule() }),
  ],
  configuration,
  logger: { level: "fatal" },
  runtime: { name: "shop-api", signals: { handleSigint: false, handleSigterm: false } },
});
app.applicationContext?.getContainer().register(CLOCK, { useValue: { now: () => "2026-09-24T09:00:00.000Z" } });

await app.start();
await app.stop();
```

Output of `npx tsx module-context.ts`

```ts
running as: onInitialize for module orders
max items per order: 50
currency: NGN
inventory version: 1.2.0
sees payments? false
MissingModuleDependencyError: Module "orders" requires missing module "payments".
clock says: 2026-09-24T09:00:00.000Z
```

- `getConfig` returns a setting or `undefined`; `requireConfig` throws when it is missing. The settings come from a configuration source, here a small one that returns defaults.
- `getModuleContext("inventory")` works because `orders` declares it. `hasModule("payments")` answers `false` even though `payments` is registered, and `getModuleContext("payments")` throws `MissingModuleDependencyError`.
- `context.application` is the **application context**: `getContainer()`, `getConfiguration()`, `getModules()`, `getLogger()` and `getContextStorage()`.
- `createToken<Clock>("Clock")` and `register(token, { useValue })` belong to the core's own small container. It supports `useValue`, `useFactory` and `useClass` providers. The [dependency injection lesson](https://zudojs.oyinlola.site/learn/zudo-container) uses the fuller `@zudojs/container`.

The error message deserves a remark: "requires missing module" sounds as if `payments` were not registered. It is registered; `orders` just did not declare it. When you see this error, check the `dependencies` list first.

The first line of the output comes from somewhere else: `getDefaultContextStorage().get()`. It says the hook ran as operation `onInitialize` for module `orders`. That is the execution context, the answer to the first problem of this lesson.

## The execution context

An **execution context** describes one unit of work: an HTTP request, a message being handled, a background job, a command-line command. It is a frozen object with an `executionId` and optional fields such as `correlationId` (an id shared by related work, often sent by the client), `principalId` (who is acting), `operation`, `transport`, tracing ids and `metadata`.

The trick is where it is kept. `ContextStorage` is built on Node.js's `AsyncLocalStorage`: `storage.run(context, callback)` makes `context` the current one for the callback *and for every piece of asynchronous work the callback starts*: awaited promises, timers, callbacks. Any function, however deep, can ask `storage.get()`. Here is the transfer example again, with only the entry point and the log function changed:

with-context.tsNode.js only

```ts
import { createContextStorage, createExecutionContext } from "@zudojs/core";

const storage = createContextStorage();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message: string) {
  const id = storage.get()?.correlationId ?? "-";
  console.log(`[${id}] ${message}`);
}

async function debit(account: string, amount: number) {
  await sleep(amount > 10_000 ? 80 : 20); // the big transfer needs a fraud check
  log(`debited ${account} ₦${amount}`);
}
async function credit(account: string, amount: number) {
  await sleep(100);
  log(`credited ${account} ₦${amount}`);
}
async function transfer(from: string, to: string, amount: number) {
  log("transfer started");
  await debit(from, amount);
  await credit(to, amount);
}

function handleRequest(requestId: string, from: string, to: string, amount: number) {
  const context = createExecutionContext({ correlationId: requestId, transport: "http", operation: "POST /transfers" });
  return storage.run(context, () => transfer(from, to, amount));
}

await Promise.all([handleRequest("req-41", "ACC-1", "ACC-2", 15_000), handleRequest("req-42", "ACC-3", "ACC-4", 2_500)]);
log("all done");
```

Output of `npx tsx with-context.ts`

```json
[req-41] transfer started
[req-42] transfer started
[req-42] debited ACC-3 ₦2500
[req-41] debited ACC-1 ₦15000
[req-42] credited ACC-4 ₦2500
[req-41] credited ACC-2 ₦15000
[-] all done
```

`debit`, `credit` and `transfer` did not change their parameters, yet every line knows its request. The two transfers ran interleaved, and each kept its own context. Outside any `run`, `get()` returns `undefined`, hence `[-]`.

### How far does it reach?

propagation.tsNode.js only

```ts
import { createContextStorage, createExecutionContext } from "@zudojs/core";

const storage = createContextStorage();
const where = (label: string) => console.log(label.padEnd(24), storage.get()?.correlationId ?? "(no context)");

const request = createExecutionContext({ correlationId: "req-7", principalId: "user_42", operation: "POST /orders" });
console.log(typeof request.executionId, request.executionId.length, Object.isFrozen(request), request.metadata);

where("before run");
await storage.run(request, async () => {
  where("inside run");
  await new Promise((resolve) => setTimeout(resolve, 5));
  where("after a timer");
  await Promise.all([1, 2].map(async (n) => where(`parallel branch ${n}`)));
  queueMicrotask(() => where("queued microtask"));
  await null;
  await storage.runDerived({ operation: "reserve-stock", metadata: { sku: "RICE-5KG" } }, async () => {
    const derived = storage.require();
    console.log("derived:", derived.correlationId, derived.operation, derived.metadata, derived.executionId === request.executionId);
  });
  storage.runWithoutContext(() => where("runWithoutContext"));
});
where("after run");
try {
  storage.require();
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx propagation.ts`

```ts
string 36 true {}
before run               (no context)
inside run               req-7
after a timer            req-7
parallel branch 1        req-7
parallel branch 2        req-7
queued microtask         req-7
derived: req-7 reserve-stock { sku: 'RICE-5KG' } true
runWithoutContext        (no context)
after run                (no context)
ExecutionContextNotFoundError: No active execution context is available.
```

- `createExecutionContext` fills in a 36-character `executionId` (a UUID) and a start time, and freezes the object.
- The context survives `await`, timers, parallel branches and microtasks.
- `runDerived(overrides, callback)` runs a step with a refined context: same execution, same correlation id, a new `operation`, merged metadata. Use it to mark stages of a request.
- `runWithoutContext` deliberately runs code outside the current context, for work that must not be attributed to this request.
- `require()` throws `ExecutionContextNotFoundError` outside a context. Use it where running without one is a bug, and `get()` where it is normal.

### Logs that carry the context

The core's `ConsoleLogger` reads the context by itself, so every line written during a request carries its ids:

logger.tsNode.js only

```ts
import { ConsoleLogger, createContextStorage, createExecutionContext, createLogRedactor } from "@zudojs/core";

const storage = createContextStorage();
const logger = new ConsoleLogger({ service: "shop-api", timestamps: false, contextStorage: storage });
const readable = new ConsoleLogger({ timestamps: false, structured: false, contextStorage: storage });

logger.info("server listening");
storage.run(createExecutionContext({ executionId: "exec-1", correlationId: "req-7" }), () => {
  logger.info("transfer accepted", { amountKobo: 1_500_000, password: "hunter2" });
  readable.warn("low balance", { balanceKobo: 12_000 });
});

const safe = new ConsoleLogger({ timestamps: false, contextStorage: storage, redact: createLogRedactor() });
storage.run(createExecutionContext({ executionId: "exec-2", correlationId: "req-8" }), () => {
  safe.info("login attempt", { email: "ada@shop.ng", password: "hunter2", apiToken: "tok_123" });
});
```

Output of `npx tsx logger.ts`

```json
{"level":"info","message":"server listening","service":"shop-api"}
{"level":"info","message":"transfer accepted","service":"shop-api","context":{"executionId":"exec-1","correlationId":"req-7","amountKobo":1500000,"password":"hunter2"}}
WARN: low balance executionId=exec-1 correlationId=req-7 balanceKobo=12000
{"level":"info","message":"login attempt","context":{"executionId":"exec-2","correlationId":"req-8","email":"ada@shop.ng","password":"[REDACTED]","apiToken":"[REDACTED]"}}
```

The first line was written outside a request and has no context. The second has the execution and correlation ids merged with the fields you logged. The third is the human-readable form (`structured: false`).

Look at the second line again: `"password":"hunter2"`. The core logger does **not** hide sensitive fields unless you ask. The last logger passes `redact: createLogRedactor()`, which replaces values under names such as `password`, `secret` and `token` (including `apiToken`) with `[REDACTED]`. Turn it on for every logger that might see user input.

## Typed values in the context

An execution context holds ids. A request often carries more: the signed-in user, the tenant, an open database transaction. `ContextValues` is a typed collection that travels with the context. Each value has a **context key**, created with `createContextKey<T>(name)`, whose type parameter is the type of the value:

values.tsNode.js only

```ts
import { createContextKey, createContextStorage, createContextValues, createExecutionContext } from "@zudojs/core";

interface CurrentUser {
  readonly id: string;
  readonly role: "customer" | "admin";
}
const CURRENT_USER = createContextKey<CurrentUser>("current-user");
const TENANT = createContextKey<string>("tenant");

const empty = createContextValues();
const values = empty.set(CURRENT_USER, { id: "user_42", role: "customer" }).set(TENANT, "shop-ng");
console.log(empty.size(), values.size(), CURRENT_USER.name, typeof CURRENT_USER.id);

const storage = createContextStorage();

function cancelOrder(orderId: string): string {
  const user = storage.getValues()?.require(CURRENT_USER);
  if (user?.role !== "admin") return `${user?.id} may not cancel ${orderId}`;
  return `${orderId} cancelled by ${user.id}`;
}

storage.runWithValues(createExecutionContext({ correlationId: "req-9" }), values, () => {
  console.log(cancelOrder("ord_19"));
  storage.run(createExecutionContext({ correlationId: "listener" }), () => {
    console.log("new execution sees:", storage.getValues()?.get(CURRENT_USER));
  });
});

try {
  createContextValues().require(CURRENT_USER);
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx values.ts`

```ts
0 2 current-user symbol
user_42 may not cancel ord_19
new execution sees: undefined
Error: Required context value "current-user" is not available.
```

- `set` returns a **new** collection and leaves the old one alone: `empty` still has 0 values. You can hand a collection to other code without fearing it changes under you.
- The key is a `symbol` inside, so two keys with the same name never collide, and `require(CURRENT_USER)` is typed as `CurrentUser` with no cast.
- A new execution started *inside* a request (a listener, a consumer) does not inherit the request's values: the nested `run` saw `undefined`. Otherwise one customer's user or transaction could leak into unrelated work. Carry values on purpose with `runDerived` or `runWithValues`.

The missing-value error is a plain `Error`, not one of the framework's typed errors, so catch it by message or check with `has` first.

### Crossing a queue: snapshots

`AsyncLocalStorage` follows promises and timers, but not your own data structures. Put a job function in an array during a request, run it later from a worker loop, and the context is gone:

snapshot.tsNode.js only

```ts
import { createContextKey, createContextStorage, createContextValues, createExecutionContext } from "@zudojs/core";

const CURRENT_USER = createContextKey<string>("current-user");
const storage = createContextStorage();
const queue: Array<() => void> = [];

function sendReceipt(orderId: string) {
  const who = storage.getValues()?.get(CURRENT_USER) ?? "nobody";
  console.log(`receipt for ${orderId} | request ${storage.get()?.correlationId ?? "unknown"} | user ${who}`);
}

storage.runWithValues(createExecutionContext({ correlationId: "req-12" }), createContextValues().set(CURRENT_USER, "user_42"), () => {
  queue.push(() => sendReceipt("ord_1"));
  const snapshot = storage.capture();
  queue.push(() => storage.runSnapshot(snapshot, () => sendReceipt("ord_2")));
  console.log("snapshot frozen:", Object.isFrozen(snapshot), "| captured:", snapshot.capturedAt instanceof Date);
});

// Later, a worker drains the queue outside any request.
for (const job of queue) job();
```

Output of `npx tsx snapshot.ts`

```ts
snapshot frozen: true | captured: true
receipt for ord_1 | request unknown | user nobody
receipt for ord_2 | request req-12 | user user_42
```

`capture()` takes a frozen **snapshot** of the current context and values; `runSnapshot(snapshot, callback)` restores both around the job. The first receipt lost its request, the second kept it. Any job queue, scheduler or retry loop you write needs this: capture when the job is queued, restore when it runs.

## Request-scoped objects

The application's container and the execution context work together. A provider registered as `"scoped"` gets **one instance per execution context**: two requests get two carts, and every `resolve` within one request returns the same cart.

scoped.tsNode.js only

```ts
import { createApplication, createExecutionContext, createToken } from "@zudojs/core";

interface Cart {
  readonly items: string[];
}
const CART = createToken<Cart>("Cart");
const TAX_RATE = createToken<number>("TaxRate");

const app = await createApplication({ logger: { level: "fatal" }, runtime: { signals: { handleSigint: false, handleSigterm: false } } });
const context = app.applicationContext!;
const container = context.getContainer();
container.register(TAX_RATE, { useValue: 0.075 });
container.register(CART, { useFactory: () => ({ items: [] }) }, "scoped");

const storage = context.getContextStorage();
for (const [requestId, product] of [["req-1", "Rice 5kg"], ["req-2", "Palm oil 1L"]] as const) {
  storage.run(createExecutionContext({ correlationId: requestId }), () => {
    container.resolve(CART).items.push(product);
    const cart = container.resolve(CART);
    console.log(requestId, cart.items, "VAT", container.resolve(TAX_RATE));
  });
}
try {
  container.resolve(CART);
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx scoped.ts`

```ts
req-1 [ 'Rice 5kg' ] VAT 0.075
req-2 [ 'Palm oil 1L' ] VAT 0.075
DependencyResolutionError: Scoped provider "Cart" was resolved outside any scope. Resolve it through container.createScope() or inside an execution context.
```

`TAX_RATE` is registered with the default lifetime, `"singleton"`: one value for the whole application. The cart is scoped: the second `resolve` in `req-1` returned the cart the first one filled, and `req-2` started with an empty one. Outside any request there is no scope, so resolving the cart fails loudly instead of handing out a shared cart that every customer would fill.

## When start fails

The database is down when the shop starts. Here a `database` module fails in `onInitialize`, `orders` depends on it, and a metrics participant is registered:

failure.tsNode.js only

```ts
import { createApplication, defineModule } from "@zudojs/core";
import { traced } from "./modules.js";

let databaseUp = false;
const database = () => ({
  ...traced("database"),
  onInitialize: () => {
    console.log("  initialize database");
    if (!databaseUp) throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  },
});

const app = await createApplication({
  modules: [
    defineModule({ id: "database", name: "database", factory: database }),
    defineModule({ id: "orders", name: "orders", dependencies: ["database"], factory: () => traced("orders", ["database"]) }),
  ],
  participants: [
    {
      name: "metrics",
      initialize: () => console.log("  metrics: initialize"),
      start: () => console.log("  metrics: start"),
      stop: () => console.log("  metrics: stop"),
      dispose: () => console.log("  metrics: dispose"),
    },
  ],
  logger: { level: "fatal" },
  runtime: { name: "shop-api", signals: { handleSigint: false, handleSigterm: false } },
});

try {
  await app.start();
} catch (error) {
  const cause = (error as Error).cause as Error;
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
  console.log(`cause: ${cause.message}`);
}
console.log("state:", app.state);
try {
  await app.start();
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}

await app.stop();
console.log("state:", app.state);
databaseUp = true;
await app.start();
console.log("state:", app.state);
await app.shutdown();
console.log("state:", app.state);
```

Output of `npx tsx failure.ts`

```ts
  metrics: initialize
  metrics: start
  initialize database
  destroy    database
  destroy    orders
RuntimeInitializationError: Runtime module initializing failed.
cause: Module "database" failed during initializing: connect ECONNREFUSED 127.0.0.1:5432
state: failed
InvalidStateError: Application cannot start from state "failed".
  metrics: stop
state: stopped
  metrics: start
  initialize database
  initialize orders
  ready      database
  ready      orders
state: running
  shutdown   orders
  shutdown   database
  destroy    orders
  destroy    database
  metrics: stop
  metrics: dispose
state: stopped
```

Step by step:

1. The participant initialized once, inside `createApplication`, and started at the beginning of `start()`.
2. `database` failed. The runtime rolled back and `start()` rejected with `RuntimeInitializationError`. Its own message is vague; the `cause` says which module failed and why. Always log the cause.
3. The application is now `failed`, and `start()` is refused with `InvalidStateError`.
4. `stop()` cleans up (the participant stops) and moves the state to `stopped`.
5. From `stopped`, `start()` works again. The application builds a **fresh runtime** and fresh module instances from the definitions; this time the database is up.
6. `shutdown()` stops everything and finally disposes the participant.

> A MODULE THAT NEVER STARTED IS DESTROYED
>
> Look at the rollback: `destroy orders` ran, although `orders` was never initialized (its dependency failed first). With the published `@zudojs/core`, write every `onDestroy` so it is safe to call on a module that never initialized: check that a connection exists before closing it. `@zudojs/runtime` only destroys modules that initialized.

The recovery recipe for a server: if `start()` rejects, log the error with its cause, call `stop()`, and exit with code 1 so your process manager restarts the app or alerts someone.

## Testing an application

Three options make an application safe to run inside tests:

- `logger: { level: "fatal" }` keeps test output readable.
- `contextStorage: createContextStorage()` gives the application its own storage instead of the process-wide default, so applications created by tests running in parallel never see each other's contexts.
- `signalTarget` replaces `process` for signal handling. A test can then "send" `SIGTERM` without stopping the test runner.

signals-test.tsNode.js only

```ts
import { createApplication, createContextStorage, defineModule } from "@zudojs/core";
import type { RuntimeSignalTarget } from "@zudojs/core";
import { traced } from "./modules.js";

// A stand-in for `process`: records listeners so the test can "send" a signal.
type Listener = (...args: never[]) => void;
const listeners = new Map<string, Listener[]>();
const fakeProcess: RuntimeSignalTarget = {
  on: (event, listener) => listeners.set(event, [...(listeners.get(event) ?? []), listener]),
  off: (event, listener) => listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener)),
};
const send = (signal: string) => (listeners.get(signal) ?? []).forEach((listener) => listener());
const count = (signal: string) => listeners.get(signal)?.length ?? 0;

const app = await createApplication({
  modules: [defineModule({ id: "http", name: "http", factory: () => traced("http") })],
  logger: { level: "fatal" },
  contextStorage: createContextStorage(),
  signalTarget: fakeProcess,
  runtime: { name: "shop-api" },
});

await app.start();
console.log("listening for SIGTERM:", count("SIGTERM"), "| SIGINT:", count("SIGINT"), "| SIGHUP:", count("SIGHUP"));
send("SIGTERM");
await new Promise((resolve) => setTimeout(resolve, 20));
console.log("runtime:", app.applicationRuntime?.state, "| application:", app.state, "| listeners left:", count("SIGTERM"));
```

Output of `npx tsx signals-test.ts`

```ts
  initialize http
  ready      http
listening for SIGTERM: 1 | SIGINT: 1 | SIGHUP: 0
  shutdown   http
  destroy    http
runtime: stopped | application: running | listeners left: 0
```

The runtime listened for `SIGTERM` and `SIGINT` (not `SIGHUP`, which is off by default), stopped gracefully on the fake signal, and removed its listeners. Two rough edges showed up while writing this test:

- The real `process` object and a Node.js `EventEmitter` do not type-check as a `RuntimeSignalTarget` with current Node.js types, which is why the test builds its own small target object.
- After the signal, the **runtime** is `stopped` but `app.state` still says `running`. If you check health through the application, check `app.applicationRuntime?.state` as well.

Without the options, `createApplication` logs every step. With `timestamps: false` and `structured: false` the lines are readable, and each one inside the runtime carries the runtime's execution id:

default-logs.tsNode.js only

```ts
import { createApplication, defineModule } from "@zudojs/core";
import { traced } from "./modules.js";

const app = await createApplication({
  modules: [defineModule({ id: "orders", name: "orders", factory: () => traced("orders") })],
  logger: { timestamps: false, structured: false },
  runtime: { name: "shop-api", mode: "production", signals: { handleSigint: false, handleSigterm: false } },
});
await app.start();
await app.stop();
```

Output of `npx tsx default-logs.ts`

```ts
INFO: Application initialization completed
INFO: Application startup completed executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8
INFO: Runtime bootstrap started. executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeName=shop-api environment=node phase=created
  initialize orders
  ready      orders
INFO: Runtime bootstrap completed. executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeName=shop-api environment=node durationMs=4 loadedModules=1 initializedModules=1 startedModules=1 errors=0 phase=completed modules=["orders"]
INFO: Runtime shutdown started. executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeName=shop-api environment=node phase=created modules=["orders"]
  shutdown   orders
  destroy    orders
INFO: Runtime shutdown completed. executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeName=shop-api environment=node durationMs=1 stoppedModules=1 destroyedModules=1 errors=0 phase=completed
INFO: Application shutdown completed executionId=shop-api-5018bd27-b264-408b-9786-67726811c1a8 runtimeId=shop-api-5018bd27-b264-408b-9786-67726811c1a8
```

Your ids and durations will differ. `environment=node` is the JavaScript engine the runtime detected, not `NODE_ENV`; the mode (development, test or production) comes from the `mode` option, or from `NODE_ENV` when you leave it out.

## Production concerns

- **Signals are on by default.** The core's runtime handles `SIGINT` and `SIGTERM`, stops gracefully, and exits with code 1 on a second signal. It also catches uncaught exceptions and unhandled rejections, stops, and exits with code 1 (`exitOnFatalError`). If something else in your process handles signals (like the generated `server.ts`), turn these off so there is one owner.
- **No startup deadline by default.** `runtime.startup.timeoutMs` is 0, which means "wait forever". A hook that hangs on an unreachable database hangs the whole start. Set it: `runtime: { startup: { timeoutMs: 30_000 } }`. When it fires, `start()` rejects with `RuntimeTimeoutError`. In the published version, a following `stop()` then waits the full shutdown limit (30 seconds) for the hung hook, so after a startup timeout, log and exit with code 1 rather than waiting.
- **Redact logs.** Pass `redact: createLogRedactor()` (with extra `patterns` for your own sensitive field names).
- **Snapshot at every queue.** Any code that stores a function to run later must capture a snapshot, or its logs lose the request id exactly when you need it: in a failing background job.
- **Keep values small.** Context values live as long as the request's async work. A large object stored there, or a timer that never ends, keeps it in memory.

## Practice

TRY IT YOURSELF

### Stage names in the log

In `with-context.ts`, make `debit` and `credit` run inside `storage.runDerived({ operation: "debit" }, …)` and `…({ operation: "credit" }, …)`, and make `log` print the operation too. Predict the first three lines before running it.

**Show a solution**

stages.tsNode.js only

```ts
import { createContextStorage, createExecutionContext } from "@zudojs/core";

const storage = createContextStorage();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message: string) {
  const context = storage.get();
  console.log(`[${context?.correlationId ?? "-"} ${context?.operation ?? "-"}] ${message}`);
}

async function transfer(from: string, to: string, amount: number) {
  log("transfer started");
  await storage.runDerived({ operation: "debit" }, async () => {
    await sleep(amount > 10_000 ? 80 : 20);
    log(`debited ${from} ₦${amount}`);
  });
  await storage.runDerived({ operation: "credit" }, async () => {
    await sleep(100);
    log(`credited ${to} ₦${amount}`);
  });
}

const run = (id: string, from: string, to: string, amount: number) =>
  storage.run(createExecutionContext({ correlationId: id, operation: "POST /transfers" }), () => transfer(from, to, amount));

await Promise.all([run("req-41", "ACC-1", "ACC-2", 15_000), run("req-42", "ACC-3", "ACC-4", 2_500)]);
```

Output of `npx tsx stages.ts`

```json
[req-41 POST /transfers] transfer started
[req-42 POST /transfers] transfer started
[req-42 debit] debited ACC-3 ₦2500
[req-41 debit] debited ACC-1 ₦15000
[req-42 credit] credited ACC-4 ₦2500
[req-41 credit] credited ACC-2 ₦15000
```

The correlation id stays the same through each stage; only the operation changes. When a transfer fails, the log line now says which request it was *and* which step failed.

TRY IT YOURSELF

### Keep the tenant for the receipt job

Add a `TENANT` key next to `CURRENT_USER` in `snapshot.ts`, set it to `"shop-ng"` for the request, and print it in `sendReceipt`. Which receipt shows the tenant, and why?

**Show a solution**

tenant-snapshot.tsNode.js only

```ts
import { createContextKey, createContextStorage, createContextValues, createExecutionContext } from "@zudojs/core";

const CURRENT_USER = createContextKey<string>("current-user");
const TENANT = createContextKey<string>("tenant");
const storage = createContextStorage();
const queue: Array<() => void> = [];

function sendReceipt(orderId: string) {
  const values = storage.getValues();
  console.log(`receipt ${orderId}: tenant ${values?.get(TENANT) ?? "?"}, user ${values?.get(CURRENT_USER) ?? "?"}`);
}

const values = createContextValues().set(CURRENT_USER, "user_42").set(TENANT, "shop-ng");
storage.runWithValues(createExecutionContext({ correlationId: "req-12" }), values, () => {
  queue.push(() => sendReceipt("ord_1"));
  const snapshot = storage.capture();
  queue.push(() => storage.runSnapshot(snapshot, () => sendReceipt("ord_2")));
});
for (const job of queue) job();
```

Output of `npx tsx tenant-snapshot.ts`

```ts
receipt ord_1: tenant ?, user ?
receipt ord_2: tenant shop-ng, user user_42
```

Only the snapshot job sees the tenant. In a multi-tenant shop, a receipt job without the tenant would at best fail and at worst read another shop's settings. The [tenancy lesson](https://zudojs.oyinlola.site/learn/zudo-tenancy) builds on exactly this.

TRY IT YOURSELF

### A safe onDestroy

Write a `database` module with `createModule` whose `onInitialize` sets a `connection` variable and whose `onDestroy` closes it, and make `onDestroy` safe when `onInitialize` never ran. Call `onDestroy` directly to test both cases.

**Show a solution**

safe-destroy.tsNode.js only

```ts
import { createModule } from "@zudojs/core";

function databaseModule() {
  let connection: { close(): void } | undefined;
  return createModule({
    id: "database",
    name: "database",
    onInitialize: () => {
      connection = { close: () => console.log("connection closed") };
    },
    onDestroy: () => {
      if (connection === undefined) {
        console.log("nothing to close");
        return;
      }
      connection.close();
      connection = undefined;
    },
  });
}

const neverStarted = databaseModule();
await neverStarted.onDestroy?.({} as never);

const started = databaseModule();
await started.onInitialize?.({} as never);
await started.onDestroy?.({} as never);
await started.onDestroy?.({} as never);
```

Output of `npx tsx safe-destroy.ts`

```ts
nothing to close
connection closed
nothing to close
```

Checking before closing makes `onDestroy` safe to call on a module that never initialized (the core's rollback does that) and safe to call twice. The `{} as never` stands in for the module context, which these hooks do not use; in real code the application passes it.

## Recap

- `@zudojs/core` is the kernel: the module contract (`Module`, `BaseModule`, `createModule`, `defineModule`), the execution context, and `createApplication`, a complete stack with its own container, logger and configuration.
- `createApplication` returns an initialized application; `start()` builds modules from their definitions and runs them in dependency order; `stop()` reverses it; a stopped application can start again with a fresh runtime; `shutdown()` is final.
- A module's context gives configuration, the application context, and only the modules it declares.
- `ContextStorage.run` makes an execution context current for all the async work it starts. `runDerived` refines it, `ContextValues` carries typed values, and `capture`/`runSnapshot` carry both across your own queues.
- Scoped providers give one instance per execution context.
- A failed start leaves the application `failed`: log the cause, `stop()`, then start again or exit with code 1. Make `onDestroy` safe for modules that never initialized.

Next, [The application runtime and lifecycle](https://zudojs.oyinlola.site/learn/zudo-runtime) uses these same modules with `@zudojs/runtime`, the runtime your generated project runs on, and looks closely at start order, rollback, readiness and signals.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
