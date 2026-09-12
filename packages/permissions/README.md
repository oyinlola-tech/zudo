# @zudojs/permissions

Generic authorization engine with RBAC, ABAC, resource authorization, wildcards, role hierarchy, policies, and abilities.

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

Conditions may be async. A condition that throws is treated as unmet — an
authorization check fails closed.

**Combining.** The default is `deny-overrides`: any applicable deny wins,
whatever its priority. Pass `algorithm: "priority"` for highest-priority-wins,
where a tie still goes to deny.

Combinators: `allOf`, `anyOf`, `not`, `always`, `never`, `isOwner`,
`tenantIsolation`, `metadataEquals`, `resourceEquals`.

### Request metadata

Conditions read request-scoped facts from `context.metadata`, supplied per
check:

```typescript
await engine.can(actor, "invoice:read", invoice, {
  metadata: { tenantId: request.tenantId },
});
```

`tenantIsolation()` compares that value against the resource's tenant, and
denies when either is missing.

## Policies

A policy is a named, prioritised hook that runs alongside the rules.

```typescript
const engine = createPermissionEngine({
  roles,
  policyTimeout: 250,
  policies: [
    {
      name: "business-hours",
      permissions: ["post:*"], // wildcards work here too
      priority: 10, // higher runs first
      cacheable: false, // depends on the clock, so never cache it
      evaluate: (context) =>
        isBusinessHours()
          ? { allowed: true }
          : { allowed: false, reason: "outside_business_hours" },
    },
  ],
});
```

Policies run highest priority first and stop at the first denial. A policy
that throws, or exceeds `policyTimeout`, denies. A denying policy always wins;
an allowing one can grant access the rules did not decide, but never overrides
a denial — from another policy or from a deny rule that applied.

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
engine.invalidateRoles(); // pick up the change

policies.define({ name: "lockdown", permissions: ["*:*"], evaluate: () => ({ allowed: false }) });
// enforced by the next check — through the engine or an existing Ability

roles.require("auditor"); // throws RoleNotFoundError when unregistered
```

All three registries reject a duplicate name — re-registering a role or a
policy is an authorization rule disappearing without a trace. Pass
`{ allowOverride: true }` when replacement is what you mean.

`validateConfiguration` (default `true`) applies to a registry as well as to
an inline array: a role whose grant could never match is rejected when the
engine looks it up, and the check denies.

A permission registry records descriptions and implications:

```typescript
const permissions = createPermissionRegistry();
permissions.define("post:admin", { implies: ["post:write"] });
permissions.define("post:write", { implies: ["post:read"] });

const engine = createPermissionEngine({
  roles,
  expandImplied: (permission) => permissions.expandImplied(permission),
});
// An actor granted post:admin now passes post:read.
```

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

Keys include the actor, the permission and the resource id (from
`resource.id`, or `options.resourceId`), so two resources never share one
decision. A `|` inside an actor or resource id is escaped, so two different
(actor, permission, resource) triples can never share a key either.

A check is cached only when the key can describe it completely:

- a resource with no `id` and no `options.resourceId` is **not cached**, since
  the key would collapse to actor + permission and an allow for one object
  would answer for the next;
- a check carrying `metadata` is **not cached**, because conditions such as
  `tenantIsolation()` read the tenant from there and it is not part of the
  key;
- a decision produced by a policy marked `cacheable: false` is not stored;
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

## Failure behaviour

Every failure denies:

| Situation                   | Result                                                 |
| --------------------------- | ------------------------------------------------------ |
| Unknown role on the actor   | denied; reported to `onError`; other roles still apply |
| Malformed permission string | denied, `reason: "invalid_permission"`                 |
| Condition throws            | rule does not apply                                    |
| A deny rule applies         | denied, `reason: "rule_deny"`, even if a policy allows |
| Policy throws or times out  | denied, `reason: "policy_error:<name>"`                |
| Role inheritance cycle      | denied; reported to `onError`                          |
| Role source throws          | denied; reported to `onError`                          |
| `signal` aborted            | throws `AuthorizationAbortedError`                     |

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

Every check emits — allowed, denied, and the ones that throw. A handler that
throws cannot break authorization, but it is reported rather than swallowed.

## HTTP middleware

```typescript
import { authorize, createActorMiddleware } from "@zudojs/permissions";

const guard = authorize(engine, "post:update", {
  extractActor: (context) => context.state.get("auth:user"),
  extractResource: (context) => loadPost(context.request.params.get("id")),
  extractMetadata: (context) => ({
    tenantId: context.request.headers.get("x-tenant"),
  }),
});
```

- The guard extracts the actor itself when one is not already in state, so it
  works without a separate actor middleware.
- No actor → **401** with `WWW-Authenticate`. Actor but not permitted →
  **403**.
- The 403 body carries `decision.publicReason`, never the internal reason:
  `policy_error:<name>` names your policies and does not belong in a
  response. Pass `deniedResponse` to shape the body — it receives the real
  decision.
- `context.signal` is forwarded, so a client disconnect stops policy
  evaluation.
- `createRequirePermissionsMiddleware(engine, permissions, { mode })` checks
  several permissions, short-circuiting on the first that decides the outcome.

`@zudojs/http` is an optional peer dependency; the middleware types are
mirrored locally so this package works without it.

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
