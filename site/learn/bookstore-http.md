---
title: "\"BookStore API: HTTP and routing\" — ZudoJS Academy"
description: "Start a TypeScript backend with no framework: a project folder, checked configuration, a typed router, JSON helpers and error responses for books and authors."
source: https://zudojs.oyinlola.site/learn/bookstore-http
---

LEVEL 7 · LESSON 8 OF 15

TypeScript on the server Core

# "BookStore API: HTTP and routing"

Start a TypeScript backend with no framework: a project folder, checked configuration, a typed router, JSON helpers and error responses for books and authors.

- **45 min** to read and try
- **You need:** TypeScript on Node.js, HTTP in depth and Designing a REST API
- **You build:** A BookStore API on node:http and tsx that serves authors and books as JSON

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Set up a TypeScript backend project with tsx, @types/node and a strict tsconfig
- Load and check configuration from the environment once, and fail fast on a bad value
- Write a typed router that tells 404 from 405 with a discriminated union
- Read JSON bodies with a size limit and turn every failure into a status code and a JSON body
- Keep node:http at the edge, so handlers take and return plain, testable objects

## The project

For the next three lessons you build one backend from scratch: a **BookStore API**. It is written in TypeScript, and it uses no framework, only Node.js itself. In [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) you wrote a small server in plain JavaScript, and in [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node) you learned what Node's types promise and how to narrow them. Here those pieces come together in a bigger server, split into files the way a real project is.

The API has four **resources**, the "things" a REST API is about (you designed URLs like these in [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design)):

| Resource | Routes | Built in |
| --- | --- | --- |
| authors | `GET /authors`, `POST /authors` | this lesson |
| books | `GET /books`, `GET /books/:id`, `POST /books` | this lesson (`POST` in the next) |
| orders | `GET /orders`, `POST /orders` | [BookStore API: validation and PostgreSQL](https://zudojs.oyinlola.site/learn/bookstore-data) |
| users | `POST /users`, `POST /sessions` (log in) | [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth) |

Why no framework? Because you will write, by hand, every job a framework does for you. At the end of the third lesson you will look back at the code and list what hurts. [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers) then refactors the BookStore into typed layers, which fixes part of that list. The rest of the list is the reason frameworks, and ZudoJS, exist.

## Set up the folder

Create a folder, a `package.json`, and install the TypeScript tools you met in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup):

Terminal on your computer

```bash
$ mkdir bookstore
$ cd bookstore
$ npm init -y
Wrote to ~/bookstore/package.json:
…
$ npm pkg set type=module
$ npm install -D typescript tsx @types/node@24

added 7 packages, and audited 8 packages in 7s

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

`npm pkg set type=module` tells Node.js that the `.js` files are ES modules, so `import` works. The esbuild warning is harmless; you saw it in [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages). `@types/node@24` pins Node's types to the Node.js version you run, as [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node#types-node) recommended. Now open `package.json` and give it three scripts. Your version numbers may be higher:

package.json

```json
{
  "name": "bookstore",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^24.13.6",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2"
  }
}
```

And the same `tsconfig.json` as in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup), with `strict` on:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true
  }
}
```

By the end of this lesson the folder looks like this. Each folder holds one kind of code, so you always know where to look:

```ts
bookstore/
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts         starts everything
    ├── app.ts            connects node:http to the router
    ├── config.ts         reads settings from the environment
    ├── store.ts          the data (in memory for now)
    ├── http/             code that knows about HTTP
    │   ├── types.ts
    │   ├── router.ts
    │   ├── errors.ts
    │   ├── json.ts
    │   └── params.ts
    └── routes/           one file per resource
        ├── authors.ts
        ├── books.ts
        └── index.ts
```

## Configuration from the environment

**Configuration** is every value that can change between your laptop and a server: the port, the database, secrets. You never write those into the code. They come from **environment variables**, which Node.js gives you in `process.env`.

Environment variables are always strings, or missing. So, as in [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node#env), one module reads them, checks them once at startup, and turns them into a typed object. Everything else uses that object. The BookStore needs only a port for now:

src/config.ts

```ts
export interface Config {
  readonly port: number;
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env): Config {
  const raw = env["PORT"] ?? "3000";
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port > 65535) {
    throw new Error(`PORT must be a whole number from 0 to 65535, got "${raw}"`);
  }
  return { port };
}
```

`loadConfig` takes the environment as a **parameter** instead of reading `process.env` itself. The server will pass `process.env`; a test can pass any object it likes. Try it:

try-config.ts

```ts
import { loadConfig } from "./src/config.js";

console.log(loadConfig({}));
console.log(loadConfig({ PORT: "8080" }));

try {
  loadConfig({ PORT: "eighty" });
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx try-config.ts` and of the browser terminal

```json
{ port: 3000 }
{ port: 8080 }
PORT must be a whole number from 0 to 65535, got "eighty"
```

No `PORT` means the default, 3000. A bad value stops the program with a clear message. The pattern `/^\d{1,5}$/` accepts only digits, because `Number()` alone would also accept `""`, `" 80"` and `"8e3"`. This is called **failing fast**: better to refuse to start than to start with a broken setting and fail later in a confusing way.

## Requests and responses as plain data

The node:http `request` and `response` objects are big and awkward to test. So the BookStore turns each request into a small plain object, and each **handler** (the function that answers one route) returns a small plain object. Only one file, later, talks to node:http.

src/http/types.ts

```ts
export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body?: unknown;
}

export type Handler = (request: ApiRequest) => ApiResponse | Promise<ApiResponse>;
```

- `params` holds the parts of the path that vary, such as the `7` in `/books/7`.
- `query` holds the part after `?`, such as `?authorId=2`. `URLSearchParams` is built into Node.js and browsers.
- `body` is `unknown`, on purpose. It comes from outside, so nothing about it is trusted until it is checked ([TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime)).
- A `Handler` may be `async`, so it may return the response or a `Promise` of it.

## A tiny typed router

A **router** picks the handler for a request from its method and path. You register routes with a **pattern**: `/books/:id` means "`/books/` followed by anything, and call that anything `id`".

src/http/router.ts

```ts
import type { Handler } from "./types.js";

interface Route {
  readonly method: string;
  readonly parts: readonly string[];
  readonly handler: Handler;
}

export type Match =
  | { readonly kind: "found"; readonly handler: Handler; readonly params: Record<string, string> }
  | { readonly kind: "wrong-method"; readonly allowed: readonly string[] }
  | { readonly kind: "not-found" };

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, parts: splitPath(pattern), handler });
    return this;
  }

  match(method: string, path: string): Match {
    const parts = splitPath(path);
    const allowed: string[] = [];
    for (const route of this.routes) {
      const params = matchParts(route.parts, parts);
      if (params === undefined) continue;
      if (route.method === method) return { kind: "found", handler: route.handler, params };
      allowed.push(route.method);
    }
    return allowed.length > 0 ? { kind: "wrong-method", allowed } : { kind: "not-found" };
  }
}

function splitPath(path: string): string[] {
  return path.split("/").filter((part) => part !== "");
}

function matchParts(pattern: readonly string[], parts: readonly string[]) {
  if (pattern.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, want] of pattern.entries()) {
    const got = parts[i]!;
    if (want.startsWith(":")) params[want.slice(1)] = got;
    else if (want !== got) return undefined;
  }
  return params;
}
```

How it works:

- `splitPath("/books/7")` gives `["books", "7"]`. A pattern and a path match when they have the same number of parts and every fixed part is equal. A part starting with `:` matches anything and is saved in `params`.
- `add` returns `this`, the router itself, so you can chain `.add(…).add(…)`.
- `match` returns a **discriminated union** ([Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects)) with three cases. "The path exists but not for this method" is different from "the path does not exist": HTTP answers the first with **405 Method Not Allowed** and the second with **404 Not Found**.

The router knows nothing about node:http, so you can try it directly:

try-router.ts

```ts
import { Router } from "./src/http/router.js";

const router = new Router()
  .add("GET", "/books", () => ({ status: 200, body: "every book" }))
  .add("GET", "/books/:id", (request) => ({ status: 200, body: `book ${request.params["id"]}` }));

const tries: [string, string][] = [
  ["GET", "/books"],
  ["GET", "/books/7"],
  ["DELETE", "/books/7"],
  ["GET", "/authors"],
];

for (const [method, path] of tries) {
  const match = router.match(method, path);
  if (match.kind === "found") console.log(method, path, "found", match.params);
  if (match.kind === "wrong-method") console.log(method, path, "wrong method, allowed:", match.allowed);
  if (match.kind === "not-found") console.log(method, path, "not found");
}
```

Output of `npx tsx try-router.ts` and of the browser terminal

```ts
GET /books found {}
GET /books/7 found { id: '7' }
DELETE /books/7 wrong method, allowed: [ 'GET' ]
GET /authors not found
```

Inside each `if`, TypeScript knows which case it has: `match.params` only exists when `kind` is `"found"`, and `match.allowed` only when it is `"wrong-method"`.

## Errors and JSON

REASON IT OUT

### Which errors may the client see?

A request can fail in very different ways. For each one, decide what the client should receive, and what only the server's log should see:

- The client asks for `/books/99`, and there is no book 99.
- The client sends `{"name": 42}` to `POST /authors`.
- A handler has a bug and reads a property of `undefined`.
- Later, the database refuses a query, and its error message contains the table name and part of the SQL.

**Show the reasoning**

The first two are **expected** failures: your code detected them on purpose. The client caused them and can fix them, so it gets a specific status (404, 400) and a message written for it.

The last two are **unexpected**: bugs or broken infrastructure. The client cannot fix them, and the details (a stack trace, a table name, a piece of SQL) tell an attacker how your code is built. The client gets a plain 500 with a generic message; the full error goes to the server's log, where you can read it.

So the code needs a way to tell the two apart. Errors you throw on purpose get their own class; anything else is treated as a bug.

Every answer, even a failure, is a status code and a JSON body. An `HttpError` carries both, so any code can `throw` one and one function turns it into a response:

src/http/errors.tsNode.js only

```ts
import type { ApiResponse } from "./types.js";

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

export function toErrorResponse(error: unknown): ApiResponse {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  console.error(error);
  return { status: 500, body: { error: "internal_error", message: "Something went wrong" } };
}
```

An `HttpError` is an error you threw on purpose, so its message is safe to show the client. Anything else is a bug. The bug is written to the server's log with `console.error`, and the client gets a plain 500 with no details. You never send a stack trace to the outside world: it tells an attacker how your code is built.

The second file reads a JSON body from a request and writes a JSON response. This is the only code that deals with bytes:

src/http/json.tsNode.js only

```ts
import type { IncomingMessage, ServerResponse } from "node:http";

import { HttpError } from "./errors.js";
import type { ApiResponse } from "./types.js";

const MAX_BODY_BYTES = 100_000;

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    if (!Buffer.isBuffer(chunk)) throw new TypeError("expected the body as bytes");
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "The body is too large");
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "not_json", "Send JSON with Content-Type: application/json");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "The body is not valid JSON");
  }
}

export function sendJson(response: ServerResponse, result: ApiResponse): void {
  const text = result.body === undefined ? "" : JSON.stringify(result.body);
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}
```

Three safety checks hide in `readJson`, and each has its own status code ([HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep) lists them):

- **413 Content Too Large**: it stops reading after 100,000 bytes. Without a limit, one client could send gigabytes and fill your server's memory.
- **415 Unsupported Media Type**: a body that is not labelled as JSON is refused.
- **400 Bad Request**: `JSON.parse` throws on broken JSON, and that becomes a clear error instead of a crash.

A request stream gives `Buffer` chunks, but its type says `any`. `Buffer.isBuffer` proves it instead of claiming it with `as`, exactly as `readBody` did in [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node#http). If it ever fails, that is a bug in the server, so it throws a plain `TypeError`, which becomes a 500.

## Routes for authors and books

For now the data lives in memory. `Table` is a small generic class, like the repository in [Generics](https://zudojs.oyinlola.site/learn/ts-generics). The next lesson replaces it with a real PostgreSQL database.

src/store.tsNode.js only

```ts
export interface Author {
  readonly id: number;
  readonly name: string;
}

export interface Book {
  readonly id: number;
  readonly title: string;
  readonly authorId: number;
  readonly priceCents: number;
}

export class Table<T extends { readonly id: number }> {
  private readonly rows = new Map<number, T>();
  private lastId = 0;

  newId(): number {
    this.lastId += 1;
    return this.lastId;
  }

  all(): T[] {
    return [...this.rows.values()];
  }

  get(id: number): T | undefined {
    return this.rows.get(id);
  }

  save(row: T): T {
    this.rows.set(row.id, row);
    return row;
  }
}

export const authors = new Table<Author>();
export const books = new Table<Book>();

authors.save({ id: authors.newId(), name: "Chinua Achebe" });
authors.save({ id: authors.newId(), name: "Ursula K. Le Guin" });
books.save({ id: books.newId(), title: "Things Fall Apart", authorId: 1, priceCents: 1299 });
books.save({ id: books.newId(), title: "A Wizard of Earthsea", authorId: 2, priceCents: 999 });
```

Prices are whole **cents** (`1299` is 12.99), never decimals: `0.1 + 0.2` is not exactly `0.3` in JavaScript, and money must add up exactly.

Every id in a URL arrives as a string, and could be `"abc"` or `"-5"`. One helper turns it into a safe number or answers 400:

src/http/params.tsNode.js only

```ts
import { HttpError } from "./errors.js";

const MAX_ID = 2_147_483_647;

export function toId(raw: string | undefined, name: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > MAX_ID) {
    throw new HttpError(400, "invalid_id", `${name} must be a whole number from 1 to ${MAX_ID}`);
  }
  return id;
}
```

The upper limit is the largest `integer` PostgreSQL can store. Checking it now saves a confusing database error later.

Now the routes. Each resource gets a file with one function that adds its routes to the router:

src/routes/books.tsNode.js only

```ts
import { HttpError } from "../http/errors.js";
import { toId } from "../http/params.js";
import type { Router } from "../http/router.js";
import { books } from "../store.js";

export function addBookRoutes(router: Router): void {
  router.add("GET", "/books", (request) => {
    const raw = request.query.get("authorId");
    const authorId = raw === null ? undefined : toId(raw, "authorId");
    const list = books.all().filter((book) => authorId === undefined || book.authorId === authorId);
    return { status: 200, body: list };
  });

  router.add("GET", "/books/:id", (request) => {
    const book = books.get(toId(request.params["id"], "id"));
    if (book === undefined) throw new HttpError(404, "not_found", "Book not found");
    return { status: 200, body: book };
  });
}
```

`POST /authors` reads a body. The body is `unknown`, so the handler narrows it step by step with `typeof` and `in`, exactly as in [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime), before it touches `body.name`:

src/routes/authors.tsNode.js only

```ts
import { HttpError } from "../http/errors.js";
import type { Router } from "../http/router.js";
import { authors } from "../store.js";

export function addAuthorRoutes(router: Router): void {
  router.add("GET", "/authors", () => ({ status: 200, body: authors.all() }));

  router.add("POST", "/authors", (request) => {
    const body = request.body;
    if (typeof body !== "object" || body === null || !("name" in body)) {
      throw new HttpError(400, "invalid_body", "Send an object with a name");
    }
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new HttpError(400, "invalid_body", "name must be a non-empty string");
    }
    const author = authors.save({ id: authors.newId(), name: body.name.trim() });
    return { status: 201, body: author };
  });
}
```

**201 Created** is the status for "I made a new thing". One last file builds the whole router:

src/routes/index.tsNode.js only

```ts
import { Router } from "../http/router.js";
import { addAuthorRoutes } from "./authors.js";
import { addBookRoutes } from "./books.js";

export function createRouter(): Router {
  const router = new Router();
  addAuthorRoutes(router);
  addBookRoutes(router);
  return router;
}
```

## Put it on the network

`app.ts` is the bridge between node:http and everything you wrote. For each request it finds the route, reads the body, builds an `ApiRequest`, calls the handler and sends the result. One `try`/`catch` turns every thrown error into a response, so a handler never has to:

src/app.tsNode.js only

```ts
import { createServer } from "node:http";
import type { Server } from "node:http";

import { HttpError, toErrorResponse } from "./http/errors.js";
import { readJson, sendJson } from "./http/json.js";
import type { Router } from "./http/router.js";

export function createApp(router: Router): Server {
  return createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const match = router.match(method, url.pathname);
      if (match.kind === "not-found") {
        throw new HttpError(404, "not_found", `Nothing at ${url.pathname}`);
      }
      if (match.kind === "wrong-method") {
        throw new HttpError(405, "method_not_allowed", `Use ${match.allowed.join(" or ")}`);
      }
      const body = await readJson(req);
      const request = { method, path: url.pathname, params: match.params, query: url.searchParams, headers: req.headers, body };
      sendJson(res, await match.handler(request));
    } catch (error) {
      sendJson(res, toErrorResponse(error));
    }
  });
}
```

`new URL(req.url, "http://localhost")` splits `/books?authorId=2` into a `pathname` and `searchParams`. The second argument is only there because `req.url` has no host.

And the entry point, the file you run. It is short on purpose: read the configuration, build the app, listen.

src/server.tsNode.js only

```ts
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRouter } from "./routes/index.js";

const config = loadConfig(process.env);
const server = createApp(createRouter());

server.listen(config.port, () => {
  console.log(`BookStore API on http://localhost:${config.port}`);
});
```

To check the whole thing, this script starts the app on **port 0**, which means "any free port, you choose". Then it sends real requests with `fetch`, prints the answers, and closes the server. `server.address()` can return `null` or a string as well as a port ([TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node#http)), so the script checks before it reads `port`:

try-server.tsNode.js only

```ts
import { once } from "node:events";

import { createApp } from "./src/app.js";
import { createRouter } from "./src/routes/index.js";

const server = createApp(createRouter()).listen(0);
await once(server, "listening");
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const { port } = address;

async function call(method: string, path: string, body?: unknown): Promise<void> {
  const response = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  console.log(method, path, response.status, await response.text());
}

await call("GET", "/books?authorId=2");
await call("GET", "/books/1");
await call("GET", "/books/99");
await call("GET", "/books/abc");
await call("POST", "/authors", { name: "  Octavia E. Butler " });
await call("POST", "/authors", { name: 42 });
await call("DELETE", "/books/1");
await call("GET", "/orders");
server.close();
```

Output of `npx tsx try-server.ts`

```ts
GET /books?authorId=2 200 [{"id":2,"title":"A Wizard of Earthsea","authorId":2,"priceCents":999}]
GET /books/1 200 {"id":1,"title":"Things Fall Apart","authorId":1,"priceCents":1299}
GET /books/99 404 {"error":"not_found","message":"Book not found"}
GET /books/abc 400 {"error":"invalid_id","message":"id must be a whole number from 1 to 2147483647"}
POST /authors 201 {"id":3,"name":"Octavia E. Butler"}
POST /authors 400 {"error":"invalid_body","message":"name must be a non-empty string"}
DELETE /books/1 405 {"error":"method_not_allowed","message":"Use GET"}
GET /orders 404 {"error":"not_found","message":"Nothing at /orders"}
```

Every line is a status code and a JSON body. The router gave 405 and 404, `toId` gave 400, the handlers gave 200, 201 and their own 404 and 400. The author's name came back trimmed, and got the next id, 3.

Now run it for real. In one terminal:

Terminal on your computer

```bash
$ npm run dev

> bookstore@1.0.0 dev
> tsx watch src/server.ts

BookStore API on http://localhost:3000
```

In a second terminal, ask it for a book, create an author, and send a body that is not JSON:

Terminal on your computer

```bash
$ curl -i http://localhost:3000/books/1
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 67
Date: Wed, 23 Sep 2026 13:43:09 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":1,"title":"Things Fall Apart","authorId":1,"priceCents":1299}
$ curl -X POST http://localhost:3000/authors -H 'content-type: application/json' -d '{"name":"Octavia E. Butler"}'
{"id":3,"name":"Octavia E. Butler"}
$ curl -X POST http://localhost:3000/authors -d 'name=Octavia'
{"error":"not_json","message":"Send JSON with Content-Type: application/json"}
```

The last request has no JSON content type (curl's `-d` sends a form by default), so `readJson` refused it with 415. Stop the server with Ctrl + C. It forgets the new author, because the data only lives in memory.

> TIP
>
> On Windows PowerShell, type `curl.exe` instead of `curl`, and use double quotes outside and `\"` inside the JSON.

## Practice

TRY IT YOURSELF

### One author by id

Add `GET /authors/:id`. It answers 200 with the author, 404 when there is none, and 400 for an id like `abc`. Check it with a script that starts the server on port 0.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Reuse `toId`, exactly as `books.ts` does for `/books/:id`: `authors.get(toId(request.params["id"], "id"))`.

HINT 2

When the lookup gives `undefined`: `throw new HttpError(404, "not_found", "Author not found")`. Otherwise: `return { status: 200, body: author }`. `toId` already handles the 400 case.

SOLUTION

Add this route inside `addAuthorRoutes`, and import `toId` from `../http/params.js`. Here it is in its own file so you can run it:

try-author-by-id.tsNode.js only

```ts
import { once } from "node:events";

import { createApp } from "./src/app.js";
import { HttpError } from "./src/http/errors.js";
import { toId } from "./src/http/params.js";
import { createRouter } from "./src/routes/index.js";
import { authors } from "./src/store.js";

const router = createRouter().add("GET", "/authors/:id", (request) => {
  const author = authors.get(toId(request.params["id"], "id"));
  if (author === undefined) throw new HttpError(404, "not_found", "Author not found");
  return { status: 200, body: author };
});

const server = createApp(router).listen(0);
await once(server, "listening");
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const { port } = address;
for (const path of ["/authors/2", "/authors/9", "/authors/abc"]) {
  const response = await fetch(`http://localhost:${port}${path}`);
  console.log(path, response.status, await response.text());
}
server.close();
```

Output of `npx tsx try-author-by-id.ts`

```ts
/authors/2 200 {"id":2,"name":"Ursula K. Le Guin"}
/authors/9 404 {"error":"not_found","message":"Author not found"}
/authors/abc 400 {"error":"invalid_id","message":"id must be a whole number from 1 to 2147483647"}
```

TRY IT YOURSELF

### A bad PORT

Start the server with `PORT=eighty npm start`. What happens, and why is that better than starting on port 3000 anyway?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Look at `loadConfig` in `src/config.ts`: what does it do with a `PORT` value it cannot parse?

HINT 2

Compare "the server refuses to start, loudly" with "the server starts anyway, quietly, on a port nobody asked for". Which failure is easier to notice?

SOLUTION

Terminal on your computer

```bash
$ PORT=eighty npm start

> bookstore@1.0.0 start
> tsx src/server.ts

~/bookstore/src/config.ts:11
    throw new Error(`PORT must be a whole number from 0 to 65535, got "${raw}"`);
          ^

Error: PORT must be a whole number from 0 to 65535, got "eighty"
    at loadConfig (~/bookstore/src/config.ts:11:11)
    at <anonymous> (~/bookstore/src/server.ts:5:16)
…
Node.js v24.19.0
```

The server refuses to start and says exactly which setting is wrong. If it quietly used 3000 instead, the person who set `PORT` would think their app was on port 80 and waste time finding out why nothing answers there.

## Recap

- A TypeScript backend with no framework needs `typescript`, `tsx` and `@types/node`, a `tsconfig.json` and a folder per kind of code.
- `config.ts` reads environment variables once, checks them and fails fast.
- Handlers take a plain `ApiRequest` and return a plain `ApiResponse`. Only `app.ts` and `json.ts` know about node:http.
- The router matches method and path patterns like `/books/:id`, and tells 404 apart from 405.
- Every failure is a status code and a JSON body. Bodies are size-limited and must be JSON. Unknown errors become a generic 500.

Next: [BookStore API: validation and PostgreSQL](https://zudojs.oyinlola.site/learn/bookstore-data), where the data moves into PostgreSQL and every request body gets checked properly.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
