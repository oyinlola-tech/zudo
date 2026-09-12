# @zudojs/tenancy

Multi-tenant context and isolation: tenant resolution, context propagation, resolver chains, and guard middleware.

## Installation

```bash
npm install @zudojs/tenancy
```

## Quick Start

```typescript
import {
  createJwtResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
} from "@zudojs/tenancy";

const storage = createTenantContextStorage();
const repository = createMemoryTenantRepository();

const resolver = createResolverChain([
  createJwtResolver(), // priority 100, trusted
  createSubdomainResolver({ baseDomain: "example.com" }), // priority 70
]);

// Resolves the tenant, enforces its status and the route's trust floor,
// then runs the rest of the request inside the tenant context.
const middleware = createResolveTenantMiddleware({
  resolver: resolver.asResolver(),
  repository,
  storage,
  minimumTrust: "verified",
});
```

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

`x-tenant-id` is untrusted by default. Raise it with
`createHeaderResolver({ trust: "verified" })` only where a trusted proxy
strips and re-sets the header at the edge.

## Features

- Tenant resolution from JWT claims, subdomain, custom domain, header, or path
- Resolver chains with trust grading and conflict detection
- AsyncLocalStorage context propagation
- Tenant repository with slug and custom-domain indexes
- Guard middleware and key scoping helpers

## Safety Notes

- A resolver that **throws** rejected a credential, and aborts the chain. Only
  returning `undefined` means "found nothing" and advances to the next
  resolver — so a failed JWT verification can never fall through to a
  client-supplied header.
- Resolvers disagreeing about the tenant throws by default.
- Tenant ids are normalized (NFKC, trimmed, lowercased) and constrained to
  `^[a-z0-9][a-z0-9_-]*$`, so an id cannot forge a separator in a cache key,
  a schema name, or a path. `tenantKey` escapes its segments as well.
- Non-active tenants are refused during resolution. Pass `allowInactive` on
  routes that exist to serve suspended tenants.
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
