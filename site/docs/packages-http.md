---
title: "@zudojs/http — HTTP Server, Routing & Middleware"
description: "@zudojs/http docs for ZudoJS: server, router, middleware, client, CORS and security headers, OpenAPI from routes, and fetch handler mounting."
source: https://zudojs.oyinlola.site/docs/packages-http
---

v1.4.0

# @zudojs/http

Run an HTTP server on Node, route requests, build responses, chain middleware, and call other services with a typed HTTP client.

HTTP SERVER ROUTING MIDDLEWARE

## OVERVIEW

`@zudojs/http` is the part of Zudo that talks to the web. It gives you a server that listens for requests from browsers and other programs, and a client for sending requests yourself.

HTTP is the language browsers and servers use. A *request* is a message sent to your server: a method (like `GET` or `POST`), a URL, some headers, and maybe a body. A *response* is your reply: a status code (like `200` or `404`), headers, and a body.

Everything in this package works on two objects: `HttpRequestContext` (what came in) and `HttpResponseContext` (what goes out). The server, router, middleware, and error helpers all pass these two around.

### When you need it

- You want to expose an API or serve pages from a Node process.
- You want URL routing (`/users/:id`), middleware, or CORS and security headers.
- You want to call another HTTP service with retries and timeouts.

### When you don't

- Your code never listens on a port or calls a URL (a CLI, a background worker).
- You already run Express, Fastify, or Hono and only need Zudo's other packages.

## INSTALLATION

Install the package with npm. Its runtime dependencies (`@zudojs/crypto`, `@zudojs/errors`, `@zudojs/logger`, `@zudojs/middleware`, `@zudojs/openapi`, `@zudojs/security`) are installed automatically. Node 24 or newer is required.

```bash
$ npm install @zudojs/http
```

> **Source of truth**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

The smallest server needs two things: an *adapter* and a *handler*. An adapter is the piece that knows how to talk to a real runtime (here, Node's built-in `http` module). A handler is your function that receives a request and returns a response.

This code starts a server on port 3000 that answers every request with a small JSON object.

```ts
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 3000,
  handler: (request) =>
    createResponseContext()
      .setStatus(200)
      .json({ hello: "world", path: request.path }),
});

await adapter.start();

console.log(`Listening on http://127.0.0.1:${adapter.address?.port}`);
// Listening on http://127.0.0.1:3000
```

Open a second terminal and send a request. You should see the JSON reply.

```bash
$ curl http://127.0.0.1:3000/greet
{"hello":"world","path":"/greet"}
```

Call `await adapter.stop()` to shut the server down. Pass `port: 0` to let the operating system pick a free port; `adapter.address.port` then tells you which one.

## REQUEST & RESPONSE

`HttpRequestContext` holds everything about the incoming request. You never build one yourself on the server; the adapter creates it and hands it to your handler. `HttpResponseContext` is what you build and return. Every setter returns the context, so calls chain.

The request body arrives as raw bytes (a `Uint8Array`), already read for you and capped at `maxBodySize` (10 MB by default). Decode it and parse it yourself.

This handler reads a query parameter, a header, and a JSON body, then echoes them back.

```ts
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";

function handler(request: HttpRequestContext) {
  const name = request.getQuery("name") ?? "stranger";
  const agent = request.getHeader("user-agent");
  const text = new TextDecoder().decode(request.body as Uint8Array);
  const body = text.length > 0 ? JSON.parse(text) : {};

  return createResponseContext()
    .setStatus(200)
    .setHeader("x-request-id", request.id)
    .json({ method: request.method, name, agent, body });
}

const adapter = createNodeHttpAdapter({ port: 3000, handler });

await adapter.start();
```

```bash
$ curl -X POST "http://127.0.0.1:3000/?name=Ada" -d '{"age":36}'
{"method":"POST","name":"Ada","agent":"curl/8.5.0","body":{"age":36}}
```

Any other return value, including a plain object with keys such as `status` or `body`, is sent as a `200` JSON response. To choose the status or headers, return `createResponseContext({ status, headers, body })`. Returning nothing sends an empty `200`.

```ts
const adapter = createNodeHttpAdapter({
  port: 3000,
  handler: () => ({ ok: true }), // same as createResponseContext().json({ ok: true })
});
```

### Request: what you can read

| Member | What it gives you | Notes |
| --- | --- | --- |
| `method` | `"GET"`, `"POST"`, and so on | Always upper-case. |
| `url / path` | Full URL and just the path part | `path` has no query string. |
| `getHeader(name)` | One header value or `undefined` | Names are case-insensitive. Also `hasHeader`, `headers`. |
| `getQuery(name)` | One query value, an array for repeats, or `undefined` | Also `query` for the whole object. `request.query`, the router's `ctx.query` and the exported `parseQueryString` use the same hardened parser: the record has a `null` prototype, `__proto__`/`constructor`/`prototype` are dropped, and a query past the parser's limits (1000 keys, 16 KB per value, 1 MB total) throws `HTTPQueryLimitError` (`414`). |
| `body` | Raw bytes as `Uint8Array` | Empty array when there is no body. |
| `id` | A unique request id | The client's `x-request-id` is reused when it is 1–128 characters of `[A-Za-z0-9._:-]`; any other value is ignored and a UUID is generated. See [Request ids](#request-ids). |
| `remoteAddress` | The caller's IP address | The socket peer. `X-Forwarded-For` is read only when the adapter's `trustProxy` matches that peer, and `trustProxy` defaults to `false`. |
| `protocol / hostname / port` | The scheme, host and port the request arrived on | From the socket and the `Host` header. `X-Forwarded-Proto` and `X-Forwarded-Host` are read only under `trustProxy`, and a forwarded scheme that is not `http` or `https` is discarded. |
| `getState(key) / setState(key, value)` | Per-request scratch space | Use it to pass data between middleware and handlers. |
| `signal` | An `AbortSignal`, or `undefined` | The Node adapter sets one that aborts when the client disconnects. Before, a signal passed in was dropped, so it could never fire. |

### Response: what you can set

| Method | What it does | Notes |
| --- | --- | --- |
| `setStatus(code, text?)` | Sets the status code | Status text is filled in for you. |
| `json(data)` | Sets a JSON body and `content-type` | Returns the context, so you can keep chaining. |
| `text(string) / html(string)` | Sets a text or HTML body | Sets the matching `content-type`. |
| `setHeader(name, value)` | Sets one header | Also `removeHeader`. Values with line breaks are rejected when written. |
| `cookie(name, value, options?)` | Adds a `Set-Cookie` header | Options: `httpOnly`, `secure`, `sameSite`, `maxAge`, `path`. Defaults: `Path=/; HttpOnly; Secure; SameSite=Lax`. |
| `redirect(url, status = 302)` | Sets `location` and the status | Throws `TypeError` for `javascript:`/`data:`, scheme-relative (`//host`) or control-character destinations. |

> **Common mistake**
>
> Building a response and forgetting to `return` it. The handler then returns `undefined`, and the client gets an empty `200`.

## SERVER

`createHttpServer` wraps an adapter with lifecycle management: a *state* you can inspect (`created`, `starting`, `running`, `stopping`, `stopped`, `failed`), events you can listen to, and a graceful shutdown that waits for in-flight requests.

You can run an adapter on its own, as in the quick start. Reach for the server when you want start/stop events, a request counter, or one object to hand to the rest of your application.

This starts a server, prints its state and address, and stops cleanly on `Ctrl+C`.

```ts
import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
} from "@zudojs/http";

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: () => createResponseContext().json({ ok: true }),
});

server.on("onStarted", () => console.log("server started"));
server.on("onStopped", () => console.log("server stopped"));

await server.start();
// server started

console.log(server.state, server.address);
// running { host: "127.0.0.1", port: 3000, family: "IPv4" }

process.on("SIGINT", async () => {
  await server.stop();
  // server stopped
  process.exit(0);
});
```

`server.on(event, listener)` adds a listener after construction and returns a function that removes it again. `server.snapshot()` returns a plain object with the name, state, address, start time, uptime in milliseconds, and request count.

The options object is typed as `HttpServerOptions`, so TypeScript knows what `handler` receives. Under `strict`, `handler: async (request) => request.path` compiles as written; before v1.4.0 the options were `unknown` and the same line failed with *TS7006: Parameter 'request' implicitly has an 'any' type*.

### Server options

| Option | What it does | Notes |
| --- | --- | --- |
| `adapter` | The runtime adapter (required) | Use `createNodeHttpAdapter`. |
| `handler` | Your request handler | Installed on the adapter for you. Without one, every request gets a `500`. Typed as `HttpHandler`, so `request` needs no annotation. |
| `errorHandler` | Turns a thrown error into a response | See [Errors](#errors). |
| `events` | Lifecycle listeners | `onStarting`, `onStarted`, `onStopping`, `onStopped`, `onError`. `server.on(...)` adds more later. |
| `gracefulShutdownTimeout` | How long `stop()` waits for in-flight requests, in ms | Default `30000`. `stop({ force: true })` skips the wait. |
| `name` | A label used in logs and snapshots | Default `"zudojs-http"`. |

### Node adapter options

| Option | What it does | Notes |
| --- | --- | --- |
| `host / port` | Where to listen | Defaults `127.0.0.1` and `3000`. `port: 0` picks a free port. |
| `maxBodySize` | Largest request body accepted, in bytes | Default 10 MB. Bigger bodies get a `413`. |
| `trustProxy` | Which socket peers may speak for a client through `X-Forwarded-*` | Default `false`: forwarded headers are ignored entirely. Also `true` or `"all"` (trust every hop), a hop count (trust that many proxies nearest the server; `0` trusts nothing), a preset (`"loopback"`, `"linklocal"`, `"uniquelocal"`/`"private"`), an IP or CIDR range, a comma-separated list or array of either, or a predicate `(address, hop) => boolean`. A string that is none of these throws `TypeError` when the adapter is constructed. |
| `security` | Request guard run before each request | On by default; an `HTTPSecurityConfig` object to tune, `false` to disable. |
| `trustRequestId` | Reuse a well-formed incoming `x-request-id` as `request.id` | Default `true`. `false` always generates a fresh UUID. See [Request ids](#request-ids). |
| `headersTimeout / requestTimeout / keepAliveTimeout` | Timeouts in ms | Defaults `10000` / `30000` / `5000`, tighter than Node's own. |
| `maxConnections` | Cap on open connections | Unlimited by default. |
| `shutdownGraceMs` | Grace period for in-flight requests during `stop()` | Default `10000`. |
| `events` | Adapter-level listeners | `onListening(address)`, `onClose()`, `onError(error)`. |

> **Changed in v1.3.0: forwarded headers are not trusted by default**
>
> Before v1.3.0 the request objects built by `createHTTPRequest`, `createHTTPAdapter`, `NodeHTTPAdapter`, `adaptNodeRequest` and `adaptNodeContext` read `X-Forwarded-For` and `X-Forwarded-Proto` from any client, with no trust check: a caller connecting directly chose its own `request.ip` (defeating an allowlist, a per-IP rate limit or an audit trail) and could set `request.secure` to `true` with a header. Those headers are now honoured only when the socket peer matches `trustProxy`, which defaults to `false`, and a forwarded scheme other than `http` or `https` is discarded. `createNodeHttpAdapter` already gated them.
>
>
>
> If you run behind a proxy you must now opt in, on whichever entry point you use:

```ts
createNodeHttpAdapter({ port: 3000, trustProxy: "10.0.0.0/8", handler });
createHTTPAdapter({ trustProxy: "10.0.0.0/8" });
adaptNodeRequest(req, { trustProxy: "10.0.0.0/8" });
adaptNodeContext(req, res, { trustProxy: "10.0.0.0/8" });
createHTTPRequest(req, { trustProxy: "10.0.0.0/8" });
```

Without it, the client address is the socket peer and the protocol reflects the socket's own TLS state. The standalone `getRequestProtocol(request, trustProxy?)` and `getRequestIP(request, trustProxy?)` take the same value as an optional second argument, and default to `false` too.

### Request ids

Every request has an id, `request.id`, that you can write into log lines so all the lines for one request can be found together. When a proxy or another service has already given the request an id in the `x-request-id` header, the Node adapter reuses it, so the same id follows the request from service to service.

Only a safe value is reused: 1–128 characters of letters, digits, `.`, `_`, `:` and `-`. Anything else is ignored and a UUID is generated instead, so an id copied into your logs can never carry spaces, quotes or control characters.

```ts
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  port: 3000,
  handler: (request) => createResponseContext().json({ id: request.id }),
});

await adapter.start();
```

```bash
$ curl -H "x-request-id: trace-7f3a.span:42" http://127.0.0.1:3000/
{"id":"trace-7f3a.span:42"}

$ curl http://127.0.0.1:3000/
{"id":"872207cd-9d9e-4357-9b93-d4adeb5eece3"}

$ curl -i -H "x-request-id: has space" http://127.0.0.1:3000/
HTTP/1.1 400 Bad Request
{"error":"Bad Request"}
```

The last request never reaches the handler: the adapter's request guard checks the header first and answers `400` to a malformed one. The guard's default `requestIdPattern` is the same rule as the reuse rule, so ids containing `.` or `:` (common in trace ids) now pass; they used to be refused with `400`. With `security: false` a malformed id is simply ignored and a UUID generated.

Before v1.4.0 the Node adapter always generated a new id, although the docs said it reused the header. If your server is reached directly by clients and you don't want them choosing the ids that appear in your logs, pass `createNodeHttpAdapter({ trustRequestId: false })`. The rule itself is exported as `resolveIncomingRequestId(value)`, which returns the id to reuse or `undefined`.

> **Watch out**
>
> `host`, `port`, and `trustProxy` belong on the adapter, not on `createHttpServer`. The server options type does not accept them, so TypeScript will tell you.

## ROUTER

A *router* picks which function runs for a given method and path. Instead of one big handler full of `if` statements, you register routes like `GET /users/:id` and the router does the matching.

The router is not wired to the server automatically. Your handler calls `router.dispatch(request)`, which returns `{ response, route }`, and returns the response.

This registers two routes and connects the router to a server. `:id` is a *parameter*: it matches one path segment and lands in `ctx.params.id`.

```ts
import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
  createRouter,
} from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";

const router = createRouter();

router.get("/users/:id", (ctx) =>
  createResponseContext().json({ id: ctx.params.id, query: ctx.query }),
);

router.post("/users", (ctx) => {
  const text = new TextDecoder().decode(ctx.request.body as Uint8Array);
  const body = JSON.parse(text);

  return createResponseContext().setStatus(201).json({ created: body.name });
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 3000 }),
  handler: async (request: HttpRequestContext) => {
    const result = await router.dispatch(request);

    return result.response;
  },
});

await server.start();
```

Unknown paths get a `404` and known paths with the wrong method get a `405`, both as JSON, without any extra code.

```bash
$ curl "http://127.0.0.1:3000/users/42?verbose=1"
{"id":"42","query":{"verbose":"1"}}

$ curl -X POST http://127.0.0.1:3000/users -d '{"name":"Ada"}'
{"created":"Ada"}

$ curl http://127.0.0.1:3000/nope
{"error":"Not Found","method":"GET","path":"/nope"}

$ curl -X DELETE http://127.0.0.1:3000/users/1
{"error":"Method Not Allowed","method":"DELETE","path":"/users/1","allowed":["GET"]}
```

### What a route handler receives

The handler gets one `ctx` object of type `HttpRouterContext`. It is not the request itself; the request lives at `ctx.request`.

| Member | What it gives you | Notes |
| --- | --- | --- |
| `ctx.request` | The `HttpRequestContext` | Headers, body, id, and so on. |
| `ctx.params` | Path parameters as strings | `/users/:id` gives `{ id: "42" }`. Values are URL-decoded after matching; `..` and encoded slashes never match. |
| `ctx.query` | Query string as an object | Repeated keys become arrays. |
| `ctx.route` | The matched route definition | Has `id`, `method`, `path`, `name`, `metadata`. |
| `ctx.state` | A `Map` shared by this request's middleware and handler |  |
| `ctx.signal` | An `AbortSignal` | On the Node adapter it aborts when the client disconnects before the response is finished. Pass it to slow work. |

### What a route handler can return

You don't have to build a response for every route. A route handler may return a plain JSON value — an object, array, string, number or boolean — and it is sent as `200` with a JSON body, exactly like a server handler's return value. Returning `undefined` or `null` sends `204 No Content`. An `HttpResponseContext` or a web `Response` is sent as built, for when you need another status or headers.

```ts
router.get("/health", () => ({ status: "ok" }));        // 200, JSON body
router.delete("/users/:id", () => undefined);           // 204, empty body
router.post("/users", () =>
  createResponseContext().setStatus(201).json({ created: true }),
);
```

```bash
$ curl -i http://127.0.0.1:3000/health
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok"}

$ curl -i -X DELETE http://127.0.0.1:3000/users/42
HTTP/1.1 204 No Content
```

Before v1.4.0 a plain object was a type error for a route handler and, if you forced it through, went out as an empty `204`. The router and the lower-level `RouteDispatcher` now agree. The accepted return type is exported as `RouterHandlerResult` (with `RouterJsonValue` for the JSON part).

### Groups and route middleware

`router.group(prefix, fn)` registers several routes under one prefix. The `middleware` option on any route runs those middleware for that route only.

```ts
router.group("/api", (api) => {
  api.get("/health", () => createResponseContext().json({ status: "ok" }));
  api.get("/version", () => createResponseContext().json({ version: "1.0.0" }));
});
// GET /api/health and GET /api/version now exist
```

Anything route middleware writes to `context.response` before calling `next()` — headers, cookies, status, metadata — survives when the handler returns a response of its own. A guard that sets a security header and delegates therefore affects the response that is sent.

Route parameters are set on the request *before* route middleware runs, so a guard can read them with `ctx.request.getParam("id")`, just as the handler reads `ctx.params.id`. Before v1.4.0 they were only filled in for the handler, so a guard or an `extractResource` loader that looked up the resource by id always saw nothing and denied the request. The [guard example below](#guard-responses) relies on this.

### Route patterns

A pattern is a path split into segments. A literal segment matches itself; the other kinds capture into `ctx.params`.

| Pattern | What it matches | Notes |
| --- | --- | --- |
| `/users/:id` | One required segment | `ctx.params.id`. |
| `/account/:id?/profile` | The segment, or nothing | Optional. `ctx.params.id` is `undefined` when it is absent, and the parameter only claims a segment while the segments after it still have input left. |
| `/users/:id(\d+)` | A segment matching the expression | Write the backslash twice in a string literal: `"/users/:id(\\d+)"`. |
| `/files/{name}`, `/files/{name?:\w+}` | Brace form of the same | Optional and constrained forms included. |
| `/assets/*path` | The rest of the path | Trailing wildcard. Each segment is decoded separately, so `%2f` and `%2e%2e` cannot escape the prefix. |

When more than one pattern matches, the router compares their segments left to right by kind — literal beats parameter, parameter beats wildcard — and the first difference decides; registration order breaks a tie. So `/admin/*rest` wins over `/:a/:b/:c/:d` for `GET /admin/a/b/c`. Before v1.3.0 the kinds were summed into a single score, which let the longer all-parameter pattern win and bypass the guards registered on the admin route.

### Router options

| Option | What it does | Notes |
| --- | --- | --- |
| `caseSensitive` | Whether `/Users` and `/users` differ | Default `false`. |
| `strictTrailingSlash` | Whether `/users/` and `/users` differ | Default `false`. Enforced since v1.3.0; a strict router used to store the option and still answer `/users/` with the `/users` route. |
| `automaticHead` | Answer `HEAD` using the matching `GET` route | Default `true`. |
| `automaticOptions` | Answer `OPTIONS` with an `Allow` header | Default `true`. The answer is a `204` from a synthetic route with no middleware, so an `OPTIONS` request never runs another method's handler. `Allow` honours `caseSensitive`. |
| `notFoundHandler / methodNotAllowedHandler` | Replace the default 404 / 405 responses | Receive `{ request, path, method, signal, state }`. |

For the lower-level path, `createRouteDispatcher(matcher, options)` takes `RouteDispatchOptions`. Its `preserveResponse` (default `false`) keeps the response the middleware chain built instead of merging the handler's response into it; before v1.3.0 the option was declared and never read.

> **Common mistake**
>
> Registering the same method and path twice throws `RouteConflictError` at startup. Each `router.get(...)` call returns a function that removes the route again, which is handy in tests. Registering both `/users/:id` and `/users/:id?` is not a conflict.

## MIDDLEWARE

*Middleware* is a function that runs around your handler. It receives the request and response, plus a `next()` function that runs whatever comes after it. Middleware can do work before `next()` (check a token), after it (add a header), or skip `next()` entirely and answer on its own.

A `HttpMiddlewarePipeline` holds a list of middleware in order. `use()` adds one, `execute(request, response)` runs them all and returns the final response.

This pipeline has three steps: an auth check that runs first, a timer that adds a header, and a final step that produces the response. It runs without a server, which is also how you would unit-test it.

```ts
import {
  HttpMiddlewarePipeline,
  createRequestContext,
  createResponseContext,
} from "@zudojs/http";

const pipeline = new HttpMiddlewarePipeline();

pipeline.use(
  async (context, next) => {
    if (!context.request.hasHeader("authorization")) {
      return context.response.setStatus(401).json({ error: "Unauthorized" });
    }

    return next();
  },
  { name: "auth", priority: -100 }, // lower priority runs earlier
);

pipeline.use(
  async (context, next) => {
    const started = Date.now();
    const response = await next();

    return response.setHeader("x-response-time", `${Date.now() - started}ms`);
  },
  { name: "timing" },
);

pipeline.use(async (context) => context.response.json({ ok: true }));

const request = createRequestContext({
  method: "GET",
  url: "/secure",
  headers: { authorization: "Bearer abc" },
});

const response = await pipeline.execute(request, createResponseContext());

console.log(response.status, response.body, response.headers);
// 200 {"ok":true} { "content-type": "application/json", "x-response-time": "0ms" }
```

Without the `authorization` header the first middleware answers by itself, and the other two never run.

### Wiring a pipeline into a server

Make the last middleware dispatch the router, then call the pipeline from your server handler.

```ts
pipeline.use(async (context) => {
  const result = await router.dispatch(context.request);

  return result.response;
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 3000 }),
  handler: (request: HttpRequestContext) =>
    pipeline.execute(request, createResponseContext()),
});
```

### Rules the pipeline enforces

- Ordering is by `priority` (lowest first), then registration order.
- Calling `next()` twice throws `HttpMiddlewareError`.
- A middleware that throws stops the chain, and the error propagates unchanged: an outer middleware's `await next()` rejects with it, and so does `execute()`. Code after `await next()` does not run unless the middleware catches. The pipeline's `onError` option can return a recovery response; if `onError` throws, its own error propagates. See [When a middleware throws](#middleware-errors).
- `use()` returns a function that removes the middleware. `enable(id)` / `disable(id)` toggle one by id.

### When a middleware throws

An error thrown by a middleware or a handler travels back up the chain *as the error that was thrown*. Every middleware that is waiting on `await next()` gets it, and if nobody catches it, the server's `errorHandler` gets it too. So `isHttpError(error)`, `error.statusCode` and `instanceof` checks work wherever you catch it.

This middleware turns a `404` thrown further down into a JSON reply and lets every other error continue upward:

```ts
import {
  HttpMiddlewarePipeline,
  createRequestContext,
  createResponseContext,
  isHttpError,
  notFound,
} from "@zudojs/http";

const pipeline = new HttpMiddlewarePipeline();

pipeline.use(async (context, next) => {
  try {
    return await next();
  } catch (error) {
    if (isHttpError(error) && error.statusCode === 404) {
      return context.response.setStatus(404).json({ error: error.message, code: error.code });
    }
    throw error; // anything else keeps going up
  }
});

pipeline.use(async () => {
  throw notFound("No such user");
});

const response = await pipeline.execute(
  createRequestContext({ method: "GET", url: "/users/9" }),
  createResponseContext(),
);

console.log(response.status, response.body);
// 404 {"error":"No such user","code":"NOT_FOUND"}
```

Remember that a middleware's code after `await next()` is skipped when the chain below it throws. Work that must always happen, such as logging how long a request took, belongs in a `finally` block:

```ts
pipeline.use(async (context, next) => {
  const started = Date.now();
  try {
    return await next();
  } finally {
    log.info("request", { path: context.request.path, ms: Date.now() - started });
  }
});
```

> **Changed in v1.4.0: errors are no longer wrapped**
>
> A middleware around `await next()` used to receive an `HttpMiddlewareError`, and the server's `errorHandler` an `HttpMiddlewarePipelineError`, with the real error hidden in `cause` / `errors[0].cause`; `instanceof` checks on the real error failed in both places. If your code unwrapped `.cause` or `.errors`, check the error directly instead.

### Guards that refuse a request

A *guard* is a middleware that decides whether a request may go on: is the caller logged in, allowed to do this, asking for their own account? When the answer is no, the guard answers the request itself with a refusal such as `401` or `403`, and the handler never runs.

To refuse, return `createGuardResponse({ status, body?, headers? })` from [@zudojs/middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md) instead of calling `next()`. The router, `HttpMiddlewarePipeline` and `RouteDispatcher` send it with its own status, headers and body; a structured body goes out as JSON. This guard only lets a user read their own account, using the route parameter:

```ts
import { createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createGuardResponse } from "@zudojs/middleware";

const requireOwner: HttpMiddleware = async (ctx, next) => {
  const id = ctx.request.getParam("id");

  if (ctx.request.getHeader("x-user-id") !== id) {
    return createGuardResponse({ status: 403, body: { error: "Forbidden" } });
  }

  return next();
};

const router = createRouter();

router.get("/accounts/:id", (ctx) => ({ account: ctx.params.id }), {
  middleware: [requireOwner],
});
```

```bash
$ curl -H "x-user-id: 7" http://127.0.0.1:3000/accounts/7
{"account":"7"}

$ curl -i -H "x-user-id: 8" http://127.0.0.1:3000/accounts/7
HTTP/1.1 403 Forbidden
content-type: application/json; charset=utf-8
{"error":"Forbidden"}
```

In route middleware, headers an outer middleware set on `ctx.response` before calling `next()` (CORS headers, for instance) are kept on the refusal. The ready-made guards in other packages use the same contract: [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md)' `authorize()` and [@zudojs/tenancy](https://zudojs.oyinlola.site/docs/packages-tenancy.md)'s middleware return a guard response for every 401, 403 and 404, so they drop straight into a route's `middleware` list.

> **Changed in v1.4.0: refusals used to be sent as 200**
>
> A route middleware's return value was ignored unless it was an `HttpResponseContext` or a web `Response`. `authorize()` and the tenancy middleware returned a plain `{ status, body, headers }` object, so the handler did not run but the client, caches and monitoring saw `200`. Only the branded object from `createGuardResponse` is honoured: a plain object with a `status` key is still treated as ordinary data, so a handler's JSON can never be mistaken for a response. `applyGuardResponse(response, guard)` and `guardResponseToContext(guard)` do the conversion yourself if you write your own dispatcher.

### Built-in guards

- Requests whose path has `.` / `..` / `%2e%2e` segments or backslashes are answered `400`. Repeated slashes are collapsed once, where the request-target is parsed, so `request.path` and the router both see `//admin/secret` as `/admin/secret` and a guard can no longer disagree with the route it protects. An origin-form target is still never parsed as an authority.
- `createPathMiddleware(path, middleware, { caseSensitive? })` ignores case and trailing slashes by default, matching the router.
- `createRateLimitMiddleware({ max, windowMs })` answers `429` with a JSON body (`{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}}`, sent as `application/json`; it used to be `text/plain`) and always a `Retry-After` header, even when a custom limiter handler leaves it out. Requests with no usable client address share one bucket (`UNKNOWN_CLIENT_RATE_LIMIT_IP`, `0.0.0.0`); they are never unlimited and never a `500`.
- `parseSignedCookie(value, secret, name)` verifies a signed cookie; signatures are compared with `@zudojs/crypto` `timingSafeEqualString`.
- The built-in `createCorsMiddleware`, `createSecurityMiddleware` and `createTimingMiddleware` return a cloned `HttpResponseContext`, so status and body survive.
- `createSecurityMiddleware()` with no options emits the package's declared baseline (`createDefaultSecurityHeaderOptions`): `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, the cross-origin isolation headers and `X-Permitted-Cross-Domain-Policies` on top of `nosniff`, `X-Frame-Options` and `Referrer-Policy`. Explicit options layer over it; `useDefaults: false` emits only what you configure. Before v1.3.0 it emitted three headers.
- `createLoggingMiddleware({ includeHeaders: true })` redacts credential headers — `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and the rest of the `@zudojs/logger` secret-field set — before the record reaches the logger. Add your own names with `redactHeaders`.
- `guardRequest`'s default `requestIdPattern` accepts 1–128 characters of `[A-Za-z0-9._:-]`, the same rule used to [reuse an incoming id](#request-ids). It used to refuse ids containing `.` or `:` with `400`.
- `guardRequest` applies `maxHeaderValueSize` and the CRLF filter to array-valued headers (`set-cookie`, and any header supplied as a list) as well as to single values.
- Stock adapters give each context a redacting `@zudojs/logger` console logger named `http` when you supply none.

## ERRORS

When a handler throws an `HttpError` (`notFound()`, `unauthorized()`, …), the adapter answers with that error's status, its exposed message and `code`, and its headers — even when it was thrown inside the middleware pipeline. Any other error answers `500` with the body `{"error":"Internal Server Error"}`; messages and stacks never reach the client. Errors from the middleware pipeline reach the `errorHandler` unwrapped (see [When a middleware throws](#middleware-errors)); when you wrap an error yourself, the outermost error that carries a status answers the request.

`HttpError` is an error that carries a status code. The factory functions (`notFound()`, `badRequest()`, `unauthorized()`, and so on) create one with the right code. An `errorHandler` on the adapter or server turns it into a response.

This handler throws a `404`, and the error handler converts any `HttpError` into a JSON reply while keeping unknown errors hidden.

```ts
import {
  createNodeHttpAdapter,
  createResponseContext,
  isHttpError,
  notFound,
} from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  port: 3000,
  handler: () => {
    throw notFound("No such user");
  },
  errorHandler: (error) => {
    if (isHttpError(error)) {
      return createResponseContext()
        .setStatus(error.statusCode)
        .json({ error: error.message });
    }

    return createResponseContext()
      .setStatus(500)
      .json({ error: "Internal Server Error" });
  },
});

await adapter.start();
```

```bash
$ curl -i http://127.0.0.1:3000/users/9
HTTP/1.1 404 Not Found
{"error":"No such user"}
```

If the error handler itself throws, the adapter falls back to the plain `500`.

Every `HttpError` has a `code`, a short machine-readable name clients can match on. The factories set it for you (`notFound()` gives `"NOT_FOUND"`). `new HttpError(status, message)` without a `code` option now derives it from the status the same way, instead of the generic `"ERR_OPERATION_FAILED"` it used to get. Without an `errorHandler`, the adapter's default reply includes it:

```ts
import { createNodeHttpAdapter, HttpError, defaultErrorCode } from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  port: 3000,
  handler: () => {
    throw new HttpError(415, "Send JSON, not XML");
  },
});

await adapter.start();

console.log(defaultErrorCode(415), defaultErrorCode(404));
// UNSUPPORTED_MEDIA_TYPE NOT_FOUND
```

```bash
$ curl -i -X POST http://127.0.0.1:3000/upload
HTTP/1.1 415 Unsupported Media Type
{"error":"Send JSON, not XML","code":"UNSUPPORTED_MEDIA_TYPE"}
```

| Factory | Status | Notes |
| --- | --- | --- |
| `badRequest(message?)` | 400 | Also `unauthorized` 401, `forbidden` 403, `notFound` 404. |
| `methodNotAllowed(message?)` | 405 | Also `conflict` 409, `unprocessableEntity` 422, `tooManyRequests` 429. |
| `internalServerError(message?)` | 500 | Also `notImplemented` 501, `serviceUnavailable` 503. |
| `new HttpError(status, message?, options?)` | any | Options: `code`, `details`, `headers`, `cause`. Without `code`, it is `defaultErrorCode(status)`. |

## OPENAPI FROM YOUR ROUTES

An *OpenAPI document* is a JSON file that describes every endpoint of an HTTP API: its path, method, inputs and responses. Tools read it to show browsable docs, generate client code, or check the API in CI. Writing it by hand means keeping a second list of routes in sync with the real one, and it drifts.

Here the document is generated from the routes the router actually registered. A route documents itself through the `openapi` route option; schemas may be [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) schemas or raw OpenAPI schema objects. The generation itself is done by [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md).

```ts
import { objectSchema, stringSchema } from "@zudojs/schema";
import {
  createRouter,
  createResponseContext,
  generateOpenAPIDocument,
  mountOpenAPI,
} from "@zudojs/http";

const user = objectSchema({ id: stringSchema(), name: stringSchema() });
const router = createRouter();

router.get("/users/:id", (ctx) => createResponseContext().json({ id: ctx.params.id, name: "Ada" }), {
  openapi: {
    summary: "Get a user",
    tags: ["users"],
    responses: { "200": { schema: user }, "404": { description: "No such user" } },
  },
});

router.post("/users", () => createResponseContext().setStatus(201).json({ id: "u1", name: "Ada" }), {
  openapi: { body: objectSchema({ name: stringSchema() }), responses: { "201": { schema: user } } },
});

router.get("/health", () => createResponseContext().json({ ok: true }), { openapi: false }); // never documented

// A one-off document, e.g. to write to a file in CI:
const document = generateOpenAPIDocument(router, {
  info: { title: "Users API", version: "1.0.0" },
});
console.log(Object.keys(document.paths).sort());
// [ "/users", "/users/{id}" ]

// Or serve it: GET /openapi.json and a Swagger UI page at GET /docs.
mountOpenAPI(router, { info: { title: "Users API", version: "1.0.0" } });
```

Dispatch the router from a server as in [Router](#router), then open `http://127.0.0.1:3000/docs` to browse the API. The routes `mountOpenAPI` adds are hidden from the document themselves, and the document follows the router: a route registered later appears on the next request to `/openapi.json`.

### What the `openapi` route option takes

| Field | What it does | Notes |
| --- | --- | --- |
| `summary / description / operationId / tags / deprecated` | Copied onto the operation | Router groups can set `openapi` defaults: tags are merged, every other field is overridden by the route. A group's defaults never un-hide a route marked `openapi: false` or `hidden: true`. |
| `params / query / headers / cookies` | One object schema each; every property becomes a parameter | Path parameters are always required. |
| `body` | The request body | A schema (sent as `application/json`), or `{ schema, contentType?, required? }`. |
| `responses` | Keyed by status, e.g. `"200"`, `"4XX"`, `"default"` | `{ schema }` or `{ description }`; the description defaults to the reason phrase. Declare every status the route returns: a route with none documented gets a `default` response described as “Undocumented response” and a warning (see below), not an invented `200`. |
| `security` | Who may call it | `[]` marks the route public, overriding document-wide security. |
| `false` or `{ hidden: true }` | Leave the route out | Use it for health checks and internal endpoints. It wins over the route's group defaults; before this release a group with `openapi` defaults published such routes anyway. |

### How route paths become OpenAPI paths

OpenAPI writes path parameters as `{id}` and has no optional or wildcard segments, so each router pattern is translated:

| Route pattern | In the document | Notes |
| --- | --- | --- |
| `/users/:id`, `/users/{id}` | `/users/{id}` | Every slot is documented as a parameter, even when the route declares nothing about it. |
| `/users/:id(\d+)` | `/users/{id}` | The parameter gets the expression as its `pattern`. |
| `/users/:id?` | `/users` and `/users/{id}` | An optional segment is documented as both paths. |
| `/assets/*rest` | `/assets/{rest}` | Pass `wildcards: "exclude"` to drop such routes instead. |

Left out of the document: `all()` routes, `CONNECT`, routes with `openapi: false` or `{ hidden: true }`, and anything matched by `exclude` (an exact path, `"/internal/*"`, a `RegExp`, or a predicate). The router's automatic `HEAD` and `OPTIONS` answers are not registered routes, so they never appear. With `undocumented: "exclude"`, only routes that declare `openapi` are documented.

### Options

| Option | What it does | Notes |
| --- | --- | --- |
| `info` | Title and version of the API | Required. Both functions take the `createOpenAPIDocumentFromRoutes` options too, e.g. `servers`, `securitySchemes`, `security`, `schemas`, `validate`. |
| `exclude / undocumented / wildcards` | Which routes are documented | See above. |
| `path` | Where `mountOpenAPI` serves the JSON document | Default `/openapi.json`. |
| `docsPath` | Where the documentation page is served | Default `/docs`; `false` for none. |
| `yamlPath` | A YAML copy of the document | Off by default. |
| `ui` | Documentation page options | For example `{ renderer: "redoc" }`. Set `ui.specUrl` when the router is served under a prefix. |
| `middleware` | Runs before the documentation routes | Use it to put the docs behind a login. |

Pass `onRouteWarning(message)` to hear about routes the document can't describe well: duplicates, and routes that document no responses. Earlier releases gave such a route an invented `"200": { description: "OK" }`, which documented a `204` `DELETE` as `200`.

```ts
router.delete("/users/:id", () => undefined, { openapi: { summary: "Delete a user" } });

const document = generateOpenAPIDocument(router, {
  info: { title: "Users API", version: "1.0.0" },
  onRouteWarning: (message) => console.warn(message),
});
// DELETE /users/{id}: no responses are documented; emitted "default: Undocumented response".

console.log(document.paths["/users/{id}"].delete.responses);
// { default: { description: 'Undocumented response' } }
```

Adding `responses: { "204": { description: "Deleted" } }` to the route silences the warning.

`mountOpenAPI` returns `{ document(), unmount() }`. `createRouterOpenAPI(router, options)` gives you the underlying `OpenAPIManager`, rebuilt only when the route table changes.

## MOUNTING WEB-STANDARD HANDLERS

A *fetch handler* is a function that takes a web-standard `Request` and returns a `Response` (or a promise of one). It is the shape Bun, Deno and edge runtimes use, and it is what other Zudo packages hand you: `createRPCFetchHandler` from [@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md) and `createApiFetchHandler` from [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md).

`mountFetchHandler(router, basePath, handler, options?)` serves one under a path of a router or router group, with no glue code:

```ts
import { createRouter, mountFetchHandler } from "@zudojs/http";

const router = createRouter();

const unmount = mountFetchHandler(router, "/hello", async (request) => {
  const url = new URL(request.url);
  return Response.json({ path: url.pathname, prefix: request.headers.get("x-forwarded-prefix") });
});

// Real ones:
// mountFetchHandler(router, "/rpc", createRPCFetchHandler(rpcServer));
// mountFetchHandler(router, "/api", createApiFetchHandler(registry, { executor }));
```

```bash
$ curl http://127.0.0.1:3000/hello/world
{"path":"/world","prefix":"/hello"}
```

The handler sees the original method, query, headers (connection-scoped ones removed) and body. If an earlier middleware already parsed the body into an object, it is re-encoded as JSON and labelled `content-type: application/json` (unless the request already had a JSON content type), so the handler never receives JSON text under a form or text label. By default the mount path is stripped from its URL and passed along as `x-forwarded-prefix`, which is why `/hello/world` arrives as `/world`. So a handler that has its own base path setting, such as `createApiFetchHandler`'s `basePath`, should leave it unset. The returned function removes the mount again.

The `Response` is streamed back with its status, status text and headers intact, and several `Set-Cookie` headers stay separate instead of being folded into one broken header. A handler that throws, or returns something that is not a `Response`, fails the request like any route: a generic `500` unless the error carries a status.

| Option | What it does | Notes |
| --- | --- | --- |
| `methods` | Methods routed to the handler | Default: every method. |
| `stripPrefix` | Remove the mount path from the handler's URL | Default `true`. |
| `middleware` | Middleware run before the handler | For example an auth check. |
| `origin` | Origin of the handler's `request.url`, e.g. `https://api.example.com` | When set, used for every request. When not set, taken from the request's `Host` header (or `X-Forwarded-Host` from a trusted proxy), falling back to `http://localhost`. See below for why to pin it. |
| `name / openapi` | Route name and documentation | `openapi` defaults to `false`: a mounted handler documents its own operations. |

### Pinning the origin

A web `Request` always has an absolute URL, such as `https://api.example.com/users`, but a request arriving over HTTP only carries the path. The scheme and host part, the *origin*, has to come from somewhere. Without the `origin` option it comes from the `Host` header, and the client chooses what that header says. A handler that builds absolute URLs from `request.url` (a redirect, a password-reset or OAuth callback link) or compares a request's `Origin` header with its own origin can then be steered to an attacker's host. Set `origin` to your public origin whenever the handler does either:

```ts
mountFetchHandler(router, "/auth", authHandler, {
  origin: process.env.PUBLIC_ORIGIN, // e.g. "https://app.example.com"
});
```

When set, the option is used for every request, whatever `Host` says. Before this release it was only a fallback for requests with no usable host, so the client's header always won. Read the value from configuration rather than hard-coding it, so each environment serves its own origin.

`toWebRequest(context, options?)` does the request conversion on its own, if you want to call a fetch handler from inside a normal route. It takes the same `origin` option with the same meaning, plus `url`, `headers` and `signal`.

> **Client disconnects**
>
> The handler's `request.signal` aborts when the client goes away. The same is now true everywhere on the Node adapter: `request.signal` and the router's `ctx.signal` abort when the client disconnects, and a streamed response body stops being read. Pass the signal to database calls and `fetch` so abandoned requests stop doing work.

## HTTP CLIENT

`HttpClient` sends requests to other servers. It wraps the global `fetch` and adds a base URL, default headers, timeouts, retries with backoff, and interceptors. The response body is parsed for you based on its `content-type`.

This creates a client and fetches one user. A non-2xx status throws `HttpClientError`, so success and failure are separated by `try`/`catch`.

```ts
import { HttpClient, HttpClientError } from "@zudojs/http";

const client = new HttpClient({
  baseUrl: "http://127.0.0.1:3000",
  headers: { accept: "application/json" },
  timeout: 5000,
  retry: { retries: 2, backoff: "exponential" },
});

try {
  const response = await client.request<{ id: string }>("/users/42", {
    query: { verbose: true },
  });

  console.log(response.status, response.ok, response.data);
  // 200 true { id: "42", query: { verbose: "true" } }
} catch (error) {
  if (error instanceof HttpClientError) {
    console.log(error.code, error.status);
    // "HTTP_CLIENT_HTTP_ERROR" 404
  }
}
```

To send data, pass `method` and `body`. A plain object body is turned into JSON with the right `content-type`.

```ts
const created = await client.request("/users", {
  method: "POST",
  body: { name: "Ada" },
});

console.log(created.status, created.data);
// 201 { created: "Ada" }
```

### Request options

| Option | What it does | Notes |
| --- | --- | --- |
| `method` | `"GET"` (default), `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, ... |  |
| `query` | Object or `URLSearchParams` appended to the URL | Numbers and booleans are converted to strings. |
| `body` | Object, string, `FormData`, `Blob`, ... | Objects become JSON. |
| `headers` | Per-request headers | Merged over the client defaults. |
| `timeout` | Milliseconds before the request is aborted | Throws `HttpClientTimeoutError`. |
| `retry` | `{ retries, retryDelay, maxRetryDelay, backoff, jitter, retryStatusCodes, retryMethods, retryOnNetworkError, retryOnTimeout }` | Only safe methods are retried by default. See [Retries and backoff](#client-retries). |
| `responseType` | `"auto"` (default), `"json"`, `"text"`, `"arrayBuffer"`, `"blob"`, `"response"` | Controls what `response.data` holds. |
| `signal` | An `AbortSignal` to cancel the request | Throws `HttpClientAbortError`. |

### Retries and backoff

A *retry* sends a failed request again after a short wait. It rescues requests that failed for a passing reason, such as a busy server or a dropped connection. Retries are off until you set `retries` (how many extra attempts after the first).

This example starts a small test server that is slow only on its first request. The first attempt hits the 100 ms `timeout`, the client waits and tries again, and the second attempt succeeds. The `POST` is not retried, because a request that timed out may already have been carried out, and sending it again could, say, create the record twice.

```ts
import { createServer } from "node:http";
import { HttpClient, HttpClientTimeoutError } from "@zudojs/http";

let attempts = 0;
const slowOnce = createServer((req, res) => {
  attempts += 1;
  const delay = attempts === 1 ? 500 : 0;
  res.setHeader("content-type", "application/json");
  setTimeout(() => res.end(JSON.stringify({ attempt: attempts })), delay);
});
await new Promise((resolve) => slowOnce.listen(3000, "127.0.0.1", resolve));

const client = new HttpClient({
  baseUrl: "http://127.0.0.1:3000",
  timeout: 100,
  retry: { retries: 2, retryDelay: 50, jitter: false },
});

const response = await client.request("/report");
console.log(response.status, response.data);
// 200 { attempt: 2 }

attempts = 0;
try {
  await client.request("/report", { method: "POST", body: { name: "Ada" } });
} catch (error) {
  if (error instanceof HttpClientTimeoutError) {
    console.log(error.code, attempts);
    // ERR_HTTP_CLIENT_TIMEOUT 1
  }
}

slowOnce.closeAllConnections();
slowOnce.close();
```

| Retry option | What it does | Notes |
| --- | --- | --- |
| `retries` | Extra attempts after the first | Default `0`: no retries. |
| `retryMethods` | Methods that may be retried at all | Default `GET`, `HEAD`, `OPTIONS`. `POST` is never retried unless you list it. |
| `retryStatusCodes` | Response statuses that are retried | Default `429`, `502`, `503`, `504`. |
| `retryOnNetworkError` | Retry a transport failure, such as a refused connection | Default `true`. |
| `retryOnTimeout` | Retry a request that hit `timeout` | Defaults to the `retryOnNetworkError` value. Aborting through your own `signal` is never retried. |
| `retryDelay / backoff / maxRetryDelay` | How long to wait | `retryDelay` (default 1000 ms) times `2^attempt` with `backoff: "exponential"` (the default), or the same delay every time with `"fixed"`; never more than `maxRetryDelay` (default 30 s). |
| `jitter` | Randomise each wait | Default `true`: each wait is a random time between 0 and the computed delay (“full jitter”), so many clients that failed together do not all retry at the same moment. `false` waits exactly the delay. |

> **Changed in v1.4.0**
>
> Timeouts were never retried, so a `GET` with retries still failed on its first timeout. And jitter used to add up to a fixed extra second to every wait, whatever `retryDelay` was; with a short `retryDelay` the random part dwarfed the delay you asked for.

`client.addRequestInterceptor(fn)`, `addResponseInterceptor(fn)`, and `addErrorInterceptor(fn)` register functions that see every request, response, or error. Each returns a function that removes the interceptor.

> **Security built in**
>
> On a redirect to a different origin the client drops `Authorization` and `Cookie` headers, and it refuses redirects to non-HTTP schemes.

## CORS & SECURITY HEADERS

*CORS* is the browser rule that a page on one site may only call your API if your response says that site is allowed. The browser sends an `Origin` header; you answer with `Access-Control-Allow-Origin`. Some requests are preceded by an `OPTIONS` *preflight* asking for permission first.

`evaluateCors` takes the relevant request headers and your policy and returns the headers to send, whether the request is a preflight, and whether it is allowed. `createRecommendedSecurityHeaders` returns a safe default set of browser security headers. This middleware applies both.

```ts
import {
  createRecommendedSecurityHeaders,
  evaluateCors,
} from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";

const securityHeaders = createRecommendedSecurityHeaders({ hsts: false });

const protect: HttpMiddleware = async (context, next) => {
  const cors = await evaluateCors(
    {
      origin: context.request.getHeader("origin"),
      method: context.request.method,
      requestMethod: context.request.getHeader("access-control-request-method"),
      requestHeaders: context.request.getHeader("access-control-request-headers"),
    },
    { origin: ["https://app.example.com"], credentials: true },
  );

  // Answer an allowed preflight here; everything else goes downstream.
  const response =
    cors.preflight && cors.allowed
      ? context.response.setStatus(204)
      : await next();

  for (const [name, value] of Object.entries({ ...securityHeaders, ...cors.headers })) {
    if (value !== undefined) {
      response.setHeader(name, value);
    }
  }

  if (cors.vary.length > 0) {
    response.setHeader("vary", cors.vary.join(", "));
  }

  return response;
};
```

Register `protect` on a pipeline with a low priority so it wraps everything else. What `evaluateCors` returns for an allowed and a rejected origin:

```ts
console.log(
  await evaluateCors(
    { origin: "https://app.example.com", method: "GET" },
    { origin: ["https://app.example.com"], credentials: true },
  ),
);
// { allowed: true, preflight: false, vary: ["Origin"],
//   headers: { "Access-Control-Allow-Origin": "https://app.example.com",
//              "Access-Control-Allow-Credentials": "true" } }

console.log(
  await evaluateCors(
    { origin: "https://evil.example", method: "GET" },
    { origin: ["https://app.example.com"] },
  ),
);
// { allowed: false, preflight: false, vary: ["Origin"], headers: {} }
```

### CORS options

| Option | What it does | Notes |
| --- | --- | --- |
| `origin` | Allowed origins: a string, an array, or a function | `"*"` allows everyone but cannot be combined with `credentials`. |
| `methods` | Allowed methods for preflights | Default `GET, HEAD, PUT, PATCH, POST, DELETE`. |
| `allowedHeaders / exposedHeaders` | Header names the browser may send / read |  |
| `credentials` | Allow cookies and `Authorization` | Default `false`. Combining it with a wildcard origin throws: `createCorsPolicy` rejects it, and `createCorsMiddleware` throws when it is created (its default origin is `"*"`). |
| `maxAge` | Seconds the browser may cache a preflight |  |

`createRecommendedSecurityHeaders()` with no options emits `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, a deny-by-default `Permissions-Policy`, and the cross-origin isolation headers. Pass `false` for `csp`, `hsts`, `permissionsPolicy`, or `crossOriginPolicies` to drop one.

> **Watch out**
>
> Only send `Strict-Transport-Security` from a server that is actually reachable over HTTPS. Browsers remember it, and it will lock users out of a plain-HTTP dev server.

## API REFERENCE

The exports you will actually call. The package exports many more low-level helpers (header parsing, status code tables, cookie serialization, streaming); browse the TypeScript types for those.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createNodeHttpAdapter(options?)` | Creates the Node adapter | `start()`, `stop()`, `address`, `httpServer`. |
| `createHttpServer(options)` | Wraps an adapter with lifecycle and events | Returns `HttpServer`. |
| `startServer / stopServer / restartServer(server)` | Function form of the server methods |  |
| `createResponseContext(init?)` | Builds a response | Chain `setStatus`, `json`, `setHeader`. |
| `createRequestContext(init)` | Builds a request by hand | For tests and pipelines run outside a server. |
| `createRouter(options?)` | Creates an `HttpRouter` |  |
| `evaluateCors(request, options)` | Computes CORS headers and the allow decision | Async. |
| `createCorsPolicy(options)` | Validates CORS options once, up front | Throws on `"*"` plus credentials. |
| `createRecommendedSecurityHeaders(options?)` | Safe default security headers | Also `createSecurityHeaders` for full control. |
| `notFound(message?)` and friends | Create an `HttpError` with a status | See [Errors](#errors). |
| `isHttpError(value)` | Type guard for `HttpError` |  |
| `getStatusText(code)` | `404` to `"Not Found"` |  |
| `getCurrentRequestContext()` | The request being handled, from anywhere in the call stack | Only inside `runWithRequestContext`. Working since v1.3.0: the `AsyncLocalStorage` behind it was loaded in a way that never resolved under ESM, so it always returned `undefined`. |
| `generateOpenAPIDocument(router, options)` | OpenAPI document from the registered routes | See [OpenAPI from your routes](#openapi). |
| `mountOpenAPI(router, options)` | Serves `/openapi.json` and a docs page at `/docs` | Returns `{ document, unmount }`. `createRouterOpenAPI` returns the manager instead. |
| `mountFetchHandler(router, basePath, handler, options?)` | Serves a `Request` → `Response` handler under a path | Returns an unmount function. Set `origin` to pin the public origin. See [Mounting](#mounting-fetch-handlers). |
| `toWebRequest(context, options?)` | Converts a request context into a web `Request` | What `mountFetchHandler` uses. Options: `origin` (used for every request when set), `url`, `headers`, `signal`. |
| `resolveIncomingRequestId(value)` | The `x-request-id` value to reuse, or `undefined` | 1–128 characters of `[A-Za-z0-9._:-]`. See [Request ids](#request-ids). |
| `defaultErrorCode(status)` | `415` to `"UNSUPPORTED_MEDIA_TYPE"` | The `code` an `HttpError` gets when you give none; `undefined` for an unknown status. |
| `applyGuardResponse(response, guard)` / `guardResponseToContext(guard)` | Turn a `GuardResponse` into a real response | What the router and pipeline use. See [Guards that refuse a request](#guard-responses). |
| `getRequestIP(request, trustProxy?)` / `getRequestProtocol(request, trustProxy?)` | The client address and scheme of a raw Node request | `trustProxy` defaults to `false`, so forwarded headers are ignored unless you pass one. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `NodeHttpAdapter` | Talks to Node's `http` module | Usually created via `createNodeHttpAdapter`. |
| `HttpServer` | Lifecycle wrapper | `start`, `stop`, `restart`, `state`, `address`, `on`, `snapshot`. |
| `HttpRequestContext` | The incoming request | See [Request & Response](#request-and-response). |
| `HttpResponseContext` | The outgoing response |  |
| `HttpRouter` | Route registry and dispatcher | `get`, `post`, `on`, `all`, `group`, `dispatch`, `match`, `list`. |
| `HttpMiddlewarePipeline` | Ordered middleware runner | `use`, `execute`, `remove`, `enable`, `disable`. |
| `HttpClient` | Outbound requests over `fetch` | `request`, `addRequestInterceptor`, `addResponseInterceptor`, `addErrorInterceptor`. |
| `HttpError` | Error with an HTTP status | `statusCode`, `statusText`, `details`, `headers`. |

### Types

| Name | What it is | Notes |
| --- | --- | --- |
| `HttpHandler` | `(request) => response \| object \| void` | What you pass as `handler`. |
| `HttpErrorHandler` | `(error, request) => response` |  |
| `NodeAdapterOptions` | Options for `createNodeHttpAdapter` |  |
| `HttpServerOptions / HttpServerEvents` | Options for `createHttpServer` |  |
| `HttpMiddleware / HttpMiddlewareContext` | A middleware function and the object it receives | `context.request`, `context.response`, `context.state`, `context.signal`. |
| `RouterHandler / HttpRouterContext` | A route handler and its `ctx` |  |
| `RouterHandlerResult / RouterJsonValue` | What a route handler may return | A response, a web `Response`, a plain JSON value, or nothing. |
| `HttpMiddlewareResult` | What a middleware may return | Includes `GuardResponse` from `@zudojs/middleware`. |
| `RouterOptions` | Options for `createRouter` |  |
| `HttpClientOptions / HttpClientRequestConfig` | Client and per-request options |  |
| `HttpClientResponse&lt;T&gt;` | `{ data, status, statusText, ok, headers, url, raw }` |  |
| `CorsOptions / CorsResult` | Input and output of `evaluateCors` |  |
| `HttpOpenAPIOptions / HttpOpenAPIMountOptions` | Options for `generateOpenAPIDocument` / `mountOpenAPI` |  |
| `HttpRouteOpenAPI` | The `openapi` route option | Route metadata from `@zudojs/openapi`, or `false`. |
| `HttpFetchHandler / MountFetchHandlerOptions` | A fetch handler and the mount options |  |

### Errors

| Name | When it is thrown | Notes |
| --- | --- | --- |
| `HttpAdapterError` | The adapter has no handler, or cannot write a response | `code`: `HTTP_HANDLER_NOT_CONFIGURED`, ... |
| `HttpServerStartError / HttpServerStopError` | `start()` or `stop()` failed | Wraps the underlying error. |
| `InvalidHttpServerStateError` | Calling `start()` while stopping, and similar |  |
| `HttpMiddlewareError / HttpMiddlewarePipelineError` | `HttpMiddlewareError`: a middleware called `next()` twice, or the chain finished without producing a response | Neither wraps an error a middleware throws: since v1.4.0 that error propagates unchanged, and the pipeline no longer throws `HttpMiddlewarePipelineError` (still exported). |
| `HttpRequestGuardError` | The request guard refuses a request | The `@zudojs/errors` class (a `BaseError`, code `HTTP_REQUEST_REJECTED`, not exposed). |
| `RouteConflictError / InvalidRoutePatternError / HttpRouterError` | Duplicate route, bad pattern, or handler not a function |  |
| `HttpClientError` | Non-2xx response or unsafe redirect | `status`, `code`, `response`. |
| `HttpClientTimeoutError / HttpClientAbortError / HttpClientNetworkError` | Timeout, cancelled, or connection failure | All extend `HttpClientError`. |

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| `DEFAULT_HOST / DEFAULT_PORT` | `"127.0.0.1"` / `3000` | Node adapter defaults. |
| `DEFAULT_MAX_BODY_SIZE` | `10485760` (10 MB) |  |
| `HTTP_STATUS` | `{ OK: 200, CREATED: 201, NOT_FOUND: 404, ... }` | Named status codes. |
| `HTTP_METHODS` | `["GET", "HEAD", "POST", ...]` |  |

## COMMON MISTAKES

- **Importing `createHTTPServer` or `createHttpClient`.** Neither exists. The server factory is `createHttpServer` and it requires an `adapter`; the client is `new HttpClient(options)`.
- **Calling `client.get(url)`.** The client has one method, `request(url, config)`. Pass `method: "POST"` in the config for other verbs.
- **Passing `port` to `createHttpServer`.** It is silently ignored by JavaScript and rejected by TypeScript. Put `host`, `port`, and `trustProxy` on `createNodeHttpAdapter`.
- **Expecting `request.body` to be parsed.** It is a `Uint8Array`. Decode with `new TextDecoder().decode(body)` and `JSON.parse` it yourself.
- **Expecting the router to run by itself.** Nothing calls it until your handler does `router.dispatch(request)` and returns `result.response`.
- **Refusing a request by returning `{ status: 403, body }` from middleware.** A plain object is ordinary data, not a response. Return `createGuardResponse({ status: 403, body })` from `@zudojs/middleware` so the client really gets a `403`.
- **Unwrapping `error.cause` in an `errorHandler`.** Since v1.4.0 the handler receives the error that was thrown, not a pipeline wrapper. Check `isHttpError(error)` or `instanceof` on it directly.
- **Building links from `request.url` in a mounted handler without `origin`.** The host part then comes from the client's `Host` header, so a reset or callback link can point at another site. Pass `mountFetchHandler(router, path, handler, { origin })` with your public origin.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the base classes behind `HttpError`, `HttpClientError`, and the server errors.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — define operations once; mount `createApiFetchHandler` here with `mountFetchHandler`.
- [@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md) — typed procedure calls; mount `createRPCFetchHandler` here the same way.
- [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) — the generator behind `generateOpenAPIDocument`, and the full route metadata shape.
- [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md) — rate limiting and input validation to run inside middleware.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — structured logging for request and response events.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — application lifecycle so the server starts and stops with the rest of your app.

## COMPLETE EXPORT INDEX

Every name `@zudojs/http` exports from its package root at v1.4.4 — **1739** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 1739 exports**

Classes (62)

`BaseHttpAdapter` `CookieCollection` `DefaultHTTPContext` `DefaultHTTPHandlerAdapter` `DefaultHTTPMiddlewareAdapter` `DefaultHttpMiddlewareState` `DefaultResponseWriter` `DuplicateRouteParameterError` `FetchHttpResponseWriter` `GenericHttpAdapter` `HttpAdapterError` `HttpAdapterRegistry` `HttpClient` `HttpClientAbortError` `HttpClientError` `HttpClientNetworkError` `HttpClientResponseMarker` `HttpClientTimeoutError` `HttpError` `HTTPHeaders` `HttpInterceptorManager` `HttpMiddlewareError` `HttpMiddlewarePipeline` `HttpMiddlewarePipelineError` `HTTPQueryLimitError` `HttpRequestContext` `HttpRequestGuardError` `HttpResponseContext` `HttpRouter` `HttpRouterError` `HttpRouteResult` `HttpRouterGroup` `HttpServer` `HttpServerManager` `HttpServerStartError` `HttpServerStopError` `InvalidHttpServerStateError` `InvalidJSONError` `InvalidRoutePatternError` `MultipartError` `MultipartLimitError` `MultipartParseError` `NodeContextAdapter` `NodeHttpAdapter` `NodeHTTPAdapter` `NodeHTTPHeaders` `NodeHTTPRequest` `NodeHTTPResponse` `NodeRequestAdapter` `NodeResponseAdapter` `NodeResponseWriter` `ResponseAlreadySentError` `RouteConflictError` `RouteDispatcher` `RouteMatcher` `RoutePatternError` `RouterContext` `RouteRegistry` `RouteRegistryGroup` `RouteStack` `RouteTree` `UnsupportedResponseBodyError`

Functions (1072)

`accepted` `adaptNodeContext` `adaptNodeRequest` `adaptNodeResponse` `addConnectionToken` `addVaryValue` `allowsEval` `allowsInlineScript` `allowsNonce` `allowsSource` `allowsTransformation` `apiCSP` `appendHeader` `appendPath` `appendQuery` `appendQueryParam` `appendQueryParams` `appendSetCookieHeader` `appendUniqueHeaderValue` `applyCompressedBody` `applyCompressionHeaders` `applyGuardResponse` `applyHeadersToResponse` `applyProxyHeaders` `applyRouteParams` `areHeadersAllowed` `asHTTPHeaders` `assertHTTPMethod` `assertMIMEType` `assertNoRedirectLoop` `assertProxyPathContained` `assertRequestAllowed` `assertRequestContext` `assertSafeHeaderName` `assertSafeHeaderValue` `assertSafeProxyRedirect` `assertSafeProxyTarget` `assertSafeRedirect` `assertValidHeader` `assertValidStatusCode` `assertValidURL` `assertWritable` `badGateway` `badRequest` `bodyToBuffer` `bodyToJSON` `browserCSP` `bufferWebResponse` `buildClientUrl` `buildProxyRequestPath` `buildQueryString` `buildRegex` `buildRoutePath` `calculateFreshness` `calculateRetryDelay` `canFollowRedirect` `canonicalizeOrigin` `canServeStaleIfError` `canServeStaleWhileRevalidate` `chooseCompression` `cleanupListeners` `clearAgents` `clearQuery` `cloneHeaders` `cloneQuery` `cloneRouterContext` `closeAgent` `closeKeepAlive` `closeServer` `coalesceRanges` `collectAllowedMethods` `collectOpenAPIRoutes` `combineAbortSignals` `combineMiddleware` `compareHTTPVersions` `compareIds` `comparePreferences` `compareSegmentSpecificity` `compileRoute` `compileRoutePattern` `compileRouteSegments` `compileTrustProxy` `composeMiddleware` `composeRouteStack` `compressImage` `compressVideo` `configureAgentTimeout` `configureServer` `conflict` `consumeStream` `containsCRLF` `containsForbiddenHeaderChars` `contentSecurityPolicyHeader` `contextUrl` `copyStream` `createAbortError` `createAgent` `createAsyncMiddleware` `createAttachmentDisposition` `createBearerTokenInterceptor` `createBodyParser` `createCacheControl` `createCaseInsensitiveRoutePattern` `createConditionalMiddleware` `createConditionalResource` `createConnectionHeader` `createContentType` `createCookieManager` `createCorsHeaders` `createCorsMiddleware` `createCorsPolicy` `createCSP` `createCSPHeaders` `createCSPReportOnly` `created` `createDefaultCSPOptions` `createDefaultHSTSOptions` `createDefaultPermissionsPolicy` `createDefaultSecurityHeaderOptions` `createDefaultSecurityHeaders` `createFallbackRoute` `createFetchRequest` `createFetchRequestContext` `createFormData` `createFormDataDisposition` `createForwardedHeader` `createHashSource` `createHeaders` `createHSTS` `createHSTSHeader` `createHSTSHeaders` `createHSTSOptions` `createHSTSRemovalHeader` `createHTTPAdapter` `createHTTPAgent` `createHTTPContext` `createHTTPRequest` `createHTTPResponse` `createHttpRouterError` `createHTTPSAgent` `createHttpServer` `createId` `createImageCompressionMiddleware` `createImmutableCacheHeader` `createInlineDisposition` `createJsonAcceptInterceptor` `createKeepAliveConfig` `createKeepAliveHeader` `createKeepAliveState` `createLocationHeader` `createLoggingMiddleware` `createMethodMiddleware` `createMiddlewareContext` `createMiddlewareResponse` `createNeverAbortedSignal` `createNoCacheHeader` `createNodeHttpAdapter` `createNodeRequestContext` `createNodeRequestGuard` `createNonceSource` `createNoStoreHeader` `createOptionsResponse` `createPassThrough` `createPathMiddleware` `createPreference` `createPrivateCacheHeader` `createProxyRequest` `createPublicCacheHeader` `createQueryContainer` `createRangeResponse` `createRateLimitMiddleware` `createReadableStream` `createRecommendedSecurityHeaders` `createRedirect` `createRedirectPolicy` `createRegistration` `createRequestContext` `createRequestGuard` `createRequestIdInterceptor` `createResponseContext` `createResponseHeaderInterceptor` `createResponseMiddleware` `createResponseWriter` `createRoute` `createRouteMatcher` `createRoutePattern` `createRouter` `createRouterContext` `createRouteRegistry` `createRouteRegistryGroup` `createRouterMiddlewareContext` `createRouterOpenAPI` `createRouteTree` `createSecurityHeaders` `createSecurityMiddleware` `createSettleGuard` `createShortCircuitMiddleware` `createStaleWhileRevalidateHeader` `createStateMiddleware` `createStaticMiddleware` `createStatusErrorInterceptor` `createStatusLine` `createStreamLimitError` `createStrictRoutePattern` `createTimingMiddleware` `createURL` `createUserAgentInterceptor` `createVideoCompressionMiddleware` `crossOriginEmbedderPolicyHeader` `crossOriginOpenerPolicyHeader` `crossOriginResourcePolicyHeader` `decodeQueryComponent` `decodeRFC5987Value` `decodeRouteSegment` `decodeRouteValue` `defaultConnectionPersistence` `defaultErrorCode` `defaultMethodNotAllowedHandler` `defaultNotFoundHandler` `defaultRequestId` `deleteHeader` `deleteQueryParam` `deleteResponseCookie` `destroyAgent` `destroyStream` `detectBodyFormat` `dispatchRoute` `emptyResponse` `encodeRFC5987` `ensureLeadingSlash` `ensureTrailingSlash` `escapeHeaderQuotedString` `escapeQuotedString` `etagMatches` `evaluateConditionalRequest` `evaluateCors` `evaluateCorsDecision` `evaluateIfMatch` `evaluateIfNoneMatch` `executePipeline` `executeRoute` `extractBoundary` `extractConditionalHeaders` `extractPathname` `extractPort` `extractRouteSequence` `extractSequence` `filenameToMIME` `findRequestTargetViolation` `forbidden` `formatAllowHeader` `formatByteRange` `formatCacheControl` `formatContentDisposition` `formatContentDispositionHeader` `formatContentRange` `formatContentType` `formatCSP` `formatEntityTag` `formatFilename` `formatHeader` `formatHeaders` `formatHost` `formatHSTS` `formatHTTPDate` `formatHTTPVersion` `formatKeepAliveHeader` `formatLocation` `formatNegotiationPreferences` `formatPermissionsPolicy` `formatPreference` `formatQuality` `formatRangeHeader` `formatRequestLine` `formatRFC5987Value` `formatStatusLine` `formatUnsatisfiedContentRange` `formatVaryHeader` `formURLEncodedContentType` `gatewayTimeout` `generateCSPNonce` `generateETag` `generateOpenAPIDocument` `generateRequestId` `get` `getAccept` `getAgent` `getAgentForProtocol` `getAgentStats` `getAllHTTPMethods` `getAllowedMethods` `getAuthorization` `getBearerToken` `getBodyByteLength` `getBodyHTTPMethods` `getBoundary` `getCacheControl` `getCacheDirective` `getCanonicalPath` `getCharset` `getChunkSize` `getClientIp` `getClientPort` `getCompressionMimeType` `getCompressionQuality` `getContentLength` `getContentType` `getContextSignal` `getCookieHeader` `getCorsVaryHeaders` `getCSPDirective` `getCurrentRequestContext` `getDefaultBaseUrl` `getDefaultHTTPAgent` `getDefaultHTTPSAgent` `getDispositionType` `getEffectiveDirective` `getEffectiveMaxAge` `getEncodingQuality` `getExtension` `getFilename` `getFilenameStar` `getFormDataName` `getForwardedClientAddresses` `getForwardedFor` `getForwardedHost` `getForwardedProto` `getForwardedValues` `getHash` `getHeader` `getHeaders` `getHeaderValues` `getHostname` `getHSTSMaxAge` `getHTTPStatusMessage` `getIdempotentHTTPMethods` `getLanguageQuality` `getLocation` `getLocationHeader` `getMaximumStaleAge` `getMediaType` `getMIMECategory` `getMIMEExtensions` `getMIMESubtype` `getMIMEType` `getMinimumFreshness` `getMultipartBoundary` `getMultipartContentType` `getNodeRemoteAddress` `getNodeRequestHeaders` `getNodeRequestHostname` `getNodeRequestPort` `getNodeRequestProtocol` `getOrCreateAgent` `getOrigin` `getParameter` `getParameters` `getPathname` `getPort` `getPreferenceQuality` `getPreflightStatus` `getPrimaryExtension` `getProtocol` `getProxyChain` `getProxyHost` `getProxyInfo` `getProxyTargetRejection` `getQuery` `getQueryParam` `getQueryParams` `getQueryString` `getQueryStrings` `getQueryValue` `getRangeLength` `getRawFilename` `getReasonPhrase` `getRedirectMethod` `getRedirectStatus` `getRegisteredAgentKeys` `getRemainingFreshness` `getRequestContentLength` `getRequestContentType` `getRequestCookie` `getRequestCookies` `getRequestHeaders` `getRequestHost` `getRequestHostname` `getRequestId` `getRequestIP` `getRequestMethod` `getRequestPath` `getRequestPort` `getRequestProtocol` `getRequestSignal` `getRequestStream` `getRequestUrl` `getResponseBytes` `getResponseMediaType` `getResponseStatus` `getResponseStream` `getSafeHTTPMethods` `getSearch` `getSearchParams` `getSearchPart` `getServerAddress` `getServerState` `getStatusCategory` `getStatusInfo` `getStatusText` `getUntrustedForwardedValue` `getURLPassword` `getURLUsername` `getUserAgent` `getUtf8ByteLength` `guardRequest` `guardResponseToContext` `has` `hasAgent` `hasAllHeaders` `hasAnyHeader` `hasBoundary` `hasCacheDirective` `hasCharset` `hasChunkedTransferEncoding` `hasConnectionToken` `hasCSPDirective` `hasExceededIdleTimeout` `hasExceededMaxRequests` `hasHeader` `hasIncludeSubDomains` `hasParameter` `hasPreload` `hasProxyDotSegment` `hasQuery` `hasQueryParam` `hasRedirectLoop` `hasRequestBody` `hasResponseBody` `hasSatisfiableRanges` `hasSecurityHeaders` `hasTrailingSlash` `hasURLCredentials` `hasVaryValue` `hasWildcardOrigin` `headerContains` `headerEquals` `headersToRecord` `hstsDays` `hstsHours` `hstsMinutes` `htmlContentType` `htmlResponse` `httpError` `inferContentType` `internalServerError` `ipEquals` `ipMatchesCidr` `isAbsoluteFormTarget` `isAbsoluteHTTPURL` `isAbsoluteUrl` `isAbsoluteURL` `isAcceptableQuality` `isAccepted` `isAlreadyCompressedType` `isApplicationMIME` `isAsteriskFormTarget` `isAttachment` `isAudioMIME` `isAuthorityFormTarget` `isBearerAuthorization` `isBinary` `isBinaryMIME` `isBlockedProxyAddress` `isBodyForbidden` `isByteRangeUnit` `isCacheableByDefault` `isCacheableCompressedResponse` `isCanonicalRequestTarget` `isClientError` `isClientErrorStatus` `isClientErrorStatusCode` `isCompressibleType` `isCompressionEncoding` `isCompressionSupported` `isConflict` `isCONNECT` `isConnectionCloseRequested` `isConnectionKeepAliveRequested` `isCorsRequest` `isCreated` `isCrossOrigin` `isDELETE` `isEmptyNegotiationHeader` `isError` `isErrorStatus` `isFetchRequestInput` `isFontMIME` `isForbidden` `isForbiddenQueryKey` `isFormContentType` `isFormData` `isFormRequest` `isFormURLEncoded` `isFresh` `isFullResourceRange` `isGatewayTimeout` `isGET` `isHashSource` `isHEAD` `isHSTS` `isHSTSDisabled` `isHSTSPreloadable` `isHTTP10` `isHTTP11` `isHttpAdapter` `isHTTPAdapter` `isHTTPAgent` `isHttpClientResponse` `isHTTPContext` `isHttpError` `isHTTPErrorStatus` `isHttpMethod` `isHTTPMethod` `isHttpMiddleware` `isHTTPOrHTTPSURL` `isHTTPRedirectStatus` `isHttpRouter` `isHttpRouterError` `isHttpRouterGroup` `isHTTPS` `isHTTPSAgent` `isHttpServer` `isHTTPSuccessStatus` `isHTTPSURL` `isHTTPToken` `isHTTPURL` `isHTTPVersion` `isIdempotentHTTPMethod` `isIdempotentMethod` `isIdentityEncoding` `isImageMIME` `isImmutable` `isIncomingMessage` `isInformational` `isInformationalStatus` `isInformationalStatusCode` `isInline` `isInternalServerError` `isInvalidRoutePatternError` `isIpAddress` `isIPLiteral` `isJSON` `isJSONContentType` `isJSONMIME` `isJSONRequest` `isKnownMIMEType` `isKnownStatusCode` `isLinkLocalAddress` `isLocalhost` `isLoopbackAddress` `isMethodAllowed` `isMethodChangingRedirect` `isMethodNotAllowed` `isMethodOverrideAllowed` `isMethodPreservingRedirect` `isMIMEType` `isModifiedSince` `isMultipart` `isMultipartContentType` `isMultipartFormData` `isMultipartMIME` `isMultipartRequest` `isMultipartRequestBody` `isNoContent` `isNodeRequestResponsePair` `isNonceSource` `isNoneSource` `isNotFound` `isNotModified` `isNotModifiedSince` `isNullOrigin` `isOk` `isOPTIONS` `isOriginFormTarget` `isPartialContent` `isPATCH` `isPermanentRedirect` `isPOST` `isPotentiallyUnsafeRedirect` `isPreflightRequest` `isPrivateHostLiteral` `isProtocolRelativeURL` `isPUT` `isQUERY` `isQueryObject` `isRangeApplicable` `isRangeSatisfiable` `isReadableDestroyed` `isReadableEnded` `isReadableStream` `isRedirect` `isRedirection` `isRedirectionStatus` `isRedirectionStatusCode` `isRedirectStatus` `isRegisteredMiddleware` `isRelativeURL` `isRequest` `isRequestContext` `isResponse` `isResponseContext` `isResponseContextInit` `isResponseContextLike` `isResponsePrivate` `isResponsePublic` `isResponseStorable` `isResponseWriter` `isRetryableStatus` `isRouteConflictError` `isRouteMatcher` `isRouteMatcherResult` `isRouterContext` `isRouteRegistry` `isRouteRegistryGroup` `isRouteResult` `isRouteResultBody` `isRouteResultInit` `isSafeHTTPMethod` `isSafeMethod` `isSafeProxyTarget` `isSafeRedirectProtocol` `isSameOrigin` `isSecureRequest` `isSecureURL` `isSelfSource` `isServerError` `isServerErrorStatus` `isServerErrorStatusCode` `isServerResponse` `isServiceUnavailable` `isSimpleCorsRequest` `isStructuredJSON` `isSuccess` `isSuccessfulStatus` `isSuccessStatusCode` `isTemporaryRedirect` `isText` `isTextContentType` `isTextMIME` `isTooManyRequests` `isTRACE` `isTrustedPeer` `isTrustedProxy` `isUnauthorized` `isUniqueLocalAddress` `isUnprocessableEntity` `isUnsafeEvalSource` `isUnsafeInlineSource` `isUnsatisfiableRangeHeader` `isUTF8MIME` `isValidAuthority` `isValidAuthorization` `isValidCacheControl` `isValidContentLength` `isValidContentType` `isValidCookieName` `isValidCookieValue` `isValidDirectiveName` `isValidDispositionType` `isValidETag` `isValidHeaderFieldName` `isValidHeaderFieldValue` `isValidHeaderName` `isValidHeaderValue` `isValidHostname` `isValidHTTPDate` `isValidHTTPMethod` `isValidHTTPURL` `isValidLocation` `isValidNonce` `isValidOrigin` `isValidPort` `isValidProxyTarget` `isValidRange` `isValidRequestTarget` `isValidStatusCode` `isValidToken` `isValidURL` `isVideoMIME` `isWeakETag` `isWebResponse` `isWildcardEncoding` `isWildcardETag` `isWildcardOrigin` `isWritableDestroyed` `isWritableFinished` `isXML` `isXMLMIME` `joinProxyPath` `joinURLPath` `jsonContentType` `jsonResponse` `languageSpecificity` `list` `listen` `loadOptionalModule` `lookupMIMEType` `matchCompiledRoute` `matchesAccept` `matchesCharset` `matchesContentType` `matchesEncoding` `matchesETagList` `matchesIfRange` `matchesLanguage` `matchesLookup` `matchesMIMEType` `matchesOrigin` `matchRoute` `matchRoutePath` `matchRoutePattern` `matchRoutePatterns` `mayHaveRequestBody` `mediaTypeMatches` `mediaTypeSpecificity` `mergeHeaders` `mergeQuery` `mergeRanges` `mergeResponseContext` `mergeRouteOpenAPI` `methodMatches` `methodNotAllowed` `methodsEqual` `millisecondsToSeconds` `mimeToFilename` `mimeTypesEqual` `mountFetchHandler` `mountOpenAPI` `multipartFormDataContentType` `negotiate` `negotiateAccept` `negotiateCharset` `negotiateCompression` `negotiateEncoding` `negotiateLanguage` `negotiateMIMEType` `nextResult` `noContent` `normalizeBaseUrl` `normalizeBody` `normalizeClientError` `normalizeCompressionEncoding` `normalizeContentType` `normalizeEncoding` `normalizeETag` `normalizeHandlerResult` `normalizeHeaderName` `normalizeHeaderNames` `normalizeHeaders` `normalizeHTTPDate` `normalizeHTTPMethod` `normalizeIpAddress` `normalizeLanguageTag` `normalizeMatchPath` `normalizeMaxRequests` `normalizeMediaType` `normalizeMethod` `normalizeMethods` `normalizeMIMEType` `normalizeOrigin` `normalizePath` `normalizePriority` `normalizeProxyOptions` `normalizeProxyPath` `normalizeQueryValue` `normalizeRanges` `normalizeRequestBody` `normalizeRequestPath` `normalizeResponse` `normalizeResult` `normalizeRetryOptions` `normalizeRoutePattern` `normalizeRouteResult` `normalizeStreamError` `normalizeTimeout` `notFound` `notImplemented` `octetStreamContentType` `ok` `ownValue` `parseAccept` `parseAcceptCharset` `parseAcceptEncoding` `parseAcceptHeader` `parseAcceptLanguage` `parseAllowHeader` `parseAuthorization` `parseBody` `parseByteRange` `parseCacheControl` `parseCidr` `parseCompressionPreferences` `parseConnectionHeader` `parseConnectionTokens` `parseContentDisposition` `parseContentDispositionParameter` `parseContentLength` `parseContentType` `parseCookies` `parseCSP` `parseEntityTag` `parseEntityTagCondition` `parseEntityTagList` `parseETagList` `parseFormBody` `parseFormData` `parseForwarded` `parseForwardedFor` `parseForwardedHeader` `parseHeader` `parseHeaders` `parseHSTS` `parseHTTPDate` `parseHTTPVersion` `parseIpAddress` `parseJSONBody` `parseKeepAliveHeader` `parseMultipart` `parseMultipartBody` `parseMultipartBuffer` `parseMultipartFormData` `parseMultipartParts` `parseNegotiationHeader` `parseNodeQuery` `parseParameter` `parsePermissionsPolicy` `parsePort` `parsePreference` `parseQuality` `parseQuery` `parseQueryKey` `parseQueryString` `parseRangeHeader` `parseRawBody` `parseRequestBody` `parseRequestedHeaders` `parseRequestLine` `parseRequestTarget` `parseResponse` `parseSegments` `parseSignedCookie` `parseStatusLine` `parseTextBody` `parseTransferEncoding` `parseUrl` `parseURL` `performanceNow` `permissionsPolicyHeader` `pipeStream` `pipeStreamWithProgress` `preloadHSTS` `prepareAutomaticHeaders` `prepareProxyHeaders` `querySize` `queryToObject` `queryToString` `queryValueToString` `quoteParameterValue` `readBody` `readFetchBody` `readFetchBodyAsJson` `readFetchBodyAsString` `readForm` `readJSON` `readNodeRequestBody` `readStream` `readStreamAsString` `readText` `recordKeepAliveRequest` `recordToHeaders` `redirect` `redirectResponse` `referrerPolicyHeader` `remove` `removeAgent` `removeCompressionHeaders` `removeConnectionToken` `removeHeaderValue` `removeHopByHopHeaders` `removeInterceptor` `removeLeadingSlash` `removePort` `removeTrailingSlash` `requestOnlyIfCached` `requestRequiresRevalidation` `requiresCompressionVary` `resetDefaultAgents` `resolveByteRange` `resolveIncomingRequestId` `resolveLimits` `resolveMethodOverride` `resolveProxyTarget` `resolveProxyURL` `resolveRangeHeader` `resolveRanges` `resolveRedirectChain` `resolveRedirectLocation` `resolveRedirectURL` `resolveSafeRedirectTarget` `resolveURL` `resolveURLString` `response` `restartServer` `resultFromContext` `rewriteProxyPath` `routePathVariants` `routeResult` `runWithRequestContext` `sameHost` `sameHostname` `sameOrigin` `sanitizeFilename` `sanitizeHeaderValue` `sanitizeName` `scoreSegments` `secondsToMilliseconds` `sendHTML` `sendJSON` `sendText` `serializeCookie` `serializeCorsHeaders` `serializeRequestHead` `serializeResponseCookie` `serializeResponseHead` `serializeSignedCookie` `serviceUnavailable` `setAccept` `setAuthorization` `setCacheControl` `setContentLength` `setContentType` `setCookieHeader` `setDefaultHTTPAgent` `setDefaultHTTPSAgent` `setEnabled` `setForwardedHeaders` `setHeader` `setLocation` `setQueryParam` `setQueryParams` `setRequestId` `setResponseCookie` `setUserAgent` `shouldCloseConnection` `shouldCloseKeepAlive` `shouldCompress` `shouldHandlePreflight` `shouldKeepAlive` `shouldPreserveRedirectMethod` `shouldRetryError` `shouldRetryStatus` `shouldReturnNotModified` `shouldReturnPreconditionFailed` `shouldSendKeepAliveHeader` `signCookieValue` `sliceRange` `sortPreferences` `splitAddressAndPort` `splitHeaderValues` `splitMediaType` `splitParameters` `splitPath` `splitRoutePattern` `startAdapter` `startServer` `statusName` `stopAdapter` `stopServer` `strictCSP` `strictHSTS` `strictTransportSecurityHeader` `stringifyQuery` `stringifyURL` `stripCredentials` `stripHash` `stripQuery` `stripQueryAndHash` `stripQueryPrefix` `stripWeakETag` `strongETagMatch` `supportsPersistentConnections` `testRoutePattern` `testRoutePatterns` `textContentType` `textResponse` `toBuffer` `toHeaderObject` `toHeaders` `toHTTPHeaders` `toHTTPMethod` `tokenizeQuery` `tokenizeSearchParams` `toKnownMIMEType` `tooManyRequests` `toReadableStream` `toRelativeLocation` `toRouterContext` `toURL` `toWebRequest` `tryParseURL` `unauthorized` `unprocessableEntity` `unquoteParameterValue` `urlsEqual` `urlsEquivalent` `use` `validateAgentOptions` `validateCacheControl` `validateContentDisposition` `validateContentLength` `validateContentType` `validateCrossOriginEmbedderPolicy` `validateCrossOriginOpenerPolicy` `validateCrossOriginResourcePolicy` `validateCSP` `validateHeader` `validateHeaderName` `validateHeaders` `validateHeaderValue` `validateHost` `validateHSTS` `validateHSTSOptions` `validateHSTSPolicy` `validateHTTPMessage` `validateHTTPMethod` `validateHTTPToken` `validateHTTPURL` `validateLocation` `validateMaxBodySize` `validateParameterName` `validatePort` `validatePreflight` `validateQuery` `validateReferrerPolicy` `validateRequestId` `validateRequestTarget` `validateSecurityHeaders` `validateShutdownTimeout` `validateStatusCode` `validateTimeout` `validateTransferEncoding` `validateUrl` `validateURL` `waitForDrain` `weakETagMatch` `webResponseToContext` `wildcardParameterName` `wireAbortSignal` `withBoundary` `withCharset` `withMiddleware` `withResponseHeaders` `withSecureCookieDefaults` `withTimeout` `writeCookies` `writeHeaders` `writeReadableStream` `writeResponse` `writeToStream` `xContentTypeOptionsHeader` `xFrameOptionsHeader` `xPermittedCrossDomainPoliciesHeader`

Interfaces (255)

`AgentRegistryKey` `AgentStats` `BearerTokenInterceptorOptions` `BodyParser` `BodyParserOptions` `BodyParserResult` `ByteRange` `CacheControlDirectives` `CacheControlOptions` `CacheFreshness` `CompiledRoute` `CompiledRoutePath` `CompiledRoutePattern` `CompiledSegmentLiteral` `CompiledSegmentParameter` `CompiledSegmentWildcard` `CompressionDecision` `CompressionOptions` `CompressionPreference` `ConditionalHeaders` `ConditionalResource` `ConditionalResult` `ContentDisposition` `ContentDispositionOptions` `ContentDispositionParameter` `ContentType` `ContentTypeMatchOptions` `ContentTypeParameter` `ContextAdapter` `CookieManager` `CookieOptions` `CorsDecision` `CorsMiddlewareOptions` `CorsOptions` `CorsPolicy` `CorsRequest` `CorsResult` `CSPDirectives` `CSPNonceOptions` `CSPOptions` `CSPResult` `EntityTag` `FetchAdapterOptions` `FetchAdapterResult` `FetchRequestInput` `FetchResponseWriter` `ForwardedAddress` `GenericAdapterOptions` `GuardableRequest` `GuardResult` `HSTSOptions` `HSTSPolicy` `HSTSResult` `HttpAdapter` `HTTPAdapter` `HttpAdapterCapabilities` `HttpAdapterContext` `HttpAdapterOptions` `HTTPAdapterOptions` `HttpAdapterStopOptions` `HTTPAgentConfig` `HTTPAgentOptionsBase` `HTTPApplication` `HTTPApplicationOptions` `HTTPBodyParseOptions` `HTTPBodyParserOptions` `HTTPBodyReaderOptions` `HTTPClient` `HttpClientErrorDetails` `HttpClientInterceptors` `HttpClientOptions` `HttpClientRequestConfig` `HttpClientRequestContext` `HTTPClientRequestOptions` `HttpClientResponse` `HTTPClientResponse` `HTTPContentType` `HTTPContext` `HTTPContextOptions` `HTTPCookie` `HTTPCookieOptions` `HTTPCORSOptions` `HttpErrorJSON` `HTTPErrorLike` `HttpErrorOptions` `HTTPErrorOptions` `HttpFetchMountTarget` `HTTPFormData` `HTTPFormDataField` `HTTPFormDataFile` `HTTPFormDataParseOptions` `HTTPHandlerAdapter` `HTTPHeader` `HTTPHeaderEntry` `HTTPHeaderValidationResult` `HttpInterceptorManagerOptions` `HttpInterceptorMetadata` `HttpInterceptorOptions` `HttpInterceptorSnapshot` `HTTPMessage` `HTTPMiddlewareAdapter` `HttpMiddlewareContext` `HttpMiddlewareErrorOptions` `HttpMiddlewareOptions` `HttpMiddlewarePipelineOptions` `HttpMiddlewareState` `HttpOpenAPIMount` `HttpOpenAPIMountOptions` `HttpOpenAPIOptions` `HttpOpenAPIPathVariant` `HttpOpenAPIRouteSelection` `HttpOpenAPIRouteSource` `HTTPRequest` `HTTPRequestLine` `HTTPRequestOptions` `HTTPResponse` `HTTPResponseOptions` `HttpResponseWriter` `HttpRetryOptions` `HTTPRoute` `HTTPRouteAdapter` `HTTPRouteMatch` `HTTPRouter` `HttpRouterContext` `HttpRouterOpenAPI` `HttpRouterRequestContext` `HTTPSAgentConfig` `HTTPSecurityConfig` `HTTPServer` `HttpServerAddress` `HttpServerEvents` `HttpServerOptions` `HTTPServerOptions` `HttpServerSnapshot` `HttpStatusInfo` `HTTPStatusLine` `HTTPStreamFactoryOptions` `HTTPStreamOptions` `HTTPValidationResult` `HTTPVersion` `ImageCompressionMiddlewareOptions` `ImageCompressionOptions` `InternalInterceptor` `InternalMiddleware` `JsonAcceptInterceptorOptions` `KeepAliveConfig` `KeepAliveOptions` `KeepAliveParameters` `KeepAliveState` `LoggingMiddlewareOptions` `MatchedRoute` `MIMETypeDefinition` `MountFetchHandlerOptions` `MultipartField` `MultipartFile` `MultipartForm` `MultipartOptions` `MultipartPart` `MultipartPartHeaders` `MutableRouteTreeNode` `NegotiationMatch` `NegotiationPreference` `NodeAdapterEvents` `NodeAdapterOptions` `NodeAdapterSecurityOptions` `NodeRequestOptions` `NodeRequestTrustOptions` `NodeServerAddress` `ParameterRouteSegment` `ParsedAuthorization` `ParsedCidr` `ParsedIp` `ParsedURL` `PathMiddlewareOptions` `PipelineExecutionOptions` `PipelineRegistration` `ProxyClientContext` `ProxyInfo` `ProxyOptions` `ProxyRequest` `ProxyRewriteOptions` `ProxySecurityOptions` `ProxyTarget` `QueryLimitOptions` `QueryLimits` `QueryObject` `QueryParseOptions` `QueryStringifyOptions` `QueryStringParseOptions` `RangeResult` `RecommendedSecurityHeadersOptions` `RedirectOptions` `RedirectPolicy` `RedirectResult` `RegisteredHttpInterceptor` `RegisteredMiddleware` `RequestAdapter` `RequestContextInit` `RequestContextSnapshot` `RequestIdInterceptorOptions` `RequestLogger` `ResolvedByteRange` `ResponseAdapter` `ResponseContextInit` `ResponseContextSnapshot` `ResponseCookie` `ResponseHeaderInterceptorOptions` `ResponseWriteOptions` `ResponseWriter` `RouteDefinition` `RouteLookupOptions` `RouteMatch` `RouteMatcherOptions` `RouteMatcherResult` `RouteMatcherStats` `RouteMatchRequest` `RouteMethodResult` `RouteOptions` `RoutePatternOptions` `RouterContextInit` `RouterContextOptions` `RouteRegistrationOptions` `RouteRegistryEntry` `RouteRegistryOptions` `RouteRegistrySnapshot` `RouteResult` `RouteResultContext` `RouteResultInit` `RouteResultOptions` `RouterMatch` `RouterOptions` `RouterResult` `RouteTreeMatch` `RouteTreeNode` `RouteTreeOptions` `RouteTreeSnapshot` `SecurityHeadersOptions` `SecurityMiddlewareOptions` `SecurityValidationResult` `SignedCookie` `SignedCookieOptions` `StaticMiddlewareOptions` `StaticRouteSegment` `StreamPipeOptions` `StreamProgress` `StreamResult` `StreamSettleGuard` `ToWebRequestOptions` `TrustProxyOptions` `UnsatisfiableRange` `UserAgentInterceptorOptions` `UseRegistrationOptions` `VideoCompressionMiddlewareOptions` `VideoCompressionOptions` `WildcardRouteSegment`

Type aliases (117)

`BodyHTTPMethod` `BodyParserFormat` `ClientErrorStatus` `ClientErrorStatusCode` `CompiledSegment` `CompressionEncoding` `ConditionalMethod` `ContentDispositionType` `CookiePriority` `CookieSameSite` `CookieValue` `CorsHeaders` `CorsMethods` `CorsOrigin` `CrossOriginEmbedderPolicy` `CrossOriginOpenerPolicy` `CrossOriginResourcePolicy` `CSPDirectiveName` `CSPDirectiveValue` `HttpAdapterName` `HTTPAgentInstance` `HTTPAgentProtocol` `HTTPBody` `HTTPBodyParser` `HttpClientBody` `HttpClientMethod` `HttpClientQuery` `HttpClientQueryValue` `HttpErrorHandler` `HttpErrorInterceptor` `HttpFetchHandler` `HTTPFormDataValue` `HttpHandler` `HTTPHandler` `HttpHandlerResult` `HTTPHandlerResult` `HTTPHeadersInit` `HTTPHeaderValue` `HttpMethod` `HTTPMethod` `HttpMiddleware` `HTTPMiddleware` `HttpMiddlewareErrorHandler` `HTTPMiddlewareFactory` `HttpMiddlewareResult` `HttpNext` `HTTPNext` `HttpOpenAPIRouteFilter` `HttpOpenAPIWildcardMode` `HTTPParams` `HTTPQuery` `HTTPQueryValue` `HttpRateLimiter` `HTTPRequestHandler` `HttpRequestInterceptor` `HttpResponseInterceptor` `HttpResponseType` `HttpRouteOpenAPI` `HTTPServerEvent` `HttpServerState` `HTTPState` `HttpStatusCategory` `HttpStatusCode` `HTTPStatusCode` `IdempotentHTTPMethod` `InformationalStatus` `InformationalStatusCode` `InterceptorPhase` `InterceptorPriority` `IpFamily` `KnownMIMEType` `MediaCompressionErrorHandler` `NodeAdapterSecurityOption` `NodeRequestGuard` `ParsedBody` `PermissionsPolicy` `PermissionsPolicyValue` `QueryInput` `QueryPrimitive` `QueryStringPrimitive` `QueryStringValue` `QueryValue` `RateLimitMiddlewareOptions` `RedirectionStatus` `RedirectionStatusCode` `ReferrerPolicyValue` `RequestBody` `RequestHeaders` `RequestParams` `RequestQuery` `RequestState` `ResponseBody` `ResponseHeaders` `RouterContextState` `RouteResultBody` `RouteResultValue` `RouterHandler` `RouterHandlerLike` `RouterHandlerResult` `RouterJsonValue` `RouterMethodNotAllowedHandler` `RouterNotFoundHandler` `RouteSegment` `RouteTreeNodeType` `SafeHTTPMethod` `SameSite` `SecurityHeaders` `ServerErrorStatus` `ServerErrorStatusCode` `StreamProgressHandler` `SuccessStatus` `SuccessStatusCode` `TrustProxy` `TrustProxyPredicate` `URLInput` `XFrameOptions` `XPermittedCrossDomainPolicy`

Constants (233)

`ACCEPTED` `ALREADY_REPORTED` `BAD_GATEWAY` `BAD_REQUEST` `BLOCKED_PROXY_HOST_SUFFIXES` `BLOCKED_PROXY_HOSTS` `BODY_CONTENT_TYPES` `BODY_METHODS` `CACHE_CONTROL_HEADER` `CLIENT_ERROR_STATUS_CODES` `CLIENT_ERROR_STATUSES` `COMPRESSION_ENCODINGS` `CONFLICT` `CONTENT_DISPOSITION_HEADER` `CONTENT_SECURITY_POLICY_HEADER` `CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER` `CONTENT_TOO_LARGE` `CONTINUE` `CORS_CREDENTIALS_HEADER` `CORS_EXPOSE_HEADERS_HEADER` `CORS_HEADERS_HEADER` `CORS_MAX_AGE_HEADER` `CORS_METHODS_HEADER` `CORS_ORIGIN_HEADER` `CORS_REQUEST_HEADERS_HEADER` `CORS_REQUEST_METHOD_HEADER` `CORS_VARY_HEADER` `CREATED` `CSP_DIRECTIVES` `DEFAULT_AGENT_KEEP_ALIVE` `DEFAULT_AGENT_KEEP_ALIVE_MSECS` `DEFAULT_AGENT_MAX_FREE_SOCKETS` `DEFAULT_AGENT_MAX_SOCKETS` `DEFAULT_AGENT_MAX_TOTAL_SOCKETS` `DEFAULT_AGENT_SCHEDULING` `DEFAULT_BODY_ENCODING` `DEFAULT_BODY_LIMIT` `DEFAULT_BODY_PARSER_OPTIONS` `DEFAULT_CLIENT_ERROR_STATUS` `DEFAULT_COMPRESSION_THRESHOLD` `DEFAULT_CONTENT_TYPE` `DEFAULT_COOKIE_ATTRIBUTES` `DEFAULT_CORS_METHODS` `DEFAULT_DISPOSITION_TYPE` `DEFAULT_FORM_DATA_LIMIT` `DEFAULT_HOST` `DEFAULT_HTTP_PORT` `DEFAULT_HTTP_VERSION` `DEFAULT_HTTPS_PORT` `DEFAULT_KEEP_ALIVE_ENABLED` `DEFAULT_KEEP_ALIVE_MAX_REQUESTS` `DEFAULT_KEEP_ALIVE_TIMEOUT` `DEFAULT_MAX_AGE` `DEFAULT_MAX_BODY_SIZE` `DEFAULT_MAX_FIELD_SIZE` `DEFAULT_MAX_FIELDS` `DEFAULT_MAX_FILE_SIZE` `DEFAULT_MAX_FILES` `DEFAULT_MAX_REDIRECTS` `DEFAULT_MIN_COMPRESSION_QUALITY` `DEFAULT_MULTIPART_FIELD_LIMIT` `DEFAULT_MULTIPART_FILE_LIMIT` `DEFAULT_MULTIPART_LIMIT` `DEFAULT_MULTIPART_MAX_FIELDS` `DEFAULT_MULTIPART_MAX_FILES` `DEFAULT_MULTIPART_MAX_PARTS` `DEFAULT_NEGOTIATION_QUALITY` `DEFAULT_NONCE_LENGTH` `DEFAULT_OPTIONS_SUCCESS_STATUS` `DEFAULT_PORT` `DEFAULT_PREFERRED_ENCODINGS` `DEFAULT_QUERY_MAX_DEPTH` `DEFAULT_QUERY_MAX_KEY_LENGTH` `DEFAULT_QUERY_MAX_KEYS` `DEFAULT_QUERY_MAX_TOTAL_LENGTH` `DEFAULT_QUERY_MAX_VALUE_LENGTH` `DEFAULT_RANGE_UNIT` `DEFAULT_REDIRECT_STATUS` `DEFAULT_REFERRER_POLICY` `DEFAULT_RESPONSE_STATUS` `DEFAULT_RESPONSE_STATUS_TEXT` `DEFAULT_ROUTE_STATUS` `DEFAULT_SECURITY_CONFIG` `DEFAULT_SERVER_ERROR_STATUS` `DEFAULT_STREAM_HIGH_WATER_MARK` `DEFAULT_SUCCESS_STATUS` `DEFAULT_X_CONTENT_TYPE_OPTIONS` `EARLY_HINTS` `EMPTY_BODY_STATUS_CODES` `EXPECTATION_FAILED` `FAILED_DEPENDENCY` `FORBIDDEN` `FORWARDED_HEADER` `FOUND` `GATEWAY_TIMEOUT` `GONE` `HEADER_ACCEPT` `HEADER_AUTHORIZATION` `HEADER_CACHE_CONTROL` `HEADER_CONTENT_LENGTH` `HEADER_CONTENT_TYPE` `HEADER_COOKIE` `HEADER_HOST` `HEADER_LOCATION` `HEADER_ORIGIN` `HEADER_REFERER` `HEADER_SET_COOKIE` `HEADER_USER_AGENT` `HEADER_X_FORWARDED_FOR` `HEADER_X_FORWARDED_HOST` `HEADER_X_FORWARDED_PROTO` `HEADER_X_REQUEST_ID` `HSTS_DEFAULT_MAX_AGE` `HSTS_PRELOAD_MIN_MAX_AGE` `HTTP_1_0` `HTTP_1_1` `HTTP_2_0` `HTTP_3_0` `HTTP_CONTENT_TYPES` `HTTP_COOKIE_DEFAULTS` `HTTP_CORS_DEFAULTS` `HTTP_DEFAULTS` `HTTP_ERROR_CODES` `HTTP_HEADERS` `HTTP_IDEMPOTENT_METHODS` `HTTP_METHODS` `HTTP_PROTOCOL` `HTTP_PROTOCOLS` `HTTP_ROUTE_TOKENS` `HTTP_SAFE_METHODS` `HTTP_SERVER_EVENTS` `HTTP_STATUS` `HTTP_STATUS_MESSAGES` `HTTP_VERSION_NOT_SUPPORTED` `HTTPS_PROTOCOL` `IDEMPOTENT_METHODS` `IM_A_TEAPOT` `IM_USED` `INCOMING_REQUEST_ID_PATTERN` `INFORMATIONAL_STATUS_CODES` `INFORMATIONAL_STATUSES` `INSUFFICIENT_STORAGE` `INTERNAL_SERVER_ERROR` `LENGTH_REQUIRED` `LINK_LOCAL_RANGES` `LOCKED` `LOOP_DETECTED` `LOOPBACK_RANGES` `MAX_ACCEPT_ENCODING_ENTRIES` `MAX_COOKIE_COUNT` `MAX_COOKIE_HEADER_LENGTH` `MAX_FILENAME_BYTES` `MAX_HEADER_LIST_ELEMENTS` `MAX_INCOMING_REQUEST_ID_LENGTH` `MAX_KEEP_ALIVE_TIMEOUT` `MAX_NEGOTIATION_ENTRIES` `MAX_NEGOTIATION_QUALITY` `MAX_RANGE_COUNT` `MEDIA_TYPES` `METHOD_NOT_ALLOWED` `METHOD_OVERRIDE_TARGETS` `METHODS_WITH_OPTIONAL_BODY` `MIME_TYPES` `MIN_KEEP_ALIVE_TIMEOUT` `MIN_NEGOTIATION_QUALITY` `MISDIRECTED_REQUEST` `MOVED_PERMANENTLY` `MULTI_STATUS` `MULTIPLE_CHOICES` `NETWORK_AUTHENTICATION_REQUIRED` `NO_CONTENT` `NODE_DEFAULT_HEADERS_TIMEOUT` `NODE_DEFAULT_KEEP_ALIVE_TIMEOUT` `NODE_DEFAULT_REQUEST_TIMEOUT` `NON_AUTHORITATIVE_INFORMATION` `NOT_ACCEPTABLE` `NOT_EXTENDED` `NOT_FOUND` `NOT_IMPLEMENTED` `NOT_MODIFIED` `NOT_MODIFIED_STATUS` `OK` `PARTIAL_CONTENT` `PAYLOAD_TOO_LARGE` `PAYMENT_REQUIRED` `PERMANENT_REDIRECT` `PRECONDITION_FAILED` `PRECONDITION_FAILED_STATUS` `PRECONDITION_REQUIRED` `PROCESSING` `PROXY_AUTHENTICATION_REQUIRED` `RANGE_NOT_SATISFIABLE` `REDIRECT_STATUS_CODES` `REDIRECTION_STATUS_CODES` `REDIRECTION_STATUSES` `REQUEST_CONTEXT` `REQUEST_HEADER_FIELDS_TOO_LARGE` `REQUEST_ID_HEADER` `REQUEST_TIMEOUT` `RESET_CONTENT` `RETRYABLE_STATUS_CODES` `SAFE_METHODS` `SECURITY_HEADER_NAMES` `SEE_OTHER` `SERVER_ERROR_STATUS_CODES` `SERVER_ERROR_STATUSES` `SERVICE_UNAVAILABLE` `STATUS` `STATUS_CODES` `STATUS_TEXT` `STRICT_TRANSPORT_SECURITY_HEADER` `SUCCESS_STATUS_CODES` `SUCCESS_STATUSES` `SWITCHING_PROTOCOLS` `TEMPORARY_REDIRECT` `TOO_EARLY` `TOO_MANY_REQUESTS` `UNAUTHORIZED` `UNAVAILABLE_FOR_LEGAL_REASONS` `UNIQUE_LOCAL_RANGES` `UNKNOWN_CLIENT_RATE_LIMIT_IP` `UNPROCESSABLE_CONTENT` `UNPROCESSABLE_ENTITY` `UNSUPPORTED_MEDIA_TYPE` `UPGRADE_REQUIRED` `URI_TOO_LONG` `USE_PROXY` `VARIANT_ALSO_NEGOTIATES` `X_FORWARDED_FOR` `X_FORWARDED_HOST` `X_FORWARDED_PORT` `X_FORWARDED_PREFIX` `X_FORWARDED_PROTO`
