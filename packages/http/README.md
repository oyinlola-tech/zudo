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
  wraps `@zudojs/security`'s `createRateLimiter`.
- `HttpServer.stop()` gives in-flight requests the full
  `gracefulShutdownTimeout`.

## Features

- Runtime-independent HTTP server abstraction
- Request/response wrappers with full Web API compatibility
- Middleware pipeline with error handling
- Router with parameter extraction
- CORS, security headers, and content negotiation
- HTTP client with interceptors

## Use Cases

- Building REST APIs
- Implementing middleware pipelines
- Handling HTTP requests in serverless environments
- Proxy and gateway implementations
