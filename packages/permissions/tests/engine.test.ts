import { describe, it, expect } from "vitest";
import { createPermissionEngine, createAbility } from "../src/index.js";
import type { PermissionActor } from "../src/index.js";

const admin: PermissionActor = { id: "admin_1", roles: ["admin"] };
const editor: PermissionActor = { id: "editor_1", roles: ["editor"] };
const reader: PermissionActor = { id: "reader_1", roles: ["reader"] };
const nobody: PermissionActor = { id: "nobody_1" };

const roles = [
  { name: "admin", permissions: ["*:*"] },
  { name: "editor", permissions: ["post:read", "post:update", "post:create"] },
  { name: "reader", permissions: ["post:read"] },
];

describe("createPermissionEngine", () => {
  const engine = createPermissionEngine({ roles });

  describe("can", () => {
    it("returns true when actor has permission", async () => {
      expect(await engine.can(admin, "post:delete")).toBe(true);
    });

    it("returns false when actor lacks permission", async () => {
      expect(await engine.can(reader, "post:delete")).toBe(false);
    });

    it("returns false for actor with no roles", async () => {
      expect(await engine.can(nobody, "post:read")).toBe(false);
    });

    it("supports wildcard permissions", async () => {
      expect(await engine.can(admin, "anything:goes")).toBe(true);
    });
  });

  describe("check", () => {
    it("returns full decision object", async () => {
      const decision = await engine.check(admin, "post:read");
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBeDefined();
    });

    it("returns deny reason", async () => {
      const decision = await engine.check(reader, "post:delete");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBeDefined();
    });
  });

  describe("authorize", () => {
    it("does not throw when allowed", async () => {
      await expect(
        engine.authorize(admin, "post:read"),
      ).resolves.toBeUndefined();
    });

    it("throws when denied", async () => {
      await expect(engine.authorize(reader, "post:delete")).rejects.toThrow();
    });
  });

  describe("explain", () => {
    it("returns explanation steps", async () => {
      const result = await engine.explain(admin, "post:read");
      expect(result.allowed).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("explains denial", async () => {
      const result = await engine.explain(reader, "post:delete");
      expect(result.allowed).toBe(false);
      expect(result.steps.some((s) => !s.matched)).toBe(true);
    });
  });

  describe("explicit deny", () => {
    it("denies when permission is in deniedPermissions", async () => {
      const actor: PermissionActor = {
        id: "user_1",
        roles: ["admin"],
        deniedPermissions: ["post:delete"],
      };
      const decision = await engine.check(actor, "post:delete");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("explicit_deny");
    });

    it("denies wildcard deny", async () => {
      const actor: PermissionActor = {
        id: "user_1",
        roles: ["admin"],
        deniedPermissions: ["post:*"],
      };
      const decision = await engine.check(actor, "post:delete");
      expect(decision.allowed).toBe(false);
    });
  });

  describe("policies", () => {
    it("allows when policy returns allow", async () => {
      const engineWithPolicy = createPermissionEngine({
        roles,
        policies: [
          {
            name: "owner-only",
            permissions: ["post:update"],
            evaluate: (ctx) => ({
              allowed:
                ctx.actor.id ===
                (ctx.resource as Record<string, unknown>)?.authorId,
            }),
          },
        ],
      });

      const post = { authorId: "editor_1" };
      expect(await engineWithPolicy.can(editor, "post:update", post)).toBe(
        true,
      );
    });

    it("denies when policy returns deny", async () => {
      const engineWithPolicy = createPermissionEngine({
        roles,
        policies: [
          {
            name: "owner-only",
            permissions: ["post:update"],
            evaluate: (ctx) => ({
              allowed:
                ctx.actor.id ===
                (ctx.resource as Record<string, unknown>)?.authorId,
            }),
          },
        ],
      });

      const post = { authorId: "other_user" };
      expect(await engineWithPolicy.can(editor, "post:update", post)).toBe(
        false,
      );
    });
  });
});

describe("createAbility", () => {
  const ability = createAbility(admin, {
    getRole: (name) => roles.find((r) => r.name === name),
  });

  it("returns true for can()", async () => {
    expect(await ability.can("post:read")).toBe(true);
  });

  it("returns false for cannot()", async () => {
    expect(await ability.cannot("post:read")).toBe(false);
  });

  it("returns decision from check()", async () => {
    const decision = await ability.check("post:read");
    expect(decision.allowed).toBe(true);
  });

  it("returns explain from explain()", async () => {
    const result = await ability.explain("post:read");
    expect(result.allowed).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("does not throw from authorize() when allowed", async () => {
    await expect(ability.authorize("post:read")).resolves.toBeUndefined();
  });

  it("throws from authorize() when denied", async () => {
    const readerAbility = createAbility(reader, {
      getRole: (name) => roles.find((r) => r.name === name),
    });
    await expect(readerAbility.authorize("post:delete")).rejects.toThrow();
  });

  it("exposes the actor", () => {
    expect(ability.actor).toBe(admin);
  });
});
