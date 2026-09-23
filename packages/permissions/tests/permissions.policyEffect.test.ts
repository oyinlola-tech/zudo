import { describe, expect, it } from "vitest";
import {
  createPermissionActor,
  createPermissionEngine,
  createPolicyRegistry,
  policyGrants,
  type PermissionPolicyDefinition,
  type PolicyEffect,
} from "../src/index.js";

const businessHours = (open: boolean): PermissionPolicyDefinition => ({
  name: "business-hours",
  permissions: ["task:*"],
  cacheable: false,
  evaluate: () =>
    open ? { allowed: true } : { allowed: false, reason: "closed" },
});

const nobody = createPermissionActor("u0");
const worker = createPermissionActor("u1", { roles: ["worker"] });
const roles = [{ name: "worker", permissions: ["task:delete"] }];

describe("security: a policy cannot grant what the roles do not", () => {
  it("denies an actor with no roles even when the policy allows", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [businessHours(true)],
    });

    const decision = await engine.check(nobody, "task:delete");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no_matching_rule");
    expect(await engine.can(nobody, "task:delete")).toBe(false);
    expect(await engine.createAbility(nobody).can("task:delete")).toBe(false);
  });

  it("allows an actor whose role grants the permission when the policy allows", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [businessHours(true)],
    });

    const decision = await engine.check(worker, "task:delete");

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("role_permission");
    expect(decision.policy).toBe("business-hours");
  });

  it("still lets the policy deny an actor whose role grants the permission", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [businessHours(false)],
    });

    const decision = await engine.check(worker, "task:delete");

    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("business-hours");
  });

  it("treats an unrecognised effect as constraining", async () => {
    const engine = createPermissionEngine({
      policies: [
        {
          ...businessHours(true),
          effect: "grants" as unknown as PolicyEffect,
        },
      ],
    });

    expect(await engine.can(nobody, "task:delete")).toBe(false);
  });

  it("applies to registry-backed policies too", async () => {
    const policies = createPolicyRegistry();
    const engine = createPermissionEngine({ roles, policies });
    policies.define(businessHours(true));

    expect(await engine.can(nobody, "task:delete")).toBe(false);
    expect(await engine.can(worker, "task:delete")).toBe(true);
  });
});

describe("opting in to a policy that grants", () => {
  const owner: PermissionPolicyDefinition = {
    name: "owner",
    permissions: ["post:update"],
    effect: "grant",
    evaluate: (context) => ({
      allowed:
        (context.resource as { ownerId?: string } | undefined)?.ownerId ===
        context.actor.id,
    }),
  };

  it("grants with effect: 'grant' and no role", async () => {
    const engine = createPermissionEngine({ policies: [owner] });

    const decision = await engine.check(nobody, "post:update", {
      ownerId: "u0",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("policy_allow");
    expect(
      await engine.can(nobody, "post:update", { ownerId: "someone-else" }),
    ).toBe(false);
  });

  it("restores the old behaviour engine-wide with defaultPolicyEffect: 'grant'", async () => {
    const engine = createPermissionEngine({
      roles,
      policies: [businessHours(true)],
      defaultPolicyEffect: "grant",
    });

    const decision = await engine.check(nobody, "task:delete");

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("policy_allow");
  });

  it("lets a policy's own effect override the engine default", async () => {
    const engine = createPermissionEngine({
      policies: [{ ...businessHours(true), effect: "constrain" }],
      defaultPolicyEffect: "grant",
    });

    expect(await engine.can(nobody, "task:delete")).toBe(false);
  });

  it("never lets a grant override another policy's denial", async () => {
    const engine = createPermissionEngine({
      policies: [
        { ...owner, permissions: ["task:delete"] },
        businessHours(false),
      ],
    });

    expect(await engine.can(nobody, "task:delete", { ownerId: "u0" })).toBe(
      false,
    );
  });

  it("never lets a grant override an explicit deny", async () => {
    const engine = createPermissionEngine({ policies: [owner] });
    const denied = createPermissionActor("u0", {
      deniedPermissions: ["post:update"],
    });

    expect(await engine.can(denied, "post:update", { ownerId: "u0" })).toBe(
      false,
    );
  });

  it("exposes the effect resolution", () => {
    expect(policyGrants(owner)).toBe(true);
    expect(policyGrants(businessHours(true))).toBe(false);
    expect(policyGrants(businessHours(true), "grant")).toBe(true);
  });
});
