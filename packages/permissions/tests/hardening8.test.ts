/**
 * Regression coverage for the round-8 audit findings (PERM8-xx).
 *
 * Everything here is pinned by behaviour a caller can observe: an
 * authorization engine that regresses silently is the worst kind.
 */

import { describe, it, expect } from "vitest";

import {
  createPermissionEngine,
  createPermissionActor,
  createRoleRegistry,
  createPolicyRegistry,
  createMemoryPermissionCache,
  matches,
  isOwner,
  tenantIsolation,
  DuplicatePolicyError,
  RoleNotFoundError,
  PolicyError,
  InvalidPermissionError,
  InvalidRoleError,
} from "../src/index.js";
import type { RoleDefinition } from "../src/index.js";

const ROLES: readonly RoleDefinition[] = [
  { name: "reader", permissions: ["post:read"] },
  { name: "admin", permissions: ["*:*"] },
];

// ─── PERM8-01 · Decision cache identity ────────────────────────────────────

describe("decision cache identity", () => {
  it("does not answer for a second resource that carries no id (PERM8-01)", async () => {
    const engine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "post",
          action: "update",
          condition: isOwner(),
        },
      ],
      cache: createMemoryPermissionCache(),
    });

    const ada = createPermissionActor("ada");
    // Neither resource has an `id`, so neither can be keyed. The README's own
    // example is shaped exactly like this.
    expect(await engine.can(ada, "post:update", { ownerId: "ada" })).toBe(true);
    expect(await engine.can(ada, "post:update", { ownerId: "bob" })).toBe(
      false,
    );
  });

  it("still caches when an explicit resourceId is supplied (PERM8-01)", async () => {
    let evaluations = 0;
    const engine = createPermissionEngine({
      roles: ROLES,
      cache: createMemoryPermissionCache(),
      policies: [
        {
          name: "counter",
          permissions: ["post:read"],
          evaluate: () => {
            evaluations++;
            return { allowed: true };
          },
        },
      ],
    });

    const ada = createPermissionActor("ada", { roles: ["reader"] });
    const post = { ownerId: "ada" };
    await engine.can(ada, "post:read", post, { resourceId: "post-1" });
    await engine.can(ada, "post:read", post, { resourceId: "post-1" });
    expect(evaluations).toBe(1);
  });

  it("does not let one tenant's decision answer for another (PERM8-01)", async () => {
    const engine = createPermissionEngine({
      rules: [
        {
          effect: "allow",
          resource: "invoice",
          action: "read",
          condition: tenantIsolation(),
        },
      ],
      cache: createMemoryPermissionCache(),
    });

    const ada = createPermissionActor("ada");
    const invoice = { id: "inv-1", tenantId: "acme" };

    expect(
      await engine.can(ada, "invoice:read", invoice, {
        metadata: { tenantId: "acme" },
      }),
    ).toBe(true);
    expect(
      await engine.can(ada, "invoice:read", invoice, {
        metadata: { tenantId: "globex" },
      }),
    ).toBe(false);
  });
});

// ─── PERM8-02 · Denies beat the cache ──────────────────────────────────────

describe("explicit denies", () => {
  it("beat a decision already in the cache (PERM8-02)", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      cache: createMemoryPermissionCache(),
    });

    const before = createPermissionActor("ada", { roles: ["admin"] });
    expect(await engine.can(before, "post:delete")).toBe(true);

    const after = createPermissionActor("ada", {
      roles: ["admin"],
      deniedPermissions: ["post:delete"],
    });
    const decision = await engine.check(after, "post:delete");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("explicit_deny");
  });

  it("reports a malformed deny instead of dropping it silently (PERM8-03)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roles: ROLES,
      onError: (error) => errors.push(error),
    });

    const ada = createPermissionActor("ada", {
      roles: ["admin"],
      // No action segment, so it can never match — and used to be ignored in
      // total silence while reading as a deny.
      deniedPermissions: ["post"],
    });

    expect(await engine.can(ada, "post:delete")).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(InvalidPermissionError);
  });
});

// ─── PERM8-04 · Configuration validation reaches a role source ─────────────

describe("role source validation", () => {
  it("rejects a malformed grant from a registry too (PERM8-04)", async () => {
    const registry = createRoleRegistry({ validatePermissions: false });
    registry.define({ name: "broken", permissions: ["post"] });

    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roles: registry,
      onError: (error) => errors.push(error),
    });

    const ada = createPermissionActor("ada", { roles: ["broken"] });
    expect(await engine.can(ada, "post:read")).toBe(false);
    expect(errors[0]).toBeInstanceOf(InvalidRoleError);
  });

  it("can still be turned off (PERM8-04)", async () => {
    const registry = createRoleRegistry({ validatePermissions: false });
    registry.define({ name: "broken", permissions: ["post"] });

    const engine = createPermissionEngine({
      roles: registry,
      validateConfiguration: false,
    });
    const ada = createPermissionActor("ada", { roles: ["broken"] });
    // The grant is nonsense either way, so the check denies — but it denies
    // by not matching, not by rejecting the role.
    expect(await engine.can(ada, "post:read")).toBe(false);
  });
});

// ─── PERM8-05 · A role cycle denies rather than throwing ───────────────────

describe("role hierarchy cycle", () => {
  it("denies and reports instead of throwing out of the check (PERM8-05)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roles: [
        { name: "a", permissions: ["post:read"], inherits: ["b"] },
        { name: "b", permissions: [], inherits: ["a"] },
      ],
      onError: (error) => errors.push(error),
    });

    const ada = createPermissionActor("ada", { roles: ["a"] });
    const decision = await engine.check(ada, "post:read");
    expect(decision.allowed).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("denies when the role source itself throws (PERM8-05)", async () => {
    const engine = createPermissionEngine({
      roles: {
        get: () => {
          throw new Error("role store unreachable");
        },
      },
    });

    const ada = createPermissionActor("ada", { roles: ["reader"] });
    expect(await engine.can(ada, "post:read")).toBe(false);
  });
});

// ─── PERM8-06 · Registries reject silent replacement ───────────────────────

describe("policy registry", () => {
  it("rejects a duplicate policy name (PERM8-06)", () => {
    const policies = createPolicyRegistry();
    policies.define({
      name: "owner-only",
      permissions: ["post:*"],
      evaluate: () => ({ allowed: false }),
    });

    expect(() =>
      policies.define({
        name: "owner-only",
        permissions: ["post:*"],
        evaluate: () => ({ allowed: true }),
      }),
    ).toThrow(DuplicatePolicyError);
  });

  it("allows replacement when asked for (PERM8-06)", () => {
    const policies = createPolicyRegistry({ allowOverride: true });
    policies.define({
      name: "p",
      permissions: ["post:*"],
      evaluate: () => ({ allowed: false }),
    });
    policies.define({
      name: "p",
      permissions: ["post:read"],
      evaluate: () => ({ allowed: true }),
    });
    expect(policies.get("p")?.permissions).toEqual(["post:read"]);
  });

  it("selects the same policies the engine would (PERM8-06)", () => {
    const policies = createPolicyRegistry();
    policies.define({
      name: "low",
      permissions: ["post:*"],
      priority: 1,
      evaluate: () => ({ allowed: true }),
    });
    policies.define({
      name: "high",
      permissions: ["post:read"],
      priority: 10,
      evaluate: () => ({ allowed: true }),
    });
    expect(policies.forPermission("post:read").map((p) => p.name)).toEqual([
      "high",
      "low",
    ]);
    expect(policies.forPermission("user:read")).toHaveLength(0);
  });
});

// ─── PERM8-07 · RoleNotFoundError is reachable ─────────────────────────────

describe("role registry require()", () => {
  it("throws RoleNotFoundError for an unregistered role (PERM8-07)", () => {
    const registry = createRoleRegistry();
    registry.define({ name: "reader", permissions: ["post:read"] });
    expect(registry.require("reader").name).toBe("reader");
    expect(() => registry.require("ghost")).toThrow(RoleNotFoundError);
  });
});

// ─── PERM8-08 · A non-Error throw still reaches onError as an Error ────────

describe("policy failures", () => {
  it("wraps a non-Error throw in a PolicyError (PERM8-08)", async () => {
    const errors: unknown[] = [];
    const engine = createPermissionEngine({
      roles: ROLES,
      onError: (error) => errors.push(error),
      policies: [
        {
          name: "rude",
          permissions: ["post:read"],
          evaluate: () => {
            // eslint-disable-next-line no-throw-literal
            throw "nope";
          },
        },
      ],
    });

    expect(
      await engine.can(
        createPermissionActor("ada", { roles: ["reader"] }),
        "post:read",
      ),
    ).toBe(false);
    expect(errors[0]).toBeInstanceOf(PolicyError);
    expect((errors[0] as PolicyError).cause).toBe("nope");
  });
});

// ─── Matcher adversaries ───────────────────────────────────────────────────

describe("permission matching adversaries", () => {
  it("does not let a prefix stand in for a name", () => {
    expect(matches("admin:read", "administrator:read")).toBe(false);
    expect(matches("admin:*", "administrator:read")).toBe(false);
    expect(matches("post:read", "post:readonly")).toBe(false);
  });

  it("keeps a segment wildcard inside its segment", () => {
    // `user:*` is an action wildcard on `user`; it cannot reach a deeper
    // namespace, which is what `user.*:*` is for.
    expect(matches("user:*", "user.profile:delete")).toBe(false);
    expect(matches("user.*:*", "user.profile:delete")).toBe(true);
    expect(matches("user:*", "user:delete")).toBe(true);
  });

  it("lets a deny rule beat a matching allow", async () => {
    const engine = createPermissionEngine({
      roles: ROLES,
      rules: [
        { effect: "deny", resource: "post", action: "read", priority: -100 },
      ],
    });
    expect(
      await engine.can(
        createPermissionActor("ada", { roles: ["admin"] }),
        "post:read",
      ),
    ).toBe(false);
  });
});
