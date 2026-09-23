# @zudojs/config

Layered configuration management with multiple sources, priority-based
merging, schema validation, and sensitive-value redaction.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-config](https://zudojs.oyinlola.site/docs/packages-config) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-config.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

A source that declares no priority gets `DEFAULT_CONFIG_SOURCE_PRIORITY`
(`-1`), which is strictly below the priority `initialValues` is seeded
at (`0`), so an undeclared source layers UNDER the values a manager was
seeded with. Declare `priority: 0` (or higher) on the source when it
should override them.

Sources are deduplicated by name — the first occurrence of a name wins,
both when they are passed to the constructor and through `addSource()`
(which rejects a duplicate outright).

- `createDefaultsConfigSource(values, name?)` — low-priority defaults.
- `createMemoryConfigSource(values, { name, priority?, optional? })` —
  in-memory values.
- `createEnvironmentConfigSource({ prefix, env?, priority?, keyMapper?, isSensitive? })`
  — reads environment variables. Values stay RAW STRINGS (use the typed
  accessors to coerce, so `"false"` becomes `false` instead of a truthy
  string). Names matching `isSensitiveConfigKey` are reported as
  sensitive and therefore redacted by `toSafeObject()`.
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

Whatever the source, the loader also marks an entry sensitive when
`isSensitiveConfigEntry(key, value)` flags it: a key naming a password,
secret, token, API/private key, credential, DSN, database URL or `*_key`
(in any dotted segment, case-insensitive), a nested object containing such
a key, or a URL with embedded `user:password@` credentials. Returning
`false` from `isSensitive` or omitting `sensitiveKeys` cannot un-mark these.

## Typed access

`ConfigManager` (and the underlying `ConfigResolver`) offer typed
getters: `string()`, `number()`, `boolean()`, `bigint()`, `date()`,
`object()`, `array()`, `get()`, `required()`, and `scoped(prefix)` for
prefix-scoped access.

```typescript
const db = manager.scoped("db");
db.string("host", "localhost");
```

`required<T>(key)` does NOT convert: `T` is an unchecked cast, so with
`DB__PORT=5432`, `scoped("db").required<number>("port")` returns the
string `"5432"`. Use the typed variants, which parse and check the value
and throw when it is missing or does not parse: `requiredString()`,
`requiredNumber()`, `requiredBoolean()` and `requiredDate()` (on the
manager, the resolver and scoped resolvers).

```typescript
const db = manager.scoped("db");
db.requiredNumber("port"); // 5432 (a number)
```

`store.getByPrefix(prefix)` and `store.getObjectByPrefix(prefix)` accept
the prefix with or without a trailing dot: `"db"` and `"db."` both select
`db.host` and `db.port` (and not `dbx`).

Passing a fallback narrows the return type: `manager.number("app.port")`
is `number | undefined`, while `manager.number("app.port", 3000)` is
`number`. The same holds for every typed getter and for `get(key,
fallback)`, whose literal fallback is widened (`get("mode", "dev")` is
`string`, not `"dev"`).

`number()` accepts decimal notation only: `"0x1F90"`, `"0b11"` and `"0o17"`
are rejected rather than silently becoming 8080, 3 and 15.

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

Environment variables are always strings, so string input is coerced
before the type check when a schema's type is `NUMBER` or `BOOLEAN` (and
does not also accept `STRING`). Parsing is strict: `"8080"` becomes
`8080`, while `"80a"`, `"0x1F90"` and `""` are still rejected as
`TYPE_MISMATCH`. Booleans follow the `boolean()` convention: `true` /
`false`, `1` / `0`, `yes` / `no`, `y` / `n`, `on` / `off`. `validate` and
`transform` receive the coerced value. Set `coerce: false` on a schema to
require a real number or boolean.

```typescript
// PORT=8080 DEBUG=true
const { port, debug } = manager.validate<{ port: number; debug: boolean }>({
  properties: {
    port: { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
    debug: { type: ConfigValueType.BOOLEAN },
  },
});
```

`resolve(key, schema)` types its schema per value type
(`TypedConfigSchema`), so the constraints the validator enforces are
accepted: `{ type: NUMBER, min: 1 }`, `{ type: STRING, minLength: 1 }`,
`{ type: ARRAY, minItems: 1 }`. A constraint that belongs to another type
(`{ type: NUMBER, minLength: 1 }`) is a compile error.

Validation runs in this order: coerce, type check, constraints,
`transform`, then `validate` on the final (transformed) value. A string
that does not have the schema's type is handed to `transform` as a
parser, and its output must then have the type and pass the constraints:

```typescript
manager.resolve("hosts", {
  type: ConfigValueType.ARRAY,
  minItems: 1,
  transform: (value) => String(value).split(",").map((s) => s.trim()),
}); // HOSTS="a, b" -> ["a", "b"]
```

A non-string of the wrong type is rejected without calling `transform`.

Object schemas nest: a property schema of type `OBJECT` that declares
its own `properties` / `additionalProperties` is validated recursively,
so nested constraints are enforced by `validate()`, `resolve()` and the
standalone `validateConfigValue`.

`validate()` throws on failure and marks entries whose schema has
`secret: true` as sensitive, at any depth: a secret declared inside a
nested object schema, or as a dotted key such as `"db.password"`, marks
the store entry that holds it (for a nested `db` object, the whole `db`
entry is redacted). Individual values can be validated with
`manager.resolve(key, schema)` or the standalone
`validateConfigValue` / `validateConfigObject` functions.

## Redaction

- `manager.toObject()` / `store.toObject()` return RAW values,
  including secrets.
- `manager.toSafeObject()` / `store.toSafeObject()` replace sensitive
  values with `"[REDACTED]"` — use these for logging and diagnostics.
- An entry is marked sensitive automatically by `ConfigStore.set()`, so
  the same key is redacted however it was written: from a source, from
  `initialValues`, from `set()` / `setMany()` / `replace()`, or from
  `manager.set()`. Detection is `isSensitiveConfigEntry` — the key name
  (`password`, `secret`, `token`, `*_key`, `auth`, `dsn`,
  `database_url`, …) or a value that is a URL with embedded
  `user:password@` credentials. Pass `sensitive: false` explicitly to
  opt a key out.

## Reloading

`manager.reload()` re-runs all sources. Values set at runtime via
`manager.set()` and `initialValues` survive loads; sources only
overwrite entries at equal or higher priority, and a source that
declares no priority ranks below both. A reload rebuilds every
source-provided value from scratch, so a value a source no longer
provides disappears (letting a lower-priority default show through), and
the store is only updated once every source has loaded — a failing
source leaves the previous configuration intact. An entry that was
sensitive before a reload stays sensitive.

## Untrusted input

Configuration frequently originates from files, environment variables
or remote services. Keys such as `__proto__`, `constructor` and
`prototype` are copied with `Object.defineProperty`, never plain
assignment, so a hostile key becomes an ordinary own property and can
never replace an object's prototype (this includes
`toConfigJsonValue` and `configValueToString`). Schema properties are read as OWN
properties, so a schema property named `constructor` is reported as
missing rather than matching an inherited function.

## Use Cases

- Application configuration
- Environment-specific settings (dev, staging, prod)
- Feature flags and toggles
- Secrets handling with redacted diagnostics
