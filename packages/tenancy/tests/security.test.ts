import { describe, it, expect } from "vitest";
import {
  getDefaultTrust,
  assertTenantUsable,
  assertTenantOwnership,
  assertTrustLevel,
  tenantKey,
  createTenantCacheKey,
  createTenantId,
} from "../src/index.js";
import type { Tenant } from "../src/index.js";

describe("getDefaultTrust", () => {
  it("returns trusted for JWT", () => {
    expect(getDefaultTrust("jwt")).toBe("trusted");
  });

  it("returns untrusted for header, which is client-supplied on the wire", () => {
    expect(getDefaultTrust("header")).toBe("untrusted");
  });

  it("returns untrusted for path", () => {
    expect(getDefaultTrust("path")).toBe("untrusted");
  });
});

describe("assertTenantUsable", () => {
  const activeTenant: Tenant = {
    id: createTenantId("acme"),
    name: "Acme",
    status: "active",
    metadata: {},
  };

  it("does not throw for active tenant", () => {
    expect(() => assertTenantUsable(activeTenant)).not.toThrow();
  });

  it("throws for suspended tenant", () => {
    const suspended = { ...activeTenant, status: "suspended" as const };
    expect(() => assertTenantUsable(suspended)).toThrow();
  });

  it("throws for deleted tenant", () => {
    const deleted = { ...activeTenant, status: "deleted" as const };
    expect(() => assertTenantUsable(deleted)).toThrow();
  });
});

describe("assertTenantOwnership", () => {
  it("does not throw when ownership matches", () => {
    const resource = { tenantId: createTenantId("acme") };
    expect(() =>
      assertTenantOwnership(resource, createTenantId("acme")),
    ).not.toThrow();
  });

  it("throws when ownership mismatches", () => {
    const resource = { tenantId: createTenantId("google") };
    expect(() =>
      assertTenantOwnership(resource, createTenantId("acme")),
    ).toThrow();
  });
});

describe("assertTrustLevel", () => {
  it("does not throw when trust is sufficient", () => {
    expect(() =>
      assertTrustLevel("trusted", "verified", "header"),
    ).not.toThrow();
  });

  it("throws when trust is insufficient", () => {
    expect(() => assertTrustLevel("untrusted", "verified", "path")).toThrow();
  });
});

describe("tenantKey", () => {
  it("generates a scoped key", () => {
    expect(tenantKey(createTenantId("acme"), "user:123")).toBe(
      "tenant:acme:user\\:123",
    );
  });

  it("supports custom separator", () => {
    expect(tenantKey(createTenantId("acme"), "user:123", "/")).toBe(
      "tenant/acme/user:123",
    );
  });
});

describe("createTenantCacheKey", () => {
  it("generates a cache key", () => {
    expect(createTenantCacheKey(createTenantId("acme"), "user:123")).toBe(
      "tenant:acme:user\\:123",
    );
  });
});
