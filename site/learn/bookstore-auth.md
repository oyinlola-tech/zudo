---
title: "\"BookStore API: authentication and tests\" — ZudoJS Academy"
description: "Add users to the BookStore: scrypt password hashes, signed log-in tokens, protected order routes and node:test tests, then an honest review of what still hurts."
source: https://zudojs.oyinlola.site/learn/bookstore-auth
---

LEVEL 7 · LESSON 10 OF 15

TypeScript on the server Core

# "BookStore API: authentication and tests"

Add users to the BookStore: scrypt password hashes, signed log-in tokens, protected order routes and node:test tests, then an honest review of what still hurts.

- **50 min** to read and try
- **You need:** "BookStore API: validation and PostgreSQL", Testing fundamentals, and Cryptography with node:crypto
- **You build:** A BookStore API where users register, log in, and see only their own orders, with a node:test suite

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Refuse to start without a strong signing secret from the environment
- Store passwords as salted scrypt hashes and verify them in constant time
- Issue and check HMAC-signed, expiring log-in tokens, and explain why a token can be read but not changed
- Protect routes so the user id comes only from a verified token
- Keep a log-in route from revealing which e-mails have accounts
- Test tokens and the whole API with node:test, and list the structural problems a hand-built backend has

## Who is asking?

Right now anyone can place an order, and `GET /orders` shows everybody's orders. The BookStore needs to know **who** sends each request. That is **authentication**, and it has three parts:

1. **Register**: `POST /users` stores an e-mail and a *hash* of the password, never the password itself.
2. **Log in**: `POST /sessions` checks the password and hands back a signed **token**, a string that proves "this is user 7" until it expires.
3. **Prove it**: every request to a protected route sends the token in the `Authorization` header. The server checks the signature and knows the user.

Everything in this lesson uses `node:crypto`, which is built into Node.js, so you install nothing. You met its tools one by one in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto); here they protect a real API.

## A secret from the environment

The server signs tokens with a **secret**: a long random value that only the server knows. Anyone who has it can make tokens for any user, so it never goes into the code or into git. It comes from an environment variable, and the server refuses to start without a good one. Here is `src/config.ts` with the new setting:

src/config.tsNode.js only

```ts
export interface Config {
  readonly port: number;
  readonly dataDir: string | undefined;
  readonly tokenSecret: string;
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env): Config {
  const raw = env["PORT"] ?? "3000";
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port > 65535) {
    throw new Error(`PORT must be a whole number from 0 to 65535, got "${raw}"`);
  }
  const tokenSecret = env["TOKEN_SECRET"];
  if (tokenSecret === undefined || tokenSecret.length < 32) {
    throw new Error("TOKEN_SECRET must be set to a random value of at least 32 characters");
  }
  return { port, dataDir: env["DATA_DIR"], tokenSecret };
}
```

A missing secret and a short, guessable one are both refused. Try both, then a real random one made with `randomBytes`:

try-secret.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { loadConfig } from "./src/config.js";

try {
  loadConfig({ PORT: "3000" });
} catch (error) {
  console.log("Refused to start:", error instanceof Error ? error.message : error);
}

try {
  loadConfig({ TOKEN_SECRET: "secret" });
} catch (error) {
  console.log("Refused to start:", error instanceof Error ? error.message : error);
}

const config = loadConfig({ TOKEN_SECRET: randomBytes(32).toString("hex") });
console.log("Started with a secret of", config.tokenSecret.length, "characters");
```

Output of `npx tsx try-secret.ts`

```ts
Refused to start: TOKEN_SECRET must be set to a random value of at least 32 characters
Refused to start: TOKEN_SECRET must be set to a random value of at least 32 characters
Started with a secret of 64 characters
```

The real server does the same. Started without `TOKEN_SECRET`, it stops before it opens a port:

Terminal on your computer

```bash
$ npm start

> bookstore@1.0.0 start
> tsx src/server.ts

~/bookstore/src/config.ts:17
    throw new Error("TOKEN_SECRET must be set to a random value of at least 32 characters");
          ^

Error: TOKEN_SECRET must be set to a random value of at least 32 characters
    at loadConfig (~/bookstore/src/config.ts:17:11)
    at <anonymous> (~/bookstore/src/server.ts:6:16)
…
Node.js v24.19.0
```

Make a secret the same way and put it in the environment of the terminal that runs the server:

Terminal on your computer

```bash
$ export TOKEN_SECRET=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
```

> ONE SECRET PER SERVER, NEVER IN GIT
>
> Do not copy a secret from a tutorial, a chat or a colleague's laptop. Make a fresh one for each environment. If a secret ever leaks, replace it: every token signed with the old one stops working, which is exactly what you want.

## Storing passwords safely

If your database leaks, the attacker must not learn the passwords. So you store a **hash**: the output of a one-way function. You can check a password against the hash, but you cannot turn the hash back into the password. As [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#passwords) showed, it must be a password hash that is **slow on purpose**, such as **scrypt**, never a fast hash like SHA-256, and each password gets its own random **salt**, so two users with the same password get different hashes. Here is that code as a BookStore module:

src/auth/password.tsNode.js only

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || salt === undefined || key === undefined) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

- `scrypt` takes a callback, so `derive` wraps it in a `Promise` ([Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async)) to use it with `await`.
- The stored string holds everything needed to check later: the method name, the salt and the key, separated by `$`.
- `timingSafeEqual` compares two buffers in a time that does not depend on where they first differ. A normal `===` stops at the first different byte, and an attacker can measure that difference to guess a value piece by piece ([Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#timing)).

try-password.tsNode.js only

```ts
import { hashPassword, verifyPassword } from "./src/auth/password.js";

const first = await hashPassword("correct horse battery");
const second = await hashPassword("correct horse battery");

console.log(first);
console.log("same password, same hash?", first === second);
console.log("right password:", await verifyPassword("correct horse battery", first));
console.log("wrong password:", await verifyPassword("correct horse battery!", first));
```

Output of `npx tsx try-password.ts`

```ts
scrypt$cr-RTXIGZPIMrtaRv3Kv6w$KW9awwEzrIjGkg5EWNqlZT_YWfsthvL7ehYeRHu6LF1y7c9CNAQYDs2F1gs3dFV13Gz0QlKMs69qo4Bye6HKuA
same password, same hash? false
right password: true
wrong password: false
```

Your hash will look different: the salt is random on every call. That is also why the same password gave two different hashes, and yet both check correctly.

## Signed tokens

After log-in the server gives the client a token. The token must be impossible to forge. The server attaches a **signature** made with **HMAC**: a hash of the token's content mixed with the secret. Change one character of the content and the signature no longer matches; and without the secret, nobody can make a new valid one.

src/auth/token.tsNode.js only

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  readonly sub: number;
  readonly exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function isPayload(value: unknown): value is TokenPayload {
  return typeof value === "object" && value !== null && "sub" in value && "exp" in value
    && Number.isInteger(value.sub) && Number.isInteger(value.exp);
}

export function createToken(userId: number, secret: string, now = Date.now(), ttlSeconds = 3600): string {
  const payload: TokenPayload = { sub: userId, exp: Math.floor(now / 1000) + ttlSeconds };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function readToken(token: string, secret: string, now = Date.now()): TokenPayload | undefined {
  const [data, signature, extra] = token.split(".");
  if (data === undefined || signature === undefined || extra !== undefined) return undefined;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  const payload: unknown = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  if (!isPayload(payload) || payload.exp * 1000 <= now) return undefined;
  return payload;
}
```

- The **payload** says who (`sub`, "subject", the user id) and until when (`exp`, "expires", in seconds since 1970). A token lives one hour.
- **base64url** writes bytes as letters, digits, `-` and `_`, safe to put in a header or URL.
- `readToken` checks the signature *first*, and only then reads the content. It returns `undefined` for anything wrong: a bad shape, a bad signature, an expired token.
- `now` is a parameter with `Date.now()` as the default. A test can pass any time it likes, so "two hours later" does not mean waiting two hours.

> NOTE
>
> This is the same idea as a **JWT** (JSON Web Token), the standard format. A JWT also has a header part that names the signing method. You will use real JWTs with `@zudojs/auth` later in the course.

try-token.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { createToken, readToken } from "./src/auth/token.js";

const secret = randomBytes(32).toString("hex");
const now = Date.UTC(2026, 8, 23, 12, 0, 0);
const token = createToken(7, secret, now);
const [data] = token.split(".");

console.log("payload part:", data);
console.log("decoded:", Buffer.from(data!, "base64url").toString("utf8"));
console.log("valid:", readToken(token, secret, now));

const forged = Buffer.from(JSON.stringify({ sub: 1, exp: 1790170000 })).toString("base64url");
console.log("forged payload:", readToken(`${forged}.${token.split(".")[1]}`, secret, now));
console.log("other secret:", readToken(token, randomBytes(32).toString("hex"), now));
console.log("two hours later:", readToken(token, secret, now + 2 * 3600 * 1000));
```

Output of `npx tsx try-token.ts`

```ts
payload part: eyJzdWIiOjcsImV4cCI6MTc5MDE2ODQwMH0
decoded: {"sub":7,"exp":1790168400}
valid: { sub: 7, exp: 1790168400 }
forged payload: undefined
other secret: undefined
two hours later: undefined
```

Look at the second line: anyone can **read** a token. The signature stops people from *changing* it, not from reading it. So never put a password or other private data in a token. The attacker who swapped in `"sub": 1` to become user 1 got nothing, because the old signature does not match the new content.

## Register, log in, protect

The code in this section plugs into the project from [the last lesson](https://zudojs.oyinlola.site/learn/bookstore-data). First, two more migrations in `src/db.ts`: a `users` table, and an owner for each order. They go at the end of the list, so a database that already exists gets them on its next start:

src/db.ts (part)Node.js only

```ts
  `CREATE TABLE IF NOT EXISTS users (
     id serial PRIMARY KEY,
     email text NOT NULL UNIQUE,
     password_hash text NOT NULL
   )`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users (id)`,
];
```

A body parser for the e-mail and password goes in `src/validation/bodies.ts`. E-mails are stored in lower case, so `Ada@Example.com` and `ada@example.com` are one account. The password is checked for length, but not trimmed: spaces are allowed in a password.

src/validation/bodies.ts (part)Node.js only

```ts
export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export function parseCredentials(input: unknown): Credentials {
  const body = objectBody(input);
  const issues: string[] = [];
  const email = text(body["email"], "email", 254, issues).toLowerCase();
  if (email !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) issues.push("email is not an e-mail address");
  const password = typeof body["password"] === "string" ? body["password"] : "";
  if (password.length < 10 || password.length > 200) issues.push("password must be 10 to 200 characters");
  return done({ email, password }, issues);
}
```

The user repository. Notice that `create` returns a `User` without the hash: the hash only leaves the repository through `findByEmail`, for the log-in check.

src/repositories/users.tsNode.js only

```ts
import type { Queryable } from "../db.js";
import { isPgError } from "../db.js";
import { ConflictError } from "../errors.js";

export interface User {
  readonly id: number;
  readonly email: string;
}

interface UserRow extends User {
  readonly passwordHash: string;
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async create(email: string, passwordHash: string): Promise<User> {
    try {
      const { rows } = await this.db.query<User>(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
        [email, passwordHash],
      );
      return rows[0]!;
    } catch (error) {
      if (isPgError(error) && error.code === "23505") throw new ConflictError("That e-mail is already registered");
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1`,
      [email],
    );
    return rows[0];
  }
}
```

REASON IT OUT

### What can a log-in route give away?

An attacker has a list of a million e-mail addresses and wants to know which ones have BookStore accounts, so they can target those people. Before reading the routes, think about what the log-in and registration routes could reveal:

- Log-in answers "No such user" for an unknown e-mail and "Wrong password" for a known one.
- Both answers are the same, but for an unknown e-mail the server skips scrypt and answers in 2 ms instead of 80 ms.
- Registration answers 409 "That e-mail is already registered".
- Nothing limits how many log-in attempts one client makes.

**Show the reasoning**

Different messages reveal which e-mails exist, so both cases get the **same** message and status. A difference in *time* reveals the same thing: the attacker only has to measure. So the route runs one scrypt on both paths, as the code below does.

Registration is harder: the new user must learn that the address is taken. Large sites answer every registration with "check your e-mail" and send the explanation to the address itself, so only its owner learns whether it had an account. The BookStore keeps the simple 409 and lists it as a known weakness in the review at the end of this lesson.

Without a limit, an attacker can try a million passwords against one account. Every public log-in route needs a **rate limit**; that is on the review list too.

The two user routes. Log-in answers with the **same** message whether the e-mail is unknown or the password is wrong, so it does not tell a stranger which e-mails have accounts:

src/routes/users.tsNode.js only

```ts
import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { createToken } from "../auth/token.js";
import { HttpError } from "../http/errors.js";
import type { Router } from "../http/router.js";
import type { UserRepository } from "../repositories/users.js";
import { parseCredentials } from "../validation/bodies.js";

export function addUserRoutes(router: Router, users: UserRepository, secret: string): void {
  // A hash of a random password nobody knows, checked when the e-mail is unknown.
  const dummyHash = hashPassword(randomUUID());

  router.add("POST", "/users", async (request) => {
    const { email, password } = parseCredentials(request.body);
    const user = await users.create(email, await hashPassword(password));
    return { status: 201, body: user };
  });

  router.add("POST", "/sessions", async (request) => {
    const { email, password } = parseCredentials(request.body);
    const user = await users.findByEmail(email);
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (user === undefined || !passwordOk) {
      throw new HttpError(401, "bad_credentials", "Wrong e-mail or password");
    }
    return { status: 200, body: { token: createToken(user.id, secret) } };
  });
}
```

The same message is not enough on its own. scrypt is slow on purpose, so if an unknown e-mail skipped it, that answer would come back much faster, and an attacker could time the replies to learn which e-mails have accounts. So when no user is found, the route still checks the password against `dummyHash`: both paths run one scrypt and take the same time.

A protected route calls one guard. It reads the `Authorization: Bearer <token>` header, and either returns the user id or throws **401 Unauthorized**:

src/http/auth.tsNode.js only

```ts
import { readToken } from "../auth/token.js";
import { HttpError } from "./errors.js";
import type { ApiRequest } from "./types.js";

export function requireUserId(request: ApiRequest, secret: string): number {
  const header = request.headers["authorization"];
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const payload = token === undefined ? undefined : readToken(token, secret);
  if (payload === undefined) {
    throw new HttpError(401, "unauthorized", "Log in and send your token as: Authorization: Bearer <token>");
  }
  return payload.sub;
}
```

The order routes now ask the guard who is calling, and pass that user id to the repository:

src/routes/orders.tsNode.js only

```ts
import { requireUserId } from "../http/auth.js";
import type { Router } from "../http/router.js";
import type { OrderRepository } from "../repositories/orders.js";
import { parseNewOrder } from "../validation/bodies.js";

export function addOrderRoutes(router: Router, orders: OrderRepository, secret: string): void {
  router.add("GET", "/orders", async (request) => {
    const userId = requireUserId(request, secret);
    return { status: 200, body: await orders.listFor(userId) };
  });

  router.add("POST", "/orders", async (request) => {
    const userId = requireUserId(request, secret);
    return { status: 201, body: await orders.place(userId, parseNewOrder(request.body)) };
  });
}
```

> THE MISTAKE TO NEVER MAKE
>
> A tempting shortcut is to let the client say who it is: `{ "bookId": 1, "quantity": 1, "userId": 2 }`, then `orders.place(body.userId, …)`. With that one line, any logged-in user can order in someone else's name, or read someone else's orders by changing a number. The user id must come **only** from the verified token. That is why `parseNewOrder` has no `userId` field at all.

In `src/repositories/orders.ts`, `place` takes the user id and writes it into the new `user_id` column, and `list` becomes `listFor`, which filters by it:

src/repositories/orders.ts (part)Node.js only

```ts
INSERT INTO orders (user_id, book_id, quantity, total_cents)
SELECT $3, id, $2, price_cents * $2 FROM taken
…
async place(userId: number, order: NewOrder): Promise<Order> {
  const { rows } = await this.db.query<Order>(PLACE_ORDER, [order.bookId, order.quantity, userId]);
…
async listFor(userId: number): Promise<Order[]> {
  const { rows } = await this.db.query<Order>(
    `SELECT id, book_id AS "bookId", quantity, total_cents AS "totalCents"
     FROM orders WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
  return rows;
}
```

Finally, `createRouter(db, tokenSecret)` passes the secret to the routes that need it, adds `addUserRoutes(router, new UserRepository(db), tokenSecret)`, and `server.ts` calls it with `config.tokenSecret`. Start the server in the terminal where you exported `TOKEN_SECRET`:

Terminal on your computer

```bash
$ npm run dev

> bookstore@1.0.0 dev
> tsx watch src/server.ts

BookStore API on http://localhost:3000
```

In a second terminal: add a book, register, register again, log in with a wrong and then the right password, and use the token:

Terminal on your computer

```bash
$ curl -X POST http://localhost:3000/authors -H 'content-type: application/json' -d '{"name":"Chinua Achebe"}'
{"id":1,"name":"Chinua Achebe"}
$ curl -X POST http://localhost:3000/books -H 'content-type: application/json' -d '{"title":"Things Fall Apart","authorId":1,"priceCents":1299,"stock":3}'
{"id":1,"title":"Things Fall Apart","authorId":1,"priceCents":1299,"stock":3}
$ curl -X POST http://localhost:3000/users -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"a long passphrase"}'
{"id":1,"email":"ada@example.com"}
$ curl -X POST http://localhost:3000/users -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"a long passphrase"}'
{"error":"conflict","message":"That e-mail is already registered"}
$ curl -X POST http://localhost:3000/sessions -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"wrong passphrase"}'
{"error":"bad_credentials","message":"Wrong e-mail or password"}
$ curl -X POST http://localhost:3000/sessions -H 'content-type: application/json' -d '{"email":"ada@example.com","password":"a long passphrase"}'
{"token":"eyJzdWIiOjEsImV4cCI6MTc5MDE3NTM1MX0.EtB0bByiCmKIrq2oHVUQXnvdAdTRPuCZHykaTCXaYJ0"}
$ TOKEN=eyJzdWIiOjEsImV4cCI6MTc5MDE3NTM1MX0.EtB0bByiCmKIrq2oHVUQXnvdAdTRPuCZHykaTCXaYJ0
$ curl http://localhost:3000/orders
{"error":"unauthorized","message":"Log in and send your token as: Authorization: Bearer <token>"}
$ curl -X POST http://localhost:3000/orders -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" -d '{"bookId":1,"quantity":1}'
{"id":1,"bookId":1,"quantity":1,"totalCents":1299}
$ curl http://localhost:3000/orders -H "authorization: Bearer $TOKEN"
[{"id":1,"bookId":1,"quantity":1,"totalCents":1299}]
```

Paste your own token after `TOKEN=`; it will differ from this one, because your secret and your clock differ.

> NOT READY FOR THE INTERNET YET
>
> Nothing stops a script from trying a million passwords against `/sessions`. A public log-in route needs a **rate limit**: only a few attempts per minute per client. It is on the list below. [Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting) builds one, and ZudoJS provides one in `@zudojs/security`.

## Tests with node:test

You wrote tests with `node:test` in [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics). The token code is a good first target: pure functions, and every rule is one test. Each test makes its own secret, so no real secret ever appears in a test file:

tests/token.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { createToken, readToken } from "../src/auth/token.js";

const secret = randomBytes(32).toString("hex");
const now = Date.UTC(2026, 8, 23, 12, 0, 0);

test("a fresh token names its user", () => {
  assert.equal(readToken(createToken(7, secret, now), secret, now)?.sub, 7);
});

test("a token signed with another secret is refused", () => {
  const other = randomBytes(32).toString("hex");
  assert.equal(readToken(createToken(7, other, now), secret, now), undefined);
});

test("a changed payload is refused", () => {
  const [, signature] = createToken(7, secret, now).split(".");
  const payload = Buffer.from(JSON.stringify({ sub: 1, exp: 9999999999 })).toString("base64url");
  assert.equal(readToken(`${payload}.${signature}`, secret, now), undefined);
});

test("an expired token is refused", () => {
  const token = createToken(7, secret, now, 60);
  assert.equal(readToken(token, secret, now + 61_000), undefined);
});
```

Output of `npx tsx tests/token.test.ts`

```ts
✔ a fresh token names its user (4.777057ms)
✔ a token signed with another secret is refused (0.916208ms)
✔ a changed payload is refused (0.45011ms)
✔ an expired token is refused (0.527713ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29.750346
```

The durations will differ on your computer. Testing the whole API takes more work: a test must build a database, a secret, a router and a server, start it on port 0, and close everything afterwards:

tests/api.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { createRouter } from "../src/routes/index.js";

const db = await openDatabase();
const server = createApp(createRouter(db, randomBytes(32).toString("hex")));
let base = "";

before(async () => {
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  base = `http://localhost:${address.port}`;
});

after(async () => {
  server.close();
  await db.close();
});

function post(path: string, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  return fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
}

test("orders need a token", async () => {
  const response = await fetch(`${base}/orders`);
  assert.equal(response.status, 401);
});

test("a new user logs in and has no orders yet", async () => {
  const credentials = { email: "ada@example.com", password: "a long passphrase" };
  assert.equal((await post("/users", credentials)).status, 201);
  const { token } = (await (await post("/sessions", credentials)).json()) as { token: string };
  const orders = await fetch(`${base}/orders`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(orders.status, 200);
  assert.deepEqual(await orders.json(), []);
});
```

Add a test script to `package.json`, `"test": "tsx --test tests/*.test.ts"`, and run the whole suite:

Terminal on your computer

```bash
$ npm test

> bookstore@1.0.0 test
> tsx --test tests/*.test.ts

✔ orders need a token (123.101035ms)
✔ a new user logs in and has no orders yet (502.271227ms)
✔ a fresh token names its user (9.257998ms)
✔ a token signed with another secret is refused (7.276882ms)
✔ a changed payload is refused (1.063517ms)
✔ an expired token is refused (1.500403ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12632.250468
```

Six tests pass. Almost all of the time is PGlite starting up for the API test.

## An honest review

The BookStore works. It validates input, uses parameterized SQL, hashes passwords, signs tokens and has tests. Now step back and read your own code as a reviewer would. These are the problems it has, and every one of them grows with each new route:

| Problem | Where you felt it |
| --- | --- |
| **Routing boilerplate** | Every route file repeats the same shape: `router.add`, parse, call, `return { status, body }`. The router has no middleware, so "require a user" is a line you must remember in every protected handler. Forget it once and the route is open. |
| **Validation boilerplate** | `text`, `whole`, `parseNewBook`, `parseCredentials`… and each `interface` is written separately from its parser, so the two can drift apart. |
| **Manual wiring** | `createRouter` builds every repository and hands the secret to the routes that need it. Each new dependency means changing function signatures up the whole chain. |
| **No lifecycle** | Nothing handles Ctrl + C or a `SIGTERM` from a server: requests in flight are cut off and the database is never closed. There is no order for "start the database, then the server" or "stop them in reverse". There is no health check a load balancer could ask. |
| **Scattered configuration** | `PORT`, `DATA_DIR`, `DATABASE_URL` and `TOKEN_SECRET` are each parsed by hand. Nothing lists them all, gives each a type, or hides the secret if someone logs the config. |
| **Missing security layers** | No rate limit on log-in. No security headers (`X-Content-Type-Options`, `Strict-Transport-Security`, …). No CORS policy for browsers. Tokens cannot be revoked before they expire, so there is no real log-out. Registration answers 409 for a known e-mail, which tells a stranger who has an account. |
| **Testing friction** | To test one route you build a database, a secret, a router and a server, and tear them down again. There are no helpers for fake users, test data or a test client. |
| **No logging or errors standard** | Logging is `console.log` and `console.error`. Your error codes (`not_found`, `invalid_id`) are your own invention, different from the next project's. |

None of these is a bug you can fix with one clever line. They are **structural**: they come from having no common shape for the code. The next lesson, [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers), gives the BookStore that shape: controllers, services and repositories with typed boundaries, one place that wires them together, one typed error format, and services you can test without a database. That removes much of the wiring and testing pain, but not the missing lifecycle, configuration, security layers and logging. Those are the jobs a framework takes over: [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture) and [What a framework does](https://zudojs.oyinlola.site/learn/frameworks), in the Software design and architecture course, show how, and ZudoJS does them for real.

## Practice

TRY IT YOURSELF

### Test the password functions

Write `tests/password.test.ts` with two tests: the right password is accepted and a wrong one refused; and a stored value that is not in the `scrypt$salt$key` format is refused without throwing.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`const stored = await hashPassword("a long passphrase");`, then `assert.equal(await verifyPassword(...), true)` and `false` for a changed password.

HINT 2

`assert.equal(await verifyPassword("a long passphrase", "plain-text-password"), false);`. `verifyPassword` is written to return `false` for a bad shape, never to throw.

SOLUTION

tests/password.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "../src/auth/password.js";

test("the right password passes, a wrong one fails", async () => {
  const stored = await hashPassword("a long passphrase");
  assert.equal(await verifyPassword("a long passphrase", stored), true);
  assert.equal(await verifyPassword("a long passphrasE", stored), false);
});

test("a broken stored value is refused", async () => {
  assert.equal(await verifyPassword("a long passphrase", "plain-text-password"), false);
});
```

Output of `npx tsx tests/password.test.ts`

```ts
✔ the right password passes, a wrong one fails (410.756149ms)
✔ a broken stored value is refused (0.486865ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 425.464448
```

The second test matters: a database row with a damaged or old-format value must mean "wrong password", not a crash.

TRY IT YOURSELF

### Tokens that expire sooner

A bank would not accept a one-hour token. Using `createToken`'s `ttlSeconds` parameter, make a token that lives 5 minutes, and show that it is valid after 4 minutes and refused after 6.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`ttlSeconds` is `createToken`'s fourth argument, and it counts seconds: 5 minutes is `5 * 60`.

HINT 2

`createToken(7, secret, now, 5 * 60)`. Everything else stays the same; `readToken` already returns `undefined` once `now` passes the token's `exp`.

SOLUTION

try-short-token.tsNode.js only

```ts
import { randomBytes } from "node:crypto";

import { createToken, readToken } from "./src/auth/token.js";

const secret = randomBytes(32).toString("hex");
const now = Date.UTC(2026, 8, 23, 12, 0, 0);
const token = createToken(7, secret, now, 5 * 60);
const minute = 60 * 1000;

console.log("after 4 minutes:", readToken(token, secret, now + 4 * minute));
console.log("after 6 minutes:", readToken(token, secret, now + 6 * minute));
```

Output of `npx tsx try-short-token.ts`

```ts
after 4 minutes: { sub: 7, exp: 1790165100 }
after 6 minutes: undefined
```

## Recap

- Passwords are stored as scrypt hashes with a random salt, and compared with `timingSafeEqual`.
- A log-in returns a token: a readable payload plus an HMAC signature made with a secret. Changing the payload or the secret makes it invalid, and it expires.
- The secret comes from `TOKEN_SECRET`, and the server refuses to start without a long enough one.
- Protected routes take the user id from the verified token, never from the request body.
- `node:test` tests pure functions easily, and a whole API with some effort.
- The hand-built BookStore now shows its structural problems: boilerplate, manual wiring, no lifecycle, scattered configuration, missing security layers and testing friction.

Next: [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers), where the BookStore is refactored into typed layers with DTOs, mappers, services, repositories and role checks.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
