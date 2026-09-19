---
title: "Core Concepts"
description: "Understand the fundamental building blocks of the Zudo framework — application architecture, configuration, contexts, dependency injection, lifecycle, and modules."
source: https://zudojs.oyinlola.site/docs/concepts
---

v1.0.0

# Core Concepts

The foundational concepts that power every Zudo application.

CONCEPTS FOUNDATION PRINCIPLES

## Overview

An *application* is the object that owns everything else in Zudo. You hand it a list of modules, it wires up the pieces they need, and it starts and stops them in the right order.

You build one with createApplication from @zudojs/core. Nothing runs yet at that point. The application only does work when you call start(), and it winds everything back down when you call stop() or shutdown().

Behind that one call sit five smaller ideas: modules, dependency injection, lifecycle, contexts, and configuration. Each has its own page. This page shows how they meet.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## A Complete Application

This is a whole working program. It defines one module, builds an application around it, starts it, and shuts it down. Save it as app.ts and run npx tsx app.ts.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const users = defineModule({
  id: "users",
  name: "Users",
  factory: (): Module => ({
    id: "users",
    name: "Users",
    onInitialize: () => { console.log("users: ready"); },
    onShutdown: () => { console.log("users: closing"); },
  }),
});

const app = await createApplication({
  modules: [users],
  runtime: { name: "my-service", mode: "development" },
  logger: { level: "warn" },
});

console.log(app.state);   // "initialized"
await app.start();
console.log(app.state);   // "running"
await app.shutdown();
console.log(app.state);   // "stopped"
```

**What you should see.** Four lines: initialized, then users: ready and running, then users: closing and stopped. The logger: { level: "warn" } option keeps the framework's own progress lines out of the way; drop it and you also get one JSON line per framework step.

Read that example in three parts. defineModule describes a unit of your app. createApplication collects those descriptions and prepares everything. start() is the moment your code actually runs.

> **Watch out**
>
> createApplication returns a promise, so it always needs await. There is no createApp export.

## What You Pass In

Every option is optional. await createApplication() with no arguments is a valid, empty application.

| Option | What it does | Default |
| --- | --- | --- |
| `modules` | Module definitions from `defineModule` | `[]` |
| `participants` | Start/stop hooks that are not modules, such as an HTTP server | `[]` |
| `runtime` | Service `name`, `mode`, timeouts, OS signal handling | `{}` |
| `configuration` | Your own `ConfigurationManager`; it is initialized for you | Empty one |
| `container` | Your own dependency `Container` | Empty one |
| `logger` | A `Logger`, or options for the built-in `ConsoleLogger` | JSON, level `info` |
| `autoStart` | Call `start()` before returning | `false` |

## Application States

app.state tells you where the application is. It moves through these values and never skips a step.

```ts
created → initializing → initialized → starting → running
running → stopping → stopped → (starting → running again)
any failure → failed
```

stop() takes the modules down but leaves the application reusable: calling start() again builds fresh module instances. shutdown() stops and then releases everything, and the application cannot start again afterwards.

Calling start() while already running does nothing. Calling it from failed throws InvalidStateError.

> **Tip**
>
> In tests, use runtime: { mode: "test" } and logger: { level: "fatal" } so the runtime stays quiet and does not install OS signal handlers you did not ask for.

## The Five Pieces Inside

An application is not one big object. It is five small ones that each solve a single problem. Follow any card for a full explanation.

[### Modules

One feature of your app, with an id, a name, and optional hooks. Modules declare which other modules must be ready first.

Explore →](https://zudojs.oyinlola.site/docs/concepts-modules.md) [### Dependency Injection

A container you register values in under a named key, so code can ask for a thing instead of building it.

Explore →](https://zudojs.oyinlola.site/docs/concepts-dependency-injection.md) [### Lifecycle

The fixed order in which things start and stop, so a database is open before anything queries it and closed only after.

Explore →](https://zudojs.oyinlola.site/docs/concepts-lifecycle.md) [### Contexts

A read-only record of "what is happening right now" that any function can read without it being passed down as an argument.

Explore →](https://zudojs.oyinlola.site/docs/concepts-contexts.md) [### Configuration

Settings gathered from several sources into one lookup by dotted path, with higher-priority sources winning.

Explore →](https://zudojs.oyinlola.site/docs/concepts-configuration.md) [### Architecture

How the packages are layered and which direction dependencies are allowed to point.

Explore →](https://zudojs.oyinlola.site/docs/architecture.md)

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for createApplication, defineModule, the runtime and its options.
- [Your First App](https://zudojs.oyinlola.site/docs/getting-started-first-app.md) — a longer walkthrough that builds a real service step by step.
- [@zudojs/container](https://zudojs.oyinlola.site/docs/packages-container.md) — the standalone container with constructor injection and disposal.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — dependency-ordered startup with timeouts and retries, for resources that are not modules.
