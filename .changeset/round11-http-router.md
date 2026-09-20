---
"@zudojs/http": minor
---

Router, content negotiation and cache-control fixes.

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
