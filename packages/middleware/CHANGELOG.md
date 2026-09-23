# @zudojs/middleware

## 1.1.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.1.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.1.0

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

## 1.0.3

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.0.2

### Patch Changes

- Round 10 fixes:

  - MW-01: `rateLimitMiddleware` refreshes a key's recency when it rejects a request, so a throttled key is no longer the first one evicted once `maxKeys` is reached. One new key can no longer reset a throttled client's window.
  - XP-01: `MiddlewareError`, `MiddlewareTimeoutError` and `MiddlewareNextCalledMultipleTimesError` are now re-exports of the `@zudojs/errors` classes, and the package-only errors (`MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`) extend the shared `MiddlewareError`. `instanceof` checks against either import path now match. Consequences: codes become `ERR_MIDDLEWARE_EXECUTION` / `ERR_MIDDLEWARE_TIMEOUT` (were `ERR_OPERATION_FAILED`), category becomes `middleware` (was `internal`), `middlewareName` is an own property instead of `metadata.middlewareName`, the timeout and next()-twice messages gain a trailing period, and `MiddlewareNextCalledMultipleTimesError` is non-operational.
  - CONV-02: `loggingMiddleware()` without a logger and `withTiming()` without `options.logger` no longer write to `console.log` / `console.warn`; they write nothing. Pass a sink such as `(line) => log.info(line)` from `@zudojs/logger`.
  - CV-02 (phase 2): `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError` and `MiddlewareAbortedError` are now re-exports of the `@zudojs/errors` classes (same constructors, messages and fields), so every middleware error class is the shared one.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `sanitizeLogValue()` (used by `loggingMiddleware`) now escapes the Unicode line separator (U+2028), paragraph separator (U+2029), next-line (U+0085) and the C1 control range, so a request path containing them can no longer split a log line.
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
