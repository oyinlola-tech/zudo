---
title: "Functional TypeScript — ZudoJS Academy"
description: "Make signatures tell the truth with readonly data, typed composition, Option, Result and algebraic data types, then build a typed pricing and checkout core."
source: https://zudojs.oyinlola.site/learn/ts-functional
---

LEVEL 6 · LESSON 9 OF 22

Functions and design styles Advanced

# Functional TypeScript

Make signatures tell the truth with readonly data, typed composition, Option, Result and algebraic data types, then build a typed pricing and checkout core.

- **55 min** to read and try
- **You need:** Functional JavaScript, Union types in depth, Designing generic APIs and Mapped types
- **You build:** A typed pricing and checkout core: readonly data, a parse step that returns a Result, promotions as an algebraic data type, and a pipeline whose stage types enforce the order of the steps

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a TypeScript signature can and cannot promise about purity, and move hidden inputs into parameters
- Use readonly, ReadonlyArray, ReadonlyMap and as const, and recognise the shallow, aliasing and runtime limits of readonly
- Type a pipe function with overloads and read the error when two steps do not fit
- Choose between T or undefined, an Option type and a Result type for a missing or failed value
- Model data as algebraic data types, count their states, and handle them with exhaustive matching
- Build a pricing pipeline whose stage types make the order of the steps checkable

## An invoice that changed after it was printed

A shop's TypeScript pricing module has three small functions. Every one of them has a correct, strict type, and `tsc` reports no errors:

problem.ts

```ts
interface CartLine {
  sku: string;
  qty: number;
  priceKobo: number;
}

interface Cart {
  id: string;
  lines: CartLine[];
}

function cheapestFirst(lines: CartLine[]): CartLine[] {
  return lines.sort((a, b) => a.priceKobo - b.priceKobo);
}

function staffPrices(cart: Cart): Cart {
  for (const line of cart.lines) line.priceKobo = Math.round(line.priceKobo * 0.8);
  return cart;
}

function subtotalKobo(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + line.qty * line.priceKobo, 0);
}

const cart: Cart = {
  id: "CART-7",
  lines: [
    { sku: "TV-32", qty: 1, priceKobo: 4000000 },
    { sku: "RICE-5", qty: 2, priceKobo: 850000 },
  ],
};

const invoiceTotal = subtotalKobo(cart);
const receiptOrder = cheapestFirst(cart.lines);
const staffCart = staffPrices(cart);

console.log("invoice said:", invoiceTotal);
console.log("cart now says:", subtotalKobo(cart));
console.log("first line of the cart:", cart.lines[0].sku);
console.log("staff cart is the same object:", staffCart === cart, receiptOrder === cart.lines);
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
invoice said: 5700000
cart now says: 4560000
first line of the cart: RICE-5
staff cart is the same object: true true
```

The printed invoice said ₦57,000. The customer's cart now says ₦45,600, and its lines are in a different order. Nobody asked for either change. `cheapestFirst` sorted the array in place, because `sort` mutates, and `staffPrices` rewrote the prices it was given.

Now read the signatures again. `(lines: CartLine[]) => CartLine[]` fits a function that returns a sorted copy *and* one that reorders your array. `(cart: Cart) => Cart` fits a function that builds a discounted cart *and* one that edits yours. The types are correct and say nothing about what matters here.

[Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional) fixed this kind of code with a style: pure functions, immutable updates, small steps joined into pipelines. This lesson makes that style *checkable*. You will make signatures say "I will not change your data" (`readonly`), "the value may be missing" (Option), "this can fail, in these ways" (Result) and "these are all the kinds there are" (algebraic data types), and then build a pricing core where the compiler checks the order of the steps.

## What a signature can promise

A **pure function**, as you know, has no hidden inputs and no side effects: its only input is its parameters and its only output is its return value. Some languages (Haskell, for example) put effects into the types, so the compiler knows which functions print or write files. TypeScript does not. Here is what a TypeScript signature can and cannot express:

| Fact about a function | Can the type say it? | How |
| --- | --- | --- |
| It does not change its arguments | Yes | `readonly` properties, `readonly T[]`, `ReadonlyMap` |
| The result may be missing | Yes | `T \| undefined`, or an Option type |
| It can fail, and how | Yes | A Result type with a union of error codes |
| The input is one of a fixed set of kinds | Yes | A discriminated union (a sum type) |
| It does not read the clock, randomness or globals | No | Convention: pass them in as parameters |
| It does not log, write or send | No | Convention: keep effects in a thin shell |

The last two rows matter. To the compiler, these two functions have the same type, and it will let you use either one anywhere:

transparency.ts

```ts
const audit: string[] = [];

const vatKobo = (kobo: number): number => Math.round(kobo * 0.075);

const vatKoboAudited = (kobo: number): number => {
  audit.push(`VAT computed on ${kobo}`);
  return Math.round(kobo * 0.075);
};

const twice = vatKoboAudited(1000000) + vatKoboAudited(1000000);
console.log(twice, "audit entries:", audit.length);

audit.length = 0;
const once = vatKoboAudited(1000000);
console.log(once + once, "audit entries:", audit.length);

const pureVersions: Array<(kobo: number) => number> = [vatKobo, vatKoboAudited];
console.log(pureVersions.length);
```

Output of `npx tsx transparency.ts` and of the browser terminal

```ts
150000 audit entries: 2
150000 audit entries: 1
2
```

Both versions of the sum are ₦1,500, but the audit log differs. That is the test for **referential transparency**: a call is referentially transparent when you can replace it with its result (or compute it once and reuse it) without changing anything the program does. `vatKobo(1000000)` can be replaced by `75000` everywhere. `vatKoboAudited(1000000)` cannot, because the log is part of what it does.

Referential transparency is what makes refactoring, caching and testing safe. Caching a result (memoising) *is* replacing later calls by an earlier result, so you may only cache functions that are referentially transparent. The types will not tell you which ones are, so the rest of this lesson uses every tool that TypeScript *does* give you, and keeps the effects it cannot see in one visible place.

## readonly: immutability the compiler checks

[Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#optional-readonly) introduced `readonly` properties. Put them on the problem's types, add `readonly` to the array, and the compiler finds both bugs:

checked.ts

```ts
interface CartLine {
  readonly sku: string;
  readonly qty: number;
  readonly priceKobo: number;
}

interface Cart {
  readonly id: string;
  readonly lines: readonly CartLine[];
}

function cheapestFirst(lines: readonly CartLine[]): readonly CartLine[] {
  return lines.sort((a, b) => a.priceKobo - b.priceKobo);
}

function staffPrices(cart: Cart): Cart {
  for (const line of cart.lines) line.priceKobo = Math.round(line.priceKobo * 0.8);
  return cart;
}
```

What `npx tsc --noEmit` prints

```ts
checked.ts:13:16 - error TS2339: Property 'sort' does not exist on type 'readonly CartLine[]'.

13   return lines.sort((a, b) => a.priceKobo - b.priceKobo);
                  ~~~~

checked.ts:13:22 - error TS7006: Parameter 'a' implicitly has an 'any' type.

13   return lines.sort((a, b) => a.priceKobo - b.priceKobo);
                        ~

checked.ts:13:25 - error TS7006: Parameter 'b' implicitly has an 'any' type.

13   return lines.sort((a, b) => a.priceKobo - b.priceKobo);
                           ~

checked.ts:17:39 - error TS2540: Cannot assign to 'priceKobo' because it is a read-only property.

17   for (const line of cart.lines) line.priceKobo = Math.round(line.priceKobo * 0.8);
                                         ~~~~~~~~~


Found 4 errors in the same file, starting at: checked.ts:13
```

The two TS7006 errors are follow-on errors: `sort` does not exist on the type, so its callback has no parameter types to borrow. Fix the first error and they disappear. `readonly CartLine[]` is an array type without the methods that change an array: no `push`, `pop`, `sort`, `reverse`, `splice`, and no assignment to an index. The methods that return something new (`map`, `filter`, `slice`, `toSorted`, `with`) are all still there. So the fixed code is also the natural code:

fixed.ts

```ts
interface CartLine {
  readonly sku: string;
  readonly qty: number;
  readonly priceKobo: number;
}

interface Cart {
  readonly id: string;
  readonly lines: readonly CartLine[];
}

function cheapestFirst(lines: readonly CartLine[]): readonly CartLine[] {
  return lines.toSorted((a, b) => a.priceKobo - b.priceKobo);
}

function staffPrices(cart: Cart): Cart {
  return { ...cart, lines: cart.lines.map((line) => ({ ...line, priceKobo: Math.round(line.priceKobo * 0.8) })) };
}

const subtotalKobo = (cart: Cart): number => cart.lines.reduce((sum, line) => sum + line.qty * line.priceKobo, 0);

const cart: Cart = {
  id: "CART-7",
  lines: [
    { sku: "TV-32", qty: 1, priceKobo: 4000000 },
    { sku: "RICE-5", qty: 2, priceKobo: 850000 },
  ],
};

console.log(cheapestFirst(cart.lines).map((line) => line.sku), cart.lines[0].sku);
console.log(subtotalKobo(staffPrices(cart)), subtotalKobo(cart));
```

Output of `npx tsx fixed.ts` and of the browser terminal

```json
[ 'RICE-5', 'TV-32' ] TV-32
4560000 5700000
```

### The readonly family

| Mutable | Read-only view | Notes |
| --- | --- | --- |
| `T[]`, `Array<T>` | `readonly T[]`, `ReadonlyArray<T>` | Two spellings of the same type |
| `[string, number]` | `readonly [string, number]` | Readonly tuple ([Tuples](https://zudojs.oyinlola.site/learn/ts-tuples#readonly)) |
| `Map<K, V>` | `ReadonlyMap<K, V>` | No `set`, `delete`, `clear` |
| `Set<T>` | `ReadonlySet<T>` | No `add`, `delete`, `clear` |
| `{ price: number }` | `Readonly<{ price: number }>` | Every property readonly, one level deep |
| a literal value | `as const` | Readonly all the way down, and literal types |

### Readonly is one-way, and that is the point

A mutable array can go where a readonly one is expected: the function just promises not to use the methods it could have used. The other direction is refused, because the receiver could then change something its owner was promised would stay the same:

one-way.ts

```ts
function totalQty(lines: readonly { readonly qty: number }[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

function addFreeGift(lines: { sku: string; qty: number }[]): void {
  lines.push({ sku: "GIFT-BAG", qty: 1 });
}

const draft = [{ sku: "RICE-5", qty: 2 }];
const confirmed: readonly { sku: string; qty: number }[] = [{ sku: "OIL-1", qty: 1 }];

console.log(totalQty(draft), totalQty(confirmed));
addFreeGift(draft);
addFreeGift(confirmed);
```

What `npx tsc --noEmit` prints

```ts
one-way.ts:14:13 - error TS4104: The type 'readonly { sku: string; qty: number; }[]' is 'readonly' and cannot be assigned to the mutable type '{ sku: string; qty: number; }[]'.

14 addFreeGift(confirmed);
               ~~~~~~~~~


Found 1 error in one-way.ts:14
```

This gives a simple rule for your own functions. **Accept readonly parameters** whenever the function does not need to change them: callers with mutable or readonly data can both call it, and the signature documents that their data is safe. **Return readonly data** when the caller must not change what you hand back, such as a cached list shared by everyone.

### The three limits of readonly

**1. It is shallow.** `readonly` on a property stops you replacing the property; `readonly T[]` stops you changing the array. Neither says anything about the objects *inside*, just as [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#modifiers) showed for `Readonly<T>`:

shallow.ts

```ts
interface CartLine {
  sku: string;
  qty: number;
}

function sneakyTotal(lines: readonly CartLine[]): number {
  lines[0].qty = 100;
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

const lines: CartLine[] = [{ sku: "RICE-5", qty: 2 }];
console.log(sneakyTotal(lines), lines[0].qty);
```

Output of `npx tsx shallow.ts` and of the browser terminal

```ts
100 100
```

Declaring the element type with `readonly` properties (as the fixed `CartLine` above does) closes that gap for one level. For data several levels deep, a recursive mapped type does it everywhere. [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) explains how it works; `@zudojs/types` ships a tested version as `DeepReadonly` ([Types and constants](https://zudojs.oyinlola.site/learn/zudo-types-constants)):

deep.ts

```ts
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

interface Order {
  id: string;
  customer: { name: string; city: string };
  lines: { sku: string; qty: number }[];
}

function ship(order: DeepReadonly<Order>): string {
  order.customer.city = "Abuja";
  order.lines[0].qty = 0;
  order.lines.push({ sku: "GIFT-BAG", qty: 1 });
  return order.id;
}
```

What `npx tsc --noEmit` prints

```ts
deep.ts:14:18 - error TS2540: Cannot assign to 'city' because it is a read-only property.

14   order.customer.city = "Abuja";
                    ~~~~

deep.ts:15:18 - error TS2540: Cannot assign to 'qty' because it is a read-only property.

15   order.lines[0].qty = 0;
                    ~~~

deep.ts:16:15 - error TS2339: Property 'push' does not exist on type 'readonly { readonly sku: string; readonly qty: number; }[]'.

16   order.lines.push({ sku: "GIFT-BAG", qty: 1 });
                 ~~~~


Found 3 errors in the same file, starting at: deep.ts:14
```

**2. It is a view, not a lock.** A readonly type describes what *your reference* may do. If someone else holds a mutable reference to the same array, they can change it, and your readonly view sees the change:

alias.ts

```ts
const basket: string[] = ["RICE-5"];
const view: readonly string[] = basket;

basket.push("OIL-1");
console.log(view);
```

Output of `npx tsx alias.ts` and of the browser terminal

```json
[ 'RICE-5', 'OIL-1' ]
```

**3. It disappears at runtime.** Like every type, `readonly` is erased ([What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#erasure)), so plain JavaScript callers, an `as` cast or data from `JSON.parse` can ignore it. When you need the runtime to refuse, use `Object.freeze`, whose type is already a readonly view of its argument:

freeze.ts

```ts
const vatRates = Object.freeze({ NG: 0.075, GH: 0.15 });
const zones = Object.freeze(["Lagos", "Abuja", "Kano"]);

type Rates = typeof vatRates;
type Zones = typeof zones;
const check: [Rates, Zones] = [{ NG: 0.075, GH: 0.15 }, ["Lagos"]];

try {
  (zones as string[]).push("Ibadan");
} catch (error) {
  console.log(String(error));
}
console.log(check.length, zones.length);
```

Output of `npx tsx freeze.ts` and of the browser terminal

```ts
TypeError: Cannot add property 3, object is not extensible
2 3
```

Hover over `Rates` in an editor and you see `Readonly<{ NG: 0.075; GH: 0.15; }>` (`Object.freeze` keeps literal types for objects of primitives); `Zones` is `readonly string[]`. The cast told the compiler to allow `push`, and the runtime refused anyway. `Object.freeze` is shallow too, so freeze each level, or freeze configuration once at start-up and rely on readonly types for the rest.

## Typed composition

In [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional#composition), `pipe(...fns)` was one line of `reduce`. Typing it is harder than it looks, because each function's input must match the previous function's output, and every step can have a different type. A rest parameter typed `Array<(x: any) => any>` compiles, and switches the checking off.

The standard answer, used by libraries such as fp-ts and Effect, is a list of **overloads** ([Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions)): one signature per number of steps, each linking the types together, and one implementation that is typed loosely inside:

pipe.ts

```ts
export function pipe<A, B>(ab: (a: A) => B): (a: A) => B;
export function pipe<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
export function pipe<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D;
export function pipe<A, B, C, D, E>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): (a: A) => E;
export function pipe(...fns: ReadonlyArray<(value: unknown) => unknown>): (input: unknown) => unknown {
  return (input) => fns.reduce((value, fn) => fn(value), input);
}
```

The implementation signature is not visible to callers; only the four overloads are. Each overload is a chain: `A` goes in, the first step makes a `B`, the second step must take a `B`, and so on. Using it with curried steps, written configuration first and data last as in the JavaScript lesson:

labels.ts

```ts
import { pipe } from "./pipe.js";

const minusVoucher = (voucherKobo: number) => (kobo: number): number => Math.max(kobo - voucherKobo, 0);
const addVat = (rate: number) => (kobo: number): number => Math.round(kobo * (1 + rate));
const toNaira = (kobo: number): string => `₦${(kobo / 100).toFixed(2)}`;

const shelfLabel = pipe(minusVoucher(200000), addVat(0.075), toNaira);
const labelLength = pipe(shelfLabel, (label) => label.length);

console.log(shelfLabel(1700000), labelLength(1700000));
```

Output of `npx tsx labels.ts` and of the browser terminal

```ts
₦16125.00 9
```

Notice `(label) => label.length`: no annotation, yet `label` is a `string`. The overload inferred `B = string` from `shelfLabel` and gave that type to the next step (contextual typing, from [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#contextual)). Swap two steps, and the compiler reports the join where the types stop matching:

wrong-order.ts

```ts
import { pipe } from "./pipe.js";

const addVat = (rate: number) => (kobo: number): number => Math.round(kobo * (1 + rate));
const toNaira = (kobo: number): string => `₦${(kobo / 100).toFixed(2)}`;

const broken = pipe(toNaira, addVat(0.075));
```

What `npx tsc --noEmit` prints

```ts
wrong-order.ts:6:21 - error TS2345: Argument of type '(kobo: number) => string' is not assignable to parameter of type '(a: number) => number'.
  Type 'string' is not assignable to type 'number'.

6 const broken = pipe(toNaira, addVat(0.075));
                      ~~~~~~~


Found 1 error in wrong-order.ts:6
```

The compiler read the second step first: `addVat(0.075)` takes a `number`, so `B` must be `number`, and then `toNaira`, which returns a `string`, is the step that does not fit. When a pipe error seems to blame the wrong function, look at both sides of the join it names.

Overloads have a ceiling: this `pipe` takes at most four steps, and a fifth is an error. Libraries write twenty overloads, or nest pipes: `pipe(pipe(a, b, c), d, e)` is still fully typed. A single variadic signature that checks any number of steps can be written with recursive conditional types, and it produces far worse error messages; the [next lesson](https://zudojs.oyinlola.site/learn/ts-type-system) shows why that trade is rarely worth it.

> TIP
>
> Many libraries also offer a value-first form, `pipe(value, f, g)`, which runs immediately. It infers even better, because the first type comes from a real value rather than from the first function's annotation.

## Option: a value that may be missing

With `strictNullChecks` on (part of `strict`), TypeScript already has a good type for "maybe": `T | undefined`. `Array.prototype.find` and `Map.prototype.get` return it, `?.` and `??` handle it, and narrowing forces you to check before use. In most TypeScript code that is all you need, and wrapping every missing value in a special object would just add noise.

There is one situation where `T | undefined` fails, and it causes real bugs: when "missing" can happen at two levels. A shop caches the result of a slow discount lookup. Most products have no discount, so the lookup returns `undefined` for them:

cache.ts

```ts
const discountPercent: Record<string, number> = { "RICE-5": 10 };
let slowLookups = 0;

function lookupDiscount(sku: string): number | undefined {
  slowLookups++;
  return discountPercent[sku];
}

const cache = new Map<string, number | undefined>();

function cachedDiscount(sku: string): number | undefined {
  const hit = cache.get(sku);
  if (hit !== undefined) return hit;
  const found = lookupDiscount(sku);
  cache.set(sku, found);
  return found;
}

for (const sku of ["RICE-5", "RICE-5", "OIL-1", "OIL-1", "OIL-1"]) cachedDiscount(sku);
console.log("slow lookups:", slowLookups);
```

Output of `npx tsx cache.ts` and of the browser terminal

```ts
slow lookups: 4
```

Five calls, four slow lookups. The rice discount was cached, but "oil has no discount" was cached as `undefined`, and `cache.get` also returns `undefined` for "not in the cache". The two meanings collapsed into one value, so the cache never hits for products without a discount, which is most of the catalogue. At the type level, the collapse is visible:

collapse.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Maybe<T> = T | undefined;
type CacheRead = Maybe<Maybe<number>>;

type C1 = Expect<Equal<CacheRead, number | undefined>>;
console.log("Maybe<Maybe<number>> is just number | undefined");
```

Output of `npx tsx collapse.ts` and of the browser terminal

```ts
Maybe<Maybe<number>> is just number | undefined
```

A union of a union is flat. `Equal` and `Expect` are the type tests from [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#testing): the file only compiles if the two types are identical. An **Option** type (also called **Maybe**) does not collapse, because it is an object with its own discriminant:

option.ts

```ts
export type Option<T> = { readonly kind: "some"; readonly value: T } | { readonly kind: "none" };

export const some = <T>(value: T): Option<T> => ({ kind: "some", value });
export const none: Option<never> = { kind: "none" };

export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none : some(value);

export const mapOption = <T, U>(fn: (value: T) => U) => (option: Option<T>): Option<U> =>
  option.kind === "some" ? some(fn(option.value)) : none;

export const getOrElse = <T>(fallback: T) => (option: Option<T>): T =>
  option.kind === "some" ? option.value : fallback;
```

cache-fixed.ts

```ts
import { fromNullable, getOrElse } from "./option.js";
import type { Option } from "./option.js";

const discountPercent: Record<string, number> = { "RICE-5": 10 };
let slowLookups = 0;

function lookupDiscount(sku: string): Option<number> {
  slowLookups++;
  return fromNullable(discountPercent[sku]);
}

const cache = new Map<string, Option<number>>();

function cachedDiscount(sku: string): Option<number> {
  const hit = cache.get(sku);
  if (hit !== undefined) return hit;
  const found = lookupDiscount(sku);
  cache.set(sku, found);
  return found;
}

const orZero = getOrElse(0);
for (const sku of ["RICE-5", "RICE-5", "OIL-1", "OIL-1", "OIL-1"]) cachedDiscount(sku);
console.log("slow lookups:", slowLookups);
console.log(orZero(cachedDiscount("RICE-5")), orZero(cachedDiscount("OIL-1")));
```

Output of `npx tsx cache-fixed.ts` and of the browser terminal

```ts
slow lookups: 2
10 0
```

Now `cache.get` returns `Option<number> | undefined`: the outer `undefined` means "not cached", and a cached `{ kind: "none" }` means "looked up, no discount". Two lookups for two products. (`cache.has(sku)` would also have fixed this particular bug; the Option version makes the difference part of the type, so the next person cannot reintroduce it.)

A practical rule: use `T | undefined` by default. Reach for an Option type when absence can nest (caches, lookups of optional values, "not loaded yet" versus "loaded, empty"), or when the value must be stored or sent somewhere that cannot hold `undefined`. JSON, for instance, drops properties whose value is `undefined`.

## Result: failure in the signature

[Designing generic APIs](https://zudojs.oyinlola.site/learn/ts-generic-design#result) built `Result<T, E>` with `ok`, `err`, `map` and `andThen`, and showed error codes adding up in the type. Two things matter when you use Result in functional code: helpers that fit into `pipe`, and a boundary with code that throws.

### Data-last helpers fit pipelines

The Designing generic APIs versions take the result first: `map(result, fn)`. For `pipe`, the result is the data flowing through, so it must come last: `mapResult(fn)` returns a function that waits for the result. It is the same "configuration first, data last" rule as currying:

result.ts

```ts
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U>(fn: (value: T) => U) => <E>(result: Result<T, E>): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;

export const andThen = <T, U, F>(fn: (value: T) => Result<U, F>) => <E>(result: Result<T, E>): Result<U, E | F> =>
  result.ok ? fn(result.value) : result;

export const tryCatch = <T, E>(run: () => T, onError: (error: unknown) => E): Result<T, E> => {
  try {
    return ok(run());
  } catch (error) {
    return err(onError(error));
  }
};
```

`tryCatch` is the boundary: code you do not control throws, and `tryCatch` turns the throw into a value with a typed error. Promotions arrive as JSON from an admin screen. Parsing can throw, and even valid JSON may not be a valid rate:

config.ts

```ts
import { pipe } from "./pipe.js";
import { andThen, err, ok, tryCatch } from "./result.js";
import type { Result } from "./result.js";

type ConfigError = { readonly code: "bad-json"; readonly detail: string } | { readonly code: "bad-rate"; readonly rate: unknown };

const parseJson = (text: string): Result<unknown, ConfigError> =>
  tryCatch(() => JSON.parse(text) as unknown, (error) => ({ code: "bad-json", detail: error instanceof Error ? error.name : "unknown" }));

const readVatRate = (data: unknown): Result<number, ConfigError> => {
  const rate = typeof data === "object" && data !== null && "vatRate" in data ? data.vatRate : undefined;
  return typeof rate === "number" && rate >= 0 && rate < 1 ? ok(rate) : err({ code: "bad-rate", rate });
};

const loadVatRate = pipe(parseJson, andThen(readVatRate));

for (const text of ['{"vatRate":0.075}', '{"vatRate":7.5}', "{vatRate:0.075}"]) {
  const result = loadVatRate(text);
  console.log(result.ok ? `rate ${result.value}` : JSON.stringify(result.error));
}
```

Output of `npx tsx config.ts` and of the browser terminal

```ts
rate 0.075
{"code":"bad-rate","rate":7.5}
{"code":"bad-json","detail":"SyntaxError"}
```

### Fail fast or collect every problem

`andThen` stops at the first failure. That is right when each step needs the previous one's value: there is no rate to check if the JSON did not parse. It is wrong when the checks are independent and the user wants to fix everything at once, like the lines of a cart. Then run every check and collect the failures into an array:

collect.ts

```ts
import { err, ok } from "./result.js";
import type { Result } from "./result.js";

type LineError = { readonly sku: string; readonly problem: "unknown-product" | "bad-quantity" };

const catalog: ReadonlyMap<string, number> = new Map([["RICE-5", 850000], ["OIL-1", 320000]]);

function checkLine(line: { readonly sku: string; readonly qty: number }): LineError | undefined {
  if (!catalog.has(line.sku)) return { sku: line.sku, problem: "unknown-product" };
  if (!Number.isInteger(line.qty) || line.qty < 1) return { sku: line.sku, problem: "bad-quantity" };
  return undefined;
}

function checkLines(lines: readonly { readonly sku: string; readonly qty: number }[]): Result<number, readonly LineError[]> {
  const problems = lines.map(checkLine).filter((problem) => problem !== undefined);
  return problems.length > 0 ? err(problems) : ok(lines.length);
}

console.log(checkLines([{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }]));
console.log(checkLines([{ sku: "TV-99", qty: 1 }, { sku: "OIL-1", qty: 0 }, { sku: "RICE-5", qty: 1 }]));
```

Output of `npx tsx collect.ts` and of the browser terminal

```json
{ ok: true, value: 2 }
{
  ok: false,
  error: [
    { sku: 'TV-99', problem: 'unknown-product' },
    { sku: 'OIL-1', problem: 'bad-quantity' }
  ]
}
```

`filter((problem) => problem !== undefined)` narrows the array to `LineError[]` by itself: since TypeScript 5.5 the compiler infers a type predicate from a simple arrow like this ([Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#type-guards)). The error type is `readonly LineError[]`, a list, and the caller shows every problem in one response.

## Algebraic data types

The Option and Result types above are built from two ways of combining types, and those two ways have names:

- A **product type** holds several values at once: an object type or a tuple. A value of `{ paid: boolean; shipped: boolean }` has a `paid` *and* a `shipped`.
- A **sum type** holds one of several alternatives: a union, usually a discriminated union ([Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#states)). A value of `Option<T>` is a `some` *or* a `none`.

Types built from these two are **algebraic data types** (ADTs), and the name is literal: count the possible values of a type, and products multiply while sums add. `boolean` has 2 values, so `{ paid: boolean; shipped: boolean }` has 2 × 2 = 4. A union of three states with no data has 1 + 1 + 1 = 3. `Option<T>` has "the values of `T`, plus 1"; `Result<T, E>` has "the values of `T` plus the values of `E`". `never` has 0.

This arithmetic is a design tool. The loan in [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#problem) had sixteen possible shapes for three real states, because it was a product of flags. When the count your type allows is bigger than the count your business has, the difference is bugs you can write. Replace products of flags with sums of states until the numbers match. [Type-safe domain modelling](https://zudojs.oyinlola.site/learn/ts-domain-modeling) applies this to a whole shop.

### Promotions as data

Functional JavaScript represented each promotion as a function. That was flexible, but a function cannot be stored in a database, shown to a customer or checked by an admin screen. An ADT can. Each kind of promotion is one member of a sum type, and one **interpreter** function gives it meaning:

promotion.ts

```ts
export type Promotion =
  | { readonly kind: "percent-off"; readonly sku: string; readonly percent: number }
  | { readonly kind: "spend-and-save"; readonly minKobo: number; readonly offKobo: number }
  | { readonly kind: "buy-x-get-one"; readonly sku: string; readonly buy: number }
  | { readonly kind: "best-of"; readonly options: readonly Promotion[] };

export interface Line {
  readonly sku: string;
  readonly qty: number;
  readonly unitKobo: number;
}

export function discountKobo(promo: Promotion, lines: readonly Line[]): number {
  switch (promo.kind) {
    case "percent-off":
      return lines
        .filter((line) => line.sku === promo.sku)
        .reduce((sum, line) => sum + Math.round((line.unitKobo * line.qty * promo.percent) / 100), 0);
    case "spend-and-save": {
      const subtotal = lines.reduce((sum, line) => sum + line.unitKobo * line.qty, 0);
      return subtotal >= promo.minKobo ? promo.offKobo : 0;
    }
    case "buy-x-get-one":
      return lines
        .filter((line) => line.sku === promo.sku)
        .reduce((sum, line) => sum + Math.floor(line.qty / (promo.buy + 1)) * line.unitKobo, 0);
    case "best-of":
      return Math.max(0, ...promo.options.map((option) => discountKobo(option, lines)));
  }
}
```

`best-of` contains other promotions, so the type is **recursive**, and so is its interpreter: the same shape as the chart of accounts in [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces#recursive). The switch has no `default` and the return type is `number`, so adding a fifth kind without handling it is a compile error (exhaustiveness technique 1 from Union types in depth).

promotion-demo.ts

```ts
import { discountKobo } from "./promotion.js";
import type { Line, Promotion } from "./promotion.js";

const septemberDeals: Promotion = {
  kind: "best-of",
  options: [
    { kind: "percent-off", sku: "RICE-5", percent: 10 },
    { kind: "buy-x-get-one", sku: "OIL-1", buy: 3 },
    { kind: "spend-and-save", minKobo: 5000000, offKobo: 250000 },
  ],
};

const lines: readonly Line[] = [
  { sku: "RICE-5", qty: 2, unitKobo: 850000 },
  { sku: "OIL-1", qty: 4, unitKobo: 320000 },
];

console.log(discountKobo(septemberDeals, lines));
console.log(JSON.stringify(septemberDeals).length, "characters, ready to store");
```

Output of `npx tsx promotion-demo.ts` and of the browser terminal

```ts
320000
189 characters, ready to store
```

Rice gives ₦1,700 off, "buy 3 oil, get 1 free" gives ₦3,200 off, and the spend threshold is not reached: the best is 320000 kobo. And the whole promotion is plain data that survives a trip through JSON.

### Functions or data

Rules as functions (the JavaScript version) and rules as an ADT (this version) make opposite things easy. With functions, a new *kind* of rule is one new function, but you cannot store, show or inspect a rule. With an ADT, a new *operation* over all rules (describe, validate, preview) is one new function with a switch, while a new kind means touching every interpreter, which the compiler lists for you. [Object-oriented TypeScript](https://zudojs.oyinlola.site/learn/ts-oop#oop-vs-fp) sets this trade-off, the expression problem, out in full. For business rules that admins configure and customers see, the data side usually wins.

### Pattern matching as a function

Functional languages have **pattern matching**: an expression that picks a branch by the shape of a value, and fails to compile when a shape is missing. A `switch` does this as a statement. A small generic `match` does it as an expression, with one handler per `kind`:

match.ts

```ts
import type { Promotion } from "./promotion.js";

type Handlers<U extends { readonly kind: string }, R> = {
  readonly [K in U["kind"]]: (value: Extract<U, { readonly kind: K }>) => R;
};

export function match<U extends { readonly kind: string }, R>(value: U, handlers: Handlers<U, R>): R {
  const handler = handlers[value.kind as U["kind"]] as (value: U) => R;
  return handler(value);
}

const describe = (promo: Promotion): string =>
  match(promo, {
    "percent-off": (p) => `${p.percent}% off ${p.sku}`,
    "spend-and-save": (p) => `₦${p.offKobo / 100} off when you spend ₦${p.minKobo / 100}`,
    "buy-x-get-one": (p) => `buy ${p.buy} ${p.sku}, get 1 free`,
    "best-of": (p) => `the best of: ${p.options.map(describe).join("; ")}`,
  });

console.log(describe({ kind: "best-of", options: [{ kind: "percent-off", sku: "RICE-5", percent: 10 }, { kind: "buy-x-get-one", sku: "OIL-1", buy: 3 }] }));
```

Output of `npx tsx match.ts` and of the browser terminal

```ts
the best of: 10% off RICE-5; buy 3 OIL-1, get 1 free
```

`Handlers` is a mapped type ([Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types)) over the union's `kind` values, and `Extract` hands each handler exactly its member, so `p.percent` is only available in the `percent-off` handler. Leave out a handler and the object literal is missing a required property. Inside `match` there are two casts: the compiler cannot connect "the handler for this value's kind" with "this value", a limit of how TypeScript relates a union to a mapped type over it. That is acceptable in a five-line helper with tests, and not acceptable spread across application code.

## Before you build: a typed pricing core

REASON IT OUT

### Design the types before the steps

You will rebuild the checkout pipeline from Functional JavaScript in TypeScript. Before reading the code, decide:

- The cart arrives from a client with SKUs and quantities. What should the first step return, so that later steps never look a product up again and never handle "not found"?
- Which failures are expected (part of the return type) and which are bugs (thrown)?
- Each step adds fields: prices, discount, VAT, delivery, total. Should every step take and return one big `Quote` type with optional fields, or should each stage have its own type?
- VAT must be charged on the discounted amount. Can the types stop someone adding VAT before the discount?
- Which inputs would make the core impure if it read them itself?

**Show the reasoning**

- **Parse, don't just validate.** A check that returns `true` leaves every later step holding a plain SKU and doing `catalog.get(sku)`, which is typed `Product | undefined` forever. Instead, the first step returns a *new* type, `ValidCart`, whose lines hold the `Product` itself. The proof that each product exists is carried in the data. This idea has a name, "parse, don't validate", and the next two lessons build on it.
- Expected failures are the customer's cart being wrong: empty, an unknown product, a bad quantity. They go in a `Result`, all of them at once. A negative price in our own catalogue is a bug in our data; that can throw.
- **One type per stage.** A single `Quote` with optional `vatKobo?` and `deliveryKobo?` fields means every step must check fields that the previous steps definitely set. With a type per stage (`PricedQuote`, `DiscountedQuote`, `TaxedQuote`, …) each step says exactly what it needs and what it adds.
- Yes, partly. If `addVat` takes a `DiscountedQuote`, a `PricedQuote` that has not been discounted does not fit, and `pipe` reports the wrong order. It is only partly, because TypeScript compares shapes: any object with the right fields fits, whether or not it came from the discount step. The [next lesson](https://zudojs.oyinlola.site/learn/ts-type-system) is about exactly that.
- The catalogue, the promotions, the VAT rate, the delivery rule and the order time. The core receives all of them. Reading the clock, loading the catalogue and saving the order happen in the shell.

## Build: a typed pricing and checkout core

The project collects the helpers from this lesson into one file:

fp.ts

```ts
export function pipe<A, B>(ab: (a: A) => B): (a: A) => B;
export function pipe<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
export function pipe<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D;
export function pipe<A, B, C, D, E>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): (a: A) => E;
export function pipe(...fns: ReadonlyArray<(value: unknown) => unknown>): (input: unknown) => unknown {
  return (input) => fns.reduce((value, fn) => fn(value), input);
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const mapResult = <T, U>(fn: (value: T) => U) => <E>(result: Result<T, E>): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;
```

The promotion ADT comes next, in a smaller version (three kinds) that works on parsed lines, which hold the product itself. After it, the types. Every stage has its own type, each `extends` the previous one, and everything is readonly. `Kobo` is a plain alias for `number` here; [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types) turns it into a type that a plain number cannot pass for.

promotion.ts

```ts
export type Promotion =
  | { readonly kind: "percent-off"; readonly sku: string; readonly percent: number }
  | { readonly kind: "spend-and-save"; readonly minKobo: number; readonly offKobo: number }
  | { readonly kind: "buy-x-get-one"; readonly sku: string; readonly buy: number };

export interface PromoLine {
  readonly product: { readonly sku: string; readonly priceKobo: number };
  readonly qty: number;
}

export function discountKobo(promo: Promotion, lines: readonly PromoLine[], subtotalKobo: number): number {
  const linesFor = (sku: string) => lines.filter((line) => line.product.sku === sku);
  switch (promo.kind) {
    case "percent-off":
      return linesFor(promo.sku).reduce((sum, l) => sum + Math.round((l.product.priceKobo * l.qty * promo.percent) / 100), 0);
    case "spend-and-save":
      return subtotalKobo >= promo.minKobo ? promo.offKobo : 0;
    case "buy-x-get-one":
      return linesFor(promo.sku).reduce((sum, l) => sum + Math.floor(l.qty / (promo.buy + 1)) * l.product.priceKobo, 0);
  }
}
```

checkout.types.ts

```ts
import type { Promotion } from "./promotion.js";

export type Kobo = number;

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly priceKobo: Kobo;
}

export interface CartInput {
  readonly cartId: string;
  readonly orderedAt: string;
  readonly lines: readonly { readonly sku: string; readonly qty: number }[];
}

export interface ValidCart {
  readonly cartId: string;
  readonly orderedAt: string;
  readonly lines: readonly { readonly product: Product; readonly qty: number }[];
}

export interface PricedQuote extends ValidCart {
  readonly subtotalKobo: Kobo;
}
export interface DiscountedQuote extends PricedQuote {
  readonly discountKobo: Kobo;
}
export interface TaxedQuote extends DiscountedQuote {
  readonly vatKobo: Kobo;
}
export interface DeliveredQuote extends TaxedQuote {
  readonly deliveryKobo: Kobo;
}
export interface Receipt extends DeliveredQuote {
  readonly totalKobo: Kobo;
}

export type CheckoutError =
  | { readonly code: "empty-cart" }
  | { readonly code: "unknown-product"; readonly sku: string }
  | { readonly code: "bad-quantity"; readonly sku: string; readonly qty: number };

export interface PricingRules {
  readonly catalog: ReadonlyMap<string, Product>;
  readonly promotions: readonly Promotion[];
  readonly vatRate: number;
  readonly deliveryFee: (quote: TaxedQuote) => Kobo;
}
```

Now the pure core. The first step parses; the other steps each take one stage and return the next:

pricing.ts

```ts
import { err, mapResult, ok, pipe } from "./fp.js";
import type { Result } from "./fp.js";
import { discountKobo } from "./promotion.js";
import type { Promotion } from "./promotion.js";
import type { CartInput, CheckoutError, DeliveredQuote, DiscountedQuote, Kobo, PricedQuote, PricingRules, Product, Receipt, TaxedQuote, ValidCart } from "./checkout.types.js";

export const parseCart = (catalog: ReadonlyMap<string, Product>) => (cart: CartInput): Result<ValidCart, readonly CheckoutError[]> => {
  if (cart.lines.length === 0) return err([{ code: "empty-cart" }]);
  const problems: CheckoutError[] = [];
  const lines: { readonly product: Product; readonly qty: number }[] = [];
  for (const { sku, qty } of cart.lines) {
    const product = catalog.get(sku);
    if (product === undefined) problems.push({ code: "unknown-product", sku });
    else if (!Number.isInteger(qty) || qty < 1) problems.push({ code: "bad-quantity", sku, qty });
    else lines.push({ product, qty });
  }
  return problems.length > 0 ? err(problems) : ok({ cartId: cart.cartId, orderedAt: cart.orderedAt, lines });
};

export const priceLines = (cart: ValidCart): PricedQuote => ({
  ...cart,
  subtotalKobo: cart.lines.reduce((sum, line) => sum + line.product.priceKobo * line.qty, 0),
});

export const applyBestPromotion = (promotions: readonly Promotion[]) => (quote: PricedQuote): DiscountedQuote => {
  const best = Math.max(0, ...promotions.map((promo) => discountKobo(promo, quote.lines, quote.subtotalKobo)));
  return { ...quote, discountKobo: Math.min(best, quote.subtotalKobo) };
};

export const addVat = (rate: number) => (quote: DiscountedQuote): TaxedQuote => ({
  ...quote,
  vatKobo: Math.round((quote.subtotalKobo - quote.discountKobo) * rate),
});

export const addDelivery = (feeFor: (quote: TaxedQuote) => Kobo) => (quote: TaxedQuote): DeliveredQuote => ({
  ...quote,
  deliveryKobo: feeFor(quote),
});

export const summarise = (quote: DeliveredQuote): Receipt => ({
  ...quote,
  totalKobo: quote.subtotalKobo - quote.discountKobo + quote.vatKobo + quote.deliveryKobo,
});

export const createPricing = (rules: PricingRules) =>
  pipe(
    parseCart(rules.catalog),
    mapResult(pipe(priceLines, applyBestPromotion(rules.promotions), addVat(rules.vatRate), pipe(addDelivery(rules.deliveryFee), summarise))),
  );
```

Read `createPricing` from the outside in. The outer `pipe` has two steps: parse (which can fail), then `mapResult` of the inner pipeline (which cannot). If parsing fails, `mapResult` passes the errors through untouched; if it succeeds, the inner pipeline runs on the `ValidCart`. The inner pipeline has five steps, one more than `pipe` accepts, so the last two are grouped into a nested `pipe`, as the composition section suggested.

Hover over `createPricing` in an editor and its type is `(rules: PricingRules) => (a: CartInput) => Result<Receipt, readonly CheckoutError[]>`. Nobody wrote that type: it was assembled from the steps. Now try to add VAT before the discount:

wrong-order.ts

```ts
import { pipe } from "./fp.js";
import { addVat, applyBestPromotion, priceLines } from "./pricing.js";

const vatFirst = pipe(priceLines, addVat(0.075), applyBestPromotion([]));
```

What `npx tsc --noEmit` prints

```ts
wrong-order.ts:4:23 - error TS2345: Argument of type '(cart: ValidCart) => PricedQuote' is not assignable to parameter of type '(a: ValidCart) => DiscountedQuote'.
  Property 'discountKobo' is missing in type 'PricedQuote' but required in type 'DiscountedQuote'.

4 const vatFirst = pipe(priceLines, addVat(0.075), applyBestPromotion([]));
                        ~~~~~~~~~~

  checkout.types.ts:27:12 - 'discountKobo' is declared here.
    27   readonly discountKobo: Kobo;
                  ~~~~~~~~~~~~


Found 1 error in wrong-order.ts:4
```

A `PricedQuote` has no `discountKobo`, so it cannot go into `addVat`. The finance rule "VAT on the discounted amount" is now checked by the compiler, not by a comment. The shell gathers inputs and performs effects:

checkout-service.ts

```ts
import { createPricing } from "./pricing.js";
import type { CartInput, CheckoutError, PricingRules, Receipt } from "./checkout.types.js";
import type { Result } from "./fp.js";

export interface CheckoutDeps {
  readonly loadRules: () => PricingRules;
  readonly saveReceipt: (receipt: Receipt) => void;
  readonly log: (message: string) => void;
}

export function createCheckoutService(deps: CheckoutDeps) {
  return function checkout(cart: CartInput): Result<Receipt, readonly CheckoutError[]> {
    const result = createPricing(deps.loadRules())(cart);
    if (result.ok) {
      deps.saveReceipt(result.value);
      deps.log(`${cart.cartId}: charged ${result.value.totalKobo} kobo`);
    } else {
      deps.log(`${cart.cartId}: refused, ${result.error.map((e) => e.code).join(", ")}`);
    }
    return result;
  };
}
```

main.ts

```ts
import { createCheckoutService } from "./checkout-service.js";
import type { PricingRules, Product, Receipt } from "./checkout.types.js";

const products: readonly Product[] = [
  { sku: "RICE-5", name: "Rice 5kg", priceKobo: 850000 },
  { sku: "OIL-1", name: "Palm oil 1L", priceKobo: 320000 },
  { sku: "TV-32", name: "32-inch TV", priceKobo: 4000000 },
];

const rules: PricingRules = {
  catalog: new Map(products.map((product) => [product.sku, product])),
  promotions: [
    { kind: "percent-off", sku: "RICE-5", percent: 10 },
    { kind: "spend-and-save", minKobo: 5000000, offKobo: 250000 },
  ],
  vatRate: 0.075,
  deliveryFee: (quote) => (new Date(quote.orderedAt).getUTCHours() >= 18 ? 150000 : 100000),
};

const saved: Receipt[] = [];
const checkout = createCheckoutService({ loadRules: () => rules, saveReceipt: (receipt) => saved.push(receipt), log: console.log });

const cart = { cartId: "CART-7", orderedAt: "2026-09-24T19:05:00Z", lines: [{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }] };
const first = checkout(cart);
const second = checkout(cart);
checkout({ cartId: "CART-8", orderedAt: "2026-09-24T09:00:00Z", lines: [{ sku: "TV-99", qty: 1 }, { sku: "OIL-1", qty: 0 }] });

if (first.ok && second.ok) {
  const { subtotalKobo, discountKobo, vatKobo, deliveryKobo, totalKobo } = first.value;
  console.log({ subtotalKobo, discountKobo, vatKobo, deliveryKobo, totalKobo });
  console.log("same receipt twice:", JSON.stringify(first.value) === JSON.stringify(second.value), "saved:", saved.length);
}
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
CART-7: charged 2138750 kobo
CART-7: charged 2138750 kobo
CART-8: refused, unknown-product, bad-quantity
{
  subtotalKobo: 2020000,
  discountKobo: 170000,
  vatKobo: 138750,
  deliveryKobo: 150000,
  totalKobo: 2138750
}
same receipt twice: true saved: 2
```

The numbers match the JavaScript version of this checkout, which is the point: the behaviour did not change, only what the compiler knows about it. The refused cart lists both of its problems at once, and `first.value` is only reachable after `first.ok` has been checked.

### Testing the core

Pure steps need no fakes: tests are calls with data. Two kinds of test belong here. Runtime tests check the numbers and the failures. Type tests check the promises the signatures make, with `@ts-expect-error`: the line below it must fail to compile, and if a refactor ever makes it compile (say, someone drops a `readonly`), `tsc` reports the unused directive and the test fails.

pricing.test.ts

```ts
import { addVat, applyBestPromotion, parseCart, priceLines } from "./pricing.js";
import type { PricedQuote, Product, ValidCart } from "./checkout.types.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const rice: Product = { sku: "RICE-5", name: "Rice 5kg", priceKobo: 850000 };
const catalog = new Map([[rice.sku, rice]]);
const parse = parseCart(catalog);
const cart: ValidCart = { cartId: "C1", orderedAt: "2026-09-24T09:00:00Z", lines: [{ product: rice, qty: 2 }] };

check("subtotal", priceLines(cart).subtotalKobo, 1700000);
check("empty cart", parse({ cartId: "C2", orderedAt: "", lines: [] }), { ok: false, error: [{ code: "empty-cart" }] });
check("all problems at once", parse({ cartId: "C3", orderedAt: "", lines: [{ sku: "X", qty: 1 }, { sku: "RICE-5", qty: 1.5 }] }).ok, false);
check("inherited key is not a product", parse({ cartId: "C4", orderedAt: "", lines: [{ sku: "toString", qty: 1 }] }).ok, false);
check("discount capped at subtotal", applyBestPromotion([{ kind: "spend-and-save", minKobo: 0, offKobo: 99999999 }])(priceLines(cart)).discountKobo, 1700000);
check("VAT after discount", addVat(0.075)({ ...priceLines(cart), discountKobo: 700000 }).vatKobo, 75000);

const frozen = Object.freeze({ ...cart, lines: Object.freeze(cart.lines.map((line) => Object.freeze(line))) });
check("pure: same input, same output", JSON.stringify(priceLines(frozen)) === JSON.stringify(priceLines(frozen)), true);

const quote: PricedQuote = priceLines(cart);
// @ts-expect-error: stages are readonly
quote.subtotalKobo = 0;
// @ts-expect-error: VAT needs a discounted quote
addVat(0.075)(quote);
```

Output of `npx tsx pricing.test.ts` and of the browser terminal

```ts
PASS subtotal -> 1700000
PASS empty cart -> {"ok":false,"error":[{"code":"empty-cart"}]}
PASS all problems at once -> false
PASS inherited key is not a product -> false
PASS discount capped at subtotal -> 1700000
PASS VAT after discount -> 75000
PASS pure: same input, same output -> true
```

The two lines under `@ts-expect-error` still *run* (types are erased), which is why the assignment is aimed at a throwaway `quote` at the very end. The type checker is what tests them. [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) covers type tests in depth.

### In production

- **Readonly types plus one runtime freeze.** Types stop your own code. Freezing configuration and catalogue data once at start-up (in development, or everywhere if you can afford it) catches the JavaScript and `as` casts that types cannot.
- **Copying is cheap until it is in a loop.** Each stage above copies one object with spread; the lines are shared, not copied (structural sharing). Building an array by spreading it on every step of a loop is still O(n²), as [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional#immutability) measured.
- **Throw at the edges, return inside.** Libraries, `JSON.parse` and database drivers throw. Convert with `tryCatch` where they are called, and keep `Result` for failures the caller is expected to handle. Programming errors (an impossible state, a broken invariant) should still throw.
- **Libraries.** `neverthrow` provides a Result type with methods; Effect is a complete functional runtime with typed errors, dependency injection and concurrency. Both are good; both are a team-wide commitment. The dozen lines in `fp.ts` are often enough.
- **Readability wins.** A plain loop inside a pure function is still pure. Use `pipe`, Option and `match` where they make the code clearer to the next reader, not everywhere they fit.

## Practice

TRY IT YOURSELF

### Make a function honest

This helper returns the three best-selling products. It compiles, and it has a bug your caller will not expect. Find it, then change the *signature* so the compiler would have caught it, and fix the body.

top-sellers.ts

```ts
function topSellers(sales: { sku: string; units: number }[]): string[] {
  return sales.sort((a, b) => b.units - a.units).slice(0, 3).map((s) => s.sku);
}
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`readonly Sale[]` has no `sort`. `toSorted` is its non-mutating twin: it returns a new, sorted array and leaves the original alone.

HINT 2

`sales.toSorted((a, b) => b.units - a.units).slice(0, 3).map((s) => s.sku)`

SOLUTION

top-sellers-fixed.ts

```ts
interface Sale {
  readonly sku: string;
  readonly units: number;
}

function topSellers(sales: readonly Sale[]): readonly string[] {
  return sales.toSorted((a, b) => b.units - a.units).slice(0, 3).map((s) => s.sku);
}

const sales: readonly Sale[] = [
  { sku: "OIL-1", units: 40 },
  { sku: "RICE-5", units: 95 },
  { sku: "SALT", units: 12 },
  { sku: "SUGAR-1", units: 60 },
];

console.log(topSellers(sales), sales[0].sku);
```

Output of `npx tsx top-sellers-fixed.ts` and of the browser terminal

```json
[ 'RICE-5', 'SUGAR-1', 'OIL-1' ] OIL-1
```

`sort` reordered the caller's array. With `readonly Sale[]` as the parameter type, `sort` does not exist on the type, the compiler rejects the original body, and `toSorted` is the natural fix. The `readonly` properties on `Sale` stop the next person from "fixing" a unit count inside the helper.

TRY IT YOURSELF

### Traverse a list of results

Write `all<T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E>`. It returns every value when all results are `ok`, and the first error otherwise. Use it to parse three quantities typed by a customer. (Functional libraries call this `sequence` or `all`.)

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop over `results` with a plain `for` loop. For each one, check `!result.ok` first and return it immediately if so.

HINT 2

When a result is `ok`, push `result.value` onto a local `values: T[]`. After the loop finishes (nothing failed), return `ok(values)`.

SOLUTION

all.ts

```ts
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

function all<T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

const parseQty = (text: string): Result<number, string> => {
  const qty = Number(text);
  return Number.isInteger(qty) && qty > 0 ? ok(qty) : err(`not a quantity: "${text}"`);
};

console.log(all(["2", "1", "5"].map(parseQty)));
console.log(all(["2", "two", "-1"].map(parseQty)));
```

Output of `npx tsx all.ts` and of the browser terminal

```json
{ ok: true, value: [ 2, 1, 5 ] }
{ ok: false, error: 'not a quantity: "two"' }
```

`values` is a mutable local array: the function created it, nothing outside sees it until it returns, and it is returned as `readonly T[]`. That is still a pure function. `return result` works in the failure branch because a failed `Result<T, E>` has no value, so it is also a failed `Result<readonly T[], E>`.

TRY IT YOURSELF

### A new kind of promotion

Add a `{ kind: "fixed-off"; sku: string; offKobo: number }` promotion (a fixed amount off each unit of one product, never below zero) to the `Promotion` type of the `adt` project. What does the compiler do before you change `discountKobo` and `describe`? Then implement it.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Sum, over the matching lines, the smaller of the voucher amount and that line's unit price, times the quantity: `Math.min(promo.offKobo, l.unitKobo) * l.qty`.

HINT 2

`return matching.reduce((sum, l) => sum + Math.min(promo.offKobo, l.unitKobo) * l.qty, 0);`

SOLUTION

With only the type changed, `tsc` reports `discountKobo` (the switch no longer returns on every path, TS2366) and `describe` (the handlers object is missing `"fixed-off"`, TS2741). Every interpreter is listed for you; nothing is silently skipped. The finished version:

fixed-off.ts

```ts
type Promotion =
  | { readonly kind: "percent-off"; readonly sku: string; readonly percent: number }
  | { readonly kind: "fixed-off"; readonly sku: string; readonly offKobo: number };

interface Line {
  readonly sku: string;
  readonly qty: number;
  readonly unitKobo: number;
}

function discountKobo(promo: Promotion, lines: readonly Line[]): number {
  const matching = lines.filter((line) => line.sku === promo.sku);
  switch (promo.kind) {
    case "percent-off":
      return matching.reduce((sum, l) => sum + Math.round((l.unitKobo * l.qty * promo.percent) / 100), 0);
    case "fixed-off":
      return matching.reduce((sum, l) => sum + Math.min(promo.offKobo, l.unitKobo) * l.qty, 0);
  }
}

const lines: readonly Line[] = [{ sku: "SALT", qty: 3, unitKobo: 20000 }];
console.log(discountKobo({ kind: "fixed-off", sku: "SALT", offKobo: 5000 }, lines));
console.log(discountKobo({ kind: "fixed-off", sku: "SALT", offKobo: 50000 }, lines));
```

Output of `npx tsx fixed-off.ts` and of the browser terminal

```ts
15000
60000
```

`Math.min(promo.offKobo, l.unitKobo)` keeps a large voucher from making a unit's price negative: ₦500 off three ₦200 bags of salt is ₦600, not ₦1,500.

## Recap

- TypeScript types cannot see effects: two functions with the same signature can differ in whether they log, read the clock or change their input. A call is referentially transparent when it can be replaced by its result; only such calls are safe to cache.
- `readonly` properties, `readonly T[]`/`ReadonlyArray`, `ReadonlyMap`, `ReadonlySet` and `as const` let signatures promise "I will not change this". Mutable fits readonly, not the reverse: accept readonly parameters. Readonly is shallow, is only a view, and is erased at runtime; use a deep type or `Object.freeze` where that matters.
- A typed `pipe` is a list of overloads that link each step's output to the next step's input; swapped steps become compile errors, and results assemble their own types.
- Use `T | undefined` for most missing values. Use an Option type when absence can nest, because `T | undefined | undefined` collapses. Use Result with data-last helpers for expected failures, `tryCatch` at the boundary with throwing code, and collect errors when checks are independent.
- Algebraic data types are products (objects, tuples: values multiply) and sums (unions: values add). Count the states a type allows and make it match the business. ADTs are data: storable, showable, and exhaustively matched.
- Parse, don't validate: return a new type that carries the proof. Give each pipeline stage its own type and the compiler checks the order of the steps.

Next: [The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system), where you learn exactly when one type fits another, and why the stage types above are only "partly" safe.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
