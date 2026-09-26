---
title: "TypeScript monorepos — ZudoJS Academy"
description: "Split a shop backend into core, logger, database, auth and http packages, link with workspaces, build with project references, enforce dependency direction."
source: https://zudojs.oyinlola.site/learn/ts-monorepos
---

LEVEL 6 · LESSON 19 OF 22

Libraries and large projects Advanced

# TypeScript monorepos

Split a shop backend into core, logger, database, auth and http packages, link with workspaces, build with project references, enforce dependency direction.

- **60 min** to read and try
- **You need:** Publishing TypeScript packages, npm and packages, The npm ecosystem in depth, and Graphs (for build order)
- **You build:** A five-package shop monorepo (core, logger, database, auth, http) built with tsc -b, plus build-order, affected-package and boundary-check tools like the ones the ZudoJS repository uses

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Set up npm or pnpm workspaces so that internal packages import each other by name
- Configure composite projects, references and a solution tsconfig, and read what tsc -b decides to rebuild
- Keep shared types in one owning package and control dependency direction with tiers
- Diagnose missing references, reference cycles, cross-package relative imports and phantom dependencies
- Build small tools that compute build order, affected packages and boundary violations from package.json files

## Three copies of one type

A shop runs three codebases in three repositories: the orders API, the admin dashboard and the checkout. All three need to know what an order status is, so each has its own copy of the type. Last month the API team added refunds. Their copy became `"pending" | "paid" | "refunded"`, their compiler was happy, and they deployed. The checkout's copy was never touched:

checkout.ts

```ts
// The orders API's copy, updated last month:
type ApiOrderStatus = "pending" | "paid" | "refunded";
// The checkout repository's copy, from last year:
type CheckoutOrderStatus = "pending" | "paid";

const labels: Record<CheckoutOrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
};

const reply = '{"id": "ord_7", "status": "refunded"}';
const order = JSON.parse(reply) as { id: string; status: CheckoutOrderStatus };
const apiSide: ApiOrderStatus = "refunded";
console.log(`${order.id}: ${labels[order.status]} (API sent "${apiSide}")`);
```

Output of `npx tsx checkout.ts` and of the browser terminal

```ts
ord_7: undefined (API sent "refunded")
```

Each repository compiled cleanly against its own copy, and a customer saw "undefined" on their order page. Types only protect you where the compiler can see both sides of a contract. Put the type in one place that every part of the system imports, and adding `"refunded"` breaks every `Record<OrderStatus, string>` in the same commit, before anything ships:

labels.ts

```ts
// @shop/core, the one owner of the type:
type OrderStatus = "pending" | "paid" | "refunded";

// the checkout, which imports it:
const labels: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
};
```

What `npx tsc --noEmit` prints

```ts
labels.ts:5:7 - error TS2741: Property 'refunded' is missing in type '{ pending: string; paid: string; }' but required in type 'Record<OrderStatus, string>'.

5 const labels: Record<OrderStatus, string> = {
        ~~~~~~


Found 1 error in labels.ts:5
```

A **monorepo** is one repository that holds several packages, which import each other by name and are changed, checked and released together. It turns "keep three copies in sync" into "there is one copy". It also brings new problems: which package may depend on which, what to rebuild when one changes, and how to stop a build from working only on your laptop. This lesson builds a small monorepo for the shop, with five packages, and then looks at how the ZudoJS repository, which has forty, handles the same problems.

## The shop, split into packages

The backend is split by responsibility. Each box is a package; each arrow means "imports from":

```ts
                    @shop/http          routes: turns requests into calls
                   /    |     \
                  ▼     ▼      ▼
        @shop/auth   @shop/database     sessions / order storage
              \   \    /    /
               ▼   ▼  ▼    ▼
            @shop/core   @shop/logger   domain types and errors / log lines

  Arrows point one way: down. Nothing below may import anything above it.
```

The dependency graph of the shop monorepo: http at the top, core and logger at the bottom.

On disk:

```ts
naija-shop/
├── package.json            workspaces: ["packages/*"]
├── tsconfig.base.json      compiler settings every package shares
├── tsconfig.json           the "solution": lists every package
└── packages/
    ├── core/      package.json  tsconfig.json  src/index.ts
    ├── logger/    package.json  tsconfig.json  src/index.ts
    ├── database/  package.json  tsconfig.json  src/index.ts
    ├── auth/      package.json  tsconfig.json  src/index.ts
    └── http/      package.json  tsconfig.json  src/app.ts, src/main.ts, src/index.ts
```

The two packages at the bottom have no internal dependencies. `@shop/core` owns the domain types, so `OrderStatus` exists exactly once:

packages/core/src/index.ts

```ts
export type OrderStatus = "pending" | "paid" | "cancelled";

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly totalKobo: number;
  status: OrderStatus;
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toFixed(2)}`;
}
```

packages/logger/src/index.ts

```ts
/** Structured logging for every @shop package. */
export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  return {
    info(message, fields) {
      const suffix = fields ? ` ${JSON.stringify(fields)}` : "";
      console.log(`[${scope}] ${message}${suffix}`);
    },
  };
}
```

The middle layer imports from the bottom by **package name**, exactly as if the packages came from npm. Notice `import type` for the logger: the database only needs the `Logger` interface, and whoever creates the repository passes a real logger in.

packages/database/src/index.ts

```ts
import { DomainError, type Order } from "@shop/core";
import type { Logger } from "@shop/logger";

export interface OrderRepository {
  save(order: Order): void;
  find(id: string): Order;
}

export function createOrderRepository(logger: Logger): OrderRepository {
  const rows = new Map<string, Order>();
  return {
    save(order) {
      rows.set(order.id, { ...order });
      logger.info("order saved", { id: order.id });
    },
    find(id) {
      const row = rows.get(id);
      if (!row) throw new DomainError("ORDER_NOT_FOUND", `No order ${id}`);
      return { ...row };
    },
  };
}
```

packages/auth/src/index.ts

```ts
import { DomainError } from "@shop/core";
import type { Logger } from "@shop/logger";

export interface Session {
  readonly userId: string;
  readonly role: "customer" | "admin";
}

const sessions = new Map<string, Session>([
  ["tok_ada", { userId: "u_ada", role: "customer" }],
  ["tok_bola", { userId: "u_bola", role: "admin" }],
]);

export function authenticate(token: string | undefined, logger: Logger): Session {
  const session = token ? sessions.get(token) : undefined;
  if (!session) throw new DomainError("UNAUTHENTICATED", "Unknown or missing token");
  logger.info("authenticated", { userId: session.userId });
  return session;
}
```

And the top package wires everything together. To keep the lesson about the repository rather than about HTTP, `handle` takes a plain request object instead of a real socket; [the Node.js HTTP lesson](https://zudojs.oyinlola.site/learn/node-http) shows how to put a server in front of a function like this.

packages/http/src/app.ts

```ts
import { authenticate } from "@shop/auth";
import { DomainError, formatKobo, type Order } from "@shop/core";
import type { OrderRepository } from "@shop/database";
import type { Logger } from "@shop/logger";

export interface Request {
  method: "GET" | "POST";
  path: string;
  token?: string;
  body?: { totalKobo: number };
}

export function createApp(orders: OrderRepository, logger: Logger) {
  let nextId = 1;
  return function handle(req: Request): string {
    try {
      const session = authenticate(req.token, logger);
      if (req.method === "POST" && req.path === "/orders" && req.body) {
        const order: Order = { id: `ord_${nextId++}`, customerId: session.userId, totalKobo: req.body.totalKobo, status: "pending" };
        orders.save(order);
        return `201 ${order.id} ${formatKobo(order.totalKobo)}`;
      }
      const match = /^\/orders\/(\w+)$/.exec(req.path);
      if (req.method === "GET" && match) {
        const order = orders.find(match[1]!);
        return `200 ${order.id} ${order.status} ${formatKobo(order.totalKobo)}`;
      }
      return "404 Not Found";
    } catch (error) {
      if (error instanceof DomainError) return `${error.code === "UNAUTHENTICATED" ? 401 : 404} ${error.code}`;
      throw error;
    }
  };
}
```

packages/http/src/main.ts

```ts
import { createOrderRepository } from "@shop/database";
import { createLogger } from "@shop/logger";
import { createApp } from "./app.js";

const logger = createLogger("http");
const handle = createApp(createOrderRepository(createLogger("database")), logger);

console.log(handle({ method: "POST", path: "/orders", token: "tok_ada", body: { totalKobo: 1_250_000 } }));
console.log(handle({ method: "GET", path: "/orders/ord_1", token: "tok_ada" }));
console.log(handle({ method: "GET", path: "/orders/ord_9", token: "tok_ada" }));
console.log(handle({ method: "GET", path: "/orders/ord_1" }));
```

packages/http/src/index.ts

```ts
export { createApp, type Request } from "./app.js";
```

## Before you connect anything

REASON IT OUT

### What may depend on what?

The code is written. Before you wire up the build, think about the graph:

1. A developer in the auth team wants to log the request path when a login fails, and imports `Request` from `@shop/http`. What does that do to the graph? What can no longer be built first?
2. The database code starts using `Session` from `@shop/auth`, but nobody adds `@shop/auth` to the database's `package.json`. Could it still work? Where would it stop working?
3. You change a line inside `createLogger`. Which packages need to be compiled again? Which need to be *re-checked*? Does the answer change if you change the `Logger` interface instead?
4. Where should a type that both `auth` and `database` need live?

**Show the reasoning**

1. It creates a cycle: http needs auth, and auth now needs http. Neither can be built first, because each needs the other's declarations. Cycles are also a design smell: auth now knows about HTTP requests, so it cannot be reused by a queue worker or a CLI. The fix is to pass auth only what it needs (the path, as a string) or to move the shared type down to `core`.
2. It might work, by accident: npm puts links to all workspace packages in the root `node_modules`, so the import resolves. It breaks when the build order changes (a clean checkout in CI builds `database` before `auth`), when a stricter package manager is used, or when the package is published and installed somewhere without `@shop/auth`. Every import must be declared.
3. Only `logger` must be compiled again: its JavaScript changed. Dependents only need re-checking if logger's *declarations* changed, and a line inside a function body does not change them. Changing the `Logger` interface does, so `database`, `auth` and `http` must be checked again.
4. In a package that both already depend on, and that sits below both: `core`. Shared types flow downward to an owner; they are never copied sideways.

## Linking packages with workspaces

The root `package.json` declares which folders hold packages, and holds the tools every package shares:

package.json

```json
{
  "name": "naija-shop",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "tsc -b",
    "clean": "tsc -b --clean",
    "start": "node packages/http/dist/main.js"
  },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "typescript": "^7.0.2"
  }
}
```

Each package has its own `package.json`, shaped exactly like the published package from [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#package-json): a name, an `exports` map that points at `dist`, and its dependencies. Internal packages are marked `"private": true` so that they can never be published by mistake:

packages/core/package.json

```json
{
  "name": "@shop/core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": {}
}
```

packages/logger/package.json

```json
{
  "name": "@shop/logger",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": {}
}
```

packages/database/package.json

```json
{
  "name": "@shop/database",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": { "@shop/core": "1.0.0", "@shop/logger": "1.0.0" }
}
```

packages/auth/package.json

```json
{
  "name": "@shop/auth",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": { "@shop/core": "1.0.0", "@shop/logger": "1.0.0" }
}
```

packages/http/package.json

```json
{
  "name": "@shop/http",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": {
    "@shop/auth": "1.0.0",
    "@shop/core": "1.0.0",
    "@shop/database": "1.0.0",
    "@shop/logger": "1.0.0"
  }
}
```

One `npm install` at the root installs the shared tools and links every workspace package into `node_modules`:

Terminal on your computer

```bash
$ npm install

added 9 packages, and audited 15 packages in 10s

found 0 vulnerabilities
$ npm ls
naija-shop@ ~/naija-shop
├─┬ @shop/auth@1.0.0 -> ./packages/auth
│ ├── @shop/core@1.0.0 deduped -> ./packages/core
│ └── @shop/logger@1.0.0 deduped -> ./packages/logger
├── @shop/core@1.0.0 -> ./packages/core
├─┬ @shop/database@1.0.0 -> ./packages/database
│ ├── @shop/core@1.0.0 deduped -> ./packages/core
│ └── @shop/logger@1.0.0 deduped -> ./packages/logger
├─┬ @shop/http@1.0.0 -> ./packages/http
│ ├── @shop/auth@1.0.0 deduped -> ./packages/auth
│ ├── @shop/core@1.0.0 deduped -> ./packages/core
│ ├── @shop/database@1.0.0 deduped -> ./packages/database
│ └── @shop/logger@1.0.0 deduped -> ./packages/logger
├── @shop/logger@1.0.0 -> ./packages/logger
├── @types/node@26.6.2
└── typescript@7.0.2
```

Every arrow is a symbolic link: `node_modules/@shop/core` *is* `packages/core`. When `database` imports `"@shop/core"`, Node.js and TypeScript walk up to that link, read `packages/core/package.json`, and follow its `exports` to `dist/index.js` and `dist/index.d.ts`. That means a package's dependents see its **built output**, not its source: `core` must be compiled before `database` can be checked. Deciding that order is the job of project references.

> NOTE
>
> With npm, an internal dependency is written as a version (`"1.0.0"`) or `"*"`; npm links the workspace when the version matches. pnpm and Yarn use the **workspace protocol**, `"workspace:*"`, which can only ever mean the local folder. You will switch to pnpm [below](#pnpm).

## Project references and tsc -b

Every package is its own TypeScript project with its own `tsconfig.json`. The settings they share live once in a base file:

tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`composite: true` marks a project that other projects can reference. It requires `declaration` (dependents read your `.d.ts` files, not your source), requires every source file to be matched by `include` or `files`, and turns on incremental builds, which store what the compiler learned in a `.tsbuildinfo` file. Each package extends the base and lists the packages it depends on as **references**:

packages/http/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src"],
  "references": [{ "path": "../core" }, { "path": "../logger" }, { "path": "../database" }, { "path": "../auth" }]
}
```

The others differ only in their references, which mirror their `package.json` dependencies:

packages/database/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": "dist/.tsbuildinfo" },
  "include": ["src"],
  "references": [{ "path": "../core" }, { "path": "../logger" }]
}
```

packages/auth/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": "dist/.tsbuildinfo" },
  "include": ["src"],
  "references": [{ "path": "../core" }, { "path": "../logger" }]
}
```

packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": "dist/.tsbuildinfo" },
  "include": ["src"],
  "references": []
}
```

packages/logger/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": "dist/.tsbuildinfo" },
  "include": ["src"],
  "references": []
}
```

Putting `tsBuildInfoFile` inside `dist` means that deleting `dist` also deletes the build information. [Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance) shows the silent, empty build you get when those two are separated. The root `tsconfig.json` is a **solution file**: it compiles nothing itself (`"files": []`) and only lists the projects:

tsconfig.json

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/logger" },
    { "path": "packages/database" },
    { "path": "packages/auth" },
    { "path": "packages/http" }
  ]
}
```

`tsc -b` (short for `--build`) is `tsc` in build-orchestrator mode. It reads the references, sorts the projects so that every project comes after the ones it references, and builds each one that is out of date. `--verbose` makes it explain every decision:

Terminal on your computer

```bash
$ npx tsc -b --verbose
11:07:12 PM - Projects in this build:
    * packages/core/tsconfig.json
    * packages/logger/tsconfig.json
    * packages/database/tsconfig.json
    * packages/auth/tsconfig.json
    * packages/http/tsconfig.json
    * tsconfig.json

11:07:12 PM - Project 'packages/core/tsconfig.json' is out of date because output file 'packages/core/dist/.tsbuildinfo' does not exist

11:07:12 PM - Building project 'packages/core/tsconfig.json'...

11:07:12 PM - Project 'packages/logger/tsconfig.json' is out of date because output file 'packages/logger/dist/.tsbuildinfo' does not exist

11:07:12 PM - Building project 'packages/logger/tsconfig.json'...

11:07:12 PM - Project 'packages/database/tsconfig.json' is out of date because output file 'packages/database/dist/.tsbuildinfo' does not exist

11:07:12 PM - Building project 'packages/database/tsconfig.json'...

11:07:12 PM - Project 'packages/auth/tsconfig.json' is out of date because output file 'packages/auth/dist/.tsbuildinfo' does not exist

11:07:12 PM - Building project 'packages/auth/tsconfig.json'...

11:07:12 PM - Project 'packages/http/tsconfig.json' is out of date because output file 'packages/http/dist/.tsbuildinfo' does not exist

11:07:12 PM - Building project 'packages/http/tsconfig.json'...
$ npm start

> start
> node packages/http/dist/main.js

[http] authenticated {"userId":"u_ada"}
[database] order saved {"id":"ord_1"}
201 ord_1 ₦12500.00
[http] authenticated {"userId":"u_ada"}
200 ord_1 pending ₦12500.00
[http] authenticated {"userId":"u_ada"}
404 ORDER_NOT_FOUND
401 UNAUTHENTICATED
```

Five packages, built in dependency order, running as one program. Run `tsc -b` again and nothing is rebuilt; every project reports `is up to date because newest input … is older than output …`.

### What gets rebuilt, and why

The interesting part is what happens after a change. First, rename a local variable inside `createLogger` (the `suffix` above was once called `extra`). Only a function body changed:

Terminal on your computer

```bash
$ npx tsc -b --verbose
…
11:08:21 PM - Project 'packages/logger/tsconfig.json' is out of date because output 'packages/logger/dist/.tsbuildinfo' is older than input 'packages/logger/src/index.ts'
11:08:21 PM - Building project 'packages/logger/tsconfig.json'...
11:08:21 PM - Project 'packages/database/tsconfig.json' is up to date with .d.ts files from its dependencies
11:08:21 PM - Updating output timestamps of project 'packages/database/tsconfig.json'...
11:08:21 PM - Project 'packages/auth/tsconfig.json' is up to date with .d.ts files from its dependencies
11:08:21 PM - Updating output timestamps of project 'packages/auth/tsconfig.json'...
11:08:21 PM - Project 'packages/http/tsconfig.json' is up to date with .d.ts files from its dependencies
11:08:21 PM - Updating output timestamps of project 'packages/http/tsconfig.json'...
```

`logger` was rebuilt; its declaration file came out identical, so the three dependents were not checked again at all, only marked as current. Now add the doc comment `/** Structured logging for every @shop package. */` above the `Logger` interface. Comments are copied into `.d.ts` files, so this time the declarations change:

Terminal on your computer

```bash
$ npx tsc -b --verbose
…
11:07:50 PM - Project 'packages/database/tsconfig.json' is out of date because output 'packages/database/dist/.tsbuildinfo' is older than input 'packages/logger/dist/index.d.ts'
11:07:50 PM - Building project 'packages/database/tsconfig.json'...
11:07:50 PM - Project 'packages/auth/tsconfig.json' is out of date because output 'packages/auth/dist/.tsbuildinfo' is older than input 'packages/logger/dist/index.d.ts'
11:07:50 PM - Building project 'packages/auth/tsconfig.json'...
11:07:50 PM - Project 'packages/http/tsconfig.json' is out of date because output 'packages/http/dist/.tsbuildinfo' is older than input 'packages/logger/dist/index.d.ts'
11:07:50 PM - Building project 'packages/http/tsconfig.json'...
```

The `.d.ts` files are the contract between projects. A change that stays inside a package is cheap; a change to what a package exports ripples to everything above it. That is one more reason to keep exported types small and stable.

## The build graph as data

`tsc -b` computed an order from the references. The same graph lives in the `package.json` files, and a monorepo's own tools read it from there: to build in the right order, to run only the tests that a change can affect, and to refuse dependencies that break the rules. These tools are short programs; here is the shared part, which reads every package's dependencies and references:

tools/workspace.tsNode.js only

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";

export interface WorkspacePackage {
  name: string;
  folder: string;
  dependencies: string[];
  references: string[];
}

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
}

interface TsConfig {
  references?: { path: string }[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readWorkspace(dir = "packages"): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>();
  for (const folder of readdirSync(dir).sort()) {
    const pkg = readJson<PackageJson>(`${dir}/${folder}/package.json`);
    const tsconfigPath = `${dir}/${folder}/tsconfig.json`;
    const refs = existsSync(tsconfigPath) ? (readJson<TsConfig>(tsconfigPath).references ?? []) : [];
    packages.set(pkg.name, {
      name: pkg.name,
      folder: `${dir}/${folder}`,
      dependencies: Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith("@shop/")),
      references: refs.map((ref) => `@shop/${ref.path.replace("../", "")}`),
    });
  }
  return packages;
}

export function buildLevels(packages: Map<string, WorkspacePackage>): string[][] {
  const levels: string[][] = [];
  const done = new Set<string>();
  while (done.size < packages.size) {
    const ready = [...packages.values()]
      .filter((p) => !done.has(p.name) && p.dependencies.every((dep) => done.has(dep)))
      .map((p) => p.name);
    if (ready.length === 0) {
      const stuck = [...packages.keys()].filter((name) => !done.has(name));
      throw new Error(`cycle among: ${stuck.join(", ")}`);
    }
    levels.push(ready);
    for (const name of ready) done.add(name);
  }
  return levels;
}
```

`buildLevels` is a **topological sort**, from [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs), done in rounds: each round takes every package whose dependencies are all built. Packages in the same round do not depend on each other, so they can be built at the same time. If a round finds nothing to build while packages remain, those packages depend on each other in a circle.

tools/graph.tsNode.js only

```ts
import { buildLevels, readWorkspace } from "./workspace.js";

const packages = readWorkspace();
for (const p of packages.values()) console.log(`${p.name} -> ${p.dependencies.join(", ") || "(nothing)"}`);
buildLevels(packages).forEach((level, i) => console.log(`step ${i + 1}: ${level.join(", ")}`));
```

Output of `npx tsx tools/graph.ts`

```ts
@shop/auth -> @shop/core, @shop/logger
@shop/core -> (nothing)
@shop/database -> @shop/core, @shop/logger
@shop/http -> @shop/auth, @shop/core, @shop/database, @shop/logger
@shop/logger -> (nothing)
step 1: @shop/core, @shop/logger
step 2: @shop/auth, @shop/database
step 3: @shop/http
```

Three steps for five packages. pnpm uses this same idea when it runs a script in every package: [below](#pnpm) you will see it start `core` and `logger` together, then `auth` and `database`, then `http`. The second tool answers the question CI asks on every pull request: "this package changed; what could it have broken?"

tools/affected.tsNode.js only

```ts
import { readWorkspace } from "./workspace.js";

const packages = readWorkspace();

function affectedBy(changed: string): string[] {
  const result = new Set([changed]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of packages.values()) {
      if (!result.has(p.name) && p.dependencies.some((dep) => result.has(dep))) {
        result.add(p.name);
        grew = true;
      }
    }
  }
  return [...result];
}

for (const changed of ["@shop/logger", "@shop/auth", "@shop/http"]) {
  console.log(`${changed} changed: rebuild and test ${affectedBy(changed).join(", ")}`);
}
```

Output of `npx tsx tools/affected.ts`

```ts
@shop/logger changed: rebuild and test @shop/logger, @shop/auth, @shop/database, @shop/http
@shop/auth changed: rebuild and test @shop/auth, @shop/http
@shop/http changed: rebuild and test @shop/http
```

A change at the bottom affects everything; a change at the top affects only itself. Tools such as Nx and Turborepo do this (plus caching of results) for large repositories. The idea is exactly these few lines.

## When the graph is wrong

Most monorepo build problems are a mismatch between three descriptions of the same graph: the imports in the code, the dependencies in `package.json`, and the references in `tsconfig.json`. Here is what each mismatch looks like. All of these outputs are from real runs on the shop repository.

### A missing reference: works from the root, fails alone

Remove `{ "path": "../auth" }` from `http`'s references, leaving everything else. Build from the root and it succeeds, because the solution file happens to list `auth` before `http`. Build `http` on its own, from clean, as a developer or a CI job for one package would:

Terminal on your computer

```bash
$ npx tsc -b --clean
$ npx tsc -b packages/http --verbose
11:08:36 PM - Projects in this build:
    * packages/core/tsconfig.json
    * packages/logger/tsconfig.json
    * packages/database/tsconfig.json
    * packages/http/tsconfig.json
…
11:08:36 PM - Building project 'packages/http/tsconfig.json'...
packages/http/src/app.ts(1,30): error TS2307: Cannot find module '@shop/auth' or its corresponding type declarations.
```

`auth` is not even in the list of projects, so it was never built, so its `dist/index.d.ts` does not exist. The error message talks about a missing module, not about a missing reference; when you see TS2307 for an internal package, check the references first.

### A cycle

Now do what the auth developer wanted, and make `auth` reference `http`:

Terminal on your computer

```bash
$ npx tsc -b
error TS6202: Project references may not form a circular graph. Cycle detected: /home/you/naija-shop/tsconfig.json
/home/you/naija-shop/packages/auth/tsconfig.json
/home/you/naija-shop/packages/http/tsconfig.json
```

The compiler refuses outright. Note that it only sees cycles in *references*; a cycle that exists only in imports or in `package.json` shows up later as a confusing TS2307 instead. The fix is never to make the cycle "work"; move the shared piece down to a lower package, or pass plain data across the boundary.

### A relative import into another package

A developer wants `formatKobo` in the database package and, instead of importing `"@shop/core"`, reaches across with a relative path: `import { formatKobo } from "../../core/src/index.js"`. Because `database` references `core`, TypeScript quietly maps that source file to core's declarations, and the build passes. The program does not:

Terminal on your computer

```bash
$ npx tsc -b
$ node -e 'import("./packages/database/dist/money.js").then((m) => console.log(m.describeTotal(5000)))'
…
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/you/naija-shop/packages/core/src/index.js' imported from /home/you/naija-shop/packages/database/dist/money.js
```

The compiled file still says `../../core/src/index.js`, and `src` only contains `.ts` files. Without the reference, the compiler does complain, with two errors that describe the real rule: every source file of a composite project must be inside its `rootDir` and matched by its `include`:

Terminal on your computer

```bash
$ npx tsc -b
packages/database/src/money.ts:1:28 - error TS6059: File '/home/you/naija-shop/packages/core/src/index.ts' is not under 'rootDir' '/home/you/naija-shop/packages/database/src'. 'rootDir' is expected to contain all source files.
…
packages/database/src/money.ts:1:28 - error TS6307: File '/home/you/naija-shop/packages/core/src/index.ts' is not listed within the file list of project '/home/you/naija-shop/packages/database/tsconfig.json'. Projects must list all files or use an 'include' pattern.
…
```

Worse, that failing build still wrote a compiled `index.js` into `packages/core/src`, right beside the source. Leave it there and the relative import starts to "work" at runtime, against a stale copy of core that no build will ever update. Delete stray output like this, and across package boundaries, import by package name only.

### A phantom dependency

Finally, the second question from the reasoning section: `database` starts importing `Session` from `@shop/auth` in a new file, without declaring the dependency:

packages/database/src/audit.ts

```ts
import type { Session } from "@shop/auth";

export function auditLine(session: Session, action: string): string {
  return `${session.userId} (${session.role}) ${action}`;
}
```

On the developer's laptop, `npx tsc -b` passes: `auth` was built earlier, and npm's root `node_modules/@shop/auth` link makes the import resolve. On a clean checkout, like CI's:

Terminal on your computer

```bash
$ npx tsc -b --clean
$ npx tsc -b
packages/database/src/audit.ts:1:30 - error TS2307: Cannot find module '@shop/auth' or its corresponding type declarations.

1 import type { Session } from "@shop/auth";
                               ~~~~~~~~~~~~

packages/http/src/app.ts:1:30 - error TS2307: Cannot find module '@shop/auth' or its corresponding type declarations.

1 import { authenticate } from "@shop/auth";
                               ~~~~~~~~~~~~

$ npx tsc -b
$ echo $?
0
```

`database` was built before `auth`, so the import failed, and the failure spread to `http` in the same run. Run the build a second time and it passes, because `auth`'s output now exists. A build that fails once and then passes is the worst kind: it wastes an afternoon in CI and never reproduces on a laptop. A dependency that code uses without declaring it is called a **phantom dependency**.

## Enforcing dependency direction

Every one of those failures is a rule that a person could break without noticing. So write the rules down as a program. Give each package a **tier**, a number for its layer, and allow dependencies only on the same or a lower tier. Then check, for every package, that its dependencies respect the tiers, that each dependency has a matching reference, that every `@shop/` import in its source is declared, and that there is no cycle:

tools/rules.tsNode.js only

```ts
import { readFileSync, readdirSync } from "node:fs";
import { buildLevels, readWorkspace } from "./workspace.js";

export const TIERS: Record<string, number> = {
  "@shop/core": 0,
  "@shop/logger": 0,
  "@shop/database": 1,
  "@shop/auth": 1,
  "@shop/http": 2,
};

export function checkWorkspace(): string[] {
  const packages = readWorkspace();
  const problems: string[] = [];

  for (const p of packages.values()) {
    for (const dep of p.dependencies) {
      if ((TIERS[dep] ?? 0) > (TIERS[p.name] ?? 0)) {
        problems.push(`${p.name} (tier ${TIERS[p.name]}) must not depend on ${dep} (tier ${TIERS[dep]})`);
      }
      if (!p.references.includes(dep)) {
        problems.push(`${p.name} depends on ${dep} but its tsconfig.json has no reference to it`);
      }
    }
    for (const file of readdirSync(`${p.folder}/src`).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(`${p.folder}/src/${file}`, "utf8");
      for (const [, imported] of source.matchAll(/from "(@shop\/[\w-]+)"/g)) {
        if (imported !== p.name && !p.dependencies.includes(imported!)) {
          problems.push(`${p.folder}/src/${file} imports ${imported} but package.json does not list it`);
        }
      }
    }
  }

  try {
    buildLevels(packages);
  } catch (error) {
    problems.push((error as Error).message);
  }
  return problems;
}
```

A small runner prints the result and sets a failing exit code, so that CI stops on any problem:

tools/check.tsNode.js only

```ts
import { checkWorkspace } from "./rules.js";

const problems = checkWorkspace();
console.log(problems.length ? problems.join("\n") : "all checks passed");
process.exitCode = problems.length > 0 ? 1 : 0;
```

Output of `npx tsx tools/check.ts`

```ts
packages/database/src/audit.ts imports @shop/auth but package.json does not list it
```

It found the phantom dependency from the last section, since `audit.ts` is still in the database package. Now let the auth developer declare the dependency on `http` that caused the cycle, and run the check again:

packages/auth/package.json

```json
{
  "name": "@shop/auth",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": { "@shop/core": "1.0.0", "@shop/logger": "1.0.0", "@shop/http": "1.0.0" }
}
```

tools/check.tsNode.js only

```ts
import { checkWorkspace } from "./rules.js";

const problems = checkWorkspace();
console.log(problems.length ? problems.join("\n") : "all checks passed");
process.exitCode = problems.length > 0 ? 1 : 0;
```

Output of `npx tsx tools/check.ts`

```ts
@shop/auth (tier 1) must not depend on @shop/http (tier 2)
@shop/auth depends on @shop/http but its tsconfig.json has no reference to it
packages/database/src/audit.ts imports @shop/auth but package.json does not list it
cycle among: @shop/auth, @shop/http
```

One bad line in `package.json`, three separate reports: the direction is wrong, the reference is missing, and the graph now has a cycle. Each message says what to fix. Run this script in CI next to `tsc -b` and the tests, and the architecture stops depending on everyone remembering it.

> TIP
>
> Regular expressions over source text are a rough way to find imports: they miss `import("…")` and `export … from`, and would match an import written inside a string. Real tools use the TypeScript compiler API or a linter rule for this. For a first version, a strict pattern that your code style follows is enough.

## pnpm workspaces

npm's workspaces made the phantom dependency possible, because every package can see every link in the root `node_modules`. **pnpm** is a package manager that installs differently: each package's own `node_modules` contains only the dependencies it declares, as links into one shared store on disk. Converting the shop takes two changes. The list of package folders moves to `pnpm-workspace.yaml`:

pnpm-workspace.yaml

```ts
packages:
  - "packages/*"
```

and internal dependencies use the workspace protocol:

packages/database/package.json

```json
{
  "name": "@shop/database",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "dependencies": {
    "@shop/core": "workspace:*",
    "@shop/logger": "workspace:*"
  }
}
```

Install, and look at what the database package can see. Then build, with the undeclared `audit.ts` import still in place:

Terminal on your computer

```bash
$ pnpm install
…
Done in 34.2s using pnpm v11.24.0
$ ls packages/database/node_modules/@shop
core
logger
$ ls node_modules/@shop
ls: cannot access 'node_modules/@shop': No such file or directory
$ npx tsc -b
packages/database/src/audit.ts:1:30 - error TS2307: Cannot find module '@shop/auth' or its corresponding type declarations.

1 import type { Session } from "@shop/auth";
                               ~~~~~~~~~~~~


Found 1 error in packages/database/src/audit.ts:1
```

The phantom dependency is now an error on every machine, every time. pnpm can also run a script in every package, in dependency order, running independent packages in parallel. With a `"build": "tsc -p tsconfig.json"` script in each package:

Terminal on your computer

```bash
$ pnpm -r run build
Scope: 5 of 6 workspace projects
packages/core build$ tsc -p tsconfig.json
packages/logger build$ tsc -p tsconfig.json
packages/core build: Done
packages/logger build: Done
packages/database build$ tsc -p tsconfig.json
packages/auth build$ tsc -p tsconfig.json
packages/auth build: Done
packages/database build: Done
packages/http build$ tsc -p tsconfig.json
packages/http build: Done
```

Exactly the three steps your `buildLevels` printed. Filters select part of the graph: `pnpm --filter "...@shop/auth" run build` builds `auth` and every package that depends on it (the same answer as `affected.ts`), and `pnpm --filter "@shop/http..."` selects `http` and everything it depends on.

- **`workspace:*`** can only resolve to the local folder. A version range like `"^1.0.0"` could silently resolve to a copy from the registry instead, and then your packages compile against an old published version while you edit the source next to it.
- When you **publish**, `pnpm publish` rewrites `workspace:*` to the real version number. Plain `npm publish` does not understand the protocol and would upload the literal text `workspace:*`, which nobody can install.
- Build order: `tsc -b` orders by `references`; `pnpm -r` orders by `package.json` dependencies. If you use both, keep them in sync, which is what the check above enforces.

## A real monorepo: ZudoJS

The ZudoJS framework you will use later in this course is developed in exactly this kind of repository: about forty `@zudojs/*` packages in one pnpm workspace. Its conventions are the lessons of this page, applied at scale:

- **One owner per type.** The repository's conventions file, `AGENTS.md`, has a type ownership table: error classes live only in `@zudojs/errors`, ID types such as `UserId` only in `@zudojs/constants`, logger types only in `@zudojs/logger`, and so on. A package that needs one imports it; it never redefines it. This is the fix for the three copies of `OrderStatus` at the start of this lesson.
- **A tier map in one file.** `scripts/package-tiers.js` gives every package a tier from 0 (leaf packages such as `errors` and `types`) to 4 (developer tooling such as `testing`), with the rule "a package may depend only on packages of the same or a lower tier". Two separate checks, a script and a test file, import that one map. Its header comment explains why there is only one copy: an earlier duplicated map had drifted, and a package passed one check while failing the other.
- **An architecture check** in the style of your `check.ts`: tier violations, circular dependencies, and the rule that every internal dependency uses `workspace:*`. Its summary on the current repository reads:

Terminal on your computer

```bash
$ node scripts/architect-check.js
Running Zudojs architecture boundary check...

Found 40 packages.
…
   - All internal dependencies use workspace:*
   - No tier violations
   - No circular dependencies
```

- **Why `workspace:*` is enforced.** The repository once pinned every internal dependency to an exact published version, `"0.1.0"`. Each package therefore compiled against an old tarball from the registry rather than its siblings' source. That hid a build break in `@zudojs/lifecycle`, two failing `@zudojs/cqrs` tests and a timer leak in `@zudojs/logger`, all of which appeared the moment the packages were linked to the workspace. A monorepo only protects you if the packages really use each other's current code.
- **Each package is a composite project** with `"tsBuildInfoFile": "./dist/.tsbuildinfo"`, built by `pnpm -r run build` in dependency order, and the packages import each other's `dist` output, exactly like the shop.

Notice that ZudoJS's `@zudojs/core` sits in tier 2, above most packages, because it wires them together, while the shop's `@shop/core` is at the bottom. A package's name says nothing about its place in the graph; the tier map does.

## Testing a monorepo

- **Unit tests live with their package** and test it through its own source. Each package can have its own `test` script.
- **Integration tests** that span packages (for example `http` with a real `database`) live in the highest package involved, or in a separate test folder at the root, and run after a build.
- **Test only what a change affects**, using the same graph as `affected.ts` (`pnpm --filter "...[origin/main]"` selects packages changed since a Git reference, plus their dependents). Always run everything before a release.
- **Architecture tests**: run the boundary check in CI. ZudoJS has both a script and a Vitest test (`tests/architect/boundaries.test.ts`) over the same tier map.
- **Build from clean in CI.** The phantom dependency only failed on a clean build. A CI job that reuses old `dist` folders hides exactly the problems CI exists to find.

## In production

- **Keep the graph pointing one way**, and write the direction down as tiers that a script enforces. Cycles and upward imports get harder to remove every week they exist.
- **Every import declared, every dependency referenced.** `package.json` dependencies, `tsconfig.json` references and the actual imports must agree. Prefer pnpm (or another strict installer) so undeclared imports fail immediately.
- **Share types through an owner package**, never by copying. Keep exported types stable, because a `.d.ts` change ripples to every dependent.
- **One lockfile, one version of each tool** (TypeScript, `@types/node`, test runner) at the root, so every package is checked by the same compiler.
- **Release with tooling** that understands the graph, such as Changesets: it bumps dependents when a package they use changes, and `pnpm publish` rewrites `workspace:*`.
- **Avoid path aliases as a substitute for packages.** Some repositories map `"@shop/*"` to source folders with the `paths` compiler option. It skips builds, but it also skips every boundary on this page: no `exports`, no declared dependencies, no references, and Node.js itself ignores `paths`, so the runtime needs extra tooling.

## Practice

TRY IT YOURSELF

### Add a payments package

The shop needs `@shop/payments`: it charges an order through a payment provider, uses `Order` and `DomainError` from `core` and a `Logger`, and `http` will call it. List every file you must create or change, choose its tier, and say what `buildLevels` will print afterwards.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Every package needs the same four things: a `package.json`, a `tsconfig.json` with references, an entry in the root solution file, and a tier in `tools/rules.ts`. Then find who must now depend on it.

HINT 2

`payments` sits at the same tier as `auth` and `database` (it needs `core` and `logger`, and is needed by `http`), so it builds alongside them, one level after the leaves.

SOLUTION

- `packages/payments/package.json`: name `@shop/payments`, the same `exports` shape, dependencies on `@shop/core` and `@shop/logger`.
- `packages/payments/tsconfig.json`: extends the base, `rootDir`/`outDir`/`tsBuildInfoFile` as the others, references to `../core` and `../logger`.
- `packages/payments/src/index.ts`: the code.
- `packages/http/package.json` and `packages/http/tsconfig.json`: add the dependency and the reference.
- Root `tsconfig.json`: add `{ "path": "packages/payments" }` to the solution. Then run `npm install` (or `pnpm install`) so that the new link exists.
- `tools/rules.ts`: add `"@shop/payments": 1` to `TIERS`. It is a domain service like `auth` and `database`, used by `http`.

`buildLevels` then prints three steps: `core` and `logger`; then `auth`, `database` and `payments`; then `http`. Forget the reference in `http` and `check.ts` reports it before any build fails.

TRY IT YOURSELF

### Name the cycle

`buildLevels` reports "cycle among: @shop/auth, @shop/http", which lists every package it could not build, including ones that are only stuck *behind* a cycle. Write `findCycle(graph)` that returns the actual loop, such as `@shop/auth -> @shop/http -> @shop/auth`, using depth-first search.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep a `path: string[]` of the nodes on the current call stack, and a `state` map. If a node is already `"visiting"`, the loop is the part of `path` from that node onwards, plus the node again.

HINT 2

Recurse into each dependency with `visit(dep)` before marking the current node `"done"`; return the first cycle any recursive call finds, all the way back up.

SOLUTION

cycle.ts

```ts
type Graph = Map<string, string[]>;

function findCycle(graph: Graph): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  function visit(node: string): string[] | null {
    if (state.get(node) === "done") return null;
    if (state.get(node) === "visiting") return [...path.slice(path.indexOf(node)), node];
    state.set(node, "visiting");
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(node, "done");
    return null;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

const shop: Graph = new Map([
  ["@shop/core", []],
  ["@shop/logger", []],
  ["@shop/auth", ["@shop/core", "@shop/logger", "@shop/http"]],
  ["@shop/database", ["@shop/core", "@shop/logger"]],
  ["@shop/http", ["@shop/auth", "@shop/core", "@shop/database"]],
  ["@shop/reports", ["@shop/http"]],
]);
console.log(findCycle(shop)?.join(" -> ") ?? "no cycle");

shop.set("@shop/auth", ["@shop/core", "@shop/logger"]);
console.log(findCycle(shop)?.join(" -> ") ?? "no cycle");
```

Output of `npx tsx cycle.ts` and of the browser terminal

```ts
@shop/auth -> @shop/http -> @shop/auth
no cycle
```

A node is "visiting" while the search is inside it. Reaching a visiting node again means the path has looped back, and the loop is the part of the path from that node onwards. `@shop/reports` is stuck behind the cycle, but it is not part of it, so it does not appear. This is the same depth-first search as cycle detection in [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search).

TRY IT YOURSELF

### Where does the type go?

Three new types are needed: (a) `Money` (an amount in kobo plus a currency), used by `database`, `auth` (for spending limits) and `http`; (b) `RouteParams`, used only inside `http`; (c) `AuditEvent`, produced by `auth` and stored by `database`. Which package should own each?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A type used by only one package belongs in that package. A type shared by packages at the *same* tier, with neither depending on the other, cannot live in either of them.

HINT 2

Ask where each type would have to sit so that every package that needs it is *above* it in the dependency graph, without adding a sideways dependency between peers.

SOLUTION

- (a) `@shop/core`. Several packages across layers need it, and `core` is below all of them.
- (b) `@shop/http`, unexported or exported only from `http`. A type used by one package belongs to that package; moving it down "just in case" makes `core` a dumping ground.
- (c) Not `auth` (then `database` would depend on `auth`, a sideways dependency within tier 1) and not `database` (the same problem reversed). It is a shared contract between two peers, so it goes down to `core`. If there were many such event types, a new tier-0 package such as `@shop/events` would own them.

## Recap

- A monorepo keeps packages that depend on each other in one repository, so a shared type has one owner and a breaking change fails everywhere in the same commit.
- Workspaces (npm `workspaces`, `pnpm-workspace.yaml`) link internal packages into `node_modules`; dependents import each other's built `dist` through normal `exports` maps.
- Composite projects with references, and a solution `tsconfig.json`, let `tsc -b` build in dependency order and skip work: an unchanged `.d.ts` means dependents are only re-stamped, not re-checked.
- Imports, `package.json` dependencies and `tsconfig.json` references must agree. Missing references, reference cycles (TS6202), relative imports into other packages and phantom dependencies each fail in their own confusing way.
- Write the architecture down as tiers and check it with a script in CI, as ZudoJS does, and use a strict installer such as pnpm with `workspace:*`.

Next: [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing), where you test runtime behaviour and types with Vitest.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
