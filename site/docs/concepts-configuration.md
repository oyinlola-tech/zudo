---
title: "Configuration"
description: "Layered configuration system with sources, resolvers, and schema validation. Environment variables, files, memory, and remote config sources with priority ordering."
source: https://zudojs.oyinlola.site/docs/concepts-configuration
---

v1.0.0

# Configuration

Layered configuration with multiple sources and clear precedence.

CONFIG SOURCES ENV

## Overview

*Configuration* is the set of values that change between machines but not between runs: a port, a database URL, a feature flag. Code should not care where they came from.

Zudo collects them from any number of *sources* and merges them into one lookup by dotted path. Ask for "http.port" and you get a number, whether it came from a defaults object, a file, or an environment variable.

Each source has a priority. When two sources define the same path, the higher number wins. That is how "environment overrides defaults" works, with no special cases in your code.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release. The pieces below all come from @zudojs/core.

## Sources and Priority

A source is an object with a name, a type, a priority, and an async load() that returns { path, value } entries. createConfigurationSource builds one from a plain function.

You put sources in a *registry*, hand the registry to a *manager*, and call initialize() once. The manager does the loading and merging. This complete program shows one defaults source being overridden by an environment source.

```ts
import {
  createConfigurationManager,
  createConfigurationRegistry,
  createConfigurationSource,
} from "@zudojs/core";

const registry = createConfigurationRegistry();

registry.registerSource(createConfigurationSource({
  name: "defaults",
  type: "default",
  priority: 0,
  load: async () => [
    { path: "http.port", value: 3000 },
    { path: "http.host", value: "localhost" },
  ],
}));

registry.registerSource(createConfigurationSource({
  name: "env",
  type: "environment",
  priority: 10,
  load: async () => [{ path: "http.port", value: 8080 }],
}));

const configuration = createConfigurationManager({ registry });
await configuration.initialize();

console.log(configuration.get("http.port"));   // 8080  (env wins)
console.log(configuration.get("http.host"));   // "localhost"
```

**What you should see.** 8080, then localhost. The defaults source still supplies the host because nothing overrode it.

| Source field | What it is |
| --- | --- |
| `name` | Unique label; registering the same name twice throws |
| `type` | One of `"default"`, `"environment"`, `"file"`, `"secret"`, `"remote"`, `"runtime"`, `"custom"` |
| `priority` | Higher wins on conflict; defaults to `0` |
| `load()` | Async function returning `{ path, value }` entries |

configuration.reload() runs every load() again. If the new values fail validation, the previous configuration is kept and the error is thrown — a bad reload cannot leave the app half-configured.

## Reading Values

There are two ways to ask, and the difference is what happens when a value is missing.

| Call | Missing value | Use it for |
| --- | --- | --- |
| `get(path)` | Returns `undefined` | Optional settings with a sensible fallback |
| `require(path)` | Throws `ConfigurationMissingError` | Anything the app cannot run without |

Prefer require for essentials. Failing at startup with a clear message beats an undefined reaching a database driver ten minutes later.

getConfiguration() returns the merged snapshot, which has a few extra readers. This continues from the previous example.

```ts
// Continues the example above.
const snapshot = configuration.getConfiguration();

console.log(snapshot.getNumber("http.port"));        // 8080
console.log(snapshot.getString("http.host"));        // "localhost"
console.log(snapshot.has("http.tls"));               // false
console.log(snapshot.getSource("http.port"));        // "environment"
console.log(snapshot.scope("http").get("port"));    // 8080

configuration.require("http.tls");   // throws ConfigurationMissingError
```

**What you should see.** 8080, localhost, false, environment, 8080 — and then the program stops on the throw. getSource is useful when you are wondering which source actually won.

## Inside an Application

Pass the manager to createApplication as configuration. It is initialized for you if you have not done it yourself, and every module hook can then read values straight off its context.

```ts
import {
  createApplication, defineModule,
  createConfigurationManager, createConfigurationRegistry, createConfigurationSource,
} from "@zudojs/core";
import type { Module } from "@zudojs/core";

const registry = createConfigurationRegistry();
registry.registerSource(createConfigurationSource({
  name: "defaults",
  type: "default",
  priority: 0,
  load: async () => [{ path: "http.port", value: 3000 }],
}));

const server = defineModule({
  id: "server",
  name: "Server",
  factory: (): Module => ({
    id: "server",
    name: "Server",
    onInitialize: (context) => {
      console.log(context.requireConfig("http.port"));   // 3000
      console.log(context.getConfig("http.tls"));         // undefined
    },
  }),
});

const app = await createApplication({
  modules: [server],
  configuration: createConfigurationManager({ registry }),
  logger: { level: "warn" },
});

await app.start();
await app.shutdown();
```

**What you should see.** 3000, then undefined.

Read configuration in onInitialize, not in the factory. The factory runs while the application is still being wired.

## Schemas and Defaults

A *schema* declares what a path should look like: whether it is required, what its default is, and optionally a validator. Register schemas and initialize() checks them before anything else runs.

```ts
import {
  createConfigurationManager,
  createConfigurationSchema,
  createConfigurationSchemaRegistry,
} from "@zudojs/core";

const schemas = createConfigurationSchemaRegistry();
schemas.register(createConfigurationSchema({
  path: "cache.ttl",
  required: false,
  defaultValue: 60,
}));

const configuration = createConfigurationManager({ schemas });
await configuration.initialize();

console.log(configuration.get("cache.ttl"));                          // 60
console.log(configuration.getConfiguration().getSource("cache.ttl"));   // "default"
```

**What you should see.** 60, then default — no source supplied the value, so the schema's default filled it in.

Change required to true and drop the default, and initialize() throws ConfigurationValidationError listing every path that is missing. That is a much better failure than a service that boots and then misbehaves.

## Secrets in Output

Configuration usually holds passwords and tokens, and the easiest way to leak one is to print the whole config while debugging. A *redactor* replaces values whose key looks sensitive.

```ts
import { createConfiguration, redactConfiguration } from "@zudojs/core";

const configuration = createConfiguration({
  values: { db: { host: "localhost", password: "hunter2" } },
});

console.log(redactConfiguration(configuration));
// { db: { host: "localhost", password: "[REDACTED]" } }
```

**What you should see.** The host untouched and the password replaced by [REDACTED]. Node prefixes the printed object with [Object: null prototype], which is just how it renders a prototype-less object.

Keys such as password, secret, token, privateKey and connectionString are covered by default. Lookalikes like tokenizer are left alone.

The manager applies the same masking to configuration error messages, so a source that fails while loading a database URL will not print the password in its stack trace.

## Common Mistakes

- **Reading before initialize().** Nothing has been loaded yet, so every get is undefined. Await initialize(), or let createApplication do it.
- **Expecting a lower-priority source to win.** Higher priority always overrides. Give defaults 0 and environment values something larger.
- **Registering two sources with the same name.** registerSource throws. Names identify a source; priority decides who wins.
- **Using get for something essential.** You get undefined and a confusing crash later. Use require, or a required schema.
- **Logging the raw configuration.** Secrets go straight into your log aggregator. Log redactConfiguration(configuration) instead.

## Related

- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for the manager, registry, sources, schemas and configuration errors.
- [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md) — ready-made environment, file and secret sources so you do not write load() by hand.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — where getConfig and requireConfig are used.
- [Application](https://zudojs.oyinlola.site/docs/concepts.md) — how the manager is handed to createApplication.
