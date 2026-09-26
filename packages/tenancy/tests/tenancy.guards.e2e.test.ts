import { afterEach, describe, expect, it } from "vitest";
// The real @zudojs/http, through its built dist. tenancy may not depend on
// it (http is a higher tier), so the test reaches it by path.
import {
  HttpRouter,
  createNodeHttpAdapter,
  createResponseContext,
  type HttpMiddleware as RealHttpMiddleware,
  type NodeHttpAdapter,
} from "../../http/dist/index.js";
import {
  createHeaderResolver,
  createMemoryTenantRepository,
  createRequireTenantMiddleware,
  createResolveTenantMiddleware,
  createResolverChain,
  createSubdomainResolver,
  createTenantContextStorage,
  createTenantGuardMiddleware,
  createTenantId,
  createTenantPropagationMiddleware,
  type HttpMiddleware,
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

const resolveTenant = createResolveTenantMiddleware({
  resolver: createResolverChain([
    createHeaderResolver(),
    createSubdomainResolver({ baseDomain: "example.test" }),
  ]).asResolver(),
  repository,
  storage,
});

// Compile-time: every exported middleware is an http `HttpMiddleware` as it
// is, with no `as never` / `as unknown as` cast.
const typedMiddleware: readonly RealHttpMiddleware[] = [
  resolveTenant,
  createRequireTenantMiddleware(),
  createTenantGuardMiddleware(),
  createTenantPropagationMiddleware(storage),
];
const passthrough: HttpMiddleware = async (_context, next) => next();
const assigned: RealHttpMiddleware = passthrough;

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
      return createResponseContext().json({ tenant: storage.get()?.mode });
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

describe("tenancy middleware over a real @zudojs/http server", () => {
  it("types every middleware as an http middleware without a cast", () => {
    expect(typedMiddleware).toHaveLength(4);
  });

  it("answers a header-only (untrusted) request with 403, not 200", async () => {
    const { origin, effects } = await serve([assigned, resolveTenant]);

    const response = await fetch(`${origin}/projects`, {
      headers: { "x-tenant-id": "acme" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Tenant could not be established for this route", code: "ERR_TENANT_FORBIDDEN" });
    expect(effects).toEqual([]);
  });

  it("answers a request naming no tenant with 404", async () => {
    const { origin, effects } = await serve([resolveTenant]);

    const response = await fetch(`${origin}/projects`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Tenant not found", code: "ERR_TENANT_NOT_FOUND" });
    expect(effects).toEqual([]);
  });

  it("answers a missing tenant with 401 from the require middleware", async () => {
    const { origin, effects } = await serve([createRequireTenantMiddleware()]);

    const response = await fetch(`${origin}/projects`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Tenant context is required", code: "ERR_TENANT_REQUIRED" });
    expect(effects).toEqual([]);
  });
});
