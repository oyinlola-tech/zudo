import { describe, it, expect } from "vitest";
import {
  createResolverChain,
  createHeaderResolver,
  createSubdomainResolver,
  createPathResolver,
  createJwtResolver,
} from "../src/index.js";
import type {
  HeaderContext,
  JwtContext,
  TenantResolver,
} from "../src/index.js";

describe("createHeaderResolver", () => {
  it("resolves tenant from header", async () => {
    const resolver = createHeaderResolver();
    const result = await resolver.resolve({
      getHeader: (name: string) =>
        name === "x-tenant-id" ? "acme" : undefined,
    });
    expect(result?.tenantId).toBe("acme");
    expect(result?.source).toBe("header");
  });

  it("returns undefined when header missing", async () => {
    const resolver = createHeaderResolver();
    const result = await resolver.resolve({
      getHeader: () => undefined,
    });
    expect(result).toBeUndefined();
  });

  it("supports custom header name", async () => {
    const resolver = createHeaderResolver({ headerName: "x-org" });
    const result = await resolver.resolve({
      getHeader: (name: string) => (name === "x-org" ? "acme" : undefined),
    });
    expect(result?.tenantId).toBe("acme");
  });
});

describe("createSubdomainResolver", () => {
  it("resolves tenant from subdomain", async () => {
    const resolver = createSubdomainResolver();
    const result = await resolver.resolve({
      getHost: () => "acme.example.com",
    });
    expect(result?.tenantId).toBe("acme");
    expect(result?.source).toBe("subdomain");
  });

  it("returns undefined for bare domain", async () => {
    const resolver = createSubdomainResolver();
    const result = await resolver.resolve({
      getHost: () => "example.com",
    });
    expect(result).toBeUndefined();
  });

  it("strips base domain", async () => {
    const resolver = createSubdomainResolver({ baseDomain: "example.com" });
    const result = await resolver.resolve({
      getHost: () => "acme.example.com",
    });
    expect(result?.tenantId).toBe("acme");
  });

  it("returns undefined for www", async () => {
    const resolver = createSubdomainResolver();
    const result = await resolver.resolve({
      getHost: () => "www.example.com",
    });
    expect(result).toBeUndefined();
  });
});

describe("createPathResolver", () => {
  it("resolves tenant from path", async () => {
    const resolver = createPathResolver();
    const result = await resolver.resolve({
      getPath: () => "/acme/users",
    });
    expect(result?.tenantId).toBe("acme");
    expect(result?.source).toBe("path");
  });

  it("supports prefix stripping", async () => {
    const resolver = createPathResolver({ prefix: "/api" });
    const result = await resolver.resolve({
      getPath: () => "/api/acme/users",
    });
    expect(result?.tenantId).toBe("acme");
  });

  it("returns undefined for empty path", async () => {
    const resolver = createPathResolver();
    const result = await resolver.resolve({
      getPath: () => "/",
    });
    expect(result).toBeUndefined();
  });
});

describe("createJwtResolver", () => {
  it("resolves tenant from JWT claims", async () => {
    const resolver = createJwtResolver();
    const result = await resolver.resolve({
      getClaims: () => ({ tenant_id: "acme", sub: "user1" }),
    });
    expect(result?.tenantId).toBe("acme");
    expect(result?.source).toBe("jwt");
    expect(result?.trust).toBe("trusted");
  });

  it("returns undefined when no claims", async () => {
    const resolver = createJwtResolver();
    const result = await resolver.resolve({
      getClaims: () => undefined,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when claim missing", async () => {
    const resolver = createJwtResolver();
    const result = await resolver.resolve({
      getClaims: () => ({ sub: "user1" }),
    });
    expect(result).toBeUndefined();
  });

  it("supports custom claim key", async () => {
    const resolver = createJwtResolver({ claimKey: "org_id" });
    const result = await resolver.resolve({
      getClaims: () => ({ org_id: "acme" }),
    });
    expect(result?.tenantId).toBe("acme");
  });
});

describe("createResolverChain", () => {
  /** Resolvers read different accessors; a chain is typed over their union. */
  type ChainContext = HeaderContext & JwtContext;

  const headerResolver = createHeaderResolver({
    priority: 80,
  }) as TenantResolver<ChainContext>;
  const jwtResolver = createJwtResolver({
    priority: 100,
  }) as TenantResolver<ChainContext>;

  it("returns the highest-priority match and stops there by default", async () => {
    const chain = createResolverChain<ChainContext>([
      headerResolver,
      jwtResolver,
    ]);
    const result = await chain.resolve({
      getHeader: (name: string) =>
        name === "x-tenant-id" ? "from-header" : undefined,
      getClaims: () => ({ tenant_id: "from-jwt" }),
    });
    // JWT has higher priority (100 > 80)
    expect(result.resolution?.tenantId).toBe("from-jwt");
    expect(result.candidates).toHaveLength(1);
  });

  it("returns undefined when no resolvers match", async () => {
    const chain = createResolverChain<ChainContext>([headerResolver]);
    const result = await chain.resolve({
      getHeader: () => undefined,
      getClaims: () => undefined,
    });
    expect(result.resolution).toBeUndefined();
  });

  it("detects conflicts when asked to collect every candidate", async () => {
    const chain = createResolverChain<ChainContext>(
      [headerResolver, jwtResolver],
      { detectConflicts: true, throwOnConflict: false },
    );
    const result = await chain.resolve({
      getHeader: (name: string) =>
        name === "x-tenant-id" ? "header-tenant" : undefined,
      getClaims: () => ({ tenant_id: "jwt-tenant" }),
    });
    expect(result.conflict).toBe(true);
    expect(result.candidates).toHaveLength(2);
  });

  it("throws on conflict by default", async () => {
    const chain = createResolverChain<ChainContext>(
      [headerResolver, jwtResolver],
      { detectConflicts: true },
    );
    await expect(
      chain.resolve({
        getHeader: (name: string) =>
          name === "x-tenant-id" ? "header-tenant" : undefined,
        getClaims: () => ({ tenant_id: "jwt-tenant" }),
      }),
    ).rejects.toThrow("conflict");
  });
});
