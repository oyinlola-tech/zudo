# @zudojs/http

## 1.5.0

### Minor Changes

- Round 12: fixes for the academy package findings assigned to `@zudojs/http`
  ([#49](https://github.com/oyinlola-tech/zudo/issues/49)–[#56](https://github.com/oyinlola-tech/zudo/issues/56), [#65](https://github.com/oyinlola-tech/zudo/issues/65), [#66](https://github.com/oyinlola-tech/zudo/issues/66), [#83](https://github.com/oyinlola-tech/zudo/issues/83), [#93](https://github.com/oyinlola-tech/zudo/issues/93), [#107](https://github.com/oyinlola-tech/zudo/issues/107), [#113](https://github.com/oyinlola-tech/zudo/issues/113), [#114](https://github.com/oyinlola-tech/zudo/issues/114), [#115](https://github.com/oyinlola-tech/zudo/issues/115), [#126](https://github.com/oyinlola-tech/zudo/issues/126), [#131](https://github.com/oyinlola-tech/zudo/issues/131), [#137](https://github.com/oyinlola-tech/zudo/issues/137)).

  **Security (default behaviour changed, deliberately):**

  - [#137](https://github.com/oyinlola-tech/zudo/issues/137) Every response an adapter builds itself — a request refused by the
    request guard, the adapter's own `413`, an unhandled error (`500`), a thrown
    `HttpError`, and the response a custom `errorHandler` returns — now carries
    the package's default security headers (`X-Content-Type-Options`,
    `X-Frame-Options`, `Content-Security-Policy`, HSTS, …). They were only ever
    added by `createSecurityMiddleware`, which never sees a response that
    escapes the pipeline. New adapter option `securityHeaders: boolean |
Record<string, string>` (default `true`; an object replaces the set, `false`
    restores the old behaviour). Only header names the response lacks are
    filled in.
  - [#137](https://github.com/oyinlola-tech/zudo/issues/137) `createDefaultCSPOptions()` no longer allows `style-src
'unsafe-inline'` and adds `object-src 'none'`; `createDefaultHSTSOptions()`
    uses `max-age=63072000` (two years). Both now match
    `@zudojs/security`'s `generateSecurityHeaders()`. Applications relying on
    inline styles under the default CSP must pass their own
    `contentSecurityPolicy`.
  - [#66](https://github.com/oyinlola-tech/zudo/issues/66) One default request body limit: `DEFAULT_MAX_BODY_SIZE` (10 MiB) is
    shared by `DEFAULT_SECURITY_CONFIG.maxBodySize`, the Node adapter and the
    fetch helpers. The guard previously documented 1 MB while the adapters
    enforced 10 MB; `guardRequest` callers relying on the 1 MB `Content-Length`
    check should pass `maxBodySize` explicitly.
  - [#83](https://github.com/oyinlola-tech/zudo/issues/83) `DEFAULT_MAX_FILES` (form-data parser) is now 20, the same as
    `DEFAULT_MULTIPART_MAX_FILES`; it was 100.

  **Router:**

  - [#49](https://github.com/oyinlola-tech/zudo/issues/49) A pattern reusing a parameter or wildcard name (`/bad/:a/:a`) throws
    `DuplicateRouteParameterError` at registration; the second value used to win
    silently.
  - [#50](https://github.com/oyinlola-tech/zudo/issues/50) A wildcard that is not the final segment (`/files/*rest/more`) throws
    `InvalidRoutePatternError`; the tail was never checked.
  - [#51](https://github.com/oyinlola-tech/zudo/issues/51) A constrained parameter (`:id(\d+)`) now outranks an unconstrained one,
    the end of a pattern outranks an optional parameter or wildcard (so
    `/files` beats `/files/*path` for `/files`), and at equal specificity a
    method-specific route is tried before an `all()` route. Registering a route
    that another route, for the same method, makes unreachable now throws
    `RouteConflictError` (previously the dead route registered silently); pass
    `createRouter({ shadowedRoutes: "ignore" })` to opt out. Note: this refuses
    a registration that never worked, but an application that had such a dead
    route will now fail at startup instead of at runtime.
  - [#52](https://github.com/oyinlola-tech/zudo/issues/52) A `405`'s `Allow` header and `RouterMatch.allowedMethods` include the
    automatic `HEAD` and `OPTIONS`, matching what the router answers.
  - [#65](https://github.com/oyinlola-tech/zudo/issues/65) Routes are sorted once per registration change instead of on every
    request; `compiled()` returns the cached list.
  - [#93](https://github.com/oyinlola-tech/zudo/issues/93) New `createRouter({ onError })`: turns a thrown handler/middleware error
    into a response and reports it as `RouterResult.error`. Without it (and when
    it returns `undefined`) `dispatch()` rethrows as before.
  - [#55](https://github.com/oyinlola-tech/zudo/issues/55) The default 404/405 bodies are serialized strings like every `.json()`
    response; `createRequestContext({ url: "/x?a=1" }).query` is parsed from the
    URL when no `query` is given.
  - [#56](https://github.com/oyinlola-tech/zudo/issues/56) `buildRoutePath` throws `HttpRouterError` for a missing parameter,
    leaves no trailing slash for an omitted optional parameter, strips
    constraints, and fills `{name}` and `*rest` segments.
  - [#107](https://github.com/oyinlola-tech/zudo/issues/107) `RouteTree` agrees with the router: named wildcards (`*rest`), brace
    and optional parameters, every parameter along the path reported, literal
    segments matched case-insensitively by default (`RouteTreeOptions.caseSensitive`),
    and a literal-anchored wildcard preferred over a longer all-parameter route.

  **Errors and bodies:**

  - [#114](https://github.com/oyinlola-tech/zudo/issues/114) Every framework-built error body carries `error` and `code`: the
    router's 404/405 add `code`, the adapter's generic 500 adds
    `INTERNAL_SERVER_ERROR`, a non-exposed status error carries its status name,
    and the rate-limit 429 gains top-level `code` and `message` beside the
    existing `error` object. Nothing was removed.
  - [#131](https://github.com/oyinlola-tech/zudo/issues/131) A thrown validation error with `issues` (`ValidationError`,
    `SchemaError`, `@zudojs/schema` errors) now includes a sanitized `issues`
    list (`path`/`field`/`code`/`message`, never submitted values) when exposed.
  - [#115](https://github.com/oyinlola-tech/zudo/issues/115) A custom `errorHandler`'s response receives the thrown error's headers
    (`Retry-After`, `WWW-Authenticate`, `Allow`) for names it did not set itself.
  - [#126](https://github.com/oyinlola-tech/zudo/issues/126) The 5xx factories document that their message is hidden unless
    `{ expose: true }` is passed; the secure default is kept.
  - [#54](https://github.com/oyinlola-tech/zudo/issues/54) A request refused only for URL/query length is answered `414`, and an
    `HTTPQueryLimitError` raised while building the request context keeps its
    `414`; both used to be `400`.
  - [#53](https://github.com/oyinlola-tech/zudo/issues/53) The root `parseQueryString` accepts a bare query string (`"a=1"`), not
    only a URL.

  **Exports:**

  - [#113](https://github.com/oyinlola-tech/zudo/issues/113) `createHttpClient`, `createHttpClientWithBaseUrl` and `httpGet` /
    `httpPost` / `httpPut` / `httpPatch` / `httpDelete` / `httpHead` /
    `httpOptions` are exported from the package root.
  - [#83](https://github.com/oyinlola-tech/zudo/issues/83) New `sniffContentType(bytes)` and `matchesDeclaredContentType(bytes,
declared)` identify common file signatures from magic bytes.
  - [#134](https://github.com/oyinlola-tech/zudo/issues/134) (security default) `mountOpenAPI` no longer serves the documentation
    page when `NODE_ENV` is `production` and no `docsPath` is given. Pass
    `docsPath: "/docs"` to keep it; the JSON document is served either way.
    This matches what `zudojs-cli` projects already generate.
  - The shadowed-route error is built with `RouteConflictError`'s new
    `{ reason, message }` options (`error.reason` names the shadowing route).

### Patch Changes

- Updated dependencies []:
  - @zudojs/logger@1.5.0
  - @zudojs/middleware@1.1.3
  - @zudojs/openapi@1.6.0
  - @zudojs/crypto@1.4.0
  - @zudojs/security@1.3.4
  - @zudojs/errors@1.4.0

## 1.4.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/crypto@1.3.3
  - @zudojs/logger@1.4.3
  - @zudojs/middleware@1.1.2
  - @zudojs/openapi@1.5.2
  - @zudojs/security@1.3.3

## 1.4.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/crypto@1.3.2
  - @zudojs/logger@1.4.2
  - @zudojs/middleware@1.1.1
  - @zudojs/openapi@1.5.1
  - @zudojs/security@1.3.2

## 1.4.2

### Patch Changes

- Updated dependencies [`e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/security@1.3.1
  - @zudojs/logger@1.4.1
  - @zudojs/openapi@1.5.0

## 1.4.1

### Patch Changes

- A guard response returned inside an `HttpMiddlewarePipeline` is now written onto the ambient response, so headers an outer middleware set before `next()` (CORS, request id, security headers) are kept on the refusal, as they already were on the router and route-dispatcher paths. README: the request guard's `X-Request-Id` check uses the same character set as request-id reuse.

## 1.4.0

### Minor Changes

- Guards now refuse with real status codes, and permission policies no longer grant access on their own.

  **Security — `@zudojs/permissions`: a policy's allow is no longer a grant (behaviour change).** An allowing policy used to grant the permission without any role check, so a "business-hours" policy handed `task:delete` to an actor with no roles, and the README taught that pattern. A policy is now, by default, an extra condition on top of RBAC/ABAC (`effect: "constrain"`): it can deny, but an allow only means "no objection", and the actor's roles, permissions or rules must still grant the permission. A policy that really establishes the right on its own, such as an ownership check, opts in with `effect: "grant"`. To get the old behaviour back for every policy that sets no `effect`, pass `createPermissionEngine({ defaultPolicyEffect: "grant" })`. **If you relied on a policy to grant access, those checks now deny until you add `effect: "grant"`.** A granting policy still never overrides a denial, and only the exact value `"grant"` grants (a typo constrains). An allow from constraining policies alone now reports `reason: "policy_pass"` internally. New exports: `PolicyEffect`, `policyGrants`, `DEFAULT_POLICY_EFFECT`.

  **Security / misreporting — denials were sent as `200`.** A route middleware that returned a plain `{ status, body, headers }` object had it ignored by `@zudojs/http`, so `authorize()` and the tenancy middleware refused requests (the handler never ran) but clients, caches and monitoring saw `200`. The fix is a small, explicit contract:

  - `@zudojs/middleware`: new `createGuardResponse({ status, body?, headers? })`, `isGuardResponse()`, the `GuardResponse` type and the `GUARD_RESPONSE` brand (`Symbol.for("zudojs.middleware.guardResponse")`). A structured body gets `content-type: application/json` by default. A status outside 100–599 throws `RangeError`.
  - `@zudojs/http`: the router, `HttpMiddlewarePipeline` and `RouteDispatcher` send a guard response with its status, headers and JSON body, keeping headers an outer middleware already set. `HttpMiddlewareResult` includes `GuardResponse`. New helpers `applyGuardResponse` and `guardResponseToContext`. An unbranded object keeps its previous meaning, so data with a `status` key is never read as a response. `@zudojs/http` now depends on `@zudojs/middleware`.
  - `@zudojs/permissions`: `createForbiddenResponse`, `createUnauthorizedResponse` and `createJsonResponse` (and therefore `authorize()`, `createRequirePermissionMiddleware`, `createRequirePermissionsMiddleware` and `createActorMiddleware({ requireActor: true })`) return guard responses. `PermissionHttpResponse` is now an alias of `GuardResponse` (same fields plus the brand). `createJsonResponse` throws `RangeError` for a status outside 100–599.
  - `@zudojs/tenancy`: `createResolveTenantMiddleware`, `createRequireTenantMiddleware`, `createTenantGuardMiddleware` and the helpers `createBadRequest`, `createUnauthorized`, `createForbidden`, `createNotFound`, `createJsonErrorResponse` return guard responses, including the custom `notFoundResponse` / `deniedResponse` bodies. New helper `createJsonResponse(status, body)`.

  **Middleware types are assignable to `@zudojs/http`.** The `HttpMiddleware` types mirrored in `@zudojs/permissions` and `@zudojs/tenancy` are now generic over what `next()` returns, so every exported guard can be put in a route's `middleware` list without `as never`. A hand-written middleware typed with these mirrors can no longer return a plain `{ status, body, headers }` object (it was never sent as a response); return `createGuardResponse(...)` instead. New type `HttpMiddlewareOutcome`.

  **`@zudojs/tenancy`: `createResolverChain([...])` infers its context.** The README Quick Start (`createResolverChain([createJwtResolver(), createDomainResolver({ repository }), createSubdomainResolver(...)])`) failed with TS2322 unless you wrote `<HttpResolverContext>`. The context is now the intersection of what the resolvers read; an explicit type argument still works. New type `ResolverChainContext`.

  **`@zudojs/auth`:**

  - `AccountLockedError` (423) and `AuthRateLimitError` (429) carry `retryAfterSeconds` and a `Retry-After` header in `headers`, which `@zudojs/http` copies onto the response; the lockout's value is the time left on the lock.
  - Distinct error codes (behaviour change for clients that match codes): `AccountLockedError` is `ERR_ACCOUNT_LOCKED`, `AccountDeactivatedError` is `ERR_ACCOUNT_DEACTIVATED`, and `TokenRevokedError` is `ERR_TOKEN_REVOKED`; all three used to be `ERR_FORBIDDEN`. **`TokenRevokedError` is now `401` (category authentication) instead of `403`**, since the client has to authenticate again.
  - `needsRehash()` returns `false` for a hash made with `@zudojs/crypto`'s own `hashPassword()` defaults (same N, r, p; 16-byte salt and 32-byte key), which it used to flag on every login.
  - Security: `login()` normalizes the identifier before `findUser()` sees it (NFKC, trim, and lower-case for an email address; usernames keep their case). Use the new `normalizeLoginIdentifier()` at registration so both sides agree. `normalizeIdentifier: false` passes the raw string, or supply your own function. Lockout counters were already case-insensitive.
  - New `createSessionForUser(userId, { method, userAgent?, ip?, metadata? })` issues a session and tokens for a user authenticated outside `login()`, such as the `@zudojs/auth-oauth` callback, without a password check. It is off by default: it throws `AuthConfigurationError` unless `method` is listed in the new `externalSessionMethods` option. It refuses unknown and deactivated users and records `metadata.authMethod` on the session. `@zudojs/auth` now depends on `@zudojs/types`.

  **`@zudojs/errors`:** new codes `ErrorCode.TOKEN_REVOKED`, `ErrorCode.ACCOUNT_LOCKED` and `ErrorCode.ACCOUNT_DEACTIVATED`.

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - OpenAPI is now generated from the application instead of being added to the manager by hand. `@zudojs/http` routes take an `openapi` option (summary, tags, operationId, `params`/`query`/`headers`/`body` schemas, responses, security, `deprecated`, `false` to hide; merged from router groups), and `generateOpenAPIDocument(router, options)`, `createRouterOpenAPI(router, options)` and `mountOpenAPI(router, options)` (serves `/openapi.json`, optional YAML and a Swagger UI/ReDoc page at `/docs`) build the document from the routes the router actually registered: `:id`/`{id}` become templates, regex constraints become parameter patterns, optional segments expand, wildcards are documented or excluded, `all()`/`CONNECT` and automatic HEAD/OPTIONS never appear, and routes can be excluded by path, RegExp or predicate. `mountFetchHandler(router, basePath, handler)` serves a web-standard `(Request) => Response` handler from a router (headers, body, status, every Set-Cookie and a streamed body preserved; the request's signal aborts on client disconnect), with `toWebRequest` exported on its own.

  `@zudojs/openapi` adds the transport-neutral `createOpenAPIDocumentFromRoutes(routes, options)` / `createOpenAPIManagerFromRoutes` over the structural `OpenAPIRouteDescriptor`, `OpenAPIManager.setRoutes()` and `routeWarnings()`, and route metadata accepts `@zudojs/schema` or raw schemas for `params`, `query`, `headers`, `cookies`, `body` and response `schema`. Every path template slot is now documented even when undeclared, and `security: []` (a public operation) is no longer dropped.

  Fixes in `@zudojs/http`: `RequestContextInit.signal` was silently discarded, so the router's `ctx.signal` could never fire (the Node adapter now aborts it when the client disconnects); a `Response` returned by a route handler had every `Set-Cookie` folded into one invalid header; a streamed response body kept being read after the client disconnected and the source was never cancelled.

  From the release security review: `mountFetchHandler`'s and `toWebRequest`'s `origin` option now pins the handler's origin for every request. Before, it was only a fallback, and the client's `Host` header always chose it. A group's `openapi` defaults no longer override a route's `metadata: { openapi: false }` or `{ hidden: true }`, which had published hidden routes. `toWebRequest` labels a parsed body it re-encodes as `application/json` unless the request already had a JSON content type.

  **Behaviour change in `@zudojs/openapi`:** a route with no documented responses, including `responses: {}`, no longer gets an invented `"200": { description: "OK" }`. That invented response documented a `204` DELETE as `200`, and it meant the validator's "at least one response" check could never fire. Such an operation now gets a spec-valid `default` response described as "Undocumented response" (`UNDOCUMENTED_RESPONSE_DESCRIPTION`). A route warning (`DELETE /users/:id: no responses are documented; ...`) goes to `manager.routeWarnings()`, to `onSchemaWarning("routes", …)`, and to the new `onRouteWarning(message)` manager option, which `createOpenAPIDocumentFromRoutes` and `createOpenAPIManagerFromRoutes` accept too. Because `@zudojs/http`'s `generateOpenAPIDocument` options share `onRouteWarning`, it now receives these warnings along with the duplicate-route warnings it already reported. Declare the responses an operation returns to silence them.

  Fixes in `@zudojs/http` from lesson feedback:
  - `request.id` reuses an incoming `x-request-id` when it is 1-128 characters of `[A-Za-z0-9._:-]`, as documented; any other value is ignored and a UUID generated. The Node adapter always generated one. Opt out with `createNodeHttpAdapter({ trustRequestId: false })`; `resolveIncomingRequestId()` is exported.
  - `HttpClient` retries a request that hit `timeout` for methods in `retryMethods` (default `GET`, `HEAD`, `OPTIONS`; never `POST` unless listed), controlled by the new `retryOnTimeout` (defaults to `retryOnNetworkError`). Timeouts were never retried. Backoff jitter is now "full jitter", a random wait between 0 and the computed delay, instead of up to a fixed extra 1000 ms whatever `retryDelay` was; `jitter: false` waits exactly the delay. See the README's "HTTP client: retries and backoff".
  - Route handlers may return a plain JSON value, sent as `200` with a JSON body like a server handler's (`undefined`/`null` stay `204`); a plain object was a type error and went out as an empty `204`. New `RouterHandlerResult` / `RouterJsonValue` types; the router and `RouteDispatcher` agree.
  - Route parameters are set on the request before route middleware runs, so `request.getParam("id")` works in guards and `extractResource` loaders; they always denied.
  - `createRateLimitMiddleware`'s 429 is sent as `application/json` (it was `text/plain`) and always has `Retry-After`, even when a custom limiter handler leaves it out.
  - `createHttpServer` takes `HttpServerOptions`: `adapter`, `handler` and `errorHandler` are typed, so `handler: async (request) => request.path` compiles under `strict` (it was TS7006 on `unknown` options).
  - **Behaviour change:** an error thrown in the middleware pipeline propagates as the error that was thrown. A middleware around `await next()` used to get `HttpMiddlewareError` and the server's `errorHandler` `HttpMiddlewarePipelineError` (original in `cause` / `errors[0].cause`), so `instanceof NotFoundError` failed in both. If `onError` throws, its own error propagates instead of a pipeline wrapper. Code that unwrapped `.cause` / `.errors` should check the error directly.
  - `new HttpError(415, message)` without a `code` gets its code from the status (`"UNSUPPORTED_MEDIA_TYPE"`, like the `notFound()` factories) instead of `ERR_OPERATION_FAILED`; new `defaultErrorCode(status)`.

  `@zudojs/http`: the request guard's default `requestIdPattern` now matches the rule used to reuse an incoming `x-request-id` (`[A-Za-z0-9._:-]`, up to 128 characters), so trace ids containing `.` or `:` are no longer refused with 400 before they can be reused.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/security@1.3.0
  - @zudojs/crypto@1.3.1
  - @zudojs/logger@1.4.0
  - @zudojs/middleware@1.1.0
  - @zudojs/openapi@1.5.0

## 1.3.0

### Minor Changes

- **Breaking-in-effect default: `X-Forwarded-*` is no longer trusted automatically.**

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

- [`d63af51`](https://github.com/oyinlola-tech/zudo/commit/d63af511465e8d2c9e040f5282965e05766200df) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Harden and consolidate the HTTP query layer.

  `NodeHTTPRequest.query`, `createHTTPRequest()` and the `parseQueryString` the
  package barrel exports all ran a second, unhardened query parser that
  accumulated into an object literal and read `result[key]` without an
  own-property check. On fully attacker-controlled input that meant:

  - `?__proto__=a&__proto__=b` assigned an array through the `__proto__` setter,
    replacing the returned query object's prototype. The parameter vanished from
    its own keys while the object silently gained `length`, `map` and the rest of
    `Array.prototype`.
  - `?constructor=x` read the inherited `Object` constructor as the "existing"
    value and stored it in the result, handing a handler
    `query.constructor === [Object, "x"]`.
  - None of the four documented query limits applied, so a request carrying
    50,000 parameters was parsed in full.

  All of these paths now delegate to the hardened `httpQuery` parser that the
  Node adapter and the router already used, so every entry point produces a
  null-prototype record, drops `__proto__` / `constructor` / `prototype`, and
  throws `HTTPQueryLimitError` (414) on a limit breach.

  Also fixed in `httpQuery`:

  - `getQueryStrings()` threw `TypeError: Cannot convert object to primitive
value` for `?a[b]=1&a=2`, because the parsed array holds a null-prototype
    object that `String()` cannot coerce. It is now total over every parseable
    shape.
  - `getQueryString()` returned `null` while declaring `string | undefined`; a
    literal `?a=null` now yields `"null"`.
  - `hasQuery()` and `querySize()` answered from the raw search params rather
    than the parsed query, so `hasQuery(req, "a")` was `false` for `?a[b]=1` and
    `hasQuery(req, "__proto__")` was `true` for a key the parser drops. They now
    answer about the object `getQuery()` returns.
  - `maxKeys` was checked before comma expansion, so one parameter could expand
    past the cap under `commaSeparated`. It now counts emitted pairs.
  - `maxTotalLength` and `commaSeparated` were ignored when the input was a
    `URLSearchParams`; both entry points now share one tokenizer.
  - `cloneQuery()` used a `JSON.parse(JSON.stringify(…))` round-trip, which
    rebuilt every level with `Object.prototype` and so discarded the null
    prototype the parser exists to guarantee. It is now a structural deep copy.
  - `mergeQuery()` assigned nested source objects by reference, so the merged
    result aliased its inputs. Values are deep-copied.
  - `stringifyQuery()` / `buildQueryString()` had no depth or cycle guard and
    overflowed the stack with a bare `RangeError` on a cyclic or deeply nested
    object. Both now throw `HTTPQueryLimitError`, and both accept a `maxDepth`
    option.

  `QueryValue` is now recursive (`QueryPrimitive | QueryValue[] | QueryObject`).
  The previous `QueryPrimitive[]` described a shape the parser could not
  produce, since `?a[b]=1&a=2` puts an object inside the array.

  `httpQuery` is split into `queryTypes/`, `queryParse/`, `queryRequest/` and
  `querySerialize/`. The public API is unchanged and still re-exported from
  `@zudojs/http`.

- Router, content negotiation and cache-control fixes.

  - An `OPTIONS` request that only matches routes registered under other methods
    no longer runs one of those handlers. The fallback now resolves to a
    synthetic route with no middleware that answers `204` with an `Allow`
    header, which is what `HttpRouter.dispatch()` already did. Previously
    `OPTIONS /accounts/42` executed a `DELETE /accounts/:id` handler — behind
    any CSRF or auth middleware that treats `OPTIONS` as a safe method.
  - Headers, cookies, status and metadata that route middleware writes to
    `context.response` are kept when the handler runs. They used to be discarded
    whenever the handler returned its own response, so a guard that set a
    security header and called `next()` had no effect on the response sent.
  - Route patterns are no longer truncated at the first `?`, so the documented
    optional-parameter syntax (`/account/:id?/profile`, `/files/{name?}`) works.
    `{name?}` no longer throws `InvalidRoutePatternError`, registering both
    `/users/:id` and `/users/:id?` no longer throws a spurious
    `RouteConflictError`, and an optional parameter only claims a path segment
    when the segments after it still have input left. Request paths are
    unaffected: their query string is still stripped.
  - `strictTrailingSlash` is honoured. A strict router now distinguishes
    `/users` from `/users/` instead of storing the option and ignoring it.
  - Route precedence compares segments left to right by kind (literal, then
    parameter, then wildcard) instead of summing them into one score, so
    `/admin/*rest` now wins over `/:p/:q/:r/:s` for `GET /admin/a/b/c`. Fully
    literal and mixed patterns rank as before.
  - `Allow` honours the router's `caseSensitive` option, so a case-sensitive
    router no longer advertises a method belonging to a route that differs only
    by case.
  - `RouteDispatchOptions.preserveResponse` is implemented: with it set, a
    handler's response is no longer merged into the response passed to
    `dispatch()`.
  - `calculateFreshness()` / `isFresh()` age a cached response. The current age
    is now the `Age` header plus the time elapsed since the response's `Date`,
    and `Expires` is compared against the current time, so a stale response is
    finally reported stale. `calculateFreshness()` takes an optional third
    argument for the current time.
  - `getEncodingQuality()` / `getLanguageQuality()` let the most specific
    preference win, so an explicit `gzip;q=0` is no longer overridden by
    `*;q=1`.
  - `negotiateEncoding()` falls back to `identity` when the client names only
    codings the server does not have, unless `identity;q=0` or a `*;q=0`
    excludes it.
  - New helpers are exported alongside the existing ones:
    `normalizeRoutePattern`, `normalizeMatchPath`, `splitRoutePattern`,
    `hasTrailingSlash` and `compareSegmentSpecificity`. `normalizePath` keeps
    its current request-path behaviour.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`, `95c1d56`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/logger@1.3.0
  - @zudojs/security@1.2.0
  - @zudojs/crypto@1.3.0

## 1.2.0

### Minor Changes

- Round 10 fixes.

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

### Patch Changes

- Updated dependencies [`5d6b957`, `d2b01bf`, `5d6b957`, `5d6b957`]:
  - @zudojs/crypto@1.2.0
  - @zudojs/errors@1.1.0
  - @zudojs/logger@1.2.0
  - @zudojs/security@1.1.0

## 1.1.0

### Minor Changes

- - `NodeHttpAdapter` no longer drops the connection when a query string contains malformed percent-encoding (`/?a=%E0`); the raw value is kept. Query pairs are split on the first `=` (`a=b=c` keeps `b=c`) and `+` decodes to a space. A request whose context cannot be created is answered `400 Bad Request` instead of a socket reset.
  - `serializeResponseCookie()` (used by `response.cookie()`) now validates the cookie name, enforces the `__Host-`/`__Secure-` prefix rules, rejects `;` and control characters in `Domain`/`Path`, and percent-encodes a value that is not made of RFC 6265 `cookie-octet`s, so a value like `x; Domain=evil.com` can no longer inject attributes. Valid values are emitted unchanged.
  - `HttpResponseContext.redirect()` and `redirectResponse()` refuse unsafe destinations (`javascript:`, `data:`, scheme-relative `//evil.com`, control characters) by throwing a `TypeError`; path references and absolute `http(s)` URLs are unchanged.
  - `RouteDispatcher` merges the cookies, status text and metadata of a response context returned by a route handler; previously only status, headers and body survived.
  - An `HttpError` thrown from a handler (or middleware) — `notFound()`, `unauthorized()`, … — is answered with its own status, its exposed message/code and its headers (e.g. `WWW-Authenticate`) by the default error path of `NodeHttpAdapter` and `BaseHttpAdapter`, including when it is wrapped by the middleware pipeline. Non-exposed errors and plain `Error`s still get a generic body.
  - `NodeHttpAdapter.stop()` removes the `clientError` listener it installed, so an externally supplied `http.Server` no longer accumulates one listener per restart.
  - `HttpClient` can retry a request that carries a body (`retryMethods: ["POST"]`); the first retry used to fail with "Request object that has already been used".
  - `createStaticMiddleware()` parses the adapter's request-target (`/pub/app.js`) correctly; it used to throw `Invalid URL` and answer 500 for every request delivered by `NodeHttpAdapter`.
  - README quick start rewritten against the real API (`createHttpServer` + `createNodeHttpAdapter`); `createHTTPServer` and `{ fetch }` handlers never existed.

### Patch Changes

- Updated dependencies []:
  - @zudojs/core@1.1.0
  - @zudojs/errors@1.0.1
  - @zudojs/logger@1.1.0
  - @zudojs/security@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Make the package buildable, then harden the request path: 166 audit findings, 15 of them critical.

  **The published `@zudojs/http@0.1.0` has no entry point.** `tsconfig.json`
  excluded `src/httpRouter/**` and `src/index.ts` from both `typecheck` and
  `build`, so `dist/index.js` — the declared `main`, `module` and `types`, with
  `files: ["dist"]` — was never emitted, and `import("@zudojs/http")` failed with
  `ERR_MODULE_NOT_FOUND` for every consumer. The exclusion also hid **242 compile
  errors**, including a router importing modules that did not exist. `permissions`,
  `tenancy` and `testing` all depend on this package and were broken by it.

  The exclusion is gone, all 242 errors are fixed, and the package builds and
  imports cleanly with 1330 exports. Building it also exposed a module-init cycle
  in `src/httpErrors` (`base → helper → invalidJson → base`) that threw
  `Cannot access 'HttpError' before initialization` on import — that would have
  broken any build of this package.

  **Two defects broke every single request.** `NodeHttpAdapter.writeNodeResponse`
  recursed into itself (stack overflow → unhandled rejection → process exit), and
  `DefaultResponseWriter` called `flushHeaders()` before `writeHead()`, throwing
  `ERR_HTTP_HEADERS_SENT` so the client saw **200 for every status**. Both are
  fixed and proven end to end against a real listening server. Anything that
  adapted to "always 200, no body" will now see real status codes and automatic
  `Content-Type`/`Content-Length` (and no `Content-Length` on 204/304).

  **Client-IP trust was broken in three places**, each taking the
  attacker-controlled leftmost `X-Forwarded-For` entry: `getRequestIP` had no trust
  configuration, the Node adapter's `getNodeRemoteAddress` checked only
  `typeof trustProxy === "object"` and never compared the peer (while importing
  `isTrustedProxy` and never calling it), and `getClientIp` never seeded
  `socket.remoteAddress`. Every rate limiter and audit log built on this was
  spoofable with one header. **Any such system will now see different — correct —
  IPs.** `getRequestProtocol`/`getRequestHostname`/`getRequestPort` likewise return
  the un-forwarded default unless the peer is a trusted proxy, and
  `compileTrustProxy` now throws on a value that is not a preset, IP or CIDR
  instead of compiling a predicate that silently never matched. The old loopback
  check was `startsWith("127.")`/`startsWith("::1")`, which matched `::10` and
  `::1a` as loopback and could not do CIDR at all.

  **CORS was unreachable.** The whole `httpCors` module was dead while the wired
  middleware set `Access-Control-Allow-Origin: *` unconditionally with no
  `Vary: Origin`. The real module is now wired, matches origins exactly rather
  than by prefix, and `createCorsPolicy({ origin: [..., "*"], credentials: true })`
  throws instead of reflecting every origin with credentials. `CorsPolicy` gains
  required `wildcard`, `preflightContinue` and `optionsSuccessStatus` fields.

  **Open redirect and SSRF.** `isSafeRedirectProtocol` returned `true` for
  `javascript:` and `data:` and had no call sites; `createRedirect` and
  `createLocationHeader` now throw on those, on `//evil.com`, and on other unsafe
  destinations. `resolveProxyTarget`/`createProxyRequest`/`normalizeProxyOptions`
  now throw for loopback, private, link-local, cloud-metadata and non-http(s)
  targets — **a proxy legitimately pointing at an internal service must pass
  `allowPrivateTargets: true` or `allowedHosts`.** Hop-by-hop headers are stripped,
  and an unverified `X-Forwarded-For` chain is dropped when no `clientIp` is given.

  **Four independent response-splitting sinks.** `httpContentDisposition`,
  `httpContentType`, `httpConditional` and `httpMethods` each had their own escaper
  handling `\` and `"` but not CR, LF or NUL — while `httpHeaders/security/`, built
  to prevent exactly this, had zero consumers. It is now the single hardened
  escaper (full C0/DEL class, token validator, control-rejecting quoted strings)
  and all four sinks plus `HTTPHeaders.set/append` route through it, throwing
  `TypeError` on control characters. CSP directive values containing `;`, `,`, CR,
  LF or a control character now throw too.

  **The unsafe parser was the wired one, everywhere.** The package shipped two
  query parsers, three multipart parsers, three content-negotiation
  implementations and three Content-Disposition parsers — and in every case the
  copy with limits and guarded property access was the one _not_ on the request
  path. `parseQuery` (what `getQuery(request)` calls) had no limits and polluted
  `Object.prototype`; `parseQueryString`, which enforced four limits correctly, was
  called by nothing. The hardened implementations are now the live ones and the
  dead twins are deleted, including 14 of 15 `httpNegotiation` files, four
  `httpHeaders` subtrees, and five `.original.ts` router twins.

  **Request parsing now enforces its limits.** `parseQuery`/`parseQueryString`
  throw `HTTPQueryLimitError` (414) past 1000 params / depth 10 / 4096-char name /
  16384-char value / 1 MiB total, and return **null-prototype** objects (as do
  `queryToObject`, `readForm`, multipart fields and `CookieCollection.toObject()`).
  `readBody` and multipart reads reject a body shorter than its declared
  `Content-Length`, and conflicting duplicate `Content-Length`, or `Content-Length`
  with `Transfer-Encoding`, now throw. Multipart bodies missing a closing delimiter
  are rejected rather than parsed as far as they go, and part bodies are no longer
  truncated by two bytes when content ends in CRLF — **stored file bytes and `size`
  change for any such upload; they are now correct.** `sanitizeFilename` returns
  `upload-<uuid>` for a name reducing to nothing, `.` or `..`, capped at 255 bytes.
  `readStream`/`readStreamAsString`/`consumeStream` cap at 1 MiB by default.

  **Route params no longer smuggle traversal.** Params were decoded _after_
  matching, so `%2e%2e%2f` reached handlers as `../`. A param or wildcard tail that
  decodes to a path separator, NUL, or `.`/`..` no longer matches — those requests
  404 rather than reaching a handler. Static-file serving does real root
  containment. Non-strict patterns now tolerate one trailing slash; pass
  `{ strict: true }` for exact matching.

  **Declared-but-never-wired capabilities, roughly 30 of them**, are each now
  wired or removed. Removed as no-ops: `SecurityHeadersOptions.xXssProtection` and
  `.expectCt`, `HTTPSecurityConfig.trustedProxyCount`/`.requestTimeout`/
  `.headersTimeout`/`.keepAliveTimeout`, `RouteTreeOptions.caseSensitive`/`.strict`
  (the live `RouteMatcher` implements both properly), the three
  `middlewareTo*Interceptor` converters (their `next()` ran nothing), `sameSite`
  (renamed `sameHostname`), `createFinishHandler`/`createAbortHandler`, and
  `NegotiationOptions`. Now enforced: `HttpMiddlewarePipeline` honours
  `priority`/`enabled`, aborts the chain when a middleware throws, and rejects a
  double `next()`; `HttpInterceptorManager` enforces `maxInterceptors`,
  `allowDuplicateNames` and `strictPhase`; `highWaterMark` moved to
  `HTTPStreamFactoryOptions` where it is actually used.

  **Server hardening.** `createNodeHttpAdapter` defaults to
  `headersTimeout: 10000`, `requestTimeout: 30000`, `keepAliveTimeout: 5000`
  (slowloris) — **long-poll and streaming endpoints must raise `requestTimeout`
  explicitly.** `adapter.stop()` closes idle keep-alive connections immediately and
  destroys the rest after `shutdownGraceMs`. `createSecurityMiddleware()` with no
  arguments now emits `nosniff`, `X-Frame-Options: DENY` and a Referrer-Policy
  instead of nothing (`useDefaults: false` restores the old no-op).
  `createRecommendedSecurityHeaders()` emits the full set including CSP and HSTS.
  `HttpClient` no longer follows a redirect to a non-http(s) scheme and drops
  `Authorization` across origins.

  **Strictness restored.** `strictNullChecks`, `noUncheckedIndexedAccess` and
  `strictPropertyInitialization` were disabled in this package alone; they are now
  inherited from the base config, and the 93 resulting errors are fixed with real
  guards rather than assertions (81 guards and restructures, one commented cast, no
  `!`, no `any`, no ts-comments). That flip exposed two live bugs:
  `NodeHTTPRequest.aborted` was never assigned despite being required by the
  `HTTPRequest` contract, so **every `if (request.aborted)` client-disconnect
  bail-out was a dead branch**; and `mergeResponseContext` called `.join()` on a
  header value permitted to be `undefined`, throwing a `TypeError` that killed the
  merge.

  **Other breaking API changes:** `HTTPHeaders.toNodeHeaders()` returns
  `Record<string, string | string[]>`; `get("set-cookie")` returns the first value
  (use `getSetCookie()`/`getAll()`). Signed cookies use HMAC-SHA256 and
  `generateETag` uses SHA-256/128 — **existing signatures and ETags are invalidated;
  treat as a key rotation and expect one revalidation round.** `serializeCookie`
  enforces `__Host-`/`__Secure-` prefix rules, including on `deleteResponseCookie`.
  `isHTTPMethod`/`isSafeMethod`/`isIdempotentMethod`/`isKnownMIMEType` and the
  `httpStatus` range predicates no longer narrow their argument — use
  `toHTTPMethod`/`toKnownMIMEType`. `ConditionalResult` gains a required
  `rangeApplicable`. `setForwardedHeaders` takes a `ProxyClientContext`.
  `readJSON()` requires its options argument. `shouldCompress` is an allowlist, so
  `application/pdf`, `font/woff2` and `application/octet-stream` are no longer
  compressed.

  Test coverage went from 94 to 410, with adversarial tests for each security fix:
  spoofed forwarded chains, `evil-example.com.attacker.com` against the origin
  matcher, `javascript:` and `//evil.com` redirect targets, `http://169.254.169.254/`,
  CR/LF/NUL through every header sink, `%2e%2e%2f` route params, static-file
  traversal, slowloris partial requests, and cross-origin redirects dropping
  `Authorization`.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/security@0.2.0

## 0.0.6

### Patch Changes

- [`7d96ecb`](https://github.com/oyinlola-tech/zudo/commit/7d96ecb3bd1dbe83fdf4c3d9646e6b32770f7dd9) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add HTTP QUERY method support to @zudojs/http

## 0.0.5

### Patch Changes

- [`05f9a40`](https://github.com/oyinlola-tech/zudo/commit/05f9a406a0d256f3320d2f7bfce80fea4f1f8dee) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add HTTP QUERY method support to @zudojs/http

## 0.0.4

### Patch Changes

- [`6bec11b`](https://github.com/oyinlola-tech/zudo/commit/6bec11bcd56041d3590d5fea932d4ea99ad1861d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add HTTP QUERY method support to @zudojs/http

## 0.0.3

### Patch Changes

- [`641c4c5`](https://github.com/oyinlola-tech/zudo/commit/641c4c5f9616d73e150b1598ae1b4abf05de23e4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add HTTP QUERY method support to @zudojs/http

## 0.0.2

### Patch Changes

- [`8d91db6`](https://github.com/oyinlola-tech/zudo/commit/8d91db68f93219803db971f2f855ec55af6c8dbf) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add HTTP QUERY method support to @zudojs/http

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/core@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/logger@1.0.0
  - @zudojs/security@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/core@0.1.3
  - @zudojs/errors@0.1.2
  - @zudojs/logger@0.1.2
  - @zudojs/security@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/core@0.1.2
  - @zudojs/errors@0.1.1
  - @zudojs/logger@0.1.1
  - @zudojs/security@0.1.1
