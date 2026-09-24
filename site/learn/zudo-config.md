---
title: "Configuration"
description: "Keep settings out of the code with @zudojs/config. Layer defaults, a config file and environment variables by priority, validate the result with a schema, keep secrets out of logs, and make the Task API's generated configuration stricter in production than in development."
source: https://zudojs.oyinlola.site/learn/zudo-config
---

LESSON 53 OF 84

The ZudoJS core Core

# Configuration

Keep settings out of the code with @zudojs/config. Layer defaults, a config file and environment variables by priority, validate the result with a schema, keep secrets out of logs, and make the Task API's generated configuration stricter in production than in development.

- **45 min** to read and try
- **You need:** Middleware, CORS, security headers and graceful shutdown
- **You build:** A stricter Task API configuration that listens only on your own computer in development, checks every CORS origin, allows only https origins in production, and stops with one clear line when a setting is wrong

  [Test yourself](#test)

## Why configuration lives outside the code

Picture the Task API with its settings written straight into `src/server.ts`: the port, the allowed CORS origins, the rate limits. That causes three problems:

- **They differ per environment.** On your computer the web app runs at `http://localhost:5173`; in production it is `https://tasks.example.com`. Changing code to deploy is slow and risky.
- **Secrets would end up in git.** A database password or a token-signing key written in code is visible to everyone who can read the repository, forever, even after you delete it.
- **Nobody can see what is configurable.** The settings are scattered through the code.

**Configuration** is every value that changes between environments. The usual rule, from the "twelve-factor app" guidelines, is: code is the same everywhere, and configuration comes from outside, mostly from **environment variables**. You read those in [Node.js APIs](https://zudojs.oyinlola.site/learn/node-apis) with `process.env`.

`@zudojs/config` collects settings from several places, decides which one wins, and keeps secrets out of logs. It is already in the Task API's `package.json`, and the generated `src/configs/index.ts` uses it. That is why your `src/server.ts` reads `config.port` and `config.corsOrigins` instead of fixed values. At the [end of this lesson](#task-api) you read that file line by line and make it stricter.

## Sources and priority

A **config source** is one place values come from: built-in defaults, a file, the environment. A **config manager** loads all its sources and merges them. When two sources give the same key, the one with the higher **priority** wins:

sources.ts

```ts
import { createConfigManager, createDefaultsConfigSource, createMemoryConfigSource } from "@zudojs/config";

const config = createConfigManager({
  sources: [
    createDefaultsConfigSource({ port: 3000, host: "127.0.0.1", rate_limit_max: 300 }),
    createMemoryConfigSource({ port: 8080 }, { name: "overrides", priority: 100 }),
  ],
});
await config.load();

console.log(config.number("port"), config.string("host"), config.number("rate_limit_max"));
console.log(config.get("database_url"), config.string("database_url", "none"));
```

Output of `npx tsx sources.ts` and of the browser terminal

```ts
8080 127.0.0.1 300
undefined none
```

The override's `port` beat the default, and every key the override did not mention kept its default. **Typed accessors** such as `number()`, `string()` and `boolean()` read a key as that type. `get()` gives `undefined` for a missing key. The second argument of `get()` or an accessor is a fallback, and with a fallback TypeScript knows the result is never `undefined`: `config.string("database_url", "none")` is a `string`. When a setting must exist, use `requiredString()`, `requiredNumber()`, `requiredBoolean()` or `requiredDate()`: they convert the value and throw when it is missing or has the wrong type.

In real projects the layers are nearly always the same, from lowest to highest priority:

1. **Defaults** in the code: safe values that work on a developer's computer.
2. A **config file**: settings you are happy to keep in git, per environment.
3. **Environment variables**: set by whoever runs the app, and the only place for secrets.

## Environment variables

`createEnvironmentConfigSource` reads environment variables that start with a **prefix**, so the app only picks up its own. It turns each name into a key: the prefix is removed, the rest is lower-cased, and a double underscore `__` becomes a dot. Normally it reads `process.env`; here it gets a plain object instead, so you can see the mapping (and run it in the browser):

env-source.ts

```ts
import { createConfigManager, createDefaultsConfigSource, createEnvironmentConfigSource } from "@zudojs/config";

const fakeEnv = {
  TASKS_PORT: "8080",
  TASKS_RATE_LIMIT_MAX: "50",
  TASKS_DEBUG: "false",
  TASKS_DB__HOST: "db.internal",
  HOME: "/home/ada",
};

const config = createConfigManager({
  sources: [
    createDefaultsConfigSource({ port: 3000, debug: true }),
    createEnvironmentConfigSource({ prefix: "TASKS_", env: fakeEnv, priority: 50 }),
  ],
});
await config.load();

console.log(config.toObject());
console.log(config.number("port"), typeof config.number("port"), config.boolean("debug"));
console.log(config.scoped("db").requiredString("host"));
```

Output of `npx tsx env-source.ts` and of the browser terminal

```json
{
  port: '8080',
  rate_limit_max: '50',
  debug: 'false',
  'db.host': 'db.internal'
}
8080 number false
db.internal
```

Notice:

- `HOME` was ignored: it does not start with `TASKS_`.
- Every value from the environment is a **string**: `'8080'`, `'false'`. The environment has no other type. The typed accessors convert: `number("port")` gave the number 8080, and `boolean("debug")` turned `"false"` into `false`. A plain `if ("false")` would have been true.
- `TASKS_DB__HOST` became the key `db.host`. `config.scoped("db")` gives a view of the keys under `db`, so a database module can read `host` without knowing the full name.

With the real environment, leave out `env`. This example prints the port from `process.env`, or the default when the variable is not set:

env-real.tsNode.js only

```ts
import { createConfigManager, createDefaultsConfigSource, createEnvironmentConfigSource } from "@zudojs/config";

const config = createConfigManager({
  sources: [
    createDefaultsConfigSource({ port: 3000 }),
    createEnvironmentConfigSource({ prefix: "TASKS_", priority: 50 }),
  ],
});
await config.load();
console.log("port:", config.number("port"));
```

Output of `npx tsx env-real.ts`

```ts
port: 3000
```

On your computer, set the variable for one command by writing it in front:

Terminal on your computer

```bash
$ npx tsx env-real.ts
port: 3000
$ TASKS_PORT=8080 npx tsx env-real.ts
port: 8080
```

> ON WINDOWS POWERSHELL
>
> Set the variable first, then run: `$env:TASKS_PORT="8080"; npx tsx env-real.ts`. Remove it again with `Remove-Item Env:TASKS_PORT`.

## A config file

Settings that are not secret, and that you want to review in git, fit well in a JSON file. `@zudojs/config` has no built-in file reader, so you write a small source with `createCustomConfigSource`. Its loader function returns the values:

config.json

```json
{
  "host": "0.0.0.0",
  "cors_origins": "https://tasks.example.com",
  "rate_limit_max": 200
}
```

file-source.tsNode.js only

```ts
import { readFile } from "node:fs/promises";
import {
  ConfigSourceType,
  createConfigManager,
  createCustomConfigSource,
  createDefaultsConfigSource,
  createEnvironmentConfigSource,
} from "@zudojs/config";

function jsonFile(path: string) {
  return createCustomConfigSource(
    "file",
    async () => ({ values: JSON.parse(await readFile(path, "utf8")), source: path, type: ConfigSourceType.FILE }),
    { priority: 10, optional: true },
  );
}

const config = createConfigManager({
  sources: [
    createDefaultsConfigSource({ port: 3000, host: "127.0.0.1", rate_limit_max: 300 }),
    jsonFile("config.json"),
    createEnvironmentConfigSource({ prefix: "TASKS_", env: { TASKS_RATE_LIMIT_MAX: "50" }, priority: 20 }),
  ],
});
await config.load();

console.log(config.toObject());
```

Output of `npx tsx file-source.ts`

```json
{
  rate_limit_max: '50',
  host: '0.0.0.0',
  cors_origins: 'https://tasks.example.com',
  port: 3000
}
```

Each key shows who won: `port` came from the defaults, `host` and `cors_origins` from the file, and `rate_limit_max` from the environment, which beat both. `optional: true` means a missing file is simply skipped, so the app still starts with defaults and environment variables alone.

## Validate at startup

A typo in a setting should stop the app *when it starts*, with a clear message, not three hours later when a request finally uses the value. This is called **failing fast**. You already know the tool: a schema from `@zudojs/schema`. Environment values are strings, so use `schema.coerce`, which converts `"8080"` to `8080` and refuses `"80x"`:

config.schema.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const ConfigSchema = schema.object({
  port: schema.coerce.number().int().min(0).max(65535),
  host: schema.string().min(1),
  cors_origins: schema.string().max(2000).transform((list) =>
    list.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0),
  ),
  rate_limit_max: schema.coerce.number().int().min(1).max(10_000),
  jwt_secret: schema.string().min(32).max(512).optional(),
});

export type AppConfig = Infer<typeof ConfigSchema>;
```

`cors_origins` arrives as one comma-separated string, and the `transform` turns it into a list. `jwt_secret` is the key the [authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth) will use to sign tokens. If it is given, it must be at least 32 characters. Now check some bad settings:

validate.ts

```ts
import { isSchemaValidationError } from "@zudojs/schema";
import { ConfigSchema } from "./config.schema.js";

const good = ConfigSchema.parse({ port: "8080", host: "0.0.0.0", cors_origins: "https://a.example, https://b.example", rate_limit_max: 300 });
console.log(good);

try {
  ConfigSchema.parse({ port: "80x", host: "", cors_origins: "", rate_limit_max: "0", jwt_secret: "secret" });
} catch (error) {
  if (isSchemaValidationError(error)) {
    for (const issue of error.issues) {
      console.log(`${issue.path.join(".")}: ${issue.message}`);
    }
  }
}
```

Output of `npx tsx validate.ts` and of the browser terminal

```json
{
  port: 8080,
  host: '0.0.0.0',
  cors_origins: [ 'https://a.example', 'https://b.example' ],
  rate_limit_max: 300
}
port: Cannot coerce string to number
host: String must be at least 1 character
rate_limit_max: Expected >= 1, received 0
jwt_secret: String must be at least 32 characters
```

All the problems are reported at once, each with the setting's name. `isSchemaValidationError` is the type guard you used in [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code#service). The optional `jwt_secret` was not given, so the result has no `jwt_secret` key at all.

`@zudojs/config` can also check values itself, with `manager.validate()` and its own small schemas. It converts environment strings for `NUMBER` and `BOOLEAN` settings, so `"8080"` becomes `8080` and `"no"` becomes `false`:

config-validate.ts

```ts
import { ConfigValueType, createConfigManager, createEnvironmentConfigSource } from "@zudojs/config";

for (const env of [{ TASKS_PORT: "8080", TASKS_DEBUG: "no" }, { TASKS_PORT: "80x", TASKS_DEBUG: "maybe" }]) {
  const config = createConfigManager({ sources: [createEnvironmentConfigSource({ prefix: "TASKS_", env })] });
  await config.load();
  try {
    const settings = config.validate<{ port: number; debug: boolean }>({
      properties: {
        port: { type: ConfigValueType.NUMBER, min: 0, max: 65535, required: true },
        debug: { type: ConfigValueType.BOOLEAN },
      },
    });
    console.log(settings);
  } catch (error) {
    console.log((error as Error).name + ":", (error as Error).message);
  }
}
```

Output of `npx tsx config-validate.ts` and of the browser terminal

```json
{ port: 8080, debug: false }
ConfigManagerValidationError: Configuration validation failed with 2 issues.
```

Both tools work. This course keeps `@zudojs/schema` for configuration: you already know it from request bodies, it turns the origin list into an array with `transform`, and its issues name each bad setting in a readable message.

## Secrets and redaction

A **secret** is a value that gives power to whoever knows it: a database password, a token-signing key, an API key. Three rules:

1. Secrets come **only** from the environment (or a secrets manager that sets it), never from code or a committed file.
2. If a required secret is missing, the app refuses to start. It never falls back to a default like `"change-me"`: a default secret is a public secret.
3. Secrets never appear in logs or error messages. Logs are copied to many places and read by many people.

`@zudojs/config` helps with rule 3. It marks keys whose names look secret (containing `secret`, `password`, `token`, `api_key`, `database_url` and similar) as **sensitive**. `toSafeObject()` is the copy for logs; `toObject()` and the accessors still give your code the real values:

redact.ts

```ts
import { createConfigManager, createEnvironmentConfigSource } from "@zudojs/config";

const config = createConfigManager({
  sources: [
    createEnvironmentConfigSource({
      prefix: "TASKS_",
      env: {
        TASKS_PORT: "8080",
        TASKS_JWT_SECRET: "n8VqT2xLm4pR7sKd9wYb3cFh6jZa1eUo",
        TASKS_DATABASE_URL: "postgres://tasks:pa55word@db.internal/tasks",
      },
    }),
  ],
});
await config.load();

console.log("for the logs:", config.toSafeObject());
console.log("secret length for the code:", config.requiredString("jwt_secret").length);
```

Output of `npx tsx redact.ts` and of the browser terminal

```ts
for the logs: { port: '8080', jwt_secret: '[REDACTED]', database_url: '[REDACTED]' }
secret length for the code: 32
```

The database URL was redacted too: it contains a password, and `database_url` is on the list of sensitive names. The logger from `@zudojs/logger` applies the same kind of redaction to anything you log, as a second safety net:

redact-log.ts

```ts
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "task-api" });
logger.info("configuration loaded", { port: 8080, jwtSecret: "n8VqT2xLm4pR7sKd9wYb3cFh6jZa1eUo" });
```

Output of `npx tsx redact-log.ts` and of the browser terminal

```ts
2026-09-23T14:19:02.590Z [INFO] [task-api] configuration loaded port=8080 jwtSecret=[REDACTED]
```

> REDACTION WORKS ON NAMES
>
> Both tools recognise a secret by its *key name*. A secret stored under an innocent name such as `note` is logged in full. Give secrets obvious names, and never log a whole `process.env`.

## Development and production

`NODE_ENV` is the environment variable every Node.js tool uses to tell development from production. `resolveEnvironment()` from `@zudojs/constants` (already used in the generated `src/app.ts`) reads it and returns `"development"`, `"test"` or `"production"`. When it is not set, you get `"development"`.

Production gets stricter rules. Development defaults are allowed to be convenient; production must be told everything explicitly. For the Task API, by the end of this lesson:

| Setting | Development | Production |
| --- | --- | --- |
| `HOST` | defaults to `127.0.0.1`: only your own computer can connect | defaults to `0.0.0.0`: reachable from the network |
| `CORS_ORIGINS` | may list `http://localhost:5173` | `https://` origins only |
| a token-signing secret (the [authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth)) | may be missing until you add login | must be set, 32+ characters |

For development, typing variables in front of every command gets old. Put them in a file called `.env`. The generated `src/configs/index.ts` loads it itself with Node's `process.loadEnvFile()`, before it reads the environment, and a variable set in the real environment wins over the file. (For a script that does not call `loadConfig`, `node --env-file=.env` and `tsx --env-file=.env` load it the same way.) The generated `.gitignore` already lists `.env`, so it is never committed. The committed `.env.example` shows which variables exist, with no real values. A `.env` for working with a web app on your computer:

.env

```ts
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173
```

The generated project reads the plain names from `.env.example`, such as `PORT`, not `TASKS_PORT`: its environment source has no prefix. That works because `loadConfig` only ever reads the keys it names, and never logs the whole manager.

## Put it in the Task API

Open `src/configs/index.ts`. The CLI wrote a `loadConfig` function there that already follows most of this lesson. This is its end:

src/configs/index.ts (part)Node.js only

```ts
export async function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env) loadDotEnv();
  const config = createConfigManager({
    sources: [createEnvironmentConfigSource({ env })],
  });
  await config.load();

  return Object.freeze({
    nodeEnv: text(config, "node_env", "development"),
    host: text(config, "host", "0.0.0.0"),
    port: port(config),
    corsOrigins: list(config, "cors_origins"),
    rateLimit: Object.freeze({
      windowMs: int(config, "rate_limit_window_ms", 60_000),
      max: int(config, "rate_limit_max", 300),
    }),
    // zudojs:config:start
    database: Object.freeze({ url: text(config, "database_url", "") }),
    // zudojs:config:end
  });
}

/** The loaded configuration. */
export type AppConfig = Awaited<ReturnType<typeof loadConfig>>;
```

- **One source**, the environment. `loadDotEnv()`, higher up in the file, first loads `.env` when it exists. The defaults are not a separate source: each helper takes its fallback, such as `300` for `RATE_LIMIT_MAX`.
- **Typed helpers.** `text` reads a string, `list` splits `CORS_ORIGINS` at the commas, and `int` and `port` convert numbers.
- **Fail fast.** `int` and `port` throw a `ConfigurationError` for a value such as `PORT=eighty`, so a typo stops the app at startup.
- **Frozen and typed.** `Object.freeze` stops any code from changing a setting later, and `AppConfig` is the type TypeScript works out from the returned object. `src/server.ts` and `src/app.ts` use it.
- **Easy to test.** `loadConfig` takes the environment as a parameter. Given a plain object, it does not touch `.env` or `process.env` at all.
- The `// zudojs:config` markers are where `zudojs add` puts the settings of a feature.

Four things from this lesson are still missing: production is not stricter than development, the server listens on every network interface even on your laptop, `CORS_ORIGINS` accepts anything, and the write limit from the previous lesson is written in the code. Here is the whole file with all four added. The new parts are the two imports, `OriginSchema`, the `origins` helper, the `production` constant, and the `production`, `host`, `corsOrigins` and `writeMax` lines in `loadConfig`:

src/configs/index.tsNode.js only

```ts
import { ConfigurationError } from "@zudojs/errors";
import {
  createConfigManager,
  createEnvironmentConfigSource,
  type ConfigManager,
} from "@zudojs/config";
import { resolveEnvironment } from "@zudojs/constants";
import { schema } from "@zudojs/schema";

const DEFAULT_PORT = 3000;

/** Loads `.env` into process.env when it exists; real variables win. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** A string setting, or `fallback` when the variable is unset. */
export function text(config: ConfigManager, key: string, fallback: string): string {
  return config.string(key, fallback) ?? fallback;
}

/** A comma-separated list setting. */
export function list(config: ConfigManager, key: string): readonly string[] {
  return (config.string(key, "") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** An origin is a scheme, a host and an optional port: no path, no trailing slash. */
const OriginSchema = schema
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, "not an origin");

/** CORS_ORIGINS: exact origins such as https://tasks.example.com, and only https in production. */
export function origins(config: ConfigManager, production: boolean): readonly string[] {
  const entries = list(config, "cors_origins");
  for (const entry of entries) {
    if (!OriginSchema.safeParse(entry).success) {
      throw new ConfigurationError(`CORS_ORIGINS must list origins such as https://tasks.example.com, got "${entry}".`);
    }
    if (production && !entry.startsWith("https://")) {
      throw new ConfigurationError(`CORS_ORIGINS must use https in production, got "${entry}".`);
    }
  }
  return entries;
}

/** A non-negative integer setting; anything else is a configuration error. */
export function int(config: ConfigManager, key: string, fallback: number): number {
  const raw = config.string(key);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConfigurationError(`${key.toUpperCase()} must be a non-negative integer, got "${raw}".`);
  }
  return value;
}

/** PORT, refusing anything that is not a TCP port. */
function port(config: ConfigManager): number {
  const raw = config.string("port");
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ConfigurationError(`PORT must be an integer between 0 and 65535, got "${raw}".`);
  }
  return value;
}

/**
 * Reads the application configuration from the environment (and `.env`).
 * `zudojs add <feature>` adds the feature's settings between the markers.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env) loadDotEnv();
  const config = createConfigManager({
    sources: [createEnvironmentConfigSource({ env })],
  });
  await config.load();
  const production = resolveEnvironment(env) === "production";

  return Object.freeze({
    nodeEnv: text(config, "node_env", "development"),
    production,
    host: text(config, "host", production ? "0.0.0.0" : "127.0.0.1"),
    port: port(config),
    corsOrigins: origins(config, production),
    rateLimit: Object.freeze({
      windowMs: int(config, "rate_limit_window_ms", 60_000),
      max: int(config, "rate_limit_max", 300),
      writeMax: int(config, "rate_limit_write_max", 20),
    }),
    // zudojs:config:start
    database: Object.freeze({ url: text(config, "database_url", "") }),
    // zudojs:config:end
  });
}

/** The loaded configuration. */
export type AppConfig = Awaited<ReturnType<typeof loadConfig>>;
```

- `resolveEnvironment(env)` reads `NODE_ENV` from the same object as everything else, so a test can ask for production without touching the real environment.
- In development the server now listens on `127.0.0.1`, so only your own computer can reach it, which is safer on a laptop in a café. Production keeps `0.0.0.0`, because there the server must be reachable.
- `OriginSchema` is the [schema check](#validate) from this lesson. `new URL(value).origin` is the origin a browser would send, so a value is accepted only when it *is* one. `https://tasks.example.com/` with a trailing slash would never match a browser's `Origin` header, and `*` would allow every website. Both are refused at startup instead of failing quietly later.
- In production, an origin must use `https://`: a page served over plain HTTP can be changed by anyone on the network between the user and the site.

This script tries the function with five different environments:

src/check-config.tsNode.js only

```ts
import { loadConfig } from "./configs/index.js";

async function attempt(label: string, env: Record<string, string>): Promise<void> {
  try {
    const config = await loadConfig(env);
    console.log(label, "->", config.host, config.port, config.corsOrigins, config.rateLimit.writeMax);
  } catch (error) {
    console.log(label, "->", (error as Error).name + ":", (error as Error).message);
  }
}

await attempt("development", {});
await attempt("bad port   ", { PORT: "eighty" });
await attempt("bad origin ", { CORS_ORIGINS: "http://localhost:5173/" });
await attempt("production ", { NODE_ENV: "production", CORS_ORIGINS: "http://tasks.example.com" });
await attempt("production ", { NODE_ENV: "production", CORS_ORIGINS: "https://tasks.example.com", RATE_LIMIT_WRITE_MAX: "5" });
```

Output of `npx tsx src/check-config.ts`

```ts
development -> 127.0.0.1 3000 [] 20
bad port    -> ConfigurationError: PORT must be an integer between 0 and 65535, got "eighty".
bad origin  -> ConfigurationError: CORS_ORIGINS must list origins such as https://tasks.example.com, got "http://localhost:5173/".
production  -> ConfigurationError: CORS_ORIGINS must use https in production, got "http://tasks.example.com".
production  -> 0.0.0.0 3000 [ 'https://tasks.example.com' ] 5
```

Development starts with its safe defaults. A wrong port, a malformed origin and a plain-HTTP origin in production each stop with a `ConfigurationError` that says exactly what to fix. None of these settings is a secret, so the messages may show the value. For a secret, name the setting and never print its value.

Now `src/server.ts`. It calls `loadConfig()` first, before anything else starts. If that throws, Node.js prints a long stack trace, which says less than the message. Catch it, print the message, and exit with code 1. While you are in the file, give the write limit its new setting:

src/server.ts (part)Node.js only

```ts
import { loadConfig, type AppConfig } from "./configs/index.js";

let config: AppConfig;
try {
  config = await loadConfig();
} catch (error) {
  console.error(`Cannot start: ${(error as Error).message}`);
  process.exit(1);
}
const httpServer = createServer();
const runtime = createApp({ config, httpServer });

// ...further down, in the pipeline:
    writeLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.writeMax }),
```

Last, `.env.example`, the list of settings for the next developer. Replace the `HOST=0.0.0.0` line, so a copied `.env` does not bring back the old default, and add the new setting. If you already copied `.env.example` to `.env`, remove `HOST` there too:

.env.example

```ts
NODE_ENV=development
# Leave HOST unset: 127.0.0.1 in development, 0.0.0.0 in production
# HOST=
PORT=3000
# Comma-separated origins allowed to call the API from a browser (empty: none)
CORS_ORIGINS=
# Requests allowed per client per window
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
# Requests that change data (POST, PATCH, DELETE) allowed per client per window
RATE_LIMIT_WRITE_MAX=20
DATABASE_URL=postgresql://localhost:5432/task-api
```

Run the check script and the server in your project, then try two bad starts:

Terminal on your computer

```bash
$ npx tsx src/check-config.ts
development -> 127.0.0.1 3000 [] 20
bad port    -> ConfigurationError: PORT must be an integer between 0 and 65535, got "eighty".
bad origin  -> ConfigurationError: CORS_ORIGINS must list origins such as https://tasks.example.com, got "http://localhost:5173/".
production  -> ConfigurationError: CORS_ORIGINS must use https in production, got "http://tasks.example.com".
production  -> 0.0.0.0 3000 [ 'https://tasks.example.com' ] 5
$ npm run dev

> task-api@0.1.0 dev
> tsx watch src/server.ts

…
Listening on http://127.0.0.1:3000
$ NODE_ENV=production CORS_ORIGINS=http://tasks.example.com npx tsx src/server.ts
Cannot start: CORS_ORIGINS must use https in production, got "http://tasks.example.com".
$ PORT=eighty npx tsx src/server.ts
Cannot start: PORT must be an integer between 0 and 65535, got "eighty".
```

Stop the development server with Ctrl + C before the last two commands, so port 3000 is free. The development server now listens on `127.0.0.1`, and `curl http://localhost:3000/health` still works, because `localhost` is your own computer. Both bad starts stopped at once, with one line that names the setting.

> ON WINDOWS POWERSHELL
>
> Set the variables first, then run: `$env:NODE_ENV="production"; $env:CORS_ORIGINS="http://tasks.example.com"; npx tsx src/server.ts`. Remove them again with `Remove-Item Env:NODE_ENV, Env:CORS_ORIGINS`.

## Practice

TRY IT YOURSELF

### A request timeout setting

Add a `request_timeout_ms` setting to the [config schema](#validate), with a default of 30000 in the defaults source. It must be a whole number from 1000 to 120000. Check it with `TASKS_REQUEST_TIMEOUT_MS=500` and with `5000`.

**Show a solution**

timeout-setting.ts

```ts
import { createConfigManager, createDefaultsConfigSource, createEnvironmentConfigSource } from "@zudojs/config";
import { schema } from "@zudojs/schema";

const Schema = schema.object({
  request_timeout_ms: schema.coerce.number().int().min(1000).max(120_000),
});

for (const value of ["500", "5000"]) {
  const config = createConfigManager({
    sources: [
      createDefaultsConfigSource({ request_timeout_ms: 30_000 }),
      createEnvironmentConfigSource({ prefix: "TASKS_", env: { TASKS_REQUEST_TIMEOUT_MS: value }, priority: 20 }),
    ],
  });
  await config.load();
  const result = Schema.safeParse(config.toObject());
  console.log(value, "->", result.success ? result.data : result.issues[0]?.message);
}
```

Output of `npx tsx timeout-setting.ts` and of the browser terminal

```ts
500 -> Expected >= 1000, received 500
5000 -> { request_timeout_ms: 5000 }
```

TRY IT YOURSELF

### Find the leak

A teammate wants to debug a production problem and adds `console.log("config", config.toObject())` at startup. What is wrong, and what should the line be?

**Show a solution**

`toObject()` returns the **real** values, so the JWT secret and the database password would be printed into the production logs, where anyone with log access can read them, and log services keep them for months. Use `config.toSafeObject()`, which replaces sensitive values with `"[REDACTED]"`, or better, log only the few settings you need, such as the port and the origins. If a secret was ever logged, treat it as leaked and replace it.

## Recap

- Configuration is everything that changes between environments. It comes from outside the code, mostly from environment variables.
- A config manager merges **sources** by **priority**: defaults < config file < environment variables.
- Environment values are always strings. Use typed accessors or `schema.coerce` to convert them.
- Validate the whole configuration at startup and stop with a clear error: fail fast.
- Secrets only come from the environment, have no defaults, and never reach logs: use `toSafeObject()`, and the logger redacts secret-looking keys too.
- `NODE_ENV=production` switches on stricter rules. A `.env` file, loaded by the generated `loadConfig` (or with `--env-file`) and never committed, is for development.

You have now used schemas for request bodies and for configuration. The next lesson looks at schemas in depth: coercion, transformations, refinements, and validating what goes *out* as well as what comes in.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
