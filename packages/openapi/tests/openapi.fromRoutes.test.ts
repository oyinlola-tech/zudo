import { describe, it, expect } from "vitest";
import {
  objectSchema,
  stringSchema,
  numberSchema,
  optionalSchema,
} from "@zudojs/schema";

import {
  OpenAPIManager,
  OpenAPIRouteError,
  convertRouteToOpenAPI,
  createOpenAPIDocumentFromRoutes,
  createOpenAPIValidator,
  describeResponseKey,
  routeDescriptorToRouteInfo,
  type OpenAPIRouteDescriptor,
} from "../src/index.js";

const INFO = { title: "Test API", version: "1.0.0" };

const user = objectSchema({
  id: stringSchema().uuid(),
  name: stringSchema(),
});

describe("createOpenAPIDocumentFromRoutes", () => {
  const routes: readonly OpenAPIRouteDescriptor[] = [
    {
      method: "GET",
      path: "/users",
      summary: "List users",
      tags: ["users"],
      query: objectSchema({
        limit: numberSchema().int().min(1),
        cursor: optionalSchema(stringSchema()),
      }),
      responses: { "200": { schema: user } },
    },
    {
      method: "post",
      path: "/users",
      operationId: "users.create",
      body: objectSchema({ name: stringSchema() }),
      responses: { "201": { schema: user }, "400": { description: "Invalid" } },
    },
    {
      method: "GET",
      path: "/users/:id",
      params: objectSchema({ id: stringSchema().uuid() }),
      headers: objectSchema({ "x-trace": optionalSchema(stringSchema()) }),
      responses: { "200": { schema: user }, "404": { schema: { type: "object" } } },
    },
  ];

  it("builds exactly the declared operations as a valid 3.1 document", () => {
    const document = createOpenAPIDocumentFromRoutes(routes, {
      info: INFO,
      validate: true,
    });
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual(["/users", "/users/{id}"]);
    expect(Object.keys(document.paths["/users"]!).sort()).toEqual(["get", "post"]);
    expect(Object.keys(document.paths["/users/{id}"]!)).toEqual(["get"]);
    expect(createOpenAPIValidator().validate(document).valid).toBe(true);
  });

  it("turns object schemas into parameters, body and responses", () => {
    const document = createOpenAPIDocumentFromRoutes(routes, { info: INFO });
    const list = document.paths["/users"]!.get!;
    expect(list.parameters).toEqual([
      expect.objectContaining({ name: "limit", in: "query", required: true }),
      expect.objectContaining({ name: "cursor", in: "query", required: false }),
    ]);
    expect(list.parameters?.[0]?.schema).toMatchObject({ type: "integer", minimum: 1 });

    const create = document.paths["/users"]!.post!;
    expect(create.requestBody?.required).toBe(true);
    expect(create.requestBody?.content["application/json"]?.schema).toMatchObject({
      type: "object",
      required: ["name"],
    });
    expect(create.responses["201"]?.description).toBe("Created");
    expect(create.responses["400"]).toEqual({ description: "Invalid" });

    const get = document.paths["/users/{id}"]!.get!;
    expect(get.parameters).toEqual([
      expect.objectContaining({ name: "id", in: "path", required: true }),
      expect.objectContaining({ name: "x-trace", in: "header", required: false }),
    ]);
    expect(get.parameters?.[0]?.schema).toMatchObject({ format: "uuid" });
    expect(get.responses["404"]?.description).toBe("Not Found");
  });

  it("rejects duplicates and unsupported methods", () => {
    expect(() =>
      createOpenAPIDocumentFromRoutes(
        [
          { method: "GET", path: "/a/:id" },
          { method: "get", path: "/a/{id}" },
        ],
        { info: INFO },
      ),
    ).toThrow(OpenAPIRouteError);
    expect(() => routeDescriptorToRouteInfo({ method: "CONNECT", path: "/x" })).toThrow(
      OpenAPIRouteError,
    );
  });

  it("leaves hidden descriptors out and registers components", () => {
    const document = createOpenAPIDocumentFromRoutes(
      [
        { method: "GET", path: "/public", security: [] },
        { method: "GET", path: "/internal", hidden: true },
      ],
      {
        info: INFO,
        schemas: { User: user, Raw: { type: "string" } },
        securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
        security: [{ bearer: [] }],
      },
    );
    expect(document.paths["/internal"]).toBeUndefined();
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(["User", "Raw"]);
    // `security: []` marks the operation public; it used to be dropped.
    expect(document.paths["/public"]!.get!.security).toEqual([]);
  });
});

describe("convertRouteToOpenAPI path parameters", () => {
  it("documents every template slot even when nothing declares it", () => {
    const result = convertRouteToOpenAPI("get", "/orgs/:org/users/{id}");
    expect(result.operation.parameters).toEqual([
      { name: "org", in: "path", required: true, schema: { type: "string" } },
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
  });

  it("layers inferred < schema < explicit parameters", () => {
    const result = convertRouteToOpenAPI("get", "/items/:id", {
      openapi: {
        inferredParameters: [
          { name: "id", in: "path", schema: { type: "string", pattern: "^\\d+$" } },
        ],
        query: { type: "object", properties: { q: { type: "string" } } },
        parameters: [{ name: "q", in: "query", description: "explicit" }],
      },
    });
    expect(result.operation.parameters?.[0]?.schema).toEqual({
      type: "string",
      pattern: "^\\d+$",
    });
    expect(result.operation.parameters?.[1]).toMatchObject({ description: "explicit" });
  });

  it("drops a path parameter that is not in the template, with a warning", () => {
    const warnings: string[] = [];
    const result = convertRouteToOpenAPI(
      "get",
      "/items",
      { openapi: { params: { type: "object", properties: { id: { type: "string" } } } } },
      { onWarning: (message) => warnings.push(message) },
    );
    expect(result.operation.parameters).toBeUndefined();
    expect(warnings[0]).toContain('path parameter "id"');
  });

  it("warns when query parameters are not an object schema", () => {
    const warnings: string[] = [];
    convertRouteToOpenAPI(
      "get",
      "/items",
      { openapi: { query: stringSchema() } },
      { onWarning: (message) => warnings.push(message) },
    );
    expect(warnings.some((w) => w.includes("object schema"))).toBe(true);
  });

  it("converts schemas for the target version", () => {
    const result = convertRouteToOpenAPI(
      "post",
      "/x",
      { openapi: { body: { schema: user, contentType: ["application/json", "application/xml"] } } },
      { version: "3.0.3" },
    );
    expect(Object.keys(result.operation.requestBody?.content ?? {})).toEqual([
      "application/json",
      "application/xml",
    ]);
  });
});

describe("OpenAPIManager.setRoutes", () => {
  it("replaces the route set and keeps the old one when a duplicate is passed", () => {
    const manager = new OpenAPIManager({ info: INFO });
    manager.setRoutes([{ method: "get", path: "/a" }]);
    expect(Object.keys(manager.generate().paths)).toEqual(["/a"]);
    manager.setRoutes([{ method: "get", path: "/b" }]);
    expect(Object.keys(manager.generate().paths)).toEqual(["/b"]);
    expect(() =>
      manager.setRoutes([
        { method: "get", path: "/c" },
        { method: "get", path: "/c" },
      ]),
    ).toThrow(OpenAPIRouteError);
    expect(Object.keys(manager.generate().paths)).toEqual(["/b"]);
  });

  it("reports route warnings", () => {
    const seen: string[] = [];
    const manager = new OpenAPIManager({
      info: INFO,
      onSchemaWarning: (name, warnings) => seen.push(name, ...warnings),
    });
    manager.addRoute({
      method: "get",
      path: "/x",
      metadata: { openapi: { query: stringSchema(), responses: { "200": { description: "OK" } } } },
    });
    manager.generate();
    expect(manager.routeWarnings().length).toBe(1);
    expect(seen[0]).toBe("routes");
  });
});

describe("describeResponseKey", () => {
  it("maps codes, ranges and default", () => {
    expect(describeResponseKey("201")).toBe("Created");
    expect(describeResponseKey("4XX")).toBe("Client error");
    expect(describeResponseKey("default")).toBe("Unexpected response");
    expect(describeResponseKey("299")).toBe("Response 299");
  });
});
