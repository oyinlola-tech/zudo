---
title: "Type aliases and interfaces — ZudoJS Academy"
description: "Name your domain types once, extend them safely, use declaration merging and recursive types, and learn the real differences between type and interface."
source: https://zudojs.oyinlola.site/learn/ts-aliases-interfaces
---

LEVEL 5 · LESSON 8 OF 23

Everyday types Foundation

# Type aliases and interfaces

Name your domain types once, extend them safely, use declaration merging and recursive types, and learn the real differences between type and interface.

- **45 min** to read and try
- **You need:** Union types in depth
- **You build:** A shared banking-domain types module with money, accounts, a recursive chart of accounts and a plugin that extends a type from another file

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Give recurring shapes one name, and explain why aliases do not create new types
- Extend interfaces and aliases, and predict how each reports a conflict
- Explain declaration merging, avoid it by accident and use it for module augmentation
- Write recursive types for trees and walk them with recursive functions
- List the real differences between type and interface and choose between them

## The same shape in five places

A payments module started with amounts in naira only. Each function wrote the shape it needed inline, right in its signature:

payments.ts

```ts
function format(money: { amount: number }): string {
  return `₦${money.amount.toLocaleString("en-NG")}`;
}

function total(items: { amount: number }[]): { amount: number } {
  return { amount: items.reduce((sum, m) => sum + m.amount, 0) };
}

const basket = [
  { amount: 25000, currency: "NGN" },
  { amount: 40, currency: "USD" },
];

console.log(format(total(basket)));
```

Output of `npx tsx payments.ts` and of the browser terminal

```ts
₦25,040
```

Later, the app started accepting dollars, and someone added `currency` to the objects. Everything still compiles, and the result is wrong: ₦25,000 plus $40 is not ₦25,040. The functions never heard about currencies, because each one had its own private idea of what money looks like. Nothing connected them.

Now give the shape one name, and use that name everywhere:

money.ts

```ts
interface Money {
  amount: number;
  currency: "NGN" | "USD";
}

function format(money: Money): string {
  return `${money.currency} ${money.amount.toLocaleString("en-NG")}`;
}

function total(items: Money[]): Money {
  return { amount: items.reduce((sum, m) => sum + m.amount, 0) };
}
```

What `npx tsc --noEmit` prints

```ts
money.ts:11:3 - error TS2741: Property 'currency' is missing in type '{ amount: number; }' but required in type 'Money'.

11   return { amount: items.reduce((sum, m) => sum + m.amount, 0) };
     ~~~~~~

  money.ts:3:3 - 'currency' is declared here.
    3   currency: "NGN" | "USD";
        ~~~~~~~~


Found 1 error in money.ts:11
```

The moment `currency` joined `Money`, the compiler found the one function that was building money without it, and forced someone to decide what the total of mixed currencies means. A named type is a single place where a concept is defined, so a change to the concept reaches every function that uses it. This lesson is about the two ways to create those names, `type` and `interface`, which you first met in [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#interface-vs-type), and about what really separates them.

## Type aliases: names, not new types

A **type alias** gives a name to any type: an object shape, a union, a tuple, a function type, even a primitive.

aliases.ts

```ts
type Currency = "NGN" | "USD" | "GBP";
type AccountId = string;
type Money = { amount: number; currency: Currency };
type FxRate = [from: Currency, to: Currency, rate: number];
type Converter = (money: Money, to: Currency) => Money;

const rates: FxRate[] = [["USD", "NGN", 1550], ["GBP", "NGN", 2050]];

const convert: Converter = (money, to) => {
  if (money.currency === to) return money;
  const rate = rates.find(([from, target]) => from === money.currency && target === to);
  if (rate === undefined) throw new Error(`No rate from ${money.currency} to ${to}`);
  return { amount: Math.round(money.amount * rate[2]), currency: to };
};

const owner: AccountId = "ACC-1001";
console.log(owner, convert({ amount: 40, currency: "USD" }, "NGN"));
```

Output of `npx tsx aliases.ts` and of the browser terminal

```ts
ACC-1001 { amount: 62000, currency: 'NGN' }
```

An alias is only a *name*. It does not create a new, separate type: everywhere you write `AccountId`, the compiler sees `string`. That matters when two aliases share the same underlying type:

units.ts

```ts
type Naira = number;
type Kobo = number;

function chargeFee(balance: Naira, fee: Naira): Naira {
  return balance - fee;
}

const feeInKobo: Kobo = 5000;
console.log(chargeFee(20000, feeInKobo));
```

Output of `npx tsx units.ts` and of the browser terminal

```ts
15000
```

The fee was ₦50, stored in kobo as 5000. It was charged as ₦5,000, and the compiler did not blink, because `Naira` and `Kobo` are both just `number`. Aliases document intent; they do not enforce it. Making types like these truly distinct is possible with **branded types**, covered in [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types), in the Advanced TypeScript course. Until then, the reliable fix is one unit everywhere (kobo, as whole numbers), and names that say it: `feeKobo`.

## Interfaces and extension

An **interface** names an object type (including objects that can be called, and classes' public shapes). Interfaces are built for extension. `extends` can take several parents, and the parents can be interfaces or object type aliases:

accounts.ts

```ts
type Currency = "NGN" | "USD";

interface Timestamps {
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface Account extends Timestamps {
  readonly id: string;
  readonly owner: string;
  readonly currency: Currency;
  balance: number;
}

type InterestTerms = { readonly ratePercent: number; readonly paidMonthly: boolean };

interface SavingsAccount extends Account, InterestTerms {
  readonly withdrawalsThisMonth: number;
}

function monthlyInterest(account: SavingsAccount): number {
  return account.paidMonthly ? Math.round((account.balance * account.ratePercent) / 100 / 12) : 0;
}

const savings: SavingsAccount = {
  id: "SAV-7",
  owner: "Ada",
  currency: "NGN",
  balance: 1200000,
  ratePercent: 8,
  paidMonthly: true,
  withdrawalsThisMonth: 1,
  createdAt: "2026-01-10",
  updatedAt: "2026-09-01",
};

console.log(monthlyInterest(savings));
```

Output of `npx tsx accounts.ts` and of the browser terminal

```ts
8000
```

### extends is checked; & is not

You can build the same shapes with intersections (`Account & InterestTerms`), which is how type aliases combine. The two behave differently when the parts disagree. Say a new developer wants a "legacy" account whose id is a number:

conflict.ts

```ts
interface Account {
  id: string;
  balance: number;
}

interface LegacyAccount extends Account {
  id: number;
}

type LegacyAccount2 = Account & { id: number };

const legacy: LegacyAccount2 = { id: 42, balance: 0 };
```

What `npx tsc --noEmit` prints

```ts
conflict.ts:6:11 - error TS2430: Interface 'LegacyAccount' incorrectly extends interface 'Account'.
  Types of property 'id' are incompatible.
    Type 'number' is not assignable to type 'string'.

6 interface LegacyAccount extends Account {
            ~~~~~~~~~~~~~

conflict.ts:12:34 - error TS2322: Type 'number' is not assignable to type 'never'.

12 const legacy: LegacyAccount2 = { id: 42, balance: 0 };
                                    ~~

  conflict.ts:2:3 - The expected type comes from property 'id' which is declared here on type 'LegacyAccount2'
    2   id: string;
        ~~


Found 2 errors in the same file, starting at: conflict.ts:6
```

With `extends`, the error appears on the declaration: `LegacyAccount` "incorrectly extends" `Account`, and the message explains why. With `&`, the declaration is accepted, `id` quietly becomes `string & number`, which is `never` (as you saw in [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#intersections)), and the error only appears later, far away, when someone tries to create a value. To change a property's type on purpose, remove it first: `interface LegacyAccount extends Omit<Account, "id"> { id: number }` (`Omit` is explained in [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#utility-types)).

## Declaration merging

Interfaces have one ability no alias has: two interface declarations with the same name, in the same scope, **merge** into one interface with the members of both. This is called **declaration merging**. A duplicate type alias is simply an error:

merge.ts

```ts
interface Transfer {
  from: string;
  to: string;
}

type Fee = { amount: number };

interface Transfer {
  reference: string;
}

type Fee = { currency: string };

const t: Transfer = { from: "Ada", to: "Bola" };
```

What `npx tsc --noEmit` prints

```ts
merge.ts:6:6 - error TS2300: Duplicate identifier 'Fee'.

6 type Fee = { amount: number };
       ~~~

merge.ts:12:6 - error TS2300: Duplicate identifier 'Fee'.

12 type Fee = { currency: string };
        ~~~

merge.ts:14:7 - error TS2741: Property 'reference' is missing in type '{ from: string; to: string; }' but required in type 'Transfer'.

14 const t: Transfer = { from: "Ada", to: "Bola" };
         ~

  merge.ts:9:3 - 'reference' is declared here.
    9   reference: string;
        ~~~~~~~~~


Found 3 errors in the same file, starting at: merge.ts:6
```

The duplicate `Fee` is reported where it is written. The second `Transfer` is accepted silently, and the error surfaces somewhere else: a transfer "is missing" a `reference` that nobody remembers adding. In a long file, that second declaration may be hundreds of lines away. That is the danger of merging: it is invisible at the place where it happens.

### Where merging is the point: extending another module's types

Merging exists for one very good reason: adding fields to a type *you do not own*. Libraries with plugin systems rely on it. A core module defines a type; a plugin, in another file, adds its own fields to it. This is called **module augmentation**. Here is a transfer module, and a fraud-scoring plugin that adds a risk score to every transfer event:

events.ts

```ts
export interface TransferEvent {
  id: string;
  amount: number;
}

export function describeEvent(event: TransferEvent): string {
  return `${event.id}: ₦${event.amount}`;
}
```

fraud.ts

```ts
import type { TransferEvent } from "./events.js";

declare module "./events.js" {
  interface TransferEvent {
    riskScore?: number;
  }
}

export function scoreTransfer(event: TransferEvent): TransferEvent {
  const riskScore = event.amount > 500000 ? 0.9 : 0.1;
  return { ...event, riskScore };
}
```

main.ts

```ts
import { describeEvent, type TransferEvent } from "./events.js";
import { scoreTransfer } from "./fraud.js";

const events: TransferEvent[] = [
  { id: "TRF-1", amount: 25000 },
  { id: "TRF-2", amount: 750000 },
];

for (const event of events.map(scoreTransfer)) {
  const flag = (event.riskScore ?? 0) > 0.5 ? "REVIEW" : "ok";
  console.log(describeEvent(event), flag);
}
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
TRF-1: ₦25000 ok
TRF-2: ₦750000 REVIEW
```

`declare module "./events.js" { … }` reopens the other module's scope, and the `interface TransferEvent` inside it merges with the original. `main.ts` reads `event.riskScore`, a property that `events.ts` never declared, and it type-checks. Two rules make this safe:

- **Add optional fields** (`riskScore?`). A required field would suddenly be required in every `TransferEvent` anywhere in the program, including code that has never heard of the plugin.
- **The augmentation must be in a file that is part of the compilation**, usually because it is imported. Here `main.ts` imports `fraud.ts`.

The same mechanism lets you describe globals, for example extra properties on `window` in a browser app (`declare global { interface Window { … } }`). Use it for extending code you do not own. For your own types, write the fields in the original declaration.

> MODULES PROTECT YOU
>
> Merging only happens within one scope. Every file with an `import` or `export` is a module with its own scope, so two modules can each have an `interface Account` without merging. Old-style script files (no imports or exports) share one global scope, where same-named interfaces from different files merge silently. Keep every file a module; the course's `tsconfig.json` (with `module: "NodeNext"` and `"type": "module"`) treats every file as one.

## Recursive types

Some data contains smaller copies of itself: comment threads, folder trees, organisation charts. A bank's **chart of accounts** is one: "Assets" contains "Cash" and "Loans", "Cash" contains "Vault" and "ATMs", and so on. A type for it must refer to itself. Both interfaces and aliases can:

ledger.ts

```ts
interface LedgerAccount {
  readonly code: string;
  readonly name: string;
  readonly balance: number;
  readonly children: readonly LedgerAccount[];
}

function totalBalance(account: LedgerAccount): number {
  return account.children.reduce((sum, child) => sum + totalBalance(child), account.balance);
}

function print(account: LedgerAccount, depth = 0): void {
  console.log(`${"  ".repeat(depth)}${account.code} ${account.name}: ₦${totalBalance(account)}`);
  for (const child of account.children) print(child, depth + 1);
}

const assets: LedgerAccount = {
  code: "1000",
  name: "Assets",
  balance: 0,
  children: [
    {
      code: "1100",
      name: "Cash",
      balance: 0,
      children: [
        { code: "1110", name: "Vault", balance: 4000000, children: [] },
        { code: "1120", name: "ATMs", balance: 2500000, children: [] },
      ],
    },
    { code: "1200", name: "Loans to customers", balance: 18000000, children: [] },
  ],
};

print(assets);
```

Output of `npx tsx ledger.ts` and of the browser terminal

```ts
1000 Assets: ₦24500000
  1100 Cash: ₦6500000
    1110 Vault: ₦4000000
    1120 ATMs: ₦2500000
  1200 Loans to customers: ₦18000000
```

The type and the function have the same structure: `children` refers back to `LedgerAccount`, and `totalBalance` calls itself on each child. The base case, which you met in [Functions](https://zudojs.oyinlola.site/learn/js-functions#recursion), is an account with no children: `reduce` over an empty array just returns the starting value, the account's own balance.

### A recursive union: any JSON value

A type alias can be recursive through a union too. This is the type of every value `JSON.parse` can produce:

json.ts

```ts
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function countLeaves(value: Json): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countLeaves(item), 0);
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce((sum: number, item) => sum + countLeaves(item), 0);
  }
  return 1;
}

const statement: Json = {
  account: "ACC-1001",
  entries: [
    { date: "2026-09-01", amount: -2500, memo: "Airtime" },
    { date: "2026-09-03", amount: 150000, memo: null },
  ],
  closed: false,
};

console.log(countLeaves(statement));
```

Output of `npx tsx json.ts` and of the browser terminal

```ts
8
```

`{ [key: string]: Json }` is an **index signature**: an object whose keys can be any string, each holding a `Json` value. The self-reference is allowed because it sits inside an array or an object type; a type that referred to itself directly, like `type Loop = Loop | string`, would be an error, since the compiler could never finish expanding it. `Json` is also a much more honest type than `any` for parsed data: it says exactly what JSON can contain, and still makes you check before use.

## The real differences

For a plain object shape, `type X = { … }` and `interface X { … }` are almost interchangeable, and structural typing means values move freely between them. The differences that matter in practice are these:

|  | `interface` | `type` |
| --- | --- | --- |
| Can name | Object types only (including callable objects and class shapes) | Any type: unions, tuples, primitives, functions, mapped and conditional types |
| Combining | `extends`, checked at the declaration | `&`; conflicts silently become `never` |
| Same name twice | Merges (on purpose or by accident) | Error TS2300 |
| Assignable to an index signature such as `Record<string, string>` | No (it could be merged with more fields later) | Yes, when every property fits |
| Module augmentation | Yes | No |

The index-signature row surprises people. A logging function that accepts `Record<string, string>` takes an object typed with an alias, but refuses the same shape typed with an interface:

fields.ts

```ts
interface CustomerI {
  name: string;
  phone: string;
}

type CustomerT = {
  name: string;
  phone: string;
};

function logFields(fields: Record<string, string>): void {
  console.log(Object.keys(fields).join(","));
}

const a: CustomerI = { name: "Ada", phone: "0803 000 1111" };
const b: CustomerT = { name: "Ada", phone: "0803 000 1111" };
logFields(b);
logFields(a);
```

What `npx tsc --noEmit` prints

```ts
fields.ts:18:11 - error TS2345: Argument of type 'CustomerI' is not assignable to parameter of type 'Record<string, string>'.
  Index signature for type 'string' is missing in type 'CustomerI'.

18 logFields(a);
             ~


Found 1 error in fields.ts:18
```

Because an interface can be merged with more members later (maybe a number), TypeScript will not promise that *every* property of `CustomerI` is a string. An alias is closed, so it can check. The same happens with `Record<string, unknown>`, a type many logging and serialisation libraries use for "any plain object". Two fixes: spread the value into a fresh object, `logFields({ ...a })`, whose type is a closed object literal type that can be checked; or, better, give the function a parameter type that says what it really needs, such as `{ name: string }`, or a generic ([Generics](https://zudojs.oyinlola.site/learn/ts-generics)).

## Choosing between them

REASON IT OUT

### Which concepts deserve a name?

You are writing the shared types module for the bank. Before writing any code, think about these:

1. Customers and staff both have a name, a phone number and an email. Should they share a type? Should a staff member *be* a customer?
2. An amount appears in transfers, fees, balances and limits. One type or several?
3. A transaction is a deposit, a withdrawal or a transfer, each with different fields. `interface` or `type`?
4. Which of these types might a plugin, or another team, need to add fields to?

**Show the reasoning**

1. Share the *contact details*, not the identity: an interface `ContactDetails` that both `Customer` and `StaffMember` extend. A staff member is not a customer (they have different permissions and lifecycles), even if a person can be both; a function that emails someone should only ask for `ContactDetails`.
2. One `Money` type, with the amount in kobo as a whole number and a currency, used everywhere. The opening example showed what happens with several private ideas of money.
3. A `type`: it is a union of three shapes, which only an alias can name. Each member can itself be an interface.
4. Events and request contexts, which plugins decorate. Those should be interfaces, so they can be augmented. Closed data such as `Money` can be either; nobody should be adding fields to money.

A rule that works, and the one ZudoJS itself follows (its `AGENTS.md` asks for interface-first design, `readonly` properties and no `I` prefix on names):

- **`interface` for object shapes**, especially ones others build on or extend: entities, service contracts, events, options objects.
- **`type` for everything else**: unions, discriminated unions, tuples, function types, and types computed from other types.
- **Name the concept, not the use.** `Money`, not `TransferAmountObject`. Reusable names come from the domain.
- **Ask for the smallest type a function needs.** `notify(contact: ContactDetails)` can be called with a customer or a staff member; `notify(customer: Customer)` cannot.

## Build: a shared domain types module

Here are the bank's domain types, all in one file that other modules import with `import type`:

domain.ts

```ts
export type Currency = "NGN" | "USD";

export interface Money {
  readonly kobo: number;
  readonly currency: Currency;
}

export interface ContactDetails {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export interface Customer extends ContactDetails {
  readonly customerId: string;
  readonly kycLevel: 1 | 2 | 3;
}

export interface StaffMember extends ContactDetails {
  readonly staffId: string;
  readonly branch: string;
}

interface TransactionBase {
  readonly id: string;
  readonly money: Money;
  readonly at: string;
}

export interface Deposit extends TransactionBase {
  readonly kind: "deposit";
  readonly channel: "branch" | "transfer-in";
}

export interface Withdrawal extends TransactionBase {
  readonly kind: "withdrawal";
  readonly atmId: string | null;
}

export interface Transfer extends TransactionBase {
  readonly kind: "transfer";
  readonly toAccount: string;
}

export type Transaction = Deposit | Withdrawal | Transfer;
```

Interfaces for the entities and their shared parts, a `type` for the union. Now two modules that use it without knowing about each other:

notify.ts

```ts
import type { ContactDetails } from "./domain.js";

export function smsLine(contact: ContactDetails, text: string): string {
  return `to ${contact.phone} (${contact.name}): ${text}`;
}
```

statement.ts

```ts
import type { Money, Transaction } from "./domain.js";

export function formatMoney(money: Money): string {
  const major = (money.kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
  return `${money.currency === "NGN" ? "₦" : "$"}${major}`;
}

export function line(tx: Transaction): string {
  switch (tx.kind) {
    case "deposit":
      return `${tx.at} +${formatMoney(tx.money)} (${tx.channel})`;
    case "withdrawal":
      return `${tx.at} -${formatMoney(tx.money)} ${tx.atmId === null ? "at branch" : `ATM ${tx.atmId}`}`;
    case "transfer":
      return `${tx.at} -${formatMoney(tx.money)} to ${tx.toAccount}`;
  }
}
```

main.ts

```ts
import type { Customer, StaffMember, Transaction } from "./domain.js";
import { smsLine } from "./notify.js";
import { line } from "./statement.js";

const ada: Customer = { customerId: "C-1", kycLevel: 2, name: "Ada", phone: "0803 000 1111", email: "ada@example.com" };
const tunde: StaffMember = { staffId: "S-9", branch: "Yaba", name: "Tunde", phone: "0805 222 3333", email: "tunde@bank.example" };

const history: Transaction[] = [
  { kind: "deposit", id: "T1", at: "09-01", money: { kobo: 15000000, currency: "NGN" }, channel: "transfer-in" },
  { kind: "withdrawal", id: "T2", at: "09-02", money: { kobo: 2000000, currency: "NGN" }, atmId: "YABA-02" },
  { kind: "transfer", id: "T3", at: "09-03", money: { kobo: 4550, currency: "USD" }, toAccount: "ACC-2001" },
];

for (const tx of history) console.log(line(tx));
console.log(smsLine(ada, "Your statement is ready"));
console.log(smsLine(tunde, "3 statements sent"));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
09-01 +₦150,000.00 (transfer-in)
09-02 -₦20,000.00 ATM YABA-02
09-03 -$45.50 to ACC-2001
to 0803 000 1111 (Ada): Your statement is ready
to 0805 222 3333 (Tunde): 3 statements sent
```

`smsLine` asks only for `ContactDetails`, so it serves customers and staff alike. `formatMoney` is the one place that knows how to show money, and every amount is in kobo, so the naira/kobo mix-up from earlier cannot happen by accident.

## Testing shared types

A shared types module is a contract many files depend on, so it deserves tests of its own: values that must compile, and values that must not. Keep them in a type-test file that `npm run check` covers:

domain.types-test.ts

```ts
import type { Customer, Money, Transaction } from "./domain.js";

const ok: Transaction = { kind: "transfer", id: "T9", at: "09-04", money: { kobo: 100, currency: "NGN" }, toAccount: "ACC-1" };

// @ts-expect-error: a withdrawal needs atmId (null for the branch)
const noAtm: Transaction = { kind: "withdrawal", id: "T10", at: "09-04", money: { kobo: 100, currency: "NGN" } };

// @ts-expect-error: money is always in kobo, never "amount"
const wrongUnit: Money = { amount: 100, currency: "NGN" };

// @ts-expect-error: KYC levels are 1, 2 or 3
const badKyc: Customer = { customerId: "C-2", kycLevel: 4, name: "Bola", phone: "0", email: "b@example.com" };

console.log(ok.kind, noAtm.kind, wrongUnit.currency, badKyc.kycLevel);
```

Output of `npx tsx domain.types-test.ts` and of the browser terminal

```ts
transfer withdrawal NGN 4
```

Each `@ts-expect-error` line documents a rule of the domain, and fails the check if the rule is ever loosened, for example if someone makes `atmId` optional. (The file also runs: TypeScript's checks are erased, so the "invalid" values exist at runtime. That is fine for a type test, and a reminder that only runtime validation can reject bad data.)

## In production

- **One home per concept.** Put shared domain types in one module (or one package, in a monorepo) and import them with `import type`. ZudoJS does this at scale: types such as `Logger` or `EventBus` are owned by one package and imported by the others, never redefined.
- **Keep files as modules** so that interfaces cannot merge across files by accident.
- **Augment only what you do not own**, only with optional fields, and keep the augmentation next to the code that sets those fields.
- **Prefer `extends` over `&` for object hierarchies.** Conflicts are reported at the declaration, and the checker caches interface relationships, which helps in very large projects.
- **Aliases are not units.** `type Kobo = number` documents, but does not protect. Store money as whole kobo, and move to branded types when mix-ups become a real risk.
- **Types describe, they do not check.** A `Customer` from a database row or a request body must be validated at runtime before you trust its `kycLevel`.

## Practice

TRY IT YOURSELF

### Find the merge

This file fails to compile with "Property 'branch' is missing". Nobody on the team remembers requiring a branch. Explain what happened, and fix it without deleting any information the second declaration was trying to add.

teller.ts

```ts
interface Teller {
  id: string;
  name: string;
}

function greet(teller: Teller): string {
  return `Hello, ${teller.name}`;
}

// … two hundred lines later …

interface Teller {
  branch: string;
}

console.log(greet({ id: "S-1", name: "Tunde" }));
```

  teller.ts:16:19 - error TS2741: Property 'branch' is missing in type '{ id: string; name: string; }' but required in type 'Teller'. 16 console.log(greet({ id: "S-1", name: "Tunde" })); ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ teller.ts:13:3 - 'branch' is declared here. 13 branch: string; ~~~~~~ Found 1 error in teller.ts:16

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Delete the second `interface Teller { branch: string; }` and replace it with a new name that extends `Teller`: `interface BranchTeller extends Teller { branch: string; }`.

HINT 2

Create `const tunde: BranchTeller = { id: "S-1", name: "Tunde", branch: "Yaba" };`, and print both: `greet({ id: "S-2", name: "Kemi" })` and `greet(tunde)`, plus `tunde.branch`.

SOLUTION

The two `interface Teller` declarations are in the same module, so they merged: every `Teller` now needs a `branch`. The second declaration was probably meant for a teller *assigned to* a branch. Give that its own name:

teller.ts

```ts
interface Teller {
  id: string;
  name: string;
}

interface BranchTeller extends Teller {
  branch: string;
}

function greet(teller: Teller): string {
  return `Hello, ${teller.name}`;
}

const tunde: BranchTeller = { id: "S-1", name: "Tunde", branch: "Yaba" };
console.log(greet({ id: "S-2", name: "Kemi" }), "|", greet(tunde), "at", tunde.branch);
```

Output of `npx tsx teller.ts` and of the browser terminal

```ts
Hello, Kemi | Hello, Tunde at Yaba
```

TRY IT YOURSELF

### Walk a comment thread

Customer support notes can have replies, which can have replies. Write a recursive `Note` type (author, text, replies) and a function `countNotes(note)` that counts a note and all replies at every depth. Then write `authors(note)` that returns every distinct author.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`countNotes`: `return 1 + note.replies.reduce((sum, reply) => sum + countNotes(reply), 0);`. The base case is a note with an empty `replies` array.

HINT 2

`authors`: `const all = [note.author, ...note.replies.flatMap(authors)]; return [...new Set(all)];`. `flatMap` calls `authors` on every reply and flattens the results.

SOLUTION

notes.ts

```ts
interface Note {
  readonly author: string;
  readonly text: string;
  readonly replies: readonly Note[];
}

function countNotes(note: Note): number {
  return 1 + note.replies.reduce((sum, reply) => sum + countNotes(reply), 0);
}

function authors(note: Note): string[] {
  const all = [note.author, ...note.replies.flatMap(authors)];
  return [...new Set(all)];
}

const thread: Note = {
  author: "Ada",
  text: "Card blocked after 3 wrong PINs",
  replies: [
    { author: "Tunde", text: "Unblocked, new PIN sent", replies: [{ author: "Ada", text: "Thanks!", replies: [] }] },
    { author: "Kemi", text: "Added fraud flag for review", replies: [] },
  ],
};

console.log(countNotes(thread), authors(thread));
```

Output of `npx tsx notes.ts` and of the browser terminal

```ts
4 [ 'Ada', 'Tunde', 'Kemi' ]
```

`flatMap(authors)` calls `authors` on every reply and flattens the resulting arrays into one; a `Set` removes the repeated "Ada".

TRY IT YOURSELF

### interface or type?

For each of these, choose `interface` or `type`, and say why: (a) a card's state, one of `active`, `blocked` or `expired`; (b) the options object for a `createTransferService` function; (c) a pair of latitude and longitude; (d) the shape of a request context that plugins add fields to; (e) a function that validates an amount.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask first: is this an object shape, or something else (a union, a tuple, a function)? Only `type` can name the "something else" cases.

HINT 2

For the object shapes, ask a second question: will another file ever need to merge fields into this one from the outside, the way the fraud plugin did to `TransferEvent`?

SOLUTION

- (a) `type CardState = "active" | "blocked" | "expired"`: a union, which only an alias can name.
- (b) `interface TransferServiceOptions`: an object shape that may grow and that other options may extend.
- (c) `type LatLng = [lat: number, lng: number]`: a tuple. (An interface `{ lat; lng }` would also be a fine design; the choice of tuple is what forces `type`.)
- (d) `interface RequestContext`: plugins must be able to augment it, and only interfaces merge.
- (e) `type AmountValidator = (kobo: number) => string | null`: a function type reads most clearly as an alias.

## Recap

- Name each recurring concept once. A change to a named type reaches every function that uses it; inline shapes drift apart silently.
- A type alias names any type, but creates nothing new: `Naira` and `Kobo` aliases of `number` are interchangeable.
- Interfaces extend one or more parents, and `extends` reports conflicts at the declaration; `&` turns them into `never` silently.
- Same-named interfaces in one scope merge. That is a trap inside your own files, and the tool for module augmentation when extending code you do not own.
- Recursive types describe trees and nested data; recursive functions walk them, with an empty child list as the base case.
- Interfaces are not assignable to index signatures; aliases can be. Use `interface` for object shapes and `type` for unions, tuples, functions and computed types.

Next: [Special types: any, unknown, never and friends](https://zudojs.oyinlola.site/learn/ts-special-types), and what `any`, `unknown`, `never`, `void`, `object`, `{}` and `Object` really mean.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
