---
title: "Typing database code — ZudoJS Academy"
description: "Give database rows honest TypeScript types: nullable columns, entities vs DTOs, typed repositories, generated types, and query builder or ORM trade-offs."
source: https://zudojs.oyinlola.site/learn/db-typescript
---

LEVEL 8 · LESSON 5 OF 5

Correctness and operations Core

# Typing database code

Give database rows honest TypeScript types: nullable columns, entities vs DTOs, typed repositories, generated types, and query builder or ORM trade-offs.

- **55 min** to read and try
- **You need:** Operating databases, Generic API design in TypeScript, and the BookStore data lesson
- **You build:** Typed row mappers, a repository with branded ids and safe sorting, a type generator that reads the live schema, and a tiny typed query builder

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why query<T> is an unchecked assertion, and what the pg and PGlite drivers really return for each column type
- Write row types that match the database exactly, including null, and map them to entities
- Keep entities, input DTOs and response DTOs apart so secrets never leak into responses
- Type a repository with branded ids and an allow-listed sort, and validate rows at the boundary
- Generate row types from the live schema and choose between raw SQL, codegen, query builders and ORMs

## A type that compiled and lied

Here is the shop's order list, written the way many TypeScript codebases start. There is an `Order` interface, the query passes it as a type argument, and `tsc` is perfectly happy. The shop data lives in a module the other examples use too:

db.ts

```ts
import { PGlite } from "@electric-sql/pglite";

export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export async function openShop(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create table customers (
      id integer generated always as identity primary key,
      email text not null unique,
      full_name text not null,
      phone text,
      password_hash text not null
    );
    create table orders (
      id integer generated always as identity primary key,
      customer_id integer not null references customers (id),
      status text not null check (status in ('pending', 'paid', 'shipped', 'cancelled')),
      total_kobo bigint not null,
      note text,
      placed_at timestamptz not null
    );
    insert into customers (email, full_name, phone, password_hash) values
      ('ada@example.com', 'Ada Okafor', '0803 000 0001', 'scrypt$16384$c2FsdA$aGFzaA'),
      ('tunde@example.com', 'Tunde Bello', null, 'scrypt$16384$c2FsdB$aGFzaB');
    insert into orders (customer_id, status, total_kobo, note, placed_at) values
      (1, 'paid', 2180000, 'Leave at the gate', '2026-09-01 09:30:00+00'),
      (1, 'pending', 450000, null, '2026-09-20 14:05:00+00'),
      (2, 'shipped', 1450000, null, '2026-09-10 11:00:00+00');
  `);
  return db;
}
```

problem.tsNode.js only

```ts
import { openShop } from "./db.js";

interface Order {
  id: number;
  customerId: number;
  totalKobo: number;
  note: string;
  placedAt: Date;
}

const db = await openShop();
const { rows } = await db.query<Order>("select * from orders order by id");

for (const order of rows) {
  try {
    console.log(`order ${order.id} for customer ${order.customerId}: ₦${order.totalKobo / 100}, note ${order.note.toUpperCase()}`);
  } catch (error) {
    console.log(`order ${order.id}: ${(error as Error).message}`);
  }
}
await db.close();
```

Output of `npx tsx problem.ts`

```ts
order 1 for customer undefined: ₦NaN, note LEAVE AT THE GATE
order 2: Cannot read properties of null (reading 'toUpperCase')
order 3: Cannot read properties of null (reading 'toUpperCase')
```

Every line of this is wrong, and the compiler saw none of it. The rows have `customer_id`, not `customerId`, so the customer is `undefined` and the total is `NaN`. Orders 2 and 3 have no note, so `note` is `null` and their lines crashed. The type `Order` described what the developer hoped for, not what the database sends.

The reason: the `<Order>` in `db.query<Order>(…)` is not checked against anything. The driver cannot know at compile time what a SQL string returns, so its type parameter is just a promise you make, exactly like the `as` assertions in [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions). This lesson is about making that promise true, and about checking it where it can be broken.

## What the driver really returns

Before you can type a row, you need to know what JavaScript value each PostgreSQL type becomes. PGlite converts values like this:

driver-types.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const { rows } = await db.query<Record<string, unknown>>(`
  select 42::integer as int4, 42::bigint as int8, 9007199254740993::bigint as huge_int8,
         count(*) as count, 12.50::numeric(10, 2) as numeric, 0.5::double precision as float8,
         true as bool, timestamptz '2026-09-24 10:00:00+00' as timestamptz, date '2026-09-24' as date,
         '{"tier": "gold"}'::jsonb as jsonb, array[1, 2] as int_array, null::text as missing`);

for (const [column, value] of Object.entries(rows[0]!)) {
  const type = value === null ? "null" : value instanceof Date ? "Date" : Array.isArray(value) ? "array" : typeof value;
  const shown = value instanceof Date ? value.toISOString() : typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
  console.log(column.padEnd(12), type.padEnd(7), shown);
}
await db.close();
```

Output of `npx tsx driver-types.ts`

```ts
int4         number  42
int8         number  42
huge_int8    bigint  9007199254740993n
count        number  1
numeric      string  "12.50"
float8       number  0.5
bool         boolean true
timestamptz  Date    2026-09-24T10:00:00.000Z
date         Date    2026-09-24T00:00:00.000Z
jsonb        object  {"tier":"gold"}
int_array    array   [1,2]
missing      null    null
```

The `pg` driver, which you use against a PostgreSQL server, makes different choices for some of the same types. The same query, run against the Docker server from [the transactions lesson](https://zudojs.oyinlola.site/learn/db-transactions#two-sessions) from a computer in Lagos (`TZ=Africa/Lagos`):

types-pg.js

```ts
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`
  select 42::integer as int4, 42::bigint as int8, count(*) as count, 12.50::numeric(10, 2) as numeric,
         0.5::double precision as float8, true as bool, timestamptz '2026-09-24 10:00:00+00' as timestamptz,
         date '2026-09-24' as date, '{"tier": "gold"}'::jsonb as jsonb, array[1, 2] as int_array, null::text as missing`);
for (const [column, value] of Object.entries(rows[0])) {
  const type = value === null ? "null" : value instanceof Date ? "Date" : Array.isArray(value) ? "array" : typeof value;
  console.log(column.padEnd(12), type.padEnd(7), value instanceof Date ? value.toISOString() : JSON.stringify(value));
}
await pool.end();
```

Terminal on your computer

```bash
$ TZ=Africa/Lagos node types-pg.js
int4         number  42
int8         string  "42"
count        string  "1"
numeric      string  "12.50"
float8       number  0.5
bool         boolean true
timestamptz  Date    2026-09-24T10:00:00.000Z
date         Date    2026-09-23T23:00:00.000Z
jsonb        object  {"tier":"gold"}
int_array    array   [1,2]
missing      null    null
```

| PostgreSQL type | PGlite gives | `pg` gives | Why it matters |
| --- | --- | --- | --- |
| `integer`, `smallint`, `real`, `double precision` | `number` | `number` | Safe: always fits. |
| `bigint`, and `count(*)` | `number`, or `bigint` when too large | `string` | A 64-bit integer can exceed `Number.MAX_SAFE_INTEGER`. Your type must say which you get. |
| `numeric` | `string` | `string` | Exact decimals would lose digits as a `number`. |
| `timestamptz` | `Date` | `Date` | An absolute moment: correct in any time zone. |
| `date` | `Date` at UTC midnight | `Date` at *local* midnight | With `pg` in Lagos, 24 September became 23 September 23:00 UTC: an off-by-one-day bug waiting to happen. |
| `json`, `jsonb` | parsed value | parsed value | Its shape is whatever someone stored: `unknown` until validated. |
| any nullable column | `null` | `null` | Never `undefined`: a column is always present in the row. |

So the honest TypeScript type depends on the driver. With `pg`, a `bigint` column is `string`; with PGlite it is `number | bigint`. Both drivers let you change their parsers ([In production](#production) shows how), and whatever you choose, write it down in one place: the row type.

REASON IT OUT

### Before you type a table

Look at one table, `orders`, and answer these before writing any TypeScript for it:

- Which columns can be `null`? Is `null` a real state ("no note") or a missing value that should have been required?
- What does the driver return for each column's type, including `bigint`, `numeric` and `date`?
- Which names does the database use, and which does your TypeScript code use?
- Who else writes to this table: another service, an admin running SQL by hand, an old migration? Could a row exist that your types say is impossible?
- Which columns must never leave the server?
- Which parts of a query are values (safe as `$1` parameters) and which are identifiers such as a sort column (which parameters cannot carry)?

**Show the reasoning**

- `note` and `customers.phone` are nullable on purpose. Every other column is `not null`, and the row type must say so exactly: `note: string | null`.
- `total_kobo` is `bigint`, so `number | bigint` with PGlite or `string` with `pg`. Money must become an exact number before arithmetic.
- `snake_case` in SQL, `camelCase` in TypeScript: one mapping function per table does the renaming, so it happens in exactly one place.
- Anything that can write SQL can break your assumptions, so rows entering from the database are, like request bodies, data from outside your program. Validate them where drift would be expensive.
- `customers.password_hash`. It belongs in the entity for the login code, never in a response. That calls for a separate response type and an explicit mapping.
- Values go in parameters. The sort column must come from a fixed allow-list, which a union type can enforce at compile time.

## Row types: the database, exactly

A **row type** describes what one row of a query really contains, in the database's own names and the driver's own value types. It is not pretty, and it is not meant to be used across the app. Its job is to be true:

rows.ts

```ts
export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

/* What PGlite returns for `select * from orders`. */
export interface OrderRow {
  id: number;
  customer_id: number;
  status: OrderStatus;
  total_kobo: number | bigint;
  note: string | null;
  placed_at: Date;
}

export interface CustomerRow {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  password_hash: string;
}
```

Once `note` is typed as `string | null`, the crash from the opening example becomes a compile error, which is where you want to find it:

note.ts

```ts
import type { OrderRow } from "./rows.js";

export function shoutNote(row: OrderRow): string {
  return row.note.toUpperCase();
}
```

What `npx tsc --noEmit` prints

```ts
note.ts:4:10 - error TS18047: 'row.note' is possibly 'null'.

4   return row.note.toUpperCase();
           ~~~~~~~~


Found 1 error in note.ts:4
```

The fix is to decide what "no note" means for this function, which is a business decision the type forced you to make: `row.note?.toUpperCase() ?? "(no note)"`.

### Nullable is not optional

A column that can be `null` is still always *present* in the row. So in a row type, write `note: string | null`, not `note?: string`. The optional form means "the property may be missing, and if present is a string", which says nothing about `null`. The difference survives into JSON, which drops `undefined` and keeps `null`:

null-vs-undefined.ts

```ts
const fromDatabase = { id: 2, note: null };
const withUndefined = { id: 2, note: undefined };

console.log(JSON.stringify(fromDatabase));
console.log(JSON.stringify(withUndefined));
console.log("note" in fromDatabase, "note" in JSON.parse(JSON.stringify(withUndefined)));
```

Output of `npx tsx null-vs-undefined.ts` and of the browser terminal

```json
{"id":2,"note":null}
{"id":2}
true false
```

A client reading your API can tell "this order has no note" (`"note": null`) from "this response does not include notes" (no key). Keep `null` for the first meaning, all the way from the column to the JSON.

## Entities and mappers

The rest of the application should not care about `snake_case` or about which driver returned a `bigint` as a string. It works with **entities**: the application's own model of a thing, with its own names and value types. One **mapper** function per table turns a row into an entity. It is also the one place where awkward values are converted, and where a conversion can fail loudly:

entities.ts

```ts
import type { CustomerRow, OrderRow, OrderStatus } from "./rows.js";

export interface Order {
  readonly id: number;
  readonly customerId: number;
  readonly status: OrderStatus;
  readonly totalKobo: number;
  readonly note: string | null;
  readonly placedAt: Date;
}

export interface Customer {
  readonly id: number;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly passwordHash: string;
}

/* bigint columns arrive as number or bigint (PGlite) or string (pg). Money must be an exact, safe integer. */
export function toKobo(value: number | bigint | string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`amount ${String(value)} is not a safe integer number of kobo`);
  return n;
}

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    totalKobo: toKobo(row.total_kobo),
    note: row.note,
    placedAt: row.placed_at,
  };
}

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    passwordHash: row.password_hash,
  };
}
```

mapping.tsNode.js only

```ts
import { openShop } from "./db.js";
import { toKobo, toOrder } from "./entities.js";
import type { OrderRow } from "./rows.js";

const db = await openShop();
const { rows } = await db.query<OrderRow>("select * from orders order by id");
for (const order of rows.map(toOrder)) {
  console.log(order.id, order.customerId, order.status, `₦${order.totalKobo / 100}`, order.note ?? "(no note)");
}

for (const raw of ["2180000", 9007199254740993n]) {
  try {
    console.log("toKobo:", toKobo(raw));
  } catch (error) {
    console.log("toKobo:", (error as Error).message);
  }
}
await db.close();
```

Output of `npx tsx mapping.ts`

```ts
1 1 paid ₦21800 Leave at the gate
2 1 pending ₦4500 (no note)
3 2 shipped ₦14500 (no note)
toKobo: 2180000
toKobo: amount 9007199254740993 is not a safe integer number of kobo
```

The mapper accepted `pg`'s string form of a `bigint` and refused a value too large to be exact as a JavaScript number. For a shop, a total of 90 trillion naira is a bug, not a sale, and failing at the mapper points straight at it. (Keeping money as `bigint` throughout is the other valid choice; what matters is that the entity type says which one, and the mapper enforces it.)

The entity has `readonly` properties. Entities are passed around the application; `readonly` stops a function from quietly changing a customer that another part of the request is still using. Changes go through the repository, which you will meet shortly.

## Entities are not DTOs

A **DTO** (data transfer object) is the shape of data crossing a boundary: what a client sends in a request, or what the API sends back. [Type-safe API architecture](https://zudojs.oyinlola.site/learn/ts-api-layers) introduced them. They differ from the entity on purpose:

- The **response DTO** leaves out what the client must not see (`passwordHash`) and may add what it needs (a formatted total).
- The **input DTOs** leave out what the client must not set (`id`, `passwordHash`, `status`), and an update DTO makes fields optional.

Now the trap. TypeScript types are **structural**: an object with *more* properties than a type asks for still fits it. So this compiles, and ships the password hash to every client:

leak.tsNode.js only

```ts
import { openShop } from "./db.js";
import { toCustomer, type Customer } from "./entities.js";
import type { CustomerRow } from "./rows.js";

interface CustomerResponse {
  id: number;
  email: string;
  fullName: string;
}

function toResponse(customer: Customer): CustomerResponse {
  return customer;
}

const db = await openShop();
const { rows } = await db.query<CustomerRow>("select * from customers where id = $1", [1]);
console.log(JSON.stringify(toResponse(toCustomer(rows[0]!))));
await db.close();
```

Output of `npx tsx leak.ts`

```json
{"id":1,"email":"ada@example.com","fullName":"Ada Okafor","phone":"0803 000 0001","passwordHash":"scrypt$16384$c2FsdA$aGFzaA"}
```

`Customer` has every property `CustomerResponse` needs, so it is assignable to it, and at runtime it is still the same object with `passwordHash` inside. `Omit<Customer, "passwordHash">` would have the same problem: types describe what you may *read*, they never remove properties. Only code that builds a new object does:

dtos.ts

```ts
import type { Customer } from "./entities.js";

export interface CustomerResponse {
  readonly id: number;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
}

export interface CreateCustomerInput {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly password: string;
}

export type UpdateCustomerInput = Partial<Pick<CreateCustomerInput, "fullName" | "phone">>;

export function toCustomerResponse(customer: Customer): CustomerResponse {
  return { id: customer.id, email: customer.email, fullName: customer.fullName, phone: customer.phone };
}
```

Writing the response as an object literal also switches on TypeScript's **excess property check**: in a fresh object literal, a property the target type does not declare is an error. If someone adds the hash to the mapper "for debugging", the compiler objects:

excess.ts

```ts
import type { Customer } from "./entities.js";
import type { CustomerResponse } from "./dtos.js";

export function toCustomerResponse(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    email: customer.email,
    fullName: customer.fullName,
    phone: customer.phone,
    passwordHash: customer.passwordHash,
  };
}
```

What `npx tsc --noEmit` prints

```ts
excess.ts:10:5 - error TS2353: Object literal may only specify known properties, and 'passwordHash' does not exist in type 'CustomerResponse'.

10     passwordHash: customer.passwordHash,
       ~~~~~~~~~~~~


Found 1 error in excess.ts:10
```

That check only applies to object literals, which is one more reason to write mappers field by field. `UpdateCustomerInput` shows the other direction: `Pick` chooses the fields a customer may change at all, and `Partial` makes each of them optional for a PATCH request, so `email` and `password` cannot be changed through this path even by accident.

## Checking rows at the boundary

Row types can still drift from the database. A colleague's migration adds the status `'refunded'`; another service writes a row with a `null` the types say is impossible. The row type and the mapper would pass those values along unchecked, and the failure would surface far away. Where that risk matters (data written by other systems, `jsonb` columns, reports that feed money decisions), validate rows when they enter your program, as you validate request bodies. **zod** describes the shape once and checks it at runtime:

validate-rows.tsNode.js only

```ts
import { z } from "zod";
import { openShop } from "./db.js";

const OrderRowSchema = z.object({
  id: z.number().int(),
  customer_id: z.number().int(),
  status: z.enum(["pending", "paid", "shipped", "cancelled"]),
  total_kobo: z.union([z.number().int(), z.bigint()]),
  note: z.string().nullable(),
  placed_at: z.date(),
});

const db = await openShop();
await db.exec(`
  alter table orders drop constraint orders_status_check;
  insert into orders (customer_id, status, total_kobo, placed_at) values (2, 'refunded', 1450000, now());
`);

const { rows } = await db.query<unknown>("select * from orders order by id");
for (const raw of rows) {
  const result = OrderRowSchema.safeParse(raw);
  if (result.success) {
    console.log(`order ${result.data.id}: ok (${result.data.status})`);
  } else {
    console.log(`order ${(raw as { id: number }).id}: invalid`, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
}
await db.close();
```

Output of `npx tsx validate-rows.ts`

```ts
order 1: ok (paid)
order 2: ok (pending)
order 3: ok (shipped)
order 4: invalid [
  'status: Invalid option: expected one of "pending"|"paid"|"shipped"|"cancelled"'
]
```

Typing the query as `<unknown>` is the honest starting point: TypeScript forces you through the schema before you can touch a field. The schema then tells you precisely which row and which column broke the contract, instead of an order page crashing three layers later. `z.infer<typeof OrderRowSchema>` would even give you the row type for free, so the type and the check cannot disagree. Validation costs a little time per row; use it where drift is likely or expensive, not on every hot query.

## Typed repositories

A **repository** owns the SQL for one table and speaks entities to the rest of the app; [the BookStore](https://zudojs.oyinlola.site/learn/bookstore-data#repositories) built its first ones. With types, a repository can also rule out whole classes of mistakes at compile time. Two of them:

- **Mixing up ids.** A customer id and an order id are both numbers, so `findById(customerId)` compiles and returns the wrong order. A **branded type** ([Generic API design](https://zudojs.oyinlola.site/learn/ts-generic-design)) makes them different types that are still plain numbers at runtime.
- **Unsafe sorting.** A sort column cannot be a `$1` parameter, so it is pasted into SQL. A union of allowed names, mapped to fixed SQL fragments, means only known fragments can ever be pasted.

orders-repo.ts

```ts
import type { Queryable } from "./db.js";
import { toOrder, type Order } from "./entities.js";
import type { OrderRow, OrderStatus } from "./rows.js";

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
export type OrderId = Brand<number, "OrderId">;
export type CustomerId = Brand<number, "CustomerId">;

export const orderId = (n: number) => n as OrderId;
export const customerId = (n: number) => n as CustomerId;

export type OrderSort = "newest" | "oldest" | "biggest";
const ORDER_BY: Record<OrderSort, string> = {
  newest: "placed_at desc, id desc",
  oldest: "placed_at, id",
  biggest: "total_kobo desc, id",
};

export interface NewOrder {
  readonly customerId: CustomerId;
  readonly totalKobo: number;
  readonly note: string | null;
}

export class OrderRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: OrderId): Promise<Order | undefined> {
    const { rows } = await this.db.query<OrderRow>("select * from orders where id = $1", [id]);
    return rows[0] === undefined ? undefined : toOrder(rows[0]);
  }

  async listForCustomer(customer: CustomerId, options: { sort: OrderSort; status?: OrderStatus }): Promise<Order[]> {
    const { rows } = await this.db.query<OrderRow>(
      `select * from orders where customer_id = $1 and ($2::text is null or status = $2)
       order by ${ORDER_BY[options.sort]}`,
      [customer, options.status ?? null],
    );
    return rows.map(toOrder);
  }

  async create(input: NewOrder): Promise<Order> {
    const { rows } = await this.db.query<OrderRow>(
      `insert into orders (customer_id, status, total_kobo, note, placed_at)
       values ($1, 'pending', $2, $3, now()) returning *`,
      [input.customerId, input.totalKobo, input.note],
    );
    return toOrder(rows[0]!);
  }
}
```

`findById` returns `Promise<Order | undefined>`: "not found" is a normal outcome the caller must handle, and the type makes forgetting it a compile error. `ORDER_BY` is typed `Record<OrderSort, string>`, so adding a sort option without its SQL does not compile either. Use it:

use-repo.tsNode.js only

```ts
import { openShop } from "./db.js";
import { OrderRepository, customerId, orderId } from "./orders-repo.js";

const db = await openShop();
const orders = new OrderRepository(db);

const newest = await orders.listForCustomer(customerId(1), { sort: "newest" });
console.log(newest.map((o) => `${o.id}:${o.status}`));

const pendingOnly = await orders.listForCustomer(customerId(1), { sort: "biggest", status: "pending" });
console.log(pendingOnly.map((o) => `${o.id}:${o.totalKobo}`));

const created = await db.transaction(async (tx) => {
  const inTx = new OrderRepository(tx);
  return inTx.create({ customerId: customerId(2), totalKobo: 250000, note: "Call on arrival" });
});
console.log(created.id, created.status, created.note);

const missing = await orders.findById(orderId(99));
console.log(missing ?? "order 99 not found");
await db.close();
```

Output of `npx tsx use-repo.ts`

```json
[ '2:pending', '1:paid' ]
[ '2:450000' ]
4 pending Call on arrival
order 99 not found
```

The repository takes a `Queryable`, so the same class runs on the database or inside a transaction: `tx` fits the interface too. That is how several repositories take part in one transaction. And the brand does its job at compile time:

brand-error.ts

```ts
import { openShop } from "./db.js";
import { OrderRepository, customerId } from "./orders-repo.js";

const db = await openShop();
const orders = new OrderRepository(db);
await orders.findById(customerId(1));
await orders.listForCustomer(customerId(1), { sort: "price" });
```

What `npx tsc --noEmit` prints

```ts
brand-error.ts:6:23 - error TS2345: Argument of type 'CustomerId' is not assignable to parameter of type 'OrderId'.
  Type 'CustomerId' is not assignable to type '{ readonly [brand]: "OrderId"; }'.
    Types of property '[brand]' are incompatible.
      Type '"CustomerId"' is not assignable to type '"OrderId"'.

6 await orders.findById(customerId(1));
                        ~~~~~~~~~~~~~

brand-error.ts:7:47 - error TS2322: Type '"price"' is not assignable to type 'OrderSort'.

7 await orders.listForCustomer(customerId(1), { sort: "price" });
                                                ~~~~

  orders-repo.ts:34:58 - The expected type comes from property 'sort' which is declared here on type '{ sort: OrderSort; status?: OrderStatus | undefined; }'
    34   async listForCustomer(customer: CustomerId, options: { sort: OrderSort; status?: OrderStatus }): Promise<Order[]> {
                                                                ~~~~


Found 2 errors in the same file, starting at: brand-error.ts:6
```

Both mistakes, a customer id where an order id belongs and a sort the SQL does not know, are caught before the code runs.

## Generating types from the schema

Hand-written row types drift: someone adds a column or makes one nullable in a migration and forgets the TypeScript. The database already knows every column, its type and whether it can be null, in `information_schema.columns`. A **type generator** reads that and writes the row types for you:

generate.tsNode.js only

```ts
import { openShop } from "./db.js";

const TS_TYPES: Record<string, string> = {
  int2: "number", int4: "number", float4: "number", float8: "number",
  int8: "number | bigint", numeric: "string",
  text: "string", varchar: "string", uuid: "string",
  bool: "boolean", timestamptz: "Date", date: "Date",
  jsonb: "unknown", json: "unknown",
};

interface ColumnInfo {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
}

const pascal = (name: string) => name.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase()).replace(/s$/, "");

const db = await openShop();
const { rows } = await db.query<ColumnInfo>(`
  select table_name, column_name, udt_name, is_nullable
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position`);

const tables = Map.groupBy(rows, (c) => c.table_name);
for (const [table, columns] of tables) {
  console.log(`export interface ${pascal(table)}Row {`);
  for (const c of columns) {
    const type = TS_TYPES[c.udt_name] ?? "unknown";
    console.log(`  ${c.column_name}: ${type}${c.is_nullable === "YES" ? " | null" : ""};`);
  }
  console.log("}");
}
await db.close();
```

Output of `npx tsx generate.ts`

```ts
export interface CustomerRow {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  password_hash: string;
}
export interface OrderRow {
  id: number;
  customer_id: number;
  status: string;
  total_kobo: number | bigint;
  note: string | null;
  placed_at: Date;
}
```

Save that output to a file such as `src/db/rows.generated.ts`, commit it, and run the generator in CI against a database migrated from scratch. If the output differs from the committed file, the build fails: the types can no longer drift from the schema silently. Notice what the generator cannot know: that `status` only allows four values (it is `text` with a `check`). A PostgreSQL `enum` type or a lookup table would carry that information; otherwise you narrow it by hand, as `rows.ts` did.

Real projects use a maintained tool instead of writing this: **kysely-codegen** and **pg-to-ts** generate table types like the ones above; **pgtyped** and **sqlc** go further and read each SQL *query* to generate its exact parameter and result types, including joins and computed columns.

## Query builders and ORMs

Row types describe tables, but `db.query<OrderRow>("select id, status from orders")` still claims the result has every column. The next step is to let TypeScript *derive* the result type from the query. That is what a typed **query builder** does. Here is the core trick in a few lines: a `Database` interface lists the tables, and the selected columns become the result type with `Pick`:

builder.ts

```ts
import type { Queryable } from "./db.js";
import type { CustomerRow, OrderRow } from "./rows.js";

export interface Database {
  orders: OrderRow;
  customers: CustomerRow;
}

export async function selectFrom<T extends keyof Database, C extends keyof Database[T] & string>(
  db: Queryable,
  table: T,
  columns: readonly C[],
  where: Partial<Database[T]> = {},
): Promise<Pick<Database[T], C>[]> {
  const keys = Object.keys(where) as (keyof Database[T] & string)[];
  const conditions = keys.map((key, i) => `"${key}" = $${i + 1}`);
  const sql =
    `select ${columns.map((c) => `"${c}"`).join(", ")} from "${table}"` +
    (conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "") +
    " order by 1";
  const { rows } = await db.query<Pick<Database[T], C>>(sql, keys.map((key) => where[key]));
  return rows;
}
```

use-builder.tsNode.js only

```ts
import { selectFrom } from "./builder.js";
import { openShop } from "./db.js";

const db = await openShop();
const paid = await selectFrom(db, "orders", ["id", "total_kobo"], { status: "paid" });
console.log(paid, paid[0]?.total_kobo);

const people = await selectFrom(db, "customers", ["email", "phone"]);
console.log(people.map((p) => `${p.email}: ${p.phone ?? "no phone"}`));
await db.close();
```

Output of `npx tsx use-builder.ts`

```json
[ { id: 1, total_kobo: 2180000 } ] 2180000
[ 'ada@example.com: 0803 000 0001', 'tunde@example.com: no phone' ]
```

Hover over `paid` in an editor and its type is `Pick<OrderRow, "id" | "total_kobo">[]`: exactly the columns selected. Table names, column names and filter values are all checked against the `Database` interface, and identifiers only ever come from that checked list. A misspelled column, or a filter value of the wrong type, fails at compile time:

builder-error.ts

```ts
import { selectFrom } from "./builder.js";
import { openShop } from "./db.js";

const db = await openShop();
await selectFrom(db, "orders", ["id", "totl_kobo"]);
await selectFrom(db, "orders", ["id"], { status: "refunded" });
```

What `npx tsc --noEmit` prints

```ts
builder-error.ts:5:39 - error TS2820: Type '"totl_kobo"' is not assignable to type '"customer_id" | "id" | "note" | "placed_at" | "status" | "total_kobo"'. Did you mean '"total_kobo"'?

5 await selectFrom(db, "orders", ["id", "totl_kobo"]);
                                        ~~~~~~~~~~~

builder-error.ts:6:42 - error TS2322: Type '"refunded"' is not assignable to type 'OrderStatus | undefined'.

6 await selectFrom(db, "orders", ["id"], { status: "refunded" });
                                           ~~~~~~


Found 2 errors in the same file, starting at: builder-error.ts:5
```

**Kysely** is a full query builder built on exactly this idea, covering joins, aggregates and subqueries. **ORMs** (object-relational mappers) go further: they own the schema definition and generate both the SQL and the types. **Prisma** generates a client from its own schema file (and is what [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database) builds on); **Drizzle** declares tables in TypeScript; **TypeORM** uses decorated classes.

| Approach | Types come from | Strengths | Costs |
| --- | --- | --- | --- |
| Raw SQL + hand-written row types | You | Full SQL power, no dependency, obvious performance | Types can drift; every mapper by hand |
| Raw SQL + codegen (pgtyped, sqlc) | The database and your queries | Exact types per query, SQL stays SQL | A build step; dynamic queries are awkward |
| Query builder (Kysely) | A `Database` interface, often generated | Result types follow the query, composable dynamic filters | A new API to learn; very complex SQL still needs raw fragments |
| ORM (Prisma, Drizzle, TypeORM) | The ORM's schema | Fast CRUD, relations, migrations included | Hidden SQL (watch for N+1), less control over locks and plans, the schema lives in the tool |

None of them removes the need for what the last four lessons taught. An ORM still needs the right indexes, still loses updates in read-modify-write code, and still needs expand-and-contract migrations. Pick the approach whose failure modes your team can see: many teams use an ORM or builder for everyday CRUD and drop to typed raw SQL for reports and concurrency-sensitive statements.

## Testing typed database code

Two kinds of tests keep database types honest. **Type tests** prove that mistakes do not compile. A line marked `// @ts-expect-error` must contain a type error, or `tsc` fails, so it is a test that runs every time the project is type-checked:

type-tests.ts

```ts
import type { CustomerResponse } from "./dtos.js";
import { customerId, orderId, type OrderId } from "./orders-repo.js";
import type { OrderRow } from "./rows.js";

export function typeTests(row: OrderRow, response: CustomerResponse): void {
  // @ts-expect-error: note can be null
  row.note.trim();

  // @ts-expect-error: a customer id is not an order id
  const wrong: OrderId = customerId(1);

  // @ts-expect-error: responses never carry the password hash
  void response.passwordHash;

  const right: OrderId = orderId(1);
  void [wrong, right];
}
console.log("type tests compiled");
```

Output of `npx tsx type-tests.ts` and of the browser terminal

```ts
type tests compiled
```

If someone makes `note` non-nullable by mistake or adds `passwordHash` to the response type, the corresponding line stops being an error and the type check fails. **Integration tests** cover the other half: run every repository method against a real database (PGlite in-process, or PostgreSQL in CI), and validate what comes back with the row schemas from the validation section. Together with the generator's drift check, that closes the gap between what the types say and what the database does.

## In production

- **Configure the driver once.** With `pg`, `pg.types.setTypeParser(20, (v) => BigInt(v))` returns `bigint` columns as `bigint`; `pg.types.setTypeParser(1082, (v) => v)` keeps `date` columns as `"2026-09-24"` strings and avoids the local-midnight bug. Do it at startup, in one module, and make the row types match.
- **Run servers in UTC** and use `timestamptz`, so dates do not depend on where the code runs.
- **Money**: integer minor units as `number` after a safe-integer check, or `bigint`, or `numeric` strings handled with a decimal library. Never floats, and never mixed within one codebase.
- **Keep secrets out of entities where possible.** Select `password_hash` only in the login query, into its own small type, rather than loading it with every customer.
- **Treat `jsonb` as `unknown`** until a schema has checked it. Whatever wrote it, years ago, did not know your current type.

## Practice

TRY IT YOURSELF

### Type the payments table

A `payments` table has `id integer`, `order_id integer not null`, `amount numeric(12, 2) not null` (in naira, from an old integration), `failure_reason text` (null when the payment succeeded) and `paid_at timestamptz` (null until paid). Write `PaymentRow`, a `Payment` entity with `amountKobo: number`, and `toPayment`, converting the naira string to kobo exactly (no floating point).

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Parsing the amount as text and multiplying its whole-naira part by 100 keeps every kobo exact; letting `Number("1150.15") * 100` do the conversion is the bug the last line of output is there to show.

HINT 2

`const match = /^(\d+)\.(\d{2})$/.exec(amount); if (!match) throw new RangeError(...); const kobo = Number(match[1]) * 100 + Number(match[2]); if (!Number.isSafeInteger(kobo)) throw new RangeError(...); return kobo;` — then `toPayment` just renames each field, calling `nairaToKobo(row.amount)` for `amountKobo`.

SOLUTION

payments.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

interface PaymentRow {
  id: number;
  order_id: number;
  amount: string;
  failure_reason: string | null;
  paid_at: Date | null;
}

interface Payment {
  readonly id: number;
  readonly orderId: number;
  readonly amountKobo: number;
  readonly failureReason: string | null;
  readonly paidAt: Date | null;
}

function nairaToKobo(amount: string): number {
  const match = /^(\d+)\.(\d{2})$/.exec(amount);
  if (!match) throw new RangeError(`not a naira amount with 2 decimals: ${amount}`);
  const kobo = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`amount too large: ${amount}`);
  return kobo;
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    amountKobo: nairaToKobo(row.amount),
    failureReason: row.failure_reason,
    paidAt: row.paid_at,
  };
}

const db = new PGlite();
await db.exec(`
  create table payments (id integer primary key, order_id integer not null, amount numeric(12, 2) not null,
                         failure_reason text, paid_at timestamptz);
  insert into payments values (1, 1, 1150.15, 'card declined', null), (2, 1, 1150.15, null, '2026-09-01 09:31:00+00');
`);
const { rows } = await db.query<PaymentRow>("select * from payments order by id");
console.log(rows.map(toPayment));
console.log(Number("1150.15") * 100, nairaToKobo("1150.15"));
await db.close();
```

Output of `npx tsx payments.ts`

```json
[
  {
    id: 1,
    orderId: 1,
    amountKobo: 115015,
    failureReason: 'card declined',
    paidAt: null
  },
  {
    id: 2,
    orderId: 1,
    amountKobo: 115015,
    failureReason: null,
    paidAt: 2026-09-01T09:31:00.000Z
  }
]
115015.00000000001 115015
```

The last line shows why the string is parsed as digits: floating-point arithmetic on the naira value can be off by a fraction of a kobo, which is enough to break an equality check against the provider's amount.

TRY IT YOURSELF

### Stop the leak

A teammate writes `return { ...customer, orderCount }` in a handler whose return type is `CustomerSummary { id; fullName; orderCount }`. It compiles. What goes out in the response, why does TypeScript allow it, and how do you fix it so the compiler protects you next time?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

TypeScript's excess property check only looks closely at object *literals* written directly where a type is expected. Ask what kind of value `{ ...customer, orderCount }` actually is once the spread has run.

HINT 2

A spread's result is structurally compatible with `CustomerSummary` (it has at least those fields), so the assignment is allowed even though it also carries `email`, `phone` and `passwordHash`. List the fields by hand instead — `{ id: customer.id, fullName: customer.fullName, orderCount }` — so that specific object literal *is* checked for excess properties.

SOLUTION

The response contains every property of the customer entity, including `email`, `phone` and `passwordHash`, plus `orderCount`. The excess property check does not fire, because properties that come from a spread are not checked as excess, and structurally the object has everything `CustomerSummary` needs. Fix it by listing fields: `return { id: customer.id, fullName: customer.fullName, orderCount }`. Now any extra property someone adds to that literal is a compile error, and add a `// @ts-expect-error` type test that reads `passwordHash` from a `CustomerSummary`, plus a response test that asserts the exact set of JSON keys.

TRY IT YOURSELF

### Choose the approach

Pick an approach for each team: (a) two developers building an admin panel with mostly CRUD screens, no SQL experience; (b) a payments team whose statements use `for update`, CTEs and serializable retries; (c) a reporting service with 40 complex read-only queries; (d) an API with dynamic filters and sorting chosen by the client.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Ask, for each team: how much of their work is plain CRUD versus SQL only an expert would write by hand? Do queries need to compose at runtime, or are they mostly fixed and numerous?

HINT 2

(a) favours an ORM's generated CRUD over hand-written SQL. (b) needs exact control over locks and isolation, which raw SQL (typed) gives and an ORM tends to hide. (c) is many fixed queries, each wanting its own exact result type — a codegen tool over raw SQL fits. (d) needs queries assembled at runtime from untrusted pieces, which is what a typed query builder is for.

SOLUTION

(a) An ORM such as Prisma or Drizzle: fast CRUD and migrations, with the indexes and N+1 queries watched. (b) Typed raw SQL, or a query builder with raw fragments: they need exact control over locks, isolation and statement shape, and the lessons' repositories fit that well. (c) Raw SQL with codegen (pgtyped or sqlc): every report query gets exact result types without rewriting SQL in another API. (d) A query builder such as Kysely: composable, typed conditions, with sort columns from an allow-list rather than pasted text.

## Summary

- `query<T>` is an unchecked promise. Know what your driver returns: `bigint` and `count` are strings in `pg`, `numeric` is a string in both, `date` is a timezone trap, nullable columns are `null`, never `undefined`.
- Row types mirror the database exactly (`snake_case`, `| null`, driver value types). One mapper per table turns rows into entities and converts awkward values, failing loudly.
- Entities, input DTOs and response DTOs are different types. Structural typing lets extra properties through, so build responses field by field; excess property checks then guard the literal.
- Validate rows where the database can drift from your types, starting from `unknown`. Typed repositories add branded ids, `| undefined` for "not found", allow-listed sorting, and accept a transaction through the same interface.
- Generate row types from `information_schema` (or with a tool) and fail CI on drift. Query builders derive result types from the query; ORMs own the schema. Choose by the failure modes your team can see.

That completes Database engineering. The next course, [API engineering](https://zudojs.oyinlola.site/learn/api-pagination-versioning), builds APIs on top of this foundation: pagination, versioning, idempotent payments and rate limits.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
