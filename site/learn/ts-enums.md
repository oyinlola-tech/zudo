---
title: "Enums and their alternatives — ZudoJS Academy"
description: "Write numeric, string and const enums, read the JavaScript tsc emits for each, avoid their pitfalls, and replace them with unions and as const objects."
source: https://zudojs.oyinlola.site/learn/ts-enums
---

LEVEL 5 · LESSON 12 OF 23

Special types and narrowing Foundation

# Enums and their alternatives

Write numeric, string and const enums, read the JavaScript tsc emits for each, avoid their pitfalls, and replace them with unions and as const objects.

- **45 min** to read and try
- **You need:** Narrowing and Type assertions
- **You build:** A payment-status module migrated from a numeric enum to an as const object, without changing a single call site

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write numeric, string and const enums and read the JavaScript tsc emits for each
- Explain reverse mappings and why Object.keys doubles on numeric enums
- Avoid the enum pitfalls: unchecked numbers, reordered members and nominal string enums
- Explain why Node's type stripping and erasableSyntaxOnly reject enums
- Replace an enum with a literal union or an as const object and its derived type

## Magic numbers in a payments table

A payments service you have just joined stores each payment's status as a small number, and the code is full of lines like these:

magic.ts

```ts
const payment = { id: "PAY-1", amount: 25000, status: 2 };

if (payment.status === 2) {
  console.log("send receipt");
}
if (payment.status === 3) {
  console.log("return the money");
}
```

Output of `npx tsx magic.ts` and of the browser terminal

```ts
send receipt
```

What is status 2? You have to find someone who remembers, or a comment somewhere. And nothing stops a typo: `status === 4` compiles, even if 4 means nothing. The values need *names*, the names need to be checked, and the set of allowed values needs to be closed.

Many languages solve this with an **enum** (short for enumeration): a named set of constants. TypeScript has one too. It is one of the very few TypeScript features that is not just types: it generates JavaScript. That makes it worth understanding exactly, because it behaves differently from everything else you have learned, and because modern TypeScript tooling increasingly prefers the alternatives. This lesson covers both.

## Numeric enums

An `enum` declaration lists names. By default, the first gets the value `0`, and each next one is one higher:

status.ts

```ts
enum PaymentStatus {
  Pending,
  Authorized,
  Captured,
  Refunded,
}

const payment = { id: "PAY-1", amount: 25000, status: PaymentStatus.Captured };

if (payment.status === PaymentStatus.Captured) {
  console.log("send receipt");
}
console.log(payment.status, PaymentStatus.Refunded);
```

Output of `npx tsx status.ts` and of the browser terminal

```ts
send receipt
2 3
```

`PaymentStatus.Captured` reads far better than `2`, and a misspelled member is a compile error. `PaymentStatus` is two things at once: a **type** (`status: PaymentStatus`) and a **value**, an object that exists when the program runs. You can pick the numbers yourself, too. Members without a value continue counting from the last one:

codes.ts

```ts
enum TransferError {
  InsufficientFunds = 51,
  LimitExceeded = 61,
  AccountBlocked,
  UnknownBank = 91,
}

console.log(TransferError.InsufficientFunds, TransferError.AccountBlocked, TransferError.UnknownBank);
```

Output of `npx tsx codes.ts` and of the browser terminal

```ts
51 62 91
```

### What tsc emits

Everything else you have written in TypeScript disappears when compiled. An enum does not. Here is the real output of `tsc` for `status.ts`:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
```

dist/status.js

```ts
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus[PaymentStatus["Pending"] = 0] = "Pending";
    PaymentStatus[PaymentStatus["Authorized"] = 1] = "Authorized";
    PaymentStatus[PaymentStatus["Captured"] = 2] = "Captured";
    PaymentStatus[PaymentStatus["Refunded"] = 3] = "Refunded";
})(PaymentStatus || (PaymentStatus = {}));
const payment = { id: "PAY-1", amount: 25000, status: PaymentStatus.Captured };
if (payment.status === PaymentStatus.Captured) {
    console.log("send receipt");
}
console.log(payment.status, PaymentStatus.Refunded);
export {};
```

Read the middle line from the inside out. `PaymentStatus["Captured"] = 2` stores 2 under the name, and an assignment expression evaluates to the assigned value, so the outer part becomes `PaymentStatus[2] = "Captured"`: the name stored under the number. The function wrapped around it is an **IIFE** (an immediately invoked function expression), and `PaymentStatus || (PaymentStatus = {})` lets several declarations of the same enum add to one object. That emitted code is plain JavaScript; run it and print the object:

emitted.js

```ts
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus[PaymentStatus["Pending"] = 0] = "Pending";
    PaymentStatus[PaymentStatus["Authorized"] = 1] = "Authorized";
    PaymentStatus[PaymentStatus["Captured"] = 2] = "Captured";
    PaymentStatus[PaymentStatus["Refunded"] = 3] = "Refunded";
})(PaymentStatus || (PaymentStatus = {}));

console.log(PaymentStatus);
```

Output of `node emitted.js` and of the browser terminal

```json
{
  '0': 'Pending',
  '1': 'Authorized',
  '2': 'Captured',
  '3': 'Refunded',
  Pending: 0,
  Authorized: 1,
  Captured: 2,
  Refunded: 3
}
```

## Reverse mappings

That second set of keys, number to name, is called a **reverse mapping**. Only numeric members get one. It is handy for logs, where a bare `2` tells you nothing:

reverse.ts

```ts
enum PaymentStatus {
  Pending,
  Authorized,
  Captured,
  Refunded,
}

const fromDatabase: PaymentStatus = 2;
console.log(`status ${fromDatabase} is ${PaymentStatus[fromDatabase]}`);

console.log(Object.keys(PaymentStatus));
console.log(Object.keys(PaymentStatus).length);
```

Output of `npx tsx reverse.ts` and of the browser terminal

```ts
status 2 is Captured
[ '0', '1', '2', '3', 'Pending', 'Authorized', 'Captured', 'Refunded' ]
8
```

It is also a trap. `Object.keys`, `Object.values` and `for…in` see *both* directions, so an enum with four members has eight keys. A status dropdown built with `Object.keys(PaymentStatus)` shows "0", "1", "2" and "3" next to the names. To list the members, keep only the numeric values:

list.ts

```ts
enum PaymentStatus {
  Pending,
  Authorized,
  Captured,
  Refunded,
}

const values = Object.values(PaymentStatus).filter((value) => typeof value === "number");
const names = values.map((value) => PaymentStatus[value]);
console.log(values, names);
```

Output of `npx tsx list.ts` and of the browser terminal

```json
[ 0, 1, 2, 3 ] [ 'Pending', 'Authorized', 'Captured', 'Refunded' ]
```

## String enums

In a **string enum**, every member gets an explicit string value. There is no auto-increment and no reverse mapping:

currency.ts

```ts
enum Currency {
  Naira = "NGN",
  Dollar = "USD",
  Pound = "GBP",
}

const price = { amount: 250000, currency: Currency.Naira };
console.log(price, JSON.stringify(price));
console.log(Currency);
```

Output of `npx tsx currency.ts` and of the browser terminal

```json
{ amount: 250000, currency: 'NGN' } {"amount":250000,"currency":"NGN"}
{ Naira: 'NGN', Dollar: 'USD', Pound: 'GBP' }
```

The emitted JavaScript has just one assignment per member:

dist/currency.js

```ts
var Currency;
(function (Currency) {
    Currency["Naira"] = "NGN";
    Currency["Dollar"] = "USD";
    Currency["Pound"] = "GBP";
})(Currency || (Currency = {}));
const price = { amount: 250000, currency: Currency.Naira };
console.log(price, JSON.stringify(price));
console.log(Currency);
export {};
```

String enums fix the unreadable-number problem: the JSON says `"NGN"`, which a person, a database column and another service all understand. But they have a property no other TypeScript type has: they are **nominal**. A *nominal* type is matched by its name, not by its shape. The string `"NGN"` is exactly the value of `Currency.Naira`, and it is still not accepted:

nominal.ts

```ts
enum Currency {
  Naira = "NGN",
  Dollar = "USD",
}

function format(amount: number, currency: Currency): string {
  return `${currency} ${amount.toFixed(2)}`;
}

console.log(format(5000, "NGN"));
```

What `npx tsc --noEmit` prints

```ts
nominal.ts:10:26 - error TS2345: Argument of type '"NGN"' is not assignable to parameter of type 'Currency'.

10 console.log(format(5000, "NGN"));
                            ~~~~~


Found 1 error in nominal.ts:10
```

Every value that arrives as JSON, from a query string or from a database row is a plain string, so every one of them needs a check before it becomes a `Currency`. That is the right thing to do with outside data anyway, but it also applies to your own tests and fixtures, which is where string enums start to feel heavy.

## const enums

A `const enum` is meant to leave no object behind at all. `tsc` replaces each use with the literal value, and deletes the declaration. Without the `isolatedModules` setting, that is what happens. Here the course's `verbatimModuleSyntax` (which implies `isolatedModules`) is switched off for one run:

direction.ts

```ts
const enum Direction {
  Credit = "CR",
  Debit = "DR",
}

const entry = { amount: 5000, direction: Direction.Debit };
console.log(entry);
```

tsc without isolatedModules

```bash
$ npx tsc --noEmit false --outDir dist --verbatimModuleSyntax false
```

dist/direction.js

```ts
const entry = { amount: 5000, direction: "DR" /* Direction.Debit */ };
console.log(entry);
export {};
```

Now compile the same file with the settings this course uses (and ZudoJS uses, and `tsc --init` writes): `verbatimModuleSyntax`, which turns on `isolatedModules`. The output is completely different:

tsc with verbatimModuleSyntax (TypeScript 7)

```bash
$ npx tsc --noEmit false --outDir dist
```

dist/direction.js

```ts
var Direction;
(function (Direction) {
    Direction["Credit"] = "CR";
    Direction["Debit"] = "DR";
})(Direction || (Direction = {}));
const entry = { amount: 5000, direction: Direction.Debit };
console.log(entry);
export {};
```

The reason is the way modern tools work. `tsx`, the browser terminal, bundlers and Node.js all translate **one file at a time**, without reading the others. To inline `Direction.Debit` in `ledger.ts`, a tool would have to open `direction.ts` to find out it is `"DR"`. So under `isolatedModules`, which exists to keep your code translatable file by file, a `const enum` is emitted and used like a normal enum (`isolatedModules` also switches on `preserveConstEnums`, the option that keeps the object). The one thing that still differs: a `const enum` has no reverse mapping you are allowed to use:

reverse-const.ts

```ts
const enum Priority {
  Low,
  High,
}

console.log(Priority[0]);
```

What `npx tsc --noEmit` prints

```ts
reverse-const.ts:6:22 - error TS2476: A const enum member can only be accessed using a string literal.

6 console.log(Priority[0]);
                       ~


Found 1 error in reverse-const.ts:6
```

The practical lesson: `const enum` only pays off in projects compiled by `tsc` alone, without `isolatedModules`. In a modern project it is a normal enum with an extra restriction.

## Enum pitfalls

### Any number fits a numeric enum

TypeScript refuses a numeric *literal* that is not a member, like `const s: PaymentStatus = 7`. But a value typed `number` is accepted, because numeric enums are also used for bit flags, where combined values are not members:

any-number.ts

```ts
enum PaymentStatus {
  Pending,
  Authorized,
  Captured,
  Refunded,
}

function label(status: PaymentStatus): string {
  return PaymentStatus[status].toLowerCase();
}

const row = { id: "PAY-9", status: 7 };
try {
  console.log(label(row.status));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx any-number.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

`row.status` is a `number`, `label` accepted it, and `PaymentStatus[7]` does not exist. The enum type looked like a closed set, but for numbers it is not a check at all.

### Reordering changes stored values

A numeric enum's values come from the order of the members. That is fine while the values live only in memory. Once they are stored (in a database, a queue message, a cache, a mobile app's local storage), the order becomes a contract. A teammate adds `Disputed` in the place that reads most naturally:

reorder.ts

```ts
enum StatusV1 {
  Pending,
  Authorized,
  Captured,
  Refunded,
}

enum StatusV2 {
  Pending,
  Authorized,
  Disputed,
  Captured,
  Refunded,
}

const storedLastYear = StatusV1.Captured;
console.log(`stored ${storedLastYear}, read back as ${StatusV2[storedLastYear]}`);
```

Output of `npx tsx reorder.ts` and of the browser terminal

```ts
stored 2, read back as Disputed
```

Nothing failed to compile, no test with fresh data failed, and every payment captured before the release is now "disputed". If you use numeric enums for stored values, give every member an explicit number and never change one. Better: store strings.

### Enums are values, and values have a cost

Because an enum is an object, importing its type still imports a module at runtime, and bundlers cannot remove unused members. Two enums with the same members are also incompatible with each other (`Currency.Naira` from one library is not `Currency.Naira` from another), which makes sharing types between packages awkward.

## Node type stripping and erasableSyntaxOnly

In [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup#run) you ran `.ts` files directly with `node`. Node's **type stripping** removes type syntax and runs what is left; it never generates code. An enum *needs* generated code, so Node refuses it:

Node.js 24 from nodejs.org

```bash
$ node --version
v24.19.0
$ node status.ts
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

file://~/ts-tasks/status.ts:1
  > enum PaymentStatus {
      Pending,
      Authorized,
      Captured,
      Refunded,
  > }

SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode
    at parseTypeScript (node:internal/modules/typescript:68:40)
…
Node.js v24.19.0
$ node --experimental-transform-types status.ts
(node:48213) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
send receipt
2 3
```

`const enum` is refused with exactly the same message. The `--experimental-transform-types` flag makes Node generate the enum code, but it is experimental and prints a warning on every start. The code that is *not* erasable is a short list: `enum`, `namespace` blocks with code in them, parameter properties (`constructor(private readonly id: string)`, which [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#not-erased) showed and [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#parameter-properties) covers) and the old `import x = require()` form.

TypeScript 5.8 added a compiler option that makes `tsc` enforce this for you: `erasableSyntaxOnly`. Turn it on in a project that should run under `node` directly:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true
  }
}
```

account.ts

```ts
enum AccountType {
  Savings = "savings",
  Current = "current",
}

class Account {
  constructor(private readonly id: string, readonly type: AccountType) {}
}

console.log(new Account("ACC-1", AccountType.Savings));
```

What `npx tsc --noEmit` prints

```ts
account.ts:1:6 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

1 enum AccountType {
       ~~~~~~~~~~~

account.ts:7:15 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

7   constructor(private readonly id: string, readonly type: AccountType) {}
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~

account.ts:7:44 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

7   constructor(private readonly id: string, readonly type: AccountType) {}
                                             ~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 3 errors in the same file, starting at: account.ts:1
```

Every piece of syntax that Node cannot strip is flagged, before anyone tries to run the file. The rest of this lesson shows what to write instead, and all of it passes with `erasableSyntaxOnly` on.

## The alternatives: literal unions and as const objects

### A union of string literals

The simplest replacement is a union of string literals, which you have used since [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#unions). It is pure type information: the compiled JavaScript has no trace of it, and the values are plain strings everywhere:

union.ts

```ts
type PaymentStatus = "pending" | "authorized" | "captured" | "refunded";

function nextAction(status: PaymentStatus): string {
  switch (status) {
    case "pending":
      return "wait for the bank";
    case "authorized":
      return "capture within 7 days";
    case "captured":
      return "send receipt";
    case "refunded":
      return "close the ticket";
  }
}

const row = JSON.parse('{"id": "PAY-1", "status": "captured"}');
console.log(nextAction("authorized"), "|", nextAction(row.status));
```

Output of `npx tsx union.ts` and of the browser terminal

```ts
capture within 7 days | send receipt
```

You still get autocompletion, typo checking and exhaustive `switch`es. JSON, test fixtures and database values need no conversion. What you lose is a runtime list of the values, for a dropdown or for validating input.

### An as const object

When you want names *and* a runtime object, write the object yourself and derive the type from it. This is the pattern `@zudojs/constants` uses for `HttpStatus`:

status-object.ts

```ts
export const PaymentStatus = {
  Pending: "pending",
  Authorized: "authorized",
  Captured: "captured",
  Refunded: "refunded",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

const ALL: readonly PaymentStatus[] = Object.values(PaymentStatus);

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return ALL.some((status) => status === value);
}

const payment: { status: PaymentStatus } = { status: PaymentStatus.Captured };
console.log(payment.status === "captured", ALL);
console.log(isPaymentStatus("refunded"), isPaymentStatus("lost"), isPaymentStatus(2));
```

Output of `npx tsx status-object.ts` and of the browser terminal

```ts
true [ 'pending', 'authorized', 'captured', 'refunded' ]
true false false
```

- `as const` keeps each value as its literal type and makes the object read-only, so `PaymentStatus.Captured` has the type `"captured"`, not `string`.
- `keyof typeof PaymentStatus` is `"Pending" | "Authorized" | …`, and indexing the object's type with it gives the union of the values. A type and a value may share a name, so `PaymentStatus` works in both places, exactly as with an enum.
- `Object.values` returns exactly the four values, with no reverse mapping to filter out. That list powers the `isPaymentStatus` guard for outside data.
- A plain string `"captured"` is accepted wherever a `PaymentStatus` is expected, because the type is structural, not nominal.

Compiled, the object is exactly what you wrote, minus `as const`, so Node's type stripping runs it without any flag.

### When a numeric enum still makes sense

Ordered levels are the classic case. `@zudojs/logger` defines `LoggerLevel` as a numeric enum because comparing numbers is exactly what a log threshold needs, and the numbers are never stored. `@zudojs/errors` uses a string enum for `ErrorCategory`. All three styles are in the ZudoJS packages you will use:

zudo-constants.ts

```ts
import { HttpStatus } from "@zudojs/constants";
import type { HttpStatusCode } from "@zudojs/constants";
import { LoggerLevel, shouldLog } from "@zudojs/logger";
import { ErrorCategory } from "@zudojs/errors";

const notFound: HttpStatusCode = HttpStatus.NOT_FOUND;
console.log(notFound, typeof HttpStatus);
console.log(LoggerLevel.WARN, LoggerLevel[LoggerLevel.WARN]);
console.log(shouldLog(LoggerLevel.WARN, LoggerLevel.DEBUG), shouldLog(LoggerLevel.WARN, LoggerLevel.ERROR));
console.log(ErrorCategory.RATE_LIMIT);
```

Output of `npx tsx zudo-constants.ts` and of the browser terminal

```ts
404 object
2 WARN
false true
rate_limit
```

With a threshold of `WARN`, a `DEBUG` message (4) is dropped and an `ERROR` (1) is logged: the numeric order carries meaning. When you consume a library's enum, it is already compiled JavaScript, so none of the type-stripping limits apply to you.

|  | Numeric enum | String enum | const enum | Literal union | `as const` object |
| --- | --- | --- | --- | --- | --- |
| Runtime object | Yes | Yes | Only under `isolatedModules` (or `preserveConstEnums`) | No | Yes |
| Readable stored values | No (numbers) | Yes | Depends | Yes | Yes |
| Plain string or number accepted | Any number | No (nominal) | Same as enum | Yes, if a member | Yes, if a member |
| `Object.values` lists members | Doubled | Yes | No | No object | Yes |
| Runs under `node file.ts` | No | No | No | Yes | Yes |

## Build: migrate an enum without touching call sites

REASON IT OUT

### Before you migrate

A payments module exports a numeric `enum PaymentStatus`. It is used in forty files as `PaymentStatus.Captured`, and existing rows in the `payments` table store the numbers 0 to 3. You want to switch to an erasable `as const` object with string values. Think it through before touching the code:

- Which call sites can stay exactly as they are, and which will break?
- What happens to the rows already stored as numbers?
- New code writes strings. For a while, the table holds both numbers and strings. How does the reading code cope?
- What must a test prove before the release?

**Show the reasoning**

Every `PaymentStatus.Captured` keeps working, because the object has the same member names and the type keeps the same name. What breaks is anything that relied on numbers: comparisons like `status > PaymentStatus.Authorized`, reverse lookups like `PaymentStatus[n]`, and `Object.keys` filtering; `tsc` points at each of them. Old rows must be translated when read (or in a database migration), with an explicit table from old numbers to new strings, never computed from member order. The reader must accept both forms during the transition and reject anything else. The tests must cover every old number, every new string, and a value that is neither.

payment-status.ts

```ts
export const PaymentStatus = {
  Pending: "pending",
  Authorized: "authorized",
  Captured: "captured",
  Refunded: "refunded",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

const LEGACY_CODES: Readonly<Record<number, PaymentStatus>> = {
  0: PaymentStatus.Pending,
  1: PaymentStatus.Authorized,
  2: PaymentStatus.Captured,
  3: PaymentStatus.Refunded,
};

const ALL: readonly PaymentStatus[] = Object.values(PaymentStatus);

export function readStatus(stored: unknown): PaymentStatus {
  if (typeof stored === "number") {
    const status = LEGACY_CODES[stored];
    if (status !== undefined) return status;
  }
  for (const status of ALL) {
    if (status === stored) return status;
  }
  throw new RangeError(`unknown payment status: ${JSON.stringify(stored)}`);
}
```

A call site from before the migration, unchanged:

receipts.ts

```ts
import { PaymentStatus, readStatus } from "./payment-status.js";

function nextAction(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.Pending:
      return "wait";
    case PaymentStatus.Authorized:
      return "capture";
    case PaymentStatus.Captured:
      return "send receipt";
    case PaymentStatus.Refunded:
      return "close";
  }
}

const rows: unknown[] = [2, "captured", 0, "refunded", 7, "lost"];
for (const stored of rows) {
  try {
    console.log(JSON.stringify(stored), "->", nextAction(readStatus(stored)));
  } catch (error) {
    console.log(JSON.stringify(stored), "->", String(error));
  }
}
```

Output of `npx tsx receipts.ts` and of the browser terminal

```ts
2 -> send receipt
"captured" -> send receipt
0 -> wait
"refunded" -> close
7 -> RangeError: unknown payment status: 7
"lost" -> RangeError: unknown payment status: "lost"
```

The `switch` still uses `PaymentStatus.Captured`, still gets an exhaustiveness check, and now works with strings. Old numeric rows are translated through an explicit table, so reordering the object later cannot change what an old row means. Anything unknown is refused at the boundary with a clear error, instead of flowing on as `undefined`.

## Testing enums and their replacements

The type checker proves that your code uses the names correctly. It cannot prove that the *values* match the outside world: the strings your database column allows, the codes a partner bank sends. Pin them down with a test that fails loudly when someone edits the list:

status.test.ts

```ts
import { PaymentStatus, readStatus } from "./payment-status.js";

const expected = ["pending", "authorized", "captured", "refunded"];
const actual = Object.values(PaymentStatus);
console.log("values unchanged:", JSON.stringify(actual) === JSON.stringify(expected));

const legacy = [0, 1, 2, 3].map((code) => readStatus(code));
console.log("legacy codes:", legacy.join(", "));

for (const bad of [4, -1, "Captured", null]) {
  try {
    readStatus(bad);
    console.log("FAIL accepted", bad);
  } catch {
    console.log("rejected", JSON.stringify(bad));
  }
}
```

Output of `npx tsx status.test.ts` and of the browser terminal

```ts
values unchanged: true
legacy codes: pending, authorized, captured, refunded
rejected 4
rejected -1
rejected "Captured"
rejected null
```

This is sometimes called a **snapshot** of the values: a deliberate copy that makes any change a visible, reviewed decision. Note `"Captured"` with a capital C: a member *name* is not a member *value*, and the reader correctly refuses it.

## Enums in production code

- **Store strings, not enum numbers.** Readable values survive reordering, show up clearly in logs and SQL, and need no lookup table in other services.
- **Prefer literal unions and `as const` objects in new code.** They are erasable, structural, and list cleanly. Turn on `erasableSyntaxOnly` when the code must run under plain `node`.
- **If you keep a numeric enum, pin every value.** Write `Pending = 0, Authorized = 1, …` explicitly and add new members at the end with new numbers.
- **Validate before you trust.** A number from outside is not a member just because the parameter type says so; neither is a string. Check it against the list of values.
- **Do not export `const enum` from a library.** Consumers compiling with `isolatedModules` cannot inline it, and ambient const enums in `.d.ts` files are an error for them.

## Practice

TRY IT YOURSELF

### Build a dropdown from an enum

A settings page builds its dropdown from this enum and shows eight options instead of four. Fix `options` so it lists four `{ value, label }` pairs, with the member name as the label.

dropdown.ts

```ts
enum Frequency {
  Daily,
  Weekly,
  Monthly,
  Yearly,
}

const options = Object.keys(Frequency).map((key) => ({ value: key, label: key }));
console.log(options.length);
```

Output of `npx tsx dropdown.ts` and of the browser terminal

```ts
8
```

**Show a solution**

dropdown.ts

```ts
enum Frequency {
  Daily,
  Weekly,
  Monthly,
  Yearly,
}

const options = Object.values(Frequency)
  .filter((value) => typeof value === "number")
  .map((value) => ({ value, label: Frequency[value] }));
console.log(options);
```

Output of `npx tsx dropdown.ts` and of the browser terminal

```json
[
  { value: 0, label: 'Daily' },
  { value: 1, label: 'Weekly' },
  { value: 2, label: 'Monthly' },
  { value: 3, label: 'Yearly' }
]
```

The reverse mapping doubles the keys. Keep only the numeric values, and use the reverse mapping on purpose, to get each label.

TRY IT YOURSELF

### Replace a string enum

Rewrite this string enum as an `as const` object with a derived type of the same name, so that `greet("fr")`, a plain string from a query parameter, compiles when it is a valid member. Keep `Language.French` working.

language.ts

```ts
enum Language {
  English = "en",
  French = "fr",
  Yoruba = "yo",
}

function greet(language: Language): string {
  return language === Language.Yoruba ? "Ẹ káàbọ̀" : language === Language.French ? "Bienvenue" : "Welcome";
}

console.log(greet(Language.French), greet("yo"));
```

What `npx tsc --noEmit` prints

```ts
language.ts:11:43 - error TS2345: Argument of type '"yo"' is not assignable to parameter of type 'Language'.

11 console.log(greet(Language.French), greet("yo"));
                                             ~~~~


Found 1 error in language.ts:11
```

**Show a solution**

language.ts

```ts
const Language = {
  English: "en",
  French: "fr",
  Yoruba: "yo",
} as const;

type Language = (typeof Language)[keyof typeof Language];

function greet(language: Language): string {
  return language === Language.Yoruba ? "Ẹ káàbọ̀" : language === Language.French ? "Bienvenue" : "Welcome";
}

console.log(greet(Language.French), greet("yo"));
```

Output of `npx tsx language.ts` and of the browser terminal

```ts
Bienvenue Ẹ káàbọ̀
```

The derived type is the union `"en" | "fr" | "yo"`, which is structural, so the literal `"yo"` is accepted. A string you receive at runtime is only a `string`, so it still needs a guard like `isPaymentStatus` first.

TRY IT YOURSELF

### Pin the numbers

A `KycLevel` enum is stored in the database as numbers: `None`, `Basic`, `Verified`. Product wants a new level, `Enhanced`, between `Basic` and `Verified` in meaning. Write the enum so no stored value changes meaning, and so a check "at least Basic" still works for all four levels.

**Show a solution**

kyc.ts

```ts
enum KycLevel {
  None = 0,
  Basic = 10,
  Enhanced = 15,
  Verified = 20,
}

function canTransfer(level: KycLevel): boolean {
  return level >= KycLevel.Basic;
}

const stored = [0, 10, 20];
console.log(stored.map((value) => `${KycLevel[value]}:${canTransfer(value)}`).join(" "));
console.log(canTransfer(KycLevel.Enhanced));
```

Output of `npx tsx kyc.ts` and of the browser terminal

```ts
None:false Basic:true Verified:true
true
```

Old rows stored 0, 1 and 2, so a real migration first rewrites them to 0, 10 and 20, once, with an explicit mapping. From then on the values are pinned, with gaps, so a level can be inserted between two others without renumbering. Here the order carries meaning, which is the one case where a numeric enum is a good fit.

## Recap

- An enum is a type and a runtime object. `tsc` emits an IIFE that fills the object; numeric members also get reverse mappings (number to name).
- Reverse mappings double `Object.keys` and `Object.values`. Numeric enums accept any `number`, and reordering members changes stored values.
- String enums have readable values but are nominal: `"NGN"` is not accepted as `Currency.Naira`.
- `const enum` is inlined only without `isolatedModules`; with `verbatimModuleSyntax` it compiles like a normal enum and forbids reverse lookups.
- Node's type stripping rejects every enum with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; `erasableSyntaxOnly` makes `tsc` flag it first.
- Literal unions and `as const` objects with `(typeof X)[keyof typeof X]` give names, checks and plain values, with nothing to strip.

Next: [Tuples](https://zudojs.oyinlola.site/learn/ts-tuples), arrays where every position has its own type.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
