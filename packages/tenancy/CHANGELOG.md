# @zudojs/tenancy

## 1.1.0

### Minor Changes

- - `createPathResolver({ prefix })` no longer names a tenant for paths outside the prefix. Previously `/health` resolved to a tenant called `health`, and `/admin/...` to whichever tenant was called `admin`.
  - `createResolveTenantMiddleware` accepts `optional: true`, letting a request that resolves to no tenant proceed without one. This makes `createRequireTenantMiddleware({ requirement: "optional" })` reachable; the default remains a `404`, and a tenant that was named but is unknown, untrusted or suspended is still refused.
  - `requireCurrentTenant`, `runAs` (context manager) and `requireActive` (tenant manager) no longer depend on `this`, so they work when destructured off the manager instead of throwing a `TypeError`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/http@1.1.0
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Stop tenant resolution failing open, and make the HTTP adapter usable.

  These are behavioural changes to a security boundary. Requests that previously
  resolved to a tenant may now be refused.

  **A resolver that rejects a credential aborts the chain.** Every resolver ran
  inside `try { … } catch { /* skip */ }`. For a resolver that found nothing,
  skipping is right; for the JWT resolver, a throw means the signature failed to
  verify or the token expired — and the chain went on to the next resolver, which
  is the client-controlled `x-tenant-id` header. A forged JWT therefore let the
  caller name any tenant, labelled `trust: "verified"` with `conflict: false`. A
  throw from any resolver now raises `TenantResolutionError`; returning
  `undefined` remains the way to say "found nothing".

  **Conflicts throw by default.** Two resolvers naming different tenants is the
  signature of an attempted cross-tenant request; it was resolved silently in
  favour of the highest priority. `throwOnConflict` now defaults to true. The
  chain also stops at the first match unless `detectConflicts` is set, which is
  what that previously-unread option now does.

  **The HTTP middleware can drive the shipped resolvers.** It passed the raw
  `HttpMiddlewareContext` to `resolver.resolve()`, while every resolver in the
  package expects a narrow accessor object — so it type-checked (the context
  parameter defaulted to `unknown`) and threw `context.getHeader is not a
function` on the first request. The middleware now builds that accessor.
  `ResolveTenantMiddlewareOptions.resolver` is typed
  `TenantResolver<HttpResolverContext>`, so a mismatch is a compile error. Token
  claims are read from `tenancy:claims` in middleware state, or from a
  `getClaims` option.

  **Trust is enforced, and the header is untrusted by default.**
  `assertTrustLevel` existed and was called by nothing. The resolve middleware
  now takes `minimumTrust` and refuses a resolution below it. `x-tenant-id` is
  graded `untrusted` rather than `verified`, because the value is client-supplied
  unless a trusted proxy overwrites it — pass
  `createHeaderResolver({ trust: "verified" })` where the edge guarantees that.

  **Non-active tenants are refused during resolution,** rather than only by a
  separate guard middleware someone had to remember to install. Pass
  `allowInactive: true` on routes that exist to serve suspended tenants.
  `createContextManager` applies the same rule to background jobs, which is where
  no HTTP guard runs at all.

  **`createTenantId` validates.** It previously rejected only empty and
  whitespace, so a header could produce a tenant id containing `:`, `/` or `..`.
  Ids are now normalized (NFKC, trimmed, lowercased) and constrained to
  `^[a-z0-9][a-z0-9_-]*$` with a 64-character cap, throwing `InvalidTenantIdError`
  rather than a bare `Error`. `tryCreateTenantId` and `isValidTenantId` are the
  non-throwing forms, and resolvers use them so an unusable candidate means
  "found nothing". `tenantKey` escapes its segments, so a key of `"cache:k"` can
  no longer collide with another tenant's namespace.

  **The memory repository indexes domains and drops stale entries.**
  `findByDomain` could never return a tenant: nothing populated the index.
  `add(tenant, domains)` now registers them, and re-adding a tenant re-indexes it,
  so a changed slug no longer leaves the pre-update record — including its
  pre-suspension status — reachable under the old one.

  **Subdomain resolution is case-insensitive,** refuses multi-label subdomains
  unless `allowMultiLabel` is set, and parses the authority rather than splitting
  on `":"`, which mangled bracketed IPv6 hosts.

  **Other corrections.** `assertTrustLevel` raises a new `TenantTrustLevelError`
  carrying the source and both levels in metadata, instead of formatting a
  sentence into `TenantAccessDeniedError`'s tenant-id field. The tenant cache
  takes a `cacheTtlMs` (30s default), bounding how long a suspended tenant keeps
  being served. Both 404 paths in the resolve middleware return the same body, so
  it is no longer a tenant-existence oracle.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/http@0.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`6bec11b`](https://github.com/oyinlola-tech/zudo/commit/6bec11bcd56041d3590d5fea932d4ea99ad1861d)]:
  - @zudojs/http@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`641c4c5`](https://github.com/oyinlola-tech/zudo/commit/641c4c5f9616d73e150b1598ae1b4abf05de23e4)]:
  - @zudojs/http@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`8d91db6`](https://github.com/oyinlola-tech/zudo/commit/8d91db68f93219803db971f2f855ec55af6c8dbf)]:
  - @zudojs/http@0.0.2

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
  - @zudojs/http@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/http@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/http@0.1.1
