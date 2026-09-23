# @zudojs/http

HTTP primitives, request handling, routing, middleware, and server infrastructure for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-http](https://zudojs.oyinlola.site/docs/packages-http) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-http.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/http
```

## Quick Start

```typescript
import {
  createHttpServer,
  createNodeHttpAdapter,
  createResponseContext,
} from "@zudojs/http";

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: async (request) => {
    return createResponseContext().text(`Hello from Zudojs (${request.path})`);
  },
});

await server.start();
```

`createHttpServer` takes `HttpServerOptions`, so `request` in the handler
above is typed `HttpRequestContext` without an annotation (the options used
to be typed `unknown`, which failed `strict` builds with TS7006).

A handler receives an `HttpRequestContext` and may return an
`HttpResponseContext` or any JSON value. **Every value that is not an
`HttpResponseContext` is data**: a plain object such as `{ status: "ok" }` is
sent as `application/json`, whatever its keys. To choose the status, headers
or raw body, return `createResponseContext({ status, headers, body })`.
Throwing an `HttpError` created by `notFound()`, `unauthorized()` and friends
answers with that error's status. When errors are wrapped, the **outermost**
error that carries a status wins; only the middleware pipeline's own
wrappers are looked through, so `new HttpError(502, "Bad Gateway", { cause })`
answers 502 and never exposes the cause.

## Secure defaults

- **Request guard.** The Node adapter runs `guardRequest` on every request
  before the body is read and answers `400` when it refuses: Host,
  `X-Request-Id` format, header count and size, URL and query length, and
  `Transfer-Encoding`/`Content-Length` smuggling. Tune it with
  `createNodeHttpAdapter({ security: { allowedHosts: ["api.example.com"] } })`
  or turn it off with `security: false`. HTTP/1.0 requests may omit Host, and
  oversized bodies still get `413` from `maxBodySize`.
- **Canonical request targets.** Request targets with `.`/`..` segments
  (including `%2e%2e`), backslashes or a non-origin form are refused with
  `400`. `request.path`, the router and `createPathMiddleware` all read the
  path with one parser, and `//host/admin` is a path, never an authority.
- **Path-scoped middleware** matches the way the router does: case-insensitive
  and ignoring repeated or trailing slashes (`{ caseSensitive: true }` to opt
  out).
- **Query strings** are parsed once: a repeated name is an array in both
  `request.query`/`getQuery()` and the router's `ctx.query`.
- **Cookies** default to `Path=/; HttpOnly; Secure; SameSite=Lax`; override
  any attribute explicitly. Signed cookies are bound to their name: read them
  with `parseSignedCookie(value, secret, name)`.
- **`trustProxy`** accepts a hop count (`trustProxy: 1` trusts one proxy).
- **CORS** origin matching is `@zudojs/security`'s `isOriginAllowed`, and a
  wildcard origin with `credentials: true` throws when the middleware is
  created. **Rate limiting**: `createRateLimitMiddleware({ max, windowMs })`
  wraps `@zudojs/security`'s `createRateLimiter`. Requests with no usable
  client address share one bucket (`UNKNOWN_CLIENT_RATE_LIMIT_IP`,
  `0.0.0.0`): they are limited together, never unlimited and never a 500.
  The 429 carries a JSON body sent as `application/json` and always a
  `Retry-After` header, even when a custom limiter handler omits it.
- **Request ids.** `request.id` reuses the client's `x-request-id` when it is
  1-128 characters of `[A-Za-z0-9._:-]`; any other value is ignored and a
  UUID is generated, so an id copied into logs can never carry spaces,
  quotes or control characters. `createNodeHttpAdapter({ trustRequestId:
  false })` always generates one. The request guard's own `X-Request-Id`
  check uses the same character set and length, so an id the adapter would
  reuse is never refused first; anything else is answered with 400 unless the
  guard is tuned or turned off.
- Signed-cookie signatures are compared with `@zudojs/crypto`'s constant-time
  `timingSafeEqualString`.
- Contexts built by the stock adapters log through a `@zudojs/logger` console
  logger named `http`, which redacts secret metadata fields (`authorization`,
  `password`, `apiKey`, …).
- `HttpRequestGuardError`, `HttpMiddlewareError` and
  `HttpMiddlewarePipelineError` are the `@zudojs/errors` classes, re-exported.
- `HttpServer.stop()` gives in-flight requests the full
  `gracefulShutdownTimeout`.

## Routes

A route handler returns what a server handler returns:

```typescript
router.get("/health", () => ({ status: "ok" }));          // 200, JSON body
router.get("/users/:id", async (ctx) => loadUser(ctx.params.id));
router.post("/users", () =>
  createResponseContext({ status: 201, body: { created: true } }),
);
router.delete("/users/:id", () => undefined);              // 204
```

A plain value (object, array, string, number, boolean) is sent as `200`
with a JSON body; `undefined` or `null` is `204 No Content`; an
`HttpResponseContext` or a web `Response` is sent as built. (A plain
object used to be a type error and was sent as an empty `204`.) The
router and `RouteDispatcher` behave the same.

Route parameters are set on the request before route middleware runs, so
`ctx.request.getParam("id")` works in a guard or an `extractResource`
loader as well as in the handler (`ctx.params`).

## Middleware errors

An error thrown by a middleware or handler propagates **as the error that
was thrown**. An outer middleware's `await next()` rejects with it, the
pipeline's `onError` receives it, and so does the server's `errorHandler`,
so `error instanceof NotFoundError` works in each. It used to arrive wrapped
in `HttpMiddlewareError` (inside a middleware) or
`HttpMiddlewarePipelineError` (in `errorHandler`), with the original only in
`cause` / `errors[0].cause`.

Code after `await next()` does not run when the chain below it throws,
unless the middleware catches the error:

```typescript
pipeline.use(async (ctx, next) => {
  const started = Date.now();
  try {
    return await next();
  } finally {
    log.info("request", { path: ctx.request.path, ms: Date.now() - started });
  }
});
```

If `onError` returns a response, that is the recovery; if it throws, what
it threw propagates (rethrow the error to pass it on, or throw a different
one to translate it).

`new HttpError(415, "No XML")` without a `code` gets its code from the
status (`"UNSUPPORTED_MEDIA_TYPE"`, `"NOT_FOUND"`, ...), matching the
`notFound()`-style factories, instead of `ERR_OPERATION_FAILED`.

## HTTP client: retries and backoff

```typescript
const client = new HttpClient({
  timeout: 5_000,
  retry: { retries: 3, retryDelay: 200, maxRetryDelay: 5_000 },
});
```

- **What is retried:** responses with a status in `retryStatusCodes`
  (default 429, 502, 503, 504); transport failures such as a refused
  connection (`retryOnNetworkError`, default `true`); and requests that hit
  `timeout` (`retryOnTimeout`, default: the `retryOnNetworkError` value).
  Timeouts used to be excluded, so a `GET` with retries still failed on
  the first timeout. Aborting through your own `signal` is never retried.
- **Which methods:** only `retryMethods` (default `GET`, `HEAD`,
  `OPTIONS`). A `POST` that timed out may already have been processed, so
  it is not replayed unless you list it.
- **Backoff:** the delay is `retryDelay` (default 1000 ms) times
  `2^attempt` with `backoff: "exponential"` (the default), or `retryDelay`
  every time with `"fixed"`, capped at `maxRetryDelay` (default 30 s).
- **Jitter:** each wait is drawn uniformly between 0 and that delay (full
  jitter), so clients that failed together do not retry in lockstep.
  `jitter: false` waits exactly the delay. Jitter used to add up to a fixed
  second regardless of `retryDelay`.
- `retries` counts retries after the first attempt (default 0).

## OpenAPI from your routes

Routes carry their own documentation through the `openapi` option, and the
document is generated from the routes the router actually registered — no
second list to keep in sync. Schemas may be `@zudojs/schema` schemas or raw
OpenAPI schemas.

```typescript
import { objectSchema, stringSchema, numberSchema, optionalSchema } from "@zudojs/schema";
import { createRouter, generateOpenAPIDocument, mountOpenAPI } from "@zudojs/http";

const user = objectSchema({ id: stringSchema().uuid(), name: stringSchema() });

const router = createRouter();
router.get("/users/:id", getUser, {
  openapi: {
    summary: "Get a user",
    tags: ["users"],
    params: objectSchema({ id: stringSchema().uuid() }),
    responses: { "200": { schema: user }, "404": { description: "No such user" } },
  },
});
router.get("/users", listUsers, {
  openapi: { query: objectSchema({ limit: optionalSchema(numberSchema().int()) }) },
});
router.post("/users", createUser, {
  openapi: { body: objectSchema({ name: stringSchema() }), responses: { "201": { schema: user } } },
});
router.get("/health", health, { openapi: false }); // never documented

// One-off document:
const document = generateOpenAPIDocument(router, {
  info: { title: "Users API", version: "1.0.0" },
  exclude: ["/internal/*"],
  validate: true,
});

// Or serve it: GET /openapi.json and a Swagger UI page at GET /docs.
mountOpenAPI(router, {
  info: { title: "Users API", version: "1.0.0" },
  yamlPath: "/openapi.yaml",        // optional
  ui: { renderer: "redoc" },        // optional; any renderOpenAPIUI option
});
```

- `:id` and `{id}` become `{id}`; every template slot is documented even when
  nothing declares it. A regex-constrained `:id(\d+)` becomes a parameter
  with that `pattern`, an optional `:id?` is documented as both paths, and a
  wildcard `*rest` becomes a `{rest}` slot (`wildcards: "exclude"` drops such
  routes instead).
- Left out: `all()` routes, `CONNECT`, routes with `openapi: false` or
  `{ hidden: true }`, and anything matched by `exclude` (exact path,
  `"/prefix/*"`, a `RegExp`, or a predicate). The router's automatic `HEAD`
  and `OPTIONS` answers are not registered routes and never appear.
  `undocumented: "exclude"` documents only routes that declare `openapi`.
- Router groups pass `openapi` defaults to their routes: tags are unioned,
  everything else is overridden by the route.
- The document follows the router: a route added later is in the next
  `generateOpenAPIDocument` call and the next request to a mounted
  `/openapi.json`. `createRouterOpenAPI(router, options)` gives the
  underlying `OpenAPIManager`, re-read only when the route table changed.
- Paths are configurable (`path`, `docsPath: false` to disable the page,
  `ui.specUrl` when served under a prefix), and `middleware` protects the
  documentation routes.

## Mounting web-standard handlers

`mountFetchHandler` serves any `(request: Request) => Response | Promise<Response>`
handler — an `@zudojs/rpc` server, `@zudojs/api` operations, another
fetch-style app — under a path of a router or router group.

```typescript
import { mountFetchHandler } from "@zudojs/http";
import { createRPCFetchHandler } from "@zudojs/rpc";

const unmount = mountFetchHandler(router, "/rpc", createRPCFetchHandler(rpcServer));
// { methods: ["POST"], stripPrefix: false, middleware: [auth] } are optional
```

The handler sees the original method, query, headers (connection-scoped ones
removed) and body; the mount path is stripped from its URL by default and
passed as `x-forwarded-prefix`. Its `Response` is streamed back with status,
status text and headers intact, each `Set-Cookie` kept separate. The
request's `signal` aborts when the client disconnects. A handler that throws
or returns something other than a `Response` fails the request like any
route (a generic 500 unless the error carries a status). `toWebRequest(context)`
does the request conversion on its own.

The origin of the handler's `request.url` comes from the client's `Host`
header (or `X-Forwarded-Host` from a trusted proxy) unless you pin it with
`{ origin: "https://api.example.com" }`. Pin it whenever the handler builds
absolute URLs or compares `Origin` against its own.

Every Node request context now carries that signal too: `request.signal` and
the router's `ctx.signal` abort when the client goes away, and a streamed
response body stops being read.

## Guards that refuse a request

A middleware answers a request itself — 401, 403, 404 — by returning a
`GuardResponse` from `@zudojs/middleware`. The router, `HttpMiddlewarePipeline`
and `RouteDispatcher` send it with its own status, headers and body; headers an
outer middleware already set (CORS, for instance) are kept.

```typescript
import { createGuardResponse } from "@zudojs/middleware";
import { authorize } from "@zudojs/permissions";

router.delete("/posts/:id", deletePost, {
  middleware: [
    authorize(engine, "post:delete", { extractActor }), // 401 / 403
    async (ctx, next) =>
      ctx.request.getHeader("x-confirm")
        ? next()
        : createGuardResponse({ status: 400, body: { error: "Confirm first" } }),
  ],
});
```

A route middleware's return value used to be ignored unless it was an
`HttpResponseContext` or a web `Response`, so `authorize()` and the tenancy
middleware refused requests with `200`. Only the branded object is honoured: an ordinary
object with a `status` key keeps its old meaning.

## Features

- Runtime-independent HTTP server abstraction
- Request/response wrappers with full Web API compatibility
- Middleware pipeline with error handling
- Router with parameter extraction
- OpenAPI documents generated from the registered routes
- Mounting of web-standard fetch handlers
- CORS, security headers, and content negotiation
- HTTP client with interceptors

## Use Cases

- Building REST APIs
- Implementing middleware pipelines
- Handling HTTP requests in serverless environments
- Proxy and gateway implementations
