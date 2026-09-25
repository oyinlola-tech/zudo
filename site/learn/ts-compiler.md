---
title: "What the TypeScript compiler does — ZudoJS Academy"
description: "Follow a TypeScript file through tsc: checking, type erasure, transpiling to older JavaScript, emitted files, watch mode and Node's type stripping."
source: https://zudojs.oyinlola.site/learn/ts-compiler
---

LEVEL 5 · LESSON 2 OF 23

Why TypeScript Foundation

# What the TypeScript compiler does

Follow a TypeScript file through tsc: checking, type erasure, transpiling to older JavaScript, emitted files, watch mode and Node's type stripping.

- **45 min** to read and try
- **You need:** Why TypeScript exists (the ts-tasks project with tsc, tsx and a tsconfig.json)
- **You build:** A small bank-transfer module you check, compile, run with Node's type stripping and wire into package scripts

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what "superset" and "static type checking" mean, and what they do not promise
- Predict which parts of a .ts file survive in the emitted JavaScript
- Use target, noEmit, noEmitOnError, declaration, sourceMap and watch mode on purpose
- Run TypeScript with Node's type stripping and name its limits
- Set up package scripts so that type checking actually happens before code ships
- Explain why a program that compiles still needs runtime validation

## The refund that added ₦50 wrong

A small payments team keeps its settings in an object. A new teammate adds the transfer fee, and writes it the way it appears in the finance spreadsheet: as text. Then a refund function gives the fee back to the customer:

refund.ts

```ts
function refund(balance: number, fee: number): number {
  return balance + fee;
}

const settings = { transferFee: "50" };
console.log(refund(5000, settings.transferFee));
```

What `npx tsc --noEmit` prints

```ts
refund.ts:6:26 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

6 console.log(refund(5000, settings.transferFee));
                           ~~~~~~~~~~~~~~~~~~~~


Found 1 error in refund.ts:6
```

TypeScript sees the mistake at once. But the team's deploy script never runs `tsc`. It starts the server with `node src/server.ts`, which Node.js 24 can do, and it runs this code happily:

Terminal on your computer (Node.js 24 from nodejs.org)

```bash
$ node refund.ts
500050
```

The customer had ₦5,000 and was owed ₦50 back. The account now says ₦500,050, because `5000 + "50"` is string concatenation in JavaScript. Here is exactly what Node ran, with the types removed:

refund.js

```ts
function refund(balance, fee) {
  return balance + fee;
}

const settings = { transferFee: "50" };
console.log(refund(5000, settings.transferFee));
```

Output of `node refund.js` and of the browser terminal

```ts
500050
```

The team *had* TypeScript. What they did not have was the **checking step**. This lesson takes the compiler apart so that you always know which tool checks, which tool only runs, and what is left of your types when the code finally executes. You met the three ways to run TypeScript in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup#run); here you go underneath them.

## What "superset of JavaScript" really means

TypeScript is often called a **superset** of JavaScript. A superset is a larger set that contains a smaller one. For languages, it means: every piece of JavaScript *syntax* is also TypeScript syntax, and TypeScript adds more syntax on top (annotations, `interface`, `type`, generics and a few others).

It does **not** mean that every JavaScript program passes the TypeScript checker. This is valid JavaScript, and runs without an error in any browser:

balance.ts

```ts
let balance = 5000;
balance = "empty";

const account = { owner: "Ada", balance: 5000 };
console.log(account.balnce);
```

What `npx tsc --noEmit` prints

```ts
balance.ts:2:1 - error TS2322: Type 'string' is not assignable to type 'number'.

2 balance = "empty";
  ~~~~~~~

balance.ts:5:21 - error TS2551: Property 'balnce' does not exist on type '{ owner: string; balance: number; }'. Did you mean 'balance'?

5 console.log(account.balnce);
                      ~~~~~~

  balance.ts:4:33 - 'balance' is declared here.
    4 const account = { owner: "Ada", balance: 5000 };
                                      ~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: balance.ts:2
```

Both lines are legal JavaScript. Both are almost certainly bugs, and TypeScript refuses them. So there are two separate questions about any `.ts` file:

1. **Is it valid syntax?** Can the file be read at all, and turned into JavaScript? Every tool (`tsc`, `tsx`, Node.js) must answer this.
2. **Do the types fit?** Does every value match what the code says it should be? Only the **type checker** answers this, and in a normal project that means `tsc` (or your editor, which runs the same checker in the background).

The second question is answered by **static type checking**. "Static" means the code is analysed without running it: the checker reads the text, works out a type for every expression, and compares them. The opposite is **dynamic** checking, which happens while the program runs, like JavaScript throwing `TypeError: x is not a function` on the line that fails.

|  | Compile time | Runtime |
| --- | --- | --- |
| When | When `tsc` reads your files | When Node.js or a browser executes the JavaScript |
| What exists | Your source text, and the types in it | Values in memory. No types. |
| What it can know | Every path through the code, including paths that never run in your tests | Only the values that actually arrive |
| What it cannot know | What a user, a file or another server will send | Anything about paths that did not run |

The two columns cover each other's blind spots. That is why a serious backend uses both: `tsc` for the code you wrote, and runtime checks for the data you did not.

## Inside tsc: parse, check, emit

`tsc` is really three programs run one after another:

```ts
  transfer.ts, receipt.ts, …
          │
          ▼
  ┌───────────────┐   syntax errors (a missing brace, a stray keyword)
  │ 1. Parse      │ ─────────────────────────────────────────────────▶
  └───────┬───────┘
          │ a tree of every statement and expression
          ▼
  ┌───────────────┐   type errors (TS2322, TS2345, …)
  │ 2. Check      │ ─────────────────────────────────────────────────▶
  └───────┬───────┘
          │ the same tree, unchanged by the check
          ▼
  ┌───────────────┐
  │ 3. Emit       │ ──▶ .js files  (+ .d.ts and .js.map when asked)
  └───────────────┘
```

- **Parse** reads the text into a tree, just like a JavaScript engine does. A missing `}` fails here.
- **Check** walks the tree and works out types. This is the expensive part, and the only part that finds type errors.
- **Emit** writes JavaScript. It removes the types and, if you ask for older JavaScript, rewrites newer syntax. It does not use the results of the check at all.

That last point surprises people: **checking and emitting are independent**. By default, `tsc` writes the JavaScript even when the check fails. Try it with the refund file in your `ts-tasks` folder (which has `"noEmit": true` in `tsconfig.json`, so turn it off for this run):

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
refund.ts:6:26 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

6 console.log(refund(5000, settings.transferFee));
                           ~~~~~~~~~~~~~~~~~~~~


Found 1 error in refund.ts:6

$ echo $?
2
$ ls dist
refund.js
```

`echo $?` prints the **exit code** of the last command: a number every program hands back to the shell when it ends. `0` means success, anything else means failure, and CI systems stop a build on anything but `0`. `tsc` uses three codes:

| Exit code | Meaning |
| --- | --- |
| `0` | No errors. Output written (unless `noEmit`). |
| `1` | Errors, and no output was written (for example with `--noEmit` or `--noEmitOnError`). |
| `2` | Errors, but the output was written anyway. |

The broken `dist/refund.js` is sitting there, ready for someone to deploy. Turn on `noEmitOnError` and `tsc` refuses to write anything while there are errors:

Terminal on your computer

```bash
$ rm -rf dist
$ npx tsc --noEmit false --outDir dist --noEmitOnError
refund.ts:6:26 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
…
$ echo $?
1
$ ls dist
ls: cannot access 'dist': No such file or directory
```

> TIP
>
> For a build that produces files you will deploy, set `"noEmitOnError": true` in `tsconfig.json`. For a project that only checks (`"noEmit": true`), it makes no difference: nothing is written anyway.

## Type erasure, line by line

When `tsc` emits JavaScript, every interface, annotation and `as` disappears. This is **type erasure**: removing every piece of type information and keeping only the JavaScript. Here is the full list of what goes. Start with two files of a small transfer module:

transfer.ts

```ts
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export function transferFee(amount: number): number {
  if (amount <= 5000) return 10;
  if (amount <= 50000) return 25;
  return 50;
}
```

receipt.ts

```ts
import { transferFee, type Transfer } from "./transfer.js";

interface Receipt {
  reference: string;
  total: number;
}

type Currency = "NGN" | "USD";

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

function receiptFor(transfer: Transfer, currency: Currency = "NGN"): Receipt {
  const total = transfer.amount + transferFee(transfer.amount);
  return { reference: `${currency}:${transfer.from}->${transfer.to}`, total } satisfies Receipt;
}

const transfers: Transfer[] = [{ from: "Ada", to: "Bola", amount: 2500 }];
const latest = first(transfers)!;
const receipt = receiptFor(latest) as Receipt;
console.log(receipt);
```

Output of `npx tsx receipt.ts` and of the browser terminal

```json
{ reference: 'NGN:Ada->Bola', total: 2510 }
```

Before you look at the compiled file, guess which parts of `receipt.ts` will be gone. Then compile:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
```

dist/receipt.js

```ts
import { transferFee } from "./transfer.js";
function first(items) {
    return items[0];
}
function receiptFor(transfer, currency = "NGN") {
    const total = transfer.amount + transferFee(transfer.amount);
    return { reference: `${currency}:${transfer.from}->${transfer.to}`, total };
}
const transfers = [{ from: "Ada", to: "Bola", amount: 2500 }];
const latest = first(transfers);
const receipt = receiptFor(latest);
console.log(receipt);
```

Everything that was only about types is gone, and nothing was added in its place:

| In receipt.ts | In receipt.js |
| --- | --- |
| `type Transfer` inside the import | Removed. The import keeps only `transferFee`, a real function. |
| `interface Receipt`, `type Currency` | Removed completely |
| `<T>`, `readonly T[]`, `T \| undefined` | Removed. `first` is one plain function for every `T`. |
| `: Transfer`, `: Currency`, `: Receipt` | Removed |
| `= "NGN"` | Kept: a default value is JavaScript |
| `satisfies Receipt` | Removed. The check happened at compile time only. |
| `!` after `first(transfers)` | Removed. No check that the value is really there. |
| `as Receipt` | Removed. No conversion, no check. |

The last three rows deserve a second look. `!` (the **non-null assertion**) and `as` (a **type assertion**) are promises you make to the compiler. The compiler believes you, and then erases the promise. If `transfers` had been empty, `latest` would be `undefined` at runtime, and nothing would stop it. [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions) covers when such promises are justified.

### Generics do not exist at runtime either

A generic function looks as if it knows its type parameter. It does not. Here is a function that promises to return a `T` from a JSON string:

parse.ts

```ts
interface Transfer {
  from: string;
  to: string;
  amount: number;
}

function parseJson<T>(text: string): T {
  return JSON.parse(text);
}

const transfer = parseJson<Transfer>('{"from": "Ada", "to": "Bola", "amount": "2500"}');
console.log(typeof transfer.amount);
console.log(transfer.amount + 10);
```

Output of `npx tsx parse.ts` and of the browser terminal

```ts
string
250010
```

The compiler believes `transfer.amount` is a `number`, and allows `+ 10`. After erasure, `parseJson` is just `function parseJson(text) { return JSON.parse(text); }`. The `<Transfer>` in the call vanished, so nothing compared the JSON with `Transfer`. A type parameter can shape what the compiler believes; it can never make the code check anything.

### You cannot branch on a type

Because types are gone at runtime, you cannot use one as a value. Say you want to check that a currency code from a form is one you support:

currency.ts

```ts
type Currency = "NGN" | "USD" | "GBP";

function isSupported(code: string): boolean {
  return Currency.includes(code);
}
```

What `npx tsc --noEmit` prints

```ts
currency.ts:4:10 - error TS2693: 'Currency' only refers to a type, but is being used as a value here.

4   return Currency.includes(code);
           ~~~~~~~~


Found 1 error in currency.ts:4
```

The fix is to start from a **value**, which survives, and derive the type from it. Then the list exists once, for both worlds:

currency.ts

```ts
const currencies = ["NGN", "USD", "GBP"] as const;
type Currency = (typeof currencies)[number];

function isSupported(code: string): boolean {
  return currencies.some((c) => c === code);
}

const home: Currency = "NGN";
console.log(home, isSupported("USD"), isSupported("EUR"));
```

Output of `npx tsx currency.ts` and of the browser terminal

```ts
NGN true false
```

`as const` keeps the array's exact strings, and `(typeof currencies)[number]` turns them into the union `"NGN" | "USD" | "GBP"`. [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#indexed-access) explains both. Here, the point is the direction: **values can produce types, but types can never produce values.**

## The syntax that is not erased

Almost all TypeScript syntax is erasable. A few older features are not: the compiler has to *write new JavaScript* for them. The two you will meet most often are `enum` and **parameter properties** (a constructor parameter marked `public`, `private`, `protected` or `readonly`, which you will meet in [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#parameter-properties)).

account.ts

```ts
enum Currency {
  NGN = "NGN",
  USD = "USD",
}

class Account {
  constructor(
    public readonly owner: string,
    private balance: number,
  ) {}

  describe(): string {
    return `${this.owner}: ${Currency.NGN} ${this.balance}`;
  }
}

console.log(new Account("Ada", 5000).describe());
```

Output of `npx tsx account.ts` and of the browser terminal

```ts
Ada: NGN 5000
```

dist/account.js

```ts
var Currency;
(function (Currency) {
    Currency["NGN"] = "NGN";
    Currency["USD"] = "USD";
})(Currency || (Currency = {}));
class Account {
    owner;
    balance;
    constructor(owner, balance) {
        this.owner = owner;
        this.balance = balance;
    }
    describe() {
        return `${this.owner}: ${Currency.NGN} ${this.balance}`;
    }
}
console.log(new Account("Ada", 5000).describe());
export {};
```

The enum became a variable and a function that fills it. The two constructor parameters became two class fields and two assignments. None of that code was in your file; `tsc` generated it. (The last line, `export {};`, marks the file as an ES module because it has no imports or exports of its own.) `namespace` blocks, which old TypeScript code uses to group values, also generate code. A `const enum` is meant to be replaced by its values instead, but under the `verbatimModuleSyntax` setting this course uses, TypeScript 7 emits it exactly like a normal enum; [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums#const-enums) shows both outputs.

Code like this is a problem for any tool that only strips types, such as Node.js. Since TypeScript 5.8 there is a setting that bans it, `erasableSyntaxOnly`. Add it to the project's `tsconfig.json`:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true
  }
}
```

account.ts

```ts
enum Currency {
  NGN = "NGN",
  USD = "USD",
}

class Account {
  constructor(
    public readonly owner: string,
    private balance: number,
  ) {}
}
```

What `npx tsc --noEmit` prints

```ts
account.ts:1:6 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

1 enum Currency {
       ~~~~~~~~

account.ts:8:5 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

8     public readonly owner: string,
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

account.ts:9:5 - error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.

9     private balance: number,
      ~~~~~~~~~~~~~~~~~~~~~~~


Found 3 errors in the same file, starting at: account.ts:1
```

Every line that would generate code is marked. The erasable version does the same job with plain JavaScript plus types: a `const` object instead of the enum, and ordinary fields instead of parameter properties.

account.ts

```ts
const Currency = {
  NGN: "NGN",
  USD: "USD",
} as const;
type Currency = (typeof Currency)[keyof typeof Currency];

class Account {
  readonly owner: string;
  private balance: number;

  constructor(owner: string, balance: number) {
    this.owner = owner;
    this.balance = balance;
  }

  describe(currency: Currency = Currency.NGN): string {
    return `${this.owner}: ${currency} ${this.balance}`;
  }
}

console.log(new Account("Ada", 5000).describe());
console.log(new Account("Bola", 120).describe(Currency.USD));
```

Output of `npx tsx account.ts` and of the browser terminal

```ts
Ada: NGN 5000
Bola: USD 120
```

Delete every type from this file and what is left is exactly the JavaScript that runs. [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums) compares the two styles in detail.

## Transpiling to older JavaScript

Removing types is one half of emitting. The other half is **transpiling**: translating code from one version of a language into another version of the same language (as opposed to *compiling* into a different, lower-level language). The `target` setting says which JavaScript version to produce.

With `"target": "ES2024"`, which the course uses, Node.js 24 understands everything, so `tsc` leaves your syntax alone. Here is a function using optional chaining (`?.`) and nullish coalescing (`??`), both added to JavaScript in ES2020:

price.ts

```ts
type Order = { id: number; discount?: { percent: number } };

export function discountPercent(order: Order): number {
  return order.discount?.percent ?? 0;
}

console.log(discountPercent({ id: 1 }), discountPercent({ id: 2, discount: { percent: 15 } }));
```

Output of `npx tsx price.ts` and of the browser terminal

```ts
0 15
```

Ask for ES2019, a version from before those operators existed, and watch `tsc` rewrite them:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist --target ES2019
```

dist/price.js

```ts
export function discountPercent(order) {
    var _a;
    var _b;
    return (_b = (_a = order.discount) === null || _a === void 0 ? void 0 : _a.percent) !== null && _b !== void 0 ? _b : 0;
}
console.log(discountPercent({ id: 1 }), discountPercent({ id: 2, discount: { percent: 15 } }));
```

Same behaviour, much uglier code. (`void 0` is an old, safe way to write `undefined`.) Two things to know about `target`:

- **It rewrites syntax, never adds functions.** If you call `Array.prototype.findLast` (ES2023), a lower target does not add it. Instead, the compiler reports that it does not exist, because `target` also sets which built-in functions it believes are there (the `lib` setting, covered in [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig)).
- **Match it to where the code runs.** For a Node.js 24 backend, `ES2024` is right: a lower target only makes the code bigger and slower to read in stack traces.

## What else tsc can write

Besides `.js` files, two more outputs matter for real projects.

### Declaration files (.d.ts)

When you publish a library, people who install it get JavaScript, which has no types. `--declaration` makes `tsc` also write a **declaration file** for each module: only the types, with no code bodies. Compile the transfer module with it:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist --declaration
$ ls dist
receipt.d.ts  receipt.js  transfer.d.ts  transfer.js
```

dist/transfer.d.ts

```ts
export interface Transfer {
    from: string;
    to: string;
    amount: number;
}
export declare function transferFee(amount: number): number;
```

The function body is gone; only its signature is left, marked `declare` ("this exists somewhere, trust me"). This is exactly how every `@zudojs/*` package ships: JavaScript in `.js`, and types in `.d.ts` next to it, so your editor knows every function's parameters. The `@types/node` package you installed is nothing but `.d.ts` files describing Node.js.

### Source maps (.js.map)

When compiled code throws, the stack trace points at the *JavaScript* file. That is not a file you ever edit. A **source map** is a file that maps each position in the output back to your `.ts` source. Here is a withdrawal that throws when the balance is too low:

withdraw.ts

```ts
interface Account {
  owner: string;
  balance: number;
}

function withdraw(account: Account, amount: number): Account {
  if (amount > account.balance) {
    throw new Error(`Insufficient funds: ${account.owner} has ${account.balance}`);
  }
  return { ...account, balance: account.balance - amount };
}

withdraw({ owner: "Ada", balance: 3000 }, 5000);
```

Ask `tsc` for a source map, and tell Node to use it:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist --sourceMap
$ ls dist
withdraw.js  withdraw.js.map
$ node dist/withdraw.js
…
Error: Insufficient funds: Ada has 3000
    at withdraw (file:///home/you/ts-tasks/dist/withdraw.js:3:15)
$ node --enable-source-maps dist/withdraw.js
…
Error: Insufficient funds: Ada has 3000
    at withdraw (/home/you/ts-tasks/withdraw.ts:8:11)
```

With the map, the error points at line 8 of `withdraw.ts`, the line you actually wrote. Production servers usually run with `--enable-source-maps` for exactly this reason.

## Checking only: --noEmit and watch mode

In most projects today, `tsc` never emits anything during development. Something faster runs the code (`tsx`, Node itself, or a bundler), and `tsc --noEmit` is used purely as the checker. That split is why the course's `tsconfig.json` has `"noEmit": true`.

Running the check by hand after every change is tedious. **Watch mode** keeps `tsc` running: it checks once, then waits, and re-checks every time you save a file. Because it remembers the previous result, each re-check only redoes the work that changed:

Terminal on your computer

```bash
$ npx tsc --noEmit --watch
[08:12:41 PM] Starting compilation in watch mode...

[08:12:41 PM] Found 0 errors. Watching for file changes.

# you add a line to transfer.ts and save it:
[08:12:43 PM] File change detected. Starting incremental compilation...

transfer.ts:13:14 - error TS2322: Type 'string' is not assignable to type 'number'.

13 export const flatFee: number = "25";
                ~~~~~~~


Found 1 error in transfer.ts:13

[08:12:43 PM] Found 1 error. Watching for file changes.
```

Stop it with Ctrl+C. A common setup is two terminals: one running the program in its own watch mode, one running `tsc --noEmit --watch`. Your editor gives you the same errors as squiggles, but only for the files you have open; `tsc` checks every file in the project.

## Node.js type stripping and its limits

Node.js 24 runs `.ts` files directly. It does it by **type stripping**: it replaces every piece of type syntax with spaces, so line and column numbers stay the same, and runs what is left. It is quick, and there is no `dist` folder. It also has hard limits, and each one is a way to get bitten.

### 1. It never checks types

You saw it in the first section: `node refund.ts` printed `500050`. Stripping only needs to know where the types are, not whether they are right.

### 2. Erasable syntax only

Node refuses anything that would need generated code, with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Turn on `erasableSyntaxOnly` in `tsconfig.json` and `tsc` reports these at check time instead of Node reporting them at startup.

### 3. A type-only import must say so

Node strips files one at a time. When it sees `import { Transfer } from "./types.ts"`, it cannot know that `Transfer` is only an interface in the other file, so it keeps the import, and the program dies at startup:

Terminal on your computer

```bash
$ node main.ts
file:///home/you/ts-tasks/main.ts:1
import { Transfer } from "./types.ts";
         ^^^^^^^^
SyntaxError: The requested module './types.ts' does not provide an export named 'Transfer'
```

Writing `import type { Transfer }` tells every tool that the whole import can be deleted. The `verbatimModuleSyntax` setting from [your tsconfig](https://zudojs.oyinlola.site/learn/ts-setup#tsconfig) makes `tsc` insist on it (error TS1484), so this bug is caught by the checker before Node ever sees it. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#import-type) covers `import type` fully.

### 4. Imports must name the real file

Node does not guess file names: the import must say `./fees.ts`, the file that exists on disk. `tsc` refuses `.ts` in an import path unless you allow it, because the emitted JavaScript would then point at a `.ts` file. Two settings solve both sides: `allowImportingTsExtensions` lets you write `.ts`, and `rewriteRelativeImportExtensions` makes `tsc` turn `./fees.ts` into `./fees.js` when it does emit. Here is a `tsconfig.json` for a project that runs with plain `node`:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true
  }
}
```

fees.ts

```ts
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export function transferFee(amount: number): number {
  if (amount <= 5000) return 10;
  if (amount <= 50000) return 25;
  return 50;
}
```

main.ts

```ts
import { transferFee, type Transfer } from "./fees.ts";

const transfer: Transfer = { from: "Ada", to: "Bola", amount: 20000 };
console.log(`${transfer.from} -> ${transfer.to}: fee ₦${transferFee(transfer.amount)}`);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
Ada -> Bola: fee ₦25
```

Terminal on your computer

```bash
$ npx tsc --noEmit
$ node main.ts
Ada -> Bola: fee ₦25
```

### 5. It ignores tsconfig.json, and node_modules

Node does not read `tsconfig.json` at all: `paths`, `target` and every other setting have no effect on `node file.ts`. And it refuses to strip `.ts` files inside `node_modules`, so a package must be published as JavaScript. That is one more reason libraries compile with `tsc` and ship `.js` plus `.d.ts`.

|  | `tsc` | `tsx` | `node file.ts` |
| --- | --- | --- | --- |
| Checks types | Yes | No | No |
| Enums, namespaces, parameter properties | Yes | Yes | No |
| Reads tsconfig.json | Yes | Partly (for example `paths`) | No |
| Import path for fees.ts | `./fees.js`, or `./fees.ts` with the settings above | Either | `./fees.ts` |
| Writes files | Yes, unless `noEmit` | No | No |

## Package scripts that really check

The refund bug shipped because checking was something people *could* do, not something that *had* to happen. Package scripts fix that. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#scripts) adds a simpler set to a multi-file project later in this course; here is one for a project that runs with Node's type stripping in development and ships compiled JavaScript:

package.json

```json
{
  "name": "bank-transfers",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/main.ts",
    "check": "tsc --noEmit",
    "check:watch": "tsc --noEmit --watch",
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "verify": "npm run check && npm test && npm run build",
    "start": "node --enable-source-maps dist/main.js"
  }
}
```

- `dev` restarts the program whenever a file changes (`node --watch`). Fast, and it checks nothing.
- `check` and `check:watch` are the only scripts that find type errors.
- `build` uses a second config file, `tsconfig.build.json`, which extends the main one and switches `noEmit` off, with `outDir`, `noEmitOnError` and `sourceMap` on.
- `verify` chains the steps with `&&`, which runs the next command only when the previous one exited with `0`. A type error stops everything before the tests and the build.

Your CI (the server that runs checks on every push, which you will set up in [Deploying a ZudoJS app](https://zudojs.oyinlola.site/learn/deployment)) runs `npm run verify`. Now the type check is not a habit; it is a gate.

## Why a program that compiles still needs runtime checks

REASON IT OUT

### Before you trust a green check

Your transfer service passes `npm run verify` with zero errors. It reads a daily transfer limit from the environment and refuses transfers above it. Before you look at the code, think:

1. What does `tsc` know about the value of an environment variable?
2. If the limit is set to `5O000` (with a letter O) by mistake, what number does `Number("5O000")` give?
3. What does `amount > limit` give when `limit` is that number?
4. Which of those mistakes could the compiler possibly catch?

**Show the reasoning**

1. Only its type: `string | undefined`. It cannot know the text, because that text is set on the server, long after compiling.
2. `NaN`, "not a number". Its *type* is still `number`, so every annotation is satisfied.
3. `false`, for every amount. Every comparison with `NaN` is `false`. So "is the amount above the limit?" says no to ₦10,000,000.
4. None of them. The code is type-correct. The bug is in the data. Only a runtime check, written by you, can refuse a limit that is not a sensible positive number.

Here is that code. It compiles cleanly:

limit.ts

```ts
const env: Record<string, string | undefined> = { TRANSFER_LIMIT: "5O000" };

const limit: number = Number(env.TRANSFER_LIMIT);

function allowed(amount: number): boolean {
  return !(amount > limit);
}

console.log("limit:", limit);
console.log("₦10,000,000 allowed?", allowed(10_000_000));
```

Output of `npx tsx limit.ts` and of the browser terminal

```ts
limit: NaN
₦10,000,000 allowed? true
```

(The `env` object stands in for `process.env`, which has the same type, so the example also runs in the browser terminal.) Written as `!(amount > limit)`, "not above the limit", the check fails *open*: when the limit is broken, everything is allowed. Types could not help, because `NaN` is a perfectly good `number`.

The fix is a runtime check at the place where outside data enters, which stops the program loudly instead of running with nonsense:

limit.ts

```ts
function readLimit(raw: string | undefined): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isInteger(value) || value <= 0) {
    throw new Error(`TRANSFER_LIMIT must be a positive whole number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

for (const raw of ["50000", "5O000", undefined, "-1"]) {
  try {
    console.log("limit:", readLimit(raw));
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx limit.ts` and of the browser terminal

```ts
limit: 50000
Error: TRANSFER_LIMIT must be a positive whole number, got "5O000"
Error: TRANSFER_LIMIT must be a positive whole number, got undefined
Error: TRANSFER_LIMIT must be a positive whole number, got "-1"
```

This is the general rule for the rest of the course: **types check your code; runtime checks check your data.** Environment variables, request bodies, database rows, files and replies from other services are all data. [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime) and [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) build proper tools for it.

## Testing your types

Tests usually run code and compare results. Types need a different kind of test: "this call must *not* compile". The `// @ts-expect-error` comment does that. It tells `tsc` that the next line must contain a type error. If it does, the error is silenced. If it does *not*, that is reported as an error:

fee.types.ts

```ts
function transferFee(amount: number): number {
  if (amount <= 5000) return 10;
  if (amount <= 50000) return 25;
  return 50;
}

// @ts-expect-error: a fee is worked out from a number, never from text
transferFee("2500");

// @ts-expect-error: the amount is required
transferFee();

// @ts-expect-error: the result is a number, not a string
const label: string = transferFee(2500) + " naira";
```

What `npx tsc --noEmit` prints

```ts
fee.types.ts:13:1 - error TS2578: Unused '@ts-expect-error' directive.

13 // @ts-expect-error: the result is a number, not a string
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in fee.types.ts:13
```

The first two expectations hold, so they are silent. The third is wrong: `number + " naira"` is a `string`, so the line compiles, and `tsc` reports that the directive is unused. Delete that test (it tested the wrong thing), and the file passes. Files like this, run by `npm run check`, stop someone from quietly loosening a type, for example changing `amount: number` to `amount: any`.

> EXPECT-ERROR, NOT IGNORE
>
> There is also `// @ts-ignore`, which silences the next line's errors whether there are any or not, and keeps silencing them forever. Use `@ts-expect-error` in type tests, and neither in normal code.

## In production

- **Check in CI, every time.** `tsc --noEmit` is the only step that finds type errors. Make it a required step, as in the `verify` script.
- **Build once, run JavaScript.** Compile in CI with `noEmitOnError`, and deploy the `dist` folder. The server then runs exactly the files that passed the checks, and nothing has to strip types while it starts.
- **Keep source maps on.** Emit `.js.map` files and start Node with `--enable-source-maps`, so stack traces in your logs point at `.ts` lines.
- **Prefer erasable syntax.** `erasableSyntaxOnly` keeps every runner (tsc, tsx, Node, bundlers) producing the same code.
- **Speed matters less than it did.** TypeScript 7's native compiler checks large projects many times faster than earlier versions, so "the check is too slow for CI" is rarely true any more.
- **Validate at the edges.** A green check says your code is consistent with itself. It says nothing about the data that will arrive.

## Practice

TRY IT YOURSELF

### Predict the emitted JavaScript

Without running anything, write down what `tsc` emits for this file with `"target": "ES2024"`. Then compile it and compare.

fees.ts

```ts
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}
```

booking.ts

```ts
import type { Transfer } from "./fees.js";

interface Booking {
  readonly id: number;
  guest: string;
  nights: number;
}

const RATE = 25000;

export function quote(booking: Booking, extras: number[] = []): number {
  const base = booking.nights * RATE;
  return extras.reduce<number>((sum, x) => sum + x, base);
}

console.log(quote({ id: 1, guest: "Ada", nights: 2 }, [5000]) as number);
```

Output of `npx tsx booking.ts` and of the browser terminal

```ts
55000
```

**Show a solution**

dist/booking.js

```ts
const RATE = 25000;
export function quote(booking, extras = []) {
    const base = booking.nights * RATE;
    return extras.reduce((sum, x) => sum + x, base);
}
console.log(quote({ id: 1, guest: "Ada", nights: 2 }, [5000]));
```

The whole `import type` line goes, and so do the interface (including `readonly`), the annotations, the `<number>` type argument on `reduce`, and `as number`. The default `= []` stays, because it is JavaScript. Nothing is added, because nothing in the file needs generated code.

TRY IT YOURSELF

### Make it run under node file.ts

This file works with `tsx` but not with `node`, and `erasableSyntaxOnly` reports three errors in it. Rewrite it so that it is erasable and prints the same line.

```ts
enum Status { Pending = "pending", Settled = "settled" }

class Ledger {
  constructor(private readonly owner: string, private status: Status = Status.Pending) {}
  settle(): string {
    this.status = Status.Settled;
    return `${this.owner}: ${this.status}`;
  }
}

console.log(new Ledger("Ada").settle());
```

**Show a solution**

ledger.ts

```ts
const Status = { Pending: "pending", Settled: "settled" } as const;
type Status = (typeof Status)[keyof typeof Status];

class Ledger {
  private readonly owner: string;
  private status: Status;

  constructor(owner: string, status: Status = Status.Pending) {
    this.owner = owner;
    this.status = status;
  }

  settle(): string {
    this.status = Status.Settled;
    return `${this.owner}: ${this.status}`;
  }
}

console.log(new Ledger("Ada").settle());
```

Output of `npx tsx ledger.ts` and of the browser terminal

```ts
Ada: settled
```

The enum becomes a `const` object plus a type with the same name (a value and a type may share a name, because they live in different worlds). The two parameter properties become declared fields assigned in the constructor. A simple union, `type Status = "pending" | "settled"`, would also work if you do not need `Status.Pending` as a value.

TRY IT YOURSELF

### A config reader that fails closed

Write `readConfig(env)` that takes a `Record<string, string | undefined>` and returns `{ limit: number; feePercent: number }`. `TRANSFER_LIMIT` must be a positive whole number. `FEE_PERCENT` is optional (default `0.5`) and must be between 0 and 5. Collect every problem and throw one error listing them all.

**Show a solution**

config.ts

```ts
interface Config {
  limit: number;
  feePercent: number;
}

function readConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = [];
  const limit = Number(env.TRANSFER_LIMIT);
  if (!Number.isInteger(limit) || limit <= 0) problems.push("TRANSFER_LIMIT must be a positive whole number");
  const feePercent = env.FEE_PERCENT === undefined ? 0.5 : Number(env.FEE_PERCENT);
  if (Number.isNaN(feePercent) || feePercent < 0 || feePercent > 5) problems.push("FEE_PERCENT must be between 0 and 5");
  if (problems.length > 0) throw new Error(problems.join("; "));
  return { limit, feePercent };
}

console.log(readConfig({ TRANSFER_LIMIT: "50000" }));
try {
  readConfig({ TRANSFER_LIMIT: "5O000", FEE_PERCENT: "12" });
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx config.ts` and of the browser terminal

```json
{ limit: 50000, feePercent: 0.5 }
Error: TRANSFER_LIMIT must be a positive whole number; FEE_PERCENT must be between 0 and 5
```

`Number(undefined)` is `NaN`, so a missing limit fails the `isInteger` check without a separate test. Reporting every problem at once saves the person deploying from fixing one variable, restarting, and finding the next.

## Recap

- TypeScript is a superset of JavaScript's *syntax*. Valid JavaScript can still fail the type check.
- `tsc` parses, checks and emits. Emitting does not depend on checking: without `noEmitOnError`, broken code is still written (exit code 2).
- Type erasure removes interfaces, type aliases, annotations, generics, `as`, `!`, `satisfies` and `import type`. None of them check anything at runtime. Values can produce types; types cannot produce values.
- `enum`, `namespace` and parameter properties generate code. `erasableSyntaxOnly` bans them.
- `target` transpiles syntax to older JavaScript; `declaration` writes `.d.ts`; `sourceMap` maps stack traces back to `.ts`; `--watch` re-checks on save.
- `node file.ts` strips types without checking, needs erasable syntax, `import type` and real `.ts` paths, and ignores `tsconfig.json`.
- Put `tsc --noEmit` in a script that CI must pass. And validate outside data at runtime, because a compiled program knows nothing about it.

Next: [Basic types](https://zudojs.oyinlola.site/learn/ts-types), the everyday types you will write in every file.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
