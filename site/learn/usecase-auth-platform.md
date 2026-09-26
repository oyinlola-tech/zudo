---
title: "Use case: an authentication platform — ZudoJS Academy"
description: "Build Sabi School's account platform: registration, sessions, JWT rotation, password reset links, roles and sign-in with an OAuth provider, all tested."
source: https://zudojs.oyinlola.site/learn/usecase-auth-platform
---

LEVEL 19 · LESSON 2 OF 10

Real-world use cases Production

# Use case: an authentication platform

Build Sabi School's account platform: registration, sessions, JWT rotation, password reset links, roles and sign-in with an OAuth provider, all tested.

- **60 min** to read and try
- **You need:** Use case: a REST API, and the lessons on authentication, OAuth, permissions and security
- **You build:** Sabi School's account service on PostgreSQL, with session-bound JWTs, single-use refresh and reset tokens, role-based access, "Sign in with Kora ID" against a fake provider, and a Vitest suite

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- List the attacks an account system must survive and turn each into a design rule
- Back @zudojs/auth's sessions and refresh-token revocation with PostgreSQL
- Build a password reset with single-use, expiring, hashed tokens that ends every old session
- Assign roles safely and make role changes take effect at once
- Link OAuth identities to local accounts without enabling account takeover
- Test every authentication rule over real HTTP

## The brief: one account, many ways in

**Sabi School** runs online classes. Students, tutors and staff all sign in to the same web app and mobile app. Last term, the school's first account system caused four incidents:

1. A tutor who left in March could still edit his course in April: his token was valid for 30 days.
2. A parent forwarded a password reset e-mail to a relative a week later, and the link still worked.
3. Someone registered `ada@example.com` before the real Ada did. When Ada later signed in with an outside provider, she landed in the stranger's account, and the stranger could still log in with his password.
4. A student sent `"role": "tutor"` when registering, and became a tutor.

This lesson builds the replacement, an **authentication platform**: the part of an application that answers "who is this?" (authentication) and hands the answer to the part that decides "what may they do?" (authorization). The brief:

| Area | Requirement |
| --- | --- |
| Registration and login | E-mail and password. New accounts are always students. Password guessing is slowed down and locked out. |
| Sessions | Short-lived access tokens, refresh tokens that work once, logout on one device or everywhere, idle and absolute expiry. Sessions survive a server restart. |
| Password reset | A link by e-mail that works once, for 30 minutes, and signs the account out everywhere. |
| Roles | Students read courses, tutors create and edit *their own* courses, admins do everything and assign roles. A role change takes effect at once. |
| Sign in with Kora ID | The school's partner identity provider, over OAuth 2 with PKCE. No duplicate accounts, and no account takeover. |

Each piece has its own lesson: [@zudojs/auth](https://zudojs.oyinlola.site/learn/zudo-auth), [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication) (sessions, JWTs, rotation), [@zudojs/auth-oauth](https://zudojs.oyinlola.site/learn/zudo-oauth), [@zudojs/permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) and [node:crypto](https://zudojs.oyinlola.site/learn/node-crypto). Here they meet in one service, with the decisions that only appear when they do. The HTTP conventions (the error envelope, one PostgreSQL per test file) come from [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api).

## Threats first

REASON IT OUT

### What can go wrong with an account?

Before any code, list the ways an attacker, or plain bad luck, can get into someone else's account or keep access they should have lost. For each one, write the rule that stops it. Think about stolen tokens, stolen databases, guessed passwords, forwarded e-mails, outside providers and the registration form itself.

**Show the reasoning**

| Threat | Rule |
| --- | --- |
| A stolen access token | It lives 15 minutes, and it is bound to a **session** on the server, so logout kills it at once. |
| A stolen refresh token | Each one works **once**. If a used one comes back, someone copied it: end every session of that user. |
| A stolen database | Passwords are scrypt hashes; reset tokens and OAuth login ids are stored as SHA-256 hashes. Nothing in a row can be replayed as it is. |
| Password guessing | Five wrong passwords lock the account for 15 minutes; a per-address rate limit stops one attacker trying many accounts. |
| Account enumeration | Login and reset give the same answer for known and unknown e-mails. |
| A forwarded or leaked reset link | Single use, 30 minutes, and using it ends every old session. |
| Someone who lost their job | A role change ends that user's sessions. Their next token carries the new roles. |
| A role in the request | The server alone assigns roles; the registration schema has no `role` field. Only admins assign roles, and not their own. |
| Pre-registration of someone's e-mail | An outside login may only link to an account whose e-mail is verified; if it was not, whoever set that password is evicted. |
| A forged OAuth callback | State and PKCE verifier stay on the server; the browser only holds an opaque, single-use login id. |

Every rule in this table has a test at the end of the lesson.

```ts
 browser / app                    Sabi accounts (this lesson)                       Kora ID
 ─────────────                    ───────────────────────────                       ───────
 POST /v1/users ───────────────▶  accounts.ts  (users, user_roles)
 POST /v1/sessions ────────────▶  auth.ts      (@zudojs/auth + PostgreSQL stores)
 POST /v1/sessions/refresh ────▶     └─ sessions, revoked_tokens
 POST /v1/password-resets ─────▶  resets.ts    (@zudojs/crypto tokens) ──▶ mailer
 GET  /v1/oauth/kora ──────────▶  kora.ts      (@zudojs/auth-oauth) ◀───────▶  /authorize
                                     └─ oauth_logins, identities                  /token
 GET  /v1/courses … ───────────▶  roles.ts     (@zudojs/permissions)              /userinfo
```

The platform's modules and the tables each one owns. http.ts sits in front of all of them.

## Tables and stores

The schema has one table per concern. Look at what is *not* stored: no raw reset token, no raw OAuth login id, and no tokens at all for sessions (a JWT carries the session's id and is useless without the signing secret).

schema.ts

```ts
export const SCHEMA = [
  `CREATE TABLE users (
     id serial PRIMARY KEY,
     email text NOT NULL UNIQUE,
     name text NOT NULL,
     password_hash text,
     email_verified boolean NOT NULL DEFAULT false,
     active boolean NOT NULL DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE user_roles (
     user_id integer NOT NULL REFERENCES users (id),
     role text NOT NULL CHECK (role IN ('student', 'tutor', 'admin')),
     PRIMARY KEY (user_id, role))`,
  `CREATE TABLE sessions (
     id text PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users (id),
     ttl_seconds integer NOT NULL,
     created_at timestamptz NOT NULL,
     last_activity_at timestamptz NOT NULL,
     expires_at timestamptz NOT NULL,
     absolute_expires_at timestamptz,
     user_agent text,
     ip text,
     metadata jsonb)`,
  "CREATE INDEX sessions_user_idx ON sessions (user_id)",
  `CREATE TABLE revoked_tokens (jti text PRIMARY KEY, expires_at timestamptz NOT NULL)`,
  `CREATE TABLE password_resets (
     token_hash text PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users (id),
     expires_at timestamptz NOT NULL,
     used_at timestamptz)`,
  `CREATE TABLE identities (
     provider text NOT NULL,
     provider_id text NOT NULL,
     user_id integer NOT NULL REFERENCES users (id),
     PRIMARY KEY (provider, provider_id))`,
  `CREATE TABLE oauth_logins (
     id_hash text PRIMARY KEY,
     state text NOT NULL,
     code_verifier text NOT NULL,
     expires_at timestamptz NOT NULL)`,
  `CREATE TABLE courses (
     id serial PRIMARY KEY,
     title text NOT NULL,
     tutor_id integer NOT NULL REFERENCES users (id))`,
];
```

The database is PGlite behind `@zudojs/database`, with the same small raw-SQL adapter as [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api#data). It only differs in taking the schema as a parameter:

**Show sql.ts (the adapter from the REST API use case)**

sql.ts

```ts
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { createDatabaseClient, createMigrationRunner, noopDatabaseLogger } from "@zudojs/database";
import type { DatabaseClient, DatabaseTransactionContext, PrismaClientLike } from "@zudojs/database";

/* PostgreSQL error codes → the Prisma codes @zudojs/database turns into 409s and 404s. */
const CODES: Record<string, string> = { "23505": "P2002", "23503": "P2003", "40001": "P2034" };

function rawSql(db: PGlite | Transaction): DatabaseTransactionContext {
  async function run(sql: string, values: unknown[]) {
    try {
      return await db.query<Record<string, unknown>>(sql, values);
    } catch (error) {
      const code = CODES[(error as { code?: string }).code ?? ""];
      throw code ? Object.assign(new Error((error as Error).message), { code, clientVersion: "pglite" }) : error;
    }
  }
  return {
    $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) => (await run(sql, values)).rows as T,
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => (await run(sql, values)).affectedRows ?? 0,
    $queryRaw: () => Promise.reject(new Error("Use $queryRawUnsafe with $1 parameters")),
    $executeRaw: () => Promise.reject(new Error("Use $executeRawUnsafe with $1 parameters")),
  };
}

/** An in-process PostgreSQL behind @zudojs/database, with the given schema applied as migration 1. */
export async function openDatabase(schema: readonly string[]): Promise<DatabaseClient> {
  const pg = new PGlite();
  const prisma: PrismaClientLike = {
    ...rawSql(pg),
    $connect: async () => { await pg.waitReady; },
    $disconnect: async () => { if (!pg.closed) await pg.close(); },
    $transaction: <T>(work: (tx: DatabaseTransactionContext) => Promise<T>) => pg.transaction((tx) => work(rawSql(tx))),
  };
  const client = createDatabaseClient({ prisma, logger: noopDatabaseLogger });
  await client.connect();
  await createMigrationRunner(client, [
    { version: 1, name: "schema", up: async (tx) => { for (const statement of schema) await tx.$executeRawUnsafe(statement); } },
  ]).migrate();
  return client;
}
```

`@zudojs/auth` does not own your database. It asks for a `SessionStore` (create, get, touch, destroy, destroy all for a user) and a `TokenRevocationStore` (remember used refresh-token ids). The memory versions from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth#sessions) lose everything on restart and are not shared between two servers, so here both live in PostgreSQL:

stores.ts

```ts
import { toSessionId, toUserId } from "@zudojs/auth";
import type { AuthSession, SessionStore, TokenRevocationStore } from "@zudojs/auth";
import { randomHex } from "@zudojs/crypto";
import type { DatabaseClient } from "@zudojs/database";

interface SessionRow {
  id: string;
  user_id: number;
  created_at: Date;
  last_activity_at: Date;
  expires_at: Date;
  absolute_expires_at: Date | null;
  metadata: Record<string, unknown> | null;
}

function toSession(row: SessionRow): AuthSession {
  return {
    id: toSessionId(row.id),
    userId: toUserId(String(row.user_id)),
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    expiresAt: row.expires_at,
    ...(row.absolute_expires_at ? { absoluteExpiresAt: row.absolute_expires_at } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

/** Sessions in PostgreSQL: they survive restarts and are shared by every server. */
export function createPgSessionStore(db: DatabaseClient): SessionStore {
  return {
    async create({ userId, ttlSeconds = 86_400, absoluteTtlSeconds, userAgent, ip, metadata }) {
      const [row] = await db.queryRawUnsafe<SessionRow[]>(
        `INSERT INTO sessions (id, user_id, ttl_seconds, created_at, last_activity_at, expires_at, absolute_expires_at,
           user_agent, ip, metadata)
         VALUES ($1, $2, $3, now(), now(), now() + make_interval(secs => $3::integer),
                 now() + make_interval(secs => $4::integer), $5, $6, $7)
         RETURNING *`,
        [await randomHex(64), Number(userId), ttlSeconds, absoluteTtlSeconds ?? null, userAgent ?? null, ip ?? null, metadata ?? null],
      );
      return toSession(row!);
    },
    async get(sessionId) {
      const [row] = await db.queryRawUnsafe<SessionRow[]>("SELECT * FROM sessions WHERE id = $1 AND expires_at > now()", [sessionId]);
      return row ? toSession(row) : null;
    },
    async touch(sessionId) {
      await db.executeRawUnsafe(
        `UPDATE sessions SET last_activity_at = now(),
           expires_at = LEAST(now() + make_interval(secs => ttl_seconds), COALESCE(absolute_expires_at, 'infinity'))
         WHERE id = $1 AND expires_at > now()`,
        [sessionId],
      );
    },
    async destroy(sessionId) {
      await db.executeRawUnsafe("DELETE FROM sessions WHERE id = $1", [sessionId]);
    },
    async destroyAllForUser(userId) {
      await db.executeRawUnsafe("DELETE FROM sessions WHERE user_id = $1", [Number(userId)]);
    },
  };
}

/** Used refresh tokens. revokeIfNotRevoked is one INSERT, so two replays cannot both win. */
export function createPgRevocationStore(db: DatabaseClient): TokenRevocationStore {
  return {
    async revoke(jti, expiresAt) {
      await db.executeRawUnsafe(
        "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING",
        [jti, expiresAt],
      );
    },
    async isRevoked(jti) {
      return (await db.queryRawUnsafe<unknown[]>("SELECT 1 FROM revoked_tokens WHERE jti = $1", [jti])).length > 0;
    },
    async revokeIfNotRevoked(jti, expiresAt) {
      const inserted = await db.queryRawUnsafe<unknown[]>(
        "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING RETURNING jti",
        [jti, expiresAt],
      );
      return inserted.length === 1;
    },
  };
}
```

- `touch` implements the two clocks: every use pushes `expires_at` forward by the idle time (30 minutes), but `LEAST(…, absolute_expires_at)` never lets it pass the 7-day limit.
- `get` ignores expired rows in the query itself, so an expired session is dead even before a cleanup job deletes it.
- `revokeIfNotRevoked` is the method that makes rotation safe. Two copies of one refresh token sent at the same moment both try to `INSERT` the same `jti` (the token's unique id); the primary key lets exactly one succeed. A separate "is it revoked? then revoke it" would let both through. The interface marks it optional, and the service falls back to the racy pair without it, so always implement it.

## Accounts and the auth service

`createAccounts` is the users table in the shape `@zudojs/auth` expects: look up by e-mail and by id (with the roles), check a password, register:

accounts.ts

```ts
import { hashPassword, normalizeLoginIdentifier, toUserId, verifyPassword } from "@zudojs/auth";
import type { AuthUser, UserId } from "@zudojs/auth";
import type { DatabaseClient } from "@zudojs/database";
import { withTransaction } from "@zudojs/database";
import { ConflictError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";

export const Registration = schema.object({
  email: schema.string().trim().toLowerCase().email().max(254),
  name: schema.string().trim().min(1).max(80),
  password: schema.string().min(12).max(128),
});

interface UserRow { id: number; email: string; name: string; active: boolean; created_at: Date; roles: string[] }

const SELECT_USER = `SELECT u.id, u.email, u.name, u.active, u.created_at,
  COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
  FROM users u LEFT JOIN user_roles r ON r.user_id = u.id`;

function toAuthUser(row: UserRow): AuthUser {
  return { id: toUserId(String(row.id)), email: row.email, name: row.name, roles: row.roles, active: row.active, createdAt: row.created_at };
}

/** The users table, in the shape @zudojs/auth asks for. */
export function createAccounts(db: DatabaseClient) {
  async function findOne(where: string, value: unknown): Promise<AuthUser | null> {
    const [row] = await db.queryRawUnsafe<UserRow[]>(`${SELECT_USER} WHERE ${where} GROUP BY u.id`, [value]);
    return row ? toAuthUser(row) : null;
  }

  return {
    findUserByEmail: (email: string) => findOne("u.email = $1", normalizeLoginIdentifier(email)),
    findUserById: (id: UserId) => findOne("u.id = $1", Number(id)),

    async checkPassword(id: UserId, password: string): Promise<boolean> {
      const [row] = await db.queryRawUnsafe<{ password_hash: string | null }[]>("SELECT password_hash FROM users WHERE id = $1", [Number(id)]);
      return row?.password_hash ? verifyPassword(password, row.password_hash) : false;
    },

    async register(input: unknown): Promise<AuthUser> {
      const { email, name, password } = Registration.parse(input);
      const passwordHash = await hashPassword(password);
      const id = await withTransaction(db, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<{ id: number }[]>(
          "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id",
          email, name, passwordHash,
        );
        if (!row) throw new ConflictError("An account with this e-mail already exists");
        await tx.$executeRawUnsafe("INSERT INTO user_roles (user_id, role) VALUES ($1, 'student')", row.id);
        return row.id;
      });
      return (await findOne("u.id = $1", id))!;
    },
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
```

Registration inserts the user and the `student` role in one transaction: no account can exist without a role. A user who only ever signed in with Kora has `password_hash` `NULL`, and `checkPassword` answers `false` for them without hashing anything.

`createAuth` wires the service: the PostgreSQL stores, 30 minutes idle and 7 days absolute, the account lookups, a login lockout, and `externalSessionMethods: ["oauth"]`, which switches on `createSessionForUser` for the Kora callback. `requireUser` is the middleware from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth#routes): `auth.verifyToken` checks the signature, the expiry *and* that the token's session still exists.

auth.ts

```ts
import { AuthError, createAuthService, createMemoryLoginAttemptStore, parseBearerToken } from "@zudojs/auth";
import type { TokenConfig, TokenPayload } from "@zudojs/auth";
import type { DatabaseClient } from "@zudojs/database";
import { AuthenticationError } from "@zudojs/errors";
import type { HttpMiddleware, HttpRouterContext } from "@zudojs/http";
import type { Accounts } from "./accounts.js";
import { createPgRevocationStore, createPgSessionStore } from "./stores.js";

export function createAuth(db: DatabaseClient, accounts: Accounts, token: TokenConfig) {
  const auth = createAuthService({
    token,
    sessionStore: createPgSessionStore(db),
    revocationStore: createPgRevocationStore(db),
    sessionTtlSeconds: 30 * 60,
    absoluteSessionTtlSeconds: 7 * 24 * 60 * 60,
    findUser: accounts.findUserByEmail,
    findUserById: accounts.findUserById,
    verifyPassword: accounts.checkPassword,
    externalSessionMethods: ["oauth"],
    loginThrottle: {
      store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
      maxFailedAttempts: 5,
      lockoutSeconds: 15 * 60,
    },
  });

  /** Middleware: a valid access token whose session is still alive. */
  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader("authorization"));
    if (token === null) throw new AuthenticationError("Sign in first");
    try {
      ctx.state.set("user", await auth.verifyToken(token));
    } catch (error) {
      if (error instanceof AuthError) throw new AuthenticationError("Sign in first");
      throw error;
    }
    return next();
  };

  return { auth, requireUser };
}

export function currentUser(ctx: HttpRouterContext): TokenPayload {
  const user = ctx.state.get("user") as TokenPayload | undefined;
  if (!user) throw new Error("requireUser is missing on this route");
  return user;
}
```

## Password reset

REASON IT OUT

### Design the reset link

A user forgot their password. You will e-mail them a link. Decide: what is in the link, what the database stores, how long it lives, how often it works, what the request endpoint answers for an unknown e-mail, and what happens to the sessions that existed before the reset.

**Show the reasoning**

- **The link holds a random token**, 32 bytes from `generatePasswordResetToken` in `@zudojs/crypto`. Anyone holding it can set the password, so it is a password in its own right.
- **The database stores its SHA-256 hash** (`hashTokenForStorage`). A leaked database backup then contains no working links. A fast, unsalted hash is enough here, unlike for passwords: the token has 256 bits of randomness, so there is nothing to guess.
- **30 minutes, once.** Marking the row used and checking that it was unused is one conditional `UPDATE`, so two clicks cannot both succeed. A new request deletes older tokens of the same user.
- **The request endpoint always answers 202** with the same sentence, so it cannot be used to find out who has an account.
- **A reset ends every session.** The usual reason for a reset is "someone else knows my password"; their sessions must die with it (incident 2).
- **The token goes after `#`** in the link (`/reset-password#token=…`). The fragment is never sent to a server, so it does not end up in web server logs or in the `Referer` header of the next page. The page's script reads it and POSTs it.

resets.ts

```ts
import type { AuthService } from "@zudojs/auth";
import { hashPassword, toUserId } from "@zudojs/auth";
import { generatePasswordResetToken, hashTokenForStorage } from "@zudojs/crypto";
import type { DatabaseClient } from "@zudojs/database";
import { withTransaction } from "@zudojs/database";
import { DomainError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import type { Accounts } from "./accounts.js";

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

const ResetRequest = schema.object({ email: schema.string().trim().toLowerCase().max(254) });
const ResetConfirm = schema.object({ token: schema.string().min(20).max(200), password: schema.string().min(12).max(128) });

export function createPasswordResets(db: DatabaseClient, accounts: Accounts, auth: AuthService, mailer: Mailer, appUrl: string) {
  return {
    /** Always succeeds from the caller's point of view: it never reveals whether the e-mail has an account. */
    async request(input: unknown): Promise<void> {
      const { email } = ResetRequest.parse(input);
      const user = await accounts.findUserByEmail(email);
      if (!user?.active) return;
      const token = await generatePasswordResetToken();
      await withTransaction(db, async (tx) => {
        await tx.$executeRawUnsafe("DELETE FROM password_resets WHERE user_id = $1", Number(user.id));
        await tx.$executeRawUnsafe(
          "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')",
          await hashTokenForStorage(token), Number(user.id),
        );
      });
      await mailer.send(user.email, "Reset your Sabi password", `Open ${appUrl}/reset-password#token=${token} within 30 minutes.`);
    },

    /** Uses the token once, sets the new password and signs the user out everywhere. */
    async confirm(input: unknown): Promise<void> {
      const { token, password } = ResetConfirm.parse(input);
      const tokenHash = await hashTokenForStorage(token);
      const invalid = () => new DomainError("This reset link is invalid or has expired", { code: "RESET_TOKEN_INVALID" });
      const live = "token_hash = $1 AND used_at IS NULL AND expires_at > now()";
      const [found] = await db.queryRawUnsafe<unknown[]>(`SELECT 1 FROM password_resets WHERE ${live}`, [tokenHash]);
      if (!found) throw invalid(); // before the slow hash, so guessing costs the server nothing
      const passwordHash = await hashPassword(password);
      const userId = await withTransaction(db, async (tx) => {
        const [used] = await tx.$queryRawUnsafe<{ user_id: number }[]>(
          `UPDATE password_resets SET used_at = now() WHERE ${live} RETURNING user_id`, tokenHash,
        );
        if (!used) throw invalid(); // another request used it a moment ago
        await tx.$executeRawUnsafe("UPDATE users SET password_hash = $2, email_verified = true WHERE id = $1", used.user_id, passwordHash);
        return toUserId(String(used.user_id));
      });
      await auth.logoutAll(userId);
    },
  };
}
```

Two details: `confirm` checks the token *before* hashing the new password, so guessing tokens costs the server one cheap query instead of a slow scrypt run; and a successful reset also marks the e-mail as verified, because only the inbox's owner could have clicked the link. That flag matters for Kora sign-in below.

## Roles

REASON IT OUT

### Roles in the token, or in the database?

`auth.login` copies the user's roles into the access token. Incident 1 was a token that kept a role for 30 days. With 15-minute tokens, is copying still a problem? What should happen when an admin changes someone's roles?

**Show the reasoning**

Copying is fine *because the tokens are session-bound*. Reading roles from the token saves a query per request, and when an admin changes a user's roles, the service calls `auth.logoutAll(user)`. Every token with the old roles dies with its session, and the user's next login gets a token with the new ones. Without session-bound tokens, the only choices would be "wait up to 15 minutes" or "read the roles from the database on every request", which is what the REST API use case did.

Two more rules: roles come from a fixed list (`student`, `tutor`, `admin`, enforced by a `CHECK` and by the schema), and an admin cannot change their own roles, so the last admin cannot lock everyone out by accident.

The rules live in one `@zudojs/permissions` engine, as in [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions#rbac). Tutors inherit what students may do, add `course:create`, and may update a course only when they own it (`isOwner("tutorId")`):

roles.ts

```ts
import type { TokenPayload } from "@zudojs/auth";
import { AuthorizationError } from "@zudojs/errors";
import { createPermissionActor, createPermissionEngine, isOwner } from "@zudojs/permissions";

export const ROLES = ["student", "tutor", "admin"] as const;

export const permissions = createPermissionEngine({
  roles: [
    { name: "student", permissions: ["course:read"] },
    {
      name: "tutor",
      inherits: ["student"],
      permissions: ["course:create"],
      rules: [{ name: "own-courses", effect: "allow", resource: "course", action: ["update"], condition: isOwner("tutorId") }],
    },
    { name: "admin", inherits: ["tutor"], permissions: ["course:*", "user:assign-roles"] },
  ],
});

/** Throws 403 unless the signed-in user may do `permission` (on `resource`, when given). */
export async function authorizeUser(user: TokenPayload, permission: string, resource?: Record<string, unknown>): Promise<void> {
  const actor = createPermissionActor(user.sub, { roles: user.roles ?? [] });
  const decision = await permissions.check(actor, permission, resource);
  if (!decision.allowed) throw new AuthorizationError("You may not do this");
}
```

## Sign in with Kora ID

REASON IT OUT

### Which local account does a Kora login belong to?

Kora sends back a profile: a stable id (`sub`), an e-mail and whether Kora verified that e-mail. Sabi may already have an account with the same e-mail, created with a password. When do you link the two, when do you create a new account, and when do you refuse? Think about incident 3.

**Show the reasoning**

1. **Already linked**: the identity `(kora, sub)` is in `identities`. Sign that user in. Key by the provider's id, never by e-mail: e-mails change.
2. **Kora did not verify the e-mail**: refuse. Otherwise anyone could create a Kora account with Ada's e-mail and walk into her Sabi account.
3. **No Sabi account with that e-mail**: create one (a student, no password, e-mail verified) and link it.
4. **A Sabi account with that e-mail whose e-mail is verified**: the same person proved the inbox twice. Link.
5. **A Sabi account whose e-mail was never verified**: this is incident 3, a **pre-account takeover**. Whoever registered it may not own the inbox. The Kora user has just proved that they do, so they win: link the identity, remove the password, and end every existing session.

Rule 5 is harsh on a real owner who simply never verified their e-mail: their password stops working. Verifying e-mails at registration (the first exercise) makes that case rare.

To test OAuth without the internet, Kora ID is played by a small provider on its own port, built with `@zudojs/http`. It checks what a real provider checks: the client id and secret, the exact redirect URI, PKCE and single-use codes. The query parameter `as` stands in for a person typing their password at Kora:

fake-kora.ts

```ts
import { createHash, randomBytes } from "node:crypto";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";

/*
 * A tiny OAuth 2 provider for tests: "Kora ID". It runs on a real port and checks what a
 * real provider checks: the client, the exact redirect URI, PKCE, and single-use codes.
 * The query parameter "as" stands in for the person typing their password at Kora.
 */
export interface KoraPerson { readonly sub: string; readonly email: string; readonly email_verified: boolean; readonly name: string }

export async function startFakeKora(client: { id: string; secret: string; redirectUri: string }, people: Record<string, KoraPerson>) {
  const codes = new Map<string, { challenge: string; person: KoraPerson }>();
  const accessTokens = new Map<string, KoraPerson>();
  const random = () => randomBytes(16).toString("hex");
  const router = createRouter();

  router.get("/authorize", (ctx) => {
    const q = ctx.query as Record<string, string>;
    const person = people[q.as ?? ""];
    if (q.client_id !== client.id || q.redirect_uri !== client.redirectUri || q.code_challenge_method !== "S256" || !person) {
      return createResponseContext({ status: 400 }).json({ error: "invalid_request" });
    }
    const code = random();
    codes.set(code, { challenge: q.code_challenge ?? "", person });
    return createResponseContext().redirect(`${client.redirectUri}?code=${code}&state=${encodeURIComponent(q.state ?? "")}`);
  });

  router.post("/token", (ctx) => {
    const form = new URLSearchParams(new TextDecoder().decode(ctx.request.body as Uint8Array));
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const proof = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
    const clientOk = form.get("client_id") === client.id && form.get("client_secret") === client.secret;
    if (!grant || !clientOk || grant.challenge !== proof || form.get("redirect_uri") !== client.redirectUri) {
      return createResponseContext({ status: 400 }).json({ error: "invalid_grant" });
    }
    const accessToken = random();
    accessTokens.set(accessToken, grant.person);
    return createResponseContext().json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
  });

  router.get("/userinfo", (ctx) => {
    const person = accessTokens.get((ctx.request.getHeader("authorization") ?? "").replace("Bearer ", ""));
    return person ? createResponseContext().json(person) : createResponseContext({ status: 401 }).json({ error: "invalid_token" });
  });

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  return { base: `http://127.0.0.1:${server.address?.port}`, stop: () => server.stop() };
}
```

Sabi's side follows [the OAuth lesson](https://zudojs.oyinlola.site/learn/zudo-oauth#server), with the pending login moved from a `Map` into the `oauth_logins` table, so the callback may reach a different server than the start. The browser gets a random login id in an HttpOnly cookie; the table stores its hash, the state and the PKCE verifier; the callback deletes the row as it reads it, so a callback works once:

kora.ts

```ts
import type { AuthService, UserId } from "@zudojs/auth";
import { toUserId } from "@zudojs/auth";
import {
  createAuthorizationUrl, exchangeCodeForToken, fetchUserInfo, generateState, OAuthStateMismatchError, verifyState,
} from "@zudojs/auth-oauth";
import type { OAuthConfig, OAuthUserInfo } from "@zudojs/auth-oauth";
import { hashTokenForStorage, randomBase64Url } from "@zudojs/crypto";
import type { DatabaseClient } from "@zudojs/database";
import { withTransaction } from "@zudojs/database";
import { DomainError } from "@zudojs/errors";

export const KORA_CALLBACK = "http://localhost:3000/v1/oauth/kora/callback";

export function createKoraSignIn(db: DatabaseClient, auth: AuthService, kora: OAuthConfig) {
  /**
   * The local account for a Kora profile. Only a verified e-mail may create or link an account.
   * Linking to an account whose own e-mail was never verified evicts whoever set its password.
   */
  async function accountFor(profile: OAuthUserInfo): Promise<{ userId: UserId; evicted: boolean }> {
    const [linked] = await db.queryRawUnsafe<{ user_id: number }[]>(
      "SELECT user_id FROM identities WHERE provider = 'kora' AND provider_id = $1",
      [profile.providerId],
    );
    if (linked) return { userId: toUserId(String(linked.user_id)), evicted: false };
    if (profile.emailVerified !== true || !profile.email) {
      throw new DomainError("Kora has not verified this e-mail address", { code: "EMAIL_NOT_VERIFIED" });
    }
    const email = profile.email.toLowerCase();
    return withTransaction(db, async (tx) => {
      const [existing] = await tx.$queryRawUnsafe<{ id: number; email_verified: boolean }[]>(
        "SELECT id, email_verified FROM users WHERE email = $1 FOR UPDATE", email,
      );
      let userId = existing?.id;
      const evicted = existing !== undefined && !existing.email_verified;
      if (userId === undefined) {
        const [created] = await tx.$queryRawUnsafe<{ id: number }[]>(
          "INSERT INTO users (email, name, email_verified) VALUES ($1, $2, true) RETURNING id", email, profile.name ?? email,
        );
        userId = created!.id;
        await tx.$executeRawUnsafe("INSERT INTO user_roles (user_id, role) VALUES ($1, 'student')", userId);
      } else if (evicted) {
        await tx.$executeRawUnsafe("UPDATE users SET password_hash = NULL, email_verified = true WHERE id = $1", userId);
      }
      await tx.$executeRawUnsafe("INSERT INTO identities (provider, provider_id, user_id) VALUES ('kora', $1, $2)", profile.providerId, userId);
      return { userId: toUserId(String(userId)), evicted };
    });
  }

  return {
    /** Step 1: remember state and PKCE verifier on the server; the browser only gets an opaque login id. */
    async start(): Promise<{ url: string; loginId: string }> {
      const state = generateState();
      const { url, codeVerifier } = createAuthorizationUrl(kora, { state, redirectUri: KORA_CALLBACK });
      const loginId = await randomBase64Url(32);
      await db.executeRawUnsafe(
        "INSERT INTO oauth_logins (id_hash, state, code_verifier, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')",
        [await hashTokenForStorage(loginId), state, codeVerifier],
      );
      return { url, loginId };
    },

    /** Step 2: the callback. State first, then the code, then the account, then our own session. */
    async finish(loginId: string | undefined, query: Readonly<Record<string, string | string[]>>) {
      const [pending] = loginId === undefined ? [] : await db.queryRawUnsafe<{ state: string; code_verifier: string }[]>(
        "DELETE FROM oauth_logins WHERE id_hash = $1 AND expires_at > now() RETURNING state, code_verifier",
        [await hashTokenForStorage(loginId)],
      );
      const state = typeof query.state === "string" ? query.state : "";
      if (!pending || !verifyState(pending.state, state)) throw new OAuthStateMismatchError();
      if (typeof query.code !== "string" || query.code === "") throw new DomainError("Sign-in was cancelled", { code: "OAUTH_CANCELLED" });

      const tokens = await exchangeCodeForToken(kora, { code: query.code, codeVerifier: pending.code_verifier, redirectUri: KORA_CALLBACK });
      const { userId, evicted } = await accountFor(await fetchUserInfo(kora, tokens.accessToken));
      if (evicted) await auth.logoutAll(userId);
      return auth.createSessionForUser(userId, { method: "oauth", metadata: { provider: "kora" } });
    },
  };
}
```

`FOR UPDATE` locks the user row, so two Kora logins for the same new e-mail at the same moment cannot both decide "no account, create one"; the second waits, and then fails on the `identities` primary key instead of creating a duplicate.

## The HTTP layer

The error handler is the one from the REST API use case with one addition. Some errors carry response headers: an `AccountLockedError` has `Retry-After`. A custom handler must copy them, or the client loses the information:

errors.ts

```ts
import { randomUUID } from "node:crypto";
import { normalizeToBaseError } from "@zudojs/errors";
import { createResponseContext, type HttpRequestContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { isSchemaValidationError } from "@zudojs/schema";

/** The error envelope from the REST API lesson, plus the headers some errors carry (Retry-After). */
export function createErrorHandler(logger: Logger) {
  return (thrown: unknown, request: HttpRequestContext) => {
    if (isSchemaValidationError(thrown)) {
      const issues = thrown.issues.map((issue) => ({ path: issue.path.join(".") || "(body)", message: issue.message }));
      return createResponseContext({ status: 400 }).json({ error: { code: "VALIDATION_FAILED", message: "The request is not valid", issues } });
    }
    const error = normalizeToBaseError(thrown);
    if (error.expose && error.statusCode < 500) {
      const response = createResponseContext({ status: error.statusCode });
      const headers = (thrown as { headers?: Record<string, string> }).headers ?? {};
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      return response.json({ error: { code: error.code, message: error.message } });
    }
    const requestId = randomUUID();
    logger.error("Request failed", { requestId, method: request.method, path: request.path, error: thrown instanceof Error ? thrown : String(thrown) });
    return createResponseContext({ status: 500 }).json({ error: { code: "INTERNAL", message: "Something went wrong on our side", requestId } });
  };
}
```

The routes. Sessions are a resource (`POST /v1/sessions` logs in, `DELETE /v1/sessions/current` logs out, `DELETE /v1/sessions` signs out everywhere), and each public endpoint that costs a password hash or sends an e-mail has a per-address rate limit:

http.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import { parseCookies, toUserId } from "@zudojs/auth";
import type { OAuthConfig } from "@zudojs/auth-oauth";
import type { DatabaseClient } from "@zudojs/database";
import { withTransaction } from "@zudojs/database";
import { NotFoundError } from "@zudojs/errors";
import {
  badRequest, createHttpServer, createNodeHttpAdapter, createRateLimitMiddleware, createResponseContext, createRouter,
} from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { schema } from "@zudojs/schema";
import { createAccounts } from "./accounts.js";
import { createAuth, currentUser } from "./auth.js";
import { createErrorHandler } from "./errors.js";
import { createKoraSignIn } from "./kora.js";
import { createPasswordResets, type Mailer } from "./resets.js";
import { authorizeUser, ROLES } from "./roles.js";

const Login = schema.object({ email: schema.string().max(254), password: schema.string().min(1).max(128) });
const Refresh = schema.object({ refreshToken: schema.string().min(1).max(4096) });
const NewCourse = schema.object({ title: schema.string().trim().min(3).max(120) });
const RoleUpdate = schema.object({ roles: schema.array(schema.enum(ROLES)).min(1).max(3) });
const Id = schema.object({ id: schema.coerce.number().int().min(1).max(2_147_483_647) });

function body(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("The body is not valid JSON");
  }
}
const json = (status: number, data?: unknown) => (data === undefined ? createResponseContext({ status }) : createResponseContext({ status }).json(data));
const perMinute = (max: number) => createRateLimitMiddleware({ max, windowMs: 60_000 });

export interface PlatformOptions {
  readonly db: DatabaseClient;
  readonly tokens: TokenConfig;
  readonly kora: OAuthConfig;
  readonly mailer: Mailer;
  readonly logger: Logger;
  /** Per client address; tests that log in many times raise it. */
  readonly loginsPerMinute?: number;
}

export function createPlatform({ db, tokens, kora, mailer, logger, loginsPerMinute = 10 }: PlatformOptions) {
  const accounts = createAccounts(db);
  const { auth, requireUser } = createAuth(db, accounts, tokens);
  const resets = createPasswordResets(db, accounts, auth, mailer, "https://sabi.example");
  const koraSignIn = createKoraSignIn(db, auth, kora);
  const signedIn = { middleware: [requireUser] };
  const router = createRouter();

  router.post("/v1/users", async (ctx) => {
    const user = await accounts.register(body(ctx));
    return json(201, { id: user.id, email: user.email, roles: user.roles });
  }, { middleware: [perMinute(20)] });

  router.post("/v1/sessions", async (ctx) => {
    const { email, password } = Login.parse(body(ctx));
    const client = { ip: ctx.request.remoteAddress, userAgent: ctx.request.getHeader("user-agent")?.slice(0, 200) };
    const { tokens: pair } = await auth.login({ identifier: email, password }, client);
    return json(201, pair);
  }, { middleware: [perMinute(loginsPerMinute)] });

  router.post("/v1/sessions/refresh", async (ctx) => json(200, await auth.refresh(Refresh.parse(body(ctx)).refreshToken)));

  router.delete("/v1/sessions/current", async (ctx) => {
    const { sid } = currentUser(ctx);
    if (sid !== undefined) await auth.logout(sid);
    return json(204);
  }, signedIn);

  router.delete("/v1/sessions", async (ctx) => {
    await auth.logoutAll(currentUser(ctx).sub);
    return json(204);
  }, signedIn);

  router.get("/v1/me", async (ctx) => {
    const user = await accounts.findUserById(currentUser(ctx).sub);
    return json(200, { id: user?.id, email: user?.email, roles: user?.roles });
  }, signedIn);

  router.post("/v1/password-resets", async (ctx) => {
    await resets.request(body(ctx));
    return json(202, { message: "If the address has an account, a reset link is on its way." });
  }, { middleware: [perMinute(5)] });

  router.post("/v1/password-resets/confirm", async (ctx) => {
    await resets.confirm(body(ctx));
    return json(204);
  }, { middleware: [perMinute(10)] });

  router.get("/v1/oauth/kora", async () => {
    const { url, loginId } = await koraSignIn.start();
    return createResponseContext().cookie("kora_login", loginId, { maxAge: 600, path: "/v1/oauth/kora" }).redirect(url);
  });

  router.get("/v1/oauth/kora/callback", async (ctx) => {
    const loginId = parseCookies(ctx.request.getHeader("cookie")).kora_login;
    const { tokens: pair } = await koraSignIn.finish(loginId, ctx.query);
    return json(200, pair).cookie("kora_login", "", { maxAge: 0, path: "/v1/oauth/kora" });
  });

  router.get("/v1/courses", async (ctx) => {
    await authorizeUser(currentUser(ctx), "course:read");
    return json(200, await db.queryRawUnsafe(`SELECT id, title, tutor_id AS "tutorId" FROM courses ORDER BY id`));
  }, signedIn);

  router.post("/v1/courses", async (ctx) => {
    const user = currentUser(ctx);
    await authorizeUser(user, "course:create");
    const { title } = NewCourse.parse(body(ctx));
    const [course] = await db.queryRawUnsafe<unknown[]>(
      `INSERT INTO courses (title, tutor_id) VALUES ($1, $2) RETURNING id, title, tutor_id AS "tutorId"`, [title, Number(user.sub)],
    );
    return json(201, course);
  }, signedIn);

  router.patch("/v1/courses/:id", async (ctx) => {
    const user = currentUser(ctx);
    const { id } = Id.parse(ctx.params);
    const [course] = await db.queryRawUnsafe<{ id: number; tutorId: number }[]>(`SELECT id, tutor_id AS "tutorId" FROM courses WHERE id = $1`, [id]);
    if (!course) throw new NotFoundError(`Course ${id} not found`);
    await authorizeUser(user, "course:update", course);
    const { title } = NewCourse.parse(body(ctx));
    await db.executeRawUnsafe("UPDATE courses SET title = $2 WHERE id = $1", [id, title]);
    return json(200, { id, title, tutorId: course.tutorId });
  }, signedIn);

  router.put("/v1/users/:id/roles", async (ctx) => {
    const admin = currentUser(ctx);
    await authorizeUser(admin, "user:assign-roles");
    const { id } = Id.parse(ctx.params);
    const { roles } = RoleUpdate.parse(body(ctx));
    if (String(id) === admin.sub) throw badRequest("You cannot change your own roles");
    if (!(await accounts.findUserById(toUserId(String(id))))) throw new NotFoundError(`User ${id} not found`);
    await withTransaction(db, async (tx) => {
      await tx.$executeRawUnsafe("DELETE FROM user_roles WHERE user_id = $1", id);
      for (const role of new Set(roles)) await tx.$executeRawUnsafe("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", id, role);
    });
    await auth.logoutAll(toUserId(String(id)));
    return json(200, { id, roles: [...new Set(roles)].sort() });
  }, signedIn);

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
    errorHandler: createErrorHandler(logger),
  });
  return { server, auth, accounts };
}
```

- Logout uses `sid` from the verified token, never an id from the request, so nobody can end someone else's session.
- The role update checks the permission, refuses self-changes, replaces the roles in one transaction, and then ends the user's sessions.
- A course is loaded *before* the permission check, because the ownership rule needs it; a missing course is 404, someone else's is 403 (courses are public to read, so their existence is no secret).

Last, a starter for demos and tests: Sabi and the fake Kora on free ports, an outbox instead of real e-mail, and random secrets. The Kora configuration names Kora's public address; the `fetch` option sends those requests to the fake instead. That redirection is needed because `@zudojs/auth-oauth` refuses provider URLs on `127.0.0.1`: its SSRF guard (server-side request forgery, from [the security lesson](https://zudojs.oyinlola.site/learn/zudo-security)) blocks loopback and private addresses. Your real app passes no `fetch`.

sabi.ts

```ts
import { randomBytes } from "node:crypto";
import { createLogger } from "@zudojs/logger";
import { startFakeKora, type KoraPerson } from "./fake-kora.js";
import { createPlatform } from "./http.js";
import { KORA_CALLBACK } from "./kora.js";
import { SCHEMA } from "./schema.js";
import { openDatabase } from "./sql.js";

/* DEMO ONLY: random secrets for each run. Your app reads them from the environment. */
const secret = () => randomBytes(32).toString("base64url");

export const KORA_PEOPLE: Record<string, KoraPerson> = {
  ada: { sub: "kora-1001", email: "ada@example.com", email_verified: true, name: "Ada Obi" },
  bola: { sub: "kora-1002", email: "bola@example.com", email_verified: true, name: "Bola Ade" },
  eve: { sub: "kora-6666", email: "ada@example.com", email_verified: false, name: "Eve" },
};

export interface Reply { readonly status: number; readonly headers: Headers; readonly body: any }

/** Starts Sabi's account platform and a fake Kora ID, each on a free port. */
export async function startSabi({ log = console.log, loginsPerMinute = 10 }: { log?: (line: string) => void; loginsPerMinute?: number } = {}) {
  const koraClient = { id: "sabi-web", secret: secret(), redirectUri: KORA_CALLBACK };
  const kora = await startFakeKora(koraClient, KORA_PEOPLE);
  const db = await openDatabase(SCHEMA);
  const outbox: { to: string; subject: string; text: string }[] = [];
  const platform = createPlatform({
    db,
    loginsPerMinute,
    tokens: { accessSecret: secret(), refreshSecret: secret(), issuer: "sabi", audience: "sabi-api" },
    kora: {
      provider: "custom",
      clientId: koraClient.id,
      clientSecret: koraClient.secret,
      authorizeUrl: "https://id.kora.example/authorize",
      tokenUrl: "https://id.kora.example/token",
      userInfoUrl: "https://id.kora.example/userinfo",
      allowedRedirectUris: [KORA_CALLBACK],
      scopes: ["openid", "email", "profile"],
      // Tests only: Kora's public address is served by the fake on this machine.
      fetch: (url, init) => fetch(url.replace("https://id.kora.example", kora.base), init),
    },
    mailer: { send: async (to, subject, text) => void outbox.push({ to, subject, text }) },
    logger: createLogger({
      name: "sabi",
      transports: [
        (entry) => {
          const { error } = entry.metadata as { error?: { name: string; message: string } };
          log(`[${entry.levelName}] ${entry.message}: ${error?.name}: ${error?.message}`);
        },
      ],
    }),
  });
  await platform.server.start();
  const base = `http://127.0.0.1:${platform.server.address?.port}`;

  async function call(method: string, path: string, data?: unknown, token?: string, headers: Record<string, string> = {}): Promise<Reply> {
    const response = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  async function stop(): Promise<void> {
    await platform.server.stop();
    await kora.stop();
    await db.disconnect();
  }

  return { db, base, kora, outbox, call, stop, auth: platform.auth };
}
```

## Sessions in action

Ada registers (and tries to make herself an admin), logs in on her laptop and her phone, refreshes, and then an attacker replays her old refresh token:

sessions-demo.tsNode.js only

```ts
import { startSabi, type Reply } from "./sabi.js";

const sabi = await startSabi();
const show = (label: string, r: Reply) => console.log(`${label} -> ${r.status}`, r.body?.error ? r.body.error.code : "");
const password = "ada's long passphrase";

const joined = await sabi.call("POST", "/v1/users", { email: "Ada@Example.com", name: "Ada", password, roles: ["admin"] });
console.log("register ->", joined.status, joined.body);

const laptop = (await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password })).body;
const phone = (await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password })).body;
console.log("tokens:", Object.keys(laptop), laptop.expiresIn);
show("me on laptop", await sabi.call("GET", "/v1/me", undefined, laptop.accessToken));

const refreshed = await sabi.call("POST", "/v1/sessions/refresh", { refreshToken: laptop.refreshToken });
show("refresh", refreshed);
show("refresh with the old token again", await sabi.call("POST", "/v1/sessions/refresh", { refreshToken: laptop.refreshToken }));
show("laptop's new token after the replay", await sabi.call("GET", "/v1/me", undefined, refreshed.body.accessToken));
show("phone after the replay", await sabi.call("GET", "/v1/me", undefined, phone.accessToken));

const again = (await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password })).body;
show("log out", await sabi.call("DELETE", "/v1/sessions/current", undefined, again.accessToken));
show("same token after log out", await sabi.call("GET", "/v1/me", undefined, again.accessToken));
const rows = await sabi.db.queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM sessions");
console.log("sessions left:", rows[0]?.n);
await sabi.stop();
```

Output of `npx tsx sessions-demo.ts`

```ts
register -> 201 { id: '1', email: 'ada@example.com', roles: [ 'student' ] }
tokens: [ 'accessToken', 'refreshToken', 'expiresIn', 'tokenType' ] 900
me on laptop -> 200
refresh -> 200
refresh with the old token again -> 401 ERR_TOKEN_REVOKED
laptop's new token after the replay -> 401 ERR_AUTHENTICATION_FAILED
phone after the replay -> 401 ERR_AUTHENTICATION_FAILED
log out -> 204
same token after log out -> 401 ERR_AUTHENTICATION_FAILED
sessions left: 0
```

- The `roles` in the registration body were ignored: Ada is a student (incident 4).
- The first refresh worked. The second use of the same refresh token was refused with `ERR_TOKEN_REVOKED`, and the service ended *all* of Ada's sessions: the new laptop token and the phone stopped working too. The server cannot tell whether Ada or a thief made the first refresh, so it makes both log in again.
- After logout, a token with 14 minutes left is dead, and no session rows are left.

## A password reset, start to finish

reset-demo.tsNode.js only

```ts
import { startSabi, type Reply } from "./sabi.js";

const sabi = await startSabi();
const show = (label: string, r: Reply) => console.log(`${label} -> ${r.status}`, r.body?.error?.code ?? r.body?.message ?? "");
await sabi.call("POST", "/v1/users", { email: "ada@example.com", name: "Ada", password: "old passphrase 2025" });
const before = (await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password: "old passphrase 2025" })).body;

show("reset for Ada", await sabi.call("POST", "/v1/password-resets", { email: "ADA@example.com" }));
show("reset for a stranger", await sabi.call("POST", "/v1/password-resets", { email: "nobody@example.com" }));
console.log("e-mails sent:", sabi.outbox.map((mail) => `${mail.to}: ${mail.subject}`));

const token = sabi.outbox[0]!.text.match(/token=(\S+)/)![1]!;
const stored = await sabi.db.queryRawUnsafe<{ token_hash: string }[]>("SELECT token_hash FROM password_resets");
console.log("token starts with", token.slice(0, 6), "| stored as", stored[0]!.token_hash.length, "hex characters, not the token:", stored[0]!.token_hash !== token);

show("confirm with a guessed token", await sabi.call("POST", "/v1/password-resets/confirm", { token: "reset_" + "A".repeat(43), password: "new passphrase 2026" }));
show("confirm", await sabi.call("POST", "/v1/password-resets/confirm", { token, password: "new passphrase 2026" }));
show("confirm again with the same link", await sabi.call("POST", "/v1/password-resets/confirm", { token, password: "attacker passphrase" }));
show("session from before the reset", await sabi.call("GET", "/v1/me", undefined, before.accessToken));
show("old password", await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password: "old passphrase 2025" }));
show("new password", await sabi.call("POST", "/v1/sessions", { email: "ada@example.com", password: "new passphrase 2026" }));

await sabi.call("POST", "/v1/password-resets", { email: "ada@example.com" });
await sabi.db.executeRawUnsafe("UPDATE password_resets SET expires_at = now() - interval '1 minute'"); // 31 minutes later
const late = sabi.outbox[1]!.text.match(/token=(\S+)/)![1]!;
show("confirm after 30 minutes", await sabi.call("POST", "/v1/password-resets/confirm", { token: late, password: "another passphrase" }));
await sabi.stop();
```

Output of `npx tsx reset-demo.ts`

```ts
reset for Ada -> 202 If the address has an account, a reset link is on its way.
reset for a stranger -> 202 If the address has an account, a reset link is on its way.
e-mails sent: [ 'ada@example.com: Reset your Sabi password' ]
token starts with reset_ | stored as 64 hex characters, not the token: true
confirm with a guessed token -> 422 RESET_TOKEN_INVALID
confirm -> 204
confirm again with the same link -> 422 RESET_TOKEN_INVALID
session from before the reset -> 401 ERR_AUTHENTICATION_FAILED
old password -> 401 ERR_INVALID_CREDENTIALS
new password -> 201
confirm after 30 minutes -> 422 RESET_TOKEN_INVALID
```

Every rule from the reasoning holds: the same 202 for Ada and for a stranger (but only Ada got an e-mail), a token that starts with `reset_` so it is recognisable in a leak scan, a stored hash instead of the token, a guessed token and a second use both refused, the old session and the old password dead, and a link from 31 minutes ago refused. Changing `expires_at` in the database stands in for waiting half an hour.

## Roles in action

Grace is made the first admin by a seed script, as in the REST API use case. Tunde, a student, tries to act above his role, then Grace promotes him:

rbac-demo.tsNode.js only

```ts
import { startSabi, type Reply } from "./sabi.js";

const sabi = await startSabi();
const show = (label: string, r: Reply) => console.log(`${label} -> ${r.status}`, r.body?.error?.code ?? JSON.stringify(r.body ?? ""));
const passwordOf = (email: string) => `${email} long passphrase`;
const register = async (email: string) =>
  (await sabi.call("POST", "/v1/users", { email, name: email.split("@")[0], password: passwordOf(email) })).body.id as string;
const logIn = async (email: string) =>
  (await sabi.call("POST", "/v1/sessions", { email, password: passwordOf(email) })).body.accessToken as string;

const graceId = await register("grace@sabi.example");
await sabi.db.executeRawUnsafe("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [Number(graceId)]); // seed script
const admin = await logIn("grace@sabi.example");
const tundeId = await register("tunde@example.com");
const student = await logIn("tunde@example.com");

show("student creates a course", await sabi.call("POST", "/v1/courses", { title: "Algebra 1" }, student));
show("student makes himself tutor", await sabi.call("PUT", `/v1/users/${tundeId}/roles`, { roles: ["tutor"] }, student));
show("admin makes Tunde a tutor", await sabi.call("PUT", `/v1/users/${tundeId}/roles`, { roles: ["student", "tutor"] }, admin));
show("Tunde's old token", await sabi.call("GET", "/v1/courses", undefined, student));

const tutor = await logIn("tunde@example.com");
show("tutor creates a course", await sabi.call("POST", "/v1/courses", { title: "Algebra 1" }, tutor));
show("admin creates a course", await sabi.call("POST", "/v1/courses", { title: "Chemistry" }, admin));
show("tutor renames his course", await sabi.call("PATCH", "/v1/courses/1", { title: "Algebra for beginners" }, tutor));
show("tutor renames Grace's course", await sabi.call("PATCH", "/v1/courses/2", { title: "Tunde's now" }, tutor));
show("tutor reads courses", await sabi.call("GET", "/v1/courses", undefined, tutor));
show("admin changes own roles", await sabi.call("PUT", `/v1/users/${graceId}/roles`, { roles: ["student"] }, admin));
await sabi.stop();
```

Output of `npx tsx rbac-demo.ts`

```ts
student creates a course -> 403 ERR_FORBIDDEN
student makes himself tutor -> 403 ERR_FORBIDDEN
admin makes Tunde a tutor -> 200 {"id":2,"roles":["student","tutor"]}
Tunde's old token -> 401 ERR_AUTHENTICATION_FAILED
tutor creates a course -> 201 {"id":1,"title":"Algebra 1","tutorId":2}
admin creates a course -> 201 {"id":2,"title":"Chemistry","tutorId":1}
tutor renames his course -> 200 {"id":1,"title":"Algebra for beginners","tutorId":2}
tutor renames Grace's course -> 403 ERR_FORBIDDEN
tutor reads courses -> 200 [{"id":1,"title":"Algebra for beginners","tutorId":2},{"id":2,"title":"Chemistry","tutorId":1}]
admin changes own roles -> 400 BAD_REQUEST
```

Tunde's token from before the promotion stopped working the moment his roles changed (the fix for incident 1): he logs in again and his new token says `tutor`. As a tutor he edits his own course but not Grace's, reads the course list he inherited from the student role, and Grace cannot change her own roles.

## Kora sign-in in action

The demo plays the browser: it starts at Sabi, follows the redirect to the fake Kora, "signs in" as a person, and brings the code back to Sabi's callback with the login cookie. Ada has a verified password account. Mallory registered `bola@example.com` before the real Bola:

kora-demo.tsNode.js only

```ts
import { startSabi } from "./sabi.js";

const sabi = await startSabi();

/** Plays the browser: start at Sabi, sign in at Kora as `person`, come back to the callback. */
async function signInWithKora(person: string, options: { dropCookie?: boolean; replay?: boolean } = {}) {
  const start = await sabi.call("GET", "/v1/oauth/kora");
  const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0]!;
  const authorize = new URL(start.headers.get("location")!);
  authorize.searchParams.set("as", person);
  const atKora = await fetch(authorize.toString().replace("https://id.kora.example", sabi.kora.base), { redirect: "manual" });
  const back = new URL(atKora.headers.get("location")!);
  const callback = () => sabi.call("GET", back.pathname + back.search, undefined, undefined, options.dropCookie ? {} : { cookie });
  const first = await callback();
  return options.replay ? callback() : first;
}
const me = async (token: string) => (await sabi.call("GET", "/v1/me", undefined, token)).body;

// Ada has a password account and has verified her e-mail. Mallory registered bola@example.com before Bola did.
await sabi.call("POST", "/v1/users", { email: "ada@example.com", name: "Ada", password: "ada's long passphrase" });
await sabi.db.executeRawUnsafe("UPDATE users SET email_verified = true WHERE email = 'ada@example.com'");
const mallory = { email: "bola@example.com", password: "mallory's passphrase" };
await sabi.call("POST", "/v1/users", { ...mallory, name: "Bola" });
const malloryToken = (await sabi.call("POST", "/v1/sessions", mallory)).body.accessToken;

const start = await sabi.call("GET", "/v1/oauth/kora");
console.log("start ->", start.status, start.headers.get("location")?.split("?")[0], (start.headers.get("set-cookie") ?? "").split("=")[0]);
for (const person of ["ada", "bola", "ada"]) {
  const reply = await signInWithKora(person);
  console.log(`${person} via Kora ->`, reply.status, await me(reply.body.accessToken));
}
console.log("Mallory's session ->", (await sabi.call("GET", "/v1/me", undefined, malloryToken)).status);
console.log("Mallory's password ->", (await sabi.call("POST", "/v1/sessions", mallory)).status);

const eve = await signInWithKora("eve");
console.log("eve (unverified ada@example.com) ->", eve.status, eve.body.error.code);
const forged = await signInWithKora("bola", { dropCookie: true });
console.log("callback without the login cookie ->", forged.status, forged.body.error.code);
const replayed = await signInWithKora("bola", { replay: true });
console.log("same callback twice ->", replayed.status, replayed.body.error.code);
await sabi.stop();
```

Output of `npx tsx kora-demo.ts`

```ts
start -> 302 https://id.kora.example/authorize kora_login
ada via Kora -> 200 { id: '1', email: 'ada@example.com', roles: [ 'student' ] }
bola via Kora -> 200 { id: '2', email: 'bola@example.com', roles: [ 'student' ] }
ada via Kora -> 200 { id: '1', email: 'ada@example.com', roles: [ 'student' ] }
Mallory's session -> 401
Mallory's password -> 401
eve (unverified ada@example.com) -> 422 EMAIL_NOT_VERIFIED
callback without the login cookie -> 400 OAUTH_STATE_MISMATCH
same callback twice -> 400 OAUTH_STATE_MISMATCH
```

- Ada's Kora login was linked to her existing account (id 1), and the second Kora login found the link.
- Bola's Kora login landed on the account Mallory had registered, because the e-mail matched, but Mallory was evicted: her session is dead and her password no longer works. Incident 3 cannot repeat.
- Eve's Kora account claims `ada@example.com` without Kora having verified it: refused.
- A callback without the login cookie (login CSRF) and the same callback twice both fail the state check.

## The test suite

The tests use the Vitest runner and config from [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api#tests). Password hashing is slow on purpose, so the rules are spread over three files, each starting one platform for all its tests; every test uses its own e-mail addresses so the tests do not affect each other. The files raise the login rate limit, because they log in more than ten times a minute from one address; the limiter keeps its default everywhere else. Shared helpers live in a harness:

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 50_000 } });
```

vitest-run.ts

```ts
import { startVitest } from "vitest/node";

/** Runs test files with Vitest and prints one line per test. */
export async function runTests(...files: string[]): Promise<void> {
  const vitest = await startVitest("test", files, { watch: false, reporters: [] });
  for (const file of vitest.state.getTestModules()) {
    for (const error of file.errors()) console.log(`× ${file.relativeModuleId}: ${error.message}`);
    for (const test of file.children.allTests()) {
      const { state, errors = [] } = test.result();
      console.log(`${state === "passed" ? "✓" : "×"} ${test.fullName}`);
      for (const error of errors) console.log(`    ${error.message}`);
    }
  }
  await vitest.close();
}
```

tests/harness.ts

```ts
import { startSabi } from "../sabi.js";

export type Sabi = Awaited<ReturnType<typeof startSabi>>;

export const passwordOf = (email: string) => `${email} long passphrase`;

export async function logIn(sabi: Sabi, email: string, password = passwordOf(email)) {
  const reply = await sabi.call("POST", "/v1/sessions", { email, password });
  return { status: reply.status, headers: reply.headers, access: reply.body.accessToken as string, refresh: reply.body.refreshToken as string };
}

export async function signUp(sabi: Sabi, email: string) {
  const joined = await sabi.call("POST", "/v1/users", { email, name: "Test", password: passwordOf(email), roles: ["admin"] });
  return { id: joined.body.id as string, roles: joined.body.roles as string[], ...(await logIn(sabi, email)) };
}

export const meStatus = async (sabi: Sabi, token: string) => (await sabi.call("GET", "/v1/me", undefined, token)).status;

/** Plays the browser through Kora: start, sign in at the fake Kora as `person`, return to the callback. */
export async function signInWithKora(sabi: Sabi, person: string, cookieOverride?: string) {
  const start = await sabi.call("GET", "/v1/oauth/kora");
  const cookie = cookieOverride ?? (start.headers.get("set-cookie") ?? "").split(";")[0]!;
  const authorize = new URL(start.headers.get("location")!);
  authorize.searchParams.set("as", person);
  const atKora = await fetch(authorize.toString().replace("https://id.kora.example", sabi.kora.base), { redirect: "manual" });
  const back = new URL(atKora.headers.get("location")!);
  return sabi.call("GET", back.pathname + back.search, undefined, undefined, { cookie });
}
```

Sessions: registration, refresh rotation, logout, idle expiry and "sign out everywhere":

tests/sessions.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSabi } from "../sabi.js";
import { logIn, meStatus, passwordOf, type Sabi, signUp } from "./harness.js";

let sabi: Sabi;
beforeAll(async () => {
  sabi = await startSabi({ log: () => {}, loginsPerMinute: 1000 });
});
afterAll(() => sabi.stop());

describe("Sabi sessions", () => {
  it("registers students only, and once per e-mail", async () => {
    const user = await signUp(sabi, "reg@example.com");
    expect(user.roles).toEqual(["student"]);
    expect((await sabi.call("POST", "/v1/users", { email: "REG@example.com", name: "Again", password: passwordOf("x") })).status).toBe(409);
  });

  it("accepts a refresh token once, and ends every session when it is replayed", async () => {
    const laptop = await signUp(sabi, "refresh@example.com");
    const phone = await logIn(sabi, "refresh@example.com");
    expect((await sabi.call("POST", "/v1/sessions/refresh", { refreshToken: laptop.refresh })).status).toBe(200);
    expect((await sabi.call("POST", "/v1/sessions/refresh", { refreshToken: laptop.refresh })).status).toBe(401);
    expect(await meStatus(sabi, phone.access)).toBe(401);
  });

  it("kills tokens at logout, idle expiry and 'sign out everywhere'", async () => {
    const a = await signUp(sabi, "logout@example.com");
    const b = await logIn(sabi, "logout@example.com");
    const c = await logIn(sabi, "logout@example.com");
    expect((await sabi.call("DELETE", "/v1/sessions/current", undefined, a.access)).status).toBe(204);
    expect([await meStatus(sabi, a.access), await meStatus(sabi, b.access)]).toEqual([401, 200]);
    await sabi.db.executeRawUnsafe(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = (SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1)",
    );
    expect(await meStatus(sabi, c.access)).toBe(401);
    expect((await sabi.call("DELETE", "/v1/sessions", undefined, b.access)).status).toBe(204);
    expect(await meStatus(sabi, b.access)).toBe(401);
  });
});
```

run-session-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/sessions.test.ts");
```

Output of `npx tsx run-session-tests.ts`

```ts
✓ Sabi sessions > registers students only, and once per e-mail
✓ Sabi sessions > accepts a refresh token once, and ends every session when it is replayed
✓ Sabi sessions > kills tokens at logout, idle expiry and 'sign out everywhere'
```

Recovery: the lockout, tried on an e-mail that has no account (it locks the same way, so it reveals nothing), and the whole reset flow:

tests/recovery.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSabi } from "../sabi.js";
import { logIn, meStatus, type Sabi, signUp } from "./harness.js";

let sabi: Sabi;
beforeAll(async () => {
  sabi = await startSabi({ log: () => {}, loginsPerMinute: 1000 });
});
afterAll(() => sabi.stop());

const resetLink = (to: string) => sabi.outbox.findLast((mail) => mail.to === to)!.text.match(/token=(\S+)/)![1]!;

describe("Sabi recovery", () => {
  it("locks an e-mail after five wrong passwords, known or not, and says when to come back", async () => {
    for (let i = 0; i < 5; i++) expect((await logIn(sabi, "nobody@example.com", "guess " + i)).status).toBe(401);
    const locked = await logIn(sabi, "nobody@example.com", "any password");
    expect(locked.status).toBe(423);
    expect(locked.headers.get("retry-after")).toBe("900");
  });

  it("resets a password with a single-use link and ends old sessions", async () => {
    const before = await signUp(sabi, "reset@example.com");
    expect((await sabi.call("POST", "/v1/password-resets", { email: "reset@example.com" })).status).toBe(202);
    expect((await sabi.call("POST", "/v1/password-resets", { email: "ghost@example.com" })).status).toBe(202);
    expect(sabi.outbox.filter((mail) => mail.to === "ghost@example.com")).toEqual([]);
    const token = resetLink("reset@example.com");
    const confirm = () => sabi.call("POST", "/v1/password-resets/confirm", { token, password: "a brand new passphrase" });
    expect((await confirm()).status).toBe(204);
    expect((await confirm()).status).toBe(422);
    expect(await meStatus(sabi, before.access)).toBe(401);
    expect((await logIn(sabi, "reset@example.com", "a brand new passphrase")).status).toBe(201);
    const stored = await sabi.db.queryRawUnsafe<{ token_hash: string }[]>("SELECT token_hash FROM password_resets");
    expect(stored.map((row) => row.token_hash)).not.toContain(token);
  });
});
```

run-recovery-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/recovery.test.ts");
```

Output of `npx tsx run-recovery-tests.ts`

```ts
✓ Sabi recovery > locks an e-mail after five wrong passwords, known or not, and says when to come back
✓ Sabi recovery > resets a password with a single-use link and ends old sessions
```

Access: role assignment and every Kora linking rule:

tests/access.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSabi } from "../sabi.js";
import { logIn, meStatus, type Sabi, signInWithKora, signUp } from "./harness.js";

let sabi: Sabi;
beforeAll(async () => {
  sabi = await startSabi({ log: () => {}, loginsPerMinute: 1000 });
});
afterAll(() => sabi.stop());

describe("Sabi roles and Kora", () => {
  it("lets only admins assign roles, and ends the changed user's sessions", async () => {
    const admin = await signUp(sabi, "admin@sabi.example");
    await sabi.db.executeRawUnsafe("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [Number(admin.id)]);
    const adminToken = (await logIn(sabi, "admin@sabi.example")).access;
    const tunde = await signUp(sabi, "tunde@example.com");
    expect((await sabi.call("POST", "/v1/courses", { title: "Algebra" }, tunde.access)).status).toBe(403);
    expect((await sabi.call("PUT", `/v1/users/${tunde.id}/roles`, { roles: ["admin"] }, tunde.access)).status).toBe(403);
    expect((await sabi.call("PUT", `/v1/users/${tunde.id}/roles`, { roles: ["tutor"] }, adminToken)).status).toBe(200);
    expect(await meStatus(sabi, tunde.access)).toBe(401);
    const tutor = (await logIn(sabi, "tunde@example.com")).access;
    const own = await sabi.call("POST", "/v1/courses", { title: "Algebra" }, tutor);
    const other = await sabi.call("POST", "/v1/courses", { title: "Chemistry" }, adminToken);
    expect((await sabi.call("PATCH", `/v1/courses/${own.body.id}`, { title: "Algebra 2" }, tutor)).status).toBe(200);
    expect((await sabi.call("PATCH", `/v1/courses/${other.body.id}`, { title: "Mine" }, tutor)).status).toBe(403);
  });

  it("creates one account per Kora identity and signs it in again later", async () => {
    const first = await signInWithKora(sabi, "bola");
    const again = await signInWithKora(sabi, "bola");
    const me = await sabi.call("GET", "/v1/me", undefined, again.body.accessToken);
    expect([first.status, again.status, me.body.email]).toEqual([200, 200, "bola@example.com"]);
    expect(await sabi.db.queryRawUnsafe("SELECT count(*)::int AS n FROM users WHERE email = 'bola@example.com'")).toEqual([{ n: 1 }]);
  });

  it("evicts whoever registered the e-mail first without verifying it", async () => {
    const squatter = { email: "ada@example.com", password: "registered before Ada" };
    await sabi.call("POST", "/v1/users", { ...squatter, name: "Not Ada" });
    const session = (await sabi.call("POST", "/v1/sessions", squatter)).body.accessToken;
    expect((await signInWithKora(sabi, "ada")).status).toBe(200);
    expect((await sabi.call("GET", "/v1/me", undefined, session)).status).toBe(401);
    expect((await sabi.call("POST", "/v1/sessions", squatter)).status).toBe(401);
  });

  it("refuses an unverified e-mail, a missing login cookie and a forged one", async () => {
    expect((await signInWithKora(sabi, "eve")).body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await signInWithKora(sabi, "ada", "")).status).toBe(400);
    expect((await signInWithKora(sabi, "ada", "kora_login=made-up")).status).toBe(400);
  });
});
```

run-access-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/access.test.ts");
```

Output of `npx tsx run-access-tests.ts`

```ts
✓ Sabi roles and Kora > lets only admins assign roles, and ends the changed user's sessions
✓ Sabi roles and Kora > creates one account per Kora identity and signs it in again later
✓ Sabi roles and Kora > evicts whoever registered the e-mail first without verifying it
✓ Sabi roles and Kora > refuses an unverified e-mail, a missing login cookie and a forged one
```

The idle-expiry test moves one session's `expires_at` into the past instead of waiting 30 minutes: the store's query decides expiry, so that is exactly the state a real idle session reaches. The lockout test also checks the `Retry-After` header, which only arrives because the error handler copies error headers. Remove that loop from `errors.ts` and watch the test fail.

## Failure cases and production concerns

- **Secrets**: two JWT secrets of 32 bytes or more from the environment, and the Kora client secret. Rotating the access secret logs everyone out; plan it like a deploy.
- **Shared counters**: the login lockout uses the memory `LoginAttemptStore`, and the rate limiter counts per process. With several servers, implement `LoginAttemptStore` on Redis or PostgreSQL (its `recordFailure` must be atomic), and use a shared rate-limit store.
- **Cleanup**: expired sessions, used or expired reset tokens, old `revoked_tokens` and abandoned `oauth_logins` are dead but still stored. A nightly job with [@zudojs/scheduler](https://zudojs.oyinlola.site/learn/zudo-scheduler) deletes them.
- **Timing**: the reset endpoint answers "no such e-mail" faster than "e-mail sent", which leaks what the identical message hides. Put the e-mail on a queue ([@zudojs/queue](https://zudojs.oyinlola.site/learn/zudo-queue)) so both paths take the same short time.
- **Kora outages**: `@zudojs/auth-oauth` times out provider requests (10 seconds by default) with an `OAuthNetworkError` (504); a provider that refuses answers with an `OAuthProviderError` (502). The error handler logs them and answers a plain 500 with a request id. Password login must keep working when Kora is down; never make it depend on the provider.
- **Browsers**: send the access token in an HttpOnly cookie rather than exposing it to page scripts, and add CSRF protection to state-changing routes ([security](https://zudojs.oyinlola.site/learn/zudo-security)). The mobile app can keep using the `Authorization` header.
- **Audit**: logins, failed logins, resets, role changes and evictions are the events a security team asks for after an incident. Write them to an audit table in the same transaction as the change.

## Practice

TRY IT YOURSELF

### Verify e-mails at registration

Rule 5 of the Kora linking removes the password of an unverified account. Make that rare: after registration, e-mail a verification link. Write `createEmailVerification(db, mailer)` with `send(userId, email)` and `confirm(token)`, using `generateVerificationToken` and storing only a hash. A token works once, for 24 hours, and must not verify an address the user changed in the meantime.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`send` mirrors `createInvite`'s: `await generateVerificationToken()`, insert `await hashTokenForStorage(token)` with the user id, e-mail and `now() + interval '24 hours'`, then `mailer.send(...)` with the token in the link.

HINT 2

`confirm` needs `DELETE FROM email_verifications WHERE token_hash = $1 AND expires_at > now() RETURNING user_id, email`. No row means `false`. Otherwise `UPDATE users SET email_verified = true WHERE id = $1 AND email = $2` with the row's `user_id` and `email` — the returned row count, not just "no error", tells you whether it verified anything.

SOLUTION

verify-email.tsNode.js only

```ts
import { generateVerificationToken, hashTokenForStorage } from "@zudojs/crypto";
import type { DatabaseClient } from "@zudojs/database";
import type { Mailer } from "./resets.js";
import { startSabi } from "./sabi.js";

function createEmailVerification(db: DatabaseClient, mailer: Mailer) {
  return {
    async send(userId: number, email: string): Promise<void> {
      const token = await generateVerificationToken();
      await db.executeRawUnsafe(
        `INSERT INTO email_verifications (token_hash, user_id, email, expires_at)
         VALUES ($1, $2, $3, now() + interval '24 hours')`,
        [await hashTokenForStorage(token), userId, email],
      );
      await mailer.send(email, "Confirm your e-mail", `Open https://sabi.example/verify#token=${token}`);
    },
    async confirm(token: string): Promise<boolean> {
      const [row] = await db.queryRawUnsafe<{ user_id: number; email: string }[]>(
        `DELETE FROM email_verifications WHERE token_hash = $1 AND expires_at > now() RETURNING user_id, email`,
        [await hashTokenForStorage(token)],
      );
      if (!row) return false;
      const changed = await db.executeRawUnsafe("UPDATE users SET email_verified = true WHERE id = $1 AND email = $2", [row.user_id, row.email]);
      return changed === 1;
    },
  };
}

const sabi = await startSabi();
await sabi.db.executeRawUnsafe(
  "CREATE TABLE email_verifications (token_hash text PRIMARY KEY, user_id integer NOT NULL REFERENCES users (id), email text NOT NULL, expires_at timestamptz NOT NULL)",
);
const mails: string[] = [];
const verification = createEmailVerification(sabi.db, { send: async (_to, _subject, text) => void mails.push(text) });

const joined = await sabi.call("POST", "/v1/users", { email: "ada@example.com", name: "Ada", password: "ada's long passphrase" });
await verification.send(Number(joined.body.id), joined.body.email);
const token = mails[0]!.match(/token=(\S+)/)![1]!;
console.log("token prefix:", token.split("_")[0]);
console.log("wrong token:", await verification.confirm("verify_" + "x".repeat(43)));
console.log("right token:", await verification.confirm(token));
console.log("same token again:", await verification.confirm(token));
console.log(await sabi.db.queryRawUnsafe("SELECT email, email_verified FROM users"));
await sabi.stop();
```

Output of `npx tsx verify-email.ts`

```ts
token prefix: verify
wrong token: false
right token: true
same token again: false
[ { email: 'ada@example.com', email_verified: true } ]
```

The row stores the e-mail the link was sent to, and `confirm` only verifies the account if its e-mail is still that one. `DELETE … RETURNING` reads and uses the token in one statement, so it works once. In the platform, you would call `send` from the registration route and add the table to `SCHEMA`.

TRY IT YOURSELF

### Show my devices

Users want a list of the devices where they are signed in, with the current one marked. Write `listDevices(db, user)` for the verified token payload of the caller. Which fields must come from the token, and why must the list not contain session ids?

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The query needs both the owner and which row is "current": `WHERE user_id = $1 AND expires_at > now()`, with `id = $2 AS current` in the select list, parameters `[Number(user.sub), user.sid ?? ""]`.

HINT 2

`COALESCE(user_agent, 'unknown') AS device` handles a session with no recorded agent, and `ORDER BY created_at` keeps the list in login order.

SOLUTION

devices.tsNode.js only

```ts
import type { TokenPayload } from "@zudojs/auth";
import type { DatabaseClient } from "@zudojs/database";
import { startSabi } from "./sabi.js";

/** The caller's own live sessions. Owner and "current" come from the verified token, never the request. */
function listDevices(db: DatabaseClient, user: TokenPayload) {
  return db.queryRawUnsafe<{ device: string; current: boolean }[]>(
    `SELECT COALESCE(user_agent, 'unknown') AS device, id = $2 AS current
     FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at`,
    [Number(user.sub), user.sid ?? ""],
  );
}

const sabi = await startSabi();
for (const email of ["ada@example.com", "bola@example.com"]) {
  await sabi.call("POST", "/v1/users", { email, name: email, password: `${email} long passphrase` });
}
async function logIn(email: string, agent: string): Promise<string> {
  const credentials = { email, password: `${email} long passphrase` };
  return (await sabi.call("POST", "/v1/sessions", credentials, undefined, { "user-agent": agent })).body.accessToken;
}

await logIn("ada@example.com", "Sabi Android 3.2");
const laptop = await logIn("ada@example.com", "Firefox 131 on Windows");
await logIn("bola@example.com", "Bola's iPhone");
console.log(await listDevices(sabi.db, await sabi.auth.verifyToken(laptop)));
await sabi.stop();
```

Output of `npx tsx devices.ts`

```json
[
  { device: 'Sabi Android 3.2', current: false },
  { device: 'Firefox 131 on Windows', current: true }
]
```

The owner (`sub`) and the current session (`sid`) come from the verified token, so a user can only ever see their own sessions. Session ids are left out because they are half of what makes a session: they are not enough to forge a token, but they have no use in a browser, and every value you do not send is one less thing to leak. To offer "sign out that device", give each session a separate public id, and check `user_id` in the `DELETE`.

TRY IT YOURSELF

### Review a reset endpoint

A teammate's version of the reset: `GET /reset?email=ada@example.com&token=…` sets the password to a value from the query string, compares `token` with the stored token using `===`, and keeps the token valid for 7 days so "users are not annoyed". List the problems.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Look at each part of the URL in turn: the method, and everything that travels as a query parameter. What ends up in browser history, server logs and proxy logs that a body would not?

HINT 2

Compare "the token alone decides whose password changes" against what this endpoint actually trusts the client to say. And re-read the two incidents earlier in the lesson: one of them is this exact expiry, with a different number.

HINT 3

A reset that changes a password should also do one more thing everywhere else in this lesson a compromise-recovery flow does — check what a successful reset does to the user's other sessions.

SOLUTION

- **GET changes state**, and the new password and the token travel in the URL: into browser history, server logs, proxy logs and `Referer` headers. Use POST with a JSON body, and the token in the link's fragment.
- **The token is stored in clear**, so a database leak is a set of working reset links. Store `hashTokenForStorage(token)` and compare hashes in the query.
- **`===` on a secret** can leak through timing how many characters matched. Looking up by hash avoids comparing secrets in code at all; where you must compare, use `timingSafeEqualString` from `@zudojs/crypto`.
- **Seven days and no single use**: exactly incident 2. Thirty minutes, used once.
- **The e-mail parameter** means the endpoint trusts the client about *whose* password to change. The token alone must decide.
- **No session revocation**: whoever knew the old password keeps their sessions.

## Summary

- Start from the threats. Each one becomes a rule, and each rule a test.
- Session-bound JWTs give you short-lived stateless checks *and* instant logout. Back the session and revocation stores with a database, and implement the atomic `revokeIfNotRevoked`.
- Refresh tokens work once; a replay ends every session of that user.
- Reset tokens are random, hashed at rest, single-use, short-lived, delivered in a URL fragment, and a reset ends every session.
- Roles may ride in the token when a role change ends the user's sessions. Only admins assign roles, never their own.
- OAuth identities are keyed by provider and provider id. Link or create only on a verified e-mail, and evict the password of an unverified account the provider's user proves they own.

Next, [a payment system](https://zudojs.oyinlola.site/learn/usecase-payments): money moves, providers time out, requests arrive twice, and every step must be safe to retry.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
