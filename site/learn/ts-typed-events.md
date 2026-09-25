---
title: "A type-safe event system — ZudoJS Academy"
description: "Build an event bus where emit(\"order.placed\", payload) only accepts the right payload: typed listeners, unsubscribe, wildcards and their limits."
source: https://zudojs.oyinlola.site/learn/ts-typed-events
---

LEVEL 6 · LESSON 13 OF 22

Type-safe infrastructure Advanced

# A type-safe event system

Build an event bus where emit("order.placed", payload) only accepts the right payload: typed listeners, unsubscribe, wildcards and their limits.

- **55 min** to read and try
- **You need:** Generic API design, Mapped types, Conditional types and Template literal types
- **You build:** A typed event bus for a shop, with checked names and payloads, unsubscribe by function or AbortSignal, once and waitFor, namespace wildcards, async listeners with error isolation, and a typed layer over @zudojs/events

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Describe every event of a system in one event map and derive names, payloads and listener types from it
- Write emit and on so that a wrong event name or payload is a compile error, including events without a payload
- Explain the correlated-union hole and close it by keeping name and payload in one value
- Type namespace wildcards with template literal types and say what they cannot express
- Isolate listener failures and validate events that arrive from outside the program
- Put a typed layer over @zudojs/events and know which of its types are claims rather than checks

## The order e-mail that silently stopped

A shop sends a confirmation e-mail after every order. The checkout code does not call the e-mail code directly; it **emits an event**, a named message that says "this happened", and whoever cares **listens** for that name. Checkout does not know that e-mail, inventory or analytics exist, and they do not know about each other. That loose coupling is the whole point of events.

Last month a developer renamed the event from `"order.created"` to `"order.placed"`, because an order is placed before it is paid. They even used Node's typed `EventEmitter`, which accepts an **event map**: a type that lists each event name with its arguments. They updated checkout. They did not find the listener in another folder:

problem.tsNode.js only

```ts
import { EventEmitter } from "node:events";

interface OrderPlaced {
  orderId: string;
  email: string;
  totalKobo: number;
}

interface ShopEvents {
  "order.placed": [order: OrderPlaced];
  "stock.low": [sku: string, left: number];
}

const shop = new EventEmitter<ShopEvents>();

// notifications.ts, written last year when the event was still "order.created"
shop.on("order.created", (order) => {
  console.log(`e-mail ${order.email}: we received order ${order.orderId}`);
});

// checkout.ts, after the rename
const delivered = shop.emit("order.placed", { orderId: "ORD-1042", email: "ada@shop.ng", totalKobo: 1_850_000 });
console.log("anyone listening?", delivered);
```

Output of `npx tsx problem.ts`

```ts
anyone listening? false
```

This compiles with no error, runs with no error, and no customer gets an e-mail. `emit` returns `false` ("nobody listened"), which nobody checks. Node's type definitions deliberately accept *any* event name, because a Node emitter may also carry events the map does not list, and for an unknown name the listener's parameter is `any`, so even `order.emial` would compile. The map made the known events nicer to use, but it did not make unknown names wrong.

In this lesson you build an event system where that bug cannot compile: a misspelled name, a missing field and a listener that expects the wrong shape are all type errors. You will see exactly where TypeScript's help ends (wildcards, variables that hold "one of several" names, data from outside the program), and then how `@zudojs/events`, which you meet in [Events in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-events), types the same ideas. [Generic API design](https://zudojs.oyinlola.site/learn/ts-generic-design#events) built a first `TypedEmitter` with `on` and `emit`; this lesson starts from that idea and goes much deeper.

## The event map: one type as the contract

Everything starts from one interface. Each key is an event name, and its value is the **payload**, the data that travels with the event. An event with nothing to say, like "the cart was cleared", has the payload type `void`:

shop-events.ts

```ts
export interface OrderPlaced {
  orderId: string;
  email: string;
  totalKobo: number;
}

export interface ShopEvents {
  "order.placed": OrderPlaced;
  "order.cancelled": { orderId: string; reason: string };
  "stock.low": { sku: string; left: number };
  "cart.cleared": void;
}
```

Using one payload value per event (instead of Node's argument lists) keeps things simple: a listener always receives one argument, and you can add a field later without changing every listener's parameter list.

From this map you derive every other type the bus needs, with the tools from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators), [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) and [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types). Nobody writes an event name or a payload type twice:

event-types.ts

```ts
export type EventName<E> = keyof E & string;
export type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P];
export type Listener<P> = (...args: PayloadArgs<P>) => void | Promise<void>;

export type EventOf<E, K extends EventName<E> = EventName<E>> = {
  [N in K]: { readonly name: N; readonly payload: E[N] };
}[K];

type Namespace<E> = EventName<E> extends infer N ? (N extends `${infer NS}.${string}` ? NS : never) : never;
export type Pattern<E> = "*" | `${Namespace<E>}.*`;
export type Matching<E, P extends string> = P extends `${infer NS}.*` ? Extract<EventName<E>, `${NS}.${string}`> : EventName<E>;

export interface EmitReport {
  readonly delivered: number;
  readonly failed: number;
  readonly errors: readonly unknown[];
}
```

- `EventName<E>` is the union of the names. `& string` drops number and symbol keys, which `keyof` could otherwise include.
- `PayloadArgs<P>` turns a payload into an *argument list*: an empty tuple for `void`, a one-element tuple otherwise. Used as a rest parameter, it makes `emit("cart.cleared")` take no payload and every other event require one. The `[P] extends [void]` wrapping stops the conditional type from distributing over unions, as [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#distribution) explained.
- `EventOf<E>` is a **discriminated union** of `{ name, payload }` objects, one member per event. It is built with the "mapped type, then index it with its own keys" trick. You will need it twice: for wildcard listeners and to close a type hole.
- `Pattern` and `Matching` use [template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals) to describe wildcards like `"order.*"`. The wildcards section explains them.

Check the derived types before building on them. The type-level test helpers are the ones from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#testing):

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

map-facts.ts

```ts
import type { Equal, Expect } from "./type-tests.js";
import type { EventName, EventOf, Matching, PayloadArgs, Pattern } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

type M1 = Expect<Equal<EventName<ShopEvents>, "order.placed" | "order.cancelled" | "stock.low" | "cart.cleared">>;
type M2 = Expect<Equal<PayloadArgs<ShopEvents["cart.cleared"]>, []>>;
type M3 = Expect<Equal<PayloadArgs<ShopEvents["stock.low"]>, [payload: { sku: string; left: number }]>>;
type M4 = Expect<Equal<Pattern<ShopEvents>, "*" | "order.*" | "stock.*" | "cart.*">>;
type M5 = Expect<Equal<Matching<ShopEvents, "order.*">, "order.placed" | "order.cancelled">>;
type M6 = Expect<Equal<EventOf<ShopEvents, "stock.low">, { readonly name: "stock.low"; readonly payload: { sku: string; left: number } }>>;

console.log("6 facts about the event map compiled");
```

Output of `npx tsx map-facts.ts` and of the browser terminal

```ts
6 facts about the event map compiled
```

## A typed emit and on

REASON IT OUT

### Before you write emit

You are about to write `emit(name, payload)` and `on(name, listener)`. Think first:

- Who should decide the payload type: the caller, the listener, or the event name?
- How does `emit` know that `"cart.cleared"` takes no payload?
- Listeners for different events have different parameter types. What type can the one internal collection that stores all of them have?
- A listener may unsubscribe itself while `emit` is looping over the listeners. What happens to the loop?

**Show the reasoning**

The **name** must decide, so `emit` is generic in the name: `K extends EventName<E>` is inferred from the string you pass, and the payload parameter is `E[K]`. If the caller or the listener could choose the type, it would be a claim, not a check. The payload parameter becomes a rest parameter of type `PayloadArgs<E[K]>`, which is `[]` for `void`. The internal collection cannot say "for each name, listeners of that name's payload": TypeScript has no type for a `Map` whose value type depends on the key. So the storage is typed loosely, and exactly one cast connects the public, precise signatures to it. The loop should run over a **copy** of the listener list, so removing a listener during the loop cannot skip the next one.

emitter.ts

```ts
type EventName<E> = keyof E & string;
type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P];
type Listener<P> = (...args: PayloadArgs<P>) => void;

export class TypedEmitter<E extends object> {
  readonly #listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends EventName<E>>(name: K, listener: Listener<E[K]>): () => void {
    let set = this.#listeners.get(name);
    if (!set) this.#listeners.set(name, (set = new Set()));
    const stored = listener as Listener<unknown>;
    set.add(stored);
    return () => void set.delete(stored);
  }

  emit<K extends EventName<E>>(name: K, ...args: PayloadArgs<E[K]>): number {
    const set = this.#listeners.get(name);
    if (!set) return 0;
    for (const listener of [...set]) listener(...(args as PayloadArgs<unknown>));
    return set.size;
  }
}
```

shop-events.ts

```ts
export interface OrderPlaced {
  orderId: string;
  email: string;
  totalKobo: number;
}

export interface ShopEvents {
  "order.placed": OrderPlaced;
  "order.cancelled": { orderId: string; reason: string };
  "stock.low": { sku: string; left: number };
  "cart.cleared": void;
}
```

demo.ts

```ts
import { TypedEmitter } from "./emitter.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new TypedEmitter<ShopEvents>();

const stop = shop.on("order.placed", (order) => {
  console.log(`e-mail ${order.email}: order ${order.orderId}, ₦${order.totalKobo / 100}`);
});
shop.on("cart.cleared", () => console.log("cart badge -> 0"));

console.log(shop.emit("order.placed", { orderId: "ORD-1042", email: "ada@shop.ng", totalKobo: 1_850_000 }));
console.log(shop.emit("cart.cleared"));
stop();
console.log(shop.emit("order.placed", { orderId: "ORD-1043", email: "tunde@shop.ng", totalKobo: 90_000 }));
```

Output of `npx tsx demo.ts` and of the browser terminal

```ts
e-mail ada@shop.ng: order ORD-1042, ₦18500
1
cart badge -> 0
1
0
```

You never wrote a type argument: `K` is inferred as `"order.placed"` from the string, and from it the payload type flows into the listener's `order` parameter (contextual typing, from [Type inference](https://zudojs.oyinlola.site/learn/ts-inference#contextual)). `on` returns an **unsubscribe function**: calling it removes exactly that listener, so the caller never needs access to the emitter's internals. Now every mistake from the opening story, and a few more:

misuse.ts

```ts
import { TypedEmitter } from "./emitter.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new TypedEmitter<ShopEvents>();

shop.on("order.created", (order) => console.log(order));
shop.emit("order.placed", { orderId: "ORD-1042", email: "ada@shop.ng", totalKobo: "18500" });
shop.emit("stock.low");
shop.emit("cart.cleared", { items: 3 });
shop.on("stock.low", (event) => console.log(event.quantity));
```

What `npx tsc --noEmit` prints

```ts
misuse.ts:6:9 - error TS2345: Argument of type '"order.created"' is not assignable to parameter of type 'EventName<ShopEvents>'.

6 shop.on("order.created", (order) => console.log(order));
          ~~~~~~~~~~~~~~~

misuse.ts:7:72 - error TS2322: Type 'string' is not assignable to type 'number'.

7 shop.emit("order.placed", { orderId: "ORD-1042", email: "ada@shop.ng", totalKobo: "18500" });
                                                                         ~~~~~~~~~

  shop-events.ts:4:3 - The expected type comes from property 'totalKobo' which is declared here on type 'OrderPlaced'
    4   totalKobo: number;
        ~~~~~~~~~

misuse.ts:8:6 - error TS2554: Expected 2 arguments, but got 1.

8 shop.emit("stock.low");
       ~~~~

  emitter.ts:16:41 - Arguments for the rest parameter 'args' were not provided.
    16   emit<K extends EventName<E>>(name: K, ...args: PayloadArgs<E[K]>): number {
                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~

misuse.ts:9:27 - error TS2554: Expected 1 arguments, but got 2.

9 shop.emit("cart.cleared", { items: 3 });
                            ~~~~~~~~~~~~

misuse.ts:10:51 - error TS2339: Property 'quantity' does not exist on type '{ sku: string; left: number; }'.

10 shop.on("stock.low", (event) => console.log(event.quantity));
                                                     ~~~~~~~~


Found 5 errors in the same file, starting at: misuse.ts:6
```

The old name is refused, the price as text is refused, a missing payload and an unexpected payload are refused, and the listener cannot read a field the event does not have. The single `as Listener<unknown>` cast inside `on` is the price of the heterogeneous storage. It is safe for one reason only: a listener stored under name `K` is only ever called with arguments that were checked against `E[K]` by `emit`. That reasoning lives in your head, not in the compiler, which is why such a cast belongs in one small, tested class and nowhere else.

### The correlated-union hole

The generic `K` is precise as long as you pass a literal name. Now a function forwards "one of two" events, so its name and payload are unions:

hole.ts

```ts
import { TypedEmitter } from "./emitter.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new TypedEmitter<ShopEvents>();
shop.on("stock.low", (event) => console.log(`reorder ${event.sku}: ${event.left} left`));

function forward(name: "order.cancelled" | "stock.low", payload: ShopEvents["order.cancelled" | "stock.low"]) {
  shop.emit(name, payload);
}

forward("stock.low", { orderId: "ORD-1042", reason: "customer changed mind" });
```

Output of `npx tsx hole.ts` and of the browser terminal

```ts
reorder undefined: undefined left
```

It compiles and it is wrong. Inside `forward`, `K` is inferred as the whole union `"order.cancelled" | "stock.low"`, so `E[K]` is the union of both payloads, and a cancellation payload is accepted for `"stock.low"`. Two separate union variables have lost the information that they belong *together*. TypeScript calls this the **correlated union** problem, and there is no compiler switch for it. The fix is a design rule: **as long as a name and a payload travel together, keep them in one value**. That is what `EventOf<E>` is for. Each member ties one name to its payload, so a mismatched pair cannot even be written:

together.ts

```ts
import type { EventOf } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

function forward(event: EventOf<ShopEvents, "order.cancelled" | "stock.low">): string {
  return event.name === "stock.low" ? `reorder ${event.payload.sku}` : `cancel ${event.payload.orderId}`;
}

forward({ name: "stock.low", payload: { sku: "RICE-50KG", left: 3 } });
forward({ name: "stock.low", payload: { orderId: "ORD-1042", reason: "customer changed mind" } });
```

What `npx tsc --noEmit` prints

```ts
together.ts:9:41 - error TS2353: Object literal may only specify known properties, and 'orderId' does not exist in type '{ sku: string; left: number; }'.

9 forward({ name: "stock.low", payload: { orderId: "ORD-1042", reason: "customer changed mind" } });
                                          ~~~~~~~


Found 1 error in together.ts:9
```

Checking `event.name` also narrows `event.payload`, which two separate variables could never do. The full bus below gets a `publish(event)` method that takes exactly such an object.

## The full bus: unsubscribe, once, waitFor and wildcards

A production event system needs more than `on` and `emit`. Listeners that live as long as one HTTP request must be removed when the request ends, or they pile up (a **listener leak**). Some code needs only the next event. Audit logs want every event. And listeners are often `async`. Here is the complete bus, built on the types from `event-types.ts`:

event-bus.ts

```ts
import type { EmitReport, EventName, EventOf, Listener, Matching, PayloadArgs, Pattern } from "./event-types.js";

type Stored = (...args: unknown[]) => void | Promise<void>;
type PatternListener = (event: { name: string; payload: unknown }) => void | Promise<void>;

export class EventBus<E extends object> {
  readonly #listeners = new Map<string, Set<Stored>>();
  readonly #patterns = new Map<PatternListener, string>();

  on<K extends EventName<E>>(name: K, listener: Listener<E[K]>, options: { signal?: AbortSignal } = {}): () => void {
    let set = this.#listeners.get(name);
    if (!set) this.#listeners.set(name, (set = new Set()));
    const stored = listener as Stored;
    set.add(stored);
    const off = () => void set.delete(stored);
    options.signal?.addEventListener("abort", off, { once: true });
    return off;
  }

  once<K extends EventName<E>>(name: K, listener: Listener<E[K]>): () => void {
    const off = this.on(name, (...args) => {
      off();
      return listener(...args);
    });
    return off;
  }

  waitFor<K extends EventName<E>>(name: K): Promise<E[K]> {
    return new Promise((resolve) => this.once(name, (...args) => resolve(args[0] as E[K])));
  }

  onPattern<P extends Pattern<E>>(pattern: P, listener: (event: EventOf<E, Matching<E, P>>) => void | Promise<void>): () => void {
    const stored = listener as PatternListener;
    this.#patterns.set(stored, pattern);
    return () => void this.#patterns.delete(stored);
  }

  emit<K extends EventName<E>>(name: K, ...args: PayloadArgs<E[K]>): Promise<EmitReport> {
    return this.#dispatch(name, args);
  }

  publish(event: EventOf<E>): Promise<EmitReport> {
    return this.#dispatch(event.name, event.payload === undefined ? [] : [event.payload]);
  }

  async #dispatch(name: string, args: readonly unknown[]): Promise<EmitReport> {
    const calls: (() => void | Promise<void>)[] = [];
    for (const listener of this.#listeners.get(name) ?? []) calls.push(() => listener(...args));
    for (const [listener, pattern] of this.#patterns) {
      if (pattern === "*" || name.startsWith(pattern.slice(0, -1))) calls.push(() => listener({ name, payload: args[0] }));
    }
    const results = await Promise.allSettled(calls.map(async (call) => call()));
    const errors = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    return { delivered: results.length - errors.length, failed: errors.length, errors };
  }
}
```

The structure is the important part: a **typed facade over an untyped core**. The public methods (`on`, `once`, `emit`, `publish`, `onPattern`) have precise generic signatures. The private `#dispatch` works with plain strings and `unknown` values. Every cast sits on the line where a precise type enters the loose storage. `once` and `waitFor` are built on `on` and need no new cast except `args[0] as E[K]`, because TypeScript cannot index the still-unresolved `PayloadArgs<E[K]>`.

subscriptions.ts

```ts
import { EventBus } from "./event-bus.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();

const request = new AbortController();
shop.on("stock.low", (s) => console.log(`[request] ${s.sku} is low`), { signal: request.signal });
shop.once("order.placed", (o) => console.log(`[once] first order today: ${o.orderId}`));

const nextCancellation = shop.waitFor("order.cancelled");

await shop.emit("stock.low", { sku: "RICE-50KG", left: 3 });
request.abort();
await shop.emit("stock.low", { sku: "RICE-50KG", left: 2 });

await shop.emit("order.placed", { orderId: "ORD-1", email: "ada@shop.ng", totalKobo: 500_000 });
await shop.emit("order.placed", { orderId: "ORD-2", email: "tunde@shop.ng", totalKobo: 90_000 });

await shop.emit("order.cancelled", { orderId: "ORD-2", reason: "paid twice" });
const cancelled = await nextCancellation;
console.log("waitFor got:", cancelled.reason);
```

Output of `npx tsx subscriptions.ts` and of the browser terminal

```json
[request] RICE-50KG is low
[once] first order today: ORD-1
waitFor got: paid twice
```

- An `AbortSignal` is the standard way to cancel many things at once: `fetch`, timers and listeners can all share one signal, so ending a request cleans up everything it started. `request.abort()` removed the listener before the second `stock.low`.
- `once` fired for the first order only. `waitFor` turned the next `order.cancelled` into a promise, and `cancelled` is typed as that event's payload, so `cancelled.reason` is checked.

### Wildcards and their limits

An audit log wants every event, and an order dashboard wants every `order.*` event. A wildcard listener cannot receive "the payload", because it receives several kinds of event. So `onPattern` hands it the `{ name, payload }` union for exactly the matching names, and the listener narrows on `name`:

patterns.ts

```ts
import { EventBus } from "./event-bus.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();

shop.onPattern("order.*", (event) => {
  switch (event.name) {
    case "order.placed":
      console.log(`[orders] +₦${event.payload.totalKobo / 100}`);
      break;
    case "order.cancelled":
      console.log(`[orders] ${event.payload.orderId} cancelled: ${event.payload.reason}`);
      break;
  }
});
shop.onPattern("*", (event) => console.log(`[audit] ${event.name}`));

await shop.emit("order.placed", { orderId: "ORD-7", email: "ada@shop.ng", totalKobo: 1_200_000 });
await shop.emit("order.cancelled", { orderId: "ORD-7", reason: "out of stock" });
await shop.emit("cart.cleared");
```

Output of `npx tsx patterns.ts` and of the browser terminal

```json
[orders] +₦12000
[audit] order.placed
[orders] ORD-7 cancelled: out of stock
[audit] order.cancelled
[audit] cart.cleared
```

How the types work: `Namespace<ShopEvents>` takes every name apart with `\`${infer NS}.${string}\`` and keeps the part before the first dot, giving `"order" | "stock" | "cart"`. `Pattern` turns that into `"*" | "order.*" | "stock.*" | "cart.*"`. `Matching<E, "order.*">` keeps the names that start with `order.`, and `EventOf` turns them into the union the listener receives. The type-level rule and the runtime rule (`name.startsWith("order.")`) must agree, and they do: both match every depth below the namespace. Here is what the compiler refuses:

patterns-misuse.ts

```ts
import { EventBus } from "./event-bus.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();

shop.onPattern("shipping.*", (event) => console.log(event.name));
shop.onPattern("order.*", (event) => console.log(event.payload.email));
shop.onPattern("*.placed", (event) => console.log(event.name));
```

What `npx tsc --noEmit` prints

```ts
patterns-misuse.ts:6:16 - error TS2345: Argument of type '"shipping.*"' is not assignable to parameter of type 'Pattern<ShopEvents>'.

6 shop.onPattern("shipping.*", (event) => console.log(event.name));
                 ~~~~~~~~~~~~

patterns-misuse.ts:7:64 - error TS2339: Property 'email' does not exist on type 'OrderPlaced | { orderId: string; reason: string; }'.
  Property 'email' does not exist on type '{ orderId: string; reason: string; }'.

7 shop.onPattern("order.*", (event) => console.log(event.payload.email));
                                                                 ~~~~~

patterns-misuse.ts:8:16 - error TS2345: Argument of type '"*.placed"' is not assignable to parameter of type 'Pattern<ShopEvents>'.

8 shop.onPattern("*.placed", (event) => console.log(event.name));
                 ~~~~~~~~~~


Found 3 errors in the same file, starting at: patterns-misuse.ts:6
```

These are real limits of typed wildcards, and you should know them before you design around them:

- **A wildcard listener gets a union.** `event.payload.email` is refused because a cancellation has no e-mail. That is correct, but it means wildcard listeners are for cross-cutting work (logging, metrics, forwarding to a queue) that treats events generically, not for business logic.
- **Only the patterns you teach the types.** `"*.placed"` ("any namespace, action placed") is a perfectly reasonable runtime pattern, but `Pattern` does not describe it, so it is refused. Every new pattern form needs new template-literal machinery and matching runtime code, and the two can drift apart. Keep the pattern language small.
- **Patterns built at runtime** such as `\`${moduleName}.*\`` with `moduleName: string` have the type `\`${string}.*\``, which is not a `Pattern<ShopEvents>`. You must check the value at runtime and cast, or not use the typed method.
- **The map is closed at compile time.** A plugin loaded at runtime cannot add events the types know about. Because `ShopEvents` is an *interface*, a plugin package can add names with module augmentation ([Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations) shows how), but only for plugins known when you compile.
- **Large maps cost compile time.** `EventOf` and `Matching` are recomputed per use. A few hundred events are fine; thousands of names with deep patterns make editors slow ([Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance)).

## Async listeners and error isolation

An e-mail listener that throws must not stop the inventory listener from reserving stock. The bus runs every listener, collects failures, and reports them to the publisher instead of throwing the first one. This is **error isolation**. `Promise.allSettled` does the work: it waits for every promise and never rejects. Wrapping each call in `async (call) => call()` turns a *synchronous* throw into a rejected promise too, so both kinds of failure land in the same report:

isolation.ts

```ts
import { EventBus } from "./event-bus.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();

shop.on("order.placed", (o) => console.log(`[inventory] reserve items for ${o.orderId}`));
shop.on("order.placed", async (o) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  throw new Error(`SMTP timeout sending to ${o.email}`);
});
shop.on("order.placed", () => {
  throw new TypeError("loyalty service misconfigured");
});
shop.on("order.placed", async (o) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  console.log(`[analytics] revenue +${o.totalKobo}`);
});

const report = await shop.emit("order.placed", { orderId: "ORD-9", email: "ada@shop.ng", totalKobo: 700_000 });
console.log(`delivered ${report.delivered}, failed ${report.failed}`);
for (const error of report.errors) console.log(" -", String(error));
```

Output of `npx tsx isolation.ts` and of the browser terminal

```json
[inventory] reserve items for ORD-9
[analytics] revenue +700000
delivered 2, failed 2
 - Error: SMTP timeout sending to ada@shop.ng
 - TypeError: loyalty service misconfigured
```

Two design decisions are baked in here, and both are choices, not facts:

- **Listeners run concurrently.** Their synchronous parts start in subscription order, but the analytics listener finished before the e-mail listener. If one listener must finish before another starts, they are not independent, and they probably belong in one listener or one command (next lesson).
- **`emit` waits.** The publisher gets the report, so a test can `await` the event and then check its effects. A web request, though, should not wait ten seconds for an e-mail server. In production, slow side effects move to a queue ([Queues and background jobs](https://zudojs.oyinlola.site/learn/backend-queues)), and the listener only enqueues a job.

The report's `errors` are `unknown[]`, not `Error[]`: a listener can throw anything, as [Error handling in TypeScript](https://zudojs.oyinlola.site/learn/ts-errors#unknown) showed. `String(error)` is safe for any value.

## Events from outside the program

Everything so far was checked because the payloads were written in TypeScript. Events that arrive from a message queue, a webhook or another service are just text. `JSON.parse` returns `any`, and the event map says nothing about what really arrived. Types never validate data at runtime ([Types meet the runtime](https://zudojs.oyinlola.site/learn/ts-runtime)), so you need one runtime check per event. A mapped type makes the compiler demand that check for every name in the map, so a new event cannot be added without a validator:

inbox.ts

```ts
import { EventBus } from "./event-bus.js";
import type { EventName, EventOf } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

type Validators<E> = { readonly [K in EventName<E>]: (payload: unknown) => payload is E[K] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const validators: Validators<ShopEvents> = {
  "order.placed": (p): p is ShopEvents["order.placed"] =>
    isObject(p) && typeof p.orderId === "string" && typeof p.email === "string" && Number.isInteger(p.totalKobo),
  "order.cancelled": (p): p is ShopEvents["order.cancelled"] =>
    isObject(p) && typeof p.orderId === "string" && typeof p.reason === "string",
  "stock.low": (p): p is ShopEvents["stock.low"] => isObject(p) && typeof p.sku === "string" && typeof p.left === "number",
  "cart.cleared": (p): p is void => p === undefined,
};

function parseEvent(raw: string): EventOf<ShopEvents> | string {
  const message: unknown = JSON.parse(raw);
  if (!isObject(message) || typeof message.name !== "string") return "not an event";
  if (!Object.hasOwn(validators, message.name)) return `unknown event "${message.name}"`;
  const name = message.name as EventName<ShopEvents>;
  if (!validators[name](message.payload)) return `bad payload for ${name}`;
  return { name, payload: message.payload } as EventOf<ShopEvents>;
}

const shop = new EventBus<ShopEvents>();
shop.onPattern("*", (event) => console.log("published", event.name));

const queue = [
  '{"name":"stock.low","payload":{"sku":"GARRI-5KG","left":4}}',
  '{"name":"stock.low","payload":{"sku":"GARRI-5KG","left":"four"}}',
  '{"name":"order.shipped","payload":{"orderId":"ORD-3"}}',
  '{"name":"cart.cleared"}',
];
for (const raw of queue) {
  const event = parseEvent(raw);
  if (typeof event === "string") console.log("rejected:", event);
  else await shop.publish(event);
}
```

Output of `npx tsx inbox.ts` and of the browser terminal

```ts
published stock.low
rejected: bad payload for stock.low
rejected: unknown event "order.shipped"
published cart.cleared
```

The two casts in `parseEvent` are each backed by a runtime check on the line before: `Object.hasOwn` proves the name is in the map (and not an inherited key like `"toString"`), and the validator proves the payload fits *that* name. The compiler cannot connect "the validator for `name` passed" to "the payload fits `name`", which is the correlated-union problem once more. Writing validators by hand gets long; [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) and [Validation in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-validation) generate them from schemas.

## The same ideas in @zudojs/events

`@zudojs/events` is a full event bus: every event is an object with a unique `id`, a `timestamp` and a `payload`, handlers have priorities and timeouts, middleware can wrap publishing, and failures are reported per handler. [Events in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-events) teaches it in full. Here, look only at its types. Its runtime event type is a plain `string`, so the typing happens in two places: `defineEvent` ties a name to a payload type, and `on` takes the handler's event type as a **type argument**:

shop-events.ts

```ts
export interface OrderPlaced {
  orderId: string;
  email: string;
  totalKobo: number;
}

export interface ShopEvents {
  "order.placed": OrderPlaced;
  "order.cancelled": { orderId: string; reason: string };
  "stock.low": { sku: string; left: number };
  "cart.cleared": void;
}
```

zudo.ts

```ts
import { createEventBus, defineEvent } from "@zudojs/events";
import type { Event } from "@zudojs/events";
import type { OrderPlaced, ShopEvents } from "./shop-events.js";

const OrderPlacedEvent = defineEvent<"order.placed", OrderPlaced>("order.placed");
const StockLowEvent = defineEvent<"stock.low", ShopEvents["stock.low"]>("stock.low");

const bus = createEventBus();

bus.on<Event<OrderPlaced>>("order.placed", (event) => {
  console.log(`e-mail ${event.payload.email}: order ${event.payload.orderId}`);
});
bus.on<Event<OrderPlaced>>("stock.low", (event) => {
  console.log(`wrong claim: ${event.payload.email}`);
});
bus.on("order.*", (event) => console.log("[orders]", event.type));

const placed = await bus.publish(OrderPlacedEvent.create({ orderId: "ORD-1042", email: "ada@shop.ng", totalKobo: 1_850_000 }));
console.log(placed.handled, placed.handlerCount);
await bus.publish(StockLowEvent.create({ sku: "RICE-50KG", left: 3 }));
```

Output of `npx tsx zudo.ts` and of the browser terminal

```ts
e-mail ada@shop.ng: order ORD-1042
[orders] order.placed
true 2
wrong claim: undefined
```

`OrderPlacedEvent.create(…)` is checked: the payload must be an `OrderPlaced`. But look at the second handler. `bus.on<Event<OrderPlaced>>("stock.low", …)` compiles, because nothing connects the type argument to the name. A type argument that only describes what a callback will *receive* is a **claim**, exactly like `as`: [Generic API design](https://zudojs.oyinlola.site/learn/ts-generic-design#earn-their-place) called these return-only generics. The handler then reads `undefined`. This is not a bug in the package so much as a trade-off: a bus whose names are plain strings (so that `"order.*"`, modules and plugins work at runtime) cannot know every payload at compile time. The package also exports `EventUnion<Map>`, the same idea as your `EventOf`, but its constraint is `Record<string, unknown>`, which an `interface` does not satisfy; use a `type` alias for maps you pass to it.

You can have both: the package's runtime and your compile-time map. A thin layer that takes the map as a type parameter lets the *name* choose the type again, and hides the claim in one place:

typed-zudo.ts

```ts
import { createEventBus } from "@zudojs/events";
import type { Event, EventBus, EventPublishResult } from "@zudojs/events";

export interface TypedZudoBus<M extends object> {
  on<K extends keyof M & string>(type: K, handler: (event: Event<M[K]>) => void | Promise<void>): () => void;
  publish<K extends keyof M & string>(type: K, payload: M[K]): Promise<EventPublishResult<Event<M[K]>>>;
  readonly raw: EventBus;
}

export function typedBus<M extends object>(raw: EventBus = createEventBus()): TypedZudoBus<M> {
  return {
    on(type, handler) {
      const subscription = raw.on<Event<M[typeof type]>>(type, handler);
      return () => subscription.unsubscribe();
    },
    publish(type, payload) {
      return raw.publishEvent({ type, payload });
    },
    raw,
  };
}
```

use-typed.ts

```ts
import { typedBus } from "./typed-zudo.js";
import type { ShopEvents } from "./shop-events.js";

const shop = typedBus<ShopEvents>();
const off = shop.on("stock.low", (event) => console.log(`reorder ${event.payload.sku} (${event.payload.left} left)`));
shop.raw.on("*", (event) => console.log("[audit]", event.type, event.id.startsWith("event:")));

const result = await shop.publish("stock.low", { sku: "RICE-50KG", left: 3 });
console.log("handled:", result.handled, "handlers:", result.handlerCount);
off();
console.log("handlers left:", shop.raw.handlerCount);
```

Output of `npx tsx use-typed.ts` and of the browser terminal

```ts
reorder RICE-50KG (3 left)
[audit] stock.low true
handled: true handlers: 2
handlers left: 1
```

Compare the pieces with what you built:

| Your bus | @zudojs/events |
| --- | --- |
| Event map interface, name chooses the payload | `defineEvent<Name, Payload>` per event; `on<Event<P>>` is a claim unless you add a layer like `typedBus` |
| `on` returns an unsubscribe function | `on` returns a subscription object with `unsubscribe()` and `active` |
| `"order.*"` and `"*"`, typed to a union | The same patterns at runtime; `"order.*"` also matches a bare `"order"` event; the handler's type is again your claim |
| `EmitReport` with `delivered`, `failed`, `errors` | The publish result has `handled`, `succeeded`, `failed` and `errors` (each an `EventHandlerError` whose `cause` is what was thrown). The bus continues after a failing handler by default |
| Payload is whatever you passed | Handlers receive a deeply frozen copy, so one handler cannot change what the next one sees |

## Common mistakes

| Mistake | What happens | Fix |
| --- | --- | --- |
| `emit(name: keyof E, payload: E[keyof E])` without a generic `K` | Any payload is accepted for any name | A type parameter `K extends EventName<E>` per call |
| Passing a union-typed name and a separate payload | The correlated-union hole: mismatched pairs compile | Keep them in one `EventOf<E>` value |
| Letting the listener choose its payload type (`on<T>`) | A claim nothing checks | Derive the listener type from the name |
| Business logic in a `"*"` listener | A union payload and constant narrowing | Wildcards for logging, metrics and forwarding only |
| Subscribing inside a request handler and never unsubscribing | A listener leak: every request adds a listener | Subscribe at startup, or pass the request's `AbortSignal` |
| Looping over the live listener set | A listener that unsubscribes itself can make the loop skip the next one | Loop over a copy |
| Trusting payloads from a queue because the map says so | Bad data reaches listeners with a trusted type | One validator per event at the boundary |

## Testing the event system

An event system needs both kinds of test from [Generic API design](https://zudojs.oyinlola.site/learn/ts-generic-design#testing). Type-level tests prove the compiler refuses what it should: `// @ts-expect-error` makes `tsc` fail if the next line ever *stops* being an error, for example after someone loosens `emit` to `string`. Runtime tests prove the behaviour no type can see: that unsubscribing works, that `once` fires once and that failures are isolated.

bus.test.ts

```ts
import { EventBus } from "./event-bus.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();

// @ts-expect-error: unknown event name
void shop.emit("order.created", { orderId: "ORD-1", email: "ada@shop.ng", totalKobo: 1 });
// @ts-expect-error: payload of another event
void shop.emit("stock.low", { orderId: "ORD-1", reason: "duplicate" });
// @ts-expect-error: "cart.cleared" has no payload
void shop.emit("cart.cleared", {});
// @ts-expect-error: a mismatched pair cannot be published
void shop.publish({ name: "stock.low", payload: { orderId: "ORD-1", reason: "duplicate" } });

function check(label: string, actual: unknown, expected: unknown): void {
  console.log(`${Object.is(actual, expected) ? "PASS" : "FAIL"} ${label}`);
}

const seen: string[] = [];
const off = shop.on("stock.low", (s) => void seen.push(s.sku));
shop.once("stock.low", () => void seen.push("once"));
await shop.emit("stock.low", { sku: "A", left: 1 });
off();
await shop.emit("stock.low", { sku: "B", left: 1 });
check("unsubscribe and once", seen.join(","), "A,once");

shop.on("cart.cleared", () => {
  throw new Error("boom");
});
shop.on("cart.cleared", () => void seen.push("second"));
const report = await shop.emit("cart.cleared");
check("a failing listener does not stop the next", seen.at(-1), "second");
check("the failure is reported", report.failed, 1);
```

Output of `npx tsx bus.test.ts` and of the browser terminal

```ts
PASS unsubscribe and once
PASS a failing listener does not stop the next
PASS the failure is reported
```

With Vitest ([Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing)), `check` becomes `expect(…).toBe(…)`, and `expectTypeOf` can also assert that the listener's parameter has the expected type.

## Typed events in production

- **One map per boundary, owned by the publisher.** The module that emits `order.placed` owns its payload type and exports it. Listeners import the type; they never redeclare it.
- **Payloads are a public contract.** Adding an optional field is safe. Renaming or removing a field breaks every listener, including ones in other services that read from a queue and are not compiled with yours. For a breaking change, publish a new event (`order.placed.v2`) alongside the old one until every listener has moved.
- **In-memory events are not durable.** If the process crashes between saving the order and the e-mail listener finishing, the e-mail is lost. Durable side effects go through a database outbox or a queue ([Queues in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-queue), [Event-driven systems](https://zudojs.oyinlola.site/learn/zudo-event-driven)).
- **Events describe the past.** Name them in the past tense (`order.placed`, not `place.order`) and do not expect a return value from listeners. When you need an answer or a guarantee that exactly one handler ran, you want a command or a query, which is the next lesson.
- **Watch the listener count.** Count listeners per name in development and warn above a limit, the way Node's `EventEmitter` and `@zudojs/events` do, to catch leaks early.

## Practice

TRY IT YOURSELF

### waitFor with a timeout

`waitFor` waits forever if the event never comes. Write `waitForWithin(bus, name, ms)` that resolves with the payload, or rejects with `Error("timed out waiting for NAME")` after `ms` milliseconds, and unsubscribes in both cases. The payload type must still follow the name.

**Show a solution**

wait-within.ts

```ts
import { EventBus } from "./event-bus.js";
import type { EventName } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

function waitForWithin<E extends object, K extends EventName<E>>(bus: EventBus<E>, name: K, ms: number): Promise<E[K]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timed out waiting for ${name}`));
    }, ms);
    const off = bus.once(name, (...args) => {
      clearTimeout(timer);
      resolve(args[0] as E[K]);
    });
  });
}

const shop = new EventBus<ShopEvents>();
setTimeout(() => void shop.emit("stock.low", { sku: "YAM-TUBER", left: 2 }), 5);

const low = await waitForWithin(shop, "stock.low", 100);
console.log("got", low.sku);
await waitForWithin(shop, "order.cancelled", 20).catch((error: unknown) => console.log(String(error)));
```

Output of `npx tsx wait-within.ts` and of the browser terminal

```ts
got YAM-TUBER
Error: timed out waiting for order.cancelled
```

`K` is inferred from the name, so `low` is typed `{ sku: string; left: number }`. Both paths clean up: the timer is cleared when the event arrives, and the listener is removed when the timer wins, so a late event does not resolve an already rejected promise and nothing leaks.

TRY IT YOURSELF

### One analytics line per event, enforced

Analytics wants one line of text for every shop event. Write a mapped type `Formatters<E>` that requires a formatter for every event name, taking that event's payload, and a function `trackAll(bus, formatters, log)` that subscribes all of them. Adding a new event to `ShopEvents` must make the formatters object fail to compile until it has a line for it.

**Show a solution**

track-all.ts

```ts
import { EventBus } from "./event-bus.js";
import type { EventName } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

type Formatters<E> = { readonly [K in EventName<E>]: (payload: E[K]) => string };

function trackAll<E extends object>(bus: EventBus<E>, formatters: Formatters<E>, log: (line: string) => void): void {
  bus.onPattern("*", (event) => {
    const format = formatters[event.name] as (payload: unknown) => string;
    log(`${event.name}: ${format(event.payload)}`);
  });
}

const shop = new EventBus<ShopEvents>();
trackAll(
  shop,
  {
    "order.placed": (o) => `₦${o.totalKobo / 100}`,
    "order.cancelled": (c) => c.reason,
    "stock.low": (s) => `${s.sku} x${s.left}`,
    "cart.cleared": () => "-",
  },
  (line) => console.log(line),
);

await shop.emit("order.placed", { orderId: "ORD-5", email: "ada@shop.ng", totalKobo: 250_000 });
await shop.emit("stock.low", { sku: "OIL-5L", left: 1 });
await shop.emit("cart.cleared");
```

Output of `npx tsx track-all.ts` and of the browser terminal

```ts
order.placed: ₦2500
stock.low: OIL-5L x1
cart.cleared: -
```

The mapped type is the compile-time guarantee: a missing key or a formatter reading a field its event does not have is an error. Inside `trackAll`, `event` is a union, so `formatters[event.name]` is a union of functions that cannot be called with a union payload: the correlated-union problem again, solved with one cast that is safe because name and payload came from the same event object.

TRY IT YOURSELF

### Close the hole in forward

The `forward(name, payload)` function from the correlated-union section accepted a cancellation payload for `"stock.low"`. Rewrite it so that it takes one `EventOf` value and publishes it on the full bus, and show that the correct call still works.

**Show a solution**

forward.ts

```ts
import { EventBus } from "./event-bus.js";
import type { EventOf } from "./event-types.js";
import type { ShopEvents } from "./shop-events.js";

const shop = new EventBus<ShopEvents>();
shop.on("stock.low", (s) => console.log(`reorder ${s.sku}: ${s.left} left`));
shop.on("order.cancelled", (c) => console.log(`refund ${c.orderId}`));

async function forward(event: EventOf<ShopEvents, "order.cancelled" | "stock.low">): Promise<number> {
  const report = await shop.publish(event);
  return report.delivered;
}

console.log(await forward({ name: "stock.low", payload: { sku: "RICE-50KG", left: 3 } }));
console.log(await forward({ name: "order.cancelled", payload: { orderId: "ORD-1042", reason: "customer changed mind" } }));
```

Output of `npx tsx forward.ts` and of the browser terminal

```ts
reorder RICE-50KG: 3 left
1
refund ORD-1042
1
```

The wrong call, `forward({ name: "stock.low", payload: { orderId: …, reason: … } })`, is now a compile error, because no member of the union has that combination. The parameter type also documents which events `forward` handles.

## Recap

- Describe every event in one **event map** and derive names (`keyof E & string`), payload arguments (`PayloadArgs`, empty for `void`), listener types and the `{ name, payload }` union (`EventOf`) from it.
- Make `emit` and `on` generic in the name, `K extends EventName<E>`, so the name decides the payload. A type argument chosen by the caller or the listener is a claim, not a check.
- Two separate union-typed variables lose their pairing (the **correlated-union** problem). Keep a name and its payload in one value.
- Store listeners loosely and keep the single cast where precise types enter the storage: a typed facade over an untyped core.
- Typed wildcards give listeners a union, only support the pattern forms you teach the types, cannot follow patterns built at runtime and describe a map that is closed at compile time.
- Run listeners with `Promise.allSettled` so one failure cannot stop the rest, and validate events from outside with one validator per name.
- `@zudojs/events` types events with `defineEvent`, but `on<Event<P>>` is a claim; a thin typed layer puts your map back in charge.

Next: [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs), where exactly one handler answers each command and query, and its result type follows the request.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
