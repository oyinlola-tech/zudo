---
title: "Typed error handling — ZudoJS Academy"
description: "Catch errors as unknown, write error classes with a name, a cause and a literal code, return typed results, and handle async failures in a payments service."
source: https://zudojs.oyinlola.site/learn/ts-errors
---

LEVEL 5 · LESSON 22 OF 23

Types meet the runtime Foundation

# Typed error handling

Catch errors as unknown, write error classes with a name, a cause and a literal code, return typed results, and handle async failures in a payments service.

- **55 min** to read and try
- **You need:** Narrowing, Designing generic APIs, and TypeScript and JavaScript together
- **You build:** A typed error system for a payments service - error classes with literal codes, a normalizer, an HTTP mapping and results for expected failures

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why a catch variable is unknown and narrow it safely
- Write error subclasses with a stable name, a literal code and a cause
- Turn error classes into a discriminated union and handle it exhaustively
- Choose between throwing and returning a Result, and convert between the two
- Avoid the async traps: the any in .catch, the missing return await and floating promises
- Build and test an error system that maps every failure to a safe HTTP response

## A catch block that trusts too much

Your payments service calls a card provider's SDK. The SDK's documentation says a declined card throws an object with a `code`, so the first version of the charge handler reads it straight away:

charge.ts

```ts
async function chargeCard(cardToken: string, kobo: number): Promise<string> {
  if (cardToken === "tok_declined") throw { code: "card_declined", reason: "insufficient_funds" };
  if (cardToken === "tok_broken") throw null;
  if (kobo > 50_000_000) throw "amount over provider limit";
  return "PAY-1001";
}

export async function handleCharge(cardToken: string, kobo: number) {
  try {
    const id = await chargeCard(cardToken, kobo);
    return { status: 201, body: { id } };
  } catch (error) {
    if (error.code === "card_declined") return { status: 402, body: { error: error.reason } };
    return { status: 500, body: { error: error.message } };
  }
}
```

What `npx tsc --noEmit` prints

```ts
charge.ts:13:9 - error TS18046: 'error' is of type 'unknown'.

13     if (error.code === "card_declined") return { status: 402, body: { error: error.reason } };
           ~~~~~

charge.ts:13:78 - error TS18046: 'error' is of type 'unknown'.

13     if (error.code === "card_declined") return { status: 402, body: { error: error.reason } };
                                                                                ~~~~~

charge.ts:14:42 - error TS18046: 'error' is of type 'unknown'.

14     return { status: 500, body: { error: error.message } };
                                            ~~~~~


Found 3 errors in the same file, starting at: charge.ts:13
```

With `strict` on, TypeScript refuses every property access on `error`. It is not being fussy. Look at what `chargeCard` really throws: an object, `null` and a string, and none of them is an `Error`. The flag behind this check is `useUnknownInCatchVariables`, part of `strict` since TypeScript 4.4. Turn it off, and the old behaviour comes back: the catch variable is `any`, and everything compiles:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "useUnknownInCatchVariables": false,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "verbatimModuleSyntax": true
  }
}
```

charge.ts

```ts
async function chargeCard(cardToken: string, kobo: number): Promise<string> {
  if (cardToken === "tok_declined") throw { code: "card_declined", reason: "insufficient_funds" };
  if (cardToken === "tok_broken") throw null;
  if (kobo > 50_000_000) throw "amount over provider limit";
  return "PAY-1001";
}

async function handleCharge(cardToken: string, kobo: number) {
  try {
    const id = await chargeCard(cardToken, kobo);
    return { status: 201, body: { id } };
  } catch (error) {
    if (error.code === "card_declined") return { status: 402, body: { error: error.reason } };
    return { status: 500, body: { error: error.message } };
  }
}

const requests: [string, number][] = [["tok_visa", 500_000], ["tok_declined", 500_000], ["tok_visa", 60_000_000], ["tok_broken", 500_000]];
for (const [token, kobo] of requests) {
  try {
    console.log(await handleCharge(token, kobo));
  } catch (crash) {
    console.log("handler crashed:", String(crash));
  }
}
```

Output of `npx tsx charge.ts` and of the browser terminal

```json
{ status: 201, body: { id: 'PAY-1001' } }
{ status: 402, body: { error: 'insufficient_funds' } }
{ status: 500, body: { error: undefined } }
handler crashed: TypeError: Cannot read properties of null (reading 'code')
```

Two of the four requests go wrong, and the compiler said nothing. The over-limit charge answers `500` with `error: undefined`, because a string has no `message`, so the client learns nothing and neither do your logs. The broken token is worse: `null.code` throws a `TypeError` *inside the catch block*, so the error handler itself crashes. Your process now depends on a promise in someone else's documentation.

This lesson is about writing error handling that the compiler can check: narrowing what was thrown, designing error classes that carry typed data, deciding when to return failures instead of throwing them, and the extra traps that come with `async`. You already know `try`/`catch` and error classes from [Handling errors](https://zudojs.oyinlola.site/learn/js-errors), `instanceof` narrowing from [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#in-instanceof), and `Result` from [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#result) and [Designing generic APIs](https://zudojs.oyinlola.site/learn/ts-generic-design#result). Here they come together.

## Why the catch variable is unknown

JavaScript lets you `throw` any value at all. Most code throws `Error` objects, but "most" is not a type. Here are six calls, each failing in a different way:

thrown.ts

```ts
function describe(thrown: unknown): string {
  if (thrown instanceof Error) return `${thrown.name}: ${thrown.message}`;
  return `not an Error: ${typeof thrown} ${JSON.stringify(thrown)}`;
}

const attempts: (() => unknown)[] = [
  () => (12.5).toFixed(200),
  () => new Array(-1),
  () => { throw "provider timeout"; },
  () => { throw { status: 429, retryAfter: 30 }; },
  () => { throw 404; },
  () => { throw null; },
];

for (const attempt of attempts) {
  try {
    attempt();
  } catch (error) {
    console.log(describe(error));
  }
}
```

Output of `npx tsx thrown.ts` and of the browser terminal

```ts
RangeError: toFixed() digits argument must be between 0 and 100
RangeError: Invalid array length
not an Error: string "provider timeout"
not an Error: object {"status":429,"retryAfter":30}
not an Error: number 404
not an Error: object null
```

Two built-in failures are real `RangeError`s. The other four are what old libraries, hand-rolled SDKs and hurried code really throw. A `catch` can receive any of them, from any line inside the `try`, including lines deep inside functions you did not write.

Could TypeScript know what each function throws? Java tries this with *checked exceptions*: every method lists what it can throw. TypeScript deliberately has no `throws` clause. Almost any line can throw something (a `RangeError` from a bad argument, a stack overflow, a bug in a dependency), JavaScript libraries never declared it, and a list that is wrong is worse than no list. So the only honest type for a caught value is `unknown`: "it could be anything, prove what it is before you use it". That is the same rule you apply to request bodies in [Special types](https://zudojs.oyinlola.site/learn/ts-special-types#unknown).

You may write the type yourself, but only `unknown` or `any`. A `catch` cannot promise a more specific type, because nothing checks it:

annotated-catch.ts

```ts
try {
  JSON.parse("{oops");
} catch (error: Error) {
  console.log(error.message);
}
```

What `npx tsc --noEmit` prints

```ts
annotated-catch.ts:3:17 - error TS1196: Catch clause variable type annotation must be 'any' or 'unknown' if specified.

3 } catch (error: Error) {
                  ~~~~~


Found 1 error in annotated-catch.ts:3
```

> DO NOT FIX IT WITH ANY
>
> You will see `catch (error: any)` and `(error as Error).message` in real code. Both switch the check off and bring back the crash from the first section. `as Error` is exactly the kind of assertion that [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions) warns about: it compiles for `null`.

## Narrowing what was caught

Everything from [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing) works on a caught value. Three patterns cover almost every `catch` you will write.

### 1. instanceof for your own classes and the built-ins

`error instanceof Error` narrows to `Error`, and `error instanceof RangeError` to `RangeError`. Put the most specific class first, handle what you expect, and **re-throw everything else** so it is not silently lost:

instanceof.ts

```ts
function formatKobo(kobo: number, decimals: number): string {
  try {
    return "₦" + (kobo / 100).toFixed(decimals);
  } catch (error) {
    if (error instanceof RangeError) return "₦" + (kobo / 100).toFixed(2);
    throw error;
  }
}

console.log(formatKobo(1234567, 2));
console.log(formatKobo(1234567, 500));
```

Output of `npx tsx instanceof.ts` and of the browser terminal

```ts
₦12345.67
₦12345.67
```

### 2. A guard for errors that carry a code

Node.js errors from the file system and the network are `Error` objects with an extra `code` property such as `"ENOENT"` (file not found) or `"ECONNREFUSED"`. The `Error` type does not declare `code`, so you check for it with `in` and `typeof`. A type guard packages the check:

report.tsNode.js only

```ts
import { readFile } from "node:fs/promises";

function hasCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

async function loadSettlementReport(date: string): Promise<string> {
  try {
    return await readFile(`./reports/settlement-${date}.csv`, "utf8");
  } catch (error) {
    if (hasCode(error) && error.code === "ENOENT") return "(no settlement report yet)";
    throw error;
  }
}

console.log(await loadSettlementReport("2026-09-24"));
```

Output of `npx tsx report.ts`

```ts
(no settlement report yet)
```

After `"code" in error`, TypeScript knows `error` has a `code` property of type `unknown`, so the `typeof` check that follows is allowed and narrows it to `string`. A missing report is an expected situation, so it becomes a normal answer. A permission error or a full disk is not, so it is re-thrown.

### 3. Normalizing: turn anything into an Error

Code that logs or reports errors wants one shape: a message, a name and a stack. A **normalizer** converts any thrown value into an `Error`, and keeps the original in `cause` so nothing is lost:

to-error.ts

```ts
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  let text: string;
  try {
    text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return new Error(`Non-error thrown: ${text}`, { cause: value });
}

const original = new TypeError("amount must be a number");
console.log(toError(original) === original);
for (const thrown of ["provider timeout", { status: 429 }, null, undefined, 10n]) {
  const error = toError(thrown);
  console.log(error.message, "| cause kept:", error.cause === thrown);
}
```

Output of `npx tsx to-error.ts` and of the browser terminal

```ts
true
Non-error thrown: provider timeout | cause kept: true
Non-error thrown: {"status":429} | cause kept: true
Non-error thrown: null | cause kept: true
Non-error thrown: undefined | cause kept: true
Non-error thrown: 10 | cause kept: true
```

A real `Error` passes through untouched, so its stack trace still points at the line that failed. `JSON.stringify` gives a readable message for objects, but it returns `undefined` for `undefined` and throws for a `bigint`, hence the `??` and the inner `try`. `catch` without a variable, as here, is allowed when you do not need the value.

> ERROR.ISERROR
>
> Node.js 24 and recent versions of Chrome and Firefox also have `Error.isError(value)`, which, unlike `instanceof`, recognises errors created in another realm (an iframe or a `vm` context). Its types are in the `esnext` library, so with `"target": "ES2024"` you need `"lib": ["ESNext"]` to use it.

## Error classes in TypeScript

A string message is enough for a human reading a log. Code that must react to a failure needs data: *how much* money was missing, *which* provider is down, *when* to retry. That is what an error subclass is for. Three details decide whether yours work well: its `name`, its data fields and its `cause`.

### The name

A subclass inherits `name` from `Error.prototype`, where it is `"Error"`. Stack traces, `String(error)` and most loggers print it, so an unnamed subclass looks exactly like a plain `Error` in your logs:

names.ts

```ts
class PlainError extends Error {}

class NamedFromClass extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

class InsufficientFundsError extends Error {
  override readonly name = "InsufficientFundsError";
}

for (const error of [new PlainError("a"), new NamedFromClass("b"), new InsufficientFundsError("c")]) {
  console.log(String(error), "| instanceof Error:", error instanceof Error);
}
```

Output of `npx tsx names.ts` and of the browser terminal

```ts
Error: a | instanceof Error: true
NamedFromClass: b | instanceof Error: true
InsufficientFundsError: c | instanceof Error: true
```

`new.target.name` reads the class name at runtime. It works, but a minifier (a build tool that shortens code for the browser) renames classes to things like `e`, and then your logs say `e: c`. A string literal survives any build. The `override` keyword says "this replaces a member of the base class"; it is required when the `noImplicitOverride` flag from [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig) is on, and harmless when it is off. And because the field is `readonly` with a literal value, its type is the literal `"InsufficientFundsError"`, not `string`.

Older tutorials also add `Object.setPrototypeOf(this, new.target.prototype)` to every constructor. That was a workaround for compiling to ES5, where `instanceof` broke for subclasses of `Error`. TypeScript 7 no longer compiles to ES5 at all, so you can leave it out.

### Typed data and a literal code

Give each class the fields its handlers need, and a `code`: a short, stable string that clients, logs and dashboards can rely on even when the message wording changes. Declared as a `readonly` field with a literal value, the code gets a literal type:

errors.ts

```ts
export class InsufficientFundsError extends Error {
  override readonly name = "InsufficientFundsError";
  readonly code = "insufficient_funds";
  readonly shortByKobo: number;

  constructor(shortByKobo: number, options?: ErrorOptions) {
    super(`insufficient funds: short by ${shortByKobo} kobo`, options);
    this.shortByKobo = shortByKobo;
  }
}

export class ProviderUnavailableError extends Error {
  override readonly name = "ProviderUnavailableError";
  readonly code = "provider_unavailable";
  readonly provider: string;
  readonly retryAfterSeconds: number;

  constructor(provider: string, retryAfterSeconds: number, options?: ErrorOptions) {
    super(`${provider} is unavailable`, options);
    this.provider = provider;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

The fields are declared and assigned by hand instead of with parameter properties (`constructor(readonly provider: string)`). Both work with `tsc`, but parameter properties are not erasable syntax, so Node's built-in type stripping refuses them (see [erasableSyntaxOnly](https://zudojs.oyinlola.site/learn/ts-enums#erasable)). `ErrorOptions` is the built-in type of the second argument of `Error`: `{ cause?: unknown }`. Now the types, revealed with the wrong-assignment trick from [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#conditional):

reveal.ts

```ts
import { InsufficientFundsError } from "./errors.js";

const error = new InsufficientFundsError(250_000);
const code: "card_declined" = error.code;
const cause: string = error.cause;
error.shortByKobo = 0;
```

What `npx tsc --noEmit` prints

```ts
reveal.ts:4:7 - error TS2322: Type '"insufficient_funds"' is not assignable to type '"card_declined"'.

4 const code: "card_declined" = error.code;
        ~~~~

reveal.ts:5:7 - error TS2322: Type 'unknown' is not assignable to type 'string'.

5 const cause: string = error.cause;
        ~~~~~

reveal.ts:6:7 - error TS2540: Cannot assign to 'shortByKobo' because it is a read-only property.

6 error.shortByKobo = 0;
        ~~~~~~~~~~~


Found 3 errors in the same file, starting at: reveal.ts:4
```

The code is the literal `"insufficient_funds"`, the `cause` is `unknown` (anything may be a cause, so you narrow it like a caught value), and the data cannot be changed after the error is created.

### cause: keeping the original failure

When a low-level failure becomes a domain error, pass the original as `cause`. The new error says what it means for *your* code; the cause says what actually happened. A small function walks the chain for your logs:

cause.ts

```ts
import { ProviderUnavailableError } from "./errors.js";

export function causeChain(error: unknown): string[] {
  const chain: string[] = [];
  let current: unknown = error;
  while (current !== undefined && chain.length < 10) {
    chain.push(current instanceof Error ? `${current.name}: ${current.message}` : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

function callProvider(): never {
  throw new Error("connect ECONNREFUSED 10.0.0.7:443");
}

try {
  try {
    callProvider();
  } catch (error) {
    throw new ProviderUnavailableError("CardHub", 30, { cause: error });
  }
} catch (error) {
  console.log(causeChain(error).join("\n  caused by "));
}
```

Output of `npx tsx cause.ts` and of the browser terminal

```ts
ProviderUnavailableError: CardHub is unavailable
  caused by Error: connect ECONNREFUSED 10.0.0.7:443
```

The limit of 10 protects the loop from a cause chain that points back to itself. Wrapping this way is the core rule of [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design): translate errors at layer boundaries, and never throw away the original.

### Where instanceof stops working

`instanceof` checks the prototype chain of one object in one JavaScript realm. An error that crosses a boundary (a worker thread, a job queue, an HTTP response, a second copy of your package in `node_modules`) arrives without its class:

boundary.ts

```ts
import { InsufficientFundsError } from "./errors.js";

const original = new InsufficientFundsError(250_000);
const cloned = structuredClone(original);
const fromQueue: unknown = JSON.parse(JSON.stringify(original));

console.log(original instanceof InsufficientFundsError, cloned instanceof InsufficientFundsError);
console.log(cloned.name, cloned.message);
console.log(fromQueue);
```

Output of `npx tsx boundary.ts` and of the browser terminal

```ts
true false
Error insufficient funds: short by 250000 kobo
{
  name: 'InsufficientFundsError',
  code: 'insufficient_funds',
  shortByKobo: 250000
}
```

`structuredClone`, which worker threads and message channels use, keeps the message but turns the error into a plain `Error`: the class, the custom name and the extra fields are gone. `JSON.stringify` does the opposite: it keeps the own enumerable fields and drops `message` and `stack`, which are not enumerable. The `code` string survives JSON, which is why it, and not the class, is the part of an error you should rely on at a boundary. Inside one process, `instanceof` is fine.

## Error classes as a discriminated union

TypeScript compares classes by their shape, not their name (it is **structurally typed**). That has a surprising consequence for error classes that add nothing to `Error`:

structural.ts

```ts
class CardExpiredError extends Error {}

function askForNewCard(error: CardExpiredError): string {
  return `Please add a new card (${error.message})`;
}

console.log(askForNewCard(new Error("database connection lost")));
```

Output of `npx tsx structural.ts` and of the browser terminal

```ts
Please add a new card (database connection lost)
```

This compiles. `CardExpiredError` declares no member that a plain `Error` lacks, so to the type checker they are the same type, and a database failure is cheerfully reported to the customer as an expired card. Any member with its own literal type tells the classes apart: the literal `name` from the previous section already does, and so does a `code`. The `code` is the one to build on, because it is meant for machines and survives JSON. Once every class carries a `readonly code` with its own literal, the classes form a **discriminated union**, exactly like the object unions in [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#states), and a `switch` on `code` narrows to the class:

failures.ts

```ts
export class CardDeclinedError extends Error {
  override readonly name = "CardDeclinedError";
  readonly code = "card_declined";
  readonly declineCode: string;
  constructor(declineCode: string, options?: ErrorOptions) {
    super(`card declined: ${declineCode}`, options);
    this.declineCode = declineCode;
  }
}

export class InsufficientFundsError extends Error {
  override readonly name = "InsufficientFundsError";
  readonly code = "insufficient_funds";
  readonly shortByKobo: number;
  constructor(shortByKobo: number, options?: ErrorOptions) {
    super(`short by ${shortByKobo} kobo`, options);
    this.shortByKobo = shortByKobo;
  }
}

export class ProviderUnavailableError extends Error {
  override readonly name = "ProviderUnavailableError";
  readonly code = "provider_unavailable";
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, options?: ErrorOptions) {
    super("card provider is unavailable", options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ChargeFailure = CardDeclinedError | InsufficientFundsError | ProviderUnavailableError;
export type ChargeFailureCode = ChargeFailure["code"];
```

`ChargeFailure["code"]` is an **indexed access type**: the type of the `code` property of every member, `"card_declined" | "insufficient_funds" | "provider_unavailable"`. [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators) covers these in depth. Now a function that explains each failure to a customer:

explain.ts

```ts
import type { ChargeFailure } from "./failures.js";

export function customerMessage(failure: ChargeFailure): string {
  switch (failure.code) {
    case "card_declined":
      return `Your bank declined the card (${failure.declineCode}).`;
    case "insufficient_funds":
      return `You need ₦${(failure.shortByKobo / 100).toFixed(2)} more.`;
    case "provider_unavailable":
      return `Payments are busy. Try again in ${failure.retryAfterSeconds} seconds.`;
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}
```

explain-demo.ts

```ts
import { CardDeclinedError, InsufficientFundsError, ProviderUnavailableError } from "./failures.js";
import { customerMessage } from "./explain.js";

console.log(customerMessage(new CardDeclinedError("do_not_honor")));
console.log(customerMessage(new InsufficientFundsError(250_050)));
console.log(customerMessage(new ProviderUnavailableError(30)));
```

Output of `npx tsx explain-demo.ts` and of the browser terminal

```ts
Your bank declined the card (do_not_honor).
You need ₦2500.50 more.
Payments are busy. Try again in 30 seconds.
```

Inside each `case`, `failure` is the matching class, so `failure.declineCode` only compiles in the declined branch. The `never` in the `default` is the exhaustiveness check from [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#exhaustive). Add a fourth failure to the union and forget to explain it:

explain-fraud.ts

```ts
import { CardDeclinedError, InsufficientFundsError, ProviderUnavailableError } from "./failures.js";

class FraudSuspectedError extends Error {
  override readonly name = "FraudSuspectedError";
  readonly code = "fraud_suspected";
}

type ChargeFailure = CardDeclinedError | InsufficientFundsError | ProviderUnavailableError | FraudSuspectedError;

function customerMessage(failure: ChargeFailure): string {
  switch (failure.code) {
    case "card_declined":
      return "Your bank declined the card.";
    case "insufficient_funds":
      return "Top up and try again.";
    case "provider_unavailable":
      return "Try again soon.";
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}
```

What `npx tsc --noEmit` prints

```ts
explain-fraud.ts:19:13 - error TS2322: Type 'FraudSuspectedError' is not assignable to type 'never'.

19       const unhandled: never = failure;
               ~~~~~~~~~


Found 1 error in explain-fraud.ts:19
```

The compiler names the class you forgot. That is the whole point of typed errors: when the list of failures grows, every place that must react to them is found for you.

## Throw or return?

You now have two ways to report a failure: `throw` an error, or return a `Result` whose error side is typed. They are not rivals. Each fits a different kind of failure:

| Question | Throw | Return a Result |
| --- | --- | --- |
| Is the failure part of the business? | No: a bug, a lost database connection, a broken config | Yes: a declined card, not enough money, a duplicate order |
| Must the caller decide what happens? | No, some layer far above handles it (usually with a 500) | Yes, the direct caller shows a message, retries or offers another method |
| Does the type show it? | No: nothing in a signature says what it throws | Yes: forgetting to check is a compile error |
| Cost of forgetting to handle it | The error travels up, maybe to a generic handler | Cannot happen without a visible `as` or `!` |

So a payments service typically *returns* `CardDeclinedError | InsufficientFundsError` and *throws* for a database outage. The two worlds meet in two small helpers. `attempt` turns a function that throws into a `Result`, using the normalizer; `unwrap` goes back, for places where a failure really is unexpected:

result.ts

```ts
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(`Non-error thrown: ${String(value)}`, { cause: value });
}

export function attempt<T>(fn: () => T): Result<T, Error> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

const parsed = attempt(() => JSON.parse('{"event": "charge.success", "kobo": 500000}') as unknown);
const broken = attempt(() => JSON.parse("{oops") as unknown);
console.log(parsed.ok, broken.ok ? "" : broken.error.name);
console.log(unwrap(parsed));
```

Output of `npx tsx result.ts` and of the browser terminal

```ts
true SyntaxError
{ event: 'charge.success', kobo: 500000 }
```

The error side of `attempt` is only `Error`: when you catch, you cannot know more. The precise unions come from functions that *create* their failures on purpose. Here is a wallet that returns them:

wallet.ts

```ts
import { CardDeclinedError, InsufficientFundsError } from "./failures.js";
import { customerMessage } from "./explain.js";
import type { Result } from "./result.js";

interface Wallet {
  id: string;
  balanceKobo: number;
  frozen: boolean;
}

function debit(wallet: Wallet, kobo: number): Result<Wallet, InsufficientFundsError | CardDeclinedError> {
  if (wallet.frozen) return { ok: false, error: new CardDeclinedError("account_frozen") };
  if (kobo > wallet.balanceKobo) return { ok: false, error: new InsufficientFundsError(kobo - wallet.balanceKobo) };
  return { ok: true, value: { ...wallet, balanceKobo: wallet.balanceKobo - kobo } };
}

const ada: Wallet = { id: "W-1", balanceKobo: 1_000_000, frozen: false };
for (const [wallet, kobo] of [[ada, 400_000], [ada, 1_500_000], [{ ...ada, frozen: true }, 100]] as const) {
  const result = debit(wallet, kobo);
  console.log(result.ok ? `new balance ${result.value.balanceKobo}` : customerMessage(result.error));
}
```

Output of `npx tsx wallet.ts` and of the browser terminal

```ts
new balance 600000
You need ₦5000.00 more.
Your bank declined the card (account_frozen).
```

`customerMessage` accepts all three failures, and the wallet returns two of them; a narrower union always fits a wider one. The errors in this `Result` are classes, not plain objects, so they carry a stack trace and can be thrown later with `unwrap`. Plain objects, as in [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#result), are lighter and serialize cleanly. Both are sound; pick one style per codebase so nobody has to guess.

## Async errors

An `async` function never throws to its caller directly. It returns a promise, and a failure *rejects* that promise. With `await` inside `try`, a rejection lands in `catch` as `unknown`, exactly like a thrown value. Three async traps are not caught by the compiler, though.

### Trap 1: the reason in .catch() is any

The catch variable is `unknown`, but the parameter of a `.catch()` callback is typed `any` in TypeScript's own declarations, whatever your tsconfig says. So this compiles:

rate.ts

```ts
async function fetchExchangeRate(currency: string): Promise<number> {
  if (currency !== "USD") throw `no rate for ${currency}`;
  return 1540.25;
}

try {
  const rate = await fetchExchangeRate("GHS").catch((reason) => {
    console.log("lookup failed:", reason.message.toUpperCase());
    return 0;
  });
  console.log(rate);
} catch (error) {
  console.log("crashed:", String(error));
}
```

Output of `npx tsx rate.ts` and of the browser terminal

```ts
crashed: TypeError: Cannot read properties of undefined (reading 'toUpperCase')
```

The error handler crashed on a string, the same bug as the first section, and not one warning. Annotate the parameter yourself; `unknown` is always accepted. The fix uses the short `toError` from the Result section, in its own file:

to-error.ts

```ts
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(`Non-error thrown: ${String(value)}`, { cause: value });
}
```

rate-fixed.ts

```ts
import { toError } from "./to-error.js";

async function fetchExchangeRate(currency: string): Promise<number> {
  if (currency !== "USD") throw `no rate for ${currency}`;
  return 1540.25;
}

const rate = await fetchExchangeRate("GHS").catch((reason: unknown) => {
  console.log("lookup failed:", toError(reason).message);
  return 0;
});
console.log(rate);
```

Output of `npx tsx rate-fixed.ts` and of the browser terminal

```ts
lookup failed: Non-error thrown: no rate for GHS
0
```

The same `any` appears in the second argument of `.then(onFulfilled, onRejected)`, in `Promise.reject` and in the `errors` array of an `AggregateError` from `Promise.any`. Treat all of them as `unknown`.

### Trap 2: return without await inside try

Inside a `try`, `return somePromise` and `return await somePromise` are different. Without `await`, the function returns the promise *before* it settles, the `try` block is already finished when it rejects, and the `catch` never runs:

return-await.ts

```ts
async function capture(paymentId: string): Promise<string> {
  if (paymentId === "PAY-404") throw new Error(`payment ${paymentId} not found`);
  return `captured ${paymentId}`;
}

async function captureNoAwait(paymentId: string): Promise<string> {
  try {
    return capture(paymentId);
  } catch {
    return "handled: not found";
  }
}

async function captureWithAwait(paymentId: string): Promise<string> {
  try {
    return await capture(paymentId);
  } catch {
    return "handled: not found";
  }
}

console.log(await captureWithAwait("PAY-404"));
try {
  console.log(await captureNoAwait("PAY-404"));
} catch (error) {
  console.log("escaped the try:", error instanceof Error ? error.message : error);
}
```

Output of `npx tsx return-await.ts` and of the browser terminal

```ts
handled: not found
escaped the try: payment PAY-404 not found
```

Both functions have the same type, `(paymentId: string) => Promise<string>`, so the compiler sees no difference. Rule: inside `try`, always `return await`.

### Trap 3: floating promises

A promise that nobody awaits is called a **floating promise**. If it rejects, no `catch` anywhere can see it, and Node.js reports an *unhandled rejection*, which by default crashes the process. TypeScript allows a call to an async function as a statement without complaint:

floating.tsNode.js only

```ts
process.on("unhandledRejection", (reason) => {
  console.log("unhandled rejection:", reason instanceof Error ? reason.message : reason);
});

async function sendReceiptEmail(to: string): Promise<void> {
  throw new Error(`mail server refused ${to}`);
}

function completePayment(paymentId: string): string {
  sendReceiptEmail("ada@example.com");
  return `${paymentId} complete`;
}

try {
  console.log(completePayment("PAY-1001"));
} catch {
  console.log("this never runs");
}
```

Output of `npx tsx floating.ts`

```ts
PAY-1001 complete
unhandled rejection: mail server refused ada@example.com
```

The payment "completed", the `try` saw nothing, and the rejection surfaced later on its own. The compiler cannot catch this; a linter can. The `@typescript-eslint/no-floating-promises` rule reports every unawaited promise, and you then choose explicitly: `await` it, or, for fire-and-forget work, attach a handler and mark the intent with `void`: `void sendReceiptEmail(to).catch(logError)`.

One more difference to keep in mind: `Promise<T>` has one type parameter, for the value. There is no way to write the type of a rejection. When the caller must handle an expected async failure, return it: `Promise<Result<Receipt, ChargeFailure>>`. The next lesson, [Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async), covers promise types in depth.

## Build: a payments error system

REASON IT OUT

### Before you design the error system

Your payments service has a `POST /charges` endpoint. The service code calls a card provider, a wallet store and a database. Before reading the code, think through these questions:

- Which failures are expected parts of paying (the client should be told exactly what happened), and which are not?
- What must the client *never* see, even when the failure is yours?
- What will the handler receive in its `catch`, and what can it trust about it?
- If the provider is down, should the client retry? How would it know when?
- What happens when someone adds a new error class next month and forgets to give it a status code?

**Show the reasoning**

Expected failures are the ones a customer can act on: invalid input (400), a declined card or missing funds (402), a duplicate idempotency key (409), a provider outage (503, with a `Retry-After`). Everything else, including a database outage and every bug, is a 500 whose message is hidden: internal messages leak hostnames, SQL and account numbers. The `catch` can trust nothing, so the first thing it does is normalize the value into a known error type, keeping the original as `cause` for the log. Retrying is only safe for failures marked retryable. And a new error class must be impossible to add without a status: a `Record` keyed by the code union does that, because it refuses to compile until every code has an entry.

The design has four parts. An abstract base class holds what every application error shares. Each concrete class adds a literal `code` and its data. A table maps codes to HTTP statuses, checked by the compiler. And one function turns *any* caught value into a safe response.

app-error.ts

```ts
export abstract class AppError extends Error {
  abstract readonly code: string;
  readonly expose: boolean = true;
  readonly retryable: boolean = false;
}

export class ValidationError extends AppError {
  override readonly name = "ValidationError";
  readonly code = "validation_failed";
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`invalid charge request: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

export class CardDeclinedError extends AppError {
  override readonly name = "CardDeclinedError";
  readonly code = "card_declined";
  readonly declineCode: string;
  constructor(declineCode: string, options?: ErrorOptions) {
    super(`card declined: ${declineCode}`, options);
    this.declineCode = declineCode;
  }
}

export class DuplicateChargeError extends AppError {
  override readonly name = "DuplicateChargeError";
  readonly code = "duplicate_charge";
  readonly existingPaymentId: string;
  constructor(existingPaymentId: string) {
    super(`this idempotency key was already used for ${existingPaymentId}`);
    this.existingPaymentId = existingPaymentId;
  }
}

export class ProviderUnavailableError extends AppError {
  override readonly name = "ProviderUnavailableError";
  readonly code = "provider_unavailable";
  override readonly retryable = true;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, options?: ErrorOptions) {
    super("the card provider is unavailable", options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalError extends AppError {
  override readonly name = "InternalError";
  readonly code = "internal_error";
  override readonly expose = false;
}

export type PaymentError = ValidationError | CardDeclinedError | DuplicateChargeError | ProviderUnavailableError | InternalError;
export type PaymentErrorCode = PaymentError["code"];
```

`abstract readonly code: string` forces every subclass to declare a code; each one narrows it to a literal. `expose` says whether the message is safe for a client, and `InternalError` turns it off. `retryable` is overridden only where retrying helps. Next, the mapping and the normalizer:

http-errors.ts

```ts
import { AppError, InternalError } from "./app-error.js";
import type { PaymentError, PaymentErrorCode } from "./app-error.js";

export const STATUS = {
  validation_failed: 400,
  card_declined: 402,
  duplicate_charge: 409,
  provider_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<PaymentErrorCode, number>;

export function toPaymentError(value: unknown): PaymentError {
  if (value instanceof AppError && value.code in STATUS) return value as PaymentError;
  return new InternalError("unexpected failure", { cause: value });
}

export interface ErrorResponse {
  status: number;
  headers: Record<string, string>;
  body: { error: { code: PaymentErrorCode; message: string; details?: Record<string, unknown> } };
}

function details(error: PaymentError): Record<string, unknown> | undefined {
  switch (error.code) {
    case "validation_failed":
      return { issues: error.issues };
    case "card_declined":
      return { declineCode: error.declineCode };
    case "duplicate_charge":
      return { paymentId: error.existingPaymentId };
    case "provider_unavailable":
      return { retryAfterSeconds: error.retryAfterSeconds };
    case "internal_error":
      return undefined;
  }
}

export function toErrorResponse(caught: unknown): ErrorResponse {
  const error = toPaymentError(caught);
  const headers: Record<string, string> = {};
  if (error.code === "provider_unavailable") headers["retry-after"] = String(error.retryAfterSeconds);
  const extra = details(error);
  return {
    status: STATUS[error.code],
    headers,
    body: {
      error: {
        code: error.code,
        message: error.expose ? error.message : "Something went wrong. It has been logged.",
        ...(extra === undefined ? {} : { details: extra }),
      },
    },
  };
}
```

Three things in this file are worth a second look:

- `satisfies Record<PaymentErrorCode, number>` checks that `STATUS` has exactly one entry per code, while `as const` keeps the literal numbers. Add a class to `PaymentError` and this object stops compiling until it has a status.
- `toPaymentError` contains the one `as` in the system. `instanceof AppError` proved the base class, and `value.code in STATUS` proved the code is one of the known ones at runtime, so the assertion is backed by a check, the rule from [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#justified). Anything else, including an `AppError` subclass nobody registered, becomes an `InternalError` with the original as `cause`.
- `details` is a `switch` without a `default` and without a final `return`. It compiles only because the cases are exhaustive; a new code makes it fail with "Function lacks ending return statement".

Now the service, which returns expected failures and throws unexpected ones, and the handler, the only place that catches:

charges.ts

```ts
import { CardDeclinedError, DuplicateChargeError, ProviderUnavailableError, ValidationError } from "./app-error.js";
import { toErrorResponse } from "./http-errors.js";
import type { ErrorResponse } from "./http-errors.js";

interface ChargeRequest {
  idempotencyKey: string;
  cardToken: string;
  kobo: number;
}

const usedKeys = new Map<string, string>([["key-already-used", "PAY-0999"]]);

async function providerCharge(cardToken: string, kobo: number): Promise<string> {
  if (cardToken === "tok_down") throw new ProviderUnavailableError(30, { cause: new Error("connect ETIMEDOUT") });
  if (cardToken === "tok_declined") throw new CardDeclinedError("do_not_honor");
  if (cardToken === "tok_db") throw new Error("relation \"payments\" does not exist");
  if (cardToken === "tok_sdk") throw { reason: "sdk exploded" };
  return `PAY-${1000 + kobo / 100_000}`;
}

function validate(input: ChargeRequest): void {
  const issues: string[] = [];
  if (!Number.isInteger(input.kobo) || input.kobo <= 0) issues.push("kobo must be a positive whole number");
  if (!input.cardToken.startsWith("tok_")) issues.push("cardToken is not a card token");
  if (issues.length > 0) throw new ValidationError(issues);
}

async function handleCharge(input: ChargeRequest): Promise<{ status: 201; body: { paymentId: string } } | ErrorResponse> {
  try {
    validate(input);
    const existing = usedKeys.get(input.idempotencyKey);
    if (existing !== undefined) throw new DuplicateChargeError(existing);
    const paymentId = await providerCharge(input.cardToken, input.kobo);
    usedKeys.set(input.idempotencyKey, paymentId);
    return { status: 201, body: { paymentId } };
  } catch (error) {
    return toErrorResponse(error);
  }
}

const requests: ChargeRequest[] = [
  { idempotencyKey: "k1", cardToken: "tok_visa", kobo: 500_000 },
  { idempotencyKey: "k2", cardToken: "card-1234", kobo: -5 },
  { idempotencyKey: "k3", cardToken: "tok_declined", kobo: 500_000 },
  { idempotencyKey: "key-already-used", cardToken: "tok_visa", kobo: 500_000 },
  { idempotencyKey: "k5", cardToken: "tok_down", kobo: 500_000 },
  { idempotencyKey: "k6", cardToken: "tok_db", kobo: 500_000 },
  { idempotencyKey: "k7", cardToken: "tok_sdk", kobo: 500_000 },
];

for (const request of requests) {
  const response = await handleCharge(request);
  console.log(response.status, JSON.stringify(response.body), "headers" in response ? JSON.stringify(response.headers) : "");
}
```

Output of `npx tsx charges.ts` and of the browser terminal

```ts
201 {"paymentId":"PAY-1005"}
400 {"error":{"code":"validation_failed","message":"invalid charge request: kobo must be a positive whole number; cardToken is not a card token","details":{"issues":["kobo must be a positive whole number","cardToken is not a card token"]}}} {}
402 {"error":{"code":"card_declined","message":"card declined: do_not_honor","details":{"declineCode":"do_not_honor"}}} {}
409 {"error":{"code":"duplicate_charge","message":"this idempotency key was already used for PAY-0999","details":{"paymentId":"PAY-0999"}}} {}
503 {"error":{"code":"provider_unavailable","message":"the card provider is unavailable","details":{"retryAfterSeconds":30}}} {"retry-after":"30"}
500 {"error":{"code":"internal_error","message":"Something went wrong. It has been logged."}} {}
500 {"error":{"code":"internal_error","message":"Something went wrong. It has been logged."}} {}
```

Seven requests, and every one gets a deliberate answer. The client sees both validation problems at once, the decline code, the existing payment for a replayed key, and when to retry. The database error and the object the SDK threw both become a 500 with a neutral message. Their real details are still on `error.cause`, for the log, which the next section tests. In this handler a `throw` inside the `try` is simply the fastest way to reach `toErrorResponse`; in a larger service, `validate` and the idempotency check would return `Result`s and the handler would map them, exactly as the wallet did.

### How this compares with @zudojs/errors

You have just built, in miniature, what `@zudojs/errors` provides for a whole application. Its `BaseError` carries a `code`, a `statusCode`, an `expose` flag and a `cause`; `normalizeToBaseError` is your `toPaymentError`, and `serializePublicError` is your `toErrorResponse`:

zudo-errors.ts

```ts
import { isBaseError, normalizeToBaseError, NotFoundError, serializePublicError } from "@zudojs/errors";

const missing = new NotFoundError("Payment PAY-1001 not found");
console.log(missing.name, missing.statusCode, missing.code, missing.expose, isBaseError(missing));

const unexpected = normalizeToBaseError({ reason: "sdk exploded" });
console.log(unexpected.statusCode, unexpected.code, unexpected.expose);
console.log(serializePublicError(unexpected));
```

Output of `npx tsx zudo-errors.ts` and of the browser terminal

```ts
NotFoundError 404 ERR_RESOURCE_NOT_FOUND true true
500 ERR_INTERNAL_ERROR false
{
  code: 'ERR_INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
  category: 'system',
  statusCode: 500
}
```

One difference is a deliberate trade-off. In `@zudojs/errors`, `code` is typed `ErrorCode | string`, an open set, because a framework cannot know every code your application will invent. So you narrow its errors with `instanceof` or its guards such as `isNotFoundError`, not with an exhaustive `switch`. Your own closed union gives stronger checks inside one service; the framework's open one lets many packages add codes. [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors) shows how to build on it.

## Testing error handling

Error paths are the code that runs least often in development and matters most in production, so test them on purpose. Two kinds of test apply here.

### Runtime tests: a table of thrown values

`toErrorResponse` must give a safe answer for *anything*, so the test table includes values that are not errors at all, and it checks that internal messages never leak:

http-errors.test.ts

```ts
import { CardDeclinedError, InternalError, ProviderUnavailableError } from "./app-error.js";
import { toErrorResponse, toPaymentError } from "./http-errors.js";

const cases: [string, unknown, number, string][] = [
  ["declined card", new CardDeclinedError("stolen_card"), 402, "card_declined"],
  ["provider down", new ProviderUnavailableError(10), 503, "provider_unavailable"],
  ["plain Error", new Error("password=hunter2 rejected by db"), 500, "internal_error"],
  ["string", "boom", 500, "internal_error"],
  ["null", null, 500, "internal_error"],
  ["undefined", undefined, 500, "internal_error"],
];

let failures = 0;
for (const [label, thrown, status, code] of cases) {
  const response = toErrorResponse(thrown);
  const leaked = JSON.stringify(response).includes("hunter2");
  const ok = response.status === status && response.body.error.code === code && !leaked;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${response.status} ${response.body.error.code}`);
}

const wrapped = toPaymentError("boom");
console.log("cause kept:", wrapped instanceof InternalError && wrapped.cause === "boom");
console.log(`${failures} failures`);
```

Output of `npx tsx http-errors.test.ts` and of the browser terminal

```ts
PASS declined card -> 402 card_declined
PASS provider down -> 503 provider_unavailable
PASS plain Error -> 500 internal_error
PASS string -> 500 internal_error
PASS null -> 500 internal_error
PASS undefined -> 500 internal_error
cause kept: true
0 failures
```

### Type-level tests: code that must not compile

The exhaustiveness promises ("a new code needs a status", "a handler cannot read `declineCode` on the wrong error") are compile-time behaviour, so test them at compile time. A `// @ts-expect-error` comment says "the next line must be a type error". If the line ever compiles, `tsc` reports the comment itself as unused, and the test fails:

types.test.ts

```ts
import { CardDeclinedError, InternalError } from "./app-error.js";
import type { PaymentError, PaymentErrorCode } from "./app-error.js";

// @ts-expect-error: a status table without "internal_error" must be rejected
const incomplete: Record<PaymentErrorCode, number> = { validation_failed: 400, card_declined: 402, duplicate_charge: 409, provider_unavailable: 503 };

function onlyDeclined(error: PaymentError): string {
  // @ts-expect-error: declineCode only exists after narrowing
  return error.declineCode;
}

const declined: PaymentError = new CardDeclinedError("do_not_honor");
const internal: PaymentError = new InternalError("x");
console.log(declined.code, internal.code, typeof incomplete, typeof onlyDeclined);
```

Output of `npx tsx types.test.ts` and of the browser terminal

```ts
card_declined internal_error object function
```

This file runs, and it also passes `tsc`, which is the real test: both expected errors happened. The same idea, with more helpers, is how libraries test their types; [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) covers `expectTypeOf` and friends.

## Error handling in production

- **Catch at boundaries, not everywhere.** The HTTP handler, the job runner and the message consumer catch and normalize. Code in between lets errors travel, or adds context by wrapping with `cause`. A `try`/`catch` that neither handles nor wraps is noise.
- **Codes are a public contract.** Clients branch on `"card_declined"`. Changing it is a breaking API change; changing the message is not. Keep codes stable and documented.
- **Never expose what you did not mean to.** Default to hiding the message (`expose: false` for anything unknown), and log the full error with its cause chain on the server. The test above that looks for `hunter2` is a cheap guard worth keeping.
- **Retry only what is retryable.** A declined card will be declined again. Mark retryable errors explicitly and let clients see `Retry-After`.
- **Turn on the checks.** Keep `strict` (and so `useUnknownInCatchVariables`), add `noImplicitOverride`, and enable `@typescript-eslint/no-floating-promises` and `only-throw-error`, which rejects `throw "string"` in your own code.
- **Handle the last resort.** Register `process.on("unhandledRejection")` and `"uncaughtException"` handlers that log and then exit; a process in an unknown state should restart, not limp on.

## Practice

TRY IT YOURSELF

### A safe message for anything

Write `messageOf(value: unknown): string` that returns the `message` of an `Error`, the string itself for a string, the `message` property of an object that has a string `message` (some SDKs throw such objects), and `"unknown error"` otherwise. Use no `as` and no `any`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check `value instanceof Error` first, then `typeof value === "string"`. Both return immediately.

HINT 2

For the object case: `typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"`, then return `value.message`. Otherwise fall through to `"unknown error"`.

SOLUTION

message-of.ts

```ts
function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return "unknown error";
}

console.log(messageOf(new RangeError("amount out of range")));
console.log(messageOf("gateway timeout"));
console.log(messageOf({ message: "card expired", code: 54 }));
console.log(messageOf({ message: 42 }));
console.log(messageOf(null));
```

Output of `npx tsx message-of.ts` and of the browser terminal

```ts
amount out of range
gateway timeout
card expired
unknown error
unknown error
```

Each check narrows a little more: `typeof value === "object"` still allows `null`, so it is ruled out; `"message" in value` adds a `message: unknown` property; `typeof value.message === "string"` finishes the job. `{ message: 42 }` falls through, because a number is not a message you should show.

TRY IT YOURSELF

### Add a refund failure

Add a `RefundWindowClosedError` to the payments system: code `"refund_window_closed"`, HTTP status 422, and a `closedOn` date string in its details. Which files must change, and how do you know you found them all?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Uncomment the `RefundWindowClosedError` class, add it to the `PaymentError` union with `|`, and add its entry to `STATUS`.

HINT 2

Add a matching `case "refund_window_closed":` to `details`, returning `{ closedOn: error.closedOn }`. Each of the three files (the class, the status table, the details switch) refuses to compile until it accounts for the new code, which is how you know you found them all.

SOLUTION

refund.ts

```ts
abstract class AppError extends Error {
  abstract readonly code: string;
  readonly expose: boolean = true;
}

class CardDeclinedError extends AppError {
  override readonly name = "CardDeclinedError";
  readonly code = "card_declined";
}

class RefundWindowClosedError extends AppError {
  override readonly name = "RefundWindowClosedError";
  readonly code = "refund_window_closed";
  readonly closedOn: string;
  constructor(closedOn: string) {
    super(`refunds for this payment closed on ${closedOn}`);
    this.closedOn = closedOn;
  }
}

type PaymentError = CardDeclinedError | RefundWindowClosedError;

const STATUS = {
  card_declined: 402,
  refund_window_closed: 422,
} as const satisfies Record<PaymentError["code"], number>;

function details(error: PaymentError): Record<string, unknown> {
  switch (error.code) {
    case "card_declined":
      return {};
    case "refund_window_closed":
      return { closedOn: error.closedOn };
  }
}

const error = new RefundWindowClosedError("2026-09-01");
console.log(STATUS[error.code], error.message, details(error));
```

Output of `npx tsx refund.ts` and of the browser terminal

```ts
422 refunds for this payment closed on 2026-09-01 { closedOn: '2026-09-01' }
```

You add the class and add it to the `PaymentError` union. From then on, the compiler does the searching: `STATUS` fails to satisfy the `Record` until it has `refund_window_closed`, and `details` fails with "Function lacks ending return statement" until it has the new `case`. If you forget to add the class to the union, `toPaymentError` turns it into a 500 at runtime, and the table test catches that once you add a row for it.

TRY IT YOURSELF

### Find the escaping rejection

This function is meant to return `"refund queued"` or `"refund failed: …"`, but a failing refund escapes it. Find the two lines that let it escape, and fix them.

refund-queue.tsNode.js only

```ts
async function queueRefund(paymentId: string): Promise<void> {
  if (paymentId.startsWith("PAY-X")) throw new Error(`cannot refund ${paymentId}`);
}

async function requestRefund(paymentId: string): Promise<string> {
  try {
    queueRefund(paymentId);
    return "refund queued";
  } catch (error) {
    return `refund failed: ${error}`;
  }
}

process.on("unhandledRejection", (reason) => console.log("escaped:", String(reason)));
console.log(await requestRefund("PAY-X1"));
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Add `await` before `queueRefund(paymentId)`, the way `recordAction` awaits `writeAuditLog`. Without it, the function returns before the rejection happens.

HINT 2

Replace `\`refund failed: ${error}\`` with a narrowed version: `\`refund failed: ${error instanceof Error ? error.message : String(error)}\``.

SOLUTION

refund-queue.ts

```ts
async function queueRefund(paymentId: string): Promise<void> {
  if (paymentId.startsWith("PAY-X")) throw new Error(`cannot refund ${paymentId}`);
}

async function requestRefund(paymentId: string): Promise<string> {
  try {
    await queueRefund(paymentId);
    return "refund queued";
  } catch (error) {
    return `refund failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

console.log(await requestRefund("PAY-X1"));
console.log(await requestRefund("PAY-1001"));
```

Output of `npx tsx refund-queue.ts` and of the browser terminal

```ts
refund failed: cannot refund PAY-X1
refund queued
```

`queueRefund(paymentId)` was a floating promise, so the `try` finished before it rejected; `await` brings the rejection back into the `try`. The second fix is quieter: `\`${error}\`` compiles on an `unknown` (template literals accept anything) but prints `Error: …` for errors and `[object Object]` for plain objects. Narrow first, then format.

## Recap

- JavaScript can throw anything, and TypeScript has no `throws` clause, so a caught value is `unknown` (`useUnknownInCatchVariables`, part of `strict`). Narrow it with `instanceof`, guards, or a normalizer that keeps the original as `cause`.
- Give error subclasses a literal `name`, typed `readonly` data, and a `cause` via `ErrorOptions`. `instanceof` does not survive `structuredClone`, JSON or duplicate packages; a `code` string does.
- A `readonly code` literal on each class makes a union of error classes discriminated, so a `switch` narrows and exhaustiveness checks find every place a new error must be handled.
- Throw for bugs and outages; return a `Result` for failures that are part of the business. `attempt` and `unwrap` convert between the two.
- In async code: annotate `.catch((reason: unknown) => …)`, use `return await` inside `try`, and never leave a promise floating. `Promise<T>` cannot type its rejection.
- Catch at the boundary, map codes to statuses with a `satisfies Record`, hide unexposed messages, and test both the runtime mapping and the compile-time guarantees.

Next: [Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async), where you type promises, combinators like `Promise.all`, `Awaited`, and async generators that page through an API.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
