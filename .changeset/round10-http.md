---
"@zudojs/http": minor
---

Round 10 fixes.

- **HTTP-01:** `createPathMiddleware` matches paths the way the router does (canonical parse, repeated/trailing slashes ignored, case-insensitive by default; new optional `{ caseSensitive }` third argument). `/Admin`, `/admin/` and `/admin//` no longer skip a guard on `/admin`.
- **HTTP-02:** error responses use the **outermost** error carrying a status. Only `HttpMiddlewareError` / `HttpMiddlewarePipelineError` are unwrapped; a wrapped `cause` never supplies status, message or headers, and a status-less application error is a 500.
- **HTTP-03 (behaviour change):** a plain object returned from a handler or error handler is always sent as JSON. Return `createResponseContext({ status, headers, body })` to set a status. `isResponseContextInit` / `isResponseContextLike` are deprecated (kept).
- **HTTP-04 (behaviour change):** the Node adapter answers 400 to request-targets with `.`/`..` segments (plain or `%2e`), backslashes, or a non-origin/absolute form. `request.path`, the router, path middleware and static files share one parser (`parseRequestTarget`, `getCanonicalPath`, `findRequestTargetViolation`, `isCanonicalRequestTarget` are new exports); `//host/x` stays a path.
- **HTTP-05 (behaviour change):** `NodeHttpAdapter` runs `guardRequest` on every request by default (new `security` option: a config object, or `false` to disable). HTTP/1.0 requests may omit Host (new `requireHost` config field); body limits stay with `maxBodySize` (413). New export `createNodeRequestGuard`.
- **HTTP-06 (behaviour change):** `joinProxyPath` (and so `createProxyRequest`, `buildProxyRequestPath`, `resolveProxyURL`) throws a 400 `HttpError` for paths with dot segments, including `%2e`/`%2f`/`%5c` forms. New exports `hasProxyDotSegment`, `assertProxyPathContained`.
- **HTTP-07:** `request.query`, `getQuery()` and the router's `ctx.query` use one parser: repeated names are arrays, records have a null prototype. `parseNodeQuery` now returns `string | readonly string[]` values.
- **HTTP-08:** numeric `trustProxy` is a hop count; an invalid value throws at adapter construction.
- **HTTP-09:** `HttpServer.stop()` passes `gracefulShutdownTimeout` to the adapter (`HttpAdapter.stop(options?)`, `stopAdapter(adapter, options?)`).
- **HTTP-10 (behaviour change):** `serializeCookie`, `response.cookie()` and `serializeResponseCookie` default to `Path=/; HttpOnly; Secure; SameSite=Lax`; override per attribute. New export `DEFAULT_COOKIE_ATTRIBUTES`.
- **HTTP-11 (behaviour change):** `serializeSignedCookie` binds the MAC to the cookie name; verify with `parseSignedCookie(value, secret, name)`. Without `name` only legacy value-only signatures verify.
- **HTTP-12:** image/video compression middleware read the response returned by `next()`, image honours `maxWidth`/`maxHeight`, video builds an `ffmpeg()` command, and both accept an `onError` callback instead of swallowing failures.
- **HTTP-13:** CORS origin matching delegates to `@zudojs/security`'s `isOriginAllowed`; new `createRateLimitMiddleware` wraps `@zudojs/security`'s `createRateLimiter`.
- **HTTP-14:** `HttpServer` counts requests and fires `onRequest` / `onResponse`.
- **HTTP-15:** static middleware evaluates conditionals with `evaluateConditionalRequest` (ETag lists, weak tags, `*`, `If-Modified-Since`, 412).
- **HTTP-16 (behaviour change):** `createCorsMiddleware` throws `ConfigurationError` at construction for a wildcard origin (including the default) with `credentials: true`.

Round 10 phase 2:

- HTTP-11: `parseSignedCookie` compares signatures with `@zudojs/crypto`'s `timingSafeEqualString`; the local constant-time helper is gone. `signCookieValue` keeps `node:crypto` `createHmac` because it is synchronous and every `@zudojs/crypto` HMAC helper is async.
- CONV-02: `HttpRequestGuardError`, `HttpMiddlewareError` (+ `HttpMiddlewareErrorOptions`) and `HttpMiddlewarePipelineError` are re-exported from `@zudojs/errors`. **Behaviour change:** `HttpRequestGuardError` is now a `BaseError` (code `HTTP_REQUEST_REJECTED`, category `validation`, `expose: false`, a status outside 400-499 falls back to 400) instead of a plain `Error`, and its `errors` array is a frozen copy.
- events/H6: contexts created by `NodeHTTPAdapter`, `NodeContextAdapter` and `adaptNodeContext` get a `@zudojs/logger` console logger (`createDefaultLogger("http")`) instead of a `console.*` shim. **Behaviour change:** secret metadata fields are printed as `[REDACTED]`, output uses the logger's text format, and the context logger now implements the full `Logger` interface (`debug`, `child`, …) instead of only `info`/`warn`/`error`.
- Rate limiting: `createRateLimitMiddleware` counts a request whose `remoteAddress` is missing or not an IP in one shared bucket (new export `UNKNOWN_CLIENT_RATE_LIMIT_IP`, `0.0.0.0`). Such a request used to hit `@zudojs/security`'s `ConfigurationError` and fail with a 500.
