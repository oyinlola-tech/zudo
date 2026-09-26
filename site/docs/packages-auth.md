---
title: "@zudojs/auth — JWT, Sessions, RBAC, Password Hashing"
description: "@zudojs/auth reference: JWT access and refresh tokens, scrypt password hashing, sessions, RBAC and brute-force lockout for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-auth
---

v1.3.0

# @zudojs/auth

Authentication and authorization services — JWT tokens (access + refresh), password hashing (scrypt), session management, RBAC, brute-force lockout, and auth utilities.

AUTH JWT RBAC SESSIONS

## OVERVIEW

@zudojs/auth answers two questions for your application: *who is this request from*, and *is that person allowed to do this*. It gives you password hashing, JWT access and refresh tokens, server-side sessions, brute-force lockout, and a single AuthService that ties them together.

You bring the database. The package never reads or writes user rows itself — you hand it three small functions (find a user by login identifier, find a user by id, check a password) and it does the rest.

Tokens are signed with HMAC SHA-256 from Node's built-in node:crypto; password hashing (scrypt) is delegated to [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md). There are no third-party crypto dependencies.

Use it when

- Users log in with an email/username and a password.
- You need to protect API routes with bearer tokens.
- You need "log out everywhere" to actually work.
- Different users may do different things (roles).

Look elsewhere when

- You want "Sign in with Google/GitHub" — that is [@zudojs/auth-oauth](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md).
- You only need permission rules, no login — use [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md) directly.
- You need general-purpose encryption or hashing — see [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md).

> **OAuth2 moved out**
>
> Social and third-party sign-in used to live here. It now has its own package, @zudojs/auth-oauth. Nothing named OAuthProvider, OAuthConfig or AuthStrategy is exported from @zudojs/auth any more. See [@zudojs/auth-oauth](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md).

## INSTALLATION

Install the package. Its dependencies, @zudojs/constants, @zudojs/crypto, @zudojs/errors, @zudojs/permissions and @zudojs/types, are installed with it.

```bash
# npm
$ npm install @zudojs/auth

# pnpm
$ pnpm add @zudojs/auth
```

Node.js 24 or newer is required, because the package uses the modern node:crypto scrypt API.

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## THE WORDS, IN PLAIN ENGLISH

Five terms show up on every page below. Here is what each one means before you write any code.

### Authentication vs authorization

**Authentication** is proving who you are. Typing your email and password is authentication: the server checks the password and concludes "this really is Alice".

**Authorization** is deciding what you may do. "Alice is logged in, but may Alice delete this post?" is authorization. They are separate steps, and this package does both: login() authenticates, checkAccess() authorizes.

### What a JWT is

A JWT ("JSON Web Token") is a string the server hands you after you log in. You send it back on every later request instead of your password.

It has three dot-separated parts: a header, a payload of facts (the user id, the roles, an expiry time), and a signature. The signature is computed with a secret only the server knows, so the server can tell whether a token was tampered with.

The payload is only encoded, not encrypted. Anyone holding the token can read what is inside it. Never put a secret in a token.

### What a session is

A session is a record on the *server* saying "this login is still alive". It has an id, the user it belongs to, and an expiry time.

Sessions matter because a JWT, on its own, cannot be taken back — it stays valid until it expires. This package stamps the session id into every token it issues, and refuses tokens whose session is gone. That is what makes logout instant.

### What hashing a password means

Hashing runs a password through a one-way function. "hunter2" becomes a long jumble, and there is no way back from the jumble to the password.

You store the jumble. At login you hash what the user typed and compare the two jumbles. If your database ever leaks, the attacker gets jumbles, not passwords — and people reuse passwords everywhere, so that difference is everything.

### What RBAC is

RBAC means "role-based access control". Instead of listing what each individual user may do, you give users *roles* ("admin", "editor", "viewer") and give each role a set of *permissions* ("posts:write").

A permission here is a plain string in the shape "resource:action". Roles and matching are handled by [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md); this package just asks it questions.

## QUICK START

This is a complete, runnable file. It stores one user in memory, logs her in, verifies her access token, and logs her out.

```ts
import {
  createAuthService,
  createMemorySessionStore,
  hashPassword,
  verifyPassword,
  toUserId,
  type AuthUser,
} from "@zudojs/auth";

// Secrets come from the environment; a missing one stops the app at startup.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// 1. A user record. In a real app this row comes from your database.
const passwordHash = await hashPassword("correct horse battery staple");

const alice: AuthUser = {
  id: toUserId("user-123"),
  email: "alice@example.com",
  roles: ["editor"],
  active: true,
  createdAt: new Date(),
};

// 2. Wire the service. Every function below is one you supply.
const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 3600,
  findUser: async (identifier) => (identifier === alice.email ? alice : null),
  findUserById: async (id) => (id === alice.id ? alice : null),
  verifyPassword: async (userId, password) =>
    userId === alice.id ? verifyPassword(password, passwordHash) : false,
});

// 3. Log in.
const { user, tokens, sessionId } = await auth.login({
  identifier: "alice@example.com",
  password: "correct horse battery staple",
});
console.log(user.email, tokens.tokenType, tokens.expiresIn);
// alice@example.com Bearer 900

// 4. Check the access token on a later request.
const payload = await auth.verifyToken(tokens.accessToken);
console.log(payload.sub, payload.roles);
// user-123 [ 'editor' ]

// 5. Log out. Both tokens stop working immediately.
await auth.logout(sessionId, tokens.refreshToken);
await auth.verifyToken(tokens.accessToken); // throws SessionExpiredError
```

What you should see: the two console.log lines above, then an uncaught SessionExpiredError from the last line — which is the point of the example.

> **login() normalises the identifier**
>
> Before findUser sees it, the identifier is NFKC-folded and trimmed, and lower-cased when it is an email address; a username keeps its case. So logging in with " Alice@Example.COM " finds the user above. Store identifiers through the same exported normalizeLoginIdentifier() at registration so both sides agree. Pass normalizeIdentifier: false to receive the raw string, or your own function. *Changed in 1.3.0:* earlier versions passed the raw string, so a case or whitespace variant missed the lookup.

```ts
import { normalizeLoginIdentifier } from "@zudojs/auth";

// At registration, store the identifier the way login() will look it up.
console.log(normalizeLoginIdentifier("  Alice@Example.COM ")); // "alice@example.com"
console.log(normalizeLoginIdentifier(" BobTheBuilder "));      // "BobTheBuilder" — usernames keep their case
```

> **Never hard-code secrets**
>
> The example reads both signing secrets from the environment and has no fallback, so set them before running it, e.g. export JWT_ACCESS_SECRET=$(openssl rand -hex 32) and the same for JWT_REFRESH_SECRET. Each must be at least 32 bytes, and the two must differ. createAuthService() checks them when it is *constructed*, not on first use: a missing, short or shared secret throws AuthConfigurationError (ERR_CONFIGURATION_INVALID) at startup. Never write ?? "some-default" after process.env: a secret that is in your source code is not a secret.

## PASSWORDS

hashPassword() turns a password into a storable string. verifyPassword() checks a typed password against a stored one. You store only the output of the first.

The algorithm is scrypt, which is deliberately slow and memory-hungry, so guessing millions of passwords costs an attacker real time and RAM.

async function hashPassword( password: string, saltLength?: number, // bytes, default 32, must be 16..64 ): Promise<string> async function verifyPassword( password: string, hashedPassword: string, ): Promise<boolean>

Register a user, then check the password twice — once right, once wrong.

```ts
import { hashPassword, verifyPassword, needsRehash } from "@zudojs/auth";

const stored = await hashPassword("hunter2-but-longer");
console.log(stored.split("$").slice(0, 5).join("$"));
// v1$scrypt$16384$8$5   (format version, algorithm and cost parameters, then <salt>.<hash>)

console.log(await verifyPassword("hunter2-but-longer", stored)); // true
console.log(await verifyPassword("wrong", stored));              // false
console.log(needsRehash(stored));                              // false
```

Hashing the same password twice gives two different strings, because each hash gets a fresh random *salt* mixed in. That is expected — verifyPassword() reads the salt back out of the stored string.

hashPassword returns a [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md) hash, v1$scrypt$16384$8$5$<salt>.<hash>. Earlier scrypt$… hashes (all parameter sets and the param-less format) still verify, and needsRehash() returns true for every hash that is not a current-parameter crypto scrypt hash. A hash made by @zudojs/crypto's own hashPassword() with its defaults (same N, r and p; 16-byte salt, 32-byte key) counts as current and returns false; before 1.3.0 it was flagged on every login. Call it right after a successful login, while you still hold the plain password, and re-store a fresh hash if it says so. hashPassword("") throws AuthError (INVALID_INPUT).

> **verifyPassword never throws**
>
> Garbage input — a non-string, an unparseable hash, a password over MAX_PASSWORD_BYTES (1024) — comes back as false, not an exception. On a login route "false" is the right answer for all of those.

generateRandomToken(length?) gives you a random hex string for password-reset links and similar one-off secrets. The length is in bytes (16 to 1024, default 32), so the default returns 64 hex characters.

## JWT TOKENS

Logging in produces a **pair** of tokens. The *access token* is short-lived (15 minutes by default) and travels on every request. The *refresh token* is long-lived (7 days) and is used only to obtain a new access token.

Splitting them limits the damage of a stolen access token to minutes, without forcing the user to log in every quarter hour.

function createTokenPair( userId: UserId, config: TokenConfig, options?: { roles?: readonly string[]; sessionId?: SessionId }, ): TokenPair function verifyAccessToken(token: JwtToken, config: TokenConfig): TokenVerificationResult function verifyRefreshToken(token: JwtToken, config: TokenConfig): TokenVerificationResult

Mint a pair by hand and verify it. Note that verification returns a result object rather than throwing.

```ts
import {
  createTokenPair,
  verifyAccessToken,
  toUserId,
  type TokenConfig,
} from "@zudojs/auth";

// Secrets come from the environment; a missing one stops the app at startup.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const config: TokenConfig = {
  accessSecret: requireEnv("JWT_ACCESS_SECRET"),
  refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  accessTtl: 900,
  refreshTtl: 604800,
  issuer: "my-api",
  audience: "my-app",
};

const tokens = createTokenPair(toUserId("user-123"), config, {
  roles: ["admin"],
});

const result = verifyAccessToken(tokens.accessToken, config);
if (result.valid && result.payload) {
  console.log(result.payload.sub, result.payload.typ, result.payload.roles);
  // user-123 access [ 'admin' ]
} else {
  console.log(result.error); // e.g. "Token expired" or "Invalid signature"
}
```

A bad *token* is never an exception — it comes back as { valid: false, error }. A bad *config* is: missing, short, or identical secrets throw AuthConfigurationError from createTokenPair and verifyAccessToken on every call, and from createAuthService() as soon as it is constructed.

The token payload carries sub (user id), iat and exp (issued-at and expiry, in Unix seconds), typ ("access" or "refresh"), jti (a random id used for revocation), optional roles, and optional sid (the session it belongs to).

> **refreshAccessToken() is the raw variant**
>
> The standalone refreshAccessToken(refreshToken, config) checks a signature and an expiry and nothing else: no revocation, no rotation, no user re-load, no session check. A stolen refresh token stays usable for its full seven days. For anything user-facing use createAuthService().refresh() instead.

The jwt namespace bundles the same primitives in one object, if you prefer a single import: jwt.createTokenPair, jwt.verifyAccessToken, jwt.verifyRefreshToken, jwt.refreshAccessToken, jwt.createMemoryTokenRevocationStore, jwt.parseBearerToken, jwt.isTokenExpired, jwt.extractUserId.

## SESSIONS

A SessionStore is where live logins are recorded. createMemorySessionStore() keeps them in a Map — perfect for tests and single-process apps, useless across a restart or a second server.

For production, write your own object with the same five methods, backed by Redis or your database.

interface SessionStore { create(options: CreateSessionOptions): Promise<AuthSession>; get(sessionId: SessionId): Promise<AuthSession | null>; touch(sessionId: SessionId): Promise<void>; destroy(sessionId: SessionId): Promise<void>; destroyAllForUser(userId: UserId): Promise<void>; }

Create a session, extend it with activity, then throw it away.

```ts
import { createMemorySessionStore, toUserId } from "@zudojs/auth";

const store = createMemorySessionStore();

const session = await store.create({
  userId: toUserId("user-123"),
  ttlSeconds: 3600,           // idle timeout: 1 hour
  absoluteTtlSeconds: 86400,   // hard ceiling: 24 hours
  ip: "127.0.0.1",
});
console.log(session.id.slice(0, 8)); // first 8 chars of a 64-char hex id

await store.touch(session.id);           // slides the idle timeout forward
console.log((await store.get(session.id)) !== null); // true

await store.destroy(session.id);
console.log(await store.get(session.id)); // null
```

There are two clocks. ttlSeconds is an *idle* timeout that touch() pushes forward on every request. absoluteTtlSeconds is a hard deadline measured from creation that touch() can never pass.

> **Always set an absolute lifetime**
>
> With only an idle timeout, a session that is used once per hour never expires — so a stolen session id is good forever. On the auth service the option is absoluteSessionTtlSeconds.

## USER IDS AND SESSION IDS

UserId and SessionId are *branded* types. At runtime they are ordinary strings; at compile time TypeScript treats them as distinct, so you cannot pass a session id where a user id belongs, or a raw request parameter where a checked id belongs.

The catch used to be that a branded type has no public constructor. Every id you hold comes in as a plain string — from a database row, a decoded token, a cookie, a URL parameter — and the only way to get it into the branded type was a cast such as id as UserId.

toUserId() and toSessionId() are that missing constructor. They return the same string, typed correctly, and throw a TypeError if you hand them something that is not a non-empty string.

```ts
import { toUserId, toSessionId } from "@zudojs/auth";

const userId = toUserId("user-123");        // typed UserId
const sessionId = toSessionId("abc123def"); // typed SessionId

console.log(String(userId) === "user-123"); // true — still just a string

try {
  toUserId("");
} catch (error) {
  console.log((error as TypeError).message);
  // toUserId: value must be a non-empty string.
}
```

> **Convert at the edge**
>
> Call toUserId() / toSessionId() once, where the string enters your program (the database row, the parsed cookie), and pass the branded value inward from there. Do not sprinkle as UserId casts through your code — a cast checks nothing.

## THE AUTH SERVICE

createAuthService(config) is the entry point you should use. It is the only path that gives you working logout, safe refresh-token rotation, and account-state enforcement.

### Configuration

| Option | Required | What it does |
| --- | --- | --- |
| token | Yes | A TokenConfig: the two signing secrets, TTLs, issuer, audience, clock tolerance. |
| sessionStore | Yes | Where live logins are kept. |
| sessionTtlSeconds | Yes | Idle timeout for a new session, in seconds. |
| findUser | Yes | Look up a user by the identifier typed at login (usually an email). Return null if unknown. |
| findUserById | Yes | Look up a user by the UserId in a token. Used on every refresh. |
| verifyPassword | Yes | Given a user id and a plain password, return whether it matches. |
| absoluteSessionTtlSeconds | No | Hard ceiling on session age. Strongly recommended. |
| permissions | No | A PermissionEngine from @zudojs/permissions, used by checkAccess(). |
| revocationStore | No | Enables refresh-token rotation and replay detection. |
| allowSessionlessTokens | No | Accept tokens without a sid claim (default false: they are rejected). |
| loginThrottle | No | Failed-attempt lockout and login rate limiting. |
| allowInsecureFallbackGuard | No | Opt in to the built-in guard when no engine is configured. Read the warning below first. |
| fallbackAdminRole | No | Role the fallback guard treats as superuser (default "admin"). |
| normalizeIdentifier | No | How login() normalises the identifier before findUser. Default normalizeLoginIdentifier; false passes the raw string; or your own function. |
| externalSessionMethods | No | Methods createSessionForUser() may start a session for, e.g. ["oauth"]. Default none, so it throws. |

> **findUserById is required — and it is not findUser**
>
> The two lookups take different keys. findUser receives the login identifier, usually an email; findUserById receives the UserId from the token's sub claim.
>
>
>
> If you are upgrading and your old findUser was email-keyed, passing it for both looks fine and then fails closed: refresh() asks it for a user id, gets null back, and every token refresh throws AccountDeactivatedError. Users are silently logged out when their access token expires. Making the option required surfaces the mismatch at compile time — pass a real id-keyed lookup.

### Methods

| Method | What it does |
| --- | --- |
| login(credentials, context?) | Checks the password, creates a session, returns { user, tokens, sessionId }. |
| verifyToken(token) | Verifies an access token *and* that its session is alive. Returns the payload; throws otherwise. |
| refresh(refreshToken) | Returns a new TokenPair, re-loading the user first. |
| logout(sessionId, refreshToken?) | Destroys the session; also revokes the refresh token when both it and a revocation store are supplied. |
| logoutAll(userId) | Destroys every session for the user — sign out everywhere. |
| createSessionForUser(userId, { method, userAgent?, ip?, metadata? }) | Issues a session and tokens, like login(), for a user your code already authenticated another way (OAuth, passkey, magic link). No password check. See below. |
| checkAccess(context) | Authorization check. See RBAC below. |
| hashPassword(password) | Convenience wrapper over the standalone hashPassword(). |
| verifyPasswordHash(password, hash) | Convenience wrapper over the standalone verifyPassword(). |

### Refresh-token rotation

Give the service a revocationStore and each refresh token becomes single-use: the one you present is marked used, and you get a brand new pair. Presenting it a second time means someone copied it, so every session for that user is destroyed and TokenRevokedError is thrown.

This example logs in, refreshes once, then replays the old refresh token.

```ts
import {
  createAuthService,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
  toUserId,
  TokenRevokedError,
  type AuthUser,
} from "@zudojs/auth";

// Secrets come from the environment; a missing one stops the app at startup.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const alice: AuthUser = {
  id: toUserId("user-123"),
  email: "alice@example.com",
  roles: ["editor"],
  active: true,
  createdAt: new Date(),
};

const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  revocationStore: createMemoryTokenRevocationStore(),
  sessionTtlSeconds: 3600,
  absoluteSessionTtlSeconds: 604800,
  findUser: async (identifier) => (identifier === alice.email ? alice : null),
  findUserById: async (id) => (id === alice.id ? alice : null),
  verifyPassword: async () => true,
});

const { tokens } = await auth.login({
  identifier: "alice@example.com",
  password: "anything",
});

const rotated = await auth.refresh(tokens.refreshToken);
console.log(rotated.refreshToken !== tokens.refreshToken); // true

try {
  await auth.refresh(tokens.refreshToken); // replay of a used token
} catch (error) {
  console.log(error instanceof TokenRevokedError); // true
}
```

verifyPassword: async () => true keeps the example short. Never write that in a real application.

### Brute-force lockout

Add loginThrottle and repeated failures start costing the attacker. After maxFailedAttempts (default 5) the identifier is locked for lockoutSeconds (default 900) and login() throws AccountLockedError. Beyond maxAttemptsPerWindow (default 20) it throws AuthRateLimitError instead. A failure is reserved before the password is checked, so even a parallel burst gets only maxFailedAttempts guesses. Both budgets are per identifier: put a per-IP limiter (createRateLimiter from @zudojs/security) in front of login(). The in-memory store forgets an unlocked failure streak after failureTtlSeconds (default 900) and caps tracked identifiers at maxEntries (default 100 000).

```ts
import {
  AccountLockedError,
  createAuthService,
  createMemoryLoginAttemptStore,
  createMemorySessionStore,
} from "@zudojs/auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 3600,
  findUser: async () => null, // every login fails in this example
  findUserById: async () => null,
  verifyPassword: async () => false,
  loginThrottle: {
    store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
    maxFailedAttempts: 5,      // -> AccountLockedError (HTTP 423)
    lockoutSeconds: 900,
    maxAttemptsPerWindow: 20,  // -> AuthRateLimitError (HTTP 429)
    windowSeconds: 60,
  },
});

for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await auth.login({ identifier: "mallory@example.com", password: "guess" });
  } catch (error) {
    if (error instanceof AccountLockedError) {
      console.log(attempt, error.statusCode, error.code, error.retryAfterSeconds, error.headers);
      // 6 423 ERR_ACCOUNT_LOCKED 900 { 'retry-after': '900' }
    }
  }
}
```

AccountLockedError and AuthRateLimitError carry retryAfterSeconds (for the lockout, the time left on the lock) and a matching Retry-After header in error.headers. Thrown from a [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) handler, the error answers 423 with that header copied onto the response.

Counters are keyed by the submitted identifier — trimmed, NFKC-normalised and lower-cased, so case or whitespace variants share one budget — not by a resolved user, so unknown and real accounts are throttled identically. Both memory stores are per-process; back them with Redis if you run more than one instance.

## SESSIONS FOR OAUTH AND OTHER SIGN-INS

A user authenticated some other way — the callback of [@zudojs/auth-oauth](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md), a passkey, a magic link — still needs a session and tokens. createSessionForUser() issues them exactly as login() would, without a password check.

```ts
import { createAuthService, createMemorySessionStore, toUserId, type AuthUser } from "@zudojs/auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const alice: AuthUser = {
  id: toUserId("user-123"),
  email: "alice@example.com",
  roles: ["editor"],
  active: true,
  createdAt: new Date(),
};

const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 3600,
  findUser: async () => null,          // no password logins in this example
  findUserById: async (id) => (id === alice.id ? alice : null),
  verifyPassword: async () => false,
  externalSessionMethods: ["oauth"],   // off by default
});

// In the OAuth callback, after state and PKCE were verified and the provider
// identity was mapped to one of YOUR users. Never use a user id from the request.
const { user, tokens, sessionId } = await auth.createSessionForUser(alice.id, {
  method: "oauth",
  metadata: { provider: "github" }, // stored on the session with authMethod: "oauth"
});
console.log(user.email, (await auth.verifyToken(tokens.accessToken)).sub);
// alice@example.com user-123

try {
  await auth.createSessionForUser(alice.id, { method: "magic-link" });
} catch (error) {
  console.log((error as Error).name); // AuthConfigurationError — not in externalSessionMethods
}

await auth.logout(sessionId); // ends it like any other session
```

> **It checks no credential**
>
> Your code is asserting that the user is authenticated, so the method is off unless you list it in externalSessionMethods; any other method throws AuthConfigurationError. It still loads the user with findUserById() and refuses an unknown user (InvalidCredentialsError) or a deactivated one (AccountDeactivatedError). **Never pass it a user id taken from the request**: a route that forwards a client-supplied id hands out sessions for any account. The session records metadata.authMethod, and logout() / logoutAll() end it like any other. Added in 1.3.0.

## RBAC & PERMISSIONS

checkAccess(context) answers "may this user do this?". You pass a GuardContext — the user id, their roles, the permission being demanded, and optionally who owns the resource — and get back a GuardResult with allowed, a reason from the engine, and the roles that were checked.

The matching itself is done by a permission engine you supply.

```ts
import {
  createAuthService,
  createMemorySessionStore,
  toUserId,
  type AuthUser,
} from "@zudojs/auth";
import { createPermissionEngine } from "@zudojs/permissions";

// Secrets come from the environment; a missing one stops the app at startup.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const alice: AuthUser = {
  id: toUserId("user-123"),
  email: "alice@example.com",
  roles: ["viewer"],
  active: true,
  createdAt: new Date(),
};

const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 3600,
  findUser: async (identifier) => (identifier === alice.email ? alice : null),
  findUserById: async (id) => (id === alice.id ? alice : null),
  verifyPassword: async () => true,
  permissions: createPermissionEngine({
    roles: [
      { name: "admin", permissions: ["users:read", "users:write"] },
      { name: "viewer", permissions: ["users:read"] },
    ],
  }),
});

const readCheck = await auth.checkAccess({
  userId: "user-123",
  roles: ["viewer"],
  permission: "users:read",
});
console.log(readCheck.allowed); // true

const writeCheck = await auth.checkAccess({
  userId: "user-123",
  roles: ["viewer"],
  permission: "users:write",
});
console.log(writeCheck.allowed, writeCheck.reason);
// false no_matching_rule
```

Note that checkAccess() takes the roles you give it, not the roles on the stored user. In an HTTP handler, read them from the verified token payload.

> **The fallback guard grants too much**
>
> Without a permissions engine, checkAccess() throws AuthConfigurationError rather than guess. Setting allowInsecureFallbackGuard: true switches on a built-in guard that grants a resource owner *every* permission and the admin role everything, ignoring the permission string entirely. It is for prototypes only.

## REQUEST UTILITIES

Small helpers for the HTTP edge. All of them accept unknown and never throw, because header values arriving from a client cannot be trusted to be strings at all.

```ts
import {
  parseBearerToken,
  parseCookies,
  isTokenExpired,
  extractUserId,
  generateCsrfToken,
} from "@zudojs/auth";

console.log(parseBearerToken("Bearer abc.def.ghi")); // "abc.def.ghi"
console.log(parseBearerToken("Basic abc"));         // null

console.log(parseCookies("session=abc; theme=dark").session); // "abc"

console.log(isTokenExpired("not-a-token")); // true
console.log(extractUserId("not-a-token"));  // null

console.log(generateCsrfToken().length); // 64
```

Putting it together, a route handler reads the header, verifies the token, and gets a payload it can trust.

```ts
// `auth` is the service built in Quick Start; `authorization` is the
// raw Authorization header of the incoming request.
async function currentUserId(authorization: unknown): Promise<string | null> {
  const token = parseBearerToken(authorization);
  if (!token) return null;
  try {
    const payload = await auth.verifyToken(token);
    return payload.sub;
  } catch {
    return null; // expired, tampered with, or the session was ended
  }
}
```

> **isTokenExpired and extractUserId do not verify**
>
> Both read the token's payload without checking the signature, so anybody can put anything in there. Use them as hints ("should I refresh before calling?"), never to decide who the caller is. Only verifyToken(), verifyAccessToken() and verifyRefreshToken() check the signature.

## API REFERENCE

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createAuthService(config) | Builds the full auth service. | The entry point for real applications. |
| hashPassword(password, saltLength?) | Hashes a password with scrypt (N=16384, r=8, p=5) via @zudojs/crypto. | Async. Salt length 16–64 bytes, default 32. |
| verifyPassword(password, hash) | Checks a password against a stored hash. | Async. Returns false instead of throwing. |
| needsRehash(hash) | Says whether a stored hash uses outdated settings. | Call after a successful login. false for current hashes, including @zudojs/crypto's defaults. |
| normalizeLoginIdentifier(identifier) | NFKC, trim, and lower-case for an email address. | What login() applies by default. Use it at registration too. |
| generateRandomToken(length?) | Random hex string for reset links and similar. | Length in bytes, 16–1024, default 32. |
| createTokenPair(userId, config, options?) | Mints an access + refresh pair. | Synchronous. No session binding unless you pass sessionId; createAuthService() rejects such unbound tokens unless allowSessionlessTokens is true. |
| verifyAccessToken(token, config) | Verifies an access token. | Returns a result object; only bad config throws. |
| verifyRefreshToken(token, config) | Verifies a refresh token. | Same shape, refresh secret. |
| refreshAccessToken(token, config, options?) | Raw exchange of a refresh token for a new pair. | No rotation or revocation. Prefer service.refresh(). A refresh token that carries a sid produces a pair bound to the same sid, so it still dies with logout() when verified through the service. |
| createMemorySessionStore(options?) | In-process SessionStore. | Development and tests only. |
| createMemoryTokenRevocationStore(options?) | In-process TokenRevocationStore. | Enables atomic rotation in one process. |
| createMemoryLoginAttemptStore(options?) | In-process LoginAttemptStore. | Counters are not shared between instances. |
| toUserId(value) | Brands a string as a UserId. | Throws TypeError on an empty value. |
| toSessionId(value) | Brands a string as a SessionId. | Throws TypeError on an empty value. |
| parseBearerToken(authorization) | Pulls the token out of an Authorization header. | null when it is not a Bearer header. |
| parseCookies(cookie) | Parses a Cookie header into an object. | Null-prototype object; at most 100 pairs. |
| isTokenExpired(token) | Reads exp without verifying. | Hint only. Unparseable input reads as expired. |
| extractUserId(token) | Reads sub without verifying. | Hint only. Never trust it. |
| generateCsrfToken() | 32 random bytes as hex. | 64 characters. |
| jwt | Namespace object bundling the JWT primitives. | Does not include createAuthService. |

### Types

| Name | What it is | Notes |
| --- | --- | --- |
| AuthUser | The user record you return from your lookups. | id, email, roles, active, createdAt required. |
| UserCredentials | { identifier, password } passed to login(). | Same shape as PasswordCredentials. |
| UserRegistration | Sign-up input shape: email, password, name, roles. | A contract for your own code; nothing consumes it here. |
| AuthServiceConfig | Everything createAuthService() accepts. | See the configuration table above. |
| AuthService | The object createAuthService() returns. |  |
| LoginResult | { user, tokens, sessionId }. | Returned by login(). |
| UserLookup / UserByIdLookup | Signatures of findUser / findUserById. | Different keys — see the warning above. |
| PasswordVerifier | Signature of the verifyPassword option. | (userId, password) => Promise<boolean>. |
| TokenConfig | Secrets, TTLs, issuer, audience, clock tolerance. | Secrets ≥ 32 bytes and must differ. |
| TokenPair | { accessToken, refreshToken, expiresIn, tokenType }. | tokenType is always "Bearer". |
| TokenPayload | What is inside a token. | sub, iat, exp, typ, jti, roles?, sid?. |
| TokenVerificationResult | { valid, payload?, error? }. | Returned by the standalone verifiers. |
| TokenRevocationStore | Interface for storing revoked jti values. | Implement revokeIfNotRevoked in production. |
| JwtToken / TokenId | A token string; a token id. | TokenId is branded. |
| SessionStore | Interface for session storage. | Five methods; implement for Redis. |
| AuthSession / CreateSessionOptions | A stored session; the options to create one. | Idle plus absolute expiry. |
| UserId / SessionId | Branded id strings. | Build them with toUserId / toSessionId. |
| LoginAttemptStore / LoginAttemptRecord / LoginThrottleConfig | Brute-force protection pieces. | Back the store with Redis for multi-instance apps. |
| Permission / Role | Re-exports from @zudojs/permissions. | Prefer importing them from that package in new code. |
| GuardContext / GuardResult | Input and output of checkAccess(). |  |
| PasswordCredentials / ApiKeyCredentials | Credential shapes. | API-key verification is not implemented here. |
| ExternalSessionOptions / ExternalSessionResult | Input and output of createSessionForUser(). | { method, userAgent?, ip?, metadata? }; the result has the login() shape. |

### Errors

Every error extends AuthError, re-exported from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) (a BaseError). Each carries an HTTP status code and a message that is safe to show a client — the messages never reveal whether an account exists.

| Name | Thrown when | Status / code |
| --- | --- | --- |
| AuthError | Base class for everything below. | 401 ERR_AUTHENTICATION |
| AuthConfigurationError | Bad secrets, checkAccess() with no engine, or createSessionForUser() with an unlisted method. | 500 ERR_CONFIGURATION_INVALID |
| InvalidCredentialsError | Unknown user or wrong password. | 401 ERR_INVALID_CREDENTIALS |
| TokenExpiredError | The token's exp has passed. | 401 ERR_TOKEN_EXPIRED |
| TokenInvalidError | Malformed, mis-signed, or wrong-type token. | 401 ERR_TOKEN_INVALID |
| TokenRevokedError | A used refresh token was replayed. | 401 ERR_TOKEN_REVOKED |
| AccountLockedError | Too many failed logins. | 423 ERR_ACCOUNT_LOCKED |
| AccountDeactivatedError | The account is not active. | 403 ERR_ACCOUNT_DEACTIVATED |
| AccessDeniedError | Insufficient permissions. | 403 ERR_ACCESS_DENIED |
| SessionExpiredError | The token's session is gone or expired. | 401 ERR_SESSION_EXPIRED |
| AuthRateLimitError | Too many login attempts in the window. | 429 ERR_RATE_LIMITED |

*Changed in 1.3.0:* AccountLockedError, AccountDeactivatedError and TokenRevokedError used to share the code ERR_FORBIDDEN, and TokenRevokedError was a 403. Each now has its own code, and a revoked token is a 401 (category authentication), because the client has to sign in again. A client that matched ERR_FORBIDDEN for these, or treated a revoked refresh token as a 403, must be updated.

AuthErrorOptions is exported too, for constructing these yourself. AccountLockedError and AuthRateLimitError carry retryAfterSeconds (also in their metadata) and a Retry-After header in headers, which @zudojs/http copies onto the response.

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| MIN_SALT_LENGTH | 16 | Smallest salt hashPassword() accepts, in bytes. |
| MAX_SALT_LENGTH | 64 | Largest accepted salt, in bytes. |
| MAX_PASSWORD_BYTES | 1024 | Longer passwords are rejected rather than hashed. |

## COMMON MISTAKES

- **Passing your email-keyed findUser as findUserById.** Every refresh looks up a user id in an email-keyed table, gets nothing, and throws AccountDeactivatedError. Users drop out roughly 15 minutes after logging in. *Fix:* give findUserById a real id-keyed lookup.
- **Using the same string for accessSecret and refreshSecret.** createAuthService() throws AuthConfigurationError at construction, because one secret would let a refresh token be presented as an access token. *Fix:* two different secrets, each at least 32 bytes.
- **Calling the standalone refreshAccessToken() on a public route.** It does not rotate, revoke, re-load the user, or check the session, so a stolen refresh token works for a week. *Fix:* use createAuthService().refresh() with a revocationStore.
- **Trusting extractUserId() to identify the caller.** It reads an unverified payload, so anyone can forge a user id. *Fix:* call verifyToken() and use payload.sub.
- **Shipping the in-memory stores.** Sessions, revocations and attempt counters vanish on restart and are not shared between instances, so logouts and lockouts do not hold. *Fix:* implement SessionStore, TokenRevocationStore and LoginAttemptStore against Redis or your database.
- **Setting allowInsecureFallbackGuard: true to make checkAccess() stop throwing.** The fallback ignores the permission string and grants owners and admins everything. *Fix:* configure a permissions engine.
- **Passing a request value to createSessionForUser().** It checks no password, so a route that forwards a client-supplied user id signs anyone in as anyone. *Fix:* call it only after your own verification (OAuth state and PKCE, a passkey assertion) mapped the identity to a user, and list only the methods you use in externalSessionMethods.
- **Forgetting absoluteSessionTtlSeconds.** An idle timeout alone lets an active session live forever, so a stolen session id never dies. *Fix:* set a hard ceiling, for example seven days.

## RELATED PACKAGES

| Package | When to reach for it |
| --- | --- |
| [@zudojs/auth-oauth](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md) | Sign in with Google, GitHub and other third-party providers. All OAuth2 support now lives there. |
| [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md) | The engine behind checkAccess() — roles, permission matching, and ownership rules. |
| [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) | The base error class every auth error extends, and the shared error codes. |
| [@zudojs/constants](https://zudojs.oyinlola.site/docs/packages-constants.md) | Where the branded UserId, SessionId and TokenId types are defined. |
| [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) | Wiring auth into request handling — read the header, verify, attach the user. |
| [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md) | CSRF protection, rate limiting and hardening that sit alongside auth. |

## NEXT STEPS

[Previous

@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) [Next

@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md)

## COMPLETE EXPORT INDEX

Every name `@zudojs/auth` exports from its package root at v1.4.0 — **74** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 74 exports**

Classes (11)

`AccessDeniedError` `AccountDeactivatedError` `AccountLockedError` `AuthConfigurationError` `AuthError` `AuthRateLimitError` `InvalidCredentialsError` `SessionExpiredError` `TokenExpiredError` `TokenInvalidError` `TokenRevokedError`

Functions (22)

`assertAtomicRevocationStore` `createAuthService` `createMemoryLoginAttemptStore` `createMemorySessionStore` `createMemoryTokenRevocationStore` `createTokenPair` `extractUserId` `generateCsrfToken` `generateRandomToken` `hashPassword` `isTokenExpired` `needsRehash` `normalizeLoginIdentifier` `parseBearerToken` `parseCookies` `refreshAccessToken` `sanitizeCustomClaims` `toSessionId` `toUserId` `verifyAccessToken` `verifyPassword` `verifyRefreshToken`

Interfaces (25)

`ApiKeyCredentials` `AuthErrorOptions` `AuthService` `AuthServiceConfig` `AuthSession` `AuthUser` `CreateSessionOptions` `CreateTokenPairOptions` `ExternalSessionOptions` `ExternalSessionResult` `GuardContext` `GuardResult` `LoginAttemptRecord` `LoginAttemptStore` `LoginResult` `LoginThrottleConfig` `PasswordCredentials` `SessionStore` `TokenConfig` `TokenPair` `TokenPayload` `TokenRevocationStore` `TokenVerificationResult` `UserCredentials` `UserRegistration`

Type aliases (10)

`JwtToken` `PasswordVerifier` `Permission` `Role` `SessionId` `ThrottleErrorOptions` `TokenId` `UserByIdLookup` `UserId` `UserLookup`

Constants (6)

`jwt` `MAX_PASSWORD_BYTES` `MAX_SALT_LENGTH` `MIN_SALT_LENGTH` `RACY_REVOCATION_WARNING_CODE` `RESERVED_JWT_CLAIMS`
