---
title: "Union types in depth — ZudoJS Academy"
description: "Model real states with discriminated unions, return typed results instead of throwing, combine shapes with intersections, and avoid common union mistakes."
source: https://zudojs.oyinlola.site/learn/ts-unions
---

LEVEL 5 · LESSON 7 OF 23

Everyday types Foundation

# Union types in depth

Model real states with discriminated unions, return typed results instead of throwing, combine shapes with intersections, and avoid common union mistakes.

- **50 min** to read and try
- **You need:** Interfaces, unions and literal types, and Type inference in depth
- **You build:** A loan-approval workflow where impossible states cannot be written, every state change is a checked function, and failures come back as typed results

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain a union as a set of values and predict which operations it allows
- Replace boolean-and-optional-field soup with a discriminated union
- Write state transition functions that only accept the right state
- Return failures as a typed result union and handle every case
- Make switches exhaustive with never, assertNever or a Record
- Recognise and fix the common union mistakes

## A loan that was approved and rejected

A microfinance app lets customers ask for small loans. The first version describes a loan request with two flags and some optional fields, which is how many real codebases start:

loan-v1.ts

```ts
interface LoanRequest {
  id: number;
  amount: number;
  approved: boolean;
  rejected: boolean;
  approvedBy?: string;
  rejectionReason?: string;
}

function describe(loan: LoanRequest): string {
  if (loan.approved) return `#${loan.id}: approved by ${loan.approvedBy}`;
  if (loan.rejected) return `#${loan.id}: rejected (${loan.rejectionReason})`;
  return `#${loan.id}: waiting for review`;
}

const loans: LoanRequest[] = [
  { id: 1, amount: 50000, approved: true, rejected: false, approvedBy: "Ngozi" },
  { id: 2, amount: 80000, approved: true, rejected: true, rejectionReason: "income too low" },
  { id: 3, amount: 20000, approved: false, rejected: false, approvedBy: "Tunde" },
];

for (const loan of loans) console.log(describe(loan));
```

Output of `npx tsx loan-v1.ts` and of the browser terminal

```ts
#1: approved by Ngozi
#2: approved by undefined
#3: waiting for review
```

This file passes `tsc` with no errors, and it is full of nonsense. Loan 2 is approved *and* rejected, and has no approver. Loan 3 is waiting for review but already has an approver. The type allowed all of it.

Count what the type permits: two booleans give four combinations, and each optional field may be there or not, which doubles it twice more: sixteen shapes. The business has exactly three states: pending, approved, rejected. Thirteen of the sixteen are bugs waiting to happen, and every function that reads a loan has to guess which ones are real. This lesson replaces that with **union types** that allow the three real states and nothing else. You met unions, literal types and discriminated unions in [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#unions); this lesson goes much deeper.

## Types are sets of values

The clearest way to think about a type is as a **set**: the collection of all values that belong to it.

- `string` is the set of every possible string: infinitely many.
- The literal type `"approved"` is a set with exactly one value in it.
- `boolean` is the set with two values, `true` and `false`. TypeScript treats it as the union `true | false` when narrowing.
- A **union** `A | B` is every value that is in `A` *or* in `B`: the two sets put together.
- `never` is the empty set: no value belongs to it. That is why nothing can be assigned to it.

Two rules follow directly, and explain most union errors you will ever see.

**Rule 1: you can only do what is valid for every member.** A value of type `number | string` might be either, so only operations that work on both are allowed without a check:

amount.ts

```ts
function formatAmount(amount: number | string): string {
  return `₦${amount.toFixed(2)}`;
}
```

What `npx tsc --noEmit` prints

```ts
amount.ts:2:21 - error TS2339: Property 'toFixed' does not exist on type 'string | number'.
  Property 'toFixed' does not exist on type 'string'.

2   return `₦${amount.toFixed(2)}`;
                      ~~~~~~~


Found 1 error in amount.ts:2
```

**Rule 2: a member fits the union, but the union does not fit a member.** `"approved"` can go where `"pending" | "approved"` is expected, because it is in the set. A `"pending" | "approved"` cannot go where only `"approved"` is expected, because it might be `"pending"`. To get from the wide type to the narrow one, you check the value, which is **narrowing**:

amount.ts

```ts
function formatAmount(amount: number | string): string {
  const value = typeof amount === "number" ? amount : Number(amount.replace(/,/g, ""));
  return `₦${value.toFixed(2)}`;
}

console.log(formatAmount(2500), formatAmount("12,000"));
```

Output of `npx tsx amount.ts` and of the browser terminal

```ts
₦2500.00 ₦12000.00
```

After `typeof amount === "number"`, the true branch sees `number` and the false branch sees what is left, `string`. [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing) covers every way to do this; this lesson uses the simplest ones.

## Modelling states with a discriminated union

REASON IT OUT

### Before you write the type

You are about to model a loan request properly. Answer these first, without code:

1. Which states can a loan request be in?
2. What data exists in *every* state, and what data exists only in one state?
3. Which moves between states are allowed? Can a rejected loan be approved later?
4. Who may set each piece of data? What should never come from the customer's request?

**Show the reasoning**

1. Three for now: `pending` (waiting for review), `approved` and `rejected`. A fourth, `disbursed` (money sent), comes later in this lesson.
2. Every state has an id, the customer and the amount. Only an approved loan has an approver and an approval date. Only a rejected loan has a reason. So those fields belong to their state, not to the loan in general.
3. Pending can become approved or rejected. Approved can become disbursed. Rejected is final: the customer must apply again. Nothing ever goes back to pending.
4. The customer supplies the amount. The status, the approver and the reason are set by staff through your code, never taken from the request body. Types will help you keep that rule, but only runtime checks can enforce it on incoming data.

Each answer maps straight onto code. One interface per state, each with a `status` property holding a different literal, and a union of the three:

loan.types.ts

```ts
interface LoanBase {
  readonly id: number;
  readonly customer: string;
  readonly amount: number;
}

export interface PendingLoan extends LoanBase {
  readonly status: "pending";
}

export interface ApprovedLoan extends LoanBase {
  readonly status: "approved";
  readonly approvedBy: string;
  readonly approvedOn: string;
}

export interface RejectedLoan extends LoanBase {
  readonly status: "rejected";
  readonly reason: string;
}

export type LoanRequest = PendingLoan | ApprovedLoan | RejectedLoan;
```

This is a **discriminated union** (also called a **tagged union**): a union of object types that all have one property, the **discriminant**, whose type is a different literal in each member. The discriminant must be a literal type (`"pending"`, not `string`), and it must exist in every member.

Now the compiler refuses every nonsense loan from the opening example:

bad.ts

```ts
import type { LoanRequest } from "./loan.types.js";

const approvedNoApprover: LoanRequest = { id: 2, customer: "Bola", amount: 80000, status: "approved" };
const pendingWithApprover: LoanRequest = { id: 3, customer: "Chidi", amount: 20000, status: "pending", approvedBy: "Tunde" };
const unknownStatus: LoanRequest = { id: 4, customer: "Ada", amount: 5000, status: "approvd" };
```

What `npx tsc --noEmit` prints

```ts
bad.ts:3:7 - error TS2322: Type '{ id: number; customer: string; amount: number; status: "approved"; }' is not assignable to type 'LoanRequest'.
  Type '{ id: number; customer: string; amount: number; status: "approved"; }' is missing the following properties from type 'ApprovedLoan': approvedBy, approvedOn

3 const approvedNoApprover: LoanRequest = { id: 2, customer: "Bola", amount: 80000, status: "approved" };
        ~~~~~~~~~~~~~~~~~~

bad.ts:4:104 - error TS2353: Object literal may only specify known properties, and 'approvedBy' does not exist in type 'PendingLoan'.

4 const pendingWithApprover: LoanRequest = { id: 3, customer: "Chidi", amount: 20000, status: "pending", approvedBy: "Tunde" };
                                                                                                         ~~~~~~~~~~

bad.ts:5:76 - error TS2820: Type '"approvd"' is not assignable to type '"approved" | "pending" | "rejected"'. Did you mean '"approved"'?

5 const unknownStatus: LoanRequest = { id: 4, customer: "Ada", amount: 5000, status: "approvd" };
                                                                             ~~~~~~

  loan.types.ts:12:12 - The expected type comes from property 'status' which is declared here on type 'LoanRequest'
    12   readonly status: "approved";
                  ~~~~~~


Found 3 errors in the same file, starting at: bad.ts:3
```

Read the messages: TypeScript used the `status` to pick the member you meant, then checked the rest against that member alone. A missing approver, an approver on a pending loan and a misspelt status are all caught where the object is written.

Reading a loan is now honest, too. After you check the discriminant, only that member's fields are available:

describe.ts

```ts
import type { LoanRequest } from "./loan.types.js";

export function describe(loan: LoanRequest): string {
  switch (loan.status) {
    case "pending":
      return `#${loan.id} ${loan.customer}: ₦${loan.amount} waiting for review`;
    case "approved":
      return `#${loan.id} ${loan.customer}: approved by ${loan.approvedBy} on ${loan.approvedOn}`;
    case "rejected":
      return `#${loan.id} ${loan.customer}: rejected (${loan.reason})`;
  }
}

const loans: LoanRequest[] = [
  { id: 1, customer: "Ada", amount: 50000, status: "approved", approvedBy: "Ngozi", approvedOn: "2026-09-01" },
  { id: 2, customer: "Bola", amount: 80000, status: "rejected", reason: "income too low" },
  { id: 3, customer: "Chidi", amount: 20000, status: "pending" },
];

for (const loan of loans) console.log(describe(loan));
```

Output of `npx tsx describe.ts` and of the browser terminal

```ts
#1 Ada: approved by Ngozi on 2026-09-01
#2 Bola: rejected (income too low)
#3 Chidi: ₦20000 waiting for review
```

Sixteen possible shapes became exactly three. Each function that reads a loan no longer guesses; it asks the discriminant and the compiler tells it what it has.

## State changes as checked functions

A union describes which states exist. The allowed *moves* between states can be typed too. Write one function per move, and make its parameter the one state it may start from:

transitions.ts

```ts
import type { ApprovedLoan, PendingLoan, RejectedLoan } from "./loan.types.js";

export function approve(loan: PendingLoan, officer: string, today: string): ApprovedLoan {
  return { id: loan.id, customer: loan.customer, amount: loan.amount, status: "approved", approvedBy: officer, approvedOn: today };
}

export function reject(loan: PendingLoan, reason: string): RejectedLoan {
  return { id: loan.id, customer: loan.customer, amount: loan.amount, status: "rejected", reason };
}

const request: PendingLoan = { id: 7, customer: "Emeka", amount: 35000, status: "pending" };
const approved = approve(request, "Ngozi", "2026-09-24");
console.log(approved.status, approved.approvedBy);
```

Output of `npx tsx transitions.ts` and of the browser terminal

```ts
approved Ngozi
```

`approve` takes a `PendingLoan` and returns an `ApprovedLoan`. Try to approve a loan that was already rejected, or reject it twice:

wrong-move.ts

```ts
import type { LoanRequest } from "./loan.types.js";
import { approve, reject } from "./transitions.js";

function review(loan: LoanRequest) {
  const rejected = reject(loan, "missing documents");
  return approve(rejected, "Ngozi", "2026-09-24");
}
```

What `npx tsc --noEmit` prints

```ts
wrong-move.ts:5:27 - error TS2345: Argument of type 'LoanRequest' is not assignable to parameter of type 'PendingLoan'.
  Type 'ApprovedLoan' is not assignable to type 'PendingLoan'.
    Types of property 'status' are incompatible.
      Type '"approved"' is not assignable to type '"pending"'.

5   const rejected = reject(loan, "missing documents");
                            ~~~~

wrong-move.ts:6:18 - error TS2345: Argument of type 'RejectedLoan' is not assignable to parameter of type 'PendingLoan'.
  Types of property 'status' are incompatible.
    Type '"rejected"' is not assignable to type '"pending"'.

6   return approve(rejected, "Ngozi", "2026-09-24");
                   ~~~~~~~~


Found 2 errors in the same file, starting at: wrong-move.ts:5
```

Two illegal moves, two errors. The first says a general `LoanRequest` might not be pending, so you must check its status before rejecting. The second says a rejected loan can never be approved. Your business rules from the reasoning step are now part of the types. This pattern is sometimes called a **type-level state machine**: a state machine is a set of states plus the allowed moves between them, and here the compiler checks both.

> NOTE
>
> The transition functions build a *new* object instead of changing `loan.status`. Every property is `readonly`, so they have to. Changing the status in place would leave the object half in one state and half in another: a pending loan with `status: "approved"` but no approver.

## Exhaustive checks, three ways

An **exhaustive** check is code that handles every member of a union, where the compiler complains if a member is added and not handled. You saw the `never` trick in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#void-never). The business now adds a fourth state: `disbursed`, when the money has been sent. Here are three ways to make sure no function forgets it.

### 1. A return type and no default

`describe` above has no `default`. TypeScript sees that the three cases each return, so the function can never reach its end. Add a member, and the end becomes reachable:

loan4.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number; approvedBy: string }
  | { status: "rejected"; amount: number; reason: string }
  | { status: "disbursed"; amount: number; reference: string };

function describe(loan: Loan): string {
  switch (loan.status) {
    case "pending":
      return `₦${loan.amount} waiting`;
    case "approved":
      return `approved by ${loan.approvedBy}`;
    case "rejected":
      return `rejected: ${loan.reason}`;
  }
}
```

What `npx tsc --noEmit` prints

```ts
loan4.ts:7:32 - error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

7 function describe(loan: Loan): string {
                                 ~~~~~~


Found 1 error in loan4.ts:7
```

It works, but the error points at the return type, not at the missing case, and it only works when every case returns.

### 2. An assertNever helper

A small function whose parameter is `never` makes the intent obvious, points at the right line, and also fails loudly at runtime if bad data ever gets through (for example a status from the database that your code does not know yet):

never.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number; approvedBy: string }
  | { status: "rejected"; amount: number; reason: string }
  | { status: "disbursed"; amount: number; reference: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

function fee(loan: Loan): number {
  switch (loan.status) {
    case "pending":
    case "rejected":
      return 0;
    case "approved":
      return Math.round(loan.amount * 0.01);
    default:
      return assertNever(loan);
  }
}
```

What `npx tsc --noEmit` prints

```ts
never.ts:19:26 - error TS2345: Argument of type '{ status: "disbursed"; amount: number; reference: string; }' is not assignable to parameter of type 'never'.

19       return assertNever(loan);
                            ~~~~


Found 1 error in never.ts:19
```

The error names the exact member that was forgotten, `"disbursed"`, on the line of the `default`. Here is the fixed version, with the runtime safety net shown working on a value that bypassed the types:

never.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number; approvedBy: string }
  | { status: "rejected"; amount: number; reason: string }
  | { status: "disbursed"; amount: number; reference: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

function fee(loan: Loan): number {
  switch (loan.status) {
    case "pending":
    case "rejected":
      return 0;
    case "approved":
    case "disbursed":
      return Math.round(loan.amount * 0.01);
    default:
      return assertNever(loan);
  }
}

console.log(fee({ status: "approved", amount: 50000, approvedBy: "Ngozi" }));
console.log(fee({ status: "disbursed", amount: 80000, reference: "TRF-1188" }));

const fromOldDatabase = JSON.parse('{"status": "on-hold", "amount": 1000}');
try {
  fee(fromOldDatabase);
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx never.ts` and of the browser terminal

```ts
500
800
Error: Unhandled value: {"status":"on-hold","amount":1000}
```

`JSON.parse` returns `any`, so the `"on-hold"` loan slipped past the compiler, exactly the kind of outside data that [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#gap) warns about. The helper turned a silent wrong answer into a clear error.

### 3. A Record lookup

When each member just maps to a value, a `Record` keyed by the union is shorter than a `switch` and just as exhaustive: every key is required.

labels.ts

```ts
type LoanStatus = "pending" | "approved" | "rejected" | "disbursed";

const badgeColour: Record<LoanStatus, string> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};
```

What `npx tsc --noEmit` prints

```ts
labels.ts:3:7 - error TS2741: Property 'disbursed' is missing in type '{ pending: string; approved: string; rejected: string; }' but required in type 'Record<LoanStatus, string>'.

3 const badgeColour: Record<LoanStatus, string> = {
        ~~~~~~~~~~~


Found 1 error in labels.ts:3
```

| Technique | Best for | Runtime safety net |
| --- | --- | --- |
| Return type, no `default` | Short switches where every case returns | No |
| `assertNever` in `default` | Any switch, especially over data from outside | Yes, it throws |
| `Record<Union, Value>` | Mapping each member to a value (labels, colours, handlers) | No, a missing key reads as `undefined` |

## Results instead of exceptions

A transfer can fail in several expected ways: not enough money, over the daily limit, a frozen account. If the function `throw`s, nothing in its type says so. The caller has to remember to use `try`, and `catch` gives them an `unknown` error to guess about. A union makes failure part of the return type:

transfer.ts

```ts
interface Account {
  id: string;
  balance: number;
  frozen: boolean;
}

type TransferError =
  | { code: "insufficient-funds"; balance: number; requested: number }
  | { code: "over-daily-limit"; limit: number }
  | { code: "account-frozen" };

type TransferResult =
  | { ok: true; newBalance: number; reference: string }
  | { ok: false; error: TransferError };

const DAILY_LIMIT = 200000;

function transfer(from: Account, amount: number, reference: string): TransferResult {
  if (from.frozen) return { ok: false, error: { code: "account-frozen" } };
  if (amount > DAILY_LIMIT) return { ok: false, error: { code: "over-daily-limit", limit: DAILY_LIMIT } };
  if (amount > from.balance) {
    return { ok: false, error: { code: "insufficient-funds", balance: from.balance, requested: amount } };
  }
  return { ok: true, newBalance: from.balance - amount, reference };
}

function message(error: TransferError): string {
  switch (error.code) {
    case "insufficient-funds":
      return `You have ₦${error.balance}, but tried to send ₦${error.requested}.`;
    case "over-daily-limit":
      return `Transfers are limited to ₦${error.limit} per day.`;
    case "account-frozen":
      return "This account is frozen. Please contact support.";
  }
}

const ada: Account = { id: "ACC-1", balance: 30000, frozen: false };
for (const amount of [12000, 45000, 250000]) {
  const result = transfer(ada, amount, `TRF-${amount}`);
  console.log(result.ok ? `sent, balance now ₦${result.newBalance} (${result.reference})` : message(result.error));
}
```

Output of `npx tsx transfer.ts` and of the browser terminal

```ts
sent, balance now ₦18000 (TRF-12000)
You have ₦30000, but tried to send ₦45000.
Transfers are limited to ₦200000 per day.
```

Two unions work together here. `TransferResult` is discriminated by `ok` (the literal types `true` and `false`), and `TransferError` by `code`. Each error carries exactly the data needed to explain it: the insufficient-funds case has the balance, the limit case has the limit. Because `message` is exhaustive over `code`, adding a fourth error kind makes the compiler list every place that must explain it to the customer.

Use exceptions for things the caller cannot reasonably handle (the database is down, a bug), and result unions for outcomes that are part of the business: a declined transfer is not a crash. [Generics](https://zudojs.oyinlola.site/learn/ts-generics#result) turns this into one reusable `Result<T, E>` type, and [Typed error handling](https://zudojs.oyinlola.site/learn/ts-errors) builds a whole error system on it.

## Intersections in depth

An **intersection** `A & B` is the other set operation: values that are in `A` *and* in `B`. For object types that means an object with all the properties of both, which is why [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#extending) used it to add timestamps to a user.

### Intersecting with a union

Intersection spreads over each member of a union, like multiplication over addition: `(A | B) & C` is the same as `(A & C) | (B & C)`. That lets you add shared fields to every state at once, and keep the union discriminated:

audited.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number; approvedBy: string };

type Audit = { createdAt: string; createdBy: string };

type AuditedLoan = Loan & Audit;

function trail(loan: AuditedLoan): string {
  const who = loan.status === "approved" ? `, approved by ${loan.approvedBy}` : "";
  return `created ${loan.createdAt} by ${loan.createdBy}${who}`;
}

console.log(trail({ status: "pending", amount: 9000, createdAt: "2026-09-20", createdBy: "app" }));
console.log(trail({ status: "approved", amount: 9000, approvedBy: "Ngozi", createdAt: "2026-09-20", createdBy: "app" }));
```

Output of `npx tsx audited.ts` and of the browser terminal

```ts
created 2026-09-20 by app
created 2026-09-20 by app, approved by Ngozi
```

### When an intersection is empty

Because an intersection keeps only the values in *both* sets, two types that share no values intersect to `never`. `string & number` is `never`. For objects, the clash happens property by property:

clash.ts

```ts
type WithNumericId = { id: number; amount: number };
type WithTextId = { id: string };

const record: WithNumericId & WithTextId = { id: 7, amount: 5000 };
```

What `npx tsc --noEmit` prints

```ts
clash.ts:4:46 - error TS2322: Type 'number' is not assignable to type 'never'.

4 const record: WithNumericId & WithTextId = { id: 7, amount: 5000 };
                                               ~~

  clash.ts:1:24 - The expected type comes from property 'id' which is declared here on type 'WithNumericId & WithTextId'
    1 type WithNumericId = { id: number; amount: number };
                             ~~


Found 1 error in clash.ts:4
```

`id` must be a number and a string at the same time, so its type is `never` and no value fits. When two object types disagree on a discriminant, such as `{ status: "pending" } & { status: "approved" }`, TypeScript reduces the whole object type to `never`. If you ever see `never` where you expected an object, look for two intersected types that disagree.

Interfaces offer `extends` for the same job, and it reports such a clash where the interface is declared instead of where a value is written. [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces), next, compares the two properly.

## Common union mistakes

### 1. Checking a field that only one member has

With the old boolean model, `if (loan.approvedBy)` was how you checked approval. With a union, that property only exists on one member, so you cannot even read it until you have narrowed:

field-check.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number; approvedBy: string };

function approver(loan: Loan): string {
  if (loan.approvedBy) return loan.approvedBy;
  return "nobody yet";
}
```

What `npx tsc --noEmit` prints

```ts
field-check.ts:6:12 - error TS2339: Property 'approvedBy' does not exist on type 'Loan'.
  Property 'approvedBy' does not exist on type '{ status: "pending"; amount: number; }'.

6   if (loan.approvedBy) return loan.approvedBy;
             ~~~~~~~~~~

field-check.ts:6:36 - error TS2339: Property 'approvedBy' does not exist on type 'Loan'.
  Property 'approvedBy' does not exist on type '{ status: "pending"; amount: number; }'.

6   if (loan.approvedBy) return loan.approvedBy;
                                     ~~~~~~~~~~


Found 2 errors in the same file, starting at: field-check.ts:6
```

Check the discriminant, `loan.status === "approved"`, which is exactly what it is for. (`"approvedBy" in loan` would also narrow, but the discriminant says what you mean.)

### 2. Adding string to a literal union

Someone wants to allow "other" statuses, and writes `| string`. Every literal is already a string, so the union collapses to plain `string`, and every check disappears:

collapse.ts

```ts
type Status = "pending" | "approved" | "rejected" | string;

const typo: Status = "aproved";
const probe: never = typo;
```

What `npx tsc --noEmit` prints

```ts
collapse.ts:4:7 - error TS2322: Type 'string' is not assignable to type 'never'.

4 const probe: never = typo;
        ~~~~~


Found 1 error in collapse.ts:4
```

Only the probe complains, and it shows the type is now just `string`: `"aproved"` compiled. If you really need open-ended values, model them as their own member: `{ status: "other"; label: string }`.

### 3. An else branch that swallows new members

An `if`/`else` chain is not exhaustive. The final `else` quietly takes every member you did not name, including ones added later:

else.ts

```ts
type LoanStatus = "pending" | "approved" | "rejected" | "cancelled";

function canReapply(status: LoanStatus): boolean {
  if (status === "pending") return false;
  else if (status === "approved") return false;
  else return true;
}

console.log("rejected:", canReapply("rejected"));
console.log("cancelled:", canReapply("cancelled"));
```

Output of `npx tsx else.ts` and of the browser terminal

```ts
rejected: true
cancelled: true
```

When `"cancelled"` was added, it compiled without a word, and landed in the `else` that was written for rejected loans. Maybe that is right; maybe a cancelled loan should be reapplied through a different form. Nobody decided. With a `switch` and `assertNever`, the compiler would have forced that decision.

### 4. A discriminant that widened

Build a union member in a separate variable, and its discriminant widens to `string`, as you learned in [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#widening). The fix is the same: annotate the variable with the member type or the union.

### 5. Changing the discriminant in place

Writing `loan.status = "approved"` on a pending loan gives you an "approved" loan with no approver. Mark discriminants `readonly` (as `loan.types.ts` does) and move between states with functions that build a complete new object.

## Build: the loan workflow

Put the pieces together. The types, with the fourth state added:

types.ts

```ts
interface Base {
  readonly id: number;
  readonly customer: string;
  readonly amount: number;
}

export type Loan =
  | (Base & { readonly status: "pending" })
  | (Base & { readonly status: "approved"; readonly approvedBy: string })
  | (Base & { readonly status: "rejected"; readonly reason: string })
  | (Base & { readonly status: "disbursed"; readonly approvedBy: string; readonly reference: string });

export type Pending = Extract<Loan, { status: "pending" }>;
export type Approved = Extract<Loan, { status: "approved" }>;

export type ReviewError =
  | { code: "not-pending"; status: Loan["status"] }
  | { code: "over-officer-limit"; limit: number };

export type ReviewResult = { ok: true; loan: Loan } | { ok: false; error: ReviewError };

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
```

Two new tools appear here. `Extract<Loan, { status: "pending" }>` picks the members of a union that fit a shape, so `Pending` is the pending member without repeating it ([Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#union-filters), in the Advanced TypeScript course, explains how it works). `Loan["status"]` reads the type of a property: here, the union of all four statuses ([Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#indexed-access) covers this indexed access). Now the workflow:

workflow.ts

```ts
import { assertNever, type Approved, type Loan, type Pending, type ReviewResult } from "./types.js";

const OFFICER_LIMIT = 100000;

export function review(loan: Loan, officer: string, decision: "approve" | "reject", reason = ""): ReviewResult {
  if (loan.status !== "pending") return { ok: false, error: { code: "not-pending", status: loan.status } };
  if (decision === "reject") return { ok: true, loan: { ...base(loan), status: "rejected", reason } };
  if (loan.amount > OFFICER_LIMIT) return { ok: false, error: { code: "over-officer-limit", limit: OFFICER_LIMIT } };
  return { ok: true, loan: { ...base(loan), status: "approved", approvedBy: officer } };
}

export function disburse(loan: Approved, reference: string): Loan {
  return { ...base(loan), status: "disbursed", approvedBy: loan.approvedBy, reference };
}

function base(loan: Pending | Approved) {
  return { id: loan.id, customer: loan.customer, amount: loan.amount };
}

export function describe(loan: Loan): string {
  switch (loan.status) {
    case "pending":
      return `#${loan.id} ${loan.customer} ₦${loan.amount}: pending`;
    case "approved":
      return `#${loan.id} ${loan.customer} ₦${loan.amount}: approved by ${loan.approvedBy}`;
    case "rejected":
      return `#${loan.id} ${loan.customer} ₦${loan.amount}: rejected (${loan.reason})`;
    case "disbursed":
      return `#${loan.id} ${loan.customer} ₦${loan.amount}: paid out, ref ${loan.reference}`;
    default:
      return assertNever(loan);
  }
}
```

And a run through the whole flow, including the failures:

main.ts

```ts
import type { Loan } from "./types.js";
import { describe, disburse, review } from "./workflow.js";

const small: Loan = { id: 1, customer: "Ada", amount: 45000, status: "pending" };
const large: Loan = { id: 2, customer: "Bola", amount: 250000, status: "pending" };

const first = review(small, "Ngozi", "approve");
if (first.ok) {
  console.log(describe(first.loan));
  if (first.loan.status === "approved") console.log(describe(disburse(first.loan, "TRF-5521")));

  const again = review(first.loan, "Tunde", "reject", "changed my mind");
  if (!again.ok) console.log("second review refused:", again.error);
}

const second = review(large, "Ngozi", "approve");
console.log(second.ok ? describe(second.loan) : second.error);

const declined = review(large, "Ngozi", "reject", "income too low");
if (declined.ok) console.log(describe(declined.loan));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
#1 Ada ₦45000: approved by Ngozi
#1 Ada ₦45000: paid out, ref TRF-5521
second review refused: { code: 'not-pending', status: 'approved' }
{ code: 'over-officer-limit', limit: 100000 }
#2 Bola ₦250000: rejected (income too low)
```

Notice what the types enforce: `disburse` only accepts an approved loan, so `main.ts` has to check `status === "approved"` first. `review` may be called with any loan, because a reviewer might click on anything, so it checks at runtime and returns a typed error instead. Both styles are useful: typed parameters where the caller already knows the state, result unions where the state comes from data.

## Testing union code

Union code has a natural test plan: **one test per member, plus one per transition, plus one per error**. A table of cases keeps it short:

fee.test.ts

```ts
type Loan =
  | { status: "pending"; amount: number }
  | { status: "approved"; amount: number }
  | { status: "rejected"; amount: number; reason: string };

function fee(loan: Loan): number {
  switch (loan.status) {
    case "pending":
    case "rejected":
      return 0;
    case "approved":
      return Math.round(loan.amount * 0.01);
  }
}

const cases: [label: string, loan: Loan, expected: number][] = [
  ["pending pays nothing", { status: "pending", amount: 50000 }, 0],
  ["approved pays 1%", { status: "approved", amount: 50000 }, 500],
  ["approved rounds", { status: "approved", amount: 12345 }, 123],
  ["rejected pays nothing", { status: "rejected", amount: 50000, reason: "no income" }, 0],
];

for (const [label, loan, expected] of cases) {
  const actual = fee(loan);
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label}: ${actual}`);
}
```

Output of `npx tsx fee.test.ts` and of the browser terminal

```ts
PASS pending pays nothing: 0
PASS approved pays 1%: 500
PASS approved rounds: 123
PASS rejected pays nothing: 0
```

The type `Loan` also makes the test data honest: you cannot write a test case for a state that cannot exist. For the rules that must stay illegal, add type tests with `// @ts-expect-error` (from [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#testing)), for example that an approved loan without an approver does not compile. With Vitest, the test runner you will use in [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics), the same table becomes `it.each(cases)`.

## In production

- **Discriminated unions travel well as JSON.** The discriminant is an ordinary property, so an API can return `{ "status": "rejected", "reason": "…" }` and a TypeScript client can switch on it.
- **Incoming unions must be checked at runtime.** A request body claiming `"status": "approved"` proves nothing. Validate the discriminant first, then the fields of that member ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)), and never let a client set a status your staff should set.
- **Databases store unions as a status column plus nullable columns.** Convert each row into the right member in one function, and add a database `CHECK` constraint so an approved row must have an approver ([Modelling data for a shop](https://zudojs.oyinlola.site/learn/db-modeling), in the database course, writes constraints like this).
- **Adding a member is a breaking change** for every exhaustive switch, including in other teams' clients. That is the point: it forces a decision everywhere. Announce it like any API change.
- **Pick one discriminant name per codebase** (`status` for lifecycles, `kind` or `code` for categories) so readers know where to look.

## Practice

TRY IT YOURSELF

### Add a cancelled state

Customers may cancel a loan while it is pending. Add a `cancelled` member with a `cancelledOn` date, a `cancel(loan)` transition that only accepts pending loans, and handle it in an exhaustive `describe`.

**Show a solution**

cancel.ts

```ts
type Loan =
  | { readonly status: "pending"; readonly id: number }
  | { readonly status: "approved"; readonly id: number; readonly approvedBy: string }
  | { readonly status: "cancelled"; readonly id: number; readonly cancelledOn: string };

type Pending = Extract<Loan, { status: "pending" }>;
type Cancelled = Extract<Loan, { status: "cancelled" }>;

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

function cancel(loan: Pending, today: string): Cancelled {
  return { status: "cancelled", id: loan.id, cancelledOn: today };
}

function describe(loan: Loan): string {
  switch (loan.status) {
    case "pending":
      return `#${loan.id} pending`;
    case "approved":
      return `#${loan.id} approved by ${loan.approvedBy}`;
    case "cancelled":
      return `#${loan.id} cancelled on ${loan.cancelledOn}`;
    default:
      return assertNever(loan);
  }
}

const loan: Pending = { status: "pending", id: 9 };
console.log(describe(loan));
console.log(describe(cancel(loan, "2026-09-24")));
```

Output of `npx tsx cancel.ts` and of the browser terminal

```ts
#9 pending
#9 cancelled on 2026-09-24
```

Because `cancel` takes a `Pending`, cancelling an approved loan does not compile. Before adding the case, the `default` branch reported `"cancelled"` as unhandled.

TRY IT YOURSELF

### Card payment results

A card payment can succeed (with an authorisation code), be declined by the bank (with a decline reason: `"insufficient-funds"`, `"expired-card"` or `"suspected-fraud"`), or need a one-time password first. Model `PaymentResult` as a discriminated union and write `nextStep(result)`, using a `Record` for the decline messages.

**Show a solution**

payment.ts

```ts
type DeclineReason = "insufficient-funds" | "expired-card" | "suspected-fraud";

type PaymentResult =
  | { kind: "success"; authCode: string }
  | { kind: "declined"; reason: DeclineReason }
  | { kind: "otp-required"; sentTo: string };

const declineMessage: Record<DeclineReason, string> = {
  "insufficient-funds": "Your bank declined the payment: not enough funds.",
  "expired-card": "This card has expired. Please use another card.",
  "suspected-fraud": "Your bank blocked this payment. Please call them.",
};

function nextStep(result: PaymentResult): string {
  switch (result.kind) {
    case "success":
      return `Paid (auth ${result.authCode}).`;
    case "declined":
      return declineMessage[result.reason];
    case "otp-required":
      return `Enter the code sent to ${result.sentTo}.`;
  }
}

console.log(nextStep({ kind: "success", authCode: "A81F2" }));
console.log(nextStep({ kind: "declined", reason: "expired-card" }));
console.log(nextStep({ kind: "otp-required", sentTo: "080****5521" }));
```

Output of `npx tsx payment.ts` and of the browser terminal

```ts
Paid (auth A81F2).
This card has expired. Please use another card.
Enter the code sent to 080****5521.
```

Two unions again: one for the outcome, one for the reason. The `Record` guarantees a message for every reason, and the `switch` is exhaustive because every case returns and the return type is `string`.

TRY IT YOURSELF

### Fix the booking type

A hotel booking is typed like this. List what is wrong, then rewrite it as a discriminated union with the states `held` (expires at a time), `confirmed` (paid, with a payment reference) and `checked-in` (with a room number).

```ts
interface Booking {
  id: number;
  status: string;
  paid?: boolean;
  paymentRef?: string;
  holdExpiresAt?: string;
  room?: number;
}
```

**Show a solution**

What is wrong: `status: string` allows any text and gives no narrowing; `paid` duplicates the status (a confirmed booking with `paid: false`?); and each optional field belongs to one state, but the type allows any mix, such as a room number on a held booking.

booking.ts

```ts
type Booking =
  | { status: "held"; id: number; holdExpiresAt: string }
  | { status: "confirmed"; id: number; paymentRef: string }
  | { status: "checked-in"; id: number; paymentRef: string; room: number };

function summary(booking: Booking): string {
  switch (booking.status) {
    case "held":
      return `#${booking.id} held until ${booking.holdExpiresAt}`;
    case "confirmed":
      return `#${booking.id} confirmed, paid (${booking.paymentRef})`;
    case "checked-in":
      return `#${booking.id} in room ${booking.room}`;
  }
}

const bookings: Booking[] = [
  { status: "held", id: 1, holdExpiresAt: "18:00" },
  { status: "checked-in", id: 2, paymentRef: "PAY-771", room: 304 },
];
for (const b of bookings) console.log(summary(b));
```

Output of `npx tsx booking.ts` and of the browser terminal

```ts
#1 held until 18:00
#2 in room 304
```

The `paid` flag disappeared: "paid" is simply what `confirmed` and `checked-in` mean. When a boolean can be derived from the state, it should not be stored next to it.

## Recap

- A type is a set of values. A union is the set of values in any member; you may only use what every member supports until you narrow.
- Booleans plus optional fields allow far more shapes than your business has. A discriminated union, one member per state with a literal discriminant, allows exactly the real ones.
- Type each state change as a function from one member to another, and build new objects instead of changing the discriminant.
- Make switches exhaustive with a return type, an `assertNever` default (which also protects at runtime), or a `Record` keyed by the union.
- Return expected failures as a result union with typed error codes; keep exceptions for the unexpected.
- An intersection keeps what is in both types; it spreads over unions, and conflicting properties become `never`.
- Watch for: reading fields before narrowing, `| string` collapsing a literal union, `else` branches swallowing new members, widened discriminants, and in-place status changes.

Next: [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces), the two ways to name these types, and the real differences between them.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
