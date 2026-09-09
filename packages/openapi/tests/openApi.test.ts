import { describe, it, expect } from "vitest";

import {
  toOpenAPIPath,
  extractPathParameters,
  convertRouteToOpenAPI,
  isOpenAPIMethod,
  OpenAPIRouteScannerImpl,
  convertSchema,
  createSchemaConverter,
  createComponentReference,
  escapeJsonPointerSegment,
  unescapeJsonPointerSegment,
  OpenAPIValidatorImpl,
  OpenAPIManager,
  createOpenAPIManager,
  OpenAPIDocumentBuilder,
  OpenAPIRegistryImpl,
  SchemaRegistryImpl,
  toOpenAPIJSON,
  toOpenAPIYAML,
  OpenAPIRouteError,
  OpenAPIValidationError,
  OpenAPIComponentConflictError,
  OpenAPIVersionError,
  OpenAPIOperationError,
  formatIssuePath,
  MAX_OPERATION_ID_LENGTH,
  renderOpenAPIUI,
  zudoLogo,
  svgToDataUri,
  ZUDO_MARK_DATA_URI,
  ZUDO_WORDMARK_DARK_DATA_URI,
  ZUDO_FAVICON_DATA_URI,
} from "../src/index.js";
import type { OpenAPIDocument, OpenAPIInfo } from "../src/index.js";

const INFO: OpenAPIInfo = { title: "Test API", version: "1.0.0" };

/** Minimal stand-ins for `@zudojs/schema` instances, matching its real fields. */
const schema = {
  string: (config: Record<string, unknown> = {}) => ({
    _type: "string",
    _config: config,
  }),
  number: (config: Record<string, unknown> = {}) => ({
    _type: "number",
    _config: config,
  }),
  boolean: () => ({ _type: "boolean", _config: {} }),
  object: (
    shape: Record<string, unknown>,
    config: Record<string, unknown> = {},
  ) => ({ _type: "object", _config: { shape, ...config } }),
  array: (itemSchema: unknown, config: Record<string, unknown> = {}) => ({
    _type: "array",
    _config: { itemSchema, ...config },
  }),
  optional: (inner: unknown) => ({ _type: "optional", _inner: inner }),
  nullable: (inner: unknown) => ({ _type: "nullable", _inner: inner }),
  enum: (values: readonly unknown[]) => ({ _type: "enum", _values: values }),
  literal: (value: unknown) => ({ _type: "literal", _expected: value }),
  union: (schemas: readonly unknown[]) => ({
    _type: "union",
    _schemas: schemas,
  }),
  intersection: (left: unknown, right: unknown) => ({
    _type: "intersection",
    _left: left,
    _right: right,
  }),
  record: (valueSchema: unknown) => ({
    _type: "record",
    _valueSchema: valueSchema,
  }),
  tuple: (schemas: readonly unknown[]) => ({
    _type: "tuple",
    _schemas: schemas,
  }),
  set: (valueSchema: unknown) => ({ _type: "set", _valueSchema: valueSchema }),
  withDefault: (inner: unknown, value: unknown) => ({
    _type: "default",
    _inner: inner,
    _defaultValue: value,
  }),
  lazy: (factory: () => unknown) => ({ _type: "lazy", _factory: factory }),
  meta: <T extends object>(
    target: T,
    metadata: Record<string, unknown>,
  ): T => ({
    ...target,
    _metadata: metadata,
  }),
};

// ─── Path conversion ───────────────────────────────────────────────────────

describe("toOpenAPIPath", () => {
  it("converts simple path parameters", () => {
    expect(toOpenAPIPath("/users/:id")).toBe("/users/{id}");
  });

  it("converts multiple path parameters", () => {
    expect(toOpenAPIPath("/users/:userId/posts/:postId")).toBe(
      "/users/{userId}/posts/{postId}",
    );
  });

  it("leaves paths without parameters unchanged", () => {
    expect(toOpenAPIPath("/users")).toBe("/users");
  });

  it("leaves an existing template unchanged", () => {
    expect(toOpenAPIPath("/users/{id}")).toBe("/users/{id}");
  });

  it("keeps a literal colon inside a segment", () => {
    expect(toOpenAPIPath("/files/report:download")).toBe(
      "/files/report:download",
    );
  });

  it("throws on optional path parameters", () => {
    expect(() => toOpenAPIPath("/users/:id?")).toThrow(OpenAPIRouteError);
  });

  it("throws on wildcards rather than emitting an invalid template (OA-22)", () => {
    expect(() => toOpenAPIPath("/files/*")).toThrow(OpenAPIRouteError);
  });

  it("throws on regex-constrained parameters (OA-22)", () => {
    expect(() => toOpenAPIPath("/users/:id(\\d+)")).toThrow(OpenAPIRouteError);
  });

  it("throws on a path that does not start with a slash", () => {
    expect(() => toOpenAPIPath("users/:id")).toThrow(OpenAPIRouteError);
  });

  it("extracts template parameter names", () => {
    expect(extractPathParameters("/users/{userId}/posts/{postId}")).toEqual([
      "userId",
      "postId",
    ]);
  });
});

// ─── Route conversion ──────────────────────────────────────────────────────

describe("convertRouteToOpenAPI", () => {
  it("converts a basic route", () => {
    const result = convertRouteToOpenAPI("get", "/users");
    expect(result.method).toBe("get");
    expect(result.path).toBe("/users");
    expect(result.operation.responses["200"]?.description).toBe("OK");
  });

  it("includes metadata in the operation", () => {
    const result = convertRouteToOpenAPI("post", "/users", {
      openapi: {
        operationId: "users.create",
        summary: "Create a user",
        tags: ["users"],
        deprecated: true,
      },
    });
    expect(result.operation.operationId).toBe("users.create");
    expect(result.operation.summary).toBe("Create a user");
    expect(result.operation.tags).toEqual(["users"]);
    expect(result.operation.deprecated).toBe(true);
  });

  it("keeps every documented response, not just 200 (OA-03)", () => {
    const result = convertRouteToOpenAPI("post", "/orders", {
      openapi: {
        responses: {
          "201": { description: "Created" },
          "400": { description: "Bad request" },
          "409": { description: "Conflict" },
          default: { description: "Unexpected" },
        },
      },
    });
    expect(Object.keys(result.operation.responses).sort()).toEqual([
      "201",
      "400",
      "409",
      "default",
    ]);
  });

  it("forces path parameters to be required", () => {
    const result = convertRouteToOpenAPI("get", "/users/:id", {
      openapi: { parameters: [{ name: "id", in: "path" }] },
    });
    expect(result.operation.parameters?.[0]?.required).toBe(true);
  });

  it("rejects a method OpenAPI cannot express", () => {
    expect(() => convertRouteToOpenAPI("purge", "/x")).toThrow(
      OpenAPIRouteError,
    );
    expect(isOpenAPIMethod("get")).toBe(true);
    expect(isOpenAPIMethod("purge")).toBe(false);
  });
});

// ─── Scanner ───────────────────────────────────────────────────────────────

describe("OpenAPIRouteScannerImpl", () => {
  it("rejects a duplicate route at registration (OA-23)", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({ method: "get", path: "/users" });
    expect(() => scanner.addRoute({ method: "get", path: "/users" })).toThrow(
      OpenAPIRouteError,
    );
  });

  it("replaces through setRoute and removes through removeRoute", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({ method: "get", path: "/users" });
    scanner.setRoute({
      method: "get",
      path: "/users",
      metadata: { openapi: { summary: "List users" } },
    });
    expect(scanner.size).toBe(1);
    expect(scanner.scan()[0]?.operation.summary).toBe("List users");
    expect(scanner.removeRoute("get", "/users")).toBe(true);
    expect(scanner.size).toBe(0);
  });

  it("skips hidden routes", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({
      method: "get",
      path: "/internal",
      metadata: { openapi: { hidden: true } },
    });
    expect(scanner.scan()).toHaveLength(0);
  });
});

// ─── Schema conversion ─────────────────────────────────────────────────────

describe("convertSchema", () => {
  it("converts primitives", () => {
    expect(convertSchema(schema.string()).schema).toEqual({ type: "string" });
    expect(convertSchema(schema.number()).schema).toEqual({ type: "number" });
    expect(convertSchema(schema.boolean()).schema).toEqual({ type: "boolean" });
  });

  it("reads object shape and required keys from _config (OA-01)", () => {
    const result = convertSchema(
      schema.object({
        id: schema.string(),
        nickname: schema.optional(schema.string()),
      }),
    );
    expect(result.schema).toEqual({
      type: "object",
      properties: { id: { type: "string" }, nickname: { type: "string" } },
      required: ["id"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("honours an explicit requiredKeys set (OA-01)", () => {
    const result = convertSchema(
      schema.object(
        { nickname: schema.optional(schema.string()) },
        { requiredKeys: new Set(["nickname"]) },
      ),
    );
    expect(result.schema.required).toEqual(["nickname"]);
  });

  it("reads array items from _config.itemSchema (OA-01)", () => {
    const result = convertSchema(
      schema.array(schema.string(), { min: 1, max: 10 }),
    );
    expect(result.schema).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 10,
    });
  });

  it("reads enum values from _values (OA-01)", () => {
    expect(convertSchema(schema.enum(["a", "b"])).schema).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
  });

  it("types a numeric enum as a number, not a string (OA-01)", () => {
    expect(convertSchema(schema.enum([1, 2, 3])).schema).toEqual({
      type: "integer",
      enum: [1, 2, 3],
    });
  });

  it("reads a literal from _expected (OA-01)", () => {
    expect(convertSchema(schema.literal("fixed")).schema).toEqual({
      type: "string",
      enum: ["fixed"],
      const: "fixed",
    });
  });

  it("reads union members from _schemas (OA-01)", () => {
    const result = convertSchema(
      schema.union([schema.string(), schema.number()]),
    );
    expect(result.schema.anyOf).toEqual([
      { type: "string" },
      { type: "number" },
    ]);
  });

  it("reads an optional's inner schema from _inner (OA-01)", () => {
    const result = convertSchema(schema.optional(schema.string()));
    expect(result.schema).toEqual({ type: "string" });
    expect(result.warnings).toEqual([]);
  });

  it("carries string and number constraints across", () => {
    expect(
      convertSchema(
        schema.string({ min: 2, max: 8, format: "email", pattern: /^a/ }),
      ).schema,
    ).toEqual({
      type: "string",
      format: "email",
      minLength: 2,
      maxLength: 8,
      pattern: "^a",
    });

    expect(
      convertSchema(schema.number({ int: true, min: 0, multipleOf: 5 })).schema,
    ).toEqual({ type: "integer", minimum: 0, multipleOf: 5 });
  });

  it("expresses nullability the way each version does (OA-17)", () => {
    expect(convertSchema(schema.nullable(schema.string())).schema).toEqual({
      type: ["string", "null"],
    });
    expect(
      convertSchema(schema.nullable(schema.string()), { version: "3.0.3" })
        .schema,
    ).toEqual({ type: "string", nullable: true });
  });

  it("converts the remaining constructs instead of dropping them (OA-18)", () => {
    expect(convertSchema(schema.record(schema.number())).schema).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
    expect(convertSchema(schema.set(schema.string())).schema).toEqual({
      type: "array",
      uniqueItems: true,
      items: { type: "string" },
    });
    expect(
      convertSchema(schema.tuple([schema.string(), schema.number()])).schema,
    ).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      minItems: 2,
      maxItems: 2,
    });
    expect(
      convertSchema(
        schema.intersection(
          schema.object({ a: schema.string() }),
          schema.object({ b: schema.string() }),
        ),
      ).schema.allOf,
    ).toHaveLength(2);
    expect(
      convertSchema(schema.withDefault(schema.string(), "x")).schema,
    ).toEqual({ type: "string", default: "x" });
  });

  it("stops on a recursive schema instead of overflowing the stack (OA-02)", () => {
    const node: Record<string, unknown> = { _type: "object", _config: {} };
    node["_config"] = { shape: { self: node } };
    const result = convertSchema(node);
    expect(result.warnings.some((w) => w.includes("Recursive"))).toBe(true);
  });

  it("resolves a lazy schema, and survives one that recurses (OA-02)", () => {
    const resolved = convertSchema(schema.lazy(() => schema.string()));
    expect(resolved.schema).toEqual({ type: "string" });

    const recursive: Record<string, unknown> = {};
    recursive["_type"] = "lazy";
    recursive["_factory"] = () => recursive;
    const result = convertSchema(recursive);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("includes metadata in schema", () => {
    const result = convertSchema(
      schema.meta(schema.string(), {
        description: "A name",
        example: "ada",
        title: "Name",
        deprecated: true,
      }),
    );
    expect(result.schema).toMatchObject({
      type: "string",
      description: "A name",
      example: "ada",
      title: "Name",
      deprecated: true,
    });
  });

  it("warns about a type it cannot express (OA-18)", () => {
    const result = convertSchema({ _type: "promise" });
    expect(result.schema).toEqual({});
    expect(result.warnings[0]).toContain("Unsupported schema type: promise");
  });

  it("binds defaults through createSchemaConverter", () => {
    const converter = createSchemaConverter({ version: "3.0.3" });
    expect(
      converter.convert(schema.nullable(schema.string())).schema,
    ).toMatchObject({ nullable: true });
  });
});

// ─── References ────────────────────────────────────────────────────────────

describe("createComponentReference", () => {
  it("creates a schema reference", () => {
    expect(createComponentReference("schemas", "User")).toEqual({
      $ref: "#/components/schemas/User",
    });
  });

  it("creates a response reference", () => {
    expect(createComponentReference("responses", "NotFound")).toEqual({
      $ref: "#/components/responses/NotFound",
    });
  });

  it("escapes JSON Pointer characters (OA-19)", () => {
    expect(createComponentReference("schemas", "Order/Line~1")).toEqual({
      $ref: "#/components/schemas/Order~1Line~01",
    });
    expect(escapeJsonPointerSegment("a/b~c")).toBe("a~1b~0c");
    expect(unescapeJsonPointerSegment("a~1b~0c")).toBe("a/b~c");
  });

  it("is the same builder the registries use (OA-19)", () => {
    const registry = new OpenAPIRegistryImpl();
    expect(registry.ref("schemas", "A/B")).toEqual(
      createComponentReference("schemas", "A/B"),
    );
    expect(new SchemaRegistryImpl().ref("A/B")).toEqual(
      createComponentReference("schemas", "A/B"),
    );
  });
});

// ─── Schema registry ───────────────────────────────────────────────────────

describe("SchemaRegistryImpl", () => {
  it("surfaces conversion warnings rather than dropping them (OA-18)", () => {
    const reported: string[] = [];
    const registry = new SchemaRegistryImpl({
      onWarning: (name) => reported.push(name),
    });
    registry.register("Weird", { _type: "promise" });
    expect(reported).toEqual(["Weird"]);
    expect(registry.warnings().get("Weird")?.[0]).toContain("Unsupported");
  });

  it("throws a typed conflict error on a duplicate name (OA-26)", () => {
    const registry = new SchemaRegistryImpl();
    registry.register("User", schema.string());
    expect(() => registry.register("User", schema.string())).toThrow(
      OpenAPIComponentConflictError,
    );
  });
});

// ─── Validator ─────────────────────────────────────────────────────────────

describe("OpenAPIValidatorImpl", () => {
  const validator = new OpenAPIValidatorImpl();

  const minimal = (overrides: Partial<OpenAPIDocument> = {}): OpenAPIDocument =>
    ({
      openapi: "3.1.0",
      info: INFO,
      paths: {},
      ...overrides,
    }) as OpenAPIDocument;

  it("validates a minimal document", () => {
    expect(validator.validate(minimal()).valid).toBe(true);
  });

  it("detects missing required fields (OA-10)", () => {
    const result = validator.validate({
      openapi: "3.1.0",
      info: {},
      paths: {},
    } as unknown as OpenAPIDocument);

    expect(result.valid).toBe(false);
    // `path` is an array; comparing it to a string can never be true, which
    // is what made the original assertions pass vacuously.
    const paths = result.errors.map((issue) => formatIssuePath(issue.path));
    expect(paths).toContain("info.title");
    expect(paths).toContain("info.version");
  });

  it("warns on empty paths (OA-10)", () => {
    const result = validator.validate(minimal());
    expect(result.valid).toBe(true);
    expect(
      result.warnings.map((issue) => formatIssuePath(issue.path)),
    ).toContain("paths");
  });

  it("rejects an unsupported version (OA-11)", () => {
    const result = validator.validate(minimal({ openapi: "4.0.0" }));
    expect(result.valid).toBe(false);
  });

  it("detects duplicate operation IDs", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/a": {
            get: {
              operationId: "dup",
              responses: { "200": { description: "OK" } },
            },
          },
          "/b": {
            get: {
              operationId: "dup",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("requires responses on every operation (OA-11)", () => {
    const result = validator.validate(
      minimal({ paths: { "/a": { get: { responses: {} } } } }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a response key that is not a status code (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: { "/a": { get: { responses: { ok: { description: "x" } } } } },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("requires a path template parameter to be declared (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/users/{id}": {
            get: { responses: { "200": { description: "OK" } } },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain('"{id}"');
  });

  it("requires a declared path parameter to appear in the template (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/users": {
            get: {
              parameters: [{ name: "id", in: "path", required: true }],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an undeclared security requirement (OA-11)", () => {
    const result = validator.validate(
      minimal({
        security: [{ bearerAuht: [] }],
        components: {
          securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("bearerAuht");
  });

  it("rejects a dangling $ref (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/a": {
            get: {
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Missing" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("Missing");
  });

  it("accepts a $ref that resolves (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/a": {
            get: {
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
        components: { schemas: { User: { type: "object" } } },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("enforces the operation id length limit (OA-11)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/a": {
            get: {
              operationId: "x".repeat(MAX_OPERATION_ID_LENGTH + 1),
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("catches un-converted paths that also contain a template (OA-12)", () => {
    const result = validator.validate(
      minimal({
        paths: {
          "/a/:id/{b}": {
            get: { responses: { "200": { description: "OK" } } },
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.message.includes("un-converted")),
    ).toBe(true);
  });

  it("assertValid keeps the issues on the error (OA-04)", () => {
    let thrown: unknown;
    try {
      validator.assertValid({
        openapi: "3.1.0",
        info: {},
        paths: {},
      } as unknown as OpenAPIDocument);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenAPIValidationError);
    const error = thrown as OpenAPIValidationError;
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.format()).toContain("info.title");
  });
});

// ─── Errors ────────────────────────────────────────────────────────────────

describe("errors", () => {
  it("defaults to a non-exposed 500 (OA-14)", () => {
    const error = new OpenAPIValidationError("bad", []);
    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
  });

  it("honours a caller-supplied status and exposure (OA-13)", () => {
    const error = new OpenAPIValidationError("bad", [], {
      statusCode: 422,
      expose: true,
    });
    expect(error.statusCode).toBe(422);
    expect(error.expose).toBe(true);
  });

  it("writes a sentence, not a path fragment (OA-15)", () => {
    const conflict = new OpenAPIComponentConflictError("schemas", "User");
    expect(conflict.message).toContain("User");
    expect(conflict.message).toContain("already registered");
    expect(conflict.section).toBe("schemas");

    const version = new OpenAPIVersionError("9.9.9", ["3.1.0"]);
    expect(version.message).toContain("Unsupported OpenAPI version");
    expect(version.message).toContain("3.1.0");
  });
});

// ─── Registry ──────────────────────────────────────────────────────────────

describe("OpenAPIRegistryImpl", () => {
  it("rejects an unsupported version at construction (OA-11)", () => {
    expect(() => new OpenAPIRegistryImpl("2.0")).toThrow(OpenAPIVersionError);
  });

  it("keeps each method's parameters on its own operation (OA-07)", () => {
    const registry = new OpenAPIRegistryImpl();
    registry.setInfo(INFO);
    registry.setRoute({
      method: "get",
      path: "/users/{id}",
      operation: {
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "OK" } },
      },
    });
    registry.setRoute({
      method: "post",
      path: "/users/{id}",
      operation: {
        parameters: [
          { name: "id", in: "path", required: true },
          { name: "force", in: "query" },
        ],
        responses: { "201": { description: "Created" } },
      },
    });

    const document = registry.generate();
    const pathItem = document.paths["/users/{id}"];
    expect(pathItem?.parameters).toBeUndefined();
    expect(pathItem?.get?.parameters).toHaveLength(1);
    expect(pathItem?.post?.parameters).toHaveLength(2);
  });

  it("rejects a duplicate operation but allows an explicit replace (OA-05)", () => {
    const registry = new OpenAPIRegistryImpl();
    const route = {
      method: "get" as const,
      path: "/a",
      operation: { responses: { "200": { description: "OK" } } },
    };
    registry.registerRoute(route);
    expect(() => registry.registerRoute(route)).toThrow(OpenAPIOperationError);
    expect(() => registry.setRoute(route)).not.toThrow();
  });

  it("carries info, servers, security and tags into the document (OA-08)", () => {
    const registry = new OpenAPIRegistryImpl();
    registry.setInfo({ title: "Orders", version: "2.0.0" });
    registry.addServer({ url: "https://api.example.com" });
    registry.addSecurityRequirement({ bearerAuth: [] });
    registry.setTag({ name: "orders" });

    const document = registry.generate();
    expect(document.info.title).toBe("Orders");
    expect(document.servers?.[0]?.url).toBe("https://api.example.com");
    expect(document.security).toHaveLength(1);
    expect(document.tags?.[0]?.name).toBe("orders");
  });

  it("conflicts on a repeated tag name (OA-27)", () => {
    const registry = new OpenAPIRegistryImpl();
    registry.registerTag({ name: "orders" });
    expect(() => registry.registerTag({ name: "orders" })).toThrow(
      OpenAPIComponentConflictError,
    );
    expect(() => registry.setTag({ name: "orders" })).not.toThrow();
  });
});

// ─── Manager ───────────────────────────────────────────────────────────────

describe("OpenAPIManager", () => {
  const managerWithRoute = (): OpenAPIManager => {
    const manager = new OpenAPIManager({ info: INFO });
    manager.addRoute({
      method: "get",
      path: "/users/:id",
      metadata: {
        openapi: {
          operationId: "users.get",
          parameters: [{ name: "id", in: "path" }],
          responses: {
            "200": { description: "User found" },
            "404": { description: "No such user" },
          },
        },
      },
    });
    return manager;
  };

  it("generates a document from routes", () => {
    const document = managerWithRoute().generate();
    expect(document.paths["/users/{id}"]?.get?.operationId).toBe("users.get");
    expect(
      Object.keys(document.paths["/users/{id}"]?.get?.responses ?? {}),
    ).toEqual(["200", "404"]);
  });

  it("uses the configured info (OA-08)", () => {
    const document = managerWithRoute().generate();
    expect(document.info).toMatchObject(INFO);

    const renamed = managerWithRoute().setInfo({
      title: "Renamed",
      version: "9.9.9",
    });
    expect(renamed.generate().info.title).toBe("Renamed");
  });

  it("can be generated more than once (OA-05)", () => {
    const manager = managerWithRoute();
    expect(() => {
      manager.generate(true);
      manager.generate(true);
      manager.generate(true);
    }).not.toThrow();
  });

  it("invalidates the cache when a route is added (OA-06)", () => {
    const manager = managerWithRoute();
    manager.generate();
    manager.addRoute({ method: "get", path: "/health" });
    expect(manager.getDocument().paths["/health"]).toBeDefined();
  });

  it("never serves an unvalidated document to a validating caller (OA-06)", () => {
    const manager = new OpenAPIManager({ info: INFO });
    manager.addRoute({
      method: "get",
      path: "/users/{id}",
      metadata: { openapi: { responses: { "200": { description: "OK" } } } },
    });

    // Generating without validation caches a document that is in fact invalid
    // (a template parameter with no declaration).
    manager.generate(false);
    expect(() => manager.getDocument(true)).toThrow(OpenAPIValidationError);
  });

  it("expires the cache after its TTL (OA-25)", () => {
    let now = 0;
    const manager = createOpenAPIManager({
      info: INFO,
      cacheTtlMs: 1_000,
      now: () => now,
    });
    manager.addRoute({ method: "get", path: "/a" });
    const first = manager.getDocument();
    expect(manager.getDocument()).toBe(first);

    now = 2_000;
    expect(manager.getDocument()).not.toBe(first);
  });

  it("converts and registers a schema (OA-01)", () => {
    const manager = new OpenAPIManager({ info: INFO });
    manager.addSchema("User", schema.object({ id: schema.string() }));
    const document = manager.generate();
    expect(document.components?.schemas?.["User"]).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
  });

  it("serializes to JSON and to real YAML (OA-09)", () => {
    const manager = managerWithRoute();
    const json = JSON.parse(manager.toJSON()) as OpenAPIDocument;
    expect(json.info.title).toBe("Test API");

    const yaml = manager.toYAML();
    expect(yaml.startsWith("{")).toBe(false);
    expect(yaml).toContain("openapi: 3.1.0");
    expect(yaml).toContain("  title: Test API");
  });

  it("serves the document over HTTP (OA-30)", () => {
    const response = managerWithRoute().toResponse();
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(JSON.parse(response.body)).toMatchObject({ openapi: "3.1.0" });

    const yamlResponse = managerWithRoute().toResponse({ format: "yaml" });
    expect(yamlResponse.headers["content-type"]).toContain("application/yaml");
  });

  it("reports schema conversion warnings", () => {
    const warnings: string[] = [];
    const manager = createOpenAPIManager({
      info: INFO,
      onSchemaWarning: (name) => warnings.push(name),
    });
    manager.addSchema("Weird", { _type: "promise" });
    expect(warnings).toEqual(["Weird"]);
    expect(manager.schemaWarnings().size).toBe(1);
  });

  it("resets every registration", () => {
    const manager = managerWithRoute();
    manager.generate();
    manager.reset();
    expect(Object.keys(manager.generate().paths)).toHaveLength(0);
  });
});

// ─── Document builder ──────────────────────────────────────────────────────

describe("OpenAPIDocumentBuilder", () => {
  it("builds a document through the same registry as the manager (OA-08)", () => {
    const document = new OpenAPIDocumentBuilder({ info: INFO })
      .addServer({ url: "https://api.example.com" })
      .addTag({ name: "users" })
      .addSecurity({ bearerAuth: [] })
      .addSecurityScheme("bearerAuth", { type: "http", scheme: "bearer" })
      .addSchema("User", { type: "object" })
      .addPath("/users", {
        get: { responses: { "200": { description: "OK" } } },
        post: { responses: { "201": { description: "Created" } } },
      })
      .build();

    expect(document.info).toEqual(INFO);
    expect(document.servers).toHaveLength(1);
    expect(document.paths["/users"]?.get).toBeDefined();
    expect(document.paths["/users"]?.post).toBeDefined();
    expect(document.components?.schemas?.["User"]).toEqual({ type: "object" });
    expect(new OpenAPIValidatorImpl().validate(document).valid).toBe(true);
  });
});

// ─── Serialization ─────────────────────────────────────────────────────────

describe("toOpenAPIJSON", () => {
  it("serializes a document to JSON", () => {
    const document = {
      openapi: "3.1.0",
      info: INFO,
      paths: {},
    } as OpenAPIDocument;
    expect(JSON.parse(toOpenAPIJSON(document))).toEqual(document);
  });
});

describe("toOpenAPIYAML", () => {
  it("emits YAML, not JSON (OA-09)", () => {
    const document = {
      openapi: "3.1.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            tags: ["users"],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    } as unknown as OpenAPIDocument;

    const yaml = toOpenAPIYAML(document);
    expect(yaml).toContain("openapi: 3.1.0");
    expect(yaml).toContain("paths:");
    expect(yaml).toContain("  /users:");
    // Status-code keys are quoted so YAML does not read them as numbers.
    expect(yaml).toContain('"200":');
    expect(yaml).toContain("      tags:");
    expect(yaml).toContain("        - users");
    expect(yaml).not.toContain("{");
  });

  it("quotes strings YAML would reinterpret (OA-09)", () => {
    const document = {
      openapi: "3.1.0",
      info: { title: "true", version: "1.0" },
      paths: {},
    } as unknown as OpenAPIDocument;

    const yaml = toOpenAPIYAML(document);
    expect(yaml).toContain('title: "true"');
    expect(yaml).toContain('version: "1.0"');
  });

  it("renders empty containers inline", () => {
    const yaml = toOpenAPIYAML({
      openapi: "3.1.0",
      info: INFO,
      paths: {},
    } as OpenAPIDocument);
    expect(yaml).toContain("paths: {}");
  });
});

describe("branding", () => {
  const info = { title: "Orders API", version: "1.0.0" };

  it("stamps the Zudo logo into info[\"x-logo\"] by default", () => {
    const document = new OpenAPIManager({ info }).generate();
    expect(document.info["x-logo"]).toEqual(zudoLogo());
    expect(document.info["x-logo"]?.url).toBe(ZUDO_MARK_DATA_URI);
    expect(document.info["x-logo"]?.href).toBe("https://zudo.dev");
  });

  it("keeps a logo the caller supplied", () => {
    const custom = { url: "https://example.com/logo.png", altText: "Acme" };
    const document = new OpenAPIManager({
      info: { ...info, "x-logo": custom },
    }).generate();
    expect(document.info["x-logo"]).toEqual(custom);

    const viaOption = new OpenAPIManager({ info, branding: custom }).generate();
    expect(viaOption.info["x-logo"]).toEqual(custom);
  });

  it("emits no logo when branding is off", () => {
    const document = new OpenAPIManager({ info, branding: false }).generate();
    expect(document.info["x-logo"]).toBeUndefined();
    expect(toOpenAPIJSON(document)).not.toContain("x-logo");
  });

  it("survives serialisation to JSON and YAML", () => {
    const manager = new OpenAPIManager({ info });
    expect(JSON.parse(manager.toJSON()).info["x-logo"].altText).toBe("Zudo");
    expect(manager.toYAML()).toContain("x-logo:");
  });

  it("renders a Swagger UI page carrying the mark, favicon and spec url", () => {
    const html = renderOpenAPIUI({ specUrl: "/openapi.json", title: "Orders" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(ZUDO_WORDMARK_DARK_DATA_URI);
    expect(html).toContain(`<link rel="icon" href="${ZUDO_FAVICON_DATA_URI}">`);
    expect(html).toContain("swagger-ui-bundle.js");
    expect(html).toContain('"url":"/openapi.json"');
    expect(html).toContain("<title>Orders</title>");
    expect(html).toContain('href="https://zudo.dev"');
  });

  it("renders a ReDoc page on request", () => {
    const html = renderOpenAPIUI({ specUrl: "/openapi.yaml", renderer: "redoc" });
    expect(html).toContain('<redoc spec-url="/openapi.yaml"');
    expect(html).toContain("redoc.standalone.js");
    expect(html).not.toContain("swagger-ui-bundle");
  });

  it("escapes untrusted text and refuses script urls", () => {
    const html = renderOpenAPIUI({
      specUrl: "/spec?a=1&b=<x>",
      title: '<script>alert("x")</script>',
      swaggerOptions: { note: "</script><img src=x>" },
    });
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain('href="/spec?a=1&amp;b=&lt;x&gt;"');
    expect(html).toContain("\\u003c/script>");
    expect(() => renderOpenAPIUI({ specUrl: "javascript:alert(1)" })).toThrow(TypeError);
    expect(() => renderOpenAPIUI({ specUrl: "" })).toThrow(TypeError);
  });

  it("lets callers drop or replace the header logo and favicon", () => {
    const bare = renderOpenAPIUI({ specUrl: "/s", logo: false, favicon: false });
    expect(bare).not.toContain('class="zudo-logo"');
    expect(bare).not.toContain('rel="icon"');

    const own = renderOpenAPIUI({
      specUrl: "/s",
      logo: { url: "https://example.com/l.svg", href: "https://example.com", altText: "Acme" },
      assetsBaseUrl: "/vendor/swagger/",
    });
    expect(own).toContain('src="https://example.com/l.svg"');
    expect(own).toContain('alt="Acme"');
    expect(own).toContain('href="/vendor/swagger/swagger-ui.css"');
  });

  it("serves the page through the manager with an html content type", () => {
    const manager = new OpenAPIManager({ info });
    const response = manager.toUIResponse({ specUrl: "/openapi.json" });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<title>Orders API · API reference</title>");
    expect(response.body).toContain(ZUDO_WORDMARK_DARK_DATA_URI);

    const unbranded = new OpenAPIManager({ info, branding: false });
    expect(unbranded.toUIResponse({ specUrl: "/openapi.json" }).body).not.toContain('class="zudo-logo"');
  });

  it("encodes svg as a compact data uri", () => {
    const uri = svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).not.toContain('"');
    expect(decodeURIComponent(uri.split(",")[1] ?? "").replace(/'/g, '"')).toContain("<svg");
  });
});
