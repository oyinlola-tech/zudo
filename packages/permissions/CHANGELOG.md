# @zudojs/permissions

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
