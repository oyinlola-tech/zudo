# @zudojs/auth

Authentication primitives: JWT access/refresh tokens, server-side sessions,
scrypt password hashing, brute-force lockout, and RBAC delegation to
[`@zudojs/permissions`](https://www.npmjs.com/package/@zudojs/permissions).

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

  // Strongly recommended: look up a user by id. `refresh()` uses it to
  // re-load the user on every rotation, so deactivations and role changes
  // take effect immediately. Without it, `refresh()` falls back to
  // `findUser(sub)` and rejects the refresh when that returns null.
  findUserById: async (id) => findUserById(id),

  // Required: check a plain-text password for a user id.
  verifyPassword: async (userId, password) =>
    verifyPassword(password, await loadHash(userId)),

  // Optional: enables atomic refresh-token rotation and replay detection.
  revocationStore: createMemoryTokenRevocationStore(),

  // Optional: failed-attempt lockout + login rate limiting.
  loginThrottle: {
    store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
    maxFailedAttempts: 5, // -> AccountLockedError (423)
    lockoutSeconds: 900,
    maxAttemptsPerWindow: 20, // -> AuthRateLimitError (429)
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
Tokens minted with the standalone `createTokenPair()` carry no `sid` and are
therefore not session-bound.

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

When a `permissions` engine is configured the decision comes from it. When it
is not, `checkAccess()` **throws** `AuthConfigurationError` rather than
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
full lifetime. Use `auth.refresh()` for anything user-facing.

Tokens are capped at 8 KB and every segment is bounds-checked before it is
decoded, so an oversized `Authorization` header is rejected without
allocating.

## Passwords

```typescript
import { hashPassword, verifyPassword, needsRehash } from "@zudojs/auth";

const hash = await hashPassword("plain-text-password"); // scrypt N=16384,r=8,p=1
const ok = await verifyPassword("plain-text-password", hash);
if (needsRehash(hash)) { /* re-hash on next successful login */ }
```

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

| Error | Status | Category |
| --- | --- | --- |
| `AuthError` | 401 | authentication |
| `InvalidCredentialsError` | 401 | authentication |
| `TokenExpiredError` | 401 | authentication |
| `TokenInvalidError` | 401 | authentication |
| `SessionExpiredError` | 401 | authentication |
| `TokenRevokedError` | 403 | authorization |
| `AccountDeactivatedError` | 403 | authorization |
| `AccessDeniedError` | 403 | authorization |
| `AccountLockedError` | 423 | rate_limit |
| `AuthRateLimitError` | 429 | rate_limit |
| `AuthConfigurationError` | 500 | configuration (not exposed) |

`AccountLockedError` and `AuthRateLimitError` carry
`metadata.retryAfterSeconds` for a `Retry-After` header; `AccessDeniedError`
carries `metadata.requiredPermission`.

`login()` throws the same `InvalidCredentialsError` for an unknown user and a
wrong password, and performs equivalent scrypt work on both paths, so the
endpoint is not an account-existence oracle. Deactivation is only reported
after the password has been proven correct.

## What this package does *not* do

- **No OAuth2 / social login.** `OAuthConfig`, `OAuthResult`, `AuthStrategy`
  and friends are exported as a *contract only* — there is no authorize-URL
  builder, code exchange, PKCE handling or user-info fetch here, and no
  strategy registry. Implement `AuthStrategy` yourself.
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
