/**
 * zudojs-cli — A resource's CRUD routes (with OpenAPI metadata) and test.
 */

import { withArticle, type ResourceNames } from "../resource.names.js";

/** `routes/<slug>.routes.ts`: `register<Pascal>Routes(router, controller)`. */
export function renderResourceRoutes(n: ResourceNames): string {
  const schemas = `Create${n.entity}Schema, ${n.entity}ParamsSchema, ${n.entity}Schema, Update${n.entity}Schema`;
  return `import type { HttpRouter } from "@zudojs/http";
import { schema } from "@zudojs/schema";

import type { ${n.pascal}Controller } from "../controllers/${n.slug}.controller.js";
import { ${schemas} } from "../dtos/${n.slug}.dto.js";

const BASE_PATH = "${n.routePath}";
const TAGS = ["${n.slug}"];
const invalid = { description: "The request failed validation" };
const missing = { description: "No ${n.label} has this id" };

/** Registers the ${n.slug} CRUD routes. */
export function register${n.pascal}Routes(
  router: HttpRouter,
  controller: ${n.pascal}Controller,
): void {
  router.get(BASE_PATH, controller.list, {
    openapi: {
      summary: "List ${n.slug}",
      tags: TAGS,
      responses: { "200": { description: "Every ${n.label}", schema: schema.array(${n.entity}Schema) } },
    },
  });

  router.get(\`\${BASE_PATH}/:id\`, controller.get, {
    openapi: {
      summary: "Get ${withArticle(n.label)}",
      tags: TAGS,
      params: ${n.entity}ParamsSchema,
      responses: { "200": { description: "The ${n.label}", schema: ${n.entity}Schema }, "400": invalid, "404": missing },
    },
  });

  router.post(BASE_PATH, controller.create, {
    openapi: {
      summary: "Create ${withArticle(n.label)}",
      tags: TAGS,
      body: Create${n.entity}Schema,
      responses: { "201": { description: "Created", schema: ${n.entity}Schema }, "400": invalid },
    },
  });

  router.patch(\`\${BASE_PATH}/:id\`, controller.update, {
    openapi: {
      summary: "Update ${withArticle(n.label)}",
      tags: TAGS,
      params: ${n.entity}ParamsSchema,
      body: Update${n.entity}Schema,
      responses: { "200": { description: "Updated", schema: ${n.entity}Schema }, "400": invalid, "404": missing },
    },
  });

  router.delete(\`\${BASE_PATH}/:id\`, controller.remove, {
    openapi: {
      summary: "Delete ${withArticle(n.label)}",
      tags: TAGS,
      params: ${n.entity}ParamsSchema,
      responses: { "204": { description: "Deleted" }, "400": invalid, "404": missing },
    },
  });
}
`;
}

/**
 * `tests/<slug>.test.ts`: drives the routes over real HTTP with
 * `createHttpTestClient`, backed by the in-memory repository.
 * `baseFromTests` is the import prefix from the tests folder to the layers.
 */
export function renderResourceTest(n: ResourceNames, baseFromTests: string): string {
  const b = baseFromTests;
  return `import { afterAll, describe, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ${n.pascal}Controller } from "${b}/controllers/${n.slug}.controller.js";
import { InMemory${n.pascal}Repository } from "${b}/repositories/${n.slug}.repository.js";
import { register${n.pascal}Routes } from "${b}/routes/${n.slug}.routes.js";
import { ${n.pascal}Service } from "${b}/services/${n.slug}.service.js";

const router = createRouter();
register${n.pascal}Routes(
  router,
  new ${n.pascal}Controller(new ${n.pascal}Service(new InMemory${n.pascal}Repository())),
);
const client = createHttpTestClient(router);
afterAll(() => client.close());

describe("${n.routePath}", () => {
  it("creates, reads, updates and deletes ${withArticle(n.label)}", async () => {
    const created = await client
      .post("${n.routePath}")
      .send({ name: "Ada" })
      .expect(201)
      .expectJson({ name: "Ada" });
    const { id } = created.json<{ id: string }>();

    await client.get(\`${n.routePath}/\${id}\`).expect(200).expectJson({ id, name: "Ada" });
    await client.get("${n.routePath}").expect(200);
    await client
      .patch(\`${n.routePath}/\${id}\`)
      .send({ name: "Grace" })
      .expect(200)
      .expectJson({ name: "Grace" });
    await client.delete(\`${n.routePath}/\${id}\`).expect(204);
    await client.get(\`${n.routePath}/\${id}\`).expect(404);
  });

  it("rejects an invalid body with 400", async () => {
    await client
      .post("${n.routePath}")
      .send({ name: "" })
      .expect(400)
      .expectJson({ error: "Validation failed" });
  });

  it("rejects an id that is not a UUID with 400", async () => {
    await client.get("${n.routePath}/not-a-uuid").expect(400);
  });
});
`;
}
