import { describe, it, expect } from "vitest";
import {
  createTenantId,
  createMemoryTenantRepository,
  createDomainRegistry,
  isTenantActive,
  sameTenant,
} from "../src/index.js";
import type { Tenant } from "../src/index.js";

describe("createTenantId", () => {
  it("creates a valid tenant ID", () => {
    const id = createTenantId("acme");
    expect(id).toBe("acme");
  });

  it("throws on empty string", () => {
    expect(() => createTenantId("")).toThrow(/Invalid tenant ID/);
  });

  it("throws on whitespace-only string", () => {
    expect(() => createTenantId("   ")).toThrow(/Invalid tenant ID/);
  });
});

describe("createMemoryTenantRepository", () => {
  const tenantA: Tenant = {
    id: createTenantId("acme"),
    name: "Acme Corp",
    slug: "acme",
    status: "active",
    metadata: { plan: "enterprise" },
  };

  const tenantB: Tenant = {
    id: createTenantId("google"),
    name: "Google",
    slug: "google",
    status: "active",
    metadata: {},
  };

  it("stores and retrieves tenants by ID", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenantA);
    expect(await repo.findById(createTenantId("acme"))).toEqual(tenantA);
  });

  it("retrieves tenants by slug", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenantA);
    expect(await repo.findBySlug("acme")).toEqual(tenantA);
  });

  it("returns undefined for missing tenants", async () => {
    const repo = createMemoryTenantRepository();
    expect(await repo.findById(createTenantId("missing"))).toBeUndefined();
  });

  it("lists all tenants", () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenantA);
    repo.add(tenantB);
    expect(repo.all()).toHaveLength(2);
  });

  it("removes tenants", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenantA);
    repo.remove(createTenantId("acme"));
    expect(await repo.findById(createTenantId("acme"))).toBeUndefined();
  });
});

describe("createDomainRegistry", () => {
  it("registers and resolves domains", () => {
    const registry = createDomainRegistry();
    registry.register("app.acme.com", createTenantId("acme"));
    expect(registry.resolve("app.acme.com")).toBe("acme");
  });

  it("returns undefined for unknown domains", () => {
    const registry = createDomainRegistry();
    expect(registry.resolve("unknown.com")).toBeUndefined();
  });

  it("lists all domains", () => {
    const registry = createDomainRegistry();
    registry.register("app.acme.com", createTenantId("acme"));
    expect(registry.all()).toHaveLength(1);
  });

  it("unregisters domains", () => {
    const registry = createDomainRegistry();
    registry.register("app.acme.com", createTenantId("acme"));
    registry.unregister("app.acme.com");
    expect(registry.resolve("app.acme.com")).toBeUndefined();
  });
});

describe("utils", () => {
  it("isTenantActive", () => {
    expect(
      isTenantActive({
        id: createTenantId("a"),
        name: "A",
        status: "active",
        metadata: {},
      }),
    ).toBe(true);
    expect(
      isTenantActive({
        id: createTenantId("a"),
        name: "A",
        status: "suspended",
        metadata: {},
      }),
    ).toBe(false);
  });

  it("sameTenant", () => {
    expect(sameTenant(createTenantId("a"), createTenantId("a"))).toBe(true);
    expect(sameTenant(createTenantId("a"), createTenantId("b"))).toBe(false);
  });
});
