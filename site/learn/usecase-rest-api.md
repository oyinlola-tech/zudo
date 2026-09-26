---
title: "Use case: a REST API for users, products and orders — ZudoJS Academy"
description: "Build Oja Market's public API from a product brief: resources and status codes, schemas, JWT access, keyset pagination, OpenAPI and contract tests."
source: https://zudojs.oyinlola.site/learn/usecase-rest-api
---

LEVEL 19 · LESSON 1 OF 10

Real-world use cases Production

# Use case: a REST API for users, products and orders

Build Oja Market's public API from a product brief: resources and status codes, schemas, JWT access, keyset pagination, OpenAPI and contract tests.

- **60 min** to read and try
- **You need:** The ZudoJS lessons on HTTP, validation, databases, authentication and OpenAPI, plus Idempotency and safe retries
- **You build:** Oja Market's versioned REST API on PostgreSQL, with bearer tokens, signed cursors, one error shape, a published OpenAPI 3.1 document and a Vitest suite that checks responses against it

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn a product brief into resources, URLs, methods and status codes before writing code
- Decide what the database must guarantee and what a request may be trusted with
- Build a versioned API with @zudojs/http, @zudojs/schema, @zudojs/database and @zudojs/auth where every error has one shape
- Serve stable keyset pagination with signed cursors
- Publish an OpenAPI document from the routes and test real responses against it
- List the failure cases and production concerns of a public API

## The brief: an API other people depend on

**Oja Market** sells groceries in Lagos. Until now its only client was its own website. Next month a mobile app ships, and two partner shops will list Oja's products on their own sites. The partners tried the old endpoints and sent back this list:

1. `/getProducts?page=2` sometimes shows a product we already saw on page 1.
2. A failed order returned status 200 with `{"ok": false}`, so our code thought it worked.
3. Errors come back in four different shapes.
4. Your docs say prices are in naira. The API sends kobo.
5. One of our test accounts could see another account's orders by changing the number in the URL.

Every item is a design mistake, not a typo. This lesson builds the replacement: a **REST API** (resources addressed by URLs, changed with HTTP methods, answered with honest status codes) that a stranger can use from its documentation alone. The product owner's brief:

| Area | Requirement |
| --- | --- |
| Users | Anyone can register and get an access token. Every account starts as a customer; admins are made by Oja staff. |
| Products | Anyone can browse, filter by category and page through the catalogue. Only admins add or change products. |
| Orders | A signed-in customer orders several products at once, sees only their own orders, and can cancel an order, which puts the stock back. |
| Contract | One error shape everywhere. Money in integer kobo, documented as such. An OpenAPI document generated from the code, and tests that fail when the code and the document disagree. |

You have met every tool before, so this lesson does not re-teach them. It links back instead: [@zudojs/http](https://zudojs.oyinlola.site/learn/zudo-http), [routing](https://zudojs.oyinlola.site/learn/zudo-routing), [validation](https://zudojs.oyinlola.site/learn/zudo-validation), [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database), [@zudojs/auth](https://zudojs.oyinlola.site/learn/zudo-auth), [errors](https://zudojs.oyinlola.site/learn/zudo-errors) and [OpenAPI](https://zudojs.oyinlola.site/learn/zudo-openapi). What is new is putting them together from a brief, and the decisions in between. [ShopFlow](https://zudojs.oyinlola.site/learn/capstone-shopflow), the capstone, goes deep on sessions, caching and checkout concurrency; this API focuses on the *contract* with outside clients.

## Design the resources before the code

REASON IT OUT

### Resources, URLs and status codes

Write down the endpoint table before any code. For each requirement, ask:

- What are the **resources** (the nouns), and which URL names each one?
- Which HTTP method fits each action? "Log in" and "cancel an order" are not create/read/update/delete: how do you model them?
- What does a success answer? What does each kind of failure answer, and can the client tell them apart by the status alone?
- Who may call it: anyone, any signed-in user, the owner, or an admin?
- How will you change the API next year without breaking the mobile app that nobody updated?

**Show the reasoning**

The nouns are users, products and orders. Two actions need a thought. Logging in *creates* something, an access token, so it is `POST /tokens`. Cancelling changes an order's state and has a side effect (the stock goes back), so it is a small **action resource**, `POST /orders/{id}/cancel`. A `PATCH {"status": "cancelled"}` would also work, but then the client could try `{"status": "placed"}` too, and you would have to forbid every transition but one.

Put a version in the path, `/v1`, as in [Pagination and versioning](https://zudojs.oyinlola.site/learn/api-pagination-versioning). A breaking change becomes `/v2` and the old app keeps working.

| Method and path | Who | Success | Failures |
| --- | --- | --- | --- |
| `POST /v1/users` | anyone | 201 + `Location` | 400 invalid, 409 e-mail taken |
| `POST /v1/tokens` | anyone | 200 token | 400, 401 wrong e-mail or password, 429 too many tries |
| `GET /v1/users/me` | signed in | 200 | 401 |
| `GET /v1/products` | anyone | 200 page + next cursor | 400 bad filter or cursor |
| `GET /v1/products/{id}` | anyone | 200 | 400, 404 |
| `POST` / `PATCH /v1/products…` | admin | 201 / 200 | 400, 401, 403, 404, 409 SKU taken |
| `POST /v1/orders` | signed in | 201 + `Location` | 400, 401, 409 out of stock, 422 unknown product |
| `GET /v1/orders`, `GET /v1/orders/{id}` | owner | 200 | 401, 404 (also for someone else's order) |
| `POST /v1/orders/{id}/cancel` | owner | 200, also when already cancelled | 401, 404 |

Three status codes carry decisions. **404, not 403, for someone else's order**: a 403 would confirm that order 1234 exists (partner complaint 5). **409 vs 422**: "out of stock" conflicts with the current state and may succeed later, so 409; an unknown product id will never succeed, so 422. **Cancel twice gives 200**: the order *is* cancelled, which is what the client wanted, so a retry after a lost response is harmless. That is a naturally idempotent action, from [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency).

## The data model

REASON IT OUT

### What must the database guarantee?

Before the SQL: which rules must hold even if a future version of the code has a bug? Think about money, stock, prices that change after an order, duplicate e-mails, and which queries will run most often.

**Show the reasoning**

- **Money is integer kobo** (₦12,500 is `1250000`), with `CHECK (price_kobo > 0)`. Floating-point naira is how `0.1 + 0.2` becomes a support ticket ([Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math)). An `integer` column holds up to about ₦21 million, plenty for a grocery order; a bank would use `bigint`.
- **Stock never goes negative**: `CHECK (stock >= 0)` is the last line of defence behind the code's conditional `UPDATE`.
- **An order keeps the price it was sold at.** `order_lines.price_kobo` is a copy, so raising the rice price tomorrow does not change yesterday's receipt.
- **E-mails and SKUs are unique**, enforced by the database. Checking in code first ("SELECT, then INSERT") has a race; the `UNIQUE` constraint does not.
- **Indexes follow the queries**: orders are always read by owner, and the catalogue is paged by category and id, so `(user_id, id)` and `(category, id)`.

The database is PGlite, the real PostgreSQL inside Node.js. The client is `@zudojs/database`'s `DatabaseClient`, so you get its migration runner, transactions and error mapping. [The database lesson](https://zudojs.oyinlola.site/learn/zudo-database#adapter) wrote a full Prisma-style adapter for PGlite; this API writes plain SQL, so it needs only the raw half of that adapter: four methods, plus the translation of PostgreSQL's error codes that turns a duplicate e-mail into a 409.

db.ts

```ts
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { createDatabaseClient, createMigrationRunner, noopDatabaseLogger } from "@zudojs/database";
import type { DatabaseClient, DatabaseTransactionContext, Migration, PrismaClientLike } from "@zudojs/database";

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

const SCHEMA = [
  `CREATE TABLE users (
     id serial PRIMARY KEY,
     email text NOT NULL UNIQUE,
     name text NOT NULL,
     password_hash text NOT NULL,
     role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')))`,
  `CREATE TABLE products (
     id serial PRIMARY KEY,
     sku text NOT NULL UNIQUE,
     name text NOT NULL,
     category text NOT NULL,
     price_kobo integer NOT NULL CHECK (price_kobo > 0),
     stock integer NOT NULL CHECK (stock >= 0))`,
  `CREATE TABLE orders (
     id serial PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users (id),
     status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'cancelled')),
     total_kobo integer NOT NULL CHECK (total_kobo > 0),
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE order_lines (
     order_id integer NOT NULL REFERENCES orders (id),
     product_id integer NOT NULL REFERENCES products (id),
     quantity integer NOT NULL CHECK (quantity > 0),
     price_kobo integer NOT NULL,
     PRIMARY KEY (order_id, product_id))`,
  "CREATE INDEX orders_user_idx ON orders (user_id, id)",
  "CREATE INDEX products_category_idx ON products (category, id)",
];

const migrations: Migration[] = [
  {
    version: 1,
    name: "create-market",
    up: async (tx) => {
      for (const statement of SCHEMA) await tx.$executeRawUnsafe(statement);
    },
  },
];

export async function openDatabase(): Promise<DatabaseClient> {
  const pg = new PGlite();
  const prisma: PrismaClientLike = {
    ...rawSql(pg),
    $connect: async () => { await pg.waitReady; },
    $disconnect: async () => { if (!pg.closed) await pg.close(); },
    $transaction: <T>(work: (tx: DatabaseTransactionContext) => Promise<T>) => pg.transaction((tx) => work(rawSql(tx))),
  };
  const client = createDatabaseClient({ prisma, logger: noopDatabaseLogger });
  await client.connect();
  await createMigrationRunner(client, migrations).migrate();
  return client;
}
```

PGlite's `query` runs one statement at a time, which is why the migration loops over a list. Check that the tables exist and that the database refuses bad data on its own:

tables.tsNode.js only

```ts
import { openDatabase } from "./db.js";

const db = await openDatabase();
const tables = await db.queryRawUnsafe<{ name: string }[]>(
  "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
);
console.log(tables.map((t) => t.name));

const broken = [
  "INSERT INTO products (sku, name, category, price_kobo, stock) VALUES ('rice-5kg', 'Rice', 'grains', 0, 5)",
  "INSERT INTO products (sku, name, category, price_kobo, stock) VALUES ('rice-5kg', 'Rice', 'grains', 1250000, -1)",
];
for (const sql of broken) {
  try {
    await db.executeRawUnsafe(sql);
  } catch (error) {
    console.log("refused:", (error as Error).message);
  }
}
await db.disconnect();
```

Output of `npx tsx tables.ts`

```json
[ '_migrations', 'order_lines', 'orders', 'products', 'users' ]
refused: new row for relation "products" violates check constraint "products_price_kobo_check"
refused: new row for relation "products" violates check constraint "products_stock_check"
```

## The contract: schemas in and out

Every input gets a schema from `@zudojs/schema`, and so does every output. The output schemas are an **allow-list**: they say which fields a client may ever see, and the OpenAPI document is generated from the same objects, so documentation and code cannot drift apart (partner complaint 4).

schemas.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const CATEGORIES = ["grains", "drinks", "spices", "household"] as const;

/* What clients send. */
export const Register = schema.object({
  email: schema.string().trim().toLowerCase().email().max(254),
  name: schema.string().trim().min(1).max(80),
  password: schema.string().min(12).max(128),
});
export const Login = schema.object({
  email: schema.string().trim().toLowerCase().max(254),
  password: schema.string().min(1).max(128),
});
export const NewProduct = schema.object({
  sku: schema.string().regex(/^[a-z0-9-]{3,40}$/),
  name: schema.string().trim().min(2).max(100),
  category: schema.enum(CATEGORIES),
  priceKobo: schema.number().int().min(1).max(10_000_000),
  stock: schema.number().int().min(0).max(100_000),
});
export const ProductPatch = NewProduct.omit(["sku"]).partial().strict();
export const ProductQuery = schema.object({
  category: schema.optional(schema.enum(CATEGORIES)),
  limit: schema.default(schema.coerce.number().int().min(1).max(50), 20),
  cursor: schema.optional(schema.string().max(200)),
});
export const IdParams = schema.object({ id: schema.coerce.number().int().min(1).max(2_147_483_647) });
export const NewOrder = schema.object({
  items: schema
    .array(schema.object({ productId: schema.number().int().min(1), quantity: schema.number().int().min(1).max(10) }))
    .min(1)
    .max(20),
});

/* What the API sends back: allow-lists, so internal columns never leak. */
export const UserOut = schema.object({
  id: schema.number().int(),
  email: schema.string(),
  name: schema.string(),
  role: schema.enum(["customer", "admin"] as const),
});
export const ProductOut = schema.object({
  id: schema.number().int(),
  sku: schema.string(),
  name: schema.string(),
  category: schema.enum(CATEGORIES),
  priceKobo: schema.number().int(),
  stock: schema.number().int(),
});
export const ProductPage = schema.object({
  data: schema.array(ProductOut),
  nextCursor: schema.nullable(schema.string()),
});
export const OrderOut = schema.object({
  id: schema.number().int(),
  status: schema.enum(["placed", "cancelled"] as const),
  totalKobo: schema.number().int(),
  items: schema.array(schema.object({ productId: schema.number().int(), quantity: schema.number().int(), priceKobo: schema.number().int() })),
});
export const OrderList = schema.array(OrderOut);
export const TokenOut = schema.object({ accessToken: schema.string(), tokenType: schema.string(), expiresIn: schema.number().int() });
export const ErrorOut = schema.object({
  error: schema.object({
    code: schema.string(),
    message: schema.string(),
    issues: schema.optional(schema.array(schema.object({ path: schema.string(), message: schema.string() }))),
    requestId: schema.optional(schema.string()),
  }),
});

export type UserOut = Infer<typeof UserOut>;
export type ProductOut = Infer<typeof ProductOut>;
export type OrderOut = Infer<typeof OrderOut>;
```

Try the schemas on the inputs a real client sends, good and bad:

schemas-demo.tsNode.js only

```ts
import type { Schema } from "@zudojs/schema";
import { NewOrder, ProductPatch, ProductQuery, Register, UserOut } from "./schemas.js";

function show(label: string, schema: Schema<unknown>, input: unknown): void {
  const result = schema.safeParse(input);
  const text = result.success
    ? JSON.stringify(result.data)
    : result.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`).join("; ");
  console.log(`${label.padEnd(18)} ${text}`);
}

show("register", Register, { email: " Ada@Example.com ", name: "Ada", password: "ada's long passphrase", role: "admin" });
show("query strings", ProductQuery, { category: "drinks", limit: "5" });
show("query defaults", ProductQuery, {});
show("query too big", ProductQuery, { limit: "5000" });
show("patch", ProductPatch, { priceKobo: 0, sku: "cheap" });
show("order", NewOrder, { items: [{ productId: 1, quantity: 11 }] });
show("user out", UserOut, { id: 1, email: "ada@example.com", name: "Ada", role: "customer", password_hash: "scrypt$..." });
```

Output of `npx tsx schemas-demo.ts`

```ts
register           {"email":"ada@example.com","name":"Ada","password":"ada's long passphrase"}
query strings      {"category":"drinks","limit":5}
query defaults     {"limit":20}
query too big      limit: Expected <= 50, received 5000
patch              priceKobo: Expected >= 1, received 0; (body): Unknown key: sku
order              items.0.quantity: Expected <= 10, received 11
user out           {"id":1,"email":"ada@example.com","name":"Ada","role":"customer"}
```

- The `role` a client slipped into its registration is dropped. Object schemas strip unknown keys, so the server alone decides roles.
- Query strings arrive as strings; `schema.coerce.number()` turns `"5"` into `5`, and `schema.default` fills in 20. A limit of 5000 is refused: a client must not be able to ask for the whole table in one request.
- `ProductPatch` is `NewProduct` without `sku`, every field optional, and `.strict()`: an unknown key is an error instead of being silently ignored. A client that sends `sku` learns immediately that SKUs cannot change.
- `UserOut` drops `password_hash`, however the row was loaded.

## Accounts and access tokens

REASON IT OUT

### What can a request be trusted with?

A request carries a body, a path, a query string and an `Authorization` header. Which parts may decide *who* is calling and *what they may do*? The access token is a signed JWT with the user id in `sub`. Should it also carry the role, and should the server believe it?

**Show the reasoning**

Nothing in the body, path or query decides identity or permissions: a user id, a role or a price there is just a claim. The token is different: it is signed with a secret only the server knows, so a valid signature proves the server issued it and nobody changed it. Trust its `sub`.

The role is a design choice. If it lives in the token, a demoted admin keeps admin rights until the token expires, up to 15 minutes. If it is read from the database on every request, a change takes effect at once, for the cost of one primary-key lookup. Oja chooses the lookup, which also rejects tokens of deleted accounts. Revoking tokens before they expire needs sessions, which [the next lesson](https://zudojs.oyinlola.site/learn/usecase-auth-platform) builds.

`createUsers` registers, logs in and provides the `requireUser` middleware. Passwords are hashed with `hashPassword`, and tokens come from `createTokenPair` and are checked with `verifyAccessToken`, as in [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth#jwt):

users.ts

```ts
import { createTokenPair, hashPassword, parseBearerToken, toUserId, verifyAccessToken, verifyPassword } from "@zudojs/auth";
import type { TokenConfig } from "@zudojs/auth";
import type { DatabaseClient } from "@zudojs/database";
import { AuthenticationError, AuthorizationError, ConflictError } from "@zudojs/errors";
import type { HttpMiddleware, HttpRouterContext } from "@zudojs/http";
import { Login, Register, UserOut } from "./schemas.js";

const USER_COLUMNS = "id, email, name, role";

export function createUsers(db: DatabaseClient, tokens: TokenConfig) {
  const decoy = hashPassword("decoy password for unknown e-mails");

  /** Middleware: a valid access token, and a user that still exists. */
  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader("authorization"));
    const result = token === null ? null : verifyAccessToken(token, tokens);
    if (!result?.valid || result.payload === undefined) throw new AuthenticationError("Send a valid access token");
    const [user] = await db.queryRawUnsafe<UserOut[]>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      Number(result.payload.sub),
    ]);
    if (!user) throw new AuthenticationError("Send a valid access token");
    ctx.state.set("user", user);
    return next();
  };

  return {
    requireUser,

    async register(input: unknown): Promise<UserOut> {
      const { email, name, password } = Register.parse(input);
      const rows = await db.queryRawUnsafe<UserOut[]>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING RETURNING ${USER_COLUMNS}`,
        [email, name, await hashPassword(password)],
      );
      if (!rows[0]) throw new ConflictError("An account with this e-mail already exists");
      return UserOut.parse(rows[0]);
    },

    async login(input: unknown) {
      const { email, password } = Login.parse(input);
      const [row] = await db.queryRawUnsafe<{ id: number; password_hash: string }[]>(
        "SELECT id, password_hash FROM users WHERE email = $1",
        [email],
      );
      const valid = await verifyPassword(password, row?.password_hash ?? (await decoy));
      if (!row || !valid) throw new AuthenticationError("Wrong e-mail or password");
      const pair = createTokenPair(toUserId(String(row.id)), tokens);
      return { accessToken: pair.accessToken, tokenType: pair.tokenType, expiresIn: pair.expiresIn };
    },
  };
}

export function currentUser(ctx: HttpRouterContext): UserOut {
  const user = ctx.state.get("user") as UserOut | undefined;
  if (!user) throw new Error("requireUser is missing on this route");
  return user;
}

export function requireAdmin(ctx: HttpRouterContext): UserOut {
  const user = currentUser(ctx);
  if (user.role !== "admin") throw new AuthorizationError("Only admins may do this");
  return user;
}
```

- An unknown e-mail still costs one password check against a **decoy** hash, so "no such account" and "wrong password" take the same time and give the same answer.
- `ON CONFLICT (email) DO NOTHING` turns a duplicate into an empty result instead of a race: two registrations with the same e-mail at the same moment cannot both succeed.
- `currentUser` throws if a route forgot `requireUser`. A forgotten check becomes a loud 500 in your tests, not a silent "anyone may".

## Products and orders

The catalogue uses **keyset pagination**: "the next 20 products after id 57", not "page 3". Offset pages shift when a product is added while a client pages, which is exactly partner complaint 1. The position travels as a **cursor** signed with `encodeCursor` from `@zudojs/database`, so a client cannot edit it ([pagination](https://zudojs.oyinlola.site/learn/zudo-database#pagination) explains the format):

products.ts

```ts
import type { DatabaseClient } from "@zudojs/database";
import { decodeCursor, encodeCursor } from "@zudojs/database";
import { NotFoundError } from "@zudojs/errors";
import { NewProduct, ProductOut, ProductPatch, ProductQuery } from "./schemas.js";

const SELECT = `SELECT id, sku, name, category, price_kobo AS "priceKobo", stock FROM products`;

export function createProducts(db: DatabaseClient, cursorSecret: string) {
  return {
    async list(query: unknown) {
      const { category, limit, cursor } = ProductQuery.parse(query);
      const after = cursor === undefined ? 0 : decodeCursor<{ id: number }>(cursor, { secret: cursorSecret, allowedFields: ["id"] }).id;
      const rows = await db.queryRawUnsafe<ProductOut[]>(
        `${SELECT} WHERE ($1::text IS NULL OR category = $1) AND id > $2 ORDER BY id LIMIT $3`,
        [category ?? null, after, limit + 1],
      );
      const data = rows.slice(0, limit);
      const last = data.at(-1);
      const nextCursor = rows.length > limit && last ? encodeCursor({ id: last.id }, { secret: cursorSecret }) : null;
      return { data, nextCursor };
    },

    async get(id: number): Promise<ProductOut> {
      const [row] = await db.queryRawUnsafe<ProductOut[]>(`${SELECT} WHERE id = $1`, [id]);
      if (!row) throw new NotFoundError(`Product ${id} not found`);
      return row;
    },

    async create(input: unknown): Promise<ProductOut> {
      const p = NewProduct.parse(input);
      const [row] = await db.queryRawUnsafe<ProductOut[]>(
        `INSERT INTO products (sku, name, category, price_kobo, stock) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sku, name, category, price_kobo AS "priceKobo", stock`,
        [p.sku, p.name, p.category, p.priceKobo, p.stock],
      );
      return row!;
    },

    async update(id: number, input: unknown): Promise<ProductOut> {
      const patch = ProductPatch.parse(input);
      const [row] = await db.queryRawUnsafe<ProductOut[]>(
        `UPDATE products SET name = COALESCE($2, name), category = COALESCE($3, category),
           price_kobo = COALESCE($4, price_kobo), stock = COALESCE($5, stock)
         WHERE id = $1 RETURNING id, sku, name, category, price_kobo AS "priceKobo", stock`,
        [id, patch.name ?? null, patch.category ?? null, patch.priceKobo ?? null, patch.stock ?? null],
      );
      if (!row) throw new NotFoundError(`Product ${id} not found`);
      return row;
    },
  };
}
```

Asking for `limit + 1` rows is a small trick: if the extra row exists, there is a next page, and no `count(*)` over the whole table is needed.

Orders are where money moves, so every rule from the reasoning shows up here. Each line takes its stock with one conditional `UPDATE … WHERE stock >= $1`, and the price comes from that same statement, never from the request. Everything runs in one `withTransaction` ([transactions](https://zudojs.oyinlola.site/learn/zudo-database#transactions)), so a failing third line undoes the first two:

orders.ts

```ts
import type { DatabaseClient } from "@zudojs/database";
import { withTransaction } from "@zudojs/database";
import { ConflictError, DomainError, NotFoundError } from "@zudojs/errors";
import { NewOrder, type OrderOut } from "./schemas.js";

interface Line { productId: number; quantity: number; priceKobo: number }

export function createOrders(db: DatabaseClient) {
  async function load(userId: number, orderId: number): Promise<OrderOut> {
    const [order] = await db.queryRawUnsafe<{ id: number; status: OrderOut["status"]; totalKobo: number }[]>(
      `SELECT id, status, total_kobo AS "totalKobo" FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    if (!order) throw new NotFoundError(`Order ${orderId} not found`);
    const items = await db.queryRawUnsafe<Line[]>(
      `SELECT product_id AS "productId", quantity, price_kobo AS "priceKobo" FROM order_lines WHERE order_id = $1 ORDER BY product_id`,
      [orderId],
    );
    return { ...order, items };
  }

  return {
    load,

    async place(userId: number, input: unknown): Promise<OrderOut> {
      const { items } = NewOrder.parse(input);
      const ids = items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length) throw new DomainError("List each product once", { code: "DUPLICATE_ITEM" });

      const orderId = await withTransaction(db, async (tx) => {
        const lines: Line[] = [];
        for (const { productId, quantity } of items) {
          const [taken] = await tx.$queryRawUnsafe<{ price_kobo: number }[]>(
            "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING price_kobo",
            quantity, productId,
          );
          if (!taken) {
            const [exists] = await tx.$queryRawUnsafe<unknown[]>("SELECT 1 FROM products WHERE id = $1", productId);
            if (!exists) throw new DomainError(`Product ${productId} does not exist`, { code: "UNKNOWN_PRODUCT" });
            throw new ConflictError(`Not enough stock for product ${productId}`);
          }
          lines.push({ productId, quantity, priceKobo: taken.price_kobo });
        }
        const total = lines.reduce((sum, line) => sum + line.priceKobo * line.quantity, 0);
        const [order] = await tx.$queryRawUnsafe<{ id: number }[]>(
          "INSERT INTO orders (user_id, total_kobo) VALUES ($1, $2) RETURNING id", userId, total,
        );
        for (const line of lines) {
          await tx.$executeRawUnsafe(
            "INSERT INTO order_lines (order_id, product_id, quantity, price_kobo) VALUES ($1, $2, $3, $4)",
            order!.id, line.productId, line.quantity, line.priceKobo,
          );
        }
        return order!.id;
      });
      return load(userId, orderId);
    },

    async listMine(userId: number) {
      const rows = await db.queryRawUnsafe<{ id: number }[]>("SELECT id FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 50", [userId]);
      return Promise.all(rows.map((row) => load(userId, row.id)));
    },

    async cancel(userId: number, orderId: number): Promise<OrderOut> {
      await withTransaction(db, async (tx) => {
        const [order] = await tx.$queryRawUnsafe<{ id: number }[]>(
          "UPDATE orders SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'placed' RETURNING id",
          orderId, userId,
        );
        if (!order) {
          const [mine] = await tx.$queryRawUnsafe<unknown[]>("SELECT 1 FROM orders WHERE id = $1 AND user_id = $2", orderId, userId);
          if (!mine) throw new NotFoundError(`Order ${orderId} not found`);
          return; // already cancelled: nothing to do, and no stock goes back twice
        }
        await tx.$executeRawUnsafe(
          "UPDATE products p SET stock = p.stock + l.quantity FROM order_lines l WHERE l.order_id = $1 AND p.id = l.product_id",
          orderId,
        );
      });
      return load(userId, orderId);
    },
  };
}
```

- When the `UPDATE` matches nothing, one more query tells "no such product" (422) from "not enough stock" (409), inside the same transaction.
- Every query of `load` has `AND user_id = $2`. Ownership lives in the SQL, so there is no code path that loads someone else's order and forgets to check.
- `cancel` changes the status only `WHERE status = 'placed'`. A second cancel changes nothing, puts no stock back, and still answers with the cancelled order.

## One error shape

Partner complaint 3 was four error shapes. Oja's API answers every failure with the same envelope: `{"error": {"code", "message", "issues"?, "requestId"?}}`. The `code` is for programs, the `message` for people, `issues` lists schema problems, and `requestId` appears on 500s so a customer can quote it to support. `createHttpServer` takes an `errorHandler`; this one handles every error a route, a middleware or the router throws:

errors.ts

```ts
import { randomUUID } from "node:crypto";
import { normalizeToBaseError } from "@zudojs/errors";
import { createResponseContext, type HttpRequestContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { isSchemaValidationError } from "@zudojs/schema";

/** One error shape for every route: { error: { code, message, issues?, requestId? } }. */
export function createErrorHandler(logger: Logger) {
  return (thrown: unknown, request: HttpRequestContext) => {
    if (isSchemaValidationError(thrown)) {
      const issues = thrown.issues.map((issue) => ({ path: issue.path.join(".") || "(body)", message: issue.message }));
      return createResponseContext({ status: 400 }).json({ error: { code: "VALIDATION_FAILED", message: "The request is not valid", issues } });
    }
    const error = normalizeToBaseError(thrown);
    if (error.expose && error.statusCode < 500) {
      return createResponseContext({ status: error.statusCode }).json({ error: { code: error.code, message: error.message } });
    }
    const requestId = randomUUID();
    logger.error("Request failed", { requestId, method: request.method, path: request.path, error: thrown instanceof Error ? thrown : String(thrown) });
    return createResponseContext({ status: 500 }).json({ error: { code: "INTERNAL", message: "Something went wrong on our side", requestId } });
  };
}
```

Why not simply send `serializePublicError(error)` from [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors#serialize)? By default it is safe now: an exposed error's `metadata` is *not* published unless you opt in with `publicMetadataKeys` or `exposeMetadata: true` — until that changed, an exposed error published its whole metadata, and metadata is written for your logs, not your clients:

public-errors.tsNode.js only

```ts
import { DomainError, serializePublicError } from "@zudojs/errors";
import { createRequestContext } from "@zudojs/http";
import { createLogger } from "@zudojs/logger";
import { createErrorHandler } from "./errors.js";

const error = new DomainError("Product 99 does not exist", {
  code: "UNKNOWN_PRODUCT",
  metadata: { productId: 99, warehouse: "lagos-ikeja-2", supplierCost: 910000 },
});
console.log("default:        ", serializePublicError(error).metadata);
console.log("exposeMetadata: ", serializePublicError(error, { exposeMetadata: true }).metadata);

const handle = createErrorHandler(createLogger({ name: "demo", transports: [] }));
const response = await handle(error, createRequestContext({ method: "POST", url: "/v1/orders" }));
console.log("our handler:", response.status, response.body);
```

Output of `npx tsx public-errors.ts`

```ts
default:         undefined
exposeMetadata:  { productId: 99, warehouse: 'lagos-ikeja-2', supplierCost: 910000 }
our handler: 422 {"error":{"code":"UNKNOWN_PRODUCT","message":"Product 99 does not exist"}}
```

Nobody set `exposeMetadata` here, so the default call already keeps the warehouse name and the supplier cost out of the response — `expose: true` says the *message* is safe for a client, not the metadata, which routinely carries internal state. The one line that opts in shows why the option exists at all: reach for `publicMetadataKeys` to allow-list the one or two fields a client genuinely needs, never `exposeMetadata: true` on an error whose metadata you have not read field by field. Oja's own handler builds the body from `code` and `message` only, which needs no such review. For 500s it does the opposite of hiding: it logs the full error with a new request id, and the client gets only that id. Note that `@zudojs/logger` replaces fields named like secrets (`password`, `token`, `authorization`) with `[REDACTED]` by default, so logging request details does not leak passwords.

> IF YOU STARTED FROM THE CLI
>
> A project made with `zudojs create` already logs an unexposed error and answers a generic 500 from inside the middleware pipeline, so the 500 carries the app's security headers too (see [the CLI project lesson](https://zudojs.oyinlola.site/learn/zudo-cli-project#known-problems)). Oja's own `createErrorHandler` exists for a different reason: to give every failure — 4xx and 5xx alike — the one envelope shape (`{ error: { code, message, issues?, requestId? } }`) the contract promises, which a generic project has no reason to standardise on its own.

## The routes and the OpenAPI document

`api.ts` is the only file that knows about HTTP. Each route reads its input, calls a module and returns the result; each carries its own `openapi` description, so the document is generated from the routes the router really has ([docs straight from your router](https://zudojs.oyinlola.site/learn/zudo-openapi#from-router)). Read the routes against the endpoint table from the design section:

api.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import type { DatabaseClient } from "@zudojs/database";
import {
  badRequest, createHttpServer, createNodeHttpAdapter, createRateLimitMiddleware, createResponseContext, createRouter, mountOpenAPI,
} from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { createComponentReference } from "@zudojs/openapi";
import { createErrorHandler } from "./errors.js";
import { createOrders } from "./orders.js";
import { createProducts } from "./products.js";
import * as S from "./schemas.js";
import { createUsers, currentUser, requireAdmin } from "./users.js";

export interface ApiOptions {
  readonly db: DatabaseClient;
  readonly tokens: TokenConfig;
  readonly cursorSecret: string;
  readonly logger: Logger;
}

function body(ctx: HttpRouterContext): unknown {
  if (!(ctx.request.getHeader("content-type") ?? "").startsWith("application/json")) throw badRequest("Send JSON with Content-Type: application/json");
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("The body is not valid JSON");
  }
}
const id = (ctx: HttpRouterContext) => S.IdParams.parse(ctx.params).id;
const ref = (name: string) => createComponentReference("schemas", name);
const errors = (...codes: string[]) => Object.fromEntries(codes.map((code) => [code, { schema: ref("Error") }]));
const created = (location: string, data: unknown) => createResponseContext({ status: 201 }).setHeader("location", location).json(data);

export function createApi({ db, tokens, cursorSecret, logger }: ApiOptions) {
  const users = createUsers(db, tokens);
  const products = createProducts(db, cursorSecret);
  const orders = createOrders(db);
  const signedIn = [users.requireUser];
  const bearer = [{ bearerAuth: [] }];
  const router = createRouter({
    notFoundHandler: () => createResponseContext({ status: 404 }).json({ error: { code: "NO_SUCH_ROUTE", message: "No such route" } }),
    methodNotAllowedHandler: (_ctx, allowed) =>
      createResponseContext({ status: 405 }).setHeader("allow", allowed.join(", "))
        .json({ error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed.join(" or ")}` } }),
  });

  router.post("/v1/users", async (ctx) => {
    const user = await users.register(body(ctx));
    return created(`/v1/users/${user.id}`, user);
  }, { openapi: { operationId: "users.register", tags: ["Users"], security: [], body: S.Register,
    responses: { "201": { schema: ref("User") }, ...errors("400", "409") } } });

  router.post("/v1/tokens", async (ctx) => createResponseContext().json(await users.login(body(ctx))), {
    middleware: [createRateLimitMiddleware({ max: 10, windowMs: 60_000 })],
    openapi: { operationId: "tokens.create", tags: ["Users"], security: [], body: S.Login,
      responses: { "200": { schema: ref("Token") }, ...errors("400", "401", "429") } } });

  router.get("/v1/users/me", (ctx) => currentUser(ctx), { middleware: signedIn,
    openapi: { operationId: "users.me", tags: ["Users"], security: bearer, responses: { "200": { schema: ref("User") }, ...errors("401") } } });

  router.get("/v1/products", async (ctx) => products.list(ctx.query), {
    openapi: { operationId: "products.list", tags: ["Products"], security: [], query: S.ProductQuery,
      responses: { "200": { schema: ref("ProductPage") }, ...errors("400") } } });

  router.get("/v1/products/:id", async (ctx) => products.get(id(ctx)), {
    openapi: { operationId: "products.get", tags: ["Products"], security: [], params: S.IdParams,
      responses: { "200": { schema: ref("Product") }, ...errors("400", "404") } } });

  router.post("/v1/products", async (ctx) => {
    requireAdmin(ctx);
    const product = await products.create(body(ctx));
    return created(`/v1/products/${product.id}`, product);
  }, { middleware: signedIn, openapi: { operationId: "products.create", tags: ["Products"], security: bearer, body: S.NewProduct,
    responses: { "201": { schema: ref("Product") }, ...errors("400", "401", "403", "409") } } });

  router.patch("/v1/products/:id", async (ctx) => {
    requireAdmin(ctx);
    return products.update(id(ctx), body(ctx));
  }, { middleware: signedIn, openapi: { operationId: "products.update", tags: ["Products"], security: bearer, params: S.IdParams, body: S.ProductPatch,
    responses: { "200": { schema: ref("Product") }, ...errors("400", "401", "403", "404") } } });

  router.post("/v1/orders", async (ctx) => {
    const order = await orders.place(currentUser(ctx).id, body(ctx));
    return created(`/v1/orders/${order.id}`, order);
  }, { middleware: signedIn, openapi: { operationId: "orders.place", tags: ["Orders"], security: bearer, body: S.NewOrder,
    responses: { "201": { schema: ref("Order") }, ...errors("400", "401", "409", "422") } } });

  router.get("/v1/orders", async (ctx) => orders.listMine(currentUser(ctx).id), { middleware: signedIn,
    openapi: { operationId: "orders.list", tags: ["Orders"], security: bearer,
      responses: { "200": { schema: ref("OrderList") }, ...errors("401") } } });

  router.get("/v1/orders/:id", async (ctx) => orders.load(currentUser(ctx).id, id(ctx)), { middleware: signedIn,
    openapi: { operationId: "orders.get", tags: ["Orders"], security: bearer, params: S.IdParams,
      responses: { "200": { schema: ref("Order") }, ...errors("400", "401", "404") } } });

  router.post("/v1/orders/:id/cancel", async (ctx) => orders.cancel(currentUser(ctx).id, id(ctx)), { middleware: signedIn,
    openapi: { operationId: "orders.cancel", tags: ["Orders"], security: bearer, params: S.IdParams,
      responses: { "200": { schema: ref("Order") }, ...errors("400", "401", "404") } } });

  const docs = mountOpenAPI(router, {
    info: { title: "Oja Market API", version: "1.0.0" },
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: { User: S.UserOut, Token: S.TokenOut, Product: S.ProductOut, ProductPage: S.ProductPage, Order: S.OrderOut, OrderList: S.OrderList, Error: S.ErrorOut },
    validate: true,
    branding: false,
  });

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
    errorHandler: createErrorHandler(logger),
  });
  return { server, docs, router, requireUser: users.requireUser };
}
```

- `created()` answers 201 with a `Location` header, the URL of the new resource.
- The router's own 404 and 405 answers use a different body, so `notFoundHandler` and `methodNotAllowedHandler` replace them with the Oja envelope. Otherwise a typo in a URL would be the one error with another shape.
- `body()` refuses anything that is not JSON with 400 before a schema runs. Bodies over 10 MB are refused by `@zudojs/http` itself with 413.
- `POST /v1/tokens` has a rate limit of 10 per minute per client address, from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth#lockout).
- `security: []` marks the public routes; the others require the bearer token. `mountOpenAPI` registers the four output schemas as components and serves `/openapi.json` and `/docs`.

Last, a helper that starts everything on a free port with an empty database, and gives tests and demos a small HTTP client. Real secrets come from the environment; this demo makes random ones:

market.ts

```ts
import { randomBytes } from "node:crypto";
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";
import { createApi } from "./api.js";
import { openDatabase } from "./db.js";

/* DEMO ONLY: random secrets for each run. Your app reads them from the environment. */
const secret = () => randomBytes(32).toString("base64url");

export interface Reply {
  readonly status: number;
  readonly headers: Headers;
  readonly body: any; // test helper: the contract check below verifies the shape
}

/** Starts the whole API on a free port, with an empty database. */
export async function startMarket(log: (line: string) => void = console.log) {
  const db = await openDatabase();
  const logger = createLogger({
    name: "oja",
    formatter: createTextLoggerFormatter({ includeTimestamp: false }),
    transports: [
      (entry) => {
        const { requestId, error } = entry.metadata as { requestId?: string; error?: { name: string; message: string } };
        log(`[${entry.levelName}] ${entry.message} requestId=${requestId} ${error?.name}: ${error?.message}`);
      },
    ],
  });
  const api = createApi({
    db,
    logger,
    tokens: { accessSecret: secret(), refreshSecret: secret(), accessTtl: 15 * 60, issuer: "oja", audience: "oja-api" },
    cursorSecret: secret(),
  });
  await api.server.start();
  const base = `http://127.0.0.1:${api.server.address?.port}`;

  async function call(method: string, path: string, data?: unknown, token?: string): Promise<Reply> {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  async function signUp(email: string, role: "customer" | "admin" = "customer"): Promise<string> {
    const password = `${email} long passphrase`;
    await call("POST", "/v1/users", { email, name: email.split("@")[0], password });
    if (role === "admin") await db.executeRawUnsafe("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
    return (await call("POST", "/v1/tokens", { email, password })).body.accessToken;
  }

  async function stop(): Promise<void> {
    await api.server.stop();
    await db.disconnect();
  }

  return { db, base, call, signUp, stop, docs: api.docs, router: api.router, requireUser: api.requireUser };
}
```

## Run the story

An admin fills the shelf, Ada registers (and tries to make herself an admin), logs in, orders, and runs into the rules. Every request is real HTTP through `fetch`:

story.tsNode.js only

```ts
import { startMarket, type Reply } from "./market.js";

const market = await startMarket();
const { call } = market;
function show(label: string, reply: Reply): void {
  const error = reply.body?.error;
  console.log(`${label} -> ${reply.status}`, error ? `${error.code}: ${error.message}` : "");
}

const admin = await market.signUp("admin@oja.test", "admin");
for (const product of [
  { sku: "rice-5kg", name: "Ofada rice 5 kg", category: "grains", priceKobo: 1_250_000, stock: 3 },
  { sku: "palm-oil-1l", name: "Palm oil 1 l", category: "household", priceKobo: 280_000, stock: 10 },
  { sku: "zobo-500ml", name: "Zobo 500 ml", category: "drinks", priceKobo: 50_000, stock: 40 },
]) {
  const reply = await call("POST", "/v1/products", product, admin);
  console.log("create product ->", reply.status, reply.headers.get("location"));
}

const password = "ada's long passphrase";
const joined = await call("POST", "/v1/users", { email: " Ada@Example.com ", name: "Ada", password, role: "admin" });
console.log("register ->", joined.status, joined.body);
show("register again", await call("POST", "/v1/users", { email: "ada@example.com", name: "Ada", password }));
show("wrong password", await call("POST", "/v1/tokens", { email: "ada@example.com", password: "guess" }));
const login = await call("POST", "/v1/tokens", { email: "ada@example.com", password });
console.log("log in ->", login.status, login.body.tokenType, login.body.expiresIn);
const ada = login.body.accessToken;

show("Ada adds a product", await call("POST", "/v1/products", { sku: "free", name: "Free", category: "grains", priceKobo: 1, stock: 9 }, ada));
const order = await call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 4 }] }, ada);
console.log("place order ->", order.status, order.headers.get("location"), order.body);
show("rice again", await call("POST", "/v1/orders", { items: [{ productId: 3, quantity: 1 }, { productId: 1, quantity: 2 }] }, ada));
show("unknown product", await call("POST", "/v1/orders", { items: [{ productId: 99, quantity: 1 }] }, ada));
show("no token", await call("GET", "/v1/orders"));
const bola = await market.signUp("bola@example.com");
show("Bola reads Ada's order", await call("GET", "/v1/orders/1", undefined, bola));

const shelf = await call("GET", "/v1/products");
console.log(shelf.body.data.map((p: { sku: string; stock: number }) => `${p.sku}: ${p.stock}`).join(", "));
await market.stop();
```

Output of `npx tsx story.ts`

```ts
create product -> 201 /v1/products/1
create product -> 201 /v1/products/2
create product -> 201 /v1/products/3
register -> 201 { id: 2, email: 'ada@example.com', name: 'Ada', role: 'customer' }
register again -> 409 ERR_CONFLICT: An account with this e-mail already exists
wrong password -> 401 ERR_AUTHENTICATION_FAILED: Wrong e-mail or password
log in -> 200 Bearer 900
Ada adds a product -> 403 ERR_FORBIDDEN: Only admins may do this
place order -> 201 /v1/orders/1 {
  id: 1,
  status: 'placed',
  totalKobo: 2700000,
  items: [
    { productId: 1, quantity: 2, priceKobo: 1250000 },
    { productId: 3, quantity: 4, priceKobo: 50000 }
  ]
}
rice again -> 409 ERR_CONFLICT: Not enough stock for product 1
unknown product -> 422 UNKNOWN_PRODUCT: Product 99 does not exist
no token -> 401 ERR_AUTHENTICATION_FAILED: Send a valid access token
Bola reads Ada's order -> 404 ERR_RESOURCE_NOT_FOUND: Order 1 not found
rice-5kg: 1, palm-oil-1l: 10, zobo-500ml: 36
```

Match each line with the design table:

- Every create answered 201 with the new resource's URL. Ada's `"role": "admin"` was ignored, and her e-mail was trimmed and lower-cased, so registering again with the plain spelling is a 409.
- A wrong password and a customer creating a product are 401 and 403, each in the same envelope.
- The order totals 2 × ₦12,500 + 4 × ₦500 = ₦27,000, computed from the database's prices. The second order asked for 2 bags of rice with 1 left: 409, and its zobo line was rolled back with it, which is why the shelf shows 36 and not 35.
- Bola asking for Ada's order gets 404, the same answer as for an order that does not exist.

## Pages that never repeat

Now the pagination rules under pressure: a new product is added while a client is between page 1 and page 2, then three kinds of bad input arrive:

pagination.tsNode.js only

```ts
import { startMarket } from "./market.js";

const market = await startMarket();
const admin = await market.signUp("admin@oja.test", "admin");
const add = (sku: string, category: string) =>
  market.call("POST", "/v1/products", { sku, name: sku, category, priceKobo: 100_000, stock: 5 }, admin);
for (const sku of ["beans-1kg", "garri-2kg", "zobo-500ml", "rice-5kg", "pepper-soup-mix"]) {
  await add(sku, sku.startsWith("zobo") ? "drinks" : sku.startsWith("pepper") ? "spices" : "grains");
}

let path = "/v1/products?category=grains&limit=2";
for (let page = 1; path; page++) {
  const reply = await market.call("GET", path);
  console.log(`page ${page}:`, reply.body.data.map((p: { sku: string }) => p.sku), reply.body.nextCursor ? "more" : "last");
  if (page === 1) await add("millet-1kg", "grains"); // a new product appears while the client is paging
  path = reply.body.nextCursor ? `/v1/products?category=grains&limit=2&cursor=${reply.body.nextCursor}` : "";
}

const first = await market.call("GET", "/v1/products?limit=2");
const [, signature] = first.body.nextCursor.split(".");
const forged = `${Buffer.from('{"id":0}').toString("base64url")}.${signature}`;
for (const query of [`cursor=${forged}`, "limit=500", "category=cars"]) {
  const { status, body } = await market.call("GET", `/v1/products?${query}`);
  console.log(query.split("=")[0], "->", status, body.error.message, body.error.issues ?? "");
}
await market.stop();
```

Output of `npx tsx pagination.ts`

```ts
page 1: [ 'beans-1kg', 'garri-2kg' ] more
page 2: [ 'rice-5kg', 'millet-1kg' ] last
cursor -> 400 Invalid pagination cursor signature.
limit -> 400 The request is not valid [ { path: 'limit', message: 'Expected <= 50, received 500' } ]
category -> 400 The request is not valid [
  {
    path: 'category',
    message: 'Expected one of "grains", "drinks", "spices", "household"'
  }
]
```

The client saw every grain exactly once. The new millet came at the end, because its id is larger than every id already seen; with `OFFSET 2`, page 2 would have shifted and repeated a product. The forged cursor kept a real signature but changed the position, and was refused with 400, as were a limit over 50 and a category that does not exist. All three are the client's mistake, so all three are 4xx, and none reached the database.

## The document, and a contract test

The OpenAPI document lists every route of the router, with its security. Nothing was written twice:

openapi-demo.tsNode.js only

```ts
import { startMarket } from "./market.js";

const market = await startMarket();
const document = market.docs.document();
console.log(document.openapi, document.info.title);
for (const [path, item] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(item ?? {})) {
    const op = operation as { operationId: string; security?: unknown[] };
    const auth = op.security?.length === 0 ? "public" : "bearer";
    console.log(method.toUpperCase().padEnd(6), path.padEnd(22), op.operationId.padEnd(16), auth);
  }
}
console.log(JSON.stringify(document.paths["/v1/products"]?.get?.parameters?.[1]));

const spec = await fetch(`${market.base}/openapi.json`);
const docsPage = await fetch(`${market.base}/docs`);
console.log(spec.status, spec.headers.get("content-type"), "|", docsPage.status, docsPage.headers.get("content-type"));
await market.stop();
```

Output of `npx tsx openapi-demo.ts`

```ts
3.1.0 Oja Market API
POST   /v1/users              users.register   public
POST   /v1/tokens             tokens.create    public
GET    /v1/users/me           users.me         bearer
GET    /v1/products           products.list    public
POST   /v1/products           products.create  bearer
GET    /v1/products/{id}      products.get     public
PATCH  /v1/products/{id}      products.update  bearer
POST   /v1/orders             orders.place     bearer
GET    /v1/orders             orders.list      bearer
GET    /v1/orders/{id}        orders.get       bearer
POST   /v1/orders/{id}/cancel orders.cancel    bearer
{"name":"limit","in":"query","required":false,"schema":{"type":"integer","minimum":1,"maximum":50,"default":20}}
200 application/json; charset=utf-8 | 200 text/html; charset=utf-8
```

`limit` is documented as an integer from 1 to 50 with default 20, straight from `ProductQuery`. Partners can open `/docs`, and generate a client from `/openapi.json`.

A generated document proves the *inputs* are described correctly, because the same schemas validate them. It does not prove that the *responses* match. A route could return `{ "price": "12500.00" }` while the document promises `priceKobo` as an integer. A **contract test** closes that gap: it checks real responses against the document, with **Ajv**, the JSON Schema validator from [the validation libraries lesson](https://zudojs.oyinlola.site/learn/ts-validation). OpenAPI 3.1 schemas are JSON Schema 2020-12, so Ajv reads the document's components directly:

contract.ts

```ts
import { Ajv2020 } from "ajv/dist/2020.js";
import type { OpenAPIDocument } from "@zudojs/openapi";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Checks a real response against the OpenAPI document the server publishes. */
export function createContractCheck(doc: OpenAPIDocument) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addSchema({ $id: "api", components: doc.components });

  return function check(operationId: string, status: number, body: unknown): string[] {
    const operation = Object.values(doc.paths)
      .flatMap((item) => METHODS.map((method) => item?.[method]))
      .find((op) => op?.operationId === operationId);
    if (!operation) return [`no operation ${operationId}`];
    const response = operation.responses?.[String(status)];
    if (!response) return [`${operationId} does not document status ${status}`];
    const schema = "content" in response ? response.content?.["application/json"]?.schema : undefined;
    const ref = (schema as { $ref?: string } | undefined)?.$ref;
    const validate = ref === undefined ? undefined : ajv.getSchema(`api${ref}`);
    if (!validate) return [`${operationId} ${status} has no JSON schema to check`];
    return validate(body) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
  };
}
```

contract-demo.tsNode.js only

```ts
import { createContractCheck } from "./contract.js";
import { startMarket } from "./market.js";

const market = await startMarket();
const check = createContractCheck(market.docs.document());
const admin = await market.signUp("admin@oja.test", "admin");

const created = await market.call("POST", "/v1/products", { sku: "rice-5kg", name: "Rice", category: "grains", priceKobo: 1_250_000, stock: 3 }, admin);
console.log("products.create 201:", check("products.create", created.status, created.body));
const list = await market.call("GET", "/v1/products");
console.log("products.list 200:", check("products.list", list.status, list.body));
const denied = await market.call("POST", "/v1/orders", { items: [] });
console.log("orders.place 401:", check("orders.place", denied.status, denied.body));

// What a careless change would send: a price in naira as a string, and an internal column.
const drifted = { ...created.body, priceKobo: "12500.00", cost_kobo: 900_000 };
console.log("drifted product:", check("products.get", 200, drifted));
console.log("undocumented status:", check("products.get", 418, {}));
await market.stop();
```

Output of `npx tsx contract-demo.ts`

```ts
products.create 201: []
products.list 200: []
orders.place 401: []
drifted product: [ '/priceKobo must be integer' ]
undocumented status: [ 'products.get does not document status 418' ]
```

Real responses pass. The drifted product fails on the naira string. But look at what was *not* reported: the extra `cost_kobo` field. The document allows additional properties on purpose, so that Oja can add a field next year without breaking clients that validate strictly. A contract test therefore catches wrong types, missing fields and undocumented statuses, but not a leaked extra column. That protection comes from the allow-lists: `UserOut.parse` and SQL that names its columns, never `SELECT *`.

## When things break

A bad deploy renamed a table, and a client mistyped two URLs:

crash.tsNode.js only

```ts
import { startMarket } from "./market.js";

const market = await startMarket();
await market.db.executeRawUnsafe("ALTER TABLE products RENAME TO products_old"); // a bad deploy

const reply = await market.call("GET", "/v1/products");
console.log(reply.status, reply.body);

const missing = await market.call("GET", "/v1/prodcts");
const wrongMethod = await market.call("DELETE", "/v1/products");
console.log(missing.status, missing.body.error, "|", wrongMethod.status, wrongMethod.headers.get("allow"), wrongMethod.body.error.code);
await market.stop();
```

Output of `npx tsx crash.ts`

```json
[error] Request failed requestId=458a35ba-e4d7-4870-98b5-644a3c4ad7c9 DatabaseError: relation "products" does not exist
500 {
  error: {
    code: 'INTERNAL',
    message: 'Something went wrong on our side',
    requestId: '458a35ba-e4d7-4870-98b5-644a3c4ad7c9'
  }
}
404 { code: 'NO_SUCH_ROUTE', message: 'No such route' } | 405 GET, POST, HEAD, OPTIONS METHOD_NOT_ALLOWED
```

The client learned nothing about tables; the log line has the real cause and the same request id the client received. The typo and the wrong method got the Oja envelope, and the 405 lists the allowed methods in an `Allow` header, as HTTP requires.

| Failure | What the API does |
| --- | --- |
| Body is not JSON, or too large | 400 before any schema runs; over 10 MB, 413 from `@zudojs/http` |
| A schema fails | 400 with the list of issues |
| Missing, expired or forged token; deleted account | 401, always the same message |
| Customer calls an admin route | 403 |
| Someone else's order | 404, like a missing one |
| Duplicate e-mail or SKU | 409 from the `UNIQUE` constraint, even under a race |
| Out of stock in any line | 409, and the whole order is rolled back |
| Password guessing | 429 after 10 attempts a minute from one address |
| A bug or the database is down | 500 with a request id; the cause only in the log |
| `POST /v1/orders` sent twice after a timeout | **Two orders.** Not solved here: see below. |

The last row is a real gap. Cancelling is naturally idempotent, placing an order is not. A phone that loses its connection after `POST /v1/orders` and retries will order twice. The fix is an `Idempotency-Key` header, built in [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency) and used for payments in [the payments use case](https://zudojs.oyinlola.site/learn/usecase-payments).

## The test suite

The story above is a demo, not a test. The suite pins down each rule from the design table, with one PostgreSQL per test file and fresh products and orders for each test. The `vitest-run.ts` helper is the one from [Testing ZudoJS applications](https://zudojs.oyinlola.site/learn/zudo-testing-apps#setup): it runs Vitest from code so the results can be shown on this page. On your computer, run `npx vitest run`.

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

tests/api.test.ts

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContractCheck } from "../contract.js";
import { startMarket } from "../market.js";

let market: Awaited<ReturnType<typeof startMarket>>;
let admin: string;
let ada: string;
let check: ReturnType<typeof createContractCheck>;
const logs: string[] = [];

beforeAll(async () => {
  market = await startMarket((line) => logs.push(line));
  check = createContractCheck(market.docs.document());
  admin = await market.signUp("admin@oja.test", "admin");
  ada = await market.signUp("ada@example.com");
});
afterAll(() => market.stop());

beforeEach(async () => {
  logs.length = 0;
  await market.db.executeRawUnsafe("TRUNCATE products, orders, order_lines RESTART IDENTITY");
  for (const [sku, stock] of [["rice-5kg", 3], ["palm-oil-1l", 10]] as const) {
    await market.call("POST", "/v1/products", { sku, name: sku, category: "grains", priceKobo: 1000, stock }, admin);
  }
});

const stockOf = async (id: number) => (await market.call("GET", `/v1/products/${id}`)).body.stock;

describe("Oja Market API", () => {
  it("never takes a role from the request body", async () => {
    const res = await market.call("POST", "/v1/users", { email: "eve@example.com", name: "Eve", password: "eve long passphrase", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("customer");
  });

  it("answers every mistake with the documented error shape", async () => {
    const cases = [
      ["products.create", await market.call("POST", "/v1/products", { sku: "x" }, admin), 400],
      ["products.create", await market.call("POST", "/v1/products", { sku: "tea", name: "Tea", category: "drinks", priceKobo: 1, stock: 1 }), 401],
      ["products.create", await market.call("POST", "/v1/products", { sku: "tea", name: "Tea", category: "drinks", priceKobo: 1, stock: 1 }, ada), 403],
      ["products.get", await market.call("GET", "/v1/products/999"), 404],
      ["orders.place", await market.call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 9 }] }, ada), 409],
      ["orders.place", await market.call("POST", "/v1/orders", { items: [{ productId: 77, quantity: 1 }] }, ada), 422],
    ] as const;
    for (const [operation, res, status] of cases) {
      expect(res.status).toBe(status);
      expect(check(operation, res.status, res.body)).toEqual([]);
    }
  });

  it("keeps orders private: someone else's order is 404", async () => {
    const order = await market.call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 1 }] }, ada);
    const bola = await market.signUp("bola@example.com");
    expect((await market.call("GET", `/v1/orders/${order.body.id}`, undefined, bola)).status).toBe(404);
    expect((await market.call("POST", `/v1/orders/${order.body.id}/cancel`, undefined, bola)).status).toBe(404);
    expect((await market.call("GET", "/v1/orders", undefined, bola)).body).toEqual([]);
  });

  it("rolls back every line when one line fails", async () => {
    const res = await market.call("POST", "/v1/orders", { items: [{ productId: 2, quantity: 5 }, { productId: 1, quantity: 4 }] }, ada);
    expect(res.status).toBe(409);
    expect(await stockOf(2)).toBe(10);
  });

  it("puts the stock back once, however often an order is cancelled", async () => {
    const order = await market.call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 2 }] }, ada);
    for (let i = 0; i < 3; i++) {
      const res = await market.call("POST", `/v1/orders/${order.body.id}/cancel`, undefined, ada);
      expect(res.body.status).toBe("cancelled");
    }
    expect(await stockOf(1)).toBe(3);
  });

  it("pages never repeat or skip, even when products are added between pages", async () => {
    const first = await market.call("GET", "/v1/products?limit=1");
    await market.call("POST", "/v1/products", { sku: "zobo", name: "Zobo", category: "drinks", priceKobo: 500, stock: 1 }, admin);
    const second = await market.call("GET", `/v1/products?limit=1&cursor=${first.body.nextCursor}`);
    const third = await market.call("GET", `/v1/products?limit=1&cursor=${second.body.nextCursor}`);
    expect([first, second, third].flatMap((page) => page.body.data.map((p: { sku: string }) => p.sku))).toEqual(["rice-5kg", "palm-oil-1l", "zobo"]);
    expect(third.body.nextCursor).toBeNull();
    const forged = `${Buffer.from('{"id":0}').toString("base64url")}.${first.body.nextCursor.split(".")[1]}`;
    expect((await market.call("GET", `/v1/products?cursor=${forged}`)).status).toBe(400);
  });

  it("hides the reason for a 500 from the client but logs it with a request id", async () => {
    await market.db.executeRawUnsafe("ALTER TABLE products RENAME TO products_old");
    const res = await market.call("GET", "/v1/products");
    await market.db.executeRawUnsafe("ALTER TABLE products_old RENAME TO products");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("products");
    expect(logs).toEqual([expect.stringContaining(`requestId=${res.body.error.requestId}`)]);
  });
});
```

run-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";
await runTests("tests/api.test.ts");
```

Output of `npx tsx run-tests.ts`

```ts
✓ Oja Market API > never takes a role from the request body
✓ Oja Market API > answers every mistake with the documented error shape
✓ Oja Market API > keeps orders private: someone else's order is 404
✓ Oja Market API > rolls back every line when one line fails
✓ Oja Market API > puts the stock back once, however often an order is cancelled
✓ Oja Market API > pages never repeat or skip, even when products are added between pages
✓ Oja Market API > hides the reason for a 500 from the client but logs it with a request id
```

Three details make this suite trustworthy. The error test checks every failure status *and* runs the body through the contract check, so an error in the wrong shape fails even when its status is right. The pagination test adds a product between two pages, which is the exact situation that broke the old API. And the 500 test finds its request id in the log, which proves the id the customer quotes leads to the real cause. Break the code on purpose (remove `AND user_id = $2` from `load`, or change `id > $2` to `OFFSET`) and watch the matching test fail.

## Production concerns

- **Secrets**: `accessSecret`, `refreshSecret` and `cursorSecret` come from the environment, at least 32 bytes each, and the app refuses to start without them ([secrets](https://zudojs.oyinlola.site/learn/zudo-auth#secrets)). Rotating the cursor secret invalidates every open cursor: clients get 400 and restart from page 1, which is acceptable.
- **Database**: swap PGlite for a pool on a real server ([deployment](https://zudojs.oyinlola.site/learn/deployment)). On real PostgreSQL, run the concurrency tests too: PGlite runs one transaction at a time and can hide races that a pool exposes.
- **N+1 queries**: `listMine` runs one query per order. With 50 orders that is 101 queries. Load all lines with `WHERE order_id = ANY($1)` in one query when it shows up in your metrics.
- **Registration reveals accounts**: the 409 for a taken e-mail tells anyone which e-mails have accounts. For a grocery shop that is usually accepted; a bank would answer 202 for both and send an e-mail instead.
- **Versioning**: additive changes (a new field, a new endpoint) stay in `/v1`. Renaming or removing a field, or changing a type, needs `/v2`, and the contract test tells you when a change is breaking. Keep the committed `openapi.json` in git and review its diff ([API contracts](https://zudojs.oyinlola.site/learn/api-contracts)).
- **Edges**: CORS for the partners' browsers, security headers and rate limits on every public route come from [the security lesson](https://zudojs.oyinlola.site/learn/zudo-security). A per-process rate limiter does not add up across several servers; use a shared store.

## Practice

TRY IT YOURSELF

### An admin view of all orders

Oja's staff need `GET /v1/admin/orders?status=placed`: the latest 100 orders of every customer, optionally filtered by status, admins only, documented in OpenAPI. Add it from outside `api.ts`, using the `router` and `requireUser` that `startMarket` returns, and check that a customer gets 403.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Register it with `market.router.get(path, handler, options)`, the same shape `api.ts` uses for every other route. Inside the handler call `requireAdmin(ctx)` first, then `AdminOrderQuery.parse(ctx.query)`.

HINT 2

`middleware: [market.requireUser]` must run before the handler, or `requireAdmin(ctx)` finds no user on `ctx.state` and throws its own error instead of a clean 403.

HINT 3

The query is `\`SELECT id, user_id AS "userId", status, total_kobo AS "totalKobo" FROM orders WHERE ($1::text IS NULL OR status = $1) ORDER BY id DESC LIMIT 100\`` with `[status ?? null]` as the parameter — the same pattern `products.list` uses for its category filter.

SOLUTION

admin-orders.tsNode.js only

```ts
import { createComponentReference } from "@zudojs/openapi";
import { schema } from "@zudojs/schema";
import { startMarket } from "./market.js";
import { requireAdmin } from "./users.js";

const AdminOrderQuery = schema.object({ status: schema.optional(schema.enum(["placed", "cancelled"] as const)) });
const AdminOrder = schema.object({ id: schema.number().int(), userId: schema.number().int(), status: schema.string(), totalKobo: schema.number().int() });

const market = await startMarket();
market.router.get("/v1/admin/orders", async (ctx) => {
  requireAdmin(ctx);
  const { status } = AdminOrderQuery.parse(ctx.query);
  return market.db.queryRawUnsafe(
    `SELECT id, user_id AS "userId", status, total_kobo AS "totalKobo" FROM orders
     WHERE ($1::text IS NULL OR status = $1) ORDER BY id DESC LIMIT 100`,
    [status ?? null],
  );
}, {
  middleware: [market.requireUser],
  openapi: { operationId: "admin.orders.list", tags: ["Admin"], security: [{ bearerAuth: [] }], query: AdminOrderQuery,
    responses: { "200": { schema: schema.array(AdminOrder) }, "401": { schema: createComponentReference("schemas", "Error") },
      "403": { schema: createComponentReference("schemas", "Error") } } },
});

const admin = await market.signUp("admin@oja.test", "admin");
const ada = await market.signUp("ada@example.com");
await market.call("POST", "/v1/products", { sku: "zobo", name: "Zobo", category: "drinks", priceKobo: 50_000, stock: 9 }, admin);
await market.call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 1 }] }, ada);
await market.call("POST", "/v1/orders", { items: [{ productId: 1, quantity: 2 }] }, ada);
await market.call("POST", "/v1/orders/1/cancel", undefined, ada);

console.log((await market.call("GET", "/v1/admin/orders?status=placed", undefined, admin)).body);
console.log((await market.call("GET", "/v1/admin/orders", undefined, ada)).status);
console.log(Object.keys(market.docs.document().paths).includes("/v1/admin/orders"));
await market.stop();
```

Output of `npx tsx admin-orders.ts`

```json
[ { id: 2, userId: 2, status: 'placed', totalKobo: 100000 } ]
403
true
```

The route is added after `mountOpenAPI` ran and still appears in the document, because the document is built from the router each time it is requested. Without `middleware: [market.requireUser]`, `requireAdmin` would find no user and throw: every call would be a 500 with "requireUser is missing on this route" in the log, a loud failure instead of an open door.

TRY IT YOURSELF

### A partner wants page numbers

A partner writes: "We show a numbered pager: 1, 2, 3 … 12. Please add `?page=7`." Is that a reasonable request for Oja's catalogue, and what would you answer?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

What must the server compute to answer "page 7" that a cursor never needs — think about `OFFSET` and a total count.

HINT 2

Does answering "yes" mean *replacing* the cursor, or adding a second, separate way to ask for the same data? The mobile app's infinite scroll depends on one of them never repeating a product.

SOLUTION

Page numbers need offset pagination and a total count. Both have costs: `OFFSET 120` reads and throws away 120 rows (slow on big tables), pages shift when products are added (the old API's bug), and `count(*)` runs on every request. For Oja's small catalogue the cost is fine, and a pager is a real product need, so a reasonable answer is a *separate* parameter, `?page=7&limit=20`, documented as "may shift while the catalogue changes", next to the cursor for apps that scroll. What you should not do is replace the cursor: the mobile app's infinite scroll relies on it never repeating a product.

TRY IT YOURSELF

### Spot the leak

A teammate adds a profile route for the support team: `router.get("/v1/users/:id", (ctx) => db.queryRawUnsafe("SELECT * FROM users WHERE id = $1", [ctx.params.id]))`, with `requireUser`. Name every problem, and the test that would have caught each one.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Compare this route's `SELECT` against every other query in `products.ts` and `orders.ts`: what do they always name, and what does this one select instead?

HINT 2

`requireUser` only checks that *someone* is signed in. Which check from `access.ts`-style ownership (as in `orders.load`) is missing here, and what should a stranger's id return — the same table look at how `load` answers for someone else's order.

HINT 3

`ctx.params.id` goes straight into a query with no schema. What does `IdParams.parse` do elsewhere that this route skips, and what happens to `/v1/users/abc` without it?

SOLUTION

- **It leaks `password_hash`** (and every column added later) because of `SELECT *` and no output schema. Fix: select named columns and return `UserOut.parse(row)`. Test: assert the exact keys of the response, `expect(Object.keys(body)).toEqual(["id", "email", "name", "role"])`; the contract check alone would not catch it.
- **Any signed-in customer can read any user**, by changing the id (the old API's complaint 5). Fix: only the user themselves or support staff, and 404 otherwise. Test: Bola asks for Ada's profile and gets 404.
- **It returns an array**, not one user, and an empty array instead of 404 for a missing id. Test: the contract check, once the route documents a `User` response.
- **`ctx.params.id` is not validated**: `/v1/users/abc` reaches PostgreSQL and fails there with a 500. Fix: `IdParams.parse(ctx.params)`. Test: `GET /v1/users/abc` expects 400.

## Summary

- Start from the brief and write the endpoint table first: resources, methods, success and failure statuses, and who may call. Actions that are not CRUD become small resources (`POST /tokens`, `POST /orders/{id}/cancel`).
- The database guarantees what must never break: integer kobo, non-negative stock, unique e-mails and SKUs, prices copied into order lines.
- Identity comes from a verified token; roles, prices and ownership come from the database, never from the request. Someone else's resource is a 404.
- Schemas describe inputs and outputs once, and the same objects validate requests, trim responses and generate the OpenAPI document.
- One error handler gives every failure the same envelope, builds bodies from `code` and `message` only, and logs 500s with a request id.
- Keyset pagination with signed cursors never repeats or skips; a contract test checks real responses against the published document.

Next, [an authentication platform](https://zudojs.oyinlola.site/learn/usecase-auth-platform): the token this API trusts gets sessions, refresh, logout, password reset, roles and sign-in with an outside provider.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
