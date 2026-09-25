---
title: "Testing TypeScript — ZudoJS Academy"
description: "Test TypeScript code with Vitest, including generics, error paths and typed mocks, then test types themselves with expectTypeOf and vitest --typecheck."
source: https://zudojs.oyinlola.site/learn/ts-testing
---

LEVEL 6 · LESSON 20 OF 22

Libraries and large projects Advanced

# Testing TypeScript

Test TypeScript code with Vitest, including generics, error paths and typed mocks, then test types themselves with expectTypeOf and vitest --typecheck.

- **55 min** to read and try
- **You need:** Declaration files and Publishing TypeScript packages
- **You build:** A Vitest suite for a shop's cart, split-payment, grouping and currency-conversion code, with typed mocks, table tests, a custom matcher and type-level tests that catch a loosened signature

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write and run Vitest unit tests for TypeScript modules, and explain why vitest run does not check types
- Test error paths, including thrown error classes, error codes, causes and rejected promises
- Build typed test doubles with vi.fn and keep them in step with the interfaces they replace
- Write type-level tests with expectTypeOf and @ts-expect-error, and run them with tsc or vitest --typecheck
- Decide what to test at runtime and what to test at the type level for a generic function

## Eleven green tests, and the types got worse

The shop's utilities package has a generic `groupBy`. The reporting team uses it to bucket orders by status, and relies on its types: `groups.paid` is an array of `Order`, and `groups.shipped` is a compile error because there is no such status. During a refactor, a developer who found the generics hard to read "simplified" it:

src/group.ts

```ts
export function groupBy(items: any[], keyOf: (item: any) => string): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}
```

The behaviour is identical, so every runtime test still passes. Here are the same checks the test suite makes, run with Vitest's `expect`:

check.tsNode.js only

```ts
import { expect } from "vitest";
import { groupBy } from "./src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}

const orders: Order[] = [
  { id: "ord_1", status: "paid" },
  { id: "ord_2", status: "pending" },
  { id: "ord_3", status: "paid" },
];

expect(groupBy(orders, (o) => o.status)).toEqual({ paid: [orders[0], orders[2]], pending: [orders[1]] });
expect(groupBy([], (o: Order) => o.status)).toEqual({});

const groups = groupBy(orders, (o) => o.status);
console.log("runtime checks passed");
console.log(groups.shipped?.length ?? "no shipped group, and the compiler did not object");
```

Output of `npx tsx check.ts`

```ts
runtime checks passed
no shipped group, and the compiler did not object
```

The last line is the damage. `groups` is now `Record<string, any[]>`: a typo like `groups.shipped` compiles, and `groups.paid[0].totl` would too, because the elements are `any`. The reporting team's type safety disappeared, and no test noticed, because no test was about types. One line of type-level testing would have caught it:

group.test-d.tsNode.js only

```ts
import { expectTypeOf } from "vitest";
import { groupBy } from "./src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

expectTypeOf(groupBy(orders, (o) => o.status)).toEqualTypeOf<Partial<Record<"pending" | "paid", Order[]>>>();
```

What `npx tsc --noEmit` prints

```ts
group.test-d.ts:10:62 - error TS2344: Type 'Partial<Record<"paid" | "pending", Order[]>>' does not satisfy the constraint '{ [x: string]: { [x: number]: undefined; }; }'.
  Property 'paid' is incompatible with index signature.
    Type 'Order[]' is not assignable to type '{ [x: number]: undefined; }'.
      'number' index signatures are incompatible.
        Type 'Order' is not assignable to type 'undefined'.

10 expectTypeOf(groupBy(orders, (o) => o.status)).toEqualTypeOf<Partial<Record<"pending" | "paid", Order[]>>>();
                                                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in group.test-d.ts:10
```

In TypeScript, a function has two contracts: what it *does* and what its *types promise*. This lesson tests both. You will set up and use **Vitest** for runtime tests of plain functions, generics, error paths and code with dependencies, and then write tests whose only job is to pin down types.

## Vitest and TypeScript

Install it as a dev dependency. Vitest runs `.ts` test files directly, with no build step:

Terminal on your computer

```bash
$ npm install -D vitest typescript @types/node
$ npx vitest --version
vitest/5.0.1 linux-x64 node-v24.19.0
```

The project under test has three small modules. A cart module with an error class:

src/cart.ts

```ts
export interface CartItem {
  readonly sku: string;
  readonly kobo: number;
  readonly quantity: number;
}

export class CartError extends Error {
  readonly code: "EMPTY_CART" | "BAD_QUANTITY";

  constructor(code: CartError["code"], message: string) {
    super(message);
    this.name = "CartError";
    this.code = code;
  }
}

export function subtotal(items: readonly CartItem[]): number {
  if (items.length === 0) throw new CartError("EMPTY_CART", "Cart is empty");
  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new CartError("BAD_QUANTITY", `Bad quantity for ${item.sku}: ${item.quantity}`);
    }
    total += item.kobo * item.quantity;
  }
  return total;
}

/** Splits kobo into equal parts; the first parts get one extra kobo each until the remainder is used up. */
export function splitKobo(totalKobo: number, parts: number): number[] {
  const base = Math.floor(totalKobo / parts);
  const remainder = totalKobo - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
```

the correctly typed `groupBy`:

src/group.ts

```ts
export function groupBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Partial<Record<K, T[]>> {
  const groups: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    const key = keyOf(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}
```

and a currency converter that depends on an outside service, reached through an interface:

src/rates.ts

```ts
export interface RateClient {
  fetchRate(currency: "USD" | "GBP"): Promise<number>;
}

export class RateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RateError";
  }
}

/** Converts a foreign amount (in whole units) to kobo at today's rate. */
export async function toKobo(amount: number, currency: "USD" | "GBP", client: RateClient): Promise<number> {
  let rate: number;
  try {
    rate = await client.fetchRate(currency);
  } catch (cause) {
    throw new RateError(`No ${currency} rate available`, { cause });
  }
  if (!Number.isFinite(rate) || rate <= 0) throw new RateError(`Nonsense ${currency} rate: ${rate}`);
  return Math.round(amount * rate * 100);
}
```

The first test file checks the cart. `describe` groups tests, `it` (or `test`) defines one, and `expect` makes assertions. Test files import from the source with the same `.js` paths as any other TypeScript module:

tests/cart.test.ts

```ts
import { describe, expect, it } from "vitest";
import { CartError, splitKobo, subtotal, type CartItem } from "../src/cart.js";

const rice: CartItem = { sku: "RICE-5KG", kobo: 1_250_000, quantity: 2 };
const oil: CartItem = { sku: "OIL-1L", kobo: 350_000, quantity: 1 };

describe("subtotal", () => {
  it("adds price times quantity for every item", () => {
    expect(subtotal([rice, oil])).toBe(2_850_000);
  });

  it("refuses an empty cart", () => {
    expect(() => subtotal([])).toThrow(CartError);
    expect(() => subtotal([])).toThrow("Cart is empty");
  });

  it("reports which item has a bad quantity", () => {
    const error = catchError(() => subtotal([rice, { ...oil, quantity: 0 }]));
    expect(error).toBeInstanceOf(CartError);
    expect(error).toMatchObject({ code: "BAD_QUANTITY", message: "Bad quantity for OIL-1L: 0" });
  });
});

describe("splitKobo", () => {
  it.each([
    { total: 10_000, parts: 4, expected: [2500, 2500, 2500, 2500] },
    { total: 10_000, parts: 3, expected: [3334, 3333, 3333] },
    { total: 2, parts: 3, expected: [1, 1, 0] },
  ])("splits $total kobo into $parts parts", ({ total, parts, expected }) => {
    const shares = splitKobo(total, parts);
    expect(shares).toEqual(expected);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
  });
});

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the function to throw");
}
```

`it.each` runs one test per row of a table, and the `$total` placeholders put each row's values into its name. The rows are typed: TypeScript infers `{ total: number; parts: number; expected: number[] }` for the callback's argument, so a row with a misspelled key makes the destructuring in the callback a compile error. Run everything with `vitest run` (plain `vitest` stays in watch mode):

Terminal on your computer

```bash
$ npx vitest run --reporter=verbose

 RUN  v5.0.1 ~/shop-tests

 ✓ tests/cart.test.ts > subtotal > adds price times quantity for every item 2ms
 ✓ tests/cart.test.ts > subtotal > refuses an empty cart 1ms
 ✓ tests/cart.test.ts > subtotal > reports which item has a bad quantity 1ms
 ✓ tests/cart.test.ts > splitKobo > splits 10000 kobo into 4 parts 1ms
 ✓ tests/cart.test.ts > splitKobo > splits 10000 kobo into 3 parts 0ms
 ✓ tests/cart.test.ts > splitKobo > splits 2 kobo into 3 parts 0ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  23:27:01
   Duration  217ms (transform 53%, import 27%, tests 12%, worker 7%)
```

### Vitest does not check types

Vitest makes `.ts` files runnable the same way `tsx` does: it strips the types and runs the JavaScript. It never runs the type checker on a normal test run. Here is a test with a type error in it:

tests/typo.test.ts

```ts
import { expect, it } from "vitest";
import { subtotal } from "../src/cart.js";

it("totals a single item", () => {
  const kobo: number = "1250000";
  expect(subtotal([{ sku: "RICE-5KG", kobo, quantity: 2 }])).toBe(2_500_000);
});
```

Terminal on your computer

```bash
$ npx vitest run tests/typo.test.ts

 RUN  v5.0.1 ~/shop-tests


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  23:29:32
   Duration  257ms (transform 58%, setup 17%, tests 9%, worker 8%, import 8%)

$ npx tsc --noEmit
tests/typo.test.ts:5:9 - error TS2322: Type 'string' is not assignable to type 'number'.

5   const kobo: number = "1250000";
          ~~~~


Found 1 error in tests/typo.test.ts:5
```

The test passed, because `"1250000" * 2` happens to be `2500000` in JavaScript. Only `tsc` saw the problem. So a TypeScript project runs **both**, and its `tsconfig.json` must include the test files, so that tests are type-checked like any other code:

package.json

```json
{
  "name": "shop-tests",
  "type": "module",
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vitest run",
    "test:types": "vitest run --typecheck",
    "verify": "npm run check && npm test"
  }
}
```

## Choosing the right assertion

Vitest's `expect` works outside a test file too, which makes it easy to see exactly what each matcher accepts. Every failed assertion throws an `AssertionError`; this script catches them to print the messages:

matchers.tsNode.js only

```ts
import { expect } from "vitest";

function attempt(label: string, assertion: () => void): void {
  try {
    assertion();
    console.log(`pass  ${label}`);
  } catch (error) {
    console.log(`FAIL  ${label}: ${(error as Error).message}`);
  }
}

const order = { id: "ord_1", totalKobo: 250_000, coupon: undefined };

attempt("toBe compares identity", () => expect(order).toBe({ ...order }));
attempt("toEqual compares contents", () => expect(order).toEqual({ id: "ord_1", totalKobo: 250_000 }));
attempt("toStrictEqual also compares undefined keys", () => expect(order).toStrictEqual({ id: "ord_1", totalKobo: 250_000 }));
attempt("toMatchObject checks a subset", () => expect(order).toMatchObject({ totalKobo: 250_000 }));
attempt("floats need toBeCloseTo", () => expect(0.1 + 0.2).toBe(0.3));
attempt("toBeCloseTo", () => expect(0.1 + 0.2).toBeCloseTo(0.3));
```

Output of `npx tsx matchers.ts`

```ts
FAIL  toBe compares identity: expected { Object (id, totalKobo, ...) } to be { Object (id, totalKobo, ...) } // Object.is equality

If it should pass with deep equality, replace "toBe" with "toStrictEqual"

Expected: { Object (id, totalKobo, ...) }
Received: serializes to the same string

pass  toEqual compares contents
FAIL  toStrictEqual also compares undefined keys: expected { Object (id, totalKobo, ...) } to strictly equal { id: 'ord_1', totalKobo: 250000 }
pass  toMatchObject checks a subset
FAIL  floats need toBeCloseTo: expected 0.30000000000000004 to be 0.3 // Object.is equality
pass  toBeCloseTo
```

- `toBe` uses `Object.is`: right for numbers, strings and booleans, wrong for objects, which are equal only if they are the same object.
- `toEqual` compares contents recursively and ignores properties whose value is `undefined`. `toStrictEqual` does not ignore them, and also checks that classes match. Use `toStrictEqual` when an explicit `undefined` would matter, for example in JSON sent to another service.
- `toMatchObject` checks only the properties you list, which keeps tests about one concern from breaking when unrelated fields are added.
- Money in this course is whole kobo, so exact `toBe` is right. `toBeCloseTo` is for real measurements, never for currency.

The matchers are typed, but loosely: `expect(x).toEqual(y)` accepts any `y`, because comparing different shapes is a legitimate test. The type safety of a test comes from the code it calls, not from `expect`.

## Testing error paths

REASON IT OUT

### What should an error test prove?

`subtotal` can fail in two ways and `toKobo` in two more. Before writing the tests, decide:

1. Is "it throws" enough? What would still pass if the function threw the wrong error, for example a `TypeError` from a typo inside it?
2. Callers switch on `error.code`. How do you test that the code is right, when a `catch` gives you `unknown`?
3. `toKobo` wraps a network failure in a `RateError`. What must the test check so that the original failure is not lost?
4. What happens to a test of an `async` function if you forget to `await` the assertion?

**Show the reasoning**

1. No. `expect(fn).toThrow()` passes for *any* error, including a bug inside the function. Assert the class (`toThrow(CartError)`) or the message, or both.
2. Catch the error, then assert on it as data: `toBeInstanceOf(CartError)` and `toMatchObject({ code: "BAD_QUANTITY" })`. Neither needs you to narrow `unknown` by hand.
3. That the thrown error is a `RateError` *and* that its `cause` is the original error object.
4. The test function returns before the promise settles. The assertion runs after the test has already passed, or not at all. Always `await expect(promise).rejects…` (or `.resolves`).

Here is the first point in action. A bug in a function throws a `TypeError`; a vague assertion accepts it, a precise one does not:

errors.tsNode.js only

```ts
import { expect } from "vitest";
import { CartError, subtotal, type CartItem } from "./src/cart.js";

const broken = [{ sku: "RICE-5KG", kobo: 1_250_000 }] as unknown as CartItem[];
const buggySubtotal = (items: CartItem[]) => items.reduce((sum, i) => sum + i.kobo * i.quantity.valueOf(), 0);

for (const [label, check] of [
  ["vague", () => expect(() => buggySubtotal(broken)).toThrow()],
  ["precise", () => expect(() => buggySubtotal(broken)).toThrow(CartError)],
  ["real function", () => expect(() => subtotal(broken)).toThrow(CartError)],
] as const) {
  try {
    check();
    console.log(`${label}: passed`);
  } catch (error) {
    console.log(`${label}: ${(error as Error).message}`);
  }
}
```

Output of `npx tsx errors.ts`

```ts
vague: passed
precise: expected error to be instance of CartError
real function: passed
```

`buggySubtotal` is a version without the validation: it calls a method on the missing quantity and crashes with a `TypeError`. The vague assertion is satisfied by that crash; the precise one is not. The real `subtotal` checks the quantity first and throws the right `CartError`. The `as unknown as CartItem[]` is deliberate: the broken item has no `quantity`, which the type forbids, so the test has to force it past the compiler. Tests of defensive code often do this, because they check what happens when data breaks the rules the types assume.

When a test needs the error's properties, remember that a caught value is `unknown`. Reaching into it directly is a compile error, which is one more reason to assert with matchers instead:

narrow.test.tsNode.js only

```ts
import { subtotal } from "./src/cart.js";

try {
  subtotal([]);
} catch (error) {
  console.log(error.code);
}
```

What `npx tsc --noEmit` prints

```ts
narrow.test.ts:6:15 - error TS18046: 'error' is of type 'unknown'.

6   console.log(error.code);
                ~~~~~


Found 1 error in narrow.test.ts:6
```

### Async errors and causes

`toKobo` needs a `RateClient`. The test supplies a **test double**, an object that stands in for the real dependency, built with `vi.fn`. The type argument ties the fake to the interface: `vi.fn<RateClient["fetchRate"]>()` is a mock function with exactly the real method's parameters and return type.

rates-check.tsNode.js only

```ts
import { expect, vi } from "vitest";
import { RateError, toKobo, type RateClient } from "./src/rates.js";

const fetchRate = vi.fn<RateClient["fetchRate"]>();
const client: RateClient = { fetchRate };

fetchRate.mockResolvedValueOnce(1530);
await expect(toKobo(20, "USD", client)).resolves.toBe(3_060_000);

const outage = new Error("connect ETIMEDOUT");
fetchRate.mockRejectedValueOnce(outage);
const error = await toKobo(5, "GBP", client).catch((e: unknown) => e);
expect(error).toBeInstanceOf(RateError);
expect(error).toMatchObject({ message: "No GBP rate available", cause: outage });

fetchRate.mockResolvedValueOnce(0);
await expect(toKobo(5, "GBP", client)).rejects.toThrow("Nonsense GBP rate: 0");

console.log(fetchRate.mock.calls);
console.log("all rate checks passed");
```

Output of `npx tsx rates-check.ts`

```json
[ [ 'USD' ], [ 'GBP' ], [ 'GBP' ] ]
all rate checks passed
```

`mock.calls` records every call's arguments, typed as `["USD" | "GBP"][]`. The typed mock also refuses fakes that the real service could never produce, such as a rate that arrives as text:

bad-mock.test.tsNode.js only

```ts
import { vi } from "vitest";
import type { RateClient } from "./src/rates.js";

const fetchRate = vi.fn<RateClient["fetchRate"]>();
fetchRate.mockResolvedValue("1530");
```

What `npx tsc --noEmit` prints

```ts
bad-mock.test.ts:5:29 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

5 fetchRate.mockResolvedValue("1530");
                              ~~~~~~


Found 1 error in bad-mock.test.ts:5
```

This matters more than it looks. A mock is a second, hand-written implementation of an interface, and nothing forces it to behave like the real one. When `RateClient` changes (say `fetchRate` starts returning `{ rate, fetchedAt }`), a typed mock breaks at compile time, and you update the tests together with the code. An untyped mock (`vi.fn()` with no type argument, or `as any`) keeps returning a bare number and keeps passing, testing a service that no longer exists.

In a test file the same checks look like this:

tests/rates.test.ts

```ts
import { describe, expect, it, vi } from "vitest";
import { RateError, toKobo, type RateClient } from "../src/rates.js";

function fakeClient(fetchRate: RateClient["fetchRate"]): RateClient {
  return { fetchRate };
}

describe("toKobo", () => {
  it("converts at the rate the client returns", async () => {
    const fetchRate = vi.fn<RateClient["fetchRate"]>().mockResolvedValue(1530);
    await expect(toKobo(20, "USD", fakeClient(fetchRate))).resolves.toBe(3_060_000);
    expect(fetchRate).toHaveBeenCalledExactlyOnceWith("USD");
  });

  it("wraps a failing client in a RateError with the cause", async () => {
    const outage = new Error("connect ETIMEDOUT");
    const client = fakeClient(vi.fn<RateClient["fetchRate"]>().mockRejectedValue(outage));
    const error = await toKobo(5, "GBP", client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateError);
    expect(error).toMatchObject({ message: "No GBP rate available", cause: outage });
  });

  it("refuses a nonsense rate instead of charging ₦0", async () => {
    const client = fakeClient(vi.fn<RateClient["fetchRate"]>().mockResolvedValue(0));
    await expect(toKobo(5, "GBP", client)).rejects.toThrow("Nonsense GBP rate: 0");
  });
});
```

Notice that the dependency comes in as a parameter. Code that creates its own `RateClient` internally can only be tested by replacing modules (`vi.mock`), which is slower to write and easier to get wrong. Designing for injected dependencies, as in [Type-safe dependency injection](https://zudojs.oyinlola.site/learn/ts-typed-di), is what makes TypeScript code easy to test.

## Reading a failing test

Suppose someone changes `splitKobo` to give the leftover kobo to the *last* parts instead of the first (`i >= parts - remainder`). The sum is still right, so the second assertion in each row passes, but the table catches it:

Terminal on your computer

```bash
$ npx vitest run tests/cart.test.ts

 RUN  v5.0.1 ~/shop-tests

 ❯ tests/cart.test.ts (6 tests | 2 failed) 15ms
   ❯ splitKobo (3)
     × splits 10000 kobo into 3 parts 7ms
     × splits 2 kobo into 3 parts 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/cart.test.ts > splitKobo > splits 10000 kobo into 3 parts
AssertionError: expected [ 3333, 3333, 3334 ] to deeply equal [ 3334, 3333, 3333 ]

- Expected
+ Received

  [
-   3334,
    3333,
    3333,
+   3334,
  ]

 ❯ tests/cart.test.ts:31:20
     29|   ])("splits $total kobo into $parts parts", ({ total, parts, expected…
     30|     const shares = splitKobo(total, parts);
     31|     expect(shares).toEqual(expected);
       |                    ^
     32|     expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
     33|   });
…
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

Read it from the top: which test (file, `describe`, row name), which assertion (the message and the diff, where `-` lines are expected and `+` lines are what the code returned), and where (the source line with a caret). Whether this change is a bug is a product question: if the rule is "the first customers pay the extra kobo", the test is right; if nobody cares, the test is too strict and should only check that each share is within one kobo of the others. Tests encode decisions, so write down the decision in the test's name.

## Testing generic code

A generic function makes promises for *every* type argument, and you cannot test them all. Test the behaviour with a few representative types, and test the typing separately:

- **Runtime tests** with realistic data: an array of `Order`, an empty array, keys that are numbers as well as strings. The behaviour does not depend on the types (they are erased), so one element type is usually enough.
- **Type tests** for inference: what does a caller get back, what does the callback receive, and what must be refused? That is where generic functions break in practice, as the opening example showed.

tests/group.test.ts

```ts
import { expect, it } from "vitest";
import { groupBy } from "../src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}

const orders: Order[] = [
  { id: "ord_1", status: "paid" },
  { id: "ord_2", status: "pending" },
  { id: "ord_3", status: "paid" },
];

it("groups orders by status, keeping their order", () => {
  expect(groupBy(orders, (o) => o.status)).toEqual({
    paid: [orders[0], orders[2]],
    pending: [orders[1]],
  });
});

it("returns an empty object for no items", () => {
  expect(groupBy([], (o: Order) => o.status)).toEqual({});
});
```

## Type-level tests

A **type-level test** is code that must compile (or must fail to compile) for the types to be right. It never needs to run: the type checker is the test runner. There are two tools.

### expectTypeOf and assertType

Vitest re-exports `expectTypeOf` from the `expect-type` library. At runtime it does nothing; its methods are typed so that a wrong expectation is a compile error:

tests/group.types.tsNode.js only

```ts
import { assertType, expectTypeOf } from "vitest";
import { groupBy } from "../src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

const byStatus = groupBy(orders, (o) => o.status);
expectTypeOf(byStatus).toEqualTypeOf<Partial<Record<"pending" | "paid", Order[]>>>();
expectTypeOf(byStatus.paid).toEqualTypeOf<Order[] | undefined>();

expectTypeOf(groupBy<Order, string>).parameter(1).toEqualTypeOf<(item: Order) => string>();
expectTypeOf(groupBy(orders, (o) => o.id.length)).toExtend<Partial<Record<number, Order[]>>>();

assertType<Partial<Record<string, Order[]>>>(byStatus);
```

- `toEqualTypeOf<X>()` demands the *exact* type: not wider, not narrower. This is what catches `any` creeping in, since `any` is not equal to `Order[]`.
- `.parameter(n)`, `.parameters` and `.returns` reach into function types. `groupBy<Order, string>` without parentheses is an **instantiation expression**: the function with its type arguments filled in, not a call.
- `toExtend<X>()` only asks "is it assignable to `X`?". (Older code uses `toMatchTypeOf`, which `expect-type` has deprecated in favour of `toExtend` and `toMatchObjectType`.)
- `assertType<X>(value)` is the simplest form: the value must be assignable to `X`.

When a type test fails, the message is the weak point. Here is a wrong expectation (the test claims `paid` is always present):

tests/group.wrong.tsNode.js only

```ts
import { expectTypeOf } from "vitest";
import { groupBy } from "../src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

expectTypeOf(groupBy(orders, (o) => o.status).paid).toEqualTypeOf<Order[]>();
```

What `npx tsc --noEmit` prints

```ts
tests/group.wrong.ts:10:67 - error TS2344: Type 'Order[]' does not satisfy the constraint '"Expected: ..., Actual: undefined"'.

10 expectTypeOf(groupBy(orders, (o) => o.status).paid).toEqualTypeOf<Order[]>();
                                                                     ~~~~~~~


Found 1 error in tests/group.wrong.ts:10
```

The library reports a mismatch through a generic constraint, so the message says the expected type "does not satisfy the constraint", and the useful part is hidden inside that constraint: `Actual: undefined`. The expected type `Order[]` leaves out the `undefined` that `Partial` adds, so the test, not the function, is wrong here. For bigger types the message can be long and roundabout, like the one in the first section; read it from the position (which assertion) and the types it names. [Debugging TypeScript](https://zudojs.oyinlola.site/learn/ts-debugging) has a method for long messages like this.

### @ts-expect-error: "should not compile"

Some promises are refusals: `groupBy` must reject a key function that returns a `Date`, because a `Date` cannot be an object key. `// @ts-expect-error`, from [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#testing), turns that into a test: the next line must have a type error, and if it ever compiles, the directive itself is reported as unused.

tests/group.refusals.tsNode.js only

```ts
import { groupBy } from "../src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

export function refusals(): void {
  // @ts-expect-error: a Date cannot be an object key
  groupBy(orders, () => new Date());
  // @ts-expect-error: the key function receives an Order, which has no price
  groupBy(orders, (o) => o.price);
  // @ts-expect-error: there is no "shipped" status
  groupBy(orders, (o) => o.status).shipped;
}
```

This file compiles, which means all three lines really are errors. As in [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#testing), the lines sit inside a function that nothing calls, because a line under `@ts-expect-error` would still run. Keep each directive to one reason, and write the reason after the colon: a directive that is satisfied by the *wrong* error (a typo in the test, say) is a test that proves nothing.

### Running type tests with Vitest

You can simply let `tsc --noEmit` check type-test files. Vitest can also run them as tests, which gives them names and puts them in the same report. By convention they end in `.test-d.ts`, and `vitest --typecheck` type-checks them with `tsc` instead of running them:

tests/group.test-d.ts

```ts
import { expectTypeOf, test } from "vitest";
import { groupBy } from "../src/group.js";

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

test("keys are the literal statuses, values are Order arrays", () => {
  expectTypeOf(groupBy(orders, (o) => o.status)).toEqualTypeOf<Partial<Record<"pending" | "paid", Order[]>>>();
});

test("the key function receives an Order", () => {
  expectTypeOf(groupBy<Order, string>).parameter(1).toEqualTypeOf<(item: Order) => string>();
});

test("a key function must return a property key", () => {
  // @ts-expect-error: a Date cannot be an object key
  groupBy(orders, () => new Date());
});
```

With the correct `groupBy` everything passes. With the "simplified" version from the first section, the runtime tests still pass and the type tests do not:

Terminal on your computer

```bash
$ npx vitest run
…
 Test Files  3 passed (3)
      Tests  11 passed (11)
$ npx vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.1 ~/shop-tests

 ❯  TS  tests/group.test-d.ts (3 tests | 2 failed)
   × keys are the literal statuses, values are Order arrays
   × the key function receives an Order

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/group.test-d.ts:10 > keys are the literal statuses, values are Order arrays
TypeCheckError: Type 'Partial<Record<"paid" | "pending", Order[]>>' does not satisfy the constraint '{ [x string] { [x number] undefined; }; }'.
  Property 'paid' is incompatible with index signature.
…
 FAIL  tests/group.test-d.ts:14 > the key function receives an Order
TypeCheckError: Type '(items any[], keyOf (item any) => string) => Record<string, any[]>' has no signatures for which the type argument list is applicable.
…
 Test Files  1 failed | 3 passed (4)
      Tests  2 failed | 12 passed (14)
Type Errors  no errors
```

Two things to notice. Vitest warns that type checking is experimental, so pin its version in `package.json`. And this Vitest version prints TypeScript 7's messages with the colons missing (`{ [x string] … }` where `tsc` itself prints `{ [x: string]: … }`); when a message is hard to read, run `npx tsc --noEmit` for the original. The third test, the refusal, still passed: the loose version also refuses a `Date`, because it wants a `string`. Refusal tests and "exact type" tests catch different regressions, so write both.

## A custom matcher, typed

Many shop tests assert "this is a valid amount of kobo". A **custom matcher** says it once. `expect.extend` adds it at runtime, in a setup file that Vitest loads before every test file; a module augmentation (from [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#augmentation)) adds it to the types:

tests/setup.ts

```ts
import { expect } from "vitest";

expect.extend({
  toBeWholeKobo(received: unknown) {
    const pass = typeof received === "number" && Number.isSafeInteger(received) && received >= 0;
    return {
      pass,
      message: () => `expected ${String(received)} ${pass ? "not " : ""}to be a whole, non-negative number of kobo`,
    };
  },
});

declare module "vitest" {
  interface Matchers<R, T> {
    toBeWholeKobo(): R;
  }
}
```

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["tests/setup.ts"],
  },
});
```

The augmentation must repeat the interface's type parameters exactly (`Matchers<R, T>` in Vitest 5), and the matcher returns `R`, which is `void` for `expect(x)` and a promise for `expect(promise).resolves`. Without the augmentation, using the matcher is a compile error even though it works at runtime:

kobo.test.tsNode.js only

```ts
import { expect } from "vitest";

expect(2500).toBeWholeKobo();
```

What `npx tsc --noEmit` prints

```ts
kobo.test.ts:3:14 - error TS2339: Property 'toBeWholeKobo' does not exist on type 'Assertion<void, number>'.

3 expect(2500).toBeWholeKobo();
               ~~~~~~~~~~~~~


Found 1 error in kobo.test.ts:3
```

With the setup file in place, the matcher reads like a built-in one, including `.not` and its own failure message:

tests/money.test.ts

```ts
import { expect, it } from "vitest";
import { splitKobo } from "../src/cart.js";

it("every share of a split is whole kobo", () => {
  for (const share of splitKobo(10_000, 3)) expect(share).toBeWholeKobo();
});

it("a naive split is not", () => {
  expect(10_000 / 3).not.toBeWholeKobo();
  expect(10_000 / 3).toBeWholeKobo();
});
```

Terminal on your computer

```bash
$ npx vitest run tests/money.test.ts

 RUN  v5.0.1 ~/shop-tests

 ❯ tests/money.test.ts (2 tests | 1 failed) 18ms
   × a naive split is not 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/money.test.ts > a naive split is not
Error: expected 3333.3333333333335 to be a whole, non-negative number of kobo
 ❯ tests/money.test.ts:10:22
      8| it("a naive split is not", () => {
      9|   expect(10_000 / 3).not.toBeWholeKobo();
     10|   expect(10_000 / 3).toBeWholeKobo();
       |                      ^
…
```

The second assertion fails on purpose, to show the message. Keep matchers like this few and domain-specific; each one is code your whole team has to learn.

## What to test where

| Concern | Tool | Example from this lesson |
| --- | --- | --- |
| What a function returns for given inputs | Vitest runtime test | `subtotal`, `splitKobo` rows |
| Which error, with which code and cause | `toThrow(Class)`, `toMatchObject`, `rejects` | `CartError`, `RateError` with `cause` |
| Behaviour with a dependency | Typed test doubles (`vi.fn<T>()`) | `RateClient` |
| What callers get from inference | `expectTypeOf(…).toEqualTypeOf<…>()` | `groupBy` keys and values |
| What must be refused | `// @ts-expect-error` | a `Date` key, a missing status |
| That test code itself is type-correct | `tsc --noEmit` including test files | the `"1250000"` typo |
| That the published package's types work | Type tests against the built `.d.ts`, plus attw | [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#testing) |

Integration tests follow the same rules with bigger pieces: build the real service with in-memory or test-database dependencies instead of mocks, and test a whole request. [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) covers when to choose which, and [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing) does it for a full application.

## In production

- **CI runs three things**: `tsc --noEmit` (including tests), `vitest run`, and the type tests (`vitest run --typecheck` or `tsc` over `*.test-d.ts`). Any one alone misses bugs the others catch.
- **Type every test double** from the interface it replaces. Ban `as any` in tests the same way you would in source; an untyped mock tests a world that may no longer exist.
- **Test error paths as carefully as happy paths**: class, code, message and cause. Error handling is where production bugs hide, and it runs least often.
- **Write type tests for public generic APIs**, especially in libraries. They are cheap, run in the type checker, and turn "the types got worse" into a red build.
- **Pin the test runner version** (Vitest says so itself for type checking), and upgrade deliberately.
- **Keep tests fast and isolated**: no shared mutable state between tests, fresh doubles in each test, and real time or network only in tests that are marked as integration tests.

## Practice

TRY IT YOURSELF

### Test the refusal of bad amounts

Add a check to `splitKobo` that throws a `RangeError` for a non-integer total, a negative total, or a number of parts below 1. Then write assertions that each bad input throws a `RangeError`, and that a good input still splits correctly.

**Show a solution**

split.tsNode.js only

```ts
import { expect } from "vitest";

function splitKobo(totalKobo: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalKobo) || totalKobo < 0) throw new RangeError(`Bad total: ${totalKobo}`);
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`Bad number of parts: ${parts}`);
  const base = Math.floor(totalKobo / parts);
  const remainder = totalKobo - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

for (const [total, parts] of [[10.5, 2], [-100, 2], [100, 0], [100, 1.5]]) {
  expect(() => splitKobo(total, parts)).toThrow(RangeError);
}
expect(splitKobo(10_000, 3)).toEqual([3334, 3333, 3333]);
console.log("all split checks passed");
```

Output of `npx tsx split.ts`

```ts
all split checks passed
```

Each bad row asserts the class, not just "throws", so a `TypeError` from a bug inside the function would fail the test. In a test file this loop becomes an `it.each` table, one named test per bad input.

TRY IT YOURSELF

### Pin a generic's types

Here is a typed `indexBy`, which builds a lookup table from a list. Write type tests: the result for orders keyed by `id` is `Record<string, Order>`; the key function receives an `Order`; and a key function returning an object must not compile.

```ts
export function indexBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, T>
```

**Show a solution**

index-by.types.tsNode.js only

```ts
import { expectTypeOf } from "vitest";

export function indexBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, T> {
  const index = {} as Record<K, T>;
  for (const item of items) index[keyOf(item)] = item;
  return index;
}

interface Order {
  id: string;
  status: "pending" | "paid";
}
declare const orders: Order[];

expectTypeOf(indexBy(orders, (o) => o.id)).toEqualTypeOf<Record<string, Order>>();
expectTypeOf(indexBy<Order, string>).parameter(1).parameter(0).toEqualTypeOf<Order>();

export function refusals(): void {
  // @ts-expect-error: an object cannot be a key
  indexBy(orders, (o) => ({ id: o.id }));
}
```

This file only needs to compile. `.parameter(1).parameter(0)` walks into the second parameter (the key function) and then into its first parameter. Notice a design question the tests raise: keyed by `status`, `indexBy` returns `Record<"pending" | "paid", Order>`, which claims both keys always exist. A `Partial` return type would be more honest, and a type test is the place to decide.

TRY IT YOURSELF

### Catch the untyped mock

`RateClient.fetchRate` changes to return `Promise<{ rate: number; fetchedAt: string }>`, and `toKobo` is updated to read `.rate`. A test still has `const fetchRate = vi.fn().mockResolvedValue(1530)`. What happens when the test runs, what happens under `tsc`, and how do you make the compiler find this test?

**Show a solution**

At runtime the mock resolves to `1530`, so `(1530).rate` is `undefined`. `toKobo` then refuses it as a nonsense rate, and the "converts at the rate" test fails with a confusing message, far from the real cause. `tsc` says nothing, because `vi.fn()` without a type argument accepts any implementation and any resolved value.

Give the mock its type from the interface: `vi.fn<RateClient["fetchRate"]>()`. Now `mockResolvedValue(1530)` is a compile error (`number` is not assignable to `{ rate: number; fetchedAt: string }`), the moment the interface changes, pointing at the exact line to update. Typed doubles turn interface changes into compile errors in the tests, which is where you want to find them.

## Recap

- A TypeScript function has a runtime contract and a type contract. Vitest tests the first; type-level tests test the second. Neither replaces the other.
- `vitest run` strips types without checking them. Run `tsc --noEmit` over the tests too.
- Choose matchers deliberately: `toBe` for primitives, `toEqual`/`toStrictEqual` for contents, `toMatchObject` for subsets, `toThrow(Class)` and `rejects` for errors. Always `await` async assertions.
- Build test doubles with `vi.fn<Interface["method"]>()` so that they break when the interface changes.
- `expectTypeOf(…).toEqualTypeOf<…>()` pins exact types; `// @ts-expect-error` pins refusals. Put them in `*.test-d.ts` files and run `vitest --typecheck`, or let `tsc` check them.
- Custom matchers need `expect.extend` at runtime and an augmentation of Vitest's `Matchers` interface for the types.

Next: [Debugging TypeScript](https://zudojs.oyinlola.site/learn/ts-debugging), where you learn to read the long error messages you met here, and to find out why the compiler resolved, inferred or included what it did.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
