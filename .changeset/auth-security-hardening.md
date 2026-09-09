---
"@zudojs/auth": minor
---

Security hardening across tokens, sessions, login and password handling.

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

**OAuth2 has moved to `@zudojs/auth-oauth`.** This package advertised OAuth2 in
its npm description while exporting `OAuthProvider`, `OAuthConfig`,
`OAuthUserInfo`, `OAuthResult` and `AuthStrategy` with zero implementation — no
authorize-URL builder, no code exchange, no state or PKCE handling, no user-info
fetch, and no strategy registry. **Those five type exports are removed.** The new
`@zudojs/auth-oauth` package implements the flow for real; install it if you need
OAuth2. `PasswordCredentials` and `ApiKeyCredentials` moved to
`authCredentials.type.ts` and are unchanged for consumers.
