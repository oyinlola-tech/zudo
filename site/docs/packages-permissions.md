---
title: "@zudojs/permissions — Authorization Engine Documentation"
description: "Complete documentation for @zudojs/permissions — RBAC, ABAC, resource authorization, wildcards, role hierarchy, policies, and abilities."
source: https://zudojs.oyinlola.site/docs/packages-permissions
---

v1.2.0

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

> **Dependencies:** @zudojs/permissions depends on @zudojs/errors only. Its HTTP middleware composes with the @zudojs/http pipeline structurally — the types are mirrored locally — so no dependency or peer on @zudojs/http is declared.

## WHAT IT DOES

`@zudojs/permissions` is a full-featured authorization engine. It provides:

- **RBAC and ABAC** authorization with role-based and attribute-based access control
- **Permission parsing and matching** with resource:action format and wildcard support
- **Role hierarchy** with inheritance chains and circular detection
- **Rule engine** with exact, wildcard, and conditional (ABAC) matching — deny-overrides by default, priority-based on request
- **Policy evaluation** with wildcard matching, timeouts, priority ordering, and fail-closed error handling
- **Ability context** for pre-resolved actors with can/cannot/check/explain
- **Decision caching** keyed by actor, permission and resource, with configurable TTL, size cap and actor-level invalidation
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
| @zudojs/errors | 1.1.0 | Base error classes (AuthorizationError, ErrorCode) |
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
```

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

```ts
import { evaluateRules } from "@zudojs/permissions";

const rules: PermissionRule[] = [
  { effect: "allow", action: "read", resource: "post", priority: 10 },
  { effect: "deny", action: "read", resource: "post", priority: 20 },
];

const result = evaluateRules(rules, { resource: "post", action: "read" });
// { allowed: false, matchedRule: { effect: "deny", priority: 20 } }
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
| isOwner(field?) | Actor owns the resource (checks resource[field] === actor.id) |
| tenantIsolation(aField?, rField?) | Actor and resource share the same tenant |

## POLICIES

### PermissionPolicyDefinition

```ts
interface PermissionPolicyDefinition {
  readonly name: string;
  readonly permissions: readonly string[];
  readonly cacheable?: boolean;
  readonly priority?: number;
  evaluate(context: PermissionContext):
    PermissionDecision | Promise<PermissionDecision>;
}
```

### createPolicyRegistry

```ts
import { createPolicyRegistry } from "@zudojs/permissions";

const policies = createPolicyRegistry();

policies.define({
  name: "business-hours",
  permissions: ["post:publish"],
  priority: 10,
  evaluate(ctx) {
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) {
      return { allowed: false, reason: "Outside business hours" };
    }
    return { allowed: true, reason: "Within business hours" };
  },
});

policies.forPermission("post:publish"); // [business-hours policy]
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
//   { type: "permission", detail: "Rule matched", matched: true }
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

## CACHING

Keys include a digest of the actor's roles, permissions, type and other fields; actors carrying non-plain values are not cached. Role/policy registry changes and `invalidateRoles()` clear the decision cache.

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

// Generate cache key
const key = permissionCacheKey("user-1", "post:update", "post-42");
// "actor:user-1|post:update|post-42"

// Use with engine
const cached = await cache.get(key);
if (cached) {
  // Return cached decision
} else {
  const decision = await engine.check(actor, "post:update", post);
  await cache.set(key, decision, { ttl: 60000 });
}
```

## HTTP MIDDLEWARE

Middleware factories that integrate the authorization engine with `@zudojs/http`'s middleware pipeline.

### Types

```ts
type HttpMiddleware = (
  context: HttpMiddlewareContext,
  next: () => Promise<HttpResponseContext>,
) => void | Response | HttpResponseContext | Promise<void | Response | HttpResponseContext>;

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
interface AuthorizeMiddlewareOptions {
  extractActor(context: HttpMiddlewareContext):
    PermissionActor | Promise<PermissionActor> | undefined;
  readonly authorization?: AuthorizationOptions;
  readonly deniedResponse?: (decision: PermissionDecision) => unknown;
}

interface RequirePermissionMiddlewareOptions extends AuthorizeMiddlewareOptions {
  readonly permission: string;
  readonly extractResource?: (context: HttpMiddlewareContext) => unknown | Promise<unknown>;
}
```

`extractResource` may be async and is awaited; a loader that throws or rejects answers 403. An empty list passed to `createRequirePermissionsMiddleware` denies.

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
  permissionCacheKey,
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

// 2. Create the engine
const engine = createPermissionEngine({
  roles: roleRegistry.all(),
  policyTimeout: 5000,
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
await ability.authorize("post:delete");

// 6. HTTP middleware
const authMiddleware = authorize(engine, "post:update", {
  extractActor: (ctx) => ctx.state.get("permissions:actor"),
});

// 7. Caching
const cache = createMemoryPermissionCache(300000);
const key = permissionCacheKey(editor.id, "post:update");
const cached = await cache.get(key);
if (!cached) {
  const decision = await engine.check(editor, "post:update");
  await cache.set(key, decision, { ttl: 300000 });
}

// 8. Explain mode
const explanation = await engine.explain(editor, "post:update");
console.log(explanation.steps);
// [
//   { type: "role", detail: "Role: editor", matched: true },
//   { type: "permission", detail: "Permission: post:update", matched: true },
//   { type: "permission", detail: "Rule matched", matched: true }
// ]
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/permissions` exports from its package root at v1.2.0 — **139** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 139 exports**

Classes (14)

`AuthorizationAbortedError` `CircularRoleInheritanceError` `DuplicatePermissionError` `DuplicatePolicyError` `DuplicateRoleError` `InvalidPermissionError` `InvalidRoleError` `PermissionDeniedError` `PermissionError` `PermissionNotFoundError` `PermissionResolverError` `PolicyError` `PolicyTimeoutError` `RoleNotFoundError`

Functions (65)

`actorCacheDigest` `actorHasPermission` `actorHasRole` `allOf` `always` `anyOf` `assertNotAborted` `authorize` `buildPermission` `compileRules` `createAbility` `createActor` `createActorMiddleware` `createCacheKey` `createForbiddenResponse` `createJsonResponse` `createMemoryPermissionCache` `createMemoryPermissionResolver` `createMemoryRoleResolver` `createPermissionActor` `createPermissionEngine` `createPermissionEventEmitter` `createPermissionRegistry` `createPolicyRegistry` `createRequirePermissionMiddleware` `createRequirePermissionsMiddleware` `createRoleRegistry` `createStaticPermissionResolver` `createStaticRoleResolver` `createUnauthorizedResponse` `evaluate` `evaluatePolicies` `evaluateRules` `evaluateRulesSync` `evaluateWithExplain` `evaluateWithTrace` `extractAction` `extractResource` `findMatchingRules` `formatPermission` `isOwner` `isSystemActor` `isValidPermission` `loadResource` `matches` `matchesPermission` `memoizeRoleLookup` `metadataEquals` `never` `not` `parsePermission` `parsePermissionSafe` `patternStrMatches` `permissionCacheKey` `permissionsOverlap` `resolveActorGrants` `resolveActorPermissions` `resolveRolePermissions` `resourceEquals` `ruleMatches` `selectPolicies` `tenantIsolation` `toMetadataMap` `withObservability` `withTimeout`

Interfaces (46)

`Ability` `ActorMiddlewareOptions` `AuthorizationOptions` `AuthorizeMiddlewareOptions` `DeniedResponseOptions` `EvaluatorOptions` `ExplainResult` `ExplainStep` `HttpMiddlewareContext` `HttpMiddlewareState` `HttpRequestContext` `HttpResponseContext` `MemoryPermissionCacheOptions` `Permission` `PermissionActor` `PermissionCache` `PermissionCheckEvent` `PermissionContext` `PermissionDecision` `PermissionEngine` `PermissionEngineOptions` `PermissionEventEmitter` `PermissionEventEmitterOptions` `PermissionHttpResponse` `PermissionPolicyDefinition` `PermissionRegistry` `PermissionRegistryOptions` `PermissionResolver` `PermissionRule` `PolicyOutcome` `PolicyRegistry` `PolicyRegistryOptions` `PolicySource` `RegisteredPermission` `RequirePermissionMiddlewareOptions` `RequirePermissionsMiddlewareOptions` `ResolvedGrants` `RoleDefinition` `RoleRegistry` `RoleRegistryOptions` `RoleResolution` `RoleResolutionOptions` `RoleResolver` `RoleSource` `RuleEvaluation` `RuleIndex`

Type aliases (9)

`HttpMiddleware` `HttpRequestBag` `PermissionConditionFn` `PermissionEventHandler` `PermissionString` `ResourceExtractor` `ResourceOutcome` `RuleCombiningAlgorithm` `RuleEffect`

Constants (5)

`ACTOR_STATE_KEY` `DECISION_STATE_KEY` `DECISIONS_STATE_KEY` `MAX_ACTOR_DIGEST_LENGTH` `RESOURCE_ERROR_DECISION`
