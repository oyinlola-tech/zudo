---
"@zudojs/http": minor
---

**Breaking-in-effect default: `X-Forwarded-*` is no longer trusted automatically.**

`NodeHTTPRequest` — reached through `createHTTPRequest`, `NodeHTTPAdapter`,
`createHTTPAdapter()`, `adaptNodeRequest()` and `adaptNodeContext()` — used to
read `X-Forwarded-For` and `X-Forwarded-Proto` from any client, with no trust
check at all. A client connecting directly could set its own `request.ip`
(defeating an IP allowlist, per-IP rate limit, ban list or audit trail) and
flip `request.secure` to `true` (an `X-Forwarded-Proto: wss` was enough), so an
app gating `Secure` cookies, HSTS or an https-only redirect on `req.secure`
believed the request had arrived over TLS. The hardened Node adapter path
(`httpAdapter/node/`) already gated these headers; this closes the parallel
path that was left behind.

These headers are now honoured only when the socket peer is a configured
trusted proxy, and a forwarded protocol that is not `http` or `https` is
discarded. **If you run behind a proxy you must now opt in**, with a new
`trustProxy` option (address, CIDR range, `"loopback"`/`"linklocal"`/`"all"`,
hop count or predicate) that defaults to `false`:

```ts
createHTTPAdapter({ trustProxy: "10.0.0.0/8" });
adaptNodeRequest(req, { trustProxy: "10.0.0.0/8" });
adaptNodeContext(req, res, { trustProxy: "10.0.0.0/8" });
createHTTPRequest(req, { trustProxy: "10.0.0.0/8" });
```

Without it, `request.ip` is the socket peer and `request.protocol` reflects the
socket's own TLS state. The exported `getRequestProtocol(request)` and
`getRequestIP(request)` take the same value as an optional second argument.

Also in this release:

- The shared agent registry can find what it created. `getAgent`, `hasAgent`
  and `removeAgent` looked up a key `getOrCreateAgent` never wrote, so every
  lookup missed and the documented per-host teardown was a no-op that leaked
  the agent and its keep-alive sockets for the process lifetime. All four now
  build the same key; `getAgent`/`hasAgent` take the same optional agent
  options, and `removeAgent` without options destroys every agent registered
  for that host.
- `createForwardedHeader` and `formatKeepAliveHeader` no longer emit a raw CR
  or LF inside a quoted parameter. Both now escape through the package's
  `escapeHeaderQuotedString` and validate the finished field value, so a
  `Forwarded` or `Keep-Alive` value carrying a control character throws a
  `TypeError` instead of putting an attacker-chosen header on the wire.
- `createSecurityMiddleware()` with no options now emits the package's
  declared safe baseline (`createDefaultSecurityHeaderOptions`) —
  `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`,
  the cross-origin isolation headers and `X-Permitted-Cross-Domain-Policies`,
  on top of the three it emitted before. Explicit options still override it,
  and `useDefaults: false` still emits only what you configure.
- `guardRequest` applies `maxHeaderValueSize` and the CRLF filter to
  array-valued headers (`set-cookie`, and any header supplied as a list),
  which previously skipped both checks and still reported `allowed: true`.
- `createLoggingMiddleware({ includeHeaders: true })` redacts credential
  headers — `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and
  the rest of the `@zudojs/logger` secret-field set — before the record
  reaches the logger. Extra names can be added with `redactHeaders`.
- The redirect predicates accept a relative `Location`. `hasRedirectLoop`,
  `assertNoRedirectLoop`, `isSameOrigin` and `isHTTPS` threw
  `TypeError: Invalid URL` on `/a`, which is both legal under RFC 9110 and
  what this module's own `createRedirect` emits by default.
- The proxy SSRF blocklist covers `192.0.0.0/24` (IETF protocol assignments)
  and `198.18.0.0/15` (benchmarking), which its JSDoc already claimed.
- `runWithRequestContext` / `getCurrentRequestContext` work. The
  `AsyncLocalStorage` behind them was loaded through `globalThis.require`,
  which does not exist in ESM, so the store silently stayed `undefined`:
  `runWithRequestContext` merely called its callback and
  `getCurrentRequestContext()` always returned `undefined`.
- `request.path` and the router now agree about repeated slashes. A request for
  `//admin/secret` dispatched to the route registered at `/admin/secret` while
  a guard reading `request.path` saw `//admin/secret` and did not match.
  Repeated slashes are collapsed once, where both sides parse the
  request-target, so `getPathname("//admin/secret")` is `/admin/secret`. An
  origin-form target is still never parsed as an authority.
