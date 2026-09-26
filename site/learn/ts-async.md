---
title: "Async TypeScript — ZudoJS Academy"
description: "Type async functions precisely, keep Promise.all tuples intact, narrow allSettled results, use Awaited, and page through an API with async generators."
source: https://zudojs.oyinlola.site/learn/ts-async
---

LEVEL 5 · LESSON 23 OF 23

Types meet the runtime Foundation

# Async TypeScript

Type async functions precisely, keep Promise.all tuples intact, narrow allSettled results, use Awaited, and page through an API with async generators.

- **55 min** to read and try
- **You need:** Typed error handling, Designing generic APIs, Combining promises and Generators
- **You build:** A typed client for a payments API - a parallel dashboard loader, a settled-results report, a timeout helper and an async generator that pages through transactions

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read and write the types of async functions, and know why their return type is always a Promise
- Keep Promise.all results as a typed tuple, and spot when they collapse into an array of unions
- Narrow allSettled results and write generic helpers with Awaited and Promise of never
- Find the async mistakes the compiler cannot see, such as async callbacks passed to filter and forEach
- Type async iterables and generators, and page through an API lazily

## The payout filter that let everything through

A payouts job runs every evening. It sends each seller's money unless a fraud check flags the payout, in which case the payout is held for review. The fraud check calls another service, so it is `async`:

payouts.ts

```ts
interface Payout {
  id: string;
  sellerId: string;
  kobo: number;
}

async function isSuspicious(payout: Payout): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return payout.kobo > 10_000_000;
}

const payouts: Payout[] = [
  { id: "PO-1", sellerId: "S-1", kobo: 450_000 },
  { id: "PO-2", sellerId: "S-2", kobo: 25_000_000 },
  { id: "PO-3", sellerId: "S-3", kobo: 90_000 },
];

const toReview = payouts.filter(async (payout) => await isSuspicious(payout));
const toPay = payouts.filter(async (payout) => !(await isSuspicious(payout)));

console.log("review:", toReview.map((payout) => payout.id));
console.log("pay:", toPay.map((payout) => payout.id));
```

Output of `npx tsx payouts.ts` and of the browser terminal

```ts
review: [ 'PO-1', 'PO-2', 'PO-3' ]
pay: [ 'PO-1', 'PO-2', 'PO-3' ]
```

Every payout is paid *and* held for review, including the ₦250,000 one the check was written to stop. `filter` expects its callback to return a boolean-ish value right now. An `async` callback returns a `Promise`, and a promise object is always truthy, so every item is kept. And it compiled without a word, because `filter`'s callback type allows any return value.

The same mistake in an `if` *is* caught:

forgot-await.ts

```ts
async function isSuspicious(kobo: number): Promise<boolean> {
  return kobo > 10_000_000;
}

async function releasePayout(kobo: number): Promise<string> {
  if (isSuspicious(kobo)) return "held for review";
  return "paid";
}
```

What `npx tsc --noEmit` prints

```ts
forgot-await.ts:6:7 - error TS2801: This condition will always return true since this 'Promise<boolean>' is always defined.

6   if (isSuspicious(kobo)) return "held for review";
        ~~~~~~~~~~~~~~~~~~

  forgot-await.ts:6:7 - Did you forget to use 'await'?
    6   if (isSuspicious(kobo)) return "held for review";
            ~~~~~~~~~~~~~~~~~~


Found 1 error in forgot-await.ts:6
```

That is async TypeScript in a nutshell. Promises have precise types, and the compiler uses them well in most places, but there are gaps: callbacks whose return value is ignored, values typed `any`, arrays that lose their shape. This lesson shows the types behind `async` code so you can tell which situation you are in. The runtime behaviour of promises, combinators and async generators is covered in [Promises in depth](https://zudojs.oyinlola.site/learn/js-promises), [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators) and [Generators](https://zudojs.oyinlola.site/learn/js-generators#async); here you add the types.

## Promise<T> and async functions

`Promise<T>` is a generic interface: a promise that, when it fulfils, gives a value of type `T`. An `async` function *always* returns a promise, whatever its body returns, so its return type is always `Promise<…>`. When you leave it out, TypeScript infers it from the `return` statements.

To show inferred types without an editor, this lesson uses two tiny **type-level test** helpers. `Equal<A, B>` is `true` when two types are identical, and `Expect` only accepts `true`, so a line like `type t = Expect<Equal<X, number>>` compiles only if `X` really is `number`. How `Equal` works is a puzzle for [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types); for now, use it:

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

inferred.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

async function getBalance(accountId: string) {
  if (accountId === "") throw new Error("account id required");
  return 250_000;
}

async function getAccount(accountId: string) {
  return { accountId, balanceKobo: await getBalance(accountId) };
}

async function recordAudit(message: string) {
  console.log(`audit: ${message}`);
}

type T1 = Expect<Equal<ReturnType<typeof getBalance>, Promise<number>>>;
type T2 = Expect<Equal<ReturnType<typeof getAccount>, Promise<{ accountId: string; balanceKobo: number }>>>;
type T3 = Expect<Equal<ReturnType<typeof recordAudit>, Promise<void>>>;

console.log(await getAccount("ACC-1"));
await recordAudit("balance read");
```

Output of `npx tsx inferred.ts` and of the browser terminal

```json
{ accountId: 'ACC-1', balanceKobo: 250000 }
audit: balance read
```

This file compiling *is* the test: if any of the three types were different, `tsc` would fail on its line. `getBalance` returns a number, so it is `Promise<number>`. A function that returns nothing is `Promise<void>`. Inside `getAccount`, `await getBalance(…)` has type `number`: `await` removes one `Promise` layer at the type level exactly as it does at runtime.

### Annotating async functions

For exported functions, write the return type ([Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#when-to-annotate) explains why public boundaries deserve annotations). The annotation must be `Promise<T>`, and the body is then checked against `T`:

annotated.ts

```ts
export async function getBalance(accountId: string): number {
  return 250_000;
}

export async function getRate(currency: string): Promise<number> {
  return currency === "USD" ? "1540.25" : 1;
}
```

What `npx tsc --noEmit` prints

```ts
annotated.ts:1:54 - error TS1064: The return type of an async function or method must be the global Promise<T> type. Did you mean to write 'Promise<number>'?

1 export async function getBalance(accountId: string): number {
                                                       ~~~~~~

annotated.ts:6:31 - error TS2322: Type 'string' is not assignable to type 'number'.

6   return currency === "USD" ? "1540.25" : 1;
                                ~~~~~~~~~


Found 2 errors in the same file, starting at: annotated.ts:1
```

In the second function, `return` is checked against `number`, not `Promise<number>`: inside an async function you return the plain value, and the function wraps it. Returning another promise is also fine, because promises flatten: `return getBalance(id)` in a function typed `Promise<number>` compiles, and the caller still gets a `number` after one `await`. A `Promise<Promise<number>>` cannot exist at runtime.

## new Promise<T> and wrapping callbacks

Older libraries report results through callbacks. To use them with `await`, you wrap them in `new Promise`. The constructor is generic, `new Promise<T>(executor)`, and `T` is the type `resolve` accepts. If nothing tells TypeScript what `T` is, it becomes `unknown`:

rate.ts

```ts
const rate = new Promise((resolve) => setTimeout(() => resolve(1540.25), 10));
const kobo = (await rate) * 100;
```

What `npx tsc --noEmit` prints

```ts
rate.ts:2:14 - error TS2571: Object is of type 'unknown'.

2 const kobo = (await rate) * 100;
               ~~~~~~~~~~~~


Found 1 error in rate.ts:2
```

Give `T` explicitly, or let an annotated return type provide it. Here is a legacy bank-lookup SDK wrapped the typed way:

bank-lookup.ts

```ts
type Callback<T> = (error: Error | null, result?: T) => void;

function legacyLookupBank(code: string, callback: Callback<string>): void {
  const banks: Record<string, string> = { "058": "GTBank", "044": "Access Bank" };
  setTimeout(() => {
    const name = banks[code];
    if (name === undefined) callback(new Error(`unknown bank code ${code}`));
    else callback(null, name);
  }, 5);
}

function lookupBank(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    legacyLookupBank(code, (error, name) => {
      if (error !== null) reject(error);
      else if (name === undefined) reject(new Error("bank lookup returned nothing"));
      else resolve(name);
    });
  });
}

console.log(await lookupBank("058"));
try {
  await lookupBank("999");
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx bank-lookup.ts` and of the browser terminal

```ts
GTBank
unknown bank code 999
```

The return type `Promise<string>` flows into `new Promise` by contextual typing, so `resolve` accepts only a `string`. That is why the callback checks `name === undefined`: the SDK's type says `result?: T`, and `resolve(name)` with a possibly-undefined name would not compile. `reject`, on the other hand, takes `any` (a rejection has no type, as you saw in [Typed error handling](https://zudojs.oyinlola.site/learn/ts-errors#async)). Node's `util.promisify` does this wrapping for callbacks in Node's error-first style.

`Promise.withResolvers<T>()` gives you the promise and its two functions separately, typed by the same `T`, which suits events that arrive later from elsewhere:

webhook-wait.ts

```ts
interface PaymentEvent {
  reference: string;
  status: "success" | "failed";
}

const waiting = new Map<string, (event: PaymentEvent) => void>();

function waitForWebhook(reference: string): Promise<PaymentEvent> {
  const { promise, resolve } = Promise.withResolvers<PaymentEvent>();
  waiting.set(reference, resolve);
  return promise;
}

function onWebhook(event: PaymentEvent): void {
  waiting.get(event.reference)?.(event);
  waiting.delete(event.reference);
}

setTimeout(() => onWebhook({ reference: "TRF-77", status: "success" }), 10);
const event = await waitForWebhook("TRF-77");
console.log(event.reference, event.status);
```

Output of `npx tsx webhook-wait.ts` and of the browser terminal

```ts
TRF-77 success
```

## Awaited: the type of await

`await` unwraps a promise, and a promise of a promise, and anything with a `then` method (a **thenable**, the `PromiseLike<T>` type). It leaves other values alone. The type that describes this is the built-in `Awaited<T>`:

awaited.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Account {
  id: string;
  balanceKobo: number;
}

type A1 = Expect<Equal<Awaited<Promise<Account>>, Account>>;
type A2 = Expect<Equal<Awaited<Promise<Promise<number>>>, number>>;
type A3 = Expect<Equal<Awaited<PromiseLike<boolean>>, boolean>>;
type A4 = Expect<Equal<Awaited<string>, string>>;
type A5 = Expect<Equal<Awaited<Promise<number> | string>, number | string>>;

async function loadAccount(id: string): Promise<Account> {
  return { id, balanceKobo: 125_000 };
}

type Loaded = Awaited<ReturnType<typeof loadAccount>>;
const account: Loaded = await loadAccount("ACC-9");
console.log(account.balanceKobo);
```

Output of `npx tsx awaited.ts` and of the browser terminal

```ts
125000
```

`Awaited<ReturnType<typeof fn>>` is the everyday use: the type an async function eventually produces, without writing it again. [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types) rebuilds `Awaited` yourself.

### Why generic async helpers need Awaited

Awaited matters most in generic code. Here is a helper that runs a task and logs how it went. The task may return a plain value or a promise, so its type is `() => T`. The first attempt at its return type is `Promise<T>`, and the function body compiles. The trouble shows up at a call site:

with-audit-wrong.ts

```ts
async function withAudit<T>(label: string, task: () => T): Promise<T> {
  const result = await task();
  console.log(`${label}: done`);
  return result;
}

withAudit("balance", async () => ({ balanceKobo: 900_000 })).then((balance) => {
  console.log(balance.balanceKobo);
});
```

What `npx tsc --noEmit` prints

```ts
with-audit-wrong.ts:8:23 - error TS2339: Property 'balanceKobo' does not exist on type 'Promise<{ balanceKobo: number; }>'.

8   console.log(balance.balanceKobo);
                        ~~~~~~~~~~~

  with-audit-wrong.ts:8:23 - Did you forget to use 'await'?
    8   console.log(balance.balanceKobo);
                            ~~~~~~~~~~~


Found 1 error in with-audit-wrong.ts:8
```

At runtime `balance` is the object: `await task()` unwrapped the promise. But the signature says otherwise. The task returns `Promise<{ balanceKobo: number }>`, so `T` is that promise, and `Promise<T>` claims the helper resolves to a promise, which can never happen. The signature lies, and a correct caller is rejected. (The compiler's hint about `await` is a red herring here: the fix belongs in the signature.) The honest return type is `Promise<Awaited<T>>`:

with-audit.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

async function withAudit<T>(label: string, task: () => T): Promise<Awaited<T>> {
  const result = await task();
  console.log(`${label}: done`);
  return result;
}

const fromSync = await withAudit("fee", () => 1500);
const fromAsync = await withAudit("balance", async () => ({ balanceKobo: 900_000 }));

type W1 = Expect<Equal<typeof fromSync, number>>;
type W2 = Expect<Equal<typeof fromAsync, { balanceKobo: number }>>;
console.log(fromSync, fromAsync.balanceKobo);
```

Output of `npx tsx with-audit.ts` and of the browser terminal

```ts
fee: done
balance: done
1500 900000
```

## Promise.all and tuple types

A dashboard needs an account, its recent transactions and today's exchange rate. They do not depend on each other, so you start all three at once with `Promise.all`. Its type is written so that an array literal of promises produces a **tuple** of results, each in its own position with its own type:

api.ts

```ts
export interface Account {
  id: string;
  name: string;
  balanceKobo: number;
}

export interface Transaction {
  id: string;
  kobo: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function loadAccount(id: string): Promise<Account> {
  await wait(20);
  return { id, name: "Ada Stores", balanceKobo: 4_500_000 };
}

export async function loadTransactions(accountId: string): Promise<Transaction[]> {
  await wait(10);
  return [{ id: `${accountId}-T1`, kobo: 250_000 }, { id: `${accountId}-T2`, kobo: -80_000 }];
}

export async function loadRate(currency: "USD" | "GBP"): Promise<number> {
  await wait(5);
  return currency === "USD" ? 1540.25 : 1950.5;
}
```

dashboard.ts

```ts
import { loadAccount, loadRate, loadTransactions } from "./api.js";
import type { Account, Transaction } from "./api.js";

const [account, transactions, usdRate] = await Promise.all([
  loadAccount("ACC-1"),
  loadTransactions("ACC-1"),
  loadRate("USD"),
]);

const typed: [Account, Transaction[], number] = [account, transactions, usdRate];
console.log(account.name, transactions.length, usdRate);
console.log(`balance in dollars: ${(account.balanceKobo / 100 / usdRate).toFixed(2)}`, typed.length);
```

Output of `npx tsx dashboard.ts` and of the browser terminal

```ts
Ada Stores 2 1540.25
balance in dollars: 29.22 3
```

Each variable has its own type, so `account.name` and `transactions.length` both compile, and the line that assigns them to `[Account, Transaction[], number]` proves it. Under the hood, `Promise.all` is declared with a type parameter for the whole input tuple and a mapped type that applies `Awaited` to each position, which you will be able to read yourself after [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types).

### When the tuple collapses

The tuple only exists when TypeScript sees an array literal. Build the array first, and it is inferred as an ordinary array whose element type is a union. The positions are lost:

collapsed.ts

```ts
import { loadAccount, loadRate } from "./api.js";

const jobs = [loadAccount("ACC-1"), loadRate("USD")];
const [account, rate] = await Promise.all(jobs);
console.log(account.name, rate.toFixed(2));
```

What `npx tsc --noEmit` prints

```ts
collapsed.ts:5:21 - error TS2339: Property 'name' does not exist on type 'number | Account'.
  Property 'name' does not exist on type 'number'.

5 console.log(account.name, rate.toFixed(2));
                      ~~~~

collapsed.ts:5:32 - error TS2339: Property 'toFixed' does not exist on type 'number | Account'.
  Property 'toFixed' does not exist on type 'Account'.

5 console.log(account.name, rate.toFixed(2));
                                 ~~~~~~~


Found 2 errors in the same file, starting at: collapsed.ts:5
```

`jobs` is `(Promise<Account> | Promise<number>)[]`, so each result is `Account | number`, and neither `name` nor `toFixed` is safe. Add `as const` to keep the tuple (from [Tuples](https://zudojs.oyinlola.site/learn/ts-tuples#inference)):

collapsed.ts

```ts
import { loadAccount, loadRate } from "./api.js";

const jobs = [loadAccount("ACC-1"), loadRate("USD")] as const;
const [account, rate] = await Promise.all(jobs);
console.log(account.name, rate.toFixed(2));
```

Output of `npx tsx collapsed.ts` and of the browser terminal

```ts
Ada Stores 1540.25
```

When the promises really are a list of the same kind, the array type is exactly right: `Promise.all(ids.map(loadAccount))` gives `Account[]`. The tuple matters when the positions have different types.

## race, any and a typed timeout

`Promise.race` and `Promise.any` settle with *one* of their inputs, so their result type is the union of the input types. That union is how a typed timeout works. A promise that can only reject never produces a value, so its type is `Promise<never>`, and `T | never` is just `T`:

timeout.ts

```ts
export async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function slowRate(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return 1540.25;
}

console.log(await withTimeout(slowRate(), 200, "rate lookup"));
try {
  await withTimeout(slowRate(), 10, "rate lookup");
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx timeout.ts` and of the browser terminal

```ts
1540.25
rate lookup timed out after 10 ms
```

Three typed details make this helper safe to reuse. `Promise.race([task, timeout])` is `Promise<T | never>`, which is `Promise<T>`, so callers get their own type back. `ReturnType<typeof setTimeout>` is the timer's type in whatever environment you compile for (a `Timeout` object in Node, a number in browsers), so you never write either. And the `finally` clears the timer; without it every successful call would leave a timer running, which keeps a Node process alive. The slow task that lost the race is not cancelled, only ignored; real cancellation uses an `AbortSignal` ([Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency)).

`Promise.any` has the same union result type. When every input rejects, it rejects with an `AggregateError`, whose `errors` property is typed `any[]`. Treat its entries as `unknown`.

## Promise.allSettled and narrowing results

A dashboard should still load when the exchange-rate widget fails. `Promise.allSettled` never rejects; it gives a result object per promise, typed `PromiseSettledResult<T>`. That type is a discriminated union on `status`:

| Member | `status` | Other property |
| --- | --- | --- |
| `PromiseFulfilledResult<T>` | `"fulfilled"` | `value: T` |
| `PromiseRejectedResult` | `"rejected"` | `reason: any` |

With an array literal you again get a tuple, so each position is narrowed on its own:

settled.ts

```ts
async function loadBalance(): Promise<number> {
  return 4_500_000;
}

async function loadRate(): Promise<number> {
  throw new Error("rates service returned 503");
}

async function loadAlerts(): Promise<string[]> {
  return ["New login from Lagos"];
}

const [balance, rate, alerts] = await Promise.allSettled([loadBalance(), loadRate(), loadAlerts()]);

const lines: string[] = [];
lines.push(balance.status === "fulfilled" ? `balance ₦${balance.value / 100}` : "balance unavailable");
if (rate.status === "fulfilled") {
  lines.push(`$1 = ₦${rate.value}`);
} else {
  const reason: unknown = rate.reason;
  lines.push(`rate unavailable (${reason instanceof Error ? reason.message : String(reason)})`);
}
if (alerts.status === "fulfilled") lines.push(...alerts.value.map((alert) => `alert: ${alert}`));
console.log(lines.join("\n"));
```

Output of `npx tsx settled.ts` and of the browser terminal

```ts
balance ₦45000
rate unavailable (rates service returned 503)
alert: New login from Lagos
```

After `rate.status === "fulfilled"`, `rate.value` is a `number`; in the `else`, only `reason` exists. `reason` is `any`, so the example copies it into an `unknown` variable first, and the compiler then insists on narrowing it.

### Splitting a list of settled results

For a list of the same kind of promise, split the results into successes and failures. Since TypeScript 5.5, an arrow function that just checks the discriminant is inferred as a type guard, so `filter` narrows the element type:

settle-list.ts

```ts
async function sendReceipt(email: string): Promise<string> {
  if (!email.includes("@")) throw new Error(`invalid address: ${email}`);
  return `sent to ${email}`;
}

const emails = ["ada@example.com", "grace.example.com", "tunde@example.com"];
const results = await Promise.allSettled(emails.map(sendReceipt));

const sent = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
const failed = results.filter((result) => result.status === "rejected").map((result) => String(result.reason));

console.log(sent);
console.log(failed);
```

Output of `npx tsx settle-list.ts` and of the browser terminal

```json
[ 'sent to ada@example.com', 'sent to tunde@example.com' ]
[ 'Error: invalid address: grace.example.com' ]
```

`sent` is a `string[]` with no casts: the first `filter` narrowed each element to `PromiseFulfilledResult<string>`, so `.value` is allowed. The order of `results` matches the order of `emails`, whichever send finished first.

## Async callbacks the compiler cannot check

Back to the opening bug. A callback type decides what may be returned from a callback. When the parameter type says the return value is `void` or `unknown`, TypeScript accepts a function that returns a promise, and the promise is silently ignored. The common victims:

| Call | Callback return type | What an async callback does |
| --- | --- | --- |
| `array.filter(fn)` | `unknown` | Keeps every item: a promise is truthy |
| `array.some(fn)`, `every(fn)`, `find(fn)` | `unknown` | Answers from the truthiness of a promise |
| `array.forEach(fn)` | `void` | Starts every call and returns before any finishes; rejections float |
| `setTimeout(fn)`, `emitter.on(event, fn)` | `void` | Nobody awaits the promise; rejections float |

Here is the `forEach` case, in a receipts job:

foreach.ts

```ts
async function sendReceipt(orderId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`receipt sent for ${orderId}`);
}

async function sendAllReceipts(orderIds: string[]): Promise<void> {
  orderIds.forEach(async (orderId) => {
    await sendReceipt(orderId);
  });
  console.log("all receipts sent");
}

await sendAllReceipts(["ORD-1", "ORD-2"]);
console.log("job finished");
```

Output of `npx tsx foreach.ts` and of the browser terminal

```ts
all receipts sent
job finished
receipt sent for ORD-1
receipt sent for ORD-2
```

The job reports success before anything was sent. `forEach` calls each callback, gets back a promise it does not look at, and returns. The fixes are to say which shape you want: one at a time with `for...of`, or all at once with `Promise.all` and `map`, whose callback return type *is* kept, so the result is a `Promise<void>[]` you can await:

foreach-fixed.ts

```ts
async function sendReceipt(orderId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`receipt sent for ${orderId}`);
}

async function sendAllReceipts(orderIds: string[]): Promise<void> {
  await Promise.all(orderIds.map((orderId) => sendReceipt(orderId)));
  console.log("all receipts sent");
}

async function isSuspicious(kobo: number): Promise<boolean> {
  return kobo > 10_000_000;
}

async function filterAsync<T>(items: readonly T[], predicate: (item: T) => Promise<boolean>): Promise<T[]> {
  const keep = await Promise.all(items.map(predicate));
  return items.filter((_, index) => keep[index]);
}

await sendAllReceipts(["ORD-1", "ORD-2"]);
console.log(await filterAsync([450_000, 25_000_000, 90_000], isSuspicious));
```

Output of `npx tsx foreach-fixed.ts` and of the browser terminal

```ts
receipt sent for ORD-1
receipt sent for ORD-2
all receipts sent
[ 25000000 ]
```

`filterAsync` fixes the payout job from the first section: it waits for all the answers, then filters synchronously on the real booleans. The type of `predicate`, `(item: T) => Promise<boolean>`, documents that it expects an async check. For the cases the compiler cannot see, the linter can: `@typescript-eslint/no-misused-promises` reports a promise-returning function passed where a `void` or boolean-ish callback is expected, and `no-floating-promises` reports promises nobody handles.

## Async iterables and async generators

A payments API returns transactions in **pages**: twenty at a time, with a **cursor** (an opaque string) that asks for the next page. Code that wants "every transaction" should not have to know about pages. The iterator protocol from [Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators) has an async version for this, and TypeScript types all of it:

| Type | Means |
| --- | --- |
| `AsyncIterable<T>` | Has a `[Symbol.asyncIterator]()` method; usable in `for await...of` |
| `AsyncIterator<T>` | Has `next()`, returning `Promise<IteratorResult<T>>` |
| `AsyncGenerator<T, TReturn, TNext>` | What an `async function*` returns: yields `T`, finishes with `TReturn`, receives `TNext` from `next(value)`. It is both of the above. |

First the page type and a fake API that counts its requests:

pages.ts

```ts
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Transaction {
  id: string;
  kobo: number;
}

const PAGES: Record<string, Page<Transaction>> = {
  start: { items: [{ id: "T1", kobo: 250_000 }, { id: "T2", kobo: -80_000 }], nextCursor: "c2" },
  c2: { items: [{ id: "T3", kobo: 1_200_000 }], nextCursor: "c3" },
  c3: { items: [{ id: "T4", kobo: -15_000 }, { id: "T5", kobo: 60_000 }], nextCursor: null },
};

export const stats = { requests: 0 };

export async function fetchTransactions(cursor: string | null): Promise<Page<Transaction>> {
  stats.requests += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const page = PAGES[cursor ?? "start"];
  if (page === undefined) throw new Error(`unknown cursor ${cursor}`);
  return page;
}
```

Now a generic pager. It takes any function that fetches a page of `T` and yields the items one by one:

paginate.ts

```ts
import type { Page } from "./pages.js";

export async function* paginate<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  maxPages = 100,
): AsyncGenerator<T, number, undefined> {
  let cursor: string | null = null;
  let pages = 0;
  do {
    if (pages === maxPages) throw new Error(`stopped after ${maxPages} pages: the cursor never ended`);
    const page = await fetchPage(cursor);
    pages += 1;
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
  return pages;
}
```

- `AsyncGenerator<T, number, undefined>`: it yields items of type `T`, returns the number of pages it read when it finishes, and expects nothing from `next()`.
- `T` is inferred from the argument, so the same pager works for transactions, customers or refunds.
- `maxPages` guards against an API that keeps returning a cursor forever, a real failure mode. The `let cursor: string | null` annotation is needed because `null` alone would be inferred as the type `null`.

totals.ts

```ts
import { fetchTransactions, stats } from "./pages.js";
import { paginate } from "./paginate.js";

let net = 0;
for await (const transaction of paginate(fetchTransactions)) {
  net += transaction.kobo;
}
console.log(`net ₦${net / 100} from ${stats.requests} requests`);

stats.requests = 0;
for await (const transaction of paginate(fetchTransactions)) {
  if (transaction.kobo > 1_000_000) {
    console.log(`first large transaction: ${transaction.id}`);
    break;
  }
}
console.log(`stopped early after ${stats.requests} requests`);
```

Output of `npx tsx totals.ts` and of the browser terminal

```ts
net ₦14150 from 3 requests
first large transaction: T3
stopped early after 2 requests
```

In the loop, `transaction` is a `Transaction`, inferred all the way from `fetchTransactions`. The second loop shows the laziness that makes this worth it: it found what it needed on page two and `break` stopped the generator, so page three was never requested.

### Driving the generator by hand

`for await` hides the `IteratorResult`. Calling `next()` yourself shows it: a union discriminated by `done`, where the yielded type and the return type sit on different sides:

manual.ts

```ts
import { fetchTransactions } from "./pages.js";
import { paginate } from "./paginate.js";

const pager = paginate(fetchTransactions);
let step = await pager.next();
const ids: string[] = [];
while (!step.done) {
  ids.push(step.value.id);
  step = await pager.next();
}
console.log(ids.join(","), "| pages read:", step.value);
```

Output of `npx tsx manual.ts` and of the browser terminal

```ts
T1,T2,T3,T4,T5 | pages read: 3
```

While `done` is `false`, `step.value` is a `Transaction`. After the loop, `done` is `true`, so `step.value` is the `number` the generator returned. With a return type of `void`, that last value would be `undefined`, which is the common case.

### A class that is async iterable

Any object with a `[Symbol.asyncIterator]` method works with `for await`. Declaring `implements AsyncIterable<T>` makes the compiler check the method. Returning a generator from it is the shortest implementation:

statement.ts

```ts
import { fetchTransactions } from "./pages.js";
import type { Transaction } from "./pages.js";
import { paginate } from "./paginate.js";

class Statement implements AsyncIterable<Transaction> {
  private readonly minimumKobo: number;

  constructor(minimumKobo: number) {
    this.minimumKobo = minimumKobo;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Transaction, void, undefined> {
    for await (const transaction of paginate(fetchTransactions)) {
      if (Math.abs(transaction.kobo) >= this.minimumKobo) yield transaction;
    }
  }
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

const large = await collect(new Statement(100_000));
console.log(large.map((transaction) => `${transaction.id}:${transaction.kobo}`));
```

Output of `npx tsx statement.ts` and of the browser terminal

```json
[ 'T1:250000', 'T3:1200000' ]
```

`collect` accepts any `AsyncIterable<T>`: the class, a generator, or a Node.js stream. `Array.fromAsync` does the same job, but its types live in the `esnext` library, so with `"target": "ES2024"` the compiler does not know it yet. A small typed helper like this is a fine alternative.

## Build: a typed payments API client

REASON IT OUT

### Before you write the client

You are writing the client your dashboard uses to talk to the payments API: fetch the merchant profile, the balance and the exchange rate, and stream all settlements. Before reading the code, think:

- What type does `await response.json()` give you, and what can you trust about the data?
- Which calls must succeed for the dashboard to make sense, and which are optional?
- What should happen when one call hangs?
- What happens if the settlements endpoint keeps sending a `nextCursor`?
- Where should the types come from, so that a change in one place is checked everywhere?

**Show the reasoning**

With the browser's DOM types (which TypeScript includes when `lib` is not set), `response.json()` is typed `Promise<any>`, a hole in every type after it; Node's own types say `Promise<unknown>`, which is honest but still unchecked. Either way: the data comes from another program, and no type makes it correct. So every response goes through a parser that takes `unknown` and returns a checked type, the pattern from [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation). The profile and balance are required (use `Promise.all`, fail fast); the rate is optional (settle it separately). Every request gets a timeout. The pager keeps its page limit. And the types flow from the parsers: the client's methods infer their result types from them, so nothing is written twice.

The API is simulated in-process with the standard `Response` class, which exists in Node.js and browsers, so the client code is exactly what you would write against the real `fetch`:

fake-api.ts

```ts
const routes: Record<string, { status: number; body: unknown; delayMs: number }> = {
  "/merchant": { status: 200, body: { id: "M-17", name: "Ada Stores" }, delayMs: 10 },
  "/balance": { status: 200, body: { availableKobo: 4_500_000, pendingKobo: 120_000 }, delayMs: 5 },
  "/rates/USD": { status: 200, body: { rate: "not-a-number" }, delayMs: 5 },
  "/settlements": { status: 200, body: { items: [{ id: "S1", kobo: 900_000 }], nextCursor: "2" }, delayMs: 5 },
  "/settlements?cursor=2": { status: 200, body: { items: [{ id: "S2", kobo: 1_100_000 }], nextCursor: null }, delayMs: 5 },
};

export async function fakeFetch(path: string): Promise<Response> {
  const route = routes[path];
  await new Promise((resolve) => setTimeout(resolve, route?.delayMs ?? 5));
  if (route === undefined) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  return new Response(JSON.stringify(route.body), { status: route.status });
}
```

Notice the rates endpoint: it returns a string where a number is expected, the kind of surprise a real API delivers on a bad day. First the parsers, each from `unknown` to a checked type:

parsers.ts

```ts
export type Parser<T> = (data: unknown) => T;

function record(data: unknown, what: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new TypeError(`${what}: expected an object`);
  return data as Record<string, unknown>;
}

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${what}: expected a number`);
  return value;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string") throw new TypeError(`${what}: expected a string`);
  return value;
}

export const parseMerchant = (data: unknown) => {
  const r = record(data, "merchant");
  return { id: str(r.id, "merchant.id"), name: str(r.name, "merchant.name") };
};

export const parseBalance = (data: unknown) => {
  const r = record(data, "balance");
  return { availableKobo: num(r.availableKobo, "balance.availableKobo"), pendingKobo: num(r.pendingKobo, "balance.pendingKobo") };
};

export const parseRate = (data: unknown) => num(record(data, "rate").rate, "rate.rate");

export const parseSettlementPage = (data: unknown) => {
  const r = record(data, "page");
  if (!Array.isArray(r.items)) throw new TypeError("page.items: expected an array");
  const items = r.items.map((item: unknown, i) => {
    const s = record(item, `page.items[${i}]`);
    return { id: str(s.id, "settlement.id"), kobo: num(s.kobo, "settlement.kobo") };
  });
  const nextCursor = r.nextCursor === null ? null : str(r.nextCursor, "page.nextCursor");
  return { items, nextCursor };
};
```

The one `as` is backed by the check on the line before it, as in [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#validator). None of the parsers has a written return type; their types are inferred and flow into the client. A schema library such as Zod gives you the same thing with less code, as [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) shows. Now the client:

client.ts

```ts
import { fakeFetch } from "./fake-api.js";
import { parseBalance, parseMerchant, parseRate, parseSettlementPage } from "./parsers.js";
import type { Parser } from "./parsers.js";

async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createClient(fetchImpl: (path: string) => Promise<Response>, timeoutMs = 100) {
  async function get<T>(path: string, parse: Parser<T>): Promise<T> {
    const response = await withTimeout(fetchImpl(path), timeoutMs, `GET ${path}`);
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
    const data: unknown = await response.json();
    return parse(data);
  }

  return {
    merchant: () => get("/merchant", parseMerchant),
    balance: () => get("/balance", parseBalance),
    rate: (currency: "USD" | "GBP") => get(`/rates/${currency}`, parseRate),
    async *settlements() {
      let path: string | null = "/settlements";
      while (path !== null) {
        const page: ReturnType<typeof parseSettlementPage> = await get(path, parseSettlementPage);
        yield* page.items;
        path = page.nextCursor === null ? null : `/settlements?cursor=${page.nextCursor}`;
      }
    },
  };
}

export type Client = ReturnType<typeof createClient>;
export const client: Client = createClient(fakeFetch);
```

The key line is `const data: unknown = await response.json()`. Annotating the result as `unknown` closes the hole whichever types are loaded: from here on the compiler refuses to use `data` until a parser has checked it. `get<T>` infers `T` from the parser, so `client.balance()` is `Promise<{ availableKobo: number; pendingKobo: number }>` without anyone writing that type. `settlements` is an async generator method, `async *settlements()`. Its `page` needs an annotation: `path` is computed from `page`, and `page` from a generic call that takes `path`, so without it TypeScript reports that `page` "is referenced directly or indirectly in its own initializer" (error TS7022). It also needs the page limit from the pager, which is left for you to add. Finally, the dashboard:

dashboard.ts

```ts
import { client } from "./client.js";
import type { Client } from "./client.js";

type Balance = Awaited<ReturnType<Client["balance"]>>;

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

async function loadDashboard(): Promise<string[]> {
  const [[merchant, balance], [rate]] = await Promise.all([
    Promise.all([client.merchant(), client.balance()]),
    Promise.allSettled([client.rate("USD")]),
  ]);

  const available: Balance["availableKobo"] = balance.availableKobo;
  const lines = [`${merchant.name} (${merchant.id})`, `available ${naira(available)}, pending ${naira(balance.pendingKobo)}`];
  if (rate.status === "fulfilled") {
    lines.push(`available in USD: $${(available / 100 / rate.value).toFixed(2)}`);
  } else {
    lines.push(`USD rate unavailable: ${rate.reason instanceof Error ? rate.reason.message : "unknown error"}`);
  }

  let settled = 0;
  for await (const settlement of client.settlements()) settled += settlement.kobo;
  lines.push(`settled so far: ${naira(settled)}`);
  return lines;
}

console.log((await loadDashboard()).join("\n"));
```

Output of `npx tsx dashboard.ts` and of the browser terminal

```ts
Ada Stores (M-17)
available ₦45,000, pending ₦1,200
USD rate unavailable: rate.rate: expected a number
settled so far: ₦20,000
```

Read how each decision from the reasoning shows up:

- All three requests run in parallel. The outer `Promise.all` holds two groups: an inner `Promise.all` for the required data, which fails fast, and an `allSettled` for the optional rate, which never rejects. The tuple types nest, so `merchant`, `balance` and `rate` each get their own type from one destructuring.
- Starting the rate request on its own and awaiting it later would be the "start first, await later" trap from [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators#start-then-await): if it rejected while the other two were still loading, nothing would be listening yet.
- The optional rate failed. The API's bad data was caught by `parseRate`, and the dashboard shows a clear message instead of `$NaN`.
- `Balance` is derived with `Awaited<ReturnType<Client["balance"]>>`, straight from the parser. Change the parser, and every use is re-checked.
- The settlements loop never mentions a page or a cursor.

## Testing async code

Async code needs two kinds of test. Type-level tests pin down what callers see; runtime tests pin down behaviour, including timing and laziness.

### Type-level: the types callers get

client.types.test.ts

```ts
import { client } from "./client.js";
import type { Client } from "./client.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type C1 = Expect<Equal<Awaited<ReturnType<Client["rate"]>>, number>>;
type C2 = Expect<Equal<Awaited<ReturnType<Client["merchant"]>>, { id: string; name: string }>>;
type C3 = Expect<Equal<ReturnType<Client["settlements"]> extends AsyncIterable<infer S> ? S : never, { id: string; kobo: number }>>;

// @ts-expect-error: only USD and GBP are supported
const unsupported = () => client.rate("EUR");

console.log("type tests compiled", typeof unsupported);
```

Output of `npx tsx client.types.test.ts` and of the browser terminal

```ts
type tests compiled function
```

`C3` uses `infer`, which [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types) explains, to pull the item type out of the generator. The `@ts-expect-error` line proves that an unsupported currency is refused. It is wrapped in a function that is never called, because a type test should not send requests: the line is still emitted and would run otherwise.

### Runtime: laziness, limits and timeouts

pager.test.ts

```ts
import type { Page } from "./pages.js";
import { paginate } from "./paginate.js";

function fakeSource(pages: Page<number>[], endless = false) {
  const calls: (string | null)[] = [];
  const fetchPage = async (cursor: string | null): Promise<Page<number>> => {
    calls.push(cursor);
    const index = cursor === null ? 0 : Number(cursor);
    const page = pages[index] ?? { items: [], nextCursor: null };
    return endless ? { items: page.items, nextCursor: String(index) } : page;
  };
  return { calls, fetchPage };
}

async function check(label: string, run: () => Promise<unknown>, expected: string): Promise<void> {
  let actual: string;
  try {
    actual = JSON.stringify(await run());
  } catch (error) {
    actual = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label} -> ${actual}`);
}

const threePages: Page<number>[] = [
  { items: [1, 2], nextCursor: "1" },
  { items: [], nextCursor: "2" },
  { items: [3], nextCursor: null },
];

await check("reads every page, including an empty one", async () => {
  const items: number[] = [];
  for await (const item of paginate(fakeSource(threePages).fetchPage)) items.push(item);
  return items;
}, "[1,2,3]");

await check("fetches lazily", async () => {
  const source = fakeSource(threePages);
  for await (const item of paginate(source.fetchPage)) if (item === 2) break;
  return source.calls;
}, "[null]");

await check("stops an endless cursor", async () => {
  for await (const item of paginate(fakeSource(threePages, true).fetchPage, 5)) void item;
  return "finished";
}, "error: stopped after 5 pages: the cursor never ended");
```

Output of `npx tsx pager.test.ts` and of the browser terminal

```ts
PASS reads every page, including an empty one -> [1,2,3]
PASS fetches lazily -> [null]
PASS stops an endless cursor -> error: stopped after 5 pages: the cursor never ended
```

Each case comes from a question in the reasoning block: empty pages in the middle, stopping early, and an API that never ends. With Vitest, `check` becomes `await expect(run()).resolves.toEqual(…)` or `.rejects.toThrow(…)`, and timeouts are tested with fake timers (`vi.useFakeTimers()`) so the test does not really wait. [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) covers both.

## Async TypeScript in production

- **Annotate exported async functions.** `Promise<Account>` on a public function is documentation that cannot go stale, and it stops a changed body from quietly changing every caller.
- **Never let `Promise<any>` in.** `response.json()` (with the DOM types), `JSON.parse` and many SDKs return `any`. Annotate the result as `unknown` and parse it at the boundary.
- **Keep tuples for mixed `Promise.all`.** Pass the array literal directly, or use `as const`.
- **Time-limit every network call** with a helper like `withTimeout`, and clear the timer. Prefer passing an `AbortSignal` to APIs that accept one, such as `fetch(url, { signal: AbortSignal.timeout(5000) })`, so the work is really cancelled.
- **Turn on the promise lint rules** from typescript-eslint: `no-floating-promises`, `no-misused-promises`, `await-thenable` and `return-await`. They cover exactly the places where the compiler's types say "anything goes".
- **Bound everything that loops.** Pagers get a page limit, retries get an attempt limit, and parallel work gets a concurrency limit ([Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency)).

## Practice

TRY IT YOURSELF

### A typed retry helper

Write `retry<T>(task: () => Promise<T>, attempts: number): Promise<T>` that calls `task` until it succeeds or `attempts` calls have failed, then rejects with the last error. Test it with a flaky rate lookup that fails twice.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop `for (let attempt = 1; attempt <= attempts; attempt++)` with `try`/`catch` inside, the same shape as `firstSuccess` above but calling the same `task` again each time.

HINT 2

Inside `try`, `return await task();`. In `catch`, save `lastError = error;` and log `\`attempt ${attempt} failed\``. After the loop, `throw lastError;`.

SOLUTION

retry.ts

```ts
async function retry<T>(task: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown = new Error("retry needs at least one attempt");
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.log(`attempt ${attempt} failed`);
    }
  }
  throw lastError;
}

let calls = 0;
async function flakyRate(): Promise<number> {
  calls += 1;
  if (calls < 3) throw new Error("rates service busy");
  return 1540.25;
}

const rate = await retry(flakyRate, 5);
console.log(rate.toFixed(2), "after", calls, "calls");
try {
  calls = 0;
  await retry(flakyRate, 2);
} catch (error) {
  console.log("gave up:", error instanceof Error ? error.message : error);
}
```

Output of `npx tsx retry.ts` and of the browser terminal

```ts
attempt 1 failed
attempt 2 failed
1540.25 after 3 calls
attempt 1 failed
attempt 2 failed
gave up: rates service busy
```

`T` is inferred from the task, so `rate` is a `number`. `return await` is required: without `await`, a rejection would skip the `catch`, the trap from [Typed error handling](https://zudojs.oyinlola.site/learn/ts-errors#async). `lastError` is `unknown`, because that is all a `catch` can know. In production, add a delay between attempts and only retry errors that are retryable.

TRY IT YOURSELF

### Rescue the collapsed tuple

This code does not compile. Explain why, and fix it without any `as` on the results.

summary.ts

```ts
async function countOrders(): Promise<number> {
  return 42;
}
async function topProduct(): Promise<{ name: string; sold: number }> {
  return { name: "Ankara tote bag", sold: 17 };
}

const work = [countOrders(), topProduct()];
const [orders, product] = await Promise.all(work);
console.log(`${orders} orders, best seller: ${product.name}`);
```

  summary.ts:10:55 - error TS2339: Property 'name' does not exist on type 'number | { name: string; sold: number; }'. Property 'name' does not exist on type 'number'. 10 console.log(`${orders} orders, best seller: ${product.name}`); ~~~~ Found 1 error in summary.ts:10

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Write `const [orders, product] = await Promise.all([countOrders(), topProduct()]);` — the array literal goes straight into the call, the way the worked example does.

HINT 2

Then `console.log(\`${orders} orders, best seller: ${product.name}\`);`. Building the array in its own variable first is exactly what loses the tuple.

SOLUTION

summary.ts

```ts
async function countOrders(): Promise<number> {
  return 42;
}
async function topProduct(): Promise<{ name: string; sold: number }> {
  return { name: "Ankara tote bag", sold: 17 };
}

const [orders, product] = await Promise.all([countOrders(), topProduct()]);
console.log(`${orders} orders, best seller: ${product.name}`);
```

Output of `npx tsx summary.ts` and of the browser terminal

```ts
42 orders, best seller: Ankara tote bag
```

`work` was inferred as an array of a union of promises, so each result is `number | { name: string; sold: number }`, and `product.name` is not safe. Passing the array literal straight to `Promise.all` (or adding `as const` to `work`) keeps the tuple, and each position gets its own type.

TRY IT YOURSELF

### Batches from an async iterable

Writing to the ledger is cheaper in batches. Write `async function* batch<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[], void, undefined>` that yields arrays of up to `size` items, and use it on an async generator of transaction ids.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep a running array, `let current: T[] = [];`, and `for await (const item of source) { current.push(item); ... }`, the same shape as `pairs` above but comparing `current.length` with `size`.

HINT 2

When `current.length === size`, `yield current;` then `current = [];` (a new array, not emptying the old one). After the loop, `if (current.length > 0) yield current;` for the last partial batch.

SOLUTION

batch.ts

```ts
async function* batch<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[], void, undefined> {
  let current: T[] = [];
  for await (const item of source) {
    current.push(item);
    if (current.length === size) {
      yield current;
      current = [];
    }
  }
  if (current.length > 0) yield current;
}

async function* transactionIds(count: number): AsyncGenerator<string, void, undefined> {
  for (let i = 1; i <= count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    yield `TX-${i}`;
  }
}

for await (const group of batch(transactionIds(7), 3)) {
  console.log(`writing ${group.length}: ${group.join(" ")}`);
}
```

Output of `npx tsx batch.ts` and of the browser terminal

```ts
writing 3: TX-1 TX-2 TX-3
writing 3: TX-4 TX-5 TX-6
writing 1: TX-7
```

The last, partial batch is yielded after the loop; forgetting it is the classic bug here. `current = []` creates a new array instead of emptying the old one, because the consumer may still hold the batch it was given. And `T` flows from the source: `group` is a `string[]`.

## Recap

- An async function always returns `Promise<T>`; its body returns plain `T` values, and `await` removes one promise layer at the type level too.
- `new Promise<T>` needs its `T` from a type argument or a return type, or `resolve` takes `unknown`. `Promise.withResolvers<T>()` is typed the same way.
- `Awaited<T>` is the type of `await`: it unwraps nested promises and thenables. Generic helpers that await a `T` return `Promise<Awaited<T>>`.
- `Promise.all` on an array literal gives a typed tuple; a prebuilt array collapses into a union unless it is `as const`. `race` and `any` give unions, and `Promise<never>` makes typed timeouts.
- `allSettled` results are a union on `status`; `reason` is `any`, so treat it as `unknown`.
- Async callbacks passed to `filter`, `some`, `forEach` or event handlers are not checked; use `Promise.all` with `map`, `for...of`, and the promise lint rules.
- `AsyncIterable<T>` and `AsyncGenerator<T, TReturn, TNext>` type lazy async sequences; a generic pager hides pages and cursors from its callers.

This is the last lesson of the TypeScript course. Next, [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators) opens Advanced TypeScript: deriving types from values and from each other with `keyof`, `typeof` and indexed access.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
