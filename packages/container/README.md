# @zudojs/container

Token-based dependency injection container for managing application dependencies and service lifetimes.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-container](https://zudojs.oyinlola.site/docs/packages-container) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-container.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/container
```

## Quick Start

```typescript
import {
  createContainer,
  createToken,
  ContainerScope,
} from "@zudojs/container";

const container = createContainer();

const LOGGER = createToken<Logger>("logger");

// Registration takes a provider object plus options:
container.register(
  LOGGER,
  { useFactory: () => createLogger({ name: "app" }) },
  { scope: ContainerScope.SINGLETON },
);

const logger = container.resolve(LOGGER);
const [log, db] = container.resolveMany([LOGGER, DB]); // typed [Logger, Db]
```

Convenience helpers wrap the provider-object form:

```typescript
container.registerValue("config", { port: 3000 }); // always SINGLETON
container.registerClass(DB, PostgresDb, { scope: ContainerScope.SINGLETON });
container.registerFactory(API, (db) => new Api(db), [DB]); // deps via inject list
container.registerExisting("db-alias", DB); // alias to another token
```

A factory's parameters are typed from its `inject` list, in order: with
`DB = createToken<Db>("Db")`, `(db) => new Api(db)` receives `db: Db`, and a
factory whose parameters do not match the tokens is a compile error. Class
tokens type the same way; plain string and symbol tokens give `unknown`.
`factoryProvider(factory, inject)` and `provideFactory(token, factory,
inject)` infer the same way.

```typescript
container.registerFactory(
  REPORT,
  (db, clock) => new Report(db, clock), // db: Db, clock: Clock
  [DB, Clock],
);
```

## Tokens

Tokens can be strings, symbols, classes, or `InjectionToken`s from
`createToken<T>()` / `createGlobalToken<T>()`.

- Plain string/symbol tokens are **untyped casts** — the compiler cannot
  verify that what you registered under `"logger"` matches the type you
  request later. Prefer `InjectionToken`s or class tokens.
- `createGlobalToken(key)` uses `Symbol.for(key)`: any other call with the
  same key anywhere in the process yields the **same** token. That is by
  design for cross-package sharing; namespace your keys (e.g. `"myapp:db"`).
- Error messages and default registration names show a symbol token by its
  description: `createToken<Db>("Database")` appears as `Database`, not
  `Symbol(Database)` (`describeToken(token)` returns the same string).

## Lifetimes (`scope` option)

The default scope is **`ContainerScope.TRANSIENT`**.

| Scope       | Cache                                                                                                         | Disposal                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `SINGLETON` | One instance in the container's root cache — the same instance is returned at the root and inside every scope | Disposed by `container.dispose()` (or when its registration is replaced/removed) |
| `SCOPED`    | One instance per scope created with `container.createScope()` (nested scopes see their ancestors' instances)  | Disposed by `scope.dispose()`                                                    |
| `TRANSIENT` | Never cached — a new instance per resolution                                                                  | **Never tracked — the caller owns disposal**                                     |

Resolving a `SCOPED` token at the container root **throws** a
`ScopedResolutionError` ("Scoped token X cannot be resolved outside a
scope"). A `SINGLETON` whose dependency chain contains a `SCOPED`
registration throws a `CaptiveDependencyError` — a longer-lived consumer must
not capture a shorter-lived dependency.

`registerValue()` always registers as `SINGLETON`, overriding any
`options.scope` you pass — a value provider can only ever return the one
instance you gave it. The container did not create that value, so it
never disposes it: a pool or logger shared between containers, or owned
by the host, stays open when a container is disposed. Register a factory
instead when the container should own the instance.

A `useExisting` alias never becomes a second owner of its target's instance:
a `SINGLETON` or `SCOPED` target is disposed exactly once by whoever created
it, and a `SCOPED` alias of a `SINGLETON` leaves the singleton alive when the
scope is disposed. Only a `TRANSIENT` target captured by a cached alias is
tracked (and disposed) through the alias.

Tracking covers **every** `SINGLETON`/`SCOPED` instance the container
creates — including ones created transitively as dependencies of another
resolution — not just the value returned by the `resolve()` call.

### Async factories are not supported for cached lifetimes

The container is synchronous. A factory registered as `SINGLETON` or
`SCOPED` that returns a `Promise` throws an `AsyncProviderError` — otherwise
the Promise itself would be cached as "the instance" and the eventual value
would never be disposal-tracked. Await the resource first and register the
result (`registerValue`), or make the registration `TRANSIENT` and let
callers await it themselves. There is no `resolveAsync`.

## Scopes

```typescript
const scope = container.createScope({ name: "request-42" });
const service = scope.resolve(REQUEST_SERVICE); // SCOPED: cached per scope
await scope.dispose(); // disposes SCOPED instances only
```

- Singletons resolved through a scope come from (and stay owned by) the
  container; `scope.dispose()` never touches them.
- `scope.createScope()` creates a **nested child** scope:
  - the child sees `SCOPED` instances already created by its ancestors
    (lookups chain upward), while instances it creates itself are private to
    the child and disposed with it;
  - disposing a scope disposes its children first (most recent first);
  - `child.getParent()` returns the parent scope (`getParent()` on a
    top-level scope returns the container); `getContainer()` always returns
    the container.
- The container keeps track of its live scopes: `container.dispose()`
  disposes them (and their children) first, and resolving from any scope
  after it or one of its ancestors is disposed throws.

## Constructor and factory injection

Providers declare dependencies with an `inject` token list:

```typescript
class Api {
  constructor(
    private db: Db,
    private logger: Logger,
  ) {}
}

container.registerClass(API, Api, { inject: [DB, LOGGER] });
// or
container.register(API, { useClass: Api, inject: [DB, LOGGER] });
container.register(API, {
  useFactory: (db, log) => new Api(db, log),
  inject: [DB, LOGGER],
});
```

Classes without an `inject` list are constructed with zero arguments. There
is no reflection/decorator magic — dependencies are exactly the tokens you
list, resolved in order.

## Duplicate registrations

Registering a token twice throws `DuplicateRegistrationError` unless the
container was created with `{ registry: { allowDuplicates: true } }`, in
which case the later registration wins. Use `container.replace()` to
intentionally swap a registration.

Replacing or removing a registration **evicts and disposes** its cached
singleton — and evicts any cached `useExisting` alias of it — so the next
`resolve()` of either token uses the new provider. Eviction cascades: every
cached singleton that was built on the replaced token (directly or through
a `TRANSIENT` in between) is evicted and disposed too, so consumers are
rebuilt against the new instance instead of keeping the old, disposed one.
Live scopes drop (and dispose) their cached `SCOPED` copies of the replaced
token and of its consumers.

`DuplicateRegistrationError`, `CircularDependencyError`,
`RegistrationNotFoundError` and `ProviderResolutionError` are defined in
`@zudojs/errors` and re-exported from this package, so `instanceof` checks
need only one import.

## Resolution options

```typescript
const container = createContainer({
  resolution: {
    autoRegisterClasses: true, // default
    detectCircularDependencies: true, // default
    maxResolutionDepth: 100, // default
  },
});
```

- `autoRegisterClasses` — resolving an unregistered **class** token
  registers it on the fly as `TRANSIENT`. When registrations are frozen the
  class is instantiated _ephemerally_ without being registered. Set to
  `false` to require explicit registration (`canResolve`/`resolveOptional`
  respect this). Only a class whose constructor declares no required
  parameters (`Class.length === 0`) is auto-registered: auto-registration
  has no inject list, so `resolve(NeedsDep)` for
  `constructor(dep: Dep)` throws `RegistrationNotFoundError` naming the
  class and telling you to register it with an `inject` list, instead of
  building it with `dep = undefined`. Parameters with defaults do not
  count.
- `detectCircularDependencies` — circular chains throw
  `CircularDependencyError` with the full chain. When disabled,
  `maxResolutionDepth` still stops runaway recursion.
- `maxResolutionDepth` — chains deeper than this throw
  `MaxResolutionDepthError` naming the token and depth.

Resolution failures are wrapped in `DependencyResolutionError` (a subclass of
`ProviderResolutionError` from `@zudojs/errors`) carrying the failing
`token`, the resolution `chain`, and the original error as `cause`. The
message includes all three:
`Failed to resolve db: connect ECONNREFUSED (chain: api -> repo -> db)`.

`resolveOptional(token)` returns `undefined` when the token has no
registration; other failures (broken factories, missing dependencies of a
registered token, captive dependencies) still throw.

## Start semantics

`container.start()` is optional — the first `resolve()`/`createScope()`
auto-starts the container. With `freezeRegistrations: true`, starting
(including that implicit start) freezes the registration set: `register`,
`replace`, `remove`, `clearRegistrations`, and `restoreSnapshot` throw from
then on.

## Disposal

```typescript
await container.dispose();
```

- Disposes all live scopes, then all tracked singletons in **reverse
  creation order** (a dependency is created before its dependents, so it is
  disposed after them). Instances are disposable if they
  have a `dispose()` method or implement `Symbol.dispose` /
  `Symbol.asyncDispose`.
- `TRANSIENT` instances are never tracked; dispose them yourself.
- `registerValue()` values are never disposed by the container.
- With `autoDispose: false`, `dispose()` releases tracked references
  **without disposing them** — disposal becomes your responsibility.
- Disposal is terminal: the container is marked disposed even if some
  instances fail to dispose, and every failure is reported in the thrown
  `AggregateError`. `dispose()` is idempotent; any use after disposal throws.
  The container counts as disposed from the moment `dispose()` is called —
  a `resolve()` racing the disposal throws rather than creating an instance
  nobody will clean up — and concurrent `dispose()` calls all settle when
  the one disposal finishes.
- `clearSingletons()` evicts and disposes cached singletons without
  disposing the container.

## Snapshots (testing)

`snapshot()` captures the current **registrations** (not instances);
`restoreSnapshot(snap)` wholesale-replaces the registration set with a
snapshot, evicting and disposing cached singletons from the old set. Both are
refused once registrations are frozen or the container is disposed.

```typescript
const snap = container.snapshot();
container.replace(DB, { useValue: fakeDb });
// ... test ...
container.restoreSnapshot(snap);
```

## Features

- Token-based registration (string, symbol, class, `InjectionToken`)
- Singleton, scoped, and transient lifetimes with strict cache coherence
- Explicit dependency injection via `inject` lists (classes and factories)
- Circular dependency detection and resolution depth limiting
- Lifecycle tracking with deterministic reverse-order disposal
- Container snapshots for testing

## Use Cases

- Managing service dependencies
- Testing with mock dependencies
- Plugin and module systems
- Application composition root
