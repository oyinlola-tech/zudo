# @zudojs/permissions

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
  - @zudojs/middleware@1.1.3
  - @zudojs/errors@1.4.0

## 1.4.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/middleware@1.1.2

## 1.4.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/middleware@1.1.1

## 1.4.1

### Patch Changes

- Post-release fixes.

  - **observability (security):** `redaction.fields` replaced the default names and @zudojs/logger's matcher, and `DEFAULT_SENSITIVE_FIELDS` lacked `jwt`, `sid`, `pwd`, `passphrase` and `bearer`. As a result the documented `fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"]` redacted less than the default: `redactObject({ jwt: "x" }, { fields: [...DEFAULT_SENSITIVE_FIELDS] })` returned `{ jwt: "x" }`. `DEFAULT_SENSITIVE_FIELDS` is now the effective default list, built from the logger's `DEFAULT_LOGGER_SECRET_FIELDS` plus this package's extra spellings, and it is frozen. **Behaviour change:** `fields` now _extends_ the defaults, so it can only add redaction. `fields: ["ssn"]` now redacts `ssn` and every default name, where before it redacted only `ssn`. To get the old replace behaviour, pass the new `replaceDefaults: true`.
  - **security (security):** `createCsrfProtection().verify` and `requiresCsrfProtection` let any method outside the protected list skip the check, so `""`, `" "`, `"POST "`, `"FOO"` and `"CONNECT"` returned `true` with no token. The rule now fails closed. Only GET, HEAD, OPTIONS and TRACE skip the check, matched exactly after upper-casing and without trimming. When `methods` is configured, a standard HTTP method that the list leaves out is also exempt, as before (`methods: ["DELETE"]` still exempts POST). Every other value is verified.
  - **security:** cookie `Path` accepted non-ASCII such as `"/ä"`. It must now be printable ASCII (0x20–0x7E) with no `;` or `,`. That is RFC 6265's `path-value` plus the `,` this package already refused. Percent-encode anything else. Space stays allowed, because the RFC allows it and the existing rules accepted it on purpose. `generateCsrfCookie` and `createCsrfProtection` now apply the same `Path` check and throw `ValidationError`. Before, they wrote `path` into `Set-Cookie` unchecked.
  - **permissions:** a policy with `effect: "grant"` (new in 1.4.0) denied when it returned `false`. An ownership policy therefore denied editors whose role grants the permission, and the workaround was `|| actorHasRole(...)`. A per-policy `effect: "grant"` now grants when it allows and abstains when it returns `false`, throws or times out. It can add access but can never take away what roles, permissions or rules grant. Throws and timeouts are still reported through `onError`. Denials still work as before: a constraining policy's `false` denies, and a grant never overrides a deny rule, `deniedPermissions` or another policy's denial. `defaultPolicyEffect: "grant"` keeps the pre-1.4 semantics unchanged for policies that set no `effect`: an allowing policy grants and a denying one denies.

- Post-release ergonomics. Both changes are additive, and existing code behaves as before.

  - **permissions:** `authorize()`, `createRequirePermissionMiddleware` and `createRequirePermissionsMiddleware` take a new `onMissingResource` option: `"check"` (the default), `"forbid"` or `"notFound"`. It decides what the guard does when `extractResource` returns `undefined` or `null`. Under the default, the guard evaluates the permission with no resource, as it always has. A role grant then lets the request reach the handler, which still had to answer 404 itself. `"notFound"` answers **404** without evaluating. `"forbid"` answers **403** without evaluating. The optional `notFoundResponse` shapes the 404 body. The guard records the new `RESOURCE_NOT_FOUND_DECISION` (`reason: "resource_not_found"`) under `permissions:decision`. The option has no effect on a guard without `extractResource`. A request with no actor still gets 401 first. Also new: `createNotFoundResponse`, `refuseMissingResource`, and the `MissingResourceMode`, `MissingResourceOptions`, `MissingResourceRefusal` and `NotFoundResponseOptions` types. The README explains the trade-off. A 404 conceals whether a resource exists only when used consistently: a denial on an existing resource still answers 403, so on their own, 404 and 403 together confirm which ids exist.
  - **tenancy:** `createResolveTenantMiddleware`'s `resolver` accepts a chain from `createResolverChain` as it is. Before, it needed `chain.asResolver()`. Passing the chain itself was a type error, and if cast through, every request was refused, because a chain's `resolve` returns `{ resolution, candidates, conflict }`, which carries no `trust`. A chain is now recognised by its `asResolver` method and adapted, and `.asResolver()` still works. The new `TenantResolverSource` type names the accepted union.
  - **tenancy:** `getClaims` (on `createResolveTenantMiddleware` and `createHttpResolverContext`) is generic over the middleware context it reads, bounded by tenancy's structural mirror. A helper typed with `@zudojs/http`'s `HttpMiddlewareContext` is now accepted without a cast. Before, it was rejected because the mirror's request lacks the real request's members. A reader for anything that is not a middleware context is still a type error. The new `TenantClaimsReader` type names the option's function type.

## 1.4.0

### Minor Changes

- Guards now refuse with real status codes, and permission policies no longer grant access on their own.

  **Security — `@zudojs/permissions`: a policy's allow is no longer a grant (behaviour change).** An allowing policy used to grant the permission without any role check, so a "business-hours" policy handed `task:delete` to an actor with no roles, and the README taught that pattern. A policy is now, by default, an extra condition on top of RBAC/ABAC (`effect: "constrain"`): it can deny, but an allow only means "no objection", and the actor's roles, permissions or rules must still grant the permission. A policy that really establishes the right on its own, such as an ownership check, opts in with `effect: "grant"`. To get the old behaviour back for every policy that sets no `effect`, pass `createPermissionEngine({ defaultPolicyEffect: "grant" })`. **If you relied on a policy to grant access, those checks now deny until you add `effect: "grant"`.** A granting policy still never overrides a denial, and only the exact value `"grant"` grants (a typo constrains). An allow from constraining policies alone now reports `reason: "policy_pass"` internally. New exports: `PolicyEffect`, `policyGrants`, `DEFAULT_POLICY_EFFECT`.

  **Security / misreporting — denials were sent as `200`.** A route middleware that returned a plain `{ status, body, headers }` object had it ignored by `@zudojs/http`, so `authorize()` and the tenancy middleware refused requests (the handler never ran) but clients, caches and monitoring saw `200`. The fix is a small, explicit contract:

  - `@zudojs/middleware`: new `createGuardResponse({ status, body?, headers? })`, `isGuardResponse()`, the `GuardResponse` type and the `GUARD_RESPONSE` brand (`Symbol.for("zudojs.middleware.guardResponse")`). A structured body gets `content-type: application/json` by default. A status outside 100–599 throws `RangeError`.
  - `@zudojs/http`: the router, `HttpMiddlewarePipeline` and `RouteDispatcher` send a guard response with its status, headers and JSON body, keeping headers an outer middleware already set. `HttpMiddlewareResult` includes `GuardResponse`. New helpers `applyGuardResponse` and `guardResponseToContext`. An unbranded object keeps its previous meaning, so data with a `status` key is never read as a response. `@zudojs/http` now depends on `@zudojs/middleware`.
  - `@zudojs/permissions`: `createForbiddenResponse`, `createUnauthorizedResponse` and `createJsonResponse` (and therefore `authorize()`, `createRequirePermissionMiddleware`, `createRequirePermissionsMiddleware` and `createActorMiddleware({ requireActor: true })`) return guard responses. `PermissionHttpResponse` is now an alias of `GuardResponse` (same fields plus the brand). `createJsonResponse` throws `RangeError` for a status outside 100–599.
  - `@zudojs/tenancy`: `createResolveTenantMiddleware`, `createRequireTenantMiddleware`, `createTenantGuardMiddleware` and the helpers `createBadRequest`, `createUnauthorized`, `createForbidden`, `createNotFound`, `createJsonErrorResponse` return guard responses, including the custom `notFoundResponse` / `deniedResponse` bodies. New helper `createJsonResponse(status, body)`.

  **Middleware types are assignable to `@zudojs/http`.** The `HttpMiddleware` types mirrored in `@zudojs/permissions` and `@zudojs/tenancy` are now generic over what `next()` returns, so every exported guard can be put in a route's `middleware` list without `as never`. A hand-written middleware typed with these mirrors can no longer return a plain `{ status, body, headers }` object (it was never sent as a response); return `createGuardResponse(...)` instead. New type `HttpMiddlewareOutcome`.

  **`@zudojs/tenancy`: `createResolverChain([...])` infers its context.** The README Quick Start (`createResolverChain([createJwtResolver(), createDomainResolver({ repository }), createSubdomainResolver(...)])`) failed with TS2322 unless you wrote `<HttpResolverContext>`. The context is now the intersection of what the resolvers read; an explicit type argument still works. New type `ResolverChainContext`.

  **`@zudojs/auth`:**

  - `AccountLockedError` (423) and `AuthRateLimitError` (429) carry `retryAfterSeconds` and a `Retry-After` header in `headers`, which `@zudojs/http` copies onto the response; the lockout's value is the time left on the lock.
  - Distinct error codes (behaviour change for clients that match codes): `AccountLockedError` is `ERR_ACCOUNT_LOCKED`, `AccountDeactivatedError` is `ERR_ACCOUNT_DEACTIVATED`, and `TokenRevokedError` is `ERR_TOKEN_REVOKED`; all three used to be `ERR_FORBIDDEN`. **`TokenRevokedError` is now `401` (category authentication) instead of `403`**, since the client has to authenticate again.
  - `needsRehash()` returns `false` for a hash made with `@zudojs/crypto`'s own `hashPassword()` defaults (same N, r, p; 16-byte salt and 32-byte key), which it used to flag on every login.
  - Security: `login()` normalizes the identifier before `findUser()` sees it (NFKC, trim, and lower-case for an email address; usernames keep their case). Use the new `normalizeLoginIdentifier()` at registration so both sides agree. `normalizeIdentifier: false` passes the raw string, or supply your own function. Lockout counters were already case-insensitive.
  - New `createSessionForUser(userId, { method, userAgent?, ip?, metadata? })` issues a session and tokens for a user authenticated outside `login()`, such as the `@zudojs/auth-oauth` callback, without a password check. It is off by default: it throws `AuthConfigurationError` unless `method` is listed in the new `externalSessionMethods` option. It refuses unknown and deactivated users and records `metadata.authMethod` on the session. `@zudojs/auth` now depends on `@zudojs/types`.

  **`@zudojs/errors`:** new codes `ErrorCode.TOKEN_REVOKED`, `ErrorCode.ACCOUNT_LOCKED` and `ErrorCode.ACCOUNT_DEACTIVATED`.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/middleware@1.1.0

## 1.3.0

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

## 1.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 — authorization fixes.

  - A deny rule is no longer overridden by an allowing policy. `deny-overrides` said any applicable deny wins, yet a policy allowing `post:*` cancelled a `deny post:update` rule. A check the rules denied now stays denied, with `reason: "rule_deny"` (previously `"no_matching_rule"`) and the rule's name in `decision.policy`.
  - Cache keys escape `|` (and `\`) inside actor and resource ids. Actor `u|post:read` checking `x:y` used to share a key with actor `u` checking `post:read` on resource `x:y`, so one actor's cached decision could answer for another. Ids without those characters produce the same keys as before.
  - An `Ability` now reads a live policy registry. It captured the policy list when it was created, so a policy defined (or removed) afterwards was enforced by `engine.can()` and ignored by `ability.can()` for the same actor.
  - `createRoleRegistry().define()`, `createPolicyRegistry().define()` and the inline `roles` array copy the `permissions`, `inherits` and `rules` arrays they are given. Mutating the caller's array after registration no longer widens a role or re-scopes a policy behind validation.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/http@1.1.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/http@0.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`6bec11b`](https://github.com/oyinlola-tech/zudo/commit/6bec11bcd56041d3590d5fea932d4ea99ad1861d)]:
  - @zudojs/http@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`641c4c5`](https://github.com/oyinlola-tech/zudo/commit/641c4c5f9616d73e150b1598ae1b4abf05de23e4)]:
  - @zudojs/http@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`8d91db6`](https://github.com/oyinlola-tech/zudo/commit/8d91db68f93219803db971f2f855ec55af6c8dbf)]:
  - @zudojs/http@0.0.2

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
  - @zudojs/http@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/http@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/http@0.1.1
