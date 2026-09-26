# @zudojs/tenancy

Multi-tenant context and isolation: tenant resolution, context propagation, resolver chains, and guard middleware.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-tenancy](https://zudojs.oyinlola.site/docs/packages-tenancy) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-tenancy.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/tenancy
```

## Quick Start

```typescript
import {
  createDomainResolver,
  createJwtResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantId,
} from "@zudojs/tenancy";

const storage = createTenantContextStorage();
const repository = createMemoryTenantRepository();
repository.add(
  { id: createTenantId("t-1001"), name: "Acme", slug: "acme", status: "active", metadata: {} },
  ["acme.io"], // custom domain
);

const resolver = createResolverChain([
  createJwtResolver(), // priority 100, trusted
  createDomainResolver({ repository }), // priority 75: acme.io → t-1001
  createSubdomainResolver({ baseDomain: "example.com" }), // priority 70
]);

// Resolves the tenant, enforces its status and the route's trust floor
// (default "verified"), then runs the rest of the request inside the tenant
// context. acme.example.com reaches t-1001 through its slug.
const middleware = createResolveTenantMiddleware({
  resolver, // a chain as it is, or a single resolver
  repository,
  storage,
});
```

`resolver` takes a chain directly. Before 1.3.1 it took only a single
`TenantResolver`, so a chain had to go through `chain.asResolver()`: passing
the chain itself was a type error, and cast through, every request was
refused, because a chain's `resolve` returns `{ resolution, candidates,
conflict }` rather than a resolution. The middleware now recognises a chain by
its `asResolver` method and adapts it. `resolver.asResolver()` still works.

The chain's context type is inferred from its resolvers — what the JWT,
domain and subdomain resolvers read, which `HttpResolverContext` provides — so
the call needs no type argument and no casts. (Before 1.3 it failed with
TS2322 unless you wrote `createResolverChain<HttpResolverContext>`; that form
still works.)

The middleware runs inside the real `@zudojs/http` pipeline without
depending on it: headers are read through `request.getHeader()` when present,
and otherwise from a plain object or a `Map`, case-insensitively. Its
`HttpMiddleware` type is assignable to `@zudojs/http`'s, so it goes straight
into a route's `middleware` list:

```typescript
router.get("/projects", listProjects, { middleware: [middleware] });
```

`getClaims` reads verified token claims for the JWT resolver (by default they
come from the `tenancy:claims` state key). It may be typed with
`@zudojs/http`'s own `HttpMiddlewareContext`, so a helper your auth layer
already has plugs in without a cast:

```typescript
import type { HttpMiddlewareContext } from "@zudojs/http";
import type { TenantClaims } from "@zudojs/tenancy";

const claimsOf = (context: HttpMiddlewareContext) =>
  context.state.get<TenantClaims>("auth:claims");

createResolveTenantMiddleware({ resolver, repository, storage, getClaims: claimsOf });
```

The option is generic over the context it reads, bounded by this package's
structural mirror, which the real context satisfies. A reader for something
that is not a middleware context, such as a bare request, is still refused.

A refusal — 400, 401, 403, 404 — is a `GuardResponse` (`createGuardResponse`
from `@zudojs/middleware`), which `@zudojs/http` sends with that status. The
helpers `createBadRequest`, `createUnauthorized`, `createForbidden`,
`createNotFound`, `createJsonErrorResponse` and `createJsonResponse` all
return one. They used to return plain `{ status, body, headers }` objects,
which `@zudojs/http` did not treat as a response, so a request carrying only
an `x-tenant-id` header was refused (the handler never ran) but answered
`200` instead of `403`.

Read the current tenant anywhere downstream:

```typescript
import { createContextManager } from "@zudojs/tenancy";

const context = createContextManager({ storage });
const tenant = context.requireCurrentTenant();
```

## Resolution Trust

| Source                | Default trust | Note                        |
| --------------------- | ------------- | --------------------------- |
| `jwt`, `api-key`      | `trusted`     | verified credential         |
| `subdomain`, `domain` | `verified`    | host-derived                |
| `header`, `path`      | `untrusted`   | client-supplied on the wire |

`createResolveTenantMiddleware` requires `verified` trust by default, so a
tenant named only by `x-tenant-id` or a URL path is refused (403) — otherwise
an unauthenticated client picks the tenant its request runs in. Raise the
header with `createHeaderResolver({ trust: "verified" })` only where a trusted
proxy strips and re-sets it at the edge, or pass `minimumTrust: "untrusted"`
explicitly on routes where something else ties the tenant to the principal.

## Features

- Tenant resolution from JWT claims, subdomain (by id or slug), custom domain
  (`createDomainResolver`), header, or path
- Resolver chains with trust grading and conflict detection
- AsyncLocalStorage context propagation
- Tenant repository with slug and custom-domain indexes
- Guard middleware and key scoping helpers

## Safety Notes

- A resolver that **throws** rejected a credential, and aborts the chain. Only
  returning `undefined` means "found nothing" and advances to the next
  resolver — so a failed JWT verification can never fall through to a
  client-supplied header.
- Conflict detection is **opt-in**: by default a chain stops at the first
  resolver that finds a tenant (highest priority wins) and does not look at
  the others. Pass `createResolverChain(resolvers, { detectConflicts: true })`
  to run them all and throw `TenantResolutionConflictError` when they
  disagree; the middleware answers that with 403.
- Tenant ids are normalized (NFKC, trimmed, lowercased) and constrained to
  `^[a-z0-9][a-z0-9_-]*$`, so an id cannot forge a separator in a cache key,
  a schema name, or a path. `tenantKey` escapes its segments as well.
- For `@zudojs/cache`, use `createTenantCacheScope(tenantId, key)` rather than
  `createTenantCacheKey`: the cache refuses `:` inside a key part (that is how
  it stops a raw key from forging a namespace), so `tenant:acme:totals` throws
  `ERR_INVALID_INPUT` there. The scope helper returns
  `{ namespace: "tenant.acme", key: "totals" }`, and the cache's namespace is
  the isolation boundary:
  `await cache.get(scope.key, { namespace: scope.namespace })`.
- Non-active tenants are refused during resolution. Pass `allowInactive` on
  routes that exist to serve suspended tenants.
- Every refusal body is `{ "error": message, "code": ERR_TENANT_* }`, the
  shape `@zudojs/http` uses, so a client can tell `ERR_TENANT_NOT_FOUND` from
  an application 404. The codes are exported as `TENANCY_RESPONSE_CODE`.
- An unknown tenant and a non-active one get the same `404 Tenant not found`,
  and the guard middleware answers `403 Tenant is not available` without the
  id or status, so a caller cannot enumerate tenants or learn which are
  suspended.
- A subdomain or path value is looked up by id first, then by slug
  (`repository.findBySlug`); pass `slugLookup: false` to turn that off.
- A request that resolves to no tenant at all is answered `404`. Pass
  `optional: true` to `createResolveTenantMiddleware` on routes where a tenant
  may be absent; a tenant that _was_ named but is unknown, untrusted or
  suspended is still refused.
- `createPathResolver({ prefix })` only names a tenant for paths under the
  prefix; `/health` never resolves to a tenant called `health`.

## Use Cases

- SaaS multi-tenancy
- Per-tenant data isolation
- Tenant-scoped caching and configuration
