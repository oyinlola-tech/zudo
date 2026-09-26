# @zudojs/security

## 1.3.4

### Patch Changes

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

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/constants@1.2.0

## 1.3.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.3.1

### Patch Changes

- Post-release fixes.

  - **observability (security):** `redaction.fields` replaced the default names and @zudojs/logger's matcher, and `DEFAULT_SENSITIVE_FIELDS` lacked `jwt`, `sid`, `pwd`, `passphrase` and `bearer`. As a result the documented `fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"]` redacted less than the default: `redactObject({ jwt: "x" }, { fields: [...DEFAULT_SENSITIVE_FIELDS] })` returned `{ jwt: "x" }`. `DEFAULT_SENSITIVE_FIELDS` is now the effective default list, built from the logger's `DEFAULT_LOGGER_SECRET_FIELDS` plus this package's extra spellings, and it is frozen. **Behaviour change:** `fields` now _extends_ the defaults, so it can only add redaction. `fields: ["ssn"]` now redacts `ssn` and every default name, where before it redacted only `ssn`. To get the old replace behaviour, pass the new `replaceDefaults: true`.
  - **security (security):** `createCsrfProtection().verify` and `requiresCsrfProtection` let any method outside the protected list skip the check, so `""`, `" "`, `"POST "`, `"FOO"` and `"CONNECT"` returned `true` with no token. The rule now fails closed. Only GET, HEAD, OPTIONS and TRACE skip the check, matched exactly after upper-casing and without trimming. When `methods` is configured, a standard HTTP method that the list leaves out is also exempt, as before (`methods: ["DELETE"]` still exempts POST). Every other value is verified.
  - **security:** cookie `Path` accepted non-ASCII such as `"/ä"`. It must now be printable ASCII (0x20–0x7E) with no `;` or `,`. That is RFC 6265's `path-value` plus the `,` this package already refused. Percent-encode anything else. Space stays allowed, because the RFC allows it and the existing rules accepted it on purpose. `generateCsrfCookie` and `createCsrfProtection` now apply the same `Path` check and throw `ValidationError`. Before, they wrote `path` into `Set-Cookie` unchecked.
  - **permissions:** a policy with `effect: "grant"` (new in 1.4.0) denied when it returned `false`. An ownership policy therefore denied editors whose role grants the permission, and the workaround was `|| actorHasRole(...)`. A per-policy `effect: "grant"` now grants when it allows and abstains when it returns `false`, throws or times out. It can add access but can never take away what roles, permissions or rules grant. Throws and timeouts are still reported through `onError`. Denials still work as before: a constraining policy's `false` denies, and a grant never overrides a deny rule, `deniedPermissions` or another policy's denial. `defaultPolicyEffect: "grant"` keeps the pre-1.4 semantics unchanged for policies that set no `effect`: an allowing policy grants and a denying one denies.

## 1.3.0

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

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - New `findUnsafeKey(value)`: returns the first `__proto__`, `constructor` or `prototype` key anywhere in decoded, untrusted data (plain objects and arrays, iterative and cycle-safe), or `undefined`. `@zudojs/rpc` and `@zudojs/api` use it to refuse prototype-polluting request bodies, queue jobs and RPC frames; `containsPrototypePollution` remains the string check.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.2.0

### Minor Changes

- Closed four places where a security decision was made from input that could
  not support it, and two where a revoked grant kept answering from a cache.
  Every change here refuses more than it did before; none of them accepts
  anything new.

  **@zudojs/permissions**

  - `createPermissionRegistry()` now has `subscribe(listener)`, the same change
    notifier `createRoleRegistry()` and `createPolicyRegistry()` already
    carried, and it fires on `define`, a `remove` that removed something, and
    `clear`. `createPermissionEngine({ expandImplied })` accepts the registry
    itself in place of a closure — pass `expandImplied: permissions` — and
    subscribes to it, so revoking an implication drops the decisions that were
    cached while it stood. Previously `permissions.remove("post:admin")` left
    every `post:delete` it had implied answering `true` for the whole cache TTL,
    while `skipCache: true` correctly said `false`. A bare
    `(permission) => permissions.expandImplied(permission)` still works, but it
    cannot announce a change, so an engine given one now caches no decisions
    rather than serving one made under a revoked implication.
  - An engine with a `roleResolver` or a `permissionResolver` no longer caches
    decisions by default. A resolver reads authorization state the engine does
    not own and cannot see change, and none of it was in the cache key, so a
    grant withdrawn upstream kept being served until the entry expired. To get
    caching back, supply the new `resolverCacheKey` — a function of the actor
    returning something that changes whenever the resolver's answer for that
    actor could change (a grants-table version, an `updatedAt` stamp).
    Returning `undefined` leaves that actor uncached. Engines without a resolver
    are unaffected.
  - The README's request-metadata example imported `requireCurrentTenant` from
    `@zudojs/tenancy`, which does not export it; it now uses
    `createContextManager({ storage: getDefaultStorage() }).requireCurrentTenant().id`,
    which is where the method actually lives.

  **@zudojs/security**

  - `extractClientIp` no longer reads `X-Forwarded-For` when the chain is
    shorter than the configured `trustProxy` count. Such a chain did not pass
    through the proxies whose entries make it trustworthy, and the index clamp
    landed on the entry the client wrote — so with `trustProxy: 2` a request
    arriving at an inner hop with `X-Forwarded-For: 1.2.3.4` was rate-limited as
    `1.2.3.4`, and rotating that value gave the caller a fresh bucket each time.
    Short chains now fall through to `x-real-ip` and then `remoteAddress`.
    Chains at or above the configured length behave exactly as before.
  - `createCsrfProtection` and `requiresCsrfProtection` reject a `methods` list
    that is empty, not an array, or contains a blank entry, with
    `ConfigurationError`. `methods: []` used to turn CSRF off for every request
    in silence, which is what
    `process.env.CSRF_METHODS?.split(",").filter(Boolean) ?? []` produces when
    the variable is unset. Omit `methods` for the defaults.
  - `containsTraversal` and `validateRequestTarget` strip RFC 3986 path
    parameters before segmenting, so `/a/..;/b` is reported as traversal like
    every other spelling of it. Tomcat, Jetty and several reverse-proxy pairings
    resolve it to `/a/../b`. `....//` is still not a traversal, and nothing that
    was already caught has changed.
  - `sanitizeObject` rejects a `maxDepth` that is not an integer of 1 or more
    with `ConfigurationError`. `maxDepth: 0` discarded the argument itself and
    returned `undefined` under a non-optional `T`.

  **@zudojs/crypto**

  - A provider's declared `capabilities` are now consulted before every
    operation. A provider declaring `signing: false` had `sign` called anyway;
    it now throws a `CryptoError` naming the capability and the operation.
    `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and
    `passwordHashing` are all checked, including through `verifyPassword`,
    which raises rather than reporting a missing capability as a wrong password.
    A provider that declares every capability it implements is unaffected.
  - `setDefaultCryptoProvider` checks that all twelve provider methods are
    functions and that every capability flag is a boolean, so installing a
    partial object fails at the call that installs it instead of throwing a
    `TypeError` from inside whichever operation reached the missing method
    first. A rejected provider is not installed.
  - New exports: `assertProviderCapability`, `assertCryptoProvider`,
    `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability`,
    `assertPasswordHashingCapability` and `CRYPTO_PROVIDER_METHODS`, for
    anyone writing their own provider or wrapper.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `createRateLimiter` clamps its cleanup timer to 2^31 - 1 ms. A `windowMs` longer than ~24.8 days overflowed Node's timer delay, which silently became 1 ms and swept the whole store a thousand times a second.
  - Key-cap eviction in `createRateLimiter` is now O(1) (least-recently-seen order kept in the store) instead of copying and sorting every tracked key on each new key past `maxKeys`, which let key rotation turn the eviction defence into a CPU sink.
  - `validateBodyFraming` checks a repeated `Transfer-Encoding` field (`string[]`) the same way as a single one; `["gzip"]` used to pass where `"gzip"` was rejected.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close 34 audit findings across the scheduler, schema, security and serialization packages.

  Several of these are behavioural changes. Code that compiles unchanged may now
  reject input it previously accepted, or accept input it previously rejected.

  ## @zudojs/security

  **Attack detection is no longer order-dependent.** `XSS_PATTERNS` and the
  internal null-byte and control-character patterns carried the `g` flag while
  being used with `RegExp.test`, which advances `lastIndex` and resumes from there
  on the next call. `containsXss`, `isSafeString` and `detectThreats` returned
  `false` on every second call for the same payload. The flag is gone, and
  `withoutStickyFlags` is exported so callers can normalise their own patterns.

  **`generateCspNonce` no longer throws.** It called `require("node:crypto")` from
  an ESM module; the import is now top-level. It also rejects a nonce shorter than
  16 bytes.

  **Cookies are validated before serialization.** `serializeCookie` and
  `createSecureCookie` now percent-encode the value and reject an unsafe name,
  attribute, `Max-Age` or `Expires`. `SameSite=None` and `Partitioned` require
  `Secure`.

  **Forwarding headers are no longer trusted by default.** `extractClientIp` took
  the leftmost `X-Forwarded-For` entry, which any client controls. It now takes
  `{ trustProxy, remoteAddress }` and walks in from the right; with no trusted
  proxies it uses the socket address.

  **Rate limiting is a real sliding window.** Denied requests no longer accrue
  into their own bucket, the window slides rather than resetting on a fixed
  boundary, the key store has a bound with least-recently-seen eviction, and
  `defaultHandler` applies when no handler is configured.

  **Request targets reject CR and LF**, literal or percent-encoded. Traversal
  detection now decodes to a fixed point instead of pattern-matching encoded
  forms, so `.%2e` and `%2e.` are caught.

  **`isSafeUrl` allowlists protocols and range-checks addresses** — 127.0.0.0/8,
  169.254.0.0/16, 100.64.0.0/10, 0.0.0.0/8, IPv4-mapped IPv6, `fc00::/7`,
  `fe80::/10` and internal hostname suffixes are blocked, and public 172.32+ is no
  longer blocked by mistake. `isPrivateHostname` is exported for post-resolution
  checks. This still cannot stop DNS rebinding; the docblock says so.

  **CSRF** cookies carry `Secure`, tokens are HMAC-SHA256 at full width rather
  than a truncated secret-suffix hash, `sessionId` binds a token to a session,
  `expiration` is enforced as a maximum age, and `verifyDoubleSubmit` compares the
  cookie and request tokens in constant time.

  **CORS** refuses a wildcard origin combined with credentials, emits
  `Vary: Origin` whenever the origin is reflected, normalises a `/g` regex origin,
  and can validate the requested method and headers.

  **`sanitizeObject`** keeps nested arrays as arrays, survives cycles, and stops
  at `maxDepth`.

  Smaller fixes: `sanitizeHeaderValue` strips every null byte; `Content-Length` is
  validated as `1*DIGIT` with an optional maximum; `validateBodyFraming` rejects
  `Content-Length` + `Transfer-Encoding` and conflicting lengths; body limits route
  on the parsed media type, so a form post gets the JSON limit rather than the
  100 MB upload limit; `generateSecurityHeaders` ships a default CSP and HSTS,
  sends `X-XSS-Protection: 0`, and rejects a config value containing CRLF.

  ## @zudojs/scheduler

  **`CronTrigger` implements cron.** It previously returned `after + 60_000` and
  never read the expression, so every cron job ran once a minute. There is now a
  real five-field parser with ranges, steps, lists, names and macros; invalid
  expressions throw at construction, and an unsupported timezone is rejected
  rather than ignored.

  **Recurring schedules recur.** Nothing re-enqueued them, so `every()` and
  `cron()` fired exactly once. One-shot schedules are now retired instead of
  leaking, and `MAX_SCHEDULES` is enforced.

  **`ScheduleHandle` is bound to its scheduler.** `pause`, `resume` and `cancel`
  were no-ops on a detached object and `nextRun()` always returned `undefined`.

  **Job failures are reported and jobs are cancellable.** The empty catch block is
  replaced by an `onError` hook; `RetryPolicy` is implemented (fixed, linear and
  exponential backoff with `maxDelay` and jitter); executions run under a real
  `AbortController` that a timeout or `stop()` can fire; concurrency is bounded by
  `maxConcurrency`; and `OverlapPolicy` is applied. `stop()` is now async and takes
  `{ drain, timeoutMs }`.

  Smaller fixes: `parseDuration` supports `ms` and `w` and compound values, and
  rejects zero, negative and out-of-range durations that produced an Invalid Date
  whose `NaN` timestamp corrupted heap ordering; `PriorityQueue.enqueue` refuses a
  non-finite `nextRunAt`; a past fire time follows the misfire policy instead of
  throwing; timeouts raise `SchedulerJobTimeoutError` and carry the original error
  as `cause`; the scheduler and executor share one clock; and `define()` validates
  the job.

  `Scheduler` now takes an options object. The positional form still works.

  ## @zudojs/schema

  **Discriminated unions work.** The lookup was keyed on `schema._type` — the
  string `"object"` for every variant — so no input ever matched. Variants are now
  keyed on the literal value at the discriminator, with duplicate and missing
  literals rejected at construction.

  **Depth and cycle guards are wired up.** `isMaxDepthExceeded` was exported and
  never called, and `ctx.seen` was threaded through every context and never read.
  Composite schemas now enforce both. The internal failure signal is a dedicated
  class, so a bare `catch {}` no longer swallows a `RangeError` from stack
  exhaustion and reports circular input as a success.

  **`.default()` applies to a missing object key.** A defaulted property was
  classified as required, so it could never be omitted.

  **`.passthrough()` passes keys through** — it behaved identically to `.strip()`.
  `pick`, `omit`, `partial`, `required`, `extend` and `merge` now carry the
  unknown-key strategy and required-key set.

  Smaller fixes: an unrecognised format string throws instead of disabling the
  check; `.regex()` strips `g`/`y`; strings and arrays get default length bounds
  before any pattern runs; coercion accepts the documented `"1"`/`"0"` boolean
  strings and rejects empty, `Infinity`, hex and symbol input, and coerced values
  can now be constrained; union failures carry per-branch reasons; intersection
  refuses to spread primitives; tuple elements stay aligned when one fails; Map and
  Set entries get their own issue paths; object shape keys use a `hasOwnProperty`
  guard; `multipleOf` tolerates floating-point representation and rejects a zero
  step; records use the parsed key; and `schema.bigint()` and `schema.symbol()` are
  implemented rather than throwing "not yet implemented".

  ## @zudojs/serialization

  **Prototype pollution is fixed.** `restoreValue` and `transformValue` assigned
  `result[key]`, so a `__proto__` key replaced the reconstructed object's
  prototype. Both now use `defineProperty` and drop forbidden keys.
  `allowUnsafeKeys` — declared with zero references — is implemented, and reinstates
  them as real own properties.

  **An unknown `$type` tag is data, not a crash.** Any peer could stop a consumer
  with `{"$type":"anything"}`, and legitimate payloads carrying a `$type` field
  were unparseable. Strict mode still reports it. `deserialize` is now
  size-bounded; `maxSize` previously applied only on the way out.

  **Map and Set round-trip their children.** Deserialization dispatched to the
  transformer without restoring children first, so a Map of Dates came back full
  of raw `{$type, $value}` objects.

  **Error stacks are opt-in** via `includeStack`, and a wire-supplied stack is
  carried as `originalStack` rather than overwriting the real one.

  **Envelope metadata is enforced**: the schema version is checked, malformed
  envelopes raise a domain error, `contentType` is derived from the format,
  an unsupported encoding is rejected, and `createSerializer`'s `pretty` and
  `preserveTypes` options are applied instead of discarded.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5)]:
  - @zudojs/errors@0.2.0

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
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
