import { describe, it, expect } from "vitest";
import {
  createTenantContextStorage,
  createContextManager,
  createTenantId,
} from "../src/index.js";
import type { Tenant } from "../src/index.js";

const tenantA: Tenant = {
  id: createTenantId("acme"),
  name: "Acme Corp",
  status: "active",
  metadata: { plan: "enterprise" },
};

const tenantB: Tenant = {
  id: createTenantId("google"),
  name: "Google",
  status: "active",
  metadata: {},
};

describe("createTenantContextStorage", () => {
  it("returns undefined when no context", () => {
    const storage = createTenantContextStorage();
    expect(storage.get()).toBeUndefined();
  });

  it("stores and retrieves context", () => {
    const storage = createTenantContextStorage();
    const context = {
      mode: "tenant" as const,
      tenant: tenantA,
      context: {
        tenantId: tenantA.id,
        source: "header" as const,
        trust: "verified" as const,
        resolvedAt: new Date(),
        metadata: {},
      },
    };
    storage.run(context, () => {
      expect(storage.get()).toEqual(context);
    });
  });

  it("restores previous context after nested run", () => {
    const storage = createTenantContextStorage();
    const ctxA = {
      mode: "tenant" as const,
      tenant: tenantA,
      context: {
        tenantId: tenantA.id,
        source: "header" as const,
        trust: "verified" as const,
        resolvedAt: new Date(),
        metadata: {},
      },
    };
    const ctxB = {
      mode: "tenant" as const,
      tenant: tenantB,
      context: {
        tenantId: tenantB.id,
        source: "jwt" as const,
        trust: "trusted" as const,
        resolvedAt: new Date(),
        metadata: {},
      },
    };

    const currentTenantId = (): string | undefined => {
      const ctx = storage.get();
      return ctx?.mode === "tenant" ? ctx.tenant.id : undefined;
    };

    storage.run(ctxA, () => {
      expect(currentTenantId()).toBe("acme");
      storage.run(ctxB, () => {
        expect(currentTenantId()).toBe("google");
      });
      expect(currentTenantId()).toBe("acme");
    });
  });

  it("system mode works", () => {
    const storage = createTenantContextStorage();
    storage.run({ mode: "system" }, () => {
      expect(storage.get()?.mode).toBe("system");
    });
  });
});

describe("createContextManager", () => {
  it("getCurrent returns undefined when empty", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    expect(manager.getCurrent()).toBeUndefined();
  });

  it("run creates tenant context", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    manager.run(tenantA, () => {
      expect(manager.getCurrentTenant()?.id).toBe("acme");
    });
  });

  it("requireCurrentTenant throws when missing", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    expect(() => manager.requireCurrentTenant()).toThrow();
  });

  it("requireCurrentTenant returns tenant when present", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    manager.run(tenantA, () => {
      expect(manager.requireCurrentTenant().id).toBe("acme");
    });
  });

  it("runSystem creates system context", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    manager.runSystem(() => {
      expect(manager.isSystemMode()).toBe(true);
      expect(manager.getCurrentTenant()).toBeUndefined();
    });
  });

  it("runAs switches tenant temporarily", () => {
    const storage = createTenantContextStorage();
    const manager = createContextManager({ storage });
    manager.run(tenantA, () => {
      expect(manager.getCurrentTenant()?.id).toBe("acme");
      manager.runAs(tenantB, () => {
        expect(manager.getCurrentTenant()?.id).toBe("google");
      });
      expect(manager.getCurrentTenant()?.id).toBe("acme");
    });
  });
});
