---
title: "Type assertions — ZudoJS Academy"
description: "Learn what as, angle brackets, as unknown as and the non-null ! really do, why none of them check or convert anything, and which safer tool to use instead."
source: https://zudojs.oyinlola.site/learn/ts-assertions
---

LEVEL 5 · LESSON 11 OF 23

Special types and narrowing Foundation

# Type assertions

Learn what as, angle brackets, as unknown as and the non-null ! really do, why none of them check or convert anything, and which safer tool to use instead.

- **40 min** to read and try
- **You need:** Narrowing
- **You build:** A signup handler rebuilt from an unsafe request.body as NewUser into a checked parse, plus safe replacements for every common assertion

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a type assertion changes and what it cannot change
- Predict which assertions tsc accepts and which it rejects with TS2352
- Replace non-null assertions with checks, defaults and getOrThrow helpers
- Choose between as, satisfies, an annotation and a type guard
- Recognise the few places where an assertion is justified

## One line that trusts a stranger

Here is the heart of a signup endpoint for a small savings app. Frameworks such as Express give you the parsed request body typed as `any`, so the author adds `as NewUser` to "give it a type" and saves the result:

signup.ts

```ts
interface NewUser {
  email: string;
  name: string;
}

interface StoredUser extends NewUser {
  id: number;
  role: "customer" | "admin";
}

const users: StoredUser[] = [];

function signup(body: unknown): StoredUser {
  const input = body as NewUser;
  const user: StoredUser = { id: users.length + 1, role: "customer", ...input };
  users.push(user);
  return user;
}

const attack = JSON.parse('{"email": "eve@example.com", "name": "Eve", "role": "admin"}');
console.log(signup(attack));

try {
  const broken = signup(JSON.parse('{"name": "Tunde"}'));
  console.log(broken.email.toLowerCase());
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx signup.ts` and of the browser terminal

```json
{ id: 1, role: 'admin', email: 'eve@example.com', name: 'Eve' }
TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

Two requests, two disasters, and `tsc` is silent about both:

- The first client sent an extra `"role": "admin"`. `as NewUser` did not remove it, and because the spread comes last it overwrote `role: "customer"`. Eve just made herself an administrator.
- The second client left out `email`. The code typed `broken.email` as a `string`, and it crashed on the first string method.

`body as NewUser` reads like a conversion. It is not one. This lesson explains what a **type assertion** actually does, which ones `tsc` refuses, and what to write instead. You saw `as` and `!` vanish from the emitted code in [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#erasure); here you go all the way.

## What as does, and does not do

A **type assertion**, `expression as Type`, tells the compiler: "treat this expression as having `Type`, I take responsibility". It changes the type the compiler uses from that point on. It does nothing else. It does not check the value, convert it, copy it, or remove properties. Compile a file with assertions and look at the JavaScript:

erased.ts

```ts
interface User {
  id: number;
  email: string;
}

const body: unknown = JSON.parse('{"id": 1, "email": "ada@example.com"}');
const user = body as User;
const other = <User>body;
const balances = new Map<string, number>([["ACC-1", 5000]]);
const balance = balances.get("ACC-1")!;
console.log(user.email, other.id, balance);
```

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
```

dist/erased.js

```ts
const body = JSON.parse('{"id": 1, "email": "ada@example.com"}');
const user = body;
const other = body;
const balances = new Map([["ACC-1", 5000]]);
const balance = balances.get("ACC-1");
console.log(user.email, other.id, balance);
export {};
```

`body as User` became `body`. So did `<User>body`, and the `!` after `get(…)` simply vanished. Whatever `body` holds at runtime is exactly what `user` holds.

Many languages have **casts** that do convert: in C, casting a float to an int really drops the decimals. People often call TypeScript assertions "casts", and the name misleads. When you need a conversion, call a function that converts:

convert.ts

```ts
const fromForm: unknown = "2500";

const asserted = fromForm as unknown as number;
const converted = Number(fromForm);

console.log(typeof asserted, asserted + 500);
console.log(typeof converted, converted + 500);
```

Output of `npx tsx convert.ts` and of the browser terminal

```ts
string 2500500
number 3000
```

The asserted value is still the string `"2500"`, so `+ 500` joins text and prints `2500500`, with the compiler's full blessing. `Number(…)` really produced a number.

## Which assertions compile

TypeScript does not accept every assertion. It allows `x as T` when the two types **overlap sufficiently**: when the type of `x` is assignable to `T`, or `T` is assignable to the type of `x`. In practice that means you may move *up* to a wider type (always safe) or *down* to a narrower one (unchecked). You may not jump sideways between unrelated types:

sideways.ts

```ts
interface Account {
  id: number;
  balance: number;
}

const amount = "2500" as number;
const account = { id: "ACC-1", balance: 5000 } as Account;
```

What `npx tsc --noEmit` prints

```ts
sideways.ts:6:16 - error TS2352: Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.

6 const amount = "2500" as number;
                 ~~~~~~~~~~~~~~~~

sideways.ts:7:17 - error TS2352: Conversion of type '{ id: string; balance: number; }' to type 'Account' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Types of property 'id' are incompatible.
    Type 'string' is not comparable to type 'number'.

7 const account = { id: "ACC-1", balance: 5000 } as Account;
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: sideways.ts:6
```

Error **TS2352** is the compiler asking "are you sure?". It even tells you how to override it: go through `unknown`, which every type is assignable to. That is the **double assertion**, `as unknown as T`, and it compiles for any `T` at all. When you find yourself writing it, stop and ask why the types do not overlap.

Now the surprising part: the overlap rule lets through a lot of things that are wrong. All of these compile:

lets-through.ts

```ts
type PaymentKind = "card" | "transfer";

interface Account {
  id: string;
  balance: number;
  currency: string;
}

const kind = "cash" as PaymentKind;
const account = { id: "ACC-1" } as Account;
const extra = { id: "ACC-2", balance: 0, currency: "NGN", frozen: true } as Account;

console.log(kind, account.balance, account.currency?.toUpperCase());
console.log(Object.keys(extra));
```

Output of `npx tsx lets-through.ts` and of the browser terminal

```ts
cash undefined undefined
[ 'id', 'balance', 'currency', 'frozen' ]
```

- `"cash" as PaymentKind`: in an assertion, the literal `"cash"` is compared as a `string`, and `string` overlaps with any union of strings. A value that is not in the union now has the union's type.
- `{ id: "ACC-1" } as Account`: `Account` is assignable to `{ id: string }`, so the assertion is a legal "move down". The missing `balance` and `currency` are simply `undefined`.
- `frozen: true` survives: excess property checks, which catch unknown properties in `const a: Account = { … }`, do not run on assertions.

An annotation would have caught the last two. That is the general rule: **an annotation checks the value against the type; an assertion overrides the check**.

annotate.ts

```ts
interface Account {
  id: string;
  balance: number;
  currency: string;
}

const account: Account = { id: "ACC-1" };
const extra: Account = { id: "ACC-2", balance: 0, currency: "NGN", frozen: true };
```

What `npx tsc --noEmit` prints

```ts
annotate.ts:7:7 - error TS2739: Type '{ id: string; }' is missing the following properties from type 'Account': balance, currency

7 const account: Account = { id: "ACC-1" };
        ~~~~~~~

annotate.ts:8:68 - error TS2353: Object literal may only specify known properties, and 'frozen' does not exist in type 'Account'.

8 const extra: Account = { id: "ACC-2", balance: 0, currency: "NGN", frozen: true };
                                                                     ~~~~~~


Found 2 errors in the same file, starting at: annotate.ts:7
```

## The angle-bracket form

TypeScript had assertions before it had `as`. The original syntax puts the type in angle brackets in front of the expression:

angle.ts

```ts
type Currency = "NGN" | "USD";

const raw: unknown = "NGN";
const withAs = raw as Currency;
const withBrackets = <Currency>raw;

console.log(withAs === withBrackets, withBrackets);
```

Output of `npx tsx angle.ts` and of the browser terminal

```ts
true NGN
```

The two forms mean exactly the same thing. Everyone uses `as` today, for two reasons. In `.tsx` files (TypeScript with JSX, used by React), `<Currency>raw` looks like an HTML tag, so the angle-bracket form is not allowed there at all. And it is easily confused with generics: `<Currency>raw` and `parse<Currency>(raw)` look alike but do completely different things. Recognise the old form when you read older code; write `as`.

## The non-null assertion !

A postfix `!` after an expression is the **non-null assertion operator**. It removes `null` and `undefined` from the expression's type. Like `as`, it compiles to nothing, so it is only true if you are right:

bang.ts

```ts
const balances = new Map<string, number>([
  ["ACC-1", 125000],
  ["ACC-2", 0],
]);

function withdraw(accountId: string, amount: number): number {
  const balance = balances.get(accountId)!;
  return balance - amount;
}

console.log(withdraw("ACC-1", 5000));
console.log(withdraw("ACC-9", 5000));
```

Output of `npx tsx bang.ts` and of the browser terminal

```ts
120000
NaN
```

No crash, which is worse. `undefined - 5000` is `NaN`, and a `NaN` balance can travel through the whole system, into a database and onto a statement, before anyone notices. The `!` told the compiler "this account exists", and nobody checked.

Every `!` has a safer replacement. Pick the one that says what should happen when the value is missing:

bang-fixed.ts

```ts
const balances = new Map<string, number>([
  ["ACC-1", 125000],
  ["ACC-2", 0],
]);

function getOrThrow<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${what} not found: ${String(key)}`);
  return value;
}

function withdraw(accountId: string, amount: number): number {
  const balance = getOrThrow(balances, accountId, "account");
  return balance - amount;
}

function displayBalance(accountId: string): string {
  return `₦${balances.get(accountId) ?? 0}`;
}

console.log(withdraw("ACC-2", 0), displayBalance("ACC-9"));
try {
  withdraw("ACC-9", 5000);
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx bang-fixed.ts` and of the browser terminal

```ts
0 ₦0
Error: account not found: ACC-9
```

- **Missing is a bug**: throw, with a message that says what was missing. `getOrThrow` is a tiny generic helper you will write once per project.
- **Missing has a sensible default**: use `??`. Showing ₦0 for an unknown account on a dashboard might be acceptable; withdrawing from it is not.
- **Missing needs a decision**: check with `if (value === undefined)` and handle it, as in [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#truthiness).

### Definite assignment: let x!: T

The `!` has a second job. After a variable or class property name, it is a **definite assignment assertion**: "this will be set before anyone reads it, even though you cannot see where". It switches off the check that catches reading a property before it is set:

definite.ts

```ts
class Invoice {
  total!: number;

  addLine(amount: number): void {
    this.total += amount;
  }
}

const invoice = new Invoice();
invoice.addLine(2500);
console.log(invoice.total);
```

Output of `npx tsx definite.ts` and of the browser terminal

```ts
NaN
```

Nothing set `total` first, so `undefined + 2500` gave `NaN`. Give the property a starting value (`total = 0`) or set it in the constructor instead. The `!` form is only for properties that a framework or a setup method fills in, and even then, a constructor parameter is usually clearer.

## as unknown as T

You saw that `as unknown as T` turns anything into anything. There is one place where it is common and reasonable: **test fakes**. A real `PaymentGateway` interface might have twenty methods, and a unit test only needs one:

fake.ts

```ts
interface PaymentGateway {
  charge(cardToken: string, kobo: number): Promise<{ reference: string }>;
  refund(reference: string): Promise<void>;
  balance(): Promise<number>;
}

async function payInvoice(gateway: PaymentGateway, kobo: number): Promise<string> {
  const { reference } = await gateway.charge("tok_test", kobo);
  return `paid ${kobo} kobo, ref ${reference}`;
}

const fakeGateway = {
  charge: async (_token: string, kobo: number) => ({ reference: `TEST-${kobo}` }),
} as unknown as PaymentGateway;

console.log(await payInvoice(fakeGateway, 250000));
```

Output of `npx tsx fake.ts` and of the browser terminal

```ts
paid 250000 kobo, ref TEST-250000
```

Inside a test, a missing method fails loudly and at once (*gateway.refund is not a function*), in a file that only runs in CI. That is a price worth paying to avoid writing twenty empty methods. In application code, the same line would hide the missing methods until a customer triggers one. [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#fakes) shows the full-fake alternative, which the compiler checks.

## Better tools: annotations, satisfies, as const and guards

Most assertions in real code are written because the author wanted a value to *have* a type, and `as` was the first tool that came to mind. Each of those situations has a tool that checks instead of overriding.

### Annotate when you create the value

`const fee: Fee = { … }` checks the object. `const fee = { … } as Fee` does not. When you are writing the value yourself, annotate.

### satisfies: check, but keep the precise type

An annotation has one downside: the variable gets exactly the annotated type, and loses the details of the value. The `satisfies` operator checks the value against a type, like an annotation, but lets the variable keep the more precise type TypeScript inferred:

satisfies.ts

```ts
type Currency = "NGN" | "USD" | "GBP";

interface FeeRule {
  percent: number;
  cap?: number;
}

const fees = {
  NGN: { percent: 1.5, cap: 2000 },
  USD: { percent: 2.9 },
  GBP: { percent: 2.5, cap: 20 },
} satisfies Record<Currency, FeeRule>;

console.log(fees.NGN.cap.toLocaleString("en-NG"));
console.log(Object.keys(fees).join(", "));
```

Output of `npx tsx satisfies.ts` and of the browser terminal

```ts
2,000
NGN, USD, GBP
```

`satisfies Record<Currency, FeeRule>` checked that all three currencies are present and that every rule is well-formed. But `fees.NGN` still has the type `{ percent: number; cap: number }`, so `fees.NGN.cap` is known to exist, with no `!`. With `as Record<Currency, FeeRule>`, a missing currency would slip through; with an annotation, `cap` would be `number | undefined`. Leave out `GBP` and see which tool notices:

satisfies.ts

```ts
type Currency = "NGN" | "USD" | "GBP";

interface FeeRule {
  percent: number;
  cap?: number;
}

const withAs = {
  NGN: { percent: 1.5, cap: 2000 },
  USD: { percent: 2.9 },
} as Record<Currency, FeeRule>;

const withSatisfies = {
  NGN: { percent: 1.5, cap: 2000 },
  USD: { percent: 2.9 },
} satisfies Record<Currency, FeeRule>;
```

What `npx tsc --noEmit` prints

```ts
satisfies.ts:16:3 - error TS2741: Property 'GBP' is missing in type '{ NGN: { percent: number; cap: number; }; USD: { percent: number; }; }' but required in type 'Record<Currency, FeeRule>'.

16 } satisfies Record<Currency, FeeRule>;
     ~~~~~~~~~


Found 1 error in satisfies.ts:16
```

Only `satisfies` complained. The `as` version compiles, and `withAs.GBP.percent` would crash at runtime.

### as const is the safe assertion

`as const` is written like an assertion, but it can only make a type *narrower and read-only*, never different: `["card", "transfer"] as const` becomes `readonly ["card", "transfer"]`. It cannot lie about the value, because the value is right there. You met it in [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#widening), and the next lesson uses it to replace enums.

### Guards for values you did not create

For values from outside (request bodies, `JSON.parse`, files, `localStorage`, other services), neither `as` nor `satisfies` helps: `satisfies` checks only what the compiler can see, and it cannot see runtime data. Use a type guard, an assertion function or a validator, as in [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#type-guards).

| You want to… | Use | Checked? |
| --- | --- | --- |
| Give a value you write a type | `const x: T = …` | Yes |
| Check a value but keep its precise type | `… satisfies T` | Yes |
| Keep literal values, read-only | `… as const` | Yes (nothing to lie about) |
| Trust data from outside | Guard, assertion function, validator | Yes, at runtime |
| Tell the compiler something it cannot know | `… as T` | No |
| Say "not null" without checking | `value!` | No |

## When an assertion is justified

REASON IT OUT

### Before you write as

You are about to write `something as SomeType`. Before you do, answer these for yourself:

- Where did the value come from? Did your own code create it, or did it cross a boundary (network, disk, user input, another library)?
- What exactly do you know that the compiler does not? Can you point to the line that proves it?
- Could that proof become false later, when someone edits the code far away?
- If you are wrong, what happens: a crash in a test, a wrong number on a statement, or a security hole?

**Show the reasoning**

An assertion is defensible only when the value comes from your own code, the proof is visible nearby (ideally on the line above), and being wrong fails loudly. If the value crossed a boundary, you do not *know* anything, you are *hoping*, and you need a runtime check. If the proof lives in another file, the next refactor can break it silently, so encode it in the types instead (a guard, a generic, a discriminated union). And if being wrong means wrong money or wrong permissions, never assert: check.

With those questions answered, a handful of situations remain where `as` is the honest tool:

1. **After a check the compiler cannot follow.** `Object.keys(obj)` is typed `string[]` even for an object you built with known keys, because other objects with extra keys could be passed in. For an object you just created, `Object.keys(rates) as Currency[]` is true.
2. **Moving up to a wider type.** `[] as Payment[]` or `new Map() as Map<string, number>` gives an empty value its intended type. (A type argument, `new Map<string, number>()`, or an annotation is still clearer.)
3. **Test fakes**, as above, where a mistake fails immediately.
4. **Browser DOM lookups** such as `document.querySelector("#amount") as HTMLInputElement`, when the HTML is in the same project. Even there, `instanceof HTMLInputElement` costs one line and checks for real.

keys.ts

```ts
type Currency = "NGN" | "USD" | "GBP";

const rates: Record<Currency, number> = { NGN: 1, USD: 1550, GBP: 2050 };

const currencies = Object.keys(rates) as Currency[];
for (const currency of currencies) {
  console.log(currency, rates[currency]);
}
```

Output of `npx tsx keys.ts` and of the browser terminal

```ts
NGN 1
USD 1550
GBP 2050
```

The proof is on the line above: `rates` was created two lines earlier with exactly those keys. Now compare with the signup handler: its value came from the network. No proof exists anywhere in the program, so no assertion is justified there.

### When assertions signal poor design

Count the `as` and `!` in a file. More than one or two usually means the types do not describe the data. Typical causes, and their fixes:

- **One wide type with many optional fields**, and `payment.card!.last4` everywhere. Use a discriminated union, so narrowing proves which fields exist.
- **A function that returns `any` or `unknown`**, and every caller asserts. Make the function generic, or make it validate and return the precise type.
- **`as` on every value read from storage or JSON.** Write one validator at the boundary; everything inside is then correctly typed without assertions.
- **`!` after every `find` and `get`.** Add a `getOrThrow`-style helper, or handle the missing case.

## Build: the signup handler, fixed

Back to the endpoint from the start. The fix has three parts: treat the body as `unknown`, check each field at runtime, and build the stored user from named fields only, so nothing the client sent can sneak through:

signup.ts

```ts
interface NewUser {
  email: string;
  name: string;
}

interface StoredUser extends NewUser {
  id: number;
  role: "customer" | "admin";
}

type Parsed = { ok: true; value: NewUser } | { ok: false; issues: string[] };

function parseNewUser(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, issues: ["body must be a JSON object"] };
  }
  const issues: string[] = [];
  const email = "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = "name" in body && typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) issues.push("email must be a valid address");
  if (name.length < 2) issues.push("name must be at least 2 characters");
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { email, name } };
}

const users: StoredUser[] = [];

function signup(body: unknown): StoredUser | string[] {
  const parsed = parseNewUser(body);
  if (!parsed.ok) return parsed.issues;
  const user: StoredUser = {
    id: users.length + 1,
    role: "customer",
    email: parsed.value.email,
    name: parsed.value.name,
  };
  users.push(user);
  return user;
}

console.log(signup(JSON.parse('{"email": "eve@example.com", "name": "Eve", "role": "admin"}')));
console.log(signup(JSON.parse('{"name": "Tunde"}')));
console.log(signup(JSON.parse('{"email": " ADA@Example.com ", "name": "Ada"}')));
console.log(signup(JSON.parse("[1, 2]")));
```

Output of `npx tsx signup.ts` and of the browser terminal

```json
{ id: 1, role: 'customer', email: 'eve@example.com', name: 'Eve' }
[ 'email must be a valid address' ]
{ id: 2, role: 'customer', email: 'ada@example.com', name: 'Ada' }
[ 'body must be a JSON object' ]
```

There is not a single assertion left. `"email" in body` followed by `typeof body.email === "string"` narrows the property step by step, as you learned in the previous lesson. Eve's `role` is ignored because `StoredUser` is built from four named fields, the missing e-mail is reported instead of crashing, and addresses are normalised on the way in. [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) shows how schema libraries write the parse function for you.

## Testing code that used to assert

Assertions hide bugs from the compiler, so the tests have to look for them. Two habits catch most of them:

- **Test with the data an assertion would have trusted.** Missing fields, wrong types, extra fields such as `role`, an array instead of an object, `null`. The happy path never exercises the code an assertion skipped.
- **Test that nothing extra gets through.** Compare the keys of the result with the keys you expect, so an accidental spread is caught.

signup.test.tsNode.js only

```ts
import assert from "node:assert/strict";

function allowOnly(input: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in input) out[key] = input[key];
  return out;
}

const cleaned = allowOnly({ email: "eve@example.com", name: "Eve", role: "admin" }, ["email", "name"]);
assert.deepEqual(Object.keys(cleaned), ["email", "name"]);
assert.equal("role" in cleaned, false);
console.log("extra fields are dropped");

assert.deepEqual(allowOnly({}, ["email", "name"]), {});
console.log("missing fields stay missing");
```

Output of `npx tsx signup.test.ts`

```ts
extra fields are dropped
missing fields stay missing
```

`node:assert/strict` is Node's built-in assertion library (runtime checks that throw, not type assertions), so this example runs in Node.js only. In a real project these checks go into Vitest tests, which you will meet in [the testing lesson](https://zudojs.oyinlola.site/learn/testing-basics).

## Assertions in production code

- **Ban them at the boundary.** No `as` on request bodies, query strings, environment variables, `JSON.parse`, database rows from raw SQL, or responses from other services. Parse them.
- **Let a linter count them.** typescript-eslint has rules such as `no-non-null-assertion` and `consistent-type-assertions` that flag or forbid assertions, so every remaining one is a deliberate, reviewed choice.
- **Leave a reason.** When an assertion is justified, a short comment with the proof ("keys come from the literal above") saves the next reader from guessing.
- **Prefer failing loudly.** A `getOrThrow` that throws with a clear message is far cheaper to debug than a `NaN` that reached a customer's statement.

## Practice

TRY IT YOURSELF

### Remove the non-null assertions

This function finds a booking and its room. Both lookups use `!`. Rewrite it so an unknown booking throws `booking not found: ID`, and a booking whose room has been removed returns `"room unavailable"`.

booking.ts

```ts
const rooms = new Map([["R1", "Deluxe"], ["R2", "Standard"]]);
const bookings = [
  { id: "B1", roomId: "R1" },
  { id: "B2", roomId: "R9" },
];

function roomFor(bookingId: string): string {
  const booking = bookings.find((b) => b.id === bookingId)!;
  return rooms.get(booking.roomId)!;
}

console.log(roomFor("B1"), roomFor("B2"));
```

Output of `npx tsx booking.ts` and of the browser terminal

```ts
Deluxe undefined
```

**Show a solution**

booking.ts

```ts
const rooms = new Map([["R1", "Deluxe"], ["R2", "Standard"]]);
const bookings = [
  { id: "B1", roomId: "R1" },
  { id: "B2", roomId: "R9" },
];

function roomFor(bookingId: string): string {
  const booking = bookings.find((b) => b.id === bookingId);
  if (booking === undefined) throw new Error(`booking not found: ${bookingId}`);
  return rooms.get(booking.roomId) ?? "room unavailable";
}

console.log(roomFor("B1"), roomFor("B2"));
try {
  roomFor("B7");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx booking.ts` and of the browser terminal

```ts
Deluxe room unavailable
Error: booking not found: B7
```

The two lookups fail for different reasons, so they get different treatments: an unknown booking id is a caller's mistake (throw), and a removed room is a normal situation with a sensible answer (`??`). The original silently printed `undefined`.

TRY IT YOURSELF

### as or satisfies?

A config object for SMS providers is written with `as`. Replace `as` with `satisfies`, run `tsc`, and fix what it finds.

providers.ts

```ts
type Provider = "termii" | "twilio";

interface ProviderConfig {
  baseUrl: string;
  timeoutMs: number;
}

const providers = {
  termii: { baseUrl: "https://api.ng.termii.com", timeoutMs: 5000 },
  twilio: { baseUrl: "https://api.twilio.com" },
} as Record<Provider, ProviderConfig>;

console.log(providers.twilio.timeoutMs * 2);
```

Output of `npx tsx providers.ts` and of the browser terminal

```ts
NaN
```

**Show a solution**

With `satisfies`, `tsc` reports that `timeoutMs` is missing in the `twilio` entry. Add it:

providers.ts

```ts
type Provider = "termii" | "twilio";

interface ProviderConfig {
  baseUrl: string;
  timeoutMs: number;
}

const providers = {
  termii: { baseUrl: "https://api.ng.termii.com", timeoutMs: 5000 },
  twilio: { baseUrl: "https://api.twilio.com", timeoutMs: 8000 },
} satisfies Record<Provider, ProviderConfig>;

console.log(providers.twilio.timeoutMs * 2);
```

Output of `npx tsx providers.ts` and of the browser terminal

```ts
16000
```

The `as` version printed `NaN`: `undefined * 2`. It compiled because `ProviderConfig` is assignable to `{ baseUrl: string }`, so the assertion was a legal "move down" to a narrower type.

TRY IT YOURSELF

### Spot the justified assertion

Three assertions from a codebase. Which one is justified, and what should replace the other two?

1. `const user = (await response.json()) as User;`
2. `const methods = Object.keys(feeTable) as PaymentMethod[];`, where `feeTable` is a `Record<PaymentMethod, number>` literal defined just above.
3. `const port = process.env.PORT as unknown as number;`

**Show a solution**

Only the second. The keys come from an object literal the same file created, and the proof is on the line above.

The first trusts another service's response, which crossed a network boundary. Validate it with a guard or a schema. The third does not even convert: `process.env.PORT` is a string (or `undefined`), and after the assertion it is still a string that the compiler calls a number. Convert it with `Number(…)` and check the result; [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#practice), later in this course, writes exactly such a `readPort` function.

## Recap

- `x as T` and `<T>x` change what the compiler believes and compile to nothing. They never check, convert, copy or remove anything.
- `tsc` allows an assertion when the types overlap: up to a wider type (safe) or down to a narrower one (unchecked). Sideways gives TS2352; `as unknown as T` overrides it and should be rare.
- Assertions skip missing-property and excess-property checks, and `"cash" as PaymentKind` compiles. An annotation or `satisfies` checks instead.
- `value!` removes `null` and `undefined` without a check; `field!: T` skips the definite-assignment check. Replace them with a check, `??`, or a `getOrThrow` helper.
- Justified: after a proof the compiler cannot follow, widening, test fakes. Never on data from outside: `request.body as User` is a security hole waiting to happen.

Next: [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums), and the JavaScript that each kind of enum really becomes.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
