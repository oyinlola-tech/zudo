---
title: "Debugging TypeScript — ZudoJS Academy"
description: "Read long type errors from the bottom up, make the compiler show inferred types, fix generic inference and module resolution, and tell type from runtime bugs."
source: https://zudojs.oyinlola.site/learn/ts-debugging
---

LEVEL 6 · LESSON 21 OF 22

Libraries and large projects Advanced

# Debugging TypeScript

Read long type errors from the bottom up, make the compiler show inferred types, fix generic inference and module resolution, and tell type from runtime bugs.

- **50 min** to read and try
- **You need:** Testing TypeScript, TypeScript monorepos, Declaration files and The debugging method
- **You build:** A set of diagnosed and fixed failures from a shop codebase: a misleading array error, three inference problems, a module that cannot be found, a file nobody knew was compiled, and a type-correct program that adds ₦2.5 billion to an order

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read a multi-line type error from its most specific line upward, and move the error to the real mistake with annotations or satisfies
- Make the compiler reveal an inferred type without an editor
- Diagnose and fix common generic inference problems, including never[], wrong candidates and unwanted widening (NoInfer)
- Use --traceResolution, --explainFiles and --showConfig to explain module, file and configuration problems
- Decide whether a bug is a type problem or a runtime problem, and find the escape hatch that let bad data in

## The error that blamed the wrong line

A developer builds an order for the checkout. The compiler refuses, with this:

order.ts

```ts
type Currency = "NGN" | "USD";

interface Money {
  kobo: number;
  currency: Currency;
}

interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
}

interface OrderInput {
  customerId: string;
  lines: OrderLine[];
  delivery: { address: string; fee: Money };
}

function createOrder(input: OrderInput): string {
  return `${input.customerId}: ${input.lines.length} lines`;
}

const lines = [
  { sku: "RICE-5KG", quantity: 2, unitPrice: { kobo: 1_250_000, currency: "NGN" } },
  { sku: "OIL-1L", quantity: 1, unitPrice: { kobo: 350_000, currency: "ngn" } },
];

console.log(createOrder({ customerId: "u_ada", lines, delivery: { address: "12 Allen Avenue, Ikeja", fee: { kobo: 150_000, currency: "NGN" } } }));
```

What `npx tsc --noEmit` prints

```ts
order.ts:29:48 - error TS2322: Type '{ sku: string; quantity: number; unitPrice: { kobo: number; currency: string; }; }[]' is not assignable to type 'OrderLine[]'.
  Type '{ sku: string; quantity: number; unitPrice: { kobo: number; currency: string; }; }' is not assignable to type 'OrderLine'.
    The types of 'unitPrice.currency' are incompatible between these types.
      Type 'string' is not assignable to type 'Currency'.

29 console.log(createOrder({ customerId: "u_ada", lines, delivery: { address: "12 Allen Avenue, Ikeja", fee: { kobo: 150_000, currency: "NGN" } } }));
                                                  ~~~~~

  order.ts:16:3 - The expected type comes from property 'lines' which is declared here on type 'OrderInput'
    16   lines: OrderLine[];
         ~~~~~


Found 1 error in order.ts:29
```

The squiggle is under `lines` in the call, and the message says a `currency` is a `string`. The developer checks the rice line, sees `"NGN"`, which is a valid `Currency`, and is confused: the message seems to say that `"NGN"` is a plain string. They start adding `as Currency` to things.

The message is accurate; it is just answering a different question from the one the developer asked. The real mistake is `"ngn"` in lower case on the oil line, and the compiler never mentions it. This lesson is about getting from "the compiler is wrong" to the actual cause quickly, for type errors, for inference that goes the wrong way, for modules that cannot be found, and for bugs that no type error will ever show. You will use the general method from [The debugging method](https://zudojs.oyinlola.site/learn/debug-method) (observe, reproduce, isolate, hypothesise, test), with tools that are specific to the TypeScript compiler.

## Anatomy of a type error

Every `tsc` error has the same parts:

```ts
order.ts:29:48 - error TS2322: Type '{ …; currency: string; }[]' is not assignable to type 'OrderLine[]'.   ← headline
  Type '{ …; currency: string; }' is not assignable to type 'OrderLine'.                                    ← one level deeper
    The types of 'unitPrice.currency' are incompatible between these types.                                  ← deeper
      Type 'string' is not assignable to type 'Currency'.                                                    ← the actual clash

  order.ts:16:3 - The expected type comes from property 'lines' …                                            ← related location
```

The headline compares the outermost types; each indented line zooms in; the last line is the specific clash.

- **Position** (`file:line:column`): where the compiler *noticed* the problem, which is where two types met. That is often not where the mistake was made.
- **Code** (`TS2322`): searchable, and the same across versions and languages.
- **Elaboration chain**: the indented lines. Each one descends one level into the structure. **Read it from the bottom up**: the deepest line is the smallest pair of types that do not fit.
- **Related information**: the extra location at the end, here where the expected type was declared.

Applied to the order: the deepest line says a `string` met `Currency` at `unitPrice.currency`. Why is it `string` and not `"ngn"`? Because `lines` was declared without a type. When TypeScript infers the type of an array of objects written in a variable, it **widens** string literals to `string`: nothing told it that `currency` should stay a literal. So *both* lines have `currency: string`, the mistake was lost at the declaration, and the error appears later, at the call, about the whole array.

### Move the error to the mistake

The fix for the reading problem is to state the intended type where the value is written. Either annotate the variable, or use `satisfies`, which checks the value against the type but keeps the value's own precise type:

order.ts

```ts
type Currency = "NGN" | "USD";

interface Money {
  kobo: number;
  currency: Currency;
}

interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
}

const lines = [
  { sku: "RICE-5KG", quantity: 2, unitPrice: { kobo: 1_250_000, currency: "NGN" } },
  { sku: "OIL-1L", quantity: 1, unitPrice: { kobo: 350_000, currency: "ngn" } },
] satisfies OrderLine[];
```

What `npx tsc --noEmit` prints

```ts
order.ts:16:61 - error TS2820: Type '"ngn"' is not assignable to type 'Currency'. Did you mean '"NGN"'?

16   { sku: "OIL-1L", quantity: 1, unitPrice: { kobo: 350_000, currency: "ngn" } },
                                                               ~~~~~~~~

  order.ts:5:3 - The expected type comes from property 'currency' which is declared here on type 'Money'
    5   currency: Currency;
        ~~~~~~~~


Found 1 error in order.ts:16
```

Now the error sits on the exact property, names the exact value, and even suggests the fix. This is the most useful habit in the whole lesson: **when an error is far from its cause, add types closer to the data**, and the compiler will point at the cause. Once fixed, the program runs:

order-fixed.ts

```ts
type Currency = "NGN" | "USD";

interface Money {
  kobo: number;
  currency: Currency;
}

interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
}

const lines: OrderLine[] = [
  { sku: "RICE-5KG", quantity: 2, unitPrice: { kobo: 1_250_000, currency: "NGN" } },
  { sku: "OIL-1L", quantity: 1, unitPrice: { kobo: 350_000, currency: "NGN" } },
];

const total = lines.reduce((sum, line) => sum + line.unitPrice.kobo * line.quantity, 0);
console.log(`${lines.length} lines, ₦${(total / 100).toFixed(2)}`);
```

Output of `npx tsx order-fixed.ts` and of the browser terminal

```ts
2 lines, ₦28500.00
```

### Codes you will meet most

| Code | Meaning | Look first at |
| --- | --- | --- |
| TS2322 | A value is not assignable to a declared type | The deepest line of the chain |
| TS2345 | An argument does not fit a parameter | The parameter's type, and how the argument's type was inferred |
| TS2741 / TS2739 | A required property (or several) is missing | The object literal and the "is declared here" location |
| TS2339 | Property does not exist on a type | Whether the value was narrowed, or the type is wider than you think |
| TS2820 | Like TS2322, with a "Did you mean" suggestion | The suggestion: usually a typo in a literal |
| TS2769 | No overload matches this call | The last overload's error (shown), then the others |
| TS18046 / TS18047 / TS18048 | Value is `unknown` / possibly `null` / possibly `undefined` | A missing check, or a missing narrowing |
| TS7006 / TS7053 | Implicit `any`: a parameter, or an index | A missing annotation where inference had nothing to go on |
| TS2307 / TS7016 | Module not found / found but untyped | `--traceResolution`, below |

## Before you touch the code

REASON IT OUT

### What is this error really telling you?

A build prints six errors in `packages/http/src/app.ts`. Before changing anything, answer:

1. Is the first error the cause of the others? How would you tell?
2. For each type in the headline: did it come from an annotation you wrote, from inference, or from a declaration file? Which of those can be wrong?
3. Is the position the place where the mistake was made, or the place where two types met?
4. Is this a problem with the types at all? Could the program already be misbehaving at runtime with no type error, or be fine at runtime despite the error?

**Show the reasoning**

1. Fix and re-check the *first* error before reading the rest. If an import fails (TS2307), everything imported from it becomes an error type, and later lines report nonsense such as "`error` is of type `unknown`" after an `instanceof` check that should have narrowed it. The example below shows exactly that.
2. Annotations say what you intended, inference says what you wrote, declaration files say what someone else claims. Any of them can be wrong: an annotation can be too strict, inference can widen, and a declaration can lie ([Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations#trust)).
3. Usually where they met. Walk backwards from the position to where the value got its type, as with the `lines` array.
4. Type errors describe the code, not the data. A clean compile says nothing about a JSON body that has a string where the type says number; and an error may be the compiler being cautious about a case your data never has. The last section of this lesson is about telling the two apart.

Here is the cascade from point 1, on the [shop monorepo](https://zudojs.oyinlola.site/learn/ts-monorepos), when `http` is compiled on its own before its dependencies are built:

Terminal on your computer

```bash
$ npx tsc -p packages/http
packages/http/src/app.ts:1:30 - error TS2307: Cannot find module '@shop/auth' or its corresponding type declarations.
…
packages/http/src/app.ts:2:53 - error TS2307: Cannot find module '@shop/core' or its corresponding type declarations.
…
packages/http/src/app.ts:30:51 - error TS18046: 'error' is of type 'unknown'.

30       if (error instanceof DomainError) return `${error.code === "UNAUTHENTICATED" ? 401 : 404} ${error.code}`;
                                                     ~~~~~
```

The TS18046 is not a real problem in that line. `DomainError` could not be resolved, so `instanceof DomainError` narrows nothing. Build the dependencies (`tsc -b`) and all six errors disappear together.

## Making the compiler show you a type

An editor shows the inferred type of anything you hover over, and that is the first tool to reach for. When you only have a terminal (in CI, over SSH, or in a code review), you can make `tsc` print a type by assigning the value to something it cannot possibly be. `never` is the usual choice, since nothing is assignable to it:

probe.ts

```ts
const orders = [
  { id: "ord_1", status: "paid", totalKobo: 250_000 },
  { id: "ord_2", status: "pending", totalKobo: 90_000 },
] as const;

const firstPaid = orders.find((o) => o.status === "paid");

const probe: never = firstPaid;
```

What `npx tsc --noEmit` prints

```ts
probe.ts:8:7 - error TS2322: Type '{ readonly id: "ord_1"; readonly status: "paid"; readonly totalKobo: 250000; } | undefined' is not assignable to type 'never'.
  Type 'undefined' is not assignable to type 'never'.

8 const probe: never = firstPaid;
        ~~~~~


Found 1 error in probe.ts:8
```

The message spells out the full type of `firstPaid`, and it holds a small surprise: not "either order", but exactly the *paid* order object, or `undefined`. Because of `as const`, each order has a literal `status`, and TypeScript worked out that the callback `o.status === "paid"` can only return `true` for the first one, so it narrowed the result of `find` (an **inferred type predicate**). Seeing the real type ends guesswork like this. Delete the probe when you are done. To see a *type* rather than a value's type, declare a value of it first: `declare const sample: SomeType; const probe: never = sample;`. The type tests from [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing#type-tests) are the permanent version of a probe: once you know what a type should be, pin it with `expectTypeOf`.

> TIP
>
> Run `npx tsc --noEmit --pretty false` when you want one line per error (for `grep`, or to paste into an issue), and plain `npx tsc --noEmit` for the readable version with code excerpts. When there are many errors, the pretty output ends with an "Errors Files" table that shows which file to open first.

## When inference goes the wrong way

Most "impossible" type errors in everyday code are inference doing exactly what it was designed to do, with less information than you assumed. Four patterns cover most of them.

### 1. The first candidate wins

`firstOr` returns the first item of a list, or a fallback:

first-or.ts

```ts
function firstOr<T>(items: readonly T[], fallback: T): T {
  return items[0] ?? fallback;
}

const cheapest = firstOr([2500, 1200], "none");
```

What `npx tsc --noEmit` prints

```ts
first-or.ts:5:40 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

5 const cheapest = firstOr([2500, 1200], "none");
                                         ~~~~~~


Found 1 error in first-or.ts:5
```

TypeScript inferred `T = number` from the array, then checked the fallback against it. The error is on `"none"`, although the real question is a design one: should the result be `number | string`? If yes, give the fallback its own type parameter:

first-or.ts

```ts
function firstOr<T, F>(items: readonly T[], fallback: F): T | F {
  return items[0] ?? fallback;
}

const cheapest = firstOr([2500, 1200], "none");
const nothing = firstOr([] as number[], "none");
console.log(cheapest, nothing);
```

Output of `npx tsx first-or.ts` and of the browser terminal

```ts
2500 none
```

### 2. An empty array with nothing to go on

cart.ts

```ts
const cart = { id: "C-1", skus: [] };
cart.skus.push("RICE-5KG");
```

What `npx tsc --noEmit` prints

```ts
cart.ts:2:16 - error TS2345: Argument of type '"RICE-5KG"' is not assignable to parameter of type 'never'.

2 cart.skus.push("RICE-5KG");
                 ~~~~~~~~~~


Found 1 error in cart.ts:2
```

An empty array inside an object literal has no elements to infer from, so its type is `never[]`: an array that can hold nothing. The message mentions `never`, which is the clue. Annotate what the array is for: `const cart: { id: string; skus: string[] } = …`, or `skus: [] as string[]`.

### 3. An accumulator that starts as {}

totals.ts

```ts
const orders = [
  { status: "paid", kobo: 250_000 },
  { status: "pending", kobo: 90_000 },
  { status: "paid", kobo: 40_000 },
];

const totals = orders.reduce((acc, order) => {
  acc[order.status] = (acc[order.status] ?? 0) + order.kobo;
  return acc;
}, {});
```

What `npx tsc --noEmit` prints

```ts
totals.ts:8:3 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{}'.
  No index signature with a parameter of type 'string' was found on type '{}'.

8   acc[order.status] = (acc[order.status] ?? 0) + order.kobo;
    ~~~~~~~~~~~~~~~~~

totals.ts:8:24 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{}'.
  No index signature with a parameter of type 'string' was found on type '{}'.

8   acc[order.status] = (acc[order.status] ?? 0) + order.kobo;
                         ~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: totals.ts:8
```

`reduce` infers the accumulator's type from the initial value, and `{}` is an object type with no properties, so indexing it by a string is an implicit `any` (TS7053). Tell `reduce` what you are building, with a type argument:

totals.ts

```ts
const orders = [
  { status: "paid", kobo: 250_000 },
  { status: "pending", kobo: 90_000 },
  { status: "paid", kobo: 40_000 },
];

const totals = orders.reduce<Record<string, number>>((acc, order) => {
  acc[order.status] = (acc[order.status] ?? 0) + order.kobo;
  return acc;
}, {});
console.log(totals);
```

Output of `npx tsx totals.ts` and of the browser terminal

```json
{ paid: 290000, pending: 90000 }
```

### 4. Inference that is too generous: NoInfer

The opposite problem is worse, because there is no error at all. A tiny state-machine helper takes the list of states and the initial state:

machine.ts

```ts
function createMachine<S extends string>(states: readonly S[], initial: S) {
  return { states, current: initial };
}

const order = createMachine(["pending", "paid", "cancelled"], "shipped");
console.log(order.current, order.states.includes(order.current));
```

Output of `npx tsx machine.ts` and of the browser terminal

```ts
shipped false
```

`"shipped"` is not one of the states, yet it compiled. TypeScript collects *candidates* for `S` from both arguments and infers the union of all four strings, so `"shipped"` fits by definition. A `never` probe on `order.current` would show `"pending" | "paid" | "cancelled" | "shipped"`. The `NoInfer<T>` utility type says "check against `T`, but do not use this argument to infer it":

machine.ts

```ts
function createMachine<S extends string>(states: readonly S[], initial: NoInfer<S>) {
  return { states, current: initial };
}

const order = createMachine(["pending", "paid", "cancelled"], "shipped");
```

What `npx tsc --noEmit` prints

```ts
machine.ts:5:63 - error TS2345: Argument of type '"shipped"' is not assignable to parameter of type '"cancelled" | "paid" | "pending"'.

5 const order = createMachine(["pending", "paid", "cancelled"], "shipped");
                                                                ~~~~~~~~~


Found 1 error in machine.ts:5
```

When a generic function accepts something it should not, ask: which arguments are *sources* of the type, and which should only be *checked* against it? Mark the second kind with `NoInfer`. The same question debugs the first pattern: `firstOr`'s fallback was treated as a check, and the fix made it a source. You can always pass type arguments explicitly (`firstOr<number | string>(…)`) to see what the function does when inference is taken out of the picture.

## "Cannot find module": tracing resolution

TS2307 means the compiler looked for a module and did not find it. `--traceResolution` prints every step of every lookup; it is long, so filter it to the module you care about. Here it is for the monorepo case above, where `@shop/auth` had not been built:

Terminal on your computer

```bash
$ npx tsc -p packages/http --noEmit --traceResolution
…
======== Resolving module '@shop/auth' from '~/naija-shop/packages/http/src/app.ts'. ========
Explicitly specified module resolution kind: 'NodeNext'.
Resolving in ESM mode with conditions 'import', 'types', 'node'.
…
Loading module '@shop/auth' from 'node_modules' folder, target file types: TypeScript, JavaScript, Declaration, JSON.
Searching all ancestor node_modules directories for preferred extensions: TypeScript, Declaration.
Directory '~/naija-shop/packages/http/src/node_modules' does not exist, skipping all lookups in it.
Directory '~/naija-shop/packages/http/node_modules' does not exist, skipping all lookups in it.
Directory '~/naija-shop/packages/node_modules' does not exist, skipping all lookups in it.
Found 'package.json' at '~/naija-shop/node_modules/@shop/auth/package.json'.
Entering conditional exports.
Matched 'exports' condition 'types'.
Using 'exports' subpath '.' with target './dist/index.d.ts'.
File '~/naija-shop/node_modules/@shop/auth/dist/index.d.ts' does not exist.
Failed to resolve under condition 'types'.
…
======== Module name '@shop/auth' was not resolved. ========
```

Read a trace like a story, and stop at the first line that surprises you:

1. **Mode and conditions**: ESM mode with `import`, `types`, `node`. If you expected CommonJS, the problem is `"type"` in `package.json` or the file extension.
2. **Where it searched**: up through `node_modules` folders. If it never finds the `package.json`, the package is not installed where this file can see it (a phantom or missing dependency).
3. **Which `exports` entry and condition matched**, and which file that pointed to. Here everything was right until `dist/index.d.ts` *does not exist*: the package was never built.

The same three questions explain most TS2307s: wrong mode, not installed, or the `exports` target is missing (not built, not published, or not listed in `files`, as in [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#problem)). When the trace ends in a `.js` file with no declaration beside it, you get TS7016 instead, and the fix is a declaration file.

## "Why is this file even compiled?"

An orders service fails its type check in a file nobody on the team recognises:

Terminal on your computer

```bash
$ npx tsc --noEmit
scripts/backfill-2024.ts:4:48 - error TS2741: Property 'totalKobo' is missing in type '{ id: string; total: number; }' but required in type 'Order'.

4 for (const row of rows) console.log(orderLabel(row));
                                                 ~~~

  src/orders.ts:3:3 - 'totalKobo' is declared here.
    3   totalKobo: number;
        ~~~~~~~~~


Found 1 error in scripts/backfill-2024.ts:4
```

A one-off script from two years ago, written against an older `Order` type. But why is it part of the build? `--explainFiles` gives the reason for every file in the program:

Terminal on your computer

```bash
$ npx tsc --noEmit --explainFiles
…
src/orders.ts
   Imported via "../src/orders.js" from file 'scripts/backfill-2024.ts'
   Imported via "./orders.js" from file 'src/legacy-report.ts'
   Matched by default include pattern '**/*'
…
scripts/backfill-2024.ts
   Matched by default include pattern '**/*'
   File is ECMAScript module because 'package.json' has field "type" with value "module"
…
```

"Matched by default include pattern `'**/*'`": the `tsconfig.json` has no `include`, so every `.ts` file under the folder is compiled, scripts and all. The fix is a decision, not a cast: delete the dead script, fix it, or give the project an explicit `"include": ["src", "tests"]`. The same command answers "why is this `@types` package loaded?" (look for `Entry point for implicit type library`) and "why does this file count as CommonJS?" (the `File is … module because` lines).

### What configuration is actually in effect?

With `extends` chains, command-line flags and options that switch on other options, the settings you read in one file are rarely the whole story. `--showConfig` prints the final, merged configuration and the list of files, without compiling:

Terminal on your computer

```bash
$ npx tsc --showConfig -p packages/http
{
    "compilerOptions": {
        "composite": true,
        "declaration": true,
        "declarationMap": true,
        "module": "nodenext",
        "moduleResolution": "nodenext",
        "outDir": "./dist",
        "rootDir": "./src",
        "skipLibCheck": true,
        "strict": true,
        "sourceMap": true,
        "target": "es2024",
        "tsBuildInfoFile": "./dist/.tsbuildinfo",
        "types": [
            "node"
        ],
        "verbatimModuleSyntax": true,
        "moduleDetection": "force",
        "isolatedModules": true,
        "preserveConstEnums": true,
        "incremental": true
    },
…
    "files": [
        "./src/app.ts",
        "./src/index.ts",
        "./src/main.ts"
    ],
…
}
```

Everything from `tsconfig.base.json` is merged in, and the last four options were never written anywhere: they are **implied** by others (`verbatimModuleSyntax` implies `isolatedModules`, `composite` implies `incremental`, and `module: nodenext` sets `moduleDetection`). When a setting "does not work", check here first that it is really set.

## Build problems

Some failures come from what is on disk rather than what is in the code. The symptoms and their usual causes:

| Symptom | Usual cause | Check with |
| --- | --- | --- |
| TS2307 for an internal package, only sometimes | Build order: a missing project reference, or a phantom dependency | `tsc -b --verbose`, the boundary check from [TypeScript monorepos](https://zudojs.oyinlola.site/learn/ts-monorepos#failures) |
| A change has no effect when the program runs | Running stale output: `dist` from an older build, or a stray compiled `.js` next to the source | Delete `dist` and rebuild; look at the timestamps of the files that run |
| The build "succeeds" and writes nothing | A stale `.tsbuildinfo` that survived a clean | Where `tsBuildInfoFile` points ([Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance#incremental)) |
| Errors in `node_modules` type files | Two versions of a type package, or a `lib`/`types` mismatch | `--explainFiles`, `npm ls @types/node` |
| Works in the editor, fails in CI (or the reverse) | Different TypeScript versions, or the editor uses a different `tsconfig.json` | `npx tsc -v` in both places, `--showConfig` |

For all of them, the most reliable first step is the one CI takes: a clean checkout, a fresh install, and a full build. If the problem disappears, it lived in leftover files; if it stays, you have a reproduction.

## Type bug or runtime bug?

The last kind of TypeScript bug has no type error at all. An order comes back from the payments API, and the checkout adds the ₦1,500 delivery fee:

checkout.ts

```ts
interface Order {
  id: string;
  totalKobo: number;
}

const DELIVERY_FEE_KOBO = 150_000;

function totalWithDelivery(order: Order): string {
  return `₦${((order.totalKobo + DELIVERY_FEE_KOBO) / 100).toFixed(2)}`;
}

const body = '{"id": "ord_7", "totalKobo": "250000"}';
const order = JSON.parse(body) as Order;
console.log(order.id, totalWithDelivery(order));
```

Output of `npx tsx checkout.ts` and of the browser terminal

```ts
ord_7 ₦2500001500.00
```

₦4,000 of goods and delivery became ₦2.5 billion. The type check is clean, the code is "correct", and it is wrong. Debugging this with the type system is hopeless, because the types are exactly what the code claims. Debug it as a runtime problem, following the value:

1. **Observe the value, not the type.** Log (or inspect in the debugger, as in [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools)) `typeof order.totalKobo` at the place where it is used. It prints `string`, while the type says `number`.
2. **Find where the type was claimed.** The value came from outside, so somewhere a type was asserted rather than checked. Look for the **escape hatches**: `as`, `any`, `!`, `@ts-ignore`, `JSON.parse` and hand-written declarations. Here it is `JSON.parse(body) as Order`.
3. **Replace the claim with a check.** Parse the data at the boundary, and fail loudly when it is wrong.

checkout-fixed.ts

```ts
interface Order {
  id: string;
  totalKobo: number;
}

function parseOrder(json: string): Order {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) throw new TypeError("order must be an object");
  const { id, totalKobo } = data as Record<string, unknown>;
  if (typeof id !== "string") throw new TypeError("order.id must be a string");
  if (typeof totalKobo !== "number" || !Number.isSafeInteger(totalKobo)) {
    throw new TypeError(`order.totalKobo must be whole kobo, got ${JSON.stringify(totalKobo)}`);
  }
  return { id, totalKobo };
}

try {
  parseOrder('{"id": "ord_7", "totalKobo": "250000"}');
} catch (error) {
  console.log((error as Error).message);
}
console.log(parseOrder('{"id": "ord_8", "totalKobo": 250000}'));
```

Output of `npx tsx checkout-fixed.ts` and of the browser terminal

```ts
order.totalKobo must be whole kobo, got "250000"
{ id: 'ord_8', totalKobo: 250000 }
```

The error now appears where the bad data enters, with the value in the message, instead of as a strange total three functions later. [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) does the same job with schemas. When you review code, you can list the escape hatches mechanically; this small scanner is enough to start a conversation:

hatches.ts

```ts
const source = `const order = JSON.parse(body) as Order;
const fee = settings.fee!;
// @ts-ignore legacy formatter
const label = format(order);
function old(x: any) { return x.total; }
const safe = parseOrder(body);`;

const patterns: [string, RegExp][] = [
  ["as", /\bas\s+(?!const\b)[A-Z]\w*/],
  ["non-null !", /\w!(?=[.;,)\s])/],
  ["@ts-ignore", /@ts-ignore/],
  ["any", /:\s*any\b/],
];

source.split("\n").forEach((line, i) => {
  const hits = patterns.filter(([, re]) => re.test(line)).map(([name]) => name);
  if (hits.length) console.log(`line ${i + 1}: ${hits.join(", ")}`);
});
```

Output of `npx tsx hatches.ts` and of the browser terminal

```ts
line 1: as
line 2: non-null !
line 3: @ts-ignore
line 5: any
```

Each line it lists is a place where a person told the compiler "trust me". Most are fine; one of them is usually where a runtime bug that "cannot happen" came from. Some teams enforce the same with lint rules (for example banning `any` and unchecked `as` outside boundary code).

The reverse case also exists: a type error for a situation that cannot happen at runtime. Resist the `as`. First try to express the reason it cannot happen in the types (a narrower parameter, a discriminated union, an assertion function that checks), because the next person to change the code will not know the reason, and the compiler will.

## In production

- **Annotate at boundaries**: exported functions, configuration objects and data tables. Errors then appear at the mistake instead of three calls later.
- **Fix the first error first**, re-run, and only then read the rest.
- **Keep the diagnostic commands in reach**: `--traceResolution` for "cannot find module", `--explainFiles` for "why is this compiled", `--showConfig` for "which settings apply", `tsc -b --verbose` for "why was this rebuilt".
- **Treat escape hatches as debt**: every `as`, `any`, `!` and `@ts-ignore` is a place where the compiler stopped protecting you. Keep them at boundaries, next to a runtime check.
- **Reproduce from clean** before blaming TypeScript: fresh install, deleted `dist`, the same TypeScript version as CI.
- **Pin what you learn**: when you debug a surprising type, add a type test for it so the surprise cannot come back.

## Practice

TRY IT YOURSELF

### Move the error

This configuration produces one TS2322 on the call to `startServer`, about `limits`. Without running it, find the real mistake, then rewrite the code so that the compiler reports it on the exact line.

```ts
interface Limits { maxOrderKobo: number; currency: "NGN" | "USD" }
interface ServerConfig { port: number; limits: Limits[] }
declare function startServer(config: ServerConfig): void;

const limits = [
  { maxOrderKobo: 50_000_000, currency: "NGN" },
  { maxOrderKobo: 1_000_00, currency: "usd" },
];
startServer({ port: 8080, limits });
```

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The array's element type is inferred as `{ maxOrderKobo: number; currency: string }`, so the mismatch only shows up where it meets `Limits[]`: at the call. Check each element where it is written instead.

HINT 2

Drop `ServerConfig`/`startServer` from this file entirely, and write `const limits = [ ... ] satisfies Limits[];`. The error now names the exact line and property.

SOLUTION

limits.ts

```ts
interface Limits {
  maxOrderKobo: number;
  currency: "NGN" | "USD";
}

const limits = [
  { maxOrderKobo: 50_000_000, currency: "NGN" },
  { maxOrderKobo: 1_000_00, currency: "usd" },
] satisfies Limits[];
```

What `npx tsc --noEmit` prints

```ts
limits.ts:8:29 - error TS2820: Type '"usd"' is not assignable to type '"NGN" | "USD"'. Did you mean '"USD"'?

8   { maxOrderKobo: 1_000_00, currency: "usd" },
                              ~~~~~~~~

  limits.ts:3:3 - The expected type comes from property 'currency' which is declared here on type 'Limits'
    3   currency: "NGN" | "USD";
        ~~~~~~~~


Found 1 error in limits.ts:8
```

The mistake is `"usd"` in lower case. In the original, `limits` was inferred with `currency: string`, so the error could only appear at the call and only about the whole array. `satisfies Limits[]` checks each element where it is written. (`1_000_00` is legal, since numeric separators can go anywhere between digits, but it looks like a typo for `1_000_000`; a reviewer should ask.)

TRY IT YOURSELF

### Stop the extra state

A helper `pickDefault(options, preferred)` returns `preferred` if it is one of the options. With the signature below, `pickDefault(["card", "transfer"], "cash")` compiles. Change the signature so that it does not, and explain what changed.

```ts
function pickDefault<T extends string>(options: readonly T[], preferred: T): T
```

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Both arguments currently contribute to inferring `T`, so `T` becomes the union of everything passed, including `"cash"`. Stop `preferred` from contributing.

HINT 2

`function pickDefault<T extends string>(options: readonly T[], preferred: NoInfer<T>): T` — now `T` comes only from `options`, and `preferred` is checked against it.

SOLUTION

pick.ts

```ts
function pickDefault<T extends string>(options: readonly T[], preferred: NoInfer<T>): T {
  return options.includes(preferred) ? preferred : options[0]!;
}

const method = pickDefault(["card", "transfer"], "cash");
```

What `npx tsc --noEmit` prints

```ts
pick.ts:5:50 - error TS2345: Argument of type '"cash"' is not assignable to parameter of type '"card" | "transfer"'.

5 const method = pickDefault(["card", "transfer"], "cash");
                                                   ~~~~~~


Found 1 error in pick.ts:5
```

Before, both arguments were inference sources, so `T` became `"card" | "transfer" | "cash"` and `"cash"` fitted by definition. `NoInfer<T>` removes `preferred` from inference: `T` comes only from `options`, and `preferred` is checked against it.

TRY IT YOURSELF

### Read the trace

A trace for `import { formatNaira } from "@naija-shop/naira"` ends like this. What is wrong, and what are two ways it could have happened?

```ts
Found 'package.json' at '~/shop-app/node_modules/@naija-shop/naira/package.json'.
Entering conditional exports.
Matched 'exports' condition 'types'.
Using 'exports' subpath '.' with target './dist/index.d.ts'.
File '~/shop-app/node_modules/@naija-shop/naira/dist/index.d.ts' does not exist.
Failed to resolve under condition 'types'.
```

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

The trace never says the package or its `exports` map are wrong. It stops at one specific, named file. What does that file's absence tell you about how the package got there?

HINT 2

`ls node_modules/@naija-shop/naira/dist` tells you which of the two causes you have: an unbuilt workspace package, or a broken published one.

SOLUTION

The package is installed and its `exports` map is read correctly, but the declaration file it promises is not in the installed package. Either it was never published (the `files` field left it out, exactly the 1.0.0 release in [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#problem)), or, for a workspace package, it was never built (the `dist` folder does not exist yet). `ls node_modules/@naija-shop/naira/dist` tells you which: an empty or missing folder in a workspace means "build it"; a folder with only `.js` files from the registry means "the package is broken; tell its authors, and add a local declaration meanwhile".

## Recap

- An error's position is where types met, not necessarily where the mistake is. Read the elaboration chain from the bottom up, and add annotations or `satisfies` near the data to move the error to the cause.
- Fix the first error first: failed imports cascade into nonsense errors further down.
- Make `tsc` show a type by assigning it to `never`; pin what you learn with a type test.
- Inference problems: the first candidate wins, empty arrays become `never[]`, `reduce` takes its type from the initial value, and generous inference accepts bad values (fix with `NoInfer`).
- `--traceResolution` explains TS2307, `--explainFiles` explains why a file is compiled, `--showConfig` shows the settings really in effect.
- A runtime bug with a clean type check came in through an escape hatch. Follow the value, find the `as` or `any`, and replace the claim with a check.

Next: [Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance), where you measure what the compiler spends its time on and keep a large project fast to check.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
