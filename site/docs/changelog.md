---
title: "Changelog"
description: "What changed in each Zudo release: per-package release notes generated from the packages' own changelogs, newest first."
source: https://zudojs.oyinlola.site/docs/changelog
---

September 2026

# Changelog

What changed in each release, package by package. These notes are generated from the packages&rsquo; own `CHANGELOG.md` files, so they describe what shipped, not what was planned.

## WHAT&rsquo;S NEW — SEPTEMBER 2026 RELEASE

A full audit of all 39 packages: every finding was reproduced with a failing test before it was fixed, and every package ships with new regression tests. Public APIs are unchanged apart from additions; behaviour changed only where it was a defect. Highlights:

Fresh projects install and run

`zudojs create` projects failed on `pnpm install` (an exact `1.0.0` pin that `@zudojs/openapi` never published, and pnpm 10+ refusing esbuild's build script). Both are fixed; `zudojs dev` now starts the server through the package manager.

Security fixes across the stack

Sessions no longer live forever on a `NaN` TTL and login lockouts cannot be bypassed by changing letter case (`@zudojs/auth`); the OAuth SSRF guard rejects trailing-dot hostnames; redirects refuse `javascript:` and `//host` targets and cookies cannot inject attributes (`@zudojs/http`); a deny rule can no longer be overridden by an allowing policy (`@zudojs/permissions`); class instances are redacted in logs and spans (`@zudojs/observability`); key-derivation work factors are capped (`@zudojs/crypto`); non-exposed RPC errors keep their message off the wire.

Things that were declared but never wired

`runtimeId` is generated, `maxDepth` is enforced on the fast path, worker `concurrency` runs jobs in parallel, `catch-up` misfires replay, cached and composite flag providers forward `subscribe()`, runtime `continueOnError` reaches the module lifecycle, dispatch context reaches message handlers.

Lifecycle correctness

A SIGTERM during startup now stops the runtime; a transaction whose signal aborts is rolled back instead of committed; failed lifecycle components no longer have their dependents started; container aliases are disposed exactly once.

Docs that match the code

Every package README example was executed against the real API, and the package pages on this site were corrected wherever they contradicted the source. Each package page ends with a regenerated export index.

> **Upgrading:** projects created by the CLI depend on `^1.0.0`, so `pnpm update` (or `npm update`) picks these releases up. Each package section below lists the behaviour changes you may notice.

## PER-PACKAGE NOTES

| Package | Version | Notes |
| --- | --- | --- |
| `@zudojs/adapters` | `1.0.1` | [Jump to notes](#pkg-adapters) |
| `@zudojs/api` | `1.0.1` | [Jump to notes](#pkg-api) |
| `@zudojs/auth` | `1.1.0` | [Jump to notes](#pkg-auth) |
| `@zudojs/auth-oauth` | `1.1.1` | [Jump to notes](#pkg-auth-oauth) |
| `@zudojs/cache` | `1.0.1` | [Jump to notes](#pkg-cache) |
| `@zudojs/config` | `1.0.1` | [Jump to notes](#pkg-config) |
| `@zudojs/container` | `1.1.0` | [Jump to notes](#pkg-container) |
| `@zudojs/core` | `1.1.0` | [Jump to notes](#pkg-core) |
| `@zudojs/cqrs` | `1.0.1` | [Jump to notes](#pkg-cqrs) |
| `@zudojs/crypto` | `1.1.0` | [Jump to notes](#pkg-crypto) |
| `@zudojs/database` | `1.1.0` | [Jump to notes](#pkg-database) |
| `@zudojs/docs` | `1.0.1` | [Jump to notes](#pkg-docs) |
| `@zudojs/errors` | `1.0.1` | [Jump to notes](#pkg-errors) |
| `@zudojs/events` | `1.0.1` | [Jump to notes](#pkg-events) |
| `@zudojs/feature-flags` | `1.1.0` | [Jump to notes](#pkg-feature-flags) |
| `@zudojs/http` | `1.1.0` | [Jump to notes](#pkg-http) |
| `@zudojs/lifecycle` | `1.1.0` | [Jump to notes](#pkg-lifecycle) |
| `@zudojs/logger` | `1.1.0` | [Jump to notes](#pkg-logger) |
| `@zudojs/messaging` | `1.0.1` | [Jump to notes](#pkg-messaging) |
| `@zudojs/middleware` | `1.0.1` | [Jump to notes](#pkg-middleware) |
| `@zudojs/observability` | `1.0.1` | [Jump to notes](#pkg-observability) |
| `@zudojs/openapi` | `1.2.0` | [Jump to notes](#pkg-openapi) |
| `@zudojs/permissions` | `1.1.0` | [Jump to notes](#pkg-permissions) |
| `@zudojs/plugins` | `1.1.0` | [Jump to notes](#pkg-plugins) |
| `@zudojs/queue` | `1.1.0` | [Jump to notes](#pkg-queue) |
| `@zudojs/rpc` | `1.1.0` | [Jump to notes](#pkg-rpc) |
| `@zudojs/runtime` | `1.1.0` | [Jump to notes](#pkg-runtime) |
| `@zudojs/scheduler` | `1.1.0` | [Jump to notes](#pkg-scheduler) |
| `@zudojs/schema` | `1.0.1` | [Jump to notes](#pkg-schema) |
| `@zudojs/security` | `1.0.1` | [Jump to notes](#pkg-security) |
| `@zudojs/serialization` | `1.0.1` | [Jump to notes](#pkg-serialization) |
| `@zudojs/storage` | `1.1.0` | [Jump to notes](#pkg-storage) |
| `@zudojs/tenancy` | `1.1.0` | [Jump to notes](#pkg-tenancy) |
| `@zudojs/testing` | `1.1.0` | [Jump to notes](#pkg-testing) |
| `@zudojs/transactions` | `1.1.0` | [Jump to notes](#pkg-transactions) |
| `@zudojs/validation` | `1.0.1` | [Jump to notes](#pkg-validation) |

### `@zudojs/adapters` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-adapters.md)

Patch Changes

- `AdapterRegistry.disposeAll()` and `removeAndDispose()` now always call `dispose()`, even when `stop()` throws. Previously a failing `stop()` skipped disposal and the adapter, already unregistered, kept its connections and timers open. The `stop()` error is still reported; when both fail an `AggregateError` carries both.

### `@zudojs/api` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-api.md)

Patch Changes

- `APIExecutor` runs a hand-rolled operation whose handler returns synchronously instead of failing with "promise.then is not a function" reported as an internal error of the operation.
    - README: `BaseError.toJSON()` serializes `cause` (message and stack), so `result.error` must not be passed to `res.json()` as-is; the section now says which fields a transport may expose.

### `@zudojs/auth` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth.md)

Minor Changes

- **Sessions with a `NaN` lifetime never expired.** `createMemorySessionStore().create()` accepted `ttlSeconds: NaN` (the usual source is `Number(process.env.X)` with `X` unset), produced an `Invalid Date` expiry, and then never reclaimed the session — not even at its absolute deadline. `ttlSeconds` and `absoluteTtlSeconds` must now be finite and greater than zero; anything else throws `AuthConfigurationError`. `createAuthService()` applies the same check to `sessionTtlSeconds` / `absoluteSessionTtlSeconds` at construction.
    - **Login throttling could be bypassed with case or whitespace variants of the identifier.** Attempt counters were keyed by the raw submitted string, so `alice@example.com`, `Alice@example.com` and ` alice@example.com` each had an independent failed-attempt budget against one account. The throttle key is now the identifier trimmed, NFKC-normalised and lower-cased. Custom `LoginAttemptStore` implementations receive the normalised key.
    - `createAuthService()` now validates its `TokenConfig` at construction (missing/short/identical secrets, out-of-range clock tolerance) instead of at the first `login()`, and `createTokenPair()` / the verifiers reject a non-finite (`NaN` / `Infinity`) `accessTtl` or `refreshTtl` with `AuthConfigurationError` rather than minting tokens whose `exp` serialises as `null` and can never verify. Zero and negative TTLs are still accepted (they mint already-expired tokens).
    - README: `findUserById` is documented as required (it always was); there is no fallback to `findUser(sub)`.

### `@zudojs/auth-oauth` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md)

Patch Changes

- **SSRF guard: trailing-dot hostnames were not blocked.** `https://metadata.google.internal./…`, `https://localhost./…` and any `*.internal.` / `*.local.` / `*.localhost.` name with a trailing dot passed `assertSafeUrl(…, "fetch")` and `isBlockedFetchHost()`, because the WHATWG URL parser keeps the dot on domain hosts and DNS resolves the dotted and undotted forms identically. Trailing dots are now stripped before the name-based rules run.
    - A timeout that fires while the response body is streaming, or a transport failure mid-body, escaped as a raw `DOMException` / transport error. Both now surface as the documented `OAuthNetworkError`.
    - The per-request `scopes` override on `createAuthorizationUrl()` is validated with the same RFC 6749 scope-token rule as `config.scopes`; a blank, space-containing or non-string entry now throws `OAuthConfigurationError` instead of reaching the `scope` parameter.

### `@zudojs/cache` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cache.md)

Patch Changes

- `set()` on an existing key now replaces the key's tag mappings instead of accumulating them. Previously `set("k", v, { tags: ["a"] })` followed by `set("k", v2, { tags: ["b"] })` left `k` reachable by `invalidateByTag(["a"])`, so a stale tag could delete the new value.

### `@zudojs/config` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-config.md)

Patch Changes

- A string schema `pattern` carrying the `g` or `y` flag now validates the same value consistently; `lastIndex` state made the same schema alternate between accepting and rejecting identical input.
    - An array schema's `items.transform` (and `items.default`) now reaches the returned value from `validateConfigValue` / `validateConfigObject` / `manager.validate()`; item results were previously consulted for issues only and the untransformed array was returned as valid.

### `@zudojs/container` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-container.md)

Minor Changes

- A `useExisting` alias of a cached (`SINGLETON`/`SCOPED`) target is no longer tracked as a second owner of the target's instance: the instance is disposed exactly once on `container.dispose()`, and a `SCOPED` alias of a `SINGLETON` no longer lets `scope.dispose()` dispose the container-owned singleton. A `TRANSIENT` target captured by a cached alias is still tracked through the alias.
    - `replace()`/`remove()` of a token now also evicts every cached `useExisting` alias that points at it, so `resolve(alias)` returns the new instance instead of the old, already-disposed one.
    - `container.dispose()` marks the container disposed before any cleanup runs: a `resolve()` racing the disposal throws instead of creating a singleton that was then dropped without disposal, and concurrent `dispose()` calls (container and scope) share the in-flight disposal instead of settling early. `ContainerLifecycle.dispose()` likewise refuses `track()` while a full disposal is in flight.
    - `CircularDependencyError`, `DuplicateRegistrationError`, `RegistrationNotFoundError` and `ProviderResolutionError` are re-exported from `@zudojs/container`, as the README implied.

### `@zudojs/core` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-core.md)

Minor Changes

- Audit round 9 fixes:
    - `createRuntime()` / `createApplication()` / `resolveRuntimeOptions()` now reject an unknown runtime `mode` or `role` with a `TypeError`. Previously `mode: "prod"` was accepted silently and the environment reported neither production, development, nor test.
    - A runtime's `startup.continueOnInitializeError` / `continueOnStartError` (and the shutdown equivalents) are now passed to the `ModuleLifecycleManager` for each phase. With a hand-assembled graph whose manager kept its strict defaults, the manager rolled every module back and the runtime still reported `READY` with zero modules running. `ModuleLifecycleManager.initialize()/start()/stop()/destroy()` accept an optional `{ continueOnError }` (`ModuleLifecyclePhaseOptions`) for the same purpose.
    - Dependencies declared on a module instance (`Module.dependencies`, e.g. `super({ dependencies: ["users"] })` in a `BaseModule` subclass) are now honoured: they order initialization/shutdown, are visible through `context.hasModule()` / `getModuleContext()`, pull in `autoLoad: false` modules, block `unloadModule()`, and fail loading with `MissingModuleDependencyError` when unregistered. They were previously ignored entirely.
    - `ModuleLifecycleManager` builds its dependency graph from loaded modules only. A registered but unloaded definition (`autoLoad: false`) with a missing or circular dependency no longer makes `initialize()`, `start()`, `stop()` or `destroy()` throw for the modules that are loaded.
    - `ApplicationContext.getConfiguration()` reflects `ConfigurationManager.reload()`: `createApplication` now passes a configuration accessor, and `ApplicationContextOptions.configuration` accepts `Configuration | () => Configuration`.
    - `ConfigurationManager.reload()` serialises overlapping calls by sharing the in-flight reload instead of failing the second call with `InvalidStateError`.
    - `Container` keeps "scoped" instances per provider registration, so `unregister()` / `clear()` followed by a new registration for the same token no longer resolves the stale instance in an existing scope.
    - `sanitizeLogValue()` keeps an own `__proto__` key (as produced by `JSON.parse` on untrusted input) as data instead of turning it into the result's prototype and dropping it from structured log output.
    - README: `runWithValues` takes `(context, values, fn)`; configuration events are named `configuration.*`.

### `@zudojs/cqrs` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cqrs.md)

Patch Changes

- `lockMiddleware` now awaits the lock's `release()` function. A release that returns a rejected promise (a failed Redis unlock, say) previously became an unhandled promise rejection — which terminates the process under Node's defaults. It now surfaces as a `CqrsError` ("CQRS lock release failed") carrying the lock key and the original error as `cause`; when the handler itself failed, the handler's error is kept and the release failure is not allowed to mask it. `CqrsLock.acquire()` is typed to accept an async release function.

### `@zudojs/crypto` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-crypto.md)

Minor Changes

- `derivePbkdf2`, `deriveScrypt`, `validatePbkdf2Options`, `validateScryptOptions` and the Node provider's `deriveKey` now enforce the upper bounds in `PASSWORD_HASH.LIMITS` (scrypt cost ≤ 2^20, block size ≤ 32, parallelization ≤ 16, `128 * cost * blockSize` ≤ 1 GiB, PBKDF2 iterations ≤ 10 000 000). Previously the scrypt memory "bound" was computed from the requested cost, so a cost read from configuration could allocate gigabytes or run for minutes.
    - New `PASSWORD_HASH.LIMITS.MAX_DERIVED_KEY_BYTES` (1024) caps `keyLength` for key derivation; password hashes keep their separate 64-byte bound.

### `@zudojs/database` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-database.md)

Minor Changes

- Audit round 9 fixes:
    - `DatabaseClient.transaction()` now raises an `AbortSignal` abort **inside** the Prisma interactive transaction, so an aborted transaction is rolled back. Previously the caller was rejected with `DatabaseAbortError` while the callback kept running and the transaction still committed.
    - `BaseRepository.update()` on a soft-delete repository now sends `{ id, deletedAt: null }` instead of `{ AND: [{ id }, { deletedAt: null }] }`. Prisma's `WhereUniqueInput` requires the unique field at the top level, so every scoped `update()` was rejected with a validation error. Subclasses can reuse the new protected `whereUniqueId(id)` helper.
    - Lock helpers (`lockRow`, `acquireAdvisoryLock`, `withRowLock`, `withAdvisoryLock`, `resolveLockTransactionOptions`) reject `timeoutMs` values below 1 ms with a `TypeError`. PostgreSQL treats `lock_timeout = 0` as "disabled", so `timeoutMs: 0` waited forever instead of failing fast; use `noWait` for that.
    - `findPaginated()` and `paginateCursor()` validate `sort` field names and directions the same way the query builder does, before any query is dispatched. Unsafe field names (for example `"name; DROP TABLE"`, `"__proto__"`) and directions other than `"asc"` / `"desc"` are now rejected instead of being forwarded to the delegate.

### `@zudojs/docs` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-docs.md)

Patch Changes

- `nodesToMarkdown` no longer resolves an unknown callout `kind` such as `"constructor"` through `Object.prototype`; the label is the upper-cased kind instead of a function's source text.
    - `deepFreezeClone` (and therefore `createDocument` and the registry) no longer freezes the caller's nested objects in place when the value cannot be structured-cloned; the fallback now copies plain objects, arrays and Dates recursively.
    - `validateNavigation` reports `NAVIGATION_DUPLICATE_DOCUMENT` when the same navigation node object is mounted in more than one place.

### `@zudojs/errors` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-errors.md)

Patch Changes

- A `sensitiveKeyPattern` carrying the `g` or `y` flag (passed to `redactErrorMetadata`, `sanitizeErrorMetadata`, `isSensitiveMetadataKey`, `ErrorSerializer` or `ErrorHandler`) no longer redacts on one call and leaks the same key on the next.
    - `ErrorSerializer` (and therefore `serializeError`/`ErrorHandler.toLogObject`) now applies `redactSensitiveData` to plain-object causes, which were previously copied verbatim into the serialized cause chain; the cause's shape (dates, arrays, class instances) is preserved and cycles stop at `"[Circular]"`.

### `@zudojs/events` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-events.md)

Patch Changes

- A middleware that awaits `next()` but does not return its result no longer makes `publish()` report `shortCircuited: true` with no handlers, no errors and no `onError` call; the real handler outcome is reported.
    - `stripUndefinedValues()` / `createEventPayload({ stripUndefined })` copy a `__proto__` key as data instead of swapping the result's prototype.
    - `bus.unregister(type, { removeHandlers: true })` also removes disabled handlers subscribed to exactly that type.
    - `bus.dispose()` succeeds (and the bus reaches `DISPOSED`) even when its registry was disposed first.

### `@zudojs/feature-flags` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-feature-flags.md)

Minor Changes

- Audit round 9 — provider and evaluation fixes.
    - `createCachedProvider` and `createCompositeProvider` forward `subscribe()` from the providers they wrap, so `createFeatureFlags` on the documented cached-over-composite stack now hears a flag flipped at the source instead of serving the stale copy until the TTL expires. The cached provider drops its cache before re-announcing; the composite announces the merged view with the same precedence `getAll()` applies. Neither offers `subscribe` when nothing underneath does.
    - `createEnvironmentProvider` no longer turns an empty or blank value (`FEATURE_X=`) into the number `0`; it stays the string it is.
    - A `provider.get()` that throws is reported as `reason: "error"` (and does not throw `FeatureFlagNotFoundError` under `throwOnMissing`). It used to be reported as `not_found`, telling the caller the flag does not exist when the store could not be asked.
    - `metadata.expiresAt` given as an ISO string or timestamp — what every JSON-backed provider hands over — now expires the flag. Only a real `Date` did before; a string compared as always-not-expired.

### `@zudojs/http` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-http.md)

Minor Changes

- `NodeHttpAdapter` no longer drops the connection when a query string contains malformed percent-encoding (`/?a=%E0`); the raw value is kept. Query pairs are split on the first `=` (`a=b=c` keeps `b=c`) and `+` decodes to a space. A request whose context cannot be created is answered `400 Bad Request` instead of a socket reset.
    - `serializeResponseCookie()` (used by `response.cookie()`) now validates the cookie name, enforces the `__Host-`/`__Secure-` prefix rules, rejects `;` and control characters in `Domain`/`Path`, and percent-encodes a value that is not made of RFC 6265 `cookie-octet`s, so a value like `x; Domain=evil.com` can no longer inject attributes. Valid values are emitted unchanged.
    - `HttpResponseContext.redirect()` and `redirectResponse()` refuse unsafe destinations (`javascript:`, `data:`, scheme-relative `//evil.com`, control characters) by throwing a `TypeError`; path references and absolute `http(s)` URLs are unchanged.
    - `RouteDispatcher` merges the cookies, status text and metadata of a response context returned by a route handler; previously only status, headers and body survived.
    - An `HttpError` thrown from a handler (or middleware) — `notFound()`, `unauthorized()`, … — is answered with its own status, its exposed message/code and its headers (e.g. `WWW-Authenticate`) by the default error path of `NodeHttpAdapter` and `BaseHttpAdapter`, including when it is wrapped by the middleware pipeline. Non-exposed errors and plain `Error`s still get a generic body.
    - `NodeHttpAdapter.stop()` removes the `clientError` listener it installed, so an externally supplied `http.Server` no longer accumulates one listener per restart.
    - `HttpClient` can retry a request that carries a body (`retryMethods: ["POST"]`); the first retry used to fail with "Request object that has already been used".
    - `createStaticMiddleware()` parses the adapter's request-target (`/pub/app.js`) correctly; it used to throw `Invalid URL` and answer 500 for every request delivered by `NodeHttpAdapter`.
    - README quick start rewritten against the real API (`createHttpServer` + `createNodeHttpAdapter`); `createHTTPServer` and `{ fetch }` handlers never existed.

### `@zudojs/lifecycle` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-lifecycle.md)

Minor Changes

- Startup and rollback bookkeeping fixes (audit round 9). These are behavioural changes.
    - A component that fails a startup phase no longer has its later hooks invoked: a non-critical component whose `initialize()` threw used to have `start()` and `ready()` called anyway.
    - Dependents of a failed component are no longer started. They are marked `FAILED` with a `LifecycleComponentError` naming the failed dependency, emit `component:failed`, and their own `critical` flag decides whether startup aborts (a critical dependent of a failed non-critical dependency now rejects `start()`).
    - When a critical component fails, the results of its siblings in the same stage are still recorded and their state transitions and `component:*` events still fire; they used to be dropped, leaving successful siblings reported as `INITIALIZING`/`STARTING` forever after rollback.
    - Rollback and `shutdown()` only undo phases that actually ran: `stop()` is invoked only on components whose `start` phase ran, `dispose()` only on components whose `initialize` phase ran. Calling `stop()` on a never-started server used to throw and be recorded as a phantom component failure. `shutdown()` on a manager that was never started now runs no hooks.
    - `shutdown()` requested while `start()` is in flight now waits for the executing stage to settle, then stops launching further stages; `start()` rejects with a `LifecycleStartError` (componentId `"application"`). Previously later stages kept starting components after teardown had completed and those components were never stopped.
    - `withAbort()` removes its abort listener when the operation throws synchronously.

### `@zudojs/logger` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-logger.md)

Minor Changes

- A `redact.pattern` carrying the `g` or `y` flag no longer alternates between redacting and leaking a secret-named field on consecutive entries.
    - Per-call `context` passed to `logger.log(level, message, { context })` is merged into the entry's metadata, so it reaches text formatters instead of being silently dropped; it is redacted like any other metadata.
    - `entry.context` now carries the active context's identifiers (`requestId`, `traceId`, ...) that its type always declared; the text formatter never prints an identifier twice.
    - `throwTransportErrors: true` now surfaces failures from asynchronous transports (and from `asynchronous: true` loggers): they are rethrown by the next `flush()` or `close()`, which still flush and close the transports first. Previously such failures were swallowed.
    - The buffered transport's flush timer is `unref`'d, so a finished process no longer stays alive for a full `flushInterval`.
    - Concurrent `logger.close()` calls share one closure instead of flushing and closing every transport twice.
    - README: the log-injection example contained a raw ESC control byte where the text `\u001b` was meant.

### `@zudojs/messaging` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-messaging.md)

Patch Changes

- Handlers now receive the dispatch context: `DispatchOptions.context` (headers, correlation/causation overrides, `state`) and anything a middleware stored in `context.state` reach the handler instead of a fresh empty context.
    - A caller-provided `AbortSignal` no longer accumulates one `abort` listener per dispatch; the listener is removed when the dispatch settles.
    - Re-registering a handler id (`allowDuplicateHandlerIds`) re-indexes its message types, so the replacement no longer receives the old handler's types and a single-handler registry can replace a handler for the same type.
    - A dispatch cancelled through its `AbortSignal` between handlers fails with `MessageDispatchAbortedError` rather than a `MessageHandlerError` blamed on the handler that never ran.

### `@zudojs/middleware` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-middleware.md)

Patch Changes

- `sanitizeLogValue()` (used by `loggingMiddleware`) now escapes the Unicode line separator (U+2028), paragraph separator (U+2029), next-line (U+0085) and the C1 control range, so a request path containing them can no longer split a log line.

### `@zudojs/observability` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-observability.md)

Patch Changes

- Redaction now covers instances of user-defined classes (DTOs, request models) nested in log contexts and span attributes. Their own enumerable fields are what exporters serialize, so a `password` field on a class instance previously reached the exporter unredacted. Built-ins (`Date`, `Error`, `Map`, `Set`, typed arrays, `URL`) are still left intact, and redacted instances keep their prototype.

### `@zudojs/openapi` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-openapi.md)

Minor Changes

- Schema conversion: constraints on `coerce.number()` / `coerce.string()` (`int`, `min`, `max`, `pattern`, …) are now carried into the document instead of a bare `type`; `s.transform(schema, fn)` converts to its source schema instead of `{}`; a `.default(() => value)` factory is invoked and its value emitted rather than the function (which JSON dropped silently); `s.bigint()` converts like `coerce.bigint()`.
    - Schema conversion: object properties with a `default`, or typed `any` / `unknown`, are no longer listed as `required`, matching what the object parser accepts; `.required()` still forces every key on.
    - `OpenAPIManager.removeRoute()` (and hiding a route via `setRoute`) now takes effect on the next `generate()`; previously a route stayed in every later document once one had been generated. `OpenAPIRegistryImpl` gains `removeRoute(method, path)` and `clearRoutes()`.
    - `OpenAPIManager.toUIResponse()` renders a custom `branding` logo in the page header, as documented, instead of always showing the default wordmark.
    - Documentation page: URL guards strip ASCII control characters before reading the scheme, so `java\nscript:` / `java\tscript:` URLs are refused; a `data:` URL that is not `data:image/*` is refused (the assets base is interpolated into `<script src>`).
    - Validator: local `$ref`s are resolved against own properties only (`#/components/schemas/constructor` no longer validates); an operation-level parameter overriding a path-level one is accepted instead of reported as a duplicate; two paths identical apart from template parameter names are reported as an error.
    - YAML serializer: quotes `.inf` / `.nan`, hex / octal / binary integers, `_`-grouped digits, sexagesimal numbers, dates and timestamps, `=` and `<<`, and control characters, all of which a YAML parser turned into non-string values (an `info.version` of `2024-01-01` became a date, an enum value `0x1F` became `31`).

### `@zudojs/permissions` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-permissions.md)

Minor Changes

- Audit round 9 — authorization fixes.
    - A deny rule is no longer overridden by an allowing policy. `deny-overrides` said any applicable deny wins, yet a policy allowing `post:*` cancelled a `deny post:update` rule. A check the rules denied now stays denied, with `reason: "rule_deny"` (previously `"no_matching_rule"`) and the rule's name in `decision.policy`.
    - Cache keys escape `|` (and `\`) inside actor and resource ids. Actor `u|post:read` checking `x:y` used to share a key with actor `u` checking `post:read` on resource `x:y`, so one actor's cached decision could answer for another. Ids without those characters produce the same keys as before.
    - An `Ability` now reads a live policy registry. It captured the policy list when it was created, so a policy defined (or removed) afterwards was enforced by `engine.can()` and ignored by `ability.can()` for the same actor.
    - `createRoleRegistry().define()`, `createPolicyRegistry().define()` and the inline `roles` array copy the `permissions`, `inherits` and `rules` arrays they are given. Mutating the caller's array after registration no longer widens a role or re-scopes a policy behind validation.

### `@zudojs/plugins` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-plugins.md)

Minor Changes

- Restart safety and semver ordering fixes (audit round 9).
    - `PluginManager.start()` now throws `PluginStateError` when a plugin in the startup order has already been disposed (after `stop()` or a rolled-back startup). It used to skip disposed plugins silently, so a second `start()` resolved with nothing running, and a still-registered dependent could be started on top of dependencies that had been disposed. Unregister and re-register the disposed plugins, or use a new manager.
    - `compareVersions` (and therefore `satisfiesVersion` / dependency version checks) compares prerelease identifiers per the semver specification: numeric identifiers compare numerically and rank below alphanumeric ones. `1.0.0-alpha.10` was sorted before `1.0.0-alpha.9`.

### `@zudojs/queue` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-queue.md)

Minor Changes

- `createWorker()` now honours `WorkerOptions.concurrency`: jobs are dispatched in parallel up to the limit. Previously the worker awaited each job before polling again, so it ran one job at a time whatever `concurrency` said.
    - `Worker.stop()` is now graceful as documented: in-flight jobs get `drainTimeout` to finish and are only aborted when it elapses. Previously `stop()` aborted every running job immediately, making it indistinguishable from `forceStop()` for processors that honour their signal.

### `@zudojs/rpc` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-rpc.md)

Minor Changes

- `RPCServer.handle()` and `RPCDispatcher.dispatch()` accept a frame without `metadata` (it is optional on the wire); previously it crashed with a TypeError reported as `RPC_INTERNAL_ERROR`. `createRPCContext` defaults `metadata` to `{}`.
    - Errors thrown with `expose: false` — `RPCInternalError`, `RPCSerializationError`, a plain `RPCError` or a subclass that does not opt in — no longer put their message on the wire: the caller receives the error's code with the generic internal-error message, and the original error is passed to `onInternalError`. Messages of typed, exposed errors (`RPCTimeoutError`, `RPCValidationError`, auth, rate-limit, …) are unchanged.
    - A handler result that fails the procedure's `output` schema is now an `RPCInternalError` (server fault, reported to `onInternalError` with the failing paths) instead of an `RPC_VALIDATION_ERROR` with empty `details` that blamed the caller's input. `parseOutput` throws `RPCInternalError`.
    - `RPCClient` passes its effective timeout to the transport as `RPCTransportRequestOptions.timeout`, which was declared but never populated.
    - An `RPC_TIMEOUT` response is rebuilt on the client as an `RPCTimeoutError` carrying the server's message instead of "timed out after 0ms".
    - README rewritten: the usage example called APIs that do not exist (`createRPCProcedure({ ... })`, `new RPCDispatcher()`, `dispatcher.register`, `dispatcher.call`).

### `@zudojs/runtime` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-runtime.md)

Minor Changes

- **`runtimeId` is now actually generated when omitted.** It was documented as auto-generated, but nothing generated it: an omitted id reached `runtime.context.runtimeId`, every event payload and every log line as `undefined`. `resolveRuntimeOptions()` now fills in `rt_<32 hex>` via `createRuntimeId()`; an explicit id is honoured as before.
    - **`stop()` during `start()` no longer throws.** Calling `stop()` while startup was in flight threw `RuntimeStateError` ("cannot stop a runtime in state initializing"), so a SIGTERM arriving while modules were still coming up was logged as "Shutdown failed" and the runtime carried on to `running`. `stop()` now waits for the in-flight start to settle (bounded by `startupTimeout`) and then shuts the runtime down.
    - **Removing the last readiness check restores readiness.** A running runtime whose only (failing) check was removed stayed at `ready: false` / `readiness.state: "degraded"` while `health.state` — which sees no checks — reported `healthy`. `ReadinessTracker.removeCheck()` now returns to `ready` when the last check is removed from a degraded tracker.

### `@zudojs/scheduler` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-scheduler.md)

Minor Changes

- A scheduler at its `maxConcurrency` ceiling no longer spins a zero-delay tick loop while a due schedule waits; the timer is re-armed when an execution finishes.
    - Resuming a paused one-shot schedule whose fire time has passed now applies the misfire policy (`run-once`/`catch-up` fire it, `skip` retires it) instead of leaving it active forever with nothing able to dispatch it.
    - `define()` rejects a non-finite `timeout` or one above `MAX_TIMER_DELAY`, and the executor clamps oversized budgets. Previously `timeout: Infinity` was accepted and the job failed after 1ms because Node clamps the timer.
    - A `ScheduleHandle` reports `"completed"` once its one-shot schedule has fired, instead of `"active"`.

### `@zudojs/schema` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-schema.md)

Patch Changes

- A missing object key is only reported as `required` when its schema actually rejects `undefined`. `schema.undefined()`, a union containing it, and `refine`/`transform`/`lazy` wrapped around an optional schema now accept an absent key (a `transform` default is applied); `.required()` still forces the key.
    - `safeParse` no longer throws a `TypeError` while building an issue message: a BigInt or circular value against a literal/enum schema, a null-prototype discriminator value, and a `refine`/`transform` that throws a value `String()` cannot render are all reported as ordinary issues.

### `@zudojs/security` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-security.md)

Patch Changes

- `createRateLimiter` clamps its cleanup timer to 2^31 - 1 ms. A `windowMs` longer than ~24.8 days overflowed Node's timer delay, which silently became 1 ms and swept the whole store a thousand times a second.
    - Key-cap eviction in `createRateLimiter` is now O(1) (least-recently-seen order kept in the store) instead of copying and sorting every tracked key on each new key past `maxKeys`, which let key rotation turn the eviction defence into a CPU sink.
    - `validateBodyFraming` checks a repeated `Transfer-Encoding` field (`string[]`) the same way as a single one; `["gzip"]` used to pass where `"gzip"` was rejected.

### `@zudojs/serialization` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-serialization.md)

Patch Changes

- `JSONSerializer.serialize` / `deserialize` (and `createSerializer("json")`) honour an explicit `maxDepth` on the fast path too. It was only read when `preserveTypes` was on, so a per-call or per-instance depth limit was silently ignored for plain JSON.

### `@zudojs/storage` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-storage.md)

Minor Changes

- `LocalObjectStorage` now works when its base directory is reached through a symlink (macOS `tmpdir()`, mounted volumes). Containment compares the real path of the base with the real path of the target; previously every key was rejected as a path traversal.
    - `ConnectionPool.release()` no longer strands a parked waiter when the released connection is retired for exceeding `maxLifetime`: a fresh connection is created and handed to the waiter, or the waiter is rejected with the factory's error instead of timing out.
    - `BaseRepository.update()` throws `NotFoundError` (`STORAGE_ENTITY_NOT_FOUND`) when no row matched, instead of resolving `undefined` typed as the entity.
    - `LocalObjectStorage.exists()` returns `false` and `metadata()` returns `null` for the directory created by a nested key (`put("a/b.txt")` no longer makes `exists("a")` true).
    - An oversized streamed `put()` now cancels the source stream when the byte budget is exceeded, instead of only releasing the reader.

### `@zudojs/tenancy` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-tenancy.md)

Minor Changes

- `createPathResolver({ prefix })` no longer names a tenant for paths outside the prefix. Previously `/health` resolved to a tenant called `health`, and `/admin/...` to whichever tenant was called `admin`.
    - `createResolveTenantMiddleware` accepts `optional: true`, letting a request that resolves to no tenant proceed without one. This makes `createRequireTenantMiddleware({ requirement: "optional" })` reachable; the default remains a `404`, and a tenant that was named but is unknown, untrusted or suspended is still refused.
    - `requireCurrentTenant`, `runAs` (context manager) and `requireActive` (tenant manager) no longer depend on `this`, so they work when destructured off the manager instead of throwing a `TypeError`.

### `@zudojs/testing` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-testing.md)

Minor Changes

- Audit round 9 fixes:
    - `SpyLogger.findByMetadata()` compares structurally (same walker as the assertions) instead of by `JSON.stringify`. It no longer matches any `Map`/`Set` against any other, no longer ignores `undefined` properties, and now matches objects regardless of key order.
    - `assertThrows()` given an async function (or any function returning a promise) now throws "returned a promise; use assertRejects" and handles the rejection, instead of reporting "did not throw" and leaking an unhandled rejection.
    - `CleanupManager.dispose()` called while a previous `dispose()` is still running now shares that run (and its `AggregateError`) instead of resolving immediately before the resources were released.
    - `SpyLogger.child({ metadata, level })` now records the child metadata on every call the child writes (call metadata still wins) and honours a child `level` override, matching the real logger.
    - `deepEqual` / `findDifference` / `assertResponseBody` and friends compare `Set` members and `Map` keys structurally, so `new Set([{ id: 1 }])` equals `new Set([{ id: 1 }])`.
    - `TestClock.add()` throws a `TypeError` for a non-finite duration instead of silently setting the clock to `Invalid Date`.
    - `MockFn.results` stays aligned with `calls` when the implementation throws (the slot holds `undefined`), and the new `MockFn.errors` array records the thrown values in call order.
    - `assertTypePreservesRoundTrip()` renders its failure message with `describeValue`, so a failing check on a `BigInt`, `Map` or circular value throws the assertion error rather than a `TypeError` from `JSON.stringify`.

### `@zudojs/transactions` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-transactions.md)

Minor Changes

- Nesting, timeout and retry fixes (audit round 9).
    - `nested` propagation now works inside a joined (participant) scope; it used to throw `TypeError: Transaction was not created by @zudojs/transactions`.
    - A savepoint opened inside another savepoint is created, rolled back to and released on the connection; it used to receive the outer savepoint handle, which no adapter can act on.
    - `begin()` honours `timeout`: a hand-managed transaction is marked timed-out and rollback-only when the deadline passes and `commit()` then rejects with `TransactionTimeoutError`. Only `run()` armed the timer before, although `begin()` validated the option against the adapter.
    - `manager.commit()` and `manager.rollback()` release the transaction's timeout timer and registry entry once it reaches a terminal state; hand-managed transactions used to stay in the registry forever.
    - Failures thrown by `afterCommit` callbacks are reported to `hooks.onError` as an `AggregateError` (the commit itself stands); they used to be discarded.
    - `run()` with `retry` no longer replays an attempt that only joined an enclosing transaction: that attempt has already marked the enclosing transaction rollback-only, so a replay repeated its side effects to no effect. Owned (root and savepoint) transactions retry as before.

### `@zudojs/validation` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-validation.md)

Patch Changes

- `any()` with no validators no longer echoes the rejected value in its `received` field, matching `first()` and the package's rule that issues never carry the input.
    - `getSerializationDepth` counts an empty object or array as one level, so it agrees with `assertDepthWithinLimit`: a value now always passes the depth guard at exactly its measured depth (`getSerializationDepth({})` is `1`, not `0`).
