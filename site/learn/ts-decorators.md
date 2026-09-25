---
title: "Decorators — ZudoJS Academy"
description: "Write TC39 standard decorators for classes, methods, fields and accessors, see the JavaScript tsc emits, and compare them with experimentalDecorators."
source: https://zudojs.oyinlola.site/learn/ts-decorators
---

LEVEL 6 · LESSON 16 OF 22

Type-safe infrastructure Advanced

# Decorators

Write TC39 standard decorators for classes, methods, fields and accessors, see the JavaScript tsc emits, and compare them with experimentalDecorators.

- **60 min** to read and try
- **You need:** Classes, Conditional types, and the three type-safe infrastructure lessons before this one
- **You build:** Audit, retry, bind, validation and registration decorators for a payments service, column metadata that generates SQL, a type-checked injectable decorator, and a side-by-side look at legacy decorator metadata

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a decorator is at runtime and when it runs, and apply one by hand without the @ syntax
- Write typed class, method, field and accessor decorators, including decorator factories, with the standard context object
- Use addInitializer and context.metadata, polyfill Symbol.metadata, and avoid the inherited-metadata bug
- Read the JavaScript tsc emits for a decorated class and know which runtimes can run decorators
- Compare standard decorators with experimentalDecorators and emitDecoratorMetadata, and explain why frameworks relied on them

## The payout nobody audited

A payments service must write an audit entry for every operation that moves money: regulators ask for it, and so do angry customers. Each method starts with the same line:

problem.ts

```ts
const audit: string[] = [];

class PaymentService {
  charge(customerId: string, kobo: number): string {
    audit.push(`charge(${customerId}, ${kobo})`);
    return `charged ${customerId} ₦${kobo / 100}`;
  }

  refund(customerId: string, kobo: number): string {
    audit.push(`refund(${customerId}, ${kobo})`);
    return `refunded ${customerId} ₦${kobo / 100}`;
  }

  // added last week by a new teammate
  payout(merchantId: string, kobo: number): string {
    return `paid out ${merchantId} ₦${kobo / 100}`;
  }
}

const payments = new PaymentService();
payments.charge("cus_ada", 1_850_000);
payments.refund("cus_ada", 50_000);
payments.payout("mer_tunde", 9_000_000);
console.log(audit);
```

Output of `npx tsx problem.ts` and of the browser terminal

```json
[ 'charge(cus_ada, 1850000)', 'refund(cus_ada, 50000)' ]
```

₦90,000 left the company and the audit log says nothing. The rule "audit every money method" lives in a comment and in everyone's memory, and memory failed. The same shape appears everywhere in backend code: log this, time that, retry this network call, check that permission, register this class as a handler. Each is a **cross-cutting concern**, a rule that cuts across many methods and is not their business logic.

A **decorator** lets you write such a rule once, as a function, and attach it to a class or member with one visible line: `@audited`. In this lesson you write decorators of every kind with the TC39 standard syntax that TypeScript 5.0 and later support, read the JavaScript the compiler turns them into, check which runtimes can run them, and compare them with the older `experimentalDecorators` that many frameworks were built on.

## What a decorator is

A decorator is an ordinary function. JavaScript calls it once, when the class is *defined* (not each time a method is called), with two arguments: the thing being decorated (here, the method) and a **context** object that describes it (its name, its kind, and a few tools you will meet below). Whatever it returns replaces the original. You can do all of that by hand, without any new syntax:

by-hand.ts

```ts
const audit: string[] = [];

function audited<Args extends unknown[], R>(method: (...args: Args) => R, context: { name: string }) {
  return function (this: unknown, ...args: Args): R {
    audit.push(`${context.name}(${args.join(", ")})`);
    return method.apply(this, args);
  };
}

class PaymentService {
  charge(customerId: string, kobo: number): string {
    return `charged ${customerId} ₦${kobo / 100}`;
  }
  payout(merchantId: string, kobo: number): string {
    return `paid out ${merchantId} ₦${kobo / 100}`;
  }
}

PaymentService.prototype.charge = audited(PaymentService.prototype.charge, { name: "charge" });
PaymentService.prototype.payout = audited(PaymentService.prototype.payout, { name: "payout" });

const payments = new PaymentService();
console.log(payments.charge("cus_ada", 1_850_000));
console.log(payments.payout("mer_tunde", 9_000_000));
console.log(audit);
```

Output of `npx tsx by-hand.ts` and of the browser terminal

```ts
charged cus_ada ₦18500
paid out mer_tunde ₦90000
[ 'charge(cus_ada, 1850000)', 'payout(mer_tunde, 9000000)' ]
```

The replacement function is a **wrapper**: it does the extra work, then calls the original with the same `this` and arguments, and returns its result. The `@` syntax does the same replacement for you, right where the method is written, so the rule is visible and cannot be forgotten in another file. Here is the typed version, written against TypeScript's built-in decorator types:

audited.ts

```ts
export const auditLog: string[] = [];

export function audited<This, Args extends unknown[], R>(
  method: (this: This, ...args: Args) => R,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
): (this: This, ...args: Args) => R {
  const name = String(context.name);
  return function (this: This, ...args: Args): R {
    auditLog.push(`${name}(${args.join(", ")})`);
    return method.apply(this, args);
  };
}
```

payments.ts

```ts
import { audited, auditLog } from "./audited.js";

class PaymentService {
  @audited
  charge(customerId: string, kobo: number): string {
    return `charged ${customerId} ₦${kobo / 100}`;
  }

  @audited
  refund(customerId: string, kobo: number): string {
    return `refunded ${customerId} ₦${kobo / 100}`;
  }

  @audited
  payout(merchantId: string, kobo: number): string {
    return `paid out ${merchantId} ₦${kobo / 100}`;
  }
}

const payments = new PaymentService();
payments.charge("cus_ada", 1_850_000);
payments.refund("cus_ada", 50_000);
console.log(payments.payout("mer_tunde", 9_000_000));
console.log(auditLog);
```

Output of `npx tsx payments.ts` and of the browser terminal

```ts
paid out mer_tunde ₦90000
[
  'charge(cus_ada, 1850000)',
  'refund(cus_ada, 50000)',
  'payout(mer_tunde, 9000000)'
]
```

- `ClassMethodDecoratorContext<This, Value>` is the context type for methods. `This` is the class instance type and `Value` the method's type, so one generic decorator works for any method and keeps its exact parameter and return types. `context.name` is a `string | symbol`, hence `String(…)`.
- The decorator's return type must be assignable to the method it replaces. A wrapper that returned a `number` for a `string` method would not compile.
- Plain Node cannot run the `@` syntax directly, on this site or anywhere else: the next section explains why, and which compilers make it work, including this site's browser terminal.

## Where decorators can run

Standard decorators come from a TC39 proposal that has been at Stage 3 since 2022: the design is settled, but engines have been slow to ship it. At the time of writing, neither Node.js 24 nor Chromium 150 can parse `@audited`, and neither defines `Symbol.metadata`, which you will need later. So decorated code must always be **compiled** into plain JavaScript first:

| How you run it | Decorators work? | Why |
| --- | --- | --- |
| `tsc`, then `node` | Yes | tsc rewrites decorators into helper calls (shown later in this lesson) |
| `tsx`, esbuild and the bundlers and test runners built on such transpilers | Yes | esbuild rewrites them the same way (check your tool's documentation for the decorator version it supports) |
| `node file.ts` (type stripping) | No | Stripping only removes types; `@` is JavaScript syntax the engine does not know yet |
| This site's browser terminal | Standard: yes. Legacy: no | Its compiler (Babel) is configured with the standard (2023-11) decorators plugin, not with `experimentalDecorators` |
| Node.js 24 or a browser, directly | No | No native support |

node file.ts with a decorator (Node.js 24 from nodejs.org)

```bash
$ node account.ts
file:///home/you/project/account.ts:11
  @logged
  ^

SyntaxError: Invalid or unexpected token
    at compileSourceTextModule (node:internal/modules/esm/utils:318:16)
    …

Node.js v24.19.0
```

Node's type stripping passed the `@logged` line through untouched, because it is not a type, and the engine refused it. That is why every example with `@` on this page runs through a compiler rather than directly: on your computer that means `npx tsx`, and in the browser terminal it means the same standard-decorator transform Babel is configured for here. The legacy `experimentalDecorators` examples later in this lesson are the exception: this site's browser terminal is not configured for that mode, so they stay Node.js only.

## Every kind of decorator

A decorator can sit on a class, a method, a getter, a setter, a field or an auto-accessor. The context's `kind` says which, and the rules differ in what the decorator receives and what its return value means:

| Kind | First argument | Return value (optional) | Context type |
| --- | --- | --- | --- |
| `"class"` | The class | A replacement class | `ClassDecoratorContext` |
| `"method"` | The method | A replacement method | `ClassMethodDecoratorContext` |
| `"getter"` / `"setter"` | The getter or setter | A replacement | `ClassGetterDecoratorContext` / `ClassSetterDecoratorContext` |
| `"field"` | `undefined` (the field does not exist yet) | A function that transforms the field's initial value | `ClassFieldDecoratorContext` |
| `"accessor"` | `{ get, set }` of the hidden storage | `{ get?, set?, init? }` | `ClassAccessorDecoratorContext` |

Every context also has `name`, `static` and `private` (for members), `addInitializer` and `metadata`.

### Decorator factories: @retry(3)

A decorator that needs settings is written as a **decorator factory**: a function that takes the settings and returns the decorator. `@retry(3)` calls `retry(3)` first, and the returned function is the decorator. Payment verification calls fail on flaky networks, so this one retries async methods:

retry.ts

```ts
function retry(attempts: number) {
  return function <This, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => Promise<R>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<R>>,
  ) {
    return async function (this: This, ...args: Args): Promise<R> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await method.apply(this, args);
        } catch (error) {
          console.log(`${String(context.name)} attempt ${attempt} failed: ${(error as Error).message}`);
          if (attempt >= attempts) throw error;
        }
      }
    };
  };
}

class PaystackClient {
  #drops = 2;

  @retry(3)
  async verify(reference: string): Promise<string> {
    if (this.#drops-- > 0) throw new Error("ECONNRESET");
    return `${reference}: success`;
  }

  @retry(2)
  async refund(reference: string): Promise<string> {
    throw new Error(`gateway refused ${reference}`);
  }
}

const client = new PaystackClient();
console.log(await client.verify("PSK_1042"));
await client.refund("PSK_1042").catch((error: unknown) => console.log("gave up:", (error as Error).message));
```

Output of `npx tsx retry.ts` and of the browser terminal

```ts
verify attempt 1 failed: ECONNRESET
verify attempt 2 failed: ECONNRESET
PSK_1042: success
refund attempt 1 failed: gateway refused PSK_1042
refund attempt 2 failed: gateway refused PSK_1042
gave up: gateway refused PSK_1042
```

The decorator's parameter type says "a method that returns a `Promise`", so TypeScript refuses it on a synchronous method. Decorators are type-checked like calls, and the error names both directions (what the decorator accepts and what it would return):

retry-misuse.ts

```ts
function retry(attempts: number) {
  return function <This, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => Promise<R>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<R>>,
  ) {
    return method;
  };
}

class Ledger {
  @retry(3)
  balance(accountId: string): number {
    return accountId.length;
  }
}
```

What `npx tsc --noEmit` prints

```ts
retry-misuse.ts:11:4 - error TS1241: Unable to resolve signature of method decorator when called as an expression.
  Argument of type '(accountId: string) => number' is not assignable to parameter of type '(this: Ledger, accountId: string) => Promise<unknown>'.
    Type 'number' is not assignable to type 'Promise<unknown>'.

11   @retry(3)
      ~~~~~~~~

retry-misuse.ts:11:4 - error TS1270: Decorator function return type '(this: Ledger, accountId: string) => Promise<unknown>' is not assignable to type 'void | ((accountId: string) => number)'.
  Type '(this: Ledger, accountId: string) => Promise<unknown>' is not assignable to type '(accountId: string) => number'.
    Type 'Promise<unknown>' is not assignable to type 'number'.

11   @retry(3)
      ~~~~~~~~


Found 2 errors in the same file, starting at: retry-misuse.ts:11
```

### Fields and accessors

A field decorator runs before the field exists, so it receives `undefined`. What it can return is an **initializer**: a function that receives the field's initial value and returns the value to store. That makes it good for normalising defaults, and useless for checking later assignments, which it never sees. For those, TypeScript 4.9 added the `accessor` keyword: `accessor stock = 5` declares a getter and setter backed by hidden private storage, and an accessor decorator can wrap both:

fields.ts

```ts
function trimmedLower<This>(_value: undefined, context: ClassFieldDecoratorContext<This, string>) {
  return (initial: string) => initial.trim().toLowerCase();
}

function nonNegative<This>(
  target: ClassAccessorDecoratorTarget<This, number>,
  context: ClassAccessorDecoratorContext<This, number>,
): ClassAccessorDecoratorResult<This, number> {
  const check = (value: number) => {
    if (value < 0) throw new RangeError(`${String(context.name)} cannot be negative (got ${value})`);
    return value;
  };
  return {
    init: check,
    set(value) {
      target.set.call(this, check(value));
    },
  };
}

class Product {
  @trimmedLower email = "  SALES@Shop.NG ";
  @trimmedLower sku = " RICE-50KG";
  @nonNegative accessor stock = 5;
  priceKobo = 7_500_000;
}

const rice = new Product();
console.log(rice.email, rice.sku, rice.stock);
rice.email = "  STILL@UPPER.NG ";
console.log(JSON.stringify(rice.email));
try {
  rice.stock = -3;
} catch (error) {
  console.log(String(error));
}
console.log(rice.stock, Object.keys(rice));
```

Output of `npx tsx fields.ts` and of the browser terminal

```ts
sales@shop.ng rice-50kg 5
"  STILL@UPPER.NG "
RangeError: stock cannot be negative (got -3)
5 [ 'email', 'sku', 'priceKobo' ]
```

The later assignment to `email` kept its spaces and capitals: the field decorator only ran on the initial value. The accessor refused `-3` both at construction (`init`) and on assignment (`set`). `Object.keys` shows no `stock`: an auto-accessor stores its value in a private slot and exposes it through a getter and setter on the prototype, which also means it does not appear in `JSON.stringify`. Validation like this is convenient for invariants inside your own objects. It is not a replacement for validating input at the edge of the program ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)).

### Class decorators and registration

Class decorators are how frameworks *discover* your code: "this class handles `order.place`", "this class is a controller for `/orders`". A decorator factory can check the class against the command it claims to handle, which gives you the typed handler table of [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs) in decorator form:

registry.ts

```ts
export interface Commands {
  "order.place": { customerId: string; skus: string[] };
  "order.cancel": { orderId: string };
}

export interface CommandHandler<K extends keyof Commands> {
  execute(input: Commands[K]): string;
}

const handlers = new Map<keyof Commands, CommandHandler<keyof Commands>>();

export function handles<K extends keyof Commands>(type: K) {
  return function (value: new () => CommandHandler<K>, context: ClassDecoratorContext): void {
    context.addInitializer(() => {
      if (handlers.has(type)) throw new Error(`two handlers for ${type}`);
      handlers.set(type, new value() as CommandHandler<keyof Commands>);
    });
  };
}

export function execute<K extends keyof Commands>(type: K, input: Commands[K]): string {
  const handler = handlers.get(type) as CommandHandler<K> | undefined;
  if (!handler) return `no handler for ${type}`;
  return handler.execute(input);
}
```

place-order.ts

```ts
import { handles } from "./registry.js";
import type { Commands } from "./registry.js";

@handles("order.place")
export class PlaceOrderHandler {
  execute(input: Commands["order.place"]): string {
    return `order for ${input.customerId}: ${input.skus.join(", ")}`;
  }
}
```

wrong-handler.ts

```ts
import { handles } from "./registry.js";

@handles("order.cancel")
export class CancelOrderHandler {
  execute(input: { orderId: number }): string {
    return `cancel ${input.orderId}`;
  }
}
```

What `npx tsc --noEmit` prints

```ts
wrong-handler.ts:3:2 - error TS1238: Unable to resolve signature of class decorator when called as an expression.
  Argument of type 'typeof CancelOrderHandler' is not assignable to parameter of type 'new () => CommandHandler<"order.cancel">'.
    Type 'CancelOrderHandler' is not assignable to type 'CommandHandler<"order.cancel">'.
      Types of property 'execute' are incompatible.
        Type '(input: { orderId: number; }) => string' is not assignable to type '(input: { orderId: string; }) => string'.
          Types of parameters 'input' and 'input' are incompatible.
            Type '{ orderId: string; }' is not assignable to type '{ orderId: number; }'.
              Types of property 'orderId' are incompatible.
                Type 'string' is not assignable to type 'number'.

3 @handles("order.cancel")
   ~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in wrong-handler.ts:3
```

REASON IT OUT

### What the compiler can't catch

`wrong-handler.ts` just failed to compile because its input type was wrong. Before you read on, think:

- Does that same check know whether `"order.cancel"` has a handler at all?
- When does `handles("order.place")` actually run: when its class is written, or only under some condition?
- What would make a correctly typed handler class silently never run in a real program?

**Show the reasoning**

The decorator's type check only fires when the class is decorated, and a class is decorated when its module executes, which happens when something imports it. A handler file that nobody imports never registers, and nothing about the compiler's checking catches that: the types only ever see the classes that got imported and defined. So `"order.cancel"` can have a perfectly typed, perfectly correct handler sitting right there in the project, and the program still resolves it to "no handler" at runtime.

A handler whose input does not match its command does not compile. Now the trap that every decorator-based framework shares. The decorator registers the class when the class is *defined*, which happens when its module is *imported*. A program that never imports `place-order.ts` never runs the decorator:

main-forgot.ts

```ts
import { execute } from "./registry.js";

console.log(execute("order.place", { customerId: "cus_ada", skus: ["RICE-50KG"] }));
```

Output of `npx tsx main-forgot.ts` and of the browser terminal

```ts
no handler for order.place
```

main.ts

```ts
import "./place-order.js";
import { execute } from "./registry.js";

console.log(execute("order.place", { customerId: "cus_ada", skus: ["RICE-50KG"] }));
console.log(execute("order.cancel", { orderId: "ORD-1" }));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
order for cus_ada: RICE-50KG
no handler for order.cancel
```

That is why decorator-based frameworks ask you to list your controllers or modules somewhere, or scan folders at startup, and why a bundler that removes "unused" modules can silently drop a handler. Registration by decorator is still registration at runtime: `"order.cancel"` has no handler and nothing told you at compile time.

## addInitializer, and the order things happen in

`context.addInitializer(fn)` schedules code to run later: for instance members, at the start of every constructor call (before field initializers); for static members and classes, once, right after the class is defined. The classic use is binding a method to its instance, so it can be passed around as a callback without losing `this`:

bound.ts

```ts
function bound<This extends object, Args extends unknown[], R>(
  method: (this: This, ...args: Args) => R,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
): void {
  const name = context.name;
  context.addInitializer(function (this: This) {
    Object.defineProperty(this, name, { value: method.bind(this), writable: true, configurable: true });
  });
}

class Cart {
  readonly items: number[] = [];

  add(kobo: number): void {
    this.items.push(kobo);
  }

  @bound
  total(): string {
    return `₦${this.items.reduce((sum, kobo) => sum + kobo, 0) / 100}`;
  }
}

const cart = new Cart();
cart.add(750_000);
cart.add(120_000);

const { total } = cart;
console.log(total());
console.log(["checkout"].map(cart.total));

const { add } = cart;
try {
  add(5_000);
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx bound.ts` and of the browser terminal

```ts
₦8700
[ '₦8700' ]
TypeError: Cannot read properties of undefined (reading 'items')
```

`total` keeps working when it is taken off the object; the undecorated `add` does not, because a method called on its own has no `this` ([this in JavaScript](https://zudojs.oyinlola.site/learn/js-this)). The decorator returned nothing, so the method itself was not replaced; the initializer added a bound copy on each instance.

When several decorators are involved, the order matters and surprises people. Predict this before you read the output:

order.ts

```ts
function trace(label: string) {
  console.log(`evaluate ${label}`);
  return function (_value: unknown, context: DecoratorContext): void {
    console.log(`apply ${label} to ${context.kind} ${String(context.name)}`);
    context.addInitializer(() => console.log(`initializer of ${label}`));
  };
}

@trace("class")
class Order {
  @trace("status field") status = "new";

  @trace("outer")
  @trace("inner")
  place(): string {
    return "placed";
  }

  @trace("static method")
  static fromCart(): Order {
    return new Order();
  }
}

console.log("--- class defined");
new Order();
console.log("--- first order built");
new Order();
```

Output of `npx tsx order.ts` and of the browser terminal

```ts
evaluate class
evaluate status field
evaluate outer
evaluate inner
evaluate static method
apply static method to method fromCart
apply inner to method place
apply outer to method place
apply status field to field status
apply class to class Order
initializer of static method
initializer of class
--- class defined
initializer of inner
initializer of outer
initializer of status field
--- first order built
initializer of inner
initializer of outer
initializer of status field
```

- All decorator *expressions* are evaluated first, top to bottom, in source order: that is when a factory like `trace("outer")` runs.
- Then they are *applied*: static members first, then instance methods, then fields, and the class decorator last, after the class body is complete. On one member, the decorator closest to it is applied first: `inner` wraps the method, then `outer` wraps the result, so at call time `outer`'s wrapper runs first.
- Static and class initializers run once, when the class is defined. Instance initializers run on every `new`.

## Metadata: context.metadata and Symbol.metadata

Decorators on different members often need to build one shared description of the class: an ORM wants every column, a validator every rule, an API generator every route. Each decorator receives the same `context.metadata` object for its class, and after the class is defined that object is available as `TheClass[Symbol.metadata]`. Two practical problems come first:

- **`Symbol.metadata` does not exist yet** in Node.js 24 or Chromium. TypeScript's emitted code only creates the metadata object if the symbol exists, so without it `context.metadata` is `undefined`. The fix is a tiny **polyfill**, loaded before any decorated class.
- **The types.** With the default `lib`, TypeScript does not know `Symbol.metadata` and types `context.metadata` as possibly `undefined`. Adding `"ESNext.Decorators"` to `lib` declares both. That is a promise about the runtime which only the polyfill keeps.

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "ESNext.Decorators"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "verbatimModuleSyntax": true
  }
}
```

polyfill.ts

```ts
if (typeof Symbol.metadata !== "symbol") {
  Object.defineProperty(Symbol, "metadata", { value: Symbol.for("Symbol.metadata") });
}
```

Using `Symbol.for("Symbol.metadata")` matters: it is the same symbol esbuild (and so `tsx`) falls back to, so code compiled by either tool finds the same metadata. Now a `@column` decorator that records each field's database type:

columns.ts

```ts
import "./polyfill.js";

type ColumnType = "text" | "integer" | "boolean";

function column(type: ColumnType) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    const columns = (context.metadata.columns ??= {}) as Record<string, ColumnType>;
    columns[String(context.name)] = type;
  };
}

function columnsOf(type: abstract new (...args: never[]) => object): Record<string, ColumnType> {
  return (type[Symbol.metadata]?.columns ?? {}) as Record<string, ColumnType>;
}

class Product {
  @column("text") sku = "";
  @column("integer") priceKobo = 0;
  cachedLabel = "";
}

class PerishableProduct extends Product {
  @column("integer") shelfLifeDays = 0;
}

console.log(columnsOf(Product));
console.log(columnsOf(PerishableProduct));
```

Output of `npx tsx columns.ts` and of the browser terminal

```json
{ sku: 'text', priceKobo: 'integer', shelfLifeDays: 'integer' }
{ sku: 'text', priceKobo: 'integer', shelfLifeDays: 'integer' }
```

Look at the first line: `Product` now claims a `shelfLifeDays` column it does not have. A subclass's metadata object *inherits* from its parent's through the prototype chain, so that `PerishableProduct` sees the parent's columns. `context.metadata.columns ??= {}` found the parent's inherited `columns` object and added to it. Every metadata decorator must create its own copy before writing:

columns-fixed.ts

```ts
import "./polyfill.js";

type ColumnType = "text" | "integer" | "boolean";
type Columns = Record<string, ColumnType>;

function column(type: ColumnType) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    const metadata = context.metadata;
    if (!Object.hasOwn(metadata, "columns")) metadata.columns = { ...(metadata.columns as Columns | undefined) };
    (metadata.columns as Columns)[String(context.name)] = type;
  };
}

function columnsOf(type: abstract new (...args: never[]) => object): Columns {
  return (type[Symbol.metadata]?.columns ?? {}) as Columns;
}

class Product {
  @column("text") sku = "";
  @column("integer") priceKobo = 0;
  cachedLabel = "";
}

class PerishableProduct extends Product {
  @column("integer") shelfLifeDays = 0;
}

console.log(columnsOf(Product));
console.log(columnsOf(PerishableProduct));

function createTableSql(table: string, type: abstract new (...args: never[]) => object): string {
  const sqlType = { text: "TEXT", integer: "INTEGER", boolean: "BOOLEAN" } as const;
  const columns = Object.entries(columnsOf(type)).map(([name, kind]) => `${name} ${sqlType[kind]}`);
  return `CREATE TABLE ${table} (${columns.join(", ")})`;
}
console.log(createTableSql("perishables", PerishableProduct));
```

Output of `npx tsx columns-fixed.ts` and of the browser terminal

```json
{ sku: 'text', priceKobo: 'integer' }
{ sku: 'text', priceKobo: 'integer', shelfLifeDays: 'integer' }
CREATE TABLE perishables (sku TEXT, priceKobo INTEGER, shelfLifeDays INTEGER)
```

The subclass starts from a copy of its parent's columns and adds its own; the parent is untouched. Metadata values are typed `unknown` (the object is a `Record<PropertyKey, unknown>`), so reading them back needs a cast; keep the reading and writing in one small module that owns the key.

Without the polyfill, the two compilers fail differently, which is the worst kind of bug. Under `tsx`, esbuild uses its fallback symbol, the decorators write metadata, and `columnsOf` reads `Product[undefined]`, so every class silently has no columns. Under `tsc`, the metadata object is never created and the first decorator crashes:

columns.ts without the polyfill, compiled with tsc

```bash
$ npx tsc --noEmit false --outDir dist
$ node dist/columns.js
file:///home/you/project/dist/columns.js:37
        const columns = (context.metadata.columns ??= {});
                                 ^

TypeError: Cannot read properties of undefined (reading 'columns')
    at file:///home/you/project/dist/columns.js:37:34
    at __esDecorate (file:///home/you/project/dist/columns.js:12:40)
    …
```

## What tsc really emits

Because no engine runs decorators natively yet, the compiler rewrites them. Here is a small wallet with one method decorator, and below it the exact file `tsc` writes for it with this course's settings (`target: ES2024`):

wallet.tsNode.js only

```ts
function logged(method: (this: Wallet, kobo: number) => number, context: ClassMethodDecoratorContext) {
  return function (this: Wallet, kobo: number): number {
    console.log(`${String(context.name)}(${kobo})`);
    return method.call(this, kobo);
  };
}

export class Wallet {
  balanceKobo = 0;

  @logged
  topUp(kobo: number): number {
    return (this.balanceKobo += kobo);
  }
}
```

dist/wallet.js

```ts
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
function logged(method, context) {
    return function (kobo) {
        console.log(`${String(context.name)}(${kobo})`);
        return method.call(this, kobo);
    };
}
let Wallet = (() => {
    let _instanceExtraInitializers = [];
    let _topUp_decorators;
    return class Wallet {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _topUp_decorators = [logged];
            __esDecorate(this, null, _topUp_decorators, { kind: "method", name: "topUp", static: false, private: false, access: { has: obj => "topUp" in obj, get: obj => obj.topUp }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        balanceKobo = (__runInitializers(this, _instanceExtraInitializers), 0);
        topUp(kobo) {
            return (this.balanceKobo += kobo);
        }
    };
})();
export { Wallet };
```

Read it from the bottom up; it demystifies everything in this lesson:

- The class is defined inside a function, and its `static { … }` block runs once while the class is being defined. There, `__esDecorate` calls `logged` with the original `topUp` and a context object built right there: `kind`, `name`, `static`, `private`, an `access` object, and `metadata`.
- `metadata` is `Object.create(null)` only if `typeof Symbol === "function" && Symbol.metadata`. That is the line that made `context.metadata` `undefined` without the polyfill.
- `__esDecorate` loops over the decorators from last to first (closest first), and finally writes the returned wrapper onto the prototype with `Object.defineProperty`. The `done` flag makes `addInitializer` throw if a decorator saves it and calls it later.
- The first field's initializer is `(__runInitializers(this, _instanceExtraInitializers), 0)`: the instance initializers from `addInitializer` run at the start of construction, then the field gets its value `0`.

So a decorator costs one function call per decorated member when the class is defined, plus whatever the wrapper does on every call. The wrapper is where performance goes: keep it thin.

## The other decorators: experimentalDecorators

Years before the standard, TypeScript shipped its own decorators behind the `experimentalDecorators` option, based on an early draft of the proposal. Angular, NestJS, TypeORM, InversifyJS and class-validator were built on them, so you will meet them in existing code. They are a *different feature* that happens to use the same `@`:

|  | Standard (TS 5.0+, default) | Legacy (`experimentalDecorators: true`) |
| --- | --- | --- |
| Method decorator signature | `(method, context)` | `(target, propertyKey, descriptor)` |
| Parameter decorators | Not supported | `constructor(@Inject("clock") clock)` |
| Field decorators | Return an initializer | Receive the prototype, cannot see the value |
| Metadata | `context.metadata` / `Symbol.metadata` | `emitDecoratorMetadata` + the `reflect-metadata` library |
| Future | The JavaScript standard | TypeScript-only; supported for compatibility |

A decorator written for one mode does not work in the other. Here is a legacy method decorator and a parameter decorator in a project that uses the standard mode:

legacy-in-standard.ts

```ts
function logged(target: object, propertyKey: string, descriptor: PropertyDescriptor): void {
  const original = descriptor.value as (...args: unknown[]) => unknown;
  descriptor.value = function (this: unknown, ...args: unknown[]) {
    console.log(`-> ${propertyKey}`);
    return original.apply(this, args);
  };
}

class Account {
  @logged
  deposit(kobo: number): number {
    return kobo;
  }
}

function Inject(token: string) {
  return (target: object, key: string | undefined, index: number) => {};
}

class Checkout {
  constructor(@Inject("clock") readonly clock: object) {}
}
```

What `npx tsc --noEmit` prints

```ts
legacy-in-standard.ts:10:3 - error TS1241: Unable to resolve signature of method decorator when called as an expression.
  The runtime will invoke the decorator with 2 arguments, but the decorator expects 3.

10   @logged
     ~~~~~~~

  legacy-in-standard.ts:1:54 - An argument for 'descriptor' was not provided.
    1 function logged(target: object, propertyKey: string, descriptor: PropertyDescriptor): void {
                                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

legacy-in-standard.ts:21:15 - error TS1206: Decorators are not valid here.

21   constructor(@Inject("clock") readonly clock: object) {}
                 ~


Found 2 errors in the same file, starting at: legacy-in-standard.ts:10
```

### emitDecoratorMetadata: types that survive compilation

The legacy mode has one feature the standard does not: with `emitDecoratorMetadata`, `tsc` writes the *types* of a decorated class's constructor parameters into the output, as runtime values. That is what let frameworks inject constructor arguments with no tokens at all: read the parameter types, look each up in the container. `reflect-metadata` provides the `Reflect.metadata` function that the emitted code calls; the small shim below stands in for it:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

reflect-shim.tsNode.js only

```ts
const store = new WeakMap<object, Map<string, unknown>>();

Object.assign(Reflect, {
  metadata: (key: string, value: unknown) => (target: object) => {
    const entries = store.get(target) ?? new Map<string, unknown>();
    entries.set(key, value);
    store.set(target, entries);
  },
});

export function getMetadata(key: string, target: object): unknown {
  return store.get(target)?.get(key);
}
```

services.tsNode.js only

```ts
import { getMetadata } from "./reflect-shim.js";

export interface Clock {
  now(): Date;
}

export class Mailer {
  send(to: string): string {
    return `mail to ${to}`;
  }
}

function Injectable(): ClassDecorator {
  return () => {};
}

@Injectable()
export class OrderService {
  constructor(
    readonly mailer: Mailer,
    readonly clock: Clock,
    readonly limitKobo: number,
  ) {}
}

console.log(getMetadata("design:paramtypes", OrderService));
```

Output of `npx tsx services.ts`

```ts
undefined
```

`undefined`: this page runs examples with `tsx`, and esbuild, which `tsx` uses, does **not** implement `emitDecoratorMetadata`: it needs type information, which only a type-aware compiler has. Other fast transpilers differ, so check the documentation of whatever runs your tests. Here is what `tsc` writes:

dist/services.js

```ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { getMetadata } from "./reflect-shim.js";
export class Mailer {
    send(to) {
        return `mail to ${to}`;
    }
}
function Injectable() {
    return () => { };
}
let OrderService = class OrderService {
    mailer;
    clock;
    limitKobo;
    constructor(mailer, clock, limitKobo) {
        this.mailer = mailer;
        this.clock = clock;
        this.limitKobo = limitKobo;
    }
};
OrderService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Mailer, Object, Number])
], OrderService);
export { OrderService };
console.log(getMetadata("design:paramtypes", OrderService));
```

the same program compiled with tsc

```bash
$ npx tsc --noEmit false --outDir dist
$ node dist/services.js
[ [class Mailer], [Function: Object], [Function: Number] ]
```

Look at the `__metadata` line. The class `Mailer` survived as a value, but the interface `Clock` became `Object` and `number` became `Number`: interfaces and primitives have no runtime identity, so a framework cannot know which clock you wanted. That is why legacy DI frameworks still need `@Inject(TOKEN)` for interfaces, and why this whole mechanism depends on one compiler, one option and one library all being present. The standard decorators deliberately have no type metadata and no parameter decorators; frameworks moving to them pass explicit tokens instead, as your container in [the DI lesson](https://zudojs.oyinlola.site/learn/ts-typed-di) did.

> IF YOU MAINTAIN A LEGACY-DECORATOR PROJECT
>
> Keep `experimentalDecorators` exactly as the framework's documentation says, compile with `tsc` (or a tool that supports decorator metadata, such as SWC with the right options) for the test runner too, and never mix libraries written for the two modes.

## Why frameworks use decorators

Decorators let a framework read your intentions from the code itself: *this class is a controller at `/orders`, this method handles `POST`, this field must be an e-mail, this class is injectable*. The alternative is a separate registration file that repeats every name, and drifts. They also let the framework wrap your methods (transactions, caching, permission checks) without you calling it. The price is that behaviour is added somewhere you do not see, registration depends on imports, and the code only runs through a compiler.

With standard decorators you can keep most of the type safety of the earlier lessons. This `@injectable` registers a class under a token and checks the constructor against its dependency tokens, using the `TypesOf` type from [the DI lesson](https://zudojs.oyinlola.site/learn/ts-typed-di):

injectable.ts

```ts
export class Token<T> {
  declare readonly __type: T;
  constructor(readonly name: string) {}
}
type TypesOf<D extends readonly Token<unknown>[]> = { -readonly [I in keyof D]: D[I] extends Token<infer U> ? U : never };

interface Registration {
  readonly deps: readonly Token<unknown>[];
  readonly create: (...deps: never[]) => unknown;
}
const registrations = new Map<Token<unknown>, Registration>();

export function injectable<T, const D extends readonly Token<unknown>[]>(token: Token<T>, deps: D) {
  return function (value: new (...deps: TypesOf<D>) => T, context: ClassDecoratorContext): void {
    registrations.set(token, { deps, create: (...args: TypesOf<D>) => new value(...args) });
    context.addInitializer(() => console.log(`registered ${String(context.name)} as ${token.name}`));
  };
}

export function provide<T>(token: Token<T>, value: T): void {
  registrations.set(token, { deps: [], create: () => value });
}

export function resolve<T>(token: Token<T>): T {
  const registration = registrations.get(token);
  if (!registration) throw new Error(`nothing registered for ${token.name}`);
  const args = registration.deps.map((dep) => resolve(dep));
  return (registration.create as (...deps: unknown[]) => unknown)(...args) as T;
}
```

checkout.ts

```ts
import { Token, injectable, provide, resolve } from "./injectable.js";

interface Clock {
  now(): Date;
}
class Cart {
  readonly items = ["RICE-50KG", "OIL-5L"];
}

const CLOCK = new Token<Clock>("Clock");
const CART = new Token<Cart>("Cart");
const CHECKOUT = new Token<CheckoutService>("CheckoutService");

@injectable(CHECKOUT, [CART, CLOCK])
class CheckoutService {
  constructor(
    private readonly cart: Cart,
    private readonly clock: Clock,
  ) {}
  summary(): string {
    return `${this.cart.items.length} items on ${this.clock.now().toISOString().slice(0, 10)}`;
  }
}

provide(CLOCK, { now: () => new Date("2026-09-24T09:00:00Z") });
provide(CART, new Cart());
console.log(resolve(CHECKOUT).summary());
```

Output of `npx tsx checkout.ts` and of the browser terminal

```ts
registered CheckoutService as CheckoutService
2 items on 2026-09-24
```

checkout-wrong.ts

```ts
import { Token, injectable } from "./injectable.js";

interface Clock {
  now(): Date;
}
class Cart {
  readonly items: string[] = [];
}

const CLOCK = new Token<Clock>("Clock");
const CART = new Token<Cart>("Cart");
const CHECKOUT = new Token<CheckoutService>("CheckoutService");

@injectable(CHECKOUT, [CLOCK, CART])
class CheckoutService {
  constructor(
    private readonly cart: Cart,
    private readonly clock: Clock,
  ) {}
}
```

What `npx tsc --noEmit` prints

```ts
checkout-wrong.ts:14:2 - error TS1238: Unable to resolve signature of class decorator when called as an expression.
  Argument of type 'typeof CheckoutService' is not assignable to parameter of type 'new (deps_0: Clock, deps_1: Cart) => CheckoutService'.
    Types of parameters 'cart' and 'deps_0' are incompatible.
      Property 'items' is missing in type 'Clock' but required in type 'Cart'.

14 @injectable(CHECKOUT, [CLOCK, CART])
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  checkout-wrong.ts:7:12 - 'items' is declared here.
    7   readonly items: string[] = [];
                 ~~~~~


Found 1 error in checkout-wrong.ts:14
```

Swapped tokens are a compile error at the decorator, which is more than `emitDecoratorMetadata`-based injection ever checked. Everything from the DI lesson's "limits" section still applies: a token that is never provided fails only at runtime.

### Decorators in ZudoJS

Most ZudoJS packages avoid decorators and use explicit functions (`createToken`, `registerFactory`, `defineEvent`), which run anywhere and need no compiler option. `@zudojs/cqrs` is the exception: `CommandHandlerFor(type)` and `QueryHandlerFor(type)` mark a class as the handler for a request type. They are typed as the legacy `ClassDecorator`, but they only use the class they receive, so they work with standard decorators too. They only *mark* the class; discovering marked classes and registering them on a bus is your code's job:

zudo-handlers.ts

```ts
import { CommandHandlerFor, createCommand, createCommandBus, getCqrsType } from "@zudojs/cqrs";

@CommandHandlerFor("order.place")
class PlaceOrderHandler {
  execute(command: { type: string; customerId: string }): string {
    return `ORD for ${command.customerId}`;
  }
}

const bus = createCommandBus();
for (const handler of [PlaceOrderHandler]) {
  const type = getCqrsType(handler);
  if (type) bus.register(type, new handler());
}

console.log(getCqrsType(PlaceOrderHandler), bus.getCommandTypes());
console.log(await bus.execute<{ type: string; customerId: string }, string>(createCommand("order.place", { customerId: "cus_ada" })));
```

Output of `npx tsx zudo-handlers.ts` and of the browser terminal

```ts
order.place [ 'order.place' ]
ORD for cus_ada
```

The type string passed to `CommandHandlerFor` is a plain `string`, not checked against any command type, and the result type in `execute` is the claim you met in [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs#zudo). [CQRS in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-cqrs) covers the package itself.

## Common mistakes

| Mistake | What happens | Fix |
| --- | --- | --- |
| Running decorated code with `node file.ts` or in a browser | `SyntaxError` at the `@` | Compile with `tsc`, `tsx` or a bundler |
| Expecting a field decorator to see later assignments | Only the initial value is transformed | Use an `accessor` decorator |
| Writing to `context.metadata.x ??= …` in a subclass | The parent's metadata is changed | `Object.hasOwn` check, then copy |
| Using `context.metadata` without a `Symbol.metadata` polyfill | `undefined` under tsc, silently different under tsx | Polyfill with `Symbol.for("Symbol.metadata")`, loaded first |
| Registering by decorator, then not importing the module | The handler silently does not exist | Import handler modules explicitly, or check registrations at startup |
| Mixing legacy and standard decorator libraries | TS1241 or runtime nonsense | One mode per project, matching your framework |
| Relying on `emitDecoratorMetadata` under esbuild or `tsx` | No metadata; injection gets `undefined` | Use a compiler that emits it, or explicit tokens |
| Heavy work in a method wrapper | Every call pays for it | Keep wrappers thin; do setup in the decorator, once |

## Testing decorators

A decorator is a function, so test it as one: call it with a function and a context object, and check what the wrapper does. No class, no `@`, no special compiler needed, which means this test runs in the browser terminal too:

audited.ts

```ts
export const auditLog: string[] = [];

export function audited<This, Args extends unknown[], R>(
  method: (this: This, ...args: Args) => R,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
): (this: This, ...args: Args) => R {
  const name = String(context.name);
  return function (this: This, ...args: Args): R {
    auditLog.push(`${name}(${args.join(", ")})`);
    return method.apply(this, args);
  };
}
```

audited.test.ts

```ts
import { audited, auditLog } from "./audited.js";

type Charge = (this: unknown, customerId: string, kobo: number) => string;

const context = { kind: "method", name: "charge" } as ClassMethodDecoratorContext<unknown, Charge>;
const charge: Charge = (customerId, kobo) => `charged ${customerId} ₦${kobo / 100}`;
const wrapped = audited(charge, context);

console.log(wrapped.call(undefined, "cus_ada", 1_850_000));
console.log(auditLog.length === 1 && auditLog[0] === "charge(cus_ada, 1850000)" ? "PASS audit entry" : `FAIL ${auditLog}`);
```

Output of `npx tsx audited.test.ts` and of the browser terminal

```ts
charged cus_ada ₦18500
PASS audit entry
```

The cast builds a partial context with only what this decorator reads; a decorator that uses `addInitializer` or `metadata` needs those in the fake too. Then add one test that uses the real `@` syntax on a real class, compiled by the same tool as production, because that is where evaluation order, `this` binding and metadata actually happen.

## Decorators in production

- **Choose the mode deliberately.** New code: standard decorators (the default since TypeScript 5.0). Existing Angular, NestJS or TypeORM code: whatever that framework requires, usually `experimentalDecorators`.
- **Your build tool is part of the semantics.** The same file behaved differently under tsc and esbuild in this lesson (metadata). Use one compiler for tests and production, or test with both.
- **Decorators hide behaviour.** Reserve them for genuinely cross-cutting rules, keep each one small and named for what it does (`@audited`, `@retry(3)`), and prefer plain function calls for logic that belongs to one method.
- **Registration by decorator needs a startup check.** Compare the registered handlers or routes with the list you expect before serving traffic.
- **Watch for the standard landing in engines.** When Node.js and browsers ship native decorators and `Symbol.metadata`, the polyfill becomes a no-op and the emitted helpers can go away, with no change to your source.

## Practice

TRY IT YOURSELF

### @deprecated, warned once

Write a decorator factory `deprecated(replacement)` for methods. The first call to a deprecated method logs `"NAME is deprecated, use REPLACEMENT"`; later calls stay silent. Put it on a `getBalance` method whose replacement is `balanceKobo`.

**Show a solution**

deprecated.ts

```ts
function deprecated(replacement: string) {
  return function <This, Args extends unknown[], R>(
    method: (this: This, ...args: Args) => R,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
  ) {
    let warned = false;
    return function (this: This, ...args: Args): R {
      if (!warned) {
        warned = true;
        console.log(`${String(context.name)} is deprecated, use ${replacement}`);
      }
      return method.apply(this, args);
    };
  };
}

class Account {
  balanceKobo = 2_500_000;

  @deprecated("balanceKobo")
  getBalance(): string {
    return `₦${this.balanceKobo / 100}`;
  }
}

const a = new Account();
const b = new Account();
console.log(a.getBalance());
console.log(b.getBalance());
```

Output of `npx tsx deprecated.ts` and of the browser terminal

```ts
getBalance is deprecated, use balanceKobo
₦25000
₦25000
```

The `warned` flag lives in the decorator's closure, which is created once per decorated method, so it is shared by all instances: the second account does not warn again. For "once per instance", keep the flag in a `WeakSet` of instances instead.

TRY IT YOURSELF

### @memoize with a cache per instance

Shipping fees are expensive to compute. Write `@memoize` for one-argument methods: it caches results per instance and per argument. Use a `WeakMap` from instance to cache so that dropped instances can be garbage-collected. Show that the second call with the same destination does not recompute.

**Show a solution**

memoize.ts

```ts
function memoize<This extends object, A, R>(
  method: (this: This, arg: A) => R,
  _context: ClassMethodDecoratorContext<This, (this: This, arg: A) => R>,
) {
  const caches = new WeakMap<This, Map<A, R>>();
  return function (this: This, arg: A): R {
    let cache = caches.get(this);
    if (!cache) caches.set(this, (cache = new Map()));
    if (!cache.has(arg)) cache.set(arg, method.call(this, arg));
    return cache.get(arg)!;
  };
}

class ShippingCalculator {
  computed = 0;

  @memoize
  feeKobo(state: string): number {
    this.computed++;
    return state === "Lagos" ? 150_000 : 350_000;
  }
}

const shipping = new ShippingCalculator();
console.log(shipping.feeKobo("Lagos"), shipping.feeKobo("Kano"), shipping.feeKobo("Lagos"));
console.log("computed", shipping.computed, "times");
console.log(new ShippingCalculator().feeKobo("Lagos"));
```

Output of `npx tsx memoize.ts` and of the browser terminal

```ts
150000 350000 150000
computed 2 times
150000
```

Memoizing is only correct for methods whose result depends on nothing but the argument (and the instance's fixed state). A fee that depends on today's fuel price must not be cached forever; that is a caching policy ([Caching](https://zudojs.oyinlola.site/learn/backend-caching)), not a decorator.

TRY IT YOURSELF

### An accessor that limits length

Write `maxLength(n)` for `accessor` fields of type `string`: it trims the value and throws a `RangeError` if the result is longer than `n`, both for the initial value and for later assignments. Use it on a customer's display name.

**Show a solution**

max-length.ts

```ts
function maxLength(limit: number) {
  return function <This>(
    target: ClassAccessorDecoratorTarget<This, string>,
    context: ClassAccessorDecoratorContext<This, string>,
  ): ClassAccessorDecoratorResult<This, string> {
    const check = (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length > limit) throw new RangeError(`${String(context.name)} is longer than ${limit} characters`);
      return trimmed;
    };
    return {
      init: check,
      set(value) {
        target.set.call(this, check(value));
      },
    };
  };
}

class Customer {
  @maxLength(12) accessor displayName = "  Ada  ";
}

const customer = new Customer();
console.log(JSON.stringify(customer.displayName));
customer.displayName = " Chiamaka E. ";
console.log(customer.displayName);
try {
  customer.displayName = "Oluwatobiloba Adeyemi";
} catch (error) {
  console.log(String(error));
}
console.log(customer.displayName);
```

Output of `npx tsx max-length.ts` and of the browser terminal

```ts
"Ada"
Chiamaka E.
RangeError: displayName is longer than 12 characters
Chiamaka E.
```

The failed assignment left the old value in place, because `check` throws before `target.set` runs. Note that the factory's returned function is itself generic in `This`, so the decorator works in any class.

## Recap

- A decorator is a function called once when the class is defined, with the decorated value and a context object; what it returns replaces the original. You can apply one by hand.
- Kinds: class, method, getter, setter, field (returns an initializer) and `accessor` (wraps get, set and init). Type them with `ClassMethodDecoratorContext<This, Value>` and friends; decorators are type-checked like calls. Factories such as `@retry(3)` return the decorator.
- Expressions are evaluated top to bottom; decorators are applied closest first, static before instance, methods before fields, the class last. `addInitializer` runs per instance or once per class.
- `context.metadata` becomes `Class[Symbol.metadata]`. Polyfill `Symbol.metadata` with `Symbol.for("Symbol.metadata")`, add the `ESNext.Decorators` lib, and copy inherited metadata before writing.
- No engine runs decorators natively yet: tsc and esbuild rewrite them into helpers such as `__esDecorate`; `node file.ts` and the browser terminal cannot run them.
- `experimentalDecorators` is a different, older feature with parameter decorators and `emitDecoratorMetadata`. Its metadata turns interfaces into `Object`, and esbuild-based tools do not emit it.
- Frameworks use decorators to register and wrap your code declaratively; registration still happens at runtime, when the module is imported.

Next: [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations), where you describe JavaScript libraries, including decorator-based ones, to the type checker.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
