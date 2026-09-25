---
title: "Reading framework source — ZudoJS Academy"
description: "Answer questions the docs cannot by reading published ZudoJS packages: package boundaries, .d.ts files, generics, and a request traced through dist code."
source: https://zudojs.oyinlola.site/learn/framework-read-source
---

LEVEL 11 · LESSON 12 OF 12

Framework engineering Core

# Reading framework source

Answer questions the docs cannot by reading published ZudoJS packages: package boundaries, .d.ts files, generics, and a request traced through dist code.

- **55 min** to read and try
- **You need:** Build a mini framework, parts 1 and 2, and Declaration files
- **You build:** A small toolkit (package map, grep, excerpt) for reading packages in node_modules, and a documented trace of @zudojs/http routing and @zudojs/container resolution, each finding confirmed by an experiment

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Map a package from its package.json: entry points, the exports boundary, shipped files and dependencies
- Tell public API from internals, and explain why relying on internals is risky
- Read generic declarations in .d.ts files and predict what they compute
- Find where a function is defined and follow a request through a framework's compiled code
- Confirm every reading with a small experiment instead of trusting it
- Turn a surprising finding into a precise bug report or a design decision

## Questions the documentation does not answer

You built a router in [part 2](https://zudojs.oyinlola.site/learn/framework-build-http), then compared it with `@zudojs/http`. Now you are choosing how to structure the BookStore's routes for real, and you have questions that no documentation page answers precisely. Start with an experiment: six routes, registered in a deliberately awkward order, and four requests:

source.ts

```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!readdirSync(dir).includes("package.json")) dir = dirname(dir);
  return dir;
}

export function packageJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot(name), "package.json"), "utf8"));
}

export function files(hits: readonly Hit[]): string[] {
  return [...new Set(hits.map((hit) => hit.file))];
}

export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export function grep(name: string, pattern: RegExp, extension = ".js"): Hit[] {
  const root = packageRoot(name);
  const hits: Hit[] = [];
  for (const entry of readdirSync(join(root, "dist"), { recursive: true, encoding: "utf8" }).sort()) {
    if (!entry.endsWith(extension) || (extension === ".js" && entry.endsWith(".d.ts"))) continue;
    const path = join(root, "dist", entry);
    readFileSync(path, "utf8").split("\n").forEach((text, index) => {
      if (pattern.test(text)) hits.push({ file: relative(root, path), line: index + 1, text: text.trim() });
    });
  }
  return hits;
}

export function excerpt(name: string, file: string, from: RegExp, count: number): string {
  const lines = readFileSync(join(packageRoot(name), file), "utf8").split("\n");
  const start = lines.findIndex((line) => from.test(line));
  if (start === -1) throw new Error(`${from} not found in ${file}`);
  const numbered = lines.slice(start, start + count).map((line, i) => `${String(start + i + 1).padStart(4)}  ${line}`);
  return [`// ${file}`, ...numbered].join("\n");
}
```

(`source.ts` holds the small reading tools this lesson builds, explained [below](#tools). The first experiment only uses the router.)

ranking.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/:a/:b/:c/:d", () => "catch-all");
router.get("/books/:id", () => "show");
router.get("/books/:id(\\d+)", () => "show-numeric");
router.get("/books/new", () => "form");
router.get("/admin/*rest", () => "admin");

console.log(router.compiled().map((route) => route.definition.path).join("  "));
for (const path of ["/books/new", "/books/42", "/admin/a/b/c", "/shop/a/b/c"]) {
  const match = router.match("GET", path);
  console.log(`${path} -> ${match.route?.path} ${JSON.stringify(match.params)}`);
}
```

Output of `npx tsx ranking.ts`

```ts
/books/new  /books/:id  /books/:id(\d+)  /admin/*rest  /:a/:b/:c/:d
/books/new -> /books/new {}
/books/42 -> /books/:id {"id":"42"}
/admin/a/b/c -> /admin/*rest {"rest":"a/b/c"}
/shop/a/b/c -> /:a/:b/:c/:d {"a":"shop","b":"a","c":"b","d":"c"}
```

Three things in that output deserve an explanation:

1. `/books/new` won over `/books/:id` although it was registered later, and the four-parameter catch-all, registered first, came last. So the router ranks routes. By what rule?
2. `/books/:id(\d+)`, a parameter that only accepts digits, never matched `/books/42`. The plain `/books/:id` took it. Is that a bug, or a rule you must know?
3. With 400 routes, what does finding one cost? The package also exports a `RouteTree`, the fast structure from [Tries](https://zudojs.oyinlola.site/learn/dsa-tries). Does the router use it?

Documentation describes what a package promises. The source describes what it does. When you need to know exactly, you read the source, and every framework you depend on is sitting in `node_modules`, readable. This lesson teaches how to read it efficiently: where to start, what to trust, how to follow one request through code you did not write, and how to confirm each conclusion with an experiment. The subjects are the published ZudoJS packages; the method works for any framework.

## Hypotheses before files

REASON IT OUT

### What do you expect to find?

Reading without a question is slow: a package like `@zudojs/http` ships hundreds of files. Before opening any, write down what you expect, based on your own router from part 2:

- Where would the ranking live: when a route is registered, or when a request is matched? What would "more specific" compare?
- If two routes are equally specific, what could break the tie?
- What would make a constrained parameter such as `:id(\d+)` rank above a plain one, and why might an author choose not to?
- What would you search for to find the code that matches a path?

**Show the reasoning**

A reasonable set of hypotheses: routes are *compiled* into segments when registered, and *ranked* either then or at match time. "More specific" compares segment kinds (literal beats parameter beats wildcard), left to right, as your router did. A tie is broken by registration order, because a stable sort keeps it. A constraint is a regular expression, which the router cannot compare with another pattern in general, so an author may deliberately rank `:id(\d+)` the same as `:id` and leave the order to you. To find the matching code, search for the words the public API uses (`match`, `dispatch`) and for the names in the error messages you saw.

Each hypothesis tells you what to look for and what would prove it wrong. That is the difference between reading and wandering.

## Map the package first

Every npm package starts at its `package.json`. Five fields tell you most of what you need before you read any code: `type` (ES modules or CommonJS), `types` (where the declarations are), `exports` (what may be imported, and from which file), `files` (what was published) and `dependencies` (what else it runs on).

map.tsNode.js only

```ts
import { packageJson } from "./source.js";

for (const name of ["@zudojs/http", "@zudojs/container"]) {
  const pkg = packageJson(name);
  console.log(name);
  console.log("  type:", pkg.type, "| types:", pkg.types);
  console.log("  exports:", JSON.stringify(pkg.exports));
  console.log("  files:", JSON.stringify(pkg.files));
  console.log("  depends on:", Object.keys((pkg.dependencies as Record<string, string>) ?? {}).join(", "));
}

const specifier = "@zudojs/http/dist/httpAdapter/httpAdapter.errorResponse.js";
try {
  await import(specifier);
} catch (error) {
  console.log("deep import:", (error as NodeJS.ErrnoException).code);
}
```

Output of `npx tsx map.ts`

```ts
@zudojs/http
  type: module | types: ./dist/index.d.ts
  exports: {".":{"types":"./dist/index.d.ts","import":"./dist/index.js"}}
  files: ["dist","!dist/**/*.map","!dist/**/*.tsbuildinfo","!dist/.tsbuildinfo"]
  depends on: @zudojs/crypto, @zudojs/errors, @zudojs/logger, @zudojs/middleware, @zudojs/openapi, @zudojs/security
@zudojs/container
  type: module | types: ./dist/index.d.ts
  exports: {".":{"types":"./dist/index.d.ts","import":"./dist/index.js"}}
  files: ["dist","!dist/**/*.map","!dist/**/*.tsbuildinfo","!dist/.tsbuildinfo"]
  depends on: @zudojs/errors
deep import: ERR_PACKAGE_PATH_NOT_EXPORTED
```

- **`exports` is the public boundary.** Only `"."` is listed, so `import … from "@zudojs/http"` is the one way in. Node refuses any deeper path with `ERR_PACKAGE_PATH_NOT_EXPORTED`, even though the file exists on disk. Everything else in `dist/` is implementation.
- **`files` excludes `*.map`.** No source maps are shipped, so your editor's "Go to Definition" lands in a `.d.ts` file, never in the original TypeScript. The JavaScript in `dist/` is compiled but readable: `tsc` keeps names, comments and structure.
- **`dependencies` is the package's own map of its world.** `@zudojs/http` builds on errors, logging, middleware, security, crypto and OpenAPI; `@zudojs/container` only on errors. That already tells you which package is the bigger read.

## Public API and internals

The file behind `"."` is usually a **barrel**: an `index.js` that re-exports other modules. Its first lines are the package's table of contents, and its comments often explain decisions:

barrel.tsNode.js only

```ts
import * as http from "@zudojs/http";
import { excerpt } from "./source.js";

console.log(excerpt("@zudojs/http", "dist/index.js", /^export \* from "\.\/httpProtocol/, 3));
console.log("   …");
console.log(excerpt("@zudojs/http", "dist/index.js", /The rule is declaration order/, 2));

for (const name of ["createRouter", "RouteTree", "compareSegmentSpecificity", "resolveErrorResponse", "HttpRouter"]) {
  console.log(`${name.padEnd(26)} exported: ${name in http}`);
}
```

Output of `npx tsx barrel.ts`

```ts
// dist/index.js
  10  export * from "./httpProtocol/index.js";
  11  export * from "./httpTypes/index.js";
  12  export * from "./httpConstants/index.js";
   …
// dist/index.js
  61   * The rule is declaration order: the sub-module listed first in this file owns
  62   * the name. The other definitions remain reachable from their own sub-module.
createRouter               exported: true
RouteTree                  exported: true
compareSegmentSpecificity  exported: true
resolveErrorResponse       exported: false
HttpRouter                 exported: true
```

Forty-odd folders are re-exported with `export *`. Where two folders export the same name, the barrel says explicitly which one wins. The last lines ask the running package what it really exports: `RouteTree` and even the internal-looking `compareSegmentSpecificity` are public, while `resolveErrorResponse`, which you will meet shortly, is not.

That gives three categories, and they deserve different amounts of trust:

| Category | How to recognise it | Can you depend on it? |
| --- | --- | --- |
| Documented public API | Exported, typed in `.d.ts`, shown in the docs and examples | Yes: semantic versioning protects it; a breaking change needs a major version |
| Exported but incidental | Exported because a barrel re-exports a whole folder; not in the docs | Carefully: technically public, but its authors may not treat it as a promise |
| Internal | Not reachable through `exports`; often marked "internal" in a comment | No: it can change in any patch release, and Node will not even load it |

Reading internals to *understand* behaviour is always fine. Building on them is how upgrades break.

## Read the types first

A `.d.ts` file is the package's contract without the implementation ([Declaration files](https://zudojs.oyinlola.site/learn/ts-declarations) covers the syntax). It is the fastest way to learn what a function accepts and returns, because it is short and it is what the compiler checks you against. Here are the declarations behind the container's `registerFactory`, pulled out of `dist/`:

read-dts.tsNode.js only

```ts
import { grep } from "./source.js";

const declarations = grep(
  "@zudojs/container",
  /registerFactory<|^export type InjectedDependencies|^export type InjectedFactory|^export type ProviderToken|-readonly \[K in keyof Deps\]/,
  ".d.ts",
);
for (const hit of declarations) console.log(`${hit.file.replace("dist/", "")}:\n  ${hit.text}`);
```

Output of `npx tsx read-dts.ts`

```ts
containerCore/containerCore.core.d.ts:
  registerFactory<T, const Deps extends readonly ProviderToken[] = readonly []>(token: RegistrationToken<T>, factory: InjectedFactory<T, Deps>, inject?: Deps, options?: CreateRegistrationOptions): ContainerRegistration<T>;
containerProvider/containerProvider.core.d.ts:
  export type ProviderToken<T = unknown> = Token<T> | InjectionToken<T>;
containerProvider/containerProvider.core.d.ts:
  export type InjectedDependencies<Deps extends readonly ProviderToken[]> = {
containerProvider/containerProvider.core.d.ts:
  -readonly [K in keyof Deps]: Deps[K] extends ProviderToken<infer U> ? U : never;
containerProvider/containerProvider.core.d.ts:
  export type InjectedFactory<T, Deps extends readonly ProviderToken[]> = (...dependencies: InjectedDependencies<Deps>) => T;
```

Read a generic declaration from the inside out, the way you read your own in [part 1](https://zudojs.oyinlola.site/learn/framework-build-core#container):

- `ProviderToken<T>` is a token that carries the type `T`.
- `InjectedDependencies<Deps>` is a **mapped type over a tuple**: for each position `K` of `Deps`, `infer U` pulls the type out of the token there, and `-readonly` makes the result usable as a parameter list. It is exactly your `Values<D>` from [part 1](https://zudojs.oyinlola.site/learn/framework-build-core#container).
- `InjectedFactory<T, Deps>` is a function taking those values and returning `T`.
- `registerFactory<T, const Deps …>` ties them together; the `const` modifier makes TypeScript infer `[CLOCK, SHOP_NAME]` as a tuple, so each factory parameter gets its own type.

The quickest way to check your reading is to make the compiler show you what a type computes. Assign a value you know is wrong and read the error:

dts-types.ts

```ts
import { createToken } from "@zudojs/container";
import type { InjectedDependencies } from "@zudojs/container";
import type { LoggerLevelLike } from "@zudojs/logger";

const CLOCK = createToken<Date>("Clock");
const SHOP_NAME = createToken<string>("ShopName");

const deps: InjectedDependencies<[typeof CLOCK, typeof SHOP_NAME]> = ["2026-09-25", 7];
const level: LoggerLevelLike = "Info";
```

What `npx tsc --noEmit` prints

```ts
dts-types.ts:8:71 - error TS2322: Type 'string' is not assignable to type 'Date'.

8 const deps: InjectedDependencies<[typeof CLOCK, typeof SHOP_NAME]> = ["2026-09-25", 7];
                                                                        ~~~~~~~~~~~~

dts-types.ts:8:85 - error TS2322: Type 'number' is not assignable to type 'string'.

8 const deps: InjectedDependencies<[typeof CLOCK, typeof SHOP_NAME]> = ["2026-09-25", 7];
                                                                                      ~

dts-types.ts:9:7 - error TS2820: Type '"Info"' is not assignable to type 'LoggerLevelLike'. Did you mean '"info"'?

9 const level: LoggerLevelLike = "Info";
        ~~~~~


Found 3 errors in the same file, starting at: dts-types.ts:8
```

The first two errors prove the reading: `InjectedDependencies` turned the two tokens into `[Date, string]`. The third reveals a type you never opened: `LoggerLevelLike` accepts lower-case names (and, it turns out, upper-case ones through `Uppercase<LoggerLevelName>`), but not `"Info"`.

## Finding where things are defined

Your editor's "Go to Definition" stops at the `.d.ts`. VS Code's **Go to Source Definition** tries to jump to the JavaScript instead, and a text search over `dist/` always works. The three helpers in `source.ts` are that search, packaged: `packageRoot` finds a package's folder through Node's own resolution (`import.meta.resolve`), `grep` searches its `dist/` files line by line, and `excerpt` prints numbered lines from one file, so what you quote is exactly what is installed.

find.tsNode.js only

```ts
import { files, grep } from "./source.js";

const where = (pattern: RegExp) => files(grep("@zudojs/http", pattern)).map((file) => `  ${file}`).join("\n");

console.log("createRouter is defined in:\n" + where(/export function createRouter\(/));
console.log("class HttpRouter is defined in:\n" + where(/^export class HttpRouter\b/));
console.log("files that mention RouteTree:\n" + where(/RouteTree/));
console.log("files that mention matchCompiledRoute:\n" + where(/matchCompiledRoute/));
```

Output of `npx tsx find.ts`

```ts
createRouter is defined in:
  dist/httpRouter/core/factory/httpRoute.factory.js
class HttpRouter is defined in:
  dist/httpRouter/core/register/httpRouter.register.js
files that mention RouteTree:
  dist/httpRouter/tree/httpTree.core.js
  dist/httpRouter/tree/httpTree.factory.js
  dist/httpRouter/tree/index.js
files that mention matchCompiledRoute:
  dist/httpRouter/core/factory/httpRoute.factory.base.js
  dist/httpRouter/core/register/httpRouter.register.js
  dist/httpRouter/matching/httpRoute.matcher.core.js
  dist/httpRouter/matching/httpRoute.matcher.js
  dist/httpRouter/matching/index.js
  dist/httpRouter/pattern/httpRoute.pattern.parse.js
```

That answers the third question from the opening before reading a single function. `RouteTree` is mentioned only inside its own `tree` folder: nothing else in the package uses it. `matchCompiledRoute`, on the other hand, is used by the router class. Now you know which file to open.

> TIP
>
> When you are unsure what to search for, search for a string you have *seen*: an error message, an HTTP status text, an option name from the docs. Messages are rarely renamed, and they lead straight to the code that produced them.

## Following a request through @zudojs/http

With the map in hand, follow one request, one hop at a time. At each hop, note the file, what the code does, and what surprised you.

### 1. Registration: routes are compiled

`createRouter()` is a one-line factory that returns `new HttpRouter(options)`, a pattern you will see in almost every framework: the function is the stable API, the class is the implementation. `router.get(path, handler)` calls `register`, which rejects duplicate method-and-path pairs with a `RouteConflictError`, compiles the path into typed segments (literal, parameter, wildcard) and gives the route an increasing sequence number.

### 2. Matching: ranked on every request

read-match.tsNode.js only

```ts
import { excerpt } from "./source.js";

const file = "dist/httpRouter/core/register/httpRouter.register.js";
console.log(excerpt("@zudojs/http", file, /^    match\(method, path\) \{/, 12));
console.log("   …");
console.log(excerpt("@zudojs/http", file, /^    sortedRoutes\(\) \{/, 9));
```

Output of `npx tsx read-match.ts`

```ts
// dist/httpRouter/core/register/httpRouter.register.js
 123      match(method, path) {
 124          const normalizedMethod = method.toUpperCase();
 125          const normalizedPath = normalizePath(path);
 126          const matchPath = normalizeMatchPath(path);
 127          const candidates = this.sortedRoutes();
 128          const allowedForPath = () => collectAllowedMethods(candidates, matchPath, this.routerOptions.caseSensitive);
 129          const allowed = new Set();
 130          let pathMatched = false;
 131          for (const route of candidates) {
 132              const params = matchCompiledRoute(route, matchPath, this.routerOptions.caseSensitive);
 133              if (!params) {
 134                  continue;
   …
// dist/httpRouter/core/register/httpRouter.register.js
 296      sortedRoutes() {
 297          return [...this.routes].sort((left, right) => {
 298              const specificity = compareSegmentSpecificity(left.segments, right.segments);
 299              if (specificity !== 0) {
 300                  return specificity;
 301              }
 302              return (extractRouteSequence(left.definition.id) -
 303                  extractRouteSequence(right.definition.id));
 304          });
```

This is the answer to the cost question. `match` calls `sortedRoutes()`, which copies and sorts all routes, *on every call*, then tries them one by one with `matchCompiledRoute`. With *n* routes that is a sort, O(*n* log *n*), plus a linear scan, O(*n*), per request. For a typical API of a few dozen routes it does not matter. For thousands, it would: the order could be computed once when a route is added, as your router did. That is a precise, testable observation worth reporting to the maintainers, not a reason to panic.

The ranking rule itself is in the pattern module, and its comment is worth reading in full:

read-specificity.tsNode.js only

```ts
import { excerpt } from "./source.js";

console.log(excerpt("@zudojs/http", "dist/httpRouter/pattern/httpRoute.pattern.parse.js", /^ \* Compares two compiled patterns by specificity/, 23));
```

Output of `npx tsx read-specificity.ts`

```ts
// dist/httpRouter/pattern/httpRoute.pattern.parse.js
  85   * Compares two compiled patterns by specificity, most specific first.
  86   *
  87   * Segments are compared left to right by kind (literal, then parameter, then
  88   * wildcard), which is how a router is expected to rank patterns. Summing the
  89   * kinds into one scalar — as this used to — let a longer but entirely
  90   * parameterised pattern such as `/:p/:q/:r/:s` outrank a literal-anchored
  91   * `/admin/*rest`, so a request to `/admin/a/b/c` bypassed the admin route and
  92   * every guard registered on it.
  93   *
  94   * @param left - The first pattern's segments.
  95   * @param right - The second pattern's segments.
  96   * @returns A negative number when `left` is more specific.
  97   */
  98  export function compareSegmentSpecificity(left, right) {
  99      const length = Math.max(left.length, right.length);
 100      for (let index = 0; index < length; index += 1) {
 101          const difference = segmentScore(right[index]) - segmentScore(left[index]);
 102          if (difference !== 0) {
 103              return difference;
 104          }
 105      }
 106      return 0;
 107  }
```

Now the opening output makes sense. Segments are compared left to right by kind (literal 3, parameter 2, wildcard 1): `/books/new` beats `/books/:id` at the second segment, and `/admin/*rest` beats `/:a/:b/:c/:d` at the first. `:id(\d+)` is still a parameter, so it ties with `:id`, and the tie goes to the lower sequence number: the route registered first. The constrained route was not broken; it was registered second. Register it first and it wins for digits, while `/books/b1` falls through to the plain one.

The comment also records history: the rule used to be a sum, and that let a catch-all route bypass `/admin/*rest` and every guard on it. Comments that say "used to" are some of the most valuable lines in a codebase: each describes an edge case that once broke, which is exactly the kind of case you should test in your own code.

### 3. Dispatch: middleware, then the handler, then normalisation

`dispatch` matches, builds the router context (`params`, `query`, `state`, an `AbortSignal`) and calls `executeRoute`. That function is your `compose` from part 2: an index-based recursion over the route's middleware, with the same guard that throws when `next()` runs twice. What the handler returns goes through `normalizeResponse`: a response object is used as it is, `undefined` or `null` becomes `204 No Content`, and any other value becomes `200` with a JSON body, which is why the part 2 handlers could simply return a book.

### 4. Errors: how a thrown value becomes a status

In [part 2](https://zudojs.oyinlola.site/learn/framework-build-http), `throw new NotFoundError(…)` produced a 404. Searching for the status text of a 500, `"Internal Server Error"`, leads to the adapter's error mapper:

read-errors.tsNode.js only

```ts
import { excerpt } from "./source.js";

const file = "dist/httpAdapter/httpAdapter.errorResponse.js";
console.log(excerpt("@zudojs/http", file, /deliberately internal/, 1));
console.log("   …");
console.log(excerpt("@zudojs/http", file, /^export function resolveErrorResponse/, 18));
```

Output of `npx tsx read-errors.ts`

```ts
// dist/httpAdapter/httpAdapter.errorResponse.js
  14   * This module is deliberately internal: it is not part of the public API.
   …
// dist/httpAdapter/httpAdapter.errorResponse.js
 100  export function resolveErrorResponse(error) {
 101      const statusError = findStatusError(error, 0, new Set());
 102      if (!statusError) {
 103          return {
 104              status: 500,
 105              body: { error: "Internal Server Error" },
 106              headers: {},
 107          };
 108      }
 109      const status = statusError.statusCode;
 110      const expose = statusError.expose === true;
 111      const message = expose && typeof statusError.message === "string" && statusError.message
 112          ? statusError.message
 113          : getStatusText(status);
 114      const body = { error: message };
 115      if (expose && typeof statusError.code === "string" && statusError.code) {
 116          body.code = statusError.code;
 117      }
```

The mapper does not check for an `@zudojs/errors` class. It looks for any error with a numeric `statusCode` between 400 and 599 (**duck typing**: if it has a status, it is treated as an HTTP error), and it shows the message and `code` only when the error sets `expose: true`. That is a design decision with consequences, so confirm it with your own error class:

status-errors.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";

class OutOfPrintError extends Error {
  readonly statusCode = 410;
  readonly code = "ERR_OUT_OF_PRINT";
  constructor(message: string, readonly expose = false) {
    super(message);
  }
}

const router = createRouter();
router.get("/hidden", () => {
  throw new OutOfPrintError("Book b7 is out of print (supplier contract 2231 ended)");
});
router.get("/exposed", () => {
  throw new OutOfPrintError("Book b7 is out of print", true);
});
router.get("/bug", () => {
  throw new Error("pool exhausted at db.internal:5432");
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
for (const path of ["/hidden", "/exposed", "/bug"]) {
  const response = await fetch(`http://127.0.0.1:${server.address?.port}${path}`);
  console.log(path, response.status, await response.text());
}
await server.stop();
```

Output of `npx tsx status-errors.ts`

```ts
/hidden 410 {"error":"Gone"}
/exposed 410 {"error":"Book b7 is out of print","code":"ERR_OUT_OF_PRINT"}
/bug 500 {"error":"Internal Server Error"}
```

Confirmed on all three counts. An error class that `@zudojs/errors` has never heard of got its 410. Without `expose`, the client saw only the status text, so the supplier contract number stayed private; with it, the message and the code went out. And an ordinary `Error` became a 500 whose body says nothing about the pool or the database host. Your part 2 framework made the same promise with an `instanceof HttpError` check; ZudoJS makes it with a duck-typed `statusCode` and an opt-in `expose`, which lets errors from other libraries carry statuses too.

## Following a resolution through @zudojs/container

Same method, second package. `container.resolve(token)` checks that the container is active and hands the work to a `ContainerResolver`, whose header comment is a small specification of lifetimes worth reading first. The heart of it is `resolveInternal`:

read-resolve.tsNode.js only

```ts
import { excerpt } from "./source.js";

const file = "dist/containerResolution/containerResolution.core.js";
console.log(excerpt("@zudojs/container", file, /^    resolveInternal\(token, state, singletonAncestor\) \{/, 7));
console.log("   …");
console.log(excerpt("@zudojs/container", file, /^        else if \(registration.scope === Scope.SCOPED\) \{/, 6));
console.log("   …");
console.log(excerpt("@zudojs/container", file, /const nextAncestor = /, 1));
```

Output of `npx tsx read-resolve.ts`

```ts
// dist/containerResolution/containerResolution.core.js
 119      resolveInternal(token, state, singletonAncestor) {
 120          const depth = state.path.length + 1;
 121          if (depth > state.maxResolutionDepth)
 122              throw new MaxResolutionDepthError(describeToken(token), depth, state.maxResolutionDepth, [...state.path, token].map((t) => describeToken(t)));
 123          if (state.detectCircularDependencies && state.pathSet.has(token))
 124              throw new CircularDependencyError([...state.path, token].map((t) => describeToken(t)));
 125          let registration = this.registry.get(token);
   …
// dist/containerResolution/containerResolution.core.js
 155          else if (registration.scope === Scope.SCOPED) {
 156              if (singletonAncestor !== undefined)
 157                  throw new CaptiveDependencyError(describeToken(singletonAncestor), describeToken(token), currentPath.map((t) => describeToken(t)));
 158              if (!state.scopeCache)
 159                  throw new ScopedResolutionError(describeToken(token), currentPath.map((t) => describeToken(t)));
 160              if (state.scopeCache.has(token)) {
   …
// dist/containerResolution/containerResolution.core.js
 171          const nextAncestor = registration.scope === Scope.SINGLETON ? token : singletonAncestor;
```

Compare it with your `#resolve` from part 1. The shape is the same: a depth limit, cycle detection on the current path (here with a `Set` alongside the array, so the check is O(1)), a registry lookup, the lifetime rules, then creation. One design is better than yours: instead of scanning the whole path for a singleton, as your container did, it passes down `singletonAncestor`, the nearest singleton above the current token. A scoped token reached with any singleton above it, even through transients, is captive. Reading the code produced four predictions; the experiment checks each:

container-experiments.tsNode.js only

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

class Clock {
  now(): string {
    return "2026-09-25T09:00:00Z";
  }
}
class Mailer {
  constructor(readonly host: string) {}
}
class Sms {
  constructor(readonly gateway = "sms.shop.ng") {}
}

const CART = createToken<string[]>("Cart");
const FORMATTER = createToken<{ format(): string }>("Formatter");
const REPORT = createToken<string>("Report");
const POOL = createToken<Promise<number>>("Pool");

const container = createContainer();
container.registerFactory(CART, () => [], [], { scope: ContainerScope.SCOPED });
container.registerFactory(FORMATTER, (cart) => ({ format: () => cart.join(", ") }), [CART]);
container.registerFactory(REPORT, (formatter) => formatter.format(), [FORMATTER], { scope: ContainerScope.SINGLETON });
container.registerFactory(POOL, async () => 10, [], { scope: ContainerScope.SINGLETON });

const attempts: [string, () => unknown][] = [
  ["unregistered class, no parameters", () => container.resolve(Clock).now()],
  ["unregistered class with parameters", () => container.resolve(Mailer)],
  ["unregistered class with a default parameter", () => container.resolve(Sms).gateway],
  ["singleton -> transient -> scoped", () => container.createScope().resolve(REPORT)],
  ["async singleton factory", () => container.resolve(POOL)],
];
for (const [label, attempt] of attempts) {
  try {
    console.log(`${label}: ${String(attempt())}`);
  } catch (error) {
    console.log(`${label}: ${(error as Error).name}`);
  }
}
console.log("Clock was registered:", container.has(Clock), "as", container.getRegistration(Clock)?.scope);
console.log("constructor lengths:", Clock.length, Mailer.length, Sms.length);
```

Output of `npx tsx container-experiments.ts`

```ts
unregistered class, no parameters: 2026-09-25T09:00:00Z
unregistered class with parameters: RegistrationNotFoundError
unregistered class with a default parameter: sms.shop.ng
singleton -> transient -> scoped: CaptiveDependencyError
async singleton factory: AsyncProviderError
Clock was registered: true as transient
constructor lengths: 0 1 0
```

- A class with no constructor parameters is **registered automatically** on first resolve, as transient. The source decides this with `token.length === 0`: `Function.prototype.length` counts the parameters *before the first default value*.
- So `Mailer` (one parameter) is refused with a message explaining how to register it, while `Sms`, whose only parameter has a default, has a `length` of 0 and is built with its default. Useful when the default is what you want; surprising when you expected an error.
- Singleton → transient → scoped is captive, as `singletonAncestor` predicted.
- A singleton factory that returns a promise throws `AsyncProviderError` instead of caching a promise, the rule stated in the header comment. Your container would have cached the promise silently.

## Reading a command-line tool

Frameworks often come with a CLI, and a package announces its commands in the `bin` field of `package.json`. When you run `npx tsc`, npm looks up `tsc` in the `bin` fields of the installed packages and runs that file:

read-cli.tsNode.js only

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageJson, packageRoot } from "./source.js";

for (const name of ["typescript", "tsx"]) {
  const field = packageJson(name).bin as string | Record<string, string>;
  const bin = typeof field === "string" ? { [name]: field } : field;
  for (const [command, entry] of Object.entries(bin)) {
    const lines = readFileSync(join(packageRoot(name), entry), "utf8").split("\n");
    const minified = lines.some((line) => line.length > 1_000);
    console.log(`${command} -> ${name}/${entry.replace("./", "")}`);
    console.log(`  ${lines[0]}`);
    console.log(minified ? "  (a minified bundle: read the repository instead)" : `  ${lines[1]}`);
  }
}
```

Output of `npx tsx read-cli.ts`

```ts
tsc -> typescript/bin/tsc
  #!/usr/bin/env node
  import "../lib/tsc.js";
tsx -> tsx/dist/cli.mjs
  #!/usr/bin/env node
  (a minified bundle: read the repository instead)
```

`bin` is either an object (command name to file) or a single string (the command is the package's name). The file starts with a **shebang** line, `#!/usr/bin/env node`, so the operating system knows to run it with Node, and TypeScript's is two lines long: it imports the real compiler. `tsx` ships a **minified bundle**, compressed onto a few very long lines; do not try to read that, read the repository linked from its `package.json` instead. Most CLIs share a structure you already know from routers: parse the arguments, look the command up in a table, call its handler. Searching for a command name or a line of `--help` text finds that table.

## A method for any framework

1. **Write the question** and a hypothesis. "How does routing work?" is too broad; "why did `:id(\d+)` lose?" is answerable.
2. **Map the package**: `package.json`, `exports`, `dependencies`, the barrel.
3. **Read the types** of the functions involved; they bound what the code can do.
4. **Find the definition** by searching for API names, option names and messages you have seen.
5. **Read top-down** along one path: the entry function, then only the calls that matter to your question. Skip the rest; note it for later.
6. **Read the comments**, especially "used to", "must", "never" and "internal".
7. **Confirm with an experiment**, as small as possible. A reading you have not run is a guess.
8. **Write down** the answer, the file and the experiment, because you will need it again at the next upgrade.

This lesson's findings, written that way:

| Finding | Where | Confirmed by |
| --- | --- | --- |
| Routes rank by segment kind, left to right; ties go to registration order | `httpRoute.pattern.parse.js`, `httpRouter.register.js` | `ranking.ts` |
| Every match sorts all routes, then scans them; `RouteTree` is not used by the router | `httpRouter.register.js`; search for `RouteTree` | `find.ts`, `read-match.ts` |
| Any error with a 4xx/5xx `statusCode` sets the status; details only with `expose: true` | `httpAdapter.errorResponse.js` (internal) | `status-errors.ts` |
| Parameterless classes auto-register as transient; default parameters count as none | `containerResolution.autoRegister.js` | `container-experiments.ts` |
| Captive checks follow the nearest singleton ancestor; async singletons are refused | `containerResolution.core.js` | `container-experiments.ts` |

### From finding to contribution

A surprising finding is worth sharing, carefully. Before opening an issue, check the repository's existing issues and tests, reproduce it with the smallest possible program (like `ranking.ts`), state the version, what you expected, what happened and the lines involved, and suggest a fix if you have one ("sort once in `register`, not in `match`"). Maintainers act quickly on reports like that. [Professional Git](https://zudojs.oyinlola.site/learn/git-collaboration) covers the pull request that may follow.

## Practice

TRY IT YOURSELF

### In what order do event handlers run?

`@zudojs/events`: when three handlers listen to one event and the second throws, do they run one after another or at the same time, and does the third still run? Find the defaults in the source, then confirm with an experiment that cannot pass by luck.

**Show a solution**

Search for the option names you expect (`mode`, `errorMode`) with a default after `??`:

events-source.tsNode.js only

```ts
import { excerpt, grep } from "./source.js";

for (const hit of grep("@zudojs/events", /mode: options\.mode \?\? |errorMode: options\.emitter\?\.errorMode/)) {
  console.log(`${hit.file}:${hit.line}  ${hit.text}`);
}
console.log(excerpt("@zudojs/events", "dist/eventEmitter/eventEmitter.type.d.ts", /readonly mode\?: EventEmitterMode;/, 1));
```

Output of `npx tsx events-source.ts`

```ts
dist/eventBus/eventBus.core.js:52  errorMode: options.emitter?.errorMode ?? EventErrorMode.CONTINUE,
dist/eventEmitter/eventEmitter.core.js:27  mode: options.mode ?? EventEmitterMode.SEQUENTIAL,
// dist/eventEmitter/eventEmitter.type.d.ts
  21      readonly mode?: EventEmitterMode;
```

The emitter defaults to `SEQUENTIAL`, and the bus overrides the emitter's error mode with `CONTINUE`. Prediction: handlers run one after another, and a failure does not stop the next one. An experiment that can tell sequential from parallel needs a handler that waits:

events-order.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();
const log: string[] = [];
bus.on("order.placed", async () => {
  log.push("receipt: start");
  await new Promise((resolve) => setTimeout(resolve, 20));
  log.push("receipt: done");
});
bus.on("order.placed", async () => {
  throw new Error("SMS gateway down");
});
bus.on("order.placed", () => {
  log.push("stock: done");
});

const result = await bus.publishEvent({ type: "order.placed", payload: { orderId: "ord-1" } });
console.log(log.join(" | "));
console.log("handled:", result.handled, "succeeded:", result.succeeded, "failed:", result.failed);
```

Output of `npx tsx events-order.ts`

```ts
receipt: start | receipt: done | stock: done
handled: true succeeded: 2 failed: 1
```

If the handlers ran in parallel, `stock: done` would appear before `receipt: done`, because the receipt handler waits 20 ms. It did not, so they are sequential; the failing SMS handler was counted and the stock handler still ran. Layered defaults like this one (the bus changing the emitter's default) are common, and you only find them by following the options through both files.

TRY IT YOURSELF

### Body limits

How large may a request body be with `createNodeHttpAdapter`, and what happens to the connection when a body is too large? Compare with your part 2 adapter.

**Show a solution**

body-limit.tsNode.js only

```ts
import { excerpt, grep } from "./source.js";

for (const hit of grep("@zudojs/http", /DEFAULT_MAX_BODY_SIZE = |maxBodySize: \d/)) {
  console.log(`${hit.file}:${hit.line}  ${hit.text}`);
}
console.log(excerpt("@zudojs/http", "dist/httpAdapter/node/httpNode.adapter.js", /if \(error instanceof NodeRequestBodyTooLargeError\)/, 9));
```

Output of `npx tsx body-limit.ts`

```ts
dist/httpAdapter/fetch/httpFetch.type.js:6  export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
dist/httpAdapter/node/httpNode.type.js:22  export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;
dist/httpSecurity/httpSecurity.config.js:18  maxBodySize: 1_048_576, // 1MB
// dist/httpAdapter/node/httpNode.adapter.js
 225          if (error instanceof NodeRequestBodyTooLargeError) {
 226              /*
 227               * The request body was never drained, so this connection cannot be
 228               * safely reused for a following request.
 229               */
 230              context.setHeader("connection", "close");
 231              await this.writeNodeResponse(response, context.setStatus(413).json({ error: "Payload Too Large" }));
 232              return;
 233          }
```

The Node and fetch adapters default to 10 MB. The 1 MB value belongs to the security module's validator, a different check: two limits in one package, and the search found both, which a documentation page might not. The 413 branch sets `connection: close`, and its comment explains why: the rest of the oversized body was never read, so the connection cannot carry another request. Your part 2 adapter stopped reading too, but left the connection open and relied on Node to discard what was left. Closing it is the more robust choice; add `connection: close` to your 413 response.

TRY IT YOURSELF

### Make the constrained route win

Using only what you learned from the source, predict what `/books/42` and `/books/b1` match when `/books/:id(\d+)` is registered *before* `/books/:id`, and what `/books/new` matches if `/books/new` is registered last. Then check.

**Show a solution**

Prediction: all three routes compare equal at the first segment (literal `books`); at the second, `new` is a literal (3) and both parameters score 2, so `/books/new` wins whatever its registration order. Between the two parameter routes the tie goes to the earlier registration, so `/books/42` goes to `:id(\d+)`; `/books/b1` fails that route's pattern and falls through to `:id`.

constrained.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/books/:id(\\d+)", () => "numeric");
router.get("/books/:id", () => "any");
router.get("/books/new", () => "form");

for (const path of ["/books/42", "/books/b1", "/books/new"]) {
  console.log(path, "->", router.match("GET", path).route?.path);
}
```

Output of `npx tsx constrained.ts`

```ts
/books/42 -> /books/:id(\d+)
/books/b1 -> /books/:id
/books/new -> /books/new
```

The rule to remember for this router: register constrained parameters before plain ones at the same position. A comment next to your routes, pointing at this behaviour, will save the next developer an afternoon.

## Recap

- Start from a precise question and a hypothesis; the source answers what the documentation cannot.
- `package.json` maps a package: `exports` is the public boundary, `files` shows what shipped (here, no source maps), `dependencies` shows what it builds on.
- Exported and documented is API; exported by a barrel is incidental; unreachable through `exports` is internal. Read internals freely, build on them never.
- `.d.ts` files are the contract. Read generics from the inside out, and let a deliberate type error show you what a type computes.
- Search `dist/` for names and messages, read one path top-down, read the comments, and confirm every conclusion with a small experiment.
- `@zudojs/http` ranks routes by segment kind with registration order as the tie-break, sorts on every match, maps any error with a `statusCode` and exposes details only on request. `@zudojs/container` resolves like your container, with a sharper captive check, class auto-registration and a refusal of async singletons.

That completes the software architecture course: you can shape an application, choose a system style, build a framework and read one. Next, the ZudoJS fundamentals course starts with [Welcome to ZudoJS](https://zudojs.oyinlola.site/learn/zudo-welcome), where you will use these packages as their authors intended.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
