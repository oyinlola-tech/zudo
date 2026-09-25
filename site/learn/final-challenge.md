---
title: "Final production challenge — ZudoJS Academy"
description: "Someone else's gift-card feature works in the demo and fails everything else. Find its problems, fix them step by step, and prove each fix with a test."
source: https://zudojs.oyinlola.site/learn/final-challenge
---

LEVEL 19 · LESSON 10 OF 10

Capstone Production

# Final production challenge

Someone else's gift-card feature works in the demo and fails everything else. Find its problems, fix them step by step, and prove each fix with a test.

- **120 min** to read and try
- **You need:** The whole course, especially the ShopFlow capstone
- **You build:** A secure, transactional, tested and deployable gift-card and wallet service, fixed from a broken one

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read someone else's code for security, correctness, architecture and operations problems, and name at least ten before changing anything
- Replace string-built SQL and a check-then-act redemption with parameterized queries and one atomic UPDATE that closes the race
- Move authentication to a session token and authorization to "only your own wallet", removing every endpoint that trusts a caller-supplied user id
- Wrap a debit and credit in one transaction and roll both back when either fails
- Write tests that fail on the original code and pass on the fix, including one that redeems the same card twice at once
- Work through a production checklist (events, queues, caching, rate limits, observability, OpenAPI, deployment) against a feature that started as a prototype

## The situation

ShopFlow wants gift cards. A customer types the code from a card and the amount goes into their **wallet**; they can also send wallet money to a friend. A teammate built it in an afternoon. The demo worked, the feature was merged, and now it is your job to get it ready for production.

This is the last lesson of the course, and it works differently: you get a running application with real problems, and a checklist. You find the problems, fix them, and prove each fix with a test. The key fixes have worked solutions, hidden until you open them. Try first.

## The code you inherit

Create a folder, install what the capstone used, and add three files. The database has two users, Ada (id 1) and Linus (id 2), each with 10.00 in their wallet, and two unused gift cards. Each user has a session token; the database stores only its hash.

Terminal on your computer

```bash
$ mkdir giftcards && cd giftcards
$ npm init -y
$ npm pkg set type=module
$ npm install @zudojs/crypto @zudojs/errors @zudojs/http @zudojs/schema @electric-sql/pglite
…
$ npm install -D typescript tsx @types/node vitest
…
```

db.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { generateSessionToken, hashToken } from "@zudojs/crypto";

/** A fresh database with two users, their wallets and two unused gift cards. */
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE wallets (user_id INT PRIMARY KEY REFERENCES users (id), balance_cents INT NOT NULL CHECK (balance_cents >= 0));
    CREATE TABLE gift_cards (code TEXT PRIMARY KEY, amount_cents INT NOT NULL, redeemed_by INT REFERENCES users (id));
    INSERT INTO gift_cards VALUES ('GIFT-ADA-5000', 5000, NULL), ('GIFT-LINUS-2000', 2000, NULL);
  `);
  const tokens: Record<"ada" | "linus", string> = { ada: await generateSessionToken(), linus: await generateSessionToken() };
  for (const [id, name] of [[1, "ada"], [2, "linus"]] as const) {
    await db.query("INSERT INTO users VALUES ($1, $2, $3)", [id, name, await hashToken(tokens[name])]);
    await db.query("INSERT INTO wallets VALUES ($1, 1000)", [id]);
  }
  return { db, tokens };
}
```

> DELIBERATELY BROKEN CODE
>
> The next file is the teammate's server. It is here so you can find what is wrong with it. Do not copy any of it into a real project.

server.tsNode.js only

```ts
// ⚠ DELIBERATELY BROKEN. Do not copy this file into a real project.
import type { PGlite } from "@electric-sql/pglite";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter, type HttpRequestContext } from "@zudojs/http";

export function createGiftCardServer(db: PGlite) {
  const router = createRouter();
  const body = (bytes: unknown) => JSON.parse(new TextDecoder().decode(bytes as Uint8Array));

  router.get("/giftcards", async (ctx) => {
    const { rows } = await db.query(`SELECT * FROM gift_cards WHERE code = '${ctx.query["code"]}'`);
    return createResponseContext().json(rows);
  });

  router.get("/wallets/:userId", async (ctx) => {
    const { rows } = await db.query(`SELECT * FROM wallets WHERE user_id = ${ctx.params["userId"]}`);
    return createResponseContext().json(rows[0]);
  });

  router.post("/giftcards/redeem", async (ctx) => {
    const { code, userId } = body(ctx.request.body);
    const { rows } = await db.query<{ amount_cents: number; redeemed_by: number | null }>(
      `SELECT * FROM gift_cards WHERE code = '${code}'`,
    );
    if (!rows[0] || rows[0].redeemed_by !== null) return createResponseContext({ status: 400 }).json({ error: "invalid card" });
    await db.query(`UPDATE wallets SET balance_cents = balance_cents + ${rows[0].amount_cents} WHERE user_id = ${userId}`);
    await db.query(`UPDATE gift_cards SET redeemed_by = ${userId} WHERE code = '${code}'`);
    return createResponseContext().json({ ok: true });
  });

  router.post("/wallets/transfer", async (ctx) => {
    const { from, to, amountCents } = body(ctx.request.body);
    await db.query(`UPDATE wallets SET balance_cents = balance_cents - ${amountCents} WHERE user_id = ${from}`);
    await db.query(`UPDATE wallets SET balance_cents = balance_cents + ${amountCents} WHERE user_id = ${to}`);
    return createResponseContext().json({ ok: true });
  });

  return createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
  });
}
```

It compiles, and for Ada redeeming her own card it works. Now use it the way the internet will. `try-it.ts` is a normal request followed by five things any curious user could try:

try-it.tsNode.js only

```ts
import { createDatabase } from "./db.js";
import { createGiftCardServer } from "./server.js";

const { db } = await createDatabase();
const server = createGiftCardServer(db);
await server.start();
const url = (path: string) => `http://127.0.0.1:${server.address?.port}${path}`;
const post = (path: string, data: unknown) => fetch(url(path), { method: "POST", body: JSON.stringify(data) });
const balances = async () => {
  const { rows } = await db.query<{ user_id: number; balance_cents: number }>("SELECT user_id, balance_cents FROM wallets ORDER BY user_id");
  return rows.map((row) => `user ${row.user_id}: ${row.balance_cents}`).join(", ");
};

console.log("start:", await balances());

console.log("1. Ada redeems her own card:", (await post("/giftcards/redeem", { code: "GIFT-ADA-5000", userId: 1 })).status);

const leaked = await (await fetch(url(`/giftcards?code=${encodeURIComponent("x' OR '1'='1")}`))).json();
console.log("2. SQL injection lists every card:", leaked.map((card: { code: string }) => card.code));

console.log("3. Ada redeems Linus's card into her wallet:", (await post("/giftcards/redeem", { code: "GIFT-LINUS-2000", userId: 1 })).status);

console.log("4. Ada 'sends' Linus -3000 cents:", (await post("/wallets/transfer", { from: 1, to: 2, amountCents: -3000 })).status);

console.log("5. Linus sends 1000 to user 99, who does not exist:", (await post("/wallets/transfer", { from: 2, to: 99, amountCents: 1000 })).status);

console.log("6. Anyone reads Ada's wallet:", await (await fetch(url("/wallets/1"))).json());
console.log("end:", await balances());
await server.stop();
await db.close();
```

Output of `npx tsx try-it.ts`

```ts
start: user 1: 1000, user 2: 1000
1. Ada redeems her own card: 200
2. SQL injection lists every card: [ 'GIFT-LINUS-2000', 'GIFT-ADA-5000' ]
3. Ada redeems Linus's card into her wallet: 200
4. Ada 'sends' Linus -3000 cents: 500
5. Linus sends 1000 to user 99, who does not exist: 200
6. Anyone reads Ada's wallet: { user_id: 1, balance_cents: 11000 }
end: user 1: 11000, user 2: 0
```

The wallets started with 20.00 in total, plus 70.00 of gift cards. They end with 110.00 in Ada's wallet and nothing left for Linus. Every line after the first is a real incident:

1. A code that closes the SQL string and adds `OR '1'='1'` turned the lookup into "every card". Ada now knows Linus's unused code.
2. The server believed the `userId` in the body, so anyone can act as anyone, with no login at all.
3. A negative amount was not refused. The first `UPDATE` *added* 30.00 to Ada; the second failed on the database's `CHECK` and answered 500, but the first had already been saved, because nothing wrapped the two writes in a transaction.
4. A transfer to a user who does not exist took 10.00 from Linus and gave it to nobody, and still answered 200.
5. Anyone can read anyone's balance.

## Step 1: name the problems

TRY IT YOURSELF

### Write the list

Before you change any code, write down every problem you can find in `server.ts`, including ones the script did not show. Sort them into **security**, **correctness**, **architecture** and **operations**. Aim for at least ten.

**Show a solution**

| Kind | Problem |
| --- | --- |
| Security | SQL built by string concatenation in every query: injection (incident 2), and worse ones are possible, such as `'; DROP TABLE …` through `/wallets/:userId`. |
| Security | No authentication: the caller's identity comes from the request body or the URL (incidents 3 and 6). |
| Security | No authorization: nothing checks that the wallet being read or debited belongs to the caller. This is an *IDOR*, an insecure direct object reference. |
| Security | No rate limit on code lookups and redemptions, so gift codes can be guessed by brute force. |
| Correctness | No input validation: negative, fractional or huge amounts, missing fields, and a body that is not JSON (a 500 from `JSON.parse`). |
| Correctness | Two-step writes without a transaction: money is created or lost when the second write fails (incidents 4 and 5). |
| Correctness | Check-then-act race: two redemptions of the same card at the same moment both pass the `SELECT`, and the card pays twice. |
| Correctness | A transfer to a missing wallet answers 200: the result of the write is never checked. |
| Architecture | Business rules, SQL and HTTP are mixed in route handlers: nothing can be tested without HTTP, and nothing is reusable. |
| Architecture | `SELECT *` returns internal columns (`redeemed_by`, user ids) to the client. |
| Operations | No tests, no logs, no metrics, no audit trail of money movements, no health checks, no configuration, no OpenAPI description. |

## Step 2: the checklist

The feature is ready when every line holds. Work through them in this order; each one links to the lesson that taught the tool.

| ✓ | Area | Acceptance criteria |
| --- | --- | --- |
| ☐ | Validation ([lesson](https://zudojs.oyinlola.site/learn/zudo-validation)) | Every body, parameter and query is parsed by a schema. Amounts are whole cents from 1 to 100000. A bad request gets 400, never 500. |
| ☐ | Persistence | Every SQL statement uses `$1` placeholders. No `SELECT *` reaches a client. |
| ☐ | Authentication ([lesson](https://zudojs.oyinlola.site/learn/zudo-auth)) | The user comes only from the session token. No endpoint accepts a user id for "who am I". |
| ☐ | Authorization ([lesson](https://zudojs.oyinlola.site/learn/zudo-permissions)) | A user can read and move only their own money. Support staff can read any wallet but cannot move money. |
| ☐ | Transactions ([lesson](https://zudojs.oyinlola.site/learn/zudo-transactions)) | Redeem and transfer are all-or-nothing. A card pays once, even under parallel requests. |
| ☐ | Tests ([lesson](https://zudojs.oyinlola.site/learn/zudo-testing)) | Every incident above has a test that failed on the old code and passes now. |
| ☐ | Events and queues ([events](https://zudojs.oyinlola.site/learn/zudo-events), [queue](https://zudojs.oyinlola.site/learn/zudo-queue)) | A `wallet.credited` event after each commit; the confirmation e-mail goes through a queue with retries. |
| ☐ | Caching ([lesson](https://zudojs.oyinlola.site/learn/zudo-cache)) | Balances are never cached. If card lookups are cached, a redemption invalidates the entry. |
| ☐ | Abuse protection ([lesson](https://zudojs.oyinlola.site/learn/zudo-security)) | Code lookups and redemptions are rate-limited per user and per IP; ten wrong codes in a row lock redemption for 15 minutes. |
| ☐ | Observability ([lesson](https://zudojs.oyinlola.site/learn/zudo-observability)) | JSON logs with a request id and no codes or tokens in them; metrics for redemptions, transfers and failures; an audit row for every money movement. |
| ☐ | OpenAPI ([lesson](https://zudojs.oyinlola.site/learn/zudo-openapi)) | `/openapi.json` documents every route, its body schema and its error answers. |
| ☐ | Production ([lesson](https://zudojs.oyinlola.site/learn/production-engineering)) | Configuration checked at startup, `/health` and `/ready`, graceful shutdown, timeouts. |
| ☐ | Deployment ([lesson](https://zudojs.oyinlola.site/learn/deployment)) | Runs in Docker Compose behind HTTPS, with migrations, backups and an alert on the failure metric. |

## Step 3: fix security and data

TRY IT YOURSELF

### Validation, SQL, authentication and transactions

Move the rules out of the route handlers into a `wallets.ts` module with four operations: `authenticate`, `card` (look up one code), `redeem` and `transfer`. Then write a new, thin HTTP layer on top of it. When you are done, run the same six attacks again: each must be refused with the right status, and the money must add up.

Hints:

- A gift code has a known shape. A schema with a regular expression refuses anything else before SQL ever sees it. Parameters (`$1`) are still required: validation is one wall, parameters are the second.
- Find the user by hashing the bearer token and looking up the hash, as in the capstone's `users.ts`.
- Replace "`SELECT`, then `UPDATE`" with one `UPDATE … WHERE code = $1 AND redeemed_by IS NULL RETURNING …`. It checks and claims the card in one step, so the race disappears.
- For a transfer, debit with `AND balance_cents >= $1`, then credit, inside `db.transaction`. Check `affectedRows` after each `UPDATE` and throw if it is 0: the throw rolls back the whole transaction.
- Throw errors from `@zudojs/errors`. `@zudojs/http` turns them into 400, 401, 404 and 409 answers for you.

**Show a solution**

The rules, in one module with no HTTP in it:

wallets.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";
import { hashToken } from "@zudojs/crypto";
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";

const Code = schema.string().trim().regex(/^GIFT-[A-Z0-9-]{4,40}$/);
const Redeem = schema.object({ code: Code });
const Transfer = schema.object({ to: schema.number().int().positive(), amountCents: schema.number().int().min(1).max(100_000) });

export function createWallets(db: PGlite) {
  return {
    async authenticate(authorization: string | undefined): Promise<number> {
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
      const { rows } = token ? await db.query<{ id: number }>("SELECT id FROM users WHERE token_hash = $1", [await hashToken(token)]) : { rows: [] };
      if (!rows[0]) throw new AuthenticationError("Log in first");
      return rows[0].id;
    },

    async card(code: unknown) {
      const { rows } = await db.query<{ amountCents: number; redeemed: boolean }>(
        `SELECT amount_cents AS "amountCents", redeemed_by IS NOT NULL AS redeemed FROM gift_cards WHERE code = $1`,
        [Code.parse(code)],
      );
      if (!rows[0]) throw new NotFoundError("No gift card with that code");
      return rows[0];
    },

    async balance(userId: number): Promise<number> {
      const { rows } = await db.query<{ balance_cents: number }>("SELECT balance_cents FROM wallets WHERE user_id = $1", [userId]);
      return rows[0]?.balance_cents ?? 0;
    },

    async redeem(userId: number, input: unknown): Promise<number> {
      const { code } = Redeem.parse(input);
      return db.transaction(async (tx) => {
        const card = await tx.query<{ amount_cents: number }>(
          "UPDATE gift_cards SET redeemed_by = $1 WHERE code = $2 AND redeemed_by IS NULL RETURNING amount_cents",
          [userId, code],
        );
        if (!card.rows[0]) throw new NotFoundError("No unused gift card with that code");
        await tx.query("UPDATE wallets SET balance_cents = balance_cents + $1 WHERE user_id = $2", [card.rows[0].amount_cents, userId]);
        return card.rows[0].amount_cents;
      });
    },

    async transfer(fromUserId: number, input: unknown): Promise<void> {
      const { to, amountCents } = Transfer.parse(input);
      if (to === fromUserId) throw new ValidationError("You cannot send money to yourself");
      await db.transaction(async (tx) => {
        const debit = await tx.query(
          "UPDATE wallets SET balance_cents = balance_cents - $1 WHERE user_id = $2 AND balance_cents >= $1",
          [amountCents, fromUserId],
        );
        if (!debit.affectedRows) throw new ConflictError("Not enough money in your wallet");
        const credit = await tx.query("UPDATE wallets SET balance_cents = balance_cents + $1 WHERE user_id = $2", [amountCents, to]);
        if (!credit.affectedRows) throw new NotFoundError(`No wallet for user ${to}`);
      });
    },
  };
}
```

The HTTP layer only reads, authenticates and delegates. There is no route that takes a user id any more: `/wallets/me` means "the caller".

fixed-server.tsNode.js only

```ts
import { ValidationError } from "@zudojs/errors";
import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
  createRouter,
  type HttpRequestContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { createWallets } from "./wallets.js";

function body(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw new ValidationError("The body must be JSON");
  }
}

export function createFixedServer(wallets: ReturnType<typeof createWallets>) {
  const router = createRouter();
  const me = (ctx: HttpRouterContext) => wallets.authenticate(ctx.request.getHeader("authorization"));

  router.get("/giftcards/:code", async (ctx) => createResponseContext().json(await wallets.card(ctx.params["code"])));
  router.get("/wallets/me", async (ctx) => createResponseContext().json({ balanceCents: await wallets.balance(await me(ctx)) }));
  router.post("/giftcards/redeem", async (ctx) => {
    const creditedCents = await wallets.redeem(await me(ctx), body(ctx));
    return createResponseContext().json({ creditedCents });
  });
  router.post("/wallets/transfer", async (ctx) => {
    await wallets.transfer(await me(ctx), body(ctx));
    return createResponseContext().json({ ok: true });
  });

  return createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
  });
}
```

The same attacks, against the fixed server:

try-again.tsNode.js only

```ts
import { createDatabase } from "./db.js";
import { createFixedServer } from "./fixed-server.js";
import { createWallets } from "./wallets.js";

const { db, tokens } = await createDatabase();
const server = createFixedServer(createWallets(db));
await server.start();

async function call(method: string, path: string, data?: unknown, token?: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${server.address?.port}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return `${response.status} ${await response.text()}`;
}
const balances = async () => {
  const { rows } = await db.query<{ user_id: number; balance_cents: number }>("SELECT user_id, balance_cents FROM wallets ORDER BY user_id");
  return rows.map((row) => `user ${row.user_id}: ${row.balance_cents}`).join(", ");
};

console.log("start:", await balances());
console.log("1.", await call("POST", "/giftcards/redeem", { code: "GIFT-ADA-5000" }, tokens.ada));
console.log("2.", await call("GET", `/giftcards/${encodeURIComponent("x' OR '1'='1")}`));
console.log("3.", await call("POST", "/giftcards/redeem", { code: "GIFT-LINUS-2000", userId: 1 }));
console.log("4.", await call("POST", "/wallets/transfer", { to: 2, amountCents: -3000 }, tokens.ada));
console.log("5.", await call("POST", "/wallets/transfer", { to: 99, amountCents: 1000 }, tokens.linus));
console.log("6.", await call("GET", "/wallets/me"));
console.log("7.", await call("POST", "/giftcards/redeem", { code: "GIFT-ADA-5000" }, tokens.ada));
console.log("end:", await balances());
await server.stop();
await db.close();
```

Output of `npx tsx try-again.ts`

```ts
start: user 1: 1000, user 2: 1000
1. 200 {"creditedCents":5000}
2. 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
3. 401 {"error":"Log in first","code":"ERR_AUTHENTICATION_FAILED"}
4. 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
5. 404 {"error":"No wallet for user 99","code":"ERR_RESOURCE_NOT_FOUND"}
6. 401 {"error":"Log in first","code":"ERR_AUTHENTICATION_FAILED"}
7. 404 {"error":"No unused gift card with that code","code":"ERR_RESOURCE_NOT_FOUND"}
end: user 1: 6000, user 2: 1000
```

- **2.** The injection string does not look like a gift code, so the schema refused it with 400. Even without the schema, the parameterized query would have looked for a card literally named `x' OR '1'='1` and answered 404.
- **3, 6.** Without a session token: 401. The `userId` in the body is simply ignored.
- **4.** A negative amount: 400, and nobody's money moved.
- **5.** The debit from Linus happened inside the transaction, the credit found no wallet, the `NotFoundError` rolled both back: 404, and Linus still has 10.00.
- **7.** The second redemption of the same card found no *unused* card: 404. The money adds up: 10.00 + 10.00 + 50.00 = 70.00.

## Before you trust the fix

REASON IT OUT

### Why does folding the check into the UPDATE close the race, and does the fix need a test to prove it?

The original code ran a `SELECT` for an unused card, then a separate `UPDATE`. Two redemptions of the same code sent together could both pass that `SELECT` before either `UPDATE` ran, so the card would pay twice. The fix folds the check into the `UPDATE` itself. Why does that close the race, and is reading the code enough, or do you still need a test that fires two redemptions at once?

**Show the reasoning**

`UPDATE gift_cards SET redeemed_by = $1 WHERE code = $2 AND redeemed_by IS NULL RETURNING amount_cents` is one atomic statement: PostgreSQL locks the row for whichever request's `UPDATE` reaches it first, and the second request's `UPDATE` now matches `redeemed_by IS NULL` against a row that already has a redeemer, so it claims zero rows and throws `NotFoundError`. Reading the code is a hypothesis, not proof: a test that calls `redeem` twice with `Promise.allSettled` and asserts exactly one call is fulfilled is what turns "this should close the race" into a fact — the test Step 4 asks you to write.

## Step 4: prove it with tests

TRY IT YOURSELF

### One test per incident

Write Vitest tests for the wallet module. Give every test a fresh database, so tests cannot affect each other. Include the race: redeem the same card twice *at the same time* with `Promise.allSettled`, and require exactly one success.

**Show a solution**

wallets.test.ts

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase } from "./db.js";
import { createWallets } from "./wallets.js";

let db: PGlite;
let wallets: ReturnType<typeof createWallets>;

beforeEach(async () => {
  ({ db } = await createDatabase());
  wallets = createWallets(db);
});
afterEach(() => db.close());

describe("wallets", () => {
  it("credits a gift card once, even when it is redeemed twice at the same time", async () => {
    const results = await Promise.allSettled([
      wallets.redeem(1, { code: "GIFT-ADA-5000" }),
      wallets.redeem(1, { code: "GIFT-ADA-5000" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await wallets.balance(1)).toBe(6000);
  });

  it("keeps the sender's money when the receiver does not exist", async () => {
    await expect(wallets.transfer(2, { to: 99, amountCents: 1000 })).rejects.toThrow("No wallet for user 99");
    expect(await wallets.balance(2)).toBe(1000);
  });

  it("refuses negative and oversized amounts", async () => {
    await expect(wallets.transfer(1, { to: 2, amountCents: -3000 })).rejects.toThrow("Validation failed");
    await expect(wallets.transfer(1, { to: 2, amountCents: 5000 })).rejects.toThrow("Not enough money");
  });

  it("treats SQL in a gift card code as an invalid code", async () => {
    await expect(wallets.card("x' OR '1'='1")).rejects.toThrow("Validation failed");
  });

  it("rejects a missing or unknown session token", async () => {
    await expect(wallets.authenticate(undefined)).rejects.toThrow("Log in first");
    await expect(wallets.authenticate("Bearer not-a-real-token")).rejects.toThrow("Log in first");
  });
});
```

Terminal on your computer

```bash
$ npx vitest run --reporter=verbose

 RUN  v5.0.1 ~/giftcards

 ✓ wallets.test.ts > wallets > credits a gift card once, even when it is redeemed twice at the same time 6553ms
 ✓ wallets.test.ts > wallets > keeps the sender's money when the receiver does not exist 3854ms
 ✓ wallets.test.ts > wallets > refuses negative and oversized amounts 3962ms
 ✓ wallets.test.ts > wallets > treats SQL in a gift card code as an invalid code 3637ms
 ✓ wallets.test.ts > wallets > rejects a missing or unknown session token 4245ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  15:25:20
   Duration  23.43s (tests 96%, import 3%, transform 1%)
```

Most of each test's time is starting a fresh PGlite database, and these times come from a busy machine; yours will be faster. To check that the tests really protect you, point them at the old logic for a moment: the race test and the transfer test must fail.

## Step 5: make it production-ready

The rest of the checklist uses what you built in the capstone and the production lessons. Each exercise lists what "done" means and where to look; the solutions describe the approach rather than giving code.

TRY IT YOURSELF

### Events, queues, caching and abuse protection

After a successful redemption or transfer, publish `wallet.credited` and queue a confirmation e-mail. Rate-limit the code endpoints. Decide what, if anything, to cache.

**Show a solution**

- Publish from the HTTP layer or the module *after* `db.transaction` returns, never inside it, exactly like `order.placed` in the capstone. For no lost events, write an outbox row inside the transaction instead.
- A subscriber adds a `send-confirmation` job with `attempts` and exponential `backoff`. The job carries ids and amounts only, never the gift code.
- Use two `createRateLimiter` instances, keyed by IP and by user id. Count failed redemptions per user and refuse further attempts for 15 minutes after ten.
- Do not cache balances: they must always be exact, and the query is a primary-key lookup that is already fast. Caching card lookups would mostly help attackers who guess codes.

TRY IT YOURSELF

### Observability, audit and OpenAPI

Make every money movement traceable and every route documented.

**Show a solution**

- Add a `ledger` table (who, what, amount, related card or user, time) and insert one row per movement *inside* the same transaction. A ledger that can disagree with the balances is worse than none.
- Log one JSON line per request with the request id, route, status and duration. Log user ids, never tokens or gift codes: the logger's redaction does not know that `code` is secret here, so leave it out yourself.
- Count `wallet.redeemed`, `wallet.transfer` and `wallet.failed` (labelled with the error code, not the user) and record transfer latency in a histogram.
- Describe the routes with the router's `openapi` option or `@zudojs/openapi`, reusing the same schemas the routes parse with, so the document cannot drift from the code.

TRY IT YOURSELF

### Configure, deploy, monitor and handle failures

Ship it, and decide what happens when things go wrong at 3 a.m.

**Show a solution**

- Swap PGlite for a `pg` pool from `DATABASE_URL`, checked at startup. Turn the table definitions into numbered migrations, run by `docker compose run --rm app node dist/migrate.js` before each release.
- Add `/health` and `/ready` (database check), graceful shutdown and statement timeouts. Run with Docker Compose behind Caddy, with the readiness check wired to the proxy's health checks, and a nightly backup that you have restored once.
- Alert when `wallet.failed` rises above its normal rate, when p95 latency of transfers exceeds 500 ms, and when `/ready` fails. Each alert links to a short runbook: what it means, how to check, how to fix.
- Rerun the real parallel-redemption test against real PostgreSQL in CI, where transactions really run at the same time. PGlite runs one transaction at a time and is gentler than production.

## You are now ready to build with ZudoJS

Look at the distance you have covered. You started with `console.log("Hello")`. You learned JavaScript, Node.js, how the web and databases work, and TypeScript. You built a backend with no framework and felt why frameworks exist. Then you built the Task API and ShopFlow with ZudoJS: modules and a runtime, dependency injection, routing and middleware, configuration, validation, errors, databases and transactions, authentication, permissions and security, caching, events, queues, CQRS, services, tests and observability. And in these last lessons you took an app to production and learned to judge someone else's code by what it does under attack, not in the demo.

- Every input is validated, every query is parameterized, every identity comes from a verified session, and every permission is checked where the user is known.
- Every unit of work is one transaction, and side effects happen after it commits.
- Every rule that matters has a test that would fail without it.
- Every production app has configuration checks, logs, metrics, health checks, graceful shutdown, backups you have restored, and a way back.

Where to go next: finish the ShopFlow milestones; read the [ZudoJS package documentation](https://zudojs.oyinlola.site/docs/packages.md) for the packages you use most; build something of your own, small, and put it on a real server. When a lesson or a package surprises you, that is worth reporting; frameworks get better because their users say where they hurt.

**You are now ready to build with ZudoJS.**

## Recap

- Working in a demo is not the same as working in production. Attack your own endpoints the way the internet will.
- The inherited app had SQL injection, identity taken from the request, no authorization, no validation, two-step writes without a transaction, a check-then-act race, and no tests.
- The fix moved rules into a module, validated every input with a schema, used parameters in every query, took the user only from the session, claimed the card and moved money in single transactions with conditional updates, and proved each fix with a test.
- Events, queues, rate limits, a ledger, logs, metrics, OpenAPI, configuration, health checks and a deployment finish the job.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
