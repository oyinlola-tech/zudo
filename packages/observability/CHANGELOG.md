# @zudojs/observability

## 1.3.0

### Minor Changes

- Round 12 (academy findings) — INFRA group: cache, container, logger, observability.

  **@zudojs/container**

  - `registerClass(token, Class, { inject })`, `classProvider(Class, inject)` and `provideClass(token, Class, inject)` now type-check the `inject` list against the constructor, the way `registerFactory` already did ([#42](https://github.com/oyinlola-tech/zudo/issues/42)). `inject: [CLOCK, DB]` against `constructor(db: Db, clock: Clock)` is a compile error, and so is omitting `inject` for a constructor with required parameters (which threw `ProviderResolutionError` at resolve time). Untyped string/symbol tokens check nothing, a non-tuple `ProviderToken[]` built at runtime accepts any constructor, and defaulted/optional parameters beyond the list are fine, so code that worked keeps compiling. New exported types: `InjectedConstructor`, `InjectedConstructorArgs`; `RegisterClassOptions` gained an optional `Deps` type parameter (defaulting to the old shape).
  - A missing dependency's error chain now ends at the missing token ([#62](https://github.com/oyinlola-tech/zudo/issues/62)): `Failed to resolve DueTodayReminder: No registration found for token "MAILER" (required by "DueTodayReminder"). (chain: DueTodayReminder -> MAILER)`, and `DependencyResolutionError.chain` includes it. The top-level `RegistrationNotFoundError` message is unchanged.
  - Documented that `autoRegisterClasses` treats a constructor whose parameters all have defaults (or a rest parameter) as zero-arg — it is auto-registered and built with no arguments, defaults applied, nothing injected ([#69](https://github.com/oyinlola-tech/zudo/issues/69)) — and that every `register*` call except `registerValue` defaults to `ContainerScope.TRANSIENT` ([#129](https://github.com/oyinlola-tech/zudo/issues/129)).

  **@zudojs/logger**

  - An `Error` nested inside metadata or context (`logger.error("x", { cause: err })`) is normalized when the entry is built into plain data — `{ name, message, stack, ...ownFields, cause }`, own fields redacted like any metadata, a self-referential `cause` becoming `"[Circular]"` — so a custom transport that stringifies `entry.metadata` sees the error instead of `{}` ([#67](https://github.com/oyinlola-tech/zudo/issues/67)). The built-in formatters render the same output as before, including `includeStackTrace: false` leaving nested stacks out. New exports: `LOGGER_ERROR_VALUE`, `isLogErrorValue()`, `LogErrorValue`. `redactLogValue()` applies the same normalization to Errors it meets.
  - The `Logger` level methods keep their single `(message, metadata?)` signature (a widened union broke structural consumers in an earlier release); the README now documents that `logger.error(message, err)` works at runtime and that the typed form is `log(level, message, { error, metadata })`, and notes that this package's default redaction and `@zudojs/core`'s `createLogRedactor` are separate APIs ([#118](https://github.com/oyinlola-tech/zudo/issues/118)).

  **@zudojs/observability**

  - `LogRecord` gained optional `requestId` and `correlationId`, stamped from the active `PropagationContext` alongside `traceId`/`spanId` (and omitted under `correlate: false`); the console log exporter writes them ([#123](https://github.com/oyinlola-tech/zudo/issues/123)).

  **@zudojs/cache**

  - Key-validation errors now report the operation that rejected the key (`get`, `set`, `lock_acquire`, `clear`, …) instead of `unknown`, in `error.operation`, `toJSON()`, batch results and `cache.error` events ([#140](https://github.com/oyinlola-tech/zudo/issues/140)).
  - Under the default `:` separator a key containing `:` is still rejected — `a:b` would collide with key `b` in namespace `a`, and a namespace-scoped `clear` would reach it — but the message now says why and what to do (use the `namespace` option, use `.`/`-` inside a part, or configure a different separator) ([#130](https://github.com/oyinlola-tech/zudo/issues/130), [#120](https://github.com/oyinlola-tech/zudo/issues/120)). `CACHE_KEY_PATTERN` and `CACHE_PATTERN_PART_PATTERN` now include `:`; the active separator is rejected separately, so `:` is usable inside keys only under another separator (`config: { separator: "/" }` plus `createMemoryCacheAdapter({ separator: "/" })`), where it cannot collide with the scope structure.
  - Documented that `get<TValue>()` is an unchecked assertion ([#5](https://github.com/oyinlola-tech/zudo/issues/5)).

### Patch Changes

- Updated dependencies []:
  - @zudojs/logger@1.5.0
  - @zudojs/errors@1.4.0

## 1.2.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/logger@1.4.3

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/logger@1.4.2

## 1.2.1

### Patch Changes

- Post-release fixes.

  - **observability (security):** `redaction.fields` replaced the default names and @zudojs/logger's matcher, and `DEFAULT_SENSITIVE_FIELDS` lacked `jwt`, `sid`, `pwd`, `passphrase` and `bearer`. As a result the documented `fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"]` redacted less than the default: `redactObject({ jwt: "x" }, { fields: [...DEFAULT_SENSITIVE_FIELDS] })` returned `{ jwt: "x" }`. `DEFAULT_SENSITIVE_FIELDS` is now the effective default list, built from the logger's `DEFAULT_LOGGER_SECRET_FIELDS` plus this package's extra spellings, and it is frozen. **Behaviour change:** `fields` now _extends_ the defaults, so it can only add redaction. `fields: ["ssn"]` now redacts `ssn` and every default name, where before it redacted only `ssn`. To get the old replace behaviour, pass the new `replaceDefaults: true`.
  - **security (security):** `createCsrfProtection().verify` and `requiresCsrfProtection` let any method outside the protected list skip the check, so `""`, `" "`, `"POST "`, `"FOO"` and `"CONNECT"` returned `true` with no token. The rule now fails closed. Only GET, HEAD, OPTIONS and TRACE skip the check, matched exactly after upper-casing and without trimming. When `methods` is configured, a standard HTTP method that the list leaves out is also exempt, as before (`methods: ["DELETE"]` still exempts POST). Every other value is verified.
  - **security:** cookie `Path` accepted non-ASCII such as `"/ä"`. It must now be printable ASCII (0x20–0x7E) with no `;` or `,`. That is RFC 6265's `path-value` plus the `,` this package already refused. Percent-encode anything else. Space stays allowed, because the RFC allows it and the existing rules accepted it on purpose. `generateCsrfCookie` and `createCsrfProtection` now apply the same `Path` check and throw `ValidationError`. Before, they wrote `path` into `Set-Cookie` unchecked.
  - **permissions:** a policy with `effect: "grant"` (new in 1.4.0) denied when it returned `false`. An ownership policy therefore denied editors whose role grants the permission, and the workaround was `|| actorHasRole(...)`. A per-policy `effect: "grant"` now grants when it allows and abstains when it returns `false`, throws or times out. It can add access but can never take away what roles, permissions or rules grant. Throws and timeouts are still reported through `onError`. Denials still work as before: a constraining policy's `false` denies, and a grant never overrides a deny rule, `deniedPermissions` or another policy's denial. `defaultPolicyEffect: "grant"` keeps the pre-1.4 semantics unchanged for policies that set no `effect`: an allowing policy grants and a denying one denies.

- Updated dependencies [[`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/logger@1.4.1

## 1.2.0

### Minor Changes

- **`@zudojs/feature-flags`**

  - **Behaviour change (security): the kill switch now fails closed.** A flag that is off — `enabled: false`, `state: "disabled"` (which was not honoured at all before), a draft, archived, expired, or blocked by a dependency — no longer serves `defaultValue`. It serves its new optional `offValue`; without one, `false` for a boolean flag, or `defaultValue` for a string, number or object flag. So `createMemoryProvider([{ key: "x", enabled: false, defaultValue: true }])` now gives `isEnabled("x") === false` and `evaluate("x").value === false` (reason still `"disabled"`). Previously every flag with `defaultValue: true` stayed on when killed. If you relied on a killed flag serving `true`, declare `offValue: true`.
  - **Behaviour change: `createEnvironmentProvider` normalises keys.** `FEATURE_NEW_CHECKOUT=true` is now the flag `new-checkout` (lower case, `_` → `-`), the same key other providers use, so it overrides that flag in a composite. `get()` normalises the key it is asked for too, so `get("NEW_CHECKOUT")` and `isEnabled("NEW_CHECKOUT")` still work; only keys returned by `getAll()` / `snapshot()` change. Pass `keyFormat: "preserve"` for the old spelling.

  **`@zudojs/observability`**

  - **Behaviour change (security): redaction is on by default.** Without a `redaction` option, log contexts and span attributes are now redacted, so `password`, `token`, `authorization` and the rest are no longer exported in the clear. The default rules include every name `@zudojs/logger` redacts by default (it now reuses the logger's `createDefaultSecretFieldMatcher`, and depends on `@zudojs/logger`), which also adds names such as `jwt`, `bearer`, `sid`, `pwd` and `passphrase` to `redaction: {}`, `redactObject()` and `isSensitiveField()`. Pass `redaction: false` to turn redaction off; passing `fields` still replaces the defaults.
  - `shutdown()` exports the final metric snapshot once instead of twice. `flush()` is unchanged.

  **`@zudojs/plugins`**

  - An async `PluginEvents.emit` that rejects no longer becomes an `unhandledRejection` (which terminates Node by default) after `start()` resolves. Rejections are contained and reported exactly like a synchronous throw, both for `context.events` and for the manager's `events` option. `PluginEvents.emit` may now return a promise.
  - `@zudojs/events`' `EventBus` is accepted by `new PluginManager({ events })` and `createPluginContext(meta, { events })`. It is adapted with the new `toPluginEvents()` (`emit(name, payload)` publishes `{ type: name, payload }`; `on`/`off` subscribe and unsubscribe, handing handlers the payload), so `context.events` is still a `PluginEvents`. Previously a cast bus crashed with `InvalidEventError`. New exports: `toPluginEvents`, `isPluginEventBus`, and the types `PluginEventBus` and `PluginEventSource`.

  **`@zudojs/events`**

  - `bus.use()` accepts registered middleware from `createEventMiddleware()` and builder helpers such as `validateEventMiddleware()`, as the constructor option already did, instead of throwing "Invalid event middleware.".
  - A handler's `timeoutMs` now aborts the `context.signal` that handler received, with the `EventTimeoutError` as the abort `reason`. The dispatch and other handlers are not aborted.
  - **Behaviour change:** in sequential dispatch, aborting the publish `signal` while the last or only handler runs now rejects with `EventDispatchAbortedError`, as it already did when another handler was still to run. It used to resolve with `handled: true, failed: 0`. Parallel dispatch is unchanged.
  - `EventBusStoppedError` and `EventBusDisposedError` now come from `@zudojs/errors` and are re-exported, so `instanceof` works whichever package you import them from. `EventBusDisposedError`'s code is now `ERR_EVENT_BUS_DISPOSED` (was `ERR_LIFECYCLE_DISPOSED`).
  - `EventPublishResult.errors` and `EventEmitResult.errors` are typed `readonly EventHandlerError[]` (was `readonly unknown[]`), which is what they always held.

  **`@zudojs/cqrs`**

  - **Behaviour change:** `unwrapCommandResult()` throws `CommandFailedError` for a result whose status is `"failure"`, and `unwrapQueryResult()` throws `QueryFailedError`, instead of returning the failure payload as if it were the value. The payload is on `error.failure` and `error.cause`. Both errors are re-exported from `@zudojs/cqrs`.

  **`@zudojs/errors`**

  - New `EventBusStoppedError`, `CommandFailedError` and `QueryFailedError`, and the codes `ErrorCode.COMMAND_FAILED` and `ErrorCode.QUERY_FAILED`.

  **`@zudojs/security`**

  - The CSRF checks (`verifyDoubleSubmit`, `validateCsrfToken`, `createCsrfProtection().verify`) return `false` for a non-string token, a request with no method, or a malformed header or cookie bag, instead of throwing a `TypeError`. They still throw `ConfigurationError` for misconfiguration (a secret shorter than 32 characters, or a bad `methods` list). The README and JSDoc show how to require `CSRF_SECRET` from the environment, with no hard-coded fallback.
  - **Behaviour change (security):** `serializeCookie` / `createSecureCookie` validate `Domain` as a hostname — labels of `[A-Za-z0-9-]` separated by dots, with an optional leading dot, at most 253 characters — and `Path` as free of control characters, DEL, `;` and `,`. Anything else throws `ValidationError`. Previously only a real CR, LF, NUL, `;` or `,` was refused, so `domain: "a\\r\\nX-Evil: 1"` (literal backslashes), spaces and colons were written into the header unchanged.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/logger@1.4.0

## 1.1.1

### Patch Changes

- Tightened three places where caller-controlled input was not bounded, and one
  where a generated document did not match the contract it described.

  - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled
    part of the frame, not just `payload`. `request.id` is capped at the new
    `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with
    `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured
    alongside `payload` against `limits.maxPayloadBytes`. Previously an
    unbounded `metadata` object reached middleware and handlers as
    `context.metadata` however large it was, and an unbounded `id` was echoed
    verbatim into both the success and the error response. `RPCServer.handle`
    no longer reflects an id that exceeds the limit. Frames that were already
    inside the limits are unaffected; a frame whose `payload` and `metadata`
    together now exceed `maxPayloadBytes` is rejected with
    `RPCInvalidRequestError` where it used to be accepted.

  - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path
    template rather than the source path, so `GET /users/:id` and
    `GET /users/{id}` are recognised as the same route and the second is
    rejected. Both used to register, and generation then silently replaced the
    first with the second: one operation disappeared from the published
    document with `validate()` reporting no errors. `hasRoute`, `setRoute` and
    `removeRoute` accept either spelling for the same route.

  - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer
    emits `additionalProperties: false`. That keyword means "reject the
    payload", while `strip` accepts it and discards the extra key, so a client
    generated from such a document refused requests the service accepts. Only
    `.strict()` emits it now. This also removes a difference between
    `s.object({…})` and `s.object({…}).strip()`, which validate identically but
    used to document differently. **Regenerate any checked-in spec**: objects
    that are not `.strict()` lose their `additionalProperties: false`.

  - **`@zudojs/observability`** — queue-overflow reports from the batch log and
    span processors are rate limited. A stalled exporter used to make every
    subsequent `logger.info()` synchronously allocate an `Error` and re-enter
    the configured `onError` — usually writing to the sink that was already
    failing. The first drop is still reported immediately; after that, at most
    one report per minute, each carrying the running total.

  - **`@zudojs/observability`** — a span attribute named `__proto__` is now
    recorded instead of silently vanishing, on both span attributes and event
    attributes. Storing it by plain assignment invoked the prototype setter,
    which dropped the attribute and replaced the bag's prototype; the injected
    prototype then let unlimited further attributes past the `maxAttributes`
    cap. Inherited names such as `toString` are counted against the cap too.

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.1.0

### Minor Changes

- Round 10 audit fixes.

  - OBS-01: `tracer.startSpan()` without an explicit `parent` now joins the active propagation context, so logs and spans in one request share a `traceId`. New `withSpan(tracer, name, fn, options?)` and `DefaultTracer.startActiveSpan(name, fn, options?)` run a callback with the span as the active context and end it (recording a throw or rejection).
  - OBS-02: `createSpanContext`, `createChildSpanContext`, `createPropagationContext` and `startSpan` now validate trace and span IDs. An invalid `traceId`/`parentSpanId` (or an invalid parent) starts a fresh trace and drops its trace flags; an invalid `spanId` is replaced. New `parseTraceparent`, `formatTraceparent`, `TRACEPARENT_HEADER` and `isValidSpanContext`.
  - OBS-03: redaction rebuilds objects with `Object.defineProperty`, so an own `__proto__` key stays a data property instead of replacing the output's prototype.
  - OBS-04: `onCardinalityLimit` fires once per rejected series (tracked in a bounded seen-set, separate from the overflow cache); the facade raises `onError` once per over-cardinality metric name.
  - XP-02: new `toLoggerLevel` / `fromLoggerLevel` convert between this package's `LogLevel` (higher = more severe) and `@zudojs/logger`'s inverted `LoggerLevel` numbers.

  Behaviour changes: spans started inside `propagation.run()` are now children of the ambient context (previously a new trace); non-W3C trace/span IDs passed to the context factories are no longer kept verbatim; the facade's `onError` reports cardinality once per metric name instead of once per rejected series.
  - CONV-01 / H5 (phase 2): `ObservabilityError` is now the `@zudojs/errors` class, re-exported (same constructor and defaults). `ExporterError`, `ObservabilityConfigError` and `MetricValueError` stay as thin subclasses, so `instanceof ObservabilityError` matches across both import paths.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - Redaction now covers instances of user-defined classes (DTOs, request models) nested in log contexts and span attributes. Their own enumerable fields are what exporters serialize, so a `password` field on a class instance previously reached the exporter unredacted. Built-ins (`Date`, `Error`, `Map`, `Set`, typed arrays, `URL`) are still left intact, and redacted instances keep their prototype.
- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
