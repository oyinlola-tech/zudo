---
title: "JavaScript tooling — ZudoJS Academy"
description: "Learn why each JavaScript tool exists, run Prettier and ESLint for real, see what a bundler does, map a minified stack trace back to source and validate config."
source: https://zudojs.oyinlola.site/learn/js-tooling
---

LEVEL 4 · LESSON 17 OF 20

Tooling and debugging Core

# JavaScript tooling

Learn why each JavaScript tool exists, run Prettier and ESLint for real, see what a bundler does, map a minified stack trace back to source and validate config.

- **50 min** to read and try
- **You need:** What Node.js is, The npm ecosystem in depth, and Professional Git
- **You build:** A cart project with a formatter, a linter, a one-command check script, editor settings, a validated configuration loader, and a tiny bundler of your own

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain which problem each tool category solves and which bugs each one can and cannot catch
- Configure and run Prettier and ESLint, fix what they report and wire them into a check script
- Describe what a bundler does, from dependency graph to minified output, and when a Node.js server does not need one
- Map a minified stack trace back to source with source maps
- Load layered .env files and validate configuration at startup, and know which values must never reach a browser bundle

## Five developers, one codebase

Look at a week in a small team building an online shop:

- A pull request changes 400 lines. Three of them fix a bug; the other 397 are one developer's editor changing quotes and indentation. Nobody can review it properly.
- A discount check ships with `if (code = "SAVE10")`: one `=` instead of three. Every order gets the discount.
- The browser app is one 2 MB file, and customers on mobile data wait eight seconds for the page.
- Production reports `RangeError at e (app.js:1:82)`. Line 1, column 82 of a file nobody wrote by hand.
- The staging server connects to the *production* database, because an environment variable was missing and the code fell back to a default.

None of these is solved by writing more careful code. Each is solved by a **tool**: a program that works on your code instead of being part of it. The JavaScript world has many, and new names appear every year, which makes it look chaotic. It is less so once you see that there are only a few *categories*, each answering one of the problems above. Learn the categories and you can evaluate any new tool in minutes.

| Category | Problem it solves | Common tools |
| --- | --- | --- |
| Formatter | Style arguments and noisy diffs | Prettier, Biome, dprint |
| Linter | Likely bugs and banned patterns | ESLint, Biome, oxlint |
| Type checker | Wrong types, typos in property names | TypeScript (`tsc`) |
| Test runner | Wrong behaviour | `node --test`, Vitest |
| Transpiler | Code in a language or version the runtime does not understand | TypeScript, esbuild, SWC, Babel |
| Bundler | Many files and packages that must reach a browser quickly | Vite, esbuild, Rollup, webpack |
| Source maps | Errors pointing at generated code | Produced by transpilers and bundlers |
| Environment configuration | Settings that differ between machines | `--env-file`, your own validation |
| Task runner | Remembering how to run all of the above | npm scripts |

REASON IT OUT

### Which tool catches which bug?

Before looking at any tool, sort these problems. For each, which category could catch it automatically, and which could never catch it?

1. A file indented with tabs in a project that uses spaces.
2. `if (code = "SAVE10")`
3. `order.totl` instead of `order.total`.
4. A 10% discount applied twice.
5. A variable that is declared and never used.
6. A secret API key written into browser code.

**Show the reasoning**

1. **Formatter.** Pure layout; no meaning changes.
2. **Linter** (the `no-cond-assign` rule). It is valid JavaScript, so neither the runtime nor a formatter objects.
3. A **type checker**, if it knows the shape of `order`. A linter can only catch it when the name is a variable that does not exist (`no-undef`), not a missing property.
4. **Only a test.** The code is valid, well formatted and well typed; it just does the wrong thing. No static tool knows your business rules.
5. **Linter** (`no-unused-vars`), and TypeScript with `noUnusedLocals`.
6. **None reliably.** A secret scanner can match known key formats, but the real defence is a rule: secrets never go into code that reaches a browser. You will see why in the bundler section.

The pattern: formatters handle layout, linters handle suspicious code patterns, type checkers handle shapes, and tests handle meaning. Each layer is cheap and catches what the others cannot.

## Formatters: Prettier

A **formatter** rewrites code layout (spaces, line breaks, quotes, semicolons) into one consistent style, without changing what the code does. Its real value is social: once a tool decides, nobody argues about style in reviews, and diffs only show real changes.

Prettier is the most used one, and it is deliberately **opinionated**: it has very few options, so there is little to configure and nothing to debate. Set up a project with it (and with the linter used in the next section):

Terminal on your computer

```bash
$ mkdir cart-app
$ cd cart-app
$ npm init -y
Wrote to ~/cart-app/package.json:
…
$ npm pkg set type=module
$ npm install -D eslint @eslint/js globals prettier
…
found 0 vulnerabilities
$ npx prettier --version
3.9.9
```

A file written in a hurry, `src/format.js`:

src/format.js

```ts
export const formatNaira = (kobo) => "₦" + (kobo/100).toLocaleString("en-NG", {minimumFractionDigits: 2})
export function describeItem(item){ return `${item.qty} x ${item.name} @ ${formatNaira(item.price)}` }
```

Terminal on your computer

```bash
$ npx prettier --check src
Checking formatting...
[warn] src/cart.js
[warn] src/format.js
[warn] Code style issues found in 2 files. Run Prettier with --write to fix.
$ echo $?
1
$ npx prettier --write src
src/cart.js 266ms
src/format.js 51ms
$ cat src/format.js
export const formatNaira = (kobo) =>
  "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
export function describeItem(item) {
  return `${item.qty} x ${item.name} @ ${formatNaira(item.price)}`;
}
```

- `--check` changes nothing and exits with 1 if any file is not formatted: that is the mode for automated checks. `--write` fixes the files. (`src/cart.js` is the cart module from the next section, after its bugs were fixed; only its missing semicolons were left for Prettier.)
- Prettier broke the long line at its default width of 80 characters, added spaces and semicolons, and put each function body on its own lines.
- Configuration goes in `.prettierrc.json` (for example `{ "printWidth": 100 }`), and files to skip in `.prettierignore`. Most teams keep the defaults.

> TIP
>
> Formatting a whole existing project creates one big commit that touches every file. Do it once, alone in its own commit, so later history stays readable. Git can even skip that commit when showing who changed a line: list its id in a `.git-blame-ignore-revs` file.

## Linters: ESLint

A **linter** reads your code and reports patterns that are probably bugs, or that your team has decided to avoid. The name comes from a 1978 C tool that picked "lint", little bits of fluff, out of programs. Here is a cart module with several mistakes that JavaScript happily runs:

src/cart.js

```ts
import { readFile } from "node:fs/promises";

export function cartTotal(items, discountCode) {
  let total = 0
  for (const item of items) {
    total += item.price * item.qty
  }
  if (discountCode == "SAVE10") {
    total = total * 0.9
  }
  if (total === NaN) throw new Error("bad price")
  return totl
}

export async function loadCart(path) {
  let text = await readFile(path, "utf8")
  const backup = structuredClone(text);
  return JSON.parse(text)
}
```

ESLint is configured in `eslint.config.js`, a JavaScript module that exports a list of configuration objects (the "flat config" format). Later objects override earlier ones. This one starts from ESLint's recommended rules, tells it the code runs in Node.js (so `process` is a known global), and adds two rules:

eslint.config.js

```ts
import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      eqeqeq: "error",
      "prefer-const": "warn",
    },
  },
]);
```

Terminal on your computer

```bash
$ npx eslint src
~/cart-app/src/cart.js
   8:20  error    Expected '===' and instead saw '=='              eqeqeq
  11:7   error    Use the isNaN function to compare with NaN       use-isnan
  12:10  error    'totl' is not defined                            no-undef
  16:7   warning  'text' is never reassigned. Use 'const' instead  prefer-const
  17:9   error    'backup' is assigned a value but never used      no-unused-vars

✖ 5 problems (4 errors, 1 warning)
  0 errors and 1 warning potentially fixable with the `--fix` option.
$ npx eslint src --fix
~/cart-app/src/cart.js
   8:20  error  Expected '===' and instead saw '=='          eqeqeq
  11:7   error  Use the isNaN function to compare with NaN   use-isnan
  12:10  error  'totl' is not defined                        no-undef
  17:9   error  'backup' is assigned a value but never used  no-unused-vars

✖ 4 problems (4 errors, 0 warnings)
```

Every line of the report is a real bug or a trap:

- `total === NaN` is *always* false, because `NaN` is not equal to anything, itself included. The price check could never fire. `Number.isNaN(total)` is the fix.
- `totl` would throw a `ReferenceError`, but only when that line runs. The linter found it without running anything.
- `--fix` only changes what is safe to change mechanically (`let` to `const`). It will not guess whether `==` should become `===`, because that can change behaviour.
- Each rule is `"off"`, `"warn"` or `"error"`. Errors make ESLint exit with code 1, so a check script fails.

After fixing the four errors by hand, `npx eslint src` prints nothing and exits with 0. Sometimes a rule is wrong for one specific line. Then say so right there, with a reason: `// eslint-disable-next-line no-console -- CLI output is the point of this file`. A disable comment without a reason is a smell in review.

### Why a linter parses your code

Could you write a linter with regular expressions? Try it for two rules:

tiny-lint.js

```ts
const rules = {
  eqeqeq: (line) => /[^=!<>]==[^=]/.test(line) && "Expected '===' and instead saw '=='",
  "no-var": (line) => /\bvar\s/.test(line) && "Unexpected var, use let or const instead",
};

function lint(source) {
  const problems = [];
  source.split("\n").forEach((line, index) => {
    for (const [name, check] of Object.entries(rules)) {
      const message = check(line);
      if (message) problems.push(`${index + 1}: ${message} (${name})`);
    }
  });
  return problems;
}

const source = `var total = 0;
if (code == "SAVE10") total = 90;
const hint = "compare with === not ==, see the style guide";
const note = "keep var names short";`;

console.log(lint(source).join("\n"));
```

Output of `node tiny-lint.js` and of the browser terminal

```ts
1: Unexpected var, use let or const instead (no-var)
2: Expected '===' and instead saw '==' (eqeqeq)
3: Expected '===' and instead saw '==' (eqeqeq)
4: Unexpected var, use let or const instead (no-var)
```

The first two findings are right. The last two are **false positives**: the `==` and the word `var` are inside strings. A regular expression sees characters; it does not know what is a string, a comment or an operator. ESLint first **parses** the code into an **abstract syntax tree** (AST): a tree of objects such as "a binary expression with operator `==`, whose left side is the identifier `code`". Rules inspect that tree, so a string is never mistaken for an operator. The same parsing step powers formatters, transpilers and bundlers: almost every tool in this lesson starts by turning your text into a tree.

> NOTE
>
> ESLint used to have formatting rules too (indentation, quotes), which fought with Prettier. Current ESLint leaves formatting to formatters. Let Prettier own layout and ESLint own correctness. For TypeScript, the `typescript-eslint` project adds rules that use type information, such as catching a promise you forgot to `await`.

## Transpilers

A **transpiler** (source-to-source compiler) turns code written in one form into another form of the same level: TypeScript into JavaScript, JSX into function calls, new syntax into older syntax that an old browser understands. The one you will use most is `tsc`, the TypeScript compiler, which the next course teaches: it removes type annotations, and with a lower `target` it also rewrites newer syntax such as `??` and `?.` into older code ([What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#target) goes into detail).

The lower the target, the more a transpiler must rewrite. Private class fields (`#balanceKobo`) arrived in ES2022. Here is a wallet class, written in TypeScript: it is the JavaScript you know plus type annotations such as `: number`, which say what kind of value a parameter holds and which the compiler deletes:

wallet.ts

```ts
export class Wallet {
  #balanceKobo = 0;

  deposit(amountKobo: number): number {
    this.#balanceKobo += amountKobo;
    return this.#balanceKobo;
  }
}

const wallet = new Wallet();
console.log(wallet.deposit(4_500_000));
```

Output of `npx tsx wallet.ts` and of the browser terminal

```ts
4500000
```

Compiled for ES2024, the output is the same code without the `: number` annotations. Compiled with `--target ES2020`, `tsc` has to fake private fields with a `WeakMap` and two helper functions:

dist/wallet.js

```ts
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Wallet_balanceKobo;
export class Wallet {
    constructor() {
        _Wallet_balanceKobo.set(this, 0);
    }
    deposit(amountKobo) {
        __classPrivateFieldSet(this, _Wallet_balanceKobo, __classPrivateFieldGet(this, _Wallet_balanceKobo, "f") + amountKobo, "f");
        return __classPrivateFieldGet(this, _Wallet_balanceKobo, "f");
    }
}
_Wallet_balanceKobo = new WeakMap();
const wallet = new Wallet();
console.log(wallet.deposit(4500000));
```

It behaves the same, but it is three times longer, slower, and much harder to read in a stack trace. That is the price of supporting old runtimes, and the reason to pick the highest target your users' browsers or your Node.js version allow.

Three things are worth knowing about transpilers in general:

- **Checking and transpiling are separate jobs.** esbuild and SWC transpile TypeScript very fast by simply deleting the types, without checking them. Node.js 24 does the same when it runs a `.ts` file directly. So projects run `tsc --noEmit` separately as the type checker.
- **Syntax can be rewritten, missing functions cannot.** A transpiler can turn `a ?? b` into older code, but it cannot make `Array.prototype.findLast` exist in an old browser. That needs a **polyfill**: a script that adds the missing function at run time.
- **For Node.js 24 servers, you need little.** Node.js supports all modern syntax, so the only transpiling a backend needs is TypeScript, and a target such as ES2024 keeps the output close to what you wrote.

## Bundlers

A browser app has the problems a server does not. Your code is spread over dozens of modules, plus packages in `node_modules`. The browser cannot read `node_modules` (it has no idea what `import "ms"` means), every file is a separate network request, and every byte is downloaded by every visitor, often over a slow mobile connection. A **bundler** solves this. Starting from an **entry** file, it:

1. follows every `import` to build the **dependency graph**, including packages;
2. transpiles each file if needed (TypeScript, JSX);
3. leaves out exports nobody imports (**tree shaking**);
4. joins the modules into one or a few output files (**bundles**), optionally splitting rarely used parts into separate files loaded on demand (**code splitting**);
5. **minifies** the result: removes whitespace and comments and renames local variables to single letters;
6. writes a source map for each output file.

Steps 1 and 4 are the heart of it, and small enough to build yourself. This mini-bundler takes a map of module files, follows the imports from the entry, wraps each module in a function, and produces one script with a tiny `require` function inside:

mini-bundler.js

```ts
const files = {
  "./main.js": `import { cartTotal } from "./cart.js";
import { formatNaira } from "./format.js";
console.log("Total:", formatNaira(cartTotal([{ priceKobo: 4500000, qty: 1 }, { priceKobo: 250000, qty: 3 }])));`,
  "./cart.js": `export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
}`,
  "./format.js": `export function formatNaira(kobo) {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
}
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}`,
};

const importPattern = /import \{([^}]+)\} from "([^"]+)";/g;

function collect(entry, order = [], used = new Map()) {
  if (order.includes(entry)) return { order, used };
  for (const [, names, from] of files[entry].matchAll(importPattern)) {
    for (const name of names.split(",")) {
      if (!used.has(from)) used.set(from, new Set());
      used.get(from).add(name.trim());
    }
    collect(from, order, used);
  }
  order.push(entry);
  return { order, used };
}

function transform(code) {
  const exported = [...code.matchAll(/export function (\w+)/g)].map((m) => m[1]);
  const body = code
    .replace(importPattern, (_, names, from) => `const {${names}} = require("${from}");`)
    .replaceAll("export function", "function");
  return `${body}\nreturn { ${exported.join(", ")} };`;
}

function bundle(entry) {
  const { order, used } = collect(entry);
  const modules = order.map((id) => `  "${id}": function (require) {\n${transform(files[id])}\n  }`);
  const runtime = `const cache = {};
function require(id) {
  if (!(id in cache)) cache[id] = modules[id](require);
  return cache[id];
}
require("${entry}");`;
  return { order, used, code: `const modules = {\n${modules.join(",\n")}\n};\n${runtime}` };
}

const { order, used, code } = bundle("./main.js");
console.log("modules in dependency order:", order);
for (const [file, names] of used) {
  const all = [...files[file].matchAll(/export function (\w+)/g)].map((m) => m[1]);
  console.log(`${file} unused exports:`, all.filter((name) => !names.has(name)));
}
console.log("bundle size:", code.length, "characters in one file");
new Function(code)();
```

Output of `node mini-bundler.js` and of the browser terminal

```ts
modules in dependency order: [ './cart.js', './format.js', './main.js' ]
./cart.js unused exports: []
./format.js unused exports: [ 'formatDate' ]
bundle size: 850 characters in one file
Total: ₦52,500.00
```

The bundle ran exactly like the three separate modules would. It also found `formatDate`, which nothing imports: a real bundler would leave it out of the output entirely. Real bundlers use a parser instead of regular expressions, handle every form of `import` and `export`, CSS, images and packages from `node_modules`, and are fast enough to rebuild in milliseconds on every save.

Here is a real one. esbuild bundles and minifies three small modules of the shop (the cart, the formatter, and a `main.js` that calls both):

Terminal on your computer

```bash
$ npx esbuild src/main.js --bundle --minify --sourcemap --sources-content=false --platform=node --format=esm --outfile=dist/app.js

  dist/app.js      403b
  dist/app.js.map  681b

⚡ Done in 18ms
$ cat dist/app.js
function e(o){let r=0;for(let t of o){if(!Number.isInteger(t.qty)||t.qty<1)throw new RangeError(`Invalid quantity for ${t.name}: ${t.qty}`);r+=t.priceKobo*t.qty}return r}function n(o){return"\u20A6"+(o/100).toLocaleString("en-NG",{minimumFractionDigits:2})}var a=[{name:"Sneakers",priceKobo:45e5,qty:1},{name:"Socks",priceKobo:25e4,qty:0}];console.log("Total:",n(e(a)));
//# sourceMappingURL=app.js.map
```

One line, no module boundaries left, `cartTotal` renamed to `e`, `4_500_000` shortened to `45e5`, and `formatDate` gone (tree shaking). This is what production browser code looks like. The popular tools:

- **Vite**: the usual choice for new front-end projects. A development server that serves your modules almost unbundled for instant reloads, and an optimised bundle for production.
- **esbuild**: extremely fast bundler and transpiler, often used inside other tools.
- **Rollup**: focused on clean output, popular for building libraries.
- **webpack**: the older, very configurable standard, still in many existing projects.

A Node.js server usually needs **no bundler**: Node.js reads `node_modules` and many files without trouble, and nobody downloads your server code. Some teams bundle servers anyway for faster cold starts in serverless platforms, but it is an optimisation, not a requirement.

> EVERYTHING IN A BROWSER BUNDLE IS PUBLIC
>
> Bundlers replace `process.env.X` with its value at build time, because browsers have no environment variables. Look at what that does to a secret:
>
> ```bash
$ npx esbuild src/pay.js --bundle --minify --define:process.env.PAYMENT_PUBLIC_KEY='"pk_test_public_example"' --define:process.env.PAYMENT_SECRET_KEY='"sk_test_do_not_ship_this"'
(()=>{var e="pk_test_public_example",c="sk_test_do_not_ship_this";console.log("checkout ready",e.slice(0,8),c.length);})();
```
>
>  Both keys are now plain text in a file every visitor downloads. Vite only exposes variables whose names start with `VITE_` for exactly this reason. Public keys (made to be seen) may go into a browser bundle; secret keys stay on the server, always.

## Source maps: back from the bundle

Now run that bundle. The cart contains socks with quantity 0, so `cartTotal` throws:

Terminal on your computer

```bash
$ node dist/app.js
file://~/shop-bundle/dist/app.js:1
…
RangeError: Invalid quantity for Socks: 0
    at e (file://~/shop-bundle/dist/app.js:1:82)
    at file://~/shop-bundle/dist/app.js:1:364
…
$ node --enable-source-maps dist/app.js
~/shop-bundle/src/cart.js:5
      throw new RangeError(`Invalid quantity for ${item.name}: ${item.qty}`);
            ^

RangeError: Invalid quantity for Socks: 0
    at cartTotal (~/shop-bundle/src/cart.js:5:13)
    at <anonymous> (~/shop-bundle/src/main.js:9:35)
…
```

Without the map, the error is in function `e` at column 82 of line 1. With `--enable-source-maps`, Node.js read `app.js.map` and translated every position: function `cartTotal`, line 5 of `src/cart.js`, called from line 9 of `main.js`. It even printed the original source line. You can do the same from inside a program with `process.setSourceMapsEnabled(true)`, which affects modules loaded after the call. These are the two real files esbuild wrote:

dist/app.js

```ts
function e(o){let r=0;for(let t of o){if(!Number.isInteger(t.qty)||t.qty<1)throw new RangeError(`Invalid quantity for ${t.name}: ${t.qty}`);r+=t.priceKobo*t.qty}return r}function n(o){return"\u20A6"+(o/100).toLocaleString("en-NG",{minimumFractionDigits:2})}var a=[{name:"Sneakers",priceKobo:45e5,qty:1},{name:"Socks",priceKobo:25e4,qty:0}];console.log("Total:",n(e(a)));
//# sourceMappingURL=app.js.map
```

dist/app.js.map

```json
{
  "version": 3,
  "sources": ["../src/cart.js", "../src/format.js", "../src/main.js"],
  "mappings": "AAAO,SAASA,EAAUC,EAAO,CAC/B,IAAIC,EAAQ,EACZ,QAAWC,KAAQF,EAAO,CACxB,GAAI,CAAC,OAAO,UAAUE,EAAK,GAAG,GAAKA,EAAK,IAAM,EAC5C,MAAM,IAAI,WAAW,wBAAwBA,EAAK,IAAI,KAAKA,EAAK,GAAG,EAAE,EAEvED,GAASC,EAAK,UAAYA,EAAK,GACjC,CACA,OAAOD,CACT,CCTO,SAASE,EAAYC,EAAM,CAChC,MAAO,UAAOA,EAAO,KAAK,eAAe,QAAS,CAAE,sBAAuB,CAAE,CAAC,CAChF,CCCA,IAAMC,EAAO,CACX,CAAE,KAAM,WAAY,UAAW,KAAW,IAAK,CAAE,EACjD,CAAE,KAAM,QAAS,UAAW,KAAS,IAAK,CAAE,CAC9C,EAEA,QAAQ,IAAI,SAAUC,EAAYC,EAAUF,CAAI,CAAC,CAAC",
  "names": ["cartTotal", "items", "total", "item", "formatNaira", "kobo", "cart", "formatNaira", "cartTotal"]
}
```

The map lists the original files (`sources`), the original names that were shortened (`names`), and `mappings`: a compact encoding of "this position in the output came from that position in that source file". This program imports the bundle twice, once before and once after turning source maps on, and prints the top of each stack trace:

trace.jsNode.js only

```ts
async function topFrames(url) {
  try {
    await import(url);
  } catch (error) {
    return error.stack
      .split("\n")
      .slice(0, 3)
      .map((line) => line.trim().replaceAll(`file://${import.meta.dirname}/`, "").replaceAll(`${import.meta.dirname}/`, "").replace(/\?\w+/, ""));
  }
}

console.log("without source maps:", await topFrames("./dist/app.js?first"));

process.setSourceMapsEnabled(true);
console.log("with source maps:   ", await topFrames("./dist/app.js?second"));
```

Output of `node trace.js`

```ts
without source maps: [
  'RangeError: Invalid quantity for Socks: 0',
  'at e (dist/app.js:1:82)',
  'at dist/app.js:1:364'
]
with source maps:    [
  'RangeError: Invalid quantity for Socks: 0',
  'at cartTotal (src/cart.js:5:13)',
  'at <anonymous> (src/main.js:9:35)'
]
```

The `?first` and `?second` make Node.js load the bundle as two separate modules, since a module is only loaded once per URL. The source files do not even need to exist for the mapping to work: the positions and names come from the map alone. How `mappings` is decoded is shown step by step in [Debugging tools](https://zudojs.oyinlola.site/learn/debug-tools#source-maps).

- **Servers:** ship the `.map` files and start Node.js with `--enable-source-maps`, so logs show real file names and lines.
- **Browsers:** DevTools loads maps automatically. Many teams upload maps to their error-tracking service instead of publishing them, because a map can contain your full original source (the `sourcesContent` field, left out above with `--sources-content=false`).

## Environment configuration

[What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#env) introduced `process.env` and `--env-file`. Real projects need a little more: several files, clear precedence, and validation at startup. Take a shared `.env` and a personal `.env.local` that is not committed:

Terminal on your computer

```bash
$ cat .env
PORT=3000
DATABASE_URL=postgres://localhost:5432/shop
LOG_LEVEL=info
$ cat .env.local
LOG_LEVEL=debug
$ node --env-file=.env --env-file=.env.local show.js
3000 debug (NODE_ENV not set)
$ node --env-file=.env.local --env-file=.env show.js
3000 info (NODE_ENV not set)
$ LOG_LEVEL=warn node --env-file=.env --env-file=.env.local show.js
3000 warn (NODE_ENV not set)
$ node --env-file-if-exists=.env.production show.js
.env.production not found. Continuing without it.
undefined undefined (NODE_ENV not set)
```

`show.js` prints `PORT`, `LOG_LEVEL` and `NODE_ENV`. The rules: a later file overrides an earlier one, and a variable already set in the real environment beats every file. That is what lets a hosting platform override anything without touching files. `NODE_ENV` is a convention, not a Node.js feature: many libraries behave differently when it is `"production"` (less logging, more caching), so set it on your servers.

A program can also load a file itself with `process.loadEnvFile()`, which follows the same rule: variables that are already set are not overwritten.

.env

```ts
PORT=3000
LOG_LEVEL=info
```

load-env.jsNode.js only

```ts
process.env.LOG_LEVEL = "warn";
process.loadEnvFile(".env");

console.log(process.env.PORT, process.env.LOG_LEVEL, typeof process.env.PORT);
```

Output of `node load-env.js`

```ts
3000 warn string
```

The first line stands in for a hosting platform that set `LOG_LEVEL`. The file filled in `PORT` but did not overwrite `LOG_LEVEL`, and `PORT` arrived as the string `"3000"`, not a number.

Values in `process.env` are always strings, and a missing value is `undefined`. Reading them all over the code invites the staging-uses-production-database bug from the start of the lesson. The fix is one module that reads every setting once, converts and checks it, and refuses to start when something is wrong. `util.parseEnv` parses `.env` text the same way `--env-file` does, which makes the loader easy to test:

config.jsNode.js only

```ts
import { parseEnv } from "node:util";

const LOG_LEVELS = ["debug", "info", "warn", "error"];

function loadConfig(env) {
  const errors = [];
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(`PORT must be a port number, got "${env.PORT}"`);
  if (!env.DATABASE_URL?.startsWith("postgres://")) errors.push("DATABASE_URL must be a postgres:// URL");
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!LOG_LEVELS.includes(logLevel)) errors.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${logLevel}"`);
  if (!env.PAYMENT_SECRET_KEY) errors.push("PAYMENT_SECRET_KEY is required");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: Object.freeze({ port, databaseUrl: env.DATABASE_URL, logLevel }) };
}

const staging = parseEnv(`PORT=30O0
# DATABASE_URL was forgotten
LOG_LEVEL=verbose
`);
console.log(loadConfig(staging));

const good = parseEnv(`PORT=4000
DATABASE_URL="postgres://staging-db:5432/shop"
PAYMENT_SECRET_KEY=replace-me
`);
console.log(loadConfig(good));
```

Output of `node config.js`

```json
{
  ok: false,
  errors: [
    'PORT must be a port number, got "30O0"',
    'DATABASE_URL must be a postgres:// URL',
    'LOG_LEVEL must be one of debug, info, warn, error, got "verbose"',
    'PAYMENT_SECRET_KEY is required'
  ]
}
{
  ok: true,
  config: {
    port: 4000,
    databaseUrl: 'postgres://staging-db:5432/shop',
    logLevel: 'info'
  }
}
```

- All four problems are reported at once, not one per restart. `30O0` has a letter O instead of a zero, exactly the kind of typo that otherwise surfaces hours later.
- No default for `DATABASE_URL` or the secret: a missing database address must stop the server, never fall back to some other database.
- The secret is required but not part of the printed config. Configuration objects end up in logs; keep secrets out of them. `Object.freeze` stops code elsewhere from changing settings at run time.
- In the real server: `const result = loadConfig(process.env); if (!result.ok) { console.error(result.errors.join("\n")); process.exit(1); }`. The ZudoJS lesson [Configuration](https://zudojs.oyinlola.site/learn/zudo-config) provides this layering and validation as a package.

## One command for everything: package scripts

Each tool has its own command and flags. Nobody should have to remember them. npm scripts (from [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages#scripts)) give them names, and a `check` script runs them all, in the order that fails fastest:

package.json

```json
{
  "name": "cart-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run lint && npm run format:check && npm test"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.11.0",
    "globals": "^17.12.0",
    "prettier": "^3.9.9"
  }
}
```

Terminal on your computer

```bash
$ npm run check

> cart-app@1.0.0 check
> npm run lint && npm run format:check && npm test


> cart-app@1.0.0 lint
> eslint .


> cart-app@1.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!

> cart-app@1.0.0 test
> node --test

✔ applies SAVE10 (6.740574ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 594.490732
```

- `&&` runs the next command only if the previous one succeeded, so the first failure stops the check with a non-zero exit code.
- The tools are **dev dependencies** with versions in the lockfile, so everyone, and the CI server, runs the same ESLint and Prettier. A tool installed globally on one laptop is a different version on the next.
- The same `npm run check` runs on every pull request in CI (continuous integration). Locally, many teams also run the fast checks before each commit with a Git hook (tools such as `husky` and `lint-staged` do this for only the changed files).

## Editor integration

The fastest feedback is in the editor, while you type. In VS Code, the ESLint extension underlines problems as you write, and the Prettier extension formats on save. Commit the settings so the whole team gets the same behaviour:

.vscode/settings.json

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

.vscode/extensions.json

```json
{
  "recommendations": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
}
```

`extensions.json` makes VS Code offer the extensions to anyone who opens the project. An `.editorconfig` file sets basics such as indentation and line endings for every editor, not only VS Code:

.editorconfig

```ts
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
```

The autocompletion and error squiggles you see in JavaScript files come from the TypeScript **language server**, even in plain JavaScript projects. It reads JSDoc comments too, and adding `// @ts-check` at the top of a `.js` file turns on real type errors for that file, a gentle first step towards [TypeScript](https://zudojs.oyinlola.site/learn/ts-setup).

The editor is a convenience, not the gate. Someone will use a different editor, or have the extension switched off. CI running `npm run check` is what actually guarantees the rules hold.

## Failure cases and production concerns

- **Tools that fight.** A linter formatting rule and Prettier disagree, and saving the file flips it back and forth. Let one tool own each job.
- **Linting generated files.** `dist/` is full of minified code with thousands of "problems". Ignore build output: `{ ignores: ["dist/"] }` as the first object in `eslint.config.js`, and a `.prettierignore`.
- **Different versions in different places.** `npx eslint` uses the project's copy if there is one, and downloads the latest otherwise. Always install tools as dev dependencies so the lockfile pins them.
- **Slow checks get skipped.** If `npm run check` takes minutes, people stop running it. `eslint --cache` only re-checks changed files; run the slowest tests in CI only.
- **Warnings nobody reads.** Hundreds of warnings hide the one that matters. Either fix a rule's warnings and make it an error, or turn it off.
- **Source maps in the wrong place.** Without them, production errors are unreadable; published carelessly, they reveal your source. Decide deliberately where they go.
- **Secrets in bundles and config in code.** Anything bundled for the browser is public. Configuration comes from the environment, validated once at startup.

## Practice

TRY IT YOURSELF

### Compare .env with .env.example

New developers copy `.env.example` to `.env`, and six months later the two have drifted apart. Write `compareEnv(envText, exampleText)` that uses `util.parseEnv` and reports which keys are missing from `.env` and which keys in `.env` are not documented in the example.

**Show a solution**

compare-env.jsNode.js only

```ts
import { parseEnv } from "node:util";

function compareEnv(envText, exampleText) {
  const env = Object.keys(parseEnv(envText));
  const example = Object.keys(parseEnv(exampleText));
  return {
    missing: example.filter((key) => !env.includes(key)),
    undocumented: env.filter((key) => !example.includes(key)),
  };
}

const example = "PORT=3000\nDATABASE_URL=\nPAYMENT_SECRET_KEY=\nLOG_LEVEL=info\n";
const local = "PORT=4000\nDATABASE_URL=postgres://localhost:5432/shop\nLOG_LEVEL=debug\nFEATURE_WALLET=1\n";
console.log(compareEnv(local, example));
```

Output of `node compare-env.js`

```json
{
  missing: [ 'PAYMENT_SECRET_KEY' ],
  undocumented: [ 'FEATURE_WALLET' ]
}
```

Run a script like this in `npm run check`, and `.env.example` stays an accurate list of every setting the program needs. It only compares names, so it never prints a secret value.

TRY IT YOURSELF

### Detect a circular import in the mini-bundler

Real bundlers warn about **circular imports** (a imports b, b imports a), because the order in which such modules run is easy to get wrong. Write `findCycle(files, entry)` for the mini-bundler's `files` format that returns the first cycle it finds as a list of module names, or `null`.

**Show a solution**

find-cycle.js

```ts
const importPattern = /import \{[^}]+\} from "([^"]+)";/g;

function findCycle(files, entry, path = []) {
  if (path.includes(entry)) return [...path.slice(path.indexOf(entry)), entry];
  for (const [, from] of files[entry].matchAll(importPattern)) {
    const cycle = findCycle(files, from, [...path, entry]);
    if (cycle) return cycle;
  }
  return null;
}

const shop = {
  "./main.js": 'import { checkout } from "./checkout.js";',
  "./checkout.js": 'import { applyCoupon } from "./coupons.js";',
  "./coupons.js": 'import { cartTotal } from "./checkout.js";',
};
console.log(findCycle(shop, "./main.js"));

const clean = { "./main.js": 'import { a } from "./a.js";', "./a.js": "export function a() {}" };
console.log(findCycle(clean, "./main.js"));
```

Output of `node find-cycle.js` and of the browser terminal

```json
[ './checkout.js', './coupons.js', './checkout.js' ]
null
```

The `path` holds the chain of imports currently being followed. Meeting a module that is already on the path means the chain loops. The usual fix is to move the shared code (here, the cart total) into a third module that both import.

TRY IT YOURSELF

### Choose the tools

A two-person team builds a Node.js API in plain JavaScript and a small browser page. Which tools from this lesson would you set up on day one, and which would you leave for later? Give a reason for each.

**Show a solution**

- **Day one:** Prettier and ESLint (cheap, and adding them later means one huge reformatting commit and hundreds of old warnings); a `check` script and the same check in CI; `--env-file` with a validated config module and a `.env.example`; `node --test` for tests.
- **Soon:** `// @ts-check` or TypeScript, once the code base grows beyond what two people can keep in their heads.
- **Only when needed:** a bundler. A small page with a few modules can use native `<script type="module">` directly; add Vite when you need npm packages in the browser or the page grows. The API needs no bundler at all.

Every tool has a cost: configuration, updates, and time in every check. Add a tool when you can name the problem it solves for you.

## Recap

- Tools fall into a few categories: formatters (layout), linters (suspicious patterns), type checkers (shapes), tests (meaning), transpilers, bundlers, source maps, configuration and task runners.
- Prettier ends style debates: `--write` locally, `--check` in CI. ESLint parses code into a syntax tree and reports likely bugs; `--fix` only applies safe changes.
- Transpilers rewrite syntax but cannot add missing functions; checking types is a separate job.
- Bundlers follow imports from an entry, tree-shake, join and minify. Browser apps need them; Node.js servers usually do not. Everything in a browser bundle is public.
- Source maps translate generated positions back to your files: `--enable-source-maps` for Node.js, automatic in DevTools.
- Layer `.env` files, let the real environment win, and validate all settings once at startup with no defaults for secrets or database addresses.
- Pin tools as dev dependencies, run them all with `npm run check`, share editor settings, and let CI be the gate.

Next, [The debugging method](https://zudojs.oyinlola.site/learn/debug-method): what to do when the tools pass, the tests pass, and the program is still wrong.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
