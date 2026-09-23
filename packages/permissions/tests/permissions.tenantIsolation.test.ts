import { describe, expect, it } from "vitest";
import {
  createPermissionActor,
  createPermissionEngine,
  not,
  tenantIsolation,
  type PermissionPolicyDefinition,
} from "../src/index.js";

const accountant = createPermissionActor("u1", { roles: ["accountant"] });
const roles = [{ name: "accountant", permissions: ["invoice:read"] }];
const ownInvoice = { id: "i1", tenantId: "acme" };
const foreignInvoice = { id: "i2", tenantId: "globex" };
const inAcme = { metadata: { tenantId: "acme" } };

const isolation = {
  name: "tenant-isolation",
  effect: "deny" as const,
  resource: "invoice",
  action: "*",
  condition: not(tenantIsolation()),
};

describe("security: tenant isolation as a deny rule (README pattern)", () => {
  const engine = createPermissionEngine({ roles, rules: [isolation] });

  it("allows the role inside its own tenant", async () => {
    expect(await engine.can(accountant, "invoice:read", ownInvoice, inAcme)).toBe(
      true,
    );
  });

  it("refuses the role across tenants even though the role grants it", async () => {
    const decision = await engine.check(
      accountant,
      "invoice:read",
      foreignInvoice,
      inAcme,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("rule_deny");
  });

  it("refuses when no tenant was supplied", async () => {
    expect(await engine.can(accountant, "invoice:read", ownInvoice)).toBe(false);
  });

  it("is not overridden by an allowing policy, constraining or granting", async () => {
    const open = (effect: "constrain" | "grant"): PermissionPolicyDefinition => ({
      name: `open-${effect}`,
      permissions: ["invoice:*"],
      effect,
      evaluate: () => ({ allowed: true }),
    });
    for (const effect of ["constrain", "grant"] as const) {
      const withPolicy = createPermissionEngine({
        roles,
        rules: [isolation],
        policies: [open(effect)],
      });
      expect(
        await withPolicy.can(accountant, "invoice:read", foreignInvoice, inAcme),
      ).toBe(false);
      expect(
        await withPolicy.can(accountant, "invoice:read", ownInvoice, inAcme),
      ).toBe(true);
    }
  });

  it("documents the pitfall: a conditional allow rule does not stop a role", async () => {
    const pitfall = createPermissionEngine({
      roles,
      rules: [
        {
          name: "tenant-allow",
          effect: "allow",
          resource: "invoice",
          action: "read",
          condition: tenantIsolation(),
        },
      ],
    });

    expect(
      await pitfall.can(accountant, "invoice:read", foreignInvoice, inAcme),
    ).toBe(true);
  });
});
