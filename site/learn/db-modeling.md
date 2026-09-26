---
title: "Modelling data for a shop — ZudoJS Academy"
description: "Turn a messy spreadsheet of orders into a normalised PostgreSQL schema for a shop, see each anomaly on real data, add constraints, and walk a category tree."
source: https://zudojs.oyinlola.site/learn/db-modeling
---

LEVEL 8 · LESSON 1 OF 5

Design and performance Core

# Modelling data for a shop

Turn a messy spreadsheet of orders into a normalised PostgreSQL schema for a shop, see each anomaly on real data, add constraints, and walk a category tree.

- **55 min** to read and try
- **You need:** How databases work, SQL with PostgreSQL, and Joins, grouping and transactions
- **You build:** A normalised, constrained shop schema (customers, products, categories, orders, order lines, payments, inventory) with a recursive category tree

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Find the entities, relationships and keys in a business description
- Spot update, insertion and deletion anomalies and remove them with 1NF, 2NF and 3NF
- Write a shop schema whose constraints refuse invalid data
- Walk a category tree up and down with WITH RECURSIVE
- Denormalise on purpose and keep the copy honest

## The shop that lived in a spreadsheet

Amaka sells groceries and phone accessories online in Lagos. For her first year, every order went into one sheet: a row per product per order, with the customer's details and the product's details copied into each row. It was easy to start with, and her developer loaded it into PostgreSQL exactly as it was. Here it is, as a module the next examples import:

sheet.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openSheet() {
  const db = new PGlite();
  await db.exec(`
    create table order_sheet (
      order_id integer not null,
      customer_email text not null,
      customer_name text not null,
      customer_phone text not null,
      sku text not null,
      product_name text not null,
      unit_price_kobo integer not null,
      quantity integer not null,
      primary key (order_id, sku)
    );
    insert into order_sheet values
      (1, 'ada@example.com',   'Ada Okafor',  '0803 000 0001', 'RICE-5KG', 'Rice 5kg',       950000, 2),
      (1, 'ada@example.com',   'Ada Okafor',  '0803 000 0001', 'OIL-1L',   'Palm oil 1L',    280000, 1),
      (2, 'ada@example.com',   'Ada Okafor',  '0803 000 0001', 'CHG-20W',  'Charger 20W',    450000, 1),
      (3, 'tunde@example.com', 'Tunde Bello', '0805 000 0002', 'RICE-5KG', 'Rice 5kg',       950000, 1);
  `);
  return db;
}
```

Prices are in **kobo**, the smallest unit of the naira (₦1 = 100 kobo), stored as whole numbers so no rounding error can creep in; [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) explains why. The primary key is the pair `(order_id, sku)`: one row per product per order.

Three things go wrong with this table within a week. First, Ada calls support with a new phone number. The agent has order 2 open, so they fix it there:

update-anomaly.jsNode.js only

```ts
import { openSheet } from "./sheet.js";

const db = await openSheet();
await db.query("update order_sheet set customer_phone = $1 where order_id = $2", ["0809 111 2222", 2]);

const { rows } = await db.query(
  "select distinct customer_phone from order_sheet where customer_email = $1 order by 1",
  ["ada@example.com"],
);
console.log("Ada's phone numbers:", rows.map((r) => r.customer_phone));
await db.close();
```

Output of `node update-anomaly.js`

```ts
Ada's phone numbers: [ '0803 000 0001', '0809 111 2222' ]
```

Ada now has two phone numbers, and nobody can tell which one is right. That is an **update anomaly**: one fact (Ada's phone) is stored in several rows, and an update that misses some of them leaves the data contradicting itself.

Next, Amaka wants to list new earbuds for sale before anyone has bought them:

insert-anomaly.jsNode.js only

```ts
import { openSheet } from "./sheet.js";

const db = await openSheet();
try {
  await db.query(
    "insert into order_sheet (sku, product_name, unit_price_kobo) values ($1, $2, $3)",
    ["BUDS-01", "Earbuds", 1200000],
  );
} catch (error) {
  console.log(error.message);
}
await db.close();
```

Output of `node insert-anomaly.js`

```ts
null value in column "order_id" of relation "order_sheet" violates not-null constraint
```

An **insertion anomaly**: you cannot record a product without inventing an order, because a product only exists in this table as part of an order. Finally, Ada cancels order 2 and the row is deleted:

delete-anomaly.jsNode.js only

```ts
import { openSheet } from "./sheet.js";

const db = await openSheet();
await db.query("delete from order_sheet where order_id = $1", [2]);

const { rows } = await db.query("select product_name, unit_price_kobo from order_sheet where sku = $1", ["CHG-20W"]);
console.log("What do we know about CHG-20W?", rows);
await db.close();
```

Output of `node delete-anomaly.js`

```ts
What do we know about CHG-20W? []
```

A **deletion anomaly**: removing the order also removed the only record that the 20W charger exists and costs ₦4,500. The shop forgot one of its own products.

All three have the same cause: the table mixes facts about *different things* (customers, products, orders) in one row. This lesson fixes that by **modelling** the data: deciding which things exist, what is true about each, and how they connect. Then it takes one careful step back, and copies some data on purpose.

## Entities, attributes and relationships

Modelling starts on paper, not in SQL. Read the business description and underline the nouns:

Customers place orders. An order contains one or more products, each with a quantity. Products belong to categories, and categories can sit inside other categories (Electronics, then Accessories, then Chargers). A customer pays for an order, sometimes in two attempts when the first card fails. The shop tracks how many of each product are on the shelf.

Each noun that has its own identity and its own facts becomes an **entity**, and each entity becomes a table: customer, order, product, category, payment, inventory. The facts about an entity are its **attributes**, which become columns. The verbs are **relationships**. For every relationship, ask two questions, once in each direction: "one X has how many Y?" The answers are its **cardinality**:

| Relationship | Cardinality | Where the key goes |
| --- | --- | --- |
| customer places orders | one-to-many | `orders.customer_id` |
| order contains products | many-to-many, with a quantity | a table `order_lines (order_id, product_id, quantity, …)` |
| product belongs to categories | many-to-many | `product_categories (product_id, category_id)` |
| category sits inside a category | one-to-many, to itself | `categories.parent_id` |
| order is paid by payments | one-to-many | `payments.order_id` |
| product has a stock level | one-to-one | `inventory.product_id` as its primary key |

The order-to-product relationship carries facts of its own, the quantity and the price paid, so its join table is a real entity, usually called an **order line**. [How databases work](https://zudojs.oyinlola.site/learn/databases#relationships) showed plain join tables; an **association entity** like this one is the same idea with extra columns. Drawn as a diagram:

```ts
customers 1───* orders 1───* order_lines *───1 products 1───1 inventory
                  │                               │
                  1                               *
                  │                               │
                  *                       product_categories
               payments                           *
                                                  │
                                                  1
                                             categories ──┐ parent_id
                                                  *       │ (a category
                                                  └───────┘  has a parent)
```

The shop's entities. "1───*" reads "one to many": one customer, many orders.

### Keys: natural or surrogate?

Every table needs a primary key. A **natural key** comes from the data itself, such as a product's SKU (stock keeping unit) or a customer's email. A **surrogate key** is a number or UUID the database makes up, with no meaning. Natural keys change more often than you expect: customers change emails, and a supplier renumbers SKUs. When a primary key changes, every foreign key pointing at it must change too. So the usual design is a surrogate primary key (`id integer generated always as identity`) *plus* a `unique` constraint on the natural key, which still stops duplicates.

REASON IT OUT

### Questions to settle before writing the schema

A schema is a list of promises about the data. Before you write it, decide what must always be true. Think through these for the shop:

- The price of rice goes up next month. What must happen to the total of an order placed today?
- Can the same email belong to two customers if one is written `Ada@Example.com`?
- Can an order exist with no customer? With no lines? Can a line have quantity 0?
- A customer who has orders asks to be deleted. What happens to their orders and payments?
- Two payment attempts arrive from the payment provider with the same reference. Is that one payment or two?
- Can stock go negative? Can more be reserved than is on the shelf?
- Which of these rules can the database check by itself, and which need application code?

**Show the reasoning**

- The order must keep the price that was paid. So an order line stores its own `unit_price_kobo`, copied from the product at the moment of sale. That looks like duplication, but it is a *different fact*: "the price on 3 March", not "the price today".
- No: emails are compared case-insensitively. A unique index on `lower(email)` enforces it.
- No customer: never (`not null` plus a foreign key). No lines: allowed for a moment while the order is built inside a transaction, so this rule belongs to application code (or a deferred check). Quantity 0: never, `check (quantity > 0)`.
- Orders and payments are financial records you are usually required to keep, so the foreign key uses `on delete restrict`: the delete is refused. Personal data is anonymised instead of deleted, which is a data-protection topic of its own.
- One payment: `provider_ref` is `unique`, so the second insert fails and your code can treat it as "already recorded". [The idempotency lesson](https://zudojs.oyinlola.site/learn/api-idempotency) builds on exactly this.
- Neither: `check (on_hand >= 0)` and `check (reserved <= on_hand)`.
- Everything about a single row (not null, ranges, formats, uniqueness, references) the database checks cheaply and reliably. Rules that span many rows over time ("an order has at least one line when it is paid") need a transaction and application code, or a trigger.

## Normalisation: 1NF, 2NF and 3NF

**Normalisation** is a set of rules for splitting tables so that every fact is stored exactly once. The rules are numbered **normal forms**. Each one names a kind of dependency that causes anomalies. You need three of them; the higher ones matter rarely.

### First normal form: one value per cell

A table is in **first normal form** (1NF) when every cell holds a single value, and there are no repeating groups such as `product1`, `product2`, `product3` columns. Here is an even earlier version of Amaka's data, with a whole order in one row and the items packed into text:

first-normal-form.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table orders_v0 (order_id integer primary key, customer_email text, items text);
  insert into orders_v0 values
    (1, 'ada@example.com', 'RICE-5KG x2, OIL-1L x1'),
    (2, 'ada@example.com', 'CHG-20W x1'),
    (3, 'tunde@example.com', 'RICE-5KG x1');
`);

const report = `
  select split_part(item, ' x', 1) as sku, sum(split_part(item, ' x', 2)::int)::int as sold
  from orders_v0, string_to_table(items, ', ') as item
  group by 1 order by 1`;
console.log((await db.query(report)).rows);

await db.exec("update orders_v0 set items = 'RICE-5KG x2,OIL-1L x1' where order_id = 1");
try {
  console.log((await db.query(report)).rows);
} catch (error) {
  console.log("report failed:", error.message);
}
await db.close();
```

Output of `node first-normal-form.js`

```json
[
  { sku: 'CHG-20W', sold: 1 },
  { sku: 'OIL-1L', sold: 1 },
  { sku: 'RICE-5KG', sold: 3 }
]
report failed: invalid input syntax for type integer: "2,OIL-1L"
```

Answering "how many of each product did we sell?" needed text surgery: `string_to_table` splits the text into rows and `split_part` cuts each piece at `" x"`. Then one row was saved with a missing space after the comma, and the same report crashed: the text no longer split into two items, so `"2,OIL-1L"` reached the integer conversion. A slightly different typo would not crash; it would silently count wrong. The database cannot check the format, cannot index the SKUs inside the text, and cannot make a foreign key to `products`. In 1NF, each item is its own row.

> NOTE
>
> PostgreSQL has array and `jsonb` columns, and they have good uses: a list of tags you only display, or a payload from another system kept as received. The rule of thumb: if you will filter by it, join on it, count it or constrain it, it deserves rows in a table.

### Second normal form: depend on the whole key

`order_sheet` is in 1NF: one product per row. But its key is the pair `(order_id, sku)`, and look at what each column depends on:

- `quantity` depends on the whole pair: how many of *this* product in *this* order.
- `product_name` and `unit_price_kobo` depend on `sku` alone.
- `customer_email`, `customer_name` and `customer_phone` depend on `order_id` alone.

A column that depends on only *part* of a composite key is a **partial dependency**. **Second normal form** (2NF) says: no partial dependencies. Each partial dependency moves into its own table, keyed by the part it depends on: products keyed by SKU, orders keyed by order id. Those are exactly the columns that caused the insertion and deletion anomalies: the product only existed as part of an order.

### Third normal form: nothing but the key

After the 2NF split, an `orders` table would be `(order_id, customer_email, customer_name, customer_phone)`. There is no composite key any more, but `customer_name` and `customer_phone` depend on `customer_email`, which depends on `order_id`. A column that depends on the key only *through* another non-key column is a **transitive dependency**, and that is exactly the update anomaly you saw: the phone was stored once per order. **Third normal form** (3NF) says: no transitive dependencies. Customers get their own table, and orders keep only `customer_id`.

The classic summary: every non-key column must depend on *the key* (1NF), *the whole key* (2NF), and *nothing but the key* (3NF).

### Splitting without losing anything

A split is only correct if joining the pieces back gives exactly the original rows: a **lossless decomposition**. You can prove it with SQL. The next example builds the three tables from the sheet with `insert … select distinct`, joins them back, and uses `except` in both directions (rows in one result and not in the other):

decompose.jsNode.js only

```ts
import { openSheet } from "./sheet.js";

const db = await openSheet();
await db.exec(`
  create table customers (email text primary key, name text not null, phone text not null);
  create table products (sku text primary key, name text not null, price_kobo integer not null);
  create table orders (id integer primary key, customer_email text not null references customers (email));
  create table order_lines (
    order_id integer references orders (id),
    sku text references products (sku),
    quantity integer not null,
    primary key (order_id, sku)
  );
  insert into customers select distinct customer_email, customer_name, customer_phone from order_sheet;
  insert into products select distinct sku, product_name, unit_price_kobo from order_sheet;
  insert into orders select distinct order_id, customer_email from order_sheet;
  insert into order_lines select order_id, sku, quantity from order_sheet;
`);

const rejoined = `
  select o.id, c.email, c.name, c.phone, p.sku, p.name, p.price_kobo, l.quantity
  from order_lines l
  join orders o on o.id = l.order_id
  join customers c on c.email = o.customer_email
  join products p on p.sku = l.sku`;
const missing = await db.query(`select * from order_sheet except ${rejoined}`);
const extra = await db.query(`${rejoined} except select * from order_sheet`);
console.log("rows lost:", missing.rows.length, "rows invented:", extra.rows.length);

for (const table of ["customers", "products", "orders", "order_lines"]) {
  const { rows } = await db.query(`select count(*)::int as n from ${table}`);
  console.log(table, rows[0].n);
}
await db.close();
```

Output of `node decompose.js`

```ts
rows lost: 0 rows invented: 0
customers 2
products 3
orders 3
order_lines 4
```

Four sheet rows became two customers, three products, three orders and four lines, and nothing was lost or invented. Each fact now lives in one place: Ada's phone once, the rice price once.

Now try the same split on the data *after* the update anomaly, when Ada had two phone numbers:

decompose-dirty.jsNode.js only

```ts
import { openSheet } from "./sheet.js";

const db = await openSheet();
await db.query("update order_sheet set customer_phone = '0809 111 2222' where order_id = 2");
await db.exec("create table customers (email text primary key, name text not null, phone text not null)");
try {
  await db.exec("insert into customers select distinct customer_email, customer_name, customer_phone from order_sheet");
} catch (error) {
  console.log(error.message);
  console.log(error.detail);
}
await db.close();
```

Output of `node decompose-dirty.js`

```ts
duplicate key value violates unique constraint "customers_pkey"
Key (email)=(ada@example.com) already exists.
```

The normalised table refuses to store the contradiction. Someone has to decide which phone is right before the data can move. That is normalisation's real gift: once a fact has one home, the database can guard it.

## The shop schema, with constraints

Here is the full model as a module. The comments say which rule each constraint enforces. Read it slowly; every line is a decision from the reasoning above:

shop.js

```ts
import { PGlite } from "@electric-sql/pglite";

export const schema = `
  create table customers (
    id integer generated always as identity primary key,
    email text not null check (email like '%_@_%'),
    full_name text not null check (btrim(full_name) <> ''),
    phone text
  );
  -- one account per email, whatever the capitals
  create unique index customers_email_key on customers (lower(email));

  create table categories (
    id integer generated always as identity primary key,
    parent_id integer references categories (id),
    name text not null,
    check (parent_id <> id),
    unique (parent_id, name)
  );

  create table products (
    id integer generated always as identity primary key,
    sku text not null unique check (sku ~ '^[A-Z0-9-]+$'),
    name text not null,
    price_kobo integer not null check (price_kobo > 0)
  );

  create table product_categories (
    product_id integer not null references products (id) on delete cascade,
    category_id integer not null references categories (id) on delete cascade,
    primary key (product_id, category_id)
  );

  create table inventory (
    product_id integer primary key references products (id) on delete cascade,
    on_hand integer not null check (on_hand >= 0),
    reserved integer not null default 0 check (reserved >= 0),
    check (reserved <= on_hand)
  );

  create table orders (
    id integer generated always as identity primary key,
    customer_id integer not null references customers (id) on delete restrict,
    status text not null default 'pending'
      check (status in ('pending', 'paid', 'shipped', 'cancelled')),
    placed_at timestamptz not null default now()
  );

  create table order_lines (
    order_id integer not null references orders (id) on delete cascade,
    product_id integer not null references products (id) on delete restrict,
    quantity integer not null check (quantity > 0),
    unit_price_kobo integer not null check (unit_price_kobo > 0),
    line_total_kobo integer generated always as (quantity * unit_price_kobo) stored,
    primary key (order_id, product_id)
  );

  create table payments (
    id integer generated always as identity primary key,
    order_id integer not null references orders (id) on delete restrict,
    provider_ref text not null unique,
    amount_kobo integer not null check (amount_kobo > 0),
    status text not null check (status in ('succeeded', 'failed', 'refunded'))
  );
`;

export const seed = `
  insert into customers (email, full_name, phone) values
    ('ada@example.com', 'Ada Okafor', '0803 000 0001'),
    ('tunde@example.com', 'Tunde Bello', '0805 000 0002'),
    ('chioma@example.com', 'Chioma Eze', null);
  insert into categories (parent_id, name) values
    (null, 'Groceries'), (null, 'Electronics'),
    (1, 'Grains'), (1, 'Oils'), (2, 'Accessories'), (2, 'Audio'), (5, 'Chargers');
  insert into products (sku, name, price_kobo) values
    ('RICE-5KG', 'Rice 5kg', 950000), ('OIL-1L', 'Palm oil 1L', 280000),
    ('CHG-20W', 'Charger 20W', 450000), ('BUDS-01', 'Earbuds', 1200000),
    ('CABLE-C', 'USB-C cable', 250000);
  insert into product_categories values (1, 3), (2, 4), (3, 7), (4, 6), (5, 5), (4, 5);
  insert into inventory (product_id, on_hand, reserved) values (1, 40, 0), (2, 25, 0), (3, 10, 0), (4, 5, 0), (5, 30, 0);
  insert into orders (customer_id, status) values (1, 'paid'), (1, 'pending'), (2, 'paid');
  insert into order_lines (order_id, product_id, quantity, unit_price_kobo) values
    (1, 1, 2, 950000), (1, 2, 1, 280000), (2, 3, 1, 450000), (3, 1, 1, 950000), (3, 5, 2, 250000);
  insert into payments (order_id, provider_ref, amount_kobo, status) values
    (1, 'PSK-1001', 2180000, 'failed'), (1, 'PSK-1002', 2180000, 'succeeded'), (3, 'PSK-1003', 1450000, 'succeeded');
`;

export async function openShop() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(seed);
  return db;
}
```

Some decisions worth naming:

- **A unique index on an expression.** `unique (email)` would treat `Ada@example.com` and `ada@example.com` as different. The index on `lower(email)` makes them the same key. (PostgreSQL also has a case-insensitive text type, `citext`, as an extension.)
- **`on delete` is chosen per relationship.** Deleting a product cascades to its category links and its stock row, which mean nothing without it. It is *restricted* for order lines, because sales history must survive. Deleting an order cascades to its lines, which are part of it, but is restricted by payments, which are money.
- **The order line copies the price** (`unit_price_kobo`) and its primary key `(order_id, product_id)` allows one line per product per order: buy two bags of rice by setting quantity 2, not by adding two lines.
- **`line_total_kobo` is a generated column.** PostgreSQL computes it from the same row on every insert and update, so it can never disagree with the quantity and price.
- **Money is an integer number of kobo.** Never `real` or `double precision`; the [pitfalls](#pitfalls) section shows why.

Now throw bad data at it. Each attempt should be refused with a specific SQLSTATE code (the five-character error code every PostgreSQL error carries):

constraints.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
const attempts = [
  ["same email, other capitals", "insert into customers (email, full_name) values ('ADA@example.com', 'Ada O.')"],
  ["order for no customer", "insert into orders (customer_id) values (99)"],
  ["unknown status", "insert into orders (customer_id, status) values (1, 'lost')"],
  ["zero quantity", "insert into order_lines (order_id, product_id, quantity, unit_price_kobo) values (2, 1, 0, 950000)"],
  ["reserve more than stock", "update inventory set reserved = 11 where product_id = 3"],
  ["same payment twice", "insert into payments (order_id, provider_ref, amount_kobo, status) values (1, 'PSK-1002', 2180000, 'succeeded')"],
  ["delete a customer with orders", "delete from customers where id = 1"],
  ["write the line total", "insert into order_lines (order_id, product_id, quantity, unit_price_kobo, line_total_kobo) values (2, 2, 1, 280000, 1)"],
];
for (const [label, sql] of attempts) {
  try {
    await db.exec(sql);
    console.log(`ACCEPTED ${label}`);
  } catch (error) {
    console.log(`refused  ${label}: ${error.code} ${error.message}`);
  }
}
await db.close();
```

Output of `node constraints.js`

```ts
refused  same email, other capitals: 23505 duplicate key value violates unique constraint "customers_email_key"
refused  order for no customer: 23503 insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"
refused  unknown status: 23514 new row for relation "orders" violates check constraint "orders_status_check"
refused  zero quantity: 23514 new row for relation "order_lines" violates check constraint "order_lines_quantity_check"
refused  reserve more than stock: 23514 new row for relation "inventory" violates check constraint "inventory_check"
refused  same payment twice: 23505 duplicate key value violates unique constraint "payments_provider_ref_key"
refused  delete a customer with orders: 23001 update or delete on table "customers" violates RESTRICT setting of foreign key constraint "orders_customer_id_fkey" on table "orders"
refused  write the line total: 428C9 cannot insert a non-DEFAULT value into column "line_total_kobo"
```

Every rule held, whatever program sent the SQL. The codes are stable and documented, so application code can react to them: `23505` (unique violation) becomes a 409 Conflict, `23503` (foreign key) a 400, `23001` (a restricted delete) a 409, and `23514` (check) a 400. The last error has no row constraint behind it: PostgreSQL simply will not let anyone set a generated column.

> TIP
>
> Look at the "reserve more than stock" line: the constraint is called `inventory_check`, because a check on several columns gets a generic name. Name such constraints yourself: `constraint inventory_reserved_within_stock check (reserved <= on_hand)`. The name appears in the error message, and a good name tells the person reading the log what went wrong.

## Querying across the relationships

Normalised data is joined back at read time. Two questions Amaka asks every day: what is each order worth and how much has been paid, and which categories is each product in? The first joins three levels deep; the second walks a many-to-many relationship and folds it back into one row per product with `string_agg`:

reports.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();

const orders = await db.query(`
  select o.id, c.full_name, o.status,
         (select sum(line_total_kobo) from order_lines l where l.order_id = o.id)::int as total_kobo,
         coalesce((select sum(amount_kobo) from payments p
                   where p.order_id = o.id and p.status = 'succeeded'), 0)::int as paid_kobo
  from orders o
  join customers c on c.id = o.customer_id
  order by o.id`);
console.log(orders.rows);

const products = await db.query(`
  select p.sku, string_agg(c.name, ', ' order by c.name) as categories
  from products p
  join product_categories pc on pc.product_id = p.id
  join categories c on c.id = pc.category_id
  group by p.id, p.sku
  order by p.sku`);
console.log(products.rows);
await db.close();
```

Output of `node reports.js`

```json
[
  {
    id: 1,
    full_name: 'Ada Okafor',
    status: 'paid',
    total_kobo: 2180000,
    paid_kobo: 2180000
  },
  {
    id: 2,
    full_name: 'Ada Okafor',
    status: 'pending',
    total_kobo: 450000,
    paid_kobo: 0
  },
  {
    id: 3,
    full_name: 'Tunde Bello',
    status: 'paid',
    total_kobo: 1450000,
    paid_kobo: 1450000
  }
]
[
  { sku: 'BUDS-01', categories: 'Accessories, Audio' },
  { sku: 'CABLE-C', categories: 'Accessories' },
  { sku: 'CHG-20W', categories: 'Chargers' },
  { sku: 'OIL-1L', categories: 'Oils' },
  { sku: 'RICE-5KG', categories: 'Grains' }
]
```

The totals use **correlated subqueries**, one for lines and one for payments, instead of joining both tables at once. Joining an order to its two lines *and* its two payments would produce 2 × 2 = 4 rows, and summing over them would count every line twice. This "fan-out" is the most common way to get wrong totals from a correct schema: aggregate each child table on its own, then combine.

## Walking a category tree with WITH RECURSIVE

Categories point at their parent: Chargers (7) is inside Accessories (5), which is inside Electronics (2). This shape, one table where each row holds its parent's id, is called an **adjacency list**. It is simple to write to, but a plain join only goes one level up or down. How do you list *every* product under Electronics, at any depth?

A **common table expression** (CTE) is a named subquery written with `with name as (…)`; you met one in the BookStore's order query. A **recursive CTE** refers to itself. It has two parts joined by `union all`:

1. the **anchor**: the starting rows (here, the top-level categories);
2. the **recursive part**: a query that joins the table to the rows found so far (here, the children of those categories).

PostgreSQL runs the anchor, then runs the recursive part on the new rows, then again on the rows *that* produced, until a round produces no rows. It is the breadth-first search from [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search), done by the database:

tree.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
const { rows } = await db.query(`
  with recursive tree as (
    select id, name, 0 as depth, name::text as path
    from categories where parent_id is null
    union all
    select c.id, c.name, t.depth + 1, t.path || ' > ' || c.name
    from categories c
    join tree t on c.parent_id = t.id
  )
  select repeat('  ', depth) || name as category, path from tree order by path`);
for (const row of rows) console.log(row.category.padEnd(16), row.path);
await db.close();
```

Output of `node tree.js`

```ts
Electronics      Electronics
  Accessories    Electronics > Accessories
    Chargers     Electronics > Accessories > Chargers
  Audio          Electronics > Audio
Groceries        Groceries
  Grains         Groceries > Grains
  Oils           Groceries > Oils
```

Sorting by the built-up `path` puts every child under its parent, so the indented names draw the tree. `name::text` in the anchor matters: both halves of a `union` must have the same column types, and the path grows longer than any single name.

### Down: everything under a category

Start the anchor at one category instead of the roots, and you get its whole subtree. Join the products to it, and "how many products does Electronics have, including subcategories?" is one query:

subtree.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
const { rows } = await db.query(
  `with recursive subtree as (
     select id from categories where name = $1
     union all
     select c.id from categories c join subtree s on c.parent_id = s.id
   )
   select p.sku, p.name
   from products p
   where exists (
     select 1 from product_categories pc
     where pc.product_id = p.id and pc.category_id in (select id from subtree))
   order by p.sku`,
  ["Electronics"],
);
console.log(rows);
await db.close();
```

Output of `node subtree.js`

```json
[
  { sku: 'BUDS-01', name: 'Earbuds' },
  { sku: 'CABLE-C', name: 'USB-C cable' },
  { sku: 'CHG-20W', name: 'Charger 20W' }
]
```

The earbuds are in two categories inside Electronics (Audio and Accessories), yet they appear once, because `exists` asks a yes/no question per product instead of joining and multiplying rows.

### Up: breadcrumbs

The recursion can run the other way: start at a category and follow `parent_id` upwards. That is the breadcrumb a product page shows:

breadcrumb.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
const { rows } = await db.query(
  `with recursive up as (
     select id, parent_id, name, 0 as level from categories where id = $1
     union all
     select c.id, c.parent_id, c.name, u.level + 1
     from categories c join up u on c.id = u.parent_id
   )
   select string_agg(name, ' / ' order by level desc) as breadcrumb from up`,
  [7],
);
console.log(rows[0].breadcrumb);
await db.close();
```

Output of `node breadcrumb.js`

```ts
Electronics / Accessories / Chargers
```

### When the tree has a loop

The `check (parent_id <> id)` stops a category from being its own parent, but not a longer loop. Suppose someone moves Electronics under Chargers, which is inside Electronics. The recursion would now go round forever. PostgreSQL 14 added a `cycle` clause that tracks the ids already visited on each path and marks a row whose id repeats, and that row is not expanded further:

cycle.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
await db.exec("update categories set parent_id = 7 where id = 2");

const { rows } = await db.query(`
  with recursive down as (
    select id, name from categories where id = 2
    union all
    select c.id, c.name from categories c join down d on c.parent_id = d.id
  ) cycle id set is_cycle using visited
  select name, is_cycle from down`);
console.log(rows);
await db.close();
```

Output of `node cycle.js`

```json
[
  { name: 'Electronics', is_cycle: false },
  { name: 'Accessories', is_cycle: false },
  { name: 'Audio', is_cycle: false },
  { name: 'Chargers', is_cycle: false },
  { name: 'Electronics', is_cycle: true }
]
```

Electronics appears a second time with `is_cycle: true`, and the walk stopped there instead of hanging the database connection. In production, detect loops like this in the code that *moves* a category (walk up from the new parent and refuse if you meet the category itself), and keep the `cycle` clause or a depth limit (`where depth < 20`) in the reading queries as a seatbelt.

> NOTE
>
> Adjacency lists are one of several ways to store trees. A **materialised path** stores `'2/5/7'` in each row (the `ltree` extension indexes it); a **closure table** stores every ancestor-descendant pair. Both make reading subtrees faster and moving nodes harder. Start with the adjacency list and a recursive CTE; it handles thousands of categories easily.

## Denormalising on purpose

Normalised data answers every question, but some answers cost many joins. The order list page shows each order's total, and computing it means summing lines for every order on the page. **Denormalisation** means storing a derived or copied value on purpose, to make reads cheaper. It brings back the risk normalisation removed: the copy can go stale. So you only do it with a plan for keeping the copy correct.

### Three kinds of copy

| Copy | Example | Kept correct by |
| --- | --- | --- |
| A snapshot of a fact at a moment | `order_lines.unit_price_kobo` | Nothing: it must *not* follow later changes. Not really denormalisation at all. |
| A value derived from the same row | `line_total_kobo` | A generated column: the database recomputes it. |
| A value derived from other rows | `orders.total_kobo` | Your code, in the same transaction as every change to the lines, or a trigger; plus a check that finds drift. |

The third kind is where bugs live. Add a cached total and write it together with the lines, then let a "quick fix" script change a line without touching the total:

cached-total.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
await db.exec(`
  alter table orders add column total_kobo integer not null default 0;
  update orders o set total_kobo = (select sum(line_total_kobo) from order_lines l where l.order_id = o.id);
`);

async function addLine(orderId, productId, quantity) {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into order_lines (order_id, product_id, quantity, unit_price_kobo)
       select $1, id, $3, price_kobo from products where id = $2`,
      [orderId, productId, quantity],
    );
    await tx.query(
      "update orders set total_kobo = (select sum(line_total_kobo) from order_lines where order_id = $1) where id = $1",
      [orderId],
    );
  });
}

await addLine(2, 5, 1);
await db.exec("update order_lines set quantity = 3 where order_id = 3 and product_id = 1");

const drift = await db.query(`
  select o.id, o.total_kobo as cached, sum(l.line_total_kobo)::int as actual
  from orders o join order_lines l on l.order_id = o.id
  group by o.id
  having o.total_kobo <> sum(l.line_total_kobo)`);
console.log("orders whose cached total is wrong:", drift.rows);
await db.close();
```

Output of `node cached-total.js`

```ts
orders whose cached total is wrong: [ { id: 3, cached: 1450000, actual: 3350000 } ]
```

`addLine` kept order 2 correct because it writes the line and the total in one transaction, and it copies the price from `products` in SQL instead of trusting a price from the caller. The script that changed order 3 bypassed it, and the drift query caught the result: the cache says ₦14,500, the lines say ₦33,500. A query like this, run on a schedule and alerting when it returns rows, is called a **reconciliation** check. Every cached value from other rows needs one.

### Materialized views: a cache PostgreSQL manages

For reports, a **materialized view** stores the result of a query as a table, which you refresh when you choose. Reads are as fast as a table; the price is that the data is only as fresh as the last refresh:

matview.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
await db.exec(`
  create materialized view product_sales as
    select p.sku, coalesce(sum(l.quantity), 0)::int as units
    from products p left join order_lines l on l.product_id = p.id
    group by p.sku;
`);
const show = async (label) => {
  const { rows } = await db.query("select sku, units from product_sales where sku in ('RICE-5KG', 'BUDS-01') order by sku");
  console.log(label, rows.map((r) => `${r.sku}=${r.units}`).join(" "));
};

await show("before the sale: ");
await db.exec("insert into order_lines (order_id, product_id, quantity, unit_price_kobo) values (2, 4, 1, 1200000)");
await show("after, no refresh:");
await db.exec("refresh materialized view product_sales");
await show("after refresh:    ");
await db.close();
```

Output of `node matview.js`

```ts
before the sale:  BUDS-01=0 RICE-5KG=3
after, no refresh: BUDS-01=0 RICE-5KG=3
after refresh:     BUDS-01=1 RICE-5KG=3
```

Materialized views suit dashboards that may be a few minutes old. On a real server, `refresh materialized view concurrently` (which needs a unique index on the view) lets readers keep reading the old data while the refresh runs.

### When to denormalise

Normalise first. Denormalise only when you have measured a slow read ([Indexes and query plans](https://zudojs.oyinlola.site/learn/db-indexes) shows how), when the read happens far more often than the write, and when you have written down how the copy stays correct and how drift is detected. An index often fixes the slow read without any copy at all.

## Modelling mistakes that cost the most

These designs all "work" on day one. Each one turns into a slow, painful migration later:

- **Money in floating point.** Binary floating point cannot store 0.1 exactly, in PostgreSQL just as in JavaScript. Use integer minor units (kobo) or `numeric`.
- **Lists in a text column** (`'3,7,12'`): no foreign keys, no index, no counting. Use a join table.
- **Status as free text.** Without a `check` (or a lookup table with a foreign key), `'Paid'`, `'paid '` and `'payed'` all appear within a month.
- **"Polymorphic" foreign keys**: `comments (target_type, target_id)` pointing at orders *or* products. No foreign key can check it. Prefer one nullable column per target with a `check` that exactly one is set, or one comment table per target.
- **Entity-attribute-value tables** (`attributes (entity_id, key, value text)`) to avoid "changing the schema". Every value becomes text, nothing is constrained, and every read is a pivot. Add columns with migrations, or use a `jsonb` column for truly free-form extras.
- **Nullable where it should be required.** Every `null` is a question every reader must answer. Make columns `not null` unless "unknown" is a real, meaningful state, like Chioma's missing phone.

The first one is quick to see for yourself:

float-money.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const { rows } = await db.query(`
  select sum(0.1::double precision) as float_sum,
         sum(0.1::numeric) as numeric_sum,
         sum(10) as kobo_sum
  from generate_series(1, 10)`);
console.log(rows[0]);
await db.close();
```

Output of `node float-money.js`

```json
{ float_sum: 0.9999999999999999, numeric_sum: '1.0', kobo_sum: 100 }
```

Ten payments of ₦0.10 add up to slightly less than ₦1 in `double precision`. `numeric` is exact, and comes back to JavaScript as a string so no digit is lost; integer kobo is exact and arrives as a plain number.

## Testing a schema

A schema is code, and its constraints are behaviour worth testing. Two kinds of test catch most modelling bugs: **refusal tests**, which prove that bad data is rejected with the right code, and **invariant queries**, which prove that the good data agrees with itself. Both run against a fresh in-memory PGlite, with no server to set up, so they fit in any test suite ([Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) covers organising them):

schema-test.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
let failures = 0;

async function expectRefused(label, sql, code) {
  try {
    await db.exec(sql);
    console.log(`FAIL ${label}: accepted`);
    failures++;
  } catch (error) {
    const ok = error.code === code;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${error.code}`);
  }
}

async function expectNoRows(label, sql) {
  const { rows } = await db.query(sql);
  if (rows.length > 0) failures++;
  console.log(`${rows.length === 0 ? "PASS" : "FAIL"} ${label}: ${rows.length} bad rows`);
}

await expectRefused("negative stock", "update inventory set on_hand = -1 where product_id = 1", "23514");
await expectRefused("line for missing product", "insert into order_lines values (2, 99, 1, 100)", "23503");
await expectRefused("SKU with spaces", "insert into products (sku, name, price_kobo) values ('rice 5kg', 'Rice', 100)", "23514");
await expectNoRows(
  "succeeded payments never exceed the order total",
  `select o.id from orders o
   where (select coalesce(sum(amount_kobo), 0) from payments p where p.order_id = o.id and p.status = 'succeeded')
       > (select coalesce(sum(line_total_kobo), 0) from order_lines l where l.order_id = o.id)`,
);
await expectNoRows(
  "every paid order has a succeeded payment",
  `select o.id from orders o where o.status = 'paid'
   and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'succeeded')`,
);
console.log(failures === 0 ? "all schema tests passed" : `${failures} failed`);
await db.close();
```

Output of `node schema-test.js`

```ts
PASS negative stock: 23514
PASS line for missing product: 23503
PASS SKU with spaces: 23514
PASS succeeded payments never exceed the order total: 0 bad rows
PASS every paid order has a succeeded payment: 0 bad rows
all schema tests passed
```

The refusal tests pin the codes your error mapping depends on: if someone later drops a constraint in a migration, a test fails instead of production quietly accepting bad data. The invariant queries check rules the constraints cannot express, across tables. Run the same queries against a copy of production data now and then; they are the reconciliation checks from the previous section.

## In production

- **The model outlives the code.** You can rewrite a service in a week; changing a table with a hundred million rows takes careful, staged migrations, which [Operating databases](https://zudojs.oyinlola.site/learn/db-operations) covers. Spend the extra hour on the model.
- **Name things consistently**: plural table names, `snake_case` columns, `<table>_id` for foreign keys, units in money and time columns (`price_kobo`, `timeout_ms`). [Typing database code](https://zudojs.oyinlola.site/learn/db-typescript) maps these to `camelCase` in TypeScript.
- **Use `timestamptz`** for moments in time, never `timestamp` without a zone: see [Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates).
- **Foreign keys need indexes on the referencing side** (`orders.customer_id`, `order_lines.product_id`). PostgreSQL does not create them, and without them joins and `on delete` checks scan whole tables. [Indexes and query plans](https://zudojs.oyinlola.site/learn/db-indexes) covers exactly this.
- **Identity or UUID?** Identity integers are small and fast, but guessable and assigned by one database. UUIDs can be generated anywhere and reveal nothing about volume; use a time-ordered kind (UUIDv7, `uuidv7()` in PostgreSQL 18) so new rows land at the end of the index.

## Practice

TRY IT YOURSELF

### One review per customer per product

Customers can review products they bought: a rating from 1 to 5 and an optional text. A customer may review each product at most once, and deleting a product deletes its reviews. Add the table to the shop and show that a second review of the same product by the same customer is refused.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A composite primary key names *two or more* columns together: `primary key (customer_id, product_id)` means that pair, not either column alone, must be unique.

HINT 2

`customer_id integer not null references customers (id), product_id integer not null references products (id) on delete cascade, rating integer not null check (rating between 1 and 5), body text check (length(body) <= 2000), primary key (customer_id, product_id)`

SOLUTION

reviews.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
await db.exec(`
  create table reviews (
    customer_id integer not null references customers (id),
    product_id integer not null references products (id) on delete cascade,
    rating integer not null check (rating between 1 and 5),
    body text check (length(body) <= 2000),
    primary key (customer_id, product_id)
  );
  insert into reviews values (1, 1, 5, 'Clean rice, no stones');
`);
try {
  await db.exec("insert into reviews values (1, 1, 1, 'Changed my mind')");
} catch (error) {
  console.log(error.code, error.detail);
}
await db.close();
```

Output of `node reviews.js`

```ts
23505 Key (customer_id, product_id)=(1, 1) already exists.
```

A composite primary key `(customer_id, product_id)` is the rule "at most once per pair". To let customers change their mind, the application updates the existing row (`insert … on conflict (customer_id, product_id) do update`) instead of inserting a second one. "Only customers who bought it" spans tables, so it belongs in application code or a trigger.

TRY IT YOURSELF

### Is it normalised?

Name the normal form each table breaks, and fix it: (a) `products (id, name, supplier_id, supplier_phone)`; (b) `order_lines (order_id, product_id, quantity, product_name)` with key `(order_id, product_id)`; (c) `customers (id, name, phone1, phone2, phone3)`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

For each column, ask: does it depend on the *whole* key, on only *part* of a multi-column key, or on something that is not a key at all? And does any group of columns look like the same kind of value repeated under different names?

HINT 2

(a) `supplier_phone` would be the same for every product from that supplier — it depends on `supplier_id`, not on the product. (b) the key is the pair `(order_id, product_id)`; `product_name` only needs `product_id`. (c) `phone1`/`phone2`/`phone3` are the same kind of fact, repeated as separate columns instead of separate rows.

SOLUTION

(a) 3NF: `supplier_phone` depends on `supplier_id`, not on the product. Move it into `suppliers (id, phone)`. (b) 2NF: `product_name` depends on only part of the key, `product_id`. Drop it and join to `products`. (Keeping `unit_price_kobo` would be fine, because the price *at the time of sale* depends on the whole key.) (c) 1NF: a repeating group. Use `customer_phones (customer_id, phone, label)`, which also removes the arbitrary limit of three.

TRY IT YOURSELF

### Category sizes including subcategories

For every category, count the distinct products in it or in any category below it. Hint: build a recursive CTE of `(ancestor_id, descendant_id)` pairs, where every category is its own descendant at the start.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The base case of the recursive CTE is every category paired with *itself* — that is what makes a category count its own direct products, not only its subcategories'. The recursive case adds one more level each time, following `parent_id` down.

HINT 2

`with recursive pairs as (select id as ancestor_id, id as descendant_id from categories union all select p.ancestor_id, c.id from pairs p join categories c on c.parent_id = p.descendant_id) select c.name, count(distinct pc.product_id)::int as products from categories c join pairs p on p.ancestor_id = c.id left join product_categories pc on pc.category_id = p.descendant_id group by c.id, c.name order by products desc, c.name`

SOLUTION

category-counts.jsNode.js only

```ts
import { openShop } from "./shop.js";

const db = await openShop();
const { rows } = await db.query(`
  with recursive pairs as (
    select id as ancestor_id, id as descendant_id from categories
    union all
    select p.ancestor_id, c.id
    from pairs p join categories c on c.parent_id = p.descendant_id
  )
  select c.name, count(distinct pc.product_id)::int as products
  from categories c
  join pairs p on p.ancestor_id = c.id
  left join product_categories pc on pc.category_id = p.descendant_id
  group by c.id, c.name
  order by products desc, c.name`);
console.log(rows.map((r) => `${r.name}: ${r.products}`).join("\n"));
await db.close();
```

Output of `node category-counts.js`

```ts
Accessories: 3
Electronics: 3
Groceries: 2
Audio: 1
Chargers: 1
Grains: 1
Oils: 1
```

`pairs` is a closure table computed on the fly. `count(distinct …)` stops the earbuds, which sit in two Electronics subcategories, from being counted twice; the `left join` keeps empty categories with 0.

## Summary

- Model on paper first: entities become tables, attributes become columns, relationships become foreign keys or join tables. Ask about cardinality in both directions.
- Anomalies (update, insertion, deletion) come from storing facts about different things in one row. 1NF: one value per cell. 2NF: no column depends on part of a composite key. 3NF: no column depends on another non-key column.
- Check a split is lossless by joining back and comparing with `except`. A normalised table refuses contradictions the flat one hid.
- Constraints turn the model's promises into rules the database enforces: `not null`, `check`, `unique` (also on expressions), foreign keys with a deliberate `on delete`, and generated columns.
- `with recursive` walks trees stored as adjacency lists, down (subtrees) and up (breadcrumbs); the `cycle` clause or a depth limit protects against loops.
- Denormalise only after measuring, and only with a plan: snapshots are facts, same-row values are generated columns, cross-row caches need transactions and reconciliation checks. Materialized views are refreshed caches.

Next: [Indexes and query plans](https://zudojs.oyinlola.site/learn/db-indexes), where this schema grows to hundreds of thousands of rows and you make its queries fast.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
