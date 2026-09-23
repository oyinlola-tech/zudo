import { afterEach, describe, expect, it } from "vitest";
// The real @zudojs/http, through its built dist. tenancy may not depend on
// it (http is a higher tier), so the test reaches it by path.
import {
  HttpRouter,
  createNodeHttpAdapter,
  createResponseContext,
  type HttpMiddleware as RealHttpMiddleware,
  type HttpMiddlewareContext as RealHttpMiddlewareContext,
  type NodeHttpAdapter,
} from "../../http/dist/index.js";
import {
  createHeaderResolver,
  createHttpResolverContext,
  createJwtResolver,
  createMemoryTenantRepository,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantId,
  type HttpMiddlewareContext,
  type TenantClaims,
} from "../src/index.js";

const storage = createTenantContextStorage();
const repository = createMemoryTenantRepository();
repository.add({
  id: createTenantId("acme"),
  name: "Acme",
  slug: "acme",
  status: "active",
  metadata: {},
});

// A helper written against @zudojs/http's own context type, as an app's auth
// layer would write it: it uses the real request's non-optional `getHeader`
// and the real state's `has`, neither of which tenancy's mirror promises.
function claimsFromHttp(
  context: RealHttpMiddlewareContext,
): TenantClaims | undefined {
  if (!context.state.has("auth:claims")) {
    const tenant = context.request.getHeader("x-test-claim-tenant");
    return tenant ? { tenant_id: tenant } : undefined;
  }
  return context.state.get<TenantClaims>("auth:claims");
}

const chain = createResolverChain([
  createJwtResolver(),
  createHeaderResolver(),
  createSubdomainResolver({ baseDomain: "example.test" }),
]);

// Compile-time: the chain itself and an http-typed getClaims are accepted,
// with no `.asResolver()`, `as never` or `as unknown as`.
const resolveWithChain: RealHttpMiddleware = createResolveTenantMiddleware({
  resolver: chain,
  repository,
  storage,
  getClaims: claimsFromHttp,
});
// The existing forms keep compiling.
const resolveWithAdapter: RealHttpMiddleware = createResolveTenantMiddleware({
  resolver: chain.asResolver(),
  repository,
  storage,
  getClaims: (context: HttpMiddlewareContext) =>
    context.state.get<TenantClaims>("auth:claims"),
});
const resolveUntyped: RealHttpMiddleware = createResolveTenantMiddleware({
  resolver: createJwtResolver(),
  repository,
  storage,
  getClaims: (context) => context.state.get<TenantClaims>("auth:claims"),
});
// The widening is bounded: a reader for something that is not a middleware
// context (here, a bare request) is still refused.
createResolveTenantMiddleware({
  resolver: chain,
  repository,
  storage,
  // @ts-expect-error getClaims receives the middleware context, not a request
  getClaims: (request: { readonly headersMap: Map<string, string> }) =>
    request.headersMap.size > 0 ? {} : undefined,
});
// createHttpResolverContext takes the http-typed reader too.
const readClaims = (context: RealHttpMiddlewareContext) =>
  createHttpResolverContext(context, claimsFromHttp).getClaims();

const started: NodeHttpAdapter[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function serve(
  middleware: readonly RealHttpMiddleware[],
): Promise<{ origin: string; effects: string[] }> {
  const effects: string[] = [];
  const router = new HttpRouter();
  router.get(
    "/projects",
    () => {
      effects.push("handler");
      const scope = storage.get();
      return createResponseContext().json({
        tenant: scope?.mode === "tenant" ? scope.tenant.id : null,
      });
    },
    { middleware },
  );
  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  started.push(adapter);
  const port = adapter.address?.port;
  if (port === undefined) throw new Error("no address");
  return { origin: `http://127.0.0.1:${port}`, effects };
}

describe("createResolveTenantMiddleware accepts a resolver chain directly", () => {
  it("compiles every accepted resolver and getClaims form", () => {
    expect([resolveWithChain, resolveWithAdapter, resolveUntyped]).toHaveLength(3);
    expect(typeof readClaims).toBe("function");
  });

  it("resolves a verified tenant through the chain itself", async () => {
    const { origin, effects } = await serve([resolveWithChain]);

    const response = await fetch(`${origin}/projects`, {
      headers: { "x-test-claim-tenant": "acme" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tenant: "acme" });
    expect(effects).toEqual(["handler"]);
  });

  it("still refuses an untrusted header-only tenant through the chain", async () => {
    const { origin, effects } = await serve([resolveWithChain]);

    const response = await fetch(`${origin}/projects`, {
      headers: { "x-tenant-id": "acme" },
    });

    expect(response.status).toBe(403);
    expect(effects).toEqual([]);
  });

  it("answers 404 through the chain when nothing names a tenant", async () => {
    const { origin, effects } = await serve([resolveWithChain]);

    const response = await fetch(`${origin}/projects`);

    expect(response.status).toBe(404);
    expect(effects).toEqual([]);
  });

  it("surfaces a chain conflict as 403, as the adapted form does", async () => {
    const detecting = createResolverChain(
      [createJwtResolver(), createHeaderResolver()],
      { detectConflicts: true },
    );
    const { origin, effects } = await serve([
      createResolveTenantMiddleware({
        resolver: detecting,
        repository,
        storage,
        getClaims: claimsFromHttp,
        minimumTrust: "untrusted",
      }),
    ]);

    const response = await fetch(`${origin}/projects`, {
      headers: { "x-test-claim-tenant": "acme", "x-tenant-id": "other" },
    });

    expect(response.status).toBe(403);
    expect(effects).toEqual([]);
  });

  it("keeps the adapted chain and a single resolver working", async () => {
    const { origin } = await serve([resolveWithAdapter]);
    const { origin: single } = await serve([
      createResolveTenantMiddleware({
        resolver: createJwtResolver(),
        repository,
        storage,
        getClaims: claimsFromHttp,
      }),
    ]);

    const response = await fetch(`${single}/projects`, {
      headers: { "x-test-claim-tenant": "acme" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tenant: "acme" });
    // resolveWithAdapter reads claims from state only, so none here: 404.
    expect((await fetch(`${origin}/projects`)).status).toBe(404);
  });
});
