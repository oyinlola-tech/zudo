/**
 * @zudojs/tenancy — Hardening regression tests.
 *
 * These pin the isolation boundaries. A tenancy defect does not usually throw;
 * it serves the wrong tenant's data successfully, so each test asserts on the
 * tenant that was actually established.
 */

import { describe, it, expect } from "vitest";
import {
  createDomainRegistry,
  createHeaderResolver,
  createJwtResolver,
  createMemoryTenantRepository,
  createPathResolver,
  createRequireTenantMiddleware,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createContextManager,
  createTenantId,
  createTenantManager,
  createTenantCacheKey,
  getDefaultTrust,
  assertTrustLevel,
  meetsTrustLevel,
  tenantKey,
  tryCreateTenantId,
  TenantResolutionError,
  TenantTrustLevelError,
  TenantUnavailableError,
  TENANT_CLAIMS_STATE_KEY,
} from "../src/index.js";
import type {
  HeaderContext,
  JwtContext,
  Tenant,
  TenantCache,
  TenantResolver,
} from "../src/index.js";
import type { HttpMiddlewareContext } from "../src/http/httpTypes.js";
import type { HttpResolverContext } from "../src/http/httpResolverContext.js";

type ChainContext = HeaderContext & JwtContext;

function tenant(id: string, status: Tenant["status"] = "active"): Tenant {
  return {
    id: createTenantId(id),
    name: id,
    slug: id,
    status,
    metadata: {},
  };
}

/* ─── TEN-01: the chain must not fail open ────────────────────────────────── */

describe("resolver chain error handling", () => {
  it("stops the chain when a resolver rejects a credential", async () => {
    const chain = createResolverChain<ChainContext>([
      createJwtResolver() as TenantResolver<ChainContext>,
      createHeaderResolver() as TenantResolver<ChainContext>,
    ]);

    await expect(
      chain.resolve({
        getClaims: () => {
          throw new Error("JWT signature verification failed");
        },
        getHeader: (name) =>
          name === "x-tenant-id" ? "victim-tenant" : undefined,
      }),
    ).rejects.toBeInstanceOf(TenantResolutionError);
  });

  it("names the resolver that rejected the request", async () => {
    const chain = createResolverChain<JwtContext>([createJwtResolver()]);

    await expect(
      chain.resolve({
        getClaims: () => {
          throw new Error("expired");
        },
      }),
    ).rejects.toThrow(/resolver "jwt" rejected/);
  });

  it("continues past a resolver that simply found nothing", async () => {
    const chain = createResolverChain<ChainContext>([
      createJwtResolver() as TenantResolver<ChainContext>,
      createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<ChainContext>,
    ]);

    const result = await chain.resolve({
      getClaims: () => undefined,
      getHeader: (name) => (name === "x-tenant-id" ? "acme" : undefined),
    });

    expect(result.resolution?.tenantId).toBe("acme");
  });

  it("throws on a tenant disagreement by default", async () => {
    const chain = createResolverChain<ChainContext>(
      [
        createJwtResolver() as TenantResolver<ChainContext>,
        createHeaderResolver() as TenantResolver<ChainContext>,
      ],
      { detectConflicts: true },
    );

    await expect(
      chain.resolve({
        getClaims: () => ({ tenant_id: "real" }),
        getHeader: () => "attacker",
      }),
    ).rejects.toThrow(/conflict/);
  });
});

/* ─── TEN-02 / TEN-04 / TEN-05 / TEN-14: HTTP middleware ──────────────────── */

function httpContext(
  headers: Record<string, string>,
  path = "/",
  claims?: Record<string, unknown>,
): HttpMiddlewareContext {
  const state = new Map<string, unknown>();
  if (claims) state.set(TENANT_CLAIMS_STATE_KEY, claims);

  return {
    request: {
      id: "r1",
      method: "GET",
      url: `http://localhost${path}`,
      path,
      headers: new Map(Object.entries(headers)),
      params: new Map(),
      query: new Map(),
    },
    response: { status: 200, headers: {} },
    state: {
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      set: <T>(key: string, value: T): void => {
        state.set(key, value);
      },
    },
    signal: new AbortController().signal,
    metadata: {},
  };
}

describe("resolve tenant middleware", () => {
  const repository = createMemoryTenantRepository();
  repository.add(tenant("acme"));
  repository.add(tenant("suspended-co", "suspended"));

  it("adapts the HTTP context to the shape resolvers expect", async () => {
    const storage = createTenantContextStorage();
    const middleware = createResolveTenantMiddleware({
      resolver: createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<HttpResolverContext>,
      repository,
      storage,
    });

    let seen: string | undefined;
    await middleware(httpContext({ "x-tenant-id": "acme" }), async () => {
      const ctx = storage.get();
      seen = ctx?.mode === "tenant" ? ctx.tenant.id : undefined;
      return { status: 200, headers: {} };
    });

    expect(seen).toBe("acme");
  });

  it("reads claims for the JWT resolver from middleware state", async () => {
    const storage = createTenantContextStorage();
    const middleware = createResolveTenantMiddleware({
      resolver: createJwtResolver() as TenantResolver<HttpResolverContext>,
      repository,
      storage,
    });

    let seen: string | undefined;
    await middleware(httpContext({}, "/", { tenant_id: "acme" }), async () => {
      const ctx = storage.get();
      seen = ctx?.mode === "tenant" ? ctx.tenant.id : undefined;
      return { status: 200, headers: {} };
    });

    expect(seen).toBe("acme");
  });

  it("refuses a resolution below the route's minimum trust", async () => {
    const middleware = createResolveTenantMiddleware({
      resolver: createPathResolver() as TenantResolver<HttpResolverContext>,
      repository,
      storage: createTenantContextStorage(),
      minimumTrust: "trusted",
    });

    const response = (await middleware(
      httpContext({}, "/acme/users"),
      async () => ({
        status: 200,
        headers: {},
      }),
    )) as { status: number };

    expect(response.status).toBe(403);
  });

  it("refuses a suspended tenant without a separate guard middleware", async () => {
    const middleware = createResolveTenantMiddleware({
      resolver: createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<HttpResolverContext>,
      repository,
      storage: createTenantContextStorage(),
    });

    let reached = false;
    const response = (await middleware(
      httpContext({ "x-tenant-id": "suspended-co" }),
      async () => {
        reached = true;
        return { status: 200, headers: {} };
      },
    )) as { status: number };

    expect(response.status).toBe(403);
    expect(reached).toBe(false);
  });

  it("serves a suspended tenant when the route opts in", async () => {
    const middleware = createResolveTenantMiddleware({
      resolver: createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<HttpResolverContext>,
      repository,
      storage: createTenantContextStorage(),
      allowInactive: true,
    });

    let reached = false;
    await middleware(
      httpContext({ "x-tenant-id": "suspended-co" }),
      async () => {
        reached = true;
        return { status: 200, headers: {} };
      },
    );

    expect(reached).toBe(true);
  });

  it("does not reveal whether a tenant exists", async () => {
    const middleware = createResolveTenantMiddleware({
      resolver: createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<HttpResolverContext>,
      repository,
      storage: createTenantContextStorage(),
    });

    const unknownTenant = (await middleware(
      httpContext({ "x-tenant-id": "does-not-exist" }),
      async () => ({ status: 200, headers: {} }),
    )) as { body: { error: string } };

    const noTenant = (await middleware(httpContext({}), async () => ({
      status: 200,
      headers: {},
    }))) as { body: { error: string } };

    expect(unknownTenant.body.error).toBe(noTenant.body.error);
    expect(unknownTenant.body.error).not.toContain("does-not-exist");
  });

  it("requires a tenant when the route says so", async () => {
    const middleware = createRequireTenantMiddleware();
    const response = (await middleware(httpContext({}), async () => ({
      status: 200,
      headers: {},
    }))) as { status: number };

    expect(response.status).toBe(401);
  });
});

/* ─── TEN-03: tenant id validation and key scoping ────────────────────────── */

describe("tenant identity", () => {
  it("rejects ids that could forge a key or path boundary", () => {
    for (const bad of [
      "a:cache",
      "../../etc/passwd",
      "a/b",
      "a b",
      "a.b",
      "",
      "   ",
      "-leading",
      "x".repeat(65),
    ]) {
      expect(() => createTenantId(bad)).toThrow(/Invalid tenant ID/);
    }
  });

  it("normalizes case, whitespace and Unicode so one tenant has one id", () => {
    expect(createTenantId("ACME")).toBe("acme");
    expect(createTenantId("  acme  ")).toBe("acme");
    // Fullwidth forms fold to ASCII under NFKC rather than becoming a
    // second, visually identical tenant.
    expect(createTenantId("\uFF41\uFF43\uFF4D\uFF45")).toBe("acme");
    // Characters outside the slug alphabet are refused, not silently mapped.
    expect(() => createTenantId("ac\u0131me")).toThrow(/Invalid tenant ID/);
  });

  it("reports unusable candidates without throwing", () => {
    expect(tryCreateTenantId("a:b")).toBeUndefined();
    expect(tryCreateTenantId(42)).toBeUndefined();
    expect(tryCreateTenantId("acme")).toBe("acme");
  });

  it("prevents one tenant's key from colliding with another's", () => {
    const a = createTenantId("acme");
    const b = createTenantId("acme-2");

    expect(tenantKey(a, "cache:k")).not.toBe(tenantKey(b, "k"));
    expect(createTenantCacheKey(a, "k")).not.toBe(createTenantCacheKey(b, "k"));
  });
});

/* ─── TEN-04 / TEN-06 / TEN-10: trust ─────────────────────────────────────── */

describe("trust levels", () => {
  it("grades a client-supplied header as untrusted by default", async () => {
    expect(getDefaultTrust("header")).toBe("untrusted");

    const resolved = await createHeaderResolver().resolve({
      getHeader: () => "acme",
    });
    expect(resolved?.trust).toBe("untrusted");
  });

  it("lets an application raise header trust explicitly", async () => {
    const resolved = await createHeaderResolver({
      trust: "verified",
    }).resolve({ getHeader: () => "acme" });

    expect(resolved?.trust).toBe("verified");
  });

  it("compares trust levels without throwing", () => {
    expect(meetsTrustLevel("trusted", "verified")).toBe(true);
    expect(meetsTrustLevel("untrusted", "verified")).toBe(false);
  });

  it("reports the source and both levels in structured metadata", () => {
    try {
      assertTrustLevel("untrusted", "trusted", "path");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TenantTrustLevelError);
      const typed = error as TenantTrustLevelError & {
        metadata: Record<string, unknown>;
      };
      expect(typed.message).toMatch(/Insufficient trust level from "path"/);
      expect(typed.metadata).toMatchObject({
        source: "path",
        required: "trusted",
        actual: "untrusted",
      });
    }
  });
});

/* ─── TEN-07 / TEN-08: repository indexes ─────────────────────────────────── */

describe("memory tenant repository", () => {
  it("resolves a tenant by a registered custom domain", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenant("acme"), ["app.acme.com"]);

    expect((await repo.findByDomain("app.acme.com"))?.id).toBe("acme");
    expect((await repo.findByDomain("APP.ACME.COM"))?.id).toBe("acme");
    expect(await repo.findByDomain("other.com")).toBeUndefined();
  });

  it("drops the previous slug when a tenant is re-added", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenant("acme"));
    repo.add({ ...tenant("acme", "suspended"), slug: "acme-new" });

    expect(await repo.findBySlug("acme")).toBeUndefined();
    expect((await repo.findBySlug("acme-new"))?.status).toBe("suspended");
  });

  it("clears every index entry on removal", async () => {
    const repo = createMemoryTenantRepository();
    repo.add(tenant("acme"), ["app.acme.com"]);
    repo.remove(createTenantId("acme"));

    expect(await repo.findById(createTenantId("acme"))).toBeUndefined();
    expect(await repo.findBySlug("acme")).toBeUndefined();
    expect(await repo.findByDomain("app.acme.com")).toBeUndefined();
    expect(repo.domainsOf(createTenantId("acme"))).toEqual([]);
  });

  it("matches domains case-insensitively in the registry", () => {
    const registry = createDomainRegistry();
    registry.register("App.Acme.COM", createTenantId("acme"));
    expect(registry.resolve("app.acme.com")).toBe("acme");
  });
});

/* ─── TEN-09: subdomain resolution ────────────────────────────────────────── */

describe("subdomain resolver", () => {
  const resolver = createSubdomainResolver({ baseDomain: "example.com" });

  it("resolves host case-insensitively", async () => {
    const upper = await resolver.resolve({ getHost: () => "ACME.example.com" });
    const lower = await resolver.resolve({ getHost: () => "acme.example.com" });
    expect(upper?.tenantId).toBe(lower?.tenantId);
    expect(upper?.tenantId).toBe("acme");
  });

  it("refuses a multi-label subdomain by default", async () => {
    expect(
      await resolver.resolve({ getHost: () => "a.b.example.com" }),
    ).toBeUndefined();
  });

  it("strips the port without mangling an IPv6 authority", async () => {
    expect(
      await resolver.resolve({ getHost: () => "acme.example.com:8443" }),
    ).toMatchObject({ tenantId: "acme" });
    expect(
      await resolver.resolve({ getHost: () => "[::1]:3000" }),
    ).toBeUndefined();
  });

  it("ignores reserved subdomains", async () => {
    expect(
      await resolver.resolve({ getHost: () => "www.example.com" }),
    ).toBeUndefined();
  });
});

/* ─── TEN-13 / TEN-15: cache TTL and context entry ────────────────────────── */

describe("tenant manager cache", () => {
  function trackingCache(): TenantCache & { reads: number } {
    const store = new Map<string, Tenant>();
    return {
      reads: 0,
      async get(id) {
        this.reads++;
        return store.get(id);
      },
      async set(t) {
        store.set(t.id, t);
      },
      async delete(id) {
        store.delete(id);
      },
    };
  }

  it("re-reads the repository once the TTL has elapsed", async () => {
    const repository = createMemoryTenantRepository();
    repository.add(tenant("acme"));

    const manager = createTenantManager({
      repository,
      cache: trackingCache(),
      storage: createTenantContextStorage(),
      cacheTtlMs: 10,
    });

    expect((await manager.get(createTenantId("acme")))?.status).toBe("active");

    repository.add(tenant("acme", "suspended"));
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect((await manager.get(createTenantId("acme")))?.status).toBe(
      "suspended",
    );
  });

  it("invalidates immediately when asked", async () => {
    const repository = createMemoryTenantRepository();
    repository.add(tenant("acme"));

    const manager = createTenantManager({
      repository,
      cache: trackingCache(),
      storage: createTenantContextStorage(),
      cacheTtlMs: 60_000,
    });

    await manager.get(createTenantId("acme"));
    repository.add(tenant("acme", "suspended"));
    await manager.invalidate(createTenantId("acme"));

    expect((await manager.get(createTenantId("acme")))?.status).toBe(
      "suspended",
    );
  });

  it("requireActive refuses a suspended tenant", async () => {
    const repository = createMemoryTenantRepository();
    repository.add(tenant("acme", "suspended"));

    const manager = createTenantManager({
      repository,
      storage: createTenantContextStorage(),
    });

    await expect(
      manager.requireActive(createTenantId("acme")),
    ).rejects.toBeInstanceOf(TenantUnavailableError);
  });
});

describe("context manager", () => {
  it("refuses to enter a context for a suspended tenant", () => {
    const manager = createContextManager({
      storage: createTenantContextStorage(),
    });

    expect(() => manager.run(tenant("acme", "suspended"), () => "x")).toThrow(
      TenantUnavailableError,
    );
  });

  it("allows it when the caller opts in", () => {
    const manager = createContextManager({
      storage: createTenantContextStorage(),
      allowInactive: true,
    });

    expect(manager.run(tenant("acme", "suspended"), () => "x")).toBe("x");
  });
});
