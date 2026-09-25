---
title: "Advanced functions — ZudoJS Academy"
description: "Type overloads, call and construct signatures, this parameters, callable objects and variadic tuples, then build a type-safe command router."
source: https://zudojs.oyinlola.site/learn/ts-advanced-functions
---

LEVEL 6 · LESSON 7 OF 22

Functions and design styles Advanced

# Advanced functions

Type overloads, call and construct signatures, this parameters, callable objects and variadic tuples, then build a type-safe command router.

- **55 min** to read and try
- **You need:** Typing functions, Conditional types and Advanced inference, plus this in JavaScript
- **You build:** A type-safe command router for a shop's admin chat, where every command's arguments are checked when called from code and parsed and validated when typed as text

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write overloads that resolve the way you intend, and know when a union or conditional type is better
- Describe functions with properties, and classes as values, with call and construct signatures
- Protect methods from losing this with this parameters
- Type wrappers and partial application with variadic tuple types
- Predict which callbacks are assignable, and explain parameter contravariance and method bivariance
- Build a command router whose arguments are typed from one table

## A refund of ₦NaN

A shop's operations team runs admin commands from a chat: refund an order, restock a product. In code, each command is a function in a table, and a router looks up the function by name and passes the arguments along. To make the table accept every kind of command, its type says "any arguments":

router.ts

```ts
type Handler = (...args: any[]) => string;

const naira = (kobo: number) => `₦${(kobo / 100).toFixed(2)}`;

const commands: Record<string, Handler> = {
  refund: (orderId: string, amountKobo: number) => `refunding ${naira(amountKobo)} on ${orderId}`,
  restock: (sku: string, quantity: number) => `${sku}: +${quantity} units`,
};

function run(name: string, ...args: unknown[]): string {
  const handler = commands[name];
  return handler ? handler(...args) : `unknown command ${name}`;
}

console.log(run("refund", "ORD-1042", 500_000));
console.log(run("refund", 500_000, "ORD-1042"));
console.log(run("restock", "TOTE-01"));
console.log(run("refnud", "ORD-1043", 100_000));
```

Output of `npx tsx router.ts` and of the browser terminal

```ts
refunding ₦5000.00 on ORD-1042
refunding ₦NaN on 500000
TOTE-01: +undefined units
unknown command refnud
```

Swapped arguments, a missing quantity, a misspelt command: the compiler accepted all of them, and the router answered each with a confident, wrong sentence. Every handler has precise parameter types, but `any[]` in the table threw them away.

Functions are values in JavaScript, so TypeScript has a whole vocabulary for their types: several signatures for one function, functions that also carry properties, classes passed around as values, the hidden `this` parameter, argument lists that are computed from other types, and rules for when one function can stand in for another. [Typing functions](https://zudojs.oyinlola.site/learn/ts-functions) covered the everyday part. This lesson covers the rest, and ends with a router in which each of the four calls above is a compile error or a clear usage message.

## Overloads in depth

[Typing functions](https://zudojs.oyinlola.site/learn/ts-functions#overloads) introduced **overloads**: several signatures listed before one implementation, so the return type can depend on the arguments. Here is a more realistic case, where the *second parameter* depends on the first. A payment is created from card details or from a bank account, never a mix:

charge.ts

```ts
interface Card {
  number: string;
  expiry: string;
}
interface BankAccount {
  bankCode: string;
  accountNumber: string;
}

function charge(method: "card", card: Card, amountKobo: number): string;
function charge(method: "transfer", account: BankAccount, amountKobo: number): string;
function charge(method: "card" | "transfer", source: Card | BankAccount, amountKobo: number): string {
  const from = "number" in source ? `card ending ${source.number.slice(-4)}` : `account ${source.accountNumber}`;
  return `${method}: ${amountKobo} kobo from ${from}`;
}

console.log(charge("card", { number: "4084084084084081", expiry: "09/28" }, 1_500_000));
console.log(charge("transfer", { bankCode: "058", accountNumber: "0123456789" }, 750_000));
```

Output of `npx tsx charge.ts` and of the browser terminal

```ts
card: 1500000 kobo from card ending 4081
transfer: 750000 kobo from account 0123456789
```

Callers see only the two overload signatures; the third one, with the body, is the **implementation signature**. That has consequences:

charge-errors.ts

```ts
interface Card {
  number: string;
  expiry: string;
}
interface BankAccount {
  bankCode: string;
  accountNumber: string;
}

function charge(method: "card", card: Card, amountKobo: number): string;
function charge(method: "transfer", account: BankAccount, amountKobo: number): string;
function charge(method: "card" | "transfer", source: Card | BankAccount, amountKobo: number): string {
  return `${method} ${amountKobo}`;
}

charge("card", { bankCode: "058", accountNumber: "0123456789" }, 1_500_000);

declare const method: "card" | "transfer";
declare const source: Card | BankAccount;
charge(method, source, 1_500_000);
```

What `npx tsc --noEmit` prints

```ts
charge-errors.ts:16:8 - error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"card"' is not assignable to parameter of type '"transfer"'.

16 charge("card", { bankCode: "058", accountNumber: "0123456789" }, 1_500_000);
          ~~~~~~

  charge-errors.ts:11:10 - The last overload is declared here.
    11 function charge(method: "transfer", account: BankAccount, amountKobo: number): string;
                ~~~~~~

  charge-errors.ts:12:10 - The call would have succeeded against this implementation, but implementation signatures of overloads are not externally visible.
    12 function charge(method: "card" | "transfer", source: Card | BankAccount, amountKobo: number): string {
                ~~~~~~

charge-errors.ts:20:8 - error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"card" | "transfer"' is not assignable to parameter of type '"transfer"'.
      Type '"card"' is not assignable to type '"transfer"'.

20 charge(method, source, 1_500_000);
          ~~~~~~

  charge-errors.ts:11:10 - The last overload is declared here.
    11 function charge(method: "transfer", account: BankAccount, amountKobo: number): string;
                ~~~~~~

  charge-errors.ts:12:10 - The call would have succeeded against this implementation, but implementation signatures of overloads are not externally visible.
    12 function charge(method: "card" | "transfer", source: Card | BankAccount, amountKobo: number): string {
                ~~~~~~


Found 2 errors in the same file, starting at: charge-errors.ts:16
```

- A card charge with bank details is refused: no overload accepts that combination. The implementation signature would, and the compiler even says so, but it is not visible to callers.
- A call with a *union* argument matches no single overload either. TypeScript tries each overload on its own; it never splits a union across them. When callers will naturally hold unions, overloads are the wrong tool: use a union parameter, a discriminated union argument (`charge({ method: "card", card, amountKobo })`), or the conditional return types from [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#generic-functions).

### Resolution order

TypeScript checks overloads from top to bottom and picks the **first** one that fits. A general signature above a specific one hides it:

order.ts

```ts
interface Customer {
  id: number;
  name: string;
}
const customers: Customer[] = [{ id: 7, name: "Ngozi Okafor" }];

function lookup(id: number | string): Customer | undefined;
function lookup(id: number): Customer;
function lookup(id: number | string): Customer | undefined {
  return customers.find((customer) => String(customer.id) === String(id));
}

const customer = lookup(7);
console.log(customer.name);
```

What `npx tsc --noEmit` prints

```ts
order.ts:14:13 - error TS18048: 'customer' is possibly 'undefined'.

14 console.log(customer.name);
               ~~~~~~~~


Found 1 error in order.ts:14
```

`lookup(7)` matched the first overload, so the result may be `undefined`, and the second overload can never be chosen. Put the most specific overloads first, as with the branches of a conditional type. (Promising that a number lookup always finds a customer is a questionable overload anyway; the implementation still returns `undefined` for an unknown id.)

> TIP
>
> Before writing overloads, try one signature. Overloads are right when the return type or later parameters depend on an earlier argument in a few fixed ways, and callers pass literals, as with `charge`. [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#functions-classes) shows one more cost: `ReturnType` and `Parameters` only see the last overload.

## Call signatures and callable objects

A function type written as `(kobo: number) => string` is a **function type expression**. The same type can be written as an object type with a **call signature**: `{ (kobo: number): string }`. The longer form exists because JavaScript functions are objects and can carry properties. A currency formatter that also knows its currency is a **callable object**:

formatter.ts

```ts
interface MoneyFormatter {
  (kobo: number): string;
  readonly currency: string;
  readonly symbol: string;
}

function makeFormatter(currency: string, symbol: string): MoneyFormatter {
  const format = (kobo: number) => `${symbol}${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  return Object.assign(format, { currency, symbol });
}

const naira = makeFormatter("NGN", "₦");
console.log(naira(125_050_000), naira.currency, typeof naira);

function vat(kobo: number): number {
  return Math.round(kobo * vat.rate);
}
vat.rate = 0.075;
console.log(vat(1_000_000), vat.rate);
```

Output of `npx tsx formatter.ts` and of the browser terminal

```ts
₦1,250,500.00 NGN function
75000 0.075
```

- `Object.assign(format, { … })` returns the same function with the properties added, typed as the intersection of both, which fits `MoneyFormatter`.
- For a function *declaration*, TypeScript also understands properties assigned right after it (`vat.rate = 0.075`) and adds them to the function's type. That is how older JavaScript libraries (jQuery's `$` and `$.ajax`) are typed.

An object type may list several call signatures. That is how overloads are written as a type, for example for a function you receive as a parameter:

find-type.ts

```ts
interface Order {
  id: string;
  totalKobo: number;
}

interface FindOrders {
  (id: string): Order | undefined;
  (ids: readonly string[]): Order[];
}

const orders: Order[] = [{ id: "ORD-1", totalKobo: 500_000 }, { id: "ORD-2", totalKobo: 900_000 }];

function find(id: string): Order | undefined;
function find(ids: readonly string[]): Order[];
function find(idOrIds: string | readonly string[]): Order | Order[] | undefined {
  return typeof idOrIds === "string" ? orders.find((o) => o.id === idOrIds) : orders.filter((o) => idOrIds.includes(o.id));
}

function report(lookup: FindOrders): string {
  const one = lookup("ORD-2");
  const many = lookup(["ORD-1", "ORD-2", "ORD-9"]);
  return `${one?.totalKobo} kobo; ${many.length} of 3 found`;
}

console.log(report(find));
```

Output of `npx tsx find-type.ts` and of the browser terminal

```ts
900000 kobo; 2 of 3 found
```

## Construct signatures: classes as values

A class is two things: a type for its instances, and a value, the constructor, that you call with `new`. When you pass a class around as a value, for example to a registry that creates payment gateways by name, you need the type of the constructor. That is a **construct signature**: `new (…) => Instance`, or in an object type, `{ new (…): Instance }`, which may also list the class's static members:

gateways.ts

```ts
interface PaymentGateway {
  charge(amountKobo: number): string;
}

interface GatewayClass {
  new (secretKey: string): PaymentGateway;
  readonly provider: string;
}

class PaystackGateway implements PaymentGateway {
  static readonly provider = "paystack";
  constructor(private readonly secretKey: string) {}
  charge(amountKobo: number): string {
    return `paystack charged ${amountKobo} kobo with key ${this.secretKey.slice(0, 7)}...`;
  }
}

class FlutterwaveGateway implements PaymentGateway {
  static readonly provider = "flutterwave";
  constructor(private readonly secretKey: string) {}
  charge(amountKobo: number): string {
    return `flutterwave charged ${amountKobo} kobo with key ${this.secretKey.slice(0, 8)}...`;
  }
}

const registry: readonly GatewayClass[] = [PaystackGateway, FlutterwaveGateway];

function createGateway(provider: string, secretKey: string): PaymentGateway {
  const Gateway = registry.find((candidate) => candidate.provider === provider);
  if (!Gateway) throw new Error(`no gateway called ${provider}`);
  return new Gateway(secretKey);
}

console.log(createGateway("paystack", "sk_test_abc123").charge(1_500_000));
console.log(createGateway("flutterwave", "FLWSECK_TEST-xyz").charge(750_000));
```

Output of `npx tsx gateways.ts` and of the browser terminal

```ts
paystack charged 1500000 kobo with key sk_test...
flutterwave charged 750000 kobo with key FLWSECK_...
```

Both classes fit `GatewayClass` by shape: a constructor taking a string, instances with `charge`, and a static `provider`. `new Gateway(secretKey)` is typed `PaymentGateway`. The `typeof` and `InstanceType` tools from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#typeof) convert between the two sides of a class.

### Abstract classes

An abstract class cannot be instantiated, so it does not fit a normal construct signature. When a function only needs to *inspect* classes (for example to check `instanceof`), accept `abstract new (…) => T`, which both abstract and concrete classes fit:

abstract.ts

```ts
abstract class Gateway {
  abstract charge(amountKobo: number): string;
}

type Creatable = new () => Gateway;
type AnyGatewayClass = abstract new () => Gateway;

const inspectable: AnyGatewayClass = Gateway;
const creatable: Creatable = Gateway;
```

What `npx tsc --noEmit` prints

```ts
abstract.ts:9:7 - error TS2322: Type 'typeof Gateway' is not assignable to type 'Creatable'.
  Cannot assign an abstract constructor type to a non-abstract constructor type.

9 const creatable: Creatable = Gateway;
        ~~~~~~~~~


Found 1 error in abstract.ts:9
```

## this parameters

In JavaScript, `this` is decided by how a function is called, and a method taken off its object loses it, as [this in JavaScript](https://zudojs.oyinlola.site/learn/js-this#losing) showed. TypeScript lets you declare what `this` must be, with a **this parameter**: a fake first parameter named `this`. It is checked at every call and erased from the output:

cart.ts

```ts
interface Cart {
  items: string[];
  add(this: Cart, sku: string): number;
}

const cart: Cart = {
  items: [],
  add(sku) {
    return this.items.push(sku);
  },
};

cart.add("TOTE-01");
const add = cart.add;
add("MUG-07");
setTimeout(cart.add, 0, "MUG-07");
```

What `npx tsc --noEmit` prints

```ts
cart.ts:15:1 - error TS2684: The 'this' context of type 'void' is not assignable to method's 'this' of type 'Cart'.

15 add("MUG-07");
   ~~~~~~~~~~~~~


Found 1 error in cart.ts:15
```

The direct call is fine. The detached call has no object before the dot, so `this` is `void`, and TypeScript refuses it before it can crash. The `setTimeout` line is *not* reported, because `setTimeout`'s callback type does not mention `this`; the check only works where both sides declare it. Bind the method (`cart.add.bind(cart)`) or wrap it in an arrow function when you pass it on.

The parameter really disappears in the JavaScript that runs:

total.ts

```ts
export function orderTotal(this: { lines: number[] }, vatPercent: number): number {
  const net = this.lines.reduce((sum, kobo) => sum + kobo, 0);
  return Math.round(net * (1 + vatPercent / 100));
}

console.log(orderTotal.call({ lines: [500_000, 250_000] }, 7.5));
```

Output of `npx tsx total.ts` and of the browser terminal

```ts
806250
```

dist/total.js

```ts
export function orderTotal(vatPercent) {
    const net = this.lines.reduce((sum, kobo) => sum + kobo, 0);
    return Math.round(net * (1 + vatPercent / 100));
}
console.log(orderTotal.call({ lines: [500_000, 250_000] }, 7.5));
```

The compiled function has one parameter, `vatPercent`. The `this` declaration was only there for the checker, which used it to reject calls such as `orderTotal(7.5)`.

### this: void, and the helper types

The opposite promise is also useful. A callback declared with `this: void` tells implementers "do not use `this` here", and a function that does use it is refused at the point where it is passed in. `ThisParameterType<F>` reads a function's this type, and `OmitThisParameter<F>` removes it, which is exactly the type of the result of `bind`:

this-helpers.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

function describe(this: { name: string; stock: number }, prefix: string): string {
  return `${prefix} ${this.name}: ${this.stock} left`;
}

type H1 = Expect<Equal<ThisParameterType<typeof describe>, { name: string; stock: number }>>;
type H2 = Expect<Equal<OmitThisParameter<typeof describe>, (prefix: string) => string>>;

const tote = describe.bind({ name: "Ankara tote", stock: 3 });
type H3 = Expect<Equal<typeof tote, (prefix: string) => string>>;

function onStockChange(listener: (this: void, sku: string) => void): void {
  listener("TOTE-01");
}
onStockChange((sku) => console.log("stock changed:", sku));
console.log(tote("Low stock:"));
```

Output of `npx tsx this-helpers.ts` and of the browser terminal

```ts
stock changed: TOTE-01
Low stock: Ankara tote: 3 left
```

Classes get `this` typing automatically: inside a method, `this` is the instance. The detached-method problem still exists for classes at runtime, and the usual fix there is an arrow-function property, which [this in JavaScript](https://zudojs.oyinlola.site/learn/js-this#classes) compares with `bind`.

## Variadic tuple types

A wrapper function takes a function and returns a new one: with logging, with retries, with some arguments filled in. To type it, you need the wrapped function's parameter list as a type. A generic rest parameter, `...args: A` with `A extends unknown[]`, captures the whole list as a tuple, and a tuple type may **spread** other tuple types: `[...A, ...B]`. These are called **variadic tuple types**:

variadic.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

function refund(orderId: string, amountKobo: number, reason: string): string {
  return `refund ${amountKobo} kobo on ${orderId}: ${reason}`;
}

function bindFirst<F, A extends unknown[], R>(fn: (first: F, ...rest: A) => R, first: F): (...rest: A) => R {
  return (...rest) => fn(first, ...rest);
}

function withActor<A extends unknown[], R>(fn: (...args: A) => R): (actor: string, ...args: A) => R {
  return (actor, ...args) => {
    console.log(`audit: ${actor} called ${fn.name}`);
    return fn(...args);
  };
}

function concat<A extends readonly unknown[], B extends readonly unknown[]>(a: A, b: B): [...A, ...B] {
  return [...a, ...b];
}

const refundOrder1042 = bindFirst(refund, "ORD-1042");
const audited = withActor(refund);

type V1 = Expect<Equal<Parameters<typeof refundOrder1042>, [amountKobo: number, reason: string]>>;
type V2 = Expect<Equal<Parameters<typeof audited>, [actor: string, orderId: string, amountKobo: number, reason: string]>>;
const row = concat(["ORD-1042", 500_000] as const, [true] as const);
type V3 = Expect<Equal<typeof row, ["ORD-1042", 500000, true]>>;

console.log(refundOrder1042(500_000, "damaged"));
console.log(audited("ada@shop.ng", "ORD-1043", 100_000, "late delivery"));
console.log(row);
```

Output of `npx tsx variadic.ts` and of the browser terminal

```ts
refund 500000 kobo on ORD-1042: damaged
audit: ada@shop.ng called refund
refund 100000 kobo on ORD-1043: late delivery
[ 'ORD-1042', 500000, true ]
```

- `bindFirst` matches the function against `(first: F, ...rest: A) => R`, the same pattern matching `infer` does, so `A` becomes the remaining parameters. The labels (`amountKobo`, `reason`) travel with the tuple, so editors still show the real parameter names (`V1`).
- `withActor` adds a parameter in front of any list (`V2`), and `concat` joins two tuples, keeping every position (`V3`).

A parameter list can also be *computed*. [Advanced inference](https://zudojs.oyinlola.site/learn/ts-inference-deep#build) typed `link(name, ...args: LinkArgs<N>)` with a conditional type that produced either `[]` or `[params]`, so the second argument exists only for routes with parameters. The router below does the same for commands.

## Callback compatibility

When is one function type assignable to another? This decides which callbacks you may pass, which handlers fit a registry, and why the conditional types lesson used `never[]` for "any function". Start with two rules that make everyday JavaScript work:

fewer.ts

```ts
const skus = ["TOTE-01", "MUG-07", "MAT-03"];

const labels: string[] = [];
skus.forEach((sku) => labels.push(sku.toLowerCase()));

const numbered = skus.map((sku, index) => `${index + 1}. ${sku}`);
const plain = skus.map((sku) => sku.slice(0, 3));

console.log(labels, numbered, plain);
```

Output of `npx tsx fewer.ts` and of the browser terminal

```json
[ 'tote-01', 'mug-07', 'mat-03' ] [ '1. TOTE-01', '2. MUG-07', '3. MAT-03' ] [ 'TOT', 'MUG', 'MAT' ]
```

- **Fewer parameters are fine.** `map` calls its callback with three arguments (element, index, array). A callback that uses one ignores the rest, which is always safe.
- **A `void` result accepts anything.** `forEach` expects a callback returning `void`, and `labels.push(…)` returns a number. A `void` return type means "the caller will not use the result", so any result is allowed.

### Results can be narrower, parameters must be wider

A function that returns a `CardPayment` can stand in where a function returning `Payment` is expected: callers expecting a payment get a more specific one. Results are **covariant**: they may vary in the same direction as the types. Parameters go the other way. A handler that only understands card events cannot stand in for a handler of *all* payment events, because it would be handed bank transfers too. Parameters are **contravariant**: the replacement must accept at least as much. Under `strict` (the `strictFunctionTypes` flag), TypeScript enforces this, but only for function-typed *properties*, not for *methods*:

variance.ts

```ts
interface PaymentEvent {
  reference: string;
  amountKobo: number;
}
interface CardEvent extends PaymentEvent {
  last4: string;
}

interface PropertyStyle {
  handle: (event: PaymentEvent) => void;
}
interface MethodStyle {
  handle(event: PaymentEvent): void;
}

const cardOnly = (event: CardEvent) => console.log(`card ****${event.last4}`);

const safe: PropertyStyle = { handle: cardOnly };
const unsafe: MethodStyle = { handle: cardOnly };
```

What `npx tsc --noEmit` prints

```ts
variance.ts:18:31 - error TS2322: Type '(event: CardEvent) => void' is not assignable to type '(event: PaymentEvent) => void'.
  Types of parameters 'event' and 'event' are incompatible.
    Property 'last4' is missing in type 'PaymentEvent' but required in type 'CardEvent'.

18 const safe: PropertyStyle = { handle: cardOnly };
                                 ~~~~~~

  variance.ts:6:3 - 'last4' is declared here.
    6   last4: string;
        ~~~~~

  variance.ts:10:3 - The expected type comes from property 'handle' which is declared here on type 'PropertyStyle'
    10   handle: (event: PaymentEvent) => void;
         ~~~~~~


Found 1 error in variance.ts:18
```

Only the property-style interface refused the card-only handler. Method signatures are checked **bivariantly**: the parameter may be wider *or narrower*. That compiles, and it is unsound:

bivariance.ts

```ts
interface PaymentEvent {
  reference: string;
  amountKobo: number;
}
interface CardEvent extends PaymentEvent {
  last4: string;
}
interface MethodStyle {
  handle(event: PaymentEvent): void;
}

const handler: MethodStyle = {
  handle: (event: CardEvent) => console.log(`card ****${event.last4.slice(-4)}`),
};

try {
  handler.handle({ reference: "TRF_20", amountKobo: 750_000 });
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx bivariance.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'slice')
```

TypeScript keeps method bivariance on purpose: without it, many built-in types would be incompatible in ways that are technically correct and practically useless (a `Dog[]` could not be passed where an `Animal[]` is expected, because of `push(animal: Animal)`). The practical rule: **write callbacks in your own interfaces as properties** (`handle: (event: PaymentEvent) => void`), and you get the strict check. [The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system) returns to variance, including the `in` and `out` annotations.

### The type of "any function"

Contravariance also explains how to write "a function with any parameters". `(...args: unknown[]) => unknown` looks right, but a function that needs a `string` is not assignable to it, because `unknown` arguments might be passed. The parameter type that every function accepts is `never`: nobody can produce a value of it, so no function can be handed something it does not expect. `(...args: never) => unknown` is the safe top type for functions, and it is what the router below uses.

## Build: a type-safe command router

REASON IT OUT

### Before you design the router

Commands arrive two ways: from code (`router.run("refund", "ORD-1042", 500_000)`) and from the admin chat as text (`/refund ORD-1042 500000`). Before reading the code, think:

- Where should a command's argument types be written, so they are written once?
- From code, the compiler can check arguments. From the chat, everything is a string. What must happen between the text and the handler?
- The router keeps all commands in one table, but each has different parameters. What type can that table have without losing each command's parameters, and without `any`?
- A chat user types `/refund 500000 ORD-1042`. What should they see?

**Show the reasoning**

Each command is one object: a usage string, a `parse` function that turns tokens into a typed argument tuple or an error message, and a `run` function whose parameters are that tuple. The tuple type is written once, as `parse`'s return type, and `run`'s parameters are inferred from it. Text must go through `parse`, which validates at runtime; code calls go straight to `run` and are checked at compile time. The router's table is generic over the whole object of commands, so each entry keeps its own type; its constraint only needs "some command", whose `run` takes `never` parameters, the top type for functions. Swapped arguments from the chat get the usage line and the reason, never a refund.

router.ts

```ts
export interface Command<A extends unknown[]> {
  readonly usage: string;
  readonly parse: (tokens: readonly string[]) => A | string;
  readonly run: (...args: A) => string;
}

export function command<A extends unknown[]>(definition: Command<A>): Command<A> {
  return definition;
}

interface AnyCommand {
  readonly usage: string;
  readonly parse: (tokens: readonly string[]) => unknown[] | string;
  readonly run: (...args: never) => string;
}

function invoke(cmd: AnyCommand, args: readonly unknown[]): string {
  return (cmd.run as (...args: readonly unknown[]) => string)(...args);
}

export function createRouter<C extends Record<string, AnyCommand>>(commands: C) {
  type Name = keyof C & string;

  function help(): string[];
  function help(name: Name): string;
  function help(name?: Name): string | string[] {
    if (name === undefined) return Object.keys(commands).map((key) => `/${key} ${commands[key].usage}`);
    return `/${name} ${commands[name].usage}`;
  }

  return {
    help,
    run<N extends Name>(name: N, ...args: Parameters<C[N]["run"]>): string {
      return invoke(commands[name], args);
    },
    exec(line: string): string {
      const [head = "", ...tokens] = line.trim().split(/\s+/);
      const name = head.slice(1);
      if (!head.startsWith("/") || !Object.hasOwn(commands, name)) return `unknown command ${head}`;
      const parsed = commands[name].parse(tokens);
      if (typeof parsed === "string") return `usage: /${name} ${commands[name].usage} (${parsed})`;
      return invoke(commands[name], parsed);
    },
  };
}
```

Every idea from this lesson appears here:

- `command` is a generic identity function whose only job is inference: `A` is inferred from `parse`'s return type, and `run`'s parameters are then checked against it. `parse` comes first in each definition, producer before consumer, as [Advanced inference](https://zudojs.oyinlola.site/learn/ts-inference-deep#contextual) recommended.
- `AnyCommand` uses `(...args: never) => string`, so a command with any parameter list fits the router's constraint. With `unknown[]`, no real command would fit.
- `run` takes a variadic `...args: Parameters<C[N]["run"]>`: after the name, exactly that command's parameters, labels included.
- `help` has two overloads: all usage lines, or one.
- `invoke` holds the one cast. At that point the compiler only knows "some command" and "some arguments"; `run` guarantees the arguments at compile time and `exec` guarantees them by parsing. `Object.hasOwn` keeps chat users from calling inherited names such as `/toString`.

Now the shop's commands:

commands.ts

```ts
import { command, createRouter } from "./router.js";

function kobo(text: string | undefined): number | string {
  if (text === undefined || !/^\d+$/.test(text)) return `"${text ?? ""}" is not an amount in kobo`;
  return Number(text);
}

export const router = createRouter({
  refund: command({
    usage: "<orderId> <amountKobo>",
    parse: (tokens): [orderId: string, amountKobo: number] | string => {
      const [orderId, raw] = tokens;
      if (!orderId?.startsWith("ORD-")) return "order id must start with ORD-";
      const amount = kobo(raw);
      return typeof amount === "string" ? amount : [orderId, amount];
    },
    run: (orderId, amountKobo) => `refunding ₦${(amountKobo / 100).toFixed(2)} on ${orderId}`,
  }),
  restock: command({
    usage: "<sku> <quantity>",
    parse: (tokens): [sku: string, quantity: number] | string => {
      const [sku, raw] = tokens;
      const quantity = Number(raw);
      if (!sku || !Number.isInteger(quantity) || quantity <= 0) return "need a sku and a positive whole quantity";
      return [sku, quantity];
    },
    run: (sku, quantity) => `${sku}: +${quantity} units`,
  }),
});
```

The two argument tuples are the only types written by hand, and they are labelled, so `run`'s parameters get names as well as types. The same four calls from the start of the lesson, from code and from the chat:

app.ts

```ts
import { router } from "./commands.js";

console.log(router.run("refund", "ORD-1042", 500_000));
console.log(router.exec("/refund ORD-1042 500000"));
console.log(router.exec("/refund 500000 ORD-1042"));
console.log(router.exec("/restock TOTE-01"));
console.log(router.exec("/refnud ORD-1043 100000"));
console.log(router.exec("/toString"));
console.log(router.help());
console.log(router.help("restock"));
```

Output of `npx tsx app.ts` and of the browser terminal

```ts
refunding ₦5000.00 on ORD-1042
refunding ₦5000.00 on ORD-1042
usage: /refund <orderId> <amountKobo> (order id must start with ORD-)
usage: /restock <sku> <quantity> (need a sku and a positive whole quantity)
unknown command /refnud
unknown command /toString
[ '/refund <orderId> <amountKobo>', '/restock <sku> <quantity>' ]
/restock <sku> <quantity>
```

app-mistakes.ts

```ts
import { router } from "./commands.js";

router.run("refund", 500_000, "ORD-1042");
router.run("restock", "TOTE-01");
router.run("refnud", "ORD-1043", 100_000);
router.help("delete");
```

What `npx tsc --noEmit` prints

```ts
app-mistakes.ts:3:22 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

3 router.run("refund", 500_000, "ORD-1042");
                       ~~~~~~~

app-mistakes.ts:4:8 - error TS2554: Expected 3 arguments, but got 2.

4 router.run("restock", "TOTE-01");
         ~~~

app-mistakes.ts:5:12 - error TS2345: Argument of type '"refnud"' is not assignable to parameter of type 'Name'.

5 router.run("refnud", "ORD-1043", 100_000);
             ~~~~~~~~

app-mistakes.ts:6:13 - error TS2345: Argument of type '"delete"' is not assignable to parameter of type 'Name'.

6 router.help("delete");
              ~~~~~~~~

  router.ts:26:12 - The call would have succeeded against this implementation, but implementation signatures of overloads are not externally visible.
    26   function help(name?: Name): string | string[] {
                  ~~~~


Found 4 errors in the same file, starting at: app-mistakes.ts:3
```

From code, all four mistakes are compile errors; from the chat, each gets a usage line with the reason. Adding a command is one `command({ … })` entry, and both paths pick it up.

## Testing function types

A router like this has three things worth testing: the types callers see, the rejections, and the runtime paths, especially the parsing, which is the only protection for text input.

router.test.ts

```ts
import { router } from "./commands.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type RunArgs = Parameters<typeof router.run<"refund">>;
type T1 = Expect<Equal<RunArgs, [name: "refund", orderId: string, amountKobo: number]>>;
type T2 = Expect<Equal<ReturnType<typeof router.help>, string>>;

// @ts-expect-error: arguments in the wrong order
router.run("restock", 12, "TOTE-01");

const cases: [string, string][] = [
  ["/refund ORD-7 100", "refunding ₦1.00 on ORD-7"],
  ["/refund ORD-7 1.5", 'usage: /refund <orderId> <amountKobo> ("1.5" is not an amount in kobo)'],
  ["/refund ORD-7", 'usage: /refund <orderId> <amountKobo> ("" is not an amount in kobo)'],
  ["/restock MUG-07 -3", "usage: /restock <sku> <quantity> (need a sku and a positive whole quantity)"],
  ["   /restock   MUG-07   4  ", "MUG-07: +4 units"],
  ["refund ORD-7 100", "unknown command refund"],
];
for (const [line, want] of cases) {
  const got = router.exec(line);
  console.log(got === want ? "PASS" : "FAIL", JSON.stringify(line), got === want ? "" : `-> ${got}`);
}
```

Output of `npx tsx router.test.ts` and of the browser terminal

```ts
PASS "/refund ORD-7 100"
PASS "/refund ORD-7 1.5"
PASS "/refund ORD-7"
PASS "/restock MUG-07 -3"
PASS "   /restock   MUG-07   4  "
PASS "refund ORD-7 100"
```

`T2` documents a trap from the overloads section: `ReturnType` sees only the *last* overload of `help`, `help(name)`, which returns `string`; the `string[]` of `help()` is invisible to it. If you need that form's type, name it directly. The `@ts-expect-error` line would fail the build if a refactor loosened `run`'s parameters back to `unknown[]`. The runtime table tries the inputs a hurried operator actually types: decimals, missing values, negative quantities, extra spaces, a forgotten slash.

## Advanced function types in production

- **Prefer one signature.** Overloads, callable objects and computed parameter lists are for library-style code that many callers use. In application code, a single signature with a discriminated-union argument is easier to read and to change.
- **Write callback members as properties**, not methods, so `strictFunctionTypes` checks them.
- **Use `(...args: never) => unknown` for "any function"**, never `Function` (which accepts calls with any arguments and returns `any`) and never `(...args: any[]) => any`, which turns off checking on both sides.
- **Declare `this` where it matters.** Methods meant to be passed around should be arrow-function properties or bound; functions that rely on `this` should say so with a `this` parameter.
- **Keep the runtime check at the text boundary.** The compiler checked `router.run`; only `parse` protects `router.exec`. Commands that move money should also log who ran them, as `withActor` did.

## Practice

TRY IT YOURSELF

### once

Write `once(fn)`: it returns a function with exactly the same parameters and result as `fn`, which runs `fn` the first time and returns the first result on every later call. Use it for a "send receipt" function that must never send twice.

**Show a solution**

once.ts

```ts
function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let done = false;
  let result: R;
  return (...args) => {
    if (!done) {
      result = fn(...args);
      done = true;
    }
    return result;
  };
}

let sent = 0;
const sendReceipt = once((orderId: string, email: string) => {
  sent++;
  return `receipt for ${orderId} sent to ${email}`;
});

console.log(sendReceipt("ORD-1042", "ada@shop.ng"));
console.log(sendReceipt("ORD-1042", "ada@shop.ng"));
console.log("emails sent:", sent);
```

Output of `npx tsx once.ts` and of the browser terminal

```ts
receipt for ORD-1042 sent to ada@shop.ng
receipt for ORD-1042 sent to ada@shop.ng
emails sent: 1
```

`A` captures the parameter list, labels included, so `sendReceipt` is `(orderId: string, email: string) => string`. The flag is separate from `result` because a function may legitimately return `undefined`.

TRY IT YOURSELF

### A cancel command without arguments

Add a `/cancel` command to the router that takes no arguments and returns `"pending operation cancelled"`. What is its argument tuple? What does `router.run("cancel")` accept, and what happens with `/cancel now`?

**Show a solution**

cancel.ts

```ts
import { command, createRouter } from "./router.js";

const router = createRouter({
  cancel: command({
    usage: "(no arguments)",
    parse: (tokens): [] | string => (tokens.length === 0 ? [] : `unexpected "${tokens.join(" ")}"`),
    run: () => "pending operation cancelled",
  }),
});

console.log(router.run("cancel"));
console.log(router.exec("/cancel"));
console.log(router.exec("/cancel now"));
```

Output of `npx tsx cancel.ts` and of the browser terminal

```ts
pending operation cancelled
pending operation cancelled
usage: /cancel (no arguments) (unexpected "now")
```

The tuple is the empty tuple `[]`, so `router.run("cancel")` takes no further arguments, and `router.run("cancel", "now")` is a compile error. From the chat, extra words produce the usage message instead of being silently ignored.

TRY IT YOURSELF

### Make the handler interface strict

A notification module declares `interface Notifier { notify(event: OrderEvent): void }`, and someone registered an SMS notifier that only accepts `ShippedEvent`. Change the interface so the compiler refuses that registration, and show the error.

**Show a solution**

notifier.ts

```ts
interface OrderEvent {
  orderId: string;
}
interface ShippedEvent extends OrderEvent {
  courier: string;
}

interface Notifier {
  notify: (event: OrderEvent) => void;
}

const sms: Notifier = {
  notify: (event: ShippedEvent) => console.log(`${event.orderId} is with ${event.courier}`),
};
```

What `npx tsc --noEmit` prints

```ts
notifier.ts:13:3 - error TS2322: Type '(event: ShippedEvent) => void' is not assignable to type '(event: OrderEvent) => void'.
  Types of parameters 'event' and 'event' are incompatible.
    Property 'courier' is missing in type 'OrderEvent' but required in type 'ShippedEvent'.

13   notify: (event: ShippedEvent) => console.log(`${event.orderId} is with ${event.courier}`),
     ~~~~~~

  notifier.ts:5:3 - 'courier' is declared here.
    5   courier: string;
        ~~~~~~~

  notifier.ts:9:3 - The expected type comes from property 'notify' which is declared here on type 'Notifier'
    9   notify: (event: OrderEvent) => void;
        ~~~~~~


Found 1 error in notifier.ts:13
```

Writing `notify` as a property instead of a method turns on the contravariant check. The honest fixes are then to accept every `OrderEvent` and narrow inside, or to register the SMS notifier only for shipped events, as the typed event bus in [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals#build) does.

## Recap

- Overloads are tried top to bottom; the first match wins, the implementation signature is invisible, and a union argument matches none. Put specific overloads first, and prefer one signature when callers hold unions.
- Call signatures describe functions with properties (`Object.assign` or property assignments on a declaration); several call signatures are overloads as a type.
- Construct signatures type classes as values, including static members; `abstract new` also accepts abstract classes.
- A `this` parameter is checked at calls and erased from the output. `this: void` forbids `this` in callbacks; `ThisParameterType` and `OmitThisParameter` read and remove it.
- Generic rest parameters capture parameter lists as tuples, with labels; tuples spread into tuples, so wrappers can add, remove or compute parameters.
- Callbacks may take fewer parameters and may return anything to a `void` callback. Results are covariant, parameters contravariant for function properties, and bivariant for methods. `(...args: never) => unknown` is "any function".
- The command router writes each command's argument tuple once, checks code calls at compile time and chat text at runtime.

Next: [Object-oriented TypeScript](https://zudojs.oyinlola.site/learn/ts-oop), where these function and class types meet encapsulation, interfaces and dependency inversion, and you compare object-oriented and functional designs for the same payment system.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
