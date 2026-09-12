/**
 * @zudojs/permissions — Round 9 regression tests.
 *
 * One describe block per finding. Each test failed against the code as it
 * stood before the fix.
 */

import { describe, it, expect } from "vitest";

import {
  allOf,
  createMemoryPermissionCache,
  createPermissionActor,
  createPermissionEngine,
  createPermissionRegistry,
  createPolicyRegistry,
  createRoleRegistry,
  isOwner,
  permissionCacheKey,
  PermissionDeniedError,
  tenantIsolation,
} from "../src/index.js";
import type { PermissionRule } from "../src/index.js";

describe("PERMISSIONS-R9-01: an allowing policy cannot override a deny rule", () => {
  const denyLocked: PermissionRule = {
    name: "locked-posts",
    effect: "deny",
    resource: "post",
    action: "update",
  };

  it("keeps the rule's denial when a policy allows the same permission", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [denyLocked],
      policies: [
        {
          name: "editors-welcome",
          permissions: ["post:*"],
          evaluate: () => ({ allowed: true }),
        },
      ],
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });

    const decision = await engine.check(actor, "post:update");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("rule_deny");
    expect(decision.policy).toBe("locked-posts");
    expect(decision.publicReason).toBe("Access denied");
  });

  it("names the denial as a rule denial even with no policy at all", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [denyLocked],
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });

    const decision = await engine.check(actor, "post:update");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("rule_deny");
  });

  it("still lets a policy grant what no rule decided", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      policies: [
        {
          name: "open-door",
          permissions: ["post:update"],
          evaluate: () => ({ allowed: true }),
        },
      ],
    });
    const actor = createPermissionActor("u1", { roles: ["reader"] });

    const decision = await engine.check(actor, "post:update");
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("policy_allow");
  });

  it("applies to a conditional deny rule that held", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [
        {
          name: "locked",
          effect: "deny",
          resource: "post",
          action: "update",
          condition: (context) =>
            Boolean((context.resource as { locked?: boolean }).locked),
        },
      ],
      policies: [
        {
          name: "allow-all-posts",
          permissions: ["post:*"],
          evaluate: () => ({ allowed: true }),
        },
      ],
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });

    expect(await engine.can(actor, "post:update", { locked: true })).toBe(false);
    expect(await engine.can(actor, "post:update", { locked: false })).toBe(true);
  });

  it("surfaces the rule denial through authorize()", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "editor", permissions: ["post:update"] }],
      rules: [denyLocked],
      policies: [
        {
          name: "p",
          permissions: ["*:*"],
          evaluate: () => ({ allowed: true }),
        },
      ],
    });
    const actor = createPermissionActor("u1", { roles: ["editor"] });

    await expect(engine.authorize(actor, "post:update")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});

describe("PERMISSIONS-R9-02: a delimiter inside an id cannot forge a cache key", () => {
  it("gives different triples different keys", () => {
    const forged = permissionCacheKey("u|post:read", "x:y");
    const genuine = permissionCacheKey("u", "post:read", "x:y");
    expect(forged).not.toBe(genuine);

    const forgedResource = permissionCacheKey("u|post:read|a", "x:y");
    const genuineResource = permissionCacheKey("u", "post:read", "a|x:y");
    expect(forgedResource).not.toBe(genuineResource);
  });

  it("leaves ordinary ids in the shape they always had", () => {
    expect(permissionCacheKey("user_1", "post:read")).toBe(
      "actor:user_1|post:read",
    );
    expect(permissionCacheKey("user_1", "post:read", "42")).toBe(
      "actor:user_1|post:read|42",
    );
  });

  it("does not serve one actor's cached allow to another", async () => {
    const cache = createMemoryPermissionCache();
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      cache,
    });
    const reader = createPermissionActor("u", { roles: ["reader"] });
    expect(await engine.can(reader, "post:read", { id: "x:y" })).toBe(true);

    const stranger = createPermissionActor("u|post:read");
    expect(await engine.can(stranger, "x:y")).toBe(false);
  });

  it("still invalidates exactly the actor asked for", async () => {
    const cache = createMemoryPermissionCache();
    const decision = { allowed: true } as const;
    await cache.set(permissionCacheKey("a|b", "post:read"), decision);
    await cache.set(permissionCacheKey("a", "post:read"), decision);

    await cache.invalidateActor("a");
    expect(await cache.get(permissionCacheKey("a", "post:read"))).toBeUndefined();
    expect(await cache.get(permissionCacheKey("a|b", "post:read"))).toEqual(
      decision,
    );
  });
});

describe("PERMISSIONS-R9-03: an Ability reads a live policy registry", () => {
  it("enforces a policy defined after the ability was created", async () => {
    const policies = createPolicyRegistry();
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      policies,
    });
    const actor = createPermissionActor("u1", { roles: ["reader"] });
    const ability = engine.createAbility(actor);

    expect(await ability.can("post:read")).toBe(true);

    policies.define({
      name: "lockdown",
      permissions: ["*:*"],
      evaluate: () => ({ allowed: false, reason: "lockdown" }),
    });

    expect(await engine.can(actor, "post:read")).toBe(false);
    expect(await ability.can("post:read")).toBe(false);
    expect((await ability.check("post:read")).policy).toBe("lockdown");
  });

  it("stops enforcing a policy that was removed", async () => {
    const policies = createPolicyRegistry();
    policies.define({
      name: "lockdown",
      permissions: ["*:*"],
      evaluate: () => ({ allowed: false }),
    });
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      policies,
    });
    const ability = engine.createAbility(
      createPermissionActor("u1", { roles: ["reader"] }),
    );

    expect(await ability.can("post:read")).toBe(false);
    policies.remove("lockdown");
    expect(await ability.can("post:read")).toBe(true);
  });
});

describe("PERMISSIONS-R9-04: registered definitions do not share arrays with the caller", () => {
  it("does not widen a role when the caller mutates its permissions later", async () => {
    const roles = createRoleRegistry();
    const permissions = ["post:read"];
    roles.define({ name: "reader", permissions });
    permissions.push("*:*");

    const engine = createPermissionEngine({ roles });
    const actor = createPermissionActor("u1", { roles: ["reader"] });
    expect(await engine.can(actor, "user:delete")).toBe(false);
    expect(roles.get("reader")?.permissions).toEqual(["post:read"]);
  });

  it("does not widen an inline role either", async () => {
    const permissions = ["post:read"];
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions }],
    });
    permissions.push("*:*");

    const actor = createPermissionActor("u1", { roles: ["reader"] });
    expect(await engine.can(actor, "user:delete")).toBe(false);
  });

  it("does not re-scope a policy when the caller mutates its permissions", async () => {
    const policies = createPolicyRegistry();
    const permissions = ["post:update"];
    policies.define({
      name: "deny-updates",
      permissions,
      evaluate: () => ({ allowed: false }),
    });
    permissions.push("post:read");

    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      policies,
    });
    const actor = createPermissionActor("u1", { roles: ["reader"] });
    expect(await engine.can(actor, "post:read")).toBe(true);
  });
});

describe("PERMISSIONS-R9-README: the README examples run as written", () => {
  it("quick start", async () => {
    const engine = createPermissionEngine({
      roles: [
        { name: "reader", permissions: ["post:read"] },
        { name: "editor", permissions: ["post:update"], inherits: ["reader"] },
        { name: "admin", permissions: ["*:*"] },
      ],
    });
    const actor = createPermissionActor("user_1", { roles: ["editor"] });

    expect(await engine.can(actor, "post:update")).toBe(true);
    expect(await engine.can(actor, "post:read")).toBe(true);
    expect(await engine.can(actor, "user:delete")).toBe(false);

    const restricted = createPermissionActor("user_2", {
      roles: ["admin"],
      deniedPermissions: ["*:delete", "billing.*:read"],
    });
    expect(await engine.can(restricted, "post:delete")).toBe(false);
    expect(await engine.can(restricted, "post:read")).toBe(true);
    expect(await engine.can(restricted, "billing.invoice:read")).toBe(false);
  });

  it("rules and ABAC", async () => {
    const engine = createPermissionEngine({
      roles: [{ name: "member", permissions: [] }],
      rules: [
        {
          name: "own-posts",
          effect: "allow",
          resource: "post",
          action: "update",
          condition: isOwner(),
        },
        {
          name: "locked-posts",
          effect: "deny",
          resource: "post",
          action: "update",
          condition: (context) =>
            Boolean((context.resource as { locked?: boolean }).locked),
        },
      ],
    });
    const actor = createPermissionActor("user_1", { roles: ["member"] });

    expect(await engine.can(actor, "post:update", { ownerId: "user_1" })).toBe(
      true,
    );
    expect(await engine.can(actor, "post:update", { ownerId: "user_9" })).toBe(
      false,
    );
    expect(
      await engine.can(actor, "post:update", { ownerId: "user_1", locked: true }),
    ).toBe(false);

    const tenantEngine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "invoice",
          action: "read",
          condition: allOf(isOwner(), tenantIsolation()),
        },
      ],
    });
    expect(
      await tenantEngine.can(
        actor,
        "invoice:read",
        { ownerId: "user_1", tenantId: "t1" },
        { metadata: { tenantId: "t1" } },
      ),
    ).toBe(true);
  });

  it("registries and implied permissions", async () => {
    const roles = createRoleRegistry();
    roles.define({ name: "reader", permissions: ["post:read"] });
    roles.define({ name: "staff", permissions: [], inherits: ["reader"] });
    const policies = createPolicyRegistry();
    const engine = createPermissionEngine({ roles, policies });

    roles.define({ name: "auditor", permissions: ["audit:read"] });
    engine.invalidateRoles();
    expect(roles.require("auditor").permissions).toEqual(["audit:read"]);
    expect(
      await engine.can(createPermissionActor("a", { roles: ["auditor"] }), "audit:read"),
    ).toBe(true);
    expect(
      await engine.can(createPermissionActor("s", { roles: ["staff"] }), "post:read"),
    ).toBe(true);

    const permissions = createPermissionRegistry();
    permissions.define("post:admin", { implies: ["post:write"] });
    permissions.define("post:write", { implies: ["post:read"] });
    const implied = createPermissionEngine({
      roles: [{ name: "owner", permissions: ["post:admin"] }],
      expandImplied: (permission) => permissions.expandImplied(permission),
    });
    expect(
      await implied.can(createPermissionActor("o", { roles: ["owner"] }), "post:read"),
    ).toBe(true);
  });
});
