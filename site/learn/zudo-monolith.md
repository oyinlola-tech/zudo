---
title: "A well-structured monolith — ZudoJS Academy"
description: "Build ShopFlow as one ZudoJS application with auth, users, products, orders, payments and notifications, one database and one deploy, and see where it strains."
source: https://zudojs.oyinlola.site/learn/zudo-monolith
---

LEVEL 15 · LESSON 1 OF 5

Architecture modes Advanced

# A well-structured monolith

Build ShopFlow as one ZudoJS application with auth, users, products, orders, payments and notifications, one database and one deploy, and see where it strains.

- **55 min** to read and try
- **You need:** The ZudoJS advanced systems course, especially auth, database, events, adapters and testing
- **You build:** The ShopFlow monolith: sign-up and login, an admin-only catalog, an atomic checkout with a payment provider, order history and notifications, served from one process over one PostgreSQL database

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a monolith is and why it is the right first architecture for most products
- Lay out a ZudoJS monolith in layers with one composition root
- Make a multi-table checkout atomic with one database transaction and row locks
- Keep network calls such as payments outside open transactions
- Recognise the signs that a monolith needs stronger boundaries

## One shop, three people, eight weeks

ShopFlow is an online shop for groceries in Lagos. It needs six things on launch day: customers **sign up and log in**, **users** have roles (customer or admin), admins manage **products** and stock, customers place **orders**, orders are **paid** through a card provider, and customers get **notifications**. The team is three developers. Launch is in eight weeks.

The first architecture question is how many programs to build. Six features could be six services, each with its own database and deployment. Or one program that contains all six. That one program, deployed as a single unit, with its code in one codebase and usually one database, is a **monolith**.

"Monolith" is sometimes used as an insult. It should not be. Look at what checkout has to do: check the stock of every item, create the order, reduce the stock, charge the card, record the payment. Suppose the stock and the orders lived in two separate systems, and the program stopped halfway:

halfway.js

```ts
const stock = new Map([["RICE-5KG", 3]]); // lives in the products system
const orders = [];                          // lives in the orders system

function checkout(sku, quantity, crashAfterStock) {
  stock.set(sku, stock.get(sku) - quantity);
  if (crashAfterStock) throw new Error("orders system unreachable");
  orders.push({ sku, quantity });
}

try {
  checkout("RICE-5KG", 2, true);
} catch (error) {
  console.log("checkout failed:", error.message);
}
console.log("rice in stock:", stock.get("RICE-5KG"), "orders:", orders.length);
```

Output of `node halfway.js` and of the browser terminal

```ts
checkout failed: orders system unreachable
rice in stock: 1 orders: 0
```

Two bags of rice vanished: the stock went down and no order exists. With two systems, preventing that takes real machinery (sagas, outboxes, compensation), which [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices#consistency) builds. In a monolith with one database, it takes one word: `BEGIN`. This lesson builds ShopFlow as a monolith, properly structured, and then looks honestly at where it starts to strain. The next two lessons, [the modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith) and [microservices](https://zudojs.oyinlola.site/learn/zudo-microservices), take the same shop and answer those strains in two different ways.

## The shape of the monolith

"One program" does not mean "one file" or "no structure". ShopFlow uses the layers from [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture), in the folders the ZudoJS CLI generates for `zudojs create shopflow --architecture monolith` (the default architecture):

```ts
shopflow/src
├── db.ts                          one schema for every table
├── repositories/                  SQL lives here, and only here
│   ├── users.repository.ts
│   ├── products.repository.ts
│   └── orders.repository.ts       orders, order lines, payments
├── services/                      the rules
│   ├── auth.service.ts            sign-up, login, sessions
│   ├── products.service.ts        catalog rules
│   ├── payments.service.ts        the payment provider's contract
│   ├── checkout.service.ts        the order flow
│   └── notifications.service.ts   reacts to paid orders
├── routes/index.ts                HTTP: validation, login check, status codes
├── app.ts                         composition root
└── server.ts                      starts the HTTP server
```

ShopFlow's files, grouped by layer. A request flows down: route → service → repository → database.

Three rules keep it healthy: **SQL only in repositories**, **rules only in services**, and **everything is created in one place**, `app.ts`. Notice what is *not* a rule: any service may use any repository. The products area and the orders area are folders of the same program, and nothing stops one from reaching into the other. Keep that in mind; it is the thread of the last section.

## One database for everything

All six areas share one PostgreSQL database and one schema. Tables reference each other with **foreign keys**: an order line must name a real product, an order a real user. The database itself refuses an order for a user who does not exist, whatever the code does:

src/db.ts

```ts
import type { PGlite } from "@electric-sql/pglite";

/** Anything that runs SQL: the database itself, or an open transaction. */
export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
}

/** One schema for the whole shop. Tables of different areas reference each other freely. */
export const SCHEMA = `
  CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))
  );
  CREATE TABLE products (
    sku         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price_kobo  INTEGER NOT NULL CHECK (price_kobo > 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0)
  );
  CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
    total_kobo  INTEGER NOT NULL
  );
  CREATE TABLE order_lines (
    order_id    INTEGER NOT NULL REFERENCES orders (id),
    sku         TEXT NOT NULL REFERENCES products (sku),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    price_kobo  INTEGER NOT NULL,
    PRIMARY KEY (order_id, sku)
  );
  CREATE TABLE payments (
    order_id    INTEGER PRIMARY KEY REFERENCES orders (id),
    charge_id   TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL
  );
  CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    message     TEXT NOT NULL
  );
`;

export async function migrate(db: PGlite): Promise<void> {
  await db.exec(SCHEMA);
}
```

`Database` is the small interface the code needs: run a query, or run work inside a transaction. PGlite, the real PostgreSQL you used in [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database), has both methods, and so does a thin wrapper around a `pg` pool in production. Money is stored in kobo, as whole numbers.

The repositories translate between rows and objects. The users and products repositories are straightforward:

src/repositories/users.repository.ts

```ts
import { ConflictError } from "@zudojs/errors";
import type { Queryable } from "../db.js";

export interface UserRow {
  readonly id: number;
  readonly email: string;
  readonly password_hash: string;
  readonly role: "customer" | "admin";
}

export class UsersRepository {
  constructor(private readonly db: Queryable) {}

  async create(email: string, passwordHash: string, role: UserRow["role"] = "customer"): Promise<UserRow> {
    try {
      const { rows } = await this.db.query<UserRow>(
        "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *", [email, passwordHash, role]);
      return rows[0]!;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictError("That email is already registered");
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return (await this.db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email])).rows[0];
  }

  async findById(id: number): Promise<UserRow | undefined> {
    return (await this.db.query<UserRow>("SELECT * FROM users WHERE id = $1", [id])).rows[0];
  }
}
```

src/repositories/products.repository.ts

```ts
import type { Queryable } from "../db.js";

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly priceKobo: number;
  readonly stock: number;
}
interface ProductRow { sku: string; name: string; price_kobo: number; stock: number }
const toProduct = (row: ProductRow): Product => ({ sku: row.sku, name: row.name, priceKobo: row.price_kobo, stock: row.stock });

export class ProductsRepository {
  constructor(private readonly db: Queryable) {}

  async upsert(product: Product): Promise<void> {
    await this.db.query(
      `INSERT INTO products (sku, name, price_kobo, stock) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sku) DO UPDATE SET name = $2, price_kobo = $3, stock = $4`,
      [product.sku, product.name, product.priceKobo, product.stock]);
  }

  async list(): Promise<Product[]> {
    return (await this.db.query<ProductRow>("SELECT * FROM products ORDER BY sku")).rows.map(toProduct);
  }

  /** Reads the rows and locks them until the transaction ends, so two checkouts cannot both take the last one. */
  async lockForUpdate(skus: readonly string[]): Promise<Map<string, Product>> {
    const { rows } = await this.db.query<ProductRow>("SELECT * FROM products WHERE sku = ANY($1) ORDER BY sku FOR UPDATE", [skus]);
    return new Map(rows.map((row) => [row.sku, toProduct(row)]));
  }

  async changeStock(sku: string, delta: number): Promise<void> {
    await this.db.query("UPDATE products SET stock = stock + $2 WHERE sku = $1", [sku, delta]);
  }
}
```

`lockForUpdate` is the important one. `SELECT … FOR UPDATE` reads the rows and **locks** them: any other transaction that wants to lock the same rows waits until this one commits or rolls back. That is how checkout will stop two customers from buying the last bag of rice. The rows are locked in `sku` order, so two checkouts that want the same products always lock them in the same order and cannot wait for each other forever (a **deadlock**).

The orders repository owns orders, their lines and their payments. Look at `history`: to show "2 x Rice 5kg", it joins the products table. In one database that is one easy query:

src/repositories/orders.repository.ts

```ts
import type { Queryable } from "../db.js";

export type OrderStatus = "pending" | "paid" | "cancelled";
export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly priceKobo: number;
}
export interface Order {
  readonly id: number;
  readonly userId: number;
  readonly status: OrderStatus;
  readonly totalKobo: number;
}
interface OrderRow { id: number; user_id: number; status: OrderStatus; total_kobo: number }
const toOrder = (row: OrderRow): Order => ({ id: row.id, userId: row.user_id, status: row.status, totalKobo: row.total_kobo });

export class OrdersRepository {
  constructor(private readonly db: Queryable) {}

  async create(userId: number, lines: readonly OrderLine[], totalKobo: number): Promise<Order> {
    const { rows } = await this.db.query<OrderRow>(
      "INSERT INTO orders (user_id, status, total_kobo) VALUES ($1, 'pending', $2) RETURNING *", [userId, totalKobo]);
    const order = toOrder(rows[0]!);
    for (const line of lines) {
      await this.db.query("INSERT INTO order_lines (order_id, sku, quantity, price_kobo) VALUES ($1, $2, $3, $4)",
        [order.id, line.sku, line.quantity, line.priceKobo]);
    }
    return order;
  }

  async setStatus(orderId: number, status: OrderStatus): Promise<void> {
    await this.db.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, status]);
  }

  async lines(orderId: number): Promise<OrderLine[]> {
    const { rows } = await this.db.query<{ sku: string; quantity: number; price_kobo: number }>(
      "SELECT sku, quantity, price_kobo FROM order_lines WHERE order_id = $1 ORDER BY sku", [orderId]);
    return rows.map((row) => ({ sku: row.sku, quantity: row.quantity, priceKobo: row.price_kobo }));
  }

  /** The order history page: one query across orders, lines and products. */
  async history(userId: number): Promise<{ id: number; status: OrderStatus; totalKobo: number; items: string }[]> {
    const { rows } = await this.db.query<{ id: number; status: OrderStatus; total_kobo: number; items: string }>(
      `SELECT o.id, o.status, o.total_kobo, string_agg(l.quantity || ' x ' || p.name, ', ' ORDER BY p.name) AS items
       FROM orders o JOIN order_lines l ON l.order_id = o.id JOIN products p ON p.sku = l.sku
       WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.id`, [userId]);
    return rows.map((row) => ({ id: row.id, status: row.status, totalKobo: row.total_kobo, items: row.items }));
  }

  async recordPayment(orderId: number, chargeId: string, amountKobo: number): Promise<void> {
    await this.db.query("INSERT INTO payments (order_id, charge_id, amount_kobo) VALUES ($1, $2, $3)", [orderId, chargeId, amountKobo]);
  }
}
```

The examples in this lesson start from a small helper: a fresh database with the schema, one customer and two products:

shop-db.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./src/db.js";
import { ProductsRepository } from "./src/repositories/products.repository.js";

/** A fresh shop database with one customer and two products. */
export async function shopDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await migrate(db);
  await db.query("INSERT INTO users (email, password_hash) VALUES ('ada@example.com', 'not-a-real-hash')");
  const products = new ProductsRepository(db);
  await products.upsert({ sku: "RICE-5KG", name: "Rice 5kg", priceKobo: 950_000, stock: 3 });
  await products.upsert({ sku: "OIL-1L", name: "Palm oil 1L", priceKobo: 250_050, stock: 10 });
  return db;
}
```

Before any service exists, the schema already guards the data. Try to break it:

schema-check.tsNode.js only

```ts
import { shopDatabase } from "./shop-db.js";

const db = await shopDatabase();
const attempts: [string, string][] = [
  ["an order for user 42", "INSERT INTO orders (user_id, status, total_kobo) VALUES (42, 'pending', 950000)"],
  ["an order line pointing at nothing", "INSERT INTO order_lines (order_id, sku, quantity, price_kobo) VALUES (1, 'SUGAR-1KG', 1, 1)"],
  ["negative stock", "UPDATE products SET stock = -1 WHERE sku = 'RICE-5KG'"],
  ["a made-up role", "INSERT INTO users (email, password_hash, role) VALUES ('eve@example.com', 'x', 'owner')"],
];
for (const [label, sql] of attempts) {
  try {
    await db.query(sql);
    console.log(`${label}: saved`);
  } catch (error) {
    console.log(`${label}: refused (${(error as { code?: string }).code})`);
  }
}
await db.close();
```

Output of `npx tsx schema-check.ts`

```ts
an order for user 42: refused (23503)
an order line pointing at nothing: refused (23503)
negative stock: refused (23514)
a made-up role: refused (23514)
```

`23503` is PostgreSQL's code for a broken foreign key, `23514` for a failed `CHECK`. These rules hold for every piece of code that will ever touch the database, including a hurried script at 2 a.m. In a monolith with one database, rules *between* areas (an order must belong to a real user) come for free. Split the users and the orders into two databases and this protection is gone; you would have to check it in code, over the network.

## Users, login and roles

Login is `@zudojs/auth`'s `createAuthService`, from [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth), reading users from the `users` table. The user's role goes into the token as a claim, so the HTTP layer can check "admins only" without another query:

src/services/auth.service.ts

```ts
import { createAuthService, createMemorySessionStore, hashPassword, normalizeLoginIdentifier, toUserId, verifyPassword } from "@zudojs/auth";
import type { AuthUser, TokenConfig } from "@zudojs/auth";
import { ValidationError } from "@zudojs/errors";
import type { UserRow, UsersRepository } from "../repositories/users.repository.js";

const toAuthUser = (row: UserRow): AuthUser =>
  ({ id: toUserId(String(row.id)), email: row.email, roles: [row.role], active: true, createdAt: new Date(0) });

export function createAccounts(users: UsersRepository, token: TokenConfig) {
  const auth = createAuthService({
    token,
    sessionStore: createMemorySessionStore(),
    sessionTtlSeconds: 30 * 60,
    absoluteSessionTtlSeconds: 7 * 24 * 60 * 60,
    findUser: async (email) => {
      const row = await users.findByEmail(normalizeLoginIdentifier(email));
      return row ? toAuthUser(row) : null;
    },
    findUserById: async (id) => {
      const row = await users.findById(Number(id));
      return row ? toAuthUser(row) : null;
    },
    verifyPassword: async (id, password) => {
      const row = await users.findById(Number(id));
      return row !== undefined && verifyPassword(password, row.password_hash);
    },
  });

  return {
    auth,
    async register(email: string, password: string, role: UserRow["role"] = "customer"): Promise<number> {
      if (password.length < 12) throw new ValidationError("A password needs at least 12 characters");
      const row = await users.create(normalizeLoginIdentifier(email), await hashPassword(password), role);
      return row.id;
    },
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
```

`register` always creates a `customer` unless the *code* asks for an admin. The HTTP route never passes a role from the request, so nobody can sign up as an admin. Admins are created by a seed script or by another admin.

The token settings for the examples are demo constants; in the real app they come from the environment, as in the auth lesson:

tokens.ts

```ts
import type { TokenConfig } from "@zudojs/auth";

// In the real app these come from the environment (see the auth lesson).
export const tokens: TokenConfig = {
  accessSecret: "demo-access-secret-at-least-32-characters",
  refreshSecret: "demo-refresh-secret-at-least-32-characters",
  accessTtl: 15 * 60,
  refreshTtl: 7 * 24 * 60 * 60,
  issuer: "shopflow",
  audience: "shopflow",
};
```

accounts.tsNode.js only

```ts
import { BaseError } from "@zudojs/errors";
import { UsersRepository } from "./src/repositories/users.repository.js";
import { createAccounts } from "./src/services/auth.service.js";
import { shopDatabase } from "./shop-db.js";
import { tokens } from "./tokens.js";

const db = await shopDatabase();
const accounts = createAccounts(new UsersRepository(db), tokens);

const bolaId = await accounts.register(" Bola@Example.com ", "a long enough passphrase");
console.log("registered user", bolaId);
for (const [email, password] of [["bola@example.com", "another passphrase"], ["chidi@example.com", "short"]]) {
  try {
    await accounts.register(email!, password!);
  } catch (error) {
    if (error instanceof BaseError) console.log(error.statusCode, error.message);
  }
}
const { tokens: pair } = await accounts.auth.login({ identifier: "bola@example.com", password: "a long enough passphrase" });
const claims = await accounts.auth.verifyToken(pair.accessToken);
console.log("token for user", claims.sub, "with roles", claims.roles);
await db.close();
```

Output of `npx tsx accounts.ts`

```ts
registered user 2
409 That email is already registered
400 A password needs at least 12 characters
token for user 2 with roles [ 'customer' ]
```

The email was normalized, so `" Bola@Example.com "` and `bola@example.com` are the same account, and the `UNIQUE` constraint turned the second sign-up into a 409. The token carries the user id and the role from the database.

The products service holds the catalog's rules: what a SKU looks like, that prices are whole kobo above zero, that stock is never negative:

src/services/products.service.ts

```ts
import { ValidationError } from "@zudojs/errors";
import type { Product, ProductsRepository } from "../repositories/products.repository.js";

export function createProducts(products: ProductsRepository) {
  return {
    async save(product: Product): Promise<void> {
      if (!/^[A-Z0-9-]{3,30}$/.test(product.sku)) throw new ValidationError("A SKU is 3 to 30 capital letters, digits or dashes");
      if (!Number.isInteger(product.priceKobo) || product.priceKobo < 1) throw new ValidationError("Prices are whole kobo above zero");
      if (!Number.isInteger(product.stock) || product.stock < 0) throw new ValidationError("Stock is a whole number, zero or more");
      await products.upsert(product);
    },
    list: () => products.list(),
  };
}
```

catalog.tsNode.js only

```ts
import { BaseError } from "@zudojs/errors";
import { ProductsRepository } from "./src/repositories/products.repository.js";
import { createProducts } from "./src/services/products.service.js";
import { shopDatabase } from "./shop-db.js";

const db = await shopDatabase();
const products = createProducts(new ProductsRepository(db));

const attempts = [
  { sku: "sugar 1kg", name: "Sugar 1kg", priceKobo: 120_000, stock: 20 },
  { sku: "SUGAR-1KG", name: "Sugar 1kg", priceKobo: 1_200.5, stock: 20 },
  { sku: "SUGAR-1KG", name: "Sugar 1kg", priceKobo: 120_000, stock: 20 },
];
for (const product of attempts) {
  try {
    await products.save(product);
    console.log("saved", product.sku);
  } catch (error) {
    if (error instanceof BaseError) console.log(error.statusCode, error.message);
  }
}
console.log((await products.list()).map((product) => `${product.sku}: ${product.stock}`));
await db.close();
```

Output of `npx tsx catalog.ts`

```ts
400 A SKU is 3 to 30 capital letters, digits or dashes
400 Prices are whole kobo above zero
saved SUGAR-1KG
[ 'OIL-1L: 10', 'RICE-5KG: 3', 'SUGAR-1KG: 20' ]
```

The service refuses a malformed SKU and a price with a fraction of a kobo before the database is asked. The rules are checked twice on purpose: the service gives clear messages, the database's `CHECK`s catch any code path that skips the service.

## Checkout: one transaction

Checkout is where the monolith earns its keep. Design it before writing it.

REASON IT OUT

### What must be true after checkout, whatever fails?

List what can go wrong between "the customer presses Pay" and "the order is paid": the cart, the stock, other customers, the payment provider, the process itself. For each, decide what state the shop must be in afterwards. Then decide which steps may share one database transaction, and which must not.

**Show the reasoning**

- **A bad cart** (empty, zero or fractional quantities, an unknown SKU): refuse before touching anything.
- **Not enough stock**: refuse, with nothing saved.
- **Two customers want the last item**: exactly one gets it. The stock check and the stock update must happen under a lock, in one transaction.
- **The process dies halfway** through saving the order: either the order, its lines and the stock change are all saved, or none are. That is exactly what a transaction gives.
- **The card is declined**: the order is cancelled and the stock goes back.
- **The provider is slow**: this is the trap. If the charge ran *inside* the transaction, the product rows would stay locked for as long as the provider takes, and every other checkout for those products would queue behind it. A network call must never happen while a transaction holds locks.

So checkout has three steps: **reserve** (one transaction: lock, check, create a pending order, take the stock), **charge** (outside any transaction, with the order id as the idempotency key from [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters#timeouts)), and **settle** (one short transaction: record the payment and mark the order paid, or put the stock back and cancel it).

The payment provider sits behind a small contract, as in [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters). This monolith uses the fake:

src/services/payments.service.ts

```ts
/** The payment provider, behind a small contract (see the adapters lesson). */
export interface PaymentGateway {
  charge(reference: string, amountKobo: number, cardToken: string):
    Promise<{ status: "succeeded"; chargeId: string } | { status: "declined"; reason: string }>;
}

export function createFakeGateway(): PaymentGateway {
  const charges = new Map<string, string>();
  return {
    async charge(reference, _amountKobo, cardToken) {
      if (cardToken === "tok_declined") return { status: "declined", reason: "insufficient funds" };
      const chargeId = charges.get(reference) ?? `ch_${charges.size + 1}`;
      charges.set(reference, chargeId);
      return { status: "succeeded", chargeId };
    },
  };
}
```

Now the three steps. Inside `db.transaction`, every repository is created with `tx`, so all its queries belong to that transaction:

src/services/checkout.service.ts

```ts
import { ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";
import type { EventBus } from "@zudojs/events";
import type { Database } from "../db.js";
import { OrdersRepository, type Order, type OrderLine } from "../repositories/orders.repository.js";
import { ProductsRepository } from "../repositories/products.repository.js";
import type { PaymentGateway } from "./payments.service.js";

export interface CartItem {
  readonly sku: string;
  readonly quantity: number;
}

export function createCheckout(db: Database, gateway: PaymentGateway, events: EventBus) {
  /** Step 1, one transaction: check stock, create the pending order, take the stock. */
  function reserve(userId: number, items: readonly CartItem[]): Promise<Order> {
    return db.transaction(async (tx) => {
      const products = new ProductsRepository(tx);
      const locked = await products.lockForUpdate(items.map((item) => item.sku));
      const lines: OrderLine[] = items.map(({ sku, quantity }) => {
        const product = locked.get(sku);
        if (product === undefined) throw new NotFoundError(`No product ${sku}`);
        if (quantity > product.stock) throw new ConflictError(`Only ${product.stock} of ${product.name} left`);
        return { sku, quantity, priceKobo: product.priceKobo };
      });
      const total = lines.reduce((sum, line) => sum + line.priceKobo * line.quantity, 0);
      const order = await new OrdersRepository(tx).create(userId, lines, total);
      for (const line of lines) await products.changeStock(line.sku, -line.quantity);
      return order;
    });
  }

  return {
    async checkout(userId: number, items: readonly CartItem[], cardToken: string) {
      if (items.length === 0 || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
        throw new ValidationError("The cart needs at least one item with a whole, positive quantity");
      }
      const order = await reserve(userId, items);
      const payment = await gateway.charge(`order-${order.id}`, order.totalKobo, cardToken);

      if (payment.status === "declined") {
        await db.transaction(async (tx) => {
          const orders = new OrdersRepository(tx);
          for (const line of await orders.lines(order.id)) await new ProductsRepository(tx).changeStock(line.sku, line.quantity);
          await orders.setStatus(order.id, "cancelled");
        });
        return { orderId: order.id, status: "cancelled" as const, reason: payment.reason };
      }

      await db.transaction(async (tx) => {
        const orders = new OrdersRepository(tx);
        await orders.recordPayment(order.id, payment.chargeId, order.totalKobo);
        await orders.setStatus(order.id, "paid");
      });
      await events.publishEvent({ type: "order.paid", payload: { orderId: order.id, userId, totalKobo: order.totalKobo } });
      return { orderId: order.id, status: "paid" as const, totalKobo: order.totalKobo };
    },
  };
}

export type Checkout = ReturnType<typeof createCheckout>;
```

First, prove the transaction. This wrapper runs every transaction's work and then throws just before the commit, like a power cut at the worst moment:

power-cut.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import type { Database } from "./src/db.js";
import { createCheckout } from "./src/services/checkout.service.js";
import { createFakeGateway } from "./src/services/payments.service.js";
import { shopDatabase } from "./shop-db.js";

const db = await shopDatabase();
// The same database, except that every transaction dies just before it would commit.
const powerCut: Database = {
  query: (sql, params) => db.query(sql, params),
  transaction: (work) => db.transaction(async (tx) => {
    await work(tx);
    throw new Error("power cut before COMMIT");
  }),
};

const checkout = createCheckout(powerCut, createFakeGateway(), createEventBus());
try {
  await checkout.checkout(1, [{ sku: "RICE-5KG", quantity: 2 }, { sku: "OIL-1L", quantity: 1 }], "tok_visa");
} catch (error) {
  console.log("checkout failed:", (error as Error).message);
}
const count = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0]!.n;
console.log("orders:", await count("SELECT count(*)::int AS n FROM orders"));
console.log("order lines:", await count("SELECT count(*)::int AS n FROM order_lines"));
console.log("rice in stock:", await count("SELECT stock AS n FROM products WHERE sku = 'RICE-5KG'"));
await db.close();
```

Output of `npx tsx power-cut.ts`

```ts
checkout failed: power cut before COMMIT
orders: 0
order lines: 0
rice in stock: 3
```

The order was inserted, its lines were inserted, and the rice stock was reduced, all inside the transaction. Then the "power cut" came, PostgreSQL rolled everything back, and the database looks as if the checkout never started. Compare that with the opening example. No saga, no compensation code: the database did it.

Now five customers try to buy one bag of rice each, at the same moment, with three bags in stock:

oversell.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { createCheckout } from "./src/services/checkout.service.js";
import { createFakeGateway } from "./src/services/payments.service.js";
import { shopDatabase } from "./shop-db.js";

const db = await shopDatabase();
const checkout = createCheckout(db, createFakeGateway(), createEventBus());

// Five customers press "Pay" for one bag of rice at the same moment. There are three bags.
const attempts = await Promise.allSettled(
  [1, 2, 3, 4, 5].map(() => checkout.checkout(1, [{ sku: "RICE-5KG", quantity: 1 }], "tok_visa")),
);
for (const attempt of attempts) {
  console.log(attempt.status === "fulfilled" ? `paid order ${attempt.value.orderId}` : `refused: ${(attempt.reason as Error).message}`);
}
const { rows } = await db.query<{ stock: number }>("SELECT stock FROM products WHERE sku = 'RICE-5KG'");
console.log("rice left:", rows[0]!.stock);
await db.close();
```

Output of `npx tsx oversell.ts`

```ts
paid order 1
paid order 2
paid order 3
refused: Only 0 of Rice 5kg left
refused: Only 0 of Rice 5kg left
rice left: 0
```

Exactly three orders, and the stock ends at zero, never below. Each checkout locked the rice row, checked the stock and took one bag before the next one could look. (PGlite runs one transaction at a time, so here they simply queue. On a PostgreSQL server with many connections, `FOR UPDATE` produces the same result: the fourth transaction waits for the lock, then sees zero.) The `CHECK (stock >= 0)` in the schema is the last line of defence if the code ever gets this wrong.

## Notifications through an in-process event

When an order is paid, the customer should hear about it. Checkout could call a notifications service directly, but then checkout would depend on it, and a slow or broken e-mail step would sit inside every payment. Instead, checkout publishes `order.paid` on an event bus, from [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events), and the notifications service listens:

src/services/notifications.service.ts

```ts
import type { Event, EventBus } from "@zudojs/events";
import type { Queryable } from "../db.js";

interface OrderPaid {
  readonly orderId: number;
  readonly userId: number;
  readonly totalKobo: number;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

/** Writes a notification for every paid order. A mail worker sends them later. */
export function registerNotifications(events: EventBus, db: Queryable): void {
  events.on<Event<OrderPaid>>("order.paid", async ({ payload }) => {
    await db.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
      [payload.userId, `Order ${payload.orderId} is paid: ${naira(payload.totalKobo)}. Thank you!`]);
  });
}
```

Publish a paid order with a second, broken listener, as if an analytics feature had a bug:

notify.tsNode.js only

```ts
import { createEventBus } from "@zudojs/events";
import { registerNotifications } from "./src/services/notifications.service.js";
import { shopDatabase } from "./shop-db.js";

const db = await shopDatabase();
const events = createEventBus();
registerNotifications(events, db);
events.on("order.paid", () => {
  throw new Error("analytics service is down");
});

const result = await events.publishEvent({ type: "order.paid", payload: { orderId: 7, userId: 1, totalKobo: 2_150_050 } });
console.log("handlers:", result.handlerCount, "failed:", result.failed);
const { rows } = await db.query<{ message: string }>("SELECT message FROM notifications");
console.log(rows.map((row) => row.message));
events.dispose();
await db.close();
```

Output of `npx tsx notify.ts`

```ts
handlers: 2 failed: 1
[ 'Order 7 is paid: ₦21,500.50. Thank you!' ]
```

The broken listener failed, the notification was still written, and the publisher learned about the failure from the result instead of an exception. In checkout, that means a bug in some listener can never turn a paid order back into an error for the customer.

The bus lives in the same process, so publishing costs a function call. It is not durable: if the process dies between the payment and the handler, the notification is lost. For a thank-you message that is acceptable. For something that must happen, such as shipping, [the outbox pattern](https://zudojs.oyinlola.site/learn/zudo-microservices#consistency) writes the event in the same transaction as the order.

## Routes and the composition root

All routes live in one file. Each one validates its body with `@zudojs/schema`, checks the login where needed, and calls a service. Errors from the services already carry their status codes (`ConflictError` is 409, `AuthorizationError` 403), and `@zudojs/http` turns them into responses:

src/routes/index.ts

```ts
import { AuthError, parseBearerToken } from "@zudojs/auth";
import { AuthorizationError } from "@zudojs/errors";
import { badRequest, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware, HttpRouter, HttpRouterContext } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import type { Queryable } from "../db.js";
import type { OrdersRepository } from "../repositories/orders.repository.js";
import type { Accounts } from "../services/auth.service.js";
import type { Checkout } from "../services/checkout.service.js";
import type { createProducts } from "../services/products.service.js";

const Credentials = schema.object({ email: schema.string().max(254), password: schema.string().max(1024) });
const ProductBody = schema.object({ name: schema.string().min(1).max(100), priceKobo: schema.number().int(), stock: schema.number().int() });
const CheckoutBody = schema.object({
  items: schema.array(schema.object({ sku: schema.string().max(30), quantity: schema.number().int() })).max(50),
  cardToken: schema.string().max(100),
});

export interface RouteDeps {
  readonly accounts: Accounts;
  readonly products: ReturnType<typeof createProducts>;
  readonly checkout: Checkout;
  readonly orders: OrdersRepository;
  readonly db: Queryable;
}

function body(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("Body must be JSON");
  }
}
const json = (status: number, data: unknown) => createResponseContext().setStatus(status).json(data);
const user = (ctx: { state: { get(key: string): unknown } }) => ctx.state.get("user") as { id: number; roles: readonly string[] };

export function registerRoutes({ accounts, products, checkout, orders, db }: RouteDeps): HttpRouter {
  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader("authorization"));
    const payload = token === null ? null : await accounts.auth.verifyToken(token).catch((error: unknown) => {
      if (error instanceof AuthError) return null;
      throw error;
    });
    if (payload === null) return json(401, { error: "Login required" });
    ctx.state.set("user", { id: Number(payload.sub), roles: payload.roles ?? [] });
    return next();
  };
  const requireAdmin: HttpMiddleware = async (ctx, next) => {
    if (!user(ctx).roles.includes("admin")) throw new AuthorizationError("Admins only");
    return next();
  };
  const router = createRouter();

  router.post("/auth/register", async (ctx) => {
    const { email, password } = Credentials.parse(body(ctx));
    return json(201, { id: await accounts.register(email, password) });
  });
  router.post("/auth/login", async (ctx) => {
    const { email, password } = Credentials.parse(body(ctx));
    const { tokens } = await accounts.auth.login({ identifier: email, password });
    return json(200, { accessToken: tokens.accessToken });
  });
  router.get("/products", async () => json(200, await products.list()));
  router.put("/products/:sku", async (ctx) => {
    await products.save({ sku: ctx.params.sku ?? "", ...ProductBody.parse(body(ctx)) });
    return json(204, null);
  }, { middleware: [requireUser, requireAdmin] });
  router.post("/orders", async (ctx) => {
    const { items, cardToken } = CheckoutBody.parse(body(ctx));
    return json(201, await checkout.checkout(user(ctx).id, items, cardToken));
  }, { middleware: [requireUser] });
  router.get("/orders", async (ctx) => json(200, await orders.history(user(ctx).id)), { middleware: [requireUser] });
  router.get("/notifications", async (ctx) => {
    const { rows } = await db.query<{ message: string }>("SELECT message FROM notifications WHERE user_id = $1 ORDER BY id", [user(ctx).id]);
    return json(200, rows.map((row) => row.message));
  }, { middleware: [requireUser] });
  return router;
}
```

`app.ts` creates every part once and connects them: one event bus, one set of repositories, one router. This is the whole wiring of the shop, in twenty lines:

src/app.ts

```ts
import type { TokenConfig } from "@zudojs/auth";
import { createEventBus } from "@zudojs/events";
import type { HttpRouter } from "@zudojs/http";
import type { Database } from "./db.js";
import { OrdersRepository } from "./repositories/orders.repository.js";
import { ProductsRepository } from "./repositories/products.repository.js";
import { UsersRepository } from "./repositories/users.repository.js";
import { registerRoutes } from "./routes/index.js";
import { createAccounts, type Accounts } from "./services/auth.service.js";
import { createCheckout } from "./services/checkout.service.js";
import { registerNotifications } from "./services/notifications.service.js";
import type { PaymentGateway } from "./services/payments.service.js";
import { createProducts } from "./services/products.service.js";

export interface ShopDeps {
  readonly db: Database;
  readonly tokens: TokenConfig;
  readonly gateway: PaymentGateway;
}

/** The composition root: every part of ShopFlow is created and connected here, once. */
export function createShop({ db, tokens, gateway }: ShopDeps): { router: HttpRouter; accounts: Accounts; dispose(): void } {
  const events = createEventBus();
  const accounts = createAccounts(new UsersRepository(db), tokens);
  const products = createProducts(new ProductsRepository(db));
  const checkout = createCheckout(db, gateway, events);
  registerNotifications(events, db);
  const router = registerRoutes({ accounts, products, checkout, orders: new OrdersRepository(db), db });
  return { router, accounts, dispose: () => events.dispose() };
}
```

`server.ts` starts it: one PostgreSQL database, one HTTP server on one port. In production, `db` is a connection pool to a PostgreSQL server and the port comes from configuration; the rest is identical:

src/server.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import type { TokenConfig } from "@zudojs/auth";
import { createNodeHttpAdapter } from "@zudojs/http";
import { createShop } from "./app.js";
import { migrate } from "./db.js";
import { createFakeGateway } from "./services/payments.service.js";

/** Starts the whole shop: one process, one database, one port. */
export async function startShop(tokens: TokenConfig) {
  const db = new PGlite();
  await migrate(db);
  const shop = createShop({ db, tokens, gateway: createFakeGateway() });
  const server = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await shop.router.dispatch(request)).response,
  });
  await server.start();
  return {
    url: `http://127.0.0.1:${server.address?.port}`,
    accounts: shop.accounts,
    db,
    async stop(): Promise<void> {
      await server.stop();
      shop.dispose();
      await db.close();
    },
  };
}
```

Now use the shop the way its users would:

try-shop.tsNode.js only

```ts
import { startShop } from "./src/server.js";
import { tokens } from "./tokens.js";

const shop = await startShop(tokens);
await shop.accounts.register("admin@shopflow.ng", "a long admin passphrase", "admin");

async function call(method: string, path: string, body?: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(shop.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (path !== "/auth/login") console.log(method, path, res.status, text);
  return text ? JSON.parse(text) : null;
}
const login = async (email: string, password: string) =>
  ((await call("POST", "/auth/login", { email, password })) as { accessToken: string }).accessToken;

const admin = await login("admin@shopflow.ng", "a long admin passphrase");
await call("PUT", "/products/RICE-5KG", { name: "Rice 5kg", priceKobo: 950_000, stock: 3 }, admin);
await call("PUT", "/products/OIL-1L", { name: "Palm oil 1L", priceKobo: 250_050, stock: 10 }, admin);
await call("POST", "/auth/register", { email: "ada@example.com", password: "correct horse battery staple" });
const ada = await login("ada@example.com", "correct horse battery staple");
await call("PUT", "/products/RICE-5KG", { name: "Free rice", priceKobo: 1, stock: 99 }, ada);
await call("POST", "/orders", { items: [{ sku: "RICE-5KG", quantity: 2 }, { sku: "OIL-1L", quantity: 1 }], cardToken: "tok_visa" }, ada);
await call("POST", "/orders", { items: [{ sku: "RICE-5KG", quantity: 2 }], cardToken: "tok_visa" }, ada);
await call("POST", "/orders", { items: [{ sku: "OIL-1L", quantity: 4 }], cardToken: "tok_declined" }, ada);
await call("GET", "/orders", undefined, ada);
await call("GET", "/products");
await call("GET", "/notifications", undefined, ada);
await shop.stop();
```

Output of `npx tsx try-shop.ts`

```ts
PUT /products/RICE-5KG 204
PUT /products/OIL-1L 204
POST /auth/register 201 {"id":2}
PUT /products/RICE-5KG 403 {"error":"Admins only","code":"ERR_FORBIDDEN"}
POST /orders 201 {"orderId":1,"status":"paid","totalKobo":2150050}
POST /orders 409 {"error":"Only 1 of Rice 5kg left","code":"ERR_CONFLICT"}
POST /orders 201 {"orderId":2,"status":"cancelled","reason":"insufficient funds"}
GET /orders 200 [{"id":1,"status":"paid","totalKobo":2150050,"items":"1 x Palm oil 1L, 2 x Rice 5kg"},{"id":2,"status":"cancelled","totalKobo":1000200,"items":"4 x Palm oil 1L"}]
GET /products 200 [{"sku":"OIL-1L","name":"Palm oil 1L","priceKobo":250050,"stock":9},{"sku":"RICE-5KG","name":"Rice 5kg","priceKobo":950000,"stock":1}]
GET /notifications 200 ["Order 1 is paid: ₦21,500.50. Thank you!"]
```

Read it as a story. The admin stocks two products. Ada signs up; her attempt to set a price is refused with 403, because her token says `customer`. Her first order takes two of the three bags of rice and one bottle of oil, and is paid. Her second order wants two more bags and gets a 409: only one is left. Her third order is declined by the card provider, so it is cancelled and the four bottles of oil go back on the shelf (stock is 9, not 5). The order history joins three tables in one query, and the notification was written by the event handler.

## What the monolith gives you

- **One transaction across areas.** Orders, stock and payments changed together or not at all, with no extra code.
- **Calls are function calls.** Checkout calling the products repository cannot time out, arrive twice or find the other side deployed at a different version.
- **One deploy, one log, one debugger.** A bug report leads to one process and one stack trace. `try-shop.ts` started the entire shop in a few lines.
- **Refactoring is cheap.** Renaming a function across users, orders and payments is one change in one commit, checked by one type checker.
- **End-to-end tests are easy.** The whole system fits in one test process, as in [Testing a ZudoJS application](https://zudojs.oyinlola.site/learn/zudo-testing-apps).

For a small team and a new product, these are decisive. Most products that are now large started as a monolith, and many large ones still are.

## Where it starts to strain

Six months later ShopFlow has twelve developers and forty tables. Nothing in the code stops any file from using any table, so it is worth measuring who uses what. This script lists the tables each source file touches:

who-uses-what.tsNode.js only

```ts
import { readdir, readFile } from "node:fs/promises";

const TABLES = ["users", "products", "orders", "order_lines", "payments", "notifications"];
const files = (await readdir("src", { recursive: true })).filter((file) => file.endsWith(".ts")).sort();

for (const file of files) {
  const code = await readFile(`src/${file}`, "utf8");
  const sql = [...code.matchAll(/"((?:SELECT|INSERT|UPDATE|DELETE)[^"]*)"|`((?:\s*)(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`/g)]
    .map((match) => match[1] ?? match[2] ?? "").join(" ");
  const used = TABLES.filter((table) => new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+${table}\\b`).test(sql));
  if (used.length > 0) console.log(file.padEnd(38), used.join(", "));
}
```

Output of `npx tsx who-uses-what.ts`

```ts
repositories/orders.repository.ts      products, orders, order_lines, payments
repositories/products.repository.ts    products
repositories/users.repository.ts       users
routes/index.ts                        notifications
services/notifications.service.ts      notifications
```

Even this small codebase shows the pattern:

- **The orders code reads the products table.** The `history` query joins `products`, and checkout changes stock through `ProductsRepository`. If the catalog team renames `products.name`, or moves products to a search engine, orders break. Nobody in the orders team was asked.
- **A route queries a table directly.** `GET /notifications` skips the service and repository layers. It was a quick fix; it is also the first step towards the "big ball of mud" that [the next lesson](https://zudojs.oyinlola.site/learn/zudo-modular-monolith#monolith) opens with.
- **Every rule has many doors.** The stock rule lives in checkout, but any new feature (a restock screen, a promotion) can import `ProductsRepository` and change stock without it.
- **Everything ships together.** A typo fix in a notification message redeploys checkout. A memory leak in a new image-resizing feature can crash the process that takes payments.
- **Everything scales together.** On sale days the catalog gets a hundred times more reads than checkout, but you can only run more copies of the whole shop.

None of these is a reason to panic, and none is fixed by splitting into services on day one. They are signals. The first three are about **boundaries inside the code**, and the next lesson fixes them without leaving one process. The last two are about **deployment and scaling**; only separate processes fix those, at the price [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices) spells out.

|  | Monolith | Modular monolith | Microservices |
| --- | --- | --- | --- |
| Deployments | One | One | One per service |
| Code boundaries | Folders and habits | Enforced public APIs per module | Network APIs |
| Data | One schema, shared tables | One database, a schema per module | A database per service |
| Checkout consistency | One transaction | One transaction | Sagas and outboxes |
| Calls between areas | Function calls | Function calls, events, commands | HTTP, RPC, messages |
| A crash in one area | Takes down all | Takes down all | Stays in its service |
| Fits | Small teams, new products | Growing teams, one product | Many teams, very different loads |

## Running a monolith in production

- **Run several copies.** A monolith is not a single server. Keep no state in memory that another copy needs: sessions, carts and rate-limit counters go to the database or Redis, and the in-memory session store of this lesson becomes a shared one. Then a load balancer can spread traffic over three copies, and one can restart while the others serve.
- **Keep transactions short.** No network calls, no waiting for users, no big loops while locks are held, exactly as checkout does.
- **Size the connection pool.** Every copy opens a pool; the database has a limit. Three copies with a pool of 10 need 30 connections.
- **Migrate carefully.** One schema means one migration can break every area. Make changes in backward-compatible steps (add a column, deploy, backfill, then remove the old one).
- **Watch the whole.** One process makes logging, metrics and tracing simple: add them once, in the composition root, as in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability).

## Practice

TRY IT YOURSELF

### Cancel an order

Write `cancelOrder(db, orderId)`: in one transaction, put every line's quantity back into stock and mark the order `cancelled`. Refuse to cancel an order that is already cancelled. Check it with a paid order, then cancel it twice.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Start with `const { rows } = await tx.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [orderId]);`, then the two guard `if`s with their `throw`s.

HINT 2

`for (const line of await orders.lines(orderId)) await products.changeStock(line.sku, line.quantity);` then `await orders.setStatus(orderId, "cancelled");`.

SOLUTION

cancel.tsNode.js only

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import { createEventBus } from "@zudojs/events";
import type { Database } from "./src/db.js";
import { OrdersRepository } from "./src/repositories/orders.repository.js";
import { ProductsRepository } from "./src/repositories/products.repository.js";
import { createCheckout } from "./src/services/checkout.service.js";
import { createFakeGateway } from "./src/services/payments.service.js";
import { shopDatabase } from "./shop-db.js";

async function cancelOrder(db: Database, orderId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: string }>("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    if (rows[0] === undefined) throw new NotFoundError(`Order ${orderId} not found`);
    if (rows[0].status === "cancelled") throw new ConflictError(`Order ${orderId} is already cancelled`);
    const orders = new OrdersRepository(tx);
    const products = new ProductsRepository(tx);
    for (const line of await orders.lines(orderId)) await products.changeStock(line.sku, line.quantity);
    await orders.setStatus(orderId, "cancelled");
  });
}

const db = await shopDatabase();
const checkout = createCheckout(db, createFakeGateway(), createEventBus());
const stock = async () => (await db.query<{ stock: number }>("SELECT stock FROM products WHERE sku = 'RICE-5KG'")).rows[0]!.stock;

const { orderId } = await checkout.checkout(1, [{ sku: "RICE-5KG", quantity: 2 }], "tok_visa");
console.log("after checkout:", await stock());
await cancelOrder(db, orderId);
console.log("after cancel:", await stock());
try {
  await cancelOrder(db, orderId);
} catch (error) {
  console.log((error as Error).name, (error as Error).message, "- stock:", await stock());
}
await db.close();
```

Output of `npx tsx cancel.ts`

```ts
after checkout: 1
after cancel: 3
ConflictError Order 1 is already cancelled - stock: 3
```

The status is read with `FOR UPDATE`, so two cancel requests for the same order cannot both pass the check and put the stock back twice. A real shop would also refund the payment; that is a network call, so it happens after the transaction, like the charge in checkout.

TRY IT YOURSELF

### Draw the ownership map

Decide which area owns each table: users own `users`, products own `products`, orders own `orders`, `order_lines` and `payments`, notifications own `notifications`. Extend the "who uses what" idea: for a list of files with their area and the tables they touch, print every use of a table owned by *another* area.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Two nested loops: `for (const { file, area, tables } of files) { for (const table of tables) { ... } }`.

HINT 2

Inside both loops: `if (owner[table] !== area) console.log(\`${file} (${area}) uses ${table}, owned by ${owner[table]}\`);`.

SOLUTION

ownership.js

```ts
const owner = {
  users: "users", products: "products",
  orders: "orders", order_lines: "orders", payments: "orders",
  notifications: "notifications",
};
const files = [
  { file: "repositories/orders.repository.ts", area: "orders", tables: ["products", "orders", "order_lines", "payments"] },
  { file: "repositories/products.repository.ts", area: "products", tables: ["products"] },
  { file: "repositories/users.repository.ts", area: "users", tables: ["users"] },
  { file: "routes/index.ts", area: "http", tables: ["notifications"] },
  { file: "services/notifications.service.ts", area: "notifications", tables: ["notifications"] },
];

for (const { file, area, tables } of files) {
  for (const table of tables) {
    if (owner[table] !== area) console.log(`${file} (${area}) uses ${table}, owned by ${owner[table]}`);
  }
}
```

Output of `node ownership.js` and of the browser terminal

```ts
repositories/orders.repository.ts (orders) uses products, owned by products
routes/index.ts (http) uses notifications, owned by notifications
```

Each line is a dependency between areas that the code does not declare anywhere. The next lesson removes both: the orders module asks the catalog through its public API instead of joining its table, and the notifications route goes through its own module.

TRY IT YOURSELF

### Split it or not?

For each situation, choose: keep the monolith, make it a modular monolith, or extract a service. (a) Three developers, 200 orders a day, weekly releases. (b) The catalog is slow on sale days because product pages are read constantly. (c) Five teams, 40 developers; releases wait for each other and teams break each other's tables. (d) A new fraud-checking feature needs a different language and must keep running even when the shop is being deployed.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Is the strain about people (teams blocking each other), about one hot path being slow, or about something a monolith genuinely cannot do at all (a different language, independent uptime)?

HINT 2

A modular monolith fixes boundaries inside one codebase; it does not, by itself, give a component its own language or its own deploy schedule. When do you actually need that?

SOLUTION

1. **Keep the monolith.** None of the strains exists yet; splitting would add work and no benefit.
2. **Keep it, and cache.** Slow reads are fixed with an index, a cache ([the cache lesson](https://zudojs.oyinlola.site/learn/zudo-cache)) or a read replica long before they need a separate service.
3. **Modular monolith first.** The problem is boundaries between teams inside the code and the data. Modules with public APIs and a schema each fix that; extract services later, one at a time, only where teams still block each other.
4. **Extract a service.** A different language, and availability independent of the shop's deployments, are exactly the reasons microservices exist.

## Recap

- A monolith is one deployable program with one codebase and usually one database. For a small team and a new product it is the right default, not a compromise.
- Structure it in layers (routes, services, repositories) with one composition root. SQL only in repositories, rules only in services.
- One database lets checkout be atomic: `db.transaction` plus `SELECT … FOR UPDATE` made the order, its lines and the stock change all-or-nothing, and prevented overselling.
- Never hold a transaction open across a network call: reserve, charge outside, then settle.
- Watch for the strains: code reaching into other areas' tables, rules with many doors, everything shipping and scaling together. The first kind is fixed by modules; the second only by separate services.

Next, you give each area of ShopFlow a hard edge, a public API and its own data, while keeping one deployment: [the modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
