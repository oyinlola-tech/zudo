---
title: "Changelog"
description: "What changed in each Zudo release: per-package release notes generated from the packages' own changelogs, newest first."
source: https://zudojs.oyinlola.site/docs/changelog
---

September 2026

# Changelog

What changed in each release, package by package. These notes are generated from the packages’ own `CHANGELOG.md` files, so they describe what shipped, not what was planned.

## WHAT’S NEW — SEPTEMBER 2026 RELEASE

A release for all 40 packages: every `@zudojs/*` package, `zudojs-cli` **2.1.0** and the `zudojs` installer package each have a new version. The theme is making the documented path work end to end: a new CLI project comes wired and passes its own tests, one API operation is served over four transports, RPC ships its transports, OpenAPI is generated from the routes you actually registered, and a test client drives the real app over HTTP. Much of it came from writing the [Learn](https://zudojs.oyinlola.site/learn) course against the published packages, where each lesson’s example had to run as written. Several fixes close insecure defaults or change behaviour; they are listed at the end of this section and marked in the package notes below. Highlights:

New projects come wired — and the command is now `zudo`

`npm install -g zudojs` installs the CLI with two commands on your PATH, `zudojs` and the shorter `zudo`; `new` is an alias of `create`, and running it with no arguments in a terminal opens a numbered menu. A generated project’s `src/server.ts` now builds a router, serves `/openapi.json` and `/docs`, applies security headers, closed-by-default CORS and rate limiting, and shuts down in order, with typed env config, a composition root, an example CRUD resource and a test that drives it over HTTP. `zudojs generate resource <name>` writes the DTO, repository, service, controller, routes and test in one go, and `zudojs add` writes real, compiling integrations (`database` with Prisma 7, `redis`, `websockets`, `email`, `docker` and more). Generated projects depend on the `@zudojs/*` ranges this CLI build was tested with ([zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md)).

One API operation, four transports

An operation defined once with `defineOperation` is now served over HTTP (`createApiFetchHandler`), RPC (`registerApiRpcProcedures`), queues (`bindApiQueue`) and the command line (`runApiCli`), all through the same executor, interceptors and schema validation, with one client-safe error shape, `APIWireError`. `toOpenAPIRouteDescriptors` documents the same operations in one call, and inline `defineOperation({ input, handler })` now infers the handler’s input from the schema ([@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md)).

RPC ships its transports

`createRPCMemoryTransport(server)` connects a client in the same process, `createRPCHttpTransport({ url })` calls a remote server with `fetch`, and `createRPCFetchHandler(server)` is a web-standard handler any HTTP server can mount — it bounds request bodies and never sends stack traces. The client rebuilds typed errors from the wire, so a caller can `catch` an `RPCValidationError` or `RPCForbiddenError` as such ([@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md)).

OpenAPI generated from your routes

Routes in `@zudojs/http` take an `openapi` option, and `mountOpenAPI(router, options)` serves `/openapi.json` and a docs page built from the routes the router actually registered — path templates, parameter patterns and optional segments included, hidden routes left out. `@zudojs/openapi` gains the transport-neutral `createOpenAPIDocumentFromRoutes`, and `mountFetchHandler` mounts any web-standard `(Request) => Response` handler on a router ([@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md), [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md)).

Test the real app over HTTP

`createHttpTestClient(target)` is a supertest-style client: point it at a URL, a Node server, a fetch handler or an `@zudojs/http` router, then chain `.get("/users").expect(200).expectJson({ ... })`. The recording doubles now record every call path, so `createTestEventBus().bus.publishEvent(...)` is no longer silently missed, and `createTestApplication()` is silent with a fixed clock by default ([@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md)).

### Security fixes

Authorization that means what it says

A permission policy that allowed used to grant the permission on its own, so a “business hours” policy handed `task:delete` to an actor with no roles. A policy is now an extra condition on top of roles and rules unless it declares `effect: "grant"` ([@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md)). Guards that refused a request — `authorize()`, the tenancy guards — stopped the handler but the client still saw `200`, because `@zudojs/http` ignored the plain `{ status, body }` object they returned. The new guard-response contract (`createGuardResponse` in [@zudojs/middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md)) lets a framework-neutral guard return a real `401` or `403`, and the router sends it. In `@zudojs/api`, interceptors now run *before* input validation: an anonymous caller used to get a `422` describing your schema instead of a `401`, and an interceptor that replaced the input bypassed validation altogether.

Safer defaults

A feature flag that is switched off now serves its off value (`false` for a boolean flag) instead of `defaultValue`, so a kill switch on a flag defaulting to `true` actually kills it ([@zudojs/feature-flags](https://zudojs.oyinlola.site/docs/packages-feature-flags.md)). `@zudojs/observability` redacts `password`, `token`, `authorization` and the rest from log contexts and span attributes by default ([@zudojs/observability](https://zudojs.oyinlola.site/docs/packages-observability.md)). `login()` normalizes the identifier before looking the user up ([@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md)), and cookie `Domain` and `Path` values are validated before they reach a header ([@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md)).

Hostile input refused at the edge

The RPC server and every API binding refuse a `__proto__`, `constructor` or `prototype` key anywhere in their input, using the new `findUnsafeKey()` from `@zudojs/security`. `createApiFetchHandler` answers `415` to a non-JSON body route even when the body is empty, so a cross-site HTML form cannot trigger an operation. `mountFetchHandler`’s `origin` option now pins the origin instead of letting the client’s `Host` header choose it, and a router group’s OpenAPI defaults no longer publish routes marked hidden. Input nested too deep is a `400` the client can see rather than a hidden `500` ([@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md)).

### Behaviour changes to act on

Each of these changes what existing code sees. Most fix a bug that made a failure look like success, but code written against the old behaviour will notice. The full entries are in the package notes below.

| Package | What changed | What to do |
| --- | --- | --- |
| [`permissions`](https://zudojs.oyinlola.site/docs/packages-permissions.md) | A policy no longer grants without `effect: "grant"`; an allow only means “no objection”. | Add `effect: "grant"` to policies that establish a right on their own (an ownership check), or pass `defaultPolicyEffect: "grant"`. |
| [`feature-flags`](https://zudojs.oyinlola.site/docs/packages-feature-flags.md) | A flag that is off serves `offValue` (default `false` for booleans), not `defaultValue`. Environment-provider keys are normalised (`FEATURE_NEW_CHECKOUT` → `new-checkout`). | Declare `offValue` if a killed flag must stay on; `keyFormat: "preserve"` for the old keys. |
| [`observability`](https://zudojs.oyinlola.site/docs/packages-observability.md) | Redaction is on by default. | Pass `redaction: false` only if you really need raw values exported. |
| [`queue`](https://zudojs.oyinlola.site/docs/packages-queue.md), [`scheduler`](https://zudojs.oyinlola.site/docs/packages-scheduler.md) | Pending jobs, a started `Worker` and a started scheduler keep the Node.js process alive. The queue’s default serializer preserves types (a `Date` stays a `Date`), and a delayed job no longer jumps the line. | Call `stop()` / `close()` at shutdown, or pass `keepAlive: false`; `preserveTypes: false` for plain JSON payloads. |
| [`rpc`](https://zudojs.oyinlola.site/docs/packages-rpc.md) | `error.code` on every client error is the wire code (`RPC_TIMEOUT`, not `ERR_RPC_TIMEOUT`), and exposed errors keep their meaning (`RPC_NOT_FOUND`, `RPC_CONFLICT` …) instead of `RPC_INTERNAL_ERROR`. | Match on the `RPC_*` codes; `instanceof` checks are unchanged. |
| [`storage`](https://zudojs.oyinlola.site/docs/packages-storage.md) | Lock acquire timeouts are `409` and connection/pool timeouts `503` (both were `504`). `create()`/`update()` skip `undefined` properties instead of writing `NULL`. | Update status-code checks; send `null` explicitly to clear a column. |
| [`http`](https://zudojs.oyinlola.site/docs/packages-http.md) | An error thrown in the middleware pipeline propagates unwrapped, so code after `await next()` runs only if it catches. | Check `instanceof` directly instead of unwrapping `.cause` / `.errors`. |
| [`logger`](https://zudojs.oyinlola.site/docs/packages-logger.md) | `entry.message` is the raw message; the formatted line is in `entry.formatted`. An unknown level name throws. | Custom transports print `entry.formatted ?? entry.message` (or use `formatTransportLine`). |
| [`auth`](https://zudojs.oyinlola.site/docs/packages-auth.md) | `ERR_ACCOUNT_LOCKED`, `ERR_ACCOUNT_DEACTIVATED` and `ERR_TOKEN_REVOKED` replace `ERR_FORBIDDEN`; a revoked token is `401`, not `403`. | Update clients that match on codes or statuses; use `normalizeLoginIdentifier()` at registration. |
| [`api`](https://zudojs.oyinlola.site/docs/packages-api.md) | Interceptors run before validation, so `context.input` is the raw input. | Don’t trust `context.input`’s shape inside an interceptor. |
| [`openapi`](https://zudojs.oyinlola.site/docs/packages-openapi.md) | No invented `200`: an operation with no documented responses gets `default` “Undocumented response” and a warning. | Declare the responses each route returns, then regenerate checked-in specs. |
| [`testing`](https://zudojs.oyinlola.site/docs/packages-testing.md) | `createTestApplication()` logs to a silent spy and pins its clock to 2026-01-01. | Pass `logger`, `clock` or `startTime` if a test relied on output or wall-clock time. |
| [`cqrs`](https://zudojs.oyinlola.site/docs/packages-cqrs.md), [`events`](https://zudojs.oyinlola.site/docs/packages-events.md), [`messaging`](https://zudojs.oyinlola.site/docs/packages-messaging.md), [`transactions`](https://zudojs.oyinlola.site/docs/packages-transactions.md) | Failures that used to look like success now throw: `unwrapCommandResult`/`unwrapQueryResult` on a failure, an abort during the last handler, committing a rollback-only transaction (`TransactionRollbackOnlyError`), rolling back a committed one. | Handle the new errors where you relied on the old silent result. |
| [`config`](https://zudojs.oyinlola.site/docs/packages-config.md), [`container`](https://zudojs.oyinlola.site/docs/packages-container.md), [`runtime`](https://zudojs.oyinlola.site/docs/packages-runtime.md) | NUMBER/BOOLEAN schemas coerce env strings and `validate` runs after `transform`; auto-registration refuses classes with required constructor parameters; `start()` enters every state and `failed` is no longer terminal. | `coerce: false` for strict config; register such classes with an `inject` list. |
| [`schema`](https://zudojs.oyinlola.site/docs/packages-schema.md), [`validation`](https://zudojs.oyinlola.site/docs/packages-validation.md), [`database`](https://zudojs.oyinlola.site/docs/packages-database.md), [`cache`](https://zudojs.oyinlola.site/docs/packages-cache.md) | Absent optional keys stay absent and `partial()` no longer applies defaults; impossible dates are rejected; too-deep input and bad pagination cursors are `400`s; an invalid cache tag is `ERR_INVALID_INPUT`. | Check code that expected an own `undefined` key or a default in an update schema. |

> **Upgrading:** read the table above first — the permissions, feature-flag and observability rows change what your application allows, serves and exports, and the queue and scheduler rows change when a script exits. Projects created by an earlier CLI depend on `^1.0.0`, so `pnpm update` (or `npm update`) picks these releases up. To get the new CLI, run `npm install -g zudojs`; a project it creates depends on a caret range of the exact versions it was built against (for example `^1.4.0` for `@zudojs/http`), so it can never resolve to a release that lacks the APIs its generated code uses. Full notes: [per-package notes](#packages).

## WHAT’S NEW — ZUDOJS-CLI 2.0.0 (SEPTEMBER 2026)

A release for one package. `zudojs-cli` was audited on its own — 55 findings, all fixed, each with a regression test that fails against the unfixed code — and ships as **2.0.0**, the first major in the ecosystem. It is a major because several commands now refuse where they previously proceeded, and an interrupted run now exits 130 instead of 0. In every case the old behaviour was a bug that could make a broken run look successful: a project with no `node_modules` reported as created, another project’s build reported as yours, a cancelled scaffold that finished anyway. A script or CI job written against the old behaviour will notice. No other package changed in this release; the rest of the monorepo is as described in the round 11 notes below.

A failed dependency install now exits non-zero

`zudojs create` used to downgrade an install failure to a warning, then print “Project created successfully” and exit 0, so a CI job went green with no `node_modules`. That job will now correctly go red. The project is still kept and the retry hint is still printed; only the exit code and the closing message changed. `zudojs add` already behaved this way — the two commands no longer disagree.

`zudojs build` refuses outside a Zudojs project

`findProjectRoot` accepted any ancestor holding a bare `package.json`, so from an unrelated subdirectory the CLI climbed out and executed that project’s `scripts.build` — content from a file on disk — then reported success. It now requires a real Zudojs project and throws `CLINotInProjectError` otherwise. `zudojs generate` throws in the same situation instead of warning and writing files into the current directory, matching `dev`, `build` and `add`; it also walks up to the project root, so running it from a subdirectory no longer creates a second `src/` tree.

Ctrl-C is honoured

`@clack/prompts` registers a SIGINT listener per spinner that only prints “Canceled”, which suppressed Node’s default termination — so an interrupted `zudojs create` used to run to completion and exit 0. An interrupt now rolls the scaffold back and exits 130, and a cancelled prompt exits 130 rather than 0. `zudojs create my-api && cd my-api` no longer runs the `cd` after you pressed Ctrl-C.

New projects contain what you asked for

`zudojs create` invented example domains when no service list was given — four for a microservice project (`identity`, `enrollment`, `assessment`, `notification`) and three for a modular monolith, which was never even asked. An empty list now means no services: a microservice project gets its gateway, a modular monolith gets an empty module barrel, and both READMEs say how to add one. Ticking “Security” in the capabilities prompt now actually installs `@zudojs/security`; the prompt offered eight options and the command read six, so `events` and `security` were silently discarded — no dependency, no manifest entry, no message. A new `--capabilities <list>` flag makes the interactive and non-interactive branches produce the same project.

The first commands you run in a new project work

`pnpm run test` passes in a freshly created project: the sample spec was `tests/index.ts`, which matches no vitest include pattern, so the first thing you ran exited 1. It is now `tests/app.test.ts`. Per-command help works — `zudojs create --help` prints usage, arguments, options, shorts and defaults instead of rejecting `--help` as an invalid option. And generated projects install the resolved version range rather than `latest`: the frontend install path resolved every dependency to a pinned range and then passed only the names to the package manager, so two `zudojs create --frontend react` runs a month apart produced different majors.

Not verified on Windows

The `cmd.exe` quoting hardening — an argument containing `"`, `%` or `!` is now rejected rather than escaped, because a backslash is not a `cmd` escape — and `NoDefaultCurrentDirectoryInExePath` were tested as pure functions on Linux by passing `"win32"` explicitly. They have not been exercised on a real Windows host.

> **Upgrading:** only `zudojs-cli` changed — every `@zudojs/*` package is still at its round 11 version, and an existing project needs no code change. What breaks is anything that reads the CLI’s exit code. `zudojs create` now exits `1` when dependency installation fails, where it exited `0` with a warning, and exits `130` when a prompt is cancelled or the run is interrupted, where it exited `0` after finishing anyway. `zudojs build` and `zudojs generate` exit `1` outside a Zudojs project instead of proceeding. A chain such as `zudojs create my-api && cd my-api`, and any CI step that trusted a `0`, will now stop where it used to continue; that is the point. Check scripted names too: a project name must start with a letter or digit, and a schematic name may not start with a digit, so `zudojs generate module 2fa` is rejected rather than writing a syntax error into `src/app.ts` and exiting `0`. Two API changes affect embedders only: `RollbackManager.rollback()` returns a `RollbackResult` instead of `void`, and `CapabilityResolutionResult.conflicts` is gone. Full notes: [zudojs-cli 2.0.0](#pkg-cli).

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
| `@zudojs/adapters` | `1.2.1` | [Jump to notes](#pkg-adapters) |
| `@zudojs/api` | `1.2.0` | [Jump to notes](#pkg-api) |
| `@zudojs/auth` | `1.3.0` | [Jump to notes](#pkg-auth) |
| `@zudojs/auth-oauth` | `1.2.2` | [Jump to notes](#pkg-auth-oauth) |
| `@zudojs/cache` | `1.2.0` | [Jump to notes](#pkg-cache) |
| `zudojs-cli` | `2.1.0` | [Jump to notes](#pkg-cli) |
| `@zudojs/config` | `1.3.0` | [Jump to notes](#pkg-config) |
| `@zudojs/constants` | `1.1.2` | [Jump to notes](#pkg-constants) |
| `@zudojs/container` | `1.2.0` | [Jump to notes](#pkg-container) |
| `@zudojs/core` | `1.2.2` | [Jump to notes](#pkg-core) |
| `@zudojs/cqrs` | `1.2.0` | [Jump to notes](#pkg-cqrs) |
| `@zudojs/crypto` | `1.3.1` | [Jump to notes](#pkg-crypto) |
| `@zudojs/database` | `1.3.0` | [Jump to notes](#pkg-database) |
| `@zudojs/docs` | `1.0.4` | [Jump to notes](#pkg-docs) |
| `@zudojs/errors` | `1.3.0` | [Jump to notes](#pkg-errors) |
| `@zudojs/events` | `1.3.0` | [Jump to notes](#pkg-events) |
| `@zudojs/feature-flags` | `1.4.0` | [Jump to notes](#pkg-feature-flags) |
| `@zudojs/http` | `1.4.0` | [Jump to notes](#pkg-http) |
| `@zudojs/lifecycle` | `1.2.1` | [Jump to notes](#pkg-lifecycle) |
| `@zudojs/logger` | `1.4.0` | [Jump to notes](#pkg-logger) |
| `@zudojs/messaging` | `1.2.0` | [Jump to notes](#pkg-messaging) |
| `@zudojs/middleware` | `1.1.0` | [Jump to notes](#pkg-middleware) |
| `@zudojs/observability` | `1.2.0` | [Jump to notes](#pkg-observability) |
| `@zudojs/openapi` | `1.5.0` | [Jump to notes](#pkg-openapi) |
| `@zudojs/permissions` | `1.4.0` | [Jump to notes](#pkg-permissions) |
| `@zudojs/plugins` | `1.3.0` | [Jump to notes](#pkg-plugins) |
| `@zudojs/queue` | `1.4.0` | [Jump to notes](#pkg-queue) |
| `@zudojs/rpc` | `1.4.0` | [Jump to notes](#pkg-rpc) |
| `@zudojs/runtime` | `1.3.0` | [Jump to notes](#pkg-runtime) |
| `@zudojs/scheduler` | `1.2.0` | [Jump to notes](#pkg-scheduler) |
| `@zudojs/schema` | `1.2.0` | [Jump to notes](#pkg-schema) |
| `@zudojs/security` | `1.3.0` | [Jump to notes](#pkg-security) |
| `@zudojs/serialization` | `1.2.0` | [Jump to notes](#pkg-serialization) |
| `@zudojs/storage` | `1.2.0` | [Jump to notes](#pkg-storage) |
| `@zudojs/tenancy` | `1.3.0` | [Jump to notes](#pkg-tenancy) |
| `@zudojs/testing` | `1.2.0` | [Jump to notes](#pkg-testing) |
| `@zudojs/transactions` | `1.2.0` | [Jump to notes](#pkg-transactions) |
| `@zudojs/types` | `1.2.0` | [Jump to notes](#pkg-types) |
| `@zudojs/validation` | `1.1.0` | [Jump to notes](#pkg-validation) |
| `zudojs` | `1.0.1` | [Jump to notes](#pkg-zudojs) |

### `@zudojs/adapters` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-adapters.md)

v1.2.1 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`.

Previous release — v1.2.0

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

### `@zudojs/api` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-api.md)

v1.2.0 — Minor Changes

- One operation, four transports, all through the same executor, interceptors and schema validation, with one client-safe error shape (`APIWireError`):
    - HTTP: `createApiFetchHandler(operations)`, a web-standard fetch handler. Routes come from `metadata.http` (`{ method, path: "/users/:id" }`) and default to `POST /<name>`.
    - RPC: `registerApiRpcProcedures(server, operations)`. Queues: `bindApiQueue(queue, operations)`. CLI: `runApiCli(operations, argv)`, which parses `--field value` and `--json` and returns a sysexits-style exit code.
    - `describeApiRoutes` returns the structural `APIOperationRoute` contract, and `toOpenAPIRouteDescriptors(operations, { basePath })` feeds `@zudojs/openapi`'s `createOpenAPIDocumentFromRoutes`, success and error envelopes included. Both fetch handlers mount on `@zudojs/http` with `mountFetchHandler(router, "/api", handler)`. `TransportContextKey` tells an interceptor which binding a call came through.
- **Security, behaviour change:** `APIExecutor` runs the interceptors *before* input validation; validation is the innermost step, immediately before the handler. Before, an anonymous call with invalid input got a `422` describing the schema instead of the `401` its authentication interceptor would have returned, logging/metrics/rate-limit interceptors never saw invalid calls, and an interceptor that replaced `context.input` bypassed the schema. `context.input` is now the input as the caller sent it, and a replacement is validated before the handler runs.
- The handler's `context.signal` aborts when the operation times out (reason: the `504` `APITimeoutError`) or the caller aborts (reason: `OPERATION_CANCELLED`). Every handler now receives a signal, even when the caller supplied none; before, the executor stopped waiting but the handler kept running.
- `defineOperation` infers the handler's `input` from the `input` schema (Standard Schema output type, or a `safeParse` schema's `data`), so inline `registry.register(defineOperation({ input: TodoInput, handler: async (input) => input.title }))` compiles. New types `InferAPISchemaOutput`, `APIInputSchema`, `DefineOperationWithSchemaOptions`.
- Hardening: every binding refuses `__proto__` / `constructor` / `prototype` keys in its input (400 over HTTP, a validation error elsewhere); the RPC binding no longer sends the message of an `expose: false` error; `createApiFetchHandler` answers `415` to a body route called with a non-JSON content type even when the body is empty, so a cross-site HTML form cannot trigger an input-less operation.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/auth` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth.md)

v1.3.0 — Minor Changes

- `AccountLockedError` (423) and `AuthRateLimitError` (429) carry `retryAfterSeconds` and a `Retry-After` header, which `@zudojs/http` copies onto the response; for a lockout it is the time left on the lock.
- **Behaviour change for clients that match codes:** `AccountLockedError` is `ERR_ACCOUNT_LOCKED`, `AccountDeactivatedError` is `ERR_ACCOUNT_DEACTIVATED` and `TokenRevokedError` is `ERR_TOKEN_REVOKED`; all three used to be `ERR_FORBIDDEN`. **`TokenRevokedError` is now `401` instead of `403`**, since the client has to authenticate again.
- Security: `login()` normalizes the identifier before `findUser()` sees it (NFKC, trim, and lower-case for an email address). Use the new `normalizeLoginIdentifier()` at registration so both sides agree; `normalizeIdentifier: false` passes the raw string.
- New `createSessionForUser(userId, { method, ... })` issues a session for a user authenticated outside `login()`, such as an OAuth callback. It is off by default: `method` must be listed in the new `externalSessionMethods` option.
- `needsRehash()` returns `false` for a hash made with `@zudojs/crypto`'s own `hashPassword()` defaults, which it used to flag on every login.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/permissions@1.3.0`, `@zudojs/crypto@1.3.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/auth-oauth` v1.2.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md)

v1.2.2 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`, `@zudojs/security@1.3.0`.

Previous release — v1.2.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/security@1.2.0`.

### `@zudojs/cache` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cache.md)

v1.2.0 — Minor Changes

- **Behaviour change:** an invalid tag (`tags: [""]`, over-long, or containing NUL) throws `ERR_INVALID_INPUT`, the same code as an invalid key, instead of `CACHE_OPERATION_FAILED`.
- `getStats().errors` counts rejected input: an invalid key, namespace, pattern or tag now counts and emits `cache.error`. `failSilently` still never hides invalid input.
- `ttl()` returns whole milliseconds, rounded down (it returned values like `9999.52…`). The README no longer mentions a `CACHE_INVALID_KEY` code that was never thrown.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- Cache and database correctness fixes.
    - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
    - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
    - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
    - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

### `zudojs-cli` v2.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cli.md)

v2.1.0 — Minor Changes

- **Projects work out of the box.** `src/server.ts` builds a router (`registerRoutes`), serves `/openapi.json` and `/docs` when the openapi capability is on, applies `@zudojs/security` headers, closed-by-default CORS and rate limiting, and shuts down integrations → HTTP → runtime. Typed env config in `src/configs`, a composition root in `src/container.ts`, an example `/api/v1/examples` CRUD resource and a `createHttpTestClient` test. Same wiring in modular-monolith modules and every microservice app.
- **`zudojs generate resource <name>`** writes a DTO, repository (in-memory, or Prisma when the app has it), service, controller, CRUD routes with OpenAPI metadata and a test, registered between `// zudojs:*` markers. `route`, `controller`, `repository` and `dto` write their layer plus any missing lower ones; `--force` rewrites.
- **`zudojs add`** writes real integrations: `database` (alias `postgres`/`prisma`; Prisma 7), `redis`, `websockets`, `email`, `docker`, plus `queue`, `scheduler`, `cache`, `messaging`, `observability`, `storage`, `openapi`. `docs` and `security` are refused with an explanation.
- Generators add the `@zudojs/*` packages they import to the owning `package.json`, and camelCase names keep their word boundaries (`createBook` → `create-book`).
- **`zudo` is an alias binary**, `new` is an alias of `create`, and running with no arguments in a terminal opens a numbered menu (never in CI or pipes). The `zudojs` npm package installs the CLI: `npm install -g zudojs`.
- Parser fixes: only the first word selects a command; options before the command, `--port=` and non-finite numbers are usage errors (exit 2); unknown commands exit 3 with "did you mean"; `--__proto__`-style options are refused.
- `@zudojs/*` ranges in generated projects match this CLI build, and frontend fallbacks move to current majors (Vite 8, React 19.3, Next 16, Nuxt 4, Astro 7, Angular 22, SvelteKit 2.70); backends get TypeScript 7, Vitest 5 and @types/node 26.

Previous release — v2.0.1

Patch Changes — 2.0.1

- Fixes the README generated for a microservice project with no services, which told the reader to run a command 2.0.0 refuses. `zudojs generate service` is refused in a microservice project — a service there is a whole workspace app, which the schematic does not produce — but the generated README still said “No services yet. Add one with: `npx zudojs generate service <name>`”, so the first thing a new project asked you to do failed. It now points at `zudojs create <project> --architecture microservice --services <name>` and `zudojs generate module <name> --service <existing-service>`.

Major Changes — 2.0.0

- A full audit of the CLI: 55 findings, all fixed, each with a regression test that fails against the unfixed code. Read this before upgrading — several commands now refuse where they previously proceeded. In every case the old behaviour was a bug, but a script or CI job written against it will notice.
    - **Breaking —** **a failed dependency install now exits non-zero.** `zudojs create` used to downgrade an install failure to a warning and then print “Project created successfully” and exit 0, so a CI job went green with no `node_modules`. The project is still kept and the retry hint is still printed; only the exit code and the closing message changed. `zudojs add` already behaved this way — the two commands no longer disagree.
    - **Breaking —** **`zudojs build` refuses outside a Zudojs project.** `findProjectRoot` accepted any ancestor holding a bare `package.json`, so from an unrelated subdirectory the CLI climbed out and executed that project’s `scripts.build` — content from a file on disk — then reported success. It now requires a real Zudojs project and throws `CLINotInProjectError` otherwise.
    - **Breaking —** **`zudojs generate` outside a project throws** instead of warning and writing files into the current directory, matching `dev`, `build` and `add`. It also walks up to the project root, so running it from a subdirectory no longer creates a second `src/` tree.
    - **Breaking —** **cancelling a prompt exits 130**, not 0. `zudojs create my-api && cd my-api` no longer runs the `cd` after you pressed Ctrl-C. Ctrl-C mid-scaffold is now honoured at all — `@clack/prompts` registers a SIGINT listener per spinner that only prints “Canceled”, which suppressed Node’s default termination, so the run used to continue to completion; it now rolls back and exits 130.
    - **Breaking —** **`CLI_ENVIRONMENT` no longer carries `NODE_ENV` or `DEBUG: "DEBUG"`.** Nothing read either, and honouring a bare `DEBUG` would have changed behaviour. It now names the four variables the CLI really reads: `ZUDOJS_DEBUG`, `CI`, `NO_UPDATE_CHECK`, `NPM_OFFLINE`.
    - **Breaking —** `RollbackManager.rollback()` returns a `RollbackResult` instead of `void`, and `CapabilityResolutionResult.conflicts` is gone — it was structurally incapable of being non-empty.
    - **Breaking —** a project name must now start with a letter or digit. `zudojs create -- --weird` used to create a directory `cd` could not enter and `rm -rf` could not remove.
    - **Breaking —** a schematic name may no longer start with a digit. `zudojs generate module 2fa` used to write `import { 2faModule } …` into your existing `src/app.ts` — a syntax error in the entry point — and exit 0.
    - **Breaking —** the printed app name is now `zudojs` rather than `Zudojs`, so usage lines show the command you type.
    - **New projects no longer arrive with services nobody asked for.** `zudojs create` invented example domains when no service list was given — four for a microservice project (`identity`, `enrollment`, `assessment`, `notification`) and three for a modular monolith. A modular monolith was never even asked. An empty list now means no services: a microservice project gets its gateway, a modular monolith gets an empty module barrel, and both READMEs say how to add one. Named services are generated exactly as named.
    - **`generate service` now works in every architecture.** It was broken in all three. In a monolith it wrote to `src/<name>/` while the template’s services live in `src/services/`; it now nests under the template’s directory. In a modular monolith it logged `Mapping "service" → "module"` and then did not, producing four inert files the runtime never loaded; the mapping is now real and the module is registered in `app.ts`. In a microservice project it created an app directory with no `package.json`, so pnpm skipped it and `pnpm -r run build` never compiled it; it now refuses and names the two commands that do work.
    - **Generated projects pinned `latest`.** The frontend install path resolved every dependency to a pinned range and then passed only the names to the package manager, so two `zudojs create --frontend react` runs a month apart produced different majors. The resolved range is now installed, and the resolver’s “no version range known” warnings are no longer discarded.
    - **Ticking “Security” did nothing.** The capabilities prompt offered eight options and the command read six; `events` and `security` were silently dropped — no dependency, no manifest entry, no message. Both are now consumed. A new `--capabilities <list>` flag makes the interactive and non-interactive branches produce the same project.
    - **Writes could escape the project through a symlink.** Path containment was checked on the literal string only, so a symlinked subdirectory sent generated files to the symlink’s target. Containment is now re-checked after resolving the real path.
    - **`zudojs doctor`’s feature check could never fail** — the templates hardcoded `zudojs.features: []`. They now record the real capability list and install the packages backing it. The modular-monolith template ignored the `enable*` flags entirely, so `--database` installed nothing.
    - **`pnpm run test` failed in a brand-new project.** The sample spec was `tests/index.ts`, which matches no vitest include pattern, so the first thing you ran exited 1. It is now `tests/app.test.ts`.
    - **The manifest is now durable.** It is written atomically, serialized by a lock so concurrent `zudojs add` runs cannot lose an update, validated on read, and a corrupt manifest is reported distinctly from a missing one. `add` reads and validates it before touching any `package.json`, so a failure can no longer leave the project half-updated.
    - **A framework scaffolder is no longer killed at 120 s** and silently replaced by the built-in fallback template; it gets 15 minutes, the failure says whether it timed out, and the child’s real stderr is shown.
    - Per-command help works: `zudojs create --help` prints usage, arguments, options, shorts and defaults, instead of rejecting `--help` as an invalid option.
    - A flag-shaped token is no longer swallowed as an option value, so `--type --frontend react` names the right problem. Surplus positionals are reported by every command. All four registries throw on a duplicate registration rather than silently replacing the earlier entry.
    - **Not verified on Windows.** The `cmd.exe` quoting hardening (arguments containing `"`, `%` or `!` are now rejected rather than escaped, because a backslash is not a cmd escape) and `NoDefaultCurrentDirectoryInExePath` were tested as pure functions on Linux by passing `"win32"` explicitly. They have not been exercised on a real Windows host.

Previously — v1.2.1 (round 11)

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

### `@zudojs/config` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-config.md)

v1.3.0 — Minor Changes

- **Behaviour change:** NUMBER and BOOLEAN schemas accept values from environment variables. String input is coerced before the type check, strictly and in decimal (`"8080"` passes; `"80a"`, `"0x1F90"` and `""` do not); booleans accept `true`/`false`, `1`/`0`, `yes`/`no`, `y`/`n`, `on`/`off`. Set the new schema option `coerce: false` for the old strict behaviour.
- **Behaviour change:** `validate` receives the final value. The order is coerce, type check, constraints, `transform`, then `validate`, which matches its `(value: T)` signature.
- A typed getter called with a fallback returns `T` instead of `T | undefined`, and `get(key, fallback)` is a new overload (its literal fallback is widened through `ConfigWiden<T>`).
- `ScopedConfigResolver` and `ConfigManager` gain `requiredString`, `requiredNumber`, `requiredBoolean` and `requiredDate`. `resolve()` and `resolveResult()` take a `TypedConfigSchema<T>`, so each type accepts exactly the constraints the validator enforces.
- `store.getByPrefix("db.")` and `getObjectByPrefix("db.")` ignore the trailing dot; they returned nothing before.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.0

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

### `@zudojs/constants` v1.1.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-constants.md)

v1.1.2 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`.

Previous release — v1.1.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/container` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-container.md)

v1.2.0 — Minor Changes

- `registerFactory`, `factoryProvider` and `provideFactory` infer the factory's parameter types from the `inject` list (new `InjectedDependencies<Deps>` and `InjectedFactory<T, Deps>`). **Behaviour change:** a factory that declares more parameters than its inject list supplies is a compile error.
- **Behaviour change:** `autoRegisterClasses` only auto-registers a class whose constructor has no required parameters. `resolve(NeedsDep)` used to build it silently with `dep = undefined`; it now throws `RegistrationNotFoundError` explaining how to register it.
- Error messages and default registration names show a symbol token by its description (`MissingService`, not `Symbol(MissingService)`).
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.2

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

### `@zudojs/core` v1.2.2

[Package documentation](https://zudojs.oyinlola.site/docs/packages-core.md)

v1.2.2 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`, `@zudojs/constants@1.1.2`.

Previous release — v1.2.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/cqrs` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cqrs.md)

v1.2.0 — Minor Changes

- **Behaviour change:** `unwrapCommandResult()` throws `CommandFailedError` for a result whose status is `"failure"`, and `unwrapQueryResult()` throws `QueryFailedError`, instead of returning the failure payload as if it were the value. The payload is on `error.failure` and `error.cause`; both errors are re-exported.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/events@1.2.0`, `@zudojs/middleware@1.0.3`.

### `@zudojs/crypto` v1.3.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-crypto.md)

v1.3.1 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`, `@zudojs/constants@1.1.2`.

Previous release — v1.3.0

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

### `@zudojs/database` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-database.md)

v1.3.0 — Minor Changes

- Caller errors pass through transactions: a `@zudojs/errors` `BaseError` that is not a `DatabaseError` (`NotFoundError`, `ValidationError` …) still rolls back, but is rethrown as the same instance instead of being wrapped in a `500` `DatabaseError`. New `isNonDatabaseBaseError(error)`.
- **Behaviour change:** a missing, forged, tampered or malformed cursor throws a `400` `ValidationError` (one issue on `cursor`) instead of a `TypeError` that surfaced as a `500`.
- `paginateCursor` sets `meta.previousCursor` and accepts it to page backward. New `getKeysetDirection`, `keysetFetchSort`, `reverseKeysetSort`, `KEYSET_BACKWARD_KEY`.
- The reconnect back-off wait keeps a script alive, and `disconnect()` / `destroy()` cancel an in-progress reconnect.
- `PrismaClientLike` accepts a real Prisma 7 client generated into the application, without an `as unknown as` cast.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.1

Patch Changes

- Cache and database correctness fixes.
    - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
    - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
    - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
    - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

### `@zudojs/docs` v1.0.4

[Package documentation](https://zudojs.oyinlola.site/docs/packages-docs.md)

v1.0.4 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`.

Previous release — v1.0.3

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

### `@zudojs/errors` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-errors.md)

v1.3.0 — Minor Changes

- New error classes:
    - `CommandFailedError` and `QueryFailedError` (codes `ERR_COMMAND_FAILED`, `ERR_QUERY_FAILED`), thrown by `@zudojs/cqrs`'s `unwrapCommandResult()` / `unwrapQueryResult()`.
    - `EventBusStoppedError`, moved here from `@zudojs/events`; `EventBusDisposedError`'s code is now `ERR_EVENT_BUS_DISPOSED` (was `ERR_LIFECYCLE_DISPOSED`).
    - `TransactionRollbackOnlyError extends TransactionRollbackError`, for a commit refused because the transaction was marked rollback-only. `TransactionRollbackError` accepts an optional `message`.
- New codes `ErrorCode.TOKEN_REVOKED`, `ACCOUNT_LOCKED` and `ACCOUNT_DEACTIVATED`, used by `@zudojs/auth`, plus `COMMAND_FAILED` and `QUERY_FAILED`.
- `SerializationDepthError` takes an optional third argument `{ statusCode?, expose? }`; without it it is still an unexposed `500`. `@zudojs/validation`'s depth guards now pass `400` / `expose: true`.
- `SchemaError` is generic (`SchemaError<TIssue = unknown>`, likewise `SchemaErrorOptions` and `createSchemaError`); the default keeps existing code unchanged.
- `RPCError` declares a readonly `details` and accepts it as an option.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.0

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

### `@zudojs/events` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-events.md)

v1.3.0 — Minor Changes

- **Behaviour change:** in sequential dispatch, aborting the publish `signal` while the last or only handler runs rejects with `EventDispatchAbortedError`; it used to resolve with `handled: true`.
- A handler's `timeoutMs` aborts the `context.signal` that handler received, with the `EventTimeoutError` as the reason.
- `bus.use()` accepts registered middleware from `createEventMiddleware()` and helpers such as `validateEventMiddleware()`.
- `EventBusStoppedError` and `EventBusDisposedError` come from `@zudojs/errors` and are re-exported, so `instanceof` works from either import. `EventBusDisposedError`'s code is `ERR_EVENT_BUS_DISPOSED`.
- `EventPublishResult.errors` and `EventEmitResult.errors` are typed `readonly EventHandlerError[]`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.0

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

### `@zudojs/feature-flags` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-feature-flags.md)

v1.4.0 — Minor Changes

- **Behaviour change (security): the kill switch fails closed.** A flag that is off — `enabled: false`, `state: "disabled"` (not honoured at all before), a draft, archived, expired, or blocked by a dependency — serves its new optional `offValue`; without one, `false` for a boolean flag, or `defaultValue` for other types. Before, a killed flag with `defaultValue: true` stayed on. Declare `offValue: true` if you relied on that.
- **Behaviour change:** `createEnvironmentProvider` normalises keys, so `FEATURE_NEW_CHECKOUT=true` is the flag `new-checkout`. `get("NEW_CHECKOUT")` still works; pass `keyFormat: "preserve"` for the old spelling.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

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

### `@zudojs/http` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-http.md)

v1.4.0 — Minor Changes

- **Guard responses are honoured.** The router, `HttpMiddlewarePipeline` and `RouteDispatcher` send a `@zudojs/middleware` guard response with its status, headers and JSON body. A route middleware that returned a plain `{ status, body, headers }` object used to be ignored, so `authorize()` and the tenancy guards refused requests that clients saw as `200`. New helpers `applyGuardResponse` and `guardResponseToContext`; `@zudojs/http` now depends on `@zudojs/middleware`.
- **OpenAPI from routes.** Routes take an `openapi` option, and `generateOpenAPIDocument(router, options)`, `createRouterOpenAPI` and `mountOpenAPI` (serves `/openapi.json`, optional YAML and a docs page at `/docs`) build the document from the routes the router actually registered. `mountFetchHandler(router, basePath, handler)` serves a web-standard `(Request) => Response` handler; `toWebRequest` is exported on its own.
- `request.id` reuses an incoming `x-request-id` of 1–128 characters of `[A-Za-z0-9._:-]` (opt out with `trustRequestId: false`; `resolveIncomingRequestId()` is exported), and the request guard's default `requestIdPattern` matches that rule.
- `HttpClient` retries a timed-out request for methods in `retryMethods` (default `GET`, `HEAD`, `OPTIONS`) under the new `retryOnTimeout`, with full-jitter backoff; `jitter: false` waits exactly the delay.
- Route handlers may return a plain JSON value (sent as `200`); route params are set before route middleware runs; `createRateLimitMiddleware`'s `429` is JSON and always has `Retry-After`; `createHttpServer` takes typed `HttpServerOptions`; `new HttpError(415, msg)` gets its code from the status (new `defaultErrorCode(status)`).
- **Behaviour change:** an error thrown in the middleware pipeline propagates as the error that was thrown, not wrapped in `HttpMiddlewareError` / `HttpMiddlewarePipelineError`, so `instanceof NotFoundError` works in an outer middleware and in `errorHandler`.
- Fixes: `RequestContextInit.signal` is honoured (the Node adapter aborts it on client disconnect); multiple `Set-Cookie` headers from a returned `Response` are no longer folded into one; a streamed body is cancelled when the client disconnects. Security review: `mountFetchHandler`'s `origin` option pins the origin instead of trusting `Host`, and a group's `openapi` defaults no longer publish hidden routes.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

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

### `@zudojs/lifecycle` v1.2.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-lifecycle.md)

v1.2.1 — Patch Changes

- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Republished against `@zudojs/errors@1.3.0`, `@zudojs/constants@1.1.2`.

Previous release — v1.2.0

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

### `@zudojs/logger` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-logger.md)

v1.4.0 — Minor Changes

- `entry.message` is again the raw message a transport receives; the formatter's rendering is in the new `entry.formatted`. **Custom transports that printed `entry.message` to get the formatted line should print `entry.formatted ?? entry.message`**, or use the new `formatTransportLine(entry)`.
- The console transport prints the formatted line instead of a record object; with `createStructuredLoggerFormatter()` it prints one JSON line per record (new `toJsonLogLine(record)`).
- Level names are accepted in any case wherever a level is configured: `createLogger({ level: "error" })`, `setLevel("DEBUG")`, `child({ level: "trace" })` (type `LoggerLevelLike`, new `resolveLoggerLevel()`). An unknown level now throws instead of silently disabling output.
- An `Error` passed as the second argument of a level method (`logger.error("failed", err)`) is logged as the entry's error with its stack instead of being dropped.
- `createTextLoggerFormatter({ includeStackTrace: false })` hides stacks everywhere, including an `Error` inside metadata.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

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

### `@zudojs/messaging` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-messaging.md)

v1.2.0 — Minor Changes

- **Behaviour change:** an abort during the last or only handler fails the dispatch with `MessageDispatchAbortedError` (`success: false`); it used to report `success: true`.
- `send(input, { context: { correlationId, causationId } })` puts those identifiers on the message it builds, so `createDerivedMessage` continues the chain.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.0

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

### `@zudojs/middleware` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-middleware.md)

v1.1.0 — Minor Changes

- New guard-response contract: `createGuardResponse({ status, body?, headers? })`, `isGuardResponse()`, the `GuardResponse` type and the `GUARD_RESPONSE` brand (`Symbol.for("zudojs.middleware.guardResponse")`). A structured body gets `content-type: application/json` by default, and a status outside 100–599 throws `RangeError`. It lets a framework-neutral guard refuse a request with a real `401`/`403` that `@zudojs/http` sends as-is; before, a guard that returned a plain `{ status, body, headers }` object stopped the handler but the client still saw `200`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.0.3

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/observability` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-observability.md)

v1.2.0 — Minor Changes

- **Behaviour change (security): redaction is on by default.** Without a `redaction` option, log contexts and span attributes are redacted, so `password`, `token`, `authorization` and the rest are no longer exported in the clear. The default rules reuse `@zudojs/logger`'s secret-field matcher. Pass `redaction: false` to turn it off.
- `shutdown()` exports the final metric snapshot once instead of twice.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/openapi` v1.5.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-openapi.md)

v1.5.0 — Minor Changes

- Transport-neutral `createOpenAPIDocumentFromRoutes(routes, options)` / `createOpenAPIManagerFromRoutes` over the structural `OpenAPIRouteDescriptor`, plus `OpenAPIManager.setRoutes()` and `routeWarnings()`. Route metadata accepts `@zudojs/schema` or raw schemas for `params`, `query`, `headers`, `cookies`, `body` and response `schema`. Every path template slot is documented even when undeclared, and `security: []` is no longer dropped.
- **Behaviour change:** a route with no documented responses no longer gets an invented `"200": { description: "OK" }`. It gets a spec-valid `default` response described as "Undocumented response" (`UNDOCUMENTED_RESPONSE_DESCRIPTION`) and a warning, sent to `routeWarnings()`, `onSchemaWarning` and the new `onRouteWarning` option. Declare the responses an operation returns to silence it.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.4.0

Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/permissions` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-permissions.md)

v1.4.0 — Minor Changes

- **Security, behaviour change: a policy's allow is no longer a grant.** A policy is by default an extra condition on top of RBAC/ABAC (`effect: "constrain"`): it can deny, but the actor's roles, permissions or rules must still grant the permission. A policy that establishes the right on its own opts in with `effect: "grant"`; `createPermissionEngine({ defaultPolicyEffect: "grant" })` restores the old behaviour. **If you relied on a policy to grant access, those checks now deny until you add `effect: "grant"`.** New `PolicyEffect`, `policyGrants`, `DEFAULT_POLICY_EFFECT`.
- `createForbiddenResponse`, `createUnauthorizedResponse` and `createJsonResponse` — and so `authorize()` and the require-permission middleware — return `@zudojs/middleware` guard responses, which `@zudojs/http` now sends with their real status instead of `200`. `PermissionHttpResponse` is an alias of `GuardResponse`.
- The mirrored `HttpMiddleware` types are generic over what `next()` returns, so every guard fits a route's `middleware` list without `as never`. New `HttpMiddlewareOutcome`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

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

### `@zudojs/plugins` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-plugins.md)

v1.3.0 — Minor Changes

- An async `PluginEvents.emit` that rejects is contained and reported like a synchronous throw instead of becoming an `unhandledRejection` after `start()` resolves.
- An `@zudojs/events` `EventBus` is accepted by `new PluginManager({ events })` and `createPluginContext(meta, { events })`, adapted by the new `toPluginEvents()`. New `isPluginEventBus`, `PluginEventBus`, `PluginEventSource`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/queue` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-queue.md)

v1.4.0 — Minor Changes

- **Behaviour change: process lifetime.** Pending work keeps the Node.js process alive, and a started `Worker` keeps it alive until `stop()`. An idle, paused or closed queue never does. Pass `keepAlive: false` (on `QueueOptions` and `WorkerOptions`) for the old unreferenced timers.
- **Behaviour change: payloads.** The default `JsonSerializer` preserves types, so a `Date` reaches the processor as a `Date`; `BigInt`, `Map`, `Set`, `Uint8Array` and `Error` round-trip too. Pass `preserveTypes: false` for plain JSON.
- **Behaviour change: ordering.** Within a priority, a job is ordered by when it became runnable, so a delayed job no longer jumps ahead of jobs already waiting.
- Work no longer waits for the next poll: `add()` and every other event that makes a job runnable wake the poller at once. New optional `Queue.onJobReady(listener)`, which a `Worker` subscribes to on `start()`. `pollInterval` is honoured on every poll.
- New 1-based `JobContext.attemptNumber`. `PassthroughSerializer` really passes payloads through, and `queue.events` works without configuration.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

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

### `@zudojs/rpc` v1.4.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-rpc.md)

v1.4.0 — Minor Changes

- **Transports ship in the package.** `createRPCMemoryTransport(server)` connects a client in the same process; `createRPCHttpTransport({ url })` calls a remote server with `fetch`; `createRPCFetchHandler(server)` is a web-standard `(Request) => Promise<Response>` handler that bounds bodies, answers every failure with an RPC error frame and never sends stack traces.
- The client rebuilds typed errors from the wire (`RPCValidationError`, `RPCProcedureNotFoundError`, `RPCAuthenticationError`, `RPCForbiddenError` …) and keeps the wire `code` and `details`. `mapRPCError` exposes the server's mapping.
- **`error.code` is always the wire code.** `RPC_TIMEOUT`, `RPC_CANCELLED` and `RPC_UNAVAILABLE` used to come back with class codes (`ERR_RPC_TIMEOUT` …). A `@zudojs/errors` error thrown with `expose: true` reaches the caller under the matching code (new `RPC_NOT_FOUND` 404 and `RPC_CONFLICT` 409, plus `RPC_VALIDATION_ERROR`, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`, `RPC_RATE_LIMITED` …) instead of `RPC_INTERNAL_ERROR`.
- Security: the server refuses (`RPC_INVALID_REQUEST`) a frame whose `payload` or `metadata` holds a `__proto__`, `constructor` or `prototype` key at any depth. A caller that disconnects or aborts cancels the procedure (`RPC_CANCELLED`) instead of letting it run to its timeout.
- The client deadline and `retry()` backoff timers keep a script alive until the call settles (Node used to exit with code 13 first); `createRPCHttpTransport` clamps an over-long timeout to the timer range.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.3.0

Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one where a generated document did not match the contract it described.
    - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled part of the frame, not just `payload`. `request.id` is capped at the new `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured alongside `payload` against `limits.maxPayloadBytes`. Previously an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was, and an unbounded `id` was echoed verbatim into both the success and the error response. `RPCServer.handle` no longer reflects an id that exceeds the limit. Frames that were already inside the limits are unaffected; a frame whose `payload` and `metadata` together now exceed `maxPayloadBytes` is rejected with `RPCInvalidRequestError` where it used to be accepted.
    - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path template rather than the source path, so `GET /users/:id` and `GET /users/{id}` are recognised as the same route and the second is rejected. Both used to register, and generation then silently replaced the first with the second: one operation disappeared from the published document with `validate()` reporting no errors. `hasRoute`, `setRoute` and `removeRoute` accept either spelling for the same route.
    - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer emits `additionalProperties: false`. That keyword means "reject the payload", while `strip` accepts it and discards the extra key, so a client generated from such a document refused requests the service accepts. Only `.strict()` emits it now. This also removes a difference between `s.object({…})` and `s.object({…}).strip()`, which validate identically but used to document differently. **Regenerate any checked-in spec**: objects that are not `.strict()` lose their `additionalProperties: false`.
    - **`@zudojs/observability`** — queue-overflow reports from the batch log and span processors are rate limited. A stalled exporter used to make every subsequent `logger.info()` synchronously allocate an `Error` and re-enter the configured `onError` — usually writing to the sink that was already failing. The first drop is still reported immediately; after that, at most one report per minute, each carrying the running total.
    - **`@zudojs/observability`** — a span attribute named `__proto__` is now recorded instead of silently vanishing, on both span attributes and event attributes. Storing it by plain assignment invoked the prototype setter, which dropped the attribute and replaced the bag's prototype; the injected prototype then let unlimited further attributes past the `maxAttributes` cap. Inherited names such as `toString` are counted against the cap too.

### `@zudojs/runtime` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-runtime.md)

v1.3.0 — Minor Changes

- **Behaviour change:** `start()` passes through every state in order (`created → initializing → initialized → starting → running`), and publishes `runtime.initialized` and `runtime.starting`.
- `RuntimeInitializationError`, `RuntimeRollbackError` and `RuntimeSignalError` are now thrown or logged where they apply; the first two extend `RuntimeStartError`.
- **Behaviour change:** `failed` is no longer terminal; `TERMINAL_STATES` is `["stopped"]`.
- New `disposeContainerOnStop: true` makes `stop()` dispose the container; `createTestRuntime` does so by default.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.1

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

### `@zudojs/scheduler` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-scheduler.md)

v1.2.0 — Minor Changes

- **Behaviour change: process lifetime.** A started scheduler keeps the Node.js process alive until `stop()`; a script that only ran a scheduler used to exit 0 with nothing run. `SchedulerOptions.keepAlive: false` restores the old behaviour.
- `stop()` is idempotent; `Clock` is exported from the package root; `CronParseError` messages are no longer garbled; `getExecutions()` records the real attempt; new `JobContext.attemptNumber`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.2

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

### `@zudojs/schema` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-schema.md)

v1.2.0 — Minor Changes

- `string().url()` still accepts only `http`/`https` by default and now takes `url({ protocols: ["postgres", "redis"] })` or `{ protocols: "any" }`.
- `date()`, `datetime()` and `time()` validate real values: `"2026-02-30"`, `"2026-13-45"` and `"2026-02-30T25:61:00Z"` used to pass.
- An optional key absent from the input stays absent from the parsed object (it came back as an own key set to `undefined`); the inferred type makes it an optional property (new `ObjectShapeOutput`).
- `partial()` no longer applies `.default()` to absent keys, so an update schema no longer resets every defaulted field the caller left out.
- Every primitive has `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()` through the new `ModifiableSchema` base class; `schema.boolean().optional()` was a type error.
- `SchemaInput` of a transform is its input type; `TransformSchema<TIn, TOut>` extends `Schema<TOut, TIn>`. New `isSchemaValidationError(error)` guard, and count messages use the singular for one.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/security` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-security.md)

v1.3.0 — Minor Changes

- **Behaviour change (security):** `serializeCookie` / `createSecureCookie` validate `Domain` as a hostname and `Path` as free of control characters, `;` and `,`; anything else throws `ValidationError`.
- The CSRF checks return `false` for a non-string token, a request with no method, or a malformed header or cookie bag, instead of throwing a `TypeError`.
- New `findUnsafeKey(value)` returns the first `__proto__`, `constructor` or `prototype` key anywhere in decoded data; `@zudojs/rpc` and `@zudojs/api` use it to refuse prototype-polluting input.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.0

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

### `@zudojs/serialization` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-serialization.md)

v1.2.0 — Minor Changes

- A custom `transformers` registry keeps the built-in transformers (Date, BigInt, Map, Set, Buffer, Error) behind it instead of silently replacing them; `builtins: false` uses only yours. New `createBuiltinTransformers()`.
- A transformer's `serialize` may return just the value, which is wrapped as `{ $type, $value }` for you.
- With `preserveTypes`, a value no transformer handles that JSON would write as `{}` throws `SerializeError` naming the type instead of losing its contents.
- **Behaviour change:** a depth failure from `JSONSerializer` is a `400` `SerializationDepthError`, via `@zudojs/validation`'s guards.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/storage` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-storage.md)

v1.2.0 — Minor Changes

- **Behaviour change:** `STORAGE_LOCK_ACQUIRE_TIMEOUT` is `409` (it was `504`), and `STORAGE_CONNECTION_ACQUIRE_TIMEOUT` / `STORAGE_CONNECTION_TIMEOUT` are `503`. Error codes are unchanged.
- **Behaviour change:** `BaseRepository.create()` and `update()` leave a property whose value is `undefined` out of the SQL instead of writing `NULL`; an explicit `null` still writes `NULL`.
- **Behaviour change:** `StorageLifecycleManager.drain()` and `shutdown()` visit components one at a time in reverse registration order.
- New `writableColumns`, `filterableColumns` and `sortableColumns` options, each defaulting to `columns`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.2

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/types@1.1.1`, `@zudojs/serialization@1.1.1`, `@zudojs/constants@1.1.1`.

### `@zudojs/tenancy` v1.3.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-tenancy.md)

v1.3.0 — Minor Changes

- The tenant middleware (`createResolveTenantMiddleware`, `createRequireTenantMiddleware`, `createTenantGuardMiddleware`) and the helpers `createBadRequest`, `createUnauthorized`, `createForbidden`, `createNotFound`, `createJsonErrorResponse` return `@zudojs/middleware` guard responses, which `@zudojs/http` now sends with their real status instead of `200`. New `createJsonResponse(status, body)`.
- `createResolverChain([...])` infers its context from the resolvers (new `ResolverChainContext`), and the mirrored `HttpMiddleware` types fit a route's `middleware` list without `as never`.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.2.1

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`, `@zudojs/constants@1.1.1`.

### `@zudojs/testing` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-testing.md)

v1.2.0 — Minor Changes

- New `createHttpTestClient(target)`, a supertest-style client that drives a real app over HTTP: a base URL, a Node server or listener, a web fetch handler, or an `@zudojs/http` server, adapter, router or pipeline. Fluent `.get/.post/…`, `.set`, `.query`, `.send`, `.auth`, a cookie jar, and chained `.expect(status)`, `.expectJson(partial)`, `.expectText()`.
- The recording doubles record every path: `createTestEventBus().bus` is the double itself, and `createTestMessageBus()` / `createTestQueue()` record calls made on the underlying bus or queue too. Before, those calls ran but recorded nothing.
- **Behaviour change:** `createTestApplication()` is quiet and deterministic by default: a silent `createSpyLogger(name)` and a clock pinned at `DEFAULT_TEST_APPLICATION_TIME` (2026-01-01T00:00:00.000Z). Pass `logger`, `clock` or `startTime` to opt back in.
- `createTestQueue().queue` forwards `onJobReady`, so a Worker on a test queue wakes as soon as a job is added. `InMemoryTestStorage.set()` rejects a `NaN` TTL.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.2

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

### `@zudojs/transactions` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-transactions.md)

v1.2.0 — Minor Changes

- **Behaviour change:** committing a rollback-only transaction throws `TransactionRollbackOnlyError` (a `TransactionRollbackError` subclass) instead of the misleading "rollback failed".
- **Behaviour change:** `manager.rollback()` on a committed transaction throws `TransactionStateError` instead of silently doing nothing.
- `Transaction.signal` aborts with a `TransactionTimeoutError` on timeout, and `run()` stops waiting, rolls back and rejects. New `raceSignal` and adapter handle accessors `getTransactionHandle`, `currentTransactionHandle`, `manager.getCurrentHandle()`.
- `timed_out` is emitted once per timeout.
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.2

Patch Changes

- No source changes in this release. Republished against `@zudojs/errors@1.2.0`.

### `@zudojs/types` v1.2.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-types.md)

v1.2.0 — Minor Changes

- New `formatCount(count, singular, plural?)`, which `@zudojs/schema` and `@zudojs/validation` use so messages read "at least 1 character" rather than "1 characters".
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.1.1

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `@zudojs/validation` v1.1.0

[Package documentation](https://zudojs.oyinlola.site/docs/packages-validation.md)

v1.1.0 — Minor Changes

- **Behaviour change:** `assertDepthWithinLimit` and `assertNoCircularReference` throw `SerializationDepthError` with `statusCode: 400` and `expose: true`, so a request body nested too deep is a client error instead of a hidden `500`. The message contains only the observed depth and the limit. New `UNTRUSTED_DEPTH_ERROR` constant.
- Length and count messages use the singular for one ("at least 1 item").
- The npm `homepage` now links to this package's documentation page on zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

Previous release — v1.0.3

Patch Changes

- Hardens the type and error primitives against untrusted input, and makes a handful of failure paths report the error a caller can actually act on.
    - `BaseError` no longer overflows the stack when a deeply nested object or array is attached as a `cause`. The redaction walk is now bounded at 32 levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning already did, so `JSON.stringify`, `serializeError` with `includeCause` and `ErrorHandler.toLogObject` stay safe on a parsed request body. Attacker-controlled depth could previously raise a `RangeError` from inside the logging path.
    - `estimateSerializedSize(value)` now defaults to a finite budget (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every occurrence of a shared subtree is charged, an unbounded budget let a 1 KB payload of shared references burn minutes of CPU. Pass an explicit `Number.POSITIVE_INFINITY` if you need an exact measurement of input you trust; the returned value is otherwise capped at the budget.
    - `assertNoCircularReference` reports running out of depth as `SerializationDepthError` rather than dressing it up as `CircularReferenceError`, and `JSONSerializer.serialize` with `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly acyclic payload used to be rejected as a cycle on that path while the fast path reported a depth error for the same input; the two now agree. `hasCircularReference` returns `false` for such a graph instead of `true`.
    - `isArrayOfType` reads every index rather than relying on `Array.prototype.every`, which skips holes. A sparse array such as `new Array(3)` no longer satisfies an arbitrary element guard.
    - A `$type` tag arriving from the wire is checked against `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is clipped before being quoted into an error message, so an over-long tag can no longer flood a log line.
    - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`, `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues. Code that catches `Error` is unaffected; code that wants to turn hostile input into a 400 can now tell it apart from an internal bug.
    - `Schema.safeParse`'s documentation no longer claims it never throws: a callback defect or a `RangeError` from stack exhaustion is still deliberately allowed to escape rather than being laundered into a validation issue.

### `zudojs` v1.0.1

[Package documentation](https://zudojs.oyinlola.site/docs/packages-cli.md)

v1.0.1 — Patch Changes

- The `zudojs` package is the short way to install the CLI: `npm install -g zudojs` puts both the `zudojs` and the shorter `zudo` command on your PATH, and runs `zudojs-cli`. This release depends on `zudojs-cli@2.1.0`.
