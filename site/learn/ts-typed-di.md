---
title: "A type-safe dependency injection container — ZudoJS Academy"
description: "Build a DI container with typed tokens, factories and singleton, scoped and transient lifetimes, and learn exactly which wiring errors types cannot catch."
source: https://zudojs.oyinlola.site/learn/ts-typed-di
---

LEVEL 6 · LESSON 15 OF 22

Type-safe infrastructure Advanced

# A type-safe dependency injection container

Build a DI container with typed tokens, factories and singleton, scoped and transient lifetimes, and learn exactly which wiring errors types cannot catch.

- **55 min** to read and try
- **You need:** Classes (dependency injection by hand), Type-safe CQRS, Mapped and conditional types
- **You build:** A typed dependency injection container with tokens, factory and class providers, three lifetimes, request scopes, cycle and captive-dependency detection, and a compile-time service builder, compared with @zudojs/container

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a DI container does that hand wiring does not, and when a container is worth it
- Use typed tokens so that resolve returns the right type, and explain why interfaces cannot be tokens
- Check a provider's dependency list against the constructor or factory it feeds
- Implement singleton, scoped and transient lifetimes and detect cycles and captive dependencies
- List the wiring errors that compile-time types cannot catch, and move some of them to startup or to compile time
- Use @zudojs/container's typed APIs and recognise the one that is not checked

## The cart two customers shared

In [Classes](https://zudojs.oyinlola.site/learn/ts-classes#injection) you wired services by hand: create the dependencies, pass them into constructors, all in one entry file called the **composition root**. A shop's checkout was written that way. Everything is created once, when the server starts:

problem.ts

```ts
class Cart {
  readonly items: string[] = [];
  add(sku: string): void {
    this.items.push(sku);
  }
}

class CheckoutService {
  constructor(private readonly cart: Cart) {}
  checkout(customer: string): string {
    return `${customer} pays for ${this.cart.items.join(", ")}`;
  }
}

// main.ts: everything is created once, when the server starts
const cart = new Cart();
const checkout = new CheckoutService(cart);

function handleRequest(customer: string, skus: string[]): string {
  for (const sku of skus) cart.add(sku);
  return checkout.checkout(customer);
}

console.log(handleRequest("Ada", ["RICE-50KG"]));
console.log(handleRequest("Tunde", ["OIL-5L"]));
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
Ada pays for RICE-50KG
Tunde pays for RICE-50KG, OIL-5L
```

Tunde is charged for Ada's rice. The types are all correct. The bug is about **lifetime**, how long an object lives and who shares it: a cart must live for one customer's request, a logger for the whole process, and the checkout service in between depends on both. Fixing it by hand means creating the cart, and every service that holds it, inside `handleRequest`, while still sharing the long-lived ones. With thirty services that wiring code becomes the most fragile file in the project.

A **dependency injection container** does this wiring for you. You tell it, once, how to build each dependency and how long it lives; then you ask it for a service, and it builds the service and everything the service needs. In this lesson you build a typed container from scratch, then look at `@zudojs/container`, which [The container in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-container) teaches in full. You will also see the honest limit: the most common container error, "nothing is registered for this", cannot be a type error in an ordinary container, and you will see what it costs to make it one.

## What a container does

- A **dependency** is an object a service needs: `CheckoutService` depends on a `Cart`, a `Clock` and a `Logger`.
- A **token** is the key you register and resolve by. It names one dependency.
- A **provider** says how to build the dependency: a ready value, a factory function, or a class and the tokens for its constructor arguments.
- A **lifetime** says how long a built instance is reused. **Singleton**: one per container, for the whole process. **Scoped**: one per scope, usually one HTTP request. **Transient**: a new one every time it is asked for.
- **Resolving** a token means building (or reusing) its instance, which first resolves the tokens it depends on, recursively.

The container is itself a small graph algorithm: services are nodes, "needs" are edges, and resolving is a depth-first walk ([Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs)). That is why it can also find cycles.

## Tokens: a runtime key that carries a type

The obvious key is the interface: "give me a `Clock`". That cannot work, because interfaces are erased when TypeScript compiles ([The compiler](https://zudojs.oyinlola.site/learn/ts-compiler#erasure)). There is nothing left at runtime to look up:

interface-key.ts

```ts
interface Clock {
  now(): Date;
}

declare function resolve<T>(key: unknown): T;

const clock = resolve(Clock);
```

What `npx tsc --noEmit` prints

```ts
interface-key.ts:7:23 - error TS2693: 'Clock' only refers to a type, but is being used as a value here.

7 const clock = resolve(Clock);
                        ~~~~~


Found 1 error in interface-key.ts:7
```

Other runtime keys each lose something. A **string** such as `"clock"` exists at runtime, but it carries no type, so `resolve<Clock>("clock")` is a claim, and two modules can pick the same string by accident. A **symbol** is unique but just as untyped. A **class** is both a runtime value and a type, so it works for classes, but not for interfaces, functions or configuration values.

The answer is a small object that *is* the runtime key and *carries* the type:

token.ts

```ts
export class Token<T> {
  declare readonly __type: T;
  constructor(readonly name: string) {}
}

export type TypesOf<D extends readonly Token<unknown>[]> = { -readonly [I in keyof D]: D[I] extends Token<infer U> ? U : never };

export type Lifetime = "singleton" | "scoped" | "transient";
```

The shop's services for the rest of the lesson, with one token per dependency, exported next to its interface:

services.ts

```ts
import { Token } from "./token.js";

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(message: string): void;
}

export class Cart {
  readonly items: string[] = [];
  add(sku: string): void {
    this.items.push(sku);
  }
}

export class CheckoutService {
  constructor(
    private readonly cart: Cart,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  checkout(customer: string): string {
    const receipt = `${customer} paid for ${this.cart.items.join(", ")} on ${this.clock.now().toISOString().slice(0, 10)}`;
    this.log.info(receipt);
    return receipt;
  }
}

export const CLOCK = new Token<Clock>("Clock");
export const LOGGER = new Token<Logger>("Logger");
export const CART = new Token<Cart>("Cart");
export const CHECKOUT = new Token<CheckoutService>("CheckoutService");
```

- `declare readonly __type: T` is a **phantom property**, the same trick as the request classes in [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs#classes): it emits no JavaScript, but it makes `Token<Clock>` and `Token<Logger>` different types, so `resolve(CLOCK)` can infer `Clock`.
- The token object's **identity** is the key. Two tokens with the same name are different keys. The `name` is only for error messages.
- `TypesOf` is a mapped type over a tuple: it turns `[Token<Cart>, Token<Clock>]` into `[Cart, Clock]`. It is how a list of dependency tokens becomes the parameter list of a factory. `-readonly` removes `readonly` so the result can be used as a parameter list.

## Building the container

REASON IT OUT

### Before you write resolve

You are about to write `resolve(token)`. Think through the cases first:

- Two services both need the `Clock`. Should they get one clock or two? Who decides?
- A singleton service needs the `Cart`, which is scoped. What would go wrong if the container allowed it?
- `OrderService` needs `InvoiceService`, which needs `OrderService`. What does a naive recursive `resolve` do?
- Nothing is registered for `PaymentGateway`. When is the earliest moment the program could know? What should the error message contain?

**Show the reasoning**

The registration decides, through its lifetime: a singleton clock is shared, a transient one is not. A singleton holding a scoped cart would keep the *first* request's cart forever and hand it to every later request: the opening bug, reintroduced by the container. That is called a **captive dependency**, and the container must refuse it. A cycle makes naive recursion run until the stack overflows, so `resolve` carries the path it is on and fails when a token appears twice. A missing registration can only be known when someone resolves the token, or earlier if you check the whole graph at startup, because registrations are ordinary runtime calls. The error must name the missing token *and* the chain that needed it, or nobody can find the service that asked.

container.ts

```ts
import type { Lifetime, Token, TypesOf } from "./token.js";

interface Registration {
  readonly lifetime: Lifetime;
  readonly deps: readonly Token<unknown>[];
  readonly create: (...deps: never[]) => unknown;
}

type Cache = Map<Token<unknown>, unknown>;

export interface Resolver {
  resolve<T>(token: Token<T>): T;
}

export class Container implements Resolver {
  readonly #registrations = new Map<Token<unknown>, Registration>();
  readonly #singletons: Cache = new Map();

  register<T, const D extends readonly Token<unknown>[]>(
    token: Token<T>,
    lifetime: Lifetime,
    deps: D,
    factory: (...deps: TypesOf<D>) => T,
  ): this {
    this.#registrations.set(token, { lifetime, deps, create: factory as (...deps: never[]) => unknown });
    return this;
  }

  registerClass<T, const D extends readonly Token<unknown>[]>(
    token: Token<T>,
    lifetime: Lifetime,
    deps: D,
    type: new (...deps: TypesOf<D>) => T,
  ): this {
    return this.register(token, lifetime, deps, (...args) => new type(...args));
  }

  registerValue<T>(token: Token<T>, value: T): this {
    return this.register(token, "singleton", [], () => value);
  }

  resolve<T>(token: Token<T>): T {
    return this.#resolve(token, undefined, []);
  }

  createScope(): Resolver {
    const cache: Cache = new Map();
    return { resolve: (token) => this.#resolve(token, cache, []) };
  }

  #resolve<T>(token: Token<T>, scopeCache: Cache | undefined, path: readonly Token<unknown>[]): T {
    const chain = [...path, token].map((t) => t.name).join(" -> ");
    if (path.includes(token)) throw new Error(`circular dependency: ${chain}`);
    const registration = this.#registrations.get(token);
    if (!registration) throw new Error(`nothing registered for ${token.name} (${chain})`);

    let cache: Cache | undefined;
    if (registration.lifetime === "singleton") cache = this.#singletons;
    if (registration.lifetime === "scoped") {
      const holder = path.find((t) => this.#registrations.get(t)?.lifetime === "singleton");
      if (holder) throw new Error(`captive dependency: singleton ${holder.name} would keep scoped ${token.name} forever (${chain})`);
      if (!scopeCache) throw new Error(`${token.name} is scoped: resolve it from a scope (${chain})`);
      cache = scopeCache;
    }
    if (cache?.has(token)) return cache.get(token) as T;

    const args = registration.deps.map((dep) => this.#resolve(dep, scopeCache, [...path, token]));
    const instance = (registration.create as (...deps: unknown[]) => unknown)(...args) as T;
    cache?.set(token, instance);
    return instance;
  }
}
```

The structure is the one you have used for two lessons now: precise public signatures over loosely typed storage. `register` is generic in the token's type `T` and in the dependency tuple `D`; the `const` modifier on `D` makes TypeScript infer `[CART, CLOCK, LOGGER]` as a tuple, not as an array of a union. The factory's parameters are `TypesOf<D>`, so they are checked against the tokens. The storage forgets all of that, and `#resolve` needs two casts: the cached value is a `T` because it was stored under a `Token<T>`, and the factory is called with values resolved from its own token list. Neither can be proven by the compiler; both follow from how `register` stored them.

The rest of `#resolve` is the reasoning above, in order: cycle check on the path, missing-registration error with the chain, the captive check (any singleton on the path, even with a transient in between, makes a scoped dependency captive), then the cache for the lifetime, then building the dependencies depth-first.

### Lifetimes and scopes fix the cart

app.ts

```ts
import { Container } from "./container.js";
import { CART, CHECKOUT, CLOCK, Cart, CheckoutService, LOGGER } from "./services.js";

let carts = 0;
const container = new Container()
  .registerValue(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") })
  .register(LOGGER, "singleton", [], () => ({ info: (message: string) => console.log(`[log] ${message}`) }))
  .register(CART, "scoped", [], () => {
    carts++;
    return new Cart();
  })
  .registerClass(CHECKOUT, "transient", [CART, CLOCK, LOGGER], CheckoutService);

const ada = container.createScope();
const tunde = container.createScope();
ada.resolve(CART).add("RICE-50KG");
tunde.resolve(CART).add("OIL-5L");
ada.resolve(CART).add("GARRI-5KG");

console.log(ada.resolve(CHECKOUT).checkout("Ada"));
console.log(tunde.resolve(CHECKOUT).checkout("Tunde"));
console.log("carts created:", carts, "same logger:", container.resolve(LOGGER) === ada.resolve(LOGGER));
```

Output of `npx tsx app.ts` and of the browser terminal

```json
[log] Ada paid for RICE-50KG, GARRI-5KG on 2026-09-24
Ada paid for RICE-50KG, GARRI-5KG on 2026-09-24
[log] Tunde paid for OIL-5L on 2026-09-24
Tunde paid for OIL-5L on 2026-09-24
carts created: 2 same logger: true
```

Each request gets a **scope**, and inside one scope the scoped `Cart` is built once and reused: Ada's two `add` calls went to the same cart, and Tunde got his own. The checkout service is transient, so each request builds a fresh one around its own cart. The logger is a singleton shared by everyone. In a web server, the framework creates the scope when a request arrives and throws it away when the response is sent.

Which lifetime to choose? Singleton for things that are expensive to create and safe to share (connection pools, configuration, loggers, clients); scoped for anything that belongs to one request (the current user, a database transaction, a cart); transient for small, cheap, stateless helpers. When unsure, a service that holds no state of its own can be a singleton only if everything it depends on can be too.

## Wiring the compiler can check

Because `registerClass` types the constructor as `new (...deps: TypesOf<D>) => T`, the dependency list is checked against the constructor's real parameter list: order, count and types. So is a factory's return value, and so is the variable you resolve into:

wiring-misuse.ts

```ts
import { Container } from "./container.js";
import { CART, CHECKOUT, CLOCK, CheckoutService, LOGGER } from "./services.js";

const container = new Container();
container.registerClass(CHECKOUT, "transient", [CLOCK, CART, LOGGER], CheckoutService);
container.registerClass(CHECKOUT, "transient", [CART, CLOCK], CheckoutService);
container.register(CLOCK, "singleton", [], () => new Date());
const clock: Date = container.resolve(CLOCK);
```

What `npx tsc --noEmit` prints

```ts
wiring-misuse.ts:5:71 - error TS2345: Argument of type 'typeof CheckoutService' is not assignable to parameter of type 'new (deps_0: Clock, deps_1: Cart, deps_2: Logger) => CheckoutService'.
  Types of parameters 'cart' and 'deps_0' are incompatible.
    Type 'Clock' is missing the following properties from type 'Cart': items, add

5 container.registerClass(CHECKOUT, "transient", [CLOCK, CART, LOGGER], CheckoutService);
                                                                        ~~~~~~~~~~~~~~~

wiring-misuse.ts:6:63 - error TS2345: Argument of type 'typeof CheckoutService' is not assignable to parameter of type 'new (deps_0: Cart, deps_1: Clock) => CheckoutService'.
  Target signature provides too few arguments. Expected 3 or more, but got 2.

6 container.registerClass(CHECKOUT, "transient", [CART, CLOCK], CheckoutService);
                                                                ~~~~~~~~~~~~~~~

wiring-misuse.ts:7:50 - error TS2741: Property 'now' is missing in type 'Date' but required in type 'Clock'.

7 container.register(CLOCK, "singleton", [], () => new Date());
                                                   ~~~~~~~~~~

  services.ts:4:3 - 'now' is declared here.
    4   now(): Date;
        ~~~~~~~~~~~~

  container.ts:23:14 - The expected type comes from the return type of this signature.
    23     factory: (...deps: TypesOf<D>) => T,
                    ~~~~~~~~~~~~~~~~~~~~~~~~~~

wiring-misuse.ts:8:7 - error TS2740: Type 'Clock' is missing the following properties from type 'Date': toDateString, toTimeString, toLocaleDateString, toLocaleTimeString, and 38 more.

8 const clock: Date = container.resolve(CLOCK);
        ~~~~~


Found 4 errors in the same file, starting at: wiring-misuse.ts:5
```

Tokens in the wrong order, a missing constructor argument, a factory that builds the wrong thing, and a wrong assumption about what a token gives you: all compile errors. This is where types pay off in a container. The next section is where they stop.

## What compile-time types cannot guarantee

Here is a container with four wiring mistakes. Every line compiles:

failures.ts

```ts
import { Container } from "./container.js";
import { Token } from "./token.js";
import { CART, CHECKOUT, CLOCK, Cart, CheckoutService, LOGGER } from "./services.js";

interface PaymentGateway {
  charge(kobo: number): string;
}
const PAYMENTS = new Token<PaymentGateway>("PaymentGateway");
const RECEIPTS = new Token<{ print(): string }>("ReceiptPrinter");
const ORDERS = new Token<{ place(): string }>("OrderService");
const INVOICES = new Token<{ total(): number }>("InvoiceService");
const REPORTS = new Token<{ run(): string }>("DailyReport");

const container = new Container()
  .registerValue(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") })
  .registerValue(LOGGER, { info: () => {} })
  .register(CART, "scoped", [], () => new Cart())
  .registerClass(CHECKOUT, "transient", [CART, CLOCK, LOGGER], CheckoutService)
  .register(RECEIPTS, "transient", [PAYMENTS], (payments) => ({ print: () => payments.charge(100) }))
  .register(ORDERS, "singleton", [INVOICES], (invoices) => ({ place: () => `total ${invoices.total()}` }))
  .register(INVOICES, "singleton", [ORDERS], (orders) => ({ total: () => orders.place().length }))
  .register(REPORTS, "singleton", [CHECKOUT], (checkout) => ({ run: () => checkout.checkout("report") }));

function attempt(label: string, run: () => unknown): void {
  try {
    run();
    console.log(`${label}: ok`);
  } catch (error) {
    console.log(`${label}: ${(error as Error).message}`);
  }
}

attempt("receipts", () => container.resolve(RECEIPTS));
attempt("orders", () => container.resolve(ORDERS));
attempt("checkout at the root", () => container.resolve(CHECKOUT));
attempt("report in a scope", () => container.createScope().resolve(REPORTS));
attempt("checkout in a scope", () => container.createScope().resolve(CHECKOUT));
```

Output of `npx tsx failures.ts` and of the browser terminal

```ts
receipts: nothing registered for PaymentGateway (ReceiptPrinter -> PaymentGateway)
orders: circular dependency: OrderService -> InvoiceService -> OrderService
checkout at the root: Cart is scoped: resolve it from a scope (CheckoutService -> Cart)
report in a scope: captive dependency: singleton DailyReport would keep scoped Cart forever (DailyReport -> CheckoutService -> Cart)
checkout in a scope: ok
```

Why can none of these be a type error?

- **A missing registration.** `container.resolve(RECEIPTS)` type-checks because `resolve` accepts any `Token<T>`. Whether a token was registered depends on which `register` calls ran, in which order, maybe inside an `if`, maybe in a plugin loaded from a folder. The type of `container` is the same before and after each call. (The next section changes exactly that, at a price.)
- **A cycle.** Each registration is fine on its own; the cycle only exists in the graph that the calls build together, at runtime.
- **Lifetimes.** `"scoped"` and `"singleton"` are values passed at runtime. The types know `CheckoutService` needs a `Cart`, not how long either lives.

Two more mistakes are invisible even at runtime unless you look closely:

same-type.ts

```ts
import { Container } from "./container.js";
import { Token } from "./token.js";
import type { Clock } from "./services.js";

const SYSTEM_CLOCK = new Token<Clock>("SystemClock");
const FIXED_CLOCK = new Token<Clock>("FixedClock");
const INVOICE_DATE = new Token<string>("InvoiceDate");

const container = new Container()
  .registerValue(SYSTEM_CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") })
  .registerValue(FIXED_CLOCK, { now: () => new Date("2020-01-01T00:00:00Z") })
  .register(INVOICE_DATE, "transient", [FIXED_CLOCK], (clock) => clock.now().toISOString().slice(0, 10));

console.log("invoice dated", container.resolve(INVOICE_DATE));

const CLOCK_FROM_ANOTHER_FILE = new Token<Clock>("SystemClock");
try {
  container.resolve(CLOCK_FROM_ANOTHER_FILE);
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx same-type.ts` and of the browser terminal

```ts
invoice dated 2020-01-01
Error: nothing registered for SystemClock (SystemClock)
```

- **Two tokens of the same type are interchangeable to the compiler.** The invoice was meant to use the system clock; it got the test clock and is dated 2020. Types compare shapes, and both tokens are `Token<Clock>`. Only a distinct name in code review, or a test, catches it.
- **A token recreated in another file is a different key.** It has the same name and type, and it finds nothing. Export each token from exactly one module, next to its interface, and import it everywhere.

So what can you do? Three honest answers:

1. **Fail at startup, not at the first request.** Resolve every singleton (and one instance of every scoped service in a throwaway scope) when the app boots. A missing registration, a cycle or a captive dependency then stops the deployment instead of a customer's checkout. The third exercise builds a graph check that does not even need to construct anything.
2. **Test the composition root.** A single test that builds the real container and resolves the top-level services catches every wiring error the types miss.
3. **Trade flexibility for compile-time checking**, as the next section shows.

## Moving missing registrations to compile time, and the cost

The container's type did not change when you registered something, so the compiler could not know what was registered. A **builder** whose type grows with every registration can. Each `add` returns a new builder whose type parameter `S` has one more property, and each factory receives only the services added *before* it:

builder.ts

```ts
type Factory = (services: never) => unknown;

export class ServiceBuilder<S extends object = {}> {
  constructor(private readonly factories: ReadonlyMap<string, Factory> = new Map()) {}

  add<K extends string, T>(name: K extends keyof S ? never : K, factory: (services: S) => T): ServiceBuilder<S & { readonly [P in K]: T }> {
    return new ServiceBuilder(new Map([...this.factories, [name, factory as Factory]]));
  }

  build(): S {
    const services = {} as S;
    const instances = new Map<string, unknown>();
    for (const [name, factory] of this.factories) {
      Object.defineProperty(services, name, {
        enumerable: true,
        get: () => {
          if (!instances.has(name)) instances.set(name, (factory as (services: S) => unknown)(services));
          return instances.get(name);
        },
      });
    }
    return services;
  }
}
```

builder-demo.ts

```ts
import { ServiceBuilder } from "./builder.js";

const services = new ServiceBuilder()
  .add("clock", () => ({ now: () => new Date("2026-09-24T09:00:00Z") }))
  .add("payments", () => ({ charge: (kobo: number) => `PSK_${kobo}` }))
  .add("orders", ({ clock, payments }) => ({
    place: (kobo: number) => `${payments.charge(kobo)} at ${clock.now().toISOString().slice(11, 16)}`,
  }))
  .build();

console.log(services.orders.place(1_850_000));
console.log(services.orders === services.orders, Object.keys(services).join(","));
```

Output of `npx tsx builder-demo.ts` and of the browser terminal

```ts
PSK_1850000 at 09:00
true clock,payments,orders
```

The finished container is a plain object with one typed property per service, created lazily on first access and then reused. There is no `resolve` call that could name a missing service, and every mistake from the previous section that is about *presence* is now a compile error:

builder-misuse.ts

```ts
import { ServiceBuilder } from "./builder.js";

const services = new ServiceBuilder()
  .add("orders", ({ payments }) => ({ place: (kobo: number) => payments.charge(kobo) }))
  .add("payments", () => ({ charge: (kobo: number) => `PSK_${kobo}` }))
  .add("payments", () => ({ charge: (kobo: number) => `FLW_${kobo}` }))
  .build();

services.invoices.total();
```

What `npx tsc --noEmit` prints

```ts
builder-misuse.ts:4:21 - error TS2339: Property 'payments' does not exist on type '{}'.

4   .add("orders", ({ payments }) => ({ place: (kobo: number) => payments.charge(kobo) }))
                      ~~~~~~~~

builder-misuse.ts:6:8 - error TS2345: Argument of type '"payments"' is not assignable to parameter of type 'never'.

6   .add("payments", () => ({ charge: (kobo: number) => `FLW_${kobo}` }))
         ~~~~~~~~~~

builder-misuse.ts:9:10 - error TS2339: Property 'invoices' does not exist on type '{ readonly orders: { place: (kobo: number) => any; }; } & { readonly payments: { charge: (kobo: number) => string; }; } & { readonly payments: { charge: (kobo: number) => string; }; }'.

9 services.invoices.total();
           ~~~~~~~~


Found 3 errors in the same file, starting at: builder-misuse.ts:4
```

A dependency used before it is added, a duplicate name (`K extends keyof S ? never : K` turns a repeated name into `never`) and a service that was never added are all refused. Cycles are impossible, because a factory can only see services added before it. Now the price:

- **Registration order is fixed** by the dependency graph; you must add dependencies first. In a large app that ordering is real work.
- **Everything is one expression.** Modules cannot each register their own services in their own files without passing builders around and merging their types.
- **No plugins discovered at runtime,** because their services cannot be part of a type that was computed at compile time.
- **Every service here is a singleton.** Scopes and transients need more machinery (for example a second builder for per-request services that receives the singletons).
- **Compile time grows** with a long chain of intersections; hundreds of services make the editor noticeably slower.

Small applications and libraries often choose this style (some call it "manual DI with a typed record"). Frameworks with modules and plugins choose the runtime container plus startup checks. Neither is wrong; know which guarantee you are buying.

## The same ideas in @zudojs/container

`@zudojs/container` uses the ideas you just built. `createToken<T>(name)` is your `Token`. `registerFactory(token, factory, inject, options)` types the factory's parameters from the `inject` tokens, exactly like your `TypesOf`. Lifetimes are `ContainerScope.SINGLETON`, `SCOPED` and `TRANSIENT`, and `resolveMany` returns a typed tuple:

zudo.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { Cart, CheckoutService } from "./services.js";
import type { Clock, Logger } from "./services.js";

const CLOCK = createToken<Clock>("Clock");
const LOGGER = createToken<Logger>("Logger");
const CART = createToken<Cart>("Cart");
const CHECKOUT = createToken<CheckoutService>("CheckoutService");

const container = createContainer();
container.registerValue(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") });
container.registerValue(LOGGER, { info: (message: string) => console.log(`[log] ${message}`) });
container.registerFactory(CART, () => new Cart(), [], { scope: ContainerScope.SCOPED });
container.registerFactory(CHECKOUT, (cart, clock, log) => new CheckoutService(cart, clock, log), [CART, CLOCK, LOGGER]);

const request = container.createScope({ name: "request-ada" });
request.resolve(CART).add("RICE-50KG");
console.log(request.resolve(CHECKOUT).checkout("Ada"));

const [clock, log] = container.resolveMany([CLOCK, LOGGER]);
log.info(`resolved together at ${clock.now().toISOString().slice(0, 10)}`);
```

Output of `npx tsx zudo.ts` and of the browser terminal

```json
[log] Ada paid for RICE-50KG on 2026-09-24
Ada paid for RICE-50KG on 2026-09-24
[log] resolved together at 2026-09-24
```

Swap two tokens in `registerFactory`'s `inject` list and the factory's parameters no longer match: a compile error, as in your container. Since `@zudojs/container` 1.3.0, `registerClass` checks its `inject` list against the constructor the same way:

zudo-class.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { Cart, CheckoutService } from "./services.js";
import type { Clock, Logger } from "./services.js";

const CLOCK = createToken<Clock>("Clock");
const LOGGER = createToken<Logger>("Logger");
const CART = createToken<Cart>("Cart");
const CHECKOUT = createToken<CheckoutService>("CheckoutService");

const container = createContainer();
container.registerValue(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") });
container.registerValue(LOGGER, { info: () => {} });
container.registerFactory(CART, () => new Cart(), [], { scope: ContainerScope.SCOPED });
container.registerClass(CHECKOUT, CheckoutService, { inject: [CLOCK, CART, LOGGER] });
```

What `npx tsc --noEmit` prints

```ts
zudo-class.ts:14:35 - error TS2345: Argument of type 'typeof CheckoutService' is not assignable to parameter of type 'InjectedConstructor<CheckoutService, NoInfer<readonly [InjectionToken<Clock>, InjectionToken<Cart>, InjectionToken<Logger>]>>'.
  Types of parameters 'cart' and 'args' are incompatible.
    Type '{ [x: number]: Cart | Clock | Logger; toString: never; toLocaleString: never; concat: never; join: never; slice: never; indexOf: never; lastIndexOf: never; every: never; ... 26 more ...; length: never; }' is not assignable to type '[cart: Cart, clock: Clock, log: Logger]'.
      Type at position 0 in source is not compatible with type at position 0 in target.
        Type 'Clock' is missing the following properties from type 'Cart': items, add

14 container.registerClass(CHECKOUT, CheckoutService, { inject: [CLOCK, CART, LOGGER] });
                                     ~~~~~~~~~~~~~~~


Found 1 error in zudo-class.ts:14
```

The clock was passed where the cart belongs, and `CheckoutService`'s constructor takes `(cart, clock, log)`: the compiler catches the swap before the program ever runs, the same way it would for `registerFactory`. (Before `@zudojs/container` 1.3.0, `registerClass` typed the class as `Constructor<T>`, whose parameter list is `any[]`; the mistake compiled, and only surfaced as `TypeError: Cannot read properties of undefined (reading 'join')` deep inside `checkout` at runtime.) The package also enforces the runtime rules you implemented: resolving a scoped token at the root throws a `ScopedResolutionError`, a singleton that depends on a scoped token throws a `CaptiveDependencyError`, a cycle throws a `CircularDependencyError` naming the chain, and an unknown token throws a `RegistrationNotFoundError`. Two differences from your container are worth remembering: the default lifetime is **transient** when you pass no `scope`, and a class used as a token is registered automatically on first resolve, but only when its constructor takes no parameters.

## Testing wiring and swapping in fakes

A container makes the testing trick from [Classes](https://zudojs.oyinlola.site/learn/ts-classes#fakes) cheap: build the container your tests need with fake values under the real tokens. The type of each token still checks the fake, so a fake clock must really have a `now()` method:

container.test.ts

```ts
import { Container } from "./container.js";
import { CART, CHECKOUT, CLOCK, Cart, CheckoutService, LOGGER } from "./services.js";

function check(label: string, actual: unknown, expected: unknown): void {
  console.log(`${Object.is(actual, expected) ? "PASS" : "FAIL"} ${label}`);
}

const logged: string[] = [];
function testContainer(): Container {
  return new Container()
    .registerValue(CLOCK, { now: () => new Date("2026-01-15T12:00:00Z") })
    .registerValue(LOGGER, { info: (message) => void logged.push(message) })
    .register(CART, "scoped", [], () => new Cart())
    .registerClass(CHECKOUT, "transient", [CART, CLOCK, LOGGER], CheckoutService);
}

// @ts-expect-error: a fake must have the real shape
testContainer().registerValue(CLOCK, { today: () => "2026-01-15" });

const scope = testContainer().createScope();
scope.resolve(CART).add("YAM-TUBER");
check("checkout uses the scoped cart and the fake clock", scope.resolve(CHECKOUT).checkout("Chiamaka"), "Chiamaka paid for YAM-TUBER on 2026-01-15");
check("the fake logger saw it", logged.length, 1);

const root = testContainer();
check("scoped cart per scope", root.createScope().resolve(CART) === root.createScope().resolve(CART), false);
check("singleton shared", root.resolve(CLOCK) === root.createScope().resolve(CLOCK), true);
```

Output of `npx tsx container.test.ts` and of the browser terminal

```ts
PASS checkout uses the scoped cart and the fake clock
PASS the fake logger saw it
PASS scoped cart per scope
PASS singleton shared
```

The most valuable single test in a project with a container is the one that builds the *production* composition root and resolves every top-level service. It is the test that catches missing registrations, cycles and captive dependencies, the three errors types cannot.

## Containers in production

- **One composition root.** Only the entry point (and tests) touch the container. Services receive dependencies through constructors and never call `resolve` themselves; a service that pulls from the container (the "service locator" style) hides its dependencies and cannot be checked.
- **Validate at startup.** Resolve everything once while booting, or run a graph check, so wiring errors fail the deployment rather than a request.
- **One module owns each token.** Export it next to its interface. Never recreate a token by name.
- **Scoped means "per request", and nothing longer-lived may hold it.** The captive-dependency check is the container's defence; code review of lifetimes is yours.
- **Dispose what the container created.** Singletons such as database pools must be closed on shutdown, in reverse order of creation. `@zudojs/container` and [the lifecycle package](https://zudojs.oyinlola.site/learn/zudo-lifecycle) do this for you.
- **Do not add a container too early.** Ten services wired by hand in one file are clearer than a container. Reach for one when lifetimes and scopes make hand wiring error-prone.

## Practice

TRY IT YOURSELF

### A typed resolveAll

Write `resolveAll(resolver, tokens)` that resolves several tokens at once and returns a tuple typed per token, like `@zudojs/container`'s `resolveMany`. Use `TypesOf`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`tokens.map((token) => resolver.resolve(token))` resolves every token in the same order they were given.

HINT 2

`return tokens.map((token) => resolver.resolve(token)) as TypesOf<D>;` — the cast is safe because there is one resolved value per token, in order.

SOLUTION

resolve-all.ts

```ts
import { Container } from "./container.js";
import type { Resolver } from "./container.js";
import { CLOCK, LOGGER } from "./services.js";
import type { Token, TypesOf } from "./token.js";

function resolveAll<const D extends readonly Token<unknown>[]>(resolver: Resolver, tokens: D): TypesOf<D> {
  return tokens.map((token) => resolver.resolve(token)) as TypesOf<D>;
}

const container = new Container()
  .registerValue(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") })
  .registerValue(LOGGER, { info: (message: string) => console.log(`[log] ${message}`) });

const [clock, log] = resolveAll(container, [CLOCK, LOGGER]);
log.info(`it is ${clock.now().toISOString().slice(0, 10)}`);
```

Output of `npx tsx resolve-all.ts` and of the browser terminal

```json
[log] it is 2026-09-24
```

`const D` keeps the argument a tuple, and `TypesOf<D>` maps each position to its token's type, so `clock` is a `Clock` and `log` a `Logger`. `Array.prototype.map` returns `unknown[]`, so one cast connects it to the tuple type; it is safe because the array has one resolved value per token, in the same order.

TRY IT YOURSELF

### A container per test

Write `buildContainer(overrides)`, the production composition root, where `overrides` may replace the clock. Show that production and a test get different dates from the same code, and that the override is type-checked.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Chain the registrations on the same `new Container()`: `.registerValue(CLOCK, ...)`, `.registerValue(LOGGER, ...)`, `.register(CART, "scoped", [], () => new Cart())`, `.registerClass(CHECKOUT, "transient", [CART, CLOCK, LOGGER], CheckoutService)`.

HINT 2

For a fixed production date, register `CLOCK` with `overrides.clock ?? { now: () => new Date("2026-09-24T09:00:00Z") }`, and `LOGGER` with `{ info: () => {} }` (tests do not need to see log lines).

SOLUTION

composition-root.ts

```ts
import { Container } from "./container.js";
import { CART, CHECKOUT, CLOCK, Cart, CheckoutService, LOGGER } from "./services.js";
import type { Clock } from "./services.js";

interface Overrides {
  clock?: Clock;
}

function buildContainer(overrides: Overrides = {}): Container {
  return new Container()
    .registerValue(CLOCK, overrides.clock ?? { now: () => new Date("2026-09-24T09:00:00Z") })
    .registerValue(LOGGER, { info: () => {} })
    .register(CART, "scoped", [], () => new Cart())
    .registerClass(CHECKOUT, "transient", [CART, CLOCK, LOGGER], CheckoutService);
}

for (const container of [buildContainer(), buildContainer({ clock: { now: () => new Date("2025-12-31T23:59:00Z") } })]) {
  const request = container.createScope();
  request.resolve(CART).add("RICE-50KG");
  console.log(request.resolve(CHECKOUT).checkout("Ada"));
}
```

Output of `npx tsx composition-root.ts` and of the browser terminal

```ts
Ada paid for RICE-50KG on 2026-09-24
Ada paid for RICE-50KG on 2025-12-31
```

Tests use the same wiring as production and replace only what must be controlled. Because `Overrides` is typed from the service interfaces, a fake with the wrong shape does not compile.

TRY IT YOURSELF

### Check the graph at startup without building anything

Given the dependency graph as a map from service name to the names it needs, write `checkGraph` that returns every missing dependency and every cycle, using depth-first search. Run it on a graph with one of each.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep a `done: Set<string>` (checked already, skip) and recurse with a growing `path` array. If `path.includes(name)`, you have found a cycle: the loop is `path` from that name onwards, plus `name` again.

HINT 2

If `graph.get(name)` is `undefined`, report `missing: ${name} (needed by ${path.at(-1)})`. Otherwise recurse into each dependency with `visit(dep, [...path, name])`, then mark `name` done.

SOLUTION

check-graph.ts

```ts
function checkGraph(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const problems: string[] = [];
  const done = new Set<string>();

  function visit(name: string, path: readonly string[]): void {
    if (path.includes(name)) {
      problems.push(`cycle: ${[...path.slice(path.indexOf(name)), name].join(" -> ")}`);
      return;
    }
    if (done.has(name)) return;
    const deps = graph.get(name);
    if (!deps) {
      problems.push(`missing: ${name} (needed by ${path.at(-1)})`);
      return;
    }
    for (const dep of deps) visit(dep, [...path, name]);
    done.add(name);
  }

  for (const name of graph.keys()) visit(name, []);
  return problems;
}

const graph = new Map<string, readonly string[]>([
  ["CheckoutService", ["Cart", "Clock", "Logger"]],
  ["Cart", []],
  ["Clock", []],
  ["Logger", []],
  ["ReceiptPrinter", ["PaymentGateway"]],
  ["OrderService", ["InvoiceService"]],
  ["InvoiceService", ["OrderService"]],
]);

console.log(checkGraph(graph).join("\n"));
```

Output of `npx tsx check-graph.ts` and of the browser terminal

```ts
missing: PaymentGateway (needed by ReceiptPrinter)
cycle: OrderService -> InvoiceService -> OrderService
```

This is the check a container can run over its registrations before anything is constructed, so no factory with side effects (opening a database connection) runs during validation. `done` makes each service be checked once, which keeps the walk linear in the size of the graph. [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs) covers the same search for topological sorting, which is also how a container can decide the order in which to dispose singletons.

## Recap

- A container builds services and their dependencies from registrations: a token, a provider and a lifetime. Scopes give each request its own scoped instances.
- Interfaces cannot be tokens because they are erased. A `Token<T>` object is the runtime key, and its phantom `T` makes `resolve` return the right type. Its identity, not its name, is the key.
- Typing the dependency list as a tuple (`const D`, `TypesOf<D>`) checks it against the factory or constructor: order, count and types.
- `resolve` detects cycles with the path it is on and refuses captive dependencies: nothing under a singleton may be scoped.
- Missing registrations, cycles, lifetime mistakes and two tokens of the same type are not type errors in a runtime container. Catch them at startup and with a test of the real composition root.
- A builder whose type grows with each `add` moves missing registrations and cycles to compile time, at the cost of fixed order, one big expression and no runtime plugins.
- `@zudojs/container`'s `registerFactory` checks its `inject` list; its `registerClass` does not, so prefer a factory that calls the constructor.

Next: [Decorators](https://zudojs.oyinlola.site/learn/ts-decorators), the syntax many frameworks use to register handlers and injectable classes, and what it really does at runtime.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
