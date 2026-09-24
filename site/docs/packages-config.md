---
title: "@zudojs/config — Layered Configuration System"
description: "@zudojs/config reference: layered configuration with sources, stores, resolvers, schema validation and lifecycle management for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-config
---

v1.3.1

# @zudojs/config

Layered configuration system for Zudo — environment variables, in-memory and custom (e.g. remote) sources, runtime overrides, type-safe schemas, and sensitive value redaction

CONFIGURATION ENV VARS REDACTION

## OVERVIEW

@zudojs/config provides a complete, layered configuration system for Zudo applications. It handles loading configuration from multiple sources (environment variables, files, memory, remote), storing values in a reactive in-memory store, resolving typed values with schema validation, and managing the full configuration lifecycle.

```ts
// The configuration pipeline
Source → Store → Resolver → Manager

// Sources load raw key-value pairs
// Store holds entries with metadata
// Resolver provides typed, validated access
// Manager orchestrates the full lifecycle
```

### Multi-Source Loading

Load from environment, files, memory, or remote sources with priority-based resolution.

### Type-Safe Access

Typed resolver methods for string, number, boolean, date, object, and array values.

### Schema Validation

Define schemas with types, constraints, defaults, and custom validators.

### Lifecycle Management

State machine: CREATED → LOADING → READY → RELOADING → FAILED → DISPOSED.

## INSTALLATION

```ts
// npm
npm install @zudojs/config

// pnpm
pnpm add @zudojs/config

// yarn
yarn add @zudojs/config
```

> **Dependency:** @zudojs/config 1.3.1 depends on @zudojs/errors 1.3.0 and @zudojs/constants 1.1.2 (exact versions, installed for you). It uses ConfigurationError and related error factories from @zudojs/errors.

## ARCHITECTURE

The config package follows a layered architecture where each layer has a single responsibility:

```ts
// Layered architecture
configFactory    // Convenience facade
    ↓
configManager    // Lifecycle orchestration
    ├── configLoader     // Loads sources into store
    │     └── configSource  // Source abstractions + factories
    ├── configStore      // In-memory key-value with events
    │     └── configEntry   // Typed entry with metadata
    └── configResolver   // Typed access + validation
          ├── configSchema    // Schema types + validation
          ├── ScopedResolver  // Prefix-scoped sub-resolver
          └── accessors       // Standalone typed accessors
```

> **Design Principle:** Each layer depends only on layers below it. The factory depends on the manager, which depends on loader/store/resolver. The resolver depends on the store and schema. This ensures clean separation of concerns.

## QUICK START

### Create and Load Configuration

```ts
import { createConfigManager } from '@zudojs/config';

const manager = createConfigManager({
  initialValues: {
    'app.name': 'My App',
    'app.port': 3000,
    'app.debug': true,
    'db.host': 'localhost',
    'db.port': 5432,
  }
});

await manager.load();

// Type-safe access
const name = manager.string('app.name');       // 'My App'
const port = manager.number('app.port');       // 3000
const debug = manager.boolean('app.debug');   // true
```

### Using ConfigFactory (Shorthand)

```ts
import { configFactory, ConfigValueType } from '@zudojs/config';

const manager = await configFactory.initialize({
  initialValues: {
    'app.name': 'My App',
    'app.port': 3000,
  }
});

// Or create a validated configuration. `validated` takes the object
// schema itself — its `properties` map — not a wrapper with a `schema` key.
// Options go in the second argument; without values, the required
// 'app.name' is missing and validated() throws ConfigManagerValidationError.
const { manager: validatedManager, config } = await configFactory.validated(
  {
    properties: {
      'app.name': { type: ConfigValueType.STRING, required: true },
      'app.port': { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
    },
  },
  { initialValues: { 'app.name': 'My App', 'app.port': 3000 } },
);
```

**Use the `ConfigValueType` enum for `type`.** A bare string literal such as `type: 'string'` widens to `string` in a plain object and will not satisfy `ConfigSchema`. `ConfigValueType.STRING` is the value `"string"`, so the runtime shape is identical — it just keeps the literal type intact.

### Scoped Resolvers

```ts
const db = manager.scoped('db');

// All keys are automatically prefixed
const host = db.string('host');     // reads 'db.host'
const port = db.number('port');     // reads 'db.port'
const name = db.string('name');     // reads 'db.name'

// Typed required accessors parse, check and throw (on scoped resolvers since v1.3.0)
const dbPort = db.requiredNumber('port');  // DB__PORT=5432 gives 5432 (a number)
```

## CONFIG VALUE

The foundation types and utilities for configuration values.

### Types

```ts
// Primitives that can be config values
type ConfigPrimitive = string | number | boolean | bigint | null | undefined;

// JSON-compatible recursive type
type ConfigJsonValue = string | number | boolean | null
  | ConfigJsonValue[] | { [key: string]: ConfigJsonValue };

// Full config value (includes Date and recursive structures)
type ConfigValue = ConfigPrimitive | Date
  | ConfigValue[] | { [key: string]: ConfigValue };
```

### Type Guards

```ts
import { isConfigPrimitive, isConfigObject, isConfigValue } from '@zudojs/config';

isConfigPrimitive('hello');  // true
isConfigPrimitive(42);       // true
isConfigPrimitive([]);       // false

isConfigObject({ a: 1 });   // true
isConfigObject([1, 2]);     // false (arrays are not objects)
isConfigObject(new Date()); // false

isConfigValue('hello');     // true
isConfigValue({ a: [1, 2] }); // true (recursive)
```

### Parsers

```ts
import {
  parseConfigString, parseConfigBoolean,
  parseConfigNumber, parseConfigDate
} from '@zudojs/config';

parseConfigBoolean('true');   // true
parseConfigBoolean('yes');    // true
parseConfigBoolean('1');      // true
parseConfigBoolean('no');     // false

parseConfigNumber('42');      // 42
parseConfigNumber('3.14');    // 3.14

parseConfigDate('2026-01-01'); // Date object
```

### Utilities

```ts
import { freezeConfigValue, cloneConfigValue, configValuesEqual } from '@zudojs/config';

const frozen = freezeConfigValue({ nested: { value: 42 } });
// Deep freeze — all levels are immutable

const cloned = cloneConfigValue(frozen);
// Deep clone — Date objects are cloned via new Date()

configValuesEqual({ a: 1 }, { a: 1 }); // true
configValuesEqual({ a: 1 }, { a: 2 }); // false
```

## CONFIG ENTRY

Configuration entries wrap values with provenance metadata — tracking where each value came from, its priority, and whether it's sensitive.

Keys and values are screened (`isSensitiveConfigEntry`): password/secret/token/api-key/private-key/credential/auth/dsn/database-url/connection-string/`*_key` names in any segment, nested objects containing them, and URLs with `user:password@` are marked sensitive and redacted.

> **Changed in v1.2.0 — screening now covers every write path.** Detection runs inside `ConfigStore.set()`, so a key such as `db.password`, `api_key` or a `postgres://user:pw@host` connection string is marked sensitive however it was written: from a source, from `initialValues`, from `set()` / `setMany()` / `replace()`, or from `manager.set()`. Before v1.2.0 only values arriving *through a source* were screened, so `toSafeObject()` printed the identical key in clear when it had been seeded or set at runtime. If you relied on that, pass `sensitive: false` explicitly to opt a key out.

### Interface

```ts
interface ConfigEntry<T extends ConfigValue = ConfigValue> {
  readonly key: string;
  readonly value: T;
  readonly source: string;
  readonly sourceType: ConfigSourceType;
  readonly priority: number;
  readonly sensitive: boolean;
  readonly resolved: boolean;
  readonly createdAt: number;  // epoch milliseconds, not a Date
}
```

### Functions

```ts
import {
  createConfigEntry, isConfigEntry,
  toSafeConfigEntry, serializeConfigEntry,
  sortConfigEntries, ConfigSourceType
} from '@zudojs/config';

const entry = createConfigEntry({
  key: 'db.password',
  value: 'secret123',
  source: 'environment',
  sourceType: ConfigSourceType.ENVIRONMENT,
  priority: 100,
  sensitive: true,
});

isConfigEntry(entry);          // true
toSafeConfigEntry(entry);     // value: '[REDACTED]'
serializeConfigEntry(entry);  // plain object (redacted)
```

## CONFIG SOURCE

Sources are the entry point for configuration data. They load key-value pairs from various origins.

### Source Types

```ts
enum ConfigSourceType {
  DEFAULTS    = 'defaults',     // createDefaultsConfigSource, priority -1000
  ENVIRONMENT = 'environment',  // createEnvironmentConfigSource (process.env)
  FILE        = 'file',         // type tag only — no built-in file loader; use createCustomConfigSource
  MEMORY      = 'memory',       // createMemoryConfigSource
  REMOTE      = 'remote',       // type tag for custom remote loaders
  CUSTOM      = 'custom',       // createCustomConfigSource
}
```

### Priority

Higher priority wins. Equal priorities are applied in registration order, so the last registered overwrites the earlier one. Only `createDefaultsConfigSource` (`-1000`) and `createEnvironmentConfigSource` (`100`) pick a priority for you; every other factory falls back to `DEFAULT_CONFIG_SOURCE_PRIORITY`.

| Layer | Priority |
| --- | --- |
| createDefaultsConfigSource | -1000 |
| A source that declares no `priority` | `DEFAULT_CONFIG_SOURCE_PRIORITY` = -1 |
| `initialValues` and other baseline store writes | 0 |
| createEnvironmentConfigSource | 100 |

> **Changed in v1.2.0 — an undeclared source now ranks at `-1`, not `0`.** `DEFAULT_CONFIG_SOURCE_PRIORITY` is newly exported and is strictly below the `0` that `initialValues` is seeded at. Both defaulted to `0` before, and because a source overwrites on *equal* priority, any source created without one silently wiped a manager's `initialValues` during `load()`. Sources that declare `priority: 0` or above still override them, as documented. If you relied on an undeclared source beating another source that declares `priority: 0`, declare a priority on it — that pair has swapped order.

### Creating Sources

```ts
import { readFile } from 'node:fs/promises';
import {
  createMemoryConfigSource,
  createDefaultsConfigSource,
  createEnvironmentConfigSource,
  createCustomConfigSource,
  createConfigSource,
  ConfigSourceType
} from '@zudojs/config';

// In-memory source — declares no priority, so it lands at -1
// The second argument is required and must carry a name.
const memSource = createMemoryConfigSource({
  'app.name': 'My App',
  'app.port': 3000,
}, { name: 'memory' });

// Defaults source (lowest priority)
const defaults = createDefaultsConfigSource({
  'app.port': 8080,
  'app.debug': false,
});

// Custom async source
const remote = createCustomConfigSource('remote', async (ctx) => {
  const res = await fetch('https://api.example.com/config');
  const data = (await res.json()) as Record<string, string>; // json() is typed unknown
  return { values: data, source: 'remote', type: ConfigSourceType.CUSTOM };
});

// Environment variables
const envSource = createEnvironmentConfigSource();

// JSON file — there is no built-in file loader, so write one
const fileSource = createCustomConfigSource('file', async () => ({
  values: JSON.parse(await readFile('config.json', 'utf8')),
  source: 'file',
  type: ConfigSourceType.FILE,
}));
```

`envSource` and `fileSource` are the sources the loader and manager examples below use.

### Loading Sources

```ts
import { loadConfigSources } from '@zudojs/config';

// Load multiple sources in priority order
const results = await loadConfigSources([defaults, memSource, remote], {
  environment: 'production',
  namespace: 'myapp',
});
```

## CONFIG STORE

The central in-memory key-value store backed by a Map. Supports change events, snapshots, and prefix-based queries.

### Creating a Store

```ts
import { createConfigStore } from '@zudojs/config';

const store = createConfigStore({
  initialValues: {
    'app.name': 'My App',
    'app.port': 3000,
  },
  freeze: true,  // Deep freeze all values
});
```

### Reading and Writing

```ts
store.has('app.name');           // true
store.get('app.name');            // 'My App'
store.getOrDefault('missing', 42);  // 42

store.set('app.debug', true);
store.setMany({ 'a': 1, 'b': 2 });
store.delete('app.debug');

// Get all entries with metadata
const entries = store.getEntries();
const keys = store.keys();          // ['app.name', 'app.port']
const obj = store.toObject();      // { 'app.name': 'My App', ... }
```

### Redaction on Write

Since v1.2.0 `set()` classifies the entry as it writes it, so a secret is marked sensitive whichever door it came in by — not only when a source supplied it. `toObject()` always returns RAW values; use `toSafeObject()` for anything you log or print.

```ts
store.set('db.password', 's3cret');
store.set('db.url', 'postgres://user:pw@host/db');
store.set('app.port', 3000);

store.toObject();
// { 'db.password': 's3cret', 'db.url': 'postgres://user:pw@host/db', 'app.port': 3000 }

store.toSafeObject();
// { 'db.password': '[REDACTED]', 'db.url': '[REDACTED]', 'app.port': 3000 }
// Before v1.2.0 both secrets printed in clear here: they were set(), not loaded.

// Opt a key out explicitly.
store.set('api_key_name', 'billing', { sensitive: false });
```

### Prefix Queries

```ts
// Get all entries with a given prefix
// 'db' and 'db.' select the same entries (a trailing dot is ignored since v1.3.0;
// before, 'db.' matched nothing and returned [] and {}).
const dbEntries = store.getByPrefix('db');

// Get values as an object with prefix stripped
const dbConfig = store.getObjectByPrefix('db');
// { host: 'localhost', port: 5432 }  (not 'db.host', 'db.port')
```

### Change Events

```ts
const unsubscribe = store.subscribe((event) => {
  console.log(`Changed: ${event.key}`);
  // previous and current are whole ConfigEntry objects (or undefined), not values.
  console.log(`Previous: ${String(event.previous?.value)}`);
  console.log(`Current: ${String(event.current?.value)}`);
});

store.set('app.port', 4000);  // Fires listener
unsubscribe();                // Stop listening
```

### Snapshot and Replace

```ts
// Create an immutable copy
const snapshot = store.snapshot();

// Replace all values (deletes keys not in new values)
store.replace({
  'app.name': 'New App',
  'app.port': 8080,
});
```

## CONFIG RESOLVER

Type-safe value resolution from the store with automatic parsing, schema validation, and scoped access.

### Creating a Resolver

```ts
import { createConfigResolver } from '@zudojs/config';

const resolver = createConfigResolver(store, {
  strict: false,       // Don't throw on invalid types
  allowUndefined: true, // Return undefined for missing keys
  clone: true,         // Clone values on read
});
```

### Typed Accessors

```ts
// String (always returns string or undefined)
resolver.string('app.name');            // 'My App'
resolver.string('missing', 'default');  // 'default'
resolver.requiredString('app.name');    // throws if missing

// Number (auto-parses from string)
resolver.number('app.port');             // 3000
resolver.number('env.port', 8080);       // 8080 if missing; typed number

// Boolean (parses "true"/"1"/"yes"/"y"/"on")
resolver.boolean('app.debug');           // true

// Date (parses ISO strings)
resolver.date('app.created');            // Date object

// Object and Array
resolver.object<DbConfig>('db');       // typed object
resolver.array<string>('app.tags');    // typed array

// Raw value with a fallback: the literal is widened, so this is a string
const mode: string = resolver.get('app.mode', 'dev');
```

> **Changed in v1.3.0 — a fallback narrows the return type.** Called with a fallback, every typed accessor — `string`, `number`, `boolean`, `bigint`, `date`, `object`, `array`, on the resolver, the manager and a scoped resolver — returns `T` instead of `T | undefined`, so `const port: number = resolver.number('env.port', 8080)` compiles under strict `tsc`. Calls without a fallback keep `T | undefined`. The new `get(key, fallback)` overload returns the stored value, or the fallback when the key is missing; its literal fallback is widened through `ConfigWiden<T>`, so `get('mode', 'dev')` is typed `string`, not `'dev'`. Note that `get()` does no parsing: it returns whatever is stored, so an environment value is still a string there.

### Schema Validation

```ts
import { ConfigValueType } from '@zudojs/config';
import type { ConfigNumberSchema } from '@zudojs/config';

// resolve() takes a TypedConfigSchema, keyed on `type`: a NUMBER schema accepts
// min/max/integer/positive, and { type: NUMBER, minLength: 1 } is a compile error.
const port = resolver.resolve('app.port', { type: ConfigValueType.NUMBER, min: 1, max: 65535 });

// A named schema still works, typed with the matching interface.
const portSchema: ConfigNumberSchema = {
  type: ConfigValueType.NUMBER,
  min: 1,
  max: 65535,
  integer: true,
};

// Full diagnostic result
const result = resolver.resolveResult('app.port', portSchema);
// { key: 'app.port', value: 3000, found: true, valid: true, issues: [] }
```

### Scoped Resolver

```ts
// Create a sub-resolver with a key prefix
const db = resolver.scoped('database');

db.string('host');     // reads 'database.host'
db.number('port');     // reads 'database.port'
db.string('name');     // reads 'database.name'

// Nested scoping
const dbPool = db.scoped('pool');
dbPool.number('maxSize'); // reads 'database.pool.maxSize'
```

### Standalone Value Parsers

These take a raw value — typically a string straight from `process.env` — and return it coerced, or `undefined` when the input is `undefined`. They do not read from a store and they do not apply defaults; that is the resolver's job. Use them when you have a value in hand and only need the coercion rules.

```ts
import { parseConfigString, parseConfigNumber, parseConfigBoolean } from '@zudojs/config';

const name = parseConfigString(process.env.APP_NAME);   // string | undefined
const port = parseConfigNumber(process.env.PORT);       // number | undefined
const debug = parseConfigBoolean(process.env.DEBUG);    // boolean | undefined

// Supply your own default with ?? — the parsers never invent one.
const resolvedPort = port ?? 3000;
```

`parseConfigBigInt` and `parseConfigDate` follow the same shape.

**They never throw.** An input that cannot be coerced comes back as `undefined`, exactly like a missing one — `parseConfigNumber("abc")` is `undefined`, not `NaN` and not an error. That means `parseConfigNumber(process.env.PORT) ?? 3000` silently falls back to `3000` when `PORT=abc`. If a malformed value should stop startup instead, check for `undefined` yourself, or use `ConfigResolver`, which reports failures as `ConfigResolutionError`. `parseConfigNumber` (and the resolver's `number()`) accepts decimal notation only; hex, binary and octal are rejected. `parseConfigBoolean` accepts `true/1/yes/y/on` and `false/0/no/n/off` case-insensitively; anything else is `undefined`.

## CONFIG SCHEMA

Schema validation for configuration values with type checking, constraints, defaults, and custom validators.

### Schema Types

```ts
enum ConfigValueType {
  STRING  = 'string',
  NUMBER  = 'number',
  BOOLEAN = 'boolean',
  BIGINT  = 'bigint',
  DATE    = 'date',
  OBJECT  = 'object',
  ARRAY   = 'array',
  NULL    = 'null',
  ANY     = 'any',
}
```

### Schema Interfaces

```ts
// Base schema
interface ConfigSchema<T extends ConfigValue = ConfigValue> {
  type: ConfigValueType | readonly ConfigValueType[];  // every field is readonly
  required?: boolean;
  nullable?: boolean;
  default?: T | (() => T);
  description?: string;
  secret?: boolean;  // honoured at any depth; the store entry holding it is redacted whole
  coerce?: boolean;  // default true: parse a string for NUMBER/BOOLEAN before the type check
  validate?: (value: T, context: ConfigValidationContext) => boolean | string | ConfigValidationIssue | readonly ConfigValidationIssue[];
  transform?: (value: ConfigValue, context: ConfigValidationContext) => T;
}

// String schema
interface ConfigStringSchema extends ConfigSchema<string> {
  type: ConfigValueType.STRING;
  minLength?: number;
  maxLength?: number;
  pattern?: string | RegExp;
  enum?: readonly string[];
}

// Number schema
interface ConfigNumberSchema extends ConfigSchema<number> {
  type: ConfigValueType.NUMBER;
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
}
```

Since v1.3.0 the constraint groups are exported on their own as `ConfigStringConstraints`, `ConfigNumberConstraints`, `ConfigArrayConstraints` and `ConfigObjectConstraints`, and `ConfigStringSchema` / `ConfigNumberSchema` are built from them with the same fields as before. `TypedConfigSchema<T>` is the union keyed on `type` that `resolve()` and `resolveResult()` accept, so each value type takes exactly the constraints the validator enforces.

### Order of Checks

A value goes through five steps, in this order: **coerce → type check → constraints → `transform` → `validate`**. `validate` therefore sees the final value, matching its `(value: T)` signature. Before v1.3.0 `validate` ran before `transform` and saw the raw input.

- **Coerce.** A string is parsed first when the schema's type includes `NUMBER` or `BOOLEAN` and does not also accept `STRING` or `ANY`. Numbers are parsed strictly in decimal (`"8080"` passes; `"80a"`, `"0x1F90"` and `""` stay `TYPE_MISMATCH`). Booleans use `true/false`, `1/0`, `yes/no`, `y/n`, `on/off`, case-insensitively. Set `coerce: false` on the schema to require a real number or boolean.
- **Transform as a parser.** A string that does not have the schema's type is handed to `transform`, and the output must then have the type and pass the constraints. A non-string of the wrong type is rejected without calling `transform`.

```ts
import { validateConfigValue, ConfigValueType } from '@zudojs/config';

validateConfigValue('8080', { type: ConfigValueType.NUMBER }).value;   // 8080
validateConfigValue('yes', { type: ConfigValueType.BOOLEAN }).value;   // true
validateConfigValue('80a', { type: ConfigValueType.NUMBER }).valid;    // false (TYPE_MISMATCH)
validateConfigValue('8080', { type: ConfigValueType.NUMBER, coerce: false }).valid; // false

// transform parses a string that does not have the type; validate sees the result
validateConfigValue('a,b', {
  type: ConfigValueType.ARRAY,
  transform: (s) => String(s).split(','),
}).value;                                                              // ['a', 'b']
validateConfigValue('1F90', {
  type: ConfigValueType.NUMBER,
  transform: (s) => parseInt(String(s), 16),
  validate: (port) => port > 1024,
}).value;                                                              // 8080
```

### Validation

```ts
import { validateConfigObject, assertValidConfig, ConfigValueType } from '@zudojs/config';
import type { ConfigObjectSchema } from '@zudojs/config';

const schema: ConfigObjectSchema = {
  type: ConfigValueType.OBJECT,
  properties: {
    'app.name': { type: ConfigValueType.STRING, required: true, minLength: 1 },
    'app.port': { type: ConfigValueType.NUMBER, min: 1, max: 65535, integer: true },
    'app.debug': { type: ConfigValueType.BOOLEAN, default: false },
  }
};

const result = validateConfigObject(configValues, schema);
// { valid: true, value: {...}, issues: [] }

// Or throw on validation failure
assertValidConfig(configValues, schema);
// Throws ConfigSchemaValidationError if invalid
```

### Validation Error

```ts
import { assertValidConfig, ConfigSchemaValidationError } from '@zudojs/config';

try {
  assertValidConfig(values, schema);
} catch (error) {
  if (error instanceof ConfigSchemaValidationError) {
    console.log(error.issues);
    // [{ path: '$.app.port', message: 'Value must be greater than or equal to 1.',
    //    code: 'MIN', severity: 'error' }]
  }
}
```

The manager's own error carries the same issue objects. Since v1.3.1 `ConfigManagerValidationError.issues` is typed `readonly ConfigValidationIssue[]`, so you read `path`, `code` and `message` without a cast (it was `readonly unknown[]` before):

```ts
import { configFactory, ConfigManagerValidationError, ConfigValueType } from '@zudojs/config';

try {
  await configFactory.validated(
    {
      properties: {
        'app.name': { type: ConfigValueType.STRING, required: true },
        'app.port': { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
      },
    },
    { initialValues: { 'app.port': 0 } },
  );
} catch (error) {
  if (error instanceof ConfigManagerValidationError) {
    for (const issue of error.issues) console.log(issue.path, issue.code, issue.message);
  }
}
// $.app.name REQUIRED Configuration value at "$.app.name" is required.
// $.app.port MIN Value must be greater than or equal to 1.
```

## CONFIG LOADER

Orchestrates loading configuration from multiple sources into the store with priority-based resolution.

### Creating a Loader

```ts
import { createConfigLoader } from '@zudojs/config';

const loader = createConfigLoader({
  sources: [defaultsSource, envSource, fileSource],
  context: { environment: 'production' },
  freeze: true,
  onSourceLoaded: (source, result) => {
    console.log(`Loaded ${Object.keys(result.values).length} values from ${source.name}`);
  },
  onSourceError: (source, error) => {
    // error is typed unknown
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load ${source.name}: ${message}`);
  },
});
```

### Loading

```ts
// Load all sources
const result = await loader.load();
// { store, entries, sources, loadedAt }

// Reload from scratch
await loader.reload();

// Load specific sources only
await loader.loadSources([envSource]);
```

Reload rebuilds source values atomically; values a source stopped providing are removed.

### Managing Sources

```ts
loader.addSource(newSource);
loader.removeSource('remote');
const src = loader.getSource('environment');
```

Sources are deduplicated by name, first occurrence wins. Since v1.2.0 that also applies to the `sources` array passed to `createConfigLoader` — the same rule `addSource()` and `loadConfigSources()` already enforced. Before v1.2.0 a duplicate name in the constructor array was loaded twice, with the *last* one winning, the opposite of every other path.

### One-Shot Loading

```ts
import { loadConfiguration } from '@zudojs/config';

// Create, load, and dispose in one call
const result = await loadConfiguration(sources, {
  context: { environment: 'production' },
});
```

## CONFIG MANAGER

The central orchestration class that coordinates the loader, store, and resolver with a lifecycle state machine.

### Lifecycle States

```ts
enum ConfigManagerState {
  CREATED    = 'created',     // Initial state
  LOADING    = 'loading',     // Loading from sources
  READY      = 'ready',       // Configuration available
  RELOADING  = 'reloading',   // Reloading from sources
  FAILED     = 'failed',      // Load failed
  DISPOSED   = 'disposed',    // Manager disposed
}
```

### Creating a Manager

```ts
import { createConfigManager, initializeConfigManager } from '@zudojs/config';

// Create without loading
const manager = createConfigManager({
  sources: [envSource, fileSource],
  initialValues: { 'app.name': 'My App' },
  freeze: true,
  strict: false,
});

// Create and load in one step
const loadedManager = await initializeConfigManager({
  sources: [envSource],
  initialValues: { 'app.port': 3000 },
});
```

### Lifecycle Methods

```ts
await manager.load();      // CREATED → LOADING → READY
await manager.reload();    // READY → RELOADING → READY
manager.getState();        // 'ready' (ConfigManagerState.READY)
manager.isReady;           // true
manager.isLoading;         // false
```

### Typed Access (Same as Resolver)

```ts
manager.string('app.name');
manager.number('app.port');
manager.boolean('app.debug');
manager.required<string>('app.name');
manager.object<DbConfig>('db');
manager.array<string>('app.tags');
manager.scoped('db');

// Typed required accessors (on the manager since v1.3.0): parse, check, throw.
manager.requiredNumber('app.port');
manager.requiredString('app.name');
manager.requiredBoolean('app.debug');
manager.requiredDate('app.created');
```

**`required<T>()` is a cast, not a parse.** It returns the stored value unchanged and only tells the compiler it is a `T`, because `T` is erased at run time and cannot be checked. With `DB__PORT=5432` from the environment, `manager.required<number>('db.port')` returns the *string* `"5432"` typed as `number`. Use `requiredNumber()` / `requiredBoolean()` / `requiredString()` / `requiredDate()` instead — on the manager, the resolver or a scoped resolver — which parse the value and throw `ConfigResolutionError` when it is missing or does not parse.

### Runtime Updates

```ts
manager.set('app.debug', true);
manager.delete('app.debug');
manager.toObject();      // all values as plain object — RAW, secrets included
manager.toSafeObject();  // sensitive values replaced with '[REDACTED]'

// Since v1.2.0 a runtime set() is screened like any other write,
// so this is redacted by toSafeObject() — it was not before.
manager.set('db.password', 's3cret');
```

Log `toSafeObject()`, never `toObject()`. Values seeded through `initialValues` are seeded with `source: "initialValues"` on every path (a manager-created store recorded `"runtime"` before v1.2.0), and they survive `load()` and `reload()`.

### Source Management

```ts
manager.addSource(newSource);
manager.addSourceLoader('flags', async () => ({
  values: { 'feature.beta': true },
  source: 'flags',
  type: ConfigSourceType.CUSTOM,
}));
manager.removeSource('old-source');
```

### Validation and Status

```ts
// Validate entire config against a schema
const config = manager.validate<AppConfig>(appSchema);

// Get status snapshot
const status = manager.getStatus();
// { name: 'config', state: 'ready', loaded: true, loading: false, size: 42,
//   lastLoadedAt: 1790176359562 }  — epoch milliseconds, not a Date

// Subscribe to lifecycle STATE changes (load, reload, failure, dispose).
// It does not fire on set()/delete(); use manager.getStore().subscribe() for values.
const unsub = manager.subscribe((status) => {
  console.log(`State: ${status.state}`);
});
```

### Validating Environment Values

`createEnvironmentConfigSource()` stores every variable as the raw string it read: `APP__PORT=8080` becomes `'app.port': '8080'` (`__` maps to `.`, and names are lower-cased). Since v1.3.0 a `NUMBER` or `BOOLEAN` schema coerces such strings before the type check (see [Order of Checks](#config-schema)), so `validate()`, `configFactory.validated()`, `resolve()` and `validateConfigObject()` accept them and return the parsed values. The store itself keeps the strings; read through `number()` / `boolean()` or the value `validate()` returns. (In v1.2.0 these schemas always failed on environment values with `TYPE_MISMATCH`.)

```ts
import {
  createConfigManager, createEnvironmentConfigSource, ConfigValueType,
} from '@zudojs/config';

// APP__PORT=8080 APP__DEBUG=yes
const manager = createConfigManager({
  sources: [createEnvironmentConfigSource({ prefix: 'APP__' })],
});
await manager.load();

const config = manager.validate<{ port: number; debug: boolean }>({
  properties: {
    port: { type: ConfigValueType.NUMBER, required: true, integer: true, min: 1, max: 65535 },
    debug: { type: ConfigValueType.BOOLEAN, default: false },
  },
});
console.log(config.port, config.debug); // 8080 true (a number and a boolean)

// Or read one value with a parsing accessor
const port = manager.requiredNumber('port'); // 8080
```

A value that does not parse (`APP__PORT=80a`) still fails with `TYPE_MISMATCH` and `validate()` throws `ConfigManagerValidationError`. For richer parsing across the whole object you can still coerce with [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md).

### Cleanup

```ts
await manager.dispose();
// Closes all sources, clears store, removes listeners
```

## CONFIG FACTORY

High-level convenience functions for common configuration patterns.

```ts
import { configFactory } from '@zudojs/config';

// Create without loading
const created = configFactory.create({ initialValues });

// Create and load
const loaded = await configFactory.initialize({ sources });

// Create from key-value map
const fromValues = configFactory.fromValues({ 'key': 'value' });

// Create from sources
const fromSources = configFactory.fromSources([source1, source2]);

// Create from existing store
const fromStore = configFactory.fromStore(existingStore);

// Create, load, and validate
// validated(schema, options) — the schema is the first argument.
const { manager, config } = await configFactory.validated(appSchema, { sources });
```

## TYPES REFERENCE

All exported types, interfaces, and type aliases.

| Type | Module | Description |
| --- | --- | --- |
| ConfigPrimitive | configValue | string \| number \| boolean \| bigint \| null \| undefined |
| ConfigJsonValue | configValue | JSON-compatible recursive type |
| ConfigValue | configValue | Full config value type |
| ConfigEntry<T> | configEntry | Resolved entry with metadata |
| ConfigEntryOptions<T> | configEntry | Options for creating an entry |
| ConfigSource | configSource | Full source contract |
| ConfigSourceEntry | configSource | Single value from a source |
| ConfigSourceContext | configSource | Load context |
| ConfigSourceResult | configSource | Source load result |
| ConfigChangeEvent | configStore | Change event payload |
| ConfigStoreOptions | configStore | Store initialization options |
| ConfigResolverOptions | configResolver | Resolver options |
| ConfigResolutionResult<T> | configResolver | Full diagnostic result |
| ConfigSchema<T> | configSchema | Base schema interface |
| ConfigObjectSchema<T> | configSchema | Object schema |
| ConfigArraySchema<T> | configSchema | Array schema |
| ConfigStringSchema | configSchema | String schema with constraints |
| ConfigNumberSchema | configSchema | Number schema with constraints |
| TypedConfigSchema<T> | configSchema | Union keyed on `type` accepted by `resolve()` / `resolveResult()` (v1.3.0) |
| ConfigStringConstraints, ConfigNumberConstraints, ConfigArrayConstraints, ConfigObjectConstraints | configSchema | The constraint fields each value type accepts (v1.3.0) |
| ConfigWiden<T> | configResolver | Widens a literal fallback to its primitive type in `get(key, fallback)` (v1.3.0) |
| ConfigValidationIssue | configSchema | Validation issue |
| ConfigValidationResult | configSchema | Validation result |
| ConfigManagerOptions | configManager | Manager options |
| ConfigManagerStatus | configManager | Manager status snapshot |
| ConfigLoaderOptions | configLoader | Loader options |
| ConfigLoadResult | configLoader | Load result |
| ConfigFactoryOptions | configFactory | Factory options |

## CONSTANTS

All exported enums and constants, and their values.

### DEFAULT_CONFIG_SOURCE_PRIORITY

```ts
DEFAULT_CONFIG_SOURCE_PRIORITY = -1  // priority given to a source that declares none
```

New in v1.2.0. Strictly below the `0` that `initialValues` and other baseline store writes use, so an undeclared source layers under them instead of overwriting them.

### ConfigSourceType

```ts
DEFAULTS    = 'defaults'      // createDefaultsConfigSource, priority -1000
ENVIRONMENT = 'environment'   // createEnvironmentConfigSource (process.env)
FILE        = 'file'          // type tag only — no built-in file loader; use createCustomConfigSource
MEMORY      = 'memory'        // createMemoryConfigSource
REMOTE      = 'remote'        // type tag for custom remote loaders
CUSTOM      = 'custom'        // createCustomConfigSource
```

### ConfigValueType

```ts
STRING = 'string'  |  NUMBER = 'number'  |  BOOLEAN = 'boolean'
BIGINT = 'bigint'  |  DATE = 'date'      |  OBJECT = 'object'
ARRAY = 'array'   |  NULL = 'null'      |  ANY = 'any'
```

### ConfigValidationSeverity

```ts
ERROR   = 'error'
WARNING = 'warning'
```

### ConfigManagerState

```ts
CREATED   = 'created'    // Initial state
LOADING   = 'loading'    // Loading from sources
READY     = 'ready'      // Configuration available
RELOADING = 'reloading'  // Reloading from sources
FAILED    = 'failed'     // Load failed
DISPOSED  = 'disposed'   // Manager disposed
```

## ERRORS

All error classes, their fields, and when they are thrown.

| Class | Extends | Fields | Thrown When |
| --- | --- | --- | --- |
| ConfigManagerValidationError | ConfigurationError | issues: readonly ConfigValidationIssue[] (typed since v1.3.1; was readonly unknown[]) | manager.validate() or configFactory.validated() fails against the schema |
| ConfigSchemaValidationError | ConfigurationError | issues: ConfigValidationIssue[] | assertValidConfig() fails |
| ConfigResolutionError | ConfigurationError | key: string, issues: unknown[] | Type mismatch in strict mode, missing required value |

### Re-exported from @zudojs/errors

```ts
import {
  ConfigurationError,
  createConfigurationError,
  isConfigurationError,
  missingConfigurationError,
  invalidConfigurationError,
} from '@zudojs/config';
```

## USE CASES

### 1. Application Configuration with Environment Variables

```ts
const manager = await initializeConfigManager({
  sources: [
    createDefaultsConfigSource({ 'app.port': 3000 }),   // priority -1000
    createEnvironmentConfigSource(),                     // priority 100
  ],
});
// APP__PORT=8080 is read as 'app.port': '8080' (a string) and overrides the default.
const port = manager.number('app.port') ?? 3000; // 8080 — number() parses the string
```

### 2. Multi-Source Configuration with Priority

```ts
const manager = await initializeConfigManager({
  sources: [
    createDefaultsConfigSource(defaults),    // priority: -1000
    fileSource,                                 // priority: -1 (declares none)
    createCustomConfigSource('env', envLoader, { priority: 100 }),
  ],
});
// Higher priority wins when keys overlap
```

### 3. Type-Safe Configuration Access

```ts
// The required* helpers are on the manager, the resolver and scoped resolvers.
const db = manager.scoped('db');
const host = db.requiredString('host');  // string; throws if missing
const port = db.requiredNumber('port');  // number; parses "5432", throws if it cannot

// A fallback makes the result non-optional.
const poolSize: number = db.number('poolSize', 10);
```

### 4. Configuration Validation with Schemas

```ts
const { manager, config } = await configFactory.validated(
  {
    properties: {
      'app.port': { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
      'app.name': { type: ConfigValueType.STRING, required: true },
    },
  },
  { initialValues: { 'app.name': 'My App', 'app.port': 3000 } },
);
// Throws ConfigManagerValidationError if validation fails.
// NUMBER/BOOLEAN also accept environment strings such as "8080" (coerced).
```

### 5. Runtime Configuration Updates

```ts
// Update a value at runtime
manager.set('app.debug', true);

// Listen for value changes on the store (manager.subscribe() only
// reports lifecycle state changes, not set() or delete()).
manager.getStore().subscribe((event) => {
  console.log(`Config updated: ${event.key}`);
});

// Reload from sources
await manager.reload();
```

### 6. Scoped Configuration for Modules

```ts
// Each module gets its own scoped resolver
const authConfig = manager.scoped('auth');
const dbConfig = manager.scoped('db');
const cacheConfig = manager.scoped('cache');

// Modules access only their own config
const secret = authConfig.string('jwtSecret');
if (secret === undefined) throw missingConfigurationError('auth.jwtSecret');
const host = dbConfig.string('host') ?? 'localhost';
const ttl = cacheConfig.number('ttl') ?? 3600;
```

## CONNECTIONS

How @zudojs/config integrates with other Zudo packages.

[### @zudojs/errors

ConfigurationError base class and error factories](https://zudojs.oyinlola.site/docs/packages-errors.md) [### @zudojs/logger

Configure logging levels, transports, and formats](https://zudojs.oyinlola.site/docs/packages-logger.md) [### @zudojs/container

Register ConfigManager as a container singleton](https://zudojs.oyinlola.site/docs/packages-container.md) [### @zudojs/lifecycle

Integrate config loading into application lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) [### @zudojs/core

Application-level configuration management](https://zudojs.oyinlola.site/docs/packages-core.md) [### @zudojs/schema

Advanced schema validation and type inference](https://zudojs.oyinlola.site/docs/packages-schema.md)

## IMPROVEMENTS

> **Best Practices**

- **Use scoped resolvers** — Isolate module configuration with `manager.scoped('module')` to prevent accidental cross-module access.
- **Validate early** — Use `configFactory.validated()` at startup to catch configuration errors before the app runs.
- **Log `toSafeObject()`** — Secrets are detected and marked on every write since v1.2.0, whatever path they arrived by, but only `toSafeObject()` honours that mark. `toObject()` returns them raw. Pass `sensitive: true` to mark a key the detector would miss, or `sensitive: false` to opt one out.
- **Use priority ordering** — Set environment sources at higher priority than file sources, and file sources higher than defaults.
- **Freeze in production** — Enable `freeze: true` to prevent accidental mutation of configuration values.
- **Subscribe to changes** — Use `store.subscribe()` to react to runtime configuration updates.
- **Use typed accessors** — Prefer `manager.string()`, `manager.number()` over raw `manager.get()` for type safety.
- **Handle reload gracefully** — Subscribe to manager state changes to respond to configuration reloads.

## API SUMMARY

Compact reference of all exports organized by submodule.

configValue

ConfigPrimitive, ConfigJsonValue, ConfigValue, ResolvedConfigValue, isConfigPrimitive, isConfigObject, isConfigValue, toConfigJsonValue, configValueToString, parseConfigString, parseConfigBoolean, parseConfigNumber, parseConfigBigInt, parseConfigDate, freezeConfigValue, cloneConfigValue, configValuesEqual

configEntry

ConfigEntry, ConfigEntryOptions, createConfigEntry, updateConfigEntry, isConfigEntry, redactConfigValue, toSafeConfigEntry, serializeConfigEntry, withConfigEntrySource, configEntriesEqual, sortConfigEntries

configSource

ConfigSourceType, ConfigSourceEntry, ConfigSourceContext, ConfigSourceResult, ConfigSource, ConfigSourceLoader, FunctionConfigSource, ConfigSourceOptions, DEFAULT_CONFIG_SOURCE_PRIORITY, isConfigSource, createConfigSource, createMemoryConfigSource, createDefaultsConfigSource, createCustomConfigSource, createEnvironmentConfigSource, isSensitiveConfigKey, isSensitiveConfigValue, isSensitiveConfigEntry, normalizeConfigSourceResult, sortConfigSources, findConfigSource, deduplicateConfigSources, loadConfigSource, loadConfigSources

configStore

ConfigStore, ConfigChangeEvent, ConfigChangeListener, ConfigStoreOptions, createConfigStore, normalizeKey

configResolver

ConfigResolver, ScopedConfigResolver, ConfigResolverOptions, ConfigResolutionResult, ConfigResolutionError, ConfigWiden, createConfigResolver

configSchema

ConfigValueType, ConfigValidationSeverity, ConfigValidationIssue, ConfigValidationResult, ConfigValidationContext, ConfigSchema, ConfigObjectSchema, ConfigArraySchema, ConfigStringSchema, ConfigNumberSchema, ConfigBooleanSchema, TypedConfigSchema, ConfigStringConstraints, ConfigNumberConstraints, ConfigArrayConstraints, ConfigObjectConstraints, ConfigSchemaDefinition, ConfigSchemaBuilder, getConfigValueType, matchesConfigType, createConfigValidationIssue, validateConfigValue, validateConfigObject, assertValidConfig, ConfigSchemaValidationError

configLoader

ConfigLoader, ConfigLoaderOptions, ConfigLoadResult, createConfigLoader, loadConfiguration, sourceResultsToEntries

configManager

ConfigManager, ConfigManagerState, ConfigManagerOptions, ConfigManagerStatus, ConfigManagerListener, ConfigManagerValidationError, createConfigManager, initializeConfigManager

configFactory

configFactory, createConfiguration, createInitializedConfiguration, createConfigurationFromValues, createConfigurationFromSources, createConfigurationFromStore, createValidatedConfiguration, ConfigFactoryOptions

Re-exports from @zudojs/errors

ConfigurationError, createConfigurationError, isConfigurationError, missingConfigurationError, invalidConfigurationError

[← zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) [@zudojs/constants →](https://zudojs.oyinlola.site/docs/packages-constants.md)

## COMPLETE EXPORT INDEX

Every name `@zudojs/config` exports from its package root at v1.3.3 — **120** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 120 exports**

Classes (9)

`ConfigLoader` `ConfigManager` `ConfigManagerValidationError` `ConfigResolutionError` `ConfigResolver` `ConfigSchemaValidationError` `ConfigStore` `ConfigurationError` `ScopedConfigResolver`

Functions (65)

`assertValidConfig` `cloneConfigValue` `configEntriesEqual` `configValuesEqual` `configValueToString` `createConfigEntry` `createConfigLoader` `createConfigManager` `createConfigResolver` `createConfigSource` `createConfigStore` `createConfiguration` `createConfigurationError` `createConfigurationFromSources` `createConfigurationFromStore` `createConfigurationFromValues` `createConfigValidationIssue` `createCustomConfigSource` `createDefaultsConfigSource` `createEnvironmentConfigSource` `createInitializedConfiguration` `createMemoryConfigSource` `createValidatedConfiguration` `deduplicateConfigSources` `defineConfigProperty` `findConfigSource` `freezeConfigValue` `getConfigValueType` `initializeConfigManager` `invalidConfigurationError` `isConfigEntry` `isConfigObject` `isConfigPrimitive` `isConfigSource` `isConfigurationError` `isConfigValue` `isSensitiveConfigEntry` `isSensitiveConfigKey` `isSensitiveConfigValue` `isUnsafeConfigKey` `loadConfigSource` `loadConfigSources` `loadConfigSourceStrict` `loadConfiguration` `matchesConfigType` `missingConfigurationError` `normalizeConfigSourceResult` `normalizeKey` `parseConfigBigInt` `parseConfigBoolean` `parseConfigDate` `parseConfigNumber` `parseConfigString` `readOwnConfigProperty` `redactConfigValue` `serializeConfigEntry` `sortConfigEntries` `sortConfigSources` `sourceResultsToEntries` `toConfigJsonValue` `toSafeConfigEntry` `updateConfigEntry` `validateConfigObject` `validateConfigValue` `withConfigEntrySource`

Interfaces (29)

`ConfigArrayConstraints` `ConfigArraySchema` `ConfigBooleanSchema` `ConfigChangeEvent` `ConfigEntry` `ConfigEntryOptions` `ConfigLoaderOptions` `ConfigLoadResult` `ConfigManagerOptions` `ConfigManagerStatus` `ConfigNumberConstraints` `ConfigNumberSchema` `ConfigObjectConstraints` `ConfigObjectSchema` `ConfigResolutionResult` `ConfigResolverOptions` `ConfigSchema` `ConfigSource` `ConfigSourceContext` `ConfigSourceOptions` `ConfigSourceResult` `ConfigStoreOptions` `ConfigStringConstraints` `ConfigStringSchema` `ConfigValidationContext` `ConfigValidationIssue` `ConfigValidationResult` `EnvironmentConfigSourceOptions` `FunctionConfigSource`

Type aliases (11)

`AnyConfigSchema` `ConfigChangeListener` `ConfigFactoryOptions` `ConfigJsonValue` `ConfigManagerListener` `ConfigPrimitive` `ConfigSourceLoader` `ConfigValue` `ConfigWiden` `ResolvedConfigValue` `TypedConfigSchema`

Constants (2)

`configFactory` `DEFAULT_CONFIG_SOURCE_PRIORITY`

Enums (4)

`ConfigManagerState` `ConfigSourceType` `ConfigValidationSeverity` `ConfigValueType`
