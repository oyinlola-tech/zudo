---
title: "Modules"
description: "Composable units of functionality with dependency management, registration, and lifecycle integration for Zudo applications."
source: https://zudojs.oyinlola.site/docs/concepts-modules
---

v1.0.0

# Modules

Primary building blocks with explicit boundaries and dependency contracts.

MODULES BOUNDARIES CONTRACTS

## Overview

A *module* is one feature of your application packaged as a plain object. It has an id, a name, and optional hooks the framework calls when the application starts and stops.

Modules exist so a growing codebase stays navigable. Billing code lives in the billing module, users code in the users module, and each one says out loud which other modules it needs before it can work.

You never construct a module yourself. You write a *definition* with defineModule, hand it to the application, and the framework builds the module from your factory at start time.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release. Modules live in @zudojs/core.

## Defining a Module

defineModule takes an id, a name, and a factory function that returns the module object. The definition is registered once; the factory runs on every start, so a restart always gets a fresh instance.

This is a complete program. It defines one module that opens and closes a pretend connection, then runs the application through a full start and shutdown.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const database = defineModule({
  id: "database",
  name: "Database",
  factory: (): Module => {
    let connected = false;

    return {
      id: "database",
      name: "Database",
      onInitialize: () => { connected = true; console.log("database open"); },
      onDestroy: () => { connected = false; console.log("database closed"); },
    };
  },
});

const app = await createApplication({ modules: [database], logger: { level: "warn" } });
await app.start();
await app.shutdown();
```

**What you should see.** Two lines: database open at start, then database closed at shutdown.

Prefer classes? Extend BaseModule and pass factory: () => new MyModule(). The definition options are the same either way.

| Option | What it does | Required |
| --- | --- | --- |
| `id` | Unique key other modules depend on. No leading or trailing spaces. | Yes |
| `name` | Human-readable label used in logs and errors | Yes |
| `factory` | Function returning the module object | Yes |
| `dependencies` | Ids that must be ready first, as strings or `{ id, optional }` | No |
| `options` | Frozen settings handed to the factory and readable as `context.options` | No |
| `version`, `metadata` | Descriptive only; not used for ordering | No |
| `autoLoad` | Set `false` to load only when another module requires it | No |

## The Four Hooks

A *hook* is a method the framework calls for you at a known moment. A module may implement any of these four, or none. These are the only names that are ever called.

| Hook | When it runs | Typical work |
| --- | --- | --- |
| `onInitialize(context)` | On start, dependencies first | Open connections, read config |
| `onReady(context)` | After every module has initialized | Begin listening or polling |
| `onShutdown(context)` | On stop, dependents first | Stop accepting new work |
| `onDestroy(context)` | After every module has shut down | Close connections, clear timers |

Each hook may return a promise, and the framework waits for it. Use onInitialize for anything a dependent module needs, and onReady for anything that should only happen once the whole app is up.

> **Watch out**
>
> Methods named setup, initialize, start or stop on a module are silently ignored. Nothing errors — your code just never runs.

## Dependencies and Order

List the ids a module needs in dependencies. The framework sorts modules so those ids are initialized first, no matter what order you passed them in.

Declaring a dependency also grants access: a module may only reach modules it declared, through context.getModuleContext(id). Here orders depends on users and reads its name.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const users = defineModule({
  id: "users",
  name: "Users",
  factory: (): Module => ({ id: "users", name: "Users" }),
});

const orders = defineModule({
  id: "orders",
  name: "Orders",
  dependencies: ["users"],
  factory: (): Module => ({
    id: "orders",
    name: "Orders",
    dependencies: ["users"],
    onInitialize: (context) => {
      console.log(context.getModuleContext("users")?.name);   // "Users"
      console.log(context.hasModule("billing"));            // false (not declared)
    },
  }),
});

// Listing order does not matter; users still initializes first.
const app = await createApplication({
  modules: [orders, users],
  logger: { level: "warn" },
});
await app.start();
await app.shutdown();
```

**What you should see.** Users, then false.

Two failures are worth knowing. A dependency you never registered makes start() throw MissingModuleDependencyError. Two modules depending on each other throw CircularModuleDependencyError.

Shutdown runs the other way round: dependents stop before the modules they rely on, so nothing is torn down while something still needs it.

## The Module Context

Every hook receives a ModuleContext. It is the module's controlled window onto the rest of the application — deliberately narrow, so a module cannot reach anything it did not ask for.

| Member | What it gives you |
| --- | --- |
| `id`, `name`, `options` | This module's identity and the frozen `options` from its definition |
| `logger` | A logger that tags every line with this module's id |
| `getConfig(path)` | A configuration value by dotted path, or `undefined` |
| `requireConfig(path)` | The same, but throws `ConfigurationMissingError` when absent |
| `getModuleContext(id)` | A declared dependency's context; undeclared ids throw |
| `hasModule(id)` | Whether a declared dependency is loaded; undeclared ids give `false` |
| `application` | The shared `ApplicationContext`: container, configuration, module registry, logger |

> **Tip**
>
> Keep modules small. One module, one feature boundary. If two modules constantly reach into each other, they are probably one module.

## Common Mistakes

- **Writing a setup(container) method.** Nothing calls it, so your registrations never happen. Move the work into onInitialize(context).
- **Returning the module object directly instead of a factory.** defineModule throws InvalidModuleDefinitionError without a factory function. Wrap it: factory: () => myModule.
- **Reaching an undeclared module.** getModuleContext("billing") throws MissingModuleDependencyError unless "billing" is in dependencies. Add it.
- **Opening connections in the factory.** The factory runs during wiring, before ordering is applied. Do that work in onInitialize instead.
- **Giving two modules the same id.** Registration throws DuplicateModuleError. Ids are the identity — make them unique.

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for defineModule, the module registry, loader and every module error.
- [Lifecycle](https://zudojs.oyinlola.site/docs/concepts-lifecycle.md) — the exact order hooks run in, and what happens when one throws.
- [Configuration](https://zudojs.oyinlola.site/docs/concepts-configuration.md) — where context.getConfig reads from.
- [Application](https://zudojs.oyinlola.site/docs/concepts.md) — how modules are handed to createApplication.
