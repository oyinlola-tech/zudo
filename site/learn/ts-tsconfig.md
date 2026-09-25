---
title: "tsconfig in depth — ZudoJS Academy"
description: "Learn what every important tsconfig.json option changes, from target, lib and module to each strict flag and verbatimModuleSyntax, with a real tsc run for each."
source: https://zudojs.oyinlola.site/learn/ts-tsconfig
---

LEVEL 5 · LESSON 19 OF 23

Classes, modules and configuration Foundation

# tsconfig in depth

Learn what every important tsconfig.json option changes, from target, lib and module to each strict flag and verbatimModuleSyntax, with a real tsc run for each.

- **60 min** to read and try
- **You need:** What the TypeScript compiler does, and Modules in TypeScript
- **You build:** A checked, documented tsconfig for a Node.js 24 backend, plus proof of what each setting catches or emits

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read a tsconfig.json and say what each option changes in checking or in output
- Choose target, lib, types, module and moduleResolution for Node.js, a bundler or a library
- Explain each flag that strict turns on and the runtime bug it prevents
- Turn on noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitOverride and fix what they report
- Lay out src and dist with rootDir, outDir and include, and avoid the paths alias trap
- Verify a configuration with tsc --showConfig and share it with extends

## The crash that tsc allowed

A shop's API crashed at 2 a.m. with `TypeError: Cannot read properties of undefined (reading 'totalKobo')`. The code was TypeScript, it compiled without a single error, and it had been reviewed. Here is the line:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

latest.ts

```ts
type Order = { id: number; totalKobo: number };

function latestOrderTotal(orders: Order[]): number {
  const latest = orders[orders.length - 1];
  return latest.totalKobo;
}

console.log(latestOrderTotal([{ id: 1041, totalKobo: 1700000 }]));
try {
  console.log(latestOrderTotal([]));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx latest.ts` and of the browser terminal

```ts
1700000
TypeError: Cannot read properties of undefined (reading 'totalKobo')
```

With `"strict": true`, TypeScript still believes that `orders[orders.length - 1]` is an `Order`. For an empty list it is `undefined`. One more line in `tsconfig.json`, `"noUncheckedIndexedAccess": true`, would have turned this crash into a compile error. Which bugs `tsc` can catch is not fixed: **your configuration decides it**.

[Your first tsconfig](https://zudojs.oyinlola.site/learn/ts-setup#tsconfig) used eight options, and [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler) showed what emitting, `target`, declarations and source maps do. This lesson goes through every option you will meet in a real project. For each one you will see the problem it exists for, and a real `tsc` run showing what it changes. All runs use TypeScript 7.

## How tsc reads tsconfig.json

When you run `tsc` (or `tsc --noEmit`) without file names, it looks for `tsconfig.json` in the current folder and reads three things from it:

- **`compilerOptions`**: how to check and what to emit. Almost everything in this lesson lives here.
- **Which files**: `include` (glob patterns, default `["**/*"]`: every `.ts` file below the folder), `exclude` (default: `node_modules` and `outDir`), or an explicit `files` list. Files you `import` are always included too.
- **`extends`**: another config file to start from, covered at the end.

Options given on the command line override the file: `tsc --noEmit false --outDir dist` emits even if the file says `"noEmit": true`. When you are unsure what is actually in effect, `tsc --showConfig` prints the final, merged configuration without compiling anything. You will use it below.

### Defaults changed in TypeScript 7

An option you do not write takes its default, and TypeScript 7 changed several defaults. `npx tsc --init` writes a starter file that shows the current recommendations:

Terminal (a real run, TypeScript 7.0)

```bash
$ npx tsc --init
Created a new tsconfig.json

You can learn more at https://aka.ms/tsconfig
$ cat tsconfig.json
{
  // Visit https://aka.ms/tsconfig to read more about this file
  "compilerOptions": {
    // File Layout
    // "rootDir": "./src",
    // "outDir": "./dist",

    // Environment Settings
    // See also https://aka.ms/tsconfig/module
    "module": "nodenext",
    "target": "esnext",
    "types": [],
    // For nodejs:
    // "lib": ["esnext"],
    // "types": ["node"],
    // and npm install -D @types/node

    // Other Outputs
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    // Stricter Typechecking Options
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    // Style Options
    // "noImplicitReturns": true,
    // "noImplicitOverride": true,
    // "noUnusedLocals": true,
    // "noUnusedParameters": true,
    // "noFallthroughCasesInSwitch": true,
    // "noPropertyAccessFromIndexSignature": true,

    // Recommended Options
    "strict": true,
    "jsx": "react-jsx",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
  }
}
```

(`tsconfig.json` allows comments and trailing commas, unlike plain JSON.) The defaults that matter most in TypeScript 7:

| Option | Default in TypeScript 7 | Older default |
| --- | --- | --- |
| `strict` | `true` | `false` |
| `target` | `es2025` | `es5` (no longer supported at all) |
| `types` | `[]`: no `@types` package is loaded unless listed | every package in `node_modules/@types` |
| `moduleResolution` | `nodenext` with `"module": "nodenext"`, otherwise `bundler` | `node10` (removed) |
| `esModuleInterop`, `alwaysStrict` | `true` | `false` |

Still write `"strict": true` explicitly. Editors, linters and test tools may run an older TypeScript version against the same file, and an explicit line means the same thing to all of them.

## Before you configure: describe the project

A tsconfig is a description of your project written as options. Copying one from another project copies *its* answers. Answer the questions first, then each option follows.

REASON IT OUT

### Five questions about the shop's order API

The shop is building an order API. It runs on Node.js 24 on a Linux server, is built into `dist/` for production, runs with `tsx` in development, and a few old helper files are still JavaScript. For each question, decide what the answer means for the configuration:

- Which JavaScript engine runs the code, and which syntax and built-in functions does it support?
- Which program resolves the `import` statements at runtime: Node.js, or a bundler?
- Is there any browser in the picture? What would happen if code used `document` by mistake?
- Which values can be missing at runtime (array items, record lookups, optional fields from forms, caught errors), and should the compiler force you to handle them?
- Will anyone import this code as a library, or read its stack traces in production?

**Show the reasoning**

**Engine:** Node.js 24 runs ES2024 natively, so `"target": "ES2024"` and `"lib": ["ES2024"]`, plus `"types": ["node"]` for `process` and `node:fs`.

**Resolution:** Node.js itself resolves imports in production, so `"module"` and `"moduleResolution"` are `NodeNext`, and import aliases must be ones Node.js understands.

**No browser:** leave `DOM` out of `lib`, so a mistaken `document` or `localStorage` fails at compile time instead of at runtime.

**Missing values:** all of them can be missing, and the 2 a.m. crash was one. `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

**Outputs:** nobody imports it as a library, so no `declaration`; production stack traces matter, so `sourceMap`; built output goes from `src` to `dist` (`rootDir`, `outDir`, `include`); the old JavaScript files need `allowJs` until they are converted. Every one of those options is explained below, with a run that shows what it changes.

## Where the code runs: target, lib and types

Three options describe the environment your code will run in. `target` is about *syntax*, `lib` about built-in *JavaScript and browser APIs*, `types` about extra *global type packages* such as Node.js's.

### target: which syntax to emit

`target` is the JavaScript version `tsc` writes. Syntax newer than the target is rewritten into older syntax. [The compiler lesson](https://zudojs.oyinlola.site/learn/ts-compiler#target) showed `?.` being rewritten for ES2019. Here is a stock counter that uses `??=` (logical assignment, ES2021), compiled for ES2020:

stock.ts

```ts
const stock: Record<string, number> = {};

export function reserve(sku: string, quantity: number): number {
  stock[sku] ??= 10;
  stock[sku] -= quantity;
  return stock[sku];
}
```

dist/stock.js

```ts
const stock = {};
export function reserve(sku, quantity) {
    stock[sku] ?? (stock[sku] = 10);
    stock[sku] -= quantity;
    return stock[sku];
}
```

For Node.js 24, use `ES2024`: everything runs as written, and stack traces match your code. The lowest target TypeScript 7 accepts is ES2015.

### lib: which built-in APIs exist

`target` never adds *functions*. If your code calls `Array.prototype.at` (ES2022) and the runtime lacks it, rewriting syntax cannot help. What TypeScript *believes* exists is controlled by `lib`, a list of built-in declaration files. If you leave `lib` out, it follows `target`:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

latest-order.ts

```ts
const orders = [{ id: 1041 }, { id: 1042 }];
console.log(orders.at(-1));
```

What `npx tsc --noEmit` prints

```ts
latest-order.ts:2:20 - error TS2550: Property 'at' does not exist on type '{ id: number; }[]'. Do you need to change your target library? Try changing the 'lib' compiler option to 'es2022' or later.

2 console.log(orders.at(-1));
                     ~~


Found 1 error in latest-order.ts:2
```

The error suggests the two honest fixes: raise the target, or add `"lib": ["ES2022"]` if you know your runtime has the function (or you load a polyfill, a script that adds a missing function). Never silence it with a cast; on an old runtime the call would crash.

There is a trap in the default. When `lib` is not written, TypeScript also includes `DOM`, the browser's types, because it assumes you might be in a browser. A Node.js server then compiles happily with code that cannot run there:

title.tsNode.js only

```ts
function pageTitle(): string {
  return document.title;
}

try {
  console.log(pageTitle());
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx title.ts`

```ts
ReferenceError: document is not defined
```

That compiled under this course's default configuration, which has no `lib`. Write `lib` explicitly for a backend, and the mistake is caught:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

title.ts

```ts
export function pageTitle(): string {
  return document.title;
}
```

What `npx tsc --noEmit` prints

```ts
title.ts:2:10 - error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.

2   return document.title;
           ~~~~~~~~


Found 1 error in title.ts:2
```

A browser app writes `"lib": ["ES2024", "DOM", "DOM.Iterable"]` instead. Code shared by both (validation, money formatting) is best checked against the smaller Node-only list, so it cannot use `window` by accident.

### types: which global type packages load

`process`, `Buffer` and `node:fs` are not part of any `lib`; they come from the `@types/node` package. In TypeScript 7, `types` defaults to an empty list, so nothing from `node_modules/@types` is loaded unless you name it:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true
  }
}
```

port.ts

```ts
export const port = Number(process.env.PORT ?? 3000);
```

What `npx tsc --noEmit` prints

```ts
port.ts:1:28 - error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.

1 export const port = Number(process.env.PORT ?? 3000);
                             ~~~~~~~


Found 1 error in port.ts:1
```

The fix is the one the message gives: `npm i -D @types/node` and `"types": ["node"]`. An explicit list is also a safety feature: a test library's global `describe` and `it` types do not leak into your application code unless you list them.

## Modules: module and moduleResolution

Two options decide how `import` works. `moduleResolution` is how `tsc` *finds* the file behind an import path. `module` is which module format it *emits*.

| Value | Use it for | Rules |
| --- | --- | --- |
| `NodeNext` (both options) | Code that Node.js runs | Node's own rules: relative imports need the `.js` extension, `package.json` `"exports"` and `"imports"` are respected, and `"type"` decides ESM or CommonJS per file |
| `"module": "preserve"` + `"moduleResolution": "bundler"` | Code a bundler (Vite, esbuild) or `tsx` processes | Extensionless imports allowed; imports are written out unchanged |
| `"module": "ESNext"` / `"CommonJS"` | Special cases | Force one output format regardless of `package.json` |

Under `NodeNext`, the output format follows the nearest `package.json`, exactly as Node.js does at runtime. Here is the same pair of files in two projects. The first has `"type": "module"`:

fees.ts

```ts
export function transferFeeKobo(amountKobo: number): number {
  return Math.min(Math.round(amountKobo * 0.015), 200000);
}
```

main.ts

```ts
import { transferFeeKobo } from "./fees.js";

console.log(transferFeeKobo(500000));
```

dist/main.js

```ts
import { transferFeeKobo } from "./fees.js";
console.log(transferFeeKobo(500000));
```

The second project's `package.json` says `"type": "commonjs"`, and its tsconfig leaves out `verbatimModuleSyntax` (with it, `tsc` refuses to turn `import` into `require` at all, error TS1295, because the output would no longer be "verbatim"). Not a letter of the TypeScript changed:

package.json

```json
{ "type": "commonjs" }
```

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

fees.ts

```ts
export function transferFeeKobo(amountKobo: number): number {
  return Math.min(Math.round(amountKobo * 0.015), 200000);
}
```

main.ts

```ts
import { transferFeeKobo } from "./fees.js";

console.log(transferFeeKobo(500000));
```

dist/main.js

```ts
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fees_js_1 = require("./fees.js");
console.log((0, fees_js_1.transferFeeKobo)(500000));
```

Now the output is CommonJS: `require` instead of `import`, `exports.x` instead of `export`. The `"use strict"` at the top comes from `alwaysStrict` (on by default): CommonJS files are not in strict mode unless they say so, and ES modules always are. If `module` and the runtime disagree, you get errors like "require is not defined in ES module scope" at startup, which is why `NodeNext`, which reads the same `package.json` Node.js reads, is the right choice for Node code. [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems) covers ESM and CommonJS in depth, and [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#resolution) the resolution rules.

## strict and every flag it turns on

`"strict": true` is a shorthand for a family of checks. Each one closes a hole through which a specific kind of runtime bug gets past the compiler. To see the holes, here is a project with `"strict": false`. Everything below compiles without an error:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": false,
    "noEmit": true,
    "types": ["node"]
  }
}
```

loose.ts

```ts
const orders: { id: number; totalKobo: number }[] = [{ id: 1041, totalKobo: 1700000 }];

function findOrder(id: number) {
  return orders.find((order) => order.id === id);
}

function addDelivery(subtotal, fee) {
  return subtotal + fee;
}

class Wallet {
  balanceKobo: number;
  deposit(kobo: number) {
    this.balanceKobo += kobo;
  }
}

function parseSettings(text: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error.mesage;
  }
}

const checks = [
  () => findOrder(9999).totalKobo,
  () => addDelivery(1765000, "150000"),
  () => {
    const wallet = new Wallet();
    wallet.deposit(5000);
    return wallet.balanceKobo;
  },
  () => parseSettings("{"),
];

for (const check of checks) {
  try {
    console.log(check());
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `npx tsx loose.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'totalKobo')
1765000150000
NaN
undefined
```

A crash, a delivery fee glued onto a total, a balance of `NaN`, and a typo (`mesage`) that silently returns `undefined`. Now the same kinds of code with `"strict": true`, one flag at a time. All the examples below use this configuration:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

### noImplicitAny

Without a type, a parameter silently becomes `any`, which switches off checking for everything it touches. `noImplicitAny` makes you say what it is:

implicit-any.ts

```ts
export function addDelivery(subtotal, fee: number) {
  return subtotal + fee;
}
```

What `npx tsc --noEmit` prints

```ts
implicit-any.ts:1:29 - error TS7006: Parameter 'subtotal' implicitly has an 'any' type.

1 export function addDelivery(subtotal, fee: number) {
                              ~~~~~~~~


Found 1 error in implicit-any.ts:1
```

### strictNullChecks

The most important flag. Without it, `null` and `undefined` are allowed everywhere, so a value "might be missing" is invisible to the compiler. With it, `find` returns `Order | undefined` and you must handle the missing case:

null-checks.ts

```ts
const orders = [{ id: 1041, totalKobo: 1700000 }];

export function orderTotal(id: number): number {
  const order = orders.find((o) => o.id === id);
  return order.totalKobo;
}
```

What `npx tsc --noEmit` prints

```ts
null-checks.ts:5:10 - error TS18048: 'order' is possibly 'undefined'.

5   return order.totalKobo;
           ~~~~~


Found 1 error in null-checks.ts:5
```

### strictFunctionTypes

A function that needs a *card* payment cannot stand in for a function that accepts *any* payment: someone will call it with a bank transfer. This flag checks function parameters properly when functions are assigned:

function-types.ts

```ts
type Payment = { amountKobo: number };
type CardPayment = Payment & { cardLast4: string };
type PaymentHandler = (payment: Payment) => void;

const logCard = (payment: CardPayment) => console.log(payment.cardLast4.padStart(8, "*"));
export const onPayment: PaymentHandler = logCard;
```

What `npx tsc --noEmit` prints

```ts
function-types.ts:6:14 - error TS2322: Type '(payment: CardPayment) => void' is not assignable to type 'PaymentHandler'.
  Types of parameters 'payment' and 'payment' are incompatible.
    Type 'Payment' is not assignable to type 'CardPayment'.
      Property 'cardLast4' is missing in type 'Payment' but required in type '{ cardLast4: string; }'.

6 export const onPayment: PaymentHandler = logCard;
               ~~~~~~~~~

  function-types.ts:2:32 - 'cardLast4' is declared here.
    2 type CardPayment = Payment & { cardLast4: string };
                                     ~~~~~~~~~


Found 1 error in function-types.ts:6
```

Without the flag, the assignment is allowed, and `onPayment({ amountKobo: 5000 })` crashes inside `logCard` on `undefined.padStart`. (Methods declared with method syntax in an interface are still checked the loose way, for compatibility; [The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system), in the Advanced TypeScript course, explains why.)

### strictBindCallApply

`call`, `apply` and `bind` call a function indirectly ([call, apply and bind](https://zudojs.oyinlola.site/learn/js-this#explicit)). Without this flag their arguments are not checked at all:

bind-call.ts

```ts
function transfer(from: string, amountKobo: number) {
  return `${from} sends ${amountKobo}`;
}

export const result = transfer.call(null, "ada", "5000");
```

What `npx tsc --noEmit` prints

```ts
bind-call.ts:5:50 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

5 export const result = transfer.call(null, "ada", "5000");
                                                   ~~~~~~


Found 1 error in bind-call.ts:5
```

### strictPropertyInitialization

A class field declared with a type but never given a value is `undefined` at runtime, whatever its type says. This flag demands a value, either where it is declared or in the constructor:

property-init.ts

```ts
export class Wallet {
  owner: string;
  balanceKobo: number;

  constructor(owner: string) {
    this.owner = owner;
  }
}
```

What `npx tsc --noEmit` prints

```ts
property-init.ts:3:3 - error TS2564: Property 'balanceKobo' has no initializer and is not definitely assigned in the constructor.

3   balanceKobo: number;
    ~~~~~~~~~~~


Found 1 error in property-init.ts:3
```

The fix is `balanceKobo = 0;`. If a framework really does set the field later, `balanceKobo!: number;` (a definite assignment assertion) says "trust me", with the risks of any assertion ([the non-null assertion](https://zudojs.oyinlola.site/learn/ts-assertions#non-null)).

### noImplicitThis

A plain function that uses `this` gets whatever the caller provides ([this is decided by the call](https://zudojs.oyinlola.site/learn/js-this#rule)). Without a declared type, `this` is `any`:

implicit-this.ts

```ts
export function describeWallet() {
  return `Wallet of ${this.owner}`;
}
```

What `npx tsc --noEmit` prints

```ts
implicit-this.ts:2:23 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

2   return `Wallet of ${this.owner}`;
                        ~~~~

  implicit-this.ts:1:17 - An outer value of 'this' is shadowed by this container.
    1 export function describeWallet() {
                      ~~~~~~~~~~~~~~


Found 1 error in implicit-this.ts:2
```

Either make it a method, or declare the type as a fake first parameter: `function describeWallet(this: { owner: string })`. The `this` parameter is erased from the JavaScript.

### useUnknownInCatchVariables

Anything can be thrown, not only `Error` objects, so the variable in `catch` should be `unknown`, not `any`. Then you must check what it is before using it, and a typo like `mesage` cannot slip through:

catch-unknown.ts

```ts
export function parseSettings(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error.message;
  }
}
```

What `npx tsc --noEmit` prints

```ts
catch-unknown.ts:5:12 - error TS18046: 'error' is of type 'unknown'.

5     return error.message;
             ~~~~~


Found 1 error in catch-unknown.ts:5
```

Narrow first: `error instanceof Error ? error.message : String(error)` ([instanceof narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#in-instanceof)).

### strictBuiltinIteratorReturn

The newest member of the family. When an iterator is finished, its `value` is `undefined`, not an item. This flag types it that way instead of as `any`:

iterator-return.ts

```ts
const skus = new Set(["RICE-5", "EGG-30"]).values();
const step = skus.next();
if (step.done) {
  console.log(step.value.toUpperCase());
}
```

What `npx tsc --noEmit` prints

```ts
iterator-return.ts:4:15 - error TS18048: 'step.value' is possibly 'undefined'.

4   console.log(step.value.toUpperCase());
                ~~~~~~~~~~


Found 1 error in iterator-return.ts:4
```

### alwaysStrict

The last member is not a type check: it emits `"use strict"` at the top of every non-module file and parses them in strict mode. You saw it in the [CommonJS output](#modules). ES modules are always strict, so in an ESM project it changes nothing.

### Switching one flag off

Every flag can be overridden after `strict`, which is how a large JavaScript codebase is migrated one flag at a time:

tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "strictPropertyInitialization": false
  }
}
```

Everything strict except that one check. Turn it back on when the errors it reports are fixed; count them with `npx tsc --noEmit --strictPropertyInitialization true | grep -c "error TS"` to see how far there is to go.

## Stricter than strict

Some checks are not part of `strict`, because turning them on in an existing codebase produces many errors. For new code, turn them on from the start. The `tsc --init` file above already enables the first two. All three are on in this project:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

### noUncheckedIndexedAccess

This is the flag that would have caught the 2 a.m. crash. An index into an array (`orders[0]`) or a record (`prices[sku]`) can miss, so its type gets `| undefined`:

indexed.ts

```ts
type Order = { id: number; totalKobo: number };

export function latestOrderTotal(orders: Order[]): number {
  const latest = orders[orders.length - 1];
  return latest.totalKobo;
}

const prices: Record<string, number> = { "RICE-5": 850000 };
export const riceNaira = prices["RICE-50"] / 100;
```

What `npx tsc --noEmit` prints

```ts
indexed.ts:5:10 - error TS18048: 'latest' is possibly 'undefined'.

5   return latest.totalKobo;
           ~~~~~~

indexed.ts:9:26 - error TS2532: Object is possibly 'undefined'.

9 export const riceNaira = prices["RICE-50"] / 100;
                           ~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: indexed.ts:5
```

The fixes make the missing case explicit, and TypeScript narrows after the check:

indexed-fixed.ts

```ts
type Order = { id: number; totalKobo: number };

function latestOrderTotal(orders: Order[]): number {
  const latest = orders.at(-1);
  if (latest === undefined) return 0;
  return latest.totalKobo;
}

for (const order of [{ id: 1041, totalKobo: 1700000 }]) {
  console.log(order.totalKobo);
}
console.log(latestOrderTotal([]), latestOrderTotal([{ id: 1041, totalKobo: 1700000 }]));
```

Output of `npx tsx indexed-fixed.ts` and of the browser terminal

```ts
1700000
0 1700000
```

A `for...of` loop is not affected: each `order` really exists. The flag only complains where a lookup can actually miss.

### exactOptionalPropertyTypes

By default, `phone?: string` means "missing *or* `undefined`". Those are different at runtime. A property set to `undefined` exists: it shows up in `Object.keys`, in `"phone" in profile`, and it *overwrites* when you spread. Here is a profile update in the strict (but not "exact") project:

patch.ts

```ts
type ProfilePatch = { name?: string; phone?: string };

const stored = { name: "Ada", phone: "0803 555 0142" };
const fromForm: ProfilePatch = { name: "Ada Obi", phone: undefined };

const updated = { ...stored, ...fromForm };
console.log(updated);
```

Output of `npx tsx patch.ts` and of the browser terminal

```json
{ name: 'Ada Obi', phone: undefined }
```

The customer only changed their name, and their phone number is gone. With `exactOptionalPropertyTypes`, an optional property may be missing, but may not be set to `undefined` unless the type says so:

patch.ts

```ts
type ProfilePatch = { name?: string; phone?: string };

const form = { name: "Ada Obi", phone: undefined as string | undefined };
export const patch: ProfilePatch = { name: form.name, phone: form.phone };
```

What `npx tsc --noEmit` prints

```ts
patch.ts:4:14 - error TS2375: Type '{ name: string; phone: string | undefined; }' is not assignable to type 'ProfilePatch' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Types of property 'phone' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.

4 export const patch: ProfilePatch = { name: form.name, phone: form.phone };
               ~~~~~


Found 1 error in patch.ts:4
```

Build the patch with only the fields that are present (`...(form.phone !== undefined && { phone: form.phone })`), or write `phone?: string | undefined` when "explicitly cleared" is a real, separate meaning.

### noImplicitOverride

When a subclass method has the same name as a base-class method, it replaces it. That can happen by accident, and if the base method is later renamed, the subclass method silently stops overriding anything. This flag makes overriding explicit with the `override` keyword:

override.ts

```ts
class Account {
  close(): string {
    return "closed";
  }
}

export class SavingsAccount extends Account {
  close(): string {
    return "closed, interest paid";
  }
}
```

What `npx tsc --noEmit` prints

```ts
override.ts:8:3 - error TS4114: This member must have an 'override' modifier because it overrides a member in the base class 'Account'.

8   close(): string {
    ~~~~~


Found 1 error in override.ts:8
```

Write `override close()`. From then on, if `Account.close` is renamed, `tsc` reports that `SavingsAccount.close` no longer overrides anything, instead of leaving a dead method behind. [Object-oriented TypeScript](https://zudojs.oyinlola.site/learn/ts-oop#inheritance), in the Advanced TypeScript course, covers `override` with inheritance.

Other checks worth knowing, all off by default: `noImplicitReturns` (every code path of a function returns), `noFallthroughCasesInSwitch` (no forgotten `break`), `noUnusedLocals` and `noUnusedParameters` (often left to a linter instead), and `noPropertyAccessFromIndexSignature` (write `prices["RICE-5"]`, not `prices.RICE5`, for keys that may not exist).

## JavaScript files: allowJs and checkJs

Real projects move to TypeScript gradually, so some files stay JavaScript for a while. By default, `tsc` ignores `.js` files, and importing one from TypeScript gives you nothing to check against:

money.js

```ts
/**
 * @param {number} kobo
 * @returns {string}
 */
export function formatNaira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}
```

main.ts

```ts
import { formatNaira } from "./money.js";

console.log(formatNaira("850000"));
```

What `npx tsc --noEmit` prints

```ts
main.ts:1:29 - error TS7016: Could not find a declaration file for module './money.js'. '/home/you/ts-shop/money.js' implicitly has an 'any' type.

1 import { formatNaira } from "./money.js";
                              ~~~~~~~~~~~~


Found 1 error in main.ts:1
```

Under `strict`, an import with no types at all is an error (without `strict` it is silently `any`). **`allowJs`** makes `tsc` read `.js` files as part of the program. It then understands their exports, including the **JSDoc** type comments (`/** @param {number} kobo */`), and checks your TypeScript against them:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "allowJs": true
  }
}
```

money.js

```ts
/**
 * @param {number} kobo
 * @returns {string}
 */
export function formatNaira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}
```

main.ts

```ts
import { formatNaira } from "./money.js";

console.log(formatNaira("850000"));
```

What `npx tsc --noEmit` prints

```ts
main.ts:3:25 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

3 console.log(formatNaira("850000"));
                          ~~~~~~~~


Found 1 error in main.ts:3
```

The mistake in the TypeScript file is caught. Mistakes *inside* JavaScript files are still not reported. **`checkJs`** (which implies `allowJs`) type-checks the JavaScript files too, using inference and JSDoc:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "checkJs": true
  }
}
```

legacy-total.js

```ts
/** @param {{ priceKobo: number, quantity: number }[]} lines */
export function orderTotal(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}
```

What `npx tsc --noEmit` prints

```ts
legacy-total.js:3:49 - error TS2339: Property 'price' does not exist on type '{ priceKobo: number; quantity: number; }'.

3   return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
                                                  ~~~~~


Found 1 error in legacy-total.js:3
```

A typo that would make every total `NaN`, found in a JavaScript file. A common migration path: `allowJs` first, then `checkJs` (or `// @ts-check` at the top of individual files), then rename files to `.ts` one by one. When emitting, `allowJs` also copies the `.js` files to `outDir`, so the build output is complete.

## Output: outDir, rootDir, include, declaration, sourceMap

When `tsc` emits, `outDir` is where the `.js` files go, and `rootDir` is the folder whose structure is copied into it: `src/orders/total.ts` becomes `dist/orders/total.js` when `rootDir` is `src`. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#project) set up exactly that layout. Two surprises are worth seeing once. Here is a project with `"rootDir": "src"`, `"outDir": "dist"`, and a seed script someone added outside `src`:

Terminal (real runs, TypeScript 7)

```bash
$ ls src scripts
scripts:
seed.ts

src:
main.ts  orders
$ npx tsc
error TS6059: File '/home/you/shop/scripts/seed.ts' is not under 'rootDir' '/home/you/shop/src'. 'rootDir' is expected to contain all source files.
  The file is in the program because:
    Matched by default include pattern '**/*'
  File is ECMAScript module because '/home/you/shop/package.json' has field "type" with value "module"
```

The default `include` is every `.ts` file in the folder, so `scripts/seed.ts` is part of the program, and it is not inside `rootDir`. Now remove the `rootDir` line and build again:

Terminal (a real run)

```bash
$ npx tsc
$ find dist | sort
dist
dist/scripts
dist/scripts/seed.js
dist/src
dist/src/main.js
dist/src/orders
dist/src/orders/total.js
```

Without `rootDir`, TypeScript 7 uses the common folder of all input files, which is now the project root, so everything moves one level down into `dist/src/`, and a start script pointing at `dist/main.js` breaks. The fix for both: say what belongs to the program with `"include": ["src"]` and keep `"rootDir": "src"`. Scripts outside `src` get their own small config, or run directly with `tsx`.

### declaration, declarationMap and sourceMap

`declaration` writes a `.d.ts` file next to each `.js` file, for libraries that others import ([shown in the compiler lesson](https://zudojs.oyinlola.site/learn/ts-compiler#emit-files)). `declarationMap` adds maps so that "go to definition" in an editor jumps to your `.ts` source instead of the `.d.ts`. `sourceMap` writes a `.js.map` file and adds a comment to each `.js` file pointing at it:

refund.ts

```ts
export function refundKobo(paidKobo: number, usedKobo: number): number {
  if (usedKobo > paidKobo) throw new RangeError("Used more than was paid");
  return paidKobo - usedKobo;
}
```

dist/refund.js

```ts
export function refundKobo(paidKobo, usedKobo) {
    if (usedKobo > paidKobo)
        throw new RangeError("Used more than was paid");
    return paidKobo - usedKobo;
}
//# sourceMappingURL=refund.js.map
```

That last line is how Node.js (with `--enable-source-maps`) and browsers find the map, so stack traces point at `refund.ts`. [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools#source-maps) shows the map in action and decodes one by hand. Related: `noEmit` (check only; the course's default), `noEmitOnError` (write nothing if there is any error, so a broken build never reaches `dist`), and `inlineSourceMap` (the map inside the `.js` file).

## paths: import aliases and their trap

Deep relative imports like `../../../money/naira.js` are hard to read and break when files move. The `paths` option lets you write an alias instead:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "paths": {
      "@shop/*": ["./*"]
    }
  }
}
```

money/naira.ts

```ts
export const formatNaira = (kobo: number): string => `₦${(kobo / 100).toLocaleString("en-NG")}`;
```

orders/receipt.tsNode.js only

```ts
import { formatNaira } from "@shop/money/naira.js";

console.log(`Total: ${formatNaira(1765000)}`);
```

Output of `npx tsx orders/receipt.ts`

```ts
Total: ₦17,650
```

`tsc` is happy, and `tsx` reads `paths` from `tsconfig.json` too, so it runs in development. Now build it and look at what `tsc` wrote:

dist/orders/receipt.js

```ts
import { formatNaira } from "@shop/money/naira.js";
console.log(`Total: ${formatNaira(1765000)}`);
```

The alias is still there. **`paths` only tells the type checker where to look; `tsc` never rewrites import paths.** Node.js has never heard of `@shop`, so it looks for an npm package with that name:

Terminal (a real run)

```bash
$ npx tsc
$ node dist/orders/receipt.js
node:internal/modules/package_json_reader:301
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@shop/money' imported from /home/you/shop/dist/orders/receipt.js
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:859:18)
    at defaultResolve (node:internal/modules/esm/resolve:992:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:701:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:721:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:759:56)
    at #resolve (node:internal/modules/esm/loader:683:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:603:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:163:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v24.19.0
```

It works in development and fails in production: the worst kind of configuration bug. `paths` is safe only when something *else* rewrites the imports: a bundler that reads the same aliases, as in most front-end projects. For code that Node.js runs, use Node's own alias feature, **subpath imports**: a `"imports"` field in `package.json`, whose keys must start with `#`. Node.js resolves them at runtime, and TypeScript's `NodeNext` resolution understands them, including mapping `dist` back to your sources while you edit:

package.json

```json
{
  "type": "module",
  "imports": {
    "#shop/*": "./dist/*"
  }
}
```

Terminal (a real run: rootDir src, outDir dist, no paths)

```bash
$ cat src/orders/receipt.ts
import { formatNaira } from "#shop/money/naira.js";

console.log(`Total: ${formatNaira(1765000)}`);
$ npx tsc --noEmit
$ npx tsc
$ node dist/orders/receipt.js
Total: ₦17,650
```

One alias, understood by both the checker and the runtime. (The `baseUrl` option that older guides pair with `paths` is not needed: `paths` entries are resolved relative to the `tsconfig.json` file.)

## verbatimModuleSyntax

Every file in this course uses `verbatimModuleSyntax`. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#import-type) introduced `import type`; here is the bug the option prevents. An audit module registers itself when it is loaded (a **side effect**: code that runs on import), and also exports a type:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

audit.ts

```ts
export type AuditEvent = { action: string; actor: string };
console.log("audit log ready");
```

main.tsNode.js only

```ts
import { AuditEvent } from "./audit.js";

const event: AuditEvent = { action: "refund", actor: "ada" };
console.log(event.action);
```

Output of `npx tsx main.ts`

```ts
refund
```

"audit log ready" never printed. Without `verbatimModuleSyntax`, the compiler notices that only a type was imported, and deletes the whole import, side effect and all. Look at what `tsc` emits:

dist/main.js

```ts
const event = { action: "refund", actor: "ada" };
console.log(event.action);
export {};
```

Whether an import survives depended on how the imported names were *used*, which a tool translating one file at a time (`tsx`, esbuild, Node's type stripping) cannot always know. `verbatimModuleSyntax` replaces that guesswork with one simple rule: **imports and exports are emitted exactly as written, except those marked `type`**. An import that would only be kept for its types is now an error:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "verbatimModuleSyntax": true
  }
}
```

audit.ts

```ts
export type AuditEvent = { action: string; actor: string };
console.log("audit log ready");
```

main.ts

```ts
import { AuditEvent } from "./audit.js";

const event: AuditEvent = { action: "refund", actor: "ada" };
console.log(event.action);
```

What `npx tsc --noEmit` prints

```ts
main.ts:1:10 - error TS1484: 'AuditEvent' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.

1 import { AuditEvent } from "./audit.js";
           ~~~~~~~~~~


Found 1 error in main.ts:1
```

You now choose, visibly. `import type { AuditEvent }` deletes the import (no side effect). `import { type AuditEvent }` marks only the name as a type and keeps the import itself:

main-kept.tsNode.js only

```ts
import { type AuditEvent } from "./audit.js";

const event: AuditEvent = { action: "refund", actor: "ada" };
console.log(event.action);
```

Output of `npx tsx main-kept.ts`

```ts
audit log ready
refund
```

dist/main-kept.js

```ts
import {} from "./audit.js";
const event = { action: "refund", actor: "ada" };
console.log(event.action);
```

(If the side effect is the only reason for the import, `import "./audit.js";` says so most clearly.)

### What verbatimModuleSyntax turns on

`verbatimModuleSyntax` implies `isolatedModules`: "every file must be translatable on its own, without looking at other files". `tsc --showConfig` shows the options it switches on:

Terminal (a real run: the base config at the end of this lesson, extended with src/dist)

```bash
$ npx tsc --showConfig
{
    "compilerOptions": {
        "erasableSyntaxOnly": true,
        "exactOptionalPropertyTypes": true,
        "lib": [
            "es2024"
        ],
        "module": "nodenext",
        "moduleResolution": "nodenext",
        "noUncheckedIndexedAccess": true,
        "noImplicitOverride": true,
        "outDir": "./dist",
        "rootDir": "./src",
        "skipLibCheck": true,
        "strict": true,
        "sourceMap": true,
        "target": "es2024",
        "types": [
            "node"
        ],
        "verbatimModuleSyntax": true,
        "moduleDetection": "force",
        "isolatedModules": true,
        "preserveConstEnums": true
    },
    "files": [
        "./src/index.ts"
    ],
    "include": [
        "src"
    ],
    "exclude": [
        "/home/you/shop/dist"
    ]
}
```

The last three compiler options were not in the file; they are implied. `preserveConstEnums` is why a `const enum` behaves like a normal enum here, as [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums#const-enums) showed: another file cannot inline `OrderStatus.Paid` without reading `status.ts`, so the enum object is emitted and used:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "verbatimModuleSyntax": true
  }
}
```

status.ts

```ts
export const enum OrderStatus {
  Pending = "PENDING",
  Paid = "PAID",
}
```

main.ts

```ts
import { OrderStatus } from "./status.js";

const order = { id: 1042, status: OrderStatus.Paid };
console.log(order.status);
```

dist/status.js

```ts
export var OrderStatus;
(function (OrderStatus) {
    OrderStatus["Pending"] = "PENDING";
    OrderStatus["Paid"] = "PAID";
})(OrderStatus || (OrderStatus = {}));
```

dist/main.js

```ts
import { OrderStatus } from "./status.js";
const order = { id: 1042, status: OrderStatus.Paid };
console.log(order.status);
```

Without `verbatimModuleSyntax` (and without `isolatedModules`), the same files compile to `status: "PAID" /* OrderStatus.Paid */` and an empty `status.js`. With it, TypeScript 7 emits the `const enum` exactly like a normal enum. `erasableSyntaxOnly`, from [the compiler lesson](https://zudojs.oyinlola.site/learn/ts-compiler#not-erased), goes one step further and forbids enums altogether, so the code also runs under Node's type stripping.

## A tsconfig you can defend

Put the shared rules in a base file, and let each project (the API, a worker, the tests) extend it and add only its own layout. Every line below has been explained in this lesson:

tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true
  }
}
```

tsconfig.json

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

`extends` loads the base, then applies this file's options on top. Options merge; `include`, `exclude` and `files` replace the base's lists entirely, and relative paths are resolved against the file that contains them. `tsc --showConfig`, as above, shows the merged result. Community bases such as `@tsconfig/node24` on npm can be extended the same way (`"extends": "@tsconfig/node24/tsconfig.json"`).

| Kind of project | What changes from the base |
| --- | --- |
| Node.js backend (built) | As above: `rootDir`/`outDir`, `sourceMap`, start with `node --enable-source-maps dist/main.js` |
| Node.js backend (run with tsx or Node type stripping) | `"noEmit": true`; no `outDir`. Keep `erasableSyntaxOnly` for Node type stripping |
| Library published to npm | Add `"declaration": true` and `"declarationMap": true`; never export a `const enum` |
| Browser app with a bundler | `"module": "preserve"`, `"moduleResolution": "bundler"`, `"lib": ["ES2024", "DOM", "DOM.Iterable"]`, `"types": []`, `"noEmit": true` (the bundler emits) |

`skipLibCheck` skips checking the `.d.ts` files in `node_modules`: they were checked when they were published, and re-checking them is slow and can fail on conflicts between two packages that you cannot fix. It does not weaken checks on your own code.

## Testing and changing a configuration

- **Check in CI with the same command as locally**: `npm run check` running `tsc --noEmit` ([package scripts that really check](https://zudojs.oyinlola.site/learn/ts-compiler#scripts)). A config that only your editor reads protects nobody.
- **Prove a flag works**: keep one small file that must fail, with `// @ts-expect-error` on the line. If someone switches the flag off, the directive itself becomes an error ("Unused '@ts-expect-error' directive"), so the config cannot quietly get weaker.
- **See what is included**: `tsc --listFilesOnly` lists every file in the program; `tsc --showConfig` shows the final options. Both answer "why is this file (not) being checked?".
- **Tighten gradually**: turning on a flag in a large codebase can report hundreds of errors. Turn it on, count the errors, fix them by directory, and never let the count go up. Do not "fix" them with `!` and `as`, which only hides the bugs the flag found.

## Practice

TRY IT YOURSELF

### Which flag catches it?

For each bug, name the `tsconfig` option that turns it into a compile error: (a) `config.retries` read from `Record<string, number>` is `undefined`; (b) a subclass method `refund()` keeps running after the base class renamed it to `reverse()`; (c) `catch (e) { log(e.mesage) }`; (d) a Node.js service calls `localStorage.getItem`; (e) an update request with `email: undefined` erases a stored email.

**Show a solution**

(a) `noUncheckedIndexedAccess`: record lookups get `| undefined`. (b) `noImplicitOverride`: once `refund` is marked `override`, the rename makes it an error, because nothing is overridden any more. (c) `useUnknownInCatchVariables` (part of `strict`): `e` is `unknown`, so any property access needs a check first. (d) An explicit `"lib": ["ES2024"]` without `DOM`: `localStorage` is a browser API. (e) `exactOptionalPropertyTypes`: `email?: string` no longer accepts `undefined`.

TRY IT YOURSELF

### Fix the build layout

A project has `src/server.ts`, `src/routes/orders.ts` and `test/orders.test.ts`. The tsconfig has `"outDir": "dist"` and no `rootDir` or `include`. After `npx tsc`, `node dist/server.js` fails with "Cannot find module". Explain what happened and write the fixed tsconfig for the build.

**Show a solution**

The default `include` picked up `test/` as well, so the common root of all inputs is the project folder, and the output landed in `dist/src/server.js` and `dist/test/…`. There is no `dist/server.js`.

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

Tests are checked by a second config (for example `tsconfig.test.json` with `"noEmit": true` and `"include": ["src", "test"]`) and run with the test runner, which does not need `dist`.

TRY IT YOURSELF

### Make it pass under the strict base

This file compiles in a loose project. Rewrite it so that it compiles with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, without `as`, `!` or `any`, and prints the same lines.

```ts
type Customer = { name: string; phone?: string };
const customers: Record<string, Customer> = { ada: { name: "Ada" } };

function phoneOf(id) {
  return customers[id].phone ?? "no phone";
}

console.log(phoneOf("ada"), phoneOf("bola"));
```

**Show a solution**

phone-of.ts

```ts
type Customer = { name: string; phone?: string };
const customers: Record<string, Customer> = { ada: { name: "Ada" } };

function phoneOf(id: string): string {
  const customer = customers[id];
  if (customer === undefined) return "unknown customer";
  return customer.phone ?? "no phone";
}

console.log(phoneOf("ada"), phoneOf("bola"));
```

Output of `npx tsx phone-of.ts` and of the browser terminal

```ts
no phone unknown customer
```

The parameter gets a type (`noImplicitAny`). The lookup can miss (`noUncheckedIndexedAccess`), and the original code would have crashed on `"bola"`, so handling it is a real fix, not appeasement. `{ name: "Ada" }` leaves `phone` out instead of setting it to `undefined`, so `exactOptionalPropertyTypes` is satisfied.

## Summary

- `tsconfig.json` decides which bugs `tsc` can catch and what it emits. Check the merged result with `tsc --showConfig`; share rules with `extends`.
- `target` rewrites syntax; `lib` says which built-ins exist (the default includes `DOM`, so write `lib` for a backend); `types` loads global type packages and is empty by default in TypeScript 7.
- `NodeNext` for code Node.js runs: it follows Node's resolution and emits ESM or CommonJS according to `package.json`. `bundler`/`preserve` for bundled code.
- `strict` turns on `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `strictBuiltinIteratorReturn` and `alwaysStrict`. Each one closes a hole a real runtime bug came through.
- Add `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride` for new code.
- `allowJs` reads JavaScript files, `checkJs` also checks them: the path for gradual migration.
- `rootDir`, `outDir` and `include` together fix where output lands. `paths` never rewrites imports; use `package.json` `"imports"` for aliases Node.js must understand.
- `verbatimModuleSyntax` emits imports exactly as written except those marked `type`; it implies `isolatedModules`, which is why a `const enum` compiles to a normal enum.

Next: [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime), where the strictest configuration in the world still cannot check data that arrives from outside your program.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
