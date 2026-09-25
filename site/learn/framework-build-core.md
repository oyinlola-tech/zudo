---
title: "Build a mini framework, part 1: the core — ZudoJS Academy"
description: "Build the core of a small TypeScript framework (container, config, logger, lifecycle with rollback, application object) and compare each part with ZudoJS."
source: https://zudojs.oyinlola.site/learn/framework-build-core
---

LEVEL 11 · LESSON 10 OF 12

Framework engineering Core

# Build a mini framework, part 1: the core

Build the core of a small TypeScript framework (container, config, logger, lifecycle with rollback, application object) and compare each part with ZudoJS.

- **60 min** to read and try
- **You need:** What a framework does, A type-safe dependency injection container, and Clean architecture: ports and adapters
- **You build:** The core of a miniature TypeScript framework: a container with tokens, lifetimes and disposal, a typed config loader, a structured logger, a lifecycle with ordered start, reverse stop, timeouts and rollback, and an application object that runs the BookStore's modules

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what each core part of a backend framework does and which failure it prevents
- Build a container with typed tokens, three lifetimes, captive-dependency checks and disposal
- Load layered, typed, frozen configuration that reports every problem at once and hides secrets
- Write a structured logger with levels, child loggers and redaction that never crashes the caller
- Start components in dependency order, stop them in reverse, time them out and roll back a failed start
- Map each part to the ZudoJS package that does the same job and name the differences

## The startup script that grew

Every backend has a file that starts it. In [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture#composition) it was a dozen lines. A year later it reads settings, connects a database and a cache, starts a queue worker and an HTTP server, and nobody enjoys touching it. Here is its shape, with fakes instead of real connections, on the day someone typed `PORT=80x`:

hand-wired.ts

```ts
const env: Record<string, string | undefined> = { PORT: "80x", DATABASE_URL: "postgres://shop:pa55word@db.internal/shop" };
const open: string[] = [];

async function connectDatabase(url: string): Promise<void> {
  open.push(`database ${new URL(url).host}`);
}

async function connectCache(): Promise<void> {
  open.push("cache");
}

async function listen(port: number): Promise<void> {
  if (!Number.isInteger(port)) throw new Error(`listen: invalid port ${port}`);
  open.push(`http :${port}`);
}

const port = Number(env.PORT ?? "3000");
const sessionSecret = env.SESSION_SECRET ?? "";
console.log("config:", JSON.stringify({ port, sessionSecret, databaseUrl: env.DATABASE_URL }));

try {
  await connectDatabase(env.DATABASE_URL!);
  await connectCache();
  await listen(port);
} catch (error) {
  console.log("startup failed:", (error as Error).message);
}
console.log("still open:", open);
```

Output of `npx tsx hand-wired.ts` and of the browser terminal

```ts
config: {"port":null,"sessionSecret":"","databaseUrl":"postgres://shop:pa55word@db.internal/shop"}
startup failed: listen: invalid port NaN
still open: [ 'database db.internal', 'cache' ]
```

Four bugs in twenty lines, and all of them are normal:

- `Number("80x")` is `NaN`, and nothing complained until `listen` failed, far from the typo. `JSON.stringify` even printed it as `null`.
- The missing `SESSION_SECRET` silently became an empty string, which would sign every session with nothing.
- The configuration log printed the database password.
- Startup failed halfway, and the database and cache connections stayed open. A real process would now hang instead of exiting, or keep a connection slot on the database forever.

A framework is mostly the code that prevents this class of bug once, for every app. In [What a framework does](https://zudojs.oyinlola.site/learn/frameworks) you built 40 lines that started modules in order. This lesson and the next build a real miniature framework in TypeScript: in this part the core (container, configuration, logger, lifecycle and the application object), in [part 2](https://zudojs.oyinlola.site/learn/framework-build-http) the HTTP layer. After each part you compare your code with the ZudoJS package that does the same job, so none of it is magic.

## What must start and stop promise?

REASON IT OUT

### The contract of an application object

You are about to write `app.start()` and `app.stop()`. Before any code, decide what they must guarantee:

- Settings are wrong in three places. Should the app report the first problem, or all three? When: before or after connecting to anything?
- The third of five components fails to start. What happens to the first two?
- A component's `start` never returns (a database that accepts the connection and then says nothing). What should the app do?
- The orchestrator sends `SIGTERM` while a deploy is rolling out, and a developer presses Ctrl+C at the same moment. `stop()` is called twice. What happens?
- One component's `stop` throws. Do the others still stop?
- Which objects exist once per process, which once per request, and who closes them?

**Show the reasoning**

**Configuration** is checked completely, before anything connects, and every problem is reported at once: fixing one typo per deploy attempt wastes an hour. Secrets never reach a log.

**A failed start rolls back:** the components that already started are stopped, in reverse order, and the app ends in a clear `failed` state with the original error attached. Nothing stays half-open.

**Every start and stop has a timeout.** A hung dependency must turn into an error with a name on it, not a process that never becomes ready.

**`stop` is idempotent:** calling it twice stops each component once; the second caller waits for the first. A failing `stop` is logged and the others still run, because leaving the database open is worse than a noisy log.

**Lifetimes are explicit:** a connection pool lives as long as the process, a shopping cart as long as one request, and whoever created an object is responsible for closing it. That is the container's job.

```ts
  createApp({ config, logger, modules })
      │
      ├── config     loadConfig(schema, sources…)   typed, frozen, checked up front
      ├── logger     createLogger(…)                levels, fields, redaction
      ├── container  Container                      tokens, lifetimes, disposal
      └── lifecycle  Lifecycle                      order, timeouts, rollback, stop
            ▲
            │ one component per module:  register → start → … → stop → dispose
      modules: database, catalog, http, …   (your code: the framework calls it)
```

The pieces of part 1. You write modules; the application object decides when to call them.

## The container

[A type-safe dependency injection container](https://zudojs.oyinlola.site/learn/ts-typed-di) built a container in depth: typed tokens, the three lifetimes and the captive-dependency rule. The framework's container is the same design in a compact form, plus the one thing a framework needs that a standalone container can skip: **disposal**. When a scope or the app ends, every object the container created and cached is closed, newest first, because newer objects may depend on older ones.

mini/container.ts

```ts
export class Token<T> {
  declare readonly __type: T;
  constructor(readonly name: string) {}
}

export type Lifetime = "singleton" | "scoped" | "transient";
type Values<D> = { -readonly [K in keyof D]: D[K] extends Token<infer U> ? U : never };

interface Registration {
  readonly lifetime: Lifetime;
  readonly deps: readonly Token<unknown>[];
  readonly create: (...deps: never[]) => unknown;
}

export interface Resolver {
  resolve<T>(token: Token<T>): T;
}

class Instances {
  readonly byToken = new Map<Token<unknown>, unknown>();
  readonly created: unknown[] = [];

  async dispose(): Promise<void> {
    for (const instance of this.created.reverse()) {
      if (typeof instance === "object" && instance !== null && "dispose" in instance && typeof instance.dispose === "function") {
        await instance.dispose();
      }
    }
    this.byToken.clear();
    this.created.length = 0;
  }
}

export class Container implements Resolver {
  readonly #registrations = new Map<Token<unknown>, Registration>();
  readonly #singletons = new Instances();

  register<T, const D extends readonly Token<unknown>[] = []>(
    token: Token<T>,
    options: { readonly lifetime: Lifetime; readonly deps?: D; readonly factory: (...deps: Values<D>) => T },
  ): this {
    if (this.#registrations.has(token)) throw new Error(`${token.name} is already registered`);
    const { lifetime, deps = [], factory } = options;
    this.#registrations.set(token, { lifetime, deps, create: factory as (...deps: never[]) => unknown });
    return this;
  }

  value<T>(token: Token<T>, value: T): this {
    return this.register(token, { lifetime: "singleton", factory: () => value });
  }

  resolve<T>(token: Token<T>): T {
    return this.#resolve(token, undefined, []);
  }

  createScope(): Resolver & { dispose(): Promise<void> } {
    const scoped = new Instances();
    return { resolve: (token) => this.#resolve(token, scoped, []), dispose: () => scoped.dispose() };
  }

  dispose(): Promise<void> {
    return this.#singletons.dispose();
  }

  #resolve<T>(token: Token<T>, scope: Instances | undefined, path: readonly Token<unknown>[]): T {
    const chain = [...path, token].map((t) => t.name).join(" -> ");
    if (path.includes(token)) throw new Error(`circular dependency: ${chain}`);
    const registration = this.#registrations.get(token);
    if (registration === undefined) throw new Error(`nothing registered for ${token.name} (${chain})`);

    let store: Instances | undefined;
    if (registration.lifetime === "singleton") store = this.#singletons;
    if (registration.lifetime === "scoped") {
      if (path.some((t) => this.#registrations.get(t)?.lifetime === "singleton")) {
        throw new Error(`a singleton cannot depend on scoped ${token.name} (${chain})`);
      }
      if (scope === undefined) throw new Error(`${token.name} is scoped: resolve it from a scope`);
      store = scope;
    }
    if (store?.byToken.has(token)) return store.byToken.get(token) as T;

    const args = registration.deps.map((dep) => this.#resolve(dep, scope, [...path, token]));
    const instance = (registration.create as (...deps: unknown[]) => T)(...args);
    store?.byToken.set(token, instance);
    store?.created.push(instance);
    return instance;
  }
}
```

- `Token<T>` is a runtime key that carries a type, so `resolve(POOL)` returns a `Pool` without a cast at the call site.
- The `const D` type parameter makes `deps: [CART]` a tuple, and `Values<D>` turns it into the factory's parameter types: swap two dependencies and the registration no longer compiles.
- `Instances` remembers what it created. `dispose()` calls `dispose()` on every instance that has one, in reverse creation order. Transient instances are not tracked: they belong to whoever asked for them, and tracking them would keep every one alive forever.

try-container.ts

```ts
import { Container, Token } from "./mini/container.js";

class Cart {
  readonly items: string[] = [];
  dispose(): void {
    console.log(`  cart with ${this.items.length} items released`);
  }
}

class Pool {
  dispose(): void {
    console.log("  pool closed");
  }
}

const POOL = new Token<Pool>("Pool");
const CART = new Token<Cart>("Cart");
const RECEIPT = new Token<string>("Receipt");
const REPORT = new Token<string>("Report");

let receipts = 0;
const container = new Container()
  .register(POOL, { lifetime: "singleton", factory: () => new Pool() })
  .register(CART, { lifetime: "scoped", factory: () => new Cart() })
  .register(RECEIPT, { lifetime: "transient", deps: [CART], factory: (cart) => `receipt ${++receipts}: ${cart.items.join(", ")}` })
  .register(REPORT, { lifetime: "singleton", deps: [CART], factory: (cart) => `${cart.items.length} items` });

const request = container.createScope();
request.resolve(CART).items.push("RICE-50KG");
request.resolve(CART).items.push("OIL-5L");
console.log(request.resolve(RECEIPT));
console.log(request.resolve(RECEIPT));
console.log("same pool:", request.resolve(POOL) === container.resolve(POOL));

for (const attempt of [() => container.resolve(CART), () => request.resolve(REPORT), () => container.resolve(new Token("Mailer"))]) {
  try {
    attempt();
  } catch (error) {
    console.log("error:", (error as Error).message);
  }
}

console.log("end of request:");
await request.dispose();
console.log("shutdown:");
await container.dispose();
```

Output of `npx tsx try-container.ts` and of the browser terminal

```ts
receipt 1: RICE-50KG, OIL-5L
receipt 2: RICE-50KG, OIL-5L
same pool: true
error: Cart is scoped: resolve it from a scope
error: a singleton cannot depend on scoped Cart (Report -> Cart)
error: nothing registered for Mailer (Mailer)
end of request:
  cart with 2 items released
shutdown:
  pool closed
```

Both receipts saw the same cart, because the cart is scoped and both were built inside one request scope. The three wiring mistakes fail with messages that name the chain. Ending the request released its cart; shutting down closed the pool. In the next part, the HTTP layer creates one scope per request and disposes it when the response is sent.

## Configuration

Configuration comes from **layers**: defaults in the code, a `.env` file on a developer's machine, and real environment variables in production, where later layers win. The framework's job is to merge the layers, **parse** the text into typed values, **check** every value, and **freeze** the result. A schema describes each setting once; the TypeScript type of the config is computed from it with a mapped type ([Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types)), so the schema and the type cannot drift apart:

mini/config.ts

```ts
type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

export interface Setting<T> {
  readonly env: string;
  readonly parse: (raw: string) => Parsed<T>;
  readonly fallback?: T;
  readonly secret?: boolean;
}

export type Env = Readonly<Record<string, string | undefined>>;
export type ConfigOf<S> = { readonly [K in keyof S]: S[K] extends Setting<infer T> ? T : never };

const good = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (problem: string): Parsed<never> => ({ ok: false, problem });

export const setting = {
  string(env: string, options: { fallback?: string; secret?: boolean; minLength?: number } = {}): Setting<string> {
    const min = options.minLength ?? 1;
    return { env, ...options, parse: (raw) => (raw.length >= min ? good(raw) : bad(`must be at least ${min} characters`)) };
  },
  integer(env: string, options: { fallback?: number; min?: number; max?: number } = {}): Setting<number> {
    const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
    const parse = (raw: string) =>
      /^\d+$/.test(raw) && Number(raw) >= min && Number(raw) <= max ? good(Number(raw)) : bad(`must be a whole number from ${min} to ${max}, got "${raw}"`);
    return { env, ...options, parse };
  },
  oneOf<const V extends string>(env: string, values: readonly V[], options: { fallback?: V } = {}): Setting<V> {
    const parse = (raw: string) => {
      const found = values.find((value) => value === raw);
      return found === undefined ? bad(`must be one of ${values.join(", ")}, got "${raw}"`) : good(found);
    };
    return { env, ...options, parse };
  },
};

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`invalid configuration: ${problems.join("; ")}`);
    this.name = "ConfigError";
  }
}

export function loadConfig<S extends Record<string, Setting<unknown>>>(schema: S, ...sources: Env[]): ConfigOf<S> {
  const config: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [key, spec] of Object.entries(schema)) {
    const raw = sources.reduce<string | undefined>((found, source) => source[spec.env] ?? found, undefined);
    if (raw === undefined) {
      if (spec.fallback === undefined) problems.push(`${spec.env} is required`);
      else config[key] = spec.fallback;
      continue;
    }
    const parsed = spec.parse(raw.trim());
    if (parsed.ok) config[key] = parsed.value;
    else problems.push(`${spec.env} ${parsed.problem}`);
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return Object.freeze(config) as ConfigOf<S>;
}

export function safeView<S extends Record<string, Setting<unknown>>>(schema: S, config: ConfigOf<S>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(schema).map((key) => [key, schema[key]!.secret ? "[secret]" : config[key as keyof S]]));
}
```

- Each `Setting<T>` knows its environment variable, how to parse it, its fallback and whether it is secret. `parse` returns a small result instead of throwing, so `loadConfig` can collect every problem.
- `oneOf` uses a `const` type parameter, so `["debug", "info", "warn", "error"]` becomes the union `"debug" | "info" | "warn" | "error"`, not `string`.
- `ConfigOf<S>` maps each key of the schema to the type inside its `Setting`, all `readonly`. At runtime, `Object.freeze` makes the same promise.
- `safeView` is what you log: secrets replaced, everything else visible.

The BookStore's settings, described once:

shop-config.ts

```ts
import { setting } from "./mini/config.js";
import type { ConfigOf } from "./mini/config.js";

export const schema = {
  port: setting.integer("PORT", { fallback: 3000, min: 1, max: 65535 }),
  databaseUrl: setting.string("DATABASE_URL", { secret: true }),
  logLevel: setting.oneOf("LOG_LEVEL", ["debug", "info", "warn", "error"], { fallback: "info" }),
  sessionSecret: setting.string("SESSION_SECRET", { secret: true, minLength: 32 }),
};

export type BookStoreConfig = ConfigOf<typeof schema>;
```

try-config.ts

```ts
import { schema } from "./shop-config.js";
import { ConfigError, loadConfig, safeView } from "./mini/config.js";

const envFile = { PORT: "8080", LOG_LEVEL: "debug", DATABASE_URL: "postgres://dev@localhost/shop" };
const processEnv = {
  LOG_LEVEL: "warn",
  DATABASE_URL: "postgres://shop:pa55word@db.internal/shop",
  SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe",
};

const config = loadConfig(schema, envFile, processEnv);
console.log(safeView(schema, config));
console.log(typeof config.port, Object.isFrozen(config));

try {
  loadConfig(schema, { PORT: "80x", LOG_LEVEL: "verbose", SESSION_SECRET: "letmein" });
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  for (const problem of error.problems) console.log("-", problem);
}
```

Output of `npx tsx try-config.ts` and of the browser terminal

```json
{
  port: 8080,
  databaseUrl: '[secret]',
  logLevel: 'warn',
  sessionSecret: '[secret]'
}
number true
- PORT must be a whole number from 1 to 65535, got "80x"
- DATABASE_URL is required
- LOG_LEVEL must be one of debug, info, warn, error, got "verbose"
- SESSION_SECRET must be at least 32 characters
```

The port came from the `.env` file, the log level and database URL from the real environment, which wins. The port is a number, not the text `"8080"`, and both secrets are hidden. The bad settings produced all four problems in one error, before anything tried to connect. The types catch a different class of mistake, at compile time:

config-types.ts

```ts
import { schema } from "./shop-config.js";
import { loadConfig } from "./mini/config.js";

const config = loadConfig(schema, { DATABASE_URL: "postgres://localhost/shop", SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe" });
config.port = 9000;
if (config.logLevel === "verbose") console.log("very chatty");
```

What `npx tsc --noEmit` prints

```ts
config-types.ts:5:8 - error TS2540: Cannot assign to 'port' because it is a read-only property.

5 config.port = 9000;
         ~~~~

config-types.ts:6:5 - error TS2367: This comparison appears to be unintentional because the types '"debug" | "error" | "info" | "warn"' and '"verbose"' have no overlap.

6 if (config.logLevel === "verbose") console.log("very chatty");
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: config-types.ts:5
```

## The logger

`console.log("user logged in " + user)` is fine on your laptop. In production, logs are read by programs: a log store indexes them and a person searches them at 3 a.m. So a framework logger writes **structured** entries (one JSON object per line, with named fields), filters by **level**, lets code add fields for a whole request through **child loggers**, **redacts** secrets by field name, and never lets a logging failure break the request that tried to log.

mini/logger.ts

```ts
export type Level = "debug" | "info" | "warn" | "error";
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /pass(word)?|secret|token|authorization|api_?key/i;
const RESERVED = new Set(["time", "level", "message"]);

export interface LogEntry {
  readonly time: string;
  readonly level: Level;
  readonly message: string;
  readonly [field: string]: unknown;
}

export type Sink = (entry: LogEntry) => void;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  readonly level: Level;
  readonly sink?: Sink;
  readonly clock?: () => Date;
  readonly fields?: Record<string, unknown>;
}

export const jsonLines: Sink = (entry) => console.log(JSON.stringify(entry));

function clean(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !RESERVED.has(key)).map(([key, value]) => {
      if (SECRET_KEY.test(key)) return [key, "[redacted]"];
      if (value instanceof Error) return [key, { name: value.name, message: value.message }];
      return [key, value];
    }),
  );
}

export function createLogger(options: LoggerOptions): Logger {
  const { level, sink = jsonLines, clock = () => new Date(), fields: bound = {} } = options;
  const write = (entryLevel: Level) => (message: string, fields: Record<string, unknown> = {}) => {
    if (RANK[entryLevel] < RANK[level]) return;
    try {
      sink({ time: clock().toISOString(), level: entryLevel, message, ...clean({ ...bound, ...fields }) });
    } catch {
      // A broken sink must never crash the request that tried to log.
    }
  };
  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    child: (fields) => createLogger({ ...options, fields: { ...bound, ...fields } }),
  };
}

export const textLines: Sink = ({ time, level, message, ...fields }) => {
  const extra = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
  console.log(`${level.padEnd(5)} ${message}${extra ? " " + extra : ""}`);
};
```

The clock and the sink are injected, like the ports in [Clean architecture](https://zudojs.oyinlola.site/learn/arch-clean), so the output below is exact:

try-logger.ts

```ts
import { createLogger } from "./mini/logger.js";
import type { LogEntry } from "./mini/logger.js";

const entries: LogEntry[] = [];
const logger = createLogger({
  level: "info",
  sink: (entry) => entries.push(entry),
  clock: () => new Date("2026-09-24T09:00:00Z"),
  fields: { service: "bookstore" },
});

logger.debug("cache miss", { key: "book:b1" });
const request = logger.child({ requestId: "req-7" });
request.info("login", { user: "ada", password: "pa55word" });
request.error("payment failed", { orderId: "ord-1", error: new Error("card declined") });
request.warn("odd field", { level: "fatal" });

for (const entry of entries) console.log(JSON.stringify(entry));

const fragile = createLogger({ level: "info", sink: () => { throw new Error("disk full"); } });
fragile.info("this line is lost");
console.log("the program carried on");
```

Output of `npx tsx try-logger.ts` and of the browser terminal

```json
{"time":"2026-09-24T09:00:00.000Z","level":"info","message":"login","service":"bookstore","requestId":"req-7","user":"ada","password":"[redacted]"}
{"time":"2026-09-24T09:00:00.000Z","level":"error","message":"payment failed","service":"bookstore","requestId":"req-7","orderId":"ord-1","error":{"name":"Error","message":"card declined"}}
{"time":"2026-09-24T09:00:00.000Z","level":"warn","message":"odd field","service":"bookstore","requestId":"req-7"}
the program carried on
```

- The `debug` entry was dropped: the level is `info`.
- The child logger added `requestId` to every entry; the root added `service`. Searching for `req-7` now finds the whole request.
- The password was redacted because of its field *name*. The `Error` became its name and message, because `JSON.stringify(new Error("x"))` is `{}`: an error's properties are not enumerable.
- A field called `level` could not overwrite the real level, and a sink that threw did not crash the program.

## The lifecycle

The lifecycle turns the reasoning above into code: a dependency-ordered start (the topological sort from [What a framework does](https://zudojs.oyinlola.site/learn/frameworks#mini), now naming the whole cycle), a timeout around every start and stop, rollback on failure, a reverse stop that keeps going when one component fails, and an explicit state:

mini/lifecycle.ts

```ts
import type { Logger } from "./logger.js";

export interface Component {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export type LifecycleState = "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";

export class StartupError extends Error {
  constructor(readonly component: string, options: { cause: unknown }) {
    super(`${component} failed to start`, options);
    this.name = "StartupError";
  }
}

export function startOrder(components: readonly Component[]): Component[] {
  const byName = new Map(components.map((c) => [c.name, c]));
  const ordered: Component[] = [];
  const visiting = new Set<string>();
  const visit = (component: Component, path: readonly string[]): void => {
    if (ordered.includes(component)) return;
    if (visiting.has(component.name)) throw new Error(`circular dependency: ${[...path, component.name].join(" -> ")}`);
    visiting.add(component.name);
    for (const name of component.dependsOn ?? []) {
      const dependency = byName.get(name);
      if (dependency === undefined) throw new Error(`${component.name} depends on ${name}, which is not registered`);
      visit(dependency, [...path, component.name]);
    }
    ordered.push(component);
  };
  for (const component of components) visit(component, []);
  return ordered;
}

async function withTimeout(work: void | Promise<void>, ms: number, what: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class Lifecycle {
  state: LifecycleState = "idle";
  readonly #components: Component[] = [];
  #started: Component[] = [];
  #stopping: Promise<void> | undefined;

  constructor(private readonly log: Logger, private readonly timeoutMs = 5_000) {}

  add(component: Component): void {
    if (this.state !== "idle") throw new Error(`cannot add ${component.name} while ${this.state}`);
    this.#components.push(component);
  }

  async start(): Promise<void> {
    if (this.state !== "idle") throw new Error(`cannot start while ${this.state}`);
    this.state = "starting";
    for (const component of startOrder(this.#components)) {
      try {
        await withTimeout(component.start?.(), this.timeoutMs, `${component.name} start`);
      } catch (error) {
        this.log.error("start failed, rolling back", { component: component.name, error });
        await this.#stopStarted();
        this.state = "failed";
        throw new StartupError(component.name, { cause: error });
      }
      this.#started.push(component);
      this.log.info("started", { component: component.name });
    }
    this.state = "running";
  }

  stop(): Promise<void> {
    if (this.state !== "running") return this.#stopping ?? Promise.resolve();
    this.state = "stopping";
    this.#stopping = this.#stopStarted().then(() => {
      this.state = "stopped";
    });
    return this.#stopping;
  }

  async #stopStarted(): Promise<void> {
    for (const component of this.#started.reverse()) {
      try {
        await withTimeout(component.stop?.(), this.timeoutMs, `${component.name} stop`);
        this.log.info("stopped", { component: component.name });
      } catch (error) {
        this.log.error("stop failed, continuing", { component: component.name, error });
      }
    }
    this.#started = [];
  }
}
```

- `withTimeout` races the work against a timer and clears the timer either way; a timer left running would keep Node alive after shutdown.
- `StartupError` wraps the original error as its `cause` ([Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design)), so the message says *which* component failed and the cause says *why*.
- `stop()` returns the same promise to every caller while stopping is in progress, so two signals cannot stop anything twice.

try-lifecycle.ts

```ts
import { Lifecycle, StartupError } from "./mini/lifecycle.js";
import type { Component } from "./mini/lifecycle.js";
import { createLogger } from "./mini/logger.js";

const quiet = createLogger({ level: "error", sink: ({ message, component }) => console.log(`  [log] ${message}: ${String(component)}`) });

function part(name: string, dependsOn: string[] = [], failWith?: string): Component {
  return {
    name,
    dependsOn,
    start: () => {
      if (failWith) throw new Error(failWith);
      console.log(`start ${name}`);
    },
    stop: () => console.log(`stop  ${name}`),
  };
}

const ok = new Lifecycle(quiet);
[part("http", ["queue"]), part("queue", ["database"]), part("database")].forEach((c) => ok.add(c));
await ok.start();
await Promise.all([ok.stop(), ok.stop()]);
console.log("state:", ok.state);

const broken = new Lifecycle(quiet);
[part("database"), part("queue", ["database"]), part("http", ["queue"], "EADDRINUSE :8080")].forEach((c) => broken.add(c));
try {
  await broken.start();
} catch (error) {
  if (!(error instanceof StartupError)) throw error;
  console.log(`${error.message} (${(error.cause as Error).message}); state: ${broken.state}`);
}

const hanging = new Lifecycle(quiet, 50);
hanging.add({ name: "search-index", start: () => new Promise<void>(() => {}) });
await hanging.start().catch((error: Error) => console.log(error.message, "->", (error.cause as Error).message));
```

Output of `npx tsx try-lifecycle.ts` and of the browser terminal

```ts
start database
start queue
start http
stop  http
stop  queue
stop  database
state: stopped
start database
start queue
  [log] start failed, rolling back: http
stop  queue
stop  database
http failed to start (EADDRINUSE :8080); state: failed
  [log] start failed, rolling back: search-index
search-index failed to start -> search-index start timed out after 50 ms
```

Three scenarios, three guarantees. The components were listed in the wrong order and started in the right one, and two concurrent `stop()` calls stopped each component once. When `http` failed, `queue` and `database` were stopped in reverse and the state is `failed`. The search index that never answered became an error after 50 ms instead of a process that never became ready.

## The application object

The application object connects the parts. It is small, because each part does its own job. You describe a **module**: a name, its dependencies, and optional `register` (add providers to the container), `start` and `stop` hooks. The framework calls them: `register` at creation, `start` in dependency order, `stop` in reverse, and finally it disposes the container. This is inversion of control in its full form.

mini/app.ts

```ts
import { Container, Token } from "./container.js";
import type { Resolver } from "./container.js";
import { Lifecycle } from "./lifecycle.js";
import type { LifecycleState } from "./lifecycle.js";
import type { Logger } from "./logger.js";

export const LOGGER = new Token<Logger>("Logger");

export interface ModuleContext<C> {
  readonly config: C;
  readonly logger: Logger;
  readonly container: Resolver;
}

export interface Module<C> {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  register?(container: Container, config: C): void;
  start?(context: ModuleContext<C>): void | Promise<void>;
  stop?(context: ModuleContext<C>): void | Promise<void>;
}

export interface App {
  readonly state: LifecycleState;
  readonly container: Resolver;
  start(): Promise<void>;
  stop(): Promise<void>;
  stopOnSignals(signals?: readonly NodeJS.Signals[]): void;
}

export function createApp<C>(options: { config: C; logger: Logger; modules: readonly Module<C>[]; timeoutMs?: number }): App {
  const { config, logger, modules } = options;
  const container = new Container().value(LOGGER, logger);
  const lifecycle = new Lifecycle(logger.child({ scope: "lifecycle" }), options.timeoutMs);

  for (const module of modules) {
    module.register?.(container, config);
    const context: ModuleContext<C> = { config, container, logger: logger.child({ module: module.name }) };
    lifecycle.add({
      name: module.name,
      dependsOn: module.dependsOn ?? [],
      start: () => module.start?.(context),
      stop: () => module.stop?.(context),
    });
  }

  return {
    get state() {
      return lifecycle.state;
    },
    container,
    start: () => lifecycle.start(),
    async stop() {
      await lifecycle.stop();
      await container.dispose();
    },
    stopOnSignals(signals = ["SIGINT", "SIGTERM"]) {
      for (const signal of signals) {
        process.once(signal, () => {
          logger.info("signal received, stopping", { signal });
          this.stop().then(
            () => process.exit(0),
            () => process.exit(1),
          );
        });
      }
    },
  };
}
```

Each module gets a context with the typed config, a child logger named after the module, and the container. The BookStore's three modules: `database` registers a `FakeDatabase` singleton and connects it on start (the container will close it, because it has a `dispose` method); `catalog` depends on it and warms up by reading the books; `http` depends on the catalog and, in this part, only pretends to listen:

bookstore.ts

```ts
import { LOGGER } from "./mini/app.js";
import type { Module } from "./mini/app.js";
import { Token } from "./mini/container.js";
import type { Logger } from "./mini/logger.js";
import type { BookStoreConfig } from "./shop-config.js";

export interface Book {
  readonly id: string;
  readonly title: string;
  readonly priceKobo: number;
}

export class FakeDatabase {
  connected = false;
  constructor(private readonly url: string, private readonly log: Logger) {}

  async connect(): Promise<void> {
    if (this.url.includes("down")) throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    this.connected = true;
    this.log.info("database connected");
  }

  async dispose(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.log.info("database closed");
  }

  async books(): Promise<Book[]> {
    if (!this.connected) throw new Error("database is not connected");
    return [{ id: "b1", title: "Things Fall Apart", priceKobo: 450_000 }, { id: "b2", title: "Half of a Yellow Sun", priceKobo: 750_000 }];
  }
}

export class BookCatalog {
  constructor(private readonly db: FakeDatabase) {}

  async list(): Promise<Book[]> {
    return this.db.books();
  }

  async find(id: string): Promise<Book | undefined> {
    return (await this.db.books()).find((book) => book.id === id);
  }
}

export const DATABASE = new Token<FakeDatabase>("Database");
export const CATALOG = new Token<BookCatalog>("BookCatalog");

export const databaseModule: Module<BookStoreConfig> = {
  name: "database",
  register(container, config) {
    container.register(DATABASE, {
      lifetime: "singleton",
      deps: [LOGGER],
      factory: (log) => new FakeDatabase(config.databaseUrl, log.child({ module: "database" })),
    });
  },
  start: ({ container }) => container.resolve(DATABASE).connect(),
};

export const catalogModule: Module<BookStoreConfig> = {
  name: "catalog",
  dependsOn: ["database"],
  register(container) {
    container.register(CATALOG, { lifetime: "singleton", deps: [DATABASE], factory: (db) => new BookCatalog(db) });
  },
  async start({ container, logger }) {
    logger.info("catalog warmed", { books: (await container.resolve(CATALOG).list()).length });
  },
};

export const httpModule: Module<BookStoreConfig> = {
  name: "http",
  dependsOn: ["catalog"],
  start: ({ config, logger }) => logger.info("listening", { port: config.port }),
  stop: ({ logger }) => logger.info("no longer accepting requests"),
};
```

Run them, listed in the wrong order on purpose:

run-app.ts

```ts
import { catalogModule, databaseModule, httpModule } from "./bookstore.js";
import { schema } from "./shop-config.js";
import { createApp } from "./mini/app.js";
import { loadConfig } from "./mini/config.js";
import { createLogger, textLines } from "./mini/logger.js";

const env = { DATABASE_URL: "postgres://shop:pa55word@db.internal/shop", SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe", PORT: "8080" };
const config = loadConfig(schema, env);
const logger = createLogger({ level: config.logLevel, sink: textLines });

const app = createApp({ config, logger, modules: [httpModule, catalogModule, databaseModule] });
await app.start();
console.log("state:", app.state);
await app.stop();
console.log("state:", app.state);
```

Output of `npx tsx run-app.ts` and of the browser terminal

```ts
info  database connected module="database"
info  started scope="lifecycle" component="database"
info  catalog warmed module="catalog" books=2
info  started scope="lifecycle" component="catalog"
info  listening module="http" port=8080
info  started scope="lifecycle" component="http"
state: running
info  no longer accepting requests module="http"
info  stopped scope="lifecycle" component="http"
info  stopped scope="lifecycle" component="catalog"
info  stopped scope="lifecycle" component="database"
info  database closed module="database"
state: stopped
```

Start went database → catalog → http; stop went the other way, and the container closed the database last, because it created it. Every line carries the module or the lifecycle scope that wrote it. Now the database is down, and a `metrics` module without dependencies has already started:

run-app-fail.ts

```ts
import { catalogModule, databaseModule, httpModule } from "./bookstore.js";
import { schema } from "./shop-config.js";
import type { BookStoreConfig } from "./shop-config.js";
import { createApp } from "./mini/app.js";
import type { Module } from "./mini/app.js";
import { loadConfig } from "./mini/config.js";
import { createLogger, textLines } from "./mini/logger.js";

const env = { DATABASE_URL: "postgres://shop@db-down.internal/shop", SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe" };
const config = loadConfig(schema, env);
const logger = createLogger({ level: "info", sink: textLines });

const metrics: Module<BookStoreConfig> = {
  name: "metrics",
  start: ({ logger }) => logger.info("metrics exporter on"),
  stop: ({ logger }) => logger.info("metrics exporter off"),
};

const app = createApp({ config, logger, modules: [metrics, databaseModule, catalogModule, httpModule] });
try {
  await app.start();
} catch (error) {
  console.log(`${(error as Error).message}: ${((error as Error).cause as Error).message}`);
}
console.log("state:", app.state);
```

Output of `npx tsx run-app-fail.ts` and of the browser terminal

```ts
info  metrics exporter on module="metrics"
info  started scope="lifecycle" component="metrics"
error start failed, rolling back scope="lifecycle" component="database" error={"name":"Error","message":"connect ECONNREFUSED 10.0.0.5:5432"}
info  metrics exporter off module="metrics"
info  stopped scope="lifecycle" component="metrics"
database failed to start: connect ECONNREFUSED 10.0.0.5:5432
state: failed
```

The failure was logged once with its cause, the metrics exporter was stopped, and the process can exit cleanly with a non-zero code. Compare that with the opening script, which left two connections open.

### Signals

In production, an orchestrator such as Kubernetes or systemd stops a process by sending `SIGTERM` and, if it is still alive some seconds later, killing it. `stopOnSignals` turns that signal into a graceful stop. This example sends `SIGTERM` to its own process; it needs Node, not the browser:

signals.tsNode.js only

```ts
import { catalogModule, databaseModule, httpModule } from "./bookstore.js";
import { schema } from "./shop-config.js";
import { createApp } from "./mini/app.js";
import { loadConfig } from "./mini/config.js";
import { createLogger, textLines } from "./mini/logger.js";

const config = loadConfig(schema, { DATABASE_URL: "postgres://localhost/shop", SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe" });
const logger = createLogger({ level: "info", sink: textLines });
const app = createApp({ config, logger, modules: [databaseModule, catalogModule, httpModule] });

app.stopOnSignals();
await app.start();
logger.warn("pretending an orchestrator sent SIGTERM");
process.kill(process.pid, "SIGTERM");
```

Output of `npx tsx signals.ts`

```ts
info  database connected module="database"
info  started scope="lifecycle" component="database"
info  catalog warmed module="catalog" books=2
info  started scope="lifecycle" component="catalog"
info  listening module="http" port=3000
info  started scope="lifecycle" component="http"
warn  pretending an orchestrator sent SIGTERM
info  signal received, stopping signal="SIGTERM"
info  no longer accepting requests module="http"
info  stopped scope="lifecycle" component="http"
info  stopped scope="lifecycle" component="catalog"
info  stopped scope="lifecycle" component="database"
info  database closed module="database"
```

The handler ran `stop()`, every module stopped in reverse, the database closed, and the process exited with code 0. Without the handler, Node's default for `SIGTERM` is to exit at once, mid-request. The handlers use `process.once`, so a second Ctrl+C falls back to that default and kills a shutdown that is stuck: a deliberate escape hatch.

## Testing the framework

A framework is code that many apps depend on, so its guarantees need tests of their own. Each promise from the reasoning section becomes a test, with silent loggers and fake components:

tests/framework.test.ts

```ts
import { schema } from "../shop-config.js";
import { ConfigError, loadConfig } from "../mini/config.js";
import { Lifecycle } from "../mini/lifecycle.js";
import { createLogger } from "../mini/logger.js";

async function test(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function expect(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const silent = createLogger({ level: "error", sink: () => {} });

function recorder(): { calls: string[]; lifecycle: Lifecycle } {
  const calls: string[] = [];
  const lifecycle = new Lifecycle(silent);
  for (const [name, deps, fails] of [["a", [], false], ["b", ["a"], false], ["c", ["b"], true]] as const) {
    lifecycle.add({
      name,
      dependsOn: deps,
      start: () => {
        calls.push(`start ${name}`);
        if (fails) throw new Error("boom");
      },
      stop: () => {
        calls.push(`stop ${name}`);
      },
    });
  }
  return { calls, lifecycle };
}

await test("a failed start stops what already started, in reverse", async () => {
  const { calls, lifecycle } = recorder();
  await lifecycle.start().catch(() => {});
  expect(calls, ["start a", "start b", "start c", "stop b", "stop a"]);
  expect(lifecycle.state, "failed");
});

await test("stop() twice stops each component once", async () => {
  const calls: string[] = [];
  const lifecycle = new Lifecycle(silent);
  lifecycle.add({ name: "db", stop: () => { calls.push("stop db"); } });
  await lifecycle.start();
  await Promise.all([lifecycle.stop(), lifecycle.stop()]);
  expect(calls, ["stop db"]);
});

await test("configuration reports every problem at once", () => {
  try {
    loadConfig(schema, {});
    throw new Error("expected a ConfigError");
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    expect(error.problems, ["DATABASE_URL is required", "SESSION_SECRET is required"]);
  }
});
```

Output of `npx tsx tests/framework.test.ts` and of the browser terminal

```ts
PASS a failed start stops what already started, in reverse
PASS stop() twice stops each component once
PASS configuration reports every problem at once
```

The first test records every call, so it checks the order of the rollback, not just that one happened. The second calls `stop` twice at the same moment, which is exactly what two signals do.

## The same jobs in ZudoJS

Every part you built exists as a ZudoJS package. The same scenarios, run against the published packages, show where they agree with your design and where they made other choices.

### Container: @zudojs/container

zudo-container.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

class Cart {
  readonly items: string[] = [];
  dispose(): void {
    console.log(`  cart with ${this.items.length} items released`);
  }
}

class Pool {
  dispose(): void {
    console.log("  pool closed");
  }
}

const POOL = createToken<Pool>("Pool");
const CART = createToken<Cart>("Cart");
const REPORT = createToken<string>("Report");

const container = createContainer();
container.registerFactory(POOL, () => new Pool(), [], { scope: ContainerScope.SINGLETON });
container.registerFactory(CART, () => new Cart(), [], { scope: ContainerScope.SCOPED });
container.registerFactory(REPORT, (cart) => `${cart.items.length} items`, [CART], { scope: ContainerScope.SINGLETON });

const request = container.createScope({ name: "request-1" });
request.resolve(CART).items.push("RICE-50KG", "OIL-5L");
console.log("same pool:", request.resolve(POOL) === container.resolve(POOL));

for (const attempt of [() => container.resolve(CART), () => request.resolve(REPORT)]) {
  try {
    attempt();
  } catch (error) {
    console.log(`${(error as Error).name}: ${(error as Error).message}`);
  }
}

console.log("end of request:");
await request.dispose();
console.log("shutdown:");
await container.dispose();
```

Output of `npx tsx zudo-container.ts` and of the browser terminal

```ts
same pool: true
ScopedResolutionError: Scoped token Cart cannot be resolved outside a scope. Create one with container.createScope() and resolve through it.
CaptiveDependencyError: Captive dependency: singleton "Report" depends on scoped "Cart". A longer-lived consumer cannot capture a shorter-lived dependency. (chain: Report -> Cart)
end of request:
  cart with 2 items released
shutdown:
  pool closed
```

The same design: tokens, scopes, the captive-dependency rule and disposal in both directions. The errors are named classes from `@zudojs/errors` (`ScopedResolutionError`, `CaptiveDependencyError`) that code can catch by type. Remember from [the container lesson](https://zudojs.oyinlola.site/learn/ts-typed-di#zudo) that its default lifetime is transient; yours had none, which forces a decision at every registration.

### Configuration: @zudojs/config

zudo-config.ts

```ts
import { createConfigManager, createDefaultsConfigSource, createEnvironmentConfigSource, createMemoryConfigSource } from "@zudojs/config";

const config = createConfigManager({
  sources: [
    createDefaultsConfigSource({ port: 3000, log_level: "info" }),
    createMemoryConfigSource({ port: 8080, log_level: "debug", database_url: "postgres://dev@localhost/shop" }, { name: "env-file", priority: 10 }),
    createEnvironmentConfigSource({
      prefix: "SHOP_",
      priority: 20,
      env: {
        SHOP_LOG_LEVEL: "warn",
        SHOP_DATABASE_URL: "postgres://shop:pa55word@db.internal/shop",
        SHOP_SESSION_SECRET: "k3v9QmX2pL8rT5wZ1yB7nC4hJ6dF0sAe",
      },
    }),
  ],
});
await config.load();

console.log(config.toSafeObject());
console.log(config.number("port"), config.string("log_level"), config.requiredString("session_secret").length);
try {
  config.requiredString("smtp_host");
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
```

Output of `npx tsx zudo-config.ts` and of the browser terminal

```json
{
  log_level: 'warn',
  database_url: '[REDACTED]',
  session_secret: '[REDACTED]',
  port: 8080
}
8080 warn 32
ConfigResolutionError: Failed to resolve configuration "smtp_host".
```

Layers are **sources** with priorities: here defaults, an in-memory stand-in for a `.env` file, and the environment with a `SHOP_` prefix. `toSafeObject` redacts by key name *and* by value, so the database URL with a password in it was hidden without being declared secret. The manager reads values on demand (`number("port")`); for a typed, checked object like yours, validate `toObject()` with a schema, as [Configuration in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-config) does.

### Logger: @zudojs/logger

zudo-logger.ts

```ts
import { createLogger } from "@zudojs/logger";

const logger = createLogger({
  name: "bookstore",
  level: "info",
  transports: [(entry) => console.log(entry.levelName, entry.message, JSON.stringify(entry.metadata))],
});

logger.debug("cache miss", { key: "book:b1" });
const request = logger.child({ metadata: { requestId: "req-7" } });
request.info("login", { user: "ada", password: "pa55word" });
request.error("payment failed", { orderId: "ord-1", cause: new Error("card declined") });
```

Output of `npx tsx zudo-logger.ts` and of the browser terminal

```ts
info login {"requestId":"req-7","user":"ada","password":"[REDACTED]"}
error payment failed {"requestId":"req-7","orderId":"ord-1","cause":{}}
```

Levels, child loggers and redaction work like yours. Two differences are worth knowing. Transports receive a rich entry (numeric `level`, `levelName`, `metadata`, an id and a timestamp), so formatting is a separate, pluggable step. And an `Error` nested inside the metadata arrives as `{}`, the `JSON.stringify` problem your logger solved: log `error.message` explicitly, or read [Structured logging](https://zudojs.oyinlola.site/learn/zudo-logging) for its error handling.

### Lifecycle: @zudojs/lifecycle

zudo-lifecycle.tsNode.js only

```ts
import { createLifecycleManager } from "@zudojs/lifecycle";
import type { LifecycleComponent } from "@zudojs/lifecycle";

function part(name: string, failWith?: string): LifecycleComponent {
  return {
    name,
    async start() {
      if (failWith) throw new Error(failWith);
      console.log(`start ${name}`);
    },
    async stop() {
      console.log(`stop  ${name}`);
    },
  };
}

const manager = createLifecycleManager({ handleSignals: false });
manager.register(part("http", "EADDRINUSE :8080"), { dependsOn: ["queue"] });
manager.register(part("queue"), { dependsOn: ["database"] });
manager.register(part("database"));

try {
  await manager.start();
} catch (error) {
  console.log(`${(error as Error).name}: ${(error as Error).message}`);
}
console.log("state:", manager.state);
for (const [id, status] of manager.getStatus()) console.log(`  ${id}: ${status.state}`);
```

Output of `npx tsx zudo-lifecycle.ts`

```ts
start database
start queue
stop  http
stop  queue
stop  database
LifecycleStartError: Failed to start component "http".
state: disposed
  http: disposed
  queue: disposed
  database: disposed
```

The same rollback, with one deliberate difference: ZudoJS also calls `stop` on `http`, the component whose start failed, in case it half-started (bound a port, opened a file) before throwing. That is safer for resources and asks more of you: every `stop` must work even if its `start` did not finish. The manager also has `initialize`, `ready` and `dispose` phases, priorities, retries with backoff and per-component timeouts; [The lifecycle in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-lifecycle) covers them.

### Application: @zudojs/core

zudo-core.tsNode.js only

```ts
import { createApplication, createModule, defineModule } from "@zudojs/core";

function traced(id: string, dependencies: string[] = [], failWith?: string) {
  return defineModule({
    id,
    name: id,
    dependencies,
    factory: () =>
      createModule({
        id,
        name: id,
        dependencies,
        onInitialize: () => {
          if (failWith) throw new Error(failWith);
          console.log(`  initialize ${id}`);
        },
        onShutdown: () => console.log(`  shutdown   ${id}`),
        onDestroy: () => console.log(`  destroy    ${id}`),
      }),
  });
}

for (const failing of [false, true]) {
  const app = await createApplication({
    modules: [traced("http", ["catalog"]), traced("catalog", ["database"], failing ? "catalog index missing" : undefined), traced("database")],
    logger: { level: "fatal" },
    runtime: { name: "bookstore", signals: { handleSigint: false, handleSigterm: false } },
  });
  try {
    await app.start();
    console.log("running:", app.state);
    await app.stop();
    console.log("after stop:", app.state);
  } catch (error) {
    console.log(`${(error as Error).name}: ${(error as Error).message} -> state ${app.state}`);
  }
}
```

Output of `npx tsx zudo-core.ts`

```ts
  initialize database
  initialize catalog
  initialize http
running: running
  shutdown   http
  shutdown   catalog
  shutdown   database
  destroy    http
  destroy    catalog
  destroy    database
after stop: stopped
  initialize database
  destroy    catalog
  destroy    database
  destroy    http
RuntimeInitializationError: Runtime module initializing failed. -> state failed
```

`createApplication` plays the part of your `createApp`: modules with dependencies, initialized in order and shut down in reverse. On a failed start it calls the `onDestroy` hooks as its rollback. Notice that `http`'s `onDestroy` ran although its `onInitialize` never did: write destroy hooks that are safe to call on a module that never started. [@zudojs/core](https://zudojs.oyinlola.site/learn/zudo-core) covers modules in full.

| Job | Your mini framework | ZudoJS |
| --- | --- | --- |
| Container | `Token`, three lifetimes, captive check, disposal; about 80 lines | `@zudojs/container`: the same, plus class and alias providers, optional resolution, snapshots for tests, typed errors; default lifetime transient |
| Configuration | One schema gives parsing, checking, types and secrets; environment-variable layers | `@zudojs/config`: prioritised sources (defaults, memory, environment with prefixes, custom), on-demand typed getters, key- and value-based redaction; validate with `@zudojs/schema` |
| Logger | JSON lines, levels, child fields, redaction by name, error serialisation | `@zudojs/logger`: entries with ids and timestamps, formatters and transports, child loggers, redaction; errors passed on their own, not nested |
| Lifecycle | Order, timeouts, rollback without the failed component, idempotent stop | `@zudojs/lifecycle`: five phases, priorities, retries, concurrency, events, signal handling; rollback includes the failed component |
| Application | `createApp` with modules and `stopOnSignals` | `@zudojs/core` with `@zudojs/runtime`: modules, readiness and health, runtime events, signal handling |

## What a production framework adds

Your core works, and it is honest about its limits. These are the things real frameworks spend most of their code on:

- **Async factories.** Your container's factories are synchronous, which is why the database connects in `start`, not when it is created. Supporting `async` factories means every `resolve` becomes async, or the container resolves everything up front.
- **Readiness and health.** An orchestrator asks "are you ready for traffic?" and "are you still alive?". The app must answer from the lifecycle state and from checks such as a database ping; `@zudojs/runtime` has both.
- **Parallel start.** Components that do not depend on each other can start at the same time (the first exercise computes the groups). With twenty components and slow networks, that is the difference between a 2-second and a 20-second deploy.
- **Shutdown deadlines.** Kubernetes waits 30 seconds by default after `SIGTERM`, then kills the process. The whole stop, not just each component, needs a deadline shorter than that.
- **Process-level errors.** An unhandled promise rejection or an uncaught exception should be logged and trigger a controlled stop, not a silent crash or a zombie.
- **Log transport.** Writing logs synchronously to a slow destination slows every request. Real loggers buffer, batch and drop with a counter when the destination cannot keep up.

## Practice

TRY IT YOURSELF

### Start in parallel groups

Write `startLevels(components)`: it returns groups of component names such that each group depends only on earlier groups. Every group could then start with `Promise.all`. Reuse `startOrder`.

**Show a solution**

levels.ts

```ts
import { startOrder } from "./mini/lifecycle.js";
import type { Component } from "./mini/lifecycle.js";

function startLevels(components: readonly Component[]): string[][] {
  const level = new Map<string, number>();
  for (const component of startOrder(components)) {
    const deps = (component.dependsOn ?? []).map((name) => level.get(name)!);
    level.set(component.name, deps.length === 0 ? 0 : Math.max(...deps) + 1);
  }
  const levels: string[][] = [];
  for (const [name, n] of level) (levels[n] ??= []).push(name);
  return levels;
}

const components: Component[] = [
  { name: "http", dependsOn: ["catalog", "orders"] },
  { name: "orders", dependsOn: ["database", "queue"] },
  { name: "catalog", dependsOn: ["database", "cache"] },
  { name: "database" },
  { name: "cache" },
  { name: "queue" },
  { name: "mailer", dependsOn: ["queue"] },
];

const levels = startLevels(components);
levels.forEach((names, i) => console.log(`level ${i}: ${names.join(", ")}`));

console.log(`${components.length} components, ${levels.length} rounds instead of ${components.length}`);
```

Output of `npx tsx levels.ts` and of the browser terminal

```ts
level 0: database, cache, queue
level 1: catalog, orders, mailer
level 2: http
7 components, 3 rounds instead of 7
```

A component's level is one more than the highest level of its dependencies; walking in `startOrder` guarantees those are known. Stopping works on the same groups in reverse. Starting in parallel makes rollback harder: when one component in a group fails, its siblings may still be starting, so a real lifecycle waits for the whole group to settle (`Promise.allSettled`) before rolling back.

TRY IT YOURSELF

### A .env file source

Write `parseEnvFile(text)` that turns a `.env` file into an `Env` layer: skip blank lines and `#` comments, allow an `export` prefix, strip matching quotes, drop a trailing comment on unquoted values, and throw with the line number on a line without `=`. Use it as the middle layer of `loadConfig`.

**Show a solution**

env-file.ts

```ts
import { schema } from "./shop-config.js";
import { loadConfig, safeView } from "./mini/config.js";
import type { Env } from "./mini/config.js";

function parseEnvFile(text: string): Env {
  const env: Record<string, string> = {};
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new Error(`.env line ${index + 1}: expected KEY=value`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2]!;
    else value = value.replace(/\s+#.*$/, "");
    env[key] = value;
  }
  return env;
}

const file = `
# local development
PORT=8080
export LOG_LEVEL=debug   # chatty on purpose
DATABASE_URL="postgres://dev:dev@localhost/shop?sslmode=disable"
SESSION_SECRET='dev-only-secret-that-is-32-chars!'
`;

const fromFile = parseEnvFile(file);
console.log(fromFile);
const config = loadConfig(schema, fromFile, { LOG_LEVEL: "warn" });
console.log(safeView(schema, config));
try {
  parseEnvFile("PORT 8080");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx env-file.ts` and of the browser terminal

```json
{
  PORT: '8080',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgres://dev:dev@localhost/shop?sslmode=disable',
  SESSION_SECRET: 'dev-only-secret-that-is-32-chars!'
}
{
  port: 8080,
  databaseUrl: '[secret]',
  logLevel: 'warn',
  sessionSecret: '[secret]'
}
.env line 1: expected KEY=value
```

The quoted database URL kept its `?sslmode=disable`, the comment after `debug` was dropped, and the real environment's `LOG_LEVEL=warn` still won. Node 24 can do this for you: `process.loadEnvFile(".env")` loads a file into `process.env`, and `util.parseEnv(text)` returns an object like yours. Never commit a real `.env` file.

TRY IT YOURSELF

### Pick the lifetime

For each BookStore service, choose singleton, scoped or transient, and say who disposes it: the PostgreSQL connection pool; the current user of a request; a password hasher with no state; the database transaction of a request; the typed config; a logger with the request's id bound to it.

**Show a solution**

- **Connection pool:** singleton. Expensive to create, safe to share; the container closes it at shutdown.
- **Current user:** scoped. It belongs to one request; sharing it would show one customer's orders to another.
- **Password hasher:** singleton (or transient; it has no state). Singleton avoids re-creating it; nothing to dispose.
- **Transaction:** scoped, and the scope's disposal must roll back a transaction that was not committed, so an error can never leave it open.
- **Config:** a singleton value, registered once; frozen, so sharing is safe.
- **Request logger:** scoped, created as a child of the singleton logger with `requestId` bound. A singleton could not know the request.

The rule behind all six: an object may be shared as widely as its state allows, and no wider. And a singleton may never hold a scoped object; your container refuses that at resolve time.

## Recap

- A framework's core prevents the startup bugs every app would otherwise repeat: bad settings found late, secrets in logs, half-started processes, stops that hang or run twice.
- The container creates objects by token and lifetime, refuses captive dependencies, and disposes what it created, newest first.
- Configuration is layered, parsed, checked up front with every problem reported, typed from one schema, frozen, and logged only through a safe view.
- The logger writes structured entries with levels, bound fields and redaction, and never breaks its caller.
- The lifecycle starts in dependency order with timeouts, rolls back a failed start in reverse, and stops idempotently; signals turn into a graceful stop.
- ZudoJS makes the same core choices, with differences you now know how to read: default lifetimes, redaction by value, rollback of the failed component, destroy hooks on modules that never started.

Next: [part 2](https://zudojs.oyinlola.site/learn/framework-build-http) adds a router, middleware, controllers, validation, error responses and an event bus, and runs the BookStore on a real `node:http` server.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
