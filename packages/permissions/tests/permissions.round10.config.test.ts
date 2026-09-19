import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createPermissionActor,
  createPermissionEngine,
  createPermissionEventEmitter,
  createPolicyRegistry,
  InvalidPermissionError,
  InvalidRoleError,
} from "../src/index.js";

const post = { id: "p1", locked: true };

describe("authz/PERM-05", () => {
  it("rejects malformed policy and rule patterns", () => {
    expect(() =>
      createPermissionEngine({
        policies: [
          { name: "lockdown", permissions: ["post*:*"], evaluate: () => ({ allowed: false }) },
        ],
      }),
    ).toThrow(InvalidPermissionError);
    expect(() =>
      createPermissionEngine({
        rules: [{ effect: "deny", resource: "post*", action: "delete" }],
      }),
    ).toThrow(InvalidPermissionError);
    expect(() =>
      createPermissionEngine({
        roles: [
          {
            name: "r",
            permissions: [],
            rules: [{ effect: "deny", resource: "post*", action: "delete" }],
          },
        ],
      }),
    ).toThrow(InvalidRoleError);
    expect(() =>
      createPolicyRegistry().define({
        name: "lockdown",
        permissions: ["post*:*"],
        evaluate: () => ({ allowed: false }),
      }),
    ).toThrow(InvalidPermissionError);
  });
});

describe("authz/PERM-06", () => {
  it("the README no longer fills tenant metadata from a request header", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).not.toMatch(/tenantId:\s*context\.request\.headers/);
    expect(readme).toMatch(/never from a request header/);
  });
});

describe("authz/PERM-07", () => {
  const roles = [{ name: "editor", permissions: ["post:*"] }];
  const actor = createPermissionActor("u1", { roles: ["editor"] });

  it("a narrower explicit deny refuses a wildcard check", async () => {
    const engine = createPermissionEngine({ roles });
    const denied = createPermissionActor("u1", {
      roles: ["editor"],
      deniedPermissions: ["post:delete"],
    });
    expect(await engine.can(denied, "post:*")).toBe(false);
    expect(await engine.can(denied, "post:read")).toBe(true);
  });

  it("a narrower deny rule or denying policy refuses a wildcard check", async () => {
    const withRule = createPermissionEngine({
      roles,
      rules: [{ effect: "deny", resource: "post", action: "delete" }],
    });
    expect(await withRule.can(actor, "post:*")).toBe(false);
    const withPolicy = createPermissionEngine({
      roles,
      policies: [{ name: "no-delete", permissions: ["post:delete"], evaluate: () => ({ allowed: false }) }],
    });
    expect(await withPolicy.can(actor, "post:*")).toBe(false);
  });

  it("a narrower allowing policy does not grant a wildcard check", async () => {
    const engine = createPermissionEngine({
      policies: [{ name: "reads", permissions: ["post:read"], evaluate: () => ({ allowed: true }) }],
    });
    expect(await engine.can(createPermissionActor("u2"), "post:*")).toBe(false);
  });
});

describe("authz/PERM-09", () => {
  it("explain() emits an audit event on the engine and on an Ability", async () => {
    const emitter = createPermissionEventEmitter();
    const events: string[] = [];
    emitter.on((event) => events.push(`${event.permission}:${event.allowed}`));
    const engine = createPermissionEngine({
      roles: [{ name: "reader", permissions: ["post:read"] }],
      emitter,
    });
    const actor = createPermissionActor("u1", { roles: ["reader"] });
    await engine.explain(actor, "post:read");
    await engine.createAbility(actor).explain("post:delete", post);
    expect(events).toEqual(["post:read:true", "post:delete:false"]);
  });
});
