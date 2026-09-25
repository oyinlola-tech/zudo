---
title: "Type-safe CQRS — ZudoJS Academy"
description: "Build a command bus and a query bus whose requests, handlers and results are checked from one spec, so a missing handler or a wrong result will not compile."
source: https://zudojs.oyinlola.site/learn/ts-typed-cqrs
---

LEVEL 6 · LESSON 14 OF 22

Type-safe infrastructure Advanced

# Type-safe CQRS

Build a command bus and a query bus whose requests, handlers and results are checked from one spec, so a missing handler or a wrong result will not compile.

- **55 min** to read and try
- **You need:** A type-safe event system, Conditional types, and Error handling in TypeScript
- **You build:** A typed command bus and query bus for a shop, with exhaustive handler registration, typed results and errors, read-only query handlers, generic middleware, and a typed layer over @zudojs/cqrs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Separate commands (change state) from queries (read state) and explain why each has exactly one handler
- Describe every command and query in a spec map and derive request, handler and result types from it
- Make a missing handler, a wrong request field or a wrong result type a compile error
- Write middleware that is generic over every request and explain why it cannot invent a result
- Compare the map-based design with class-based requests that carry a phantom result type
- Recognise which @zudojs/cqrs types are claims, and put a typed layer over its buses

## The receipt that said "order undefined"

A shop's HTTP layer used to call services directly. As the shop grew, the team introduced a small **dispatcher**: every action the API can perform gets a name, and a table maps the name to the function that handles it. The HTTP code only says "run `order.place` with this input". It is flexible, it is easy to add logging in one place, and it is typed like this:

problem.ts

```ts
const handlers: Record<string, (input: any) => Promise<any>> = {
  "order.place": async (input) => ({ orderId: "ORD-1042", totalKobo: input.lines.length * 250_000 }),
};

async function dispatch(type: string, input: unknown): Promise<any> {
  return handlers[type](input);
}

const placed = await dispatch("order.place", { customerId: "cus_ada", lines: [{ sku: "RICE-50KG", qty: 1 }] });
console.log(`receipt for order ${placed.orderID}, ₦${placed.totalKobo / 100}`);

try {
  await dispatch("order.cancel", { orderId: "ORD-1042", reason: "changed mind" });
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
receipt for order undefined, ₦2500
TypeError: handlers[type] is not a function
```

Two bugs, zero compile errors. The receipt reads `placed.orderID` (capital D), which does not exist, because the result is `any`. And `"order.cancel"` was never registered, which the program discovers when a customer clicks "Cancel". The dispatcher idea is good; its types are not. In this lesson you keep the idea and make the compiler check every part of it: the request name, the request fields, that a handler exists for every name, and what each request returns.

The idea has a name. **CQRS**, Command Query Responsibility Segregation, splits the actions of a system into two kinds and gives each its own bus. [CQRS in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-cqrs) teaches the package; here you build the typed core yourself and then look at how `@zudojs/cqrs` types it.

## Commands, queries and events

- A **command** asks the system to change something: place an order, cancel an order, top up a wallet. It is named as an instruction, and it returns as little as possible: an id, or whether it worked and why not.
- A **query** asks for information and changes nothing: get an order, list a customer's orders. Running it twice gives the same answer (if nothing else changed in between), so it is safe to retry and to cache.
- A **bus** routes each request to its **handler**, the function that does the work. Callers depend on the bus and the request types, never on the handler classes.

You already built the third kind of message in [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events). The differences decide the types:

|  | Event | Command | Query |
| --- | --- | --- | --- |
| Meaning | Something happened | Please change this | Please tell me this |
| Name | Past tense: `order.placed` | Instruction: `order.place` | Question: `order.get` |
| Handlers | Zero or more listeners | Exactly one | Exactly one |
| Result | None for the publisher | Small: id, success or a known failure | The data asked for |
| Changes state? | Listeners may | Yes | No |

"Exactly one handler" and "a result whose type depends on the request" are the two things the type system must guarantee. "Queries change nothing" is a rule the types can only help with, as you will see.

## One spec for every request

As with the event map, everything starts from one type per bus. Each key is a request name; each value says what the request carries (`input`) and what it returns (`result`). Expected business failures, like "out of stock", are part of the result as a `Result` union (the pattern from [Error handling in TypeScript](https://zudojs.oyinlola.site/learn/ts-errors#results)), so callers must handle them. Bugs and outages still throw.

shop-spec.ts

```ts
export type Result<T, E extends string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface Line {
  readonly sku: string;
  readonly qty: number;
}

export interface OrderView {
  readonly orderId: string;
  readonly customerId: string;
  readonly totalKobo: number;
  readonly status: "placed" | "cancelled";
}

export interface ShopCommands {
  "order.place": {
    input: { customerId: string; lines: readonly Line[] };
    result: Result<{ orderId: string; totalKobo: number }, "empty-order" | "unknown-product" | "out-of-stock">;
  };
  "order.cancel": {
    input: { orderId: string; reason: string };
    result: Result<void, "not-found" | "already-cancelled">;
  };
}

export interface ShopQueries {
  "order.get": { input: { orderId: string }; result: OrderView | undefined };
  "orders.forCustomer": { input: { customerId: string }; result: readonly OrderView[] };
}
```

From the spec, derive the request type (the input plus a `type` field naming it), the result type, the handler type and a **handler table** type with one handler per name:

cqrs-types.ts

```ts
export interface Spec {
  readonly input: object;
  readonly result: unknown;
}
export type Specs<S> = { readonly [K in keyof S]: Spec };

export type RequestName<S> = keyof S & string;
export type RequestOf<S extends Specs<S>, K extends RequestName<S>> = { readonly type: K } & Readonly<S[K]["input"]>;
export type ResultOf<S extends Specs<S>, K extends RequestName<S>> = S[K]["result"];

export type Handler<S extends Specs<S>, K extends RequestName<S>> = (request: RequestOf<S, K>) => ResultOf<S, K> | Promise<ResultOf<S, K>>;
export type Handlers<S extends Specs<S>> = { readonly [K in RequestName<S>]: Handler<S, K> };

export type Middleware<S extends Specs<S>> = <K extends RequestName<S>>(
  request: RequestOf<S, K>,
  next: () => Promise<ResultOf<S, K>>,
) => Promise<ResultOf<S, K>>;
```

- `S extends Specs<S>` is a **self-referencing constraint**: "every property of `S` must be a `Spec`". Unlike `Record<string, Spec>`, it accepts interfaces, which have no index signature (the problem you met with `EventUnion` in the previous lesson), and it still checks each entry.
- `RequestOf` is an intersection: `{ type: "order.cancel" } & Readonly<{ orderId: string; reason: string }>`. Callers write one flat object literal.
- Handlers may be synchronous or asynchronous; the bus always returns a promise.

spec-facts.ts

```ts
import type { RequestName, RequestOf, ResultOf } from "./cqrs-types.js";
import type { OrderView, ShopCommands, ShopQueries } from "./shop-spec.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type F1 = Expect<Equal<RequestName<ShopCommands>, "order.place" | "order.cancel">>;
type F2 = Expect<Equal<ResultOf<ShopQueries, "order.get">, OrderView | undefined>>;
type F3 = Expect<Equal<RequestOf<ShopQueries, "order.get">["orderId"], string>>;
type F4 = Expect<Equal<RequestOf<ShopCommands, "order.cancel">["type"], "order.cancel">>;

console.log("the spec's derived types are what they claim");
```

Output of `npx tsx spec-facts.ts` and of the browser terminal

```ts
the spec's derived types are what they claim
```

## A generic bus

REASON IT OUT

### Before you write the bus

The bus has one public method, `execute(request)`. Before reading the code, think:

- How can the compiler know that *every* command has a handler? What if handlers are registered one by one with `register(name, handler)`?
- What must `execute` do when a request arrives with a name that has no handler, even though the types say that cannot happen?
- Can the same bus class serve both commands and queries? What would differ?
- A command may be sent twice because the customer double-clicked or the network retried. Whose problem is that?

**Show the reasoning**

With one-by-one registration, the compiler sees a series of calls and cannot know whether the last command was registered. If the bus receives the whole handler table at once, typed `Handlers<S>`, a missing handler becomes a missing property: a compile error. The bus must still check at runtime, because requests can come from JavaScript callers, from `any`, or from data that was never checked; a clear error is better than `undefined is not a function`. The same class serves both buses: the spec differs, and the rule that queries change nothing is enforced elsewhere (below). Duplicates are the command handler's problem: the types cannot see time or retries. The production section returns to it.

bus.ts

```ts
import type { Handler, Handlers, Middleware, RequestName, RequestOf, ResultOf, Specs } from "./cqrs-types.js";

export class Bus<S extends Specs<S>> {
  readonly #middleware: Middleware<S>[] = [];

  constructor(
    readonly kind: "command" | "query",
    private readonly handlers: Handlers<S>,
  ) {}

  use(middleware: Middleware<S>): this {
    this.#middleware.push(middleware);
    return this;
  }

  execute<K extends RequestName<S>>(request: RequestOf<S, K>): Promise<ResultOf<S, K>> {
    const handler: Handler<S, K> | undefined = Object.hasOwn(this.handlers, request.type) ? this.handlers[request.type] : undefined;
    if (!handler) return Promise.reject(new Error(`no ${this.kind} handler for "${request.type}"`));
    const run = async (index: number): Promise<ResultOf<S, K>> =>
      index < this.#middleware.length ? this.#middleware[index]!(request, () => run(index + 1)) : handler(request);
    return run(0);
  }
}
```

There is no cast in this class. `K` is inferred from the request's `type` field, `this.handlers[request.type]` is `Handlers<S>[K]`, which TypeScript resolves to exactly `Handler<S, K>`, and so the handler's result is the request's result. The mapped handler table is what makes that possible: unlike the listener storage of the event bus, it has one precisely typed property per name. The `run` function builds the **middleware pipeline**: each middleware gets the request and a `next` function that runs the rest of the chain, ending with the handler. Here is what the compiler now refuses:

misuse.ts

```ts
import { Bus } from "./bus.js";
import type { ShopCommands } from "./shop-spec.js";

const commands = new Bus<ShopCommands>("command", {
  "order.place": () => ({ ok: true, value: { orderId: "ORD-1", totalKobo: 100 } }),
});

declare const bus: Bus<ShopCommands>;
await bus.execute({ type: "order.refund", orderId: "ORD-1" });
await bus.execute({ type: "order.cancel", orderId: "ORD-1" });
const placed = await bus.execute({ type: "order.place", customerId: "cus_ada", lines: [] });
console.log(placed.value.orderId);
```

What `npx tsc --noEmit` prints

```ts
misuse.ts:4:51 - error TS2741: Property '"order.cancel"' is missing in type '{ "order.place": () => { ok: true; value: { orderId: string; totalKobo: number; }; }; }' but required in type 'Handlers<ShopCommands>'.

4 const commands = new Bus<ShopCommands>("command", {
                                                    ~
5   "order.place": () => ({ ok: true, value: { orderId: "ORD-1", totalKobo: 100 } }),
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
6 });
  ~

misuse.ts:9:21 - error TS2322: Type '"order.refund"' is not assignable to type 'RequestName<ShopCommands>'.

9 await bus.execute({ type: "order.refund", orderId: "ORD-1" });
                      ~~~~

  cqrs-types.ts:8:82 - The expected type comes from property 'type' which is declared here on type 'RequestOf<ShopCommands, RequestName<ShopCommands>>'
    8 export type RequestOf<S extends Specs<S>, K extends RequestName<S>> = { readonly type: K } & Readonly<S[K]["input"]>;
                                                                                       ~~~~

misuse.ts:10:19 - error TS2345: Argument of type '{ type: "order.cancel"; orderId: string; }' is not assignable to parameter of type 'RequestOf<ShopCommands, "order.cancel">'.
  Property 'reason' is missing in type '{ type: "order.cancel"; orderId: string; }' but required in type 'Readonly<{ orderId: string; reason: string; }>'.

10 await bus.execute({ type: "order.cancel", orderId: "ORD-1" });
                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  shop-spec.ts:21:31 - 'reason' is declared here.
    21     input: { orderId: string; reason: string };
                                     ~~~~~~

misuse.ts:12:20 - error TS2339: Property 'value' does not exist on type 'Result<{ orderId: string; totalKobo: number; }, "empty-order" | "out-of-stock" | "unknown-product">'.
  Property 'value' does not exist on type '{ readonly ok: false; readonly error: "empty-order" | "out-of-stock" | "unknown-product"; }'.

12 console.log(placed.value.orderId);
                      ~~~~~


Found 4 errors in the same file, starting at: misuse.ts:4
```

Every bug from the opening story is now an error: the missing `"order.cancel"` handler, an unknown request name, a missing field, and reading the result without checking whether it succeeded (the old `orderID` typo would be an error too). The first error is the one no event system could give you: **exhaustive registration**. Add a command to `ShopCommands`, and the program does not compile until someone writes its handler. A spec entry without a `result` is refused as well, by the `Specs` constraint.

## Handlers, and a read side that cannot write

A tiny in-memory store stands in for the database. The command handlers get the whole store. The query handlers get only an `OrderReader`: a type that has the `get` and `values` methods of a read-only map, and nothing else.

store.ts

```ts
import type { OrderView } from "./shop-spec.js";

export interface Product {
  readonly priceKobo: number;
  stock: number;
}

export class ShopStore {
  readonly products = new Map<string, Product>([
    ["RICE-50KG", { priceKobo: 7_500_000, stock: 4 }],
    ["OIL-5L", { priceKobo: 1_200_000, stock: 0 }],
  ]);
  readonly orders = new Map<string, OrderView>();
  #nextId = 1042;

  nextOrderId(): string {
    return `ORD-${this.#nextId++}`;
  }
}

export type OrderReader = Pick<ReadonlyMap<string, OrderView>, "get" | "values">;
```

handlers.ts

```ts
import type { Handlers } from "./cqrs-types.js";
import type { ShopCommands, ShopQueries } from "./shop-spec.js";
import type { OrderReader, ShopStore } from "./store.js";

export function commandHandlers(store: ShopStore): Handlers<ShopCommands> {
  return {
    "order.place": (cmd) => {
      if (cmd.lines.length === 0) return { ok: false, error: "empty-order" };
      let totalKobo = 0;
      for (const line of cmd.lines) {
        const product = store.products.get(line.sku);
        if (!product) return { ok: false, error: "unknown-product" };
        if (product.stock < line.qty) return { ok: false, error: "out-of-stock" };
        totalKobo += product.priceKobo * line.qty;
      }
      for (const line of cmd.lines) store.products.get(line.sku)!.stock -= line.qty;
      const orderId = store.nextOrderId();
      store.orders.set(orderId, { orderId, customerId: cmd.customerId, totalKobo, status: "placed" });
      return { ok: true, value: { orderId, totalKobo } };
    },
    "order.cancel": (cmd) => {
      const order = store.orders.get(cmd.orderId);
      if (!order) return { ok: false, error: "not-found" };
      if (order.status === "cancelled") return { ok: false, error: "already-cancelled" };
      store.orders.set(cmd.orderId, { ...order, status: "cancelled" });
      return { ok: true, value: undefined };
    },
  };
}

export function queryHandlers(orders: OrderReader): Handlers<ShopQueries> {
  return {
    "order.get": (query) => orders.get(query.orderId),
    "orders.forCustomer": (query) => [...orders.values()].filter((o) => o.customerId === query.customerId),
  };
}
```

No handler parameter has an annotation: the return type `Handlers<ShopCommands>` types each property's `cmd` from its key, and each returned object is checked against that command's result, so `error: "sold-out"` would be refused. The placement handler checks every line before it changes any stock, so a failed order leaves the store untouched.

app.ts

```ts
import { Bus } from "./bus.js";
import { commandHandlers, queryHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { ShopCommands, ShopQueries } from "./shop-spec.js";

const store = new ShopStore();
const commands = new Bus<ShopCommands>("command", commandHandlers(store));
const queries = new Bus<ShopQueries>("query", queryHandlers(store.orders));

const placed = await commands.execute({ type: "order.place", customerId: "cus_ada", lines: [{ sku: "RICE-50KG", qty: 2 }] });
if (placed.ok) console.log(`placed ${placed.value.orderId} for ₦${placed.value.totalKobo / 100}`);

const noOil = await commands.execute({ type: "order.place", customerId: "cus_ada", lines: [{ sku: "OIL-5L", qty: 1 }] });
if (!noOil.ok) console.log("refused:", noOil.error);

console.log(await commands.execute({ type: "order.cancel", orderId: "ORD-1042", reason: "changed mind" }));
console.log(await commands.execute({ type: "order.cancel", orderId: "ORD-1042", reason: "clicked twice" }));

const mine = await queries.execute({ type: "orders.forCustomer", customerId: "cus_ada" });
console.log(mine.map((o) => `${o.orderId}:${o.status}`).join(", "));
console.log("rice left:", store.products.get("RICE-50KG")?.stock);
```

Output of `npx tsx app.ts` and of the browser terminal

```ts
placed ORD-1042 for ₦150000
refused: out-of-stock
{ ok: true, value: undefined }
{ ok: false, error: 'already-cancelled' }
ORD-1042:cancelled
rice left: 2
```

The query bus received `store.orders`, a full `Map`, where an `OrderReader` was expected. That is allowed, because a `Map` has `get` and `values`. But inside the query handlers the type has no `set` and no `delete`, so a query that tries to write does not compile:

query-writes.ts

```ts
import type { Handlers } from "./cqrs-types.js";
import type { ShopQueries } from "./shop-spec.js";
import type { OrderReader } from "./store.js";

export function sneakyQueries(orders: OrderReader): Handlers<ShopQueries> {
  return {
    "order.get": (query) => {
      orders.delete(query.orderId);
      return undefined;
    },
    "orders.forCustomer": () => [],
  };
}
```

What `npx tsc --noEmit` prints

```ts
query-writes.ts:8:14 - error TS2339: Property 'delete' does not exist on type 'OrderReader'.

8       orders.delete(query.orderId);
               ~~~~~~


Found 1 error in query-writes.ts:8
```

This is how types *help* with "queries change nothing": give the read side a narrower interface (sometimes called a **capability**). It is not a proof. A query handler could still import the store module directly, or cast. Code review and architecture tests ([Modular monoliths](https://zudojs.oyinlola.site/learn/zudo-modular-monolith) shows one kind) do the rest.

### Results the HTTP layer can trust

Because the failures are a closed union inside the result type, the HTTP layer can derive them and must map every one to a status code. A new failure added to the spec breaks the build until it gets a status:

endpoint.ts

```ts
import { Bus } from "./bus.js";
import { commandHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { RequestOf, ResultOf } from "./cqrs-types.js";
import type { ShopCommands } from "./shop-spec.js";

type ErrorOf<R> = R extends { readonly ok: false; readonly error: infer E } ? E : never;
type PlaceError = ErrorOf<ResultOf<ShopCommands, "order.place">>;

const statusFor: Record<PlaceError, number> = { "empty-order": 400, "unknown-product": 422, "out-of-stock": 409 };

const commands = new Bus<ShopCommands>("command", commandHandlers(new ShopStore()));

async function postOrder(body: Omit<RequestOf<ShopCommands, "order.place">, "type">): Promise<string> {
  const result = await commands.execute({ type: "order.place", ...body });
  return result.ok ? `201 ${JSON.stringify(result.value)}` : `${statusFor[result.error]} ${result.error}`;
}

console.log(await postOrder({ customerId: "cus_tunde", lines: [{ sku: "RICE-50KG", qty: 1 }] }));
console.log(await postOrder({ customerId: "cus_tunde", lines: [{ sku: "YAM-TUBER", qty: 1 }] }));
console.log(await postOrder({ customerId: "cus_tunde", lines: [] }));
```

Output of `npx tsx endpoint.ts` and of the browser terminal

```ts
201 {"orderId":"ORD-1042","totalKobo":7500000}
422 unknown-product
400 empty-order
```

`ErrorOf` is a conditional type with `infer` from [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#infer): it pulls the error union out of the result. The `body` parameter type is also derived, so the endpoint and the command can never disagree about the fields. In a real API the body comes from JSON and must be validated first, exactly like events from a queue in the previous lesson.

## Middleware that works for every request

Logging, authorization, timing, "refuse writes during maintenance": these apply to every command, whatever its type. The `Middleware<S>` type is a **generic function type**: the type parameter `K` sits on the function itself, so one middleware value works for every request name, and for each call its `next()` returns that request's result:

middleware.ts

```ts
import { Bus } from "./bus.js";
import { commandHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { Middleware } from "./cqrs-types.js";
import type { ShopCommands } from "./shop-spec.js";

const audit: Middleware<ShopCommands> = async (command, next) => {
  console.log(`-> ${command.type}`);
  const result = await next();
  console.log(`<- ${command.type} ${JSON.stringify(result)}`);
  return result;
};

let maintenance = false;
const maintenanceGuard: Middleware<ShopCommands> = async (command, next) => {
  if (maintenance) throw new Error(`${command.type} refused: the shop is in maintenance`);
  return next();
};

const commands = new Bus<ShopCommands>("command", commandHandlers(new ShopStore())).use(audit).use(maintenanceGuard);

await commands.execute({ type: "order.place", customerId: "cus_tunde", lines: [{ sku: "RICE-50KG", qty: 1 }] });
maintenance = true;
await commands.execute({ type: "order.cancel", orderId: "ORD-1042", reason: "late" }).catch((e: unknown) => console.log(String(e)));
```

Output of `npx tsx middleware.ts` and of the browser terminal

```ts
-> order.place
<- order.place {"ok":true,"value":{"orderId":"ORD-1042","totalKobo":7500000}}
-> order.cancel
Error: order.cancel refused: the shop is in maintenance
```

Notice what a generic middleware *cannot* do. Inside it, `K` is unknown, so `ResultOf<S, K>` is unknown too, and the only values of that type it can get are the ones `next()` produces. It can pass the result through, wait, log or throw, but it cannot invent a result. That property (a generic function can only return what it was given) is called **parametricity**, and it is a real guarantee. Here is a query cache that tries to return a stored value:

cache-misuse.ts

```ts
import type { Middleware } from "./cqrs-types.js";
import type { ShopQueries } from "./shop-spec.js";

const cache = new Map<string, unknown>();

export const cached: Middleware<ShopQueries> = async (query, next) => {
  const key = JSON.stringify(query);
  if (cache.has(key)) return cache.get(key);
  const result = await next();
  cache.set(key, result);
  return result;
};
```

What `npx tsc --noEmit` prints

```ts
cache-misuse.ts:6:14 - error TS2322: Type '<K extends RequestName<ShopQueries>>(query: RequestOf<ShopQueries, K>, next: () => Promise<ResultOf<ShopQueries, K>>) => Promise<...>' is not assignable to type 'Middleware<ShopQueries>'.
  Type 'Promise<unknown>' is not assignable to type 'Promise<ResultOf<ShopQueries, K>>'.
    Type 'unknown' is not assignable to type 'ResultOf<ShopQueries, K>'.
      Type 'unknown' is not assignable to type 'OrderView | readonly OrderView[] | undefined'.

6 export const cached: Middleware<ShopQueries> = async (query, next) => {
               ~~~~~~


Found 1 error in cache-misuse.ts:6
```

The compiler is right to refuse: nothing proves the cached value belongs to *this* query type. A correct cache needs one cast, justified because the key includes the query's `type`, so a value stored under that key was produced by the same handler. The second exercise builds it.

## Another design: requests that carry their result type

Many libraries (MediatR in .NET, several NestJS CQRS modules) use classes instead of a spec map: each request is a class, and the class declares its result type as a type argument of its base class. The bus reads the result type from the request object itself:

class-bus.ts

```ts
export abstract class Request<TResult> {
  declare readonly __result: TResult;
}

type ResultOf<R> = R extends Request<infer T> ? T : never;
type RequestClass<R> = abstract new (...args: never[]) => R;
type AnyHandler = (request: never) => unknown;

export class ClassBus {
  readonly #handlers = new Map<RequestClass<unknown>, AnyHandler>();

  register<R extends Request<unknown>>(type: RequestClass<R>, handler: (request: R) => Promise<ResultOf<R>>): this {
    if (this.#handlers.has(type)) throw new Error(`${type.name} already has a handler`);
    this.#handlers.set(type, handler);
    return this;
  }

  async execute<T>(request: Request<T>): Promise<T> {
    const handler = this.#handlers.get(request.constructor as RequestClass<unknown>);
    if (!handler) throw new Error(`no handler for ${request.constructor.name}`);
    return (handler as (request: Request<T>) => Promise<T>)(request);
  }
}
```

class-demo.ts

```ts
import { ClassBus, Request } from "./class-bus.js";

class PlaceOrder extends Request<{ orderId: string; totalKobo: number }> {
  constructor(
    readonly customerId: string,
    readonly skus: readonly string[],
  ) {
    super();
  }
}

class CancelOrder extends Request<boolean> {
  constructor(readonly orderId: string) {
    super();
  }
}

const bus = new ClassBus().register(PlaceOrder, async (command) => ({
  orderId: "ORD-2001",
  totalKobo: command.skus.length * 1_200_000,
}));

const placed = await bus.execute(new PlaceOrder("cus_ada", ["OIL-5L", "OIL-5L"]));
console.log(placed.orderId, placed.totalKobo);
console.log(Object.keys(new CancelOrder("ORD-2001")));
await bus.execute(new CancelOrder("ORD-2001")).catch((error: unknown) => console.log(String(error)));
```

Output of `npx tsx class-demo.ts` and of the browser terminal

```ts
ORD-2001 2400000
[ 'orderId' ]
Error: no handler for CancelOrder
```

`declare readonly __result: TResult` is a **phantom property**: it exists only in the type. `declare` tells TypeScript not to emit a field for it, which is why `Object.keys` shows only `orderId`. Why have it at all? TypeScript compares types by structure. A type parameter that appears in no property changes nothing about the structure, so `Request<boolean>` and `Request<string>` would be the same type, and there would be nothing for `execute` to infer from:

no-phantom.ts

```ts
abstract class LooseRequest<TResult> {}

class GetBalance extends LooseRequest<number> {
  constructor(readonly accountId: string) {
    super();
  }
}

declare function execute<T>(request: LooseRequest<T>): Promise<T>;

const balance = await execute(new GetBalance("ACC-001"));
console.log(balance.toFixed(2));
```

What `npx tsc --noEmit` prints

```ts
no-phantom.ts:12:13 - error TS18046: 'balance' is of type 'unknown'.

12 console.log(balance.toFixed(2));
               ~~~~~~~


Found 1 error in no-phantom.ts:12
```

Both designs are type-safe for callers. They differ in what else they give you:

|  | Spec map + handler table | Request classes + phantom result |
| --- | --- | --- |
| Missing handler | Compile error | Runtime error (as above) |
| Where a request is described | One entry in one interface | One class per request, anywhere |
| Serialisable (queues, logs, HTTP) | Plain objects with a `type` field | Class instances; need to be rebuilt after `JSON.parse` |
| Modules adding requests later | They must extend the spec and supply handlers together | Easy: define a class, register a handler |
| Routing key | The `type` string | The constructor (breaks if two copies of a module are loaded) |

## What the types cannot guarantee

Be precise about where the compiler's help ends, so you know what to test:

- **Input from outside.** An HTTP body typed as `RequestOf<…>` without validation is a claim. Validate at the boundary ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)).
- **Queries that write.** A narrow `OrderReader` makes accidents unlikely; it does not stop a determined import or cast.
- **Registration that happens at runtime.** Exhaustiveness only works when the whole handler table is known at compile time. A bus filled by plugins or by scanning folders can only fail at startup, so check at startup: compare the registered names with a list and refuse to start if one is missing.
- **Time.** A command executed twice (a retry, a double click) is two valid calls. Idempotency is a runtime design: a command id and a table of processed ids ([Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency)).
- **Atomicity.** If a command handler writes two rows and crashes between them, no type notices. Commands that change several things run in a transaction ([Transactions in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-transactions)).

## The same ideas in @zudojs/cqrs

`@zudojs/cqrs` provides `CommandBus` and `QueryBus` with registration, middleware, an execution context (who is asking) and typed errors. Its request helpers are well typed: `CommandOf<"order.place", Payload>` builds the same flat request type as your `RequestOf`, and `createCommand(type, payload)` builds a frozen request object whose `type` always wins over a `type` key in the payload. Registration and execution take the request and result types as **type arguments**:

zudo-claim.ts

```ts
import { createCommand, createCommandBus } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";

type PlaceOrder = CommandOf<"order.place", { customerId: string; skus: string[] }>;
interface Placed {
  orderId: string;
  totalKobo: number;
}

const commands = createCommandBus();
commands.register<PlaceOrder, Placed>("order.place", async (command) => ({
  orderId: "ORD-3001",
  totalKobo: command.skus.length * 7_500_000,
}));

const placed = await commands.execute<PlaceOrder, Placed>(createCommand("order.place", { customerId: "cus_ada", skus: ["RICE-50KG"] }));
console.log(placed.orderId, placed.totalKobo);

const claimed = await commands.execute<PlaceOrder, string>(createCommand("order.place", { customerId: "cus_ada", skus: [] }));
console.log(typeof claimed, claimed.length);

const missing = createCommand("order.refund", { orderId: "ORD-3001" });
await commands.execute(missing).catch((error: unknown) => console.log((error as Error).name));
```

Output of `npx tsx zudo-claim.ts` and of the browser terminal

```ts
ORD-3001 7500000
object undefined
CommandHandlerNotFoundError
```

With explicit type arguments, `register` checks the name against the command type (`"order.plac"` would be refused) and the handler against both types. But `execute<PlaceOrder, string>` compiled: the result type argument is not connected to anything the bus knows, so it is a claim, and `claimed` is really the `Placed` object. Without type arguments, `execute` returns `Promise<void>`, which hides the result instead of lying about it. A missing handler is a `CommandHandlerNotFoundError` at runtime, never at compile time, because handlers are registered one by one. These are the natural trade-offs of a bus whose request names are runtime strings.

Your spec puts the compile-time guarantees back. A thin layer registers a complete handler table on a real `@zudojs/cqrs` bus and derives the result type from the spec, so the claim is made once, by code that is guaranteed to match:

typed-cqrs.ts

```ts
import { createCommandBus } from "@zudojs/cqrs";
import type { CommandBus, CommandHandlerFunction } from "@zudojs/cqrs";
import type { Handlers, RequestName, RequestOf, ResultOf, Specs } from "./cqrs-types.js";

export interface TypedCommands<S extends Specs<S>> {
  execute<K extends RequestName<S>>(command: RequestOf<S, K>): Promise<ResultOf<S, K>>;
  readonly raw: CommandBus;
}

export function typedCommands<S extends Specs<S>>(handlers: Handlers<S>, raw: CommandBus = createCommandBus()): TypedCommands<S> {
  for (const type of Object.keys(handlers) as RequestName<S>[]) {
    raw.register(type, handlers[type] as CommandHandlerFunction<{ readonly type: string }, unknown>);
  }
  return {
    execute: (command) => raw.execute(command),
    raw,
  };
}
```

use-typed.ts

```ts
import { typedCommands } from "./typed-cqrs.js";
import { commandHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { ShopCommands } from "./shop-spec.js";

const store = new ShopStore();
const commands = typedCommands<ShopCommands>(commandHandlers(store));
commands.raw.use(async (request, context, next) => {
  console.log("[zudo middleware]", request.type);
  return next(request, context);
});

const placed = await commands.execute({ type: "order.place", customerId: "cus_ada", lines: [{ sku: "RICE-50KG", qty: 1 }] });
console.log(placed.ok ? placed.value.orderId : placed.error);
console.log(commands.raw.getCommandTypes().join(", "));
```

Output of `npx tsx use-typed.ts` and of the browser terminal

```json
[zudo middleware] order.place
ORD-1042
order.place, order.cancel
```

You keep everything the package does at runtime (its middleware, context and error classes) and gain exhaustive handlers and derived results. `raw.execute(command)` inside the layer has no type arguments: TypeScript infers the result type argument from the declared return type, the same claim, now made in exactly one place. The package's `CqrsMiddleware` type sees every request as `Command | Query` and every result as `unknown`, so cross-cutting middleware like the logger above is where it fits best.

## Testing the buses

Test three things: the compiler refuses what it should (type tests), each handler's business rules (plain unit tests, calling the handler table directly, no bus needed), and the bus's own runtime behaviour (unknown names, middleware order).

bus.test.ts

```ts
import { Bus } from "./bus.js";
import { commandHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { Middleware } from "./cqrs-types.js";
import type { ShopCommands } from "./shop-spec.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label}${same ? "" : `: got ${JSON.stringify(actual)}`}`);
}

// @ts-expect-error: a command needs every field of its input
new Bus<ShopCommands>("command", commandHandlers(new ShopStore())).execute({ type: "order.cancel", orderId: "ORD-1" });

const store = new ShopStore();
const handlers = commandHandlers(store);
check("unknown sku", await handlers["order.place"]({ type: "order.place", customerId: "c", lines: [{ sku: "X", qty: 1 }] }), { ok: false, error: "unknown-product" });
check("failed order leaves stock alone", store.products.get("RICE-50KG")?.stock, 4);

const order: string[] = [];
const tag = (name: string): Middleware<ShopCommands> => async (_command, next) => {
  order.push(name);
  return next();
};
const bus = new Bus<ShopCommands>("command", handlers).use(tag("first")).use(tag("second"));
await bus.execute({ type: "order.place", customerId: "c", lines: [{ sku: "RICE-50KG", qty: 1 }] });
check("middleware runs in order", order, ["first", "second"]);

const untyped = bus as unknown as { execute(request: { type: string }): Promise<unknown> };
check("unknown name from untyped code", await untyped.execute({ type: "order.refund" }).catch((e: unknown) => String(e)), 'Error: no command handler for "order.refund"');
```

Output of `npx tsx bus.test.ts` and of the browser terminal

```ts
PASS unknown sku
PASS failed order leaves stock alone
PASS middleware runs in order
PASS unknown name from untyped code
```

The last test deliberately goes around the types, the way JavaScript callers or unchecked data would, to prove the runtime guard is there. Handlers are plain functions, so most business-rule tests never touch a bus at all.

## Typed CQRS in production

- **Keep command results small.** An id and a closed union of failures. If the caller needs the full order, it sends a query afterwards. Small results keep commands easy to retry and to move to a queue later.
- **Every failure a user can cause belongs in the result union;** everything else throws. Then `Record<Error, Status>` forces the API layer to answer every expected failure precisely, and unexpected ones become a generic 500 with a log entry.
- **Commands carry an id when they can be retried,** and the handler records processed ids in the same transaction as its writes.
- **Handlers announce, they do not call each other.** After `order.place` succeeds, the handler publishes `order.placed` on the event bus from the previous lesson; e-mail and analytics listen. A handler that executes other commands creates hidden chains that are hard to test.
- **Do not use CQRS everywhere.** A small CRUD service does not need two buses. The pattern pays off when commands have real rules, reads have different shapes than writes, and cross-cutting middleware saves real duplication. [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system) shows it at scale.

## Practice

TRY IT YOURSELF

### A wallet top-up command

Add a `"wallet.topUp"` command to a new spec: input `{ walletId: string; kobo: number }`, result `Result<{ balanceKobo: number }, "invalid-amount" | "wallet-not-found">`. Write the handler table and run three top-ups: a valid one, a negative amount and an unknown wallet.

**Show a solution**

wallet.ts

```ts
import { Bus } from "./bus.js";
import type { Handlers } from "./cqrs-types.js";
import type { Result } from "./shop-spec.js";

interface WalletCommands {
  "wallet.topUp": {
    input: { walletId: string; kobo: number };
    result: Result<{ balanceKobo: number }, "invalid-amount" | "wallet-not-found">;
  };
}

const balances = new Map([["WAL-1", 50_000]]);

const handlers: Handlers<WalletCommands> = {
  "wallet.topUp": ({ walletId, kobo }) => {
    if (!Number.isInteger(kobo) || kobo <= 0) return { ok: false, error: "invalid-amount" };
    const balance = balances.get(walletId);
    if (balance === undefined) return { ok: false, error: "wallet-not-found" };
    balances.set(walletId, balance + kobo);
    return { ok: true, value: { balanceKobo: balance + kobo } };
  },
};

const wallets = new Bus<WalletCommands>("command", handlers);
for (const [walletId, kobo] of [["WAL-1", 150_000], ["WAL-1", -500], ["WAL-9", 1_000]] as const) {
  const result = await wallets.execute({ type: "wallet.topUp", walletId, kobo });
  console.log(result.ok ? `balance ₦${result.value.balanceKobo / 100}` : result.error);
}
```

Output of `npx tsx wallet.ts` and of the browser terminal

```ts
balance ₦2000
invalid-amount
wallet-not-found
```

The handler destructures its request directly in the parameter list, and every field is typed from the spec. The amount check comes before the lookup, so an invalid request never touches the store.

TRY IT YOURSELF

### A query cache with one justified cast

Write a `Middleware<ShopQueries>` that caches query results by `JSON.stringify(query)`. Explain why its one cast is safe, and show that the second identical query does not reach the handler.

**Show a solution**

query-cache.ts

```ts
import { Bus } from "./bus.js";
import { queryHandlers } from "./handlers.js";
import { ShopStore } from "./store.js";
import type { Middleware, ResultOf } from "./cqrs-types.js";
import type { ShopQueries } from "./shop-spec.js";

const cache = new Map<string, unknown>();
const cached: Middleware<ShopQueries> = async (query, next) => {
  const key = JSON.stringify(query);
  if (cache.has(key)) return cache.get(key) as ResultOf<ShopQueries, typeof query.type>;
  const result = await next();
  cache.set(key, result);
  return result;
};

let handlerCalls = 0;
const store = new ShopStore();
store.orders.set("ORD-7", { orderId: "ORD-7", customerId: "cus_ada", totalKobo: 7_500_000, status: "placed" });
const counting: Middleware<ShopQueries> = async (_query, next) => {
  handlerCalls++;
  return next();
};

const queries = new Bus<ShopQueries>("query", queryHandlers(store.orders)).use(cached).use(counting);
console.log((await queries.execute({ type: "order.get", orderId: "ORD-7" }))?.status);
console.log((await queries.execute({ type: "order.get", orderId: "ORD-7" }))?.status);
console.log("handler calls:", handlerCalls);
```

Output of `npx tsx query-cache.ts` and of the browser terminal

```ts
placed
placed
handler calls: 1
```

The cast is safe because the key contains the query's `type` and all its fields, so a value found under the key was produced by the handler for this exact query type. `typeof query.type` is `K`, the middleware's type parameter. Two real concerns remain that no type covers: the cache never expires, so a cancelled order would still show as placed, and cache keys from `JSON.stringify` depend on property order. [Caching](https://zudojs.oyinlola.site/learn/backend-caching) deals with both.

TRY IT YOURSELF

### Refuse to start with a missing handler

Plugins register command handlers at runtime, so the compiler cannot check that all of them exist. Write `assertComplete(expected, registered)` that throws one error listing every missing name, and call it at startup with a list derived from a spec type using `satisfies`, so the list itself cannot miss a name.

**Show a solution**

startup-check.ts

```ts
import type { RequestName } from "./cqrs-types.js";
import type { ShopCommands } from "./shop-spec.js";

const allCommands = {
  "order.place": true,
  "order.cancel": true,
} as const satisfies Record<RequestName<ShopCommands>, true>;

function assertComplete(expected: readonly string[], registered: readonly string[]): void {
  const missing = expected.filter((name) => !registered.includes(name));
  if (missing.length > 0) throw new Error(`missing handlers: ${missing.join(", ")}`);
}

const registeredByPlugins = ["order.place"];
try {
  assertComplete(Object.keys(allCommands), registeredByPlugins);
  console.log("all handlers present");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx startup-check.ts` and of the browser terminal

```ts
Error: missing handlers: order.cancel
```

`satisfies Record<RequestName<ShopCommands>, true>` makes the object fail to compile if a command is missing or misspelled, while keeping its literal keys. The runtime check then compares that complete list with what was actually registered. Failing at startup is the next best thing to failing at compile time: the broken build never serves a request.

## Recap

- Commands change state and return little; queries read and change nothing; each has exactly one handler. Events are different: zero or more listeners and no result.
- Describe each bus with a spec map of `{ input, result }` and derive `RequestOf`, `ResultOf`, `Handler` and the handler table `Handlers`. `S extends Specs<S>` accepts interfaces and checks every entry.
- Passing the whole handler table to the bus turns a missing handler into a compile error. The bus still checks at runtime for untyped callers.
- Put expected failures in the result as a closed union, and derive the error list for the HTTP layer from it.
- A narrow reader type helps queries stay read-only; it is not a proof.
- Generic middleware (`<K>(request, next) => …`) works for every request and cannot invent a result: parametricity.
- Class-based requests carry their result as a phantom `declare` property; without it, structural typing erases the result type. They lose compile-time exhaustiveness.
- In `@zudojs/cqrs`, `execute<C, R>`'s result type is a claim and missing handlers are runtime errors; a typed layer built from your spec restores both guarantees.

Next: [A type-safe dependency injection container](https://zudojs.oyinlola.site/learn/ts-typed-di), which builds the handlers' dependencies for you, and shows the one error no container type can prevent.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
