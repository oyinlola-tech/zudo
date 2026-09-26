---
title: "@zudojs/permissions — Authorization Engine Documentation"
description: "Complete documentation for @zudojs/permissions — RBAC, ABAC, resource authorization, wildcards, role hierarchy, policies, and abilities."
source: https://zudojs.oyinlola.site/docs/packages-permissions
---

v1.4.1

# @zudojs/permissions

Authorization engine for the Zudojs framework. Supports RBAC, ABAC, resource policies, wildcards, role hierarchy, condition combinators, ability compilation, and explain mode.

RBAC ABAC AUTHORIZATION PERMISSIONS POLICIES

## INSTALLATION

```ts
// npm
npm install @zudojs/permissions

// pnpm
pnpm add @zudojs/permissions

// yarn
yarn add @zudojs/permissions
```

> **Dependencies:** @zudojs/permissions depends on @zudojs/errors and @zudojs/middleware (for `createGuardResponse`). Its HTTP middleware composes with the @zudojs/http pipeline structurally — the types are mirrored locally and are assignable to @zudojs/http's own — so no dependency or peer on @zudojs/http is declared.

## WHAT IT DOES

`@zudojs/permissions` is a full-featured authorization engine. It provides:

- **RBAC and ABAC** authorization with role-based and attribute-based access control
- **Permission parsing and matching** with resource:action format and wildcard support
- **Role hierarchy** with inheritance chains and circular detection
- **Rule engine** with exact, wildcard, and conditional (ABAC) matching — deny-overrides by default, priority-based on request
- **Policy evaluation** with wildcard matching, timeouts, priority ordering, and fail-closed error handling — a policy narrows access by default and grants only with `effect: "grant"`
- **Ability context** for pre-resolved actors with can/cannot/check/explain
- **Decision caching** keyed by actor, permission and resource, with configurable TTL, size cap and actor-level invalidation — opt-in only for resolver-backed engines, via `resolverCacheKey`
- **HTTP middleware** integration with actor extraction and permission guards
- **Explain mode** for debugging authorization decisions with step-by-step traces
- **13 error classes** covering all permission, role, and policy failure modes
- **Observability events** with permission check metrics and duration tracking

> **Core Principle:** Authorization decisions are always explicit. No implicit grants. Deny overrides allow by default. Every check is traceable via explain mode.

## WHERE IT SITS

ROLES

RULES

POLICIES

CACHE

HTTP

↓ ↓ ↓ ↓ ↓

@zudojs/permissions — Authorization Engine

↑

APPLICATION LAYER (HTTP, CQRS, Modules)

↑

OBSERVABILITY (Events, Metrics)

The permissions engine sits between the application layer and the authorization sub-systems. It resolves actor roles, evaluates rules against policies, and produces decisions that applications enforce.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | 1.3.0 | Base error classes (AuthorizationError, ErrorCode) |
| @zudojs/middleware | 1.1.0 | `createGuardResponse`: the 401/403 refusals the HTTP guards return |
| @zudojs/http | — | Not a dependency; the middleware plugs into its pipeline structurally |

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

## CORE TYPES

### PermissionActor

An entity requesting access — user, service, worker, bot, etc.

```ts
interface PermissionActor {
  readonly id: string;
  readonly type?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly deniedPermissions?: readonly string[];
}
```

### Permission

A parsed permission with resource and action.

```ts
interface Permission {
  readonly resource: string;
  readonly action: string;
}
```

### PermissionString

Permission string format: "resource:action" or wildcards like "post:*", "*:*".

```ts
type PermissionString = string;
```

### RuleEffect

```ts
type RuleEffect = "allow" | "deny";
```

### PermissionRule

A permission rule that grants or denies access under conditions.

```ts
interface PermissionRule {
  readonly effect: RuleEffect;
  readonly action: string | readonly string[];
  readonly resource: string | readonly string[];
  readonly condition?: PermissionConditionFn;
  readonly priority?: number;
  readonly name?: string;
}
```

### PermissionConditionFn

```ts
type PermissionConditionFn = (
  context: PermissionContext,
) => boolean | Promise<boolean>;
```

### PermissionContext

```ts
interface PermissionContext {
  readonly actor: PermissionActor;
  readonly permission: Permission;
  readonly resource?: unknown;
  readonly metadata?: ReadonlyMap<string, unknown>;
}
```

### PermissionDecision

```ts
interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly policy?: string;
  readonly matchedPermission?: string;
  readonly metadata?: unknown;
}
```

## ROLES & HIERARCHY

### RoleDefinition

```ts
interface RoleDefinition {
  readonly name: string;
  readonly permissions: readonly string[];
  readonly inherits?: readonly string[];
  readonly description?: string;
  readonly system?: boolean;
}
```

### createRoleRegistry

Creates a central registry for role definitions with define/get/has/all/remove/clear methods.

```ts
import { createRoleRegistry } from "@zudojs/permissions";

const roles = createRoleRegistry();

roles.define({
  name: "admin",
  permissions: ["*:*"],
  description: "Full access",
});

roles.define({
  name: "editor",
  permissions: ["post:create", "post:update", "post:read"],
  inherits: ["viewer"],
});

roles.define({
  name: "viewer",
  permissions: ["post:read", "comment:read"],
});
```

### resolveRolePermissions

Resolves all permissions for a set of role names, following inheritance chains and detecting cycles.

```ts
import { resolveRolePermissions } from "@zudojs/permissions";

const perms = resolveRolePermissions(
  ["editor"],
  (name) => roles.get(name),
);
// ["post:create", "post:update", "post:read", "comment:read"]
```

### Role Errors

| Error | When Thrown |
| --- | --- |
| RoleNotFoundError | Referenced role does not exist in the registry |
| DuplicateRoleError | A duplicate role was registered |
| InvalidRoleError | Role name is empty or has no permissions |
| CircularRoleInheritanceError | Circular role inheritance detected (e.g. A→B→A) |

## PERMISSIONS REGISTRY

### createPermissionRegistry

Creates a central registry for defining and looking up permissions.

```ts
import { createPermissionRegistry } from "@zudojs/permissions";

const registry = createPermissionRegistry();

registry.define("post:create", { description: "Create a post" });
registry.define("post:read", { description: "Read a post" });
registry.define("post:update", { implies: ["post:read"] });
registry.define("post:delete", { implies: ["post:read"] });

registry.has("post:create");  // true
registry.all();              // ["post:create", "post:read", "post:update", "post:delete"]
registry.match("post:*");   // all post permissions

// Added in 1.3.0 — the same change notifier createRoleRegistry() and
// createPolicyRegistry() already carried. Fires on define, on a remove
// that removed something, and on clear. Returns an unsubscribe function.
const unsubscribe = registry.subscribe(() => rebuildAdminUi());
```

### Implications and the engine

A registry records implications, and `expandImplied` follows the chains. Since 1.3.0 `createPermissionEngine` accepts the registry itself in that slot, not only a closure over it.

```ts
const permissions = createPermissionRegistry();
permissions.define("post:admin", { implies: ["post:write"] });
permissions.define("post:write", { implies: ["post:read"] });

const engine = createPermissionEngine({
  roles,
  // Pass the registry, not a closure over it: the engine subscribes.
  expandImplied: permissions,
});

await engine.can(adminActor, "post:read"); // true — implied by post:admin

permissions.remove("post:admin");
await engine.can(adminActor, "post:read"); // false — cached decisions dropped
```

> **Changed in 1.3.0:** a bare `expandImplied: (permission) => permissions.expandImplied(permission)` still works, but a plain function cannot announce a change, so an engine given one now **caches no decisions at all**. Until 1.2.0 it cached normally, and `permissions.remove("post:admin")` left every `post:delete` it had implied answering `true` for the whole cache TTL — while `skipCache: true` correctly said `false`. Pass the registry to keep both caching and immediate revocation.

### parsePermission

```ts
import { parsePermission } from "@zudojs/permissions";

parsePermission("post:update");
// { resource: "post", action: "update" }

parsePermission("billing.invoice:refund");
// { resource: "billing.invoice", action: "refund" }
```

### Matching Functions

```ts
import { matches, matchesPermission, isValidPermission } from "@zudojs/permissions";

matches("post:*", "post:update");    // true
matches("*:*", "anything:goes");     // true
matches("post:read", "post:update");  // false

isValidPermission("post:update");    // true
isValidPermission("invalid");        // false
```

### Permission Errors

| Error | When Thrown |
| --- | --- |
| PermissionNotFoundError | Referenced permission not in registry |
| DuplicatePermissionError | Duplicate permission registered |
| InvalidPermissionError | Malformed permission string format |

## RULE ENGINE

The rule engine compiles rules into an indexed structure for O(1) lookup. Rules support wildcards and deny-overrides by default (any applicable deny wins, whatever its priority); `algorithm: "priority"` picks highest-priority-wins with deny breaking ties. An allowing policy never overrides a deny rule that applied; such a denial reports `reason: "rule_deny"`.

### ruleMatches

```ts
import { ruleMatches } from "@zudojs/permissions";

const rule: PermissionRule = {
  effect: "allow",
  action: "read",
  resource: "post",
};

ruleMatches(rule, { resource: "post", action: "read" });  // true
ruleMatches(rule, { resource: "post", action: "write" }); // false
```

### evaluateRules

`evaluateRules` is **async**, because a rule's conditions may be. It returns a `Promise`, so `await` it: without `await`, `result.allowed` is `undefined`, and `if (result)` is always true. For rules with no conditions, `evaluateRulesSync(rules, target)` returns the same result synchronously; it skips a conditional allow and applies a conditional deny.

```ts
import { evaluateRules, type PermissionRule } from "@zudojs/permissions";

const rules: PermissionRule[] = [
  { effect: "allow", action: "read", resource: "post", priority: 10 },
  { effect: "deny", action: "read", resource: "post", priority: 20 },
];

const result = await evaluateRules(rules, { resource: "post", action: "read" });
// { allowed: false, matchedRule: { effect: "deny", …, priority: 20 }, applicable: [ …both rules ] }
```

### compileRules & findMatchingRules

```ts
import { compileRules, findMatchingRules } from "@zudojs/permissions";

const index = compileRules(rules);
const matched = findMatchingRules(index, {
  resource: "post",
  action: "read",
});
```

### RuleIndex Structure

```ts
interface RuleIndex {
  /** Exact matches: "post:update" → rules. */
  readonly exact: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Resource wildcards: "post:*" → rules. */
  readonly resourceWildcard: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Action wildcards: "*:read" → rules. */
  readonly actionWildcard: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Global wildcards: "*:*" → rules. */
  readonly globalWildcard: readonly PermissionRule[];
}
```

## CONDITIONS

Condition combinators for composing ABAC policies. All functions return `PermissionConditionFn`.

> A condition that cannot be evaluated fails closed: an allow whose condition throws does not apply; a deny whose condition throws **applies** (denied, `rule_deny`, reported to `onError`, not cached).

```ts
import {
  allOf,
  anyOf,
  not,
  always,
  never,
  isOwner,
  tenantIsolation,
} from "@zudojs/permissions";

// All conditions must return true
const adminAndOwner = allOf(
  (ctx) => ctx.actor.roles?.includes("admin") === true,
  isOwner(),
);

// At least one condition must return true
const adminOrOwner = anyOf(
  (ctx) => ctx.actor.roles?.includes("admin") === true,
  isOwner(),
);

// Negate a condition
const notAdmin = not((ctx) => ctx.actor.roles?.includes("admin") === true);

// Always allow / always deny
const pass = always();
const fail = never();

// Check actor owns the resource (field: "ownerId" by default)
const ownerCheck = isOwner("ownerId");

// Enforce tenant isolation
const tenantCheck = tenantIsolation("tenantId", "tenantId");
```

### Condition Summary

| Function | Behavior |
| --- | --- |
| allOf(...fns) | All conditions must return true |
| anyOf(...fns) | At least one condition must return true |
| not(fn) | Negate a condition |
| always() | Unconditional pass |
| never() | Unconditional fail |
| isOwner(field?) | Actor owns the resource: `resource[field]` equals `actor.id`. A string and a number are compared as strings, so a numeric `ownerId: 42` from a database row matches `actor.id: "42"` from a token. No other conversion happens: `" 42"`, a `bigint` or an ObjectId-like object does not match, and a missing resource or a `null`/`undefined` id on either side is always `false`. Default field `"ownerId"`. |
| tenantIsolation(aField?, rField?) | The tenant in the check's `metadata` (field `aField`, default `"tenantId"`) equals `resource[rField]`. False when either is missing. The actor's tenant is read from `metadata`, not from the actor, so fill it from a verified token claim or the tenant `@zudojs/tenancy` resolved, never from a request header. |

Enforce tenant isolation with a deny rule, not an allow rule.

Grants add up. If a role already grants `invoice:read`, an allow rule with `condition: tenantIsolation()` changes nothing: the role alone lets a member of tenant A read tenant B's invoice. A deny rule wins over every grant:

```ts
rules: [{
  name: "cross-tenant",
  effect: "deny",
  resource: "invoice",
  action: "read",
  condition: not(tenantIsolation()),
}]
// role grants invoice:read → tenant A reading B's invoice: false, B reading B's: true
```

Use the allow-rule form only when no role grants the permission on its own. The deny rule also holds against policies: a policy with `effect: "grant"` cannot override it (tested in v1.4.0: tenant A reading B's invoice through a granting policy is still `false`).

## POLICIES

### PermissionPolicyDefinition

```ts
interface PermissionPolicyDefinition {
  readonly name: string;
  readonly effect?: PolicyEffect;  // "constrain" (default) | "grant"
  readonly permissions: readonly string[];
  readonly cacheable?: boolean;
  readonly priority?: number;
  evaluate(context: PermissionContext):
    PermissionDecision | Promise<PermissionDecision>;
}
```

### What a policy's answer means

A policy runs alongside the rules for every permission it lists. Policies run highest priority first and stop at the first denial, and a denial always wins. What a policy's answer means depends on its `effect`:

- `"constrain"` (the default): “no objection”. The policy is an extra condition on top of RBAC/ABAC, so the actor's roles, direct permissions or rules must still grant the permission. An allow means “no objection”; `allowed: false`, a throw or a `policyTimeout` denies. It can take access away, never hand it out.
- `"grant"`: an independent grant. The allow grants the permission even when no role or rule does, with reason `policy_allow`. `allowed: false`, a throw or a timeout **abstains**: the policy adds nothing, and the decision falls to the roles, permissions and rules. It can add access, never take it away. Use it only for a policy that establishes the right on its own, such as an ownership check. Only the exact string `"grant"` grants; a typo constrains.

```ts
import { createPermissionEngine } from "@zudojs/permissions";

let maintenance = false;

const engine = createPermissionEngine({
  roles: [{ name: "staff", permissions: ["task:*"] }],
  policies: [
    {
      name: "maintenance-window",
      permissions: ["task:*"], // wildcards work here too
      cacheable: false,        // reads state outside the actor and resource
      evaluate: () =>
        maintenance ? { allowed: false, reason: "maintenance" } : { allowed: true },
    },
  ],
});

const staff = { id: "u1", roles: ["staff"] };
const guest = { id: "u2" };

console.log(await engine.can(staff, "task:delete")); // true  — the role grants; the policy has no objection
console.log(await engine.can(guest, "task:delete")); // false — no role grants it; an allow is not a grant
maintenance = true;
console.log(await engine.can(staff, "task:delete")); // false — the policy denies
```

### Policies that grant

A policy that establishes the right on its own says so with `effect: "grant"`. The rule is one-sided: when it allows, it grants; when it returns `false`, throws or times out, it abstains. An ownership policy therefore only has to answer “is this the author?” — an editor whose role grants the permission still gets in when the policy says `false`, and an actor with neither is still refused. A throw or timeout is still reported through `onError`.

```ts
import { createPermissionEngine } from "@zudojs/permissions";

const posts = createPermissionEngine({
  roles: [{ name: "editor", permissions: ["post:update"] }],
  policies: [
    {
      name: "author-can-edit",
      permissions: ["post:update"],
      effect: "grant", // an allow grants, even with no role; a false abstains
      evaluate: ({ actor, resource }) => ({
        allowed: (resource as { authorId?: string } | undefined)?.authorId === actor.id,
      }),
    },
  ],
});

const post = { id: "p1", authorId: "ada" };

console.log(await posts.check({ id: "ada" }, "post:update", post));
// { allowed: true, reason: "policy_allow", policy: "author-can-edit" }
console.log(await posts.can({ id: "bob" }, "post:update", post));                    // false — not the author, no role
console.log(await posts.check({ id: "eve", roles: ["editor"] }, "post:update", post));
// { allowed: true, reason: "role_permission", matchedPermission: "post:update" } — the policy abstained
```

A granting policy never overrides a denial from another policy, `deniedPermissions`, or a deny rule that applied. `createPermissionEngine({ defaultPolicyEffect: "grant" })` keeps the pre-1.4 semantics for policies that set no `effect`: there, an allow grants and a `false` still denies. `policyGrants(policy, defaultEffect?)` tells you whether a policy would grant, and `DEFAULT_POLICY_EFFECT` is `"constrain"`. Internally, an allow from constraining policies alone is recorded as `policy_pass`; the decision you get back then carries the grant's reason (such as `role_permission`) with `policy` naming the policies that ran.

> **Changed in 1.4.0 (behaviour change, security):** up to 1.3.x an allowing policy granted the permission on its own, so a policy meant as a restriction, such as business hours, let an actor with no roles through, and the old advice was to check the role inside every policy. That check is no longer needed. **If you relied on a policy to grant access, those checks now deny** until you add `effect: "grant"` to that policy. `createPermissionEngine({ defaultPolicyEffect: "grant" })` restores the old behaviour for every policy that sets no `effect`; prefer marking the individual policies.

> **Changed in 1.4.1:** in 1.4.0 a policy with `effect: "grant"` that returned `false` denied, so an ownership policy locked out editors whose role grants the permission, and the workaround was `|| actorHasRole(actor, "editor")` inside the policy. A granting policy now abstains when it returns `false`, throws or times out, so that workaround can go. It is harmless if you keep it.

### createPolicyRegistry

```ts
import { createPolicyRegistry } from "@zudojs/permissions";

const policies = createPolicyRegistry();

policies.define({
  name: "business-hours",
  permissions: ["post:publish"],
  priority: 10,
  cacheable: false, // depends on the clock
  evaluate() {
    const hour = new Date().getHours();
    if (hour < 9 || hour >= 17) {
      return { allowed: false, reason: "Outside business hours" };
    }
    // "No objection": the actor's roles still have to grant post:publish.
    return { allowed: true };
  },
});

console.log(policies.forPermission("post:publish").map((policy) => policy.name)); // [ 'business-hours' ]
```

### Policy Errors

| Error | When Thrown |
| --- | --- |
| PolicyError | Policy evaluation failed (fail-closed) |
| PolicyTimeoutError | Policy evaluation exceeded the timeout |

## EVALUATOR

### EvaluatorOptions

```ts
interface EvaluatorOptions {
  readonly getRole?: (name: string) => RoleDefinition | undefined;
  readonly policies?: readonly PermissionPolicyDefinition[];
  readonly policyTimeout?: number;
  readonly defaultPolicyEffect?: PolicyEffect;  // default "constrain"
}
```

### evaluate

```ts
import { evaluate } from "@zudojs/permissions";

const decision = await evaluate(
  { id: "user-1", roles: ["editor"] },
  "post:update",
  postResource,
  evaluatorOptions,
);
// { allowed: true, reason: "role_permission", matchedPermission: "post:update" }
```

### evaluateWithExplain

```ts
import { evaluateWithExplain } from "@zudojs/permissions";

const result = await evaluateWithExplain(
  { id: "user-1", roles: ["editor"] },
  "post:update",
  postResource,
  evaluatorOptions,
);
// { allowed: true, steps: [
//   { type: "role", detail: "Role: editor", matched: true },
//   { type: "permission", detail: "Permission: post:update", matched: true },
//   { type: "rule", detail: "Rule allow: post:update", matched: true },
//   { type: "permission", detail: "Decision: allow (role_permission)", matched: true }
// ]}
```

### resolveActorPermissions

Resolves all permissions for an actor (direct + role-based).

```ts
import { resolveActorPermissions } from "@zudojs/permissions";

const perms = resolveActorPermissions(actor, evaluatorOptions);
```

### PermissionEngine

The main public API for permission checks.

```ts
interface PermissionEngine {
  can(actor, permission, resource?, options?): Promise<boolean>;
  check(actor, permission, resource?, options?): Promise<PermissionDecision>;
  authorize(actor, permission, resource?, options?): Promise<void>;
  explain(actor, permission, resource?, options?): Promise<ExplainResult>;
  createAbility(actor): Ability;
  invalidateActor(actorId: string): Promise<void>;
  invalidateRoles(): void;
}
```

### createPermissionEngine

```ts
import { createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [
    { name: "admin", permissions: ["*:*"] },
    { name: "editor", permissions: ["post:*", "comment:read"], inherits: ["viewer"] },
    { name: "viewer", permissions: ["post:read", "comment:read"] },
  ],
  policies: [businessHoursPolicy],
  policyTimeout: 5000,
  // defaultPolicyEffect: "grant" would restore the pre-1.4 behaviour for
  // policies without an effect; prefer effect: "grant" on single policies.
});

// Simple boolean check
await engine.can(editor, "post:update");  // true
await engine.can(editor, "user:delete");  // false

// Full decision object
const decision = await engine.check(editor, "post:update");

// Throw on denial
await engine.authorize(editor, "user:delete");
// throws PermissionDeniedError
```

## ABILITY

An Ability provides fast permission checks for a pre-resolved actor. Create once, check many times.

### Ability Interface

```ts
interface Ability {
  can(permission: string, resource?: unknown, options?: AuthorizationOptions): Promise<boolean>;
  cannot(permission: string, resource?: unknown, options?: AuthorizationOptions): Promise<boolean>;
  check(permission: string, resource?: unknown, options?: AuthorizationOptions): Promise<PermissionDecision>;
  explain(permission: string, resource?: unknown, options?: AuthorizationOptions): Promise<ExplainResult>;
  authorize(permission: string, resource?: unknown, options?: AuthorizationOptions): Promise<void>;
  readonly actor: PermissionActor;
}
```

### createAbility

```ts
import { createAbility } from "@zudojs/permissions";

const ability = createAbility(editorActor, evaluatorOptions);

if (await ability.can("post:update")) {
  // Update the post
}

await ability.authorize("post:delete");
// throws PermissionDeniedError if not allowed
```

## RESOLVERS

### Interfaces

```ts
interface PermissionResolver {
  resolvePermissions(actor: PermissionActor): Promise<readonly PermissionRule[]>;
}

interface RoleResolver {
  resolveRoles(actor: PermissionActor): Promise<readonly string[]>;
}
```

### Factory Functions

```ts
import {
  createMemoryPermissionResolver,
  createMemoryRoleResolver,
  createStaticPermissionResolver,
  createStaticRoleResolver,
} from "@zudojs/permissions";

// In-memory — resolve from a Map
const permStore = new Map<string, PermissionRule[]>();
permStore.set("user-1", [
  { effect: "allow", action: "read", resource: "post" },
]);
const permResolver = createMemoryPermissionResolver(permStore);

// Static — always return the same rules
const staticResolver = createStaticPermissionResolver([
  { effect: "allow", action: "*", resource: "*" },
]);

// Memory role resolver
const roleStore = new Map<string, string[]>();
roleStore.set("user-1", ["editor"]);
const roleResolver = createMemoryRoleResolver(roleStore);
```

### Resolvers and the decision cache

> **Changed in 1.3.0 — read this if you configured a cache.** An engine holding a `roleResolver` or a `permissionResolver` now caches **nothing** unless you also pass the new `resolverCacheKey`. Until 1.2.0 such an engine cached like any other, and none of the resolver's state was in the key — so a grant withdrawn upstream kept being served until the entry expired. If you pair a resolver with `cache` today and expect hits, there are none: supply `resolverCacheKey`, or accept that every check is evaluated afresh. Engines without a resolver are unaffected.

`resolverCacheKey` takes the actor and returns something that changes whenever the resolver's answer for that actor could change — a grants-table version, an `updatedAt` stamp, a generation counter. It has no default. Returning `undefined` leaves that actor uncached, which is the right answer for an actor whose upstream state you cannot describe.

```ts
import {
  createPermissionEngine,
  createMemoryPermissionCache,
} from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles,
  cache: createMemoryPermissionCache({ defaultTtlMs: 30_000 }),
  cacheTtlMs: 30_000,
  permissionResolver: { resolvePermissions: (actor) => db.rulesFor(actor.id) },
  // Without this the cache above is never written to.
  resolverCacheKey: (actor) => db.grantsVersionFor(actor.id),
});
```

A resolver that fails is reported through `onError` and the check continues fail-closed, rather than throwing out of the authorization path.

## CACHING

Hand the cache to the engine and it manages the keys itself. A key carries the actor id, a digest of everything else the actor holds (`roles`, `permissions`, `type`, any other field a condition may read), the permission, the resource id and the engine's configuration generation. The same user id with different roles — an admin token in one tenant and a viewer token in another, or a demoted token — therefore never shares a decision. Role and policy registry changes, and `invalidateRoles()`, clear the decision cache.

```ts
import { createMemoryPermissionCache, createPermissionEngine } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles,
  cache: createMemoryPermissionCache({
    defaultTtlMs: 30_000,  // default 60_000
    maxEntries: 5_000,     // default 10_000
  }),
  cacheTtlMs: 30_000,
});

await engine.can(actor, "post:read", post);                        // evaluated
await engine.can(actor, "post:read", post);                        // cached
await engine.can(actor, "post:read", post, { skipCache: true }); // forced
await engine.invalidateActor("user-1");
```

A check is cached only when the key can describe it completely. These are **not** cached:

- a resource with no `id` and no `options.resourceId` — the key would collapse to actor + permission, and an allow for one object would answer for the next;
- a check carrying `metadata`, because conditions such as `tenantIsolation()` read the tenant from there and it is not part of the key;
- an actor carrying something the digest cannot describe — a function, a class instance, a `Map`;
- a decision produced by a policy marked `cacheable: false`, or forced by a condition that threw;
- **since 1.3.0**, anything from an engine with a `roleResolver` or `permissionResolver` and no `resolverCacheKey`;
- **since 1.3.0**, anything from an engine whose `expandImplied` is a bare function rather than a `createPermissionRegistry()`;
- a TTL of `0` or less, which means "do not cache", not "cache forever".

`deniedPermissions` is evaluated before the cache is consulted, so a deny added to the actor takes effect immediately rather than waiting for a cached allow to expire.

### PermissionCache Interface

```ts
interface PermissionCache {
  get(key: string): Promise<PermissionDecision | undefined>;
  set(key: string, value: PermissionDecision, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateActor(actorId: string): Promise<void>;
}
```

### createMemoryPermissionCache

```ts
import {
  createMemoryPermissionCache,
  permissionCacheKey,
} from "@zudojs/permissions";

// Default TTL: 60000ms (1 minute)
const cache = createMemoryPermissionCache();

// Custom TTL: 5 minutes
const cache5m = createMemoryPermissionCache(300000);

// Generate cache key — (actorId, permission, resourceId?, scope?)
const key = permissionCacheKey("user-1", "post:update", "post-42");
// "actor:user-1|post:update|post-42"

// `scope` is what the engine fills with the actor digest and its own
// configuration generation, so two actors sharing an id never share a key.
const scoped = permissionCacheKey("user-1", "post:update", "post-42", "g3");
// "actor:user-1|~g3|post:update|post-42"

// The store itself, if you are implementing PermissionCache over Redis
await cache.set(key, { allowed: true }, { ttl: 60000 });
await cache.get(key);              // { allowed: true }
await cache.invalidateActor("user-1"); // drops every entry for that actor
```

> **Do not wrap the engine in a cache of your own.** Pass the cache to `createPermissionEngine` instead. A key you build by hand carries only the actor id, the permission and the resource id, so it leaves out every rule the engine applies before it writes an entry: the actor digest (an admin token and a viewer token for the same user id would share one decision), the configuration generation, the metadata and resolver checks above. Caching `engine.check()` yourself under such a key reintroduces exactly the staleness 1.3.0 closed.

## HTTP MIDDLEWARE

Middleware factories that integrate the authorization engine with `@zudojs/http`'s middleware pipeline.

A refusal is a real HTTP response. `authorize()`, `createRequirePermissionMiddleware()`, `createRequirePermissionsMiddleware()` and `createActorMiddleware({ requireActor: true })` return a guard response (`createGuardResponse` from [@zudojs/middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md)): `403` when the engine denies, `401` with `WWW-Authenticate: Bearer` when there is no actor. `@zudojs/http` sends it with that status and a JSON body, and the guards go straight into a route's `middleware` list with no cast.

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import {
  authorize,
  createActorMiddleware,
  createPermissionEngine,
  ACTOR_STATE_KEY,
  type PermissionActor,
} from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [
    { name: "editor", permissions: ["post:update"] },
    { name: "viewer", permissions: ["post:read"] },
  ],
});

// Stand-in for your verified session lookup. Never trust a client-chosen role.
const sessions = new Map<string, PermissionActor>([
  ["s-editor", { id: "u1", roles: ["editor"] }],
  ["s-viewer", { id: "u2", roles: ["viewer"] }],
]);

const router = createRouter();
router.put("/posts/:id", () => ({ updated: true }), {
  middleware: [
    createActorMiddleware({
      extractActor: (ctx) => sessions.get(ctx.request.getHeader?.("x-session") ?? ""),
    }),
    authorize(engine, "post:update", {
      extractActor: (ctx) => ctx.state.get(ACTOR_STATE_KEY) as PermissionActor | undefined,
    }),
  ],
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();

// PUT /posts/1, x-session: s-editor → 200 {"updated":true}
// PUT /posts/1, x-session: s-viewer → 403 {"error":"Forbidden","message":"Access denied"}
// PUT /posts/1, no session          → 401 {"error":"Unauthorized","message":"Authentication required"}
```

> **Changed in 1.4.0:** up to 1.3.x these guards returned a plain `{ status, body, headers }` object, which `@zudojs/http` treated as data: a refused request reached the client as `200` (the handler did not run), and the guards needed `as never` to fit a route's `middleware` list. If you replaced them with a guard that throws `ForbiddenError` / `UnauthorizedError`, that still works; you can now go back to the factories. A hand-written middleware typed with this package's `HttpMiddleware` can no longer return a plain object; return `createGuardResponse(...)` instead.

### Types

```ts
// Generic over what next() resolves to, so it is assignable to @zudojs/http's own type.
type HttpMiddlewareOutcome<Downstream> = void | Response | GuardResponse | Downstream;

type HttpMiddleware = <Downstream extends HttpResponseContext>(
  context: HttpMiddlewareContext,
  next: () => Promise<Downstream>,
) => HttpMiddlewareOutcome<Downstream> | Promise<HttpMiddlewareOutcome<Downstream>>;

// PermissionHttpResponse is an alias of GuardResponse from @zudojs/middleware.

const ACTOR_STATE_KEY = "permissions:actor";
const DECISION_STATE_KEY = "permissions:decision";
```

### Middleware Factories

```ts
import {
  createActorMiddleware,
  createRequirePermissionMiddleware,
  authorize,
  createRequirePermissionsMiddleware,
  createForbiddenResponse,
  createJsonResponse,
  ACTOR_STATE_KEY,
} from "@zudojs/permissions";

// Extract actor from request
const actorMw = createActorMiddleware({
  extractActor: (ctx) => {
    // Illustration only: in real code take the id from verified auth, not a client header
    const userId = ctx.request.getHeader?.("x-user-id");
    if (!userId) return undefined;
    return { id: userId, roles: ["editor"] };
  },
});

// Check a specific permission
const requireMw = createRequirePermissionMiddleware(engine, {
  permission: "post:update",
  extractActor: (ctx) => ctx.state.get(ACTOR_STATE_KEY),
});

// Shorthand: authorize with permission
const authMw = authorize(engine, "post:update", {
  extractActor: (ctx) => ctx.state.get(ACTOR_STATE_KEY),
});

// Check multiple permissions
const multiMw = createRequirePermissionsMiddleware(
  engine,
  ["post:read", "comment:read"],
  {
    extractActor: (ctx) => ctx.state.get(ACTOR_STATE_KEY),
  },
);
```

### HTTP Options

```ts
interface AuthorizeMiddlewareOptions extends DeniedResponseOptions {
  readonly extractActor?: (context: HttpMiddlewareContext) =>
    PermissionActor | Promise<PermissionActor> | undefined;
  readonly authorization?: AuthorizationOptions;
  readonly forwardSignal?: boolean;
  readonly extractMetadata?: (context: HttpMiddlewareContext) => Record<string, unknown> | undefined;
  readonly onError?: (error: unknown, source: string) => void;
}

interface DeniedResponseOptions {
  readonly deniedResponse?: (decision: PermissionDecision) => unknown;
  readonly unauthenticatedResponse?: () => unknown;
  readonly authenticateChallenge?: string;
}

interface RequirePermissionMiddlewareOptions
  extends AuthorizeMiddlewareOptions, MissingResourceOptions {
  readonly permission: string;
  readonly extractResource?: (context: HttpMiddlewareContext) => unknown | Promise<unknown>;
}

// Added in 1.4.1. Also accepted by createRequirePermissionsMiddleware.
type MissingResourceMode = "check" | "forbid" | "notFound";

interface MissingResourceOptions extends NotFoundResponseOptions {
  readonly onMissingResource?: MissingResourceMode; // default "check"
}

interface NotFoundResponseOptions {
  readonly notFoundResponse?: () => unknown; // builds the 404 body
}
```

`extractResource` may be async and is awaited; a loader that throws or rejects answers 403. An empty list passed to `createRequirePermissionsMiddleware` denies. `createForbiddenResponse`, `createUnauthorizedResponse`, `createNotFoundResponse` (since 1.4.1) and `createJsonResponse(status, body)` build the same guard responses for your own middleware; `createJsonResponse` throws `RangeError` for a status outside 100–599.

### A resource that does not exist: onMissingResource

Since 1.4.1, `authorize()`, `createRequirePermissionMiddleware` and `createRequirePermissionsMiddleware` take `onMissingResource`, which decides what the guard does when `extractResource` returns `undefined` or `null`:

- `"check"` (the default): evaluate the permission with no resource, as the guards always have. A role grant alone lets the request through, so the handler still has to answer 404 itself.
- `"notFound"`: answer **404** without evaluating. `notFoundResponse` shapes the body; the default is `{"error":"Not Found","message":"Resource not found"}`.
- `"forbid"`: answer **403** without evaluating.

A request with no actor still gets 401 first. The option does nothing on a guard without `extractResource`. A refusal records `RESOURCE_NOT_FOUND_DECISION` (`reason: "resource_not_found"`) under `permissions:decision`.

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { authorize, createPermissionEngine, type PermissionActor } from "@zudojs/permissions";

const engine = createPermissionEngine({
  roles: [{ name: "editor", permissions: ["post:update"] }],
});

// Stand-ins for your verified session lookup and your data store.
const sessions = new Map<string, PermissionActor>([
  ["s-editor", { id: "u1", roles: ["editor"] }],
  ["s-guest", { id: "u2" }],
]);
const posts = new Map([["1", { id: "1", authorId: "u1" }]]);

const router = createRouter();
router.put("/posts/:id", () => ({ updated: true }), {
  middleware: [
    authorize(engine, "post:update", {
      extractActor: (ctx) => sessions.get(ctx.request.getHeader?.("x-session") ?? ""),
      extractResource: (ctx) => posts.get(ctx.request.getParam?.("id") ?? ""),
      onMissingResource: "notFound", // 404 before the permission is evaluated
      notFoundResponse: () => ({ error: "Not Found", message: "No such post" }),
    }),
  ],
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 3000 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();

// PUT /posts/1,   x-session: s-editor → 200 {"updated":true}
// PUT /posts/404, x-session: s-editor → 404 {"error":"Not Found","message":"No such post"}
// PUT /posts/1,   x-session: s-guest  → 403 {"error":"Forbidden","message":"Access denied"}
// PUT /posts/404, x-session: s-guest  → 404 {"error":"Not Found","message":"No such post"}
// PUT /posts/404, no session          → 401 {"error":"Unauthorized","message":"Authentication required"}
```

> **A 404 is not concealment on its own.** Look at the guest rows above: an existing post answers 403 and a missing one 404, so the pair of statuses tells a caller which ids exist. `"notFound"` hides existence only if every route over the resource answers the same way and a denial on an existing resource is also answered 404, which these guards do not do for you. Use it to take the not-found check out of the handler, not to hide ids.

## OBSERVABILITY

### PermissionCheckEvent

```ts
interface PermissionCheckEvent {
  readonly actorId: string;
  readonly permission: string;
  readonly resourceType?: string;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly durationMs: number;
}
```

### createPermissionEventEmitter

```ts
import { createPermissionEventEmitter, withObservability } from "@zudojs/permissions";

const emitter = createPermissionEventEmitter();

emitter.on((event) => {
  console.log(`[${event.actorId}] ${event.permission} → ${event.allowed} (${event.durationMs}ms)`);
});

// Wrap a check function with observability
const observedCheck = withObservability(emitter, engine.check);
await observedCheck(actor, "post:update");
// Emits PermissionCheckEvent
```

## UTILITIES

```ts
import {
  extractResource,
  extractAction,
  buildPermission,
  createActor,
} from "@zudojs/permissions";

extractResource("post:update");       // "post"
extractResource("billing.invoice:refund"); // "billing.invoice"

extractAction("post:update");         // "update"

buildPermission("post", "update");     // "post:update"

const actor = createActor("user-1", {
  type: "user",
  roles: ["editor"],
  permissions: ["post:create"],
});
```

## ERROR HIERARCHY

All error types extend `PermissionError` which extends `AuthorizationError` from `@zudojs/errors`.

| Error | ErrorCode | When Thrown |
| --- | --- | --- |
| PermissionError | FORBIDDEN | Base error for all permission failures |
| PermissionDeniedError | ACCESS_DENIED | Actor is not authorized (thrown by authorize()) |
| PermissionNotFoundError | NOT_FOUND | Referenced permission not in registry |
| DuplicatePermissionError | CONFLICT | Duplicate permission registered |
| RoleNotFoundError | NOT_FOUND | Referenced role not in registry |
| DuplicateRoleError | CONFLICT | Duplicate role registered |
| InvalidPermissionError | VALIDATION_FAILED | Malformed permission string |
| InvalidRoleError | VALIDATION_FAILED | Invalid role definition |
| CircularRoleInheritanceError | VALIDATION_FAILED | Circular role inheritance detected |
| PolicyError | OPERATION_FAILED | Policy evaluation failed |
| PolicyTimeoutError | TIMEOUT | Policy evaluation exceeded timeout |
| PermissionResolverError | OPERATION_FAILED | Permission resolver failed |
| AuthorizationAbortedError | OPERATION_CANCELLED | Authorization cancelled via AbortSignal |

## FULL INTEGRATION EXAMPLE

Complete working example: define roles, create engine, create actor, check permissions, use ability, use HTTP middleware, add caching, and explain mode.

```ts
import {
  createPermissionEngine,
  createRoleRegistry,
  createAbility,
  createMemoryPermissionCache,
  createActorMiddleware,
  authorize,
  isOwner,
  allOf,
} from "@zudojs/permissions";

// 1. Define roles
const roleRegistry = createRoleRegistry();
roleRegistry.define({
  name: "admin",
  permissions: ["*:*"],
  description: "Full system access",
  system: true,
});
roleRegistry.define({
  name: "editor",
  permissions: ["post:create", "post:update", "post:read"],
  inherits: ["viewer"],
});
roleRegistry.define({
  name: "viewer",
  permissions: ["post:read", "comment:read"],
});

// 2. Create the engine — pass the registry itself, not roleRegistry.all(),
//    so the engine subscribes and a revoked role invalidates the cache.
const engine = createPermissionEngine({
  roles: roleRegistry,
  policyTimeout: 5000,
  cache: createMemoryPermissionCache({ defaultTtlMs: 300_000 }),
  cacheTtlMs: 300_000,
});

// 3. Create an actor
const editor = {
  id: "user-1",
  type: "user",
  roles: ["editor"],
};

// 4. Check permissions
const canUpdate = await engine.can(editor, "post:update");
const canDelete = await engine.can(editor, "post:delete");

// 5. Use ability for pre-resolved actor
const ability = engine.createAbility(editor);
if (await ability.can("post:update")) {
  // Update the post
}
try {
  await ability.authorize("post:delete"); // editors cannot delete
} catch (error) {
  // PermissionDeniedError (403, reason "no_matching_rule")
}

// 6. HTTP middleware
const authMiddleware = authorize(engine, "post:update", {
  extractActor: (ctx) => ctx.state.get("permissions:actor"),
});

// 7. Caching is the engine's job — the cache went in at step 2. Checks are
//    served from it automatically; these are the two ways out of it.
await engine.can(editor, "post:update", undefined, { skipCache: true });
await engine.invalidateActor(editor.id);

// 8. Explain mode
const explanation = await engine.explain(editor, "post:update");
console.log(explanation.steps);
// [
//   { type: "role", detail: "Role: editor", matched: true },
//   { type: "permission", detail: "Permission: post:update", matched: true },
//   { type: "rule", detail: "Rule allow: post:update", matched: true },
//   { type: "permission", detail: "Decision: allow (role_permission)", matched: true }
// ]
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/permissions` exports from its package root at v1.5.0 — **152** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 152 exports**

Classes (14)

`AuthorizationAbortedError` `CircularRoleInheritanceError` `DuplicatePermissionError` `DuplicatePolicyError` `DuplicateRoleError` `InvalidPermissionError` `InvalidRoleError` `PermissionDeniedError` `PermissionError` `PermissionNotFoundError` `PermissionResolverError` `PolicyError` `PolicyTimeoutError` `RoleNotFoundError`

Functions (69)

`actorCacheDigest` `actorHasPermission` `actorHasRole` `allOf` `always` `anyOf` `assertNotAborted` `authorize` `buildPermission` `compileRules` `createAbility` `createActor` `createActorMiddleware` `createCacheKey` `createForbiddenResponse` `createJsonResponse` `createMemoryPermissionCache` `createMemoryPermissionResolver` `createMemoryRoleResolver` `createNotFoundResponse` `createPermissionActor` `createPermissionEngine` `createPermissionEventEmitter` `createPermissionRegistry` `createPolicyRegistry` `createRequirePermissionMiddleware` `createRequirePermissionsMiddleware` `createRoleRegistry` `createStaticPermissionResolver` `createStaticRoleResolver` `createUnauthorizedResponse` `evaluate` `evaluatePolicies` `evaluateRules` `evaluateRulesSync` `evaluateWithExplain` `evaluateWithTrace` `extractAction` `extractResource` `findMatchingRules` `formatPermission` `isOwner` `isSystemActor` `isValidPermission` `loadResource` `matches` `matchesPermission` `memoizeRoleLookup` `metadataEquals` `never` `not` `parsePermission` `parsePermissionSafe` `patternStrMatches` `permissionCacheKey` `permissionsOverlap` `policyGrants` `refuseMissingResource` `resolveActorGrants` `resolveActorPermissions` `resolveRolePermissions` `resourceEquals` `ruleMatches` `selectPolicies` `tenantIsolation` `toMetadataMap` `toPermissionString` `withObservability` `withTimeout`

Interfaces (48)

`Ability` `ActorMiddlewareOptions` `AuthorizationOptions` `AuthorizeMiddlewareOptions` `DeniedResponseOptions` `EvaluatorOptions` `ExplainResult` `ExplainStep` `HttpMiddlewareContext` `HttpMiddlewareState` `HttpRequestContext` `HttpResponseContext` `MemoryPermissionCacheOptions` `MissingResourceOptions` `MissingResourceRefusal` `NotFoundResponseOptions` `Permission` `PermissionActor` `PermissionCache` `PermissionCheckEvent` `PermissionContext` `PermissionDecision` `PermissionEngine` `PermissionEngineOptions` `PermissionEventEmitter` `PermissionEventEmitterOptions` `PermissionPolicyDefinition` `PermissionRegistry` `PermissionRegistryOptions` `PermissionResolver` `PermissionRule` `PolicyOutcome` `PolicyRegistry` `PolicyRegistryOptions` `PolicySource` `RegisteredPermission` `RequirePermissionMiddlewareOptions` `RequirePermissionsMiddlewareOptions` `ResolvedGrants` `RoleDefinition` `RoleRegistry` `RoleRegistryOptions` `RoleResolution` `RoleResolutionOptions` `RoleResolver` `RoleSource` `RuleEvaluation` `RuleIndex`

Type aliases (14)

`HttpMiddleware` `HttpMiddlewareOutcome` `HttpRequestBag` `MissingResourceMode` `PermissionConditionFn` `PermissionEventHandler` `PermissionHttpResponse` `PermissionString` `PolicyEffect` `ResourceExtractor` `ResourceOutcome` `RuleCombiningAlgorithm` `RuleEffect` `TypedPermissionString`

Constants (7)

`ACTOR_STATE_KEY` `DECISION_STATE_KEY` `DECISIONS_STATE_KEY` `DEFAULT_POLICY_EFFECT` `MAX_ACTOR_DIGEST_LENGTH` `RESOURCE_ERROR_DECISION` `RESOURCE_NOT_FOUND_DECISION`
