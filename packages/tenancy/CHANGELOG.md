# @zudojs/tenancy

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/middleware@1.1.1

## 1.3.1

### Patch Changes

- Post-release ergonomics. Both changes are additive, and existing code behaves as before.

  - **permissions:** `authorize()`, `createRequirePermissionMiddleware` and `createRequirePermissionsMiddleware` take a new `onMissingResource` option: `"check"` (the default), `"forbid"` or `"notFound"`. It decides what the guard does when `extractResource` returns `undefined` or `null`. Under the default, the guard evaluates the permission with no resource, as it always has. A role grant then lets the request reach the handler, which still had to answer 404 itself. `"notFound"` answers **404** without evaluating. `"forbid"` answers **403** without evaluating. The optional `notFoundResponse` shapes the 404 body. The guard records the new `RESOURCE_NOT_FOUND_DECISION` (`reason: "resource_not_found"`) under `permissions:decision`. The option has no effect on a guard without `extractResource`. A request with no actor still gets 401 first. Also new: `createNotFoundResponse`, `refuseMissingResource`, and the `MissingResourceMode`, `MissingResourceOptions`, `MissingResourceRefusal` and `NotFoundResponseOptions` types. The README explains the trade-off. A 404 conceals whether a resource exists only when used consistently: a denial on an existing resource still answers 403, so on their own, 404 and 403 together confirm which ids exist.
  - **tenancy:** `createResolveTenantMiddleware`'s `resolver` accepts a chain from `createResolverChain` as it is. Before, it needed `chain.asResolver()`. Passing the chain itself was a type error, and if cast through, every request was refused, because a chain's `resolve` returns `{ resolution, candidates, conflict }`, which carries no `trust`. A chain is now recognised by its `asResolver` method and adapted, and `.asResolver()` still works. The new `TenantResolverSource` type names the accepted union.
  - **tenancy:** `getClaims` (on `createResolveTenantMiddleware` and `createHttpResolverContext`) is generic over the middleware context it reads, bounded by tenancy's structural mirror. A helper typed with `@zudojs/http`'s `HttpMiddlewareContext` is now accepted without a cast. Before, it was rejected because the mirror's request lacks the real request's members. A reader for anything that is not a middleware context is still a type error. The new `TenantClaimsReader` type names the option's function type.

## 1.3.0

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
  - @zudojs/constants@1.1.2
  - @zudojs/middleware@1.1.0

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- - `createPathResolver({ prefix })` no longer names a tenant for paths outside the prefix. Previously `/health` resolved to a tenant called `health`, and `/admin/...` to whichever tenant was called `admin`.
  - `createResolveTenantMiddleware` accepts `optional: true`, letting a request that resolves to no tenant proceed without one. This makes `createRequireTenantMiddleware({ requirement: "optional" })` reachable; the default remains a `404`, and a tenant that was named but is unknown, untrusted or suspended is still refused.
  - `requireCurrentTenant`, `runAs` (context manager) and `requireActive` (tenant manager) no longer depend on `this`, so they work when destructured off the manager instead of throwing a `TypeError`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/http@1.1.0
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Stop tenant resolution failing open, and make the HTTP adapter usable.

  These are behavioural changes to a security boundary. Requests that previously
  resolved to a tenant may now be refused.

  **A resolver that rejects a credential aborts the chain.** Every resolver ran
  inside `try { … } catch { /* skip */ }`. For a resolver that found nothing,
  skipping is right; for the JWT resolver, a throw means the signature failed to
  verify or the token expired — and the chain went on to the next resolver, which
  is the client-controlled `x-tenant-id` header. A forged JWT therefore let the
  caller name any tenant, labelled `trust: "verified"` with `conflict: false`. A
  throw from any resolver now raises `TenantResolutionError`; returning
  `undefined` remains the way to say "found nothing".

  **Conflicts throw by default.** Two resolvers naming different tenants is the
  signature of an attempted cross-tenant request; it was resolved silently in
  favour of the highest priority. `throwOnConflict` now defaults to true. The
  chain also stops at the first match unless `detectConflicts` is set, which is
  what that previously-unread option now does.

  **The HTTP middleware can drive the shipped resolvers.** It passed the raw
  `HttpMiddlewareContext` to `resolver.resolve()`, while every resolver in the
  package expects a narrow accessor object — so it type-checked (the context
  parameter defaulted to `unknown`) and threw `context.getHeader is not a
function` on the first request. The middleware now builds that accessor.
  `ResolveTenantMiddlewareOptions.resolver` is typed
  `TenantResolver<HttpResolverContext>`, so a mismatch is a compile error. Token
  claims are read from `tenancy:claims` in middleware state, or from a
  `getClaims` option.

  **Trust is enforced, and the header is untrusted by default.**
  `assertTrustLevel` existed and was called by nothing. The resolve middleware
  now takes `minimumTrust` and refuses a resolution below it. `x-tenant-id` is
  graded `untrusted` rather than `verified`, because the value is client-supplied
  unless a trusted proxy overwrites it — pass
  `createHeaderResolver({ trust: "verified" })` where the edge guarantees that.

  **Non-active tenants are refused during resolution,** rather than only by a
  separate guard middleware someone had to remember to install. Pass
  `allowInactive: true` on routes that exist to serve suspended tenants.
  `createContextManager` applies the same rule to background jobs, which is where
  no HTTP guard runs at all.

  **`createTenantId` validates.** It previously rejected only empty and
  whitespace, so a header could produce a tenant id containing `:`, `/` or `..`.
  Ids are now normalized (NFKC, trimmed, lowercased) and constrained to
  `^[a-z0-9][a-z0-9_-]*$` with a 64-character cap, throwing `InvalidTenantIdError`
  rather than a bare `Error`. `tryCreateTenantId` and `isValidTenantId` are the
  non-throwing forms, and resolvers use them so an unusable candidate means
  "found nothing". `tenantKey` escapes its segments, so a key of `"cache:k"` can
  no longer collide with another tenant's namespace.

  **The memory repository indexes domains and drops stale entries.**
  `findByDomain` could never return a tenant: nothing populated the index.
  `add(tenant, domains)` now registers them, and re-adding a tenant re-indexes it,
  so a changed slug no longer leaves the pre-update record — including its
  pre-suspension status — reachable under the old one.

  **Subdomain resolution is case-insensitive,** refuses multi-label subdomains
  unless `allowMultiLabel` is set, and parses the authority rather than splitting
  on `":"`, which mangled bracketed IPv6 hosts.

  **Other corrections.** `assertTrustLevel` raises a new `TenantTrustLevelError`
  carrying the source and both levels in metadata, instead of formatting a
  sentence into `TenantAccessDeniedError`'s tenant-id field. The tenant cache
  takes a `cacheTtlMs` (30s default), bounding how long a suspended tenant keeps
  being served. Both 404 paths in the resolve middleware return the same body, so
  it is no longer a tenant-existence oracle.

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
