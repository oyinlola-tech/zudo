---
title: "Build a plain Node.js Task API — ZudoJS Academy"
description: "Build a complete Task API with no framework: modules, middleware, central error handling, an API key and checked configuration, then see what hurts as it grows."
source: https://zudojs.oyinlola.site/learn/node-task-api
---

LEVEL 4 · LESSON 9 OF 21

HTTP without a framework Core

# Build a plain Node.js Task API

Build a complete Task API with no framework: modules, middleware, central error handling, an API key and checked configuration, then see what hurts as it grows.

- **50 min** to read and try
- **You need:** An HTTP server with no framework, Events, processes and workers, and Cryptography with node:crypto
- **You build:** A multi-file Task API with create, read, update and delete, run with npm start and tested with fetch and curl

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Chain middleware with compose and predict the order it runs in, including a middleware that stops the chain
- Turn every error into a response in one place, without leaking internal details in a 500
- Split an API into modules for configuration, errors, storage, routing, middleware and startup
- Protect routes with an API key compared in constant time, and accept only the fields a route expects
- Start and stop the server cleanly, and name the pieces that become hard to maintain as the API grows

## What you will build

In [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) you built a small server in one file. Now you will turn it into a complete **Task API**, still with nothing but Node.js, organised the way a real project is. It will:

- create, read, update and delete tasks (**CRUD**): `GET /tasks`, `POST /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, plus `GET /health` to check the server is up;
- run every request through **middleware**: logging, security headers and an API key check;
- handle every error in **one place**: 400 for bad input, 404 for unknown things, and a 500 that never shows the client your stack trace;
- read its port and API key from the environment, and refuse to start without a valid key;
- shut down cleanly when it is told to stop.

Two ideas come first, on their own, because they are the heart of every backend framework: middleware and centralized error handling.

## Middleware: a chain of functions

Some work has to happen for *every* request: write a log line, add security headers, check who is calling. Copying that into every route would be a mess. Instead, each job becomes a **middleware**: a function that receives the request's **context** (an object holding everything about this request) and a function called `next`. It can do something, call `next()` to pass the request down the chain, and do something else when the rest of the chain has finished. Or it can stop the chain by not calling `next` at all.

`compose` connects a list of middleware to the final handler. This is plain JavaScript, so you can run it in the browser:

compose.js

```ts
function compose(middlewares, handler) {
  return function run(ctx, index = 0) {
    if (index === middlewares.length) return handler(ctx);
    return middlewares[index](ctx, () => run(ctx, index + 1));
  };
}

const timing = async (ctx, next) => {
  console.log("timing: before");
  await next();
  console.log("timing: after, status", ctx.status);
};

const auth = async (ctx, next) => {
  if (ctx.user !== "ada") {
    ctx.status = 401;
    console.log("auth: stopped the chain");
    return;
  }
  console.log("auth: ok");
  await next();
};

const app = compose([timing, auth], async (ctx) => {
  console.log("handler: runs last");
  ctx.status = 200;
});

await app({ user: "ada" });
console.log("---");
await app({ user: "mallory" });
```

Output of `node compose.js` and of the browser terminal

```ts
timing: before
auth: ok
handler: runs last
timing: after, status 200
---
timing: before
auth: stopped the chain
timing: after, status 401
```

Follow the first request: `timing` runs its "before" part, calls `next`, which runs `auth`, which calls `next`, which runs the handler. Then control comes back up the chain, and `timing` sees the final status. In the second request, `auth` never called `next`, so the handler never ran. That is how an authentication check protects every route behind it.

Order matters: middleware runs in the order you list it. The logger goes first so it sees everything, including requests that `auth` rejects.

## Errors in one place

In the last lesson, every route sent its own error responses. With 50 routes, one of them will get it wrong, and a mistake in a 500 response can leak your file paths, database names or stack traces to anyone. The fix: routes **throw**, and one place turns errors into responses. You learned about custom error classes in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors); here the class carries an HTTP status:

error-handler.js

```ts
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function toResponse(error) {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message } };
  }
  console.log("[server log only]", error.message);
  return { status: 500, body: { error: "Internal Server Error" } };
}

console.log(toResponse(new HttpError(404, "Task 9 not found")));
console.log(toResponse(new HttpError(400, "title must not be empty")));
console.log(toResponse(new Error("connect ECONNREFUSED 10.0.3.7:5432 (db password rejected)")));
```

Output of `node error-handler.js` and of the browser terminal

```json
{ status: 404, body: { error: 'Task 9 not found' } }
{ status: 400, body: { error: 'title must not be empty' } }
[server log only] connect ECONNREFUSED 10.0.3.7:5432 (db password rejected)
{ status: 500, body: { error: 'Internal Server Error' } }
```

An `HttpError` is an error you threw on purpose, with a message written for the client. Anything else is a bug or an outage: its details go to your server's log, where you can read them, and the client only learns that something went wrong. The third error shows why: it contains an internal address and a hint about a database password.

## The project layout

Now the real project. Make a new folder, `plain-api`, with this structure. Each file has one job:

```ts
plain-api/
├── package.json
├── .env              (not committed)
├── demo.js           tries every route
└── src/
    ├── config.js     reads and checks the environment
    ├── errors.js     HttpError
    ├── store.js      keeps the tasks in memory
    ├── body.js       reads a JSON request body
    ├── router.js     matches method + path to a handler
    ├── middleware.js compose, logging, headers, API key
    ├── app.js        wires it all together
    └── server.js     starts and stops the HTTP server
```

package.json

```json
{
  "name": "plain-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --env-file-if-exists=.env src/server.js",
    "dev": "node --watch --env-file-if-exists=.env src/server.js",
    "demo": "node demo.js"
  }
}
```

There are no dependencies: everything comes from Node.js. `"private": true` makes sure it is never published by accident, as you saw in [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages#workspaces).

## Configuration from the environment

`loadConfig` receives the environment as a parameter instead of reading `process.env` itself. The server passes `process.env`; a test can pass a plain object. It collects every problem, so you fix them all at once instead of one per restart:

src/config.jsNode.js only

```ts
export function loadConfig(env) {
  const problems = [];

  const portText = env.PORT ?? "3000";
  const port = Number(portText);
  if (!/^[0-9]{1,5}$/.test(portText) || port > 65535) {
    problems.push(`PORT must be a whole number from 0 to 65535, got "${portText}"`);
  }

  const apiKey = env.TASKS_API_KEY ?? "";
  if (apiKey.length < 32) {
    problems.push("TASKS_API_KEY must be set, at least 32 characters long");
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  return Object.freeze({ port, apiKey });
}
```

check-config.jsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { loadConfig } from "./src/config.js";

try {
  loadConfig({ PORT: "eighty" });
} catch (error) {
  console.log(error.message);
}

const config = loadConfig({ TASKS_API_KEY: randomBytes(20).toString("hex") });
console.log("port:", config.port, "key length:", config.apiKey.length);
```

Output of `node check-config.js`

```ts
Invalid configuration:
  PORT must be a whole number from 0 to 65535, got "eighty"
  TASKS_API_KEY must be set, at least 32 characters long
port: 3000 key length: 40
```

The error message names the variable but never prints the key's value. `Object.freeze` stops other code from changing the settings by accident. The test makes a random 40-character key for this run, the same way you made one in [What Node.js is](https://zudojs.oyinlola.site/learn/node-runtime#env). A key is never written into the code.

## Errors, store and body

The error class from above, plus two shortcuts for the most common cases:

src/errors.jsNode.js only

```ts
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message = "Not Found") => new HttpError(404, message);
```

The store keeps tasks in a `Map` (id to task). It returns **copies**, so code outside cannot change a stored task without going through the store. For now the data lives in memory and disappears on restart; you will replace this file with a database later, and nothing else will need to change:

src/store.jsNode.js only

```ts
export class TaskStore {
  #tasks = new Map();
  #nextId = 1;

  list({ done } = {}) {
    const all = [...this.#tasks.values()];
    const found = done === undefined ? all : all.filter((t) => t.done === done);
    return found.map((t) => ({ ...t }));
  }

  get(id) {
    const task = this.#tasks.get(id);
    return task ? { ...task } : undefined;
  }

  create(title) {
    const task = { id: this.#nextId++, title, done: false };
    this.#tasks.set(task.id, task);
    return { ...task };
  }

  update(id, changes) {
    const task = this.#tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, changes);
    return { ...task };
  }

  remove(id) {
    return this.#tasks.delete(id);
  }
}
```

`readJson` is the body reader from the last lesson, now throwing `HttpError`s instead of returning them:

src/body.jsNode.js only

```ts
import { HttpError, badRequest } from "./errors.js";

export async function readJson(req, limit = 10_000) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `Body larger than ${limit} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Body is not valid JSON");
  }
}
```

## The router

The router keeps a list of routes. `find` returns the handler and parameters for a request, or throws 404 (no route has that path) or 405 (the path exists, but not with that method). It uses the `matchRoute` idea from the last lesson, with one addition: `decodeURIComponent` throws on a broken encoding such as `%zz`, and a stranger can send exactly that, so a bad path simply does not match instead of crashing the request:

src/router.jsNode.js only

```ts
import { HttpError, notFound } from "./errors.js";

function matchPath(patternParts, path) {
  const parts = path.split("/");
  if (parts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      try {
        params[patternParts[i].slice(1)] = decodeURIComponent(parts[i]);
      } catch {
        return null;
      }
    } else if (patternParts[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

export class Router {
  #routes = [];

  add(method, pattern, handler) {
    this.#routes.push({ method, parts: pattern.split("/"), handler });
    return this;
  }

  find(method, path) {
    let pathExists = false;
    for (const route of this.#routes) {
      const params = matchPath(route.parts, path);
      if (!params) continue;
      if (route.method === method) return { handler: route.handler, params };
      pathExists = true;
    }
    throw pathExists ? new HttpError(405, "Method Not Allowed") : notFound();
  }
}
```

## Middleware for the API

Four middleware functions, plus `compose` from the start of the lesson:

- `logRequests` writes one line per request with its status and duration, even when the request failed.
- `handleErrors` is the one place that turns errors into responses.
- `securityHeaders` adds headers that tell browsers to be careful with the responses: don't guess the content type (`nosniff`) and don't cache task data (`no-store`).
- `requireApiKey` checks the `Authorization: Bearer <key>` header on every path except the public ones.

src/middleware.jsNode.js only

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

export function compose(middlewares, handler) {
  return function run(ctx, index = 0) {
    if (index === middlewares.length) return handler(ctx);
    return middlewares[index](ctx, () => run(ctx, index + 1));
  };
}

export const logRequests = (logger) => async (ctx, next) => {
  const start = performance.now();
  try {
    await next();
  } finally {
    const ms = Math.round(performance.now() - start);
    logger.info(`${ctx.req.method} ${ctx.url.pathname} ${ctx.res.statusCode} ${ms} ms`);
  }
};

export const handleErrors = (logger, sendJson) => async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof HttpError) return sendJson(ctx.res, error.status, { error: error.message });
    logger.error(`${ctx.req.method} ${ctx.url.pathname} failed`, error);
    sendJson(ctx.res, 500, { error: "Internal Server Error" });
  }
};

export const securityHeaders = async (ctx, next) => {
  ctx.res.setHeader("X-Content-Type-Options", "nosniff");
  ctx.res.setHeader("Cache-Control", "no-store");
  await next();
};

const sha256 = (text) => createHash("sha256").update(text).digest();

export const requireApiKey = (apiKey, publicPaths) => async (ctx, next) => {
  if (!publicPaths.includes(ctx.url.pathname)) {
    const header = ctx.req.headers.authorization ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!timingSafeEqual(sha256(given), sha256(apiKey))) {
      ctx.res.setHeader("WWW-Authenticate", "Bearer");
      throw new HttpError(401, "Missing or wrong API key");
    }
  }
  await next();
};
```

Why not simply `given === apiKey`? As you saw in [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#timing), a normal comparison stops at the first different character, so an attacker who sends enough requests can discover a key one character at a time. `timingSafeEqual` always takes the same time. It needs two inputs of the same length, so both sides are hashed first, which also hides how long the real key is.

> NOTE
>
> One shared API key is fine for a service only your own programs call. An API used by many people needs real user accounts, passwords and permissions, so each person can only do what they are allowed to. The backend and security courses build that, starting with [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth) and the security course's [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication).

## Wiring it together

REASON IT OUT

### Before you write PATCH: which changes may a client make?

`PATCH /tasks/:id` changes part of a task. The body is JSON from a client you do not control. Before reading `app.js`, decide what each of these requests should get:

- `PATCH /tasks/1` with `{"done": true}`, and with `{"done": "yes"}`.
- `PATCH /tasks/1` with `{"id": 7}`, or with `{"title": "Buy milk", "owner": "admin"}`.
- `PATCH /tasks/abc`, and `PATCH /tasks/99` when task 99 does not exist.
- A body that is the JSON value `null`.

**Show the reasoning**

`{"done": true}` is the normal case: 200 with the updated task. `"yes"` is not a boolean, so it is a 400; guessing what the client meant spreads bad data.

A field the route does not know must be refused, not ignored and certainly not copied: copying `id` would let a client overwrite another task's identity, and a field such as `owner` is how "mass assignment" bugs give users rights they should not have. So the route keeps an allow-list (`title` and `done`) and answers 400 for anything else.

`abc` can never be a task id and task 99 does not exist; both are 404 with the same message, so the client learns nothing more than "not found".

`JSON.parse("null")` is valid, so the route must not assume the body is an object: `body ?? {}` and `body?.title` keep it from crashing into a 500.

`app.js` defines the routes and puts the middleware in order. Each route handler gets the context and returns `{ status, body }`, or throws. Input is checked before it reaches the store: a title must be a non-empty string of at most 200 characters, and `PATCH` accepts only the fields it knows:

src/app.jsNode.js only

```ts
import { readJson } from "./body.js";
import { badRequest, notFound } from "./errors.js";
import { compose, handleErrors, logRequests, requireApiKey, securityHeaders } from "./middleware.js";
import { Router } from "./router.js";

function sendJson(res, status, body) {
  res.statusCode = status;
  if (body === undefined) return res.end();
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function checkTitle(title) {
  if (typeof title !== "string" || title.trim() === "" || title.length > 200) {
    throw badRequest("title must be a non-empty string of at most 200 characters");
  }
  return title.trim();
}

function parseId(text) {
  if (!/^[1-9][0-9]{0,8}$/.test(text)) throw notFound(`Task ${text} not found`);
  return Number(text);
}

export function createApp({ store, apiKey, logger }) {
  const router = new Router()
    .add("GET", "/health", () => ({ status: 200, body: { status: "ok" } }))
    .add("GET", "/tasks", ({ url }) => {
      const done = url.searchParams.get("done");
      if (done !== null && done !== "true" && done !== "false") throw badRequest("done must be true or false");
      return { status: 200, body: store.list({ done: done === null ? undefined : done === "true" }) };
    })
    .add("POST", "/tasks", async ({ req }) => {
      const body = await readJson(req);
      return { status: 201, body: store.create(checkTitle(body?.title)) };
    })
    .add("GET", "/tasks/:id", ({ params }) => {
      const task = store.get(parseId(params.id));
      if (!task) throw notFound(`Task ${params.id} not found`);
      return { status: 200, body: task };
    })
    .add("PATCH", "/tasks/:id", async ({ req, params }) => {
      const id = parseId(params.id);
      const body = await readJson(req);
      const changes = {};
      for (const key of Object.keys(body ?? {})) {
        if (key !== "title" && key !== "done") throw badRequest(`unknown field "${key}"`);
      }
      if (body?.title !== undefined) changes.title = checkTitle(body.title);
      if (body?.done !== undefined) {
        if (typeof body.done !== "boolean") throw badRequest("done must be true or false");
        changes.done = body.done;
      }
      const task = store.update(id, changes);
      if (!task) throw notFound(`Task ${params.id} not found`);
      return { status: 200, body: task };
    })
    .add("DELETE", "/tasks/:id", ({ params }) => {
      if (!store.remove(parseId(params.id))) throw notFound(`Task ${params.id} not found`);
      return { status: 204 };
    });

  const run = compose(
    [logRequests(logger), handleErrors(logger, sendJson), securityHeaders, requireApiKey(apiKey, ["/health"])],
    async (ctx) => {
      const { handler, params } = router.find(ctx.req.method, ctx.url.pathname);
      const { status, body } = await handler({ ...ctx, params });
      sendJson(ctx.res, status, body);
    },
  );

  return (req, res) => run({ req, res, url: new URL(req.url, "http://localhost") });
}
```

The result of `createApp` is an ordinary request handler, the same kind of function you passed to `createServer` in the last lesson. The allow-list check on `PATCH` matters for security: if the store simply copied whatever fields arrived, a client could send `{"id": 1}` and overwrite another task's id. Accept only the fields you expect.

## Starting and stopping

`server.js` is the only file that touches `process.env` and the network port. It also handles `SIGINT` (Ctrl + C) and `SIGTERM` (what Docker and hosting platforms send) with the **graceful shutdown** you learned in [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#signals): stop accepting new connections, let requests in progress finish, then exit, with a deadline:

src/server.jsNode.js only

```ts
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { TaskStore } from "./store.js";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const logger = { info: console.log, error: console.error };
const app = createApp({ store: new TaskStore(), apiKey: config.apiKey, logger });
const server = createServer(app);

server.listen(config.port, () => {
  console.log(`Task API listening on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, closing the server`);
  server.close(() => console.log("All connections closed. Bye."));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

`server.close` calls its function once the last connection has ended; after that, nothing is left for the event loop to wait for, so the program ends by itself. The `setTimeout` is a safety net: if a request hangs, give up after 10 seconds. `.unref()` tells the event loop not to stay alive just for this timer.

## Try every route

`demo.js` builds the app with a random API key made for this run, starts it on a free port, and walks through every route, including the failures. To show a 500, it uses a store whose `create` method breaks, the way a full disk or a lost database connection would:

demo.jsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createApp } from "./src/app.js";
import { TaskStore } from "./src/store.js";

class BrokenStore extends TaskStore {
  create() {
    throw new Error("EIO: disk failure writing /var/lib/tasks/db.json");
  }
}

const apiKey = randomBytes(32).toString("hex");
const logger = { info: (line) => console.log("  log:", line), error: (line, e) => console.log("  log:", line, "-", e.message) };

async function start(store) {
  const server = createServer(createApp({ store, apiKey, logger })).listen(0);
  await once(server, "listening");
  return server;
}

async function call(server, method, path, body, key = apiKey) {
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const url = `http://localhost:${server.address().port}${path}`;
  const res = await fetch(url, { method, headers, body });
  console.log(`${method} ${path} -> ${res.status} ${await res.text()}`);
}

const server = await start(new TaskStore());
await call(server, "POST", "/tasks", '{"title":"Buy milk"}');
await call(server, "POST", "/tasks", '{"title":"Write report"}');
await call(server, "PATCH", "/tasks/1", '{"done":true}');
await call(server, "GET", "/tasks?done=false");
await call(server, "DELETE", "/tasks/2");
await call(server, "GET", "/tasks/2");
await call(server, "PATCH", "/tasks/1", '{"id":7}');
await call(server, "POST", "/tasks", '{"title": oops}');
await call(server, "GET", "/tasks", undefined, "wrong-key");
await call(server, "PUT", "/tasks/1", "{}");
await call(server, "GET", "/health", undefined, "");
server.close();

const broken = await start(new BrokenStore());
await call(broken, "POST", "/tasks", '{"title":"Buy milk"}');
broken.close();
```

Output of `node demo.js`

```ts
  log: POST /tasks 201 9 ms
POST /tasks -> 201 {"id":1,"title":"Buy milk","done":false}
  log: POST /tasks 201 1 ms
POST /tasks -> 201 {"id":2,"title":"Write report","done":false}
  log: PATCH /tasks/1 200 2 ms
PATCH /tasks/1 -> 200 {"id":1,"title":"Buy milk","done":true}
  log: GET /tasks 200 1 ms
GET /tasks?done=false -> 200 [{"id":2,"title":"Write report","done":false}]
  log: DELETE /tasks/2 204 1 ms
DELETE /tasks/2 -> 204
  log: GET /tasks/2 404 1 ms
GET /tasks/2 -> 404 {"error":"Task 2 not found"}
  log: PATCH /tasks/1 400 1 ms
PATCH /tasks/1 -> 400 {"error":"unknown field \"id\""}
  log: POST /tasks 400 1 ms
POST /tasks -> 400 {"error":"Body is not valid JSON"}
  log: GET /tasks 401 1 ms
GET /tasks -> 401 {"error":"Missing or wrong API key"}
  log: PUT /tasks/1 405 1 ms
PUT /tasks/1 -> 405 {"error":"Method Not Allowed"}
  log: GET /health 200 0 ms
GET /health -> 200 {"status":"ok"}
  log: POST /tasks failed - EIO: disk failure writing /var/lib/tasks/db.json
  log: POST /tasks 500 1 ms
POST /tasks -> 500 {"error":"Internal Server Error"}
```

Read the output from top to bottom. Every request produced one log line (written before the client read its answer) and one result line:

- Create, update, list with a filter, delete: 201, 200, 200, 204. After the delete, the same task is 404.
- `{"id":7}` was refused with 400: an unknown field. Broken JSON: 400, with our message, not `JSON.parse`'s.
- A wrong key: 401, and the router never ran. `PUT` is not a route for `/tasks/1`: 405. `/health` works without a key.
- The broken store: the log line has the real cause, with the file path. The client got a plain `Internal Server Error`.

## Run it on your computer

Create the files above in your `plain-api` folder. First, start it without a key, to see the configuration check work:

Terminal on your computer

```bash
$ npm start

> plain-api@1.0.0 start
> node --env-file-if-exists=.env src/server.js

.env not found. Continuing without it.
Invalid configuration:
  TASKS_API_KEY must be set, at least 32 characters long
```

Node.js tells you there is no `.env` file yet, carries on, and `loadConfig` stops the server. Make a `.env` file with a random key, and a `.gitignore` that keeps it out of Git:

Terminal on your computer

```bash
$ node -e "console.log('TASKS_API_KEY=' + crypto.randomBytes(32).toString('hex'))" > .env
$ echo ".env" > .gitignore
$ npm start

> plain-api@1.0.0 start
> node --env-file-if-exists=.env src/server.js

Task API listening on http://localhost:3000
```

In a second terminal, load the same key into a shell variable so you don't have to paste it (on macOS and Linux), and call the API with `curl`:

Terminal on your computer

```bash
$ export $(cat .env)
$ curl http://localhost:3000/health
{"status":"ok"}
$ curl http://localhost:3000/tasks
{"error":"Missing or wrong API key"}
$ curl -H "Authorization: Bearer $TASKS_API_KEY" -H "Content-Type: application/json" -d '{"title":"Buy milk"}' http://localhost:3000/tasks
{"id":1,"title":"Buy milk","done":false}
$ curl -H "Authorization: Bearer $TASKS_API_KEY" http://localhost:3000/tasks
[{"id":1,"title":"Buy milk","done":false}]
```

Back in the first terminal, the server logged each request. Press Ctrl + C and watch the graceful shutdown:

Terminal on your computer

```ts
Task API listening on http://localhost:3000
GET /health 200 20 ms
GET /tasks 401 3 ms
POST /tasks 201 5 ms
GET /tasks 200 1 ms
^CSIGINT received, closing the server
All connections closed. Bye.
```

## What happens at 20,000 lines?

You now have a real API, and you understand every line of it. That is worth a lot: nothing a framework does will feel like magic. But be honest about what happens when this grows into a real product, with 150 routes, a database, user accounts, three developers and a server in production. Each of these starts small and becomes a daily cost:

- **Routing by hand.** One `Router` list of 150 routes, with no grouping, no per-route middleware (only admins may delete), and parameters that are always strings you convert yourself.
- **Validation.** `checkTitle` and the `PATCH` allow-list are hand-written for one resource. Multiply by every field of every resource. Each developer writes the checks and messages slightly differently, and one forgotten check is a bug or a security hole.
- **Wiring dependencies.** `createApp({ store, apiKey, logger })` becomes `createApp` with 30 arguments: a database pool, a mailer, a cache, a payment client. Who creates what, in which order, and how do you swap the real database for a fake one in a test?
- **Configuration.** `loadConfig` grows to dozens of settings with types, defaults per environment, and secrets that must never reach a log.
- **Testing.** Every test starts a server by hand, builds requests by hand, and cleans up by hand, as `demo.js` did.
- **Errors.** One `HttpError` becomes many kinds (not found, conflict, validation with details per field, rate limited), and every client expects them in one consistent format.
- **Security.** Two headers and one API key are a start. A public API also needs CORS rules (which you will add in [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking#cors)), rate limits, CSRF protection for browser sessions, user login and permissions, each easy to get subtly wrong.
- **Lifecycle and shutdown.** Today, shutdown closes one server. Later it must stop taking traffic, finish jobs, flush logs and close the database, in the right order, and report when the app is ready to receive traffic at start-up.
- **No types.** Nothing stops you from passing a task where an id was expected. You only find out when it runs.

None of these is hard on its own. Together, they are most of the code in a backend, and every team writes them again, slightly differently, with their own bugs. The rest of the academy answers them one by one: first TypeScript ([Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup)), then [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep), [How databases work](https://zudojs.oyinlola.site/learn/databases) and [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics) in the backend course; then, in [What a framework does](https://zudojs.oyinlola.site/learn/frameworks), you will see how a framework packages exactly these pieces; and from [Welcome to ZudoJS](https://zudojs.oyinlola.site/learn/zudo-welcome) on, you will rebuild this Task API with ZudoJS's routing, validation, dependency injection, configuration, errors, security and lifecycle, and notice how much of this lesson's code you no longer write.

## Practice

TRY IT YOURSELF

### Count requests

Write a middleware `countRequests(counter)` that adds 1 to `counter.total` for every request, and to `counter.failed` when the final status is 400 or higher. Try it with `compose` and a handler that sets `ctx.status`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Increment `counter.total` before calling `next()`. `ctx.status` is only set once the handler, further down the chain, has run — which is after `next()` resolves.

HINT 2

`counter.total += 1; await next(); if (ctx.status >= 400) counter.failed += 1;`

SOLUTION

count.js

```ts
function compose(middlewares, handler) {
  return function run(ctx, index = 0) {
    if (index === middlewares.length) return handler(ctx);
    return middlewares[index](ctx, () => run(ctx, index + 1));
  };
}

const countRequests = (counter) => async (ctx, next) => {
  counter.total += 1;
  await next();
  if (ctx.status >= 400) counter.failed += 1;
};

const counter = { total: 0, failed: 0 };
const app = compose([countRequests(counter)], async (ctx) => {
  ctx.status = ctx.path === "/tasks" ? 200 : 404;
});

for (const path of ["/tasks", "/nope", "/tasks", "/missing"]) {
  await app({ path });
}
console.log(counter);
```

Output of `node count.js` and of the browser terminal

```json
{ total: 4, failed: 2 }
```

The count of failures happens after `await next()`, because only then is the status known.

TRY IT YOURSELF

### Limit the list

Add a `limit` query parameter to `GET /tasks`: a whole number from 1 to 100, default 20. Anything else is a 400. Write the check as a function you can test on its own.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Convert `text` to a number first, but keep the original text around too: the regex check and the range check both matter, and either one failing should throw.

HINT 2

`const limit = Number(text); if (!/^[0-9]{1,3}$/.test(text) || limit < 1 || limit > 100) throw new HttpError(400, "limit must be a whole number from 1 to 100"); return limit;`

SOLUTION

limit.js

```ts
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readLimit(searchParams) {
  const text = searchParams.get("limit") ?? "20";
  const limit = Number(text);
  if (!/^[0-9]{1,3}$/.test(text) || limit < 1 || limit > 100) {
    throw new HttpError(400, "limit must be a whole number from 1 to 100");
  }
  return limit;
}

for (const query of ["", "?limit=5", "?limit=0", "?limit=1000", "?limit=ten"]) {
  try {
    console.log(query || "(none)", readLimit(new URLSearchParams(query)));
  } catch (error) {
    console.log(query, error.status, error.message);
  }
}
```

Output of `node limit.js` and of the browser terminal

```ts
(none) 20
?limit=5 5
?limit=0 400 limit must be a whole number from 1 to 100
?limit=1000 400 limit must be a whole number from 1 to 100
?limit=ten 400 limit must be a whole number from 1 to 100
```

In `app.js`, call `readLimit(url.searchParams)` in the `GET /tasks` handler and return `list.slice(0, limit)`.

TRY IT YOURSELF

### Which pain point bit you?

Look back over the files you wrote. Find one place where you repeated yourself, and one place where forgetting a line would have created a security problem. Which items in the 20,000-lines list do they belong to?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Look at `app.js` route by route: which few lines appear, in slightly different words, in more than one handler?

HINT 2

For the security half, ask what a client could send that the code doesn't explicitly check for, in `app.js`'s `PATCH` route and in `middleware.js`'s `requireApiKey`.

SOLUTION

Some possible answers:

- Repetition: `parseId` and the "not found" check appear in three routes, and `checkTitle` in two. That is **routing** (parameters are strings you convert yourself) and **validation**.
- Security: forgetting the field allow-list in `PATCH` would let a client change a task's `id`; forgetting a path in `requireApiKey`'s public list is safe, but adding one by mistake would expose the data; forgetting the size limit in `readJson` would let anyone fill the server's memory. Those are **validation** and **security**.

## Recap

- Middleware are functions `(ctx, next)` chained by `compose`. Each can act before and after the rest, or stop the chain. Order matters.
- Routes throw; one error-handling middleware answers. `HttpError`s go to the client, everything else becomes a plain 500 while the details go to the log.
- Configuration is read once, from the environment, checked completely, and the server refuses to start without its secret.
- Check every input: route parameters, query values, body size, JSON, and exactly which fields may change. Compare secrets with `timingSafeEqual`.
- Handle `SIGINT` and `SIGTERM` by closing the server gracefully.
- All of this works, and all of it grows into most of your code. The rest of the academy, and ZudoJS, exist to make those pieces standard.

Next: [The DOM](https://zudojs.oyinlola.site/learn/browser-dom). The course moves to the other end of the connection, the browser, where you build the page that will call this API.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
