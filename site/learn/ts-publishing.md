---
title: "Publishing TypeScript packages — ZudoJS Academy"
description: "Build a TypeScript library into JavaScript plus declarations, write package.json exports, check the tarball, handle ESM and CommonJS, and version types."
source: https://zudojs.oyinlola.site/learn/ts-publishing
---

LEVEL 6 · LESSON 18 OF 22

Libraries and large projects Advanced

# Publishing TypeScript packages

Build a TypeScript library into JavaScript plus declarations, write package.json exports, check the tarball, handle ESM and CommonJS, and version types.

- **55 min** to read and try
- **You need:** Declaration files, Modules in TypeScript, npm and packages, The npm ecosystem in depth and Module systems in depth
- **You build:** A naira formatting package, @naija-shop/naira, with a separate build config, declaration and source maps, a checked exports map, a CommonJS consumer, a dual ESM and CommonJS build that shows the dual-package hazard, and a release checklist

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build a library with a separate build tsconfig that emits JavaScript, declarations and maps from src to dist
- Write an exports map with types first, and a files allow-list, then prove the result with npm pack, publint and attw
- Consume the package as a user would, from ESM, from CommonJS and from a tarball
- Explain the dual-package hazard and choose between an ESM-only and a dual build
- Decide whether a change to a package's types is a patch, minor or major release

## It worked in our repository

The shop team turned the formatter from [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations) into a proper TypeScript package, `@naija-shop/naira`, so that the checkout, the admin dashboard and the invoicing service could share it. In their monorepo it was perfect: every app imported it and got full types. They published version 1.0.0. The first message from another team read:

The other team's terminal

```bash
$ npm install ../naira/naija-shop-naira-1.0.0.tgz
…
$ npx tsc --noEmit
checkout.ts:1:29 - error TS7016: Could not find a declaration file for module '@naija-shop/naira'. '/home/you/shop-app/node_modules/@naija-shop/naira/dist/index.js' implicitly has an 'any' type.
  Try `npm i --save-dev @types/naija-shop__naira` if it exists or add a new declaration (.d.ts) file containing `declare module '@naija-shop/naira';`

1 import { formatNaira } from "@naija-shop/naira";
                              ~~~~~~~~~~~~~~~~~~~


Found 1 error in checkout.ts:1
```

(Throughout this lesson the package is installed from the tarball that `npm pack` produces, which is byte for byte what the registry would serve, so nothing has to be published for real.) A TypeScript library, published by a TypeScript team, arrived without types. The team looked at what they had actually uploaded:

Terminal on your computer

```bash
$ npm pack --dry-run
npm notice Tarball Contents
npm notice 850B dist/index.js
npm notice 489B package.json
…
npm notice total files: 2
```

Only the JavaScript. Their `package.json` said `"files": ["dist/*.js"]`, which left out `dist/index.d.ts`. Inside the monorepo nobody noticed, because a workspace links the whole folder and the `.d.ts` file was right there on disk. The registry only ever sees the tarball.

Publishing a TypeScript package means shipping two products at once: JavaScript that runs, and declarations that describe it. This lesson builds `@naija-shop/naira` properly, checks it the way a user would receive it, and deals with the questions every library author meets: ES modules or CommonJS, what goes in `exports`, and when a type change needs a new major version.

## What a published TypeScript package contains

Nobody runs your `.ts` files. Node.js refuses to strip types inside `node_modules` (you saw that in [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#type-stripping)), bundlers expect JavaScript there, and the user's `tsc` should not type-check your source with their settings. So a package ships the compiler's *output*:

```ts
  src/index.ts ──tsc -p tsconfig.build.json──▶ dist/index.js        code that runs
                                               dist/index.d.ts      types for users
                                               dist/index.js.map    stack traces → src/index.ts
                                               dist/index.d.ts.map  "go to definition" → src/index.ts
  package.json   "exports" points users at dist/index.js and dist/index.d.ts
               "files" decides which of these reach the registry
```

A TypeScript package is compiled JavaScript plus declarations, described by package.json.

Every `@zudojs/*` package has exactly this shape: a `dist` folder of `.js` and `.d.ts` files, and an `exports` map pointing at them.

## A separate build configuration

Here is the library. It is small on purpose: one file with two functions and one interface. Real packages have many files and a barrel `index.ts`, as you built in [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules#barrel); everything below works the same.

src/index.ts

```ts
export interface FormatOptions {
  /** Put the ₦ sign in front. Default: true. */
  symbol?: boolean;
}

/** Formats whole kobo as naira text: 125050 becomes "₦1,250.50". */
export function formatNaira(kobo: number, options: FormatOptions = {}): string {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`kobo must be a whole number, got ${kobo}`);
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}${options.symbol === false ? "" : "₦"}${naira}.${rest}`;
}

/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export function parseNaira(text: string): number | null {
  const cleaned = text.replace(/[₦,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
```

A library usually has **two** TypeScript configurations. `tsconfig.json` is what your editor and `npm run check` use: it covers everything, tests and scripts included, and never emits. `tsconfig.build.json` extends it and produces the package, from `src` only, without the tests:

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
    "verbatimModuleSyntax": true
  }
}
```

tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmitOnError": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- `extends` copies every setting from the main file, so `strict` and the module settings cannot drift apart between checking and building.
- `rootDir`/`outDir`: `src/index.ts` becomes `dist/index.js`, not `dist/src/index.js`.
- `declaration` writes the `.d.ts` files; `declarationMap` and `sourceMap` write the two kinds of `.map` file.
- `noEmitOnError`: a type error means no `dist` at all, so a broken build can never be published.
- `exclude` keeps test files out of the package.

Terminal on your computer

```bash
$ npx tsc -p tsconfig.build.json
$ ls dist
index.d.ts  index.d.ts.map  index.js  index.js.map
```

dist/index.js

```ts
/** Formats whole kobo as naira text: 125050 becomes "₦1,250.50". */
export function formatNaira(kobo, options = {}) {
    if (!Number.isSafeInteger(kobo))
        throw new RangeError(`kobo must be a whole number, got ${kobo}`);
    const sign = kobo < 0 ? "-" : "";
    const abs = Math.abs(kobo);
    const naira = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const rest = String(abs % 100).padStart(2, "0");
    return `${sign}${options.symbol === false ? "" : "₦"}${naira}.${rest}`;
}
/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export function parseNaira(text) {
    const cleaned = text.replace(/[₦,\s]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned))
        return null;
    return Math.round(Number(cleaned) * 100);
}
//# sourceMappingURL=index.js.map
```

dist/index.d.ts

```ts
export interface FormatOptions {
    /** Put the ₦ sign in front. Default: true. */
    symbol?: boolean;
}
/** Formats whole kobo as naira text: 125050 becomes "₦1,250.50". */
export declare function formatNaira(kobo: number, options?: FormatOptions): string;
/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export declare function parseNaira(text: string): number | null;
//# sourceMappingURL=index.d.ts.map
```

Three details are worth noticing. The JSDoc comments survive in both files, so users see them on hover. The default value `options = {}` became `options?` in the declaration: callers only need to know the argument is optional. And each file ends with a `sourceMappingURL` comment naming its map. The declaration map is a small JSON file whose `sources` field points back at your TypeScript:

Terminal on your computer

```bash
$ cat dist/index.d.ts.map
{"version":3,"file":"index.d.ts","sourceRoot":"","sources":["../src/index.ts"],"names":[],"mappings":"AAAA,MAAM,WAAW,aAAa;IAC5B,8CAA8C;…"}
```

When a user presses "go to definition" on `formatNaira`, their editor follows that map to `../src/index.ts`, but only if that file is in the package. That is why the `files` list below includes `src`.

## Before you write package.json

REASON IT OUT

### What will a user of @naija-shop/naira actually get?

You are about to describe the package to npm, to Node.js and to TypeScript. Before writing any field, answer:

1. Which files must be in the tarball for an `import` to run? For the types to work? For "go to definition" to reach the source? Which files must never be in it?
2. Which import paths do you promise to keep working? What happens to a user who imports `@naija-shop/naira/dist/index.js` directly, if you later rename that file?
3. Who might load the package with `require` instead of `import`? What Node.js versions do they run?
4. When TypeScript and Node.js both read the same `exports` map, can they disagree about which file an import means?

**Show the reasoning**

1. Running needs `dist/index.js`. Types need `dist/index.d.ts`. "Go to definition" needs the `.d.ts.map` plus `src/index.ts`; stack traces through the package need the `.js.map`. Tests, `tsconfig` files, `.env` files and build caches must stay out. An allow-list in `files` is the only safe way to get this right.
2. Only the paths you list in `exports`. If deep imports are possible, someone will use them, and your internal file names become public API. An `exports` map makes every unlisted path fail, in Node.js and in TypeScript.
3. Older services written in CommonJS, and tools that still `require` their plugins. On Node.js 24 (and 22.12+, 20.19+), `require` can load an ES module without top-level `await`. The package should say which Node.js versions it supports.
4. Yes. TypeScript follows the `"types"` condition, Node.js ignores it and follows `"import"`, `"require"` or `"default"`. If the conditions are in the wrong order, or point at mismatched files, the types can describe one file while Node runs another. You must check both.

## package.json for a TypeScript library

package.json

```json
{
  "name": "@naija-shop/naira",
  "version": "1.0.1",
  "description": "Format and parse naira amounts stored in kobo",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src", "!src/**/*.test.ts"],
  "engines": { "node": ">=24" },
  "scripts": {
    "check": "tsc --noEmit",
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "npm run check && npm run build"
  }
}
```

- `"type": "module"`: the `.js` files in `dist` are ES modules, and the `.d.ts` files describe ES modules.
- `"exports"` is the package's front door, as you learned in [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems#resolution). Each entry is an object of **conditions**, checked *in the order written*. `"types"` is a condition only TypeScript uses, and it must come **first**: TypeScript also matches `"import"` and `"default"`, so if one of those came first it would stop there. `"default"` matches everything and must come **last**.
- Using `"default"` rather than `"import"` for the JavaScript means both `import` and `require` reach the same file. You will see why that matters [below](#esm-cjs).
- `"./package.json"` is exported because some tools read a package's version through it; without this line they get `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- `"files"` is the allow-list. A `!` pattern removes matches again, here the tests. npm always adds `package.json`, the README and the licence file.
- `"prepublishOnly"` runs automatically before `npm publish`: the check and a fresh build, so what you upload is never an old or broken `dist`.

Older guides also add top-level `"main"` and `"types"` fields. Tools that understand `exports` ignore them; they are only a fallback for very old resolvers. If you keep them, they must point at the same files as `exports`.

### Use the package as a user would

A package may import itself by its own name, through its own `exports` map. That lets you test the published entry points from inside the project, with no install:

consumer.tsNode.js only

```ts
import { formatNaira, parseNaira, type FormatOptions } from "@naija-shop/naira";

const plain: FormatOptions = { symbol: false };
const kobo = parseNaira("₦1,250,000.50");
console.log(kobo === null ? "invalid" : formatNaira(kobo));
console.log(formatNaira(99, plain));
```

Output of `npx tsx consumer.ts`

```ts
₦1,250,000.50
0.99
```

TypeScript resolved `"@naija-shop/naira"` through the `"types"` condition to `dist/index.d.ts`, and Node.js through `"default"` to `dist/index.js`. Now try what a curious user might do: reach past the front door.

deep.ts

```ts
import { parseNaira } from "@naija-shop/naira/dist/index.js";

console.log(parseNaira("₦5"));
```

What `npx tsc --noEmit` prints

```ts
deep.ts:1:28 - error TS2307: Cannot find module '@naija-shop/naira/dist/index.js' or its corresponding type declarations.

1 import { parseNaira } from "@naija-shop/naira/dist/index.js";
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in deep.ts:1
```

Refused, because `./dist/index.js` is not a key in `exports`. You are free to rename and reorganise everything inside `dist` in a minor release, since nobody can depend on it. Anything you do list becomes a promise; a **subpath export** such as `"./parse"` gets its own `types` and `default` pair (exercise 1).

## Check the tarball, not the folder

The mistake in the first section survived because everyone tested the *folder*. Three checks look at the *tarball* instead, and each catches things the others miss.

### 1. npm pack --dry-run: what is in it?

Terminal on your computer

```bash
$ npm pack --dry-run
npm notice Tarball Contents
npm notice 456B dist/index.d.ts
npm notice 336B dist/index.d.ts.map
npm notice 850B dist/index.js
npm notice 1.0kB dist/index.js.map
npm notice 561B package.json
npm notice 945B src/index.ts
npm notice Tarball Details
npm notice name: @naija-shop/naira
npm notice version: 1.0.1
…
npm notice total files: 6
```

Code, declarations, both maps and the source, and no test file. Read this list before every release; it takes ten seconds.

### 2. publint: is package.json consistent?

**publint** is a linter for package metadata. It packs the package and checks every path and condition in `package.json` against the files that would really be published. Run on the broken 1.0.0 from the first section (the one with `default` before `types` and `"files": ["dist/*.js"]`), it finds all three mistakes:

Terminal on your computer

```bash
$ npx publint
Running publint v0.3.24 for @naija-shop/naira...
Packing files with `npm pack`...
Linting...
Errors:
1. pkg.exports["."].types should be the first in the object as conditions are order-sensitive so it can be resolved by TypeScript.
2. pkg.exports["."].default should be the last in the object so it doesn't take precedence over the keys following it.
3. pkg.exports["."].types is ./dist/index.d.ts but the file is not published. Is it specified in pkg.files?
```

On the fixed package it prints `All good!`.

### 3. Are the types wrong? (attw)

**attw** ("Are the Types Wrong?", run as `npx @arethetypeswrong/cli`) resolves the package the way each TypeScript module setting would, and compares the declaration file it finds with the JavaScript that would run. Here is the fixed package:

Terminal on your computer

```bash
$ npx @arethetypeswrong/cli --pack --no-emoji --no-color

@naija-shop/naira v1.0.1

Import failed to resolve to type declarations or JavaScript files. https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/NoResolution.md

A require call resolved to an ESM JavaScript file, which is an error in Node and some bundlers. CommonJS consumers will need to use a dynamic import. https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/CJSResolvesToESM.md


┌───────────────────┬───────────────────────────┬──────────────────────────────────┐
│                   │ "@naija-shop/naira"       │ "@naija-shop/naira/package.json" │
├───────────────────┼───────────────────────────┼──────────────────────────────────┤
│ node10            │ Resolution failed         │ OK (JSON)                        │
├───────────────────┼───────────────────────────┼──────────────────────────────────┤
│ node16 (from CJS) │ ESM (dynamic import only) │ OK (JSON)                        │
├───────────────────┼───────────────────────────┼──────────────────────────────────┤
│ node16 (from ESM) │ OK (ESM)                  │ OK (JSON)                        │
├───────────────────┼───────────────────────────┼──────────────────────────────────┤
│ bundler           │ OK                        │ OK (JSON)                        │
└───────────────────┴───────────────────────────┴──────────────────────────────────┘
```

Each row is a kind of consumer, and each column an entry point (the exported `package.json` is JSON, so it always resolves). ESM code on Node.js and bundlers get the right types. The two complaints need interpreting rather than obeying:

- **node10** is the resolver of old tools that do not understand `exports` at all. TypeScript 7 has removed that mode. If you must support such tools, add top-level `"types"` and `"main"` fields; otherwise ignore the row.
- **node16 (from CJS)** says CommonJS code must use `import()`. That was true before Node.js could `require` ES modules. attw 0.18.5 bundles TypeScript 5.6, which predates that change, so the warning is out of date for a package that requires Node.js 24 (which the `engines` field says). The next section proves it.

For an ESM-only package, `--profile esm-only` ignores both rows and exits with `0`. One more trap: run on the broken 1.0.0, attw printed `This package does not contain types.` and still exited with `0`. In CI, publint's non-zero exit code is what stops that release.

> NOTE
>
> publint and attw are not part of npm. `npx` downloads them on first use (publint 0.3.24 and attw 0.18.5 here); in a real project, add them as dev dependencies so CI uses fixed versions.

### 4. Install the tarball in a real project

The final proof is the one from [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#local): install the packed file into a separate project and use it.

Terminal on your computer

```bash
$ npm pack --silent
naija-shop-naira-1.0.1.tgz
$ cd ../shop-app
$ npm install ../naira/naija-shop-naira-1.0.1.tgz
…
$ npx tsc --noEmit
checkout.ts:4:35 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

4 console.log(`Total: ${formatNaira(priceFromForm)}`);
                                    ~~~~~~~~~~~~~


Found 1 error in checkout.ts:4
```

The same `checkout.ts` that got TS7016 from version 1.0.0 now gets a real type error: the types arrived. After fixing the call with `parseNaira`, it runs:

Terminal on your computer

```bash
$ node checkout.ts
Total: ₦2,500.00
```

## ES modules, CommonJS and dual packages

The package is **ESM-only**: it ships only ES modules. For years, that shut out every CommonJS user, and libraries shipped two builds instead. Node.js 24 changes the calculation. A CommonJS file can `require` an ES module, and TypeScript understands it with `module: "NodeNext"`. In a `.cts` file (always CommonJS), write a plain `require` call and borrow the types with `typeof import(…)`:

legacy.ctsNode.js only

```ts
const naira: typeof import("@naija-shop/naira") = require("@naija-shop/naira");

console.log(naira.formatNaira(125050), naira.parseNaira("₦99.99"));
```

Terminal on your computer

```bash
$ npx tsc --noEmit
$ node legacy.cts
₦1,250.50 9999
```

A CommonJS module loaded the ES module package, with full types. (TypeScript also has the form `import naira = require("@naija-shop/naira")`, which `verbatimModuleSyntax` accepts in `.cts` files. It is not erasable syntax, though: `node legacy.cts` rejects it with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, so prefer the `require` call.)

This works because the `exports` entry uses `"default"`, which matches `require` as well as `import`. Many packages write `"import"` instead. Watch what that does:

package.json

```json
{
  "name": "@naija-shop/naira",
  "version": "1.0.1",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

Terminal on your computer

```bash
$ npx tsc --noEmit
$ node legacy.cts
node:internal/modules/cjs/loader:679
    throw e;
    ^

Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in /home/you/naira/package.json imported from /home/you/naira/legacy.cts
…
```

The type check still passes, because the `"types"` condition matches every kind of import, `require` included. Node.js finds no condition for `require` and refuses. Any CommonJS loader behaves the same way, including `createRequire` inside an ES module:

probe.tsNode.js only

```ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  const naira = require("@naija-shop/naira") as typeof import("@naija-shop/naira");
  console.log(naira.formatNaira(125050));
} catch (error) {
  console.log((error as NodeJS.ErrnoException).code);
}
```

Output of `npx tsx probe.ts`

```ts
ERR_PACKAGE_PATH_NOT_EXPORTED
```

TypeScript was satisfied and Node.js was not: exactly the "types and runtime disagree" problem that attw exists to catch. Use `"default"` for the JavaScript in an ESM-only package.

### Dual packages and the dual-package hazard

If you must support Node.js versions that cannot `require` ES modules, or tools that insist on CommonJS, you publish a **dual package**: two builds of the same code, one ESM and one CommonJS, selected by the `"import"` and `"require"` conditions. Here is a payments package with one error class:

src/errors.ts

```ts
export class PaymentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

export function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}
```

The CommonJS build needs its own settings. In TypeScript 7 that means `"module": "CommonJS"` with `"moduleResolution": "bundler"` (the old `node10` resolution was removed), and `verbatimModuleSyntax` off, because it would refuse `export` in a CommonJS output:

tsconfig.cjs.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "cjs",
    "declaration": true,
    "module": "CommonJS",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": false
  },
  "include": ["src"]
}
```

Building twice, once with the normal build settings into `esm/` and once with `tsc -p tsconfig.cjs.json` into `cjs/`, gives two different JavaScript files:

esm/errors.js

```ts
export class PaymentError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "PaymentError";
        this.code = code;
    }
}
export function isPaymentError(error) {
    return error instanceof PaymentError;
}
```

cjs/errors.js

```ts
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentError = void 0;
exports.isPaymentError = isPaymentError;
class PaymentError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "PaymentError";
        this.code = code;
    }
}
exports.PaymentError = PaymentError;
function isPaymentError(error) {
    return error instanceof PaymentError;
}
```

and two declaration files with the same text:

esm/errors.d.ts

```ts
export declare class PaymentError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function isPaymentError(error: unknown): error is PaymentError;
```

cjs/errors.d.ts

```ts
export declare class PaymentError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function isPaymentError(error: unknown): error is PaymentError;
```

The package is `"type": "module"`, so a tiny `cjs/package.json` tells Node.js and TypeScript that everything in `cjs/` is CommonJS, and the `exports` map gives each condition its own types and JavaScript:

cjs/package.json

```json
{ "type": "commonjs" }
```

package.json

```json
{
  "name": "@naija-shop/payments",
  "version": "2.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./esm/errors.d.ts", "default": "./esm/errors.js" },
      "require": { "types": "./cjs/errors.d.ts", "default": "./cjs/errors.js" }
    }
  },
  "files": ["esm", "cjs"]
}
```

Now imagine an application that imports the package, while one of its older dependencies `require`s it. Both builds get loaded, and there are two `PaymentError` classes in memory:

hazard.tsNode.js only

```ts
import { createRequire } from "node:module";
import { PaymentError, isPaymentError } from "@naija-shop/payments";

const require = createRequire(import.meta.url);
const legacy = require("@naija-shop/payments") as typeof import("@naija-shop/payments");

const declined = new legacy.PaymentError("card_declined", "Card declined");

console.log(declined instanceof PaymentError, isPaymentError(declined));
console.log(legacy.isPaymentError(declined), declined.name, declined.code);
```

Output of `npx tsx hazard.ts`

```ts
false false
true PaymentError card_declined
```

This is the **dual-package hazard**. The error was created by the CommonJS copy, so the ESM copy's `instanceof` and type guard both say no, and a `catch` block that handles `PaymentError` lets a declined card through as an unknown error. TypeScript cannot help: both copies have identical declarations, so to the compiler they are the same class. Anything stateful is affected the same way: a registry, a cache, a singleton, a `Symbol` created with `Symbol()`.

The defences, in order of preference:

1. **Ship ESM only**, with a `"default"` condition, and require Node.js 20.19 or later. One copy, no hazard. This is what the ZudoJS packages do.
2. If you need a CommonJS entry, make it a thin wrapper that `require`s the ESM build, so both conditions share one copy.
3. If two copies are unavoidable, keep state in one of them, and check errors by a stable property (`error.name`, a `code`, or a `Symbol.for` brand) rather than by `instanceof`.

attw checks that each condition gets matching declarations. Give both conditions the ESM declarations (a common shortcut, with one top-level `"types"`) and it reports the CommonJS side as "Masquerading as ESM":

Terminal on your computer

```bash
$ npx @arethetypeswrong/cli --pack --no-emoji --no-color
…
Import resolved to an ESM type declaration file, but a CommonJS JavaScript file. https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseESM.md
…
│ node16 (from CJS) │ Masquerading as ESM    │
├───────────────────┼────────────────────────┤
│ node16 (from ESM) │ OK (ESM)               │
```

With the nested map above, that row reads `OK (CJS)`.

## Your declarations are part of your API

A user's code compiles against your `.d.ts` files. Three consequences follow.

### Types your declarations mention must be installable

If `dist/index.d.ts` says `import type { Logger } from "@zudojs/logger"`, every user's compiler must be able to find `@zudojs/logger`. A package mentioned in your published declarations belongs in `dependencies` (or `peerDependencies`), even if your JavaScript only uses it as a type. If it sits in `devDependencies`, your tests pass and your users get "Cannot find module". The same goes for `@types/node` when your declarations mention `Buffer` or `IncomingMessage`.

### Internal types leak

Every exported function's parameter and return types appear in the `.d.ts`, including helper types you never meant to publish. Name them deliberately, export the ones users need (so they can write `const options: FormatOptions`), and keep everything else unexported.

### Type changes follow semantic versioning

Semantic versioning ([The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#semver)) says a major version is needed when existing users' code can break. For a TypeScript package, "break" includes "no longer compiles". Suppose version 1.1.0 adds a `locale` option and, to make users choose, makes it required:

naira.d.ts

```ts
export interface FormatOptions {
  symbol?: boolean;
  locale: "en-NG" | "en-US";
}
export declare function formatNaira(kobo: number, options?: FormatOptions): string;
export declare function parseNaira(text: string): number | null;
```

dashboard.ts

```ts
import { formatNaira, type FormatOptions } from "./naira.js";

const noSymbol: FormatOptions = { symbol: false };
console.log(formatNaira(250_000, noSymbol));
```

What `npx tsc --noEmit` prints

```ts
dashboard.ts:3:7 - error TS2741: Property 'locale' is missing in type '{ symbol: false; }' but required in type 'FormatOptions'.

3 const noSymbol: FormatOptions = { symbol: false };
        ~~~~~~~~

  naira.d.ts:3:3 - 'locale' is declared here.
    3   locale: "en-NG" | "en-US";
        ~~~~~~


Found 1 error in dashboard.ts:3
```

No JavaScript behaviour changed for this user, yet their build is red after a minor update. That is a breaking change, and it needs version 2.0.0, or better, a design that keeps `locale` optional with a default. A few rules of thumb:

| Change to the published types | Release |
| --- | --- |
| Fix a declaration that was plainly wrong, with no working code affected | Patch |
| Add an export, an overload, or an *optional* property to an options object | Minor |
| Accept a wider parameter type (`number` becomes `number \| bigint`, backed by code) | Minor |
| Add a required property to an input type, narrow a parameter, remove or rename an export | Major |
| Widen a return type (`string` becomes `string \| null`): every caller must now handle the new case | Major |
| Raise the minimum TypeScript version your declarations need (newer syntax in the `.d.ts`) | Major for most libraries; say it in the changelog |

Adding a property to an *output* type is safe for callers, but breaks users who *implement* your interface (for example a fake in their tests), because their object now lacks the property. Think about both directions whenever an exported interface changes.

## Releasing

With the checks in place, a release is short. `npm publish --dry-run` runs the `prepublishOnly` script and shows what would be sent, without sending it:

Terminal on your computer

```bash
$ npm publish --dry-run

> @naija-shop/naira@1.0.1 prepublishOnly
> npm run check && npm run build


> @naija-shop/naira@1.0.1 check
> tsc --noEmit


> @naija-shop/naira@1.0.1 build
> tsc -p tsconfig.build.json

npm notice Tarball Contents
…
npm notice total files: 6
npm notice
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
+ @naija-shop/naira@1.0.1
```

For the first real publish of a scoped public package, add `--access public`. In CI, publish with provenance, as described in [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#publishing). For many packages in one repository, Changesets automates version numbers and changelogs; the ZudoJS packages are released that way, with `pnpm publish` so that `"workspace:*"` dependencies are rewritten to real version ranges (the subject of [TypeScript monorepos](https://zudojs.oyinlola.site/learn/ts-monorepos)).

## Testing a package

- **Unit tests** run against `src`, like any other code ([Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing)).
- **Entry-point tests** import the package by its own name, as `consumer.ts` did above, so that the `exports` map and the built `dist` are exercised. Run them after the build.
- **Type tests** pin the public types: `@ts-expect-error` lines, or `expectTypeOf`, that fail if an export's type changes by accident. They are your early warning for an unplanned major version.
- **A tarball smoke test** in CI: `npm pack`, install the `.tgz` into a scratch project, run `tsc --noEmit` and one small script there. Add `publint` and `attw --profile esm-only` (or the profile that matches what you support) to the same job.

## In production

- **Ship ESM only** unless you have a named consumer who cannot use it. Set `engines.node` to what you test.
- **Put `"types"` first and `"default"` last** in every `exports` entry, and list only the subpaths you will support for a whole major version.
- **Use a `files` allow-list**, and read `npm pack --dry-run` before each release. Never rely on `.npmignore` alone.
- **Build from clean** in `prepublishOnly` or CI, with `noEmitOnError`, so stale files in `dist` are never uploaded. (Deleting `dist` first also removes files for sources you have deleted.)
- **Publish declaration maps and the source** if you want "go to definition" to be useful; publish `.js.map` files so users' stack traces can point into your code.
- **Treat type changes as API changes.** A red build after `npm update` is a broken promise, whatever the JavaScript does.

## Practice

TRY IT YOURSELF

### Add a subpath export

Users of the invoicing service only need the parser. Move `parseNaira` into `src/parse.ts`, export it as the subpath `@naija-shop/naira/parse` with its own types, and show that importing the subpath works.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A subpath export is an entry whose key is the subpath (`"./parse"`) and whose value has `"types"` and `"default"`, in that order, pointing at the built files under `dist`.

HINT 2

`"./parse": { "types": "./dist/parse.d.ts", "default": "./dist/parse.js" }`

SOLUTION

src/parse.ts

```ts
/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export function parseNaira(text: string): number | null {
  const cleaned = text.replace(/[₦,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
```

dist/parse.js

```ts
/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export function parseNaira(text) {
    const cleaned = text.replace(/[₦,\s]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned))
        return null;
    return Math.round(Number(cleaned) * 100);
}
```

dist/parse.d.ts

```ts
/** Reads text such as "₦1,250.50" into kobo, or returns null if it is not an amount. */
export declare function parseNaira(text: string): number | null;
```

package.json

```json
{
  "name": "@naija-shop/naira",
  "version": "1.1.0",
  "type": "module",
  "exports": {
    "./parse": {
      "types": "./dist/parse.d.ts",
      "default": "./dist/parse.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src"]
}
```

invoice.tsNode.js only

```ts
import { parseNaira } from "@naija-shop/naira/parse";

console.log(parseNaira("₦45,000"), parseNaira("forty-five"));
```

Output of `npx tsx invoice.ts`

```ts
4500000 null
```

Each subpath has its own `types`/`default` pair, in that order. (This solution shows only the new entry; in the real package, keep `"."` as well, with `src/index.ts` re-exporting `parseNaira` from `./parse.js`.) Adding a subpath is a minor release; removing one later would be a major one.

TRY IT YOURSELF

### Review a package.json

A colleague asks you to review this before the first publish. List every problem, and say how a user would notice each one.

```json
{
  "name": "@naija-shop/receipts",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "devDependencies": { "@zudojs/logger": "^1.0.0", "typescript": "^7.0.0" }
}
```

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Check the order inside `"exports"`'s `"."` entry, and compare `"main"` against where the real JavaScript ends up after a build.

HINT 2

Check which dependency list `@zudojs/logger` is in, and what `"files"` would include if it were missing entirely.

SOLUTION

- **No `files` field**: everything in the folder is published, including tests and any `.env`. Users would not notice; attackers might. Add `"files": ["dist", "src"]`.
- **`"types"` after `"import"`**: TypeScript matches `"import"` first and never reads `"types"`. It works by luck while `index.d.ts` sits beside `index.js`; publint reports it. Put `"types"` first.
- **`"import"` instead of `"default"`**: CommonJS users get `ERR_PACKAGE_PATH_NOT_EXPORTED`, while their type check passes.
- **`"main": "src/index.ts"`**: tools that read `main` would try to load TypeScript from `node_modules`. Remove it or point it at `dist/index.js`.
- **`@zudojs/logger` in `devDependencies`**: if the published declarations mention its types (or the code imports it), users get "Cannot find module '@zudojs/logger'". It belongs in `dependencies`.
- **No build step before publishing**: add `build` and `prepublishOnly` scripts, and `engines`, `license` and `description` while you are there.

TRY IT YOURSELF

### Patch, minor or major?

For each change to `@naija-shop/naira`'s published types, choose the release type: (a) add an optional `decimals?: 0 | 2` to `FormatOptions`; (b) change `parseNaira`'s return type from `number | null` to `number | null | undefined`; (c) rename the exported interface `FormatOptions` to `NairaFormatOptions`; (d) fix a JSDoc comment; (e) let `formatNaira` accept `number | bigint`, with code that handles both.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask, for each change: does code that already compiles against the old types still compile against the new ones, unchanged?

HINT 2

(b) and (c) both break existing callers, for different reasons: one widens a type callers had narrowed against, the other removes a name callers imported.

SOLUTION

- (a) **Minor**: existing calls still compile; new callers get a new ability.
- (b) **Major**: the return type got wider, so code that checked `=== null` and then used the number now fails to compile (`'kobo' is possibly 'undefined'`).
- (c) **Major**, because users who wrote `import type { FormatOptions }` break. Or keep both names for a while (`export type FormatOptions = NairaFormatOptions`, marked `@deprecated`) and make it minor.
- (d) **Patch**: documentation only.
- (e) **Minor**: a wider parameter accepts everything it accepted before. It is only safe because the JavaScript really handles `bigint`, the lesson from [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#trust).

## Recap

- A TypeScript package ships compiled JavaScript, `.d.ts` files, and optionally maps and source. Build it with a separate `tsconfig.build.json` that extends the checking config and turns on `declaration`, maps and `noEmitOnError`.
- In `exports`, conditions are read in order: `"types"` first, `"default"` last. Unlisted paths are private, in Node.js and in TypeScript.
- `files` is an allow-list. Check the tarball, not the folder: `npm pack --dry-run`, publint, attw, and a real install of the `.tgz`.
- On Node.js 24, `require` can load ES modules, so ESM-only with a `"default"` condition serves both. Dual builds create two copies of every class and every piece of state: the dual-package hazard.
- Published declarations are API. Types they mention must be real dependencies, and type changes follow semver: a new required input field or a wider return type is a major release.

Next: [TypeScript monorepos](https://zudojs.oyinlola.site/learn/ts-monorepos), where several packages like this one live and build together in one repository.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
