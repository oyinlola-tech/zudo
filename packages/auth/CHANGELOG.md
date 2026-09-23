# @zudojs/auth

## 1.3.1

### Patch Changes

- Updated dependencies [`e546629`, `e546629`]:
  - @zudojs/permissions@1.4.1

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
  - @zudojs/crypto@1.3.1
  - @zudojs/permissions@1.4.0
  - @zudojs/types@1.2.0

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `95c1d56`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/permissions@1.3.0
  - @zudojs/crypto@1.3.0
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`d2b01bf`, `5d6b957`, `d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/crypto@1.2.0
  - @zudojs/errors@1.1.0
  - @zudojs/permissions@1.2.0

## 1.1.0

### Minor Changes

- - **Sessions with a `NaN` lifetime never expired.** `createMemorySessionStore().create()` accepted `ttlSeconds: NaN` (the usual source is `Number(process.env.X)` with `X` unset), produced an `Invalid Date` expiry, and then never reclaimed the session — not even at its absolute deadline. `ttlSeconds` and `absoluteTtlSeconds` must now be finite and greater than zero; anything else throws `AuthConfigurationError`. `createAuthService()` applies the same check to `sessionTtlSeconds` / `absoluteSessionTtlSeconds` at construction.
  - **Login throttling could be bypassed with case or whitespace variants of the identifier.** Attempt counters were keyed by the raw submitted string, so `alice@example.com`, `Alice@example.com` and ` alice@example.com` each had an independent failed-attempt budget against one account. The throttle key is now the identifier trimmed, NFKC-normalised and lower-cased. Custom `LoginAttemptStore` implementations receive the normalised key.
  - `createAuthService()` now validates its `TokenConfig` at construction (missing/short/identical secrets, out-of-range clock tolerance) instead of at the first `login()`, and `createTokenPair()` / the verifiers reject a non-finite (`NaN` / `Infinity`) `accessTtl` or `refreshTtl` with `AuthConfigurationError` rather than minting tokens whose `exp` serialises as `null` and can never verify. Zero and negative TTLs are still accepted (they mint already-expired tokens).
  - README: `findUserById` is documented as required (it always was); there is no fallback to `findUser(sub)`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/permissions@1.1.0
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Security hardening across tokens, sessions, login and password handling.

  This closes 28 audit findings. Nearly all are breaking, none can be delivered
  compatibly — a synchronous `verifyToken` cannot consult a session store, and a
  permissive `checkAccess` fallback cannot fail closed. Read this before
  upgrading.

  **Every auth error had the wrong status code.** `authError.base.ts` never set
  `statusCode`, so all ten error classes inherited `500` / `expose: false` from
  `@zudojs/errors` — a wrong password answered `500`. They now carry accurate
  codes (401/403/423/429), `expose: true`, and corrected categories
  (`authorization` / `rate_limit` where appropriate). Anything keying off the old
  `500` will see different HTTP responses.

  **`logout()` now actually invalidates.** Sessions were created at login and
  destroyed at logout but read by nothing, so logging out invalidated no token and
  `SessionExpiredError` was never thrown. Tokens issued by `login()` now carry a
  signed `sid` claim and stop verifying once the session is destroyed or expires.
  `AuthService.verifyToken(token)` is consequently **async**, returning
  `Promise<TokenPayload>`, and throws `SessionExpiredError` when the session is
  gone. `logout()` takes an optional `refreshToken`, and `logoutAll(userId)` is new.

  **`refresh()` re-loads the user.** It previously trusted the token, so
  deactivation and role demotion were ineffective for the full 7-day refresh TTL.
  It now throws `AccountDeactivatedError` when the user is missing or inactive.
  **`findUserById` is required config** — `findUser` is keyed by the login
  identifier, usually an email, so silently reusing it would make every refresh
  fail closed at runtime; requiring it surfaces the mismatch at compile time. If
  your `findUser` really is id-keyed, pass it for both.

  **Refresh-token replay is detected.** Rotation was a check-then-act race across
  two awaits, so a stolen token could be replayed concurrently and undetected.
  Claiming is now atomic, and replaying a used refresh token destroys **all** of
  that user's sessions (RFC 6819 §5.2.2.3). `TokenRevocationStore.revokeIfNotRevoked?()`
  is new — optional, but the `isRevoked` + `revoke` fallback is racy, so implement
  it in production stores.

  **Login is no longer an account-existence oracle.** `AccountDeactivatedError`
  was thrown _before_ the password was verified, and the unknown-user path skipped
  scrypt entirely, leaking account existence by both response and timing. A
  deactivated account with a wrong password now yields `InvalidCredentialsError`,
  and the unknown-user path performs equivalent work.

  **Empty signing secrets no longer produce forgeable tokens.** `createTokenPair`,
  `verifyAccessToken`, `verifyRefreshToken` and `refreshAccessToken` throw
  `AuthConfigurationError` for missing, under-32-byte, or identical access/refresh
  secrets. `refreshAccessToken` therefore throws rather than returning `null` for
  bad config.

  **Untrusted input is now bounded.** Tokens over 8 KB, and JOSE header segments
  over 1 KB, are rejected as malformed — the header was previously `JSON.parse`d
  _before_ signature verification. `hashPassword` throws for a non-string
  password, one over 1024 bytes, or a `saltLength` outside 16–64;
  `generateRandomToken` throws outside 16–1024 bytes. `parseCookies` returns a
  **null-prototype** object and caps at 100 pairs / 8 KB.

  **`checkAccess()` fails closed** and takes a single `GuardContext`
  (`{ userId, roles, permission, resourceOwnerId? }`) instead of four positional
  arguments. It throws `AuthConfigurationError` when no `permissions` engine is
  configured; the old permissive fallback now requires
  `allowInsecureFallbackGuard: true`.

  **`nbf` is honoured and forward-dated `iat` rejected.** Add
  `TokenConfig.clockToleranceSeconds` if your fleet's clocks drift.

  **`AuthSession.active` was removed** — nothing ever set it to `false`. Custom
  `SessionStore` implementations constructing an `AuthSession` literal must drop
  the field.

  **New:** `toUserId` and `toSessionId` brand helpers (`UserId` and `SessionId`
  had no public constructor, so callers holding an id from a database row or a
  cookie had no way to build one without a cast). Also `AuthConfigurationError`,
  `AuthService`, `UserByIdLookup`, `createMemoryLoginAttemptStore` and the
  login-throttle types, `MIN_SALT_LENGTH`, `MAX_SALT_LENGTH`,
  `MAX_PASSWORD_BYTES`. New config: `absoluteSessionTtlSeconds`, `loginThrottle`,
  `allowInsecureFallbackGuard`, `fallbackAdminRole`,
  `CreateSessionOptions.absoluteTtlSeconds`, `AuthSession.absoluteExpiresAt`,
  `TokenPayload.sid`. `createMemorySessionStore()` and
  `createMemoryTokenRevocationStore()` accept `{ purgeIntervalMs }`.

  **Removed claim:** the package description advertised OAuth2 while exporting
  `OAuthProvider`/`OAuthConfig`/`OAuthUserInfo`/`OAuthResult`/`AuthStrategy` with
  zero implementation. The claim is removed and those types are marked
  contract-only.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5)]:
  - @zudojs/errors@0.2.0
  - @zudojs/permissions@0.1.1

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/permissions@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/permissions@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/permissions@0.0.2

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
  - @zudojs/permissions@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/permissions@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/permissions@0.1.1
