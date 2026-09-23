---
title: "@zudojs/http — HTTP Server, Routing & Middleware"
description: "@zudojs/http docs: HTTP server, routing, middleware, client, CORS, CSP and security headers, streaming, multipart, cookies and compression for ZudoJS."
source: https://zudojs.oyinlola.site/docs/packages-http
---

v1.3.0

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

Install the package with npm. Its runtime dependencies (`@zudojs/core`, `@zudojs/errors`, `@zudojs/logger`, `@zudojs/security`) are installed automatically. Node 24 or newer is required.

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
| `id` | A unique request id | Taken from `x-request-id` if the client sent one, otherwise generated. |
| `remoteAddress` | The caller's IP address | The socket peer. `X-Forwarded-For` is read only when the adapter's `trustProxy` matches that peer, and `trustProxy` defaults to `false`. |
| `protocol / hostname / port` | The scheme, host and port the request arrived on | From the socket and the `Host` header. `X-Forwarded-Proto` and `X-Forwarded-Host` are read only under `trustProxy`, and a forwarded scheme that is not `http` or `https` is discarded. |
| `getState(key) / setState(key, value)` | Per-request scratch space | Use it to pass data between middleware and handlers. |

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

`server.on(event, listener)` returns a function that removes the listener again. `server.snapshot()` returns a plain object with the name, state, address, start time, uptime in milliseconds, and request count. `server.on(event, listener)` adds a listener after construction and returns a function that removes it.

### Server options

| Option | What it does | Notes |
| --- | --- | --- |
| `adapter` | The runtime adapter (required) | Use `createNodeHttpAdapter`. |
| `handler` | Your request handler | Installed on the adapter for you. Without one, every request gets a `500`. |
| `errorHandler` | Turns a thrown error into a response | See [Errors](#errors). |
| `events` | Lifecycle listeners | Accepted by `new HttpServer(options)`; with `createHttpServer` use `server.on(...)` instead. |
| `gracefulShutdownTimeout` | How long `stop()` waits for in-flight requests, in ms | Default `30000`. `stop({ force: true })` skips the wait. |
| `name` | A label used in logs and snapshots | Default `"zudojs-http"`. |

### Node adapter options

| Option | What it does | Notes |
| --- | --- | --- |
| `host / port` | Where to listen | Defaults `127.0.0.1` and `3000`. `port: 0` picks a free port. |
| `maxBodySize` | Largest request body accepted, in bytes | Default 10 MB. Bigger bodies get a `413`. |
| `trustProxy` | Which socket peers may speak for a client through `X-Forwarded-*` | Default `false`: forwarded headers are ignored entirely. Also `true` or `"all"` (trust every hop), a hop count (trust that many proxies nearest the server; `0` trusts nothing), a preset (`"loopback"`, `"linklocal"`, `"uniquelocal"`/`"private"`), an IP or CIDR range, a comma-separated list or array of either, or a predicate `(address, hop) => boolean`. A string that is none of these throws `TypeError` when the adapter is constructed. |
| `security` | Request guard run before each request | On by default; an `HTTPSecurityConfig` object to tune, `false` to disable. |
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
- A middleware that throws stops the chain; middleware waiting after `await next()` does not resume. The error is wrapped in `HttpMiddlewarePipelineError`, unless the pipeline's `onError` option returns a recovery response.
- `use()` returns a function that removes the middleware. `enable(id)` / `disable(id)` toggle one by id.

### Built-in guards

- Requests whose path has `.` / `..` / `%2e%2e` segments or backslashes are answered `400`. Repeated slashes are collapsed once, where the request-target is parsed, so `request.path` and the router both see `//admin/secret` as `/admin/secret` and a guard can no longer disagree with the route it protects. An origin-form target is still never parsed as an authority.
- `createPathMiddleware(path, middleware, { caseSensitive? })` ignores case and trailing slashes by default, matching the router.
- `createRateLimitMiddleware({ max, windowMs })` answers `429` with `Retry-After`. Requests with no usable client address share one bucket (`UNKNOWN_CLIENT_RATE_LIMIT_IP`, `0.0.0.0`); they are never unlimited and never a `500`.
- `parseSignedCookie(value, secret, name)` verifies a signed cookie; signatures are compared with `@zudojs/crypto` `timingSafeEqualString`.
- The built-in `createCorsMiddleware`, `createSecurityMiddleware` and `createTimingMiddleware` return a cloned `HttpResponseContext`, so status and body survive.
- `createSecurityMiddleware()` with no options emits the package's declared baseline (`createDefaultSecurityHeaderOptions`): `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, the cross-origin isolation headers and `X-Permitted-Cross-Domain-Policies` on top of `nosniff`, `X-Frame-Options` and `Referrer-Policy`. Explicit options layer over it; `useDefaults: false` emits only what you configure. Before v1.3.0 it emitted three headers.
- `createLoggingMiddleware({ includeHeaders: true })` redacts credential headers — `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and the rest of the `@zudojs/logger` secret-field set — before the record reaches the logger. Add your own names with `redactHeaders`.
- `guardRequest` applies `maxHeaderValueSize` and the CRLF filter to array-valued headers (`set-cookie`, and any header supplied as a list) as well as to single values.
- Stock adapters give each context a redacting `@zudojs/logger` console logger named `http` when you supply none.

## ERRORS

When a handler throws an `HttpError` (`notFound()`, `unauthorized()`, …), the adapter answers with that error's status, its exposed message and `code`, and its headers — even when it was thrown inside the middleware pipeline. Any other error answers `500` with the body `{"error":"Internal Server Error"}`; messages and stacks never reach the client. When errors are wrapped, the outermost error that carries a status answers the request; only the middleware pipeline's own wrappers are looked through.

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

| Factory | Status | Notes |
| --- | --- | --- |
| `badRequest(message?)` | 400 | Also `unauthorized` 401, `forbidden` 403, `notFound` 404. |
| `methodNotAllowed(message?)` | 405 | Also `conflict` 409, `unprocessableEntity` 422, `tooManyRequests` 429. |
| `internalServerError(message?)` | 500 | Also `notImplemented` 501, `serviceUnavailable` 503. |
| `new HttpError(status, message?, options?)` | any | Options: `code`, `details`, `headers`, `cause`. |

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
| `retry` | `{ retries, retryDelay, maxRetryDelay, backoff, retryStatusCodes, retryMethods }` | Only safe methods are retried by default. |
| `responseType` | `"auto"` (default), `"json"`, `"text"`, `"arrayBuffer"`, `"blob"`, `"response"` | Controls what `response.data` holds. |
| `signal` | An `AbortSignal` to cancel the request | Throws `HttpClientAbortError`. |

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
| `RouterOptions` | Options for `createRouter` |  |
| `HttpClientOptions / HttpClientRequestConfig` | Client and per-request options |  |
| `HttpClientResponse&lt;T&gt;` | `{ data, status, statusText, ok, headers, url, raw }` |  |
| `CorsOptions / CorsResult` | Input and output of `evaluateCors` |  |

### Errors

| Name | When it is thrown | Notes |
| --- | --- | --- |
| `HttpAdapterError` | The adapter has no handler, or cannot write a response | `code`: `HTTP_HANDLER_NOT_CONFIGURED`, ... |
| `HttpServerStartError / HttpServerStopError` | `start()` or `stop()` failed | Wraps the underlying error. |
| `InvalidHttpServerStateError` | Calling `start()` while stopping, and similar |  |
| `HttpMiddlewareError / HttpMiddlewarePipelineError` | A middleware threw, or called `next()` twice | The pipeline error has an `errors` array. |
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

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the base classes behind `HttpError`, `HttpClientError`, and the server errors.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — define operations once and call them from HTTP handlers, CLI commands, or workers.
- [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md) — rate limiting and input validation to run inside middleware.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — structured logging for request and response events.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — application lifecycle so the server starts and stops with the rest of your app.

## COMPLETE EXPORT INDEX

Every name `@zudojs/http` exports from its package root at v1.3.0 — **1706** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 1706 exports**

Classes (62)

`BaseHttpAdapter` `CookieCollection` `DefaultHTTPContext` `DefaultHTTPHandlerAdapter` `DefaultHTTPMiddlewareAdapter` `DefaultHttpMiddlewareState` `DefaultResponseWriter` `DuplicateRouteParameterError` `FetchHttpResponseWriter` `GenericHttpAdapter` `HttpAdapterError` `HttpAdapterRegistry` `HttpClient` `HttpClientAbortError` `HttpClientError` `HttpClientNetworkError` `HttpClientResponseMarker` `HttpClientTimeoutError` `HttpError` `HTTPHeaders` `HttpInterceptorManager` `HttpMiddlewareError` `HttpMiddlewarePipeline` `HttpMiddlewarePipelineError` `HTTPQueryLimitError` `HttpRequestContext` `HttpRequestGuardError` `HttpResponseContext` `HttpRouter` `HttpRouterError` `HttpRouteResult` `HttpRouterGroup` `HttpServer` `HttpServerManager` `HttpServerStartError` `HttpServerStopError` `InvalidHttpServerStateError` `InvalidJSONError` `InvalidRoutePatternError` `MultipartError` `MultipartLimitError` `MultipartParseError` `NodeContextAdapter` `NodeHttpAdapter` `NodeHTTPAdapter` `NodeHTTPHeaders` `NodeHTTPRequest` `NodeHTTPResponse` `NodeRequestAdapter` `NodeResponseAdapter` `NodeResponseWriter` `ResponseAlreadySentError` `RouteConflictError` `RouteDispatcher` `RouteMatcher` `RoutePatternError` `RouterContext` `RouteRegistry` `RouteRegistryGroup` `RouteStack` `RouteTree` `UnsupportedResponseBodyError`

Functions (1057)

`accepted` `adaptNodeContext` `adaptNodeRequest` `adaptNodeResponse` `addConnectionToken` `addVaryValue` `allowsEval` `allowsInlineScript` `allowsNonce` `allowsSource` `allowsTransformation` `apiCSP` `appendHeader` `appendPath` `appendQuery` `appendQueryParam` `appendQueryParams` `appendSetCookieHeader` `appendUniqueHeaderValue` `applyCompressedBody` `applyCompressionHeaders` `applyHeadersToResponse` `applyProxyHeaders` `areHeadersAllowed` `asHTTPHeaders` `assertHTTPMethod` `assertMIMEType` `assertNoRedirectLoop` `assertProxyPathContained` `assertRequestAllowed` `assertRequestContext` `assertSafeHeaderName` `assertSafeHeaderValue` `assertSafeProxyRedirect` `assertSafeProxyTarget` `assertSafeRedirect` `assertValidHeader` `assertValidStatusCode` `assertValidURL` `assertWritable` `badGateway` `badRequest` `bodyToBuffer` `bodyToJSON` `browserCSP` `bufferWebResponse` `buildClientUrl` `buildProxyRequestPath` `buildQueryString` `buildRegex` `buildRoutePath` `calculateFreshness` `calculateRetryDelay` `canFollowRedirect` `canonicalizeOrigin` `canServeStaleIfError` `canServeStaleWhileRevalidate` `chooseCompression` `cleanupListeners` `clearAgents` `clearQuery` `cloneHeaders` `cloneQuery` `cloneRouterContext` `closeAgent` `closeKeepAlive` `closeServer` `coalesceRanges` `collectAllowedMethods` `combineAbortSignals` `combineMiddleware` `compareHTTPVersions` `compareIds` `comparePreferences` `compareSegmentSpecificity` `compileRoute` `compileRoutePattern` `compileRouteSegments` `compileTrustProxy` `composeMiddleware` `composeRouteStack` `compressImage` `compressVideo` `configureAgentTimeout` `configureServer` `conflict` `consumeStream` `containsCRLF` `containsForbiddenHeaderChars` `contentSecurityPolicyHeader` `copyStream` `createAbortError` `createAgent` `createAsyncMiddleware` `createAttachmentDisposition` `createBearerTokenInterceptor` `createBodyParser` `createCacheControl` `createCaseInsensitiveRoutePattern` `createConditionalMiddleware` `createConditionalResource` `createConnectionHeader` `createContentType` `createCookieManager` `createCorsHeaders` `createCorsMiddleware` `createCorsPolicy` `createCSP` `createCSPHeaders` `createCSPReportOnly` `created` `createDefaultCSPOptions` `createDefaultHSTSOptions` `createDefaultPermissionsPolicy` `createDefaultSecurityHeaderOptions` `createDefaultSecurityHeaders` `createFallbackRoute` `createFetchRequest` `createFetchRequestContext` `createFormData` `createFormDataDisposition` `createForwardedHeader` `createHashSource` `createHeaders` `createHSTS` `createHSTSHeader` `createHSTSHeaders` `createHSTSOptions` `createHSTSRemovalHeader` `createHTTPAdapter` `createHTTPAgent` `createHTTPContext` `createHTTPRequest` `createHTTPResponse` `createHttpRouterError` `createHTTPSAgent` `createHttpServer` `createId` `createImageCompressionMiddleware` `createImmutableCacheHeader` `createInlineDisposition` `createJsonAcceptInterceptor` `createKeepAliveConfig` `createKeepAliveHeader` `createKeepAliveState` `createLocationHeader` `createLoggingMiddleware` `createMethodMiddleware` `createMiddlewareContext` `createMiddlewareResponse` `createNeverAbortedSignal` `createNoCacheHeader` `createNodeHttpAdapter` `createNodeRequestContext` `createNodeRequestGuard` `createNonceSource` `createNoStoreHeader` `createOptionsResponse` `createPassThrough` `createPathMiddleware` `createPreference` `createPrivateCacheHeader` `createProxyRequest` `createPublicCacheHeader` `createQueryContainer` `createRangeResponse` `createRateLimitMiddleware` `createReadableStream` `createRecommendedSecurityHeaders` `createRedirect` `createRedirectPolicy` `createRegistration` `createRequestContext` `createRequestGuard` `createRequestIdInterceptor` `createResponseContext` `createResponseHeaderInterceptor` `createResponseMiddleware` `createResponseWriter` `createRoute` `createRouteMatcher` `createRoutePattern` `createRouter` `createRouterContext` `createRouteRegistry` `createRouteRegistryGroup` `createRouterMiddlewareContext` `createRouteTree` `createSecurityHeaders` `createSecurityMiddleware` `createSettleGuard` `createShortCircuitMiddleware` `createStaleWhileRevalidateHeader` `createStateMiddleware` `createStaticMiddleware` `createStatusErrorInterceptor` `createStatusLine` `createStreamLimitError` `createStrictRoutePattern` `createTimingMiddleware` `createURL` `createUserAgentInterceptor` `createVideoCompressionMiddleware` `crossOriginEmbedderPolicyHeader` `crossOriginOpenerPolicyHeader` `crossOriginResourcePolicyHeader` `decodeQueryComponent` `decodeRFC5987Value` `decodeRouteSegment` `decodeRouteValue` `defaultConnectionPersistence` `defaultMethodNotAllowedHandler` `defaultNotFoundHandler` `defaultRequestId` `deleteHeader` `deleteQueryParam` `deleteResponseCookie` `destroyAgent` `destroyStream` `detectBodyFormat` `dispatchRoute` `emptyResponse` `encodeRFC5987` `ensureLeadingSlash` `ensureTrailingSlash` `escapeHeaderQuotedString` `escapeQuotedString` `etagMatches` `evaluateConditionalRequest` `evaluateCors` `evaluateCorsDecision` `evaluateIfMatch` `evaluateIfNoneMatch` `executePipeline` `executeRoute` `extractBoundary` `extractConditionalHeaders` `extractPathname` `extractPort` `extractRouteSequence` `extractSequence` `filenameToMIME` `findRequestTargetViolation` `forbidden` `formatAllowHeader` `formatByteRange` `formatCacheControl` `formatContentDisposition` `formatContentDispositionHeader` `formatContentRange` `formatContentType` `formatCSP` `formatEntityTag` `formatFilename` `formatHeader` `formatHeaders` `formatHost` `formatHSTS` `formatHTTPDate` `formatHTTPVersion` `formatKeepAliveHeader` `formatLocation` `formatNegotiationPreferences` `formatPermissionsPolicy` `formatPreference` `formatQuality` `formatRangeHeader` `formatRequestLine` `formatRFC5987Value` `formatStatusLine` `formatUnsatisfiedContentRange` `formatVaryHeader` `formURLEncodedContentType` `gatewayTimeout` `generateCSPNonce` `generateETag` `generateRequestId` `get` `getAccept` `getAgent` `getAgentForProtocol` `getAgentStats` `getAllHTTPMethods` `getAllowedMethods` `getAuthorization` `getBearerToken` `getBodyByteLength` `getBodyHTTPMethods` `getBoundary` `getCacheControl` `getCacheDirective` `getCanonicalPath` `getCharset` `getChunkSize` `getClientIp` `getClientPort` `getCompressionMimeType` `getCompressionQuality` `getContentLength` `getContentType` `getContextSignal` `getCookieHeader` `getCorsVaryHeaders` `getCSPDirective` `getCurrentRequestContext` `getDefaultBaseUrl` `getDefaultHTTPAgent` `getDefaultHTTPSAgent` `getDispositionType` `getEffectiveDirective` `getEffectiveMaxAge` `getEncodingQuality` `getExtension` `getFilename` `getFilenameStar` `getFormDataName` `getForwardedClientAddresses` `getForwardedFor` `getForwardedHost` `getForwardedProto` `getForwardedValues` `getHash` `getHeader` `getHeaders` `getHeaderValues` `getHostname` `getHSTSMaxAge` `getHTTPStatusMessage` `getIdempotentHTTPMethods` `getLanguageQuality` `getLocation` `getLocationHeader` `getMaximumStaleAge` `getMediaType` `getMIMECategory` `getMIMEExtensions` `getMIMESubtype` `getMIMEType` `getMinimumFreshness` `getMultipartBoundary` `getMultipartContentType` `getNodeRemoteAddress` `getNodeRequestHeaders` `getNodeRequestHostname` `getNodeRequestPort` `getNodeRequestProtocol` `getOrCreateAgent` `getOrigin` `getParameter` `getParameters` `getPathname` `getPort` `getPreferenceQuality` `getPreflightStatus` `getPrimaryExtension` `getProtocol` `getProxyChain` `getProxyHost` `getProxyInfo` `getProxyTargetRejection` `getQuery` `getQueryParam` `getQueryParams` `getQueryString` `getQueryStrings` `getQueryValue` `getRangeLength` `getRawFilename` `getReasonPhrase` `getRedirectMethod` `getRedirectStatus` `getRegisteredAgentKeys` `getRemainingFreshness` `getRequestContentLength` `getRequestContentType` `getRequestCookie` `getRequestCookies` `getRequestHeaders` `getRequestHost` `getRequestHostname` `getRequestId` `getRequestIP` `getRequestMethod` `getRequestPath` `getRequestPort` `getRequestProtocol` `getRequestSignal` `getRequestStream` `getRequestUrl` `getResponseBytes` `getResponseMediaType` `getResponseStatus` `getResponseStream` `getSafeHTTPMethods` `getSearch` `getSearchParams` `getSearchPart` `getServerAddress` `getServerState` `getStatusCategory` `getStatusInfo` `getStatusText` `getUntrustedForwardedValue` `getURLPassword` `getURLUsername` `getUserAgent` `getUtf8ByteLength` `guardRequest` `has` `hasAgent` `hasAllHeaders` `hasAnyHeader` `hasBoundary` `hasCacheDirective` `hasCharset` `hasChunkedTransferEncoding` `hasConnectionToken` `hasCSPDirective` `hasExceededIdleTimeout` `hasExceededMaxRequests` `hasHeader` `hasIncludeSubDomains` `hasParameter` `hasPreload` `hasProxyDotSegment` `hasQuery` `hasQueryParam` `hasRedirectLoop` `hasRequestBody` `hasResponseBody` `hasSatisfiableRanges` `hasSecurityHeaders` `hasTrailingSlash` `hasURLCredentials` `hasVaryValue` `hasWildcardOrigin` `headerContains` `headerEquals` `headersToRecord` `hstsDays` `hstsHours` `hstsMinutes` `htmlContentType` `htmlResponse` `httpError` `inferContentType` `internalServerError` `ipEquals` `ipMatchesCidr` `isAbsoluteFormTarget` `isAbsoluteHTTPURL` `isAbsoluteUrl` `isAbsoluteURL` `isAcceptableQuality` `isAccepted` `isAlreadyCompressedType` `isApplicationMIME` `isAsteriskFormTarget` `isAttachment` `isAudioMIME` `isAuthorityFormTarget` `isBearerAuthorization` `isBinary` `isBinaryMIME` `isBlockedProxyAddress` `isBodyForbidden` `isByteRangeUnit` `isCacheableByDefault` `isCacheableCompressedResponse` `isCanonicalRequestTarget` `isClientError` `isClientErrorStatus` `isClientErrorStatusCode` `isCompressibleType` `isCompressionEncoding` `isCompressionSupported` `isConflict` `isCONNECT` `isConnectionCloseRequested` `isConnectionKeepAliveRequested` `isCorsRequest` `isCreated` `isCrossOrigin` `isDELETE` `isEmptyNegotiationHeader` `isError` `isErrorStatus` `isFetchRequestInput` `isFontMIME` `isForbidden` `isForbiddenQueryKey` `isFormContentType` `isFormData` `isFormRequest` `isFormURLEncoded` `isFresh` `isFullResourceRange` `isGatewayTimeout` `isGET` `isHashSource` `isHEAD` `isHSTS` `isHSTSDisabled` `isHSTSPreloadable` `isHTTP10` `isHTTP11` `isHttpAdapter` `isHTTPAdapter` `isHTTPAgent` `isHttpClientResponse` `isHTTPContext` `isHttpError` `isHTTPErrorStatus` `isHttpMethod` `isHTTPMethod` `isHttpMiddleware` `isHTTPOrHTTPSURL` `isHTTPRedirectStatus` `isHttpRouter` `isHttpRouterError` `isHttpRouterGroup` `isHTTPS` `isHTTPSAgent` `isHttpServer` `isHTTPSuccessStatus` `isHTTPSURL` `isHTTPToken` `isHTTPURL` `isHTTPVersion` `isIdempotentHTTPMethod` `isIdempotentMethod` `isIdentityEncoding` `isImageMIME` `isImmutable` `isIncomingMessage` `isInformational` `isInformationalStatus` `isInformationalStatusCode` `isInline` `isInternalServerError` `isInvalidRoutePatternError` `isIpAddress` `isIPLiteral` `isJSON` `isJSONContentType` `isJSONMIME` `isJSONRequest` `isKnownMIMEType` `isKnownStatusCode` `isLinkLocalAddress` `isLocalhost` `isLoopbackAddress` `isMethodAllowed` `isMethodChangingRedirect` `isMethodNotAllowed` `isMethodOverrideAllowed` `isMethodPreservingRedirect` `isMIMEType` `isModifiedSince` `isMultipart` `isMultipartContentType` `isMultipartFormData` `isMultipartMIME` `isMultipartRequest` `isMultipartRequestBody` `isNoContent` `isNodeRequestResponsePair` `isNonceSource` `isNoneSource` `isNotFound` `isNotModified` `isNotModifiedSince` `isNullOrigin` `isOk` `isOPTIONS` `isOriginFormTarget` `isPartialContent` `isPATCH` `isPermanentRedirect` `isPOST` `isPotentiallyUnsafeRedirect` `isPreflightRequest` `isPrivateHostLiteral` `isProtocolRelativeURL` `isPUT` `isQUERY` `isQueryObject` `isRangeApplicable` `isRangeSatisfiable` `isReadableDestroyed` `isReadableEnded` `isReadableStream` `isRedirect` `isRedirection` `isRedirectionStatus` `isRedirectionStatusCode` `isRedirectStatus` `isRegisteredMiddleware` `isRelativeURL` `isRequest` `isRequestContext` `isResponse` `isResponseContext` `isResponseContextInit` `isResponseContextLike` `isResponsePrivate` `isResponsePublic` `isResponseStorable` `isResponseWriter` `isRetryableStatus` `isRouteConflictError` `isRouteMatcher` `isRouteMatcherResult` `isRouterContext` `isRouteRegistry` `isRouteRegistryGroup` `isRouteResult` `isRouteResultBody` `isRouteResultInit` `isSafeHTTPMethod` `isSafeMethod` `isSafeProxyTarget` `isSafeRedirectProtocol` `isSameOrigin` `isSecureRequest` `isSecureURL` `isSelfSource` `isServerError` `isServerErrorStatus` `isServerErrorStatusCode` `isServerResponse` `isServiceUnavailable` `isSimpleCorsRequest` `isStructuredJSON` `isSuccess` `isSuccessfulStatus` `isSuccessStatusCode` `isTemporaryRedirect` `isText` `isTextContentType` `isTextMIME` `isTooManyRequests` `isTRACE` `isTrustedPeer` `isTrustedProxy` `isUnauthorized` `isUniqueLocalAddress` `isUnprocessableEntity` `isUnsafeEvalSource` `isUnsafeInlineSource` `isUnsatisfiableRangeHeader` `isUTF8MIME` `isValidAuthority` `isValidAuthorization` `isValidCacheControl` `isValidContentLength` `isValidContentType` `isValidCookieName` `isValidCookieValue` `isValidDirectiveName` `isValidDispositionType` `isValidETag` `isValidHeaderFieldName` `isValidHeaderFieldValue` `isValidHeaderName` `isValidHeaderValue` `isValidHostname` `isValidHTTPDate` `isValidHTTPMethod` `isValidHTTPURL` `isValidLocation` `isValidNonce` `isValidOrigin` `isValidPort` `isValidProxyTarget` `isValidRange` `isValidRequestTarget` `isValidStatusCode` `isValidToken` `isValidURL` `isVideoMIME` `isWeakETag` `isWebResponse` `isWildcardEncoding` `isWildcardETag` `isWildcardOrigin` `isWritableDestroyed` `isWritableFinished` `isXML` `isXMLMIME` `joinProxyPath` `joinURLPath` `jsonContentType` `jsonResponse` `languageSpecificity` `list` `listen` `loadOptionalModule` `lookupMIMEType` `matchCompiledRoute` `matchesAccept` `matchesCharset` `matchesContentType` `matchesEncoding` `matchesETagList` `matchesIfRange` `matchesLanguage` `matchesLookup` `matchesMIMEType` `matchesOrigin` `matchRoute` `matchRoutePath` `matchRoutePattern` `matchRoutePatterns` `mayHaveRequestBody` `mediaTypeMatches` `mediaTypeSpecificity` `mergeHeaders` `mergeQuery` `mergeRanges` `mergeResponseContext` `methodMatches` `methodNotAllowed` `methodsEqual` `millisecondsToSeconds` `mimeToFilename` `mimeTypesEqual` `multipartFormDataContentType` `negotiate` `negotiateAccept` `negotiateCharset` `negotiateCompression` `negotiateEncoding` `negotiateLanguage` `negotiateMIMEType` `nextResult` `noContent` `normalizeBaseUrl` `normalizeBody` `normalizeClientError` `normalizeCompressionEncoding` `normalizeContentType` `normalizeEncoding` `normalizeETag` `normalizeHandlerResult` `normalizeHeaderName` `normalizeHeaderNames` `normalizeHeaders` `normalizeHTTPDate` `normalizeHTTPMethod` `normalizeIpAddress` `normalizeLanguageTag` `normalizeMatchPath` `normalizeMaxRequests` `normalizeMediaType` `normalizeMethod` `normalizeMethods` `normalizeMIMEType` `normalizeOrigin` `normalizePath` `normalizePriority` `normalizeProxyOptions` `normalizeProxyPath` `normalizeQueryValue` `normalizeRanges` `normalizeRequestBody` `normalizeRequestPath` `normalizeResponse` `normalizeResult` `normalizeRetryOptions` `normalizeRoutePattern` `normalizeRouteResult` `normalizeStreamError` `normalizeTimeout` `notFound` `notImplemented` `octetStreamContentType` `ok` `ownValue` `parseAccept` `parseAcceptCharset` `parseAcceptEncoding` `parseAcceptHeader` `parseAcceptLanguage` `parseAllowHeader` `parseAuthorization` `parseBody` `parseByteRange` `parseCacheControl` `parseCidr` `parseCompressionPreferences` `parseConnectionHeader` `parseConnectionTokens` `parseContentDisposition` `parseContentDispositionParameter` `parseContentLength` `parseContentType` `parseCookies` `parseCSP` `parseEntityTag` `parseEntityTagCondition` `parseEntityTagList` `parseETagList` `parseFormBody` `parseFormData` `parseForwarded` `parseForwardedFor` `parseForwardedHeader` `parseHeader` `parseHeaders` `parseHSTS` `parseHTTPDate` `parseHTTPVersion` `parseIpAddress` `parseJSONBody` `parseKeepAliveHeader` `parseMultipart` `parseMultipartBody` `parseMultipartBuffer` `parseMultipartFormData` `parseMultipartParts` `parseNegotiationHeader` `parseNodeQuery` `parseParameter` `parsePermissionsPolicy` `parsePort` `parsePreference` `parseQuality` `parseQuery` `parseQueryKey` `parseQueryString` `parseRangeHeader` `parseRawBody` `parseRequestBody` `parseRequestedHeaders` `parseRequestLine` `parseRequestTarget` `parseResponse` `parseSegments` `parseSignedCookie` `parseStatusLine` `parseTextBody` `parseTransferEncoding` `parseUrl` `parseURL` `performanceNow` `permissionsPolicyHeader` `pipeStream` `pipeStreamWithProgress` `preloadHSTS` `prepareAutomaticHeaders` `prepareProxyHeaders` `querySize` `queryToObject` `queryToString` `queryValueToString` `quoteParameterValue` `readBody` `readFetchBody` `readFetchBodyAsJson` `readFetchBodyAsString` `readForm` `readJSON` `readNodeRequestBody` `readStream` `readStreamAsString` `readText` `recordKeepAliveRequest` `recordToHeaders` `redirect` `redirectResponse` `referrerPolicyHeader` `remove` `removeAgent` `removeCompressionHeaders` `removeConnectionToken` `removeHeaderValue` `removeHopByHopHeaders` `removeInterceptor` `removeLeadingSlash` `removePort` `removeTrailingSlash` `requestOnlyIfCached` `requestRequiresRevalidation` `requiresCompressionVary` `resetDefaultAgents` `resolveByteRange` `resolveLimits` `resolveMethodOverride` `resolveProxyTarget` `resolveProxyURL` `resolveRangeHeader` `resolveRanges` `resolveRedirectChain` `resolveRedirectLocation` `resolveRedirectURL` `resolveSafeRedirectTarget` `resolveURL` `resolveURLString` `response` `restartServer` `resultFromContext` `rewriteProxyPath` `routeResult` `runWithRequestContext` `sameHost` `sameHostname` `sameOrigin` `sanitizeFilename` `sanitizeHeaderValue` `sanitizeName` `scoreSegments` `secondsToMilliseconds` `sendHTML` `sendJSON` `sendText` `serializeCookie` `serializeCorsHeaders` `serializeRequestHead` `serializeResponseCookie` `serializeResponseHead` `serializeSignedCookie` `serviceUnavailable` `setAccept` `setAuthorization` `setCacheControl` `setContentLength` `setContentType` `setCookieHeader` `setDefaultHTTPAgent` `setDefaultHTTPSAgent` `setEnabled` `setForwardedHeaders` `setHeader` `setLocation` `setQueryParam` `setQueryParams` `setRequestId` `setResponseCookie` `setUserAgent` `shouldCloseConnection` `shouldCloseKeepAlive` `shouldCompress` `shouldHandlePreflight` `shouldKeepAlive` `shouldPreserveRedirectMethod` `shouldRetryError` `shouldRetryStatus` `shouldReturnNotModified` `shouldReturnPreconditionFailed` `shouldSendKeepAliveHeader` `signCookieValue` `sliceRange` `sortPreferences` `splitAddressAndPort` `splitHeaderValues` `splitMediaType` `splitParameters` `splitPath` `splitRoutePattern` `startAdapter` `startServer` `statusName` `stopAdapter` `stopServer` `strictCSP` `strictHSTS` `strictTransportSecurityHeader` `stringifyQuery` `stringifyURL` `stripCredentials` `stripHash` `stripQuery` `stripQueryAndHash` `stripQueryPrefix` `stripWeakETag` `strongETagMatch` `supportsPersistentConnections` `testRoutePattern` `testRoutePatterns` `textContentType` `textResponse` `toBuffer` `toHeaderObject` `toHeaders` `toHTTPHeaders` `toHTTPMethod` `tokenizeQuery` `tokenizeSearchParams` `toKnownMIMEType` `tooManyRequests` `toReadableStream` `toRelativeLocation` `toRouterContext` `toURL` `tryParseURL` `unauthorized` `unprocessableEntity` `unquoteParameterValue` `urlsEqual` `urlsEquivalent` `use` `validateAgentOptions` `validateCacheControl` `validateContentDisposition` `validateContentLength` `validateContentType` `validateCrossOriginEmbedderPolicy` `validateCrossOriginOpenerPolicy` `validateCrossOriginResourcePolicy` `validateCSP` `validateHeader` `validateHeaderName` `validateHeaders` `validateHeaderValue` `validateHost` `validateHSTS` `validateHSTSOptions` `validateHSTSPolicy` `validateHTTPMessage` `validateHTTPMethod` `validateHTTPToken` `validateHTTPURL` `validateLocation` `validateMaxBodySize` `validateParameterName` `validatePort` `validatePreflight` `validateQuery` `validateReferrerPolicy` `validateRequestId` `validateRequestTarget` `validateSecurityHeaders` `validateShutdownTimeout` `validateStatusCode` `validateTimeout` `validateTransferEncoding` `validateUrl` `validateURL` `waitForDrain` `weakETagMatch` `webResponseToContext` `wireAbortSignal` `withBoundary` `withCharset` `withMiddleware` `withResponseHeaders` `withSecureCookieDefaults` `withTimeout` `writeCookies` `writeHeaders` `writeReadableStream` `writeResponse` `writeToStream` `xContentTypeOptionsHeader` `xFrameOptionsHeader` `xPermittedCrossDomainPoliciesHeader`

Interfaces (245)

`AgentRegistryKey` `AgentStats` `BearerTokenInterceptorOptions` `BodyParser` `BodyParserOptions` `BodyParserResult` `ByteRange` `CacheControlDirectives` `CacheControlOptions` `CacheFreshness` `CompiledRoute` `CompiledRoutePath` `CompiledRoutePattern` `CompiledSegmentLiteral` `CompiledSegmentParameter` `CompiledSegmentWildcard` `CompressionDecision` `CompressionOptions` `CompressionPreference` `ConditionalHeaders` `ConditionalResource` `ConditionalResult` `ContentDisposition` `ContentDispositionOptions` `ContentDispositionParameter` `ContentType` `ContentTypeMatchOptions` `ContentTypeParameter` `ContextAdapter` `CookieManager` `CookieOptions` `CorsDecision` `CorsMiddlewareOptions` `CorsOptions` `CorsPolicy` `CorsRequest` `CorsResult` `CSPDirectives` `CSPNonceOptions` `CSPOptions` `CSPResult` `EntityTag` `FetchAdapterOptions` `FetchAdapterResult` `FetchRequestInput` `FetchResponseWriter` `ForwardedAddress` `GenericAdapterOptions` `GuardableRequest` `GuardResult` `HSTSOptions` `HSTSPolicy` `HSTSResult` `HttpAdapter` `HTTPAdapter` `HttpAdapterCapabilities` `HttpAdapterContext` `HttpAdapterOptions` `HTTPAdapterOptions` `HttpAdapterStopOptions` `HTTPAgentConfig` `HTTPAgentOptionsBase` `HTTPApplication` `HTTPApplicationOptions` `HTTPBodyParseOptions` `HTTPBodyParserOptions` `HTTPBodyReaderOptions` `HTTPClient` `HttpClientErrorDetails` `HttpClientInterceptors` `HttpClientOptions` `HttpClientRequestConfig` `HttpClientRequestContext` `HTTPClientRequestOptions` `HttpClientResponse` `HTTPClientResponse` `HTTPContentType` `HTTPContext` `HTTPContextOptions` `HTTPCookie` `HTTPCookieOptions` `HTTPCORSOptions` `HttpErrorJSON` `HTTPErrorLike` `HttpErrorOptions` `HTTPErrorOptions` `HTTPFormData` `HTTPFormDataField` `HTTPFormDataFile` `HTTPFormDataParseOptions` `HTTPHandlerAdapter` `HTTPHeader` `HTTPHeaderEntry` `HTTPHeaderValidationResult` `HttpInterceptorManagerOptions` `HttpInterceptorMetadata` `HttpInterceptorOptions` `HttpInterceptorSnapshot` `HTTPMessage` `HTTPMiddlewareAdapter` `HttpMiddlewareContext` `HttpMiddlewareErrorOptions` `HttpMiddlewareOptions` `HttpMiddlewarePipelineOptions` `HttpMiddlewareState` `HTTPRequest` `HTTPRequestLine` `HTTPRequestOptions` `HTTPResponse` `HTTPResponseOptions` `HttpResponseWriter` `HttpRetryOptions` `HTTPRoute` `HTTPRouteAdapter` `HTTPRouteMatch` `HTTPRouter` `HttpRouterContext` `HttpRouterRequestContext` `HTTPSAgentConfig` `HTTPSecurityConfig` `HTTPServer` `HttpServerAddress` `HttpServerEvents` `HttpServerOptions` `HTTPServerOptions` `HttpServerSnapshot` `HttpStatusInfo` `HTTPStatusLine` `HTTPStreamFactoryOptions` `HTTPStreamOptions` `HTTPValidationResult` `HTTPVersion` `ImageCompressionMiddlewareOptions` `ImageCompressionOptions` `InternalInterceptor` `InternalMiddleware` `JsonAcceptInterceptorOptions` `KeepAliveConfig` `KeepAliveOptions` `KeepAliveParameters` `KeepAliveState` `LoggingMiddlewareOptions` `MatchedRoute` `MIMETypeDefinition` `MultipartField` `MultipartFile` `MultipartForm` `MultipartOptions` `MultipartPart` `MultipartPartHeaders` `MutableRouteTreeNode` `NegotiationMatch` `NegotiationPreference` `NodeAdapterEvents` `NodeAdapterOptions` `NodeAdapterSecurityOptions` `NodeRequestOptions` `NodeRequestTrustOptions` `NodeServerAddress` `ParameterRouteSegment` `ParsedAuthorization` `ParsedCidr` `ParsedIp` `ParsedURL` `PathMiddlewareOptions` `PipelineExecutionOptions` `PipelineRegistration` `ProxyClientContext` `ProxyInfo` `ProxyOptions` `ProxyRequest` `ProxyRewriteOptions` `ProxySecurityOptions` `ProxyTarget` `QueryLimitOptions` `QueryLimits` `QueryObject` `QueryParseOptions` `QueryStringifyOptions` `QueryStringParseOptions` `RangeResult` `RecommendedSecurityHeadersOptions` `RedirectOptions` `RedirectPolicy` `RedirectResult` `RegisteredHttpInterceptor` `RegisteredMiddleware` `RequestAdapter` `RequestContextInit` `RequestContextSnapshot` `RequestIdInterceptorOptions` `RequestLogger` `ResolvedByteRange` `ResponseAdapter` `ResponseContextInit` `ResponseContextSnapshot` `ResponseCookie` `ResponseHeaderInterceptorOptions` `ResponseWriteOptions` `ResponseWriter` `RouteDefinition` `RouteLookupOptions` `RouteMatch` `RouteMatcherOptions` `RouteMatcherResult` `RouteMatcherStats` `RouteMatchRequest` `RouteMethodResult` `RouteOptions` `RoutePatternOptions` `RouterContextInit` `RouterContextOptions` `RouteRegistrationOptions` `RouteRegistryEntry` `RouteRegistryOptions` `RouteRegistrySnapshot` `RouteResult` `RouteResultContext` `RouteResultInit` `RouteResultOptions` `RouterMatch` `RouterOptions` `RouterResult` `RouteTreeMatch` `RouteTreeNode` `RouteTreeOptions` `RouteTreeSnapshot` `SecurityHeadersOptions` `SecurityMiddlewareOptions` `SecurityValidationResult` `SignedCookie` `SignedCookieOptions` `StaticMiddlewareOptions` `StaticRouteSegment` `StreamPipeOptions` `StreamProgress` `StreamResult` `StreamSettleGuard` `TrustProxyOptions` `UnsatisfiableRange` `UserAgentInterceptorOptions` `UseRegistrationOptions` `VideoCompressionMiddlewareOptions` `VideoCompressionOptions` `WildcardRouteSegment`

Type aliases (111)

`BodyHTTPMethod` `BodyParserFormat` `ClientErrorStatus` `ClientErrorStatusCode` `CompiledSegment` `CompressionEncoding` `ConditionalMethod` `ContentDispositionType` `CookiePriority` `CookieSameSite` `CookieValue` `CorsHeaders` `CorsMethods` `CorsOrigin` `CrossOriginEmbedderPolicy` `CrossOriginOpenerPolicy` `CrossOriginResourcePolicy` `CSPDirectiveName` `CSPDirectiveValue` `HttpAdapterName` `HTTPAgentInstance` `HTTPAgentProtocol` `HTTPBody` `HTTPBodyParser` `HttpClientBody` `HttpClientMethod` `HttpClientQuery` `HttpClientQueryValue` `HttpErrorHandler` `HttpErrorInterceptor` `HTTPFormDataValue` `HttpHandler` `HTTPHandler` `HttpHandlerResult` `HTTPHandlerResult` `HTTPHeadersInit` `HTTPHeaderValue` `HttpMethod` `HTTPMethod` `HttpMiddleware` `HTTPMiddleware` `HttpMiddlewareErrorHandler` `HTTPMiddlewareFactory` `HttpMiddlewareResult` `HttpNext` `HTTPNext` `HTTPParams` `HTTPQuery` `HTTPQueryValue` `HttpRateLimiter` `HTTPRequestHandler` `HttpRequestInterceptor` `HttpResponseInterceptor` `HttpResponseType` `HTTPServerEvent` `HttpServerState` `HTTPState` `HttpStatusCategory` `HttpStatusCode` `HTTPStatusCode` `IdempotentHTTPMethod` `InformationalStatus` `InformationalStatusCode` `InterceptorPhase` `InterceptorPriority` `IpFamily` `KnownMIMEType` `MediaCompressionErrorHandler` `NodeAdapterSecurityOption` `NodeRequestGuard` `ParsedBody` `PermissionsPolicy` `PermissionsPolicyValue` `QueryInput` `QueryPrimitive` `QueryStringPrimitive` `QueryStringValue` `QueryValue` `RateLimitMiddlewareOptions` `RedirectionStatus` `RedirectionStatusCode` `ReferrerPolicyValue` `RequestBody` `RequestHeaders` `RequestParams` `RequestQuery` `RequestState` `ResponseBody` `ResponseHeaders` `RouterContextState` `RouteResultBody` `RouteResultValue` `RouterHandler` `RouterHandlerLike` `RouterMethodNotAllowedHandler` `RouterNotFoundHandler` `RouteSegment` `RouteTreeNodeType` `SafeHTTPMethod` `SameSite` `SecurityHeaders` `ServerErrorStatus` `ServerErrorStatusCode` `StreamProgressHandler` `SuccessStatus` `SuccessStatusCode` `TrustProxy` `TrustProxyPredicate` `URLInput` `XFrameOptions` `XPermittedCrossDomainPolicy`

Constants (231)

`ACCEPTED` `ALREADY_REPORTED` `BAD_GATEWAY` `BAD_REQUEST` `BLOCKED_PROXY_HOST_SUFFIXES` `BLOCKED_PROXY_HOSTS` `BODY_CONTENT_TYPES` `BODY_METHODS` `CACHE_CONTROL_HEADER` `CLIENT_ERROR_STATUS_CODES` `CLIENT_ERROR_STATUSES` `COMPRESSION_ENCODINGS` `CONFLICT` `CONTENT_DISPOSITION_HEADER` `CONTENT_SECURITY_POLICY_HEADER` `CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER` `CONTENT_TOO_LARGE` `CONTINUE` `CORS_CREDENTIALS_HEADER` `CORS_EXPOSE_HEADERS_HEADER` `CORS_HEADERS_HEADER` `CORS_MAX_AGE_HEADER` `CORS_METHODS_HEADER` `CORS_ORIGIN_HEADER` `CORS_REQUEST_HEADERS_HEADER` `CORS_REQUEST_METHOD_HEADER` `CORS_VARY_HEADER` `CREATED` `CSP_DIRECTIVES` `DEFAULT_AGENT_KEEP_ALIVE` `DEFAULT_AGENT_KEEP_ALIVE_MSECS` `DEFAULT_AGENT_MAX_FREE_SOCKETS` `DEFAULT_AGENT_MAX_SOCKETS` `DEFAULT_AGENT_MAX_TOTAL_SOCKETS` `DEFAULT_AGENT_SCHEDULING` `DEFAULT_BODY_ENCODING` `DEFAULT_BODY_LIMIT` `DEFAULT_BODY_PARSER_OPTIONS` `DEFAULT_CLIENT_ERROR_STATUS` `DEFAULT_COMPRESSION_THRESHOLD` `DEFAULT_CONTENT_TYPE` `DEFAULT_COOKIE_ATTRIBUTES` `DEFAULT_CORS_METHODS` `DEFAULT_DISPOSITION_TYPE` `DEFAULT_FORM_DATA_LIMIT` `DEFAULT_HOST` `DEFAULT_HTTP_PORT` `DEFAULT_HTTP_VERSION` `DEFAULT_HTTPS_PORT` `DEFAULT_KEEP_ALIVE_ENABLED` `DEFAULT_KEEP_ALIVE_MAX_REQUESTS` `DEFAULT_KEEP_ALIVE_TIMEOUT` `DEFAULT_MAX_AGE` `DEFAULT_MAX_BODY_SIZE` `DEFAULT_MAX_FIELD_SIZE` `DEFAULT_MAX_FIELDS` `DEFAULT_MAX_FILE_SIZE` `DEFAULT_MAX_FILES` `DEFAULT_MAX_REDIRECTS` `DEFAULT_MIN_COMPRESSION_QUALITY` `DEFAULT_MULTIPART_FIELD_LIMIT` `DEFAULT_MULTIPART_FILE_LIMIT` `DEFAULT_MULTIPART_LIMIT` `DEFAULT_MULTIPART_MAX_FIELDS` `DEFAULT_MULTIPART_MAX_FILES` `DEFAULT_MULTIPART_MAX_PARTS` `DEFAULT_NEGOTIATION_QUALITY` `DEFAULT_NONCE_LENGTH` `DEFAULT_OPTIONS_SUCCESS_STATUS` `DEFAULT_PORT` `DEFAULT_PREFERRED_ENCODINGS` `DEFAULT_QUERY_MAX_DEPTH` `DEFAULT_QUERY_MAX_KEY_LENGTH` `DEFAULT_QUERY_MAX_KEYS` `DEFAULT_QUERY_MAX_TOTAL_LENGTH` `DEFAULT_QUERY_MAX_VALUE_LENGTH` `DEFAULT_RANGE_UNIT` `DEFAULT_REDIRECT_STATUS` `DEFAULT_REFERRER_POLICY` `DEFAULT_RESPONSE_STATUS` `DEFAULT_RESPONSE_STATUS_TEXT` `DEFAULT_ROUTE_STATUS` `DEFAULT_SECURITY_CONFIG` `DEFAULT_SERVER_ERROR_STATUS` `DEFAULT_STREAM_HIGH_WATER_MARK` `DEFAULT_SUCCESS_STATUS` `DEFAULT_X_CONTENT_TYPE_OPTIONS` `EARLY_HINTS` `EMPTY_BODY_STATUS_CODES` `EXPECTATION_FAILED` `FAILED_DEPENDENCY` `FORBIDDEN` `FORWARDED_HEADER` `FOUND` `GATEWAY_TIMEOUT` `GONE` `HEADER_ACCEPT` `HEADER_AUTHORIZATION` `HEADER_CACHE_CONTROL` `HEADER_CONTENT_LENGTH` `HEADER_CONTENT_TYPE` `HEADER_COOKIE` `HEADER_HOST` `HEADER_LOCATION` `HEADER_ORIGIN` `HEADER_REFERER` `HEADER_SET_COOKIE` `HEADER_USER_AGENT` `HEADER_X_FORWARDED_FOR` `HEADER_X_FORWARDED_HOST` `HEADER_X_FORWARDED_PROTO` `HEADER_X_REQUEST_ID` `HSTS_DEFAULT_MAX_AGE` `HSTS_PRELOAD_MIN_MAX_AGE` `HTTP_1_0` `HTTP_1_1` `HTTP_2_0` `HTTP_3_0` `HTTP_CONTENT_TYPES` `HTTP_COOKIE_DEFAULTS` `HTTP_CORS_DEFAULTS` `HTTP_DEFAULTS` `HTTP_ERROR_CODES` `HTTP_HEADERS` `HTTP_IDEMPOTENT_METHODS` `HTTP_METHODS` `HTTP_PROTOCOL` `HTTP_PROTOCOLS` `HTTP_ROUTE_TOKENS` `HTTP_SAFE_METHODS` `HTTP_SERVER_EVENTS` `HTTP_STATUS` `HTTP_STATUS_MESSAGES` `HTTP_VERSION_NOT_SUPPORTED` `HTTPS_PROTOCOL` `IDEMPOTENT_METHODS` `IM_A_TEAPOT` `IM_USED` `INFORMATIONAL_STATUS_CODES` `INFORMATIONAL_STATUSES` `INSUFFICIENT_STORAGE` `INTERNAL_SERVER_ERROR` `LENGTH_REQUIRED` `LINK_LOCAL_RANGES` `LOCKED` `LOOP_DETECTED` `LOOPBACK_RANGES` `MAX_ACCEPT_ENCODING_ENTRIES` `MAX_COOKIE_COUNT` `MAX_COOKIE_HEADER_LENGTH` `MAX_FILENAME_BYTES` `MAX_HEADER_LIST_ELEMENTS` `MAX_KEEP_ALIVE_TIMEOUT` `MAX_NEGOTIATION_ENTRIES` `MAX_NEGOTIATION_QUALITY` `MAX_RANGE_COUNT` `MEDIA_TYPES` `METHOD_NOT_ALLOWED` `METHOD_OVERRIDE_TARGETS` `METHODS_WITH_OPTIONAL_BODY` `MIME_TYPES` `MIN_KEEP_ALIVE_TIMEOUT` `MIN_NEGOTIATION_QUALITY` `MISDIRECTED_REQUEST` `MOVED_PERMANENTLY` `MULTI_STATUS` `MULTIPLE_CHOICES` `NETWORK_AUTHENTICATION_REQUIRED` `NO_CONTENT` `NODE_DEFAULT_HEADERS_TIMEOUT` `NODE_DEFAULT_KEEP_ALIVE_TIMEOUT` `NODE_DEFAULT_REQUEST_TIMEOUT` `NON_AUTHORITATIVE_INFORMATION` `NOT_ACCEPTABLE` `NOT_EXTENDED` `NOT_FOUND` `NOT_IMPLEMENTED` `NOT_MODIFIED` `NOT_MODIFIED_STATUS` `OK` `PARTIAL_CONTENT` `PAYLOAD_TOO_LARGE` `PAYMENT_REQUIRED` `PERMANENT_REDIRECT` `PRECONDITION_FAILED` `PRECONDITION_FAILED_STATUS` `PRECONDITION_REQUIRED` `PROCESSING` `PROXY_AUTHENTICATION_REQUIRED` `RANGE_NOT_SATISFIABLE` `REDIRECT_STATUS_CODES` `REDIRECTION_STATUS_CODES` `REDIRECTION_STATUSES` `REQUEST_CONTEXT` `REQUEST_HEADER_FIELDS_TOO_LARGE` `REQUEST_ID_HEADER` `REQUEST_TIMEOUT` `RESET_CONTENT` `RETRYABLE_STATUS_CODES` `SAFE_METHODS` `SECURITY_HEADER_NAMES` `SEE_OTHER` `SERVER_ERROR_STATUS_CODES` `SERVER_ERROR_STATUSES` `SERVICE_UNAVAILABLE` `STATUS` `STATUS_CODES` `STATUS_TEXT` `STRICT_TRANSPORT_SECURITY_HEADER` `SUCCESS_STATUS_CODES` `SUCCESS_STATUSES` `SWITCHING_PROTOCOLS` `TEMPORARY_REDIRECT` `TOO_EARLY` `TOO_MANY_REQUESTS` `UNAUTHORIZED` `UNAVAILABLE_FOR_LEGAL_REASONS` `UNIQUE_LOCAL_RANGES` `UNKNOWN_CLIENT_RATE_LIMIT_IP` `UNPROCESSABLE_CONTENT` `UNPROCESSABLE_ENTITY` `UNSUPPORTED_MEDIA_TYPE` `UPGRADE_REQUIRED` `URI_TOO_LONG` `USE_PROXY` `VARIANT_ALSO_NEGOTIATES` `X_FORWARDED_FOR` `X_FORWARDED_HOST` `X_FORWARDED_PORT` `X_FORWARDED_PREFIX` `X_FORWARDED_PROTO`
