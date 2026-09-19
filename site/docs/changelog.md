---
title: "Changelog"
description: "What changed in each Zudo release: per-package release notes generated from the packages' own changelogs, newest first."
source: https://zudojs.oyinlola.site/docs/changelog
---

September 2026

# Changelog

What changed in each release, package by package. These notes are generated from the packages’ own `CHANGELOG.md` files, so they describe what shipped, not what was planned.

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
| `@zudojs/adapters` | `1.1.0` | [Jump to notes](#pkg-adapters) |
| `@zudojs/api` | `1.1.0` | [Jump to notes](#pkg-api) |
| `@zudojs/auth` | `1.2.0` | [Jump to notes](#pkg-auth) |
| `@zudojs/auth-oauth` | `1.2.0` | [Jump to notes](#pkg-auth-oauth) |
| `@zudojs/cache` | `1.1.0` | [Jump to notes](#pkg-cache) |
| `zudojs-cli` | `1.2.0` | [Jump to notes](#pkg-cli) |
| `@zudojs/config` | `1.1.0` | [Jump to notes](#pkg-config) |
| `@zudojs/constants` | `1.1.0` | [Jump to notes](#pkg-constants) |
| `@zudojs/container` | `1.1.1` | [Jump to notes](#pkg-container) |
| `@zudojs/core` | `1.2.0` | [Jump to notes](#pkg-core) |
| `@zudojs/cqrs` | `1.1.0` | [Jump to notes](#pkg-cqrs) |
| `@zudojs/crypto` | `1.2.0` | [Jump to notes](#pkg-crypto) |
| `@zudojs/database` | `1.2.0` | [Jump to notes](#pkg-database) |
| `@zudojs/docs` | `1.0.2` | [Jump to notes](#pkg-docs) |
| `@zudojs/errors` | `1.1.0` | [Jump to notes](#pkg-errors) |
| `@zudojs/events` | `1.1.0` | [Jump to notes](#pkg-events) |
| `@zudojs/feature-flags` | `1.2.0` | [Jump to notes](#pkg-feature-flags) |
| `@zudojs/http` | `1.2.0` | [Jump to notes](#pkg-http) |
| `@zudojs/lifecycle` | `1.1.1` | [Jump to notes](#pkg-lifecycle) |
| `@zudojs/logger` | `1.2.0` | [Jump to notes](#pkg-logger) |
| `@zudojs/messaging` | `1.0.2` | [Jump to notes](#pkg-messaging) |
| `@zudojs/middleware` | `1.0.2` | [Jump to notes](#pkg-middleware) |
| `@zudojs/observability` | `1.1.0` | [Jump to notes](#pkg-observability) |
| `@zudojs/openapi` | `1.3.0` | [Jump to notes](#pkg-openapi) |
| `@zudojs/permissions` | `1.2.0` | [Jump to notes](#pkg-permissions) |
| `@zudojs/plugins` | `1.2.0` | [Jump to notes](#pkg-plugins) |
| `@zudojs/queue` | `1.2.0` | [Jump to notes](#pkg-queue) |
| `@zudojs/rpc` | `1.2.0` | [Jump to notes](#pkg-rpc) |
| `@zudojs/runtime` | `1.2.0` | [Jump to notes](#pkg-runtime) |
| `@zudojs/scheduler` | `1.1.1` | [Jump to notes](#pkg-scheduler) |
| `@zudojs/schema` | `1.1.0` | [Jump to notes](#pkg-schema) |
| `@zudojs/security` | `1.1.0` | [Jump to notes](#pkg-security) |
| `@zudojs/serialization` | `1.1.0` | [Jump to notes](#pkg-serialization) |
| `@zudojs/storage` | `1.1.1` | [Jump to notes](#pkg-storage) |
| `@zudojs/tenancy` | `1.2.0` | [Jump to notes](#pkg-tenancy) |
| `@zudojs/testing` | `1.1.1` | [Jump to notes](#pkg-testing) |
| `@zudojs/transactions` | `1.1.1` | [Jump to notes](#pkg-transactions) |
| `@zudojs/types` | `1.1.0` | [Jump to notes](#pkg-types) |
| `@zudojs/validation` | `1.0.2` | [Jump to notes](#pkg-validation) |

### `@zudojs/adapters` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-adapters.md)

Minor Changes

- Round 10 audit fixes (tooling/ADP-01).
    - New `AdapterRegistry.healthAll(options?)`: runs `health()` on every adapter that implements it and returns an `AdapterHealthReport` (`status` is the worst per-adapter status). Checks that throw, reject, exceed `options.timeout` or are aborted via `options.signal` are reported as `"unhealthy"` instead of thrown.
    - New `AdapterRegistry.configure(name, options)`: forwards to the adapter's `configure()` hook; throws `AdapterConfigurationError` if it has none.
    - `createMockAdapter` accepts `Partial<LifecycleAdapter>` and keeps `health` and `configure`.

### `@zudojs/api` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-api.md)

Minor Changes

- Round 10 fixes.
    - **edge/API-01 (security, fail-closed):** `APIExecutor` now validates `input` / `output` against `@zudojs/schema` schemas (and any schema with a `safeParse` method returning `{ success, data | issues }`, including Zod-style `error.issues`), in addition to Standard Schema. Previously a `@zudojs/schema` schema was silently skipped: invalid input reached the handler and output was neither checked nor stripped.
    - Behaviour change: a declared `input` / `output` that is neither a Standard Schema nor a `safeParse` schema is no longer treated as documentation. `defineOperation` and `APIOperationRegistry.register` throw a `TypeError`, and the executor answers a hand-rolled operation carrying one with an `APIInternalError` (500) without running the handler. A schema result in an unrecognised shape also fails closed (500).
    - New export: `isAPISchema(value)` and the `APISchemaIssue` / `APISchemaResult` types.

### `@zudojs/auth` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth.md)

Minor Changes

- Round 10 security fixes:
    - AUTH-01: `refreshAccessToken` / `jwt.refreshAccessToken` now carry the refresh token's `sid` into the new pair, so the result still dies with `logout()` / `logoutAll()`. **Behaviour change:** `createAuthService().verifyToken()` and `.refresh()` now reject tokens with no `sid` (`TokenInvalidError: Token is not bound to a session`). Set the new opt-in `allowSessionlessTokens: true` to accept tokens minted with the standalone `createTokenPair()`.
    - AUTH-02: login lockout is no longer check-then-act. A failure is reserved before the password is verified and cleared on success, so a parallel burst gets `maxFailedAttempts` guesses per lockout instead of `maxAttemptsPerWindow`. Concurrent attempts past the limit get `AccountLockedError` without their password being checked. An attempt that throws for another reason keeps its reservation.
    - AUTH-03: `createMemoryLoginAttemptStore` accepts `failureTtlSeconds` (default 900) and `maxEntries` (default 100 000). An unlocked failure streak is forgotten after that much inactivity and its entry is evicted, and at the cap the oldest unlocked entry goes first. Spraying identifiers can no longer grow the store without bound.
    - AUTH-04: the JWT signature segment is compared as the canonical base64url string, so a token has exactly one accepted spelling (no trailing-bit variants, no appended junk).
    - AUTH-05: `maxAttemptsPerWindow` is documented as a per-identifier budget, with a recommendation to put a per-IP limiter in front of `login()`.
    - CRYPTO-01: new password hashes use scrypt N=2^14, r=8, p=5 (OWASP). Existing `scrypt$16384$8$1$…` hashes and the param-less legacy format still verify, and `needsRehash()` now returns `true` for them.
    - XPKG-01 (partial): the local `generateCsrfToken` is marked `@deprecated` in favour of `@zudojs/security`. Delegating hashing to `@zudojs/crypto` waits on adding the dependency.

  Round 10 phase 2:

    - XPKG-01: `hashPassword` delegates to `@zudojs/crypto` and returns its `v1$scrypt$16384$8$5$<salt>.<hash>` format (32-byte salt, 64-byte key). `verifyPassword` sends `v1$…` hashes to `@zudojs/crypto` and keeps a legacy verifier for `scrypt$N$r$p$…` and the param-less `scrypt<salt>$…` format, so every stored hash still verifies. `needsRehash()` returns `true` for every hash that is not a current-parameter crypto scrypt hash (all legacy hashes, PBKDF2, other salt/key sizes). The unknown-user dummy hash is a crypto-format hash. Session ids come from `@zudojs/crypto` `randomHex`. **Behaviour change:** new hash strings start with `v1$scrypt$`, and `hashPassword("")` now throws `AuthError` (`INVALID_INPUT`). `generateRandomToken`, `generateTokenId` and the deprecated `generateCsrfToken` stay on `node:crypto` because they are synchronous and every `@zudojs/crypto` random helper is async.
    - CONV-02: `AuthError` and `AuthErrorOptions` are now re-exported from `@zudojs/errors`; every auth error subclass extends the shared class.

### `@zudojs/auth-oauth` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md)

Minor Changes

- Round 10 security fix:
    - SEC-06: the SSRF guard on server-fetched endpoints judges IPv6 literals that embed an IPv4 address as that IPv4 address. This covers IPv4-compatible `[::127.0.0.1]` (serialised as `[::7f00:1]`), mapped, translated `[::ffff:0:a9fe:a9fe]`, NAT64 `[64:ff9b::169.254.169.254]` and 6to4 `2002::/16`. It also refuses the local-use NAT64 prefix `64:ff9b:1::/48` and fails closed on an unparseable literal.

  Round 10 phase 2:

    - SEC-06: the SSRF guard imports `expandIpv6` / `embeddedIpv4` / `isNonPublicIpv6Range` from `@zudojs/security`; the mirrored `oauthIpv6.guard.ts` is deleted. No behaviour change.
    - CONV-02: `OAuthError` now extends the shared `OAuthError` from `@zudojs/errors` (a `BaseError`) instead of `Error`. Names, codes, `statusCode` and `expose` defaults are unchanged. **Behaviour change:** OAuth errors gain `category` (`authentication`), `severity`, `isOperational`, `metadata`, `toJSON()` and `toLogObject()`, and `JSON.stringify(err)` now emits the structured BaseError shape. The package now depends on `@zudojs/errors` and `@zudojs/security`.

### `@zudojs/cache` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cache.md)

Minor Changes

- Round 10 fixes:
    - data/SER-02: `JsonCacheSerializer` no longer deserializes in `strict` mode, so a cached value carrying its own `$type` field (a domain discriminator) reads back unchanged instead of making every `get` throw. With the `@zudojs/serialization` escaping from this round, values whose `$type` collides with a built-in tag (`"Date"`, `"Map"`) round-trip too. The stale comment claiming the serializer ignored `allowUnsafeKeys` is gone. `stripUnsafeKeys` now runs only on the `preserveTypes: false` path; the type-preserving path relies on the serializer's own filtering.
    - INF-07: new opt-in `CacheConfig.tagStore` accepts any `CacheTagStore`, so replicas sharing one adapter can share tag mappings and `invalidateByTag` reaches entries written by other instances. `CacheTagStore.removeKey`/`clear` may now return a promise and are awaited, and a new optional `trackedKeys()` lets pattern clears drop stale mappings. An injected store is never flushed by `disconnect()`.
    - INF-08: an empty-string namespace is rejected with `CACHE_INVALID_KEY`, both in the config (`CacheService`, `DefaultKeyBuilder`) and per call (keys, patterns, tags, locks). It used to become "no namespace" and fall into the shared global keyspace.
    - INF-12: when a lock's `release()` throws after the critical section already failed, the critical section's error is rethrown and the release error is attached to it as a non-enumerable `suppressed` property. It used to be replaced by the release error.

  Behaviour changes: `namespace: ""` now throws. Values with a `$type` field are readable.

    - **infra/SER-02 residual (phase 2):** `stripUnsafeKeys` (and so `JsonCacheSerializer` with `preserveTypes: false`) uses `SCHEMA_FORBIDDEN_KEYS` from `@zudojs/constants` instead of a local copy of the list. Same three keys; no behaviour change.

### `zudojs-cli` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cli.md)

Minor Changes

- Round 10 audit fixes.
    - Generated `src/server.ts` now serves HTTP with `@zudojs/http` on `PORT` (default 3000, per-service ports for microservices), answers `GET /health` (the monolith's `HealthController` is wired to it), and stops the HTTP server and runtime on SIGINT/SIGTERM. It used to exit with 0 after `runtime.start()` (tooling/CLI-01).
    - Fullstack + microservice: the gateway and services are written at `apps/gateway` and `apps/services/*` (inside the root workspace, which now lists `apps/services/*`), the root compose builds them with their own Dockerfiles and includes the gateway, and CORS config goes to the gateway (tooling/CLI-02).
    - `zudojs generate` refuses to overwrite existing files it would change and lists them; new `--force` flag overwrites. Barrel appends are still allowed (tooling/CLI-03).
    - `--database mysql|sqlite` now sets the matching `DATABASE_URL` (via the database adapters, whose `getEnvironmentVariables(dbName?)` takes the project name); `mongodb` is rejected (tooling/CLI-04).
    - The fullstack root Dockerfile builds and runs `apps/api` (`InfrastructureOptions.appDirectory`) instead of copying a non-existent `/app/dist` (tooling/CLI-05).
    - `zudojs generate module` emits a `BaseModule` subclass, exports it from the modules barrel and registers it in `app.ts` (microservice modules go to `<app>/src/modules`) (tooling/CLI-06).
    - An unparsable frontend package.json fails the scaffold instead of being replaced; unpinned frontend dependencies get caret ranges instead of `"latest"` (tooling/CLI-07).
    - `zudojs add constructor`/`__proto__` reports "Unknown feature" instead of crashing (tooling/CLI-08).
    - `--language javascript` is rejected for backend projects and warned about for fullstack (frontend only) (tooling/CLI-09).
    - tooling/CONV-01 (phase 2): `CLIValidationError`, `CLIGenerationError`, `CLINotInProjectError` and `CLITemplateError` now live in `@zudojs/errors`; `zudojs-cli` re-exports the same classes (same constructors and behaviour). Requires the matching `@zudojs/errors` release.
    - LEAF-16 (phase 2, behaviour change in generated apps): the generated `src/app.ts` resolves `NODE_ENV` with `resolveEnvironment()` from `@zudojs/constants` instead of an exact-match list, so `prod`/`Production` run as production and an unknown value warns once.

### `@zudojs/config` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-config.md)

Minor Changes

- Round 10 fixes.
    - **data/CONFIG-01 (security):** `validate()` honours `secret: true` at any depth — inside nested object schemas, array items, and dotted keys such as `"db.password"` when the source supplied a nested `db` object. The store entry holding the secret is marked sensitive (the whole entry is redacted by `toSafeObject()`).
    - **data/CONFIG-02 (security):** every source, not only the environment source, now has keys and values screened: a key naming a password, secret, token, API/private key, credential, DSN, database URL or `*_key` (any segment, case-insensitive), a nested object containing such a key, or a URL with embedded `user:password@` is marked sensitive. New exports `isSensitiveConfigKey`, `isSensitiveConfigValue`, `isSensitiveConfigEntry`. Behaviour change: more values are redacted by `toSafeObject()`, and an environment source's `isSensitive: () => false` no longer disables this screening.
    - **data/CONFIG-03:** `reload()` on a layered store (the manager's default) rebuilds source-provided values from scratch in a staging store and commits them only once every source has loaded. A value a higher-priority source stopped providing is dropped, runtime and initial values are kept, a failing source leaves the previous configuration intact, and previously sensitive entries stay sensitive.
    - **data/CONFIG-04:** `toConfigJsonValue` / `configValueToString` define keys instead of assigning them, so an own `__proto__` key stays an own key and never replaces the result's prototype.
    - **data/CONFIG-06:** `parseConfigNumber` and the typed `number()` getters accept decimal notation only; `"0x1F90"`, `"0b11"` and `"0o17"` are rejected.
    - **data/CONFIG-05 (phase 2):** `isUnsafeConfigKey` now checks `SCHEMA_FORBIDDEN_KEYS` from `@zudojs/constants` (same three keys), so config no longer keeps its own copy of the list. The package still has no internal caller, by design: every key write goes through `defineConfigProperty`, which keeps `__proto__`/`constructor`/`prototype` as inert own properties (the round-8 CONFIG-01 policy). A new regression test fails if any source file assigns keys with `target[key] =`, `Object.assign` or `Reflect.set`.

### `@zudojs/constants` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-constants.md)

Minor Changes

- Round 10 fixes:
    - X-05 (behaviour change): `createTenantId` validates now. It NFKC-normalizes, trims and lowercases, then enforces `[a-z0-9][a-z0-9_-]*` and 64 characters (the `@zudojs/tenancy` rule), and throws `InvalidConstantError` otherwise. New exports: `TENANT_ID_PATTERN` and `MAX_TENANT_ID_LENGTH`.
    - LEAF-04 (behaviour change): `ValidationPattern.EMAIL` (and so `createEmailAddress` and `SCHEMA_STRING_FORMATS.EMAIL`) accepts the same set as `isEmail` in `@zudojs/types`. It now accepts `o'brien@example.com`, `user@host.123` and `a@b.c`, still rejects `..`, and has the 254-character bound built in.
    - LEAF-05 (type-level change): `Random` is branded. `createMockRandom` returns the new `MockRandom` type (`deterministic: true`), which is not assignable to `Random`. `RandomSource` holds the shared methods.
    - LEAF-06: `createTimestamp` rejects dates and times that do not exist (`2024-02-30`, `24:00`, minute 60, offset hour 24).
    - LEAF-12 (behaviour change): the immutable sets (`SCHEMA_FORBIDDEN_KEYS`, `HTTP_METHODS`, ...) keep their values in private storage, so `Set.prototype.clear.call(set)` throws. They implement `ReadonlySet` but are no longer `Set` instances.
    - CV-02: `InvalidConstantError` and `ConstantContextError` are now owned by `@zudojs/errors` and re-exported here.
    - SER-03 (phase 2, new API): `SerializationLimits.MAX_BIGINT_DIGITS` (4096), the shared bound on decimal digits accepted when decoding or coercing a BigInt from text. `@zudojs/serialization` and `@zudojs/schema` use it.

### `@zudojs/container` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-container.md)

Patch Changes

- Round 10 fixes.
    - **CONT-01:** `replace()` and `remove()` now cascade. Every cached singleton built on the replaced token, directly or through a transient, is evicted and disposed. Live scopes also drop and dispose their cached `SCOPED` copies of the token and its consumers. Previously consumers kept serving the old, disposed instance.
    - **CONT-02:** Values registered with `registerValue()` or `{ useValue }` belong to the host and are no longer disposed by the container.
    - Behaviour changes: replacing a dependency now rebuilds its consumers (and disposes the old ones); `registerValue()` instances are never disposed; use a factory if the container should own disposal.

### `@zudojs/core` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-core.md)

Minor Changes

- Round 10 fixes.
    - **CORE-01 (security):** `Container` rejects captive dependencies. When a singleton's construction resolves a `"scoped"` provider, directly or through a transient, the container throws a `DependencyResolutionError` ("Captive dependency: …"). Previously the singleton captured one request's instance and served it to every later request. Resolving a `"scoped"` provider with no active scope now throws, where it used to behave as transient. This matches `@zudojs/container`.
    - **CORE-02:** A bootstrap that hits `startup.timeoutMs` starts no further phase or module hook. `ModuleLifecyclePhaseOptions` gains `signal`. The runtime queues a teardown right away, so a module that comes up late is stopped and destroyed, and `stop()` waits for that teardown.
    - **CORE-03:** An `uncaughtException` or `unhandledRejection` now ends in `exit(1)` after the runtime stops. New `signals.exitOnFatalError` (default true) and `signals.fatalExitTimeout` (default 10000 ms, bounds a hanging shutdown).
    - **CORE-04 (security):** `ContextStorage.run(ctx)` no longer inherits the enclosing execution's `ContextValues` unless it re-enters the current context. `runDerived` still inherits them.
    - **CORE-05:** A failed `Lifecycle.start()` rolls back (stops) the participants that had started. `dispose()` only reaches participants whose `initialize()` ran.
    - **X-01:** `signals.forceExitOnSecondSignal` now defaults to `true`, matching `@zudojs/runtime` and `@zudojs/lifecycle`.
    - Behaviour changes: the captive and no-scope scoped resolutions now throw; the process exits 1 after a fatal error (opt out with `exitOnFatalError: false`); a second signal force-exits (opt out with `forceExitOnSecondSignal: false`); a failed start rolls back, so a retry restarts from the first participant; `dispose()` skips participants that were never initialized.
    - LEAF-16 (phase 2, behaviour change): when `RuntimeOptions.mode` is omitted, the runtime mode is derived from `NODE_ENV` (or `environment.variables.NODE_ENV`) through `resolveEnvironment()` from `@zudojs/constants` instead of always being `"development"`. `prod`/`Production` give `"production"`, `staging` runs as `"production"`, `test` gives `"test"`, unset stays `"development"`. An explicit `mode` still wins.
    - CV-05 (phase 2): the "provider does not implement setConfiguration()" notice is a `process.emitWarning` (type `ZudojsCoreWarning`, code `ZUDOJS_CONFIG_PROVIDER_NO_SET`) instead of `console.warn`.

### `@zudojs/cqrs` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cqrs.md)

Minor Changes

- Round 10 fixes:
    - CQRS-01: `timingMiddleware`'s `onTiming` observer is isolated. If it throws or rejects, a successful command or query stays successful and a failing one keeps its own error. Previously the observer's error replaced the outcome. New opt-in option `onTimingError(error, timing)` receives observer failures; a non-function value throws `InvalidMiddlewareError`.
    - CONV-01 / H4 (phase 2): `CqrsError` is now the `@zudojs/errors` class, re-exported (same defaults). Every CQRS subclass extends it, so `instanceof CqrsError` matches across both import paths.
    - MSG-02 (phase 2): `composeMiddleware` (and therefore the command and query bus pipelines) is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged: `next(request, context)` still replaces the request and context, a second `next()` still rejects with `MiddlewareExecutionError`, and there is no depth ceiling. It moved to `cqrsMiddleware/cqrsMiddleware.compose.ts` and is still exported from the package root.

### `@zudojs/crypto` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-crypto.md)

Minor Changes

- Round 10 security fixes:
    - CRYPTO-01: new scrypt password hashes default to N=2^14, r=8, p=5 (the OWASP row for N=2^14; p=1 is only adequate at N=2^17). `hashPassword` and the node provider's `hashPassword` refuse a cost below the new `PASSWORD_HASH.SCRYPT.MIN_COST` (16 384) and throw `RangeError`. Previously `cost: 2` was accepted. Stored hashes with a smaller cost still verify. The new constant `PASSWORD_HASH.SCRYPT.PASSWORD_PARALLELIZATION` (5) is the password default. `PASSWORD_HASH.SCRYPT.PARALLELIZATION` stays 1, so keys from `deriveScrypt` do not change. The comment that claimed p=1 was OWASP-compliant has been corrected.
    - New helper `assertNewHashCost`.

### `@zudojs/database` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-database.md)

Minor Changes

- Round 10 fixes:
    - INF-13: `withTransactionRetry` clamps its exponential backoff to a new `maxRetryDelayMs` option (default 30000 ms, never above the 2^31-1 ms timer limit) and accepts `jitter: "full"`. Large retry budgets used to overflow `setTimeout` into 1 ms retries.

  Behaviour changes: a single retry delay never exceeds 30 s unless `maxRetryDelayMs` is raised.

    - **infra/INF-18 (phase 2, behaviour change):** the fallback logger used when `DatabaseClient` gets no `logger` option now writes through `@zudojs/logger` (logger name `@zudojs/database`, console transport) instead of calling `console.*` directly. Entries are structured and secret-named metadata fields (`password`, `token`, ...) are redacted. `debug`/`info` are still dropped when `NODE_ENV` is `"production"`; an `Error` passed to `error()` becomes the entry's `error`, any other value is kept as `metadata.error`.
    - **infra/LEAF-08 (phase 2):** `toPrismaWhere` uses `isPlainObject` from `@zudojs/types` instead of a local copy. The guard only inspects the operator objects the builder creates itself, so filter values (Prisma `Decimal`, `Date`, other class instances) are untouched; a non-plain existing value is now AND-ed instead of being spread.

### `@zudojs/docs` v1.0.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-docs.md)

Patch Changes

- Round 10 audit fixes.
    - `stripMarkdown` runs in linear time; 2 KB of newlines used to block for ~6 s (tooling/DOCS-01).
    - `validateLinks` scans in linear time; a 99 KB document used to take ~30 s under the 100 KB scan cap (tooling/DOCS-02).
    - Frontmatter `tags` always parses to a string array (`tags: http` → `["http"]`, `tags:` → `[]`, `tags: [a, b]` → `["a", "b"]`); `createDocument` no longer spreads a string tag into characters. Empty arrays/objects serialize as `[]`/`{}` and round-trip (tooling/DOCS-03).
    - Structured-node markdown generation HTML-escapes text (`&`, `<`, `>`) outside code blocks and writes links whose scheme is not http, https, mailto, tel, ftp or ftps as plain text; `validateLinks`/`validateAll` report such links as `UNSAFE_LINK` errors (tooling/DOCS-04).
    - Visibility filtering fails closed: only an unset or exactly `"CLIENT"` visibility reaches the `"CLIENT"` filter and `generateIndex`; every other value (e.g. `"server"`) is treated as server-only (tooling/DOCS-05).
    - `parseFrontmatter` removes only the single blank separator line after the block, keeping body indentation and further blank lines; numeric literals become numbers only when the conversion is lossless (`1e+21` and `1.5e-7` round-trip, `007` stays a string) (tooling/DOCS-06).

  Behaviour changes: structured paragraphs/tables/quotes/lists/headings are HTML-escaped; `javascript:`/`data:` links become plain text and fail validation; `getAll({ visibility: "SERVER" })` also returns documents with unrecognised visibility; frontmatter bodies are no longer left-trimmed.

### `@zudojs/errors` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-errors.md)

Minor Changes

- Round 10 fixes:
    - LEAF-02: `ErrorSerializer` and `ErrorHandler.toLogObject` redact array causes, and redact every field of a plain-object cause that only looks like a serialized BaseError. Only objects that a BaseError's `toJSON` really produced get BaseError treatment now.
    - LEAF-03: the cause depth limit (8) is counted across the whole chain, BaseError causes included. A 20 000-deep wrapper chain no longer overflows the stack in `toJSON`, `toLogObject`, `ErrorSerializer.serialize` or `ErrorHandler.toLogObject`.
    - LEAF-09 (behaviour change): `BaseError.toJSON()` / `toLogObject()` (and therefore `JSON.stringify(error)`) redact metadata values under sensitive keys and sensitive keys inside plain-object causes. The raw values stay on `error.metadata` / `error.cause`. `ErrorSerializer({ redactSensitiveData: false })` still returns raw values.
    - LEAF-10 (behaviour change): `ValidationError` / `SchemaError` `toJSON()` always replace issue values with a type description, including when `expose` is false. Raw values stay on `error.issues`.
    - LEAF-11: `redactIssueValues` drops `__proto__` / `constructor` / `prototype` keys, so a JSON-parsed issue cannot swap the output's prototype.
    - LEAF-13: `safeStringify` tracks the ancestor path, so a shared, non-cyclic sub-object is no longer printed as `[Circular]`.
    - LEAF-14: `sanitizeFragment` strips U+2028/U+2029 and the bidi marks, embeddings, overrides and isolates.
    - New classes that other packages defined locally (additive; consumers not switched yet): `TransactionError` and its 10 subclasses, `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`, `TraversalLimitError`, `HttpMiddlewareError`, `HttpMiddlewarePipelineError`, `HttpRequestGuardError`, `OpenAPIError`, `AuthError`, `OAuthError`, `CqrsError`, `ObservabilityError`, `InvalidConstantError`, `ConstantContextError`. Also new: `ErrorCode.OAUTH_*` (the values equal `@zudojs/auth-oauth`'s code strings).
    - tooling/CONV-01 (phase 2): new `CLIValidationError`, `CLIGenerationError`, `CLINotInProjectError` and `CLITemplateError` (moved from `zudojs-cli`, same constructors, all `ApplicationError`s).
    - LEAF-18: `ErrorConstructor<T>` is now `abstract new (...args: never[]) => T` instead of `any[]`. Every constructor is still assignable.

### `@zudojs/events` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-events.md)

Minor Changes

- Round 10 fixes:
    - EVT-01: with `freezeEvents` (the default) handlers now receive a deeply frozen COPY of the event instead of the publisher's objects being frozen in place, and nothing is copied or frozen when no handler is subscribed. Map, Set and Date values (including `event.timestamp`) are copied into `FrozenEventMap` / `FrozenEventSet` / `FrozenEventDate`, which still pass `instanceof` but throw on mutation. New export: `createFrozenEventSnapshot` (plus the three frozen classes).
    - EVT-02: every handler (not only once-handlers) is checked for registration immediately before it runs, so a handler unsubscribed by an earlier handler in the same dispatch, or remaining after the bus was disposed inside a handler, no longer runs.
    - CONV-02: the default leak warning is emitted through `process.emitWarning` (type `ZudojsEventsWarning`, code `ZUDOJS_EVENTS_HANDLER_LIMIT`) instead of `console.warn`.

  Behaviour changes: publishers can mutate their payload objects after publishing; handlers see a copy (so `e.payload.obj !== originalObj`), and instances of user classes inside a payload are passed by reference and are no longer frozen; mutating a Map/Set/Date in a dispatched event now throws a TypeError; the leak warning no longer prints via `console.warn` (it appears as a Node process warning).

    - MSG-02 (phase 2): `executeEventMiddlewarePipeline` is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged (descending priority, abort checks before every stage and the terminal, `EventMiddlewareError` for a double `next()` and for a middleware's own errors, downstream errors passed through untouched, no depth ceiling). The pipeline file also drops below 150 lines.

### `@zudojs/feature-flags` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-feature-flags.md)

Minor Changes

- Round 10 fixes.
    - **FF-01 (bug):** a dependency is satisfied only when the prerequisite _evaluates_ on for the same context (not disabled/draft/archived/expired, not `false`/`null`/`undefined`, its own dependencies satisfied). `resolveDependencies` takes an optional fifth `context` argument.
    - **FF-02 (bug):** attribute rules gain an optional `result` (the value served on a match, default `true`). An attribute rule without `result` on a non-boolean flag is skipped instead of serving `true`.
    - **FF-03 (security):** `matches` refuses patterns that can backtrack catastrophically (a repeated group that itself repeats or alternates, or a backreference) and tests only values up to 1,024 characters.
    - **FF-04 (bug):** `createFeatureFlags` remembers unknown keys for `missingFlagTtlMs` (new option, default 30 s, at most 1,000 keys, cleared on reload). `createCachedProvider` gains `maxEntries` (default 1,000).
    - **FF-05 (convention):** `isPlainObject` now matches `@zudojs/types` semantics (false for `Date`, `Map`, class instances) and is deprecated in favour of `@zudojs/types`.

  Behaviour changes: dependents turn off where their prerequisite is archived, expired or not rolled out for the subject; non-boolean flags no longer serve `true` from an attribute rule without `result`; nested-quantifier `matches` patterns never match; a missing key is not re-fetched for 30 s; `isPlainObject(new Date())` is `false`.

    - **authz/FF-05 (phase 2):** `isPlainObject` is now a re-export of the `@zudojs/types` function (same semantics as the round-10 local copy; the export is kept and marked deprecated in favour of importing from `@zudojs/types`).

### `@zudojs/http` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-http.md)

Minor Changes

- Round 10 fixes.
    - **HTTP-01:** `createPathMiddleware` matches paths the way the router does (canonical parse, repeated/trailing slashes ignored, case-insensitive by default; new optional `{ caseSensitive }` third argument). `/Admin`, `/admin/` and `/admin//` no longer skip a guard on `/admin`.
    - **HTTP-02:** error responses use the **outermost** error carrying a status. Only `HttpMiddlewareError` / `HttpMiddlewarePipelineError` are unwrapped; a wrapped `cause` never supplies status, message or headers, and a status-less application error is a 500.
    - **HTTP-03 (behaviour change):** a plain object returned from a handler or error handler is always sent as JSON. Return `createResponseContext({ status, headers, body })` to set a status. `isResponseContextInit` / `isResponseContextLike` are deprecated (kept).
    - **HTTP-04 (behaviour change):** the Node adapter answers 400 to request-targets with `.`/`..` segments (plain or `%2e`), backslashes, or a non-origin/absolute form. `request.path`, the router, path middleware and static files share one parser (`parseRequestTarget`, `getCanonicalPath`, `findRequestTargetViolation`, `isCanonicalRequestTarget` are new exports); `//host/x` stays a path.
    - **HTTP-05 (behaviour change):** `NodeHttpAdapter` runs `guardRequest` on every request by default (new `security` option: a config object, or `false` to disable). HTTP/1.0 requests may omit Host (new `requireHost` config field); body limits stay with `maxBodySize` (413). New export `createNodeRequestGuard`.
    - **HTTP-06 (behaviour change):** `joinProxyPath` (and so `createProxyRequest`, `buildProxyRequestPath`, `resolveProxyURL`) throws a 400 `HttpError` for paths with dot segments, including `%2e`/`%2f`/`%5c` forms. New exports `hasProxyDotSegment`, `assertProxyPathContained`.
    - **HTTP-07:** `request.query`, `getQuery()` and the router's `ctx.query` use one parser: repeated names are arrays, records have a null prototype. `parseNodeQuery` now returns `string | readonly string[]` values.
    - **HTTP-08:** numeric `trustProxy` is a hop count; an invalid value throws at adapter construction.
    - **HTTP-09:** `HttpServer.stop()` passes `gracefulShutdownTimeout` to the adapter (`HttpAdapter.stop(options?)`, `stopAdapter(adapter, options?)`).
    - **HTTP-10 (behaviour change):** `serializeCookie`, `response.cookie()` and `serializeResponseCookie` default to `Path=/; HttpOnly; Secure; SameSite=Lax`; override per attribute. New export `DEFAULT_COOKIE_ATTRIBUTES`.
    - **HTTP-11 (behaviour change):** `serializeSignedCookie` binds the MAC to the cookie name; verify with `parseSignedCookie(value, secret, name)`. Without `name` only legacy value-only signatures verify.
    - **HTTP-12:** image/video compression middleware read the response returned by `next()`, image honours `maxWidth`/`maxHeight`, video builds an `ffmpeg()` command, and both accept an `onError` callback instead of swallowing failures.
    - **HTTP-13:** CORS origin matching delegates to `@zudojs/security`'s `isOriginAllowed`; new `createRateLimitMiddleware` wraps `@zudojs/security`'s `createRateLimiter`.
    - **HTTP-14:** `HttpServer` counts requests and fires `onRequest` / `onResponse`.
    - **HTTP-15:** static middleware evaluates conditionals with `evaluateConditionalRequest` (ETag lists, weak tags, `*`, `If-Modified-Since`, 412).
    - **HTTP-16 (behaviour change):** `createCorsMiddleware` throws `ConfigurationError` at construction for a wildcard origin (including the default) with `credentials: true`.

  Round 10 phase 2:

    - HTTP-11: `parseSignedCookie` compares signatures with `@zudojs/crypto`'s `timingSafeEqualString`; the local constant-time helper is gone. `signCookieValue` keeps `node:crypto` `createHmac` because it is synchronous and every `@zudojs/crypto` HMAC helper is async.
    - CONV-02: `HttpRequestGuardError`, `HttpMiddlewareError` (+ `HttpMiddlewareErrorOptions`) and `HttpMiddlewarePipelineError` are re-exported from `@zudojs/errors`. **Behaviour change:** `HttpRequestGuardError` is now a `BaseError` (code `HTTP_REQUEST_REJECTED`, category `validation`, `expose: false`, a status outside 400-499 falls back to 400) instead of a plain `Error`, and its `errors` array is a frozen copy.
    - events/H6: contexts created by `NodeHTTPAdapter`, `NodeContextAdapter` and `adaptNodeContext` get a `@zudojs/logger` console logger (`createDefaultLogger("http")`) instead of a `console.*` shim. **Behaviour change:** secret metadata fields are printed as `[REDACTED]`, output uses the logger's text format, and the context logger now implements the full `Logger` interface (`debug`, `child`, …) instead of only `info`/`warn`/`error`.
    - Rate limiting: `createRateLimitMiddleware` counts a request whose `remoteAddress` is missing or not an IP in one shared bucket (new export `UNKNOWN_CLIENT_RATE_LIMIT_IP`, `0.0.0.0`). Such a request used to hit `@zudojs/security`'s `ConfigurationError` and fail with a 500.

### `@zudojs/lifecycle` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-lifecycle.md)

Patch Changes

- Round 10 fixes.
    - **LC-01:** A component `timeout` of NaN or a negative value throws a `RangeError` at `register()`. `Infinity` means unbounded, and finite values above 2^31-1 ms are clamped. Previously these values armed a 1 ms timer, and its callback crashed the process with an uncaught `RangeError`. `withTimeout` validates the same way.
    - **LC-02:** A hook that times out is not retried while it is still running. Shutdown waits, within its deadline, for the abandoned hook to settle before calling `stop()`. `LifecycleExecutor.settleAbandoned()` was added.
    - **LC-03:** `shutdownTimeout: Infinity` means no deadline, where it used to abort after 1 ms. NaN and negative values throw a `RangeError` from the constructor, and large finite values are clamped.
    - **LC-04:** Signal handlers are installed by `start()`, not the constructor, and removed when shutdown finishes. A second signal during shutdown exits with code 1. `installSignalHandlers` gains `forceExitOnSecondSignal` (default true) and `exit`.
    - Behaviour changes: a timed-out hook is never retried; constructing a manager no longer touches process signals; invalid timeouts throw at registration or construction.

### `@zudojs/logger` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-logger.md)

Minor Changes

- Round 10 fixes:
    - LOG-01: the text formatter no longer lets a newline inside an error message forge a log record through the stack trace. The error header (name and message) is escaped as one line and every frame line is escaped and indented. `escapeLogText` now also escapes C1 controls, DEL inside quoted values, and U+2028/U+2029; the level name and JSON-quoted metadata values are escaped as well.
    - LOG-02: `createMultiLoggerTransport` and `createConditionalLoggerTransport` now forward `flush()` and `close()` to the transports they wrap, so nested buffered/file transports are drained and closed by the logger. The multi transport writes to every sink even when one throws, then rethrows the failure(s) (several as an `AggregateError`).
    - LOG-03: the buffered transport writes each entry independently (a failing write loses only that entry), forwards `flush()` to its inner transport, and keeps a timer-triggered flush failure so the next `flush()`/`close()` rethrows it.
    - LOG-04: `logger.flush()` and `logger.close()` isolate each transport; one failing transport no longer leaves later ones unflushed/unclosed, and `close()` always marks the logger disposed. Several failures surface as one `AggregateError`.
    - LOG-05: child loggers (`child()`, `withContext()`) register their in-flight dispatches with the root logger, so the root's `flush()`/`close()` drains them; a child reports itself disposed once its root is closed.
    - LOG-06: the default secret matcher is now word-based over the new `DEFAULT_LOGGER_SECRET_FIELDS` (adds auth, jwt, bearer, session/sessionId, sid, ssn, card number, cvv, cvc, pin, otp, passphrase, client secret…) and no longer redacts names that merely contain `pass` (`passenger`, `compass`, `bypassCache`). `DEFAULT_LOGGER_SECRET_PATTERN` is still exported (deprecated) and can be passed as `redact.pattern` to restore the old behaviour.

  New exports: `DEFAULT_LOGGER_SECRET_FIELDS`, `createDefaultSecretFieldMatcher`, `throwCollectedFailures`, `settleAllOrThrow`.

  Behaviour changes: a timer-triggered buffered-flush failure is now rethrown by the next `flush()`/`close()`; different fields are redacted by default; a child logger throws `LoggerDisposedError` after its root is closed; multi/conditional composite transports without an explicit name keep a generated name but are now object transports with `flush`/`close`.

### `@zudojs/messaging` v1.0.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-messaging.md)

Patch Changes

- Round 10 fixes:
    - MSG-01: object-form middleware (`bus.use({ handle })`) and handlers resolved through `resolveMessageHandler` are now bound to their object, so class-based middleware and handlers that use `this` work.
    - MSG-02: calling `next()` twice in message middleware now throws `MiddlewareNextCalledMultipleTimesError` from `@zudojs/errors` (a `MiddlewareError`) instead of a plain `Error`. The message text changes to `Middleware "message-middleware#<index>" called next() multiple times.`
    - MSG-02 (phase 2): the middleware pipeline is built on `compose` from `@zudojs/middleware` instead of a local copy. A double `next()` still throws `MiddlewareNextCalledMultipleTimesError`; its `middlewareName` is now `"middleware[<index>]"` (was `"message-middleware#<index>"`). Pipelines keep no depth ceiling.

### `@zudojs/middleware` v1.0.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-middleware.md)

Patch Changes

- Round 10 fixes:
    - MW-01: `rateLimitMiddleware` refreshes a key's recency when it rejects a request, so a throttled key is no longer the first one evicted once `maxKeys` is reached. One new key can no longer reset a throttled client's window.
    - XP-01: `MiddlewareError`, `MiddlewareTimeoutError` and `MiddlewareNextCalledMultipleTimesError` are now re-exports of the `@zudojs/errors` classes, and the package-only errors (`MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`) extend the shared `MiddlewareError`. `instanceof` checks against either import path now match. Consequences: codes become `ERR_MIDDLEWARE_EXECUTION` / `ERR_MIDDLEWARE_TIMEOUT` (were `ERR_OPERATION_FAILED`), category becomes `middleware` (was `internal`), `middlewareName` is an own property instead of `metadata.middlewareName`, the timeout and next()-twice messages gain a trailing period, and `MiddlewareNextCalledMultipleTimesError` is non-operational.
    - CONV-02: `loggingMiddleware()` without a logger and `withTiming()` without `options.logger` no longer write to `console.log` / `console.warn`; they write nothing. Pass a sink such as `(line) => log.info(line)` from `@zudojs/logger`.
    - CV-02 (phase 2): `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError` and `MiddlewareAbortedError` are now re-exports of the `@zudojs/errors` classes (same constructors, messages and fields), so every middleware error class is the shared one.

### `@zudojs/observability` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-observability.md)

Minor Changes

- Round 10 audit fixes.
    - OBS-01: `tracer.startSpan()` without an explicit `parent` now joins the active propagation context, so logs and spans in one request share a `traceId`. New `withSpan(tracer, name, fn, options?)` and `DefaultTracer.startActiveSpan(name, fn, options?)` run a callback with the span as the active context and end it (recording a throw or rejection).
    - OBS-02: `createSpanContext`, `createChildSpanContext`, `createPropagationContext` and `startSpan` now validate trace and span IDs. An invalid `traceId`/`parentSpanId` (or an invalid parent) starts a fresh trace and drops its trace flags; an invalid `spanId` is replaced. New `parseTraceparent`, `formatTraceparent`, `TRACEPARENT_HEADER` and `isValidSpanContext`.
    - OBS-03: redaction rebuilds objects with `Object.defineProperty`, so an own `__proto__` key stays a data property instead of replacing the output's prototype.
    - OBS-04: `onCardinalityLimit` fires once per rejected series (tracked in a bounded seen-set, separate from the overflow cache); the facade raises `onError` once per over-cardinality metric name.
    - XP-02: new `toLoggerLevel` / `fromLoggerLevel` convert between this package's `LogLevel` (higher = more severe) and `@zudojs/logger`'s inverted `LoggerLevel` numbers.

  Behaviour changes: spans started inside `propagation.run()` are now children of the ambient context (previously a new trace); non-W3C trace/span IDs passed to the context factories are no longer kept verbatim; the facade's `onError` reports cardinality once per metric name instead of once per rejected series.

    - CONV-01 / H5 (phase 2): `ObservabilityError` is now the `@zudojs/errors` class, re-exported (same constructor and defaults). `ExporterError`, `ObservabilityConfigError` and `MetricValueError` stay as thin subclasses, so `instanceof ObservabilityError` matches across both import paths.

### `@zudojs/openapi` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-openapi.md)

Minor Changes

- Round 10 fixes.
    - **edge/OPENAPI-01:** string and array schemas without an explicit `.max()` now emit the effective ceiling `@zudojs/schema` enforces at parse time (`maxLength: 255`, `maxItems: 1000`), so clients generated from the document no longer send payloads the server rejects. Behaviour change: generated documents gain these `maxLength` / `maxItems` keywords.
    - **edge/OPENAPI-02 (security):** the documentation page loads exact, pinned viewer versions (`swagger-ui-dist@5.33.0`, `redoc@2.5.4` from cdn.jsdelivr.net) with Subresource Integrity hashes instead of the floating `swagger-ui-dist@5` / `redoc/latest` tags. `toUIResponse` now sends `x-content-type-options: nosniff` and a restrictive `content-security-policy` (scripts only from the asset origin plus the hash of the page's inline bootstrap script; `connect-src` limited to the page origin, spec URL and the document's servers). New opt-in options: `assetIntegrity`, `contentSecurityPolicy` (string or `false`), `connectSources`. New exports: `buildOpenAPIUIContentSecurityPolicy`, `SWAGGER_UI_VERSION`, `REDOC_VERSION`, `OpenAPIUIAssetIntegrity`. Behaviour change: the default asset host moved from unpkg / cdn.redoc.ly to cdn.jsdelivr.net, and a self-hosted `assetsBaseUrl` gets no `integrity` attribute unless `assetIntegrity` is passed.
    - **edge/OPENAPI-03:** `ZUDO_SITE_URL` (the default logo link on the docs page and in `info["x-logo"].href`) is now `https://zudojs.oyinlola.site` instead of `https://zudo.dev`.

  Round 10 phase 2:

    - CONV-02: `OpenAPIError` and `OpenAPIErrorOptions` are re-exported from `@zudojs/errors` (same code, category, 500 / not exposed defaults). `createOpenAPIError`, `isOpenAPIError` and the subclasses are unchanged and now extend the shared class.
    - The schema converter reads `SCHEMA_DEFAULT_MAX_STRING_LENGTH` / `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH` from `@zudojs/constants`; the internal mirror (`openApiConstants.schemaLimits.ts`) is deleted. No output change.

### `@zudojs/permissions` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-permissions.md)

Minor Changes

- Round 10 fixes.
    - **PERM-01 (security, fail-closed):** a deny rule whose condition throws, or that has a condition but no context, now _applies_ (denied, `rule_deny`), instead of being skipped so the role's allow won. Allow rules keep failing closed by not applying. The error goes to `onError`, and a decision forced by a throwing condition is not cached. `evaluateRulesSync` applies a conditional deny for the same reason.
    - **PERM-02 (security):** the decision-cache key now carries a digest of everything the actor carries besides its id (`roles`, `permissions`, `type`, any other field). The same id with different roles (another tenant's token, a demoted token) no longer gets a cached allow. An actor the digest cannot describe (function, class instance, `Map`) is not cached. New exports: `actorCacheDigest`, `MAX_ACTOR_DIGEST_LENGTH`. `permissionCacheKey` takes an optional fourth `scope` argument.
    - **PERM-03 (security):** the HTTP guards `await` `extractResource`. A loader that throws or rejects answers 403 (`reason: "resource_error"`) and reports through the new `onError` middleware option; it no longer lets the request through or leaks an unhandled rejection. New exports: `loadResource`, `RESOURCE_ERROR_DECISION`, `ResourceExtractor`, `ResourceOutcome`.
    - **PERM-04 (security):** `createRoleRegistry()` and `createPolicyRegistry()` gain `subscribe(listener)`. An engine subscribes to the registries it is given; any `define` / `remove` / `clear` drops memoized roles and every cached decision (a configuration generation is part of the cache key, and `cache.clear()` is called). `invalidateRoles()` now also drops cached decisions.
    - **PERM-05 (security):** malformed patterns are rejected in static rules, role rules, and policy `permissions` — at engine construction (`validateConfiguration`), in `createPolicyRegistry().define` (new `validatePermissions` option, default `true`), in `createRoleRegistry().define` for role rules, and lazily for custom policy sources.
    - **PERM-06 (docs):** the README no longer fills `tenantIsolation()` metadata from a request header; it reads the tenant `@zudojs/tenancy` verified.
    - **PERM-07 (security):** a wildcard check (`can(actor, "post:*")`) is refused by any narrower deny: `deniedPermissions`, a deny rule, or a policy scoped to a narrower permission (such a policy can deny a wildcard check but not grant it). New export: `permissionsOverlap`.
    - **PERM-08 (security):** `createRequirePermissionsMiddleware` with an empty permission list denies (403) in both modes.
    - **PERM-09:** `explain()` on the engine and on an Ability emits an audit event, like `check()`.
    - **cross/CV-01:** removed the `@zudojs/http` peer dependency (http is a higher tier; nothing imported it). The mirrored request type now accepts plain-object headers/params/query as `@zudojs/http` provides them (`HttpRequestBag`), plus optional `getHeader` / `getParam`.

  Behaviour changes: throwing deny conditions deny; fewer cache hits for actors whose grants differ; resource-loader failures deny; registry changes and `invalidateRoles()` clear the decision cache; malformed rule/policy patterns throw at construction/`define`; wildcard checks honour narrower denies; empty permission lists deny; `explain()` emits audit events; the Ability's events now include `resourceType`.

### `@zudojs/plugins` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-plugins.md)

Minor Changes

- Round 10 fixes.
    - **PLUG-01:** When a hook exceeds `hookTimeout`, the manager now waits up to another `hookTimeout` for that hook to settle before disposing the plugin. It calls `stop()` if the timed-out `start()` went on to succeed. If `start()` finishes even later, `stop()` runs as soon as it does.
    - **CONV-02:** Teardown and event-listener failures no longer go to `console.error`. They go to `onError`, then to the new `PluginManagerOptions.logger`, then to the context logger. With none of these they become a `ZudoPluginWarning` process warning.

### `@zudojs/queue` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-queue.md)

Minor Changes

- Round 10 fixes:
    - INF-09: after a job times out, its concurrency slot and its retry wait up to `QueueOptions.timeoutGraceMs` (new, default 5000 ms) for the processor to actually settle. A processor that ignored `context.signal` used to keep running beside its own retries. Past the grace period, the processor is abandoned and the job fails anyway.
    - INF-10: new `QueueOptions.autoProcess` (default `true`) and optional `Queue.setAutoProcess()`. `createWorker` turns the queue's own poller off as a consumer, so a worker is the only thing running jobs, its middleware, timeout and concurrency apply to every job, and `worker.stop()` really stops consumption. Scheduled-job promotion and stalled-job reclaim keep running.
    - INF-11: a pending retry timer stays registered until it fires, so `close()` now clears it. It used to be deregistered as soon as it was registered.
    - INF-18: a worker's failing poll and a throwing event listener are reported through `logger.error` (new optional member of `QueueLogger`; new `WorkerOptions.logger`), or through `process.emitWarning` (type `ZudoQueueWarning`) when no logger is configured. They no longer go to `console.error`.
    - cross/X-06: new `QueueOptions.contextCarriers` with the `QueueContextCarrier` contract, `captureContext`, `runWithContext` and `CONTEXT_METADATA_KEY`. Ambient context (a tenant id, a correlation id) is captured into job metadata at `add()` and restored around the middleware and the processor, for both the queue's poller and a `Worker`.

  Behaviour changes: once a `Worker` is created for a queue, the queue no longer consumes jobs itself. A timed-out attempt holds its slot until the processor settles or `timeoutGraceMs` elapses. Default error reporting uses `process.emitWarning` instead of `console.error`.

### `@zudojs/rpc` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-rpc.md)

Minor Changes

- Round 10 fixes.
    - **edge/RPC-01 (security):** `RPCServer.handle(request, { auth })` and `RPCDispatcher.dispatch(request, { auth })` accept trusted, transport-derived identity, exposed frozen as `context.auth`. Frame `metadata` is documented as caller-controlled; the README no longer teaches authenticating on `context.metadata.userId`.
    - **edge/RPC-02:** `context.input` now carries the schema-parsed input (stripped, defaulted, coerced), so middleware can authorise on the value the handler receives. `context.request.payload` stays raw. README corrected.
    - New exports: `RPCAuthContext`, `RPCContextOptions`; `createRPCContext` takes an optional third `options` argument. All additions are optional; existing calls are unchanged.

### `@zudojs/runtime` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-runtime.md)

Minor Changes

- Round 10 fixes.
    - **RT-01:** A startup timeout now abandons the startup. No further module hook starts, and a module whose `onInitialize` or `onReady` finishes after the timeout is shut down and destroyed when it settles. `stop()` waits for that teardown, bounded by `shutdownTimeout`. `LifecycleManager` gains `cancel()` and a `cancelled` getter.
    - **RT-02:** A second `stop()` after a shutdown timeout joins the teardown that is still running instead of calling every `onShutdown` again. Modules leave `startedModules` as they are stopped.
    - **RT-03 (fail-closed):** A configuration manager that fails to load now fails startup with `RuntimeStartError` (`phase: "initialize"`), and the startup rolls back. Previously the failure was logged as a warning and modules initialized against partial configuration.
    - **RT-04:** Signal and fatal-error handlers are released after a failed, rolled-back `start()`.
    - **RT-05:** `RuntimeOptions` now exposes `exitOnFatalError`, `forceExitOnSecondSignal` and `fatalExitTimeout` and passes them to the signal handler. The defaults are unchanged (true, true, 10000). `LifecycleManagerOptions.shutdownTimeout` is marked deprecated, since it has never had an effect.
    - **X-01:** A module whose `onInitialize` threw now has its `onDestroy` run during rollback and teardown, matching `@zudojs/lifecycle` and `@zudojs/core`.
    - Behaviour changes: `stop()` after a timed-out startup whose hook never settles rejects with a shutdown timeout instead of reporting a clean stop; config load failures fail startup; `onDestroy` runs for failed initializers.

### `@zudojs/scheduler` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-scheduler.md)

Patch Changes

- Round 10 fixes:
    - INF-01: a schedule added after `start()` (`every`, `after`, `at`, `cron`) now re-arms the timer immediately. It used to wait for an unrelated timer, up to about 24.8 days on an empty scheduler.
    - INF-05: `timezone: "UTC"` cron no longer skips minutes 0-29 of a restricted hour on hosts with a half-hour offset (Asia/Kolkata, Newfoundland and similar). Hour skips and second-clearing now use UTC arithmetic in UTC mode.
    - INF-06: a `cron` (or `interval`) trigger with no next fire time, such as `0 0 30 2 *`, is rejected at registration with `InvalidScheduleError`. It used to be treated as a misfire, run once immediately and then retire silently. One-shot (`at`/`after`) misfire behaviour is unchanged.

  Behaviour changes: `cron()` throws `InvalidScheduleError` for an expression that can never fire.

### `@zudojs/schema` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-schema.md)

Minor Changes

- Round 10 fixes.
    - **data/SCHEMA-01 (security):** `maxIssues` caps how many issues are collected, never whether parsing fails. The first issue is always kept (`maxIssues: 0` behaves like `1`) and dropped issues are counted, so object, array and union schemas no longer accept anything under `maxIssues: 0`. New export `countIssues(ctx)` for custom schemas.
    - **data/SCHEMA-02:** `refine` and `transform` callbacks (`schema.refine`, `schema.transform`, `StringSchema/NumberSchema.transform`) are skipped when the inner schema recorded an issue, so they never see a partially valid object.
    - **data/SCHEMA-03 (DoS):** `SCHEMA_DEFAULT_MAX_OBJECT_KEYS` (100) is now enforced on `record()` and on objects in `.strict()` / `.passthrough()` mode (never below the shape's own key count). New opt-in `.maxKeys(n)` on `RecordSchema` and `ObjectSchema`. Behaviour change: records with more than 100 keys now fail unless `.maxKeys()` raises the limit.
    - **data/SCHEMA-04:** `intersection` deep-merges nested plain-object results instead of letting the right side replace the left's nested object.
    - **data/SCHEMA-05:** `array().max(n)` reports `too_large` once instead of twice.
    - **data/SER-03 (phase 2):** `coerce.bigint()` bounds its input with `SerializationLimits.MAX_BIGINT_DIGITS` from `@zudojs/constants` (4096, shared with `@zudojs/serialization`). The bound now counts digits, not characters, so a signed 4096-digit string (4097 characters) is accepted.
    - **data/SCHEMA-03 (phase 2):** a raised `.maxKeys(n)` on an object schema now survives `.pick()`, `.omit()`, `.partial()`, `.extend()` and `.merge()`; before, the derived schema silently fell back to the default of 100.
    - **VAL-05/CV-02 (declined, documented):** `SchemaValidationSignal` stays a plain `Error` subclass. It is an internal control-flow signal that `parse()`/`safeParse()` always convert, so it is exempt from the "errors live in `@zudojs/errors`" rule.

### `@zudojs/security` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-security.md)

Minor Changes

- Round 10 security fixes:
    - SEC-01: `extractClientIp` strips any port and IPv6 brackets, so `client-ip:port` entries no longer produce one bucket per TCP connection. The default rate-limit key maps IPv4-mapped IPv6 to IPv4 and buckets other IPv6 addresses by /64. **Behaviour change:** `defaultKeyGenerator` (and so `createRateLimiter` without a `keyGenerator`) throws `ConfigurationError` when `request.ip` is missing or is not an IP address, including `"unknown"`, instead of putting every such request into one shared bucket. `getCount(ip)` and `reset(ip)` accept raw addresses. New exports: `createIpKeyGenerator({ ipv6PrefixLength })`, `ipRateLimitKey`, `parseClientIp`, `DEFAULT_IPV6_PREFIX_LENGTH`, `IpKeyOptions`.
    - SEC-02: CSRF `methods` are matched case-insensitively, so `methods: ["post"]` now protects POST instead of failing open.
    - SEC-03: a `NaN`, infinite or non-positive body limit no longer disables size checks. `validateBodySize`, `validateContentLength` and `createBodySizeChecker` throw `ConfigurationError`, `validateBodyLimitConfig` reports the limit, and a non-finite body size is rejected.
    - SEC-04: `validateCsrfToken` and `verifyDoubleSubmit` enforce the same 32-character secret minimum as `generateCsrfToken` and throw `ConfigurationError` otherwise.
    - SEC-05: `stripSensitiveCookies` matches whole words anywhere in the name, after dropping a `__Host-`/`__Secure-` prefix. The defaults (new export `DEFAULT_SENSITIVE_COOKIE_NAMES`) add `sid`, `sess`, `sessionid`, `phpsessid`, `jsessionid`, `csrf` and `xsrf`, so `connect.sid`, `__Host-session`, `next-auth.session-token`, `access_token`, `refresh_token` and `PHPSESSID` are all stripped. New export: `isSensitiveCookieName`.
    - SEC-06: `isSafeUrl` / `isPrivateHostname` judge IPv4-compatible (`::/96`), mapped, translated, NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) addresses as the IPv4 address they embed, whatever their spelling. They also refuse `64:ff9b:1::/48`, `fec0::/10` and `ff00::/8`, and an unparseable IPv6 literal fails closed.
    - SEC-07: `containsXss` decodes HTML character references and ignores whitespace inside a scheme (catching `jav&#x61;script:`, `javascript&colon;` and `java&#x09;script:`). `containsSqlInjection` catches `' OR 1=1`, `' ||` and time-based probes (`pg_sleep`, `SLEEP`, `BENCHMARK`, `WAITFOR DELAY`). Both are still heuristics.
    - CONV-02 (partial): configuration and cookie-serialisation failures now throw `ConfigurationError` / `ValidationError` from `@zudojs/errors` instead of a bare `Error`. Both still extend `Error`. Existing `RangeError` throws are unchanged.
    - SEC-06 (phase 2): new exports `expandIpv6`, `embeddedIpv4` and `isNonPublicIpv6Range`, the IPv6 helpers behind `isSafeUrl` / `isPrivateHostname`, so `@zudojs/auth-oauth` shares them instead of keeping a copy.

### `@zudojs/serialization` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-serialization.md)

Minor Changes

- Round 10 fixes.
    - **data/SER-01 / cross/X-04 (security):** with `preserveTypes`, a plain object that has its own string `$type` key is written escaped as `{"$type":"Object","$value":{...}}` and read back as that plain object, so user data can no longer be revived as a `Map`, `Error`, `BigInt`, `Date` or `Buffer`. New export `ESCAPED_OBJECT_TAG` (`"Object"`), which `registerTransformer` refuses. Payloads written before this change remain readable (unescaped tags are revived as before). A tag whose transformer rejects it (for example `{"$type":"Date","$value":"nope"}`) now reads back as a plain object instead of making the record unreadable; with `strict: true` it throws `TransformerError` / `InvalidSerializedDataError`.
    - **data/SER-03 (DoS):** BigInt tags are limited to 4096 decimal digits and validated before `BigInt()` runs; serializing a larger BigInt throws `SerializeError`.
    - **data/SER-04:** failures throw `@zudojs/errors` classes: `SerializationPayloadTooLargeError`, `SerializationDepthError`, `InvalidSerializedDataError` (invalid JSON — now also outside strict mode, where a raw `SyntaxError` used to escape — and unknown or malformed tags under `strict`), `TransformerError`, and `SerializeError` for an invalid `Date` (previously a raw `RangeError`). Messages are unchanged.
    - **data/SER-05:** `createSerializer` accepts every serialize/deserialize option (`maxSize`, `maxDepth`, `strict`, `allowUnsafeKeys`, `includeStack`, ...) as an instance default.
    - **data/VAL-01:** `serialize({ preserveTypes: true })` handles sparse arrays (via the `@zudojs/validation` fix and an index loop).
    - **data/SER-03 (phase 2):** the BigInt digit bound now comes from `SerializationLimits.MAX_BIGINT_DIGITS` in `@zudojs/constants` (still 4096), shared with `@zudojs/schema`'s coercion.

### `@zudojs/storage` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-storage.md)

Patch Changes

- Round 10 fixes:
    - INF-02: `LocalObjectStorage` keys are opaque. A key with a `.`, `..` or empty path segment (`tenantA/../tenantB/x`, `./x`, `a//b`, including `\`-separated forms) is refused with `STORAGE_PATH_TRAVERSAL` / `STORAGE_INVALID_KEY` instead of being normalised, so `${tenant}/${userKey}` can no longer cross into another tenant's prefix.
    - INF-03: the reserved `.zudo-object-meta` directory is checked after resolution as well as on the raw key, so metadata sidecars can no longer be forged (for example, flipping another object's `contentType` to `text/html`).
    - INF-14: `get`, `exists` and `metadata` return `null`/`false` only for ENOENT, ENOTDIR and EISDIR. Any other I/O error (EACCES, EIO, ELOOP, EMFILE) throws `StorageError` with code `ERR_STORAGE_READ`, with the original error as its cause.

  Behaviour changes: keys containing dot or empty segments now throw. Non-"missing" I/O errors now throw from `get`/`exists`/`metadata` instead of reading as absent.

### `@zudojs/tenancy` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-tenancy.md)

Minor Changes

- Round 10 fixes.
    - **cross/X-03 (bug):** the HTTP middleware works with the real `@zudojs/http` request, whose `headers` is a plain object. Headers are read through `request.getHeader()` when present, else from a plain object or a `Map`, case-insensitively. New export: `readRequestHeader`; mirrored request types accept both shapes (`HttpRequestBag`).
    - **TEN-01 (security, secure default):** `createResolveTenantMiddleware` defaults `minimumTrust` to `"verified"`. A tenant named only by a client header or URL path is refused (403) unless `minimumTrust: "untrusted"` is passed explicitly.
    - **TEN-02 (gap):** new `createDomainResolver({ registry | repository })` resolves custom domains (source `domain`, trust `verified`). The resolve middleware falls back to `repository.findBySlug` for subdomain/path resolutions (new option `slugLookup`, default `true`).
    - **TEN-03 (docs):** README now says conflict detection is opt-in (`detectConflicts: true`).
    - **TEN-04 (convention):** `TenantId` is the branded type from `@zudojs/constants`, re-exported; tenancy's `createTenantId` stays the validating constructor.
    - **TEN-05 (security):** an unknown tenant and a non-active one both get `404 Tenant not found`; the guard middleware answers `403 Tenant is not available` without the tenant id or status.
    - **cross/CV-01:** removed the `@zudojs/http` peer dependency (higher tier, never imported).

  Behaviour changes: header/path-only tenancy is refused by default; suspended tenants answer 404 instead of 403 in the resolve middleware; the guard's 403 body no longer names the tenant or its status; `TenantId` brand changed to the shared one (values from either package are accepted by both).

    - **leaf/X-05 (phase 2):** `createTenantId` now delegates to `createTenantId` in `@zudojs/constants` and rethrows its rejection as `InvalidTenantIdError`, so both packages apply one rule (NFKC, trim, lowercase, `[a-z0-9][a-z0-9_-]*`, 64 characters). `MAX_TENANT_ID_LENGTH` is re-exported from constants (still 64), and `TENANT_ID_PATTERN` is newly exported. `TenantId` was already the constants brand. No behaviour change for callers.

### `@zudojs/testing` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-testing.md)

Patch Changes

- Round 10 audit fixes.
    - `deepEqual` / `findDifference` (and every assertion built on them: `assertSerializesCorrectly`, `assertDeserializesTo`, `assertErrorMetadata`, spy-logger matchers) now compare type as well as keys (tooling/TEST-01):
    - objects must share a prototype, so a class instance no longer equals a plain object or an instance of another class (`{}` and `Object.create(null)` still count as the same);
    - Errors compare `name`, `message` and `cause`;
    - boxed primitives compare their value;
    - typed arrays must have the same constructor;
    - distinct Promises, WeakMaps, WeakSets and WeakRefs are never equal.
    - Set/Map comparison no longer lets an identity hit on an already-matched entry remove an unrelated unmatched entry (`splice(-1, 1)`), and a structurally matched Map key now prefers the key whose value also matches.

  Behaviour change: assertions that passed by accident (an Error serialized to `{}`, a class instance compared against a plain object) now fail.

### `@zudojs/transactions` v1.1.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-transactions.md)

Patch Changes

- Round 10 fixes:
    - INF-04: releasing a savepoint (`propagation: "nested"`) is no longer treated as a commit. Its `afterCommit` and `afterRollback` callbacks, and `hooks.afterCommit` for the savepoint, move to the enclosing transaction and run only when the outermost transaction commits (or, for `afterRollback`, rolls back). A savepoint that is itself rolled back still runs its `afterRollback` at once and discards its `afterCommit`.

  Behaviour changes: side effects registered inside a nested block no longer run when the outer transaction later rolls back. `hooks.afterCommit` for a savepoint fires after the root commit, and a failure there is reported through `hooks.onError` (like any after-commit callback) instead of rejecting the savepoint's commit.

    - **infra/INF-16 (phase 2):** `TransactionError` and its 11 subclasses (`TransactionStateError`, `TransactionTimeoutError`, `TransactionCommitError`, `TransactionRollbackError`, `TransactionAdapterError`, `TransactionPropagationError`, `TransactionIsolationError`, `SavepointError`, `TransactionRequiredError`, `TransactionUnexpectedError`, `TransactionCapabilityError`) are now owned by `@zudojs/errors` and re-exported here. Names, constructors and codes are unchanged, and `instanceof` now matches whichever package the class is imported from. New type export: `TransactionErrorOptions`.

### `@zudojs/types` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-types.md)

Minor Changes

- Round 10 fixes:
    - LEAF-01: `systemRandom.int(max)` no longer hangs when `max > 2**32`. Bounds up to `Number.MAX_SAFE_INTEGER` draw 53 bits by rejection sampling. Non-safe-integer bounds throw a `RangeError`. New export: `MAX_RANDOM_INT_BOUND`.
    - LEAF-07 (behaviour change): `SeededRandom` uses mulberry32. `uuid()` no longer cycles after 16 values, and `int(2)` no longer alternates. The value sequence for a given seed is different from before.
    - LEAF-15 (behaviour change): `camelToSnake` / `camelToKebab` are Unicode-aware (`caféAuLait` becomes `café_au_lait`) and keep characters other than `_`, `-` and whitespace instead of deleting them.
    - LEAF-17: `safeJsonParse` now documents that dropping `constructor` / `prototype` is a deliberate deny-list.
    - LEAF-04 / LEAF-19: the `isEmail` doc comment and the README are corrected. Branded types live in `@zudojs/constants`.

### `@zudojs/validation` v1.0.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-validation.md)

Patch Changes

- Round 10 fixes.
    - **data/VAL-01:** sparse arrays no longer crash `hasCircularReference`, `assertDepthWithinLimit`, `getSerializationDepth`, `estimateSerializedSize` or `assertSizeWithinLimit` with a raw `TypeError`; a hole counts as `undefined`.
    - **data/VAL-02 (DoS):** the cycle and depth guards no longer re-walk a shared subtree from the same or a shallower depth, so a DAG of shared nodes is linear instead of exponential. The size estimate still charges every occurrence (bounded by its budget).
    - **data/VAL-03:** `estimateSerializedSize` / `assertSizeWithinLimit` measure what `toJSON()` returns (Dates and binary views keep their existing charges). New optional `resolve` hook on `TraversalVisitor`.
    - **data/VAL-04:** a registry rule with both `schema` and `constraints` runs the schema, then the constraints on the parsed value. Behaviour change: such rules can now fail where they used to pass.
    - **data/VAL-05 / cross/CV-02:** `ValidationError` and `ValidationResultError` now extend `@zudojs/errors`' `ValidationError`, so `instanceof` and `isValidationError()` from `@zudojs/errors` catch them. Public fields are unchanged.
    - **data/VAL-06 (fail-closed):** `not(constraint)` carries the inner constraint's guard and treats a throw as a failure. Behaviour change: `not(matches(...))` now rejects non-strings.
    - **data/VAL-07:** `everyItem` / `someItem` read every index, so holes in a sparse array are checked.
    - **LEAF-10 (security):** `ValidationError.toJSON()` and `ValidationResultError.toJSON()` no longer overwrite the base class's redacted `issues` with the raw ones, and `ValidationError`'s `context` is serialized from the redacted metadata. Behaviour change: serialized issues carry `receivedType` (etc.) instead of the submitted value, and sensitive context keys are `[REDACTED]`. The raw values remain on the error instance.
    - **data/VAL-05 / cross/CV-02 (phase 2):** the exported `TraversalLimitError` (thrown by `traverse()`, the bounded walker behind the depth, size and circular guards) is now re-exported from `@zudojs/errors`, together with `TraversalHalt`. Same name, constructor, `halt`/`path`/`observed` fields and message; it is now a `BaseError` (code `VALIDATION_FAILED`, status 400, `expose: false`, `toJSON()` includes halt/path/observed). The public guards translate it exactly as before.
    - **leaf/LEAF-04 / data/CONV-02 (phase 2, behaviour change):** the `email` constraint now rejects addresses longer than 254 characters (checked before the pattern runs), so it accepts exactly what `ValidationPattern.EMAIL` in `@zudojs/constants` and `isEmail` in `@zudojs/types` accept. A shared corpus test pins the three together. The pattern is still a local copy because validation does not depend on `@zudojs/constants`.
    - The `email` constraint now uses `ValidationPattern.EMAIL` from `@zudojs/constants` (new dependency), so it accepts exactly what `isEmail` in `@zudojs/types` accepts.
