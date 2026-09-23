import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// The real @zudojs/http, through its built dist. tenancy declares no
// dependency on it (http is a higher tier); this test keeps the structural
// mirror in src/http/httpTypes.ts honest.
import {
  HttpMiddlewarePipeline,
  createRequestContext,
  createResponseContext,
} from "../../http/dist/index.js";
import {
  createContextManager,
  createHeaderResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createTenantContextStorage,
  createTenantId,
  type HttpMiddleware,
  type HttpMiddlewareContext,
  type HttpResolverContext,
  type TenantResolver,
} from "../src/index.js";

type RealMiddleware = Parameters<HttpMiddlewarePipeline["use"]>[0];
type RealContext = Parameters<RealMiddleware>[0];

// Compile-time: the real context satisfies the local mirror (the direction
// the middleware reads), and the middleware is assignable to http's type
// with no cast: a refusal is a `GuardResponse`, which http's result type
// includes.
const mirrorAcceptsReal = (context: RealContext): HttpMiddlewareContext =>
  context;
const asReal = (middleware: HttpMiddleware): RealMiddleware => middleware;

const storage = createTenantContextStorage();
const manager = createContextManager({ storage });
const repository = createMemoryTenantRepository();
repository.add({
  id: createTenantId("acme"),
  name: "Acme",
  status: "active",
  metadata: {},
});

function middleware(): HttpMiddleware {
  return createResolveTenantMiddleware({
    resolver: createHeaderResolver({
      trust: "verified",
    }) as TenantResolver<HttpResolverContext>,
    repository,
    storage,
  });
}

describe("cross/X-03", () => {
  it("resolves the tenant from a real @zudojs/http request", async () => {
    let seen: string | undefined;
    const pipeline = new HttpMiddlewarePipeline();
    pipeline.use(asReal(middleware()));
    pipeline.use(async (_context, next) => {
      seen = manager.getCurrentTenant()?.id;
      return next();
    });
    const request = createRequestContext({
      method: "GET",
      url: "http://x.test/invoices",
      headers: { "X-Tenant-Id": "acme" },
    });
    const response = await pipeline.execute(request, createResponseContext());
    expect(response.status).toBe(200);
    expect(seen).toBe("acme");
    expect(typeof mirrorAcceptsReal).toBe("function");
  });

  it("still accepts Map-shaped and plain-object headers", async () => {
    for (const headers of [
      new Map([["x-tenant-id", "acme"]]),
      { "X-Tenant-ID": "acme" },
    ]) {
      const state = new Map<string, unknown>();
      const context = {
        request: { path: "/", headers },
        state,
        signal: new AbortController().signal,
        metadata: {},
      } as unknown as HttpMiddlewareContext;
      let seen: string | undefined;
      await middleware()(context, async () => {
        seen = manager.getCurrentTenant()?.id;
        return { status: 200, headers: {} };
      });
      expect(seen).toBe("acme");
    }
  });
});

describe("cross/CV-01", () => {
  it("declares no dependency or peer on a higher-tier package", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys(pkg.peerDependencies ?? {})).not.toContain("@zudojs/http");
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@zudojs/http");
  });
});
