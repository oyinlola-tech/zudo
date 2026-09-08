---
"@zudojs/http": minor
---

Make the package buildable, then harden the request path: 166 audit findings, 15 of them critical.

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
