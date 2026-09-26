---
title: "Indexes and query plans — ZudoJS Academy"
description: "Read PostgreSQL query plans, see how a B-tree finds rows, and add composite, partial, expression and covering indexes that make a 100,000-order shop fast again."
source: https://zudojs.oyinlola.site/learn/db-indexes
---

LEVEL 8 · LESSON 2 OF 5

Design and performance Core

# Indexes and query plans

Read PostgreSQL query plans, see how a B-tree finds rows, and add composite, partial, expression and covering indexes that make a 100,000-order shop fast again.

- **55 min** to read and try
- **You need:** Modelling data for a shop, and Joins, grouping and transactions
- **You build:** A measured set of indexes for the shop's busiest queries, a slow-query report from pg_stat_statements, and a test that fails when an index goes missing

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read an EXPLAIN plan from the inside out and name what each node does
- Explain how a B-tree index finds rows and why column order matters in a composite index
- Choose between single-column, composite, partial, expression and covering indexes for a query
- Measure what an index costs on every write, and find unused indexes
- Find the slowest queries with pg_stat_statements and lock the fix in with a plan test

## The page that got slower every week

Amaka's shop from [the modelling lesson](https://zudojs.oyinlola.site/learn/db-modeling) has grown: 10,000 customers and 100,000 orders. Customers complain that "My orders" takes seconds to open, and it gets worse every week. Nothing in the code changed. The data did.

This lesson uses a generated copy of the shop with realistic sizes. Every example imports this module. It builds the data with `generate_series` and also exports a `plan` helper that prints the query plan:

bigshop.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openBigShop(options = {}) {
  const db = new PGlite(options);
  await db.exec(`
    set timezone = 'UTC';
    create table customers (
      id integer generated always as identity primary key,
      email text not null,
      city text not null
    );
    insert into customers (email, city)
    select 'customer' || n || '@example.com',
           (array['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Enugu'])[1 + n % 5]
    from generate_series(1, 10000) as n;

    create table orders (
      id integer generated always as identity primary key,
      customer_id integer not null,
      status text not null,
      total_kobo integer not null,
      placed_at timestamptz not null
    );
    -- 100,000 orders: 90% paid, 9% pending, 1% cancelled, one per minute from 1 January
    insert into orders (customer_id, status, total_kobo, placed_at)
    select 1 + (n * 7919) % 10000,
           case when n % 100 = 0 then 'cancelled' when n % 10 = 0 then 'pending' else 'paid' end,
           100000 + (n * 37) % 5000000,
           timestamptz '2026-01-01 00:00:00+00' + n * interval '1 minute'
    from generate_series(1, 100000) as n;

    create table order_lines (
      order_id integer not null,
      product_id integer not null,
      quantity integer not null
    );
    insert into order_lines select n, 1 + n % 500, 1 + n % 3 from generate_series(1, 100000) as n;
    insert into order_lines select n, 1 + (n * 13) % 500, 1 from generate_series(1, 100000, 2) as n;

    -- foreign keys added after the bulk load: one check for all rows instead of one per row
    alter table orders add foreign key (customer_id) references customers (id);
    alter table order_lines add foreign key (order_id) references orders (id);
    -- sample every row, so the statistics (and the plans below) are the same on every run
    set default_statistics_target = 500;
    analyze;
  `);
  return db;
}

/* Runs the query and prints its real plan, without timings, which change on every run. */
export async function plan(db, sql, params = []) {
  const { rows } = await db.query(
    `explain (analyze, costs off, timing off, summary off, buffers off) ${sql}`,
    params,
  );
  console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
}
```

Three details: the foreign keys are added *after* loading, which is how bulk imports are done (one check for all rows instead of one per row); `analyze` collects statistics about the data, which the planner needs; and `default_statistics_target = 500` makes `analyze` read every row of these tables instead of its usual random sample of 30,000 rows, so the plans you see are the same on every run. More on statistics below. Each example takes a few seconds to build this data.

Here is the "My orders" query, the five latest orders of customer 42, with its plan:

slow.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await plan(db, "select id, total_kobo, placed_at from orders where customer_id = 42 order by placed_at desc limit 5");
await db.close();
```

Output of `node slow.js`

```ts
Limit (actual rows=5.00 loops=1)
  ->  Sort (actual rows=5.00 loops=1)
        Sort Key: placed_at DESC
        Sort Method: quicksort  Memory: 17kB
        ->  Seq Scan on orders (actual rows=10.00 loops=1)
              Filter: (customer_id = 42)
              Rows Removed by Filter: 99990
```

You met `explain analyze` in [Joins, grouping and transactions](https://zudojs.oyinlola.site/learn/sql-advanced#performance). This lesson turns off timings so the output is the same on every run; on your own server, leave them on. Read the plan from the most indented line outwards, because data flows from the inside to the outside:

1. **Seq Scan on orders**: read all 100,000 rows. 10 matched `customer_id = 42`; `Rows Removed by Filter: 99990` is the wasted work.
2. **Sort**: sort those 10 rows by `placed_at`, newest first.
3. **Limit**: keep the first 5.

The work grows with the size of the table, not with the size of the answer. That is why the page slows down every week while the customer's own order count barely changes. The fix is an **index**, and choosing the right one is what this lesson is about.

## How a B-tree index finds a row

PostgreSQL stores a table as a **heap**: 8 KB **pages** of rows in no particular order. Each row has a physical address, its **tuple id** (page number and slot). An index is a separate structure that maps values to tuple ids.

The default index type is the **B-tree** (balanced tree). Its **leaf pages** hold every indexed value in sorted order, each with the tuple id of its row, and each leaf links to the next one. Above them sit **internal pages** that say which child page holds which range of values, up to a single **root page**:

```ts
                       root page
               [ ..., 3334, ..., 6667, ... ]
              /              |               \
   leaf: 1 1 1 ... 42 42 ...  leaf: ...        leaf: ... 9999 10000
         │         │  │
         ▼         ▼  ▼                       (leaves are linked left to right,
   heap pages: rows of the orders table        so a range is read by walking
   (in insert order, not sorted)               along them)
```

A two-level B-tree: finding customer 42 reads the root, one leaf, then only the heap pages that hold customer 42's rows.

A lookup starts at the root and follows one child per level, so it reads as many pages as the tree has levels, and the number of levels grows with the logarithm of the row count: [binary search](https://zudojs.oyinlola.site/learn/dsa-searching), but with hundreds of keys per page instead of two. The `pageinspect` extension lets you look inside a real one:

btree.jsNode.js only

```ts
import { pageinspect } from "@electric-sql/pglite/contrib/pageinspect";
import { openBigShop } from "./bigshop.js";

const db = await openBigShop({ extensions: { pageinspect } });
await db.exec(`
  create extension pageinspect;
  create index orders_customer_idx on orders (customer_id);
`);

const meta = await db.query("select level from bt_metap('orders_customer_idx')");
console.log("levels above the leaves:", meta.rows[0].level);

const sizes = await db.query(`
  select pg_relation_size('orders') / 8192 as table_pages,
         pg_relation_size('orders_customer_idx') / 8192 as index_pages`);
console.log(sizes.rows[0]);
await db.close();
```

Output of `node btree.js`

```ts
levels above the leaves: 1
{ table_pages: 736, index_pages: 117 }
```

One level above the leaves: the root. So finding customer 42 among 100,000 orders reads two index pages, then the heap pages that hold that customer's rows. The whole index is small next to the table, because each entry holds only one integer and a tuple id. A table a thousand times bigger would need only one or two more levels.

Because the leaves are sorted and linked, a B-tree answers more than equality. It serves `=`, `<`, `<=`, `>`, `>=`, `between`, `in (…)`, `is null`, prefix searches such as `like 'abc%'` (with the right collation or operator class), and `order by` on the indexed columns, read forwards or backwards. It does not help `like '%abc'` or conditions on a function of the column, as you will see.

## Reading plans: the nodes you will meet

The **planner** considers many ways to run a query, estimates the cost of each from table **statistics** (row counts, common values, value spread, collected by `analyze`), and picks the cheapest. The plan it prints is a tree of **nodes**:

| Node | What it does | Good when |
| --- | --- | --- |
| Seq Scan | Reads every page of the table | The query needs a large share of the rows, or the table is tiny |
| Index Scan | Walks the index, fetching each row from the heap in index order | Few rows, or the index order saves a sort |
| Bitmap Index Scan + Bitmap Heap Scan | Collects matching tuple ids from the index first, then reads their heap pages in page order | A moderate number of rows spread over many pages |
| Index Only Scan | Answers from the index alone, without visiting the heap | All needed columns are in the index |
| Sort, Limit, Aggregate, HashAggregate | Sort rows; stop after N; compute `count`, `sum` and friends | — |
| Nested Loop, Hash Join, Merge Join | Three ways to join: look up per outer row; build a hash table of one side; walk two sorted inputs together | Nested loop with an index for few outer rows; hash join for large unsorted inputs |

With `analyze`, each node also shows `actual rows` (rows it produced) and `loops` (how many times it ran). Without `analyze`, `explain` only shows the planner's *estimates*. When estimated and actual rows differ by a factor of ten or more, the statistics are stale or misleading, and the plan is probably wrong: run `analyze` on the table first.

> explain analyze really runs the query
>
> Without `analyze`, `explain` only plans. With it, the statement is executed, and that includes `insert`, `update` and `delete`. Wrap it in a transaction and roll back when you look at a write.

explain-writes.jsNode.js only

```ts
import { openBigShop } from "./bigshop.js";

const db = await openBigShop();
const count = async () => (await db.query("select count(*)::int as n from orders where status = 'cancelled'")).rows[0].n;

console.log("cancelled orders:", await count());
await db.exec("explain analyze update orders set status = 'paid' where status = 'cancelled'");
console.log("after explain analyze:", await count());

await db.exec("update orders set status = 'cancelled' where id % 100 = 0");
await db.exec("begin");
await db.exec("explain analyze update orders set status = 'paid' where status = 'cancelled'");
await db.exec("rollback");
console.log("after explain analyze inside begin/rollback:", await count());
await db.close();
```

Output of `node explain-writes.js`

```ts
cancelled orders: 1000
after explain analyze: 0
after explain analyze inside begin/rollback: 1000
```

REASON IT OUT

### Before you add an index

An index is a trade: faster reads for some queries, slower writes for all of them, and more disk. Before creating one, answer these about the slow query:

- How many rows does the query *return*, and how many does it *read* today?
- Which columns appear in `where`, in `join … on` and in `order by`? Which are compared with `=` and which with a range (`<`, `between`)?
- How **selective** is each condition: what fraction of the table matches?
- Is a column wrapped in a function or cast (`lower(email)`, `placed_at::date`)?
- How often is the table written? Is it an append-heavy log or a rarely-changed catalogue?
- Does an existing index almost fit, so it could be replaced instead of adding another?

**Show the reasoning**

For "My orders": it returns 5 rows and reads 100,000, so an index can win by four orders of magnitude. It filters with `customer_id =` (equality, very selective: 10 of 100,000) and sorts by `placed_at desc`. No function wraps the columns. Orders are written often, but far less often than they are read, so one well-chosen index is clearly worth it, and it should serve both the filter and the sort: `(customer_id, placed_at desc)`. The next sections show why each of those answers matters.

## Single-column and composite indexes

Start with the obvious index on `customer_id`, then try a **composite** (multi-column) index that matches both the filter and the sort order:

composite.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
const myOrders = "select id, total_kobo, placed_at from orders where customer_id = 42 order by placed_at desc limit 5";

await db.exec("create index orders_customer_idx on orders (customer_id)");
console.log("--- index on (customer_id)");
await plan(db, myOrders);

await db.exec("create index orders_customer_placed_idx on orders (customer_id, placed_at desc)");
console.log("--- index on (customer_id, placed_at desc)");
await plan(db, myOrders);
await db.close();
```

Output of `node composite.js`

```ts
--- index on (customer_id)
Limit (actual rows=5.00 loops=1)
  ->  Sort (actual rows=5.00 loops=1)
        Sort Key: placed_at DESC
        Sort Method: quicksort  Memory: 17kB
        ->  Bitmap Heap Scan on orders (actual rows=10.00 loops=1)
              Recheck Cond: (customer_id = 42)
              Heap Blocks: exact=10
              ->  Bitmap Index Scan on orders_customer_idx (actual rows=10.00 loops=1)
                    Index Cond: (customer_id = 42)
                    Index Searches: 1
--- index on (customer_id, placed_at desc)
Limit (actual rows=5.00 loops=1)
  ->  Index Scan using orders_customer_placed_idx on orders (actual rows=5.00 loops=1)
        Index Cond: (customer_id = 42)
        Index Searches: 1
```

With the single-column index, PostgreSQL found the 10 rows through the index, but still had to sort them. With the composite index there is no Sort node at all: inside the entries for customer 42, the index is already ordered by `placed_at` descending, so an Index Scan returns rows in the right order and the Limit stops it after 5. For a customer with 5,000 orders, that difference is reading 5 rows instead of 5,000.

The first index is now redundant: any query that can use `(customer_id)` can use `(customer_id, placed_at desc)` too. Drop redundant indexes; each one costs on every write.

### Column order: equality first, then range or sort

A composite index is sorted by its first column, then by the second *within* equal first values, like a phone book sorted by surname, then first name. So it is fast for conditions on a **leftmost prefix** of its columns, and a range or sort column should come after the equality columns:

column-order.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec("create index orders_customer_placed_idx on orders (customer_id, placed_at)");

console.log("--- customer_id only (leftmost prefix)");
await plan(db, "select count(*) from orders where customer_id = 42");
console.log("--- customer_id and a date range");
await plan(db, "select count(*) from orders where customer_id = 42 and placed_at >= '2026-02-01'");
console.log("--- the date range only");
await plan(db, "select count(*) from orders where placed_at >= '2026-02-01' and placed_at < '2026-02-02'");
await db.close();
```

Output of `node column-order.js`

```ts
--- customer_id only (leftmost prefix)
Aggregate (actual rows=1.00 loops=1)
  ->  Bitmap Heap Scan on orders (actual rows=10.00 loops=1)
        Recheck Cond: (customer_id = 42)
        Heap Blocks: exact=10
        ->  Bitmap Index Scan on orders_customer_placed_idx (actual rows=10.00 loops=1)
              Index Cond: (customer_id = 42)
              Index Searches: 1
--- customer_id and a date range
Aggregate (actual rows=1.00 loops=1)
  ->  Bitmap Heap Scan on orders (actual rows=6.00 loops=1)
        Recheck Cond: ((customer_id = 42) AND (placed_at >= '2026-02-01 00:00:00+00'::timestamp with time zone))
        Heap Blocks: exact=6
        ->  Bitmap Index Scan on orders_customer_placed_idx (actual rows=6.00 loops=1)
              Index Cond: ((customer_id = 42) AND (placed_at >= '2026-02-01 00:00:00+00'::timestamp with time zone))
              Index Searches: 1
--- the date range only
Aggregate (actual rows=1.00 loops=1)
  ->  Seq Scan on orders (actual rows=1440.00 loops=1)
        Filter: ((placed_at >= '2026-02-01 00:00:00+00'::timestamp with time zone) AND (placed_at < '2026-02-02 00:00:00+00'::timestamp with time zone))
        Rows Removed by Filter: 98560
```

The first two queries use the index. The third cannot: orders from 1 February are scattered through the whole index, a few inside every customer's section, so the planner reads the table instead. For the date range alone you need an index that *starts* with `placed_at`.

> NOTE
>
> PostgreSQL 18 added **skip scan**: when the leading column has only a few distinct values, a B-tree can be searched once per value, and the plan shows `Index Searches: N`. An index on `(status, placed_at)` can then serve a `placed_at` range with three searches, one per status. With 10,000 distinct customers, skipping is too expensive, which is what you saw above. Don't design around skip scan; treat it as a bonus.

## Selectivity: when the planner ignores your index

An index on `status` sounds useful for "show all paid orders". Look at what the planner does with it:

selectivity.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec("create index orders_status_idx on orders (status)");

const stats = await db.query(`
  select unnest(most_common_vals::text::text[]) as value,
         round(unnest(most_common_freqs) * 100)::int as percent
  from pg_stats where tablename = 'orders' and attname = 'status'
  order by percent desc`);
console.log(stats.rows);

console.log("--- status = 'paid'");
await plan(db, "select id from orders where status = 'paid'");
console.log("--- status = 'cancelled'");
await plan(db, "select id from orders where status = 'cancelled'");
await db.close();
```

Output of `node selectivity.js`

```json
[
  { value: 'paid', percent: 90 },
  { value: 'pending', percent: 9 },
  { value: 'cancelled', percent: 1 }
]
--- status = 'paid'
Seq Scan on orders (actual rows=90000.00 loops=1)
  Filter: (status = 'paid'::text)
  Rows Removed by Filter: 10000
--- status = 'cancelled'
Bitmap Heap Scan on orders (actual rows=1000.00 loops=1)
  Recheck Cond: (status = 'cancelled'::text)
  Heap Blocks: exact=736
  ->  Bitmap Index Scan on orders_status_idx (actual rows=1000.00 loops=1)
        Index Cond: (status = 'cancelled'::text)
        Index Searches: 1
```

`pg_stats` shows what `analyze` learned: 90% of orders are paid. Fetching 90% of the rows through an index would mean jumping between index and heap for almost every row, which is slower than reading the table straight through, so the planner ignores the index for `'paid'`. For `'cancelled'`, 1% of the rows, it uses the index. The same index, two different plans: the choice depends on the value, and on up-to-date statistics.

Look closer at the second plan: `Heap Blocks: exact=736` is every page of the table. Cancelled orders are every hundredth order, so each page holds one or two of them, and 1% of the rows still live on 100% of the pages. The index saved checking 99,000 rows, but not reading 736 pages. How rows are spread over pages matters as much as how many match: the statistics call it **correlation**. A day's orders, which were inserted together and sit on neighbouring pages, benefit far more from an index than rows scattered through the table.

The **selectivity** of a condition is the fraction of rows it keeps. Indexes help selective conditions. A column with a few values that are evenly spread, such as a boolean, is rarely worth indexing alone; the rare values are, and the next section shows a cheaper way to index just those.

## Partial and expression indexes

### Partial indexes: index only the rows you ask about

The warehouse screen lists *pending* orders, oldest first. Pending orders are 9% of the table. A **partial index** has a `where` clause and only contains the rows that match it:

partial.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec(`
  create index orders_placed_idx on orders (placed_at);
  create index orders_pending_placed_idx on orders (placed_at) where status = 'pending';
`);

await plan(db, "select id, placed_at from orders where status = 'pending' order by placed_at limit 3");

const { rows } = await db.query(`
  select indexrelname as index, pg_relation_size(indexrelid) / 8192 as pages
  from pg_stat_user_indexes where indexrelname like 'orders_%placed_idx' order by 1`);
console.log(rows);
await db.close();
```

Output of `node partial.js`

```ts
Limit (actual rows=3.00 loops=1)
  ->  Index Scan using orders_pending_placed_idx on orders (actual rows=3.00 loops=1)
        Index Searches: 1
[
  { index: 'orders_pending_placed_idx', pages: 27 },
  { index: 'orders_placed_idx', pages: 276 }
]
```

The planner used the partial index, because the query's `where status = 'pending'` matches the index's condition. The index is a tenth of the size of a full one, so it is cheaper to keep in memory, and writes to paid orders never touch it. A query must include the index's condition (or one that implies it) for the planner to use a partial index.

Partial indexes can also be `unique`, which expresses rules a plain unique constraint cannot. "A customer has at most one open cart", while keeping any number of old, checked-out carts:

partial-unique.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table carts (
    id integer generated always as identity primary key,
    customer_id integer not null,
    status text not null check (status in ('open', 'checked_out'))
  );
  create unique index carts_one_open_per_customer on carts (customer_id) where status = 'open';
`);

const attempts = [[7, "checked_out"], [7, "checked_out"], [7, "open"], [7, "open"], [8, "open"]];
for (const [customer, status] of attempts) {
  try {
    await db.query("insert into carts (customer_id, status) values ($1, $2)", [customer, status]);
    console.log(`customer ${customer}: ${status} cart saved`);
  } catch (error) {
    console.log(`customer ${customer}: ${status} cart refused (${error.code})`);
  }
}
await db.close();
```

Output of `node partial-unique.js`

```ts
customer 7: checked_out cart saved
customer 7: checked_out cart saved
customer 7: open cart saved
customer 7: open cart refused (23505)
customer 8: open cart saved
```

The same pattern handles soft deletes: `create unique index … on products (sku) where deleted_at is null` keeps SKUs unique among live products, while deleted ones may repeat.

### Expression indexes, and keeping queries "sargable"

An index on a column only helps conditions on the bare column. Wrap the column in a function or a cast, and the index no longer matches:

expression.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec(`
  create index customers_email_lower_idx on customers (lower(email));
  create index orders_placed_idx on orders (placed_at);
`);

console.log("--- lower(email) = …");
await plan(db, "select id from customers where lower(email) = 'customer42@example.com'");
console.log("--- email = … (the index is on lower(email), not email)");
await plan(db, "select id from customers where email = 'customer42@example.com'");
console.log("--- placed_at::date = … (a cast on the column)");
await plan(db, "select count(*) from orders where placed_at::date = '2026-02-01'");
console.log("--- the same day as a range on the bare column");
await plan(db, "select count(*) from orders where placed_at >= '2026-02-01' and placed_at < '2026-02-02'");
await db.close();
```

Output of `node expression.js`

```ts
--- lower(email) = …
Bitmap Heap Scan on customers (actual rows=1.00 loops=1)
  Recheck Cond: (lower(email) = 'customer42@example.com'::text)
  Heap Blocks: exact=1
  ->  Bitmap Index Scan on customers_email_lower_idx (actual rows=1.00 loops=1)
        Index Cond: (lower(email) = 'customer42@example.com'::text)
        Index Searches: 1
--- email = … (the index is on lower(email), not email)
Seq Scan on customers (actual rows=1.00 loops=1)
  Filter: (email = 'customer42@example.com'::text)
  Rows Removed by Filter: 9999
--- placed_at::date = … (a cast on the column)
Aggregate (actual rows=1.00 loops=1)
  ->  Seq Scan on orders (actual rows=1440.00 loops=1)
        Filter: ((placed_at)::date = '2026-02-01'::date)
        Rows Removed by Filter: 98560
--- the same day as a range on the bare column
Aggregate (actual rows=1.00 loops=1)
  ->  Index Only Scan using orders_placed_idx on orders (actual rows=1440.00 loops=1)
        Index Cond: ((placed_at >= '2026-02-01 00:00:00+00'::timestamp with time zone) AND (placed_at < '2026-02-02 00:00:00+00'::timestamp with time zone))
        Heap Fetches: 1440
        Index Searches: 1
```

An **expression index** stores the result of an expression, here `lower(email)`, and serves queries that use exactly that expression. The shop's case-insensitive unique email index from the modelling lesson is one. But a query on plain `email` cannot use it.

The date example is the more common trap. `placed_at::date = '2026-02-01'` must compute the cast for every row before comparing, so the index on `placed_at` is useless. Rewriting it as a half-open range, `>= '2026-02-01' and < '2026-02-02'`, compares the bare column and uses the index. A condition that can use an index this way is called **sargable** (from "search argument able"). Rules of thumb: keep the column bare on one side (`total_kobo > 4000000`, not `total_kobo / 100 > 40000`), compare with the column's own type, and prefer ranges to casts.

## Covering indexes and index-only scans

Even with a good index, every matching row costs a trip to the heap to read the columns the query needs. If the index itself holds all those columns, PostgreSQL can answer from the index alone: an **index-only scan**. `include (…)` adds columns to the leaf entries without making them part of the sort key, which gives you a **covering index**.

There is one condition. An index does not know whether the row it points to is visible to your transaction (a row may have been deleted or updated by a transaction that has not committed, as [the next lesson](https://zudojs.oyinlola.site/learn/db-transactions) explains). PostgreSQL keeps a **visibility map** of heap pages whose rows are all visible to everyone; for those pages it can skip the heap. `vacuum` updates that map, and **autovacuum** runs it in the background on a real server:

index-only.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec("create index orders_customer_total_idx on orders (customer_id) include (total_kobo)");
const spend = "select customer_id, sum(total_kobo) from orders where customer_id between 1 and 50 group by customer_id";

console.log("--- before vacuum");
await plan(db, spend);
await db.exec("vacuum orders");
console.log("--- after vacuum");
await plan(db, spend);
await db.close();
```

Output of `node index-only.js`

```ts
--- before vacuum
HashAggregate (actual rows=50.00 loops=1)
  Group Key: customer_id
  Batches: 1  Memory Usage: 45kB
  ->  Bitmap Heap Scan on orders (actual rows=500.00 loops=1)
        Recheck Cond: ((customer_id >= 1) AND (customer_id <= 50))
        Heap Blocks: exact=500
        ->  Bitmap Index Scan on orders_customer_total_idx (actual rows=500.00 loops=1)
              Index Cond: ((customer_id >= 1) AND (customer_id <= 50))
              Index Searches: 1
--- after vacuum
GroupAggregate (actual rows=50.00 loops=1)
  Group Key: customer_id
  ->  Index Only Scan using orders_customer_total_idx on orders (actual rows=500.00 loops=1)
        Index Cond: ((customer_id >= 1) AND (customer_id <= 50))
        Heap Fetches: 0
        Index Searches: 1
```

Before `vacuum`, the visibility map was empty, an index-only scan would have had to check the heap for every row anyway, and the planner chose a bitmap scan. After `vacuum`, it switched to an Index Only Scan with `Heap Fetches: 0`: the 500 rows were answered from the index alone. On a busy table, the number of heap fetches tells you how well vacuum is keeping up.

> TIP
>
> Covering indexes are a finishing touch for a few very hot queries. Adding every selected column to `include` makes the index nearly as big as the table, and every update of those columns updates the index too.

## Indexes for joins and foreign keys

PostgreSQL indexes primary keys and unique columns, but not the *referencing* side of a foreign key. `order_lines.order_id` has no index yet, so fetching the lines of a customer's orders reads all 150,000 lines:

join.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec("create index orders_customer_placed_idx on orders (customer_id, placed_at desc)");
const lines = `
  select o.id, l.product_id, l.quantity
  from orders o join order_lines l on l.order_id = o.id
  where o.customer_id = 42`;

console.log("--- no index on order_lines.order_id");
await plan(db, lines);
await db.exec("create index order_lines_order_idx on order_lines (order_id)");
console.log("--- with it");
await plan(db, lines);
await db.close();
```

Output of `node join.js`

```ts
--- no index on order_lines.order_id
Hash Join (actual rows=20.00 loops=1)
  Hash Cond: (l.order_id = o.id)
  ->  Seq Scan on order_lines l (actual rows=150000.00 loops=1)
  ->  Hash (actual rows=10.00 loops=1)
        Buckets: 1024  Batches: 1  Memory Usage: 5kB
        ->  Bitmap Heap Scan on orders o (actual rows=10.00 loops=1)
              Recheck Cond: (customer_id = 42)
              Heap Blocks: exact=10
              ->  Bitmap Index Scan on orders_customer_placed_idx (actual rows=10.00 loops=1)
                    Index Cond: (customer_id = 42)
                    Index Searches: 1
--- with it
Nested Loop (actual rows=20.00 loops=1)
  ->  Bitmap Heap Scan on orders o (actual rows=10.00 loops=1)
        Recheck Cond: (customer_id = 42)
        Heap Blocks: exact=10
        ->  Bitmap Index Scan on orders_customer_placed_idx (actual rows=10.00 loops=1)
              Index Cond: (customer_id = 42)
              Index Searches: 1
  ->  Index Scan using order_lines_order_idx on order_lines l (actual rows=2.00 loops=10)
        Index Cond: (order_id = o.id)
        Index Searches: 10
```

Without the index, the only way to find the lines was a Hash Join: build a hash table of the customer's 10 orders, then stream all 150,000 lines past it. With the index, the planner picks a **Nested Loop**: for each of the 10 orders (`loops=10`), look up its lines in the index. The same missing index slows down deleting an order, because PostgreSQL must check that no line still references it. Index every foreign key column you join on or delete through; it is the most commonly missing index in real schemas.

## What indexes cost on every write

Every index is another structure to update on each `insert`, on each `delete`, and on each `update` of an indexed column. PostgreSQL also writes every change to its **write-ahead log** (WAL) before changing the data files, for crash safety and replication, so the extra index work shows up there too. Insert the same 20,000 orders into a table without secondary indexes and one with four:

write-cost.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const columns = "(id integer generated always as identity primary key, customer_id integer, status text, total_kobo integer, placed_at timestamptz)";
await db.exec(`
  create table orders_lean ${columns};
  create table orders_indexed ${columns};
  create index on orders_indexed (customer_id);
  create index on orders_indexed (status);
  create index on orders_indexed (total_kobo);
  create index on orders_indexed (placed_at);
`);

for (const table of ["orders_lean", "orders_indexed"]) {
  const { rows } = await db.query(`
    explain (analyze, wal, costs off, timing off, summary off, buffers off)
    insert into ${table} (customer_id, status, total_kobo, placed_at)
    select n % 1000, 'paid', n * 37 % 100000, timestamptz '2026-01-01 00:00:00+00' + n * interval '1 minute'
    from generate_series(1, 20000) as n`);
  const wal = rows.map((r) => r["QUERY PLAN"]).find((line) => line.includes("WAL:"));
  console.log(table.padEnd(15), wal.trim());
}

const sizes = await db.query(`
  select pg_relation_size('orders_indexed') / 1024 as table_kb, pg_indexes_size('orders_indexed') / 1024 as indexes_kb`);
console.log(sizes.rows[0]);
await db.close();
```

Output of `node write-cost.js`

```ts
orders_lean     WAL: records=40662 bytes=3121273
orders_indexed  WAL: records=121293 bytes=8644893 buffers full=550
{ table_kb: 1184, indexes_kb: 1832 }
```

Same rows, about three times the log records and bytes, and indexes that together are larger than the table. The time grows in the same proportion; run the insert with `\timing` in psql to see it on your machine. Updates add a subtler cost: PostgreSQL can often update a row in place on its page (a **HOT**, heap-only tuple, update) without touching any index, but only if no indexed column changed. Indexing a column that changes on every request, such as `last_seen_at`, takes that shortcut away.

### Finding indexes nobody uses

PostgreSQL counts how often each index is used in `pg_stat_user_indexes`. After a representative period of traffic, an index with `idx_scan = 0` is costing writes and disk for nothing:

unused.jsNode.js only

```ts
import { openBigShop } from "./bigshop.js";

const db = await openBigShop();
await db.exec(`
  create index orders_customer_placed_idx on orders (customer_id, placed_at desc);
  create index orders_customer_idx on orders (customer_id);
  create index orders_total_idx on orders (total_kobo);
`);

for (let customer = 1; customer <= 20; customer++) {
  await db.query("select id from orders where customer_id = $1 order by placed_at desc limit 5", [customer]);
}

await db.query("select pg_stat_force_next_flush()");
const { rows } = await db.query(`
  select indexrelname as index, idx_scan as scans
  from pg_stat_user_indexes where relname = 'orders' order by indexrelname`);
console.log(rows);
await db.close();
```

Output of `node unused.js`

```json
[
  { index: 'orders_customer_idx', scans: 0 },
  { index: 'orders_customer_placed_idx', scans: 20 },
  { index: 'orders_pkey', scans: 0 },
  { index: 'orders_total_idx', scans: 0 }
]
```

Twenty "My orders" requests all used the composite index. The single-column index is redundant with it, and nothing filters by total. Both are candidates to drop. `orders_pkey` also shows 0, but it is the primary key: it enforces uniqueness and serves lookups by id, which this workload simply did not make. (`pg_stat_force_next_flush()` makes the statistics appear immediately; a real server updates them every second or so.) Before dropping an index, check every server that runs queries, including read replicas, whose counters are separate, and remember that unique indexes enforce rules even when no query reads them.

## Finding the slow queries

So far you knew which query was slow. In production you have hundreds of distinct queries, and the one users complain about is not always the one that costs the most. The `pg_stat_statements` extension records every statement, normalised (literal values replaced by `$1`, `$2`), with how often it ran, how many rows it returned, how long it took in total, and how many pages it touched:

slow-queries.jsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { pg_stat_statements } from "@electric-sql/pglite/contrib/pg_stat_statements";

const db = new PGlite({ extensions: { pg_stat_statements } });
await db.exec(`
  create extension pg_stat_statements;
  create table orders (id integer primary key, customer_id integer not null, status text not null, total_kobo integer not null);
  insert into orders select n, 1 + n % 5000, case when n % 10 = 0 then 'pending' else 'paid' end, n % 900000
  from generate_series(1, 100000) as n;
  create index on orders (customer_id);
  analyze orders;
  select pg_stat_statements_reset();
`);

for (let i = 1; i <= 30; i++) {
  await db.query("select id, total_kobo from orders where customer_id = $1", [i]);
  await db.query("select id from orders where id = $1", [i]);
}
for (let i = 1; i <= 10; i++) {
  await db.query("select count(*) from orders where status = 'pending' and total_kobo > $1", [i * 1000]);
}

const { rows } = await db.query(`
  select query, calls, rows, shared_blks_hit + shared_blks_read as pages
  from pg_stat_statements
  where query like 'select%from orders%'
  order by pages desc`);
console.log(rows);
await db.close();
```

Output of `node slow-queries.js`

```json
[
  {
    query: 'select count(*) from orders where status = $2 and total_kobo > $1',
    calls: 10,
    rows: 10,
    pages: 6370
  },
  {
    query: 'select id, total_kobo from orders where customer_id = $1',
    calls: 30,
    rows: 600,
    pages: 660
  },
  {
    query: 'select id from orders where id = $1',
    calls: 30,
    rows: 30,
    pages: 90
  }
]
```

The pending-orders count is on top although it ran only 10 times, a third as often as the others: each of its calls read the whole table (637 pages), while the indexed lookups read a handful of pages each. This example sorts by `pages` (shared buffer pages touched) because timings change on every run. On your server, sort by `total_exec_time`, the total time spent in a statement across all its calls, and look at `mean_exec_time` too; here they put the same statement on top.

The workflow for a slow database is always the same:

1. **Find**: the top of `pg_stat_statements` by total time (what costs the most overall) and by mean time (what makes single requests slow). Setting `log_min_duration_statement = '500ms'` in the server's configuration also logs every statement slower than that; the `auto_explain` extension logs their plans.
2. **Explain**: run the query with `explain (analyze, buffers)`, with realistic parameter values, against production-sized data.
3. **Fix**: add or change an index, make the condition sargable, rewrite the query, or fetch less.
4. **Verify**: explain again, and watch the statement's numbers after deploying.

Many slow pages are not one slow query but many fast ones: a list page that runs one query per row to fetch each order's lines, the **N+1 query** problem. `pg_stat_statements` shows it as a cheap statement with an enormous `calls` count. The fix is one query with a join or `where order_id = any($1)`, not an index.

## Testing that the index is used

An index fix is fragile: a later migration drops or renames the index, or a query is "cleaned up" into a non-sargable form, and nothing fails until production slows down. A **plan test** asserts the shape of the plan. `explain (format json)` returns the plan as a tree that code can walk:

plan-test.jsNode.js only

```ts
import { openBigShop } from "./bigshop.js";

function nodes(plan) {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

async function assertNoSeqScan(db, label, sql, params = []) {
  const { rows } = await db.query(`explain (format json) ${sql}`, params);
  const all = nodes(rows[0]["QUERY PLAN"][0].Plan);
  const seq = all.filter((n) => n["Node Type"] === "Seq Scan").map((n) => n["Relation Name"]);
  console.log(`${seq.length === 0 ? "PASS" : "FAIL"} ${label}: ${all.map((n) => n["Node Type"]).join(" > ")}`);
}

const db = await openBigShop();
await db.exec("create index orders_customer_placed_idx on orders (customer_id, placed_at desc)");
const myOrders = "select id from orders where customer_id = $1 order by placed_at desc limit 5";

await assertNoSeqScan(db, "my orders", myOrders, [42]);
await db.exec("drop index orders_customer_placed_idx");
await assertNoSeqScan(db, "my orders after a migration dropped the index", myOrders, [42]);
await db.close();
```

Output of `node plan-test.js`

```ts
PASS my orders: Limit > Index Scan
FAIL my orders after a migration dropped the index: Limit > Sort > Seq Scan
```

Run plan tests against data of realistic size and shape; on a table of ten rows every plan is a Seq Scan, because that *is* the fastest way to read ten rows. Check structure ("no Seq Scan on orders", "uses this index"), never costs or timings, which change with every version and machine.

## In production

- **Create indexes without blocking writes.** A plain `create index` blocks inserts, updates and deletes on the table until it finishes, which can be minutes on a large table. `create index concurrently` builds it without that lock, more slowly. It cannot run inside a transaction block, so migration tools need a flag to run it on its own; if it fails halfway it leaves an `INVALID` index you must drop and retry. [Operating databases](https://zudojs.oyinlola.site/learn/db-operations) covers this in migrations.
- **Keep statistics fresh.** Autovacuum also runs `analyze`, but after a bulk load or a large delete, run `analyze` yourself so the planner does not plan for yesterday's table.
- **Test with production-sized data.** Plans depend on table sizes and value distributions. A query that is fine on a 1,000-row staging table can be a disaster on 50 million rows.
- **Other index types exist** for other questions: GIN for `jsonb`, arrays and full-text search, GiST for ranges and geometry, BRIN for huge append-only tables ordered by time, and `pg_trgm` for `like '%abc%'`. B-tree is the right answer for almost everything else.
- **Budget your indexes.** Five to ten indexes on a busy table is normal; thirty means nobody is removing the unused ones.

## Practice

TRY IT YOURSELF

### The warehouse queue for one customer

Support opens a customer's *pending* orders, oldest first: `select id, placed_at from orders where customer_id = $1 and status = 'pending' order by placed_at`. Design one index for it, create it, and show that the plan has no Sort and no Seq Scan.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Put the equality column first, so the index narrows to one customer immediately; put the sort column right after it, so the matching rows come out already in `placed_at` order. The rare status becomes a `where` clause on the index itself, not a third indexed column.

HINT 2

`create index orders_customer_pending_idx on orders (customer_id, placed_at) where status = 'pending';`

SOLUTION

exercise-pending.jsNode.js only

```ts
import { openBigShop, plan } from "./bigshop.js";

const db = await openBigShop();
await db.exec("create index orders_customer_pending_idx on orders (customer_id, placed_at) where status = 'pending'");
await plan(db, "select id, placed_at from orders where customer_id = 11 and status = 'pending' order by placed_at");
await db.close();
```

Output of `node exercise-pending.js`

```ts
Index Scan using orders_customer_pending_idx on orders (actual rows=10.00 loops=1)
  Index Cond: (customer_id = 11)
  Index Searches: 1
```

Equality on `customer_id` first, then the sort column `placed_at`, and the rare status as a partial-index condition, so the index holds only the 9% of orders that are pending. `(customer_id, status, placed_at)` would also work, but it indexes all 100,000 orders to serve a query about 9,000 of them.

TRY IT YOURSELF

### Make it sargable

These conditions cannot use a B-tree index on the column. Rewrite each so it can: (a) `where total_kobo / 100 > 40000`; (b) `where extract(year from placed_at) = 2026`; (c) `where coalesce(status, 'pending') = 'pending'` on a nullable `status`; (d) `where customer_id::text = $1`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A B-tree index can only help when the *indexed column itself* appears bare on one side of the comparison. Whenever the column is wrapped in a function or an operator, move that computation to the other side, onto the constant, instead.

HINT 2

(a) divide the constant, not the column. (b) turn "which year" into a range with `>=` and `<` on the bare timestamp. (c) split the `coalesce` into an `or` of two sargable conditions, one of them `is null`. (d) cast the parameter to match the column's type, never the column to match the parameter's.

SOLUTION

(a) `where total_kobo > 4000000`: move the arithmetic to the constant side. (b) `where placed_at >= '2026-01-01' and placed_at < '2027-01-01'`: a half-open range on the bare column. (c) `where status = 'pending' or status is null`: both parts can use an index (a B-tree indexes nulls too), and PostgreSQL can combine them with a BitmapOr. (d) `where customer_id = $1::integer`, or better, send a number from the application: cast the parameter, never the column. When a rewrite is impossible, an expression index on exactly the expression used is the fallback.

TRY IT YOURSELF

### Which index would you drop?

A table has these indexes and a week of counters: `orders_pkey` (idx_scan 9,120,044), `orders_customer_idx (customer_id)` (0), `orders_customer_placed_idx (customer_id, placed_at desc)` (2,300,511), `orders_ref_key unique (provider_ref)` (0), `orders_status_idx (status)` (12). Which would you drop, and what would you check first?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A scan count of 0 does not automatically mean "unused": check first whether another index already starts with the same leading column and would serve the same queries just as well.

HINT 2

`orders_customer_idx` is redundant: `orders_customer_placed_idx` already starts with `customer_id`, so anything the narrower index could do, the wider one can too. A unique index earns its keep by enforcing the constraint alone, even at 0 scans — check `pg_stat_statements` and every replica's counters before dropping anything, and drop `concurrently`.

SOLUTION

Drop `orders_customer_idx`: it is unused and fully covered by the composite index, which starts with the same column. `orders_status_idx` is a candidate too: 12 scans a week do not pay for maintaining an index on every order write, but first find those 12 queries in `pg_stat_statements`, because they may be an important monthly report that a partial index would serve better. Keep `orders_ref_key` although no query reads it: it enforces uniqueness on every insert. Before dropping anything, check the counters on every replica, and drop with `drop index concurrently` so writers are not blocked.

## Summary

- Read plans from the inside out. A Seq Scan with a huge `Rows Removed by Filter` on a big table is the classic missing index; a Sort under a Limit asks for an index in sort order.
- A B-tree keeps values sorted in linked leaf pages under a shallow tree, so lookups, ranges and ordered reads cost a few pages. Composite indexes serve leftmost prefixes: put equality columns first, then the range or sort column.
- The planner uses statistics to estimate selectivity. It ignores an index when a condition matches a large share of rows, and that is usually right.
- Partial indexes cover only the rows you ask about (and can enforce "unique among some rows"). Expression indexes serve exact expressions. Keep conditions sargable: bare column, same type, ranges instead of casts.
- Covering indexes with `include` allow index-only scans, which depend on vacuum keeping the visibility map current. Index foreign key columns you join or delete through.
- Every index costs on every write. Measure, find unused ones in `pg_stat_user_indexes`, find expensive queries in `pg_stat_statements`, and lock fixes in with plan tests.

Next: [Transactions, isolation and locks](https://zudojs.oyinlola.site/learn/db-transactions), where two customers try to buy the last bag of rice at the same moment, and a ₦50,000 transfer must never be counted twice.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
