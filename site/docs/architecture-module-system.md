---
title: "Module System"
description: "How ZudoJS modules work: defining composable, dependency-aware modules, registering them, lifecycle hooks, and best practices for structuring an app."
source: https://zudojs.oyinlola.site/docs/architecture-module-system
---

v1.0.0

# Module System

A module is a named piece of your application with four optional hooks. The runtime starts them in dependency order and stops them in reverse.

MODULES HOOKS ORDERING

## Overview

A **module** is one slice of your application — users, billing, notifications — packaged as an object with a name and some lifecycle hooks.

A **lifecycle hook** is a method the framework calls at a known moment. You do not call it yourself. You write `onReady`, and the runtime calls it once everything the module needs is up.

The point of modules is ordering and cleanup. If billing needs the database, you say so once, and the runtime guarantees the database starts first and shuts down last. You never write that ordering by hand.

> IN PLAIN WORDS
>
>
>
> A module is a box with a label and four buttons: *set yourself up*, *you are live*, *start winding down*, *release everything*. The framework presses the buttons in the right order. You decide what each one does.

Everything on this page lives in one package:

```bash
$ npm install @zudojs/core
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## The Module Contract

`Module` is the interface every module satisfies. Only `id` and `name` are required; every hook is optional.

```ts
interface Module {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly dependencies?: readonly string[];
  readonly options?: Readonly<Record<string, unknown>>;

  onInitialize?(context: ModuleContext): void | Promise<void>;
  onReady?(context: ModuleContext): void | Promise<void>;
  onShutdown?(context: ModuleContext): void | Promise<void>;
  onDestroy?(context: ModuleContext): void | Promise<void>;
}
```

> WATCH OUT
>
>
>
> These four names are the only hook names the lifecycle engine looks for. A method called `initialize`, `start`, `stop` or `destroy` is ignored in silence — no warning, no error, it simply never runs.

If you prefer classes, `BaseModule` is an abstract class that implements the interface with empty hooks. Extend it and override only the ones you want.

## Defining a Module

You do not hand the framework a module instance. You hand it a *definition*: an id, a name, and a `factory` function that can build the module when asked.

`defineModule` validates that description and freezes it. It does not call the factory. That happens later, when the runtime loads modules — and again on every restart, so a restarted application gets clean instances instead of reusing stopped ones.

A complete module file:

```ts
import { defineModule } from "@zudojs/core";
import type { Module, ModuleContext } from "@zudojs/core";

function createUsersModule(): Module {
  const users = new Map<string, string>();

  return {
    id: "users",
    name: "Users",
    version: "1.0.0",

    onInitialize(context: ModuleContext) {
      users.set("1", "ada");
      context.logger.info(`${context.name} loaded ${users.size} user(s)`);
    },

    onShutdown() {
      users.clear();
    },
  };
}

export const usersModule = defineModule({
  id: "users",
  name: "Users",
  version: "1.0.0",
  factory: createUsersModule,
});
```

`usersModule` is now a frozen object holding the id, the name and the factory. Nothing has run yet.

The options accepted by `defineModule`:

| Option | What it does | Notes |
| --- | --- | --- |
| `id` | Unique identifier used for lookups and dependencies | Required |
| `name` | Human-readable label used in logs | Required |
| `factory` | Function that builds the module instance | Required; called once per application start |
| `dependencies` | Ids this module needs, as strings or objects | Drives startup order |
| `version`, `metadata` | Semantic version and free-form descriptive data | Optional |
| `options` | Settings passed to the factory | Deep-frozen before use |
| `autoLoad` | Whether the runtime loads it without being asked | Defaults to `true` |

## Registering and Running Modules

Pass your definitions to `createApplication` under `modules`. It builds the container, configuration, logger and runtime, and returns an `Application` you can start and stop.

A complete entry point, using the module file above:

```ts
import { createApplication } from "@zudojs/core";
import { usersModule } from "./users.module.js";

const app = await createApplication({
  modules: [usersModule],
  runtime: { name: "demo", mode: "development" },
});

await app.start();
console.log(app.state);

await app.stop();
console.log(app.state);
```

You should see the logger line `Users loaded 1 user(s)`, then `running`, then `stopped`.

`createApplication` returns a promise, so it needs `await`. Pass `autoStart: true` and it starts before returning, which saves you the separate `app.start()` call.

> TIP
>
>
>
> `app.state` tells you exactly where you are: `created`, `initializing`, `initialized`, `starting`, `running`, `stopping`, `stopped` or `failed`. Log it when a startup problem is hard to pin down.

## Dependencies and Order

List the ids your module needs under `dependencies`. The runtime sorts the modules so that a module's dependencies are always initialized before it, and shut down after it.

```ts
const orders = defineModule({
  id: "orders",
  name: "Orders",
  dependencies: ["users"],
  factory: createOrdersModule,
});
```

A dependency can also be an object, which lets you mark it optional or attach a version constraint: `{ id: "users", optional: true }`. An optional dependency that is missing is skipped instead of failing startup.

The ordering algorithm is exported on its own, so you can see the result without starting anything. This is a complete script:

```ts
import {
  createModuleDependencyGraph,
  resolveModuleStartupOrder,
  resolveModuleShutdownOrder,
} from "@zudojs/core";

const graph = createModuleDependencyGraph([
  { id: "payments", dependencies: ["orders"] },
  { id: "orders", dependencies: ["users"] },
  { id: "users", dependencies: [] },
]);

console.log(resolveModuleStartupOrder(graph));
console.log(resolveModuleShutdownOrder(graph));
```

Output:

```json
[ 'users', 'orders', 'payments' ]
[ 'payments', 'orders', 'users' ]
```

Shutdown is the exact reverse of startup. That is what makes cleanup safe: `payments` is finished with `orders` before `orders` tears anything down.

> DANGER
>
>
>
> If two modules depend on each other, directly or through a chain, there is no valid order and `CircularModuleDependencyError` is thrown. Break the cycle by moving the shared piece into a third module that both depend on.

## The Four Hooks

Each hook receives the module's `ModuleContext` and may return a promise, which the runtime awaits before moving on.

| Hook | When it runs | Put this in it |
| --- | --- | --- |
| `onInitialize` | Initialize step, in dependency order | Open connections, read config, register services |
| `onReady` | Start step, after every module has initialized | Begin listening, start timers, consume queues |
| `onShutdown` | Stop step, in reverse order | Stop accepting new work, drain in-flight work |
| `onDestroy` | Destroy step, last | Close connections, free file handles and memory |

```ts
  START                                 STOP
  users.onInitialize                    payments.onShutdown
  orders.onInitialize                   orders.onShutdown
  payments.onInitialize                 users.onShutdown
  users.onReady                         payments.onDestroy
  orders.onReady                        orders.onDestroy
  payments.onReady                      users.onDestroy
```

The split between `onInitialize` and `onReady` matters. During `onInitialize` other modules may not exist yet. By `onReady` they all do, so that is where cross-module work belongs.

## The Module Context

Every hook is handed a `ModuleContext`. It is deliberately narrow: a module gets capabilities, not a handle on the whole runtime.

| Member | What it gives you | Notes |
| --- | --- | --- |
| `id`, `name`, `version` | This module's own identity | Read-only |
| `options`, `metadata` | Whatever you passed to `defineModule` | Deep-frozen |
| `logger` | A logger already tagged with this module | `info`, `warn`, `error`, and so on |
| `configuration` | The configuration manager | Shared across the application |
| `getConfig(path)` | One config value, or `undefined` | Use `requireConfig` to fail loudly instead |
| `application` | The application context | Container, config snapshot, module registry |
| `hasModule(id)`, `getModuleContext(id)` | Reach a declared dependency | Undeclared ids return `false` / throw |

```ts
onReady(context: ModuleContext) {
  const port = context.getConfig<number>("http.port") ?? 3000;

  if (context.hasModule("users")) {
    context.logger.info(`orders can see users, serving on ${port}`);
  }
}
```

> WATCH OUT
>
>
>
> Reaching for a module you did not declare as a dependency throws `MissingModuleDependencyError`. This is on purpose: a hidden dependency would break the startup order, so the framework refuses to let you create one.

## Common Mistakes

- Naming a hook `start` instead of `onReady`

  The application starts, nothing happens, and there is no error. Rename it to one of the four supported hook names.
- Forgetting `await` on `createApplication`

  You get a promise, and `app.start` is not a function. Add `await`, or use top-level `await` in an ES module.
- Using another module without declaring it

  `MissingModuleDependencyError`. Add the id to `dependencies` so the ordering can account for it.
- Doing cross-module work in `onInitialize`

  The other module may not be loaded yet. Move it to `onReady`, which runs only after every module has initialized.

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the package that exports `defineModule`, `createApplication` and every type on this page.
- [Runtime](https://zudojs.oyinlola.site/docs/architecture-runtime.md) — the state machine that decides when each hook runs.
- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — reach for it when modules need to share objects rather than just ordering.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — the standalone ordering and shutdown engine, useful outside a full application.
- [Dependency Direction](https://zudojs.oyinlola.site/docs/architecture-dependency-direction.md) — the same "point downward" idea applied to packages instead of modules.
