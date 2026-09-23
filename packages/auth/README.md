# @zudojs/auth

Authentication primitives: JWT access/refresh tokens, server-side sessions,
scrypt password hashing, brute-force lockout, and RBAC delegation to
[`@zudojs/permissions`](https://www.npmjs.com/package/@zudojs/permissions).

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-auth](https://zudojs.oyinlola.site/docs/packages-auth) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-auth.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/auth
```

## Quick start — the auth service

`createAuthService()` is the primary entry point. It ties the tokens, the
session store, the password verifier and the permission engine together, and
it is the only path that gives you working logout, refresh-token rotation and
account-state enforcement.

```typescript
import {
  createAuthService,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
  createMemoryLoginAttemptStore,
  hashPassword,
  verifyPassword,
  type AuthUser,
  type TokenConfig,
} from "@zudojs/auth";
import { createPermissionEngine } from "@zudojs/permissions";

// Secrets must be at least 32 bytes and must differ from each other; the
// package throws AuthConfigurationError otherwise. Never rely on `!` — an
// env var that is set-but-empty is `""`, not `undefined`.
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to at least 32 characters`);
  }
  return value;
}

const tokenConfig: TokenConfig = {
  accessSecret: requireSecret("JWT_ACCESS_SECRET"),
  refreshSecret: requireSecret("JWT_REFRESH_SECRET"),
  accessTtl: 900, // seconds (15 minutes)
  refreshTtl: 604_800, // seconds (7 days)
  issuer: "my-api",
  audience: "my-app",
  clockToleranceSeconds: 5, // optional skew allowance for exp/iat/nbf
};

const auth = createAuthService({
  token: tokenConfig,

  // Required: where sessions live. Swap for a Redis-backed SessionStore in
  // production — the in-memory store is per-process.
  sessionStore: createMemorySessionStore(),

  // Required: idle timeout for a session, in seconds.
  sessionTtlSeconds: 86_400,
  // Recommended: hard ceiling on session age, regardless of activity.
  absoluteSessionTtlSeconds: 7 * 86_400,

  // Required: look up a user by the identifier submitted at login.
  findUser: async (identifier) => findUserByEmail(identifier),

  // Required: look up a user by id (the token's `sub` claim). `refresh()`
  // uses it to re-load the user on every rotation, so deactivations and
  // role changes take effect immediately. It is keyed differently from
  // `findUser` — do not pass an email-keyed lookup here.
  findUserById: async (id) => findUserById(id),

  // Required: check a plain-text password for a user id.
  verifyPassword: async (userId, password) =>
    verifyPassword(password, await loadHash(userId)),

  // Optional: enables atomic refresh-token rotation and replay detection.
  revocationStore: createMemoryTokenRevocationStore(),

  // Optional: failed-attempt lockout + login rate limiting. Counters are
  // keyed by the submitted identifier, trimmed and case-folded, so
  // "Alice@Example.com" and "alice@example.com" share one budget.
  loginThrottle: {
    store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
    maxFailedAttempts: 5, // -> AccountLockedError (423)
    lockoutSeconds: 900,
    maxAttemptsPerWindow: 20, // -> AuthRateLimitError (429), per identifier
  },

  // Optional: real permission matching. Without it, `checkAccess()` throws
  // unless you also set `allowInsecureFallbackGuard: true` (see below).
  permissions: createPermissionEngine({
    roles: [{ name: "admin", permissions: ["*:*"] }],
  }),
});

const { user, tokens, sessionId } = await auth.login(
  { identifier: "alice@example.com", password: "correct horse battery" },
  { userAgent: req.headers["user-agent"], ip: req.socket.remoteAddress },
);

const payload = await auth.verifyToken(tokens.accessToken); // async
const rotated = await auth.refresh(tokens.refreshToken);

await auth.logout(sessionId, tokens.refreshToken); // kills both tokens
await auth.logoutAll(user.id); // sign out everywhere
```

### Sessions are the kill switch

`login()` stamps the session id into both tokens as a `sid` claim.
`verifyToken()` and `refresh()` require that session to still exist, so
`logout()` / `logoutAll()` invalidate outstanding access **and** refresh
tokens immediately rather than leaving them live for their natural lifetime.
Tokens minted with the standalone `createTokenPair()` carry no `sid`, so no
logout can revoke them. **The service therefore rejects a token without a
`sid` (`TokenInvalidError`) unless you set `allowSessionlessTokens: true`.**
Accepting them by default let a session-less refresh chain outlive
`logoutAll()`.

### Login identifiers

`login()` normalizes the identifier before `findUser()` sees it: NFKC, trim,
and lower-case when it is an email address (a username keeps its case). So
`" Alice@Example.COM"` finds the account stored as `alice@example.com`, and
case variants share one lockout budget. Store identifiers through the same
exported `normalizeLoginIdentifier()` at registration. Pass
`normalizeIdentifier: false` to receive the raw string, or your own function.

### Brute-force lockout

A locked identifier gets `AccountLockedError` (`423`, `ERR_ACCOUNT_LOCKED`)
with `retryAfterSeconds` set to the time left on the lockout and a
`Retry-After` header in `error.headers`, which `@zudojs/http` copies onto the
response. `AuthRateLimitError` (`429`) carries `Retry-After` the same way.

A failure is reserved *before* the password is checked and cleared on
success, so a parallel burst gets exactly `maxFailedAttempts` guesses before
the lockout, not `maxAttemptsPerWindow`. Custom `LoginAttemptStore`s must make
`recordFailure` atomic for this to hold.

The budgets are **per identifier**. An attacker rotating identifiers is not
limited by them, and every unknown identifier still costs one scrypt
verification, so put a per-IP limiter (`createRateLimiter` from
`@zudojs/security`) in front of `login()`.

`createMemoryLoginAttemptStore({ failureTtlSeconds, maxEntries })` forgets an
unlocked failure streak after `failureTtlSeconds` of inactivity (default 900)
and caps the tracked identifiers at `maxEntries` (default 100 000, oldest
unlocked evicted first), so spraying identifiers cannot grow it without bound.

### Sessions for OAuth and other sign-ins

A user authenticated some other way — the OAuth callback of
[`@zudojs/auth-oauth`](../auth-oauth), a passkey, a magic link — gets a
session and tokens from `createSessionForUser()`, exactly as `login()` would
issue them, without a password check:

```typescript
const auth = createAuthService({
  /* … */
  externalSessionMethods: ["oauth"], // off by default
});

// In the OAuth callback, after state/PKCE were verified and the provider
// identity was mapped to one of your users:
const { tokens, sessionId } = await auth.createSessionForUser(user.id, {
  method: "oauth",
  metadata: { provider: "github" }, // stored on the session
  ip: req.socket.remoteAddress,
});
```

It checks no credential — your code asserts the user is authenticated — so
it throws `AuthConfigurationError` unless the `method` is listed in
`externalSessionMethods`. It still loads the user with `findUserById()` and
refuses an unknown user (`InvalidCredentialsError`) or a deactivated one
(`AccountDeactivatedError`). **Never pass it a user id taken from the
request.** The session records `metadata.authMethod`, and `logout()` /
`logoutAll()` revoke it like any other.

### Refresh-token rotation

With a `revocationStore` configured, `refresh()` claims the presented token's
`jti` atomically (via `revokeIfNotRevoked`) before minting the next pair.
Replaying an already-used refresh token throws `TokenRevokedError` **and**
destroys every session for that user, on the assumption that the chain is
compromised (RFC 6819 §5.2.2.3). Implement `revokeIfNotRevoked` in any custom
store — the `isRevoked` + `revoke` fallback is racy.

### Access control

```typescript
const decision = await auth.checkAccess({
  userId: user.id,
  roles: user.roles,
  permission: "billing:refund",
  resourceOwnerId: invoice.ownerId, // optional
});
```

When a `permissions` engine is configured the decision comes from it, with
`resourceOwnerId` passed as the resource `{ ownerId }`. An ownership policy
that should grant on its own must say `effect: "grant"` — since
`@zudojs/permissions` 1.4 an allowing policy only constrains what the roles
grant. When it is not, `checkAccess()` **throws** `AuthConfigurationError` rather than
guessing. Setting `allowInsecureFallbackGuard: true` opts into a built-in
fallback that grants a resource owner *every* permission and grants the
`fallbackAdminRole` (default `"admin"`) everything; its allowed results carry
a `reason` naming the fallback so the decision is auditable.

## Standalone JWT helpers

```typescript
import { jwt, createTokenPair, verifyAccessToken } from "@zudojs/auth";

const tokens = createTokenPair(userId, tokenConfig, { roles: ["editor"] });
const result = verifyAccessToken(tokens.accessToken, tokenConfig);
```

The `jwt` namespace bundles `createTokenPair`, `verifyAccessToken`,
`verifyRefreshToken`, `refreshAccessToken`, `createMemoryTokenRevocationStore`,
`parseBearerToken`, `isTokenExpired` and `extractUserId`.

`jwt.refreshAccessToken()` is the **non-rotating** variant: it checks the
signature, expiry and type and nothing else — no revocation store, no user
re-load, no session check — so a stolen refresh token stays replayable for its
full lifetime. Use `auth.refresh()` for anything user-facing. A refresh token
that carries a `sid` produces a pair with the same `sid`, so the new tokens
still die with that session when verified through the service.

Tokens are capped at 8 KB and every segment is bounds-checked before it is
decoded, so an oversized `Authorization` header is rejected without
allocating.

## Passwords

```typescript
import { hashPassword, verifyPassword, needsRehash } from "@zudojs/auth";

const hash = await hashPassword("plain-text-password"); // "v1$scrypt$16384$8$5$…"
const ok = await verifyPassword("plain-text-password", hash);
if (needsRehash(hash)) { /* re-hash on next successful login */ }
```

Hashing is delegated to `@zudojs/crypto`: new hashes are its
`v1$scrypt$N$r$p$<salt>.<hash>` strings (Base64URL, 32-byte salt, 64-byte key)
with OWASP's N=2^14, r=8, p=5 row. Hashes written by earlier versions of this
package (`scrypt$N$r$p$…`, including the p=1 default and the param-less legacy
format) still verify, and `needsRehash()` returns `true` for every hash that is
not a current-parameter `@zudojs/crypto` scrypt hash, so they upgrade on the
next login. A hash made by `@zudojs/crypto`'s own `hashPassword()` with its
defaults (same N, r, p; 16-byte salt, 32-byte key) is current too, and
`needsRehash()` returns `false` for it. `hashPassword("")` throws `AuthError` (`INVALID_INPUT`).

- `createAuthService()` validates its configuration up front: bad or
  identical secrets, a non-positive or `NaN` `sessionTtlSeconds` /
  `absoluteSessionTtlSeconds`, and a non-finite (`NaN`/`Infinity`)
  `accessTtl` / `refreshTtl` all throw `AuthConfigurationError` at construction rather
  than at the first login (a `NaN` session TTL used to yield sessions that
  never expired).
- Passwords are limited to 1024 bytes (`MAX_PASSWORD_BYTES`).
- The optional `saltLength` argument must be 16–64 bytes.
- `verifyPassword` never throws: junk input is a non-match.
- The package enforces **no password policy** (length, complexity,
  breach checks) — that belongs in your registration handler.

## HTTP helpers

```typescript
import {
  parseBearerToken, // RFC 7235 case-insensitive scheme, whitespace tolerant
  parseCookies, // null-prototype result, capped at 100 pairs / 8 KB
  generateCsrfToken,
  isTokenExpired, // UNVERIFIED — a hint, never an authorization decision
  extractUserId, // UNVERIFIED — attacker-controlled, returns null if not a string
} from "@zudojs/auth";
```

`parseBearerToken` and `parseCookies` accept `unknown` on purpose: they sit on
the HTTP trust boundary, where a duplicated header is a `string[]`. They never
throw.

## Errors

Every error carries an accurate HTTP status and is safe to expose:

| Error | Status | Code | Category |
| --- | --- | --- | --- |
| `AuthError` | 401 | `ERR_AUTHENTICATION` | authentication |
| `InvalidCredentialsError` | 401 | `ERR_INVALID_CREDENTIALS` | authentication |
| `TokenExpiredError` | 401 | `ERR_TOKEN_EXPIRED` | authentication |
| `TokenInvalidError` | 401 | `ERR_TOKEN_INVALID` | authentication |
| `TokenRevokedError` | 401 | `ERR_TOKEN_REVOKED` | authentication |
| `SessionExpiredError` | 401 | `ERR_SESSION_EXPIRED` | authentication |
| `AccountDeactivatedError` | 403 | `ERR_ACCOUNT_DEACTIVATED` | authorization |
| `AccessDeniedError` | 403 | `ERR_ACCESS_DENIED` | authorization |
| `AccountLockedError` | 423 | `ERR_ACCOUNT_LOCKED` | rate_limit |
| `AuthRateLimitError` | 429 | `ERR_RATE_LIMITED` | rate_limit |
| `AuthConfigurationError` | 500 | `ERR_CONFIGURATION_INVALID` | configuration (not exposed) |

`AccountLockedError` and `AuthRateLimitError` carry `retryAfterSeconds` (also
in `metadata`) and a `Retry-After` header in `headers`; `AccessDeniedError`
carries `metadata.requiredPermission`. Before 1.3, `TokenRevokedError` was
`403 ERR_FORBIDDEN`, and the lockout and deactivation errors shared
`ERR_FORBIDDEN` too, so a client could not tell them apart.

`login()` throws the same `InvalidCredentialsError` for an unknown user and a
wrong password, and performs equivalent scrypt work on both paths, so the
endpoint is not an account-existence oracle. Deactivation is only reported
after the password has been proven correct.

## What this package does *not* do

- **No OAuth2 / social login.** OAuth2 lives in
  [`@zudojs/auth-oauth`](../auth-oauth), which implements the
  authorization-code flow with PKCE, mandatory `state`, and provider presets
  for Google, GitHub, Microsoft, Apple and Discord. Nothing OAuth-related is
  exported from this package any more; once the callback has identified the
  user, `createSessionForUser()` issues the session.
- **No password-reset flow.** `generateRandomToken()` gives you a random
  token; storage, expiry, single-use enforcement and constant-time comparison
  are yours to build.
- **No distributed state.** The in-memory session, revocation and attempt
  stores are per-process. Implement `SessionStore`, `TokenRevocationStore` and
  `LoginAttemptStore` against Redis or a database for multi-instance
  deployments.
- **No `AccessDeniedError` throwing.** `checkAccess()` returns a
  `GuardResult`; throw the error from your own middleware when
  `allowed === false`.

## Use Cases

- API authentication with rotating refresh tokens
- Session-based login with real logout and "sign out everywhere"
- Role-based access control via `@zudojs/permissions`
