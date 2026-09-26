---
title: "@zudojs/container — Token-Based Dependency Injection Container"
description: "@zudojs/container docs: token-based dependency injection for TypeScript with scopes, lifecycle management, circular dependency detection and auto-disposal."
source: https://zudojs.oyinlola.site/docs/packages-container
---

v1.2.1

# @zudojs/container

A token-based dependency injection container: register how each service is built, and let the container create, share and clean it up for you.

DEPENDENCY INJECTION CONTAINER TOKENS

## OVERVIEW

When an app grows, its parts start to need each other. A request handler needs a database, the database needs a config object, the config needs a logger. Wiring all of that by hand means every file has to know how to build everything it uses.

*Dependency injection* (DI) turns that around. Each part says what it needs, and one central object, the *container*, builds it and hands it over. `@zudojs/container` is that object.

You describe each dependency once, say how long it should live, and ask for it wherever you need it. The container handles creation order, caching and cleanup.

> **In plain words:** a container is a box of recipes. You register a recipe under a name, and later you ask for that name and get the finished dish.

### When you need it

- Several services depend on each other and you want one place that builds them.
- You want one shared instance of something (a DB pool) and fresh instances of other things.
- You need per-request objects that are cleaned up when the request ends.
- You want to swap a real service for a fake one in tests without editing the code under test.

### When you don't

- A script or tiny app with two or three objects. Plain `new` is clearer.
- Your dependencies are all created asynchronously and you want the container to await them. It is synchronous by design.
- You want decorators or reflection to guess dependencies. This container only injects what you list explicitly.

## INSTALLATION

Install the package. `@zudojs/errors` is pulled in automatically, but add it explicitly if you plan to import error classes from it in your own code.

```bash
$ npm install @zudojs/container
$ npm install @zudojs/errors
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

Requires Node.js 24+ and ES modules. Everything is imported from the one entry point; subpaths like `@zudojs/container/scope` do not exist.

## QUICK START

This example registers a logger and a greeter that needs the logger, then asks the container for the greeter. Save it as `app.ts` and run it with `npx tsx app.ts`.

```ts
import { createContainer, createToken, ContainerScope } from "@zudojs/container";

class Logger {
  log(message: string): void {
    console.log(`[app] ${message}`);
  }
}

class Greeter {
  constructor(private logger: Logger) {}
  greet(name: string): string {
    this.logger.log(`greeting ${name}`);
    return `Hello, ${name}!`;
  }
}

// Tokens are the names you register under and ask for later.
const LOGGER = createToken<Logger>("logger");
const GREETER = createToken<Greeter>("greeter");

const container = createContainer();
container.registerClass(LOGGER, Logger, { scope: ContainerScope.SINGLETON });
container.registerClass(GREETER, Greeter, { inject: [LOGGER] });

const greeter = container.resolve(GREETER);
console.log(greeter.greet("Ada"));

await container.dispose();
```

What you should see:

```json
[app] greeting Ada
Hello, Ada!
```

`registerClass` says "when someone asks for `GREETER`, build a `Greeter` and pass it whatever `LOGGER` resolves to". `resolve` is the ask. You never write `new Greeter(...)` yourself.

> **Tip:** You do not need to call `container.start()`. The first `resolve()` or `createScope()` starts the container for you.

## TOKENS

A *token* is just a named key. You register something under a token, and later you ask the container for that token and it hands you the thing. The container accepts three kinds of key: a string, a symbol, or a class.

`createToken<T>(description)` is the recommended way to make one. It wraps a fresh symbol so two tokens can never clash, and it carries the type `T`, so `resolve()` returns a properly typed value.

This example shows the three ways to name a dependency and what each one gives you back.

```ts
import {
  createContainer,
  createToken,
  createGlobalToken,
  describeToken,
} from "@zudojs/container";

interface Config {
  port: number;
}

class Clock {
  now(): number {
    return Date.now();
  }
}

// 1. A typed token backed by a unique symbol (recommended).
const CONFIG = createToken<Config>("config");

// 2. Backed by Symbol.for(key): every caller using this key gets the SAME token.
const SHARED_CONFIG = createGlobalToken<Config>("myapp:config");

const container = createContainer();
container.registerValue(CONFIG, { port: 3000 });
container.registerValue(SHARED_CONFIG, { port: 4000 });

// 3. A class used as its own token.
container.registerClass(Clock, Clock);

// 4. A plain string. Works, but resolve() returns `unknown`.
container.registerValue("greeting", "hello");

console.log(container.resolve(CONFIG).port);           // 3000
console.log(container.resolve(SHARED_CONFIG).port);    // 4000
console.log(typeof container.resolve(Clock).now());    // number
console.log(container.resolve("greeting"));            // hello
console.log(describeToken(CONFIG));                    // config
console.log(describeToken(Clock));                     // Clock
```

> **Watch out:** `createToken("db")` called twice gives two *different* tokens, even with the same description. Create each token once, export it from a shared file, and import it everywhere else. Otherwise you register under one token and ask for another, and get `RegistrationNotFoundError` (or, when the unregistered token is a dependency, a `DependencyResolutionError` with it as `cause`). Both messages name the token by its description, `db`, whichever copy you used.

## PROVIDERS: FOUR WAYS TO REGISTER

A *provider* is the recipe that tells the container how to produce a value for a token. There are four kinds, and the container has a shortcut method for each one.

| Method | What it does | Notes |
| --- | --- | --- |
| `registerValue(token, value)` | Hands back the exact object you gave it. | Always SINGLETON, whatever scope you pass. Never disposed by the container (the value is yours). |
| `registerClass(token, Class, { inject })` | Calls `new Class(...deps)`. | `inject` lists the tokens to pass, in constructor order. Omit it only for a constructor with no parameters, or only defaulted ones; since v1.2.1 resolving a class that needs arguments but has no `inject` throws `ProviderResolutionError`. |
| `registerFactory(token, fn, inject, options?)` | Calls your function and uses its return value. | Resolved `inject` tokens become the function's arguments. **TRANSIENT by default** — the function runs on every `resolve()` unless `options.scope` says otherwise. |
| `registerExisting(token, otherToken)` | Makes `token` an alias for `otherToken`. | Both tokens resolve to the same instance. |

The important idea is `inject`. There is no reflection or decorator magic: the container passes exactly the tokens you list, resolved in order. This example, taken from the package tests, uses all four methods.

```ts
import { createContainer, createToken, ContainerScope } from "@zudojs/container";

class Db {
  query(): string {
    return "rows";
  }
}

class Api {
  constructor(
    public db: Db,
    public label: string,
  ) {}
  get(id: string): string {
    return `${this.label}:${this.db.query()}:${id}`;
  }
}

const DB = createToken<Db>("db");
const API = createToken<Api>("api");
const container = createContainer();

container.registerClass(DB, Db, { scope: ContainerScope.SINGLETON });
container.registerValue("label", "api");
container.registerClass(API, Api, { inject: [DB, "label"] });
container.registerFactory("api-url", (label) => `https://${label}.example.com`, ["label"]);
container.registerExisting("database", DB);

// Factory parameters are typed from the inject list: db is a Db (from the typed
// token DB); a string or symbol token such as "label" gives unknown.
const API_V2 = createToken<Api>("api-v2");
container.registerFactory(API_V2, (db, label) => new Api(db, label as string), [DB, "label"]);

const api = container.resolve(API);
console.log(api.get("1"));                                            // api:rows:1
console.log(container.resolve("api-url"));                            // https://api.example.com
console.log(container.resolve("database") === container.resolve(DB)); // true
console.log(container.resolve(API_V2).get("2"));                         // api:rows:2
```

All four shortcuts call `register(token, provider, options)` underneath. You can call it directly with a provider built by `factoryProvider((db) => build(db), [DB])` (typed the same way) or a plain object such as `{ useFactory: (db) => build(db as Db), inject: [DB] }`, and options such as `{ scope: ContainerScope.SINGLETON }`.

> **Changed in v1.2.0 — factory parameters are typed from `inject`.** `registerFactory`, `factoryProvider` and `provideFactory` infer each parameter from the matching token: a `Token<T>` or class token gives `T`, a string or symbol token gives `unknown`. So `registerFactory(API, (db) => new Api(db), [DB])` compiles under strict mode, and a factory whose parameter types do not match its tokens, or that declares more parameters than the list supplies, is a compile error (TS2345). The types are exported as `InjectedDependencies<Deps>` and `InjectedFactory<T, Deps>`. A factory typed `(...deps: unknown[]) => T` and a non-tuple `readonly ProviderToken[]` list still compile. Before v1.2.0 every parameter was `unknown` and needed a cast. The run-time order is still yours to get right: tokens are passed exactly in the order you list them.

> **Watch out:** registering the same token twice throws `DuplicateRegistrationError`. To swap a registration on purpose, call `container.replace(token, provider)`, or create the container with `{ registry: { allowDuplicates: true } }` so the later registration wins.

## LIFETIMES: SINGLETON, SCOPED, TRANSIENT

Every registration has a *scope*, which is how long an instance lives before the container makes a new one. You set it with the `scope` option using the `ContainerScope` enum.

### SINGLETON

One instance for the whole container. Built on first ask, then reused everywhere, including inside scopes.

### SCOPED

One instance per scope. Each `createScope()` gets its own copy. Asking at the root throws.

### TRANSIENT

A brand-new instance every single time you resolve. Never cached. This is the default.

This example counts how many times each factory runs so you can see the difference.

```ts
import { createContainer, ContainerScope } from "@zudojs/container";

const container = createContainer();
let tickets = 0;
let clocks = 0;

// TRANSIENT is the default, so no scope option is needed.
container.registerFactory("ticket", () => ++tickets);
container.registerFactory("clock", () => ++clocks, [], { scope: ContainerScope.SINGLETON });

container.resolve("ticket");
container.resolve("ticket");
console.log(tickets); // 2

container.resolve("clock");
container.resolve("clock");
console.log(clocks); // 1
```

Two rules follow from the lifetimes, and the container enforces both with a clear error:

- A SCOPED token can only be resolved through a scope. Asking the root container throws `ScopedResolutionError` ("cannot be resolved outside a scope").
- A SINGLETON cannot depend on a SCOPED token. It would keep the first scope's instance forever, so the container throws `CaptiveDependencyError`.

> **Danger:** a SINGLETON or SCOPED factory must not return a Promise. The container is synchronous and would cache the Promise itself, so it throws `AsyncProviderError` instead. Await the resource first and register the result with `registerValue`, or keep the registration TRANSIENT and let callers await it.

## SCOPES

A *scope* is a temporary sub-container for one unit of work, such as one HTTP request or one background job. SCOPED instances resolved through it are shared inside that scope and thrown away when you dispose it. Singletons still come from the parent container.

Here each request gets its own `RequestContext`, while two asks inside the same request share one.

```ts
import { createContainer, createToken, ContainerScope } from "@zudojs/container";

class RequestContext {
  readonly id = Math.random().toString(36).slice(2, 8);
}

const REQUEST = createToken<RequestContext>("request");
const container = createContainer();
container.registerClass(REQUEST, RequestContext, { scope: ContainerScope.SCOPED });

const requestA = container.createScope({ name: "request-a" });
const first = requestA.resolve(REQUEST);
const second = requestA.resolve(REQUEST);
console.log(first === second); // true

const requestB = container.createScope({ name: "request-b" });
console.log(requestB.resolve(REQUEST) === first); // false

await requestA.dispose();
await requestB.dispose();
```

Scopes can nest: `scope.createScope()` makes a child that sees its parent's SCOPED instances but keeps its own private. Disposing a parent disposes its children first; `container.dispose()` disposes every live scope.

> **Watch out:** always `await scope.dispose()` when the unit of work ends, usually in a `finally` block. A scope that is never disposed keeps its instances alive, and resolving from a disposed scope throws.

## DISPOSAL AND CLEANUP

Some objects hold resources that must be released: database connections, file handles, timers. The container tracks every SINGLETON it creates (and every SCOPED instance a scope creates) and cleans them up when you call `dispose()`. Values passed to `registerValue()` are not tracked or disposed.

An instance is cleaned up if it has a `dispose()` method (sync or async) or implements `Symbol.dispose` / `Symbol.asyncDispose`. Disposal runs in reverse creation order, so a dependency is closed after the things that used it.

This example registers a connection as a singleton and watches it close when the container is disposed.

```ts
import { createContainer, ContainerScope } from "@zudojs/container";

class Connection {
  open = true;
  dispose(): void {
    this.open = false;
    console.log("connection closed");
  }
}

const container = createContainer();
container.registerClass(Connection, Connection, { scope: ContainerScope.SINGLETON });

const conn = container.resolve(Connection);
console.log(conn.open); // true

await container.dispose(); // prints: connection closed
console.log(conn.open);    // false
console.log(container.isDisposed()); // true
```

Good to know:

- TRANSIENT instances are never tracked. If a transient holds a resource, you dispose it yourself.
- `dispose()` is final. Failures are collected into one thrown `AggregateError`, the container is still marked disposed, and any later use throws.
- `clearSingletons()` disposes cached singletons but keeps the container usable. Replacing or removing a registration disposes its singleton too.
- With `autoDispose: false`, `dispose()` releases references without calling anything's `dispose()`. Cleanup becomes your job.

## RESOLUTION GUARDS

*Resolving* means walking the dependency chain: to build A the container first builds everything A injects, and so on. Three things can go wrong on that walk, and the container catches each one with an error that names the chain.

A *circular dependency* is when A needs B and B needs A. The container detects the loop instead of running forever.

```ts
import { createContainer } from "@zudojs/container";
import { CircularDependencyError } from "@zudojs/errors";

const container = createContainer();
container.registerFactory("a", (b) => ({ b }), ["b"]);
container.registerFactory("b", (a) => ({ a }), ["a"]);

try {
  container.resolve("a");
} catch (error) {
  if (error instanceof CircularDependencyError) {
    console.log(error.message); // Circular dependency detected: a -> b -> a.
    console.log(error.chain);   // [ 'a', 'b', 'a' ]
  }
}
```

When a factory or constructor throws, the container wraps the failure in `DependencyResolutionError`. The original error is kept as `cause`, and `token` and `chain` show which link broke. The message reads like `Failed to resolve b: kaboom (chain: a -> b)`.

Tokens made with `createToken()` or `createGlobalToken()` appear in every error message, and in `chain`, by their description — the same string `describeToken()` returns, and the default registration name. With `createToken<Api>("Api")` depending on `createToken<Db>("Database")`, a throwing database factory reads `Failed to resolve Database: kaboom (chain: Api -> Database)`, and a missing one `No registration found for token "Database".` (Before v1.2.0 these read `Symbol(Database)`.) Give each token a description you will recognise in a log.

Asking for a token that was never registered throws `RegistrationNotFoundError`. If "maybe missing" is a normal case, use `resolveOptional()` or check first with `has()` and `canResolve()`.

```ts
import { createContainer, createToken } from "@zudojs/container";

const FLAG = createToken<boolean>("flag");
const container = createContainer();

console.log(container.has(FLAG));             // false
console.log(container.resolveOptional(FLAG)); // undefined

container.registerValue(FLAG, true);
console.log(container.has(FLAG));             // true
console.log(container.resolveOptional(FLAG)); // true
```

One convenience: with the default `autoRegisterClasses: true`, resolving a class that was never registered registers it on the fly as TRANSIENT and builds it with **no arguments**. Since v1.2.0 that only happens for a class whose constructor declares no required parameters (`Class.length === 0`). Parameters with default values and rest parameters do not count: `constructor(deps: Deps = {})` has `length === 0`, so it *is* auto-registered and built with no arguments — the default applies and nothing is injected. Register such a class with an `inject` list when the container should supply those values; the container cannot tell "optional" from "please inject" at runtime. Resolving an unregistered class that expects dependencies throws `RegistrationNotFoundError` with a message that names the class and shows how to register it with an `inject` list; `canResolve()` returns `false` and `resolveOptional()` returns `undefined` for it. Before v1.2.0 such a class was built silently with every parameter `undefined`. Set the option to `false` if you prefer to require explicit registration for every class.

> **Tip:** `resolveOptional()` only hides "not registered". A registered token whose factory throws, or whose dependency is missing, still throws so that real bugs are not swallowed.

## CONFIGURATION

Every option is optional. This call shows each one with its default value.

```ts
import { createContainer } from "@zudojs/container";

const container = createContainer({
  name: "zudojs-container",
  autoDispose: true,
  allowScopes: true,
  freezeRegistrations: false,
  registry: { allowDuplicates: false },
  lifecycle: { failFast: false },
  resolution: {
    autoRegisterClasses: true,
    detectCircularDependencies: true,
    maxResolutionDepth: 100,
  },
  metadata: {},
});

console.log(container.name); // zudojs-container
```

| Option | What it does | Notes |
| --- | --- | --- |
| `autoDispose` | Whether `dispose()` calls cleanup on tracked singletons. | Default `true`. With `false` references are released, nothing is disposed. |
| `allowScopes` | Whether `createScope()` is permitted. | Default `true`. With `false`, `createScope()` throws. |
| `freezeRegistrations` | Locks the registration set once the container starts. | Default `false`. Remember the first `resolve()` starts the container. |
| `registry.allowDuplicates` | Allow registering a token twice; the later one wins. | Default `false` (throws `DuplicateRegistrationError`). |
| `lifecycle.failFast` | Stop disposal at the first failure instead of collecting them all. | Default `false`. |
| `resolution.autoRegisterClasses` | Auto-register unregistered class tokens as TRANSIENT. | Default `true`. Only zero-required-parameter constructors; defaulted/rest parameters count as zero and are not injected. |
| `resolution.detectCircularDependencies` | Throw `CircularDependencyError` on loops. | Default `true`. When off, `maxResolutionDepth` still stops runaway chains. |
| `resolution.maxResolutionDepth` | Longest allowed dependency chain. | Default `100`. Must be a positive integer. |

## TESTING WITH FAKES

The container makes tests easy: swap the real registration for a fake, run the code under test, then put the original back. `snapshot()` captures the current registrations (not the instances) and `restoreSnapshot()` reinstates them, disposing any singletons built in between.

This example replaces a mailer with a fake and restores it afterwards.

```ts
import { createContainer, createToken } from "@zudojs/container";

interface Mailer {
  send(to: string): string;
}

const MAILER = createToken<Mailer>("mailer");
const container = createContainer();
container.registerFactory(MAILER, () => ({ send: (to) => `sent real mail to ${to}` }));

const snapshot = container.snapshot();
container.replace(MAILER, { useValue: { send: (to) => `pretend mail to ${to}` } });
console.log(container.resolve(MAILER).send("ada@example.com")); // pretend mail to ada@example.com

container.restoreSnapshot(snapshot);
console.log(container.resolve(MAILER).send("ada@example.com")); // sent real mail to ada@example.com
```

> **Tip:** the simplest test setup is a fresh `createContainer()` in `beforeEach` and `await container.dispose()` in `afterEach`. Snapshots are for when building the container is expensive and you want to reuse it.

## API REFERENCE

Everything below is exported from `@zudojs/container` unless a note says otherwise.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createContainer(options?)` | Creates a `Container`. | Same as `new Container(options)`. |
| `createStartedContainer(options?)` | Creates a container and calls `start()`. | Only matters with `freezeRegistrations: true`. |
| `createToken<T>(description)` | Makes a unique typed token. | Backed by a fresh `Symbol`. |
| `createGlobalToken<T>(key)` | Makes a typed token shared by every caller using the same key. | Backed by `Symbol.for(key)`. Namespace keys, e.g. `"myapp:db"`. |
| `describeToken(token)` | Returns a readable name for a token. | Useful in logs and error messages. |
| `classProvider`, `factoryProvider`, `valueProvider`, `existingProvider` | Build a frozen provider object for `register()`. | The `register*` shortcuts call these for you. The `provide*` variants also carry the token. |
| `isDisposable`, `isAsyncDisposable`, `isDisposableInstance` | Check whether a value can be disposed. | Same checks the container uses when tracking. |

### Container methods

| Name | What it does | Notes |
| --- | --- | --- |
| `register(token, provider, options?)` | Registers any provider. | `options.scope` plus metadata fields (`name`, `description`, `module`). |
| `registerValue`, `registerClass`, `registerFactory`, `registerExisting` | Shortcuts for the four provider kinds. | See [Providers](#providers). |
| `resolve(token)` | Builds or fetches the value for a token. | Throws on any failure. Auto-starts the container. |
| `resolveOptional(token)` | Like `resolve`, but returns `undefined` when not registered. | Other failures still throw. |
| `resolveMany([a, b])` | Resolves several tokens at once. | Returns a tuple typed per token. |
| `has(token)` / `canResolve(token)` | Is it registered? / Could `resolve` succeed? | `canResolve` counts auto-registrable classes (zero required constructor parameters only). |
| `replace(token, provider, options?)` | Swaps a registration. | Evicts and disposes the old cached singleton and every cached consumer built on it; live scopes drop their copies. |
| `remove(token)` / `clearRegistrations()` | Removes one or all registrations. | Cached singletons are disposed. |
| `createScope(options?)` | Creates a `ContainerScopeContext`. | `options.name`, `options.metadata`. |
| `snapshot()` / `restoreSnapshot(snap)` | Save and restore the registration set. | For tests. Refused when registrations are frozen. |
| `clearSingletons()` | Disposes and forgets cached singletons. | Async. Container stays usable. |
| `dispose()` | Disposes live scopes, then singletons, and shuts the container. | Async, idempotent, final. |
| `isStarted()`, `isDisposed()` | Lifecycle state. | `start()` exists but is optional. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `Container` | The container itself. | Prefer `createContainer()`. |
| `ContainerScopeContext` | A scope returned by `createScope()`. | Has `resolve`, `resolveMany`, `has`, `canResolve`, `createScope`, `dispose`, `isDisposed`, `getParent`, `getContainer`. |
| `ContainerRegistry` | Stores registrations and emits change events via `subscribe()`. | Used internally by `Container`; not exposed as a property. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `Token<T>` / `InjectionToken<T>` | A raw key (class, symbol or string) / the wrapper `createToken` returns. | Both are accepted everywhere a token is expected. |
| `ContainerOptions` | Argument to `createContainer`. | See [Configuration](#configuration). |
| `ContainerProvider<T>` | Any provider shape `register()` accepts. | `useValue`, `useClass`, `useFactory`, `useExisting`. |
| `InjectedDependencies<Deps>`, `InjectedFactory<T, Deps>` | The parameter tuple an `inject` list produces, and a factory typed from it. | New in v1.2.0. `Token<T>` or class tokens map to `T`; string and symbol tokens to `unknown`. |
| `ContainerRegistration<T>` | What `getRegistration()` returns. | `token`, `provider`, `scope`, `metadata`, `createdAt`. |
| `DisposableLike`, `AsyncDisposableLike`, `SymbolDisposableLike` | Shapes the container knows how to dispose. | `Disposable` / `AsyncDisposable` still exist but are deprecated aliases. |

### Errors

| Name | When it is thrown | Notes |
| --- | --- | --- |
| `ScopedResolutionError` | A SCOPED token is resolved at the root. | From `@zudojs/container`. |
| `CaptiveDependencyError` | A SINGLETON depends on a SCOPED token. | From `@zudojs/container`. |
| `DependencyResolutionError` | A factory or constructor threw. | From `@zudojs/container`. Has `token`, `chain`, `cause`. |
| `MaxResolutionDepthError` | The chain is longer than `maxResolutionDepth`. | From `@zudojs/container`. |
| `AsyncProviderError` | A SINGLETON/SCOPED factory returned a Promise. | From `@zudojs/container`. |
| `ContainerDisposalError` | Instances failed to dispose. | From `@zudojs/container`. Wrapped in the `AggregateError` thrown by `dispose()`. |
| `CircularDependencyError` | A dependency loop was found. | From `@zudojs/errors`. Has `chain`. |
| `RegistrationNotFoundError` | Resolving a token that is not registered. | From `@zudojs/errors`. |
| `DuplicateRegistrationError` | Registering a token twice. | From `@zudojs/errors`. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| `ContainerScope` | Enum: `SINGLETON`, `SCOPED`, `TRANSIENT`. | String values `"singleton"`, `"scoped"`, `"transient"`. |
| `DEFAULT_CONTAINER_SCOPE` | The scope used when none is given. | `ContainerScope.TRANSIENT`. |
| `DEFAULT_CONTAINER_NAME`, `DEFAULT_RESOLUTION_OPTIONS` | Option defaults. | See [Configuration](#configuration). |

## COMMON MISTAKES

- **Listing `inject` tokens in the wrong order.** With typed tokens the compiler now catches a mismatch, but two dependencies of the same type (or string tokens, which are `unknown`) can still be swapped silently. Fix: keep the list in parameter order and prefer typed tokens from `createToken<T>()`.
- **Calling `createToken("db")` in two files.** You get two unrelated tokens, and `resolve()` throws `RegistrationNotFoundError`. Fix: create each token once in a shared module and import it.
- **Forgetting `inject` on a class with constructor arguments.** `registerClass(TOKEN, Service)` with no `inject` still registers, but since v1.2.1 `resolve(TOKEN)` throws `ProviderResolutionError`: `Cannot build class "Service" for token "service": its constructor declares 2 parameters and the registration has no inject list, so it would be built with undefined dependencies.` The same applies to `{ useClass }`, `classProvider` and `provideClass`. Up to v1.2.0 the class was built with every parameter `undefined` (only *auto*-registration refused it). Constructors with no parameters, or only defaulted ones, are unaffected. Fix: `registerClass(TOKEN, Service, { inject: [DEP_A, DEP_B] })` in constructor order. Since v1.3.0 the compiler checks that list against the constructor for `registerClass`, `classProvider` and `provideClass`: a missing list, or two typed tokens in the wrong order, is a type error instead of a runtime `undefined` (string and symbol tokens are untyped and check nothing).
- **Resolving a SCOPED token from the container.** `ScopedResolutionError`. Fix: `const scope = container.createScope()` and `scope.resolve(TOKEN)`, then `await scope.dispose()`.
- **Expecting the default to be singleton.** The default is TRANSIENT, so a DB pool factory runs on every resolve. Fix: pass `{ scope: ContainerScope.SINGLETON }` for shared things.
- **Returning a Promise from a singleton factory.** `AsyncProviderError`. Fix: `const db = await connect()` first, then `registerValue(DB, db)` — and close it yourself, since the container does not dispose registered values.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the base error classes (`CircularDependencyError`, `RegistrationNotFoundError`, `DuplicateRegistrationError`) this container throws.
- [@zudojs/runtime](https://zudojs.oyinlola.site/docs/packages-runtime.md) — builds on the container to boot a whole application; reach for it when you want modules and startup ordering, not just a container.
- [@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md) — test helpers that create containers with fakes for you.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — start/stop hooks for the application as a whole, one level above container disposal.

## COMPLETE EXPORT INDEX

Every name `@zudojs/container` exports from its package root at v1.3.0 — **135** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 135 exports**

Classes (15)

`AsyncProviderError` `CaptiveDependencyError` `CircularDependencyError` `Container` `ContainerDisposalError` `ContainerLifecycle` `ContainerRegistry` `ContainerResolver` `ContainerScopeContext` `DependencyResolutionError` `DuplicateRegistrationError` `MaxResolutionDepthError` `ProviderResolutionError` `RegistrationNotFoundError` `ScopedResolutionError`

Functions (59)

`allowsContainerScopes` `assertValidProvider` `assertValidRegistrationToken` `canModifyRegistrations` `classProvider` `createContainer` `createContainerLifecycle` `createGlobalToken` `createMutableRegistrationState` `createRegistration` `createRegistrationMap` `createStartedContainer` `createToken` `defineRegistration` `describeContainerScope` `describeRegistration` `describeToken` `existingProvider` `factoryProvider` `freezeRegistration` `getProviderToken` `getRegistrationProviderToken` `getRegistrationToken` `hasInjectedDependencies` `isAsyncDisposable` `isCachedScope` `isClassProvider` `isConstructorToken` `isContainerScope` `isDisposable` `isDisposableInstance` `isExistingProvider` `isFactoryProvider` `isInjectionToken` `isScopedRegistration` `isScopedScope` `isSingletonRegistration` `isSingletonScope` `isStringToken` `isSymbolDisposable` `isSymbolToken` `isTokenProvider` `isTransientRegistration` `isTransientScope` `isValueProvider` `normalizeProvider` `provideClass` `provideExisting` `provideFactory` `provideValue` `resolveContainerOptions` `resolveContainerScope` `shouldAutoDisposeContainer` `shouldCacheRegistration` `unwrapToken` `validateResolutionOptions` `valueProvider` `withRegistrationMetadata` `withRegistrationScope`

Interfaces (30)

`AsyncDisposableLike` `ClassProvider` `ClassRegistration` `Constructor` `ContainerLifecycleOptions` `ContainerLike` `ContainerOptions` `ContainerRegistration` `ContainerRegistryOptions` `ContainerScopeOptions` `CreateRegistrationOptions` `DisposableLike` `ExistingProvider` `ExistingRegistration` `FactoryProvider` `FactoryRegistration` `InjectionToken` `MutableRegistrationState` `RegisterClassOptions` `RegistrationMetadata` `RegistryChangeEvent` `ResolutionCache` `ResolutionOptions` `ResolutionResult` `ResolvedContainerOptions` `SymbolDisposableLike` `TokenProvider` `TrackedInstance` `ValueProvider` `ValueRegistration`

Type aliases (21)

`AsyncDisposable` `ContainerProvider` `ContainerResolutionOptions` `Disposable` `DisposableInstance` `InjectedConstructor` `InjectedConstructorArgs` `InjectedDependencies` `InjectedFactory` `Provider` `ProviderToken` `RegistrationMap` `RegistrationToken` `RegistryListener` `RegistryToken` `ResolutionPath` `ResolvedToken` `ResolvedTokens` `Token` `TokenString` `TokenSymbol`

Constants (7)

`DEFAULT_ALLOW_SCOPES` `DEFAULT_AUTO_DISPOSE` `DEFAULT_CONTAINER_NAME` `DEFAULT_CONTAINER_SCOPE` `DEFAULT_FREEZE_REGISTRATIONS` `DEFAULT_REGISTRATION_SCOPE` `DEFAULT_RESOLUTION_OPTIONS`

Enums (3)

`ContainerLifecycleOwner` `ContainerScope` `RegistryOperation`
