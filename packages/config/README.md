# @zudojs/config

Layered configuration management with multiple sources, priority-based
merging, schema validation, and sensitive-value redaction.

## Installation

```bash
npm install @zudojs/config
```

## Quick Start

```typescript
import {
  createConfigManager,
  createDefaultsConfigSource,
  createMemoryConfigSource,
} from "@zudojs/config";

const manager = createConfigManager({
  sources: [
    createDefaultsConfigSource({ "app.port": 3000, "app.name": "demo" }),
    createMemoryConfigSource(
      { "app.port": 8080 },
      { name: "overrides", priority: 100 },
    ),
  ],
});

await manager.load();

manager.number("app.port"); // 8080 (higher priority wins)
manager.string("app.name"); // "demo"
```

Or create and load in one step:

```typescript
import { initializeConfigManager } from "@zudojs/config";

const manager = await initializeConfigManager({
  initialValues: { "app.env": "development" },
});
```

With `autoLoad: true` the manager starts loading on construction;
await `manager.ready()` before reading values.

## Sources

A source provides values plus a priority. Higher priority wins; equal
priorities are applied in registration order (last registered wins).

- `createDefaultsConfigSource(values, name?)` — low-priority defaults.
- `createMemoryConfigSource(values, { name, priority?, optional? })` —
  in-memory values.
- `createEnvironmentConfigSource({ prefix, env?, priority?, keyMapper?, isSensitive? })`
  — reads environment variables. Values stay RAW STRINGS (use the typed
  accessors to coerce, so `"false"` becomes `false` instead of a truthy
  string). Names matching a password/token/secret/API-key pattern are
  reported as sensitive and therefore redacted by `toSafeObject()`.
- `createCustomConfigSource(name, loader, options?)` — async loader
  function returning `{ values, source, type }`. Include
  `sensitiveKeys: ["some.key"]` in the result to mark values as
  sensitive so they are redacted by safe serialization.

```typescript
import {
  createEnvironmentConfigSource,
  createCustomConfigSource,
  ConfigSourceType,
} from "@zudojs/config";

// APP__DB__HOST=localhost -> "db.host"
const env = createEnvironmentConfigSource({ prefix: "APP__" });

const remote = createCustomConfigSource("vault", async () => ({
  values: { "db.password": "s3cret" },
  sensitiveKeys: ["db.password"],
  source: "vault",
  type: ConfigSourceType.CUSTOM,
}));
```

## Typed access

`ConfigManager` (and the underlying `ConfigResolver`) offer typed
getters: `string()`, `number()`, `boolean()`, `bigint()`, `date()`,
`object()`, `array()`, `get()`, `required()`, and `scoped(prefix)` for
prefix-scoped access.

```typescript
const db = manager.scoped("db");
db.string("host", "localhost");
```

## Schema validation

Schemas are plain objects validated by this package (no external
validation library is used):

```typescript
import { ConfigValueType } from "@zudojs/config";

const config = manager.validate({
  properties: {
    "app.port": { type: ConfigValueType.NUMBER, required: true },
    "db.password": { type: ConfigValueType.STRING, secret: true },
  },
  additionalProperties: true,
});
```

Object schemas nest: a property schema of type `OBJECT` that declares
its own `properties` / `additionalProperties` is validated recursively,
so nested constraints are enforced by `validate()`, `resolve()` and the
standalone `validateConfigValue`.

`validate()` throws on failure and marks entries whose schema has
`secret: true` as sensitive. Individual values can be validated with
`manager.resolve(key, schema)` or the standalone
`validateConfigValue` / `validateConfigObject` functions.

## Redaction

- `manager.toObject()` / `store.toObject()` return RAW values,
  including secrets.
- `manager.toSafeObject()` / `store.toSafeObject()` replace sensitive
  values with `"[REDACTED]"` — use these for logging and diagnostics.

## Reloading

`manager.reload()` re-runs all sources. Values set at runtime via
`manager.set()` and `initialValues` survive loads; sources only
overwrite entries at equal or higher priority.

## Untrusted input

Configuration frequently originates from files, environment variables
or remote services. Keys such as `__proto__`, `constructor` and
`prototype` are copied with `Object.defineProperty`, never plain
assignment, so a hostile key becomes an ordinary own property and can
never replace an object's prototype. Schema properties are read as OWN
properties, so a schema property named `constructor` is reported as
missing rather than matching an inherited function.

## Use Cases

- Application configuration
- Environment-specific settings (dev, staging, prod)
- Feature flags and toggles
- Secrets handling with redacted diagnostics
