import { describe, it, expect } from "vitest";
import {
  createPermissionActor,
  actorHasRole,
  actorHasPermission,
  isSystemActor,
  createMemoryPermissionCache,
  permissionCacheKey,
  createCacheKey,
  extractResource,
  extractAction,
  buildPermission,
  createActor,
} from "../src/index.js";

describe("createPermissionActor", () => {
  it("creates an actor with id", () => {
    const actor = createPermissionActor("user_1");
    expect(actor.id).toBe("user_1");
  });

  it("creates an actor with all options", () => {
    const actor = createPermissionActor("user_1", {
      type: "user",
      roles: ["admin"],
      permissions: ["post:read"],
      deniedPermissions: ["post:delete"],
    });
    expect(actor.type).toBe("user");
    expect(actor.roles).toEqual(["admin"]);
    expect(actor.permissions).toEqual(["post:read"]);
    expect(actor.deniedPermissions).toEqual(["post:delete"]);
  });

  it("returns a frozen object", () => {
    const actor = createPermissionActor("user_1");
    expect(Object.isFrozen(actor)).toBe(true);
  });
});

describe("actorHasRole", () => {
  it("returns true when actor has role", () => {
    const actor = createPermissionActor("user_1", { roles: ["admin"] });
    expect(actorHasRole(actor, "admin")).toBe(true);
  });

  it("returns false when actor lacks role", () => {
    const actor = createPermissionActor("user_1", { roles: ["editor"] });
    expect(actorHasRole(actor, "admin")).toBe(false);
  });

  it("returns false when actor has no roles", () => {
    const actor = createPermissionActor("user_1");
    expect(actorHasRole(actor, "admin")).toBe(false);
  });
});

describe("actorHasPermission", () => {
  it("returns true when actor has permission", () => {
    const actor = createPermissionActor("user_1", {
      permissions: ["post:read"],
    });
    expect(actorHasPermission(actor, "post:read")).toBe(true);
  });

  it("returns false when actor lacks permission", () => {
    const actor = createPermissionActor("user_1", {
      permissions: ["post:read"],
    });
    expect(actorHasPermission(actor, "post:delete")).toBe(false);
  });

  it("returns false when actor has no permissions", () => {
    const actor = createPermissionActor("user_1");
    expect(actorHasPermission(actor, "post:read")).toBe(false);
  });
});

describe("isSystemActor", () => {
  it("returns true for system actors", () => {
    expect(isSystemActor({ id: "s1", type: "system" })).toBe(true);
    expect(isSystemActor({ id: "s1", type: "service" })).toBe(true);
  });

  it("returns false for non-system actors", () => {
    expect(isSystemActor({ id: "u1", type: "user" })).toBe(false);
    expect(isSystemActor({ id: "u1" })).toBe(false);
  });
});

describe("createMemoryPermissionCache", () => {
  it("stores and retrieves decisions", async () => {
    const cache = createMemoryPermissionCache();
    const decision = { allowed: true, reason: "test" };
    await cache.set("key1", decision);
    const result = await cache.get("key1");
    expect(result).toEqual(decision);
  });

  it("returns undefined for missing keys", async () => {
    const cache = createMemoryPermissionCache();
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("respects TTL", async () => {
    const cache = createMemoryPermissionCache(1); // 1ms TTL
    await cache.set("key1", { allowed: true });
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("deletes entries", async () => {
    const cache = createMemoryPermissionCache();
    await cache.set("key1", { allowed: true });
    await cache.delete("key1");
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("invalidates by actor", async () => {
    const cache = createMemoryPermissionCache();
    const first = permissionCacheKey("user_1", "post:read");
    const second = permissionCacheKey("user_2", "post:read");
    await cache.set(first, { allowed: true });
    await cache.set(second, { allowed: true });
    await cache.invalidateActor("user_1");
    expect(await cache.get(first)).toBeUndefined();
    expect(await cache.get(second)).toBeDefined();
  });

  it("does not invalidate an actor whose id shares a prefix (PERM-09)", async () => {
    const cache = createMemoryPermissionCache();
    const one = permissionCacheKey("1", "post:read");
    const ten = permissionCacheKey("10", "post:read");
    await cache.set(one, { allowed: true });
    await cache.set(ten, { allowed: true });
    await cache.invalidateActor("1");
    expect(await cache.get(one)).toBeUndefined();
    expect(await cache.get(ten)).toBeDefined();
  });

  it("treats a zero TTL as do-not-cache (PERM-09)", async () => {
    const cache = createMemoryPermissionCache();
    const key = permissionCacheKey("user_1", "post:read");
    await cache.set(key, { allowed: true }, { ttl: 0 });
    expect(await cache.get(key)).toBeUndefined();
  });

  it("evicts once past its maximum size (PERM-09)", async () => {
    const cache = createMemoryPermissionCache({ maxEntries: 5 });
    for (let i = 0; i < 50; i++) {
      await cache.set(permissionCacheKey(`u${i}`, "post:read"), {
        allowed: true,
      });
    }
    expect(cache.size()).toBeLessThanOrEqual(5);
  });
});

describe("permissionCacheKey", () => {
  it("generates a cache key", () => {
    expect(permissionCacheKey("user_1", "post:read")).toBe(
      "actor:user_1|post:read",
    );
  });

  it("includes resource ID", () => {
    expect(permissionCacheKey("user_1", "post:read", "post_123")).toBe(
      "actor:user_1|post:read|post_123",
    );
  });
});

describe("utils", () => {
  it("extractResource", () => {
    expect(extractResource("post:update")).toBe("post");
    expect(extractResource("billing.invoice:refund")).toBe("billing.invoice");
  });

  it("extractAction", () => {
    expect(extractAction("post:update")).toBe("update");
    expect(extractAction("billing.invoice:refund")).toBe("refund");
  });

  it("buildPermission", () => {
    expect(buildPermission("post", "update")).toBe("post:update");
  });

  it("createCacheKey delegates to the canonical builder (PERM-29)", () => {
    expect(createCacheKey("user_1", "post:read")).toBe(
      permissionCacheKey("user_1", "post:read"),
    );
    expect(createCacheKey("user_1", "post:read", "post_1")).toBe(
      permissionCacheKey("user_1", "post:read", "post_1"),
    );
  });

  it("createActor", () => {
    const actor = createActor("user_1", { type: "user", roles: ["admin"] });
    expect(actor.id).toBe("user_1");
    expect(actor.type).toBe("user");
    expect(actor.roles).toEqual(["admin"]);
    // Both factories freeze, so the two are no longer subtly different.
    expect(Object.isFrozen(actor.roles)).toBe(true);
  });
});
