/**
 * Audit round 11 regressions for @zudojs/permissions.
 *
 * Both findings are cache-invalidation gaps, so every assertion here is on
 * the *decision* a caller gets back after a revocation — never on the cache's
 * internals.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import type {
  PermissionActor,
  PermissionResolver,
  PermissionRule,
} from "../src/permissionTypes/index.js";
import { createPermissionEngine } from "../src/evaluator/index.js";
import { createPermissionRegistry } from "../src/permission/index.js";
import { createMemoryPermissionCache } from "../src/cache/index.js";

const ada: PermissionActor = { id: "ada", permissions: ["post:admin"] };

describe("SEC-02 — a revoked implication stops granting immediately", () => {
  it("re-checks after the implication is removed from the registry", async () => {
    const permissions = createPermissionRegistry();
    permissions.define("post:admin", { implies: ["post:delete"] });

    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      expandImplied: permissions,
    });

    expect(await engine.can(ada, "post:delete")).toBe(true);

    permissions.remove("post:admin");

    expect(await engine.can(ada, "post:delete")).toBe(false);
    expect(
      await engine.can(ada, "post:delete", undefined, { skipCache: true }),
    ).toBe(false);
  });

  it("re-checks when the implication is redefined away", async () => {
    const permissions = createPermissionRegistry({ allowOverride: true });
    permissions.define("post:admin", { implies: ["post:delete"] });

    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      expandImplied: permissions,
    });

    expect(await engine.can(ada, "post:delete")).toBe(true);
    permissions.define("post:admin", { implies: [] });
    expect(await engine.can(ada, "post:delete")).toBe(false);
  });

  it("re-checks after clear()", async () => {
    const permissions = createPermissionRegistry();
    permissions.define("post:admin", { implies: ["post:delete"] });

    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      expandImplied: permissions,
    });

    expect(await engine.can(ada, "post:delete")).toBe(true);
    permissions.clear();
    expect(await engine.can(ada, "post:delete")).toBe(false);
  });

  it("the registry exposes a subscribe hook like the role and policy ones", () => {
    const permissions = createPermissionRegistry();
    const seen: string[] = [];
    const unsubscribe = permissions.subscribe(() => seen.push("change"));

    permissions.define("post:admin", { implies: ["post:read"] });
    expect(seen).toHaveLength(1);

    permissions.remove("post:admin");
    expect(seen).toHaveLength(2);

    // A remove that removed nothing is not a change.
    permissions.remove("post:admin");
    expect(seen).toHaveLength(2);

    unsubscribe();
    permissions.define("post:write");
    expect(seen).toHaveLength(2);
  });

  it("a bare expandImplied closure is not cached rather than cached stale", async () => {
    const permissions = createPermissionRegistry();
    permissions.define("post:admin", { implies: ["post:delete"] });

    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      expandImplied: (permission) => permissions.expandImplied(permission),
    });

    expect(await engine.can(ada, "post:delete")).toBe(true);
    permissions.remove("post:admin");
    expect(await engine.can(ada, "post:delete")).toBe(false);
  });

  it("leaves an engine with no implication source caching as before", async () => {
    const cache = createMemoryPermissionCache({ defaultTtlMs: 60_000 });
    const engine = createPermissionEngine({
      cache,
      cacheTtlMs: 60_000,
    });
    const actor: PermissionActor = { id: "bob", permissions: ["post:read"] };

    expect(await engine.can(actor, "post:read")).toBe(true);
    expect(cache.size()).toBeGreaterThan(0);
  });
});

describe("SEC-03 — a withdrawn resolver grant stops answering", () => {
  /** A resolver whose answer the test can change mid-flight. */
  function mutableResolver(): {
    resolver: PermissionResolver;
    revoke: () => void;
  } {
    let rules: readonly PermissionRule[] = [
      { effect: "allow", resource: "post", action: "read" },
    ];
    return {
      resolver: {
        async resolvePermissions(): Promise<readonly PermissionRule[]> {
          return rules;
        },
      },
      revoke: () => {
        rules = [];
      },
    };
  }

  const bob: PermissionActor = { id: "bob" };

  it("does not serve a revoked resolver grant from the cache", async () => {
    const { resolver, revoke } = mutableResolver();
    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      permissionResolver: resolver,
    });

    expect(await engine.can(bob, "post:read")).toBe(true);
    revoke();
    expect(await engine.can(bob, "post:read")).toBe(false);
  });

  it("treats a roleResolver the same way", async () => {
    let roles: readonly string[] = ["editor"];
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:read"] }],
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      roleResolver: {
        async resolveRoles(): Promise<readonly string[]> {
          return roles;
        },
      },
    });

    expect(await engine.can(bob, "post:read")).toBe(true);
    roles = [];
    expect(await engine.can(bob, "post:read")).toBe(false);
  });

  it("caches again once resolverCacheKey describes the resolver state", async () => {
    const { resolver, revoke } = mutableResolver();
    let version = "v1";
    let calls = 0;
    const counting: PermissionResolver = {
      async resolvePermissions(actor) {
        calls += 1;
        return resolver.resolvePermissions(actor);
      },
    };
    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      permissionResolver: counting,
      resolverCacheKey: () => version,
    });

    expect(await engine.can(bob, "post:read")).toBe(true);
    expect(await engine.can(bob, "post:read")).toBe(true);
    expect(calls).toBe(1);

    revoke();
    version = "v2";
    expect(await engine.can(bob, "post:read")).toBe(false);
    expect(calls).toBe(2);
  });

  it("leaves an actor uncached when resolverCacheKey cannot describe it", async () => {
    const { resolver, revoke } = mutableResolver();
    const engine = createPermissionEngine({
      cache: createMemoryPermissionCache({ defaultTtlMs: 60_000 }),
      cacheTtlMs: 60_000,
      permissionResolver: resolver,
      resolverCacheKey: () => undefined,
    });

    expect(await engine.can(bob, "post:read")).toBe(true);
    revoke();
    expect(await engine.can(bob, "post:read")).toBe(false);
  });
});

describe("SEC-06 — the README imports only symbols @zudojs/tenancy exports", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  it("no longer imports requireCurrentTenant as a module-level binding", () => {
    expect(readme).not.toContain(
      'import { requireCurrentTenant } from "@zudojs/tenancy"',
    );
  });

  it("uses the context manager, which is where the method lives", () => {
    expect(readme).toContain(
      'import { createContextManager, getDefaultStorage } from "@zudojs/tenancy"',
    );
    expect(readme).toContain("tenancy.requireCurrentTenant().id");
  });

  it("still warns against filling the tenant from a request header", () => {
    expect(readme).toContain("**never from a request header**");
  });
});
