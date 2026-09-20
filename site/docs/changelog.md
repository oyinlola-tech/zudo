---
title: "Changelog"
description: "What changed in each Zudo release: per-package release notes generated from the packages' own changelogs, newest first."
source: https://zudojs.oyinlola.site/docs/changelog
---

September 2026

# Changelog

What changed in each release, package by package. These notes are generated from the packages’ own `CHANGELOG.md` files, so they describe what shipped, not what was planned.

## WHAT’S NEW — SEPTEMBER 2026 RELEASE (ROUND 11)

A third full audit of all 39 packages. Every package has a new version: 28 carry source changes, the rest are republished against new dependency versions. As in round 10, every finding was reproduced before it was fixed and ships with a regression test, and the entries that close an insecure default or change existing behaviour say so in the package notes below. Highlights:

Three fixes to take first

An `OPTIONS` request that matched a path only under other methods ran one of those handlers: `OPTIONS /accounts/42` executed the `DELETE /accounts/:id` handler, behind any CSRF or auth middleware that treats `OPTIONS` as a safe method. The fallback now resolves to a synthetic route with no middleware that answers `204` with an `Allow` header (`@zudojs/http`). `NodeHTTPRequest` — the path behind `createHTTPRequest`, `adaptNodeRequest` and `adaptNodeContext` — read `X-Forwarded-For` and `X-Forwarded-Proto` from any client with no trust check at all, so a client connecting directly set its own `request.ip` and flipped `request.secure` to `true`; the hardened `httpAdapter/node/` path already gated those headers, and this closes the parallel one that was left behind (`@zudojs/http`). Job metadata handed to `queue.add()` could carry a `zudo:context` record of its own, which the queue replayed around the middleware and the processor, so an enqueuer chose the tenant, correlation id and trace a job ran under; that key is now owned by the queue on every enqueue path (`@zudojs/queue`).

Trusting a proxy is now opt-in (behaviour change)

`X-Forwarded-For` and `X-Forwarded-Proto` are honoured only when the socket peer is a configured trusted proxy, and a forwarded protocol that is not `http` or `https` is discarded. The new `trustProxy` option — an address, a CIDR range, `"loopback"`/`"linklocal"`/`"all"`, a hop count or a predicate — defaults to `false`, so a deployment behind a proxy has to opt in. Without it, `request.ip` is the socket peer and `request.protocol` reflects the socket’s own TLS state. `@zudojs/security` tightened the same way: `extractClientIp` no longer reads `X-Forwarded-For` when the chain is shorter than the configured `trustProxy` count, because such a chain did not pass through the proxies whose entries make it trustworthy.

Authorization caches that outlived the grant

An engine in `@zudojs/permissions` configured with a `roleResolver` or a `permissionResolver` no longer caches decisions by default: a resolver reads authorization state the engine does not own and cannot see change, none of it was in the cache key, and a grant withdrawn upstream kept being served until the entry expired. Supply the new `resolverCacheKey` to get caching back. `createPermissionRegistry()` gained the `subscribe(listener)` notifier the role and policy registries already had, and `createPermissionEngine({ expandImplied })` now accepts the registry itself, so revoking an implication drops the decisions cached while it stood; a bare closure cannot announce a change, so an engine given one caches nothing rather than answering from a revoked implication.

Secrets redacted wherever they were written

`@zudojs/config` ran secret detection only on values arriving through a source, so a key such as `db.password`, `api_key` or a `postgres://user:pw@host` connection string that was seeded through `initialValues` or written with `set()` was printed in clear by `toSafeObject()`. Detection now runs inside `ConfigStore.set()` and covers every write path; pass `sensitive: false` to opt a key out. In `@zudojs/http`, `createLoggingMiddleware({ includeHeaders: true })` redacts `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and the rest of the `@zudojs/logger` secret-field set before the record reaches the logger.

Declared, exported, never called

A recurring shape this round: a capability that was typed, exported and documented, but that nothing ever invoked. `runWithRequestContext` and `getCurrentRequestContext` loaded their `AsyncLocalStorage` through `globalThis.require`, which does not exist in ESM, so request-context propagation was a silent no-op. `calculateFreshness()` / `isFresh()` never aged a cached response, so a stale one was reported fresh. A `@zudojs/logger` formatter that returned an object had its record computed and then discarded instead of reaching the transport. `AdapterOperationOptions.retry`, `RouteDispatchOptions.preserveResponse` and the router’s `strictTrailingSlash` were declared and then ignored; `EventListenerLimitExceededError` was never thrown, so every `catch` branch testing for it was unreachable; the `worker:started`, `worker:stopped`, `worker:error` and `job:cancelled` events that `QueueEventMap` declared were never emitted; a `@zudojs/messaging` handler in the advertised `{ handle(message, context) }` object form always came back as a failed dispatch; `handle.cancel()` did not abort a running one-shot schedule; and a crypto provider’s declared `capabilities` were not consulted before an operation. Each of these now does what its type and its documentation said.

Generated documents match what the server accepts

`@zudojs/openapi` emitted `additionalProperties: false` for every object schema, including one that merely strips unknown keys. That keyword means “reject the payload”, while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now, which means **checked-in specs need regenerating**. `addRoute` also detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route instead of both registering and one silently replacing the other at generation time.

Startup order, shutdown and scopes

`priority` in `@zudojs/lifecycle` is a real ordering barrier instead of a hint: components registered at one priority all complete a phase before the next priority starts, and shutdown mirrors startup within a level. `shutdown()` no longer disposes a component whose `stop()` is still running. `clearRegistrations()` and `restoreSnapshot()` in `@zudojs/container` invalidate live scopes, which used to go on serving a `SCOPED` instance built from a registration that had just been discarded. `LifecycleManager` in `@zudojs/runtime` with `continueOnFailure: true` no longer initializes or readies a module whose declared dependency failed, and the skip cascades to that module’s own dependents.

Shared primitives under hostile input

`BaseError`’s redaction walk is bounded at 32 levels, so a deeply nested `cause` taken from a parsed request body no longer raises a `RangeError` from inside the logging path. `estimateSerializedSize` defaults to a finite budget instead of `Infinity`; a `$type` tag arriving from the wire is length-checked before it is looked up and clipped before it is quoted into an error message; and the envelope trust boundary throws `InvalidSerializedDataError` rather than a bare `Error`, so hostile input can be told apart from an internal bug (`@zudojs/errors`, `@zudojs/serialization`, `@zudojs/schema`, `@zudojs/types`, `@zudojs/validation`).

> **Upgrading:** three entries need action rather than just an update. `request.ip` and `request.protocol` in `@zudojs/http` no longer honour `X-Forwarded-For` / `X-Forwarded-Proto` unless the deployment sets `trustProxy` — behind a proxy you must opt in, or every request is attributed to the proxy’s own address. An engine in `@zudojs/permissions` built with a `roleResolver` or `permissionResolver` alongside a `cache` silently stops caching until you add `resolverCacheKey`, and so does one whose `expandImplied` is a bare closure rather than the permission registry. And `@zudojs/openapi` no longer emits `additionalProperties: false` for objects that are not `.strict()`, so any checked-in spec needs regenerating. Otherwise projects created by the CLI depend on `^1.0.0`, so `pnpm update` (or `npm update`) picks these releases up; read the entries marked *behaviour change* in the package notes below before you upgrade.

## WHAT’S NEW — SEPTEMBER 2026 RELEASE (ROUND 10)

A second full audit of all 39 packages. Every finding was reproduced before it was fixed and ships with a regression test. Most changes are fixes and additions, but several close insecure defaults and are marked *behaviour change* in the package notes below. Highlights:

Safer defaults at the edge

The Node adapter guards every request and answers `400` to dot-segment and backslash paths; cookies default to `Path=/; HttpOnly; Secure; SameSite=Lax`; CORS refuses a wildcard origin with credentials (`@zudojs/http`). Tenancy refuses header- or path-only tenants by default (`minimumTrust: "verified"`). OpenAPI UI assets are pinned with Subresource Integrity and served with a CSP. RPC authorises on transport-verified `auth`, never on caller-set metadata.

Authentication and authorization

Password hashing moves to `@zudojs/crypto` scrypt with `p=5` (old hashes still verify and report `needsRehash()`); refresh tokens keep their session binding; login lockout reserves a failure before the password check. Permission deny rules whose condition throws now deny, and cache keys include the actor's roles and permissions. Rate-limit keys strip ports and bucket IPv6 by /64; the SSRF guards judge IPv4-embedded IPv6 as IPv4.

One error hierarchy, one logger

Error classes that packages defined locally (transactions, middleware, auth, OAuth, CLI, CQRS, observability, OpenAPI, HTTP guard) now live in `@zudojs/errors` and are re-exported, so `instanceof` matches either import. Default loggers in database, http, queue, plugins and events go through `@zudojs/logger` or process warnings instead of raw `console` calls, with secret redaction.

Lifecycle and data correctness

The runtime exits with code 1 after a fatal-error shutdown and rolls back modules that finish after a startup timeout; savepoint callbacks wait for the outermost commit; a `Worker` becomes the queue's only consumer; storage keys with dot or empty segments are refused; config reloads are atomic and redaction screens every source.

Docs that match the code

The package pages on this site were corrected wherever they contradicted the source, and each ends with an export index regenerated from the package's entry point.

> **Upgrading:** projects created by the CLI depend on `^1.0.0`, so `pnpm update` (or `npm update`) picks these releases up. Read the entries marked *behaviour change* in the package notes below before you upgrade.

## PER-PACKAGE NOTES

| Package | Version | Notes |
| --- | --- | --- |
| `@zudojs/adapters` | `1.2.0` | [Jump to notes](#pkg-adapters) |
| `@zudojs/api` | `1.1.1` | [Jump to notes](#pkg-api) |
| `@zudojs/auth` | `1.2.1` | [Jump to notes](#pkg-auth) |
| `@zudojs/auth-oauth` | `1.2.1` | [Jump to notes](#pkg-auth-oauth) |
| `@zudojs/cache` | `1.1.1` | [Jump to notes](#pkg-cache) |
| `zudojs-cli` | `1.2.1` | [Jump to notes](#pkg-cli) |
| `@zudojs/config` | `1.2.0` | [Jump to notes](#pkg-config) |
| `@zudojs/constants` | `1.1.1` | [Jump to notes](#pkg-constants) |
| `@zudojs/container` | `1.1.2` | [Jump to notes](#pkg-container) |
| `@zudojs/core` | `1.2.1` | [Jump to notes](#pkg-core) |
| `@zudojs/cqrs` | `1.1.1` | [Jump to notes](#pkg-cqrs) |
| `@zudojs/crypto` | `1.3.0` | [Jump to notes](#pkg-crypto) |
| `@zudojs/database` | `1.2.1` | [Jump to notes](#pkg-database) |
| `@zudojs/docs` | `1.0.3` | [Jump to notes](#pkg-docs) |
| `@zudojs/errors` | `1.2.0` | [Jump to notes](#pkg-errors) |
| `@zudojs/events` | `1.2.0` | [Jump to notes](#pkg-events) |
| `@zudojs/feature-flags` | `1.3.0` | [Jump to notes](#pkg-feature-flags) |
| `@zudojs/http` | `1.3.0` | [Jump to notes](#pkg-http) |
| `@zudojs/lifecycle` | `1.2.0` | [Jump to notes](#pkg-lifecycle) |
| `@zudojs/logger` | `1.3.0` | [Jump to notes](#pkg-logger) |
| `@zudojs/messaging` | `1.1.0` | [Jump to notes](#pkg-messaging) |
| `@zudojs/middleware` | `1.0.3` | [Jump to notes](#pkg-middleware) |
| `@zudojs/observability` | `1.1.1` | [Jump to notes](#pkg-observability) |
| `@zudojs/openapi` | `1.4.0` | [Jump to notes](#pkg-openapi) |
| `@zudojs/permissions` | `1.3.0` | [Jump to notes](#pkg-permissions) |
| `@zudojs/plugins` | `1.2.1` | [Jump to notes](#pkg-plugins) |
| `@zudojs/queue` | `1.3.0` | [Jump to notes](#pkg-queue) |
| `@zudojs/rpc` | `1.3.0` | [Jump to notes](#pkg-rpc) |
| `@zudojs/runtime` | `1.2.1` | [Jump to notes](#pkg-runtime) |
| `@zudojs/scheduler` | `1.1.2` | [Jump to notes](#pkg-scheduler) |
| `@zudojs/schema` | `1.1.1` | [Jump to notes](#pkg-schema) |
| `@zudojs/security` | `1.2.0` | [Jump to notes](#pkg-security) |
| `@zudojs/serialization` | `1.1.1` | [Jump to notes](#pkg-serialization) |
| `@zudojs/storage` | `1.1.2` | [Jump to notes](#pkg-storage) |
| `@zudojs/tenancy` | `1.2.1` | [Jump to notes](#pkg-tenancy) |
| `@zudojs/testing` | `1.1.2` | [Jump to notes](#pkg-testing) |
| `@zudojs/transactions` | `1.1.2` | [Jump to notes](#pkg-transactions) |
| `@zudojs/types` | `1.1.1` | [Jump to notes](#pkg-types) |
| `@zudojs/validation` | `1.0.3` | [Jump to notes](#pkg-validation) |

### `@zudojs/adapters` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-adapters.md)

Minor Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.
    - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
    - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
    - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
    - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
    - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
    - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
    - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
    - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
    - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

### `@zudojs/api` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-api.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/auth` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/permissions@1.3.0`, `@zudojs/crypto@1.3.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/auth-oauth` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/security@1.2.0`.

### `@zudojs/cache` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cache.md)

Patch Changes

- Cache and database correctness fixes.
    - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
    - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
    - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
    - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

### `zudojs-cli` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cli.md)

Patch Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.
    - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
    - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
    - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
    - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
    - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
    - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
    - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
    - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
    - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

### `@zudojs/config` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-config.md)

Minor Changes

- **@zudojs/config**
    - Secret detection now runs inside `ConfigStore.set()`, so a key such as `db.password`, `api_key` or a `postgres://user:pw@host` connection string is marked sensitive however it was written — from a source, from `initialValues`, from `set()` / `setMany()` / `replace()` or from `manager.set()`. Previously only values arriving through a source were redacted, and `toSafeObject()` printed the identical key in clear when it had been seeded or set at runtime. Pass `sensitive: false` explicitly to opt a key out.
    - A configuration source that declares no `priority` now gets `DEFAULT_CONFIG_SOURCE_PRIORITY` (`-1`, newly exported) instead of `0`. Both defaulted to `0` before, and because a source overwrites on *equal* priority, any source created without a priority silently wiped a manager's `initialValues` during `load()`. Sources that declare `priority: 0` or above still override them, as documented. If you relied on an undeclared source beating another source that declares `priority: 0`, declare a priority on it.
    - `ConfigLoader` now deduplicates its constructor sources by name, first occurrence wins — the same rule `addSource()` and `loadConfigSources()` already enforced. Duplicates used to load twice, with the *last* one winning.
    - `initialValues` are seeded with `source: "initialValues"` on every path, including a store the manager creates itself (it recorded `"runtime"` before).

  **@zudojs/logger**

    - A formatter that returns an object (`createStructuredLoggerFormatter()`) now reaches the transport: the record is merged over the entry instead of being computed and discarded. String formatters are unchanged.
    - A metadata getter that throws no longer propagates out of `logger.info(...)` and aborts the caller. The field becomes `"[Unreadable]"` (exported as `LOGGER_UNREADABLE_TOKEN`), the entry is still logged, and the read failure is reported like any other infrastructure failure — dropped by default, rethrown when `throwTransportErrors` is on.
    - The cycle guard tracks the ancestor path instead of every object ever seen, so `{ actor: user, target: user }` logs both fields; only a genuine back-edge becomes `"[Circular]"`. Applies to redaction, serialization and the JSON formatter.
    - `Map` and `Set` metadata keep their contents instead of collapsing to `{}`: a `Map` serializes as an object (with per-key secret redaction) and a `Set` as an array.
    - `createLoggerManagerFromLogger(logger)` now registers the logger with the manager's factory, so `manager.flush()` / `manager.close()` actually reach it and `manager.size` / `getAll()` report it. `LoggerManager.adopt(logger)` and `LoggerFactory.register(logger, name?)` are new public methods.
    - Errors are now typed where they were generic: a transport write exceeding `transportTimeout` raises `LoggerTimeoutError` (with `transportName` and `timeout`), other write failures `LoggerTransportError` with `transportName` set, formatter failures `LoggerFormatterError` with `formatterName` set, a closed `LoggerManager` `LoggerDisposedError` instead of a bare `Error`, an unknown level `InvalidLoggerLevelError`, an invalid entry timestamp `InvalidLoggerEntryError`, an unresolved string formatter id `LoggerFormatterNotFoundError`, and a write to a closed buffered transport `LoggerTransportClosedError`. Code matching on `RangeError` or on error message text from these paths needs updating.

### `@zudojs/constants` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-constants.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/container` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-container.md)

Patch Changes

- **@zudojs/lifecycle**
    - `priority` is now a real ordering barrier instead of a hint. Components registered at one priority all complete a phase before the next priority starts, so `register(metrics, { priority: 100 })` genuinely starts before `register(server, { priority: 0 })`. Previously the whole dependency level was launched concurrently (up to `concurrency`, default 10) and the sorted order was observable only at `concurrency: 1`, so whichever hook happened to finish first won. Components sharing a priority still run together, so the default configuration — every component at priority 0 — is unchanged. Shutdown now mirrors startup within a level: the lowest priority stops first, the highest last. The same reversal applies to the exported `reverseTopologicalSort`, which now reverses each stage's contents as well as the stage list.
    - `shutdown()` no longer disposes a component whose `stop()` is still running. A `stop()` hook that blows its own component `timeout` is abandoned rather than cancelled; shutdown only waited for such hooks *before* the stop phase, so one abandoned during it had `dispose()` run on top of it while `shutdown()` resolved and reported the application DISPOSED. Each shutdown phase now waits for abandoned hooks to settle before the next one begins, still bounded by the global `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer cut a drain short.
    - Registry and abort failures (`Cannot register components after registry is frozen`, `Component "x" is already registered`, an unregistered `dependsOn` target, and a cancelled `withAbort`) now throw `LifecycleError` from `@zudojs/errors` rather than a bare `Error`, so they carry an `ErrorCode` and answer `instanceof LifecycleError`. Messages are unchanged.

  **@zudojs/container**

    - `clearRegistrations()` and `restoreSnapshot()` now invalidate live scopes. Both already evicted and disposed cached singletons, but scopes were never told, so a scope went on serving the SCOPED instance built from a registration that had just been discarded — for the rest of its life, and without ever disposing it. A test harness that snapshotted, installed a SCOPED fake and then restored kept the fake. Every token that was cached when the registry is cleared or restored is now reported as invalidated, so live scopes drop and dispose their copies and the next `resolve()` rebuilds from the current registration.
    - `Container "x" has already been disposed`, `Registrations for container "x" are frozen`, `Container scopes are disabled`, the three disposed-scope guards, an unregistered `useExisting` target and an unsupported provider now throw `ContainerError` / `ContainerLifecycleError` from `@zudojs/errors` rather than a bare `Error`. Messages are unchanged.

  **@zudojs/runtime**

    - `LifecycleManager` with `continueOnFailure: true` no longer initializes or readies a module whose declared dependency failed. It previously consulted only the failure count, so `api` with `dependencies: ["db"]` had both `onInitialize` and `onReady` invoked — and appeared in `start().succeeded` — after `db` failed to come up. Such a module is now skipped, reported in `initialize().failed` with the blocking dependency named, and the skip cascades to its own dependents. Modules independent of the failure still continue, and `continueOnFailure: false` (the default, and what `createRuntime()` uses) is unaffected.
    - Runtime option validation and `RuntimeRegistry.register()` / `require()` now throw `RuntimeError` / `RuntimeStateError` rather than a bare `Error`. Messages are unchanged.

### `@zudojs/core` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-core.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/cqrs` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cqrs.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/events@1.2.0`, `@zudojs/middleware@1.0.3`.

### `@zudojs/crypto` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-crypto.md)

Minor Changes

- Closed four places where a security decision was made from input that could not support it, and two where a revoked grant kept answering from a cache. Every change here refuses more than it did before; none of them accepts anything new.

  **@zudojs/permissions**

    - `createPermissionRegistry()` now has `subscribe(listener)`, the same change notifier `createRoleRegistry()` and `createPolicyRegistry()` already carried, and it fires on `define`, a `remove` that removed something, and `clear`. `createPermissionEngine({ expandImplied })` accepts the registry itself in place of a closure — pass `expandImplied: permissions` — and subscribes to it, so revoking an implication drops the decisions that were cached while it stood. Previously `permissions.remove("post:admin")` left every `post:delete` it had implied answering `true` for the whole cache TTL, while `skipCache: true` correctly said `false`. A bare `(permission) => permissions.expandImplied(permission)` still works, but it cannot announce a change, so an engine given one now caches no decisions rather than serving one made under a revoked implication.
    - An engine with a `roleResolver` or a `permissionResolver` no longer caches decisions by default. A resolver reads authorization state the engine does not own and cannot see change, and none of it was in the cache key, so a grant withdrawn upstream kept being served until the entry expired. To get caching back, supply the new `resolverCacheKey` — a function of the actor returning something that changes whenever the resolver's answer for that actor could change (a grants-table version, an `updatedAt` stamp). Returning `undefined` leaves that actor uncached. Engines without a resolver are unaffected.
    - The README's request-metadata example imported `requireCurrentTenant` from `@zudojs/tenancy`, which does not export it; it now uses `createContextManager({ storage: getDefaultStorage() }).requireCurrentTenant().id`, which is where the method actually lives.

  **@zudojs/security**

    - `extractClientIp` no longer reads `X-Forwarded-For` when the chain is shorter than the configured `trustProxy` count. Such a chain did not pass through the proxies whose entries make it trustworthy, and the index clamp landed on the entry the client wrote — so with `trustProxy: 2` a request arriving at an inner hop with `X-Forwarded-For: 1.2.3.4` was rate-limited as `1.2.3.4`, and rotating that value gave the caller a fresh bucket each time. Short chains now fall through to `x-real-ip` and then `remoteAddress`. Chains at or above the configured length behave exactly as before.
    - `createCsrfProtection` and `requiresCsrfProtection` reject a `methods` list that is empty, not an array, or contains a blank entry, with `ConfigurationError`. `methods: []` used to turn CSRF off for every request in silence, which is what `process.env.CSRF_METHODS?.split(",").filter(Boolean) ?? []` produces when the variable is unset. Omit `methods` for the defaults.
    - `containsTraversal` and `validateRequestTarget` strip RFC 3986 path parameters before segmenting, so `/a/..;/b` is reported as traversal like every other spelling of it. Tomcat, Jetty and several reverse-proxy pairings resolve it to `/a/../b`. `....//` is still not a traversal, and nothing that was already caught has changed.
    - `sanitizeObject` rejects a `maxDepth` that is not an integer of 1 or more with `ConfigurationError`. `maxDepth: 0` discarded the argument itself and returned `undefined` under a non-optional `T`.

  **@zudojs/crypto**

    - A provider's declared `capabilities` are now consulted before every operation. A provider declaring `signing: false` had `sign` called anyway; it now throws a `CryptoError` naming the capability and the operation. `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and `passwordHashing` are all checked, including through `verifyPassword`, which raises rather than reporting a missing capability as a wrong password. A provider that declares every capability it implements is unaffected.
    - `setDefaultCryptoProvider` checks that all twelve provider methods are functions and that every capability flag is a boolean, so installing a partial object fails at the call that installs it instead of throwing a `TypeError` from inside whichever operation reached the missing method first. A rejected provider is not installed.
    - New exports: `assertProviderCapability`, `assertCryptoProvider`, `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability`, `assertPasswordHashingCapability` and `CRYPTO_PROVIDER_METHODS`, for anyone writing their own provider or wrapper.

### `@zudojs/database` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-database.md)

Patch Changes

- Cache and database correctness fixes.
    - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
    - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
    - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
    - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

### `@zudojs/docs` v1.0.3

[Package documentation](https://zudojs.oyinlola.site/docs/packages-docs.md)

Patch Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.
    - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
    - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
    - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
    - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
    - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
    - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
    - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
    - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
    - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

### `@zudojs/errors` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-errors.md)

Minor Changes

- **@zudojs/errors**
    - New `EventListenerLimitExceededError` (`ErrorCode.EVENT_LISTENER_LIMIT_EXCEEDED`), carrying `pattern`, `count` and `limit`. It is reported as internal and is never exposed to a caller, because registering past a handler limit is a programming fault rather than bad input.

  **@zudojs/events**

    - `EventListenerLimitExceededError` can now actually be raised. Nothing in the package ever threw it before, so any `catch` branch testing for it was unreachable. Exceeding `maxHandlersPerPattern` still emits a one-shot warning by default; set the new `enforceHandlerLimit: true` on a registry (or emitter/bus options) to refuse the registration instead, which throws the error and leaves the registry exactly as it was. The class is now owned by `@zudojs/errors` and re-exported here, so existing imports keep working.
    - A bus or registry observer (`bus.subscribe`, `registry.subscribe`) that throws is no longer discarded in silence. With no `onError` hook configured, the failure is now reported once per bus or registry on Node's process warning channel as a `ZudojsEventsWarning` with code `ZUDOJS_EVENTS_OBSERVER_ERROR`, matching how the handler-leak warning is already reported. A configured `onError` hook still takes precedence and the warning is not emitted.

  **@zudojs/messaging**

    - A handler registered in object form — `{ handle(message, context) }`, which `MessageHandlerLike` has always advertised — now actually runs. Previously the dispatcher invoked the handler as a function, so every dispatch to an object handler came back as a failed dispatch with `handler.handler is not a function`. `NamedMessageHandler.handler` now accepts either form, and `this` is bound for class-based handlers.
    - `DispatchResult.handlerResults` is now a snapshot taken when the dispatch settles. A handler still running after a timeout can no longer push a `success: true` record into the result of a dispatch that already failed with `MessageTimeoutError`, so audit records and metrics derived from `handlerResults` are stable once you have awaited the dispatch.
    - The `Dispatcher` interface now declares `dispose()`, `getRegistry()` and `listMiddleware()`, all of which `DefaultDispatcher` already implemented. `createDispatcher().dispose()` compiles without a cast.

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/events` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-events.md)

Minor Changes

- **@zudojs/errors**
    - New `EventListenerLimitExceededError` (`ErrorCode.EVENT_LISTENER_LIMIT_EXCEEDED`), carrying `pattern`, `count` and `limit`. It is reported as internal and is never exposed to a caller, because registering past a handler limit is a programming fault rather than bad input.

  **@zudojs/events**

    - `EventListenerLimitExceededError` can now actually be raised. Nothing in the package ever threw it before, so any `catch` branch testing for it was unreachable. Exceeding `maxHandlersPerPattern` still emits a one-shot warning by default; set the new `enforceHandlerLimit: true` on a registry (or emitter/bus options) to refuse the registration instead, which throws the error and leaves the registry exactly as it was. The class is now owned by `@zudojs/errors` and re-exported here, so existing imports keep working.
    - A bus or registry observer (`bus.subscribe`, `registry.subscribe`) that throws is no longer discarded in silence. With no `onError` hook configured, the failure is now reported once per bus or registry on Node's process warning channel as a `ZudojsEventsWarning` with code `ZUDOJS_EVENTS_OBSERVER_ERROR`, matching how the handler-leak warning is already reported. A configured `onError` hook still takes precedence and the warning is not emitted.

  **@zudojs/messaging**

    - A handler registered in object form — `{ handle(message, context) }`, which `MessageHandlerLike` has always advertised — now actually runs. Previously the dispatcher invoked the handler as a function, so every dispatch to an object handler came back as a failed dispatch with `handler.handler is not a function`. `NamedMessageHandler.handler` now accepts either form, and `this` is bound for class-based handlers.
    - `DispatchResult.handlerResults` is now a snapshot taken when the dispatch settles. A handler still running after a timeout can no longer push a `success: true` record into the result of a dispatch that already failed with `MessageTimeoutError`, so audit records and metrics derived from `handlerResults` are stable once you have awaited the dispatch.
    - The `Dispatcher` interface now declares `dispose()`, `getRegistry()` and `listMiddleware()`, all of which `DefaultDispatcher` already implemented. `createDispatcher().dispose()` compiles without a cast.

### `@zudojs/feature-flags` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-feature-flags.md)

Minor Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.
    - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
    - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
    - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
    - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
    - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
    - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
    - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
    - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
    - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

### `@zudojs/http` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-http.md)

Minor Changes

- **Breaking-in-effect default: `X-Forwarded-*` is no longer trusted automatically.**

  `NodeHTTPRequest` — reached through `createHTTPRequest`, `NodeHTTPAdapter`, `createHTTPAdapter()`, `adaptNodeRequest()` and `adaptNodeContext()` — used to read `X-Forwarded-For` and `X-Forwarded-Proto` from any client, with no trust check at all. A client connecting directly could set its own `request.ip` (defeating an IP allowlist, per-IP rate limit, ban list or audit trail) and flip `request.secure` to `true` (an `X-Forwarded-Proto: wss` was enough), so an app gating `Secure` cookies, HSTS or an https-only redirect on `req.secure` believed the request had arrived over TLS. The hardened Node adapter path (`httpAdapter/node/`) already gated these headers; this closes the parallel path that was left behind.

  These headers are now honoured only when the socket peer is a configured trusted proxy, and a forwarded protocol that is not `http` or `https` is discarded. **If you run behind a proxy you must now opt in**, with a new `trustProxy` option (address, CIDR range, `"loopback"`/`"linklocal"`/`"all"`, hop count or predicate) that defaults to `false`:

  ```ts
createHTTPAdapter({ trustProxy: "10.0.0.0/8" });
adaptNodeRequest(req, { trustProxy: "10.0.0.0/8" });
adaptNodeContext(req, res, { trustProxy: "10.0.0.0/8" });
createHTTPRequest(req, { trustProxy: "10.0.0.0/8" });
```

  Without it, `request.ip` is the socket peer and `request.protocol` reflects the socket's own TLS state. The exported `getRequestProtocol(request)` and `getRequestIP(request)` take the same value as an optional second argument.

  Also in this release:

    - The shared agent registry can find what it created. `getAgent`, `hasAgent` and `removeAgent` looked up a key `getOrCreateAgent` never wrote, so every lookup missed and the documented per-host teardown was a no-op that leaked the agent and its keep-alive sockets for the process lifetime. All four now build the same key; `getAgent`/`hasAgent` take the same optional agent options, and `removeAgent` without options destroys every agent registered for that host.
    - `createForwardedHeader` and `formatKeepAliveHeader` no longer emit a raw CR or LF inside a quoted parameter. Both now escape through the package's `escapeHeaderQuotedString` and validate the finished field value, so a `Forwarded` or `Keep-Alive` value carrying a control character throws a `TypeError` instead of putting an attacker-chosen header on the wire.
    - `createSecurityMiddleware()` with no options now emits the package's declared safe baseline (`createDefaultSecurityHeaderOptions`) — `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, the cross-origin isolation headers and `X-Permitted-Cross-Domain-Policies`, on top of the three it emitted before. Explicit options still override it, and `useDefaults: false` still emits only what you configure.
    - `guardRequest` applies `maxHeaderValueSize` and the CRLF filter to array-valued headers (`set-cookie`, and any header supplied as a list), which previously skipped both checks and still reported `allowed: true`.
    - `createLoggingMiddleware({ includeHeaders: true })` redacts credential headers — `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and the rest of the `@zudojs/logger` secret-field set — before the record reaches the logger. Extra names can be added with `redactHeaders`.
    - The redirect predicates accept a relative `Location`. `hasRedirectLoop`, `assertNoRedirectLoop`, `isSameOrigin` and `isHTTPS` threw `TypeError: Invalid URL` on `/a`, which is both legal under RFC 9110 and what this module's own `createRedirect` emits by default.
    - The proxy SSRF blocklist covers `192.0.0.0/24` (IETF protocol assignments) and `198.18.0.0/15` (benchmarking), which its JSDoc already claimed.
    - `runWithRequestContext` / `getCurrentRequestContext` work. The `AsyncLocalStorage` behind them was loaded through `globalThis.require`, which does not exist in ESM, so the store silently stayed `undefined`: `runWithRequestContext` merely called its callback and `getCurrentRequestContext()` always returned `undefined`.
    - `request.path` and the router now agree about repeated slashes. A request for `//admin/secret` dispatched to the route registered at `/admin/secret` while a guard reading `request.path` saw `//admin/secret` and did not match. Repeated slashes are collapsed once, where both sides parse the request-target, so `getPathname("//admin/secret")` is `/admin/secret`. An origin-form target is still never parsed as an authority.
- Harden and consolidate the HTTP query layer.

  `NodeHTTPRequest.query`, `createHTTPRequest()` and the `parseQueryString` the package barrel exports all ran a second, unhardened query parser that accumulated into an object literal and read `result[key]` without an own-property check. On fully attacker-controlled input that meant:

    - `?__proto__=a&__proto__=b` assigned an array through the `__proto__` setter, replacing the returned query object's prototype. The parameter vanished from its own keys while the object silently gained `length`, `map` and the rest of `Array.prototype`.
    - `?constructor=x` read the inherited `Object` constructor as the "existing" value and stored it in the result, handing a handler `query.constructor === [Object, "x"]`.
    - None of the four documented query limits applied, so a request carrying 50,000 parameters was parsed in full.

  All of these paths now delegate to the hardened `httpQuery` parser that the Node adapter and the router already used, so every entry point produces a null-prototype record, drops `__proto__` / `constructor` / `prototype`, and throws `HTTPQueryLimitError` (414) on a limit breach.

  Also fixed in `httpQuery`:

    - `getQueryStrings()` threw `TypeError: Cannot convert object to primitive value` for `?a[b]=1&a=2`, because the parsed array holds a null-prototype object that `String()` cannot coerce. It is now total over every parseable shape.
    - `getQueryString()` returned `null` while declaring `string | undefined`; a literal `?a=null` now yields `"null"`.
    - `hasQuery()` and `querySize()` answered from the raw search params rather than the parsed query, so `hasQuery(req, "a")` was `false` for `?a[b]=1` and `hasQuery(req, "__proto__")` was `true` for a key the parser drops. They now answer about the object `getQuery()` returns.
    - `maxKeys` was checked before comma expansion, so one parameter could expand past the cap under `commaSeparated`. It now counts emitted pairs.
    - `maxTotalLength` and `commaSeparated` were ignored when the input was a `URLSearchParams`; both entry points now share one tokenizer.
    - `cloneQuery()` used a `JSON.parse(JSON.stringify(…))` round-trip, which rebuilt every level with `Object.prototype` and so discarded the null prototype the parser exists to guarantee. It is now a structural deep copy.
    - `mergeQuery()` assigned nested source objects by reference, so the merged result aliased its inputs. Values are deep-copied.
    - `stringifyQuery()` / `buildQueryString()` had no depth or cycle guard and overflowed the stack with a bare `RangeError` on a cyclic or deeply nested object. Both now throw `HTTPQueryLimitError`, and both accept a `maxDepth` option.

  `QueryValue` is now recursive (`QueryPrimitive | QueryValue[] | QueryObject`). The previous `QueryPrimitive[]` described a shape the parser could not produce, since `?a[b]=1&a=2` puts an object inside the array.

  `httpQuery` is split into `queryTypes/`, `queryParse/`, `queryRequest/` and `querySerialize/`. The public API is unchanged and still re-exported from `@zudojs/http`.
- Router, content negotiation and cache-control fixes.
    - An `OPTIONS` request that only matches routes registered under other methods no longer runs one of those handlers. The fallback now resolves to a synthetic route with no middleware that answers `204` with an `Allow` header, which is what `HttpRouter.dispatch()` already did. Previously `OPTIONS /accounts/42` executed a `DELETE /accounts/:id` handler — behind any CSRF or auth middleware that treats `OPTIONS` as a safe method.
    - Headers, cookies, status and metadata that route middleware writes to `context.response` are kept when the handler runs. They used to be discarded whenever the handler returned its own response, so a guard that set a security header and called `next()` had no effect on the response sent.
    - Route patterns are no longer truncated at the first `?`, so the documented optional-parameter syntax (`/account/:id?/profile`, `/files/{name?}`) works. `{name?}` no longer throws `InvalidRoutePatternError`, registering both `/users/:id` and `/users/:id?` no longer throws a spurious `RouteConflictError`, and an optional parameter only claims a path segment when the segments after it still have input left. Request paths are unaffected: their query string is still stripped.
    - `strictTrailingSlash` is honoured. A strict router now distinguishes `/users` from `/users/` instead of storing the option and ignoring it.
    - Route precedence compares segments left to right by kind (literal, then parameter, then wildcard) instead of summing them into one score, so `/admin/*rest` now wins over `/:p/:q/:r/:s` for `GET /admin/a/b/c`. Fully literal and mixed patterns rank as before.
    - `Allow` honours the router's `caseSensitive` option, so a case-sensitive router no longer advertises a method belonging to a route that differs only by case.
    - `RouteDispatchOptions.preserveResponse` is implemented: with it set, a handler's response is no longer merged into the response passed to `dispatch()`.
    - `calculateFreshness()` / `isFresh()` age a cached response. The current age is now the `Age` header plus the time elapsed since the response's `Date`, and `Expires` is compared against the current time, so a stale response is finally reported stale. `calculateFreshness()` takes an optional third argument for the current time.
    - `getEncodingQuality()` / `getLanguageQuality()` let the most specific preference win, so an explicit `gzip;q=0` is no longer overridden by `*;q=1`.
    - `negotiateEncoding()` falls back to `identity` when the client names only codings the server does not have, unless `identity;q=0` or a `*;q=0` excludes it.
    - New helpers are exported alongside the existing ones: `normalizeRoutePattern`, `normalizeMatchPath`, `splitRoutePattern`, `hasTrailingSlash` and `compareSegmentSpecificity`. `normalizePath` keeps its current request-path behaviour.

### `@zudojs/lifecycle` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-lifecycle.md)

Minor Changes

- **@zudojs/lifecycle**
    - `priority` is now a real ordering barrier instead of a hint. Components registered at one priority all complete a phase before the next priority starts, so `register(metrics, { priority: 100 })` genuinely starts before `register(server, { priority: 0 })`. Previously the whole dependency level was launched concurrently (up to `concurrency`, default 10) and the sorted order was observable only at `concurrency: 1`, so whichever hook happened to finish first won. Components sharing a priority still run together, so the default configuration — every component at priority 0 — is unchanged. Shutdown now mirrors startup within a level: the lowest priority stops first, the highest last. The same reversal applies to the exported `reverseTopologicalSort`, which now reverses each stage's contents as well as the stage list.
    - `shutdown()` no longer disposes a component whose `stop()` is still running. A `stop()` hook that blows its own component `timeout` is abandoned rather than cancelled; shutdown only waited for such hooks *before* the stop phase, so one abandoned during it had `dispose()` run on top of it while `shutdown()` resolved and reported the application DISPOSED. Each shutdown phase now waits for abandoned hooks to settle before the next one begins, still bounded by the global `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer cut a drain short.
    - Registry and abort failures (`Cannot register components after registry is frozen`, `Component "x" is already registered`, an unregistered `dependsOn` target, and a cancelled `withAbort`) now throw `LifecycleError` from `@zudojs/errors` rather than a bare `Error`, so they carry an `ErrorCode` and answer `instanceof LifecycleError`. Messages are unchanged.

  **@zudojs/container**

    - `clearRegistrations()` and `restoreSnapshot()` now invalidate live scopes. Both already evicted and disposed cached singletons, but scopes were never told, so a scope went on serving the SCOPED instance built from a registration that had just been discarded — for the rest of its life, and without ever disposing it. A test harness that snapshotted, installed a SCOPED fake and then restored kept the fake. Every token that was cached when the registry is cleared or restored is now reported as invalidated, so live scopes drop and dispose their copies and the next `resolve()` rebuilds from the current registration.
    - `Container "x" has already been disposed`, `Registrations for container "x" are frozen`, `Container scopes are disabled`, the three disposed-scope guards, an unregistered `useExisting` target and an unsupported provider now throw `ContainerError` / `ContainerLifecycleError` from `@zudojs/errors` rather than a bare `Error`. Messages are unchanged.

  **@zudojs/runtime**

    - `LifecycleManager` with `continueOnFailure: true` no longer initializes or readies a module whose declared dependency failed. It previously consulted only the failure count, so `api` with `dependencies: ["db"]` had both `onInitialize` and `onReady` invoked — and appeared in `start().succeeded` — after `db` failed to come up. Such a module is now skipped, reported in `initialize().failed` with the blocking dependency named, and the skip cascades to its own dependents. Modules independent of the failure still continue, and `continueOnFailure: false` (the default, and what `createRuntime()` uses) is unaffected.
    - Runtime option validation and `RuntimeRegistry.register()` / `require()` now throw `RuntimeError` / `RuntimeStateError` rather than a bare `Error`. Messages are unchanged.

### `@zudojs/logger` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-logger.md)

Minor Changes

- **@zudojs/config**
    - Secret detection now runs inside `ConfigStore.set()`, so a key such as `db.password`, `api_key` or a `postgres://user:pw@host` connection string is marked sensitive however it was written — from a source, from `initialValues`, from `set()` / `setMany()` / `replace()` or from `manager.set()`. Previously only values arriving through a source were redacted, and `toSafeObject()` printed the identical key in clear when it had been seeded or set at runtime. Pass `sensitive: false` explicitly to opt a key out.
    - A configuration source that declares no `priority` now gets `DEFAULT_CONFIG_SOURCE_PRIORITY` (`-1`, newly exported) instead of `0`. Both defaulted to `0` before, and because a source overwrites on *equal* priority, any source created without a priority silently wiped a manager's `initialValues` during `load()`. Sources that declare `priority: 0` or above still override them, as documented. If you relied on an undeclared source beating another source that declares `priority: 0`, declare a priority on it.
    - `ConfigLoader` now deduplicates its constructor sources by name, first occurrence wins — the same rule `addSource()` and `loadConfigSources()` already enforced. Duplicates used to load twice, with the *last* one winning.
    - `initialValues` are seeded with `source: "initialValues"` on every path, including a store the manager creates itself (it recorded `"runtime"` before).

  **@zudojs/logger**

    - A formatter that returns an object (`createStructuredLoggerFormatter()`) now reaches the transport: the record is merged over the entry instead of being computed and discarded. String formatters are unchanged.
    - A metadata getter that throws no longer propagates out of `logger.info(...)` and aborts the caller. The field becomes `"[Unreadable]"` (exported as `LOGGER_UNREADABLE_TOKEN`), the entry is still logged, and the read failure is reported like any other infrastructure failure — dropped by default, rethrown when `throwTransportErrors` is on.
    - The cycle guard tracks the ancestor path instead of every object ever seen, so `{ actor: user, target: user }` logs both fields; only a genuine back-edge becomes `"[Circular]"`. Applies to redaction, serialization and the JSON formatter.
    - `Map` and `Set` metadata keep their contents instead of collapsing to `{}`: a `Map` serializes as an object (with per-key secret redaction) and a `Set` as an array.
    - `createLoggerManagerFromLogger(logger)` now registers the logger with the manager's factory, so `manager.flush()` / `manager.close()` actually reach it and `manager.size` / `getAll()` report it. `LoggerManager.adopt(logger)` and `LoggerFactory.register(logger, name?)` are new public methods.
    - Errors are now typed where they were generic: a transport write exceeding `transportTimeout` raises `LoggerTimeoutError` (with `transportName` and `timeout`), other write failures `LoggerTransportError` with `transportName` set, formatter failures `LoggerFormatterError` with `formatterName` set, a closed `LoggerManager` `LoggerDisposedError` instead of a bare `Error`, an unknown level `InvalidLoggerLevelError`, an invalid entry timestamp `InvalidLoggerEntryError`, an unresolved string formatter id `LoggerFormatterNotFoundError`, and a write to a closed buffered transport `LoggerTransportClosedError`. Code matching on `RangeError` or on error message text from these paths needs updating.

### `@zudojs/messaging` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-messaging.md)

Minor Changes

- **@zudojs/errors**
    - New `EventListenerLimitExceededError` (`ErrorCode.EVENT_LISTENER_LIMIT_EXCEEDED`), carrying `pattern`, `count` and `limit`. It is reported as internal and is never exposed to a caller, because registering past a handler limit is a programming fault rather than bad input.

  **@zudojs/events**

    - `EventListenerLimitExceededError` can now actually be raised. Nothing in the package ever threw it before, so any `catch` branch testing for it was unreachable. Exceeding `maxHandlersPerPattern` still emits a one-shot warning by default; set the new `enforceHandlerLimit: true` on a registry (or emitter/bus options) to refuse the registration instead, which throws the error and leaves the registry exactly as it was. The class is now owned by `@zudojs/errors` and re-exported here, so existing imports keep working.
    - A bus or registry observer (`bus.subscribe`, `registry.subscribe`) that throws is no longer discarded in silence. With no `onError` hook configured, the failure is now reported once per bus or registry on Node's process warning channel as a `ZudojsEventsWarning` with code `ZUDOJS_EVENTS_OBSERVER_ERROR`, matching how the handler-leak warning is already reported. A configured `onError` hook still takes precedence and the warning is not emitted.

  **@zudojs/messaging**

    - A handler registered in object form — `{ handle(message, context) }`, which `MessageHandlerLike` has always advertised — now actually runs. Previously the dispatcher invoked the handler as a function, so every dispatch to an object handler came back as a failed dispatch with `handler.handler is not a function`. `NamedMessageHandler.handler` now accepts either form, and `this` is bound for class-based handlers.
    - `DispatchResult.handlerResults` is now a snapshot taken when the dispatch settles. A handler still running after a timeout can no longer push a `success: true` record into the result of a dispatch that already failed with `MessageTimeoutError`, so audit records and metrics derived from `handlerResults` are stable once you have awaited the dispatch.
    - The `Dispatcher` interface now declares `dispose()`, `getRegistry()` and `listMiddleware()`, all of which `DefaultDispatcher` already implemented. `createDispatcher().dispose()` compiles without a cast.

### `@zudojs/middleware` v1.0.3

[Package documentation](https://zudojs.oyinlola.site/docs/packages-middleware.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/observability` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-observability.md)

Patch Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/openapi` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-openapi.md)

Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/permissions` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-permissions.md)

Minor Changes

- Closed four places where a security decision was made from input that could not support it, and two where a revoked grant kept answering from a cache. Every change here refuses more than it did before; none of them accepts anything new.

  **@zudojs/permissions**

    - `createPermissionRegistry()` now has `subscribe(listener)`, the same change notifier `createRoleRegistry()` and `createPolicyRegistry()` already carried, and it fires on `define`, a `remove` that removed something, and `clear`. `createPermissionEngine({ expandImplied })` accepts the registry itself in place of a closure — pass `expandImplied: permissions` — and subscribes to it, so revoking an implication drops the decisions that were cached while it stood. Previously `permissions.remove("post:admin")` left every `post:delete` it had implied answering `true` for the whole cache TTL, while `skipCache: true` correctly said `false`. A bare `(permission) => permissions.expandImplied(permission)` still works, but it cannot announce a change, so an engine given one now caches no decisions rather than serving one made under a revoked implication.
    - An engine with a `roleResolver` or a `permissionResolver` no longer caches decisions by default. A resolver reads authorization state the engine does not own and cannot see change, and none of it was in the cache key, so a grant withdrawn upstream kept being served until the entry expired. To get caching back, supply the new `resolverCacheKey` — a function of the actor returning something that changes whenever the resolver's answer for that actor could change (a grants-table version, an `updatedAt` stamp). Returning `undefined` leaves that actor uncached. Engines without a resolver are unaffected.
    - The README's request-metadata example imported `requireCurrentTenant` from `@zudojs/tenancy`, which does not export it; it now uses `createContextManager({ storage: getDefaultStorage() }).requireCurrentTenant().id`, which is where the method actually lives.

  **@zudojs/security**

    - `extractClientIp` no longer reads `X-Forwarded-For` when the chain is shorter than the configured `trustProxy` count. Such a chain did not pass through the proxies whose entries make it trustworthy, and the index clamp landed on the entry the client wrote — so with `trustProxy: 2` a request arriving at an inner hop with `X-Forwarded-For: 1.2.3.4` was rate-limited as `1.2.3.4`, and rotating that value gave the caller a fresh bucket each time. Short chains now fall through to `x-real-ip` and then `remoteAddress`. Chains at or above the configured length behave exactly as before.
    - `createCsrfProtection` and `requiresCsrfProtection` reject a `methods` list that is empty, not an array, or contains a blank entry, with `ConfigurationError`. `methods: []` used to turn CSRF off for every request in silence, which is what `process.env.CSRF_METHODS?.split(",").filter(Boolean) ?? []` produces when the variable is unset. Omit `methods` for the defaults.
    - `containsTraversal` and `validateRequestTarget` strip RFC 3986 path parameters before segmenting, so `/a/..;/b` is reported as traversal like every other spelling of it. Tomcat, Jetty and several reverse-proxy pairings resolve it to `/a/../b`. `....//` is still not a traversal, and nothing that was already caught has changed.
    - `sanitizeObject` rejects a `maxDepth` that is not an integer of 1 or more with `ConfigurationError`. `maxDepth: 0` discarded the argument itself and returned `undefined` under a non-optional `T`.

  **@zudojs/crypto**

    - A provider's declared `capabilities` are now consulted before every operation. A provider declaring `signing: false` had `sign` called anyway; it now throws a `CryptoError` naming the capability and the operation. `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and `passwordHashing` are all checked, including through `verifyPassword`, which raises rather than reporting a missing capability as a wrong password. A provider that declares every capability it implements is unaffected.
    - `setDefaultCryptoProvider` checks that all twelve provider methods are functions and that every capability flag is a boolean, so installing a partial object fails at the call that installs it instead of throwing a `TypeError` from inside whichever operation reached the missing method first. A rejected provider is not installed.
    - New exports: `assertProviderCapability`, `assertCryptoProvider`, `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability`, `assertPasswordHashingCapability` and `CRYPTO_PROVIDER_METHODS`, for anyone writing their own provider or wrapper.

### `@zudojs/plugins` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-plugins.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/queue` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-queue.md)

Minor Changes

- **@zudojs/queue**
    - **Security.** `zudo:context` is now owned by the queue on every enqueue path. Job metadata handed to `queue.add()` can no longer carry a context record of its own: whatever the caller put under that key is dropped before the job is stored, whether or not a context carrier captured anything. Previously, an `add()` made with no ambient context kept the caller's record verbatim and the queue replayed it around the middleware and the processor, so an enqueuer could choose the tenant, correlation id or trace the job ran under. Legitimately captured context is unaffected.
    - `runJob` no longer leaks an `abort` listener per job on a consumer's signal. A worker passes one long-lived signal to every job it dispatches, so a long-running worker accumulated one listener — and one retained per-job `AbortController` — for every job it had ever processed.
    - The default in-memory dead letter store is bounded. It retains the most recent 1000 dead-lettered jobs and evicts the oldest beyond that; `createInMemoryDeadLetterStore({ maxEntries })` sets a different cap, and `Number.POSITIVE_INFINITY` restores the previous unbounded behaviour. A store the queue created for itself is also cleared by `close()`; one you passed in as `deadLetterStore` is left alone, as before.
    - A throwing queue event listener now reaches the configured logger. The emitter accepts a `logger` of its own (`createInMemoryQueueEventEmitter({ logger })`), and a queue created with `logger` hands it to the emitter it was given, so the failure goes to `logger.error` instead of always falling back to `process.emitWarning`.
    - The four events that `QueueEventMap` declared but nothing emitted now fire. `worker:started`, `worker:stopped` and `worker:error` are published by `createWorker` on the queue's emitter, reachable through the new optional `Queue.events`. `job:cancelled` is emitted when a running job is aborted from outside — a draining worker, `close()`, a consumer's signal — and not for a job that merely timed out.

  **@zudojs/scheduler**

    - `handle.cancel()` aborts a running one-shot (`after()` / `at()`), as the README says and as a recurring schedule already did. In-flight executions are now tracked by schedule id, so a cancel arriving after the schedule was retired at dispatch time still reaches the run.
    - Cron day-of-week ranges that span Sunday are parsed correctly. `0-7`, `1-7` and `mon-sun` all mean every day; previously `0-7` was accepted and quietly fired once a week, and `1-7` and `mon-sun` were rejected as inverted ranges. `fri-sun` and `sat-sun` work for the same reason. A bare `7` is still Sunday, and a genuinely inverted range such as `5-2` is still an error.
    - A schedule whose job has been unregistered is retired and reported through `onError` with a `SchedulerJobNotFoundError`, instead of re-arming its timer forever while dispatching nothing and still reporting itself as active.
    - `handle.resume()` on a schedule that is already active is a no-op. It used to recompute the next fire time from now, so a supervisor calling it idempotently could postpone an hourly job indefinitely. Resuming a paused schedule is unchanged.

### `@zudojs/rpc` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-rpc.md)

Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/runtime` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-runtime.md)

Patch Changes

- **@zudojs/lifecycle**
    - `priority` is now a real ordering barrier instead of a hint. Components registered at one priority all complete a phase before the next priority starts, so `register(metrics, { priority: 100 })` genuinely starts before `register(server, { priority: 0 })`. Previously the whole dependency level was launched concurrently (up to `concurrency`, default 10) and the sorted order was observable only at `concurrency: 1`, so whichever hook happened to finish first won. Components sharing a priority still run together, so the default configuration — every component at priority 0 — is unchanged. Shutdown now mirrors startup within a level: the lowest priority stops first, the highest last. The same reversal applies to the exported `reverseTopologicalSort`, which now reverses each stage's contents as well as the stage list.
    - `shutdown()` no longer disposes a component whose `stop()` is still running. A `stop()` hook that blows its own component `timeout` is abandoned rather than cancelled; shutdown only waited for such hooks *before* the stop phase, so one abandoned during it had `dispose()` run on top of it while `shutdown()` resolved and reported the application DISPOSED. Each shutdown phase now waits for abandoned hooks to settle before the next one begins, still bounded by the global `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer cut a drain short.
    - Registry and abort failures (`Cannot register components after registry is frozen`, `Component "x" is already registered`, an unregistered `dependsOn` target, and a cancelled `withAbort`) now throw `LifecycleError` from `@zudojs/errors` rather than a bare `Error`, so they carry an `ErrorCode` and answer `instanceof LifecycleError`. Messages are unchanged.

  **@zudojs/container**

    - `clearRegistrations()` and `restoreSnapshot()` now invalidate live scopes. Both already evicted and disposed cached singletons, but scopes were never told, so a scope went on serving the SCOPED instance built from a registration that had just been discarded — for the rest of its life, and without ever disposing it. A test harness that snapshotted, installed a SCOPED fake and then restored kept the fake. Every token that was cached when the registry is cleared or restored is now reported as invalidated, so live scopes drop and dispose their copies and the next `resolve()` rebuilds from the current registration.
    - `Container "x" has already been disposed`, `Registrations for container "x" are frozen`, `Container scopes are disabled`, the three disposed-scope guards, an unregistered `useExisting` target and an unsupported provider now throw `ContainerError` / `ContainerLifecycleError` from `@zudojs/errors` rather than a bare `Error`. Messages are unchanged.

  **@zudojs/runtime**

    - `LifecycleManager` with `continueOnFailure: true` no longer initializes or readies a module whose declared dependency failed. It previously consulted only the failure count, so `api` with `dependencies: ["db"]` had both `onInitialize` and `onReady` invoked — and appeared in `start().succeeded` — after `db` failed to come up. Such a module is now skipped, reported in `initialize().failed` with the blocking dependency named, and the skip cascades to its own dependents. Modules independent of the failure still continue, and `continueOnFailure: false` (the default, and what `createRuntime()` uses) is unaffected.
    - Runtime option validation and `RuntimeRegistry.register()` / `require()` now throw `RuntimeError` / `RuntimeStateError` rather than a bare `Error`. Messages are unchanged.

### `@zudojs/scheduler` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-scheduler.md)

Patch Changes

- **@zudojs/queue**
    - **Security.** `zudo:context` is now owned by the queue on every enqueue path. Job metadata handed to `queue.add()` can no longer carry a context record of its own: whatever the caller put under that key is dropped before the job is stored, whether or not a context carrier captured anything. Previously, an `add()` made with no ambient context kept the caller's record verbatim and the queue replayed it around the middleware and the processor, so an enqueuer could choose the tenant, correlation id or trace the job ran under. Legitimately captured context is unaffected.
    - `runJob` no longer leaks an `abort` listener per job on a consumer's signal. A worker passes one long-lived signal to every job it dispatches, so a long-running worker accumulated one listener — and one retained per-job `AbortController` — for every job it had ever processed.
    - The default in-memory dead letter store is bounded. It retains the most recent 1000 dead-lettered jobs and evicts the oldest beyond that; `createInMemoryDeadLetterStore({ maxEntries })` sets a different cap, and `Number.POSITIVE_INFINITY` restores the previous unbounded behaviour. A store the queue created for itself is also cleared by `close()`; one you passed in as `deadLetterStore` is left alone, as before.
    - A throwing queue event listener now reaches the configured logger. The emitter accepts a `logger` of its own (`createInMemoryQueueEventEmitter({ logger })`), and a queue created with `logger` hands it to the emitter it was given, so the failure goes to `logger.error` instead of always falling back to `process.emitWarning`.
    - The four events that `QueueEventMap` declared but nothing emitted now fire. `worker:started`, `worker:stopped` and `worker:error` are published by `createWorker` on the queue's emitter, reachable through the new optional `Queue.events`. `job:cancelled` is emitted when a running job is aborted from outside — a draining worker, `close()`, a consumer's signal — and not for a job that merely timed out.

  **@zudojs/scheduler**

    - `handle.cancel()` aborts a running one-shot (`after()` / `at()`), as the README says and as a recurring schedule already did. In-flight executions are now tracked by schedule id, so a cancel arriving after the schedule was retired at dispatch time still reaches the run.
    - Cron day-of-week ranges that span Sunday are parsed correctly. `0-7`, `1-7` and `mon-sun` all mean every day; previously `0-7` was accepted and quietly fired once a week, and `1-7` and `mon-sun` were rejected as inverted ranges. `fri-sun` and `sat-sun` work for the same reason. A bare `7` is still Sunday, and a genuinely inverted range such as `5-2` is still an error.
    - A schedule whose job has been unregistered is retired and reported through `onError` with a `SchedulerJobNotFoundError`, instead of re-arming its timer forever while dispatching nothing and still reporting itself as active.
    - `handle.resume()` on a schedule that is already active is a no-op. It used to recompute the next fire time from now, so a supervisor calling it idempotently could postpone an hourly job indefinitely. Resuming a paused schedule is unchanged.

### `@zudojs/schema` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-schema.md)

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/security` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-security.md)

Minor Changes

- Closed four places where a security decision was made from input that could not support it, and two where a revoked grant kept answering from a cache. Every change here refuses more than it did before; none of them accepts anything new.

  **@zudojs/permissions**

    - `createPermissionRegistry()` now has `subscribe(listener)`, the same change notifier `createRoleRegistry()` and `createPolicyRegistry()` already carried, and it fires on `define`, a `remove` that removed something, and `clear`. `createPermissionEngine({ expandImplied })` accepts the registry itself in place of a closure — pass `expandImplied: permissions` — and subscribes to it, so revoking an implication drops the decisions that were cached while it stood. Previously `permissions.remove("post:admin")` left every `post:delete` it had implied answering `true` for the whole cache TTL, while `skipCache: true` correctly said `false`. A bare `(permission) => permissions.expandImplied(permission)` still works, but it cannot announce a change, so an engine given one now caches no decisions rather than serving one made under a revoked implication.
    - An engine with a `roleResolver` or a `permissionResolver` no longer caches decisions by default. A resolver reads authorization state the engine does not own and cannot see change, and none of it was in the cache key, so a grant withdrawn upstream kept being served until the entry expired. To get caching back, supply the new `resolverCacheKey` — a function of the actor returning something that changes whenever the resolver's answer for that actor could change (a grants-table version, an `updatedAt` stamp). Returning `undefined` leaves that actor uncached. Engines without a resolver are unaffected.
    - The README's request-metadata example imported `requireCurrentTenant` from `@zudojs/tenancy`, which does not export it; it now uses `createContextManager({ storage: getDefaultStorage() }).requireCurrentTenant().id`, which is where the method actually lives.

  **@zudojs/security**

    - `extractClientIp` no longer reads `X-Forwarded-For` when the chain is shorter than the configured `trustProxy` count. Such a chain did not pass through the proxies whose entries make it trustworthy, and the index clamp landed on the entry the client wrote — so with `trustProxy: 2` a request arriving at an inner hop with `X-Forwarded-For: 1.2.3.4` was rate-limited as `1.2.3.4`, and rotating that value gave the caller a fresh bucket each time. Short chains now fall through to `x-real-ip` and then `remoteAddress`. Chains at or above the configured length behave exactly as before.
    - `createCsrfProtection` and `requiresCsrfProtection` reject a `methods` list that is empty, not an array, or contains a blank entry, with `ConfigurationError`. `methods: []` used to turn CSRF off for every request in silence, which is what `process.env.CSRF_METHODS?.split(",").filter(Boolean) ?? []` produces when the variable is unset. Omit `methods` for the defaults.
    - `containsTraversal` and `validateRequestTarget` strip RFC 3986 path parameters before segmenting, so `/a/..;/b` is reported as traversal like every other spelling of it. Tomcat, Jetty and several reverse-proxy pairings resolve it to `/a/../b`. `....//` is still not a traversal, and nothing that was already caught has changed.
    - `sanitizeObject` rejects a `maxDepth` that is not an integer of 1 or more with `ConfigurationError`. `maxDepth: 0` discarded the argument itself and returned `undefined` under a non-optional `T`.

  **@zudojs/crypto**

    - A provider's declared `capabilities` are now consulted before every operation. A provider declaring `signing: false` had `sign` called anyway; it now throws a `CryptoError` naming the capability and the operation. `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and `passwordHashing` are all checked, including through `verifyPassword`, which raises rather than reporting a missing capability as a wrong password. A provider that declares every capability it implements is unaffected.
    - `setDefaultCryptoProvider` checks that all twelve provider methods are functions and that every capability flag is a boolean, so installing a partial object fails at the call that installs it instead of throwing a `TypeError` from inside whichever operation reached the missing method first. A rejected provider is not installed.
    - New exports: `assertProviderCapability`, `assertCryptoProvider`, `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability`, `assertPasswordHashingCapability` and `CRYPTO_PROVIDER_METHODS`, for anyone writing their own provider or wrapper.

### `@zudojs/serialization` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-serialization.md)

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/storage` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-storage.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/types@1.1.1`, `@zudojs/serialization@1.1.1`, `@zudojs/constants@1.1.1`.

### `@zudojs/tenancy` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-tenancy.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/testing` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-testing.md)

Patch Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.
    - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
    - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
    - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
    - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
    - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
    - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
    - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
    - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
    - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

### `@zudojs/transactions` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-transactions.md)

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/types` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-types.md)

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/validation` v1.0.3

[Package documentation](https://zudojs.oyinlola.site/docs/packages-validation.md)

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.
