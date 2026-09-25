---
title: "Reading ZudoJS internals — ZudoJS Academy"
description: "Open the published @zudojs packages in node_modules, map their dependency graph, and trace how routing, scopes, wildcards and caching really work."
source: https://zudojs.oyinlola.site/learn/zudo-internals
---

LEVEL 18 · LESSON 1 OF 3

Framework engineering Advanced

# Reading ZudoJS internals

Open the published @zudojs packages in node_modules, map their dependency graph, and trace how routing, scopes, wildcards and caching really work.

- **60 min** to read and try
- **You need:** Reading framework source, Publishing TypeScript packages, TypeScript monorepos, and the ZudoJS lessons up to plugins and adapters
- **You build:** A toolkit that maps the @zudojs dependency graph from node_modules, finds the file behind any export, and pins the behaviour you rely on with characterization tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read a published package's package.json, dist JavaScript and declarations and say what is public and what is internal
- Compute the dependency graph of the @zudojs packages from their manifests and explain what the exact version pins mean for your app
- Find the file that defines any exported name by following the barrel files
- Trace how @zudojs/http, @zudojs/container, @zudojs/events and @zudojs/cache implement routing, scopes, wildcards and stampede protection, and predict their edge cases
- Explain how errors and context cross package boundaries, and why a duplicate package copy breaks instanceof and context
- Pin the behaviour you rely on with characterization tests and report a package bug with a minimal reproduction

## Three questions the documentation cannot settle

You are about to ship a payments service built on ZudoJS. In the release review, your team lead asks three questions:

1. The exchange-rate lookup is cached with `getOrSet`. When the entry expires during a sale and 200 checkout requests miss it at the same moment, how many calls reach the rates provider? And if that one call fails, what do the other 199 requests get?
2. The audit handler subscribes to `payment.*`. Does it also see `payment.refund.failed`, three levels deep? Does it see an event published as `Payment:Captured`?
3. The admin area is `GET /admin/*rest`, and a tenant page is `GET /:org/:page/:section/:id`. Which one answers `/admin/a/b/c`, and would the answer change if you registered them in the other order?

The documentation answers each in one sentence. Your team lead wants the edge cases, and the only complete answer is the code that runs. That code is not on GitHub: the repository's main branch may already be ahead of what you installed. The code that runs is in your project's `node_modules/@zudojs` folder, and this lesson teaches you to read it.

In [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source) you learned the method: map a package from its `package.json`, tell public API from internals, find definitions, and confirm every reading with an experiment. You followed one request through `@zudojs/http` and one resolution through `@zudojs/container`. This lesson goes wider and deeper. It treats ZudoJS as a *system* of about forty packages: which copy of a package actually runs, the whole dependency graph, how errors and context cross package boundaries, and four more mechanisms traced line by line, including the three questions above. Along the way you build three tools: a dependency graph, an export finder and a set of characterization tests.

> NOTE
>
> All examples read files from `node_modules`, so they run in Node.js only. They were run in a project with every `@zudojs` package installed. In your own project you see the packages you installed plus their dependencies, and the numbers may differ after a new release.

## Before you open a file

REASON IT OUT

### What must be true before you trust what you read?

You are about to read `dist` code to answer the three release questions. Before reading anything, think about these: which version of the package is on your disk, and is it the one your app loads? Could the same package be installed twice? If you find a function that does what you want, how do you know the framework itself calls it? If you find a useful function that is exported, can you depend on it next month? And once you believe you understand a behaviour, what proves it?

**Show the reasoning**

- **Version:** read `version` in the package's own `package.json` in `node_modules`, not the range in yours. `"^1.2.0"` in your manifest can mean 1.2.0 or 1.9.3 on disk.
- **Duplicates:** yes. When two packages need different exact versions of a third, npm installs both, nested in different folders. Each copy has its own classes and its own module-level state. You will see what that breaks in the section on errors.
- **Reachability:** an exported function is not necessarily used. You must follow the calls from the entry point you use (for example `createRouter`) down to the code, instead of searching for a promising name. This lesson finds an exported route tree that the router never calls.
- **Stability:** "exported" and "public" are not the same. Some exports are internals that happen to be reachable. The section on public API gives you the signals.
- **Proof:** reading gives you a hypothesis. A small script that runs the real package turns it into a fact, and a characterization test keeps it a fact after the next upgrade.

## Which code runs?

A published `@zudojs` package is `package.json`, a README, a LICENSE and `dist`: readable `tsc` output with its comments, and a `.d.ts` file next to every `.js` file. There is no `src` and no source map, although every file ends with a `sourceMappingURL` comment, so a debugger steps through `dist`. [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source) showed all of this for `@zudojs/http`.

Before you read any of it, answer the first question from the reasoning above: is there exactly one copy of each package? npm puts a second copy in a nested `node_modules` folder when two packages need versions that cannot share one install. A short walk over the tree finds them:

copies.tsNode.js only

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every installed copy of every @zudojs package, including nested ones. */
function findCopies(dir: string, found = new Map<string, string[]>()): Map<string, string[]> {
  const scope = join(dir, "@zudojs");
  if (existsSync(scope)) {
    for (const name of readdirSync(scope)) {
      const pkg = JSON.parse(readFileSync(join(scope, name, "package.json"), "utf8"));
      found.set(pkg.name, [...(found.get(pkg.name) ?? []), join(scope, name)]);
    }
  }
  for (const entry of readdirSync(dir)) {
    const folders = entry.startsWith("@") ? readdirSync(join(dir, entry)).map((n) => join(dir, entry, n)) : [join(dir, entry)];
    for (const folder of folders) {
      if (existsSync(join(folder, "node_modules"))) findCopies(join(folder, "node_modules"), found);
    }
  }
  return found;
}

const copies = findCopies("node_modules");
const duplicated = [...copies].filter(([, paths]) => paths.length > 1);
console.log(`${copies.size} @zudojs packages installed`);
console.log("installed more than once:", duplicated.length === 0 ? "none" : duplicated);
console.log("@zudojs/errors is read from:", copies.get("@zudojs/errors"));
```

Output of `npx tsx copies.ts`

```ts
38 @zudojs packages installed
installed more than once: none
@zudojs/errors is read from: [ 'node_modules/@zudojs/errors' ]
```

One copy each, so every file you open below is the file that runs. If the list were not empty, you would have to find out which copy each importer loads before believing anything you read. Later sections show what goes wrong for errors and context when there are two; `npm ls @zudojs/errors` gives the same answer with the reasons.

## Package boundaries and the dependency graph

ZudoJS is about forty packages. Before reading any one of them you want the map: which package uses which. Every `package.json` lists its dependencies, so you can compute the graph instead of trusting a diagram. The **level** of a package is 0 if it depends on no other `@zudojs` package, and otherwise one more than the highest level among its dependencies. Packages on the same level do not depend on each other:

tools/graph.ts

```ts
import { readdirSync, readFileSync } from "node:fs";

interface Manifest {
  readonly name: string;
  readonly dependencies?: Record<string, string>;
}

/** Package short name -> internal dependencies, with their version specs. */
export function readGraph(folder = "node_modules/@zudojs"): Map<string, Record<string, string>> {
  const graph = new Map<string, Record<string, string>>();
  for (const dir of readdirSync(folder).sort()) {
    const pkg = JSON.parse(readFileSync(`${folder}/${dir}/package.json`, "utf8")) as Manifest;
    const internal = Object.entries(pkg.dependencies ?? {}).filter(([name]) => name.startsWith("@zudojs/"));
    graph.set(pkg.name.slice("@zudojs/".length), Object.fromEntries(internal.map(([n, v]) => [n.slice(8), v])));
  }
  return graph;
}

/** Level 0: no internal dependencies. Otherwise 1 + the highest level of a dependency. */
export function levels(graph: Map<string, Record<string, string>>): Map<string, number> {
  const level = new Map<string, number>();
  const visit = (name: string): number => {
    if (!level.has(name)) level.set(name, Math.max(-1, ...Object.keys(graph.get(name) ?? {}).map(visit)) + 1);
    return level.get(name)!;
  };
  for (const name of graph.keys()) visit(name);
  return level;
}

/** Packages that depend on `target`, directly or through others. */
export function dependents(graph: Map<string, Record<string, string>>, target: string): string[] {
  const found = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, deps] of graph) {
      if (found.has(name)) continue;
      if (Object.keys(deps).some((d) => d === target || found.has(d))) {
        found.add(name);
        changed = true;
      }
    }
  }
  return [...found].sort();
}
```

graph-report.tsNode.js only

```ts
import { dependents, levels, readGraph } from "./tools/graph.js";

const graph = readGraph();
const level = levels(graph);
for (let l = 0; l <= Math.max(...level.values()); l++) {
  console.log(`level ${l}: ${[...level].filter(([, v]) => v === l).map(([n]) => n).sort().join(" ")}`);
}

const specs = [...graph.values()].flatMap((deps) => Object.values(deps));
const exact = specs.filter((s) => /^\d+\.\d+\.\d+$/.test(s)).length;
console.log(`${graph.size} packages, ${specs.length} internal edges, ${exact} of them exact version pins`);
console.log("depend on errors directly:", [...graph.values()].filter((d) => "errors" in d).length);
console.log("core depends on:", Object.keys(graph.get("core")!).join(", "));
```

Output of `npx tsx graph-report.ts`

```ts
level 0: errors types
level 1: adapters constants container docs feature-flags logger middleware plugins transactions
level 2: config core crypto database events lifecycle messaging observability openapi permissions scheduler schema security tenancy validation
level 3: auth auth-oauth cqrs http runtime serialization
level 4: cache queue rpc storage
level 5: api testing
38 packages, 112 internal edges, 112 of them exact version pins
depend on errors directly: 36
core depends on: errors, constants
```

```ts
 level 5   api  testing                      (use almost everything)
 level 4   cache  queue  rpc  storage
 level 3   auth  cqrs  http  runtime  serialization ...
 level 2   config  core  events  lifecycle  schema  security ...
 level 1   constants  container  logger  middleware  plugins ...
 level 0   errors  types                     (depend on nothing)

 Every arrow points down. errors is imported by all but two packages.
```

The published @zudojs packages by level, computed from their package.json files.

Three things stand out, and each changes how you read the code:

- **Everything rests on `errors`.** When a package throws, the class almost always comes from `@zudojs/errors`. Reading that one package explains the error behaviour of all the others.
- **The manifest can disagree with the diagram in your head.** The repository's conventions file draws `core` at the top, depending on everything. The published `core` depends only on `errors` and `constants`: it is `runtime` that wires `core`, `container`, `events` and `logger` together. When they disagree, the manifest is what runs.
- **Every internal dependency is an exact pin.** In the repository they are `workspace:*` (see [TypeScript monorepos](https://zudojs.oyinlola.site/learn/ts-monorepos#zudojs)); pnpm rewrites them to the exact version at publish time. So `@zudojs/container` asks for exactly one version of `@zudojs/errors`. If your own `package.json` asks for a different one, npm installs both. Keep all `@zudojs` packages from the same release, and check with `npm ls @zudojs/errors`: more than one version in that tree means duplicates.

## Public API and internal code

[Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source#public) sorted names into three categories: documented public API, exported but incidental, and internal. Across the whole framework, three layers decide which category a name falls into, from the strictest to the loosest.

### 1. The exports map: what Node lets you import

Only paths listed in `exports` can be imported; Node refuses any other with `ERR_PACKAGE_PATH_NOT_EXPORTED`, even though the file is on disk. Most `@zudojs` packages list one entry, `"."`. `@zudojs/core` lists nine (`@zudojs/core/context`, `@zudojs/core/errors` and so on), so you can import only the part you need, and `@zudojs/runtime` adds `@zudojs/runtime/testing`. Getting around the map with a relative path into `node_modules` ties your code to a file layout that any patch release may change.

> MOST @zudojs PACKAGES DO NOT EXPORT ./package.json
>
> Tools that locate a package with `require.resolve("@zudojs/x/package.json")` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` for most `@zudojs` packages (only a few, such as `openapi`, `permissions` and `observability`, list it). Read the file by its path in `node_modules`, as the examples here do.

### 2. The barrel: what the entry point re-exports

The entry file, `dist/index.js`, is a **barrel**: a file that only re-exports names from other files. How a barrel is written decides how big the public surface is. `export * from "./x.js"` re-exports everything `x.js` exports, including helpers nobody meant to publish; `export { A, B } from "./x.js"` publishes exactly the names listed:

surface.tsNode.js only

```ts
import { readFileSync } from "node:fs";

for (const name of ["adapters", "plugins", "container", "events", "errors", "http"]) {
  const mod = await import(`@zudojs/${name}`);
  const index = readFileSync(`node_modules/@zudojs/${name}/dist/index.js`, "utf8");
  const star = index.match(/^export \* from/gm)?.length ?? 0;
  const named = index.match(/^export \{/gm)?.length ?? 0;
  console.log(`${name.padEnd(10)} ${String(Object.keys(mod).length).padStart(5)} names   index.js: ${star} "export *", ${named} "export { … }"`);
}
```

Output of `npx tsx surface.ts`

```ts
adapters      20 names   index.js: 0 "export *", 4 "export { … }"
plugins       36 names   index.js: 0 "export *", 12 "export { … }"
container     84 names   index.js: 9 "export *", 1 "export { … }"
events       142 names   index.js: 8 "export *", 0 "export { … }"
errors       548 names   index.js: 5 "export *", 0 "export { … }"
http        1379 names   index.js: 44 "export *", 20 "export { … }"
```

`@zudojs/adapters` and `@zudojs/plugins` list their public names one by one: small, deliberate surfaces. `@zudojs/http` re-exports whole folders and ends up with well over a thousand names, including the internal machinery of its router. Those names are reachable, but nobody promised to keep them.

### 3. The signals that say "internal"

| Signal | Example in the published packages | Treat it as |
| --- | --- | --- |
| Not in the `exports` map | `withRetry` in `@zudojs/adapters` | Private. You cannot import it anyway. |
| `@internal` in the JSDoc | `resolveInScope` on the container | Private, even though TypeScript lets you call it. |
| A folder or class named "internal", or a low-level engine class | `lifecycleInternal/` (re-exported as `topologicalSort`, `withTimeout`), `ContainerResolver` | Private unless the README documents it. |
| Documented in the README and the site's package page | `createRouter`, `createContainer`, `getOrSet` | Public: covered by semantic versioning. |

The rule for your code: depend on names that are exported *and* documented. Read everything else freely, to understand how the public names behave, but don't import it.

## Finding the file behind a name

You know a name, say `matchesEventType`, and want its code. The text search from [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source) finds every file that *mentions* it, which is the right tool for "who uses this?". For "where is this defined, and through which barrels does it reach me?" you want the path Node itself follows: from `dist/index.js` through the re-exports to the file that *defines* the name. That is a small recursive walk:

tools/find-export.ts

```ts
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Follows the barrel files from a package's entry point to the file that
 * defines `name`. Returns the chain of files, or undefined when the name is
 * not exported.
 */
export function findExport(pkg: string, name: string, file?: string, seen = new Set<string>()): string[] | undefined {
  const root = join("node_modules", pkg);
  const current = file ?? join(root, "dist/index.js");
  if (seen.has(current)) return undefined;
  seen.add(current);
  const code = readFileSync(current, "utf8");
  const here = relative(root, current);

  const defines = new RegExp(`^export (?:async )?(?:function\\*?|class|const|let) ${name}\\b`, "m");
  if (defines.test(code)) return [here];

  for (const [, list, from] of code.matchAll(/^export \{([^}]*)\} from "([^"]+)"/gm)) {
    const names = list!.split(",").map((s) => s.trim().split(/\s+as\s+/).pop());
    if (!names.includes(name)) continue;
    if (!from!.startsWith(".")) return [here, `(re-exported from ${from})`];
    const next = findExport(pkg, name, join(dirname(current), from!), seen);
    if (next) return [here, ...next];
  }
  for (const [, from] of code.matchAll(/^export \* from "(\.[^"]+)"/gm)) {
    const next = findExport(pkg, name, join(dirname(current), from!), seen);
    if (next) return [here, ...next];
  }
  return undefined;
}
```

where.tsNode.js only

```ts
import { findExport } from "./tools/find-export.js";

const questions: [string, string][] = [
  ["@zudojs/events", "matchesEventType"],
  ["@zudojs/http", "matchCompiledRoute"],
  ["@zudojs/container", "CircularDependencyError"],
  ["@zudojs/container", "ScopedResolutionError"],
  ["@zudojs/adapters", "withRetry"],
];
for (const [pkg, name] of questions) {
  const chain = findExport(pkg, name);
  console.log(`${pkg} ${name}\n  ${chain ? chain.join("\n  -> ") : "not exported"}`);
}
```

Output of `npx tsx where.ts`

```ts
@zudojs/events matchesEventType
  dist/index.js
  -> dist/eventTypes/index.js
  -> dist/eventTypes/eventType.type.js
@zudojs/http matchCompiledRoute
  dist/index.js
  -> dist/httpRouter/index.js
  -> dist/httpRouter/matching/index.js
  -> dist/httpRouter/matching/httpRoute.matcher.core.js
@zudojs/container CircularDependencyError
  dist/index.js
  -> (re-exported from @zudojs/errors)
@zudojs/container ScopedResolutionError
  dist/index.js
  -> dist/containerResolution/index.js
  -> dist/containerResolution/containerResolution.error.js
@zudojs/adapters withRetry
  not exported
```

Every answer is a place to start reading. The third says `@zudojs/container` does not define `CircularDependencyError` at all: it passes on the class from `@zudojs/errors`. The fourth says the container *does* define `ScopedResolutionError` itself. Both facts matter in the next section. The regular expressions only understand the shapes `tsc` emits, which is all you need for these packages; a general tool would parse the JavaScript properly.

## Error architecture

Every `@zudojs` error class lives in `@zudojs/errors`. A package that throws one imports it from there, and usually re-exports it, so that you can write `instanceof` checks with one import. The end of the container's `dist/index.js`:

@zudojs/container/dist/index.js

```ts
// Error classes the container throws but that live in @zudojs/errors,
// re-exported so `instanceof` checks need only this package.
export { CircularDependencyError, DuplicateRegistrationError, RegistrationNotFoundError, ProviderResolutionError, } from "@zudojs/errors";
```

When a package needs an error that `@zudojs/errors` does not have yet, it may define a small class locally, but it must extend a base from `@zudojs/errors`. The file's own comment says so:

@zudojs/container/dist/containerResolution/containerResolution.error.js

```ts
/**
 * @zudojs/container/containerResolution/containerResolution.error
 *
 * Resolution error classes local to this package. They extend the published
 * `ContainerError` base from @zudojs/errors; the published package does not
 * yet ship dedicated classes for these failure modes.
 */
import { ContainerError, ProviderResolutionError } from "@zudojs/errors";
```

So every error is a `BaseError` with a `code`, `category`, `statusCode` and `expose` flag, whichever package threw it. That is what lets one error handler in `@zudojs/http` answer every failure correctly, as you saw in [the error system lesson](https://zudojs.oyinlola.site/learn/zudo-errors).

### When there are two copies of @zudojs/errors

Remember the exact pins. If two versions of `@zudojs/errors` end up installed, there are two `BaseError` classes, and an error made by one copy is not an `instanceof` the other. The package anticipates this. The constructor stamps every error with a symbol from the *global* symbol registry, which all copies share:

@zudojs/errors/dist/base/core/baseError.core.js

```ts
export const BASE_ERROR_BRAND = Symbol.for("@zudojs/errors.BaseError");
// …
        Object.defineProperty(this, BASE_ERROR_BRAND, {
            value: true,
            enumerable: false,
            writable: false,
            configurable: false,
        });
```

And `isBaseError` falls back to that brand when `instanceof` fails:

@zudojs/errors/dist/base/utils/baseError.utils.js

```ts
export function isBaseError(value) {
    if (value instanceof BaseError)
        return true;
    if (value === null || typeof value !== "object")
        return false;
    if (!(value instanceof Error))
        return false;
    const candidate = value;
    return (candidate[BASE_ERROR_BRAND] === true &&
        typeof candidate.code === "string" &&
        // … the same check for category, severity, statusCode, expose,
        // isOperational, metadata and toJSON
```

Don't take the comment's word for it. Make a second copy of the package and throw an error from it:

duplicate-errors.tsNode.js only

```ts
import { cpSync, rmSync } from "node:fs";
import { BaseError, NotFoundError, isBaseError } from "@zudojs/errors";

// A second copy, as npm would install it for a package pinned to another version.
cpSync("node_modules/@zudojs/errors", "copies/errors", { recursive: true });
const copyPath = "./copies/errors/dist/index.js";
const copy = (await import(copyPath)) as typeof import("@zudojs/errors");

const error = new copy.NotFoundError("Order 1042 not found");
console.log("same class:", copy.BaseError === BaseError);
console.log("instanceof NotFoundError:", error instanceof NotFoundError);
console.log("instanceof BaseError:", error instanceof BaseError);
console.log("isBaseError:", isBaseError(error), error.code, error.statusCode);

rmSync("copies", { recursive: true });
```

Output of `npx tsx duplicate-errors.ts`

```ts
same class: false
instanceof NotFoundError: false
instanceof BaseError: false
isBaseError: true ERR_RESOURCE_NOT_FOUND 404
```

`instanceof` fails for both classes; `isBaseError` and the `code` still work. Two lessons follow. In your own code, recognise framework errors with `isBaseError` and compare `error.code`, not `instanceof`, wherever an error may come from another package. And check whether the framework follows its own advice. A quick scan of the `dist` folders:

who-checks.tsNode.js only

```ts
import { readdirSync, readFileSync } from "node:fs";

const byInstanceof: string[] = [];
const byBrand: string[] = [];
for (const pkg of readdirSync("node_modules/@zudojs")) {
  if (pkg === "errors") continue;
  const dist = `node_modules/@zudojs/${pkg}/dist`;
  for (const file of readdirSync(dist, { recursive: true }).map(String)) {
    if (!file.endsWith(".js")) continue;
    const code = readFileSync(`${dist}/${file}`, "utf8");
    if (code.includes("instanceof BaseError")) byInstanceof.push(`${pkg}/${file}`);
    if (code.includes("isBaseError(")) byBrand.push(`${pkg}/${file}`);
  }
}
console.log("instanceof BaseError:", byInstanceof);
console.log("isBaseError():", byBrand);
```

Output of `npx tsx who-checks.ts`

```ts
instanceof BaseError: [
  'cqrs/cqrsErrors/cqrsError.base.js',
  'cqrs/cqrsMiddleware/cqrsMiddleware.core.js'
]
isBaseError(): [
  'database/databaseClient/databaseClient.errors.js',
  'rpc/rpc/server/rpcBaseErrorMapping.helper.js'
]
```

`rpc` and `database` use the safe check; `cqrs` uses `instanceof`. With two copies of `@zudojs/errors` installed, the CQRS middleware would not recognise a `NotFoundError` from the other copy and would wrap it in a generic `CqrsError`, losing its code and status. It is a small bug with a clear reproduction: exactly the kind of finding you report upstream rather than work around.

## Context propagation

Four packages carry information through asynchronous code without passing it as an argument: `core` (the execution context), `tenancy` (the current tenant), `transactions` (the current transaction) and `observability` (the current trace). All four use Node's `AsyncLocalStorage`, and the tenant one is short enough to quote whole:

@zudojs/tenancy/dist/context/contextStorage.core.js

```ts
export function createTenantContextStorage() {
    const storage = new AsyncLocalStorage();
    return {
        get() {
            return storage.getStore();
        },
        run(context, callback) {
            return storage.run(context, callback);
        },
    };
}
/** Default storage instance. */
let defaultStorage;
/**
 * Get or create the default tenant context storage.
 */
export function getDefaultStorage() {
    if (!defaultStorage) {
        defaultStorage = createTenantContextStorage();
    }
    return defaultStorage;
}
```

Two design facts follow from these twenty lines. First, each package owns a *separate* `AsyncLocalStorage`: there is no single ZudoJS context. Second, the default storage is a module-level variable, so it exists once per *copy* of the package, which is the same duplicate-package problem as with errors. Here are three stores side by side:

three-stores.jsNode.js only

```ts
import { createContextStorage, createExecutionContext } from "@zudojs/core";
import { createTenantContextStorage } from "@zudojs/tenancy";
import { createTransactionContext } from "@zudojs/transactions";

const requests = createContextStorage();
const tenants = createTenantContextStorage();
const transactions = createTransactionContext();

function where(label) {
  const request = requests.get()?.correlationId ?? "-";
  const tenant = tenants.get()?.tenantId ?? "-";
  const transaction = transactions.get()?.id ?? "-";
  console.log(label.padEnd(17), "request", request.padEnd(6), "tenant", tenant.padEnd(5), "transaction", transaction);
}

await requests.run(createExecutionContext({ correlationId: "req-7" }), () =>
  tenants.run({ tenantId: "acme" }, async () => {
    where("in the request");
    await new Promise((resolve) => setTimeout(resolve, 5));
    where("after a timer");
    await transactions.run({ id: "tx-1" }, async () => where("in a transaction"));
    requests.runWithoutContext(() => where("core context off"));
  }),
);
where("outside");
```

Output of `node three-stores.js`

```ts
in the request    request req-7  tenant acme  transaction -
after a timer     request req-7  tenant acme  transaction -
in a transaction  request req-7  tenant acme  transaction tx-1
core context off  request -      tenant acme  transaction -
outside           request -      tenant -     transaction -
```

All three values survive the timer, because `AsyncLocalStorage` follows the asynchronous work that a `run` callback starts. But `runWithoutContext` from `core` only switches off `core`'s store: the tenant is still `acme`. If you start background work that must not belong to the current tenant, you have to leave each store yourself. (The objects passed to `run` here are cut down to the one field printed; the real types ask for more. The example is JavaScript to keep that out of the way.)

> TWO FUNCTIONS CALLED createTransactionContext
>
> Both `@zudojs/transactions` and `@zudojs/database` export `createTransactionContext`. The first creates the `AsyncLocalStorage`-backed store used above; the second returns a plain frozen record with a transaction id and a start time. An auto-import in your editor can pick the wrong one. Check the import line.

## Trace 1: how an event wildcard matches

Back to question 2. `findExport` sent you to `dist/eventTypes/eventType.type.js`. The matcher is short:

@zudojs/events/dist/eventTypes/eventType.type.js

```ts
export function matchesEventType(type, pattern) {
    if (pattern === "*") {
        return true;
    }
    if (pattern === type) {
        return true;
    }
    if (pattern.endsWith(".*")) {
        const namespace = pattern.slice(0, -2);
        return type === namespace || type.startsWith(`${namespace}.`);
    }
    return false;
}
```

Read it as a list of predictions. `payment.*` matches `payment.refund.failed` (any depth, because it is a prefix test), matches the bare `payment` (the `type === namespace` branch) and does not match `payments.created` (the prefix includes the dot). The same file has `normalizeEventType`, which lower-cases a type and turns `/`, `\` and `:` into dots before any matching happens, so `Payment:Captured` becomes `payment.captured`. Now test every prediction against the real bus:

trace-events.tsNode.js only

```ts
import { createEventBus, matchesEventType, normalizeEventType } from "@zudojs/events";

for (const type of ["payment.refund.failed", "payment", "payments.created"]) {
  console.log(`${type.padEnd(22)} matches payment.* ->`, matchesEventType(type, "payment.*"));
}
console.log("Payment:Captured normalizes to", normalizeEventType("Payment:Captured"));

const bus = createEventBus();
bus.on("payment.*", (event) => console.log("audit saw", event.type));
const result = await bus.publishEvent({ type: "Payment:Captured", payload: { amount: 250_000 } });
console.log("handlers run:", result.handlerCount);

try {
  bus.on("payment.*.failed", () => {});
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx trace-events.ts`

```ts
payment.refund.failed  matches payment.* -> true
payment                matches payment.* -> true
payments.created       matches payment.* -> false
Payment:Captured normalizes to payment.captured
audit saw payment.captured
handlers run: 1
Invalid event type pattern "payment.*.failed".
```

Every prediction holds, and the last line shows a limit the matcher implies: a wildcard is only allowed at the end, so "every `failed` event under payment" cannot be expressed as a pattern. Subscribe to `payment.*` and check the last segment in the handler. One more thing you learn from the dispatch code around it: each publish filters *all* registered handlers and sorts the matches by priority. That is cheap for dozens of handlers; it is not an index for tens of thousands.

## Trace 2: how a route is chosen

Question 3. You traced `match` in [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source#request): it calls `sortedRoutes()`, which copies and sorts the whole route table on every call, comparing patterns segment by segment from the left (literal 3, parameter 2, wildcard 1) and falling back to registration order only on a complete tie. The comment on `compareSegmentSpecificity` records that the rule used to be a sum, which let `/:p/:q/:r/:s` outrank `/admin/*rest` and bypass every guard on the admin route. Your question 3 is that exact bug. With the rule in mind, predict the three answers below before running them:

trace-routing.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/:org/:page/:section/:id", () => "tenant page");
router.get("/admin/*rest", () => "admin");
router.get("/payments/:reference", () => "by reference");
router.get("/payments/:id(\\d+)", () => "by id");

for (const path of ["/admin/a/b/c", "/acme/reports/2026/7", "/payments/42"]) {
  const match = router.match("GET", path);
  console.log(path.padEnd(22), "->", match.route?.path, JSON.stringify(match.params));
}
```

Output of `npx tsx trace-routing.ts`

```ts
/admin/a/b/c           -> /admin/*rest {"rest":"a/b/c"}
/acme/reports/2026/7   -> /:org/:page/:section/:id {"org":"acme","page":"reports","section":"2026","id":"7"}
/payments/42           -> /payments/:reference {"reference":"42"}
```

The admin route wins although it was registered second and has fewer segments, and registering it first would change nothing: order only breaks ties. `/payments/42` goes to `:reference`: the constrained `:id(\d+)` route tied, lost on registration order, and can never run. The [routing lesson](https://zudojs.oyinlola.site/learn/zudo-routing#matching) shows how to catch such dead routes in a test.

### An exported matcher that disagrees with the router

[Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source)'s search found that `RouteTree`, exported from the barrel as `createRouteTree`, is mentioned only inside its own folder: the router never uses it. Unused is one thing. Is it at least correct? Someone who finds it in the export list will assume it matches like the router:

route-tree.tsNode.js only

```ts
import { createRouteTree } from "@zudojs/http";

const tree = createRouteTree();
tree.insert("/:org/:page/:section/:id", "tenant page", ["GET"]);
tree.insert("/admin/*rest", "admin", ["GET"]);
tree.insert("/payments/:reference", "payment", ["GET"]);

for (const path of ["/admin/a/b/c", "/payments/PSK-42", "/PAYMENTS/PSK-42"]) {
  const found = tree.lookup(path, "GET");
  console.log(path, "->", found ? `${String(found.handler)} ${JSON.stringify(found.params)}` : "no match");
}
```

Output of `npx tsx route-tree.ts`

```ts
/admin/a/b/c -> tenant page {"id":"c"}
/payments/PSK-42 -> payment {"reference":"PSK-42"}
/PAYMENTS/PSK-42 -> no match
```

It does not. The tree sends `/admin/a/b/c` to the tenant page, reports only one of its four parameters, and treats paths as case-sensitive, while the router matches `/PAYMENTS/PSK-42` by default. Nothing breaks in your app, because the router does not call it, but anyone who finds `createRouteTree` in the export list and builds on it gets the old admin bypass back. This is why you trace from the entry point you actually use: a promising exported name proves nothing.

## Trace 3: how the container resolves a scoped dependency

In [Reading framework source](https://zudojs.oyinlola.site/learn/framework-read-source#container) you followed `resolveInternal` and saw how it refuses a **captive dependency**: while it builds a singleton it remembers that fact (`singletonAncestor`), and a scoped dependency underneath is refused, because the singleton would keep one request's object forever. That lesson left one part of the scope story out: what happens with *nested* scopes, such as a scope for a request and a child scope for one step of it. The scope cache is a small class in the same file:

@zudojs/container/dist/containerResolution/containerResolution.core.js

```ts
class ChainedResolutionCache {
    #own = new Map();
    #parent;
    constructor(parent) {
        this.#parent = parent;
    }
    has(token) {
        return this.#own.has(token) || (this.#parent?.has(token) ?? false);
    }
    get(token) {
        if (this.#own.has(token))
            return this.#own.get(token);
        return this.#parent?.get(token);
    }
    set(token, value) {
        this.#own.set(token, value);
    }
```

Reads fall back to the parent scope; writes stay local. So a child scope sees the cart its parent already built, but a cart the child builds first stays private to the child, and the parent later builds its own. That last prediction is not written anywhere in the documentation. Test both predictions with a checkout cart, together with the two refusals: a scoped token resolved on the root container, and a singleton that needs the cart:

trace-container.tsNode.js only

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

interface Cart { readonly id: number }
const CART = createToken<Cart>("Cart");
const RECEIPTS = createToken<{ cart: Cart }>("Receipts");

let built = 0;
const container = createContainer();
container.registerFactory(CART, () => ({ id: ++built }), [], { scope: ContainerScope.SCOPED });
container.registerFactory(RECEIPTS, (cart) => ({ cart }), [CART], { scope: ContainerScope.SINGLETON });

const request = container.createScope();
const child = request.createScope();
console.log("parent first:", request.resolve(CART).id, "child sees", child.resolve(CART).id);

const request2 = container.createScope();
const child2 = request2.createScope();
console.log("child first: ", child2.resolve(CART).id, "parent builds", request2.resolve(CART).id);

for (const attempt of [() => container.resolve(CART), () => request.resolve(RECEIPTS)]) {
  try {
    attempt();
  } catch (error) {
    console.log((error as Error).name);
  }
}
```

Output of `npx tsx trace-container.ts`

```ts
parent first: 1 child sees 1
child first:  2 parent builds 3
ScopedResolutionError
CaptiveDependencyError
```

All four predictions hold. Notice where the two error names came from: `findExport` showed that `ScopedResolutionError` and `CaptiveDependencyError` are local classes of `@zudojs/container` (extending `ContainerError`), so import them from `@zudojs/container`, not from `@zudojs/errors`.

## Trace 4: how the cache avoids a stampede

Question 1. The [caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache#get-or-set) showed that five concurrent misses cause one load. Here is how:

@zudojs/cache/dist/cache.js

```ts
async getOrSet(key, fn, options) {
    if (!this.enabled)
        return { value: await fn(), cached: false };
    const fullKey = this.buildKey(key, options);
    if (!options?.forceRefresh) {
        const cached = await this.get(key, options);
        if (cached.hit)
            return { value: cached.value, cached: true };
        // Stampede protection: concurrent misses share a single fn() call.
        const pending = this.inFlight.get(fullKey);
        if (pending)
            return { value: (await pending), cached: false };
    }
    const promise = (async () => {
        const value = await fn();
        await this.set(key, value, options);
        return value;
    })();
    this.inFlight.set(fullKey, promise);
    try {
        return { value: (await promise), cached: false };
    }
    finally {
        if (this.inFlight.get(fullKey) === promise)
            this.inFlight.delete(fullKey);
    }
}
```

The mechanism is a `Map` from the full key to the *promise* of the load. The first caller creates the promise and stores it; the others find it and await the same promise. Reading closely gives you the edge cases your team lead asked about:

- **Failure is shared.** If `fn()` rejects, every waiter awaits the same rejected promise, so all 200 requests get the same error.
- **Failure is not cached.** `set` is never reached, and the `finally` removes the promise, so the next request tries again.
- **The key includes the namespace** (`buildKey`), so the same key in two namespaces loads twice.
- **It is one process.** `inFlight` is a field of this `CacheService` object. Three servers still make three calls.

trace-cache.tsNode.js only

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
let providerCalls = 0;
async function fetchNgnRate(): Promise<number> {
  providerCalls++;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (providerCalls === 1) throw new Error("rates provider timed out");
  return 1_540;
}
const checkout = () => cache.getOrSet("usd-ngn", fetchNgnRate, { namespace: "rates", ttl: 60_000 });

const first = await Promise.allSettled(Array.from({ length: 200 }, checkout));
const rejected = first.filter((r) => r.status === "rejected");
console.log(`wave 1: ${rejected.length} rejected, provider calls: ${providerCalls}`);

const second = await Promise.all(Array.from({ length: 200 }, checkout));
console.log(`wave 2: rate ${second[0]!.value}, provider calls: ${providerCalls}`);

const third = await checkout();
console.log(`wave 3: cached ${third.cached}, provider calls: ${providerCalls}`);
```

Output of `npx tsx trace-cache.ts`

```ts
wave 1: 200 rejected, provider calls: 1
wave 2: rate 1540, provider calls: 2
wave 3: cached true, provider calls: 2
```

200 requests, one call, one shared failure; then one retry for the next 200; then the cache. If a shared failure is not what you want (for example, you would rather serve a slightly old rate), that is a policy for your code, around `getOrSet`: the package makes no such decision for you.

## Adapters and lifecycle: two start-up philosophies

`@zudojs/adapters` is the boundary to external platforms (see [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters)). Its `AdapterRegistry` can start every registered adapter with `startAll()`. What happens when the second of three adapters fails? The loop behind it:

@zudojs/adapters/dist/adapter/adapter.registry.js

```ts
async forEachAdapter(operation, message) {
    const failures = [];
    for (const adapter of [...this.adapters.values()]) {
        try {
            await operation(adapter);
        }
        catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, message);
    }
}
```

It carries on with the others and throws an `AggregateError` at the end. It does *not* stop the adapters that did start:

adapters-start.tsNode.js only

```ts
import { AdapterRegistry } from "@zudojs/adapters";
import type { Adapter } from "@zudojs/adapters";

function adapter(name: string, fails = false): Adapter {
  return {
    name,
    capabilities: { http: true, gracefulShutdown: true },
    start: () => {
      if (fails) throw new Error(`${name}: port 8080 is in use`);
      console.log("started", name);
    },
    stop: () => console.log("stopped", name),
  };
}

const registry = new AdapterRegistry();
registry.register(adapter("paystack-webhooks"));
registry.register(adapter("http-server", true));
registry.register(adapter("metrics"));
try {
  await registry.startAll();
} catch (error) {
  const all = error as AggregateError;
  console.log(all.message, all.errors.map((e: Error) => e.message));
}
```

Output of `npx tsx adapters-start.ts`

```ts
started paystack-webhooks
started metrics
One or more adapters failed to start. [ 'http-server: port 8080 is in use' ]
```

Two adapters are running and nobody will stop them unless you call `registry.stopAll()` in that `catch`. Compare this with `PluginManager` in [the plugins lesson](https://zudojs.oyinlola.site/learn/zudo-plugins#rollback) and `createLifecycleManager` in [the lifecycle lesson](https://zudojs.oyinlola.site/learn/zudo-lifecycle#rollback): both roll back what they started. Neither choice is wrong, but you must know which one you are calling, and only the code tells you.

The lifecycle package has one more lesson in package boundaries. Its state machine class holds the *behaviour*, but the table of allowed transitions is *data* in `@zudojs/constants`, so any package can check a state change without depending on the lifecycle engine:

transitions.tsNode.js only

```ts
import { LIFECYCLE_VALID_TRANSITIONS } from "@zudojs/constants";

for (const [from, to] of Object.entries(LIFECYCLE_VALID_TRANSITIONS)) {
  console.log(from.padEnd(13), "->", to.length ? to.join(", ") : "(final)");
}
```

Output of `npx tsx transitions.ts`

```ts
idle          -> initializing, disposed
initializing  -> initialized, failed
initialized   -> starting, stopping, disposed
starting      -> started, failed
started       -> ready, stopping, failed
ready         -> stopping, failed
stopping      -> stopped, failed
stopped       -> disposed
failed        -> stopping, disposed
disposed      -> (final)
```

Read the table for its consequences: `stopped` can only go to `disposed`, so a stopped component is never restarted, and `failed` still goes through `stopping`, which is where rollback happens.

## Pinning what you learned: characterization tests

Everything above is true for the versions installed today. A **characterization test** records how existing code behaves, right or wrong, so that you notice when an upgrade changes it. It does not say the behaviour is correct; it says "this is what we rely on". Put one in your project for every internal behaviour your code depends on:

characterization.tsNode.js only

```ts
import assert from "node:assert/strict";
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { matchesEventType } from "@zudojs/events";
import { createRouter } from "@zudojs/http";

const checks: [string, () => Promise<void> | void][] = [
  ["payment.* matches nested and bare types", () => {
    assert.equal(matchesEventType("payment.refund.failed", "payment.*"), true);
    assert.equal(matchesEventType("payment", "payment.*"), true);
  }],
  ["a literal-anchored wildcard beats a longer parameter route", () => {
    const router = createRouter();
    router.get("/:org/:page/:section/:id", () => "tenant");
    router.get("/admin/*rest", () => "admin");
    assert.equal(router.match("GET", "/admin/a/b/c").route?.path, "/admin/*rest");
  }],
  ["concurrent getOrSet misses share one load", async () => {
    const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
    let loads = 0;
    const load = async () => { loads++; return 1_540; };
    await Promise.all([1, 2, 3].map(() => cache.getOrSet("usd-ngn", load)));
    assert.equal(loads, 1);
  }],
];

for (const [name, check] of checks) {
  try {
    await check();
    console.log("PASS", name);
  } catch (error) {
    console.log("FAIL", name, "-", (error as Error).message);
  }
}
```

Output of `npx tsx characterization.ts`

```ts
PASS payment.* matches nested and bare types
PASS a literal-anchored wildcard beats a longer parameter route
PASS concurrent getOrSet misses share one load
```

In a real project these go in your Vitest suite (see [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing)), in a file named for what it is, such as `zudojs-behaviour.test.ts`. When Renovate or Dependabot opens an upgrade pull request and one of them fails, you know exactly which assumption broke, before your users do.

### In production

- **Upgrade all `@zudojs` packages together**, from one release, and commit the lockfile. The exact internal pins make a mixed set install duplicates.
- **Check for duplicates in CI** with `npm ls @zudojs/errors` (and the other level-0 and level-1 packages). One version per package is the healthy result.
- **Never deep-import** into `dist`, even through a relative path. If you need an internal function, copy the idea into your code or ask for it to be made public.
- **Read the changelog and the diff of `dist`** for the packages on your critical path. `npm diff --diff=@zudojs/http@1.4.3 --diff=@zudojs/http@1.4.4` shows exactly what changed in the published files.
- **Report bugs with a reproduction**: the versions from `npm ls`, a script of ten to twenty lines like the ones in this lesson, what it prints, and what you expected. Keep the workaround in your code with a comment linking the issue.

## Practice

TRY IT YOURSELF

### Who is affected by a change to middleware?

A security fix lands in `@zudojs/middleware`. Use the graph tools to list every package that depends on it directly or through other packages, so you know which ones need a new release.

**Show a solution**

affected.tsNode.js only

```ts
import { dependents, readGraph } from "./tools/graph.js";

const graph = readGraph();
const direct = [...graph].filter(([, deps]) => "middleware" in deps).map(([name]) => name);
console.log("direct:", direct.join(", "));
console.log("all affected:", dependents(graph, "middleware").join(", "));
```

Output of `npx tsx affected.ts`

```ts
direct: cqrs, events, http, messaging, permissions, tenancy, testing
all affected: auth, cqrs, events, http, messaging, permissions, runtime, tenancy, testing
```

The transitive list is longer than the direct one: `auth` never imports middleware, but it depends on `permissions`, which does, and `runtime` reaches it through `events`. Build tools for monorepos compute exactly this set to decide what to rebuild and retest.

TRY IT YOURSELF

### Do two namespaces share one load?

Using the `getOrSet` code above, predict: two concurrent calls with the same key but namespaces `"ngn"` and `"ghs"`. How many loads? Then check with `findExport` where `CacheService` lives, and prove your prediction.

**Show a solution**

namespaces.tsNode.js only

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { findExport } from "./tools/find-export.js";

console.log(findExport("@zudojs/cache", "CacheService")?.join(" -> "));

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
let loads = 0;
const load = async () => { loads++; return "rate"; };
await Promise.all([
  cache.getOrSet("usd", load, { namespace: "ngn" }),
  cache.getOrSet("usd", load, { namespace: "ghs" }),
]);
console.log("loads:", loads);
```

Output of `npx tsx namespaces.ts`

```ts
dist/index.js -> dist/cache.js
loads: 2
```

Two loads. The in-flight map is keyed by `fullKey`, which `buildKey` makes from the namespace and the key, so the two calls never see each other's promise. That is what you want: they are different values.

TRY IT YOURSELF

### Write the bug report for the route tree

Write the issue you would open for `createRouteTree`: a title, the versions, a reproduction of at most fifteen lines, the actual and expected output, and why it matters.

**Show a solution**

A good report is short and runnable:

**createRouteTree disagrees with createRouter: wildcard route loses, params missing, case-sensitive**

Versions: `@zudojs/http` as shown by `npm ls @zudojs/http`, Node 24.

Reproduction: the `route-tree.ts` script from this lesson.

Actual: `/admin/a/b/c` matches `/:org/:page/:section/:id` with only `{"id":"c"}`; `/ADMIN/a/b/c` matches nothing.

Expected: the same result as `createRouter().match`: `/admin/*rest` with `{"rest":"a/b/c"}`, case-insensitive by default.

Why it matters: `createRouteTree` is exported and typed as a public API, and anyone who uses it gets the admin-bypass ordering that `compareSegmentSpecificity` fixed. Either make it match the router, or stop exporting it.

Notice what the report does not contain: a guess at the fix inside the tree's code. The maintainers know their code; your job is to make the problem impossible to misunderstand.

## Recap

- The code that runs is in `node_modules/@zudojs/*/dist`: readable `tsc` output plus `.d.ts` declarations, with no `src` and no source maps. Read that, not the repository's main branch.
- Compute the dependency graph from the manifests. `errors` and `types` are at the bottom; every internal dependency is an exact pin, so keep all packages from one release and check for duplicates.
- Public means exported *and* documented. The `exports` map is enforced by Node; barrels with `export *` make internals reachable without making them public.
- Trace from the entry point you use, not from a promising name. `createRouteTree` is exported, unused by the router and wrong.
- All errors are `BaseError`s from `@zudojs/errors`; use `isBaseError` and `code` across package boundaries. Each context package owns its own `AsyncLocalStorage`.
- Reading gives a hypothesis, a script proves it, a characterization test keeps it proven.

Next: [Creating a ZudoJS package](https://zudojs.oyinlola.site/learn/zudo-create-package), where you build `@mycompany/zudo-payments` with the same structure you just read.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
