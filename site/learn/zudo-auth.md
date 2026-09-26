---
title: "Authentication — ZudoJS Academy"
description: "Let users log in to the Task API: hash passwords, issue JWTs, keep sessions with real logout, protect routes, and stop guessing with lockouts and limits."
source: https://zudojs.oyinlola.site/learn/zudo-auth
---

LEVEL 13 · LESSON 7 OF 12

Security and identity Core

# Authentication

Let users log in to the Task API: hash passwords, issue JWTs, keep sessions with real logout, protect routes, and stop guessing with lockouts and limits.

- **55 min** to read and try
- **You need:** The Task API project, and the lessons on routes and middleware
- **You build:** A Task API where users log in, get a token, and see only their own tasks

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Hash and verify passwords with hashPassword and verifyPassword, and upgrade a hash with needsRehash
- Issue and verify JWT access tokens tied to a server-side session
- End one session with logout and every session of a user with logoutAll
- Rotate refresh tokens and revoke every session on a detected replay
- Protect routes with a bearer-token middleware that never trusts the request body for ownership
- Stop password guessing with per-account lockouts and a per-IP rate limit

## Who is calling?

Right now anyone can call the Task API and see every task. A real API must answer two questions for every request:

- **Authentication**: *who* is this? The caller proves it, for example with an email and a password.
- **Authorization**: *may* this person do this? Ada is logged in, but may she delete Linus's task?

This lesson is about the first question. The second one is the next lessons, [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) and [Security](https://zudojs.oyinlola.site/learn/zudo-security). A few more words you will meet:

- **Credentials** are what the caller uses to prove who they are: here an *identifier* (the email) and a password.
- A **token** is a string the server hands out after a successful login. The client sends it with every later request instead of the password.
- A **session** is a record *on the server* that says "this login is still alive". Deleting it is what logging out means.

|  | Token only | Session only | This lesson: token + session |
| --- | --- | --- | --- |
| Server must look something up per request | No | Yes | Yes (the session) |
| Logout works at once | No, the token lives until it expires | Yes | Yes |
| Client can read who it is | Yes | No | Yes |

You built a hand-made version of this in [the BookStore project](https://zudojs.oyinlola.site/learn/bookstore-auth). Now you use two ZudoJS packages that do the dangerous parts for you: `@zudojs/auth` (logins, tokens, sessions, lockouts) and `@zudojs/crypto` (the hashing and random numbers underneath).

## Install the packages

In your `task-api` folder:

Terminal on your computer

```bash
$ npm install @zudojs/auth @zudojs/crypto

added 2 packages, and audited 11 packages in 10s

found 0 vulnerabilities
```

Your numbers will be different, because they depend on what you have installed so far. Both packages need Node.js, so the examples on this page run on your computer, not in the browser terminal. Save each file in `src/` and run it with `npx tsx src/<file>.ts`. You should see the output shown under it. Where the output changes on every run (times, random ids), yours will differ in those parts only.

## Never store a password

If you store passwords as plain text and your database leaks, every user's password leaks too. People reuse passwords, so the attacker can now log in to their e-mail and bank as well.

Instead you store a **hash**: the result of a one-way function. You cannot turn the hash back into the password. At login you hash what the user typed and compare. `@zudojs/auth` uses **scrypt**, a hash that is slow and needs a lot of memory on purpose, so an attacker who steals the hashes can only try a few guesses per second instead of billions.

passwords.tsNode.js only

```ts
import { hashPassword, needsRehash, verifyPassword } from "@zudojs/auth";

const stored = await hashPassword("correct horse battery staple");
console.log(stored.slice(0, 20) + "…", stored.length, "characters");

console.log(await verifyPassword("correct horse battery staple", stored));
console.log(await verifyPassword("Correct horse battery staple", stored));

const again = await hashPassword("correct horse battery staple");
console.log(again === stored);
console.log(needsRehash(stored));
```

Output of `npx tsx passwords.ts`

```ts
v1$scrypt$16384$8$5$… 150 characters
true
false
false
false
```

- The stored string describes itself: format `v1`, algorithm `scrypt`, and its cost settings (16384, 8, 5). After them come the **salt** and the hash.
- One capital letter is a different password, so `verifyPassword` says `false`. It never throws: bad input is simply "no match".
- Hashing the same password twice gives two different strings. The salt is a new random value each time, so two users with the same password get different hashes, and precomputed tables of hashes are useless.

In the database, the users table from [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database) gets a `password_hash TEXT NOT NULL` column. There is never a `password` column.

### Upgrading old hashes

Computers get faster, so the recommended cost settings go up over time. `needsRehash` tells you a stored hash uses old settings. You can only make a new hash while you have the plain password, which is at a successful login. Here a hash made with an older setting (`p = 1`) is upgraded:

rehash.tsNode.js only

```ts
import { hashPassword as cryptoHashPassword } from "@zudojs/crypto";
import { hashPassword, needsRehash, verifyPassword } from "@zudojs/auth";

const old = await cryptoHashPassword("correct horse battery staple", { parallelization: 1 });
let stored = old.encoded;
console.log(stored.slice(0, 19), needsRehash(stored));

const typed = "correct horse battery staple";
if (await verifyPassword(typed, stored)) {
  if (needsRehash(stored)) {
    stored = await hashPassword(typed);
  }
  console.log("logged in, stored hash is now", stored.slice(0, 19), needsRehash(stored));
}
```

Output of `npx tsx rehash.ts`

```ts
v1$scrypt$16384$8$1 true
logged in, stored hash is now v1$scrypt$16384$8$5 false
```

This also shows how the two packages fit together. `@zudojs/crypto` does the actual hashing and returns an object with details (`old.encoded` is the string). `@zudojs/auth` wraps it with the settings a login system needs and gives you back just the string to store.

## Secrets come from the environment

Tokens are signed with a **secret key**. Anyone who knows it can create a token that says "I am Ada". So the secret never appears in your code or in git. It comes from an **environment variable**, which you met in [the configuration lesson](https://zudojs.oyinlola.site/learn/zudo-config). This helper refuses to start without one:

secrets.tsNode.js only

```ts
export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to at least 32 characters`);
  }
  return value;
}
```

`!value` catches both a missing variable (`undefined`) and an empty one (`""`). Here is what happens when the variable is not set, first with the helper, then when you skip it and pass an empty string to the package:

missing-secret.tsNode.js only

```ts
import { createTokenPair, toUserId } from "@zudojs/auth";
import { requireSecret } from "./secrets.js";

console.log("JWT_ACCESS_SECRET is", process.env.JWT_ACCESS_SECRET);

try {
  requireSecret("JWT_ACCESS_SECRET");
} catch (error) {
  console.log("our check:", (error as Error).message);
}

try {
  createTokenPair(toUserId("u-ada"), {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? "",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
  });
} catch (error) {
  console.log("the package:", (error as Error).name, "-", (error as Error).message);
}
```

Output of `npx tsx missing-secret.ts`

```ts
JWT_ACCESS_SECRET is undefined
our check: JWT_ACCESS_SECRET must be set to at least 32 characters
the package: AuthConfigurationError - TokenConfig.accessSecret is required and must be a non-empty string.
```

The package protects you too: it refuses empty secrets, secrets shorter than 32 bytes, and the same secret used twice. Both messages say what is wrong without showing any secret. Stopping at startup is the right behaviour. A server that starts with a weak or empty key would hand out tokens anyone can forge.

On your computer, create two random secrets once and keep them in a `.env` file that git ignores. The first run below is before the file exists:

Terminal on your computer

```bash
$ npx tsx src/check-secrets.ts
~/task-api/src/secrets.ts:4
    throw new Error(`${name} must be set to at least 32 characters`);
          ^

Error: JWT_ACCESS_SECRET must be set to at least 32 characters
    at requireSecret (~/task-api/src/secrets.ts:4:11)
    at <anonymous> (~/task-api/src/token-config.ts:5:17)
…
$ node -e "console.log('JWT_ACCESS_SECRET=' + require('node:crypto').randomBytes(32).toString('base64url'))" >> .env
$ node -e "console.log('JWT_REFRESH_SECRET=' + require('node:crypto').randomBytes(32).toString('base64url'))" >> .env
$ echo ".env" >> .gitignore
$ npx tsx --env-file=.env src/check-secrets.ts
access secret: 43 characters
refresh secret: 43 characters
```

`check-secrets.ts` just imports `token-config.ts` (shown in the next section) and prints the two lengths. `--env-file=.env` tells Node.js to load the file into `process.env` before your code runs. In production, your hosting platform sets the same variables for you.

The examples on this page cannot read your `.env`. So that they still run anywhere, they import one extra file first:

demo-env.tsNode.js only

```ts
/*
 * DEMO ONLY. Makes the examples on this page run without any setup:
 * when a secret is missing, it invents a random one for this run.
 * Never copy this into your app. Real secrets come from the environment.
 */
import { randomBytes } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
```

> DEMO ONLY
>
> A random secret per run means every restart logs everyone out, and two servers would not trust each other's tokens. It is fine for a demo and wrong for an app. In your project, delete the `import "./demo-env.js"` lines and use `--env-file=.env`.

## JSON Web Tokens

A **JWT** (JSON Web Token, say "jot") is three pieces of base64url text joined by dots: a *header*, a *payload* of facts called **claims**, and a *signature*. The signature is an HMAC (a keyed hash) of the first two parts, made with your secret. Change one character of the payload and the signature no longer fits.

First, one place that holds the token settings:

token-config.tsNode.js only

```ts
import type { TokenConfig } from "@zudojs/auth";
import { requireSecret } from "./secrets.js";

export const tokenConfig: TokenConfig = {
  accessSecret: requireSecret("JWT_ACCESS_SECRET"),
  refreshSecret: requireSecret("JWT_REFRESH_SECRET"),
  accessTtl: 15 * 60,
  refreshTtl: 7 * 24 * 60 * 60,
  issuer: "task-api",
  audience: "task-api",
};
```

There are two kinds of token. The **access token** goes with every request and lives 15 minutes (`accessTtl`, in seconds; TTL means "time to live"). The **refresh token** lives 7 days and is only used to get a new access token. If an access token is stolen, it is useless a few minutes later. Each kind has its own secret. Now create a pair and look inside:

jwt-basics.tsNode.js only

```ts
import "./demo-env.js";
import { createTokenPair, toUserId, verifyAccessToken } from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";

const tokens = createTokenPair(toUserId("u-ada"), tokenConfig, { roles: ["user"] });
console.log(tokens.tokenType, tokens.expiresIn);

const [header, payload, signature] = tokens.accessToken.split(".");
console.log(Buffer.from(header!, "base64url").toString());
console.log(Buffer.from(payload!, "base64url").toString());
console.log(signature!.length, "characters of signature");

const result = verifyAccessToken(tokens.accessToken, tokenConfig);
console.log(result.valid, result.payload?.sub, result.payload?.roles);
```

Output of `npx tsx jwt-basics.ts`

```ts
Bearer 900
{"alg":"HS256","typ":"JWT"}
{"sub":"u-ada","iat":1790170484,"exp":1790171384,"typ":"access","jti":"0fb463e93108caf72ced7033f4e830bf","roles":["user"],"iss":"task-api","aud":"task-api"}
43 characters of signature
true u-ada [ 'user' ]
```

- `import "./demo-env.js"` comes first on purpose. Imports run in order, so the secrets exist before `token-config.ts` reads them.
- `toUserId` turns a plain string into the `UserId` type the package expects. Call it once, where an id enters your program.
- The claims: `sub` (subject: who), `iat` and `exp` (issued at, expires, in seconds since 1970), `jti` (a random id for this token), `iss` and `aud` (who made it, who it is for).
- You just decoded the payload with one line of `Buffer`. **A JWT is signed, not encrypted.** Anyone who holds it can read it. Never put a secret, a password or private data in a token.

### Forged tokens are rejected

An attacker can read and change the payload. What they cannot do is make a matching signature. Here is a set of classic tricks. Each one tries to turn Ada into an admin:

jwt-forged.tsNode.js only

```ts
import "./demo-env.js";
import { createHmac } from "node:crypto";
import { createTokenPair, toUserId, verifyAccessToken } from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";

const real = createTokenPair(toUserId("u-ada"), tokenConfig, { roles: ["user"] });
const [header, payload, signature] = real.accessToken.split(".") as [string, string, string];

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
const admin = encode({ ...claims, roles: ["admin"] });
const sign = (algorithm: string, key: string, data: string) =>
  createHmac(algorithm, key).update(data).digest("base64url");

const attempts: Record<string, string> = {
  "roles changed, old signature": `${header}.${admin}.${signature}`,
  'alg "none", no signature': `${encode({ alg: "none", typ: "JWT" })}.${admin}.`,
  'alg "none", fake signature': `${encode({ alg: "none", typ: "JWT" })}.${admin}.${signature}`,
  'alg "HS512", real secret': `${encode({ alg: "HS512", typ: "JWT" })}.${admin}.` +
    sign("sha512", tokenConfig.accessSecret, `${encode({ alg: "HS512", typ: "JWT" })}.${admin}`),
  "HS256, guessed secret": `${header}.${admin}.` + sign("sha256", "secret", `${header}.${admin}`),
  "refresh token used as access": real.refreshToken,
};

for (const [name, token] of Object.entries(attempts)) {
  const result = verifyAccessToken(token, tokenConfig);
  console.log(`${name}: valid=${result.valid} (${result.error})`);
}
```

Output of `npx tsx jwt-forged.ts`

```ts
roles changed, old signature: valid=false (Invalid signature)
alg "none", no signature: valid=false (Invalid token format)
alg "none", fake signature: valid=false (Unsupported algorithm)
alg "HS512", real secret: valid=false (Unsupported algorithm)
HS256, guessed secret: valid=false (Invalid signature)
refresh token used as access: valid=false (Invalid signature)
```

The header says which algorithm signed the token, and the header is written by whoever made the token, including an attacker. Some old JWT libraries believed it: a token with `"alg": "none"` needed no signature at all, and real systems were broken that way. `@zudojs/auth` **pins the algorithm**: it only accepts HS256, whatever the header claims. Even a correct HS512 signature made with the real secret is refused. The refresh token fails too, because it was signed with the other secret.

Two more checks, expiry and audience. The first token lives one second:

jwt-expiry.tsNode.js only

```ts
import "./demo-env.js";
import { createTokenPair, toUserId, verifyAccessToken } from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";

const shortLived = { ...tokenConfig, accessTtl: 1 };
const tokens = createTokenPair(toUserId("u-ada"), shortLived);
console.log("now:", verifyAccessToken(tokens.accessToken, shortLived).valid);

await new Promise((resolve) => setTimeout(resolve, 2100));
console.log("2 seconds later:", verifyAccessToken(tokens.accessToken, shortLived));

const otherApp = { ...tokenConfig, audience: "billing-api" };
const forTasks = createTokenPair(toUserId("u-ada"), tokenConfig).accessToken;
console.log("other audience:", verifyAccessToken(forTasks, otherApp));
```

Output of `npx tsx jwt-expiry.ts`

```ts
now: true
2 seconds later: { valid: false, error: 'Token expired' }
other audience: { valid: false, error: 'Invalid audience' }
```

The audience check matters when several of your services share a secret: a token made for the Task API is not accepted by a billing service that expects its own audience. Notice that `verifyAccessToken` never throws for a bad token. It returns `{ valid: false, error }`, so you must check `valid`.

## Logging in with the auth service

You could build login from these pieces yourself. Don't. `createAuthService` puts them together correctly: password check, session, tokens bound to the session, lockouts. It does not own your database. You give it three small functions: find a user by email, find a user by id, check a password. Here they work on a `Map` that stands in for the users table:

users.tsNode.js only

```ts
import { hashPassword, normalizeLoginIdentifier, toUserId, verifyPassword } from "@zudojs/auth";
import type { AuthUser, UserId } from "@zudojs/auth";

interface UserRow {
  readonly user: AuthUser;
  readonly passwordHash: string;
}

const byEmail = new Map<string, UserRow>();

export async function registerUser(id: string, email: string, password: string): Promise<AuthUser> {
  const user: AuthUser = {
    id: toUserId(id),
    email: normalizeLoginIdentifier(email),
    roles: ["user"],
    active: true,
    createdAt: new Date(),
  };
  byEmail.set(user.email, { user, passwordHash: await hashPassword(password) });
  return user;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return byEmail.get(normalizeLoginIdentifier(email))?.user ?? null;
}

export async function findUserById(id: UserId): Promise<AuthUser | null> {
  for (const row of byEmail.values()) {
    if (row.user.id === id) return row.user;
  }
  return null;
}

export async function checkPassword(id: UserId, password: string): Promise<boolean> {
  for (const row of byEmail.values()) {
    if (row.user.id === id) return verifyPassword(password, row.passwordHash);
  }
  return false;
}
```

Two decisions in this file are about security:

- A new user always gets `roles: ["user"]`. The role is decided by the server, never taken from what the client sends. Otherwise anyone could register with `"roles": ["admin"]`.
- Emails go through `normalizeLoginIdentifier` before they are stored and before they are looked up. It trims them and lower-cases an email address, so `" Ada@Example.com"` finds the same account. `auth.login` uses the same function on what the user typed, so both sides agree.

Now the service. Every option is explained below it:

auth.tsNode.js only

```ts
import {
  createAuthService,
  createMemoryLoginAttemptStore,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
} from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";
import { checkPassword, findUserByEmail, findUserById } from "./users.js";

export const auth = createAuthService({
  token: tokenConfig,
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 30 * 60,
  absoluteSessionTtlSeconds: 7 * 24 * 60 * 60,
  findUser: findUserByEmail,
  findUserById,
  verifyPassword: checkPassword,
  revocationStore: createMemoryTokenRevocationStore(),
  loginThrottle: {
    store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
    maxFailedAttempts: 5,
    lockoutSeconds: 15 * 60,
    maxAttemptsPerWindow: 20,
  },
});
```

- `sessionStore` keeps the sessions. `sessionTtlSeconds` ends a session after 30 idle minutes. `absoluteSessionTtlSeconds` ends it after 7 days however busy it is.
- `findUser`, `findUserById` and `verifyPassword` are your three functions.
- `revocationStore` remembers used refresh tokens, and `loginThrottle` stops password guessing. Both come later in this lesson.
- The `Memory` stores live inside one process and are lost on restart. That is fine for learning. With more than one server, you implement the same small interfaces on top of your database or Redis.

Log in once correctly and twice wrongly:

login.tsNode.js only

```ts
import "./demo-env.js";
import { AuthError } from "@zudojs/auth";
import { auth } from "./auth.js";
import { registerUser } from "./users.js";

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");

const { user, tokens, sessionId } = await auth.login({
  identifier: " Ada@Example.com",
  password: "correct horse battery staple",
});
console.log(user.email, user.roles, tokens.tokenType, tokens.expiresIn);

const payload = await auth.verifyToken(tokens.accessToken);
console.log(payload.sub, payload.roles, payload.sid === sessionId);

const wrong = [
  { email: "ada@example.com", password: "wrong password" },
  { email: "nobody@example.com", password: "whatever" },
];
for (const attempt of wrong) {
  try {
    await auth.login({ identifier: attempt.email, password: attempt.password });
  } catch (error) {
    if (error instanceof AuthError) console.log(attempt.email, "->", error.statusCode, error.message);
  }
}
```

Output of `npx tsx login.ts`

```ts
ada@example.com [ 'user' ] Bearer 900
u-ada [ 'user' ] true
ada@example.com -> 401 Invalid credentials
nobody@example.com -> 401 Invalid credentials
```

- `auth.verifyToken` is the service's check. Unlike `verifyAccessToken`, it throws on a bad token, and it also checks that the session is still alive. The token carries the session id in its `sid` claim.
- A wrong password and an unknown email give **the same answer**. If they differed ("no such user" vs "wrong password"), an attacker could find out which emails have accounts. The service even does the same slow hashing work for an unknown user, so the response time does not give it away either.

## Logout, expiry and refresh

Because every token is tied to a session, deleting the session kills its tokens at once. `logout` ends one session (one device). `logoutAll` ends every session of a user, the "sign out everywhere" button you want after a password change:

logout.tsNode.js only

```ts
import "./demo-env.js";
import { AuthError } from "@zudojs/auth";
import { auth } from "./auth.js";
import { registerUser } from "./users.js";

const ada = await registerUser("u-ada", "ada@example.com", "correct horse battery staple");
const credentials = { identifier: "ada@example.com", password: "correct horse battery staple" };

async function check(label: string, token: string): Promise<void> {
  try {
    const payload = await auth.verifyToken(token);
    console.log(label, "-> valid for", payload.sub);
  } catch (error) {
    if (error instanceof AuthError) console.log(label, "->", error.name, error.message);
  }
}

const laptop = await auth.login(credentials);
const phone = await auth.login(credentials);
const tablet = await auth.login(credentials);

await auth.logout(laptop.sessionId, laptop.tokens.refreshToken);
await check("laptop after logout", laptop.tokens.accessToken);
await check("phone", phone.tokens.accessToken);

await auth.logoutAll(ada.id);
await check("phone after logoutAll", phone.tokens.accessToken);
await check("tablet after logoutAll", tablet.tokens.accessToken);
```

Output of `npx tsx logout.ts`

```ts
laptop after logout -> SessionExpiredError Session is no longer active
phone -> valid for u-ada
phone after logoutAll -> SessionExpiredError Session is no longer active
tablet after logoutAll -> SessionExpiredError Session is no longer active
```

The laptop's access token still had 15 minutes to live, but it stopped working the moment its session was gone. A plain JWT without a session cannot do that.

### Session expiry

A session has two clocks. The idle timeout moves forward every time the session is used. The absolute limit never moves. Here the idle timeout is one second, so the session dies while the program waits:

idle.tsNode.js only

```ts
import "./demo-env.js";
import { AuthError, createAuthService, createMemorySessionStore } from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";
import { checkPassword, findUserByEmail, findUserById, registerUser } from "./users.js";

const sessions = createMemorySessionStore();
const auth = createAuthService({
  token: tokenConfig,
  sessionStore: sessions,
  sessionTtlSeconds: 1,
  absoluteSessionTtlSeconds: 60,
  findUser: findUserByEmail,
  findUserById,
  verifyPassword: checkPassword,
});

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");
const { tokens, sessionId } = await auth.login({ identifier: "ada@example.com", password: "correct horse battery staple" });

const session = await sessions.get(sessionId);
console.log("idle timeout:", (session!.expiresAt.getTime() - session!.createdAt.getTime()) / 1000, "s");
console.log("hard limit:", (session!.absoluteExpiresAt!.getTime() - session!.createdAt.getTime()) / 1000, "s");

await new Promise((resolve) => setTimeout(resolve, 1500));
try {
  await auth.verifyToken(tokens.accessToken);
} catch (error) {
  if (error instanceof AuthError) console.log("after 1.5 s idle ->", error.name, error.message);
}
```

Output of `npx tsx idle.ts`

```ts
idle timeout: 1 s
hard limit: 60 s
after 1.5 s idle -> SessionExpiredError Session is no longer active
```

Always set the absolute limit. With only an idle timeout, a session that is used once every half hour lives forever, and so does a stolen session.

### Refresh tokens are single-use

When the access token expires, the client sends the refresh token to `auth.refresh` and gets a new pair. With a `revocationStore`, each refresh token works **once**. If an old one comes back, someone must have copied it, so the service ends every session of that user:

refresh.tsNode.js only

```ts
import "./demo-env.js";
import { AuthError } from "@zudojs/auth";
import { auth } from "./auth.js";
import { registerUser } from "./users.js";

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");
const { tokens } = await auth.login({ identifier: "ada@example.com", password: "correct horse battery staple" });

const next = await auth.refresh(tokens.refreshToken);
console.log("new pair:", next.refreshToken !== tokens.refreshToken);

try {
  await auth.refresh(tokens.refreshToken);
} catch (error) {
  if (error instanceof AuthError) console.log("replay ->", error.statusCode, error.message);
}

try {
  await auth.verifyToken(next.accessToken);
} catch (error) {
  if (error instanceof AuthError) console.log("new token ->", error.statusCode, error.message);
}
```

Output of `npx tsx refresh.ts`

```ts
new pair: true
replay -> 401 Refresh token has already been used
new token -> 401 Session is no longer active
```

The replay is refused with a `TokenRevokedError`: status 401 and code `ERR_TOKEN_REVOKED`, because the client has to log in again. Even the new, honest token died. That is on purpose: the server cannot tell whether the thief or the user made the first refresh, so it logs everyone out and the real user simply logs in again.

REASON IT OUT

### A stolen refresh token gets used once, by the thief, before the real user ever tries. What should happen next?

Trace it: a thief copies Ada's refresh token from a badly stored cookie. The thief calls `auth.refresh` first and gets a fresh pair. An hour later Ada's own client, still holding the old refresh token, tries to refresh too. The service sees a token that has already been used. It cannot ask the token who used it. What are its choices, and why end every session instead of just rejecting the second call?

**Show the reasoning**

Rejecting only the second call and moving on would leave the thief's fresh session alive and Ada logged out — the attacker keeps access, the victim loses it, and nobody sees an alert. The service has exactly one reliable signal here: *this refresh token was already redeemed once*, which can only happen if two parties have had it. It cannot tell which of the two calls was legitimate, so treating the situation as a compromise and revoking every session tied to that user is the only response that cannot leave the attacker holding a valid session.

The cost is real: Ada is logged out everywhere and has to log in again, even though her own client did nothing wrong. That is the trade a single-use, rotating refresh token makes on purpose — a false alarm costs one login; a token that could be silently reused by an attacker costs the account. It is also why the standalone `refreshAccessToken` below is dangerous for real users: without a revocation store, there is no way to detect the reuse in the first place.

> COMMON MISTAKE
>
> The package also exports a standalone `refreshAccessToken`. It only checks the signature and expiry: no rotation, no session, no revocation. A stolen refresh token then works for 7 days. For users, always use `auth.refresh`.

## Protect routes in @zudojs/http

Now connect this to HTTP. Clients send the access token in the `Authorization` header: `Authorization: Bearer <token>`. A **middleware**, which you met in [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware), checks it before the route handler runs:

require-user.tsNode.js only

```ts
import { AuthError, parseBearerToken } from "@zudojs/auth";
import type { TokenPayload } from "@zudojs/auth";
import type { HttpMiddleware, HttpRouterContext } from "@zudojs/http";
import { auth } from "./auth.js";

export const requireUser: HttpMiddleware = async (context, next) => {
  const token = parseBearerToken(context.request.getHeader("authorization"));
  if (token === null) {
    return context.response.setStatus(401).json({ error: "Login required" });
  }
  try {
    context.state.set("user", await auth.verifyToken(token));
  } catch (error) {
    if (error instanceof AuthError) {
      return context.response.setStatus(401).json({ error: "Login required" });
    }
    throw error;
  }
  return next();
};

export function currentUser(ctx: HttpRouterContext): TokenPayload {
  const user = ctx.state.get("user") as TokenPayload | undefined;
  if (user === undefined) throw new Error("requireUser did not run for this route");
  return user;
}
```

- `parseBearerToken` reads the header safely. It returns `null` for a missing or malformed header, never throws.
- If the token is fine, the verified payload goes into `context.state`, the per-request storage that the middleware and the handler share. This is the request's **auth context**: from here on, "who is calling" is a fact the server checked, not something the client claims.
- Every failure gets the same short answer, `401 Login required`. The client learns nothing about why.
- `currentUser` reads the payload back in a handler. If you forget to add `requireUser` to a route, it fails loudly instead of treating the caller as nobody in particular.

The server has a login route, a logout route, and task routes where every user sees only their own tasks:

server.tsNode.js only

```ts
import { badRequest, createNodeHttpAdapter, createRateLimitMiddleware, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import { auth } from "./auth.js";
import { currentUser, requireUser } from "./require-user.js";

const LoginBody = schema.object({
  email: schema.string().trim().min(3).max(254),
  password: schema.string().min(1).max(1024),
});
const NewTaskBody = schema.object({ title: schema.string().trim().min(1).max(200) });

interface Task { id: number; ownerId: string; title: string; }
const tasks: Task[] = [];

function readJson(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("Body must be JSON");
  }
}

const router = createRouter();
const loginLimit = createRateLimitMiddleware({ max: 10, windowMs: 60_000 });

router.post("/auth/login", async (ctx) => {
  const body = LoginBody.parse(readJson(ctx));
  const { tokens } = await auth.login({ identifier: body.email, password: body.password });
  return createResponseContext().json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
}, { middleware: [loginLimit] });

router.post("/auth/logout", async (ctx) => {
  const user = currentUser(ctx);
  if (user.sid !== undefined) await auth.logout(user.sid);
  return createResponseContext().setStatus(204);
}, { middleware: [requireUser] });

router.get("/tasks", (ctx) => {
  const user = currentUser(ctx);
  return createResponseContext().json(tasks.filter((task) => task.ownerId === user.sub));
}, { middleware: [requireUser] });

router.post("/tasks", (ctx) => {
  const user = currentUser(ctx);
  const body = NewTaskBody.parse(readJson(ctx));
  const task: Task = { id: tasks.length + 1, ownerId: user.sub, title: body.title };
  tasks.push(task);
  return createResponseContext().setStatus(201).json(task);
}, { middleware: [requireUser] });

export async function startServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  return { url: `http://127.0.0.1:${adapter.address?.port}`, stop: () => adapter.stop() };
}
```

What to notice:

- The login body is checked with a schema from [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation), including a maximum length. A 10 MB "password" is rejected before any hashing.
- Errors thrown by `auth.login` already carry a status code, so the HTTP layer turns them into the right answer by itself: `InvalidCredentialsError` becomes 401, and a lockout becomes 423 with a `Retry-After` header. The login route needs no `try`/`catch`.
- Logout uses `user.sid` from the **verified token**. Never take a session id from the request body: a caller could then end someone else's session.
- `POST /tasks` sets `ownerId` from the token. Anything the client puts in the body about *who* they are is ignored, because the schema only keeps `title`.
- `port: 0` lets the operating system pick a free port, so the test below never clashes with a running server.

This program starts the server, sends it requests like a client would, prints the answers and stops it:

try-server.tsNode.js only

```ts
import "./demo-env.js";
import { startServer } from "./server.js";
import { registerUser } from "./users.js";

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");
await registerUser("u-linus", "linus@example.com", "another long passphrase");
const server = await startServer();

async function call(method: string, path: string, body?: object, token?: string): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(server.url + path, { method, headers, body: body && JSON.stringify(body) });
  console.log(method, path, res.status, res.status === 204 ? "" : await res.text());
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(server.url + "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

await call("GET", "/tasks");
await call("POST", "/auth/login", { email: "ada@example.com", password: "wrong" });
const ada = await login("ada@example.com", "correct horse battery staple");
const linus = await login("linus@example.com", "another long passphrase");
await call("POST", "/tasks", { title: "Buy milk", ownerId: "u-linus" }, ada);
await call("GET", "/tasks", undefined, ada);
await call("GET", "/tasks", undefined, linus);
await call("POST", "/auth/logout", undefined, ada);
await call("GET", "/tasks", undefined, ada);
await server.stop();
```

Output of `npx tsx try-server.ts`

```ts
GET /tasks 401 {"error":"Login required"}
POST /auth/login 401 {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
POST /tasks 201 {"id":1,"ownerId":"u-ada","title":"Buy milk"}
GET /tasks 200 [{"id":1,"ownerId":"u-ada","title":"Buy milk"}]
GET /tasks 200 []
POST /auth/logout 204
GET /tasks 401 {"error":"Login required"}
```

Read it line by line: no token, 401. Wrong password, 401 with the generic message. Ada creates a task and tries to make Linus its owner; the server ignores that and makes her the owner. Linus sees an empty list. After logout, Ada's token no longer works, 15 minutes before it would have expired.

To run it on your computer, save all the files in `src/`, remove the two `import "./demo-env.js"` lines and run `npx tsx --env-file=.env src/try-server.ts`. You should see the same seven lines.

## Tokens in a browser: cookies

A mobile app or another server can keep the token and send it in the `Authorization` header. In a web page it is safer to let the browser keep it in a **cookie**, because JavaScript in the page, including injected malicious script, can read anything in `localStorage`. `@zudojs/http` writes cookies with safe settings unless you change them:

cookies.tsNode.js only

```ts
import { parseCookies } from "@zudojs/auth";
import { serializeCookie } from "@zudojs/http";

console.log(serializeCookie("access_token", "eyJhbGciOi...", { maxAge: 15 * 60 }));
console.log(serializeCookie("access_token", "", { maxAge: 0 }));

const jar = parseCookies("access_token=eyJhbGciOi...; theme=dark");
console.log(jar.access_token, jar.theme, jar.constructor);
```

Output of `npx tsx cookies.ts`

```ts
access_token=eyJhbGciOi...; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax
access_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax
eyJhbGciOi... dark undefined
```

- `HttpOnly`: page JavaScript cannot read the cookie.
- `Secure`: the browser only sends it over HTTPS (and to `localhost` while you develop).
- `SameSite=Lax`: other sites cannot make the browser send it with their form posts.
- `Max-Age=0` is how you delete a cookie at logout. In a handler, use `createResponseContext().cookie(name, value, options)`, which uses the same defaults.
- `parseCookies` returns an object with no prototype, so a cookie named `constructor` or `__proto__` cannot confuse your code.

Cookies are sent by the browser automatically, and that brings one more attack, cross-site request forgery (CSRF). The protection lives in [the Security lesson](https://zudojs.oyinlola.site/learn/zudo-security).

## Stop password guessing

An attacker who knows Ada's email can try thousands of common passwords. Two defences work together.

**Lockout per account.** The `loginThrottle` option in `auth.ts` locks an identifier after 5 wrong passwords in a row, for 15 minutes:

lockout.tsNode.js only

```ts
import "./demo-env.js";
import { AuthError } from "@zudojs/auth";
import { auth } from "./auth.js";
import { registerUser } from "./users.js";

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");

const guesses = ["123456", "password", "qwerty", "letmein", "ada1815", "hunter2"];
for (const [index, guess] of guesses.entries()) {
  try {
    await auth.login({ identifier: "ada@example.com", password: guess });
  } catch (error) {
    if (error instanceof AuthError) {
      console.log(`guess ${index + 1}:`, error.statusCode, error.message, error.metadata);
    }
  }
}

try {
  await auth.login({ identifier: "ADA@example.com", password: "correct horse battery staple" });
} catch (error) {
  if (error instanceof AuthError) console.log("right password:", error.statusCode, error.message);
}
```

Output of `npx tsx lockout.ts`

```ts
guess 1: 401 Invalid credentials {}
guess 2: 401 Invalid credentials {}
guess 3: 401 Invalid credentials {}
guess 4: 401 Invalid credentials {}
guess 5: 401 Invalid credentials {}
guess 6: 423 Account is locked due to too many failed attempts { retryAfterSeconds: 900 }
right password: 423 Account is locked due to too many failed attempts
```

The sixth guess is refused without even checking the password, with status 423 (Locked) and a wait time of 900 seconds. Even the right password is refused during the lockout, otherwise the attacker would simply keep guessing. The counter is kept per identifier after trimming and lower-casing, so `ADA@example.com` does not get a fresh budget. An unknown email is counted exactly like a real one, which again reveals nothing.

**Rate limit per client.** A lockout does not stop an attacker who tries one password against thousands of different emails. That is why `/auth/login` in `server.ts` also has `createRateLimitMiddleware({ max: 10, windowMs: 60_000 })`: at most 10 login requests per minute from one IP address. Try both over HTTP:

try-limits.tsNode.js only

```ts
import "./demo-env.js";
import { startServer } from "./server.js";
import { registerUser } from "./users.js";

await registerUser("u-ada", "ada@example.com", "correct horse battery staple");
const server = await startServer();

for (let attempt = 1; attempt <= 11; attempt++) {
  const res = await fetch(server.url + "/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "ada@example.com", password: `guess-${attempt}` }),
  });
  const wait = res.headers.get("retry-after");
  console.log(attempt, res.status, res.status === 423 ? `retry after ${wait} s` : "", await res.text());
}
await server.stop();
```

Output of `npx tsx try-limits.ts`

```ts
1 401  {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
2 401  {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
3 401  {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
4 401  {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
5 401  {"error":"Invalid credentials","code":"ERR_INVALID_CREDENTIALS"}
6 423 retry after 900 s {"error":"Account is locked due to too many failed attempts","code":"ERR_ACCOUNT_LOCKED"}
7 423 retry after 900 s {"error":"Account is locked due to too many failed attempts","code":"ERR_ACCOUNT_LOCKED"}
8 423 retry after 900 s {"error":"Account is locked due to too many failed attempts","code":"ERR_ACCOUNT_LOCKED"}
9 423 retry after 900 s {"error":"Account is locked due to too many failed attempts","code":"ERR_ACCOUNT_LOCKED"}
10 423 retry after 900 s {"error":"Account is locked due to too many failed attempts","code":"ERR_ACCOUNT_LOCKED"}
11 429  {"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"},"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}
```

Guesses 1 to 5 get 401. Guesses 6 to 10 hit the account lockout: 423 with the code `ERR_ACCOUNT_LOCKED`, and a `Retry-After` header that tells a well-behaved client how long to wait. The error carries the header itself, so the server sends it without any extra code. Request 11 never reaches the login code: the rate limiter answers 429 (Too Many Requests) first. Its `Retry-After` is the number of seconds left in the current minute.

> NOTE
>
> The memory stores count per process. If you run two copies of the server, each has its own counters, and an attacker gets twice the guesses. Real deployments keep these counters in a shared store such as Redis.

## Practice

TRY IT YOURSELF

### Find the privilege escalation

A teammate wrote this registration handler. What can a caller do with it, and how do you fix it?

```ts
const body = JSON.parse(text);
await saveUser({ email: body.email, passwordHash: await hashPassword(body.password), roles: body.roles ?? ["user"] });
```

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`schema.string().trim().toLowerCase().max(254)` for the email. For the password, `schema.string().min(12).max(1024)`: that minimum is what makes the second check `false` below.

HINT 2

`email: schema.string().trim().toLowerCase().max(254), password: schema.string().min(12).max(1024)`. The object has no `roles` key, so parsing silently drops one a client sends.

SOLUTION

Anyone can register with `"roles": ["admin"]` and become an admin. The body is also not validated at all. Validate it with a schema that has no `roles` field, and let the server choose the role. A schema object drops keys it does not know:

register-body.tsNode.js only

```ts
import { schema } from "@zudojs/schema";

const RegisterBody = schema.object({
  email: schema.string().trim().toLowerCase().max(254),
  password: schema.string().min(12).max(1024),
});

const body = RegisterBody.parse(JSON.parse('{"email":"Mallory@Example.com","password":"a long passphrase","roles":["admin"]}'));
console.log(body);
console.log(RegisterBody.safeParse({ email: "x@example.com", password: "short" }).success);
```

Output of `npx tsx register-body.ts`

```json
{ email: 'mallory@example.com', password: 'a long passphrase' }
false
```

The new user then gets `roles: ["user"]`, as in `registerUser`. The minimum length of 12 is your password policy: `@zudojs/auth` does not enforce one, so registration is where you add it.

TRY IT YOURSELF

### Shorter access tokens

Change the token settings so access tokens live 5 minutes and refresh tokens 1 day. Prove it by checking that `exp - iat` in a verified access token is 300.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Spread `tokenConfig` into a new object and override the two TTLs on it: `{ ...tokenConfig, accessTtl: …, refreshTtl: … }`, in seconds.

HINT 2

`const config = { ...tokenConfig, accessTtl: 5 * 60, refreshTtl: 24 * 60 * 60 };`.

SOLUTION

short-ttl.tsNode.js only

```ts
import "./demo-env.js";
import { createTokenPair, toUserId, verifyAccessToken } from "@zudojs/auth";
import { tokenConfig } from "./token-config.js";

const config = { ...tokenConfig, accessTtl: 5 * 60, refreshTtl: 24 * 60 * 60 };
const tokens = createTokenPair(toUserId("u-ada"), config);
const payload = verifyAccessToken(tokens.accessToken, config).payload!;
console.log(tokens.expiresIn, payload.exp - payload.iat);
```

Output of `npx tsx short-ttl.ts`

```ts
300 300
```

Shorter access tokens limit the damage of a stolen token. The cost is more refresh calls, which are cheap.

TRY IT YOURSELF

### Sign out everywhere after a password change

Describe the steps of a `POST /auth/password` route that lets a logged-in user change their password. Which functions from this lesson do you call, and in which order?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Where does the user id for "whose password is this" come from: the request body, or `currentUser(ctx)`? Look at how `/auth/logout` in `server.ts` answers that same question.

HINT 2

Which two functions from [password hashing](#passwords) check the old password and produce the new hash? And after saving it, which function from [logout, expiry and refresh](#sessions) makes every other device's session stop working?

SOLUTION

1. Protect the route with `requireUser` and take the user id from `currentUser(ctx).sub`, never from the body.
2. Validate the body (`currentPassword`, `newPassword` with your length rules) with a schema.
3. Check the current password with `verifyPassword`. If it is wrong, answer the same generic 401 as login.
4. Store `await hashPassword(newPassword)`.
5. Call `auth.logoutAll(userId)`, so that anyone who knew the old password and had a session is thrown out. The user logs in again with the new password.

## Recap

- Authentication proves who is calling; authorization decides what they may do.
- Store only `hashPassword` output. `verifyPassword` checks a login, `needsRehash` tells you to upgrade a hash at the next login.
- Signing secrets come from environment variables, are at least 32 bytes, and the app refuses to start without them.
- A JWT is readable by anyone. `@zudojs/auth` accepts only HS256 with your secret, and checks expiry, type, issuer and audience.
- `createAuthService` ties tokens to server-side sessions, so `logout` and `logoutAll` work at once, sessions expire, and refresh tokens are single-use.
- A middleware verifies the bearer token and stores the payload for the handler. Ownership and roles come from that payload, never from the request body.
- Login errors are generic. Lockout per account plus a rate limit per IP stop password guessing.

Next, you let users sign in with an account they already have, such as Google, in [Sign in with OAuth](https://zudojs.oyinlola.site/learn/zudo-oauth).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
