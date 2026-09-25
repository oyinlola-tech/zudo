---
title: "Routing in depth — ZudoJS Academy"
description: "Control which handler answers a request in @zudojs/http: path patterns, matching order, route middleware, groups, repeated query keys and canonical targets."
source: https://zudojs.oyinlola.site/learn/zudo-routing
---

LEVEL 12 · LESSON 13 OF 19

HTTP Core

# Routing in depth

Control which handler answers a request in @zudojs/http: path patterns, matching order, route middleware, groups, repeated query keys and canonical targets.

- **50 min** to read and try
- **You need:** "Routes, requests and responses"
- **You build:** A GET /tasks/stats route that filters by repeated query keys, and a route-table check that proves every Task API route is reachable and hostile paths are refused

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write route patterns with required, optional, constrained, brace and wildcard parameters, and predict the decoded values
- Predict which route answers a request when several patterns match, and find routes that can never run
- Attach middleware to a single route or to a group, and explain the order it runs in
- Handle repeated query keys deliberately instead of crashing or trusting the first value
- Explain how the router normalises paths and why the adapter refuses dot segments and backslashes before routing

## The problem: two bugs in a four-line router

In [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http) you registered a handful of routes and everything behaved. Real route tables grow to dozens of entries written by different people, and then routing itself starts causing bugs. Here are two, both from a Task API that compiles cleanly:

hit.ts

```ts
import { createRequestContext } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";

/** Sends one request through a router, without a server, and prints the answer. */
export async function hit(router: HttpRouter, method: string, url: string, headers: Record<string, string> = {}): Promise<void> {
  try {
    const { response, route } = await router.dispatch(createRequestContext({ method, url, headers }));
    const body = typeof response.body === "string" ? response.body : (JSON.stringify(response.body) ?? "");
    console.log(`${method} ${url} -> ${response.status} ${body}`.trimEnd(), route ? `[${route.path}]` : "");
  } catch (error) {
    // dispatch rethrows; a server answers an exposed HttpError with its status, anything else with 500
    const e = error as Error & { statusCode?: number; expose?: boolean };
    const status = e.expose === true && e.statusCode !== undefined ? e.statusCode : 500;
    console.log(`${method} ${url} -> ${status} (thrown ${e.name}: ${e.message})`);
  }
}
```

two-bugs.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/tasks/:slug", (ctx) => ({ found: "by slug", slug: ctx.params.slug }));
router.get("/tasks/:id(\\d+)", (ctx) => ({ found: "by id", id: Number(ctx.params.id) }));
router.get("/tasks", (ctx) => {
  const status = ctx.query.status as string;
  return { filter: status.toUpperCase() };
});

await hit(router, "GET", "/tasks/42");
await hit(router, "GET", "/tasks?status=open");
await hit(router, "GET", "/tasks?status=open&status=done");
```

Output of `npx tsx two-bugs.ts`

```ts
GET /tasks/42 -> 200 {"found":"by slug","slug":"42"} [/tasks/:slug]
GET /tasks?status=open -> 200 {"filter":"OPEN"} [/tasks]
GET /tasks?status=open&status=done -> 500 (thrown TypeError: status.toUpperCase is not a function)
```

- The `:id(\\d+)` route never runs. Its author expected "digits only" to make it the better match for `/tasks/42`, but the slug route was registered first and also matches. No error, no warning: the id route is dead code.
- A client repeated a query key, the value became an array, and `toUpperCase` crashed. `as string` told TypeScript to stop checking. In a server that is a 500 for a request any client can send.

The helper `hit` sends a request through `router.dispatch` without a server and prints the status, the body and, in brackets, the pattern that answered. `dispatch` does not turn a thrown error into a response; the server does that. So `hit` prints a thrown error the way the server would answer it: an exposed `HttpError` with its own status, anything else as 500. Every example in this lesson uses it, so you can see which route won. This lesson explains how the router registers, parses, orders and matches routes, so that you can predict the winner before a user finds out.

## Registering routes

A router is a table of **routes**: a method, a path **pattern**, a handler, and options. You have used `router.get` and `router.post`. The full set:

- One method each: `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, `connect`, `trace`.
- `all(path, handler)` for every method, and `on(method, path, handler)` with a method name.
- `add({ method, path, handler, ... })` with a definition object, where `method` may be a list such as `["PUT", "PATCH"]`.

Each takes an optional last argument with route **options**: a `name`, free-form `metadata`, a list of `middleware`, `strictTrailingSlash`, and the `openapi` documentation you will meet in [OpenAPI documents](https://zudojs.oyinlola.site/learn/zudo-openapi). Each also returns a function that removes the route again:

registration.tsNode.js only

```ts
import { createRouter, isRouteConflictError } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/tasks", () => [], { name: "tasks.list", metadata: { owner: "tasks-team" } });
router.add({ method: ["PUT", "PATCH"], path: "/tasks/:id", handler: (ctx) => ({ updated: ctx.params.id }) });
const removeDebug = router.all("/debug", (ctx) => ({ method: ctx.request.method }));

console.log(router.list().map((route) => `${route.method} ${route.path} ${route.name ?? ""}`.trimEnd()));

await hit(router, "PATCH", "/tasks/7");
await hit(router, "DELETE", "/debug");
removeDebug();
await hit(router, "DELETE", "/debug");

for (const register of [
  () => router.get("/tasks", () => []),
  () => router.get("/tasks/:id(", () => null),
]) {
  try {
    register();
  } catch (error) {
    console.log((error as Error).name, "-", (error as Error).message, "| conflict:", isRouteConflictError(error));
  }
}
```

Output of `npx tsx registration.ts`

```json
[
  'PUT /tasks/:id',
  'PATCH /tasks/:id',
  'GET /tasks tasks.list',
  '* /debug'
]
PATCH /tasks/7 -> 200 {"updated":"7"} [/tasks/:id]
DELETE /debug -> 200 {"method":"DELETE"} [/debug]
DELETE /debug -> 404 {"error":"Not Found","method":"DELETE","path":"/debug"}
RouteConflictError - A route for GET /tasks is already registered. | conflict: true
InvalidRoutePatternError - Invalid route pattern "/tasks/:id(": Invalid parameter name "id(". | conflict: false
```

- `list()` shows every route, including the two that `add` created from one definition, and the `*` method of `all`.
- Registering the same method and pattern twice throws a `RouteConflictError`, and a malformed pattern throws an `InvalidRoutePatternError`, both when the app starts. Registration errors are loud; you will see shortly that *overlapping* routes are not.
- Removing routes at run time is rarely what you want in production. It exists for tests and for plugins that are switched off. The Task API registers everything at startup.

## Path patterns and parameters

A pattern is split into **segments** at every `/`. Each segment is a literal (`tasks`) or a parameter. The router understands five parameter forms:

| Pattern | Meaning | Matches |
| --- | --- | --- |
| `/tasks/:id` | Required parameter: exactly one segment | `/tasks/42`, `/tasks/buy-milk` |
| `/reports/:year/:month?` | Optional parameter: may be missing | `/reports/2026`, `/reports/2026/09` |
| `/tasks/:id(\\d+)` | Constrained: the segment must match a regular expression | `/tasks/42` but not `/tasks/abc` |
| `/users/{userId}/tasks` | Brace form, same as `:userId`; `{code?:[A-Z]+}` is optional and constrained | `/users/7/tasks` |
| `/files/*path` | Wildcard: the rest of the path, slashes included | `/files/`, `/files/2026/report.pdf` |

In a TypeScript string the regular expression needs a double backslash: `"/tasks/:id(\\d+)"` is the pattern `/tasks/:id(\d+)`.

REASON IT OUT

### What can arrive in a parameter?

Before running the next example, think about `/tasks/:id` and the values a client controls. What type does `ctx.params.id` have? What should happen for `/tasks/caf%C3%A9`, which is percent-encoded UTF-8? For `/tasks/a%2Fb`, where `%2F` is an encoded slash? For `/tasks/%2e%2e`, an encoded `..`? For `/reports/2026` on the optional pattern, is `month` an empty string or missing?

**Show the reasoning**

- Always a **string**, already percent-decoded. A number, a date or an enum is your job to parse and check, as `parseId` does.
- `caf%C3%A9` decodes to `café`. Decoding is correct: `%C3%A9` is just how a URL spells `é`.
- An encoded slash must *not* become a `/` inside one parameter. A handler that joins the value into a file path or another URL would then address something the route was never meant to reach. The router refuses such a segment, so the route does not match.
- The same goes for `.` and `..`, plain or encoded: they mean "this folder" and "the parent folder" and are the raw material of path traversal attacks.
- A missing optional parameter is **absent** from `ctx.params`, not an empty string. Check it with `=== undefined`.

patterns.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/tasks/:id", (ctx) => ctx.params);
router.get("/reports/:year/:month?", (ctx) => ctx.params);
router.get("/invoices/:number(\\d{6})", (ctx) => ctx.params);
router.get("/users/{userId}/tasks", (ctx) => ctx.params);
router.get("/files/*path", (ctx) => ctx.params);

for (const url of [
  "/tasks/caf%C3%A9",
  "/tasks/a%2Fb",
  "/tasks/%2e%2e",
  "/reports/2026",
  "/reports/2026/09",
  "/invoices/000123",
  "/invoices/123",
  "/users/7/tasks",
  "/files/2026/q3/report.pdf",
]) {
  await hit(router, "GET", url);
}
```

Output of `npx tsx patterns.ts`

```ts
GET /tasks/caf%C3%A9 -> 200 {"id":"café"} [/tasks/:id]
GET /tasks/a%2Fb -> 404 {"error":"Not Found","method":"GET","path":"/tasks/a%2Fb"}
GET /tasks/%2e%2e -> 404 {"error":"Not Found","method":"GET","path":"/"}
GET /reports/2026 -> 200 {"year":"2026"} [/reports/:year/:month?]
GET /reports/2026/09 -> 200 {"year":"2026","month":"09"} [/reports/:year/:month?]
GET /invoices/000123 -> 200 {"number":"000123"} [/invoices/:number(\d{6})]
GET /invoices/123 -> 404 {"error":"Not Found","method":"GET","path":"/invoices/123"}
GET /users/7/tasks -> 200 {"userId":"7"} [/users/{userId}/tasks]
GET /files/2026/q3/report.pdf -> 200 {"path":"2026/q3/report.pdf"} [/files/*path]
```

Read the refusals: the encoded slash and the encoded `..` found no route, and neither did an invoice number with three digits instead of six. The wildcard kept the slashes of the rest of the path, and the missing month is simply not in the object.

### Building paths from patterns

The reverse job, turning a pattern and values into a path, is `buildRoutePath`. It encodes each value, so a title with a space or a slash cannot break the path. Use it for `Location` headers and links instead of gluing strings together:

build.tsNode.js only

```ts
import { buildRoutePath } from "@zudojs/http";

console.log(buildRoutePath("/tasks/:id", { id: 42 }));
console.log(buildRoutePath("/users/:userId/tasks/:slug", { userId: 7, slug: "buy milk/eggs" }));
try {
  buildRoutePath("/tasks/:id", {});
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx build.ts`

```ts
/tasks/42
/users/7/tasks/buy%20milk%2Feggs
Missing route parameter "id".
```

## Matching order

A request path usually matches more than one pattern. `/tasks/stats` fits both `/tasks/stats` and `/tasks/:id`. Some routers, such as Express, try routes in the order you registered them. `@zudojs/http` does not: it sorts routes by **specificity**, comparing segment by segment from the left:

1. A literal segment beats a parameter.
2. A parameter beats a wildcard.
3. When two routes are equally specific, the one registered first wins.

order.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/tasks/*rest", (ctx) => ({ route: "catch-all", rest: ctx.params.rest }));
router.get("/tasks/:id", (ctx) => ({ route: "one task", id: ctx.params.id }));
router.get("/tasks/stats", () => ({ route: "stats" }));

await hit(router, "GET", "/tasks/stats");
await hit(router, "GET", "/tasks/42");
await hit(router, "GET", "/tasks/42/notes");
await hit(router, "GET", "/tasks");
```

Output of `npx tsx order.ts`

```ts
GET /tasks/stats -> 200 {"route":"stats"} [/tasks/stats]
GET /tasks/42 -> 200 {"route":"one task","id":"42"} [/tasks/:id]
GET /tasks/42/notes -> 200 {"route":"catch-all","rest":"42/notes"} [/tasks/*rest]
GET /tasks -> 200 {"route":"catch-all","rest":""} [/tasks/*rest]
```

The routes were registered in the worst possible order, and each request still reached the most specific one. Look at the last line: a wildcard also matches an *empty* rest, so `/tasks/*rest` answered `/tasks` itself. If you also have a `GET /tasks` route, it wins, being more specific; without one, the catch-all takes the request.

### Ties and dead routes

Rule 3 explains the first bug of this lesson. A regular-expression constraint does not make a parameter more specific: `:slug` and `:id(\\d+)` are equally specific, so registration order decides. And the router only rejects routes with the *same* pattern. A route that can never win is accepted without a word:

ties.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const fixed = createRouter();
fixed.get("/tasks/:id(\\d+)", (ctx) => ({ found: "by id", id: Number(ctx.params.id) }));
fixed.get("/tasks/:slug", (ctx) => ({ found: "by slug", slug: ctx.params.slug }));
fixed.get("/tasks/:taskId", () => ({ found: "never" }));

await hit(fixed, "GET", "/tasks/42");
await hit(fixed, "GET", "/tasks/buy-milk");

const samples: [pattern: string, sample: string][] = [
  ["/tasks/:id(\\d+)", "/tasks/42"],
  ["/tasks/:slug", "/tasks/buy-milk"],
  ["/tasks/:taskId", "/tasks/anything"],
];
for (const [pattern, sample] of samples) {
  const answered = fixed.match("GET", sample).route?.path;
  console.log(answered === pattern ? `${sample} -> ${answered}` : `${sample} -> ${answered}, so ${pattern} is dead`);
}
```

Output of `npx tsx ties.ts`

```ts
GET /tasks/42 -> 200 {"found":"by id","id":42} [/tasks/:id(\d+)]
GET /tasks/buy-milk -> 200 {"found":"by slug","slug":"buy-milk"} [/tasks/:slug]
/tasks/42 -> /tasks/:id(\d+)
/tasks/buy-milk -> /tasks/:slug
/tasks/anything -> /tasks/:slug, so /tasks/:taskId is dead
```

Registering the constrained route first fixes the first bug, because it now wins the tie for digits and refuses everything else. The third route is dead: `:slug` already takes every single segment. `router.match(method, path)` tells you which route *would* answer without running anything, so a test can check your own sample path for each route. You will build that test for the Task API at the end of this lesson.

> TIP
>
> Avoid overlapping parameter routes altogether when you can. `/tasks/:id` and `/tasks/by-slug/:slug` can never compete. When they must overlap, register the constrained one first and write a test for both.

### HEAD, OPTIONS and 405

Three answers come from the router itself, without a route of their own:

methods.tsNode.js only

```ts
import { createRequestContext, createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/tasks/:id", (ctx) => ({ id: ctx.params.id }));
router.patch("/tasks/:id", () => ({ updated: true }));

for (const method of ["HEAD", "OPTIONS", "DELETE"]) {
  const { response } = await router.dispatch(createRequestContext({ method, url: "/tasks/1" }));
  console.log(method, response.status, "allow:", response.headers["allow"]);
}
```

Output of `npx tsx methods.ts`

```ts
HEAD 200 allow: undefined
OPTIONS 204 allow: GET, PATCH, HEAD, OPTIONS
DELETE 405 allow: GET, PATCH
```

- **HEAD** runs the `GET` route. The server then sends the headers without the body, which is what HEAD means.
- **OPTIONS** answers 204 with an `Allow` header listing every method the path supports.
- A method the path does not support gets **405** with an `Allow` header. Notice that it lists only the methods you registered; the automatic HEAD and OPTIONS are left out, although they work.

Turn the first two off with `createRouter({ automaticHead: false, automaticOptions: false })` if you need to handle them yourself. A CORS preflight is also an OPTIONS request, but the CORS middleware from [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware#cors) answers it before the router is reached.

## Route middleware

Pipeline middleware, from [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware), runs for every request. Some checks belong to a few routes only: "this route needs an API key", "this route works on a task that must exist". **Route middleware** is listed in the route's `middleware` option and runs after the route has matched, so it can read the route parameters:

route-middleware.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { hit } from "./hit.js";

const tasks = new Map([[1, { id: 1, title: "Pay the ₦45,000 electricity bill", done: false }]]);

const requireApiKey: HttpMiddleware = async (context, next) => {
  if (context.request.getHeader("x-api-key") !== "demo-key") {
    return createResponseContext({ status: 401 }).json({ error: "API key required" });
  }
  return next();
};

const loadTask: HttpMiddleware = async (context, next) => {
  const task = tasks.get(Number(context.request.getParam("id")));
  if (!task) {
    return createResponseContext({ status: 404 }).json({ error: "No such task" });
  }
  context.state.set("task", task);
  return next();
};

const router = createRouter();
router.get("/tasks/:id", (ctx) => ctx.state.get("task") as object, { middleware: [loadTask] });
router.patch(
  "/tasks/:id/done",
  (ctx) => {
    const task = ctx.state.get("task") as { done: boolean };
    task.done = true;
    return task;
  },
  { middleware: [requireApiKey, loadTask] },
);

await hit(router, "GET", "/tasks/1");
await hit(router, "GET", "/tasks/9");
await hit(router, "PATCH", "/tasks/1/done");
await hit(router, "PATCH", "/tasks/1/done", { "x-api-key": "demo-key" });
```

Output of `npx tsx route-middleware.ts`

```ts
GET /tasks/1 -> 200 {"id":1,"title":"Pay the ₦45,000 electricity bill","done":false} [/tasks/:id]
GET /tasks/9 -> 404 {"error":"No such task"} [/tasks/:id]
PATCH /tasks/1/done -> 401 {"error":"API key required"} [/tasks/:id/done]
PATCH /tasks/1/done -> 200 {"id":1,"title":"Pay the ₦45,000 electricity bill","done":true} [/tasks/:id/done]
```

- `context.request.getParam("id")` works inside route middleware: the router copies the parameters onto the request before the first middleware runs.
- `context.state` in the middleware and `ctx.state` in the handler are the same store, so `loadTask` hands the task over and the handler never deals with "not found".
- Middleware runs in list order: the key check happens before any task is loaded, so an unauthenticated client cannot even learn which task ids exist.

The order across both kinds: every pipeline middleware runs first, then the router matches, then the route middleware, then the handler. A pipeline middleware cannot read route parameters, because no route has matched yet when it runs.

## Groups

When many routes share a path prefix and the same middleware, repeating both on every route invites mistakes: one forgotten `requireApiKey` is an open door. A **group** registers routes under a prefix with shared options. Groups nest, and their middleware lists add up from the outside in:

groups.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { hit } from "./hit.js";

function trace(name: string): HttpMiddleware {
  return async (context, next) => {
    console.log(`  ${name}`);
    return next();
  };
}

const router = createRouter();
router.group(
  "/api/v1",
  (v1) => {
    v1.get("/health", () => ({ ok: true }));
    v1.group(
      "/tasks",
      (tasks) => {
        tasks.get("/", () => [{ id: 1, title: "Buy milk" }]);
        tasks.get("/:id", (ctx) => ({ id: ctx.params.id }), { middleware: [trace("route: load task")] });
      },
      { middleware: [trace("group: require API key")] },
    );
  },
  { middleware: [trace("group: count v1 calls")] },
);

console.log(router.list().map((route) => `${route.method} ${route.path} (${route.middleware.length} middleware)`));
await hit(router, "GET", "/api/v1/tasks/7");
await hit(router, "GET", "/api/v1/health");
```

Output of `npx tsx groups.ts`

```json
[
  'GET /api/v1/tasks/:id (3 middleware)',
  'GET /api/v1/health (1 middleware)',
  'GET /api/v1/tasks (2 middleware)'
]
  group: count v1 calls
  group: require API key
  route: load task
GET /api/v1/tasks/7 -> 200 {"id":"7"} [/api/v1/tasks/:id]
  group: count v1 calls
GET /api/v1/health -> 200 {"ok":true} [/api/v1/health]
```

A group is only a registration helper: the router ends up with ordinary routes whose paths include the prefix and whose middleware lists include the group's. `tasks.get("/")` became `/api/v1/tasks`. The generated example resource uses exactly this shape of path, `/api/v1/examples`, for **versioning**: when an incompatible v2 arrives, it gets its own group and v1 keeps working for old clients.

## Query parameters, including repeated ones

`ctx.query` holds the parsed query string. You already know the two basic rules: every value is a string, and a key given twice becomes an array. A few more details matter once clients get creative:

query.tsNode.js only

```ts
import { createRouter, toRouterContext } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/tasks", (ctx) => {
  const query = toRouterContext(ctx);
  return {
    raw: ctx.query,
    tags: query.queryArray("tag"),
    status: query.queryString("status") ?? null,
    prototype: Object.getPrototypeOf(ctx.query),
  };
});

await hit(router, "GET", "/tasks?tag=home&tag=urgent&status=open");
await hit(router, "GET", "/tasks?tag=home&status=open&status=done");
await hit(router, "GET", "/tasks?q=buy+milk&tag=a,b&flag&empty=");
await hit(router, "GET", "/tasks?q=%ZZ&__proto__=admin&constructor=x");
```

Output of `npx tsx query.ts`

```ts
GET /tasks?tag=home&tag=urgent&status=open -> 200 {"raw":{"tag":["home","urgent"],"status":"open"},"tags":["home","urgent"],"status":"open","prototype":null} [/tasks]
GET /tasks?tag=home&status=open&status=done -> 200 {"raw":{"tag":"home","status":["open","done"]},"tags":["home"],"status":"open","prototype":null} [/tasks]
GET /tasks?q=buy+milk&tag=a,b&flag&empty= -> 200 {"raw":{"q":"buy milk","tag":"a,b","flag":"","empty":""},"tags":["a,b"],"status":null,"prototype":null} [/tasks]
GET /tasks?q=%ZZ&__proto__=admin&constructor=x -> 200 {"raw":{"q":"%ZZ"},"tags":[],"status":null,"prototype":null} [/tasks]
```

- `toRouterContext(ctx)` wraps the handler's context with helpers. `queryArray(name)` always gives an array (empty, one value or many), so code that accepts several values never checks the type. `queryString(name)` always gives one string or `undefined`.
- For a repeated key, `queryString` returns the **first** value, silently. `status=open&status=done` became `"open"`.
- `+` is a space, a comma is just a character (`a,b` is one tag), and a key without `=` is an empty string.
- A broken escape such as `%ZZ` is kept as it arrived instead of crashing. The keys `__proto__`, `constructor` and `prototype` are dropped, and the object has no prototype, so a query can never inject properties into your objects (**prototype pollution**).

### Choose a policy for repeated keys

Sending the same key twice to confuse a server is called **HTTP parameter pollution**. It becomes a vulnerability when two layers pick different values: a proxy or a permission check reads the last `status`, your handler reads the first. The safe rule is to decide per parameter:

- Parameters that are naturally lists (`tag`, `priority`, `id`): accept repeats with `queryArray`.
- Parameters that must have one value (`status`, `page`, `sort`): **refuse** a repeat with 400, rather than silently choosing one.

policy.tsNode.js only

```ts
import { badRequest, createRouter, toRouterContext } from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import { hit } from "./hit.js";

function single(ctx: HttpRouterContext, name: string): string | undefined {
  const values = toRouterContext(ctx).queryArray(name);
  if (values.length > 1) {
    throw badRequest(`Send "${name}" at most once`);
  }
  return values[0];
}

const router = createRouter();
router.get("/tasks", (ctx) => ({
  status: single(ctx, "status") ?? "any",
  tags: toRouterContext(ctx).queryArray("tag"),
}));

await hit(router, "GET", "/tasks?tag=home&tag=urgent");
await hit(router, "GET", "/tasks?status=open&tag=home");
await hit(router, "GET", "/tasks?status=open&status=done");
```

Output of `npx tsx policy.ts`

```ts
GET /tasks?tag=home&tag=urgent -> 200 {"status":"any","tags":["home","urgent"]} [/tasks]
GET /tasks?status=open&tag=home -> 200 {"status":"open","tags":["home"]} [/tasks]
GET /tasks?status=open&status=done -> 400 (thrown HttpError: Send "status" at most once)
```

The polluted request is refused with a 400 that names the parameter. [Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation#coercion) gets the same result from a schema: a schema field for one number refuses an array.

The parser also has **limits**: at most 1000 parameters, 4096 characters per name, 16,384 per value, 1 MiB in total. A request over a limit never reaches your routes; [the next section](#canonical) shows what the server answers.

## Path normalisation

Many different spellings can mean the same path. **Normalisation** turns them into one form before matching. By default the router is forgiving:

normalise.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const relaxed = createRouter();
relaxed.get("/tasks/:id", (ctx) => ({ id: ctx.params.id }));

const strict = createRouter({ caseSensitive: true, strictTrailingSlash: true });
strict.get("/tasks/:id", (ctx) => ({ id: ctx.params.id }));

for (const url of ["/tasks/7", "/TASKS/7", "/tasks/7/", "//tasks//7"]) {
  await hit(relaxed, "GET", url);
}
console.log("--- strict");
for (const url of ["/TASKS/7", "/tasks/7/", "//tasks//7"]) {
  await hit(strict, "GET", url);
}
```

Output of `npx tsx normalise.ts`

```ts
GET /tasks/7 -> 200 {"id":"7"} [/tasks/:id]
GET /TASKS/7 -> 200 {"id":"7"} [/tasks/:id]
GET /tasks/7/ -> 200 {"id":"7"} [/tasks/:id]
GET //tasks//7 -> 200 {"id":"7"} [/tasks/:id]
--- strict
GET /TASKS/7 -> 404 {"error":"Not Found","method":"GET","path":"/TASKS/7"}
GET /tasks/7/ -> 404 {"error":"Not Found","method":"GET","path":"/tasks/7/"}
GET //tasks//7 -> 200 {"id":"7"} [/tasks/:id]
```

- Repeated slashes are always collapsed: `//tasks//7` is `/tasks/7`.
- By default the literal parts of a pattern ignore case, and a trailing slash is ignored. `caseSensitive: true` and `strictTrailingSlash: true` make both significant. A single route can also set `strictTrailingSlash` in its options.
- Parameter values keep their case either way.

Which is right? Forgiving routing is friendly to people typing URLs. Strict routing gives every resource exactly one URL, which matters for caches and for rules written elsewhere: a CDN rule for `/tasks/*` does not know that your server also answers `/TASKS/7`. For a JSON API used by programs, either works, as long as you pick one and know which.

## Canonical request targets

The **request target** is the text after the method in the first line of an HTTP request, as in `GET /tasks/7?x=1 HTTP/1.1`. Browsers and `fetch` clean it up before sending. An attacker's script sends it raw, and a raw target can hide tricks:

- `/tasks/../admin`: a **dot segment**. URL parsing resolves it to `/admin`. If a proxy in front of your app blocks `/admin*` by looking at the raw text, it lets this through, and a router that resolves the dots then serves `/admin`. Two layers disagreeing about the same request is the root of many real attacks. `%2e%2e` is the same thing, encoded.
- `/tasks\..\admin`: URL parsing treats a backslash as a slash, so this is the same trick in Windows spelling.
- `//evil.example/admin`: a naive `new URL(target, base)` reads it as a link to the host `evil.example`, and the path becomes `/admin`.

A **canonical** request target is the one agreed form every layer uses. The Node adapter checks each target before any middleware or route runs, and refuses the ambiguous ones with 400. This example sends raw targets with `node:http`, which does not clean them up like `fetch` does:

canonical.tsNode.js only

```ts
import { request } from "node:http";
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/tasks/:id", (ctx) => ({ id: ctx.params.id, path: ctx.request.path }));
router.get("/admin", () => ({ secret: "admin area" }));
router.get("/tasks", (ctx) => ({ query: ctx.query }));

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (req) => (await router.dispatch(req)).response,
});
await server.start();

function rawGet(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.address?.port, method: "GET", path: target }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(`${res.statusCode} ${body}`));
    });
    req.on("error", reject);
    req.end();
  });
}

const tooManyKeys = "/tasks?" + Array.from({ length: 1001 }, (_, i) => `k${i}=1`).join("&");
for (const target of [
  "/tasks/7",
  "//tasks//7",
  "/tasks/../admin",
  "/tasks/%2e%2e/admin",
  "/tasks\\..\\admin",
  "//evil.example/admin",
  "http://tasks.example.com/tasks/9",
  tooManyKeys,
]) {
  console.log(target.slice(0, 32).padEnd(33), await rawGet(target));
}
await server.stop();
```

Output of `npx tsx canonical.ts`

```ts
/tasks/7                          200 {"id":"7","path":"/tasks/7"}
//tasks//7                        200 {"id":"7","path":"/tasks/7"}
/tasks/../admin                   400 {"error":"Bad Request"}
/tasks/%2e%2e/admin               400 {"error":"Bad Request"}
/tasks\..\admin                   400 {"error":"Bad Request"}
//evil.example/admin              404 {"error":"Not Found","method":"GET","path":"/evil.example/admin"}
http://tasks.example.com/tasks/9  200 {"id":"9","path":"/tasks/9"}
/tasks?k0=1&k1=1&k2=1&k3=1&k4=1&  400 {"error":"Bad Request"}
```

- Every dot segment and the backslash were refused with 400 before routing, so `/admin` was never reached by a trick.
- `//evil.example/admin` stayed a *path*: it found no route and got 404. No other host was involved.
- The **absolute form**, a full URL as the target, is allowed; proxies send it. Its path is used.
- The query with 1001 parameters was refused with 400 before any route ran.

The adapter uses exported helpers, which you can call in your own code, for example in a proxy or a tool that must agree with the server. `getCanonicalPath(target)` gives the path every layer will route on; `findRequestTargetViolation(target)` explains a refusal:

canonical-helpers.tsNode.js only

```ts
import { findRequestTargetViolation, getCanonicalPath } from "@zudojs/http";

for (const target of ["//tasks//7?x=1", "/tasks/../admin", "/tasks\\admin", "tasks/7", "http://api.example.com/tasks/9"]) {
  console.log(target.padEnd(32), getCanonicalPath(target).padEnd(15), findRequestTargetViolation(target) ?? "ok");
}
```

Output of `npx tsx canonical-helpers.ts`

```ts
//tasks//7?x=1                   /tasks/7        ok
/tasks/../admin                  /admin          Request target contains a dot segment.
/tasks\admin                     /tasks/admin    Request target contains a backslash.
tasks/7                          /tasks/7        Request target is not in origin-form or absolute-form.
http://api.example.com/tasks/9   /tasks/9        ok
```

> THE CHECK LIVES IN THE ADAPTER
>
> Only the Node adapter refuses non-canonical targets. `router.dispatch` on its own, as in the `hit` helper, trusts the request it is given, and a request context built from `/tasks/%2e%2e` has already had its dots resolved away. In production that is fine, because every request comes through the adapter. In tests of path handling, go through a real server as above.

## Testing the route table

Routing bugs hide well: every handler can pass its own tests while the route table as a whole is wrong. Three kinds of test catch them:

- **A route-table test.** For each route you expect, check that it is registered (`router.list()`) and that `router.match` sends a sample path to it. This catches dead routes and forgotten registrations.
- **Edge requests.** Wrong method (405), unknown path (404), repeated keys, encoded slashes, trailing slash and case, whichever policy you chose.
- **Raw targets through a real server.** Dot segments and backslashes must be refused, as shown above.

The first kind needs no server at all:

route-table.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";

const router = createRouter();
router.get("/tasks", () => []);
router.get("/tasks/stats", () => ({}));
router.get("/tasks/:id(\\d+)", () => ({}));
router.post("/tasks", () => ({}));

const expected: [method: string, sample: string, pattern: string][] = [
  ["GET", "/tasks", "/tasks"],
  ["GET", "/tasks/stats", "/tasks/stats"],
  ["GET", "/tasks/42", "/tasks/:id(\\d+)"],
  ["POST", "/tasks", "/tasks"],
  ["DELETE", "/tasks/42", "/tasks/:id"],
];

for (const [method, sample, pattern] of expected) {
  const match = router.match(method, sample);
  const ok = match.route?.path === pattern;
  console.log(`${ok ? "PASS" : "FAIL"} ${method} ${sample} -> ${match.route?.path ?? `no route (allowed: ${match.allowedMethods.join(", ") || "none"})`}`);
}
```

Output of `npx tsx route-table.ts`

```ts
PASS GET /tasks -> /tasks
PASS GET /tasks/stats -> /tasks/stats
PASS GET /tasks/42 -> /tasks/:id(\d+)
PASS POST /tasks -> /tasks
FAIL DELETE /tasks/42 -> no route (allowed: GET)
```

The last line is a deliberate failure: the table has no `DELETE` route, and the test says so, naming the methods the path does allow. A table like `expected` doubles as documentation of your API's surface.

## Put it in the Task API

The Task API gets a statistics route: `GET /tasks/stats` answers how many tasks are open and done, optionally only for some priorities: `?priority=high&priority=normal`. It shows three ideas from this lesson: a literal route next to `/tasks/:id`, a repeated query key as a list, and a route that is proven reachable by a test.

Counting belongs in a service, not in the route file. The route reads the request, the service reads the store. Create `src/services/tasks.stats.service.ts`. It reads the `TaskStore` you have had since [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#task-api):

**Show the unchanged task store**

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

src/services/tasks.stats.service.tsNode.js only

```ts
import type { Priority, TaskStore } from "../repositories/tasks.store.js";

export const PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

export interface TaskStats {
  readonly priorities: readonly Priority[];
  readonly total: number;
  readonly open: number;
  readonly done: number;
}

export class TaskStatsService {
  public constructor(private readonly store: TaskStore) {}

  public count(priorities: readonly Priority[] = PRIORITIES): TaskStats {
    const matching = [...this.store.tasks.values()].filter((task) => priorities.includes(task.priority));
    const done = matching.filter((task) => task.done).length;
    return { priorities, total: matching.length, open: matching.length - done, done };
  }
}
```

Then the route, in its own file `src/routes/tasks.stats.routes.ts`. `queryArray` accepts zero, one or several `priority` keys; anything that is not a priority is a 400, and duplicates are removed:

src/routes/tasks.stats.routes.tsNode.js only

```ts
import { badRequest, toRouterContext } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";
import type { Priority } from "../repositories/tasks.store.js";
import { PRIORITIES } from "../services/tasks.stats.service.js";
import type { TaskStatsService } from "../services/tasks.stats.service.js";

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/** GET /tasks/stats?priority=high&priority=normal: open and done counts. */
export function registerTaskStatsRoutes(router: HttpRouter, stats: TaskStatsService): void {
  router.get(
    "/tasks/stats",
    (ctx) => {
      const requested = toRouterContext(ctx).queryArray("priority");
      if (!requested.every(isPriority)) {
        throw badRequest("priority must be low, normal or high");
      }
      return stats.count(requested.length > 0 ? [...new Set(requested)] : PRIORITIES);
    },
    { name: "tasks.stats" },
  );
}
```

The error message lists the allowed values and does not repeat what the client sent. Now wire both in, as [the DI architecture lesson](https://zudojs.oyinlola.site/learn/zudo-di-architecture) taught: the container builds the service, the composition root hands it to the routes. In `src/container.ts`, import `TaskStatsService`, register it in `registerServices`, and resolve it in `createDependencies`:

src/container.ts (part)Node.js only

```ts
import { TaskStatsService } from "./services/tasks.stats.service.js";

// in registerServices():
  container.registerFactory(TaskStatsService, (store) => new TaskStatsService(store), [TaskStore], {
    scope: ContainerScope.SINGLETON,
  });

// in createDependencies(), next to tasks:
    tasks: options.container.resolve(TaskService),
    taskStats: options.container.resolve(TaskStatsService),
```

In `src/routes/index.ts`, register the route next to the task routes, outside the markers:

src/routes/index.ts (part)Node.js only

```ts
import { registerTaskStatsRoutes } from "./tasks.stats.routes.js";

  registerTaskRoutes(router, deps.tasks);
  registerTaskStatsRoutes(router, deps.taskStats);
```

The order of the two calls does not matter: `/tasks/stats` is a literal and beats `/tasks/:id` either way. The startup check from [DI architecture](https://zudojs.oyinlola.site/learn/zudo-di-architecture#production) now covers `TaskStatsService` too. A check script builds the task routes on one store and proves the table, the statistics and the refusals. The route and service files from [the HTTP lesson](https://zudojs.oyinlola.site/learn/zudo-http#task-api) are unchanged:

**Show the unchanged files**

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

src/utils/http.ts

```ts
import { HttpError, badRequest, createResponseContext } from "@zudojs/http";
import type { HttpResponseContext, HttpRouterContext } from "@zudojs/http";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
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
```

src/routes/tasks.routes.ts

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

This page shows only the parts of `src/utils/http.ts` the routes use; your file keeps its other helpers. Save the script as `src/check-routes.ts`:

src/check-routes.tsNode.js only

```ts
import { request } from "node:http";
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { FixedClock } from "@zudojs/types";
import { TaskStore } from "./repositories/tasks.store.js";
import { registerTaskStatsRoutes } from "./routes/tasks.stats.routes.js";
import { registerTaskRoutes } from "./routes/tasks.routes.js";
import { TaskStatsService } from "./services/tasks.stats.service.js";
import { TaskService } from "./services/tasks.service.js";

const store = new TaskStore();
const tasks = new TaskService(store, new FixedClock(Date.parse("2026-09-24T09:00:00Z")));
const router = createRouter();
registerTaskRoutes(router, tasks);
registerTaskStatsRoutes(router, new TaskStatsService(store));

console.log("route table:");
for (const [method, sample, pattern] of [
  ["GET", "/tasks", "/tasks"],
  ["GET", "/tasks/stats", "/tasks/stats"],
  ["GET", "/tasks/42", "/tasks/:id"],
  ["POST", "/tasks", "/tasks"],
]) {
  const answered = router.match(method, sample).route?.path;
  console.log(`  ${answered === pattern ? "PASS" : "FAIL"} ${method} ${sample} -> ${answered}`);
}

tasks.create({ title: "Pay the ₦45,000 electricity bill", priority: "high" });
tasks.create({ title: "Buy milk", done: true });
tasks.create({ title: "Book the plumber", priority: "high", done: true });

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (req) => (await router.dispatch(req)).response,
});
await server.start();
function rawGet(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.address?.port, path: target }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(`${res.statusCode} ${body}`));
    });
    req.on("error", reject);
    req.end();
  });
}
console.log("requests:");
for (const target of [
  "/tasks/stats",
  "/tasks/stats?priority=high",
  "/tasks/stats?priority=high&priority=normal&priority=high",
  "/tasks/stats?priority=urgent",
  "/tasks/1",
  "/tasks/../tasks/stats",
]) {
  console.log(" ", target, "->", await rawGet(target));
}
await server.stop();
```

Output of `npx tsx src/check-routes.ts`

```ts
route table:
  PASS GET /tasks -> /tasks
  PASS GET /tasks/stats -> /tasks/stats
  PASS GET /tasks/42 -> /tasks/:id
  PASS POST /tasks -> /tasks
requests:
  /tasks/stats -> 200 {"priorities":["low","normal","high"],"total":3,"open":1,"done":2}
  /tasks/stats?priority=high -> 200 {"priorities":["high"],"total":2,"open":1,"done":1}
  /tasks/stats?priority=high&priority=normal&priority=high -> 200 {"priorities":["high","normal"],"total":3,"open":1,"done":2}
  /tasks/stats?priority=urgent -> 400 {"error":"priority must be low, normal or high","code":"BAD_REQUEST"}
  /tasks/1 -> 200 {"id":1,"title":"Pay the ₦45,000 electricity bill","done":false,"priority":"high","createdAt":"2026-09-24T09:00:00.000Z"}
  /tasks/../tasks/stats -> 400 {"error":"Bad Request"}
```

The table test passes for all four routes, including the literal `/tasks/stats` next to `/tasks/:id`. The repeated `high` was counted once, the unknown priority got a 400, and the dot-segment trick was refused before routing. Run it in your project, and check that the app still type-checks:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx src/check-routes.ts
```

It prints the same lines as above. With `npm run dev` running, `curl "http://localhost:3000/tasks/stats?priority=high&priority=normal"` answers from the real store, which starts with the one task the `tasks` module adds.

## Practice

TRY IT YOURSELF

### Find the dead route

A teammate's route table is below. Without running it, predict which handler answers each of `GET /orders/latest`, `GET /orders/2026-09`, `GET /orders/17` and `GET /orders/17/items`, and which route can never run. Then run it and use `router.match` to prove your answer.

**Show a solution**

orders.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { hit } from "./hit.js";

const router = createRouter();
router.get("/orders/:month(\\d{4}-\\d{2})", (ctx) => ({ route: "by month", month: ctx.params.month }));
router.get("/orders/:id", (ctx) => ({ route: "one order", id: ctx.params.id }));
router.get("/orders/:number(\\d+)", (ctx) => ({ route: "by number", number: ctx.params.number }));
router.get("/orders/latest", () => ({ route: "latest" }));
router.get("/orders/*rest", (ctx) => ({ route: "catch-all", rest: ctx.params.rest }));

for (const url of ["/orders/latest", "/orders/2026-09", "/orders/17", "/orders/17/items"]) {
  await hit(router, "GET", url);
}
console.log("by number reachable:", router.match("GET", "/orders/17").route?.path === "/orders/:number(\\d+)");
```

Output of `npx tsx orders.ts`

```ts
GET /orders/latest -> 200 {"route":"latest"} [/orders/latest]
GET /orders/2026-09 -> 200 {"route":"by month","month":"2026-09"} [/orders/:month(\d{4}-\d{2})]
GET /orders/17 -> 200 {"route":"one order","id":"17"} [/orders/:id]
GET /orders/17/items -> 200 {"route":"catch-all","rest":"17/items"} [/orders/*rest]
by number reachable: false
```

The literal `latest` wins over every parameter. `2026-09` matches both the month route and `:id`; the month route was registered first, so it wins. `17` matches `:id` and `:number(\\d+)`, which tie, and `:id` came first: the `by number` route is dead. Two segments reach only the wildcard. Fix it by moving the `:number` route above `:id`, or better, by deleting one of them.

TRY IT YOURSELF

### A strict, versioned group

Build a router with a `/api/v2` group containing `GET /bookings` and `GET /bookings/:id`. The group must require a header `x-client: mobile` (401 otherwise), and `:id` must be a UUID-like value of hex digits and dashes (`[0-9a-f-]{36}`). Show a good request, a missing header, and a bad id.

**Show a solution**

bookings.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { hit } from "./hit.js";

const mobileOnly: HttpMiddleware = async (context, next) =>
  context.request.getHeader("x-client") === "mobile"
    ? next()
    : createResponseContext({ status: 401 }).json({ error: "Unknown client" });

const router = createRouter();
router.group(
  "/api/v2",
  (v2) => {
    v2.get("/bookings", () => [{ id: "7d9f0c7a-2b1e-4c5a-9f3e-1a2b3c4d5e6f", room: "Ikoyi suite" }]);
    v2.get("/bookings/:id([0-9a-f-]{36})", (ctx) => ({ id: ctx.params.id, room: "Ikoyi suite" }));
  },
  { middleware: [mobileOnly] },
);

const mobile = { "x-client": "mobile" };
await hit(router, "GET", "/api/v2/bookings/7d9f0c7a-2b1e-4c5a-9f3e-1a2b3c4d5e6f", mobile);
await hit(router, "GET", "/api/v2/bookings");
await hit(router, "GET", "/api/v2/bookings/42", mobile);
```

Output of `npx tsx bookings.ts`

```ts
GET /api/v2/bookings/7d9f0c7a-2b1e-4c5a-9f3e-1a2b3c4d5e6f -> 200 {"id":"7d9f0c7a-2b1e-4c5a-9f3e-1a2b3c4d5e6f","room":"Ikoyi suite"} [/api/v2/bookings/:id([0-9a-f-]{36})]
GET /api/v2/bookings -> 401 {"error":"Unknown client"} [/api/v2/bookings]
GET /api/v2/bookings/42 -> 404 {"error":"Not Found","method":"GET","path":"/api/v2/bookings/42"}
```

The middleware belongs to the group, so no route can forget it. The id that does not fit the constraint matches no route at all, which is a 404: from the client's point of view, there is no such booking URL.

TRY IT YOURSELF

### Refuse polluted parameters

Write `pageOf(ctx)` for `GET /tasks?page=N`: missing means 1; repeated means 400; anything but a whole number from 1 to 1000 means 400. Test `?page=3`, no page, `?page=2&page=9` and `?page=0`.

**Show a solution**

page.tsNode.js only

```ts
import { badRequest, createRouter, toRouterContext } from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import { hit } from "./hit.js";

function pageOf(ctx: HttpRouterContext): number {
  const values = toRouterContext(ctx).queryArray("page");
  if (values.length > 1) throw badRequest('Send "page" at most once');
  if (values.length === 0) return 1;
  const page = /^\d{1,4}$/.test(values[0] ?? "") ? Number(values[0]) : NaN;
  if (!(page >= 1 && page <= 1000)) throw badRequest("page must be a whole number from 1 to 1000");
  return page;
}

const router = createRouter();
router.get("/tasks", (ctx) => ({ page: pageOf(ctx) }));

for (const url of ["/tasks?page=3", "/tasks", "/tasks?page=2&page=9", "/tasks?page=0"]) {
  await hit(router, "GET", url);
}
```

Output of `npx tsx page.ts`

```ts
GET /tasks?page=3 -> 200 {"page":3} [/tasks]
GET /tasks -> 200 {"page":1} [/tasks]
GET /tasks?page=2&page=9 -> 400 (thrown HttpError: Send "page" at most once)
GET /tasks?page=0 -> 400 (thrown HttpError: page must be a whole number from 1 to 1000)
```

Handling the three cases (none, one, several) explicitly is what `queryArray` makes easy. The regular expression refuses signs, decimals and spaces before `Number` ever sees them.

## Recap

- Register with the method helpers, `all`, `on` or `add`. Exact duplicates throw `RouteConflictError`, bad patterns `InvalidRoutePatternError`; every registration returns a remover.
- Patterns: `:id`, `:id?`, `:id(\\d+)`, `{id}` and a trailing `*rest`. Parameters are decoded strings; encoded slashes and dot segments never match. `buildRoutePath` goes the other way, with encoding.
- Matching is by specificity, literal over parameter over wildcard, segment by segment. Ties, including a constrained against an unconstrained parameter, go to the first registered route, and shadowed routes are not reported: test them with `router.match`.
- HEAD and OPTIONS are automatic; a wrong method gets 405 with `Allow`.
- Route middleware runs after matching and can read parameters; `state` is shared with the handler. Groups add a prefix and middleware to many routes at once, outer group first.
- Repeated query keys become arrays. Use `queryArray` for lists and refuse repeats for single values; the parser drops `__proto__` and enforces size limits.
- The router collapses slashes and, by default, ignores case and trailing slashes. The Node adapter refuses dot segments, backslashes and other non-canonical targets with 400 before anything else runs.

Next, [Middleware, CORS, security headers and graceful shutdown](https://zudojs.oyinlola.site/learn/zudo-middleware) looks at the pipeline around the router: the middleware every request passes through before any route is matched.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
