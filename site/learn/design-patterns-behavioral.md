---
title: "Behavioural patterns — ZudoJS Academy"
description: "Turn a shipping-fee switch into strategies, decouple order reactions with observers, make admin actions undoable commands, and build middleware as a chain."
source: https://zudojs.oyinlola.site/learn/design-patterns-behavioral
---

LEVEL 11 · LESSON 5 OF 12

Design patterns Core

# Behavioural patterns

Turn a shipping-fee switch into strategies, decouple order reactions with observers, make admin actions undoable commands, and build middleware as a chain.

- **60 min** to read and try
- **You need:** Structural patterns, A type-safe event system, and Promise combinators
- **You build:** Shipping strategies with availability rules, an order event topic with isolated handlers, an undoable admin command history with queued job commands, and a middleware chain with authentication and an approval chain

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn a growing switch of business rules into strategies that can be added, tested and offered one by one
- Decouple follow-up work with observers, isolate handler failures, and decide which reactions must not be events
- Represent actions as commands that can be undone, audited, and sent to a queue as plain data
- Build a chain of responsibility for request middleware and approvals, and order its links deliberately
- Recognise these patterns in @zudojs/events and @zudojs/middleware

## Free express delivery, by accident

A shop offers several delivery methods. The fee is computed in one function that has grown one `if` per method and per marketing campaign. The newest line, "free delivery on orders over ₦50,000", was meant for standard delivery only:

shipping-problem.ts

```ts
interface ShippingOrder {
  readonly subtotalKobo: number;
  readonly zone: "lagos" | "other";
  readonly weightKg: number;
}

function shippingFeeKobo(order: ShippingOrder, method: string): number {
  if (method === "pickup") return 0;
  if (order.subtotalKobo >= 5_000_000) return 0; // campaign: free delivery over NGN 50,000
  if (method === "standard") return order.zone === "lagos" ? 150_000 : 350_000;
  if (method === "express") return (order.zone === "lagos" ? 300_000 : 600_000) + Math.ceil(order.weightKg) * 20_000;
  if (method === "same-day") return 500_000;
  return 150_000;
}

const bigOrder: ShippingOrder = { subtotalKobo: 8_000_000, zone: "other", weightKg: 12 };
console.log("express, 12 kg to Kano:", shippingFeeKobo(bigOrder, "express"));
console.log("the mobile app sends 'sameday':", shippingFeeKobo({ ...bigOrder, subtotalKobo: 900_000 }, "sameday"));
```

Output of `npx tsx shipping-problem.ts` and of the browser terminal

```ts
express, 12 kg to Kano: 0
the mobile app sends 'sameday': 150000
```

Every large order now gets 12 kg shipped by express courier across the country for free, which costs the shop about ₦8,400 each time. And a typo from the mobile app, `"sameday"`, silently falls through to the standard price. One function holds every method's rules, so a line meant for one method leaks into all the ones below it, and an unknown method is not an error.

**Behavioural patterns** are about how objects share out work and responsibility. This lesson covers the four that shape most backend code: **strategy** (interchangeable rules), **observer** (reacting to things that happened), **command** (actions as objects) and **chain of responsibility** (a request passed along handlers, the idea behind middleware). They complete the set begun in [Creational patterns](https://zudojs.oyinlola.site/learn/design-patterns-creational) and [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural).

## Strategy: interchangeable rules

A **strategy** is one of a family of interchangeable algorithms, each behind the same interface, so the code that uses them can pick one at run time without knowing how it works. Each delivery method becomes a strategy. It owns its fee rule, and also the rule for when it is offered at all:

shipping.ts

```ts
export interface ShippingOrder {
  readonly subtotalKobo: number;
  readonly zone: "lagos" | "other";
  readonly weightKg: number;
}

export interface ShippingStrategy {
  readonly id: string;
  available(order: ShippingOrder, now: Date): boolean;
  feeKobo(order: ShippingOrder): number;
}

const lagosHour = (now: Date) => (now.getUTCHours() + 1) % 24; // Lagos is UTC+1 all year

export const standard: ShippingStrategy = {
  id: "standard",
  available: () => true,
  feeKobo: (order) => (order.subtotalKobo >= 5_000_000 ? 0 : order.zone === "lagos" ? 150_000 : 350_000),
};

export const express: ShippingStrategy = {
  id: "express",
  available: () => true,
  feeKobo: (order) => (order.zone === "lagos" ? 300_000 : 600_000) + Math.ceil(order.weightKg) * 20_000,
};

export const sameDay: ShippingStrategy = {
  id: "same-day",
  available: (order, now) => order.zone === "lagos" && lagosHour(now) < 14,
  feeKobo: () => 500_000,
};

export const pickup: ShippingStrategy = { id: "pickup", available: () => true, feeKobo: () => 0 };

export const allStrategies: readonly ShippingStrategy[] = [standard, express, sameDay, pickup];

export function shippingOptions(order: ShippingOrder, now: Date, strategies = allStrategies) {
  return strategies.filter((s) => s.available(order, now)).map((s) => ({ id: s.id, feeKobo: s.feeKobo(order) }));
}

export function strategyFor(id: string, strategies = allStrategies): ShippingStrategy {
  const strategy = strategies.find((s) => s.id === id);
  if (strategy === undefined) throw new Error(`unknown shipping method "${id}"`);
  return strategy;
}
```

The free-delivery campaign now lives inside `standard` and cannot reach `express`. The checkout shows the customer the options that apply to their order and time of day, and refuses an id it does not know. The current time is a parameter, so the "order by 14:00" rule is tested at fixed moments:

strategy-test.ts

```ts
import { express, shippingOptions, standard, strategyFor, type ShippingOrder } from "./shipping.js";

const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const big: ShippingOrder = { subtotalKobo: 8_000_000, zone: "other", weightKg: 12 };
const lagos: ShippingOrder = { subtotalKobo: 900_000, zone: "lagos", weightKg: 2 };

check("big orders ship free by standard", standard.feeKobo(big) === 0);
check("express is never free", express.feeKobo(big) === 840_000);

console.log("Lagos, 10:30:", shippingOptions(lagos, new Date("2026-03-02T09:30:00Z")));
console.log("Lagos, 15:00:", shippingOptions(lagos, new Date("2026-03-02T14:00:00Z")).map((o) => o.id));

try {
  strategyFor("sameday");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx strategy-test.ts` and of the browser terminal

```ts
PASS big orders ship free by standard
PASS express is never free
Lagos, 10:30: [
  { id: 'standard', feeKobo: 150000 },
  { id: 'express', feeKobo: 340000 },
  { id: 'same-day', feeKobo: 500000 },
  { id: 'pickup', feeKobo: 0 }
]
Lagos, 15:00: [ 'standard', 'express', 'pickup' ]
unknown shipping method "sameday"
```

This is the open/closed principle from [SOLID](https://zudojs.oyinlola.site/learn/design-solid#ocp) in its most common form: a new delivery method is a new object in the list, and the old ones are not touched. You already built strategies without the name: the promotions in that lesson and the `delivery.feeKobo` objects in [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#delegation).

- **Strategies can be plain functions.** When a strategy is a single calculation, the interface can be a function type, `type FeeRule = (order: ShippingOrder) => number`, as [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional) shows. The object form earns its keep here because each method has two rules (availability and fee) and an id.
- **Who chooses the strategy** varies: the customer (delivery method), configuration (which tax rules apply in a country), or the data (a pricing strategy per customer tier). The code that uses a strategy never chooses it itself.
- **Do not strategise a closed set** that never changes; an exhaustive `switch` is simpler there, as the SOLID lesson showed.

## Observer: react to what happened

After an order is placed, four things must happen: a confirmation e-mail, loyalty points, an analytics record and a message to the warehouse. Each was added by a different team, directly into the checkout:

observer-problem.ts

```ts
const done: string[] = [];

const sendConfirmation = async (orderId: string) => void done.push(`e-mail for ${orderId}`);
const addLoyaltyPoints = async (orderId: string) => void done.push(`points for ${orderId}`);
const trackAnalytics = async (): Promise<void> => {
  throw new Error("analytics service timed out");
};
const notifyWarehouse = async (orderId: string) => void done.push(`warehouse told about ${orderId}`);

async function placeOrder(orderId: string): Promise<string> {
  done.push(`charged and saved ${orderId}`);
  await sendConfirmation(orderId);
  await addLoyaltyPoints(orderId);
  await trackAnalytics();
  await notifyWarehouse(orderId);
  return "order placed";
}

try {
  console.log(await placeOrder("ORD-51"));
} catch (error) {
  console.log("checkout failed:", (error as Error).message);
}
console.log(done);
```

Output of `npx tsx observer-problem.ts` and of the browser terminal

```ts
checkout failed: analytics service timed out
[
  'charged and saved ORD-51',
  'e-mail for ORD-51',
  'points for ORD-51'
]
```

The customer was charged and e-mailed, then told that checkout failed, and the warehouse was never told to ship. An analytics outage, the least important of the four, broke the most important thing the shop does. The checkout also has to change every time any team wants to react to orders.

The **observer** pattern (also called **publish/subscribe**) turns this around. The subject publishes "this happened", and any number of observers subscribe to it. The publisher does not know who is listening. Here is a small typed topic for one event, with the one property that matters most: a failing observer cannot stop the others or the publisher:

order-topic.ts

```ts
export interface OrderPlaced {
  readonly orderId: string;
  readonly email: string;
  readonly totalKobo: number;
}

type Observer = (event: OrderPlaced) => Promise<void>;

export class OrderPlacedTopic {
  readonly #observers = new Map<string, Observer>();

  subscribe(name: string, observer: Observer): () => void {
    this.#observers.set(name, observer);
    return () => this.#observers.delete(name);
  }

  async publish(event: OrderPlaced): Promise<{ name: string; error: string }[]> {
    const entries = [...this.#observers];
    const settled = await Promise.allSettled(entries.map(([, observer]) => observer(event)));
    return settled.flatMap((result, i) =>
      result.status === "rejected"
        ? [{ name: entries[i]![0], error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
        : [],
    );
  }
}
```

`Promise.allSettled` ([Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators)) waits for every observer and reports each outcome, instead of stopping at the first rejection. `subscribe` returns a function that unsubscribes, so an observer that goes away can clean up.

observer-test.ts

```ts
import { OrderPlacedTopic } from "./order-topic.js";

const topic = new OrderPlacedTopic();
const done: string[] = [];

topic.subscribe("confirmation-email", async (e) => void done.push(`e-mail to ${e.email}`));
topic.subscribe("loyalty", async (e) => void done.push(`${Math.floor(e.totalKobo / 100_000)} points`));
const stopAnalytics = topic.subscribe("analytics", async () => {
  throw new Error("analytics service timed out");
});
topic.subscribe("warehouse", async (e) => void done.push(`ship ${e.orderId}`));

async function placeOrder(orderId: string): Promise<string> {
  done.push(`charged and saved ${orderId}`);
  const failures = await topic.publish({ orderId, email: "ada@shop.ng", totalKobo: 1_441_575 });
  for (const failure of failures) console.log(`log: observer ${failure.name} failed: ${failure.error}`);
  return "order placed";
}

console.log(await placeOrder("ORD-51"));
console.log(done);

stopAnalytics();
console.log("after unsubscribing:", (await topic.publish({ orderId: "ORD-52", email: "bola@shop.ng", totalKobo: 100 })).length, "failures");
```

Output of `npx tsx observer-test.ts` and of the browser terminal

```ts
log: observer analytics failed: analytics service timed out
order placed
[
  'charged and saved ORD-51',
  'e-mail to ada@shop.ng',
  '14 points',
  'ship ORD-51'
]
after unsubscribing: 0 failures
```

The order succeeds, three observers did their work, and the analytics failure is logged instead of reaching the customer. Adding a fifth reaction means subscribing a fifth observer; the checkout is closed for modification.

REASON IT OUT

### Which reactions should be observers?

Events make it easy to move work out of the use case. That is not always right. For each reaction below, decide whether it can be an observer that may fail on its own, or must stay part of placing the order:

- sending the confirmation e-mail;
- reducing stock for the items ordered;
- adding loyalty points;
- recording analytics;
- checking that the customer's account is not blocked.

And: this topic lives in the process's memory. What happens to the warehouse message if the server restarts right after the order is saved?

**Show the reasoning**

- **E-mail, analytics**: observers. The order is complete without them, and a failure can be logged and retried.
- **Stock**: not an observer. If stock is not reduced in the same transaction as the order is saved, two customers can buy the last item. It is part of the use case's rules, and must succeed or fail with it.
- **Loyalty points**: usually an observer, but it must not be lost. That depends on the next question.
- **Blocked account**: definitely not. A check that can refuse the order must run *before* it, inside the use case. Observers react to what already happened; they cannot veto it.
- An in-memory event is gone when the process dies, so the warehouse never hears about the order. Events that must not be lost are written to the database in the same transaction as the order (an **outbox** table) and delivered from there, or sent through a durable queue. [Event-driven systems with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-event-driven) builds that.

### The same idea with @zudojs/events

[A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events) built a typed bus from scratch, and [Events in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-events) covers the framework's version in depth. Its default behaviour is exactly the isolation above: every handler runs, failures are collected in the result:

zudo-observer.ts

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();
bus.on("order.placed", (event) => console.log("e-mail:", event.payload), { id: "confirmation-email" });
bus.on("order.placed", () => {
  throw new Error("analytics service timed out");
}, { id: "analytics" });
bus.on("order.placed", () => console.log("warehouse: ship it"), { id: "warehouse" });

const result = await bus.publishEvent({ type: "order.placed", payload: { orderId: "ORD-51" } });
console.log("succeeded:", result.succeeded, "failed:", result.failed);
for (const error of result.errors) console.log(error.handlerId, "->", error.cause instanceof Error ? error.cause.message : error.cause);
```

Output of `npx tsx zudo-observer.ts` and of the browser terminal

```ts
e-mail: { orderId: 'ORD-51' }
warehouse: ship it
succeeded: 2 failed: 1
analytics -> analytics service timed out
```

Observers have costs that the direct calls did not. The flow is harder to follow ("who reacts to `order.placed`?" needs a search, not a read). Observers must not depend on running in a particular order. And every `subscribe` without an unsubscribe in a long-lived object is a memory leak ([Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory)).

## Command: actions as objects

An admin runs a bulk price update before a sale. The spreadsheet had prices in naira, the tool expected kobo, and rice went from ₦8,500 to ₦85:

command-problem.ts

```ts
const prices = new Map<string, number>([
  ["RICE-5KG", 850_000],
  ["OIL-1L", 320_000],
]);

function bulkSetPrices(changes: Record<string, number>): void {
  for (const [sku, kobo] of Object.entries(changes)) prices.set(sku, kobo);
}

bulkSetPrices({ "RICE-5KG": 8_500, "OIL-1L": 3_200 }); // naira typed where kobo was expected
console.log(Object.fromEntries(prices));
console.log("previous prices: nobody knows");
```

Output of `npx tsx command-problem.ts` and of the browser terminal

```json
{ 'RICE-5KG': 8500, 'OIL-1L': 3200 }
previous prices: nobody knows
```

Customers are buying rice at ₦85. The old prices were overwritten and appear nowhere, and nobody can say who made the change. The **command** pattern turns each action into an object that holds everything needed to carry it out, and, when useful, to undo it. Because actions are objects, they can be recorded, undone, queued and audited:

commands.ts

```ts
export class Catalog {
  readonly #prices = new Map<string, number>();

  constructor(initial: Record<string, number>) {
    for (const [sku, kobo] of Object.entries(initial)) this.#prices.set(sku, kobo);
  }

  price(sku: string): number {
    const kobo = this.#prices.get(sku);
    if (kobo === undefined) throw new Error(`unknown product ${sku}`);
    return kobo;
  }

  setPrice(sku: string, kobo: number): void {
    this.price(sku);
    this.#prices.set(sku, kobo);
  }
}

export interface Command {
  readonly description: string;
  execute(): void;
  undo(): void;
}

export function changePrice(catalog: Catalog, sku: string, kobo: number): Command {
  let previous: number | undefined;
  return {
    description: `set ${sku} to ${kobo} kobo`,
    execute() {
      previous = catalog.price(sku);
      catalog.setPrice(sku, kobo);
    },
    undo() {
      if (previous === undefined) throw new Error("cannot undo a command that never ran");
      catalog.setPrice(sku, previous);
    },
  };
}

export function batch(description: string, commands: readonly Command[]): Command {
  return {
    description,
    execute: () => commands.forEach((command) => command.execute()),
    undo: () => [...commands].reverse().forEach((command) => command.undo()),
  };
}

export class CommandHistory {
  readonly #done: Command[] = [];
  readonly audit: string[] = [];

  run(command: Command, user: string): void {
    command.execute();
    this.#done.push(command);
    this.audit.push(`${user}: ${command.description}`);
  }

  undo(user: string): boolean {
    const command = this.#done.pop();
    if (command === undefined) return false;
    command.undo();
    this.audit.push(`${user}: undo ${command.description}`);
    return true;
  }
}
```

- `changePrice` records the *previous* price when it executes, not when it is created. A command created in the morning and run in the afternoon must undo to the afternoon's price.
- `batch` is a command made of commands (a **macro command**). It undoes in reverse order, the only order that is always correct when later steps depend on earlier ones.
- `CommandHistory` is the **invoker**: it runs commands, keeps them for undo, and writes the audit trail. It knows nothing about prices.

command-test.ts

```ts
import { batch, Catalog, changePrice, CommandHistory } from "./commands.js";

const catalog = new Catalog({ "RICE-5KG": 850_000, "OIL-1L": 320_000 });
const history = new CommandHistory();

history.run(batch("sale prices", [changePrice(catalog, "RICE-5KG", 8_500), changePrice(catalog, "OIL-1L", 3_200)]), "musa");
console.log("after the mistake:", catalog.price("RICE-5KG"), catalog.price("OIL-1L"));

history.undo("ngozi");
console.log("after undo:", catalog.price("RICE-5KG"), catalog.price("OIL-1L"));

history.run(batch("sale prices, in kobo", [changePrice(catalog, "RICE-5KG", 765_000)]), "musa");
console.log(history.audit);
```

Output of `npx tsx command-test.ts` and of the browser terminal

```ts
after the mistake: 8500 3200
after undo: 850000 320000
[
  'musa: sale prices',
  'ngozi: undo sale prices',
  'musa: sale prices, in kobo'
]
```

In a real admin tool the history would be stored in the database, not in memory, and "undo" would itself be a new command that is audited, never a deletion of history.

### Commands as data: job payloads

The second use of commands is to separate *asking* for an action from *doing* it, in time and in place. "Send invoice INV-7 by e-mail" can be requested by the web server and carried out later by a worker process. For that, the command must travel through a queue, which stores text. An object with methods does not survive the trip:

command-json.ts

```ts
import { Catalog, changePrice } from "./commands.js";

const command = changePrice(new Catalog({ "RICE-5KG": 850_000 }), "RICE-5KG", 765_000);
const revived = JSON.parse(JSON.stringify(command));
console.log(revived, typeof revived.execute);
```

Output of `npx tsx command-json.ts` and of the browser terminal

```json
{ description: 'set RICE-5KG to 765000 kobo' } undefined
```

Functions, closures and class instances are lost in JSON. So a queued command is *plain data*, a discriminated union with a `type`, and the code that carries it out lives in a **handler** on the worker side. The worker also checks what it reads, because a message from a queue is input from outside the program:

job-commands.ts

```ts
type JobCommand =
  | { readonly type: "SendInvoiceEmail"; readonly invoiceId: string; readonly email: string }
  | { readonly type: "RecalculateStock"; readonly sku: string };

// web server: ask
const queue: string[] = [];
function enqueue(command: JobCommand): void {
  queue.push(JSON.stringify(command));
}
enqueue({ type: "SendInvoiceEmail", invoiceId: "INV-7", email: "adaeze@stores.ng" });
enqueue({ type: "RecalculateStock", sku: "RICE-5KG" });
queue.push('{"type":"DeleteAllOrders"}');

// worker: do
async function handle(command: JobCommand): Promise<string> {
  switch (command.type) {
    case "SendInvoiceEmail":
      return `e-mailed ${command.invoiceId} to ${command.email}`;
    case "RecalculateStock":
      return `recalculated stock for ${command.sku}`;
  }
}

function parseJob(text: string): JobCommand | undefined {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || !("type" in data)) return undefined;
  if (data.type === "SendInvoiceEmail" && "invoiceId" in data && "email" in data && typeof data.invoiceId === "string" && typeof data.email === "string") {
    return { type: "SendInvoiceEmail", invoiceId: data.invoiceId, email: data.email };
  }
  if (data.type === "RecalculateStock" && "sku" in data && typeof data.sku === "string") return { type: "RecalculateStock", sku: data.sku };
  return undefined;
}

for (const message of queue) {
  const command = parseJob(message);
  console.log(command === undefined ? `rejected: ${message}` : await handle(command));
}
```

Output of `npx tsx job-commands.ts` and of the browser terminal

```ts
e-mailed INV-7 to adaeze@stores.ng
recalculated stock for RICE-5KG
rejected: {"type":"DeleteAllOrders"}
```

Queues deliver a message *at least once*: after a worker crash, the same command can arrive again. Handlers must therefore be idempotent, for example by recording which invoice e-mails were already sent ([Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency)). [Queues in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-queue) runs job commands like these with retries, and [CQRS in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-cqrs) uses commands and handlers as the way every change enters a system ([Typed commands and queries](https://zudojs.oyinlola.site/learn/ts-typed-cqrs) shows the typing).

## Chain of responsibility: middleware

The shop's admin API has thirty route handlers. Each one starts the same way: log the request, check the token, check the role, catch errors. Last month someone added a customer export route and copied the handler from a public page:

chain-problem.ts

```ts
type Req = { path: string; token?: string };
type Res = { status: number; body: string };

const admins = new Map([["t-ngozi", "ngozi"]]);

function refundOrder(req: Req): Res {
  if (req.token === undefined || !admins.has(req.token)) return { status: 401, body: "log in first" };
  return { status: 200, body: "refunded" };
}

function exportCustomers(req: Req): Res {
  return { status: 200, body: "12,408 customers: names, phones, addresses" }; // copied from a public page
}

console.log(refundOrder({ path: "/admin/refund" }));
console.log(exportCustomers({ path: "/admin/customers/export" }));
```

Output of `npx tsx chain-problem.ts` and of the browser terminal

```json
{ status: 401, body: 'log in first' }
{ status: 200, body: '12,408 customers: names, phones, addresses' }
```

One missing copy of the check, and every customer's personal data is public. In a **chain of responsibility**, a request is passed along a chain of handlers. Each handler either deals with it completely (and stops the chain) or does its part and passes it to the next. Web **middleware** is this pattern: logging, authentication and authorization are links in a chain in front of every route, so no route can forget them.

chain.ts

```ts
export interface Context {
  readonly path: string;
  readonly token?: string;
  user?: { readonly name: string; readonly role: "admin" | "support" };
}

export interface Response {
  readonly status: number;
  readonly body: string;
}

export type Next = () => Promise<Response>;
export type Middleware = (ctx: Context, next: Next) => Promise<Response>;
export type Handler = (ctx: Context) => Promise<Response>;

export function chain(middlewares: readonly Middleware[], handler: Handler): Handler {
  return (ctx) => {
    const run = (i: number): Promise<Response> => {
      const middleware = middlewares[i];
      if (middleware === undefined) return handler(ctx);
      let called = false;
      return middleware(ctx, () => {
        if (called) throw new Error("next() called twice");
        called = true;
        return run(i + 1);
      });
    };
    return run(0);
  };
}

export const handleErrors: Middleware = async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    console.log(`error on ${ctx.path}: ${(error as Error).message}`);
    return { status: 500, body: "internal error" };
  }
};

export function authenticate(users: ReadonlyMap<string, NonNullable<Context["user"]>>): Middleware {
  return async (ctx, next) => {
    const user = ctx.token === undefined ? undefined : users.get(ctx.token);
    if (user === undefined) return { status: 401, body: "log in first" };
    ctx.user = user;
    return next();
  };
}

export function requireRole(role: "admin" | "support"): Middleware {
  return async (ctx, next) => (ctx.user?.role === role ? next() : { status: 403, body: `${role}s only` });
}
```

`chain` calls the first middleware with a `next` function that runs the rest of the chain. A middleware that returns without calling `next` **short-circuits**: the handler never runs. The guard against calling `next` twice catches a classic bug (running the handler, and so the refund, twice). Now the export route cannot exist without the checks, because the checks are the chain it is built from:

chain-test.ts

```ts
import { authenticate, chain, handleErrors, requireRole, type Handler } from "./chain.js";

const users = new Map([
  ["t-ngozi", { name: "ngozi", role: "admin" as const }],
  ["t-musa", { name: "musa", role: "support" as const }],
]);

const adminRoute = (handler: Handler) => chain([handleErrors, authenticate(users), requireRole("admin")], handler);

const exportCustomers = adminRoute(async (ctx) => ({ status: 200, body: `export started by ${ctx.user?.name}` }));
const broken = adminRoute(async () => {
  throw new Error("database connection lost");
});

console.log(await exportCustomers({ path: "/admin/customers/export" }));
console.log(await exportCustomers({ path: "/admin/customers/export", token: "t-musa" }));
console.log(await exportCustomers({ path: "/admin/customers/export", token: "t-ngozi" }));
console.log(await broken({ path: "/admin/report", token: "t-ngozi" }));
```

Output of `npx tsx chain-test.ts` and of the browser terminal

```json
{ status: 401, body: 'log in first' }
{ status: 403, body: 'admins only' }
{ status: 200, body: 'export started by ngozi' }
error on /admin/report: database connection lost
{ status: 500, body: 'internal error' }
```

The order of the links is a design decision. `handleErrors` must be first (outermost) or it cannot catch errors from the links after it. `authenticate` must come before `requireRole`, which needs `ctx.user`. A rate limiter usually goes *before* authentication, so that password guessing is limited too. This is the same onion you saw with decorators in [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural#decorator): each middleware wraps everything after it.

### The classic form: first handler that can, handles it

In the original form of the pattern, each link decides whether it can handle the request *at all*, and passes it on only if it cannot. Refund approvals work this way: support staff can approve up to ₦5,000, a manager up to ₦100,000, and anything larger goes to finance:

approval-chain.ts

```ts
interface Approver {
  approve(amountKobo: number): string;
}

function approver(name: string, limitKobo: number, next?: Approver): Approver {
  return {
    approve(amountKobo) {
      if (amountKobo <= limitKobo) return `${name} approves NGN ${(amountKobo / 100).toFixed(2)}`;
      if (next === undefined) return `nobody can approve NGN ${(amountKobo / 100).toFixed(2)}`;
      return next.approve(amountKobo);
    },
  };
}

const approvals = approver("support", 500_000, approver("manager", 10_000_000, approver("finance", 100_000_000)));
for (const amount of [300_000, 4_500_000, 25_000_000, 500_000_000]) console.log(approvals.approve(amount));
```

Output of `npx tsx approval-chain.ts` and of the browser terminal

```ts
support approves NGN 3000.00
manager approves NGN 45000.00
finance approves NGN 250000.00
nobody can approve NGN 5000000.00
```

The request always gets exactly one answer, including "nobody", and changing the limits or adding a level changes the chain in one place, not every caller.

### The same idea with @zudojs/middleware

`@zudojs/middleware` provides a general pipeline for any kind of context, with names for every link and a result that says which links ran. The middleware signature is the same `(context, next)` shape. It runs in Node (it is not part of the browser bundle), so run this one on your computer:

zudo-chain.tsNode.js only

```ts
import { createPipeline } from "@zudojs/middleware";
import type { Middleware } from "@zudojs/middleware";

interface Ctx {
  readonly token?: string;
  user?: string;
}
type Res = { readonly status: number; readonly body: string };

const authenticate: Middleware<Ctx, Res> = async (ctx, next) => {
  if (ctx.token !== "t-ngozi") return { status: 401, body: "log in first" };
  ctx.user = "ngozi";
  return next();
};
const logStatus: Middleware<Ctx, Res> = async (ctx, next) => {
  const response = await next();
  console.log("log:", response.status);
  return response;
};

const exportCustomers = createPipeline<Ctx, Res>(
  [
    { name: "log", handler: logStatus },
    { name: "authenticate", handler: authenticate },
  ],
  async (ctx) => ({ status: 200, body: `export started by ${ctx.user}` }),
);

for (const ctx of [{}, { token: "t-ngozi" }]) {
  const outcome = await exportCustomers(ctx);
  if (outcome.success) console.log(outcome.result, outcome.executedMiddleware);
}
```

Output of `npx tsx zudo-chain.ts`

```ts
log: 401
{ status: 401, body: 'log in first' } [ 'log', 'authenticate' ]
log: 200
{ status: 200, body: 'export started by ngozi' } [ 'log', 'authenticate' ]
```

The pipeline captures a thrown error as `{ success: false, error }` by default instead of throwing, and supports priorities and per-link enabling. [Middleware in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-middleware) covers the HTTP side and this package, and [Middleware pipelines](https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines) builds a complete logging, authentication, authorization, validation and rate-limit chain with it.

## Choosing a pattern

| Symptom | Pattern | What it buys |
| --- | --- | --- |
| A `switch` or `if` chain of business rules that grows with every campaign or option | Strategy | each rule on its own, tested alone, added without editing others |
| A use case that calls more and more follow-up work, owned by other teams | Observer | the publisher stops changing; one failing reaction cannot break the rest |
| Actions that must be undone, audited, retried, or run later somewhere else | Command | actions become objects (or data) that can be stored, queued and replayed |
| The same checks copied in front of many handlers | Chain of responsibility | checks written once, applied to every route, in a chosen order |

Each pattern also moves the flow of control somewhere less visible: into a list of strategies, a set of subscribers, a queue, a chain. That is the price. Pay it where the symptom is real; a function with two `if`s does not need a strategy.

## Testing behavioural patterns

- **Strategies** are tested one by one, with the time and the order passed in, plus one test that the list offered to customers is what you expect.
- **Observers** are tested in two halves: the publisher publishes the right event (subscribe a recording observer), and each observer does the right thing when given an event directly. Add one test that a throwing observer does not break the publisher.
- **Commands** are tested by executing and undoing and checking that the state is back where it started, including batches, and that undo captures the state at execution time.
- **Chains** are tested per middleware (short-circuit and pass-through cases) and once as a whole route, including the order: an error thrown by the handler must reach the error middleware.

## Practice

TRY IT YOURSELF

### Add a strategy for heavy goods

The shop starts selling 50 kg bags of rice. Add a `freight` strategy: available only for orders of 30 kg or more, ₦10,000 plus ₦150 per kg. Without editing `shipping.ts`, show the options for a 40 kg order outside Lagos and prove freight is not offered for 29.5 kg.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`available` is a simple comparison: `(order) => order.weightKg >= 30`.

HINT 2

`feeKobo`: `(order) => 1_000_000 + Math.ceil(order.weightKg) * 15_000`. `Math.ceil` matches how `express` rounds weight up above.

SOLUTION

freight.ts

```ts
import { allStrategies, shippingOptions, type ShippingStrategy } from "./shipping.js";

const freight: ShippingStrategy = {
  id: "freight",
  available: (order) => order.weightKg >= 30,
  feeKobo: (order) => 1_000_000 + Math.ceil(order.weightKg) * 15_000,
};

const strategies = [...allStrategies, freight];
const now = new Date("2026-03-02T09:00:00Z");

console.log(shippingOptions({ subtotalKobo: 4_000_000, zone: "other", weightKg: 40 }, now, strategies));
const light = shippingOptions({ subtotalKobo: 4_000_000, zone: "other", weightKg: 29.5 }, now, strategies);
console.log(light.some((o) => o.id === "freight") ? "FAIL freight offered" : "PASS no freight under 30 kg");
```

Output of `npx tsx freight.ts` and of the browser terminal

```json
[
  { id: 'standard', feeKobo: 350000 },
  { id: 'express', feeKobo: 1400000 },
  { id: 'pickup', feeKobo: 0 },
  { id: 'freight', feeKobo: 1600000 }
]
PASS no freight under 30 kg
```

The new method brings its own availability rule and fee. Nothing else changed. Notice that `standard` is still offered for 40 kg: whether it should be is a business question the strategy list now makes easy to see and to answer.

TRY IT YOURSELF

### An undoable deactivation

Write a `deactivateProduct(store, sku)` command for a store that tracks which products are active. Undo must restore the *previous* state, even if the product was already inactive. Run it through `CommandHistory` and show the audit log.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`execute`: `wasActive = store.isActive(sku); store.setActive(sku, false);`, the same two lines as `disableFlag` above.

HINT 2

`undo`: `if (wasActive === undefined) throw new Error("cannot undo a command that never ran"); store.setActive(sku, wasActive);`.

SOLUTION

deactivate.ts

```ts
import { CommandHistory, type Command } from "./commands.js";

class ProductStore {
  readonly #active = new Map<string, boolean>([["RICE-5KG", true], ["OIL-1L", false]]);
  isActive(sku: string): boolean {
    return this.#active.get(sku) ?? false;
  }
  setActive(sku: string, active: boolean): void {
    this.#active.set(sku, active);
  }
}

function deactivateProduct(store: ProductStore, sku: string): Command {
  let wasActive: boolean | undefined;
  return {
    description: `deactivate ${sku}`,
    execute() {
      wasActive = store.isActive(sku);
      store.setActive(sku, false);
    },
    undo() {
      if (wasActive === undefined) throw new Error("cannot undo a command that never ran");
      store.setActive(sku, wasActive);
    },
  };
}

const store = new ProductStore();
const history = new CommandHistory();
history.run(deactivateProduct(store, "RICE-5KG"), "musa");
history.run(deactivateProduct(store, "OIL-1L"), "musa");
history.undo("ngozi");
history.undo("ngozi");
console.log(store.isActive("RICE-5KG"), store.isActive("OIL-1L"));
console.log(history.audit);
```

Output of `npx tsx deactivate.ts` and of the browser terminal

```ts
true false
[
  'musa: deactivate RICE-5KG',
  'musa: deactivate OIL-1L',
  'ngozi: undo deactivate OIL-1L',
  'ngozi: undo deactivate RICE-5KG'
]
```

A naive undo that always sets `active = true` would have switched on oil, which was inactive before anyone touched it. Capturing the state at execution time makes undo exact, and the history undoes in reverse order.

TRY IT YOURSELF

### A rate-limit link

Write `rateLimit(max)`, a middleware for the chain above that allows at most `max` requests per token (or per `"anonymous"`) and answers 429 after that. Put it where it also protects against password guessing, and show a fourth anonymous attempt being refused before authentication runs.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`const key = ctx.token ?? "anonymous"; const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);`.

HINT 2

`if (count > max) return { status: 429, body: "too many requests" }; return next();`.

SOLUTION

rate-limit.ts

```ts
import { authenticate, chain, handleErrors, type Middleware } from "./chain.js";

function rateLimit(max: number): Middleware {
  const counts = new Map<string, number>();
  return async (ctx, next) => {
    const key = ctx.token ?? "anonymous";
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > max) return { status: 429, body: "too many requests" };
    return next();
  };
}

const users = new Map([["t-ngozi", { name: "ngozi", role: "admin" as const }]]);
const route = chain([handleErrors, rateLimit(3), authenticate(users)], async (ctx) => ({ status: 200, body: `hi ${ctx.user?.name}` }));

for (let attempt = 1; attempt <= 4; attempt++) {
  const response = await route({ path: "/admin", token: undefined });
  console.log(attempt, response.status);
}
console.log(await route({ path: "/admin", token: "t-ngozi" }));
```

Output of `npx tsx rate-limit.ts` and of the browser terminal

```ts
1 401
2 401
3 401
4 429
{ status: 200, body: 'hi ngozi' }
```

Because the limiter runs before `authenticate`, failed logins count too, which is what stops guessing. Keyed by token, one caller's limit does not affect another. A production limiter would use time windows and a shared store instead of a `Map` in one process; [Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting) covers the algorithms.

## Recap

- **Strategy**: interchangeable rules behind one interface, chosen at run time. Each rule is tested alone and new ones are added without editing old ones. Refuse unknown ids.
- **Observer**: publish what happened; subscribers react. Isolate failures, allow unsubscribing, and keep anything that can refuse or must be atomic (stock, checks) inside the use case. In-memory events are lost on a crash; use an outbox or a durable queue for events that matter.
- **Command**: actions as objects that can be undone (capture state at execution), batched (undo in reverse) and audited. For queues, commands are plain, validated data handled by idempotent handlers.
- **Chain of responsibility**: a request passes along links that handle it or pass it on. Middleware is this pattern; the order of links is a security decision.

You now have the vocabulary of the classic patterns, each tied to a problem you have seen go wrong. Next: [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture), where these pieces are arranged into layers with controllers, services, repositories and middleware.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
