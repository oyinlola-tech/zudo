import { describe, expect, it } from "vitest";
import { arraySchema, objectSchema, stringSchema } from "@zudojs/schema";

import {
  convertSchema,
  createOpenAPIDocumentFromRoutes,
  createOpenAPIManager,
  resolveSchemaInput,
} from "../src/index.js";
import type { OpenAPISchema } from "../src/index.js";

const user = objectSchema({
  name: stringSchema(),
  nickname: stringSchema().max(40),
  tags: arraySchema(stringSchema()),
});

function properties(schema: OpenAPISchema | undefined): Record<string, OpenAPISchema> {
  return (schema?.properties ?? {}) as Record<string, OpenAPISchema>;
}

describe("#134 implicit string and array ceilings are optional", () => {
  it("emits the parser's ceilings by default, matching what it enforces", () => {
    const props = properties(convertSchema(user).schema);
    expect(props.name).toEqual({ type: "string", maxLength: 255 });
    expect(props.nickname).toEqual({ type: "string", maxLength: 40 });
    expect(props.tags?.maxItems).toBe(1000);
  });

  it("implicitLimits: false emits only declared bounds", () => {
    const props = properties(convertSchema(user, { implicitLimits: false }).schema);
    expect(props.name).toEqual({ type: "string" });
    expect(props.nickname).toEqual({ type: "string", maxLength: 40 });
    expect(props.tags).not.toHaveProperty("maxItems");

    const resolved = resolveSchemaInput(stringSchema(), "body", { implicitLimits: false });
    expect(resolved).toEqual({ type: "string" });
  });

  it("is honoured by the manager for component schemas and route schemas", () => {
    const manager = createOpenAPIManager({
      info: { title: "T", version: "1.0.0" },
      implicitLimits: false,
    });
    manager.addSchema("User", user);
    manager.addRoute({
      method: "get",
      path: "/users",
      metadata: {
        openapi: {
          parameters: [{ name: "q", in: "query", schema: stringSchema() }],
          responses: { 200: { description: "ok" } },
        },
      },
    });

    const document = manager.generate();
    const component = document.components?.schemas?.["User"] as OpenAPISchema;
    expect(properties(component).name).toEqual({ type: "string" });
    const operation = document.paths["/users"]?.get;
    const query = operation?.parameters?.find((p) => "name" in p && p.name === "q");
    expect(query && "schema" in query ? query.schema : undefined).toEqual({ type: "string" });
  });

  it("flows through createOpenAPIDocumentFromRoutes", () => {
    const document = createOpenAPIDocumentFromRoutes([], {
      info: { title: "T", version: "1.0.0" },
      schemas: { User: user },
      implicitLimits: false,
    });
    const component = document.components?.schemas?.["User"] as OpenAPISchema;
    expect(properties(component).name).toEqual({ type: "string" });
    expect(properties(component).nickname).toEqual({ type: "string", maxLength: 40 });
  });
});
