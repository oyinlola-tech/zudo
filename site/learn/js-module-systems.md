---
title: "Module systems in depth — ZudoJS Academy"
description: "See how ES modules and CommonJS load and interoperate in Node.js 24, resolve packages via exports, load plugins with import(), and untangle circular imports."
source: https://zudojs.oyinlola.site/learn/js-module-systems
---

LEVEL 4 · LESSON 20 OF 20

Errors and modules in depth Core

# Module systems in depth

See how ES modules and CommonJS load and interoperate in Node.js 24, resolve packages via exports, load plugins with import(), and untangle circular imports.

- **60 min** to read and try
- **You need:** Modules, Designing error handling and Symbols
- **You build:** A shipping-carrier plugin loader that imports carriers by name with dynamic import(), validates them, reports failures with causes, and is tested with good and broken plugins

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how ESM (parse, link, evaluate) and CommonJS (run on require) load code, and predict the consequences
- Decide which system Node uses for a file, and mix the two: import CommonJS from ESM and require ESM from CommonJS in Node 24
- Tell live bindings from copied values
- Resolve relative, bare and #imports specifiers, and design a package.json exports map
- Load plugins with dynamic import() safely, and know what top-level await costs
- Diagnose circular imports in both systems from their symptoms and break the cycle

## The import that works in one file and not in another

A shop's backend is moving to ES modules. The payment code is an older CommonJS file that nobody wants to touch yet. The new checkout imports two functions from it, and crashes before running a single line:

package.json

```json
{ "type": "module" }
```

payments.cjsNode.js only

```ts
function charge(orderId, kobo) {
  return `charged ${orderId} ₦${kobo / 100}`;
}
function refund(chargeId) {
  return `refunded ${chargeId}`;
}

exports.charge = charge;
for (const [name, fn] of Object.entries({ refund })) module.exports[name] = fn;
```

checkout.jsNode.js only

```ts
import { charge, refund } from "./payments.cjs";

console.log(charge("ORD-7", 2327850), refund("ch_1"));
```

main.jsNode.js only

```ts
try {
  await import("./checkout.js");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

import payments, { charge } from "./payments.cjs";
console.log(Object.keys(payments), typeof charge);
```

Output of `node main.js`

```ts
SyntaxError: Named export 'refund' not found. The requested module './payments.cjs' is a CommonJS module, which may not support all module.exports as named exports.
CommonJS modules can always be imported via the default export, for example using:

import pkg from './payments.cjs';
const { charge, refund } = pkg;

[ 'charge', 'refund' ] function
```

Both functions exist at run time: the default import shows them. Yet the named import of `charge` works and the named import of `refund` does not. Nothing about `refund` is broken; it was just added in a way the loader could not *see*, because it was added by a loop instead of a plain `exports.refund = …` line.

[Modules](https://zudojs.oyinlola.site/learn/js-modules) taught you to write ES modules, read CommonJS, and avoid circular imports. This lesson explains the machinery underneath: two module systems that load code in fundamentally different ways, how Node.js 24 lets them work together (including `require` of an ES module, new in recent versions), how a name like `"@zudojs/errors"` becomes a file, how to load code whose name you only learn at run time, and why circular imports fail the way they do. Every message you meet in this lesson, like the one above, comes from real runs. By the end you can read each one and know what to change.

## Two systems, side by side

JavaScript had no module system until ES2015. Node.js, which needed one from the start, invented **CommonJS** (CJS): a `require` function and a `module.exports` object. The language later standardised **ES modules** (ESM): `import` and `export` syntax, which browsers and Node.js both support. Node.js runs both, and a large part of the npm ecosystem is still CommonJS, so you will work with both for years.

|  | ES modules | CommonJS |
| --- | --- | --- |
| Syntax | `import` / `export` (keywords) | `require()` / `module.exports` (a function and an object) |
| When imports are found | Before any code runs: the file is parsed and every import is known | While the code runs, when execution reaches a `require` call |
| Loading | Asynchronous-capable; supports top-level `await` | Synchronous: `require` returns when the file has run |
| What you receive | **Live bindings** to the exporter's variables | The value of `module.exports` at that moment |
| Strict mode | Always | Only with `"use strict"` |
| Top-level `this` | `undefined` | `module.exports` |
| File location | `import.meta.url`, `import.meta.dirname`, `import.meta.filename` | `__dirname`, `__filename` |
| Relative paths | Must include the extension: `"./money.js"` | Extension optional; `"./money"` tries `.js`, `.json`, `/index.js` |
| Runs in browsers | Yes, natively | Only through a bundler |

The differences are easy to see side by side. The same three checks, in one file of each kind:

where.cjsNode.js only

```ts
total = 5;
console.log("cjs: sloppy mode allowed a global:", total);
console.log("cjs: this is module.exports:", this === module.exports);
console.log("cjs: file helpers:", typeof __dirname, typeof require);
```

Output of `npx tsx where.cjs`

```ts
cjs: sloppy mode allowed a global: 5
cjs: this is module.exports: true
cjs: file helpers: string function
```

where.jsNode.js only

```ts
try {
  total = 5;
} catch (error) {
  console.log(`esm: ${error.name}: ${error.message}`);
}
console.log("esm: this is", this);
console.log("esm: file helpers:", typeof import.meta.dirname, typeof require, import.meta.filename.endsWith("where.js"));
```

Output of `node where.js`

```ts
esm: ReferenceError: total is not defined
esm: this is undefined
esm: file helpers: string undefined true
```

The CommonJS file silently created a global variable from a typo-like assignment; the ES module refused, because modules are always strict. `require` and `__dirname` simply do not exist in an ES module; `import.meta` replaces them.

### How Node.js decides which system a file uses

1. `.mjs` files are always ES modules; `.cjs` files are always CommonJS.
2. A `.js` file follows the `"type"` field of the nearest `package.json` above it: `"module"` means ESM, `"commonjs"` (or no field) means CommonJS.
3. With no `"type"` field, Node.js 24 also looks at the syntax: a `.js` file that uses `import`/`export` and cannot be CommonJS is run as ESM, with a warning suggesting you add `"type"`. Do not rely on this guess; set the field.

So the same code can mean different things depending on a file you are not looking at. Here a project's `package.json` has no `"type"`, so `report.js` is CommonJS:

package.json

```json
{ "name": "legacy-reports", "version": "1.0.0" }
```

report.jsNode.js only

```ts
const { format } = require("node:util");
console.log(format("module system: %s", typeof module === "object" ? "CommonJS" : "ESM"));
```

Output of `node report.js`

```ts
module system: CommonJS
```

> TIP
>
> Set `"type": "module"` in every new project, use `.cjs` for the occasional CommonJS file (some tools' config files still need it), and never leave the choice to detection.

## ESM: parse, link, evaluate

ES modules load in three phases, and nearly every ESM behaviour follows from them:

1. **Parse**: read each file and find its `import` and `export` declarations, without running anything. Because they are keywords at the top level, not function calls, they can be found by reading. That is why an `import` cannot be inside an `if`.
2. **Link**: follow every import to its file, parse those, and connect each imported name to the exporting module's variable. If a name is not exported, loading stops here, before any code runs.
3. **Evaluate**: run the module bodies, dependencies first, each exactly once.

CommonJS has no separate phases: `require` is a function that runs the other file when execution reaches it. The difference shows when an import is wrong. The ES module fails before its first line runs; the CommonJS file runs until it trips over the missing value:

orders.jsNode.js only

```ts
export function createOrder(id) {
  return { id, status: "new" };
}
```

orders.cjsNode.js only

```ts
exports.createOrder = (id) => ({ id, status: "new" });
```

app-esm.jsNode.js only

```ts
console.log("app-esm.js started");
import { createOrder, cancelOrder } from "./orders.js";
cancelOrder(createOrder("ORD-7"));
```

app-cjs.cjsNode.js only

```ts
console.log("app-cjs.cjs started");
const { createOrder, cancelOrder } = require("./orders.cjs");
console.log("cancelOrder is", typeof cancelOrder);
try {
  cancelOrder(createOrder("ORD-7"));
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

run-both.jsNode.js only

```ts
try {
  await import("./app-esm.js");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
await import("./app-cjs.cjs");
```

Output of `node run-both.js`

```ts
SyntaxError: The requested module './orders.js' does not provide an export named 'cancelOrder'
app-cjs.cjs started
cancelOrder is undefined
TypeError: cancelOrder is not a function
```

The ES module's `console.log` never ran, even though it is the first line: the link phase found that `orders.js` has no `cancelOrder` and refused to evaluate anything. (Imports are also **hoisted**: wherever you write them in the file, they are processed before the body.) The CommonJS version started, destructured `undefined` without complaint, and only failed at the call, one step further from the real mistake. Static structure is what lets ESM catch this early, and what lets bundlers and editors know exactly what each file uses.

## Live bindings versus copied values

An ES module import is not a copy of a value. It is a **live binding**: a read-only view of the exporting module's variable. When the exporter changes the variable, every importer sees the new value. A CommonJS `require` returns an object, and destructuring it copies the current values out:

stats.jsNode.js only

```ts
export let ordersToday = 0;

export function recordOrder() {
  ordersToday += 1;
}
```

stats.cjsNode.js only

```ts
let ordersToday = 0;

function recordOrder() {
  ordersToday += 1;
  module.exports.ordersToday = ordersToday;
}

module.exports = { ordersToday, recordOrder };
```

compare.jsNode.js only

```ts
import { ordersToday, recordOrder } from "./stats.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cjsStats = require("./stats.cjs");
const { ordersToday: copied } = cjsStats;

recordOrder();
recordOrder();
cjsStats.recordOrder();
cjsStats.recordOrder();

console.log("esm live binding:", ordersToday);
console.log("cjs destructured copy:", copied);
console.log("cjs property read now:", cjsStats.ordersToday);

try {
  ordersToday = 99;
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node compare.js`

```ts
esm live binding: 2
cjs destructured copy: 0
cjs property read now: 2
TypeError: Assignment to constant variable.
```

- The ESM import saw both increments without doing anything: it is a view of the variable in `stats.js`.
- The destructured CommonJS value was copied when the line ran, and stays 0 forever. Only reading the property again sees the update, and only because `recordOrder` remembered to write it back to `module.exports`.
- Imports are read-only. Only the module that owns a variable can change it, which keeps "who changes this?" answerable.
- `createRequire(import.meta.url)` is how an ES module gets a real `require` function when it needs one, for example to load a CommonJS file synchronously or to use `require.resolve`.

Live bindings are also what make ESM circular imports behave better than CommonJS ones, as you will see [below](#circular).

## Mixing the two in Node.js 24

### ESM importing CommonJS

An ES module can always `import` a CommonJS file. The **default import** is the whole `module.exports` object, always. For **named imports**, Node.js has to know the export names during the link phase, before the CommonJS file has run. It gets them by scanning the CommonJS source text for simple patterns such as `exports.charge = …`, `module.exports.refund = …` or `module.exports = { charge, refund }`. Anything computed at run time, like the loop in the opening example, is invisible to that scan. That is the whole explanation of the first error in this lesson, and the fix the error message suggests is the reliable one:

checkout-fixed.jsNode.js only

```ts
import payments from "./payments.cjs";

const { charge, refund } = payments;
console.log(charge("ORD-7", 2327850), "|", refund("ch_1"));
```

Output of `node checkout-fixed.js`

```ts
charged ORD-7 ₦23278.5 | refunded ch_1
```

The other fix is in the CommonJS file: assign exports with plain, visible statements (`module.exports = { charge, refund }`). If you maintain the CommonJS package, do that; if you only consume it, use the default import.

### CommonJS requiring ESM: require(esm)

For years the reverse was impossible: `require` is synchronous, and an ES module might need to `await`. The only option was the asynchronous `import()`, which forced CommonJS callers to become asynchronous. Node.js 22.12 and 20.19 changed that, and in Node.js 24 it works without any flag or warning: `require()` can load an ES module, **as long as that module and everything it imports have no top-level `await`**. It returns the module's **namespace object**, whose properties are the named exports, with the default export under `.default`:

money.jsNode.js only

```ts
export const VAT_RATE = 0.075;

export function toNaira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}

export default function addVat(kobo) {
  return Math.round(kobo * (1 + VAT_RATE));
}
```

settings.jsNode.js only

```ts
const loaded = await Promise.resolve({ currency: "NGN" });
export const currency = loaded.currency;
```

legacy-report.cjsNode.js only

```ts
const money = require("./money.js");
console.log(Object.keys(money), money[Symbol.toStringTag]);
console.log(money.toNaira(money.default(1000000)));
console.log("require(esm) supported:", process.features.require_module);

try {
  require("./settings.js");
} catch (error) {
  console.log(error.code);
  console.log(error.message.split(". ")[0]);
}

import("./settings.js").then((settings) => console.log("import() works:", settings.currency));
```

Output of `npx tsx legacy-report.cjs`

```json
[ 'VAT_RATE', '__esModule', 'default', 'toNaira' ] Module
₦10750.00
require(esm) supported: true
ERR_REQUIRE_ASYNC_MODULE
require() cannot be used on an ESM graph with top-level await
import() works: NGN
```

The namespace also contains `__esModule`, a marker Node.js adds when the module has a default export, so that code compiled by older tools (which used the same marker) finds the default export where it expects it. The top-level `await` in `settings.js` made `require` refuse it, while `import()` loaded it without trouble. The rules for mixing, in one place:

| From | To | How | Watch out for |
| --- | --- | --- | --- |
| ESM | CJS | `import pkg from "./x.cjs"` | Named imports only for exports the scanner can see |
| ESM | CJS or JSON, synchronously | `createRequire(import.meta.url)` | Rarely needed; `import … with { type: "json" }` loads JSON |
| CJS | ESM | `require("./x.js")` (Node.js 20.19+, 22.12+) | Fails with `ERR_REQUIRE_ASYNC_MODULE` if top-level `await` is anywhere in its graph; default export is `.default` |
| CJS | ESM, always | `await import("./x.js")` | Asynchronous: the caller must handle a promise |

## Module resolution: from specifier to file

The string after `from` or inside `require()` is a **specifier**. **Resolution** is the process that turns it into one file. There are four kinds of specifier:

- **Relative**: starts with `./` or `../`, and is resolved against the importing file's location, not the current directory. ESM requires the full file name including the extension; CommonJS will try adding `.js`, `.json`, `.node` and `/index.js`.
- **Absolute**: a `file://` URL (in ESM) or an absolute path. Rare in application code.
- **Built-in**: `node:fs`, `node:crypto`. Always write the `node:` prefix: it cannot be confused with an npm package of the same name.
- **Bare**: a package name, such as `zod` or `@zudojs/errors`, optionally followed by a subpath (`@zudojs/errors/http`).

### Finding a bare specifier

For `import { z } from "zod"` in `/app/src/orders/create.js`, Node.js looks for a folder named `zod` in `node_modules`, starting next to the importing file and walking up one directory at a time:

```ts
 /app/src/orders/node_modules/zod     not found
 /app/src/node_modules/zod            not found
 /app/node_modules/zod                found → read /app/node_modules/zod/package.json
                                              → "exports" decides which file is the entry
```

Bare specifiers are found by walking up through node_modules folders; package.json then picks the file.

That walk is why a monorepo's packages can share one `node_modules` at the root, and also why two different versions of a package can be installed at different levels and both be used (the [Symbols](https://zudojs.oyinlola.site/learn/js-symbols#registry) lesson showed what that does to brand checks).

### The exports field: a package's public door

Once the package folder is found, its `package.json` `"exports"` field maps **subpaths** (what importers write after the package name) to files. It does two jobs: it chooses the file, and it *hides everything not listed*. A package can also import itself by its own name, which lets you try an exports map without publishing anything. Here is a small shop library with a main entry, a public `money` subpath, a private internal module, and an `"imports"` map (names starting with `#`) for its own internal shortcuts:

package.json

```json
{
  "name": "shop-core",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./money": "./src/money.js",
    "./package.json": "./package.json"
  },
  "imports": {
    "#rates": "./src/internal/rates.js"
  }
}
```

src/internal/rates.jsNode.js only

```ts
export const VAT_RATE = 0.075;
```

src/money.jsNode.js only

```ts
import { VAT_RATE } from "#rates";

export const addVat = (kobo) => Math.round(kobo * (1 + VAT_RATE));
```

src/index.jsNode.js only

```ts
export { addVat } from "./money.js";
export const name = "shop-core";
```

consumer.jsNode.js only

```ts
import { name } from "shop-core";
import { addVat } from "shop-core/money";

console.log(name, addVat(1000000));

for (const specifier of ["shop-core/src/internal/rates.js", "shop-core/rates", "#rates"]) {
  try {
    const loaded = await import(specifier);
    console.log(specifier, "->", Object.keys(loaded));
  } catch (error) {
    console.log(specifier, "->", error.code);
  }
}
```

Output of `node consumer.js`

```ts
shop-core 1075000
shop-core/src/internal/rates.js -> ERR_PACKAGE_PATH_NOT_EXPORTED
shop-core/rates -> ERR_PACKAGE_PATH_NOT_EXPORTED
#rates -> [ 'VAT_RATE' ]
```

The internal file exists on disk, but `"shop-core/src/internal/rates.js"` is refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`: it is not in the map. That is **encapsulation** for packages. Consumers cannot depend on your internal files, so you can move and rename them freely; only the listed subpaths are your public API. `"#rates"` works here because `consumer.js` is inside the package; code in another package could not use this package's `#` names.

### Conditional exports

An exports entry can be an object of **conditions** instead of one path. Node.js picks the first condition that matches, in the order written. The common ones are `"import"` (loaded with `import`), `"require"` (loaded with `require`), `"node"`, `"browser"`, `"types"` (for TypeScript) and `"default"` (always matches, so it goes last). A package that ships both an ESM and a CJS build uses them:

package.json

```json
{
  "name": "shop-errors",
  "type": "module",
  "exports": {
    ".": {
      "import": "./esm/index.js",
      "require": "./cjs/index.cjs"
    }
  }
}
```

esm/index.jsNode.js only

```ts
export class PaymentError extends Error {
  name = "PaymentError";
}
export const build = "esm";
```

cjs/index.cjsNode.js only

```ts
class PaymentError extends Error {
  name = "PaymentError";
}
module.exports = { PaymentError, build: "cjs" };
```

hazard.jsNode.js only

```ts
import { PaymentError, build } from "shop-errors";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fromRequire = require("shop-errors");

console.log("import got:", build, "| require got:", fromRequire.build);

const thrownByCjsCode = new fromRequire.PaymentError("card declined");
console.log(thrownByCjsCode instanceof PaymentError);
console.log(thrownByCjsCode.name === "PaymentError");
```

Output of `node hazard.js`

```ts
import got: esm | require got: cjs
false
true
```

Each way of loading got its own build, which is the point of conditional exports. It also shows the **dual package hazard**: when one application loads a package both ways (your ESM code imports it, while an older dependency requires it), two separate copies of every class exist. An error thrown by the CommonJS copy fails the `instanceof` check written against the ESM copy. Defences: ship a single implementation (for example ESM only, which Node.js 24 CommonJS users can `require`), keep shared state in one of the builds, or check errors by `name`, a `code` or a `Symbol.for` brand instead of `instanceof` ([Symbols](https://zudojs.oyinlola.site/learn/js-symbols#registry)).

## Dynamic import(): loading code at run time

`import` declarations are static: the file must be known before the program starts. `import(specifier)` is an expression that can be called anywhere, with any string, at any time. It returns a promise for the module's namespace object. It works in ES modules and in CommonJS, and in browsers. Uses:

- **Plugins**: which carriers, payment providers or report formats to load is decided by configuration.
- **Lazy loading**: a PDF library that only the monthly-invoice command needs should not slow down every server start.
- **ESM from CommonJS**, when `require` cannot be used (top-level `await`).

A module loaded dynamically is still loaded and evaluated only once. Importing it again, statically or dynamically, returns the same namespace object:

pdf.jsNode.js only

```ts
console.log("  (pdf.js evaluated: expensive setup happens here)");
export const renderInvoice = (id) => `%PDF invoice ${id}`;
```

cli.jsNode.js only

```ts
console.log("cli started");

async function command(name) {
  if (name === "invoice") {
    const { renderInvoice } = await import("./pdf.js");
    return renderInvoice("INV-2026-00098");
  }
  return `ran ${name} without loading the PDF code`;
}

console.log(await command("stats"));
console.log(await command("invoice"));
console.log(await command("invoice"));
const first = await import("./pdf.js");
const second = await import("./pdf.js");
console.log("same namespace object:", first === second);
```

Output of `node cli.js`

```ts
cli started
ran stats without loading the PDF code
  (pdf.js evaluated: expensive setup happens here)
%PDF invoice INV-2026-00098
%PDF invoice INV-2026-00098
same namespace object: true
```

The PDF module was evaluated once, at the first moment it was needed, and never for the `stats` command.

> Never import a path built from user input
>
> An import runs the file's code with your program's full permissions. Building a specifier from a request (`import(\`./carriers/${req.query.carrier}.js\`)`) lets an attacker choose which file runs, including ones outside the folder via `../`. Resolve names against an allow-list first, as the build below does.

## Top-level await

In an ES module, `await` can be used at the top level, outside any function. The module's evaluation pauses there, and *every module that imports it waits* until it finishes. That is convenient for a configuration module that must load before anything uses it:

config.jsNode.js only

```ts
console.log("config: loading");
const loaded = await new Promise((resolve) => setTimeout(() => resolve({ vatRate: 0.075, currency: "NGN" }), 20));
console.log("config: ready");

export const config = Object.freeze(loaded);
```

prices.jsNode.js only

```ts
import { config } from "./config.js";

console.log("prices: evaluating, vat is", config.vatRate);
export const withVat = (kobo) => Math.round(kobo * (1 + config.vatRate));
```

app.jsNode.js only

```ts
import { withVat } from "./prices.js";

console.log("app: evaluating", withVat(1000000));
```

Output of `node app.js`

```ts
config: loading
config: ready
prices: evaluating, vat is 0.075
app: evaluating 1075000
```

`prices.js` did not run until `config.js` had finished waiting, so it never saw a half-loaded configuration. The costs are real, though:

- **Everything above it waits.** A slow top-level `await` in a widely imported module delays the whole application's start, and a network call that hangs there hangs startup.
- **It blocks `require()`.** A module with top-level `await` anywhere in its imports cannot be loaded with `require(esm)`, as you saw above. A library that adds one breaks its CommonJS users.
- **Errors happen at import time.** A rejected top-level `await` makes the import itself fail; there is no function call to wrap in `try`.

Use it in application entry points and small configuration modules, not in libraries. For resources such as database connections, an explicit `await db.connect()` during startup, managed by a lifecycle ([the ZudoJS runtime](https://zudojs.oyinlola.site/learn/zudo-runtime)), is easier to control and to shut down.

## Circular imports, precisely

[Modules](https://zudojs.oyinlola.site/learn/js-modules#circular) showed the classic symptom: `Cannot access 'X' before initialization` in ESM, a silent `undefined` in CommonJS. With the load phases in mind, you can predict exactly which cycles fail and why. When a module is imported while it is still being loaded (a cycle), the loader does not start it again. It hands out what exists so far:

- In **ESM**, the binding exists (linking created it) but may not be initialised yet. **Function declarations** are initialised during linking, so they can be called across a cycle. `const`, `let` and `class` are in the temporal dead zone until their line runs, so reading them early throws.
- In **CommonJS**, `require` returns the `module.exports` object as it is at that moment: often empty. Destructuring from it copies `undefined`.

format.jsNode.js only

```ts
import { taxFor } from "./tax.js";

export function formatNaira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}
export const RECEIPT_TITLE = "Shop receipt";

console.log("format.js runs:", taxFor(1000000));
```

tax.jsNode.js only

```ts
import { formatNaira, RECEIPT_TITLE } from "./format.js";

export function taxFor(kobo) {
  return formatNaira(Math.round(kobo * 0.075));
}

console.log("tax.js runs, function works across the cycle:", formatNaira(500));
try {
  console.log(RECEIPT_TITLE);
} catch (error) {
  console.log(`tax.js: ${error.name}: ${error.message}`);
}
```

main.jsNode.js only

```ts
import "./format.js";
```

Output of `node main.js`

```ts
tax.js runs, function works across the cycle: ₦5.00
tax.js: ReferenceError: Cannot access 'RECEIPT_TITLE' before initialization
format.js runs: ₦750.00
```

`format.js` imports `tax.js`, so `tax.js` is evaluated first, while `format.js` has not run a line. Calling `formatNaira` worked (a hoisted function declaration); reading `RECEIPT_TITLE` threw (a `const` not yet initialised). Had `formatNaira` been written as `export const formatNaira = (kobo) => …`, the call would have thrown too. Changing a function declaration into an arrow function can therefore "break" a cycle that had been hiding for months.

The CommonJS version of a common cycle, two classes that refer to each other, fails with a message that does not mention cycles at all:

base-payment.cjsNode.js only

```ts
const { CardPayment } = require("./card-payment.cjs");

class BasePayment {
  static fromMethod(method) {
    if (method === "card") return new CardPayment();
    throw new Error(`unknown method ${method}`);
  }
}

module.exports = { BasePayment };
```

card-payment.cjsNode.js only

```ts
const { BasePayment } = require("./base-payment.cjs");

console.log("card-payment.cjs sees BasePayment as", typeof BasePayment);
class CardPayment extends BasePayment {}

module.exports = { CardPayment };
```

main.cjsNode.js only

```ts
try {
  require("./base-payment.cjs");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `npx tsx main.cjs`

```ts
card-payment.cjs sees BasePayment as undefined
TypeError: Class extends value undefined is not a constructor or null
```

`base-payment.cjs` started, and at its first line required `card-payment.cjs`, which required `base-payment.cjs` back. That returned the half-finished, still empty `module.exports`, so `BasePayment` was `undefined` and `extends undefined` failed. (Node.js also prints a warning about "accessing non-existent property … inside circular dependency" for this pattern; the checker on this site hides warnings.)

### Symptoms and fixes

| Symptom | Likely cause |
| --- | --- |
| ESM: `ReferenceError: Cannot access 'X' before initialization` where X is imported | A cycle; X is a `const`, `let` or `class` read during evaluation |
| CJS: `X is not a function`, `X is not a constructor`, `Class extends value undefined` | A cycle; X was destructured from a half-finished `module.exports` |
| Works or breaks depending on which file is imported first | A cycle; the entry point decides which module in it runs first |

The fixes from [Modules](https://zudojs.oyinlola.site/learn/js-modules#circular) still apply: move what both modules need into a third module, pass a dependency in as an argument, or, for a factory like `fromMethod`, look the class up when the function *runs* rather than when the module loads. Tools can find cycles for you before they bite:

Terminal on your computer (example output)

```bash
$ npx madge --circular src/
Processed 42 files (812ms)

✖ Found 1 circular dependency!

1) payments/base-payment.js > payments/card-payment.js
```

## Modules in the browser

Browsers only speak ESM. A page loads a module with `<script type="module" src="/app.js">`, and each `import` becomes a network request for a URL. Three consequences:

- Relative specifiers must be full URLs or paths with extensions, as in Node's ESM.
- Bare specifiers like `"zod"` mean nothing to a browser, which has no `node_modules` walk. An **import map** (`<script type="importmap">`) can map names to URLs, but most projects use a **bundler**, which resolves everything at build time the way Node.js would and produces a few files. `require` and CommonJS packages only work in the browser through a bundler.
- The `"browser"` export condition lets a package give browsers a different file, for example one without `node:fs`.

[JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling) covers bundlers. Server code in this course runs in Node.js, where everything in this lesson applies directly.

## Before you build: a carrier plugin loader

REASON IT OUT

### Design the plugin loader

The shop supports several delivery carriers. Each is a module in `carriers/` that exports `name` and a `quote(order)` function. Which carriers are active comes from configuration (for example `ENABLED_CARRIERS=gig,kwik`), so they must be loaded at run time. Before reading the code, decide:

- How do you turn a configured name into a file safely?
- What should happen when a configured carrier's file does not exist? When the file exists but has no `quote` function? When the file throws while loading?
- Should one broken carrier stop the shop from starting, or should the others still load?
- How does the loader avoid importing the same carrier twice?
- How would you test all of this without real carrier code?

**Show the reasoning**

- **Names to files**: through an allow-list, a map from known names to relative paths. A name not in the map is refused before any import happens. Nothing from configuration or a request is ever pasted into a path.
- **Failures**: each is a different problem, so the loader reports it precisely, wrapped with the carrier name and the original error as `cause` ([cause chains](https://zudojs.oyinlola.site/learn/js-error-design#cause)): unknown name (a configuration mistake), module not found (a deployment mistake), missing `quote` (a plugin bug), and an error during evaluation (a plugin bug with its own cause).
- **One broken carrier**: the loader loads every carrier independently and collects failures. It returns the carriers that loaded plus an `AggregateError` describing the rest, and the caller decides: a checkout can run with two of three carriers, but startup should log loudly. If *no* carrier loads, that is fatal.
- **Loading twice**: the module system already caches modules, so a second `import()` of the same file returns the same namespace. The loader only needs to avoid duplicate names in the configuration.
- **Testing**: the allow-list is a parameter, so tests pass their own, pointing at small fake carrier files, including deliberately broken ones.

## Build: a carrier plugin loader

Four carrier files: two good ones, one without `quote`, and one that throws while it loads:

carriers/gig.jsNode.js only

```ts
export const name = "GIG Logistics";
export function quote(order) {
  return 150000 + Math.ceil(order.weightKg) * 20000;
}
```

carriers/kwik.jsNode.js only

```ts
export const name = "Kwik";
export const quote = (order) => (order.city === "Lagos" ? 120000 : null);
```

carriers/broken-shape.jsNode.js only

```ts
export const name = "No quote function";
export const qoute = () => 0;
```

carriers/broken-init.jsNode.js only

```ts
const apiKey = process.env.CARRIER_X_KEY_THAT_IS_NOT_SET;
if (!apiKey) throw new Error("CARRIER_X_KEY_THAT_IS_NOT_SET is missing");
export const name = "Carrier X";
export const quote = () => 0;
```

The loader. `import()` resolves a relative specifier against the file that calls it, so the paths in the allow-list are relative to `loader.js`:

loader.jsNode.js only

```ts
export const KNOWN_CARRIERS = Object.freeze({
  gig: "./carriers/gig.js",
  kwik: "./carriers/kwik.js",
});

class CarrierLoadError extends Error {
  name = "CarrierLoadError";
  constructor(carrier, problem, options) {
    super(`carrier "${carrier}": ${problem}`, options);
    this.carrier = carrier;
  }
}

async function loadOne(carrier, known) {
  if (!Object.hasOwn(known, carrier)) throw new CarrierLoadError(carrier, "not an allowed carrier");
  let plugin;
  try {
    plugin = await import(known[carrier]);
  } catch (error) {
    const problem = error.code === "ERR_MODULE_NOT_FOUND" ? "module file not found" : "failed while loading";
    throw new CarrierLoadError(carrier, problem, { cause: error });
  }
  if (typeof plugin.quote !== "function" || typeof plugin.name !== "string") {
    throw new CarrierLoadError(carrier, "must export name and quote()");
  }
  return { id: carrier, name: plugin.name, quote: plugin.quote };
}

export async function loadCarriers(enabled, known = KNOWN_CARRIERS) {
  const names = [...new Set(enabled.map((n) => n.trim()).filter(Boolean))];
  const results = await Promise.allSettled(names.map((carrier) => loadOne(carrier, known)));
  const carriers = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  if (carriers.length === 0 && names.length > 0) {
    throw new AggregateError(failures, "no carrier could be loaded");
  }
  return { carriers, problems: failures.length ? new AggregateError(failures, `${failures.length} carrier(s) failed to load`) : null };
}
```

main.jsNode.js only

```ts
import { loadCarriers } from "./loader.js";

const enabled = "gig, kwik, gig, dhl".split(",");
const { carriers, problems } = await loadCarriers(enabled);

const order = { city: "Abuja", weightKg: 2.4 };
for (const carrier of carriers) {
  const kobo = carrier.quote(order);
  console.log(`${carrier.name}: ${kobo === null ? "does not deliver there" : `₦${kobo / 100}`}`);
}
if (problems) {
  console.log(problems.message);
  for (const problem of problems.errors) console.log("  -", problem.message);
}
```

Output of `node main.js`

```ts
GIG Logistics: ₦2100
Kwik: does not deliver there
1 carrier(s) failed to load
  - carrier "dhl": not an allowed carrier
```

The duplicate `gig` was loaded once, `dhl` was refused by the allow-list before any import, and the shop kept working with the carriers that loaded. The startup log gets one clear message per problem.

### Testing the loader

The allow-list is a parameter, so tests point it at the deliberately broken carriers and check that each failure is reported for what it is:

loader.test.jsNode.js only

```ts
import { loadCarriers } from "./loader.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const TEST_CARRIERS = {
  gig: "./carriers/gig.js",
  shape: "./carriers/broken-shape.js",
  init: "./carriers/broken-init.js",
  ghost: "./carriers/does-not-exist.js",
};

const { carriers, problems } = await loadCarriers(["gig", "shape", "init", "ghost", "../../etc/passwd"], TEST_CARRIERS);
check("good carrier loads", carriers.map((c) => c.id), ["gig"]);
check("each failure is described", problems.errors.map((e) => e.message), [
  'carrier "shape": must export name and quote()',
  'carrier "init": failed while loading',
  'carrier "ghost": module file not found',
  'carrier "../../etc/passwd": not an allowed carrier',
]);
check("load error keeps its cause", problems.errors[1].cause.message, "CARRIER_X_KEY_THAT_IS_NOT_SET is missing");
check("missing file keeps the code", problems.errors[2].cause.code, "ERR_MODULE_NOT_FOUND");

let fatal = null;
try {
  await loadCarriers(["shape"], TEST_CARRIERS);
} catch (error) {
  fatal = [error.name, error.message];
}
check("no carriers at all is fatal", fatal, ["AggregateError", "no carrier could be loaded"]);
check("empty configuration is allowed", (await loadCarriers([], TEST_CARRIERS)).carriers, []);

const a = await import("./carriers/gig.js");
const again = await loadCarriers(["gig"], TEST_CARRIERS);
check("module cache: same function", again.carriers[0].quote === a.quote, true);
```

Output of `node loader.test.js`

```ts
PASS good carrier loads -> ["gig"]
PASS each failure is described -> ["carrier \"shape\": must export name and quote()","carrier \"init\": failed while loading","carrier \"ghost\": module file not found","carrier \"../../etc/passwd\": not an allowed carrier"]
PASS load error keeps its cause -> "CARRIER_X_KEY_THAT_IS_NOT_SET is missing"
PASS missing file keeps the code -> "ERR_MODULE_NOT_FOUND"
PASS no carriers at all is fatal -> ["AggregateError","no carrier could be loaded"]
PASS empty configuration is allowed -> []
PASS module cache: same function -> true
```

The path-traversal attempt is the most important line in that test: it never reached `import()`. Note also that the module that threw during loading is not cached as a success; a later import would try, and fail, again, which is what you want once the missing environment variable is fixed and the process restarted.

### In production

- **Decide at startup, not per request.** Load plugins once while the service starts, fail fast if none load, and keep the loaded list. Importing on the first request makes that request slow and turns a deployment mistake into a customer-facing error.
- **Plugins run with full trust.** An imported module can read environment variables, files and the network. Only load code you deploy yourself or have reviewed; the allow-list is a guard against mistakes and attacks, not a sandbox.
- **Pick one module system per package.** New packages: ESM only, with an `"exports"` map. Node.js 24 CommonJS users can still `require` it, as long as you avoid top-level `await` in it.
- **Watch for cycles in CI.** A cycle check such as `madge --circular` in the build catches them before the symptoms appear. ZudoJS checks package boundaries the same way, so shared packages never import the features that use them.

## Practice

TRY IT YOURSELF

### Break the payment cycle

Fix the circular dependency between `base-payment.cjs` and `card-payment.cjs` from the lesson, so that `BasePayment.fromMethod("card")` returns a `CardPayment` that is also an instance of `BasePayment`. Keep CommonJS.

**Show a solution**

The factory only needs `CardPayment` when it *runs*, not when the module loads. Move the `require` into the function, so it happens after both modules have finished loading:

base-payment.cjsNode.js only

```ts
class BasePayment {
  static fromMethod(method) {
    if (method === "card") {
      const { CardPayment } = require("./card-payment.cjs");
      return new CardPayment();
    }
    throw new Error(`unknown method ${method}`);
  }
}

module.exports = { BasePayment };
```

card-payment.cjsNode.js only

```ts
const { BasePayment } = require("./base-payment.cjs");

class CardPayment extends BasePayment {}

module.exports = { CardPayment };
```

main.cjsNode.js only

```ts
const { BasePayment } = require("./base-payment.cjs");

const payment = BasePayment.fromMethod("card");
console.log(payment.constructor.name, payment instanceof BasePayment);
```

Output of `npx tsx main.cjs`

```ts
CardPayment true
```

Now `base-payment.cjs` loads completely without touching `card-payment.cjs`, so when `card-payment.cjs` requires it, `BasePayment` is there. A cleaner long-term fix is a third module (a `paymentFactory`) that imports both classes, so the base class does not need to know its subclasses at all.

TRY IT YOURSELF

### An exports map that hides internals

Write the `package.json` for a package `shop-tax` whose public API is the main entry (`src/index.js`, exporting `vatFor`) and a `shop-tax/rates` subpath (`src/rates.js`). Its helper `src/round.js` must not be importable from outside. Prove it with a file that imports the package by its own name.

**Show a solution**

package.json

```json
{
  "name": "shop-tax",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./rates": "./src/rates.js"
  }
}
```

src/round.jsNode.js only

```ts
export const roundKobo = (value) => Math.round(value);
```

src/rates.jsNode.js only

```ts
export const RATES = Object.freeze({ NG: 0.075, GH: 0.15 });
```

src/index.jsNode.js only

```ts
import { RATES } from "./rates.js";
import { roundKobo } from "./round.js";

export const vatFor = (country, kobo) => roundKobo(kobo * RATES[country]);
```

check.jsNode.js only

```ts
import { vatFor } from "shop-tax";
import { RATES } from "shop-tax/rates";

console.log(vatFor("NG", 1000000), RATES.GH);
try {
  await import("shop-tax/src/round.js");
} catch (error) {
  console.log(error.code);
}
```

Output of `node check.js`

```ts
75000 0.15
ERR_PACKAGE_PATH_NOT_EXPORTED
```

Inside the package, `index.js` still imports `./round.js` with a relative path; the exports map only controls what *other* code can reach through the package name.

TRY IT YOURSELF

### Use an ESM library from an old CommonJS script

A CommonJS script, `nightly.cjs`, must use the ESM module `invoice.js`, which has a default export and a named export. Use `require` (Node.js 24). Then explain what you would do if `invoice.js` started using top-level `await`.

**Show a solution**

invoice.jsNode.js only

```ts
export const PREFIX = "INV-2026";

export default function invoiceNumber(n) {
  return `${PREFIX}-${String(n).padStart(5, "0")}`;
}
```

nightly.cjsNode.js only

```ts
const invoice = require("./invoice.js");
const invoiceNumber = invoice.default;

console.log(invoice.PREFIX, invoiceNumber(98), invoiceNumber(99));
```

Output of `npx tsx nightly.cjs`

```ts
INV-2026 INV-2026-00098 INV-2026-00099
```

`require` returns the namespace object, so the default export is `invoice.default`. If `invoice.js` (or anything it imports) gained a top-level `await`, `require` would throw `ERR_REQUIRE_ASYNC_MODULE`. The script would then switch to `const invoice = await import("./invoice.js")` inside an `async` function, or, better, be converted to ESM itself.

## Recap

- ES modules are parsed and linked before any code runs, so imports are static, hoisted and checked early; CommonJS runs a file when `require` is called and returns `module.exports`.
- `.mjs` is ESM and `.cjs` is CommonJS; `.js` follows the nearest `package.json` `"type"`. Set it explicitly.
- ESM imports are read-only live bindings; destructuring a `require` copies values.
- ESM can import CommonJS: the default import is `module.exports`, and named imports only work for exports visible to Node's scan. In Node.js 24, CommonJS can `require` ESM without top-level `await`; `import()` always works.
- Bare specifiers are found by walking up `node_modules`; the package's `"exports"` map chooses the file, hides everything else, and can pick builds by condition. Loading a dual package both ways creates two copies of its classes.
- `import()` loads modules at run time for plugins and lazy loading; modules are cached; never build a specifier from user input. Top-level `await` makes importers wait and blocks `require`.
- In a cycle, ESM hands out bindings that may still be uninitialised (function declarations work, `const` and classes throw); CommonJS hands out a half-filled exports object. Break cycles by extracting shared code, passing dependencies in, or looking things up at call time.

This is the last lesson of Advanced JavaScript. Next: [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime), the runtime these modules run in on the server.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
