---
title: "What a framework does — ZudoJS Academy"
description: "Library vs framework and inversion of control, then every job a backend framework takes over: lifecycle, DI, routing, config, validation. Build a tiny one."
source: https://zudojs.oyinlola.site/learn/frameworks
---

LEVEL 11 · LESSON 9 OF 12

Framework engineering Core

# What a framework does

Library vs framework and inversion of control, then every job a backend framework takes over: lifecycle, DI, routing, config, validation. Build a tiny one.

- **30 min** to read and try
- **You need:** Backend architecture, Clean architecture: ports and adapters, and Architecture styles
- **You build:** A 40-line framework that starts modules in dependency order and stops them in reverse

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell a library from a framework by who calls whom, and name that flip inversion of control
- Topologically sort modules by their dependencies, and roll a failed start back in reverse
- Explain why a circular dependency must be refused before anything starts, not caught later
- List the jobs a backend framework takes over, and which ZudoJS package does each one
- Weigh what a framework costs (learning, opinions, a dependency on its future) against what it saves

## Libraries and frameworks

You have used plenty of other people's code already: `node:http`, PGlite, `tsx`. There are two very different ways to use code that someone else wrote.

A **library** is code *you* call. You decide when, and your code stays in charge:

library.ts

```ts
function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

const prices = [1299, 999, 1499];
for (const cents of prices) {
  console.log(formatPrice(cents));
}
```

Output of `npx tsx library.ts` and of the browser terminal

```ts
12.99
9.99
14.99
```

Your loop calls `formatPrice`. `formatPrice` has no idea a loop exists. That is the library relationship: the control flow is yours.

A **framework** works the other way round. You write pieces, hand them to the framework, and **it** decides when to call them. You already saw this: in the BookStore you gave handlers to the router, and the router called them when a request arrived. This flip is called **inversion of control**, sometimes summed up as "don't call us, we'll call you".

Inversion of control is not a loss. It is the point. Code that is called at the right time, in the right order, by something that has done it a thousand times, is code you no longer write or debug.

## A framework in 40 lines

The BookStore review listed "no lifecycle": nothing starts the database before the server, and nothing closes them in reverse. Here is a tiny framework that does exactly that. You describe **modules**, each with a name, what it depends on, and optional `start` and `stop` functions. The framework works out the order:

framework.ts

```ts
export interface Module {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

function startOrder(modules: readonly Module[]): Module[] {
  const byName = new Map(modules.map((module) => [module.name, module]));
  const ordered: Module[] = [];
  const visiting = new Set<string>();
  const visit = (module: Module): void => {
    if (ordered.includes(module)) return;
    if (visiting.has(module.name)) throw new Error(`Circular dependency at "${module.name}"`);
    visiting.add(module.name);
    for (const name of module.dependsOn ?? []) {
      const dependency = byName.get(name);
      if (dependency === undefined) throw new Error(`"${module.name}" needs "${name}", which is not registered`);
      visit(dependency);
    }
    ordered.push(module);
  };
  modules.forEach(visit);
  return ordered;
}

export function createApp(modules: readonly Module[]) {
  const started: Module[] = [];
  return {
    async start(): Promise<void> {
      for (const module of startOrder(modules)) {
        await module.start?.();
        started.push(module);
      }
    },
    async stop(): Promise<void> {
      for (const module of started.reverse()) {
        await module.stop?.();
      }
      started.length = 0;
    },
  };
}
```

- `startOrder` visits each module's dependencies *before* the module itself, so every module lands after the ones it needs. Computer scientists call this a **topological sort**.
- `visiting` remembers which modules are being visited right now. Meeting one of them again means A needs B needs A: a cycle that can never start, so the framework refuses clearly.
- `module.start?.()` calls `start` only if the module has one ([Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern) introduced `?.`).
- `stop` walks the started modules **in reverse**: the server stops taking requests before the database it uses is closed.

REASON IT OUT

### Two modules that genuinely need each other

Say a `metrics` module wants to report the `http` module's request count, and `http` wants to report through `metrics`. Neither can start first by this framework's rule. Is that a bug in `startOrder` to fix, or is the framework right to refuse it?

**Show the reasoning**

The framework is right. "A needs B" means "B must be fully started, and usable, before A's `start` runs." If A and B need each other that way, there is no first module: whichever starts first calls into something not yet running. A language runtime could paper over this with lazy references or two-phase init, but that trades one predictable startup error for a fact you must hold in your head about every pair of modules that might do this.

The real fix is to break the cycle in the design: `http` should not depend on `metrics` to report through, and `metrics` should not depend on `http` to be counted. A third module, an event bus or a metrics registry that both sides push into and pull from without depending on each other's lifecycle, removes the cycle instead of hiding it.

Now use it. The modules are listed in a random order on purpose:

main.ts

```ts
import { createApp } from "./framework.js";
import type { Module } from "./framework.js";

function logged(name: string, dependsOn: string[] = []): Module {
  return {
    name,
    dependsOn,
    start: () => console.log("start", name),
    stop: () => console.log("stop ", name),
  };
}

const app = createApp([
  logged("http", ["orders", "config"]),
  logged("orders", ["database"]),
  logged("database", ["config"]),
  logged("config"),
]);

await app.start();
console.log("-- the app is running --");
await app.stop();
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
start config
start database
start orders
start http
-- the app is running --
stop  http
stop  orders
stop  database
stop  config
```

You never wrote "start config first". You only said what each module needs, and the framework called your functions in a safe order, then in the reverse order. That is inversion of control doing real work. A mistake in the setup is caught before anything starts:

broken.ts

```ts
import { createApp } from "./framework.js";

const app = createApp([
  { name: "http", dependsOn: ["database"] },
  { name: "database", dependsOn: ["cache"] },
]);

try {
  await app.start();
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx broken.ts` and of the browser terminal

```ts
"database" needs "cache", which is not registered
```

## What a backend framework takes over

A real framework does many such jobs. Here is each one, next to what it cost you in the BookStore, and the ZudoJS package that does it. You will meet all of them in the coming parts of the course.

| Job | By hand in the BookStore | What a framework gives you | In ZudoJS |
| --- | --- | --- | --- |
| **Lifecycle** | Nothing. Ctrl + C cut requests off and never closed the database. | Start in dependency order, stop in reverse, react to `SIGTERM`, undo a half-finished start, report readiness. | [@zudojs/runtime](https://zudojs.oyinlola.site/docs/packages-runtime.md), [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) |
| **Dependency injection** | `createRouter` built every repository and threaded the secret through by hand. | A **container**: register each service once, and ask for it by name wherever it is needed. | [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) |
| **Routing and middleware** | Your own router, JSON reader, body limit and error mapping. | A tested router with path parameters, middleware pipelines and consistent responses. | [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md), [@zudojs/middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md) |
| **Configuration** | Four environment variables, each parsed by hand. | Layered sources (defaults, files, environment), types, validation, and secrets hidden from logs. | [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md) |
| **Validation** | `text`, `whole` and a parser per body, separate from the interfaces. | Describe the data once; get the runtime check and the TypeScript type from it. | [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) |
| **Errors** | Your own error classes and codes. | Ready-made errors with status codes and stable codes shared by every package. | [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) |
| **Database access** | A `Queryable` interface, `IF NOT EXISTS` migrations, error codes checked by hand. | Clients, repositories, migrations and transactions behind one interface. | [@zudojs/database](https://zudojs.oyinlola.site/docs/packages-database.md), [@zudojs/transactions](https://zudojs.oyinlola.site/docs/packages-transactions.md) |
| **Security** | Hashing and tokens by hand; no rate limit, no security headers. | Password hashing, JWTs, rate limiting, CORS, CSRF and security headers with safe defaults. | [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md), [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md) |
| **Testing** | Build a database, a secret and a server for every API test. | Test helpers, fakes and a test client that start the app for you. | [@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md) |
| **Application architecture** | You chose the folders and the layers yourself. | A standard project layout and modules, created by a CLI, so every project looks alike. | [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md), [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) |

## What a framework costs

A framework is not free. Be honest about the trade:

- **Learning.** You must learn its names and rules before you are fast with it. This course spends many lessons on that.
- **Its way, not yours.** A framework has opinions about structure. When your problem does not fit them, you work around them.
- **Staying power.** Your code depends on the framework's future. Pick one that is maintained and whose parts you can replace.

For a 50-line script, a framework is too much. For a backend with users, a database, several developers and a production server, the jobs in the table above are not optional. Either a framework does them, or you do, one bug at a time. You have now done most of them yourself, so you know what you are buying.

## Now you are ready for ZudoJS

Look at how far you came. You can write JavaScript and TypeScript, run a Node.js server, design a REST API, use SQL and PostgreSQL, hash passwords, sign tokens, test your code, split a backend into [layers](https://zudojs.oyinlola.site/learn/backend-architecture) and enforce that split with [the dependency rule](https://zudojs.oyinlola.site/learn/arch-clean), and weigh a monolith against [services, events and CQRS](https://zudojs.oyinlola.site/learn/arch-styles). You also know, from experience, which parts of a backend are tedious and risky to build alone.

That is exactly the knowledge ZudoJS assumes. It is a set of small packages that each take over one of the jobs above, and a CLI that puts them together into a project. [Build a mini framework, part 1: the core](https://zudojs.oyinlola.site/learn/framework-build-core) is a tour of what it contains, built by hand so you see how the pieces fit before you meet the real ones.

## Practice

TRY IT YOURSELF

### Spot the cycle

Give the mini framework three modules where `orders` needs `payments`, `payments` needs `mailer`, and `mailer` needs `orders`. What does `start` do?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Three objects, each with a `name` and a `dependsOn` array of one name, forming a ring: `{ name: "orders", dependsOn: ["payments"] }`, and so on.

HINT 2

`[{ name: "orders", dependsOn: ["payments"] }, { name: "payments", dependsOn: ["mailer"] }, { name: "mailer", dependsOn: ["orders"] }]`.

SOLUTION

cycle.ts

```ts
import { createApp } from "./framework.js";

const app = createApp([
  { name: "orders", dependsOn: ["payments"] },
  { name: "payments", dependsOn: ["mailer"] },
  { name: "mailer", dependsOn: ["orders"] },
]);

try {
  await app.start();
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx cycle.ts` and of the browser terminal

```ts
Circular dependency at "orders"
```

None of the three can go first, so nothing starts. Break the loop by moving the shared part into a module that the others depend on.

TRY IT YOURSELF

### Undo a failed start

If the database fails to start, the config module is already running and is never stopped. Write `startAll(modules)`: it starts the modules in the given order, and if one throws, it stops the ones already started, in reverse, then rethrows the error.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Wrap the loop in `try`: `for (const module of modules) { await module.start?.(); started.push(module); } return started;`.

HINT 2

In `catch (error)`: `for (const module of [...started].reverse()) { await module.stop?.(); }`, then `throw error;` so the caller still sees the original failure.

SOLUTION

rollback.ts

```ts
import type { Module } from "./framework.js";

async function startAll(modules: readonly Module[]): Promise<Module[]> {
  const started: Module[] = [];
  try {
    for (const module of modules) {
      await module.start?.();
      started.push(module);
    }
    return started;
  } catch (error) {
    for (const module of [...started].reverse()) {
      await module.stop?.();
    }
    throw error;
  }
}

const modules: Module[] = [
  { name: "config", start: () => console.log("start config"), stop: () => console.log("stop  config") },
  { name: "database", start: () => { throw new Error("connection refused"); } },
  { name: "http", start: () => console.log("start http") },
];

try {
  await startAll(modules);
} catch (error) {
  console.log("could not start:", error instanceof Error ? error.message : error);
}
```

Output of `npx tsx rollback.ts` and of the browser terminal

```ts
start config
stop  config
could not start: connection refused
```

This is called a **rollback**. `@zudojs/runtime` does it for you, along with timeouts and shutdown signals.

## Recap

- You call a library. A framework calls you: that is inversion of control.
- A framework starts parts in dependency order, stops them in reverse, and refuses a broken setup before anything runs.
- A backend framework takes over lifecycle, dependency injection, routing, configuration, validation, errors, database access, security, testing and project structure.
- It costs learning time and some freedom. For a real backend, the jobs it does must be done anyway.

Next: [Build a mini framework, part 1: the core](https://zudojs.oyinlola.site/learn/framework-build-core), where the module system in this lesson grows into a container, configuration and a lifecycle you carry forward into the next two lessons.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
