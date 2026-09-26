---
title: "Routes, requests and responses — ZudoJS Academy"
description: "Serve the Task API with @zudojs/http: a server, routes with parameters, query strings, headers, cookies and JSON bodies read safely, and the right status codes."
source: https://zudojs.oyinlola.site/learn/zudo-http
---

LEVEL 12 · LESSON 12 OF 19

HTTP Core

# Routes, requests and responses

Serve the Task API with @zudojs/http: a server, routes with parameters, query strings, headers, cookies and JSON bodies read safely, and the right status codes.

- **50 min** to read and try
- **You need:** "DI architecture with ZudoJS", and "HTTP in depth" from the Backend course
- **You build:** GET, POST and DELETE routes for /tasks, served by the Task API and tested with fetch and curl

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Start an HTTP server with @zudojs/http and send it requests from a script
- Register routes with parameters and read query strings, which are always strings or arrays of strings
- Read a JSON body safely, answering 415 and 400 for the client's mistakes instead of 500
- Answer with the right status code, headers and cookies for each outcome
- Connect the Task API's service to real routes through the composition root

## A server in a few lines

In [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) you built a server with `node:http` and did everything by hand. `@zudojs/http` does the same job with less code and safer defaults. The generated `src/server.ts` already uses it. It needs two pieces:

- An **adapter**, which talks to the real network. `createNodeHttpAdapter` uses Node's `node:http` under the hood. It decides the `host` and `port`.
- A **handler**, your function. It receives each request and returns the response.

first-server.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter } from "@zudojs/http";

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: (request) => ({ message: "Hello from the Task API", path: request.path }),
});

await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;

const response = await fetch(`${base}/hello`);
console.log(response.status, response.headers.get("content-type"));
console.log(await response.text());

await server.stop();
console.log(server.state);
```

Output of `npx tsx first-server.ts`

```ts
200 application/json
{"message":"Hello from the Task API","path":"/hello"}
stopped
```

A few things to notice:

- `port: 0` asks the operating system for any free port. `server.address?.port` tells you which one it picked. That way the example never clashes with another program. Your real server uses a fixed port such as 3000.
- The handler returned a plain object, and the server sent it as JSON with status 200 and the right `content-type`.
- The example starts the server, sends itself a request with `fetch`, prints the answer and stops. Every example in this lesson works like that, so you can run it and see the result. A real server keeps running until you stop it.
- You did not write a type for the handler's parameter. TypeScript knows `request` is an `HttpRequestContext`, the type `@zudojs/http` uses for an incoming request, so `request.path` is checked.

## Routes and route parameters

One handler for every path soon turns into a long chain of `if` statements. A **router** keeps a table of **routes**: a method plus a path pattern, and the function that answers it. The server's handler hands every request to `router.dispatch`.

So the next examples stay short, this helper file starts a server for a router, runs some requests and stops it:

serve.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";

export async function withServer(router: HttpRouter, run: (base: string) => Promise<void>): Promise<void> {
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  try {
    await run(`http://127.0.0.1:${server.address?.port}`);
  } finally {
    await server.stop();
  }
}

export async function show(label: string, response: Response): Promise<void> {
  console.log(label, "->", response.status, await response.text());
}
```

Now two routes. `:id` in a path is a **route parameter**: it matches one piece of the path, and its value lands in `ctx.params.id`:

routes.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { NotFoundError } from "@zudojs/errors";
import { show, withServer } from "./serve.js";

const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Walk the dog", done: true },
];

const router = createRouter();
router.get("/tasks", () => tasks);
router.get("/tasks/:id", (ctx) => {
  const task = tasks.find((t) => String(t.id) === ctx.params.id);
  if (!task) {
    throw new NotFoundError(`Task ${ctx.params.id} not found`);
  }
  return task;
});

await withServer(router, async (base) => {
  await show("GET /tasks", await fetch(`${base}/tasks`));
  await show("GET /tasks/2", await fetch(`${base}/tasks/2`));
  await show("GET /tasks/9", await fetch(`${base}/tasks/9`));
  await show("GET /users", await fetch(`${base}/users`));
  await show("DELETE /tasks/1", await fetch(`${base}/tasks/1`, { method: "DELETE" }));
});
```

Output of `npx tsx routes.ts`

```ts
GET /tasks -> 200 [{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Walk the dog","done":true}]
GET /tasks/2 -> 200 {"id":2,"title":"Walk the dog","done":true}
GET /tasks/9 -> 404 {"error":"Task 9 not found","code":"ERR_RESOURCE_NOT_FOUND"}
GET /users -> 404 {"error":"Not Found","code":"NOT_FOUND","method":"GET","path":"/users"}
DELETE /tasks/1 -> 405 {"error":"Method Not Allowed","code":"METHOD_NOT_ALLOWED","method":"DELETE","path":"/tasks/1","allowed":["GET","HEAD","OPTIONS"]}
```

You wrote two routes, and five different requests got sensible answers:

- A route handler receives one object, usually called `ctx`. The request itself is `ctx.request`; the route parameters are `ctx.params`.
- Route parameters are always **strings**: `ctx.params.id` is `"2"`, not `2`. That is why the code compares `String(t.id)`.
- Throwing `NotFoundError` from [@zudojs/errors](https://zudojs.oyinlola.site/learn/zudo-first-code) became a 404 with its `code`. You do not build error responses by hand.
- An unknown path gets 404, and a known path with the wrong method gets **405 Method Not Allowed** with the list of allowed methods. The router does both for you.

Both routes simply returned their data, and the router sent it as JSON with status 200. When a route needs something else, such as another status code, a header or a cookie, it returns a response built with `createResponseContext()` instead. You will see that in the next sections. A route that returns nothing answers **204 No Content**.

## Query strings

The part of a URL after `?` is the **query string**, for options such as filters: `/tasks?done=true`. The router parses it into `ctx.query`:

query.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { show, withServer } from "./serve.js";

const router = createRouter();
router.get("/search", (ctx) => {
  const summary = Object.entries(ctx.query).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return createResponseContext().json(summary);
});

await withServer(router, async (base) => {
  await show("one of each", await fetch(`${base}/search?done=true&limit=10`));
  await show("repeated key", await fetch(`${base}/search?tag=home&tag=urgent`));
  await show("no query", await fetch(`${base}/search`));
});
```

Output of `npx tsx query.ts`

```ts
one of each -> 200 ["done=\"true\"","limit=\"10\""]
repeated key -> 200 ["tag=[\"home\",\"urgent\"]"]
no query -> 200 []
```

Two facts you must remember:

- Every value is a **string**. `done=true` gives `"true"`, and `limit=10` gives `"10"`. `"false"` is a non-empty string, so `if (ctx.query.done)` would treat it as true.
- A key given twice becomes an **array** of strings.

So a query value is `string | string[]`, or missing. Converting and checking it by hand gets tedious. In [Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation) a schema does it in one line. For now, here is the Task API's filter, done carefully by hand:

filter.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { show, withServer } from "./serve.js";

const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Walk the dog", done: true },
];

const router = createRouter();
router.get("/tasks", (ctx) => {
  const done = ctx.query.done;
  if (done === undefined) {
    return createResponseContext().json(tasks);
  }
  if (done !== "true" && done !== "false") {
    return createResponseContext({ status: 400 }).json({ error: "done must be true or false" });
  }
  return createResponseContext().json(tasks.filter((t) => t.done === (done === "true")));
});

await withServer(router, async (base) => {
  await show("done=false", await fetch(`${base}/tasks?done=false`));
  await show("done=yes", await fetch(`${base}/tasks?done=yes`));
});
```

Output of `npx tsx filter.ts`

```ts
done=false -> 200 [{"id":1,"title":"Buy milk","done":false}]
done=yes -> 400 {"error":"done must be true or false"}
```

## Request bodies

A `POST` request carries data in its **body**. In `@zudojs/http` the body arrives as **raw bytes**: a `Uint8Array`, already read from the network for you and limited to 10 MB by default (bigger bodies get **413 Payload Too Large**). It is *not* parsed. The server cannot know whether the bytes are JSON, a form or an image, so turning them into data is your job:

raw-body.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { show, withServer } from "./serve.js";

const router = createRouter();
router.post("/echo", (ctx) => {
  const body = ctx.request.body;
  console.log("body is a Uint8Array:", body instanceof Uint8Array);
  const text = new TextDecoder().decode(body as Uint8Array);
  return createResponseContext().json({ bytes: text.length, text });
});

await withServer(router, async (base) => {
  await show("POST /echo", await fetch(`${base}/echo`, { method: "POST", body: '{"title":"Buy milk"}' }));
});
```

Output of `npx tsx raw-body.ts`

```ts
body is a Uint8Array: true
POST /echo -> 200 {"bytes":20,"text":"{\"title\":\"Buy milk\"}"}
```

`TextDecoder` turns bytes into text, assuming UTF-8. The next step is `JSON.parse`.

REASON IT OUT

### What can go wrong with a body?

Before reading the helper below, list what a client can send to `POST /tasks` instead of a good JSON body, and which status each deserves. Think about the `Content-Type` header, the bytes themselves, and what `JSON.parse` does with them. Which of these are the client's mistake, and which would be yours?

**Show the reasoning**

- **Not JSON at all**: a form (`title=Buy+milk`) or plain text, announced by its `Content-Type`. The server cannot use it: **415 Unsupported Media Type**, before any parsing.
- **Broken JSON**: `{"title": `. `JSON.parse` throws a `SyntaxError`. Uncaught, it would reach the server as an unknown error and become a 500, blaming your code for the client's mistake. Catch it and answer **400**.
- **Valid JSON of the wrong shape**: `{"title": 42}` or `[]`. Parsing succeeds; the schema must refuse it, with a 400.
- **A huge body**: the server itself refuses bodies over its limit with 413 before your route runs.
- Every one of these is the client's mistake, so every one gets a 4xx. A 500 should only ever mean a bug on your side.

An uncaught error is a bug, so the server would answer 500 for broken JSON. But broken JSON is the *client's* mistake and deserves a 400. A small helper handles every case once:

read-json.tsNode.js only

```ts
import { badRequest, HttpError } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";

export function readJson(request: HttpRequestContext): unknown {
  const type = request.getHeader("content-type") ?? "";
  if (!type.startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  const text = new TextDecoder().decode(request.body as Uint8Array);
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("The request body is not valid JSON");
  }
}
```

- It checks the `Content-Type` header first (you met it in [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#headers)). Anything that is not JSON gets **415 Unsupported Media Type**.
- `badRequest(...)` and `new HttpError(status, message)` come from `@zudojs/http`. Thrown from a route, they become a response with that status. `HttpError` picks its `code` from the status: 415 becomes `UNSUPPORTED_MEDIA_TYPE`. You can pass your own as a third argument, `{ code: "..." }`.
- It returns `unknown`, not `any`: the data is not trusted until a schema has checked it.

Now a `POST /tasks` route that reads, validates and creates. The schema is the `NewTaskSchema` from [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container#task-api). A successful create answers **201 Created** with a `Location` header that says where the new task lives:

create.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import { readJson } from "./read-json.js";
import { withServer } from "./serve.js";

const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
});

const tasks: { id: number; title: string; done: boolean }[] = [];

const router = createRouter();
router.post("/tasks", (ctx) => {
  const data = NewTaskSchema.parse(readJson(ctx.request));
  const task = { id: tasks.length + 1, ...data };
  tasks.push(task);
  return createResponseContext({ status: 201 }).setHeader("location", `/tasks/${task.id}`).json(task);
});

const json = { "content-type": "application/json" };
await withServer(router, async (base) => {
  const attempts: [string, RequestInit][] = [
    ["good", { method: "POST", headers: json, body: '{"title": "  Buy milk "}' }],
    ["broken JSON", { method: "POST", headers: json, body: '{"title": ' }],
    ["too short", { method: "POST", headers: json, body: '{"title": "no"}' }],
    ["not JSON", { method: "POST", headers: { "content-type": "text/plain" }, body: "Buy milk" }],
  ];
  for (const [label, init] of attempts) {
    const response = await fetch(`${base}/tasks`, init);
    console.log(label, "->", response.status, response.headers.get("location"), await response.text());
  }
});
```

Output of `npx tsx create.ts`

```ts
good -> 201 /tasks/1 {"id":1,"title":"Buy milk","done":false}
broken JSON -> 400 null {"error":"The request body is not valid JSON","code":"BAD_REQUEST"}
too short -> 400 null {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION","issues":[{"path":["title"],"code":"too_small","message":"String must be at least 3 characters"}]}
not JSON -> 415 null {"error":"Send JSON with Content-Type: application/json","code":"UNSUPPORTED_MEDIA_TYPE"}
```

Every bad request got a 4xx status, and none of them reached the task list. The schema failure became a 400 by itself, because `SchemaError` carries status 400, and its body already lists exactly which field failed and why in `issues`, sanitised so a submitted value never leaks back into the response. [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors) covers how any thrown error becomes a body like this.

## Headers and cookies

`request.getHeader(name)` reads a request header. The name is not case-sensitive, and a missing header gives `undefined`. On the response, `setHeader(name, value)` adds one.

**Cookies** are small values the browser stores and sends back with every request (see [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#cookies)). `response.cookie(name, value, options)` sets one with safe defaults, and `parseCookies` reads the `Cookie` header:

cookies.tsNode.js only

```ts
import { createResponseContext, createRouter, parseCookies } from "@zudojs/http";
import { withServer } from "./serve.js";

const router = createRouter();
router.put("/preferences/theme/:theme", (ctx) =>
  createResponseContext({ status: 204 }).cookie("theme", ctx.params.theme ?? "light", { maxAge: 60 * 60 * 24 * 365 }),
);
router.get("/preferences", (ctx) => {
  const cookies = parseCookies(ctx.request.getHeader("cookie"));
  const agent = ctx.request.getHeader("User-Agent");
  return createResponseContext()
    .setHeader("cache-control", "no-store")
    .json({ theme: cookies.get("theme") ?? "light", agent });
});

await withServer(router, async (base) => {
  const set = await fetch(`${base}/preferences/theme/dark`, { method: "PUT" });
  const cookie = set.headers.get("set-cookie") ?? "";
  console.log(set.status, cookie);

  const read = await fetch(`${base}/preferences`, {
    headers: { cookie: cookie.split(";")[0] ?? "", "user-agent": "task-cli/1.0" },
  });
  console.log(read.status, read.headers.get("cache-control"), await read.text());
});
```

Output of `npx tsx cookies.ts`

```ts
204 theme=dark; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax
200 no-store {"theme":"dark","agent":"task-cli/1.0"}
```

Read the `Set-Cookie` header. You only asked for a one-year `Max-Age`, and `@zudojs/http` added the safe settings from [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#cookies) by itself:

- `HttpOnly`: JavaScript in the page cannot read the cookie, so an injected script cannot steal it.
- `Secure`: the browser only sends it over HTTPS.
- `SameSite=Lax`: other websites cannot make the browser send it along with their requests, except when the user follows a normal link.

Only turn one of these off when you have a specific reason. The `fetch` above sent the cookie back by hand; a browser does that for you. Note also that the route read `ctx.params.theme` with `?? "light"`: TypeScript types a parameter as possibly missing.

## Responses and status codes

`createResponseContext()` builds a response. You can pass `{ status, headers, body }` at once, or chain `setStatus`, `setHeader`, `json`, `text` and `cookie`. The status codes a JSON API uses most:

| Status | When | How in @zudojs/http |
| --- | --- | --- |
| 200 OK | Here is what you asked for. | `return data`, or `createResponseContext().json(data)` |
| 201 Created | A new resource exists now. | `createResponseContext({ status: 201 })` plus a `location` header |
| 204 No Content | Done, nothing to send back. | `createResponseContext({ status: 204 })` |
| 400 Bad Request | The input is wrong. | A `SchemaError`, or `throw badRequest(...)` |
| 404 Not Found | No such resource. | `throw new NotFoundError(...)` |
| 409 Conflict | Clashes with what exists. | `throw new ConflictError(...)` |
| 500 Internal Server Error | A bug. | Any other error. The client only sees `{"error":"Internal Server Error"}`. |

Deleting shows two of them. The first `DELETE` removes the task and sends nothing back. Deleting it again finds nothing:

delete.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { NotFoundError } from "@zudojs/errors";
import { show, withServer } from "./serve.js";

const tasks = new Map([[1, { id: 1, title: "Buy milk" }]]);

const router = createRouter();
router.delete("/tasks/:id", (ctx) => {
  if (!tasks.delete(Number(ctx.params.id))) {
    throw new NotFoundError(`Task ${ctx.params.id} not found`);
  }
  return createResponseContext({ status: 204 });
});
router.get("/crash", () => {
  throw new Error("Cannot read the database file /var/data/tasks.db");
});

await withServer(router, async (base) => {
  await show("first DELETE", await fetch(`${base}/tasks/1`, { method: "DELETE" }));
  await show("second DELETE", await fetch(`${base}/tasks/1`, { method: "DELETE" }));
  await show("GET /crash", await fetch(`${base}/crash`));
});
```

Output of `npx tsx delete.ts`

```ts
first DELETE -> 204
second DELETE -> 404 {"error":"Task 1 not found","code":"ERR_RESOURCE_NOT_FOUND"}
GET /crash -> 500 {"error":"Internal Server Error","code":"INTERNAL_SERVER_ERROR"}
```

The last request hit a bug. The error message contained a file path, which would tell an attacker about your server, and it was **not** sent. The client got a generic 500. You will decide exactly what clients see, and log the details for yourself, in [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors).

## Put it in the Task API

Now connect the `TaskService` that [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container#task-api) built, and [DI architecture](https://zudojs.oyinlola.site/learn/zudo-di-architecture#task-api) registered and checked, to real routes. These files do not change:

**Show the unchanged files**

src/repositories/tasks.store.ts

```ts
export type Priority = "low" | "normal" | "high";

export interface StoredTask {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: Priority;
  readonly createdAt: string;
}

export class TaskStore {
  public readonly tasks = new Map<number, StoredTask>();
  public connected = false;
  private lastId = 0;

  public nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}
```

src/dtos/tasks.dto.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
});

export type NewTask = Infer<typeof NewTaskSchema>;
```

src/services/tasks.service.ts

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Clock } from "@zudojs/types";
import { NewTaskSchema } from "../dtos/tasks.dto.js";
import type { StoredTask, TaskStore } from "../repositories/tasks.store.js";

export class TaskService {
  public constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  public create(input: unknown): StoredTask {
    const data = NewTaskSchema.parse(input);
    const clash = [...this.store.tasks.values()].some((t) => t.title === data.title);
    if (clash) {
      throw new ConflictError(`A task called "${data.title}" already exists`);
    }
    const task: StoredTask = { id: this.store.nextId(), ...data, createdAt: new Date(this.clock.now()).toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  public list(): StoredTask[] {
    return [...this.store.tasks.values()];
  }

  public get(id: number): StoredTask {
    const task = this.store.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }
}
```

Open `src/utils/http.ts`. The CLI already wrote helpers from this lesson there. `json(status, data)` builds a response with `createResponseContext`. `readJsonBody(ctx)` is the generated version of `readJson`: it decodes the bytes, runs `JSON.parse` inside `try`, throws `badRequest` for broken JSON and returns `unknown`. It also returns `undefined` for an empty body. It skips one check, the `Content-Type`. Add that check just before the `try` (and `HttpError` to the `@zudojs/http` import at the top), then add a `parseId` helper below the function:

src/utils/http.ts (part)Node.js only

```ts
/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/** A task id from the path; anything but a positive whole number is answered with 400. */
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest("The task id must be a positive whole number");
  }
  return id;
}
```

Media types are not case-sensitive, so the check lower-cases the header first. `parseId` refuses ids such as `abc`, `1.5` or `-3` with a 400, before the service ever sees them.

**Show the whole src/utils/http.ts**

src/utils/http.ts

```ts
import {
  HttpError,
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/** A task id from the path; anything but a positive whole number is answered with 400. */
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest("The task id must be a positive whole number");
  }
  return id;
}

/**
 * The response for an error that carries an exposed 4xx status
 * (NotFoundError, badRequest(), ...). Anything else is left to the server,
 * which answers a generic 500 and never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

Now create `src/routes/tasks.routes.ts`, next to the generated `health.routes.ts` and `examples.routes.ts`. A route file only translates between HTTP and the service: it reads the request, calls the service, and chooses the status. The rules stay in the service.

src/routes/tasks.routes.tsNode.js only

```ts
import type { HttpRouter } from "@zudojs/http";
import type { TaskService } from "../services/tasks.service.js";
import { json, parseId, readJsonBody } from "../utils/http.js";

export function registerTaskRoutes(router: HttpRouter, tasks: TaskService): void {
  router.get("/tasks", () => tasks.list());

  router.get("/tasks/:id", (ctx) => tasks.get(parseId(ctx.params.id)));

  router.post("/tasks", (ctx) => {
    const task = tasks.create(readJsonBody(ctx));
    return json(201, task).setHeader("location", `/tasks/${task.id}`);
  });
}
```

The generated example resource splits this job in two: `examples.routes.ts` lists the paths, and `examples.controller.ts` reads each request and calls the service. That pays off with many routes. For three, one file is enough. This script checks the routes against a real server, with a fixed clock:

src/check-http.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { FixedClock } from "@zudojs/types";
import { TaskStore } from "./repositories/tasks.store.js";
import { registerTaskRoutes } from "./routes/tasks.routes.js";
import { TaskService } from "./services/tasks.service.js";

const service = new TaskService(new TaskStore(), new FixedClock(Date.parse("2026-09-23T09:00:00Z")));
const router = createRouter();
registerTaskRoutes(router, service);

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;
const json = { "content-type": "application/json" };

for (const [method, path, body] of [
  ["POST", "/tasks", '{"title":"Buy milk","priority":"high"}'],
  ["POST", "/tasks", '{"title":"Buy milk"}'],
  ["GET", "/tasks/1", undefined],
  ["GET", "/tasks/abc", undefined],
  ["GET", "/tasks", undefined],
] as const) {
  const response = await fetch(base + path, { method, headers: json, body });
  console.log(method, path, response.status, await response.text());
}
await server.stop();
```

Output of `npx tsx src/check-http.ts`

```ts
POST /tasks 201 {"id":1,"title":"Buy milk","done":false,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}
POST /tasks 409 {"error":"A task called \"Buy milk\" already exists","code":"ERR_CONFLICT"}
GET /tasks/1 200 {"id":1,"title":"Buy milk","done":false,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}
GET /tasks/abc 400 {"error":"The task id must be a positive whole number","code":"BAD_REQUEST"}
GET /tasks 200 [{"id":1,"title":"Buy milk","done":false,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}]
```

Last, register the routes with the real app. The generated wiring already exists: `src/server.ts` builds a router, `registerRoutes` in `src/routes/index.ts` adds every route to it, and `createDependencies` in `src/container.ts` hands each route file what it needs. Three small edits connect the task routes to the service in the runtime's container. First, `createDependencies` receives that container and resolves the service. The container becomes a required option, so remove the `= {}` default:

src/container.ts (part)Node.js only

```ts
/** Options for {@link createDependencies}. */
export interface DependencyOptions {
  /** The runtime's container, filled by registerServices. */
  readonly container: Container;
  /** Readiness for /health; server.ts passes the runtime's. */
  readonly health?: HealthCheck;
}

export function createDependencies(options: DependencyOptions) {
  const health: HealthCheck =
    options.health ?? (async () => ({ ready: true, checks: {} }));

  return {
    health,
    tasks: options.container.resolve(TaskService),
    // zudojs:container:start
    examplesController: new ExamplesController(new ExamplesService(new InMemoryExamplesRepository())),
    // zudojs:container:end
  };
}
```

Second, `registerRoutes` registers the task routes, outside the markers:

src/routes/index.ts (part)Node.js only

```ts
import { registerTaskRoutes } from "./tasks.routes.js";

export function registerRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerHealthRoutes(router, deps.health);
  registerTaskRoutes(router, deps.tasks);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  // zudojs:routes:end
}
```

Third, `src/server.ts` passes the runtime's container:

src/server.ts (part)Node.js only

```ts
registerRoutes(
  router,
  createDependencies({
    container: runtime.context.container,
    health: async () => {
      // ...unchanged
    },
  }),
);
```

If you added the smoke test from [Anatomy of a ZudoJS project](https://zudojs.oyinlola.site/learn/zudo-project-anatomy#tests), it now needs a container too, and it can check the new route. Build one with the same `registerServices` the app uses:

tests/smoke.test.ts (part)Node.js only

```ts
import { createContainer } from "@zudojs/container";
import { createDependencies, registerServices } from "../src/container.js";

const expected = ["/health", "/tasks", "/api/v1/examples"];

const container = createContainer();
registerServices(container);
register(router, createDependencies({ container }));
```

Errors need no wiring. A thrown `NotFoundError` or `badRequest` reaches the `dispatch` step further down in `src/server.ts`, which answers with the generated `errorResponse` helper: `{"error": message, "code": code}` and the error's status. Any other error becomes a plain 500. Start the server with `npm run dev`, and try the API from a second terminal:

Second terminal

```bash
$ curl -i -X POST http://localhost:3000/tasks -H "content-type: application/json" -d '{"title":"Buy milk"}'
HTTP/1.1 201 Created
content-type: application/json
location: /tasks/2
x-content-type-options: nosniff
x-frame-options: DENY
…
content-length: 99
Date: Wed, 23 Sep 2026 19:48:34 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":2,"title":"Buy milk","done":false,"priority":"normal","createdAt":"2026-09-23T19:48:34.755Z"}
$ curl http://localhost:3000/tasks
[{"id":1,"title":"Read the runtime lesson","done":true,"priority":"normal","createdAt":"2026-09-23T09:00:00.000Z"},{"id":2,"title":"Buy milk","done":false,"priority":"normal","createdAt":"2026-09-23T19:48:34.755Z"}]
$ curl http://localhost:3000/tasks/7
{"error":"Task 7 not found","code":"ERR_RESOURCE_NOT_FOUND"}
$ curl -X POST http://localhost:3000/tasks -d 'title=Buy milk'
{"error":"Send JSON with Content-Type: application/json","code":"UNSUPPORTED_MEDIA_TYPE"}
```

> TIP
>
> On Windows PowerShell, type `curl.exe`, and put the JSON in double quotes with the inner quotes escaped: `-d "{\"title\":\"Buy milk\"}"`.

The new task got id 2, and the list shows it next to the one the `tasks` module added at startup. Both live in the one `TaskStore` singleton, shared by the modules and the service through the container. The `…` stands for the other security headers, which [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware#headers) explains. The last request sent a form instead of JSON (`-d` without a `content-type` header does that), and got the 415 from your new check.

> TIP
>
> The router can also document your API. You ran `zudojs add openapi` in [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project#add), so `src/server.ts` already calls `mountOpenAPI(router, …)`, which serves `/openapi.json` and a docs page at `/docs`. Only routes with an `openapi` option are listed, so the task routes are not in it yet; `examples.routes.ts` shows what the option looks like. [OpenAPI documents](https://zudojs.oyinlola.site/learn/zudo-openapi) covers it. A related helper, `mountFetchHandler(router, path, handler)`, serves a web-standard `(request: Request) => Response` handler under a path of your router.

## Practice

TRY IT YOURSELF

### Mark a task as done

Add a `PATCH /tasks/:id/done` route to the small in-memory router from the [routes section](#router). It sets `done` to `true` and answers 200 with the task, or 404 if there is no such task.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`const task = tasks.find((t) => String(t.id) === ctx.params.id); if (!task) throw new NotFoundError(\`Task ${ctx.params.id} not found\`);`.

HINT 2

Once found: `task.done = true; return createResponseContext().json(task);`.

SOLUTION

patch.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { NotFoundError } from "@zudojs/errors";
import { show, withServer } from "./serve.js";

const tasks = [{ id: 1, title: "Buy milk", done: false }];

const router = createRouter();
router.patch("/tasks/:id/done", (ctx) => {
  const task = tasks.find((t) => String(t.id) === ctx.params.id);
  if (!task) {
    throw new NotFoundError(`Task ${ctx.params.id} not found`);
  }
  task.done = true;
  return createResponseContext().json(task);
});

await withServer(router, async (base) => {
  await show("PATCH /tasks/1/done", await fetch(`${base}/tasks/1/done`, { method: "PATCH" }));
  await show("PATCH /tasks/5/done", await fetch(`${base}/tasks/5/done`, { method: "PATCH" }));
});
```

Output of `npx tsx patch.ts`

```ts
PATCH /tasks/1/done -> 200 {"id":1,"title":"Buy milk","done":true}
PATCH /tasks/5/done -> 404 {"error":"Task 5 not found","code":"ERR_RESOURCE_NOT_FOUND"}
```

TRY IT YOURSELF

### A limit on the list

Change the `GET /tasks` route of [the filter example](#query) so it also accepts `?limit=N`. It must be a whole number from 1 to 50; anything else is a 400. Remember: the value arrives as a string, maybe as an array.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`const raw = ctx.query.limit ?? "50"; const limit = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;` — a non-string (array) value fails the `typeof` check and falls through to `NaN`.

HINT 2

`if (!(limit >= 1 && limit <= 50)) throw badRequest("limit must be a whole number from 1 to 50"); return createResponseContext().json(tasks.slice(0, limit));`.

SOLUTION

limit.tsNode.js only

```ts
import { badRequest, createResponseContext, createRouter } from "@zudojs/http";
import { show, withServer } from "./serve.js";

const tasks = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}` }));

const router = createRouter();
router.get("/tasks", (ctx) => {
  const raw = ctx.query.limit ?? "50";
  const limit = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(limit >= 1 && limit <= 50)) {
    throw badRequest("limit must be a whole number from 1 to 50");
  }
  return createResponseContext().json(tasks.slice(0, limit));
});

await withServer(router, async (base) => {
  await show("limit=2", await fetch(`${base}/tasks?limit=2`));
  await show("limit=0", await fetch(`${base}/tasks?limit=0`));
  await show("limit=1&limit=2", await fetch(`${base}/tasks?limit=1&limit=2`));
});
```

Output of `npx tsx limit.ts`

```ts
limit=2 -> 200 [{"id":1,"title":"Task 1"},{"id":2,"title":"Task 2"}]
limit=0 -> 400 {"error":"limit must be a whole number from 1 to 50","code":"BAD_REQUEST"}
limit=1&limit=2 -> 400 {"error":"limit must be a whole number from 1 to 50","code":"BAD_REQUEST"}
```

The regular expression `^\d+$` accepts digits only, so `"1.5"`, `"-1"` and `" 2"` are refused. A repeated key is an array, not a string, so it is refused too. [Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation#coercion) replaces this hand-written code with a schema.

## Recap

- `createHttpServer` + `createNodeHttpAdapter` run a server; `port: 0` picks a free port, which is handy in tests.
- `createRouter()` maps a method and a path to a handler. `:id` parameters and query values are always strings; repeated query keys become arrays. Unknown paths get 404 and wrong methods 405 automatically.
- The request body is raw bytes. Check the `Content-Type`, decode with `TextDecoder`, parse JSON inside `try`, then validate with a schema.
- A route can return plain data, sent as JSON with status 200. For any other answer it returns `createResponseContext()` with the right status: 201 plus `Location` for a create, 204 for a delete.
- Throwing `NotFoundError`, `ConflictError`, `badRequest()` or a `SchemaError` becomes the matching 4xx. Any other error becomes a generic 500.
- Cookies set with `response.cookie()` are `HttpOnly`, `Secure` and `SameSite=Lax` by default.

The Task API has three routes. Before it gets more, learn exactly how the router picks one: next, [Routing in depth](https://zudojs.oyinlola.site/learn/zudo-routing).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
