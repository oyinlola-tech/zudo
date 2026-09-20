/**
 * Audit round 11 regressions for @zudojs/tenancy.
 *
 * SEC-06 is a cross-package documentation defect: the `@zudojs/permissions`
 * README told readers to `import { requireCurrentTenant } from
 * "@zudojs/tenancy"`, which this package does not export. The snippet now
 * uses the context manager, and this runs exactly what the snippet says.
 */

import { describe, it, expect } from "vitest";

import type { Tenant } from "../src/index.js";
import {
  createContextManager,
  createTenantId,
  getDefaultStorage,
  resetDefaultStorage,
} from "../src/index.js";
import * as tenancy from "../src/index.js";

const acme: Tenant = {
  id: createTenantId("acme"),
  name: "Acme Corp",
  status: "active",
  metadata: {},
};

describe("SEC-06 — the documented way to read the verified tenant", () => {
  it("has no module-level requireCurrentTenant to import", () => {
    expect("requireCurrentTenant" in tenancy).toBe(false);
  });

  it("runs the README snippet: createContextManager(...).requireCurrentTenant().id", () => {
    resetDefaultStorage();
    const manager = createContextManager({ storage: getDefaultStorage() });

    const tenantId = manager.run(acme, () => manager.requireCurrentTenant().id);

    expect(tenantId).toBe("acme");
  });

  it("throws outside a tenant context rather than returning undefined", () => {
    resetDefaultStorage();
    const manager = createContextManager({ storage: getDefaultStorage() });

    expect(() => manager.requireCurrentTenant()).toThrow();
  });

  it("exports both names the snippet imports", () => {
    expect(typeof tenancy.createContextManager).toBe("function");
    expect(typeof tenancy.getDefaultStorage).toBe("function");
  });
});
