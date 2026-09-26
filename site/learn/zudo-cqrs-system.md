---
title: "A CQRS system — ZudoJS Academy"
description: "Build ShopFlow orders as a full CQRS system: transactional commands with an outbox, a projected read model, typed buses, an HTTP API and one trace end to end."
source: https://zudojs.oyinlola.site/learn/zudo-cqrs-system
---

LEVEL 15 · LESSON 5 OF 5

Event-driven and CQRS systems Advanced

# A CQRS system

Build ShopFlow orders as a full CQRS system: transactional commands with an outbox, a projected read model, typed buses, an HTTP API and one trace end to end.

- **60 min** to read and try
- **You need:** Event-driven systems, Commands and queries (CQRS), Transactions and Observability in ZudoJS
- **You build:** A ShopFlow order service with a PGlite write model, an order-summary read model kept up to date through a queue, an HTTP API and a trace that follows each order from request to projection

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Separate a write model that enforces rules from a read model shaped for one screen
- Run commands in a transaction that also records their events in an outbox
- Keep a read model up to date with a projector that handles duplicates and out-of-order events
- Give clients read-your-writes with versions, and API errors that say what to do next
- Follow one trace id from the HTTP request through the command, the queue and the projection

## The order page that lies

ShopFlow charges a ₦1,500 delivery fee on orders under ₦50,000. The rule lives where it belongs, in the code that places orders. The "My orders" page was written later, by someone else, as a query over the same tables: it adds up the order lines. Here are both:

page-lies.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  CREATE TABLE orders (id text PRIMARY KEY, customer_id text NOT NULL, total_kobo integer NOT NULL);
  CREATE TABLE order_lines (order_id text NOT NULL, sku text NOT NULL, qty integer NOT NULL, price_kobo integer NOT NULL);
`);

const DELIVERY_FEE_KOBO = 150_000;
const FREE_DELIVERY_FROM_KOBO = 5_000_000;

async function placeOrder(id: string, customerId: string, lines: { sku: string; qty: number; priceKobo: number }[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.priceKobo, 0);
  const total = subtotal < FREE_DELIVERY_FROM_KOBO ? subtotal + DELIVERY_FEE_KOBO : subtotal;
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO orders VALUES ($1, $2, $3)", [id, customerId, total]);
    for (const line of lines) await tx.query("INSERT INTO order_lines VALUES ($1, $2, $3, $4)", [id, line.sku, line.qty, line.priceKobo]);
  });
}

await placeOrder("ORD-1", "cus_ada", [{ sku: "OIL-5L", qty: 1, priceKobo: 1_250_000 }]);
await placeOrder("ORD-2", "cus_ada", [{ sku: "RICE-50KG", qty: 1, priceKobo: 7_500_000 }]);

const charged = await db.query<{ id: string; total_kobo: number }>("SELECT id, total_kobo FROM orders ORDER BY id");
const page = await db.query<{ id: string; total_kobo: number }>(`
  SELECT o.id, sum(l.qty * l.price_kobo)::int AS total_kobo
  FROM orders o JOIN order_lines l ON l.order_id = o.id
  WHERE o.customer_id = 'cus_ada' GROUP BY o.id ORDER BY o.id`);

for (const [i, row] of charged.rows.entries()) {
  console.log(`${row.id}: charged ₦${row.total_kobo / 100}, "My orders" shows ₦${(page.rows[i]?.total_kobo ?? 0) / 100}`);
}
```

Output of `npx tsx page-lies.ts`

```ts
ORD-1: charged ₦14000, "My orders" shows ₦12500
ORD-2: charged ₦75000, "My orders" shows ₦75000
```

Ada was charged ₦14,000 and her order page says ₦12,500. Nobody wrote a wrong line of SQL: the page recomputed a business rule it did not know about. Every read that re-derives what the write side decided (totals, statuses, discounts) is a second copy of the rules, and copies drift.

The same page has a second problem that only shows at scale. It is read far more often than orders are placed, and every view joins and sums lines over the tables that checkout is locking and updating. The two sides want different things from the same tables:

|  | Write side (checkout) | Read side (order pages) |
| --- | --- | --- |
| Wants | Correctness: stock never negative, one decision per order | Speed: one cheap query per page, shaped for the screen |
| Data shape | Normalised: products, orders, lines | Denormalised: one row per order with everything the page shows |
| Load | Few requests, each in a transaction with locks | Many requests, read only |

In [Commands and queries](https://zudojs.oyinlola.site/learn/zudo-cqrs) you separated the *code* for changes and reads. This lesson separates the *data*: a **write model** that enforces the rules, and a **read model** that is computed from what the write model decided, then kept up to date by events. That is full CQRS, and it combines nearly everything from the last few lessons: `@zudojs/cqrs` buses, `@zudojs/transactions`, an outbox, a `@zudojs/queue`, an HTTP API with `@zudojs/http` and `@zudojs/observability`. Everything runs in one process on PGlite, so every example runs on your computer.

## Before you split the model

REASON IT OUT

### What can go wrong between a command and the page that shows it?

1. Two customers try to buy the last bag of rice at the same moment. Where is the rule "stock never goes below zero" enforced, and by what?
2. The client times out and sends `PlaceOrder` again. Can Ada end up with two orders?
3. Ada opens the cancel page, goes for lunch, and her husband cancels the same order from his phone. Then Ada presses "Cancel". What should happen?
4. Ada places an order and the app immediately loads "My orders". The read model is updated by a queue. What does she see?
5. The projector receives "order cancelled" before "order placed" for the same order. What should it do?
6. A support agent asks why order ORD-1042 shows the wrong status. What would you need to follow that one order through the system?

**Show the reasoning**

1. In the write model, inside one transaction: lock the product row, check the stock, then decrement it. A `CHECK (stock >= 0)` constraint is the last line of defence. The read model never enforces rules; it only shows results.
2. Only if the command is not idempotent. Let the client choose the order id, and make `PlaceOrder` return the existing order when that id was already placed by the same customer.
3. Ada's page is stale. Every order carries a **version** that goes up with each change; the cancel command says which version the client saw, and the write model refuses it with a conflict when that is no longer the current version. This is **optimistic concurrency**.
4. Possibly nothing, for a few milliseconds: the read model is **eventually consistent**. The command returns the new version; the query can ask for "at least this version" and answer "not yet, retry in a second" instead of showing an old page as if it were current.
5. Not apply it. Each event carries the order's version; the projector applies only the next version, skips versions it already has (duplicates) and fails on a gap, so the queue retries it after the missing event arrives.
6. One id that every log line and every span carries, from the HTTP request through the command, the outbox, the queue and the projector: a trace id.

## The design

```ts
 HTTP  POST /orders ──► API layer ──► command bus ──► PlaceOrder handler
                        (user, trace)  (middleware)    manager.run(transaction)
                                                       ├─ products: check + reserve stock
                                                       ├─ orders, order_lines: version 1
                                                       └─ outbox: order.placed v1 + traceparent
                                                                  │ commit
                                                                  ▼
                                    relay ──► queue "projections" ──► projector
                                                                       └─ order_summaries (read model)
                                                                                 ▲
 HTTP  GET /orders/:id ──► API layer ──► query bus ──► GetOrder handler ─────────┘
                                                       (read-only transaction)
```

Commands write the write model and the outbox in one transaction; the read model is only ever written by the projector.

The new vocabulary:

- A **projection** is a read model computed from events, and the **projector** is the code that applies each event to it. "Project" here means "turn events into a shape for reading".
- The **aggregate** is the unit the write model protects as a whole, here one order. Each aggregate has a **version** that goes up by one with every change, and every event records the version it produced.
- **Eventual consistency**: after a write, the read model catches up a little later. **Read-your-writes** is the promise that a user who just changed something sees their change, and it has to be designed, not assumed.

The write model is the source of truth. The read model is disposable: you can delete it and rebuild it from the recorded events at any time, which the [rebuild section](#rebuild) does.

## Messages, and buses that cannot lie

Start with the messages: two commands, two queries, the results, and the events the write side records. The last two interfaces map each request type to its request and result, which will matter in a moment:

messages.ts

```ts
import type { CommandOf, QueryOf } from "@zudojs/cqrs";

export interface OrderLine { readonly sku: string; readonly qty: number }

export type PlaceOrder = CommandOf<"PlaceOrder", { orderId: string; lines: OrderLine[] }>;
export type CancelOrder = CommandOf<"CancelOrder", { orderId: string; expectedVersion: number }>;
export type GetOrder = QueryOf<"GetOrder", { orderId: string; minVersion?: number }>;
export type ListMyOrders = QueryOf<"ListMyOrders">;

export interface Placed { readonly orderId: string; readonly version: number; readonly totalKobo: number }
export interface Cancelled { readonly orderId: string; readonly version: number }

export interface OrderSummary {
  readonly orderId: string;
  readonly status: string;
  readonly totalKobo: number;
  readonly items: number;
  readonly version: number;
}

/** Events the write side records in the outbox. */
export interface OrderPlacedEvent {
  readonly type: "order.placed";
  readonly orderId: string;
  readonly customerId: string;
  readonly totalKobo: number;
  readonly items: number;
}
export interface OrderCancelledEvent {
  readonly type: "order.cancelled";
  readonly orderId: string;
}
export type OrderEvent = OrderPlacedEvent | OrderCancelledEvent;

/** Each request type with its request and result: the single source of truth for the buses. */
export interface Commands {
  PlaceOrder: readonly [PlaceOrder, Placed];
  CancelOrder: readonly [CancelOrder, Cancelled];
}
export interface Queries {
  GetOrder: readonly [GetOrder, OrderSummary];
  ListMyOrders: readonly [ListMyOrders, OrderSummary[]];
}
```

Why the maps? Because `@zudojs/cqrs` takes the result type of `execute` as a type argument that nothing checks, as you saw in [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs#zudo):

claim.ts

```ts
import { createCommandBus } from "@zudojs/cqrs";
import type { Placed, PlaceOrder } from "./messages.js";

const bus = createCommandBus();
bus.register<PlaceOrder, Placed>("PlaceOrder", async (command) => ({ orderId: command.orderId, version: 1, totalKobo: 900_000 }));

const result = await bus.execute<PlaceOrder, { receiptUrl: string }>({ type: "PlaceOrder", orderId: "ORD-7", lines: [] });
console.log("receipt at", result.receiptUrl);
```

Output of `npx tsx claim.ts` and of the browser terminal

```ts
receipt at undefined
```

The caller claimed a result the handler never returns, and the compiler believed it. In a system with dozens of commands, every `execute<C, R>` in the API layer is such a claim. A thin facade removes all of them: registration and execution both look the request type up in the map, so the handler's return type and the caller's result type are the same type by construction. The one unavoidable cast lives inside the facade:

typed.ts

```ts
import type { CommandBus, CqrsContext, QueryBus } from "@zudojs/cqrs";

/** Maps each request type to [request, result]. */
export type Spec<M> = { [K in keyof M]: readonly [{ readonly type: K }, unknown] };

export interface Typed<M extends Spec<M>> {
  register<K extends keyof M & string>(type: K, handler: (request: M[K][0], context?: CqrsContext) => Promise<M[K][1]>): void;
  execute<K extends keyof M & string>(request: M[K][0] & { readonly type: K }, context?: CqrsContext): Promise<M[K][1]>;
}

export function typed<M extends Spec<M>>(bus: CommandBus | QueryBus): Typed<M> {
  return {
    register: (type, handler) => void bus.register(type, handler),
    execute: (request, context) => bus.execute(request, context) as Promise<never>,
  };
}
```

typed-misuse.ts

```ts
import { createCommandBus } from "@zudojs/cqrs";
import type { Commands } from "./messages.js";
import { typed } from "./typed.js";

const commands = typed<Commands>(createCommandBus());
commands.register("PlaceOrder", async (command) => ({ orderId: command.orderId, version: 1 }));

const placed = await commands.execute({ type: "PlaceOrder", orderId: "ORD-7", lines: [] });
const receipt: string = placed.receiptUrl;
await commands.execute({ type: "CancelOrder", orderId: "ORD-7" });
```

What `npx tsc --noEmit` prints

```ts
typed-misuse.ts:6:52 - error TS2322: Type 'Promise<{ orderId: string; version: number; }>' is not assignable to type 'Promise<Placed>'.
  Property 'totalKobo' is missing in type '{ orderId: string; version: number; }' but required in type 'Placed'.

6 commands.register("PlaceOrder", async (command) => ({ orderId: command.orderId, version: 1 }));
                                                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  messages.ts:10:88 - 'totalKobo' is declared here.
    10 export interface Placed { readonly orderId: string; readonly version: number; readonly totalKobo: number }
                                                                                              ~~~~~~~~~

  typed.ts:7:58 - The expected type comes from the return type of this signature.
    7   register<K extends keyof M & string>(type: K, handler: (request: M[K][0], context?: CqrsContext) => Promise<M[K][1]>): void;
                                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

typed-misuse.ts:9:32 - error TS2339: Property 'receiptUrl' does not exist on type 'Placed'.

9 const receipt: string = placed.receiptUrl;
                                 ~~~~~~~~~~

typed-misuse.ts:10:24 - error TS2345: Argument of type '{ type: "CancelOrder"; orderId: string; }' is not assignable to parameter of type 'Readonly<{ readonly type: "CancelOrder"; } & Omit<{ orderId: string; expectedVersion: number; }, "type">> & { readonly type: "CancelOrder"; }'.
  Property 'expectedVersion' is missing in type '{ type: "CancelOrder"; orderId: string; }' but required in type 'Readonly<{ readonly type: "CancelOrder"; } & Omit<{ orderId: string; expectedVersion: number; }, "type">>'.

10 await commands.execute({ type: "CancelOrder", orderId: "ORD-7" });
                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  messages.ts:6:71 - 'expectedVersion' is declared here.
    6 export type CancelOrder = CommandOf<"CancelOrder", { orderId: string; expectedVersion: number }>;
                                                                            ~~~~~~~~~~~~~~~


Found 3 errors in the same file, starting at: typed-misuse.ts:6
```

Three mistakes, three compile errors: a handler that forgets the total, a caller that invents a field, and a command without its `expectedVersion`. The underlying bus is still a real `@zudojs/cqrs` bus, with its middleware, context and errors.

## The write model

The write side needs transactions that span several functions, so it uses `@zudojs/transactions` with a PGlite adapter, like [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions). One difference matters here. PGlite is a single connection, and in this system the API, the relay and the projector all use the database at the same time. Two transactions on one connection would mix their statements, so this adapter makes `begin` wait until the previous transaction has finished. With a real PostgreSQL pool, each transaction gets its own connection and no such lock is needed:

adapter.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import type { TransactionAdapter } from "@zudojs/transactions";

/** PGlite is one connection: one transaction at a time, so begin() waits its turn. */
export function pgliteAdapter(pg: PGlite): TransactionAdapter {
  let tail: Promise<void> = Promise.resolve();
  let release = () => {};
  const finish = async (sql: string) => {
    try {
      await pg.exec(sql);
    } finally {
      release();
    }
  };
  return {
    capabilities: { savepoints: false, nestedTransactions: false, isolationLevels: [], readOnlyTransactions: true, timeouts: false },
    async begin(options) {
      const previous = tail;
      let unlock = () => {};
      tail = new Promise<void>((resolve) => (unlock = resolve));
      await previous;
      release = unlock;
      await pg.exec(options?.readOnly ? "BEGIN READ ONLY" : "BEGIN");
      return pg;
    },
    commit: () => finish("COMMIT"),
    rollback: () => finish("ROLLBACK"),
  };
}
```

The store creates the tables, the transaction manager and a `db()` helper that returns the current transaction's connection and throws outside a transaction, so no query can accidentally run unprotected. The write tables are `products`, `orders`, `order_lines` and `outbox`; `order_summaries` is the read model:

store.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import { createTransactionManager } from "@zudojs/transactions";
import { pgliteAdapter } from "./adapter.js";

/** The package exports the factory but no named type for what it returns. */
type TransactionManager = ReturnType<typeof createTransactionManager>;

export interface Store {
  readonly manager: TransactionManager;
  /** The connection of the transaction in progress; queries never run outside one. */
  db(): PGlite;
}

export async function createStore(): Promise<Store> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE products (sku text PRIMARY KEY, name text NOT NULL, price_kobo integer NOT NULL, stock integer NOT NULL CHECK (stock >= 0));
    CREATE TABLE orders (id text PRIMARY KEY, customer_id text NOT NULL, status text NOT NULL, total_kobo integer NOT NULL, version integer NOT NULL);
    CREATE TABLE order_lines (order_id text NOT NULL REFERENCES orders, sku text NOT NULL REFERENCES products, qty integer NOT NULL, price_kobo integer NOT NULL);
    CREATE TABLE outbox (
      seq serial PRIMARY KEY, event_id text NOT NULL UNIQUE, type text NOT NULL,
      order_id text NOT NULL, version integer NOT NULL, payload jsonb NOT NULL,
      traceparent text, published_at timestamptz
    );
    CREATE TABLE order_summaries (
      order_id text PRIMARY KEY, customer_id text NOT NULL, status text NOT NULL,
      total_kobo integer NOT NULL, items integer NOT NULL, version integer NOT NULL
    );
    INSERT INTO products VALUES
      ('RICE-50KG', 'Rice, 50 kg bag', 7500000, 3),
      ('OIL-5L', 'Groundnut oil, 5 litres', 1250000, 10),
      ('SALT-1KG', 'Salt, 1 kg', 60000, 40);
  `);
  const manager = createTransactionManager({ adapter: pgliteAdapter(pg) });
  return {
    manager,
    db() {
      const handle = manager.getCurrentHandle<PGlite>();
      if (!handle) throw new Error("db() needs a transaction in progress");
      return handle;
    },
  };
}
```

Now the command handlers. Read them against the questions you answered at the start:

write.ts

```ts
import type { CqrsContext } from "@zudojs/cqrs";
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";
import { formatTraceparent, getCurrentContext } from "@zudojs/observability";
import type { Commands, OrderEvent } from "./messages.js";
import type { Typed } from "./typed.js";
import type { Store } from "./store.js";

export function requireUser(context?: CqrsContext): string {
  if (!context?.userId) throw new AuthenticationError("Sign in first");
  return context.userId;
}

export function registerWriteSide(commands: Typed<Commands>, { manager, db }: Store): void {
  async function record(event: OrderEvent, version: number): Promise<void> {
    const trace = getCurrentContext();
    await db().query(
      "INSERT INTO outbox (event_id, type, order_id, version, payload, traceparent) VALUES ($1, $2, $3, $4, $5, $6)",
      [`${event.orderId}.v${version}`, event.type, event.orderId, version, event, trace ? formatTraceparent(trace) ?? null : null],
    );
  }

  commands.register("PlaceOrder", (command, context) => manager.run(async () => {
    const customerId = requireUser(context);
    const existing = (await db().query<{ customer_id: string; total_kobo: number }>(
      "SELECT customer_id, total_kobo FROM orders WHERE id = $1", [command.orderId])).rows[0];
    if (existing) {
      if (existing.customer_id !== customerId) throw new ConflictError(`Order id ${command.orderId} is taken`);
      return { orderId: command.orderId, version: 1, totalKobo: existing.total_kobo };
    }
    if (command.lines.length === 0 || command.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) {
      throw new ValidationError("An order needs lines with a whole quantity of at least 1");
    }
    const priced: { sku: string; qty: number; price: number }[] = [];
    for (const line of command.lines) {
      const product = (await db().query<{ price_kobo: number; stock: number }>(
        "SELECT price_kobo, stock FROM products WHERE sku = $1 FOR UPDATE", [line.sku])).rows[0];
      if (!product) throw new ValidationError(`Unknown product ${line.sku}`);
      if (product.stock < line.qty) throw new ConflictError(`Only ${product.stock} of ${line.sku} left`);
      await db().query("UPDATE products SET stock = stock - $2 WHERE sku = $1", [line.sku, line.qty]);
      priced.push({ ...line, price: product.price_kobo });
    }
    const totalKobo = priced.reduce((sum, l) => sum + l.price * l.qty, 0);
    await db().query("INSERT INTO orders (id, customer_id, status, total_kobo, version) VALUES ($1, $2, 'placed', $3, 1)",
      [command.orderId, customerId, totalKobo]);
    for (const l of priced) {
      await db().query("INSERT INTO order_lines (order_id, sku, qty, price_kobo) VALUES ($1, $2, $3, $4)",
        [command.orderId, l.sku, l.qty, l.price]);
    }
    const items = priced.reduce((sum, l) => sum + l.qty, 0);
    await record({ type: "order.placed", orderId: command.orderId, customerId, totalKobo, items }, 1);
    return { orderId: command.orderId, version: 1, totalKobo };
  }));

  commands.register("CancelOrder", (command, context) => manager.run(async () => {
    const customerId = requireUser(context);
    const updated = (await db().query<{ version: number }>(
      `UPDATE orders SET status = 'cancelled', version = version + 1
       WHERE id = $1 AND customer_id = $2 AND status = 'placed' AND version = $3 RETURNING version`,
      [command.orderId, customerId, command.expectedVersion])).rows[0];
    if (!updated) {
      const current = (await db().query<{ customer_id: string; status: string; version: number }>(
        "SELECT customer_id, status, version FROM orders WHERE id = $1", [command.orderId])).rows[0];
      if (!current || current.customer_id !== customerId) throw new NotFoundError(`Order ${command.orderId} not found`);
      if (current.version !== command.expectedVersion) {
        throw new ConflictError(`Order ${command.orderId} is at version ${current.version}, not ${command.expectedVersion}`);
      }
      throw new ConflictError(`Order ${command.orderId} is already ${current.status}`);
    }
    await db().query("UPDATE products p SET stock = p.stock + l.qty FROM order_lines l WHERE l.order_id = $1 AND l.sku = p.sku",
      [command.orderId]);
    await record({ type: "order.cancelled", orderId: command.orderId }, updated.version);
    return { orderId: command.orderId, version: updated.version };
  }));
}
```

- **Stock** is checked on a row locked with `FOR UPDATE`, then decremented, in the same transaction. A second checkout for the same product waits for the lock and then sees the new stock. Any error rolls back every reservation made so far.
- **The total is decided once**, here, and written into the event. The read model will copy it, never recompute it. That is the fix for the lying page.
- **`PlaceOrder` is idempotent** by order id: the client generates the id (a UUID in a real app), and a retry returns the first result instead of placing a second order. Someone else's id is a conflict.
- **`CancelOrder` uses optimistic concurrency**: the `UPDATE` only matches the version the client saw. When nothing matched, a second `SELECT` finds out why, so the error says what the client should do: 404 for someone else's order (it does not reveal that it exists), 409 with the current version for a stale page.
- **Every change records an event** in the outbox, in the same transaction, with the new version and the current trace (more on that later). The event id `ORD-1.v2` is stable: the same change always has the same id.

write-side.tsNode.js only

```ts
import { createCommandBus, createExecutionContext, withUser } from "@zudojs/cqrs";
import type { Commands, PlaceOrder } from "./messages.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";
import { registerWriteSide } from "./write.js";

const store = await createStore();
const commands = typed<Commands>(createCommandBus());
registerWriteSide(commands, store);
const ada = withUser(createExecutionContext({ source: "test" }), "cus_ada");
const tunde = withUser(createExecutionContext({ source: "test" }), "cus_tunde");

async function attempt(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    console.log(label, "->", await work());
  } catch (error) {
    console.log(label, "->", (error as Error).name, (error as Error).message);
  }
}

const order: PlaceOrder = { type: "PlaceOrder", orderId: "ORD-1", lines: [{ sku: "RICE-50KG", qty: 2 }, { sku: "OIL-5L", qty: 1 }] };
await attempt("ada places", () => commands.execute(order, ada));
await attempt("ada's retry", () => commands.execute(order, ada));
await attempt("tunde buys oil and 2 rice", () => commands.execute(
  { type: "PlaceOrder", orderId: "ORD-2", lines: [{ sku: "OIL-5L", qty: 1 }, { sku: "RICE-50KG", qty: 2 }] }, tunde));
await attempt("tunde cancels ORD-1", () => commands.execute({ type: "CancelOrder", orderId: "ORD-1", expectedVersion: 1 }, tunde));
await attempt("ada cancels", () => commands.execute({ type: "CancelOrder", orderId: "ORD-1", expectedVersion: 1 }, ada));
await attempt("ada's stale tab", () => commands.execute({ type: "CancelOrder", orderId: "ORD-1", expectedVersion: 1 }, ada));

await store.manager.run(async () => {
  console.log((await store.db().query("SELECT sku, stock FROM products ORDER BY sku")).rows);
  console.log((await store.db().query("SELECT event_id, type, version FROM outbox ORDER BY seq")).rows);
}, { readOnly: true });
```

Output of `npx tsx write-side.ts`

```ts
ada places -> { orderId: 'ORD-1', version: 1, totalKobo: 16250000 }
ada's retry -> { orderId: 'ORD-1', version: 1, totalKobo: 16250000 }
tunde buys oil and 2 rice -> ConflictError Only 1 of RICE-50KG left
tunde cancels ORD-1 -> NotFoundError Order ORD-1 not found
ada cancels -> { orderId: 'ORD-1', version: 2 }
ada's stale tab -> ConflictError Order ORD-1 is at version 2, not 1
[
  { sku: 'OIL-5L', stock: 10 },
  { sku: 'RICE-50KG', stock: 3 },
  { sku: 'SALT-1KG', stock: 40 }
]
[
  { event_id: 'ORD-1.v1', type: 'order.placed', version: 1 },
  { event_id: 'ORD-1.v2', type: 'order.cancelled', version: 2 }
]
```

Tunde's order reserved his oil first and then failed on the rice, and the stock shows no trace of it: the whole transaction rolled back, including the oil. Ada's retry did not create a second order, and her stale tab got a conflict that names the current version. Two events are in the outbox, and nothing has read them yet.

### A note on handler decorators

`@zudojs/cqrs` also exports class decorators such as `@CommandHandlerFor("PlaceOrder")`. They only *mark* a class with metadata; they do not register anything. A framework or your own startup code has to find the marked classes and register them:

decorators.tsNode.js only

```ts
import { CommandHandler, CommandHandlerFor, createCommandBus, getCommandHandlerMetadata } from "@zudojs/cqrs";
import type { CancelOrder } from "./messages.js";

@CommandHandlerFor("CancelOrder")
class CancelOrderHandler extends CommandHandler<CancelOrder, string> {
  readonly commandType = "CancelOrder";
  execute(command: CancelOrder): string {
    return `cancelling ${command.orderId}`;
  }
}

const bus = createCommandBus();
console.log("metadata:", getCommandHandlerMetadata(CancelOrderHandler), "registered:", bus.has("CancelOrder"));

for (const Handler of [CancelOrderHandler]) {
  const meta = getCommandHandlerMetadata(Handler);
  if (!meta) throw new Error(`${Handler.name} is not marked with @CommandHandlerFor`);
  bus.register(meta.type as CancelOrder["type"], new Handler());
}
console.log("registered:", bus.has("CancelOrder"));
```

Output of `npx tsx decorators.ts`

```ts
metadata: { kind: 'command', type: 'CancelOrder' } registered: false
registered: true
```

Forgetting that loop fails only at runtime, with `CommandHandlerNotFoundError` on the first request. That is why this lesson registers functions explicitly through the typed facade: a missing registration is then visible in code review, and each handler's types are checked against the map.

## The read model and its projector

The read model is one table, `order_summaries`, with exactly what the order pages show. The projector is its only writer. It has to cope with the at-least-once delivery you met in [the event-driven lesson](https://zudojs.oyinlola.site/learn/zudo-event-driven#idempotency), and with events arriving in the wrong order when a retry lets a later event overtake an earlier one. The aggregate version solves both at once: the read row remembers the last version it applied, so an event is *new* only when its version is exactly one more:

read.ts

```ts
import { ConflictError, NotFoundError, ServiceUnavailableError } from "@zudojs/errors";
import type { OrderEvent, OrderSummary, Queries } from "./messages.js";
import type { Typed } from "./typed.js";
import type { Store } from "./store.js";
import { requireUser } from "./write.js";

export interface StoredEvent {
  readonly eventId: string;
  readonly orderId: string;
  readonly version: number;
  readonly payload: OrderEvent;
}

export async function project({ manager, db }: Store, event: StoredEvent): Promise<"applied" | "duplicate"> {
  return manager.run(async () => {
    const current = (await db().query<{ version: number }>(
      "SELECT version FROM order_summaries WHERE order_id = $1 FOR UPDATE", [event.orderId])).rows[0]?.version ?? 0;
    if (event.version <= current) return "duplicate";
    if (event.version !== current + 1) {
      throw new ConflictError(`${event.eventId} arrived early: read model of ${event.orderId} is at v${current}`);
    }
    const e = event.payload;
    if (e.type === "order.placed") {
      await db().query(
        "INSERT INTO order_summaries (order_id, customer_id, status, total_kobo, items, version) VALUES ($1, $2, 'placed', $3, $4, $5)",
        [e.orderId, e.customerId, e.totalKobo, e.items, event.version]);
    } else {
      await db().query("UPDATE order_summaries SET status = 'cancelled', version = $2 WHERE order_id = $1", [e.orderId, event.version]);
    }
    return "applied";
  });
}

type SummaryRow = { order_id: string; status: string; total_kobo: number; items: number; version: number };
const toView = (r: SummaryRow): OrderSummary =>
  ({ orderId: r.order_id, status: r.status, totalKobo: r.total_kobo, items: r.items, version: r.version });

export function registerReadSide(queries: Typed<Queries>, { manager, db }: Store): void {
  queries.register("GetOrder", (query, context) => manager.run(async () => {
    const customerId = requireUser(context);
    const row = (await db().query<SummaryRow>(
      "SELECT order_id, status, total_kobo, items, version FROM order_summaries WHERE order_id = $1 AND customer_id = $2",
      [query.orderId, customerId])).rows[0];
    if ((row?.version ?? 0) < (query.minVersion ?? 0)) throw new ServiceUnavailableError(`Order ${query.orderId} is still being updated`);
    if (!row) throw new NotFoundError(`Order ${query.orderId} not found`);
    return toView(row);
  }, { readOnly: true }));

  queries.register("ListMyOrders", (_query, context) => manager.run(async () => {
    const customerId = requireUser(context);
    const { rows } = await db().query<SummaryRow>(
      "SELECT order_id, status, total_kobo, items, version FROM order_summaries WHERE customer_id = $1 ORDER BY order_id", [customerId]);
    return rows.map(toView);
  }, { readOnly: true }));
}
```

- **Duplicates** (version already applied) are skipped. No processed-events table is needed, because the version already says what was applied.
- **Gaps** throw a `ConflictError`. The projector never guesses; the queue will retry, and by then the missing event has usually been applied.
- **Queries run in read-only transactions**, so PostgreSQL itself refuses a write from a query handler. They only read `order_summaries`, and filter by the signed-in customer, so Ada can never read Tunde's order.
- **`minVersion`** is read-your-writes: a client that knows it just produced version 2 can say so, and gets "still being updated" (HTTP 503) instead of a page that silently shows version 1.

Here is the projector fed by hand in the worst order: the cancellation first, then the order, then both again:

projector.tsNode.js only

```ts
import { createExecutionContext, createQueryBus, withUser } from "@zudojs/cqrs";
import type { Queries } from "./messages.js";
import { project, registerReadSide } from "./read.js";
import type { StoredEvent } from "./read.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";

const store = await createStore();
const queries = typed<Queries>(createQueryBus());
registerReadSide(queries, store);
const ada = withUser(createExecutionContext(), "cus_ada");

const placed: StoredEvent = { eventId: "ORD-1.v1", orderId: "ORD-1", version: 1,
  payload: { type: "order.placed", orderId: "ORD-1", customerId: "cus_ada", totalKobo: 16_250_000, items: 3 } };
const cancelled: StoredEvent = { eventId: "ORD-1.v2", orderId: "ORD-1", version: 2,
  payload: { type: "order.cancelled", orderId: "ORD-1" } };

for (const event of [cancelled, placed, cancelled, placed]) {
  try {
    console.log(event.eventId, "->", await project(store, event));
  } catch (error) {
    console.log(event.eventId, "->", (error as Error).message);
  }
}
console.log(await queries.execute({ type: "GetOrder", orderId: "ORD-1" }, ada));

try {
  await queries.execute({ type: "GetOrder", orderId: "ORD-1", minVersion: 3 }, ada);
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
try {
  await store.manager.run(async () => {
    await store.db().query("DELETE FROM order_summaries");
  }, { readOnly: true });
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx projector.ts`

```ts
ORD-1.v2 -> ORD-1.v2 arrived early: read model of ORD-1 is at v0
ORD-1.v1 -> applied
ORD-1.v2 -> applied
ORD-1.v1 -> duplicate
{
  orderId: 'ORD-1',
  status: 'cancelled',
  totalKobo: 16250000,
  items: 3,
  version: 2
}
ServiceUnavailableError Order ORD-1 is still being updated
cannot execute DELETE in a read-only transaction
```

The early cancellation was refused, the order was applied, the cancellation succeeded on its second delivery, and the late duplicate of the order changed nothing. The final row is the same as if the events had arrived once, in order.

## From the outbox to the projector

The relay reads unpublished outbox rows in order and adds each one to a queue; the queue runs the projector with retries, so "arrived early" simply means "try again in 10 ms". This is the per-consumer queue from the last lesson, with one consumer.

The new part is the trace. The command recorded the trace it ran in (its `traceparent`) in the outbox row. `AsyncLocalStorage`, which carries the current trace inside one chain of calls, cannot follow work into a database row or a queue, so the context has to be carried by hand at both boundaries:

- **Outbox to relay:** the relay starts its span with the row's `traceparent` as the parent.
- **Queue to projector:** `@zudojs/queue` has **context carriers** for exactly this. A carrier's `capture()` runs when a job is added and stores a small value with the job; its `restore()` wraps the processor when the job runs. Here the value is the `traceparent`, and restoring it starts a consumer span in the same trace.

pipeline.ts

```ts
import { createFixedBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import type { QueueContextCarrier } from "@zudojs/queue";
import { formatTraceparent, getCurrentContext, parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import type { Observability } from "@zudojs/observability";
import type { OrderEvent } from "./messages.js";
import { project } from "./read.js";
import type { StoredEvent } from "./read.js";
import type { Store } from "./store.js";

export function createPipeline(store: Store, obs: Observability) {
  const traceCarrier: QueueContextCarrier<string> = {
    key: "traceparent",
    capture: () => {
      const current = getCurrentContext();
      return current ? formatTraceparent(current) : undefined;
    },
    restore: (traceparent, run) =>
      withSpan(obs.tracer, "project", run, { kind: SpanKind.CONSUMER, parent: parseTraceparent(traceparent) }),
  };

  const projections = createInMemoryQueue<StoredEvent>(createQueueName("projections.order-summaries"), {
    contextCarriers: [traceCarrier],
    defaultJobOptions: { attempts: 5, backoff: createFixedBackoff(10, { jitter: "none" }) },
  });
  projections.process("project", async (job, context) => {
    try {
      const outcome = await project(store, job.data);
      obs.logger.info(`projected ${job.data.eventId}: ${outcome}`, { try: context.attemptNumber });
    } catch (error) {
      obs.logger.warn(`projecting ${job.data.eventId} failed`, { try: context.attemptNumber, reason: (error as Error).message });
      throw error;
    }
  });

  async function relay(): Promise<number> {
    const { manager, db } = store;
    const rows = await manager.run(async () => (await db().query<{
      seq: number; event_id: string; order_id: string; version: number; payload: OrderEvent; traceparent: string | null;
    }>("SELECT seq, event_id, order_id, version, payload, traceparent FROM outbox WHERE published_at IS NULL ORDER BY seq LIMIT 100")).rows);
    for (const row of rows) {
      const event: StoredEvent = { eventId: row.event_id, orderId: row.order_id, version: row.version, payload: row.payload };
      await withSpan(obs.tracer, `relay ${row.payload.type}`, () => projections.add("project", event),
        { kind: SpanKind.PRODUCER, parent: parseTraceparent(row.traceparent ?? undefined) });
      await manager.run(async () => {
        await db().query("UPDATE outbox SET published_at = now() WHERE seq = $1", [row.seq]);
      });
    }
    return rows.length;
  }

  async function settle(): Promise<void> {
    for (;;) {
      const s = await projections.getStats();
      if (s.waiting + s.active + s.retrying + s.delayed === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  return { relay, settle, close: () => projections.close() };
}
```

Adding a job to an in-memory queue does not fail for reasons a retry would fix, so this relay marks each row after its `add`. With a broker, `add` is a network call: mark the row only after it succeeded, as the last lesson's relay did, and accept that a crash in between publishes the row twice. The projector does not care: it skips versions it already has.

> NOTE
>
> The queue stores the captured `traceparent` in the job's metadata under a key it owns (`"zudo:context"`). A value that a caller puts under that key is thrown away, so code that adds jobs cannot forge the trace a job runs in.

## The API layer and one trace

The API layer is deliberately thin: turn an HTTP request into a command or query with an execution context, call the bus, turn the result or error into a response. It never touches a table. Observability comes from three small pieces: exporters that print logs and spans (a shorter version of the ones in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability#traces)), a server span per request, and a CQRS middleware that puts every command and query in its own span:

obs.ts

```ts
import { createObservability } from "@zudojs/observability";
import type { LogExporter, ReadableSpan, SpanExporter } from "@zudojs/observability";

const logLines: LogExporter = {
  async export(records) {
    for (const r of records) {
      const context = r.context && Object.keys(r.context).length > 0 ? " " + JSON.stringify(r.context) : "";
      console.log(`[${r.levelName}] ${r.message}${context} trace=${r.traceId?.slice(0, 8) ?? "-"}`);
    }
  },
  async shutdown() {},
};

const spanTree: SpanExporter = {
  async export(spans) {
    const print = (span: ReadableSpan, depth: number): void => {
      const trace = depth === 0 ? ` trace=${span.context.traceId.slice(0, 8)}` : "";
      console.log(`${"  ".repeat(depth)}${span.name} (${span.kind})${trace}`);
      for (const child of spans.filter((s) => s.context.parentSpanId === span.context.spanId)) print(child, depth + 1);
    };
    const isRoot = (s: ReadableSpan) => !spans.some((p) => p.context.spanId === s.context.parentSpanId);
    for (const root of spans.filter(isRoot)) print(root, 0);
  },
  async shutdown() {},
};

export function createObs() {
  return createObservability({ serviceName: "shopflow", useConsoleExporters: false, logExporter: logLines, spanExporter: spanTree });
}
```

api.ts

```ts
import { createExecutionContext } from "@zudojs/cqrs";
import { ServiceUnavailableError } from "@zudojs/errors";
import { badRequest, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpRequestContext, HttpResponseContext } from "@zudojs/http";
import { parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import type { Observability } from "@zudojs/observability";
import type { Commands, OrderLine, Queries } from "./messages.js";
import type { Typed } from "./typed.js";

function readJson(request: HttpRequestContext): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(request.body as Uint8Array)) as Record<string, unknown>;
  } catch {
    throw badRequest("The request body is not valid JSON");
  }
}

export function createApi(commands: Typed<Commands>, queries: Typed<Queries>, obs: Observability) {
  const router = createRouter();

  /** Who is asking. A stand-in: the real app reads the user from a verified session or token. */
  const contextOf = (request: HttpRequestContext) =>
    createExecutionContext({ source: "http", userId: request.getHeader("x-user"), correlationId: obs.propagation.current()?.traceId });

  router.post("/orders", async (ctx) => {
    const body = readJson(ctx.request);
    const placed = await commands.execute(
      { type: "PlaceOrder", orderId: String(body["orderId"]), lines: body["lines"] as OrderLine[] }, contextOf(ctx.request));
    return createResponseContext({ status: 201 }).setHeader("location", `/orders/${placed.orderId}`).json(placed);
  });

  router.post("/orders/:id/cancel", async (ctx) => {
    const expectedVersion = Number(ctx.request.getHeader("if-match"));
    return commands.execute({ type: "CancelOrder", orderId: ctx.params.id ?? "", expectedVersion }, contextOf(ctx.request));
  });

  router.get("/orders/:id", async (ctx) => {
    const minVersion = Number(ctx.request.getQuery("minVersion") ?? 0);
    try {
      return await queries.execute({ type: "GetOrder", orderId: ctx.params.id ?? "", minVersion }, contextOf(ctx.request));
    } catch (error) {
      if (!(error instanceof ServiceUnavailableError)) throw error;
      return createResponseContext({ status: 503 }).setHeader("retry-after", "1").json({ error: error.message });
    }
  });

  return async (request: HttpRequestContext): Promise<HttpResponseContext> =>
    withSpan(obs.tracer, `${request.method} ${request.path}`, async () => {
      try {
        const { response } = await router.dispatch(request);
        obs.logger.info(`${request.method} ${request.path} -> ${response.status}`);
        return response;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        obs.logger.warn(`${request.method} ${request.path} -> ${status}`, { error: (error as Error).message });
        throw error;
      }
    }, { kind: SpanKind.SERVER, parent: parseTraceparent(request.getHeader("traceparent")) });
}
```

Everything is wired in one place. `timingMiddleware` from `@zudojs/cqrs` logs each command and query, and the `trace` middleware wraps each one in a span:

app.ts

```ts
import { createCommandBus, createQueryBus, timingMiddleware } from "@zudojs/cqrs";
import type { CqrsMiddleware } from "@zudojs/cqrs";
import { createHttpServer, createNodeHttpAdapter } from "@zudojs/http";
import { withSpan } from "@zudojs/observability";
import { createApi } from "./api.js";
import type { Commands, Queries } from "./messages.js";
import { createObs } from "./obs.js";
import { createPipeline } from "./pipeline.js";
import { registerReadSide } from "./read.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";
import { registerWriteSide } from "./write.js";

export async function startApp() {
  const obs = createObs();
  const store = await createStore();
  const log = timingMiddleware({
    onTiming: ({ request, succeeded, context }) =>
      obs.logger.info(`${request.type} ${succeeded ? "ok" : "failed"}`, { user: context?.userId }),
  });
  const trace: CqrsMiddleware = (request, context, next) => withSpan(obs.tracer, request.type, () => next(request, context));
  const commands = typed<Commands>(createCommandBus({ middleware: [trace, log] }));
  const queries = typed<Queries>(createQueryBus({ middleware: [trace, log] }));
  registerWriteSide(commands, store);
  registerReadSide(queries, store);
  const pipeline = createPipeline(store, obs);
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: createApi(commands, queries, obs),
  });
  await server.start();
  return {
    base: `http://127.0.0.1:${server.address?.port}`,
    store,
    pipeline,
    async stop() {
      await server.stop();
      await pipeline.close();
      await obs.shutdown();
    },
  };
}
```

Now a client. It sends a fixed `traceparent`, as a browser front end or an API gateway would, so the trace id is the same on every run. It places an order, reads it back at once, reads it again after the projector ran, and then cancels twice from the same page:

main.tsNode.js only

```ts
import { startApp } from "./app.js";

const app = await startApp();
const headers = {
  "content-type": "application/json",
  "x-user": "cus_ada",
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
};
const show = async (label: string, response: Response) =>
  console.log(label, response.status, response.headers.get("retry-after") ?? "", await response.text());

const order = { orderId: "ORD-1042", lines: [{ sku: "RICE-50KG", qty: 1 }, { sku: "OIL-5L", qty: 2 }] };
await show("POST /orders", await fetch(`${app.base}/orders`, { method: "POST", headers, body: JSON.stringify(order) }));
await show("GET at once", await fetch(`${app.base}/orders/ORD-1042?minVersion=1`, { headers }));

await app.pipeline.relay();
await app.pipeline.settle();
await show("GET after projection", await fetch(`${app.base}/orders/ORD-1042?minVersion=1`, { headers }));

const cancel = { method: "POST", headers: { ...headers, "if-match": "1" } };
await show("cancel", await fetch(`${app.base}/orders/ORD-1042/cancel`, cancel));
await show("cancel again", await fetch(`${app.base}/orders/ORD-1042/cancel`, cancel));
await app.stop();
```

Output of `npx tsx main.ts`

```ts
POST /orders 201  {"orderId":"ORD-1042","version":1,"totalKobo":10000000}
GET at once 503 1 {"error":"Order ORD-1042 is still being updated"}
GET after projection 200  {"orderId":"ORD-1042","status":"placed","totalKobo":10000000,"items":3,"version":1}
cancel 200  {"orderId":"ORD-1042","version":2}
cancel again 409  {"error":"Order ORD-1042 is at version 2, not 1","code":"ERR_CONFLICT"}
[info] PlaceOrder ok {"user":"cus_ada"} trace=4bf92f35
[info] POST /orders -> 201 trace=4bf92f35
[info] GetOrder failed {"user":"cus_ada"} trace=4bf92f35
[info] GET /orders/ORD-1042 -> 503 trace=4bf92f35
[info] projected ORD-1042.v1: applied {"try":1} trace=4bf92f35
[info] GetOrder ok {"user":"cus_ada"} trace=4bf92f35
[info] GET /orders/ORD-1042 -> 200 trace=4bf92f35
[info] CancelOrder ok {"user":"cus_ada"} trace=4bf92f35
[info] POST /orders/ORD-1042/cancel -> 200 trace=4bf92f35
[info] CancelOrder failed {"user":"cus_ada"} trace=4bf92f35
[warn] POST /orders/ORD-1042/cancel -> 409 {"error":"Order ORD-1042 is at version 2, not 1"} trace=4bf92f35
POST /orders (SERVER) trace=4bf92f35
  PlaceOrder (INTERNAL)
    relay order.placed (PRODUCER)
      project (CONSUMER)
GET /orders/ORD-1042 (SERVER) trace=4bf92f35
  GetOrder (INTERNAL)
GET /orders/ORD-1042 (SERVER) trace=4bf92f35
  GetOrder (INTERNAL)
POST /orders/ORD-1042/cancel (SERVER) trace=4bf92f35
  CancelOrder (INTERNAL)
POST /orders/ORD-1042/cancel (SERVER) trace=4bf92f35
  CancelOrder (INTERNAL)
```

Read the three parts of the output in turn.

- **The responses.** The command answered 201 with the new version. The immediate read asked for `minVersion=1` and got 503 with `Retry-After: 1`: an honest "not yet" instead of a 404 that would make the app say "order not found" seconds after a successful checkout. After the projector ran, the same request returned the page. The second cancel from the same tab got 409 with the current version, so the app can reload and ask Ada what she wants.
- **The logs** (printed when the app stops, because exporters send in batches). Every line carries the same trace id, including the projector's line, which ran in a queue job long after the request had finished.
- **The spans.** `relay order.placed` and `project` hang under `PlaceOrder`, in the same trace as the HTTP request that caused them, across a database row and a queue. When support asks about ORD-1042, one search for `4bf92f35…` shows the request, the command, its outcome and the moment the read model changed.

The events for the cancellation are still in the outbox: nobody called the relay after it. In a server the relay runs in a loop, so the read model would show "cancelled" a few milliseconds later. The CQRS context's `correlationId` is set to the trace id too, so handler code that only sees the context can still log it.

> THE USER COMES FROM THE LOGIN, NOT A HEADER
>
> The `x-user` header stands in for authentication to keep the example short. A client can send any header. In the real API the user comes from a verified session or token, as in [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth), and the API layer puts it into the execution context.

## Rebuilding and adding read models

Because the outbox keeps every event with its version, the read model is disposable. Two everyday uses:

- **A bug in a projector** wrote wrong data. Fix the projector, empty the table, replay the events.
- **A new screen** needs a new read model, for example "customer statistics" for the support dashboard. Write its projector and **backfill** it from the events that already exist.

rebuild.tsNode.js only

```ts
import { createCommandBus, createExecutionContext, withUser } from "@zudojs/cqrs";
import type { Commands, OrderEvent } from "./messages.js";
import { project } from "./read.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";
import { registerWriteSide } from "./write.js";

const store = await createStore();
const { manager, db } = store;
const commands = typed<Commands>(createCommandBus());
registerWriteSide(commands, store);
const ada = withUser(createExecutionContext(), "cus_ada");
const bola = withUser(createExecutionContext(), "cus_bola");

await commands.execute({ type: "PlaceOrder", orderId: "ORD-1", lines: [{ sku: "OIL-5L", qty: 2 }] }, ada);
await commands.execute({ type: "PlaceOrder", orderId: "ORD-2", lines: [{ sku: "SALT-1KG", qty: 5 }] }, ada);
await commands.execute({ type: "PlaceOrder", orderId: "ORD-3", lines: [{ sku: "RICE-50KG", qty: 1 }] }, bola);
await commands.execute({ type: "CancelOrder", orderId: "ORD-2", expectedVersion: 1 }, ada);

type Row = { event_id: string; order_id: string; version: number; payload: OrderEvent };
const history = await manager.run(async () =>
  (await db().query<Row>("SELECT event_id, order_id, version, payload FROM outbox ORDER BY seq")).rows, { readOnly: true });

// 1. Rebuild order_summaries from scratch.
await manager.run(async () => { await db().query("DELETE FROM order_summaries"); });
for (const row of history) {
  await project(store, { eventId: row.event_id, orderId: row.order_id, version: row.version, payload: row.payload });
}

// 2. Backfill a brand-new read model.
await manager.run(async () => {
  await db().exec("CREATE TABLE customer_stats (customer_id text PRIMARY KEY, orders integer NOT NULL, spent_kobo integer NOT NULL)");
  const owner = new Map<string, { customerId: string; totalKobo: number }>();
  for (const { payload: e } of history) {
    if (e.type === "order.placed") {
      owner.set(e.orderId, e);
      await db().query(
        `INSERT INTO customer_stats VALUES ($1, 1, $2) ON CONFLICT (customer_id)
         DO UPDATE SET orders = customer_stats.orders + 1, spent_kobo = customer_stats.spent_kobo + EXCLUDED.spent_kobo`,
        [e.customerId, e.totalKobo]);
    } else {
      const placed = owner.get(e.orderId);
      if (placed) {
        await db().query("UPDATE customer_stats SET orders = orders - 1, spent_kobo = spent_kobo - $2 WHERE customer_id = $1",
          [placed.customerId, placed.totalKobo]);
      }
    }
  }
});

await manager.run(async () => {
  console.log((await db().query("SELECT order_id, status, version FROM order_summaries ORDER BY order_id")).rows);
  console.log((await db().query("SELECT * FROM customer_stats ORDER BY customer_id")).rows);
}, { readOnly: true });
```

Output of `npx tsx rebuild.ts`

```json
[
  { order_id: 'ORD-1', status: 'placed', version: 1 },
  { order_id: 'ORD-2', status: 'cancelled', version: 2 },
  { order_id: 'ORD-3', status: 'placed', version: 1 }
]
[
  { customer_id: 'cus_ada', orders: 1, spent_kobo: 2500000 },
  { customer_id: 'cus_bola', orders: 1, spent_kobo: 7500000 }
]
```

The rebuilt summaries match what the live projector would have produced, and the new statistics include every order ever placed, although the feature did not exist when they were placed. That is the lasting benefit of recording events: new questions can be answered about old facts.

Two cautions. First, this only works if the events carry enough information: the `order.cancelled` event has no total, so the statistics projector had to remember totals from `order.placed`. Design events with future read models in mind, but do not stuff them with everything. Second, rebuilding a big read model in place means the page is empty while it runs. In production, build the new table under another name, replay into it, then switch the queries over in one step.

> NOTE
>
> This design stores the current state in `orders` *and* records events. **Event sourcing** goes one step further: the events are the only record, and the write model itself is rebuilt from them on every command. It is powerful and much harder to operate, and you do not need it to get the benefits in this lesson.

## Testing a CQRS system

Each part has a natural test shape:

- **Commands:** given a starting state, when a command runs, then the result, the write tables and the recorded events are as expected. Failures must leave no trace.
- **Projectors:** given a list of events (in order, shuffled, duplicated), then the read model is as expected. No commands needed.
- **Queries:** given read-model rows, then the view, including who may see what.
- **Types:** the typed facade makes wrong results compile errors; keep one `tsc` run in CI.

cqrs-tests.tsNode.js only

```ts
import { createCommandBus, createExecutionContext, createQueryBus, withUser } from "@zudojs/cqrs";
import type { Commands, Queries } from "./messages.js";
import { project, registerReadSide } from "./read.js";
import type { StoredEvent } from "./read.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";
import { registerWriteSide } from "./write.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label}${same ? "" : `: got ${JSON.stringify(actual)}`}`);
}

const store = await createStore();
const commands = typed<Commands>(createCommandBus());
const queries = typed<Queries>(createQueryBus());
registerWriteSide(commands, store);
registerReadSide(queries, store);
const ada = withUser(createExecutionContext(), "cus_ada");
const tunde = withUser(createExecutionContext(), "cus_tunde");

const outboxCount = () => store.manager.run(async () =>
  (await store.db().query<{ n: number }>("SELECT count(*)::int AS n FROM outbox")).rows[0]?.n, { readOnly: true });

const failed = await commands.execute({ type: "PlaceOrder", orderId: "ORD-9", lines: [{ sku: "RICE-50KG", qty: 4 }] }, ada)
  .catch((error: Error) => error.name);
check("overselling is refused and records nothing", [failed, await outboxCount()], ["ConflictError", 0]);

const events: StoredEvent[] = [
  { eventId: "ORD-1.v1", orderId: "ORD-1", version: 1,
    payload: { type: "order.placed", orderId: "ORD-1", customerId: "cus_ada", totalKobo: 60_000, items: 1 } },
  { eventId: "ORD-1.v2", orderId: "ORD-1", version: 2, payload: { type: "order.cancelled", orderId: "ORD-1" } },
];
for (const event of [events[0]!, events[0]!, events[1]!]) await project(store, event);
const view = await queries.execute({ type: "GetOrder", orderId: "ORD-1" }, ada);
check("projector: duplicates are ignored", [view.status, view.version], ["cancelled", 2]);

const hidden = await queries.execute({ type: "GetOrder", orderId: "ORD-1" }, tunde).catch((error: Error) => error.name);
check("another customer's order is not found", hidden, "NotFoundError");
```

Output of `npx tsx cqrs-tests.ts`

```ts
PASS overselling is refused and records nothing
PASS projector: duplicates are ignored
PASS another customer's order is not found
```

Each test builds a fresh PGlite store, so tests never share state and can run in parallel. With Vitest, `check` becomes `expect`, and the store setup moves into a `beforeEach`, as in [Testing in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-testing).

## In production

- **Measure projection lag.** The gap between the newest outbox row and the newest projected event is the number to put on a dashboard and alert on. A read model that is minutes behind looks exactly like a bug to customers.
- **Read models can live elsewhere.** Nothing forces `order_summaries` into the write database. It can be a read replica, a search index or a cache, each fed by its own projector. That is where CQRS pays for its complexity: reads scale on their own.
- **Hot aggregates.** If one order (or one product) gets many commands at once, optimistic concurrency produces many conflicts. `lockMiddleware` from `@zudojs/cqrs` can serialize commands per key (for example per order id) before they reach the handler.
- **Keep commands small and events meaningful.** A command changes one aggregate in one transaction. If an action touches two aggregates, the second change usually belongs in a handler of the first one's event, which is the saga idea of [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions).
- **Do not use it everywhere.** For a settings page or a simple admin form, a transaction and a query over the same table is simpler and immediately consistent. Use full CQRS where reads and writes truly differ: busy lists, dashboards, search, reports.

## Practice

TRY IT YOURSELF

### Ship an order

Add a `ShipOrder` command: only a placed order can be shipped, it uses `expectedVersion` like `CancelOrder`, and it records `order.shipped`. Cancelling a shipped order must then fail. Test it on the write side, without the projector.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Model the `UPDATE` on `CancelOrder`'s, but with `status = 'shipped'` in the `SET` and `status = 'placed'` in the `WHERE` (a shipped or cancelled order does not match, so it falls into the investigation branch).

HINT 2

On success: `await db().query("INSERT INTO outbox (event_id, type, order_id, version, payload) VALUES ($1, 'order.shipped', $2, $3, $4)", [\`${command.orderId}.v${row.version}\`, command.orderId, row.version, { type: "order.shipped", orderId: command.orderId }]);`.

SOLUTION

ship.tsNode.js only

```ts
import { createCommandBus, createExecutionContext, withUser } from "@zudojs/cqrs";
import type { CommandOf } from "@zudojs/cqrs";
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Commands } from "./messages.js";
import { createStore } from "./store.js";
import { typed } from "./typed.js";
import { registerWriteSide, requireUser } from "./write.js";

type ShipOrder = CommandOf<"ShipOrder", { orderId: string; expectedVersion: number }>;
interface WithShipping extends Commands {
  ShipOrder: readonly [ShipOrder, { orderId: string; version: number }];
}

const store = await createStore();
const { manager, db } = store;
const commands = typed<WithShipping>(createCommandBus());
registerWriteSide(commands, store);

commands.register("ShipOrder", (command, context) => manager.run(async () => {
  requireUser(context);
  const row = (await db().query<{ version: number }>(
    "UPDATE orders SET status = 'shipped', version = version + 1 WHERE id = $1 AND status = 'placed' AND version = $2 RETURNING version",
    [command.orderId, command.expectedVersion])).rows[0];
  if (!row) {
    const current = (await db().query<{ status: string; version: number }>("SELECT status, version FROM orders WHERE id = $1",
      [command.orderId])).rows[0];
    if (!current) throw new NotFoundError(`Order ${command.orderId} not found`);
    throw new ConflictError(`Order ${command.orderId} is ${current.status} at version ${current.version}`);
  }
  await db().query("INSERT INTO outbox (event_id, type, order_id, version, payload) VALUES ($1, 'order.shipped', $2, $3, $4)",
    [`${command.orderId}.v${row.version}`, command.orderId, row.version, { type: "order.shipped", orderId: command.orderId }]);
  return { orderId: command.orderId, version: row.version };
}));

const ada = withUser(createExecutionContext(), "cus_ada");
await commands.execute({ type: "PlaceOrder", orderId: "ORD-1", lines: [{ sku: "OIL-5L", qty: 1 }] }, ada);
console.log(await commands.execute({ type: "ShipOrder", orderId: "ORD-1", expectedVersion: 1 }, ada));
for (const attempt of [
  () => commands.execute({ type: "ShipOrder", orderId: "ORD-1", expectedVersion: 2 }, ada),
  () => commands.execute({ type: "CancelOrder", orderId: "ORD-1", expectedVersion: 2 }, ada),
]) {
  await attempt().catch((error: Error) => console.log(error.name, error.message));
}
```

Output of `npx tsx ship.ts`

```json
{ orderId: 'ORD-1', version: 2 }
ConflictError Order ORD-1 is shipped at version 2
ConflictError Order ORD-1 is already shipped
```

The map is extended with `interface WithShipping extends Commands`, so the new command is typed like the others. A real version would also check that only staff may ship (a permission, not ownership), and the projector would need an `order.shipped` branch: add it to the `OrderEvent` union and TypeScript will point at every `if` that must handle it.

TRY IT YOURSELF

### Projection lag

Write `lag(store)` that returns how many outbox events have not yet been applied to `order_summaries`. An event counts as applied when the summary row for its order has a version greater than or equal to the event's version.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Start from `outbox o LEFT JOIN order_summaries s ON s.order_id = o.order_id`, then `count(*)` the rows where `s.version IS NULL OR s.version < o.version`.

HINT 2

`return manager.run(async () => (await db().query(\`SELECT count(*)::int AS n FROM outbox o LEFT JOIN order_summaries s ON s.order_id = o.order_id WHERE s.version IS NULL OR s.version < o.version\`)).rows[0]?.n ?? 0, { readOnly: true });`

SOLUTION

lag.tsNode.js only

```ts
import { project } from "./read.js";
import { createStore } from "./store.js";
import type { Store } from "./store.js";

async function lag({ manager, db }: Store): Promise<number> {
  return manager.run(async () => (await db().query<{ n: number }>(`
    SELECT count(*)::int AS n FROM outbox o
    LEFT JOIN order_summaries s ON s.order_id = o.order_id
    WHERE s.version IS NULL OR s.version < o.version`)).rows[0]?.n ?? 0, { readOnly: true });
}

const store = await createStore();
await store.manager.run(async () => {
  await store.db().query(`INSERT INTO outbox (event_id, type, order_id, version, payload) VALUES
    ('ORD-1.v1', 'order.placed', 'ORD-1', 1, '{"type":"order.placed","orderId":"ORD-1","customerId":"cus_ada","totalKobo":60000,"items":1}'),
    ('ORD-1.v2', 'order.cancelled', 'ORD-1', 2, '{"type":"order.cancelled","orderId":"ORD-1"}')`);
});
console.log("lag before:", await lag(store));
await project(store, { eventId: "ORD-1.v1", orderId: "ORD-1", version: 1,
  payload: { type: "order.placed", orderId: "ORD-1", customerId: "cus_ada", totalKobo: 60_000, items: 1 } });
console.log("lag after one event:", await lag(store));
```

Output of `npx tsx lag.ts`

```ts
lag before: 2
lag after one event: 1
```

Export this number as a gauge with the metrics from [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability#metrics), and alert when it stays above a small number for more than a minute. Counting events is simple; production systems often also track the age of the oldest unapplied event, which says how stale the page is in seconds.

TRY IT YOURSELF

### Where does it belong?

For each piece of logic, say whether it belongs in a command handler, a projector, a query handler or the API layer: (a) "a customer may have at most 5 open orders"; (b) formatting kobo as "₦14,000.00" for the page; (c) reading the `If-Match` header; (d) the number of items in an order, shown on the list page; (e) "only show orders from the last 12 months".

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Which side, write or read, can actually enforce a rule against reality rather than just report on it? Which of these are really about HTTP, not about orders at all?

HINT 2

(d) is decided once, when the order is placed; where does that number then travel so the query side never has to compute it again?

SOLUTION

(a) Command handler: it is a rule that must be enforced against the current state, in the transaction. A read model may be stale, so it can never enforce a rule. (b) Neither side of the server: formatting is presentation, done by the client (or a response mapper in the API layer). The read model stores kobo. (c) API layer: HTTP details stop there; the command gets a plain `expectedVersion`. (d) Decided by the command (it has the lines), carried in the event, stored by the projector; the query only reads it. (e) Query handler: a filter on the read model, perhaps with an index on a date column the projector fills in.

## Recap

- Full CQRS separates the data: a normalised write model that enforces rules, and read models shaped for screens, computed from what the write side decided instead of recomputing it.
- Commands run in one `@zudojs/transactions` transaction that changes the aggregate, bumps its version and records the event in the outbox. They are idempotent by client-chosen id and use optimistic concurrency with `expectedVersion`.
- A thin typed facade over `@zudojs/cqrs` removes the unchecked `execute<C, R>` claims. Handler decorators only mark classes; something must still register them.
- The projector applies an event only when its version is the next one: duplicates are skipped, gaps fail and are retried by the queue.
- Read models are eventually consistent. Return versions from commands and let queries ask for a minimum version, answering 503 with `Retry-After` instead of a stale page.
- Carry the trace across every boundary: the `traceparent` in the outbox row, and a queue context carrier into the projector. One trace id then connects the request, the command, the relay and the projection.
- Read models are disposable: rebuild them, or backfill new ones, from the recorded events.

So far everything ran in one process with one database. Next, [Distributed systems fundamentals](https://zudojs.oyinlola.site/learn/dist-fundamentals) looks at what changes when the pieces live on different machines: partial failure, unreliable networks, clocks you cannot trust and the consistency you can actually get.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
