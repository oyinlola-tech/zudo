---
title: "Types and constants: guards, ids and time — ZudoJS Academy"
description: "Check untrusted values with @zudojs/types, keep ids apart with branded types, use the shared HTTP and time constants, and make clocks and randomness testable."
source: https://zudojs.oyinlola.site/learn/zudo-types-constants
---

LEVEL 12 · LESSON 9 OF 19

Core, runtime and lifecycle Core

# Types and constants: guards, ids and time

Check untrusted values with @zudojs/types, keep ids apart with branded types, use the shared HTTP and time constants, and make clocks and randomness testable.

- **50 min** to read and try
- **You need:** "Components with @zudojs/lifecycle", and "Generics" and "Advanced types" from the TypeScript course
- **You build:** A type-safe id and time system for shop orders: branded order ids, validated timestamps, an injectable clock and id source, and deterministic tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Check untrusted JSON with type guards and explain which edge cases each one rejects
- Convert query-string and configuration text safely with the converters
- Prevent mixed-up ids with branded types and create them only after validation
- Use the shared HTTP, environment and time constants instead of typing literals
- Inject a clock and a random source so time and ids are deterministic in tests

## Three bugs the compiler does not catch

All three of these compile without a single warning:

bugs.ts

```ts
// Three bugs that type-check.
function cancelOrder(orderId: string, requestedBy: string) {
  return `order ${orderId} cancelled by ${requestedBy}`;
}
const userId = "user_42";
const orderId = "ord_19";
console.log(cancelOrder(userId, orderId)); // arguments swapped

const pageSize = Number(""); // ?pageSize= was sent empty
console.log("page size:", pageSize);

const expiresAt = Date.now() + 15 * 60 * 1000;
console.log("token valid:", Date.now() < expiresAt); // true today, but how do you test "15 minutes later"?
```

Output of `npx tsx bugs.ts` and of the browser terminal

```ts
order user_42 cancelled by ord_19
page size: 0
token valid: true
```

- Both ids are plain `string`s, so swapping them is invisible to TypeScript. A customer's order is cancelled "by" an order.
- `?pageSize=` arrives as an empty string, `Number("")` is `0`, and your list endpoint returns nothing, or divides by zero while computing page counts.
- The expiry works today, but a test for "15 minutes later" would have to wait 15 minutes, because the code reads the real clock.

Every ZudoJS package meets these problems, so the answers live in two small packages at the bottom of the stack. `@zudojs/types` has **type guards**, **converters**, utility types, and injectable `Clock` and `Random` interfaces; it depends on nothing. `@zudojs/constants` has **branded** id types and their factories, and the shared constants for HTTP, environments, time, retries and lifecycles. Both also run in the browser, so every example on this page runs in your browser terminal too.

## Type guards for untrusted data

A **type guard** is a function that checks a value at runtime and tells TypeScript the result: its return type is written `value is string`, so after `if (isNonEmptyString(x))` the compiler treats `x` as a string. You wrote your own in [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime). The guards in `@zudojs/types` are the shared, carefully tested versions.

REASON IT OUT

### What must a guard reject?

A payment provider sends your shop a webhook: a JSON body with a `reference`, an `amountKobo`, an `email`, a `paidAt` date and a list of `items`. Before writing any check, list what could arrive in each field that a naive check would accept. For example: is `typeof x === "number"` enough for an amount? Is `typeof x === "object"` enough for the body? Is a string that matches `\d{4}-\d{2}-\d{2}` a date?

**Show the reasoning**

- **The body**: `typeof x === "object"` is also true for `null`, arrays and class instances. You want a *plain* object: `isPlainObject`.
- **The amount**: `typeof x === "number"` accepts `NaN`, `Infinity`, `-100` and `2.5`. An amount in kobo must be a positive integer: `isInteger` and `isPositiveNumber` (which also refuses `Infinity`). The string `"250000"` must be refused too; it is a sign the sender changed its format.
- **The email**: "contains an @" accepts `ada@`. `isEmail` requires a domain with a dot and caps the length at 254 characters, so a huge input cannot make the check slow.
- **The date**: a pattern accepts `2026-02-30` and `2026-13-45`. `isIsoDateTimeString` checks the calendar too.
- **The list**: `every` skips holes in sparse arrays, so `new Array(3)` passes an `every`-based check. `isArrayOfType` reads every index.

webhook.ts

```ts
import { isArrayOfType, isEmail, isInteger, isIsoDateTimeString, isNonEmptyString, isPlainObject, isPositiveNumber } from "@zudojs/types";

interface PaymentEvent {
  readonly reference: string;
  readonly amountKobo: number;
  readonly email: string;
  readonly paidAt: string;
  readonly items: string[];
}

const checks: Array<[string, (event: Record<string, unknown>) => boolean]> = [
  ["reference", (e) => isNonEmptyString(e.reference)],
  ["amountKobo", (e) => isInteger(e.amountKobo) && isPositiveNumber(e.amountKobo)],
  ["email", (e) => isEmail(e.email)],
  ["paidAt", (e) => isIsoDateTimeString(e.paidAt)],
  ["items", (e) => isArrayOfType(e.items, isNonEmptyString)],
];

function problems(value: unknown): string[] {
  if (!isPlainObject(value)) return ["(not an object)"];
  return checks.filter(([, ok]) => !ok(value)).map(([field]) => field);
}

function isPaymentEvent(value: unknown): value is PaymentEvent {
  return problems(value).length === 0;
}

const bodies = [
  '{"reference":"PSK_1","amountKobo":250000,"email":"ada@shop.ng","paidAt":"2026-09-24T09:00:00Z","items":["Rice 5kg"]}',
  '{"reference":"PSK_2","amountKobo":"250000","email":"ada@shop.ng","paidAt":"2026-09-24T09:00:00Z","items":["Rice 5kg"]}',
  '{"reference":"PSK_3","amountKobo":-100.5,"email":"ada@shop","paidAt":"2026-02-30T09:00:00Z","items":[""]}',
  '["not", "an", "object"]',
];
for (const body of bodies) {
  const value: unknown = JSON.parse(body);
  if (isPaymentEvent(value)) console.log("accepted", value.reference, `₦${value.amountKobo / 100}`);
  else console.log("rejected:", problems(value).join(", "));
}
```

Output of `npx tsx webhook.ts` and of the browser terminal

```ts
accepted PSK_1 ₦2500
rejected: amountKobo
rejected: amountKobo, email, paidAt, items
rejected: (not an object)
```

The checks are data (a list of field names and predicates), so the function can say *which* fields failed instead of only "invalid". `isPaymentEvent` is a real type guard: inside the `if`, `value.amountKobo` is a `number` with no cast.

Guards are the right tool for small, hand-written checks and for writing other validators. For full request bodies, a schema from `@zudojs/schema` ([the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation)) gives you the same checks plus error messages and a TypeScript type in one declaration. `@zudojs/schema`'s `email` format and `isEmail` accept exactly the same addresses.

The full list: `isPlainObject`, `isNonNullObject`, `isNonEmptyString`, `isFiniteNumber`, `isPositiveNumber`, `isInteger`, `isDate` (a `Date` that is not "Invalid Date"), `isUrl`, `isEmail`, `isUuid` and `isUuidV4`, `isIsoDateString` and `isIsoDateTimeString`, `isArrayOfType`, `isDefined`, `isFunction`, `isPromise` and `isThenable`.

## Converters: text in, values out

Query strings, environment variables and form fields are always text. The converters turn text into values with a **fallback** for anything that does not convert cleanly:

converters.ts

```ts
import { camelToSnake, formatCount, safeJsonParse, snakeToCamel, toArray, toBoolean, toNumber } from "@zudojs/types";

// ?page=2&pageSize=&inStock=yes&tag=rice   (pageSize was sent empty)
const query = new URLSearchParams("page=2&pageSize=&inStock=yes&tag=rice");
console.log("Number():", Number(query.get("pageSize")), "| toNumber():", toNumber(query.get("pageSize"), 20));
console.log(toNumber("2"), toNumber(" 42 "), toNumber("0x10", -1), toNumber("12abc", -1), toNumber(Infinity, 0), toNumber(""));
console.log(toBoolean(query.get("inStock")), toBoolean("off"), toBoolean("maybe"), toBoolean("maybe", true));
console.log(toArray(query.get("tag")), toArray(["rice", "beans"]));

const text = '{"theme":"dark","__proto__":{"isAdmin":true}}';
console.log(Object.keys(JSON.parse(text)), Object.keys(safeJsonParse(text, {})));
console.log(safeJsonParse("{not json", { theme: "light" }));

console.log(camelToSnake("createdAt"), camelToSnake("HTTPStatusCode"), snakeToCamel("total_kobo"));
console.log(formatCount(1, "item"), formatCount(0, "item"), formatCount(3, "category", "categories"));
```

Output of `npx tsx converters.ts` and of the browser terminal

```ts
Number(): 0 | toNumber(): 20
2 42 -1 -1 0 NaN
true false false true
[ 'rice' ] [ 'rice', 'beans' ]
[ 'theme', '__proto__' ] [ 'theme' ]
{ theme: 'light' }
created_at http_status_code totalKobo
1 item 0 items 3 categories
```

- `toNumber` refuses blank strings, hexadecimal, trailing junk and infinities, returning the fallback (or `NaN` without one). That fixes the empty `pageSize`: 20 instead of 0.
- `toBoolean` knows `true/false`, `yes/no`, `on/off`, `1/0`; anything else is the fallback, `false` by default. A feature flag set to `"maybe"` stays off.
- `toArray` wraps a single value, handy for query parameters that may appear once or several times.
- `safeJsonParse` returns the fallback for broken JSON and drops `__proto__`, `constructor` and `prototype` keys at every depth. `JSON.parse` keeps `__proto__` as an ordinary key, and a later "deep merge" of that object into your settings could then change `Object.prototype` for the whole process, an attack called **prototype pollution**. Note that the result is *not* validated: `safeJsonParse<T>` only casts to `T`.
- `camelToSnake` and `snakeToCamel` map between TypeScript property names and database columns; acronyms stay one word (`http_status_code`). `formatCount` gets "1 item" and "0 items" right.

## Utility types

`@zudojs/types` also exports types that exist only for the compiler, such as `DeepReadonly`, `DeepPartial`, `Maybe<T>` (`T | null | undefined`), `Prettify`, `PartialKeys` and `RequireKeys`, `AsyncReturnType`, `NestedKeyOf` and `NestedValueOf`. `DeepReadonly` is the one you will reach for most: `readonly` on an interface protects only the top level, while settings shared by the whole app should be read-only all the way down:

utility.ts

```ts
import type { DeepReadonly, Maybe, PartialKeys } from "@zudojs/types";

interface ShopSettings {
  currency: string;
  delivery: { freeAboveKobo: number; zones: string[] };
}

const settings: DeepReadonly<ShopSettings> = { currency: "NGN", delivery: { freeAboveKobo: 5_000_000, zones: ["Lagos", "Abuja"] } };
settings.delivery.zones.push("Kano");

type NewProduct = PartialKeys<{ sku: string; name: string; stock: number }, "stock">;
const rice: NewProduct = { sku: "RICE-5KG", name: "Rice 5kg" };
const discount: Maybe<number> = null;
console.log(rice, discount);
```

What `npx tsc --noEmit` prints

```ts
utility.ts:9:25 - error TS2339: Property 'push' does not exist on type 'readonly string[]'.

9 settings.delivery.zones.push("Kano");
                          ~~~~


Found 1 error in utility.ts:9
```

The array inside the nested object became a `readonly string[]`, which has no `push`. `PartialKeys<T, "stock">` made only `stock` optional, so a new product may leave it out. These types change nothing at runtime; pair `DeepReadonly` with `Object.freeze` when the object really must not change.

## Branded ids

Back to the first bug: two ids that are both `string`. TypeScript compares types by their **structure**, so every string fits every string parameter. A **branded type** adds a fake property that exists only for the compiler, so two strings with different brands stop fitting each other:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
```

`@zudojs/constants` defines `Brand` and the ids the framework uses: `UserId`, `EventId`, `RequestId`, `CorrelationId`, `SessionId`, `TenantId`, `MessageId`, `TokenId`, plus string brands such as `Timestamp`, `Url` and `EmailAddress`. Your own ids use the same `Brand`:

ids.ts

```ts
import type { Brand, UserId } from "@zudojs/constants";
import { createUserId } from "@zudojs/constants";

type OrderId = Brand<string, "OrderId">;

function cancelOrder(orderId: OrderId, requestedBy: UserId): string {
  return `order ${orderId} cancelled by ${requestedBy}`;
}

const user = createUserId("user_42");
const order = "ord_19" as OrderId;
console.log(cancelOrder(user, order));
```

What `npx tsc --noEmit` prints

```ts
ids.ts:12:25 - error TS2345: Argument of type 'UserId' is not assignable to parameter of type 'OrderId'.
  Type 'UserId' is not assignable to type '{ readonly __brand: "OrderId"; }'.
    Types of property '__brand' are incompatible.
      Type '"UserId"' is not assignable to type '"OrderId"'.

12 console.log(cancelOrder(user, order));
                           ~~~~


Found 1 error in ids.ts:12
```

The swapped arguments are now a compile error that names both brands. At runtime nothing changed: a branded id is still a plain string, with no extra property and no cost.

### Brand only after checking

A brand is a promise: "this string is a real order id". Anything can make the promise with `as OrderId`, and so can the id factories in `@zudojs/constants`, which only brand:

factories.ts

```ts
import { createEmailAddress, createTenantId, createTimestamp, createUrl, createUserId, InvalidConstantError } from "@zudojs/constants";

// The id factories only brand: they accept anything.
console.log(JSON.stringify(createUserId("")), JSON.stringify(createUserId("  user 42 ")));

// These validate, and throw InvalidConstantError.
const attempts: Array<[string, () => string]> = [
  ["tenant", () => createTenantId("  Shop-NG ")],
  ["tenant", () => createTenantId("shop/ng")],
  ["timestamp", () => createTimestamp("2026-09-24T09:00:00.000Z")],
  ["timestamp", () => createTimestamp("2026-02-30T09:00:00Z")],
  ["timestamp", () => createTimestamp("24/09/2026")],
  ["email", () => createEmailAddress("ada@shop.ng")],
  ["email", () => createEmailAddress("ada@")],
  ["url", () => createUrl("https://shop.ng/orders?id=19")],
  ["url", () => createUrl("shop.ng/orders")],
];
for (const [kind, attempt] of attempts) {
  try {
    console.log(kind.padEnd(9), "ok     ", attempt());
  } catch (error) {
    console.log(kind.padEnd(9), "refused", error instanceof InvalidConstantError ? (error as Error).message : error);
  }
}
```

Output of `npx tsx factories.ts` and of the browser terminal

```ts
"" "  user 42 "
tenant    ok      shop-ng
tenant    refused Invalid tenant id: "shop/ng"
timestamp ok      2026-09-24T09:00:00.000Z
timestamp refused Invalid ISO 8601 timestamp: "2026-02-30T09:00:00Z"
timestamp refused Invalid ISO 8601 timestamp: "24/09/2026"
email     ok      ada@shop.ng
email     refused Invalid email address: "ada@"
url       ok      https://shop.ng/orders?id=19
url       refused Invalid URL: "shop.ng/orders"
```

`createUserId` branded an empty string and one with spaces. The other factories validate and throw `InvalidConstantError`: `createTenantId` also normalises (trimmed, lowercased, Unicode-normalised) so `Shop-NG` and `shop-ng` cannot become two tenants, and `createTimestamp` refuses a 30 February. So for ids that come from outside, write a **parse** function that checks first and brands second, and make it the only place where `as OrderId` appears:

order-id.ts

```ts
import type { Brand } from "@zudojs/constants";
import { isUuid } from "@zudojs/types";

export type OrderId = Brand<string, "OrderId">;

/** The only way to make an OrderId: check first, brand second. */
export function parseOrderId(value: unknown): OrderId {
  if (typeof value !== "string" || !value.startsWith("ord_") || !isUuid(value.slice(4))) {
    throw new Error(`Not an order id: ${JSON.stringify(value)}`);
  }
  return value as OrderId;
}

for (const raw of ["ord_7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c", "ord_19", "user_7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c", 42]) {
  try {
    console.log("ok", parseOrderId(raw).slice(0, 12));
  } catch (error) {
    console.log((error as Error).message);
  }
}
```

Output of `npx tsx order-id.ts` and of the browser terminal

```ts
ok ord_7a1c7a0e
Not an order id: "ord_19"
Not an order id: "user_7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c"
Not an order id: 42
```

Now an `OrderId` in any function signature means "checked at the boundary", and the rest of the code never re-checks it.

## HTTP, environment and time constants

Typing `"Content-Type"`, `429` or `86400000` by hand works until someone types `"Content-type"` in one place, or `8640000`. The constants are frozen objects with literal types, so a typo in a name is a compile error:

http.ts

```ts
import { ContentTypes, HttpHeader, HttpMethods, HttpStatus, IDEMPOTENT_HTTP_METHODS, SAFE_HTTP_METHODS, isClientError, isServerError, isSuccessStatus } from "@zudojs/constants";

console.log(HttpStatus.CREATED, HttpStatus.NO_CONTENT, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.TOO_MANY_REQUESTS);
console.log(HttpHeader.CONTENT_TYPE, HttpHeader.X_CORRELATION_ID, ContentTypes.JSON);
console.log(Object.keys(HttpMethods).length, Object.isFrozen(HttpStatus));

// Can a failed request be sent again safely?
for (const method of [HttpMethods.GET, HttpMethods.PUT, HttpMethods.POST, HttpMethods.PATCH]) {
  console.log(method.padEnd(6), "safe:", SAFE_HTTP_METHODS.has(method), "| retry-safe:", IDEMPOTENT_HTTP_METHODS.has(method));
}
for (const status of [204, 404, 503]) {
  console.log(status, isSuccessStatus(status) ? "success" : isClientError(status) ? "client error" : isServerError(status) ? "server error" : "other");
}
```

Output of `npx tsx http.ts` and of the browser terminal

```ts
201 204 404 409 422 429
Content-Type X-Correlation-Id application/json
9 true
GET    safe: true | retry-safe: true
PUT    safe: false | retry-safe: true
POST   safe: false | retry-safe: false
PATCH  safe: false | retry-safe: false
204 success
404 client error
503 server error
```

`SAFE_HTTP_METHODS` are the methods that change nothing on the server; `IDEMPOTENT_HTTP_METHODS` are the ones that may be repeated with the same result, so a client or a proxy may retry them after a timeout. `POST` is neither: retrying a payment `POST` can charge a customer twice, which is why payment APIs use idempotency keys ([Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency)).

Environments and time:

env-time.ts

```ts
import { DefaultRetry, DefaultTimeout, TimeMs, formatDuration, isProduction, resolveEnvironment, toMilliseconds } from "@zudojs/constants";

console.log(resolveEnvironment({ NODE_ENV: "prod" }), resolveEnvironment({ NODE_ENV: "Production" }), resolveEnvironment({}));
console.log(resolveEnvironment({ NODE_ENV: "staging" }), isProduction({ NODE_ENV: "staging" }));
console.log(resolveEnvironment({ NODE_ENV: "live" }, { silent: true }));
try {
  resolveEnvironment({ NODE_ENV: "live" }, { strict: true });
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}

console.log(TimeMs.MINUTE, TimeMs.DAY, toMilliseconds(15, "minutes"), toMilliseconds(2, "hours"));
console.log(formatDuration(250), formatDuration(1500), formatDuration(150_000), formatDuration(90_061_000));
console.log(DefaultTimeout.DATABASE, DefaultTimeout.HTTP_REQUEST, DefaultRetry.MAX_ATTEMPTS, DefaultRetry.BASE_DELAY_MS);
```

Output of `npx tsx env-time.ts` and of the browser terminal

```ts
production production development
staging false
development
InvalidConstantError: Unrecognized NODE_ENV value: "live"
60000 86400000 900000 7200000
250ms 1s 2m 30s 1d 1h
15000 10000 3 1000
```

- `resolveEnvironment` is how the whole framework reads `NODE_ENV` (the generated `src/app.ts` uses it). It accepts `prod`, `dev` and any capitalisation, and maps unset to `development`. An unknown value like `live` falls back to `development` with a one-time warning (hidden here with `silent`); `strict: true` throws instead, which is what you want in a deployment check.
- `staging` is its own environment, and `isProduction` is `false` for it.
- `TimeMs` and `toMilliseconds` replace hand-multiplied numbers. `formatDuration` shows at most two units and rounds down (1.5 s is "1s"), fine for logs, not for invoices.
- `DefaultTimeout`, `DefaultRetry` and `Limits` hold the defaults the framework itself uses, such as 15 seconds for database calls and 3 retries.

## Injectable time and randomness

Code that calls `Date.now()` or `Math.random()` directly cannot be tested precisely. The fix is the same as for any dependency ([dependency injection](https://zudojs.oyinlola.site/learn/zudo-container) is the next lesson): receive it as a parameter. `@zudojs/types` defines the two interfaces and their implementations:

| Interface | For production | For tests |
| --- | --- | --- |
| `Clock`: `now(): number` (milliseconds since 1970) | `systemClock` | `new FixedClock(ms)` with `set` and `advance` |
| `Random`: `uuid()`, `int(max)`, `string(length)`, `custom(length, alphabet)` | `systemRandom` (backed by `node:crypto`) | `new SeededRandom(seed)`, which is a `PseudoRandom`, not a `Random` |

clock-random.ts

```ts
import { FixedClock, SeededRandom, isUuidV4, systemClock, systemRandom } from "@zudojs/types";

const clock = new FixedClock(Date.UTC(2026, 8, 24, 9, 0, 0));
console.log(new Date(clock.now()).toISOString());
clock.advance(15 * 60 * 1000);
console.log(new Date(clock.now()).toISOString());
clock.set(Date.UTC(2026, 11, 31, 23, 59, 59));
console.log(new Date(clock.now()).toISOString());

const a = new SeededRandom(2026);
const b = new SeededRandom(2026);
console.log(a.uuid() === b.uuid(), a.int(100) === b.int(100), a.string(8), a.custom(6, "0123456789"), a.deterministic);

console.log(typeof systemClock.now(), isUuidV4(systemRandom.uuid()), systemRandom.string(24).length, systemRandom.int(6) < 6);
try {
  systemRandom.int(0);
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx clock-random.ts` and of the browser terminal

```ts
2026-09-24T09:00:00.000Z
2026-09-24T09:15:00.000Z
2026-12-31T23:59:59.000Z
true true elkoxFzl 426863 true
number true 24 true
RangeError: Random.int(max) requires a positive integer max no larger than 9007199254740991
```

A `FixedClock` stands still until you move it. Two `SeededRandom` generators with the same **seed** (starting number) produce exactly the same sequence, so a test that uses one always sees the same ids. `systemRandom` is unpredictable; its values are printed here only as properties (a valid UUID, a length), never as values.

### Secure where it matters

A seeded generator is fine for order ids in a test and a disaster for password-reset tokens: anyone who knows the seed knows every token. `Random` carries a hidden **brand** that only `systemRandom` and implementations passed through `defineSecureRandom` have. A function that needs secure randomness asks for `Random`, and the compiler refuses a seeded generator:

token.ts

```ts
import type { Random } from "@zudojs/types";
import { SeededRandom } from "@zudojs/types";

function createResetToken(random: Random): string {
  return random.string(32);
}

console.log(createResetToken(new SeededRandom(1)));
```

What `npx tsc --noEmit` prints

```ts
token.ts:8:30 - error TS2741: Property '[SecureRandomBrand]' is missing in type 'SeededRandom' but required in type 'Random'.

8 console.log(createResetToken(new SeededRandom(1)));
                               ~~~~~~~~~~~~~~~~~~~

  node_modules/@zudojs/types/dist/runtime/runtime.core.d.ts:34:14 - '[SecureRandomBrand]' is declared here.
    34     readonly [SecureRandomBrand]: true;
                    ~~~~~~~~~~~~~~~~~~~


Found 1 error in token.ts:8
```

A function that does not need secrecy accepts `Random | PseudoRandom`, as the project below does for order ids.

> TWO CLOCKS, TWO RANDOMS
>
> `@zudojs/constants` also exports a `Clock` (with `now()` and `Date()`), a `Random` (with `random()`, `randomInt(min, max)`, `randomString`, `randomBytes`), `createMockClock`, `createMockRandom`, and a `systemClock` and `systemRandom` of the same names but different shapes. Its own documentation names the `@zudojs/types` `Random` as the long-term owner. Use the `@zudojs/types` ones, and watch your imports.

## Project: a type-safe id and time system

Now the shop's orders, built from these pieces. An order gets a branded id and two timestamps: when it was placed, and the time by which it must be paid (30 minutes later). First the ids and time helpers:

ids.ts

```ts
import type { Brand, Timestamp } from "@zudojs/constants";
import { createTimestamp } from "@zudojs/constants";
import type { PseudoRandom, Random } from "@zudojs/types";

export type OrderId = Brand<string, "OrderId">;

/** Order ids are not secrets, so a seeded generator is fine in tests. */
export function createOrderIds(source: Random | PseudoRandom): () => OrderId {
  return () => `ord_${source.uuid()}` as OrderId;
}

/** Reset tokens are secrets: only a secure generator is accepted. */
export function createResetTokens(random: Random): () => string {
  return () => random.string(32);
}

/** Milliseconds since 1970 as a validated ISO 8601 Timestamp. */
export function toTimestamp(ms: number): Timestamp {
  return createTimestamp(new Date(ms).toISOString());
}
```

Then the service. It receives its clock and its id source through the constructor and never touches `Date.now()` or `crypto` itself:

orders.ts

```ts
import type { Timestamp } from "@zudojs/constants";
import { TimeMs } from "@zudojs/constants";
import type { Clock } from "@zudojs/types";

import type { OrderId } from "./ids.js";
import { toTimestamp } from "./ids.js";

export interface Order {
  readonly id: OrderId;
  readonly totalKobo: number;
  readonly createdAt: Timestamp;
  readonly payBy: Timestamp;
}

export class OrderService {
  public constructor(
    private readonly clock: Clock,
    private readonly nextId: () => OrderId,
  ) {}

  public place(totalKobo: number): Order {
    const now = this.clock.now(); // read the clock once per operation
    return {
      id: this.nextId(),
      totalKobo,
      createdAt: toTimestamp(now),
      payBy: toTimestamp(now + 30 * TimeMs.MINUTE),
    };
  }

  public isUnpaidTooLong(order: Order): boolean {
    return this.clock.now() > Date.parse(order.payBy);
  }
}
```

The line with the comment matters. The first version of this service called the clock twice, once for `createdAt` and once for `payBy`. With the real clock the two readings were a millisecond or two apart, and "30 minutes to pay" came out as 1,800,002 ms. The tests below did not catch it, because a `FixedClock` returns the same time on every call. Read the clock once per operation.

Now the tests, with a fixed clock and a seeded id source. Every value is known in advance, and "31 minutes later" takes no time at all:

orders.test.ts

```ts
import { FixedClock, SeededRandom } from "@zudojs/types";

import { createOrderIds } from "./ids.js";
import { OrderService } from "./orders.js";

function check(name: string, actual: unknown, expected: unknown) {
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${name}: ${String(actual)}`);
}

const clock = new FixedClock(Date.UTC(2026, 8, 24, 9, 0, 0));
const service = new OrderService(clock, createOrderIds(new SeededRandom(42)));
const order = service.place(1_250_000);

check("created at", order.createdAt, "2026-09-24T09:00:00.000Z");
check("pay by", order.payBy, "2026-09-24T09:30:00.000Z");
check("same seed, same id", order.id, new OrderService(clock, createOrderIds(new SeededRandom(42))).place(0).id);
check("fresh order is fine", service.isUnpaidTooLong(order), false);
clock.advance(29 * 60 * 1000);
check("29 minutes later", service.isUnpaidTooLong(order), false);
clock.advance(2 * 60 * 1000);
check("31 minutes later", service.isUnpaidTooLong(order), true);
```

Output of `npx tsx orders.test.ts` and of the browser terminal

```ts
PASS created at: 2026-09-24T09:00:00.000Z
PASS pay by: 2026-09-24T09:30:00.000Z
PASS same seed, same id: ord_99e1ef7c-72c3-4b8a-aa3b-32c0ab73b0ad
PASS fresh order is fine: false
PASS 29 minutes later: false
PASS 31 minutes later: true
```

And the same service wired for production, with the system clock and secure randomness. Values change on every run, so the example prints properties of them:

production.ts

```ts
import { isUuidV4, systemClock, systemRandom } from "@zudojs/types";

import { createOrderIds, createResetTokens } from "./ids.js";
import { OrderService } from "./orders.js";

const service = new OrderService(systemClock, createOrderIds(systemRandom));
const order = service.place(1_250_000);
console.log(isUuidV4(order.id.slice(4)), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(order.createdAt));
console.log(Date.parse(order.payBy) - Date.parse(order.createdAt), "ms to pay");
console.log(createResetTokens(systemRandom)().length, "character reset token");
```

Output of `npx tsx production.ts` and of the browser terminal

```ts
true true
1800000 ms to pay
32 character reset token
```

This is the whole pattern: branded types stop mix-ups at compile time, validating factories guard the boundary, and injected clocks and random sources make time and ids a test's decision rather than the machine's.

## Deterministic tests

A test is **deterministic** when it gives the same result on every run, on every machine. Time and randomness are the two most common reasons a test is not: it passes at 10:00 and fails at 23:59 because a date rolled over, or it fails once in a hundred runs because a random id happened to sort differently. Such a test is called **flaky**, and a team soon learns to ignore it, which is worse than having no test.

The rules that follow from this lesson:

- **Inject, do not patch.** Some test runners can replace `Date` and timers globally ("fake timers"). That works, but it also changes time for every library in the process. A `Clock` parameter changes time only for the code under test, and makes the dependency visible in the constructor.
- **Test the boundary.** The expiry exercise below checks 14 and 16 minutes, and the text says what happens at exactly 15. Off-by-one bugs in time live at the boundary, and only a controllable clock can put a test exactly there.
- **Seed, then compare.** With `new SeededRandom(42)`, the ids in a test are the same every run, so you can compare them, log them and use them in snapshots. The seed is part of the test; change it and the expected values change with it.
- **Assert properties of real randomness.** When code uses `systemRandom`, test the shape (a valid UUID, a length, a range), as `production.ts` did, never the value.
- **Keep one real-clock test.** The project's clock bug only showed up with `systemClock`. A single smoke test with the real implementations catches what the controlled ones hide.

The lifecycle lesson used another part of `@zudojs/constants`: `LifecycleState`, `LifecyclePhase`, `LIFECYCLE_VALID_TRANSITIONS` and the `LIFECYCLE_DEFAULT_*` timeouts and retry settings. They live here, rather than in `@zudojs/lifecycle`, so that any package can talk about lifecycle states without depending on the lifecycle manager. That is the general rule of these two packages: they hold what many packages share, and depend on (almost) nothing themselves.

## Production concerns

- **Never trust a brand from outside.** A value in a request body is `unknown` until a guard or a parse function says otherwise. Brand after validating, in one place.
- **Store time as UTC.** `Timestamp` strings from `toISOString()` end in `Z`; convert to a local time zone only for display.
- **Secrets need `Random`.** Tokens, session ids and reset codes take a `Random` parameter, so a test generator can never reach production code paths.
- **Check `NODE_ENV` strictly at deploy time.** `resolveEnvironment(process.env, { strict: true })` turns `NODE_ENV=prodution` into an error instead of a development server in production.
- **Use the constants** for statuses, headers and durations, so a search for `HttpStatus.TOO_MANY_REQUESTS` finds every place that sends a 429.

## Practice

TRY IT YOURSELF

### A guard for a cart line

Write `isCartLine(value)` for objects like `{ sku: "RICE-5KG", qty: 2, unitKobo: 650000 }`: a non-empty `sku`, an integer `qty` from 1 to 99, and a positive integer `unitKobo`. Test it on a good line, a line with `qty: 0`, one with `unitKobo: 6500.5` and an array.

**Show a solution**

cart-line.ts

```ts
import { isInteger, isNonEmptyString, isPlainObject, isPositiveNumber } from "@zudojs/types";

interface CartLine {
  readonly sku: string;
  readonly qty: number;
  readonly unitKobo: number;
}

function isCartLine(value: unknown): value is CartLine {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.sku) &&
    isInteger(value.qty) && value.qty >= 1 && value.qty <= 99 &&
    isInteger(value.unitKobo) && isPositiveNumber(value.unitKobo)
  );
}

console.log(
  isCartLine({ sku: "RICE-5KG", qty: 2, unitKobo: 650000 }),
  isCartLine({ sku: "RICE-5KG", qty: 0, unitKobo: 650000 }),
  isCartLine({ sku: "RICE-5KG", qty: 2, unitKobo: 6500.5 }),
  isCartLine([{ sku: "RICE-5KG", qty: 2, unitKobo: 650000 }]),
);
```

Output of `npx tsx cart-line.ts` and of the browser terminal

```ts
true false false false
```

`isInteger(value.qty)` narrows `qty` to `number`, so the range checks after it compile. Amounts in whole kobo are integers by design; a fraction means the sender made a mistake.

TRY IT YOURSELF

### Parse a user id

Write `parseUserId(value: unknown): UserId` that accepts only strings matching `user_` followed by 1 to 12 digits, and brands them with `createUserId`. Why is the check your job and not `createUserId`'s?

**Show a solution**

user-id.ts

```ts
import type { UserId } from "@zudojs/constants";
import { createUserId } from "@zudojs/constants";

function parseUserId(value: unknown): UserId {
  if (typeof value !== "string" || !/^user_\d{1,12}$/.test(value)) {
    throw new Error(`Not a user id: ${JSON.stringify(value)}`);
  }
  return createUserId(value);
}

for (const raw of ["user_42", "user_", "admin", 42]) {
  try {
    console.log("ok", parseUserId(raw));
  } catch (error) {
    console.log((error as Error).message);
  }
}
```

Output of `npx tsx user-id.ts` and of the browser terminal

```ts
ok user_42
Not a user id: "user_"
Not a user id: "admin"
Not a user id: 42
```

`createUserId` cannot know what your user ids look like: another system might use UUIDs. So the shared factory only brands, and the format check belongs to your application's boundary.

TRY IT YOURSELF

### Test an expiry without waiting

A reset link is valid for 15 minutes. Write `isLinkValid(clock, issuedAt)` using `TimeMs`, and test it with a `FixedClock` at 0, 14 and 16 minutes after issuing, without waiting.

**Show a solution**

expiry.ts

```ts
import { TimeMs } from "@zudojs/constants";
import { FixedClock } from "@zudojs/types";
import type { Clock } from "@zudojs/types";

function isLinkValid(clock: Clock, issuedAt: number): boolean {
  return clock.now() - issuedAt < 15 * TimeMs.MINUTE;
}

const clock = new FixedClock(Date.UTC(2026, 8, 24, 9, 0, 0));
const issuedAt = clock.now();
for (const minutes of [0, 14, 2]) {
  clock.advance(minutes * TimeMs.MINUTE);
  console.log(`${Math.round((clock.now() - issuedAt) / TimeMs.MINUTE)} min:`, isLinkValid(clock, issuedAt));
}
```

Output of `npx tsx expiry.ts` and of the browser terminal

```ts
0 min: true
14 min: true
16 min: false
```

`advance` moves the clock forward from where it is, so the three steps land at 0, 14 and 16 minutes. The boundary uses `<`: at exactly 15 minutes the link is already invalid, which is the safe side for a security token.

## Recap

- Type guards from `@zudojs/types` check untrusted values and narrow their types; they reject the edge cases naive checks miss (`null`, arrays, `NaN`, `Infinity`, impossible dates, sparse arrays).
- Converters turn text into values with fallbacks: an empty query parameter becomes your default, not 0. `safeJsonParse` drops prototype-polluting keys but does not validate.
- `Brand` makes ids with the same structure incompatible. The id factories in `@zudojs/constants` only brand; `createTenantId`, `createTimestamp`, `createEmailAddress` and `createUrl` validate. Brand after checking, in one parse function.
- Use `HttpStatus`, `HttpHeader`, `TimeMs`, `resolveEnvironment` and friends instead of literals.
- Inject a `Clock` and a `Random`. Tests use `FixedClock` and `SeededRandom`; secrets require the branded, secure `Random`. Read the clock once per operation.

Next, [Dependency injection with @zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container) takes the constructor injection from this project and lets a container build the Task API's service, its store and this lesson's `Clock` for you.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
