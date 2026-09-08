import { describe, it, expect } from "vitest";
import {
  createContextManager,
  createJwtResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantId,
  createHeaderResolver,
  getDefaultTrust,
} from "../src/index.js";
import type { TenantResolver } from "../src/index.js";
import type { HttpResolverContext } from "../src/http/httpResolverContext.js";

describe("README example", () => {
  it("runs exactly as documented", async () => {
    const storage = createTenantContextStorage();
    const repository = createMemoryTenantRepository();

    const resolver = createResolverChain<HttpResolverContext>([
      createJwtResolver() as TenantResolver<HttpResolverContext>,
      createSubdomainResolver({
        baseDomain: "example.com",
      }) as TenantResolver<HttpResolverContext>,
    ]);

    const middleware = createResolveTenantMiddleware({
      resolver: resolver.asResolver(),
      repository,
      storage,
      minimumTrust: "verified",
    });
    expect(typeof middleware).toBe("function");

    const context = createContextManager({ storage });
    const tenant = {
      id: createTenantId("acme"),
      name: "Acme",
      status: "active" as const,
      metadata: {},
    };
    const seen = context.run(tenant, () => context.requireCurrentTenant());
    expect(seen.id).toBe("acme");
  });

  it("matches the trust table in the README", async () => {
    expect(getDefaultTrust("jwt")).toBe("trusted");
    expect(getDefaultTrust("api-key")).toBe("trusted");
    expect(getDefaultTrust("subdomain")).toBe("verified");
    expect(getDefaultTrust("domain")).toBe("verified");
    expect(getDefaultTrust("header")).toBe("untrusted");
    expect(getDefaultTrust("path")).toBe("untrusted");

    const raised = await createHeaderResolver({ trust: "verified" }).resolve({
      getHeader: () => "acme",
    });
    expect(raised?.trust).toBe("verified");
  });
});
