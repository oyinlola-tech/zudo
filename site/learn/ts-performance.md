---
title: "Compiler performance — ZudoJS Academy"
description: "Measure what tsc spends its work on with --extendedDiagnostics, then keep a large project fast with skipLibCheck, incremental builds and bounded types."
source: https://zudojs.oyinlola.site/learn/ts-performance
---

LEVEL 6 · LESSON 22 OF 22

Libraries and large projects Advanced

# Compiler performance

Measure what tsc spends its work on with --extendedDiagnostics, then keep a large project fast with skipLibCheck, incremental builds and bounded types.

- **50 min** to read and try
- **You need:** TypeScript monorepos, Debugging TypeScript, Declaration files, Conditional types and The type system in depth
- **You build:** Measurements of a 300-module product catalogue, a configuration-path type that stays within budget, smaller declaration files, a fixed incremental build, and a type-cost budget check for CI

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read --extendedDiagnostics and tell stable measures (files, types, instantiations) from noisy ones (times, memory)
- Explain what skipLibCheck, incremental builds and project references each skip, and the risks each brings
- Recognise types whose cost grows exponentially, and bound them (depth limits, tail recursion, smaller unions)
- Keep declaration emit cheap and declaration files small with named types and explicit annotations
- Guard type-checking cost in CI with a budget check, and avoid the stale .tsbuildinfo trap

## A type that grew by six times per level

The shop's settings live in one big nested object: delivery fees per state and city, tax rates, payment providers and their options. A developer wants `getSetting("delivery.lagos.ikeja.feeKobo")` to be type-checked, so that a misspelled path fails to compile. They write a type that lists every path through the settings, `Paths<T>`, and it works. Then the settings grow. The editor starts to lag when hovering over `getSetting`, the CI check gets slower every month, and one day the build fails with an error nobody has seen before.

How many paths does such a type have to produce? Count them for a settings object where every level has six keys:

count-paths.ts

```ts
function countPaths(depth: number, width: number): number {
  let total = 0;
  for (let level = 1; level <= depth; level++) total += width ** level;
  return total;
}

for (let depth = 3; depth <= 7; depth++) {
  const paths = countPaths(depth, 6);
  const warning = paths > 100_000 ? "  <- more than a union type may hold" : "";
  console.log(`depth ${depth}: ${paths.toLocaleString("en-US")} paths${warning}`);
}
```

Output of `npx tsx count-paths.ts` and of the browser terminal

```ts
depth 3: 258 paths
depth 4: 1,554 paths
depth 5: 9,330 paths
depth 6: 55,986 paths
depth 7: 335,922 paths  <- more than a union type may hold
```

Every extra level multiplies the work by six. The compiler has to build each of those strings as a member of a union type, compare arguments against that union, and do it again in every file that uses it. Here are real measurements of the `Paths` type from the [section below](#bounded), on settings objects of those shapes, with `tsc --extendedDiagnostics` (explained next):

| Settings depth (6 keys per level) | Types created | Type instantiations |
| --- | --- | --- |
| 3 | 1,141 | 3,322 |
| 4 | 3,310 | 17,362 |
| 5 | 16,283 | 101,602 |
| 6 | 94,056 | 607,042 |

Check time rose with every level as well, by several times per level on the machine used, although the exact factor changed from run to run (which is why the table shows counts). Memory use stayed flat for the small shapes and nearly doubled between depth 5 and depth 6.

TypeScript 7's compiler is fast, so each of these still finishes quickly on its own. The problem is the *shape* of the curve: nothing in the source code grew by six times, yet the compiler's work did. This lesson is about measuring that work, finding what causes it, and keeping it under control: in the types you write, in the libraries you check, and in how the build is organised.

> NOTE
>
> Timings depend on your computer, on what else it is doing, and on the TypeScript version, so this lesson never quotes raw times. It reports **counts**, which are the same on every machine, and describes times only as comparisons between two runs on the same machine.

## Measuring: --extendedDiagnostics

`--extendedDiagnostics` makes `tsc` print what it did after a normal run. Here it is on a product catalogue of 300 modules, each defining a Zod schema for one product line and a function that describes a product (the kind of code a large backend accumulates):

src/products/product000.ts

```ts
import { z } from "zod";

export const Product000 = z.object({
  sku: z.string().regex(/^P000-[A-Z0-9]+$/),
  name: z.string().min(1),
  priceKobo: z.number().int().nonnegative(),
  stock: z.number().int(),
  tags: z.array(z.enum(["new", "sale", "local", "imported"])),
  supplier: z.object({ id: z.string(), country: z.enum(["NG", "GH", "KE"]) }),
});

export type Product000 = z.infer<typeof Product000>;

export function describe000(p: Product000) {
  return { label: `${p.name} (${p.sku})`, inStock: p.stock > 0, price: p.priceKobo / 100, tags: p.tags };
}
```

Terminal on your computer

```bash
$ npx tsc --noEmit --extendedDiagnostics
Files:             600
Lines:          127223
Identifiers:    123029
Symbols:        138647
Types:           16468
Instantiations: 100388
Memory used:    <memory>
Memory allocs:  <count>
Config time:    <time>
Parse time:     <time>
Bind time:      <time>
Check time:     <time>
Emit time:      <time>
Total time:     <time>
```

(The memory and time values are hidden here, as promised; on your machine they are real numbers.) The lines map onto the pipeline from [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#pipeline):

| Line | What it counts | What makes it grow |
| --- | --- | --- |
| Files, Lines | Every file in the program, including `lib` files and every `.d.ts` reached from your imports | Dependencies with large type definitions, `include` patterns that pull in too much |
| Identifiers, Symbols | Names read by the parser and declarations created by the binder | The amount of code, yours and your dependencies' |
| Types | Distinct types the checker created | Unions, object literals, generic instantiations |
| Instantiations | How often a generic type was filled in with specific type arguments | Generic, conditional, mapped and recursive types, and libraries built from them |
| Parse / Bind / Check / Emit time | Time in each phase | Parse and bind follow Lines; check follows Types and Instantiations; emit follows output size, especially declarations |

Only 301 of the 600 files are this project's own; the rest are TypeScript's `lib` files, `@types/node` and Zod. Of the phase times, **check time** is usually the one that grows out of control, and **instantiations** is its best stable predictor. When a change makes the build slower, compare the Types and Instantiations lines before and after. Unlike times, they do not change between runs.

> TIP
>
> TypeScript 7 checks files in parallel: by default it runs several checkers at once, and `--checkers` sets how many (`--singleThreaded` turns this off). On the catalogue, the parallel check took about two thirds of the single-threaded time on the same machine. Each checker creates some types of its own, so the Types count also differs slightly between the two modes: compare counts only between runs with the same settings.

## skipLibCheck: what it saves and what it hides

The biggest single switch is `skipLibCheck`. With it on, the compiler still *reads* every declaration file (it needs their types), but does not type-check their contents. Run the catalogue both ways:

Terminal on your computer

```bash
$ npx tsc --noEmit --extendedDiagnostics --skipLibCheck true
…
Types:           16468
Instantiations: 100388
…
$ npx tsc --noEmit --extendedDiagnostics --skipLibCheck false
…
Symbols:         346240
Types:           160588
Instantiations:  350454
…
```

Nearly ten times as many types and three and a half times as many instantiations, spent checking Zod's and Node's declarations, which their authors already checked. On the same machine the check phase took roughly four to five times as long. In a smaller project dominated by a big dependency (the Vitest suite from [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing)), the difference was far larger: about thirty times as many types, and a check phase that took around fifty times as long.

What you give up:

- **Errors in your own `.d.ts` files** are not reported either. [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#what) showed a function body in a `.d.ts` passing silently.
- **Conflicts between libraries**, such as two packages declaring the same global differently, or an `@types` package that no longer matches its library, go unnoticed until something odd happens in your code.

The usual answer, and the course's setting: `skipLibCheck: true` for everyday checks, plus an occasional (or nightly) CI run with `--skipLibCheck false`, and always one after changing hand-written declarations or upgrading type packages.

## Types that grow: recursion, unions and limits

Your own types are the part you control. Here is the settings-path type from the first section:

paths.ts

```ts
interface ShopSettings {
  delivery: {
    lagos: { ikeja: { feeKobo: number; days: number }; lekki: { feeKobo: number; days: number } };
    abuja: { wuse: { feeKobo: number; days: number } };
  };
  tax: { vatRate: number };
}

type Paths<T> = T extends object
  ? { [K in keyof T & string]: K | `${K}.${Paths<T[K]>}` }[keyof T & string]
  : never;

type SettingPath = Paths<ShopSettings>;

function getSetting(path: SettingPath): string {
  return `reading ${path}`;
}

console.log(getSetting("delivery.lagos.ikeja.feeKobo"));
console.log(getSetting("tax.vatRate"));
```

Output of `npx tsx paths.ts` and of the browser terminal

```ts
reading delivery.lagos.ikeja.feeKobo
reading tax.vatRate
```

For each key `K`, the type produces `K` itself and `K.` followed by every path of the value below it, then collects them into one union. It is a **recursive type**: it refers to itself. Its cost is the number of paths, and as you counted, that number multiplies by the width at every level. Three defences, from most to least important:

### 1. Put a limit on it

Most code only needs paths a few levels deep. A depth counter, written as a tuple that grows by one element per level (the same trick as in [The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system)), stops the recursion:

paths-capped.ts

```ts
interface ShopSettings {
  delivery: {
    lagos: { ikeja: { feeKobo: number; days: number }; lekki: { feeKobo: number; days: number } };
    abuja: { wuse: { feeKobo: number; days: number } };
  };
  tax: { vatRate: number };
}

type Paths<T, Depth extends unknown[] = []> = Depth["length"] extends 3
  ? never
  : T extends object
    ? { [K in keyof T & string]: K | `${K}.${Paths<T[K], [...Depth, unknown]>}` }[keyof T & string]
    : never;

type SettingPath = Paths<ShopSettings>;

const ok: SettingPath = "delivery.lagos.ikeja";
const tooDeep: SettingPath = "delivery.lagos.ikeja.feeKobo";
```

What `npx tsc --noEmit` prints

```ts
paths-capped.ts:18:7 - error TS2820: Type '"delivery.lagos.ikeja.feeKobo"' is not assignable to type '"delivery" | "delivery.abuja" | "delivery.abuja.wuse" | "delivery.lagos" | "delivery.lagos.ikeja" | "delivery.lagos.lekki" | "tax" | "tax.vatRate"'. Did you mean '"delivery.lagos.ikeja"'?

18 const tooDeep: SettingPath = "delivery.lagos.ikeja.feeKobo";
         ~~~~~~~


Found 1 error in paths-capped.ts:18
```

Paths are now at most three segments long, and the error shows the limit working. Choose the limit from what the code needs, and document it: a caller who needs a deeper value gets the object at level three and reads the rest from it.

### 2. Know the hard limits

The compiler protects itself with two limits you will eventually meet. A union may not have more than 100,000 members. Somebody types order references as five digits after `ORD-`:

refs.ts

```ts
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type OrderRef = `ORD-${Digit}${Digit}${Digit}${Digit}${Digit}`;
```

What `npx tsc --noEmit` prints

```ts
refs.ts:3:17 - error TS2590: Expression produces a union type that is too complex to represent.

3 type OrderRef = `ORD-${Digit}${Digit}${Digit}${Digit}${Digit}`;
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in refs.ts:3
```

Ten to the power of five is exactly 100,000 strings, and the compiler refuses. Even four digits (10,000 members) is a large type to compare against on every call. A string format like this is a job for a runtime check plus a [branded type](https://zudojs.oyinlola.site/learn/ts-branded-types) (`string & { __brand: "OrderRef" }`), which costs the compiler nothing.

The second limit is on depth. A recursive type that has to be expanded more than a certain number of levels is stopped with TS2589:

repeat.ts

```ts
type Repeat<S extends string, N extends number, Acc extends unknown[] = []> = Acc["length"] extends N
  ? ""
  : `${S}${Repeat<S, N, [...Acc, unknown]>}`;

type Short = Repeat<"-", 30>;
type Long = Repeat<"-", 60>;
```

What `npx tsc --noEmit` prints

```ts
repeat.ts:6:13 - error TS2589: Type instantiation is excessively deep and possibly infinite.

6 type Long = Repeat<"-", 60>;
              ~~~~~~~~~~~~~~~


Found 1 error in repeat.ts:6
```

Thirty levels were fine; sixty were not. The error says "possibly infinite" because the compiler cannot tell a deep type from an endless one.

### 3. Write recursion the compiler can flatten

In `Repeat`, the recursive call sits *inside* a template string, so each level has to wait for the level below to finish. If the recursive call is the entire result of the branch (**tail position**), the compiler can run it as a loop instead of nesting, and allows far more iterations. Carry the result along in an extra parameter:

repeat-tail.ts

```ts
type Repeat<S extends string, N extends number, Acc extends unknown[] = [], Out extends string = ""> =
  Acc["length"] extends N ? Out : Repeat<S, N, [...Acc, unknown], `${Out}${S}`>;

type Divider = Repeat<"-", 40>;
const divider: Divider = "----------------------------------------";
type Long = Repeat<"-", 500>;
const lengthOfLong: Long["length"] = 500;

console.log(divider.length, lengthOfLong);
```

Output of `npx tsx repeat-tail.ts` and of the browser terminal

```ts
40 500
```

Five hundred levels, no error. (A template literal type does not know its own length, so `Long["length"]` is just `number`; the line only proves that the type was built.) Tail recursion removes the depth limit, not the cost: a type that does 500 steps still does 500 steps, in every place it is used.

### Other habits that keep checking cheap

- **Prefer interfaces to large intersections** for object types you extend. The compiler caches the relationship between named interfaces, while an intersection (`A & B & C`) may be flattened and compared member by member again in each place.
- **Name repeated shapes.** The compiler caches the result of a generic type applied to the same named type. For the depth-4, six-keys-per-level settings, `Paths` needed 17,362 instantiations when every level was a separate anonymous object type (the table above), and 781 when the levels were named `City`, `State` and `Region`, because `Paths<City>` was worked out once instead of for every city.
- **Annotate exported functions' return types**. The compiler then checks the body against a stated type once, instead of inferring a large type and carrying it into every caller (and into declaration files, next).
- **Be wary of large unions in hot places**. Checking one union against another compares members pairwise; a 1,000-member union passed around a codebase is paid for at every assignment.

## The cost of declaration emit

With `declaration` on, the compiler must write out the type of every export. When a type was inferred, that means printing the whole structure, and printing it again wherever it appears. The catalogue's generated `product000.d.ts` is bigger than its source (732 bytes against 561), because every Zod schema type is spelled out in full. Here is the same effect with plain objects: shop settings created by a factory, used for two branches:

settings.ts

```ts
export function createSettings(city: string) {
  return {
    city,
    delivery: { feeKobo: 150_000, freeAboveKobo: 5_000_000, days: [1, 2, 3, 4, 5, 6] },
    payments: { providers: ["paystack", "flutterwave"], retryLimit: 3 },
    tax: { vatRate: 0.075, inclusive: true },
  };
}

export const lagos = createSettings("Lagos");
export const abuja = createSettings("Abuja");
```

dist/settings.d.ts

```ts
export declare function createSettings(city: string): {
    city: string;
    delivery: {
        feeKobo: number;
        freeAboveKobo: number;
        days: number[];
    };
    payments: {
        providers: string[];
        retryLimit: number;
    };
    tax: {
        vatRate: number;
        inclusive: boolean;
    };
};
export declare const lagos: {
    city: string;
    delivery: {
        feeKobo: number;
        freeAboveKobo: number;
        days: number[];
    };
    payments: {
        providers: string[];
        retryLimit: number;
    };
    tax: {
        vatRate: number;
        inclusive: boolean;
    };
};
export declare const abuja: {
    city: string;
    delivery: {
        feeKobo: number;
        freeAboveKobo: number;
        days: number[];
    };
    payments: {
        providers: string[];
        retryLimit: number;
    };
    tax: {
        vatRate: number;
        inclusive: boolean;
    };
};
```

The inferred type is written three times. In a real codebase, the same structure is repeated in every `.d.ts` that exports something with that type, and every project that references this one must read and compare all of it. Give the shape a name:

settings.ts

```ts
export interface ShopSettings {
  city: string;
  delivery: { feeKobo: number; freeAboveKobo: number; days: number[] };
  payments: { providers: string[]; retryLimit: number };
  tax: { vatRate: number; inclusive: boolean };
}

export function createSettings(city: string): ShopSettings {
  return {
    city,
    delivery: { feeKobo: 150_000, freeAboveKobo: 5_000_000, days: [1, 2, 3, 4, 5, 6] },
    payments: { providers: ["paystack", "flutterwave"], retryLimit: 3 },
    tax: { vatRate: 0.075, inclusive: true },
  };
}

export const lagos: ShopSettings = createSettings("Lagos");
export const abuja: ShopSettings = createSettings("Abuja");
```

dist/settings.d.ts

```ts
export interface ShopSettings {
    city: string;
    delivery: {
        feeKobo: number;
        freeAboveKobo: number;
        days: number[];
    };
    payments: {
        providers: string[];
        retryLimit: number;
    };
    tax: {
        vatRate: number;
        inclusive: boolean;
    };
}
export declare function createSettings(city: string): ShopSettings;
export declare const lagos: ShopSettings;
export declare const abuja: ShopSettings;
```

The shape is written once and referred to by name everywhere else. The declaration file is about half the size, dependents compare a named interface (which the compiler caches) instead of a fresh structural type, and when `ShopSettings` changes, one line in the diff says so.

The next step is `isolatedDeclarations`, from [Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#generating). When every export's type is written out, declarations can be produced file by file without the type checker, and in a monorepo a dependent project can start as soon as its dependencies' declarations exist, instead of waiting for their full type check. The catalogue shows the price: Zod schemas are values whose types are inferred, so every schema is an error under `isolatedDeclarations`, and you would have to annotate each one. Weigh that for your own code.

## Incremental builds and the .tsbuildinfo file

`--incremental` (switched on automatically by `composite`) makes `tsc` save what it learned in a `.tsbuildinfo` file: a fingerprint of every file, the errors found in each, and the shape of each file's declarations. The next run compares fingerprints and re-checks only files that changed, or whose dependencies' declarations changed. On the Vitest project, three runs in a row:

Terminal on your computer

```bash
$ npx tsc --noEmit --incremental --extendedDiagnostics
Files:                   297
…
Types:                  3779
Instantiations:         3954
…
$ npx tsc --noEmit --incremental --extendedDiagnostics
Files:                   297
…
Types:                   340
Instantiations:            0
…
# add a comment to src/cart.ts, then:
$ npx tsc --noEmit --incremental --extendedDiagnostics
Files:                   297
…
Types:                  1592
Instantiations:          701
```

With nothing changed, almost no checking happened; after a one-line change, only the affected part was checked again. Notice what did *not* change: all 297 files were still read. In this small project most of the time goes to reading and parsing, so the total time barely moved even though checking nearly vanished. Incremental builds pay off where checking dominates, which is exactly the large, type-heavy projects where you need them.

### The trap: a clean that is not clean

Incremental builds trust the `.tsbuildinfo` file completely. Here is a small package with `"incremental": true` and `"outDir": "dist"`, cleaned the usual way, by deleting `dist`. Watch what the build writes after the clean:

Terminal on your computer

```bash
$ npx tsc
$ ls -A . dist
.:
dist  node_modules  package.json  src  tsconfig.json  tsconfig.tsbuildinfo

dist:
index.d.ts  index.js
$ rm -rf dist
$ npx tsc
$ echo $?
0
$ ls dist
ls: cannot access 'dist': No such file or directory
```

The build succeeded and wrote nothing. The `.tsbuildinfo` file sits next to `tsconfig.json`, where `clean` did not delete it, and it says every output is up to date. `tsc -b` behaves the same way. A `prepublishOnly` script of `npm run clean && npm run build` would publish an empty package, and every step would report success. The ZudoJS repository hit exactly this in four packages; its rule now is that every composite package sets `"tsBuildInfoFile": "./dist/.tsbuildinfo"`, so that deleting `dist` deletes the build information with it:

Terminal on your computer

```bash
# with "tsBuildInfoFile": "dist/.tsbuildinfo"
$ npx tsc
$ rm -rf dist
$ npx tsc
$ ls -A dist
index.d.ts  index.js  .tsbuildinfo
```

A safe habit for any build script: after `clean` and `build`, check that the main output file exists. An exit code of `0` only says the compiler found no errors, not that it wrote anything.

## Project references and parallel builds

Incremental builds make a second run cheaper. **Project references**, from [TypeScript monorepos](https://zudojs.oyinlola.site/learn/ts-monorepos#references), make every run smaller, by splitting one big program into several:

- **Each project checks only its own files** and reads its dependencies' `.d.ts` output, never their source. A 40-package repository is 40 small programs, not one huge one.
- **Unchanged declarations stop the ripple.** As you saw with `tsc -b --verbose`, a change inside a function body rebuilds one package and only re-stamps its dependents.
- **Independent projects build at the same time.** TypeScript 7's `tsc -b` takes `--builders` to set how many projects build concurrently. The build levels from the monorepo lesson (core and logger, then auth and database, then http) are exactly the groups that can run together.
- **Editors load less.** The language service works with the project that contains the open file, so it holds a smaller program in memory.

The costs are the ones from the monorepo lesson: more configuration, references that must match dependencies, and a build step before dependents can be checked. For one application of a few hundred files, a single project with `incremental` is usually enough; references pay off when separate teams, packages or deployables share one repository.

## Finding the expensive type: --generateTrace

When the counts say "something got expensive" but not what, `--generateTrace` records where the checker spent its time:

Terminal on your computer

```bash
$ npx tsc --noEmit --generateTrace trace
$ ls trace
legend.json  trace.json  types_0.json  types_1.json  types_2.json  types_3.json
```

`trace.json` is an event timeline in the Chrome trace format: open it in a trace viewer (such as the Performance panel of Chrome DevTools, or Perfetto) and look for the longest `checkSourceFile`, `checkExpression` or `structuredTypeRelatedTo` spans. The `types_N.json` files list every type the checkers created (one file per checker, which is why there are four), so an ID in a slow span can be looked up there. Start from the widest bars: usually one file, and inside it one expression, account for most of the time. For a quicker first look, `--extendedDiagnostics` on a copy of the project with half the files removed (a binary search, as in [The debugging method](https://zudojs.oyinlola.site/learn/debug-method)) finds the expensive file in a few runs.

## Testing performance: a type-cost budget

REASON IT OUT

### How would you notice a slow type before it reaches main?

Performance problems in types arrive one pull request at a time: a new recursive type here, a larger union there. Before writing a check, decide:

1. Which number should the check compare: check time, or instantiations? Which one gives the same answer on a laptop and on a busy CI machine?
2. What should the check compile: the whole project, or a small file that uses the expensive type the way the application does?
3. Where should the limit come from, and what should happen when a change legitimately needs more?

**Show the reasoning**

1. Instantiations (and types). Times vary with the machine and its load, so a time budget either fails at random or is set so loose that it catches nothing. Counts only change when the code or the TypeScript version changes.
2. A small, focused file keeps the number meaningful: it measures the expensive type itself, not everything else in the project that also grows over time.
3. From a measurement of today's code plus a margin. When a change needs more, raising the budget becomes a visible line in the pull request, which is the point: someone decides, rather than nobody noticing.

The check runs `tsc` with `--extendedDiagnostics` on a file that uses the settings-path type, reads a count, and compares it to a budget. It measures the full-depth `Paths` type and the depth-limited one, on the same settings: four levels with eight keys each, written with named types for each level. Because the levels are named, the compiler works out `Paths<City>` once and reuses it for all 512 cities, so instantiations stay low for both versions. What still grows is the union itself, so this budget is on the **Types** line:

settings.ts

```ts
type City = { k0: number; k1: number; k2: number; k3: number; k4: number; k5: number; k6: number; k7: number };
type State = { c0: City; c1: City; c2: City; c3: City; c4: City; c5: City; c6: City; c7: City };
type Region = { s0: State; s1: State; s2: State; s3: State; s4: State; s5: State; s6: State; s7: State };
export interface ShopSettings { r0: Region; r1: Region; r2: Region; r3: Region; r4: Region; r5: Region; r6: Region; r7: Region }
```

paths-full.ts

```ts
import type { ShopSettings } from "./settings.js";

type Paths<T> = T extends object
  ? { [K in keyof T & string]: K | `${K}.${Paths<T[K]>}` }[keyof T & string]
  : never;

export const example: Paths<ShopSettings> = "r0.s1.c2.k3";
```

paths-capped.ts

```ts
import type { ShopSettings } from "./settings.js";

type Paths<T, Depth extends unknown[] = []> = Depth["length"] extends 2
  ? never
  : T extends object
    ? { [K in keyof T & string]: K | `${K}.${Paths<T[K], [...Depth, unknown]>}` }[keyof T & string]
    : never;

export const example: Paths<ShopSettings> = "r0.s1";
```

type-budget.tsNode.js only

```ts
import { execFileSync } from "node:child_process";

const BUDGET = 3_000;

function typesCreated(file: string): number {
  const output = execFileSync(
    "node_modules/.bin/tsc",
    ["--ignoreConfig", "--noEmit", "--strict", "--module", "nodenext", "--skipLibCheck", "--types", "node", "--extendedDiagnostics", "settings.ts", file],
    { encoding: "utf8" },
  );
  const match = /^Types:\s+(\d+)$/m.exec(output);
  if (!match) throw new Error(`no Types line for ${file}`);
  return Number(match[1]);
}

for (const file of ["paths-full.ts", "paths-capped.ts"]) {
  const count = typesCreated(file);
  console.log(`${file}: ${count <= BUDGET ? "within" : "OVER"} the budget of ${BUDGET.toLocaleString("en-US")} types`);
}
```

Output of `npx tsx type-budget.ts`

```ts
paths-full.ts: OVER the budget of 3,000 types
paths-capped.ts: within the budget of 3,000 types
```

The full-depth type is over budget (its union has 4,680 paths), the capped one well within it (72 paths). The output names no times and no exact counts, so it stays the same across machines and small compiler updates, while a change that multiplies the cost still trips it. Run a check like this in CI next to the type tests, one file per expensive type, and set `process.exitCode = 1` when anything is over budget.

## In production

- **Measure with counts.** Track Types and Instantiations from `--extendedDiagnostics` over time; treat times as local comparisons only.
- **`skipLibCheck: true` day to day**, with a scheduled or pre-release run with it off, and always after touching hand-written declarations.
- **Incremental everywhere**, with `tsBuildInfoFile` inside the output folder so that a clean really is clean. Verify that builds produce files, not just exit codes.
- **Project references** once a repository holds several packages; keep declarations stable so that changes do not ripple.
- **Bound recursive types** with a depth limit, prefer tail recursion, keep unions small, and move string formats with huge numbers of values to runtime checks and branded types.
- **Name and annotate exported types**, which keeps declaration files small and makes `isolatedDeclarations` possible where it fits.
- **Budget expensive types in CI**, and use `--generateTrace` when a budget fails and the cause is not obvious.

## Practice

TRY IT YOURSELF

### Cap the key type

A permissions module builds every permission string as `\`${Resource}:${Action}:${Scope}\``, with 40 resources, 12 actions and 250 scopes (one per branch office). Work out whether the compiler can build that union, and propose a design that keeps the checking useful.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Fill in the three numbers from the task's description: 40 resources, 12 actions, 250 scopes. Multiply all three for the full union, and just the first two for the union without scopes.

HINT 2

`40 * 12 * 250` is 120,000, over the ~100,000-member limit that triggers `TS2590`. `40 * 12` is 480, comfortably small.

SOLUTION

permissions.ts

```ts
const resources = 40;
const actions = 12;
const scopes = 250;
const members = resources * actions * scopes;
console.log(`${members.toLocaleString("en-US")} members: ${members >= 100_000 ? "the compiler refuses (TS2590)" : "allowed, but large"}`);
console.log(`without scopes: ${(resources * actions).toLocaleString("en-US")} members`);
```

Output of `npx tsx permissions.ts` and of the browser terminal

```ts
120,000 members: the compiler refuses (TS2590)
without scopes: 480 members
```

120,000 members is over the limit, and even below it every assignment would compare against a huge union. Type the part that is fixed and small (`\`${Resource}:${Action}\``, 480 members) and treat the scope as data: a branded `BranchId` checked at runtime, or a separate field (`{ permission, scope }`). The compiler checks what it can reason about cheaply; the runtime checks the rest.

TRY IT YOURSELF

### Shrink the declaration

A package exports `export const defaultRates = loadRates();`, where `loadRates` has no return type annotation and returns an object with forty currency entries, each with five fields. Every service that imports the package now has that whole structure spelled out in its view of the package. What do you change, and how do you check that it helped?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

An unannotated exported function's inferred return type gets spelled out in full, wherever it is emitted or hovered. Give the shape a name, and annotate the function with it.

HINT 2

Compare the emitted `.d.ts` before and after (as the settings example in this lesson did), and the Types/Instantiations count a dependent project reports.

SOLUTION

Declare the shape once (`export interface ExchangeRates { … }`, or `Record<CurrencyCode, Rate>` with a `Rate` interface), annotate `loadRates(): ExchangeRates` and `defaultRates: ExchangeRates`. Then compare before and after: the size of the emitted `.d.ts` (as in the [settings example](#declarations), where naming the type removed two full copies of it), and the Types and Instantiations counts of a dependent project. With the annotation in place, turning on `isolatedDeclarations` for the package becomes possible as well.

TRY IT YOURSELF

### Make the build prove it wrote something

Write a `verify-build` step (as a small TypeScript script) that fails when any of a list of expected output files is missing after a build, so that the stale `.tsbuildinfo` trap cannot publish an empty package.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`expected.filter((file) => !existsSync(file))` keeps only the paths that are missing.

HINT 2

The script only creates `dist/index.js` itself (to simulate a partial build), so a correct `verifyBuild` should report `dist/index.d.ts` as missing.

SOLUTION

verify-build.tsNode.js only

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

function verifyBuild(expected: string[]): string[] {
  return expected.filter((file) => !existsSync(file));
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.js", "export {};\n");

const missing = verifyBuild(["dist/index.js", "dist/index.d.ts"]);
if (missing.length > 0) {
  console.log(`build produced no ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("all outputs present");
}
```

Output of `npx tsx verify-build.ts`

```ts
build produced no dist/index.d.ts
```

The script creates only `index.js` itself, to simulate a partial build, so it reports the missing declaration file and sets a failing exit code. In a real project, drop the two setup lines, list the files named in `package.json`'s `exports`, and run it after `build` in `prepublishOnly` and in CI.

## Recap

- `--extendedDiagnostics` shows files, types, instantiations and phase times. Counts are stable and comparable; times are for comparisons on one machine only.
- `skipLibCheck` skips checking every `.d.ts` file, which can remove most of the checking work, and also hides errors in your own declarations. Run without it now and then.
- Recursive, mapped and template literal types can grow exponentially. Bound them with a depth limit, prefer tail recursion, and respect the limits (100,000 union members, TS2589 for depth).
- Declaration emit writes inferred types in full, again and again. Named interfaces and explicit annotations keep `.d.ts` files small; `isolatedDeclarations` takes that further.
- Incremental builds and project references skip unchanged work; keep `tsBuildInfoFile` inside the output folder, and check that builds really write files.
- Guard expensive types with an instantiation budget in CI, and use `--generateTrace` to find the cause when it fails.

This completes Advanced TypeScript. Next, the backend course starts with [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep), where these typed, tested and well-built packages start serving real requests.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
