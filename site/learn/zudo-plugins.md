---
title: "Plugins — ZudoJS Academy"
description: "Extend the Task API through a fixed interface without editing it: plugin lifecycle, dependencies, scoped context, rollback and diagnostics with @zudojs/plugins."
source: https://zudojs.oyinlola.site/learn/zudo-plugins
---

LEVEL 14 · LESSON 17 OF 18

Platform Advanced

# Plugins

Extend the Task API through a fixed interface without editing it: plugin lifecycle, dependencies, scoped context, rollback and diagnostics with @zudojs/plugins.

- **45 min** to read and try
- **You need:** The Task API project and the runtime lesson
- **You build:** A Task API with an audit-log plugin and a reminder plugin, plus a plugin package ready for npm

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write a plugin as metadata plus lifecycle hooks and register it with a PluginManager
- Declare required and optional dependencies with version ranges
- Use a plugin's scoped context to clean up timers and subscriptions on shutdown
- Read diagnostics after a failed start rolls itself back
- Wire plugins to the host's event bus without exposing host metadata to them
- Package and publish a plugin to npm with @zudojs/plugins as a peer dependency

## Why plugins

Your customers keep asking for extras: post to Slack when a task is done, keep an audit log, send reminders. If each extra is a change to the Task API itself, the core grows forever, and every customer runs code for features they do not use. A **plugin** is a piece of code that adds a feature to an application through a fixed interface, without changing the application. The application that loads plugins is called the **host**.

You already know **modules** from [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime). The difference is who writes the code and who decides to load it:

- A module is part of your application. It is always there.
- A plugin is optional. It may come from another team or from npm, and each installation decides which plugins it loads.

Terminal on your computer

```bash
$ npm install @zudojs/plugins

added 1 package, and audited 76 packages in 4s
…
```

The examples use Node.js features, so run them on your computer with `npx tsx src/<file>.ts`.

## Your first plugin

A plugin is an object with `metadata` (at least a `name`) and up to five **lifecycle hooks**, all optional. A `PluginManager` registers plugins and runs their hooks in the right order:

first.tsNode.js only

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

const auditLog: Plugin = {
  metadata: { name: "audit-log", version: "1.0.0" },
  install: () => console.log("install: check settings, register things"),
  initialize: () => console.log("initialize: prepare, every plugin is installed now"),
  start: (context) => console.log("start: begin work, as", context.plugin.name),
  stop: () => console.log("stop: finish work in progress"),
  dispose: () => console.log("dispose: release everything"),
};

const manager = new PluginManager();
manager.register(auditLog);

const context = createPluginContext({ name: "task-api", version: "0.1.0" });
await manager.start(context);
console.log("running:", manager.has("audit-log"));
await manager.stop(context);
```

Output of `npx tsx first.ts`

```ts
install: check settings, register things
initialize: prepare, every plugin is installed now
start: begin work, as audit-log
running: true
stop: finish work in progress
dispose: release everything
```

`manager.start` runs `install`, `initialize` and `start`. `manager.stop` runs `stop` and `dispose`. Each phase finishes for *all* plugins before the next phase begins. `createPluginContext`'s first argument is metadata, and its second is the services you offer plugins: a `logger`, `config`, a `container` and `events`. Only those services reach plugins. The manager builds its own context per plugin and substitutes each plugin's own metadata for `context.plugin`, so the `{ name: "task-api", version: "0.1.0" }` above only satisfies the function's required first argument — no plugin ever sees it. A plugin has no way to learn the host's name or version through the context.

## Dependencies and versions

A Slack plugin needs a notifications plugin that knows how to send messages. It declares that with `dependencies`, and a **version range** like the ones in `package.json`: `^1.0.0` means "1.0.0 or any later 1.x". The manager starts dependencies first and stops them last:

dependencies.tsNode.js only

```ts
import { createPluginContext, PluginDependencyError, PluginDependencyVersionError, PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

function plugin(name: string, version: string, needs: Plugin["dependencies"] = []): Plugin {
  return {
    metadata: { name, version },
    dependencies: needs,
    start: () => console.log("start", name),
    stop: () => console.log("stop ", name),
  };
}

const manager = new PluginManager();
manager.register(plugin("slack", "1.0.0", [{ name: "notifications", version: "^1.2.0" }]));
manager.register(plugin("notifications", "1.4.0"));
const context = createPluginContext({ name: "task-api" });
await manager.start(context);
await manager.stop(context);

for (const available of [undefined, "2.0.0"]) {
  const broken = new PluginManager();
  broken.register(plugin("slack", "1.0.0", [{ name: "notifications", version: "^1.2.0" }]));
  if (available) broken.register(plugin("notifications", available));
  try {
    await broken.start(createPluginContext({ name: "task-api" }));
  } catch (error) {
    if (error instanceof PluginDependencyError || error instanceof PluginDependencyVersionError) {
      console.log(error.name, "-", error.message);
    }
  }
}
```

Output of `npx tsx dependencies.ts`

```ts
start notifications
start slack
stop  slack
stop  notifications
PluginDependencyError - Plugin "slack" depends on "notifications" which is not registered.
PluginDependencyVersionError - Plugin "slack" requires "notifications@^1.2.0", but version 2.0.0 is registered. Register a "notifications" that satisfies ^1.2.0, relax the constraint on "slack", or construct the manager with { checkVersions: false }.
```

Slack was registered first, but notifications started first, because Slack depends on it. On shutdown the order is reversed. Both problems are found **before any hook runs**: a missing plugin, and a notifications 2.0.0 that does not satisfy `^1.2.0`, because a new major version may have changed its interface.

Some dependencies are nice to have. Slack can post without the notifications plugin, only less nicely. List those under `optionalDependencies`: when the plugin is there, it starts first; when it is missing, nothing fails:

optional.tsNode.js only

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

const slack: Plugin = {
  metadata: { name: "slack", version: "1.0.0" },
  optionalDependencies: [{ name: "notifications", version: "^1.2.0" }],
  start: () => console.log("start slack"),
};

const manager = new PluginManager();
manager.register(slack);
await manager.start(createPluginContext({ name: "task-api" }));
```

Output of `npx tsx optional.ts`

```ts
start slack
```

> optional: true also works, but say it with optionalDependencies
>
> The dependency type also has an `optional` field, so `dependencies: [{ name: "notifications", optional: true }]` behaves exactly like listing it under `optionalDependencies`: a missing `notifications` does not throw, and a present one still starts before the plugin that names it. Prefer `optionalDependencies` anyway — it says which dependencies your plugin can live without at a glance, instead of making every reader check each entry's flags.

## The scoped plugin context

A plugin often creates things that must be cleaned up: timers, connections, subscriptions. The manager gives each plugin its **own scoped view** of the context:

- `context.onDispose(fn)` and `context.registerDisposable(obj)` add to *this plugin's* cleanup list, which runs when the plugin is disposed, newest first.
- `context.signal` is an `AbortSignal` that fires when the plugin system shuts down, to cancel slow work such as a `fetch`.
- `register(plugin, options)` hands the options to `install(context, options)`. That is how an installation configures a plugin.

reminders.tsNode.js only

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

interface ReminderOptions {
  readonly everyMs: number;
}

export function createReminderPlugin(): Plugin<ReminderOptions> {
  let everyMs = 0;
  return {
    metadata: { name: "reminders", version: "1.0.0" },
    install(_context, options) {
      if (!Number.isInteger(options.everyMs) || options.everyMs < 10) throw new Error("everyMs must be an integer >= 10");
      everyMs = options.everyMs;
    },
    start(context) {
      const timer = setInterval(() => console.log("reminder: 2 tasks are due today"), everyMs);
      context.onDispose(() => {
        clearInterval(timer);
        console.log("reminders: timer cleared");
      });
      context.signal.addEventListener("abort", () => console.log("reminders: shutdown signal"));
    },
  };
}

const manager = new PluginManager();
manager.register(createReminderPlugin(), { everyMs: 40 });
const context = createPluginContext({ name: "task-api" });
await manager.start(context);
await new Promise((resolve) => setTimeout(resolve, 100));
await manager.stop(context);
console.log("host exits cleanly");
```

Output of `npx tsx reminders.ts`

```ts
reminder: 2 tasks are due today
reminder: 2 tasks are due today
reminders: shutdown signal
reminders: timer cleared
host exits cleanly
```

The timer fired twice in 100 ms, and then `stop` released it. Without the cleanup, the interval would keep the process alive forever and keep printing after the plugin was "stopped". The plugin also checks its options in `install`: settings from outside are input like any other, and a wrong value should stop the start-up, not cause strange behaviour later.

## Failed starts, rollback and diagnostics

What if the Slack plugin cannot reach Slack while the Task API starts? Half-started plugins are dangerous: some timers run, some connections are open, and nothing will ever stop them. So when any hook of `manager.start` throws, the manager **rolls back**: it stops and disposes every plugin it had already brought up, then throws the error to you:

REASON IT OUT

### Slack's start hook throws. What should happen to audit-log, which already started?

audit-log started first because slack depends on it. Slack's `start` then throws. Three options: (1) leave audit-log running and only fail slack, (2) crash the whole Task API process, (3) stop and dispose every plugin that got as far as running, then report the error. Which would you pick, and why?

**Show the reasoning**

Option 3 is what the manager does. Leaving audit-log running (1) is the dangerous choice: the Task API never finished starting, so nothing is watching audit-log's timers or connections, yet they keep running and leaking until the process exits. Crashing the whole process (2) is safe but heavy-handed for a problem in one optional feature, and it throws away audit-log's clean shutdown along with slack's failure. Rolling back (3) gets the safety of (2) — nothing keeps running unsupervised — without needing to kill the process: every plugin that actually finished starting gets a real `stop` and `dispose`, in reverse order, exactly as if you had called `manager.stop` yourself, and only then does the original error reach your code. Slack itself never reached a running state, so it only needs `dispose`, which is why the output below shows audit-log fully stopped while slack goes straight to disposed.

rollback.tsNode.js only

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";

const manager = new PluginManager({ hookTimeout: 1000 });
manager.register({
  metadata: { name: "audit-log", version: "1.0.0" },
  start: (context) => context.onDispose(() => console.log("audit-log: file closed")),
  stop: () => console.log("audit-log: stopped"),
});
manager.register({
  metadata: { name: "slack", version: "1.0.0" },
  dependencies: [{ name: "audit-log" }],
  start: () => {
    throw new Error("cannot reach slack.com");
  },
});

try {
  await manager.start(createPluginContext({ name: "task-api" }));
} catch (error) {
  console.log("start failed:", error instanceof Error ? error.message : error);
}

const report = manager.diagnostics();
console.log(`total ${report.total}, healthy ${report.healthy}, failed ${report.failed}`);
for (const entry of report.plugins) {
  console.log(entry.plugin.name, entry.state, entry.health.status, entry.health.details ?? "");
}
```

Output of `npx tsx rollback.ts`

```ts
audit-log: stopped
audit-log: file closed
start failed: cannot reach slack.com
total 2, healthy 0, failed 1
audit-log disposed degraded
slack disposed unhealthy cannot reach slack.com
```

- The audit log had started, so it was stopped and its cleanup ran. Nothing is left running.
- `diagnostics()` reports every plugin's state and health. The failed plugin keeps its error message in `health.details`, so a health endpoint or a log line can say *why*.
- `hookTimeout` fails a hook that takes longer than the limit, so one hanging plugin cannot freeze the start-up of the whole Task API.

A disposed plugin cannot be started again: calling `manager.start` a second time throws a `PluginStateError`. To retry, create a new manager with fresh plugin objects.

## Put it together: plugins for the Task API

Plugins need a way to react to what the Task API does. The host offers that through `context.events`. Pass it the event bus you built in [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events). The plugin system adapts it for plugins: a plugin calls `on(name, handler)` and its handler receives the event's `payload`. The bus also catches errors, so a broken plugin handler cannot break the request that published the event. (This works since @zudojs/plugins 1.3.0. The adapter is exported as `toPluginEvents`, if you need it yourself.)

The audit-log plugin subscribes when it starts, and unsubscribes in its cleanup list. It only uses what the context gives it, so it works in any host that offers `events` and a `logger`:

src/plugins/audit-log.plugin.tsNode.js only

```ts
import type { Plugin } from "@zudojs/plugins";

export interface TaskCompleted {
  readonly taskId: number;
  readonly userId: string;
}

export function createAuditLogPlugin(): Plugin {
  return {
    metadata: { name: "audit-log", version: "1.0.0", capabilities: ["events"] },
    start(context) {
      const onCompleted = (event: unknown) => {
        const { taskId, userId } = event as TaskCompleted;
        context.logger?.info("audit: task completed", { taskId, userId });
      };
      context.events?.on("task.completed", onCompleted);
      context.onDispose(() => context.events?.off("task.completed", onCompleted));
    },
  };
}
```

The host builds the context with its logger and the bus, loads the plugins, and publishes `task.completed` whenever a task is done. The Slack plugin needs a secret webhook address, which comes from an environment variable. When it is missing, the host logs a warning and starts without Slack, instead of failing or putting a secret in the code:

src/plugins/load.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import { createAuditLogPlugin } from "./audit-log.plugin.js";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});
const events = createEventBus();
events.on("plugin:started", (event) => {
  const { plugin } = event.payload as { plugin: { name: string; version?: string } };
  logger.info("plugin started", { name: plugin.name, version: plugin.version });
});

const manager = new PluginManager({ allowedCapabilities: ["events"], hookTimeout: 5000, logger });
manager.register(createAuditLogPlugin());

const webhook = process.env["SLACK_WEBHOOK_URL"];
if (webhook) {
  logger.info("slack plugin would be registered here");
} else {
  logger.warn("SLACK_WEBHOOK_URL is not set, running without the slack plugin");
}

const context = createPluginContext({ name: "task-api", version: "0.1.0" }, { logger, events });
await manager.start(context);

const done = await events.publishEvent({ type: "task.completed", payload: { taskId: 7, userId: "ada" } });
console.log("task 7:", done.handlerCount, "handler, failed:", done.failed);
console.log("diagnostics:", manager.diagnostics().healthy, "healthy");

await manager.stop(context);
const after = await events.publishEvent({ type: "task.completed", payload: { taskId: 8, userId: "ada" } });
console.log("task 8 after stop:", after.handlerCount, "handlers");
```

Output of `npx tsx src/plugins/load.ts`

```json
[WARN] [task-api] SLACK_WEBHOOK_URL is not set, running without the slack plugin
[INFO] [task-api] plugin started name=audit-log version=1.0.0
[INFO] [task-api] audit: task completed taskId=7 userId=ada
task 7: 1 handler, failed: 0
diagnostics: 1 healthy
task 8 after stop: 0 handlers
```

The plugin manager itself publishes `plugin:started` (and `plugin:stopped`, and more) on the same bus, which is where the "plugin started" line comes from. After `stop`, the audit log's cleanup list unsubscribed its handler, so task 8 reached nobody. If a plugin handler throws, `failed` counts it and `errors` holds the error for your log; the other handlers still run.

The host only knows the plugin interface. You could add a Slack, a statistics or a reminder plugin without touching this code, except for the one `register` line. And `allowedCapabilities` refuses to register a plugin that asks for more than the host grants.

> A PLUGIN RUNS WITH ALL THE POWER OF YOUR APP
>
> Plugins are ordinary JavaScript in your process: a plugin can read every environment variable, open any file and send your data anywhere. `capabilities` is a declaration that the manager checks against your allow-list. It catches mistakes, but it is not a sandbox, and it cannot stop hostile code. Only install plugins you trust, pin their versions, and review what they do, exactly as with any other npm dependency.

## Publishing a plugin

To share a plugin, publish it as an npm package. A few conventions make it easy to use:

- Export a **factory function**, like `createAuditLogPlugin()`, not a ready-made object. Every host, and every test, gets fresh state.
- Put `@zudojs/plugins` in **`peerDependencies`**, not in `dependencies`. A peer dependency says "the host must provide this". If each plugin installed its own copy, the host would end up with several copies, and classes like `PluginDependencyError` from one copy would fail an `instanceof` check against another. Also list it in `devDependencies`, so you can build and test.
- Import only **types** from `@zudojs/plugins` where you can (`import type`). Then the plugin works with whatever copy the host has.
- Ship compiled JavaScript and type declarations, and add the keyword `zudojs-plugin` so people can find it.

Start a new folder for the package, run `npm init -y`, then `npm install -D @zudojs/plugins typescript`, and edit `package.json` until it looks like this:

package.json

```json
{
  "name": "@acme/zudo-plugin-audit-log",
  "version": "1.0.0",
  "description": "Logs every completed task of a ZudoJS Task API.",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "keywords": [
    "zudojs",
    "zudojs-plugin",
    "audit"
  ],
  "scripts": {
    "build": "tsc"
  },
  "peerDependencies": {
    "@zudojs/plugins": "^1.2.0"
  },
  "devDependencies": {
    "@zudojs/plugins": "^1.3.0",
    "typescript": "^7.0.2"
  }
}
```

Copy `audit-log.plugin.ts` to `src/index.ts`. This `tsconfig.json` compiles `src` into `dist` and writes the `.d.ts` type files next to the JavaScript:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": []
  },
  "include": ["src"]
}
```

Build it. Before you publish, `npm pack --dry-run` shows exactly which files would be uploaded:

Terminal on your computer

```bash
$ npm run build

> @acme/zudo-plugin-audit-log@1.0.0 build
> tsc

$ npm pack --dry-run
npm notice
npm notice package: @acme/zudo-plugin-audit-log@1.0.0
npm notice Tarball Contents
npm notice 79B README.md
npm notice 196B dist/index.d.ts
npm notice 529B dist/index.js
npm notice 566B package.json
npm notice Tarball Details
npm notice name: @acme/zudo-plugin-audit-log
npm notice version: 1.0.0
npm notice filename: acme-zudo-plugin-audit-log-1.0.0.tgz
npm notice package size: 754 B
npm notice unpacked size: 1.4 kB
npm notice shasum: d0a9da502d45b919d2af4d873693bef1bb6e3047
npm notice integrity: sha512-IUF9tRPkgZ0cI[...]yFAz/fY6muE6w==
npm notice total files: 4
npm notice
acme-zudo-plugin-audit-log-1.0.0.tgz
```

Four files: the compiled code, its types, the `package.json` and a README. Your `src` folder, `node_modules` and any `.env` file stay at home, because `"files": ["dist"]` lists what to ship (npm always adds the README and `package.json`). Then `npm publish --access public` uploads it (you need an npm account, and `@acme` must be your scope). A host installs it with `npm install @acme/zudo-plugin-audit-log` and registers `createAuditLogPlugin()`.

## Practice

TRY IT YOURSELF

### A statistics plugin

Write `createStatsPlugin()`: it counts `task.completed` events per user and, in `stop`, logs the counts with `context.logger`. Remember to unsubscribe in the cleanup list.

**Show a solution**

src/plugins/stats.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";

function createStatsPlugin(): Plugin {
  const perUser = new Map<string, number>();
  return {
    metadata: { name: "stats", version: "1.0.0" },
    start(context) {
      const onCompleted = (event: unknown) => {
        const { userId } = event as { userId: string };
        perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      };
      context.events?.on("task.completed", onCompleted);
      context.onDispose(() => context.events?.off("task.completed", onCompleted));
    },
    stop(context) {
      context.logger?.info("tasks completed per user", Object.fromEntries(perUser));
    },
  };
}

const events = createEventBus();
const logger = { info: console.log, warn: console.log, error: console.log };
const manager = new PluginManager();
manager.register(createStatsPlugin());
const context = createPluginContext({ name: "task-api" }, { events, logger });
await manager.start(context);
for (const userId of ["ada", "linus", "ada"]) {
  await events.publishEvent({ type: "task.completed", payload: { taskId: 1, userId } });
}
await manager.stop(context);
```

Output of `npx tsx src/plugins/stats.ts`

```ts
tasks completed per user { ada: 2, linus: 1 }
```

TRY IT YOURSELF

### Which order?

Plugins: `api` depends on `db` and `cache`, `cache` depends on `db`. They are registered as `api`, `cache`, `db`. In which order do they start, and in which order do they stop? What happens if `db` also declares a dependency on `api`?

**Show a solution**

Start: `db`, `cache`, `api`: every plugin starts after everything it depends on. Stop: the reverse, `api`, `cache`, `db`. If `db` depended on `api`, there would be a cycle (`api` → `db` → `api`) with no valid order. `manager.start` throws a `PluginDependencyCycleError` that names the cycle, before any hook runs.

## Recap

- A plugin adds an optional feature to a host through a fixed interface: metadata plus the hooks `install`, `initialize`, `start`, `stop` and `dispose`.
- `PluginManager` checks dependencies and version ranges before any hook runs, starts in dependency order and stops in reverse. Nice-to-have plugins go in `optionalDependencies`.
- Pass the event bus from @zudojs/events as `events`: plugin handlers receive the payload, and a throwing handler cannot break the publisher.
- Each plugin gets a scoped context: its own cleanup list, an abort signal and the host's services. Options passed to `register` reach `install`. Validate them.
- A failed start rolls back everything already started. `diagnostics()` reports state and health.
- Plugins are trusted code. Capabilities catch mistakes but are not a sandbox.
- Publish plugins as factory functions, with `@zudojs/plugins` as a peer dependency.

Plugins are trusted code you choose to load. Next, [adapters](https://zudojs.oyinlola.site/learn/zudo-adapters) put an external provider, such as a payment gateway, behind a contract your business logic depends on instead of the provider's own SDK.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
