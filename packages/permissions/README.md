# @zudojs/permissions

Generic authorization engine with RBAC, ABAC, resource authorization, wildcards, role hierarchy, policies, and abilities.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-permissions](https://zudojs.oyinlola.site/docs/packages-permissions) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-permissions.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/permissions
```

## Quick Start

```typescript
import {
  createPermissionEngine,
  createPermissionActor,
} from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [
    { name: "reader", permissions: ["post:read"] },
    { name: "editor", permissions: ["post:update"], inherits: ["reader"] },
    { name: "admin", permissions: ["*:*"] },
  ],
});

const actor = createPermissionActor("user_1", { roles: ["editor"] });

await engine.can(actor, "post:update"); // true
await engine.can(actor, "post:read"); // true — inherited from "reader"
await engine.can(actor, "user:delete"); // false
```

`roles` is an array of `RoleDefinition`, and every check takes the **actor**,
not a role name. Malformed configuration is rejected at construction: a grant
like `"post"` (no action) could never match, so it is an error rather than a
silent no-op.

## Permissions

Permissions are `resource:action`. Two wildcard forms are supported, and they
mean the same thing everywhere — in a grant, a deny, a rule, or a policy:

| Pattern          | Matches                                   |
| ---------------- | ----------------------------------------- |
| `post:read`      | exactly that                              |
| `post:*`         | every action on `post`                    |
| `*:read`         | `read` on every resource                  |
| `*:*`            | everything                                |
| `billing.*:read` | `billing:read`, `billing.invoice:read`, … |

A partial wildcard such as `post*:read` is rejected: the matcher has no
meaning for it, so accepting one would register a grant that never matches.

## Denies

`deniedPermissions` is matched with the same rules as grants, so a wildcard
deny works:

```typescript
const restricted = createPermissionActor("user_2", {
  roles: ["admin"],
  deniedPermissions: ["*:delete", "billing.*:read"],
});

await engine.can(restricted, "post:delete"); // false
await engine.can(restricted, "post:read"); // true
```

An explicit deny short-circuits before any rule or policy runs.

## Rules and ABAC

A `PermissionRule` carries an optional **condition**, and the rule applies
only when that condition holds. This is what makes "owners may edit their own
posts" expressible:

```typescript
import { isOwner, tenantIsolation, allOf } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles,
  rules: [
    {
      name: "own-posts",
      effect: "allow",
      resource: "post",
      action: "update",
      condition: isOwner(), // compares resource.ownerId to actor.id
    },
    {
      name: "locked-posts",
      effect: "deny",
      resource: "post",
      action: "update",
      condition: (context) => Boolean((context.resource as Post).locked),
    },
  ],
});

await engine.can(actor, "post:update", { ownerId: "user_1" }); // true
await engine.can(actor, "post:update", { ownerId: "user_9" }); // false
```

Conditions may be async. A condition that cannot be evaluated fails closed,
and what "closed" means depends on the rule's effect:

- an **allow** whose condition throws (or that has a condition but no
  context) does not apply;
- a **deny** whose condition throws **applies**. In the example above,
  `locked-posts` throws when no resource is passed, and the check is denied —
  treating the deny as unmet would let the role's allow win. The error is
  reported through `onError`, and the decision is not cached.

A deny also bears on a wildcard check: `can(actor, "post:*")` is refused by a
deny on `post:delete`, whether it comes from `deniedPermissions`, a deny rule,
or a policy registered for `post:delete`.

**Combining.** The default is `deny-overrides`: any applicable deny wins,
whatever its priority. Pass `algorithm: "priority"` for highest-priority-wins,
where a tie still goes to deny.

Combinators: `allOf`, `anyOf`, `not`, `always`, `never`, `isOwner`,
`tenantIsolation`, `metadataEquals`, `resourceEquals`.

### Request metadata

Conditions read request-scoped facts from `context.metadata`, supplied per
check:

```typescript
import { createContextManager, getDefaultStorage } from "@zudojs/tenancy";

const tenancy = createContextManager({ storage: getDefaultStorage() });

await engine.can(actor, "invoice:read", invoice, {
  // The *verified* tenant — resolved and trust-checked by @zudojs/tenancy.
  // `requireCurrentTenant()` is a method on the context manager; it throws
  // when no tenant context is active, rather than returning undefined.
  metadata: { tenantId: tenancy.requireCurrentTenant().id },
});
```

`tenantIsolation()` compares that value against the resource's tenant, and
denies when either is missing. It is only as good as the value you pass: fill
`tenantId` from a source the client cannot choose (a verified token claim, or
the tenant `@zudojs/tenancy` resolved), **never from a request header** — a
caller would set the header to the resource's tenant and pass.

Enforce it as a **deny** rule, `not(tenantIsolation())`:

```typescript
import { createPermissionEngine, not, tenantIsolation } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "accountant", permissions: ["invoice:read"] }],
  rules: [
    {
      name: "tenant-isolation",
      effect: "deny",
      resource: "invoice",
      action: "*",
      condition: not(tenantIsolation()), // other tenant, or no tenant → deny
    },
  ],
});
```

A conditional **allow** rule with `tenantIsolation()` only adds a way in: a
role that grants `invoice:read` allows the check whatever the condition says,
so that role reads every tenant's invoices. The deny form refuses cross-tenant
access even for roles that hold the permission, and no policy can override it.

## Policies

A policy is a named, prioritised hook that runs alongside the rules. By
default it is an **extra condition on top of RBAC/ABAC**: it can take access
away, never hand it out.

```typescript
const engine = createPermissionEngine({
  roles: [{ name: "staff", permissions: ["task:*"] }],
  policyTimeout: 250,
  policies: [
    {
      name: "business-hours",
      permissions: ["task:*"], // wildcards work here too
      priority: 10, // higher runs first
      cacheable: false, // depends on the clock, so never cache it
      evaluate: () =>
        isBusinessHours()
          ? { allowed: true } // "no objection" — the role still has to grant
          : { allowed: false, reason: "outside_business_hours" },
    },
  ],
});

await engine.can(staff, "task:delete"); // true in hours, false after
await engine.can(guest, "task:delete"); // false: no role grants it
```

> **Warning — a policy's `allowed: true` is not a grant.** Before 1.4 it was:
> an allowing policy granted the permission even to an actor with no roles, so
> the "business-hours" policy above handed `task:delete` to everyone during
> office hours. A policy now only constrains, unless it opts in with
> `effect: "grant"`.

Policies run highest priority first and stop at the first denial. A policy
that throws, or exceeds `policyTimeout`, denies. A denying policy always wins.
An allowing policy grants nothing by itself: the actor's roles, direct
permissions or rules must still grant the permission.

### Policies that grant

A policy that establishes the right on its own — ownership is the usual one —
says so with `effect: "grant"`:

```typescript
const engine = createPermissionEngine({
  roles,
  policies: [
    {
      name: "author-can-edit",
      permissions: ["post:update"],
      effect: "grant", // an allow here grants, even with no role
      evaluate: ({ actor, resource }) => ({
        allowed: (resource as { authorId?: string })?.authorId === actor.id,
      }),
    },
  ],
});
```

A granting policy still never overrides a denial — from another policy, an
explicit deny, or a deny rule that applied. Only the exact value `"grant"`
grants; a typo constrains. `createPermissionEngine({ defaultPolicyEffect:
"grant" })` restores the pre-1.4 behaviour for every policy that sets no
`effect` — prefer marking the individual policies.

`policyTimeout: 0` means "expire immediately", not "no timeout" — omit it to
disable.

## Registries

Registries can be handed straight to the engine, and stay live:

```typescript
import {
  createRoleRegistry,
  createPolicyRegistry,
  createPermissionRegistry,
} from "@zudojs/permissions";

const roles = createRoleRegistry();
roles.define({ name: "reader", permissions: ["post:read"] });
roles.define({ name: "staff", permissions: [], inherits: ["reader"] });

const policies = createPolicyRegistry();
const engine = createPermissionEngine({ roles, policies });

roles.define({ name: "auditor", permissions: ["audit:read"] });
roles.remove("reader");
// both take effect on the next check: the engine subscribes to the registry

policies.define({
  name: "lockdown",
  permissions: ["*:*"],
  evaluate: () => ({ allowed: false }),
});
// enforced by the next check — through the engine or an existing Ability

roles.require("auditor"); // throws RoleNotFoundError when unregistered
```

All three registries reject a duplicate name — re-registering a role or a
policy is an authorization rule disappearing without a trace. Pass
`{ allowOverride: true }` when replacement is what you mean.

The engine subscribes to a role or policy registry it is given. Every
`define`, `remove` and `clear` discards the memoized roles **and every cached
decision**, so revoking a role is not undone by a cache entry written before
the revocation. `engine.invalidateRoles()` does the same for a custom source.

`validateConfiguration` (default `true`) rejects a pattern that could never
match wherever it is written — a role grant, a role's rules, a static rule, or
a policy's `permissions` — because a malformed pattern in a deny or a lockdown
policy would fail open in silence. Arrays are checked at construction; a
registry checks on `define` (`InvalidRoleError` / `InvalidPermissionError`),
and a custom source is checked when the engine reads it.

A permission registry records descriptions and implications:

```typescript
const permissions = createPermissionRegistry();
permissions.define("post:admin", { implies: ["post:write"] });
permissions.define("post:write", { implies: ["post:read"] });

const engine = createPermissionEngine({
  roles,
  expandImplied: permissions,
});
// An actor granted post:admin now passes post:read.
```

Pass the registry itself rather than a closure over it. The engine subscribes
to it, so `permissions.remove("post:admin")` — or redefining it without the
implication — drops the decisions that were cached while it stood. A bare
`(permission) => permissions.expandImplied(permission)` still works, but it
cannot announce a change, so an engine given one caches no decisions at all.

## Caching

```typescript
import { createMemoryPermissionCache } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles,
  cache: createMemoryPermissionCache({
    defaultTtlMs: 30_000,
    maxEntries: 5_000,
  }),
  cacheTtlMs: 30_000,
});

await engine.can(actor, "post:read", post); // evaluated
await engine.can(actor, "post:read", post); // cached
await engine.can(actor, "post:read", post, { skipCache: true });
await engine.invalidateActor("user_1");
```

Keys include the actor id, a digest of everything else the actor carries
(`roles`, `permissions`, `type`, any other field a condition may read), the
permission and the resource id (from `resource.id`, or `options.resourceId`).
The same user id with different roles — an admin token in one tenant and a
viewer token in another, or a demoted token — never shares a decision. A `|`
inside an actor or resource id is escaped, so two different checks can never
share a key either.

A check is cached only when the key can describe it completely:

- a resource with no `id` and no `options.resourceId` is **not cached**, since
  the key would collapse to actor + permission and an allow for one object
  would answer for the next;
- a check carrying `metadata` is **not cached**, because conditions such as
  `tenantIsolation()` read the tenant from there and it is not part of the
  key;
- an actor carrying something the digest cannot describe (a function, a class
  instance, a `Map`) is **not cached**;
- a decision produced by a policy marked `cacheable: false`, or forced by a
  condition that threw, is not stored;
- an engine with a `roleResolver` or `permissionResolver` and no
  `resolverCacheKey` caches **nothing**: the resolver reads state the key
  cannot describe, so an entry would outlive a grant withdrawn upstream;
- an engine whose `expandImplied` is a bare function rather than a
  `createPermissionRegistry()` caches **nothing**, for the same reason: a
  revoked implication cannot announce itself;
- a TTL of `0` or less means "do not cache".

`deniedPermissions` is evaluated before the cache is consulted, so a deny
added to the actor takes effect immediately rather than waiting for a cached
allow to expire. A malformed entry there can never match, so it is reported
through `onError` instead of being dropped in silence.

## External sources

```typescript
const engine = createPermissionEngine({
  roles,
  roleResolver: { resolveRoles: (actor) => db.rolesFor(actor.id) },
  permissionResolver: { resolvePermissions: (actor) => db.rulesFor(actor.id) },
});
```

A resolver that fails is reported through `onError` and the check continues
fail-closed, rather than throwing out of the authorization path.

A resolver reads authorization state the engine does not own and cannot see
change, and none of it is in the decision-cache key. **A resolver-backed
engine therefore caches nothing** unless you describe that state with
`resolverCacheKey`:

```typescript
const engine = createPermissionEngine({
  roles,
  cache: createMemoryPermissionCache(),
  permissionResolver: { resolvePermissions: (actor) => db.rulesFor(actor.id) },
  // Anything that changes when the resolver's answer could change.
  resolverCacheKey: (actor) => db.grantsVersionFor(actor.id),
});
```

Return `undefined` for an actor whose state you cannot describe, and that
actor's decisions stay uncached.

## Failure behaviour

Every failure denies:

| Situation                     | Result                                                 |
| ----------------------------- | ------------------------------------------------------ |
| Unknown role on the actor     | denied; reported to `onError`; other roles still apply |
| Malformed permission string   | denied, `reason: "invalid_permission"`                 |
| Allow condition throws        | the allow does not apply                               |
| Deny condition throws         | denied, `reason: "rule_deny"`; reported to `onError`   |
| Malformed rule/policy pattern | rejected at construction or `define`                   |
| A deny rule applies           | denied, `reason: "rule_deny"`, even if a policy allows |
| Policy throws or times out    | denied, `reason: "policy_error:<name>"`                |
| Role inheritance cycle        | denied; reported to `onError`                          |
| Role source throws            | denied; reported to `onError`                          |
| `signal` aborted              | throws `AuthorizationAbortedError`                     |

A value that is not an `Error` — a policy or resolver that throws a string —
reaches `onError` wrapped in `PolicyError` or `PermissionResolverError`, with
the original as `cause`.

Cancellation is the one case that throws, because the caller asked for the
work to stop.

## Abilities

```typescript
const ability = engine.createAbility(actor);

await ability.can("post:update", post);
await ability.cannot("post:delete");
await ability.check("post:update", post); // full decision
await ability.authorize("post:update", post); // throws PermissionDeniedError
await ability.explain("post:update", post);
```

## Explain

`explain` runs the same evaluation as `check` and collects the steps, so the
trace always describes the decision that was made:

```typescript
const { allowed, steps, decision } = await engine.explain(
  actor,
  "post:update",
  post,
);
steps.forEach((step) => console.log(step.type, step.detail, step.matched));
```

The trace lists the grants that bear on this decision, not every permission
the actor holds.

## Audit events

```typescript
import { createPermissionEventEmitter } from "@zudojs/permissions";

const emitter = createPermissionEventEmitter({
  onHandlerError: (error) => logger.error({ error }, "audit sink failed"),
});
emitter.on((event) => auditLog.write(event));

const engine = createPermissionEngine({ roles, emitter });
```

Every check emits — allowed, denied, and the ones that throw — including
`explain()` on the engine and on an Ability, which make the same real
decision. A handler that throws cannot break authorization, but it is reported
rather than swallowed.

## HTTP middleware

```typescript
import { authorize, createActorMiddleware } from "@zudojs/permissions";

const guard = authorize(engine, "post:update", {
  extractActor: (context) => context.state.get("auth:user"),
  // May be async: it is awaited, and a loader that rejects denies (403).
  extractResource: (context) => loadPost(context.request.getParam?.("id")),
  // The tenant @zudojs/tenancy resolved and trust-checked — never a header.
  extractMetadata: (context) => ({
    tenantId: context.state.get<{ tenantId: string }>("tenancy:context")
      ?.tenantId,
  }),
  onError: (error, source) => logger.warn({ error, source }, "guard denied"),
});
```

- The guard extracts the actor itself when one is not already in state, so it
  works without a separate actor middleware.
- No actor → **401** with `WWW-Authenticate`. Actor but not permitted →
  **403**. The refusal is a `GuardResponse` (`createGuardResponse` from
  `@zudojs/middleware`), which `@zudojs/http` sends with that status, body and
  headers. It used to be a plain `{ status, body, headers }` object, which a
  route middleware's return ignored: the handler did not run, but the client
  got `200`.
- The 403 body carries `decision.publicReason`, never the internal reason:
  `policy_error:<name>` names your policies and does not belong in a
  response. Pass `deniedResponse` to shape the body — it receives the real
  decision.
- `context.signal` is forwarded, so a client disconnect stops policy
  evaluation.
- `extractResource` is awaited. A loader that throws or rejects answers
  **403** (`reason: "resource_error"`) and reports through `onError`; it never
  lets the request through.
- `createRequirePermissionsMiddleware(engine, permissions, { mode })` checks
  several permissions, short-circuiting on the first that decides the outcome.
  An empty list denies in either mode.

The middleware composes with the real `@zudojs/http` pipeline without
depending on it: the HTTP types are mirrored structurally (headers, params and
query may be plain objects, as `@zudojs/http` provides them, or maps), and
`HttpMiddleware` is assignable to `@zudojs/http`'s own `HttpMiddleware` — pass
a guard straight to a route, no `as never`:

```typescript
router.put("/posts/:id", updatePost, { middleware: [guard] });
```

A middleware of your own typed as this package's `HttpMiddleware` answers a
refusal with `createGuardResponse({ status, body })`; returning a plain
`{ status, body, headers }` object is no longer typed, because
`@zudojs/http` never sent it as a response.

## Errors

`PermissionError` is the base. `PermissionDeniedError` carries a caller-safe
message; the actor id, reason and policy live on `error.details` for the log,
not in the exposed metadata.

`PermissionNotFoundError` · `DuplicatePermissionError` · `RoleNotFoundError` ·
`DuplicateRoleError` · `DuplicatePolicyError` · `InvalidPermissionError` ·
`InvalidRoleError` ·
`CircularRoleInheritanceError` · `PolicyError` · `PolicyTimeoutError` ·
`PermissionResolverError` · `AuthorizationAbortedError`

## Use Cases

- API authorization
- Multi-tenant access control
- Admin panel permissions
- Fine-grained resource policies
