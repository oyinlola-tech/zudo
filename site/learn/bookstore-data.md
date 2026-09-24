---
title: "\"BookStore API: validation and PostgreSQL\""
description: "Check every request body by hand with type guards, move the BookStore data into PostgreSQL with PGlite, write repositories with parameterized SQL, and map typed errors to 400, 404 and 409."
source: https://zudojs.oyinlola.site/learn/bookstore-data
---

LESSON 42 OF 84

Project: a TypeScript backend Core

# "BookStore API: validation and PostgreSQL"

Check every request body by hand with type guards, move the BookStore data into PostgreSQL with PGlite, write repositories with parameterized SQL, and map typed errors to 400, 404 and 409.

- **50 min** to read and try
- **You need:** "BookStore API: HTTP and routing", and the SQL lessons
- **You build:** A BookStore API that stores authors, books and orders in PostgreSQL and answers bad input with clear errors

  [Test yourself](#test)

## What changes in this lesson

In [the last lesson](https://zudojs.oyinlola.site/learn/bookstore-http) the BookStore kept its data in a `Map` and forgot everything when it stopped. It also checked only one body, by hand, inside a route. This lesson fixes both:

| New file | Its job |
| --- | --- |
| `src/errors.ts` | Typed errors: "invalid", "not found", "conflict". They know nothing about HTTP. |
| `src/validation/` | Type guards that check every request body and list every problem. |
| `src/db.ts` | Opens the database and creates the tables. |
| `src/repositories/` | One class per table. The only code that writes SQL. |

`src/store.ts` goes away. The router, `app.ts` and `json.ts` stay exactly as they were.

## Errors that say what went wrong

Deep inside the code, a repository finds out that a book does not exist. It should not have to know that HTTP calls this 404. It just says "not found", with a typed error. The HTTP layer decides the status code. Here are the errors:

src/errors.tsNode.js only

```ts
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("validation_failed", "The request is not valid");
    this.issues = issues;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super("not_found", `${what} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message);
  }
}
```

`new.target` is the class that was actually created with `new`, so `new.target.name` gives every subclass its own `name`, such as `"NotFoundError"`, without repeating it. You built error classes like these in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors).

Now `src/http/errors.ts` maps each type to its status code. Replace the old `toErrorResponse` with this one:

src/http/errors.tsNode.js only

```ts
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors.js";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function statusFor(error: AppError): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  return 500;
}

export function toErrorResponse(error: unknown): { status: number; body: unknown } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: { error: error.code, message: error.message, issues: error.issues } };
  }
  if (error instanceof AppError) {
    return { status: statusFor(error), body: { error: error.code, message: error.message } };
  }
  console.error(error);
  return { status: 500, body: { error: "internal_error", message: "Something went wrong" } };
}
```

| Error | Status | Meaning for the client |
| --- | --- | --- |
| `ValidationError` | 400 Bad Request | Fix your request. The `issues` list says what is wrong. |
| `NotFoundError` | 404 Not Found | The thing in the URL does not exist. |
| `ConflictError` | 409 Conflict | The request is fine, but clashes with the current data: a duplicate, or not enough stock. |

## Check every body by hand

A request body is `unknown`. Before you use it, you prove what it is with **type guards** ([TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime)). Three small helpers do most of the work:

src/validation/rules.ts

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value: unknown, name: string, max: number, issues: string[]): string {
  if (typeof value === "string" && value.trim() !== "" && value.length <= max) {
    return value.trim();
  }
  issues.push(`${name} must be text of 1 to ${max} characters`);
  return "";
}

export function whole(value: unknown, name: string, min: number, max: number, issues: string[]): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max) {
    return value;
  }
  issues.push(`${name} must be a whole number from ${min} to ${max}`);
  return min;
}
```

`text` and `whole` don't throw. When a value is wrong, they add a message to the `issues` list and return a placeholder. That way one request gets **all** its problems reported at once, not one per attempt. Every check also has a maximum: a 5 MB "title" or a quantity of a billion is wrong too.

With the helpers, each body gets one function. It takes `unknown` and returns a typed value, or throws a `ValidationError`:

src/validation/bodies.tsNode.js only

```ts
import { ValidationError } from "../errors.js";
import { isRecord, text, whole } from "./rules.js";

export interface NewAuthor {
  readonly name: string;
}

export interface NewBook {
  readonly title: string;
  readonly authorId: number;
  readonly priceCents: number;
  readonly stock: number;
}

export interface NewOrder {
  readonly bookId: number;
  readonly quantity: number;
}

function objectBody(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new ValidationError(["the body must be a JSON object"]);
  return input;
}

function done<T>(value: T, issues: readonly string[]): T {
  if (issues.length > 0) throw new ValidationError(issues);
  return value;
}

export function parseNewAuthor(input: unknown): NewAuthor {
  const body = objectBody(input);
  const issues: string[] = [];
  return done({ name: text(body["name"], "name", 100, issues) }, issues);
}

export function parseNewBook(input: unknown): NewBook {
  const body = objectBody(input);
  const issues: string[] = [];
  const book = {
    title: text(body["title"], "title", 200, issues),
    authorId: whole(body["authorId"], "authorId", 1, 2_147_483_647, issues),
    priceCents: whole(body["priceCents"], "priceCents", 0, 1_000_000, issues),
    stock: whole(body["stock"], "stock", 0, 10_000, issues),
  };
  return done(book, issues);
}

export function parseNewOrder(input: unknown): NewOrder {
  const body = objectBody(input);
  const issues: string[] = [];
  const order = {
    bookId: whole(body["bookId"], "bookId", 1, 2_147_483_647, issues),
    quantity: whole(body["quantity"], "quantity", 1, 100, issues),
  };
  return done(order, issues);
}
```

Notice what the parsers return: a **new** object with only the fields they checked. If a client sends extra fields, such as `"id": 1` or `"isAdmin": true`, they are dropped here and can never reach the database. Try three bodies:

try-validation.tsNode.js only

```ts
import { ValidationError } from "./src/errors.js";
import { parseNewBook } from "./src/validation/bodies.js";

const bodies: unknown[] = [
  { title: "  Kindred ", authorId: 3, priceCents: 1099, stock: 5 },
  { title: "", authorId: "3", priceCents: 10.5 },
  "Kindred",
];

for (const body of bodies) {
  try {
    console.log(parseNewBook(body));
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    console.log(error.name, error.issues);
  }
}
```

Output of `npx tsx try-validation.ts`

```json
{ title: 'Kindred', authorId: 3, priceCents: 1099, stock: 5 }
ValidationError [
  'title must be text of 1 to 200 characters',
  'authorId must be a whole number from 1 to 2147483647',
  'priceCents must be a whole number from 0 to 1000000',
  'stock must be a whole number from 0 to 10000'
]
ValidationError [ 'the body must be a JSON object' ]
```

The good body came back trimmed. The second got four issues in one go: an empty title, an id sent as a string, half a cent, and a missing stock. The third is not an object at all.

## A real PostgreSQL in your project

**PGlite** is PostgreSQL compiled to WebAssembly: the real database, running inside your Node.js process, with no server to install. It keeps data in memory, or in a folder if you give it one. It is the same SQL you learned in [SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics), so moving to a PostgreSQL server later changes one file.

Terminal on your computer

```bash
$ npm install @electric-sql/pglite

added 1 package, and audited 9 packages in 5s

found 0 vulnerabilities
…
```

The `…` stands for the esbuild warning from before; you can ignore it. This time there is no `-D`, because the running app needs PGlite. Now the database module:

src/db.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS authors (
     id serial PRIMARY KEY,
     name text NOT NULL UNIQUE
   )`,
  `CREATE TABLE IF NOT EXISTS books (
     id serial PRIMARY KEY,
     title text NOT NULL,
     author_id integer NOT NULL REFERENCES authors (id),
     price_cents integer NOT NULL CHECK (price_cents >= 0),
     stock integer NOT NULL CHECK (stock >= 0)
   )`,
  `CREATE TABLE IF NOT EXISTS orders (
     id serial PRIMARY KEY,
     book_id integer NOT NULL REFERENCES books (id),
     quantity integer NOT NULL CHECK (quantity > 0),
     total_cents integer NOT NULL
   )`,
];

export async function migrate(db: Queryable): Promise<void> {
  for (const sql of MIGRATIONS) {
    await db.query(sql);
  }
}

export async function openDatabase(dataDir?: string): Promise<PGlite> {
  const db = new PGlite(dataDir);
  await migrate(db);
  return db;
}

export function isPgError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
```

- **`Queryable`** is the one thing the rest of the code needs from a database: "run this SQL with these parameters and give me rows". PGlite fits that interface, and so will a real PostgreSQL connection later in this lesson.
- **The tables protect themselves.** `REFERENCES authors (id)` is a **foreign key**: PostgreSQL refuses a book whose author does not exist. `UNIQUE` refuses a second author with the same name, and `CHECK (stock >= 0)` refuses negative stock. Even a bug in your TypeScript cannot break those rules.
- **`MIGRATIONS`** are the steps that build the database. `IF NOT EXISTS` makes them safe to run on every start. Real projects use a migration tool that remembers which steps already ran; ZudoJS has one, and you will meet it later.
- **`isPgError`** is a type guard for the errors PostgreSQL throws. Each has a `code`: `23505` means "unique rule broken", `23503` means "foreign key broken".

## Parameters, never string building

> THE WRONG WAY, SHOWN ONCE
>
> The first query below builds SQL by pasting user input into a string. Never do this. It is here so you can see the attack work.

try-injection.tsNode.js only

```ts
import { openDatabase } from "./src/db.js";

const db = await openDatabase();
await db.exec(`INSERT INTO authors (name) VALUES ('Chinua Achebe');
  INSERT INTO books (title, author_id, price_cents, stock) VALUES
    ('Things Fall Apart', 1, 1299, 3), ('Arrow of God', 1, 1199, 0);`);

const search = "x' OR '1'='1";

const unsafe = await db.query(`SELECT title FROM books WHERE title = '${search}'`);
console.log("built with a template string:", unsafe.rows);

const safe = await db.query("SELECT title FROM books WHERE title = $1", [search]);
console.log("with a $1 parameter:", safe.rows);
await db.close();
```

Output of `npx tsx try-injection.ts`

```ts
built with a template string: [ { title: 'Things Fall Apart' }, { title: 'Arrow of God' } ]
with a $1 parameter: []
```

The "search" contains a quote. Pasted into the string, it ends the text early and adds `OR '1'='1'`, which is always true, so the query returned *every* book. That is **SQL injection**. With other input, the same trick can read the users table or delete data.

With `$1`, the SQL and the value travel to PostgreSQL **separately**. The value is only ever data, never SQL, so it matched no title at all. Every query in the BookStore uses `$1`, `$2`, … for every outside value, with no exceptions.

## Repositories

A **repository** is a class that owns one table: all the SQL for that table lives there and nowhere else. It gets the database through its constructor, the dependency injection by hand you did in [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes). It also turns database errors into your typed errors:

src/repositories/authors.tsNode.js only

```ts
import type { Queryable } from "../db.js";
import { isPgError } from "../db.js";
import { ConflictError } from "../errors.js";
import type { NewAuthor } from "../validation/bodies.js";

export interface Author {
  readonly id: number;
  readonly name: string;
}

export class AuthorRepository {
  constructor(private readonly db: Queryable) {}

  async list(): Promise<Author[]> {
    const { rows } = await this.db.query<Author>("SELECT id, name FROM authors ORDER BY id");
    return rows;
  }

  async create(author: NewAuthor): Promise<Author> {
    try {
      const { rows } = await this.db.query<Author>(
        "INSERT INTO authors (name) VALUES ($1) RETURNING id, name",
        [author.name],
      );
      return rows[0]!;
    } catch (error) {
      if (isPgError(error) && error.code === "23505") {
        throw new ConflictError(`An author called "${author.name}" already exists`);
      }
      throw error;
    }
  }
}
```

The column names in SQL are `snake_case` and the TypeScript properties are `camelCase`, so the book repository renames them with `AS "authorId"`. `$1::integer IS NULL OR author_id = $1` makes the author filter optional in a single query:

src/repositories/books.tsNode.js only

```ts
import type { Queryable } from "../db.js";
import { isPgError } from "../db.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { NewBook } from "../validation/bodies.js";

export interface Book extends NewBook {
  readonly id: number;
}

const COLUMNS = `id, title, author_id AS "authorId", price_cents AS "priceCents", stock`;

export class BookRepository {
  constructor(private readonly db: Queryable) {}

  async list(authorId?: number): Promise<Book[]> {
    const { rows } = await this.db.query<Book>(
      `SELECT ${COLUMNS} FROM books WHERE $1::integer IS NULL OR author_id = $1 ORDER BY id`,
      [authorId ?? null],
    );
    return rows;
  }

  async get(id: number): Promise<Book> {
    const { rows } = await this.db.query<Book>(`SELECT ${COLUMNS} FROM books WHERE id = $1`, [id]);
    if (rows[0] === undefined) throw new NotFoundError(`Book ${id}`);
    return rows[0];
  }

  async create(book: NewBook): Promise<Book> {
    try {
      const { rows } = await this.db.query<Book>(
        `INSERT INTO books (title, author_id, price_cents, stock) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [book.title, book.authorId, book.priceCents, book.stock],
      );
      return rows[0]!;
    } catch (error) {
      if (isPgError(error) && error.code === "23503") {
        throw new ValidationError([`authorId ${book.authorId} does not exist`]);
      }
      throw error;
    }
  }
}
```

`${COLUMNS}` is pasted into the SQL, but that is safe: it is a fixed string you wrote, never user input.

Placing an order is the tricky one. Two customers may buy the last copy at the same moment. So taking the stock and writing the order happen in **one** SQL statement, which PostgreSQL runs as a single step. `WITH taken AS (…)` gives the result of the `UPDATE` a name, `taken`, that the `INSERT` right after it can read from:

src/repositories/orders.tsNode.js only

```ts
import type { Queryable } from "../db.js";
import { ConflictError, ValidationError } from "../errors.js";
import type { NewOrder } from "../validation/bodies.js";

export interface Order extends NewOrder {
  readonly id: number;
  readonly totalCents: number;
}

const PLACE_ORDER = `
  WITH taken AS (
    UPDATE books SET stock = stock - $2
    WHERE id = $1 AND stock >= $2
    RETURNING id, price_cents
  )
  INSERT INTO orders (book_id, quantity, total_cents)
  SELECT id, $2, price_cents * $2 FROM taken
  RETURNING id, book_id AS "bookId", quantity, total_cents AS "totalCents"`;

export class OrderRepository {
  constructor(private readonly db: Queryable) {}

  async place(order: NewOrder): Promise<Order> {
    const { rows } = await this.db.query<Order>(PLACE_ORDER, [order.bookId, order.quantity]);
    if (rows[0] !== undefined) return rows[0];
    const stock = await this.db.query<{ stock: number }>("SELECT stock FROM books WHERE id = $1", [order.bookId]);
    if (stock.rows[0] === undefined) throw new ValidationError([`bookId ${order.bookId} does not exist`]);
    throw new ConflictError(`Only ${stock.rows[0].stock} left of book ${order.bookId}`);
  }

  async list(): Promise<Order[]> {
    const { rows } = await this.db.query<Order>(
      `SELECT id, book_id AS "bookId", quantity, total_cents AS "totalCents" FROM orders ORDER BY id`,
    );
    return rows;
  }
}
```

The `UPDATE` only changes the book if there is enough stock. If it changed nothing, no order is inserted and no row comes back. Only then does the code look closer, to tell "no such book" from "not enough stock". The price comes from the database, never from the client, so nobody can send their own price.

Now use all of it together, with an in-memory database, and pass every error through `toErrorResponse` to see the status the client would get:

try-data.tsNode.js only

```ts
import { openDatabase } from "./src/db.js";
import { toErrorResponse } from "./src/http/errors.js";
import { AuthorRepository } from "./src/repositories/authors.js";
import { BookRepository } from "./src/repositories/books.js";
import { OrderRepository } from "./src/repositories/orders.js";
import { parseNewAuthor, parseNewBook, parseNewOrder } from "./src/validation/bodies.js";

const db = await openDatabase();
const authors = new AuthorRepository(db);
const books = new BookRepository(db);
const orders = new OrderRepository(db);

async function attempt(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    console.log(label, "->", JSON.stringify(await action()));
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    console.log(label, "->", status, JSON.stringify(body));
  }
}

const achebe = await authors.create(parseNewAuthor({ name: "Chinua Achebe" }));
const book = await books.create(parseNewBook({ title: "Things Fall Apart", authorId: achebe.id, priceCents: 1299, stock: 3 }));

await attempt("order 2", () => orders.place(parseNewOrder({ bookId: book.id, quantity: 2 })));
await attempt("order 5 more", () => orders.place(parseNewOrder({ bookId: book.id, quantity: 5 })));
await attempt("unknown book", () => orders.place(parseNewOrder({ bookId: 99, quantity: 1 })));
await attempt("same author", () => authors.create(parseNewAuthor({ name: "Chinua Achebe" })));
await attempt("missing author", () => books.create(parseNewBook({ title: "Kindred", authorId: 7, priceCents: 1099, stock: 1 })));
await attempt("get book 42", () => books.get(42));
await attempt("stock now", async () => (await books.get(book.id)).stock);
await db.close();
```

Output of `npx tsx try-data.ts`

```ts
order 2 -> {"id":1,"bookId":1,"quantity":2,"totalCents":2598}
order 5 more -> 409 {"error":"conflict","message":"Only 1 left of book 1"}
unknown book -> 400 {"error":"validation_failed","message":"The request is not valid","issues":["bookId 99 does not exist"]}
same author -> 409 {"error":"conflict","message":"An author called \"Chinua Achebe\" already exists"}
missing author -> 400 {"error":"validation_failed","message":"The request is not valid","issues":["authorId 7 does not exist"]}
get book 42 -> 404 {"error":"not_found","message":"Book 42 not found"}
stock now -> 1
```

Read it line by line. Two copies were sold for 2 × 12.99 = 25.98. The next order wanted 5 but only 1 was left: 409. The unknown book and the unknown author were caught by the foreign keys and reported as 400. The duplicate author was caught by `UNIQUE`: 409. A missing book id in a URL is 404. And the stock really is 1.

This script takes a few seconds to start: PGlite loads a whole database engine first.

## Wire it into the server

The configuration gets one new optional setting, `DATA_DIR`: the folder where PGlite keeps its files. Without it, the data lives in memory:

src/config.tsNode.js only

```ts
export interface Config {
  readonly port: number;
  readonly dataDir: string | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env): Config {
  const raw = env["PORT"] ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be a whole number from 0 to 65535, got "${raw}"`);
  }
  return { port, dataDir: env["DATA_DIR"] };
}
```

The route files become short: parse the body, call the repository, return the result. Each `add…Routes` function now receives its repository as a parameter:

src/routes/books.tsNode.js only

```ts
import { toId } from "../http/params.js";
import type { Router } from "../http/router.js";
import type { BookRepository } from "../repositories/books.js";
import { parseNewBook } from "../validation/bodies.js";

export function addBookRoutes(router: Router, books: BookRepository): void {
  router.add("GET", "/books", async (request) => {
    const raw = request.query.get("authorId");
    const authorId = raw === null ? undefined : toId(raw, "authorId");
    return { status: 200, body: await books.list(authorId) };
  });

  router.add("GET", "/books/:id", async (request) => {
    return { status: 200, body: await books.get(toId(request.params["id"], "id")) };
  });

  router.add("POST", "/books", async (request) => {
    return { status: 201, body: await books.create(parseNewBook(request.body)) };
  });
}
```

src/routes/authors.tsNode.js only

```ts
import type { Router } from "../http/router.js";
import type { AuthorRepository } from "../repositories/authors.js";
import { parseNewAuthor } from "../validation/bodies.js";

export function addAuthorRoutes(router: Router, authors: AuthorRepository): void {
  router.add("GET", "/authors", async () => ({ status: 200, body: await authors.list() }));

  router.add("POST", "/authors", async (request) => {
    return { status: 201, body: await authors.create(parseNewAuthor(request.body)) };
  });
}
```

src/routes/orders.tsNode.js only

```ts
import type { Router } from "../http/router.js";
import type { OrderRepository } from "../repositories/orders.js";
import { parseNewOrder } from "../validation/bodies.js";

export function addOrderRoutes(router: Router, orders: OrderRepository): void {
  router.add("GET", "/orders", async () => ({ status: 200, body: await orders.list() }));

  router.add("POST", "/orders", async (request) => {
    return { status: 201, body: await orders.place(parseNewOrder(request.body)) };
  });
}
```

Somebody has to create the repositories and hand them to the routes. That happens in `createRouter`, which now takes the database:

src/routes/index.tsNode.js only

```ts
import type { Queryable } from "../db.js";
import { Router } from "../http/router.js";
import { AuthorRepository } from "../repositories/authors.js";
import { BookRepository } from "../repositories/books.js";
import { OrderRepository } from "../repositories/orders.js";
import { addAuthorRoutes } from "./authors.js";
import { addBookRoutes } from "./books.js";
import { addOrderRoutes } from "./orders.js";

export function createRouter(db: Queryable): Router {
  const router = new Router();
  addAuthorRoutes(router, new AuthorRepository(db));
  addBookRoutes(router, new BookRepository(db));
  addOrderRoutes(router, new OrderRepository(db));
  return router;
}
```

src/server.tsNode.js only

```ts
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createRouter } from "./routes/index.js";

const config = loadConfig(process.env);
const db = await openDatabase(config.dataDir);
const server = createApp(createRouter(db));

server.listen(config.port, () => {
  console.log(`BookStore API on http://localhost:${config.port}`);
});
```

Delete `src/store.ts`, check with `npm run typecheck`, and start the server with a data folder:

Terminal on your computer

```bash
$ DATA_DIR=./data npm run dev

> bookstore@1.0.0 dev
> tsx watch src/server.ts

BookStore API on http://localhost:3000
```

In a second terminal, create an author and a book, buy two copies, then try to buy two more, then send a broken book:

Terminal on your computer

```bash
$ curl -X POST http://localhost:3000/authors -H 'content-type: application/json' -d '{"name":"Chinua Achebe"}'
{"id":1,"name":"Chinua Achebe"}
$ curl -X POST http://localhost:3000/books -H 'content-type: application/json' -d '{"title":"Things Fall Apart","authorId":1,"priceCents":1299,"stock":3}'
{"id":1,"title":"Things Fall Apart","authorId":1,"priceCents":1299,"stock":3}
$ curl -X POST http://localhost:3000/orders -H 'content-type: application/json' -d '{"bookId":1,"quantity":2}'
{"id":1,"bookId":1,"quantity":2,"totalCents":2598}
$ curl -X POST http://localhost:3000/orders -H 'content-type: application/json' -d '{"bookId":1,"quantity":2}'
{"error":"conflict","message":"Only 1 left of book 1"}
$ curl -X POST http://localhost:3000/books -H 'content-type: application/json' -d '{"title":"","authorId":1}'
{"error":"validation_failed","message":"The request is not valid","issues":["title must be text of 1 to 200 characters","priceCents must be a whole number from 0 to 1000000","stock must be a whole number from 0 to 10000"]}
```

Stop the server with Ctrl + C, start it again with the same `DATA_DIR=./data npm run dev`, and ask for the books:

Terminal on your computer

```bash
$ curl http://localhost:3000/books
[{"id":1,"title":"Things Fall Apart","authorId":1,"priceCents":1299,"stock":1}]
```

The data survived the restart: it is in the `data` folder now. Add `data/` to `.gitignore`, so the database never ends up in git.

> TIP
>
> On Windows PowerShell, set the variable first with `$env:DATA_DIR = "./data"`, then run `npm run dev`.

## Point it at a real PostgreSQL

In production you run PostgreSQL as its own server. The popular Node.js driver for it is `pg`. Because every repository only needs a `Queryable`, switching is one new file. Install the driver and its types:

Terminal on your computer

```bash
$ npm install pg

added 14 packages, and audited 23 packages in 3s

found 0 vulnerabilities
…
$ npm install -D @types/pg

added 1 package, and audited 24 packages in 5s

found 0 vulnerabilities
…
```

A **pool** keeps a few open connections to the server and lends one to each query. This function wraps it in the `Queryable` shape and runs the same migrations:

src/postgres.tsNode.js only

```ts
import pg from "pg";

import type { Queryable } from "./db.js";
import { migrate } from "./db.js";

export async function connectPostgres(connectionString: string): Promise<Queryable> {
  const pool = new pg.Pool({ connectionString });
  const db: Queryable = {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
  await migrate(db);
  return db;
}
```

The server address, user and password arrive as one **connection string** in the `DATABASE_URL` environment variable, never in the code. Add `databaseUrl: env["DATABASE_URL"]` to `Config` the same way as `dataDir`, and choose the database in `server.ts`:

src/server.tsNode.js only

```ts
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { connectPostgres } from "./postgres.js";
import { createRouter } from "./routes/index.js";

const config = loadConfig(process.env);
const db = config.databaseUrl === undefined
  ? await openDatabase(config.dataDir)
  : await connectPostgres(config.databaseUrl);
const server = createApp(createRouter(db));

server.listen(config.port, () => {
  console.log(`BookStore API on http://localhost:${config.port}`);
});
```

To try it, you need a PostgreSQL server. The easiest way is Docker. The first command makes up a random password and keeps it in a variable, so it never appears in a file. The server listens on port 5440 of your computer, so it cannot clash with a PostgreSQL you may already have:

Terminal on your computer

```bash
$ export DB_PASSWORD=$(node -p "require('node:crypto').randomBytes(16).toString('hex')")
$ docker run --name bookstore-db -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=bookstore -p 5440:5432 -d postgres:17-alpine
2f849fbaddbbca37c0d4318e357fb617868e65defdd6c1d82b87a67af1f26491
$ export DATABASE_URL="postgres://postgres:$DB_PASSWORD@localhost:5440/bookstore"
$ npm run dev

> bookstore@1.0.0 dev
> tsx watch src/server.ts

BookStore API on http://localhost:3000
```

The long line is the new container's id; the first time, Docker also downloads the image and shows its progress. In a second terminal (set `DATABASE_URL` there too), talk to the API and then look straight into PostgreSQL with `psql`:

Terminal on your computer

```bash
$ curl -X POST http://localhost:3000/authors -H 'content-type: application/json' -d '{"name":"Chinua Achebe"}'
{"id":1,"name":"Chinua Achebe"}
$ curl http://localhost:3000/authors
[{"id":1,"name":"Chinua Achebe"}]
$ psql "$DATABASE_URL" -c 'SELECT * FROM authors'
 id |     name
----+---------------
  1 | Chinua Achebe
(1 row)
```

Not a single repository changed. When you are done, `docker rm -f bookstore-db` stops and deletes the container, with its data.

> KEEP CONNECTION STRINGS SECRET
>
> A `DATABASE_URL` contains the password. Never commit it, never log it, and never put it in an error message. Set it in the environment of the server, as you did here.

## Practice

TRY IT YOURSELF

### One order by id

Add a `get(id)` method for orders that throws `NotFoundError` when the order does not exist, like `BookRepository.get`. Try it on an order that exists and on one that does not.

**Show a solution**

Add the method to `OrderRepository`. Here it is as a function so you can run it:

try-order-get.tsNode.js only

```ts
import type { Queryable } from "./src/db.js";
import { openDatabase } from "./src/db.js";
import { NotFoundError } from "./src/errors.js";
import type { Order } from "./src/repositories/orders.js";

async function getOrder(db: Queryable, id: number): Promise<Order> {
  const { rows } = await db.query<Order>(
    `SELECT id, book_id AS "bookId", quantity, total_cents AS "totalCents" FROM orders WHERE id = $1`,
    [id],
  );
  if (rows[0] === undefined) throw new NotFoundError(`Order ${id}`);
  return rows[0];
}

const db = await openDatabase();
await db.exec(`INSERT INTO authors (name) VALUES ('Chinua Achebe');
  INSERT INTO books (title, author_id, price_cents, stock) VALUES ('Things Fall Apart', 1, 1299, 3);
  INSERT INTO orders (book_id, quantity, total_cents) VALUES (1, 1, 1299);`);

console.log(await getOrder(db, 1));
try {
  await getOrder(db, 2);
} catch (error) {
  if (error instanceof NotFoundError) console.log(error.name, error.message);
}
await db.close();
```

Output of `npx tsx try-order-get.ts`

```json
{ id: 1, bookId: 1, quantity: 1, totalCents: 1299 }
NotFoundError Order 2 not found
```

TRY IT YOURSELF

### Deleting an author who has books

What should happen when a client deletes an author who still has books? Write an `AuthorRepository`-style `remove(id)` that turns the foreign key error `23503` into a `ConflictError`.

**Show a solution**

try-remove-author.tsNode.js only

```ts
import type { Queryable } from "./src/db.js";
import { isPgError, openDatabase } from "./src/db.js";
import { ConflictError, NotFoundError } from "./src/errors.js";
import { toErrorResponse } from "./src/http/errors.js";

async function removeAuthor(db: Queryable, id: number): Promise<void> {
  try {
    const { rows } = await db.query("DELETE FROM authors WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) throw new NotFoundError(`Author ${id}`);
  } catch (error) {
    if (isPgError(error) && error.code === "23503") {
      throw new ConflictError(`Author ${id} still has books`);
    }
    throw error;
  }
}

const db = await openDatabase();
await db.exec(`INSERT INTO authors (name) VALUES ('Chinua Achebe'), ('Nobody Yet');
  INSERT INTO books (title, author_id, price_cents, stock) VALUES ('Things Fall Apart', 1, 1299, 3);`);

for (const id of [1, 2, 2]) {
  try {
    await removeAuthor(db, id);
    console.log(id, "deleted");
  } catch (error) {
    console.log(id, toErrorResponse(error));
  }
}
await db.close();
```

Output of `npx tsx try-remove-author.ts`

```ts
1 {
  status: 409,
  body: { error: 'conflict', message: 'Author 1 still has books' }
}
2 deleted
2 {
  status: 404,
  body: { error: 'not_found', message: 'Author 2 not found' }
}
```

The foreign key refused to leave books without an author, and the client learns why with a 409. Deleting author 2 worked once; the second time there was nothing to delete.

## Recap

- Typed errors (`ValidationError`, `NotFoundError`, `ConflictError`) say what went wrong. One function in the HTTP layer maps them to 400, 404 and 409.
- Every body is checked by type guards that return a new, typed object with only the known fields, and report every problem at once.
- PGlite is real PostgreSQL inside your process. Foreign keys, `UNIQUE` and `CHECK` make the database protect its own data.
- Repositories own the SQL. Every outside value goes in as a `$1` parameter, which makes SQL injection impossible.
- Because the code depends on a small `Queryable` interface, moving to a PostgreSQL server with `pg` and `DATABASE_URL` is one new file.

Anyone can still place an order for anyone. Next, the BookStore gets users, passwords, log-in tokens and tests.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
