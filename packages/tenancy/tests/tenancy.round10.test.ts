import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createTenantId as brandTenantId } from "@zudojs/constants";
import {
  createDomainRegistry,
  createDomainResolver,
  createHeaderResolver,
  createJwtResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantGuardMiddleware,
  createTenantId,
  TENANT_STATE_KEY,
  type HttpMiddlewareContext,
  type HttpResolverContext,
  type TenantId,
  type TenantResolver,
} from "../src/index.js";

const storage = createTenantContextStorage();
const repository = createMemoryTenantRepository();
repository.add(
  { id: createTenantId("t-1001"), name: "Acme", slug: "acme", status: "active", metadata: {} },
  ["acme.io"],
);
repository.add({ id: createTenantId("frozen"), name: "F", status: "suspended", metadata: {} });

function ctx(headers: Record<string, string>): HttpMiddlewareContext {
  return {
    request: { path: "/orders", headers },
    state: new Map<string, unknown>(),
    signal: new AbortController().signal,
    metadata: {},
  } as unknown as HttpMiddlewareContext;
}
const ok = async () => ({ status: 200, headers: {} });
const asHttp = <C>(resolver: TenantResolver<C>) =>
  resolver as unknown as TenantResolver<HttpResolverContext>;

describe("authz/TEN-01", () => {
  it("refuses a client-chosen header tenant under default options", async () => {
    const mw = createResolveTenantMiddleware({
      resolver: asHttp(createHeaderResolver()),
      repository,
      storage,
    });
    expect(await mw(ctx({ "x-tenant-id": "t-1001" }), ok)).toMatchObject({ status: 403 });
    const optedDown = createResolveTenantMiddleware({
      resolver: asHttp(createHeaderResolver()),
      repository,
      storage,
      minimumTrust: "untrusted",
    });
    expect(await optedDown(ctx({ "x-tenant-id": "t-1001" }), ok)).toMatchObject({ status: 200 });
  });
});

describe("authz/TEN-02", () => {
  it("reaches a tenant through its slug subdomain", async () => {
    const mw = createResolveTenantMiddleware({
      resolver: asHttp(createSubdomainResolver({ baseDomain: "example.com" })),
      repository,
      storage,
    });
    expect(await mw(ctx({ host: "acme.example.com" }), ok)).toMatchObject({ status: 200 });
  });

  it("reaches a tenant through a registered custom domain", async () => {
    const byRepo = createResolveTenantMiddleware({
      resolver: asHttp(createDomainResolver({ repository })),
      repository,
      storage,
    });
    expect(await byRepo(ctx({ host: "ACME.io:443" }), ok)).toMatchObject({ status: 200 });

    const registry = createDomainRegistry();
    registry.register("acme.example", createTenantId("t-1001"));
    const resolution = await createDomainResolver({ registry }).resolve({
      getHost: () => "acme.example",
    });
    expect(resolution).toMatchObject({ tenantId: "t-1001", source: "domain", trust: "verified" });
  });
});

describe("authz/TEN-03", () => {
  it("the README describes conflict detection as opt-in, as it is", async () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).not.toMatch(/disagreeing about the tenant throws by default/);
    const chain = createResolverChain<HttpResolverContext>([
      asHttp(createJwtResolver()),
      asHttp(createHeaderResolver()),
    ]);
    const result = await chain.resolve({
      getClaims: () => ({ tenant_id: "t-1001" }),
      getHeader: () => "victim",
    } as never);
    expect(result.conflict).toBe(false);
  });
});

describe("authz/TEN-04", () => {
  it("shares one TenantId type with @zudojs/constants", () => {
    const branded: TenantId = brandTenantId("acme");
    expect(branded).toBe("acme");
  });
});

describe("authz/TEN-05", () => {
  it("answers unknown and suspended tenants identically", async () => {
    const mw = createResolveTenantMiddleware({
      resolver: asHttp(createHeaderResolver({ trust: "verified" })),
      repository,
      storage,
    });
    const unknown = await mw(ctx({ "x-tenant-id": "ghost" }), ok);
    const suspended = await mw(ctx({ "x-tenant-id": "frozen" }), ok);
    expect(suspended).toEqual(unknown);
  });

  it("the guard names neither the tenant nor its status", async () => {
    const context = ctx({});
    context.state.set(TENANT_STATE_KEY, await repository.findById(createTenantId("frozen")));
    const response = await createTenantGuardMiddleware()(context, ok);
    expect(JSON.stringify(response)).not.toMatch(/frozen|suspended/);
  });
});
