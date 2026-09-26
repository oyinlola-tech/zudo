---
title: "Special types: any, unknown, never and friends — ZudoJS Academy"
description: "Learn what any, unknown, never, void, object, {} and Object really mean, watch one any spread, and use unknown at your program's boundaries."
source: https://zudojs.oyinlola.site/learn/ts-special-types
---

LEVEL 5 · LESSON 9 OF 23

Special types and narrowing Foundation

# Special types: any, unknown, never and friends

Learn what any, unknown, never, void, object, {} and Object really mean, watch one any spread, and use unknown at your program's boundaries.

- **45 min** to read and try
- **You need:** Type aliases and interfaces, and Basic types
- **You build:** A payment-webhook handler with no any in it - untrusted JSON enters as unknown, is checked, and comes out as a typed event

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Place any, unknown and never in the type hierarchy and predict what can be assigned to each
- Trace how a single any spreads, and find where it enters
- Use unknown at every boundary and check it before use
- Explain void, including why a void callback may return a value
- Choose between object, {}, Object and Record<string, unknown>

## One any, and a customer is credited ₦100,005,000

A payment provider calls your server whenever a customer tops up their wallet. The request body is JSON. Here is a handler that compiles with `strict` on and zero errors:

webhook.ts

```ts
const balances = new Map<string, number>([["WAL-17", 10000]]);

function credit(walletId: string, amount: number): number {
  const next = (balances.get(walletId) ?? 0) + amount;
  balances.set(walletId, next);
  return next;
}

function handleWebhook(body: string): void {
  const event = JSON.parse(body);
  const newBalance = credit(event.data.walletId, event.data.amount);
  console.log(`credited ${event.data.walletId}, balance now ${newBalance}`);
}

handleWebhook('{"type": "topup", "data": {"walletId": "WAL-17", "amount": "5000"}}');
```

Output of `npx tsx webhook.ts` and of the browser terminal

```ts
credited WAL-17, balance now 100005000
```

The provider sent the amount as the string `"5000"`. `10000 + "5000"` is the string `"100005000"`, and the wallet now "holds" a hundred million naira. `credit` clearly says `amount: number`, so how did a string get in without a single error?

The answer is one word: `any`. `JSON.parse` is declared to return `any`, and `any` tells the compiler to stop checking. Everything computed from it is `any` too, and `any` is accepted by a `number` parameter. This lesson is about the handful of special types that sit outside the everyday ones: `any`, `unknown`, `never`, `void`, `object`, `{}` and `Object`. You met the first four briefly in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#any-unknown); now you learn exactly how each behaves.

## The top and the bottom of the type system

In [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#sets) you learned to see a type as a set of values. Two of the special types are the extremes of that picture:

- `unknown` is the set of **every** value. Anything can be assigned to it. It is called the **top type**.
- `never` is the **empty** set. Nothing can be assigned to it (except another `never`). It is called the **bottom type**.

```ts
                 unknown          every value; you must check before use
          ┌─────────┼──────────────────┐
       string    number   boolean   object   null   undefined …
          │         │                  │
       "NGN"       42           { id: 1 }, [1, 2], () => 1
          └─────────┼──────────────────┘
                  never           no value at all

   any: not in the picture. It switches the checks off in both directions.
```

`any` does not fit in the picture. It behaves like the top type when you assign *to* it (anything goes in) and like the bottom type when you assign *from* it (it goes anywhere, even into a `number` parameter). That is not a place in the hierarchy; it is an exit from it.

|  | Can receive any value? | Can be passed where a `number` is expected? | Can you call methods on it? |
| --- | --- | --- | --- |
| `unknown` | Yes | No, check it first | No, check it first |
| `any` | Yes | Yes, unchecked | Yes, unchecked |
| `never` | No | Yes (there is never a value to pass) | No: "Property … does not exist on type 'never'" |

## any, and how it spreads

Look again at the webhook, and ask the compiler what types it inferred. Use the `never` probe from [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#inferred-vs-annotated):

spread.ts

```ts
function amountOf(body: string) {
  const event = JSON.parse(body);
  return event.data.amount;
}

const amount = amountOf('{"data": {"amount": "5000"}}');
const doubled = amount * 2;
const label = amount.toFixed(2);

const probe1: never = amount;
const probe2: never = doubled;
const probe3: never = label;
```

What `npx tsc --noEmit` prints

```ts
spread.ts:10:7 - error TS2322: Type 'any' is not assignable to type 'never'.

10 const probe1: never = amount;
         ~~~~~~

spread.ts:11:7 - error TS2322: Type 'number' is not assignable to type 'never'.

11 const probe2: never = doubled;
         ~~~~~~

spread.ts:12:7 - error TS2322: Type 'any' is not assignable to type 'never'.

12 const probe3: never = label;
         ~~~~~~


Found 3 errors in the same file, starting at: spread.ts:10
```

`JSON.parse` returned `any`. Reading `.data.amount` from an `any` gives `any`. The function's inferred return type became `any`, so a caller in another file now has an `any` without ever seeing `JSON.parse`. And `amount.toFixed(2)` compiled, although the value is a string and will throw at runtime. Only arithmetic produced a real type: `amount * 2` is always a `number` in JavaScript.

That is how `any` spreads: every property you read, every method you call and every function that returns it passes it on, silently, to code that has no idea it is unchecked.

### Where any comes from

| Source | How to stop it |
| --- | --- |
| `JSON.parse(text)` | `const data: unknown = JSON.parse(text)` |
| `await response.json()` (the Fetch API, with the browser's DOM types) | `const data: unknown = await response.json()` |
| A parameter without a type | `strict` (`noImplicitAny`) makes it an error, TS7006 |
| A `let` with no value, or an empty array, read in another function | Annotate it (TS7034 and TS7005 flag it) |
| A library with no types, or poor ones | Install its `@types/…` package, or wrap it in a small typed module |
| Writing `any` or `as any` yourself | Do not; a linter rule (`no-explicit-any` in typescript-eslint) can forbid it |

`strict` only stops the *implicit* cases. An `any` that comes from a declaration, like `JSON.parse`'s, is explicit, and the compiler accepts it without a word. You have to stop it yourself, at the point where it enters.

### Is any ever acceptable?

Rarely, and always in a small, fenced place: while converting an old JavaScript file to TypeScript one piece at a time, or in a test that deliberately passes bad input to check that a function rejects it. Even there, `unknown` usually works: a test can pass `"5000" as unknown as number`, which at least says out loud that it is lying.

## unknown at the boundaries

A **boundary** is a place where data enters your program from outside: request bodies, webhooks, files, environment variables, database rows, replies from other services, messages from a queue. The compiler never saw that data; it cannot know its type. `unknown` says exactly that, and then makes you prove what the value is before you use it:

boundary.ts

```ts
const event: unknown = JSON.parse('{"data": {"walletId": "WAL-17", "amount": "5000"}}');

const amount = event.data.amount;
console.log(event.toString());
```

What `npx tsc --noEmit` prints

```ts
boundary.ts:3:16 - error TS18046: 'event' is of type 'unknown'.

3 const amount = event.data.amount;
                 ~~~~~

boundary.ts:4:13 - error TS18046: 'event' is of type 'unknown'.

4 console.log(event.toString());
              ~~~~~


Found 2 errors in the same file, starting at: boundary.ts:3
```

You cannot read a property, call a method or pass it on as a `number`. The only way forward is to check. The checks are ordinary JavaScript: `typeof`, `=== null`, the `in` operator and `Array.isArray`, and TypeScript narrows the type after each one. [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing) covers every form in detail; here is the pattern you will use most:

boundary.ts

```ts
interface TopUp {
  walletId: string;
  amount: number;
}

function readTopUp(input: unknown): TopUp | string {
  if (typeof input !== "object" || input === null || !("data" in input)) return "body is not an event";
  const data = input.data;
  if (typeof data !== "object" || data === null) return "data is not an object";
  if (!("walletId" in data) || typeof data.walletId !== "string") return "walletId must be a string";
  if (!("amount" in data) || typeof data.amount !== "number") return "amount must be a number";
  if (!Number.isInteger(data.amount) || data.amount <= 0) return "amount must be a positive whole number";
  return { walletId: data.walletId, amount: data.amount };
}

for (const body of [
  '{"data": {"walletId": "WAL-17", "amount": 5000}}',
  '{"data": {"walletId": "WAL-17", "amount": "5000"}}',
  '[1, 2, 3]',
  'null',
]) {
  console.log(readTopUp(JSON.parse(body)));
}
```

Output of `npx tsx boundary.ts` and of the browser terminal

```json
{ walletId: 'WAL-17', amount: 5000 }
amount must be a number
body is not an event
body is not an event
```

Each `if` removes a possibility, and by the last line TypeScript knows that `data.walletId` is a `string` and `data.amount` a `number`. The returned object is built only from checked values, so the `TopUp` type is now true, not merely hoped for. The string `"5000"` is rejected with a reason instead of being added to a balance.

Writing these checks by hand gets long for big objects; [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) shows libraries that generate them from a schema. The principle stays: **outside data enters as `unknown`, and leaves the boundary as a checked type.**

### unknown in catch

Anything can be thrown in JavaScript: an `Error`, a string, a number, `undefined`. So with `strict` on (its `useUnknownInCatchVariables` flag), the variable in `catch (error)` is `unknown`, and you check it like any other boundary:

catch.ts

```ts
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return `unexpected value thrown: ${JSON.stringify(error)}`;
}

for (const thrown of [new Error("gateway timeout"), "card declined", 402]) {
  try {
    throw thrown;
  } catch (error) {
    console.log(describeError(error));
  }
}
```

Output of `npx tsx catch.ts` and of the browser terminal

```ts
gateway timeout
card declined
unexpected value thrown: 402
```

## never: the empty type

`never` has no values, and that makes it useful in three ways.

### 1. Functions that never return

A function that always throws, or loops forever, has the return type `never`. Because it never returns, TypeScript knows that code after a call to it cannot run, and narrows accordingly:

fail.ts

```ts
function fail(message: string): never {
  throw new Error(message);
}

function walletBalance(balances: Map<string, number>, walletId: string): number {
  const balance = balances.get(walletId);
  if (balance === undefined) fail(`unknown wallet ${walletId}`);
  return balance;
}

const balances = new Map([["WAL-17", 10000]]);
console.log(walletBalance(balances, "WAL-17"));
try {
  walletBalance(balances, "WAL-99");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx fail.ts` and of the browser terminal

```ts
10000
Error: unknown wallet WAL-99
```

After the `if`, `balance` is a `number`: the only path where it was `undefined` ended in `fail`, which never comes back.

### 2. What is left after every check

When you have narrowed away every member of a union, the type that remains is `never`. That is what powers the exhaustive checks from [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#exhaustive). It also explains why `never` disappears from unions: `string | never` is just `string`, because adding the empty set to a set changes nothing.

### 3. The never[] surprise

You will meet `never` in an error message sooner or later, usually like this:

cart.ts

```ts
const cart = { customer: "Ada", items: [] };

cart.items.push({ sku: "RICE-5KG", price: 9500 });
```

What `npx tsc --noEmit` prints

```ts
cart.ts:3:17 - error TS2345: Argument of type '{ sku: string; price: number; }' is not assignable to parameter of type 'never'.

3 cart.items.push({ sku: "RICE-5KG", price: 9500 });
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in cart.ts:3
```

An empty array inside an object literal has nothing to infer an element type from, and it cannot "evolve" the way a standalone `let` array does, so its type is `never[]`: an array that can hold nothing. The fix is the one from [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#when-to-annotate): give the empty container a type, for example with an interface for the cart (`items: CartItem[]`).

## void: "the result is not for you"

`void` is the return type of a function whose result should not be used. For a function you write, it means "returns nothing", and the compiler holds you to it. For a *function type*, such as a callback parameter, it means something looser: "I will ignore whatever you return".

void.ts

```ts
function logTransfer(reference: string): void {
  return reference.length;
}

type OnSent = (reference: string) => void;

const sentLog: string[] = [];
const remember: OnSent = (reference) => sentLog.push(reference);
const result = remember("TRF-1");
const count: number = result;
```

What `npx tsc --noEmit` prints

```ts
void.ts:2:3 - error TS2322: Type 'number' is not assignable to type 'void'.

2   return reference.length;
    ~~~~~~

void.ts:10:7 - error TS2322: Type 'void' is not assignable to type 'number'.

10 const count: number = result;
         ~~~~~


Found 2 errors in the same file, starting at: void.ts:2
```

- `logTransfer` is declared `: void` and tries to return a number: an error.
- `remember` is typed `OnSent`, and its arrow function returns a number (`push` returns the new length). That is allowed: a function that returns something can be used where the result will be ignored. But the result's type is `void`, so the compiler stops you from using it as a number.

The looser rule is what lets you write `transfers.forEach((t) => sentLog.push(t))` even though `forEach` expects a callback returning `void`. It also hides a classic async bug. An `async` function returns a promise, and a promise is "something", so it fits a `void` callback, and nothing waits for it:

payouts.ts

```ts
async function pay(name: string, amount: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`paid ${name} ₦${amount}`);
}

const payouts: [string, number][] = [["Ada", 5000], ["Bola", 7500]];

payouts.forEach(async ([name, amount]) => {
  await pay(name, amount);
});
console.log("all payouts done");
```

Output of `npx tsx payouts.ts` and of the browser terminal

```ts
all payouts done
paid Ada ₦5000
paid Bola ₦7500
```

"All payouts done" is printed before any payout happens. If the next line closed the database connection, the payouts would fail. `forEach` ignores the promises its callback returns; that is exactly what `void` allowed. Use a `for…of` loop with `await` (one after another), or `await Promise.all(payouts.map(…))` (all at once):

payouts.ts

```ts
async function pay(name: string, amount: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`paid ${name} ₦${amount}`);
}

const payouts: [string, number][] = [["Ada", 5000], ["Bola", 7500]];

for (const [name, amount] of payouts) {
  await pay(name, amount);
}
console.log("all payouts done");
```

Output of `npx tsx payouts.ts` and of the browser terminal

```ts
paid Ada ₦5000
paid Bola ₦7500
all payouts done
```

Linters can catch the first version (typescript-eslint's `no-misused-promises` rule). The compiler alone cannot, because by the rules of `void`, the code is correct.

## object, {} and Object

Three types sound like "an object", and only one of them means it:

- `object` (lowercase): any **non-primitive** value: plain objects, arrays, functions, dates, maps. Not strings, numbers, booleans, `null` or `undefined`.
- `{}` (the empty object type): any value **except `null` and `undefined`**. That includes `42` and `"hello"`, because they have no required properties to be missing. It does not mean "an empty object".
- `Object` (capital O): nearly the same as `{}`. It is the type of JavaScript's built-in `Object`, and like `String` in [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#string-vs-string), you should not write it.

And the type you usually want is a fourth one: `Record<string, unknown>`, "an object with string keys whose values I have not checked yet". See what each accepts:

objects.ts

```ts
const values = { amount: 5000, currency: "NGN", missing: null, items: [1, 2], wallet: { id: "WAL-17" }, pay: () => true };

const a1: object = values.amount;
const a2: object = values.items;
const a3: object = values.pay;

const b1: {} = values.amount;
const b2: {} = values.currency;
const b3: {} = values.missing;

const c1: Record<string, unknown> = values.wallet;
const c2: Record<string, unknown> = values.items;
const c3: Record<string, unknown> = values.pay;
```

What `npx tsc --noEmit` prints

```ts
objects.ts:3:7 - error TS2322: Type 'number' is not assignable to type 'object'.

3 const a1: object = values.amount;
        ~~

objects.ts:9:7 - error TS2322: Type 'null' is not assignable to type '{}'.

9 const b3: {} = values.missing;
        ~~

objects.ts:12:7 - error TS2322: Type 'number[]' is not assignable to type 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'number[]'.

12 const c2: Record<string, unknown> = values.items;
         ~~

objects.ts:13:7 - error TS2322: Type '() => boolean' is not assignable to type 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type '() => boolean'.

13 const c3: Record<string, unknown> = values.pay;
         ~~


Found 4 errors in the same file, starting at: objects.ts:3
```

| Value | `object` | `{}` / `Object` | `Record<string, unknown>` | `unknown` |
| --- | --- | --- | --- | --- |
| `5000`, `"NGN"` | No | Yes | No | Yes |
| `null`, `undefined` | No | No | No | Yes |
| `{ id: "WAL-17" }` | Yes | Yes | Yes | Yes |
| `[1, 2]` | Yes | Yes | No | Yes |
| `() => true` | Yes | Yes | No | Yes |

The practical rules:

- For "a value I have not checked", use `unknown`.
- For "a plain object with string keys", use `Record<string, unknown>`, or better, a real interface.
- For "anything that is not a primitive" (rare: a cache key that must be an object, for example in a `WeakMap`), use `object`.
- Never write `{}` or `Object` to mean "some object". A function `save(data: {})` happily accepts `save(42)`.

## Build: a webhook handler without any

REASON IT OUT

### Before you write the handler

Your wallet service will receive top-up and refund webhooks from a payment provider. Think before you code:

1. What do you actually know about the request body when it arrives?
2. Which value in this flow is the first one that could be `any`?
3. What should happen when an event type you do not know arrives, such as a new `"chargeback"`?
4. What should the handler return, so the caller can reply to the provider correctly?

**Show the reasoning**

1. Only that it is a string of text, if even that. It may not be JSON, may be JSON of the wrong shape, may be a replayed old event, and may not even come from the provider. (Checking the provider's signature is a security job covered in [the ZudoJS security lesson](https://zudojs.oyinlola.site/learn/zudo-security); this lesson handles the shape.)
2. The result of `JSON.parse`. Annotate it as `unknown` on the same line, and `any` never gets a chance to spread.
3. Do not guess. Reject it with a clear reason, and make sure the compiler forces a decision when you add a new type yourself: an exhaustive `switch` with `never`.
4. A result union, not a thrown error: `{ ok: true, … }` or `{ ok: false, reason }`. A rejected webhook is an expected outcome, and the reason helps whoever reads the logs.

events.ts

```ts
export type WalletEvent =
  | { type: "topup"; walletId: string; amount: number }
  | { type: "refund"; walletId: string; amount: number; originalReference: string };

export type ParseResult = { ok: true; event: WalletEvent } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEvent(body: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }
  if (!isRecord(raw) || !isRecord(raw.data)) return { ok: false, reason: "missing data object" };
  const { data } = raw;
  const { walletId, amount } = data;
  if (typeof walletId !== "string" || walletId === "") return { ok: false, reason: "walletId must be a non-empty string" };
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: "amount must be a positive whole number of kobo" };
  }
  if (raw.type === "topup") return { ok: true, event: { type: "topup", walletId, amount } };
  if (raw.type === "refund") {
    if (typeof data.originalReference !== "string") return { ok: false, reason: "refund needs originalReference" };
    return { ok: true, event: { type: "refund", walletId, amount, originalReference: data.originalReference } };
  }
  return { ok: false, reason: `unsupported event type ${JSON.stringify(raw.type)}` };
}
```

`isRecord` is a small **type guard**: its return type `value is Record<string, unknown>` tells TypeScript that when it returns `true`, the value may be treated as an object with string keys and unchecked values. [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing) explains type guards fully. Every property read from it is `unknown` and gets checked. Now the part that changes balances:

wallet.ts

```ts
import type { WalletEvent } from "./events.js";

function assertNever(value: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(value)}`);
}

export function apply(balances: Map<string, number>, event: WalletEvent): number {
  const current = balances.get(event.walletId) ?? 0;
  let next: number;
  switch (event.type) {
    case "topup":
    case "refund":
      next = current + event.amount;
      break;
    default:
      return assertNever(event);
  }
  balances.set(event.walletId, next);
  return next;
}
```

main.ts

```ts
import { parseEvent } from "./events.js";
import { apply } from "./wallet.js";

const balances = new Map<string, number>([["WAL-17", 1000000]]);

const bodies = [
  '{"type": "topup", "data": {"walletId": "WAL-17", "amount": 500000}}',
  '{"type": "topup", "data": {"walletId": "WAL-17", "amount": "5000"}}',
  '{"type": "refund", "data": {"walletId": "WAL-17", "amount": 25000}}',
  '{"type": "chargeback", "data": {"walletId": "WAL-17", "amount": 25000}}',
  'not json at all',
];

for (const body of bodies) {
  const result = parseEvent(body);
  if (result.ok) {
    console.log(`${result.event.type}: balance now ${apply(balances, result.event)} kobo`);
  } else {
    console.log(`rejected: ${result.reason}`);
  }
}
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
topup: balance now 1500000 kobo
rejected: amount must be a positive whole number of kobo
rejected: refund needs originalReference
rejected: unsupported event type "chargeback"
rejected: body is not JSON
```

Search these three files for `any`: there is none, not even an inferred one. The string `"5000"` that caused the ₦100 million bug is refused, the refund without its reference is refused, the unknown `"chargeback"` is refused with its name in the message, and the amounts are whole kobo, so no floating-point money either.

## Testing boundaries and hunting any

A boundary function is the easiest code in the program to test, because it is pure: text in, result out. Feed it the inputs an attacker or a buggy provider might send, not just the happy path:

events.test.ts

```ts
import { parseEvent } from "./events.js";

const cases: [label: string, body: string, ok: boolean][] = [
  ["valid top-up", '{"type": "topup", "data": {"walletId": "W1", "amount": 100}}', true],
  ["amount as text", '{"type": "topup", "data": {"walletId": "W1", "amount": "100"}}', false],
  ["negative amount", '{"type": "topup", "data": {"walletId": "W1", "amount": -100}}', false],
  ["fractional kobo", '{"type": "topup", "data": {"walletId": "W1", "amount": 10.5}}', false],
  ["data is an array", '{"type": "topup", "data": [1, 2]}', false],
  ["body is null", "null", false],
  ["empty wallet id", '{"type": "topup", "data": {"walletId": "", "amount": 100}}', false],
];

for (const [label, body, expected] of cases) {
  const result = parseEvent(body);
  console.log(`${result.ok === expected ? "PASS" : "FAIL"} ${label}${result.ok ? "" : ` (${result.reason})`}`);
}
```

Output of `npx tsx events.test.ts` and of the browser terminal

```ts
PASS valid top-up
PASS amount as text (amount must be a positive whole number of kobo)
PASS negative amount (amount must be a positive whole number of kobo)
PASS fractional kobo (amount must be a positive whole number of kobo)
PASS data is an array (missing data object)
PASS body is null (missing data object)
PASS empty wallet id (walletId must be a non-empty string)
```

You can also test that a function does *not* return `any`, which is what quietly happens when someone removes the `unknown` annotation. Assign the result to an unrelated type under `// @ts-expect-error`. A real type makes that an error, as expected. An `any` is assignable to everything, so the directive becomes unused and the check fails:

no-any.types-test.ts

```ts
import { parseEvent } from "./events.js";

// @ts-expect-error: parseEvent must return a typed result, never any
const notAString: string = parseEvent("{}");

console.log(typeof notAString);
```

Output of `npx tsx no-any.types-test.ts` and of the browser terminal

```ts
object
```

## In production

- **Annotate every boundary as `unknown`**: `JSON.parse`, `response.json()`, message payloads, file contents, `catch` variables. Keep the `unknown` for as few lines as possible, then return a checked type.
- **Keep `strict` on.** It includes `noImplicitAny` and `useUnknownInCatchVariables`. [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig) covers each flag.
- **Let a linter find the explicit ones.** typescript-eslint's `no-explicit-any` and the `no-unsafe-*` rules (assignment, member access, call, return) report every place an `any` is used, which the compiler never will.
- **Treat untyped libraries as boundaries.** Wrap them in one small module with honest types, so their `any` stops at the wrapper.
- **Know the `void` callback trap**, and do not pass async functions to `forEach`, event emitters or anything else that ignores their promise.
- **Replace `{}` and `Object`** in parameter types with `unknown`, `Record<string, unknown>` or a real interface.

## Practice

TRY IT YOURSELF

### Stop the spread

This loader compiles, but every caller gets `any`. Change it so that it returns a checked `{ name: string; limitKobo: number }` or throws an `Error` explaining what is wrong. Do not use `any` or `as`.

limits.ts

```ts
function loadLimits(json: string) {
  const config = JSON.parse(json);
  return config.tier;
}

const tier = loadLimits('{"tier": {"name": "gold", "limitKobo": "50000000"}}');
console.log(tier.name, tier.limitKobo * 2);
```

  gold 100000000

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check `config` the way `loadAddress` checks `data`: `typeof config !== "object" || config === null || !("tier" in config)` before reading `config.tier`.

HINT 2

Repeat the pattern for `tier.name` (must be `"string"`) and `tier.limitKobo` (must be `"number"`), throwing a specific message for each, then return the checked values.

SOLUTION

limits.ts

```ts
interface Tier {
  name: string;
  limitKobo: number;
}

function loadLimits(json: string): Tier {
  const config: unknown = JSON.parse(json);
  if (typeof config !== "object" || config === null || !("tier" in config)) throw new Error("missing tier");
  const tier = config.tier;
  if (typeof tier !== "object" || tier === null) throw new Error("tier must be an object");
  if (!("name" in tier) || typeof tier.name !== "string") throw new Error("tier.name must be a string");
  if (!("limitKobo" in tier) || typeof tier.limitKobo !== "number") throw new Error("tier.limitKobo must be a number");
  return { name: tier.name, limitKobo: tier.limitKobo };
}

for (const json of ['{"tier": {"name": "gold", "limitKobo": 50000000}}', '{"tier": {"name": "gold", "limitKobo": "50000000"}}']) {
  try {
    const tier = loadLimits(json);
    console.log(tier.name, tier.limitKobo * 2);
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx limits.ts` and of the browser terminal

```ts
gold 100000000
Error: tier.limitKobo must be a number
```

The original printed a doubled limit that happened to be right, because `"50000000" * 2` converts the string. A `+` anywhere would have concatenated instead. The checked version refuses the string outright.

TRY IT YOURSELF

### The empty cart

Fix this so it compiles without changing the order of the lines: the cart starts empty and items are added later.

cart.ts

```ts
const cart = { customer: "Ada", items: [] };

cart.items.push({ sku: "RICE-5KG", price: 9500, quantity: 1 });
cart.items.push({ sku: "OIL-1L", price: 2800, quantity: 2 });
console.log(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
```

What `npx tsc --noEmit` prints

```ts
cart.ts:3:17 - error TS2345: Argument of type '{ sku: string; price: number; quantity: number; }' is not assignable to parameter of type 'never'.

3 cart.items.push({ sku: "RICE-5KG", price: 9500, quantity: 1 });
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

cart.ts:4:17 - error TS2345: Argument of type '{ sku: string; price: number; quantity: number; }' is not assignable to parameter of type 'never'.

4 cart.items.push({ sku: "OIL-1L", price: 2800, quantity: 2 });
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

cart.ts:5:57 - error TS2339: Property 'price' does not exist on type 'never'.

5 console.log(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
                                                          ~~~~~

cart.ts:5:70 - error TS2339: Property 'quantity' does not exist on type 'never'.

5 console.log(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
                                                                       ~~~~~~~~


Found 4 errors in the same file, starting at: cart.ts:3
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Uncomment the two interfaces, and annotate the cart: `const cart: Cart = { customer: "Ada", items: [] };`. That gives the empty array a real element type instead of `never[]`.

HINT 2

The total still needs finishing: `cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)`.

SOLUTION

cart.ts

```ts
interface CartItem {
  sku: string;
  price: number;
  quantity: number;
}

interface Cart {
  customer: string;
  items: CartItem[];
}

const cart: Cart = { customer: "Ada", items: [] };

cart.items.push({ sku: "RICE-5KG", price: 9500, quantity: 1 });
cart.items.push({ sku: "OIL-1L", price: 2800, quantity: 2 });
console.log(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
```

Output of `npx tsx cart.ts` and of the browser terminal

```ts
15100
```

Without a type, `items: []` is `never[]`, which is why every `push` was refused and why `item` in the `reduce` had no properties. The `Cart` interface gives the empty array its element type.

TRY IT YOURSELF

### Wait for every notification

This sends three SMS messages and then prints a summary, but the summary comes first. Explain why the compiler allowed it, then fix it so all three are sent at the same time and the summary comes last.

sms.ts

```ts
async function sendSms(to: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`sms sent to ${to}`);
}

const phones = ["0803 000 1111", "0805 222 3333", "0807 444 5555"];
phones.forEach(async (phone) => {
  await sendSms(phone);
});
console.log(`${phones.length} messages sent`);
```

  3 messages sent sms sent to 0803 000 1111 sms sent to 0805 222 3333 sms sent to 0807 444 5555

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`forEach`'s callback type returns `void`, so a callback that returns a promise is accepted, but nothing waits for it: the three sends and the last line all start at once.

HINT 2

Replace the `forEach` block with `await Promise.all(phones.map((phone) => sendSms(phone)));`, then the final `console.log`.

SOLUTION

`forEach` expects a callback returning `void`, and a function that returns a promise is allowed where the result is ignored. So `forEach` starts three sends and returns immediately. `Promise.all` waits for all of them, which run at the same time:

sms.ts

```ts
async function sendSms(to: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`sms sent to ${to}`);
}

const phones = ["0803 000 1111", "0805 222 3333", "0807 444 5555"];
await Promise.all(phones.map((phone) => sendSms(phone)));
console.log(`${phones.length} messages sent`);
```

Output of `npx tsx sms.ts` and of the browser terminal

```ts
sms sent to 0803 000 1111
sms sent to 0805 222 3333
sms sent to 0807 444 5555
3 messages sent
```

## Recap

- `unknown` is the top type: every value fits, and you must check before use. `never` is the bottom type: no value fits. `any` is an exit from checking in both directions.
- `any` spreads through every property, call and return. It enters from `JSON.parse`, `response.json()`, untyped libraries and explicit `any`; `strict` only stops the implicit kinds.
- Give outside data the type `unknown` where it enters, check it, and return a checked type. `catch` variables are `unknown` too.
- `never` is the return type of functions that cannot return, the leftover after exhaustive narrowing, and the element type of an empty array literal inside an object.
- `void` on a declaration means "returns nothing"; on a function type it means "the result is ignored", which lets async callbacks run unwaited.
- `object` means non-primitive; `{}` and `Object` accept almost anything, including numbers. Use `unknown`, `Record<string, unknown>` or a real interface instead.

Next: [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing), every way to turn a wide type such as `unknown` into a precise one.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
