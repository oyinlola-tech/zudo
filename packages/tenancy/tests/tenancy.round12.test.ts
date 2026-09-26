/**
 * Round 12 regressions for @zudojs/tenancy (academy findings #120, #121).
 */

import { describe, it, expect } from "vitest";
import { ValidationError } from "@zudojs/errors";
// The real @zudojs/cache, through its built dist: tenancy declares no
// dependency on it, and this is exactly the pairing finding #120 broke.
import { createKeyBuilder } from "../../cache/dist/index.js";
import {
  createHeaderResolver,
  createMemoryTenantRepository,
  createRequireTenantMiddleware,
  createResolveTenantMiddleware,
  createTenantContextStorage,
  createTenantCacheKey,
  createTenantCacheNamespace,
  createTenantCacheScope,
  createTenantId,
  TENANCY_RESPONSE_CODE,
  type HttpMiddlewareContext,
  type HttpResolverContext,
  type TenantResolver,
} from "../src/index.js";

function httpContext(headers: Record<string, string>): HttpMiddlewareContext {
  const state = new Map<string, unknown>();
  return {
    request: {
      id: "r1",
      method: "GET",
      url: "http://localhost/x",
      path: "/x",
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

describe("#120 a cache-compatible tenant scope", () => {
  const tenantId = createTenantId("kola-motors");

  it("createTenantCacheKey still produces the colon form that @zudojs/cache rejects", () => {
    const legacy = createTenantCacheKey(tenantId, "dashboard.totals");
    expect(legacy).toBe("tenant:kola-motors:dashboard.totals");
    expect(() => createKeyBuilder().build(legacy)).toThrow();
  });

  it("createTenantCacheScope yields a namespace and key the cache accepts", () => {
    const scope = createTenantCacheScope(tenantId, "dashboard.totals");
    expect(scope).toEqual({
      namespace: "tenant.kola-motors",
      key: "dashboard.totals",
    });
    expect(createTenantCacheNamespace(tenantId)).toBe(scope.namespace);
    const full = createKeyBuilder().build(scope.key, {
      namespace: scope.namespace,
    });
    expect(full).toBe("zudojs:tenant.kola-motors:dashboard.totals");
  });

  it("two tenants never share a fully-qualified key", () => {
    const a = createTenantCacheScope(createTenantId("a"), "k");
    const b = createTenantCacheScope(createTenantId("b"), "k");
    const builder = createKeyBuilder();
    expect(builder.build(a.key, { namespace: a.namespace })).not.toBe(
      builder.build(b.key, { namespace: b.namespace }),
    );
  });

  it("refuses a key that would not survive the cache's own validation", () => {
    expect(() => createTenantCacheScope(tenantId, "users:1")).toThrow(
      ValidationError,
    );
    expect(() => createTenantCacheScope(tenantId, "")).toThrow(ValidationError);
    expect(() => createTenantCacheScope(tenantId, "with space")).toThrow(
      ValidationError,
    );
  });
});

describe("#121 refusal bodies carry a machine-readable code", () => {
  const repository = createMemoryTenantRepository();
  repository.add({
    id: createTenantId("acme"),
    name: "Acme",
    status: "active",
    metadata: {},
  });

  function resolve(): ReturnType<typeof createResolveTenantMiddleware> {
    return createResolveTenantMiddleware({
      resolver: createHeaderResolver({
        trust: "verified",
      }) as TenantResolver<HttpResolverContext>,
      repository,
      storage: createTenantContextStorage(),
    });
  }

  it("404 for an unknown tenant is distinguishable from an application 404", async () => {
    const result = await resolve()(httpContext({ "x-tenant-id": "ghost" }), async () => ({
      status: 200,
      headers: {},
    }));
    expect(result).toMatchObject({
      status: 404,
      body: { error: "Tenant not found", code: "ERR_TENANT_NOT_FOUND" },
    });
    expect(TENANCY_RESPONSE_CODE.NOT_FOUND).toBe("ERR_TENANT_NOT_FOUND");
  });

  it("404 for no tenant at all carries the same code", async () => {
    const result = await resolve()(httpContext({}), async () => ({
      status: 200,
      headers: {},
    }));
    expect(result).toMatchObject({
      status: 404,
      body: { code: "ERR_TENANT_NOT_FOUND" },
    });
  });

  it("the require middleware's 401 carries a code too", async () => {
    const result = await createRequireTenantMiddleware()(
      httpContext({}),
      async () => ({ status: 200, headers: {} }),
    );
    expect(result).toMatchObject({
      status: 401,
      body: { error: "Tenant context is required", code: "ERR_TENANT_REQUIRED" },
    });
  });
});
