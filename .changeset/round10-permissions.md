---
"@zudojs/permissions": minor
---

Round 10 fixes.

- **PERM-01 (security, fail-closed):** a deny rule whose condition throws, or that has a condition but no context, now *applies* (denied, `rule_deny`), instead of being skipped so the role's allow won. Allow rules keep failing closed by not applying. The error goes to `onError`, and a decision forced by a throwing condition is not cached. `evaluateRulesSync` applies a conditional deny for the same reason.
- **PERM-02 (security):** the decision-cache key now carries a digest of everything the actor carries besides its id (`roles`, `permissions`, `type`, any other field). The same id with different roles (another tenant's token, a demoted token) no longer gets a cached allow. An actor the digest cannot describe (function, class instance, `Map`) is not cached. New exports: `actorCacheDigest`, `MAX_ACTOR_DIGEST_LENGTH`. `permissionCacheKey` takes an optional fourth `scope` argument.
- **PERM-03 (security):** the HTTP guards `await` `extractResource`. A loader that throws or rejects answers 403 (`reason: "resource_error"`) and reports through the new `onError` middleware option; it no longer lets the request through or leaks an unhandled rejection. New exports: `loadResource`, `RESOURCE_ERROR_DECISION`, `ResourceExtractor`, `ResourceOutcome`.
- **PERM-04 (security):** `createRoleRegistry()` and `createPolicyRegistry()` gain `subscribe(listener)`. An engine subscribes to the registries it is given; any `define` / `remove` / `clear` drops memoized roles and every cached decision (a configuration generation is part of the cache key, and `cache.clear()` is called). `invalidateRoles()` now also drops cached decisions.
- **PERM-05 (security):** malformed patterns are rejected in static rules, role rules, and policy `permissions` — at engine construction (`validateConfiguration`), in `createPolicyRegistry().define` (new `validatePermissions` option, default `true`), in `createRoleRegistry().define` for role rules, and lazily for custom policy sources.
- **PERM-06 (docs):** the README no longer fills `tenantIsolation()` metadata from a request header; it reads the tenant `@zudojs/tenancy` verified.
- **PERM-07 (security):** a wildcard check (`can(actor, "post:*")`) is refused by any narrower deny: `deniedPermissions`, a deny rule, or a policy scoped to a narrower permission (such a policy can deny a wildcard check but not grant it). New export: `permissionsOverlap`.
- **PERM-08 (security):** `createRequirePermissionsMiddleware` with an empty permission list denies (403) in both modes.
- **PERM-09:** `explain()` on the engine and on an Ability emits an audit event, like `check()`.
- **cross/CV-01:** removed the `@zudojs/http` peer dependency (http is a higher tier; nothing imported it). The mirrored request type now accepts plain-object headers/params/query as `@zudojs/http` provides them (`HttpRequestBag`), plus optional `getHeader` / `getParam`.

Behaviour changes: throwing deny conditions deny; fewer cache hits for actors whose grants differ; resource-loader failures deny; registry changes and `invalidateRoles()` clear the decision cache; malformed rule/policy patterns throw at construction/`define`; wildcard checks honour narrower denies; empty permission lists deny; `explain()` emits audit events; the Ability's events now include `resourceType`.
