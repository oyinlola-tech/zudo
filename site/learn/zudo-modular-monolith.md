---
title: "From monolith to modular monolith — ZudoJS Academy"
description: "Split a growing monolith into modules with clear boundaries: each owns its data, exposes a small public API, and talks to others via events and commands."
source: https://zudojs.oyinlola.site/learn/zudo-modular-monolith
---

LEVEL 15 · LESSON 2 OF 5

Architecture modes Advanced

# From monolith to modular monolith

Split a growing monolith into modules with clear boundaries: each owns its data, exposes a small public API, and talks to others via events and commands.

- **45 min** to read and try
- **You need:** The ShopFlow monolith from the previous lesson, and the lessons on events and CQRS
- **You build:** A ShopFlow modular monolith with a catalog and an orders module that talk through a public API, events and a command bus

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Split a monolith into modules with clear ownership of data and rules
- Expose a small public API per module instead of shared tables
- Declare module dependencies so the runtime starts and stops them in the right order
- Scaffold modules with `zudojs generate module`
- Choose between a public API call, an event and a command for cross-module communication
- Enforce module boundaries with an import check

## Where the monolith strains

[The previous lesson](https://zudojs.oyinlola.site/learn/zudo-monolith) built ShopFlow as a **monolith**: one program, one codebase, one database, deployed as one unit. That is a good thing. A monolith is simple to run, simple to debug, and a function call between two features costs nothing. Most successful products started as one.

That lesson also traced what nothing stops from happening once the code grows: `OrdersRepository` reads the `products` table directly, a route skips the service layer, and any new feature can import `ProductsRepository` and change stock without going through checkout's rules. None of this shows up in the folder names, only in which file touches which table. Left alone, this is how a monolith turns into a **big ball of mud**: a change in one place breaks something far away, and nobody can tell what depends on what.

## The modular monolith

A **modular monolith** is still one program and one deployment. The difference is inside: the code is split into **modules**, and each module has a hard edge around it. ShopFlow's products area becomes the **catalog module** in this lesson: same table, same rules, but now with a name for the boundary and an edge enforced around it.

- **A module owns one area of the business.** In ShopFlow, the online shop you build in the capstone, that means `catalog` (products and stock, what [the previous lesson](https://zudojs.oyinlola.site/learn/zudo-monolith) called the products area), `orders` (carts and checkout), `users` and `payments`. Such an area is called a **domain boundary**, or a *bounded context*.
- **A module has a small public API.** Other modules may call only what it exports on purpose. Everything else is private.
- **A module owns its data.** Only the catalog module reads and writes the products table. Orders asks the catalog.
- **Infrastructure is shared.** The logger, the configuration, the event bus, the database connection and the HTTP server are the same for every module. Only the *data* and the *rules* are split.

Modules talk to each other in three ways, and this lesson shows each one:

| Way | Use it when | ZudoJS tool |
| --- | --- | --- |
| Call the other module's public API | You need an answer right now ("is this in stock?") | A TypeScript interface, wired with `@zudojs/container` |
| Publish an event | Something happened and others may care ("an order was placed") | `@zudojs/events` |
| Send a command or query by name | You want to ask for work without importing the module at all | `@zudojs/cqrs` |

> TIP
>
> A modular monolith is also the best way to prepare for microservices, the topic of [the next lesson](https://zudojs.oyinlola.site/learn/zudo-microservices). A module with a clean edge can later be moved into its own service. A tangled one cannot.

## Generate a modular monolith

The ZudoJS CLI you met in [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project) has a template for this. Create ShopFlow with it, with the `events` and `cqrs` capabilities:

Terminal on your computer

```bash
$ zudojs create shopflow --architecture modular-monolith --package-manager npm --capabilities "events,cqrs"
│
◇  Project structure created
│
◇  Backend project generated (40 files)
Capabilities build on: messaging, events

added 67 packages, and audited 68 packages in 36s
…
◆  Dependencies installed
│
◇  Project validated
│
◇  Git repository initialized
│
◇  Next steps ──╮
│               │
│  cd shopflow  │
│  npm run dev  │
│               │
├───────────────╯
│
└  Project created successfully.
$ cd shopflow
```

`Capabilities build on: messaging, events` means CQRS needs two other packages, so the CLI added them too. A new modular monolith has no modules yet. Add two with `zudojs generate module`:

Terminal on your computer

```bash
$ zudojs generate module catalog
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/catalog/catalog.module.ts
  - src/modules/catalog/index.ts
  - src/modules/index.ts
  - src/modules/catalog/features/catalog.feature.ts
  - src/modules/catalog/features/index.ts
  - src/modules/catalog/routes/index.ts
  - src/app.ts
  - src/routes/index.ts
$ zudojs generate module orders
…
$ tree src/modules
src/modules
├── catalog
│   ├── catalog.module.ts
│   ├── features
│   │   ├── catalog.feature.ts
│   │   └── index.ts
│   ├── index.ts
│   └── routes
│       └── index.ts
├── index.ts
└── orders
    ├── features
    │   ├── index.ts
    │   └── orders.feature.ts
    ├── index.ts
    ├── orders.module.ts
    └── routes
        └── index.ts

7 directories, 11 files
```

Each module is a folder with the same shape:

- `catalog.module.ts` is the module class. The runtime calls its `onInitialize` when the app starts and `onShutdown` when it stops, as you saw in [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime).
- `features/` holds the module's code: services, repositories, handlers. It is private to the module.
- `routes/index.ts` registers the module's HTTP routes. It is empty for now.
- `index.ts` is the module's **public API**. Whatever it exports is what other modules may use. Right now it exports only the module class.
- `src/modules/index.ts` collects the modules for `app.ts`.

The last two files in the list were *updated*, not created: the CLI registered the module for you. It added the module to the list the runtime starts in `src/app.ts`, and its routes to `registerRoutes` in `src/routes/index.ts`. After both commands, `src/app.ts` contains:

app.ts (part)Node.js only

```ts
import { CatalogModule } from "./modules/index.js";
import { OrdersModule } from "./modules/index.js";

// inside createApp():
for (const module of [
  new OrdersModule(),
  new CatalogModule(),
] as Module[]) {
  modules.set(module.id, module);
}
```

The list order does not decide the start order. Orders will need the catalog, so tell the runtime. In `src/modules/orders/orders.module.ts`, add a `dependencies` list to the constructor:

orders.module.ts (part)Node.js only

```ts
public constructor() {
  super({ version: "0.1.0", dependencies: ["catalog"] });
}
```

Start the app. The runtime starts the catalog first because orders depends on it, even though orders comes first in the list:

Terminal on your computer

```bash
$ npm run dev

> shopflow@0.1.0 dev
> tsx watch src/server.ts

2026-09-23T17:35:22.035Z [INFO] [shopflow] catalog module initialized
2026-09-23T17:35:22.037Z [INFO] [shopflow] orders module initialized
2026-09-23T17:35:22.038Z [INFO] [shopflow] All modules initialized. modules=["integrations","catalog","orders"] durationMs=7
2026-09-23T17:35:22.040Z [INFO] [shopflow] All modules started. modules=["integrations","catalog","orders"] durationMs=1
2026-09-23T17:35:22.041Z [INFO] [shopflow] Runtime is ready. runtimeId=rt_82876e3fec4a4169b7a13157658af51d environment=development
Listening on http://0.0.0.0:3000
```

Press Ctrl + C and the order reverses: `orders module stopped`, then `catalog module stopped`. A module never loses something it depends on while it is still running.

## A module's public API

Now fill the catalog with real rules. The examples below are small single files so you can run them on this page. In the project, each lives in its module folder, as the file name comments say.

The catalog exports an **interface**, `CatalogApi`, and a function that creates it. The `Map` of products lives inside the function, so no other code can reach it:

catalog.ts

```ts
// src/modules/catalog/index.ts: the catalog's public API
import { ConflictError, NotFoundError } from "@zudojs/errors";

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
}

export interface CatalogApi {
  getProduct(sku: string): Product;
  reserve(sku: string, quantity: number): void;
}

export function createCatalog(): CatalogApi {
  const products = new Map([
    ["mug", { name: "Mug", price: 12, stock: 2 }],
    ["tee", { name: "T-shirt", price: 20, stock: 10 }],
  ]);

  function find(sku: string) {
    const product = products.get(sku);
    if (!product) throw new NotFoundError(`No product ${sku}`);
    return product;
  }

  return {
    getProduct: (sku) => ({ sku, ...find(sku) }),
    reserve(sku, quantity) {
      const product = find(sku);
      if (quantity > product.stock) throw new ConflictError(`Only ${product.stock} ${sku} left`);
      product.stock -= quantity;
    },
  };
}
```

The orders module receives a `CatalogApi`. It does not know how the catalog stores products, and it does not care:

orders.ts

```ts
// src/modules/orders/index.ts: the orders module's public API
import type { CatalogApi } from "./catalog.js";

export interface Order {
  readonly id: number;
  readonly sku: string;
  readonly quantity: number;
  readonly total: number;
}

export function createOrders(catalog: CatalogApi) {
  const orders: Order[] = [];
  return {
    placeOrder(sku: string, quantity: number): Order {
      const product = catalog.getProduct(sku);
      catalog.reserve(sku, quantity);
      const order = { id: orders.length + 1, sku, quantity, total: product.price * quantity };
      orders.push(order);
      return order;
    },
  };
}
```

main.ts

```ts
import { createCatalog } from "./catalog.js";
import { createOrders } from "./orders.js";

const catalog = createCatalog();
const orders = createOrders(catalog);

console.log(orders.placeOrder("mug", 1));
try {
  orders.placeOrder("mug", 3);
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
console.log(catalog.getProduct("mug"));
```

Output of `npx tsx main.ts` and of the browser terminal

```json
{ id: 1, sku: 'mug', quantity: 1, total: 12 }
ConflictError Only 1 mug left
{ sku: 'mug', name: 'Mug', price: 12, stock: 1 }
```

The same bug from the tangled shop cannot happen here. The only way to change stock is `reserve`, and `reserve` checks the rule. The second order was refused and the stock stayed at 1.

`main.ts` plays the role of `app.ts`: the one place that creates every module and hands each one what it needs. That place is called the **composition root**. In a bigger app you register these APIs in the container from [the dependency injection lesson](https://zudojs.oyinlola.site/learn/zudo-container), under a token each module exports.

TypeScript also guards the edge. If the orders code tries to reach the catalog's data, it does not compile:

sneaky.ts

```ts
import { createCatalog } from "./catalog.js";

const catalog = createCatalog();
catalog.products.set("mug", { name: "Mug", price: 0, stock: 99 });
```

What `npx tsc --noEmit` prints

```ts
sneaky.ts:4:9 - error TS2339: Property 'products' does not exist on type 'CatalogApi'.

4 catalog.products.set("mug", { name: "Mug", price: 0, stock: 99 });
          ~~~~~~~~


Found 1 error in sneaky.ts:4
```

Types are a strong fence, but not the only one you need. A developer can still write `import { something } from "../catalog/features/catalog.feature.js"` and use a private file. The rule for your team is simple: **import another module only through its `index.ts`**. You will write a small check for that in the practice section.

## Each module owns its data

When ShopFlow gets a real database, the boundary must hold there too. Two habits keep it:

- **One schema per module.** PostgreSQL can group tables into *schemas*, named folders inside one database: `catalog.products`, `orders.orders`, `orders.order_lines`. Only the catalog module's code touches `catalog.*`.
- **No joins across modules.** Orders stores the `sku` and the price it charged, a copy taken at checkout time. It does not join `catalog.products` to show an order. If the product is renamed later, the order still says what the customer bought.

Sharing one database server is fine and is what "shared infrastructure" means. Sharing *tables* between modules is what turns them back into a ball of mud.

## Events between modules

A direct call is right when orders *needs an answer* from the catalog. It is wrong when orders only wants to say "this happened". If checkout called the e-mail module, the analytics module and the loyalty-points module one by one, orders would depend on all of them, and one slow module would slow down every checkout.

Instead, orders **publishes an event** with `@zudojs/events`, from [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events), and any module may subscribe. The event definition is part of the orders module's public API:

contracts.ts

```ts
// src/modules/orders/index.ts exports this definition
import { defineEvent } from "@zudojs/events";

export interface OrderPlaced {
  readonly orderId: number;
  readonly sku: string;
  readonly quantity: number;
  readonly email: string;
}

export const OrderPlacedEvent = defineEvent<"order.placed", OrderPlaced>("order.placed");
```

modules.ts

```ts
import { createEventBus, type Event } from "@zudojs/events";
import { OrderPlacedEvent, type OrderPlaced } from "./contracts.js";

const bus = createEventBus();

// notifications module: subscribes, never imported by orders
bus.on<Event<OrderPlaced>>(OrderPlacedEvent.type, (event) => {
  console.log(`notifications: e-mail ${event.payload.email} about order ${event.payload.orderId}`);
});

// analytics module: also subscribes, and has a bug
bus.on<Event<OrderPlaced>>(OrderPlacedEvent.type, () => {
  throw new Error("analytics database is down");
});

// orders module: publishes, and does not know who listens
const result = await bus.publish(
  OrderPlacedEvent.create({ orderId: 1, sku: "mug", quantity: 1, email: "ada@example.com" }),
);
console.log("handlers:", result.handlerCount, "ok:", result.succeeded, "failed:", result.failed);
for (const error of result.errors) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
  console.log("logged:", cause);
}
```

Output of `npx tsx modules.ts` and of the browser terminal

```ts
notifications: e-mail ada@example.com about order 1
handlers: 2 ok: 1 failed: 1
logged: analytics database is down
```

Three things to notice:

- The orders code only knows `OrderPlacedEvent`. Adding a loyalty-points module later means adding one more `bus.on`, with no change to orders.
- The analytics handler threw, and the e-mail was still sent. In its default `CONTINUE` mode the bus runs every handler and collects the failures in `result.errors`, so one broken module does not break checkout. Log those errors: a failure nobody sees is a failure nobody fixes.
- The event carries everything a subscriber needs (`email`, `sku`). A subscriber that had to call back into orders to learn more would be coupled to orders again.

> IN-PROCESS EVENTS ARE NOT DURABLE
>
> This bus lives in memory. If the process crashes right after the order is saved and before the event is handled, the e-mail is never sent. Inside one app that is often acceptable. When it is not, save the event in the same database transaction as the order and publish it afterwards. That is the *outbox pattern*, and [the next lesson](https://zudojs.oyinlola.site/learn/zudo-microservices) builds one.

## Commands and queries between modules

With `@zudojs/cqrs`, from [the CQRS lesson](https://zudojs.oyinlola.site/learn/zudo-cqrs), one module can ask another for work **by name**. The asking module imports only the message types, never the other module's code. A **command** changes something (`PlaceOrder`). A **query** only reads (`GetProduct`).

Inside a monolith this gives you one more thing: every write goes through one bus, so logging, timing and permission checks can wrap all of them in one place, as middleware.

messages.ts

```ts
// Shared contracts: the only thing modules import from each other
import type { CommandOf, QueryOf } from "@zudojs/cqrs";

export interface ProductView {
  readonly sku: string;
  readonly price: number;
}

export type GetProduct = QueryOf<"GetProduct", { sku: string }>;
export type PlaceOrder = CommandOf<"PlaceOrder", { sku: string; quantity: number }>;
```

app.ts

```ts
import { createCommandBus, createQueryBus, timingMiddleware } from "@zudojs/cqrs";
import type { GetProduct, PlaceOrder, ProductView } from "./messages.js";

const queries = createQueryBus();
const commands = createCommandBus({
  middleware: [timingMiddleware({ onTiming: ({ request }) => console.log(`audit: ${request.type}`) })],
});

// catalog module registers its query handler
const prices = new Map([["mug", 12], ["tee", 20]]);
queries.register<GetProduct, ProductView>("GetProduct", async (query) => ({
  sku: query.sku,
  price: prices.get(query.sku) ?? 0,
}));

// orders module registers its command handler; it asks the catalog by name
commands.register<PlaceOrder, { total: number }>("PlaceOrder", async (command) => {
  const product = await queries.execute<GetProduct, ProductView>({ type: "GetProduct", sku: command.sku });
  return { total: product.price * command.quantity };
});

// an HTTP controller sends the command
const result = await commands.execute<PlaceOrder, { total: number }>({ type: "PlaceOrder", sku: "tee", quantity: 2 });
console.log(result);
```

Output of `npx tsx app.ts` and of the browser terminal

```ts
audit: PlaceOrder
{ total: 40 }
```

The orders handler never imported the catalog. It knows that a query called `GetProduct` exists and what it returns, which is exactly what `messages.ts` says. The `timingMiddleware` saw the command without either module doing anything: that is where an audit log belongs.

> NOTE
>
> Do not put every call through a bus by reflex. A plain interface call, as in `CatalogApi`, is easier to read and to test. Reach for commands and queries when you want the extra middleware, or when you want the two modules to share nothing but message names.

REASON IT OUT

### Direct call, event, or command: how do you pick for one specific case?

Orders needs the catalog's price to place an order. Would you reach it with `catalog.getProduct(sku)` (the `CatalogApi` interface), with `queries.execute({ type: "GetProduct", ... })`, or by having the catalog publish a `price.changed` event that orders caches? What changes if the catalog module later moves into its own service, as in [the next lesson](https://zudojs.oyinlola.site/learn/zudo-microservices)?

**Show the reasoning**

A direct interface call is right here: the answer must be fresh (stale prices mean wrong totals) and is needed synchronously, before the order can be priced. An event fits the opposite shape — "something already happened, and I can act on it later" — which is why `order.placed` for loyalty points is an event, not a call: loyalty does not block checkout, and it is fine to react a moment late. The command/query bus sits between the two: pick it when you want the same audit middleware every write goes through, or when you want orders to depend on nothing but a message name, not a concrete `CatalogApi` type.

The choice matters more once a module can move out of process. A direct call becomes a network call that can fail or time out; an event already assumes "eventually, maybe again," so it survives the move unchanged; a query through a bus needs its transport swapped from in-process to HTTP or RPC, but the calling code does not change. That is exactly the migration [the next lesson](https://zudojs.oyinlola.site/learn/zudo-microservices) walks through.

## Wiring modules into the runtime

Here is the whole picture as the runtime sees it. The shared infrastructure (one logger, one container, one event bus) is created once and passed to the runtime. Each module gets what it needs through its constructor, and declares which modules it depends on:

runtime.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import { BaseModule, type Module } from "@zudojs/core";
import { createEventBus, type EventBus } from "@zudojs/events";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";

class CatalogModule extends BaseModule {
  readonly id = "catalog";
  readonly name = "catalog";
  constructor() { super({ version: "0.1.0" }); }
  override async onInitialize() { console.log("catalog: ready"); }
  override async onShutdown() { console.log("catalog: stopped"); }
}

class OrdersModule extends BaseModule {
  readonly id = "orders";
  readonly name = "orders";
  constructor(private readonly bus: EventBus) { super({ version: "0.1.0", dependencies: ["catalog"] }); }
  override async onInitialize() {
    this.bus.on("order.placed", () => {});
    console.log("orders: ready, subscribed to order.placed");
  }
  override async onShutdown() { console.log("orders: stopped"); }
}

const eventBus = createEventBus();
const modules = new Map<string, Module>();
for (const module of [new OrdersModule(eventBus), new CatalogModule()]) modules.set(module.id, module);

const runtime = createRuntime(
  { modules, eventBus, container: createContainer(), logger: createLogger({ name: "shopflow", level: LoggerLevel.ERROR }) },
  { applicationName: "shopflow", environment: "development", handleSignals: false },
);
await runtime.start();
console.log("state:", runtime.state);
await runtime.stop();
```

Output of `npx tsx runtime.ts`

```ts
catalog: ready
orders: ready, subscribed to order.placed
state: running
orders: stopped
catalog: stopped
```

Orders was listed first, but the catalog started first, because orders declared `dependencies: ["catalog"]`. On shutdown the order is reversed, so orders stops using the catalog before the catalog goes away. `LoggerLevel.ERROR` keeps the runtime's own log lines out of this output.

## Rules of thumb

- **Draw boundaries around business areas, not technical layers.** `catalog`, `orders` and `payments` are good modules. `controllers`, `services` and `utils` are folders inside a module.
- **Keep the public API small.** Export a few functions and types from `index.ts`. Every export is a promise you have to keep.
- **Ask, don't reach.** Call the public API, publish an event, or send a command. Never read another module's tables or private files.
- **Stay in one process as long as you can.** A modular monolith gives you most of the order of microservices, with none of the network problems. Move a module into its own service only when you have a concrete reason, such as a very different load or a separate team. [The next lesson](https://zudojs.oyinlola.site/learn/zudo-microservices) is about exactly that.

## Practice

TRY IT YOURSELF

### Add a stock-level query to the catalog

Give `CatalogApi` a third method, `inStock(sku): boolean`. Use it in `createOrders` so `placeOrder` refuses a sold-out product before calling `reserve`. Why is it still important that `reserve` checks the stock itself?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`inStock` reads the same `stock` map that `reserve` does: `(stock.get(sku) ?? 0) > 0`.

HINT 2

Between the check and the reservation, another request could reserve the last unit; that is why `reserve` must repeat the check itself instead of trusting `inStock`'s earlier answer.

SOLUTION

stock.ts

```ts
interface CatalogApi {
  inStock(sku: string): boolean;
  reserve(sku: string, quantity: number): void;
}

function createCatalog(): CatalogApi {
  const stock = new Map([["mug", 1]]);
  return {
    inStock: (sku) => (stock.get(sku) ?? 0) > 0,
    reserve(sku, quantity) {
      const left = stock.get(sku) ?? 0;
      if (quantity > left) throw new Error(`Only ${left} ${sku} left`);
      stock.set(sku, left - quantity);
    },
  };
}

const catalog = createCatalog();
for (const quantity of [1, 1]) {
  if (!catalog.inStock("mug")) {
    console.log("sold out");
    continue;
  }
  catalog.reserve("mug", quantity);
  console.log("reserved", quantity);
}
```

Output of `npx tsx stock.ts` and of the browser terminal

```ts
reserved 1
sold out
```

`inStock` is a quick check for a nicer error message. Between that check and `reserve`, another request may buy the last mug. The rule must live in the one place that changes the stock, which is `reserve`.

TRY IT YOURSELF

### Write a boundary check

Write a function `checkImport(fromModule, specifier)` that returns an error message when code in one module imports a file from inside another module, and `null` when the import is allowed. Allowed: anything inside the same module, and another module's `index.js`. Test it with the three imports below.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`const match = specifier.match(/modules\/([^/]+)\/(.+)$/); if (!match) return null; const [, target, rest] = match;` gives you the module name and the rest of the path.

HINT 2

`if (target === fromModule || rest === "index.js") return null; return \`${fromModule} may not import ${target}/${rest}: use ${target}/index.js\`;`

SOLUTION

boundaries.js

```ts
function checkImport(fromModule, specifier) {
  const match = specifier.match(/modules\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, target, rest] = match;
  if (target === fromModule || rest === "index.js") return null;
  return `${fromModule} may not import ${target}/${rest}: use ${target}/index.js`;
}

console.log(checkImport("orders", "../../modules/catalog/index.js"));
console.log(checkImport("orders", "../../modules/catalog/features/catalog.feature.js"));
console.log(checkImport("orders", "../../modules/orders/features/orders.feature.js"));
```

Output of `node boundaries.js` and of the browser terminal

```ts
null
orders may not import catalog/features/catalog.feature.js: use catalog/index.js
null
```

Run a check like this over every file in a unit test, and the build fails the day someone crosses a boundary. Lint tools can do the same with a "restricted imports" rule.

TRY IT YOURSELF

### Subscribe a loyalty module

Add a `loyalty` subscriber to the events example that gives one point per unit bought, and prints the running total for the customer. Do not change the orders code.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`bus.on<Event<OrderPlaced>>(OrderPlacedEvent.type, (event) => { ... })`, exactly as the worked example subscribes to `page.viewed`.

HINT 2

Inside the handler: `const { email, quantity } = event.payload; points.set(email, (points.get(email) ?? 0) + quantity); console.log(...)`.

SOLUTION

loyalty.ts

```ts
import { createEventBus, defineEvent, type Event } from "@zudojs/events";

interface OrderPlaced {
  readonly email: string;
  readonly quantity: number;
}
const OrderPlacedEvent = defineEvent<"order.placed", OrderPlaced>("order.placed");

const bus = createEventBus();
const points = new Map<string, number>();

bus.on<Event<OrderPlaced>>(OrderPlacedEvent.type, (event) => {
  const { email, quantity } = event.payload;
  points.set(email, (points.get(email) ?? 0) + quantity);
  console.log(`loyalty: ${email} has ${points.get(email)} points`);
});

await bus.publish(OrderPlacedEvent.create({ email: "ada@example.com", quantity: 2 }));
await bus.publish(OrderPlacedEvent.create({ email: "ada@example.com", quantity: 3 }));
```

Output of `npx tsx loyalty.ts` and of the browser terminal

```ts
loyalty: ada@example.com has 2 points
loyalty: ada@example.com has 5 points
```

## Recap

- A monolith is one deployable program. It is a fine start; it only becomes a problem when every part can reach into every other part.
- A modular monolith keeps one deployment but splits the code into modules along business areas. Each module has a small public API and owns its data.
- `zudojs create --architecture modular-monolith` and `zudojs generate module` give you the folders and register each module in `app.ts` and its routes in `registerRoutes`. You declare each module's `dependencies`.
- Modules talk through public interfaces (answers now), events (something happened) and commands or queries (work by name). Logger, config, event bus and database server are shared; tables are not.

Next, in [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices), you take one of these modules out of the process and into its own service, and meet everything that the network makes harder.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
