# @zudojs/openapi

## 1.5.0

### Minor Changes

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
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.4.0

### Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one
  where a generated document did not match the contract it described.

  - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled
    part of the frame, not just `payload`. `request.id` is capped at the new
    `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with
    `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured
    alongside `payload` against `limits.maxPayloadBytes`. Previously an
    unbounded `metadata` object reached middleware and handlers as
    `context.metadata` however large it was, and an unbounded `id` was echoed
    verbatim into both the success and the error response. `RPCServer.handle`
    no longer reflects an id that exceeds the limit. Frames that were already
    inside the limits are unaffected; a frame whose `payload` and `metadata`
    together now exceed `maxPayloadBytes` is rejected with
    `RPCInvalidRequestError` where it used to be accepted.

  - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path
    template rather than the source path, so `GET /users/:id` and
    `GET /users/{id}` are recognised as the same route and the second is
    rejected. Both used to register, and generation then silently replaced the
    first with the second: one operation disappeared from the published
    document with `validate()` reporting no errors. `hasRoute`, `setRoute` and
    `removeRoute` accept either spelling for the same route.

  - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer
    emits `additionalProperties: false`. That keyword means "reject the
    payload", while `strip` accepts it and discards the extra key, so a client
    generated from such a document refused requests the service accepts. Only
    `.strict()` emits it now. This also removes a difference between
    `s.object({…})` and `s.object({…}).strip()`, which validate identically but
    used to document differently. **Regenerate any checked-in spec**: objects
    that are not `.strict()` lose their `additionalProperties: false`.

  - **`@zudojs/observability`** — queue-overflow reports from the batch log and
    span processors are rate limited. A stalled exporter used to make every
    subsequent `logger.info()` synchronously allocate an `Error` and re-enter
    the configured `onError` — usually writing to the sink that was already
    failing. The first drop is still reported immediately; after that, at most
    one report per minute, each carrying the running total.

  - **`@zudojs/observability`** — a span attribute named `__proto__` is now
    recorded instead of silently vanishing, on both span attributes and event
    attributes. Storing it by plain assignment invoked the prototype setter,
    which dropped the attribute and replaced the bag's prototype; the injected
    prototype then let unlimited further attributes past the `maxAttributes`
    cap. Inherited names such as `toString` are counted against the cap too.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.3.0

### Minor Changes

- Round 10 fixes.

  - **edge/OPENAPI-01:** string and array schemas without an explicit `.max()` now emit the effective ceiling `@zudojs/schema` enforces at parse time (`maxLength: 255`, `maxItems: 1000`), so clients generated from the document no longer send payloads the server rejects. Behaviour change: generated documents gain these `maxLength` / `maxItems` keywords.
  - **edge/OPENAPI-02 (security):** the documentation page loads exact, pinned viewer versions (`swagger-ui-dist@5.33.0`, `redoc@2.5.4` from cdn.jsdelivr.net) with Subresource Integrity hashes instead of the floating `swagger-ui-dist@5` / `redoc/latest` tags. `toUIResponse` now sends `x-content-type-options: nosniff` and a restrictive `content-security-policy` (scripts only from the asset origin plus the hash of the page's inline bootstrap script; `connect-src` limited to the page origin, spec URL and the document's servers). New opt-in options: `assetIntegrity`, `contentSecurityPolicy` (string or `false`), `connectSources`. New exports: `buildOpenAPIUIContentSecurityPolicy`, `SWAGGER_UI_VERSION`, `REDOC_VERSION`, `OpenAPIUIAssetIntegrity`. Behaviour change: the default asset host moved from unpkg / cdn.redoc.ly to cdn.jsdelivr.net, and a self-hosted `assetsBaseUrl` gets no `integrity` attribute unless `assetIntegrity` is passed.
  - **edge/OPENAPI-03:** `ZUDO_SITE_URL` (the default logo link on the docs page and in `info["x-logo"].href`) is now `https://zudojs.oyinlola.site` instead of `https://zudo.dev`.

  Round 10 phase 2:

  - CONV-02: `OpenAPIError` and `OpenAPIErrorOptions` are re-exported from `@zudojs/errors` (same code, category, 500 / not exposed defaults). `createOpenAPIError`, `isOpenAPIError` and the subclasses are unchanged and now extend the shared class.
  - The schema converter reads `SCHEMA_DEFAULT_MAX_STRING_LENGTH` / `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH` from `@zudojs/constants`; the internal mirror (`openApiConstants.schemaLimits.ts`) is deleted. No output change.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.2.0

### Minor Changes

- - Schema conversion: constraints on `coerce.number()` / `coerce.string()` (`int`, `min`, `max`, `pattern`, …) are now carried into the document instead of a bare `type`; `s.transform(schema, fn)` converts to its source schema instead of `{}`; a `.default(() => value)` factory is invoked and its value emitted rather than the function (which JSON dropped silently); `s.bigint()` converts like `coerce.bigint()`.
  - Schema conversion: object properties with a `default`, or typed `any` / `unknown`, are no longer listed as `required`, matching what the object parser accepts; `.required()` still forces every key on.
  - `OpenAPIManager.removeRoute()` (and hiding a route via `setRoute`) now takes effect on the next `generate()`; previously a route stayed in every later document once one had been generated. `OpenAPIRegistryImpl` gains `removeRoute(method, path)` and `clearRoutes()`.
  - `OpenAPIManager.toUIResponse()` renders a custom `branding` logo in the page header, as documented, instead of always showing the default wordmark.
  - Documentation page: URL guards strip ASCII control characters before reading the scheme, so `java\nscript:` / `java\tscript:` URLs are refused; a `data:` URL that is not `data:image/*` is refused (the assets base is interpolated into `<script src>`).
  - Validator: local `$ref`s are resolved against own properties only (`#/components/schemas/constructor` no longer validates); an operation-level parameter overriding a path-level one is accepted instead of reported as a duplicate; two paths identical apart from template parameter names are reported as an error.
  - YAML serializer: quotes `.inf` / `.nan`, hex / octal / binary integers, `_`-grouped digits, sexagesimal numbers, dates and timestamps, `=` and `<<`, and control characters, all of which a YAML parser turned into non-string values (an `info.version` of `2024-01-01` became a date, an enum value `0x1F` became `31`).

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 1.1.0

### Minor Changes

- [`ff883a7`](https://github.com/oyinlola-tech/zudo/commit/ff883a799aefd7aa2abfc3c3c54bc18dc0b43797) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add branded documentation pages and the `x-logo` extension so the Zudo mark shows up wherever the generated spec is viewed.

  **`OpenAPIManager.toUIResponse({ specUrl })`** returns a ready-to-serve HTML
  page (`{ status, headers, body }`, like `toResponse()`) that renders Swagger UI
  by default or ReDoc with `renderer: "redoc"`. The page carries a Zudo header
  bar with the wordmark, the Zudo favicon, a link to the raw spec and a footer
  credit, themed to match the framework's design system. Assets load from a
  public CDN by default; `assetsBaseUrl` points them at a self-hosted copy.

  ```ts
  app.get("/openapi.json", () => manager.toResponse());
  app.get("/docs", () => manager.toUIResponse({ specUrl: "/openapi.json" }));
  ```

  **`info["x-logo"]` is now typed (`OpenAPILogo`) and set by default.** The
  generated document carries the Zudo mark as a data URI in `info["x-logo"]`, so
  ReDoc, Scalar and other viewers that honour the extension show it without any
  page of ours involved. Pass `branding: false` to the manager to emit no logo,
  or `branding: { url, href, altText }` to use your own; a logo already present
  on `info` is never overwritten.

  **New exports:** `renderOpenAPIUI`, `zudoLogo`, `svgToDataUri`, the
  `ZUDO_*_SVG` / `ZUDO_*_DATA_URI` brand constants, `ZUDO_SITE_URL`, and the
  `OpenAPIUIOptions`, `OpenAPIUIRenderer`, `OpenAPIUIResponse`, `OpenAPILogo`
  types.

  Titles, spec URLs and Swagger options are HTML/JS-escaped before interpolation
  and `javascript:` URLs are rejected, so untrusted `info.title` values cannot
  inject markup into the page.

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
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/schema@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/schema@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/schema@0.1.1
