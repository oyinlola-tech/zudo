# @zudojs/feature-flags

## 1.5.0

### Minor Changes

- Round 12 security-group fixes from the academy package findings ([#41](https://github.com/oyinlola-tech/zudo/issues/41), [#76](https://github.com/oyinlola-tech/zudo/issues/76), [#84](https://github.com/oyinlola-tech/zudo/issues/84)–[#88](https://github.com/oyinlola-tech/zudo/issues/88), [#102](https://github.com/oyinlola-tech/zudo/issues/102), [#116](https://github.com/oyinlola-tech/zudo/issues/116), [#117](https://github.com/oyinlola-tech/zudo/issues/117), [#119](https://github.com/oyinlola-tech/zudo/issues/119)–[#122](https://github.com/oyinlola-tech/zudo/issues/122), [#139](https://github.com/oyinlola-tech/zudo/issues/139)).

  **@zudojs/crypto**

  - `encrypt()` refuses a caller-supplied AES-GCM `iv` that this process has already used under the same key (`CryptoError`, `ERR_CRYPTO_CIPHER`). GCM nonce reuse leaks plaintext XORs and the authentication key; omitting `iv` (a fresh random one per call) never trips the guard. `unsafeAllowIvReuse: true` opts out for replaying published test vectors. The guard is per process, a safety net rather than a uniqueness proof.
  - `hashPassword(password, { minLength })` opts into a minimum length; pass `PASSWORD_POLICY.MIN_LENGTH` (8) for the package policy. The default stays permissive so existing credentials can be re-hashed.
  - `sign`, `verify`, `signString` and `verifyString` accept a Node `KeyObject` (new `SignatureKeyMaterial` type), so the pair `generateEd25519KeyPair()` returns can be used without a cast (it always worked at runtime).
  - **Behaviour change (error class):** cryptographic parameter violations now throw `CryptoError` instead of `RangeError`: a short HMAC key (`ERR_CRYPTO_HASH`), an out-of-range scrypt/PBKDF2 work factor or salt (`ERR_CRYPTO_DERIVATION` from `derive*`/`generateSalt`, `ERR_CRYPTO_HASH` from `hashPassword`), a non-positive key length in `generateCryptoKey` (`ERR_CRYPTO_KEY`), and a password outside the length bounds (`ERR_CRYPTO_HASH` with `statusCode: 400`, `expose: true`). Code that matched `instanceof RangeError` for these must match `isCryptoError`/the code instead; `verifyPassword` still returns `false` rather than throwing. Argument-shape mistakes (a non-`Uint8Array` key, an unknown algorithm name, a non-integer random length) remain `TypeError`/`RangeError`.
  - `hmac()` handed a string key now says how to encode it (`new TextEncoder().encode(secret)`), and units are documented and exposed: `randomHex(n)` is characters, `randomBase64Url(n)` bytes, `generateCryptoKey(n)` bytes, and `CryptoKey` gains `byteLength` next to `length` (bits). `CryptoKey.bytes()` is documented as the raw accessor the providers use, gated by `extractable` only through `exportCryptoKey`.

  **@zudojs/auth**

  - `login()`, `refresh()` and `createSessionForUser()` embed `AuthUser.claims` in both tokens, and `createTokenPair()` takes a `claims` option. Reserved names (`sub`, `iat`, `exp`, `nbf`, `typ`, `jti`, `sid`, `roles`, `iss`, `aud`; exported as `RESERVED_JWT_CLAIMS`) are dropped, never overridden.
  - A `revocationStore` without `revokeIfNotRevoked` no longer falls back silently to the racy `isRevoked()` + `revoke()` path: `createAuthService()` emits a `SecurityWarning` through `process.emitWarning` (code `ZUDO_AUTH_RACY_REVOCATION`) at construction, and `requireAtomicRevocation: true` makes it throw `AuthConfigurationError` instead. Exported: `assertAtomicRevocationStore`, `RACY_REVOCATION_WARNING_CODE`.
  - Injectable time: `createAuthService({ clock })` and `TokenConfig.clock` (`{ now(): number }`, the `Clock` from `@zudojs/types`) drive token `iat`/`exp`, verification and lockout deadlines; `createMemorySessionStore`, `createMemoryTokenRevocationStore` and `createMemoryLoginAttemptStore` take the same `clock`, and `isTokenExpired(token, clock?)` accepts one. Expiry tests no longer need fake timers.

  **@zudojs/auth-oauth**

  - Provider requests use a ref'd deadline instead of `AbortSignal.timeout()`, whose unref'd timer let a one-shot script exit with code 13 ("unsettled top-level await") before the timeout fired. The deadline also races the fetch and the body read, so a caller-supplied `config.fetch` that ignores `signal` still ends in `OAuthNetworkError`.
  - README: how to test against a local fake (the SSRF guard rejects `127.0.0.1` token/user-info URLs; keep an `https` URL and route it with `config.fetch`).

  **@zudojs/security**

  - `createRateLimiter` no longer copies a key's whole hit log on every check. Expiry is a binary search over an ordered log with amortised compaction, so a check costs O(log `max`) instead of O(`max`); a limiter with `max: 1_000_000` is as cheap per request as one with `max: 300`. Behaviour (sliding window, `remaining`, `resetAt`, `getCount`) is unchanged.

  **@zudojs/permissions**

  - New `TypedPermissionString` (`` `${string}:${string}` ``) for call sites that want the compiler to insist on `resource:action`; `PermissionString` stays `string` for compatibility. `isValidPermission()` now narrows to it, and `toPermissionString()` validates and brands a runtime string (throws `InvalidPermissionError`).

  **@zudojs/tenancy**

  - `createTenantCacheScope(tenantId, key)` returns `{ namespace: "tenant.<id>", key }`, the shape `@zudojs/cache` accepts (`cache.get(scope.key, { namespace: scope.namespace })`); `createTenantCacheKey`'s `tenant:<id>:<key>` is rejected by the cache because key parts may not contain `:`. Also `createTenantCacheNamespace` and `TENANT_CACHE_PART_PATTERN`. A key outside the cache alphabet throws `ValidationError`.
  - **Response body change:** every refusal from the tenancy middleware now carries a machine-readable `code` next to `error` (`ERR_TENANT_NOT_FOUND`, `ERR_TENANT_REQUIRED`, `ERR_TENANT_FORBIDDEN`, `ERR_TENANT_UNAVAILABLE`, `ERR_TENANT_RESOLUTION_CONFLICT`, `ERR_TENANT_RESOLUTION_FAILED`; exported as `TENANCY_RESPONSE_CODE`), matching the `{ error, code }` shape `@zudojs/http` uses, so a tenant 404 is distinguishable from an application 404. `createNotFound`/`createForbidden`/`createUnauthorized`/`createBadRequest` take an optional `code`.

  **@zudojs/feature-flags**

  - `percentage` and `variant` rules take `bucketBy: "userId" | "tenantId" | "sessionId"` to pin the rollout subject. Without it the subject is still `userId`, then `tenantId`, then `sessionId`, then `"anonymous"`, which split members of one tenant whenever the context carried both ids. With `bucketBy` set, a context missing that field does not match the rule. `resolveRolloutSubject` is exported.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/types@1.3.0

## 1.4.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.4.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.4.0

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
  - @zudojs/types@1.2.0

## 1.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **FF-01 (bug):** a dependency is satisfied only when the prerequisite _evaluates_ on for the same context (not disabled/draft/archived/expired, not `false`/`null`/`undefined`, its own dependencies satisfied). `resolveDependencies` takes an optional fifth `context` argument.
  - **FF-02 (bug):** attribute rules gain an optional `result` (the value served on a match, default `true`). An attribute rule without `result` on a non-boolean flag is skipped instead of serving `true`.
  - **FF-03 (security):** `matches` refuses patterns that can backtrack catastrophically (a repeated group that itself repeats or alternates, or a backreference) and tests only values up to 1,024 characters.
  - **FF-04 (bug):** `createFeatureFlags` remembers unknown keys for `missingFlagTtlMs` (new option, default 30 s, at most 1,000 keys, cleared on reload). `createCachedProvider` gains `maxEntries` (default 1,000).
  - **FF-05 (convention):** `isPlainObject` now matches `@zudojs/types` semantics (false for `Date`, `Map`, class instances) and is deprecated in favour of `@zudojs/types`.

  Behaviour changes: dependents turn off where their prerequisite is archived, expired or not rolled out for the subject; non-boolean flags no longer serve `true` from an attribute rule without `result`; nested-quantifier `matches` patterns never match; a missing key is not re-fetched for 30 s; `isPlainObject(new Date())` is `false`.
  - **authz/FF-05 (phase 2):** `isPlainObject` is now a re-export of the `@zudojs/types` function (same semantics as the round-10 local copy; the export is kept and marked deprecated in favour of importing from `@zudojs/types`).

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/errors@1.1.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 — provider and evaluation fixes.

  - `createCachedProvider` and `createCompositeProvider` forward `subscribe()` from the providers they wrap, so `createFeatureFlags` on the documented cached-over-composite stack now hears a flag flipped at the source instead of serving the stale copy until the TTL expires. The cached provider drops its cache before re-announcing; the composite announces the merged view with the same precedence `getAll()` applies. Neither offers `subscribe` when nothing underneath does.
  - `createEnvironmentProvider` no longer turns an empty or blank value (`FEATURE_X=`) into the number `0`; it stays the string it is.
  - A `provider.get()` that throws is reported as `reason: "error"` (and does not throw `FeatureFlagNotFoundError` under `throwOnMissing`). It used to be reported as `not_found`, telling the caller the flag does not exist when the store could not be asked.
  - `metadata.expiresAt` given as an ISO string or timestamp — what every JSON-backed provider hands over — now expires the flag. Only a real `Date` did before; a string compared as always-not-expired.

### Patch Changes

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
