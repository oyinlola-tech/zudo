---
title: "Branded types — ZudoJS Academy"
description: "Stop swapped ids and naira-for-kobo bugs at compile time with branded types, validating smart constructors, money units and the ids in @zudojs/constants."
source: https://zudojs.oyinlola.site/learn/ts-branded-types
---

LEVEL 6 · LESSON 11 OF 22

The type system in depth Advanced

# Branded types

Stop swapped ids and naira-for-kobo bugs at compile time with branded types, validating smart constructors, money units and the ids in @zudojs/constants.

- **50 min** to read and try
- **You need:** The type system in depth, Narrowing and Functional TypeScript
- **You build:** An identifiers and money module for a refunds service, where every id and amount is validated once at the boundary and cannot be mixed up afterwards

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why a type alias cannot tell two ids apart, and how a brand can
- Write a Brand helper with a unique symbol and choose it over a string key knowingly
- Write smart constructors that validate and normalise, returning a Result or throwing
- Model money units (kobo and naira) so mixing them or losing the unit is a compile error
- Use the branded ids and validating factories of @zudojs/constants, knowing which ones validate
- Recognise where brands disappear: arithmetic, string methods, JSON and casts

## A refund with every argument in the wrong place

A support agent refunds ₦5,000 on a returned order. The refund function takes a payment id, an order id and an amount in kobo, all as plain strings and numbers. The call below compiles:

problem.ts

```ts
function refund(paymentId: string, orderId: string, amountKobo: number): string {
  return `refund ${amountKobo} kobo (₦${(amountKobo / 100).toFixed(2)}) on payment ${paymentId} for order ${orderId}`;
}

const order = { id: "ORD-1042", totalKobo: 2138750 };
const payment = { id: "PAY-88", orderId: "ORD-1042", amountKobo: 1638750 };
const amountNaira = 5000;

console.log(refund(order.id, payment.id, amountNaira));
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
refund 5000 kobo (₦50.00) on payment ORD-1042 for order PAY-88
```

Three mistakes in one call. The order id went where the payment id belongs and the payment id where the order id belongs, so the refund service will look up a payment called `ORD-1042`. And the amount was in naira where kobo was expected, so the customer gets ₦50 instead of ₦5,000. (Had the mistake gone the other way, kobo passed as naira, the shop would have refunded a hundred times too much.)

Each value had the right *type* (a string is a string) and the wrong *meaning*. The [previous lesson](https://zudojs.oyinlola.site/learn/ts-type-system#structural) explained why TypeScript cannot see the difference: it compares shapes, and every id is the same shape. This lesson gives each kind of id and each unit of money its own type, so that the call above has three compile errors, at zero runtime cost.

## An alias is only a name

The first idea everyone tries is a type alias. It makes signatures easier to read, and it changes nothing else, because an alias is a new *name* for the same type, not a new type ([Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces#aliases)):

aliases.ts

```ts
type PaymentId = string;
type OrderId = string;
type Kobo = number;

function refund(paymentId: PaymentId, orderId: OrderId, amount: Kobo): string {
  return `refund ${amount} kobo on ${paymentId} for ${orderId}`;
}

const orderId: OrderId = "ORD-1042";
const paymentId: PaymentId = "PAY-88";
console.log(refund(orderId, paymentId, 5000));
```

Output of `npx tsx aliases.ts` and of the browser terminal

```ts
refund 5000 kobo on ORD-1042 for PAY-88
```

Still no error. To the compiler, `PaymentId`, `OrderId` and `string` are one and the same. What is needed is a type that behaves like a string at runtime but that a plain string, or a different kind of id, cannot pass for.

## Brands: a tag that exists only in types

The trick is to add a property that no ordinary string has. An intersection ([Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#intersections)) does it:

brand-idea.ts

```ts
type PaymentId = string & { readonly __brand: "PaymentId" };
type OrderId = string & { readonly __brand: "OrderId" };

function refund(paymentId: PaymentId, orderId: OrderId): string {
  return `refund on ${paymentId} for ${orderId}`;
}

const paymentId = "PAY-88" as PaymentId;
const orderId = "ORD-1042" as OrderId;

refund(paymentId, orderId);
refund(orderId, paymentId);
refund("PAY-88", "ORD-1042");

const printable: string = paymentId;
console.log(printable.length);
```

What `npx tsc --noEmit` prints

```ts
brand-idea.ts:12:8 - error TS2345: Argument of type 'OrderId' is not assignable to parameter of type 'PaymentId'.
  Type 'OrderId' is not assignable to type '{ readonly __brand: "PaymentId"; }'.
    Types of property '__brand' are incompatible.
      Type '"OrderId"' is not assignable to type '"PaymentId"'.

12 refund(orderId, paymentId);
          ~~~~~~~

brand-idea.ts:13:8 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'PaymentId'.
  Type 'string' is not assignable to type '{ readonly __brand: "PaymentId"; }'.

13 refund("PAY-88", "ORD-1042");
          ~~~~~~~~


Found 2 errors in the same file, starting at: brand-idea.ts:12
```

This is a **branded type** (also called an opaque or nominal type): a base type, here `string`, intersected with a **brand**, a property whose literal type names the kind of value. The brand is a **phantom**: it exists only in the type. At runtime a `PaymentId` is the plain string `"PAY-88"` with no extra property, no wrapper object, no cost. The results:

- The correct call compiles.
- Swapped ids fail: an `OrderId`'s brand is `"OrderId"`, not `"PaymentId"`.
- Plain strings fail: a string has no `__brand` at all.
- A branded id is still a string wherever a string is expected, so logging, templates, `Map` keys and database drivers keep working. The last two lines compile.

The `as PaymentId` is the only way to *create* a branded value, and it checks nothing. That is fine as long as there is exactly one place that does it, the place that also checks the value. That place is called a smart constructor, and it comes after one improvement to the brand itself.

### A brand nobody can read or forge

A brand written as a string key, `__brand`, has two weaknesses. The property shows up in editor autocomplete and type-checks when read, although it does not exist at runtime. And any code in the program can write the same brand by hand. A `unique symbol` fixes both:

brand.ts

```ts
declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
```

`declare const brand: unique symbol` announces a symbol that exists only for the type checker: no symbol is ever created at runtime (`declare` emits nothing), and a `unique symbol` type is different from every other symbol. Because it is not exported, no other module can name the key, so no other module can read or spell out the brand. Compare the two styles:

compare.ts

```ts
import type { Brand } from "./brand.js";

type LooseOrderId = string & { readonly __brand: "OrderId" };
type OrderId = Brand<string, "OrderId">;

const loose = "ORD-1042" as LooseOrderId;
const strict = "ORD-1042" as OrderId;

const looseLabel: string = loose.__brand;
const looseForged: LooseOrderId = "ORD-9" as string & { readonly __brand: "OrderId" };

const strictLabel = strict.__brand;
const strictForged: OrderId = "ORD-9" as string & { readonly [brand]: "OrderId" };
```

What `npx tsc --noEmit` prints

```ts
compare.ts:12:28 - error TS2339: Property '__brand' does not exist on type 'OrderId'.

12 const strictLabel = strict.__brand;
                              ~~~~~~~

compare.ts:13:7 - error TS2322: Type 'string & { readonly [x: number]: "OrderId"; }' is not assignable to type 'OrderId'.
  Type 'string & { readonly [x: number]: "OrderId"; }' is not assignable to type '{ readonly [brand]: "OrderId"; }'.
    Property '[brand]' is missing in type 'String & { readonly [x: number]: "OrderId"; }' but required in type '{ readonly [brand]: "OrderId"; }'.

13 const strictForged: OrderId = "ORD-9" as string & { readonly [brand]: "OrderId" };
         ~~~~~~~~~~~~

  brand.ts:3:60 - '[brand]' is declared here.
    3 export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
                                                                 ~~~~~~~

compare.ts:13:63 - error TS2304: Cannot find name 'brand'.

13 const strictForged: OrderId = "ORD-9" as string & { readonly [brand]: "OrderId" };
                                                                 ~~~~~


Found 3 errors in the same file, starting at: compare.ts:12
```

The loose brand can be read (it type-checks, and would be `undefined` at runtime) and forged from any file by writing its shape. The symbol brand can do neither; the only ways in are a cast in the module that owns the type, or a cast spelling out `Brand<string, "OrderId">`, which is easy to find in code review.

|  | String key `__brand` | `unique symbol` key |
| --- | --- | --- |
| Readable by mistake | Yes: `id.__brand` compiles, is `undefined` | No |
| Forgeable by writing the shape | Yes, from any file | Only by importing `Brand` and casting |
| Two copies of a library in one app | Compatible: same key, same type | Incompatible: each copy has its own symbol |
| Readable error messages | Mentions `__brand` | Mentions `[brand]` |

The third row is why shared libraries sometimes choose the string key: when an app ends up with two installed versions of a package (the dual package hazard from [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems)), symbol-branded ids from one copy do not fit the other copy's types. `@zudojs/constants`, which the whole framework shares, uses `__brand`, as you will see below. In your own application code, the symbol is the better default.

## Smart constructors: validate once, trust afterwards

A **smart constructor** is the one function allowed to create a branded value. It takes the raw input, checks it, and only then applies the brand. Every other part of the program receives branded values and never checks them again: an `OrderId` in a function signature now *means* "a string that passed the order id check". This is the "parse, don't validate" idea from [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional#reason), applied to single values.

REASON IT OUT

### What should an order id constructor accept?

Order ids look like `ORD-1042`. They come from URLs, forms, CSV imports and support agents typing them in. Before writing `parseOrderId`, decide:

- Should `" ord-1042 "` be accepted? As what?
- What about `"ORD-"`, `"ORD-01042"`, `"ORD-1042; DROP TABLE orders"`, or a 5,000-character string?
- Should a bad id throw, or come back as a value?
- Does passing the check mean the order exists?

**Show the reasoning**

- Normalise first, then check: trim and upper-case, so `" ord-1042 "` becomes `"ORD-1042"`. Two spellings must not become two different ids, or a lookup by one spelling misses the record stored under the other. `createTenantId` in `@zudojs/constants` does exactly this.
- Reject everything that does not match the exact format: `ORD-`, then 1 to 12 digits, anchored at both ends (`^…$`) so nothing can be appended. The length limit also protects every place the id is later used: logs, cache keys, SQL parameters. Leading zeros are a policy choice; here they are allowed, because the database stores the id as text.
- At a boundary where bad input is expected (a request, a form), return a `Result` so the caller can report it. Inside the program, where a bad id means a bug, throwing is fine. You can offer both.
- No. The brand says the *format* is right. Whether order ORD-1042 exists, and whether this user may see it, is a question for the database and for authorisation. A brand can only record facts that were checked when it was created, and existence can change afterwards.

A `Result` type as in [Designing generic APIs](https://zudojs.oyinlola.site/learn/ts-generic-design#result), and a small factory that makes one parser per kind of id:

result.ts

```ts
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

brand.ts

```ts
declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
```

ids.ts

```ts
import type { Brand } from "./brand.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";

export type UserId = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;
export type PaymentId = Brand<string, "PaymentId">;

function idParser<Id extends Brand<string, string>>(prefix: string, label: string) {
  const pattern = new RegExp(`^${prefix}-\\d{1,12}$`);
  return (raw: string): Result<Id, string> => {
    const value = raw.trim().toUpperCase();
    return pattern.test(value) ? ok(value as Id) : err(`not a valid ${label}: ${JSON.stringify(raw.slice(0, 40))}`);
  };
}

export const parseUserId = idParser<UserId>("USR", "user id");
export const parseOrderId = idParser<OrderId>("ORD", "order id");
export const parsePaymentId = idParser<PaymentId>("PAY", "payment id");

export function orderId(raw: string): OrderId {
  const result = parseOrderId(raw);
  if (!result.ok) throw new TypeError(result.error);
  return result.value;
}
```

The only `as` in the project is inside `idParser`, on the line that has just tested the value. `orderId` is the throwing variant for code that holds trusted input, such as test fixtures and ids read back from your own database. The error message quotes at most 40 characters of the input, so a 5,000-character attack string does not flood the logs.

ids-demo.ts

```ts
import { orderId, parseOrderId, parsePaymentId } from "./ids.js";

for (const raw of [" ord-1042 ", "ORD-", "ORD-1042; DROP TABLE orders", "PAY-88", "ORD-" + "9".repeat(5000)]) {
  const result = parseOrderId(raw);
  console.log(result.ok ? `ok ${result.value}` : result.error);
}

const payment = parsePaymentId("pay-88");
console.log(payment.ok && payment.value);

try {
  orderId("1042");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx ids-demo.ts` and of the browser terminal

```ts
ok ORD-1042
not a valid order id: "ORD-"
not a valid order id: "ORD-1042; DROP TABLE orders"
not a valid order id: "PAY-88"
not a valid order id: "ORD-999999999999999999999999999999999999"
PAY-88
TypeError: not a valid order id: "1042"
```

### Guards and assertions

Two more shapes of smart constructor are useful when the raw value is already in a variable: a type guard that narrows it in place, and an assertion function ([Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#assertion-functions)) that throws otherwise. Neither normalises; they only check. Use them for values that are already in canonical form, such as ids read back from your own database:

guards.ts

```ts
import type { PaymentId } from "./ids.js";

const PAYMENT_ID = /^PAY-\d{1,12}$/;

export function isPaymentId(value: string): value is PaymentId {
  return PAYMENT_ID.test(value);
}

export function assertPaymentId(value: string): asserts value is PaymentId {
  if (!isPaymentId(value)) throw new TypeError(`not a payment id: ${JSON.stringify(value)}`);
}

function lookup(id: PaymentId): string {
  return `looking up ${id}`;
}

const fromRow: string = "PAY-88";
if (isPaymentId(fromRow)) console.log(lookup(fromRow));

const fromCache: string = "PAY-90";
assertPaymentId(fromCache);
console.log(lookup(fromCache));
```

Output of `npx tsx guards.ts` and of the browser terminal

```ts
looking up PAY-88
looking up PAY-90
```

## Units: kobo and naira

Money is the most valuable place for brands. [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) and [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) settled on storing amounts as whole kobo, because floating-point naira drift (`0.1 + 0.2`). But a `number` does not say which unit it holds, and the opening bug passed naira where kobo was expected. Two brands, two constructors, and conversions that are the only way from one unit to the other:

brand.ts

```ts
declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
```

money.ts

```ts
import type { Brand } from "./brand.js";

export type Kobo = Brand<number, "Kobo">;
export type Naira = Brand<number, "Naira">;

export function kobo(amount: number): Kobo {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`kobo must be a whole number, got ${amount}`);
  return amount as Kobo;
}

export function naira(amount: number): Naira {
  if (!Number.isFinite(amount) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw new RangeError(`naira must have at most 2 decimal places, got ${amount}`);
  }
  return amount as Naira;
}

export const toKobo = (amount: Naira): Kobo => kobo(Math.round(amount * 100));
export const toNaira = (amount: Kobo): Naira => naira(amount / 100);

export const addKobo = (...amounts: readonly Kobo[]): Kobo => kobo(amounts.reduce((sum, amount) => sum + amount, 0));
export const subtractKobo = (from: Kobo, amount: Kobo): Kobo => kobo(from - amount);
export const percentOf = (amount: Kobo, percent: number): Kobo => kobo(Math.round((amount * percent) / 100));

export function formatKobo(amount: Kobo): string {
  const sign = amount < 0 ? "-" : "";
  const [whole = "0", fraction = "00"] = (Math.abs(amount) / 100).toFixed(2).split(".");
  return `${sign}₦${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
```

- `kobo` accepts only safe integers: no fractions of a kobo, no `NaN`, no `Infinity`, nothing beyond 253 where integers stop being exact.
- `naira` accepts at most two decimal places, with a tolerance. The obvious test, `Math.round(amount * 100) === amount * 100`, rejects an everyday price: `19.99 * 100` is `1998.9999999999998` in floating point ([Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers)). So the check allows a difference of a millionth of a kobo, which absorbs floating-point noise but not a real third decimal: ₦50.555 is 0.5 kobo away from a whole number.
- Arithmetic has helpers. The `+` operator on two `Kobo` values returns a plain `number`: the compiler does not know that the sum of two kobo amounts is still kobo. The helpers put the brand back, through the constructor, so every result is checked again.

Now the compiler knows about units:

unit-errors.ts

```ts
import { addKobo, kobo, naira, toKobo } from "./money.js";
import type { Kobo } from "./money.js";

function refundToCard(amount: Kobo): string {
  return `refunding ${amount} kobo`;
}

const fiveThousandNaira = naira(5000);
const deliveryFee = kobo(150000);

refundToCard(toKobo(fiveThousandNaira));
refundToCard(fiveThousandNaira);
refundToCard(5000);

const total: Kobo = deliveryFee + deliveryFee;
const sameTotal: Kobo = addKobo(deliveryFee, deliveryFee);
console.log(fiveThousandNaira === deliveryFee);
```

What `npx tsc --noEmit` prints

```ts
unit-errors.ts:12:14 - error TS2345: Argument of type 'Naira' is not assignable to parameter of type 'Kobo'.
  Type 'Naira' is not assignable to type '{ readonly [brand]: "Kobo"; }'.
    Types of property '[brand]' are incompatible.
      Type '"Naira"' is not assignable to type '"Kobo"'.

12 refundToCard(fiveThousandNaira);
                ~~~~~~~~~~~~~~~~~

unit-errors.ts:13:14 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'Kobo'.
  Type 'number' is not assignable to type '{ readonly [brand]: "Kobo"; }'.

13 refundToCard(5000);
                ~~~~

unit-errors.ts:15:7 - error TS2322: Type 'number' is not assignable to type 'Kobo'.
  Type 'number' is not assignable to type '{ readonly [brand]: "Kobo"; }'.

15 const total: Kobo = deliveryFee + deliveryFee;
         ~~~~~

unit-errors.ts:17:13 - error TS2367: This comparison appears to be unintentional because the types 'Naira' and 'Kobo' have no overlap.

17 console.log(fiveThousandNaira === deliveryFee);
               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 4 errors in the same file, starting at: unit-errors.ts:12
```

Naira where kobo is expected: refused. A bare number: refused. `deliveryFee + deliveryFee` assigned to `Kobo`: refused, with the fix one line below. And comparing a naira amount to a kobo amount is flagged as a comparison that can never be true, because `Kobo` and `Naira` have no values in common. That last error catches a subtle bug: `if (paid === expected)` with the two sides in different units would be silently false forever.

money-demo.ts

```ts
import { addKobo, formatKobo, kobo, naira, percentOf, subtractKobo, toKobo, toNaira } from "./money.js";

const subtotal = toKobo(naira(20200));
const discount = percentOf(kobo(1700000), 10);
const vat = percentOf(subtractKobo(subtotal, discount), 7.5);
const total = addKobo(subtotal, vat, kobo(150000));

console.log(formatKobo(subtotal), formatKobo(discount), formatKobo(vat), formatKobo(total));
console.log(toNaira(total), toKobo(naira(19.99)), formatKobo(kobo(-2500)), formatKobo(kobo(123456789)));

for (const bad of [() => naira(50.555), () => kobo(0.5), () => kobo(Number.NaN)]) {
  try {
    bad();
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx money-demo.ts` and of the browser terminal

```ts
₦20,200.00 ₦1,700.00 ₦1,387.50 ₦23,087.50
23087.5 1999 -₦25.00 ₦1,234,567.89
RangeError: naira must have at most 2 decimal places, got 50.555
RangeError: kobo must be a whole number, got 0.5
RangeError: kobo must be a whole number, got NaN
```

> TIP
>
> The same pattern works for every unit that is stored as a plain number: grams and kilograms for delivery weight, minutes and milliseconds for timeouts, basis points and percent for interest rates. If mixing two units up has ever caused a bug, give each one a brand.

## Branded ids in @zudojs/constants

ZudoJS defines its shared identifiers once, in `@zudojs/constants`, and every other package imports them from there ([Types and constants](https://zudojs.oyinlola.site/learn/zudo-types-constants)). The published package exports a `Brand<T, B>` helper with a string key, `T & { readonly __brand: B }`, and a set of branded types built with it: `UserId`, `EventId`, `RequestId`, `CorrelationId`, `SessionId`, `TenantId`, `MessageId`, `TokenId`, `Timestamp`, `Url`, `EmailAddress` and a few encodings. `@zudojs/auth` re-exports the same `UserId`, so an id made by one package fits the other.

The package also exports a constructor for each, and here the details matter: **some constructors validate, and some only apply the brand**.

zudo-ids.ts

```ts
import { createEmailAddress, createTenantId, createTimestamp, createUserId, InvalidConstantError } from "@zudojs/constants";
import type { TenantId, UserId } from "@zudojs/constants";

const unchecked: UserId = createUserId("legacy-user-42");
console.log(JSON.stringify(unchecked), typeof unchecked);

const tenant: TenantId = createTenantId("  Mama-Put-Kitchen ");
console.log(tenant);

const attempts = [
  () => createUserId(""),
  () => createTenantId("acme/../billing"),
  () => createEmailAddress("ada@"),
  () => createTimestamp("2026-02-30T10:00:00Z"),
];
for (const attempt of attempts) {
  try {
    attempt();
  } catch (error) {
    if (error instanceof InvalidConstantError) console.log(`${error.name}: ${error.message}`);
  }
}
console.log(createTimestamp("2026-09-24T19:05:00Z"), createEmailAddress("ada@example.com"));
```

Output of `npx tsx zudo-ids.ts` and of the browser terminal

```ts
"legacy-user-42" string
mama-put-kitchen
InvalidConstantError: UserId must be a non-empty string.
InvalidConstantError: Invalid tenant id: "acme/../billing"
InvalidConstantError: Invalid email address: "ada@"
InvalidConstantError: Invalid ISO 8601 timestamp: "2026-02-30T10:00:00Z"
2026-09-24T19:05:00Z ada@example.com
```

- `createUserId` (and `createEventId`, `createRequestId`, `createCorrelationId`, `createSessionId`, `createMessageId`, `createMessageCausationId` and `createTokenId`) reject an empty string or a non-string with `InvalidConstantError`, but otherwise accept anything: they are mostly a labelled cast. Use them where the id was already checked, for example after `@zudojs/auth` verified a token, or wrap them in your own smart constructor that validates your id format first. (Before `@zudojs/constants` 1.2.0, they accepted even an empty string.)
- `createTenantId` is a real smart constructor. It normalises (Unicode NFKC, trim, lower case) so two spellings of one tenant cannot become two tenants, and rejects anything that could act as a path segment or separator, because tenant ids end up in cache keys, schema names and file paths.
- `createEmailAddress`, `createTimestamp` and `createUrl` validate too, and throw `InvalidConstantError` (owned by `@zudojs/errors`). `createTimestamp` even rejects 30 February, which `Date.parse` would quietly roll over into March.
- Because the brand is a string key, `unchecked.__brand` type-checks (as `"UserId"`) and is `undefined` at runtime. Do not read it.

In a ZudoJS project, import these types instead of defining your own `UserId`: a second, incompatible `UserId` would reject ids coming from the framework. Define your own brands for your own domain (`OrderId`, `PaymentId`, `Kobo`), which the framework does not know about.

## Where brands disappear

A brand is a promise the compiler tracks. It is lost, or can be faked, in a few predictable places. Knowing them is most of the skill.

leaks.ts

```ts
import { orderId } from "./ids.js";
import type { OrderId } from "./ids.js";

const id: OrderId = orderId("ORD-1042");

const trimmed = id.trim();
const lower = id.toLowerCase();
const viaJson = JSON.parse(JSON.stringify({ id })) as { id: string };
const keys = Object.keys({ [id]: true });

const index = new Map<OrderId, string>([[id, "Ada"]]);
console.log(index.get(orderId(" ord-1042")), typeof trimmed, lower, viaJson.id === id, keys);
```

Output of `npx tsx leaks.ts` and of the browser terminal

```ts
Ada string ord-1042 true [ 'ORD-1042' ]
```

- **Methods and operators return the base type.** `trim()` returns `string`, `+` returns `number`. That is correct: `id.toLowerCase()` is *not* a valid order id. Re-brand only through the constructor.
- **JSON, databases, `Object.keys` and URLs return plain strings.** Brands are erased at runtime, so anything that comes back from outside must be parsed again. The usual place is the repository or the request handler, the same boundary where other validation happens.
- **Branded values work as `Map` keys**, and a normalising constructor makes lookups reliable: `" ord-1042"` found the entry stored under `ORD-1042`.
- **A cast can forge any brand.** `"anything" as OrderId` compiles. Keep the casts in the constructors, and treat any other `as SomethingId` in a code review as a bug until proven otherwise. A lint rule that bans `as` outside certain files enforces it.

### Validation libraries brand too

Schema libraries produce branded types from their parsers, so the schema is the smart constructor. With Zod, `.brand<"OrderId">()` after the checks:

zod-brand.tsNode.js only

```ts
import { z } from "zod";

const OrderIdSchema = z.string().trim().toUpperCase().regex(/^ORD-\d{1,12}$/).brand<"OrderId">();
type OrderId = z.infer<typeof OrderIdSchema>;

function cancel(id: OrderId): string {
  return `cancelling ${id}`;
}

console.log(cancel(OrderIdSchema.parse(" ord-1042 ")));
const bad = OrderIdSchema.safeParse("ORD-");
console.log(bad.success, bad.success ? "" : bad.error.issues[0]?.code);
```

Output of `npx tsx zod-brand.ts`

```ts
cancelling ORD-1042
false invalid_format
```

Zod's brand is its own type (`string & z.$brand<"OrderId">`), so a Zod `OrderId` and the `OrderId` from `ids.ts` are different types. Pick one source of branded types per project. [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) compares the libraries.

## Build: identifiers and money for a refunds service

The refund from the opening, done properly. The request arrives as untrusted JSON; the handler parses every id and amount into branded values; the refund logic only accepts branded values and checks the business rules. The project reuses `result.ts`, `brand.ts` and `ids.ts` from above and adds the money helpers:

money.ts

```ts
import type { Brand } from "./brand.js";

export type Kobo = Brand<number, "Kobo">;
export type Naira = Brand<number, "Naira">;

export function kobo(amount: number): Kobo {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`kobo must be a whole number, got ${amount}`);
  return amount as Kobo;
}

export function parseNaira(raw: unknown): Naira | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6 ? undefined : (raw as Naira);
}

export const toKobo = (amount: Naira): Kobo => kobo(Math.round(amount * 100));
export const addKobo = (a: Kobo, b: Kobo): Kobo => kobo(a + b);
export const subtractKobo = (from: Kobo, amount: Kobo): Kobo => kobo(from - amount);
export const formatKobo = (amount: Kobo): string => `₦${(amount / 100).toFixed(2)}`;
```

The refund rules take only branded values. A payment belongs to one order and has a captured amount and an already-refunded amount:

refunds.ts

```ts
import type { OrderId, PaymentId, UserId } from "./ids.js";
import { addKobo, kobo, subtractKobo } from "./money.js";
import type { Kobo } from "./money.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";

export interface CapturedPayment {
  readonly id: PaymentId;
  readonly orderId: OrderId;
  readonly customer: UserId;
  readonly captured: Kobo;
  readonly refunded: Kobo;
}

export type RefundError =
  | { readonly code: "wrong-order"; readonly paymentOrder: OrderId }
  | { readonly code: "too-much"; readonly remaining: Kobo };

export function refund(payment: CapturedPayment, order: OrderId, amount: Kobo): Result<CapturedPayment, RefundError> {
  if (payment.orderId !== order) return err({ code: "wrong-order", paymentOrder: payment.orderId });
  const remaining = subtractKobo(payment.captured, payment.refunded);
  if (amount > remaining) return err({ code: "too-much", remaining });
  return ok({ ...payment, refunded: addKobo(payment.refunded, amount) });
}

export const remainingOf = (payment: CapturedPayment): Kobo => kobo(payment.captured - payment.refunded);
```

The handler is the boundary. It receives `unknown`, parses each field with its smart constructor, collects every problem, and only then calls `refund`:

handler.ts

```ts
import { parseOrderId, parsePaymentId } from "./ids.js";
import type { PaymentId } from "./ids.js";
import { formatKobo, parseNaira, toKobo } from "./money.js";
import { refund } from "./refunds.js";
import type { CapturedPayment } from "./refunds.js";

const field = (body: unknown, key: string): unknown =>
  typeof body === "object" && body !== null && Object.hasOwn(body, key) ? (body as Record<string, unknown>)[key] : undefined;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function handleRefund(body: unknown, payments: Map<PaymentId, CapturedPayment>): string {
  const paymentId = parsePaymentId(text(field(body, "paymentId")));
  const orderId = parseOrderId(text(field(body, "orderId")));
  const amount = parseNaira(field(body, "amountNaira"));

  const problems = [
    ...(paymentId.ok ? [] : [paymentId.error]),
    ...(orderId.ok ? [] : [orderId.error]),
    ...(amount === undefined ? ["amountNaira must be a positive naira amount with at most 2 decimals"] : []),
  ];
  if (!paymentId.ok || !orderId.ok || amount === undefined) return `400 ${problems.join("; ")}`;

  const payment = payments.get(paymentId.value);
  if (payment === undefined) return `404 no payment ${paymentId.value}`;

  const result = refund(payment, orderId.value, toKobo(amount));
  if (!result.ok) {
    return result.error.code === "wrong-order"
      ? `409 payment ${payment.id} belongs to ${result.error.paymentOrder}`
      : `409 only ${formatKobo(result.error.remaining)} left to refund`;
  }
  payments.set(payment.id, result.value);
  return `200 refunded ${formatKobo(toKobo(amount))} on ${payment.id}`;
}
```

main.ts

```ts
import { orderId, parsePaymentId, parseUserId } from "./ids.js";
import type { PaymentId } from "./ids.js";
import { kobo } from "./money.js";
import { handleRefund } from "./handler.js";
import type { CapturedPayment } from "./refunds.js";

const payId = parsePaymentId("PAY-88");
const customer = parseUserId("USR-7");
if (!payId.ok || !customer.ok) throw new Error("bad fixture");

const payments = new Map<PaymentId, CapturedPayment>([
  [payId.value, { id: payId.value, orderId: orderId("ORD-1042"), customer: customer.value, captured: kobo(1638750), refunded: kobo(0) }],
]);

const requests: unknown[] = [
  { paymentId: "ORD-1042", orderId: "PAY-88", amountNaira: 5000 },
  { paymentId: "pay-88", orderId: "ORD-1043", amountNaira: 5000 },
  { paymentId: "PAY-88", orderId: "ORD-1042", amountNaira: 50.555 },
  { paymentId: "PAY-88", orderId: "ord-1042", amountNaira: 5000 },
  { paymentId: "PAY-88", orderId: "ORD-1042", amountNaira: 12000 },
  { paymentId: "PAY-90", orderId: "ORD-1042", amountNaira: 1 },
  "refund please",
];

for (const body of requests) console.log(handleRefund(body, payments));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
400 not a valid payment id: "ORD-1042"; not a valid order id: "PAY-88"
409 payment PAY-88 belongs to ORD-1042
400 amountNaira must be a positive naira amount with at most 2 decimals
200 refunded ₦5000.00 on PAY-88
409 only ₦11387.50 left to refund
404 no payment PAY-90
400 not a valid payment id: ""; not a valid order id: ""; amountNaira must be a positive naira amount with at most 2 decimals
```

The swapped ids from the opening are now a 400 with both problems named, instead of a refund against the wrong record. The lower-case ids were normalised and accepted. The second refund was limited to what was left on the payment, and the amount that could not be represented in kobo was refused before any arithmetic.

Inside `refunds.ts`, nothing checks formats or units any more: the signature `refund(payment, order: OrderId, amount: Kobo)` already guarantees them. The compiler also guarantees the argument order:

misuse.ts

```ts
import { orderId } from "./ids.js";
import { kobo } from "./money.js";
import { refund } from "./refunds.js";
import type { CapturedPayment } from "./refunds.js";

declare const payment: CapturedPayment;

refund(payment, payment.id, kobo(500000));
refund(payment, orderId("ORD-1042"), 500000);
refund(payment, "ORD-1042", kobo(500000));
```

What `npx tsc --noEmit` prints

```ts
misuse.ts:8:17 - error TS2345: Argument of type 'PaymentId' is not assignable to parameter of type 'OrderId'.
  Type 'PaymentId' is not assignable to type '{ readonly [brand]: "OrderId"; }'.
    Types of property '[brand]' are incompatible.
      Type '"PaymentId"' is not assignable to type '"OrderId"'.

8 refund(payment, payment.id, kobo(500000));
                  ~~~~~~~~~~

misuse.ts:9:38 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'Kobo'.
  Type 'number' is not assignable to type '{ readonly [brand]: "Kobo"; }'.

9 refund(payment, orderId("ORD-1042"), 500000);
                                       ~~~~~~

misuse.ts:10:17 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'OrderId'.
  Type 'string' is not assignable to type '{ readonly [brand]: "OrderId"; }'.

10 refund(payment, "ORD-1042", kobo(500000));
                   ~~~~~~~~~~


Found 3 errors in the same file, starting at: misuse.ts:8
```

### Testing branded code

Test the constructors hardest: they are the only gate. Then pin the type-level promises with `@ts-expect-error`, inside a function that never runs:

ids.test.ts

```ts
import { orderId, parseOrderId, parsePaymentId } from "./ids.js";
import type { OrderId, PaymentId } from "./ids.js";
import { kobo, parseNaira, toKobo } from "./money.js";
import type { Kobo, Naira } from "./money.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

check("normalises case and spaces", parseOrderId("  ord-7 "), { ok: true, value: "ORD-7" });
check("rejects the bare prefix", parseOrderId("ORD-").ok, false);
check("rejects suffixes", parseOrderId("ORD-7x").ok, false);
check("rejects 13 digits", parseOrderId("ORD-1234567890123").ok, false);
check("rejects the other kind", parsePaymentId("ORD-7").ok, false);
check("kobo rejects fractions", (() => { try { return kobo(0.5); } catch { return "threw"; } })(), "threw");
check("naira to kobo", toKobo(parseNaira(19.99) as Naira), 1999);
check("naira rejects 3 decimals", parseNaira(0.125), undefined);
check("naira rejects zero", parseNaira(0), undefined);

function typeTests(order: OrderId, payment: PaymentId, amount: Kobo, inNaira: Naira): void {
  // @ts-expect-error: an order id is not a payment id
  const p: PaymentId = order;
  // @ts-expect-error: a plain string is not an order id
  const o: OrderId = "ORD-7";
  // @ts-expect-error: naira is not kobo
  const k: Kobo = inNaira;
  const s: string = payment;
  const n: number = amount;
  console.log(p, o, k, s, n, orderId);
}
console.log("type tests compiled:", typeTests.length === 4);
```

Output of `npx tsx ids.test.ts` and of the browser terminal

```ts
PASS normalises case and spaces -> {"ok":true,"value":"ORD-7"}
PASS rejects the bare prefix -> false
PASS rejects suffixes -> false
PASS rejects 13 digits -> false
PASS rejects the other kind -> false
PASS kobo rejects fractions -> "threw"
PASS naira to kobo -> 1999
PASS naira rejects 3 decimals -> undefined
PASS naira rejects zero -> undefined
type tests compiled: true
```

The last two lines inside `typeTests` are positive tests: a brand must still fit its base type, or logging and database code would break.

## Branded types in production

- **Brand at the boundaries, trust inside.** Request handlers, message consumers, repositories and CSV importers parse raw values into branded ones. Domain code only accepts branded types. This keeps every check in one place per kind of value.
- **Brand what gets mixed up.** Ids that travel together through the same functions (user, order, payment), money in different units, validated strings (emails, tenant ids, sanitised HTML). A local loop counter does not need a brand.
- **Keep casts out of application code.** The only `as SomeId` belongs in the constructor. Search the codebase for others now and then; each one is a hole.
- **They cost nothing at runtime.** The value is the same string or number, so there is no memory, speed or serialisation cost. The cost is in writing constructors and helpers such as `addKobo`, which is also where the checks live.
- **Share brands through one package.** In ZudoJS projects, `UserId`, `TenantId` and the other framework ids come from `@zudojs/constants`; check whether the constructor you call validates. Keep your own domain brands in one module of your own.
- **Existence and permission are not brands.** A valid `OrderId` can still point to a deleted order or one the user may not see. Those checks happen at use time, against the database and the permission system.

## Practice

TRY IT YOURSELF

### A normalising email constructor

Write `parseEmail(raw: string): Result<Email, string>` for a brand `Email`. It trims and lower-cases the input, rejects anything over 254 characters, and accepts only a simple `local@domain.tld` shape. Two spellings of the same address must produce the same `Email`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Normalise first: `const value = raw.trim().toLowerCase();`. Two differently-cased spellings must normalise to the same string, so check the pattern and length *after* normalising.

HINT 2

`if (value.length > 254) return { ok: false, error: "email is too long" };` then `if (!EMAIL.test(value)) return { ok: false, error: ... };` and finally `return { ok: true, value: value as Email };`.

SOLUTION

email.ts

```ts
declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };
type Email = Brand<string, "Email">;
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(raw: string): Result<Email, string> {
  const value = raw.trim().toLowerCase();
  if (value.length > 254) return { ok: false, error: "email is too long" };
  if (!EMAIL.test(value)) return { ok: false, error: `not an email: ${JSON.stringify(raw.slice(0, 40))}` };
  return { ok: true, value: value as Email };
}

const a = parseEmail("  Ada@Example.com ");
const b = parseEmail("ada@example.com");
console.log(a.ok && b.ok && a.value === b.value, a.ok && a.value);
console.log(parseEmail("ada@example").ok, parseEmail(`${"a".repeat(250)}@x.ng`).ok);
```

Output of `npx tsx email.ts` and of the browser terminal

```ts
true ada@example.com
false false
```

Normalising before the check is what makes the brand useful for lookups and uniqueness: a sign-up with `Ada@Example.com` and a login with `ada@example.com` now meet the same account. The pattern is deliberately loose; the only real proof that an address works is a confirmation email, which is a fact worth another brand, `VerifiedEmail`, created only by the code that handles the confirmation link.

TRY IT YOURSELF

### Split a bill without losing a kobo

Three friends split a ₦10,000 bill. `10000 / 3` is not a whole number of kobo. Write `splitKobo(total: Kobo, parts: number): readonly Kobo[]` that returns amounts that differ by at most one kobo and always add up to exactly `total`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Compute `base = Math.floor(total / parts)` and `extra = total - base * parts` (how many kobo are left over, always less than `parts`).

HINT 2

`Array.from({ length: parts }, (_, i) => kobo(base + (i < extra ? 1 : 0)))`: the first `extra` people get one kobo more than the rest.

SOLUTION

split.ts

```ts
declare const brand: unique symbol;
type Kobo = number & { readonly [brand]: "Kobo" };

function kobo(amount: number): Kobo {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`kobo must be a whole number, got ${amount}`);
  return amount as Kobo;
}

function splitKobo(total: Kobo, parts: number): readonly Kobo[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`cannot split into ${parts} parts`);
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => kobo(base + (i < extra ? 1 : 0)));
}

const shares = splitKobo(kobo(1000000), 3);
console.log(shares, shares.reduce((sum, share) => sum + share, 0));
console.log(splitKobo(kobo(100), 7));
```

Output of `npx tsx split.ts` and of the browser terminal

```json
[ 333334, 333333, 333333 ] 1000000
[
  15, 15, 14, 14,
  14, 14, 14
]
```

Integer division gives each person the base share, and the leftover kobo (at most `parts - 1` of them) go one each to the first people. Rounding each share separately (`Math.round(total / parts)`) would give 333,333 × 3 = 999,999: a kobo lost. Allocation that preserves the total is a standard rule in payment systems.

TRY IT YOURSELF

### Basis points for rates

Interest and VAT rates cause unit bugs too: is `7.5` a percent or a fraction? Add a brand `BasisPoints` (1 basis point = 0.01%, so 7.5% is 750 bp), a constructor that accepts whole numbers from 0 to 10,000, and `applyRate(amount: Kobo, rate: BasisPoints): Kobo`. Show that passing a plain `7.5` is a compile error.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Brand `BasisPoints` the same way as `Kobo`: `type BasisPoints = Brand<number, "BasisPoints">;`. Its constructor should throw for anything that is not a whole number from 0 to 10,000.

HINT 2

`const basisPoints = (value: number): BasisPoints => { if (!Number.isInteger(value) || value < 0 || value > 10000) throw new RangeError(...); return value as BasisPoints; };`

SOLUTION

rates.ts

```ts
declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };
type Kobo = Brand<number, "Kobo">;
type BasisPoints = Brand<number, "BasisPoints">;

const kobo = (amount: number): Kobo => {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`kobo must be a whole number, got ${amount}`);
  return amount as Kobo;
};

const basisPoints = (value: number): BasisPoints => {
  if (!Number.isInteger(value) || value < 0 || value > 10000) throw new RangeError(`basis points must be 0 to 10000, got ${value}`);
  return value as BasisPoints;
};

const applyRate = (amount: Kobo, rate: BasisPoints): Kobo => kobo(Math.round((amount * rate) / 10000));

const VAT = basisPoints(750);
console.log(applyRate(kobo(1000000), VAT));
console.log(applyRate(kobo(1000000), 7.5));
```

What `npx tsc --noEmit` prints

```ts
rates.ts:20:38 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'BasisPoints'.
  Type 'number' is not assignable to type '{ readonly [brand]: "BasisPoints"; }'.

20 console.log(applyRate(kobo(1000000), 7.5));
                                        ~~~


Found 1 error in rates.ts:20
```

With the brand, the only way to get a rate is `basisPoints(750)`, which also rejects `7.5` at runtime because it is not a whole number of basis points. Remove the last line and the program prints `75000`. Banks use basis points for exactly this reason: an integer rate has no "percent or fraction?" ambiguity.

## Recap

- A type alias is only a name: `type OrderId = string` accepts every string. A brand, `string & { readonly [brand]: "OrderId" }`, adds a phantom property that plain strings and other ids lack, at zero runtime cost.
- Use a non-exported `unique symbol` as the key, so the brand cannot be read or forged by writing its shape. String-key brands (as in `@zudojs/constants`) stay compatible across duplicate package copies, at the cost of being readable and forgeable.
- A smart constructor is the only place that casts. It normalises, validates, and brands; it returns a `Result` at boundaries and may throw inside. Guards and assertion functions brand values that are already canonical.
- Brand units: `Kobo` and `Naira` cannot be mixed or compared, operators return plain numbers, and helpers like `addKobo` re-check and re-brand.
- `@zudojs/constants` exports `Brand` and the framework ids. `createTenantId`, `createEmailAddress`, `createTimestamp` and `createUrl` validate; `createUserId` and the other id constructors only brand.
- Brands disappear through methods, operators, JSON, databases and `Object.keys`, and can be forged by any cast: parse again at every boundary and keep casts in constructors.

Next: [Type-safe domain modelling](https://zudojs.oyinlola.site/learn/ts-domain-modeling), where brands, unions and readonly data combine into a commerce domain in which illegal states cannot be written.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
