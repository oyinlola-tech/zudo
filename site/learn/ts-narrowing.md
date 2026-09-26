---
title: "Narrowing — ZudoJS Academy"
description: "Turn wide unions and unknown into precise types with typeof, equality, in, instanceof, discriminants, type guards and assertion functions, and avoid the traps."
source: https://zudojs.oyinlola.site/learn/ts-narrowing
---

LEVEL 5 · LESSON 10 OF 23

Special types and narrowing Foundation

# Narrowing

Turn wide unions and unknown into precise types with typeof, equality, in, instanceof, discriminants, type guards and assertion functions, and avoid the traps.

- **50 min** to read and try
- **You need:** Special types (any, unknown and never), and Interfaces, unions and literal types
- **You build:** A payment router for a banking app that accepts cards, bank transfers and wallets, with every branch checked by the compiler

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the difference between a declared type and a narrowed type
- Narrow unions with typeof, equality, in, instanceof and Array.isArray
- Avoid the truthiness traps with 0, empty strings and NaN
- Follow how control-flow analysis narrows through returns, assignments and closures
- Write type guards and assertion functions, and test them

## A value that could be two things

Your bank's old mobile app sends transfer amounts as numbers. The new web app sends them as strings, because they come straight from a form field. Your handler has to accept both, so you give the parameter a union type and try to format it:

amount.ts

```ts
function formatAmount(amount: number | string): string {
  return "₦" + amount.toFixed(2);
}
```

What `npx tsc --noEmit` prints

```ts
amount.ts:2:23 - error TS2339: Property 'toFixed' does not exist on type 'string | number'.
  Property 'toFixed' does not exist on type 'string'.

2   return "₦" + amount.toFixed(2);
                        ~~~~~~~


Found 1 error in amount.ts:2
```

The compiler is right. `toFixed` is a number method, and `amount` might be a string. You cannot tell it "it is probably a number". You have to *check*, in plain JavaScript, and TypeScript follows your check:

amount.ts

```ts
function formatAmount(amount: number | string): string {
  if (typeof amount === "string") {
    const parsed = Number(amount);
    return "₦" + parsed.toFixed(2);
  }
  return "₦" + amount.toFixed(2);
}

console.log(formatAmount(1500));
console.log(formatAmount("2500.5"));
```

Output of `npx tsx amount.ts` and of the browser terminal

```ts
₦1500.00
₦2500.50
```

Every variable has a **declared type**: the type written in its annotation, here `number | string`. At each point in the code, TypeScript also tracks a **narrowed type**: what the value can still be, given the checks that ran before that point. Inside the `if`, `amount` is a `string`. After the `if` returns, only `number` is left. Turning a wide type into a more precise one this way is called **narrowing**, and the checks that do it are called **type guards**.

You met narrowing briefly in [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#narrowing) and used `unknown` in [Special types](https://zudojs.oyinlola.site/learn/ts-special-types). This lesson covers every way to narrow, the traps in each, and how to write your own.

## typeof

The JavaScript `typeof` operator returns one of eight strings: `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"symbol"`, `"undefined"`, `"object"` and `"function"`. TypeScript knows which types go with each string, so comparing `typeof x` with one of them narrows `x`:

typeof.ts

```ts
function describe(value: string | number | boolean | (() => string)): string {
  if (typeof value === "string") return `text of length ${value.length}`;
  if (typeof value === "number") return `number ${value.toFixed(1)}`;
  if (typeof value === "function") return `function returning ${value()}`;
  return `boolean ${value ? "yes" : "no"}`;
}

console.log(describe("Ada"));
console.log(describe(42));
console.log(describe(() => "PAID"));
console.log(describe(false));
```

Output of `npx tsx typeof.ts` and of the browser terminal

```ts
text of length 3
number 42.0
function returning PAID
boolean no
```

After three checks and three returns, only `boolean` is left on the last line, so TypeScript lets you use `value` as a boolean without another check.

### The typeof null trap

One JavaScript mistake from 1995 is still with us: `typeof null` is `"object"`. So `typeof x === "object"` does not rule out `null`, and TypeScript knows it:

tags.ts

```ts
function countTags(tags: string | string[] | null): number {
  if (typeof tags === "object") {
    return tags.length;
  }
  return 1;
}
```

What `npx tsc --noEmit` prints

```ts
tags.ts:3:12 - error TS18047: 'tags' is possibly 'null'.

3     return tags.length;
             ~~~~


Found 1 error in tags.ts:3
```

Inside the `if`, `tags` is `string[] | null`, not `string[]`. Rule out `null` as well, or use a check that is more precise than `typeof`:

tags.ts

```ts
function countTags(tags: string | string[] | null): number {
  if (tags === null) return 0;
  if (Array.isArray(tags)) return tags.length;
  return 1;
}

console.log(countTags(null), countTags("urgent"), countTags(["urgent", "vip", "lagos"]));
```

Output of `npx tsx tags.ts` and of the browser terminal

```ts
0 1 3
```

`Array.isArray` narrows too. TypeScript's declaration for it is `isArray(arg: any): arg is any[]`, a type guard exactly like the ones you will write yourself later in this lesson.

## Truthiness narrowing and its traps

An `if (value)` check runs its branch only when the value is **truthy**: anything except the eight **falsy** values `false`, `0`, `-0`, `0n`, `NaN`, `""`, `null` and `undefined`. TypeScript uses this to remove `null` and `undefined` from a type:

nickname.ts

```ts
function greeting(nickname: string | undefined): string {
  if (nickname) {
    return `Welcome back, ${nickname.toUpperCase()}`;
  }
  return "Welcome back";
}

console.log(greeting("Ada"));
console.log(greeting(undefined));
console.log(greeting(""));
```

Output of `npx tsx nickname.ts` and of the browser terminal

```ts
Welcome back, ADA
Welcome back
Welcome back
```

That is fine for a nickname, where an empty string really means "no nickname". Now the same habit on money:

balance.ts

```ts
function balanceLine(balance: number | null): string {
  if (balance) {
    return `Balance: ₦${balance.toLocaleString("en-NG")}`;
  }
  return "Balance not available";
}

console.log(balanceLine(125000));
console.log(balanceLine(null));
console.log(balanceLine(0));
```

Output of `npx tsx balance.ts` and of the browser terminal

```ts
Balance: ₦125,000
Balance not available
Balance not available
```

This compiles, and it is wrong. A customer with exactly ₦0 is told their balance is "not available", because `0` is falsy. TypeScript narrowed correctly: inside the `if`, `balance` is a `number`. But in the `else` path, `balance` is still `number | null`. The compiler never claimed the `else` branch meant `null`; the code's author assumed it.

The fix is to say what you mean. When you want "not null or undefined", compare with `null`:

balance.ts

```ts
function balanceLine(balance: number | null): string {
  if (balance !== null) {
    return `Balance: ₦${balance.toLocaleString("en-NG")}`;
  }
  return "Balance not available";
}

console.log(balanceLine(0));

const limit: number | undefined = 0;
console.log(limit || 50000, limit ?? 50000);
```

Output of `npx tsx balance.ts` and of the browser terminal

```ts
Balance: ₦0
50000 0
```

The same trap hides in `||`. `limit || 50000` replaces *every* falsy value, so a daily limit of 0 (an account that may not transfer anything) silently becomes ₦50,000. `??`, the nullish coalescing operator, only replaces `null` and `undefined`.

> TRUTHINESS ON NUMBERS AND STRINGS
>
> Use `if (value)` only when every falsy value really means "missing": objects, arrays, and strings where `""` is empty. For numbers, amounts, counts, ids and flags, compare with `null` or `undefined` explicitly, and default with `??`.

## Equality narrowing

Comparing with `===`, `!==`, `==` or `!=` narrows both sides. Comparing with a literal keeps only the matching member; comparing two variables keeps only the types they could share:

equality.ts

```ts
type Channel = "sms" | "email" | "push";

function send(channel: Channel, to: string | null, fallback: string | number): string {
  if (to == null) return `${channel}: no recipient`;
  if (channel === "sms") return `sms to ${to.replace(/^0/, "+234")}`;
  if (to === fallback) return `${channel} to ${fallback.toLowerCase()} (same as fallback)`;
  return `${channel} to ${to}`;
}

console.log(send("sms", "08031234567", 0));
console.log(send("email", "ADA@EXAMPLE.COM", "ADA@EXAMPLE.COM"));
console.log(send("push", null, 0));
```

Output of `npx tsx equality.ts` and of the browser terminal

```ts
sms to +2348031234567
email to ada@example.com (same as fallback)
push: no recipient
```

- `to == null` with two equals signs is the one place where loose equality is useful: it is true for both `null` and `undefined`, and TypeScript removes both from the type.
- After `channel === "sms"` returns, `channel` is `"email" | "push"`.
- `to === fallback` can only be true when both are strings, because `to` is a `string` by then. So inside that branch `fallback` is narrowed to `string` too, and `.toLowerCase()` is allowed.

A `switch` is a series of `===` checks, and narrows in exactly the same way in each `case`.

## in and instanceof

### The in operator

`"iban" in account` is true when the object has a property called `iban`. When the union members differ in which properties they have, `in` picks the right member:

in.ts

```ts
interface LocalAccount {
  accountNumber: string;
  bankCode: string;
}

interface ForeignAccount {
  iban: string;
  swift: string;
}

function payee(account: LocalAccount | ForeignAccount): string {
  if ("iban" in account) {
    return `IBAN ${account.iban} via ${account.swift}`;
  }
  return `NUBAN ${account.accountNumber} at bank ${account.bankCode}`;
}

console.log(payee({ accountNumber: "0123456789", bankCode: "058" }));
console.log(payee({ iban: "GB29NWBK60161331926819", swift: "NWBKGB2L" }));
```

Output of `npx tsx in.ts` and of the browser terminal

```ts
NUBAN 0123456789 at bank 058
IBAN GB29NWBK60161331926819 via NWBKGB2L
```

`in` also works on objects whose type does not mention the property at all. After `typeof value === "object" && value !== null && "email" in value`, TypeScript knows `value` has an `email` property of type `unknown`. That is how [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#validator), later in this course, checks request bodies one field at a time.

### instanceof

`x instanceof C` checks whether `C.prototype` is in the value's prototype chain. It narrows to the class type. This is the everyday way to tell errors apart:

instanceof.ts

```ts
class InsufficientFundsError extends Error {
  constructor(readonly shortBy: number) {
    super(`short by ₦${shortBy}`);
  }
}

function explain(error: unknown): string {
  if (error instanceof InsufficientFundsError) return `Top up ₦${error.shortBy} and try again`;
  if (error instanceof Error) return `Transfer failed: ${error.message}`;
  if (error instanceof Date) return `Retry after ${error.toISOString().slice(0, 10)}`;
  return "Transfer failed";
}

console.log(explain(new InsufficientFundsError(2500)));
console.log(explain(new TypeError("amount must be a number")));
console.log(explain(new Date("2026-10-01T00:00:00Z")));
console.log(explain("timeout"));
```

Output of `npx tsx instanceof.ts` and of the browser terminal

```ts
Top up ₦2500 and try again
Transfer failed: amount must be a number
Retry after 2026-10-01
Transfer failed
```

Order matters: `InsufficientFundsError` is also an `Error`, so the more specific check goes first. Two limits to remember: `instanceof` only works with classes, never with interfaces or type aliases, because those do not exist at runtime; and an object that came out of `JSON.parse` is never an instance of your class, even when it has all the right properties.

## Discriminated unions

The most reliable way to narrow objects is a **discriminant**: one property that every member of the union has, with a different literal value in each. A `switch` on it picks the member, and TypeScript checks every property access in every `case`:

payment.ts

```ts
export type Payment =
  | { kind: "card"; amount: number; last4: string }
  | { kind: "transfer"; amount: number; bankCode: string; reference: string }
  | { kind: "wallet"; amount: number; phone: string };

export function receipt(payment: Payment): string {
  switch (payment.kind) {
    case "card":
      return `₦${payment.amount} charged to card ending ${payment.last4}`;
    case "transfer":
      return `₦${payment.amount} sent to bank ${payment.bankCode}, ref ${payment.reference}`;
    case "wallet":
      return `₦${payment.amount} debited from wallet ${payment.phone}`;
  }
}

console.log(receipt({ kind: "card", amount: 5000, last4: "4242" }));
console.log(receipt({ kind: "wallet", amount: 1200, phone: "08031234567" }));
```

Output of `npx tsx payment.ts` and of the browser terminal

```ts
₦5000 charged to card ending 4242
₦1200 debited from wallet 08031234567
```

Notice the function has no final `return`, and `tsc` does not complain. Because the `switch` covers all three kinds, TypeScript knows the end of the function cannot be reached. Add a fourth kind, `"ussd"`, without a `case`, and you get *Function lacks ending return statement*. For a clearer error, end with a `default` that assigns to `never`, the exhaustiveness check from [Basic types](https://zudojs.oyinlola.site/learn/ts-types#void-never).

The discriminant also works after destructuring, as long as the variable you narrow is a `const` (or a parameter that is never reassigned):

destructure.ts

```ts
import type { Payment } from "./payment.js";

function fee(payment: Payment): number {
  const { kind, amount } = payment;
  if (kind === "transfer") {
    return amount > 5000 ? 25 : 10;
  }
  return kind === "card" ? Math.round(amount * 0.015) : 0;
}

console.log(fee({ kind: "transfer", amount: 20000, bankCode: "058", reference: "RENT" }));
console.log(fee({ kind: "card", amount: 5000, last4: "4242" }));
```

Output of `npx tsx destructure.ts` and of the browser terminal

```ts
25
75
```

## Control-flow analysis

TypeScript does not narrow by looking at one `if` at a time. It follows every path through the function: returns, `throw`s, `break`s, assignments and loops. This is called **control-flow analysis**. Four rules explain almost everything you will see.

### 1. Early exits narrow the rest of the block

A `return` or `throw` inside an `if` means the code after it only runs when the check failed. This is why guard clauses work so well in TypeScript:

guard-clauses.ts

```ts
interface Account {
  id: string;
  balance: number;
  frozenReason?: string;
}

function withdraw(account: Account | undefined, amount: number): number {
  if (account === undefined) throw new Error("account not found");
  if (account.frozenReason !== undefined) throw new Error(`frozen: ${account.frozenReason}`);
  if (amount > account.balance) throw new Error("insufficient funds");
  return account.balance - amount;
}

console.log(withdraw({ id: "ACC-1", balance: 10000 }, 2500));
for (const account of [undefined, { id: "ACC-2", balance: 100, frozenReason: "KYC pending" }]) {
  try {
    withdraw(account, 50);
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx guard-clauses.ts` and of the browser terminal

```ts
7500
Error: account not found
Error: frozen: KYC pending
```

### 2. Assignment narrows

Assigning a value narrows a variable to the type of what you assigned, within its declared type:

assign.ts

```ts
let reference: string | number = "TX-001";
console.log(reference.toLowerCase());

reference = 1042;
console.log(reference.toFixed(0).padStart(6, "0"));
```

Output of `npx tsx assign.ts` and of the browser terminal

```ts
tx-001
001042
```

### 3. A condition stored in a const still narrows

You can give a check a name, and the narrowing survives, as long as both the condition and the value are `const` (or parameters that are never reassigned):

aliased.ts

```ts
function label(value: string | number): string {
  const isText = typeof value === "string";
  return isText ? value.toUpperCase() : value.toFixed(2);
}

console.log(label("pending"), label(99.5));
```

Output of `npx tsx aliased.ts` and of the browser terminal

```ts
PENDING 99.50
```

### 4. Narrowing does not survive everything

Narrowing is a promise about *this point in the code*. Two situations break it. First, a callback that runs later, on a variable that is assigned again after the callback is created:

closure.ts

```ts
function scheduleReminder(email: string | undefined): void {
  if (email === undefined) return;
  setTimeout(() => console.log(`remind ${email.toLowerCase()}`), 1000);
  email = undefined;
}
```

What `npx tsc --noEmit` prints

```ts
closure.ts:3:42 - error TS18048: 'email' is possibly 'undefined'.

3   setTimeout(() => console.log(`remind ${email.toLowerCase()}`), 1000);
                                           ~~~~~


Found 1 error in closure.ts:3
```

When the timer fires, `email` really is `undefined`, and the compiler caught it. Remove the last line, or copy the value into a `const` before the callback, and it compiles. The second situation goes the other way: the compiler *keeps* a narrowing that is no longer true. It assumes a function call does not change the properties it has already checked:

stale.ts

```ts
interface Order {
  total: number;
  discount?: number;
}

function removeExpiredDiscount(order: Order): void {
  delete order.discount;
}

const order: Order = { total: 20000, discount: 2000 };
if (order.discount !== undefined) {
  removeExpiredDiscount(order);
  try {
    console.log(order.discount.toFixed(2));
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx stale.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'toFixed')
```

This compiles and crashes. Checking every property again after every call would make almost all real code fail to compile, so TypeScript makes a practical choice and trusts you. The defence is a habit: read the property into a `const` (`const discount = order.discount`), check that, and use it. A `const` cannot change behind your back.

## Custom type guards: value is T

Sometimes the check you need is longer than one operator, or you need it in many places. Put it in a function whose return type is a **type predicate**, `parameterName is Type`. When the function returns `true`, TypeScript narrows the argument to `Type`; when it returns `false`, it removes `Type` from the argument's type:

The examples in this section share the `Payment` union from before, kept in its own file:

types.ts

```ts
export type Payment =
  | { kind: "card"; amount: number; last4: string }
  | { kind: "transfer"; amount: number; bankCode: string; reference: string }
  | { kind: "wallet"; amount: number; phone: string };
```

guards.ts

```ts
import type { Payment } from "./types.js";

type CardPayment = Extract<Payment, { kind: "card" }>;

function isCardPayment(payment: Payment): payment is CardPayment {
  return payment.kind === "card";
}

const payments: Payment[] = [
  { kind: "card", amount: 5000, last4: "4242" },
  { kind: "wallet", amount: 1200, phone: "08031234567" },
  { kind: "card", amount: 800, last4: "1881" },
];

const cards = payments.filter(isCardPayment);
console.log(cards.map((card) => card.last4));

const first = payments[1];
if (first !== undefined && !isCardPayment(first)) {
  console.log(first.kind);
}
```

Output of `npx tsx guards.ts` and of the browser terminal

```json
[ '4242', '1881' ]
wallet
```

`Extract<Payment, { kind: "card" }>` picks the card member out of the union; [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#union-filters), in the Advanced TypeScript course, explains how it works. Passing the guard to `filter` is the classic use: `filter` has an overload that takes a type predicate, so `cards` is `CardPayment[]`, not `Payment[]`, and `card.last4` is allowed. In the `else` direction, `!isCardPayment(first)` leaves `"transfer" | "wallet"` payments.

### Inferred type predicates

Since TypeScript 5.5, a short arrow function that only returns a check is inferred as a type guard, so you often do not need to write the predicate:

inferred.ts

```ts
const amounts = [1500, undefined, 700, undefined, 2500];
const present = amounts.filter((amount) => amount !== undefined);
const total = present.reduce((sum, amount) => sum + amount, 0);
console.log(present.length, total);
```

Output of `npx tsx inferred.ts` and of the browser terminal

```ts
3 4700
```

Before 5.5, `present` was `(number | undefined)[]` and `sum + amount` was an error. Inference only works when the function has no written return type and its body is a check TypeScript can read both ways; write the predicate yourself when the check is longer.

### A guard can lie

TypeScript does not check that the body of a guard matches its predicate. It believes the `true`, and it also believes the `false`. A guard that returns `false` for some values that *are* the type makes the `else` branch lie:

lying-guard.ts

```ts
function isBigAmount(amount: number | string): amount is number {
  return typeof amount === "number" && amount >= 1_000_000;
}

function audit(amount: number | string): string {
  if (isBigAmount(amount)) return `review ₦${amount}`;
  try {
    return `auto-approve ${amount.toUpperCase()}`;
  } catch (error) {
    return String(error);
  }
}

console.log(audit(2_500_000));
console.log(audit("450000"));
console.log(audit(450000));
```

Output of `npx tsx lying-guard.ts` and of the browser terminal

```ts
review ₦2500000
auto-approve 450000
TypeError: amount.toUpperCase is not a function
```

In the `else` path TypeScript removed `number`, so it let `amount.toUpperCase()` through. But ₦450,000 as a number also ends up there. A predicate must mean "is this type", exactly. Checks about the value ("is big", "is active") belong in a plain `boolean` function after narrowing.

## Assertion functions: asserts value is T

A type guard returns a boolean and leaves the `if` to you. An **assertion function** throws when the check fails, and when it returns normally, the narrowing holds for the rest of the scope. There are two forms: `asserts condition` narrows by whatever expression you pass, and `asserts value is T` narrows one argument:

assert.ts

```ts
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIsString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
}

function openAccount(name: unknown, openingDeposit: number | null): string {
  assertIsString(name, "name");
  assert(openingDeposit !== null, "opening deposit is required");
  assert(openingDeposit >= 1000, "opening deposit must be at least ₦1000");
  return `${name.trim()}: ₦${openingDeposit.toFixed(2)}`;
}

console.log(openAccount("  Ada Obi ", 5000));
for (const [name, deposit] of [[42, 5000], ["Grace", null], ["Grace", 500]] as const) {
  try {
    openAccount(name, deposit);
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx assert.ts` and of the browser terminal

```ts
Ada Obi: ₦5000.00
TypeError: name must be a string
Error: opening deposit is required
Error: opening deposit must be at least ₦1000
```

After `assert(openingDeposit !== null, …)`, `openingDeposit` is a `number` on every following line, exactly as if you had written `if (openingDeposit === null) throw …`. Node.js ships the same idea as `assert` from `node:assert`, which is typed `asserts value` too.

One rule surprises everyone the first time. An assertion function must be called through a name whose type is written out. An arrow function stored in a `const` without an annotation does not count:

arrow-assert.ts

```ts
const assertPositive = (amount: number): asserts amount => {
  if (amount <= 0) throw new RangeError("amount must be positive");
};

assertPositive(500);
```

What `npx tsc --noEmit` prints

```ts
arrow-assert.ts:5:1 - error TS2775: Assertions require every name in the call target to be declared with an explicit type annotation.

5 assertPositive(500);
  ~~~~~~~~~~~~~~

  arrow-assert.ts:1:7 - 'assertPositive' needs an explicit type annotation.
    1 const assertPositive = (amount: number): asserts amount => {
            ~~~~~~~~~~~~~~


Found 1 error in arrow-assert.ts:5
```

Control-flow analysis runs before full type inference, so it needs to know from the declaration alone that a call can narrow. Use a `function` declaration, as above, or annotate the `const`: `const assertPositive: (amount: number) => asserts amount = …`.

Guards and assertion functions are also how you check data from outside your program, where the value starts as `unknown`. That boundary work, and why a guard must check every field, is covered in [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#guards).

## Build: a payment router

REASON IT OUT

### Before you write the router

A payments endpoint receives already-parsed payments, some from the old app (amount as a number) and some from the web app (amount as a string). Each must be routed to the card processor, the bank transfer service or the wallet service. Before reading the code, think:

- Which of the checks in this lesson fits each decision: which processor, which amount format, which error?
- What amounts must be refused? Think about `"abc"`, `"0"`, `-500`, `NaN`, and a string with spaces.
- Where would `if (amount)` be a bug?
- A processor can fail with a known error class, a generic `Error`, or something that is not an error at all. How do you report each?

**Show the reasoning**

The processor is chosen by the `kind` discriminant, with a `switch` so a new kind cannot be forgotten. The amount format is a `typeof` check. The amount must be converted and then checked with `Number.isFinite` and `> 0`: `Number("abc")` is `NaN`, which is still of type `number`, so no type check catches it. `if (amount)` would treat `0` as "missing" instead of "invalid", and would accept `"0"`, a non-empty string. Errors are `unknown` in `catch`, so they are narrowed with `instanceof`, most specific class first, with a fallback for anything else.

router.ts

```ts
type Amount = number | string;

type Payment =
  | { kind: "card"; amount: Amount; last4: string }
  | { kind: "transfer"; amount: Amount; bankCode: string }
  | { kind: "wallet"; amount: Amount; phone: string };

class ProcessorDownError extends Error {
  constructor(readonly processor: string) {
    super(`${processor} is unavailable`);
  }
}

function toKobo(amount: Amount): number {
  const naira = typeof amount === "string" ? Number(amount.trim()) : amount;
  if (!Number.isFinite(naira) || naira <= 0) {
    throw new RangeError(`invalid amount: ${JSON.stringify(amount)}`);
  }
  return Math.round(naira * 100);
}

function charge(payment: Payment, kobo: number): string {
  switch (payment.kind) {
    case "card":
      return `card *${payment.last4} charged ${kobo} kobo`;
    case "transfer":
      if (payment.bankCode === "999") throw new ProcessorDownError("NIP gateway");
      return `transfer to bank ${payment.bankCode}: ${kobo} kobo`;
    case "wallet":
      if (!/^0\d{10}$/.test(payment.phone)) throw "wallet rejected the phone number";
      return `wallet ${payment.phone} debited ${kobo} kobo`;
    default: {
      const unhandled: never = payment;
      throw new Error(`unknown payment ${JSON.stringify(unhandled)}`);
    }
  }
}

export function route(payment: Payment): string {
  try {
    return "OK    " + charge(payment, toKobo(payment.amount));
  } catch (error) {
    if (error instanceof ProcessorDownError) return `RETRY ${error.processor}`;
    if (error instanceof RangeError) return `FAIL  ${error.message}`;
    if (error instanceof Error) return `FAIL  unexpected: ${error.message}`;
    return `FAIL  ${String(error)}`;
  }
}

const requests: Payment[] = [
  { kind: "card", amount: 5000, last4: "4242" },
  { kind: "transfer", amount: " 12500.50 ", bankCode: "058" },
  { kind: "wallet", amount: "1200", phone: "08031234567" },
  { kind: "card", amount: "abc", last4: "1881" },
  { kind: "card", amount: 0, last4: "1881" },
  { kind: "transfer", amount: 700, bankCode: "999" },
  { kind: "wallet", amount: 300, phone: "12345" },
];

for (const payment of requests) console.log(route(payment));
```

Output of `npx tsx router.ts` and of the browser terminal

```ts
OK    card *4242 charged 500000 kobo
OK    transfer to bank 058: 1250050 kobo
OK    wallet 08031234567 debited 120000 kobo
FAIL  invalid amount: "abc"
FAIL  invalid amount: 0
RETRY NIP gateway
FAIL  wallet rejected the phone number
```

Every narrowing form from this lesson is here. `typeof` picks the amount format, `Number.isFinite` catches the `NaN` that no type can, the discriminant chooses the processor, `never` guards against a forgotten kind, and `instanceof` sorts the errors. Converting to **kobo** (hundredths of a naira) as a whole number keeps money out of floating-point trouble from here on.

## Testing narrowing code

The compiler proves that each branch uses the value correctly. It cannot prove that your checks *send each value to the right branch*. That is what tests are for, and guards are the easiest code in the world to test: a table of values and the answer you expect for each.

guard.test.ts

```ts
function isNuban(value: unknown): value is string {
  return typeof value === "string" && /^\d{10}$/.test(value);
}

const cases: [unknown, boolean][] = [
  ["0123456789", true],
  ["012345678", false],
  ["01234567890", false],
  ["01234 56789", false],
  [1234567890, false],
  [null, false],
  [undefined, false],
  [["0123456789"], false],
];

let failures = 0;
for (const [input, expected] of cases) {
  const actual = isNuban(input);
  if (actual !== expected) failures++;
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${JSON.stringify(input)} -> ${actual}`);
}
console.log(`${failures} failures`);
```

Output of `npx tsx guard.test.ts` and of the browser terminal

```ts
PASS "0123456789" -> true
PASS "012345678" -> false
PASS "01234567890" -> false
PASS "01234 56789" -> false
PASS 1234567890 -> false
PASS null -> false
PASS undefined -> false
PASS ["0123456789"] -> false
0 failures
```

For a guard, always include the values that are *almost* right (nine digits, eleven digits, a number instead of a string) and the values `typeof` gets wrong (`null`, arrays). In a real project the same table goes into a Vitest `it.each`, which you will meet in [the testing lesson](https://zudojs.oyinlola.site/learn/testing-basics).

## Narrowing in production code

- **Prefer discriminants to property sniffing.** `"iban" in account` works, but a `kind` property is explicit, survives refactoring, and gives you exhaustiveness checks.
- **Narrow once, near the edge.** A function that receives `string | number` should turn it into one type early (like `toKobo`) so the rest of the code has nothing to narrow.
- **Copy before callbacks.** `const email = user.email`, then use `email` in the callback. It removes both closure problems and stale property narrowing.
- **Keep predicates exact.** A predicate means "is this type", nothing else. Keep guards short and test them with a table.
- **Never narrow with `as`.** `payment as CardPayment` compiles without any check. The next lesson explains exactly what `as` does, and when it is acceptable.

## Practice

TRY IT YOURSELF

### Fix the zero-quantity bug

This inventory function says "out of stock" for beans, which is right (0 left), and also for garri, which the shop does not sell at all. Rewrite it so a missing item returns `"unknown item"`, 0 returns `"out of stock"`, and anything else returns `"N in stock"`.

stock.ts

```ts
const stock: Record<string, number | undefined> = { rice: 12, beans: 0 };

function stockLine(item: string): string {
  const quantity = stock[item];
  if (!quantity) return "out of stock";
  return `${quantity} in stock`;
}

console.log(stockLine("rice"), "|", stockLine("beans"), "|", stockLine("garri"));
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`!quantity` is true for both `undefined` ("garri" is not sold) and `0` ("beans" is out of stock). Compare with each explicitly instead: `quantity === undefined` and `quantity === 0`.

HINT 2

Order matters: check `undefined` first and return `"unknown item"`, then check `0` and return `"out of stock"`, then the general case.

SOLUTION

stock.ts

```ts
const stock: Record<string, number | undefined> = { rice: 12, beans: 0 };

function stockLine(item: string): string {
  const quantity = stock[item];
  if (quantity === undefined) return "unknown item";
  if (quantity === 0) return "out of stock";
  return `${quantity} in stock`;
}

console.log(stockLine("rice"), "|", stockLine("beans"), "|", stockLine("garri"));
```

Output of `npx tsx stock.ts` and of the browser terminal

```ts
12 in stock | out of stock | unknown item
```

`!quantity` lumped together two different facts: "not in the list" (`undefined`) and "none left" (`0`). Compare with each value explicitly and each case gets its own branch.

TRY IT YOURSELF

### A guard for a union member

Bookings are `{ status: "confirmed"; seat: string }` or `{ status: "waitlisted"; position: number }`. Write a type guard `isConfirmed` and use it with `filter` to print the seats of the confirmed bookings.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`isConfirmed`'s body is one line: `return booking.status === "confirmed";`. The return type `booking is Confirmed` is what makes `filter` know the result is `Confirmed[]`.

HINT 2

Once `isConfirmed` is correct, `bookings.filter(isConfirmed).map((booking) => booking.seat)` compiles because every remaining booking is a `Confirmed`.

SOLUTION

bookings.ts

```ts
type Confirmed = { status: "confirmed"; seat: string };
type Waitlisted = { status: "waitlisted"; position: number };
type Booking = Confirmed | Waitlisted;

function isConfirmed(booking: Booking): booking is Confirmed {
  return booking.status === "confirmed";
}

const bookings: Booking[] = [
  { status: "confirmed", seat: "12A" },
  { status: "waitlisted", position: 3 },
  { status: "confirmed", seat: "4C" },
];

console.log(bookings.filter(isConfirmed).map((booking) => booking.seat));
```

Output of `npx tsx bookings.ts` and of the browser terminal

```json
[ '12A', '4C' ]
```

The predicate is exact: it returns `true` for every confirmed booking and only for them, so both the `true` and the `false` narrowing are honest. With TypeScript 5.5 or later, `bookings.filter((b) => b.status === "confirmed")` infers the same predicate.

TRY IT YOURSELF

### An assertion for account ids

Write `assertAccountId(value: unknown): asserts value is string` that accepts strings like `"ACC-00042"` (`ACC-` and five digits) and throws a `TypeError` otherwise. Call it on three values and print either the id in lower case or the error.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check both conditions at once: `if (typeof value !== "string" || !/^ACC-\d{5}$/.test(value))`.

HINT 2

When that condition holds, `throw new TypeError(\`not an account id: ${JSON.stringify(value)}\`);`. Otherwise the function just returns, and `value` is narrowed to `string` after the call.

SOLUTION

account-id.ts

```ts
function assertAccountId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^ACC-\d{5}$/.test(value)) {
    throw new TypeError(`not an account id: ${JSON.stringify(value)}`);
  }
}

for (const input of ["ACC-00042", "ACC-42", 42]) {
  try {
    assertAccountId(input);
    console.log(input.toLowerCase());
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx account-id.ts` and of the browser terminal

```ts
acc-00042
TypeError: not an account id: "ACC-42"
TypeError: not an account id: 42
```

After the call, `input` is a `string`, so `toLowerCase` compiles. `JSON.stringify` in the message shows the difference between the string `"42"` and the number `42`.

## Recap

- A variable has a declared type and, at each point in the code, a narrowed type. Checks written in plain JavaScript narrow it.
- `typeof` narrows primitives and functions, but `typeof null` is `"object"`. `Array.isArray`, `in` and `instanceof` narrow objects; `instanceof` needs a class.
- Truthiness removes `null` and `undefined`, but also sends `0`, `""` and `NaN` to the other branch. Compare explicitly for numbers and use `??` for defaults.
- Equality narrows both sides; `== null` covers `null` and `undefined`. A `switch` on a discriminant is the most reliable way to narrow objects.
- Control-flow analysis follows returns, throws and assignments. Narrowing can be lost in callbacks, and can go stale on properties after a function call.
- `value is T` guards and `asserts value is T` functions package checks for reuse. The compiler trusts them in both directions, so keep them exact and test them.

Next: [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions), the one tool that changes a type without any check at all, and when it is still the right choice.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
