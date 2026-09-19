import { describe, it, expect } from "vitest";
import {
  createContextManager,
  createDomainResolver,
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

    repository.add(
      { id: createTenantId("t-1001"), name: "Acme", slug: "acme", status: "active", metadata: {} },
      ["acme.io"],
    );

    const resolver = createResolverChain<HttpResolverContext>([
      createJwtResolver() as TenantResolver<HttpResolverContext>,
      createDomainResolver({ repository }) as TenantResolver<HttpResolverContext>,
      createSubdomainResolver({
        baseDomain: "example.com",
      }) as TenantResolver<HttpResolverContext>,
    ]);

    const middleware = createResolveTenantMiddleware({
      resolver: resolver.asResolver(),
      repository,
      storage,
    });
    for (const host of ["acme.example.com", "acme.io"]) {
      let seen: string | undefined;
      await middleware(
        {
          request: { path: "/", headers: { host } },
          state: new Map<string, unknown>(),
          signal: new AbortController().signal,
          metadata: {},
        } as never,
        async () => {
          const current = storage.get();
          seen = current?.mode === "tenant" ? current.tenant.id : undefined;
          return { status: 200, headers: {} };
        },
      );
      expect(seen).toBe("t-1001");
    }

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
