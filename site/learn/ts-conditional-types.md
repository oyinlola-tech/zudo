---
title: "Conditional types — ZudoJS Academy"
description: "Write types that choose a result from their input with extends, infer and recursion, control distribution over unions, and build a retrying payments client."
source: https://zudojs.oyinlola.site/learn/ts-conditional-types
---

LEVEL 6 · LESSON 4 OF 22

Type operators Advanced

# Conditional types

Write types that choose a result from their input with extends, infer and recursion, control distribution over unions, and build a retrying payments client.

- **55 min** to read and try
- **You need:** Type operators, Utility types and Mapped types, plus Async TypeScript
- **You build:** A retry wrapper for a payments client whose return types are computed with conditional types, so Promise<Promise<Payment>> can never appear

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read and write conditional types, and predict their result for literals, objects, any, unknown, never and boolean
- Explain distribution over unions and switch it off with [T] extends [U]
- Capture parts of a type with infer, including constrained and repeated infer
- Write recursive conditional types such as Unwrap<Promise<Promise<User>>> and know their limits
- Type a generic function whose return type depends on its argument
- Test conditional types with Expect, Equal and @ts-expect-error

## A retry wrapper that lied about its type

A payments service talks to a card processor over the network. Networks drop connections, so a developer writes a small generic helper: give it any function, and it returns a new function that tries up to three times before giving up. It is typed with the tools from [Generics](https://zudojs.oyinlola.site/learn/ts-generics): `A` is the argument list, `R` the result, and the wrapped function returns `Promise<R>` because retrying is asynchronous.

retry.ts

```ts
interface Payment {
  reference: string;
  amountKobo: number;
  status: "success" | "failed";
}

async function verifyPayment(reference: string): Promise<Payment> {
  return { reference, amountKobo: 1_500_000, status: "success" };
}

function withRetry<A extends unknown[], R>(fn: (...args: A) => R, attempts = 3): (...args: A) => Promise<R> {
  return async (...args) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}

const verify = withRetry(verifyPayment);
verify("PSK_1042").then((payment) => console.log(payment.status));
```

What `npx tsc --noEmit` prints

```ts
retry.ts:26:58 - error TS2339: Property 'status' does not exist on type 'Promise<Payment>'.

26 verify("PSK_1042").then((payment) => console.log(payment.status));
                                                            ~~~~~~

  retry.ts:26:58 - Did you forget to use 'await'?
    26 verify("PSK_1042").then((payment) => console.log(payment.status));
                                                                ~~~~~~


Found 1 error in retry.ts:26
```

The code is right and the compiler refuses it. `verifyPayment` already returns `Promise<Payment>`, so `R` is `Promise<Payment>` and the wrapper claims to return `Promise<Promise<Payment>>`. The `.then` callback is then told it receives a `Promise<Payment>`, and the compiler's hint, "Did you forget to use 'await'?", sends you looking for a bug in the wrong place. At runtime that never happens, because JavaScript promises flatten: a promise resolved with another promise waits for it and takes its value.

flatten.ts

```ts
const nested = Promise.resolve(Promise.resolve(Promise.resolve(1_500_000)));
nested.then((value) => console.log(typeof value, value));
```

Output of `npx tsx flatten.ts` and of the browser terminal

```ts
number 1500000
```

So the type needs a rule the generic `Promise<R>` cannot express: "a promise of `R`, *but if `R` is already a promise, a promise of whatever is inside it*". A type whose result depends on a test of its input is a **conditional type**. ([Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async#awaited) gave you the ready-made answer, `Promise<Awaited<R>>`; this lesson shows how `Awaited` and types like it are built.) [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#conditional) showed the syntax, and [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#tools) used it to rebuild the built-ins. This lesson covers how conditional types really evaluate, the union behaviour that surprises everyone, `infer` in all its forms, recursion, and how to test them. At the end you fix this wrapper and use it to retry a whole payments client.

## The shape: T extends U ? X : Y

A conditional type looks like JavaScript's `? :` operator, with a type test in place of the boolean:

```ts
  Check  extends  Constraint  ?  TrueType  :  FalseType
    |                 |
    |                 +-- the type it is compared with
    +-- the type being tested
```

The test is **assignability**, the same question the compiler asks when you write `const x: Constraint = valueOfTypeCheck`: "is every value of `Check` also a value of `Constraint`?" It is not equality. A narrow type extends a wider one; a wider one does not extend a narrow one. To see the results, this lesson uses the type-level test helpers from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#typeof): `Equal<A, B>` is `true` only for identical types, and `Expect` refuses anything but `true`. A file full of `Expect` lines that compiles is a file full of proven facts.

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

basics.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type IsText<T> = T extends string ? "text" : "not text";

interface Account {
  id: string;
  balanceKobo: number;
}

type B1 = Expect<Equal<IsText<"NGN">, "text">>;
type B2 = Expect<Equal<IsText<string>, "text">>;
type B3 = Expect<Equal<IsText<42>, "not text">>;
type B4 = Expect<Equal<IsText<string[]>, "not text">>;

type HasBalance<T> = T extends { balanceKobo: number } ? "has balance" : "no balance";

type B5 = Expect<Equal<HasBalance<Account>, "has balance">>;
type B6 = Expect<Equal<HasBalance<Account & { frozen: boolean }>, "has balance">>;
type B7 = Expect<Equal<HasBalance<{ id: string }>, "no balance">>;
type B8 = Expect<Equal<HasBalance<{ balanceKobo?: number }>, "no balance">>;

console.log("8 facts about extends compiled");
```

Output of `npx tsx basics.ts` and of the browser terminal

```ts
8 facts about extends compiled
```

- A literal type extends its primitive (`B1`): `"NGN"` is one of the strings.
- Object types are compared by shape, the structural typing you know from [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces). An account with an extra `frozen` field still has a `balanceKobo`, so it extends (`B6`). Extra properties never make a type fail an `extends` test.
- An optional `balanceKobo?: number` might be missing, so it does not extend a required one (`B8`).

Two things make a conditional type more than a ternary. First, the **check type** is usually a type parameter, so the answer is computed separately for every use. Second, the true branch knows the test passed: inside `T extends { balanceKobo: number } ? … : …`, the true branch may use `T["balanceKobo"]`, just as an `if` narrows a value.

### any, unknown, never and boolean

Four types behave in ways you would not guess from the ternary picture. Predict each line before you read the explanation:

special.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type IsText<T> = T extends string ? "text" : "not text";
type IsApproved<T> = T extends true ? "approved" : "pending";

type S1 = Expect<Equal<IsText<unknown>, "not text">>;
type S2 = Expect<Equal<IsText<any>, "text" | "not text">>;
type S3 = Expect<Equal<IsText<never>, never>>;
type S4 = Expect<Equal<IsApproved<boolean>, "approved" | "pending">>;

console.log("the four surprises compiled");
```

Output of `npx tsx special.ts` and of the browser terminal

```ts
the four surprises compiled
```

- `unknown` could be anything, so it is not assignable to `string`: false branch (`S1`).
- `any` is special: it might pass and might fail, so TypeScript returns the union of **both** branches (`S2`). One `any` flowing into a conditional type quietly makes its result wide.
- `never` gives `never`, not either branch (`S3`). And `boolean` gives both branches (`S4`). Both come from the next section's rule, because `never` is the empty union and `boolean` is the union `true | false`.

## Distribution over unions

When the check type is a bare type parameter and you pass it a union, the conditional type runs once **per member** and unions the results. This is called a **distributive conditional type**. You used it in [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#union-filters) to rebuild `Exclude`; here is the mechanism in slow motion, and the reason `boolean` produces two answers:

distribute.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled";

type ToList<T> = T extends unknown ? T[] : never;
type D1 = Expect<Equal<ToList<string | number>, string[] | number[]>>;

type MyExclude<T, U> = T extends U ? never : T;
type MyExtract<T, U> = T extends U ? T : never;
type MyNonNullable<T> = T extends null | undefined ? never : T;

type OpenStatus = MyExclude<OrderStatus, "delivered" | "cancelled">;
type D2 = Expect<Equal<OpenStatus, "pending" | "paid" | "shipped">>;
type D3 = Expect<Equal<MyExtract<OrderStatus, "paid" | "refunded">, "paid">>;
type D4 = Expect<Equal<MyNonNullable<string | null | undefined>, string>>;
type D5 = Expect<Equal<MyExclude<OrderStatus, "delivered">, Exclude<OrderStatus, "delivered">>>;

const open: OpenStatus[] = ["pending", "paid", "shipped"];
console.log(open.join(" -> "));
```

Output of `npx tsx distribute.ts` and of the browser terminal

```ts
pending -> paid -> shipped
```

Walk through `MyExclude<OrderStatus, "delivered" | "cancelled">` by hand:

```ts
"pending"   extends "delivered" | "cancelled" ?  never : "pending"    ->  "pending"
"paid"      extends "delivered" | "cancelled" ?  never : "paid"       ->  "paid"
"shipped"   extends "delivered" | "cancelled" ?  never : "shipped"    ->  "shipped"
"delivered" extends "delivered" | "cancelled" ?  never : "delivered"  ->  never
"cancelled" extends "delivered" | "cancelled" ?  never : "cancelled"  ->  never
                                                          union of all:  "pending" | "paid" | "shipped"
```

`never` is the empty set, so it vanishes from a union: returning `never` is how a distributive type *filters*. That also explains `IsText<never>` from before: a union with zero members is split into zero runs, and the union of zero results is `never`.

### When distribution happens, and when it does not

Distribution happens only when the type being tested is a **naked** type parameter: just `T`, not `T[]`, not `[T]`, not `Promise<T>`. It also happens only when a generic type is instantiated; a conditional type written directly on a union does not distribute. Wrapping both sides in a one-element tuple is the standard way to switch it off:

no-distribute.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type IsText<T> = T extends string ? true : false;
type IsOnlyText<T> = [T] extends [string] ? true : false;

type N1 = Expect<Equal<IsText<"NGN" | 42>, boolean>>;
type N2 = Expect<Equal<IsOnlyText<"NGN" | 42>, false>>;
type N3 = Expect<Equal<IsOnlyText<"NGN" | "USD">, true>>;

type ToListWhole<T> = [T] extends [unknown] ? T[] : never;
type N4 = Expect<Equal<ToListWhole<string | number>, (string | number)[]>>;

type IsNeverWrong<T> = T extends never ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
type N5 = Expect<Equal<IsNeverWrong<never>, never>>;
type N6 = Expect<Equal<IsNever<never>, true>>;
type N7 = Expect<Equal<IsNever<string>, false>>;

type Direct = "NGN" | 42 extends string ? true : false;
type N8 = Expect<Equal<Direct, false>>;

console.log("distribution switched off where it should be");
```

Output of `npx tsx no-distribute.ts` and of the browser terminal

```ts
distribution switched off where it should be
```

- `IsText<"NGN" | 42>` asks the question twice and answers `true | false`, which is `boolean` (`N1`). That is rarely what "is it text?" means. The tuple version asks once about the whole union (`N2`, `N3`).
- `ToList` gives "a list of strings or a list of numbers"; `ToListWhole` gives "a list that may mix both" (`N4`). Both are useful. Decide which one you mean.
- Testing for `never` needs the tuple form (`N5`, `N6`). The naive version distributes over zero members and answers `never`, which is neither `true` nor `false`.
- `Direct` is not generic, so nothing distributes: the whole union does not extend `string` (`N8`).

> TIP
>
> Decide on distribution for every conditional type you write. If the type filters or transforms members one by one (`Exclude`, `NonNullable`, "wrap each member"), leave `T` naked. If it answers a yes/no question about the whole type, wrap it: `[T] extends [U]`.

## infer: capturing part of a type

Many useful questions are not yes/no but "what is inside?": the element type of an array, the value inside a promise, the first parameter of a handler. Inside the `extends` clause, `infer X` declares a new type variable that TypeScript fills in by matching, like destructuring on values. The captured name is available only in the true branch:

infer.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Payment {
  reference: string;
  amountKobo: number;
}

type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type PromiseValue<T> = T extends Promise<infer V> ? V : T;
type FirstArg<F> = F extends (first: infer P, ...rest: never[]) => unknown ? P : never;
type ResultOf<F> = F extends (...args: never[]) => infer R ? R : never;

function refund(payment: Payment, reason: string): Promise<boolean> {
  return Promise.resolve(reason.length > 0 && payment.amountKobo > 0);
}

type I1 = Expect<Equal<ElementOf<Payment[]>, Payment>>;
type I2 = Expect<Equal<ElementOf<readonly ["NGN", "USD"]>, "NGN" | "USD">>;
type I3 = Expect<Equal<PromiseValue<Promise<Payment>>, Payment>>;
type I4 = Expect<Equal<PromiseValue<Payment>, Payment>>;
type I5 = Expect<Equal<FirstArg<typeof refund>, Payment>>;
type I6 = Expect<Equal<ResultOf<typeof refund>, Promise<boolean>>>;
type I7 = Expect<Equal<ResultOf<string>, never>>;

console.log(await refund({ reference: "PSK_1042", amountKobo: 1_500_000 }, "duplicate charge"));
```

Output of `npx tsx infer.ts` and of the browser terminal

```ts
true
```

`ResultOf` is how the built-in `ReturnType` works, and `ElementOf` is the `T[number]` you know from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#indexed-access), but written as a pattern. [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#functions-classes) rebuilt the others this way, and showed that `infer` sees only the last overload of a function. Notice the constraint `(...args: never[]) => unknown`: a function type that accepts *any* parameter list must use `never[]`, because parameters are checked in the opposite direction to results ([Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions) explains why).

### Patterns with tuples and constraints

`infer` works anywhere a type can appear, including inside tuple patterns with rest elements. You can also constrain what it captures with `infer X extends C`: if the captured part does not fit `C`, the match fails and the false branch is taken:

infer-tuples.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Last<T> = T extends readonly [...unknown[], infer L] ? L : never;
type Head<T> = T extends readonly [infer H, ...unknown[]] ? H : never;
type CurrencyFirst<T> = T extends readonly [infer C extends string, ...unknown[]] ? C : never;

type Transfer = [from: string, to: string, amountKobo: number];

type T1 = Expect<Equal<Last<Transfer>, number>>;
type T2 = Expect<Equal<Head<Transfer>, string>>;
type T3 = Expect<Equal<Last<[]>, never>>;
type T4 = Expect<Equal<CurrencyFirst<["NGN", 1_500_000]>, "NGN">>;
type T5 = Expect<Equal<CurrencyFirst<[1_500_000, "NGN"]>, never>>;

console.log("tuple patterns compiled");
```

Output of `npx tsx infer-tuples.ts` and of the browser terminal

```ts
tuple patterns compiled
```

### When infer finds two candidates

The same `infer` name may appear twice in one pattern. Then TypeScript has two candidates and must combine them, and the way it combines them depends on the position. In ordinary (output) positions it takes the union; in parameter (input) positions it takes the intersection, because a value passed to both functions must satisfy both:

infer-twice.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Fields<T> = T extends { success: infer V; failure: infer V } ? V : never;
type Payload<T> = T extends { onSuccess: (event: infer P) => void; onFailure: (event: infer P) => void } ? P : never;

interface Callbacks {
  onSuccess: (event: { reference: string }) => void;
  onFailure: (event: { attempt: number }) => void;
}

type C1 = Expect<Equal<Fields<{ success: "paid"; failure: 402 }>, "paid" | 402>>;
type C2 = Expect<Equal<Payload<Callbacks>, { reference: string } & { attempt: number }>>;

console.log("two candidates: union out, intersection in");
```

Output of `npx tsx infer-twice.ts` and of the browser terminal

```ts
two candidates: union out, intersection in
```

You will rarely write this, but when a library type produces a surprising intersection, this rule is usually the reason.

## Recursive conditional types: Unwrap<Promise<Promise<User>>>

A conditional type may refer to itself in a branch. That is how you peel a type layer by layer, exactly like a recursive function peels a nested array in [Recursion](https://zudojs.oyinlola.site/learn/js-recursion): a base case that stops, and a recursive case that is one layer smaller.

unwrap.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface User {
  id: string;
  name: string;
}

type Unwrap<T> = T extends Promise<infer V> ? Unwrap<V> : T;

type U1 = Expect<Equal<Unwrap<Promise<Promise<User>>>, User>>;
type U2 = Expect<Equal<Unwrap<Promise<Promise<Promise<number>>>>, number>>;
type U3 = Expect<Equal<Unwrap<User>, User>>;
type U4 = Expect<Equal<Unwrap<Promise<User> | null>, User | null>>;
type U5 = Expect<Equal<Unwrap<PromiseLike<User>>, PromiseLike<User>>>;
type U6 = Expect<Equal<Awaited<PromiseLike<User>>, User>>;

type Flatten<T> = T extends readonly (infer E)[] ? Flatten<E> : T;
type U7 = Expect<Equal<Flatten<number[][][]>, number>>;

async function loadUser(): Promise<Promise<User>> {
  return { id: "usr_7", name: "Chiamaka Eze" };
}
const user: Unwrap<ReturnType<typeof loadUser>> = await loadUser();
console.log(user.name);
```

Output of `npx tsx unwrap.ts` and of the browser terminal

```ts
Chiamaka Eze
```

Evaluating `Unwrap<Promise<Promise<User>>>` step by step:

```ts
Unwrap<Promise<Promise<User>>>   matches Promise<infer V>, V = Promise<User>  -> Unwrap<Promise<User>>
Unwrap<Promise<User>>            matches Promise<infer V>, V = User           -> Unwrap<User>
Unwrap<User>                     does not match                              -> User   (base case)
```

- It distributes (`U4`): `Promise<User> | null` unwraps member by member, which is what you want for "maybe a promise".
- It only knows the real `Promise` class (`U5`). `await` works on any **thenable**, any object with a `then` method, and the built-in `Awaited` models that (`U6`). In real code, use `Awaited`; [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#awaited) lists the other details it gets right. [Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async#awaited) shows where `Awaited` appears in the standard library.
- `Flatten` is the same idea for nested arrays.

### How deep can it go?

The compiler limits recursion so a type cannot hang it. Here is a type that builds a tuple of length `N` by adding one element per step, the classic way to count at the type level:

depth.ts

```ts
type TupleOf<N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : TupleOf<N, [...Acc, unknown]>;

type Five = TupleOf<5>["length"];
const five: Five = 5;

type Instalments = TupleOf<2000>;
```

What `npx tsc --noEmit` prints

```ts
depth.ts:7:20 - error TS2589: Type instantiation is excessively deep and possibly infinite.

7 type Instalments = TupleOf<2000>;
                     ~~~~~~~~~~~~~


Found 1 error in depth.ts:7
```

`TupleOf<5>` works, and `TupleOf<2000>` hits the limit. Because the recursive call is the entire branch (**tail position**), TypeScript can evaluate it in a loop, which allows about a thousand steps. A recursive call wrapped in something else, such as `[0, ...TupleOf<…>]`, must keep every step open and fails far earlier. TS2589 in real code almost always means "a type is recursing on data that is too big, or forever". The fix is a smaller problem, not a cleverer type.

## Nested conditionals: a type-level switch

Chaining conditionals in the false branch gives you a `switch` over types. A shop's admin panel generates edit forms from its data types: text boxes for strings, number inputs for numbers, checkboxes for booleans, date pickers for dates, and a tag editor for lists of strings. Combined with the mapped types from [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types), one conditional type describes the whole form:

form.ts

```ts
type InputKind<T> =
  T extends Date ? "date"
  : T extends boolean ? "checkbox"
  : T extends number ? "number"
  : T extends string ? "text"
  : T extends readonly string[] ? "tags"
  : "unsupported";

type FormFor<T> = { readonly [K in keyof T]-?: InputKind<NonNullable<T[K]>> };

interface Product {
  name: string;
  priceKobo: number;
  inStock: boolean;
  launchDate?: Date;
  tags: string[];
}

const productForm: FormFor<Product> = {
  name: "text",
  priceKobo: "number",
  inStock: "checkbox",
  launchDate: "date",
  tags: "tags",
};

for (const [field, kind] of Object.entries(productForm)) {
  console.log(`${field.padEnd(10)} <input type="${kind}">`);
}
```

Output of `npx tsx form.ts` and of the browser terminal

```ts
name       <input type="text">
priceKobo  <input type="number">
inStock    <input type="checkbox">
launchDate <input type="date">
tags       <input type="tags">
```

Every field of `productForm` is checked: write `priceKobo: "text"` and it does not compile, add a `weightGrams: number` field to `Product` and the form object must gain a `"number"` entry. Two details matter:

- `NonNullable<T[K]>` removes the `undefined` of the optional `launchDate`. Without it, the distributive `InputKind` would answer `"date" | "unsupported"`, because `undefined` matches no branch.
- The **order** of the branches matters, just like the order of `if` statements. The first matching branch wins.

Here is the order bug. A `Date` is an object, so a branch for objects placed first swallows it:

order.ts

```ts
type WrongKind<T> =
  T extends object ? "group"
  : T extends Date ? "date"
  : "other";

const launch: WrongKind<Date> = "date";
```

What `npx tsc --noEmit` prints

```ts
order.ts:6:7 - error TS2322: Type '"date"' is not assignable to type '"group"'.

6 const launch: WrongKind<Date> = "date";
        ~~~~~~


Found 1 error in order.ts:6
```

The general rule: put the **most specific** tests first. `boolean` before a broader union that contains it, `Date` and arrays before `object`, literal types before their primitive.

## Conditional types in function signatures

A conditional *return* type lets a function's result depend on its argument. A currency formatter returns a string for one amount and a list of strings for a list:

format.ts

```ts
type Formatted<T> = T extends readonly number[] ? string[] : string;

function formatNaira<T extends number | readonly number[]>(kobo: T): Formatted<T> {
  if (typeof kobo === "number") {
    return `₦${(kobo / 100).toFixed(2)}`;
  }
  return kobo.map((k) => `₦${(k / 100).toFixed(2)}`);
}
```

What `npx tsc --noEmit` prints

```ts
format.ts:5:5 - error TS2322: Type '`₦${string}`' is not assignable to type 'Formatted<T>'.

5     return `₦${(kobo / 100).toFixed(2)}`;
      ~~~~~~

format.ts:7:3 - error TS2322: Type 'string[]' is not assignable to type 'Formatted<T>'.

7   return kobo.map((k) => `₦${(k / 100).toFixed(2)}`);
    ~~~~~~


Found 2 errors in the same file, starting at: format.ts:5
```

The narrowing inside the function works on the *value* `kobo`, but the return type mentions the *type* `T`, and narrowing a value does not narrow a type parameter. While `T` is unknown, `Formatted<T>` is **deferred**: TypeScript cannot pick a branch, so almost nothing is assignable to it. You have two honest ways out.

### Way 1: overloads

For a handful of fixed cases, overload signatures describe each case directly, and callers never see a conditional type at all. [Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions#overloads) covers overloads in depth.

format-overloads.ts

```ts
function formatNaira(kobo: number): string;
function formatNaira(kobo: readonly number[]): string[];
function formatNaira(kobo: number | readonly number[]): string | string[] {
  if (typeof kobo === "number") return `₦${(kobo / 100).toFixed(2)}`;
  return kobo.map((k) => `₦${(k / 100).toFixed(2)}`);
}

const one = formatNaira(150_050);
const many = formatNaira([150_050, 99_900]);
console.log(one.toUpperCase(), many.length);
```

Output of `npx tsx format-overloads.ts` and of the browser terminal

```ts
₦1500.50 2
```

### Way 2: a conditional type for callers, one checked cast inside

When the result must follow any input, including unions and generic callers, keep the conditional return type and admit that the implementation cannot be checked against it. Put the single assertion in one place, keep the function small, and test it:

format-conditional.ts

```ts
type Formatted<T> = T extends readonly number[] ? string[] : string;

function formatNaira<T extends number | readonly number[]>(kobo: T): Formatted<T> {
  const one = (k: number) => `₦${(k / 100).toFixed(2)}`;
  const result = typeof kobo === "number" ? one(kobo) : kobo.map(one);
  return result as Formatted<T>;
}

function formatAll<T extends number | readonly number[]>(values: T[]): Formatted<T>[] {
  return values.map((value) => formatNaira(value));
}

console.log(formatNaira(150_050), formatNaira([100, 250]));
console.log(formatAll([[100], [200, 300]]));
```

Output of `npx tsx format-conditional.ts` and of the browser terminal

```ts
₦1500.50 [ '₦1.00', '₦2.50' ]
[ [ '₦1.00' ], [ '₦2.00', '₦3.00' ] ]
```

`formatAll` shows what the conditional type buys you over overloads: a generic caller can pass its own `T` straight through, and the result type follows. With overloads, `formatAll` would not compile, because none of the overloads accepts `number | readonly number[]` as one argument.

> WATCH OUT
>
> The `as` in way 2 is a promise you make, not a check. If the implementation returns the wrong thing for one branch, the compiler will not notice. That is why the testing section below tests both branches of every conditional type that has a hand-written implementation.

## Build: a retrying payments client

REASON IT OUT

### Before you fix the wrapper

You want `withRetry` to return the right type for sync and async functions, and then a `retryAll(client)` that wraps every method of a payments client at once. Before reading the code, think:

- What should the wrapped function return when `fn` returns `Payment`? `Promise<Payment>`? `Promise<Promise<Payment>>`? A union of promises?
- A client object has methods and plain data (a base URL). How should the type treat each property?
- Which operations are safe to retry? What happens if `charge` is retried after the first attempt actually reached the bank?
- The type says "every method is wrapped". Can the runtime break that promise?

**Show the reasoning**

The result should be a promise of the fully unwrapped value: `Promise<Unwrap<R>>`, whatever `R` is. For the client, a mapped type visits every key, and a conditional type with `infer` decides per property: functions become "same arguments, promise of the unwrapped result", everything else stays as it is. Retrying is only safe for **idempotent** operations, ones where doing them twice has the same effect as once: verifying a payment, reading a balance. A charge that timed out may have succeeded, so retrying it can charge the customer twice unless the processor supports idempotency keys. And yes, the runtime can break the type's promise: the mapped type sees every method in the type, while `Object.keys` at runtime only sees the object's own properties. Class methods live on the prototype, so they would be missed. The build below shows that failure and guards against it.

First the types and the two functions:

retry.ts

```ts
export type Unwrap<T> = T extends PromiseLike<infer V> ? Unwrap<V> : T;

export type Retried<T> = {
  readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Unwrap<R>> : T[K];
};

export function withRetry<A extends unknown[], R>(fn: (...args: A) => R, attempts = 3): (...args: A) => Promise<Unwrap<R>> {
  return async (...args) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return (await fn(...args)) as Unwrap<R>;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}

export function retryAll<T extends object>(client: T, attempts = 3): Retried<T> {
  if (Object.getPrototypeOf(client) !== Object.prototype) {
    throw new TypeError("retryAll needs a plain object; class methods live on the prototype");
  }
  const source = client as Record<string, unknown>;
  const wrapped: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    wrapped[key] = typeof value === "function"
      ? withRetry((...args: unknown[]): unknown => value.apply(client, args), attempts)
      : value;
  }
  return wrapped as Retried<T>;
}
```

- `Unwrap` now matches `PromiseLike`, so thenables from other libraries unwrap too.
- `Retried<T>` is a mapped type whose value is a conditional type. `infer A` keeps the exact parameter list, labels included, and `infer R` the result.
- The two `as` casts sit where runtime code meets the computed types: `await` produces the unwrapped value, and the loop builds exactly the object `Retried<T>` describes. The `getPrototypeOf` check makes sure the runtime can keep that promise.

Now a Paystack-style client with an async method, a sync method and a plain property. The `verify` method fails twice before it succeeds, like a flaky network:

client.ts

```ts
import { retryAll } from "./retry.js";

interface Payment {
  reference: string;
  amountKobo: number;
  status: "success" | "failed";
}

let dropsLeft = 2;
const paymentsApi = {
  baseUrl: "https://api.example-payments.ng",
  async verify(reference: string): Promise<Payment> {
    if (dropsLeft-- > 0) throw new Error("ECONNRESET");
    return { reference, amountKobo: 1_500_000, status: "success" };
  },
  feeFor(amountKobo: number): number {
    return Math.min(Math.round(amountKobo * 0.015), 200_000);
  },
};

const payments = retryAll(paymentsApi);
const payment = await payments.verify("PSK_1042");
console.log(payment.status, payment.amountKobo);
payments.verify("PSK_1043").then((p) => console.log("then:", p.reference));
console.log("fee:", await payments.feeFor(1_500_000), "from", payments.baseUrl);
```

Output of `npx tsx client.ts` and of the browser terminal

```ts
success 1500000
then: PSK_1043
fee: 22500 from https://api.example-payments.ng
```

The `.then` call that failed at the start of the lesson now compiles: `p` is a `Payment`. Even the synchronous `feeFor` returns `Promise<number>`, which is honest, since the wrapper is always async. And the compiler still guards every call:

misuse.ts

```ts
import { retryAll } from "./retry.js";

const payments = retryAll({
  baseUrl: "https://api.example-payments.ng",
  feeFor(amountKobo: number): number {
    return Math.round(amountKobo * 0.015);
  },
});

payments.feeFor("1500000");
const fee: number = payments.feeFor(1_500_000);
payments.baseUrl();
```

What `npx tsc --noEmit` prints

```ts
misuse.ts:10:17 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

10 payments.feeFor("1500000");
                   ~~~~~~~~~

misuse.ts:11:7 - error TS2322: Type 'Promise<number>' is not assignable to type 'number'.

11 const fee: number = payments.feeFor(1_500_000);
         ~~~

misuse.ts:12:10 - error TS2349: This expression is not callable.
  Type 'String' has no call signatures.

12 payments.baseUrl();
            ~~~~~~~


Found 3 errors in the same file, starting at: misuse.ts:10
```

Wrong argument types are refused because `infer A` kept the parameter list, a promise is not a number, and the plain `baseUrl` property stayed a string rather than becoming a function. Finally, the runtime guard:

class-client.ts

```ts
import { retryAll } from "./retry.js";

class LedgerClient {
  balance(accountId: string): number {
    return accountId === "acc_1" ? 2_500_000 : 0;
  }
}

try {
  const ledger = retryAll(new LedgerClient());
  console.log(await ledger.balance("acc_1"));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx class-client.ts` and of the browser terminal

```ts
TypeError: retryAll needs a plain object; class methods live on the prototype
```

Without that guard, `retryAll(new LedgerClient())` would type-check, and `ledger.balance` would be `undefined` at runtime: `Object.keys` does not see prototype methods. A computed type is only as true as the code that produces the value. Where the two can disagree, check at runtime.

## Common mistakes

| Mistake | What you get | Fix |
| --- | --- | --- |
| Reading `extends` as "equals" | `Account & { frozen: boolean }` passes a test meant for `Account` | Remember it is assignability; use `Equal` for equality |
| A yes/no question with a naked `T` | `boolean` for a union input | `[T] extends [U]` |
| Testing for `never` with `T extends never` | `never`, not `true` | `[T] extends [never]` |
| `any` reaching a conditional type | Both branches, silently | Keep `any` out; use `unknown` |
| Broad branch first (`object` before `Date`) | The specific branch is never reached | Most specific test first |
| Optional properties in a distributive type | An extra branch for `undefined` | `NonNullable<T[K]>` or a `-?` mapping |
| Returning a value from a function typed with a conditional return type | TS2322: not assignable to the deferred type | Overloads, or one cast inside plus tests |
| Recursing on large inputs | TS2589 | Keep recursion in tail position, or solve a smaller problem |

## Testing conditional types

Conditional types are code, with branches, so test every branch, including the edge inputs: a union, `never`, `any` and an optional property. You have been using `Equal` all lesson. Here is why it is written in that strange way. The obvious version, "each extends the other", is itself a conditional type, so it distributes and it gives in to `any`:

naive-equal.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type NaiveEqual<A, B> = A extends B ? (B extends A ? true : false) : false;

type E1 = Expect<Equal<NaiveEqual<string | number, string>, boolean>>;
type E2 = Expect<Equal<NaiveEqual<any, string>, boolean>>;
type E3 = Expect<Equal<NaiveEqual<never, string>, never>>;

type E4 = Expect<Equal<Equal<string | number, string>, false>>;
type E5 = Expect<Equal<Equal<any, string>, false>>;

console.log("NaiveEqual is not an equality test");
```

Output of `npx tsx naive-equal.ts` and of the browser terminal

```ts
NaiveEqual is not an equality test
```

The real `Equal` compares two generic function types, `<T>() => T extends A ? 1 : 2` and the same with `B`. The compiler can only decide that those are related by checking that `A` and `B` are identical, which is exactly the test you want, and nothing distributes because `A` and `B` are not the checked types. You do not need to derive it; you need to know that the naive one lies. Libraries such as `expect-type` and Vitest's `expectTypeOf` package the same idea. [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) covers them.

A test file for this lesson's build pins the computed types and the rules, and also runs the runtime half:

retry.test.ts

```ts
import { retryAll, withRetry } from "./retry.js";
import type { Retried, Unwrap } from "./retry.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type R1 = Expect<Equal<Unwrap<Promise<Promise<string>>>, string>>;
type R2 = Expect<Equal<Unwrap<number | Promise<number>>, number>>;
type R3 = Expect<Equal<Retried<{ url: string; ping(): boolean }>["ping"], () => Promise<boolean>>>;
type R4 = Expect<Equal<Retried<{ url: string }>["url"], string>>;

// @ts-expect-error: the wrapper keeps the parameter types
withRetry((amountKobo: number) => amountKobo)("100");

let calls = 0;
const flaky = withRetry(() => {
  calls++;
  if (calls < 3) throw new Error(`attempt ${calls} failed`);
  return "ok";
}, 3);
console.log(await flaky(), "after", calls, "calls");

const alwaysDown = withRetry((): string => {
  throw new Error("bank unreachable");
}, 2);
console.log(await alwaysDown().catch((error: unknown) => String(error)));

console.log(Object.keys(retryAll({ a: 1, b: () => 2 })).join(","));
```

Output of `npx tsx retry.test.ts` and of the browser terminal

```ts
ok after 3 calls
Error: bank unreachable
a,b
```

The type tests prove that the wrapper's types are what the lesson claims, including the union case `R2`. The `@ts-expect-error` line proves a *rejection*: if a refactor ever loosened the parameter types, the directive would become unused and `tsc` would fail. The runtime tests check what no type can: that the loop really retries, stops after the limit and reports the last error.

## Conditional types in production

- **They belong at library boundaries.** Wrappers, clients, form generators and ORMs compute types from their inputs. Application code that handles one order or one payment rarely needs a conditional type; a union or an overload says it more plainly.
- **Name the steps.** A ten-branch conditional type on one line is unreadable, and its error messages are worse. Split it into named helpers (`InputKind`, `FormFor`) and give each one type tests.
- **Prefer the built-ins.** `Awaited`, `ReturnType`, `Parameters`, `Exclude`, `Extract` and `NonNullable` are well tested and every TypeScript developer can read them.
- **Watch compile times.** Every use of a generic conditional type is evaluated separately, and recursive ones multiply. If your editor slows down, [Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance) shows how to find the type responsible.
- **A computed type describes a promise the runtime must keep.** The `retryAll` guard is the pattern: wherever an `as` connects runtime code to a computed type, add a runtime check or a test for the cases the type cannot see.

## Practice

TRY IT YOURSELF

### The payload of an event handler

An event system stores handlers such as `(event: { orderId: string; amountKobo: number }) => void`. Write `PayloadOf<H>` that gives the event type of a handler, and `never` for anything that is not a one-argument function. Prove it with `Expect` lines, including a non-function.

**Show a solution**

payload.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type PayloadOf<H> = H extends (event: infer E) => void ? E : never;

type OrderPaid = (event: { orderId: string; amountKobo: number }) => void;
type StockLow = (event: { sku: string; left: number }) => void;

type P1 = Expect<Equal<PayloadOf<OrderPaid>, { orderId: string; amountKobo: number }>>;
type P2 = Expect<Equal<PayloadOf<OrderPaid | StockLow>, { orderId: string; amountKobo: number } | { sku: string; left: number }>>;
type P3 = Expect<Equal<PayloadOf<string>, never>>;

console.log("PayloadOf works");
```

Output of `npx tsx payload.ts` and of the browser terminal

```ts
PayloadOf works
```

`P2` shows distribution helping you: given a union of handlers, you get the union of their payloads, which is exactly the type of "any event this bus can carry".

TRY IT YOURSELF

### Fix IsNullable

A teammate wrote `type IsNullable<T> = T extends null | undefined ? true : false` to check whether a field may be empty. `IsNullable<string | null>` gives `boolean`. Explain why, and fix it so it answers `true` when any member is `null` or `undefined`, and `false` otherwise.

**Show a solution**

nullable.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type IsNullable<T> = [Extract<T, null | undefined>] extends [never] ? false : true;

type N1 = Expect<Equal<IsNullable<string | null>, true>>;
type N2 = Expect<Equal<IsNullable<string | undefined>, true>>;
type N3 = Expect<Equal<IsNullable<string>, false>>;
type N4 = Expect<Equal<IsNullable<{ email?: string }["email"]>, true>>;

console.log("IsNullable fixed");
```

Output of `npx tsx nullable.ts` and of the browser terminal

```ts
IsNullable fixed
```

The original distributes: `string` answers `false`, `null` answers `true`, and the union of the two is `boolean`. The fix first uses distribution on purpose, `Extract` keeps only the empty members, and then asks one non-distributive question about the result: "is there nothing left?"

TRY IT YOURSELF

### Deeply unwrap a loader

Some loaders return a promise of an array of promises, such as `Promise<Promise<Invoice>[]>`. Write `Settled<T>` that unwraps promises and, if the result is an array, unwraps its elements too, so that type becomes `Invoice[]`. Then use it on a real function with `Promise.all`.

**Show a solution**

settled.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Settled<T> =
  T extends PromiseLike<infer V> ? Settled<V>
  : T extends readonly (infer E)[] ? Settled<E>[]
  : T;

interface Invoice {
  number: string;
  totalKobo: number;
}

async function loadInvoices(): Promise<Promise<Invoice>[]> {
  return ["INV-001", "INV-002"].map(async (number, i) => ({ number, totalKobo: (i + 1) * 500_000 }));
}

type S1 = Expect<Equal<Settled<ReturnType<typeof loadInvoices>>, Invoice[]>>;
type S2 = Expect<Equal<Settled<Promise<number[][]>>, number[][]>>;

const invoices: Settled<ReturnType<typeof loadInvoices>> = await Promise.all(await loadInvoices());
console.log(invoices.map((invoice) => `${invoice.number}: ${invoice.totalKobo}`).join(", "));
```

Output of `npx tsx settled.ts` and of the browser terminal

```ts
INV-001: 500000, INV-002: 1000000
```

The promise branch comes first, so a promise of an array is unwrapped before the array branch looks at it. Each branch recurses on something smaller, so the recursion always reaches the last branch, the base case.

## Recap

- `T extends U ? X : Y` tests assignability, not equality. `any` gives both branches, `unknown` the false one, and `never` gives `never`.
- A naked type parameter distributes over a union: one evaluation per member, results unioned, `never` filtered out. That builds `Exclude`, `Extract` and `NonNullable`. Wrap in `[T] extends [U]` to ask one question about the whole type.
- `infer X` captures part of a matched type: elements, promise values, parameters, results, tuple positions. `infer X extends C` adds a condition. Two candidates combine to a union in output positions and an intersection in parameter positions.
- Conditional types can recurse, as in `Unwrap<Promise<Promise<User>>>`. Keep recursion in tail position, and prefer the built-in `Awaited` in real code.
- Chained conditionals are a type-level switch; the most specific test goes first.
- A conditional return type is deferred inside the function. Use overloads for fixed cases, or one cast plus tests when callers are generic.
- Test every branch with `Expect<Equal<…>>` and `@ts-expect-error`, and never use the naive equality check.

Next: [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals), where `infer` learns to take strings apart and you build an event name system the compiler checks.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
