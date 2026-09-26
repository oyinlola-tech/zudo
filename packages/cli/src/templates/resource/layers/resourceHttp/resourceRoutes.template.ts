/**
 * zudojs-cli — A resource's CRUD routes, with OpenAPI metadata.
 */

import { withArticle, type ResourceNames } from "../../resource.names.js";

/** `routes/<slug>.routes.ts`: `register<Pascal>Routes(router, controller)`. */
export function renderResourceRoutes(n: ResourceNames): string {
  const schemas = [
    `Create${n.entity}Schema`,
    `List${n.pascal}QuerySchema`,
    `${n.entity}PageSchema`,
    `${n.entity}ParamsSchema`,
    `${n.entity}Schema`,
    `Update${n.entity}Schema`,
  ].join(", ");
  return `import type { HttpRouter } from "@zudojs/http";

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
      query: List${n.pascal}QuerySchema,
      responses: { "200": { description: "A page of ${n.label} records", schema: ${n.entity}PageSchema }, "400": invalid },
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
