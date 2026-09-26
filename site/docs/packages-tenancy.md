---
title: "@zudojs/tenancy — Multi-Tenant Context & Isolation Documentation"
description: "Complete documentation for @zudojs/tenancy — multi-tenant context propagation, resolver chains, trust levels, and guard middleware for the Zudojs framework."
source: https://zudojs.oyinlola.site/docs/packages-tenancy
---

v1.3.1

# @zudojs/tenancy

Works out which customer a request belongs to, refuses the request when it cannot be sure, and carries that answer through the rest of your code.

TENANCY MULTI-TENANT RESOLUTION ISOLATION SAAS

## OVERVIEW

*Multi-tenancy* means one running copy of your app serves several separate customers. Acme Corp and Globex both log in to the same servers and the same database, but neither may ever see the other's data. Each of those customers is a *tenant*.

That creates one question your code has to answer on every single request: **which tenant is this?** The answer might come from a signed login token, from the hostname (`acme.example.com`), from the URL path (`/acme/orders`), or from a header. Working that out is called *tenant resolution*.

`@zudojs/tenancy` does that resolution, checks the answer is trustworthy, and then makes it available to every function that runs afterwards, so your handlers and repositories do not have to pass a tenant ID down through every call.

Getting the answer wrong is not a crash — it is one customer quietly reading another's invoices. So this package is written to *fail closed*: when anything about the request is ambiguous or unverifiable, it throws or returns an error response instead of guessing.

When you need it

- One deployment serves many customer organizations.
- Rows, cache entries and files must be scoped per customer.
- Customers reach you on their own subdomain or domain.
- Background jobs must run "as" a specific tenant.

When you don't

- Your app serves one organization only.
- You deploy a separate copy of the app per customer — the isolation is already there.
- You only need per-user separation. That is authentication and permissions, not tenancy.

## INSTALLATION

Install the package. It pulls in `@zudojs/errors`, `@zudojs/constants` and `@zudojs/middleware` on its own. It needs Node 24 or newer.

```bash
$ npm install @zudojs/tenancy
```

The HTTP middleware plugs into the `@zudojs/http` pipeline without depending on it: it reads headers through `request.getHeader()`, or from a plain object or `Map`. Install `@zudojs/http` if you want its server; the middleware goes straight into a route's `middleware` list, as shown in [HTTP middleware](#http-middleware).

```bash
$ npm install @zudojs/http
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This is the whole loop in one file: store a tenant, read a tenant ID off a request, load the tenant, then run some code inside its context. No HTTP server needed — the resolver is handed a plain object with a `getHeader` function.

```ts
import {
  createContextManager,
  createHeaderResolver,
  createMemoryTenantRepository,
  createTenantContextStorage,
  createTenantId,
} from "@zudojs/tenancy";

const repository = createMemoryTenantRepository();
repository.add({
  id: createTenantId("acme"),
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  metadata: {},
});

// A resolver reads the tenant id off whatever the request gives it.
// A header is written by the client, so it is "untrusted" (see Trust levels).
const resolver = createHeaderResolver();
const resolution = await resolver.resolve({
  getHeader: (name) => (name === "x-tenant-id" ? "Acme" : undefined),
});
if (!resolution) throw new Error("no tenant on this request");
console.log(resolution);
// { tenantId: "acme", source: "header", trust: "untrusted" }

const tenant = await repository.findById(resolution.tenantId);
if (!tenant) throw new Error("unknown tenant");

const storage = createTenantContextStorage();
const tenants = createContextManager({ storage });

tenants.run(tenant, () => {
  // Anything called from in here can ask for the tenant.
  console.log(tenants.requireCurrentTenant().name);
  // "Acme Corp"
});
```

Two things to notice. The header said `"Acme"` but the resolved ID is `"acme"` — IDs are normalized. And nothing was passed into the callback: `requireCurrentTenant()` found the tenant on its own.

The header keeps the example short, but note the `trust: "untrusted"` in the result. Anyone can send `x-tenant-id: acme`, so on its own it proves nothing about which tenant the caller belongs to. In a real app, take the tenant from a verified token or from the host name (see [Trust levels](#trust-levels)); the HTTP middleware refuses a header-only tenant by default.

## TENANTS AND TENANT IDS

A *tenant* is a record describing one customer organization: an ID, a display name, an optional URL-friendly `slug`, a `status`, and a free-form `metadata` bag for things like the plan they are on.

The `status` matters. It is one of `"provisioning"`, `"active"`, `"inactive"`, `"suspended"`, `"deleting"` or `"deleted"`. Only `"active"` tenants are served; everything else is refused by default.

```ts
import { createTenantId } from "@zudojs/tenancy";
import type { Tenant } from "@zudojs/tenancy";

const acme: Tenant = {
  id: createTenantId("acme"),
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  metadata: { plan: "enterprise" },
};
```

A `TenantId` is not just a string. `createTenantId` normalizes the value (Unicode NFKC, trimmed, lowercased) and then checks it against `^[a-z0-9][a-z0-9_-]*$`, up to 64 characters. Anything else throws `InvalidTenantIdError`.

> **In plain words:** a tenant ID ends up glued into cache keys, log lines, schema names and file paths. If it could contain `:`, `/` or `..`, one tenant could write a key that lands in another tenant's namespace. The rules are narrow on purpose.

Use `tryCreateTenantId` when a bad value simply means "found nothing", and `isValidTenantId` when you only want a yes or no.

```ts
import { tryCreateTenantId, isValidTenantId } from "@zudojs/tenancy";

console.log(tryCreateTenantId(" ACME "));    // "acme"
console.log(tryCreateTenantId("bad id!"));   // undefined
console.log(isValidTenantId("../etc"));    // false
```

**Common mistake:** casting a raw string to `TenantId` to get past the type checker. That skips the validation entirely — always go through `createTenantId` or `tryCreateTenantId`.

## RESOLVING A TENANT

A *resolver* is a small object with one job: look at a request and say which tenant it is for. It returns a `TenantResolution` — the tenant ID, where the ID came from (`source`), and how much that source can be believed (`trust`) — or `undefined` if it found nothing.

Resolvers do not take a framework request object. They take a narrow accessor with just the function they need, so the same resolver works for HTTP requests, queue messages or tests.

| Resolver | Reads | Priority | Trust |
| --- | --- | --- | --- |
| `createJwtResolver()` | `getClaims()` → the `tenant_id` claim | 100 | `trusted` |
| `createHeaderResolver()` | `getHeader("x-tenant-id")` | 80 | `untrusted` |
| `createSubdomainResolver()` | `getHost()` → `acme.example.com` | 70 | `verified` |
| `createPathResolver()` | `getPath()` → `/acme/orders` | 60 | `untrusted` |

Each one is called the same way. Here are all four against fake requests.

```ts
import {
  createHeaderResolver,
  createJwtResolver,
  createPathResolver,
  createSubdomainResolver,
} from "@zudojs/tenancy";

console.log(await createJwtResolver().resolve({
  getClaims: () => ({ tenant_id: "acme" }),
}));
// { tenantId: "acme", source: "jwt", trust: "trusted" }

console.log(await createSubdomainResolver({ baseDomain: "example.com" }).resolve({
  getHost: () => "acme.example.com",
}));
// { tenantId: "acme", source: "subdomain", trust: "verified" }

console.log(await createPathResolver({ prefix: "/api" }).resolve({
  getPath: () => "/api/acme/orders",
}));
// { tenantId: "acme", source: "path", trust: "untrusted" }

console.log(await createHeaderResolver().resolve({
  getHeader: (name) => (name === "x-tenant-id" ? "acme" : undefined),
}));
// { tenantId: "acme", source: "header", trust: "untrusted" }
```

The subdomain resolver refuses `www` (change that with `reserved`), is case-insensitive, and will not turn `a.b.example.com` into a tenant called `a.b` unless you pass `allowMultiLabel: true`.

The JWT resolver does **not** verify the token. It reads claims that something upstream already verified, which is why it is graded `trusted`. If `getClaims()` throws — bad signature, expired token — that throw is meaningful; see the next section.

**Common mistake:** handing a resolver your framework's request object. It only knows about `getHeader`, `getHost`, `getPath` or `getClaims`, and will fail at runtime on anything else. On the HTTP path, `createHttpResolverContext` builds the accessor for you.

## RESOLVER CHAINS

Most apps accept more than one way of naming a tenant. A *chain* holds several resolvers, sorts them by priority (highest first) and asks each in turn.

The chain's context type is inferred from its resolvers: it is the intersection of what they read, so a chain of a JWT and a header resolver needs both `getClaims` and `getHeader`, and TypeScript says so if you leave one out. `chain.resolve(context)` returns a `TenantResolutionResult`: the winning `resolution`, every `candidate` collected, and a `conflict` flag. `chain.asResolver()` hands you the chain packaged as a single resolver. Since 1.3.1 the HTTP middleware accepts the chain itself and does that for you.

```ts
import {
  createHeaderResolver,
  createJwtResolver,
  createResolverChain,
} from "@zudojs/tenancy";

// The chain's context is inferred: it needs getClaims (JWT) and getHeader.
const resolvers = [createJwtResolver(), createHeaderResolver()];

const chain = createResolverChain(resolvers, { detectConflicts: true });

console.log(await chain.resolve({
  getClaims: () => ({ tenant_id: "acme" }),
  getHeader: () => "acme",
}));
// {
//   resolution: { tenantId: "acme", source: "jwt", trust: "trusted" },
//   candidates: [
//     { tenantId: "acme", source: "jwt", trust: "trusted" },
//     { tenantId: "acme", source: "header", trust: "untrusted" }
//   ],
//   conflict: false
// }
```

### What "fail closed" means

A system *fails open* when something goes wrong and it carries on anyway. It *fails closed* when something goes wrong and it stops. For a lock on a door, failing open means the door unlocks in a power cut. For tenancy, failing open means serving somebody else's data.

The chain draws a hard line between two different outcomes from a resolver:

- **Returned `undefined`** — "I found nothing here." The chain moves on to the next resolver.
- **Threw** — "I found a credential and it is bad." The chain stops and raises `TenantResolutionError`.

> **Why the difference is the whole point:** if a failed JWT verification were treated as "found nothing", the chain would fall through to the next resolver — the client-supplied `x-tenant-id` header. A forged token would then let the caller name any tenant they liked. So a throw ends the chain.

```ts
import { TenantResolutionError } from "@zudojs/tenancy";

// Same `resolvers` array as above.
const chain = createResolverChain(resolvers);

try {
  await chain.resolve({
    getClaims: () => { throw new Error("bad signature"); },
    getHeader: () => "victim-tenant",
  });
} catch (error) {
  console.log(error instanceof TenantResolutionError, (error as Error).message);
  // true 'Tenant resolver "jwt" rejected the request'
}
```

### Conflicts

Two sources naming *different* tenants on one request is the signature of an attempted cross-tenant call. Set `detectConflicts: true` to run every resolver and compare, and the chain throws `TenantResolutionConflictError`. Conflict detection is off by default — a chain stops at the first resolver that finds a tenant. With it on, throwing is the default; pass `throwOnConflict: false` only if you have a good reason to let the highest-priority source win silently.

```ts
// Same `resolvers` array as above.
const strict = createResolverChain(resolvers, { detectConflicts: true });

await strict.resolve({
  getClaims: () => ({ tenant_id: "real" }),
  getHeader: () => "attacker",
});
// throws TenantResolutionConflictError:
// "Tenant resolution conflict: jwt:real, header:attacker"
```

**Common mistake:** expecting conflict detection without asking for it. With `detectConflicts` off (the default) the chain stops at the first match, so there is nothing to compare and a conflict can never be seen.

## TRUST LEVELS

Not every way of naming a tenant is equally believable. A tenant ID from a verified token is a fact; a tenant ID typed into a header by whoever sent the request is a suggestion. Every resolution carries one of three *trust levels*.

| Level | Meaning | Default sources |
| --- | --- | --- |
| `trusted` | Came from a credential something already verified. | `jwt`, `api-key`, `manual`, `system` |
| `verified` | Derived from the connection itself, not from request content. | `subdomain`, `domain` |
| `untrusted` | Supplied by the client and forgeable. | `header`, `path`, `custom` |

`x-tenant-id` is `untrusted` by default, because this package cannot know what sits in front of your app. If a proxy you control strips and re-sets that header at the edge, say so explicitly.

```ts
import {
  assertTrustLevel,
  createHeaderResolver,
  getDefaultTrust,
  meetsTrustLevel,
  TenantTrustLevelError,
} from "@zudojs/tenancy";

console.log(getDefaultTrust("header"));                  // "untrusted"
console.log(meetsTrustLevel("verified", "trusted"));    // false

// Only where a trusted proxy owns the header:
const resolver = createHeaderResolver({ trust: "verified" });

try {
  assertTrustLevel("untrusted", "trusted", "header");
} catch (error) {
  console.log(error instanceof TenantTrustLevelError);  // true
}
```

**Common mistake:** raising the header resolver to `verified` because a route stopped working. If a client can still send that header directly, you have just handed it the ability to choose its tenant.

> **A tenant id the client sent is a claim, not a fact.** `x-tenant-id`, a `/t/:tenant` path segment, a query parameter or a body field are all chosen by whoever sends the request, so a logged-in user of tenant A can put tenant B there. Trust is about *where the id came from*, not whether it looks valid or exists in your repository. Keep such sources `untrusted` and let `minimumTrust` (default `"verified"`) refuse them. If you do accept one, for example on an admin route, also check that the authenticated user is a member of that tenant before serving anything.

## TENANT CONTEXT

Once the tenant is known, every function underneath needs it. Passing it through every call is noisy and easy to forget. Instead the tenant is put into *context*: a value stored for the duration of one operation, which any code running inside that operation can read.

It is built on Node's `AsyncLocalStorage`, so the value survives `await`, callbacks and promise chains without you threading it anywhere.

`createTenantContextStorage()` is the store. `createContextManager({ storage })` is the friendly API on top of it.

```ts
import {
  createContextManager,
  createTenantContextStorage,
  createTenantId,
} from "@zudojs/tenancy";
import type { Tenant } from "@zudojs/tenancy";

const storage = createTenantContextStorage();
const tenants = createContextManager({ storage });

const acme: Tenant = {
  id: createTenantId("acme"),
  name: "Acme Corp",
  status: "active",
  metadata: {},
};

async function loadOrders(): Promise<string> {
  // No tenant argument — it reads the surrounding context.
  const tenant = tenants.requireCurrentTenant();
  return `orders for ${tenant.id}`;
}

await tenants.run(acme, async () => {
  console.log(await loadOrders());  // "orders for acme"
});

console.log(tenants.getCurrentTenant());  // undefined — outside the run
```

`run` refuses a tenant whose status is not `"active"`, throwing `TenantUnavailableError`. That check is here, not only in HTTP middleware, because background jobs and scripts never pass through HTTP. Pass `allowInactive: true` to the manager when a job exists precisely to handle suspended tenants.

```ts
// A billing job that must still run for suspended tenants.
const billing = createContextManager({ storage, allowInactive: true });
```

For work that belongs to no tenant — migrations, a health check, a cross-tenant report — use `runSystem`. Inside it `getCurrentTenant()` is `undefined` and `isSystemMode()` is `true`.

```ts
tenants.runSystem(() => {
  console.log(tenants.isSystemMode());       // true
  console.log(tenants.getCurrentTenant());  // undefined
});
```

> **Watch out:** `requireCurrentTenant()` throws `TenantContextMissingError` when there is no tenant. That is the safe outcome. Catching it and falling back to a "default tenant" turns a fail-closed design into a fail-open one.

**Common mistake:** creating a second `createTenantContextStorage()` for one part of the app. Two stores do not see each other's contexts. Create one and share it — or use `getDefaultStorage()`, which returns a shared instance.

## STORING TENANTS

A resolver gives you an ID. Something has to turn that ID into the full tenant record. That something is a *repository* — an object with `findById`, and optionally `findBySlug` and `findByDomain`.

`createMemoryTenantRepository()` ships in the box. It keeps tenants in a `Map`, so it is right for tests and small apps; for production you implement `TenantRepository` against your database.

```ts
import {
  createMemoryTenantRepository,
  createTenantId,
} from "@zudojs/tenancy";

const repository = createMemoryTenantRepository();

repository.add({
  id: createTenantId("acme"),
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  metadata: {},
}, ["acme.io", "www.acme.io"]);

console.log((await repository.findBySlug("acme"))?.name);        // "Acme Corp"
console.log((await repository.findByDomain("ACME.io"))?.name);    // "Acme Corp"
console.log(repository.domainsOf(createTenantId("acme")));
// [ "acme.io", "www.acme.io" ]
```

The second argument to `add` registers custom domains. Calling `add` again for the same tenant rebuilds its slug and domain indexes, so an old slug stops resolving instead of quietly serving the record from before the update. The resolve middleware looks a subdomain or path value up by id, then by slug (`slugLookup`, default `true`).

### Tenant manager

`createTenantManager` wraps a repository with an optional cache and a few assertions. Cached records expire after `cacheTtlMs` (30 seconds by default), which bounds how long a tenant you just suspended keeps being served. Set it to `0` to turn caching off, and call `invalidate(id)` right after any write that changes a status.

```ts
import {
  createMemoryTenantRepository,
  createTenantContextStorage,
  createTenantId,
  createTenantManager,
} from "@zudojs/tenancy";

const repository = createMemoryTenantRepository();
repository.add({
  id: createTenantId("acme"),
  name: "Acme Corp",
  status: "active",
  metadata: {},
});

const manager = createTenantManager({
  repository,
  storage: createTenantContextStorage(),
  cacheTtlMs: 30_000,
});

const tenant = await manager.requireActive(createTenantId("acme"));
console.log(tenant.name);  // "Acme Corp"

// After suspending a tenant in your database:
await manager.invalidate(createTenantId("acme"));
```

**Common mistake:** caching tenants forever. A suspended customer keeps being served until the entry expires, so keep the TTL short and invalidate on write.

## HTTP MIDDLEWARE

*Middleware* is a function that runs before your route handler and can either pass the request on or answer it itself. `createResolveTenantMiddleware` is the one that turns a request into a tenant context.

On every request it does five things in order, and stops at the first that fails:

- 1. Builds a resolver accessor from the request and runs your resolver. No resolution → `404`.
- 2. Checks the resolution's trust against `minimumTrust` (default `"verified"`). Too low → `403`.
- 3. Loads the tenant from the repository. Not found → `404`, with the same body as step 1, so the route cannot be used to probe which tenants exist.
- 4. Refuses a non-active tenant with the same `404` as an unknown one, unless `allowInactive` is set.
- 5. Puts the tenant in request state and runs the rest of the request inside the tenant context.

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import {
  createJwtResolver,
  createMemoryTenantRepository,
  createRequireTenantMiddleware,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantId,
  TENANT_STATE_KEY,
} from "@zudojs/tenancy";
import type { Tenant } from "@zudojs/tenancy";

export const storage = createTenantContextStorage();

const repository = createMemoryTenantRepository();
repository.add({
  id: createTenantId("acme"),
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  metadata: {},
});

// The chain's context is inferred from its resolvers: JWT claims and the host.
const chain = createResolverChain([
  createJwtResolver(),
  createSubdomainResolver({ baseDomain: "example.com" }),
]);

export const resolveTenant = createResolveTenantMiddleware({
  resolver: chain, // a chain is accepted as it is (since 1.3.1)
  repository,
  storage,
  minimumTrust: "verified",
});

// Run after resolveTenant. Answers 401 when no tenant was established.
export const requireTenant = createRequireTenantMiddleware();

const router = createRouter();
router.get("/orders", (ctx) => {
  const tenant = ctx.state.get(TENANT_STATE_KEY) as Tenant;
  return { tenant: tenant.name };
}, { middleware: [resolveTenant, requireTenant] });

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();

// GET /orders, Host: acme.example.com   → 200 {"tenant":"Acme Corp"}
// GET /orders, Host: nobody.example.com → 404 {"error":"Tenant not found"}
// GET /orders, Host: localhost          → 404 {"error":"Tenant not found"}
```

Register `resolveTenant` before `requireTenant`, and both before your routes. By default (`minimumTrust: "verified"`) a tenant named only by an untrusted header or a URL path is refused with `403`; pass `minimumTrust: "untrusted"` to opt down.

The refusals are real HTTP responses. Every tenancy middleware answers with a *guard response* built by `createGuardResponse` from [@zudojs/middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md), which `@zudojs/http` sends with its status, headers and JSON body. Tested against a real server: an unknown host answered `404`, a header-only tenant (with a header resolver in the chain) `403`, and `requireTenant` with no tenant `401`, each as `application/json`.

> **Changed in 1.3.0:** two workarounds are no longer needed. Up to 1.2.x the refusals were plain `{ status, body, headers }` objects that `@zudojs/http` ignored, so a refused request came back as `200` with an empty body, and the fix was a wrapper that turned the object into a response. The middleware also needed `as never` to fit a route's `middleware` list, and `createResolverChain([createJwtResolver(), createSubdomainResolver(…)])` failed with `TS2322` unless you wrote `<HttpResolverContext>`. Remove the wrapper, the casts and the type argument when you upgrade; an explicit type argument still compiles.

> **Changed in 1.3.1:** `resolver` accepts a chain from `createResolverChain` as it is. Up to 1.3.0 you had to pass `chain.asResolver()`: the chain itself was a type error, and if cast through, every request was refused, because a chain's `resolve` returns `{ resolution, candidates, conflict }`, which carries no `trust`. A chain is now recognised by its `asResolver` method and adapted; `.asResolver()` still works. The accepted union is exported as `TenantResolverSource`. `getClaims` (here and on `createHttpResolverContext`) is now generic over the middleware context it reads, so a helper typed with `@zudojs/http`'s `HttpMiddlewareContext` no longer needs a cast; its type is exported as `TenantClaimsReader`. A reader for something that is not a middleware context is still a type error. Tested against a real server: `Host: acme.example.com` answered `200 {"tenant":"Acme Corp"}` with `resolver: chain`, and claims read by a typed `readClaims` helper resolved the same tenant.

### Where JWT claims come from

The middleware does not verify tokens. It reads already-verified claims from request state under the key `TENANT_CLAIMS_STATE_KEY` (`"tenancy:claims"`). Your authentication middleware publishes them there, or you supply a `getClaims` function.

```ts
import type { HttpMiddlewareContext } from "@zudojs/http";
import { TENANT_CLAIMS_STATE_KEY, type TenantClaims } from "@zudojs/tenancy";

// In your auth middleware, after the signature has been verified:
context.state.set(TENANT_CLAIMS_STATE_KEY, { tenant_id: "acme" });

// Or tell the tenancy middleware where to look instead. A helper typed with
// @zudojs/http's own context is accepted without a cast (since 1.3.1).
const readClaims = (ctx: HttpMiddlewareContext) => ctx.state.get<TenantClaims>("auth:claims");

createResolveTenantMiddleware({
  resolver: chain,
  repository,
  storage,
  getClaims: readClaims,
});
```

Downstream, read the tenant out of state with `TENANT_STATE_KEY` and the resolution details with `TENANT_CONTEXT_STATE_KEY`. `createTenantGuardMiddleware` re-checks the status, and `createTenantPropagationMiddleware` restores the context from state when a later stage needs it.

**Common mistake:** installing `requireTenant` without `resolveTenant`. Nothing ever puts a tenant in state, so every request gets a `401`.

## KEY ISOLATION

Knowing the tenant is only half the job. The other half is making sure the things you store under that tenant cannot be reached by another one. Two helpers build keys that stay apart.

```ts
import {
  createTenantCacheKey,
  createTenantId,
  tenantKey,
} from "@zudojs/tenancy";

const acme = createTenantId("acme");

console.log(createTenantCacheKey(acme, "settings"));
// "tenant:acme:settings"

console.log(tenantKey(acme, "orders:42"));
// "tenant:acme:orders\:42"  — the inner ":" is escaped
```

That escaping is the point. Tenant IDs are already restricted, but the second argument is not: without escaping, key `"cache:k"` under tenant `a` would produce the same string as key `"k"` under a tenant called `a:cache`.

For caching, pass the tenant as the namespace rather than building keys by hand — see [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md), whose `namespace` option and `createKeyBuilder` keep one tenant's entries out of another's.

For rows you have already loaded, `assertTenantOwnership` is the last line of defence: it throws `TenantIsolationError` when a record does not belong to the tenant you expect.

```ts
import { assertTenantOwnership, createTenantId } from "@zudojs/tenancy";

const order = { tenantId: createTenantId("globex"), total: 99 };

assertTenantOwnership(order, createTenantId("acme"));
// throws TenantIsolationError:
// 'Tenant isolation violation: expected "acme", got "globex"'
```

> **Tip:** put the tenant filter in the query *and* assert ownership on the result. The filter is the protection; the assertion is what tells you the day the filter goes missing.

## API REFERENCE

### Identity

| Name | What it does | Notes |
| --- | --- | --- |
| `createTenantId(value)` | Normalizes and validates a string into a `TenantId`. | Throws `InvalidTenantIdError`. |
| `tryCreateTenantId(value)` | Same, but returns `undefined` instead of throwing. | What the resolvers use. |
| `isValidTenantId(value)` | Type guard for a well-formed ID. | Narrows to `TenantId`. |
| `MAX_TENANT_ID_LENGTH` / `TENANT_ID_PATTERN` | Longest accepted ID / allowed characters. | `64` / `[a-z0-9][a-z0-9_-]*`; both re-exported from `@zudojs/constants`, whose `createTenantId` applies the same rule. |

### Resolution

| Name | What it does | Notes |
| --- | --- | --- |
| `createJwtResolver({ claimKey?, priority? })` | Reads the tenant from verified token claims. | Claim `tenant_id`, priority 100, trust `trusted`. |
| `createSubdomainResolver({ baseDomain?, reserved?, allowMultiLabel?, priority? })` | Reads the tenant from the host. | Priority 70, trust `verified`. `www` reserved. |
| `createHeaderResolver({ headerName?, trust?, priority? })` | Reads the tenant from a header. | `x-tenant-id`, priority 80, trust `untrusted`. |
| `createPathResolver({ prefix?, priority? })` | Reads the tenant from the first path segment after `prefix`; paths outside the prefix resolve to nothing. | Priority 60, trust `untrusted`. |
| `createDomainResolver({ registry?, repository?, priority? })` | Maps the host to a tenant through a registered custom domain. | Priority 75, trust `verified`. |
| `createResolverChain(resolvers, options?)` | Runs resolvers in priority order. | Returns `resolve`, `resolveTenant`, `asResolver`. The context is inferred as the intersection of what the resolvers read (`ResolverChainContext`); an explicit type argument also works. |

### Context

| Name | What it does | Notes |
| --- | --- | --- |
| `createTenantContextStorage()` | An `AsyncLocalStorage`-backed store. | Create one and share it. |
| `getDefaultStorage()` / `resetDefaultStorage()` | Shared instance / clear it. | Reset is for tests. |
| `createContextManager({ storage, allowInactive? })` | Read and enter tenant contexts. | `run`, `runAs`, `runSystem`, `getCurrent`, `getCurrentTenant`, `requireCurrentTenant`, `isSystemMode`. |

### Storage

| Name | What it does | Notes |
| --- | --- | --- |
| `createMemoryTenantRepository()` | In-process repository. | `findById`, `findBySlug`, `findByDomain`, `add`, `remove`, `all`, `domainsOf`. |
| `createDomainRegistry()` | Maps custom domains to tenant IDs. | `register`, `unregister`, `resolve`, `all`. |
| `createTenantManager({ repository, storage, cache?, cacheTtlMs? })` | Repository plus cache and assertions. | `get`, `require`, `requireActive`, `assertActive`, `resolve`, `getCurrent`, `invalidate`. |
| `DEFAULT_TENANT_CACHE_TTL_MS` | Default cache lifetime. | `30_000`. |

### Security

| Name | What it does | Notes |
| --- | --- | --- |
| `getDefaultTrust(source)` | Trust level a source carries by default. | See the trust table above. |
| `meetsTrustLevel(actual, required)` | Boolean comparison of two levels. | Used by the resolve middleware. |
| `assertTrustLevel(actual, required, source)` | Throws `TenantTrustLevelError` when too low. | For your own checks. |
| `assertTenantUsable(tenant)` | Throws `TenantUnavailableError` unless active. | Called by `run`. |
| `assertTenantOwnership(resource, tenantId)` | Throws `TenantIsolationError` on a mismatch. | Resource needs a `tenantId` field. |
| `assertSameTenant(actual, expected)` | Throws `TenantAccessDeniedError` on a mismatch. | For cross-tenant calls. |
| `tenantKey(tenantId, key, separator?)` | Builds an escaped, tenant-scoped key. | Separator defaults to `":"`. |
| `createTenantCacheKey(tenantId, key)` | `tenantKey` with the `":"` separator. | For cache keys. |

### HTTP

| Name | What it does | Notes |
| --- | --- | --- |
| `createResolveTenantMiddleware(options)` | Resolves, checks and enters the tenant context. | Options: `resolver` (a resolver or, since 1.3.1, a chain: `TenantResolverSource`), `repository`, `storage`, `minimumTrust` (default `"verified"`), `slugLookup` (default `true`), `allowInactive`, `getClaims` (a `TenantClaimsReader`, generic over the middleware context), `notFoundResponse`, `optional` (lets a request that resolves to no tenant continue without one; default `false` → 404). |
| `createRequireTenantMiddleware({ requirement?, deniedResponse? })` | Enforces tenant presence. | `"required"` (default), `"optional"`, `"forbidden"`. |
| `createTenantGuardMiddleware({ repository? })` | Re-checks that the tenant in state is active. | Runs after resolve. |
| `createTenantPropagationMiddleware(storage)` | Re-enters the context from request state. | For later pipeline stages. |
| `createHttpResolverContext(context, getClaims?)` | Adapts an HTTP context to the resolver accessor. | The resolve middleware calls it for you. |
| `TENANT_STATE_KEY`, `TENANT_CONTEXT_STATE_KEY`, `TENANT_CLAIMS_STATE_KEY` | State keys for tenant, context and claims. | `"tenancy:tenant"`, `"tenancy:context"`, `"tenancy:claims"`. |
| `createJsonErrorResponse`, `createBadRequest`, `createUnauthorized`, `createForbidden`, `createNotFound` | Frozen JSON error responses. | Guard responses (`isGuardResponse` is `true`), so `@zudojs/http` sends their status. Body is `{ error: message }`. |
| `createJsonResponse(status, body)` | A guard response with any status and JSON body. | For a custom refusal in your own middleware. Added in 1.3.0. |

### Utilities

| Name | What it does | Notes |
| --- | --- | --- |
| `isTenantActive(tenant)` | Whether the status is `"active"`. | Does not throw. |
| `sameTenant(a, b)` | Compares two tenant IDs. | Does not throw. |
| `summarizeTenant(tenant)` | One-line string for logs. | `Tenant(acme, Acme Corp, active)`. |
| `summarizeContext(ctx)` | One-line string for logs. | Includes source and trust. |

### Errors

All extend `TenantError`, which extends `AuthorizationError` from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md).

| Name | Thrown when | Notes |
| --- | --- | --- |
| `InvalidTenantIdError` | A string is not a valid tenant ID. | From `createTenantId`. |
| `TenantNotFoundError` | The repository has no such tenant. | From `manager.require`. |
| `TenantContextMissingError` | Tenant context is needed and absent. | From `requireCurrentTenant`. |
| `TenantResolutionError` | A resolver rejected a credential. | Names the resolver; carries the cause. |
| `TenantResolutionConflictError` | Sources named different tenants. | Lists `source:id` candidates. |
| `TenantUnavailableError` | The tenant is not active. | Carries the status. |
| `TenantTrustLevelError` | The resolution is not trusted enough. | Carries source, required, actual. |
| `TenantAccessDeniedError` | A caller reached across tenants. | From `assertSameTenant`. |
| `TenantIsolationError` | A record belongs to another tenant. | From `assertTenantOwnership`. |
| `TenantAlreadyExistsError` | A tenant identifier is taken. | For your provisioning code. |
| `TenantProvisioningError` | Setting a tenant up failed. | For your provisioning code. |

> **Not implemented yet:** the types `TenantProvisioner`, `TenantConfigurationProvider`, `TenantIsolationConfig` and `TenantIsolationStrategy` are exported as interfaces only. The package ships no implementation of them — write your own or leave them alone.

## COMMON MISTAKES

- **Trusting `x-tenant-id`.** Any client can send that header. If you accept it, a caller picks its own tenant. *Fix:* leave its trust at `untrusted`; the resolve middleware's default `minimumTrust: "verified"` refuses it. Raise its trust only if a proxy you control rewrites the header at the edge.
- **Swallowing a resolver's throw.** Wrapping `getClaims` in your own `try/catch` that returns `undefined` turns "this credential is forged" into "found nothing", and the chain falls through to a weaker source. *Fix:* let it throw.
- **Using two context storages.** Middleware writes to one, your service reads the other, and `requireCurrentTenant()` throws on every request. *Fix:* create the storage once and pass the same instance everywhere.
- **Reading the tenant after the callback ends.** Context only exists inside `run`. A promise started inside and awaited outside sees nothing. *Fix:* `await` the work inside the callback.
- **Building keys by concatenation.** `\`${tenantId}:${key}\`` lets a crafted key cross into another namespace. *Fix:* use `tenantKey` or `createTenantCacheKey`, which escape the segments.
- **Forgetting background jobs.** HTTP middleware never runs for a queue worker or a cron script. *Fix:* wrap the job body in `contextManager.run(tenant, callback)`, which applies the same active-status check.

## RELATED PACKAGES

- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — pass the tenant as a cache `namespace` so one tenant's entries can never be read under another's key.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the server the tenancy middleware plugs into. Not a dependency; the middleware plugs in structurally.
- [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md) — verifies the token whose claims the JWT resolver reads.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `AuthorizationError` base and the error codes these errors carry.
- [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md) — decides what a user may do *within* the tenant that tenancy established.

## COMPLETE EXPORT INDEX

Every name `@zudojs/tenancy` exports from its package root at v1.4.0 — **105** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 105 exports**

Classes (11)

`InvalidTenantIdError` `TenantAccessDeniedError` `TenantAlreadyExistsError` `TenantContextMissingError` `TenantError` `TenantIsolationError` `TenantNotFoundError` `TenantResolutionConflictError` `TenantResolutionError` `TenantTrustLevelError` `TenantUnavailableError`

Functions (42)

`assertSameTenant` `assertTenantOwnership` `assertTenantUsable` `assertTrustLevel` `createBadRequest` `createContextManager` `createDomainRegistry` `createDomainResolver` `createForbidden` `createHeaderResolver` `createHttpResolverContext` `createJsonErrorResponse` `createJsonResponse` `createJwtResolver` `createMemoryTenantRepository` `createNotFound` `createPathResolver` `createRequireTenantMiddleware` `createResolverChain` `createResolveTenantMiddleware` `createSubdomainResolver` `createTenantCacheKey` `createTenantCacheNamespace` `createTenantCacheScope` `createTenantContextStorage` `createTenantGuardMiddleware` `createTenantId` `createTenantManager` `createTenantPropagationMiddleware` `createUnauthorized` `getDefaultStorage` `getDefaultTrust` `isTenantActive` `isValidTenantId` `meetsTrustLevel` `readRequestHeader` `resetDefaultStorage` `sameTenant` `summarizeContext` `summarizeTenant` `tenantKey` `tryCreateTenantId`

Interfaces (34)

`ContextManagerOptions` `DomainContext` `DomainResolverOptions` `HeaderContext` `HeaderResolverOptions` `HttpResolverContext` `JwtContext` `JwtResolverOptions` `MemoryTenantRepository` `PathContext` `PathResolverOptions` `RequireTenantMiddlewareOptions` `ResolverChainOptions` `ResolveTenantMiddlewareOptions` `SubdomainContext` `SubdomainResolverOptions` `SystemContext` `Tenant` `TenantCache` `TenantCacheScope` `TenantClaims` `TenantContext` `TenantContextStorage` `TenantDomain` `TenantExecutionContext` `TenantGuardMiddlewareOptions` `TenantManagerOptions` `TenantRepository` `TenantResolution` `TenantResolutionResult` `TenantResolver` `TenantResolverChain` `TenantResource` `TenantWithDomains`

Type aliases (10)

`ExecutionTenantContext` `ResolverChainContext` `TenancyResponseCode` `TenantClaimsReader` `TenantId` `TenantRequirement` `TenantResolutionSource` `TenantResolverSource` `TenantStatus` `TenantTrustLevel`

Constants (8)

`DEFAULT_TENANT_CACHE_TTL_MS` `MAX_TENANT_ID_LENGTH` `TENANCY_RESPONSE_CODE` `TENANT_CACHE_PART_PATTERN` `TENANT_CLAIMS_STATE_KEY` `TENANT_CONTEXT_STATE_KEY` `TENANT_ID_PATTERN` `TENANT_STATE_KEY`
