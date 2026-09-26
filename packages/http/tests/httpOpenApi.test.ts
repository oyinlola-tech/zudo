import { describe, it, expect, vi, afterEach } from "vitest";
import {
  objectSchema,
  stringSchema,
  numberSchema,
  optionalSchema,
} from "@zudojs/schema";
import { createOpenAPIValidator } from "@zudojs/openapi";

import {
  collectOpenAPIRoutes,
  createRequestContext,
  createResponseContext,
  createRouter,
  generateOpenAPIDocument,
  mountOpenAPI,
} from "../src/index.js";

const INFO = { title: "Shop", version: "1.0.0" };
const ok = () => createResponseContext().json({ ok: true });

const product = objectSchema({ id: stringSchema(), price: numberSchema() });

function shopRouter() {
  const router = createRouter();
  router.get("/products", ok, {
    openapi: {
      summary: "List products",
      tags: ["products"],
      query: objectSchema({ limit: optionalSchema(numberSchema().int()) }),
      responses: { "200": { schema: product } },
    },
  });
  router.post("/products", ok, {
    openapi: {
      operationId: "products.create",
      tags: ["products"],
      body: objectSchema({ price: numberSchema() }),
      responses: { "201": { schema: product }, "422": { description: "Invalid" } },
    },
  });
  router.get("/products/:id(\\d+)", ok, { openapi: { tags: ["products"] } });
  router.delete("/products/{id}", ok, { openapi: { deprecated: true } });
  router.get("/files/*path", ok);
  router.get("/health", ok);
  router.get("/internal/stats", ok);
  router.get("/secret", ok, { openapi: false });
  router.all("/proxy/*rest", ok);
  router.on("CONNECT", "/tunnel", ok);
  return router;
}

describe("generateOpenAPIDocument", () => {
  it("documents exactly the routes the router registered", () => {
    const document = generateOpenAPIDocument(shopRouter(), {
      info: INFO,
      exclude: ["/health", "/internal/*"],
      validate: true,
    });
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item ?? {}).map((method) => `${method} ${path}`),
    );
    expect(operations.sort()).toEqual([
      "delete /products/{id}",
      "get /files/{path}",
      "get /products",
      "get /products/{id}",
      "post /products",
    ]);
    expect(createOpenAPIValidator().validate(document).errors).toEqual([]);
  });

  it("carries route metadata, schemas and pattern constraints", () => {
    const document = generateOpenAPIDocument(shopRouter(), { info: INFO });
    const list = document.paths["/products"]!.get!;
    expect(list.summary).toBe("List products");
    expect(list.tags).toEqual(["products"]);
    expect(list.parameters?.[0]).toMatchObject({ name: "limit", in: "query", required: false });
    expect(list.responses["200"]?.content?.["application/json"]?.schema).toMatchObject({
      type: "object",
    });
    const create = document.paths["/products"]!.post!;
    expect(create.operationId).toBe("products.create");
    expect(create.requestBody?.content["application/json"]).toBeDefined();
    expect(Object.keys(create.responses)).toEqual(["201", "422"]);
    const get = document.paths["/products/{id}"]!.get!;
    expect(get.parameters?.[0]?.schema).toEqual({ type: "string", pattern: "^(?:\\d+)$" });
    expect(document.paths["/products/{id}"]!.delete!.deprecated).toBe(true);
    expect(document.paths["/files/{path}"]!.get!.parameters?.[0]?.description).toContain("rest of the path");
  });

  it("omits hidden, all-method, CONNECT and automatic HEAD/OPTIONS routes", () => {
    const document = generateOpenAPIDocument(shopRouter(), { info: INFO });
    expect(document.paths["/secret"]).toBeUndefined();
    expect(document.paths["/proxy/{rest}"]).toBeUndefined();
    expect(document.paths["/tunnel"]).toBeUndefined();
    for (const item of Object.values(document.paths)) {
      expect(item?.head).toBeUndefined();
      expect(item?.options).toBeUndefined();
    }
  });

  it("reflects routes added and removed after the first generation", () => {
    const router = shopRouter();
    expect(generateOpenAPIDocument(router, { info: INFO }).paths["/orders"]).toBeUndefined();
    const remove = router.post("/orders", ok, { openapi: { summary: "Place order" } });
    expect(generateOpenAPIDocument(router, { info: INFO }).paths["/orders"]?.post?.summary).toBe(
      "Place order",
    );
    remove();
    expect(generateOpenAPIDocument(router, { info: INFO }).paths["/orders"]).toBeUndefined();
  });

  it("supports undocumented: exclude, RegExp/predicate filters and wildcards: exclude", () => {
    const router = shopRouter();
    const paths = (options: Parameters<typeof generateOpenAPIDocument>[1]) =>
      Object.keys(generateOpenAPIDocument(router, options).paths).sort();
    expect(paths({ info: INFO, undocumented: "exclude" })).toEqual(["/products", "/products/{id}"]);
    expect(paths({ info: INFO, exclude: [/^\/products/] })).toEqual([
      "/files/{path}",
      "/health",
      "/internal/stats",
    ]);
    expect(paths({ info: INFO, exclude: (route) => route.path !== "/health" })).toEqual(["/health"]);
    expect(paths({ info: INFO, wildcards: "exclude" })).not.toContain("/files/{path}");
  });

  it("expands optional segments and reports duplicate operations", () => {
    /* `/a/:id` and `/a/{id}` are one route in two spellings; the router now
     * refuses the second unless told not to. */
    const router = createRouter({ shadowedRoutes: "ignore" });
    router.get("/users/:id?", ok, { openapi: { operationId: "users.get" } });
    router.get("/a/:id", ok);
    router.get("/a/{id}", ok);
    const warnings: string[] = [];
    const document = generateOpenAPIDocument(router, {
      info: INFO,
      onRouteWarning: (message) => warnings.push(message),
      validate: true,
    });
    expect(document.paths["/users"]!.get!.operationId).toBe("users.get");
    expect(document.paths["/users/{id}"]!.get!.operationId).toBe("users.get_1");
    /* Undocumented responses also warn now; count only the duplicates. */
    expect(warnings.filter((w) => !/no responses are documented/u.test(w))).toHaveLength(1);
  });

  it("merges group documentation into its routes", () => {
    const router = createRouter();
    router.group(
      "/admin",
      (group) => {
        group.get("/users", ok, { openapi: { summary: "Users", tags: ["users"] } });
        group.get("/hidden", ok, { openapi: false });
      },
      { openapi: { tags: ["admin"], security: [{ bearer: [] }] } },
    );
    const routes = collectOpenAPIRoutes(router);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      path: "/admin/users",
      tags: ["admin", "users"],
      security: [{ bearer: [] }],
      summary: "Users",
    });
  });
});

describe("mountOpenAPI", () => {
  async function get(router: ReturnType<typeof createRouter>, url: string) {
    const { response } = await router.dispatch(createRequestContext({ method: "GET", url }));
    return response;
  }

  it("serves JSON, YAML and the docs page, reflecting later routes", async () => {
    const router = shopRouter();
    const mount = mountOpenAPI(router, {
      info: INFO,
      yamlPath: "/openapi.yaml",
      exclude: ["/health"],
      ui: { renderer: "redoc" },
    });

    const json = await get(router, "/openapi.json");
    expect(json.status).toBe(200);
    expect(json.headers["content-type"]).toContain("application/json");
    const document = JSON.parse(String(json.body)) as { paths: Record<string, unknown> };
    expect(document.paths["/products"]).toBeDefined();
    expect(document.paths["/openapi.json"]).toBeUndefined();
    expect(document.paths["/docs"]).toBeUndefined();
    expect(document.paths["/health"]).toBeUndefined();

    const yaml = await get(router, "/openapi.yaml");
    expect(String(yaml.body)).toContain("openapi: 3.1.0");

    const docs = await get(router, "/docs");
    expect(docs.headers["content-type"]).toContain("text/html");
    expect(String(docs.body)).toContain('spec-url="/openapi.json"');
    expect(docs.headers["content-security-policy"]).toBeDefined();

    router.get("/late", ok, { openapi: { summary: "Late" } });
    const again = JSON.parse(String((await get(router, "/openapi.json")).body)) as {
      paths: Record<string, unknown>;
    };
    expect(again.paths["/late"]).toBeDefined();
    expect(mount.document().paths["/late"]).toBeDefined();

    mount.unmount();
    expect((await get(router, "/openapi.json")).status).toBe(404);
  });

  it("honours custom paths and docsPath: false", async () => {
    const router = shopRouter();
    mountOpenAPI(router, { info: INFO, path: "/spec.json", docsPath: false });
    expect((await get(router, "/spec.json")).status).toBe(200);
    expect((await get(router, "/docs")).status).toBe(404);
  });

  describe("in production (#134)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("serves no docs page unless a docsPath is given", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const router = shopRouter();
      mountOpenAPI(router, { info: INFO });
      expect((await get(router, "/openapi.json")).status).toBe(200);
      expect((await get(router, "/docs")).status).toBe(404);
    });

    it("serves the page at an explicit docsPath", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const router = shopRouter();
      mountOpenAPI(router, { info: INFO, docsPath: "/docs" });
      expect((await get(router, "/docs")).status).toBe(200);
    });
  });
});
