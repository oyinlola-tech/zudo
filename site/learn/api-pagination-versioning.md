---
title: "Pagination and versioning in depth — ZudoJS Academy"
description: "Page through 100,000 orders without skipping or repeating one, design opaque cursors, and change responses without breaking existing clients."
source: https://zudojs.oyinlola.site/learn/api-pagination-versioning
---

LEVEL 9 · LESSON 1 OF 4

Designing APIs Core

# Pagination and versioning in depth

Page through 100,000 orders without skipping or repeating one, design opaque cursors, and change responses without breaking existing clients.

- **50 min** to read and try
- **You need:** Designing a REST API, and the SQL lessons
- **You build:** A cursor-paginated orders endpoint on PostgreSQL that stays correct under concurrent writes, plus a dated versioning layer with deprecation headers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Measure why large offsets are slow and replace them with keyset queries on an index
- Build cursors on a unique, stable sort key so no row is skipped or repeated
- Design opaque, validated cursors that are bound to their filters
- Tell a breaking change from an additive one and write clients that tolerate additions
- Serve several API versions from one codebase with version transformers
- Deprecate and retire a version with Deprecation and Sunset headers

## Three bug reports from one endpoint

Your shop has an endpoint, `GET /v1/orders`, that lists orders newest first, 20 at a time. It uses offset pagination, exactly as you built it in [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#pagination). The shop grows, and three bug reports arrive in the same week:

1. **Support:** "A customer scrolled through her order history and saw order 88,412 twice, and order 88,390 never."
2. **Finance:** "The nightly export that copies every order to the accounting system is getting slower every week. Last night the final pages took several seconds each."
3. **Mobile team:** "We renamed `total` to `total_kobo` in the response. Everyone who has not updated the app since Tuesday now sees ₦0 on every order."

The first two are pagination problems. The third is a versioning problem: the API changed a promise that a client depended on. None of them shows up in a test with ten rows and one client. This lesson goes past the basics from Designing a REST API and fixes all three: it measures what offsets cost on a real PostgreSQL table, builds cursor pagination that stays correct while orders keep arriving, and then shows how to change a response without breaking anyone who already uses it.

Every database example uses PGlite, the in-process PostgreSQL you met in [the BookStore lessons](https://zudojs.oyinlola.site/learn/bookstore-data). The examples that need a database or `node:http` run only in Node.js; the rest also run in your browser.

## What an offset really costs

Here is the shop's database. It creates an `orders` table with an index on the sort order the endpoint uses (newest first, then highest id), and fills it with as many orders as you ask for. Three orders arrive every minute, so many orders share a timestamp; that detail matters later. The file is shared by the examples in this section:

db.js

```ts
import { PGlite } from "@electric-sql/pglite";

export async function openShop(orderCount) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE orders (
      id integer PRIMARY KEY,
      customer text NOT NULL,
      status text NOT NULL,
      total_kobo integer NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE INDEX orders_newest ON orders (created_at DESC, id DESC);
  `);
  await db.query(
    `INSERT INTO orders
     SELECT g, 'customer-' || (g % 40),
            (ARRAY['paid', 'shipped', 'delivered'])[g % 3 + 1],
            (g * 7919) % 5000000,
            timestamptz '2026-01-01 00:00Z' + (g / 3) * interval '1 minute'
     FROM generate_series(1, $1::integer) AS g`,
    [orderCount],
  );
  await db.exec("ANALYZE orders");
  return db;
}

export async function rowsRead(db, sql, params = []) {
  const plan = await db.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF, BUFFERS OFF) ${sql}`, params);
  const scan = plan.rows.map((row) => row["QUERY PLAN"]).find((line) => line.includes("Scan"));
  return Number(scan.match(/actual rows=([\d.]+)/)[1]);
}
```

`rowsRead` runs a query under `EXPLAIN ANALYZE`, which executes it and reports what the database actually did, and returns how many rows the scan touched. Timings change from run to run; row counts do not, so they make a fair comparison. Now fetch one page of 20 at four different offsets:

offset-cost.jsNode.js only

```ts
import { openShop, rowsRead } from "./db.js";

const db = await openShop(100_000);
const PAGE = "SELECT id FROM orders ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET $1";

for (const offset of [0, 1_000, 50_000, 99_980]) {
  const read = await rowsRead(db, PAGE, [offset]);
  console.log(`offset ${String(offset).padStart(6)}: read ${String(read).padStart(6)} rows to return 20`);
}
await db.close();
```

Output of `node offset-cost.js`

```ts
offset      0: read     20 rows to return 20
offset   1000: read   1020 rows to return 20
offset  50000: read  50020 rows to return 20
offset  99980: read 100000 rows to return 20
```

The index gives the rows in the right order, but it cannot jump to "row number 50,000". The database walks past every skipped row and throws it away. The cost of a page grows with its offset, so a job that reads all 5,000 pages reads about 250 million rows in total. That is the finance team's slow export.

### Keyset pagination

The fix is to describe the next page by **values** instead of by position: "the 20 orders that come after the last one I saw, in this order". This is called **keyset pagination** (a cursor is usually a keyset under the hood). Because the index is sorted by `(created_at, id)`, the database can jump straight to that point and read just 20 rows:

keyset-cost.jsNode.js only

```ts
import { openShop, rowsRead } from "./db.js";

const db = await openShop(100_000);
const { rows } = await db.query(
  "SELECT id, created_at FROM orders ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET 99979",
);
const last = rows[0];
console.log("last order seen:", last.id, last.created_at.toISOString());

const NEXT = `SELECT id FROM orders
              WHERE (created_at, id) < ($1, $2)
              ORDER BY created_at DESC, id DESC LIMIT 20`;
console.log("keyset page read", await rowsRead(db, NEXT, [last.created_at, last.id]), "rows");

const page = await db.query(NEXT, [last.created_at, last.id]);
console.log("first ids on that page:", page.rows.slice(0, 3).map((r) => r.id));
await db.close();
```

Output of `node keyset-cost.js`

```ts
last order seen: 21 2026-01-01T00:07:00.000Z
keyset page read 20 rows
first ids on that page: [ 20, 19, 18 ]
```

`(created_at, id) < ($1, $2)` is a **row comparison**: it compares `created_at` first, and only when those are equal compares `id`. That is exactly the sort order of the index, so PostgreSQL uses the index to find the starting point. Page 5,000 now costs the same as page 1.

> NOTE
>
> An offset is not always wrong. For an admin table with page numbers and a few thousand rows, `OFFSET` is simple and fast enough. Choose keyset when tables are large, when clients scroll or sync, or when rows are inserted while people read.

## The tie-breaker that prevents lost rows

The support ticket said an order was shown twice and another never. Offsets cause that when rows are inserted during paging, as you saw in Designing a REST API. But a cursor has its own version of the bug, and it is easy to write. Look at a cursor that remembers only the timestamp of the last order:

cursor-ties.jsNode.js only

```ts
import { openShop } from "./db.js";

const db = await openShop(9);
const seen = [];
let after = null;

while (true) {
  const { rows } = await db.query(
    `SELECT id, created_at FROM orders
     WHERE $1::timestamptz IS NULL OR created_at < $1
     ORDER BY created_at DESC, id DESC LIMIT 2`,
    [after],
  );
  if (rows.length === 0) break;
  console.log("page:", rows.map((r) => r.id));
  seen.push(...rows.map((r) => r.id));
  after = rows.at(-1).created_at;
}

const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((id) => !seen.includes(id));
console.log("never shown:", missing);
await db.close();
```

Output of `node cursor-ties.js`

```ts
page: [ 9, 8 ]
page: [ 5, 4 ]
page: [ 2, 1 ]
never shown: [ 3, 6, 7 ]
```

Orders 8, 7 and 6 share a minute. The first page ends on order 8, and "older than order 8's timestamp" silently skips 7 and 6, because they are not older, they are the same age. The same happens to order 3. With 20 per page and three orders per minute, one in every few pages loses rows, and nobody notices until a customer does.

The rule: **a cursor must point at a unique position**. Sort by the column you want, then by a unique column as a **tie-breaker**, and put both in the cursor and in the `WHERE`:

cursor-fixed.jsNode.js only

```ts
import { openShop } from "./db.js";

const db = await openShop(9);
const seen = [];
let after = null;

while (true) {
  const { rows } = await db.query(
    `SELECT id, created_at FROM orders
     WHERE $1::timestamptz IS NULL OR (created_at, id) < ($1, $2::integer)
     ORDER BY created_at DESC, id DESC LIMIT 2`,
    after === null ? [null, null] : [after.created_at, after.id],
  );
  if (rows.length === 0) break;
  console.log("page:", rows.map((r) => r.id));
  seen.push(...rows.map((r) => r.id));
  after = rows.at(-1);
}
console.log("shown:", seen.length, "of 9");
await db.close();
```

Output of `node cursor-fixed.js`

```ts
page: [ 9, 8 ]
page: [ 7, 6 ]
page: [ 5, 4 ]
page: [ 3, 2 ]
page: [ 1 ]
shown: 9 of 9
```

The tie-breaker also fixes the quieter version of the same bug in *offset* pagination. SQL gives no order among rows that compare equal under `ORDER BY`: two runs of `ORDER BY created_at LIMIT 20 OFFSET 20` may return tied rows in a different order, so a row can move from page 2 to page 1 between two requests. A unique last sort column makes the order **total**: every row has exactly one place.

### Nullable and user-chosen sort columns

- **Nullable columns.** `NULL` is neither smaller nor larger than anything, so `(shipped_at, id) < ($1, $2)` never matches a row whose `shipped_at` is null. Sort only by `NOT NULL` columns, or replace nulls with `COALESCE(shipped_at, '-infinity')` in both the index and the query.
- **A choice of sort orders.** If clients may sort by total or by date, each sort order needs its own tie-broken index, and the cursor must record which sort it belongs to. Allow only the sorts you have indexes for; that is the allow-list from Designing a REST API, now with a performance reason as well as a safety one.

## Designing the cursor

REASON IT OUT

### Before you design the order-history cursor

A cursor is a string the server gives out and later receives back. Before writing the code, think through these questions:

- Who can change a cursor before sending it back? What is the worst thing a changed cursor could do?
- The client asked for `status=paid`, got a cursor, then sends that cursor with `status=shipped`. What should happen?
- The order that the cursor points at is deleted before the next page is requested. Does the next page still work?
- You change the sort order or the cursor format next year. What happens to cursors that clients still hold?
- Should the cursor say which customer the orders belong to?

**Show the reasoning**

**Anyone** can change it: it is client input like any query parameter. If you decode it and put its values into SQL as parameters, the worst a forged cursor can do is start the page at a different position in the same, already-authorized result set. That is harmless, as long as you validate its types and never paste it into SQL.

A cursor only makes sense with the filters and sort it was made for. Mixing them gives nonsense pages, so bind the cursor to them and answer **400** when they do not match.

Deleting the row does not matter. A keyset cursor holds *values* (a timestamp and an id), not a pointer to a row. The query asks for rows "after these values", whether or not a row with those values still exists. This is a real advantage over "start after the row with id 42", which fails when row 42 is gone.

Old cursors will come back, from bookmarks, retries and app versions that have not updated. Put a format version in the cursor, and answer an unknown version with a clear 400 that tells the client to start again from the first page.

**Never** put authorization in the cursor. Who may see which orders comes from the verified session on every request, as in [BookStore authentication](https://zudojs.oyinlola.site/learn/bookstore-auth#routes). A cursor that said `customer: 17` would let anyone read customer 17's orders by editing it.

The design that follows from that reasoning: a small JSON object with a version, the sort, a fingerprint of the filters and the keyset values, encoded as base64url so it travels safely in a URL and clients treat it as an opaque token. This code has no Node APIs, so it runs in the browser too:

cursor.js

```ts
const VERSION = 1;

function toBase64Url(text) {
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(token) {
  return atob(token.replaceAll("-", "+").replaceAll("_", "/"));
}

export function filterKey(filters) {
  return Object.keys(filters).sort().map((name) => `${name}=${filters[name]}`).join("&");
}

export function encodeCursor(sort, filters, last) {
  return toBase64Url(JSON.stringify({ v: VERSION, s: sort, f: filterKey(filters), k: [last.createdAt, last.id] }));
}

export function decodeCursor(token, sort, filters) {
  let data;
  try {
    data = JSON.parse(fromBase64Url(token));
  } catch {
    return { error: "cursor is not valid" };
  }
  if (data?.v !== VERSION) return { error: "cursor is from an older version; start from the first page" };
  if (data.s !== sort || data.f !== filterKey(filters)) return { error: "cursor does not match this sort and these filters" };
  const [createdAt, id] = Array.isArray(data.k) ? data.k : [];
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt)) || !Number.isSafeInteger(id)) {
    return { error: "cursor is not valid" };
  }
  return { after: { createdAt, id } };
}
```

Try it with an honest cursor, a cursor reused with different filters, a damaged one, and a forged one:

try-cursor.js

```ts
import { decodeCursor, encodeCursor } from "./cursor.js";

const cursor = encodeCursor("-created_at", { status: "paid" }, { createdAt: "2026-03-01T09:30:00.000Z", id: 88412 });
console.log(cursor.length, "characters:", cursor.slice(0, 24) + "...");

console.log(decodeCursor(cursor, "-created_at", { status: "paid" }));
console.log(decodeCursor(cursor, "-created_at", { status: "shipped" }));
console.log(decodeCursor(cursor.slice(0, -5), "-created_at", { status: "paid" }));

const forged = btoa(JSON.stringify({ v: 1, s: "-created_at", f: "status=paid", k: ["2026-03-01", "1 OR 1=1"] }));
console.log(decodeCursor(forged, "-created_at", { status: "paid" }));
```

Output of `node try-cursor.js` and of the browser terminal

```ts
110 characters: eyJ2IjoxLCJzIjoiLWNyZWF0...
{ after: { createdAt: '2026-03-01T09:30:00.000Z', id: 88412 } }
{ error: 'cursor does not match this sort and these filters' }
{ error: 'cursor is not valid' }
{ error: 'cursor is not valid' }
```

- `filterKey` sorts the filter names, so `{status, customer}` and `{customer, status}` give the same fingerprint.
- Every failure returns a message instead of throwing, so the endpoint can turn it into a 400 problem details response.
- The forged cursor tried to smuggle SQL into the id. It never gets near the database: an id must be a safe integer.

> TIP
>
> Some APIs also sign the cursor with an HMAC (from [the node:crypto lesson](https://zudojs.oyinlola.site/learn/node-crypto#hmac)) so they can tell at once that it was not edited. That is useful when the cursor carries something expensive to validate. It is not a substitute for the checks above, and it never makes it safe to put authorization in the cursor.

## Build it: the orders endpoint

Now combine the keyset query and the cursor. `listOrders` takes already-parsed input, reads `limit + 1` rows to learn whether a next page exists, and returns the page with a `nextCursor`. The cursor module is the one you just wrote, repeated here so the database project has its own copy:

cursor.js

```ts
const VERSION = 1;
const toBase64Url = (text) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromBase64Url = (token) => atob(token.replaceAll("-", "+").replaceAll("_", "/"));

export function filterKey(filters) {
  return Object.keys(filters).sort().map((name) => `${name}=${filters[name]}`).join("&");
}

export function encodeCursor(sort, filters, last) {
  return toBase64Url(JSON.stringify({ v: VERSION, s: sort, f: filterKey(filters), k: [last.createdAt, last.id] }));
}

export function decodeCursor(token, sort, filters) {
  let data;
  try {
    data = JSON.parse(fromBase64Url(token));
  } catch {
    return { error: "cursor is not valid" };
  }
  if (data?.v !== VERSION) return { error: "cursor is from an older version; start from the first page" };
  if (data.s !== sort || data.f !== filterKey(filters)) return { error: "cursor does not match this sort and these filters" };
  const [createdAt, id] = Array.isArray(data.k) ? data.k : [];
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt)) || !Number.isSafeInteger(id)) {
    return { error: "cursor is not valid" };
  }
  return { after: { createdAt, id } };
}
```

list-orders.js

```ts
import { decodeCursor, encodeCursor } from "./cursor.js";

const SORT = "-created_at";

export async function listOrders(db, { limit = 20, cursor = null, status = null } = {}) {
  const filters = status === null ? {} : { status };
  let after = null;
  if (cursor !== null) {
    const decoded = decodeCursor(cursor, SORT, filters);
    if (decoded.error) return { error: decoded.error };
    after = decoded.after;
  }
  const { rows } = await db.query(
    `SELECT id, customer, status, total_kobo, created_at FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::integer))
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [status, after?.createdAt ?? null, after?.id ?? null, limit + 1],
  );
  const data = rows.slice(0, limit).map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
  const last = data.at(-1);
  const nextCursor = rows.length > limit ? encodeCursor(SORT, filters, { createdAt: last.created_at, id: last.id }) : null;
  return { data, nextCursor };
}
```

### Test it the way it fails in production

A pagination test with a quiet table proves little. The bug report came from a customer who paged *while new orders arrived*. So the test does exactly that: it walks every page of a 1,000-order table and inserts five brand-new orders before each page request. The promise to check is: every order that existed when the walk started is shown **exactly once**. Then it runs the same walk with offsets, for comparison:

walk-while-writing.jsNode.js only

```ts
import { openShop } from "./db.js";
import { listOrders } from "./list-orders.js";

async function walk(db, fetchPage) {
  const original = (await db.query("SELECT id FROM orders")).rows.map((r) => r.id);
  let nextId = original.length + 1;
  const counts = new Map();
  let state = { page: 0, cursor: null };
  while (state !== null) {
    for (let i = 0; i < 5; i++, nextId++) {
      await db.query("INSERT INTO orders VALUES ($1, 'customer-new', 'paid', 150000, now())", [nextId]);
    }
    const { ids, next } = await fetchPage(state);
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    state = next;
  }
  const missing = original.filter((id) => !counts.has(id)).length;
  const repeated = [...counts.values()].filter((n) => n > 1).length;
  return `missing ${missing}, repeated ${repeated}`;
}

const cursorDb = await openShop(1_000);
console.log("cursor:", await walk(cursorDb, async ({ cursor }) => {
  const page = await listOrders(cursorDb, { limit: 50, cursor });
  return { ids: page.data.map((o) => o.id), next: page.nextCursor && { cursor: page.nextCursor } };
}));

const offsetDb = await openShop(1_000);
console.log("offset:", await walk(offsetDb, async ({ page }) => {
  const { rows } = await offsetDb.query(
    "SELECT id FROM orders ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $1", [page * 50],
  );
  return { ids: rows.map((r) => r.id), next: rows.length === 50 ? { page: page + 1 } : null };
}));
await cursorDb.close();
await offsetDb.close();
```

Output of `node walk-while-writing.js`

```ts
cursor: missing 0, repeated 0
offset: missing 0, repeated 110
```

The cursor walk showed every order exactly once. The offset walk showed 110 orders twice: each insert pushed older orders down the list, so the last rows of one page came back at the top of the next. (With deletes instead of inserts, offsets skip rows instead.) A test like this belongs in your suite: it is short, deterministic, and it fails on exactly the bug a customer reported.

New orders created during the walk are newer than the cursor, so they are not in this walk; the client sees them the next time it starts from the first page. That is the right behaviour for a history list.

### Over HTTP, with a Link header

The HTTP layer parses the query, turns a cursor error into a 400, and adds a `Link` header (RFC 8288) with the full URL of the next page, as well as `next_cursor` in the body. Clients that follow links never build URLs themselves:

server.jsNode.js only

```ts
import http from "node:http";
import { openShop } from "./db.js";
import { listOrders } from "./list-orders.js";

const db = await openShop(1_000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const limit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.writeHead(400, { "Content-Type": "application/problem+json" });
    return res.end(JSON.stringify({ status: 400, title: "Invalid query", detail: "limit must be 1 to 100" }));
  }
  const page = await listOrders(db, {
    limit,
    cursor: url.searchParams.get("cursor"),
    status: url.searchParams.get("status"),
  });
  if (page.error) {
    res.writeHead(400, { "Content-Type": "application/problem+json" });
    return res.end(JSON.stringify({ status: 400, title: "Invalid cursor", detail: page.error }));
  }
  const headers = { "Content-Type": "application/json" };
  if (page.nextCursor) {
    url.searchParams.set("cursor", page.nextCursor);
    headers.Link = `<${url.pathname}${url.search}>; rel="next"`;
  }
  res.writeHead(200, headers);
  res.end(JSON.stringify({ data: page.data, next_cursor: page.nextCursor }));
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const first = await fetch(`${base}/v1/orders?status=paid&limit=2`);
  const body = await first.json();
  console.log(first.status, body.data.map((o) => `${o.id} ${o.status} ₦${o.total_kobo / 100}`));
  const link = first.headers.get("link");
  console.log("link rel:", link.match(/rel="(\w+)"/)[1]);

  const second = await fetch(base + link.slice(1, link.indexOf(">")));
  console.log(second.status, (await second.json()).data.map((o) => o.id));

  const mixed = await fetch(`${base}/v1/orders?status=shipped&cursor=${body.next_cursor}`);
  console.log(mixed.status, (await mixed.json()).detail);
  server.close();
  await db.close();
});
```

Output of `node server.js`

```ts
200 [ '999 paid ₦29110.81', '996 paid ₦28873.24' ]
link rel: next
200 [ 993, 990 ]
400 cursor does not match this sort and these filters
```

The order ids jump by three because only every third order is paid. The next page, followed through the `Link` header, continued exactly where the first one stopped. Reusing the paid-orders cursor for shipped orders got a clear 400 instead of a confusing page.

### What about the total count?

Clients love "Showing 1-20 of 98,213". But an exact `COUNT(*)` must visit every matching row, which is the same cost you just removed from paging:

count-cost.jsNode.js only

```ts
import { openShop, rowsRead } from "./db.js";

const db = await openShop(100_000);
console.log("exact count reads", await rowsRead(db, "SELECT count(*) FROM orders"), "rows");

const estimate = await db.query("SELECT reltuples::integer AS rows FROM pg_class WHERE relname = 'orders'");
console.log("planner estimate:", estimate.rows[0].rows);
await db.close();
```

Output of `node count-cost.js`

```ts
exact count reads 100000 rows
planner estimate: 100000
```

Common answers: leave the total out and send `next_cursor` only (the `limit + 1` trick already tells you whether there is more); send an estimate and label it as one (the planner's estimate is refreshed by `ANALYZE` and autovacuum, and is exact here only because the table was just analyzed); or offer the count on a separate endpoint that clients call only when they need it.

## Breaking and non-breaking changes

Now the third bug report: a renamed field. A response is a promise, and every client that parses it depends on the parts it reads. A **breaking change** is any change after which a correct, unchanged client can fail. [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#versioning) introduced the idea; here is the fuller list:

| Change | Breaking? | Why |
| --- | --- | --- |
| Add an optional request field or query parameter | No | Old clients do not send it; the server uses a default. |
| Add a field to a response | No, *if* clients ignore unknown fields | A client that rejects unknown fields breaks. Tell clients not to. |
| Add a new value to an enum in a response (`status: "refunded"`) | Often, in practice | Clients with a `switch` over all values hit their default branch or crash. |
| Remove or rename a response field | Yes | Clients read `undefined`. The mobile team's ₦0. |
| Change a field's type or unit (naira to kobo, number to string) | Yes | Same name, different meaning: the worst kind, because nothing crashes. |
| Make an optional request field required | Yes | Old clients never send it and now get 400. |
| Tighten validation (max length 200 to 100) | Yes | Requests that worked yesterday fail today. |
| Change the default sort or page size | Yes, quietly | Clients that relied on the order show different data. |
| Change status codes or the error format | Yes | Error handling is code, too. |

The client side of this is the **tolerant reader** pattern: read only the fields you need, ignore everything else, and treat unknown enum values as a known fallback. Compare a strict client with a tolerant one when the server adds a field and a new status:

tolerant-reader.js

```ts
const response = { id: 88412, status: "refunded", total_kobo: 1500000, currency: "NGN" };

function strictClient(order) {
  const expected = ["id", "status", "total_kobo"];
  const extra = Object.keys(order).filter((key) => !expected.includes(key));
  if (extra.length > 0) throw new Error(`unexpected fields: ${extra}`);
  switch (order.status) {
    case "paid": return "Paid";
    case "shipped": return "On its way";
    case "delivered": return "Delivered";
    default: throw new Error(`unknown status ${order.status}`);
  }
}

function tolerantClient(order) {
  const labels = { paid: "Paid", shipped: "On its way", delivered: "Delivered" };
  const { id, status, total_kobo } = order;
  return `#${id} ${labels[status] ?? "Updated, open for details"} ₦${(total_kobo / 100).toLocaleString("en-NG")}`;
}

try {
  console.log(strictClient(response));
} catch (error) {
  console.log("strict client:", error.message);
}
console.log("tolerant client:", tolerantClient(response));
```

Output of `node tolerant-reader.js` and of the browser terminal

```ts
strict client: unexpected fields: currency
tolerant client: #88412 Updated, open for details ₦15,000
```

The server made two changes that are "non-breaking" by the rules above, and the strict client broke on both. Document that clients must ignore unknown fields and handle unknown enum values, and write your own clients (web app, mobile app, SDK) that way. Then additive changes really are free.

## Versioning strategies

When a breaking change cannot be avoided, you publish a new **version** and keep the old one working. There are three common places to say which version a request wants:

| Where | Example | For | Against |
| --- | --- | --- | --- |
| URL path | `/v2/orders` | Visible in every log and link; easy to route and cache; easy to try in a browser | Big jumps only: every breaking change is a whole new API; resource URLs change |
| Header | `Shop-Version: 2026-09-01` | URLs stay the same; can version often and in small steps | Invisible in links; caches must `Vary` on the header; easy to forget in curl |
| Media type | `Accept: application/vnd.shop.v2+json` | Follows HTTP's content negotiation | Awkward for clients and tools; rarely worth it |

Two styles of version *number* are common. **Major versions** (`v1`, `v2`) bundle many changes, happen rarely, and are usually put in the path. **Dated versions** (`2026-09-01`) name the day a change shipped; each client is pinned to the version it was built against, and upgrades when it is ready. Stripe's API is a well-known example of the dated style. Many APIs combine them: a major version in the path, and dated versions in a header for smaller changes inside it.

Whatever you choose, resolve the version **once**, at the edge, and reject versions you do not know. Silently guessing "latest" for a typo is how a client ends up on a version it was never tested against:

resolve-version.js

```ts
const MAJORS = ["v1", "v2"];
const DATED = ["2026-01-15", "2026-06-01", "2026-09-01"];

function resolveVersion(path, headers, accountDefault) {
  const major = path.split("/")[1];
  if (!MAJORS.includes(major)) return { status: 404, detail: `unknown API version ${major}` };
  const requested = headers["shop-version"] ?? accountDefault;
  if (!DATED.includes(requested)) return { status: 400, detail: `unknown Shop-Version ${requested}` };
  return { major, dated: requested };
}

console.log(resolveVersion("/v2/orders", {}, "2026-06-01"));
console.log(resolveVersion("/v2/orders", { "shop-version": "2026-09-01" }, "2026-06-01"));
console.log(resolveVersion("/v2/orders", { "shop-version": "2026-9-1" }, "2026-06-01"));
console.log(resolveVersion("/v3/orders", {}, "2026-06-01"));
```

Output of `node resolve-version.js` and of the browser terminal

```json
{ major: 'v2', dated: '2026-06-01' }
{ major: 'v2', dated: '2026-09-01' }
{ status: 400, detail: 'unknown Shop-Version 2026-9-1' }
{ status: 404, detail: 'unknown API version v3' }
```

`accountDefault` is the version the client's account was pinned to when it first called the API. A client that never sends the header keeps getting the behaviour it was built against, even after you ship new versions.

## One codebase, many versions

Copying the whole codebase for every version does not scale: a bug fixed in one copy stays in the others. The usual design keeps **one** current implementation and a list of **version changes**. Each change knows how to turn a current response back into the shape clients expected before that change. A request pinned to an old version gets the current response, passed backwards through every change newer than its version:

```ts
current order  ──►  undo 2026-09-01  ──►  undo 2026-06-01  ──►  response for a client on 2026-01-15
                    (customer object       (total_kobo back
                     back to an id)         to naira "total")
```

A client pinned to an old version gets the current data, translated backwards one change at a time.

version-changes.js

```ts
const changes = [
  {
    version: "2026-06-01",
    description: "total (naira, decimal) replaced by total_kobo (integer)",
    undo: ({ total_kobo, ...order }) => ({ ...order, total: total_kobo / 100 }),
  },
  {
    version: "2026-09-01",
    description: "customer_id replaced by an expanded customer object",
    undo: ({ customer, ...order }) => ({ ...order, customer_id: customer.id }),
  },
];

function render(order, clientVersion) {
  return changes
    .filter((change) => change.version > clientVersion)
    .toReversed()
    .reduce((shape, change) => change.undo(shape), order);
}

const current = { id: 88412, status: "paid", total_kobo: 1500000, customer: { id: 17, name: "Ada Obi" } };

for (const version of ["2026-01-15", "2026-06-01", "2026-09-01"]) {
  console.log(version, JSON.stringify(render(current, version)));
}
```

Output of `node version-changes.js` and of the browser terminal

```ts
2026-01-15 {"id":88412,"status":"paid","customer_id":17,"total":15000}
2026-06-01 {"id":88412,"status":"paid","total_kobo":1500000,"customer_id":17}
2026-09-01 {"id":88412,"status":"paid","total_kobo":1500000,"customer":{"id":17,"name":"Ada Obi"}}
```

- Dates in the form `YYYY-MM-DD` compare correctly as strings, so `change.version > clientVersion` picks the changes the client has not adopted yet.
- Changes are undone newest first (`toReversed`), because each `undo` expects the shape that existed right after its own change.
- Business logic, database queries and bug fixes exist once. Old versions cost one small function per change, and each change is documented by its `description`: that list *is* your changelog.

The same list works in the other direction for request bodies: an old client sends `total`, and a "redo" function turns it into `total_kobo` before your current code sees it. And the mobile team's bug would not have happened: renaming `total` would have been a dated version, and the old app, pinned to its version, would have kept receiving `total`.

## Deprecation and sunset

Old versions cannot live forever. Retiring one is a process, not a date in a blog post:

1. **Measure.** Log the resolved version and the client (API key or app) of every request, so you know who still uses the old version.
2. **Announce** in the responses themselves. The `Deprecation` header (RFC 9745) says since when a resource is deprecated, as `@` plus a Unix timestamp. The `Sunset` header (RFC 8594) says when it will stop working, as an HTTP date. A `Link` with `rel="deprecation"` points at the migration guide. Client libraries and API gateways can log warnings from these headers automatically.
3. **Contact** the clients your logs name, well before the date.
4. **Brown out** (optional): switch the old version off for an hour, announced, a few weeks before the sunset. Forgotten clients fail loudly while there is still time.
5. **Retire**: after the sunset, answer **410 Gone** with a problem details body that links to the migration guide, instead of a confusing 404.

This server does all of it. The clock is a parameter, so the example can show a request before and after the sunset without waiting a year:

deprecation.jsNode.js only

```ts
import http from "node:http";

const V1 = {
  deprecatedAt: Date.UTC(2026, 8, 1),
  sunsetAt: Date.UTC(2027, 2, 31),
  guide: "https://docs.example.com/migrate-to-v2",
};
const usage = new Map();

function createServer(now) {
  return http.createServer((req, res) => {
    const version = req.url.split("/")[1];
    const client = req.headers["x-client"] ?? "unknown";
    usage.set(`${version} ${client}`, (usage.get(`${version} ${client}`) ?? 0) + 1);
    if (version === "v1") {
      if (now() >= V1.sunsetAt) {
        res.writeHead(410, { "Content-Type": "application/problem+json", Link: `<${V1.guide}>; rel="deprecation"` });
        return res.end(JSON.stringify({ status: 410, title: "Gone", detail: `v1 was retired; see ${V1.guide}` }));
      }
      res.setHeader("Deprecation", `@${V1.deprecatedAt / 1000}`);
      res.setHeader("Sunset", new Date(V1.sunsetAt).toUTCString());
      res.setHeader("Link", `<${V1.guide}>; rel="deprecation"`);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [] }));
  });
}

let today = Date.UTC(2026, 9, 1);
const server = createServer(() => today);
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = (path, client) => fetch(base + path, { headers: { "x-client": client } });

  const old = await call("/v1/orders", "android-3.2");
  console.log(old.status, "Deprecation:", old.headers.get("deprecation"));
  console.log("Sunset:", old.headers.get("sunset"));
  await call("/v1/orders", "android-3.2");
  await call("/v2/orders", "web-8.0");
  console.log("usage:", Object.fromEntries(usage));

  today = Date.UTC(2027, 3, 1);
  const late = await call("/v1/orders", "android-3.2");
  console.log(late.status, (await late.json()).detail);
  server.close();
});
```

Output of `node deprecation.js`

```ts
200 Deprecation: @1788220800
Sunset: Wed, 31 Mar 2027 00:00:00 GMT
usage: { 'v1 android-3.2': 2, 'v2 web-8.0': 1 }
410 v1 was retired; see https://docs.example.com/migrate-to-v2
```

The usage map is the list of people to e-mail: `android-3.2` still calls v1 twice a day, the web app has moved. In production this is a metric or a log query, not a `Map`, but the question it answers is the same.

## Production concerns

- **Index every sort you allow.** Keyset pagination is only fast when an index matches the `ORDER BY` exactly, tie-breaker included. With a filter such as `status`, an index on `(status, created_at DESC, id DESC)` lets the database jump straight into the paid orders. Check with `EXPLAIN`, as in [Indexes and query planning](https://zudojs.oyinlola.site/learn/db-indexes).
- **Cap the page size** (here 100), and answer a larger `limit` with 400, not a silent cap the client cannot see.
- **Cursors are not bookmarks forever.** Document that they are for immediate paging, may expire, and must be treated as opaque. Then you are free to change their format with a version bump.
- **Snapshot vs live paging.** Keyset pages show rows as they are when each page is read. An order that changes status during a walk filtered by status can leave or join the list. If a client needs a consistent snapshot (an export for accounting), filter by `created_at <= walk start`, or export from a database snapshot.
- **Versions multiply tests.** Keep a response fixture per supported version and test each one; retire versions so the list stays short. [API contracts](https://zudojs.oyinlola.site/learn/api-contracts) turns those fixtures into contract tests.
- **Caches must know the version.** If the version is in a header, send `Vary: Shop-Version`, or a cache may serve a v2 body to a v1 client.

## Practice

TRY IT YOURSELF

### A previous page

An order-history screen has a "newer" button as well as "older". Write `newerPage(db, before, limit)` that returns the `limit` orders just *newer* than the order `before` (an object with `createdAt` and `id`), still in newest-first order. Test it on `openShop(9)`: the page newer than order 4 with limit 3 must be `[7, 6, 5]`.

**Show a solution**

Flip the comparison and the sort to read the nearest newer rows first, then reverse them back into newest-first order:

newer-page.jsNode.js only

```ts
import { openShop } from "./db.js";

async function newerPage(db, before, limit) {
  const { rows } = await db.query(
    `SELECT id FROM orders
     WHERE (created_at, id) > ($1, $2)
     ORDER BY created_at ASC, id ASC LIMIT $3`,
    [before.createdAt, before.id, limit],
  );
  return rows.map((r) => r.id).toReversed();
}

const db = await openShop(9);
const { rows } = await db.query("SELECT id, created_at FROM orders WHERE id = 4");
console.log(await newerPage(db, { createdAt: rows[0].created_at, id: 4 }, 3));
await db.close();
```

Output of `node newer-page.js`

```json
[ 7, 6, 5 ]
```

Without the flip, `ORDER BY created_at DESC ... WHERE >` would return the *newest* orders in the whole table (9, 8, 7), not the ones next to order 4. The same B-tree index serves both directions; PostgreSQL can read an index backwards.

TRY IT YOURSELF

### Breaking or not?

For each change to the orders API, say whether it breaks existing clients and what you would do: (a) add `delivery_eta` to each order; (b) change `created_at` from `"2026-03-01T09:30:00.000Z"` to the Unix number `1772357400`; (c) accept an optional `?customer=` filter; (d) lower the maximum `limit` from 100 to 50; (e) add the status `"refunded"`.

**Show a solution**

(a) Not breaking for tolerant readers: ship it. (b) Breaking: a different type under the same name. Make it a new dated version (or add a new field such as `created_at_unix` and keep the old one). (c) Not breaking: old clients never send it. (d) Breaking: a client that sends `limit=100` now gets 400. Keep 100 for old versions, or make the change in a new version. (e) Breaking in practice for clients with exhaustive checks. Announce it in advance, document that clients must handle unknown statuses, and consider gating it behind a new version for clients pinned before it.

TRY IT YOURSELF

### Add a version change

In `version-changes.js`, the status `"canceled"` used to be spelled `"cancelled"`. Add a version change for `2026-10-01` that renamed it, so that clients on older versions still receive `"cancelled"`. Print a canceled order for versions `2026-09-01` and `2026-10-01`.

**Show a solution**

rename-status.js

```ts
const changes = [
  {
    version: "2026-10-01",
    description: 'status "cancelled" renamed to "canceled"',
    undo: (order) => (order.status === "canceled" ? { ...order, status: "cancelled" } : order),
  },
];

function render(order, clientVersion) {
  return changes
    .filter((change) => change.version > clientVersion)
    .toReversed()
    .reduce((shape, change) => change.undo(shape), order);
}

const order = { id: 90001, status: "canceled", total_kobo: 250000 };
console.log(render(order, "2026-09-01"));
console.log(render(order, "2026-10-01"));
```

Output of `node rename-status.js` and of the browser terminal

```json
{ id: 90001, status: 'cancelled', total_kobo: 250000 }
{ id: 90001, status: 'canceled', total_kobo: 250000 }
```

The `undo` only touches orders with the renamed value and returns every other order unchanged. It also returns a new object instead of changing the one it was given, so rendering the same order for two versions cannot mix them up.

## Summary

- An `OFFSET` makes the database read and discard every skipped row, so deep pages get slower, and inserts or deletes during paging repeat or skip rows.
- Keyset pagination asks for rows after the last one's *values*, uses the index to jump there, and costs the same on every page.
- The sort must be total: end it with a unique tie-breaker, and put every sort column in both the cursor and the row comparison, or tied rows are lost.
- A cursor is client input: version it, bind it to its sort and filters, validate its values, answer 400 when it is wrong, and never put authorization in it.
- Test pagination while writing: walk every page while inserting rows, and assert that nothing is missing or repeated.
- Removing, renaming or retyping fields, tightening validation and changing defaults are breaking. Adding optional inputs and response fields is not, when clients are tolerant readers.
- Resolve the version once at the edge. Keep one implementation and translate old versions with small, dated version changes.
- Retire versions with measurement, `Deprecation` and `Sunset` headers, contact, optional brownouts, and finally 410 Gone.

Next: [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency), where a ₦10,000 transfer must happen exactly once even when the client sends it twice.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
