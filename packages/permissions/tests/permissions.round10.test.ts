import { describe, expect, it, vi } from "vitest";
import {
  createMemoryPermissionCache,
  createPermissionActor,
  createPermissionEngine,
  createPolicyRegistry,
  createRoleRegistry,
  evaluateRules,
  type RoleDefinition,
} from "../src/index.js";

describe("authz/PERM-01", () => {
  const lockedPosts = {
    name: "locked-posts",
    effect: "deny" as const,
    resource: "post",
    action: "update",
    condition: (context: { resource?: unknown }) =>
      Boolean((context.resource as { locked: boolean }).locked),
  };

  it("denies when a deny rule's condition throws, and reports it", async () => {
    const onError = vi.fn();
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [lockedPosts],
      onError,
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });
    const decision = await engine.check(actor, "post:update");
    expect(decision).toMatchObject({ allowed: false, reason: "rule_deny" });
    expect(onError).toHaveBeenCalledWith(
      expect.any(TypeError),
      "RuleCondition.locked-posts",
    );
  });

  it("does not cache a decision forced by a throwing condition", async () => {
    let serviceDown = true;
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [
        {
          name: "suspended",
          effect: "deny",
          resource: "post",
          action: "update",
          condition: async () => {
            if (serviceDown) throw new Error("suspension service down");
            return false;
          },
        },
      ],
      cache: createMemoryPermissionCache(),
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });
    expect(await engine.can(actor, "post:update")).toBe(false);
    serviceDown = false;
    expect(await engine.can(actor, "post:update")).toBe(true);
  });

  it("applies a conditional deny when evaluateRules has no context", async () => {
    const result = await evaluateRules(
      [
        { effect: "allow", resource: "post", action: "update" },
        { ...lockedPosts },
      ],
      { resource: "post", action: "update" },
    );
    expect(result.allowed).toBe(false);
  });
});

describe("authz/PERM-02", () => {
  const roles: RoleDefinition[] = [
    { name: "admin", permissions: ["invoice:delete"] },
    { name: "viewer", permissions: ["invoice:read"] },
  ];

  it("keys cached decisions on the actor's grants, not only its id", async () => {
    const engine = createPermissionEngine({
      roles,
      cache: createMemoryPermissionCache(),
    });
    const tenantA = createPermissionActor("u1", { roles: ["admin"] });
    const tenantB = createPermissionActor("u1", { roles: ["viewer"] });
    const demoted = createPermissionActor("u1", { roles: [] });
    expect(await engine.can(tenantA, "invoice:delete")).toBe(true);
    expect(await engine.can(tenantB, "invoice:delete")).toBe(false);
    expect(await engine.can(demoted, "invoice:delete")).toBe(false);
    expect(await engine.can({ id: "u1", permissions: ["invoice:*"] }, "invoice:delete")).toBe(true);
    expect(await engine.can({ id: "u1" }, "invoice:delete")).toBe(false);
  });

  it("does not cache an actor the digest cannot describe", async () => {
    const cache = createMemoryPermissionCache();
    const engine = createPermissionEngine({ roles, cache });
    const actor = { id: "u1", roles: ["admin"], load: () => 1 };
    expect(await engine.can(actor, "invoice:delete")).toBe(true);
    expect(cache.size()).toBe(0);
  });
});

describe("authz/PERM-04", () => {
  it("revokes a role removed from a live registry, cached or not", async () => {
    const registry = createRoleRegistry();
    registry.define({ name: "ops", permissions: ["server:restart"] });
    const engine = createPermissionEngine({
      roles: registry,
      cache: createMemoryPermissionCache(),
    });
    const actor = createPermissionActor("u1", { roles: ["ops"] });
    expect(await engine.can(actor, "server:restart")).toBe(true);
    registry.remove("ops");
    expect(await engine.can(actor, "server:restart")).toBe(false);
  });

  it("invalidateRoles() also drops cached decisions for a custom source", async () => {
    const table = new Map<string, RoleDefinition>([
      ["ops", { name: "ops", permissions: ["server:restart"] }],
    ]);
    const engine = createPermissionEngine({
      roles: { get: (name) => table.get(name) },
      cache: createMemoryPermissionCache(),
    });
    const actor = createPermissionActor("u1", { roles: ["ops"] });
    expect(await engine.can(actor, "server:restart")).toBe(true);
    table.delete("ops");
    engine.invalidateRoles();
    expect(await engine.can(actor, "server:restart")).toBe(false);
  });

  it("a policy added to a live registry is not bypassed by the cache", async () => {
    const policies = createPolicyRegistry();
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      policies,
      cache: createMemoryPermissionCache(),
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });
    expect(await engine.can(actor, "post:update")).toBe(true);
    policies.define({
      name: "lockdown",
      permissions: ["*:*"],
      evaluate: () => ({ allowed: false }),
    });
    expect(await engine.can(actor, "post:update")).toBe(false);
  });
});
